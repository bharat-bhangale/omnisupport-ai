import { omnisupportApi } from './omnisupportApi';
import type {
  CustomerListResponse,
  CustomerListQuery,
  CustomerProfileResponse,
  CustomerUpdatePayload,
  CustomerSearchResult,
  AtRiskCustomersResponse,
  SentimentTimelineResponse,
  CustomerIntelligenceCard,
} from '../types/customer';

export const customersApi = omnisupportApi.injectEndpoints({
  endpoints: (builder) => ({
    /**
     * Get paginated list of customers with filters
     */
    getCustomers: builder.query<CustomerListResponse, CustomerListQuery | undefined>({
      query: (params) => {
        const queryParams: Record<string, string | number> = {
          page: params?.page ?? 1,
          limit: params?.limit ?? 20,
          sortBy: params?.sortBy ?? 'lastContactDate',
          sortOrder: params?.sortOrder ?? 'desc',
        };

        if (params?.tier) {
          queryParams.tier = params.tier;
        }
        if (params?.churnRisk) {
          queryParams.churnRisk = params.churnRisk;
        }
        if (params?.lastContact) {
          queryParams.lastContact = params.lastContact;
        }

        return {
          url: '/customers',
          params: queryParams,
        };
      },
      providesTags: (result) =>
        result
          ? [
              ...result.customers.map(({ id }) => ({ type: 'Customers' as const, id })),
              { type: 'Customers' as const, id: 'LIST' },
            ]
          : [{ type: 'Customers' as const, id: 'LIST' }],
    }),

    /**
     * Get full customer profile by ID
     */
    getCustomer: builder.query<CustomerProfileResponse, string>({
      query: (id) => `/customers/${id}`,
      providesTags: (_result, _error, id) => [{ type: 'Customer' as const, id }],
    }),

    /**
     * Get customer intelligence card (lightweight)
     */
    getCustomerCard: builder.query<{ customer: CustomerIntelligenceCard }, string>({
      query: (id) => `/customers/${id}/card`,
      providesTags: (_result, _error, id) => [{ type: 'Customer' as const, id }],
    }),

    /**
     * Get sentiment timeline for a customer
     */
    getCustomerTimeline: builder.query<SentimentTimelineResponse, string>({
      query: (id) => `/customers/${id}/sentiment-timeline`,
      providesTags: (_result, _error, id) => [{ type: 'Customer' as const, id: `timeline-${id}` }],
    }),

    /**
     * Update customer details
     */
    updateCustomer: builder.mutation<
      { customer: CustomerIntelligenceCard },
      { id: string; data: CustomerUpdatePayload }
    >({
      query: ({ id, data }) => ({
        url: `/customers/${id}`,
        method: 'PATCH',
        body: data,
      }),
      invalidatesTags: (_result, _error, { id }) => [
        { type: 'Customer' as const, id },
        { type: 'Customers' as const, id: 'LIST' },
        { type: 'AtRiskCustomers' as const, id: 'LIST' },
      ],
    }),

    /**
     * Search customers by name, email, or phone
     */
    searchCustomers: builder.query<{ results: CustomerSearchResult[] }, { q: string; limit?: number }>({
      query: ({ q, limit = 10 }) => ({
        url: '/customers/search',
        params: { q, limit },
      }),
      providesTags: () => [{ type: 'Customers' as const, id: 'SEARCH' }],
    }),

    /**
     * Get at-risk customers (churn risk > 0.65)
     */
    getAtRiskCustomers: builder.query<AtRiskCustomersResponse, void>({
      query: () => '/customers/at-risk',
      providesTags: () => [{ type: 'AtRiskCustomers' as const, id: 'LIST' }],
    }),

    /**
     * Add a note to customer profile
     */
    addCustomerNote: builder.mutation<
      { customer: CustomerIntelligenceCard },
      { id: string; note: string }
    >({
      query: ({ id, note }) => ({
        url: `/customers/${id}`,
        method: 'PATCH',
        body: { notes: note },
      }),
      invalidatesTags: (_result, _error, { id }) => [{ type: 'Customer' as const, id }],
    }),

    /**
     * Flag customer as at-risk
     */
    flagAtRisk: builder.mutation<
      { customer: CustomerIntelligenceCard },
      { id: string; reason: string }
    >({
      query: ({ id, reason }) => ({
        url: `/customers/${id}/flag-at-risk`,
        method: 'POST',
        body: { reason },
      }),
      invalidatesTags: (_result, _error, { id }) => [
        { type: 'Customer' as const, id },
        { type: 'AtRiskCustomers' as const, id: 'LIST' },
      ],
    }),
  }),
});

export const {
  useGetCustomersQuery,
  useGetCustomerQuery,
  useGetCustomerCardQuery,
  useGetCustomerTimelineQuery,
  useUpdateCustomerMutation,
  useSearchCustomersQuery,
  useGetAtRiskCustomersQuery,
  useAddCustomerNoteMutation,
  useFlagAtRiskMutation,
} = customersApi;
