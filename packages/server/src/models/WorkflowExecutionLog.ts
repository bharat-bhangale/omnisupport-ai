// ============================================================================
// WORKFLOW EXECUTION LOG MODEL
// ============================================================================
// Stores execution history for each workflow run

import mongoose, { Schema, Document, Model } from 'mongoose';

/**
 * Workflow execution log entry
 */
export interface IWorkflowExecutionLog extends Document {
  workflowId: mongoose.Types.ObjectId;
  companyId: mongoose.Types.ObjectId;
  triggerId: string;
  context: Record<string, unknown>;
  actionsExecuted: string[];
  success: boolean;
  errorMessage?: string;
  durationMs: number;
  createdAt: Date;
}

const workflowExecutionLogSchema = new Schema<IWorkflowExecutionLog>(
  {
    workflowId: {
      type: Schema.Types.ObjectId,
      ref: 'Workflow',
      required: true,
      index: true,
    },
    companyId: {
      type: Schema.Types.ObjectId,
      ref: 'Company',
      required: true,
      index: true,
    },
    triggerId: {
      type: String,
      required: true,
    },
    context: {
      type: Schema.Types.Mixed,
      required: true,
      default: {},
    },
    actionsExecuted: {
      type: [String],
      default: [],
    },
    success: {
      type: Boolean,
      required: true,
      default: true,
    },
    errorMessage: {
      type: String,
    },
    durationMs: {
      type: Number,
      required: true,
      default: 0,
    },
  },
  {
    timestamps: { createdAt: true, updatedAt: false },
  }
);

// Compound index for efficient queries
workflowExecutionLogSchema.index({ workflowId: 1, createdAt: -1 });
workflowExecutionLogSchema.index({ companyId: 1, createdAt: -1 });
workflowExecutionLogSchema.index({ companyId: 1, success: 1, createdAt: -1 });

// TTL index to auto-delete old logs after 90 days
workflowExecutionLogSchema.index(
  { createdAt: 1 },
  { expireAfterSeconds: 90 * 24 * 60 * 60 }
);

/**
 * Static method to get execution history for a workflow
 */
workflowExecutionLogSchema.statics.getHistory = async function (
  workflowId: string,
  companyId: string,
  days: number = 7,
  limit: number = 100
): Promise<IWorkflowExecutionLog[]> {
  const since = new Date();
  since.setDate(since.getDate() - days);

  return this.find({
    workflowId,
    companyId,
    createdAt: { $gte: since },
  })
    .sort({ createdAt: -1 })
    .limit(limit)
    .lean()
    .exec();
};

/**
 * Static method to get analytics for a workflow
 */
workflowExecutionLogSchema.statics.getAnalytics = async function (
  workflowId: string,
  companyId: string,
  days: number = 30
): Promise<{
  triggeredCount: number;
  successCount: number;
  failedCount: number;
  successRate: number;
  avgDurationMs: number;
  avgActionsPerRun: number;
  topContextFields: { field: string; count: number }[];
  lastTriggered: Date | null;
}> {
  const since = new Date();
  since.setDate(since.getDate() - days);

  const pipeline = [
    {
      $match: {
        workflowId: new mongoose.Types.ObjectId(workflowId),
        companyId: new mongoose.Types.ObjectId(companyId),
        createdAt: { $gte: since },
      },
    },
    {
      $group: {
        _id: null,
        triggeredCount: { $sum: 1 },
        successCount: {
          $sum: { $cond: ['$success', 1, 0] },
        },
        failedCount: {
          $sum: { $cond: ['$success', 0, 1] },
        },
        totalDurationMs: { $sum: '$durationMs' },
        totalActions: { $sum: { $size: '$actionsExecuted' } },
        lastTriggered: { $max: '$createdAt' },
        allContextKeys: { $push: { $objectToArray: '$context' } },
      },
    },
    {
      $project: {
        _id: 0,
        triggeredCount: 1,
        successCount: 1,
        failedCount: 1,
        successRate: {
          $cond: [
            { $eq: ['$triggeredCount', 0] },
            0,
            {
              $multiply: [
                { $divide: ['$successCount', '$triggeredCount'] },
                100,
              ],
            },
          ],
        },
        avgDurationMs: {
          $cond: [
            { $eq: ['$triggeredCount', 0] },
            0,
            { $divide: ['$totalDurationMs', '$triggeredCount'] },
          ],
        },
        avgActionsPerRun: {
          $cond: [
            { $eq: ['$triggeredCount', 0] },
            0,
            { $divide: ['$totalActions', '$triggeredCount'] },
          ],
        },
        lastTriggered: 1,
        allContextKeys: 1,
      },
    },
  ];

  const results = await this.aggregate(pipeline).exec();

  if (results.length === 0) {
    return {
      triggeredCount: 0,
      successCount: 0,
      failedCount: 0,
      successRate: 0,
      avgDurationMs: 0,
      avgActionsPerRun: 0,
      topContextFields: [],
      lastTriggered: null,
    };
  }

  const result = results[0];

  // Count context field usage
  const fieldCounts: Record<string, number> = {};
  if (result.allContextKeys) {
    for (const contextArray of result.allContextKeys) {
      if (Array.isArray(contextArray)) {
        for (const kv of contextArray) {
          if (kv.k && kv.v !== undefined && kv.v !== null) {
            fieldCounts[kv.k] = (fieldCounts[kv.k] || 0) + 1;
          }
        }
      }
    }
  }

  const topContextFields = Object.entries(fieldCounts)
    .map(([field, count]) => ({ field, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 10);

  return {
    triggeredCount: result.triggeredCount,
    successCount: result.successCount,
    failedCount: result.failedCount,
    successRate: Math.round(result.successRate * 100) / 100,
    avgDurationMs: Math.round(result.avgDurationMs),
    avgActionsPerRun: Math.round(result.avgActionsPerRun * 100) / 100,
    topContextFields,
    lastTriggered: result.lastTriggered,
  };
};

export interface WorkflowExecutionLogModel extends Model<IWorkflowExecutionLog> {
  getHistory(
    workflowId: string,
    companyId: string,
    days?: number,
    limit?: number
  ): Promise<IWorkflowExecutionLog[]>;
  getAnalytics(
    workflowId: string,
    companyId: string,
    days?: number
  ): Promise<{
    triggeredCount: number;
    successCount: number;
    failedCount: number;
    successRate: number;
    avgDurationMs: number;
    avgActionsPerRun: number;
    topContextFields: { field: string; count: number }[];
    lastTriggered: Date | null;
  }>;
}

export const WorkflowExecutionLog = mongoose.model<
  IWorkflowExecutionLog,
  WorkflowExecutionLogModel
>('WorkflowExecutionLog', workflowExecutionLogSchema);
