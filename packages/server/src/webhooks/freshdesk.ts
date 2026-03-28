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
import type { FreshdeskWebhookPayload, ClassificationJobData } from '../types/ticket.js';

const childLogger = logger.child({ webhook: 'freshdesk' });

// Freshdesk webhook payload schema
const freshdeskWebhookSchema = z.object({
  freshdesk_webhook: z.object({
    ticket_id: z.number(),
    ticket_subject: z.string(),
    ticket_description: z.string(),
    ticket_description_text: z.string(),
    ticket_status: z.string(),
    ticket_priority: z.string(),
    ticket_source: z.number(),
    ticket_requester_email: z.string(),
    ticket_requester_name: z.string().optional(),
    ticket_requester_phone: z.string().optional(),
    ticket_tags: z.string().default(''),
    ticket_created_at: z.string(),
    ticket_updated_at: z.string(),
    ticket_url: z.string().optional(),
    ticket_custom_fields: z.record(z.unknown()).optional(),
  }),
});

/**
 * Validate Freshdesk webhook authentication
 */
function validateFreshdeskAuth(req: Request): boolean {
  // Option 1: Basic auth header with API key
  const authHeader = req.headers.authorization;
  if (authHeader && authHeader.startsWith('Basic ')) {
    const credentials = Buffer.from(authHeader.slice(6), 'base64').toString();
    const [apiKey] = credentials.split(':');

    if (apiKey === env.FRESHDESK_API_KEY) {
      return true;
    }
  }

  // Option 2: X-Freshdesk-Webhook-Token header
  const webhookToken = req.headers['x-freshdesk-webhook-token'];
  if (webhookToken === env.FRESHDESK_API_KEY) {
    return true;
  }

  // Option 3: Query parameter token (for simple webhook setup)
  if (req.query.token === env.FRESHDESK_API_KEY) {
    return true;
  }

  return false;
}

/**
 * Extract company ID from Freshdesk webhook
 */
function extractCompanyId(req: Request): string {
  // Check query param first
  if (req.query.companyId && typeof req.query.companyId === 'string') {
    return req.query.companyId;
  }

  // Check header
  const companyIdHeader = req.headers['x-company-id'];
  if (companyIdHeader && typeof companyIdHeader === 'string') {
    return companyIdHeader;
  }

  throw AppError.badRequest('companyId not found in webhook request');
}

/**
 * Map Freshdesk status code to internal status
 * Freshdesk status: 2=Open, 3=Pending, 4=Resolved, 5=Closed
 */
function mapFreshdeskStatus(status: string): 'new' | 'open' | 'pending' | 'on-hold' | 'solved' | 'closed' {
  const statusNum = parseInt(status, 10);
  const statusMap: Record<number, 'new' | 'open' | 'pending' | 'on-hold' | 'solved' | 'closed'> = {
    2: 'open',
    3: 'pending',
    4: 'solved',
    5: 'closed',
  };
  return statusMap[statusNum] || 'new';
}

/**
 * Map Freshdesk priority code to internal priority
 * Freshdesk priority: 1=Low, 2=Medium, 3=High, 4=Urgent
 */
function mapFreshdeskPriority(priority: string): 'low' | 'normal' | 'high' | 'urgent' {
  const priorityNum = parseInt(priority, 10);
  const priorityMap: Record<number, 'low' | 'normal' | 'high' | 'urgent'> = {
    1: 'low',
    2: 'normal',
    3: 'high',
    4: 'urgent',
  };
  return priorityMap[priorityNum] || 'normal';
}

/**
 * Map Freshdesk source code to readable source
 */
function mapFreshdeskSource(source: number): string {
  const sourceMap: Record<number, string> = {
    1: 'email',
    2: 'portal',
    3: 'phone',
    7: 'chat',
    9: 'feedback_widget',
    10: 'outbound_email',
  };
  return sourceMap[source] || 'api';
}

/**
 * Parse Freshdesk tags string to array
 */
function parseTags(tagsString: string): string[] {
  if (!tagsString || tagsString.trim() === '') {
    return [];
  }
  return tagsString.split(',').map((tag) => tag.trim()).filter(Boolean);
}

/**
 * Find or create customer from Freshdesk requester
 */
