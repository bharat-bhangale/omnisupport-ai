import React, { useState, useMemo, useCallback } from 'react';
import {
  Phone,
  PhoneOff,
  ArrowUpRight,
  Clock,
  Filter,
  Search,
  ChevronLeft,
  ChevronRight,
  RefreshCw,
  CheckCircle,
  AlertTriangle,
  X,
  Sparkles,
  Bot,
  User,
  Wrench,
} from 'lucide-react';
import {
  useGetActiveCallsQuery,
  useGetCallHistoryQuery,
  useGetCallTranscriptQuery,
  useEscalateCallMutation,
  type ActiveCall,
  type CallHistoryItem,
  type Turn,
} from '../api/callsApi';
import LiveCallCard from '../components/LiveCallCard';

// ============================================================================
// HELPER COMPONENTS
// ============================================================================

// Sentiment indicator
function SentimentDot({ sentiment }: { sentiment: string }): React.ReactElement {
  const colors: Record<string, string> = {
    positive: 'bg-green-500',
    neutral: 'bg-gray-400',
    negative: 'bg-red-500',
  };
  return (
    <span
      className={`inline-block w-2.5 h-2.5 rounded-full ${colors[sentiment] || colors.neutral}`}
      title={`Sentiment: ${sentiment}`}
    />
  );
}

// QA Score badge (compact)
function QAScoreBadge({ score }: { score?: number }): React.ReactElement | null {
  if (score === undefined || score === null) return null;

  const color =
    score >= 80
      ? 'bg-green-100 text-green-700 border-green-200'
      : score >= 60
        ? 'bg-amber-100 text-amber-700 border-amber-200'
        : 'bg-red-100 text-red-700 border-red-200';

  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded border text-xs font-medium ${color}`}>
      QA: {score}
    </span>
  );
}

// Call status badge
function StatusBadge({ status }: { status: string }): React.ReactElement {
  const configs: Record<string, { bg: string; text: string; icon: React.ReactNode }> = {
    active: {
      bg: 'bg-blue-100',
      text: 'text-blue-700',
      icon: <Phone className="w-3 h-3" />,
    },
    completed: {
      bg: 'bg-green-100',
      text: 'text-green-700',
      icon: <CheckCircle className="w-3 h-3" />,
    },
    escalated: {
      bg: 'bg-amber-100',
      text: 'text-amber-700',
      icon: <ArrowUpRight className="w-3 h-3" />,
    },
    failed: {
      bg: 'bg-red-100',
      text: 'text-red-700',
      icon: <AlertTriangle className="w-3 h-3" />,
    },
  };

  const config = configs[status] || configs.completed;

  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-medium ${config.bg} ${config.text}`}>
      {config.icon}
      {status.charAt(0).toUpperCase() + status.slice(1)}
    </span>
  );
}

