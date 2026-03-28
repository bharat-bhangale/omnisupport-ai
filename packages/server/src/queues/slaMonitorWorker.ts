import { Worker, Job } from 'bullmq';
import mongoose from 'mongoose';
import { env } from '../config/env.js';
import { QUEUES } from '../config/constants.js';
import { logger } from '../config/logger.js';
import { Ticket, type ITicket } from '../models/Ticket.js';
import { slaMonitorQueue } from './index.js';
import { triggerWorkflows } from '../services/workflowTrigger.js';
import { getSLAStatus, getTimeToBreachMs, getMinutesUntilBreach } from '../services/slaCalculator.js';

const childLogger = logger.child({ worker: 'slaMonitor' });

// Parse Upstash Redis URL for BullMQ connection
const redisUrl = new URL(env.UPSTASH_REDIS_URL);

const connectionOptions = {
  host: redisUrl.hostname,
  port: parseInt(redisUrl.port || '6379', 10),
  password: env.UPSTASH_REDIS_TOKEN,
  tls: {},
  maxRetriesPerRequest: null,
};

// Socket.io instance will be set via init function
let io: {
  to: (room: string) => { emit: (event: string, data: unknown) => void };
} | null = null;

/**
 * Initialize the SLA monitor worker with Socket.io instance
 */
export function initSLAMonitorWorker(
  socketIo: typeof io
): void {
  io = socketIo;
  childLogger.info('SLA Monitor worker initialized with Socket.io');
}

/**
 * Emit SLA event to company room
 */
function emitToCompany(
  companyId: string,
  event: string,
  data: Record<string, unknown>
): void {
  if (!io) {
    childLogger.warn('Socket.io not initialized, skipping emit');
    return;
  }
  io.to(`company:${companyId}`).emit(event, data);
}

/**
 * Company interface for SLA check
 */
interface ActiveCompany {
  _id: mongoose.Types.ObjectId;
  name: string;
}

/**
 * Get list of active companies
 * Note: In production, this would query the Company model
 * For now, we'll get unique companyIds from tickets
 */
async function getActiveCompanies(): Promise<ActiveCompany[]> {
  // Get distinct company IDs from open tickets
  const companyIds = await Ticket.distinct('companyId', {
    status: { $in: ['new', 'open', 'pending'] },
  });

  return companyIds.map((id) => ({
    _id: id as mongoose.Types.ObjectId,
    name: `Company-${id}`,
  }));
}

/**
 * Find the least loaded agent for auto-assignment
 */
async function findLeastLoadedAgent(companyId: mongoose.Types.ObjectId): Promise<string | null> {
  // Get agent workload counts
  const agentWorkloads = await Ticket.aggregate([
    {
      $match: {
        companyId,
        status: { $in: ['open', 'pending'] },
        assignedTo: { $exists: true, $ne: null },
      },
    },
    {
      $group: {
        _id: '$assignedTo',
        count: { $sum: 1 },
      },
    },
    { $sort: { count: 1 } },
    { $limit: 1 },
  ]);

  if (agentWorkloads.length > 0) {
    return agentWorkloads[0]._id as string;
  }

  // No assigned agents found, return null
  return null;
}

/**
 * Sync ticket priority to external helpdesk (Zendesk/Freshdesk)
 */
async function syncToHelpdeskUrgent(ticket: ITicket): Promise<void> {
  // TODO: Implement actual sync via IntegrationOrchestrator
  childLogger.info(
    { ticketId: ticket._id, source: ticket.source, externalId: ticket.externalId },
    'Would sync ticket priority to urgent in external helpdesk'
  );
}

/**
 * Process SLA check for a single company
 */
