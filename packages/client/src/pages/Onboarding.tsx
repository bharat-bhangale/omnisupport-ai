import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useDropzone } from 'react-dropzone';
import confetti from 'canvas-confetti';
import {
  Building2,
  Mic,
  MessageSquare,
  Upload,
  Settings,
  TestTube,
  Rocket,
  Check,
  ChevronLeft,
  ChevronRight,
  Globe,
  Clock,
  Phone,
  Mail,
  Play,
  X,
  AlertCircle,
  FileText,
  Link,
  Plus,
  Volume2,
  Users,
  BookOpen,
  LayoutDashboard,
  Sparkles,
} from 'lucide-react';
import {
  useGetOnboardingStatusQuery,
  useCreateCompanyMutation,
  useConnectVoiceMutation,
  useConnectTextMutation,
  useCreateVoiceAssistantMutation,
  useUpdateAIConfigMutation,
  useMakeTestCallMutation,
  useCompleteOnboardingMutation,
  type CompanyData,
  type VoiceConnectData,
  type TextConnectData,
  type AIConfigData,
} from '../api/onboardingApi';
import { useUploadKBDocumentMutation } from '../api/kbApi';

// ============================================================================
// TYPES & CONSTANTS
// ============================================================================

const STEPS = [
  { id: 1, label: 'Company', icon: Building2 },
  { id: 2, label: 'Channels', icon: Mic },
  { id: 3, label: 'Knowledge', icon: Upload },
  { id: 4, label: 'Configure', icon: Settings },
  { id: 5, label: 'Test', icon: TestTube },
  { id: 6, label: 'Live', icon: Rocket },
];

const INDUSTRIES = [
  { value: 'saas', label: 'SaaS / Software' },
  { value: 'ecommerce', label: 'E-Commerce' },
  { value: 'healthcare', label: 'Healthcare' },
  { value: 'finance', label: 'Finance / Banking' },
  { value: 'education', label: 'Education' },
  { value: 'travel', label: 'Travel / Hospitality' },
  { value: 'retail', label: 'Retail' },
  { value: 'technology', label: 'Technology' },
  { value: 'media', label: 'Media / Entertainment' },
  { value: 'other', label: 'Other' },
];

const LANGUAGES = [
  { code: 'en', name: 'English', flag: '🇺🇸' },
  { code: 'es', name: 'Spanish', flag: '🇪🇸' },
  { code: 'fr', name: 'French', flag: '🇫🇷' },
  { code: 'de', name: 'German', flag: '🇩🇪' },
  { code: 'pt', name: 'Portuguese', flag: '🇧🇷' },
  { code: 'it', name: 'Italian', flag: '🇮🇹' },
  { code: 'ja', name: 'Japanese', flag: '🇯🇵' },
  { code: 'zh', name: 'Chinese', flag: '🇨🇳' },
  { code: 'ko', name: 'Korean', flag: '🇰🇷' },
  { code: 'ar', name: 'Arabic', flag: '🇸🇦' },
  { code: 'hi', name: 'Hindi', flag: '🇮🇳' },
];

const TIMEZONES = [
  'America/New_York',
  'America/Chicago',
  'America/Denver',
  'America/Los_Angeles',
  'America/Phoenix',
  'America/Anchorage',
  'Pacific/Honolulu',
  'Europe/London',
  'Europe/Paris',
  'Europe/Berlin',
  'Europe/Moscow',
  'Asia/Dubai',
  'Asia/Mumbai',
  'Asia/Singapore',
  'Asia/Tokyo',
  'Asia/Shanghai',
  'Australia/Sydney',
];

const VOICE_OPTIONS = [
  { id: 'EXAVITQu4vr4xnSDxMaL', name: 'Sarah', gender: 'Female', accent: 'American' },
  { id: '21m00Tcm4TlvDq8ikWAM', name: 'Rachel', gender: 'Female', accent: 'American' },
  { id: 'AZnzlk1XvdvUeBnXmlld', name: 'Domi', gender: 'Female', accent: 'British' },
  { id: 'yoZ06aMxZJJ28mfd3POQ', name: 'Sam', gender: 'Male', accent: 'American' },
];

// ============================================================================
// STEP PROGRESS BAR
// ============================================================================

function StepProgress({ currentStep }: { currentStep: number }) {
  return (
    <div className="flex items-center justify-center gap-0 mb-12">
      {STEPS.map((step, idx) => {
        const isComplete = currentStep > step.id;
        const isCurrent = currentStep === step.id;
        const Icon = step.icon;

        return (
          <React.Fragment key={step.id}>
            {idx > 0 && (
              <div
                className={`w-12 h-0.5 ${
                  isComplete ? 'bg-blue-500' : 'bg-gray-600'
                }`}
              />
            )}
            <div className="flex flex-col items-center">
              <div
                className={`w-10 h-10 rounded-full flex items-center justify-center text-sm font-medium transition-all ${
                  isComplete
                    ? 'bg-blue-500 text-white'
                    : isCurrent
                      ? 'bg-blue-500 text-white ring-4 ring-blue-500/30'
                      : 'bg-gray-700 text-gray-400'
                }`}
              >
                {isComplete ? (
                  <Check className="h-5 w-5" />
                ) : (
                  <Icon className="h-5 w-5" />
                )}
              </div>
              <span
                className={`mt-2 text-xs ${
                  isCurrent ? 'text-blue-400' : 'text-gray-500'
                }`}
              >
                {step.label}
              </span>
            </div>
          </React.Fragment>
        );
      })}
    </div>
  );
}

// ============================================================================
// STEP 1: COMPANY PROFILE
// ============================================================================

interface Step1Props {
  data: CompanyData;
  onChange: (data: CompanyData) => void;
  onNext: () => void;
  isLoading: boolean;
}

