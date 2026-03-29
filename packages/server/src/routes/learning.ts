import { Router, Request, Response } from 'express';
import { z } from 'zod';
import mongoose from 'mongoose';
import { GapReport } from '../models/GapReport.js';
import { KBGap, KBDocument } from '../models/KBDocument.js';
import { FeedbackEvent } from '../models/FeedbackEvent.js';
import { PromptVariant, calculateConfidence } from '../models/PromptVariant.js';
import { asyncHandler } from '../middleware/errorHandler.js';
import { AppError } from '../middleware/AppError.js';
import { roleGuard } from '../middleware/roleGuard.js';
import { logger } from '../config/logger.js';
import { triggerCompanyLearning } from '../queues/learningWorker.js';
import { kbIndexQueue } from '../queues/index.js';

const router = Router();
const childLogger = logger.child({ route: 'learning' });

interface AuthRequest extends Request {
  user?: {
    sub: string;
    companyId: string;
    role: string;
  };
}

// All routes require manager or admin role
router.use(roleGuard('manager', 'admin'));

// ============================================================================
// GAP REPORTS
// ============================================================================

/**
 * GET /learning/gap-report - Get latest gap report
 */
router.get(
  '/gap-report',
  asyncHandler(async (req: AuthRequest, res: Response) => {
    const companyId = req.user?.companyId;
    if (!companyId) {
      throw AppError.unauthorized('Missing company context');
    }

    const report = await GapReport.findOne({
      companyId,
      status: 'completed',
    })
      .sort({ week: -1 })
      .lean();

    if (!report) {
      return res.json({ report: null, message: 'No gap reports available yet' });
    }

    res.json({ report });
  })
);

/**
 * GET /learning/gap-report/history - Get last 8 weeks of reports
 */
router.get(
  '/gap-report/history',
  asyncHandler(async (req: AuthRequest, res: Response) => {
    const companyId = req.user?.companyId;
    if (!companyId) {
      throw AppError.unauthorized('Missing company context');
    }

    const reports = await GapReport.find({
      companyId,
      status: 'completed',
    })
      .sort({ week: -1 })
      .limit(8)
      .select('week weekLabel gapStats.totalGaps gapStats.resolvedGaps feedbackSummary.totalEvents feedbackSummary.avgRating')
      .lean();

    res.json({ reports });
  })
);

/**
 * POST /learning/gap-report/trigger - Manually trigger report generation
 */
router.post(
  '/gap-report/trigger',
  asyncHandler(async (req: AuthRequest, res: Response) => {
    const companyId = req.user?.companyId;
    if (!companyId) {
      throw AppError.unauthorized('Missing company context');
    }

    await triggerCompanyLearning(companyId);

    res.json({ success: true, message: 'Learning report generation triggered' });
  })
);

// ============================================================================
// KB GAPS MANAGEMENT
// ============================================================================

/**
 * GET /learning/gaps - Get open KB gaps
 */
router.get(
  '/gaps',
  asyncHandler(async (req: AuthRequest, res: Response) => {
    const companyId = req.user?.companyId;
    if (!companyId) {
      throw AppError.unauthorized('Missing company context');
    }

    const { status = 'open', limit = 50 } = req.query;

    const gaps = await KBGap.find({
      companyId,
      status: status as string,
    })
      .sort({ frequency: -1, lastOccurredAt: -1 })
      .limit(Number(limit))
      .lean();

    const total = await KBGap.countDocuments({ companyId, status: status as string });

    res.json({ gaps, total });
  })
);

const resolveGapSchema = z.object({
  answer: z.string().min(1).optional(),
  addToKB: z.boolean().default(false),
  markResolved: z.boolean().default(true),
  category: z.string().optional(),
  title: z.string().optional(),
});

/**
 * POST /learning/gaps/:id/resolve - Resolve a KB gap
 */
