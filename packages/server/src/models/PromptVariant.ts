import mongoose, { Schema, Document, Model } from 'mongoose';
import crypto from 'crypto';

/**
 * Variant configuration with metrics
 */
export interface VariantConfig {
  systemPromptSuffix: string;
  description?: string;
  calls: number;
  resolutionRate: number;
  avgSentiment?: number;
  avgTurns?: number;
}

/**
 * Prompt Variant for A/B Testing
 * Enables testing different system prompt variations
 */
export interface IPromptVariant extends Document {
  companyId: mongoose.Types.ObjectId;
  
  // Test identification
  name: string;
  description: string;
  
  // Variant configurations
  variantA: VariantConfig;
  variantB: VariantConfig;
  
  // Test status
  status: 'draft' | 'running' | 'paused' | 'winner_identified' | 'completed';
  
  // Winner when determined
  winner?: 'A' | 'B';
  winnerDelta?: number; // Percentage improvement
  confidenceLevel?: number; // Statistical confidence (0-100)
  
  // Test duration
  startDate?: Date;
  endDate?: Date;
  
  // Minimum sample size before evaluating
  minSampleSize: number;
  
  // Target metric
  targetMetric: 'resolution_rate' | 'sentiment' | 'turn_count';
  
  // Who created/managed
  createdBy: string;
  activatedBy?: string;
  
  createdAt: Date;
  updatedAt: Date;
}

// Static methods interface
interface IPromptVariantModel extends Model<IPromptVariant> {
  getVariantForCall(companyId: string, callId: string): Promise<{ variant: 'A' | 'B'; suffix: string } | null>;
  recordCallResult(companyId: string, callId: string, resolved: boolean, sentiment?: number, turns?: number): Promise<void>;
}

const variantConfigSchema = new Schema<VariantConfig>(
  {
    systemPromptSuffix: { type: String, required: true },
    description: { type: String },
    calls: { type: Number, default: 0 },
    resolutionRate: { type: Number, default: 0 },
    avgSentiment: { type: Number },
    avgTurns: { type: Number },
  },
  { _id: false }
);

const promptVariantSchema = new Schema<IPromptVariant>(
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
      required: true,
      trim: true,
      maxlength: 1000,
    },
    variantA: {
      type: variantConfigSchema,
      required: true,
    },
    variantB: {
      type: variantConfigSchema,
      required: true,
    },
    status: {
      type: String,
      enum: ['draft', 'running', 'paused', 'winner_identified', 'completed'],
      default: 'draft',
      index: true,
    },
    winner: {
      type: String,
      enum: ['A', 'B'],
    },
    winnerDelta: {
      type: Number,
    },
    confidenceLevel: {
      type: Number,
      min: 0,
      max: 100,
    },
    startDate: {
      type: Date,
    },
    endDate: {
      type: Date,
    },
    minSampleSize: {
      type: Number,
      default: 100,
      min: 10,
    },
    targetMetric: {
      type: String,
      enum: ['resolution_rate', 'sentiment', 'turn_count'],
      default: 'resolution_rate',
    },
    createdBy: {
      type: String,
      required: true,
    },
    activatedBy: {
      type: String,
    },
  },
  {
    timestamps: true,
  }
);

// Compound indexes
promptVariantSchema.index({ companyId: 1, status: 1 });
promptVariantSchema.index({ companyId: 1, createdAt: -1 });
promptVariantSchema.index({ companyId: 1, name: 1 }, { unique: true });

/**
 * Deterministic variant selection based on call ID
 * hash(callId) % 2 === 0 → variant A, else B
 */
promptVariantSchema.statics.getVariantForCall = async function (
  companyId: string,
  callId: string
): Promise<{ variant: 'A' | 'B'; suffix: string; testId: string } | null> {
  const activeTest = await this.findOne({
    companyId,
    status: 'running',
  }).lean();

  if (!activeTest) {
    return null;
  }

  // Deterministic hash-based split
  const hash = crypto.createHash('md5').update(callId).digest('hex');
  const hashNum = parseInt(hash.slice(0, 8), 16);
  const variant: 'A' | 'B' = hashNum % 2 === 0 ? 'A' : 'B';

  const suffix = variant === 'A' 
    ? activeTest.variantA.systemPromptSuffix 
    : activeTest.variantB.systemPromptSuffix;

  return {
    variant,
    suffix,
    testId: activeTest._id.toString(),
  };
};

/**
 * Record call result for A/B test metrics
 */
promptVariantSchema.statics.recordCallResult = async function (
  companyId: string,
  callId: string,
  resolved: boolean,
  sentiment?: number,
  turns?: number
): Promise<void> {
  const activeTest = await this.findOne({
    companyId,
    status: 'running',
  });

  if (!activeTest) {
    return;
  }

  // Determine which variant this call used
  const hash = crypto.createHash('md5').update(callId).digest('hex');
  const hashNum = parseInt(hash.slice(0, 8), 16);
  const variant: 'A' | 'B' = hashNum % 2 === 0 ? 'A' : 'B';

  const variantKey = variant === 'A' ? 'variantA' : 'variantB';
  const currentVariant = activeTest[variantKey];

  // Update metrics with running average
  const newCalls = currentVariant.calls + 1;
  const resolvedCount = Math.round(currentVariant.resolutionRate * currentVariant.calls / 100) + (resolved ? 1 : 0);
  const newResolutionRate = (resolvedCount / newCalls) * 100;

  const updates: Record<string, number> = {
    [`${variantKey}.calls`]: newCalls,
    [`${variantKey}.resolutionRate`]: Math.round(newResolutionRate * 100) / 100,
  };

  // Update sentiment running average if provided
  if (sentiment !== undefined && currentVariant.avgSentiment !== undefined) {
    updates[`${variantKey}.avgSentiment`] = 
      ((currentVariant.avgSentiment * currentVariant.calls) + sentiment) / newCalls;
  } else if (sentiment !== undefined) {
    updates[`${variantKey}.avgSentiment`] = sentiment;
  }

  // Update turns running average if provided
  if (turns !== undefined && currentVariant.avgTurns !== undefined) {
    updates[`${variantKey}.avgTurns`] = 
      ((currentVariant.avgTurns * currentVariant.calls) + turns) / newCalls;
  } else if (turns !== undefined) {
    updates[`${variantKey}.avgTurns`] = turns;
  }

  await this.updateOne(
    { _id: activeTest._id },
    { $set: updates }
  );
};

/**
 * Calculate statistical confidence using simplified z-test
 */
export function calculateConfidence(
  rateA: number,
  callsA: number,
  rateB: number,
  callsB: number
): number {
  if (callsA < 30 || callsB < 30) {
    return 0; // Not enough data
  }

  const pA = rateA / 100;
  const pB = rateB / 100;
  const pooledP = (pA * callsA + pB * callsB) / (callsA + callsB);
  
  const standardError = Math.sqrt(
    pooledP * (1 - pooledP) * (1 / callsA + 1 / callsB)
  );

  if (standardError === 0) {
    return 0;
  }

  const zScore = Math.abs(pA - pB) / standardError;

  // Convert z-score to confidence level (simplified)
  if (zScore >= 2.58) return 99;
  if (zScore >= 1.96) return 95;
  if (zScore >= 1.65) return 90;
  if (zScore >= 1.28) return 80;
  if (zScore >= 0.84) return 60;
  return Math.round(zScore * 30);
}

export const PromptVariant = mongoose.model<IPromptVariant, IPromptVariantModel>(
  'PromptVariant',
  promptVariantSchema
);
