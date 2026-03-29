import { Request, Response, NextFunction, RequestHandler } from 'express';
import { auth, AuthResult } from 'express-oauth2-jwt-bearer';
import { AppError } from './AppError.js';
import { env } from '../config/env.js';
import { logger } from '../config/logger.js';

const childLogger = logger.child({ middleware: 'auth' });

/**
 * User context attached to authenticated requests
 */
export interface AuthUser {
  userId: string;
  companyId: string;
  role: 'agent' | 'manager' | 'admin';
  email?: string;
  name?: string;
}

/**
 * Extended request with user context
 */
export interface AuthRequest extends Request {
  user: AuthUser;
  auth?: AuthResult;
}

/**
 * Auth0 custom claims namespace
 */
const CLAIMS_NAMESPACE = 'https://omnisupport.ai';

/**
 * Auth0 JWT verification middleware
 */
const jwtCheck = auth({
  audience: env.AUTH0_AUDIENCE,
  issuerBaseURL: `https://${env.AUTH0_DOMAIN}`,
  tokenSigningAlg: 'RS256',
});

/**
 * Extract custom claims and attach to request
 */
function extractClaims(req: AuthRequest, _res: Response, next: NextFunction): void {
  try {
    const payload = req.auth?.payload;

    if (!payload) {
      throw AppError.unauthorized('Invalid token: missing payload');
    }

    // Extract standard claims
    const userId = payload.sub;
    if (!userId) {
      throw AppError.unauthorized('Invalid token: missing user ID');
    }

    // Extract custom claims from namespace
    const companyId = payload[`${CLAIMS_NAMESPACE}/company_id`] as string | undefined;
    const role = payload[`${CLAIMS_NAMESPACE}/role`] as string | undefined;
    const email = payload[`${CLAIMS_NAMESPACE}/email`] as string | undefined;
    const name = payload[`${CLAIMS_NAMESPACE}/name`] as string | undefined;

    // Validate required claims
    if (!companyId) {
      childLogger.warn({ userId }, 'Missing companyId claim');
      throw AppError.forbidden('Missing company context. Please contact support.');
    }

    if (!role || !['agent', 'manager', 'admin'].includes(role)) {
      childLogger.warn({ userId, role }, 'Invalid or missing role claim');
      throw AppError.forbidden('Invalid role assignment. Please contact support.');
    }

    // Attach user context to request
    req.user = {
      userId,
      companyId,
      role: role as 'agent' | 'manager' | 'admin',
      email,
      name,
    };

    childLogger.debug({ userId, companyId, role }, 'User authenticated');
    next();
  } catch (error) {
    if (error instanceof AppError) {
      next(error);
    } else {
      childLogger.error({ error }, 'Failed to extract claims');
      next(AppError.unauthorized('Authentication failed'));
    }
  }
}

/**
 * Combined auth middleware: JWT verification + claims extraction
 * Use this on all protected routes
 */
export const authMiddleware: RequestHandler[] = [
  // First verify the JWT
  (req: Request, res: Response, next: NextFunction) => {
    jwtCheck(req, res, (err) => {
      if (err) {
        childLogger.warn({ error: err.message }, 'JWT verification failed');
        return next(AppError.unauthorized('Invalid or expired token'));
      }
      next();
    });
  },
  // Then extract and validate claims
  extractClaims as RequestHandler,
];

/**
 * Optional auth middleware - doesn't fail if no token present
 * Useful for public endpoints that show extra info to authenticated users
 */
export const optionalAuthMiddleware: RequestHandler = (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    // No token provided, continue without auth
    return next();
  }

  // Token provided, verify it
  jwtCheck(req, res, (err) => {
    if (err) {
      // Invalid token, continue without auth (don't fail)
      childLogger.debug('Optional auth: invalid token, continuing unauthenticated');
      return next();
    }

    // Valid token, extract claims
    extractClaims(req as AuthRequest, res, next);
  });
};

/**
 * Type guard to check if request has authenticated user
 */
export function isAuthenticated(req: Request): req is AuthRequest {
  return !!(req as AuthRequest).user?.userId;
}

/**
 * Helper to get user from request (throws if not authenticated)
 */
export function getUser(req: Request): AuthUser {
  if (!isAuthenticated(req)) {
    throw AppError.unauthorized('Not authenticated');
  }
  return req.user;
}

/**
 * Helper to get companyId from request (throws if not authenticated)
 */
export function getCompanyId(req: Request): string {
  return getUser(req).companyId;
}
