import { Worker, Job } from 'bullmq';
import OpenAI from 'openai';
import { Pinecone } from '@pinecone-database/pinecone';
import { env } from '../config/env.js';
import { QUEUES, OPENAI_CONFIG } from '../config/constants.js';
import { logger } from '../config/logger.js';
import { Ticket } from '../models/Ticket.js';
import {
  ClassificationSchema,
  ClassificationJobData,
  ClassificationResult,
  Classification,
  SLA_CONFIG,
  DEFAULT_ROUTING_RULES,
  URGENCY_KEYWORDS,
  TicketPriorityType,
} from '../types/ticket.js';
import { buildCustomerCard } from '../services/customerIntelligence.js';
import { responseQueue } from './index.js';
import { emitTicketClassified } from '../sockets/activitySocket.js';

const childLogger = logger.child({ worker: 'classification' });

// Initialize clients
const openai = new OpenAI({ apiKey: env.OPENAI_API_KEY });
const pinecone = new Pinecone({ apiKey: env.PINECONE_API_KEY });
const pineconeIndex = pinecone.index(env.PINECONE_INDEX);

// Parse Upstash Redis URL for BullMQ connection
const redisUrl = new URL(env.UPSTASH_REDIS_URL);

const connectionOptions = {
  host: redisUrl.hostname,
  port: parseInt(redisUrl.port || '6379', 10),
  password: env.UPSTASH_REDIS_TOKEN,
  tls: {},
  maxRetriesPerRequest: null,
};

/**
 * Get embedding for text using OpenAI
 */
async function getEmbedding(text: string): Promise<number[]> {
  const response = await openai.embeddings.create({
    model: OPENAI_CONFIG.EMBEDDING_MODEL,
    input: text.slice(0, 8000), // Max input length
  });
  return response.data[0].embedding;
}

/**
 * Fetch few-shot examples from Pinecone based on similar tickets
 */
async function getFewShotExamples(
  companyId: string,
  subject: string,
  description: string,
  topK: number = 3
): Promise<{ examples: string[]; ids: string[] }> {
  try {
    const queryText = `${subject}\n${description}`;
    const embedding = await getEmbedding(queryText);

    const results = await pineconeIndex.namespace(`${companyId}-tickets`).query({
      vector: embedding,
      topK,
      includeMetadata: true,
      filter: {
        hasClassification: true,
      },
    });

    const examples: string[] = [];
    const ids: string[] = [];

    for (const match of results.matches || []) {
      if (match.score && match.score > 0.7 && match.metadata) {
        const meta = match.metadata as {
          subject?: string;
          category?: string;
          priority?: string;
          sentiment?: string;
          routeTo?: string;
        };

        examples.push(
          `Example Ticket:
Subject: ${meta.subject || 'N/A'}
Classification: category="${meta.category}", priority="${meta.priority}", sentiment="${meta.sentiment}", routeTo="${meta.routeTo}"`
        );
        ids.push(match.id);
      }
    }

    childLogger.debug({ companyId, exampleCount: examples.length }, 'Few-shot examples fetched');
    return { examples, ids };
  } catch (error) {
    childLogger.warn({ error, companyId }, 'Failed to fetch few-shot examples, proceeding without');
    return { examples: [], ids: [] };
  }
}

/**
 * Detect urgency signals in ticket text
 */
function detectUrgencySignals(subject: string, description: string): string[] {
  const text = `${subject} ${description}`.toLowerCase();
  const signals: string[] = [];

  for (const keyword of URGENCY_KEYWORDS) {
    if (text.includes(keyword)) {
      signals.push(keyword);
    }
  }

  // Additional pattern-based signals
  if (/\b(within|before|by)\s+\d+\s*(hour|day|week)/i.test(text)) {
    signals.push('time_constraint');
  }
  if (/\b(please|plz|pls)\s+(help|urgent|asap)/i.test(text)) {
    signals.push('explicit_urgency');
  }
  if (/[A-Z]{3,}/.test(text)) {
    signals.push('caps_emphasis');
  }
  if (/!{2,}/.test(text)) {
    signals.push('exclamation_emphasis');
  }

  return [...new Set(signals)];
}

/**
 * Classify ticket using GPT-4o with function calling
 */
