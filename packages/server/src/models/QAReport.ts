import mongoose, { Schema, Document, Model } from 'mongoose';

export interface QADimensionScore {
  score: number; // 0-10
  reasoning: string;
  weight: number;
}

export interface IQAReport extends Document {
  companyId: mongoose.Types.ObjectId;
  interactionId: string; // callId or ticketId
  channel: 'voice' | 'text';
  overallScore: number; // 0-100 weighted average
  dimensions: {
    intentUnderstanding: QADimensionScore;
    responseAccuracy: QADimensionScore;
    resolutionSuccess: QADimensionScore;
    escalationCorrectness: QADimensionScore;
    customerExperience: QADimensionScore;
  };
  flaggedForReview: boolean;
  flaggedDimensions: string[]; // which dimensions scored below threshold
  reviewedBy?: mongoose.Types.ObjectId; // agentId if human reviewed
  reviewNote?: string;
  createdAt: Date;
  updatedAt: Date;
}

const dimensionScoreSchema = new Schema<QADimensionScore>(
  {
    score: {
      type: Number,
      required: true,
      min: 0,
      max: 10,
    },
    reasoning: {
      type: String,
      required: true,
    },
    weight: {
      type: Number,
      required: true,
      min: 0,
      max: 1,
    },
  },
  { _id: false }
);

const qaReportSchema = new Schema<IQAReport>(
  {
    companyId: {
      type: Schema.Types.ObjectId,
      ref: 'Company',
      required: true,
      index: true,
    },
    interactionId: {
      type: String,
      required: true,
    },
    channel: {
      type: String,
      enum: ['voice', 'text'],
      required: true,
    },
    overallScore: {
      type: Number,
      required: true,
      min: 0,
      max: 100,
    },
    dimensions: {
      intentUnderstanding: {
        type: dimensionScoreSchema,
        required: true,
      },
      responseAccuracy: {
        type: dimensionScoreSchema,
        required: true,
      },
      resolutionSuccess: {
        type: dimensionScoreSchema,
        required: true,
      },
      escalationCorrectness: {
        type: dimensionScoreSchema,
        required: true,
      },
      customerExperience: {
        type: dimensionScoreSchema,
        required: true,
      },
    },
    flaggedForReview: {
      type: Boolean,
      default: false,
    },
    flaggedDimensions: {
      type: [String],
      default: [],
    },
    reviewedBy: {
      type: Schema.Types.ObjectId,
      ref: 'User',
    },
    reviewNote: {
      type: String,
    },
  },
  {
    timestamps: true,
  }
);

// Indexes for efficient queries
qaReportSchema.index({ companyId: 1, createdAt: -1 });
qaReportSchema.index({ companyId: 1, flaggedForReview: 1 });
qaReportSchema.index({ companyId: 1, interactionId: 1 }, { unique: true });
qaReportSchema.index({ companyId: 1, channel: 1, createdAt: -1 });
qaReportSchema.index({ companyId: 1, overallScore: 1 });

export const QAReport: Model<IQAReport> = mongoose.model<IQAReport>('QAReport', qaReportSchema);
