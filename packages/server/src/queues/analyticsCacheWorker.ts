import { Worker, Queue, Job } from 'bullmq';
import { env } from '../config/env.js';
import { logger } from '../config/logger.js';
import { Company } from '../models/Company.js';
import * as analyticsService from '../services/analytics.js';
import Redis from 'ioredis';

const childLogger = logger.child({ worker: 'analytics-cache' });

// Cache TTL: 24 hours
const CACHE_TTL = 86400;

// Parse Redis connection
const redisUrl = new URL(env.UPSTASH_REDIS_URL);
const redis = new Redis({
  host: redisUrl.hostname,
  port: parseInt(redisUrl.port || '6379', 10),
  password: env.UPSTASH_REDIS_TOKEN,
  tls: {},
  maxRetriesPerRequest: null,
});

const connectionOptions = {
  host: redisUrl.hostname,
  port: parseInt(redisUrl.port || '6379', 10),
  password: env.UPSTASH_REDIS_TOKEN,
  tls: {},
  maxRetriesPerRequest: null,
};

// Queue for analytics cache jobs
export const analyticsCacheQueue = new Queue('analytics-cache', {
  connection: connectionOptions,
  defaultJobOptions: {
    attempts: 3,
    backoff: {
      type: 'exponential',
      delay: 2000,
    },
    removeOnComplete: { count: 100 },
    removeOnFail: { count: 500 },
  },
});

interface AnalyticsCacheJobData {
  companyId: string;
  days: number;
}

interface CachedAnalytics {
  summary: analyticsService.AnalyticsSummary;
  resolutionRate: analyticsService.DailyResolutionRate[];
  ticketVolume: analyticsService.DailyTicketVolume[];
  costSavings: analyticsService.CostSavings;
  topIntents: analyticsService.TopIntent[];
  sentimentTrend: analyticsService.SentimentTrend[];
  slaCompliance: analyticsService.SLACompliance;
  kbHealth: analyticsService.KBHealth;
  channelDistribution: { channel: string; count: number }[];
  cachedAt: string;
}

/**
 * Generate cache key for analytics
 */
function getCacheKey(companyId: string, days: number): string {
  return `${companyId}:analytics:${days}d`;
}

/**
 * Get cached analytics from Redis
 */
export async function getCachedAnalytics(
  companyId: string,
  days: number
): Promise<CachedAnalytics | null> {
  try {
    const key = getCacheKey(companyId, days);
    const cached = await redis.get(key);
    if (cached) {
      return JSON.parse(cached) as CachedAnalytics;
    }
    return null;
  } catch (error) {
    childLogger.error({ error, companyId, days }, 'Failed to get cached analytics');
    return null;
  }
}

/**
 * Store analytics in Redis cache
 */
export async function setCachedAnalytics(
  companyId: string,
  days: number,
  data: CachedAnalytics
): Promise<void> {
  try {
    const key = getCacheKey(companyId, days);
    await redis.setex(key, CACHE_TTL, JSON.stringify(data));
    childLogger.debug({ companyId, days }, 'Analytics cached');
  } catch (error) {
    childLogger.error({ error, companyId, days }, 'Failed to cache analytics');
  }
}

/**
 * Compute all analytics for a company
 */
async function computeAnalytics(companyId: string, days: number): Promise<CachedAnalytics> {
  const [
    summary,
    resolutionRate,
    ticketVolume,
    costSavings,
    topIntents,
    sentimentTrend,
    slaCompliance,
    kbHealth,
    channelDistribution,
  ] = await Promise.all([
    analyticsService.getAnalyticsSummary(companyId, days),
    analyticsService.getDailyResolutionRate(companyId, days),
    analyticsService.getDailyTicketVolume(companyId, days),
    analyticsService.getCostSavings(companyId, days),
    analyticsService.getTopIntents(companyId, days),
    analyticsService.getSentimentTrend(companyId, days),
    analyticsService.getSLACompliance(companyId, days),
    analyticsService.getKBHitRate(companyId, days),
    analyticsService.getChannelDistribution(companyId, days),
  ]);

  return {
    summary,
    resolutionRate,
    ticketVolume,
    costSavings,
    topIntents,
    sentimentTrend,
    slaCompliance,
    kbHealth,
    channelDistribution,
    cachedAt: new Date().toISOString(),
  };
}

/**
 * Get analytics (from cache or compute)
 */
export async function getAnalytics(companyId: string, days: number): Promise<CachedAnalytics> {
  // Try cache first
  const cached = await getCachedAnalytics(companyId, days);
  if (cached) {
    childLogger.debug({ companyId, days }, 'Analytics cache hit');
    return cached;
  }

  // Compute and cache
  childLogger.debug({ companyId, days }, 'Analytics cache miss, computing...');
  const data = await computeAnalytics(companyId, days);
  await setCachedAnalytics(companyId, days, data);
  return data;
}

// Worker to process cache refresh jobs
const worker = new Worker<AnalyticsCacheJobData>(
  'analytics-cache',
  async (job: Job<AnalyticsCacheJobData>) => {
    const { companyId, days } = job.data;
    childLogger.info({ companyId, days, jobId: job.id }, 'Processing analytics cache job');

    try {
      const data = await computeAnalytics(companyId, days);
      await setCachedAnalytics(companyId, days, data);
      childLogger.info({ companyId, days }, 'Analytics cache refreshed');
      return { success: true, cachedAt: data.cachedAt };
    } catch (error) {
      childLogger.error({ error, companyId, days }, 'Failed to refresh analytics cache');
      throw error;
    }
  },
  {
    connection: connectionOptions,
    concurrency: 3,
  }
);

worker.on('completed', (job) => {
  childLogger.debug({ jobId: job.id }, 'Analytics cache job completed');
});

worker.on('failed', (job, error) => {
  childLogger.error({ jobId: job?.id, error: error.message }, 'Analytics cache job failed');
});

/**
 * Schedule daily cache refresh at midnight UTC
 */
export async function scheduleDailyCacheRefresh(): Promise<void> {
  // Get all active companies
  const companies = await Company.find({ isActive: { $ne: false } }).select('_id').lean();

  childLogger.info({ companyCount: companies.length }, 'Scheduling daily analytics cache refresh');

  for (const company of companies) {
    const companyId = company._id.toString();

    // Queue cache refresh for 7, 30, and 90 day periods
    for (const days of [7, 30, 90]) {
      await analyticsCacheQueue.add(
        `refresh-${companyId}-${days}d`,
        { companyId, days },
        {
          jobId: `${companyId}:${days}d:${Date.now()}`,
        }
      );
    }
  }
}

/**
 * Set up cron-like scheduling for midnight UTC refresh
 */
export function setupAnalyticsCron(): void {
  // Calculate ms until next midnight UTC
  const now = new Date();
  const nextMidnight = new Date(now);
  nextMidnight.setUTCHours(24, 0, 0, 0);
  const msUntilMidnight = nextMidnight.getTime() - now.getTime();

  childLogger.info(
    { msUntilMidnight, nextRefresh: nextMidnight.toISOString() },
    'Scheduling analytics cache cron'
  );

  // Schedule first run at midnight
  setTimeout(() => {
    scheduleDailyCacheRefresh();

    // Then repeat every 24 hours
    setInterval(scheduleDailyCacheRefresh, 24 * 60 * 60 * 1000);
  }, msUntilMidnight);
}

export { worker as analyticsCacheWorker };
