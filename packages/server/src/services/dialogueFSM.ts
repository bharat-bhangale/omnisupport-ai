import OpenAI from 'openai';
import { z } from 'zod';
import { env } from '../config/env.js';
import { OPENAI_CONFIG } from '../config/constants.js';
import { logger } from '../config/logger.js';
import {
  INTENT_SLOTS,
  SLOT_VALIDATION,
  getIntentConfig,
  MAX_CLARIFICATION_ATTEMPTS,
} from '../config/intentSlots.js';
import type { ConversationSlots } from '../types/session.js';
import type {
  SupportedIntent,
  SlotCheckResult,
  SlotExtractionResult,
  SlotValidationError,
  ConfirmationResponse,
  IntentClassificationResult,
  DialogueState,
  DialogueAction,
} from '../types/dialogue.js';

const childLogger = logger.child({ service: 'dialogueFSM' });

const openai = new OpenAI({ apiKey: env.OPENAI_API_KEY });

/**
 * Check if all required slots for an intent are filled
 */
export function checkSlots(
  intent: SupportedIntent,
  slots: ConversationSlots
): SlotCheckResult {
  const config = getIntentConfig(intent);
  const missingSlots: string[] = [];
  const filledSlots: string[] = [];

  for (const requiredSlot of config.required) {
    const value = slots[requiredSlot];
    if (value !== undefined && value !== null && value !== '') {
      filledSlots.push(requiredSlot);
    } else {
      missingSlots.push(requiredSlot);
    }
  }

  // Check optional slots that are filled
  for (const optionalSlot of config.optional) {
    const value = slots[optionalSlot];
    if (value !== undefined && value !== null && value !== '') {
      filledSlots.push(optionalSlot);
    }
  }

  const complete = missingSlots.length === 0;
  const firstMissing = missingSlots[0] || null;
  const nextQuestion = firstMissing ? config.questions[firstMissing] || null : null;

  // Interpolate any slot values in the question
  const interpolatedQuestion = nextQuestion
    ? interpolateSlots(nextQuestion, slots)
    : null;

  return {
    complete,
    nextQuestion: interpolatedQuestion,
    missingSlot: firstMissing,
    missingSlots,
    filledSlots,
  };
}

/**
 * Extract slots from user utterance using GPT-4o function calling
 */
export async function extractSlots(
  intent: SupportedIntent,
  utterance: string,
  existingSlots: ConversationSlots
): Promise<SlotExtractionResult> {
  const config = getIntentConfig(intent);
  const allSlots = [...config.required, ...config.optional];

  if (allSlots.length === 0) {
    return {
      slots: {},
      confidence: 1,
      hasErrors: false,
      validationErrors: [],
    };
  }

  // Build function parameters schema dynamically
  const properties: Record<string, { type: string; description: string }> = {};
  for (const slot of allSlots) {
    properties[slot] = {
      type: 'string',
      description: getSlotDescription(slot),
    };
  }

  try {
    const response = await openai.chat.completions.create({
      model: OPENAI_CONFIG.MODEL,
      temperature: OPENAI_CONFIG.TEMP_CLASSIFY,
      max_tokens: 200,
      messages: [
        {
          role: 'system',
          content: `Extract slot values from the user's utterance. Only extract values that are explicitly stated. Do not infer or guess values. If a value is ambiguous or unclear, do not extract it.

Current context:
- Intent: ${intent}
- Already known slots: ${JSON.stringify(existingSlots)}

Return only the newly extracted values, not the existing ones.`,
        },
        {
          role: 'user',
          content: utterance,
        },
      ],
      tools: [
        {
          type: 'function',
          function: {
            name: 'extract_slots',
            description: 'Extract slot values from user utterance',
            parameters: {
              type: 'object',
              properties,
              required: [],
            },
          },
        },
      ],
      tool_choice: { type: 'function', function: { name: 'extract_slots' } },
    });

    const toolCall = response.choices[0]?.message?.tool_calls?.[0];
    if (!toolCall || toolCall.function.name !== 'extract_slots') {
      childLogger.warn({ intent, utterance }, 'No slot extraction from GPT-4o');
      return {
        slots: {},
        confidence: 0,
        hasErrors: false,
        validationErrors: [],
      };
    }

    const extractedRaw = JSON.parse(toolCall.function.arguments) as Record<string, string>;
    const validationErrors: SlotValidationError[] = [];
    const validatedSlots: Partial<ConversationSlots> = {};

    // Validate each extracted slot
    for (const [slot, value] of Object.entries(extractedRaw)) {
      if (!value || value.trim() === '') {
        continue;
      }

      const validation = validateSlotValue(slot, value);
      if (validation.valid) {
        validatedSlots[slot] = validation.normalizedValue || value;
      } else {
        validationErrors.push({
          slot,
          value,
          error: validation.error || 'Invalid value',
        });
      }
    }

    // Merge with existing slots
    const mergedSlots: Partial<ConversationSlots> = {
      ...existingSlots,
      ...validatedSlots,
    };

    childLogger.debug(
      { intent, extracted: validatedSlots, errors: validationErrors.length },
      'Slots extracted'
    );

    return {
      slots: mergedSlots,
      confidence: validationErrors.length === 0 ? 0.9 : 0.6,
      hasErrors: validationErrors.length > 0,
      validationErrors,
    };
  } catch (error) {
    childLogger.error({ error, intent, utterance }, 'Slot extraction failed');
    return {
      slots: existingSlots,
      confidence: 0,
      hasErrors: true,
      validationErrors: [{ slot: 'unknown', value: '', error: 'Extraction failed' }],
    };
  }
}

