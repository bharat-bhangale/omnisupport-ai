import type { Request, Response } from 'express';
import crypto from 'crypto';
import { z } from 'zod';
import { env } from '../config/env.js';
import { logger } from '../config/logger.js';
import { initSession, appendTurn, flushToMongoDB, getSession } from '../services/contextMemory.js';
import { buildCustomerCard } from '../services/customerIntelligence.js';
import { buildSystemPrompt } from '../services/llm.js';
import { sentimentQueue } from '../queues/index.js';
import { AppError } from '../middleware/AppError.js';
import type {
  VapiWebhookPayload,
  VapiTranscriptPayload,
  VapiEndOfCallReportPayload,
  SupportedLanguage,
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
 * Handle transcript event
 */
async function handleTranscript(
  payload: VapiTranscriptPayload,
  companyId: string
): Promise<void> {
  // Only process final transcripts
  if (!payload.isFinal) {
    return;
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
        turnIndex: -1, // Will be determined by worker
      },
      {
        jobId: `sentiment-${call.id}-${Date.now()}`,
      }
    );
  }
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
        // Fire and forget - don't wait for completion
        handleTranscript(transcriptResult.data, companyId).catch((err) => {
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
