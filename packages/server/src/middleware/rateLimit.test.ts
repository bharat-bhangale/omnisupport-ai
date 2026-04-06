/**
 * Rate Limiter Middleware Tests
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock Redis before importing the module
vi.mock('../config/redis.js', () => ({
  redis: {
    pipeline: vi.fn().mockReturnValue({
      zremrangebyscore: vi.fn().mockReturnThis(),
      zcard: vi.fn().mockReturnThis(),
      zadd: vi.fn().mockReturnThis(),
      expire: vi.fn().mockReturnThis(),
      exec: vi.fn().mockResolvedValue([
        [null, 0], // zremrangebyscore result
        [null, 5], // zcard result (current count)
        [null, 1], // zadd result
        [null, 1], // expire result
      ]),
    }),
  },
}));

// Mock logger
vi.mock('../config/logger.js', () => ({
  logger: {
    child: vi.fn().mockReturnValue({
      warn: vi.fn(),
      error: vi.fn(),
      debug: vi.fn(),
    }),
  },
}));

// Now import the module
import { createRateLimiter, RATE_LIMITS } from './rateLimit.js';

describe('Rate Limiter', () => {
  describe('createRateLimiter', () => {
    it('should create a rate limiter with default config', () => {
      const limiter = createRateLimiter(RATE_LIMITS.standard);
      expect(typeof limiter).toBe('function');
    });

    it('should allow requests under the limit', async () => {
      const limiter = createRateLimiter({
        maxRequests: 10,
        windowSeconds: 60,
        keyPrefix: 'test',
      });

      const req = {
        ip: '127.0.0.1',
        path: '/test',
        headers: {},
      } as any;

      const res = {
        setHeader: vi.fn(),
        status: vi.fn().mockReturnThis(),
        json: vi.fn(),
      } as any;

      const next = vi.fn();

      await limiter(req, res, next);

      expect(next).toHaveBeenCalled();
      expect(res.status).not.toHaveBeenCalled();
    });

    it('should set rate limit headers', async () => {
      const limiter = createRateLimiter({
        maxRequests: 100,
        windowSeconds: 60,
        keyPrefix: 'test',
        headers: true,
      });

      const req = {
        ip: '127.0.0.1',
        path: '/test',
        headers: {},
      } as any;

      const res = {
        setHeader: vi.fn(),
        status: vi.fn().mockReturnThis(),
        json: vi.fn(),
      } as any;

      const next = vi.fn();

      await limiter(req, res, next);

      expect(res.setHeader).toHaveBeenCalledWith('X-RateLimit-Limit', 100);
      expect(res.setHeader).toHaveBeenCalledWith(
        'X-RateLimit-Remaining',
        expect.any(Number)
      );
      expect(res.setHeader).toHaveBeenCalledWith(
        'X-RateLimit-Reset',
        expect.any(Number)
      );
    });

    it('should skip rate limiting when skip function returns true', async () => {
      const limiter = createRateLimiter({
        maxRequests: 1,
        windowSeconds: 60,
        keyPrefix: 'test',
        skip: (req) => req.path === '/health',
      });

      const req = {
        ip: '127.0.0.1',
        path: '/health',
        headers: {},
      } as any;

      const res = {
        setHeader: vi.fn(),
        status: vi.fn().mockReturnThis(),
        json: vi.fn(),
      } as any;

      const next = vi.fn();

      await limiter(req, res, next);

      expect(next).toHaveBeenCalled();
    });

    it('should use custom key generator', async () => {
      const customKeyGen = vi.fn().mockReturnValue('custom-key');

      const limiter = createRateLimiter({
        maxRequests: 100,
        windowSeconds: 60,
        keyPrefix: 'test',
        keyGenerator: customKeyGen,
      });

      const req = {
        ip: '127.0.0.1',
        path: '/test',
        headers: {},
      } as any;

      const res = {
        setHeader: vi.fn(),
        status: vi.fn().mockReturnThis(),
        json: vi.fn(),
      } as any;

      const next = vi.fn();

      await limiter(req, res, next);

      expect(customKeyGen).toHaveBeenCalledWith(req);
    });
  });

  describe('RATE_LIMITS presets', () => {
    it('should have standard preset with 100 requests per minute', () => {
      expect(RATE_LIMITS.standard.maxRequests).toBe(100);
      expect(RATE_LIMITS.standard.windowSeconds).toBe(60);
    });

    it('should have auth preset with 10 requests per minute', () => {
      expect(RATE_LIMITS.auth.maxRequests).toBe(10);
      expect(RATE_LIMITS.auth.windowSeconds).toBe(60);
    });

    it('should have webhook preset with 1000 requests per minute', () => {
      expect(RATE_LIMITS.webhook.maxRequests).toBe(1000);
      expect(RATE_LIMITS.webhook.windowSeconds).toBe(60);
    });

    it('should have ai preset with 20 requests per minute', () => {
      expect(RATE_LIMITS.ai.maxRequests).toBe(20);
      expect(RATE_LIMITS.ai.windowSeconds).toBe(60);
    });
  });
});
