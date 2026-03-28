import OpenAI from 'openai';
import mongoose from 'mongoose';
import { env } from '../config/env.js';
import { redis, buildRedisKey } from '../config/redis.js';
import { logger } from '../config/logger.js';
import { OPENAI_CONFIG } from '../config/constants.js';
import { Customer } from '../models/Customer.js';
import type { SentimentLabel } from '../config/constants.js';

const childLogger = logger.child({ service: 'sentiment' });
const openai = new OpenAI({ apiKey: env.OPENAI_API_KEY });

// AssemblyAI API
const ASSEMBLYAI_API_BASE = 'https://api.assemblyai.com/v2';

// Sentiment types
export interface SentimentResult {
  label: 'positive' | 'neutral' | 'negative' | 'highly_negative';
  score: number;
  shouldEscalate: boolean;
  reason: string;
}

export interface FusedSentiment {
  label: 'positive' | 'neutral' | 'negative' | 'highly_negative';
  score: number;
  shouldEscalate: boolean;
  textScore: number;
  acousticScore: number;
  reason: string;
}

export interface SentimentTimelineEntry {
  date: Date;
  score: number;
  channel: 'voice' | 'email' | 'chat';
}

export interface ChurnRiskResult {
  score: number;
  timeline: SentimentTimelineEntry[];
  channelBreakdown: {
    voice: { avg: number; count: number };
    text: { avg: number; count: number };
  };
  contactFrequency: number;
}

// Threat and urgency detection patterns
const THREAT_PATTERNS = [
  /\b(lawyer|attorney|sue|lawsuit|legal action)\b/i,
  /\b(cancel|canceling|cancellation).*(subscription|account|service)\b/i,
  /\b(report|complaint).*(bbb|better business|consumer|ftc)\b/i,
  /\b(going to|will|shall).*(media|twitter|facebook|social|post|review)\b/i,
  /\b(worst|terrible|horrible|disgusting|unacceptable)\b/i,
];

