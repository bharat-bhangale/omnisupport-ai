import type { Request, Response, Router } from 'express';
import { Router as createRouter } from 'express';
import crypto from 'crypto';
import { z } from 'zod';
import { env } from '../config/env.js';
import { logger } from '../config/logger.js';
import { Ticket } from '../models/Ticket.js';
import { Customer } from '../models/Customer.js';
import { classificationQueue } from '../queues/index.js';
import { AppError } from '../middleware/AppError.js';
import { asyncHandler } from '../middleware/errorHandler.js';
import type { ZendeskWebhookPayload, ClassificationJobData } from '../types/ticket.js';

const childLogger = logger.child({ webhook: 'zendesk' });

// Zendesk webhook payload schema
const zendeskTicketSchema = z.object({
  id: z.number(),
  external_id: z.string().optional(),
  subject: z.string(),
  description: z.string(),
  status: z.string(),
  priority: z.string().nullable(),
  requester: z.object({
    id: z.number(),
    email: z.string(),
    name: z.string().optional(),
    phone: z.string().optional(),
  }),
  tags: z.array(z.string()).default([]),
  created_at: z.string(),
  updated_at: z.string(),
  url: z.string().optional(),
  custom_fields: z.array(z.object({
    id: z.number(),
    value: z.string().nullable(),
  })).optional(),
});

const zendeskWebhookSchema = z.object({
  ticket: zendeskTicketSchema,
  current_user: z.object({
    id: z.number(),
    email: z.string(),
    name: z.string().optional(),
  }).optional(),
});

// Request with company context
interface AuthRequest extends Request {
  user?: {
    sub: string;
    companyId: string;
    role: string;
  };
}

/**
 * Validate Zendesk webhook signature using basic auth or shared secret
 */
function validateZendeskAuth(req: Request): boolean {
  // Option 1: Basic auth header
  const authHeader = req.headers.authorization;
  if (authHeader && authHeader.startsWith('Basic ')) {
    const credentials = Buffer.from(authHeader.slice(6), 'base64').toString();
    const [email, token] = credentials.split(':');

    if (
      email === env.ZENDESK_EMAIL &&
      token === env.ZENDESK_TOKEN
    ) {
      return true;
    }
  }

  // Option 2: Custom signature header (if configured in Zendesk)
  const signature = req.headers['x-zendesk-webhook-signature'] as string | undefined;
  if (signature && env.ZENDESK_TOKEN) {
    const rawBody = JSON.stringify(req.body);
    const expectedSignature = crypto
      .createHmac('sha256', env.ZENDESK_TOKEN)
      .update(rawBody)
      .digest('base64');

    return crypto.timingSafeEqual(
      Buffer.from(signature),
      Buffer.from(expectedSignature)
    );
  }

  return false;
}

/**
 * Extract company ID from Zendesk webhook
 * In production, map Zendesk subdomain -> company
 */
function extractCompanyId(req: Request): string {
  // Check query param first (webhook URL can include it)
  if (req.query.companyId && typeof req.query.companyId === 'string') {
    return req.query.companyId;
  }

  // Check header
  const companyIdHeader = req.headers['x-company-id'];
  if (companyIdHeader && typeof companyIdHeader === 'string') {
    return companyIdHeader;
  }

  // In production, look up from Zendesk subdomain mapping
  throw AppError.badRequest('companyId not found in webhook request');
}

/**
 * Map Zendesk status to internal status
 */
function mapZendeskStatus(status: string): 'new' | 'open' | 'pending' | 'on-hold' | 'solved' | 'closed' {
  const statusMap: Record<string, 'new' | 'open' | 'pending' | 'on-hold' | 'solved' | 'closed'> = {
    new: 'new',
    open: 'open',
    pending: 'pending',
    hold: 'on-hold',
    solved: 'solved',
    closed: 'closed',
  };
  return statusMap[status.toLowerCase()] || 'new';
}

/**
 * Map Zendesk priority to internal priority
 */
function mapZendeskPriority(priority: string | null): 'low' | 'normal' | 'high' | 'urgent' {
  if (!priority) return 'normal';

  const priorityMap: Record<string, 'low' | 'normal' | 'high' | 'urgent'> = {
    low: 'low',
    normal: 'normal',
    high: 'high',
    urgent: 'urgent',
  };
  return priorityMap[priority.toLowerCase()] || 'normal';
}

