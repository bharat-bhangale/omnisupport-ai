import { Router, Request, Response } from 'express';
import mongoose from 'mongoose';
import { asyncHandler } from '../middleware/errorHandler.js';
import { AppError } from '../middleware/AppError.js';
import { logger } from '../config/logger.js';
import { Ticket } from '../models/Ticket.js';
import { FeedbackEvent } from '../models/FeedbackEvent.js';
import { CallSession } from '../models/CallSession.js';
import { Escalation } from '../models/Escalation.js';
import * as analyticsService from '../services/analytics.js';
import { getAnalytics } from '../queues/analyticsCacheWorker.js';
import { roleGuard } from '../middleware/roleGuard.js';
import { getRecentActivity } from '../sockets/activitySocket.js';

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

// Helper functions
function maskPhone(phone: string): string {
  if (!phone || phone.length < 4) return '****';
  return `***-***-${phone.slice(-4)}`;
}

function truncate(str: string, length: number): string {
  if (!str) return '';
  if (str.length <= length) return str;
  return str.slice(0, length - 3) + '...';
}

/**
 * GET /analytics/dashboard - Get dashboard summary stats
 */
router.get(
  '/dashboard',
  asyncHandler(async (req: AuthRequest, res: Response) => {
    const companyId = req.user?.companyId;
    if (!companyId) {
      throw AppError.unauthorized('Missing company context');
    }

    const days = parseInt(req.query.days as string) || 1;
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - days);
    startDate.setHours(0, 0, 0, 0);

    const previousStartDate = new Date(startDate);
    previousStartDate.setDate(previousStartDate.getDate() - days);

    const companyObjectId = new mongoose.Types.ObjectId(companyId);

    // Run all queries in parallel
    const [
      activeCalls,
      openTickets,
      previousOpenTickets,
      todaysCalls,
      previousCalls,
      resolvedCalls,
      previousResolvedCalls,
      escalations,
    ] = await Promise.all([
      // Active calls right now
      CallSession.countDocuments({
        companyId: companyObjectId,
        status: 'active',
      }),

      // Open tickets
      Ticket.countDocuments({
        companyId: companyObjectId,
        status: { $in: ['open', 'pending', 'in_progress', 'new'] },
      }),

      // Previous day open tickets (for trend)
      Ticket.countDocuments({
        companyId: companyObjectId,
        status: { $in: ['open', 'pending', 'in_progress', 'new'] },
        createdAt: { $lt: startDate },
      }),

      // Today's total calls
      CallSession.countDocuments({
        companyId: companyObjectId,
        startedAt: { $gte: startDate },
      }),

      // Previous period calls
      CallSession.countDocuments({
        companyId: companyObjectId,
        startedAt: { $gte: previousStartDate, $lt: startDate },
      }),

      // AI resolved calls (not escalated)
      CallSession.countDocuments({
        companyId: companyObjectId,
        startedAt: { $gte: startDate },
        status: 'completed',
        'escalation.escalatedAt': { $exists: false },
      }),

      // Previous AI resolved
      CallSession.countDocuments({
        companyId: companyObjectId,
        startedAt: { $gte: previousStartDate, $lt: startDate },
        status: 'completed',
        'escalation.escalatedAt': { $exists: false },
      }),

      // Active escalations
      Escalation.countDocuments({
        companyId: companyObjectId,
        status: 'waiting',
      }),
    ]);

    // Calculate metrics
    const aiResolutionRate = todaysCalls > 0 ? (resolvedCalls / todaysCalls) * 100 : 0;
    const previousResolutionRate =
      previousCalls > 0 ? (previousResolvedCalls / previousCalls) * 100 : 0;

    // Estimate cost savings ($2.50 per AI-resolved interaction)
    const costPerInteraction = 2.5;
    const costSavedToday = resolvedCalls * costPerInteraction;

    // Open ticket trend
    const openTicketTrend = openTickets - previousOpenTickets;

    // Resolution rate trend
    const resolutionRateTrend = aiResolutionRate - previousResolutionRate;

    res.json({
      activeCalls,
      openTickets,
      openTicketTrend,
      aiResolutionRate: Math.round(aiResolutionRate * 10) / 10,
      resolutionRateTrend: Math.round(resolutionRateTrend * 10) / 10,
      costSavedToday: Math.round(costSavedToday),
      interactionsToday: todaysCalls + resolvedCalls,
      waitingEscalations: escalations,
      timestamp: new Date().toISOString(),
    });
  })
);

