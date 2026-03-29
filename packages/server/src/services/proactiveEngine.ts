// ============================================================================
// PROACTIVE ENGINE SERVICE
// ============================================================================
// Evaluates proactive triggers and predicts follow-up questions

import OpenAI from 'openai';
import { ProactiveTrigger, IProactiveTrigger, IProactiveTriggerMethods } from '../models/ProactiveTrigger.js';
import { Customer } from '../models/Customer.js';
import { redis } from '../config/redis.js';
import { env } from '../config/env.js';
import { logger } from '../config/logger.js';

// ============================================================================
// TYPES
// ============================================================================

interface CallSessionState {
  callId: string;
  companyId: string;
  callerPhone?: string;
  customerId?: string;
  currentIntent?: string;
  turns: Array<{
    role: 'user' | 'assistant' | 'system' | 'tool';
    content: string;
    timestamp?: string;
  }>;
  slots?: Record<string, unknown>;
  proactiveContext?: string;
}

interface CustomerData {
  customer?: {
    id: string;
    name: string;
    email: string;
    tier: string;
    ltv: number;
    daysSinceSignup: number;
    openTickets: number;
  };
  order?: {
    id: string;
    status: string;
    delayDays: number;
    trackingNumber?: string;
    expectedDelivery?: string;
    amount: number;
  };
  account?: {
    tier: string;
    balance: number;
    daysSincePurchase: number;
    totalOrders: number;
    openTickets: number;
  };
  subscription?: {
    plan: string;
    status: string;
    daysUntilRenewal: number;
    nextBillingDate?: string;
  };
}

interface ProactiveResult {
  triggers: string[];
  predictions: string[];
  contextBlock: string;
}

// ============================================================================
// OPENAI CLIENT
// ============================================================================

const openai = new OpenAI({ apiKey: env.OPENAI_API_KEY });

// ============================================================================
// PROACTIVE ENGINE
// ============================================================================

