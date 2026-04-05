import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import {
  Mic,
  MessageSquare,
  Settings,
  ClipboardCheck,
  Play,
  Pause,
  Phone,
  Loader2,
  Plus,
  X,
  Check,
  Upload,
  Crown,
  RotateCcw,
  ChevronDown,
  ChevronUp,
  GripVertical,
  Smartphone,
} from 'lucide-react';
import toast from 'react-hot-toast';
import {
  useGetAgentConfigQuery,
  useGetVoicesQuery,
  useUpdateVoiceConfigMutation,
  useUpdateTextConfigMutation,
  usePreviewVoiceMutation,
  useMakeTestCallMutation,
} from '../api/agentConfigApi';
import type {
  Voice,
  VoiceConfig,
  TextConfig,
  DefaultTone,
  QARubricDimension,
} from '../types/agentConfig';

// Tab types
type TabId = 'voice' | 'text' | 'prompt' | 'qa';

const TABS: { id: TabId; label: string; icon: React.ReactNode }[] = [
  { id: 'voice', label: 'Voice Agent', icon: <Mic className="w-4 h-4" /> },
  { id: 'text', label: 'Text Agent', icon: <MessageSquare className="w-4 h-4" /> },
  { id: 'prompt', label: 'Prompt Settings', icon: <Settings className="w-4 h-4" /> },
  { id: 'qa', label: 'QA Scoring', icon: <ClipboardCheck className="w-4 h-4" /> },
];

const DEFAULT_QA_DIMENSIONS: QARubricDimension[] = [
  { name: 'Intent Understanding', weight: 25, minPassScore: 70 },
  { name: 'Response Accuracy', weight: 25, minPassScore: 75 },
  { name: 'Resolution Success', weight: 20, minPassScore: 80 },
  { name: 'Escalation Correctness', weight: 15, minPassScore: 85 },
  { name: 'Customer Experience', weight: 15, minPassScore: 70 },
];

const DEFAULT_TONES: { id: DefaultTone; label: string }[] = [
  { id: 'professional', label: 'Professional' },
  { id: 'empathetic', label: 'Empathetic' },
  { id: 'technical', label: 'Technical' },
];

// Slider component
function Slider({
  label,
  value,
  min,
  max,
  step,
  onChange,
  formatValue,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  onChange: (value: number) => void;
  formatValue?: (value: number) => string;
}): React.ReactElement {
  return (
    <div className="space-y-2">
      <div className="flex justify-between text-sm">
        <span className="font-medium text-[#F9FAFB]">{label}</span>
        <span className="text-[#9CA3AF]">{formatValue ? formatValue(value) : value}</span>
      </div>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(parseFloat(e.target.value))}
        className="w-full h-2 bg-[#1E3461] rounded-lg appearance-none cursor-pointer accent-blue-600"
      />
    </div>
  );
}