/**
 * GET /analytics/activity - Get live activity feed
 * First tries Redis-stored events, then falls back to MongoDB aggregation
 */
router.get(
  '/activity',
  asyncHandler(async (req: AuthRequest, res: Response) => {
    const companyId = req.user?.companyId;
    if (!companyId) {
      throw AppError.unauthorized('Missing company context');
    }

    const limit = Math.min(parseInt(req.query.limit as string) || 10, 50);

    // Try to get recent activities from Redis first (real-time events)
    const redisActivities = await getRecentActivity(companyId, limit);

    if (redisActivities.length >= limit) {
      // We have enough from Redis
      return res.json({
        activities: redisActivities.slice(0, limit),
        timestamp: new Date().toISOString(),
        source: 'realtime',
      });
    }

    // Fall back to MongoDB aggregation for additional activities
    const companyObjectId = new mongoose.Types.ObjectId(companyId);

    const [recentCalls, recentTickets, recentEscalations] = await Promise.all([
      CallSession.find({ companyId: companyObjectId })
        .sort({ updatedAt: -1 })
        .limit(limit)
        .select('callId callerPhone status sentiment.overall startedAt endedAt intent')
        .lean(),

      Ticket.find({ companyId: companyObjectId })
        .sort({ updatedAt: -1 })
        .limit(limit)
        .select('subject status priority category updatedAt aiDraft')
        .lean(),

      Escalation.find({ companyId: companyObjectId })
        .sort({ createdAt: -1 })
        .limit(5)
        .select('callerPhone reason priority status holdStarted')
        .lean(),
    ]);

    // Transform to activity feed items
    const activities: Array<{
      id: string;
      type: string;
      description: string;
      category?: string;
      timestamp: Date;
      sentiment?: string;
      priority?: string;
    }> = [];

    // Call activities
    for (const call of recentCalls) {
      if (call.status === 'active') {
        activities.push({
          id: `call-${call.callId}`,
          type: 'call_active',
          description: `Active call from ${maskPhone(call.callerPhone)}`,
          category: call.intent || undefined,
          timestamp: call.startedAt,
          sentiment: call.sentiment?.overall,
        });
      } else if (call.status === 'completed' && call.endedAt) {
        activities.push({
          id: `call-${call.callId}-end`,
          type: 'call_completed',
          description: `Call completed with ${maskPhone(call.callerPhone)}`,
          category: call.intent || undefined,
          timestamp: call.endedAt,
          sentiment: call.sentiment?.overall,
        });
      }
    }

    // Ticket activities
    for (const ticket of recentTickets) {
      const ticketId = ticket._id.toString();
      const hasDraft = !!(ticket.aiDraft as { content?: string })?.content;

      activities.push({
        id: `ticket-${ticketId}`,
        type: hasDraft ? 'ticket_draft_ready' : 'ticket_update',
        description: truncate(ticket.subject, 60),
        category: ticket.category || undefined,
        timestamp: ticket.updatedAt,
        priority: ticket.priority,
      });
    }

    // Escalation activities
    for (const esc of recentEscalations) {
      const escId = esc._id.toString();
      activities.push({
        id: `escalation-${escId}`,
        type: esc.status === 'waiting' ? 'escalation_waiting' : 'escalation_accepted',
        description: `Escalation: ${esc.reason} from ${maskPhone(esc.callerPhone)}`,
        timestamp: esc.holdStarted || new Date(),
        priority: esc.priority,
      });
    }

    // Sort by timestamp and limit
    activities.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
    const limitedActivities = activities.slice(0, limit);

    res.json({
      activities: limitedActivities,
      timestamp: new Date().toISOString(),
    });
  })
);

