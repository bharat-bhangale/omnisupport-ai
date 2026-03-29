import { Worker, Job } from 'bullmq';
import OpenAI from 'openai';
import { env } from '../config/env.js';
import { QUEUES, OPENAI_CONFIG } from '../config/constants.js';
import { logger } from '../config/logger.js';
import { Company } from '../models/Company.js';
import { FeedbackEvent, IFeedbackEvent } from '../models/FeedbackEvent.js';
import { KBGap, IKBGap } from '../models/KBDocument.js';
import { CallSession } from '../models/CallSession.js';
import { Ticket } from '../models/Ticket.js';
import { GapReport, IGapReport, GapCluster, FeedbackSummaryByType, ABResultSnapshot } from '../models/GapReport.js';
import { PromptVariant, calculateConfidence } from '../models/PromptVariant.js';
import { sendWeeklyLearningDigest } from '../services/slackNotifier.js';
import { learningQueue } from './index.js';

const childLogger = logger.child({ worker: 'learning' });

// Parse Upstash Redis URL for BullMQ connection
const redisUrl = new URL(env.UPSTASH_REDIS_URL);
const connection = {
  host: redisUrl.hostname,
  port: parseInt(redisUrl.port || '6379', 10),
  password: env.UPSTASH_REDIS_TOKEN,
  tls: {},
  maxRetriesPerRequest: null,
};

const openai = new OpenAI({ apiKey: env.OPENAI_API_KEY });

/**
 * Get Monday of current week
 */
function getCurrentWeekMonday(): Date {
  const now = new Date();
  const dayOfWeek = now.getUTCDay();
  const diff = dayOfWeek === 0 ? 6 : dayOfWeek - 1; // Monday = 0
  const monday = new Date(now);
  monday.setUTCDate(now.getUTCDate() - diff);
  monday.setUTCHours(0, 0, 0, 0);
  return monday;
}

/**
 * Get ISO week label (e.g., "2024-W12")
 */
function getWeekLabel(date: Date): string {
  const year = date.getUTCFullYear();
  const startOfYear = new Date(Date.UTC(year, 0, 1));
  const dayOfYear = Math.floor((date.getTime() - startOfYear.getTime()) / 86400000);
  const weekNum = Math.ceil((dayOfYear + startOfYear.getUTCDay() + 1) / 7);
  return `${year}-W${weekNum.toString().padStart(2, '0')}`;
}

/**
 * LOOP 1: Group feedback by issueType + channel, flag types with >5 occurrences
 */
async function analyzeFeedback(
  companyId: string,
  startDate: Date,
  endDate: Date
): Promise<{ byType: FeedbackSummaryByType[]; totalEvents: number; avgRating: number; flaggedTypes: string[] }> {
  const events = await FeedbackEvent.aggregate([
    {
      $match: {
        companyId: new (await import('mongoose')).default.Types.ObjectId(companyId),
        createdAt: { $gte: startDate, $lt: endDate },
      },
    },
    {
      $group: {
        _id: { issueType: '$issueType', channel: '$channel' },
        count: { $sum: 1 },
        avgRating: { $avg: '$rating' },
      },
    },
    { $sort: { count: -1 } },
  ]);

  const byType: FeedbackSummaryByType[] = events.map((e) => ({
    issueType: e._id.issueType || 'unspecified',
    channel: e._id.channel,
    count: e.count,
    avgRating: Math.round(e.avgRating * 10) / 10,
  }));

  const totalEvents = byType.reduce((sum, t) => sum + t.count, 0);
  const avgRating = totalEvents > 0
    ? byType.reduce((sum, t) => sum + t.avgRating * t.count, 0) / totalEvents
    : 0;

  // Flag types with >5 occurrences
  const flaggedTypes = byType
    .filter((t) => t.count > 5)
    .map((t) => `${t.issueType}:${t.channel}`);

  return { byType, totalEvents, avgRating: Math.round(avgRating * 10) / 10, flaggedTypes };
}

/**
 * LOOP 2: Find problem patterns
 */
