import { Server } from 'socket.io';
import { logger } from '../config/logger.js';

const childLogger = logger.child({ socket: 'call' });

/**
 * Mask phone number for privacy
 */
function maskPhone(phone: string): string {
  if (!phone || phone.length < 4) return '****';
  return `***-***-${phone.slice(-4)}`;
}

/**
 * Emit when a new call starts
 */
export function emitCallStarted(
  io: Server,
  companyId: string,
  data: {
    callId: string;
    callerPhone: string;
    language: string;
    intent?: string;
  }
): void {
  const event = {
    callId: data.callId,
    maskedPhone: maskPhone(data.callerPhone),
    language: data.language,
    intent: data.intent || 'greeting',
    timestamp: new Date().toISOString(),
  };

  io.to(`company:${companyId}`).emit('call:started', event);

  childLogger.debug({ companyId, callId: data.callId }, 'Emitted call:started');
}

/**
 * Emit on each conversation turn
 */
export function emitCallTurnUpdate(
  io: Server,
  companyId: string,
  data: {
    callId: string;
    intent?: string;
    confidence?: number;
    sentiment?: string;
    sentimentScore?: number;
    toolCalled?: string;
    turnCount: number;
  }
): void {
  const event = {
    callId: data.callId,
    intent: data.intent,
    confidence: data.confidence || 0.85,
    sentiment: data.sentiment || 'neutral',
    sentimentScore: data.sentimentScore || 0.5,
    toolCalled: data.toolCalled,
    turnCount: data.turnCount,
    timestamp: new Date().toISOString(),
  };

  io.to(`company:${companyId}`).emit('call:turnUpdate', event);

  childLogger.debug(
    { companyId, callId: data.callId, turnCount: data.turnCount },
    'Emitted call:turnUpdate'
  );
}

/**
 * Emit when a call ends
 */
export function emitCallEnded(
  io: Server,
  companyId: string,
  data: {
    callId: string;
    resolution: 'resolved' | 'escalated' | 'dropped' | 'failed';
    duration: number;
    turnCount: number;
    intent?: string;
    sentiment?: string;
    qaScore?: number;
  }
): void {
  const event = {
    callId: data.callId,
    resolution: data.resolution,
    duration: data.duration,
    turnCount: data.turnCount,
    intent: data.intent,
    sentiment: data.sentiment,
    qaScore: data.qaScore,
    timestamp: new Date().toISOString(),
  };

  io.to(`company:${companyId}`).emit('call:ended', event);

  childLogger.debug(
    { companyId, callId: data.callId, resolution: data.resolution },
    'Emitted call:ended'
  );
}

/**
 * Emit when a call is escalated
 */
export function emitCallEscalatedSocket(
  io: Server,
  companyId: string,
  data: {
    callId: string;
    reason: string;
    priority: string;
    sentiment?: string;
    brief?: string;
  }
): void {
  const event = {
    callId: data.callId,
    reason: data.reason,
    priority: data.priority,
    sentiment: data.sentiment,
    brief: data.brief,
    timestamp: new Date().toISOString(),
  };

  // Emit to general company room
  io.to(`company:${companyId}`).emit('call:escalated', event);

  // Also emit escalation alert to agents
  io.to(`company:${companyId}:agents`).emit('escalation:incoming', event);

  childLogger.debug(
    { companyId, callId: data.callId, reason: data.reason },
    'Emitted call:escalated'
  );
}

/**
 * Emit live call metrics (called periodically)
 */
export function emitCallMetrics(
  io: Server,
  companyId: string,
  metrics: {
    activeCalls: number;
    avgWaitTime: number;
    avgSentiment: number;
    escalationRate: number;
  }
): void {
  io.to(`company:${companyId}`).emit('call:metrics', {
    ...metrics,
    timestamp: new Date().toISOString(),
  });
}

/**
 * Type definitions for call socket events
 */
export interface CallStartedEvent {
  callId: string;
  maskedPhone: string;
  language: string;
  intent: string;
  timestamp: string;
}

export interface CallTurnUpdateEvent {
  callId: string;
  intent?: string;
  confidence: number;
  sentiment: string;
  sentimentScore: number;
  toolCalled?: string;
  turnCount: number;
  timestamp: string;
}

export interface CallEndedEvent {
  callId: string;
  resolution: 'resolved' | 'escalated' | 'dropped' | 'failed';
  duration: number;
  turnCount: number;
  intent?: string;
  sentiment?: string;
  qaScore?: number;
  timestamp: string;
}

export interface CallEscalatedEvent {
  callId: string;
  reason: string;
  priority: string;
  sentiment?: string;
  brief?: string;
  timestamp: string;
}