export const proactiveEngine = {
  /**
   * Evaluate proactive triggers for a session
   * Returns triggered statement strings (max 2, sorted by priority)
   */
  async evaluateTriggers(session: CallSessionState, companyId: string): Promise<string[]> {
    try {
      const intent = session.currentIntent || 'general';

      // Fetch active triggers for this company and intent
      const triggers = await ProactiveTrigger.findActiveByCompanyAndIntent(companyId, intent);

      if (triggers.length === 0) {
        return [];
      }

      // Fetch customer data for condition evaluation
      const customerData = await fetchCustomerData(session);

      const triggeredStatements: Array<{ priority: number; statement: string }> = [];

      for (const trigger of triggers as (IProactiveTrigger & IProactiveTriggerMethods)[]) {
        try {
          // Evaluate condition
          const passes = trigger.evaluateCondition(customerData);

          if (passes) {
            // Interpolate template with actual values
            const statement = trigger.interpolateTemplate(customerData);
            triggeredStatements.push({
              priority: trigger.priority,
              statement,
            });
          }
        } catch (err) {
          logger.warn({ triggerId: trigger._id, error: err }, 'Failed to evaluate trigger');
        }
      }

      // Sort by priority (lower = higher) and take top 2
      triggeredStatements.sort((a, b) => a.priority - b.priority);
      const result = triggeredStatements.slice(0, 2).map((t) => t.statement);

      // Cache result for later retrieval
      const cacheKey = `${companyId}:proactive:triggers:${session.callId}`;
      await redis.setex(cacheKey, 300, JSON.stringify(result));

      return result;
    } catch (error) {
      logger.error({ error, callId: session.callId }, 'Failed to evaluate proactive triggers');
      return [];
    }
  },

  /**
   * Predict follow-up questions using GPT-4o
   * Returns array of 3 prediction strings
   */
  async predictFollowUpQuestions(session: CallSessionState): Promise<string[]> {
    const companyId = session.companyId;
    const cacheKey = `${companyId}:proactive:predictions:${session.callId}`;

    try {
      // Check cache first
      const cached = await redis.get(cacheKey);
      if (cached) {
        return JSON.parse(cached);
      }

      // Get last 3 turns for context
      const recentTurns = session.turns.slice(-3);
      if (recentTurns.length === 0) {
        return [];
      }

      const turnContext = recentTurns
        .map((t) => `${t.role}: ${t.content}`)
        .join('\n');

      // GPT-4o prediction
      const response = await openai.chat.completions.create({
        model: 'gpt-4o',
        temperature: 0,
        max_tokens: 150,
        messages: [
          {
            role: 'system',
            content: `Given this support call context, predict the 3 most likely follow-up questions or concerns the customer will raise next.
Return ONLY a JSON array of 3 concise strings. No explanation, just the array.
Example: ["Will I get a refund for the delay?", "Can you expedite my shipping?", "What's my new delivery date?"]`,
          },
          {
            role: 'user',
            content: turnContext,
          },
        ],
      });

      const content = response.choices[0]?.message?.content || '[]';

      // Parse JSON array
      let predictions: string[] = [];
      try {
        const parsed = JSON.parse(content);
        if (Array.isArray(parsed)) {
          predictions = parsed.slice(0, 3).map((p) => String(p));
        }
      } catch {
        // Try to extract array from response
        const match = content.match(/\[.*\]/s);
        if (match) {
          try {
            predictions = JSON.parse(match[0]).slice(0, 3);
          } catch {
            predictions = [];
          }
        }
      }

      // Cache result
      await redis.setex(cacheKey, 300, JSON.stringify(predictions));

      return predictions;
    } catch (error) {
      logger.error({ error, callId: session.callId }, 'Failed to predict follow-up questions');
      return [];
    }
  },

  /**
   * Build proactive context block for system prompt injection
   */
  buildProactiveContextBlock(triggers: string[], predictions: string[]): string {
    if (triggers.length === 0 && predictions.length === 0) {
      return '';
    }

    const parts: string[] = ['[PROACTIVE CONTEXT]'];

    if (triggers.length > 0) {
      parts.push('Triggered insights (mention naturally if relevant):');
      triggers.forEach((t) => parts.push(`- ${t}`));
    }

    if (predictions.length > 0) {
      parts.push('');
      parts.push('Likely follow-up questions (address proactively if appropriate):');
      predictions.forEach((p) => parts.push(`- ${p}`));
    }

    parts.push('');
    parts.push('Do NOT list these explicitly. Weave them naturally into your response.');

    return parts.join('\n');
  },

  /**
   * Get cached proactive context for a call
   */
  async getCachedProactiveContext(companyId: string, callId: string): Promise<ProactiveResult> {
    try {
      const [triggersRaw, predictionsRaw] = await Promise.all([
        redis.get(`${companyId}:proactive:triggers:${callId}`),
        redis.get(`${companyId}:proactive:predictions:${callId}`),
      ]);

      const triggers: string[] = triggersRaw ? JSON.parse(triggersRaw) : [];
      const predictions: string[] = predictionsRaw ? JSON.parse(predictionsRaw) : [];
      const contextBlock = this.buildProactiveContextBlock(triggers, predictions);

      return { triggers, predictions, contextBlock };
    } catch (error) {
      logger.error({ error, callId }, 'Failed to get cached proactive context');
      return { triggers: [], predictions: [], contextBlock: '' };
    }
  },

  /**
   * Fire proactive analysis asynchronously (don't await)
   */
  fireAsync(session: CallSessionState): void {
    // Fire and forget - these will cache their results
    this.evaluateTriggers(session, session.companyId).catch((err) => {
      logger.error({ error: err, callId: session.callId }, 'Async trigger evaluation failed');
    });

    this.predictFollowUpQuestions(session).catch((err) => {
      logger.error({ error: err, callId: session.callId }, 'Async prediction failed');
    });
  },

  /**
   * Test a specific trigger against a session
   */
  async testTrigger(
    triggerId: string,
    session: CallSessionState
  ): Promise<{ triggered: boolean; statement?: string; data?: CustomerData }> {
    try {
      const trigger = await ProactiveTrigger.findById(triggerId);
      if (!trigger) {
        return { triggered: false };
      }

      const customerData = await fetchCustomerData(session);
      const typedTrigger = trigger as IProactiveTrigger & IProactiveTriggerMethods;
      const passes = typedTrigger.evaluateCondition(customerData);

      if (passes) {
        const statement = typedTrigger.interpolateTemplate(customerData);
        return { triggered: true, statement, data: customerData };
      }

      return { triggered: false, data: customerData };
    } catch (error) {
      logger.error({ error, triggerId }, 'Failed to test trigger');
      return { triggered: false };
    }
  },
};

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

