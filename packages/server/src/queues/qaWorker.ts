import { Worker, Job } from 'bullmq';
import { z } from 'zod';
import OpenAI from 'openai';
import mongoose from 'mongoose';
import { env } from '../config/env.js';
import { QUEUES } from '../config/constants.js';
import { logger } from '../config/logger.js';
import { Company, type QARubric } from '../models/Company.js';
import { CallSession } from '../models/CallSession.js';
import { Ticket } from '../models/Ticket.js';
import { QAReport, type QADimensionScore } from '../models/QAReport.js';

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

// GPT-4o output schema
const QARubricOutputSchema = z.object({
  intentUnderstanding: z.object({
    score: z.number().min(0).max(10),
    reasoning: z.string(),
  }),
  responseAccuracy: z.object({
    score: z.number().min(0).max(10),
    reasoning: z.string(),
  }),
  resolutionSuccess: z.object({
    score: z.number().min(0).max(10),
    reasoning: z.string(),
  }),
  escalationCorrectness: z.object({
    score: z.number().min(0).max(10),
    reasoning: z.string(),
  }),
  customerExperience: z.object({
    score: z.number().min(0).max(10),
    reasoning: z.string(),
  }),
});

type QARubricOutput = z.infer<typeof QARubricOutputSchema>;

// Default QA rubric thresholds
const DEFAULT_RUBRIC: QARubric = {
  intentUnderstanding: { minPassScore: 6, weight: 0.20 },
  responseAccuracy: { minPassScore: 7, weight: 0.25 },
  resolutionSuccess: { minPassScore: 6, weight: 0.25 },
  escalationCorrectness: { minPassScore: 7, weight: 0.15 },
  customerExperience: { minPassScore: 6, weight: 0.15 },
};

// System prompt for QA evaluation
const QA_SYSTEM_PROMPT = `You are a customer support quality analyst. Score this interaction on 5 dimensions.

For each dimension, provide:
- score: 0-10 (where 0 is terrible, 5 is acceptable, 10 is excellent)
- reasoning: 1 sentence explaining the score

Dimensions to evaluate:
1. intentUnderstanding: Did the AI correctly identify what the customer wanted?
2. responseAccuracy: Was the information provided accurate and relevant?
3. resolutionSuccess: Was the customer's issue actually resolved?
4. escalationCorrectness: Was escalation handled appropriately (escalated when needed, not escalated unnecessarily)?
5. customerExperience: Was the overall interaction professional, empathetic, and efficient?

Return ONLY valid JSON matching this exact structure:
{
  "intentUnderstanding": { "score": <number>, "reasoning": "<string>" },
  "responseAccuracy": { "score": <number>, "reasoning": "<string>" },
  "resolutionSuccess": { "score": <number>, "reasoning": "<string>" },
  "escalationCorrectness": { "score": <number>, "reasoning": "<string>" },
  "customerExperience": { "score": <number>, "reasoning": "<string>" }
}`;

// Socket.IO instance (set during server startup)
let socketIO: { to: (room: string) => { emit: (event: string, data: unknown) => void } } | null = null;

/**
 * Set Socket.IO instance for emitting events
 */