/**
 * GET /analytics/active-calls - Get current active calls
 */
router.get(
  '/active-calls',
  asyncHandler(async (req: AuthRequest, res: Response) => {
    const companyId = req.user?.companyId;
    if (!companyId) {
      throw AppError.unauthorized('Missing company context');
    }

    const companyObjectId = new mongoose.Types.ObjectId(companyId);

    const activeCalls = await CallSession.find({
      companyId: companyObjectId,
      status: 'active',
    })
      .select('callId callerPhone intent sentiment.overall startedAt slots.confidence')
      .sort({ startedAt: -1 })
      .limit(20)
      .lean();

    const calls = activeCalls.map((call) => ({
      id: call.callId,
      phone: maskPhone(call.callerPhone),
      intent: call.intent || 'Unknown',
      sentiment: call.sentiment?.overall || 'neutral',
      confidence: (call.slots as Record<string, unknown>)?.confidence || 0.8,
      startedAt: call.startedAt,
      duration: Math.floor((Date.now() - new Date(call.startedAt).getTime()) / 1000),
    }));

    res.json({ calls });
  })
);

/**
 * GET /analytics/recent-tickets - Get recent tickets for dashboard
 */
router.get(
  '/recent-tickets',
  asyncHandler(async (req: AuthRequest, res: Response) => {
    const companyId = req.user?.companyId;
    if (!companyId) {
      throw AppError.unauthorized('Missing company context');
    }

    const limit = Math.min(parseInt(req.query.limit as string) || 5, 20);
    const companyObjectId = new mongoose.Types.ObjectId(companyId);

    const tickets = await Ticket.find({ companyId: companyObjectId })
      .sort({ createdAt: -1 })
      .limit(limit)
      .select('subject status priority category createdAt aiDraft')
      .lean();

    const formattedTickets = tickets.map((t) => ({
      id: t._id.toString(),
      subject: truncate(t.subject, 50),
      status: t.status,
      priority: t.priority,
      category: t.category,
      createdAt: t.createdAt,
      hasDraft: !!(t.aiDraft as { content?: string })?.content,
    }));

    res.json({ tickets: formattedTickets });
  })
);

/**
 * GET /analytics/resolution-chart - Get 7-day resolution rate data for chart
 */
router.get(
  '/resolution-chart',
  asyncHandler(async (req: AuthRequest, res: Response) => {
    const companyId = req.user?.companyId;
    if (!companyId) {
      throw AppError.unauthorized('Missing company context');
    }

    const companyObjectId = new mongoose.Types.ObjectId(companyId);
    const days = 7;
    const data: Array<{ date: string; aiResolved: number; humanResolved: number; total: number }> = [];

    for (let i = days - 1; i >= 0; i--) {
      const date = new Date();
      date.setDate(date.getDate() - i);
      date.setHours(0, 0, 0, 0);

      const nextDate = new Date(date);
      nextDate.setDate(nextDate.getDate() + 1);

      const [total, aiResolved] = await Promise.all([
        CallSession.countDocuments({
          companyId: companyObjectId,
          startedAt: { $gte: date, $lt: nextDate },
          status: { $in: ['completed', 'escalated'] },
        }),
        CallSession.countDocuments({
          companyId: companyObjectId,
          startedAt: { $gte: date, $lt: nextDate },
          status: 'completed',
          'escalation.escalatedAt': { $exists: false },
        }),
      ]);

      data.push({
        date: date.toISOString().split('T')[0],
        aiResolved,
        humanResolved: total - aiResolved,
        total,
      });
    }

    res.json({ data });
  })
);

/**
 * GET /analytics/system-status - Get integration health status
 */
