import { omnisupportApi } from './omnisupportApi';
import type { SLAComplianceData, PriorityCompliance } from '../components/SLAComplianceTable';

export interface SLAPolicyTier {
  responseMinutes: number;
  resolutionHours: number;
}

export interface SLAPolicy {
  P1: SLAPolicyTier;
  P2: SLAPolicyTier;
  P3: SLAPolicyTier;
  P4: SLAPolicyTier;
}

export interface AtRiskTicket {
  ticketId: string;
  subject: string;
  priority: string;
  category?: string;
  slaStatus: 'warning' | 'critical';
  minutesLeft: number;
  assignedAgent: string | null;
  responseDeadline: string;
}

export interface SLAHistoryDay {
  date: string;
  total: number;
  P1: number;
  P2: number;
  P3: number;
  P4: number;
}

export interface SLASummary {
  openWithSLA: number;
  critical: number;
  warning: number;
  breachesToday: number;
}

// Breach types
export interface SLABreach {
  _id: string;
  ticketId: string;
  subject: string;
  priority: 'P1' | 'P2' | 'P3' | 'P4';
  category: string;
  overdueMinutes: number;
  assignedAgent: string | null;
  assignedAgentName?: string;
  resolved: boolean;
  rootCause?: string;
  reviewedBy?: { _id: string; name: string };
  reviewedAt?: string;
  breachedAt: string;
  createdAt: string;
}

export interface SLABreachesResponse {
  breaches: SLABreach[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
}

export interface SLABreachesParams {
  priority?: 'P1' | 'P2' | 'P3' | 'P4';
  category?: string;
  startDate?: string;
  endDate?: string;
  page?: number;
  limit?: number;
}

export interface ReviewBreachRequest {
  id: string;
  rootCause: string;
}

export interface SLATrendData {
  overallRate: number;
  trendVsLastPeriod: number;
  byPriority: {
    priority: string;
    total: number;
    onTime: number;
    breached: number;
    rate: number;
  }[];
  topBreachCategories: { category: string; count: number }[];
}

export const slaApi = omnisupportApi.injectEndpoints({
  endpoints: (builder) => ({
    /**
     * Get SLA compliance stats per priority tier
     */
    getSLACompliance: builder.query<
      { period: { days: number; startDate: string }; compliance: SLAComplianceData; trend: SLATrendData },
      { days?: number }
    >({
      query: ({ days = 30 }) => `/sla/compliance?days=${days}`,
      providesTags: ['SLA'],
    }),

    /**
     * Get tickets at risk of SLA breach
     */
    getAtRiskTickets: builder.query<{ tickets: AtRiskTicket[]; total: number }, void>({
      query: () => '/sla/at-risk',
      providesTags: ['SLA'],
    }),

    /**
     * Get SLA breach history for trend chart
     */
    getSLAHistory: builder.query<
      { period: { days: number; startDate: string }; history: SLAHistoryDay[] },
      { days?: number }
    >({
      query: ({ days = 30 }) => `/sla/history?days=${days}`,
      providesTags: ['SLA'],
    }),

    /**
     * Get SLA breaches with filtering and pagination
     */
    getSLABreaches: builder.query<SLABreachesResponse, SLABreachesParams>({
      query: (params) => {
        const searchParams = new URLSearchParams();
        if (params.priority) searchParams.set('priority', params.priority);
        if (params.category) searchParams.set('category', params.category);
        if (params.startDate) searchParams.set('startDate', params.startDate);
        if (params.endDate) searchParams.set('endDate', params.endDate);
        if (params.page) searchParams.set('page', params.page.toString());
        if (params.limit) searchParams.set('limit', params.limit.toString());
        return `/sla/breaches?${searchParams.toString()}`;
      },
      providesTags: ['SLA'],
    }),

    /**
     * Review a breach (manager only)
     */
    reviewBreach: builder.mutation<{ breach: SLABreach }, ReviewBreachRequest>({
      query: ({ id, rootCause }) => ({
        url: `/sla/breaches/${id}/review`,
        method: 'PATCH',
        body: { rootCause },
      }),
      invalidatesTags: ['SLA'],
    }),

    /**
     * Get current SLA policy
     */
    getSLAPolicy: builder.query<{ policy: SLAPolicy }, void>({
      query: () => '/sla/policy',
      providesTags: ['SLA'],
    }),

    /**
     * Update SLA policy (admin only)
     */
    updateSLAPolicy: builder.mutation<
      { success: boolean; message: string; policy: SLAPolicy },
      SLAPolicy
    >({
      query: (policy) => ({
        url: '/sla/policy',
        method: 'PATCH',
        body: policy,
      }),
      invalidatesTags: ['SLA'],
    }),

    /**
     * Get quick SLA summary
     */
    getSLASummary: builder.query<SLASummary, void>({
      query: () => '/sla/summary',
      providesTags: ['SLA'],
    }),
  }),
});

export const {
  useGetSLAComplianceQuery,
  useGetAtRiskTicketsQuery,
  useGetSLAHistoryQuery,
  useGetSLABreachesQuery,
  useReviewBreachMutation,
  useGetSLAPolicyQuery,
  useUpdateSLAPolicyMutation,
  useGetSLASummaryQuery,
} = slaApi;

// Re-export types
export type { SLAComplianceData, PriorityCompliance };
