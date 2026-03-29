import { omnisupportApi } from './omnisupportApi';

// ============================================================================
// TYPES
// ============================================================================

export interface GapCluster {
  query: string;
  frequency: number;
  cluster: string;
  gapIds: string[];
}

export interface FeedbackSummaryByType {
  issueType: string;
  channel: 'voice' | 'text';
  count: number;
  avgRating: number;
}

export interface ABResultSnapshot {
  testId: string;
  testName: string;
  variantA: {
    calls: number;
    resolutionRate: number;
  };
  variantB: {
    calls: number;
    resolutionRate: number;
  };
  winner?: 'A' | 'B';
  confidenceLevel?: number;
}

export interface GapReport {
  _id: string;
  companyId: string;
  week: string;
  weekLabel: string;
  topGaps: GapCluster[];
  gapStats: {
    totalGaps: number;
    newGaps: number;
    resolvedGaps: number;
    topChannel: 'voice' | 'text';
  };
  feedbackSummary: {
    byType: FeedbackSummaryByType[];
    totalEvents: number;
    avgRating: number;
    flaggedTypes: string[];
  };
  abResults?: ABResultSnapshot[];
  problemPatterns: {
    escalatedCallsWithManyTurns: number;
    lowConfidenceTickets: number;
    regeneratedResponses: number;
  };
  insights?: string;
  status: 'processing' | 'completed' | 'failed';
  processedAt?: string;
  createdAt: string;
}

export interface KBGap {
  _id: string;
  companyId: string;
  query: string;
  channel: 'voice' | 'text';
  frequency: number;
  status: 'open' | 'in_progress' | 'resolved';
  resolution?: {
    answer: string;
    documentId?: string;
    resolvedBy: string;
    resolvedAt: string;
  };
  firstOccurredAt: string;
  lastOccurredAt: string;
  createdAt: string;
}

export interface ResolveGapRequest {
  answer?: string;
  addToKB?: boolean;
  markResolved?: boolean;
  category?: string;
  title?: string;
}

export interface FeedbackSummary {
  days: number;
  totalEvents: number;
  avgRating: number;
  byIssueType: Array<{
    issueType: string;
    count: number;
    avgRating: number;
  }>;
  byChannel: Array<{
    channel: 'voice' | 'text';
    count: number;
    avgRating: number;
  }>;
  dailyTrend: Array<{
    date: string;
    count: number;
    avgRating: number;
  }>;
  recentEvents: Array<{
    _id: string;
    channel: 'voice' | 'text';
    issueType?: string;
    rating: number;
    notes?: string;
    createdAt: string;
  }>;
}

export interface VariantConfig {
  systemPromptSuffix: string;
  description?: string;
  calls: number;
  resolutionRate: number;
  avgSentiment?: number;
  avgTurns?: number;
}

export interface PromptVariant {
  _id: string;
  companyId: string;
  name: string;
  description: string;
  variantA: VariantConfig;
  variantB: VariantConfig;
  status: 'draft' | 'running' | 'paused' | 'winner_identified' | 'completed';
  winner?: 'A' | 'B';
  winnerDelta?: number;
  confidenceLevel?: number;
  startDate?: string;
  endDate?: string;
  minSampleSize: number;
  targetMetric: 'resolution_rate' | 'sentiment' | 'turn_count';
  createdBy: string;
  activatedBy?: string;
  createdAt: string;
  updatedAt: string;
  // Enriched fields from API
  calculatedConfidence?: number;
  delta?: number;
  leading?: 'A' | 'B';
}

export interface CreateAbTestRequest {
  name: string;
  description: string;
  variantA: {
    systemPromptSuffix: string;
    description?: string;
  };
  variantB: {
    systemPromptSuffix: string;
    description?: string;
  };
  minSampleSize?: number;
  targetMetric?: 'resolution_rate' | 'sentiment' | 'turn_count';
  autoStart?: boolean;
}

// ============================================================================
// API DEFINITION
// ============================================================================

export const learningApi = omnisupportApi.injectEndpoints({
  endpoints: (builder) => ({
    // Gap Reports
    getGapReport: builder.query<{ report: GapReport | null }, void>({
      query: () => '/learning/gap-report',
      providesTags: ['Learning'],
    }),

    getGapReportHistory: builder.query<{ reports: GapReport[] }, void>({
      query: () => '/learning/gap-report/history',
      providesTags: ['Learning'],
    }),

    triggerGapReport: builder.mutation<{ success: boolean; message: string }, void>({
      query: () => ({
        url: '/learning/gap-report/trigger',
        method: 'POST',
      }),
      invalidatesTags: ['Learning'],
    }),

    // KB Gaps
    getGaps: builder.query<{ gaps: KBGap[]; total: number }, { status?: string; limit?: number }>({
      query: (params) => ({
        url: '/learning/gaps',
        params,
      }),
      providesTags: ['Learning'],
    }),

    resolveGap: builder.mutation<{ success: boolean; gap: KBGap; documentId?: string }, { id: string; data: ResolveGapRequest }>({
      query: ({ id, data }) => ({
        url: `/learning/gaps/${id}/resolve`,
        method: 'POST',
        body: data,
      }),
      invalidatesTags: ['Learning'],
    }),

    // Feedback Summary
    getFeedbackSummary: builder.query<FeedbackSummary, { days?: number }>({
      query: (params) => ({
        url: '/learning/feedback-summary',
        params,
      }),
      providesTags: ['Learning'],
    }),

    // A/B Tests
    getAbTests: builder.query<{ activeTests: PromptVariant[]; pastTests: PromptVariant[] }, void>({
      query: () => '/learning/ab-tests',
      providesTags: ['Learning'],
    }),

    createAbTest: builder.mutation<{ test: PromptVariant }, CreateAbTestRequest>({
      query: (data) => ({
        url: '/learning/ab-tests',
        method: 'POST',
        body: data,
      }),
      invalidatesTags: ['Learning'],
    }),

    startAbTest: builder.mutation<{ test: PromptVariant }, string>({
      query: (id) => ({
        url: `/learning/ab-tests/${id}/start`,
        method: 'PATCH',
      }),
      invalidatesTags: ['Learning'],
    }),

    pauseAbTest: builder.mutation<{ test: PromptVariant }, string>({
      query: (id) => ({
        url: `/learning/ab-tests/${id}/pause`,
        method: 'PATCH',
      }),
      invalidatesTags: ['Learning'],
    }),

    activateWinner: builder.mutation<{ success: boolean; test: PromptVariant; message: string }, string>({
      query: (id) => ({
        url: `/learning/ab-tests/${id}/activate-winner`,
        method: 'PATCH',
      }),
      invalidatesTags: ['Learning'],
    }),

    deleteAbTest: builder.mutation<{ success: boolean; message: string }, string>({
      query: (id) => ({
        url: `/learning/ab-tests/${id}`,
        method: 'DELETE',
      }),
      invalidatesTags: ['Learning'],
    }),
  }),
});

export const {
  useGetGapReportQuery,
  useGetGapReportHistoryQuery,
  useTriggerGapReportMutation,
  useGetGapsQuery,
  useResolveGapMutation,
  useGetFeedbackSummaryQuery,
  useGetAbTestsQuery,
  useCreateAbTestMutation,
  useStartAbTestMutation,
  usePauseAbTestMutation,
  useActivateWinnerMutation,
  useDeleteAbTestMutation,
} = learningApi;
