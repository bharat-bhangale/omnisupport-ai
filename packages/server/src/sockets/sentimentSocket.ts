import type { Server as SocketIOServer } from 'socket.io';
import { logger } from '../config/logger.js';
import type { SentimentLabel } from '../config/constants.js';

const childLogger = logger.child({ module: 'sentimentSocket' });

let io: SocketIOServer | null = null;

/**
 * Initialize sentiment socket emitters with Socket.IO instance
 */
export function initSentimentSocket(socketIO: SocketIOServer): void {
  io = socketIO;
  childLogger.info('Sentiment socket emitters initialized');
}

/**
 * Emit real-time sentiment update for a live call
 * Sent to company supervisors room
 */
export function emitSentimentUpdate(
  companyId: string,
  callId: string,
  score: number,
  label: SentimentLabel | 'highly_negative'
): void {
  if (!io) {
    childLogger.warn('Socket.IO not initialized, cannot emit sentiment update');
    return;
  }

  const room = `company:${companyId}:supervisors`;
  
  io.to(room).emit('sentimentUpdate', {
    callId,
    score,
    label,
    timestamp: new Date().toISOString(),
  });

  childLogger.debug({ companyId, callId, score, label }, 'Sentiment update emitted');
}

/**
 * Emit churn alert for high-risk customer
 * Sent to company supervisors room
 */
export function emitChurnAlert(
  companyId: string,
  customerId: string,
  customerName: string,
  score: number
): void {
  if (!io) {
    childLogger.warn('Socket.IO not initialized, cannot emit churn alert');
    return;
  }

  const room = `company:${companyId}:supervisors`;
  
  io.to(room).emit('churnAlert', {
    customerId,
    customerName,
    score,
    riskLevel: score < 0.4 ? 'low' : score < 0.65 ? 'medium' : 'high',
    timestamp: new Date().toISOString(),
  });

  childLogger.info({ companyId, customerId, customerName, score }, 'Churn alert emitted');
}

/**
 * Emit escalation alert when sentiment triggers escalation
 */
export function emitEscalationAlert(
  companyId: string,
  ticketId: string,
  customerId: string,
  reason: string
): void {
  if (!io) {
    childLogger.warn('Socket.IO not initialized, cannot emit escalation alert');
    return;
  }

  const room = `company:${companyId}:supervisors`;
  
  io.to(room).emit('escalationAlert', {
    ticketId,
    customerId,
    reason,
    priority: 'P1',
    timestamp: new Date().toISOString(),
  });

  childLogger.info({ companyId, ticketId, reason }, 'Escalation alert emitted');
}
