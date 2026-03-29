import { Router, Request, Response } from 'express';
import { z } from 'zod';
import Twilio from 'twilio';
import { Escalation } from '../models/Escalation.js';
import { emitEscalationAccepted, emitEscalationResolved } from '../sockets/escalationSocket.js';
import { asyncHandler } from '../middleware/errorHandler.js';
import { AppError } from '../middleware/AppError.js';
import { logger } from '../config/logger.js';
import { env } from '../config/env.js';
import { summaryQueue } from '../queues/index.js';
import { CHANNELS } from '../config/constants.js';

const router = Router();
const childLogger = logger.child({ route: 'escalations' });
const twilioClient = Twilio(env.TWILIO_ACCOUNT_SID, env.TWILIO_AUTH_TOKEN);

// Request with user context
interface AuthRequest extends Request {
  user?: {
    sub: string;
    companyId: string;
    role: string;
    name?: string;
    phone?: string;
  };
}

// Validation schemas
const acceptSchema = z.object({
  agentPhone: z.string().optional(),
});

const resolveSchema = z.object({
  disposition: z.enum([
    'resolved',
    'follow_up_needed',
    'transferred',
    'customer_hung_up',
    'unresolved',
  ]),
  note: z.string().max(2000).optional(),
});

/**
 * GET /escalations
 * Returns waiting + accepted escalations, sorted by priority then holdStarted
 */
router.get(
  '/',
  asyncHandler(async (req: AuthRequest, res: Response) => {
    const companyId = req.user?.companyId;
    if (!companyId) {
      throw AppError.unauthorized('Missing company context');
    }

    const escalations = await Escalation.find({
      companyId,
      status: { $in: ['waiting', 'accepted'] },
    })
      .sort({ priority: -1, holdStarted: 1 }) // Urgent first, then longest waiting
      .lean();

    // Map priority to sort order (urgent=4, high=3, medium=2, low=1)
    const priorityOrder: Record<string, number> = {
      urgent: 4,
      high: 3,
      medium: 2,
      low: 1,
    };

    // Re-sort with proper priority ordering
    escalations.sort((a, b) => {
      const aPriority = priorityOrder[a.priority] || 0;
      const bPriority = priorityOrder[b.priority] || 0;
      if (aPriority !== bPriority) {
        return bPriority - aPriority; // Higher priority first
      }
      // Same priority: oldest first
      return new Date(a.holdStarted).getTime() - new Date(b.holdStarted).getTime();
    });

    // Calculate stats
    const waiting = escalations.filter((e) => e.status === 'waiting');
    const accepted = escalations.filter((e) => e.status === 'accepted');
    const longestHoldMs = waiting.length > 0
      ? Date.now() - new Date(waiting[0].holdStarted).getTime()
      : 0;

    res.json({
      escalations: escalations.map((e) => ({
        id: e._id.toString(),
        callId: e.callId,
        callerPhone: maskPhoneNumber(e.callerPhone),
        reason: e.reason,
        priority: e.priority,
        brief: e.brief,
        lastFiveTurns: e.lastFiveTurns,
        entities: e.entities,
        sentiment: e.sentiment,
        status: e.status,
        holdStarted: e.holdStarted,
        acceptedAt: e.acceptedAt,
        acceptedBy: e.acceptedBy,
        customerName: e.customerName,
        customerTier: e.customerTier,
        customerKnownIssues: e.customerKnownIssues,
      })),
      stats: {
        waitingCount: waiting.length,
        acceptedCount: accepted.length,
        longestHoldSeconds: Math.floor(longestHoldMs / 1000),
      },
    });
  })
);

/**
 * GET /escalations/:id
 * Get single escalation with full context
 */
router.get(
  '/:id',
  asyncHandler(async (req: AuthRequest, res: Response) => {
    const companyId = req.user?.companyId;
    if (!companyId) {
      throw AppError.unauthorized('Missing company context');
    }

    const { id } = req.params;

    const escalation = await Escalation.findOne({ _id: id, companyId }).lean();

    if (!escalation) {
      throw AppError.notFound('Escalation');
    }

    res.json({
      id: escalation._id.toString(),
      callId: escalation.callId,
      callerPhone: maskPhoneNumber(escalation.callerPhone),
      reason: escalation.reason,
      priority: escalation.priority,
      brief: escalation.brief,
      lastFiveTurns: escalation.lastFiveTurns,
      entities: escalation.entities,
      sentiment: escalation.sentiment,
      status: escalation.status,
      holdStarted: escalation.holdStarted,
      acceptedAt: escalation.acceptedAt,
      acceptedBy: escalation.acceptedBy,
      resolvedAt: escalation.resolvedAt,
      disposition: escalation.disposition,
      note: escalation.note,
      customerName: escalation.customerName,
      customerTier: escalation.customerTier,
      customerKnownIssues: escalation.customerKnownIssues,
    });
  })
);

/**
 * POST /escalations/:id/accept
 * Accept an escalation and optionally call the agent
 */
