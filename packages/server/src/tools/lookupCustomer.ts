import { Customer } from '../models/Customer.js';
import { logger } from '../config/logger.js';

const childLogger = logger.child({ tool: 'lookupCustomer' });

export interface LookupCustomerArgs {
  phone?: string;
  email?: string;
  customerId?: string;
  orderId?: string;
}

/**
 * Look up customer information by phone, email, or ID
 * Returns a TTS-friendly formatted string
 */
export async function lookupCustomer(
  args: LookupCustomerArgs,
  companyId: string
): Promise<string> {
  const { phone, email, customerId, orderId } = args;

  childLogger.info({ companyId, phone, email, customerId }, 'Looking up customer');

  try {
    // Build query based on available identifiers
    const query: Record<string, unknown> = { companyId };

    if (customerId) {
      query._id = customerId;
    } else if (phone) {
      // Normalize phone number (remove spaces, dashes)
      const normalizedPhone = phone.replace(/[\s\-\(\)]/g, '');
      query.phone = { $regex: normalizedPhone.slice(-10), $options: 'i' };
    } else if (email) {
      query.email = email.toLowerCase();
    } else {
      return 'I need a phone number, email, or customer ID to look up customer information.';
    }

    const customer = await Customer.findOne(query).lean();

    if (!customer) {
      if (phone) {
        return `I couldn't find a customer record for that phone number. Would you like me to create a new account?`;
      }
      if (email) {
        return `I couldn't find a customer record for that email address. Would you like me to create a new account?`;
      }
      return `I couldn't find that customer in our system.`;
    }

    // Build TTS-friendly response
    const parts: string[] = [];

    // Customer name
    if (customer.name) {
      parts.push(`I found the account for ${customer.name}`);
    } else {
      parts.push(`I found the account`);
    }

    // Tier info
    if (customer.tier && customer.tier !== 'standard') {
      const tierNames: Record<string, string> = {
        premium: 'Premium',
        vip: 'VIP',
        enterprise: 'Enterprise',
      };
      parts.push(`This is a ${tierNames[customer.tier] || customer.tier} customer`);
    }

    // Open tickets
    if (customer.openTickets > 0) {
      const ticketWord = customer.openTickets === 1 ? 'ticket' : 'tickets';
      parts.push(`They have ${customer.openTickets} open ${ticketWord}`);
    }

    // Known issues
    if (customer.knownIssues && customer.knownIssues.length > 0) {
      const issuesList = customer.knownIssues.slice(0, 2).join(', ');
      parts.push(`Known issues include: ${issuesList}`);
    }

    // Sentiment trend
    if (customer.sentimentTrend === 'worsening') {
      parts.push(`Their recent interactions show declining satisfaction`);
    } else if (customer.avgSentiment === 'negative') {
      parts.push(`They have had some frustrating experiences recently`);
    }

    // Lifetime value for VIP context
    if (customer.lifetimeValue > 10000) {
      parts.push(`They're a high-value customer`);
    }

    // Notes (summarized)
    if (customer.notes && customer.notes.length > 0) {
      // Only include first 100 chars of notes
      const shortNotes = customer.notes.length > 100
        ? customer.notes.substring(0, 100) + '...'
        : customer.notes;
      parts.push(`Note: ${shortNotes}`);
    }

    const response = parts.join('. ') + '.';
    
    childLogger.info(
      { companyId, customerId: customer._id.toString() },
      'Customer found'
    );

    return response;
  } catch (error) {
    childLogger.error({ error, companyId }, 'Failed to look up customer');
    return 'I encountered an issue looking up the customer information. Let me try a different approach.';
  }
}

/**
 * Look up order information
 * Placeholder - would integrate with actual order system
 */
export async function lookupOrder(
  orderId: string,
  companyId: string
): Promise<string> {
  childLogger.info({ companyId, orderId }, 'Looking up order');

  // TODO: Integrate with actual order system (Shopify, WooCommerce, etc.)
  // This is a placeholder response
  
  return `I'm looking up order ${orderId}. Let me check on the status for you.`;
}
