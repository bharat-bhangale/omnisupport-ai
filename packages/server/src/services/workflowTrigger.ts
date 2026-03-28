import { Workflow, type IWorkflow, type WorkflowTriggerEvent, type ConditionOperator } from '../models/Workflow.js';
import { workflowQueue } from '../queues/index.js';
import { logger } from '../config/logger.js';

const childLogger = logger.child({ service: 'workflowTrigger' });

/**
 * Context passed to workflow for evaluation
 */
export interface WorkflowContext {
  ticketId?: string;
  callId?: string;
  customerId?: string;
  event: WorkflowTriggerEvent;
  // Ticket fields
  subject?: string;
  description?: string;
  status?: string;
  priority?: string;
  source?: string;
  // Classification fields
  classification?: {
    intent?: string;
    subIntent?: string;
    confidence?: number;
    categories?: string[];
  };
  sentiment?: string;
  // Customer fields
  customer?: {
    name?: string;
    email?: string;
    tier?: string;
    churnRiskScore?: number;
  };
  // SLA fields
  sla?: {
    responseDeadline?: string;
    isBreached?: boolean;
    minutesUntilBreach?: number;
  };
  // Additional data
  [key: string]: unknown;
}

/**
 * Result of triggering workflows
 */
export interface TriggerResult {
  workflowsMatched: number;
  workflowsQueued: number;
  workflowIds: string[];
}

/**
 * Evaluate trigger filter against context
 */
function evaluateFilter(
  field: string,
  operator: ConditionOperator,
  expectedValue: unknown,
  context: WorkflowContext
): boolean {
  // Get nested value from context
  const actualValue = field.split('.').reduce<unknown>((obj, key) => {
    if (obj && typeof obj === 'object' && key in obj) {
      return (obj as Record<string, unknown>)[key];
    }
    return undefined;
  }, context);

  switch (operator) {
    case 'equals':
      return actualValue === expectedValue;
    case 'not_equals':
      return actualValue !== expectedValue;
    case 'contains':
      if (typeof actualValue === 'string' && typeof expectedValue === 'string') {
        return actualValue.toLowerCase().includes(expectedValue.toLowerCase());
      }
      return false;
    case 'in':
      return Array.isArray(expectedValue) && expectedValue.includes(actualValue);
    case 'not_in':
      return !Array.isArray(expectedValue) || !expectedValue.includes(actualValue);
    case 'greater_than':
      return typeof actualValue === 'number' && typeof expectedValue === 'number'
        && actualValue > expectedValue;
    case 'less_than':
      return typeof actualValue === 'number' && typeof expectedValue === 'number'
        && actualValue < expectedValue;
    case 'exists':
      return actualValue !== undefined && actualValue !== null;
    case 'not_exists':
      return actualValue === undefined || actualValue === null;
    default:
      return false;
  }
}

/**
 * Check if a workflow's trigger filters match the context
 */
function matchesFilters(workflow: IWorkflow, context: WorkflowContext): boolean {
  const filters = workflow.trigger.filters;
  
  // No filters = always match
  if (!filters || filters.length === 0) {
    return true;
  }

  // All filters must match (AND logic for trigger filters)
  return filters.every((filter) =>
    evaluateFilter(filter.field, filter.operator, filter.value, context)
  );
}

/**
 * Trigger all matching workflows for an event
 * 
 * @param event - The event that occurred
 * @param context - Context data for the event
 * @param companyId - Company ID to scope workflows
 * @returns Result with count of workflows matched and queued
 */
