import mongoose, { Schema, Document, Model } from 'mongoose';

/**
 * Workflow trigger events
 */
export type WorkflowTriggerEvent =
  | 'ticket:created'
  | 'ticket:classified'
  | 'ticket:updated'
  | 'ticket:escalated'
  | 'ticket:sla_warning'
  | 'ticket:sla_breached'
  | 'ticket:resolved'
  | 'call:started'
  | 'call:ended'
  | 'call:escalated'
  | 'customer:at_risk'
  | 'feedback:negative';

/**
 * Condition operators for workflow rules
 */
export type ConditionOperator =
  | 'equals'
  | 'not_equals'
  | 'contains'
  | 'not_contains'
  | 'greater_than'
  | 'less_than'
  | 'in'
  | 'not_in'
  | 'exists'
  | 'not_exists'
  | 'matches_regex';

/**
 * Action types for workflow automation
 */
export type WorkflowActionType =
  | 'assign_agent'
  | 'add_tag'
  | 'remove_tag'
  | 'send_email'
  | 'notify_slack'
  | 'webhook'
  | 'create_ticket'
  | 'close_ticket'
  | 'escalate'
  | 'set_priority'
  | 'add_note';

/**
 * Workflow trigger configuration
 */
export interface WorkflowTrigger {
  event: WorkflowTriggerEvent;
  filters?: {
    field: string;
    operator: ConditionOperator;
    value: unknown;
  }[];
}

/**
 * Workflow condition
 */
export interface WorkflowCondition {
  field: string;
  operator: ConditionOperator;
  value: unknown;
}

/**
 * Workflow action
 */
export interface WorkflowAction {
  type: WorkflowActionType;
  params: Record<string, unknown>;
  order: number;
}

/**
 * Workflow statistics
 */
export interface WorkflowStats {
  triggeredCount: number;
  successCount: number;
  failedCount: number;
  lastTriggeredAt?: Date;
  lastSuccessAt?: Date;
  lastFailedAt?: Date;
}

/**
 * Workflow document interface
 */
export interface IWorkflow extends Document {
  companyId: mongoose.Types.ObjectId;
  name: string;
  description?: string;
  isActive: boolean;
  version: number;
  trigger: WorkflowTrigger;
  conditions: WorkflowCondition[];
  conditionLogic: 'AND' | 'OR';
  actions: WorkflowAction[];
  stats: WorkflowStats;
  createdBy: string;
  updatedBy?: string;
  createdAt: Date;
  updatedAt: Date;
}

const workflowTriggerSchema = new Schema<WorkflowTrigger>(
  {
    event: {
      type: String,
      required: true,
      enum: [
        'ticket:created',
        'ticket:classified',
        'ticket:updated',
        'ticket:escalated',
        'ticket:sla_warning',
        'ticket:sla_breached',
        'ticket:resolved',
        'call:started',
        'call:ended',
        'call:escalated',
        'customer:at_risk',
        'feedback:negative',
      ],
    },
    filters: [
      {
        field: { type: String, required: true },
        operator: {
          type: String,
          required: true,
          enum: [
            'equals',
            'not_equals',
            'contains',
            'not_contains',
            'greater_than',
            'less_than',
            'in',
            'not_in',
            'exists',
            'not_exists',
            'matches_regex',
          ],
        },
        value: { type: Schema.Types.Mixed },
      },
    ],
  },
  { _id: false }
);

const workflowConditionSchema = new Schema<WorkflowCondition>(
  {
    field: { type: String, required: true },
    operator: {
      type: String,
      required: true,
      enum: [
        'equals',
        'not_equals',
        'contains',
        'not_contains',
        'greater_than',
        'less_than',
        'in',
        'not_in',
        'exists',
        'not_exists',
        'matches_regex',
      ],
    },
    value: { type: Schema.Types.Mixed },
  },
  { _id: false }
);

const workflowActionSchema = new Schema<WorkflowAction>(
  {
    type: {
      type: String,
      required: true,
      enum: [
        'assign_agent',
        'add_tag',
        'remove_tag',
        'send_email',
        'notify_slack',
        'webhook',
        'create_ticket',
        'close_ticket',
        'escalate',
        'set_priority',
        'add_note',
      ],
    },
    params: {
      type: Schema.Types.Mixed,
      required: true,
      default: {},
    },
    order: {
      type: Number,
      required: true,
      default: 0,
    },
  },
  { _id: false }
);

const workflowStatsSchema = new Schema<WorkflowStats>(
  {
    triggeredCount: { type: Number, default: 0 },
    successCount: { type: Number, default: 0 },
    failedCount: { type: Number, default: 0 },
    lastTriggeredAt: Date,
    lastSuccessAt: Date,
    lastFailedAt: Date,
  },
  { _id: false }
);