router.post(
  '/gaps/:id/resolve',
  asyncHandler(async (req: AuthRequest, res: Response) => {
    const companyId = req.user?.companyId;
    const userId = req.user?.sub;
    if (!companyId || !userId) {
      throw AppError.unauthorized('Missing context');
    }

    const gap = await KBGap.findOne({
      _id: req.params.id,
      companyId,
    });

    if (!gap) {
      throw AppError.notFound('Gap');
    }

    const data = resolveGapSchema.parse(req.body);

    // If adding to KB, create a new KB document
    let documentId: mongoose.Types.ObjectId | undefined;
    if (data.addToKB && data.answer) {
      const kbDoc = new KBDocument({
        companyId,
        title: data.title || gap.query.slice(0, 100),
        category: data.category || 'General',
        language: 'en',
        sourceType: 'manual',
        rawText: `Question: ${gap.query}\n\nAnswer: ${data.answer}`,
        status: 'pending',
        createdBy: userId,
      });

      await kbDoc.save();
      documentId = kbDoc._id as mongoose.Types.ObjectId;

      // Queue for indexing
      await kbIndexQueue.add(`index-${kbDoc._id}`, {
        documentId: kbDoc._id.toString(),
        companyId,
      });

      childLogger.info({ gapId: gap._id, documentId }, 'Created KB document from gap');
    }

    if (data.markResolved) {
      gap.status = 'resolved';
      gap.resolution = {
        answer: data.answer || 'Marked as resolved without KB entry',
        documentId,
        resolvedBy: userId,
        resolvedAt: new Date(),
      };
      await gap.save();
    }

    res.json({
      success: true,
      gap: gap.toObject(),
      documentId: documentId?.toString(),
    });
  })
);

// ============================================================================
// FEEDBACK SUMMARY
// ============================================================================

/**
 * GET /learning/feedback-summary - Get feedback summary
 */
router.get(
  '/feedback-summary',
  asyncHandler(async (req: AuthRequest, res: Response) => {
    const companyId = req.user?.companyId;
    if (!companyId) {
      throw AppError.unauthorized('Missing company context');
    }

    const days = parseInt(req.query.days as string) || 30;
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - days);

    // Get feedback by issue type
    const byIssueType = await FeedbackEvent.aggregate([
      {
        $match: {
          companyId: new mongoose.Types.ObjectId(companyId),
          createdAt: { $gte: startDate },
        },
      },
      {
        $group: {
          _id: '$issueType',
          count: { $sum: 1 },
          avgRating: { $avg: '$rating' },
        },
      },
      { $sort: { count: -1 } },
    ]);

    // Get feedback by channel
    const byChannel = await FeedbackEvent.aggregate([
      {
        $match: {
          companyId: new mongoose.Types.ObjectId(companyId),
          createdAt: { $gte: startDate },
        },
      },
      {
        $group: {
          _id: '$channel',
          count: { $sum: 1 },
          avgRating: { $avg: '$rating' },
        },
      },
    ]);

    // Get daily trend
    const dailyTrend = await FeedbackEvent.aggregate([
      {
        $match: {
          companyId: new mongoose.Types.ObjectId(companyId),
          createdAt: { $gte: startDate },
        },
      },
      {
        $group: {
          _id: { $dateToString: { format: '%Y-%m-%d', date: '$createdAt' } },
          count: { $sum: 1 },
          avgRating: { $avg: '$rating' },
        },
      },
      { $sort: { _id: 1 } },
    ]);

    // Get recent events for feed
    const recentEvents = await FeedbackEvent.find({
      companyId,
      createdAt: { $gte: startDate },
    })
      .sort({ createdAt: -1 })
      .limit(50)
      .select('channel issueType rating notes createdAt')
      .lean();

    // Calculate totals
    const totalEvents = byIssueType.reduce((sum, t) => sum + t.count, 0);
    const avgRating = totalEvents > 0
      ? byIssueType.reduce((sum, t) => sum + t.avgRating * t.count, 0) / totalEvents
      : 0;

    res.json({
      days,
      totalEvents,
      avgRating: Math.round(avgRating * 10) / 10,
      byIssueType: byIssueType.map((t) => ({
        issueType: t._id || 'unspecified',
        count: t.count,
        avgRating: Math.round(t.avgRating * 10) / 10,
      })),
      byChannel: byChannel.map((c) => ({
        channel: c._id,
        count: c.count,
        avgRating: Math.round(c.avgRating * 10) / 10,
      })),
      dailyTrend: dailyTrend.map((d) => ({
        date: d._id,
        count: d.count,
        avgRating: Math.round(d.avgRating * 10) / 10,
      })),
      recentEvents,
    });
  })
);

