import { Router, Request, Response } from 'express';
import mongoose from 'mongoose';
import { asyncHandler } from '../middleware/errorHandler.js';
import { AppError } from '../middleware/AppError.js';
import { logger } from '../config/logger.js';
import { Ticket } from '../models/Ticket.js';
import { FeedbackEvent } from '../models/FeedbackEvent.js';

const router = Router();
const childLogger = logger.child({ route: 'analytics' });

// Request with user context
interface AuthRequest extends Request {
  user?: {
    sub: string;
    companyId: string;
    role: string;
  };
}

// Issue type labels for display
const issueLabels: Record<string, string> = {
  wrong_tone: 'Wrong tone',
  inaccurate_info: 'Incorrect information',
  incomplete_response: 'Missing context',
  too_long: 'Too long',
  too_short: 'Too short',
  other: 'Other',
};

/**
 * GET /analytics/agent-stats - Get stats for logged-in agent
 */
router.get(
  '/agent-stats',
  asyncHandler(async (req: AuthRequest, res: Response) => {
    const companyId = req.user?.companyId;
    const agentId = req.user?.sub;

    if (!companyId || !agentId) {
      throw AppError.unauthorized('Missing user context');
    }

    const now = new Date();
    const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    const monthAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

    const companyObjectId = new mongoose.Types.ObjectId(companyId);

    // Get ticket counts
    const [ticketsWeek, ticketsMonth, aiDraftStats, avgResponseTime] = await Promise.all([
      // Tickets handled this week
      Ticket.countDocuments({
        companyId: companyObjectId,
        assignedTo: agentId,
        updatedAt: { $gte: weekAgo },
      }),

      // Tickets handled this month
      Ticket.countDocuments({
        companyId: companyObjectId,
        assignedTo: agentId,
        updatedAt: { $gte: monthAgo },
      }),

      // AI draft usage stats
      Ticket.aggregate([
        {
          $match: {
            companyId: companyObjectId,
            assignedTo: agentId,
            'aiDraft.content': { $exists: true },
            updatedAt: { $gte: monthAgo },
          },
        },
        {
          $group: {
            _id: null,
            total: { $sum: 1 },
            unedited: {
              $sum: {
                $cond: [{ $not: ['$aiDraft.edits'] }, 1, 0],
              },
            },
          },
        },
      ]),

      // Average response time
      Ticket.aggregate([
        {
          $match: {
            companyId: companyObjectId,
            assignedTo: agentId,
            'sla.firstResponseAt': { $exists: true },
            updatedAt: { $gte: monthAgo },
          },
        },
        {
          $project: {
            responseTime: {
              $divide: [
                { $subtract: ['$sla.firstResponseAt', '$createdAt'] },
                60000, // Convert to minutes
              ],
            },
          },
        },
        {
          $group: {
            _id: null,
            avg: { $avg: '$responseTime' },
          },
        },
      ]),
    ]);

    // Calculate AI draft percentage
    const draftData = aiDraftStats[0] || { total: 0, unedited: 0 };
    const aiDraftUsedPercentage =
      draftData.total > 0 ? Math.round((draftData.unedited / draftData.total) * 100) : 0;

    // Get top issues from feedback
    const topIssues = await FeedbackEvent.aggregate([
      {
        $match: {
          companyId: companyObjectId,
          agentId,
          issueType: { $exists: true, $ne: null },
          createdAt: { $gte: monthAgo },
        },
      },
      {
        $group: {
          _id: '$issueType',
          count: { $sum: 1 },
        },
      },
      { $sort: { count: -1 } },
      { $limit: 5 },
    ]);

    // Get draft usage by day for the past week
    const draftUsageByDay = await Ticket.aggregate([
      {
        $match: {
          companyId: companyObjectId,
          assignedTo: agentId,
          'aiDraft.generatedAt': { $gte: weekAgo },
        },
      },
      {
        $group: {
          _id: {
            $dateToString: { format: '%m/%d', date: '$aiDraft.generatedAt' },
          },
          draftsUsed: { $sum: 1 },
          draftsEdited: {
            $sum: { $cond: [{ $ifNull: ['$aiDraft.edits', false] }, 1, 0] },
          },
        },
      },
      { $sort: { _id: 1 } },
      { $limit: 7 },
    ]);

    childLogger.debug({ agentId, ticketsWeek, ticketsMonth }, 'Agent stats fetched');

    res.json({
      stats: {
        ticketsHandledWeek: ticketsWeek,
        ticketsHandledMonth: ticketsMonth,
        aiDraftUsedPercentage,
        averageResponseTime: Math.round(avgResponseTime[0]?.avg || 0),
      },
      topIssues: topIssues.map((issue) => ({
        type: issue._id,
        label: issueLabels[issue._id] || issue._id,
        count: issue.count,
      })),
      draftUsageByDay: draftUsageByDay.map((day) => ({
        date: day._id,
        draftsUsed: day.draftsUsed,
        draftsEdited: day.draftsEdited,
      })),
    });
  })
);