router.get(
  '/system-status',
  asyncHandler(async (req: AuthRequest, res: Response) => {
    const companyId = req.user?.companyId;
    if (!companyId) {
      throw AppError.unauthorized('Missing company context');
    }

    // Get integration health
    let integrationHealth: Record<string, { status: string; lastSync?: Date }> = {};

    try {
      const { getOrchestrator } = await import('../integrations/IntegrationOrchestrator.js');
      const orchestrator = await getOrchestrator(companyId);
      const health = orchestrator.getAllHealth();

      integrationHealth = Object.fromEntries(
        Object.entries(health).map(([name, h]) => [
          name,
          { status: h.status, lastSync: h.lastSuccessAt },
        ])
      );
    } catch {
      // No integrations configured
    }

    // Add core services
    const services = {
      api: { status: 'healthy', lastSync: new Date() },
      database: { status: 'healthy', lastSync: new Date() },
      redis: { status: 'healthy', lastSync: new Date() },
      ...integrationHealth,
    };

    res.json({ services });
  })
);

/**
 * GET /analytics/call-history - Get call history with QA scores
 */
router.get(
  '/call-history',
  asyncHandler(async (req: AuthRequest, res: Response) => {
    const companyId = req.user?.companyId;
    if (!companyId) {
      throw AppError.unauthorized('Missing company context');
    }

    const page = Math.max(parseInt(req.query.page as string) || 1, 1);
    const limit = Math.min(parseInt(req.query.limit as string) || 20, 100);
    const skip = (page - 1) * limit;
    const status = req.query.status as string | undefined;
    const daysBack = parseInt(req.query.days as string) || 7;

    const companyObjectId = new mongoose.Types.ObjectId(companyId);

    const query: Record<string, unknown> = {
      companyId: companyObjectId,
      startedAt: { $gte: new Date(Date.now() - daysBack * 24 * 60 * 60 * 1000) },
    };

    if (status && ['completed', 'active', 'escalated'].includes(status)) {
      query.status = status;
    }

    const [calls, total] = await Promise.all([
      CallSession.find(query)
        .sort({ startedAt: -1 })
        .skip(skip)
        .limit(limit)
        .select('callId callerPhone intent sentiment.overall status startedAt endedAt qaScore resolution')
        .lean(),
      CallSession.countDocuments(query),
    ]);

    const formattedCalls = calls.map((call) => ({
      id: call.callId,
      phone: maskPhone(call.callerPhone),
      intent: call.intent || 'Unknown',
      sentiment: call.sentiment?.overall || 'neutral',
      status: call.status,
      startedAt: call.startedAt,
      endedAt: call.endedAt,
      duration: call.endedAt
        ? Math.floor((new Date(call.endedAt).getTime() - new Date(call.startedAt).getTime()) / 1000)
        : Math.floor((Date.now() - new Date(call.startedAt).getTime()) / 1000),
      qaScore: call.qaScore,
      resolution: call.resolution,
    }));

    res.json({
      calls: formattedCalls,
      pagination: {
        page,
        limit,
        total,
        pages: Math.ceil(total / limit),
      },
    });
  })
);

// ============================================================================
// NEW F17 ANALYTICS ENDPOINTS (Manager/Admin only)
// ============================================================================

/**
 * GET /analytics/unified-summary - Full analytics summary with caching
 */
router.get(
  '/unified-summary',
  roleGuard('manager', 'admin'),
  asyncHandler(async (req: AuthRequest, res: Response) => {
    const companyId = req.user?.companyId;
    if (!companyId) {
      throw AppError.unauthorized('Missing company context');
    }

    const days = Math.min(parseInt(req.query.days as string) || 30, 90);

    // Use cached analytics
    const analytics = await getAnalytics(companyId, days);

    res.json({
      ...analytics.summary,
      cachedAt: analytics.cachedAt,
    });
  })
);

/**
 * GET /analytics/resolution-rate - Daily resolution rate data
 */
router.get(
  '/resolution-rate',
  roleGuard('manager', 'admin'),
  asyncHandler(async (req: AuthRequest, res: Response) => {
    const companyId = req.user?.companyId;
    if (!companyId) {
      throw AppError.unauthorized('Missing company context');
    }

    const days = Math.min(parseInt(req.query.days as string) || 30, 90);
    const data = await analyticsService.getDailyResolutionRate(companyId, days);

    res.json({ data });
  })
);

/**
 * GET /analytics/cost-savings - Cost savings breakdown
 */
