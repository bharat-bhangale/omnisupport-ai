import { Router, Request, Response } from 'express';
import { z } from 'zod';
import mongoose from 'mongoose';
import { asyncHandler } from '../middleware/errorHandler.js';
import { AppError } from '../middleware/AppError.js';
import { roleGuard } from '../middleware/roleGuard.js';
import { logger } from '../config/logger.js';
import { Ticket } from '../models/Ticket.js';
import { Company } from '../models/Company.js';
import { SLABreachRecord } from '../models/SLABreachRecord.js';
import {
  getSLAStatus,
  getTimeToBreachMinutes,
  DEFAULT_SLA_POLICY,
  type SLAPolicy,
} from '../services/slaCalculator.js';

const router = Router();
const childLogger = logger.child({ route: 'sla' });

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

function priorityToP(priority: string): 'P1' | 'P2' | 'P3' | 'P4' {
  const map: Record<string, 'P1' | 'P2' | 'P3' | 'P4'> = {
    urgent: 'P1',
    high: 'P2',
    normal: 'P3',
    low: 'P4',
  };
  return map[priority] || 'P3';
}

// ─── Validation Schemas ─────────────────────────────────────────────────────

const slaPolicySchema = z.object({
  P1: z.object({
    responseMinutes: z.number().int().min(1).max(10080),
    resolutionHours: z.number().int().min(1).max(720),
  }),
  P2: z.object({
    responseMinutes: z.number().int().min(1).max(10080),
    resolutionHours: z.number().int().min(1).max(720),
  }),
  P3: z.object({
    responseMinutes: z.number().int().min(1).max(10080),
    resolutionHours: z.number().int().min(1).max(720),
  }),
  P4: z.object({
    responseMinutes: z.number().int().min(1).max(10080),
    resolutionHours: z.number().int().min(1).max(720),
  }),
});

const breachReviewSchema = z.object({
  rootCause: z.string().min(5).max(2000),
});

// ─── GET /sla/compliance ────────────────────────────────────────────────────

/**
 * GET /sla/compliance?days=30
 * SLA compliance stats per priority tier with overall rate & top breach categories
 */
router.get(
  '/compliance',
  roleGuard('manager', 'admin'),
  asyncHandler(async (req: AuthRequest, res: Response) => {
    const companyId = getCompanyId(req);
    const days = parseInt(req.query.days as string) || 30;
    const startDate = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
    const companyObjectId = new mongoose.Types.ObjectId(companyId);

    // Aggregate SLA stats by priority
    const [stats, topBreachCategories] = await Promise.all([
      Ticket.aggregate([
        {
          $match: {
            companyId: companyObjectId,
            createdAt: { $gte: startDate },
            status: { $in: ['solved', 'closed'] },
          },
        },
        {
          $group: {
            _id: '$priority',
            total: { $sum: 1 },
            breached: {
              $sum: { $cond: ['$sla.isBreached', 1, 0] },
            },
            respondedOnTime: {
              $sum: {
                $cond: [
                  {
                    $and: [
                      { $ifNull: ['$sla.firstResponseAt', false] },
                      { $ifNull: ['$sla.responseDeadline', false] },
                      { $lte: ['$sla.firstResponseAt', '$sla.responseDeadline'] },
                    ],
                  },
                  1,
                  0,
                ],
              },
            },
          },
        },
      ]),

      // Top breach categories
      SLABreachRecord.aggregate([
        {
          $match: {
            companyId: companyObjectId,
            createdAt: { $gte: startDate },
            category: { $exists: true, $ne: null },
          },
        },
        {
          $group: {
            _id: '$category',
            count: { $sum: 1 },
          },
        },
        { $sort: { count: -1 } },
        { $limit: 10 },
      ]),
    ]);

    // Transform to P-notation format
    const compliance: Record<string, {
      total: number;
      onTime: number;
      breached: number;
      rate: number;
    }> = {
      P1: { total: 0, onTime: 0, breached: 0, rate: 100 },
      P2: { total: 0, onTime: 0, breached: 0, rate: 100 },
      P3: { total: 0, onTime: 0, breached: 0, rate: 100 },
      P4: { total: 0, onTime: 0, breached: 0, rate: 100 },
    };

    let overallTotal = 0;
    let overallBreached = 0;

    for (const stat of stats) {
      const pKey = priorityToP(stat._id);
      const breachedCount = stat.breached as number;
      const totalCount = stat.total as number;
      const onTimeCount = stat.respondedOnTime as number;

      compliance[pKey] = {
        total: totalCount,
        onTime: onTimeCount,
        breached: breachedCount,
        rate: totalCount > 0
          ? Math.round(((totalCount - breachedCount) / totalCount) * 100)
          : 100,
      };

      overallTotal += totalCount;
      overallBreached += breachedCount;
    }

    // Calculate overall rate
    const overallRate = overallTotal > 0
      ? Math.round(((overallTotal - overallBreached) / overallTotal) * 100)
      : 100;

    // Calculate trend (compare current period to previous period)
    const previousStartDate = new Date(startDate.getTime() - days * 24 * 60 * 60 * 1000);
    const previousStats = await Ticket.aggregate([
      {
        $match: {
          companyId: companyObjectId,
          createdAt: { $gte: previousStartDate, $lt: startDate },
          status: { $in: ['solved', 'closed'] },
        },
      },
      {
        $group: {
          _id: null,
          total: { $sum: 1 },
          breached: { $sum: { $cond: ['$sla.isBreached', 1, 0] } },
        },
      },
    ]);

    const prevTotal = previousStats[0]?.total || 0;
    const prevBreached = previousStats[0]?.breached || 0;
    const prevRate = prevTotal > 0
      ? Math.round(((prevTotal - prevBreached) / prevTotal) * 100)
      : 100;
    const trend = overallRate - prevRate; // positive = improving

    childLogger.debug({ companyId, days, overallRate }, 'SLA compliance fetched');

    res.json({
      period: { days, startDate: startDate.toISOString() },
      ...compliance,
      overall: {
        rate: overallRate,
        trend,
      },
      topBreachCategories: topBreachCategories.map(
        (cat: { _id: string; count: number }) => ({
          category: cat._id,
          count: cat.count,
        })
      ),
    });
  })
);

