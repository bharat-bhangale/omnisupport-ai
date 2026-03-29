import React, { useState, useMemo } from 'react';
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
} from 'lucide-react';
import {
  useGetActiveCallsQuery,
  useGetCallHistoryQuery,
  type CallHistoryItem,
} from '../api/analyticsApi';

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

// Active call card
function ActiveCallCard({ call }: { call: { id: string; phone: string; intent: string; sentiment: string; confidence: number; duration: number } }): React.ReactElement {
  return (
    <div className="bg-white border border-blue-200 rounded-lg p-4 shadow-sm">
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-full bg-blue-100 flex items-center justify-center">
            <Phone className="w-4 h-4 text-blue-600 animate-pulse" />
          </div>
          <span className="font-mono text-sm text-gray-700">{call.phone}</span>
        </div>
        <span className="text-sm font-medium text-blue-600">{formatDuration(call.duration)}</span>
      </div>

      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="text-xs bg-gray-100 text-gray-600 px-2 py-0.5 rounded">{call.intent}</span>
          <SentimentDot sentiment={call.sentiment} />
        </div>
        <div className="flex items-center gap-1">
          <div className="w-16 h-1.5 bg-gray-200 rounded-full overflow-hidden">
            <div
              className="h-full bg-blue-500 rounded-full"
              style={{ width: `${call.confidence * 100}%` }}
            />
          </div>
          <span className="text-xs text-gray-500">{Math.round(call.confidence * 100)}%</span>
        </div>
      </div>
    </div>
  );
}

// Call history row
function CallHistoryRow({ call }: { call: CallHistoryItem }): React.ReactElement {
  return (
    <tr className="hover:bg-gray-50 transition-colors">
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
            <span className="font-mono text-sm text-gray-700">{call.phone}</span>
            <p className="text-xs text-gray-400">{formatRelativeTime(call.startedAt)}</p>
          </div>
        </div>
      </td>
      <td className="px-4 py-3">
        <span className="text-sm text-gray-600">{call.intent}</span>
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
        <SentimentDot sentiment={call.sentiment} />
      </td>
      <td className="px-4 py-3">
        <QAScoreBadge score={call.qaScore} />
      </td>
      <td className="px-4 py-3">
        {call.resolution ? (
          <span className="text-xs text-gray-500">{call.resolution}</span>
        ) : (
          <span className="text-xs text-gray-300">—</span>
        )}
      </td>
    </tr>
  );
}

export function CallMonitor(): React.ReactElement {
  const [statusFilter, setStatusFilter] = useState<string>('');
  const [searchQuery, setSearchQuery] = useState('');
  const [page, setPage] = useState(1);
  const [daysBack, setDaysBack] = useState(7);

  // Fetch active calls (poll every 10s)
  const { data: activeCallsData, isLoading: loadingActive, refetch: refetchActive } = useGetActiveCallsQuery(undefined, {
    pollingInterval: 10000,
  });

  // Fetch call history
  const { data: historyData, isLoading: loadingHistory, refetch: refetchHistory } = useGetCallHistoryQuery({
    page,
    limit: 20,
    status: statusFilter || undefined,
    days: daysBack,
  });

  const activeCalls = activeCallsData?.calls || [];
  const historyCalls = historyData?.calls || [];
  const pagination = historyData?.pagination;

  // Filter history by search
  const filteredHistory = useMemo(() => {
    if (!searchQuery.trim()) return historyCalls;
    const q = searchQuery.toLowerCase();
    return historyCalls.filter(
      (c) =>
        c.phone.toLowerCase().includes(q) ||
        c.intent.toLowerCase().includes(q) ||
        c.resolution?.toLowerCase().includes(q)
    );
  }, [historyCalls, searchQuery]);

  const handleRefresh = () => {
    refetchActive();
    refetchHistory();
  };

  return (
    <div className="min-h-screen bg-gray-50 p-6">
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Call Monitor</h1>
            <p className="text-gray-500 mt-1">
              {activeCalls.length} active • {pagination?.total || 0} total calls (last {daysBack} days)
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

        {/* Active Calls Section */}
        {activeCalls.length > 0 && (
          <div className="mb-8">
            <div className="flex items-center gap-2 mb-4">
              <div className="w-2.5 h-2.5 rounded-full bg-blue-500 animate-pulse" />
              <h2 className="text-lg font-semibold text-gray-800">Active Calls</h2>
              <span className="text-sm text-gray-500">({activeCalls.length})</span>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
              {activeCalls.map((call) => (
                <ActiveCallCard key={call.id} call={call} />
              ))}
            </div>
          </div>
        )}

        {/* Call History Section */}
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm">
          {/* Filters */}
          <div className="p-4 border-b border-gray-200">
            <div className="flex flex-wrap items-center gap-4">
              {/* Search */}
              <div className="relative flex-1 min-w-[200px] max-w-md">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                <input
                  type="text"
                  placeholder="Search by phone, intent, resolution..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full pl-9 pr-4 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>

              {/* Status filter */}
              <div className="flex items-center gap-2">
                <Filter className="w-4 h-4 text-gray-400" />
                <select
                  value={statusFilter}
                  onChange={(e) => {
                    setStatusFilter(e.target.value);
                    setPage(1);
                  }}
                  className="px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  <option value="">All Statuses</option>
                  <option value="completed">Completed</option>
                  <option value="escalated">Escalated</option>
                  <option value="active">Active</option>
                </select>
              </div>

              {/* Days filter */}
              <select
                value={daysBack}
                onChange={(e) => {
                  setDaysBack(Number(e.target.value));
                  setPage(1);
                }}
                className="px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value={1}>Last 24 hours</option>
                <option value={7}>Last 7 days</option>
                <option value={30}>Last 30 days</option>
                <option value={90}>Last 90 days</option>
              </select>
            </div>
          </div>

          {/* Table */}
          <div className="overflow-x-auto">
            {loadingHistory ? (
              <div className="p-12 text-center">
                <div className="animate-spin w-8 h-8 border-2 border-blue-500 border-t-transparent rounded-full mx-auto mb-4" />
                <p className="text-gray-500">Loading call history...</p>
              </div>
            ) : filteredHistory.length === 0 ? (
              <div className="p-12 text-center">
                <PhoneOff className="w-12 h-12 text-gray-300 mx-auto mb-4" />
                <p className="text-gray-500">No calls found</p>
              </div>
            ) : (
              <table className="w-full">
                <thead className="bg-gray-50 border-b border-gray-200">
                  <tr>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Caller
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Intent
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Status
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Duration
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Sentiment
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      QA Score
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Resolution
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {filteredHistory.map((call) => (
                    <CallHistoryRow key={call.id} call={call} />
                  ))}
                </tbody>
              </table>
            )}
          </div>

          {/* Pagination */}
          {pagination && pagination.pages > 1 && (
            <div className="px-4 py-3 border-t border-gray-200 flex items-center justify-between">
              <p className="text-sm text-gray-500">
                Showing {(page - 1) * pagination.limit + 1} to{' '}
                {Math.min(page * pagination.limit, pagination.total)} of {pagination.total} calls
              </p>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                  disabled={page === 1}
                  className="p-2 border border-gray-200 rounded-lg hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  <ChevronLeft className="w-4 h-4" />
                </button>
                <span className="text-sm text-gray-600">
                  Page {page} of {pagination.pages}
                </span>
                <button
                  onClick={() => setPage((p) => Math.min(pagination.pages, p + 1))}
                  disabled={page === pagination.pages}
                  className="p-2 border border-gray-200 rounded-lg hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  <ChevronRight className="w-4 h-4" />
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export default CallMonitor;
