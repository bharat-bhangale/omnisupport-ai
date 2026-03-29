import type { Server as SocketIOServer } from 'socket.io';
import mongoose from 'mongoose';
import { logger } from '../config/logger.js';
import { CallSession } from '../models/CallSession.js';
import { Ticket } from '../models/Ticket.js';
import { Escalation } from '../models/Escalation.js';
import { getCostSavings } from '../services/analytics.js';

const childLogger = logger.child({ module: 'analyticsSocket' });

let io: SocketIOServer | null = null;
let liveCountsInterval: NodeJS.Timeout | null = null;

// Live counts emit interval (30 seconds)
const LIVE_COUNTS_INTERVAL = 30000;

interface LiveCounts {
  activeCalls: number;
  openTickets: number;
  waitingEscalations: number;
  costSavedToday: number;
  timestamp: string;
}

/**
 * Compute cost saved today for a company
 */
async function computeCostSavedToday(companyId: string): Promise<number> {
  try {
    const savings = await getCostSavings(companyId, 1);
    return savings.total;
  } catch (error) {
    childLogger.error({ error, companyId }, 'Failed to compute cost saved today');
    return 0;
  }
}

/**
 * Emit live counts for a specific company
 */
async function emitLiveCounts(companyId: string): Promise<void> {
  if (!io) return;

  try {
    const companyObjectId = new mongoose.Types.ObjectId(companyId);

    const [activeCalls, openTickets, waitingEscalations, costSavedToday] = await Promise.all([
      CallSession.countDocuments({ companyId: companyObjectId, status: 'active' }),
      Ticket.countDocuments({
        companyId: companyObjectId,
        status: { $in: ['open', 'pending', 'new'] },
      }),
      Escalation.countDocuments({ companyId: companyObjectId, status: 'waiting' }),
      computeCostSavedToday(companyId),
    ]);

    const payload: LiveCounts = {
      activeCalls,
      openTickets,
      waitingEscalations,
      costSavedToday,
      timestamp: new Date().toISOString(),
    };

    io.to(`company:${companyId}`).emit('analytics:liveCounts', payload);

    childLogger.debug(
      { companyId, activeCalls, openTickets, waitingEscalations },
      'Live counts emitted'
    );
  } catch (error) {
    childLogger.error({ error, companyId }, 'Failed to emit live counts');
  }
}

/**
 * Get active company IDs from connected socket rooms
 * Only emit to companies that have connected clients
 */
function getActiveCompanyIds(): string[] {
  if (!io) return [];

  const companyIds = new Set<string>();
  const rooms = io.sockets.adapter.rooms;

  for (const [roomName, roomSet] of rooms) {
    // Match rooms like "company:abc123" (but not "company:abc123:agents")
    const match = roomName.match(/^company:([a-f0-9]{24})$/);
    if (match && roomSet.size > 0) {
      companyIds.add(match[1]);
    }
  }

  return Array.from(companyIds);
}

/**
 * Emit live counts to all active companies
 */
async function emitLiveCountsToAllCompanies(): Promise<void> {
  const companyIds = getActiveCompanyIds();

  if (companyIds.length === 0) {
    childLogger.debug('No active companies with connected clients, skipping live counts');
    return;
  }

  childLogger.debug({ companyCount: companyIds.length }, 'Emitting live counts to active companies');

  // Emit to all companies in parallel
  await Promise.all(companyIds.map((companyId) => emitLiveCounts(companyId)));
}

/**
 * Start the live counts emitter
 * Emits analytics:liveCounts every 30 seconds to connected clients
 */
export function startLiveCountsEmitter(socketIO: SocketIOServer): void {
  io = socketIO;

  // Clear any existing interval
  if (liveCountsInterval) {
    clearInterval(liveCountsInterval);
  }

  // Start emitting live counts every 30 seconds
  liveCountsInterval = setInterval(async () => {
    await emitLiveCountsToAllCompanies();
  }, LIVE_COUNTS_INTERVAL);

  childLogger.info('Live counts emitter started (30s interval)');
}

/**
 * Stop the live counts emitter
 */
export function stopLiveCountsEmitter(): void {
  if (liveCountsInterval) {
    clearInterval(liveCountsInterval);
    liveCountsInterval = null;
  }
  io = null;
  childLogger.info('Live counts emitter stopped');
}

/**
 * Force emit live counts to a specific company
 * Useful when a significant event occurs (call starts, ticket created, etc.)
 */
export async function forceEmitLiveCounts(companyId: string): Promise<void> {
  await emitLiveCounts(companyId);
}