router.get(
  '/cost-savings',
  roleGuard('manager', 'admin'),
  asyncHandler(async (req: AuthRequest, res: Response) => {
    const companyId = req.user?.companyId;
    if (!companyId) {
      throw AppError.unauthorized('Missing company context');
    }

    const days = Math.min(parseInt(req.query.days as string) || 30, 90);
    const data = await analyticsService.getCostSavings(companyId, days);

    res.json(data);
  })
);

/**
 * GET /analytics/top-intents - Top call intents
 */
router.get(
  '/top-intents',
  roleGuard('manager', 'admin'),
  asyncHandler(async (req: AuthRequest, res: Response) => {
    const companyId = req.user?.companyId;
    if (!companyId) {
      throw AppError.unauthorized('Missing company context');
    }

    const days = Math.min(parseInt(req.query.days as string) || 30, 90);
    const data = await analyticsService.getTopIntents(companyId, days);

    res.json({ data });
  })
);

/**
 * GET /analytics/sentiment - Sentiment trend over time
 */
router.get(
  '/sentiment',
  roleGuard('manager', 'admin'),
  asyncHandler(async (req: AuthRequest, res: Response) => {
    const companyId = req.user?.companyId;
    if (!companyId) {
      throw AppError.unauthorized('Missing company context');
    }

    const days = Math.min(parseInt(req.query.days as string) || 30, 90);
    const data = await analyticsService.getSentimentTrend(companyId, days);

    res.json({ data });
  })
);

/**
 * GET /analytics/sla - SLA compliance by priority
 */
router.get(
  '/sla',
  roleGuard('manager', 'admin'),
  asyncHandler(async (req: AuthRequest, res: Response) => {
    const companyId = req.user?.companyId;
    if (!companyId) {
      throw AppError.unauthorized('Missing company context');
    }

    const days = Math.min(parseInt(req.query.days as string) || 30, 90);
    const data = await analyticsService.getSLACompliance(companyId, days);

    res.json(data);
  })
);

/**
 * GET /analytics/kb-health - Knowledge base hit rate
 */
router.get(
  '/kb-health',
  roleGuard('manager', 'admin'),
  asyncHandler(async (req: AuthRequest, res: Response) => {
    const companyId = req.user?.companyId;
    if (!companyId) {
      throw AppError.unauthorized('Missing company context');
    }

    const days = Math.min(parseInt(req.query.days as string) || 30, 90);
    const data = await analyticsService.getKBHitRate(companyId, days);

    res.json(data);
  })
);

/**
 * GET /analytics/ticket-volume - Daily ticket volume by category
 */
router.get(
  '/ticket-volume',
  roleGuard('manager', 'admin'),
  asyncHandler(async (req: AuthRequest, res: Response) => {
    const companyId = req.user?.companyId;
    if (!companyId) {
      throw AppError.unauthorized('Missing company context');
    }

    const days = Math.min(parseInt(req.query.days as string) || 30, 90);
    const data = await analyticsService.getDailyTicketVolume(companyId, days);

    res.json({ data });
  })
);

/**
 * GET /analytics/channel-distribution - Channel split data
 */
router.get(
  '/channel-distribution',
  roleGuard('manager', 'admin'),
  asyncHandler(async (req: AuthRequest, res: Response) => {
    const companyId = req.user?.companyId;
    if (!companyId) {
      throw AppError.unauthorized('Missing company context');
    }

    const days = Math.min(parseInt(req.query.days as string) || 30, 90);
    const data = await analyticsService.getChannelDistribution(companyId, days);

    res.json({ data });
  })
);

/**
 * GET /analytics/full - All analytics data (cached)
 */
router.get(
  '/full',
  roleGuard('manager', 'admin'),
  asyncHandler(async (req: AuthRequest, res: Response) => {
    const companyId = req.user?.companyId;
    if (!companyId) {
      throw AppError.unauthorized('Missing company context');
    }

    const days = Math.min(parseInt(req.query.days as string) || 30, 90);
    const analytics = await getAnalytics(companyId, days);

    res.json(analytics);
  })
);

export default router;