async function classifyTicket(
  data: ClassificationJobData,
  fewShotExamples: string[]
): Promise<Classification> {
  const urgencySignals = detectUrgencySignals(data.subject, data.description);

  const systemPrompt = `You are an expert customer support ticket classifier.
Analyze the ticket and provide:
1. Primary category and optional sub-category
2. Priority (P1=Critical, P2=High, P3=Normal, P4=Low)
3. Confidence score (0-1)
4. Team/queue to route to
5. Customer sentiment
6. Urgency signals detected
7. Suggested tags
8. Whether escalation is needed
9. Whether AI is confident enough to auto-respond

Guidelines for priority:
- P1: Service outage, security issues, fraud, billing errors affecting service
- P2: Feature broken, urgent business need, VIP customer
- P3: Standard requests, questions, feature requests
- P4: Feedback, minor issues, informational

${fewShotExamples.length > 0 ? `\nRelevant examples from this company:\n${fewShotExamples.join('\n\n')}` : ''}

Pre-detected urgency signals: ${urgencySignals.length > 0 ? urgencySignals.join(', ') : 'none'}`;

  const userPrompt = `Classify this ticket:

Subject: ${data.subject}

Description:
${data.description}

${data.existingTags?.length ? `Existing tags: ${data.existingTags.join(', ')}` : ''}
${data.priority ? `Current priority: ${data.priority}` : ''}`;

  const response = await openai.chat.completions.create({
    model: OPENAI_CONFIG.MODEL,
    temperature: OPENAI_CONFIG.TEMPERATURE.CLASSIFICATION,
    max_tokens: OPENAI_CONFIG.MAX_TOKENS.CLASSIFICATION,
    messages: [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userPrompt },
    ],
    tools: [
      {
        type: 'function',
        function: {
          name: 'classify_ticket',
          description: 'Classify the support ticket',
          parameters: {
            type: 'object',
            properties: {
              category: {
                type: 'string',
                description: 'Primary category (billing, shipping, technical, account, refund, complaint, general, sales, legal)',
              },
              subCategory: {
                type: 'string',
                description: 'Optional sub-category for more specific routing',
              },
              priority: {
                type: 'string',
                enum: ['P1', 'P2', 'P3', 'P4'],
                description: 'Priority level',
              },
              confidence: {
                type: 'number',
                minimum: 0,
                maximum: 1,
                description: 'Confidence in the classification',
              },
              routeTo: {
                type: 'string',
                description: 'Queue or team to route to',
              },
              reasoning: {
                type: 'string',
                description: 'Brief explanation for classification decision',
              },
              sentiment: {
                type: 'string',
                enum: ['positive', 'neutral', 'negative', 'highly_negative'],
                description: 'Customer sentiment',
              },
              urgencySignals: {
                type: 'array',
                items: { type: 'string' },
                description: 'Detected urgency indicators',
              },
              suggestedTags: {
                type: 'array',
                items: { type: 'string' },
                description: 'Tags to apply',
              },
              language: {
                type: 'string',
                description: 'Detected language code (2 letters)',
              },
              escalationRequired: {
                type: 'boolean',
                description: 'Whether immediate escalation is needed',
              },
              aiConfident: {
                type: 'boolean',
                description: 'Whether AI is confident enough to auto-respond',
              },
            },
            required: [
              'category',
              'priority',
              'confidence',
              'routeTo',
              'reasoning',
              'sentiment',
              'urgencySignals',
              'suggestedTags',
              'aiConfident',
            ],
          },
        },
      },
    ],
    tool_choice: { type: 'function', function: { name: 'classify_ticket' } },
  });

  const toolCall = response.choices[0]?.message?.tool_calls?.[0];
  if (!toolCall || toolCall.function.name !== 'classify_ticket') {
    throw new Error('Classification failed: no function call returned');
  }

  const rawResult = JSON.parse(toolCall.function.arguments);

  // Validate with Zod schema
  const validated = ClassificationSchema.parse(rawResult);

  // Merge pre-detected urgency signals with GPT-4o detected ones
  validated.urgencySignals = [...new Set([...urgencySignals, ...validated.urgencySignals])];

  // Apply default routing if not provided
  if (!validated.routeTo || validated.routeTo === 'unknown') {
    validated.routeTo = DEFAULT_ROUTING_RULES[validated.category] || DEFAULT_ROUTING_RULES.general;
  }

  return validated;
}

/**
 * Calculate SLA deadlines based on priority
 */
function calculateSLA(priority: TicketPriorityType): { responseDeadline: Date; resolutionDeadline: Date } {
  const now = new Date();
  const config = SLA_CONFIG[priority];

  return {
    responseDeadline: new Date(now.getTime() + config.responseHours * 60 * 60 * 1000),
    resolutionDeadline: new Date(now.getTime() + config.resolutionHours * 60 * 60 * 1000),
  };
}

/**
 * Store classification in Pinecone for future few-shot retrieval
 */
async function storeClassificationForLearning(
  data: ClassificationJobData,
  classification: Classification
): Promise<void> {
  try {
    const text = `${data.subject}\n${data.description}`;
    const embedding = await getEmbedding(text);

    await pineconeIndex.namespace(`${data.companyId}-tickets`).upsert([
      {
        id: `ticket-${data.ticketId}`,
        values: embedding,
        metadata: {
          ticketId: data.ticketId,
          subject: data.subject.slice(0, 200),
          category: classification.category,
          subCategory: classification.subCategory || '',
          priority: classification.priority,
          sentiment: classification.sentiment,
          routeTo: classification.routeTo,
          hasClassification: true,
          createdAt: new Date().toISOString(),
        },
      },
    ]);

    childLogger.debug({ ticketId: data.ticketId }, 'Classification stored in Pinecone');
  } catch (error) {
    childLogger.warn({ error, ticketId: data.ticketId }, 'Failed to store classification in Pinecone');
    // Non-blocking - don't fail the job
  }
}

