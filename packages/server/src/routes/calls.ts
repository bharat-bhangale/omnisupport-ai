import { Router, Response } from 'express';
import { z } from 'zod';
import mongoose from 'mongoose';
import { CallSession } from '../models/CallSession.js';
import { Escalation } from '../models/Escalation.js';
import { asyncHandler } from '../middleware/errorHandler.js';
import { AppError } from '../middleware/AppError.js';
import { authMiddleware, type AuthRequest } from '../middleware/auth.js';
import { logger } from '../config/logger.js';
import { emitCallEscalated } from '../sockets/activitySocket.js';
import { getIO } from '../sockets/index.js';

const router = Router();
const childLogger = logger.child({ route: 'calls' });

// All routes require authentication
router.use(authMiddleware);

/**
 * Mask phone number for privacy (show last 4 digits)
 */
function maskPhone(phone: string): string {
  if (!phone || phone.length < 4) return '****';
  return `***-***-${phone.slice(-4)}`;
}

/**
 * Calculate call duration in seconds
 */
function calculateDuration(startedAt: Date, endedAt?: Date): number {
  const end = endedAt || new Date();
  return Math.floor((end.getTime() - new Date(startedAt).getTime()) / 1000);
}

/**
 * GET /calls/active — List all active calls for company
 */
router.get(
  '/active',
  asyncHandler(async (req: AuthRequest, res: Response) => {
    const { companyId } = req.user;

    const activeCalls = await CallSession.find({
      companyId,
      status: 'active',
    })
      .select('callId callerPhone language status startedAt turns intent sentiment qaScore')
      .sort({ startedAt: -1 })
      .lean();

    const calls = activeCalls.map((call) => {
      const lastTurn = call.turns?.[call.turns.length - 1];
      
      return {
        callId: call.callId,
        callerPhone: maskPhone(call.callerPhone),
        language: call.language,
        duration: calculateDuration(call.startedAt),
        currentIntent: call.intent || lastTurn?.toolName || 'greeting',
        confidence: lastTurn?.confidence || 0.85,
        sentimentScore: call.sentiment?.scores?.positive || 0.5,
        sentimentTrend: call.sentiment?.trend || 'stable',
        status: call.status,
        turnCount: call.turns?.length || 0,
        startedAt: call.startedAt,
      };
    });

    res.json({ calls, count: calls.length });
  })
);

/**
 * GET /calls/:id/transcript — Get full transcript for a call
 */
router.get(
  '/:id/transcript',
  asyncHandler(async (req: AuthRequest, res: Response) => {
    const { companyId } = req.user;
    const { id } = req.params;

    // Try to find by callId first, then by _id
    let call = await CallSession.findOne({
      companyId,
      callId: id,
    })
      .select('callId callerPhone language status startedAt endedAt turns intent sentiment slots summary qaScore')
      .lean();

    if (!call && mongoose.Types.ObjectId.isValid(id)) {
      call = await CallSession.findOne({
        companyId,
        _id: id,
      })
        .select('callId callerPhone language status startedAt endedAt turns intent sentiment slots summary qaScore')
        .lean();
    }

    if (!call) {
      throw AppError.notFound('Call');
    }

    res.json({
      call: {
        callId: call.callId,
        callerPhone: maskPhone(call.callerPhone),
        language: call.language,
        status: call.status,
        duration: calculateDuration(call.startedAt, call.endedAt),
        startedAt: call.startedAt,
        endedAt: call.endedAt,
        intent: call.intent,
        sentiment: call.sentiment,
        summary: call.summary,
        qaScore: call.qaScore,
        slots: call.slots,
      },
      turns: call.turns || [],
    });
  })
);

/**
 * GET /calls/history — Paginated history of completed calls
 */
const historyQuerySchema = z.object({
  page: z.string().transform(Number).default('1'),
  limit: z.string().transform(Number).default('20'),
  sort: z.enum(['startedAt', 'duration', 'qaScore']).default('startedAt'),
  order: z.enum(['asc', 'desc']).default('desc'),
  status: z.enum(['completed', 'escalated', 'failed', 'all']).default('all'),
  startDate: z.string().optional(),
  endDate: z.string().optional(),
});

