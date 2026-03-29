import express, { json, urlencoded } from 'express';
import { createServer } from 'http';
import { Server as SocketIOServer } from 'socket.io';
import { env } from './config/env.js';
import { logger } from './config/logger.js';
import { connectDatabase } from './config/database.js';
import { connectRedis } from './config/redis.js';
import { errorHandler, notFoundHandler } from './middleware/errorHandler.js';
import { vapiWebhookHandler, getCallSessionState } from './webhooks/vapi.js';
import { vapiToolsHandler } from './webhooks/vapiTools.js';
import escalationsRouter from './routes/escalations.js';
import { initEscalationSocket, cleanupEscalationSocket } from './sockets/escalationSocket.js';
import { initSentimentSocket } from './sockets/sentimentSocket.js';

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
  app.post('/vapi/tools', vapiToolsHandler);

  // API routes
  app.use('/api/escalations', escalationsRouter);

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

  // Initialize Socket.IO
  const io = new SocketIOServer(httpServer, {
    cors: {
      origin: env.NODE_ENV === 'development' 
        ? ['http://localhost:3000', 'http://localhost:5173']
        : env.SERVER_URL,
      credentials: true,
    },
    path: '/socket.io',
  });

  // Socket.IO authentication and room management
  io.use((socket, next) => {
    const token = socket.handshake.auth.token;
    // TODO: Validate JWT token and extract user info
    // For now, allow all connections in development
    if (env.NODE_ENV === 'development' || token) {
      socket.data.companyId = socket.handshake.auth.companyId || 'dev-company';
      socket.data.userId = socket.handshake.auth.userId || 'dev-user';
      next();
    } else {
      next(new Error('Authentication required'));
    }
  });

  io.on('connection', (socket) => {
    logger.debug({ socketId: socket.id }, 'Socket connected');

    // Join company rooms
    socket.on('join:agents', () => {
      const room = `company:${socket.data.companyId}:agents`;
      socket.join(room);
      logger.debug({ socketId: socket.id, room }, 'Joined agents room');
    });

    socket.on('join:supervisors', () => {
      const room = `company:${socket.data.companyId}:supervisors`;
      socket.join(room);
      logger.debug({ socketId: socket.id, room }, 'Joined supervisors room');
    });

    socket.on('leave:agents', () => {
      const room = `company:${socket.data.companyId}:agents`;
      socket.leave(room);
    });

    socket.on('leave:supervisors', () => {
      const room = `company:${socket.data.companyId}:supervisors`;
      socket.leave(room);
    });

    socket.on('disconnect', () => {
      logger.debug({ socketId: socket.id }, 'Socket disconnected');
    });
  });

  // Initialize socket emitters
  initEscalationSocket(io);
  initSentimentSocket(io);

  httpServer.listen(env.PORT, () => {
    logger.info({ port: env.PORT, env: env.NODE_ENV }, 'Server started');
  });

  // Graceful shutdown
  const shutdown = async (signal: string): Promise<void> => {
    logger.info({ signal }, 'Shutdown signal received');

    // Cleanup socket resources
    cleanupEscalationSocket();

    io.close(() => {
      logger.info('Socket.IO server closed');
    });

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