async function processCompanySLA(company: ActiveCompany): Promise<{
  breached: number;
  warned: number;
  noticed: number;
}> {
  const companyId = company._id;
  const stats = { breached: 0, warned: 0, noticed: 0 };

  // Fetch open tickets with SLA deadline that haven't been flagged as breached
  const tickets = await Ticket.find({
    companyId,
    status: { $in: ['new', 'open', 'pending'] },
    'sla.isBreached': { $ne: true },
    'sla.responseDeadline': { $exists: true },
  }).lean();

  for (const ticket of tickets) {
    const timeToBreachMs = getTimeToBreachMs(ticket as ITicket);
    if (timeToBreachMs === null) continue;

    const ticketId = ticket._id.toString();
    const companyIdStr = companyId.toString();

    // Check SLA status
    if (timeToBreachMs <= 0) {
      // BREACHED - not flagged yet
      stats.breached++;

      // Update ticket
      await Ticket.updateOne(
        { _id: ticket._id },
        { $set: { 'sla.isBreached': true } }
      );

      // Sync to external helpdesk
      await syncToHelpdeskUrgent(ticket as ITicket);

      // Trigger workflows
      await triggerWorkflows(
        'sla_breach',
        {
          ticketId,
          priority: ticket.priority,
          classification: ticket.classification,
          subject: ticket.subject,
          sla: {
            responseDeadline: ticket.sla?.responseDeadline?.toISOString(),
            isBreached: true,
          },
        },
        companyIdStr
      );

      // Emit socket event
      emitToCompany(companyIdStr, 'sla:breached', {
        ticketId,
        subject: ticket.subject,
        priority: ticket.priority,
        breachedAt: new Date().toISOString(),
      });

      childLogger.warn(
        { ticketId, priority: ticket.priority },
        'SLA breached for ticket'
      );
    } else if (timeToBreachMs <= 1800000) {
      // WARNING - less than 30 minutes
      stats.warned++;

      const minutesLeft = getMinutesUntilBreach(ticket as ITicket);

      // Emit socket event
      emitToCompany(companyIdStr, 'sla:warning', {
        ticketId,
        subject: ticket.subject,
        priority: ticket.priority,
        minutesLeft,
      });

      // Auto-assign if not assigned
      if (!ticket.assignedTo) {
        const agent = await findLeastLoadedAgent(companyId);
        if (agent) {
          await Ticket.updateOne(
            { _id: ticket._id },
            { $set: { assignedTo: agent } }
          );
          childLogger.info(
            { ticketId, agent },
            'Auto-assigned ticket to least loaded agent'
          );
        }
      }
    } else if (timeToBreachMs <= 3600000) {
      // NOTICE - 30 min to 1 hour
      stats.noticed++;

      const minutesLeft = getMinutesUntilBreach(ticket as ITicket);

      // Emit socket event
      emitToCompany(companyIdStr, 'sla:notice', {
        ticketId,
        subject: ticket.subject,
        minutesLeft,
      });
    }
  }

  return stats;
}

/**
 * SLA Monitor Worker
 * Runs every 5 minutes to check SLA deadlines
 */
export const slaMonitorWorker = new Worker(
  QUEUES.SLA_MONITOR,
  async (job: Job<Record<string, never>>) => {
    const startTime = Date.now();
    childLogger.info({ jobId: job.id }, 'Starting SLA check');

    try {
      // Get all active companies
      const companies = await getActiveCompanies();
      childLogger.debug({ companyCount: companies.length }, 'Fetched active companies');

      if (companies.length === 0) {
        childLogger.info('No active companies with open tickets');
        return { processed: 0, breached: 0, warned: 0, noticed: 0 };
      }

      // Process all companies in parallel
      const results = await Promise.all(
        companies.map((company) => processCompanySLA(company))
      );

      // Aggregate stats
      const totalStats = results.reduce(
        (acc, stats) => ({
          breached: acc.breached + stats.breached,
          warned: acc.warned + stats.warned,
          noticed: acc.noticed + stats.noticed,
        }),
        { breached: 0, warned: 0, noticed: 0 }
      );

      const duration = Date.now() - startTime;
      childLogger.info(
        {
          jobId: job.id,
          companies: companies.length,
          ...totalStats,
          durationMs: duration,
        },
        'SLA check completed'
      );

      return {
        processed: companies.length,
        ...totalStats,
        durationMs: duration,
      };
    } catch (error) {
      childLogger.error({ error, jobId: job.id }, 'SLA check failed');
      throw error;
    }
  },
  {
    connection: connectionOptions,
    concurrency: 1, // Prevent overlapping runs
    limiter: {
      max: 1,
      duration: 60000, // Max 1 job per minute
    },
  }
);

// Worker event handlers
slaMonitorWorker.on('completed', (job, result) => {
  childLogger.debug({ jobId: job.id, result }, 'SLA check job completed');
});

slaMonitorWorker.on('failed', (job, error) => {
  childLogger.error(
    { jobId: job?.id, error: error.message },
    'SLA check job failed'
  );
});

slaMonitorWorker.on('error', (error) => {
  childLogger.error({ error: error.message }, 'SLA monitor worker error');
});

/**
 * Schedule the repeatable SLA check job
 * Call this on server startup
 */
export async function scheduleSLAMonitor(): Promise<void> {
  // Remove any existing repeatable jobs first
  const existingJobs = await slaMonitorQueue.getRepeatableJobs();
  for (const job of existingJobs) {
    await slaMonitorQueue.removeRepeatableByKey(job.key);
  }

  // Add new repeatable job - every 5 minutes
  await slaMonitorQueue.add(
    'sla-check',
    {},
    {
      repeat: {
        every: 300000, // 5 minutes in milliseconds
      },
      removeOnComplete: true,
      removeOnFail: false,
    }
  );

  childLogger.info('Scheduled SLA monitor job (every 5 minutes)');
}

export default slaMonitorWorker;
