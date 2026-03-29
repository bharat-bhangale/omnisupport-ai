import { Router, Request, Response } from 'express';
import { z } from 'zod';
import OpenAI from 'openai';
import { Ticket } from '../models/Ticket.js';
import { classificationQueue, responseQueue, learningQueue } from '../queues/index.js';
import { asyncHandler } from '../middleware/errorHandler.js';
import { AppError } from '../middleware/AppError.js';
import { logger } from '../config/logger.js';
import { env } from '../config/env.js';
import { OPENAI_CONFIG } from '../config/constants.js';
import { buildCustomerCard } from '../services/customerIntelligence.js';
import { buildTicketMessages } from '../services/llm.js';
import { emitTicketSent } from '../sockets/activitySocket.js';
import {
  ClassificationFeedbackSchema,
  ClassificationJobData,
  Classification,
  ResponseGenerationJobData,
} from '../types/ticket.js';

const router = Router();
const childLogger = logger.child({ route: 'tickets' });
const openai = new OpenAI({ apiKey: env.OPENAI_API_KEY });

// Request with user context
interface AuthRequest extends Request {
  user?: {
    sub: string;
    companyId: string;
    role: string;
  };
}

// Validation schemas
const listQuerySchema = z.object({
  status: z.enum(['new', 'open', 'pending', 'on-hold', 'solved', 'closed']).optional(),
  priority: z.enum(['low', 'normal', 'high', 'urgent']).optional(),
  source: z.enum(['zendesk', 'freshdesk', 'email', 'api', 'manual']).optional(),
  assignedTo: z.string().optional(),
  customerId: z.string().optional(),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  sortBy: z.enum(['createdAt', 'updatedAt', 'priority', 'sla.responseDeadline']).default('createdAt'),
  sortOrder: z.enum(['asc', 'desc']).default('desc'),
});

const createTicketSchema = z.object({
  subject: z.string().min(1).max(500),
  description: z.string().min(1).max(10000),
  customerId: z.string().optional(),
  customerEmail: z.string().email().optional(),
  customerPhone: z.string().optional(),
  priority: z.enum(['low', 'normal', 'high', 'urgent']).optional(),
  tags: z.array(z.string()).optional(),
  metadata: z.record(z.unknown()).optional(),
});

const sendResponseSchema = z.object({
  action: z.enum(['approve', 'edit', 'regenerate']),
  editedContent: z.string().optional(),
  sendToExternal: z.boolean().default(true),
  addNote: z.string().optional(),
});

/**
 * GET /tickets - List tickets with filters
 */
