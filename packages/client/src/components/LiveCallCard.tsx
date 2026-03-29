import { useState, useEffect, useCallback } from 'react';
import {
  Phone,
  Clock,
  AlertTriangle,
  Sparkles,
  ExternalLink,
  TrendingUp,
  TrendingDown,
  Minus,
  ShieldAlert,
} from 'lucide-react';
import { FraudRiskBadge } from './FraudRiskBadge';
import type { RiskLevel } from '../api/fraudApi';

export interface ActiveCallData {
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
  hasProactiveContext?: boolean;
  fraudScore?: number;
  fraudRiskLevel?: RiskLevel;
  isHighRisk?: boolean;
}

interface LiveCallCardProps {
  call: ActiveCallData;
  onViewTranscript: (callId: string) => void;
  onEscalate: (callId: string) => void;
}

// Language flag emoji map
const languageFlags: Record<string, string> = {
  en: '🇺🇸',
  es: '🇪🇸',
  fr: '🇫🇷',
  de: '🇩🇪',
  pt: '🇧🇷',
  it: '🇮🇹',
  ja: '🇯🇵',
  zh: '🇨🇳',
  ko: '🇰🇷',
  ar: '🇸🇦',
  hi: '🇮🇳',
  ru: '🇷🇺',
};

// Intent display names
const intentLabels: Record<string, string> = {
  greeting: 'Greeting',
  billing_inquiry: 'Billing',
  technical_support: 'Tech Support',
  order_status: 'Order Status',
  product_info: 'Product Info',
  complaint: 'Complaint',
  return_request: 'Return',
  account_update: 'Account',
  general_inquiry: 'General',
  escalate_to_human: 'Escalating',
};

export default function LiveCallCard({ call, onViewTranscript, onEscalate }: LiveCallCardProps) {
  const [liveDuration, setLiveDuration] = useState(call.duration);

  // Update duration every second
  useEffect(() => {
    const interval = setInterval(() => {
      const start = new Date(call.startedAt).getTime();
      const now = Date.now();
      setLiveDuration(Math.floor((now - start) / 1000));
    }, 1000);

    return () => clearInterval(interval);
  }, [call.startedAt]);

  // Format duration as MM:SS
  const formatDuration = useCallback((seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  }, []);

  // Confidence color
  const getConfidenceColor = (conf: number) => {
    if (conf >= 0.8) return 'bg-green-500';
    if (conf >= 0.6) return 'bg-amber-500';
    return 'bg-red-500';
  };

  // Sentiment color and icon
  const getSentimentInfo = (score: number, trend?: string) => {
    let color = 'bg-gray-400';
    let pulseColor = '';
    
    if (score >= 0.6) {
      color = 'bg-green-500';
      pulseColor = 'animate-pulse';
    } else if (score >= 0.4) {
      color = 'bg-amber-500';
    } else {
      color = 'bg-red-500';
      pulseColor = 'animate-pulse';
    }

    const TrendIcon = trend === 'improving' ? TrendingUp : trend === 'declining' ? TrendingDown : Minus;

    return { color, pulseColor, TrendIcon };
  };

  const sentimentInfo = getSentimentInfo(call.sentimentScore, call.sentimentTrend);
  const flag = languageFlags[call.language] || '🌐';
  const intentLabel = intentLabels[call.currentIntent] || call.currentIntent;

  // Determine if call is high risk (sentiment/confidence OR fraud)
  const isAtRisk = call.sentimentScore < 0.4 || call.confidence < 0.6;
  const hasFraudRisk = (call.fraudScore !== undefined && call.fraudScore > 0.55) || call.isHighRisk;

  return (
    <div
      className={`bg-white rounded-xl shadow-sm border-2 p-4 transition-all hover:shadow-md ${
        hasFraudRisk
          ? 'border-red-500 animate-pulse'
          : isAtRisk
          ? 'border-red-300'
          : 'border-gray-200'
      }`}
    >
      {/* Header Row */}
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <div className="p-2 bg-teal-100 rounded-full">
            <Phone className="h-4 w-4 text-teal-600" />
          </div>
          <span className="font-mono text-sm text-gray-700">{call.callerPhone}</span>
          {/* PRO Badge for Proactive Context */}
          {call.hasProactiveContext && (
            <span
              className="inline-flex items-center px-1.5 py-0.5 bg-amber-100 text-amber-700 text-xs font-semibold rounded cursor-help"
              title="Proactive suggestions active — AI is anticipating follow-ups"
            >
              PRO
            </span>
          )}
          {/* Fraud Risk Badge */}
          {hasFraudRisk && call.fraudRiskLevel && (
            <span
              title={`Fraud risk detected — score: ${((call.fraudScore || 0) * 100).toFixed(0)}%`}
            >
              <FraudRiskBadge riskLevel={call.fraudRiskLevel} size="sm" />
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
          <span className="text-lg">{flag}</span>
          <div className="flex items-center gap-1 text-gray-500">
            <Clock className="h-4 w-4" />
            <span className="font-mono text-sm font-medium">{formatDuration(liveDuration)}</span>
          </div>
        </div>
      </div>

      {/* Intent Chip */}
      <div className="flex items-center gap-2 mb-3">
        <span className="inline-flex items-center gap-1 px-2 py-1 bg-purple-100 text-purple-700 text-xs font-medium rounded-full">
          <Sparkles className="h-3 w-3" />
          {intentLabel}
        </span>
        <span className="text-xs text-gray-400">{call.turnCount} turns</span>
      </div>

      {/* Confidence Bar */}
      <div className="mb-3">
        <div className="flex items-center justify-between text-xs text-gray-500 mb-1">
          <span>AI Confidence</span>
          <span>{Math.round(call.confidence * 100)}%</span>
        </div>
        <div className="h-2 bg-gray-200 rounded-full overflow-hidden">
          <div
            className={`h-full ${getConfidenceColor(call.confidence)} transition-all duration-300`}
            style={{ width: `${call.confidence * 100}%` }}
          />
        </div>
      </div>

      {/* Sentiment Indicator */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <div
            className={`w-3 h-3 rounded-full ${sentimentInfo.color} ${sentimentInfo.pulseColor}`}
          />
          <span className="text-xs text-gray-600">
            Sentiment: {Math.round(call.sentimentScore * 100)}%
          </span>
          <sentimentInfo.TrendIcon className="h-3 w-3 text-gray-400" />
        </div>
        <div className="flex items-center gap-2">
          {hasFraudRisk && (
            <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-red-100 text-red-700 text-xs rounded-full">
              <ShieldAlert className="h-3 w-3" />
              Fraud Risk
            </span>
          )}
          {isAtRisk && !hasFraudRisk && (
            <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-red-100 text-red-700 text-xs rounded-full">
              <AlertTriangle className="h-3 w-3" />
              At Risk
            </span>
          )}
        </div>
      </div>

      {/* Action Buttons */}
      <div className="flex gap-2">
        <button
          onClick={() => onViewTranscript(call.callId)}
          className="flex-1 inline-flex items-center justify-center gap-1 px-3 py-2 bg-gray-100 text-gray-700 text-sm font-medium rounded-lg hover:bg-gray-200 transition-colors"
        >
          <ExternalLink className="h-4 w-4" />
          View Transcript
        </button>
        <button
          onClick={() => onEscalate(call.callId)}
          className="inline-flex items-center justify-center gap-1 px-3 py-2 bg-amber-100 text-amber-700 text-sm font-medium rounded-lg hover:bg-amber-200 transition-colors"
        >
          <AlertTriangle className="h-4 w-4" />
          Escalate
        </button>
      </div>
    </div>
  );
}
