// ============================================================================
// PROACTIVE TRIGGERS ROUTES
// ============================================================================

import { Router, Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { ProactiveTrigger } from '../models/ProactiveTrigger.js';
import { CallSession } from '../models/CallSession.js';
import { authMiddleware, AuthRequest } from '../middleware/auth.js';
import { roleGuard } from '../middleware/roleGuard.js';
import { AppError } from '../middleware/errorHandler.js';
import { proactiveEngine } from '../services/proactiveEngine.js';
import { redis } from '../config/redis.js';
import { logger } from '../config/logger.js';

const router = Router();

// Apply auth middleware to all routes
router.use(authMiddleware);

// ============================================================================
// VALIDATION SCHEMAS
// ============================================================================

const conditionSchema = z.object({
  field: z.string().min(1),
  operator: z.enum(['equals', 'contains', 'gt', 'lt', 'gte', 'lte', 'exists', 'notExists']),
  value: z.unknown().optional(),
});

const createTriggerSchema = z.object({
  name: z.string().min(1).max(100),
  description: z.string().max(500).optional(),
  isActive: z.boolean().default(true),
  priority: z.number().int().min(1).max(10).default(5),
  relevantIntents: z.array(z.string()).default([]),
  condition: conditionSchema,
  statementTemplate: z.string().min(1).max(500),
  channel: z.enum(['voice', 'both']).default('voice'),
});

const updateTriggerSchema = createTriggerSchema.partial();

const testTriggerSchema = z.object({
  callId: z.string().min(1),
});

// ============================================================================
// GET /proactive-triggers — List all triggers for company
// ============================================================================

router.get('/', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const authReq = req as AuthRequest;
    const companyId = authReq.user.companyId;

    const triggers = await ProactiveTrigger.find({ companyId })
      .sort({ priority: 1, createdAt: -1 });

    res.json({
      triggers,
      count: triggers.length,
    });
  } catch (error) {
    next(error);
  }
});

// ============================================================================
// GET /proactive-triggers/:id — Get single trigger
// ============================================================================

router.get('/:id', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const authReq = req as AuthRequest;
    const { id } = req.params;

    const trigger = await ProactiveTrigger.findOne({
      _id: id,
      companyId: authReq.user.companyId,
    });

    if (!trigger) {
      throw new AppError('Trigger not found', 404);
    }

    res.json({ trigger });
  } catch (error) {
    next(error);
  }
});

// ============================================================================
// POST /proactive-triggers — Create new trigger
// ============================================================================

router.post(
  '/',
  roleGuard('manager', 'admin'),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const authReq = req as AuthRequest;
      const data = createTriggerSchema.parse(req.body);

      const trigger = await ProactiveTrigger.create({
        ...data,
        companyId: authReq.user.companyId,
      });

      logger.info(
        { triggerId: trigger._id, companyId: authReq.user.companyId },
        'Proactive trigger created'
      );

      res.status(201).json({
        trigger,
        message: 'Trigger created successfully',
      });
    } catch (error) {
      next(error);
    }
  }
);

// ============================================================================
// PUT /proactive-triggers/:id — Update trigger (full replacement)
// ============================================================================

router.put(
  '/:id',
  roleGuard('manager', 'admin'),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const authReq = req as AuthRequest;
      const { id } = req.params;
      const data = createTriggerSchema.parse(req.body);

      const trigger = await ProactiveTrigger.findOneAndUpdate(
        { _id: id, companyId: authReq.user.companyId },
        data,
        { new: true }
      );

      if (!trigger) {
        throw new AppError('Trigger not found', 404);
      }

      logger.info({ triggerId: id }, 'Proactive trigger updated');

      res.json({
        trigger,
        message: 'Trigger updated successfully',
      });
    } catch (error) {
      next(error);
    }
  }
);

// ============================================================================
// PATCH /proactive-triggers/:id — Partial update (toggle isActive)
// ============================================================================

