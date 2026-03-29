// ============================================================================
// PROACTIVE TRIGGER MODEL
// ============================================================================

import mongoose, { Schema, Document, Model } from 'mongoose';

// ============================================================================
// TYPES
// ============================================================================

export type ConditionOperator = 'equals' | 'contains' | 'gt' | 'lt' | 'gte' | 'lte' | 'exists' | 'notExists';

export interface ICondition {
  field: string; // 'order.status', 'order.delayDays', 'account.tier', etc.
  operator: ConditionOperator;
  value: unknown;
}

export interface IProactiveTrigger extends Document {
  companyId: string;
  name: string;
  description?: string;
  isActive: boolean;
  priority: number; // lower = higher priority (1-10)
  relevantIntents: string[]; // ['order_status', 'shipping_inquiry']
  condition: ICondition;
  statementTemplate: string; // 'Your order {order_id} is delayed by {days} days.'
  channel: 'voice' | 'both';
  createdAt: Date;
  updatedAt: Date;
}

export interface IProactiveTriggerMethods {
  evaluateCondition(data: Record<string, unknown>): boolean;
  interpolateTemplate(data: Record<string, unknown>): string;
}

export interface ProactiveTriggerModel extends Model<IProactiveTrigger, object, IProactiveTriggerMethods> {
  findActiveByCompanyAndIntent(companyId: string, intent: string): Promise<(IProactiveTrigger & IProactiveTriggerMethods)[]>;
}

// ============================================================================
// SCHEMA
// ============================================================================

const conditionSchema = new Schema<ICondition>(
  {
    field: { type: String, required: true },
    operator: {
      type: String,
      enum: ['equals', 'contains', 'gt', 'lt', 'gte', 'lte', 'exists', 'notExists'],
      required: true,
    },
    value: { type: Schema.Types.Mixed },
  },
  { _id: false }
);

const proactiveTriggerSchema = new Schema<IProactiveTrigger, ProactiveTriggerModel, IProactiveTriggerMethods>(
  {
    companyId: { type: String, required: true, index: true },
    name: { type: String, required: true },
    description: { type: String },
    isActive: { type: Boolean, default: true },
    priority: { type: Number, default: 5, min: 1, max: 10 },
    relevantIntents: [{ type: String }],
    condition: { type: conditionSchema, required: true },
    statementTemplate: { type: String, required: true },
    channel: { type: String, enum: ['voice', 'both'], default: 'voice' },
  },
  {
    timestamps: true,
  }
);

// ============================================================================
// INDEXES
// ============================================================================

proactiveTriggerSchema.index({ companyId: 1, isActive: 1 });
proactiveTriggerSchema.index({ companyId: 1, relevantIntents: 1 });

// ============================================================================
// METHODS
// ============================================================================

/**
 * Evaluate condition against provided data
 */
proactiveTriggerSchema.methods.evaluateCondition = function (
  this: IProactiveTrigger,
  data: Record<string, unknown>
): boolean {
  const { field, operator, value } = this.condition;

  // Get nested field value using dot notation
  const fieldValue = getNestedValue(data, field);

  switch (operator) {
    case 'equals':
      return fieldValue === value;

    case 'contains':
      if (typeof fieldValue === 'string' && typeof value === 'string') {
        return fieldValue.toLowerCase().includes(value.toLowerCase());
      }
      if (Array.isArray(fieldValue)) {
        return fieldValue.includes(value);
      }
      return false;

    case 'gt':
      return typeof fieldValue === 'number' && typeof value === 'number' && fieldValue > value;

    case 'lt':
      return typeof fieldValue === 'number' && typeof value === 'number' && fieldValue < value;

    case 'gte':
      return typeof fieldValue === 'number' && typeof value === 'number' && fieldValue >= value;

    case 'lte':
      return typeof fieldValue === 'number' && typeof value === 'number' && fieldValue <= value;

    case 'exists':
      return fieldValue !== undefined && fieldValue !== null;

    case 'notExists':
      return fieldValue === undefined || fieldValue === null;

    default:
      return false;
  }
};

/**
 * Interpolate template with actual values
 */
proactiveTriggerSchema.methods.interpolateTemplate = function (
  this: IProactiveTrigger,
  data: Record<string, unknown>
): string {
  let result = this.statementTemplate;

  // Find all {variable} patterns and replace with actual values
  const variablePattern = /\{([^}]+)\}/g;
  let match;

  while ((match = variablePattern.exec(this.statementTemplate)) !== null) {
    const variableName = match[1];
    const value = getNestedValue(data, variableName);

    if (value !== undefined && value !== null) {
      result = result.replace(match[0], String(value));
    }
  }

  return result;
};

// ============================================================================
// STATICS
// ============================================================================

/**
 * Find active triggers for a company and intent
 */
proactiveTriggerSchema.statics.findActiveByCompanyAndIntent = async function (
  companyId: string,
  intent: string
): Promise<(IProactiveTrigger & IProactiveTriggerMethods)[]> {
  return this.find({
    companyId,
    isActive: true,
    $or: [
      { relevantIntents: intent },
      { relevantIntents: { $size: 0 } }, // Empty array means all intents
    ],
  }).sort({ priority: 1 }); // Lower priority number = higher priority
};

// ============================================================================
// HELPERS
// ============================================================================

/**
 * Get nested value from object using dot notation
 * e.g., getNestedValue({ order: { status: 'delayed' } }, 'order.status') => 'delayed'
 */
function getNestedValue(obj: Record<string, unknown>, path: string): unknown {
  const keys = path.split('.');
  let current: unknown = obj;

  for (const key of keys) {
    if (current === null || current === undefined) {
      return undefined;
    }
    if (typeof current !== 'object') {
      return undefined;
    }
    current = (current as Record<string, unknown>)[key];
  }

  return current;
}

// ============================================================================
// EXPORT
// ============================================================================

export const ProactiveTrigger = mongoose.model<IProactiveTrigger, ProactiveTriggerModel>(
  'ProactiveTrigger',
  proactiveTriggerSchema
);