/**
 * Get confirmation message if intent requires confirmation
 */
export function needsConfirmation(
  intent: SupportedIntent,
  slots: ConversationSlots
): string | null {
  const config = getIntentConfig(intent);

  if (!config.confirmBeforeAction || !config.confirmationMessage) {
    return null;
  }

  return interpolateSlots(config.confirmationMessage, slots);
}

/**
 * Classify user response to confirmation prompt
 */
export async function isConfirmationResponse(
  utterance: string
): Promise<ConfirmationResponse> {
  try {
    const response = await openai.chat.completions.create({
      model: OPENAI_CONFIG.MODEL,
      temperature: OPENAI_CONFIG.TEMP_CLASSIFY,
      max_tokens: 5,
      messages: [
        {
          role: 'system',
          content: 'Classify if the user is confirming (yes), denying (no), or unclear. Respond with exactly one word: yes, no, or unclear.',
        },
        {
          role: 'user',
          content: utterance,
        },
      ],
    });

    const result = response.choices[0]?.message?.content?.toLowerCase().trim();

    if (result === 'yes' || result?.includes('yes')) {
      return 'yes';
    }
    if (result === 'no' || result?.includes('no')) {
      return 'no';
    }
    return 'unclear';
  } catch (error) {
    childLogger.error({ error, utterance }, 'Confirmation classification failed');
    return 'unclear';
  }
}

/**
 * Classify user intent from utterance
 */
