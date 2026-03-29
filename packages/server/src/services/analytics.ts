import mongoose from 'mongoose';
import { CallSession } from '../models/CallSession.js';
import { Ticket } from '../models/Ticket.js';
import { KBGap } from '../models/KBDocument.js';
import { logger } from '../config/logger.js';

const childLogger = logger.child({ service: 'analytics' });

// Cost constants
const COST_SAVINGS = {
  AI_CALL_VS_HUMAN: 11.56,
  AI_TICKET_VS_MANUAL: 12.22,
};

export interface DailyResolutionRate {
  date: string;
  totalCalls: number;
  resolvedByAI: number;
  escalated: number;
  resolutionRate: number;
}

export interface DailyTicketVolume {
  date: string;
  category: string;
  count: number;
}

export interface CostSavings {
  callSavings: number;
  ticketSavings: number;
  total: number;
  callCount: number;
  ticketCount: number;
}

export interface TopIntent {
  intent: string;
  count: number;
  resolutionRate: number;
}

export interface SentimentTrend {
  date: string;
  avgScore: number;
  voiceAvg: number;
  textAvg: number;
}

export interface SLACompliance {
  P1: { total: number; breached: number; rate: number };
  P2: { total: number; breached: number; rate: number };
  P3: { total: number; breached: number; rate: number };
  P4: { total: number; breached: number; rate: number };
}

export interface KBHealth {
  totalQueries: number;
  unanswered: number;
  hitRate: number;
}

export interface AnalyticsSummary {
  aiResolutionRate: number;
  totalInteractions: number;
  costSaved: number;
  avgHandleTime: number;
  callCount: number;
  ticketCount: number;
  escalationCount: number;
}

function getDateRange(days: number): { startDate: Date; endDate: Date } {
  const endDate = new Date();
  const startDate = new Date(endDate.getTime() - days * 24 * 60 * 60 * 1000);
  startDate.setHours(0, 0, 0, 0);
  return { startDate, endDate };
}

/**
 * Get daily resolution rate for calls
 */
export async function getDailyResolutionRate(
  companyId: string,
  days: number
): Promise<DailyResolutionRate[]> {
  const { startDate, endDate } = getDateRange(days);
  const companyObjectId = new mongoose.Types.ObjectId(companyId);

  const pipeline = [
    {
      $match: {
        companyId: companyObjectId,
        startedAt: { $gte: startDate, $lte: endDate },
        status: { $in: ['completed', 'escalated'] },
      },
    },
    {
      $group: {
        _id: {
          date: { $dateToString: { format: '%Y-%m-%d', date: '$startedAt' } },
        },
        totalCalls: { $sum: 1 },
        resolvedByAI: {
          $sum: {
            $cond: [{ $eq: ['$status', 'completed'] }, 1, 0],
          },
        },
        escalated: {
          $sum: {
            $cond: [{ $eq: ['$status', 'escalated'] }, 1, 0],
          },
        },
      },
    },
    {
      $project: {
        _id: 0,
        date: '$_id.date',
        totalCalls: 1,
        resolvedByAI: 1,
        escalated: 1,
        resolutionRate: {
          $cond: [
            { $eq: ['$totalCalls', 0] },
            0,
            { $multiply: [{ $divide: ['$resolvedByAI', '$totalCalls'] }, 100] },
          ],
        },
      },
    },
    { $sort: { date: 1 as const } },
  ];

  const results = await CallSession.aggregate(pipeline);
  return results as DailyResolutionRate[];
}

/**
 * Get daily ticket volume by category
 */
export async function getDailyTicketVolume(
  companyId: string,
  days: number
): Promise<DailyTicketVolume[]> {
  const { startDate, endDate } = getDateRange(days);
  const companyObjectId = new mongoose.Types.ObjectId(companyId);

  const pipeline = [
    {
      $match: {
        companyId: companyObjectId,
        createdAt: { $gte: startDate, $lte: endDate },
      },
    },
    {
      $group: {
        _id: {
          date: { $dateToString: { format: '%Y-%m-%d', date: '$createdAt' } },
          category: { $ifNull: [{ $arrayElemAt: ['$classification.categories', 0] }, 'Uncategorized'] },
        },
        count: { $sum: 1 },
      },
    },
    {
      $project: {
        _id: 0,
        date: '$_id.date',
        category: '$_id.category',
        count: 1,
      },
    },
    { $sort: { date: 1 as const, category: 1 as const } },
  ];

  const results = await Ticket.aggregate(pipeline);
  return results as DailyTicketVolume[];
}