export async function triggerWorkflows(
  event: WorkflowTriggerEvent,
  context: WorkflowContext,
  companyId: string
): Promise<TriggerResult> {
  const triggerId = `trigger-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

  childLogger.info(
    { event, companyId, triggerId, ticketId: context.ticketId },
    'Triggering workflows'
  );

  try {
    // Find all active workflows matching this event
    const workflows = await Workflow.find({
      companyId,
      isActive: true,
      'trigger.event': event,
    }).lean().exec();

    if (workflows.length === 0) {
      childLogger.debug({ event, companyId }, 'No workflows match this event');
      return { workflowsMatched: 0, workflowsQueued: 0, workflowIds: [] };
    }

    // Filter workflows by trigger filters
    const matchingWorkflows = workflows.filter((w) => matchesFilters(w as IWorkflow, context));

    if (matchingWorkflows.length === 0) {
      childLogger.debug(
        { event, companyId, totalWorkflows: workflows.length },
        'No workflows match trigger filters'
      );
      return { workflowsMatched: workflows.length, workflowsQueued: 0, workflowIds: [] };
    }

    // Queue each matching workflow
    const queuedIds: string[] = [];
    
    for (const workflow of matchingWorkflows) {
      const jobName = `workflow-${workflow._id}-${triggerId}`;
      
      await workflowQueue.add(
        jobName,
        {
          workflowId: workflow._id.toString(),
          triggerId,
          companyId,
          context: { ...context, event },
        },
        {
          // Higher priority for urgent ticket events
          priority: context.priority === 'urgent' ? 1 : 
                   context.priority === 'high' ? 2 : 3,
        }
      );

      queuedIds.push(workflow._id.toString());
    }

    childLogger.info(
      {
        event,
        companyId,
        triggerId,
        matchedCount: workflows.length,
        queuedCount: queuedIds.length,
      },
      'Workflows queued for execution'
    );

    return {
      workflowsMatched: workflows.length,
      workflowsQueued: queuedIds.length,
      workflowIds: queuedIds,
    };
  } catch (error) {
    childLogger.error(
      { error, event, companyId, triggerId },
      'Failed to trigger workflows'
    );
    throw error;
  }
}

/**
 * Test a workflow without executing actions (dry run)
 * 
 * @param workflowId - Workflow to test
 * @param context - Test context
 * @param companyId - Company ID for validation
 * @returns Dry run result
 */
export async function testWorkflow(
  workflowId: string,
  context: WorkflowContext,
  companyId: string
): Promise<{
  wouldTrigger: boolean;
  filterResults: { field: string; operator: string; expected: unknown; actual: unknown; passed: boolean }[];
  conditionResults: { field: string; operator: string; expected: unknown; actual: unknown; passed: boolean }[];
  actionsToRun: { type: string; order: number; params: Record<string, unknown> }[];
}> {
  const workflow = await Workflow.findOne({ _id: workflowId, companyId });

  if (!workflow) {
    throw new Error('Workflow not found');
  }

  // Evaluate filters
  const filterResults = (workflow.trigger.filters || []).map((filter) => {
    const actualValue = filter.field.split('.').reduce<unknown>((obj, key) => {
      if (obj && typeof obj === 'object' && key in obj) {
        return (obj as Record<string, unknown>)[key];
      }
      return undefined;
    }, context);

    return {
      field: filter.field,
      operator: filter.operator,
      expected: filter.value,
      actual: actualValue,
      passed: evaluateFilter(filter.field, filter.operator, filter.value, context),
    };
  });

  // Evaluate conditions
  const conditionResults = workflow.conditions.map((condition) => {
    const actualValue = condition.field.split('.').reduce<unknown>((obj, key) => {
      if (obj && typeof obj === 'object' && key in obj) {
        return (obj as Record<string, unknown>)[key];
      }
      return undefined;
    }, context);

    return {
      field: condition.field,
      operator: condition.operator,
      expected: condition.value,
      actual: actualValue,
      passed: evaluateFilter(condition.field, condition.operator, condition.value, context),
    };
  });

  // Check if all/any conditions pass based on logic
  const filtersPass = filterResults.length === 0 || filterResults.every((r) => r.passed);
  const conditionsPass = conditionResults.length === 0 || 
    (workflow.conditionLogic === 'AND' 
      ? conditionResults.every((r) => r.passed)
      : conditionResults.some((r) => r.passed));

  const wouldTrigger = filtersPass && conditionsPass;

  // Get sorted actions
  const actionsToRun = wouldTrigger
    ? [...workflow.actions]
        .sort((a, b) => a.order - b.order)
        .map((a) => ({ type: a.type, order: a.order, params: a.params }))
    : [];

  return {
    wouldTrigger,
    filterResults,
    conditionResults,
    actionsToRun,
  };
}

/**
 * Convenience function to trigger from classification worker
 */
export async function triggerOnClassification(
  ticketId: string,
  companyId: string,
  classification: {
    intent?: string;
    subIntent?: string;
    confidence?: number;
    categories?: string[];
  },
  ticketData: {
    subject?: string;
    description?: string;
    priority?: string;
    customerId?: string;
    customerTier?: string;
  }
): Promise<TriggerResult> {
  return triggerWorkflows(
    'ticket:classified',
    {
      event: 'ticket:classified',
      ticketId,
      classification,
      subject: ticketData.subject,
      description: ticketData.description,
      priority: ticketData.priority,
      customerId: ticketData.customerId,
      customer: {
        tier: ticketData.customerTier,
      },
    },
    companyId
  );
}

/**
 * Convenience function to trigger from SLA monitor
 */
export async function triggerOnSLABreach(
  ticketId: string,
  companyId: string,
  slaData: {
    responseDeadline?: string;
    isBreached: boolean;
    minutesUntilBreach?: number;
  },
  ticketData: {
    subject?: string;
    priority?: string;
    customerId?: string;
  }
): Promise<TriggerResult> {
  const event: WorkflowTriggerEvent = slaData.isBreached
    ? 'ticket:sla_breached'
    : 'ticket:sla_warning';

  return triggerWorkflows(
    event,
    {
      event,
      ticketId,
      sla: slaData,
      subject: ticketData.subject,
      priority: ticketData.priority,
      customerId: ticketData.customerId,
    },
    companyId
  );
}
