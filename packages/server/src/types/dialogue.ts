import type { ConversationSlots } from './session.js';

/**
 * Supported intents for slot-filling FSM
 */
export type SupportedIntent =
  | 'order_status'
  | 'process_refund'
  | 'cancel_order'
  | 'account_update'
  | 'general_inquiry'
  | 'escalate_to_human'
  | 'greeting'
  | 'goodbye'
  | 'unknown';

/**
 * Configuration for an intent's required and optional slots
 */
export interface IntentSlotConfig {
  /** Slots that must be filled before action can be taken */
  required: string[];
  /** Slots that enhance the action but aren't mandatory */
  optional: string[];
  /** Questions to ask for each missing slot */
  questions: Record<string, string>;
  /** Whether to confirm with user before executing action */
  confirmBeforeAction: boolean;
  /** Template message for confirmation (use {slot_name} for interpolation) */
  confirmationMessage?: string;
}

/**
 * Result of checking slot completeness
 */
export interface SlotCheckResult {
  /** Whether all required slots are filled */
  complete: boolean;
  /** The next question to ask, if any slots are missing */
  nextQuestion: string | null;
  /** The name of the missing slot, if any */
  missingSlot: string | null;
  /** List of all missing required slots */
  missingSlots: string[];
  /** List of filled slots */
  filledSlots: string[];
}

/**
 * State of confirmation flow
 */
export interface ConfirmationState {
  /** Whether we're waiting for user confirmation */
  awaitingConfirmation: boolean;
  /** The intent being confirmed */
  pendingIntent: SupportedIntent | null;
  /** The slots for the pending action */
  pendingSlots: ConversationSlots | null;
  /** The confirmation message shown to user */
  confirmationMessage: string | null;
  /** Number of times we've asked for clarification */
  clarificationAttempts: number;
}

/**
 * Result of extracting slots from an utterance
 */
export interface SlotExtractionResult {
  /** Extracted slot values */
  slots: Partial<ConversationSlots>;
  /** Confidence score (0-1) */
  confidence: number;
  /** Whether extraction had any issues */
  hasErrors: boolean;
  /** Validation errors for extracted values */
  validationErrors: SlotValidationError[];
}

/**
 * Validation error for a specific slot
 */
export interface SlotValidationError {
  slot: string;
  value: string;
  error: string;
}

/**
 * User's response to confirmation prompt
 */
export type ConfirmationResponse = 'yes' | 'no' | 'unclear';

/**
 * Result of intent classification
 */
export interface IntentClassificationResult {
  /** The classified intent */
  intent: SupportedIntent;
  /** Confidence score (0-1) */
  confidence: number;
  /** Alternative intents with lower confidence */
  alternatives: Array<{ intent: SupportedIntent; confidence: number }>;
}

/**
 * FSM dialogue state stored in session
 */
export interface DialogueState {
  /** Current detected intent */
  currentIntent: SupportedIntent | null;
  /** Confirmation state */
  confirmation: ConfirmationState;
  /** Number of turns since intent was set */
  turnsSinceIntent: number;
  /** Whether a tool action is pending execution */
  pendingToolExecution: boolean;
  /** The tool to execute when ready */
  pendingTool: string | null;
  /** Arguments for the pending tool */
  pendingToolArgs: Record<string, unknown> | null;
}

/**
 * Action to take after processing an utterance
 */
export interface DialogueAction {
  /** Type of action */
  type: 'ask_slot' | 'confirm' | 'execute' | 'clarify' | 'respond' | 'escalate';
  /** Message to inject into response context */
  message?: string;
  /** Tool to execute (if type is 'execute') */
  tool?: string;
  /** Tool arguments */
  toolArgs?: Record<string, unknown>;
  /** Updated dialogue state */
  newState: Partial<DialogueState>;
}

/**
 * Zod schema definitions for slot validation
 */
export interface SlotValidationSchemas {
  order_id: RegExp;
  email: RegExp;
  phone: RegExp;
  refund_reason: string[];
  update_type: string[];
}

/**
 * Default dialogue state
 */
export function createDefaultDialogueState(): DialogueState {
  return {
    currentIntent: null,
    confirmation: {
      awaitingConfirmation: false,
      pendingIntent: null,
      pendingSlots: null,
      confirmationMessage: null,
      clarificationAttempts: 0,
    },
    turnsSinceIntent: 0,
    pendingToolExecution: false,
    pendingTool: null,
    pendingToolArgs: null,
  };
}
