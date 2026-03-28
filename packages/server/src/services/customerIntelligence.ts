import { redis, buildRedisKey } from '../config/redis.js';
import { REDIS_TTL, REDIS_KEYS, CHANNELS } from '../config/constants.js';
import type { SentimentLabel } from '../config/constants.js';
import { logger } from '../config/logger.js';
import { Customer } from '../models/Customer.js';
import { CallSession } from '../models/CallSession.js';
import { Ticket } from '../models/Ticket.js';
import type { CustomerIntelligenceCard, RecentIssue } from '../types/session.js';
import type {
  SentimentTimelineResponse,
  SentimentDataPoint,
  CustomerProfileResponse,
  CallSummary,
  TicketSummary,
} from '../types/customer.js';

const childLogger = logger.child({ service: 'customerIntelligence' });

interface BuildCustomerCardParams {
  phone?: string;
  email?: string;
  customerId?: string;
}

/**
 * Build a 360-degree customer intelligence card
 * Uses Redis caching with 1-hour TTL
 */
export async function buildCustomerCard(
  params: BuildCustomerCardParams,
  companyId: string
): Promise<CustomerIntelligenceCard> {
  const { phone, email, customerId } = params;

  if (!phone && !email && !customerId) {
    childLogger.debug({ companyId }, 'No identifier provided, returning empty card');
    return createEmptyCard();
  }

  const identifier = customerId || phone || email;
  const cacheKey = buildRedisKey(companyId, REDIS_KEYS.CUSTOMER_360, identifier as string);

  // Check cache first
  const cached = await redis.get(cacheKey);
  if (cached) {
    childLogger.debug({ companyId, identifier }, 'Customer card found in cache');
    return JSON.parse(cached) as CustomerIntelligenceCard;
  }

  childLogger.debug({ companyId, identifier }, 'Building customer card from database');

  // Build query for customer lookup
  const customerQuery: Record<string, unknown> = { companyId };
  if (customerId) {
    customerQuery._id = customerId;
  } else if (phone) {
    customerQuery.phone = phone;
  } else if (email) {
    customerQuery.email = email;
  }

  // Parallel fetch from all sources
  const [customer, recentCalls, recentTickets, openTicketCount] = await Promise.all([
    Customer.findOne(customerQuery).lean(),
    CallSession.find({
      companyId,
      ...(phone ? { callerPhone: phone } : {}),
      ...(customerId ? { customerId } : {}),
    })
      .sort({ startedAt: -1 })
      .limit(5)
      .select('callId summary slots sentiment startedAt endedAt status resolution')
      .lean(),
    Ticket.find({
      companyId,
      ...(customerId ? { customerId } : {}),
      ...(email && !customerId ? { 'metadata.email': email } : {}),
    })
      .sort({ createdAt: -1 })
      .limit(5)
      .select('externalId subject status resolution sentiment createdAt')
      .lean(),
    Ticket.countDocuments({
      companyId,
      ...(customerId ? { customerId } : {}),
      status: { $nin: ['solved', 'closed'] },
    }),
  ]);

  // Build recent issues from calls and tickets
  const recentIssues: RecentIssue[] = [];

  for (const call of recentCalls) {
    recentIssues.push({
      id: call.callId,
      channel: CHANNELS.VOICE,
      subject: call.summary || call.slots?.intent || 'Voice call',
      status: call.status,
      createdAt: call.startedAt,
      resolvedAt: call.endedAt,
      sentiment: call.sentiment?.overall as SentimentLabel | undefined,
    });
  }

  for (const ticket of recentTickets) {
    recentIssues.push({
      id: ticket.externalId,
      channel: CHANNELS.TEXT,
      subject: ticket.subject,
      status: ticket.status,
      createdAt: ticket.createdAt,
      resolvedAt: ticket.resolution?.resolvedAt,
      sentiment: ticket.sentiment,
    });
  }

  // Sort by date and take most recent
  recentIssues.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  const topIssues = recentIssues.slice(0, 5);

  // Calculate account age
  const accountAge = customer?.createdAt
    ? Math.floor(
        (Date.now() - new Date(customer.createdAt).getTime()) / (1000 * 60 * 60 * 24)
      )
    : undefined;

  // Build call and ticket summaries
  const callSummaries = recentCalls
    .filter((c) => c.summary)
    .map((c) => c.summary as string)
    .slice(0, 3);

  const ticketSummaries = recentTickets
    .map((t) => `${t.subject} (${t.status})`)
    .slice(0, 3);

  // Extract known issues from recent interactions
  const knownIssues = extractKnownIssues(recentCalls, recentTickets);

  // Calculate sentiment trend
  const sentimentTrend = calculateSentimentTrend(recentCalls, recentTickets);

  // Calculate churn risk score
  const churnRiskScore = calculateChurnRisk({
    tier: customer?.tier || 'standard',
    sentimentTrend,
    openTickets: openTicketCount,
    recentIssues: topIssues,
    lastContactDate: customer?.lastContactAt,
    lifetimeValue: customer?.lifetimeValue || 0,
  });

  // Build the card
  const card: CustomerIntelligenceCard = {
    customerId: customer?._id?.toString(),
    phone: phone || customer?.phone,
    email: email || customer?.email,
    name: customer?.name,
    tier: customer?.tier || 'standard',
    lifetimeValue: customer?.lifetimeValue || 0,
    accountAge,
    lastContactDate: customer?.lastContactAt,
    openTickets: openTicketCount,
    totalInteractions: (customer?.totalInteractions || 0) + recentCalls.length + recentTickets.length,
    avgSentiment: customer?.avgSentiment,
    preferredLanguage: customer?.preferredLanguage,
    recentIssues: topIssues,
    tags: customer?.tags || [],
    notes: customer?.notes,
    // F3 additions
    preferredStyle: customer?.preferredStyle || 'casual',
    verbosity: customer?.verbosity || 'concise',
    callSummaries,
    ticketSummaries,
    knownIssues,
    churnRiskScore,
    sentimentTrend,
  };

  // Cache the card
  await redis.setex(cacheKey, REDIS_TTL.CUSTOMER_CARD, JSON.stringify(card));

  childLogger.info(
    { companyId, identifier, customerId: card.customerId, churnRiskScore },
    'Customer card built and cached'
  );

  return card;
}