async function findProblemPatterns(
  companyId: string,
  startDate: Date,
  endDate: Date
): Promise<{ escalatedCallsWithManyTurns: number; lowConfidenceTickets: number; regeneratedResponses: number }> {
  const mongoose = (await import('mongoose')).default;
  const companyOid = new mongoose.Types.ObjectId(companyId);

  // Escalated calls with >4 turns
  const escalatedCalls = await CallSession.countDocuments({
    companyId: companyOid,
    resolution: 'escalated',
    createdAt: { $gte: startDate, $lt: endDate },
    $expr: { $gt: [{ $size: '$turns' }, 4] },
  });

  // Low confidence tickets (<0.60) that agent regenerated
  const lowConfidenceTickets = await Ticket.countDocuments({
    companyId: companyOid,
    createdAt: { $gte: startDate, $lt: endDate },
    'classification.confidence': { $lt: 0.60 },
  });

  // Tickets where AI response was regenerated (check learning queue events)
  const regeneratedResponses = await FeedbackEvent.countDocuments({
    companyId: companyOid,
    createdAt: { $gte: startDate, $lt: endDate },
    agentEdited: true,
  });

  return { escalatedCallsWithManyTurns: escalatedCalls, lowConfidenceTickets, regeneratedResponses };
}

/**
 * LOOP 3: Fetch and cluster KB gaps using GPT-4o
 */
async function clusterKBGaps(
  companyId: string,
  startDate: Date,
  endDate: Date
): Promise<{ clusters: GapCluster[]; stats: { totalGaps: number; newGaps: number; resolvedGaps: number; topChannel: 'voice' | 'text' } }> {
  const mongoose = (await import('mongoose')).default;
  const companyOid = new mongoose.Types.ObjectId(companyId);

  // Get open gaps from this week
  const gaps = await KBGap.find({
    companyId: companyOid,
    lastOccurredAt: { $gte: startDate, $lt: endDate },
    status: { $in: ['open', 'in_progress'] },
  })
    .sort({ frequency: -1 })
    .limit(50)
    .lean();

  const newGaps = await KBGap.countDocuments({
    companyId: companyOid,
    firstOccurredAt: { $gte: startDate, $lt: endDate },
  });

  const resolvedGaps = await KBGap.countDocuments({
    companyId: companyOid,
    'resolution.resolvedAt': { $gte: startDate, $lt: endDate },
  });

  // Determine top channel
  const channelCounts = await KBGap.aggregate([
    {
      $match: {
        companyId: companyOid,
        lastOccurredAt: { $gte: startDate, $lt: endDate },
      },
    },
    {
      $group: {
        _id: '$channel',
        count: { $sum: '$frequency' },
      },
    },
    { $sort: { count: -1 } },
    { $limit: 1 },
  ]);

  const topChannel = channelCounts[0]?._id || 'voice';

  if (gaps.length === 0) {
    return {
      clusters: [],
      stats: { totalGaps: 0, newGaps, resolvedGaps, topChannel },
    };
  }

  // Use GPT-4o to cluster similar queries
  const queries = gaps.map((g) => ({ id: g._id.toString(), query: g.query, frequency: g.frequency }));

  const clusteringPrompt = `You are analyzing customer support queries that the knowledge base couldn't answer.
Group these queries into logical clusters (max 8 clusters).
Each cluster should have a descriptive name and contain related queries.

Queries:
${queries.map((q, i) => `${i + 1}. [freq=${q.frequency}] "${q.query}"`).join('\n')}

Respond with JSON array:
[
  {
    "cluster": "Cluster Name",
    "queryIds": [list of query numbers 1-indexed],
    "representativeQuery": "most common/clear query in cluster"
  }
]`;

  try {
    const response = await openai.chat.completions.create({
      model: OPENAI_CONFIG.MODEL_GPT4O,
      messages: [{ role: 'user', content: clusteringPrompt }],
      temperature: 0,
      response_format: { type: 'json_object' },
    });

    const content = response.choices[0]?.message?.content || '{"clusters":[]}';
    const parsed = JSON.parse(content);
    const rawClusters = parsed.clusters || parsed || [];

    const clusters: GapCluster[] = rawClusters.slice(0, 10).map((c: { cluster: string; queryIds: number[]; representativeQuery: string }) => {
      const clusterGaps = c.queryIds
        .map((i: number) => queries[i - 1])
        .filter(Boolean);
      
      return {
        cluster: c.cluster,
        query: c.representativeQuery || clusterGaps[0]?.query || 'Unknown',
        frequency: clusterGaps.reduce((sum: number, g: { frequency: number }) => sum + g.frequency, 0),
        gapIds: clusterGaps.map((g: { id: string }) => new mongoose.Types.ObjectId(g.id)),
      };
    });

    return {
      clusters: clusters.sort((a, b) => b.frequency - a.frequency),
      stats: { totalGaps: gaps.length, newGaps, resolvedGaps, topChannel },
    };
  } catch (error) {
    childLogger.error({ error, companyId }, 'Failed to cluster KB gaps');
    
    // Fallback: create individual clusters
    const clusters: GapCluster[] = gaps.slice(0, 10).map((g) => ({
      cluster: 'Unclustered',
      query: g.query,
      frequency: g.frequency,
      gapIds: [g._id as unknown as mongoose.Types.ObjectId],
    }));

    return {
      clusters,
      stats: { totalGaps: gaps.length, newGaps, resolvedGaps, topChannel },
    };
  }
}

