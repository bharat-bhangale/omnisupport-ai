import { omnisupportApi } from './omnisupportApi';
import type {
  AgentConfigResponse,
  UpdateVoiceConfigPayload,
  UpdateTextConfigPayload,
  VoicePreviewPayload,
  VoicePreviewResponse,
  TestCallPayload,
  TestCallResponse,
  VoicesResponse,
} from '../types/agentConfig';

export const agentConfigApi = omnisupportApi.injectEndpoints({
  endpoints: (builder) => ({
    /**
     * Get agent configuration
     */
    getAgentConfig: builder.query<AgentConfigResponse, void>({
      query: () => '/agent-config',
      providesTags: [{ type: 'AgentConfig' as const, id: 'CONFIG' }],
    }),

    /**
     * Update voice configuration
     */
    updateVoiceConfig: builder.mutation<
      { voiceConfig: AgentConfigResponse['voiceConfig']; message: string },
      UpdateVoiceConfigPayload
    >({
      query: (payload) => ({
        url: '/agent-config/voice',
        method: 'PUT',
        body: payload,
      }),
      invalidatesTags: [{ type: 'AgentConfig' as const, id: 'CONFIG' }],
    }),

    /**
     * Update text configuration
     */
    updateTextConfig: builder.mutation<
      { textConfig: AgentConfigResponse['textConfig']; message: string },
      UpdateTextConfigPayload
    >({
      query: (payload) => ({
        url: '/agent-config/text',
        method: 'PUT',
        body: payload,
      }),
      invalidatesTags: [{ type: 'AgentConfig' as const, id: 'CONFIG' }],
    }),

    /**
     * Preview voice with text-to-speech
     */
    previewVoice: builder.mutation<VoicePreviewResponse, VoicePreviewPayload>({
      query: (payload) => ({
        url: '/agent-config/voice/preview',
        method: 'POST',
        body: payload,
      }),
    }),

    /**
     * Make a test call
     */
    makeTestCall: builder.mutation<TestCallResponse, TestCallPayload>({
      query: (payload) => ({
        url: '/agent-config/test-call',
        method: 'POST',
        body: payload,
      }),
    }),

    /**
     * Get available voices
     */
    getVoices: builder.query<VoicesResponse, void>({
      query: () => '/agent-config/voices',
      providesTags: [{ type: 'AgentConfig' as const, id: 'VOICES' }],
    }),
  }),
});

export const {
  useGetAgentConfigQuery,
  useUpdateVoiceConfigMutation,
  useUpdateTextConfigMutation,
  usePreviewVoiceMutation,
  useMakeTestCallMutation,
  useGetVoicesQuery,
} = agentConfigApi;
