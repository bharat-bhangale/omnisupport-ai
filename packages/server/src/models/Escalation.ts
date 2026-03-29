import mongoose, { Schema, Document, Model } from 'mongoose';
import type { SentimentLabel } from '../config/constants.js';
import type { Turn, ConversationSlots } from '../types/session.js';

export type EscalationStatus = 'waiting' | 'accepted' | 'resolved' | 'abandoned';
export type EscalationPriority = 'low' | 'medium' | 'high' | 'urgent';

export interface IEscalation extends Document {
  callId: string;
  companyId: mongoose.Types.ObjectId;
  callerPhone: string;
  twilioCallSid?: string;
  reason: string;
  priority: EscalationPriority;
  brief: string;
  lastFiveTurns: Turn[];
  entities: ConversationSlots;
  sentiment: SentimentLabel;
  status: EscalationStatus;
  holdStarted: Date;
  acceptedAt?: Date;
  acceptedBy?: string;
  agentPhone?: string;
  resolvedAt?: Date;
  disposition?: string;
  note?: string;
  customerId?: mongoose.Types.ObjectId;
  customerName?: string;
  customerTier?: 'standard' | 'premium' | 'vip' | 'enterprise';
  customerKnownIssues?: string[];
  createdAt: Date;
  updatedAt: Date;
}

const turnSchema = new Schema<Turn>(
  {
    role: {
      type: String,
      enum: ['user', 'assistant', 'system', 'tool'],
      required: true,
    },
    content: {
      type: String,
      required: true,
    },
    toolName: String,
    toolCallId: String,
    sentiment: {
      type: String,
      enum: ['positive', 'neutral', 'negative'],
    },
    confidence: Number,
    timestamp: {
      type: Date,
      required: true,
    },
  },
  { _id: false }
);

const escalationSchema = new Schema<IEscalation>(
  {
    callId: {
      type: String,
      required: true,
      index: true,
    },
    companyId: {
      type: Schema.Types.ObjectId,
      ref: 'Company',
      required: true,
      index: true,
    },
    callerPhone: {
      type: String,
      required: true,
    },
    twilioCallSid: String,
    reason: {
      type: String,
      required: true,
    },
    priority: {
      type: String,
      enum: ['low', 'medium', 'high', 'urgent'],
      default: 'medium',
    },
    brief: {
      type: String,
      required: true,
    },
    lastFiveTurns: {
      type: [turnSchema],
      default: [],
    },
    entities: {
      type: Schema.Types.Mixed,
      default: {},
    },
    sentiment: {
      type: String,
      enum: ['positive', 'neutral', 'negative'],
      default: 'neutral',
    },
    status: {
      type: String,
      enum: ['waiting', 'accepted', 'resolved', 'abandoned'],
      default: 'waiting',
    },
    holdStarted: {
      type: Date,
      required: true,
    },
    acceptedAt: Date,
    acceptedBy: String,
    agentPhone: String,
    resolvedAt: Date,
    disposition: String,
    note: String,
    customerId: {
      type: Schema.Types.ObjectId,
      ref: 'Customer',
    },
    customerName: String,
    customerTier: {
      type: String,
      enum: ['standard', 'premium', 'vip', 'enterprise'],
    },
    customerKnownIssues: {
      type: [String],
      default: [],
    },
  },
  {
    timestamps: true,
  }
);

// Compound indexes for common queries
escalationSchema.index({ companyId: 1, status: 1, holdStarted: 1 });
escalationSchema.index({ companyId: 1, status: 1, priority: -1, holdStarted: 1 });
escalationSchema.index({ companyId: 1, callId: 1 }, { unique: true });

export const Escalation: Model<IEscalation> = mongoose.model<IEscalation>('Escalation', escalationSchema);