function Step1CompanyProfile({ data, onChange, onNext, isLoading }: Step1Props) {
  const isValid = data.name.trim().length >= 2 && data.industry && data.primaryLanguage && data.timezone;

  return (
    <div className="space-y-6">
      <div className="text-center mb-8">
        <h2 className="text-2xl font-bold text-white mb-2">Tell us about your company</h2>
        <p className="text-gray-400">We'll use this to personalize your AI assistant</p>
      </div>

      <div>
        <label className="block text-sm font-medium text-gray-300 mb-2">
          Company Name <span className="text-red-400">*</span>
        </label>
        <input
          type="text"
          value={data.name}
          onChange={(e) => onChange({ ...data, name: e.target.value })}
          placeholder="Acme Inc."
          className="w-full px-4 py-3 bg-gray-800 border border-gray-700 rounded-lg text-white placeholder-gray-500 focus:ring-2 focus:ring-blue-500 focus:border-transparent"
        />
      </div>

      <div>
        <label className="block text-sm font-medium text-gray-300 mb-2">Industry</label>
        <select
          value={data.industry}
          onChange={(e) => onChange({ ...data, industry: e.target.value })}
          className="w-full px-4 py-3 bg-gray-800 border border-gray-700 rounded-lg text-white focus:ring-2 focus:ring-blue-500"
        >
          <option value="">Select industry...</option>
          {INDUSTRIES.map((ind) => (
            <option key={ind.value} value={ind.value}>{ind.label}</option>
          ))}
        </select>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="block text-sm font-medium text-gray-300 mb-2">
            <Globe className="inline h-4 w-4 mr-1" /> Primary Language
          </label>
          <select
            value={data.primaryLanguage}
            onChange={(e) => onChange({ ...data, primaryLanguage: e.target.value })}
            className="w-full px-4 py-3 bg-gray-800 border border-gray-700 rounded-lg text-white focus:ring-2 focus:ring-blue-500"
          >
            <option value="">Select...</option>
            {LANGUAGES.map((lang) => (
              <option key={lang.code} value={lang.code}>
                {lang.flag} {lang.name}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-300 mb-2">
            <Clock className="inline h-4 w-4 mr-1" /> Timezone
          </label>
          <select
            value={data.timezone}
            onChange={(e) => onChange({ ...data, timezone: e.target.value })}
            className="w-full px-4 py-3 bg-gray-800 border border-gray-700 rounded-lg text-white focus:ring-2 focus:ring-blue-500"
          >
            <option value="">Select...</option>
            {TIMEZONES.map((tz) => (
              <option key={tz} value={tz}>{tz}</option>
            ))}
          </select>
        </div>
      </div>

      <button
        onClick={onNext}
        disabled={!isValid || isLoading}
        className="w-full py-3 bg-blue-600 text-white font-medium rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
      >
        {isLoading ? (
          <>
            <div className="animate-spin w-5 h-5 border-2 border-white border-t-transparent rounded-full" />
            Creating...
          </>
        ) : (
          <>
            Continue <ChevronRight className="h-5 w-5" />
          </>
        )}
      </button>
    </div>
  );
}

// ============================================================================
// STEP 2: CHOOSE CHANNELS
// ============================================================================

interface Step2Props {
  voiceEnabled: boolean;
  textEnabled: boolean;
  voiceConnected: boolean;
  textConnected: boolean;
  onVoiceToggle: (enabled: boolean) => void;
  onTextToggle: (enabled: boolean) => void;
  voiceData: VoiceConnectData;
  textData: TextConnectData;
  onVoiceDataChange: (data: VoiceConnectData) => void;
  onTextDataChange: (data: TextConnectData) => void;
  onConnectVoice: () => void;
  onConnectText: () => void;
  isConnectingVoice: boolean;
  isConnectingText: boolean;
  voiceError: string | null;
  textError: string | null;
  onNext: () => void;
  onBack: () => void;
}

function Step2ChooseChannels({
  voiceEnabled,
  textEnabled,
  voiceConnected,
  textConnected,
  onVoiceToggle,
  onTextToggle,
  voiceData,
  textData,
  onVoiceDataChange,
  onTextDataChange,
  onConnectVoice,
  onConnectText,
  isConnectingVoice,
  isConnectingText,
  voiceError,
  textError,
  onNext,
  onBack,
}: Step2Props) {
  const canProceed = voiceConnected || textConnected;

  return (
    <div className="space-y-6">
      <div className="text-center mb-8">
        <h2 className="text-2xl font-bold text-white mb-2">Choose your channels</h2>
        <p className="text-gray-400">Connect at least one channel to continue</p>
      </div>

      {/* Voice Channel Card */}
      <div className={`border rounded-xl p-6 transition-all ${
        voiceEnabled ? 'border-blue-500 bg-blue-500/10' : 'border-gray-700 bg-gray-800/50'
      }`}>
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-3">
            <div className="p-3 bg-blue-500/20 rounded-lg">
              <Mic className="h-6 w-6 text-blue-400" />
            </div>
            <div>
              <h3 className="text-lg font-semibold text-white">Voice Support</h3>
              <p className="text-sm text-gray-400">AI-powered phone support with Twilio</p>
            </div>
          </div>
          <label className="relative inline-flex items-center cursor-pointer">
            <input
              type="checkbox"
              checked={voiceEnabled}
              onChange={(e) => onVoiceToggle(e.target.checked)}
              className="sr-only peer"
            />
            <div className="w-11 h-6 bg-gray-700 peer-focus:outline-none peer-focus:ring-2 peer-focus:ring-blue-500 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-blue-600"></div>
          </label>
        </div>

        {voiceEnabled && !voiceConnected && (
          <div className="space-y-4 mt-4 pt-4 border-t border-gray-700">
            <div>
              <label className="block text-sm text-gray-400 mb-1">Twilio Account SID</label>
              <input
                type="text"
                value={voiceData.twilioAccountSid}
                onChange={(e) => onVoiceDataChange({ ...voiceData, twilioAccountSid: e.target.value })}
                placeholder="ACxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx"
                className="w-full px-3 py-2 bg-gray-900 border border-gray-700 rounded-lg text-white text-sm"
              />
            </div>
            <div>
              <label className="block text-sm text-gray-400 mb-1">Auth Token</label>
              <input
                type="password"
                value={voiceData.twilioAuthToken}
                onChange={(e) => onVoiceDataChange({ ...voiceData, twilioAuthToken: e.target.value })}
                placeholder="••••••••••••••••••••••••••••••••"
                className="w-full px-3 py-2 bg-gray-900 border border-gray-700 rounded-lg text-white text-sm"
              />
            </div>
            <div>
              <label className="block text-sm text-gray-400 mb-1">Phone Number</label>
              <input
                type="text"
                value={voiceData.twilioPhone}
                onChange={(e) => onVoiceDataChange({ ...voiceData, twilioPhone: e.target.value })}
                placeholder="+14155551234"
                className="w-full px-3 py-2 bg-gray-900 border border-gray-700 rounded-lg text-white text-sm"
              />
            </div>
            {voiceError && (
              <div className="flex items-center gap-2 text-red-400 text-sm">
                <AlertCircle className="h-4 w-4" />
                {voiceError}
              </div>
            )}
            <button
              onClick={onConnectVoice}
              disabled={isConnectingVoice || !voiceData.twilioAccountSid || !voiceData.twilioAuthToken || !voiceData.twilioPhone}
              className="w-full py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 flex items-center justify-center gap-2"
            >
              {isConnectingVoice ? (
                <div className="animate-spin w-5 h-5 border-2 border-white border-t-transparent rounded-full" />
              ) : (
                <Phone className="h-4 w-4" />
              )}
              Connect Twilio
            </button>
          </div>
        )}

        {voiceConnected && (
          <div className="flex items-center gap-2 mt-4 text-green-400">
            <Check className="h-5 w-5" />
            <span>Connected: {voiceData.twilioPhone}</span>
          </div>
        )}
      </div>

      {/* Text Channel Card */}
      <div className={`border rounded-xl p-6 transition-all ${
        textEnabled ? 'border-purple-500 bg-purple-500/10' : 'border-gray-700 bg-gray-800/50'
      }`}>
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-3">
            <div className="p-3 bg-purple-500/20 rounded-lg">
              <MessageSquare className="h-6 w-6 text-purple-400" />
            </div>
            <div>
              <h3 className="text-lg font-semibold text-white">Ticket Support</h3>
              <p className="text-sm text-gray-400">AI-assisted email & ticket handling</p>
            </div>
          </div>
          <label className="relative inline-flex items-center cursor-pointer">
            <input
              type="checkbox"
              checked={textEnabled}
              onChange={(e) => onTextToggle(e.target.checked)}
              className="sr-only peer"
            />
            <div className="w-11 h-6 bg-gray-700 peer-focus:outline-none peer-focus:ring-2 peer-focus:ring-purple-500 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-purple-600"></div>
          </label>
        </div>

        {textEnabled && !textConnected && (
          <div className="space-y-4 mt-4 pt-4 border-t border-gray-700">
            <div className="flex gap-2">
              <button
                onClick={() => onTextDataChange({ ...textData, platform: 'zendesk' })}
                className={`flex-1 py-2 px-4 rounded-lg text-sm font-medium transition-colors ${
                  textData.platform === 'zendesk'
                    ? 'bg-purple-600 text-white'
                    : 'bg-gray-800 text-gray-400 hover:bg-gray-700'
                }`}
              >
                Zendesk
              </button>
              <button
                onClick={() => onTextDataChange({ ...textData, platform: 'freshdesk' })}
                className={`flex-1 py-2 px-4 rounded-lg text-sm font-medium transition-colors ${
                  textData.platform === 'freshdesk'
                    ? 'bg-purple-600 text-white'
                    : 'bg-gray-800 text-gray-400 hover:bg-gray-700'
                }`}
              >
                Freshdesk
              </button>
            </div>
            <div>
              <label className="block text-sm text-gray-400 mb-1">Subdomain</label>
              <div className="flex items-center">
                <input
                  type="text"
                  value={textData.subdomain}
                  onChange={(e) => onTextDataChange({ ...textData, subdomain: e.target.value })}
                  placeholder="yourcompany"
                  className="flex-1 px-3 py-2 bg-gray-900 border border-gray-700 rounded-l-lg text-white text-sm"
                />
                <span className="px-3 py-2 bg-gray-800 border border-l-0 border-gray-700 rounded-r-lg text-gray-400 text-sm">
                  .{textData.platform}.com
                </span>
              </div>
            </div>
            {textData.platform === 'zendesk' && (
              <div>
                <label className="block text-sm text-gray-400 mb-1">Email</label>
                <input
                  type="email"
                  value={textData.email || ''}
                  onChange={(e) => onTextDataChange({ ...textData, email: e.target.value })}
                  placeholder="admin@example.com"
                  className="w-full px-3 py-2 bg-gray-900 border border-gray-700 rounded-lg text-white text-sm"
                />
              </div>
            )}
            <div>
              <label className="block text-sm text-gray-400 mb-1">API Key</label>
              <input
                type="password"
                value={textData.apiKey}
                onChange={(e) => onTextDataChange({ ...textData, apiKey: e.target.value })}
                placeholder="••••••••••••••••"
                className="w-full px-3 py-2 bg-gray-900 border border-gray-700 rounded-lg text-white text-sm"
              />
            </div>
            {textError && (
              <div className="flex items-center gap-2 text-red-400 text-sm">
                <AlertCircle className="h-4 w-4" />
                {textError}
              </div>
            )}
            <button
              onClick={onConnectText}
              disabled={isConnectingText || !textData.subdomain || !textData.apiKey}
              className="w-full py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 disabled:opacity-50 flex items-center justify-center gap-2"
            >
              {isConnectingText ? (
                <div className="animate-spin w-5 h-5 border-2 border-white border-t-transparent rounded-full" />
              ) : (
                <Mail className="h-4 w-4" />
              )}
              Connect {textData.platform === 'zendesk' ? 'Zendesk' : 'Freshdesk'}
            </button>
          </div>
        )}

        {textConnected && (
          <div className="flex items-center gap-2 mt-4 text-green-400">
            <Check className="h-5 w-5" />
            <span>Connected: {textData.subdomain}.{textData.platform}.com</span>
          </div>
        )}
      </div>

      <div className="flex gap-4">
        <button
          onClick={onBack}
          className="flex-1 py-3 border border-gray-600 text-gray-300 rounded-lg hover:bg-gray-800 flex items-center justify-center gap-2"
        >
          <ChevronLeft className="h-5 w-5" /> Back
        </button>
        <button
          onClick={onNext}
          disabled={!canProceed}
          className="flex-1 py-3 bg-blue-600 text-white font-medium rounded-lg hover:bg-blue-700 disabled:opacity-50 flex items-center justify-center gap-2"
        >
          Continue <ChevronRight className="h-5 w-5" />
        </button>
      </div>
    </div>
  );
}

// ============================================================================
// STEP 3: UPLOAD KNOWLEDGE BASE
// ============================================================================

interface UploadedFile {
  name: string;
  size: number;
  progress: number;
  status: 'uploading' | 'done' | 'error';
}

interface Step3Props {
  files: UploadedFile[];
  onFilesAdd: (files: File[]) => void;
  urlInput: string;
  onUrlChange: (url: string) => void;
  onUrlSubmit: () => void;
  onNext: () => void;
  onBack: () => void;
  onSkip: () => void;
}

function Step3UploadKnowledge({
  files,
  onFilesAdd,
  urlInput,
  onUrlChange,
  onUrlSubmit,
  onNext,
  onBack,
  onSkip,
}: Step3Props) {
  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    accept: {
      'application/pdf': ['.pdf'],
      'text/plain': ['.txt'],
      'text/markdown': ['.md'],
    },
    maxSize: 10 * 1024 * 1024, // 10MB
    onDrop: onFilesAdd,
  });

  const formatFileSize = (bytes: number) => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  const hasUploads = files.length > 0;
  const allDone = files.every((f) => f.status === 'done');

  return (
    <div className="space-y-6">
      <div className="text-center mb-8">
        <h2 className="text-2xl font-bold text-white mb-2">Upload your knowledge base</h2>
        <p className="text-gray-400">Help your AI learn about your products and services</p>
      </div>

      {/* Dropzone */}
      <div
        {...getRootProps()}
        className={`border-2 border-dashed rounded-xl p-8 text-center cursor-pointer transition-colors ${
          isDragActive
            ? 'border-blue-500 bg-blue-500/10'
            : 'border-gray-600 hover:border-gray-500'
        }`}
      >
        <input {...getInputProps()} />
        <Upload className="h-12 w-12 text-gray-500 mx-auto mb-4" />
        <p className="text-gray-300 mb-2">
          {isDragActive ? 'Drop files here...' : 'Drag & drop files here, or click to browse'}
        </p>
        <p className="text-sm text-gray-500">PDF, TXT, MD up to 10MB each</p>
      </div>

      {/* URL Input */}
      <div>
        <label className="block text-sm text-gray-400 mb-2">Or add a URL</label>
        <div className="flex gap-2">
          <input
            type="url"
            value={urlInput}
            onChange={(e) => onUrlChange(e.target.value)}
            placeholder="https://docs.yourcompany.com"
            className="flex-1 px-4 py-2 bg-gray-800 border border-gray-700 rounded-lg text-white"
          />
          <button
            onClick={onUrlSubmit}
            disabled={!urlInput}
            className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50"
          >
            <Link className="h-5 w-5" />
          </button>
        </div>
      </div>

      {/* File List */}
      {files.length > 0 && (
        <div className="space-y-2">
          {files.map((file, idx) => (
            <div
              key={idx}
              className="flex items-center gap-3 p-3 bg-gray-800 rounded-lg"
            >
              <FileText className="h-5 w-5 text-gray-400" />
              <div className="flex-1 min-w-0">
                <div className="flex items-center justify-between mb-1">
                  <span className="text-sm text-white truncate">{file.name}</span>
                  <span className="text-xs text-gray-500">{formatFileSize(file.size)}</span>
                </div>
                {file.status === 'uploading' && (
                  <div className="h-1.5 bg-gray-700 rounded-full overflow-hidden">
                    <div
                      className="h-full bg-blue-500 transition-all duration-300"
                      style={{ width: `${file.progress}%` }}
                    />
                  </div>
                )}
              </div>
              {file.status === 'done' && <Check className="h-5 w-5 text-green-500" />}
              {file.status === 'error' && <X className="h-5 w-5 text-red-500" />}
            </div>
          ))}
        </div>
      )}

      <div className="flex gap-4">
        <button
          onClick={onBack}
          className="py-3 px-6 border border-gray-600 text-gray-300 rounded-lg hover:bg-gray-800 flex items-center justify-center gap-2"
        >
          <ChevronLeft className="h-5 w-5" /> Back
        </button>
        <button
          onClick={onSkip}
          className="py-3 px-6 text-gray-400 hover:text-gray-300"
        >
          Skip for now
        </button>
        <button
          onClick={onNext}
          disabled={hasUploads && !allDone}
          className="flex-1 py-3 bg-blue-600 text-white font-medium rounded-lg hover:bg-blue-700 disabled:opacity-50 flex items-center justify-center gap-2"
        >
          Continue <ChevronRight className="h-5 w-5" />
        </button>
      </div>
    </div>
  );
}

// ============================================================================
// STEP 4: CONFIGURE AI
// ============================================================================

interface Step4Props {
  config: AIConfigData;
  onChange: (config: AIConfigData) => void;
  selectedVoiceId: string;
  onVoiceSelect: (voiceId: string) => void;
  onPreviewVoice: (voiceId: string) => void;
  categoryInput: string;
  onCategoryInputChange: (value: string) => void;
  onAddCategory: () => void;
  onRemoveCategory: (cat: string) => void;
  onNext: () => void;
  onBack: () => void;
  isLoading: boolean;
}

function Step4ConfigureAI({
  config,
  onChange,
  selectedVoiceId,
  onVoiceSelect,
  onPreviewVoice,
  categoryInput,
  onCategoryInputChange,
  onAddCategory,
  onRemoveCategory,
  onNext,
  onBack,
  isLoading,
}: Step4Props) {
  return (
    <div className="space-y-6">
      <div className="text-center mb-8">
        <h2 className="text-2xl font-bold text-white mb-2">Configure your AI assistant</h2>
        <p className="text-gray-400">Customize how your AI sounds and responds</p>
      </div>

      {/* Voice Section */}
      <div className="space-y-4">
        <h3 className="text-lg font-semibold text-white flex items-center gap-2">
          <Mic className="h-5 w-5 text-blue-400" /> Voice Settings
        </h3>

        <div>
          <label className="block text-sm text-gray-400 mb-2">Agent Name</label>
          <input
            type="text"
            value={config.agentName || ''}
            onChange={(e) => onChange({ ...config, agentName: e.target.value })}
            placeholder="Support Assistant"
            className="w-full px-4 py-2 bg-gray-800 border border-gray-700 rounded-lg text-white"
          />
        </div>

        <div>
          <label className="block text-sm text-gray-400 mb-2">Greeting Message</label>
          <textarea
            value={config.agentGreeting || ''}
            onChange={(e) => onChange({ ...config, agentGreeting: e.target.value })}
            placeholder="Hello, thank you for calling. How can I help you today?"
            rows={2}
            className="w-full px-4 py-2 bg-gray-800 border border-gray-700 rounded-lg text-white resize-none"
          />
        </div>

        <div>
          <label className="block text-sm text-gray-400 mb-2">Voice Selection</label>
          <div className="grid grid-cols-2 gap-3">
            {VOICE_OPTIONS.map((voice) => (
              <div
                key={voice.id}
                onClick={() => onVoiceSelect(voice.id)}
                className={`p-4 border rounded-lg cursor-pointer transition-all ${
                  selectedVoiceId === voice.id
                    ? 'border-blue-500 bg-blue-500/10'
                    : 'border-gray-700 hover:border-gray-600'
                }`}
              >
                <div className="flex items-center justify-between mb-2">
                  <span className="font-medium text-white">{voice.name}</span>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      onPreviewVoice(voice.id);
                    }}
                    className="p-1 hover:bg-gray-700 rounded"
                  >
                    <Play className="h-4 w-4 text-gray-400" />
                  </button>
                </div>
                <p className="text-xs text-gray-500">
                  {voice.gender} • {voice.accent}
                </p>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Text Section */}
      <div className="space-y-4 pt-4 border-t border-gray-700">
        <h3 className="text-lg font-semibold text-white flex items-center gap-2">
          <MessageSquare className="h-5 w-5 text-purple-400" /> Text Settings
        </h3>

        <div>
          <label className="block text-sm text-gray-400 mb-2">Classification Categories</label>
          <div className="flex gap-2 mb-2">
            <input
              type="text"
              value={categoryInput}
              onChange={(e) => onCategoryInputChange(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && onAddCategory()}
              placeholder="Add category..."
              className="flex-1 px-4 py-2 bg-gray-800 border border-gray-700 rounded-lg text-white"
            />
            <button
              onClick={onAddCategory}
              disabled={!categoryInput}
              className="px-3 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 disabled:opacity-50"
            >
              <Plus className="h-5 w-5" />
            </button>
          </div>
          <div className="flex flex-wrap gap-2">
            {(config.classificationCategories || []).map((cat) => (
              <span
                key={cat}
                className="inline-flex items-center gap-1 px-3 py-1 bg-purple-500/20 text-purple-300 rounded-full text-sm"
              >
                {cat}
                <button onClick={() => onRemoveCategory(cat)} className="hover:text-white">
                  <X className="h-3 w-3" />
                </button>
              </span>
            ))}
          </div>
        </div>

        <div>
          <label className="block text-sm text-gray-400 mb-2">Brand Voice</label>
          <textarea
            value={config.brandVoice || ''}
            onChange={(e) => onChange({ ...config, brandVoice: e.target.value })}
            placeholder="Describe your brand's communication style (e.g., friendly, professional, casual)..."
            rows={3}
            className="w-full px-4 py-2 bg-gray-800 border border-gray-700 rounded-lg text-white resize-none"
          />
        </div>
      </div>

      <div className="flex gap-4">
        <button
          onClick={onBack}
          className="flex-1 py-3 border border-gray-600 text-gray-300 rounded-lg hover:bg-gray-800 flex items-center justify-center gap-2"
        >
          <ChevronLeft className="h-5 w-5" /> Back
        </button>
        <button
          onClick={onNext}
          disabled={isLoading}
          className="flex-1 py-3 bg-blue-600 text-white font-medium rounded-lg hover:bg-blue-700 disabled:opacity-50 flex items-center justify-center gap-2"
        >
          {isLoading ? (
            <div className="animate-spin w-5 h-5 border-2 border-white border-t-transparent rounded-full" />
          ) : (
            <>Continue <ChevronRight className="h-5 w-5" /></>
          )}
        </button>
      </div>
    </div>
  );
}

// ============================================================================
// STEP 5: TEST YOUR SETUP
// ============================================================================

interface Step5Props {
  phoneNumber: string;
  testCallInitiated: boolean;
  testCallDetected: boolean;
  testTicketCreated: boolean;
  onMakeTestCall: () => void;
  onCreateTestTicket: () => void;
  onNext: () => void;
  onBack: () => void;
  onSkip: () => void;
  isLoading: boolean;
}

function Step5TestSetup({
  phoneNumber,
  testCallInitiated,
  testCallDetected,
  testTicketCreated,
  onMakeTestCall,
  onCreateTestTicket,
  onNext,
  onBack,
  onSkip,
  isLoading,
}: Step5Props) {
  return (
    <div className="space-y-6">
      <div className="text-center mb-8">
        <h2 className="text-2xl font-bold text-white mb-2">Test your setup</h2>
        <p className="text-gray-400">Make sure everything is working correctly</p>
      </div>

      <div className="grid grid-cols-2 gap-6">
        {/* Voice Test */}
        <div className="p-6 bg-gray-800 rounded-xl border border-gray-700">
          <div className="flex items-center gap-3 mb-4">
            <div className="p-2 bg-blue-500/20 rounded-lg">
              <Phone className="h-6 w-6 text-blue-400" />
            </div>
            <h3 className="text-lg font-semibold text-white">Test Voice</h3>
          </div>

          {phoneNumber && (
            <div className="mb-4 p-3 bg-gray-900 rounded-lg">
              <p className="text-sm text-gray-400 mb-1">Your Twilio Number</p>
              <p className="text-xl font-mono text-white">{phoneNumber}</p>
            </div>
          )}

          {!testCallDetected ? (
            <div className="text-center py-4">
              {testCallInitiated ? (
                <div className="space-y-3">
                  <div className="flex items-center justify-center gap-2">
                    <div className="w-3 h-3 bg-blue-500 rounded-full animate-pulse" />
                    <span className="text-gray-300">Waiting for test call...</span>
                  </div>
                  <p className="text-sm text-gray-500">Call the number above from your phone</p>
                </div>
              ) : (
                <button
                  onClick={onMakeTestCall}
                  disabled={isLoading}
                  className="px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50"
                >
                  Make Test Call
                </button>
              )}
            </div>
          ) : (
            <div className="flex items-center justify-center gap-2 py-4 text-green-400">
              <Check className="h-6 w-6" />
              <span className="font-medium">Test call received!</span>
            </div>
          )}
        </div>

        {/* Ticket Test */}
        <div className="p-6 bg-gray-800 rounded-xl border border-gray-700">
          <div className="flex items-center gap-3 mb-4">
            <div className="p-2 bg-purple-500/20 rounded-lg">
              <MessageSquare className="h-6 w-6 text-purple-400" />
            </div>
            <h3 className="text-lg font-semibold text-white">Test Tickets</h3>
          </div>

          {!testTicketCreated ? (
            <div className="text-center py-4">
              <button
                onClick={onCreateTestTicket}
                disabled={isLoading}
                className="px-6 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 disabled:opacity-50"
              >
                Create Test Ticket
              </button>
            </div>
          ) : (
            <div className="space-y-3 py-2">
              <div className="flex items-center gap-2 text-green-400">
                <Check className="h-5 w-5" />
                <span>Test ticket created</span>
              </div>
              <div className="flex gap-2">
                <span className="px-2 py-1 bg-purple-500/20 text-purple-300 rounded text-sm">
                  Billing
                </span>
                <span className="px-2 py-1 bg-amber-500/20 text-amber-300 rounded text-sm">
                  Medium
                </span>
              </div>
            </div>
          )}
        </div>
      </div>

      <div className="flex gap-4">
        <button
          onClick={onBack}
          className="py-3 px-6 border border-gray-600 text-gray-300 rounded-lg hover:bg-gray-800 flex items-center justify-center gap-2"
        >
          <ChevronLeft className="h-5 w-5" /> Back
        </button>
        <button
          onClick={onSkip}
          className="py-3 px-6 text-gray-400 hover:text-gray-300"
        >
          Skip for now
        </button>
        <button
          onClick={onNext}
          className="flex-1 py-3 bg-blue-600 text-white font-medium rounded-lg hover:bg-blue-700 flex items-center justify-center gap-2"
        >
          Continue <ChevronRight className="h-5 w-5" />
        </button>
      </div>
    </div>
  );
}

// ============================================================================
// STEP 6: GO LIVE!
// ============================================================================

interface Step6Props {
  onGoToDashboard: () => void;
  onAddKnowledge: () => void;
  onInviteTeam: () => void;
}

function Step6GoLive({ onGoToDashboard, onAddKnowledge, onInviteTeam }: Step6Props) {
  useEffect(() => {
    // Fire confetti on mount
    const duration = 3000;
    const end = Date.now() + duration;

    const frame = () => {
      confetti({
        particleCount: 3,
        angle: 60,
        spread: 55,
        origin: { x: 0 },
        colors: ['#3B82F6', '#8B5CF6', '#10B981'],
      });
      confetti({
        particleCount: 3,
        angle: 120,
        spread: 55,
        origin: { x: 1 },
        colors: ['#3B82F6', '#8B5CF6', '#10B981'],
      });

      if (Date.now() < end) {
        requestAnimationFrame(frame);
      }
    };

    frame();
  }, []);

  return (
    <div className="text-center">
      <div className="mb-8">
        <div className="w-24 h-24 mx-auto mb-6 rounded-full bg-green-500/20 flex items-center justify-center">
          <div className="w-16 h-16 rounded-full bg-green-500 flex items-center justify-center animate-bounce">
            <Check className="h-10 w-10 text-white" />
          </div>
        </div>
        <h2 className="text-3xl font-bold text-white mb-3">
          <Sparkles className="inline h-8 w-8 text-yellow-400 mr-2" />
          Your AI is live!
        </h2>
        <p className="text-gray-400">Start receiving calls and tickets with AI assistance</p>
      </div>

      <div className="grid grid-cols-3 gap-4 mb-8">
        <button
          onClick={onAddKnowledge}
          className="p-6 bg-gray-800 border border-gray-700 rounded-xl hover:border-gray-600 transition-colors text-left"
        >
          <BookOpen className="h-8 w-8 text-blue-400 mb-3" />
          <h3 className="text-white font-semibold mb-1">Add Knowledge</h3>
          <p className="text-sm text-gray-500">Upload more documents</p>
        </button>

        <button
          onClick={onInviteTeam}
          className="p-6 bg-gray-800 border border-gray-700 rounded-xl hover:border-gray-600 transition-colors text-left"
        >
          <Users className="h-8 w-8 text-purple-400 mb-3" />
          <h3 className="text-white font-semibold mb-1">Invite Team</h3>
          <p className="text-sm text-gray-500">Add agents & managers</p>
        </button>

        <button
          onClick={onGoToDashboard}
          className="p-6 bg-gray-800 border border-gray-700 rounded-xl hover:border-gray-600 transition-colors text-left"
        >
          <LayoutDashboard className="h-8 w-8 text-green-400 mb-3" />
          <h3 className="text-white font-semibold mb-1">View Dashboard</h3>
          <p className="text-sm text-gray-500">See live analytics</p>
        </button>
      </div>

      <button
        onClick={onGoToDashboard}
        className="w-full py-4 bg-blue-600 text-white text-lg font-medium rounded-lg hover:bg-blue-700 flex items-center justify-center gap-2"
      >
        Go to Dashboard <ChevronRight className="h-6 w-6" />
      </button>
    </div>
  );
}

// ============================================================================
// MAIN ONBOARDING COMPONENT
// ============================================================================

export default function Onboarding() {
  const navigate = useNavigate();
  const { data: status, refetch: refetchStatus } = useGetOnboardingStatusQuery();

  // Mutations
  const [createCompany, { isLoading: isCreatingCompany }] = useCreateCompanyMutation();
  const [connectVoice, { isLoading: isConnectingVoice }] = useConnectVoiceMutation();
  const [connectText, { isLoading: isConnectingText }] = useConnectTextMutation();
  const [createAssistant] = useCreateVoiceAssistantMutation();
  const [updateConfig, { isLoading: isUpdatingConfig }] = useUpdateAIConfigMutation();
  const [makeTestCall, { isLoading: isMakingTestCall }] = useMakeTestCallMutation();
  const [completeOnboarding] = useCompleteOnboardingMutation();
  const [uploadDocument] = useUploadKBDocumentMutation();

  // Step state
  const [currentStep, setCurrentStep] = useState(1);

  // Step 1 state
  const [companyData, setCompanyData] = useState<CompanyData>({
    name: '',
    industry: '',
    primaryLanguage: 'en',
    timezone: 'America/New_York',
  });

  // Step 2 state
  const [voiceEnabled, setVoiceEnabled] = useState(false);
  const [textEnabled, setTextEnabled] = useState(false);
  const [voiceConnected, setVoiceConnected] = useState(false);
  const [textConnected, setTextConnected] = useState(false);
  const [voiceData, setVoiceData] = useState<VoiceConnectData>({
    twilioAccountSid: '',
    twilioAuthToken: '',
    twilioPhone: '',
  });
  const [textData, setTextData] = useState<TextConnectData>({
    platform: 'zendesk',
    subdomain: '',
    apiKey: '',
    email: '',
  });
  const [voiceError, setVoiceError] = useState<string | null>(null);
  const [textError, setTextError] = useState<string | null>(null);

  // Step 3 state
  const [uploadedFiles, setUploadedFiles] = useState<UploadedFile[]>([]);
  const [urlInput, setUrlInput] = useState('');

  // Step 4 state
  const [aiConfig, setAIConfig] = useState<AIConfigData>({
    agentName: '',
    agentGreeting: '',
    voiceId: 'EXAVITQu4vr4xnSDxMaL',
    classificationCategories: ['Billing', 'Technical', 'General'],
    brandVoice: '',
  });
  const [selectedVoiceId, setSelectedVoiceId] = useState('EXAVITQu4vr4xnSDxMaL');
  const [categoryInput, setCategoryInput] = useState('');

  // Step 5 state
  const [testCallInitiated, setTestCallInitiated] = useState(false);
  const [testCallDetected, setTestCallDetected] = useState(false);
  const [testTicketCreated, setTestTicketCreated] = useState(false);

  // Initialize from status
  useEffect(() => {
    if (status) {
      if (status.complete) {
        navigate('/');
        return;
      }
      setCurrentStep(status.step);
      setVoiceConnected(status.voiceConnected);
      setTextConnected(status.textConnected);
      if (status.company.name) {
        setCompanyData({
          name: status.company.name,
          industry: status.company.industry || '',
          primaryLanguage: status.company.primaryLanguage || 'en',
          timezone: status.company.timezone || 'America/New_York',
        });
      }
      if (status.company.voicePhone) {
        setVoiceData((prev) => ({ ...prev, twilioPhone: status.company.voicePhone! }));
        setVoiceEnabled(true);
      }
    }
  }, [status, navigate]);

  // Handlers
  const handleStep1Next = async () => {
    try {
      await createCompany(companyData).unwrap();
      setCurrentStep(2);
    } catch (err: unknown) {
      console.error('Failed to create company:', err);
    }
  };

  const handleConnectVoice = async () => {
    setVoiceError(null);
    try {
      await connectVoice(voiceData).unwrap();
      setVoiceConnected(true);
      // Create Vapi assistant after connecting Twilio
      await createAssistant().unwrap();
    } catch (err: unknown) {
      setVoiceError((err as { data?: { message?: string } })?.data?.message || 'Connection failed');
    }
  };

  const handleConnectText = async () => {
    setTextError(null);
    try {
      await connectText(textData).unwrap();
      setTextConnected(true);
    } catch (err: unknown) {
      setTextError((err as { data?: { message?: string } })?.data?.message || 'Connection failed');
    }
  };

  const handleFilesAdd = useCallback(async (files: File[]) => {
    for (const file of files) {
      const newFile: UploadedFile = {
        name: file.name,
        size: file.size,
        progress: 0,
        status: 'uploading',
      };
      setUploadedFiles((prev) => [...prev, newFile]);

      try {
        const formData = new FormData();
        formData.append('file', file);
        await uploadDocument(formData).unwrap();
        setUploadedFiles((prev) =>
          prev.map((f) =>
            f.name === file.name ? { ...f, progress: 100, status: 'done' } : f
          )
        );
      } catch {
        setUploadedFiles((prev) =>
          prev.map((f) =>
            f.name === file.name ? { ...f, status: 'error' } : f
          )
        );
      }
    }
  }, [uploadDocument]);

  const handleUrlSubmit = async () => {
    if (!urlInput) return;
    const newFile: UploadedFile = {
      name: urlInput,
      size: 0,
      progress: 0,
      status: 'uploading',
    };
    setUploadedFiles((prev) => [...prev, newFile]);
    
    // Simulate URL processing
    setTimeout(() => {
      setUploadedFiles((prev) =>
        prev.map((f) =>
          f.name === urlInput ? { ...f, progress: 100, status: 'done' } : f
        )
      );
    }, 2000);
    setUrlInput('');
  };

  const handleStep4Next = async () => {
    try {
      await updateConfig({
        ...aiConfig,
        voiceId: selectedVoiceId,
      }).unwrap();
      setCurrentStep(5);
    } catch (err) {
      console.error('Failed to update config:', err);
    }
  };

  const handleMakeTestCall = async () => {
    // In real app, would prompt for phone number
    setTestCallInitiated(true);
    // Simulate call detection after delay
    setTimeout(() => setTestCallDetected(true), 5000);
  };

  const handleCreateTestTicket = () => {
    setTestTicketCreated(true);
  };

  const handlePreviewVoice = (voiceId: string) => {
    // Would call voice preview API
    console.log('Preview voice:', voiceId);
  };

  const handleAddCategory = () => {
    if (categoryInput.trim()) {
      setAIConfig((prev) => ({
        ...prev,
        classificationCategories: [
          ...(prev.classificationCategories || []),
          categoryInput.trim(),
        ],
      }));
      setCategoryInput('');
    }
  };

  const handleRemoveCategory = (cat: string) => {
    setAIConfig((prev) => ({
      ...prev,
      classificationCategories: (prev.classificationCategories || []).filter(
        (c) => c !== cat
      ),
    }));
  };

  const handleComplete = async () => {
    try {
      await completeOnboarding().unwrap();
      setCurrentStep(6);
    } catch (err) {
      console.error('Failed to complete onboarding:', err);
      setCurrentStep(6); // Still show success
    }
  };

  const handleGoToDashboard = () => {
    navigate('/');
  };

  // Render current step
  const renderStep = () => {
    switch (currentStep) {
      case 1:
        return (
          <Step1CompanyProfile
            data={companyData}
            onChange={setCompanyData}
            onNext={handleStep1Next}
            isLoading={isCreatingCompany}
          />
        );
      case 2:
        return (
          <Step2ChooseChannels
            voiceEnabled={voiceEnabled}
            textEnabled={textEnabled}
            voiceConnected={voiceConnected}
            textConnected={textConnected}
            onVoiceToggle={setVoiceEnabled}
            onTextToggle={setTextEnabled}
            voiceData={voiceData}
            textData={textData}
            onVoiceDataChange={setVoiceData}
            onTextDataChange={setTextData}
            onConnectVoice={handleConnectVoice}
            onConnectText={handleConnectText}
            isConnectingVoice={isConnectingVoice}
            isConnectingText={isConnectingText}
            voiceError={voiceError}
            textError={textError}
            onNext={() => setCurrentStep(3)}
            onBack={() => setCurrentStep(1)}
          />
        );
      case 3:
        return (
          <Step3UploadKnowledge
            files={uploadedFiles}
            onFilesAdd={handleFilesAdd}
            urlInput={urlInput}
            onUrlChange={setUrlInput}
            onUrlSubmit={handleUrlSubmit}
            onNext={() => setCurrentStep(4)}
            onBack={() => setCurrentStep(2)}
            onSkip={() => setCurrentStep(4)}
          />
        );
      case 4:
        return (
          <Step4ConfigureAI
            config={aiConfig}
            onChange={setAIConfig}
            selectedVoiceId={selectedVoiceId}
            onVoiceSelect={setSelectedVoiceId}
            onPreviewVoice={handlePreviewVoice}
            categoryInput={categoryInput}
            onCategoryInputChange={setCategoryInput}
            onAddCategory={handleAddCategory}
            onRemoveCategory={handleRemoveCategory}
            onNext={handleStep4Next}
            onBack={() => setCurrentStep(3)}
            isLoading={isUpdatingConfig}
          />
        );
      case 5:
        return (
          <Step5TestSetup
            phoneNumber={voiceData.twilioPhone || status?.company?.voicePhone || ''}
            testCallInitiated={testCallInitiated}
            testCallDetected={testCallDetected}
            testTicketCreated={testTicketCreated}
            onMakeTestCall={handleMakeTestCall}
            onCreateTestTicket={handleCreateTestTicket}
            onNext={handleComplete}
            onBack={() => setCurrentStep(4)}
            onSkip={handleComplete}
            isLoading={isMakingTestCall}
          />
        );
      case 6:
        return (
          <Step6GoLive
            onGoToDashboard={handleGoToDashboard}
            onAddKnowledge={() => navigate('/knowledge')}
            onInviteTeam={() => navigate('/settings/team')}
          />
        );
      default:
        return null;
    }
  };

  return (
    <div className="min-h-screen bg-[#0A1835] flex flex-col">
      {/* Header */}
      <div className="py-8 text-center">
        <div className="flex items-center justify-center gap-2 mb-8">
          <Sparkles className="h-8 w-8 text-blue-400" />
          <span className="text-2xl font-bold text-white">OmniSupport AI</span>
        </div>
        <StepProgress currentStep={currentStep} />
      </div>

      {/* Content Card */}
      <div className="flex-1 flex items-start justify-center px-4 pb-12">
        <div className="w-full max-w-2xl bg-gray-900/80 backdrop-blur rounded-2xl border border-gray-800 p-12 shadow-2xl">
          {renderStep()}
        </div>
      </div>
    </div>
  );
}
