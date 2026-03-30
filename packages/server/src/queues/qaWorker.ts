import { Worker, Job } from 'bullmq';
import { z } from 'zod';
import OpenAI from 'openai';
import mongoose from 'mongoose';
import { env } from '../config/env.js';
import { QUEUES, REDIS_TTL } from '../config/constants.js';
import { logger } from '../config/logger.js';
import { redis, buildRedisKey } from '../config/redis.js';
import { CallSession } from '../models/CallSession.js';
import { Ticket } from '../models/Ticket.js';
import { QAReport, type QADimensionScore } from '../models/QAReport.js';
import { QARubric, DEFAULT_QA_RUBRIC, type IQARubricDimension } from '../models/QARubric.js';
import { updateAgentMetrics } from '../services/agentPerformance.js';

const childLogger = logger.child({ worker: 'qa-scoring' });

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

// Job payload schema
const QAJobDataSchema = z.object({
  interactionId: z.string(),
  companyId: z.string(),
  channel: z.enum(['voice', 'text']),
});

export type QAJobData = z.infer<typeof QAJobDataSchema>;

// GPT-4o output schema — built dynamically from rubric dimensions
function buildOutputSchema(dimensions: IQARubricDimension[]) {
  const shape: Record<string, z.ZodTypeAny> = {};
  for (const dim of dimensions) {
    shape[dim.key] = z.object({
      score: z.number().min(0).max(10),
      reasoning: z.string(),
    });
  }
  return z.object(shape);
}

type DimensionScoreMap = Record<string, { score: number; reasoning: string }>;

// Socket.IO instance (set during server startup)
let socketIO: { to: (room: string) => { emit: (event: string, data: unknown) => void } } | null = null;

/**
 * Set Socket.IO instance for emitting events
 */
export function setQASocketIO(io: typeof socketIO): void {
  socketIO = io;
}

/**
 * Fetch QA rubric for a company with Redis caching.
 * Priority: Redis cache → MongoDB QARubric collection → DEFAULT_QA_RUBRIC
 */
async function fetchQARubric(companyId: string): Promise<IQARubricDimension[]> {
  const cacheKey = buildRedisKey(companyId, 'qa', 'rubric');

  // 1. Check Redis cache
  try {
    const cached = await redis.get(cacheKey);
    if (cached) {
      childLogger.debug({ companyId }, 'QA rubric loaded from cache');
      return JSON.parse(cached) as IQARubricDimension[];
    }
  } catch (error) {
    childLogger.warn({ error, companyId }, 'Failed to read rubric from Redis cache');
  }

  // 2. Check MongoDB
  const rubricDoc = await QARubric.findOne({
    companyId: new mongoose.Types.ObjectId(companyId),
  }).lean();

  const dimensions: IQARubricDimension[] = rubricDoc?.dimensions ?? DEFAULT_QA_RUBRIC;

  // 3. Cache and return
  try {
    await redis.set(cacheKey, JSON.stringify(dimensions), 'EX', REDIS_TTL.QA_RUBRIC_CACHE);
  } catch (error) {
    childLogger.warn({ error, companyId }, 'Failed to cache rubric in Redis');
  }

  childLogger.info(
    { companyId, source: rubricDoc ? 'mongodb' : 'default' },
    'QA rubric loaded'
  );

  return dimensions;
}

/**
 * Build transcript from voice call turns
 */
function buildVoiceTranscript(turns: Array<{ role: string; content: string }>): string {
  return turns
    .filter((t) => t.role === 'user' || t.role === 'assistant')
    .map((t) => `[${t.role.toUpperCase()}]: ${t.content}`)
    .join('\n\n');
}

/**
 * Build transcript from ticket messages
 */
