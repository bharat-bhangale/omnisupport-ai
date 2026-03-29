import { omnisupportApi } from './omnisupportApi';

export interface Integration {
  name: string;
  displayName: string;
  category: 'helpdesk' | 'crm' | 'communication' | 'storage';
  description: string;
  dataFlows: string[];
  logo: string;
  fields: string[];
  status: 'connected' | 'disconnected' | 'needs_reauth';
  health: {
    status: 'healthy' | 'degraded' | 'unhealthy';
    circuitOpen: boolean;
  } | null;
  lastSync: string | null;
}

export interface IntegrationDetail extends Integration {
  credentials: Record<string, string>;
  syncConfig: {
    tickets: boolean;
    contacts: boolean;
    callRecords: boolean;
  };
}

export interface IntegrationsResponse {
  integrations: Integration[];
  stats: {
    active: number;
    total: number;
  };
}

export interface ConnectIntegrationRequest {
  name: string;
  data: Record<string, string>;
}

export interface TestConnectionResponse {
  ok: boolean;
  error?: string;
}

export const integrationsApi = omnisupportApi.injectEndpoints({
  endpoints: (builder) => ({
    // Get all integrations with status
    getIntegrations: builder.query<IntegrationsResponse, void>({
      query: () => '/integrations',
      providesTags: ['Integration'],
    }),

    // Get detail for a specific integration
    getIntegration: builder.query<IntegrationDetail, string>({
      query: (name) => `/integrations/${name}`,
      providesTags: (_, __, name) => [{ type: 'Integration', id: name }],
    }),

    // Connect an integration
    connectIntegration: builder.mutation<{ success: boolean; message: string }, ConnectIntegrationRequest>({
      query: ({ name, data }) => ({
        url: `/integrations/${name}/connect`,
        method: 'POST',
        body: data,
      }),
      invalidatesTags: ['Integration'],
    }),

    // Test an integration connection
    testIntegration: builder.mutation<TestConnectionResponse, string>({
      query: (name) => ({
        url: `/integrations/${name}/test`,
        method: 'POST',
      }),
    }),

    // Disconnect an integration
    disconnectIntegration: builder.mutation<{ success: boolean; message: string }, string>({
      query: (name) => ({
        url: `/integrations/${name}`,
        method: 'DELETE',
      }),
      invalidatesTags: ['Integration'],
    }),

    // Trigger manual sync
    syncIntegration: builder.mutation<{ success: boolean; message: string }, string>({
      query: (name) => ({
        url: `/integrations/${name}/sync`,
        method: 'POST',
      }),
    }),
  }),
});

export const {
  useGetIntegrationsQuery,
  useGetIntegrationQuery,
  useConnectIntegrationMutation,
  useTestIntegrationMutation,
  useDisconnectIntegrationMutation,
  useSyncIntegrationMutation,
} = integrationsApi;
