import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { Workflow, type WorkflowTriggerEvent, type ConditionOperator, type WorkflowActionType } from '../models/Workflow.js';
import { WorkflowExecutionLog } from '../models/WorkflowExecutionLog.js';
import { testWorkflow } from '../services/workflowTrigger.js';
import { asyncHandler } from '../middleware/errorHandler.js';
import { AppError } from '../middleware/AppError.js';
import { logger } from '../config/logger.js';
import {
  WORKFLOW_TEMPLATES,
  getTemplateById,
  convertTemplateConditions,
  convertTemplateActions,
} from '../config/workflowTemplates.js';

const router = Router();
const childLogger = logger.child({ route: 'workflows' });

// Request with user context
interface AuthRequest extends Request {
  user?: {
    sub: string;
    companyId: string;
    role: 'agent' | 'manager' | 'admin';
  };
}

/**
 * Role guard middleware - restrict access to managers and admins
 */
function roleGuard(...allowedRoles: string[]) {
  return (req: AuthRequest, _res: Response, next: () => void): void => {
    const userRole = req.user?.role;
    
    if (!userRole || !allowedRoles.includes(userRole)) {
      throw AppError.forbidden('Insufficient permissions for this operation');
    }
    
    next();
  };
}

// Validation schemas
const triggerFilterSchema = z.object({
  field: z.string().min(1),
  operator: z.enum([
    'equals', 'not_equals', 'contains', 'not_contains',
    'greater_than', 'less_than', 'in', 'not_in',
    'exists', 'not_exists', 'matches_regex',
  ] as [ConditionOperator, ...ConditionOperator[]]),
  value: z.unknown(),
});

const workflowTriggerSchema = z.object({
  event: z.enum([
    'ticket:created', 'ticket:classified', 'ticket:updated',
    'ticket:escalated', 'ticket:sla_warning', 'ticket:sla_breached',
    'ticket:resolved', 'call:started', 'call:ended', 'call:escalated',
    'customer:at_risk', 'feedback:negative',
  ] as [WorkflowTriggerEvent, ...WorkflowTriggerEvent[]]),
  filters: z.array(triggerFilterSchema).optional(),
});

const workflowConditionSchema = z.object({
  field: z.string().min(1),
  operator: z.enum([
    'equals', 'not_equals', 'contains', 'not_contains',
    'greater_than', 'less_than', 'in', 'not_in',
    'exists', 'not_exists', 'matches_regex',
  ] as [ConditionOperator, ...ConditionOperator[]]),
  value: z.unknown(),
});

const workflowActionSchema = z.object({
  type: z.enum([
    'assign_agent', 'add_tag', 'remove_tag', 'send_email',
    'notify_slack', 'webhook', 'create_ticket', 'close_ticket',
    'escalate', 'set_priority', 'add_note',
  ] as [WorkflowActionType, ...WorkflowActionType[]]),
  params: z.record(z.unknown()),
  order: z.number().int().min(0),
});

const createWorkflowSchema = z.object({
  name: z.string().min(1).max(200),
  description: z.string().max(1000).optional(),
  isActive: z.boolean().default(true),
  trigger: workflowTriggerSchema,
  conditions: z.array(workflowConditionSchema).default([]),
  conditionLogic: z.enum(['AND', 'OR']).default('AND'),
  actions: z.array(workflowActionSchema).min(1),
});

const updateWorkflowSchema = createWorkflowSchema.partial();

const listQuerySchema = z.object({
  isActive: z.preprocess(
    (val) => val === 'true' ? true : val === 'false' ? false : undefined,
    z.boolean().optional()
  ),
  event: z.string().optional(),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
});

const testWorkflowSchema = z.object({
  context: z.record(z.unknown()),
});

/**
 * GET /workflows - List all workflows for company
 */
router.get(
  '/',
  asyncHandler(async (req: AuthRequest, res: Response) => {
    const companyId = req.user?.companyId;
    if (!companyId) {
      throw AppError.unauthorized('Missing company context');
    }

    const query = listQuerySchema.parse(req.query);
    const { isActive, event, page, limit } = query;

    // Build filter
    const filter: Record<string, unknown> = { companyId };
    if (isActive !== undefined) filter.isActive = isActive;
    if (event) filter['trigger.event'] = event;

    // Execute query
    const [workflows, total] = await Promise.all([
      Workflow.find(filter)
        .sort({ createdAt: -1 })
        .skip((page - 1) * limit)
        .limit(limit)
        .lean()
        .exec(),
      Workflow.countDocuments(filter),
    ]);

    res.json({
      success: true,
      data: {
        workflows,
        pagination: {
          page,
          limit,
          total,
          totalPages: Math.ceil(total / limit),
        },
      },
    });
  })
);

/**
 * GET /workflows/templates - Get pre-built workflow templates
 */