export async function classifyIntent(
  utterance: string,
  conversationContext?: string
): Promise<IntentClassificationResult> {
  const intents: SupportedIntent[] = [
    'order_status',
    'process_refund',
    'cancel_order',
    'account_update',
    'general_inquiry',
    'escalate_to_human',
    'greeting',
    'goodbye',
  ];

  try {
    const response = await openai.chat.completions.create({
      model: OPENAI_CONFIG.MODEL,
      temperature: OPENAI_CONFIG.TEMP_CLASSIFY,
      max_tokens: 100,
      response_format: { type: 'json_object' },
      messages: [
        {
          role: 'system',
          content: `Classify the user's intent into one of these categories:
- order_status: Checking order status, tracking, delivery updates
- process_refund: Requesting a refund, returning an item
- cancel_order: Canceling an order
- account_update: Updating account details (email, phone, address)
- general_inquiry: General questions, product info, policies
- escalate_to_human: Wants to speak to a human agent
- greeting: Hello, hi, good morning
- goodbye: Bye, thank you, ending conversation

${conversationContext ? `Conversation context: ${conversationContext}` : ''}

Respond with JSON: {"intent": "category", "confidence": 0.0-1.0, "alternatives": [{"intent": "...", "confidence": 0.0-1.0}]}`,
        },
        {
          role: 'user',
          content: utterance,
        },
      ],
    });

    const content = response.choices[0]?.message?.content;
    if (!content) {
      return { intent: 'unknown', confidence: 0, alternatives: [] };
    }

    const parsed = JSON.parse(content) as {
      intent: string;
      confidence: number;
      alternatives?: Array<{ intent: string; confidence: number }>;
    };

    // Validate intent is in our list
    const intent = intents.includes(parsed.intent as SupportedIntent)
      ? (parsed.intent as SupportedIntent)
      : 'unknown';

    const alternatives = (parsed.alternatives || [])
      .filter((alt) => intents.includes(alt.intent as SupportedIntent))
      .map((alt) => ({
        intent: alt.intent as SupportedIntent,
        confidence: alt.confidence,
      }));

    childLogger.debug({ utterance, intent, confidence: parsed.confidence }, 'Intent classified');

    return {
      intent,
      confidence: parsed.confidence || 0.5,
      alternatives,
    };
  } catch (error) {
    childLogger.error({ error, utterance }, 'Intent classification failed');
    return { intent: 'unknown', confidence: 0, alternatives: [] };
  }
}

/**
 * Process an utterance through the dialogue FSM
 */
export async function processUtterance(
  utterance: string,
  currentState: DialogueState,
  currentSlots: ConversationSlots
): Promise<DialogueAction> {
  // If awaiting confirmation, check the response
  if (currentState.confirmation.awaitingConfirmation) {
    const confirmResponse = await isConfirmationResponse(utterance);

    if (confirmResponse === 'yes') {
      // Execute the pending action
      return {
        type: 'execute',
        tool: currentState.pendingTool || undefined,
        toolArgs: currentState.pendingToolArgs || undefined,
        newState: {
          confirmation: {
            awaitingConfirmation: false,
            pendingIntent: null,
            pendingSlots: null,
            confirmationMessage: null,
            clarificationAttempts: 0,
          },
          pendingToolExecution: true,
        },
      };
    }

    if (confirmResponse === 'no') {
      // Ask what they want to change
      return {
        type: 'respond',
        message: 'No problem. What would you like to change?',
        newState: {
          confirmation: {
            ...currentState.confirmation,
            awaitingConfirmation: false,
            clarificationAttempts: 0,
          },
        },
      };
    }

    // Unclear - ask again or escalate
    const attempts = currentState.confirmation.clarificationAttempts + 1;
    if (attempts >= MAX_CLARIFICATION_ATTEMPTS) {
      return {
        type: 'escalate',
        message: "I'm having trouble understanding. Let me connect you with a human agent.",
        newState: {
          currentIntent: 'escalate_to_human',
          confirmation: {
            awaitingConfirmation: false,
            pendingIntent: null,
            pendingSlots: null,
            confirmationMessage: null,
            clarificationAttempts: 0,
          },
        },
      };
    }

    return {
      type: 'clarify',
      message: currentState.confirmation.confirmationMessage || 'Could you please confirm yes or no?',
      newState: {
        confirmation: {
          ...currentState.confirmation,
          clarificationAttempts: attempts,
        },
      },
    };
  }

  // Classify intent if none set or if utterance might indicate new intent
  let intent = currentState.currentIntent;
  if (!intent || currentState.turnsSinceIntent > 5) {
    const classification = await classifyIntent(utterance);
    if (classification.confidence > 0.6) {
      intent = classification.intent;
    }
  }

  if (!intent) {
    intent = 'general_inquiry';
  }

  // Extract slots for the intent
  const extraction = await extractSlots(intent, utterance, currentSlots);
  const newSlots = extraction.slots as ConversationSlots;

  // Check slot completeness
  const slotCheck = checkSlots(intent, newSlots);

  if (!slotCheck.complete) {
    // Ask for missing slot
    return {
      type: 'ask_slot',
      message: slotCheck.nextQuestion || 'Could you provide more details?',
      newState: {
        currentIntent: intent,
        turnsSinceIntent: currentState.turnsSinceIntent + 1,
      },
    };
  }

  // Slots complete - check if confirmation needed
  const confirmMessage = needsConfirmation(intent, newSlots);
  if (confirmMessage) {
    return {
      type: 'confirm',
      message: confirmMessage,
      newState: {
        currentIntent: intent,
        confirmation: {
          awaitingConfirmation: true,
          pendingIntent: intent,
          pendingSlots: newSlots,
          confirmationMessage: confirmMessage,
          clarificationAttempts: 0,
        },
        pendingTool: getToolForIntent(intent),
        pendingToolArgs: newSlots as Record<string, unknown>,
      },
    };
  }

  // No confirmation needed - execute immediately
  return {
    type: 'execute',
    tool: getToolForIntent(intent),
    toolArgs: newSlots as Record<string, unknown>,
    newState: {
      currentIntent: intent,
      pendingToolExecution: true,
    },
  };
}