// Format duration MM:SS or HH:MM:SS
function formatDuration(seconds: number): string {
  const hrs = Math.floor(seconds / 3600);
  const mins = Math.floor((seconds % 3600) / 60);
  const secs = seconds % 60;

  if (hrs > 0) {
    return `${hrs}:${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
  }
  return `${mins}:${String(secs).padStart(2, '0')}`;
}

// Format relative time
function formatRelativeTime(date: string): string {
  const now = Date.now();
  const then = new Date(date).getTime();
  const diff = Math.floor((now - then) / 1000);

  if (diff < 60) return `${diff}s ago`;
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  return `${Math.floor(diff / 86400)}d ago`;
}

// ============================================================================
// TRANSCRIPT DRAWER
// ============================================================================

interface TranscriptDrawerProps {
  callId: string;
  onClose: () => void;
  onEscalate: () => void;
}

function TranscriptDrawer({ callId, onClose, onEscalate }: TranscriptDrawerProps) {
  const { data, isLoading } = useGetCallTranscriptQuery(callId);

  const call = data?.call;
  const turns = data?.turns || [];

  return (
    <div className="fixed inset-y-0 right-0 w-[400px] bg-white shadow-2xl z-50 flex flex-col">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-gray-200 bg-gray-50">
        <div className="flex items-center gap-3">
          <div className="p-2 bg-teal-100 rounded-full">
            <Phone className="h-4 w-4 text-teal-600" />
          </div>
          <div>
            <h3 className="font-semibold text-gray-900">{call?.callerPhone || 'Loading...'}</h3>
            <p className="text-xs text-gray-500">
              {call?.language?.toUpperCase()} • {call ? formatDuration(call.duration) : '--:--'}
            </p>
          </div>
        </div>
        <button
          onClick={onClose}
          className="p-2 hover:bg-gray-200 rounded-lg transition-colors"
        >
          <X className="h-5 w-5 text-gray-500" />
        </button>
      </div>

      {/* Call Info */}
      {call && (
        <div className="px-4 py-3 border-b border-gray-200 bg-gray-50/50">
          <div className="flex items-center gap-4 text-sm">
            <StatusBadge status={call.status} />
            {call.intent && (
              <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-purple-100 text-purple-700 rounded text-xs">
                <Sparkles className="h-3 w-3" />
                {call.intent}
              </span>
            )}
            {call.qaScore !== undefined && <QAScoreBadge score={call.qaScore} />}
          </div>
        </div>
      )}

      {/* Transcript */}
      <div className="flex-1 overflow-y-auto p-4 space-y-3">
        {isLoading ? (
          <div className="text-center py-8">
            <div className="animate-spin w-8 h-8 border-2 border-teal-500 border-t-transparent rounded-full mx-auto mb-4" />
            <p className="text-gray-500">Loading transcript...</p>
          </div>
        ) : turns.length === 0 ? (
          <div className="text-center py-8">
            <Phone className="h-12 w-12 text-gray-300 mx-auto mb-4" />
            <p className="text-gray-500">No conversation yet</p>
          </div>
        ) : (
          turns.map((turn, idx) => (
            <TurnBubble key={idx} turn={turn} />
          ))
        )}
      </div>

      {/* Footer Actions */}
      {call?.status === 'active' && (
        <div className="px-4 py-3 border-t border-gray-200 bg-gray-50">
          <button
            onClick={onEscalate}
            className="w-full inline-flex items-center justify-center gap-2 px-4 py-3 bg-amber-500 text-white font-medium rounded-lg hover:bg-amber-600 transition-colors"
          >
            <ArrowUpRight className="h-5 w-5" />
            Override to Human
          </button>
        </div>
      )}
    </div>
  );
}

// Turn bubble component
function TurnBubble({ turn }: { turn: Turn }) {
  const isUser = turn.role === 'user';
  const isAssistant = turn.role === 'assistant';
  const isTool = turn.role === 'tool';

  if (isTool) {
    return (
      <div className="flex justify-center">
        <div className="inline-flex items-center gap-2 px-3 py-1 bg-gray-100 text-gray-600 text-xs rounded-full">
          <Wrench className="h-3 w-3" />
          {turn.toolName || 'Tool'}: {turn.content.slice(0, 50)}...
        </div>
      </div>
    );
  }

  return (
    <div className={`flex ${isUser ? 'justify-start' : 'justify-end'}`}>
      <div
        className={`max-w-[85%] rounded-2xl px-4 py-2 ${
          isUser
            ? 'bg-gray-100 text-gray-900 rounded-bl-sm'
            : 'bg-teal-500 text-white rounded-br-sm'
        }`}
      >
        <div className="flex items-center gap-2 mb-1">
          {isUser ? (
            <User className="h-3 w-3 opacity-60" />
          ) : (
            <Bot className="h-3 w-3 opacity-60" />
          )}
          <span className="text-xs opacity-60">
            {isUser ? 'Customer' : 'AI'}
          </span>
        </div>
        <p className="text-sm">{turn.content}</p>
        {turn.toolName && (
          <div className="mt-1 inline-flex items-center gap-1 px-2 py-0.5 bg-white/20 rounded text-xs">
            <Wrench className="h-3 w-3" />
            {turn.toolName}
          </div>
        )}
      </div>
    </div>
  );
}

// ============================================================================
// ESCALATION MODAL
// ============================================================================

interface EscalationModalProps {
  callId: string;
  onClose: () => void;
  onSuccess: () => void;
}

function EscalationModal({ callId, onClose, onSuccess }: EscalationModalProps) {
  const [reason, setReason] = useState('');
  const [priority, setPriority] = useState<'low' | 'medium' | 'high' | 'urgent'>('medium');
  const [escalate, { isLoading }] = useEscalateCallMutation();

  const handleEscalate = async () => {
    try {
      await escalate({ callId, reason, priority }).unwrap();
      onSuccess();
    } catch (error) {
      console.error('Escalation failed:', error);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-md p-6">
        <h3 className="text-lg font-semibold text-gray-900 mb-4">Escalate Call</h3>
        
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Reason for escalation
            </label>
            <textarea
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="Describe why this call needs human intervention..."
              className="w-full px-3 py-2 border border-gray-300 rounded-lg resize-none focus:ring-2 focus:ring-amber-500 focus:border-amber-500"
              rows={3}
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Priority
            </label>
            <div className="flex gap-2">
              {(['low', 'medium', 'high', 'urgent'] as const).map((p) => (
                <button
                  key={p}
                  onClick={() => setPriority(p)}
                  className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                    priority === p
                      ? p === 'urgent'
                        ? 'bg-red-500 text-white'
                        : p === 'high'
                          ? 'bg-amber-500 text-white'
                          : p === 'medium'
                            ? 'bg-blue-500 text-white'
                            : 'bg-gray-500 text-white'
                      : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                  }`}
                >
                  {p.charAt(0).toUpperCase() + p.slice(1)}
                </button>
              ))}
            </div>
          </div>
        </div>

        <div className="flex gap-3 mt-6">
          <button
            onClick={onClose}
            className="flex-1 px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50"
          >
            Cancel
          </button>
          <button
            onClick={handleEscalate}
            disabled={!reason.trim() || isLoading}
            className="flex-1 px-4 py-2 bg-amber-500 text-white rounded-lg hover:bg-amber-600 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {isLoading ? 'Escalating...' : 'Escalate Now'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ============================================================================
