import mongoose, { Schema, Document, Model } from 'mongoose';
import type { SupportedLanguage, SentimentLabel } from '../config/constants.js';

export interface ICustomer extends Document {
  companyId: mongoose.Types.ObjectId;
  externalId?: string;
  phone?: string;
  email?: string;
  name?: string;
  tier: 'standard' | 'premium' | 'vip' | 'enterprise';
  lifetimeValue: number;
  preferredLanguage?: SupportedLanguage;
  preferredChannel?: 'voice' | 'email' | 'chat';
  preferredStyle?: 'formal' | 'casual' | 'technical';
  verbosity?: 'concise' | 'detailed';
  tags: string[];
  notes?: string;
  knownIssues: string[];
  metadata: Record<string, unknown>;
  integrations: {
    zendesk?: { id: string; url: string };
    freshdesk?: { id: string; url: string };
    salesforce?: { id: string; url: string };
    hubspot?: { id: string; url: string };
  };
  avgSentiment?: SentimentLabel;
  sentimentTrend?: 'improving' | 'stable' | 'worsening';
  churnRiskScore: number;
  openTickets: number;
  totalInteractions: number;
  lastContactAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}

const customerSchema = new Schema<ICustomer>(
  {
    companyId: {
      type: Schema.Types.ObjectId,
      ref: 'Company',
      required: true,
      index: true,
    },
    externalId: {
      type: String,
      sparse: true,
    },
    phone: {
      type: String,
      sparse: true,
    },
    email: {
      type: String,
      lowercase: true,
      sparse: true,
    },
    name: {
      type: String,
      trim: true,
    },
    tier: {
      type: String,
      enum: ['standard', 'premium', 'vip', 'enterprise'],
      default: 'standard',
    },
    lifetimeValue: {
      type: Number,
      default: 0,
      min: 0,
    },
    preferredLanguage: {
      type: String,
    },
    preferredChannel: {
      type: String,
      enum: ['voice', 'email', 'chat'],
      default: 'voice',
    },
    preferredStyle: {
      type: String,
      enum: ['formal', 'casual', 'technical'],
      default: 'casual',
    },
    verbosity: {
      type: String,
      enum: ['concise', 'detailed'],
      default: 'concise',
    },
    tags: {
      type: [String],
      default: [],
    },
    notes: {
      type: String,
    },
    knownIssues: {
      type: [String],
      default: [],
    },
    metadata: {
      type: Schema.Types.Mixed,
      default: {},
    },
    integrations: {
      zendesk: {
        id: String,
        url: String,
      },
      freshdesk: {
        id: String,
        url: String,
      },
      salesforce: {
        id: String,
        url: String,
      },
      hubspot: {
        id: String,
        url: String,
      },
    },
    avgSentiment: {
      type: String,
      enum: ['positive', 'neutral', 'negative'],
    },
    sentimentTrend: {
      type: String,
      enum: ['improving', 'stable', 'worsening'],
      default: 'stable',
    },
    churnRiskScore: {
      type: Number,
      default: 0,
      min: 0,
      max: 1,
    },
    openTickets: {
      type: Number,
      default: 0,
      min: 0,
    },
    totalInteractions: {
      type: Number,
      default: 0,
      min: 0,
    },
    lastContactAt: {
      type: Date,
    },
  },
  {
    timestamps: true,
  }
);

// Compound indexes for efficient lookups
customerSchema.index({ companyId: 1, phone: 1 });
customerSchema.index({ companyId: 1, email: 1 });
customerSchema.index({ companyId: 1, externalId: 1 });
customerSchema.index({ companyId: 1, tier: 1 });
customerSchema.index({ companyId: 1, lastContactAt: -1 });
customerSchema.index({ companyId: 1, churnRiskScore: -1 });
customerSchema.index({ companyId: 1, lifetimeValue: -1 });
// Text index for search
customerSchema.index({ name: 'text', email: 'text' });

export const Customer: Model<ICustomer> = mongoose.model<ICustomer>('Customer', customerSchema);
