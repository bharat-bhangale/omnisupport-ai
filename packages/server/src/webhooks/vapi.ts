import type { Request, Response } from 'express';
import crypto from 'crypto';
import { z } from 'zod';
import { env } from '../config/env.js';
import { logger } from '../config/logger.js';
import {
  initSession,
  appendTurn,
  flushToMongoDB,
  getSession,
  updateSlots,
  updateDialogueState,
  updateProactiveContext,
} from '../services/contextMemory.js';
import { buildCustomerCard } from '../services/customerIntelligence.js';
import { buildSystemPrompt } from '../services/llm.js';
import {
  classifyIntent,
  extractSlots,
  checkSlots,
  needsConfirmation,
  isConfirmationResponse,
} from '../services/dialogueFSM.js';
import { getToolForIntent } from '../config/intentSlots.js';
import { sentimentQueue } from '../queues/index.js';
import { AppError } from '../middleware/AppError.js';
import { createDefaultDialogueState } from '../types/dialogue.js';
import type { SupportedIntent, DialogueState } from '../types/dialogue.js';
import type {
  VapiTranscriptPayload,
  VapiEndOfCallReportPayload,
  SupportedLanguage,
  ConversationSlots,
} from '../types/session.js';

const childLogger = logger.child({ webhook: 'vapi' });

// Zod schemas for webhook validation
const vapiCallSchema = z.object({
  id: z.string(),
  orgId: z.string(),
  createdAt: z.string(),
  updatedAt: z.string(),
  type: z.enum(['inbound', 'outbound']),
  status: z.enum(['queued', 'ringing', 'in-progress', 'forwarding', 'ended']),
  endedReason: z.string().optional(),
  customer: z
    .object({
      number: z.string(),
      name: z.string().optional(),
    })
    .optional(),
  phoneNumber: z
    .object({
      id: z.string(),
      number: z.string(),
    })
    .optional(),
  assistantId: z.string().optional(),
  metadata: z.record(z.unknown()).optional(),
});

const basePayloadSchema = z.object({
  type: z.string(),
  call: vapiCallSchema,
  timestamp: z.string().optional(),
});

const transcriptPayloadSchema = basePayloadSchema.extend({
  type: z.literal('transcript'),
  transcript: z.string(),
  role: z.enum(['user', 'assistant']),
  isFinal: z.boolean(),
});

const endOfCallReportSchema = basePayloadSchema.extend({
  type: z.literal('end-of-call-report'),
  endedReason: z.string(),
  transcript: z.string(),
  summary: z.string().optional(),
  recordingUrl: z.string().optional(),
  stereoRecordingUrl: z.string().optional(),
  durationSeconds: z.number(),
  cost: z
    .object({
      stt: z.number(),
      llm: z.number(),
      tts: z.number(),
      total: z.number(),
    })
    .optional(),
});

/**
 * Validate Vapi webhook signature
 */
function validateSignature(payload: string, signature: string | undefined): boolean {
  if (!signature) {
    return false;
  }

  const expectedSignature = crypto
    .createHmac('sha256', env.VAPI_WEBHOOK_SECRET)
    .update(payload)
    .digest('hex');

  return crypto.timingSafeEqual(
    Buffer.from(signature),
    Buffer.from(expectedSignature)
  );
}

/**
 * Extract company ID from Vapi call metadata
 * In production, this should come from your phone number -> company mapping
 */
function extractCompanyId(call: z.infer<typeof vapiCallSchema>): string {
  // Check metadata first
  if (call.metadata?.companyId && typeof call.metadata.companyId === 'string') {
    return call.metadata.companyId;
  }

  // Fallback: would typically look up from phone number mapping
  throw AppError.badRequest('companyId not found in call metadata');
}

/**
 * Detect language from Vapi call or default to English
 */
function detectLanguage(call: z.infer<typeof vapiCallSchema>): SupportedLanguage {
  const metadata = call.metadata as Record<string, unknown> | undefined;
  if (metadata?.language && typeof metadata.language === 'string') {
    return metadata.language as SupportedLanguage;
  }
  return 'en';
}

/**
 * Handle call-started event
 */
