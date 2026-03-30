import { Router, Request, Response } from 'express';
import mongoose from 'mongoose';
import { z } from 'zod';
import OpenAI from 'openai';
import { QAReport } from '../models/QAReport.js';
import { QARubric, DEFAULT_QA_RUBRIC, type IQARubricDimension } from '../models/QARubric.js';
import { CallSession } from '../models/CallSession.js';
import { Ticket } from '../models/Ticket.js';
import { asyncHandler } from '../middleware/errorHandler.js';
import { AppError } from '../middleware/AppError.js';
import { roleGuard } from '../middleware/roleGuard.js';
import { logger } from '../config/logger.js';
import { env } from '../config/env.js';
import { redis, buildRedisKey } from '../config/redis.js';
import { getAgentLeaderboard } from '../services/agentPerformance.js';

const router = Router();
const childLogger = logger.child({ route: 'qa' });
const openai = new OpenAI({ apiKey: env.OPENAI_API_KEY });

// Request with user context
interface AuthRequest extends Request {
  user?: {
    sub: string;
    companyId: string;
    role: string;
  };
}

// ─── Helpers ────────────────────────────────────────────────────────────────

function getCompanyId(req: AuthRequest): string {
  const companyId = req.user?.companyId;
  if (!companyId) throw AppError.unauthorized('Missing company context');
  return companyId;
}

/**
 * Build dynamic GPT-4o system prompt from rubric dimensions
 */
function buildSystemPrompt(dimensions: IQARubricDimension[]): string {
  const rubricBlock = dimensions
    .map((d) => `${d.key}: ${d.scoringGuide}`)
    .join('\n');

  const dimensionKeys = dimensions.map((d) => d.key);
  const jsonExample = dimensionKeys
    .map((key) => `  "${key}": { "score": <number>, "reasoning": "<string max 15 words>" }`)
    .join(',\n');

  return `Score this customer support interaction on each dimension.
Rubric:
${rubricBlock}
For each dimension return: score (0-10) and reasoning (max 15 words).
Return ONLY JSON:
{
${jsonExample}
}`;
}

// ─── GET /qa/reports ────────────────────────────────────────────────────────

/**
 * GET /qa/reports
 * List QA reports with pagination and filters
 */
router.get(
  '/reports',
  roleGuard('manager', 'admin'),
  asyncHandler(async (req: AuthRequest, res: Response) => {
    const companyId = getCompanyId(req);
    const companyObjectId = new mongoose.Types.ObjectId(companyId);

    // Parse query params
    const days = parseInt(req.query.days as string) || 30;
    const channel = req.query.channel as 'voice' | 'text' | undefined;
    const flaggedOnly = req.query.flaggedOnly === 'true';
    const agentId = req.query.agentId as string | undefined;
    const page = Math.max(1, parseInt(req.query.page as string) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(req.query.limit as string) || 20));
    const skip = (page - 1) * limit;

    // Build date filter
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - days);

    // Build query
    const query: Record<string, unknown> = {
      companyId: companyObjectId,
      createdAt: { $gte: startDate },
    };

    if (channel) {
      query.channel = channel;
    }

    if (flaggedOnly) {
      query.flaggedForReview = true;
    }

    // If agentId is provided, find interaction IDs for that agent first
    if (agentId) {
      const agentTickets = await Ticket.find(
        { companyId: companyObjectId, assignedTo: agentId },
        { _id: 1 }
      ).lean();
      const agentInteractionIds = agentTickets.map((t) => t._id.toString());
      query.interactionId = { $in: agentInteractionIds };
    }

    // Execute query with pagination
    const [reports, total] = await Promise.all([
      QAReport.find(query)
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .select(
          'interactionId channel overallScore flaggedForReview flaggedDimensions reviewedBy createdAt'
        )
        .lean(),
      QAReport.countDocuments(query),
    ]);

    res.json({
      reports,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    });
  })
);

// ─── GET /qa/reports/:id ────────────────────────────────────────────────────

/**
 * GET /qa/reports/:id
 * Get full QA report with all dimension scores
 */
router.get(
  '/reports/:id',
  roleGuard('manager', 'admin'),
  asyncHandler(async (req: AuthRequest, res: Response) => {
    const companyId = getCompanyId(req);
    const { id } = req.params;

    if (!mongoose.Types.ObjectId.isValid(id)) {
      throw AppError.badRequest('Invalid report ID');
    }

    const report = await QAReport.findOne({
      _id: id,
      companyId: new mongoose.Types.ObjectId(companyId),
    })
      .populate('reviewedBy', 'name email')
      .lean();

    if (!report) {
      throw AppError.notFound('QA Report');
    }

    res.json({ report });
  })
);

