/**
 * Ticket-related types for the frontend
 */

export type TicketStatus = 'new' | 'open' | 'pending' | 'on-hold' | 'solved' | 'closed';
export type TicketPriority = 'P1' | 'P2' | 'P3' | 'P4';
export type InternalPriority = 'low' | 'normal' | 'high' | 'urgent';
export type TicketSource = 'zendesk' | 'freshdesk' | 'email' | 'api' | 'manual';
export type TicketSentiment = 'positive' | 'neutral' | 'negative' | 'highly_negative';
export type DraftTone = 'professional' | 'empathetic' | 'technical';

export interface TicketClassification {
  category: string;
  subCategory?: string;
  priority: TicketPriority;
  confidence: number;
  routeTo: string;
  reasoning: string;
  sentiment: TicketSentiment;
  urgencySignals: string[];
  suggestedTags: string[];
  aiConfident: boolean;
}

export interface AIDraft {
  content: string;
  generatedAt: string;
  approved: boolean;
  approvedBy?: string;
  approvedAt?: string;
  edits?: string;
  tone?: DraftTone;
  referencedKbIds?: string[];
  suggestedActions?: string[];
  needsReview?: boolean;
  reviewReason?: string;
}

export interface RAGContext {
  documentIds: string[];
  chunks: string[];
  relevanceScores: number[];
  articles?: KBArticleRef[];
}

export interface KBArticleRef {
  id: string;
  title: string;
  score: number;
}

export interface TicketSLA {
  responseDeadline: string;
  resolutionDeadline: string;
  firstResponseAt?: string;
  isBreached: boolean;
}

export interface TicketEscalation {
  escalatedAt: string;
  reason: string;
  agentId?: string;
  notes?: string;
}

export interface TicketResolution {
  resolvedAt: string;
  resolvedBy: string;
  resolutionType: 'ai_resolved' | 'human_resolved' | 'auto_closed';
  satisfaction?: number;
}

export interface TicketCustomer {
  _id: string;
  name?: string;
  email?: string;
  phone?: string;
  tier?: 'standard' | 'premium' | 'vip' | 'enterprise';
}

export interface Ticket {
  _id: string;
  companyId: string;
  customerId?: string | TicketCustomer;
  externalId: string;
  source: TicketSource;
  subject: string;
  description: string;
  status: TicketStatus;
  priority: InternalPriority;
  language: string;
  classification?: {
    intent: string;
    subIntent?: string;
    confidence: number;
    categories: string[];
  };
  sentiment: 'positive' | 'neutral' | 'negative';
  assignedTo?: string;
  aiDraft?: AIDraft;
  ragContext?: RAGContext;
  escalation?: TicketEscalation;
  resolution?: TicketResolution;
  sla?: TicketSLA;
  tags: string[];
  metadata: Record<string, unknown>;
  externalUrl?: string;
  flaggedForReview?: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface TicketListQuery {
  status?: TicketStatus;
  priority?: InternalPriority;
  source?: TicketSource;
  assignedTo?: string;
  customerId?: string;
  hasDraft?: boolean;
  page?: number;
  limit?: number;
  sortBy?: 'createdAt' | 'updatedAt' | 'priority' | 'sla.responseDeadline';
  sortOrder?: 'asc' | 'desc';
}

export interface TicketListResponse {
  tickets: Ticket[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
}

export interface SLABreachingResponse {
  breached: Ticket[];
  critical: Ticket[];
  warning: Ticket[];
  total: number;
}

export interface PendingReviewResponse {
  tickets: Ticket[];
  total: number;
}

export interface CreateTicketPayload {
  subject: string;
  description: string;
  customerId?: string;
  customerEmail?: string;
  customerPhone?: string;
  priority?: InternalPriority;
  tags?: string[];
  metadata?: Record<string, unknown>;
}

export interface ReclassifyResponse {
  success: boolean;
  jobId: string;
  message: string;
}

export interface ClassificationFeedback {
  correctedCategory?: string;
  correctedPriority?: TicketPriority;
  correctedRouteTo?: string;
  feedbackType: 'category_wrong' | 'priority_wrong' | 'routing_wrong' | 'sentiment_wrong' | 'correct';
  notes?: string;
}

export interface SendResponsePayload {
  action: 'approve' | 'edit' | 'regenerate';
  editedContent?: string;
  sendToExternal?: boolean;
  addNote?: string;
}

export interface RegenerateDraftPayload {
  tone: DraftTone;
}

export interface DraftFeedback {
  helpful: boolean;
  reason?: string;
}

export interface AIResponsePreview {
  content: string;
  generatedAt: string;
  tokensUsed?: number;
}

// Socket event payloads
export interface TicketClassifiedEvent {
  ticketId: string;
  classification: TicketClassification;
}

export interface TicketDraftReadyEvent {
  ticketId: string;
  draft: AIDraft;
}

export interface TicketUpdatedEvent {
  ticketId: string;
  updates: Partial<Ticket>;
}