function buildTextTranscript(
  subject: string,
  description: string,
  messages: Array<{ sender: string; content: string }>
): string {
  let transcript = `SUBJECT: ${subject}\n\nINITIAL MESSAGE:\n${description}\n\n`;

  if (messages && messages.length > 0) {
    transcript += 'CONVERSATION:\n';
    transcript += messages.map((m) => `[${m.sender.toUpperCase()}]: ${m.content}`).join('\n\n');
  }

  return transcript;
}

/**
 * Build dynamic system prompt from rubric dimensions
 */
function buildSystemPrompt(dimensions: IQARubricDimension[]): string {
  const rubricBlock = dimensions
    .map((d) => `${d.key}: ${d.scoringGuide}`)
    .join('\n');

  const dimensionKeys = dimensions.map((d) => d.key);
  const jsonExample = dimensionKeys
    .map((key) => `  "${key}": { "score": <number>, "reasoning": "<string max 15 words>" }`)
    .join(',\n');

  return `Score this customer support interaction on each dimension.
Rubric:
${rubricBlock}
For each dimension return: score (0-10) and reasoning (max 15 words).
Return ONLY JSON:
{
${jsonExample}
}`;
}

/**
 * Evaluate interaction using GPT-4o with dynamic rubric
 */
async function evaluateWithGPT(
  channel: string,
  transcript: string,
  dimensions: IQARubricDimension[]
): Promise<DimensionScoreMap> {
  const systemPrompt = buildSystemPrompt(dimensions);

  const response = await openai.chat.completions.create({
    model: 'gpt-4o',
    temperature: 0,
    response_format: { type: 'json_object' },
    messages: [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: `Channel: ${channel}\n\nTranscript:\n${transcript}` },
    ],
  });

  const content = response.choices[0]?.message?.content;
  if (!content) {
    throw new Error('Empty response from GPT-4o');
  }

  const parsed = JSON.parse(content);
  const schema = buildOutputSchema(dimensions);
  return schema.parse(parsed) as DimensionScoreMap;
}

/**
 * Calculate weighted overall score from dynamic dimensions
 */
function calculateOverallScore(
  scores: DimensionScoreMap,
  dimensions: IQARubricDimension[]
): number {
  let overall = 0;
  for (const dim of dimensions) {
    const dimScore = scores[dim.key];
    if (dimScore) {
      overall += dimScore.score * dim.weight;
    }
  }
  // Convert from 0-10 to 0-100 scale
  return Math.round(overall * 10);
}

/**
 * Identify flagged dimensions (score < minPassScore)
 */
function identifyFlaggedDimensions(
  scores: DimensionScoreMap,
  dimensions: IQARubricDimension[]
): string[] {
  const flagged: string[] = [];
  for (const dim of dimensions) {
    const dimScore = scores[dim.key];
    if (dimScore && dimScore.score < dim.minPassScore) {
      flagged.push(dim.key);
    }
  }
  return flagged;
}

/**
 * Build dimension scores record with weights for QAReport storage
 */
function buildDimensionScores(
  scores: DimensionScoreMap,
  dimensions: IQARubricDimension[]
): Record<string, QADimensionScore> {
  const result: Record<string, QADimensionScore> = {};
  for (const dim of dimensions) {
    const dimScore = scores[dim.key];
    if (dimScore) {
      result[dim.key] = {
        score: dimScore.score,
        reasoning: dimScore.reasoning,
        weight: dim.weight,
      };
    }
  }
  return result;
}

/**
 * Extract agent ID from interaction depending on channel
 */
async function extractAgentId(
  channel: 'voice' | 'text',
  interactionId: string,
  companyId: string
): Promise<string | null> {
  if (channel === 'text') {
    const ticket = await Ticket.findOne({
      _id: interactionId,
      companyId,
    })
      .select('assignedTo')
      .lean();
    return ticket?.assignedTo || null;
  }
  // Voice channel: no direct agent assignment in standard flow
  return null;
}

/**
 * Process QA scoring job
 */