router.post(
  '/:id/accept',
  asyncHandler(async (req: AuthRequest, res: Response) => {
    const companyId = req.user?.companyId;
    const agentId = req.user?.sub;
    const agentName = req.user?.name || 'Agent';

    if (!companyId || !agentId) {
      throw AppError.unauthorized('Missing company context');
    }

    const { id } = req.params;
    const { agentPhone } = acceptSchema.parse(req.body);

    // Find and update escalation atomically
    const escalation = await Escalation.findOneAndUpdate(
      {
        _id: id,
        companyId,
        status: 'waiting',
      },
      {
        $set: {
          status: 'accepted',
          acceptedAt: new Date(),
          acceptedBy: agentId,
          agentPhone,
        },
      },
      { new: true }
    );

    if (!escalation) {
      throw AppError.notFound('Escalation not found or already accepted');
    }

    childLogger.info({ escalationId: id, agentId }, 'Escalation accepted');

    // Emit socket event
    emitEscalationAccepted(companyId, id, agentName);

    // Call agent via Twilio if phone provided
    if (agentPhone && escalation.twilioCallSid) {
      try {
        // Create outbound call to agent
        const agentCall = await twilioClient.calls.create({
          to: agentPhone,
          from: env.TWILIO_PHONE_NUMBER,
          twiml: `
            <Response>
              <Say voice="Polly.Joanna">Incoming escalation. Customer reason: ${escalation.reason}. Connecting now.</Say>
              <Dial>
                <Conference beep="true" endConferenceOnExit="false">
                  escalation-${id}
                </Conference>
              </Dial>
            </Response>
          `,
        });

        childLogger.info({ agentCallSid: agentCall.sid, agentPhone }, 'Agent call initiated');
      } catch (error) {
        childLogger.error({ error, agentPhone }, 'Failed to call agent');
        // Don't fail the acceptance, just log the error
      }
    }

    res.json({
      success: true,
      escalation: {
        id: escalation._id.toString(),
        status: escalation.status,
        acceptedAt: escalation.acceptedAt,
        acceptedBy: escalation.acceptedBy,
      },
    });
  })
);

/**
 * POST /escalations/:id/resolve
 * Resolve an escalation with disposition
 */
router.post(
  '/:id/resolve',
  asyncHandler(async (req: AuthRequest, res: Response) => {
    const companyId = req.user?.companyId;
    const agentId = req.user?.sub;

    if (!companyId || !agentId) {
      throw AppError.unauthorized('Missing company context');
    }

    const { id } = req.params;
    const { disposition, note } = resolveSchema.parse(req.body);

    // Find and update escalation
    const escalation = await Escalation.findOneAndUpdate(
      {
        _id: id,
        companyId,
        status: 'accepted',
        acceptedBy: agentId,
      },
      {
        $set: {
          status: 'resolved',
          resolvedAt: new Date(),
          disposition,
          note,
        },
      },
      { new: true }
    );

    if (!escalation) {
      throw AppError.notFound('Escalation not found or not accepted by you');
    }

    childLogger.info({ escalationId: id, disposition }, 'Escalation resolved');

    // Emit socket event
    emitEscalationResolved(companyId, id, disposition);

    // Queue summary generation
    await summaryQueue.add(
      'generate-summary',
      {
        interactionId: escalation.callId,
        companyId,
        channel: CHANNELS.VOICE,
      },
      {
        jobId: `summary-${escalation.callId}`,
      }
    );

    res.json({
      success: true,
      escalation: {
        id: escalation._id.toString(),
        status: escalation.status,
        resolvedAt: escalation.resolvedAt,
        disposition: escalation.disposition,
      },
    });
  })
);

/**
 * POST /escalations/next
 * Accept the next highest priority waiting escalation
 */
router.post(
  '/next',
  asyncHandler(async (req: AuthRequest, res: Response) => {
    const companyId = req.user?.companyId;
    const agentId = req.user?.sub;
    const agentName = req.user?.name || 'Agent';

    if (!companyId || !agentId) {
      throw AppError.unauthorized('Missing company context');
    }

    const { agentPhone } = acceptSchema.parse(req.body);

    // Find the highest priority, longest waiting escalation
    const priorityOrder: Record<string, number> = {
      urgent: 4,
      high: 3,
      medium: 2,
      low: 1,
    };

    const waitingEscalations = await Escalation.find({
      companyId,
      status: 'waiting',
    })
      .sort({ holdStarted: 1 })
      .lean();

    if (waitingEscalations.length === 0) {
      res.json({ success: false, message: 'No escalations waiting' });
      return;
    }

    // Sort by priority then hold time
    waitingEscalations.sort((a, b) => {
      const aPriority = priorityOrder[a.priority] || 0;
      const bPriority = priorityOrder[b.priority] || 0;
      if (aPriority !== bPriority) {
        return bPriority - aPriority;
      }
      return new Date(a.holdStarted).getTime() - new Date(b.holdStarted).getTime();
    });

    const nextEscalation = waitingEscalations[0];

    // Accept it atomically
    const escalation = await Escalation.findOneAndUpdate(
      {
        _id: nextEscalation._id,
        companyId,
        status: 'waiting',
      },
      {
        $set: {
          status: 'accepted',
          acceptedAt: new Date(),
          acceptedBy: agentId,
          agentPhone,
        },
      },
      { new: true }
    );

    if (!escalation) {
      // Race condition - someone else accepted it
      res.json({ success: false, message: 'Escalation was just accepted by another agent' });
      return;
    }

    childLogger.info({ escalationId: escalation._id, agentId }, 'Next escalation accepted');

    // Emit socket event
    emitEscalationAccepted(companyId, escalation._id.toString(), agentName);

    res.json({
      success: true,
      escalation: {
        id: escalation._id.toString(),
        callId: escalation.callId,
        reason: escalation.reason,
        priority: escalation.priority,
        brief: escalation.brief,
        status: escalation.status,
        acceptedAt: escalation.acceptedAt,
      },
    });
  })
);

/**
 * Mask phone number for display
 */
function maskPhoneNumber(phone: string): string {
  if (!phone || phone.length < 4) return '****';
  return '***-***-' + phone.slice(-4);
}

export default router;
