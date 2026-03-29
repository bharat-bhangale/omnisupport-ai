// ============================================================================
// FRAUD DETECTION API ROUTES
// ============================================================================

import { Router, Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { FraudIncident, Watchlist } from '../models/FraudIncident.js';
import { CallSession } from '../models/CallSession.js';
import { authMiddleware, AuthRequest } from '../middleware/auth.js';
import { roleGuard } from '../middleware/roleGuard.js';
import { AppError } from '../middleware/errorHandler.js';
import { fraudDetector } from '../services/fraudDetector.js';
import { redis } from '../config/redis.js';
import { logger } from '../config/logger.js';

const router = Router();

// Apply auth middleware to all routes
router.use(authMiddleware);

// ============================================================================
// VALIDATION SCHEMAS
// ============================================================================

const incidentsQuerySchema = z.object({
  days: z.string().transform(Number).default('30'),
  page: z.string().transform(Number).default('1'),
  limit: z.string().transform(Number).default('20'),
  riskLevel: z.enum(['low', 'medium', 'high', 'critical']).optional(),
  action: z.enum(['blocked', 'escalated', 'monitored']).optional(),
});

const watchlistSchema = z.object({
  phone: z.string().min(10).max(20),
  reason: z.string().min(1).max(500),
});

const assessSchema = z.object({
  callerPhone: z.string().min(10),
  callId: z.string().min(1),
});

// ============================================================================
// GET /fraud/incidents — List fraud incidents (paginated)
// ============================================================================

router.get(
  '/incidents',
  roleGuard('manager', 'admin'),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const authReq = req as AuthRequest;
      const { days, page, limit, riskLevel, action } = incidentsQuerySchema.parse(req.query);

      const since = new Date();
      since.setDate(since.getDate() - days);

      const query: Record<string, unknown> = {
        companyId: authReq.user.companyId,
        createdAt: { $gte: since },
      };

      if (riskLevel) query.riskLevel = riskLevel;
      if (action) query.action = action;

      const [incidents, total] = await Promise.all([
        FraudIncident.find(query)
          .sort({ createdAt: -1 })
          .skip((page - 1) * limit)
          .limit(limit)
          .lean(),
        FraudIncident.countDocuments(query),
      ]);

      res.json({
        incidents,
        pagination: {
          page,
          limit,
          total,
          pages: Math.ceil(total / limit),
        },
      });
    } catch (error) {
      next(error);
    }
  }
);

// ============================================================================
// GET /fraud/incidents/:id — Get incident details
// ============================================================================

router.get(
  '/incidents/:id',
  roleGuard('manager', 'admin'),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const authReq = req as AuthRequest;
      const { id } = req.params;

      const incident = await FraudIncident.findOne({
        _id: id,
        companyId: authReq.user.companyId,
      });

      if (!incident) {
        throw new AppError('Incident not found', 404);
      }

      // Get full transcript if available
      let transcript = incident.transcript;
      if (!transcript || transcript.length === 0) {
        const callSession = await CallSession.findOne({ callId: incident.callId });
        if (callSession?.turns) {
          transcript = callSession.turns;
        }
      }

      res.json({
        incident: {
          ...incident.toObject(),
          transcript,
        },
      });
    } catch (error) {
      next(error);
    }
  }
);

// ============================================================================
// PATCH /fraud/incidents/:id/resolve — Resolve incident
// ============================================================================

router.patch(
  '/incidents/:id/resolve',
  roleGuard('admin'),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const authReq = req as AuthRequest;
      const { id } = req.params;
      const { notes } = z.object({ notes: z.string().optional() }).parse(req.body);

      const incident = await FraudIncident.findOneAndUpdate(
        { _id: id, companyId: authReq.user.companyId },
        {
          resolvedBy: authReq.user.userId,
          resolvedAt: new Date(),
          notes,
        },
        { new: true }
      );

      if (!incident) {
        throw new AppError('Incident not found', 404);
      }

      logger.info({ incidentId: id, userId: authReq.user.userId }, 'Fraud incident resolved');

      res.json({ incident, message: 'Incident resolved' });
    } catch (error) {
      next(error);
    }
  }
);

// ============================================================================
// GET /fraud/summary — Get fraud summary stats
// ============================================================================

router.get(
  '/summary',
  roleGuard('manager', 'admin'),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const authReq = req as AuthRequest;
      const { days } = z.object({ days: z.string().transform(Number).default('30') }).parse(req.query);

      const summary = await FraudIncident.getSummary(authReq.user.companyId, days);

      res.json(summary);
    } catch (error) {
      next(error);
    }
  }
);

// ============================================================================
// GET /fraud/watchlist — List blocklist entries
// ============================================================================

router.get(
  '/watchlist',
  roleGuard('manager', 'admin'),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const authReq = req as AuthRequest;

      const entries = await Watchlist.find({ companyId: authReq.user.companyId })
        .sort({ createdAt: -1 })
        .lean();

      res.json({ entries, count: entries.length });
    } catch (error) {
      next(error);
    }
  }
);

// ============================================================================
// POST /fraud/watchlist — Add phone to blocklist
// ============================================================================

