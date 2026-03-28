import { Worker, Job } from 'bullmq';
import { z } from 'zod';
import { env } from '../config/env.js';
import { QUEUES } from '../config/constants.js';
import { logger } from '../config/logger.js';
import { Ticket } from '../models/Ticket.js';
import { Customer } from '../models/Customer.js';
import { generateDraft, type DraftTone, type DraftResult } from '../services/responseGenerator.js';

const childLogger = logger.child({ worker: 'response' });

// Parse Upstash Redis URL for BullMQ connection
const redisUrl = new URL(env.UPSTASH_REDIS_URL);

const connectionOptions = {
  host: redisUrl.hostname,
  port: parseInt(redisUrl.port || '6379', 10),
  password: env.UPSTASH_REDIS_TOKEN,
  tls: {},
  maxRetriesPerRequest: null,
};

// Job data schema
const ResponseJobDataSchema = z.object({
  ticketId: z.string(),
  companyId: z.string(),
  tone: z.enum(['professional', 'empathetic', 'technical']).optional(),
});

export type ResponseJobData = z.infer<typeof ResponseJobDataSchema>;

export interface ResponseJobResult {
  ticketId: string;
  success: boolean;
  confidence: number;
  sourceCount: number;
  processingTimeMs: number;
}

// Socket.io instance (will be set during server startup)
let socketIO: { to: (room: string) => { emit: (event: string, data: unknown) => void } } | null = null;

/**
 * Set the Socket.io instance for emitting events
 */
export function setSocketIO(io: typeof socketIO): void {
  socketIO = io;
}

/**
 * Build customer history from recent tickets
 */
async function buildCustomerHistory(
  customerId: string | undefined,
  companyId: string,
  currentTicketId: string
): Promise<string | undefined> {
  if (!customerId) {
    return undefined;
  }

  try {
    // Fetch last 2 resolved tickets for this customer (excluding current)
    const recentTickets = await Ticket.find({
      companyId,
      customerId,
      _id: { $ne: currentTicketId },
      status: { $in: ['solved', 'closed'] },
    })
      .sort({ updatedAt: -1 })
      .limit(2)
      .select('subject classification.intent resolution.resolutionType updatedAt')
      .lean()
      .exec();

    if (recentTickets.length === 0) {
      return undefined;
    }

    const historyLines = recentTickets.map((ticket) => {
      const intent = ticket.classification?.intent || 'General';
      const resolution = ticket.resolution?.resolutionType || 'resolved';
      const date = new Date(ticket.updatedAt).toLocaleDateString();
      return `- ${date}: ${ticket.subject} (${intent}, ${resolution})`;
    });

    return historyLines.join('\n');
  } catch (error) {
    childLogger.warn({ error, customerId }, 'Failed to build customer history');
    return undefined;
  }
}

/**
 * Process response generation job
 */
async function processResponseJob(job: Job<ResponseJobData>): Promise<ResponseJobResult> {
  const startTime = Date.now();
  const { ticketId, companyId, tone } = job.data;

  childLogger.info(
    { ticketId, companyId, tone, jobId: job.id },
    'Processing response generation job'
  );

  try {
    // Validate job data
    ResponseJobDataSchema.parse(job.data);

    // Fetch ticket
    const ticket = await Ticket.findOne({
      _id: ticketId,
      companyId,
    }).lean().exec();

    if (!ticket) {
      throw new Error(`Ticket not found: ${ticketId}`);
    }

    // Fetch customer if exists
    let customerName: string | undefined;
    let customerTier: string | undefined;
    
    if (ticket.customerId) {
      const customer = await Customer.findById(ticket.customerId)
        .select('name tier')
        .lean()
        .exec();
      
      if (customer) {
        customerName = customer.name;
        customerTier = customer.tier;
      }
    }

    // Build customer history
    const customerHistory = await buildCustomerHistory(
      ticket.customerId?.toString(),
      companyId,
      ticketId
    );

    // Generate draft
    const draftResult: DraftResult = await generateDraft({
      ticketId,
      companyId,
      ticketBody: ticket.description,
      ticketSubject: ticket.subject,
      category: ticket.classification?.intent || 'general',
      customerHistory,
      tone: tone || 'professional',
      language: ticket.language || 'en',
      customerName,
      customerTier,
    });

    // Update ticket with draft
    await Ticket.findByIdAndUpdate(ticketId, {
      aiDraft: {
        content: draftResult.draft,
        generatedAt: new Date(),
        approved: false,
        tone: draftResult.toneApplied,
        needsReview: draftResult.needsReview,
        reviewReason: draftResult.reviewReason,
      },
      ragContext: {
        documentIds: draftResult.sources.map((s) => s.id),
        chunks: draftResult.sources.map((s) => s.content),
        relevanceScores: draftResult.sources.map((s) => s.score),
      },
      flaggedForReview: draftResult.needsReview,
    });

    // Emit socket event for real-time UI update
    if (socketIO) {
      socketIO.to(`company:${companyId}`).emit('ticket:draftReady', {
        ticketId,
        draft: {
          content: draftResult.draft,
          generatedAt: new Date().toISOString(),
          confidence: draftResult.confidence,
          tone: draftResult.toneApplied,
          sources: draftResult.sources.map((s) => ({
            id: s.id,
            title: s.title,
            score: s.score,
          })),
          needsReview: draftResult.needsReview,
          reviewReason: draftResult.reviewReason,
        },
      });
      
      childLogger.debug({ ticketId, companyId }, 'Emitted ticket:draftReady event');
    }

    const processingTimeMs = Date.now() - startTime;

    childLogger.info(
      {
        ticketId,
        companyId,
        confidence: draftResult.confidence,
        sourceCount: draftResult.sources.length,
        processingTimeMs,
      },
      'Response generation completed'
    );

    return {
      ticketId,
      success: true,
      confidence: draftResult.confidence,
      sourceCount: draftResult.sources.length,
      processingTimeMs,
    };
  } catch (error) {
    const processingTimeMs = Date.now() - startTime;
    
    childLogger.error(
      { error, ticketId, companyId, jobId: job.id, processingTimeMs },
      'Response generation job failed'
    );
    
    throw error;
  }
}

/**
 * Create and start the response generation worker
 */
export function createResponseWorker(): Worker<ResponseJobData, ResponseJobResult> {
  const worker = new Worker<ResponseJobData, ResponseJobResult>(
    QUEUES.RESPONSE,
    processResponseJob,
    {
      connection: connectionOptions,
      concurrency: 8,
      limiter: {
        max: 50,
        duration: 60000, // 50 jobs per minute
      },
    }
  );

  worker.on('completed', (job, result) => {
    childLogger.info(
      {
        jobId: job.id,
        ticketId: result.ticketId,
        confidence: result.confidence,
        processingTimeMs: result.processingTimeMs,
      },
      'Response generation job completed'
    );
  });

  worker.on('failed', (job, error) => {
    childLogger.error(
      {
        jobId: job?.id,
        ticketId: job?.data.ticketId,
        error: error.message,
        attempt: job?.attemptsMade,
      },
      'Response generation job failed'
    );
  });

  worker.on('error', (error) => {
    childLogger.error({ error }, 'Response worker error');
  });

  childLogger.info('Response generation worker started');
  return worker;
}

// Export for testing
export { processResponseJob, buildCustomerHistory };
