import type { Server as SocketIOServer } from 'socket.io';
import Redis from 'ioredis';
import { nanoid } from 'nanoid';
import { env } from '../config/env.js';
import { logger } from '../config/logger.js';

const childLogger = logger.child({ module: 'activitySocket' });

// Activity event types
export type ActivityEventType =
  | 'call_resolved'
  | 'call_escalated'
  | 'ticket_classified'
  | 'ticket_sent'
  | 'kb_gap'
  | 'call_started'
  | 'call_ended';

export type ActivitySeverity = 'success' | 'warning' | 'error' | 'info';

export interface ActivityEvent {
  id: string;
  type: ActivityEventType;
  message: string;
  badge?: string;
  channel: 'voice' | 'text';
  severity: ActivitySeverity;
  timestamp: string;
}

// Redis connection for activity feed storage
const redisUrl = new URL(env.UPSTASH_REDIS_URL);
const redis = new Redis({
  host: redisUrl.hostname,
  port: parseInt(redisUrl.port || '6379', 10),
  password: env.UPSTASH_REDIS_TOKEN,
  tls: {},
  maxRetriesPerRequest: null,
});

// Max activities to keep in Redis
const MAX_ACTIVITIES = 50;

// Activity feed Redis key
function getActivityFeedKey(companyId: string): string {
  return `${companyId}:activity:feed`;
}

let io: SocketIOServer | null = null;

/**
 * Initialize the activity socket with Socket.IO instance
 */
export function initActivitySocket(socketIO: SocketIOServer): void {
  io = socketIO;
  childLogger.info('Activity socket initialized');
}

/**
 * Emit an activity event to a company's room
 * Also stores the event in Redis for initial load
 */
export async function emitActivityEvent(
  companyId: string,
  event: Omit<ActivityEvent, 'id' | 'timestamp'>
): Promise<void> {
  const fullEvent: ActivityEvent = {
    ...event,
    id: nanoid(),
    timestamp: new Date().toISOString(),
  };

  // Emit via Socket.IO if available
  if (io) {
    io.to(`company:${companyId}`).emit('activity:new', fullEvent);
    childLogger.debug({ companyId, eventType: event.type }, 'Activity event emitted');
  }

  // Store in Redis for initial page load
  try {
    const key = getActivityFeedKey(companyId);
    await redis.lpush(key, JSON.stringify(fullEvent));
    await redis.ltrim(key, 0, MAX_ACTIVITIES - 1);
  } catch (error) {
    childLogger.error({ error, companyId }, 'Failed to store activity event in Redis');
  }
}

/**
 * Get recent activity events from Redis
 * Used for initial page load before Socket.IO events arrive
 */
export async function getRecentActivity(companyId: string, limit: number = 20): Promise<ActivityEvent[]> {
  try {
    const key = getActivityFeedKey(companyId);
    const items = await redis.lrange(key, 0, limit - 1);
    return items.map((item) => JSON.parse(item) as ActivityEvent);
  } catch (error) {
    childLogger.error({ error, companyId }, 'Failed to get recent activity from Redis');
    return [];
  }
}

// ============================================================================
// Helper functions for common activity events
// ============================================================================

/**
 * Emit call resolved event
 */
export async function emitCallResolved(
  companyId: string,
  callId: string,
  intent?: string
): Promise<void> {
  await emitActivityEvent(companyId, {
    type: 'call_resolved',
    message: `Call resolved by AI${intent ? `: ${intent}` : ''}`,
    badge: intent,
    channel: 'voice',
    severity: 'success',
  });
}

/**
 * Emit call escalated event
 */
export async function emitCallEscalated(
  companyId: string,
  callId: string,
  reason?: string
): Promise<void> {
  await emitActivityEvent(companyId, {
    type: 'call_escalated',
    message: `Call escalated to agent${reason ? `: ${reason}` : ''}`,
    badge: 'Escalated',
    channel: 'voice',
    severity: 'warning',
  });
}

/**
 * Emit ticket classified event
 */
export async function emitTicketClassified(
  companyId: string,
  ticketId: string,
  intent: string,
  priority: string
): Promise<void> {
  await emitActivityEvent(companyId, {
    type: 'ticket_classified',
    message: `Ticket classified: ${intent}`,
    badge: priority,
    channel: 'text',
    severity: 'info',
  });
}

/**
 * Emit ticket response sent event
 */
export async function emitTicketSent(
  companyId: string,
  ticketId: string,
  usedAIDraft: boolean
): Promise<void> {
  await emitActivityEvent(companyId, {
    type: 'ticket_sent',
    message: usedAIDraft ? 'AI draft sent to customer' : 'Response sent to customer',
    badge: usedAIDraft ? 'AI Draft' : undefined,
    channel: 'text',
    severity: 'success',
  });
}

/**
 * Emit KB gap detected event
 */
export async function emitKBGap(
  companyId: string,
  query: string,
  channel: 'voice' | 'text'
): Promise<void> {
  // Truncate query for display
  const truncatedQuery = query.length > 50 ? query.slice(0, 47) + '...' : query;

  await emitActivityEvent(companyId, {
    type: 'kb_gap',
    message: `Knowledge gap: "${truncatedQuery}"`,
    badge: 'Gap',
    channel,
    severity: 'warning',
  });
}

/**
 * Emit call started event
 */
export async function emitCallStarted(
  companyId: string,
  callId: string,
  phone?: string
): Promise<void> {
  const maskedPhone = phone ? `***-***-${phone.slice(-4)}` : 'Unknown';
  await emitActivityEvent(companyId, {
    type: 'call_started',
    message: `Incoming call from ${maskedPhone}`,
    channel: 'voice',
    severity: 'info',
  });
}

/**
 * Emit call ended event
 */
export async function emitCallEnded(
  companyId: string,
  callId: string,
  duration: number
): Promise<void> {
  const mins = Math.floor(duration / 60);
  const secs = duration % 60;
  const durationStr = mins > 0 ? `${mins}m ${secs}s` : `${secs}s`;

  await emitActivityEvent(companyId, {
    type: 'call_ended',
    message: `Call ended (${durationStr})`,
    channel: 'voice',
    severity: 'info',
  });
}
