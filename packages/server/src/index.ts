import express, { json, urlencoded, Request, Response, NextFunction } from 'express';
import { createServer } from 'http';
import cors from 'cors';
import { randomUUID } from 'crypto';
import { env } from './config/env.js';
import { logger } from './config/logger.js';
import { connectDatabase } from './config/database.js';
import { connectRedis } from './config/redis.js';
import { errorHandler, notFoundHandler } from './middleware/errorHandler.js';
import { standardRateLimit, webhookRateLimit } from './middleware/rateLimit.js';
import { vapiWebhookHandler, getCallSessionState } from './webhooks/vapi.js';
import { vapiToolsHandler } from './webhooks/vapiTools.js';
import authRouter from './routes/auth.js';
import callsRouter from './routes/calls.js';
import escalationsRouter from './routes/escalations.js';
import extensionRouter from './routes/extension.js';
import integrationsRouter from './routes/integrations.js';
import qaRouter from './routes/qa.js';
import analyticsRouter from './routes/analytics.js';
import learningRouter from './routes/learning.js';
import onboardingRouter from './routes/onboarding.js';
import proactiveTriggersRouter from './routes/proactiveTriggers.js';
import fraudRouter from './routes/fraud.js';
import languagesRouter from './routes/languages.js';
import slaRouter from './routes/sla.js';
import { initializeSockets, cleanupSockets } from './sockets/index.js';

// Extend Express Request type for requestId
declare global {
  namespace Express {
    interface Request {
      id?: string;
    }
  }
}

async function bootstrap(): Promise<void> {
  const app = express();

  // Trust proxy (for proper IP detection behind load balancer)
  app.set('trust proxy', 1);

  // CORS configuration
  app.use(cors({
    origin: env.CORS_ORIGIN.split(',').map(o => o.trim()),
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-Request-ID'],
    exposedHeaders: ['X-Request-ID'],
  }));

  // Request ID middleware - adds unique ID to each request
  app.use((req: Request, res: Response, next: NextFunction) => {
    const requestId = (req.headers['x-request-id'] as string) || randomUUID();
    req.id = requestId;
    res.setHeader('X-Request-ID', requestId);
    next();
  });

  // Request logging middleware
  app.use((req: Request, res: Response, next: NextFunction) => {
    const start = Date.now();
    
    res.on('finish', () => {
      const duration = Date.now() - start;
      const logData = {
        requestId: req.id,
        method: req.method,
        path: req.path,
        status: res.statusCode,
        duration,
        ip: req.ip,
      };
      
      if (res.statusCode >= 500) {
        logger.error(logData, 'Request completed with error');
      } else if (res.statusCode >= 400) {
        logger.warn(logData, 'Request completed with client error');
      } else {
        logger.debug(logData, 'Request completed');
      }
    });
    
    next();
  });

  // Body parsing middleware
  app.use(json({ limit: '10mb' }));
  app.use(urlencoded({ extended: true }));

  // Health check (no auth required)
  app.get('/health', (_req, res) => {
    res.json({
      status: 'ok',
      timestamp: new Date().toISOString(),
      version: process.env.npm_package_version || '1.0.0',
    });
  });

  // Webhooks (no auth required, signature validated) - with webhook rate limit
  app.post('/webhooks/vapi', webhookRateLimit, vapiWebhookHandler);
  app.post('/vapi/tools', webhookRateLimit, vapiToolsHandler);

  // Apply standard rate limiting to all API routes
  app.use('/api', standardRateLimit);

  // API routes (auth middleware applied per-router as needed)
  app.use('/api/auth', authRouter);
  app.use('/api/calls', callsRouter);
  app.use('/api/escalations', escalationsRouter);
  app.use('/api/extension', extensionRouter);
  app.use('/api/integrations', integrationsRouter);
  app.use('/api/qa', qaRouter);
  app.use('/api/analytics', analyticsRouter);
  app.use('/api/learning', learningRouter);
  app.use('/api/onboarding', onboardingRouter);
  app.use('/api/proactive-triggers', proactiveTriggersRouter);
  app.use('/api/fraud', fraudRouter);
  app.use('/api/languages', languagesRouter);
  app.use('/api/sla', slaRouter);

  // Debug endpoint (protected in production)
  if (env.NODE_ENV === 'development') {
    app.get('/debug/sessions/:callId', getCallSessionState);
  }

  // Error handling
  app.use(notFoundHandler);
  app.use(errorHandler);

  // Connect to databases
  await connectDatabase();
  await connectRedis();

  // Start server
  const httpServer = createServer(app);

  // Initialize Socket.IO with centralized configuration
  initializeSockets(httpServer);

  httpServer.listen(env.PORT, () => {
    logger.info({ port: env.PORT, env: env.NODE_ENV }, 'Server started');
  });

  // Graceful shutdown
  const shutdown = async (signal: string): Promise<void> => {
    logger.info({ signal }, 'Shutdown signal received');

    // Cleanup socket resources
    cleanupSockets();

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