/**
 * Format customer card for voice prompt [CUSTOMER CONTEXT] section
 */
export function formatCardForVoicePrompt(card: CustomerIntelligenceCard): string {
  const lines: string[] = [];

  // Customer identification
  if (card.name) {
    lines.push(`Customer: ${card.name}`);
  }

  // Tier-based instructions
  if (card.tier === 'enterprise' || card.tier === 'vip') {
    lines.push(`PRIORITY: ${card.tier.toUpperCase()} customer — Skip verification, trusted account.`);
  } else if (card.tier === 'premium') {
    lines.push(`Tier: Premium — Prioritize resolution.`);
  }

  // Lifetime value context
  if (card.lifetimeValue && card.lifetimeValue > 5000) {
    lines.push(`High-value customer: $${card.lifetimeValue.toLocaleString()} LTV`);
  }

  // Churn risk alert
  if (card.churnRiskScore > 0.65) {
    lines.push(`⚠️ HIGH CHURN RISK (${Math.round(card.churnRiskScore * 100)}%) — Handle with extra care.`);
  } else if (card.churnRiskScore > 0.4) {
    lines.push(`Note: Moderate churn risk — Ensure positive resolution.`);
  }

  // Sentiment context
  if (card.sentimentTrend === 'worsening') {
    lines.push(`Sentiment trend: WORSENING — Customer may be frustrated.`);
  } else if (card.sentimentTrend === 'improving') {
    lines.push(`Sentiment trend: Improving — Keep up the good work.`);
  }

  // Open issues
  if (card.openTickets > 0) {
    lines.push(`Open tickets: ${card.openTickets}`);
  }

  // Recent interaction history
  if (card.callSummaries.length > 0) {
    lines.push(`Recent calls: ${card.callSummaries.slice(0, 2).join('; ')}`);
  }

  // Known issues
  if (card.knownIssues.length > 0) {
    lines.push(`Known issues: ${card.knownIssues.slice(0, 3).join(', ')}`);
  }

  // Communication preferences
  if (card.verbosity === 'detailed') {
    lines.push(`Prefers: Detailed explanations`);
  }
  if (card.preferredStyle === 'formal') {
    lines.push(`Style: Use formal language`);
  } else if (card.preferredStyle === 'technical') {
    lines.push(`Style: Customer is technical, can use jargon`);
  }

  // Notes
  if (card.notes) {
    lines.push(`Agent notes: ${card.notes}`);
  }

  return lines.join('\n');
}