// ─── PATCH /qa/reports/:id/review ───────────────────────────────────────────

/**
 * PATCH /qa/reports/:id/review
 * Mark a QA report as reviewed
 */
router.patch(
  '/reports/:id/review',
  roleGuard('manager', 'admin'),
  asyncHandler(async (req: AuthRequest, res: Response) => {
    const companyId = getCompanyId(req);
    const agentId = req.user?.sub;

    if (!agentId) {
      throw AppError.unauthorized('Missing user context');
    }

    const { id } = req.params;

    if (!mongoose.Types.ObjectId.isValid(id)) {
      throw AppError.badRequest('Invalid report ID');
    }

    // Validate body
    const reviewSchema = z.object({
      reviewNote: z.string().min(1).max(2000),
    });

    const { reviewNote } = reviewSchema.parse(req.body);

    const report = await QAReport.findOneAndUpdate(
      {
        _id: id,
        companyId: new mongoose.Types.ObjectId(companyId),
      },
      {
        reviewedBy: new mongoose.Types.ObjectId(agentId),
        reviewNote,
        flaggedForReview: false,
      },
      { new: true }
    );

    if (!report) {
      throw AppError.notFound('QA Report');
    }

    childLogger.info({ reportId: id, reviewedBy: agentId }, 'QA report reviewed');

    res.json({ report });
  })
);

// ─── GET /qa/summary ────────────────────────────────────────────────────────

/**
 * GET /qa/summary
 * Get QA summary statistics
 */
router.get(
  '/summary',
  roleGuard('manager', 'admin'),
  asyncHandler(async (req: AuthRequest, res: Response) => {
    const companyId = getCompanyId(req);
    const companyObjectId = new mongoose.Types.ObjectId(companyId);
    const days = parseInt(req.query.days as string) || 30;

    const startDate = new Date();
    startDate.setDate(startDate.getDate() - days);

    // Aggregate statistics
    const [avgStats, flaggedCount, scoreDistribution, trendByDay] = await Promise.all([
      // Average overall score and by dimension
      QAReport.aggregate([
        {
          $match: {
            companyId: companyObjectId,
            createdAt: { $gte: startDate },
          },
        },
        {
          $group: {
            _id: null,
            avgOverallScore: { $avg: '$overallScore' },
            avgIntentUnderstanding: { $avg: '$dimensions.intentUnderstanding.score' },
            avgResponseAccuracy: { $avg: '$dimensions.responseAccuracy.score' },
            avgResolutionSuccess: { $avg: '$dimensions.resolutionSuccess.score' },
            avgEscalationCorrectness: { $avg: '$dimensions.escalationCorrectness.score' },
            avgCustomerExperience: { $avg: '$dimensions.customerExperience.score' },
            totalReports: { $sum: 1 },
          },
        },
      ]),

      // Count flagged reports
      QAReport.countDocuments({
        companyId: companyObjectId,
        createdAt: { $gte: startDate },
        flaggedForReview: true,
      }),

      // Score distribution (0-40, 41-60, 61-80, 81-100)
      QAReport.aggregate([
        {
          $match: {
            companyId: companyObjectId,
            createdAt: { $gte: startDate },
          },
        },
        {
          $bucket: {
            groupBy: '$overallScore',
            boundaries: [0, 41, 61, 81, 101],
            default: 'Other',
            output: {
              count: { $sum: 1 },
            },
          },
        },
      ]),

      // Trend by day
      QAReport.aggregate([
        {
          $match: {
            companyId: companyObjectId,
            createdAt: { $gte: startDate },
          },
        },
        {
          $group: {
            _id: {
              $dateToString: { format: '%Y-%m-%d', date: '$createdAt' },
            },
            avgScore: { $avg: '$overallScore' },
            count: { $sum: 1 },
          },
        },
        { $sort: { _id: 1 } },
      ]),
    ]);

    const stats = avgStats[0] || {
      avgOverallScore: 0,
      avgIntentUnderstanding: 0,
      avgResponseAccuracy: 0,
      avgResolutionSuccess: 0,
      avgEscalationCorrectness: 0,
      avgCustomerExperience: 0,
      totalReports: 0,
    };

    // Format score distribution
    const distributionRanges = ['0-40', '41-60', '61-80', '81-100'];
    const formattedDistribution = scoreDistribution.map(
      (bucket: { _id: number; count: number }, index: number) => ({
        range: distributionRanges[index] || `${bucket._id}+`,
        count: bucket.count,
      })
    );

    res.json({
      avgOverallScore: Math.round(stats.avgOverallScore * 10) / 10,
      avgByDimension: {
        intentUnderstanding: Math.round(stats.avgIntentUnderstanding * 10) / 10,
        responseAccuracy: Math.round(stats.avgResponseAccuracy * 10) / 10,
        resolutionSuccess: Math.round(stats.avgResolutionSuccess * 10) / 10,
        escalationCorrectness: Math.round(stats.avgEscalationCorrectness * 10) / 10,
        customerExperience: Math.round(stats.avgCustomerExperience * 10) / 10,
      },
      totalReports: stats.totalReports,
      flaggedCount,
      scoreDistribution: formattedDistribution,
      trendByDay: trendByDay.map((day: { _id: string; avgScore: number; count: number }) => ({
        date: day._id,
        avgScore: Math.round(day.avgScore * 10) / 10,
        count: day.count,
      })),
    });
  })
);

