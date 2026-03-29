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
} = analyticsApi;
