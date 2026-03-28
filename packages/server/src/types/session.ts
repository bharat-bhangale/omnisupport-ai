import type { SupportedLanguage, SentimentLabel, Channel, EscalationReason } from '../config/constants.js';
import type { DialogueState } from './dialogue.js';

/**
 * Input for creating a new conversation turn
 */
export interface TurnInput {
  role: 'user' | 'assistant' | 'system' | 'tool';
  content: string;
  toolName?: string;
  toolCallId?: string;
  sentiment?: SentimentLabel;
  confidence?: number;
}

/**
 * A conversation turn with timestamp
 */
export interface Turn extends TurnInput {
  timestamp: Date;
}

/**
 * Slots extracted from the conversation (dynamic key-value pairs)
 */
export interface ConversationSlots {
  intent?: string;
  subIntent?: string;
  productId?: string;
  orderId?: string;
  issueCategory?: string;
  urgency?: 'low' | 'medium' | 'high' | 'critical';
  [key: string]: string | undefined;
}

/**
 * Parameters for initializing a new session
 */
export interface InitSessionParams {
  callId: string;
  companyId: string;
  callerPhone: string;
  language: SupportedLanguage;
  customerId?: string;
  metadata?: Record<string, unknown>;
}

/**
 * The in-memory/Redis session state during a call
 */
export interface CallSessionState {
  callId: string;
  companyId: string;
  callerPhone: string;
  customerId?: string;
  language: SupportedLanguage;
  turns: Turn[];
  slots: ConversationSlots;
  dialogueState: DialogueState;
  startedAt: Date;
  lastActivityAt: Date;
  customerCard?: CustomerIntelligenceCard;
  proactiveContext?: string;
  metadata?: Record<string, unknown>;
}

/**
 * Customer intelligence card with 360-degree view
 */
export interface CustomerIntelligenceCard {
  customerId?: string;
  phone?: string;
  email?: string;
  name?: string;
  tier?: 'standard' | 'premium' | 'vip' | 'enterprise';
  lifetimeValue?: number;
  accountAge?: number; // in days
  lastContactDate?: Date;
  openTickets: number;
  totalInteractions: number;
  avgSentiment?: SentimentLabel;
  preferredLanguage?: SupportedLanguage;
  recentIssues: RecentIssue[];
  tags?: string[];
  notes?: string;
}

/**
 * A recent issue from ticket or call history
 */
export interface RecentIssue {
  id: string;
  channel: Channel;
  subject: string;
  status: string;
  createdAt: Date;
  resolvedAt?: Date;
  sentiment?: SentimentLabel;
}

/**
 * Parameters for building the system prompt
 */
export interface SystemPromptParams {
  companyName: string;
  agentName: string;
  agentGreeting: string;
  customerCard?: CustomerIntelligenceCard;
  language: SupportedLanguage;
  proactiveContext?: string;
  customInstructions?: string;
  escalationThreshold?: number;
}

/**
 * Escalation context passed when transferring to human
 */
export interface EscalationContext {
  callId: string;
  companyId: string;
  reason: EscalationReason;
  summary: string;
  customerCard?: CustomerIntelligenceCard;
  conversationHistory: Turn[];
  suggestedNextSteps?: string[];
  priority: 'low' | 'medium' | 'high' | 'urgent';
}

/**
 * Vapi webhook event types
 */
export type VapiEventType =
  | 'call-started'
  | 'speech-started'
  | 'speech-ended'
  | 'transcript'
  | 'tool-call'
  | 'end-of-call-report'
  | 'hang'
  | 'status-update';

/**
 * Base Vapi webhook payload
 */
export interface VapiWebhookPayload {
  type: VapiEventType;
  call: VapiCall;
  timestamp?: string;
}

/**
 * Vapi call object
 */
export interface VapiCall {
  id: string;
  orgId: string;
  createdAt: string;
  updatedAt: string;
  type: 'inbound' | 'outbound';
  status: 'queued' | 'ringing' | 'in-progress' | 'forwarding' | 'ended';
  endedReason?: string;
  customer?: {
    number: string;
    name?: string;
  };
  phoneNumber?: {
    id: string;
    number: string;
  };
  assistantId?: string;
  metadata?: Record<string, unknown>;
}

/**
 * Vapi transcript event payload
 */
export interface VapiTranscriptPayload extends VapiWebhookPayload {
  type: 'transcript';
  transcript: string;
  role: 'user' | 'assistant';
  isFinal: boolean;
}

/**
 * Vapi end-of-call report payload
 */
export interface VapiEndOfCallReportPayload extends VapiWebhookPayload {
  type: 'end-of-call-report';
  endedReason: string;
  transcript: string;
  summary?: string;
  recordingUrl?: string;
  stereoRecordingUrl?: string;
  durationSeconds: number;
  cost?: {
    stt: number;
    llm: number;
    tts: number;
    total: number;
  };
}

/**
 * Vapi tool call payload
 */
export interface VapiToolCallPayload extends VapiWebhookPayload {
  type: 'tool-call';
  toolCall: {
    id: string;
    name: string;
    arguments: Record<string, unknown>;
  };
}

/**
 * Summary job data for BullMQ
 */
export interface SummaryJobData {
  interactionId: string;
  companyId: string;
  channel: Channel;
}

/**
 * Sentiment analysis result
 */
export interface SentimentResult {
  label: SentimentLabel;
  score: number;
  confidence: number;
}