async function processQAJob(job: Job<QAJobData>): Promise<void> {
  const { interactionId, companyId, channel } = job.data;

  childLogger.info({ interactionId, companyId, channel, jobId: job.id }, 'Processing QA job');

  // Step a: Fetch interaction-specific QA rubric (Redis-cached)
  const dimensions = await fetchQARubric(companyId);

  // Step b: Fetch transcript
  let transcript: string;

  if (channel === 'voice') {
    const session = await CallSession.findOne({
      callId: interactionId,
      companyId,
    })
      .select('turns')
      .lean();

    if (!session) {
      throw new Error(`CallSession not found: ${interactionId}`);
    }

    transcript = buildVoiceTranscript(session.turns);
  } else {
    const ticket = await Ticket.findOne({
      _id: interactionId,
      companyId,
    })
      .select('subject description messages')
      .lean();

    if (!ticket) {
      throw new Error(`Ticket not found: ${interactionId}`);
    }

    transcript = buildTextTranscript(
      ticket.subject,
      ticket.description || '',
      ticket.messages || []
    );
  }

  if (!transcript || transcript.length < 20) {
    throw new Error('Insufficient content for QA evaluation');
  }

  // Step c: GPT-4o evaluation with dynamic rubric
  const scores = await evaluateWithGPT(channel, transcript, dimensions);

  // Step d: Calculate weighted overall score
  const overallScore = calculateOverallScore(scores, dimensions);

  // Step e: Identify flagged dimensions
  const flaggedDimensions = identifyFlaggedDimensions(scores, dimensions);
  const flaggedForReview = flaggedDimensions.length > 0;

  // Build dimension scores with weights
  const dimensionScores = buildDimensionScores(scores, dimensions);

  // Step f: Create QAReport in MongoDB
  const companyObjectId = new mongoose.Types.ObjectId(companyId);

  const qaReport = await QAReport.findOneAndUpdate(
    { companyId: companyObjectId, interactionId },
    {
      companyId: companyObjectId,
      interactionId,
      channel,
      overallScore,
      dimensions: dimensionScores,
      flaggedForReview,
      flaggedDimensions,
    },
    { upsert: true, new: true }
  );

  // Step g: Update CallSession or Ticket with qaScore
  if (channel === 'voice') {
    await CallSession.findOneAndUpdate(
      { callId: interactionId, companyId },
      { qaScore: overallScore }
    );
  } else {
    await Ticket.findByIdAndUpdate(interactionId, { qaScore: overallScore });
  }

  // Step h: Update agent performance aggregation
  const agentId = await extractAgentId(channel, interactionId, companyId);
  if (agentId) {
    await updateAgentMetrics(agentId, companyId, overallScore, interactionId, channel);
  }

  // Emit Socket.io alert to supervisors
  if (socketIO) {
    socketIO.to(`company:${companyId}:supervisors`).emit('qa:scored', {
      interactionId,
      overallScore,
      flaggedForReview,
      flaggedDimensions,
      channel,
      reportId: qaReport._id.toString(),
    });
  }

  childLogger.info(
    {
      interactionId,
      companyId,
      channel,
      overallScore,
      flaggedForReview,
      flaggedDimensions,
      agentId,
    },
    'QA scoring completed'
  );
}

// Create worker
const qaWorker = new Worker<QAJobData>(QUEUES.QA, processQAJob, {
  connection: connectionOptions,
  concurrency: 5,
  limiter: {
    max: 10,
    duration: 1000,
  },
});

// Worker event handlers
qaWorker.on('completed', (job) => {
  childLogger.debug({ jobId: job.id }, 'QA job completed');
});

qaWorker.on('failed', (job, err) => {
  childLogger.error(
    {
      jobId: job?.id,
      error: err.message,
      data: job?.data,
    },
    'QA job failed'
  );
});

qaWorker.on('error', (err) => {
  childLogger.error({ error: err.message }, 'QA worker error');
});

export { qaWorker };
export default qaWorker;
