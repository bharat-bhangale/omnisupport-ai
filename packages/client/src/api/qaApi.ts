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
  scoreDistribution: Array<{ range: string; count: number }>;
  trendByDay: Array<{ date: string; avgScore: number; count: number }>;
}

export interface ReviewReportRequest {
  id: string;
  reviewNote: string;
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
  }),
});

export const {
  useGetQAReportsQuery,
  useGetQAReportQuery,
  useReviewQAReportMutation,
  useGetQASummaryQuery,
} = qaApi;
