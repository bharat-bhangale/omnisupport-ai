import OpenAI from 'openai';
import Twilio from 'twilio';
import { env } from '../config/env.js';
import { logger } from '../config/logger.js';
import { getSession } from '../services/contextMemory.js';
import { Escalation, type EscalationPriority } from '../models/Escalation.js';
import { Customer } from '../models/Customer.js';
import { emitEscalationIncoming } from '../sockets/escalationSocket.js';
import type { Turn, ConversationSlots, CustomerIntelligenceCard } from '../types/session.js';
import type { SentimentLabel } from '../config/constants.js';

const childLogger = logger.child({ tool: 'escalateToHuman' });

const openai = new OpenAI({ apiKey: env.OPENAI_API_KEY });
const twilioClient = Twilio(env.TWILIO_ACCOUNT_SID, env.TWILIO_AUTH_TOKEN);

export interface EscalationParams {
  callId: string;
  companyId: string;
  reason: string;
  priority?: EscalationPriority;
  urgentIssue?: boolean;
  twilioCallSid?: string;
}

export interface EscalationResult {
  escalationId: string;
  ttsResponse: string;
}

/**
 * Generate a 2-sentence handover brief using GPT-4o
 */
async function generateHandoverBrief(turns: Turn[]): Promise<string> {
  if (turns.length === 0) {
    return 'Customer is being connected. No prior conversation context available.';
  }

  const conversationText = turns
    .map((t) => `${t.role.toUpperCase()}: ${t.content}`)
    .join('\n');

  try {
    const response = await openai.chat.completions.create({
      model: 'gpt-4o',
      temperature: 0,
      max_tokens: 100,
      messages: [
        {
          role: 'system',
          content:
            'You are a support assistant. Generate a concise 2-sentence handover brief for a human agent. Focus on the customer issue and current state. Do not include greetings.',
        },
        {
          role: 'user',
          content: `Summarize this conversation for the human agent in exactly 2 sentences:\n\n${conversationText}`,
        },
      ],
    });

    return response.choices[0]?.message?.content || 'Customer needs assistance.';
  } catch (error) {
    childLogger.error({ error }, 'Failed to generate handover brief');
    return 'Customer is being connected. Please review the conversation history.';
  }
}

/**
 * Determine sentiment from recent turns
 */
function getSentimentFromTurns(turns: Turn[]): SentimentLabel {
  const userTurns = turns.filter((t) => t.role === 'user' && t.sentiment);
  if (userTurns.length === 0) return 'neutral';

  const lastSentiment = userTurns[userTurns.length - 1]?.sentiment;
  return lastSentiment || 'neutral';
}

/**
 * Create Twilio conference TwiML for handoff
 */
function buildConferenceTwiml(escalationId: string): string {
  return `
    <Response>
      <Say voice="Polly.Joanna">Connecting you with a specialist. Please hold.</Say>
      <Play>${env.SERVER_URL}/audio/hold-music.mp3</Play>
      <Conference waitUrl="${env.SERVER_URL}/audio/hold-music.mp3" beep="false" endConferenceOnExit="true">
        escalation-${escalationId}
      </Conference>
    </Response>
  `.trim();
}

/**
 * Handle escalation to human agent
 * Main entry point called from vapiTools webhook
 */
export async function handleEscalation(params: EscalationParams): Promise<EscalationResult> {
  const { callId, companyId, reason, priority = 'medium', urgentIssue, twilioCallSid } = params;

  childLogger.info({ callId, companyId, reason, priority }, 'Starting escalation');

  // Get session from Redis
  const session = await getSession(callId, companyId);
  if (!session) {
    childLogger.warn({ callId, companyId }, 'Session not found for escalation');
    // Create minimal escalation record
    const escalation = await Escalation.create({
      callId,
      companyId,
      callerPhone: 'unknown',
      twilioCallSid,
      reason,
      priority: urgentIssue ? 'urgent' : priority,
      brief: 'Customer needs assistance. No session context available.',
      lastFiveTurns: [],
      entities: {},
      sentiment: 'neutral',
      status: 'waiting',
      holdStarted: new Date(),
    });

    emitEscalationIncoming(companyId, escalation);

    return {
      escalationId: escalation._id.toString(),
      ttsResponse: 'Connecting you with a specialist. Please hold one moment.',
    };
  }

  // Get last 5 turns for context
  const lastFiveTurns = session.turns.slice(-5);

  // Generate handover brief (async, but we need it for the record)
  const brief = await generateHandoverBrief(lastFiveTurns);

  // Get sentiment trajectory
  const sentiment = getSentimentFromTurns(lastFiveTurns);

  // Determine final priority
  let finalPriority: EscalationPriority = urgentIssue ? 'urgent' : priority;
  
  // Boost priority for VIP customers
  if (session.customerCard?.tier === 'vip' || session.customerCard?.tier === 'enterprise') {
    if (finalPriority === 'low') finalPriority = 'medium';
    else if (finalPriority === 'medium') finalPriority = 'high';
  }

  // Boost priority for negative sentiment
  if (sentiment === 'negative' && finalPriority !== 'urgent') {
    if (finalPriority === 'low') finalPriority = 'medium';
    else if (finalPriority === 'medium') finalPriority = 'high';
  }

  // Look up customer info if we have customerId
  let customerData: {
    customerId?: string;
    customerName?: string;
    customerTier?: 'standard' | 'premium' | 'vip' | 'enterprise';
    customerKnownIssues?: string[];
  } = {};

  if (session.customerId) {
    try {
      const customer = await Customer.findById(session.customerId).lean();
      if (customer) {
        customerData = {
          customerId: customer._id.toString(),
          customerName: customer.name,
          customerTier: customer.tier,
          customerKnownIssues: customer.knownIssues,
        };
      }
    } catch (error) {
      childLogger.warn({ error, customerId: session.customerId }, 'Failed to fetch customer');
    }
  }

  // Create escalation record in MongoDB
  const escalation = await Escalation.create({
    callId,
    companyId,
    callerPhone: session.callerPhone,
    twilioCallSid,
    reason,
    priority: finalPriority,
    brief,
    lastFiveTurns,
    entities: session.slots,
    sentiment,
    status: 'waiting',
    holdStarted: new Date(),
    ...customerData,
  });

  childLogger.info(
    { escalationId: escalation._id, callId, priority: finalPriority },
    'Escalation record created'
  );

  // Emit Socket.io event to agents room
  emitEscalationIncoming(companyId, escalation);

  // Update Twilio call with conference TwiML if we have the call SID
  if (twilioCallSid) {
    try {
      const confTwiml = buildConferenceTwiml(escalation._id.toString());
      await twilioClient.calls(twilioCallSid).update({
        twiml: confTwiml,
      });
      childLogger.info({ twilioCallSid }, 'Twilio call updated with conference');
    } catch (error) {
      childLogger.error({ error, twilioCallSid }, 'Failed to update Twilio call');
    }
  }

  return {
    escalationId: escalation._id.toString(),
    ttsResponse: 'Connecting you with a specialist. Please hold one moment.',
  };
}

/**
 * Get escalation by ID
 */
export async function getEscalation(escalationId: string, companyId: string) {
  return Escalation.findOne({ _id: escalationId, companyId }).lean();
}