router.get(
  '/templates',
  asyncHandler(async (_req: AuthRequest, res: Response) => {
    // Group templates by category
    const byCategory = WORKFLOW_TEMPLATES.reduce((acc, template) => {
      if (!acc[template.category]) {
        acc[template.category] = [];
      }
      acc[template.category].push(template);
      return acc;
    }, {} as Record<string, typeof WORKFLOW_TEMPLATES>);

    res.json({
      success: true,
      data: {
        templates: WORKFLOW_TEMPLATES,
        byCategory,
        categories: ['routing', 'notification', 'escalation', 'automation', 'sla'],
      },
    });
  })
);

/**
 * POST /workflows/from-template/:templateId - Create workflow from template
 */
router.post(
  '/from-template/:templateId',
  roleGuard('manager', 'admin'),
  asyncHandler(async (req: AuthRequest, res: Response) => {
    const companyId = req.user?.companyId;
    const userId = req.user?.sub;
    if (!companyId || !userId) {
      throw AppError.unauthorized('Missing user context');
    }

    const { templateId } = req.params;
    const { name } = z.object({
      name: z.string().min(1).max(200).optional(),
    }).parse(req.body);

    const template = getTemplateById(templateId);
    if (!template) {
      throw AppError.notFound('Workflow template');
    }

    const workflowName = name || template.name;

    // Check for duplicate name
    const existing = await Workflow.findOne({ companyId, name: workflowName });
    if (existing) {
      throw AppError.conflict(`Workflow with name "${workflowName}" already exists`);
    }

    const workflow = await Workflow.create({
      companyId,
      name: workflowName,
      description: template.description,
      isActive: false, // Start inactive for user configuration
      version: 1,
      trigger: { event: template.trigger, filters: [] },
      conditions: convertTemplateConditions(template.conditions),
      conditionLogic: 'AND',
      actions: convertTemplateActions(template.actions),
      createdBy: userId,
    });

    childLogger.info(
      { workflowId: workflow._id, templateId, userId },
      'Workflow created from template'
    );

    res.status(201).json({
      success: true,
      data: { workflow, sourceTemplate: templateId },
    });
  })
);

/**
 * GET /workflows/:id - Get single workflow
 */
router.get(
  '/:id',
  asyncHandler(async (req: AuthRequest, res: Response) => {
    const companyId = req.user?.companyId;
    if (!companyId) {
      throw AppError.unauthorized('Missing company context');
    }

    const workflow = await Workflow.findOne({
      _id: req.params.id,
      companyId,
    }).lean().exec();

    if (!workflow) {
      throw AppError.notFound('Workflow');
    }

    res.json({
      success: true,
      data: { workflow },
    });
  })
);

/**
 * GET /workflows/:id/history - Get execution history for a workflow
 */
router.get(
  '/:id/history',
  asyncHandler(async (req: AuthRequest, res: Response) => {
    const companyId = req.user?.companyId;
    if (!companyId) {
      throw AppError.unauthorized('Missing company context');
    }

    const { days = '7', limit = '100' } = req.query;
    const daysNum = Math.min(Math.max(parseInt(days as string, 10) || 7, 1), 90);
    const limitNum = Math.min(Math.max(parseInt(limit as string, 10) || 100, 1), 500);

    // Verify workflow exists and belongs to company
    const workflow = await Workflow.findOne({
      _id: req.params.id,
      companyId,
    }).select('_id name').lean().exec();

    if (!workflow) {
      throw AppError.notFound('Workflow');
    }

    const history = await WorkflowExecutionLog.getHistory(
      req.params.id,
      companyId,
      daysNum,
      limitNum
    );

    res.json({
      success: true,
      data: {
        workflowId: req.params.id,
        workflowName: workflow.name,
        days: daysNum,
        executions: history,
        count: history.length,
      },
    });
  })
);

/**
 * GET /workflows/:id/analytics - Get analytics for a workflow
 */
router.get(
  '/:id/analytics',
  asyncHandler(async (req: AuthRequest, res: Response) => {
    const companyId = req.user?.companyId;
    if (!companyId) {
      throw AppError.unauthorized('Missing company context');
    }

    const { days = '30' } = req.query;
    const daysNum = Math.min(Math.max(parseInt(days as string, 10) || 30, 1), 90);

    // Verify workflow exists and belongs to company
    const workflow = await Workflow.findOne({
      _id: req.params.id,
      companyId,
    }).select('_id name stats').lean().exec();

    if (!workflow) {
      throw AppError.notFound('Workflow');
    }

    const analytics = await WorkflowExecutionLog.getAnalytics(
      req.params.id,
      companyId,
      daysNum
    );

    res.json({
      success: true,
      data: {
        workflowId: req.params.id,
        workflowName: workflow.name,
        days: daysNum,
        ...analytics,
        // Also include lifetime stats from the workflow itself
        lifetimeStats: workflow.stats,
      },
    });
  })
);

/**
 * POST /workflows - Create new workflow
 */
