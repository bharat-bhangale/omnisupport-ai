import { omnisupportApi } from './omnisupportApi';

// ============================================================================
// TYPES
// ============================================================================

export interface ActiveCall {
  callId: string;
  callerPhone: string;
  language: string;
  duration: number;
  currentIntent: string;
  confidence: number;
  sentimentScore: number;
  sentimentTrend?: 'improving' | 'stable' | 'declining';
  status: string;
  turnCount: number;
  startedAt: string;
}

export interface CallHistoryItem {
  id: string;
  callId: string;
  callerPhone: string;
  language: string;
  status: 'completed' | 'escalated' | 'failed';
  duration: number;
  startedAt: string;
  endedAt?: string;
  intent?: string;
  sentiment?: string;
  summary?: string;
  qaScore?: number;
}

export interface Turn {
  role: 'user' | 'assistant' | 'system' | 'tool';
  content: string;
  toolName?: string;
  toolCallId?: string;
  sentiment?: string;
  confidence?: number;
  timestamp: string;
}

export interface CallTranscript {
  call: {
    callId: string;
    callerPhone: string;
    language: string;
    status: string;
    duration: number;
    startedAt: string;
    endedAt?: string;
    intent?: string;
    sentiment?: {
      overall: string;
      scores: { positive: number; neutral: number; negative: number };
      trend: string;
    };
    summary?: string;
    qaScore?: number;
    slots?: Record<string, unknown>;
  };
  turns: Turn[];
}

export interface CallStats {
  activeCalls: number;
  todayCalls: number;
  escalatedToday: number;
  avgQAScore: number;
}

export interface CallHistoryParams {
  page?: number;
  limit?: number;
  sort?: 'startedAt' | 'duration' | 'qaScore';
  order?: 'asc' | 'desc';
  status?: 'completed' | 'escalated' | 'failed' | 'all';
  startDate?: string;
  endDate?: string;
}

// ============================================================================
// API DEFINITION
// ============================================================================

export const callsApi = omnisupportApi.injectEndpoints({
  endpoints: (builder) => ({
    // Get active calls
    getActiveCalls: builder.query<{ calls: ActiveCall[]; count: number }, void>({
      query: () => '/calls/active',
      providesTags: ['Calls'],
    }),

    // Get call transcript
    getCallTranscript: builder.query<CallTranscript, string>({
      query: (callId) => `/calls/${callId}/transcript`,
      providesTags: (_result, _error, callId) => [{ type: 'Calls', id: callId }],
    }),

    // Get call history
    getCallHistory: builder.query<
      { calls: CallHistoryItem[]; pagination: { page: number; limit: number; total: number; totalPages: number } },
      CallHistoryParams
    >({
      query: (params) => ({
        url: '/calls/history',
        params,
      }),
      providesTags: ['Calls'],
    }),

    // Get call stats
    getCallStats: builder.query<CallStats, void>({
      query: () => '/calls/stats',
      providesTags: ['Calls'],
    }),

    // Escalate call
    escalateCall: builder.mutation<
      { success: boolean; escalationId: string; message: string },
      { callId: string; reason: string; priority?: string }
    >({
      query: ({ callId, reason, priority }) => ({
        url: `/calls/${callId}/escalate`,
        method: 'POST',
        body: { reason, priority },
      }),
      invalidatesTags: ['Calls', 'Escalations'],
    }),
  }),
});

export const {
  useGetActiveCallsQuery,
  useGetCallTranscriptQuery,
  useGetCallHistoryQuery,
  useGetCallStatsQuery,
  useEscalateCallMutation,
} = callsApi;
