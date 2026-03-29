import { Worker, Job } from 'bullmq';
import { z } from 'zod';
import OpenAI from 'openai';
import { env } from '../config/env.js';
import { QUEUES } from '../config/constants.js';
import { logger } from '../config/logger.js';
import { redis, buildRedisKey } from '../config/redis.js';
import { CallSession } from '../models/CallSession.js';
import { Ticket } from '../models/Ticket.js';
import { Customer } from '../models/Customer.js';
import { Company } from '../models/Company.js';
import { qaQueue, classificationQueue } from './index.js';
import { getOrchestrator } from '../integrations/IntegrationOrchestrator.js';
import { sendCallSummary } from '../services/slackNotifier.js';
import { emitCallResolved, emitCallEscalated } from '../sockets/activitySocket.js';
import type { SummaryJobData } from '../types/session.js';

const childLogger = logger.child({ worker: 'summary' });

// Parse Redis URL for BullMQ connection
const redisUrl = new URL(env.UPSTASH_REDIS_URL);

const connectionOptions = {
  host: redisUrl.hostname,
  port: parseInt(redisUrl.port || '6379', 10),
  password: env.UPSTASH_REDIS_TOKEN,
  tls: {},
  maxRetriesPerRequest: null,
};

// OpenAI client
const openai = new OpenAI({ apiKey: env.OPENAI_API_KEY });

// Zod schema for structured summary output
const SummarySchema = z.object({
  issueType: z.string(),
  customerRequest: z.string(),
  actionsTaken: z.array(z.string()),
  resolutionStatus: z.enum(['resolved', 'escalated', 'unresolved']),
  followUpRequired: z.boolean(),
  followUpAction: z.string().nullable(),
  customerSentiment: z.enum(['positive', 'neutral', 'negative']),
  keyEntities: z.record(z.string()),
  summaryParagraph: z.string(),
  ticketSubject: z.string(),
});

type SummaryResult = z.infer<typeof SummarySchema>;

// System prompt for summarization
const SUMMARY_SYSTEM_PROMPT = `You are an expert customer service analyst. Analyze the following conversation and produce a structured JSON summary.

Your output MUST be valid JSON matching this exact schema:
{
  "issueType": "string - category of the issue (e.g., 'Billing', 'Technical Support', 'Account Access')",
  "customerRequest": "string - concise description of what the customer wanted",
  "actionsTaken": ["array of strings - actions AI/agent took to help"],
  "resolutionStatus": "resolved" | "escalated" | "unresolved",
  "followUpRequired": boolean,
  "followUpAction": "string or null - specific follow-up needed if any",
  "customerSentiment": "positive" | "neutral" | "negative",
  "keyEntities": {"orderId": "123", "productName": "Widget", ...} - extracted entities,
  "summaryParagraph": "string - 2-3 sentence natural language summary",
  "ticketSubject": "string - short ticket subject line (max 80 chars)"
}

Be accurate, objective, and focus on actionable information. Extract any order IDs, product names, account numbers, dates, or other key entities mentioned.`;

/**
 * Build transcript string from conversation turns
 */
function buildTranscript(turns: Array<{ role: string; content: string; timestamp?: Date }>): string {
  return turns
    .filter((t) => t.role === 'user' || t.role === 'assistant')
    .map((t) => `[${t.role.toUpperCase()}]: ${t.content}`)
    .join('\n\n');
}

/**
 * Generate summary using GPT-4o
 */
async function generateSummary(transcript: string): Promise<SummaryResult> {
  const response = await openai.chat.completions.create({
    model: 'gpt-4o',
    temperature: 0,
    response_format: { type: 'json_object' },
    messages: [
      { role: 'system', content: SUMMARY_SYSTEM_PROMPT },
      { role: 'user', content: `Conversation transcript:\n\n${transcript}` },
    ],
  });

  const content = response.choices[0]?.message?.content;
  if (!content) {
    throw new Error('Empty response from GPT-4o');
  }

  const parsed = JSON.parse(content);
  return SummarySchema.parse(parsed); // Validates against schema, throws on failure
}

/**
 * Process a voice call summary
 */