// ─── GET /sla/breaches ──────────────────────────────────────────────────────

/**
 * GET /sla/breaches?days=30&priority=urgent
 * Paginated breach records with ticket details
 */
router.get(
  '/breaches',
  roleGuard('manager', 'admin'),
  asyncHandler(async (req: AuthRequest, res: Response) => {
    const companyId = getCompanyId(req);
    const companyObjectId = new mongoose.Types.ObjectId(companyId);

    const days = parseInt(req.query.days as string) || 30;
    const priority = req.query.priority as string | undefined;
    const page = Math.max(1, parseInt(req.query.page as string) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(req.query.limit as string) || 20));
    const skip = (page - 1) * limit;

    const startDate = new Date(Date.now() - days * 24 * 60 * 60 * 1000);

    // Build query
    const query: Record<string, unknown> = {
      companyId: companyObjectId,
      createdAt: { $gte: startDate },
    };

    if (priority) {
      query.priority = priority;
    }

    // Execute query
    const [breaches, total] = await Promise.all([
      SLABreachRecord.aggregate([
        { $match: query },
        { $sort: { createdAt: -1 } },
        { $skip: skip },
        { $limit: limit },
        {
          $lookup: {
            from: 'tickets',
            localField: 'ticketId',
            foreignField: '_id',
            as: 'ticket',
            pipeline: [
              { $project: { subject: 1, status: 1, assignedTo: 1 } },
            ],
          },
        },
        {
          $unwind: { path: '$ticket', preserveNullAndEmptyArrays: true },
        },
        {
          $project: {
            _id: 1,
            ticketId: 1,
            externalId: 1,
            priority: 1,
            category: 1,
            slaDeadline: 1,
            breachedAt: 1,
            breachDurationMinutes: 1,
            assignedAgent: 1,
            resolvedAt: 1,
            rootCause: 1,
            createdAt: 1,
            'ticket.subject': 1,
            'ticket.status': 1,
          },
        },
      ]),
      SLABreachRecord.countDocuments(query),
    ]);

    res.json({
      breaches,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    });
  })
);

// ─── GET /sla/at-risk ───────────────────────────────────────────────────────

/**
 * GET /sla/at-risk
 * Active tickets with status='warning'|'critical', sorted by minutesLeft ascending
 */
