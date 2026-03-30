import { Worker, Job } from 'bullmq';
import axios from 'axios';
import sgMail from '@sendgrid/mail';
import { z } from 'zod';
import { env } from '../config/env.js';
import { QUEUES } from '../config/constants.js';
import { logger } from '../config/logger.js';
import { Workflow, type IWorkflow, type WorkflowAction, type ConditionOperator } from '../models/Workflow.js';
import { WorkflowExecutionLog } from '../models/WorkflowExecutionLog.js';
import { Ticket } from '../models/Ticket.js';
import { classificationQueue } from './index.js';
import { getEmailTemplate, interpolateEmailTemplate } from '../config/emailTemplates.js';

const childLogger = logger.child({ worker: 'workflow' });

// Initialize SendGrid if available
if (env.SENDGRID_API_KEY) {
  sgMail.setApiKey(env.SENDGRID_API_KEY);
}

// Parse Upstash Redis URL for BullMQ connection
const redisUrl = new URL(env.UPSTASH_REDIS_URL);

const connectionOptions = {
  host: redisUrl.hostname,
  port: parseInt(redisUrl.port || '6379', 10),
  password: env.UPSTASH_REDIS_TOKEN,
  tls: {},
  maxRetriesPerRequest: null,
};

// Job data schema
const WorkflowJobDataSchema = z.object({
  workflowId: z.string(),
  triggerId: z.string(),
  companyId: z.string(),
  context: z.record(z.unknown()),
});

export type WorkflowJobData = z.infer<typeof WorkflowJobDataSchema>;

export interface WorkflowJobResult {
  workflowId: string;
  triggerId: string;
  success: boolean;
  actionsExecuted: number;
  errors: string[];
  processingTimeMs: number;
}

// Socket.io instance (will be set during server startup)
let socketIO: { to: (room: string) => { emit: (event: string, data: unknown) => void } } | null = null;

/**
 * Set the Socket.io instance for emitting events
 */
export function setWorkflowSocketIO(io: typeof socketIO): void {
  socketIO = io;
}

/**
 * Get nested value from object using dot notation
 */
function getNestedValue(obj: Record<string, unknown>, path: string): unknown {
  return path.split('.').reduce((current, key) => {
    if (current && typeof current === 'object' && key in current) {
      return (current as Record<string, unknown>)[key];
    }
    return undefined;
  }, obj as unknown);
}

/**
 * Evaluate a single condition against context
 */
function evaluateCondition(
  field: string,
  operator: ConditionOperator,
  expectedValue: unknown,
  context: Record<string, unknown>
): boolean {
  const actualValue = getNestedValue(context, field);

  switch (operator) {
    case 'equals':
      return actualValue === expectedValue;

    case 'not_equals':
      return actualValue !== expectedValue;

    case 'contains':
      if (typeof actualValue === 'string' && typeof expectedValue === 'string') {
        return actualValue.toLowerCase().includes(expectedValue.toLowerCase());
      }
      if (Array.isArray(actualValue)) {
        return actualValue.includes(expectedValue);
      }
      return false;

    case 'not_contains':
      if (typeof actualValue === 'string' && typeof expectedValue === 'string') {
        return !actualValue.toLowerCase().includes(expectedValue.toLowerCase());
      }
      if (Array.isArray(actualValue)) {
        return !actualValue.includes(expectedValue);
      }
      return true;

    case 'greater_than':
      return typeof actualValue === 'number' && typeof expectedValue === 'number'
        ? actualValue > expectedValue
        : false;

    case 'less_than':
      return typeof actualValue === 'number' && typeof expectedValue === 'number'
        ? actualValue < expectedValue
        : false;

    case 'in':
      return Array.isArray(expectedValue) ? expectedValue.includes(actualValue) : false;

    case 'not_in':
      return Array.isArray(expectedValue) ? !expectedValue.includes(actualValue) : true;

    case 'exists':
      return actualValue !== undefined && actualValue !== null;

    case 'not_exists':
      return actualValue === undefined || actualValue === null;

    case 'matches_regex':
      if (typeof actualValue === 'string' && typeof expectedValue === 'string') {
        try {
          return new RegExp(expectedValue, 'i').test(actualValue);
        } catch {
          return false;
        }
      }
      return false;

    default:
      return false;
  }
}