/**
 * Process classification job
 */
async function processClassificationJob(job: Job<ClassificationJobData>): Promise<ClassificationResult> {
  const startTime = Date.now();
  const data = job.data;

  childLogger.info(
    { ticketId: data.ticketId, source: data.source, jobId: job.id },
    'Processing classification job'
  );

  try {
    // Fetch few-shot examples from Pinecone
    const { examples, ids } = await getFewShotExamples(
      data.companyId,
      data.subject,
      data.description
    );

    // Classify with GPT-4o
    const classification = await classifyTicket(data, examples);

    // Calculate SLA
    const sla = calculateSLA(classification.priority as TicketPriorityType);

    // Update ticket in MongoDB
    const updateData: Record<string, unknown> = {
      classification: {
        intent: classification.category,
        subIntent: classification.subCategory,
        confidence: classification.confidence,
        categories: [classification.category, classification.subCategory].filter(Boolean) as string[],
      },
      sentiment: classification.sentiment === 'highly_negative' ? 'negative' : classification.sentiment,
      priority: mapPriorityToTicketPriority(classification.priority as TicketPriorityType),
      assignedTo: classification.routeTo,
      'sla.responseDeadline': sla.responseDeadline,
      'sla.resolutionDeadline': sla.resolutionDeadline,
      $addToSet: { tags: { $each: classification.suggestedTags } },
    };

    // Handle escalation
    if (classification.escalationRequired) {
      updateData.escalation = {
        escalatedAt: new Date(),
        reason: classification.reasoning,
      };
      updateData.status = 'open';
    }

    await Ticket.findByIdAndUpdate(data.ticketId, updateData);

    // Store for future learning
    await storeClassificationForLearning(data, classification);

    // Enqueue response generation if AI is confident
    if (classification.aiConfident && classification.confidence > 0.75) {
      // Fetch customer card for personalized response
      const customerCard = await buildCustomerCard(
        {
          email: data.customerEmail,
          phone: data.customerPhone,
          customerId: data.customerId,
        },
        data.companyId
      );

      await responseQueue.add(
        `response-${data.ticketId}`,
        {
          ticketId: data.ticketId,
          companyId: data.companyId,
          subject: data.subject,
          description: data.description,
          classification,
          customerCard: customerCard
            ? {
                name: customerCard.name,
                tier: customerCard.tier,
                preferredStyle: customerCard.preferredStyle,
                verbosity: customerCard.verbosity,
              }
            : undefined,
          language: classification.language || 'en',
        },
        { priority: classification.priority === 'P1' ? 1 : classification.priority === 'P2' ? 2 : 3 }
      );

      childLogger.info(
        { ticketId: data.ticketId, priority: classification.priority },
        'Response generation enqueued'
      );
    }

    const processingTimeMs = Date.now() - startTime;

    childLogger.info(
      {
        ticketId: data.ticketId,
        category: classification.category,
        priority: classification.priority,
        confidence: classification.confidence,
        processingTimeMs,
      },
      'Classification completed'
    );

    // Emit activity event
    await emitTicketClassified(
      data.companyId,
      data.ticketId,
      classification.intent || 'Unknown',
      classification.priority || 'P3'
    );

    return {
      ticketId: data.ticketId,
      classification,
      fewShotExampleIds: ids,
      processingTimeMs,
    };
  } catch (error) {
    childLogger.error(
      { error, ticketId: data.ticketId, jobId: job.id },
      'Classification job failed'
    );
    throw error;
  }
}

/**
 * Map P1-P4 priority to ticket priority enum
 */
function mapPriorityToTicketPriority(priority: TicketPriorityType): 'low' | 'normal' | 'high' | 'urgent' {
  const map: Record<TicketPriorityType, 'low' | 'normal' | 'high' | 'urgent'> = {
    P1: 'urgent',
    P2: 'high',
    P3: 'normal',
    P4: 'low',
  };
  return map[priority];
}

/**
 * Create and start the classification worker
 */
export function createClassificationWorker(): Worker<ClassificationJobData, ClassificationResult> {
  const worker = new Worker<ClassificationJobData, ClassificationResult>(
    QUEUES.CLASSIFICATION,
    processClassificationJob,
    {
      connection: connectionOptions,
      concurrency: 5,
      limiter: {
        max: 100,
        duration: 60000, // 100 jobs per minute
      },
    }
  );

  worker.on('completed', (job, result) => {
    childLogger.info(
      {
        jobId: job.id,
        ticketId: result.ticketId,
        processingTimeMs: result.processingTimeMs,
      },
      'Classification job completed'
    );
  });

  worker.on('failed', (job, error) => {
    childLogger.error(
      {
        jobId: job?.id,
        ticketId: job?.data.ticketId,
        error: error.message,
      },
      'Classification job failed'
    );
  });

  worker.on('error', (error) => {
    childLogger.error({ error }, 'Classification worker error');
  });

  childLogger.info('Classification worker started');
  return worker;
}

// Export for testing
export { processClassificationJob, classifyTicket, getFewShotExamples, detectUrgencySignals };
