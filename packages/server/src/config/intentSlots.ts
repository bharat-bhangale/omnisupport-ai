import type { IntentSlotConfig, SupportedIntent, SlotValidationSchemas } from '../types/dialogue.js';

/**
 * Intent slot configurations for the dialogue FSM
 * Defines required/optional slots, questions, and confirmation requirements
 */
export const INTENT_SLOTS: Record<SupportedIntent, IntentSlotConfig> = {
  order_status: {
    required: ['order_id'],
    optional: ['email'],
    questions: {
      order_id: 'Could you share your order number? It usually starts with ORD or is a 6-8 digit number.',
      email: 'Would you also like to provide your email address for verification?',
    },
    confirmBeforeAction: false,
  },

  process_refund: {
    required: ['order_id', 'refund_reason'],
    optional: ['preferred_refund_method'],
    questions: {
      order_id: 'Which order would you like to request a refund for?',
      refund_reason: 'I understand you want a refund. Could you tell me the reason? For example: damaged item, wrong item, or changed mind.',
      preferred_refund_method: 'How would you prefer to receive your refund — original payment method or store credit?',
    },
    confirmBeforeAction: true,
    confirmationMessage: 'Just to confirm: you want a refund for order {order_id} because of {refund_reason}. Should I proceed with this refund?',
  },

  cancel_order: {
    required: ['order_id'],
    optional: [],
    questions: {
      order_id: 'Which order would you like to cancel? Please provide your order number.',
    },
    confirmBeforeAction: true,
    confirmationMessage: 'I want to confirm: you want to cancel order {order_id}. Is that correct?',
  },

  account_update: {
    required: ['update_type'],
    optional: ['new_value'],
    questions: {
      update_type: 'What would you like to update — your email address, phone number, or shipping address?',
      new_value: 'What is the new {update_type} you would like to use?',
    },
    confirmBeforeAction: true,
    confirmationMessage: 'Just to confirm: you want to update your {update_type} to {new_value}. Is that correct?',
  },

  general_inquiry: {
    required: [],
    optional: [],
    questions: {},
    confirmBeforeAction: false,
  },

  escalate_to_human: {
    required: [],
    optional: ['reason'],
    questions: {
      reason: 'I can connect you with a human agent. Is there anything specific I should let them know?',
    },
    confirmBeforeAction: false,
  },

  greeting: {
    required: [],
    optional: [],
    questions: {},
    confirmBeforeAction: false,
  },

  goodbye: {
    required: [],
    optional: [],
    questions: {},
    confirmBeforeAction: false,
  },

  unknown: {
    required: [],
    optional: [],
    questions: {},
    confirmBeforeAction: false,
  },
};

/**
 * Validation patterns for common slot types
 */
export const SLOT_VALIDATION: SlotValidationSchemas = {
  // Order ID: ORD-123456, ORD123456, or 6-10 digit number
  order_id: /^(ORD[-]?\d{5,10}|\d{6,10})$/i,

  // Standard email validation
  email: /^[^\s@]+@[^\s@]+\.[^\s@]+$/,

  // Phone: various formats, 10-15 digits
  phone: /^[+]?[\d\s()-]{10,20}$/,

  // Valid refund reasons
  refund_reason: [
    'damaged',
    'defective',
    'wrong_item',
    'not_as_described',
    'changed_mind',
    'late_delivery',
    'quality_issue',
    'other',
  ],

  // Valid account update types
  update_type: ['email', 'phone', 'address', 'name', 'password'],
};

/**
 * Map of intents to their corresponding tool names
 */
export const INTENT_TOOL_MAP: Partial<Record<SupportedIntent, string>> = {
  order_status: 'lookupOrder',
  process_refund: 'processRefund',
  cancel_order: 'cancelOrder',
  account_update: 'updateAccount',
  escalate_to_human: 'escalateToHuman',
};

/**
 * Intents that should trigger knowledge base search
 */
export const KB_SEARCH_INTENTS: SupportedIntent[] = [
  'general_inquiry',
  'order_status', // For FAQ about orders
];

/**
 * Maximum clarification attempts before auto-escalating
 */
export const MAX_CLARIFICATION_ATTEMPTS = 3;

/**
 * Get intent config with safe fallback
 */
export function getIntentConfig(intent: SupportedIntent): IntentSlotConfig {
  return INTENT_SLOTS[intent] || INTENT_SLOTS.unknown;
}

/**
 * Check if an intent requires action confirmation
 */
export function requiresConfirmation(intent: SupportedIntent): boolean {
  const config = getIntentConfig(intent);
  return config.confirmBeforeAction;
}

/**
 * Get the tool name for an intent
 */
export function getToolForIntent(intent: SupportedIntent): string | null {
  return INTENT_TOOL_MAP[intent] || null;
}
