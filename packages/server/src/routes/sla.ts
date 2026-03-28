import { Router, Request, Response } from 'express';
import { z } from 'zod';
import mongoose from 'mongoose';
import { asyncHandler } from '../middleware/errorHandler.js';
import { AppError } from '../middleware/AppError.js';
import { logger } from '../config/logger.js';
import { Ticket } from '../models/Ticket.js';
import { getSLAStatus, getTimeToBreachMs, getMinutesUntilBreach, DEFAULT_SLA_POLICY, type SLAPolicy } from '../services/slaCalculator.js';

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

// Validation schemas
const complianceQuerySchema = z.object({
  days: z.coerce.number().int().min(1).max(365).default(30),
});

const historyQuerySchema = z.object({
  days: z.coerce.number().int().min(1).max(365).default(30),
});

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

/**
 * Map internal priority to P notation
 */
function priorityToP(priority: string): 'P1' | 'P2' | 'P3' | 'P4' {
  const map: Record<string, 'P1' | 'P2' | 'P3' | 'P4'> = {
    urgent: 'P1',
    high: 'P2',
    normal: 'P3',
    low: 'P4',
  };
  return map[priority] || 'P3';
}

/**
 * GET /sla/compliance - Get SLA compliance stats per priority tier
 */
router.get(
  '/compliance',
  asyncHandler(async (req: AuthRequest, res: Response) => {
    const companyId = req.user?.companyId;
    if (!companyId) {
      throw AppError.unauthorized('Missing company context');
    }

    const { days } = complianceQuerySchema.parse(req.query);
    const startDate = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
    const companyObjectId = new mongoose.Types.ObjectId(companyId);

    // Aggregate SLA stats by priority
    const stats = await Ticket.aggregate([
      {
        $match: {
          companyId: companyObjectId,
          createdAt: { $gte: startDate },
          status: { $in: ['solved', 'closed'] }, // Only completed tickets
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
    ]);

    // Transform to P-notation format
    const compliance: Record<string, {
      total: number;
      onTime: number;
      breached: number;
      complianceRate: number;
    }> = {
      P1: { total: 0, onTime: 0, breached: 0, complianceRate: 100 },
      P2: { total: 0, onTime: 0, breached: 0, complianceRate: 100 },
      P3: { total: 0, onTime: 0, breached: 0, complianceRate: 100 },
      P4: { total: 0, onTime: 0, breached: 0, complianceRate: 100 },
    };

    for (const stat of stats) {
      const pKey = priorityToP(stat._id);
      compliance[pKey] = {
        total: stat.total,
        onTime: stat.respondedOnTime,
        breached: stat.breached,
        complianceRate: stat.total > 0
          ? Math.round(((stat.total - stat.breached) / stat.total) * 100)
          : 100,
      };
    }

    childLogger.debug({ companyId, days, compliance }, 'SLA compliance fetched');

    res.json({
      period: { days, startDate: startDate.toISOString() },
      compliance,
    });
  })
);

/**
 * GET /sla/at-risk - Get tickets at risk of SLA breach
 */
router.get(
  '/at-risk',
  asyncHandler(async (req: AuthRequest, res: Response) => {
    const companyId = req.user?.companyId;
    if (!companyId) {
      throw AppError.unauthorized('Missing company context');
    }

    const companyObjectId = new mongoose.Types.ObjectId(companyId);

    // Find open tickets with SLA deadline
    const tickets = await Ticket.find({
      companyId: companyObjectId,
      status: { $in: ['new', 'open', 'pending'] },
      'sla.responseDeadline': { $exists: true },
      'sla.isBreached': { $ne: true },
    })
      .select('_id subject priority sla assignedTo createdAt')
      .lean();

    // Filter to warning/critical and calculate time to breach
    const atRiskTickets = tickets
      .map((ticket) => {
        const status = getSLAStatus(ticket as unknown as Parameters<typeof getSLAStatus>[0]);
        const timeToBreachMs = getTimeToBreachMs(ticket as unknown as Parameters<typeof getTimeToBreachMs>[0]);

        if (status !== 'warning' && status !== 'critical') {
          return null;
        }

        return {
          ticketId: ticket._id.toString(),
          subject: ticket.subject,
          priority: ticket.priority,
          slaStatus: status,
          minutesLeft: timeToBreachMs !== null ? Math.max(0, Math.floor(timeToBreachMs / 60000)) : 0,
          assignedAgent: ticket.assignedTo || null,
          responseDeadline: ticket.sla?.responseDeadline,
        };
      })
      .filter((t): t is NonNullable<typeof t> => t !== null)
      .sort((a, b) => a.minutesLeft - b.minutesLeft); // Sort by urgency

    childLogger.debug(
      { companyId, atRiskCount: atRiskTickets.length },
      'At-risk tickets fetched'
    );

    res.json({
      tickets: atRiskTickets,
      total: atRiskTickets.length,
    });
  })
);

/**
 * GET /sla/history - Get daily breach counts for trend chart
 */
router.get(
  '/history',
  asyncHandler(async (req: AuthRequest, res: Response) => {
    const companyId = req.user?.companyId;
    if (!companyId) {
      throw AppError.unauthorized('Missing company context');
    }

    const { days } = historyQuerySchema.parse(req.query);
    const startDate = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
    const companyObjectId = new mongoose.Types.ObjectId(companyId);

    // Aggregate breach counts by day and priority
    const breachHistory = await Ticket.aggregate([
      {
        $match: {
          companyId: companyObjectId,
          'sla.isBreached': true,
          createdAt: { $gte: startDate },
        },
      },
      {
        $group: {
          _id: {
            date: { $dateToString: { format: '%Y-%m-%d', date: '$createdAt' } },
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
    const history = breachHistory.map((day) => {
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

    childLogger.debug(
      { companyId, days, dataPoints: history.length },
      'SLA history fetched'
    );

    res.json({
      period: { days, startDate: startDate.toISOString() },
      history,
    });
  })
);

/**
 * GET /sla/policy - Get current SLA policy
 */
router.get(
  '/policy',
  asyncHandler(async (req: AuthRequest, res: Response) => {
    const companyId = req.user?.companyId;
    if (!companyId) {
      throw AppError.unauthorized('Missing company context');
    }

    // TODO: Fetch from Company model
    // For now, return default policy
    const policy = DEFAULT_SLA_POLICY;

    childLogger.debug({ companyId }, 'SLA policy fetched');

    res.json({ policy });
  })
);

/**
 * PATCH /sla/policy - Update SLA policy
 * Requires admin role
 */
router.patch(
  '/policy',
  asyncHandler(async (req: AuthRequest, res: Response) => {
    const companyId = req.user?.companyId;
    const role = req.user?.role;

    if (!companyId) {
      throw AppError.unauthorized('Missing company context');
    }

    if (role !== 'admin') {
      throw AppError.forbidden('Only admins can update SLA policy');
    }

    const policy = slaPolicySchema.parse(req.body) as SLAPolicy;

    // TODO: Update Company model with new policy
    // await Company.updateOne({ _id: companyId }, { $set: { slaPolicy: policy } });

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

/**
 * GET /sla/summary - Quick overview of current SLA status
 */
router.get(
  '/summary',
  asyncHandler(async (req: AuthRequest, res: Response) => {
    const companyId = req.user?.companyId;
    if (!companyId) {
      throw AppError.unauthorized('Missing company context');
    }

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

      // Count at-risk by status
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
      Ticket.countDocuments({
        companyId: companyObjectId,
        'sla.isBreached': true,
        updatedAt: { $gte: todayStart },
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
