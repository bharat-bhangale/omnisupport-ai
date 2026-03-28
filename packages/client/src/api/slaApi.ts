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

export const slaApi = omnisupportApi.injectEndpoints({
  endpoints: (builder) => ({
    /**
     * Get SLA compliance stats per priority tier
     */
    getSLACompliance: builder.query<
      { period: { days: number; startDate: string }; compliance: SLAComplianceData },
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
  useGetSLAPolicyQuery,
  useUpdateSLAPolicyMutation,
  useGetSLASummaryQuery,
} = slaApi;

// Re-export types
export type { SLAComplianceData, PriorityCompliance };
