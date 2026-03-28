import { omnisupportApi } from './omnisupportApi';

// Workflow types
export type WorkflowTriggerEvent =
  | 'ticket:created'
  | 'ticket:classified'
  | 'ticket:updated'
  | 'ticket:escalated'
  | 'ticket:sla_warning'
  | 'ticket:sla_breached'
  | 'ticket:resolved'
  | 'call:started'
  | 'call:ended'
  | 'call:escalated'
  | 'customer:at_risk'
  | 'feedback:negative';

export type ConditionOperator =
  | 'equals'
  | 'not_equals'
  | 'contains'
  | 'not_contains'
  | 'greater_than'
  | 'less_than'
  | 'in'
  | 'not_in'
  | 'exists'
  | 'not_exists'
  | 'matches_regex';

export type WorkflowActionType =
  | 'assign_agent'
  | 'add_tag'
  | 'remove_tag'
  | 'send_email'
  | 'notify_slack'
  | 'webhook'
  | 'create_ticket'
  | 'close_ticket'
  | 'escalate'
  | 'set_priority'
  | 'add_note';

export interface WorkflowTrigger {
  event: WorkflowTriggerEvent;
  filters?: {
    field: string;
    operator: ConditionOperator;
    value: unknown;
  }[];
}

export interface WorkflowCondition {
  field: string;
  operator: ConditionOperator;
  value: unknown;
}

export interface WorkflowAction {
  type: WorkflowActionType;
  params: Record<string, unknown>;
  order: number;
}

export interface WorkflowStats {
  triggeredCount: number;
  successCount: number;
  failedCount: number;
  lastTriggeredAt?: string;
  lastSuccessAt?: string;
  lastFailedAt?: string;
}

export interface Workflow {
  _id: string;
  companyId: string;
  name: string;
  description?: string;
  isActive: boolean;
  version: number;
  trigger: WorkflowTrigger;
  conditions: WorkflowCondition[];
  conditionLogic: 'AND' | 'OR';
  actions: WorkflowAction[];
  stats: WorkflowStats;
  createdBy: string;
  updatedBy?: string;
  createdAt: string;
  updatedAt: string;
}

export interface WorkflowTemplate {
  id: string;
  name: string;
  description: string;
  trigger: WorkflowTrigger;
  conditions: WorkflowCondition[];
  conditionLogic: 'AND' | 'OR';
  actions: WorkflowAction[];
}

