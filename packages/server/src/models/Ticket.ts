import mongoose, { Schema, Document, Model } from 'mongoose';
import type { SupportedLanguage, SentimentLabel } from '../config/constants.js';

export interface ITicket extends Document {
  companyId: mongoose.Types.ObjectId;
  customerId?: mongoose.Types.ObjectId;
  externalId: string;
  source: 'zendesk' | 'freshdesk' | 'email' | 'api' | 'manual';
  subject: string;
  description: string;
  status: 'new' | 'open' | 'pending' | 'on-hold' | 'solved' | 'closed';
  priority: 'low' | 'normal' | 'high' | 'urgent';
  language: SupportedLanguage;
  classification?: {
    intent: string;
    subIntent?: string;
    confidence: number;
    categories: string[];
  };
  sentiment: SentimentLabel;
  assignedTo?: string;
  aiDraft?: {
    content: string;
    generatedAt: Date;
    approved: boolean;
    approvedBy?: string;
    approvedAt?: Date;
    edits?: string;
    tone?: 'professional' | 'empathetic' | 'technical';
    needsReview?: boolean;
    reviewReason?: string;
  };
  ragContext?: {
    documentIds: string[];
    chunks: string[];
    relevanceScores: number[];
  };
  escalation?: {
    escalatedAt: Date;
    reason: string;
    agentId?: string;
    notes?: string;
  };
  resolution?: {
    resolvedAt: Date;
    resolvedBy: string;
    resolutionType: 'ai_resolved' | 'human_resolved' | 'auto_closed';
    satisfaction?: number;
  };
  sla?: {
    responseDeadline: Date;
    resolutionDeadline: Date;
    firstResponseAt?: Date;
    isBreached: boolean;
  };
  responseHistory?: Array<{
    sentAt: Date;
    agentId: string;
    agentName?: string;
    responseText: string;
    agentEdited: boolean;
    toneApplied?: string;
  }>;
  tags: string[];
  metadata: Record<string, unknown>;
  externalUrl?: string;
  flaggedForReview?: boolean;
  createdAt: Date;
  updatedAt: Date;
}

const ticketSchema = new Schema<ITicket>(
  {
    companyId: {
      type: Schema.Types.ObjectId,
      ref: 'Company',
      required: true,
      index: true,
    },
    customerId: {
      type: Schema.Types.ObjectId,
      ref: 'Customer',
      index: true,
    },
    externalId: {
      type: String,
      required: true,
    },
    source: {
      type: String,
      enum: ['zendesk', 'freshdesk', 'email', 'api', 'manual'],
      required: true,
    },
    subject: {
      type: String,
      required: true,
      trim: true,
    },
    description: {
      type: String,
      required: true,
    },
    status: {
      type: String,
      enum: ['new', 'open', 'pending', 'on-hold', 'solved', 'closed'],
      default: 'new',
    },
    priority: {
      type: String,
      enum: ['low', 'normal', 'high', 'urgent'],
      default: 'normal',
    },
    language: {
      type: String,
      default: 'en',
    },
    classification: {
      intent: String,
      subIntent: String,
      confidence: Number,
      categories: [String],
    },
    sentiment: {
      type: String,
      enum: ['positive', 'neutral', 'negative'],
      default: 'neutral',
    },
    assignedTo: String,
    aiDraft: {
      content: String,
      generatedAt: Date,
      approved: { type: Boolean, default: false },
      approvedBy: String,
      approvedAt: Date,
      edits: String,
      tone: {
        type: String,
        enum: ['professional', 'empathetic', 'technical'],
      },
      needsReview: { type: Boolean, default: false },
      reviewReason: String,
    },
    ragContext: {
      documentIds: [String],
      chunks: [String],
      relevanceScores: [Number],
    },
    escalation: {
      escalatedAt: Date,
      reason: String,
      agentId: String,
      notes: String,
    },
    resolution: {
      resolvedAt: Date,
      resolvedBy: String,
      resolutionType: {
        type: String,
        enum: ['ai_resolved', 'human_resolved', 'auto_closed'],
      },
      satisfaction: { type: Number, min: 1, max: 5 },
    },
    sla: {
      responseDeadline: Date,
      resolutionDeadline: Date,
      firstResponseAt: Date,
      isBreached: { type: Boolean, default: false },
    },
    tags: {
      type: [String],
      default: [],
    },
    metadata: {
      type: Schema.Types.Mixed,
      default: {},
    },
    externalUrl: String,
    flaggedForReview: {
      type: Boolean,
      default: false,
    },
    responseHistory: [
      {
        sentAt: { type: Date, required: true },
        agentId: { type: String, required: true },
        agentName: String,
        responseText: { type: String, required: true },
        agentEdited: { type: Boolean, default: false },
        toneApplied: {
          type: String,
          enum: ['professional', 'empathetic', 'technical'],
        },
      },
    ],
  },
  {
    timestamps: true,
  }
);

// Compound indexes
ticketSchema.index({ companyId: 1, externalId: 1 }, { unique: true });
ticketSchema.index({ companyId: 1, status: 1 });
ticketSchema.index({ companyId: 1, priority: 1, status: 1 });
ticketSchema.index({ companyId: 1, createdAt: -1 });
ticketSchema.index({ companyId: 1, customerId: 1, createdAt: -1 });
ticketSchema.index({ companyId: 1, 'sla.isBreached': 1, 'sla.responseDeadline': 1 });

export const Ticket: Model<ITicket> = mongoose.model<ITicket>('Ticket', ticketSchema);