// ============================================================================
// A/B TESTS
// ============================================================================

/**
 * GET /learning/ab-tests - Get all A/B tests
 */
router.get(
  '/ab-tests',
  asyncHandler(async (req: AuthRequest, res: Response) => {
    const companyId = req.user?.companyId;
    if (!companyId) {
      throw AppError.unauthorized('Missing company context');
    }

    const tests = await PromptVariant.find({ companyId })
      .sort({ createdAt: -1 })
      .lean();

    // Separate active and completed tests
    const activeTests = tests.filter((t) => t.status === 'running' || t.status === 'winner_identified');
    const pastTests = tests.filter((t) => t.status === 'completed' || t.status === 'paused');

    // Calculate confidence for active tests
    const enrichedActiveTests = activeTests.map((test) => ({
      ...test,
      calculatedConfidence: calculateConfidence(
        test.variantA.resolutionRate,
        test.variantA.calls,
        test.variantB.resolutionRate,
        test.variantB.calls
      ),
      delta: Math.abs(test.variantA.resolutionRate - test.variantB.resolutionRate),
      leading: test.variantA.resolutionRate > test.variantB.resolutionRate ? 'A' : 'B',
    }));

    res.json({ activeTests: enrichedActiveTests, pastTests });
  })
);

const createAbTestSchema = z.object({
  name: z.string().min(1).max(200),
  description: z.string().min(1).max(1000),
  variantA: z.object({
    systemPromptSuffix: z.string().min(1),
    description: z.string().optional(),
  }),
  variantB: z.object({
    systemPromptSuffix: z.string().min(1),
    description: z.string().optional(),
  }),
  minSampleSize: z.number().min(10).max(10000).default(100),
  targetMetric: z.enum(['resolution_rate', 'sentiment', 'turn_count']).default('resolution_rate'),
  autoStart: z.boolean().default(false),
});

/**
 * POST /learning/ab-tests - Create new A/B test
 */
router.post(
  '/ab-tests',
  asyncHandler(async (req: AuthRequest, res: Response) => {
    const companyId = req.user?.companyId;
    const userId = req.user?.sub;
    if (!companyId || !userId) {
      throw AppError.unauthorized('Missing context');
    }

    const data = createAbTestSchema.parse(req.body);

    // Check if there's already an active test
    const existingActive = await PromptVariant.findOne({
      companyId,
      status: 'running',
    });

    if (existingActive) {
      throw AppError.badRequest('An A/B test is already running. Please pause or complete it first.');
    }

    const test = new PromptVariant({
      companyId,
      name: data.name,
      description: data.description,
      variantA: {
        systemPromptSuffix: data.variantA.systemPromptSuffix,
        description: data.variantA.description,
        calls: 0,
        resolutionRate: 0,
      },
      variantB: {
        systemPromptSuffix: data.variantB.systemPromptSuffix,
        description: data.variantB.description,
        calls: 0,
        resolutionRate: 0,
      },
      status: data.autoStart ? 'running' : 'draft',
      minSampleSize: data.minSampleSize,
      targetMetric: data.targetMetric,
      createdBy: userId,
      startDate: data.autoStart ? new Date() : undefined,
    });

    await test.save();

    childLogger.info({ testId: test._id, companyId }, 'A/B test created');

    res.status(201).json({ test });
  })
);