async function handleCallStarted(
  payload: z.infer<typeof basePayloadSchema>,
  companyId: string
): Promise<{ systemPrompt: string }> {
  const { call } = payload;
  const callerPhone = call.customer?.number || 'unknown';
  const language = detectLanguage(call);

  childLogger.info(
    { callId: call.id, companyId, callerPhone },
    'Call started'
  );

  // Initialize session
  await initSession({
    callId: call.id,
    companyId,
    callerPhone,
    language,
    metadata: call.metadata,
  });

  // Build customer card (async, but we need it for system prompt)
  const customerCard = await buildCustomerCard({ phone: callerPhone }, companyId);

  // Build system prompt
  // In production, fetch agentName, greeting, etc. from company config
  const systemPrompt = buildSystemPrompt({
    companyName: (call.metadata?.companyName as string) || 'Our Company',
    agentName: (call.metadata?.agentName as string) || 'Support Assistant',
    agentGreeting:
      (call.metadata?.agentGreeting as string) ||
      "Hello! Thank you for calling. How can I help you today?",
    customerCard,
    language,
    customInstructions: call.metadata?.customInstructions as string | undefined,
  });

  return { systemPrompt };
}

/**
 * Handle transcript event with FSM integration
 */
async function handleTranscript(
  payload: VapiTranscriptPayload,
  companyId: string
): Promise<{ proactiveContext?: string; toolCall?: { name: string; args: Record<string, unknown> } }> {
  // Only process final transcripts
  if (!payload.isFinal) {
    return {};
  }

  const { call, transcript, role } = payload;

  childLogger.debug(
    { callId: call.id, role, transcriptLength: transcript.length },
    'Transcript received'
  );

  // Append turn to session
  await appendTurn(call.id, companyId, {
    role,
    content: transcript,
  });

  // Fire async sentiment analysis for user utterances
  if (role === 'user' && transcript.length > 5) {
    await sentimentQueue.add(
      'analyze-text',
      {
        callId: call.id,
        companyId,
        text: transcript,
        turnIndex: -1,
      },
      {
        jobId: `sentiment-${call.id}-${Date.now()}`,
      }
    );
  }

  // Only process FSM for user utterances
  if (role !== 'user') {
    return {};
  }

  // Get current session
  const session = await getSession(call.id, companyId);
  if (!session) {
    childLogger.warn({ callId: call.id }, 'Session not found for FSM processing');
    return {};
  }

  const dialogueState = session.dialogueState || createDefaultDialogueState();
  let proactiveContext: string | undefined;
  let toolCall: { name: string; args: Record<string, unknown> } | undefined;

  // If awaiting confirmation, check the response first
  if (dialogueState.confirmation.awaitingConfirmation) {
    const confirmResponse = await isConfirmationResponse(transcript);

    if (confirmResponse === 'yes') {
      // Execute the pending action
      if (dialogueState.pendingTool) {
        toolCall = {
          name: dialogueState.pendingTool,
          args: dialogueState.pendingToolArgs || {},
        };
      }

      await updateDialogueState(call.id, companyId, {
        confirmation: {
          awaitingConfirmation: false,
          pendingIntent: null,
          pendingSlots: null,
          confirmationMessage: null,
          clarificationAttempts: 0,
        },
        pendingToolExecution: true,
        pendingTool: null,
        pendingToolArgs: null,
      });

      childLogger.info({ callId: call.id, tool: toolCall?.name }, 'Confirmation received, executing tool');
      return { toolCall };
    }

    if (confirmResponse === 'no') {
      proactiveContext = 'The customer said no to the previous confirmation. Ask what they would like to change.';

      await updateDialogueState(call.id, companyId, {
        confirmation: {
          ...dialogueState.confirmation,
          awaitingConfirmation: false,
          clarificationAttempts: 0,
        },
      });

      await updateProactiveContext(call.id, companyId, proactiveContext);
      return { proactiveContext };
    }

    // Unclear response
    const attempts = dialogueState.confirmation.clarificationAttempts + 1;
    if (attempts >= 3) {
      // Auto-escalate after too many unclear responses
      proactiveContext = "I'm having trouble understanding. Offer to connect the customer with a human agent.";
      toolCall = { name: 'escalateToHuman', args: { reason: 'unclear_responses' } };

      await updateDialogueState(call.id, companyId, {
        currentIntent: 'escalate_to_human',
        confirmation: {
          awaitingConfirmation: false,
          pendingIntent: null,
          pendingSlots: null,
          confirmationMessage: null,
          clarificationAttempts: 0,
        },
      });

      return { proactiveContext, toolCall };
    }

    // Ask for clarification again
    proactiveContext = `Ask the customer to confirm with yes or no: ${dialogueState.confirmation.confirmationMessage}`;

    await updateDialogueState(call.id, companyId, {
      confirmation: {
        ...dialogueState.confirmation,
        clarificationAttempts: attempts,
      },
    });

    await updateProactiveContext(call.id, companyId, proactiveContext);
    return { proactiveContext };
  }

  // Classify intent if not set or stale
  let intent = dialogueState.currentIntent;
  if (!intent || dialogueState.turnsSinceIntent > 5) {
    const classification = await classifyIntent(transcript);
    if (classification.confidence > 0.6) {
      intent = classification.intent;
      childLogger.debug({ callId: call.id, intent, confidence: classification.confidence }, 'Intent classified');
    }
  }

  if (!intent) {
    intent = 'general_inquiry';
  }

  // Extract slots for the intent
  const extraction = await extractSlots(intent, transcript, session.slots);
  const newSlots = extraction.slots as ConversationSlots;

  // Update slots in session
  await updateSlots(call.id, companyId, newSlots);

  // Check slot completeness
  const slotCheck = checkSlots(intent, newSlots);

  if (!slotCheck.complete) {
    // Ask for missing slot
    proactiveContext = `Ask the customer: ${slotCheck.nextQuestion}`;

    await updateDialogueState(call.id, companyId, {
      currentIntent: intent,
      turnsSinceIntent: dialogueState.turnsSinceIntent + 1,
    });

    await updateProactiveContext(call.id, companyId, proactiveContext);

    childLogger.debug(
      { callId: call.id, intent, missingSlot: slotCheck.missingSlot },
      'Requesting missing slot'
    );

    return { proactiveContext };
  }

  // Slots complete - check if confirmation needed
  const confirmMessage = needsConfirmation(intent, newSlots);
  if (confirmMessage) {
    proactiveContext = `Confirm with the customer: ${confirmMessage}`;

    const toolName = getToolForIntent(intent);

    await updateDialogueState(call.id, companyId, {
      currentIntent: intent,
      confirmation: {
        awaitingConfirmation: true,
        pendingIntent: intent,
        pendingSlots: newSlots,
        confirmationMessage: confirmMessage,
        clarificationAttempts: 0,
      },
      pendingTool: toolName,
      pendingToolArgs: newSlots as Record<string, unknown>,
    });

    await updateProactiveContext(call.id, companyId, proactiveContext);

    childLogger.debug({ callId: call.id, intent }, 'Awaiting confirmation');

    return { proactiveContext };
  }

  // No confirmation needed - execute immediately
  const toolName = getToolForIntent(intent);
  if (toolName) {
    toolCall = { name: toolName, args: newSlots as Record<string, unknown> };

    await updateDialogueState(call.id, companyId, {
      currentIntent: intent,
      pendingToolExecution: true,
    });

    childLogger.info({ callId: call.id, intent, tool: toolName }, 'Executing tool');
  }

  // Clear proactive context
  await updateProactiveContext(call.id, companyId, undefined);

  return { toolCall };
}