// ─── GET /qa/agent-leaderboard ──────────────────────────────────────────────

/**
 * GET /qa/agent-leaderboard
 * Get agents ranked by average QA score
 */
router.get(
  '/agent-leaderboard',
  roleGuard('manager', 'admin'),
  asyncHandler(async (req: AuthRequest, res: Response) => {
    const companyId = getCompanyId(req);

    const leaderboard = await getAgentLeaderboard(companyId);

    res.json({ leaderboard });
  })
);

// ─── GET /qa/rubric ─────────────────────────────────────────────────────────

/**
 * GET /qa/rubric
 * Get company's QA rubric or default
 */
router.get(
  '/rubric',
  roleGuard('manager', 'admin'),
  asyncHandler(async (req: AuthRequest, res: Response) => {
    const companyId = getCompanyId(req);

    const rubric = await QARubric.findOne({
      companyId: new mongoose.Types.ObjectId(companyId),
    }).lean();

    if (rubric) {
      res.json({ rubric, isCustom: true });
    } else {
      res.json({
        rubric: {
          companyId,
          dimensions: DEFAULT_QA_RUBRIC,
          version: 0,
        },
        isCustom: false,
      });
    }
  })
);

// ─── PUT /qa/rubric ─────────────────────────────────────────────────────────

// Validation schema for rubric update
const rubricUpdateSchema = z.object({
  dimensions: z
    .array(
      z.object({
        name: z.string().min(1).max(100),
        key: z.enum([
          'intentUnderstanding',
          'responseAccuracy',
          'resolutionSuccess',
          'escalationCorrectness',
          'customerExperience',
        ]),
        weight: z.number().min(0).max(1),
        minPassScore: z.number().min(0).max(10),
        scoringGuide: z.string().min(10).max(1000),
      })
    )
    .min(1)
    .max(10)
    .refine(
      (dims) => {
        const totalWeight = dims.reduce((sum, d) => sum + d.weight, 0);
        return Math.abs(totalWeight - 1.0) < 0.01;
      },
      { message: 'Dimension weights must sum to 1.0' }
    ),
});

/**
 * PUT /qa/rubric
 * Update company QA rubric (admin only)
 */
router.put(
  '/rubric',
  roleGuard('admin'),
  asyncHandler(async (req: AuthRequest, res: Response) => {
    const companyId = getCompanyId(req);
    const companyObjectId = new mongoose.Types.ObjectId(companyId);

    const { dimensions } = rubricUpdateSchema.parse(req.body);

    const rubric = await QARubric.findOneAndUpdate(
      { companyId: companyObjectId },
      {
        companyId: companyObjectId,
        dimensions,
        $inc: { version: 1 },
      },
      { upsert: true, new: true, setDefaultsOnInsert: true }
    );

    // Invalidate Redis cache
    const cacheKey = buildRedisKey(companyId, 'qa', 'rubric');
    await redis.del(cacheKey);

    childLogger.info(
      { companyId, version: rubric.version, dimensionCount: dimensions.length },
      'QA rubric updated'
    );

    res.json({ rubric });
  })
);

// ─── POST /qa/rubric/test ───────────────────────────────────────────────────

// Validation schema for rubric test
const rubricTestSchema = z.object({
  interactionId: z.string().min(1),
  channel: z.enum(['voice', 'text']),
  dimensions: z
    .array(
      z.object({
        name: z.string().min(1).max(100),
        key: z.enum([
          'intentUnderstanding',
          'responseAccuracy',
          'resolutionSuccess',
          'escalationCorrectness',
          'customerExperience',
        ]),
        weight: z.number().min(0).max(1),
        minPassScore: z.number().min(0).max(10),
        scoringGuide: z.string().min(10).max(1000),
      })
    )
    .min(1)
    .max(10)
    .refine(
      (dims) => {
        const totalWeight = dims.reduce((sum, d) => sum + d.weight, 0);
        return Math.abs(totalWeight - 1.0) < 0.01;
      },
      { message: 'Dimension weights must sum to 1.0' }
    )
    .optional(),
});

