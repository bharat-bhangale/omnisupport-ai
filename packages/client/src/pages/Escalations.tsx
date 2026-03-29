import React, { useState, useCallback, useMemo, useEffect } from 'react';
import {
  Phone,
  PhoneIncoming,
  AlertTriangle,
  User,
  Clock,
  Sparkles,
  CheckCircle,
  XCircle,
  ChevronRight,
  RefreshCw,
  MessageSquare,
  Tag,
  Loader2,
} from 'lucide-react';
import toast from 'react-hot-toast';
import {
  useGetEscalationsQuery,
  useAcceptEscalationMutation,
  useAcceptNextEscalationMutation,
  useResolveEscalationMutation,
  type Escalation,
} from '../api/escalationsApi';
import { useEscalationSocket } from '../hooks/useEscalationSocket';
import { HoldTimer, formatHoldDuration } from '../components/HoldTimer';
import type { Turn } from '../types/escalation';

// Priority colors
const priorityColors: Record<string, { bg: string; text: string; dot: string; border: string }> = {
  urgent: {
    bg: 'bg-red-50',
    text: 'text-red-700',
    dot: 'bg-red-500',
    border: 'border-red-500',
  },
  high: {
    bg: 'bg-orange-50',
    text: 'text-orange-700',
    dot: 'bg-orange-500',
    border: 'border-orange-500',
  },
  medium: {
    bg: 'bg-amber-50',
    text: 'text-amber-700',
    dot: 'bg-amber-500',
    border: 'border-amber-500',
  },
  low: {
    bg: 'bg-blue-50',
    text: 'text-blue-700',
    dot: 'bg-blue-500',
    border: 'border-blue-500',
  },
};

// Sentiment colors
const sentimentColors: Record<string, { bg: string; text: string }> = {
  positive: { bg: 'bg-green-100', text: 'text-green-700' },
  neutral: { bg: 'bg-gray-100', text: 'text-gray-700' },
  negative: { bg: 'bg-red-100', text: 'text-red-700' },
};

// Tier badge colors
const tierColors: Record<string, string> = {
  standard: 'bg-gray-100 text-gray-700',
  premium: 'bg-blue-100 text-blue-700',
  vip: 'bg-purple-100 text-purple-700',
  enterprise: 'bg-indigo-100 text-indigo-700',
};

/**
 * Format phone number for display (masked)
 */
function formatPhone(phone: string): string {
  return phone; // Already masked from server
}

/**
 * Escalation Card Component
 */