/**
 * Get cost savings from AI handling
 */
export async function getCostSavings(companyId: string, days: number): Promise<CostSavings> {
  const { startDate, endDate } = getDateRange(days);
  const companyObjectId = new mongoose.Types.ObjectId(companyId);

  const [callCount, ticketCount] = await Promise.all([
    CallSession.countDocuments({
      companyId: companyObjectId,
      startedAt: { $gte: startDate, $lte: endDate },
      status: 'completed',
    }),
    Ticket.countDocuments({
      companyId: companyObjectId,
      createdAt: { $gte: startDate, $lte: endDate },
      'aiDraft.approved': true,
    }),
  ]);

  const callSavings = callCount * COST_SAVINGS.AI_CALL_VS_HUMAN;
  const ticketSavings = ticketCount * COST_SAVINGS.AI_TICKET_VS_MANUAL;

  return {
    callSavings: Math.round(callSavings * 100) / 100,
    ticketSavings: Math.round(ticketSavings * 100) / 100,
    total: Math.round((callSavings + ticketSavings) * 100) / 100,
    callCount,
    ticketCount,
  };
}

/**
 * Get top intents from calls
 */
export async function getTopIntents(companyId: string, days: number): Promise<TopIntent[]> {
  const { startDate, endDate } = getDateRange(days);
  const companyObjectId = new mongoose.Types.ObjectId(companyId);

  const pipeline = [
    {
      $match: {
        companyId: companyObjectId,
        startedAt: { $gte: startDate, $lte: endDate },
        intent: { $exists: true, $ne: null },
      },
    },
    {
      $group: {
        _id: '$intent',
        count: { $sum: 1 },
        resolved: {
          $sum: {
            $cond: [{ $eq: ['$status', 'completed'] }, 1, 0],
          },
        },
      },
    },
    {
      $project: {
        _id: 0,
        intent: '$_id',
        count: 1,
        resolutionRate: {
          $cond: [
            { $eq: ['$count', 0] },
            0,
            { $multiply: [{ $divide: ['$resolved', '$count'] }, 100] },
          ],
        },
      },
    },
    { $sort: { count: -1 as const } },
    { $limit: 10 },
  ];

  const results = await CallSession.aggregate(pipeline);
  return results as TopIntent[];
}

/**
 * Get sentiment trend over time
 */
export async function getSentimentTrend(
  companyId: string,
  days: number
): Promise<SentimentTrend[]> {
  const { startDate, endDate } = getDateRange(days);
  const companyObjectId = new mongoose.Types.ObjectId(companyId);

  // Map sentiment to numeric scores
  const sentimentToScore = (sentiment: string): number => {
    switch (sentiment) {
      case 'positive':
        return 1;
      case 'neutral':
        return 0;
      case 'negative':
        return -1;
      default:
        return 0;
    }
  };

  // Get call sentiments
  const callPipeline = [
    {
      $match: {
        companyId: companyObjectId,
        startedAt: { $gte: startDate, $lte: endDate },
        'sentiment.overall': { $exists: true },
      },
    },
    {
      $group: {
        _id: { $dateToString: { format: '%Y-%m-%d', date: '$startedAt' } },
        avgScore: {
          $avg: {
            $switch: {
              branches: [
                { case: { $eq: ['$sentiment.overall', 'positive'] }, then: 1 },
                { case: { $eq: ['$sentiment.overall', 'neutral'] }, then: 0 },
                { case: { $eq: ['$sentiment.overall', 'negative'] }, then: -1 },
              ],
              default: 0,
            },
          },
        },
      },
    },
    { $sort: { _id: 1 as const } },
  ];

  // Get ticket sentiments
  const ticketPipeline = [
    {
      $match: {
        companyId: companyObjectId,
        createdAt: { $gte: startDate, $lte: endDate },
        sentiment: { $exists: true },
      },
    },
    {
      $group: {
        _id: { $dateToString: { format: '%Y-%m-%d', date: '$createdAt' } },
        avgScore: {
          $avg: {
            $switch: {
              branches: [
                { case: { $eq: ['$sentiment', 'positive'] }, then: 1 },
                { case: { $eq: ['$sentiment', 'neutral'] }, then: 0 },
                { case: { $eq: ['$sentiment', 'negative'] }, then: -1 },
              ],
              default: 0,
            },
          },
        },
      },
    },
    { $sort: { _id: 1 as const } },
  ];

  const [callResults, ticketResults] = await Promise.all([
    CallSession.aggregate(callPipeline),
    Ticket.aggregate(ticketPipeline),
  ]);

  // Merge results by date
  const dateMap = new Map<string, { voiceAvg: number; textAvg: number }>();

  for (const item of callResults) {
    const existing = dateMap.get(item._id) || { voiceAvg: 0, textAvg: 0 };
    existing.voiceAvg = item.avgScore;
    dateMap.set(item._id, existing);
  }

  for (const item of ticketResults) {
    const existing = dateMap.get(item._id) || { voiceAvg: 0, textAvg: 0 };
    existing.textAvg = item.avgScore;
    dateMap.set(item._id, existing);
  }

  const results: SentimentTrend[] = [];
  for (const [date, scores] of Array.from(dateMap.entries()).sort()) {
    const avgScore = (scores.voiceAvg + scores.textAvg) / 2;
    results.push({
      date,
      avgScore: Math.round(avgScore * 100) / 100,
      voiceAvg: Math.round(scores.voiceAvg * 100) / 100,
      textAvg: Math.round(scores.textAvg * 100) / 100,
    });
  }

  return results;
}