async function processVoiceCall(
  interactionId: string,
  companyId: string
): Promise<{ summary: SummaryResult; callerPhone: string; customerId?: string }> {
  // Fetch call session
  const session = await CallSession.findOne({
    callId: interactionId,
    companyId,
  });

  if (!session) {
    throw new Error(`CallSession not found: ${interactionId}`);
  }

  // Build transcript
  const transcript = buildTranscript(session.turns);
  if (!transcript || transcript.length < 20) {
    throw new Error('Insufficient conversation content for summarization');
  }

  // Generate summary
  const summary = await generateSummary(transcript);

  // Update call session
  await CallSession.findByIdAndUpdate(session._id, {
    summary: summary.summaryParagraph,
    intent: summary.issueType,
    'sentiment.overall': summary.customerSentiment,
    'slots.resolution': summary.resolutionStatus,
    $set: {
      'metadata.entities': summary.keyEntities,
      'metadata.actionsTaken': summary.actionsTaken,
    },
  });

  return {
    summary,
    callerPhone: session.callerPhone,
    customerId: session.customerId?.toString(),
  };
}

/**
 * Process a text ticket summary
 */
async function processTextTicket(
  interactionId: string,
  companyId: string
): Promise<{ summary: SummaryResult; email?: string; customerId?: string }> {
  // Fetch ticket
  const ticket = await Ticket.findOne({
    _id: interactionId,
    companyId,
  }).populate('customerId', 'email');

  if (!ticket) {
    throw new Error(`Ticket not found: ${interactionId}`);
  }

  // Build transcript from messages
  const messages = ticket.messages || [];
  const transcript = messages
    .map((m: { sender: string; content: string }) => `[${m.sender.toUpperCase()}]: ${m.content}`)
    .join('\n\n');

  if (!transcript || transcript.length < 20) {
    throw new Error('Insufficient conversation content for summarization');
  }

  // Generate summary
  const summary = await generateSummary(transcript);

  // Update ticket
  await Ticket.findByIdAndUpdate(ticket._id, {
    summary: summary.summaryParagraph,
    'aiAnalysis.intent': summary.issueType,
    'aiAnalysis.sentiment': summary.customerSentiment,
    'metadata.entities': summary.keyEntities,
    'metadata.actionsTaken': summary.actionsTaken,
  });

  const customer = ticket.customerId as unknown as { email?: string; _id?: string } | undefined;

  return {
    summary,
    email: customer?.email,
    customerId: customer?._id?.toString(),
  };
}

/**
 * Update customer record with interaction history
 */
async function updateCustomer(
  customerId: string,
  companyId: string,
  summary: SummaryResult,
  channel: 'voice' | 'text',
  interactionId: string
): Promise<void> {
  const historyEntry = {
    interactionId,
    date: new Date(),
    summary: summary.summaryParagraph,
    sentiment: summary.customerSentiment,
    resolution: summary.resolutionStatus,
    issueType: summary.issueType,
  };

  const updateField = channel === 'voice' ? 'callHistory' : 'ticketHistory';

  await Customer.findByIdAndUpdate(customerId, {
    $push: {
      [updateField]: {
        $each: [historyEntry],
        $slice: -50, // Keep last 50 entries
      },
    },
    lastContactDate: new Date(),
  });
}

/**
 * Invalidate customer 360 cache
 */
async function invalidateCustomerCache(
  companyId: string,
  identifier: { phone?: string; email?: string }
): Promise<void> {
  const keys: string[] = [];

  if (identifier.phone) {
    keys.push(buildRedisKey(companyId, 'customer360', identifier.phone));
  }
  if (identifier.email) {
    keys.push(buildRedisKey(companyId, 'customer360', identifier.email));
  }

  if (keys.length > 0) {
    await redis.del(...keys);
    childLogger.debug({ keys }, 'Invalidated customer cache');
  }
}

/**
 * Create follow-up ticket if unresolved
 */