/**
 * Create an empty customer card for unknown callers
 */
function createEmptyCard(): CustomerIntelligenceCard {
  return {
    openTickets: 0,
    totalInteractions: 0,
    recentIssues: [],
    callSummaries: [],
    ticketSummaries: [],
    knownIssues: [],
    churnRiskScore: 0,
    sentimentTrend: 'stable',
  };
}

/**
 * Extract recurring issues from call and ticket history
 */
function extractKnownIssues(
  calls: Array<{ slots?: Record<string, unknown>; summary?: string }>,
  tickets: Array<{ subject: string }>
): string[] {
  const issueCounts = new Map<string, number>();

  // Extract intents from calls
  for (const call of calls) {
    const intent = call.slots?.intent as string | undefined;
    if (intent && intent !== 'general_inquiry') {
      const formatted = intent.replace(/_/g, ' ');
      issueCounts.set(formatted, (issueCounts.get(formatted) || 0) + 1);
    }
  }

  // Extract keywords from ticket subjects
  const keywords = ['refund', 'shipping', 'delivery', 'payment', 'account', 'password', 'cancel', 'return'];
  for (const ticket of tickets) {
    const subject = ticket.subject.toLowerCase();
    for (const keyword of keywords) {
      if (subject.includes(keyword)) {
        issueCounts.set(keyword, (issueCounts.get(keyword) || 0) + 1);
      }
    }
  }

  // Return issues that appeared more than once
  return Array.from(issueCounts.entries())
    .filter(([, count]) => count > 1)
    .sort((a, b) => b[1] - a[1])
    .map(([issue]) => issue)
    .slice(0, 5);
}

/**
 * Calculate sentiment trend from recent interactions
 */
function calculateSentimentTrend(
  calls: Array<{ sentiment?: { overall?: string }; startedAt: Date }>,
  tickets: Array<{ sentiment?: string; createdAt: Date }>
): 'improving' | 'stable' | 'worsening' {
  const sentimentValues: Array<{ date: Date; value: number }> = [];

  const sentimentToValue = (s?: string): number => {
    if (s === 'positive') return 1;
    if (s === 'negative') return -1;
    return 0;
  };

  for (const call of calls) {
    sentimentValues.push({
      date: call.startedAt,
      value: sentimentToValue(call.sentiment?.overall),
    });
  }

  for (const ticket of tickets) {
    sentimentValues.push({
      date: ticket.createdAt,
      value: sentimentToValue(ticket.sentiment),
    });
  }

  if (sentimentValues.length < 2) {
    return 'stable';
  }

  // Sort by date ascending
  sentimentValues.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());

  // Compare first half vs second half
  const midpoint = Math.floor(sentimentValues.length / 2);
  const firstHalf = sentimentValues.slice(0, midpoint);
  const secondHalf = sentimentValues.slice(midpoint);

  const firstAvg = firstHalf.reduce((sum, s) => sum + s.value, 0) / firstHalf.length;
  const secondAvg = secondHalf.reduce((sum, s) => sum + s.value, 0) / secondHalf.length;

  const diff = secondAvg - firstAvg;

  if (diff > 0.3) return 'improving';
  if (diff < -0.3) return 'worsening';
  return 'stable';
}

/**
 * Calculate churn risk score (0-1)
 */
