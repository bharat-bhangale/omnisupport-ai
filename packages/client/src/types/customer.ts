/**
 * Customer-related types for the frontend
 */

export type CustomerTier = 'standard' | 'premium' | 'vip' | 'enterprise';
export type SentimentLabel = 'positive' | 'neutral' | 'negative';
export type SentimentTrend = 'improving' | 'stable' | 'worsening';
export type PreferredStyle = 'formal' | 'casual' | 'technical';
export type Verbosity = 'concise' | 'detailed';
export type Channel = 'voice' | 'text';

export interface RecentIssue {
  id: string;
  channel: Channel;
  subject: string;
  status: string;
  createdAt: string;
  resolvedAt?: string;
  sentiment?: SentimentLabel;
}

export interface CustomerIntelligenceCard {
  customerId?: string;
  phone?: string;
  email?: string;
  name?: string;
  tier?: CustomerTier;
  lifetimeValue?: number;
  accountAge?: number;
  lastContactDate?: string;
  openTickets: number;
  totalInteractions: number;
  avgSentiment?: SentimentLabel;
  preferredLanguage?: string;
  recentIssues: RecentIssue[];
  tags?: string[];
  notes?: string;
  preferredStyle?: PreferredStyle;
  verbosity?: Verbosity;
  callSummaries: string[];
  ticketSummaries: string[];
  knownIssues: string[];
  churnRiskScore: number;
  sentimentTrend: SentimentTrend;
}

export interface CustomerListItem {
  id: string;
  name: string;
  email?: string;
  phone?: string;
  tier: CustomerTier;
  lifetimeValue: number;
  churnRiskScore: number;
  sentimentTrend: SentimentTrend;
  lastContactDate?: string;
  openTickets: number;
  totalInteractions: number;
}

export interface CustomerListResponse {
  customers: CustomerListItem[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
}

export interface CustomerListQuery {
  tier?: CustomerTier;
  churnRisk?: 'low' | 'medium' | 'high';
  lastContact?: 'today' | 'week' | 'month' | 'quarter';
  page?: number;
  limit?: number;
  sortBy?: 'name' | 'lifetimeValue' | 'churnRiskScore' | 'lastContactDate';
  sortOrder?: 'asc' | 'desc';
}

export interface CallSummary {
  callId: string;
  date: string;
  duration: number;
  intent?: string;
  summary?: string;
  sentiment?: SentimentLabel;
  resolution?: string;
  agentId?: string;
}

export interface TicketSummary {
  ticketId: string;
  externalId: string;
  date: string;
  subject: string;
  status: string;
  priority: string;
  sentiment?: SentimentLabel;
  resolution?: string;
  aiAssisted: boolean;
}

export interface SentimentDataPoint {
  date: string;
  sentiment: SentimentLabel;
  score: number;
  source: 'call' | 'ticket';
  sourceId: string;
}

export interface SentimentTimelineResponse {
  voice: SentimentDataPoint[];
  text: SentimentDataPoint[];
  combined: SentimentDataPoint[];
  trend: SentimentTrend;
  averageSentiment: {
    voice: number;
    text: number;
    overall: number;
  };
}

export interface CustomerProfileResponse {
  customer: CustomerIntelligenceCard;
  recentCalls: CallSummary[];
  recentTickets: TicketSummary[];
  sentimentTimeline: SentimentTimelineResponse;
  communicationPreferences: {
    preferredChannel: 'voice' | 'email' | 'chat';
    preferredLanguage: string;
    preferredStyle: PreferredStyle;
    verbosity: Verbosity;
  };
}

export interface CustomerUpdatePayload {
  tier?: CustomerTier;
  notes?: string;
  knownIssues?: string[];
  tags?: string[];
  preferredStyle?: PreferredStyle;
  verbosity?: Verbosity;
  preferredLanguage?: string;
}

export interface CustomerSearchResult {
  id: string;
  name: string;
  email?: string;
  phone?: string;
  tier: CustomerTier;
  matchField: 'name' | 'email' | 'phone';
  matchScore: number;
}

export interface AtRiskCustomer extends CustomerListItem {
  riskFactors: string[];
  recommendedActions: string[];
  daysSinceLastContact: number;
}

export interface AtRiskCustomersResponse {
  atRiskCustomers: AtRiskCustomer[];
  total: number;
  highestRisk: number;
}