export interface WorkflowListResponse {
  workflows: Workflow[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
}

export interface WorkflowListQuery {
  isActive?: boolean;
  event?: WorkflowTriggerEvent;
  page?: number;
  limit?: number;
}

export interface CreateWorkflowPayload {
  name: string;
  description?: string;
  isActive?: boolean;
  trigger: WorkflowTrigger;
  conditions?: WorkflowCondition[];
  conditionLogic?: 'AND' | 'OR';
  actions: WorkflowAction[];
}

export interface UpdateWorkflowPayload extends Partial<CreateWorkflowPayload> {}

export interface TestWorkflowPayload {
  context: Record<string, unknown>;
}

export interface TestWorkflowResult {
  wouldTrigger: boolean;
  filterResults: {
    field: string;
    operator: string;
    expected: unknown;
    actual: unknown;
    passed: boolean;
  }[];
  conditionResults: {
    field: string;
    operator: string;
    expected: unknown;
    actual: unknown;
    passed: boolean;
  }[];
  actionsToRun: {
    type: string;
    order: number;
    params: Record<string, unknown>;
  }[];
}

export const workflowsApi = omnisupportApi.injectEndpoints({
  endpoints: (builder) => ({
    /**
     * Get paginated list of workflows
     */
    getWorkflows: builder.query<WorkflowListResponse, WorkflowListQuery | undefined>({
      query: (params) => {
        const queryParams: Record<string, string | number | boolean> = {
          page: params?.page ?? 1,
          limit: params?.limit ?? 50,
        };

        if (params?.isActive !== undefined) {
          queryParams.isActive = params.isActive;
        }
        if (params?.event) {
          queryParams.event = params.event;
        }

        return {
          url: '/workflows',
          params: queryParams,
        };
      },
      providesTags: (result) =>
        result
          ? [
              ...result.workflows.map(({ _id }) => ({ type: 'Workflow' as const, id: _id })),
              { type: 'Workflow' as const, id: 'LIST' },
            ]
          : [{ type: 'Workflow' as const, id: 'LIST' }],
    }),

    /**
     * Get single workflow by ID
     */
    getWorkflow: builder.query<{ workflow: Workflow }, string>({
      query: (id) => `/workflows/${id}`,
      providesTags: (_result, _error, id) => [{ type: 'Workflow' as const, id }],
    }),

    /**
     * Get workflow templates
     */
    getTemplates: builder.query<{ templates: WorkflowTemplate[] }, void>({
      query: () => '/workflows/templates',
    }),

    /**
     * Create a new workflow
     */
    createWorkflow: builder.mutation<{ workflow: Workflow }, CreateWorkflowPayload>({
      query: (data) => ({
        url: '/workflows',
        method: 'POST',
        body: data,
      }),
      invalidatesTags: [{ type: 'Workflow' as const, id: 'LIST' }],
    }),

    /**
     * Update a workflow (full update)
     */
    updateWorkflow: builder.mutation<
      { workflow: Workflow },
      { id: string; data: UpdateWorkflowPayload }
    >({
      query: ({ id, data }) => ({
        url: `/workflows/${id}`,
        method: 'PUT',
        body: data,
      }),
      invalidatesTags: (_result, _error, { id }) => [
        { type: 'Workflow' as const, id },
        { type: 'Workflow' as const, id: 'LIST' },
      ],
    }),

    /**
     * Partial update a workflow
     */
    patchWorkflow: builder.mutation<
      { workflow: Workflow },
      { id: string; data: UpdateWorkflowPayload }
    >({
      query: ({ id, data }) => ({
        url: `/workflows/${id}`,
        method: 'PATCH',
        body: data,
      }),
      invalidatesTags: (_result, _error, { id }) => [
        { type: 'Workflow' as const, id },
        { type: 'Workflow' as const, id: 'LIST' },
      ],
    }),

    /**
     * Delete a workflow
     */
    deleteWorkflow: builder.mutation<{ success: boolean; message: string }, string>({
      query: (id) => ({
        url: `/workflows/${id}`,
        method: 'DELETE',
      }),
      invalidatesTags: (_result, _error, id) => [
        { type: 'Workflow' as const, id },
        { type: 'Workflow' as const, id: 'LIST' },
      ],
    }),

    /**
     * Toggle workflow active status
     */
    toggleWorkflowActive: builder.mutation<{ workflow: Workflow }, string>({
      query: (id) => ({
        url: `/workflows/${id}/toggle`,
        method: 'POST',
      }),
      invalidatesTags: (_result, _error, id) => [
        { type: 'Workflow' as const, id },
        { type: 'Workflow' as const, id: 'LIST' },
      ],
    }),

    /**
     * Test workflow with sample context (dry run)
     */
    testWorkflow: builder.mutation<TestWorkflowResult, { id: string; context: Record<string, unknown> }>({
      query: ({ id, context }) => ({
        url: `/workflows/${id}/test`,
        method: 'POST',
        body: { context },
      }),
    }),

    /**
     * Create workflow from template
     */
    createFromTemplate: builder.mutation<
      { workflow: Workflow },
      { templateId: string; name?: string }
    >({
      query: (data) => ({
        url: '/workflows/from-template',
        method: 'POST',
        body: data,
      }),
      invalidatesTags: [{ type: 'Workflow' as const, id: 'LIST' }],
    }),
  }),
});

// Add Workflow to tag types in omnisupportApi if needed
// This extends the base API's tag types

export const {
  useGetWorkflowsQuery,
  useGetWorkflowQuery,
  useGetTemplatesQuery,
  useCreateWorkflowMutation,
  useUpdateWorkflowMutation,
  usePatchWorkflowMutation,
  useDeleteWorkflowMutation,
  useToggleWorkflowActiveMutation,
  useTestWorkflowMutation,
  useCreateFromTemplateMutation,
} = workflowsApi;