async function createFollowUpTicket(
  companyId: string,
  summary: SummaryResult,
  channel: 'voice' | 'text',
  interactionId: string,
  customerId?: string
): Promise<string | null> {
  // Create internal ticket
  const ticket = await Ticket.create({
    companyId,
    customerId,
    subject: summary.ticketSubject,
    description: summary.summaryParagraph,
    priority: summary.resolutionStatus === 'escalated' ? 'high' : 'medium',
    status: 'open',
    channel: channel === 'voice' ? 'phone' : 'email',
    source: 'ai_generated',
    metadata: {
      sourceInteractionId: interactionId,
      sourceChannel: channel,
      issueType: summary.issueType,
      entities: summary.keyEntities,
      followUpAction: summary.followUpAction,
    },
  });

  // Try to sync to external CRM
  try {
    const orchestrator = await getOrchestrator(companyId);
    const adapters = orchestrator.getEnabledAdapters();

    if (adapters.length > 0) {
      const adapter = orchestrator.getAdapter(adapters[0]);
      if (adapter) {
        await adapter.createTicket({
          subject: summary.ticketSubject,
          description: summary.summaryParagraph,
          priority: summary.resolutionStatus === 'escalated' ? 'P2' : 'P3',
          tags: [summary.issueType, channel, 'auto-generated'],
          metadata: {
            omnisupportTicketId: ticket._id.toString(),
            sourceInteractionId: interactionId,
          },
        });
      }
    }
  } catch (error) {
    childLogger.error({ error, companyId }, 'Failed to sync ticket to CRM');
  }

  // Queue for classification
  await classificationQueue.add('classify', {
    ticketId: ticket._id.toString(),
    companyId,
  });

  return ticket._id.toString();
}

/**
 * Summary worker processor
 */
async function processSummaryJob(job: Job<SummaryJobData>): Promise<void> {
  const { interactionId, companyId, channel } = job.data;

  childLogger.info({ interactionId, companyId, channel, jobId: job.id }, 'Processing summary job');

  let summary: SummaryResult;
  let callerPhone: string | undefined;
  let email: string | undefined;
  let customerId: string | undefined;

  // Step a-d: Fetch interaction and generate summary
  if (channel === 'voice') {
    const result = await processVoiceCall(interactionId, companyId);
    summary = result.summary;
    callerPhone = result.callerPhone;
    customerId = result.customerId;
  } else {
    const result = await processTextTicket(interactionId, companyId);
    summary = result.summary;
    email = result.email;
    customerId = result.customerId;
  }

  // Step f: Update customer history
  if (customerId) {
    await updateCustomer(customerId, companyId, summary, channel, interactionId);
  }

  // Step g: Invalidate Redis cache
  await invalidateCustomerCache(companyId, { phone: callerPhone, email });

  // Step h: Create follow-up ticket if not resolved
  let ticketId: string | null = null;
  if (summary.resolutionStatus !== 'resolved') {
    ticketId = await createFollowUpTicket(companyId, summary, channel, interactionId, customerId);
    childLogger.info({ interactionId, ticketId }, 'Created follow-up ticket');
  }

  // Step i: Send Slack notification if enabled
  try {
    await sendCallSummary(companyId, summary, interactionId);
  } catch (error) {
    childLogger.warn({ error, companyId }, 'Failed to send Slack notification');
  }

  // Step j: Queue for QA scoring
  await qaQueue.add('score', {
    interactionId,
    companyId,
    channel,
  });

  // Emit activity event based on resolution status
  if (channel === 'voice') {
    if (summary.resolutionStatus === 'resolved') {
      await emitCallResolved(companyId, interactionId, summary.issueType);
    } else if (summary.resolutionStatus === 'escalated') {
      await emitCallEscalated(companyId, interactionId, summary.issueType);
    }
  }

  childLogger.info(
    {
      interactionId,
      companyId,
      channel,
      resolution: summary.resolutionStatus,
      sentiment: summary.customerSentiment,
      ticketCreated: !!ticketId,
    },
    'Summary job completed'
  );
}

// Create worker
const summaryWorker = new Worker<SummaryJobData>(
  QUEUES.SUMMARY,
  processSummaryJob,
  {
    connection: connectionOptions,
    concurrency: 5,
    limiter: {
      max: 10,
      duration: 1000,
    },
  }
);

// Worker event handlers
summaryWorker.on('completed', (job) => {
  childLogger.debug({ jobId: job.id }, 'Summary job completed');
});

summaryWorker.on('failed', (job, err) => {
  childLogger.error(
    {
      jobId: job?.id,
      error: err.message,
      data: job?.data,
    },
    'Summary job failed'
  );
});

summaryWorker.on('error', (err) => {
  childLogger.error({ error: err.message }, 'Summary worker error');
});

export { summaryWorker };
export default summaryWorker;
