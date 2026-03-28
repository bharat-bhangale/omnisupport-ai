import express, { json, urlencoded } from 'express';
import { createServer } from 'http';
import { env } from './config/env.js';
import { logger } from './config/logger.js';
import { connectDatabase } from './config/database.js';
import { connectRedis } from './config/redis.js';
import { errorHandler, notFoundHandler } from './middleware/errorHandler.js';
import { vapiWebhookHandler, getCallSessionState } from './webhooks/vapi.js';

async function bootstrap(): Promise<void> {
  const app = express();

  // Middleware
  app.use(json({ limit: '10mb' }));
  app.use(urlencoded({ extended: true }));

  // Health check
  app.get('/health', (_req, res) => {
    res.json({ status: 'ok', timestamp: new Date().toISOString() });
  });

  // Webhooks (no auth required, signature validated)
  app.post('/webhooks/vapi', vapiWebhookHandler);

  // Debug endpoint (would need auth in production)
  app.get('/debug/sessions/:callId', getCallSessionState);

  // Error handling
  app.use(notFoundHandler);
  app.use(errorHandler);

  // Connect to databases
  await connectDatabase();
  await connectRedis();

  // Start server
  const httpServer = createServer(app);

  httpServer.listen(env.PORT, () => {
    logger.info({ port: env.PORT, env: env.NODE_ENV }, 'Server started');
  });

  // Graceful shutdown
  const shutdown = async (signal: string): Promise<void> => {
    logger.info({ signal }, 'Shutdown signal received');

    httpServer.close(() => {
      logger.info('HTTP server closed');
    });

    // Close queue connections, DB connections, etc.
    process.exit(0);
  };

  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));
}

bootstrap().catch((error) => {
  logger.fatal({ error }, 'Failed to start server');
  process.exit(1);
});