const URGENCY_PATTERNS = [
  /\b(urgent|urgently|emergency|asap|immediately|right now)\b/i,
  /\b(critical|life|death|health|safety)\b/i,
  /\b(cannot wait|can't wait|need now|need today)\b/i,
];

/**
 * Analyze text sentiment using GPT-4o
 */
export async function analyzeTextSentiment(text: string): Promise<SentimentResult> {
  try {
    // Check for explicit threats/urgency first
    const hasThreat = THREAT_PATTERNS.some((pattern) => pattern.test(text));
    const hasUrgency = URGENCY_PATTERNS.some((pattern) => pattern.test(text));

    const response = await openai.chat.completions.create({
      model: OPENAI_CONFIG.MODEL,
      temperature: 0,
      response_format: { type: 'json_object' },
      messages: [
        {
          role: 'system',
          content: `You are a sentiment analysis expert. Analyze the customer message and return a JSON object with:
- label: one of "positive", "neutral", "negative", or "highly_negative"
- score: a number from 0 to 1 where 0 is very positive and 1 is very negative
- reason: a brief explanation (max 50 words)

Consider factors like:
- Emotional tone and language intensity
- Explicit expressions of frustration or anger
- Threats to leave, escalate, or take legal action
- Urgency indicators
- Profanity or aggressive language

Return only valid JSON.`,
        },
        {
          role: 'user',
          content: text.slice(0, 4000),
        },
      ],
      max_tokens: 200,
    });

    const content = response.choices[0]?.message?.content;
    if (!content) {
      throw new Error('Empty response from sentiment analysis');
    }

    const result = JSON.parse(content) as {
      label: SentimentResult['label'];
      score: number;
      reason: string;
    };

    // Determine if escalation is needed
    const shouldEscalate =
      result.score > 0.8 ||
      result.label === 'highly_negative' ||
      hasThreat ||
      hasUrgency;

    const escalationReason = shouldEscalate
      ? hasThreat
        ? 'Customer made threats or mentioned legal action'
        : hasUrgency
        ? 'Customer expressed urgent needs'
        : result.score > 0.8
        ? 'Highly negative sentiment detected'
        : result.reason
      : '';

    return {
      label: result.label,
      score: result.score,
      shouldEscalate,
      reason: shouldEscalate ? escalationReason : result.reason,
    };
  } catch (error) {
    childLogger.error({ error }, 'Failed to analyze text sentiment');
    return {
      label: 'neutral',
      score: 0.5,
      shouldEscalate: false,
      reason: 'Unable to analyze sentiment',
    };
  }
}

/**
 * Analyze acoustic sentiment from audio using AssemblyAI
 * Returns avg valence (0-1, 1 = most negative)
 */
export async function analyzeAcousticSentiment(audioUrl: string): Promise<number> {
  try {
    // Start transcription with sentiment analysis
    const transcriptResponse = await fetch(`${ASSEMBLYAI_API_BASE}/transcript`, {
      method: 'POST',
      headers: {
        'Authorization': env.ASSEMBLYAI_API_KEY,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        audio_url: audioUrl,
        sentiment_analysis: true,
      }),
    });

    if (!transcriptResponse.ok) {
      throw new Error(`AssemblyAI request failed: ${transcriptResponse.status}`);
    }

    const transcriptData = await transcriptResponse.json() as { id: string };
    const transcriptId = transcriptData.id;

    // Poll for completion (max 10 seconds)
    const startTime = Date.now();
    const timeout = 10000;

    while (Date.now() - startTime < timeout) {
      const statusResponse = await fetch(`${ASSEMBLYAI_API_BASE}/transcript/${transcriptId}`, {
        headers: {
          'Authorization': env.ASSEMBLYAI_API_KEY,
        },
      });

      const statusData = await statusResponse.json() as {
        status: string;
        sentiment_analysis_results?: Array<{
          sentiment: 'POSITIVE' | 'NEUTRAL' | 'NEGATIVE';
          confidence: number;
        }>;
      };

      if (statusData.status === 'completed') {
        // Calculate average valence from sentiment results
        const results = statusData.sentiment_analysis_results || [];
        if (results.length === 0) return 0.5;

        let totalScore = 0;
        for (const result of results) {
          // Convert sentiment to score (0 = positive, 0.5 = neutral, 1 = negative)
          const score =
            result.sentiment === 'POSITIVE'
              ? 0.2
              : result.sentiment === 'NEUTRAL'
              ? 0.5
              : 0.8;
          totalScore += score * result.confidence;
        }

        return totalScore / results.length;
      }

      if (statusData.status === 'error') {
        throw new Error('AssemblyAI transcription failed');
      }

      // Wait before polling again
      await new Promise((resolve) => setTimeout(resolve, 1000));
    }

    // Timeout - return neutral
    childLogger.warn({ transcriptId }, 'Acoustic sentiment analysis timed out');
    return 0.5;
  } catch (error) {
    childLogger.error({ error, audioUrl }, 'Failed to analyze acoustic sentiment');
    return 0.5;
  }
}

/**
 * Fuse text and acoustic sentiment results
 */
export function fuseSentiment(
  textResult: SentimentResult,
  acousticScore: number
): FusedSentiment {
  // Weighted fusion: 60% text, 40% acoustic
  const fusedScore = textResult.score * 0.6 + acousticScore * 0.4;

  // Determine label based on fused score
  let label: FusedSentiment['label'];
  if (fusedScore < 0.25) {
    label = 'positive';
  } else if (fusedScore < 0.5) {
    label = 'neutral';
  } else if (fusedScore < 0.75) {
    label = 'negative';
  } else {
    label = 'highly_negative';
  }

  // Escalate if fused score > 0.75 OR text analysis flagged for escalation
  const shouldEscalate = fusedScore > 0.75 || textResult.shouldEscalate;

  return {
    label,
    score: fusedScore,
    shouldEscalate,
    textScore: textResult.score,
    acousticScore,
    reason: shouldEscalate
      ? fusedScore > 0.75
        ? 'High combined negative sentiment'
        : textResult.reason
      : textResult.reason,
  };
}

/**
 * Record sentiment to customer timeline
 */
