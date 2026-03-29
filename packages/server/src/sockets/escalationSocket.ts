import type { Server as SocketIOServer } from 'socket.io';
import { logger } from '../config/logger.js';
import { Escalation, type IEscalation } from '../models/Escalation.js';

const childLogger = logger.child({ module: 'escalationSocket' });

let io: SocketIOServer | null = null;
let holdUpdateInterval: NodeJS.Timeout | null = null;

/**
 * Initialize escalation socket emitters with Socket.IO instance
 */
export function initEscalationSocket(socketIO: SocketIOServer): void {
  io = socketIO;

  // Set up hold time update interval (every 30 seconds)
  if (holdUpdateInterval) {
    clearInterval(holdUpdateInterval);
  }

  holdUpdateInterval = setInterval(async () => {
    await emitHoldUpdates();
  }, 30000);

  childLogger.info('Escalation socket emitters initialized');
}

/**
 * Clean up escalation socket resources
 */
export function cleanupEscalationSocket(): void {
  if (holdUpdateInterval) {
    clearInterval(holdUpdateInterval);
    holdUpdateInterval = null;
  }
  io = null;
  childLogger.info('Escalation socket cleaned up');
}

/**
 * Emit incoming escalation to agents room
 */
export function emitEscalationIncoming(companyId: string, escalation: IEscalation): void {
  if (!io) {
    childLogger.warn('Socket.IO not initialized, cannot emit escalation');
    return;
  }

  const room = `company:${companyId}:agents`;

  const payload = {
    escalationId: escalation._id.toString(),
    callId: escalation.callId,
    callerPhone: maskPhoneNumber(escalation.callerPhone),
    reason: escalation.reason,
    priority: escalation.priority,
    brief: escalation.brief,
    sentiment: escalation.sentiment,
    holdStarted: escalation.holdStarted.toISOString(),
    customerName: escalation.customerName,
    customerTier: escalation.customerTier,
    timestamp: new Date().toISOString(),
  };

  io.to(room).emit('escalation:incoming', payload);

  // Also notify supervisors
  const supervisorRoom = `company:${companyId}:supervisors`;
  io.to(supervisorRoom).emit('escalation:incoming', payload);

  childLogger.info(
    { companyId, escalationId: escalation._id.toString(), priority: escalation.priority },
    'Escalation incoming event emitted'
  );
}

/**
 * Emit escalation accepted event
 */
export function emitEscalationAccepted(
  companyId: string,
  escalationId: string,
  acceptedBy: string
): void {
  if (!io) {
    childLogger.warn('Socket.IO not initialized, cannot emit acceptance');
    return;
  }

  const agentsRoom = `company:${companyId}:agents`;
  const supervisorRoom = `company:${companyId}:supervisors`;

  const payload = {
    escalationId,
    acceptedBy,
    acceptedAt: new Date().toISOString(),
  };

  io.to(agentsRoom).emit('escalation:accepted', payload);
  io.to(supervisorRoom).emit('escalation:accepted', payload);

  childLogger.info({ companyId, escalationId, acceptedBy }, 'Escalation accepted event emitted');
}

/**
 * Emit escalation resolved event
 */
export function emitEscalationResolved(
  companyId: string,
  escalationId: string,
  disposition: string
): void {
  if (!io) {
    childLogger.warn('Socket.IO not initialized, cannot emit resolution');
    return;
  }

  const agentsRoom = `company:${companyId}:agents`;
  const supervisorRoom = `company:${companyId}:supervisors`;

  const payload = {
    escalationId,
    disposition,
    resolvedAt: new Date().toISOString(),
  };

  io.to(agentsRoom).emit('escalation:resolved', payload);
  io.to(supervisorRoom).emit('escalation:resolved', payload);

  childLogger.info({ companyId, escalationId, disposition }, 'Escalation resolved event emitted');
}

/**
 * Emit hold time updates for all waiting escalations
 * Called every 30 seconds
 */
async function emitHoldUpdates(): Promise<void> {
  if (!io) return;

  try {
    // Get all waiting escalations grouped by company
    const waitingEscalations = await Escalation.find({ status: 'waiting' })
      .select('_id companyId holdStarted')
      .lean();

    if (waitingEscalations.length === 0) return;

    const now = Date.now();

    // Group by company
    const byCompany = new Map<string, Array<{ escalationId: string; holdSeconds: number }>>();

    for (const esc of waitingEscalations) {
      const companyId = esc.companyId.toString();
      const holdSeconds = Math.floor((now - new Date(esc.holdStarted).getTime()) / 1000);

      if (!byCompany.has(companyId)) {
        byCompany.set(companyId, []);
      }
      byCompany.get(companyId)!.push({
        escalationId: esc._id.toString(),
        holdSeconds,
      });
    }

    // Emit to each company's agents room
    for (const [companyId, updates] of byCompany) {
      const agentsRoom = `company:${companyId}:agents`;
      const supervisorRoom = `company:${companyId}:supervisors`;

      for (const update of updates) {
        io.to(agentsRoom).emit('escalation:holdUpdate', update);
        io.to(supervisorRoom).emit('escalation:holdUpdate', update);
      }
    }

    childLogger.debug(
      { escalationCount: waitingEscalations.length },
      'Hold time updates emitted'
    );
  } catch (error) {
    childLogger.error({ error }, 'Failed to emit hold updates');
  }
}

/**
 * Mask phone number for display (show last 4 digits)
 */
function maskPhoneNumber(phone: string): string {
  if (!phone || phone.length < 4) return '****';
  return '***-***-' + phone.slice(-4);
}

/**
 * Get hold seconds for a specific escalation
 */
export function getHoldSeconds(holdStarted: Date): number {
  return Math.floor((Date.now() - new Date(holdStarted).getTime()) / 1000);
}
