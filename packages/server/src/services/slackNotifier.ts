import { Company } from '../models/Company.js';
import { logger } from '../config/logger.js';

const childLogger = logger.child({ service: 'slackNotifier' });

interface SlackBlock {
  type: string;
  text?: { type: string; text: string; emoji?: boolean };
  elements?: Array<{ type: string; text?: { type: string; text: string; emoji?: boolean }; url?: string }>;
  fields?: Array<{ type: string; text: string }>;
  accessory?: { type: string; image_url: string; alt_text: string };
}

interface SummaryData {
  issueType: string;
  customerRequest: string;
  actionsTaken: string[];
  resolutionStatus: 'resolved' | 'escalated' | 'unresolved';
  followUpRequired: boolean;
  followUpAction: string | null;
  customerSentiment: 'positive' | 'neutral' | 'negative';
  keyEntities: Record<string, string>;
  summaryParagraph: string;
  ticketSubject: string;
}

interface EscalationData {
  callId: string;
  callerPhone: string;
  reason: string;
  priority: string;
  brief: string;
  sentiment: string;
}

interface DigestData {
  weekStart: string;
  weekEnd: string;
  totalInteractions: number;
  aiResolutionRate: number;
  avgSentiment: number;
  topIssues: Array<{ issue: string; count: number }>;
  improvementSuggestions: string[];
  notablePatterns: string[];
}

/**
 * Get Slack webhook URL for a company
 */
async function getSlackWebhook(companyId: string): Promise<string | null> {
  const company = await Company.findById(companyId)
    .select('integrations.slack')
    .lean();

  return company?.integrations?.slack?.webhookUrl || null;
}

/**
 * Send message to Slack webhook
 */
async function sendToSlack(webhookUrl: string, blocks: SlackBlock[]): Promise<boolean> {
  try {
    const response = await fetch(webhookUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ blocks }),
    });

    if (!response.ok) {
      childLogger.error({ status: response.status }, 'Slack webhook failed');
      return false;
    }

    return true;
  } catch (error) {
    childLogger.error({ error }, 'Failed to send Slack message');
    return false;
  }
}

/**
 * Get emoji for sentiment
 */
function sentimentEmoji(sentiment: string): string {
  switch (sentiment) {
    case 'positive':
      return '😊';
    case 'negative':
      return '😟';
    default:
      return '😐';
  }
}

/**
 * Get emoji for resolution status
 */
function statusEmoji(status: string): string {
  switch (status) {
    case 'resolved':
      return '✅';
    case 'escalated':
      return '🔄';
    default:
      return '⚠️';
  }
}

/**
 * Send call summary notification to Slack
 */
export async function sendCallSummary(
  companyId: string,
  summary: SummaryData,
  callId: string
): Promise<boolean> {
  const webhookUrl = await getSlackWebhook(companyId);
  if (!webhookUrl) {
    childLogger.debug({ companyId }, 'Slack not configured, skipping notification');
    return false;
  }

  const blocks: SlackBlock[] = [
    {
      type: 'header',
      text: {
        type: 'plain_text',
        text: `${statusEmoji(summary.resolutionStatus)} Call Summary`,
        emoji: true,
      },
    },
    {
      type: 'section',
      text: {
        type: 'mrkdwn',
        text: summary.summaryParagraph,
      },
    },
    {
      type: 'section',
      fields: [
        {
          type: 'mrkdwn',
          text: `*Issue Type:*\n${summary.issueType}`,
        },
        {
          type: 'mrkdwn',
          text: `*Status:*\n${summary.resolutionStatus}`,
        },
        {
          type: 'mrkdwn',
          text: `*Sentiment:*\n${sentimentEmoji(summary.customerSentiment)} ${summary.customerSentiment}`,
        },
        {
          type: 'mrkdwn',
          text: `*Call ID:*\n\`${callId}\``,
        },
      ],
    },
  ];

  // Add actions taken
  if (summary.actionsTaken.length > 0) {
    blocks.push({
      type: 'section',
      text: {
        type: 'mrkdwn',
        text: `*Actions Taken:*\n${summary.actionsTaken.map((a) => `• ${a}`).join('\n')}`,
      },
    });
  }

  // Add follow-up if required
  if (summary.followUpRequired && summary.followUpAction) {
    blocks.push({
      type: 'section',
      text: {
        type: 'mrkdwn',
        text: `🔔 *Follow-up Required:* ${summary.followUpAction}`,
      },
    });
  }

  // Add key entities if any
  const entityEntries = Object.entries(summary.keyEntities);
  if (entityEntries.length > 0) {
    blocks.push({
      type: 'context',
      elements: entityEntries.slice(0, 5).map(([key, value]) => ({
        type: 'mrkdwn',
        text: `*${key}:* ${value}`,
      })),
    });
  }

  blocks.push({
    type: 'divider',
  } as SlackBlock);

  const success = await sendToSlack(webhookUrl, blocks);
  if (success) {
    childLogger.info({ companyId, callId }, 'Call summary sent to Slack');
  }

  return success;
}