/**
 * Find or create customer from Zendesk requester
 */
async function findOrCreateCustomer(
  companyId: string,
  requester: z.infer<typeof zendeskTicketSchema>['requester']
): Promise<string | undefined> {
  try {
    // Try to find existing customer
    let customer = await Customer.findOne({
      companyId,
      $or: [
        { email: requester.email },
        ...(requester.phone ? [{ phone: requester.phone }] : []),
        { 'integrations.zendesk.id': requester.id.toString() },
      ],
    });

    if (customer) {
      // Update Zendesk integration info if not set
      if (!customer.integrations?.zendesk?.id) {
        await Customer.updateOne(
          { _id: customer._id },
          {
            $set: {
              'integrations.zendesk.id': requester.id.toString(),
            },
          }
        );
      }
      return customer._id.toString();
    }

    // Create new customer
    customer = await Customer.create({
      companyId,
      email: requester.email,
      phone: requester.phone,
      name: requester.name,
      integrations: {
        zendesk: { id: requester.id.toString() },
      },
    });

    childLogger.info(
      { companyId, customerId: customer._id, email: requester.email },
      'Created new customer from Zendesk'
    );

    return customer._id.toString();
  } catch (error) {
    childLogger.warn({ error, companyId, requesterId: requester.id }, 'Failed to find/create customer');
    return undefined;
  }
}

/**
 * Handle new ticket created in Zendesk
 */
async function handleTicketCreated(
  payload: ZendeskWebhookPayload,
  companyId: string
): Promise<{ ticketId: string; jobId: string }> {
  const { ticket } = payload;

  childLogger.info(
    { companyId, zendeskId: ticket.id, subject: ticket.subject },
    'Processing new Zendesk ticket'
  );

  // Find or create customer
  const customerId = await findOrCreateCustomer(companyId, ticket.requester);

  // Create ticket in our system
  const newTicket = await Ticket.create({
    companyId,
    customerId,
    externalId: ticket.id.toString(),
    source: 'zendesk',
    subject: ticket.subject,
    description: ticket.description,
    status: mapZendeskStatus(ticket.status),
    priority: mapZendeskPriority(ticket.priority),
    tags: ticket.tags,
    metadata: {
      zendeskCreatedAt: ticket.created_at,
      zendeskUpdatedAt: ticket.updated_at,
      requesterId: ticket.requester.id,
      requesterEmail: ticket.requester.email,
      customFields: ticket.custom_fields,
    },
    externalUrl: ticket.url,
  });

  // Enqueue classification job
  const jobData: ClassificationJobData = {
    ticketId: newTicket._id.toString(),
    companyId,
    externalId: ticket.id.toString(),
    source: 'zendesk',
    subject: ticket.subject,
    description: ticket.description,
    customerEmail: ticket.requester.email,
    customerPhone: ticket.requester.phone,
    customerId,
    existingTags: ticket.tags,
    priority: ticket.priority || undefined,
    metadata: {
      zendeskId: ticket.id,
    },
  };

  const job = await classificationQueue.add(
    `classify-zendesk-${ticket.id}`,
    jobData,
    {
      priority: ticket.priority === 'urgent' ? 1 : ticket.priority === 'high' ? 2 : 3,
    }
  );

  childLogger.info(
    { ticketId: newTicket._id, jobId: job.id, zendeskId: ticket.id },
    'Ticket created and classification enqueued'
  );

  return {
    ticketId: newTicket._id.toString(),
    jobId: job.id || '',
  };
}

/**
 * Handle ticket updated in Zendesk
 */
async function handleTicketUpdated(
  payload: ZendeskWebhookPayload,
  companyId: string
): Promise<{ ticketId: string; updated: boolean }> {
  const { ticket } = payload;

  const existingTicket = await Ticket.findOne({
    companyId,
    externalId: ticket.id.toString(),
    source: 'zendesk',
  });

  if (!existingTicket) {
    // Ticket doesn't exist - create it
    const result = await handleTicketCreated(payload, companyId);
    return { ticketId: result.ticketId, updated: false };
  }

  // Update ticket
  await Ticket.updateOne(
    { _id: existingTicket._id },
    {
      $set: {
        status: mapZendeskStatus(ticket.status),
        priority: mapZendeskPriority(ticket.priority),
        tags: ticket.tags,
        'metadata.zendeskUpdatedAt': ticket.updated_at,
      },
    }
  );

  childLogger.info(
    { ticketId: existingTicket._id, zendeskId: ticket.id },
    'Ticket updated from Zendesk'
  );

  return { ticketId: existingTicket._id.toString(), updated: true };
}