/**
 * Evaluate all conditions based on logic (AND/OR)
 */
function evaluateConditions(
  workflow: IWorkflow,
  context: Record<string, unknown>
): boolean {
  if (workflow.conditions.length === 0) {
    return true; // No conditions means always match
  }

  const results = workflow.conditions.map((condition) =>
    evaluateCondition(condition.field, condition.operator, condition.value, context)
  );

  if (workflow.conditionLogic === 'AND') {
    return results.every((r) => r);
  } else {
    return results.some((r) => r);
  }
}

/**
 * Action handlers
 */
const actionHandlers: Record<
  string,
  (params: Record<string, unknown>, context: Record<string, unknown>, companyId: string) => Promise<void>
> = {
  /**
   * Assign ticket to an agent or team
   */
  async assign_agent(params, context, companyId) {
    const ticketId = context.ticketId as string;
    const agentId = params.agentId as string;
    const team = params.team as string;

    if (!ticketId) throw new Error('No ticketId in context');

    const assignTo = agentId || team;
    await Ticket.findOneAndUpdate(
      { _id: ticketId, companyId },
      { assignedTo: assignTo }
    );

    // Emit socket event
    if (socketIO) {
      socketIO.to(`company:${companyId}`).emit('ticket:assigned', {
        ticketId,
        assignedTo: assignTo,
      });
    }

    childLogger.info({ ticketId, assignTo }, 'Agent assigned via workflow');
  },

  /**
   * Add tag to ticket
   */
  async add_tag(params, context, companyId) {
    const ticketId = context.ticketId as string;
    const tag = params.tag as string;

    if (!ticketId) throw new Error('No ticketId in context');
    if (!tag) throw new Error('No tag specified');

    await Ticket.findOneAndUpdate(
      { _id: ticketId, companyId },
      { $addToSet: { tags: tag } }
    );

    childLogger.info({ ticketId, tag }, 'Tag added via workflow');
  },

  /**
   * Remove tag from ticket
   */
  async remove_tag(params, context, companyId) {
    const ticketId = context.ticketId as string;
    const tag = params.tag as string;

    if (!ticketId) throw new Error('No ticketId in context');
    if (!tag) throw new Error('No tag specified');

    await Ticket.findOneAndUpdate(
      { _id: ticketId, companyId },
      { $pull: { tags: tag } }
    );

    childLogger.info({ ticketId, tag }, 'Tag removed via workflow');
  },

  /**
   * Send email via SendGrid
   * Supports both template-based and direct email sending
   */
  async send_email(params, context, companyId) {
    if (!env.SENDGRID_API_KEY) {
      throw new Error('SendGrid not configured');
    }

    const templateId = params.template as string;
    const toParam = params.to as string;
    
    // Resolve recipient
    let to: string;
    if (toParam === 'customer') {
      to = (context.customer as Record<string, unknown>)?.email as string || context.customerEmail as string;
      if (!to) throw new Error('No customer email available');
    } else if (toParam === 'manager') {
      // In real implementation, would fetch from company config
      to = context.managerEmail as string || 'manager@company.com';
    } else {
      to = toParam;
    }

    let subject: string;
    let body: string;

    // Use template if specified
    if (templateId) {
      const template = getEmailTemplate(templateId);
      if (!template) {
        throw new Error(`Email template not found: ${templateId}`);
      }

      // Build variables from context
      const variables = {
        ...context,
        ticketId: context.ticketId,
        customerName: (context.customer as Record<string, unknown>)?.name || 'Valued Customer',
        ticketUrl: `${env.APP_URL || 'https://app.omnisupport.ai'}/tickets/${context.ticketId}`,
        createdAt: new Date().toISOString(),
        slaDeadline: (context.sla as Record<string, unknown>)?.responseDeadline || 'N/A',
        escalationReason: (context.escalation as Record<string, unknown>)?.reason || 'Manual escalation',
      };

      subject = interpolateEmailTemplate(template.subject, variables);
      body = interpolateEmailTemplate(template.bodyHtml, variables);

      await sgMail.send({
        to,
        from: env.SENDGRID_FROM_EMAIL || 'noreply@omnisupport.ai',
        subject,
        html: body,
        text: interpolateEmailTemplate(template.bodyText, variables),
      });
    } else {
      // Direct email (no template)
      subject = params.subject as string || 'Workflow Notification';
      body = params.body as string || `Workflow triggered for ticket ${context.ticketId}`;

      await sgMail.send({
        to,
        from: env.SENDGRID_FROM_EMAIL || 'noreply@omnisupport.ai',
        subject: interpolateTemplate(subject, context),
        text: interpolateTemplate(body, context),
      });
    }

    childLogger.info({ to, templateId, subject }, 'Email sent via workflow');
  },

  /**
   * Send Slack notification
   */
  async notify_slack(params, context, companyId) {
    const webhookUrl = params.webhookUrl as string;
    const channel = params.channel as string;
    const mention = params.mention as string;

    // Build message
    const ticketId = context.ticketId as string;
    const subject = context.subject as string || 'Unknown';
    const priority = context.priority as string || 'normal';

    const message = {
      channel,
      text: `${mention ? `${mention} ` : ''}🎫 Workflow Alert`,
      blocks: [
        {
          type: 'section',
          text: {
            type: 'mrkdwn',
            text: `*Workflow Triggered*\n• Ticket: ${ticketId}\n• Subject: ${subject}\n• Priority: ${priority}`,
          },
        },
      ],
    };

    // Use company webhook URL or direct URL
    const url = webhookUrl || params.url as string;
    if (!url) {
      throw new Error('No Slack webhook URL configured');
    }

    await axios.post(url, message, {
      headers: { 'Content-Type': 'application/json' },
      timeout: 5000,
    });

    childLogger.info({ channel }, 'Slack notification sent via workflow');
  },

  /**
   * Call external webhook
   */
  async webhook(params, context, companyId) {
    const url = params.url as string;
    const method = (params.method as string || 'POST').toUpperCase();
    const headers = params.headers as Record<string, string> || {};

    if (!url) throw new Error('No webhook URL specified');

    const payload = {
      event: context.event,
      ticketId: context.ticketId,
      companyId,
      timestamp: new Date().toISOString(),
      data: context,
    };

    await axios({
      method,
      url,
      data: payload,
      headers: {
        'Content-Type': 'application/json',
        ...headers,
      },
      timeout: 10000,
    });

    childLogger.info({ url, method }, 'Webhook called via workflow');
  },

  /**
   * Create a new ticket
   */
  async create_ticket(params, context, companyId) {
    const subject = params.subject as string || `Follow-up: ${context.subject}`;
    const description = params.description as string || 'Created by workflow automation';
    const priority = params.priority as string;

    const newTicket = await Ticket.create({
      companyId,
      externalId: `workflow-${Date.now()}`,
      source: 'api',
      subject: interpolateTemplate(subject, context),
      description: interpolateTemplate(description, context),
      priority: priority || 'normal',
      status: 'new',
      tags: ['workflow-created'],
      metadata: {
        createdByWorkflow: true,
        sourceTicketId: context.ticketId,
      },
    });

    // Queue for classification
    await classificationQueue.add(
      `classify-${newTicket._id}`,
      {
        ticketId: newTicket._id.toString(),
        companyId,
        subject: newTicket.subject,
        description: newTicket.description,
        source: 'api',
      }
    );

    childLogger.info({ newTicketId: newTicket._id }, 'Ticket created via workflow');
  },

  /**
   * Close ticket
   */
  async close_ticket(params, context, companyId) {
    const ticketId = context.ticketId as string;
    const reason = params.reason as string || 'workflow_closed';

    if (!ticketId) throw new Error('No ticketId in context');

    await Ticket.findOneAndUpdate(
      { _id: ticketId, companyId },
      {
        status: 'closed',
        resolution: {
          resolvedAt: new Date(),
          resolvedBy: 'workflow',
          resolutionType: 'auto_closed',
        },
      }
    );

    childLogger.info({ ticketId, reason }, 'Ticket closed via workflow');
  },

  /**
   * Escalate ticket
   */
  async escalate(params, context, companyId) {
    const ticketId = context.ticketId as string;
    const reason = params.reason as string || 'workflow_escalation';

    if (!ticketId) throw new Error('No ticketId in context');

    await Ticket.findOneAndUpdate(
      { _id: ticketId, companyId },
      {
        status: 'open',
        escalation: {
          escalatedAt: new Date(),
          reason,
          notes: 'Escalated by workflow automation',
        },
      }
    );

    // Emit socket event
    if (socketIO) {
      socketIO.to(`company:${companyId}`).emit('ticket:escalated', {
        ticketId,
        reason,
      });
    }

    childLogger.info({ ticketId, reason }, 'Ticket escalated via workflow');
  },

  /**
   * Set ticket priority
   */
  async set_priority(params, context, companyId) {
    const ticketId = context.ticketId as string;
    const priority = params.priority as 'low' | 'normal' | 'high' | 'urgent';

    if (!ticketId) throw new Error('No ticketId in context');
    if (!priority) throw new Error('No priority specified');

    await Ticket.findOneAndUpdate(
      { _id: ticketId, companyId },
      { priority }
    );

    childLogger.info({ ticketId, priority }, 'Priority set via workflow');
  },

  /**
   * Add internal note
   */
  async add_note(params, context, companyId) {
    const ticketId = context.ticketId as string;
    const note = params.note as string;

    if (!ticketId) throw new Error('No ticketId in context');
    if (!note) throw new Error('No note specified');

    // Add note to metadata
    await Ticket.findOneAndUpdate(
      { _id: ticketId, companyId },
      {
        $push: {
          'metadata.workflowNotes': {
            content: interpolateTemplate(note, context),
            createdAt: new Date(),
            source: 'workflow',
          },
        },
      }
    );

    childLogger.info({ ticketId }, 'Note added via workflow');
  },
};