async function findOrCreateCustomer(
  companyId: string,
  email: string,
  name?: string,
  phone?: string
): Promise<string | undefined> {
  try {
    // Try to find existing customer
    let customer = await Customer.findOne({
      companyId,
      $or: [
        { email },
        ...(phone ? [{ phone }] : []),
      ],
    });

    if (customer) {
      // Update name if provided and not set
      if (name && !customer.name) {
        await Customer.updateOne(
          { _id: customer._id },
          { $set: { name } }
        );
      }
      return customer._id.toString();
    }

    // Create new customer
    customer = await Customer.create({
      companyId,
      email,
      phone,
      name,
    });

    childLogger.info(
      { companyId, customerId: customer._id, email },
      'Created new customer from Freshdesk'
    );

    return customer._id.toString();
  } catch (error) {
    childLogger.warn({ error, companyId, email }, 'Failed to find/create customer');
    return undefined;
  }
}

/**
 * Handle new ticket from Freshdesk
 */
async function handleTicketCreated(
  payload: FreshdeskWebhookPayload,
  companyId: string
): Promise<{ ticketId: string; jobId: string }> {
  const data = payload.freshdesk_webhook;

  childLogger.info(
    { companyId, freshdeskId: data.ticket_id, subject: data.ticket_subject },
    'Processing new Freshdesk ticket'
  );

  // Find or create customer
  const customerId = await findOrCreateCustomer(
    companyId,
    data.ticket_requester_email,
    data.ticket_requester_name,
    data.ticket_requester_phone
  );

  // Parse tags
  const tags = parseTags(data.ticket_tags);

  // Use plain text description for classification
  const description = data.ticket_description_text || data.ticket_description;

  // Create ticket in our system
  const newTicket = await Ticket.create({
    companyId,
    customerId,
    externalId: data.ticket_id.toString(),
    source: 'freshdesk',
    subject: data.ticket_subject,
    description,
    status: mapFreshdeskStatus(data.ticket_status),
    priority: mapFreshdeskPriority(data.ticket_priority),
    tags,
    metadata: {
      freshdeskCreatedAt: data.ticket_created_at,
      freshdeskUpdatedAt: data.ticket_updated_at,
      freshdeskSource: mapFreshdeskSource(data.ticket_source),
      requesterEmail: data.ticket_requester_email,
      customFields: data.ticket_custom_fields,
    },
    externalUrl: data.ticket_url,
  });

  // Enqueue classification job
  const jobData: ClassificationJobData = {
    ticketId: newTicket._id.toString(),
    companyId,
    externalId: data.ticket_id.toString(),
    source: 'freshdesk',
    subject: data.ticket_subject,
    description,
    customerEmail: data.ticket_requester_email,
    customerPhone: data.ticket_requester_phone,
    customerId,
    existingTags: tags,
    priority: data.ticket_priority,
    metadata: {
      freshdeskId: data.ticket_id,
    },
  };

  const priorityNum = parseInt(data.ticket_priority, 10);
  const job = await classificationQueue.add(
    `classify-freshdesk-${data.ticket_id}`,
    jobData,
    {
      priority: priorityNum === 4 ? 1 : priorityNum === 3 ? 2 : 3,
    }
  );

  childLogger.info(
    { ticketId: newTicket._id, jobId: job.id, freshdeskId: data.ticket_id },
    'Ticket created and classification enqueued'
  );

  return {
    ticketId: newTicket._id.toString(),
    jobId: job.id || '',
  };
}

/**
 * Handle ticket updated in Freshdesk
 */
async function handleTicketUpdated(
  payload: FreshdeskWebhookPayload,
  companyId: string
): Promise<{ ticketId: string; updated: boolean }> {
  const data = payload.freshdesk_webhook;

  const existingTicket = await Ticket.findOne({
    companyId,
    externalId: data.ticket_id.toString(),
    source: 'freshdesk',
  });

  if (!existingTicket) {
    // Ticket doesn't exist - create it
    const result = await handleTicketCreated(payload, companyId);
    return { ticketId: result.ticketId, updated: false };
  }

  // Update ticket
  const tags = parseTags(data.ticket_tags);

  await Ticket.updateOne(
    { _id: existingTicket._id },
    {
      $set: {
        status: mapFreshdeskStatus(data.ticket_status),
        priority: mapFreshdeskPriority(data.ticket_priority),
        tags,
        'metadata.freshdeskUpdatedAt': data.ticket_updated_at,
      },
    }
  );

  childLogger.info(
    { ticketId: existingTicket._id, freshdeskId: data.ticket_id },
    'Ticket updated from Freshdesk'
  );

  return { ticketId: existingTicket._id.toString(), updated: true };
}

