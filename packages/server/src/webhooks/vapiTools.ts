import type { Request, Response } from 'express';
import crypto from 'crypto';
import { z } from 'zod';
import { env } from '../config/env.js';
import { logger } from '../config/logger.js';
import { redis, buildRedisKey } from '../config/redis.js';
import { getSession, appendTurn, updateSlots } from '../services/contextMemory.js';
import { AppError } from '../middleware/AppError.js';
import { handleEscalation } from '../tools/escalateToHuman.js';
import { lookupCustomer } from '../tools/lookupCustomer.js';

const childLogger = logger.child({ webhook: 'vapiTools' });

// Idempotency TTL in seconds
const IDEMPOTENCY_TTL = 300; // 5 minutes

// Zod schema for tool call payload
const toolCallPayloadSchema = z.object({
  type: z.literal('tool-call'),
  call: z.object({
    id: z.string(),
    metadata: z.record(z.unknown()).optional(),
  }),
  toolCall: z.object({
    id: z.string(),
    name: z.string(),
    arguments: z.record(z.unknown()),
  }),
});

type ToolCallPayload = z.infer<typeof toolCallPayloadSchema>;

/**
 * Validate Vapi webhook signature
 */
function validateSignature(payload: string, signature: string | undefined): boolean {
  if (!signature) {
    return false;
  }

  const expectedSignature = crypto
    .createHmac('sha256', env.VAPI_WEBHOOK_SECRET)
    .update(payload)
    .digest('hex');

  return crypto.timingSafeEqual(
    Buffer.from(signature),
    Buffer.from(expectedSignature)
  );
}

/**
 * Extract company ID from call metadata
 */
function extractCompanyId(call: ToolCallPayload['call']): string {
  const metadata = call.metadata;
  if (metadata?.companyId && typeof metadata.companyId === 'string') {
    return metadata.companyId;
  }
  throw AppError.badRequest('companyId not found in call metadata');
}

/**
 * Tool handlers - each must respond within 1500ms
 */
const toolHandlers: Record<
  string,
  (args: Record<string, unknown>, companyId: string, callId: string, twilioCallSid?: string) => Promise<string>
> = {
  /**
   * Look up order status
   */
  async lookupOrder(args, companyId, callId) {
    const orderId = args.order_id as string;

    childLogger.info({ callId, companyId, orderId }, 'Looking up order');

    // TODO: Integrate with actual order system
    // This is a placeholder response
    const mockOrder = {
      orderId,
      status: 'shipped',
      estimatedDelivery: 'March 30, 2026',
      trackingNumber: 'TRK123456789',
      carrier: 'FedEx',
    };

    return `Order ${orderId} is currently ${mockOrder.status}. ` +
      `Estimated delivery: ${mockOrder.estimatedDelivery}. ` +
      `Tracking number: ${mockOrder.trackingNumber} via ${mockOrder.carrier}.`;
  },

  /**
   * Process a refund request
   */
  async processRefund(args, companyId, callId) {
    const orderId = args.order_id as string;
    const reason = args.refund_reason as string;
    const method = (args.preferred_refund_method as string) || 'original_payment';

    childLogger.info({ callId, companyId, orderId, reason }, 'Processing refund');

    // TODO: Integrate with actual refund system
    const refundId = `REF-${Date.now()}`;

    return `Refund ${refundId} has been initiated for order ${orderId}. ` +
      `Reason: ${reason}. ` +
      `The refund will be processed to your ${method.replace('_', ' ')} within 5-7 business days.`;
  },

  /**
   * Cancel an order
   */
  async cancelOrder(args, companyId, callId) {
    const orderId = args.order_id as string;

    childLogger.info({ callId, companyId, orderId }, 'Canceling order');

    // TODO: Integrate with actual order system
    return `Order ${orderId} has been successfully cancelled. ` +
      `If you were charged, a refund will be processed within 3-5 business days.`;
  },

  /**
   * Update account information
   */
  async updateAccount(args, companyId, callId) {
    const updateType = args.update_type as string;
    const newValue = args.new_value as string;

    childLogger.info({ callId, companyId, updateType }, 'Updating account');

    // TODO: Integrate with actual account system
    return `Your ${updateType} has been updated successfully. ` +
      `You should receive a confirmation email shortly.`;
  },

  /**
   * Escalate to human agent - REAL IMPLEMENTATION
   */
  async escalate_to_human(args, companyId, callId, twilioCallSid) {
    const reason = (args.reason as string) || 'customer_request';
    const priority = (args.priority as 'low' | 'medium' | 'high' | 'urgent') || 'medium';
    const urgentIssue = args.urgent_issue === true;

    childLogger.info({ callId, companyId, reason, priority }, 'Escalating to human');

    const result = await handleEscalation({
      callId,
      companyId,
      reason,
      priority,
      urgentIssue,
      twilioCallSid,
    });

    return result.ttsResponse;
  },

  /**
   * Lookup customer information - REAL IMPLEMENTATION
   */
  async lookup_customer(args, companyId, callId) {
    const phone = args.phone as string | undefined;
    const email = args.email as string | undefined;
    const customerId = args.customer_id as string | undefined;

    childLogger.info({ callId, companyId, phone, email }, 'Looking up customer');

    return lookupCustomer({ phone, email, customerId }, companyId);
  },

  /**
   * Search knowledge base
   */
  async search_knowledge_base(args, companyId, callId) {
    const query = args.query as string;

    childLogger.info({ callId, companyId, query }, 'Searching knowledge base');

    // TODO: Integrate with Pinecone RAG
    return 'Based on our knowledge base, ' +
      'the answer to your question is available in our help center. ' +
      'Would you like me to provide more specific information?';
  },

  // Legacy aliases for backward compatibility
  async escalateToHuman(args, companyId, callId, twilioCallSid) {
    return toolHandlers.escalate_to_human(args, companyId, callId, twilioCallSid);
  },

  async searchKB(args, companyId, callId) {
    return toolHandlers.search_knowledge_base(args, companyId, callId);
  },

  async lookupCustomer(args, companyId, callId) {
    return toolHandlers.lookup_customer(args, companyId, callId);
  },
};

