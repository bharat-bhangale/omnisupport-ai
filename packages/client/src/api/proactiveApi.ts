// ============================================================================
// PROACTIVE TRIGGERS RTK QUERY API
// ============================================================================

import { createApi, fetchBaseQuery } from '@reduxjs/toolkit/query/react';

// ============================================================================
// TYPES
// ============================================================================

interface ProactiveTriggerCondition {
  field: string;
  operator: 'equals' | 'contains' | 'gt' | 'lt' | 'gte' | 'lte' | 'exists' | 'notExists';
  value?: unknown;
}

interface ProactiveTrigger {
  _id: string;
  companyId: string;
  name: string;
  description?: string;
  isActive: boolean;
  priority: number;
  relevantIntents: string[];
  condition: ProactiveTriggerCondition;
  statementTemplate: string;
  channel: 'voice' | 'both';
  createdAt: string;
  updatedAt: string;
}

interface CreateTriggerRequest {
  name: string;
  description?: string;
  isActive?: boolean;
  priority?: number;
  relevantIntents?: string[];
  condition: ProactiveTriggerCondition;
  statementTemplate: string;
  channel?: 'voice' | 'both';
}

interface UpdateTriggerRequest extends Partial<CreateTriggerRequest> {
  id: string;
}

interface ToggleTriggerRequest {
  id: string;
  isActive: boolean;
}

interface TestTriggerRequest {
  id: string;
  callId: string;
}

interface TestTriggerResponse {
  triggered: boolean;
  statement?: string;
  data?: Record<string, unknown>;
}

interface ProactiveContext {
  callId: string;
  triggers: string[];
  predictions: string[];
  contextBlock: string;
  hasContext: boolean;
}

// ============================================================================
// API SLICE
// ============================================================================

export const proactiveApi = createApi({
  reducerPath: 'proactiveApi',
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
  tagTypes: ['Trigger', 'ProactiveContext'],
  endpoints: (builder) => ({
    // ========================================================================
    // GET /proactive-triggers — List all triggers
    // ========================================================================
    getTriggers: builder.query<{ triggers: ProactiveTrigger[]; count: number }, void>({
      query: () => '/proactive-triggers',
      providesTags: (result) =>
        result
          ? [
              ...result.triggers.map(({ _id }) => ({ type: 'Trigger' as const, id: _id })),
              { type: 'Trigger', id: 'LIST' },
            ]
          : [{ type: 'Trigger', id: 'LIST' }],
    }),

    // ========================================================================
    // GET /proactive-triggers/:id — Get single trigger
    // ========================================================================
    getTrigger: builder.query<{ trigger: ProactiveTrigger }, string>({
      query: (id) => `/proactive-triggers/${id}`,
      providesTags: (_result, _error, id) => [{ type: 'Trigger', id }],
    }),

    // ========================================================================
    // POST /proactive-triggers — Create new trigger
    // ========================================================================
    createTrigger: builder.mutation<
      { trigger: ProactiveTrigger; message: string },
      CreateTriggerRequest
    >({
      query: (data) => ({
        url: '/proactive-triggers',
        method: 'POST',
        body: data,
      }),
      invalidatesTags: [{ type: 'Trigger', id: 'LIST' }],
    }),

    // ========================================================================
    // PUT /proactive-triggers/:id — Update trigger (full)
    // ========================================================================
    updateTrigger: builder.mutation<
      { trigger: ProactiveTrigger; message: string },
      UpdateTriggerRequest
    >({
      query: ({ id, ...data }) => ({
        url: `/proactive-triggers/${id}`,
        method: 'PUT',
        body: data,
      }),
      invalidatesTags: (_result, _error, { id }) => [
        { type: 'Trigger', id },
        { type: 'Trigger', id: 'LIST' },
      ],
    }),

    // ========================================================================
    // PATCH /proactive-triggers/:id — Toggle trigger active status
    // ========================================================================
    toggleTrigger: builder.mutation<{ trigger: ProactiveTrigger; message: string }, ToggleTriggerRequest>({
      query: ({ id, isActive }) => ({
        url: `/proactive-triggers/${id}`,
        method: 'PATCH',
        body: { isActive },
      }),
      invalidatesTags: (_result, _error, { id }) => [
        { type: 'Trigger', id },
        { type: 'Trigger', id: 'LIST' },
      ],
    }),

    // ========================================================================
    // DELETE /proactive-triggers/:id — Delete trigger
    // ========================================================================
    deleteTrigger: builder.mutation<{ success: boolean; message: string }, string>({
      query: (id) => ({
        url: `/proactive-triggers/${id}`,
        method: 'DELETE',
      }),
      invalidatesTags: [{ type: 'Trigger', id: 'LIST' }],
    }),

    // ========================================================================
    // POST /proactive-triggers/:id/test — Test trigger against live call
    // ========================================================================
    testTrigger: builder.mutation<TestTriggerResponse, TestTriggerRequest>({
      query: ({ id, callId }) => ({
        url: `/proactive-triggers/${id}/test`,
        method: 'POST',
        body: { callId },
      }),
    }),

    // ========================================================================
    // GET /proactive-triggers/context/:callId — Get proactive context for call
    // ========================================================================
    getProactiveContext: builder.query<ProactiveContext, string>({
      query: (callId) => `/proactive-triggers/context/${callId}`,
      providesTags: (_result, _error, callId) => [{ type: 'ProactiveContext', id: callId }],
    }),

    // ========================================================================
    // POST /proactive-triggers/evaluate — Manual evaluation
    // ========================================================================
    evaluateProactive: builder.mutation<
      {
        callId: string;
        triggers: string[];
        predictions: string[];
        contextBlock: string;
        hasContext: boolean;
      },
      { callId: string }
    >({
      query: (data) => ({
        url: '/proactive-triggers/evaluate',
        method: 'POST',
        body: data,
      }),
      invalidatesTags: (_result, _error, { callId }) => [{ type: 'ProactiveContext', id: callId }],
    }),
  }),
});

// ============================================================================
// EXPORTS
// ============================================================================

export const {
  useGetTriggersQuery,
  useGetTriggerQuery,
  useCreateTriggerMutation,
  useUpdateTriggerMutation,
  useToggleTriggerMutation,
  useDeleteTriggerMutation,
  useTestTriggerMutation,
  useGetProactiveContextQuery,
  useEvaluateProactiveMutation,
} = proactiveApi;

export type { ProactiveTrigger, ProactiveTriggerCondition, ProactiveContext };