/**
 * POST /qa/rubric/test
 * Dry-run rubric on a past interaction without saving results
 */
router.post(
  '/rubric/test',
  roleGuard('admin'),
  asyncHandler(async (req: AuthRequest, res: Response) => {
    const companyId = getCompanyId(req);
    const companyObjectId = new mongoose.Types.ObjectId(companyId);

    const body = rubricTestSchema.parse(req.body);
    const { interactionId, channel } = body;

    // Use provided dimensions or fetch company rubric
    let dimensions: IQARubricDimension[];
    if (body.dimensions) {
      dimensions = body.dimensions;
    } else {
      const rubricDoc = await QARubric.findOne({ companyId: companyObjectId }).lean();
      dimensions = rubricDoc?.dimensions ?? DEFAULT_QA_RUBRIC;
    }

    // Build transcript
    let transcript: string;

    if (channel === 'voice') {
      const session = await CallSession.findOne({
        callId: interactionId,
        companyId: companyObjectId,
      })
        .select('turns')
        .lean();

      if (!session) {
        throw AppError.notFound('CallSession');
      }

      transcript = session.turns
        .filter(
          (t: { role: string; content: string }) =>
            t.role === 'user' || t.role === 'assistant'
        )
        .map(
          (t: { role: string; content: string }) =>
            `[${t.role.toUpperCase()}]: ${t.content}`
        )
        .join('\n\n');
    } else {
      const ticket = await Ticket.findOne({
        _id: interactionId,
        companyId: companyObjectId,
      })
        .select('subject description messages')
        .lean();

      if (!ticket) {
        throw AppError.notFound('Ticket');
      }

      let t = `SUBJECT: ${ticket.subject}\n\nINITIAL MESSAGE:\n${ticket.description || ''}\n\n`;
      if (ticket.messages && ticket.messages.length > 0) {
        t += 'CONVERSATION:\n';
        t += ticket.messages
          .map(
            (m: { sender: string; content: string }) =>
              `[${m.sender.toUpperCase()}]: ${m.content}`
          )
          .join('\n\n');
      }
      transcript = t;
    }

    if (!transcript || transcript.length < 20) {
      throw AppError.badRequest('Insufficient content for QA evaluation');
    }

    // Run GPT-4o evaluation (dry-run — not saved)
    const systemPrompt = buildSystemPrompt(dimensions);

    const gptResponse = await openai.chat.completions.create({
      model: 'gpt-4o',
      temperature: 0,
      response_format: { type: 'json_object' },
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: `Channel: ${channel}\n\nTranscript:\n${transcript}` },
      ],
    });

    const content = gptResponse.choices[0]?.message?.content;
    if (!content) {
      throw AppError.internal('Empty response from GPT-4o');
    }

    const scores = JSON.parse(content) as Record<
      string,
      { score: number; reasoning: string }
    >;

    // Calculate overall score
    let overallScore = 0;
    for (const dim of dimensions) {
      const dimScore = scores[dim.key];
      if (dimScore) {
        overallScore += dimScore.score * dim.weight;
      }
    }
    overallScore = Math.round(overallScore * 10);

    // Identify flagged dimensions
    const flaggedDimensions: string[] = [];
    for (const dim of dimensions) {
      const dimScore = scores[dim.key];
      if (dimScore && dimScore.score < dim.minPassScore) {
        flaggedDimensions.push(dim.key);
      }
    }

    // Build response (NOT saved to DB)
    const dimensionResults: Record<
      string,
      { score: number; reasoning: string; weight: number }
    > = {};
    for (const dim of dimensions) {
      const dimScore = scores[dim.key];
      if (dimScore) {
        dimensionResults[dim.key] = {
          score: dimScore.score,
          reasoning: dimScore.reasoning,
          weight: dim.weight,
        };
      }
    }

    childLogger.info(
      { companyId, interactionId, channel, overallScore, dryRun: true },
      'QA rubric dry-run completed'
    );

    res.json({
      dryRun: true,
      interactionId,
      channel,
      overallScore,
      dimensions: dimensionResults,
      flaggedForReview: flaggedDimensions.length > 0,
      flaggedDimensions,
    });
  })
);

export default router;