router.patch(
  '/:id',
  roleGuard('manager', 'admin'),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const authReq = req as AuthRequest;
      const { id } = req.params;
      const data = updateTriggerSchema.parse(req.body);

      const trigger = await ProactiveTrigger.findOneAndUpdate(
        { _id: id, companyId: authReq.user.companyId },
        data,
        { new: true }
      );

      if (!trigger) {
        throw new AppError('Trigger not found', 404);
      }

      logger.info({ triggerId: id, isActive: trigger.isActive }, 'Proactive trigger toggled');

      res.json({
        trigger,
        message: 'Trigger updated successfully',
      });
    } catch (error) {
      next(error);
    }
  }
);

// ============================================================================
// DELETE /proactive-triggers/:id — Delete trigger
// ============================================================================

router.delete(
  '/:id',
  roleGuard('manager', 'admin'),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const authReq = req as AuthRequest;
      const { id } = req.params;

      const trigger = await ProactiveTrigger.findOneAndDelete({
        _id: id,
        companyId: authReq.user.companyId,
      });

      if (!trigger) {
        throw new AppError('Trigger not found', 404);
      }

      logger.info({ triggerId: id }, 'Proactive trigger deleted');

      res.json({
        success: true,
        message: 'Trigger deleted successfully',
      });
    } catch (error) {
      next(error);
    }
  }
);

// ============================================================================
// POST /proactive-triggers/:id/test — Test trigger against live session
// ============================================================================

router.post(
  '/:id/test',
  roleGuard('manager', 'admin'),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const authReq = req as AuthRequest;
      const { id } = req.params;
      const { callId } = testTriggerSchema.parse(req.body);

      // Verify trigger belongs to company
      const trigger = await ProactiveTrigger.findOne({
        _id: id,
        companyId: authReq.user.companyId,
      });

      if (!trigger) {
        throw new AppError('Trigger not found', 404);
      }

      // Get session from Redis
      const sessionKey = `${authReq.user.companyId}:session:${callId}`;
      const sessionRaw = await redis.get(sessionKey);

      if (!sessionRaw) {
        // Try to get from MongoDB for completed calls
        const callSession = await CallSession.findOne({
          callId,
          companyId: authReq.user.companyId,
        });

        if (!callSession) {
          throw new AppError('Call session not found', 404);
        }

        // Build session state from call session
        const session = {
          callId,
          companyId: authReq.user.companyId,
          callerPhone: callSession.callerPhone,
          customerId: callSession.customerId,
          currentIntent: callSession.intent,
          turns: callSession.turns || [],
          slots: callSession.slots || {},
        };

        const result = await proactiveEngine.testTrigger(id, session);
        return res.json(result);
      }

      const session = JSON.parse(sessionRaw);
      const result = await proactiveEngine.testTrigger(id, session);

      res.json(result);
    } catch (error) {
      next(error);
    }
  }
);

// ============================================================================
// GET /proactive-triggers/context/:callId — Get proactive context for a call
// ============================================================================

router.get('/context/:callId', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const authReq = req as AuthRequest;
    const { callId } = req.params;

    const context = await proactiveEngine.getCachedProactiveContext(
      authReq.user.companyId,
      callId
    );

    res.json({
      callId,
      ...context,
      hasContext: context.contextBlock.length > 0,
    });
  } catch (error) {
    next(error);
  }
});

// ============================================================================
// POST /proactive-triggers/evaluate — Manually trigger evaluation
// ============================================================================

router.post(
  '/evaluate',
  roleGuard('manager', 'admin'),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const authReq = req as AuthRequest;
      const { callId } = z.object({ callId: z.string() }).parse(req.body);

      // Get session from Redis
      const sessionKey = `${authReq.user.companyId}:session:${callId}`;
      const sessionRaw = await redis.get(sessionKey);

      if (!sessionRaw) {
        throw new AppError('Active call session not found', 404);
      }

      const session = JSON.parse(sessionRaw);

      // Run evaluation
      const [triggers, predictions] = await Promise.all([
        proactiveEngine.evaluateTriggers(session, authReq.user.companyId),
        proactiveEngine.predictFollowUpQuestions(session),
      ]);

      const contextBlock = proactiveEngine.buildProactiveContextBlock(triggers, predictions);

      res.json({
        callId,
        triggers,
        predictions,
        contextBlock,
        hasContext: contextBlock.length > 0,
      });
    } catch (error) {
      next(error);
    }
  }
);

export default router;