function EscalationCard({
  escalation,
  isSelected,
  onSelect,
  onAccept,
  isAccepting,
}: {
  escalation: Escalation;
  isSelected: boolean;
  onSelect: (id: string) => void;
  onAccept: (id: string) => void;
  isAccepting: boolean;
}): React.ReactElement {
  const colors = priorityColors[escalation.priority] || priorityColors.medium;
  const sentimentColor = sentimentColors[escalation.sentiment] || sentimentColors.neutral;
  const isWaiting = escalation.status === 'waiting';
  const isAccepted = escalation.status === 'accepted';

  return (
    <div
      className={`rounded-lg border-2 overflow-hidden cursor-pointer transition-all ${
        isSelected ? 'ring-2 ring-blue-500 border-blue-500' : 'border-gray-200 hover:border-gray-300'
      }`}
      onClick={() => onSelect(escalation.id)}
    >
      {/* Priority strip */}
      <div className={`h-1.5 ${colors.dot}`} />

      <div className="p-4 space-y-3">
        {/* Header: Priority + Hold Time */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className={`w-2 h-2 rounded-full ${colors.dot} ${isWaiting ? 'animate-pulse' : ''}`} />
            <span className={`text-xs font-medium uppercase ${colors.text}`}>
              {escalation.priority}
            </span>
          </div>
          <HoldTimer holdStarted={escalation.holdStarted} size="sm" />
        </div>

        {/* Phone + Customer */}
        <div className="flex items-center gap-2">
          <Phone className="w-4 h-4 text-gray-400" />
          <span className="text-sm font-mono text-gray-600">{formatPhone(escalation.callerPhone)}</span>
          {escalation.customerName && (
            <>
              <span className="text-gray-300">•</span>
              <span className="text-sm text-gray-700 font-medium truncate">
                {escalation.customerName}
              </span>
            </>
          )}
          {escalation.customerTier && escalation.customerTier !== 'standard' && (
            <span className={`text-xs px-1.5 py-0.5 rounded ${tierColors[escalation.customerTier]}`}>
              {escalation.customerTier.toUpperCase()}
            </span>
          )}
        </div>

        {/* Reason */}
        <p className="text-sm text-gray-800 line-clamp-2">{escalation.reason}</p>

        {/* Sentiment */}
        <div className="flex items-center gap-2">
          <span className={`text-xs px-2 py-0.5 rounded-full ${sentimentColor.bg} ${sentimentColor.text}`}>
            {escalation.sentiment}
          </span>
        </div>

        {/* Action Button */}
        {isWaiting && (
          <button
            onClick={(e) => {
              e.stopPropagation();
              onAccept(escalation.id);
            }}
            disabled={isAccepting}
            className="w-full py-2 px-4 bg-blue-600 hover:bg-blue-700 disabled:bg-blue-400 text-white font-medium rounded-lg flex items-center justify-center gap-2 transition-colors"
          >
            {isAccepting ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                Accepting...
              </>
            ) : (
              <>
                <PhoneIncoming className="w-4 h-4" />
                Accept This Call
              </>
            )}
          </button>
        )}

        {isAccepted && (
          <div className="w-full py-2 px-4 bg-green-100 text-green-700 font-medium rounded-lg flex items-center justify-center gap-2">
            <CheckCircle className="w-4 h-4" />
            Call Coming...
          </div>
        )}
      </div>
    </div>
  );
}

/**
 * Context Panel Component
 */