// CALL HISTORY ROW
// ============================================================================

function CallHistoryRow({ 
  call, 
  onViewTranscript 
}: { 
  call: CallHistoryItem;
  onViewTranscript: (callId: string) => void;
}): React.ReactElement {
  return (
    <tr className="hover:bg-gray-50 transition-colors cursor-pointer" onClick={() => onViewTranscript(call.callId)}>
      <td className="px-4 py-3">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-full bg-gray-100 flex items-center justify-center">
            {call.status === 'completed' ? (
              <PhoneOff className="w-4 h-4 text-gray-500" />
            ) : call.status === 'escalated' ? (
              <ArrowUpRight className="w-4 h-4 text-amber-500" />
            ) : (
              <Phone className="w-4 h-4 text-blue-500" />
            )}
          </div>
          <div>
            <span className="font-mono text-sm text-gray-700">{call.callerPhone}</span>
            <p className="text-xs text-gray-400">{formatRelativeTime(call.startedAt)}</p>
          </div>
        </div>
      </td>
      <td className="px-4 py-3">
        <span className="text-sm text-gray-600">{call.intent || '—'}</span>
      </td>
      <td className="px-4 py-3">
        <StatusBadge status={call.status} />
      </td>
      <td className="px-4 py-3">
        <div className="flex items-center gap-1.5">
          <Clock className="w-3.5 h-3.5 text-gray-400" />
          <span className="text-sm text-gray-600">{formatDuration(call.duration)}</span>
        </div>
      </td>
      <td className="px-4 py-3">
        <SentimentDot sentiment={call.sentiment || 'neutral'} />
      </td>
      <td className="px-4 py-3">
        <QAScoreBadge score={call.qaScore} />
      </td>
    </tr>
  );
}

// ============================================================================
// FILTER CHIPS
// ============================================================================

type FilterType = 'all' | 'ai_handling' | 'escalated' | 'high_risk';

interface FilterChipProps {
  label: string;
  active: boolean;
  count?: number;
  onClick: () => void;
}

