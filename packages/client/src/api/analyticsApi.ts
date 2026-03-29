import { omnisupportApi } from './omnisupportApi';

export interface AgentStatsResponse {
  stats: {
    ticketsHandledWeek: number;
    ticketsHandledMonth: number;
    aiDraftUsedPercentage: number;
    averageResponseTime: number;
  };
  topIssues: Array<{
    type: string;
    label: string;
    count: number;
  }>;
  draftUsageByDay: Array<{
    date: string;
    draftsUsed: number;
    draftsEdited: number;
  }>;
}

export interface AnalyticsSummary {
  ticketMetrics: {
    total: number;
    resolved: number;
    pending: number;
    averageResolutionTime: number;
  };
  aiMetrics: {
    draftAcceptanceRate: number;
    averageConfidence: number;
    editRate: number;
  };
  slaMetrics: {
    compliance: number;
    breaches: number;
  };
}

export interface DashboardSummary {
  activeCalls: number;
  openTickets: number;
  openTicketTrend: number;
  aiResolutionRate: number;
  resolutionRateTrend: number;
  costSavedToday: number;
  interactionsToday: number;
  waitingEscalations: number;
  timestamp: string;
}

export interface ActivityItem {
  id: string;
  type: string;
  description: string;
  category?: string;
  timestamp: string;
  sentiment?: string;
  priority?: string;
}

export interface ActivityResponse {
  activities: ActivityItem[];
  timestamp: string;
}

export interface ActiveCall {
  id: string;
  phone: string;
  intent: string;
  sentiment: string;
  confidence: number;
  startedAt: string;
  duration: number;
}

export interface ActiveCallsResponse {
  calls: ActiveCall[];
}

export interface RecentTicket {
  id: string;
  subject: string;
  status: string;
  priority: string;
  category?: string;
  createdAt: string;
  hasDraft: boolean;
}

export interface RecentTicketsResponse {
  tickets: RecentTicket[];
}

export interface ResolutionChartData {
  date: string;
  aiResolved: number;
  humanResolved: number;
  total: number;
}

export interface ResolutionChartResponse {
  data: ResolutionChartData[];
}

export interface SystemService {
  status: 'healthy' | 'degraded' | 'unhealthy';
  lastSync?: string;
}

export interface SystemStatusResponse {
  services: Record<string, SystemService>;
}

export interface CallHistoryItem {
  id: string;
  phone: string;
  intent: string;
  sentiment: string;
  status: 'active' | 'completed' | 'escalated';
  startedAt: string;
  endedAt?: string;
  duration: number;
  qaScore?: number;
  resolution?: string;
}

export interface CallHistoryResponse {
  calls: CallHistoryItem[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    pages: number;
  };
}

export interface CallHistoryParams {
  page?: number;
  limit?: number;
  status?: string;
  days?: number;
}

// ============================================================================
// F17: Unified Analytics Types
// ============================================================================

export interface UnifiedSummary {
  aiResolutionRate: number;
  totalInteractions: number;
  costSaved: number;
  avgHandleTime: number;
  callCount: number;
  ticketCount: number;
  escalationCount: number;
  cachedAt: string;
}

export interface DailyResolutionRate {
  date: string;
  totalCalls: number;
  resolvedByAI: number;
  escalated: number;
  resolutionRate: number;
}

export interface DailyTicketVolume {
  date: string;
  category: string;
  count: number;
}

export interface CostSavings {
  callSavings: number;
  ticketSavings: number;
  total: number;
  callCount: number;
  ticketCount: number;
}

export interface TopIntent {
  intent: string;
  count: number;
  resolutionRate: number;
}

export interface SentimentTrend {
  date: string;
  avgScore: number;
  voiceAvg: number;
  textAvg: number;
}

export interface SLACompliance {
  P1: { total: number; breached: number; rate: number };
  P2: { total: number; breached: number; rate: number };
  P3: { total: number; breached: number; rate: number };
  P4: { total: number; breached: number; rate: number };
}

export interface KBHealth {
  totalQueries: number;
  unanswered: number;
  hitRate: number;
}

export interface ChannelDistribution {
  channel: string;
  count: number;
}

export interface FullAnalytics {
  summary: UnifiedSummary;
  resolutionRate: DailyResolutionRate[];
  ticketVolume: DailyTicketVolume[];
  costSavings: CostSavings;
  topIntents: TopIntent[];
  sentimentTrend: SentimentTrend[];
  slaCompliance: SLACompliance;
  kbHealth: KBHealth;
  channelDistribution: ChannelDistribution[];
  cachedAt: string;
}