/**
 * Check idempotency key in Redis
 * Returns cached result if available, null otherwise
 */
async function checkIdempotency(companyId: string, toolCallId: string): Promise<string | null> {
  const key = buildRedisKey(companyId, 'tool', toolCallId);
  return redis.get(key);
}

/**
 * Set idempotency key in Redis
 */
async function setIdempotency(companyId: string, toolCallId: string, result: string): Promise<void> {
  const key = buildRedisKey(companyId, 'tool', toolCallId);
  await redis.setex(key, IDEMPOTENCY_TTL, result);
}

/**
 * Vapi tool webhook handler
 * CRITICAL: Must respond in < 1500ms
 */
export async function vapiToolsHandler(req: Request, res: Response): Promise<void> {
  const startTime = Date.now();

  // Validate signature
  const signature = req.headers['vapi-signature'] as string | undefined;
  const rawBody = JSON.stringify(req.body);

  if (!validateSignature(rawBody, signature)) {
    childLogger.warn('Invalid Vapi tools webhook signature');
    res.status(401).json({ error: 'Invalid signature' });
    return;
  }

  // Parse and validate payload
  const parseResult = toolCallPayloadSchema.safeParse(req.body);
  if (!parseResult.success) {
    childLogger.warn({ errors: parseResult.error.errors }, 'Invalid tool call payload');
    res.status(400).json({ error: 'Invalid payload' });
    return;
  }

  const { call, toolCall } = parseResult.data;

  // Extract company ID
  let companyId: string;
  try {
    companyId = extractCompanyId(call);
  } catch {
    childLogger.warn({ callId: call.id }, 'Could not extract companyId');
    res.status(400).json({ error: 'Missing companyId' });
    return;
  }

  childLogger.debug(
    { callId: call.id, companyId, tool: toolCall.name },
    'Tool call received'
  );

  try {
    // Check idempotency - return cached result if available
    const cachedResult = await checkIdempotency(companyId, toolCall.id);
    if (cachedResult) {
      childLogger.info(
        { callId: call.id, toolCallId: toolCall.id },
        'Returning cached tool result (idempotent)'
      );
      res.status(200).json({ result: cachedResult });
      return;
    }

    // Get the handler for this tool
    const handler = toolHandlers[toolCall.name];

    if (!handler) {
      childLogger.warn({ tool: toolCall.name }, 'Unknown tool');
      res.status(200).json({
        result: `Sorry, I don't know how to handle ${toolCall.name}.`,
      });
      return;
    }

    // Extract Twilio call SID from metadata if available
    const twilioCallSid = call.metadata?.twilioCallSid as string | undefined;

    // Execute the tool with timeout protection
    const timeoutMs = 1400; // Leave 100ms buffer
    const result = await Promise.race([
      handler(toolCall.arguments, companyId, call.id, twilioCallSid),
      new Promise<string>((_, reject) =>
        setTimeout(() => reject(new Error('Tool execution timeout')), timeoutMs)
      ),
    ]);

    // Store result for idempotency
    await setIdempotency(companyId, toolCall.id, result);

    // Append tool result to session
    await appendTurn(call.id, companyId, {
      role: 'tool',
      content: result,
      toolName: toolCall.name,
      toolCallId: toolCall.id,
    });

    const duration = Date.now() - startTime;
    childLogger.info(
      { callId: call.id, tool: toolCall.name, duration },
      'Tool executed successfully'
    );

    res.status(200).json({ result });
  } catch (error) {
    const duration = Date.now() - startTime;
    childLogger.error(
      { error, callId: call.id, tool: toolCall.name, duration },
      'Tool execution failed'
    );

    // Return a graceful error message to the AI
    res.status(200).json({
      result: 'I encountered an issue processing that request. Let me try a different approach or connect you with a human agent.',
    });
  }
}
