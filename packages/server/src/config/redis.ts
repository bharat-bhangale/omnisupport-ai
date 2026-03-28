import Redis from 'ioredis';
import { env } from './env.js';
import { logger } from './logger.js';

// Parse Upstash Redis URL to extract host and port
const redisUrl = new URL(env.UPSTASH_REDIS_URL);

export const redis = new Redis({
  host: redisUrl.hostname,
  port: parseInt(redisUrl.port || '6379', 10),
  password: env.UPSTASH_REDIS_TOKEN,
  tls: {
    rejectUnauthorized: false,
  },
  maxRetriesPerRequest: 3,
  retryStrategy: (times: number) => {
    if (times > 3) {
      logger.error('Redis connection failed after 3 retries');
      return null;
    }
    return Math.min(times * 200, 2000);
  },
  lazyConnect: true,
});

redis.on('connect', () => {
  logger.info('Redis connected');
});

redis.on('error', (error) => {
  logger.error({ error }, 'Redis connection error');
});

redis.on('close', () => {
  logger.warn('Redis connection closed');
});

/**
 * Connect to Redis
 */
export async function connectRedis(): Promise<void> {
  try {
    await redis.connect();
    logger.info('Redis connection established');
  } catch (error) {
    logger.error({ error }, 'Failed to connect to Redis');
    throw error;
  }
}

/**
 * Disconnect from Redis
 */
export async function disconnectRedis(): Promise<void> {
  await redis.quit();
  logger.info('Redis disconnected');
}

/**
 * Build a Redis key with company prefix
 */
export function buildRedisKey(companyId: string, ...parts: string[]): string {
  return `${companyId}:${parts.join(':')}`;
}
