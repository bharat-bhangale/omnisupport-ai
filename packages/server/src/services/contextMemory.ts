import { redis, buildRedisKey } from '../config/redis.js';
import { REDIS_TTL, REDIS_KEYS, CHANNELS } from '../config/constants.js';
import { logger } from '../config/logger.js';
import { CallSession } from '../models/CallSession.js';
import { summaryQueue } from '../queues/index.js';
import { AppError } from '../middleware/AppError.js';
import { createDefaultDialogueState } from '../types/dialogue.js';
import type { DialogueState } from '../types/dialogue.js';
import type {
  CallSessionState,
  TurnInput,
  Turn,
  InitSessionParams,
  ConversationSlots,
  CustomerIntelligenceCard,
} from '../types/session.js';

const childLogger = logger.child({ service: 'contextMemory' });

/**
 * Initialize a new call session in Redis
 */
export async function initSession(params: InitSessionParams): Promise<CallSessionState> {
  const { callId, companyId, callerPhone, language, customerId, metadata } = params;

  const sessionKey = buildRedisKey(companyId, REDIS_KEYS.SESSION, callId);

  // Check if session already exists
  const existing = await redis.get(sessionKey);
  if (existing) {
    childLogger.warn({ callId, companyId }, 'Session already exists, returning existing');
    return JSON.parse(existing) as CallSessionState;
  }

  const now = new Date();
  const session: CallSessionState = {
    callId,
    companyId,
    callerPhone,
    customerId,
    language,
    turns: [],
    slots: {},
    dialogueState: createDefaultDialogueState(),
    startedAt: now,
    lastActivityAt: now,
    metadata,
  };

  await redis.setex(sessionKey, REDIS_TTL.LIVE_CALL_SESSION, JSON.stringify(session));

  childLogger.info({ callId, companyId, callerPhone }, 'Session initialized');

  return session;
}

/**
 * Get session from Redis
 */
export async function getSession(callId: string, companyId: string): Promise<CallSessionState | null> {
  const sessionKey = buildRedisKey(companyId, REDIS_KEYS.SESSION, callId);
  const data = await redis.get(sessionKey);

  if (!data) {
    childLogger.debug({ callId, companyId }, 'Session not found in Redis');
    return null;
  }

  return JSON.parse(data) as CallSessionState;
}

/**
 * Append a turn to the session
 */
export async function appendTurn(
  callId: string,
  companyId: string,
  turn: TurnInput
): Promise<CallSessionState> {
  const sessionKey = buildRedisKey(companyId, REDIS_KEYS.SESSION, callId);
  const data = await redis.get(sessionKey);

  if (!data) {
    throw AppError.notFound('Session');
  }

  const session = JSON.parse(data) as CallSessionState;

  const fullTurn: Turn = {
    ...turn,
    timestamp: new Date(),
  };

  session.turns.push(fullTurn);
  session.lastActivityAt = new Date();

  await redis.setex(sessionKey, REDIS_TTL.LIVE_CALL_SESSION, JSON.stringify(session));

  childLogger.debug(
    { callId, companyId, role: turn.role, turnCount: session.turns.length },
    'Turn appended'
  );

  return session;
}

/**
 * Update slots in the session
 */
export async function updateSlots(
  callId: string,
  companyId: string,
  newSlots: Partial<ConversationSlots>
): Promise<CallSessionState> {
  const sessionKey = buildRedisKey(companyId, REDIS_KEYS.SESSION, callId);
  const data = await redis.get(sessionKey);

  if (!data) {
    throw AppError.notFound('Session');
  }

  const session = JSON.parse(data) as CallSessionState;

  // Merge new slots with existing
  session.slots = {
    ...session.slots,
    ...newSlots,
  };
  session.lastActivityAt = new Date();

  await redis.setex(sessionKey, REDIS_TTL.LIVE_CALL_SESSION, JSON.stringify(session));

  childLogger.debug({ callId, companyId, slots: session.slots }, 'Slots updated');

  return session;
}

/**
 * Update customer card in the session
 */
export async function updateCustomerCard(
  callId: string,
  companyId: string,
  customerCard: CustomerIntelligenceCard
): Promise<CallSessionState> {
  const sessionKey = buildRedisKey(companyId, REDIS_KEYS.SESSION, callId);
  const data = await redis.get(sessionKey);

  if (!data) {
    throw AppError.notFound('Session');
  }

  const session = JSON.parse(data) as CallSessionState;
  session.customerCard = customerCard;
  session.lastActivityAt = new Date();

  await redis.setex(sessionKey, REDIS_TTL.LIVE_CALL_SESSION, JSON.stringify(session));

  childLogger.debug({ callId, companyId }, 'Customer card updated');

  return session;
}

/**
 * Update dialogue FSM state in the session
 */