export const analyticsApi = omnisupportApi.injectEndpoints({
  endpoints: (builder) => ({
    /**
     * Get agent-specific stats for the logged-in user
     */
    getAgentStats: builder.query<AgentStatsResponse, void>({
      query: () => '/analytics/agent-stats',
      providesTags: ['Analytics'],
    }),

    /**
     * Get company-wide analytics summary
     */
    getAnalyticsSummary: builder.query<AnalyticsSummary, { period: 'day' | 'week' | 'month' }>({
      query: ({ period }) => `/analytics/summary?period=${period}`,
      providesTags: ['Analytics'],
    }),

    /**
     * Get dashboard summary stats
     */
    getDashboardSummary: builder.query<DashboardSummary, { days?: number }>({
      query: ({ days = 1 }) => `/analytics/dashboard?days=${days}`,
      providesTags: ['Analytics'],
    }),

    /**
     * Get live activity feed (poll every 30s)
     */
    getLiveActivity: builder.query<ActivityResponse, { limit?: number }>({
      query: ({ limit = 10 }) => `/analytics/activity?limit=${limit}`,
      providesTags: ['Analytics'],
    }),

    /**
     * Get active calls
     */
    getActiveCalls: builder.query<ActiveCallsResponse, void>({
      query: () => '/analytics/active-calls',
      providesTags: ['Calls'],
    }),

    /**
     * Get recent tickets
     */
    getRecentTickets: builder.query<RecentTicketsResponse, { limit?: number }>({
      query: ({ limit = 5 }) => `/analytics/recent-tickets?limit=${limit}`,
      providesTags: ['Tickets'],
    }),

    /**
     * Get resolution chart data
     */
    getResolutionChart: builder.query<ResolutionChartResponse, void>({
      query: () => '/analytics/resolution-chart',
      providesTags: ['Analytics'],
    }),

    /**
     * Get system status
     */
    getSystemStatus: builder.query<SystemStatusResponse, void>({
      query: () => '/analytics/system-status',
      providesTags: ['Analytics'],
    }),

    /**
     * Get call history with QA scores
     */
    getCallHistory: builder.query<CallHistoryResponse, CallHistoryParams>({
      query: ({ page = 1, limit = 20, status, days = 7 }) => {
        const params = new URLSearchParams();
        params.set('page', String(page));
        params.set('limit', String(limit));
        params.set('days', String(days));
        if (status) params.set('status', status);
        return `/analytics/call-history?${params.toString()}`;
      },
      providesTags: ['Calls'],
    }),

    // ========================================================================
    // F17: Unified Analytics Endpoints
    // ========================================================================

    /**
     * Get unified summary with caching
     */
    getUnifiedSummary: builder.query<UnifiedSummary, { days?: number }>({
      query: ({ days = 30 }) => `/analytics/unified-summary?days=${days}`,
      providesTags: ['Analytics'],
    }),

    /**
     * Get daily resolution rate data
     */
    getResolutionRateData: builder.query<{ data: DailyResolutionRate[] }, { days?: number }>({
      query: ({ days = 30 }) => `/analytics/resolution-rate?days=${days}`,
      providesTags: ['Analytics'],
    }),

    /**
     * Get cost savings breakdown
     */
    getCostSavings: builder.query<CostSavings, { days?: number }>({
      query: ({ days = 30 }) => `/analytics/cost-savings?days=${days}`,
      providesTags: ['Analytics'],
    }),

    /**
     * Get top intents
     */
    getTopIntents: builder.query<{ data: TopIntent[] }, { days?: number }>({
      query: ({ days = 30 }) => `/analytics/top-intents?days=${days}`,
      providesTags: ['Analytics'],
    }),

    /**
     * Get sentiment trend
     */
    getSentimentTrend: builder.query<{ data: SentimentTrend[] }, { days?: number }>({
      query: ({ days = 30 }) => `/analytics/sentiment?days=${days}`,
      providesTags: ['Analytics'],
    }),

    /**
     * Get SLA compliance by priority
     */
    getSLACompliance: builder.query<SLACompliance, { days?: number }>({
      query: ({ days = 30 }) => `/analytics/sla?days=${days}`,
      providesTags: ['Analytics'],
    }),

    /**
     * Get knowledge base health
     */
    getKBHealth: builder.query<KBHealth, { days?: number }>({
      query: ({ days = 30 }) => `/analytics/kb-health?days=${days}`,
      providesTags: ['Analytics'],
    }),

    /**
     * Get ticket volume by category
     */
    getTicketVolume: builder.query<{ data: DailyTicketVolume[] }, { days?: number }>({
      query: ({ days = 30 }) => `/analytics/ticket-volume?days=${days}`,
      providesTags: ['Analytics'],
    }),

    /**
     * Get channel distribution
     */
    getChannelDistribution: builder.query<{ data: ChannelDistribution[] }, { days?: number }>({
      query: ({ days = 30 }) => `/analytics/channel-distribution?days=${days}`,
      providesTags: ['Analytics'],
    }),

    /**
     * Get full analytics (cached)
     */
    getFullAnalytics: builder.query<FullAnalytics, { days?: number }>({
      query: ({ days = 30 }) => `/analytics/full?days=${days}`,
      providesTags: ['Analytics'],
    }),
  }),
});

export const {
  useGetAgentStatsQuery,
  useGetAnalyticsSummaryQuery,
  useGetDashboardSummaryQuery,
  useGetLiveActivityQuery,
  useGetActiveCallsQuery,
  useGetRecentTicketsQuery,
  useGetResolutionChartQuery,
  useGetSystemStatusQuery,
  useGetCallHistoryQuery,
  // F17 hooks
  useGetUnifiedSummaryQuery,
  useGetResolutionRateDataQuery,
  useGetCostSavingsQuery,
  useGetTopIntentsQuery,
  useGetSentimentTrendQuery,
  useGetSLAComplianceQuery,
  useGetKBHealthQuery,
  useGetTicketVolumeQuery,
  useGetChannelDistributionQuery,
  useGetFullAnalyticsQuery,
} = analyticsApi;