/**
 * LOOP 4: Evaluate A/B tests and flag winners
 */
async function evaluateABTests(companyId: string): Promise<ABResultSnapshot[]> {
  const mongoose = (await import('mongoose')).default;
  const companyOid = new mongoose.Types.ObjectId(companyId);

  const runningTests = await PromptVariant.find({
    companyId: companyOid,
    status: 'running',
  }).lean();

  const results: ABResultSnapshot[] = [];

  for (const test of runningTests) {
    const confidence = calculateConfidence(
      test.variantA.resolutionRate,
      test.variantA.calls,
      test.variantB.resolutionRate,
      test.variantB.calls
    );

    const delta = Math.abs(test.variantA.resolutionRate - test.variantB.resolutionRate);
    let winner: 'A' | 'B' | undefined;

    // If delta > 5% and confidence >= 90%, flag winner
    if (delta > 5 && confidence >= 90) {
      winner = test.variantA.resolutionRate > test.variantB.resolutionRate ? 'A' : 'B';

      // Update the test status
      await PromptVariant.updateOne(
        { _id: test._id },
        {
          $set: {
            status: 'winner_identified',
            winner,
            winnerDelta: delta,
            confidenceLevel: confidence,
          },
        }
      );
    }

    results.push({
      testId: test._id,
      testName: test.name,
      variantA: {
        calls: test.variantA.calls,
        resolutionRate: test.variantA.resolutionRate,
      },
      variantB: {
        calls: test.variantB.calls,
        resolutionRate: test.variantB.resolutionRate,
      },
      winner,
      confidenceLevel: confidence,
    });
  }

  return results;
}

/**
 * Generate insights using GPT-4o
 */
async function generateInsights(report: Partial<IGapReport>): Promise<string> {
  const prompt = `Analyze this weekly support AI performance report and provide 2-3 actionable insights:

Feedback Summary:
- Total events: ${report.feedbackSummary?.totalEvents || 0}
- Average rating: ${report.feedbackSummary?.avgRating || 0}/5
- Flagged issue types: ${report.feedbackSummary?.flaggedTypes?.join(', ') || 'none'}

Problem Patterns:
- Escalated calls (>4 turns): ${report.problemPatterns?.escalatedCallsWithManyTurns || 0}
- Low confidence tickets: ${report.problemPatterns?.lowConfidenceTickets || 0}
- Regenerated responses: ${report.problemPatterns?.regeneratedResponses || 0}

KB Gaps:
- Total unanswered queries: ${report.gapStats?.totalGaps || 0}
- New gaps this week: ${report.gapStats?.newGaps || 0}
- Top clusters: ${report.topGaps?.slice(0, 3).map((g) => g.cluster).join(', ') || 'none'}

A/B Tests: ${report.abResults?.length || 0} running

Provide brief, actionable insights in 2-3 bullet points.`;

  try {
    const response = await openai.chat.completions.create({
      model: OPENAI_CONFIG.MODEL_GPT4O,
      messages: [{ role: 'user', content: prompt }],
      temperature: 0.3,
      max_tokens: 300,
    });

    return response.choices[0]?.message?.content || '';
  } catch (error) {
    childLogger.error({ error }, 'Failed to generate insights');
    return '';
  }
}

/**
 * Process weekly learning for a single company
 */
