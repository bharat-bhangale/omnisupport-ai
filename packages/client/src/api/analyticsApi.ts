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
  }),
});

export const { useGetAgentStatsQuery, useGetAnalyticsSummaryQuery } = analyticsApi;