const workflowSchema = new Schema<IWorkflow>(
  {
    companyId: {
      type: Schema.Types.ObjectId,
      ref: 'Company',
      required: true,
      index: true,
    },
    name: {
      type: String,
      required: true,
      trim: true,
      maxlength: 200,
    },
    description: {
      type: String,
      trim: true,
      maxlength: 1000,
    },
    isActive: {
      type: Boolean,
      default: true,
    },
    version: {
      type: Number,
      default: 1,
      min: 1,
    },
    trigger: {
      type: workflowTriggerSchema,
      required: true,
    },
    conditions: {
      type: [workflowConditionSchema],
      default: [],
    },
    conditionLogic: {
      type: String,
      enum: ['AND', 'OR'],
      default: 'AND',
    },
    actions: {
      type: [workflowActionSchema],
      required: true,
      validate: {
        validator: function (v: WorkflowAction[]) {
          return v.length > 0;
        },
        message: 'At least one action is required',
      },
    },
    stats: {
      type: workflowStatsSchema,
      default: () => ({
        triggeredCount: 0,
        successCount: 0,
        failedCount: 0,
      }),
    },
    createdBy: {
      type: String,
      required: true,
    },
    updatedBy: String,
  },
  {
    timestamps: true,
  }
);

// Compound indexes
workflowSchema.index({ companyId: 1, isActive: 1 });
workflowSchema.index({ companyId: 1, 'trigger.event': 1, isActive: 1 });
workflowSchema.index({ companyId: 1, name: 1 }, { unique: true });

/**
 * Pre-save hook to increment version on updates
 */
workflowSchema.pre('save', function (next) {
  if (!this.isNew && this.isModified()) {
    this.version += 1;
  }
  next();
});

export const Workflow: Model<IWorkflow> = mongoose.model<IWorkflow>('Workflow', workflowSchema);

/**
 * Pre-built workflow templates
 */
export const WORKFLOW_TEMPLATES = [
  {
    id: 'auto-escalate-p1',
    name: 'Auto-Escalate P1 Tickets',
    description: 'Automatically escalate high-priority tickets to senior agents',
    trigger: { event: 'ticket:classified' },
    conditions: [
      { field: 'priority', operator: 'equals', value: 'urgent' },
    ],
    conditionLogic: 'AND',
    actions: [
      { type: 'escalate', params: { reason: 'P1 auto-escalation' }, order: 1 },
      { type: 'notify_slack', params: { channel: '#urgent-tickets' }, order: 2 },
    ],
  },
  {
    id: 'sla-breach-notification',
    name: 'SLA Breach Notification',
    description: 'Notify team when SLA is about to breach',
    trigger: { event: 'ticket:sla_warning' },
    conditions: [],
    conditionLogic: 'AND',
    actions: [
      { type: 'notify_slack', params: { channel: '#sla-alerts', mention: '@channel' }, order: 1 },
      { type: 'send_email', params: { to: 'team-lead@company.com', subject: 'SLA Warning' }, order: 2 },
    ],
  },
  {
    id: 'vip-routing',
    name: 'VIP Customer Routing',
    description: 'Route VIP customer tickets to dedicated team',
    trigger: { event: 'ticket:created' },
    conditions: [
      { field: 'customer.tier', operator: 'in', value: ['vip', 'enterprise'] },
    ],
    conditionLogic: 'AND',
    actions: [
      { type: 'assign_agent', params: { team: 'vip-support' }, order: 1 },
      { type: 'add_tag', params: { tag: 'vip-priority' }, order: 2 },
      { type: 'set_priority', params: { priority: 'high' }, order: 3 },
    ],
  },
  {
    id: 'negative-feedback-alert',
    name: 'Negative Feedback Alert',
    description: 'Alert managers when negative feedback is received',
    trigger: { event: 'feedback:negative' },
    conditions: [],
    conditionLogic: 'AND',
    actions: [
      { type: 'notify_slack', params: { channel: '#customer-feedback' }, order: 1 },
      { type: 'add_tag', params: { tag: 'needs-review' }, order: 2 },
    ],
  },
  {
    id: 'auto-close-resolved',
    name: 'Auto-Close After 7 Days',
    description: 'Automatically close resolved tickets after 7 days of no activity',
    trigger: { event: 'ticket:resolved' },
    conditions: [],
    conditionLogic: 'AND',
    actions: [
      { type: 'close_ticket', params: { delayDays: 7, reason: 'auto_closed' }, order: 1 },
    ],
  },
  {
    id: 'billing-category-routing',
    name: 'Billing Category Routing',
    description: 'Route billing-related tickets to finance team',
    trigger: { event: 'ticket:classified' },
    conditions: [
      { field: 'classification.intent', operator: 'contains', value: 'billing' },
    ],
    conditionLogic: 'AND',
    actions: [
      { type: 'assign_agent', params: { team: 'billing-support' }, order: 1 },
      { type: 'add_tag', params: { tag: 'billing' }, order: 2 },
    ],
  },
] as const;
