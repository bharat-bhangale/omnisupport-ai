// ============================================================================
// FRAUD INCIDENT MODEL
// ============================================================================

import mongoose, { Schema, Document, Model } from 'mongoose';

// ============================================================================
// TYPES
// ============================================================================

export type RiskLevel = 'low' | 'medium' | 'high' | 'critical';
export type FraudAction = 'blocked' | 'escalated' | 'monitored';

export interface IFraudIncident extends Document {
  companyId: string;
  callId: string;
  callerPhone: string;
  compositeScore: number;
  riskLevel: RiskLevel;
  phoneReputationScore: number;
  velocityFlag: boolean;
  conversationScore: number;
  signals: string[];
  action: FraudAction;
  resolvedBy?: string;
  resolvedAt?: Date;
  notes?: string;
  transcript?: Array<{ role: string; content: string; timestamp: string }>;
  createdAt: Date;
  updatedAt: Date;
}

export interface IWatchlistEntry extends Document {
  companyId: string;
  phone: string;
  reason: string;
  addedBy: string;
  createdAt: Date;
}

// ============================================================================
// FRAUD INCIDENT SCHEMA
// ============================================================================

const fraudIncidentSchema = new Schema<IFraudIncident>(
  {
    companyId: {
      type: String,
      required: true,
      index: true,
    },
    callId: {
      type: String,
      required: true,
      unique: true,
    },
    callerPhone: {
      type: String,
      required: true,
    },
    compositeScore: {
      type: Number,
      required: true,
      min: 0,
      max: 1,
    },
    riskLevel: {
      type: String,
      enum: ['low', 'medium', 'high', 'critical'],
      required: true,
    },
    phoneReputationScore: {
      type: Number,
      default: 0,
      min: 0,
      max: 1,
    },
    velocityFlag: {
      type: Boolean,
      default: false,
    },
    conversationScore: {
      type: Number,
      default: 0,
      min: 0,
      max: 1,
    },
    signals: {
      type: [String],
      default: [],
    },
    action: {
      type: String,
      enum: ['blocked', 'escalated', 'monitored'],
      required: true,
    },
    resolvedBy: {
      type: String,
    },
    resolvedAt: {
      type: Date,
    },
    notes: {
      type: String,
    },
    transcript: [
      {
        role: String,
        content: String,
        timestamp: String,
      },
    ],
  },
  {
    timestamps: true,
  }
);

// Compound index for efficient querying
fraudIncidentSchema.index({ companyId: 1, createdAt: -1 });
fraudIncidentSchema.index({ companyId: 1, riskLevel: 1 });
fraudIncidentSchema.index({ companyId: 1, action: 1 });

// ============================================================================
// WATCHLIST SCHEMA
// ============================================================================

const watchlistSchema = new Schema<IWatchlistEntry>(
  {
    companyId: {
      type: String,
      required: true,
    },
    phone: {
      type: String,
      required: true,
    },
    reason: {
      type: String,
      required: true,
    },
    addedBy: {
      type: String,
      required: true,
    },
  },
  {
    timestamps: true,
  }
);

// Compound unique index
watchlistSchema.index({ companyId: 1, phone: 1 }, { unique: true });

// ============================================================================
// STATIC METHODS
// ============================================================================

interface FraudIncidentModel extends Model<IFraudIncident> {
  getSummary(
    companyId: string,
    days: number
  ): Promise<{
    total: number;
    byRiskLevel: Record<RiskLevel, number>;
    blockedCount: number;
    escalatedCount: number;
    costSaved: number;
  }>;
}

fraudIncidentSchema.statics.getSummary = async function (
  companyId: string,
  days: number
) {
  const since = new Date();
  since.setDate(since.getDate() - days);

  const [summary] = await this.aggregate([
    {
      $match: {
        companyId,
        createdAt: { $gte: since },
      },
    },
    {
      $group: {
        _id: null,
        total: { $sum: 1 },
        blockedCount: {
          $sum: { $cond: [{ $eq: ['$action', 'blocked'] }, 1, 0] },
        },
        escalatedCount: {
          $sum: { $cond: [{ $eq: ['$action', 'escalated'] }, 1, 0] },
        },
        lowCount: {
          $sum: { $cond: [{ $eq: ['$riskLevel', 'low'] }, 1, 0] },
        },
        mediumCount: {
          $sum: { $cond: [{ $eq: ['$riskLevel', 'medium'] }, 1, 0] },
        },
        highCount: {
          $sum: { $cond: [{ $eq: ['$riskLevel', 'high'] }, 1, 0] },
        },
        criticalCount: {
          $sum: { $cond: [{ $eq: ['$riskLevel', 'critical'] }, 1, 0] },
        },
        // Estimate $50 saved per blocked fraud call, $25 per escalated
        costSaved: {
          $sum: {
            $switch: {
              branches: [
                { case: { $eq: ['$action', 'blocked'] }, then: 50 },
                { case: { $eq: ['$action', 'escalated'] }, then: 25 },
              ],
              default: 0,
            },
          },
        },
      },
    },
  ]);

  return {
    total: summary?.total || 0,
    byRiskLevel: {
      low: summary?.lowCount || 0,
      medium: summary?.mediumCount || 0,
      high: summary?.highCount || 0,
      critical: summary?.criticalCount || 0,
    },
    blockedCount: summary?.blockedCount || 0,
    escalatedCount: summary?.escalatedCount || 0,
    costSaved: summary?.costSaved || 0,
  };
};

// ============================================================================
// EXPORTS
// ============================================================================

export const FraudIncident = mongoose.model<IFraudIncident, FraudIncidentModel>(
  'FraudIncident',
  fraudIncidentSchema
);

export const Watchlist = mongoose.model<IWatchlistEntry>(
  'Watchlist',
  watchlistSchema
);