router.get(
  '/',
  asyncHandler(async (req: AuthRequest, res: Response) => {
    const companyId = req.user?.companyId;
    if (!companyId) {
      throw AppError.unauthorized('Missing company context');
    }

    const query = listQuerySchema.parse(req.query);
    const { status, priority, source, assignedTo, customerId, page, limit, sortBy, sortOrder } = query;

    // Build filter
    const filter: Record<string, unknown> = { companyId };
    if (status) filter.status = status;
    if (priority) filter.priority = priority;
    if (source) filter.source = source;
    if (assignedTo) filter.assignedTo = assignedTo;
    if (customerId) filter.customerId = customerId;

    // Build sort
    const sort: Record<string, 1 | -1> = {};
    sort[sortBy] = sortOrder === 'asc' ? 1 : -1;

    const [tickets, total] = await Promise.all([
      Ticket.find(filter)
        .sort(sort)
        .skip((page - 1) * limit)
        .limit(limit)
        .populate('customerId', 'name email phone tier')
        .lean(),
      Ticket.countDocuments(filter),
    ]);

    res.json({
      tickets,
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
 * GET /tickets/sla-breaching - Tickets approaching or breaching SLA
 */
router.get(
  '/sla-breaching',
  asyncHandler(async (req: AuthRequest, res: Response) => {
    const companyId = req.user?.companyId;
    if (!companyId) {
      throw AppError.unauthorized('Missing company context');
    }

    const now = new Date();
    const oneHourFromNow = new Date(now.getTime() + 60 * 60 * 1000);

    const tickets = await Ticket.find({
      companyId,
      status: { $nin: ['solved', 'closed'] },
      $or: [
        { 'sla.isBreached': true },
        { 'sla.responseDeadline': { $lte: oneHourFromNow } },
        { 'sla.resolutionDeadline': { $lte: oneHourFromNow } },
      ],
    })
      .sort({ 'sla.responseDeadline': 1 })
      .limit(50)
      .populate('customerId', 'name email tier')
      .lean();

    const categorized = {
      breached: tickets.filter((t) => t.sla?.isBreached),
      critical: tickets.filter((t) =>
        !t.sla?.isBreached &&
        t.sla?.responseDeadline &&
        new Date(t.sla.responseDeadline) <= now
      ),
      warning: tickets.filter((t) =>
        !t.sla?.isBreached &&
        t.sla?.responseDeadline &&
        new Date(t.sla.responseDeadline) > now &&
        new Date(t.sla.responseDeadline) <= oneHourFromNow
      ),
    };

    res.json({
      ...categorized,
      total: tickets.length,
    });
  })
);

/**
 * GET /tickets/pending-review - Tickets with AI drafts pending review
 */
router.get(
  '/pending-review',
  asyncHandler(async (req: AuthRequest, res: Response) => {
    const companyId = req.user?.companyId;
    if (!companyId) {
      throw AppError.unauthorized('Missing company context');
    }

    const tickets = await Ticket.find({
      companyId,
      status: { $nin: ['solved', 'closed'] },
      'aiDraft.content': { $exists: true, $ne: '' },
      'aiDraft.approved': false,
    })
      .sort({ priority: -1, createdAt: 1 })
      .limit(50)
      .populate('customerId', 'name email tier')
      .lean();

    res.json({ tickets, total: tickets.length });
  })
);

/**
 * POST /tickets - Create a new ticket
 */
router.post(
  '/',
  asyncHandler(async (req: AuthRequest, res: Response) => {
    const companyId = req.user?.companyId;
    if (!companyId) {
      throw AppError.unauthorized('Missing company context');
    }

    const data = createTicketSchema.parse(req.body);

    // Generate external ID
    const externalId = `MAN-${Date.now()}-${Math.random().toString(36).slice(2, 8).toUpperCase()}`;

    const ticket = await Ticket.create({
      companyId,
      externalId,
      source: 'manual',
      subject: data.subject,
      description: data.description,
      customerId: data.customerId,
      priority: data.priority || 'normal',
      tags: data.tags || [],
      metadata: {
        ...data.metadata,
        customerEmail: data.customerEmail,
        customerPhone: data.customerPhone,
      },
    });

    // Enqueue classification
    const jobData: ClassificationJobData = {
      ticketId: ticket._id.toString(),
      companyId,
      externalId,
      source: 'manual',
      subject: data.subject,
      description: data.description,
      customerEmail: data.customerEmail,
      customerPhone: data.customerPhone,
      customerId: data.customerId,
      existingTags: data.tags,
      metadata: data.metadata,
    };

    const job = await classificationQueue.add(
      `classify-manual-${ticket._id}`,
      jobData,
      { priority: data.priority === 'urgent' ? 1 : data.priority === 'high' ? 2 : 3 }
    );

    childLogger.info(
      { ticketId: ticket._id, jobId: job.id },
      'Manual ticket created and queued for classification'
    );

    res.status(201).json({
      ticket,
      classificationJobId: job.id,
    });
  })
);

/**
 * GET /tickets/:id - Get ticket details
 */
router.get(
  '/:id',
  asyncHandler(async (req: AuthRequest, res: Response) => {
    const companyId = req.user?.companyId;
    if (!companyId) {
      throw AppError.unauthorized('Missing company context');
    }

    const ticket = await Ticket.findOne({
      _id: req.params.id,
      companyId,
    })
      .populate('customerId')
      .lean();

    if (!ticket) {
      throw AppError.notFound('Ticket');
    }

    res.json({ ticket });
  })
);

/**
 * POST /tickets/:id/reclassify - Trigger reclassification
 */
router.post(
  '/:id/reclassify',
  asyncHandler(async (req: AuthRequest, res: Response) => {
    const companyId = req.user?.companyId;
    if (!companyId) {
      throw AppError.unauthorized('Missing company context');
    }

    const ticket = await Ticket.findOne({
      _id: req.params.id,
      companyId,
    }).lean();

    if (!ticket) {
      throw AppError.notFound('Ticket');
    }

    // Enqueue reclassification
    const jobData: ClassificationJobData = {
      ticketId: ticket._id.toString(),
      companyId,
      externalId: ticket.externalId,
      source: ticket.source,
      subject: ticket.subject,
      description: ticket.description,
      customerId: ticket.customerId?.toString(),
      existingTags: ticket.tags,
      priority: ticket.priority,
      metadata: {
        reclassification: true,
        previousClassification: ticket.classification,
      },
    };

    const job = await classificationQueue.add(
      `reclassify-${ticket._id}`,
      jobData,
      { priority: 1 } // High priority for manual reclassification
    );

    childLogger.info(
      { ticketId: ticket._id, jobId: job.id },
      'Ticket queued for reclassification'
    );

    res.json({
      success: true,
      jobId: job.id,
      message: 'Ticket queued for reclassification',
    });
  })
);

/**
 * POST /tickets/:id/feedback - Submit classification feedback
 */
router.post(
  '/:id/feedback',
  asyncHandler(async (req: AuthRequest, res: Response) => {
    const companyId = req.user?.companyId;
    const userId = req.user?.sub;
    if (!companyId || !userId) {
      throw AppError.unauthorized('Missing context');
    }

    const ticket = await Ticket.findOne({
      _id: req.params.id,
      companyId,
    }).lean();

    if (!ticket) {
      throw AppError.notFound('Ticket');
    }

    // Parse and validate feedback
    const feedback = ClassificationFeedbackSchema.parse({
      ...req.body,
      ticketId: ticket._id.toString(),
      agentId: userId,
      originalClassification: ticket.classification
        ? {
            category: ticket.classification.intent,
            subCategory: ticket.classification.subIntent,
            priority: mapInternalPriorityToP(ticket.priority),
            confidence: ticket.classification.confidence,
            routeTo: ticket.assignedTo || 'unknown',
            reasoning: '',
            sentiment: ticket.sentiment,
            urgencySignals: [],
            suggestedTags: ticket.tags,
            aiConfident: true,
          }
        : undefined,
    });

    // Update ticket if corrections provided
    const updates: Record<string, unknown> = {};
    if (feedback.correctedCategory) {
      updates['classification.intent'] = feedback.correctedCategory;
    }
    if (feedback.correctedPriority) {
      updates.priority = mapPriorityToInternal(feedback.correctedPriority);
    }
    if (feedback.correctedRouteTo) {
      updates.assignedTo = feedback.correctedRouteTo;
    }

    if (Object.keys(updates).length > 0) {
      await Ticket.updateOne({ _id: ticket._id }, { $set: updates });
    }

    // Enqueue learning job
    await learningQueue.add(
      `learn-${ticket._id}`,
      {
        type: 'classification_feedback',
        ticketId: ticket._id.toString(),
        companyId,
        feedback,
      },
      { delay: 1000 } // Slight delay to ensure ticket is updated
    );

    childLogger.info(
      { ticketId: ticket._id, feedbackType: feedback.feedbackType },
      'Classification feedback submitted'
    );

    res.json({
      success: true,
      message: 'Feedback submitted and queued for learning',
    });
  })
);

/**
 * POST /tickets/:id/generate-response - Generate AI response
 */
router.post(
  '/:id/generate-response',
  asyncHandler(async (req: AuthRequest, res: Response) => {
    const companyId = req.user?.companyId;
    if (!companyId) {
      throw AppError.unauthorized('Missing company context');
    }

    const ticket = await Ticket.findOne({
      _id: req.params.id,
      companyId,
    }).lean();

    if (!ticket) {
      throw AppError.notFound('Ticket');
    }

    // Build customer card for personalization
    const customerCard = ticket.customerId
      ? await buildCustomerCard({ customerId: ticket.customerId.toString() }, companyId)
      : undefined;

    // Build classification object from ticket data
    const classification: Classification = {
      category: ticket.classification?.intent || 'general',
      subCategory: ticket.classification?.subIntent,
      priority: mapInternalPriorityToP(ticket.priority),
      confidence: ticket.classification?.confidence || 0.5,
      routeTo: ticket.assignedTo || 'general-support',
      reasoning: '',
      sentiment: ticket.sentiment === 'negative' ? 'negative' : ticket.sentiment === 'positive' ? 'positive' : 'neutral',
      urgencySignals: [],
      suggestedTags: ticket.tags,
      aiConfident: true,
    };

    // Enqueue response generation
    const jobData: ResponseGenerationJobData = {
      ticketId: ticket._id.toString(),
      companyId,
      subject: ticket.subject,
      description: ticket.description,
      classification,
      customerCard: customerCard
        ? {
            name: customerCard.name,
            tier: customerCard.tier,
            preferredStyle: customerCard.preferredStyle,
            verbosity: customerCard.verbosity,
          }
        : undefined,
      kbChunks: ticket.ragContext?.chunks,
      language: ticket.language,
    };

    const job = await responseQueue.add(
      `response-${ticket._id}`,
      jobData,
      { priority: ticket.priority === 'urgent' ? 1 : ticket.priority === 'high' ? 2 : 3 }
    );

    childLogger.info(
      { ticketId: ticket._id, jobId: job.id },
      'Response generation queued'
    );

    res.json({
      success: true,
      jobId: job.id,
      message: 'Response generation queued',
    });
  })
);

/**
 * POST /tickets/:id/send-response - Send/approve AI response
 */
router.post(
  '/:id/send-response',
  asyncHandler(async (req: AuthRequest, res: Response) => {
    const companyId = req.user?.companyId;
    const userId = req.user?.sub;
    if (!companyId || !userId) {
      throw AppError.unauthorized('Missing context');
    }

    const ticket = await Ticket.findOne({
      _id: req.params.id,
      companyId,
    });

    if (!ticket) {
      throw AppError.notFound('Ticket');
    }

    if (!ticket.aiDraft?.content) {
      throw AppError.badRequest('No AI draft available');
    }

    const data = sendResponseSchema.parse(req.body);

    switch (data.action) {
      case 'approve': {
        // Mark as approved
        ticket.aiDraft.approved = true;
        ticket.aiDraft.approvedBy = userId;
        ticket.aiDraft.approvedAt = new Date();

        if (data.sendToExternal) {
          // TODO: Send to Zendesk/Freshdesk via their APIs
          childLogger.info(
            { ticketId: ticket._id, source: ticket.source },
            'Would send response to external system'
          );
        }

        // Update status
        ticket.status = 'pending';
        await ticket.save();

        childLogger.info({ ticketId: ticket._id }, 'AI response approved');

        // Emit activity event
        await emitTicketSent(companyId, ticket._id.toString(), true);
        break;
      }

      case 'edit': {
        if (!data.editedContent) {
          throw AppError.badRequest('editedContent required for edit action');
        }

        ticket.aiDraft.edits = data.editedContent;
        ticket.aiDraft.approved = true;
        ticket.aiDraft.approvedBy = userId;
        ticket.aiDraft.approvedAt = new Date();

        if (data.sendToExternal) {
          // TODO: Send edited content to external system
          childLogger.info(
            { ticketId: ticket._id, source: ticket.source },
            'Would send edited response to external system'
          );
        }

        ticket.status = 'pending';
        await ticket.save();

        // Submit learning feedback for the edit
        await learningQueue.add('learn-edit', {
          type: 'response_edit',
          ticketId: ticket._id.toString(),
          companyId,
          originalContent: ticket.aiDraft.content,
          editedContent: data.editedContent,
          agentId: userId,
        });

        childLogger.info({ ticketId: ticket._id }, 'AI response edited and approved');

        // Emit activity event (edited content is still AI-assisted)
        await emitTicketSent(companyId, ticket._id.toString(), true);
        break;
      }

      case 'regenerate': {
        // Clear current draft and regenerate
        ticket.aiDraft = undefined;
        await ticket.save();

        // Trigger new generation
        const customerCard = ticket.customerId
          ? await buildCustomerCard({ customerId: ticket.customerId.toString() }, companyId)
          : undefined;

        const jobData: ResponseGenerationJobData = {
          ticketId: ticket._id.toString(),
          companyId,
          subject: ticket.subject,
          description: ticket.description,
          classification: {
            category: ticket.classification?.intent || 'general',
            priority: mapInternalPriorityToP(ticket.priority),
            confidence: ticket.classification?.confidence || 0.5,
            routeTo: ticket.assignedTo || 'general-support',
            reasoning: data.addNote || 'Regeneration requested',
            sentiment: ticket.sentiment as 'positive' | 'neutral' | 'negative' | 'highly_negative',
            urgencySignals: [],
            suggestedTags: ticket.tags,
            aiConfident: true,
          },
          customerCard: customerCard
            ? {
                name: customerCard.name,
                tier: customerCard.tier,
                preferredStyle: customerCard.preferredStyle,
                verbosity: customerCard.verbosity,
              }
            : undefined,
          language: ticket.language,
        };

        await responseQueue.add(`regenerate-${ticket._id}`, jobData, { priority: 1 });

        childLogger.info({ ticketId: ticket._id }, 'Response regeneration queued');
        break;
      }
    }

    res.json({
      success: true,
      action: data.action,
      ticketId: ticket._id.toString(),
    });
  })
);

/**
 * GET /tickets/:id/ai-response-preview - Generate response preview (sync)
 */
router.get(
  '/:id/ai-response-preview',
  asyncHandler(async (req: AuthRequest, res: Response) => {
    const companyId = req.user?.companyId;
    if (!companyId) {
      throw AppError.unauthorized('Missing company context');
    }

    const ticket = await Ticket.findOne({
      _id: req.params.id,
      companyId,
    }).lean();

    if (!ticket) {
      throw AppError.notFound('Ticket');
    }

    // Build customer card
    const customerCard = ticket.customerId
      ? await buildCustomerCard({ customerId: ticket.customerId.toString() }, companyId)
      : undefined;

    // Build messages for GPT-4o
    const messages = buildTicketMessages(
      ticket.subject,
      ticket.description,
      customerCard,
      ticket.ragContext?.chunks || [],
      'Support Team', // In production, get from company config
      ticket.language
    );

    // Generate response
    const response = await openai.chat.completions.create({
      model: OPENAI_CONFIG.MODEL,
      temperature: OPENAI_CONFIG.TEMPERATURE.GENERATION,
      max_tokens: OPENAI_CONFIG.MAX_TOKENS.RESPONSE,
      messages,
    });

    const content = response.choices[0]?.message?.content || '';

    // Store as draft
    await Ticket.updateOne(
      { _id: ticket._id },
      {
        $set: {
          aiDraft: {
            content,
            generatedAt: new Date(),
            approved: false,
          },
        },
      }
    );

    res.json({
      content,
      generatedAt: new Date().toISOString(),
      tokensUsed: response.usage?.total_tokens,
    });
  })
);

/**
 * PATCH /tickets/:id - Update ticket
 */
router.patch(
  '/:id',
  asyncHandler(async (req: AuthRequest, res: Response) => {
    const companyId = req.user?.companyId;
    if (!companyId) {
      throw AppError.unauthorized('Missing company context');
    }

    const updateSchema = z.object({
      status: z.enum(['new', 'open', 'pending', 'on-hold', 'solved', 'closed']).optional(),
      priority: z.enum(['low', 'normal', 'high', 'urgent']).optional(),
      assignedTo: z.string().optional(),
      tags: z.array(z.string()).optional(),
    });

    const updates = updateSchema.parse(req.body);

    const ticket = await Ticket.findOneAndUpdate(
      { _id: req.params.id, companyId },
      { $set: updates },
      { new: true }
    );

    if (!ticket) {
      throw AppError.notFound('Ticket');
    }

    childLogger.info(
      { ticketId: ticket._id, updates: Object.keys(updates) },
      'Ticket updated'
    );

    res.json({ ticket });
  })
);

// Helper functions
function mapInternalPriorityToP(priority: string): 'P1' | 'P2' | 'P3' | 'P4' {
  const map: Record<string, 'P1' | 'P2' | 'P3' | 'P4'> = {
    urgent: 'P1',
    high: 'P2',
    normal: 'P3',
    low: 'P4',
  };
  return map[priority] || 'P3';
}

function mapPriorityToInternal(priority: 'P1' | 'P2' | 'P3' | 'P4'): 'low' | 'normal' | 'high' | 'urgent' {
  const map: Record<string, 'low' | 'normal' | 'high' | 'urgent'> = {
    P1: 'urgent',
    P2: 'high',
    P3: 'normal',
    P4: 'low',
  };
  return map[priority];
}

/**
 * GET /tickets/:id/response-history - Get response history for a ticket
 */
router.get(
  '/:id/response-history',
  asyncHandler(async (req: AuthRequest, res: Response) => {
    const companyId = req.user?.companyId;
    if (!companyId) {
      throw AppError.unauthorized('Missing company context');
    }

    const ticket = await Ticket.findOne({
      _id: req.params.id,
      companyId,
    })
      .select('responseHistory')
      .lean();

    if (!ticket) {
      throw AppError.notFound('Ticket');
    }

    // Transform response history for frontend consumption
    const responses =
      ticket.responseHistory?.map((entry: {
        _id?: unknown;
        sentAt: Date;
        agentId: string;
        agentName?: string;
        responseText: string;
        agentEdited: boolean;
        toneApplied?: string;
      }) => ({
        id: entry._id?.toString() || String(Date.now()),
        sentAt: entry.sentAt.toISOString(),
        agentId: entry.agentId,
        agentName: entry.agentName || 'Agent',
        responseText: entry.responseText,
        agentEdited: entry.agentEdited,
        toneApplied: entry.toneApplied || 'professional',
      })) || [];

    childLogger.debug(
      { ticketId: req.params.id, count: responses.length },
      'Response history fetched'
    );

    res.json({ responses });
  })
);

export default router;