function ContextPanel({
  escalation,
  onAccept,
  onResolve,
  isAccepting,
  isResolving,
}: {
  escalation: Escalation;
  onAccept: () => void;
  onResolve: (disposition: string, note?: string) => void;
  isAccepting: boolean;
  isResolving: boolean;
}): React.ReactElement {
  const [resolutionNote, setResolutionNote] = useState('');
  const [showResolveOptions, setShowResolveOptions] = useState(false);

  const isWaiting = escalation.status === 'waiting';
  const isAccepted = escalation.status === 'accepted';
  const tierColor = escalation.customerTier ? tierColors[escalation.customerTier] : '';

  return (
    <div className="h-full flex flex-col">
      {/* Header */}
      <div className="p-4 border-b border-gray-200">
        <h2 className="text-lg font-semibold text-gray-900 flex items-center gap-2">
          <MessageSquare className="w-5 h-5 text-blue-600" />
          Context Panel
        </h2>
        <p className="text-sm text-gray-500 mt-0.5">Read before answering</p>
      </div>

      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {/* Customer Info */}
        <div className="bg-white border border-gray-200 rounded-lg p-4">
          <h3 className="text-sm font-semibold text-gray-700 flex items-center gap-2 mb-3">
            <User className="w-4 h-4" />
            Customer Info
          </h3>
          <div className="space-y-2">
            {escalation.customerName && (
              <div className="flex items-center gap-2">
                <span className="text-gray-600">Name:</span>
                <span className="font-medium">{escalation.customerName}</span>
                {escalation.customerTier && escalation.customerTier !== 'standard' && (
                  <span className={`text-xs px-2 py-0.5 rounded ${tierColor}`}>
                    {escalation.customerTier.toUpperCase()}
                  </span>
                )}
              </div>
            )}
            <div className="flex items-center gap-2">
              <span className="text-gray-600">Phone:</span>
              <span className="font-mono">{formatPhone(escalation.callerPhone)}</span>
            </div>
            {escalation.customerKnownIssues && escalation.customerKnownIssues.length > 0 && (
              <div>
                <span className="text-gray-600 block mb-1">Known Issues:</span>
                <div className="flex flex-wrap gap-1">
                  {escalation.customerKnownIssues.map((issue, idx) => (
                    <span
                      key={idx}
                      className="inline-flex items-center gap-1 px-2 py-0.5 bg-amber-50 text-amber-700 text-xs rounded-full"
                    >
                      <AlertTriangle className="w-3 h-3" />
                      {issue}
                    </span>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>

        {/* AI Handover Brief */}
        <div className="bg-purple-50 border border-purple-200 rounded-lg p-4">
          <h3 className="text-sm font-semibold text-purple-800 flex items-center gap-2 mb-2">
            <Sparkles className="w-4 h-4" />
            AI Handover Brief
          </h3>
          <p className="text-sm text-purple-900 leading-relaxed">{escalation.brief}</p>
        </div>

        {/* Extracted Entities */}
        {Object.keys(escalation.entities).length > 0 && (
          <div className="bg-white border border-gray-200 rounded-lg p-4">
            <h3 className="text-sm font-semibold text-gray-700 flex items-center gap-2 mb-2">
              <Tag className="w-4 h-4" />
              Extracted Info
            </h3>
            <div className="flex flex-wrap gap-2">
              {Object.entries(escalation.entities)
                .filter(([_, value]) => value)
                .map(([key, value]) => (
                  <span
                    key={key}
                    className="inline-flex items-center gap-1 px-2 py-1 bg-gray-100 text-gray-700 text-xs rounded-lg"
                  >
                    <span className="font-medium">{key}:</span>
                    <span>{value}</span>
                  </span>
                ))}
            </div>
          </div>
        )}

        {/* Last 5 Turns Transcript */}
        <div className="bg-white border border-gray-200 rounded-lg p-4">
          <h3 className="text-sm font-semibold text-gray-700 flex items-center gap-2 mb-3">
            <MessageSquare className="w-4 h-4" />
            Recent Conversation ({escalation.lastFiveTurns.length} turns)
          </h3>
          <div className="space-y-2 max-h-64 overflow-y-auto">
            {escalation.lastFiveTurns.map((turn, idx) => (
              <div
                key={idx}
                className={`flex ${turn.role === 'user' ? 'justify-start' : 'justify-end'}`}
              >
                <div
                  className={`max-w-[85%] px-3 py-2 rounded-lg text-sm ${
                    turn.role === 'user'
                      ? 'bg-gray-100 text-gray-800 rounded-bl-none'
                      : 'bg-blue-100 text-blue-800 rounded-br-none'
                  }`}
                >
                  <div className="text-xs font-medium mb-0.5 opacity-70">
                    {turn.role === 'user' ? 'Customer' : 'AI'}
                  </div>
                  <p>{turn.content}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Action Buttons */}
      <div className="p-4 border-t border-gray-200 space-y-2">
        {isWaiting && (
          <button
            onClick={onAccept}
            disabled={isAccepting}
            className="w-full py-3 px-4 bg-green-600 hover:bg-green-700 disabled:bg-green-400 text-white font-semibold rounded-lg flex items-center justify-center gap-2 transition-colors"
          >
            {isAccepting ? (
              <>
                <Loader2 className="w-5 h-5 animate-spin" />
                Accepting...
              </>
            ) : (
              <>
                <PhoneIncoming className="w-5 h-5" />
                Accept and Answer
              </>
            )}
          </button>
        )}

        {isAccepted && !showResolveOptions && (
          <button
            onClick={() => setShowResolveOptions(true)}
            className="w-full py-3 px-4 bg-blue-600 hover:bg-blue-700 text-white font-semibold rounded-lg flex items-center justify-center gap-2 transition-colors"
          >
            <CheckCircle className="w-5 h-5" />
            Resolve Escalation
          </button>
        )}

        {isAccepted && showResolveOptions && (
          <div className="space-y-3">
            <textarea
              placeholder="Add a note (optional)..."
              value={resolutionNote}
              onChange={(e) => setResolutionNote(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm resize-none"
              rows={2}
            />
            <div className="grid grid-cols-2 gap-2">
              <button
                onClick={() => onResolve('resolved', resolutionNote)}
                disabled={isResolving}
                className="py-2 px-3 bg-green-600 hover:bg-green-700 disabled:bg-green-400 text-white text-sm font-medium rounded-lg flex items-center justify-center gap-1"
              >
                <CheckCircle className="w-4 h-4" />
                Resolved
              </button>
              <button
                onClick={() => onResolve('follow_up_needed', resolutionNote)}
                disabled={isResolving}
                className="py-2 px-3 bg-amber-600 hover:bg-amber-700 disabled:bg-amber-400 text-white text-sm font-medium rounded-lg flex items-center justify-center gap-1"
              >
                <Clock className="w-4 h-4" />
                Follow Up
              </button>
              <button
                onClick={() => onResolve('customer_hung_up', resolutionNote)}
                disabled={isResolving}
                className="py-2 px-3 bg-gray-600 hover:bg-gray-700 disabled:bg-gray-400 text-white text-sm font-medium rounded-lg flex items-center justify-center gap-1"
              >
                <XCircle className="w-4 h-4" />
                Hung Up
              </button>
              <button
                onClick={() => onResolve('transferred', resolutionNote)}
                disabled={isResolving}
                className="py-2 px-3 bg-blue-600 hover:bg-blue-700 disabled:bg-blue-400 text-white text-sm font-medium rounded-lg flex items-center justify-center gap-1"
              >
                <ChevronRight className="w-4 h-4" />
                Transferred
              </button>
            </div>
            <button
              onClick={() => setShowResolveOptions(false)}
              className="w-full py-2 text-gray-600 text-sm hover:text-gray-800"
            >
              Cancel
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

/**
 * Escalations Page
 */
export default function Escalations(): React.ReactElement {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [acceptingId, setAcceptingId] = useState<string | null>(null);

  // API hooks
  const {
    data,
    isLoading,
    isFetching,
    refetch,
  } = useGetEscalationsQuery(undefined, {
    pollingInterval: 15000, // Poll every 15 seconds
  });

  const [acceptEscalation] = useAcceptEscalationMutation();
  const [acceptNext] = useAcceptNextEscalationMutation();
  const [resolveEscalation, { isLoading: isResolving }] = useResolveEscalationMutation();

  // Socket for real-time updates
  useEscalationSocket({
    enabled: true,
    onIncoming: () => refetch(),
    onAccepted: () => refetch(),
    onResolved: () => refetch(),
  });

  // Derived data
  const escalations = data?.escalations || [];
  const stats = data?.stats || { waitingCount: 0, acceptedCount: 0, longestHoldSeconds: 0 };
  const selectedEscalation = escalations.find((e) => e.id === selectedId);

  // Auto-select first waiting escalation
  useEffect(() => {
    if (!selectedId && escalations.length > 0) {
      setSelectedId(escalations[0].id);
    }
  }, [escalations, selectedId]);

  // Handle accept
  const handleAccept = useCallback(
    async (id: string) => {
      setAcceptingId(id);
      try {
        await acceptEscalation({ id }).unwrap();
        toast.success('Call accepted! Connecting...');
      } catch (error) {
        toast.error('Failed to accept escalation');
      } finally {
        setAcceptingId(null);
      }
    },
    [acceptEscalation]
  );

  // Handle accept next
  const handleAcceptNext = useCallback(async () => {
    setAcceptingId('next');
    try {
      const result = await acceptNext({}).unwrap();
      if (result.success && result.escalation) {
        setSelectedId(result.escalation.id);
        toast.success('Call accepted! Connecting...');
      } else {
        toast.error(result.message || 'No escalations waiting');
      }
    } catch (error) {
      toast.error('Failed to accept escalation');
    } finally {
      setAcceptingId(null);
    }
  }, [acceptNext]);

  // Handle resolve
  const handleResolve = useCallback(
    async (disposition: string, note?: string) => {
      if (!selectedId) return;
      try {
        await resolveEscalation({
          id: selectedId,
          data: { disposition: disposition as any, note },
        }).unwrap();
        toast.success('Escalation resolved');
        setSelectedId(null);
      } catch (error) {
        toast.error('Failed to resolve escalation');
      }
    },
    [selectedId, resolveEscalation]
  );

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-full">
        <Loader2 className="w-8 h-8 animate-spin text-blue-600" />
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col bg-gray-50">
      {/* Alert Banner */}
      {stats.waitingCount > 0 && (
        <div className="bg-amber-100 border-b border-amber-200 px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <AlertTriangle className="w-5 h-5 text-amber-600 animate-pulse" />
            <span className="font-medium text-amber-800">
              ■ {stats.waitingCount} {stats.waitingCount === 1 ? 'call' : 'calls'} waiting
              {stats.longestHoldSeconds > 0 && (
                <span className="ml-2">
                  — Longest: {formatHoldDuration(stats.longestHoldSeconds)}
                </span>
              )}
            </span>
          </div>
          <button
            onClick={handleAcceptNext}
            disabled={acceptingId === 'next'}
            className="px-4 py-2 bg-amber-600 hover:bg-amber-700 disabled:bg-amber-400 text-white font-medium rounded-lg flex items-center gap-2 transition-colors"
          >
            {acceptingId === 'next' ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <PhoneIncoming className="w-4 h-4" />
            )}
            Accept Next Call
          </button>
        </div>
      )}

      {/* Main Content */}
      <div className="flex-1 flex overflow-hidden">
        {/* Left Panel - Queue (55%) */}
        <div className="w-[55%] border-r border-gray-200 flex flex-col">
          <div className="p-4 border-b border-gray-200 flex items-center justify-between">
            <h1 className="text-xl font-bold text-gray-900">Escalation Queue</h1>
            <button
              onClick={() => refetch()}
              disabled={isFetching}
              className="p-2 text-gray-500 hover:text-gray-700 hover:bg-gray-100 rounded-lg transition-colors"
            >
              <RefreshCw className={`w-5 h-5 ${isFetching ? 'animate-spin' : ''}`} />
            </button>
          </div>

          <div className="flex-1 overflow-y-auto p-4">
            {escalations.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-full text-gray-500">
                <Phone className="w-12 h-12 mb-3 opacity-50" />
                <p className="text-lg font-medium">No active escalations</p>
                <p className="text-sm">New calls will appear here</p>
              </div>
            ) : (
              <div className="space-y-3">
                {escalations.map((escalation) => (
                  <EscalationCard
                    key={escalation.id}
                    escalation={escalation}
                    isSelected={escalation.id === selectedId}
                    onSelect={setSelectedId}
                    onAccept={handleAccept}
                    isAccepting={acceptingId === escalation.id}
                  />
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Right Panel - Context (45%) */}
        <div className="w-[45%] bg-white">
          {selectedEscalation ? (
            <ContextPanel
              escalation={selectedEscalation}
              onAccept={() => handleAccept(selectedEscalation.id)}
              onResolve={handleResolve}
              isAccepting={acceptingId === selectedEscalation.id}
              isResolving={isResolving}
            />
          ) : (
            <div className="h-full flex flex-col items-center justify-center text-gray-400">
              <MessageSquare className="w-12 h-12 mb-3 opacity-50" />
              <p className="text-lg font-medium">Select an escalation</p>
              <p className="text-sm">to view context</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
