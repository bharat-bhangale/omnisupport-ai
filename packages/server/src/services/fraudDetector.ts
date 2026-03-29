// ============================================================================
// FRAUD DETECTOR SERVICE
// ============================================================================
// Assesses call risk using phone reputation, velocity, and conversation analysis

import OpenAI from 'openai';
import twilio from 'twilio';
import { redis } from '../config/redis.js';
import { env } from '../config/env.js';
import { logger } from '../config/logger.js';
import { FraudIncident, Watchlist, type RiskLevel, type FraudAction } from '../models/FraudIncident.js';
import { getIO } from '../sockets/index.js';

// ============================================================================
// TYPES
// ============================================================================

export interface FraudAssessment {
  phoneReputationScore: number; // 0-1 (1=highest risk)
  velocityFlag: boolean;
  conversationScore: number; // 0-1
  compositeScore: number; // weighted fusion
  riskLevel: RiskLevel;
  signals: string[]; // human-readable risk signals
  shouldBlock: boolean; // compositeScore > 0.85
  shouldEscalate: boolean; // compositeScore > 0.65
}

interface CallSessionState {
  callId: string;
  companyId: string;
  callerPhone?: string;
  turns: Array<{ role: string; content: string; timestamp?: string }>;
  fraudScore?: number;
  isHighRisk?: boolean;
}

interface ConversationFraudResult {
  score: number;
  signals: string[];
}

// ============================================================================
// CLIENTS
// ============================================================================

const openai = new OpenAI({ apiKey: env.OPENAI_API_KEY });
const twilioClient = twilio(env.TWILIO_ACCOUNT_SID, env.TWILIO_AUTH_TOKEN);

// ============================================================================
// FRAUD DETECTOR
// ============================================================================