/**
 * Handle end-of-call-report event
 */
async function handleEndOfCallReport(
  payload: VapiEndOfCallReportPayload,
  companyId: string
): Promise<void> {
  const { call, endedReason, durationSeconds, recordingUrl, cost } = payload;

  childLogger.info(
    { callId: call.id, companyId, endedReason, durationSeconds },
    'Call ended'
  );

  // Determine status based on ended reason
  let status: 'completed' | 'escalated' | 'failed' = 'completed';
  if (endedReason.includes('error') || endedReason.includes('failed')) {
    status = 'failed';
  } else if (endedReason.includes('transfer') || endedReason.includes('escalat')) {
    status = 'escalated';
  }

  // Flush session to MongoDB
  await flushToMongoDB(call.id, companyId, {
    status,
    recording: recordingUrl
      ? { url: recordingUrl, durationSeconds }
      : undefined,
    cost,
    endedReason,
  });
}

/**
 * Main Vapi webhook handler
 * CRITICAL: Must respond in < 200ms
 */
export async function vapiWebhookHandler(req: Request, res: Response): Promise<void> {
  const startTime = Date.now();

  // Validate signature
  const signature = req.headers['vapi-signature'] as string | undefined;
  const rawBody = JSON.stringify(req.body);

  if (!validateSignature(rawBody, signature)) {
    childLogger.warn('Invalid Vapi webhook signature');
    res.status(401).json({ error: 'Invalid signature' });
    return;
  }

  // Parse and validate base payload
  const baseResult = basePayloadSchema.safeParse(req.body);
  if (!baseResult.success) {
    childLogger.warn({ errors: baseResult.error.errors }, 'Invalid webhook payload');
    res.status(400).json({ error: 'Invalid payload' });
    return;
  }

  const { type, call } = baseResult.data;

  // Extract company ID
  let companyId: string;
  try {
    companyId = extractCompanyId(call);
  } catch (error) {
    childLogger.warn({ callId: call.id }, 'Could not extract companyId');
    res.status(400).json({ error: 'Missing companyId' });
    return;
  }

  childLogger.debug({ type, callId: call.id, companyId }, 'Webhook received');

  try {
    switch (type) {
      case 'call-started': {
        const result = await handleCallStarted(baseResult.data, companyId);
        // Return system prompt for Vapi to use
        res.status(200).json({
          systemPrompt: result.systemPrompt,
        });
        break;
      }

      case 'transcript': {
        const transcriptResult = transcriptPayloadSchema.safeParse(req.body);
        if (!transcriptResult.success) {
          res.status(200).json({ received: true });
          return;
        }
        // Process FSM and get any proactive context or tool calls
        handleTranscript(transcriptResult.data, companyId)
          .then((result) => {
            if (result.toolCall) {
              childLogger.debug(
                { callId: call.id, tool: result.toolCall.name },
                'Tool call triggered by FSM'
              );
            }
          })
          .catch((err) => {
            childLogger.error({ err, callId: call.id }, 'Error handling transcript');
          });
        res.status(200).json({ received: true });
        break;
      }

      case 'end-of-call-report': {
        const endResult = endOfCallReportSchema.safeParse(req.body);
        if (!endResult.success) {
          res.status(200).json({ received: true });
          return;
        }
        // Fire and forget
        handleEndOfCallReport(endResult.data, companyId).catch((err) => {
          childLogger.error({ err, callId: call.id }, 'Error handling end-of-call');
        });
        res.status(200).json({ received: true });
        break;
      }

      case 'speech-started':
      case 'speech-ended':
      case 'status-update':
      case 'hang':
        // Acknowledged but no action needed
        res.status(200).json({ received: true });
        break;

      default:
        childLogger.debug({ type }, 'Unknown webhook type');
        res.status(200).json({ received: true });
    }
  } catch (error) {
    childLogger.error({ error, type, callId: call.id }, 'Webhook handler error');
    // Always return 200 to prevent Vapi retries
    res.status(200).json({ error: 'Internal error' });
  }

  const duration = Date.now() - startTime;
  if (duration > 150) {
    childLogger.warn({ duration, type }, 'Webhook response time approaching limit');
  }
}

/**
 * Get session state for debugging
 */
export async function getCallSessionState(req: Request, res: Response): Promise<void> {
  const { callId } = req.params;
  const companyId = (req as Request & { user?: { companyId?: string } }).user?.companyId;

  if (!companyId) {
    res.status(401).json({ error: 'Unauthorized' });
    return;
  }

  const session = await getSession(callId as string, companyId);

  if (!session) {
    res.status(404).json({ error: 'Session not found' });
    return;
  }

  res.status(200).json({ session });
}
