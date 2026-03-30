import { Worker, Job } from 'bullmq';
import mongoose from 'mongoose';
import { env } from '../config/env.js';
import { QUEUES } from '../config/constants.js';
import { logger } from '../config/logger.js';
import { Ticket, type ITicket } from '../models/Ticket.js';
import { SLABreachRecord } from '../models/SLABreachRecord.js';
import { slaMonitorQueue } from './index.js';
import { triggerOnSLABreach } from '../services/workflowTrigger.js';
import { getTimeToBreachMs, getMinutesUntilBreach, getTimeToBreachMinutes } from '../services/slaCalculator.js';
import { sendSLABreachNotification } from '../services/slackNotifier.js';

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
 * Emit SLA event to company room with priority-based sound hint
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
 * Get beep count for priority-based sound alerts
 * P1 breach: 3 rapid beeps | P2 breach: 2 beeps | P3: 1 beep | P4: 1 beep
 */
function getAlertBeeps(priority: string): number {
  switch (priority) {
    case 'urgent':
      return 3;
    case 'high':
      return 2;
    default:
      return 1;
  }
}

/**
 * Company interface for SLA check
 */
interface ActiveCompany {
  _id: mongoose.Types.ObjectId;
  name: string;
}

/**
 * Get list of active companies from open tickets
 */
async function getActiveCompanies(): Promise<ActiveCompany[]> {
  const companyIds = await Ticket.distinct('companyId', {
    status: { $in: ['new', 'open', 'pending'] },
  });

  return companyIds.map((id: mongoose.Types.ObjectId) => ({
    _id: id,
    name: `Company-${id}`,
  }));
}

/**
 * Find the least loaded senior agent for auto-assignment
 */
async function findLeastLoadedAgent(companyId: mongoose.Types.ObjectId): Promise<string | null> {
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

  return null;
}

/**
 * Process SLA check for a single company
 */
