import { redis, buildRedisKey } from '../config/redis.js';
import { REDIS_TTL, REDIS_KEYS, CHANNELS } from '../config/constants.js';
import { logger } from '../config/logger.js';
import { Customer } from '../models/Customer.js';
import { CallSession } from '../models/CallSession.js';
import { Ticket } from '../models/Ticket.js';
import type { CustomerIntelligenceCard, RecentIssue, SentimentLabel } from '../types/session.js';

const childLogger = logger.child({ service: 'customerIntelligence' });

interface BuildCustomerCardParams {
  phone?: string;
  email?: string;
}

/**
 * Build a 360-degree customer intelligence card
 * Uses Redis caching with 1-hour TTL
 */
export async function buildCustomerCard(
  params: BuildCustomerCardParams,
  companyId: string
): Promise<CustomerIntelligenceCard> {
  const { phone, email } = params;

  if (!phone && !email) {
    childLogger.debug({ companyId }, 'No identifier provided, returning empty card');
    return createEmptyCard();
  }

  const identifier = phone || email;
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
  if (phone) {
    customerQuery.phone = phone;
  } else if (email) {
    customerQuery.email = email;
  }

  // Parallel fetch from all sources
  const [customer, recentCalls, recentTickets] = await Promise.all([
    Customer.findOne(customerQuery).lean(),
    CallSession.find({
      companyId,
      ...(phone ? { callerPhone: phone } : {}),
    })
      .sort({ startedAt: -1 })
      .limit(3)
      .lean(),
    Ticket.find({
      companyId,
      ...(email ? { 'metadata.email': email } : {}),
    })
      .sort({ createdAt: -1 })
      .limit(3)
      .lean(),
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

  // Calculate open tickets count
  const openTickets = recentTickets.filter(
    (t) => !['solved', 'closed'].includes(t.status)
  ).length;

  // Calculate account age
  const accountAge = customer?.createdAt
    ? Math.floor(
        (Date.now() - new Date(customer.createdAt).getTime()) / (1000 * 60 * 60 * 24)
      )
    : undefined;

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
    openTickets,
    totalInteractions: (customer?.totalInteractions || 0) + recentCalls.length + recentTickets.length,
    avgSentiment: customer?.avgSentiment,
    preferredLanguage: customer?.preferredLanguage,
    recentIssues: topIssues,
    tags: customer?.tags || [],
    notes: customer?.notes,
  };

  // Cache the card
  await redis.setex(cacheKey, REDIS_TTL.CUSTOMER_CARD, JSON.stringify(card));

  childLogger.info(
    { companyId, identifier, customerId: card.customerId },
    'Customer card built and cached'
  );

  return card;
}

/**
 * Create an empty customer card for unknown callers
 */
function createEmptyCard(): CustomerIntelligenceCard {
  return {
    openTickets: 0,
    totalInteractions: 0,
    recentIssues: [],
  };
}

/**
 * Invalidate customer card cache
 * Call this when customer data is updated
 */
export async function invalidateCustomerCard(
  companyId: string,
  identifiers: { phone?: string; email?: string }
): Promise<void> {
  const keysToDelete: string[] = [];

  if (identifiers.phone) {
    keysToDelete.push(buildRedisKey(companyId, REDIS_KEYS.CUSTOMER_360, identifiers.phone));
  }
  if (identifiers.email) {
    keysToDelete.push(buildRedisKey(companyId, REDIS_KEYS.CUSTOMER_360, identifiers.email));
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
  // Simple approach: update to latest sentiment
  // Could be enhanced with weighted average
  await Customer.updateOne(
    { _id: customerId, companyId },
    { $set: { avgSentiment: newSentiment } }
  );

  childLogger.debug({ companyId, customerId, newSentiment }, 'Customer sentiment updated');
}