// Voice Card component
function VoiceCard({
  voice,
  isSelected,
  isPlaying,
  onSelect,
  onPlay,
}: {
  voice: Voice;
  isSelected: boolean;
  isPlaying: boolean;
  onSelect: () => void;
  onPlay: () => void;
}): React.ReactElement {
  return (
    <div
      onClick={onSelect}
      className={`relative p-4 rounded-lg border-2 cursor-pointer transition-all ${
        isSelected
          ? 'border-blue-500 bg-blue-900/30 ring-2 ring-blue-200'
          : 'border-[#1E3461] hover:border-[#3B82F6] bg-[#162240]'
      }`}
    >
      {isSelected && (
        <div className="absolute top-2 right-2 w-5 h-5 bg-blue-500 rounded-full flex items-center justify-center">
          <Check className="w-3 h-3 text-white" />
        </div>
      )}
      <div className="flex items-center gap-3">
        <button
          onClick={(e) => {
            e.stopPropagation();
            onPlay();
          }}
          className={`p-2 rounded-full ${
            isPlaying ? 'bg-blue-600 text-white' : 'bg-[#0F1F3D] text-[#9CA3AF] hover:bg-[#1E3461]'
          }`}
        >
          {isPlaying ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4" />}
        </button>
        <div>
          <p className="font-medium text-[#F9FAFB]">{voice.name}</p>
          <p className="text-sm text-[#9CA3AF]">
            {voice.gender && `${voice.gender} • `}
            {voice.accent || voice.category}
          </p>
        </div>
      </div>
    </div>
  );
}

// Phone mockup component
function PhoneMockup({
  greeting,
  agentName,
}: {
  greeting: string;
  agentName: string;
}): React.ReactElement {
  return (
    <div className="bg-gray-900 rounded-[2.5rem] p-3 w-64 mx-auto">
      <div className="bg-[#162240] rounded-[2rem] overflow-hidden">
        {/* Notch */}
        <div className="h-6 bg-gray-900 flex items-center justify-center">
          <div className="w-20 h-4 bg-black rounded-full" />
        </div>
        {/* Screen */}
        <div className="p-4 min-h-[300px] flex flex-col">
          <div className="text-center mb-6">
            <div className="w-16 h-16 bg-blue-900/50 rounded-full mx-auto mb-2 flex items-center justify-center">
              <Smartphone className="w-8 h-8 text-blue-400" />
            </div>
            <p className="font-semibold text-[#F9FAFB]">{agentName}</p>
            <p className="text-xs text-[#9CA3AF]">AI Voice Agent</p>
          </div>
          <div className="flex-1 flex flex-col justify-center">
            <div className="bg-blue-900/30 rounded-lg p-3 text-sm text-[#F9FAFB]">
              "{greeting}"
            </div>
          </div>
          <div className="flex justify-center gap-4 mt-4">
            <div className="w-12 h-12 bg-red-500 rounded-full flex items-center justify-center">
              <Phone className="w-5 h-5 text-white transform rotate-135" />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// Tag input component for categories
function TagInput({
  tags,
  onChange,
}: {
  tags: string[];
  onChange: (tags: string[]) => void;
}): React.ReactElement {
  const [input, setInput] = useState('');
  const [draggedIndex, setDraggedIndex] = useState<number | null>(null);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && input.trim()) {
      e.preventDefault();
      if (!tags.includes(input.trim())) {
        onChange([...tags, input.trim()]);
      }
      setInput('');
    } else if (e.key === 'Backspace' && !input && tags.length > 0) {
      onChange(tags.slice(0, -1));
    }
  };

  const removeTag = (index: number) => {
    onChange(tags.filter((_, i) => i !== index));
  };

  const handleDragStart = (index: number) => {
    setDraggedIndex(index);
  };

  const handleDragOver = (e: React.DragEvent, index: number) => {
    e.preventDefault();
    if (draggedIndex === null || draggedIndex === index) return;
    
    const newTags = [...tags];
    const [draggedTag] = newTags.splice(draggedIndex, 1);
    newTags.splice(index, 0, draggedTag);
    onChange(newTags);
    setDraggedIndex(index);
  };

  const handleDragEnd = () => {
    setDraggedIndex(null);
  };

  return (
    <div className="border border-[#1E3461] rounded-lg p-2 focus-within:ring-2 focus-within:ring-[#3B82F6] focus-within:border-[#3B82F6] bg-[#0A1835]">
      <div className="flex flex-wrap gap-2">
        {tags.map((tag, index) => (
          <div
            key={index}
            draggable
            onDragStart={() => handleDragStart(index)}
            onDragOver={(e) => handleDragOver(e, index)}
            onDragEnd={handleDragEnd}
            className={`inline-flex items-center gap-1 px-2 py-1 bg-blue-900/50 text-blue-300 rounded-md text-sm cursor-move ${
              draggedIndex === index ? 'opacity-50' : ''
            }`}
          >
            <GripVertical className="w-3 h-3 text-blue-400" />
            {tag}
            <button
              onClick={() => removeTag(index)}
              className="hover:text-blue-100"
            >
              <X className="w-3 h-3" />
            </button>
          </div>
        ))}
        <input
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder={tags.length === 0 ? 'Add category...' : ''}
          className="flex-1 min-w-[120px] outline-none text-sm py-1 bg-transparent text-[#F9FAFB] placeholder-[#6B7280]"
        />
      </div>
    </div>
  );
}

export function AgentConfig(): React.ReactElement {
  const [activeTab, setActiveTab] = useState<TabId>('voice');
  const [isSaving, setIsSaving] = useState(false);
  const [hasChanges, setHasChanges] = useState(false);
  
  // Voice state
  const [agentName, setAgentName] = useState('Support Agent');
  const [greeting, setGreeting] = useState('Hello! Thanks for calling. How can I help you today?');
  const [selectedVoiceId, setSelectedVoiceId] = useState('');
  const [stability, setStability] = useState(50);
  const [similarityBoost, setSimilarityBoost] = useState(75);
  const [speakingRate, setSpeakingRate] = useState(1.0);
  const [attemptsBeforeEscalate, setAttemptsBeforeEscalate] = useState(3);
  const [sentimentThreshold, setSentimentThreshold] = useState(30);
  const [playingVoiceId, setPlayingVoiceId] = useState<string | null>(null);
  const [testPhoneNumber, setTestPhoneNumber] = useState('');
  
  // Text state
  const [categories, setCategories] = useState<string[]>([]);
  const [brandVoice, setBrandVoice] = useState('');
  const [defaultTone, setDefaultTone] = useState<DefaultTone>('professional');
  const [confidenceThreshold, setConfidenceThreshold] = useState(70);
  
  // Prompt state
  const [systemPromptSuffix, setSystemPromptSuffix] = useState('');
  const [showEffectivePrompt, setShowEffectivePrompt] = useState(false);
  
  // QA state
  const [qaDimensions, setQaDimensions] = useState<QARubricDimension[]>(DEFAULT_QA_DIMENSIONS);
  
  // Audio ref
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const previewDebounceRef = useRef<NodeJS.Timeout | null>(null);
  
  // RTK Query hooks
  const { data: configData, isLoading: isLoadingConfig } = useGetAgentConfigQuery();
  const { data: voicesData, isLoading: isLoadingVoices } = useGetVoicesQuery();
  const [updateVoiceConfig] = useUpdateVoiceConfigMutation();
  const [updateTextConfig] = useUpdateTextConfigMutation();
  const [previewVoice, { isLoading: isPreviewingVoice }] = usePreviewVoiceMutation();
  const [makeTestCall, { isLoading: isMakingCall }] = useMakeTestCallMutation();

  // Initialize state from config
  useEffect(() => {
    if (configData) {
      setAgentName(configData.voiceConfig.agentName);
      setGreeting(configData.voiceConfig.agentGreeting);
      setSelectedVoiceId(configData.voiceConfig.voiceId);
      setStability(configData.voiceConfig.stability * 100);
      setSimilarityBoost(configData.voiceConfig.similarityBoost * 100);
      setSpeakingRate(configData.voiceConfig.speakingRate);
      setCategories(configData.textConfig.classificationCategories);
      setBrandVoice(configData.textConfig.brandVoice);
    }
  }, [configData]);

  // Debounced voice preview
  const triggerVoicePreview = useCallback(() => {
    if (previewDebounceRef.current) {
      clearTimeout(previewDebounceRef.current);
    }
    
    previewDebounceRef.current = setTimeout(async () => {
      if (!selectedVoiceId || !greeting) return;
      
      try {
        const result = await previewVoice({
          text: greeting.slice(0, 100),
          voiceId: selectedVoiceId,
        }).unwrap();
        
        if (audioRef.current) {
          audioRef.current.src = `data:${result.contentType};base64,${result.audio}`;
          audioRef.current.play();
        }
      } catch {
        // Silently fail for preview
      }
    }, 500);
  }, [selectedVoiceId, greeting, previewVoice]);

  // Play voice preview
  const handlePlayVoice = async (voiceId: string) => {
    if (playingVoiceId === voiceId) {
      audioRef.current?.pause();
      setPlayingVoiceId(null);
      return;
    }

    setPlayingVoiceId(voiceId);
    
    try {
      const result = await previewVoice({
        text: 'Hello! Thanks for calling. How can I help you today?',
        voiceId,
      }).unwrap();
      
      if (audioRef.current) {
        audioRef.current.src = `data:${result.contentType};base64,${result.audio}`;
        audioRef.current.play();
        audioRef.current.onended = () => setPlayingVoiceId(null);
      }
    } catch {
      toast.error('Failed to preview voice');
      setPlayingVoiceId(null);
    }
  };

  // Handle test call
  const handleTestCall = async () => {
    if (!testPhoneNumber) {
      toast.error('Please enter a phone number');
      return;
    }

    try {
      await makeTestCall({ phoneNumber: testPhoneNumber }).unwrap();
      toast.success('Test call initiated!');
      setTestPhoneNumber('');
    } catch {
      toast.error('Failed to make test call');
    }
  };

  // Save configuration
  const handleSave = async () => {
    setIsSaving(true);
    
    try {
      // Save voice config
      await updateVoiceConfig({
        agentName,
        agentGreeting: greeting,
        voiceId: selectedVoiceId,
        stability: stability / 100,
        similarityBoost: similarityBoost / 100,
        speakingRate,
      }).unwrap();
      
      // Save text config
      await updateTextConfig({
        classificationCategories: categories,
        brandVoice,
      }).unwrap();
      
      toast.success('Configuration saved');
      setHasChanges(false);
    } catch {
      toast.error('Failed to save configuration');
    } finally {
      setIsSaving(false);
    }
  };

  // Update QA dimension
  const updateQaDimension = (index: number, field: keyof QARubricDimension, value: number) => {
    const newDimensions = [...qaDimensions];
    newDimensions[index] = { ...newDimensions[index], [field]: value };
    setQaDimensions(newDimensions);
    setHasChanges(true);
  };

  // Get top 4 voices for display
  const displayVoices = useMemo(() => {
    return voicesData?.voices.slice(0, 4) || [];
  }, [voicesData]);

  // Effective prompt preview
  const effectivePrompt = useMemo(() => {
    return `You are ${agentName}, an AI customer support agent.

## Your Role
You help customers with their inquiries and issues. You should be ${brandVoice || 'professional and helpful'}.

## Available Categories
${categories.map(c => `- ${c}`).join('\n')}

## Guidelines
1. Always greet the customer warmly
2. Listen carefully to understand their issue
3. Ask clarifying questions when needed
4. Provide accurate, helpful information
5. If you cannot resolve an issue, offer to escalate

${systemPromptSuffix ? `## Additional Instructions\n${systemPromptSuffix}` : ''}`;
  }, [agentName, brandVoice, categories, systemPromptSuffix]);

  if (isLoadingConfig) {
    return (
      <div className="min-h-screen bg-[#0A1835] flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-blue-600" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#0A1835]">
      {/* Hidden audio element */}
      <audio ref={audioRef} className="hidden" />
      
      {/* Header */}
      <div className="bg-[#162240] border-b border-[#1E3461] px-6 py-4">
        <h1 className="text-2xl font-semibold text-[#F9FAFB]">AI Agent Configuration</h1>
        <p className="text-sm text-[#9CA3AF] mt-1">
          Configure your AI voice and text agents
        </p>
      </div>

      {/* Tabs */}
      <div className="bg-[#162240] border-b border-[#1E3461]">
        <div className="px-6">
          <nav className="flex gap-1">
            {TABS.map((tab) => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`flex items-center gap-2 px-4 py-3 text-sm font-medium border-b-2 transition-colors ${
                  activeTab === tab.id
                    ? 'border-blue-600 text-blue-600'
                    : 'border-transparent text-[#9CA3AF] hover:text-[#F9FAFB]'
                }`}
              >
                {tab.icon}
                {tab.label}
              </button>
            ))}
          </nav>
        </div>
      </div>

      {/* Content */}
      <div className="p-6">
        {/* Voice Agent Tab */}
        {activeTab === 'voice' && (
          <div className="flex gap-6">
            {/* Left panel */}
            <div className="flex-1 space-y-6">
              {/* Identity Section */}
              <div className="bg-[#162240] rounded-lg shadow-sm border border-[#1E3461] p-6">
                <h2 className="text-lg font-semibold text-[#F9FAFB] mb-4">Agent Identity</h2>
                <div className="space-y-4">
                  <div>
                    <label className="block text-sm font-medium text-[#9CA3AF] mb-1">
                      Agent Name
                    </label>
                    <input
                      type="text"
                      value={agentName}
                      onChange={(e) => {
                        if (e.target.value.length <= 30) {
                          setAgentName(e.target.value);
                          setHasChanges(true);
                        }
                      }}
                      maxLength={30}
                      className="w-full px-3 py-2 bg-[#0A1835] border border-[#1E3461] text-[#F9FAFB] rounded-lg focus:ring-2 focus:ring-[#3B82F6] focus:border-[#3B82F6]"
                    />
                    <p className="text-xs text-[#6B7280] mt-1">{agentName.length}/30</p>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-[#9CA3AF] mb-1">
                      Greeting Message
                    </label>
                    <textarea
                      value={greeting}
                      onChange={(e) => {
                        if (e.target.value.length <= 200) {
                          setGreeting(e.target.value);
                          setHasChanges(true);
                        }
                      }}
                      maxLength={200}
                      rows={3}
                      className="w-full px-3 py-2 bg-[#0A1835] border border-[#1E3461] text-[#F9FAFB] rounded-lg focus:ring-2 focus:ring-[#3B82F6] focus:border-[#3B82F6] resize-none"
                    />
                    <p className="text-xs text-[#6B7280] mt-1">{greeting.length}/200</p>
                  </div>
                </div>
              </div>

              {/* Voice Selection */}
              <div className="bg-[#162240] rounded-lg shadow-sm border border-[#1E3461] p-6">
                <h2 className="text-lg font-semibold text-[#F9FAFB] mb-4">Voice Selection</h2>
                {isLoadingVoices ? (
                  <div className="flex items-center justify-center py-8">
                    <Loader2 className="w-6 h-6 animate-spin text-[#9CA3AF]" />
                  </div>
                ) : (
                  <>
                    <div className="grid grid-cols-2 gap-4 mb-4">
                      {displayVoices.map((voice) => (
                        <VoiceCard
                          key={voice.id}
                          voice={voice}
                          isSelected={selectedVoiceId === voice.id}
                          isPlaying={playingVoiceId === voice.id}
                          onSelect={() => {
                            setSelectedVoiceId(voice.id);
                            setHasChanges(true);
                          }}
                          onPlay={() => handlePlayVoice(voice.id)}
                        />
                      ))}
                    </div>
                    <button className="flex items-center gap-2 text-sm text-[#9CA3AF] hover:text-[#F9FAFB]">
                      <Upload className="w-4 h-4" />
                      Upload Custom Voice
                      <span className="px-1.5 py-0.5 text-xs bg-amber-100 text-amber-700 rounded flex items-center gap-1">
                        <Crown className="w-3 h-3" />
                        Pro+
                      </span>
                    </button>
                  </>
                )}
              </div>

              {/* Voice Parameters */}
              <div className="bg-[#162240] rounded-lg shadow-sm border border-[#1E3461] p-6">
                <h2 className="text-lg font-semibold text-[#F9FAFB] mb-4">Voice Parameters</h2>
                <div className="space-y-6">
                  <Slider
                    label="Stability"
                    value={stability}
                    min={0}
                    max={100}
                    step={1}
                    onChange={(v) => {
                      setStability(v);
                      setHasChanges(true);
                      triggerVoicePreview();
                    }}
                    formatValue={(v) => `${v}%`}
                  />
                  <Slider
                    label="Similarity Boost"
                    value={similarityBoost}
                    min={0}
                    max={100}
                    step={1}
                    onChange={(v) => {
                      setSimilarityBoost(v);
                      setHasChanges(true);
                      triggerVoicePreview();
                    }}
                    formatValue={(v) => `${v}%`}
                  />
                  <Slider
                    label="Speaking Rate"
                    value={speakingRate}
                    min={0.5}
                    max={2.0}
                    step={0.1}
                    onChange={(v) => {
                      setSpeakingRate(v);
                      setHasChanges(true);
                      triggerVoicePreview();
                    }}
                    formatValue={(v) => `${v.toFixed(1)}x`}
                  />
                </div>
              </div>

              {/* Escalation Rules */}
              <div className="bg-[#162240] rounded-lg shadow-sm border border-[#1E3461] p-6">
                <h2 className="text-lg font-semibold text-[#F9FAFB] mb-4">Escalation Rules</h2>
                <div className="space-y-4">
                  <div>
                    <label className="block text-sm font-medium text-[#9CA3AF] mb-1">
                      Attempts Before Escalation
                    </label>
                    <input
                      type="number"
                      value={attemptsBeforeEscalate}
                      onChange={(e) => {
                        setAttemptsBeforeEscalate(Math.max(1, parseInt(e.target.value) || 1));
                        setHasChanges(true);
                      }}
                      min={1}
                      max={10}
                      className="w-24 px-3 py-2 bg-[#0A1835] border border-[#1E3461] text-[#F9FAFB] rounded-lg focus:ring-2 focus:ring-[#3B82F6] focus:border-[#3B82F6]"
                    />
                  </div>
                  <Slider
                    label="Sentiment Threshold (escalate if below)"
                    value={sentimentThreshold}
                    min={0}
                    max={100}
                    step={5}
                    onChange={(v) => {
                      setSentimentThreshold(v);
                      setHasChanges(true);
                    }}
                    formatValue={(v) => `${v}%`}
                  />
                </div>
              </div>
            </div>

            {/* Right panel - Phone Mockup */}
            <div className="w-80 space-y-6">
              <div className="bg-[#162240] rounded-lg shadow-sm border border-[#1E3461] p-6">
                <h3 className="text-sm font-medium text-[#9CA3AF] mb-4 text-center">Preview</h3>
                <PhoneMockup greeting={greeting} agentName={agentName} />
              </div>

              <div className="bg-[#162240] rounded-lg shadow-sm border border-[#1E3461] p-6">
                <h3 className="text-sm font-medium text-[#9CA3AF] mb-4">Test Your Agent</h3>
                <div className="space-y-3">
                  <input
                    type="tel"
                    value={testPhoneNumber}
                    onChange={(e) => setTestPhoneNumber(e.target.value)}
                    placeholder="+1 (555) 123-4567"
                    className="w-full px-3 py-2 bg-[#0A1835] border border-[#1E3461] text-[#F9FAFB] placeholder-[#6B7280] rounded-lg focus:ring-2 focus:ring-[#3B82F6] focus:border-[#3B82F6]"
                  />
                  <button
                    onClick={handleTestCall}
                    disabled={isMakingCall}
                    className="w-full flex items-center justify-center gap-2 px-4 py-2 bg-green-600 text-white font-medium rounded-lg hover:bg-green-700 disabled:opacity-50"
                  >
                    {isMakingCall ? (
                      <Loader2 className="w-4 h-4 animate-spin" />
                    ) : (
                      <Phone className="w-4 h-4" />
                    )}
                    Make Test Call
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Text Agent Tab */}
        {activeTab === 'text' && (
          <div className="max-w-3xl space-y-6">
            {/* Classification Categories */}
            <div className="bg-[#162240] rounded-lg shadow-sm border border-[#1E3461] p-6">
              <h2 className="text-lg font-semibold text-[#F9FAFB] mb-4">Classification Categories</h2>
              <p className="text-sm text-[#9CA3AF] mb-4">
                Add categories that your AI will use to classify incoming tickets. Drag to reorder.
              </p>
              <TagInput
                tags={categories}
                onChange={(tags) => {
                  setCategories(tags);
                  setHasChanges(true);
                }}
              />
            </div>

            {/* Brand Voice */}
            <div className="bg-[#162240] rounded-lg shadow-sm border border-[#1E3461] p-6">
              <h2 className="text-lg font-semibold text-[#F9FAFB] mb-4">Brand Voice</h2>
              <textarea
                value={brandVoice}
                onChange={(e) => {
                  setBrandVoice(e.target.value);
                  setHasChanges(true);
                }}
                rows={4}
                placeholder="Describe your response style... (e.g., Professional yet friendly, use clear language, be empathetic to customer concerns)"
                className="w-full px-3 py-2 bg-[#0A1835] border border-[#1E3461] text-[#F9FAFB] placeholder-[#6B7280] rounded-lg focus:ring-2 focus:ring-[#3B82F6] focus:border-[#3B82F6] resize-none"
              />
            </div>

            {/* Default Tone */}
            <div className="bg-[#162240] rounded-lg shadow-sm border border-[#1E3461] p-6">
              <h2 className="text-lg font-semibold text-[#F9FAFB] mb-4">Default Tone</h2>
              <div className="flex gap-2">
                {DEFAULT_TONES.map((tone) => (
                  <button
                    key={tone.id}
                    onClick={() => {
                      setDefaultTone(tone.id);
                      setHasChanges(true);
                    }}
                    className={`px-4 py-2 rounded-full text-sm font-medium transition-colors ${
                      defaultTone === tone.id
                        ? 'bg-blue-600 text-white'
                        : 'bg-[#0F1F3D] text-[#9CA3AF] hover:bg-[#1E3461]'
                    }`}
                  >
                    {tone.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Confidence Threshold */}
            <div className="bg-[#162240] rounded-lg shadow-sm border border-[#1E3461] p-6">
              <h2 className="text-lg font-semibold text-[#F9FAFB] mb-4">Confidence Threshold</h2>
              <p className="text-sm text-[#9CA3AF] mb-4">
                Responses below this confidence level will be flagged for human review.
              </p>
              <Slider
                label="Minimum Confidence"
                value={confidenceThreshold}
                min={0}
                max={100}
                step={5}
                onChange={(v) => {
                  setConfidenceThreshold(v);
                  setHasChanges(true);
                }}
                formatValue={(v) => `${v}%`}
              />
            </div>
          </div>
        )}

        {/* Prompt Settings Tab */}
        {activeTab === 'prompt' && (
          <div className="max-w-3xl space-y-6">
            {/* System Prompt Suffix */}
            <div className="bg-[#162240] rounded-lg shadow-sm border border-[#1E3461] p-6">
              <div className="flex items-center gap-2 mb-4">
                <h2 className="text-lg font-semibold text-[#F9FAFB]">System Prompt Suffix</h2>
                <span className="px-2 py-0.5 text-xs bg-amber-100 text-amber-700 rounded">
                  Advanced
                </span>
              </div>
              <p className="text-sm text-[#9CA3AF] mb-4">
                Additional instructions appended to the system prompt. Use this for custom behaviors.
              </p>
              <textarea
                value={systemPromptSuffix}
                onChange={(e) => {
                  setSystemPromptSuffix(e.target.value);
                  setHasChanges(true);
                }}
                rows={6}
                placeholder="Add custom instructions for the AI agent..."
                className="w-full px-3 py-2 bg-[#0A1835] border border-[#1E3461] text-[#F9FAFB] placeholder-[#6B7280] rounded-lg focus:ring-2 focus:ring-[#3B82F6] focus:border-[#3B82F6] resize-none font-mono text-sm"
              />
            </div>

            {/* Effective Prompt */}
            <div className="bg-[#162240] rounded-lg shadow-sm border border-[#1E3461] p-6">
              <button
                onClick={() => setShowEffectivePrompt(!showEffectivePrompt)}
                className="flex items-center justify-between w-full"
              >
                <h2 className="text-lg font-semibold text-[#F9FAFB]">Current Effective Prompt</h2>
                {showEffectivePrompt ? (
                  <ChevronUp className="w-5 h-5 text-[#6B7280]" />
                ) : (
                  <ChevronDown className="w-5 h-5 text-[#6B7280]" />
                )}
              </button>
              {showEffectivePrompt && (
                <pre className="mt-4 p-4 bg-[#0F1F3D] rounded-lg text-sm text-[#9CA3AF] whitespace-pre-wrap font-mono overflow-x-auto">
                  {effectivePrompt}
                </pre>
              )}
            </div>

            {/* Reset Button */}
            <button
              onClick={() => {
                setSystemPromptSuffix('');
                setHasChanges(true);
                toast.success('Prompt reset to default');
              }}
              className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-[#F9FAFB] bg-[#162240] border border-[#1E3461] rounded-lg hover:bg-[#0F1F3D]"
            >
              <RotateCcw className="w-4 h-4" />
              Reset to Default
            </button>
          </div>
        )}

        {/* QA Scoring Tab */}
        {activeTab === 'qa' && (
          <div className="max-w-3xl space-y-6">
            <div className="bg-[#162240] rounded-lg shadow-sm border border-[#1E3461] p-6">
              <h2 className="text-lg font-semibold text-[#F9FAFB] mb-2">QA Rubric Dimensions</h2>
              <p className="text-sm text-[#9CA3AF] mb-6">
                Configure how AI responses are scored. Weights must total 100%.
              </p>
              
              <div className="space-y-6">
                {qaDimensions.map((dimension, index) => (
                  <div key={dimension.name} className="p-4 bg-[#0F1F3D] rounded-lg">
                    <h3 className="font-medium text-[#F9FAFB] mb-4">{dimension.name}</h3>
                    <div className="grid grid-cols-2 gap-6">
                      <Slider
                        label="Weight"
                        value={dimension.weight}
                        min={0}
                        max={100}
                        step={5}
                        onChange={(v) => updateQaDimension(index, 'weight', v)}
                        formatValue={(v) => `${v}%`}
                      />
                      <Slider
                        label="Min Pass Score"
                        value={dimension.minPassScore}
                        min={0}
                        max={100}
                        step={5}
                        onChange={(v) => updateQaDimension(index, 'minPassScore', v)}
                        formatValue={(v) => `${v}%`}
                      />
                    </div>
                  </div>
                ))}
              </div>

              {/* Weight validation */}
              {(() => {
                const totalWeight = qaDimensions.reduce((sum, d) => sum + d.weight, 0);
                if (totalWeight !== 100) {
                  return (
                    <p className="mt-4 text-sm text-amber-600">
                      ⚠️ Weights total {totalWeight}% (should be 100%)
                    </p>
                  );
                }
                return null;
              })()}
            </div>
          </div>
        )}
      </div>

      {/* Fixed Save Button */}
      <div className="fixed bottom-0 left-0 right-0 bg-[#162240] border-t border-[#1E3461] px-6 py-4">
        <div className="max-w-7xl mx-auto flex items-center justify-end gap-4">
          {hasChanges && (
            <span className="text-sm text-amber-600">You have unsaved changes</span>
          )}
          <button
            onClick={handleSave}
            disabled={isSaving || !hasChanges}
            className="flex items-center gap-2 px-6 py-2.5 bg-blue-600 text-white font-medium rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {isSaving ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                Syncing to AI...
              </>
            ) : (
              'Save Configuration'
            )}
          </button>
        </div>
      </div>
    </div>
  );
}

export default AgentConfig;