/**
 * Create Zendesk webhook router
 */
export function createZendeskWebhookRouter(): Router {
  const router = createRouter();

  /**
   * POST /webhooks/zendesk/ticket-created
   * Handle new ticket creation
   */
  router.post(
    '/ticket-created',
    asyncHandler(async (req: Request, res: Response) => {
      // Validate authentication
      if (!validateZendeskAuth(req)) {
        childLogger.warn('Invalid Zendesk webhook authentication');
        res.status(401).json({ error: 'Unauthorized' });
        return;
      }

      // Parse payload
      const parseResult = zendeskWebhookSchema.safeParse(req.body);
      if (!parseResult.success) {
        childLogger.warn({ errors: parseResult.error.errors }, 'Invalid Zendesk webhook payload');
        res.status(400).json({ error: 'Invalid payload' });
        return;
      }

      // Extract company ID
      let companyId: string;
      try {
        companyId = extractCompanyId(req);
      } catch (error) {
        res.status(400).json({ error: 'Missing companyId' });
        return;
      }

      const result = await handleTicketCreated(parseResult.data, companyId);

      res.status(201).json({
        success: true,
        ticketId: result.ticketId,
        jobId: result.jobId,
        message: 'Ticket created and queued for classification',
      });
    })
  );

  /**
   * POST /webhooks/zendesk/ticket-updated
   * Handle ticket updates
   */
  router.post(
    '/ticket-updated',
    asyncHandler(async (req: Request, res: Response) => {
      if (!validateZendeskAuth(req)) {
        res.status(401).json({ error: 'Unauthorized' });
        return;
      }

      const parseResult = zendeskWebhookSchema.safeParse(req.body);
      if (!parseResult.success) {
        res.status(400).json({ error: 'Invalid payload' });
        return;
      }

      let companyId: string;
      try {
        companyId = extractCompanyId(req);
      } catch (error) {
        res.status(400).json({ error: 'Missing companyId' });
        return;
      }

      const result = await handleTicketUpdated(parseResult.data, companyId);

      res.status(200).json({
        success: true,
        ticketId: result.ticketId,
        updated: result.updated,
      });
    })
  );

  /**
   * POST /webhooks/zendesk/ticket-solved
   * Handle ticket resolution
   */
  router.post(
    '/ticket-solved',
    asyncHandler(async (req: Request, res: Response) => {
      if (!validateZendeskAuth(req)) {
        res.status(401).json({ error: 'Unauthorized' });
        return;
      }

      const parseResult = zendeskWebhookSchema.safeParse(req.body);
      if (!parseResult.success) {
        res.status(400).json({ error: 'Invalid payload' });
        return;
      }

      let companyId: string;
      try {
        companyId = extractCompanyId(req);
      } catch (error) {
        res.status(400).json({ error: 'Missing companyId' });
        return;
      }

      const { ticket } = parseResult.data;

      // Update ticket status
      const result = await Ticket.findOneAndUpdate(
        {
          companyId,
          externalId: ticket.id.toString(),
          source: 'zendesk',
        },
        {
          $set: {
            status: 'solved',
            'resolution.resolvedAt': new Date(),
            'resolution.resolvedBy': 'zendesk_sync',
            'resolution.resolutionType': 'human_resolved',
            'metadata.zendeskUpdatedAt': ticket.updated_at,
          },
        },
        { new: true }
      );

      if (!result) {
        res.status(404).json({ error: 'Ticket not found' });
        return;
      }

      childLogger.info(
        { ticketId: result._id, zendeskId: ticket.id },
        'Ticket marked as solved'
      );

      res.status(200).json({
        success: true,
        ticketId: result._id.toString(),
      });
    })
  );

  /**
   * GET /webhooks/zendesk/health
   * Health check for Zendesk webhook endpoint
   */
  router.get('/health', (_req: Request, res: Response) => {
    res.status(200).json({
      status: 'ok',
      timestamp: new Date().toISOString(),
    });
  });

  return router;
}

export default createZendeskWebhookRouter;