/**
 * Fetch customer data for condition evaluation
 */
async function fetchCustomerData(session: CallSessionState): Promise<CustomerData> {
  const data: CustomerData = {};

  try {
    // Try to find customer by phone or ID
    let customer = null;
    if (session.customerId) {
      customer = await Customer.findById(session.customerId);
    } else if (session.callerPhone) {
      customer = await Customer.findOne({
        companyId: session.companyId,
        $or: [
          { phone: session.callerPhone },
          { 'phones.number': session.callerPhone },
        ],
      });
    }

    if (customer) {
      const now = new Date();
      const signupDate = customer.createdAt ? new Date(customer.createdAt) : now;
      const daysSinceSignup = Math.floor((now.getTime() - signupDate.getTime()) / (1000 * 60 * 60 * 24));

      data.customer = {
        id: customer._id.toString(),
        name: customer.name || 'Unknown',
        email: customer.email || '',
        tier: customer.tier || 'standard',
        ltv: customer.ltv || 0,
        daysSinceSignup,
        openTickets: customer.openTickets || 0,
      };

      data.account = {
        tier: customer.tier || 'standard',
        balance: customer.accountBalance || 0,
        daysSincePurchase: customer.lastPurchaseAt
          ? Math.floor((now.getTime() - new Date(customer.lastPurchaseAt).getTime()) / (1000 * 60 * 60 * 24))
          : 999,
        totalOrders: customer.totalOrders || 0,
        openTickets: customer.openTickets || 0,
      };

      // Check for recent/pending order from slots
      if (session.slots?.order_id || session.slots?.orderId) {
        const orderId = (session.slots.order_id || session.slots.orderId) as string;
        // In real implementation, would fetch order from CRM/database
        data.order = {
          id: orderId,
          status: (session.slots.order_status as string) || 'processing',
          delayDays: (session.slots.delay_days as number) || 0,
          trackingNumber: session.slots.tracking_number as string,
          amount: (session.slots.order_amount as number) || 0,
        };
      }

      // Check for subscription
      if (customer.subscription) {
        const renewalDate = customer.subscription.nextBillingDate
          ? new Date(customer.subscription.nextBillingDate)
          : null;

        data.subscription = {
          plan: customer.subscription.plan || 'basic',
          status: customer.subscription.status || 'active',
          daysUntilRenewal: renewalDate
            ? Math.floor((renewalDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24))
            : 0,
          nextBillingDate: renewalDate?.toISOString(),
        };
      }
    }

    // Merge with session slots for additional data
    if (session.slots) {
      // Order data from slots
      if (session.slots.order_status && !data.order) {
        data.order = {
          id: (session.slots.order_id as string) || 'unknown',
          status: session.slots.order_status as string,
          delayDays: (session.slots.delay_days as number) || 0,
          amount: (session.slots.order_amount as number) || 0,
        };
      }
    }
  } catch (error) {
    logger.error({ error, callId: session.callId }, 'Failed to fetch customer data');
  }

  return data;
}

export default proactiveEngine;
