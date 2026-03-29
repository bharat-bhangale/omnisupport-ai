// ============================================================================
// FRAUD DETECTION RTK QUERY API
// ============================================================================

import { createApi, fetchBaseQuery } from '@reduxjs/toolkit/query/react';

// ============================================================================
// TYPES
// ============================================================================

export type RiskLevel = 'low' | 'medium' | 'high' | 'critical';
export type FraudAction = 'blocked' | 'escalated' | 'monitored';

export interface FraudIncident {
  _id: string;
  companyId: string;
  callId: string;
  callerPhone: string;
  compositeScore: number;
  riskLevel: RiskLevel;
  phoneReputationScore: number;
  velocityFlag: boolean;
  conversationScore: number;
  signals: string[];
  action: FraudAction;
  resolvedBy?: string;
  resolvedAt?: string;
  notes?: string;
  transcript?: Array<{ role: string; content: string; timestamp?: string }>;
  createdAt: string;
  updatedAt: string;
}

export interface FraudSummary {
  total: number;
  byRiskLevel: Record<RiskLevel, number>;
  blockedCount: number;
  escalatedCount: number;
  costSaved: number;
}

export interface WatchlistEntry {
  _id: string;
  companyId: string;
  phone: string;
  reason: string;
  addedBy: string;
  createdAt: string;
}

export interface FraudIncidentsParams {
  days?: number;
  page?: number;
  limit?: number;
  riskLevel?: RiskLevel;
  action?: FraudAction;
}

export interface RiskDistribution {
  distribution: Record<RiskLevel, number>;
  total: number;
}

// ============================================================================
// API SLICE
// ============================================================================

export const fraudApi = createApi({
  reducerPath: 'fraudApi',
  baseQuery: fetchBaseQuery({
    baseUrl: import.meta.env.VITE_API_URL || 'http://localhost:3001/api',
    prepareHeaders: (headers) => {
      const token = localStorage.getItem('accessToken');
      if (token) {
        headers.set('Authorization', `Bearer ${token}`);
      }
      return headers;
    },
  }),
  tagTypes: ['FraudIncident', 'Watchlist', 'FraudSummary'],
  endpoints: (builder) => ({
    // ========================================================================
    // GET /fraud/incidents — List fraud incidents
    // ========================================================================
    getFraudIncidents: builder.query<
      {
        incidents: FraudIncident[];
        pagination: { page: number; limit: number; total: number; pages: number };
      },
      FraudIncidentsParams
    >({
      query: (params) => ({
        url: '/fraud/incidents',
        params: {
          days: params.days || 30,
          page: params.page || 1,
          limit: params.limit || 20,
          ...(params.riskLevel && { riskLevel: params.riskLevel }),
          ...(params.action && { action: params.action }),
        },
      }),
      providesTags: (result) =>
        result
          ? [
              ...result.incidents.map(({ _id }) => ({
                type: 'FraudIncident' as const,
                id: _id,
              })),
              { type: 'FraudIncident', id: 'LIST' },
            ]
          : [{ type: 'FraudIncident', id: 'LIST' }],
    }),

    // ========================================================================
    // GET /fraud/incidents/:id — Get incident details
    // ========================================================================
    getFraudIncident: builder.query<{ incident: FraudIncident }, string>({
      query: (id) => `/fraud/incidents/${id}`,
      providesTags: (_result, _error, id) => [{ type: 'FraudIncident', id }],
    }),

    // ========================================================================
    // PATCH /fraud/incidents/:id/resolve — Resolve incident
    // ========================================================================
    resolveIncident: builder.mutation<
      { incident: FraudIncident; message: string },
      { id: string; notes?: string }
    >({
      query: ({ id, notes }) => ({
        url: `/fraud/incidents/${id}/resolve`,
        method: 'PATCH',
        body: { notes },
      }),
      invalidatesTags: (_result, _error, { id }) => [
        { type: 'FraudIncident', id },
        { type: 'FraudIncident', id: 'LIST' },
      ],
    }),

    // ========================================================================
    // GET /fraud/summary — Get fraud summary stats
    // ========================================================================
    getFraudSummary: builder.query<FraudSummary, number | void>({
      query: (days = 30) => `/fraud/summary?days=${days}`,
      providesTags: ['FraudSummary'],
    }),

    // ========================================================================
    // GET /fraud/risk-distribution — Get risk distribution
    // ========================================================================
    getRiskDistribution: builder.query<RiskDistribution, number | void>({
      query: (days = 30) => `/fraud/risk-distribution?days=${days}`,
      providesTags: ['FraudSummary'],
    }),

    // ========================================================================
    // GET /fraud/watchlist — List blocked phones
    // ========================================================================
    getWatchlist: builder.query<{ entries: WatchlistEntry[]; count: number }, void>({
      query: () => '/fraud/watchlist',
      providesTags: (result) =>
        result
          ? [
              ...result.entries.map(({ _id }) => ({
                type: 'Watchlist' as const,
                id: _id,
              })),
              { type: 'Watchlist', id: 'LIST' },
            ]
          : [{ type: 'Watchlist', id: 'LIST' }],
    }),

    // ========================================================================
    // POST /fraud/watchlist — Add to watchlist
    // ========================================================================
    addToWatchlist: builder.mutation<
      { entry: WatchlistEntry; message: string },
      { phone: string; reason: string }
    >({
      query: (data) => ({
        url: '/fraud/watchlist',
        method: 'POST',
        body: data,
      }),
      invalidatesTags: [{ type: 'Watchlist', id: 'LIST' }],
    }),

    // ========================================================================
    // DELETE /fraud/watchlist/:phone — Remove from watchlist
    // ========================================================================
    removeFromWatchlist: builder.mutation<{ success: boolean; message: string }, string>({
      query: (phone) => ({
        url: `/fraud/watchlist/${encodeURIComponent(phone)}`,
        method: 'DELETE',
      }),
      invalidatesTags: [{ type: 'Watchlist', id: 'LIST' }],
    }),
  }),
});

// ============================================================================
// EXPORTS
// ============================================================================

export const {
  useGetFraudIncidentsQuery,
  useGetFraudIncidentQuery,
  useResolveIncidentMutation,
  useGetFraudSummaryQuery,
  useGetRiskDistributionQuery,
  useGetWatchlistQuery,
  useAddToWatchlistMutation,
  useRemoveFromWatchlistMutation,
} = fraudApi;
