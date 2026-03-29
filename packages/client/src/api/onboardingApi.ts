import { omnisupportApi } from './omnisupportApi';

// ============================================================================
// TYPES
// ============================================================================

export interface CompanyData {
  name: string;
  industry: string;
  primaryLanguage: string;
  timezone: string;
}

export interface VoiceConnectData {
  twilioAccountSid: string;
  twilioAuthToken: string;
  twilioPhone: string;
}

export interface TextConnectData {
  platform: 'zendesk' | 'freshdesk';
  subdomain: string;
  apiKey: string;
  email?: string;
}

export interface AIConfigData {
  agentName?: string;
  agentGreeting?: string;
  voiceId?: string;
  classificationCategories?: string[];
  brandVoice?: string;
}

export interface OnboardingStatus {
  step: number;
  complete: boolean;
  voiceConnected: boolean;
  textConnected: boolean;
  textPlatform: 'zendesk' | 'freshdesk' | null;
  hasKnowledge: boolean;
  hasConfig: boolean;
  company: {
    name?: string;
    industry?: string;
    primaryLanguage?: string;
    timezone?: string;
    voicePhone?: string;
    agentName?: string;
  };
}

export interface VoicePreview {
  voiceId: string;
  name: string;
  language: string;
  gender: string;
  previewUrl: string;
}

// ============================================================================
// API DEFINITION
// ============================================================================

export const onboardingApi = omnisupportApi.injectEndpoints({
  endpoints: (builder) => ({
    // Get onboarding status
    getOnboardingStatus: builder.query<OnboardingStatus, void>({
      query: () => '/onboarding/status',
      providesTags: ['Onboarding'],
    }),

    // Step 1: Create company
    createCompany: builder.mutation<{ companyId: string; message: string }, CompanyData>({
      query: (data) => ({
        url: '/onboarding/company',
        method: 'POST',
        body: data,
      }),
      invalidatesTags: ['Onboarding'],
    }),

    // Step 2: Connect voice (Twilio)
    connectVoice: builder.mutation<{ connected: boolean; phoneNumber: string }, VoiceConnectData>({
      query: (data) => ({
        url: '/onboarding/voice/connect',
        method: 'POST',
        body: data,
      }),
      invalidatesTags: ['Onboarding'],
    }),

    // Step 2: Connect text (Zendesk/Freshdesk)
    connectText: builder.mutation<{ connected: boolean; platform: string; subdomain: string }, TextConnectData>({
      query: (data) => ({
        url: '/onboarding/text/connect',
        method: 'POST',
        body: data,
      }),
      invalidatesTags: ['Onboarding'],
    }),

    // Step 2: Create Vapi assistant
    createVoiceAssistant: builder.mutation<{ created: boolean; assistantId: string }, void>({
      query: () => ({
        url: '/onboarding/voice/create-assistant',
        method: 'POST',
      }),
      invalidatesTags: ['Onboarding'],
    }),

    // Step 4: Update AI configuration
    updateAIConfig: builder.mutation<{ updated: boolean }, AIConfigData>({
      query: (data) => ({
        url: '/onboarding/config',
        method: 'PATCH',
        body: data,
      }),
      invalidatesTags: ['Onboarding'],
    }),

    // Step 5: Make test call
    makeTestCall: builder.mutation<{ initiated: boolean; callSid: string }, { phoneNumber: string }>({
      query: (data) => ({
        url: '/onboarding/test-call',
        method: 'POST',
        body: data,
      }),
    }),

    // Step 6: Complete onboarding
    completeOnboarding: builder.mutation<{ complete: boolean; message: string }, void>({
      query: () => ({
        url: '/onboarding/complete',
        method: 'POST',
      }),
      invalidatesTags: ['Onboarding'],
    }),

    // Get available voices for preview
    getVoicePreviews: builder.query<VoicePreview[], void>({
      query: () => '/agent-config/voices',
    }),

    // Preview a voice
    previewVoice: builder.mutation<{ audioUrl: string }, { voiceId: string; text?: string }>({
      query: (data) => ({
        url: '/agent-config/voice/preview',
        method: 'POST',
        body: data,
      }),
    }),
  }),
});

export const {
  useGetOnboardingStatusQuery,
  useCreateCompanyMutation,
  useConnectVoiceMutation,
  useConnectTextMutation,
  useCreateVoiceAssistantMutation,
  useUpdateAIConfigMutation,
  useMakeTestCallMutation,
  useCompleteOnboardingMutation,
  useGetVoicePreviewsQuery,
  usePreviewVoiceMutation,
} = onboardingApi;