router.get(
  '/history',
  asyncHandler(async (req: AuthRequest, res: Response) => {
    const { companyId } = req.user;
    const params = historyQuerySchema.parse(req.query);

    const query: Record<string, unknown> = {
      companyId,
      status: { $ne: 'active' },
    };

    // Filter by status
    if (params.status !== 'all') {
      query.status = params.status;
    }

    // Filter by date range
    if (params.startDate || params.endDate) {
      query.startedAt = {};
      if (params.startDate) {
        (query.startedAt as Record<string, Date>).$gte = new Date(params.startDate);
      }
      if (params.endDate) {
        (query.startedAt as Record<string, Date>).$lte = new Date(params.endDate);
      }
    }

    // Build sort
    const sortObj: Record<string, 1 | -1> = {
      [params.sort]: params.order === 'desc' ? -1 : 1,
    };

    const skip = (params.page - 1) * params.limit;

    const [calls, total] = await Promise.all([
      CallSession.find(query)
        .select('callId callerPhone language status startedAt endedAt intent sentiment summary qaScore recording.durationSeconds')
        .sort(sortObj)
        .skip(skip)
        .limit(params.limit)
        .lean(),
      CallSession.countDocuments(query),
    ]);

    const formattedCalls = calls.map((call) => ({
      id: call._id,
      callId: call.callId,
      callerPhone: maskPhone(call.callerPhone),
      language: call.language,
      status: call.status,
      duration: call.recording?.durationSeconds || calculateDuration(call.startedAt, call.endedAt),
      startedAt: call.startedAt,
      endedAt: call.endedAt,
      intent: call.intent,
      sentiment: call.sentiment?.overall,
      summary: call.summary?.slice(0, 150),
      qaScore: call.qaScore,
    }));

    res.json({
      calls: formattedCalls,
      pagination: {
        page: params.page,
        limit: params.limit,
        total,
        totalPages: Math.ceil(total / params.limit),
      },
    });
  })
);

/**
 * GET /calls/stats — Quick stats for dashboard header
 */
router.get(
  '/stats',
  asyncHandler(async (req: AuthRequest, res: Response) => {
    const { companyId } = req.user;
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const [activeCalls, todayCalls, escalatedToday, avgQAScore] = await Promise.all([
      CallSession.countDocuments({ companyId, status: 'active' }),
      CallSession.countDocuments({ companyId, startedAt: { $gte: today } }),
      CallSession.countDocuments({
        companyId,
        status: 'escalated',
        startedAt: { $gte: today },
      }),
      CallSession.aggregate([
        { $match: { companyId: new mongoose.Types.ObjectId(companyId), qaScore: { $exists: true } } },
        { $group: { _id: null, avg: { $avg: '$qaScore' } } },
      ]),
    ]);

    res.json({
      activeCalls,
      todayCalls,
      escalatedToday,
      avgQAScore: avgQAScore[0]?.avg || 0,
    });
  })
);

/**
 * POST /calls/:id/escalate — Manually escalate a call
 */
const escalateSchema = z.object({
  reason: z.string().min(1).max(500),
  priority: z.enum(['low', 'medium', 'high', 'urgent']).default('medium'),
});

router.post(
  '/:id/escalate',
  asyncHandler(async (req: AuthRequest, res: Response) => {
    const { companyId, userId } = req.user;
    const { id } = req.params;
    const data = escalateSchema.parse(req.body);

    // Find the active call
    const call = await CallSession.findOne({
      companyId,
      callId: id,
      status: 'active',
    });

    if (!call) {
      throw AppError.notFound('Active call');
    }

    // Update call status
    call.status = 'escalated';
    call.escalation = {
      escalatedAt: new Date(),
      reason: data.reason,
      agentId: userId,
    };
    await call.save();

    // Create escalation record
    const escalation = new Escalation({
      companyId,
      callId: call._id,
      callerPhone: call.callerPhone,
      reason: data.reason,
      priority: data.priority,
      brief: `Manual escalation: ${data.reason}`,
      lastFiveTurns: call.turns?.slice(-5) || [],
      entities: call.slots,
      sentiment: call.sentiment?.overall || 'neutral',
      status: 'waiting',
      holdStarted: new Date(),
    });
    await escalation.save();

    // Emit socket events
    const io = getIO();
    if (io) {
      io.to(`company:${companyId}`).emit('call:escalated', {
        callId: call.callId,
        reason: data.reason,
        priority: data.priority,
      });

      io.to(`company:${companyId}:agents`).emit('escalation:incoming', {
        escalationId: escalation._id,
        callId: call.callId,
        callerPhone: maskPhone(call.callerPhone),
        reason: data.reason,
        priority: data.priority,
        sentiment: call.sentiment?.overall,
      });
    }

    // Emit activity event
    await emitCallEscalated(companyId, call.callId, data.reason);

    childLogger.info(
      { callId: call.callId, reason: data.reason, escalatedBy: userId },
      'Call manually escalated'
    );

    res.json({
      success: true,
      escalationId: escalation._id,
      message: 'Call escalated successfully',
    });
  })
);

export default router;