router.post(
  '/watchlist',
  roleGuard('admin'),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const authReq = req as AuthRequest;
      const { phone, reason } = watchlistSchema.parse(req.body);

      // Normalize phone
      const normalizedPhone = phone.replace(/[^0-9+]/g, '');

      // Check if already exists
      const existing = await Watchlist.findOne({
        companyId: authReq.user.companyId,
        phone: normalizedPhone,
      });

      if (existing) {
        throw new AppError('Phone already on watchlist', 409);
      }

      const entry = await Watchlist.create({
        companyId: authReq.user.companyId,
        phone: normalizedPhone,
        reason,
        addedBy: authReq.user.userId,
      });

      // Invalidate any cached assessments for this phone
      const cachePattern = `${authReq.user.companyId}:fraud:assess:${normalizedPhone}`;
      await redis.del(cachePattern);

      logger.info(
        { phone: normalizedPhone, userId: authReq.user.userId },
        'Phone added to watchlist'
      );

      res.status(201).json({ entry, message: 'Added to watchlist' });
    } catch (error) {
      next(error);
    }
  }
);

// ============================================================================
// DELETE /fraud/watchlist/:phone — Remove from blocklist
// ============================================================================

router.delete(
  '/watchlist/:phone',
  roleGuard('admin'),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const authReq = req as AuthRequest;
      const { phone } = req.params;

      const normalizedPhone = decodeURIComponent(phone).replace(/[^0-9+]/g, '');

      const entry = await Watchlist.findOneAndDelete({
        companyId: authReq.user.companyId,
        phone: normalizedPhone,
      });

      if (!entry) {
        throw new AppError('Phone not found on watchlist', 404);
      }

      logger.info(
        { phone: normalizedPhone, userId: authReq.user.userId },
        'Phone removed from watchlist'
      );

      res.json({ success: true, message: 'Removed from watchlist' });
    } catch (error) {
      next(error);
    }
  }
);

// ============================================================================
// POST /fraud/assess — Programmatic fraud assessment (internal use)
// ============================================================================

router.post(
  '/assess',
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const authReq = req as AuthRequest;
      const { callerPhone, callId } = assessSchema.parse(req.body);

      // Idempotency check
      const cacheKey = `${authReq.user.companyId}:fraud:${callId}`;
      const cached = await redis.get(cacheKey);

      if (cached) {
        return res.json({ assessment: JSON.parse(cached), cached: true });
      }

      // Run assessment
      const assessment = await fraudDetector.assessCallRisk(
        callerPhone,
        authReq.user.companyId
      );

      // Cache result
      await redis.setex(cacheKey, 3600, JSON.stringify(assessment));

      // Determine action and record if significant
      if (assessment.compositeScore > 0.3) {
        let action: 'blocked' | 'escalated' | 'monitored' = 'monitored';
        if (assessment.shouldBlock) action = 'blocked';
        else if (assessment.shouldEscalate) action = 'escalated';

        await fraudDetector.recordIncident(
          authReq.user.companyId,
          callId,
          callerPhone,
          assessment,
          action
        );
      }

      res.json({ assessment, cached: false });
    } catch (error) {
      next(error);
    }
  }
);

// ============================================================================
// POST /fraud/analyze-conversation — Analyze utterance for fraud
// ============================================================================

router.post(
  '/analyze-conversation',
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const authReq = req as AuthRequest;
      const { utterance, callId } = z.object({
        utterance: z.string().min(1),
        callId: z.string().min(1),
      }).parse(req.body);

      // Get session from Redis
      const sessionKey = `${authReq.user.companyId}:session:${callId}`;
      const sessionRaw = await redis.get(sessionKey);

      if (!sessionRaw) {
        throw new AppError('Session not found', 404);
      }

      const session = JSON.parse(sessionRaw);

      // Analyze utterance
      const result = await fraudDetector.analyzeConversationFraud(utterance, session);

      // If high risk, update assessment
      if (result.score > 0.6) {
        const cacheKey = `${authReq.user.companyId}:fraud:${callId}`;
        const existingRaw = await redis.get(cacheKey);

        if (existingRaw) {
          const existing = JSON.parse(existingRaw);
          const updated = fraudDetector.refuseWithConversation(existing, result);
          await redis.setex(cacheKey, 3600, JSON.stringify(updated));

          // Update incident record
          await fraudDetector.recordIncident(
            authReq.user.companyId,
            callId,
            session.callerPhone || 'unknown',
            updated,
            updated.shouldBlock ? 'blocked' : updated.shouldEscalate ? 'escalated' : 'monitored'
          );
        }
      }

      res.json(result);
    } catch (error) {
      next(error);
    }
  }
);

// ============================================================================
// GET /fraud/risk-distribution — Get risk level distribution for charts
// ============================================================================

router.get(
  '/risk-distribution',
  roleGuard('manager', 'admin'),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const authReq = req as AuthRequest;
      const { days } = z.object({ days: z.string().transform(Number).default('30') }).parse(req.query);

      const since = new Date();
      since.setDate(since.getDate() - days);

      const distribution = await FraudIncident.aggregate([
        {
          $match: {
            companyId: authReq.user.companyId,
            createdAt: { $gte: since },
          },
        },
        {
          $group: {
            _id: '$riskLevel',
            count: { $sum: 1 },
          },
        },
      ]);

      const result = {
        critical: 0,
        high: 0,
        medium: 0,
        low: 0,
      };

      distribution.forEach((d) => {
        result[d._id as keyof typeof result] = d.count;
      });

      res.json({
        distribution: result,
        total: Object.values(result).reduce((a, b) => a + b, 0),
      });
    } catch (error) {
      next(error);
    }
  }
);

export default router;