/**
 * Get SLA compliance by priority
 */
export async function getSLACompliance(companyId: string, days: number): Promise<SLACompliance> {
  const { startDate, endDate } = getDateRange(days);
  const companyObjectId = new mongoose.Types.ObjectId(companyId);

  const priorityMap: Record<string, 'P1' | 'P2' | 'P3' | 'P4'> = {
    urgent: 'P1',
    high: 'P2',
    normal: 'P3',
    low: 'P4',
  };

  const pipeline = [
    {
      $match: {
        companyId: companyObjectId,
        createdAt: { $gte: startDate, $lte: endDate },
        'sla.responseDeadline': { $exists: true },
      },
    },
    {
      $group: {
        _id: '$priority',
        total: { $sum: 1 },
        breached: {
          $sum: {
            $cond: [{ $eq: ['$sla.isBreached', true] }, 1, 0],
          },
        },
      },
    },
  ];

  const results = await Ticket.aggregate(pipeline);

  const compliance: SLACompliance = {
    P1: { total: 0, breached: 0, rate: 100 },
    P2: { total: 0, breached: 0, rate: 100 },
    P3: { total: 0, breached: 0, rate: 100 },
    P4: { total: 0, breached: 0, rate: 100 },
  };

  for (const item of results) {
    const priority = priorityMap[item._id] || 'P3';
    compliance[priority] = {
      total: item.total,
      breached: item.breached,
      rate: item.total > 0 ? Math.round(((item.total - item.breached) / item.total) * 100) : 100,
    };
  }

  return compliance;
}

/**
 * Get knowledge base hit rate
 */
export async function getKBHitRate(companyId: string, days: number): Promise<KBHealth> {
  const { startDate, endDate } = getDateRange(days);
  const companyObjectId = new mongoose.Types.ObjectId(companyId);

  // Count calls that used RAG (proxy for KB queries)
  const [totalWithRAG, unansweredGaps] = await Promise.all([
    // Count calls that had RAG context (successful KB hits)
    CallSession.countDocuments({
      companyId: companyObjectId,
      startedAt: { $gte: startDate, $lte: endDate },
    }),
    // Count KB gaps (unanswered queries)
    KBGap.countDocuments({
      companyId: companyObjectId,
      lastOccurredAt: { $gte: startDate, $lte: endDate },
      status: { $in: ['open', 'in_progress'] },
    }),
  ]);

  // Also count tickets with RAG context
  const ticketsWithRAG = await Ticket.countDocuments({
    companyId: companyObjectId,
    createdAt: { $gte: startDate, $lte: endDate },
    'ragContext.documentIds.0': { $exists: true },
  });

  // Estimate total queries as interactions + gaps
  const totalQueries = totalWithRAG + ticketsWithRAG + unansweredGaps;
  const answered = totalWithRAG + ticketsWithRAG;
  const hitRate = totalQueries > 0 ? Math.round((answered / totalQueries) * 100) : 100;

  return {
    totalQueries,
    unanswered: unansweredGaps,
    hitRate,
  };
}

