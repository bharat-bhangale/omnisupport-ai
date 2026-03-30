import mongoose, { Schema, Document, Model } from 'mongoose';

// Dimension key literals
export type QADimensionKey =
  | 'intentUnderstanding'
  | 'responseAccuracy'
  | 'resolutionSuccess'
  | 'escalationCorrectness'
  | 'customerExperience';

export interface IQARubricDimension {
  name: string;
  key: QADimensionKey;
  weight: number; // 0-1, all weights must sum to 1.0
  minPassScore: number; // 0-10 threshold below which interaction is flagged
  scoringGuide: string; // instructions for GPT-4o on how to score this dimension
}

export interface IQARubric extends Document {
  companyId: mongoose.Types.ObjectId;
  dimensions: IQARubricDimension[];
  version: number;
  createdAt: Date;
  updatedAt: Date;
}

const qaRubricDimensionSchema = new Schema<IQARubricDimension>(
  {
    name: {
      type: String,
      required: true,
      trim: true,
    },
    key: {
      type: String,
      required: true,
      enum: [
        'intentUnderstanding',
        'responseAccuracy',
        'resolutionSuccess',
        'escalationCorrectness',
        'customerExperience',
      ],
    },
    weight: {
      type: Number,
      required: true,
      min: 0,
      max: 1,
    },
    minPassScore: {
      type: Number,
      required: true,
      min: 0,
      max: 10,
    },
    scoringGuide: {
      type: String,
      required: true,
    },
  },
  { _id: false }
);

const qaRubricSchema = new Schema<IQARubric>(
  {
    companyId: {
      type: Schema.Types.ObjectId,
      ref: 'Company',
      required: true,
      unique: true,
      index: true,
    },
    dimensions: {
      type: [qaRubricDimensionSchema],
      required: true,
      validate: {
        validator: function (dims: IQARubricDimension[]): boolean {
          if (dims.length === 0) return false;
          const totalWeight = dims.reduce((sum, d) => sum + d.weight, 0);
          // Allow small floating-point tolerance
          return Math.abs(totalWeight - 1.0) < 0.01;
        },
        message: 'Dimension weights must sum to 1.0',
      },
    },
    version: {
      type: Number,
      required: true,
      default: 1,
    },
  },
  {
    timestamps: true,
  }
);

// Indexes
qaRubricSchema.index({ companyId: 1 }, { unique: true });

// Pre-save: auto-increment version on updates
qaRubricSchema.pre('findOneAndUpdate', function (this: mongoose.Query<unknown, IQARubric>) {
  this.set({ $inc: { version: 1 } });
});

/**
 * Default QA rubric used when a company has no custom rubric configured
 */
export const DEFAULT_QA_RUBRIC: IQARubricDimension[] = [
  {
    name: 'Intent Understanding',
    key: 'intentUnderstanding',
    weight: 0.20,
    minPassScore: 6,
    scoringGuide:
      'Did the AI correctly understand what the customer wanted? Score 10=perfect intent identification, 1=completely wrong intent.',
  },
  {
    name: 'Response Accuracy',
    key: 'responseAccuracy',
    weight: 0.25,
    minPassScore: 7,
    scoringGuide:
      'Was the information provided accurate and from the KB? Score 10=all facts correct and cited, 1=multiple factual errors.',
  },
  {
    name: 'Resolution Success',
    key: 'resolutionSuccess',
    weight: 0.25,
    minPassScore: 6,
    scoringGuide:
      'Was the customer\'s issue actually resolved? Score 10=fully resolved, 5=partially resolved, 1=not resolved.',
  },
  {
    name: 'Escalation Correctness',
    key: 'escalationCorrectness',
    weight: 0.15,
    minPassScore: 7,
    scoringGuide:
      'Was the escalation decision appropriate? Score 10=correct escalation choice, 1=should have escalated but didn\'t or vice versa.',
  },
  {
    name: 'Customer Experience',
    key: 'customerExperience',
    weight: 0.15,
    minPassScore: 6,
    scoringGuide:
      'How was the overall customer experience? Score 10=excellent, empathetic, efficient; 1=frustrating, slow, unhelpful.',
  },
];

export const QARubric: Model<IQARubric> = mongoose.model<IQARubric>('QARubric', qaRubricSchema);