async function processCompanySLA(company: ActiveCompany): Promise<{
  breached: number;
  critical: number;
  warning: number;
}> {
  const companyId = company._id;
  const stats = { breached: 0, critical: 0, warning: 0 };

  // Fetch open tickets with SLA deadline that haven't been flagged as breached
  const tickets = await Ticket.find({
    companyId,
    status: { $in: ['new', 'open', 'pending'] },
    'sla.isBreached': { $ne: true },
    'sla.responseDeadline': { $exists: true },
  }).lean();

  const companyIdStr = companyId.toString();

  for (const ticket of tickets) {
    const timeToBreachMs = getTimeToBreachMs(ticket as unknown as ITicket);
    if (timeToBreachMs === null) continue;

    const ticketId = ticket._id.toString();
    const minutesLeft = getTimeToBreachMinutes(ticket as unknown as ITicket);

    if (timeToBreachMs <= 0) {
      // ──── BREACHED ────────────────────────────────────────────────
      stats.breached++;
      const minutesOverdue = Math.abs(minutesLeft);

      // 1. Update ticket: slaBreach=true, slaBreachedAt
      await Ticket.updateOne(
        { _id: ticket._id },
        {
          $set: {
            'sla.isBreached': true,
          },
        }
      );

      // 2. Create SLABreachRecord in MongoDB
      try {
        await SLABreachRecord.findOneAndUpdate(
          { companyId, ticketId: ticket._id },
          {
            companyId,
            ticketId: ticket._id,
            externalId: ticket.externalId,
            priority: ticket.priority,
            category: ticket.classification?.categories?.[0] || undefined,
            slaDeadline: ticket.sla!.responseDeadline,
            breachedAt: new Date(),
            breachDurationMinutes: minutesOverdue,
            assignedAgent: ticket.assignedTo || undefined,
          },
          { upsert: true, new: true }
        );
      } catch (error) {
        childLogger.error(
          { error, ticketId, companyId: companyIdStr },
          'Failed to create SLABreachRecord'
        );
      }

      // 3. Trigger workflows
      await triggerOnSLABreach(
        ticketId,
        companyIdStr,
        {
          responseDeadline: ticket.sla?.responseDeadline?.toISOString(),
          isBreached: true,
          minutesUntilBreach: -minutesOverdue,
        },
        {
          subject: ticket.subject,
          priority: ticket.priority,
        }
      );

      // 4. Socket.io: emit 'sla:breached' with full ticket context + beep count
      emitToCompany(companyIdStr, 'sla:breached', {
        ticketId,
        subject: ticket.subject,
        priority: ticket.priority,
        minutesOverdue,
        assignedAgent: ticket.assignedTo || null,
        externalId: ticket.externalId,
        alertBeeps: getAlertBeeps(ticket.priority),
      });

      // 5. Slack notification
      sendSLABreachNotification(companyIdStr, {
        ticketId,
        subject: ticket.subject,
        priority: ticket.priority,
        minutesOverdue,
        assignedAgent: ticket.assignedTo || undefined,
        externalId: ticket.externalId,
      }).catch((err: unknown) => {
        childLogger.warn({ err, ticketId }, 'Slack SLA notification failed (non-fatal)');
      });

      childLogger.warn(
        { ticketId, priority: ticket.priority, minutesOverdue },
        'SLA breached for ticket'
      );
    } else if (timeToBreachMs <= 1800000) {
      // ──── CRITICAL (<30 min) ──────────────────────────────────────
      stats.critical++;

      const minutesRemaining = getMinutesUntilBreach(ticket as unknown as ITicket);

      // Socket.io: emit 'sla:critical'
      emitToCompany(companyIdStr, 'sla:critical', {
        ticketId,
        subject: ticket.subject,
        priority: ticket.priority,
        minutesLeft: minutesRemaining,
        assignedAgent: ticket.assignedTo || null,
      });

      // Auto-assign to least-loaded senior agent if unassigned
      if (!ticket.assignedTo) {
        const agent = await findLeastLoadedAgent(companyId);
        if (agent) {
          await Ticket.updateOne(
            { _id: ticket._id },
            { $set: { assignedTo: agent } }
          );
          childLogger.info(
            { ticketId, agent, minutesLeft: minutesRemaining },
            'Auto-assigned critical SLA ticket to least loaded agent'
          );
        }
      }

      childLogger.info(
        { ticketId, priority: ticket.priority, minutesLeft: minutesRemaining },
        'Ticket in critical SLA zone'
      );
    } else if (timeToBreachMs <= 3600000) {
      // ──── WARNING (30-60 min) ─────────────────────────────────────
      stats.warning++;

      const minutesRemaining = getMinutesUntilBreach(ticket as unknown as ITicket);

      // Socket.io: emit 'sla:warning'
      emitToCompany(companyIdStr, 'sla:warning', {
        ticketId,
        subject: ticket.subject,
        priority: ticket.priority,
        minutesLeft: minutesRemaining,
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
        return { processed: 0, breached: 0, critical: 0, warning: 0 };
      }

      // Process all companies in parallel
      const results = await Promise.all(
        companies.map((company: ActiveCompany) => processCompanySLA(company))
      );

      // Aggregate stats
      const totalStats = results.reduce(
        (acc: { breached: number; critical: number; warning: number }, stats: { breached: number; critical: number; warning: number }) => ({
          breached: acc.breached + stats.breached,
          critical: acc.critical + stats.critical,
          warning: acc.warning + stats.warning,
        }),
        { breached: 0, critical: 0, warning: 0 }
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
slaMonitorWorker.on('completed', (job: Job, result: unknown) => {
  childLogger.debug({ jobId: job.id, result }, 'SLA check job completed');
});

slaMonitorWorker.on('failed', (job: Job | undefined, error: Error) => {
  childLogger.error(
    { jobId: job?.id, error: error.message },
    'SLA check job failed'
  );
});

slaMonitorWorker.on('error', (error: Error) => {
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
