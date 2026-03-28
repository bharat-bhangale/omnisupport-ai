// Agent Configuration Types

export interface VoiceConfig {
  agentName: string;
  agentGreeting: string;
  voiceId: string;
  stability: number;
  similarityBoost: number;
  speakingRate: number;
}

export interface TextConfig {
  classificationCategories: string[];
  brandVoice: string;
}

export interface AgentConfigResponse {
  voiceConfig: VoiceConfig;
  textConfig: TextConfig;
  vapiAssistantId?: string;
}

export interface UpdateVoiceConfigPayload {
  agentName?: string;
  agentGreeting?: string;
  voiceId?: string;
  stability?: number;
  similarityBoost?: number;
  speakingRate?: number;
}

export interface UpdateTextConfigPayload {
  classificationCategories?: string[];
  brandVoice?: string;
}

export interface VoicePreviewPayload {
  text: string;
  voiceId: string;
}

export interface VoicePreviewResponse {
  audio: string;
  contentType: string;
}

export interface TestCallPayload {
  phoneNumber: string;
}

export interface TestCallResponse {
  callSid: string;
  status: string;
  message: string;
}

export interface Voice {
  id: string;
  name: string;
  category: string;
  accent?: string;
  gender?: string;
  age?: string;
  description?: string;
  previewUrl?: string;
}

export interface VoicesResponse {
  voices: Voice[];
  total: number;
  tier: string;
}

export interface QARubricDimension {
  name: string;
  weight: number;
  minPassScore: number;
}

export interface QAConfig {
  dimensions: QARubricDimension[];
}

export interface PromptConfig {
  systemPromptSuffix: string;
  effectivePrompt: string;
}

export type DefaultTone = 'professional' | 'empathetic' | 'technical';

export interface EscalationRules {
  attemptsBeforeEscalate: number;
  sentimentThreshold: number;
}

export interface FullAgentConfig extends AgentConfigResponse {
  defaultTone: DefaultTone;
  confidenceThreshold: number;
  escalationRules: EscalationRules;
  promptConfig: PromptConfig;
  qaConfig: QAConfig;
}