/**
 * PATCH /learning/ab-tests/:id/start - Start an A/B test
 */
router.patch(
  '/ab-tests/:id/start',
  asyncHandler(async (req: AuthRequest, res: Response) => {
    const companyId = req.user?.companyId;
    if (!companyId) {
      throw AppError.unauthorized('Missing company context');
    }

    // Check for existing running test
    const existingActive = await PromptVariant.findOne({
      companyId,
      status: 'running',
      _id: { $ne: req.params.id },
    });

    if (existingActive) {
      throw AppError.badRequest('Another A/B test is already running');
    }

    const test = await PromptVariant.findOneAndUpdate(
      { _id: req.params.id, companyId, status: 'draft' },
      { $set: { status: 'running', startDate: new Date() } },
      { new: true }
    );

    if (!test) {
      throw AppError.notFound('Test');
    }

    res.json({ test });
  })
);

/**
 * PATCH /learning/ab-tests/:id/pause - Pause an A/B test
 */
router.patch(
  '/ab-tests/:id/pause',
  asyncHandler(async (req: AuthRequest, res: Response) => {
    const companyId = req.user?.companyId;
    if (!companyId) {
      throw AppError.unauthorized('Missing company context');
    }

    const test = await PromptVariant.findOneAndUpdate(
      { _id: req.params.id, companyId, status: 'running' },
      { $set: { status: 'paused' } },
      { new: true }
    );

    if (!test) {
      throw AppError.notFound('Test');
    }

    res.json({ test });
  })
);

/**
 * PATCH /learning/ab-tests/:id/activate-winner - Activate the winning variant
 */
router.patch(
  '/ab-tests/:id/activate-winner',
  asyncHandler(async (req: AuthRequest, res: Response) => {
    const companyId = req.user?.companyId;
    const userId = req.user?.sub;
    if (!companyId || !userId) {
      throw AppError.unauthorized('Missing context');
    }

    const test = await PromptVariant.findOne({
      _id: req.params.id,
      companyId,
      status: { $in: ['running', 'winner_identified'] },
    });

    if (!test) {
      throw AppError.notFound('Test');
    }

    // Determine winner if not already set
    let winner = test.winner;
    if (!winner) {
      winner = test.variantA.resolutionRate > test.variantB.resolutionRate ? 'A' : 'B';
    }

    const winningVariant = winner === 'A' ? test.variantA : test.variantB;
    const losingVariant = winner === 'A' ? test.variantB : test.variantA;

    // Update test status
    test.status = 'completed';
    test.winner = winner;
    test.winnerDelta = Math.abs(test.variantA.resolutionRate - test.variantB.resolutionRate);
    test.endDate = new Date();
    test.activatedBy = userId;
    await test.save();

    childLogger.info(
      { testId: test._id, winner, delta: test.winnerDelta },
      'A/B test winner activated'
    );

    // TODO: Apply winning prompt suffix to company config

    res.json({
      success: true,
      test,
      message: `Variant ${winner} activated. Resolution rate: ${winningVariant.resolutionRate.toFixed(1)}% (vs ${losingVariant.resolutionRate.toFixed(1)}%)`,
    });
  })
);

/**
 * DELETE /learning/ab-tests/:id - Delete a draft test
 */
router.delete(
  '/ab-tests/:id',
  asyncHandler(async (req: AuthRequest, res: Response) => {
    const companyId = req.user?.companyId;
    if (!companyId) {
      throw AppError.unauthorized('Missing company context');
    }

    const test = await PromptVariant.findOneAndDelete({
      _id: req.params.id,
      companyId,
      status: 'draft',
    });

    if (!test) {
      throw AppError.notFound('Test (or test is not in draft status)');
    }

    res.json({ success: true, message: 'Test deleted' });
  })
);

export default router;