/**
 * Create Freshdesk webhook router
 */
export function createFreshdeskWebhookRouter(): Router {
  const router = createRouter();

  /**
   * POST /webhooks/freshdesk/ticket-created
   * Handle new ticket creation
   */
  router.post(
    '/ticket-created',
    asyncHandler(async (req: Request, res: Response) => {
      // Validate authentication
      if (!validateFreshdeskAuth(req)) {
        childLogger.warn('Invalid Freshdesk webhook authentication');
        res.status(401).json({ error: 'Unauthorized' });
        return;
      }

      // Parse payload
      const parseResult = freshdeskWebhookSchema.safeParse(req.body);
      if (!parseResult.success) {
        childLogger.warn({ errors: parseResult.error.errors }, 'Invalid Freshdesk webhook payload');
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
   * POST /webhooks/freshdesk/ticket-updated
   * Handle ticket updates
   */
  router.post(
    '/ticket-updated',
    asyncHandler(async (req: Request, res: Response) => {
      if (!validateFreshdeskAuth(req)) {
        res.status(401).json({ error: 'Unauthorized' });
        return;
      }

      const parseResult = freshdeskWebhookSchema.safeParse(req.body);
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
   * POST /webhooks/freshdesk/ticket-resolved
   * Handle ticket resolution
   */
  router.post(
    '/ticket-resolved',
    asyncHandler(async (req: Request, res: Response) => {
      if (!validateFreshdeskAuth(req)) {
        res.status(401).json({ error: 'Unauthorized' });
        return;
      }

      const parseResult = freshdeskWebhookSchema.safeParse(req.body);
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

      const data = parseResult.data.freshdesk_webhook;

      const result = await Ticket.findOneAndUpdate(
        {
          companyId,
          externalId: data.ticket_id.toString(),
          source: 'freshdesk',
        },
        {
          $set: {
            status: 'solved',
            'resolution.resolvedAt': new Date(),
            'resolution.resolvedBy': 'freshdesk_sync',
            'resolution.resolutionType': 'human_resolved',
            'metadata.freshdeskUpdatedAt': data.ticket_updated_at,
          },
        },
        { new: true }
      );

      if (!result) {
        res.status(404).json({ error: 'Ticket not found' });
        return;
      }

      childLogger.info(
        { ticketId: result._id, freshdeskId: data.ticket_id },
        'Ticket marked as resolved'
      );

      res.status(200).json({
        success: true,
        ticketId: result._id.toString(),
      });
    })
  );

  /**
   * POST /webhooks/freshdesk
   * Generic endpoint for all Freshdesk events
   */
  router.post(
    '/',
    asyncHandler(async (req: Request, res: Response) => {
      if (!validateFreshdeskAuth(req)) {
        res.status(401).json({ error: 'Unauthorized' });
        return;
      }

      const parseResult = freshdeskWebhookSchema.safeParse(req.body);
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

      // Determine action based on event type in query or header
      const eventType = req.query.event || req.headers['x-freshdesk-event'] || 'ticket-created';

      switch (eventType) {
        case 'ticket-created':
        case 'ticket_created': {
          const result = await handleTicketCreated(parseResult.data, companyId);
          res.status(201).json({ success: true, ...result });
          break;
        }

        case 'ticket-updated':
        case 'ticket_updated': {
          const result = await handleTicketUpdated(parseResult.data, companyId);
          res.status(200).json({ success: true, ...result });
          break;
        }

        default:
          res.status(200).json({ success: true, message: 'Event acknowledged' });
      }
    })
  );

  /**
   * GET /webhooks/freshdesk/health
   * Health check endpoint
   */
  router.get('/health', (_req: Request, res: Response) => {
    res.status(200).json({
      status: 'ok',
      timestamp: new Date().toISOString(),
    });
  });

  return router;
}

export default createFreshdeskWebhookRouter;