function calculateChurnRisk(factors: {
  tier: string;
  sentimentTrend: 'improving' | 'stable' | 'worsening';
  openTickets: number;
  recentIssues: RecentIssue[];
  lastContactDate?: Date;
  lifetimeValue: number;
}): number {
  let riskScore = 0;

  // Sentiment trend impact (0-0.3)
  if (factors.sentimentTrend === 'worsening') {
    riskScore += 0.3;
  } else if (factors.sentimentTrend === 'stable') {
    riskScore += 0.1;
  }

  // Open tickets impact (0-0.25)
  if (factors.openTickets >= 3) {
    riskScore += 0.25;
  } else if (factors.openTickets >= 2) {
    riskScore += 0.15;
  } else if (factors.openTickets >= 1) {
    riskScore += 0.05;
  }

  // Recent negative interactions (0-0.2)
  const recentNegative = factors.recentIssues.filter(
    (i) => i.sentiment === 'negative' && isWithinDays(i.createdAt, 30)
  ).length;
  riskScore += Math.min(recentNegative * 0.1, 0.2);

  // Days since last contact (0-0.15)
  if (factors.lastContactDate) {
    const daysSince = Math.floor(
      (Date.now() - new Date(factors.lastContactDate).getTime()) / (1000 * 60 * 60 * 24)
    );
    if (daysSince > 90) {
      riskScore += 0.15;
    } else if (daysSince > 60) {
      riskScore += 0.1;
    } else if (daysSince > 30) {
      riskScore += 0.05;
    }
  }

  // Tier adjustment
  if (factors.tier === 'enterprise' || factors.tier === 'vip') {
    // High-value customers get extra attention but lower base risk
    riskScore *= 0.8;
  }

  // LTV adjustment - higher LTV customers are more concerning when at risk
  if (factors.lifetimeValue > 10000 && riskScore > 0.3) {
    riskScore = Math.min(riskScore * 1.2, 1);
  }

  return Math.min(Math.max(riskScore, 0), 1);
}

/**
 * Check if a date is within N days of now
 */
function isWithinDays(date: Date, days: number): boolean {
  const cutoff = Date.now() - days * 24 * 60 * 60 * 1000;
  return new Date(date).getTime() > cutoff;
}

/**
 * Build sentiment timeline for a customer
 */
