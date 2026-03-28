import mongoose, { Schema, Document, Model } from 'mongoose';
import type { SupportedLanguage, SentimentLabel } from '../config/constants.js';
import type { Turn, ConversationSlots } from '../types/session.js';

export interface ICallSession extends Document {
  companyId: mongoose.Types.ObjectId;
  customerId?: mongoose.Types.ObjectId;
  callId: string;
  vapiCallId?: string;
  callerPhone: string;
  language: SupportedLanguage;
  status: 'active' | 'completed' | 'escalated' | 'failed';
  turns: Turn[];
  slots: ConversationSlots;
  summary?: string;
  intent?: string;
  subIntent?: string;
  sentiment: {
    overall: SentimentLabel;
    scores: {
      positive: number;
      neutral: number;
      negative: number;
    };
    trend: 'improving' | 'stable' | 'declining';
  };
  escalation?: {
    escalatedAt: Date;
    reason: string;
    agentId?: string;
    notes?: string;
  };
  recording?: {
    url: string;
    durationSeconds: number;
    transcriptUrl?: string;
  };
  cost?: {
    stt: number;
    llm: number;
    tts: number;
    total: number;
  };
  qaScore?: number;
  metadata: Record<string, unknown>;
  startedAt: Date;
  endedAt?: Date;
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

const callSessionSchema = new Schema<ICallSession>(
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
    callId: {
      type: String,
      required: true,
      unique: true,
    },
    vapiCallId: String,
    callerPhone: {
      type: String,
      required: true,
    },
    language: {
      type: String,
      required: true,
      default: 'en',
    },
    status: {
      type: String,
      enum: ['active', 'completed', 'escalated', 'failed'],
      default: 'active',
    },
    turns: {
      type: [turnSchema],
      default: [],
    },
    slots: {
      type: Schema.Types.Mixed,
      default: {},
    },
    summary: String,
    intent: String,
    subIntent: String,
    sentiment: {
      overall: {
        type: String,
        enum: ['positive', 'neutral', 'negative'],
        default: 'neutral',
      },
      scores: {
        positive: { type: Number, default: 0 },
        neutral: { type: Number, default: 1 },
        negative: { type: Number, default: 0 },
      },
      trend: {
        type: String,
        enum: ['improving', 'stable', 'declining'],
        default: 'stable',
      },
    },
    escalation: {
      escalatedAt: Date,
      reason: String,
      agentId: String,
      notes: String,
    },
    recording: {
      url: String,
      durationSeconds: Number,
      transcriptUrl: String,
    },
    cost: {
      stt: Number,
      llm: Number,
      tts: Number,
      total: Number,
    },
    qaScore: {
      type: Number,
      min: 0,
      max: 100,
    },
    metadata: {
      type: Schema.Types.Mixed,
      default: {},
    },
    startedAt: {
      type: Date,
      required: true,
    },
    endedAt: Date,
  },
  {
    timestamps: true,
  }
);

// Indexes for common queries
callSessionSchema.index({ companyId: 1, callId: 1 });
callSessionSchema.index({ companyId: 1, status: 1 });
callSessionSchema.index({ companyId: 1, startedAt: -1 });
callSessionSchema.index({ companyId: 1, customerId: 1, startedAt: -1 });
callSessionSchema.index({ companyId: 1, callerPhone: 1, startedAt: -1 });
callSessionSchema.index({ companyId: 1, 'sentiment.overall': 1 });

export const CallSession: Model<ICallSession> = mongoose.model<ICallSession>('CallSession', callSessionSchema);