router.post(
  '/',
  roleGuard('manager', 'admin'),
  asyncHandler(async (req: AuthRequest, res: Response) => {
    const companyId = req.user?.companyId;
    const userId = req.user?.sub;
    if (!companyId || !userId) {
      throw AppError.unauthorized('Missing user context');
    }

    const data = createWorkflowSchema.parse(req.body);

    // Check for duplicate name
    const existing = await Workflow.findOne({ companyId, name: data.name });
    if (existing) {
      throw AppError.conflict(`Workflow with name "${data.name}" already exists`);
    }

    const workflow = await Workflow.create({
      ...data,
      companyId,
      createdBy: userId,
    });

    childLogger.info(
      { workflowId: workflow._id, name: workflow.name, userId },
      'Workflow created'
    );

    res.status(201).json({
      success: true,
      data: { workflow },
    });
  })
);

/**
 * PUT /workflows/:id - Full update workflow
 */
router.put(
  '/:id',
  roleGuard('manager', 'admin'),
  asyncHandler(async (req: AuthRequest, res: Response) => {
    const companyId = req.user?.companyId;
    const userId = req.user?.sub;
    if (!companyId || !userId) {
      throw AppError.unauthorized('Missing user context');
    }

    const data = createWorkflowSchema.parse(req.body);

    // Check for duplicate name (excluding current)
    const existing = await Workflow.findOne({
      companyId,
      name: data.name,
      _id: { $ne: req.params.id },
    });
    if (existing) {
      throw AppError.conflict(`Workflow with name "${data.name}" already exists`);
    }

    const workflow = await Workflow.findOneAndUpdate(
      { _id: req.params.id, companyId },
      { ...data, updatedBy: userId },
      { new: true, runValidators: true }
    );

    if (!workflow) {
      throw AppError.notFound('Workflow');
    }

    childLogger.info(
      { workflowId: workflow._id, name: workflow.name, userId },
      'Workflow updated (full)'
    );

    res.json({
      success: true,
      data: { workflow },
    });
  })
);

/**
 * PATCH /workflows/:id - Partial update workflow
 */
router.patch(
  '/:id',
  roleGuard('manager', 'admin'),
  asyncHandler(async (req: AuthRequest, res: Response) => {
    const companyId = req.user?.companyId;
    const userId = req.user?.sub;
    if (!companyId || !userId) {
      throw AppError.unauthorized('Missing user context');
    }

    const data = updateWorkflowSchema.parse(req.body);

    // Check for duplicate name if updating name
    if (data.name) {
      const existing = await Workflow.findOne({
        companyId,
        name: data.name,
        _id: { $ne: req.params.id },
      });
      if (existing) {
        throw AppError.conflict(`Workflow with name "${data.name}" already exists`);
      }
    }

    const workflow = await Workflow.findOneAndUpdate(
      { _id: req.params.id, companyId },
      { ...data, updatedBy: userId },
      { new: true, runValidators: true }
    );

    if (!workflow) {
      throw AppError.notFound('Workflow');
    }

    childLogger.info(
      { workflowId: workflow._id, name: workflow.name, userId, fields: Object.keys(data) },
      'Workflow updated (partial)'
    );

    res.json({
      success: true,
      data: { workflow },
    });
  })
);

/**
 * DELETE /workflows/:id - Delete workflow
 */
router.delete(
  '/:id',
  roleGuard('manager', 'admin'),
  asyncHandler(async (req: AuthRequest, res: Response) => {
    const companyId = req.user?.companyId;
    const userId = req.user?.sub;
    if (!companyId || !userId) {
      throw AppError.unauthorized('Missing user context');
    }

    const workflow = await Workflow.findOneAndDelete({
      _id: req.params.id,
      companyId,
    });

    if (!workflow) {
      throw AppError.notFound('Workflow');
    }

    childLogger.info(
      { workflowId: workflow._id, name: workflow.name, userId },
      'Workflow deleted'
    );

    res.json({
      success: true,
      message: 'Workflow deleted successfully',
    });
  })
);

/**
 * POST /workflows/:id/test - Dry-run test workflow
 */
router.post(
  '/:id/test',
  roleGuard('manager', 'admin'),
  asyncHandler(async (req: AuthRequest, res: Response) => {
    const companyId = req.user?.companyId;
    if (!companyId) {
      throw AppError.unauthorized('Missing company context');
    }

    const { context } = testWorkflowSchema.parse(req.body);

    const result = await testWorkflow(req.params.id, context as any, companyId);

    res.json({
      success: true,
      data: result,
    });
  })
);

/**
 * POST /workflows/:id/toggle - Toggle workflow active status
 */
router.post(
  '/:id/toggle',
  roleGuard('manager', 'admin'),
  asyncHandler(async (req: AuthRequest, res: Response) => {
    const companyId = req.user?.companyId;
    const userId = req.user?.sub;
    if (!companyId || !userId) {
      throw AppError.unauthorized('Missing user context');
    }

    const workflow = await Workflow.findOne({ _id: req.params.id, companyId });
    
    if (!workflow) {
      throw AppError.notFound('Workflow');
    }

    workflow.isActive = !workflow.isActive;
    workflow.updatedBy = userId;
    await workflow.save();

    childLogger.info(
      { workflowId: workflow._id, isActive: workflow.isActive, userId },
      'Workflow toggled'
    );

    res.json({
      success: true,
      data: { workflow },
    });
  })
);

export default router;