export async function buildSentimentTimeline(
  customerId: string,
  companyId: string
): Promise<SentimentTimelineResponse> {
  const [calls, tickets] = await Promise.all([
    CallSession.find({ companyId, customerId })
      .sort({ startedAt: -1 })
      .limit(20)
      .select('callId sentiment startedAt')
      .lean(),
    Ticket.find({ companyId, customerId })
      .sort({ createdAt: -1 })
      .limit(20)
      .select('externalId sentiment createdAt')
      .lean(),
  ]);

  const sentimentToScore = (s?: string): number => {
    if (s === 'positive') return 1;
    if (s === 'negative') return -1;
    return 0;
  };

  const voiceData: SentimentDataPoint[] = calls.map((c) => ({
    date: c.startedAt,
    sentiment: (c.sentiment?.overall as SentimentLabel) || 'neutral',
    score: sentimentToScore(c.sentiment?.overall),
    source: 'call' as const,
    sourceId: c.callId,
  }));

  const textData: SentimentDataPoint[] = tickets.map((t) => ({
    date: t.createdAt,
    sentiment: t.sentiment || 'neutral',
    score: sentimentToScore(t.sentiment),
    source: 'ticket' as const,
    sourceId: t.externalId,
  }));

  const combined = [...voiceData, ...textData].sort(
    (a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()
  );

  const voiceAvg = voiceData.length > 0
    ? voiceData.reduce((sum, d) => sum + d.score, 0) / voiceData.length
    : 0;

  const textAvg = textData.length > 0
    ? textData.reduce((sum, d) => sum + d.score, 0) / textData.length
    : 0;

  const overallAvg = combined.length > 0
    ? combined.reduce((sum, d) => sum + d.score, 0) / combined.length
    : 0;

  // Calculate trend
  let trend: 'improving' | 'stable' | 'worsening' = 'stable';
  if (combined.length >= 4) {
    const recent = combined.slice(0, Math.floor(combined.length / 2));
    const older = combined.slice(Math.floor(combined.length / 2));
    const recentAvg = recent.reduce((sum, d) => sum + d.score, 0) / recent.length;
    const olderAvg = older.reduce((sum, d) => sum + d.score, 0) / older.length;
    if (recentAvg - olderAvg > 0.3) trend = 'improving';
    if (recentAvg - olderAvg < -0.3) trend = 'worsening';
  }

  return {
    voice: voiceData,
    text: textData,
    combined,
    trend,
    averageSentiment: {
      voice: voiceAvg,
      text: textAvg,
      overall: overallAvg,
    },
  };
}

/**
 * Get full customer profile with extended data
 */
export async function getCustomerProfile(
  customerId: string,
  companyId: string
): Promise<CustomerProfileResponse | null> {
  const customer = await Customer.findOne({ _id: customerId, companyId }).lean();

  if (!customer) {
    return null;
  }

  const [card, recentCalls, recentTickets, sentimentTimeline] = await Promise.all([
    buildCustomerCard({ customerId }, companyId),
    CallSession.find({ companyId, customerId })
      .sort({ startedAt: -1 })
      .limit(5)
      .lean(),
    Ticket.find({ companyId, customerId })
      .sort({ createdAt: -1 })
      .limit(5)
      .lean(),
    buildSentimentTimeline(customerId, companyId),
  ]);

  const callSummaries: CallSummary[] = recentCalls.map((c) => ({
    callId: c.callId,
    date: c.startedAt,
    duration: c.endedAt
      ? Math.floor((new Date(c.endedAt).getTime() - new Date(c.startedAt).getTime()) / 1000)
      : 0,
    intent: c.slots?.intent as string | undefined,
    summary: c.summary,
    sentiment: c.sentiment?.overall as SentimentLabel | undefined,
    resolution: c.resolution,
    agentId: c.escalation?.agentId,
  }));

  const ticketSummaries: TicketSummary[] = recentTickets.map((t) => ({
    ticketId: t._id.toString(),
    externalId: t.externalId,
    date: t.createdAt,
    subject: t.subject,
    status: t.status,
    priority: t.priority,
    sentiment: t.sentiment,
    resolution: t.resolution?.resolutionType,
    aiAssisted: !!t.aiDraft?.content,
  }));

  return {
    customer: card,
    recentCalls: callSummaries,
    recentTickets: ticketSummaries,
    sentimentTimeline,
    communicationPreferences: {
      preferredChannel: customer.preferredChannel || 'voice',
      preferredLanguage: customer.preferredLanguage || 'en',
      preferredStyle: customer.preferredStyle || 'casual',
      verbosity: customer.verbosity || 'concise',
    },
  };
}

/**
 * Invalidate customer card cache
 */
export async function invalidateCustomerCard(
  companyId: string,
  identifiers: { phone?: string; email?: string; customerId?: string }
): Promise<void> {
  const keysToDelete: string[] = [];

  if (identifiers.phone) {
    keysToDelete.push(buildRedisKey(companyId, REDIS_KEYS.CUSTOMER_360, identifiers.phone));
  }
  if (identifiers.email) {
    keysToDelete.push(buildRedisKey(companyId, REDIS_KEYS.CUSTOMER_360, identifiers.email));
  }
  if (identifiers.customerId) {
    keysToDelete.push(buildRedisKey(companyId, REDIS_KEYS.CUSTOMER_360, identifiers.customerId));
  }

  if (keysToDelete.length > 0) {
    await redis.del(...keysToDelete);
    childLogger.debug({ companyId, identifiers }, 'Customer card cache invalidated');
  }
}

/**
 * Update customer's last contact date and increment interaction count
 */
export async function recordCustomerInteraction(
  companyId: string,
  identifiers: { phone?: string; email?: string }
): Promise<void> {
  if (!identifiers.phone && !identifiers.email) {
    return;
  }

  const query: Record<string, unknown> = { companyId };
  if (identifiers.phone) {
    query.phone = identifiers.phone;
  } else if (identifiers.email) {
    query.email = identifiers.email;
  }

  await Customer.updateOne(
    query,
    {
      $set: { lastContactAt: new Date() },
      $inc: { totalInteractions: 1 },
    }
  );

  // Invalidate cache
  await invalidateCustomerCard(companyId, identifiers);
}

/**
 * Update customer's average sentiment based on recent interactions
 */
export async function updateCustomerSentiment(
  companyId: string,
  customerId: string,
  newSentiment: SentimentLabel
): Promise<void> {
  await Customer.updateOne(
    { _id: customerId, companyId },
    { $set: { avgSentiment: newSentiment } }
  );

  childLogger.debug({ companyId, customerId, newSentiment }, 'Customer sentiment updated');
}