router.get(
  '/at-risk',
  roleGuard('manager', 'admin', 'agent'),
  asyncHandler(async (req: AuthRequest, res: Response) => {
    const companyId = getCompanyId(req);
    const companyObjectId = new mongoose.Types.ObjectId(companyId);

    // Find open tickets with SLA deadline
    const tickets = await Ticket.find({
      companyId: companyObjectId,
      status: { $in: ['new', 'open', 'pending'] },
      'sla.responseDeadline': { $exists: true },
      'sla.isBreached': { $ne: true },
    })
      .select('_id subject priority sla assignedTo createdAt externalId')
      .lean();

    // Filter to warning/critical and calculate time to breach
    const atRiskTickets = tickets
      .map((ticket) => {
        const status = getSLAStatus(ticket as unknown as Parameters<typeof getSLAStatus>[0]);
        const minutesLeft = getTimeToBreachMinutes(ticket as unknown as Parameters<typeof getTimeToBreachMinutes>[0]);

        if (status !== 'warning' && status !== 'critical') {
          return null;
        }

        return {
          ticketId: ticket._id.toString(),
          externalId: ticket.externalId || null,
          subject: ticket.subject,
          priority: ticket.priority,
          slaStatus: status,
          minutesLeft: Math.max(0, minutesLeft),
          assignedAgent: ticket.assignedTo || null,
          responseDeadline: ticket.sla?.responseDeadline,
        };
      })
      .filter((t): t is NonNullable<typeof t> => t !== null)
      .sort((a, b) => a.minutesLeft - b.minutesLeft); // Most urgent first

    res.json({
      tickets: atRiskTickets,
      total: atRiskTickets.length,
    });
  })
);

// ─── GET /sla/trend ─────────────────────────────────────────────────────────

/**
 * GET /sla/trend?days=30
 * Daily breach count per priority for trend chart
 */
router.get(
  '/trend',
  roleGuard('manager', 'admin'),
  asyncHandler(async (req: AuthRequest, res: Response) => {
    const companyId = getCompanyId(req);
    const companyObjectId = new mongoose.Types.ObjectId(companyId);
    const days = parseInt(req.query.days as string) || 30;
    const startDate = new Date(Date.now() - days * 24 * 60 * 60 * 1000);

    // Use SLABreachRecord for accurate trend data
    const breachTrend = await SLABreachRecord.aggregate([
      {
        $match: {
          companyId: companyObjectId,
          breachedAt: { $gte: startDate },
        },
      },
      {
        $group: {
          _id: {
            date: { $dateToString: { format: '%Y-%m-%d', date: '$breachedAt' } },
            priority: '$priority',
          },
          count: { $sum: 1 },
        },
      },
      {
        $group: {
          _id: '$_id.date',
          breaches: {
            $push: {
              priority: '$_id.priority',
              count: '$count',
            },
          },
          total: { $sum: '$count' },
        },
      },
      { $sort: { _id: 1 } },
    ]);

    // Transform to chart-friendly format
    const trend = breachTrend.map((day: {
      _id: string;
      total: number;
      breaches: Array<{ priority: string; count: number }>;
    }) => {
      const breachesByPriority: Record<string, number> = {
        P1: 0,
        P2: 0,
        P3: 0,
        P4: 0,
      };

      for (const b of day.breaches) {
        const pKey = priorityToP(b.priority);
        breachesByPriority[pKey] = b.count;
      }

      return {
        date: day._id,
        total: day.total,
        ...breachesByPriority,
      };
    });

    res.json({
      period: { days, startDate: startDate.toISOString() },
      trend,
    });
  })
);

// ─── GET /sla/policy ────────────────────────────────────────────────────────

/**
 * GET /sla/policy
 * Get company's current SLA policy or default
 */
router.get(
  '/policy',
  roleGuard('manager', 'admin'),
  asyncHandler(async (req: AuthRequest, res: Response) => {
    const companyId = getCompanyId(req);

    const company = await Company.findById(companyId)
      .select('slaPolicy settings.slaEnabled')
      .lean();

    if (!company) {
      throw AppError.notFound('Company');
    }

    // Company.slaPolicy may or may not exist; fall back to default
    const policy = (company as Record<string, unknown>).slaPolicy || DEFAULT_SLA_POLICY;
    const slaEnabled = company.settings?.slaEnabled ?? true;

    res.json({
      policy,
      slaEnabled,
      isCustom: !!(company as Record<string, unknown>).slaPolicy,
    });
  })
);