/**
 * GET /analytics/summary - Get company-wide analytics summary
 */
router.get(
  '/summary',
  asyncHandler(async (req: AuthRequest, res: Response) => {
    const companyId = req.user?.companyId;
    if (!companyId) {
      throw AppError.unauthorized('Missing company context');
    }

    const period = (req.query.period as string) || 'week';
    const now = new Date();
    let startDate: Date;

    switch (period) {
      case 'day':
        startDate = new Date(now.getTime() - 24 * 60 * 60 * 1000);
        break;
      case 'month':
        startDate = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
        break;
      default: // week
        startDate = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    }

    const companyObjectId = new mongoose.Types.ObjectId(companyId);

    const [ticketMetrics, aiMetrics, slaMetrics] = await Promise.all([
      // Ticket metrics
      Ticket.aggregate([
        { $match: { companyId: companyObjectId, createdAt: { $gte: startDate } } },
        {
          $group: {
            _id: null,
            total: { $sum: 1 },
            resolved: {
              $sum: { $cond: [{ $in: ['$status', ['solved', 'closed']] }, 1, 0] },
            },
            pending: {
              $sum: { $cond: [{ $in: ['$status', ['new', 'open', 'pending']] }, 1, 0] },
            },
          },
        },
      ]),

      // AI metrics
      Ticket.aggregate([
        {
          $match: {
            companyId: companyObjectId,
            'aiDraft.content': { $exists: true },
            createdAt: { $gte: startDate },
          },
        },
        {
          $group: {
            _id: null,
            total: { $sum: 1 },
            approved: { $sum: { $cond: ['$aiDraft.approved', 1, 0] } },
            edited: {
              $sum: { $cond: [{ $ifNull: ['$aiDraft.edits', false] }, 1, 0] },
            },
          },
        },
      ]),

      // SLA metrics
      Ticket.aggregate([
        { $match: { companyId: companyObjectId, createdAt: { $gte: startDate } } },
        {
          $group: {
            _id: null,
            total: { $sum: 1 },
            breached: { $sum: { $cond: ['$sla.isBreached', 1, 0] } },
          },
        },
      ]),
    ]);

    const tickets = ticketMetrics[0] || { total: 0, resolved: 0, pending: 0 };
    const ai = aiMetrics[0] || { total: 0, approved: 0, edited: 0 };
    const sla = slaMetrics[0] || { total: 0, breached: 0 };

    res.json({
      ticketMetrics: {
        total: tickets.total,
        resolved: tickets.resolved,
        pending: tickets.pending,
        averageResolutionTime: 0, // TODO: Calculate
      },
      aiMetrics: {
        draftAcceptanceRate: ai.total > 0 ? Math.round((ai.approved / ai.total) * 100) : 0,
        averageConfidence: 0, // TODO: Calculate
        editRate: ai.total > 0 ? Math.round((ai.edited / ai.total) * 100) : 0,
      },
      slaMetrics: {
        compliance: sla.total > 0 ? Math.round(((sla.total - sla.breached) / sla.total) * 100) : 100,
        breaches: sla.breached,
      },
    });
  })
);

export default router;