export const fraudDetector = {
  /**
   * Main assessment function - runs all checks in parallel
   */
  async assessCallRisk(callerPhone: string, companyId: string): Promise<FraudAssessment> {
    const cacheKey = `${companyId}:fraud:assess:${callerPhone}`;

    try {
      // Check cache first (1 hour TTL)
      const cached = await redis.get(cacheKey);
      if (cached) {
        return JSON.parse(cached);
      }

      // Run all checks in parallel
      const [phoneScore, velocityFlag, isWatchlisted] = await Promise.all([
        this.checkPhoneReputation(callerPhone),
        this.checkVelocity(callerPhone, companyId),
        this.checkWatchlist(callerPhone, companyId),
      ]);

      // If watchlisted, auto-block
      if (isWatchlisted) {
        const assessment: FraudAssessment = {
          phoneReputationScore: 1,
          velocityFlag: true,
          conversationScore: 0,
          compositeScore: 1,
          riskLevel: 'critical',
          signals: ['Phone number on blocklist'],
          shouldBlock: true,
          shouldEscalate: true,
        };
        await redis.setex(cacheKey, 3600, JSON.stringify(assessment));
        return assessment;
      }

      // Fuse scores (conversation score starts at 0, updated during call)
      const assessment = this.fuseScores(phoneScore.score, velocityFlag, 0, [
        ...phoneScore.signals,
        ...(velocityFlag ? ['High call velocity detected'] : []),
      ]);

      // Cache assessment
      await redis.setex(cacheKey, 3600, JSON.stringify(assessment));

      return assessment;
    } catch (error) {
      logger.error({ error, callerPhone }, 'Failed to assess call risk');
      // Return safe default
      return {
        phoneReputationScore: 0,
        velocityFlag: false,
        conversationScore: 0,
        compositeScore: 0,
        riskLevel: 'low',
        signals: [],
        shouldBlock: false,
        shouldEscalate: false,
      };
    }
  },

  /**
   * Check phone reputation via Twilio Lookup v2 + IPQualityScore
   */
  async checkPhoneReputation(phone: string): Promise<{ score: number; signals: string[] }> {
    const signals: string[] = [];
    let twilioScore = 0;
    let ipqsScore = 0;
    let validSources = 0;

    try {
      // Twilio Lookup v2
      const [twilioResult, ipqsResult] = await Promise.allSettled([
        this.twilioLookup(phone),
        this.ipqsLookup(phone),
      ]);

      if (twilioResult.status === 'fulfilled') {
        twilioScore = twilioResult.value.score;
        signals.push(...twilioResult.value.signals);
        validSources++;
      }

      if (ipqsResult.status === 'fulfilled') {
        ipqsScore = ipqsResult.value.score;
        signals.push(...ipqsResult.value.signals);
        validSources++;
      }

      // Average scores from available sources
      const avgScore = validSources > 0 ? (twilioScore + ipqsScore) / validSources : 0;

      return { score: Math.min(1, avgScore), signals };
    } catch (error) {
      logger.error({ error, phone }, 'Phone reputation check failed');
      return { score: 0, signals: [] };
    }
  },

  /**
   * Twilio Lookup v2 API call
   */
  async twilioLookup(phone: string): Promise<{ score: number; signals: string[] }> {
    const signals: string[] = [];
    let score = 0;

    try {
      const lookup = await twilioClient.lookups.v2
        .phoneNumbers(phone)
        .fetch({ fields: 'line_type_intelligence' });

      const lineType = lookup.lineTypeIntelligence;

      if (lineType) {
        const type = lineType.type?.toLowerCase() || '';
        const carrier = lineType.carrier_name?.toLowerCase() || '';

        // High risk: VoIP + prepaid combo
        if (type === 'voip' || type === 'virtual') {
          score += 0.4;
          signals.push('VoIP phone number');
        }

        if (type === 'prepaid' || carrier.includes('prepaid')) {
          score += 0.3;
          signals.push('Prepaid phone number');
        }

        // Additional checks
        if (type === 'toll_free') {
          score += 0.2;
          signals.push('Toll-free number (unusual for customer)');
        }
      }

      return { score: Math.min(1, score), signals };
    } catch (error) {
      logger.warn({ error, phone }, 'Twilio lookup failed');
      return { score: 0, signals: [] };
    }
  },

  /**
   * IPQualityScore API call
   */
  async ipqsLookup(phone: string): Promise<{ score: number; signals: string[] }> {
    const signals: string[] = [];

    if (!env.IPQUALITYSCORE_API_KEY) {
      return { score: 0, signals: [] };
    }

    try {
      const cleanPhone = phone.replace(/[^0-9+]/g, '');
      const url = `https://ipqualityscore.com/api/json/phone/${env.IPQUALITYSCORE_API_KEY}/${encodeURIComponent(cleanPhone)}`;

      const response = await fetch(url);
      const data = await response.json();

      if (!data.success) {
        return { score: 0, signals: [] };
      }

      let score = 0;

      // Fraud score (0-100)
      if (data.fraud_score > 75) {
        score += 0.6;
        signals.push(`High fraud score (${data.fraud_score})`);
      } else if (data.fraud_score > 50) {
        score += 0.3;
        signals.push(`Elevated fraud score (${data.fraud_score})`);
      }

      // Recent abuse
      if (data.recent_abuse) {
        score += 0.3;
        signals.push('Recent abuse reported');
      }

      // VOIP
      if (data.VOIP) {
        score += 0.2;
        signals.push('VoIP number detected');
      }

      // Leaked
      if (data.leaked) {
        score += 0.1;
        signals.push('Number found in data leaks');
      }

      // Risky
      if (data.risky) {
        score += 0.2;
        signals.push('Number flagged as risky');
      }

      return { score: Math.min(1, score), signals };
    } catch (error) {
      logger.warn({ error, phone }, 'IPQualityScore lookup failed');
      return { score: 0, signals: [] };
    }
  },

  /**
   * Check call velocity using Redis sliding window
   */
  async checkVelocity(phone: string, companyId: string): Promise<boolean> {
    try {
      const now = Date.now();
      const hourBucket = Math.floor(now / (60 * 60 * 1000));
      const minuteBucket = Math.floor(now / (60 * 1000));

      const hourKey = `${companyId}:velocity:hour:${phone}:${hourBucket}`;
      const minuteKey = `${companyId}:velocity:min:${phone}:${minuteBucket}`;

      // Increment counters
      const [hourCount, minuteCount] = await Promise.all([
        redis.incr(hourKey),
        redis.incr(minuteKey),
      ]);

      // Set expiry on first increment
      if (hourCount === 1) {
        await redis.expire(hourKey, 3600);
      }
      if (minuteCount === 1) {
        await redis.expire(minuteKey, 60);
      }

      // Flag if > 10 calls per hour OR > 3 calls per minute
      return hourCount > 10 || minuteCount > 3;
    } catch (error) {
      logger.error({ error, phone }, 'Velocity check failed');
      return false;
    }
  },

  /**
   * Check if phone is on company blocklist
   */
  async checkWatchlist(phone: string, companyId: string): Promise<boolean> {
    try {
      const entry = await Watchlist.findOne({ companyId, phone });
      return !!entry;
    } catch (error) {
      logger.error({ error, phone }, 'Watchlist check failed');
      return false;
    }
  },

  /**
   * Analyze conversation for fraud indicators using GPT-4o
   */
  async analyzeConversationFraud(
    utterance: string,
    session: CallSessionState
  ): Promise<ConversationFraudResult> {
    try {
      // Get last 3 turns for context
      const recentTurns = session.turns.slice(-3);
      const context = recentTurns
        .map((t) => `${t.role}: ${t.content}`)
        .join('\n');

      const response = await openai.chat.completions.create({
        model: 'gpt-4o',
        temperature: 0,
        max_tokens: 100,
        response_format: { type: 'json_object' },
        messages: [
          {
            role: 'system',
            content: `Analyze this customer utterance for fraud indicators.
Known patterns: requesting gift cards/wire transfers, creating false urgency,
claiming to be employee or authority figure, requesting account bypass,
implausible refund amounts, threatening legal action for small amounts,
impersonating executives, social engineering attempts.
Return JSON: { "fraudScore": 0-1, "signals": ["signal1", "signal2"] }
Only include signals if fraud indicators are detected.`,
          },
          {
            role: 'user',
            content: `utterance: "${utterance}"\ncontext:\n${context}`,
          },
        ],
      });

      const content = response.choices[0]?.message?.content || '{}';
      const parsed = JSON.parse(content);

      return {
        score: Math.min(1, Math.max(0, parsed.fraudScore || 0)),
        signals: Array.isArray(parsed.signals) ? parsed.signals : [],
      };
    } catch (error) {
      logger.error({ error, callId: session.callId }, 'Conversation fraud analysis failed');
      return { score: 0, signals: [] };
    }
  },

  /**
   * Fuse all scores into composite assessment
   */
  fuseScores(
    phoneScore: number,
    velocityFlag: boolean,
    convScore: number,
    signals: string[]
  ): FraudAssessment {
    // Weighted fusion:
    // Phone reputation: 35%
    // Velocity flag: 30% (binary)
    // Conversation: 35%
    const composite =
      phoneScore * 0.35 +
      (velocityFlag ? 0.3 : 0) +
      convScore * 0.35;

    // Determine risk level
    let riskLevel: RiskLevel;
    if (composite >= 0.75) {
      riskLevel = 'critical';
    } else if (composite >= 0.55) {
      riskLevel = 'high';
    } else if (composite >= 0.3) {
      riskLevel = 'medium';
    } else {
      riskLevel = 'low';
    }

    return {
      phoneReputationScore: phoneScore,
      velocityFlag,
      conversationScore: convScore,
      compositeScore: Math.min(1, composite),
      riskLevel,
      signals,
      shouldBlock: composite > 0.85,
      shouldEscalate: composite > 0.65,
    };
  },

  /**
   * Re-fuse scores when conversation analysis updates
   */
  refuseWithConversation(
    existingAssessment: FraudAssessment,
    convResult: ConversationFraudResult
  ): FraudAssessment {
    const allSignals = [
      ...existingAssessment.signals,
      ...convResult.signals.filter((s) => !existingAssessment.signals.includes(s)),
    ];

    return this.fuseScores(
      existingAssessment.phoneReputationScore,
      existingAssessment.velocityFlag,
      convResult.score,
      allSignals
    );
  },

  /**
   * Record fraud incident in database
   */
  async recordIncident(
    companyId: string,
    callId: string,
    callerPhone: string,
    assessment: FraudAssessment,
    action: FraudAction,
    transcript?: Array<{ role: string; content: string; timestamp?: string }>
  ): Promise<void> {
    try {
      await FraudIncident.findOneAndUpdate(
        { callId },
        {
          companyId,
          callId,
          callerPhone,
          compositeScore: assessment.compositeScore,
          riskLevel: assessment.riskLevel,
          phoneReputationScore: assessment.phoneReputationScore,
          velocityFlag: assessment.velocityFlag,
          conversationScore: assessment.conversationScore,
          signals: assessment.signals,
          action,
          transcript,
        },
        { upsert: true, new: true }
      );

      // Emit socket event for high risk
      if (assessment.riskLevel === 'high' || assessment.riskLevel === 'critical') {
        const io = getIO();
        io.to(`company:${companyId}:supervisors`).emit('fraud:highRisk', {
          callId,
          callerPhone,
          riskLevel: assessment.riskLevel,
          compositeScore: assessment.compositeScore,
          signals: assessment.signals,
        });
      }

      logger.info(
        {
          callId,
          riskLevel: assessment.riskLevel,
          action,
          score: assessment.compositeScore,
        },
        'Fraud incident recorded'
      );
    } catch (error) {
      logger.error({ error, callId }, 'Failed to record fraud incident');
    }
  },

  /**
   * Get cached assessment for a call
   */
  async getCachedAssessment(companyId: string, callId: string): Promise<FraudAssessment | null> {
    try {
      const cacheKey = `${companyId}:fraud:${callId}`;
      const cached = await redis.get(cacheKey);
      return cached ? JSON.parse(cached) : null;
    } catch {
      return null;
    }
  },

  /**
   * Cache assessment for a call
   */
  async cacheAssessment(
    companyId: string,
    callId: string,
    assessment: FraudAssessment
  ): Promise<void> {
    const cacheKey = `${companyId}:fraud:${callId}`;
    await redis.setex(cacheKey, 3600, JSON.stringify(assessment));
  },
};

export default fraudDetector;