export function setQASocketIO(io: typeof socketIO): void {
  socketIO = io;
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
 * Evaluate interaction using GPT-4o
 */
async function evaluateWithGPT(channel: string, transcript: string): Promise<QARubricOutput> {
  const response = await openai.chat.completions.create({
    model: 'gpt-4o',
    temperature: 0,
    response_format: { type: 'json_object' },
    messages: [
      { role: 'system', content: QA_SYSTEM_PROMPT },
      { role: 'user', content: `Channel: ${channel}\n\nTranscript:\n${transcript}` },
    ],
  });

  const content = response.choices[0]?.message?.content;
  if (!content) {
    throw new Error('Empty response from GPT-4o');
  }

  const parsed = JSON.parse(content);
  return QARubricOutputSchema.parse(parsed);
}

/**
 * Calculate weighted overall score
 */
function calculateOverallScore(scores: QARubricOutput, rubric: QARubric): number {
  const overall =
    scores.intentUnderstanding.score * rubric.intentUnderstanding.weight +
    scores.responseAccuracy.score * rubric.responseAccuracy.weight +
    scores.resolutionSuccess.score * rubric.resolutionSuccess.weight +
    scores.escalationCorrectness.score * rubric.escalationCorrectness.weight +
    scores.customerExperience.score * rubric.customerExperience.weight;

  // Convert from 0-10 to 0-100 scale
  return Math.round(overall * 10);
}

/**
 * Identify flagged dimensions (below minPassScore)
 */
function identifyFlaggedDimensions(scores: QARubricOutput, rubric: QARubric): string[] {
  const flagged: string[] = [];

  if (scores.intentUnderstanding.score < rubric.intentUnderstanding.minPassScore) {
    flagged.push('intentUnderstanding');
  }
  if (scores.responseAccuracy.score < rubric.responseAccuracy.minPassScore) {
    flagged.push('responseAccuracy');
  }
  if (scores.resolutionSuccess.score < rubric.resolutionSuccess.minPassScore) {
    flagged.push('resolutionSuccess');
  }
  if (scores.escalationCorrectness.score < rubric.escalationCorrectness.minPassScore) {
    flagged.push('escalationCorrectness');
  }
  if (scores.customerExperience.score < rubric.customerExperience.minPassScore) {
    flagged.push('customerExperience');
  }

  return flagged;
}

/**
 * Build dimension scores with weights
 */
function buildDimensionScores(
  scores: QARubricOutput,
  rubric: QARubric
): Record<string, QADimensionScore> {
  return {
    intentUnderstanding: {
      score: scores.intentUnderstanding.score,
      reasoning: scores.intentUnderstanding.reasoning,
      weight: rubric.intentUnderstanding.weight,
    },
    responseAccuracy: {
      score: scores.responseAccuracy.score,
      reasoning: scores.responseAccuracy.reasoning,
      weight: rubric.responseAccuracy.weight,
    },
    resolutionSuccess: {
      score: scores.resolutionSuccess.score,
      reasoning: scores.resolutionSuccess.reasoning,
      weight: rubric.resolutionSuccess.weight,
    },
    escalationCorrectness: {
      score: scores.escalationCorrectness.score,
      reasoning: scores.escalationCorrectness.reasoning,
      weight: rubric.escalationCorrectness.weight,
    },
    customerExperience: {
      score: scores.customerExperience.score,
      reasoning: scores.customerExperience.reasoning,
      weight: rubric.customerExperience.weight,
    },
  };
}

/**
 * Process QA scoring job
 */
async function processQAJob(job: Job<QAJobData>): Promise<void> {
  const { interactionId, companyId, channel } = job.data;

  childLogger.info({ interactionId, companyId, channel, jobId: job.id }, 'Processing QA job');

  // Step a: Fetch company QA rubric config
  const company = await Company.findById(companyId).select('qaRubric').lean();
  if (!company) {
    throw new Error(`Company not found: ${companyId}`);
  }

  const rubric: QARubric = company.qaRubric || DEFAULT_RUBRIC;

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

  // Step c-f: GPT-4o evaluation with Zod validation
  const scores = await evaluateWithGPT(channel, transcript);

  // Step g: Calculate weighted overall score
  const overallScore = calculateOverallScore(scores, rubric);

  // Step h: Identify flagged dimensions
  const flaggedDimensions = identifyFlaggedDimensions(scores, rubric);
  const flaggedForReview = flaggedDimensions.length > 0;

  // Build dimension scores with weights
  const dimensions = buildDimensionScores(scores, rubric);

  // Step i: Create QAReport in MongoDB
  const companyObjectId = new mongoose.Types.ObjectId(companyId);

  const qaReport = await QAReport.findOneAndUpdate(
    { companyId: companyObjectId, interactionId },
    {
      companyId: companyObjectId,
      interactionId,
      channel,
      overallScore,
      dimensions,
      flaggedForReview,
      flaggedDimensions,
    },
    { upsert: true, new: true }
  );

  // Step j: Update CallSession or Ticket with qaScore
  if (channel === 'voice') {
    await CallSession.findOneAndUpdate(
      { callId: interactionId, companyId },
      { qaScore: overallScore }
    );
  } else {
    await Ticket.findByIdAndUpdate(interactionId, { qaScore: overallScore });
  }

  // Step k-l: If flagged, emit Socket.io alert to supervisors
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