/**
 * Get analytics summary
 */
export async function getAnalyticsSummary(
  companyId: string,
  days: number
): Promise<AnalyticsSummary> {
  const { startDate, endDate } = getDateRange(days);
  const companyObjectId = new mongoose.Types.ObjectId(companyId);

  const [callStats, ticketStats, escalationCount, costSavings, handleTime] = await Promise.all([
    // Call stats
    CallSession.aggregate([
      {
        $match: {
          companyId: companyObjectId,
          startedAt: { $gte: startDate, $lte: endDate },
        },
      },
      {
        $group: {
          _id: null,
          total: { $sum: 1 },
          resolved: {
            $sum: { $cond: [{ $eq: ['$status', 'completed'] }, 1, 0] },
          },
        },
      },
    ]),
    // Ticket stats
    Ticket.aggregate([
      {
        $match: {
          companyId: companyObjectId,
          createdAt: { $gte: startDate, $lte: endDate },
        },
      },
      {
        $group: {
          _id: null,
          total: { $sum: 1 },
          resolved: {
            $sum: { $cond: [{ $eq: ['$resolution.resolutionType', 'ai_resolved'] }, 1, 0] },
          },
        },
      },
    ]),
    // Escalation count
    CallSession.countDocuments({
      companyId: companyObjectId,
      startedAt: { $gte: startDate, $lte: endDate },
      status: 'escalated',
    }),
    // Cost savings
    getCostSavings(companyId, days),
    // Average handle time for completed calls
    CallSession.aggregate([
      {
        $match: {
          companyId: companyObjectId,
          startedAt: { $gte: startDate, $lte: endDate },
          status: 'completed',
          endedAt: { $exists: true },
        },
      },
      {
        $project: {
          duration: {
            $divide: [{ $subtract: ['$endedAt', '$startedAt'] }, 1000],
          },
        },
      },
      {
        $group: {
          _id: null,
          avgDuration: { $avg: '$duration' },
        },
      },
    ]),
  ]);

  const calls = callStats[0] || { total: 0, resolved: 0 };
  const tickets = ticketStats[0] || { total: 0, resolved: 0 };
  const totalInteractions = calls.total + tickets.total;
  const totalResolved = calls.resolved + tickets.resolved;
  const aiResolutionRate =
    totalInteractions > 0 ? Math.round((totalResolved / totalInteractions) * 100) : 0;
  const avgHandleTime = handleTime[0]?.avgDuration || 0;

  return {
    aiResolutionRate,
    totalInteractions,
    costSaved: costSavings.total,
    avgHandleTime: Math.round(avgHandleTime),
    callCount: calls.total,
    ticketCount: tickets.total,
    escalationCount,
  };
}

/**
 * Get channel distribution
 */
export async function getChannelDistribution(
  companyId: string,
  days: number
): Promise<{ channel: string; count: number }[]> {
  const { startDate, endDate } = getDateRange(days);
  const companyObjectId = new mongoose.Types.ObjectId(companyId);

  const [callCount, ticketsBySource] = await Promise.all([
    CallSession.countDocuments({
      companyId: companyObjectId,
      startedAt: { $gte: startDate, $lte: endDate },
    }),
    Ticket.aggregate([
      {
        $match: {
          companyId: companyObjectId,
          createdAt: { $gte: startDate, $lte: endDate },
        },
      },
      {
        $group: {
          _id: '$source',
          count: { $sum: 1 },
        },
      },
    ]),
  ]);

  const distribution: { channel: string; count: number }[] = [
    { channel: 'Voice', count: callCount },
  ];

  for (const item of ticketsBySource) {
    const channelName =
      item._id === 'email'
        ? 'Email'
        : item._id === 'zendesk' || item._id === 'freshdesk'
          ? 'Chat'
          : 'Other';

    const existing = distribution.find((d) => d.channel === channelName);
    if (existing) {
      existing.count += item.count;
    } else {
      distribution.push({ channel: channelName, count: item.count });
    }
  }

  return distribution;
}
