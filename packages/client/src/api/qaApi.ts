import { omnisupportApi } from './omnisupportApi';

export interface QADimensionScore {
  score: number;
  reasoning: string;
  weight: number;
}

export interface QAReport {
  _id: string;
  companyId: string;
  interactionId: string;
  channel: 'voice' | 'text';
  overallScore: number;
  dimensions: {
    intentUnderstanding: QADimensionScore;
    responseAccuracy: QADimensionScore;
    resolutionSuccess: QADimensionScore;
    escalationCorrectness: QADimensionScore;
    customerExperience: QADimensionScore;
  };
  flaggedForReview: boolean;
  flaggedDimensions: string[];
  reviewedBy?: {
    _id: string;
    name: string;
    email: string;
  };
  reviewNote?: string;
  createdAt: string;
  updatedAt: string;
}

export interface QAReportsResponse {
  reports: QAReport[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
}

export interface QAReportsParams {
  days?: number;
  channel?: 'voice' | 'text';
  flaggedOnly?: boolean;
  minScore?: number;
  maxScore?: number;
  page?: number;
  limit?: number;
}

export interface QASummary {
  avgOverallScore: number;
  avgByDimension: {
    intentUnderstanding: number;
    responseAccuracy: number;
    resolutionSuccess: number;
    escalationCorrectness: number;
    customerExperience: number;
  };
  totalReports: number;
  flaggedCount: number;
  coverage: number; // percentage of interactions scored
  trendVsLastPeriod: number; // difference from previous period
  scoreDistribution: Array<{ range: string; count: number }>;
  trendByDay: Array<{ date: string; avgScore: number; count: number }>;
}

export interface ReviewReportRequest {
  id: string;
  reviewNote: string;
}

// Agent leaderboard types
export interface AgentQAStats {
  agentId: string;
  agentName: string;
  agentEmail: string;
  avgScore: number;
  totalInteractions: number;
  aiDraftUsagePercent: number;
  trend: number; // change vs previous period
  rank: number;
}

export interface AgentLeaderboardResponse {
  leaderboard: AgentQAStats[];
  currentAgentId: string;
  period: { start: string; end: string };
}

// QA Rubric configuration types
export interface QARubricDimension {
  name: string;
  key: string;
  weight: number; // 0-100, all must sum to 100
  minPassScore: number; // 0-10
  scoringGuide: string; // Instructions for GPT-4o
}

export interface QARubric {
  _id: string;
  companyId: string;
  dimensions: QARubricDimension[];
  version: number;
  updatedBy?: { _id: string; name: string };
  updatedAt: string;
}

export interface UpdateRubricRequest {
  dimensions: Omit<QARubricDimension, 'name' | 'key'>[];
}

export interface TestRubricResponse {
  interactionId: string;
  channel: 'voice' | 'text';
  scores: {
    dimension: string;
    score: number;
    reasoning: string;
    passed: boolean;
  }[];
  overallScore: number;
}

export const qaApi = omnisupportApi.injectEndpoints({
  endpoints: (builder) => ({
    // Get paginated QA reports
    getQAReports: builder.query<QAReportsResponse, QAReportsParams>({
      query: (params) => {
        const searchParams = new URLSearchParams();
        if (params.days) searchParams.set('days', params.days.toString());
        if (params.channel) searchParams.set('channel', params.channel);
        if (params.flaggedOnly) searchParams.set('flaggedOnly', 'true');
        if (params.minScore !== undefined) searchParams.set('minScore', params.minScore.toString());
        if (params.maxScore !== undefined) searchParams.set('maxScore', params.maxScore.toString());
        if (params.page) searchParams.set('page', params.page.toString());
        if (params.limit) searchParams.set('limit', params.limit.toString());
        return `/qa/reports?${searchParams.toString()}`;
      },
      providesTags: ['QAReport'],
    }),

    // Get single QA report
    getQAReport: builder.query<{ report: QAReport }, string>({
      query: (id) => `/qa/reports/${id}`,
      providesTags: (_, __, id) => [{ type: 'QAReport', id }],
    }),

    // Review a QA report
    reviewQAReport: builder.mutation<{ report: QAReport }, ReviewReportRequest>({
      query: ({ id, reviewNote }) => ({
        url: `/qa/reports/${id}/review`,
        method: 'PATCH',
        body: { reviewNote },
      }),
      invalidatesTags: ['QAReport'],
    }),

    // Get QA summary stats
    getQASummary: builder.query<QASummary, { days?: number }>({
      query: ({ days = 30 }) => `/qa/summary?days=${days}`,
      providesTags: ['QAReport'],
    }),

    // Get agent QA leaderboard
    getAgentLeaderboard: builder.query<AgentLeaderboardResponse, { days?: number }>({
      query: ({ days = 30 }) => `/qa/leaderboard?days=${days}`,
      providesTags: ['QAReport'],
    }),

    // Get QA rubric configuration
    getQARubric: builder.query<{ rubric: QARubric }, void>({
      query: () => '/qa/rubric',
      providesTags: ['QARubric'],
    }),

    // Update QA rubric
    updateQARubric: builder.mutation<{ rubric: QARubric }, UpdateRubricRequest>({
      query: (data) => ({
        url: '/qa/rubric',
        method: 'PUT',
        body: data,
      }),
      invalidatesTags: ['QARubric'],
    }),

    // Test rubric on a specific interaction
    testQARubric: builder.mutation<TestRubricResponse, string>({
      query: (interactionId) => ({
        url: `/qa/rubric/test/${interactionId}`,
        method: 'POST',
      }),
    }),

    // Test rubric on last N interactions
    testQARubricBatch: builder.mutation<{ results: TestRubricResponse[] }, { count?: number }>({
      query: ({ count = 10 }) => ({
        url: `/qa/rubric/test?count=${count}`,
        method: 'POST',
      }),
    }),
  }),
});

export const {
  useGetQAReportsQuery,
  useGetQAReportQuery,
  useReviewQAReportMutation,
  useGetQASummaryQuery,
  useGetAgentLeaderboardQuery,
  useGetQARubricQuery,
  useUpdateQARubricMutation,
  useTestQARubricMutation,
  useTestQARubricBatchMutation,
} = qaApi;
