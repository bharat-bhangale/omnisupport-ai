import { z } from 'zod';

/**
 * Priority levels for ticket classification
 */
export const TicketPriority = {
  P1: 'P1', // Critical - SLA: 1 hour response, 4 hour resolution
  P2: 'P2', // High - SLA: 4 hour response, 24 hour resolution
  P3: 'P3', // Normal - SLA: 8 hour response, 48 hour resolution
  P4: 'P4', // Low - SLA: 24 hour response, 72 hour resolution
} as const;

export type TicketPriorityType = typeof TicketPriority[keyof typeof TicketPriority];

/**
 * Sentiment labels for ticket analysis
 */
export const TicketSentiment = {
  POSITIVE: 'positive',
  NEUTRAL: 'neutral',
  NEGATIVE: 'negative',
  HIGHLY_NEGATIVE: 'highly_negative',
} as const;

export type TicketSentimentType = typeof TicketSentiment[keyof typeof TicketSentiment];

/**
 * Zod schema for validating GPT-4o classification output
 */
export const ClassificationSchema = z.object({
  category: z.string().describe('Primary category (e.g., billing, shipping, account, technical)'),
  subCategory: z.string().optional().describe('Sub-category for more specific routing'),
  priority: z.enum(['P1', 'P2', 'P3', 'P4']).describe('Priority level based on urgency signals'),
  confidence: z.number().min(0).max(1).describe('Confidence score for the classification'),
  routeTo: z.string().describe('Queue or team to route the ticket to'),
  reasoning: z.string().describe('Brief explanation for the classification decision'),
  sentiment: z.enum(['positive', 'neutral', 'negative', 'highly_negative']).describe('Customer sentiment'),
  urgencySignals: z.array(z.string()).describe('Detected urgency indicators'),
  suggestedTags: z.array(z.string()).describe('Tags to apply to the ticket'),
  language: z.string().length(2).optional().describe('Detected language code'),
  escalationRequired: z.boolean().optional().describe('Whether immediate escalation is needed'),
  aiConfident: z.boolean().describe('Whether AI is confident enough to auto-respond'),
});

export type Classification = z.infer<typeof ClassificationSchema>;

/**
 * Job data for classification queue
 */
export interface ClassificationJobData {
  ticketId: string;
  companyId: string;
  externalId: string;
  source: 'zendesk' | 'freshdesk' | 'email' | 'api' | 'manual';
  subject: string;
  description: string;
  customerEmail?: string;
  customerPhone?: string;
  customerId?: string;
  existingTags?: string[];
  priority?: string;
  metadata?: Record<string, unknown>;
}

/**
 * Result from classification worker
 */
export interface ClassificationResult {
  ticketId: string;
  classification: Classification;
  fewShotExampleIds?: string[];
  processingTimeMs: number;
}

/**
 * Feedback for classification learning
 */
export const ClassificationFeedbackSchema = z.object({
  ticketId: z.string(),
  originalClassification: ClassificationSchema,
  correctedCategory: z.string().optional(),
  correctedPriority: z.enum(['P1', 'P2', 'P3', 'P4']).optional(),
  correctedRouteTo: z.string().optional(),
  feedbackType: z.enum(['category_wrong', 'priority_wrong', 'routing_wrong', 'sentiment_wrong', 'correct']),
  agentId: z.string(),
  notes: z.string().optional(),
});

export type ClassificationFeedback = z.infer<typeof ClassificationFeedbackSchema>;

/**
 * Response generation job data
 */
export interface ResponseGenerationJobData {
  ticketId: string;
  companyId: string;
  subject: string;
  description: string;
  classification: Classification;
  customerCard?: {
    name?: string;
    tier?: string;
    preferredStyle?: string;
    verbosity?: string;
  };
  kbChunks?: string[];
  language: string;
}

/**
 * AI draft response
 */
export interface AIDraftResponse {
  content: string;
  tone: 'formal' | 'casual' | 'technical';
  referencedKbIds?: string[];
  suggestedActions?: string[];
  needsReview: boolean;
  reviewReason?: string;
}

/**
 * Zendesk webhook payload structure
 */
export interface ZendeskWebhookPayload {
  ticket: {
    id: number;
    external_id?: string;
    subject: string;
    description: string;
    status: string;
    priority: string | null;
    requester: {
      id: number;
      email: string;
      name?: string;
      phone?: string;
    };
    tags: string[];
    created_at: string;
    updated_at: string;
    url?: string;
    custom_fields?: Array<{ id: number; value: string | null }>;
  };
  current_user?: {
    id: number;
    email: string;
    name?: string;
  };
}

/**
 * Freshdesk webhook payload structure
 */
export interface FreshdeskWebhookPayload {
  freshdesk_webhook: {
    ticket_id: number;
    ticket_subject: string;
    ticket_description: string;
    ticket_description_text: string;
    ticket_status: string;
    ticket_priority: string;
    ticket_source: number;
    ticket_requester_email: string;
    ticket_requester_name?: string;
    ticket_requester_phone?: string;
    ticket_tags: string;
    ticket_created_at: string;
    ticket_updated_at: string;
    ticket_url?: string;
    ticket_custom_fields?: Record<string, unknown>;
  };
}

/**
 * SLA configuration per priority
 */
export const SLA_CONFIG: Record<TicketPriorityType, { responseHours: number; resolutionHours: number }> = {
  P1: { responseHours: 1, resolutionHours: 4 },
  P2: { responseHours: 4, resolutionHours: 24 },
  P3: { responseHours: 8, resolutionHours: 48 },
  P4: { responseHours: 24, resolutionHours: 72 },
};

/**
 * Category to routing queue mapping (company-configurable)
 */
export const DEFAULT_ROUTING_RULES: Record<string, string> = {
  billing: 'billing-team',
  shipping: 'logistics-team',
  technical: 'tech-support',
  account: 'account-team',
  refund: 'billing-team',
  complaint: 'escalations',
  general: 'general-support',
  sales: 'sales-team',
  legal: 'legal-team',
};

/**
 * Urgency signal keywords
 */
export const URGENCY_KEYWORDS = [
  'urgent',
  'immediately',
  'asap',
  'critical',
  'emergency',
  'lawsuit',
  'legal action',
  'fraud',
  'unauthorized',
  'stolen',
  'broken',
  'not working',
  'cancel subscription',
  'refund',
  'complaint',
  'escalate',
  'manager',
  'supervisor',
] as const;
