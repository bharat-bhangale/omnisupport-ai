// ============================================================================
// WORKFLOW TEMPLATES
// ============================================================================
// Pre-built workflow templates for quick setup

import type { WorkflowTriggerEvent, ConditionOperator, WorkflowActionType } from '../models/Workflow.js';

export interface WorkflowTemplateCondition {
  field: string;
  op: ConditionOperator;
  value: unknown;
}

export interface WorkflowTemplateAction {
  type: WorkflowActionType;
  params: Record<string, unknown>;
}

export interface WorkflowTemplate {
  id: string;
  name: string;
  description: string;
  category: 'routing' | 'notification' | 'escalation' | 'automation' | 'sla';
  trigger: WorkflowTriggerEvent;
  conditions: WorkflowTemplateCondition[];
  actions: WorkflowTemplateAction[];
}

/**
 * Pre-built workflow templates
 * These are displayed in the template library for quick workflow creation
 */
export const WORKFLOW_TEMPLATES: WorkflowTemplate[] = [
  // ============================================================================
  // Template 1: Auto-Acknowledge P1
  // ============================================================================
  {
    id: 'auto-acknowledge-p1',
    name: 'Auto-Acknowledge P1 Tickets',
    description: 'Immediately acknowledge high-priority tickets and notify team via Slack',
    category: 'notification',
    trigger: 'ticket:created',
    conditions: [
      { field: 'priority', op: 'equals', value: 'urgent' },
    ],
    actions: [
      {
        type: 'send_email',
        params: {
          template: 'ack_p1',
          to: 'customer',
          delayMs: 0,
        },
      },
      {
        type: 'notify_slack',
        params: {
          message: 'P1 ticket received: {subject}',
          channel: '#urgent-tickets',
        },
      },
    ],
  },

  // ============================================================================
  // Template 2: VIP Customer Fast-Track
  // ============================================================================
  {
    id: 'vip-customer-fast-track',
    name: 'VIP Customer Fast-Track',
    description: 'Route gold tier customers to senior support queue with priority tag',
    category: 'routing',
    trigger: 'ticket:classified',
    conditions: [
      { field: 'customer.tier', op: 'equals', value: 'gold' },
    ],
    actions: [
      {
        type: 'assign_agent',
        params: {
          agentId: 'senior_queue',
        },
      },
      {
        type: 'add_tag',
        params: {
          tag: 'vip-priority',
        },
      },
    ],
  },

  // ============================================================================
  // Template 3: SLA Breach Alert
  // ============================================================================
  {
    id: 'sla-breach-alert',
    name: 'SLA Breach Alert',
    description: 'Alert managers via Slack and email when SLA is breached',
    category: 'sla',
    trigger: 'ticket:sla_breached',
    conditions: [], // No conditions - fire for all SLA breaches
    actions: [
      {
        type: 'notify_slack',
        params: {
          message: 'SLA BREACHED: {subject} — {priority}',
          channel: '#sla-alerts',
          mention: '@channel',
        },
      },
      {
        type: 'send_email',
        params: {
          template: 'sla_breach',
          to: 'manager',
        },
      },
    ],
  },

  // ============================================================================
  // Template 4: Billing to Finance Queue
  // ============================================================================
  {
    id: 'billing-to-finance-queue',
    name: 'Billing to Finance Queue',
    description: 'Route billing-related tickets to the finance support queue',
    category: 'routing',
    trigger: 'ticket:classified',
    conditions: [
      { field: 'classification.intent', op: 'equals', value: 'billing' },
    ],
    actions: [
      {
        type: 'assign_agent',
        params: {
          agentId: 'finance_queue',
        },
      },
      {
        type: 'add_tag',
        params: {
          tag: 'billing',
        },
      },
    ],
  },

  // ============================================================================
  // Template 5: Negative Sentiment Escalation
  // ============================================================================
  {
    id: 'negative-sentiment-escalation',
    name: 'Negative Sentiment Escalation',
    description: 'Escalate tickets when customer sentiment score exceeds frustration threshold',
    category: 'escalation',
    trigger: 'ticket:classified',
    conditions: [
      { field: 'sentimentScore', op: 'greater_than', value: 0.75 },
    ],
    actions: [
      {
        type: 'escalate',
        params: {
          reason: 'High negative sentiment detected',
        },
      },
      {
        type: 'notify_slack',
        params: {
          message: 'Frustrated customer: {customer.name} — {subject}',
          channel: '#customer-escalations',
        },
      },
    ],
  },

  // ============================================================================
  // Additional useful templates
  // ============================================================================
  {
    id: 'enterprise-priority-routing',
    name: 'Enterprise Account Priority',
    description: 'Enterprise customers get automatic high priority and dedicated team',
    category: 'routing',
    trigger: 'ticket:created',
    conditions: [
      { field: 'customer.tier', op: 'equals', value: 'enterprise' },
    ],
    actions: [
      {
        type: 'set_priority',
        params: {
          priority: 'high',
        },
      },
      {
        type: 'assign_agent',
        params: {
          agentId: 'enterprise_team',
        },
      },
      {
        type: 'add_tag',
        params: {
          tag: 'enterprise',
        },
      },
    ],
  },

  {
    id: 'technical-support-routing',
    name: 'Technical Support Routing',
    description: 'Route technical issues to specialized tech support team',
    category: 'routing',
    trigger: 'ticket:classified',
    conditions: [
      { field: 'classification.intent', op: 'contains', value: 'technical' },
    ],
    actions: [
      {
        type: 'assign_agent',
        params: {
          agentId: 'tech_support_queue',
        },
      },
      {
        type: 'add_tag',
        params: {
          tag: 'technical',
        },
      },
    ],
  },

  {
    id: 'after-hours-auto-response',
    name: 'After Hours Auto-Response',
    description: 'Send acknowledgment email for tickets received outside business hours',
    category: 'automation',
    trigger: 'ticket:created',
    conditions: [], // Typically combined with time-based logic at execution
    actions: [
      {
        type: 'send_email',
        params: {
          template: 'after_hours_ack',
          to: 'customer',
        },
      },
      {
        type: 'add_tag',
        params: {
          tag: 'after-hours',
        },
      },
    ],
  },

  {
    id: 'churn-risk-alert',
    name: 'Churn Risk Alert',
    description: 'Alert customer success team when at-risk customers submit tickets',
    category: 'notification',
    trigger: 'customer:at_risk',
    conditions: [],
    actions: [
      {
        type: 'notify_slack',
        params: {
          message: 'At-risk customer ticket: {customer.name} (Score: {customer.churnRiskScore})',
          channel: '#customer-success',
        },
      },
      {
        type: 'add_tag',
        params: {
          tag: 'churn-risk',
        },
      },
    ],
  },

  {
    id: 'negative-feedback-followup',
    name: 'Negative Feedback Follow-up',
    description: 'Tag tickets for review when negative feedback is received',
    category: 'escalation',
    trigger: 'feedback:negative',
    conditions: [],
    actions: [
      {
        type: 'add_tag',
        params: {
          tag: 'needs-review',
        },
      },
      {
        type: 'notify_slack',
        params: {
          message: 'Negative feedback received: {subject}',
          channel: '#customer-feedback',
        },
      },
    ],
  },
];

/**
 * Get template by ID
 */
export function getTemplateById(templateId: string): WorkflowTemplate | undefined {
  return WORKFLOW_TEMPLATES.find((t) => t.id === templateId);
}

/**
 * Get templates by category
 */
export function getTemplatesByCategory(category: WorkflowTemplate['category']): WorkflowTemplate[] {
  return WORKFLOW_TEMPLATES.filter((t) => t.category === category);
}

/**
 * Convert template conditions to workflow format
 */
export function convertTemplateConditions(
  conditions: WorkflowTemplateCondition[]
): { field: string; operator: ConditionOperator; value: unknown }[] {
  return conditions.map((c) => ({
    field: c.field,
    operator: c.op,
    value: c.value,
  }));
}

/**
 * Convert template actions to workflow format with order
 */
export function convertTemplateActions(
  actions: WorkflowTemplateAction[]
): { type: WorkflowActionType; params: Record<string, unknown>; order: number }[] {
  return actions.map((a, index) => ({
    type: a.type,
    params: a.params,
    order: index + 1,
  }));
}
