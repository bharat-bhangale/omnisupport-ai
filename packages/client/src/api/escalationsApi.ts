import { omnisupportApi } from './omnisupportApi';
import type { Turn, ConversationSlots } from '../types/escalation';

export interface Escalation {
  id: string;
  callId: string;
  callerPhone: string;
  reason: string;
  priority: 'low' | 'medium' | 'high' | 'urgent';
  brief: string;
  lastFiveTurns: Turn[];
  entities: ConversationSlots;
  sentiment: 'positive' | 'neutral' | 'negative';
  status: 'waiting' | 'accepted' | 'resolved' | 'abandoned';
  holdStarted: string;
  acceptedAt?: string;
  acceptedBy?: string;
  resolvedAt?: string;
  disposition?: string;
  note?: string;
  customerName?: string;
  customerTier?: 'standard' | 'premium' | 'vip' | 'enterprise';
  customerKnownIssues?: string[];
}

export interface EscalationListResponse {
  escalations: Escalation[];
  stats: {
    waitingCount: number;
    acceptedCount: number;
    longestHoldSeconds: number;
  };
}

export interface AcceptEscalationResponse {
  success: boolean;
  escalation: {
    id: string;
    status: string;
    acceptedAt: string;
    acceptedBy: string;
  };
}

export interface ResolveEscalationPayload {
  disposition: 'resolved' | 'follow_up_needed' | 'transferred' | 'customer_hung_up' | 'unresolved';
  note?: string;
}

export interface ResolveEscalationResponse {
  success: boolean;
  escalation: {
    id: string;
    status: string;
    resolvedAt: string;
    disposition: string;
  };
}

export interface AcceptNextResponse {
  success: boolean;
  message?: string;
  escalation?: {
    id: string;
    callId: string;
    reason: string;
    priority: string;
    brief: string;
    status: string;
    acceptedAt: string;
  };
}

export const escalationsApi = omnisupportApi.injectEndpoints({
  endpoints: (builder) => ({
    /**
     * Get all waiting and accepted escalations
     * Polls every 15 seconds
     */
    getEscalations: builder.query<EscalationListResponse, void>({
      query: () => '/escalations',
      providesTags: (result) =>
        result
          ? [
              ...result.escalations.map(({ id }) => ({
                type: 'Escalation' as const,
                id,
              })),
              { type: 'Escalation' as const, id: 'LIST' },
            ]
          : [{ type: 'Escalation' as const, id: 'LIST' }],
    }),

    /**
     * Get single escalation with full context
     */
    getEscalation: builder.query<Escalation, string>({
      query: (id) => `/escalations/${id}`,
      providesTags: (_result, _error, id) => [{ type: 'Escalation' as const, id }],
    }),

    /**
     * Accept a specific escalation
     */
    acceptEscalation: builder.mutation<
      AcceptEscalationResponse,
      { id: string; agentPhone?: string }
    >({
      query: ({ id, agentPhone }) => ({
        url: `/escalations/${id}/accept`,
        method: 'POST',
        body: { agentPhone },
      }),
      invalidatesTags: (_result, _error, { id }) => [
        { type: 'Escalation' as const, id },
        { type: 'Escalation' as const, id: 'LIST' },
      ],
    }),

    /**
     * Accept the next highest priority escalation
     */
    acceptNextEscalation: builder.mutation<AcceptNextResponse, { agentPhone?: string } | void>({
      query: (body) => ({
        url: '/escalations/next',
        method: 'POST',
        body: body || {},
      }),
      invalidatesTags: [{ type: 'Escalation' as const, id: 'LIST' }],
    }),

    /**
     * Resolve an escalation with disposition
     */
    resolveEscalation: builder.mutation<
      ResolveEscalationResponse,
      { id: string; data: ResolveEscalationPayload }
    >({
      query: ({ id, data }) => ({
        url: `/escalations/${id}/resolve`,
        method: 'POST',
        body: data,
      }),
      invalidatesTags: (_result, _error, { id }) => [
        { type: 'Escalation' as const, id },
        { type: 'Escalation' as const, id: 'LIST' },
      ],
    }),
  }),
});

// Add 'Escalation' to tag types - this needs to be done in omnisupportApi.ts
// For now, we'll export the hooks

export const {
  useGetEscalationsQuery,
  useGetEscalationQuery,
  useAcceptEscalationMutation,
  useAcceptNextEscalationMutation,
  useResolveEscalationMutation,
} = escalationsApi;
