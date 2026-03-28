import { Queue, QueueOptions } from 'bullmq';
import { env } from '../config/env.js';
import { QUEUES } from '../config/constants.js';
import { logger } from '../config/logger.js';
import type { SummaryJobData } from '../types/session.js';

// Parse Upstash Redis URL for BullMQ connection
const redisUrl = new URL(env.UPSTASH_REDIS_URL);

const connectionOptions: QueueOptions['connection'] = {
  host: redisUrl.hostname,
  port: parseInt(redisUrl.port || '6379', 10),
  password: env.UPSTASH_REDIS_TOKEN,
  tls: {},
  maxRetriesPerRequest: null,
};

const defaultJobOptions: QueueOptions['defaultJobOptions'] = {
  attempts: 3,
  backoff: {
    type: 'exponential',
    delay: 1000,
  },
  removeOnComplete: {
    count: 1000,
    age: 24 * 60 * 60, // 24 hours
  },
  removeOnFail: {
    count: 5000,
    age: 7 * 24 * 60 * 60, // 7 days
  },
};

// Classification queue for ticket intent classification
export const classificationQueue = new Queue(QUEUES.CLASSIFICATION, {
  connection: connectionOptions,
  defaultJobOptions,
});

// Summary queue for generating conversation summaries
export const summaryQueue = new Queue<SummaryJobData>(QUEUES.SUMMARY, {
  connection: connectionOptions,
  defaultJobOptions,
});

// QA queue for quality assurance scoring
export const qaQueue = new Queue(QUEUES.QA, {
  connection: connectionOptions,
  defaultJobOptions,
});

// KB Index queue for indexing knowledge base documents
export const kbIndexQueue = new Queue(QUEUES.KB_INDEX, {
  connection: connectionOptions,
  defaultJobOptions,
});

// Learning queue for continuous learning from feedback
export const learningQueue = new Queue(QUEUES.LEARNING, {
  connection: connectionOptions,
  defaultJobOptions,
});

// SLA Monitor queue for checking SLA breaches
export const slaMonitorQueue = new Queue(QUEUES.SLA_MONITOR, {
  connection: connectionOptions,
  defaultJobOptions: {
    ...defaultJobOptions,
    attempts: 1, // SLA checks don't need retries
  },
});

// Workflow queue for executing workflow automations
export const workflowQueue = new Queue(QUEUES.WORKFLOW, {
  connection: connectionOptions,
  defaultJobOptions,
});

// Response queue for generating AI responses
export const responseQueue = new Queue(QUEUES.RESPONSE, {
  connection: connectionOptions,
  defaultJobOptions: {
    ...defaultJobOptions,
    attempts: 2, // Fewer retries for response generation
  },
});

// Sentiment queue for sentiment analysis
export const sentimentQueue = new Queue(QUEUES.SENTIMENT, {
  connection: connectionOptions,
  defaultJobOptions: {
    ...defaultJobOptions,
    attempts: 2,
  },
});

// All queues for bulk operations
export const allQueues = [
  classificationQueue,
  summaryQueue,
  qaQueue,
  kbIndexQueue,
  learningQueue,
  slaMonitorQueue,
  workflowQueue,
  responseQueue,
  sentimentQueue,
];

/**
 * Close all queue connections gracefully
 */
export async function closeAllQueues(): Promise<void> {
  logger.info('Closing all BullMQ queues...');
  await Promise.all(allQueues.map((queue) => queue.close()));
  logger.info('All BullMQ queues closed');
}

/**
 * Check queue health
 */
export async function getQueueHealth(): Promise<Record<string, { waiting: number; active: number; failed: number }>> {
  const health: Record<string, { waiting: number; active: number; failed: number }> = {};

  for (const queue of allQueues) {
    const [waiting, active, failed] = await Promise.all([
      queue.getWaitingCount(),
      queue.getActiveCount(),
      queue.getFailedCount(),
    ]);

    health[queue.name] = { waiting, active, failed };
  }

  return health;
}
