import type { Request, Response, NextFunction } from 'express';
import { redis } from '../config/redis.js';
import { logger } from '../config/logger.js';
import { AppError } from './AppError.js';

const childLogger = logger.child({ middleware: 'rateLimit' });

/**
 * Rate limit configuration
 */
interface RateLimitConfig {
  /** Maximum number of requests allowed in the window */
  maxRequests: number;
  /** Time window in seconds */
  windowSeconds: number;
  /** Key prefix for Redis storage */
  keyPrefix?: string;
  /** Custom key generator function */
  keyGenerator?: (req: Request) => string;
  /** Whether to skip rate limiting for certain requests */
  skip?: (req: Request) => boolean;
  /** Custom message when rate limit is exceeded */
  message?: string;
  /** Whether to add rate limit headers to response */
  headers?: boolean;
}

/**
 * Default rate limit configurations for different use cases
 */
export const RATE_LIMITS = {
  /** Standard API rate limit: 100 requests per minute */
  standard: {
    maxRequests: 100,
    windowSeconds: 60,
    keyPrefix: 'rl:std',
  },
  /** Auth endpoints: 10 requests per minute (stricter to prevent brute force) */
  auth: {
    maxRequests: 10,
    windowSeconds: 60,
    keyPrefix: 'rl:auth',
  },
  /** Sensitive operations: 5 requests per minute */
  sensitive: {
    maxRequests: 5,
    windowSeconds: 60,
    keyPrefix: 'rl:sens',
  },
  /** Webhooks: 1000 requests per minute (high volume allowed) */
  webhook: {
    maxRequests: 1000,
    windowSeconds: 60,
    keyPrefix: 'rl:webhook',
  },
  /** AI/LLM endpoints: 20 requests per minute (expensive operations) */
  ai: {
    maxRequests: 20,
    windowSeconds: 60,
    keyPrefix: 'rl:ai',
  },
} as const;

/**
 * Generate a unique key for rate limiting based on IP address
 */
function defaultKeyGenerator(req: Request): string {
  // Use X-Forwarded-For if behind a proxy, otherwise use IP
  const forwarded = req.headers['x-forwarded-for'];
  const ip = typeof forwarded === 'string'
    ? forwarded.split(',')[0].trim()
    : req.ip || req.socket.remoteAddress || 'unknown';
  
  return ip;
}

/**
 * Generate a key for authenticated user rate limiting
 */
export function userKeyGenerator(req: Request): string {
  const user = (req as AuthenticatedRequest).user;
  if (user?.sub) {
    return `user:${user.sub}`;
  }
  // Fall back to IP if no user
  return defaultKeyGenerator(req);
}

/**
 * Generate a key for company-scoped rate limiting
 */
export function companyKeyGenerator(req: Request): string {
  const user = (req as AuthenticatedRequest).user;
  if (user?.companyId) {
    return `company:${user.companyId}`;
  }
  // Fall back to IP if no company
  return defaultKeyGenerator(req);
}

// Type for authenticated request
interface AuthenticatedRequest extends Request {
  user?: {
    sub: string;
    companyId: string;
    role: string;
  };
}

/**
 * Create a rate limiting middleware using Redis sliding window algorithm
 * 
 * Uses a sliding window counter stored in Redis for accurate rate limiting
 * across distributed systems.
 */
export function createRateLimiter(config: RateLimitConfig) {
  const {
    maxRequests,
    windowSeconds,
    keyPrefix = 'rl',
    keyGenerator = defaultKeyGenerator,
    skip,
    message = 'Too many requests, please try again later',
    headers = true,
  } = config;

  return async function rateLimitMiddleware(
    req: Request,
    res: Response,
    next: NextFunction
  ): Promise<void> {
    // Skip rate limiting if configured
    if (skip && skip(req)) {
      next();
      return;
    }

    const identifier = keyGenerator(req);
    const key = `${keyPrefix}:${identifier}`;
    const now = Date.now();
    const windowStart = now - (windowSeconds * 1000);

    try {
      // Use Redis sorted set for sliding window
      // Score is timestamp, member is unique request identifier
      const pipeline = redis.pipeline();
      
      // Remove old entries outside the window
      pipeline.zremrangebyscore(key, 0, windowStart);
      
      // Count current requests in window
      pipeline.zcard(key);
      
      // Add current request
      pipeline.zadd(key, now, `${now}:${Math.random()}`);
      
      // Set expiry on the key
      pipeline.expire(key, windowSeconds);
      
      const results = await pipeline.exec();
      
      if (!results) {
        childLogger.error('Redis pipeline returned null');
        next();
        return;
      }

      // Get the count before adding current request
      const countResult = results[1];
      const currentCount = countResult && countResult[1] !== null 
        ? (countResult[1] as number) 
        : 0;

      // Calculate remaining requests
      const remaining = Math.max(0, maxRequests - currentCount - 1);
      const resetTime = Math.ceil((now + (windowSeconds * 1000)) / 1000);

      // Set rate limit headers
      if (headers) {
        res.setHeader('X-RateLimit-Limit', maxRequests);
        res.setHeader('X-RateLimit-Remaining', remaining);
        res.setHeader('X-RateLimit-Reset', resetTime);
      }

      // Check if rate limit exceeded
      if (currentCount >= maxRequests) {
        const retryAfter = windowSeconds;
        
        if (headers) {
          res.setHeader('Retry-After', retryAfter);
        }

        childLogger.warn({
          key,
          identifier,
          currentCount,
          maxRequests,
          path: req.path,
        }, 'Rate limit exceeded');

        res.status(429).json({
          error: 'Too Many Requests',
          message,
          retryAfter,
        });
        return;
      }

      next();
    } catch (error) {
      // Log error but don't block request if Redis fails
      childLogger.error({ error, key }, 'Rate limiting error');
      next();
    }
  };
}

/**
 * Create standard API rate limiter
 * 100 requests per minute per IP
 */
export const standardRateLimit = createRateLimiter(RATE_LIMITS.standard);

/**
 * Create auth endpoint rate limiter
 * 10 requests per minute per IP (prevents brute force attacks)
 */
export const authRateLimit = createRateLimiter({
  ...RATE_LIMITS.auth,
  message: 'Too many authentication attempts. Please wait before trying again.',
});

/**
 * Create webhook rate limiter
 * 1000 requests per minute (high volume for integrations)
 */
export const webhookRateLimit = createRateLimiter(RATE_LIMITS.webhook);

/**
 * Create AI/LLM endpoint rate limiter
 * 20 requests per minute per user (expensive operations)
 */
export const aiRateLimit = createRateLimiter({
  ...RATE_LIMITS.ai,
  keyGenerator: userKeyGenerator,
  message: 'AI request limit reached. Please wait before generating more content.',
});

/**
 * Create sensitive operation rate limiter
 * 5 requests per minute per user (password changes, deletions, etc.)
 */
export const sensitiveRateLimit = createRateLimiter({
  ...RATE_LIMITS.sensitive,
  keyGenerator: userKeyGenerator,
  message: 'Too many sensitive operations. Please wait before trying again.',
});

/**
 * Create company-scoped rate limiter
 * Useful for limiting API usage per organization
 */
export function createCompanyRateLimit(config: Omit<RateLimitConfig, 'keyGenerator'>) {
  return createRateLimiter({
    ...config,
    keyGenerator: companyKeyGenerator,
  });
}

export default createRateLimiter;