export async function recordSentiment(
  customerId: string,
  companyId: string,
  score: number,
  channel: 'voice' | 'email' | 'chat'
): Promise<void> {
  try {
    const now = new Date();
    const entry: SentimentTimelineEntry = {
      date: now,
      score,
      channel,
    };

    // Update MongoDB - push to sentimentTimeline, keep last 90 entries
    await Customer.findByIdAndUpdate(customerId, {
      $push: {
        sentimentTimeline: {
          $each: [entry],
          $slice: -90, // Keep last 90 entries
        },
      },
      $set: {
        lastContactAt: now,
      },
      $inc: {
        totalInteractions: 1,
      },
    });

    // Store in Redis sorted set for quick time-series queries
    const redisKey = buildRedisKey(companyId, 'sentiment', customerId);
    const timestamp = now.getTime();
    const member = JSON.stringify({ score, channel, timestamp });
    
    await redis.zadd(redisKey, timestamp, member);
    
    // Expire old entries (keep 90 days)
    const cutoff = Date.now() - 90 * 24 * 60 * 60 * 1000;
    await redis.zremrangebyscore(redisKey, '-inf', cutoff);

    childLogger.debug({ customerId, companyId, score, channel }, 'Sentiment recorded');
  } catch (error) {
    childLogger.error({ error, customerId, companyId }, 'Failed to record sentiment');
  }
}

/**
 * Calculate churn risk score for a customer
 */
export async function getChurnRiskScore(
  customerId: string,
  companyId: string
): Promise<ChurnRiskResult> {
  try {
    const customer = await Customer.findById(customerId).lean();
    if (!customer) {
      throw new Error('Customer not found');
    }

    // Get last 7 days of sentiment data from Redis
    const redisKey = buildRedisKey(companyId, 'sentiment', customerId);
    const sevenDaysAgo = Date.now() - 7 * 24 * 60 * 60 * 1000;
    const entries = await redis.zrangebyscore(redisKey, sevenDaysAgo, '+inf');

    const timeline: SentimentTimelineEntry[] = [];
    const channelScores: {
      voice: number[];
      text: number[];
    } = { voice: [], text: [] };

    for (const entry of entries) {
      const parsed = JSON.parse(entry) as {
        score: number;
        channel: 'voice' | 'email' | 'chat';
        timestamp: number;
      };

      timeline.push({
        date: new Date(parsed.timestamp),
        score: parsed.score,
        channel: parsed.channel,
      });

      if (parsed.channel === 'voice') {
        channelScores.voice.push(parsed.score);
      } else {
        channelScores.text.push(parsed.score);
      }
    }

    // Calculate averages
    const voiceAvg =
      channelScores.voice.length > 0
        ? channelScores.voice.reduce((a, b) => a + b, 0) / channelScores.voice.length
        : 0.5;
    const textAvg =
      channelScores.text.length > 0
        ? channelScores.text.reduce((a, b) => a + b, 0) / channelScores.text.length
        : 0.5;

    // Contact frequency factor (more contacts in 7 days = higher risk if negative)
    const contactFrequency = timeline.length;
    const frequencyFactor = Math.min(contactFrequency / 10, 1);

    // Churn risk formula
    // Higher scores = more negative = higher churn risk
    const churnScore = voiceAvg * 0.4 + textAvg * 0.4 + frequencyFactor * 0.2;

    // Update customer record
    await Customer.findByIdAndUpdate(customerId, {
      churnRiskScore: churnScore,
      avgSentiment: churnScore < 0.4 ? 'positive' : churnScore < 0.65 ? 'neutral' : 'negative',
    });

    return {
      score: churnScore,
      timeline,
      channelBreakdown: {
        voice: { avg: voiceAvg, count: channelScores.voice.length },
        text: { avg: textAvg, count: channelScores.text.length },
      },
      contactFrequency,
    };
  } catch (error) {
    childLogger.error({ error, customerId, companyId }, 'Failed to calculate churn risk');
    return {
      score: 0,
      timeline: [],
      channelBreakdown: {
        voice: { avg: 0.5, count: 0 },
        text: { avg: 0.5, count: 0 },
      },
      contactFrequency: 0,
    };
  }
}

/**
 * Get top at-risk customers for a company
 */
export async function getTopAtRiskCustomers(
  companyId: string,
  limit: number = 10
): Promise<Array<{
  customerId: string;
  name: string;
  email?: string;
  tier: string;
  churnRiskScore: number;
}>> {
  const customers = await Customer.find({
    companyId: new mongoose.Types.ObjectId(companyId),
    churnRiskScore: { $gt: 0.65 },
  })
    .sort({ churnRiskScore: -1 })
    .limit(limit)
    .select('name email tier churnRiskScore')
    .lean();

  return customers.map((c) => ({
    customerId: c._id.toString(),
    name: c.name || 'Unknown',
    email: c.email,
    tier: c.tier,
    churnRiskScore: c.churnRiskScore,
  }));
}