async function processCompanyLearning(companyId: string): Promise<void> {
  const weekMonday = getCurrentWeekMonday();
  const weekLabel = getWeekLabel(weekMonday);
  
  // Calculate date range (last 7 days)
  const endDate = new Date();
  const startDate = new Date(endDate);
  startDate.setDate(startDate.getDate() - 7);

  childLogger.info({ companyId, weekLabel, startDate, endDate }, 'Processing weekly learning');

  // Check if report already exists
  const existing = await GapReport.findOne({
    companyId,
    week: weekMonday,
  });

  if (existing && existing.status === 'completed') {
    childLogger.info({ companyId, weekLabel }, 'Weekly report already exists, skipping');
    return;
  }

  // Create or update report
  const mongoose = (await import('mongoose')).default;
  const report = existing || new GapReport({
    companyId: new mongoose.Types.ObjectId(companyId),
    week: weekMonday,
    weekLabel,
    status: 'processing',
  });

  try {
    // Run all analyses in parallel
    const [feedbackResult, problemPatterns, gapsResult, abResults] = await Promise.all([
      analyzeFeedback(companyId, startDate, endDate),
      findProblemPatterns(companyId, startDate, endDate),
      clusterKBGaps(companyId, startDate, endDate),
      evaluateABTests(companyId),
    ]);

    report.feedbackSummary = feedbackResult;
    report.problemPatterns = problemPatterns;
    report.topGaps = gapsResult.clusters;
    report.gapStats = gapsResult.stats;
    report.abResults = abResults;

    // Generate insights
    report.insights = await generateInsights(report);

    report.status = 'completed';
    report.processedAt = new Date();
    await report.save();

    // Send Slack notification
    const company = await Company.findById(companyId).lean();
    if (company) {
      await sendWeeklyLearningDigest(companyId, {
        weekStart: startDate.toISOString().split('T')[0],
        weekEnd: endDate.toISOString().split('T')[0],
        totalInteractions: feedbackResult.totalEvents,
        aiResolutionRate: 0, // Would need to calculate from CallSession
        avgSentiment: 0,
        topIssues: feedbackResult.byType.slice(0, 5).map((t) => ({
          issue: t.issueType,
          count: t.count,
        })),
        improvementSuggestions: report.insights?.split('\n').filter(Boolean) || [],
        notablePatterns: [],
      });
    }

    childLogger.info({ companyId, weekLabel }, 'Weekly learning report completed');
  } catch (error) {
    report.status = 'failed';
    report.errorMessage = error instanceof Error ? error.message : 'Unknown error';
    await report.save();
    throw error;
  }
}

/**
 * Weekly learning job processor
 */
async function processWeeklyLearning(job: Job): Promise<void> {
  const { companyId } = job.data;

  if (companyId) {
    // Process single company
    await processCompanyLearning(companyId);
  } else {
    // Process all active companies
    const companies = await Company.find({ tier: { $ne: 'starter' } })
      .select('_id')
      .lean();

    childLogger.info({ count: companies.length }, 'Processing weekly learning for all companies');

    for (const company of companies) {
      try {
        await processCompanyLearning(company._id.toString());
      } catch (error) {
        childLogger.error({ error, companyId: company._id }, 'Failed to process company learning');
      }
    }
  }
}

// Create the worker
export const learningWorker = new Worker(
  QUEUES.LEARNING,
  async (job: Job) => {
    const startTime = Date.now();
    childLogger.info({ jobId: job.id, jobName: job.name }, 'Processing learning job');

    try {
      switch (job.name) {
        case 'weekly-learning':
          await processWeeklyLearning(job);
          break;
        case 'company-learning':
          await processCompanyLearning(job.data.companyId);
          break;
        default:
          childLogger.warn({ jobName: job.name }, 'Unknown learning job type');
      }

      const duration = Date.now() - startTime;
      childLogger.info({ jobId: job.id, duration }, 'Learning job completed');
    } catch (error) {
      childLogger.error({ error, jobId: job.id }, 'Learning job failed');
      throw error;
    }
  },
  {
    connection,
    concurrency: 1, // Process one company at a time
    limiter: {
      max: 5,
      duration: 60000, // 5 jobs per minute
    },
  }
);

// Error handling
learningWorker.on('failed', (job, error) => {
  childLogger.error({ error, jobId: job?.id }, 'Learning worker job failed');
});

learningWorker.on('error', (error) => {
  childLogger.error({ error }, 'Learning worker error');
});

/**
 * Schedule weekly learning cron job
 * Runs every Monday at 06:00 UTC
 */
export async function scheduleWeeklyLearning(): Promise<void> {
  await learningQueue.add(
    'weekly-learning',
    {},
    {
      repeat: {
        pattern: '0 6 * * 1', // Monday 06:00 UTC
      },
      removeOnComplete: { count: 10 },
      removeOnFail: { count: 50 },
    }
  );
  childLogger.info('Scheduled weekly learning job (Monday 06:00 UTC)');
}

/**
 * Trigger immediate learning for a company (for testing/manual runs)
 */
export async function triggerCompanyLearning(companyId: string): Promise<void> {
  await learningQueue.add('company-learning', { companyId }, { priority: 1 });
  childLogger.info({ companyId }, 'Triggered immediate company learning');
}

export default learningWorker;
