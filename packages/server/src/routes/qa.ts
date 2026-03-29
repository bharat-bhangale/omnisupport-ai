import { Router, Request, Response } from 'express';
import mongoose from 'mongoose';
import { z } from 'zod';
import { QAReport } from '../models/QAReport.js';
import { asyncHandler } from '../middleware/errorHandler.js';
import { AppError } from '../middleware/AppError.js';
import { logger } from '../config/logger.js';

const router = Router();
const childLogger = logger.child({ route: 'qa' });

// Request with user context
interface AuthRequest extends Request {
  user?: {
    sub: string;
    companyId: string;
    role: string;
  };
}

// Role guard middleware for manager/admin only
function roleGuard(...allowedRoles: string[]) {
  return (req: AuthRequest, res: Response, next: () => void) => {
    const userRole = req.user?.role;
    if (!userRole || !allowedRoles.includes(userRole)) {
      throw AppError.forbidden('Insufficient permissions');
    }
    next();
  };
}

/**
 * GET /qa/reports
 * List QA reports with pagination and filters
 */
router.get(
  '/reports',
  roleGuard('manager', 'admin'),
  asyncHandler(async (req: AuthRequest, res: Response) => {
    const companyId = req.user?.companyId;
    if (!companyId) {
      throw AppError.unauthorized('Missing company context');
    }

    const companyObjectId = new mongoose.Types.ObjectId(companyId);

    // Parse query params
    const days = parseInt(req.query.days as string) || 30;
    const channel = req.query.channel as 'voice' | 'text' | undefined;
    const flaggedOnly = req.query.flaggedOnly === 'true';
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

    // Execute query with pagination
    const [reports, total] = await Promise.all([
      QAReport.find(query)
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .select('interactionId channel overallScore flaggedForReview flaggedDimensions reviewedBy createdAt')
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

/**
 * GET /qa/reports/:id
 * Get full QA report with all dimension scores
 */
router.get(
  '/reports/:id',
  roleGuard('manager', 'admin'),
  asyncHandler(async (req: AuthRequest, res: Response) => {
    const companyId = req.user?.companyId;
    if (!companyId) {
      throw AppError.unauthorized('Missing company context');
    }

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

/**
 * PATCH /qa/reports/:id/review
 * Mark a QA report as reviewed
 */
router.patch(
  '/reports/:id/review',
  roleGuard('manager', 'admin'),
  asyncHandler(async (req: AuthRequest, res: Response) => {
    const companyId = req.user?.companyId;
    const agentId = req.user?.sub;

    if (!companyId || !agentId) {
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

/**
 * GET /qa/summary
 * Get QA summary statistics
 */
router.get(
  '/summary',
  roleGuard('manager', 'admin'),
  asyncHandler(async (req: AuthRequest, res: Response) => {
    const companyId = req.user?.companyId;
    if (!companyId) {
      throw AppError.unauthorized('Missing company context');
    }

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
    const formattedDistribution = scoreDistribution.map((bucket: { _id: number; count: number }, index: number) => ({
      range: distributionRanges[index] || `${bucket._id}+`,
      count: bucket.count,
    }));

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

export default router;