function FilterChip({ label, active, count, onClick }: FilterChipProps) {
  return (
    <button
      onClick={onClick}
      className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-sm font-medium transition-colors ${
        active
          ? 'bg-teal-500 text-white'
          : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
      }`}
    >
      {label}
      {count !== undefined && (
        <span className={`px-1.5 py-0.5 rounded-full text-xs ${active ? 'bg-white/20' : 'bg-gray-200'}`}>
          {count}
        </span>
      )}
    </button>
  );
}

// ============================================================================
// MAIN COMPONENT
// ============================================================================

export function CallMonitor(): React.ReactElement {
  const [activeFilter, setActiveFilter] = useState<FilterType>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [page, setPage] = useState(1);
  const [selectedCallId, setSelectedCallId] = useState<string | null>(null);
  const [escalatingCallId, setEscalatingCallId] = useState<string | null>(null);

  // Fetch active calls (poll every 5s)
  const { data: activeCallsData, refetch: refetchActive } = useGetActiveCallsQuery(undefined, {
    pollingInterval: 5000,
  });

  // Fetch call history
  const { data: historyData, isLoading: loadingHistory, refetch: refetchHistory } = useGetCallHistoryQuery({
    page,
    limit: 20,
    status: activeFilter === 'escalated' ? 'escalated' : 'all',
  });

  const activeCalls = activeCallsData?.calls || [];
  const historyCalls = historyData?.calls || [];
  const pagination = historyData?.pagination;

  // Filter active calls based on filter type
  const filteredActiveCalls = useMemo(() => {
    switch (activeFilter) {
      case 'ai_handling':
        return activeCalls.filter((c) => c.status === 'active' && c.confidence >= 0.6);
      case 'escalated':
        return activeCalls.filter((c) => c.status === 'escalated');
      case 'high_risk':
        return activeCalls.filter((c) => c.sentimentScore < 0.4 || c.confidence < 0.6);
      default:
        return activeCalls;
    }
  }, [activeCalls, activeFilter]);

  // Counts for filter chips
  const counts = useMemo(() => ({
    all: activeCalls.length,
    ai_handling: activeCalls.filter((c) => c.status === 'active' && c.confidence >= 0.6).length,
    escalated: activeCalls.filter((c) => c.status === 'escalated').length,
    high_risk: activeCalls.filter((c) => c.sentimentScore < 0.4 || c.confidence < 0.6).length,
  }), [activeCalls]);

  const handleRefresh = useCallback(() => {
    refetchActive();
    refetchHistory();
  }, [refetchActive, refetchHistory]);

  const handleViewTranscript = useCallback((callId: string) => {
    setSelectedCallId(callId);
  }, []);

  const handleEscalate = useCallback((callId: string) => {
    setEscalatingCallId(callId);
  }, []);

  const handleEscalationSuccess = useCallback(() => {
    setEscalatingCallId(null);
    setSelectedCallId(null);
    refetchActive();
  }, [refetchActive]);

  return (
    <div className="min-h-screen bg-gray-50 p-6">
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-3">
              <Phone className="h-7 w-7 text-teal-600" />
              Live Call Monitor
              {activeCalls.length > 0 && (
                <span className="inline-flex items-center px-3 py-1 bg-teal-100 text-teal-700 text-sm font-medium rounded-full">
                  {activeCalls.length} Active
                </span>
              )}
            </h1>
            <p className="text-gray-500 mt-1">
              Monitor active calls and view call history
            </p>
          </div>
          <button
            onClick={handleRefresh}
            className="inline-flex items-center gap-2 px-4 py-2 bg-white border border-gray-200 rounded-lg text-gray-700 hover:bg-gray-50"
          >
            <RefreshCw className="w-4 h-4" />
            Refresh
          </button>
        </div>

        {/* Filter Chips */}
        <div className="flex gap-2 mb-6">
          <FilterChip
            label="All Calls"
            active={activeFilter === 'all'}
            count={counts.all}
            onClick={() => setActiveFilter('all')}
          />
          <FilterChip
            label="AI Handling"
            active={activeFilter === 'ai_handling'}
            count={counts.ai_handling}
            onClick={() => setActiveFilter('ai_handling')}
          />
          <FilterChip
            label="Escalated"
            active={activeFilter === 'escalated'}
            count={counts.escalated}
            onClick={() => setActiveFilter('escalated')}
          />
          <FilterChip
            label="High Risk"
            active={activeFilter === 'high_risk'}
            count={counts.high_risk}
            onClick={() => setActiveFilter('high_risk')}
          />
        </div>

        {/* Active Calls Grid */}
        {filteredActiveCalls.length > 0 && (
          <div className="mb-8">
            <div className="flex items-center gap-2 mb-4">
              <div className="w-2.5 h-2.5 rounded-full bg-teal-500 animate-pulse" />
              <h2 className="text-lg font-semibold text-gray-800">Active Calls</h2>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {filteredActiveCalls.map((call) => (
                <LiveCallCard
                  key={call.callId}
                  call={call}
                  onViewTranscript={handleViewTranscript}
                  onEscalate={handleEscalate}
                />
              ))}
            </div>
          </div>
        )}

        {/* No active calls message */}
        {filteredActiveCalls.length === 0 && activeFilter !== 'all' && (
          <div className="mb-8 bg-white rounded-xl border border-gray-200 p-8 text-center">
            <Phone className="h-12 w-12 text-gray-300 mx-auto mb-4" />
            <p className="text-gray-500">No calls matching this filter</p>
          </div>
        )}

        {/* Call History */}
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm">
          <div className="p-4 border-b border-gray-200">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-semibold text-gray-800">Call History</h2>
              <div className="relative w-64">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                <input
                  type="text"
                  placeholder="Search calls..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full pl-9 pr-4 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-teal-500"
                />
              </div>
            </div>
          </div>

          <div className="overflow-x-auto">
            {loadingHistory ? (
              <div className="p-12 text-center">
                <div className="animate-spin w-8 h-8 border-2 border-teal-500 border-t-transparent rounded-full mx-auto mb-4" />
                <p className="text-gray-500">Loading call history...</p>
              </div>
            ) : historyCalls.length === 0 ? (
              <div className="p-12 text-center">
                <PhoneOff className="w-12 h-12 text-gray-300 mx-auto mb-4" />
                <p className="text-gray-500">No call history yet</p>
              </div>
            ) : (
              <table className="w-full">
                <thead className="bg-gray-50 border-b border-gray-200">
                  <tr>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Caller</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Intent</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Status</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Duration</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Sentiment</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">QA</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {historyCalls.map((call) => (
                    <CallHistoryRow 
                      key={call.id} 
                      call={call} 
                      onViewTranscript={handleViewTranscript}
                    />
                  ))}
                </tbody>
              </table>
            )}
          </div>

          {/* Pagination */}
          {pagination && pagination.totalPages > 1 && (
            <div className="px-4 py-3 border-t border-gray-200 flex items-center justify-between">
              <p className="text-sm text-gray-500">
                Page {page} of {pagination.totalPages} ({pagination.total} calls)
              </p>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                  disabled={page === 1}
                  className="p-2 border border-gray-200 rounded-lg hover:bg-gray-50 disabled:opacity-50"
                >
                  <ChevronLeft className="w-4 h-4" />
                </button>
                <button
                  onClick={() => setPage((p) => Math.min(pagination.totalPages, p + 1))}
                  disabled={page === pagination.totalPages}
                  className="p-2 border border-gray-200 rounded-lg hover:bg-gray-50 disabled:opacity-50"
                >
                  <ChevronRight className="w-4 h-4" />
                </button>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Transcript Drawer */}
      {selectedCallId && (
        <TranscriptDrawer
          callId={selectedCallId}
          onClose={() => setSelectedCallId(null)}
          onEscalate={() => {
            setEscalatingCallId(selectedCallId);
          }}
        />
      )}

      {/* Escalation Modal */}
      {escalatingCallId && (
        <EscalationModal
          callId={escalatingCallId}
          onClose={() => setEscalatingCallId(null)}
          onSuccess={handleEscalationSuccess}
        />
      )}
    </div>
  );
}

export default CallMonitor;
