import mongoose, { Schema, Document, Model } from 'mongoose';
import type { SupportedLanguage } from '../config/constants.js';

/**
 * Knowledge Base Document Interface
 */
export interface IKBDocument extends Document {
  companyId: mongoose.Types.ObjectId;
  title: string;
  category: string;
  language: SupportedLanguage;
  sourceType: 'pdf' | 'url' | 'text' | 'manual';
  sourceUrl?: string;
  s3Key?: string;
  rawText?: string;
  status: 'pending' | 'processing' | 'indexed' | 'failed';
  errorMessage?: string;
  chunkCount: number;
  metadata: Record<string, unknown>;
  lastIndexedAt?: Date;
  createdBy: string;
  createdAt: Date;
  updatedAt: Date;
}

const kbDocumentSchema = new Schema<IKBDocument>(
  {
    companyId: {
      type: Schema.Types.ObjectId,
      ref: 'Company',
      required: true,
      index: true,
    },
    title: {
      type: String,
      required: true,
      trim: true,
      maxlength: 500,
    },
    category: {
      type: String,
      required: true,
      trim: true,
      index: true,
    },
    language: {
      type: String,
      default: 'en',
      index: true,
    },
    sourceType: {
      type: String,
      enum: ['pdf', 'url', 'text', 'manual'],
      required: true,
    },
    sourceUrl: {
      type: String,
      trim: true,
    },
    s3Key: {
      type: String,
      trim: true,
    },
    rawText: {
      type: String,
    },
    status: {
      type: String,
      enum: ['pending', 'processing', 'indexed', 'failed'],
      default: 'pending',
      index: true,
    },
    errorMessage: {
      type: String,
    },
    chunkCount: {
      type: Number,
      default: 0,
    },
    metadata: {
      type: Schema.Types.Mixed,
      default: {},
    },
    lastIndexedAt: {
      type: Date,
    },
    createdBy: {
      type: String,
      required: true,
    },
  },
  {
    timestamps: true,
  }
);

// Compound indexes
kbDocumentSchema.index({ companyId: 1, status: 1 });
kbDocumentSchema.index({ companyId: 1, category: 1 });
kbDocumentSchema.index({ companyId: 1, createdAt: -1 });

export const KBDocument: Model<IKBDocument> = mongoose.model<IKBDocument>('KBDocument', kbDocumentSchema);

/**
 * Knowledge Base Gap Interface
 * Tracks queries that couldn't be answered by the KB
 */
export interface IKBGap extends Document {
  companyId: mongoose.Types.ObjectId;
  query: string;
  queryHash: string;
  channel: 'voice' | 'text';
  frequency: number;
  status: 'open' | 'in_progress' | 'resolved';
  resolution?: {
    answer: string;
    documentId?: mongoose.Types.ObjectId;
    resolvedBy: string;
    resolvedAt: Date;
  };
  firstOccurredAt: Date;
  lastOccurredAt: Date;
  createdAt: Date;
  updatedAt: Date;
}

const kbGapSchema = new Schema<IKBGap>(
  {
    companyId: {
      type: Schema.Types.ObjectId,
      ref: 'Company',
      required: true,
      index: true,
    },
    query: {
      type: String,
      required: true,
      trim: true,
    },
    queryHash: {
      type: String,
      required: true,
    },
    channel: {
      type: String,
      enum: ['voice', 'text'],
      required: true,
    },
    frequency: {
      type: Number,
      default: 1,
    },
    status: {
      type: String,
      enum: ['open', 'in_progress', 'resolved'],
      default: 'open',
      index: true,
    },
    resolution: {
      answer: String,
      documentId: {
        type: Schema.Types.ObjectId,
        ref: 'KBDocument',
      },
      resolvedBy: String,
      resolvedAt: Date,
    },
    firstOccurredAt: {
      type: Date,
      default: Date.now,
    },
    lastOccurredAt: {
      type: Date,
      default: Date.now,
    },
  },
  {
    timestamps: true,
  }
);

// Compound indexes
kbGapSchema.index({ companyId: 1, queryHash: 1 }, { unique: true });
kbGapSchema.index({ companyId: 1, status: 1, frequency: -1 });
kbGapSchema.index({ companyId: 1, lastOccurredAt: -1 });

export const KBGap: Model<IKBGap> = mongoose.model<IKBGap>('KBGap', kbGapSchema);