/**
 * Interpolate template strings with context values
 */
function interpolateTemplate(template: string, context: Record<string, unknown>): string {
  return template.replace(/\{\{(\w+(?:\.\w+)*)\}\}/g, (_, path) => {
    const value = getNestedValue(context, path);
    return value !== undefined ? String(value) : '';
  });
}

/**
 * Process workflow execution job
 */
async function processWorkflowJob(job: Job<WorkflowJobData>): Promise<WorkflowJobResult> {
  const startTime = Date.now();
  const { workflowId, triggerId, companyId, context } = job.data;
  const errors: string[] = [];
  let actionsExecuted = 0;

  childLogger.info(
    { workflowId, triggerId, companyId, jobId: job.id },
    'Processing workflow execution job'
  );

  try {
    // Validate job data
    WorkflowJobDataSchema.parse(job.data);

    // Fetch workflow
    const workflow = await Workflow.findOne({
      _id: workflowId,
      companyId,
      isActive: true,
    });

    if (!workflow) {
      throw new Error(`Workflow not found or inactive: ${workflowId}`);
    }

    // Evaluate conditions
    const conditionsMet = evaluateConditions(workflow, context);

    if (!conditionsMet) {
      childLogger.info({ workflowId, triggerId }, 'Workflow conditions not met, skipping');
      return {
        workflowId,
        triggerId,
        success: true,
        actionsExecuted: 0,
        errors: [],
        processingTimeMs: Date.now() - startTime,
      };
    }

    // Sort and execute actions in order
    const sortedActions = [...workflow.actions].sort((a, b) => a.order - b.order);
    const executedActionTypes: string[] = [];

    for (const action of sortedActions) {
      try {
        const handler = actionHandlers[action.type];
        if (!handler) {
          throw new Error(`Unknown action type: ${action.type}`);
        }

        await handler(action.params, context, companyId);
        actionsExecuted++;
        executedActionTypes.push(action.type);
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        errors.push(`Action ${action.type}: ${errorMessage}`);
        childLogger.error(
          { error, workflowId, actionType: action.type },
          'Workflow action failed'
        );
        // Continue with other actions even if one fails
      }
    }

    // Update workflow stats
    const statsUpdate: Record<string, unknown> = {
      'stats.triggeredCount': 1,
      'stats.lastTriggeredAt': new Date(),
    };

    if (errors.length === 0) {
      statsUpdate['stats.successCount'] = 1;
      statsUpdate['stats.lastSuccessAt'] = new Date();
    } else {
      statsUpdate['stats.failedCount'] = 1;
      statsUpdate['stats.lastFailedAt'] = new Date();
    }

    await Workflow.findByIdAndUpdate(workflowId, { $inc: statsUpdate });

    const processingTimeMs = Date.now() - startTime;

    // Log execution to WorkflowExecutionLog
    await WorkflowExecutionLog.create({
      workflowId,
      companyId,
      triggerId,
      context,
      actionsExecuted: executedActionTypes,
      success: errors.length === 0,
      errorMessage: errors.length > 0 ? errors.join('; ') : undefined,
      durationMs: processingTimeMs,
    });

    childLogger.info(
      {
        workflowId,
        triggerId,
        actionsExecuted,
        errorCount: errors.length,
        processingTimeMs,
      },
      'Workflow execution completed'
    );

    return {
      workflowId,
      triggerId,
      success: errors.length === 0,
      actionsExecuted,
      errors,
      processingTimeMs,
    };
  } catch (error) {
    const processingTimeMs = Date.now() - startTime;

    // Log failed execution
    try {
      await WorkflowExecutionLog.create({
        workflowId,
        companyId,
        triggerId,
        context,
        actionsExecuted: [],
        success: false,
        errorMessage: error instanceof Error ? error.message : 'Unknown error',
        durationMs: processingTimeMs,
      });
    } catch (logError) {
      childLogger.error({ logError }, 'Failed to log workflow execution');
    }
    
    childLogger.error(
      { error, workflowId, triggerId, jobId: job.id, processingTimeMs },
      'Workflow execution job failed'
    );
    
    throw error;
  }
}

/**
 * Create and start the workflow executor worker
 */
export function createWorkflowWorker(): Worker<WorkflowJobData, WorkflowJobResult> {
  const worker = new Worker<WorkflowJobData, WorkflowJobResult>(
    QUEUES.WORKFLOW,
    processWorkflowJob,
    {
      connection: connectionOptions,
      concurrency: 20,
      limiter: {
        max: 100,
        duration: 60000, // 100 jobs per minute
      },
    }
  );

  worker.on('completed', (job, result) => {
    childLogger.info(
      {
        jobId: job.id,
        workflowId: result.workflowId,
        actionsExecuted: result.actionsExecuted,
        processingTimeMs: result.processingTimeMs,
      },
      'Workflow execution job completed'
    );
  });

  worker.on('failed', (job, error) => {
    childLogger.error(
      {
        jobId: job?.id,
        workflowId: job?.data.workflowId,
        error: error.message,
        attempt: job?.attemptsMade,
      },
      'Workflow execution job failed'
    );
  });

  worker.on('error', (error) => {
    childLogger.error({ error }, 'Workflow worker error');
  });

  childLogger.info('Workflow executor worker started');
  return worker;
}

// Export for testing
export { processWorkflowJob, evaluateCondition, evaluateConditions, actionHandlers };
