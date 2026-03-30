import mongoose, { Schema, Document, Model } from 'mongoose';

export interface ISLABreachRecord extends Document {
  companyId: mongoose.Types.ObjectId;
  ticketId: mongoose.Types.ObjectId;
  externalId: string;
  priority: 'urgent' | 'high' | 'normal' | 'low';
  category?: string;
  slaDeadline: Date;
  breachedAt: Date;
  breachDurationMinutes: number;
  assignedAgent?: string;
  resolvedAt?: Date;
  rootCause?: string; // filled in by manager review
  createdAt: Date;
  updatedAt: Date;
}

const slaBreachRecordSchema = new Schema<ISLABreachRecord>(
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
      required: true,
    },
    externalId: {
      type: String,
      required: true,
    },
    priority: {
      type: String,
      enum: ['urgent', 'high', 'normal', 'low'],
      required: true,
    },
    category: {
      type: String,
    },
    slaDeadline: {
      type: Date,
      required: true,
    },
    breachedAt: {
      type: Date,
      required: true,
      default: Date.now,
    },
    breachDurationMinutes: {
      type: Number,
      required: true,
      default: 0,
    },
    assignedAgent: {
      type: String,
    },
    resolvedAt: {
      type: Date,
    },
    rootCause: {
      type: String,
    },
  },
  {
    timestamps: true,
  }
);

// Indexes for efficient queries
slaBreachRecordSchema.index({ companyId: 1, createdAt: -1 });
slaBreachRecordSchema.index({ companyId: 1, priority: 1, createdAt: -1 });
slaBreachRecordSchema.index({ companyId: 1, ticketId: 1 }, { unique: true });
slaBreachRecordSchema.index({ companyId: 1, category: 1 });
slaBreachRecordSchema.index({ companyId: 1, resolvedAt: 1 });

export const SLABreachRecord: Model<ISLABreachRecord> = mongoose.model<ISLABreachRecord>(
  'SLABreachRecord',
  slaBreachRecordSchema
);
