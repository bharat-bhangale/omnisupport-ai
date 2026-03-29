import mongoose, { Schema, Document, Model } from 'mongoose';

/**
 * Gap cluster interface for grouping similar queries
 */
export interface GapCluster {
  query: string;
  frequency: number;
  cluster: string;
  gapIds: mongoose.Types.ObjectId[];
}

/**
 * Feedback summary by type
 */
export interface FeedbackSummaryByType {
  issueType: string;
  channel: 'voice' | 'text';
  count: number;
  avgRating: number;
}

/**
 * A/B test results snapshot
 */
export interface ABResultSnapshot {
  testId: mongoose.Types.ObjectId;
  testName: string;
  variantA: {
    calls: number;
    resolutionRate: number;
  };
  variantB: {
    calls: number;
    resolutionRate: number;
  };
  winner?: 'A' | 'B';
  confidenceLevel?: number;
}

/**
 * Weekly Gap Report Interface
 * Generated every Monday with analysis of the past week
 */
export interface IGapReport extends Document {
  companyId: mongoose.Types.ObjectId;
  
  // Week identifier (Monday date)
  week: Date;
  weekLabel: string; // e.g., "2024-W12"
  
  // Top unanswered queries with clustering
  topGaps: GapCluster[];
  
  // Gap statistics
  gapStats: {
    totalGaps: number;
    newGaps: number;
    resolvedGaps: number;
    topChannel: 'voice' | 'text';
  };
  
  // Feedback summary grouped by type and channel
  feedbackSummary: {
    byType: FeedbackSummaryByType[];
    totalEvents: number;
    avgRating: number;
    flaggedTypes: string[]; // Types with >5 occurrences
  };
  
  // A/B test results if any tests are running
  abResults?: ABResultSnapshot[];
  
  // Problematic interactions
  problemPatterns: {
    escalatedCallsWithManyTurns: number; // >4 turns before escalation
    lowConfidenceTickets: number; // confidence <0.60
    regeneratedResponses: number; // Agent triggered regenerate
  };
  
  // Generated insights from GPT
  insights?: string;
  
  // Processing status
  status: 'processing' | 'completed' | 'failed';
  processedAt?: Date;
  errorMessage?: string;
  
  createdAt: Date;
  updatedAt: Date;
}

const gapClusterSchema = new Schema<GapCluster>(
  {
    query: { type: String, required: true },
    frequency: { type: Number, required: true },
    cluster: { type: String, required: true },
    gapIds: [{ type: Schema.Types.ObjectId, ref: 'KBGap' }],
  },
  { _id: false }
);

const feedbackSummaryByTypeSchema = new Schema<FeedbackSummaryByType>(
  {
    issueType: { type: String, required: true },
    channel: { type: String, enum: ['voice', 'text'], required: true },
    count: { type: Number, required: true },
    avgRating: { type: Number, required: true },
  },
  { _id: false }
);

const abResultSnapshotSchema = new Schema<ABResultSnapshot>(
  {
    testId: { type: Schema.Types.ObjectId, ref: 'PromptVariant', required: true },
    testName: { type: String, required: true },
    variantA: {
      calls: { type: Number, required: true },
      resolutionRate: { type: Number, required: true },
    },
    variantB: {
      calls: { type: Number, required: true },
      resolutionRate: { type: Number, required: true },
    },
    winner: { type: String, enum: ['A', 'B'] },
    confidenceLevel: { type: Number },
  },
  { _id: false }
);

const gapReportSchema = new Schema<IGapReport>(
  {
    companyId: {
      type: Schema.Types.ObjectId,
      ref: 'Company',
      required: true,
      index: true,
    },
    week: {
      type: Date,
      required: true,
    },
    weekLabel: {
      type: String,
      required: true,
    },
    topGaps: [gapClusterSchema],
    gapStats: {
      totalGaps: { type: Number, default: 0 },
      newGaps: { type: Number, default: 0 },
      resolvedGaps: { type: Number, default: 0 },
      topChannel: { type: String, enum: ['voice', 'text'] },
    },
    feedbackSummary: {
      byType: [feedbackSummaryByTypeSchema],
      totalEvents: { type: Number, default: 0 },
      avgRating: { type: Number, default: 0 },
      flaggedTypes: [{ type: String }],
    },
    abResults: [abResultSnapshotSchema],
    problemPatterns: {
      escalatedCallsWithManyTurns: { type: Number, default: 0 },
      lowConfidenceTickets: { type: Number, default: 0 },
      regeneratedResponses: { type: Number, default: 0 },
    },
    insights: {
      type: String,
    },
    status: {
      type: String,
      enum: ['processing', 'completed', 'failed'],
      default: 'processing',
      index: true,
    },
    processedAt: {
      type: Date,
    },
    errorMessage: {
      type: String,
    },
  },
  {
    timestamps: true,
  }
);

// Compound indexes
gapReportSchema.index({ companyId: 1, week: -1 }, { unique: true });
gapReportSchema.index({ companyId: 1, status: 1 });
gapReportSchema.index({ companyId: 1, createdAt: -1 });

export const GapReport: Model<IGapReport> = mongoose.model<IGapReport>('GapReport', gapReportSchema);