// ─── PATCH /sla/policy ──────────────────────────────────────────────────────

/**
 * PATCH /sla/policy
 * Update company SLA policy (admin only)
 */
router.patch(
  '/policy',
  roleGuard('admin'),
  asyncHandler(async (req: AuthRequest, res: Response) => {
    const companyId = getCompanyId(req);

    const policy = slaPolicySchema.parse(req.body) as SLAPolicy;

    await Company.updateOne(
      { _id: companyId },
      { $set: { slaPolicy: policy } }
    );

    childLogger.info(
      { companyId, policy },
      'SLA policy updated'
    );

    res.json({
      success: true,
      message: 'SLA policy updated',
      policy,
    });
  })
);

// ─── POST /sla/breaches/:id/review ──────────────────────────────────────────

/**
 * POST /sla/breaches/:id/review
 * Document root cause for a breach record
 */
router.post(
  '/breaches/:id/review',
  roleGuard('manager', 'admin'),
  asyncHandler(async (req: AuthRequest, res: Response) => {
    const companyId = getCompanyId(req);
    const id = req.params.id as string;

    if (!mongoose.Types.ObjectId.isValid(id)) {
      throw AppError.badRequest('Invalid breach record ID');
    }

    const { rootCause } = breachReviewSchema.parse(req.body);

    const breachRecord = await SLABreachRecord.findOneAndUpdate(
      {
        _id: id,
        companyId: new mongoose.Types.ObjectId(companyId),
      },
      {
        rootCause,
      },
      { new: true }
    );

    if (!breachRecord) {
      throw AppError.notFound('SLA Breach Record');
    }

    childLogger.info(
      { breachId: id, companyId, rootCause },
      'SLA breach reviewed'
    );

    res.json({ breachRecord });
  })
);

// ─── GET /sla/summary ───────────────────────────────────────────────────────

/**
 * GET /sla/summary
 * Quick overview of current SLA status
 */
router.get(
  '/summary',
  roleGuard('manager', 'admin', 'agent'),
  asyncHandler(async (req: AuthRequest, res: Response) => {
    const companyId = getCompanyId(req);
    const companyObjectId = new mongoose.Types.ObjectId(companyId);
    const now = new Date();
    const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());

    const [openTickets, atRiskCounts, breachesToday] = await Promise.all([
      // Count open tickets with SLA
      Ticket.countDocuments({
        companyId: companyObjectId,
        status: { $in: ['new', 'open', 'pending'] },
        'sla.responseDeadline': { $exists: true },
      }),

      // Count at-risk by status (done in aggregation for efficiency)
      Ticket.aggregate([
        {
          $match: {
            companyId: companyObjectId,
            status: { $in: ['new', 'open', 'pending'] },
            'sla.responseDeadline': { $exists: true },
            'sla.isBreached': { $ne: true },
          },
        },
        {
          $project: {
            timeToBreachMs: {
              $subtract: ['$sla.responseDeadline', now],
            },
          },
        },
        {
          $group: {
            _id: null,
            critical: {
              $sum: {
                $cond: [
                  { $and: [{ $gt: ['$timeToBreachMs', 0] }, { $lte: ['$timeToBreachMs', 1800000] }] },
                  1,
                  0,
                ],
              },
            },
            warning: {
              $sum: {
                $cond: [
                  { $and: [{ $gt: ['$timeToBreachMs', 1800000] }, { $lte: ['$timeToBreachMs', 3600000] }] },
                  1,
                  0,
                ],
              },
            },
          },
        },
      ]),

      // Count breaches today
      SLABreachRecord.countDocuments({
        companyId: companyObjectId,
        breachedAt: { $gte: todayStart },
      }),
    ]);

    const riskCounts = atRiskCounts[0] || { critical: 0, warning: 0 };

    res.json({
      openWithSLA: openTickets,
      critical: riskCounts.critical,
      warning: riskCounts.warning,
      breachesToday,
    });
  })
);

export default router;
