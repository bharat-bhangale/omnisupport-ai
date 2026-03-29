/**
 * Types for escalation feature
 */

export interface Turn {
  role: 'user' | 'assistant' | 'system' | 'tool';
  content: string;
  toolName?: string;
  toolCallId?: string;
  sentiment?: 'positive' | 'neutral' | 'negative';
  confidence?: number;
  timestamp: string;
}

export interface ConversationSlots {
  intent?: string;
  subIntent?: string;
  productId?: string;
  orderId?: string;
  issueCategory?: string;
  urgency?: 'low' | 'medium' | 'high' | 'critical';
  [key: string]: string | undefined;
}

export interface EscalationIncomingEvent {
  escalationId: string;
  callId: string;
  callerPhone: string;
  reason: string;
  priority: 'low' | 'medium' | 'high' | 'urgent';
  brief: string;
  sentiment: 'positive' | 'neutral' | 'negative';
  holdStarted: string;
  customerName?: string;
  customerTier?: 'standard' | 'premium' | 'vip' | 'enterprise';
  timestamp: string;
}

export interface EscalationAcceptedEvent {
  escalationId: string;
  acceptedBy: string;
  acceptedAt: string;
}

export interface EscalationHoldUpdateEvent {
  escalationId: string;
  holdSeconds: number;
}

export interface EscalationResolvedEvent {
  escalationId: string;
  disposition: string;
  resolvedAt: string;
}