/**
 * Send escalation alert to Slack (urgent)
 */
export async function sendEscalationAlert(
  companyId: string,
  escalation: EscalationData
): Promise<boolean> {
  const webhookUrl = await getSlackWebhook(companyId);
  if (!webhookUrl) {
    return false;
  }

  const priorityEmoji: Record<string, string> = {
    urgent: '🚨',
    high: '🔴',
    medium: '🟡',
    low: '🟢',
  };

  const blocks: SlackBlock[] = [
    {
      type: 'header',
      text: {
        type: 'plain_text',
        text: `${priorityEmoji[escalation.priority] || '⚠️'} ESCALATION ALERT`,
        emoji: true,
      },
    },
    {
      type: 'section',
      text: {
        type: 'mrkdwn',
        text: `*Customer on hold needs immediate assistance!*`,
      },
    },
    {
      type: 'section',
      fields: [
        {
          type: 'mrkdwn',
          text: `*Phone:*\n${escalation.callerPhone}`,
        },
        {
          type: 'mrkdwn',
          text: `*Priority:*\n${escalation.priority.toUpperCase()}`,
        },
        {
          type: 'mrkdwn',
          text: `*Reason:*\n${escalation.reason}`,
        },
        {
          type: 'mrkdwn',
          text: `*Sentiment:*\n${sentimentEmoji(escalation.sentiment)} ${escalation.sentiment}`,
        },
      ],
    },
    {
      type: 'section',
      text: {
        type: 'mrkdwn',
        text: `*AI Handover Brief:*\n> ${escalation.brief}`,
      },
    },
    {
      type: 'context',
      elements: [
        {
          type: 'mrkdwn',
          text: `Call ID: \`${escalation.callId}\` | Escalated at ${new Date().toLocaleTimeString()}`,
        },
      ],
    },
    {
      type: 'divider',
    } as SlackBlock,
  ];

  const success = await sendToSlack(webhookUrl, blocks);
  if (success) {
    childLogger.info({ companyId, callId: escalation.callId }, 'Escalation alert sent to Slack');
  }

  return success;
}

/**
 * Send weekly learning digest to Slack
 */
export async function sendWeeklyLearningDigest(
  companyId: string,
  digest: DigestData
): Promise<boolean> {
  const webhookUrl = await getSlackWebhook(companyId);
  if (!webhookUrl) {
    return false;
  }

  const blocks: SlackBlock[] = [
    {
      type: 'header',
      text: {
        type: 'plain_text',
        text: '📊 Weekly Support Digest',
        emoji: true,
      },
    },
    {
      type: 'section',
      text: {
        type: 'mrkdwn',
        text: `*${digest.weekStart} - ${digest.weekEnd}*`,
      },
    },
    {
      type: 'section',
      fields: [
        {
          type: 'mrkdwn',
          text: `*Total Interactions:*\n${digest.totalInteractions.toLocaleString()}`,
        },
        {
          type: 'mrkdwn',
          text: `*AI Resolution Rate:*\n${digest.aiResolutionRate.toFixed(1)}%`,
        },
        {
          type: 'mrkdwn',
          text: `*Avg Sentiment:*\n${digest.avgSentiment >= 0.5 ? '😊' : digest.avgSentiment >= 0 ? '😐' : '😟'} ${(digest.avgSentiment * 100).toFixed(0)}%`,
        },
      ],
    },
  ];

  // Top issues
  if (digest.topIssues.length > 0) {
    blocks.push({
      type: 'section',
      text: {
        type: 'mrkdwn',
        text:
          '*Top Issues:*\n' +
          digest.topIssues
            .slice(0, 5)
            .map((i, idx) => `${idx + 1}. ${i.issue} (${i.count})`)
            .join('\n'),
      },
    });
  }

  // Improvement suggestions
  if (digest.improvementSuggestions.length > 0) {
    blocks.push({
      type: 'section',
      text: {
        type: 'mrkdwn',
        text:
          '*💡 AI Improvement Suggestions:*\n' +
          digest.improvementSuggestions.map((s) => `• ${s}`).join('\n'),
      },
    });
  }

  // Notable patterns
  if (digest.notablePatterns.length > 0) {
    blocks.push({
      type: 'section',
      text: {
        type: 'mrkdwn',
        text:
          '*🔍 Notable Patterns:*\n' + digest.notablePatterns.map((p) => `• ${p}`).join('\n'),
      },
    });
  }

  blocks.push({
    type: 'divider',
  } as SlackBlock);

  const success = await sendToSlack(webhookUrl, blocks);
  if (success) {
    childLogger.info({ companyId }, 'Weekly digest sent to Slack');
  }

  return success;
}

export default {
  sendCallSummary,
  sendEscalationAlert,
  sendWeeklyLearningDigest,
};