export async function updateDialogueState(
  callId: string,
  companyId: string,
  updates: Partial<DialogueState>
): Promise<CallSessionState> {
  const sessionKey = buildRedisKey(companyId, REDIS_KEYS.SESSION, callId);
  const data = await redis.get(sessionKey);

  if (!data) {
    throw AppError.notFound('Session');
  }

  const session = JSON.parse(data) as CallSessionState;

  // Deep merge dialogue state
  session.dialogueState = {
    ...session.dialogueState,
    ...updates,
    confirmation: {
      ...session.dialogueState.confirmation,
      ...(updates.confirmation || {}),
    },
  };
  session.lastActivityAt = new Date();

  await redis.setex(sessionKey, REDIS_TTL.LIVE_CALL_SESSION, JSON.stringify(session));

  childLogger.debug(
    { callId, companyId, currentIntent: session.dialogueState.currentIntent },
    'Dialogue state updated'
  );

  return session;
}

/**
 * Update proactive context message for next turn
 */
export async function updateProactiveContext(
  callId: string,
  companyId: string,
  proactiveContext: string | undefined
): Promise<CallSessionState> {
  const sessionKey = buildRedisKey(companyId, REDIS_KEYS.SESSION, callId);
  const data = await redis.get(sessionKey);

  if (!data) {
    throw AppError.notFound('Session');
  }

  const session = JSON.parse(data) as CallSessionState;
  session.proactiveContext = proactiveContext;
  session.lastActivityAt = new Date();

  await redis.setex(sessionKey, REDIS_TTL.LIVE_CALL_SESSION, JSON.stringify(session));

  childLogger.debug({ callId, companyId, hasContext: !!proactiveContext }, 'Proactive context updated');

  return session;
}

/**
 * Flush session to MongoDB and clean up Redis
 */
export async function flushToMongoDB(
  callId: string,
  companyId: string,
  endData?: {
    status?: 'completed' | 'escalated' | 'failed';
    recording?: { url: string; durationSeconds: number };
    cost?: { stt: number; llm: number; tts: number; total: number };
    endedReason?: string;
  }
): Promise<void> {
  const sessionKey = buildRedisKey(companyId, REDIS_KEYS.SESSION, callId);
  const data = await redis.get(sessionKey);

  if (!data) {
    childLogger.warn({ callId, companyId }, 'Session not found for flush');
    return;
  }

  const session = JSON.parse(data) as CallSessionState;

  // Calculate overall sentiment from turns
  const sentimentCounts = { positive: 0, neutral: 0, negative: 0 };
  for (const turn of session.turns) {
    if (turn.role === 'user' && turn.sentiment) {
      sentimentCounts[turn.sentiment]++;
    }
  }
  const total = sentimentCounts.positive + sentimentCounts.neutral + sentimentCounts.negative;
  const overallSentiment = total > 0
    ? (sentimentCounts.negative > sentimentCounts.positive ? 'negative' :
       sentimentCounts.positive > sentimentCounts.negative ? 'positive' : 'neutral')
    : 'neutral';

  // Upsert to MongoDB
  await CallSession.findOneAndUpdate(
    { callId, companyId },
    {
      $set: {
        companyId,
        customerId: session.customerId,
        callerPhone: session.callerPhone,
        language: session.language,
        status: endData?.status || 'completed',
        turns: session.turns,
        slots: session.slots,
        intent: session.slots.intent,
        subIntent: session.slots.subIntent,
        sentiment: {
          overall: overallSentiment,
          scores: {
            positive: total > 0 ? sentimentCounts.positive / total : 0,
            neutral: total > 0 ? sentimentCounts.neutral / total : 1,
            negative: total > 0 ? sentimentCounts.negative / total : 0,
          },
          trend: 'stable',
        },
        recording: endData?.recording,
        cost: endData?.cost,
        metadata: {
          ...session.metadata,
          endedReason: endData?.endedReason,
        },
        startedAt: session.startedAt,
        endedAt: new Date(),
      },
    },
    { upsert: true, new: true }
  );

  // Delete from Redis
  await redis.del(sessionKey);

  childLogger.info({ callId, companyId }, 'Session flushed to MongoDB');

  // Add to summary queue for async processing
  await summaryQueue.add(
    'generate-summary',
    {
      interactionId: callId,
      companyId,
      channel: CHANNELS.VOICE,
    },
    {
      jobId: `summary-${callId}`,
    }
  );

  childLogger.debug({ callId, companyId }, 'Summary job queued');
}

/**
 * Get the current turn count for a session
 */
export async function getTurnCount(callId: string, companyId: string): Promise<number> {
  const session = await getSession(callId, companyId);
  return session?.turns.length ?? 0;
}

/**
 * Check if session exists
 */
export async function sessionExists(callId: string, companyId: string): Promise<boolean> {
  const sessionKey = buildRedisKey(companyId, REDIS_KEYS.SESSION, callId);
  const exists = await redis.exists(sessionKey);
  return exists === 1;
}

/**
 * Extend session TTL (useful during long calls)
 */
export async function extendSessionTTL(callId: string, companyId: string): Promise<void> {
  const sessionKey = buildRedisKey(companyId, REDIS_KEYS.SESSION, callId);
  await redis.expire(sessionKey, REDIS_TTL.LIVE_CALL_SESSION);
  childLogger.debug({ callId, companyId }, 'Session TTL extended');
}
