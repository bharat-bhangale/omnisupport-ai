/**
 * BullMQ Workers Entry Point
 * 
 * This file initializes all BullMQ workers for the application.
 * Run as a separate service on Railway for worker scaling.
 * 
 * Usage: npx tsx src/workerMain.ts
 */

import { Worker } from 'bullmq';
import { env } from './config/env.js';
import { logger } from './config/logger.js';
import { connectDatabase } from './config/database.js';
import { connectRedis } from './config/redis.js';
import { closeAllQueues } from './queues/index.js';

// Import workers
import classificationWorker from './queues/classificationWorker.js';
import responseWorker from './queues/responseWorker.js';
import workflowExecutor from './queues/workflowExecutor.js';
import slaMonitorWorker, { scheduleSLAMonitor } from './queues/slaMonitorWorker.js';

const childLogger = logger.child({ service: 'workers' });

// Track all workers for graceful shutdown
const workers: Worker[] = [
  classificationWorker,
  responseWorker,
  workflowExecutor,
  slaMonitorWorker,
];

// Track unimplemented workers (stubs for future implementation)
const STUB_WORKERS = ['summary', 'qa', 'kb-index', 'learning', 'sentiment'];

/**
 * Create stub worker that logs jobs
 */
function createStubWorker(queueName: string): void {
  childLogger.info({ queue: queueName }, `Stub worker created (not processing jobs)`);
}

/**
 * Initialize all workers
 */
async function initializeWorkers(): Promise<void> {
  childLogger.info('Initializing BullMQ workers...');

  // Log active workers
  for (const worker of workers) {
    childLogger.info({ worker: worker.name }, 'Worker active');
  }

  // Note stub workers
  for (const stub of STUB_WORKERS) {
    createStubWorker(stub);
  }

  // Schedule repeatable SLA monitor job
  await scheduleSLAMonitor();

  childLogger.info(
    {
      active: workers.length,
      stubs: STUB_WORKERS.length,
    },
    'All BullMQ workers started'
  );
}

/**
 * Graceful shutdown handler
 */
async function gracefulShutdown(signal: string): Promise<void> {
  childLogger.info({ signal }, 'Shutdown signal received, closing workers...');

  try {
    // Close all workers
    await Promise.all(
      workers.map(async (worker) => {
        childLogger.debug({ worker: worker.name }, 'Closing worker...');
        await worker.close();
      })
    );

    // Close all queues
    await closeAllQueues();

    childLogger.info('All workers and queues closed');
    process.exit(0);
  } catch (error) {
    childLogger.error({ error }, 'Error during shutdown');
    process.exit(1);
  }
}

/**
 * Main bootstrap function
 */
async function bootstrap(): Promise<void> {
  try {
    // Connect to databases
    await connectDatabase();
    await connectRedis();

    // Initialize workers
    await initializeWorkers();

    // Setup graceful shutdown
    process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
    process.on('SIGINT', () => gracefulShutdown('SIGINT'));

    // Handle uncaught errors
    process.on('uncaughtException', (error) => {
      childLogger.fatal({ error }, 'Uncaught exception');
      gracefulShutdown('uncaughtException');
    });

    process.on('unhandledRejection', (reason) => {
      childLogger.fatal({ reason }, 'Unhandled rejection');
      gracefulShutdown('unhandledRejection');
    });

    childLogger.info('Worker service running, waiting for jobs...');
  } catch (error) {
    childLogger.fatal({ error }, 'Failed to start worker service');
    process.exit(1);
  }
}

// Start the worker service
bootstrap();

// Export for programmatic use
export { initializeWorkers, gracefulShutdown };