/**
 * Interpolate slot values into a template string
 */
function interpolateSlots(template: string, slots: ConversationSlots): string {
  return template.replace(/\{(\w+)\}/g, (_, key) => {
    return slots[key] || `{${key}}`;
  });
}

/**
 * Get description for a slot (for GPT-4o function schema)
 */
function getSlotDescription(slot: string): string {
  const descriptions: Record<string, string> = {
    order_id: 'Order ID or order number (e.g., ORD-123456 or 12345678)',
    email: 'Email address',
    phone: 'Phone number',
    refund_reason: 'Reason for refund (damaged, defective, wrong_item, not_as_described, changed_mind, late_delivery, quality_issue, other)',
    preferred_refund_method: 'Preferred refund method (original_payment or store_credit)',
    update_type: 'Type of account update (email, phone, address, name, password)',
    new_value: 'The new value for the account field being updated',
    reason: 'Reason or additional context',
  };

  return descriptions[slot] || `Value for ${slot}`;
}

/**
 * Validate a slot value against its schema
 */
function validateSlotValue(
  slot: string,
  value: string
): { valid: boolean; normalizedValue?: string; error?: string } {
  switch (slot) {
    case 'order_id': {
      const normalized = value.toUpperCase().replace(/\s/g, '');
      if (SLOT_VALIDATION.order_id.test(normalized)) {
        return { valid: true, normalizedValue: normalized };
      }
      return { valid: false, error: 'Invalid order ID format' };
    }

    case 'email': {
      const normalized = value.toLowerCase().trim();
      if (SLOT_VALIDATION.email.test(normalized)) {
        return { valid: true, normalizedValue: normalized };
      }
      return { valid: false, error: 'Invalid email format' };
    }

    case 'phone': {
      const normalized = value.replace(/\s/g, '');
      if (SLOT_VALIDATION.phone.test(normalized)) {
        return { valid: true, normalizedValue: normalized };
      }
      return { valid: false, error: 'Invalid phone format' };
    }

    case 'refund_reason': {
      const normalized = value.toLowerCase().replace(/\s+/g, '_');
      // Try to match to a valid reason
      const match = SLOT_VALIDATION.refund_reason.find(
        (r) => normalized.includes(r) || r.includes(normalized)
      );
      if (match) {
        return { valid: true, normalizedValue: match };
      }
      // Accept as 'other' with the original value
      return { valid: true, normalizedValue: 'other' };
    }

    case 'update_type': {
      const normalized = value.toLowerCase().trim();
      if (SLOT_VALIDATION.update_type.includes(normalized)) {
        return { valid: true, normalizedValue: normalized };
      }
      return { valid: false, error: 'Invalid update type' };
    }

    default:
      // No specific validation - accept as-is
      return { valid: true, normalizedValue: value.trim() };
  }
}

/**
 * Get tool name for an intent
 */
function getToolForIntent(intent: SupportedIntent): string | null {
  const toolMap: Partial<Record<SupportedIntent, string>> = {
    order_status: 'lookupOrder',
    process_refund: 'processRefund',
    cancel_order: 'cancelOrder',
    account_update: 'updateAccount',
    escalate_to_human: 'escalateToHuman',
  };

  return toolMap[intent] || null;
}
