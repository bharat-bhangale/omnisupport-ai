import mongoose, { Schema, Document, Model } from 'mongoose';
import type { Channel } from '../config/constants.js';

/**
 * FeedbackEvent tracks agent feedback on AI-generated content
 * Used for continuous learning and quality improvement
 */
export interface IFeedbackEvent extends Document {
  companyId: mongoose.Types.ObjectId;
  ticketId?: mongoose.Types.ObjectId;
  callId?: mongoose.Types.ObjectId;
  agentId: string;
  
  // Rating (1-5 stars or thumbs up/down)
  rating: number;
  
  // What was the issue with the AI output
  issue?: string;
  
  // Did the agent edit the AI draft before sending?
  agentEdited: boolean;
  
  // Channel where feedback originated
  channel: Channel;
  
  // Type of issue identified
  issueType?: 
    | 'wrong_tone'
    | 'inaccurate_info'
    | 'incomplete_response'
    | 'irrelevant_kb'
    | 'wrong_category'
    | 'wrong_priority'
    | 'too_long'
    | 'too_short'
    | 'grammar_errors'
    | 'policy_violation'
    | 'other';
  
  // For conversation feedback: which turn had the issue
  specificTurn?: number;
  
  // What should the correct value have been
  correctedValue?: string;
  
  // Additional context from the agent
  notes?: string;
  
  // Metadata for analytics
  metadata?: {
    originalConfidence?: number;
    kbSourceCount?: number;
    responseLength?: number;
    toneUsed?: string;
    categoryClassified?: string;
    priorityClassified?: string;
  };
  
  createdAt: Date;
  updatedAt: Date;
}

const feedbackEventSchema = new Schema<IFeedbackEvent>(
  {
    companyId: {
      type: Schema.Types.ObjectId,
      ref: 'Company',
      required: true,
      index: true,
    },
    ticketId: {
      type: Schema.Types.ObjectId,
      ref: 'Ticket',
      sparse: true,
      index: true,
    },
    callId: {
      type: Schema.Types.ObjectId,
      ref: 'CallSession',
      sparse: true,
      index: true,
    },
    agentId: {
      type: String,
      required: true,
      index: true,
    },
    rating: {
      type: Number,
      required: true,
      min: 0,
      max: 5,
    },
    issue: {
      type: String,
      trim: true,
    },
    agentEdited: {
      type: Boolean,
      required: true,
      default: false,
    },
    channel: {
      type: String,
      enum: ['voice', 'text'],
      required: true,
    },
    issueType: {
      type: String,
      enum: [
        'wrong_tone',
        'inaccurate_info',
        'incomplete_response',
        'irrelevant_kb',
        'wrong_category',
        'wrong_priority',
        'too_long',
        'too_short',
        'grammar_errors',
        'policy_violation',
        'other',
      ],
    },
    specificTurn: {
      type: Number,
      min: 0,
    },
    correctedValue: {
      type: String,
    },
    notes: {
      type: String,
      trim: true,
    },
    metadata: {
      originalConfidence: Number,
      kbSourceCount: Number,
      responseLength: Number,
      toneUsed: String,
      categoryClassified: String,
      priorityClassified: String,
    },
  },
  {
    timestamps: true,
  }
);

// Compound indexes for analytics queries
feedbackEventSchema.index({ companyId: 1, createdAt: -1 });
feedbackEventSchema.index({ companyId: 1, channel: 1, createdAt: -1 });
feedbackEventSchema.index({ companyId: 1, issueType: 1, createdAt: -1 });
feedbackEventSchema.index({ companyId: 1, agentId: 1, createdAt: -1 });
feedbackEventSchema.index({ companyId: 1, rating: 1 });

// Index for finding feedback per ticket/call
feedbackEventSchema.index({ ticketId: 1, createdAt: -1 });
feedbackEventSchema.index({ callId: 1, createdAt: -1 });

export const FeedbackEvent: Model<IFeedbackEvent> = mongoose.model<IFeedbackEvent>(
  'FeedbackEvent',
  feedbackEventSchema
);
