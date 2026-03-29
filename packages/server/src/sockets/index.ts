import type { Server as HTTPServer } from 'http';
import { Server as SocketIOServer, Socket } from 'socket.io';
import { verify, JwtPayload } from 'jsonwebtoken';
import jwksRsa from 'jwks-rsa';
import { env } from '../config/env.js';
import { logger } from '../config/logger.js';
import { initEscalationSocket, cleanupEscalationSocket } from './escalationSocket.js';
import { initSentimentSocket } from './sentimentSocket.js';
import { startLiveCountsEmitter, stopLiveCountsEmitter } from './analyticsSocket.js';
import { initActivitySocket } from './activitySocket.js';

const childLogger = logger.child({ module: 'sockets' });

// Global Socket.IO instance
let io: SocketIOServer | null = null;

// JWKS client for Auth0 JWT verification
const jwksClient = jwksRsa({
  jwksUri: `https://${env.AUTH0_DOMAIN}/.well-known/jwks.json`,
  cache: true,
  cacheMaxEntries: 5,
  cacheMaxAge: 600000, // 10 minutes
});

/**
 * Get signing key from JWKS
 */
async function getSigningKey(kid: string): Promise<string> {
  const key = await jwksClient.getSigningKey(kid);
  return key.getPublicKey();
}

/**
 * Verify JWT token from Auth0
 */
async function verifyToken(token: string): Promise<JwtPayload | null> {
  try {
    // Decode to get the kid
    const decoded = JSON.parse(Buffer.from(token.split('.')[0], 'base64').toString());
    const kid = decoded.kid;

    if (!kid) {
      childLogger.warn('No kid in token header');
      return null;
    }

    const signingKey = await getSigningKey(kid);

    const verified = verify(token, signingKey, {
      algorithms: ['RS256'],
      audience: env.AUTH0_CLIENT_ID,
      issuer: `https://${env.AUTH0_DOMAIN}/`,
    }) as JwtPayload;

    return verified;
  } catch (error) {
    childLogger.debug({ error }, 'JWT verification failed');
    return null;
  }
}

/**
 * Socket authentication middleware
 */
async function authMiddleware(socket: Socket, next: (err?: Error) => void): Promise<void> {
  const token = socket.handshake.auth.token;

  // In development, allow connections with mock data
  if (env.NODE_ENV === 'development') {
    socket.data.companyId = socket.handshake.auth.companyId || 'dev-company';
    socket.data.userId = socket.handshake.auth.userId || 'dev-user';
    socket.data.role = socket.handshake.auth.role || 'agent';
    return next();
  }

  if (!token) {
    return next(new Error('Authentication token required'));
  }

  const payload = await verifyToken(token);

  if (!payload) {
    return next(new Error('Invalid authentication token'));
  }

  // Extract user data from JWT
  socket.data.userId = payload.sub;
  socket.data.companyId = payload['https://omnisupport.ai/company_id'] || payload.company_id;
  socket.data.role = payload['https://omnisupport.ai/role'] || payload.role || 'agent';

  if (!socket.data.companyId) {
    return next(new Error('Company ID not found in token'));
  }

  next();
}

/**
 * Handle socket connection
 */
function handleConnection(socket: Socket): void {
  const { companyId, userId, role } = socket.data;

  childLogger.debug(
    { socketId: socket.id, companyId, userId, role },
    'Socket connected'
  );

  // Auto-join company room
  socket.join(`company:${companyId}`);

  // Join role-based rooms
  socket.on('join:agents', () => {
    const room = `company:${companyId}:agents`;
    socket.join(room);
    childLogger.debug({ socketId: socket.id, room }, 'Joined agents room');
  });

  socket.on('join:supervisors', () => {
    if (role === 'supervisor' || role === 'manager' || role === 'admin') {
      const room = `company:${companyId}:supervisors`;
      socket.join(room);
      childLogger.debug({ socketId: socket.id, room }, 'Joined supervisors room');
    } else {
      socket.emit('error', { message: 'Insufficient permissions for supervisors room' });
    }
  });

  socket.on('leave:agents', () => {
    const room = `company:${companyId}:agents`;
    socket.leave(room);
    childLogger.debug({ socketId: socket.id, room }, 'Left agents room');
  });

  socket.on('leave:supervisors', () => {
    const room = `company:${companyId}:supervisors`;
    socket.leave(room);
    childLogger.debug({ socketId: socket.id, room }, 'Left supervisors room');
  });

  socket.on('disconnect', (reason) => {
    childLogger.debug({ socketId: socket.id, reason }, 'Socket disconnected');
  });

  socket.on('error', (error) => {
    childLogger.error({ socketId: socket.id, error }, 'Socket error');
  });
}

/**
 * Initialize Socket.IO server
 */
export function initializeSockets(httpServer: HTTPServer): SocketIOServer {
  // Determine allowed origins
  const allowedOrigins =
    env.NODE_ENV === 'development'
      ? ['http://localhost:3000', 'http://localhost:5173', 'http://127.0.0.1:5173']
      : [env.SERVER_URL];

  io = new SocketIOServer(httpServer, {
    cors: {
      origin: allowedOrigins,
      credentials: true,
    },
    path: '/socket.io',
    pingTimeout: 60000,
    pingInterval: 25000,
  });

  // Authentication middleware
  io.use(authMiddleware);

  // Connection handler
  io.on('connection', handleConnection);

  // Initialize socket modules
  initEscalationSocket(io);
  initSentimentSocket(io);
  initActivitySocket(io);
  startLiveCountsEmitter(io);

  childLogger.info('Socket.IO server initialized');

  return io;
}

/**
 * Get the Socket.IO instance
 */
export function getIO(): SocketIOServer | null {
  return io;
}

/**
 * Cleanup socket resources
 */
export function cleanupSockets(): void {
  stopLiveCountsEmitter();
  cleanupEscalationSocket();

  if (io) {
    io.close();
    io = null;
  }

  childLogger.info('Socket.IO server closed');
}

/**
 * Emit to a specific company room
 */
export function emitToCompany(companyId: string, event: string, data: unknown): void {
  if (io) {
    io.to(`company:${companyId}`).emit(event, data);
  }
}

/**
 * Emit to agents room
 */
export function emitToAgents(companyId: string, event: string, data: unknown): void {
  if (io) {
    io.to(`company:${companyId}:agents`).emit(event, data);
  }
}

/**
 * Emit to supervisors room
 */
export function emitToSupervisors(companyId: string, event: string, data: unknown): void {
  if (io) {
    io.to(`company:${companyId}:supervisors`).emit(event, data);
  }
}

export { io };
