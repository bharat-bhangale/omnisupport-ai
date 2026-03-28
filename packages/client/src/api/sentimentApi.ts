import { omnisupportApi } from './omnisupportApi';

export interface SentimentTimelineEntry {
  date: string;
  score: number;
  channel: 'voice' | 'email' | 'chat';
}

export interface ChannelBreakdown {
  avg: number;
  count: number;
}

export interface ChurnRiskResponse {
  customer: {
    id: string;
    name: string;
    email?: string;
    tier: string;
  };
  churnRisk: {
    score: number;
    level: 'low' | 'medium' | 'high';
    timeline: SentimentTimelineEntry[];
    channelBreakdown: {
      voice: ChannelBreakdown;
      text: ChannelBreakdown;
    };
    contactFrequency: number;
  };
}

export interface AtRiskCustomer {
  id: string;
  name: string;
  email?: string;
  tier: string;
  churnRiskScore: number;
  riskLevel: 'low' | 'medium' | 'high';
}

export interface AtRiskCustomersResponse {
  customers: AtRiskCustomer[];
  total: number;
}

export const sentimentApi = omnisupportApi.injectEndpoints({
  endpoints: (builder) => ({
    /**
     * Get churn risk for a specific customer
     */
    getCustomerChurnRisk: builder.query<ChurnRiskResponse, string>({
      query: (customerId) => `/customers/${customerId}/churn-risk`,
      providesTags: (_result, _error, customerId) => [
        { type: 'Customer' as const, id: `${customerId}-churn` },
      ],
    }),

    /**
     * Get top at-risk customers
     */
    getAtRiskCustomers: builder.query<AtRiskCustomersResponse, void>({
      query: () => '/analytics/churn-risk',
      providesTags: [{ type: 'AtRiskCustomers' as const, id: 'LIST' }],
    }),
  }),
});

export const {
  useGetCustomerChurnRiskQuery,
  useGetAtRiskCustomersQuery,
} = sentimentApi;
