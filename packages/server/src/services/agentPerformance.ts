import { redis, buildRedisKey } from '../config/redis.js';
import { REDIS_TTL } from '../config/constants.js';
import { Ticket } from '../models/Ticket.js';
import { logger } from '../config/logger.js';
import mongoose from 'mongoose';

const childLogger = logger.child({ service: 'agent-performance' });

// Redis key helpers
function qaScoresKey(companyId: string, agentId: string): string {
  return buildRedisKey(companyId, 'agent', agentId, 'qa', 'scores');
}

function metricsKey(companyId: string, agentId: string): string {
  return buildRedisKey(companyId, 'agent', agentId, 'metrics');
}

function agentSetKey(companyId: string): string {
  return buildRedisKey(companyId, 'agent', 'set');
}

export interface AgentMetrics {
  agentId: string;
  avgQA: number;
  ticketsHandled: number;
  aiDraftUseRate: number;
}

export interface LeaderboardEntry extends AgentMetrics {
  rank: number;
}

/**
 * Update agent performance metrics after a QA score is calculated.
 * Maintains rolling 30-day metrics per agent in Redis.
 */
export async function updateAgentMetrics(
  agentId: string,
  companyId: string,
  qaScore: number,
  interactionId: string,
  channel: 'voice' | 'text'
): Promise<void> {
  if (!agentId) {
    childLogger.debug({ companyId, interactionId }, 'No agentId — skipping agent metrics update');
    return;
  }

  try {
    const scoresListKey = qaScoresKey(companyId, agentId);
    const metricsHashKey = metricsKey(companyId, agentId);
    const agentTrackerKey = agentSetKey(companyId);

    // 1. Push QA score to rolling list and cap at 100 entries
    await redis.lpush(scoresListKey, qaScore.toString());
    await redis.ltrim(scoresListKey, 0, 99);
    await redis.expire(scoresListKey, REDIS_TTL.AGENT_METRICS);

    // 2. Calculate average QA score from the list
    const allScores = await redis.lrange(scoresListKey, 0, -1);
    const numericScores = allScores.map(Number);
    const avgQA =
      numericScores.length > 0
        ? Math.round((numericScores.reduce((sum: number, s: number) => sum + s, 0) / numericScores.length) * 10) / 10
        : 0;

    // 3. Increment tickets handled
    await redis.hincrby(metricsHashKey, 'ticketsHandled', 1);

    // 4. Calculate AI draft use rate (only for text channel)
    let aiDraftUseRate = 0;
    if (channel === 'text') {
      const companyObjectId = new mongoose.Types.ObjectId(companyId);
      const [totalTickets, approvedDrafts] = await Promise.all([
        Ticket.countDocuments({ companyId: companyObjectId, assignedTo: agentId }),
        Ticket.countDocuments({
          companyId: companyObjectId,
          assignedTo: agentId,
          'aiDraft.approved': true,
        }),
      ]);
      aiDraftUseRate = totalTickets > 0 ? Math.round((approvedDrafts / totalTickets) * 100) : 0;
    } else {
      // Preserve existing rate for voice-channel updates
      const existing = await redis.hget(metricsHashKey, 'aiDraftUseRate');
      aiDraftUseRate = existing ? parseFloat(existing) : 0;
    }

    // 5. Update metrics hash
    await redis.hset(metricsHashKey, {
      avgQA: avgQA.toString(),
      aiDraftUseRate: aiDraftUseRate.toString(),
    });
    await redis.expire(metricsHashKey, REDIS_TTL.AGENT_METRICS);

    // 6. Track agent in the company's agent set
    await redis.sadd(agentTrackerKey, agentId);
    await redis.expire(agentTrackerKey, REDIS_TTL.AGENT_METRICS);

    childLogger.info(
      { agentId, companyId, avgQA, qaScore },
      'Agent metrics updated'
    );
  } catch (error) {
    childLogger.error(
      { error, agentId, companyId },
      'Failed to update agent metrics'
    );
    // Non-fatal — don't throw, let the QA pipeline continue
  }
}

/**
 * Get metrics for a single agent
 */
export async function getAgentMetrics(
  agentId: string,
  companyId: string
): Promise<AgentMetrics | null> {
  const metricsHashKey = metricsKey(companyId, agentId);
  const data = await redis.hgetall(metricsHashKey);

  if (!data || Object.keys(data).length === 0) {
    return null;
  }

  return {
    agentId,
    avgQA: parseFloat(data.avgQA || '0'),
    ticketsHandled: parseInt(data.ticketsHandled || '0', 10),
    aiDraftUseRate: parseFloat(data.aiDraftUseRate || '0'),
  };
}

/**
 * Get agent leaderboard for a company, sorted by average QA score descending.
 */
export async function getAgentLeaderboard(
  companyId: string
): Promise<LeaderboardEntry[]> {
  const agentTrackerKey = agentSetKey(companyId);
  const agentIds = await redis.smembers(agentTrackerKey);

  if (!agentIds || agentIds.length === 0) {
    return [];
  }

  // Fetch metrics for all tracked agents
  const metricsPromises = agentIds.map(async (agentId: string) => {
    const data = await getAgentMetrics(agentId, companyId);
    return data;
  });

  const allMetrics = await Promise.all(metricsPromises);
  const validMetrics = allMetrics.filter((m): m is AgentMetrics => m !== null);

  // Sort by avgQA descending
  validMetrics.sort((a: AgentMetrics, b: AgentMetrics) => b.avgQA - a.avgQA);

  // Add rank
  return validMetrics.map((m: AgentMetrics, index: number) => ({
    ...m,
    rank: index + 1,
  }));
}
