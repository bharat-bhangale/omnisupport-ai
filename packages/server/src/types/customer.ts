import type { SentimentLabel, SupportedLanguage } from '../config/constants.js';
import type { CustomerIntelligenceCard, RecentIssue } from './session.js';

/**
 * Query parameters for customer list endpoint
 */
export interface CustomerListQuery {
  tier?: 'standard' | 'premium' | 'vip' | 'enterprise';
  churnRisk?: 'low' | 'medium' | 'high';
  lastContact?: 'today' | 'week' | 'month' | 'quarter';
  page?: number;
  limit?: number;
  sortBy?: 'name' | 'lifetimeValue' | 'churnRiskScore' | 'lastContactDate';
  sortOrder?: 'asc' | 'desc';
}

/**
 * Customer list response item
 */
export interface CustomerListItem {
  id: string;
  name: string;
  email?: string;
  phone?: string;
  tier: 'standard' | 'premium' | 'vip' | 'enterprise';
  lifetimeValue: number;
  churnRiskScore: number;
  sentimentTrend: 'improving' | 'stable' | 'worsening';
  lastContactDate?: Date;
  openTickets: number;
  totalInteractions: number;
}

/**
 * Paginated customer list response
 */
export interface CustomerListResponse {
  customers: CustomerListItem[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
}

/**
 * Full customer profile response
 */
export interface CustomerProfileResponse {
  customer: CustomerIntelligenceCard;
  recentCalls: CallSummary[];
  recentTickets: TicketSummary[];
  sentimentTimeline: SentimentTimelineResponse;
  communicationPreferences: {
    preferredChannel: 'voice' | 'email' | 'chat';
    preferredLanguage: SupportedLanguage;
    preferredStyle: 'formal' | 'casual' | 'technical';
    verbosity: 'concise' | 'detailed';
  };
}

/**
 * Call summary for customer profile
 */
export interface CallSummary {
  callId: string;
  date: Date;
  duration: number;
  intent?: string;
  summary?: string;
  sentiment?: SentimentLabel;
  resolution?: string;
  agentId?: string;
}

/**
 * Ticket summary for customer profile
 */
export interface TicketSummary {
  ticketId: string;
  externalId: string;
  date: Date;
  subject: string;
  status: string;
  priority: string;
  sentiment?: SentimentLabel;
  resolution?: string;
  aiAssisted: boolean;
}

/**
 * Sentiment data point for timeline
 */
export interface SentimentDataPoint {
  date: Date;
  sentiment: SentimentLabel;
  score: number;
  source: 'call' | 'ticket';
  sourceId: string;
}

/**
 * Sentiment timeline response
 */
export interface SentimentTimelineResponse {
  voice: SentimentDataPoint[];
  text: SentimentDataPoint[];
  combined: SentimentDataPoint[];
  trend: 'improving' | 'stable' | 'worsening';
  averageSentiment: {
    voice: number;
    text: number;
    overall: number;
  };
}

/**
 * Customer update payload
 */
export interface CustomerUpdatePayload {
  tier?: 'standard' | 'premium' | 'vip' | 'enterprise';
  notes?: string;
  knownIssues?: string[];
  tags?: string[];
  preferredStyle?: 'formal' | 'casual' | 'technical';
  verbosity?: 'concise' | 'detailed';
  preferredLanguage?: SupportedLanguage;
}

/**
 * Customer search query
 */
export interface CustomerSearchQuery {
  q: string;
  limit?: number;
}

/**
 * Customer search result
 */
export interface CustomerSearchResult {
  id: string;
  name: string;
  email?: string;
  phone?: string;
  tier: 'standard' | 'premium' | 'vip' | 'enterprise';
  matchField: 'name' | 'email' | 'phone';
  matchScore: number;
}

/**
 * At-risk customer item
 */
export interface AtRiskCustomer extends CustomerListItem {
  riskFactors: string[];
  recommendedActions: string[];
  daysSinceLastContact: number;
}
