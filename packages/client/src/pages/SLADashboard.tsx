import React, { useState, useCallback, useMemo } from 'react';
import {
  Clock,
  AlertTriangle,
  CheckCircle,
  TrendingUp,
  TrendingDown,
  ExternalLink,
  BarChart3,
  History,
  AlertCircle,
  Filter,
  X,
  Eye,
  Loader2,
  RefreshCw,
  UserPlus,
} from 'lucide-react';
import {
  LineChart,
  Line,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
  Cell,
} from 'recharts';
import toast from 'react-hot-toast';
import {
  useGetSLAComplianceQuery,
  useGetAtRiskTicketsQuery,
  useGetSLAHistoryQuery,
  useGetSLABreachesQuery,
  useReviewBreachMutation,
  useGetSLASummaryQuery,
  type SLABreach,
  type AtRiskTicket,
} from '../api/slaApi';
import { SLAComplianceTable } from '../components/SLAComplianceTable';
import { SLAComplianceGauge } from '../components/SLAComplianceGauge';
import { SLACountdown } from '../components/SLACountdown';

type TabType = 'overview' | 'breaches' | 'atrisk';

// Priority colors for charts
const priorityColors = {
  P1: '#DC2626',
  P2: '#F97316',
  P3: '#F59E0B',
  P4: '#6B7280',
};

// Status badge helper
function getStatusBadge(rate: number): { text: string; color: string } {
  if (rate >= 95) return { text: 'Excellent', color: 'bg-green-100 text-green-700' };
  if (rate >= 90) return { text: 'Good', color: 'bg-amber-100 text-amber-700' };
  return { text: 'At Risk', color: 'bg-red-100 text-red-700' };
}

export function SLADashboard(): React.ReactElement {
  const [activeTab, setActiveTab] = useState<TabType>('overview');
  const [days, setDays] = useState(30);

  // Tabs config
  const tabs: { id: TabType; label: string; icon: React.ReactNode }[] = [
    { id: 'overview', label: 'Overview', icon: <BarChart3 className="h-4 w-4" /> },
    { id: 'breaches', label: 'Breach History', icon: <History className="h-4 w-4" /> },
    { id: 'atrisk', label: 'At-Risk Tickets', icon: <AlertCircle className="h-4 w-4" /> },
  ];

  return (
    <div className="min-h-screen bg-gray-50 p-6">
      <div className="max-w-7xl mx-auto space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-3">
              <Clock className="h-7 w-7 text-indigo-600" />
              SLA Dashboard
            </h1>
            <p className="text-gray-500 mt-1">
              Monitor service level agreement compliance and response times
            </p>
          </div>
          <select
            value={days}
            onChange={(e) => setDays(parseInt(e.target.value))}
            className="px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
          >
            <option value={7}>Last 7 days</option>
            <option value={30}>Last 30 days</option>
            <option value={90}>Last 90 days</option>
          </select>
        </div>

        {/* Tab Navigation */}
        <div className="flex gap-1 bg-gray-100 p-1 rounded-lg w-fit">
          {tabs.map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`flex items-center gap-2 px-4 py-2 rounded-md text-sm font-medium transition-colors ${
                activeTab === tab.id
                  ? 'bg-white text-indigo-600 shadow-sm'
                  : 'text-gray-600 hover:text-gray-900'
              }`}
            >
              {tab.icon}
              {tab.label}
            </button>
          ))}
        </div>

        {/* Tab Content */}
        {activeTab === 'overview' && <OverviewTab days={days} />}
        {activeTab === 'breaches' && <BreachHistoryTab />}
        {activeTab === 'atrisk' && <AtRiskTab />}
      </div>
    </div>
  );
}

// ============ TAB 1: OVERVIEW ============
function OverviewTab({ days }: { days: number }) {
  const { data: complianceData, isLoading: isLoadingCompliance } = useGetSLAComplianceQuery({ days });
  const { data: historyData, isLoading: isLoadingHistory } = useGetSLAHistoryQuery({ days });
  const { data: summaryData } = useGetSLASummaryQuery();

  const compliance = complianceData?.compliance;
  const trend = complianceData?.trend;
  const history = historyData?.history || [];

  // Calculate overall compliance
  const overallRate = trend?.overallRate || 0;
  const trendVsLast = trend?.trendVsLastPeriod || 0;

  // Priority compliance data for table
  const priorityData = trend?.byPriority || [];

  // Top breach categories
  const topCategories = trend?.topBreachCategories || [];

  return (
    <>
      {/* Top Section: Gauge + Summary */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Compliance Gauge */}
        <div className="bg-white rounded-xl border border-gray-200 p-6 flex items-center justify-center">
          {isLoadingCompliance ? (
            <Loader2 className="h-8 w-8 text-indigo-500 animate-spin" />
          ) : (
            <SLAComplianceGauge
              rate={overallRate}
              trend={trendVsLast}
              trendPositive={trendVsLast >= 0}
            />
          )}
        </div>

        {/* Compliance by Priority Table */}
        <div className="lg:col-span-2 bg-white rounded-xl border border-gray-200">
          <div className="px-4 py-3 border-b border-gray-200">
            <h3 className="font-semibold text-gray-900">Compliance by Priority</h3>
            <p className="text-xs text-gray-500">Last {days} days</p>
          </div>
          <div className="p-4">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-gray-500">
                  <th className="pb-3 font-medium">Priority</th>
                  <th className="pb-3 font-medium text-right">Total</th>
                  <th className="pb-3 font-medium text-right">On Time</th>
                  <th className="pb-3 font-medium text-right">Breached</th>
                  <th className="pb-3 font-medium text-right">Rate</th>
                  <th className="pb-3 font-medium text-right">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {priorityData.map((row) => {
                  const status = getStatusBadge(row.rate);
                  return (
                    <tr key={row.priority}>
                      <td className="py-3">
                        <span
                          className={`inline-flex px-2 py-0.5 rounded text-xs font-bold ${
                            row.priority === 'P1'
                              ? 'bg-red-100 text-red-700'
                              : row.priority === 'P2'
                                ? 'bg-orange-100 text-orange-700'
                                : row.priority === 'P3'
                                  ? 'bg-amber-100 text-amber-700'
                                  : 'bg-gray-100 text-gray-700'
                          }`}
                        >
                          {row.priority}
                        </span>
                      </td>
                      <td className="py-3 text-right text-gray-900">{row.total}</td>
                      <td className="py-3 text-right text-green-600">{row.onTime}</td>
                      <td className="py-3 text-right text-red-600">{row.breached}</td>
                      <td className="py-3 text-right font-medium">{row.rate.toFixed(1)}%</td>
                      <td className="py-3 text-right">
                        <span className={`inline-flex px-2 py-0.5 rounded text-xs font-medium ${status.color}`}>
                          {status.text}
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {/* Charts Row */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Breach Trend Chart */}
        <div className="lg:col-span-2 bg-white rounded-xl border border-gray-200">
          <div className="px-4 py-3 border-b border-gray-200">
            <h3 className="font-semibold text-gray-900">Breach Trend</h3>
            <p className="text-xs text-gray-500">Daily breaches over {days} days</p>
          </div>
          <div className="p-4">
            {isLoadingHistory ? (
              <div className="flex items-center justify-center h-64">
                <Loader2 className="h-6 w-6 text-indigo-500 animate-spin" />
              </div>
            ) : (
              <div className="h-64">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={history}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                    <XAxis
                      dataKey="date"
                      tick={{ fontSize: 11 }}
                      tickFormatter={(v) => v.split('-').slice(1).join('/')}
                    />
                    <YAxis tick={{ fontSize: 11 }} />
                    <Tooltip
                      contentStyle={{
                        backgroundColor: '#fff',
                        border: '1px solid #e5e7eb',
                        borderRadius: '8px',
                        fontSize: '12px',
                      }}
                    />
                    <Legend />
                    <Line type="monotone" dataKey="P1" name="P1" stroke={priorityColors.P1} strokeWidth={2} dot={false} />
                    <Line type="monotone" dataKey="P2" name="P2" stroke={priorityColors.P2} strokeWidth={2} dot={false} />
                    <Line type="monotone" dataKey="P3" name="P3" stroke={priorityColors.P3} strokeWidth={2} dot={false} />
                    <Line type="monotone" dataKey="P4" name="P4" stroke={priorityColors.P4} strokeWidth={2} dot={false} />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            )}
          </div>
        </div>

        {/* Top Breach Categories */}
        <div className="bg-white rounded-xl border border-gray-200">
          <div className="px-4 py-3 border-b border-gray-200">
            <h3 className="font-semibold text-gray-900">Top Breach Categories</h3>
            <p className="text-xs text-gray-500">Most common breach reasons</p>
          </div>
          <div className="p-4">
            <div className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={topCategories} layout="vertical">
                  <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                  <XAxis type="number" tick={{ fontSize: 11 }} />
                  <YAxis dataKey="category" type="category" tick={{ fontSize: 11 }} width={100} />
                  <Tooltip />
                  <Bar dataKey="count" radius={[0, 4, 4, 0]}>
                    {topCategories.map((_, index) => (
                      <Cell key={`cell-${index}`} fill={index === 0 ? '#DC2626' : '#F59E0B'} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}

// ============ TAB 2: BREACH HISTORY ============
function BreachHistoryTab() {
  const [priority, setPriority] = useState<'P1' | 'P2' | 'P3' | 'P4' | undefined>();
  const [category, setCategory] = useState<string>('');
  const [page, setPage] = useState(1);
  const [selectedBreach, setSelectedBreach] = useState<SLABreach | null>(null);

  const { data: breachesData, isLoading, refetch } = useGetSLABreachesQuery({
    priority,
    category: category || undefined,
    page,
    limit: 15,
  });

  const breaches = breachesData?.breaches || [];
  const pagination = breachesData?.pagination;

  return (
    <>
      {/* Filters */}
      <div className="bg-white rounded-xl border border-gray-200 p-4 flex flex-wrap items-center gap-4">
        <Filter className="h-5 w-5 text-gray-400" />

        <select
          value={priority || ''}
          onChange={(e) => {
            setPriority((e.target.value as 'P1' | 'P2' | 'P3' | 'P4') || undefined);
            setPage(1);
          }}
          className="px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
        >
          <option value="">All Priorities</option>
          <option value="P1">P1 - Urgent</option>
          <option value="P2">P2 - High</option>
          <option value="P3">P3 - Normal</option>
          <option value="P4">P4 - Low</option>
        </select>

        <input
          type="text"
          placeholder="Category..."
          value={category}
          onChange={(e) => {
            setCategory(e.target.value);
            setPage(1);
          }}
          className="px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 w-40"
        />

        <button
          onClick={() => refetch()}
          className="flex items-center gap-2 px-3 py-2 text-gray-600 hover:text-gray-900"
        >
          <RefreshCw className="h-4 w-4" />
          Refresh
        </button>
      </div>

      {/* Table */}
      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-gray-500 bg-gray-50 border-b border-gray-200">
                <th className="px-4 py-3 font-medium">Date</th>
                <th className="px-4 py-3 font-medium">Subject</th>
                <th className="px-4 py-3 font-medium">Priority</th>
                <th className="px-4 py-3 font-medium">Category</th>
                <th className="px-4 py-3 font-medium">Overdue</th>
                <th className="px-4 py-3 font-medium">Assigned</th>
                <th className="px-4 py-3 font-medium">Resolved</th>
                <th className="px-4 py-3 font-medium">Root Cause</th>
                <th className="px-4 py-3 font-medium">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {isLoading ? (
                <tr>
                  <td colSpan={9} className="px-4 py-12 text-center">
                    <Loader2 className="h-6 w-6 text-indigo-500 animate-spin mx-auto" />
                  </td>
                </tr>
              ) : breaches.length === 0 ? (
                <tr>
                  <td colSpan={9} className="px-4 py-12 text-center text-gray-500">
                    <CheckCircle className="h-8 w-8 mx-auto mb-2 text-green-500" />
                    No breaches found
                  </td>
                </tr>
              ) : (
                breaches.map((breach) => (
                  <BreachRow key={breach._id} breach={breach} onReview={() => setSelectedBreach(breach)} />
                ))
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination */}
        {pagination && pagination.totalPages > 1 && (
          <div className="px-4 py-3 border-t border-gray-200 flex items-center justify-between">
            <span className="text-sm text-gray-500">
              Page {page} of {pagination.totalPages} ({pagination.total} total)
            </span>
            <div className="flex gap-2">
              <button
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={page === 1}
                className="px-3 py-1 border border-gray-300 rounded text-sm disabled:opacity-50"
              >
                Previous
              </button>
              <button
                onClick={() => setPage((p) => Math.min(pagination.totalPages, p + 1))}
                disabled={page === pagination.totalPages}
                className="px-3 py-1 border border-gray-300 rounded text-sm disabled:opacity-50"
              >
                Next
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Review Modal */}
      {selectedBreach && (
        <BreachReviewModal breach={selectedBreach} onClose={() => setSelectedBreach(null)} />
      )}
    </>
  );
}

function BreachRow({ breach, onReview }: { breach: SLABreach; onReview: () => void }) {
  const formatOverdue = (minutes: number) => {
    if (minutes < 60) return `${minutes}m`;
    const hours = Math.floor(minutes / 60);
    const mins = minutes % 60;
    return `${hours}h ${mins}m`;
  };

  return (
    <tr className="hover:bg-gray-50">
      <td className="px-4 py-3 text-gray-600">
        {new Date(breach.breachedAt).toLocaleDateString()}
      </td>
      <td className="px-4 py-3">
        <p className="font-medium text-gray-900 truncate max-w-xs">{breach.subject}</p>
        <p className="text-xs text-gray-500">#{breach.ticketId.slice(-6)}</p>
      </td>
      <td className="px-4 py-3">
        <span
          className={`inline-flex px-2 py-0.5 rounded text-xs font-bold ${
            breach.priority === 'P1'
              ? 'bg-red-100 text-red-700'
              : breach.priority === 'P2'
                ? 'bg-orange-100 text-orange-700'
                : breach.priority === 'P3'
                  ? 'bg-amber-100 text-amber-700'
                  : 'bg-gray-100 text-gray-700'
          }`}
        >
          {breach.priority}
        </span>
      </td>
      <td className="px-4 py-3 text-gray-600">{breach.category}</td>
      <td className="px-4 py-3">
        <span className="text-red-600 font-medium">{formatOverdue(breach.overdueMinutes)}</span>
      </td>
      <td className="px-4 py-3 text-gray-600">{breach.assignedAgentName || '—'}</td>
      <td className="px-4 py-3">
        {breach.resolved ? (
          <CheckCircle className="h-5 w-5 text-green-500" />
        ) : (
          <AlertTriangle className="h-5 w-5 text-amber-500" />
        )}
      </td>
      <td className="px-4 py-3">
        {breach.rootCause ? (
          <span className="text-sm text-gray-600 truncate max-w-[120px] block">{breach.rootCause}</span>
        ) : (
          <span className="text-gray-400">—</span>
        )}
      </td>
      <td className="px-4 py-3">
        <button
          onClick={onReview}
          className="flex items-center gap-1 text-indigo-600 hover:text-indigo-700 text-sm"
        >
          <Eye className="h-4 w-4" />
          Review
        </button>
      </td>
    </tr>
  );
}

function BreachReviewModal({ breach, onClose }: { breach: SLABreach; onClose: () => void }) {
  const [rootCause, setRootCause] = useState(breach.rootCause || '');
  const [reviewBreach, { isLoading }] = useReviewBreachMutation();

  const handleSubmit = async () => {
    if (!rootCause.trim()) {
      toast.error('Please enter a root cause');
      return;
    }

    try {
      await reviewBreach({ id: breach._id, rootCause }).unwrap();
      toast.success('Breach reviewed');
      onClose();
    } catch {
      toast.error('Failed to submit review');
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="fixed inset-0 bg-black/30" onClick={onClose} />
      <div className="relative w-full max-w-lg bg-white rounded-xl shadow-xl p-6">
        <button onClick={onClose} className="absolute top-4 right-4 text-gray-400 hover:text-gray-600">
          <X className="h-5 w-5" />
        </button>

        <h2 className="text-lg font-semibold text-gray-900 mb-4">Review SLA Breach</h2>

        <div className="space-y-4">
          <div className="bg-red-50 border border-red-200 rounded-lg p-4">
            <p className="font-medium text-gray-900">{breach.subject}</p>
            <p className="text-sm text-gray-600 mt-1">
              <span className={`inline-flex px-2 py-0.5 rounded text-xs font-bold mr-2 ${
                breach.priority === 'P1' ? 'bg-red-100 text-red-700' : 'bg-orange-100 text-orange-700'
              }`}>
                {breach.priority}
              </span>
              Breached by {breach.overdueMinutes} minutes on {new Date(breach.breachedAt).toLocaleString()}
            </p>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Root Cause Analysis
            </label>
            <textarea
              value={rootCause}
              onChange={(e) => setRootCause(e.target.value)}
              rows={4}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
              placeholder="Describe the root cause of this SLA breach..."
            />
          </div>

          <div className="flex justify-end gap-3">
            <button
              onClick={onClose}
              className="px-4 py-2 text-gray-700 hover:bg-gray-100 rounded-lg"
            >
              Cancel
            </button>
            <button
              onClick={handleSubmit}
              disabled={isLoading}
              className="flex items-center gap-2 px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 disabled:opacity-50"
            >
              {isLoading && <Loader2 className="h-4 w-4 animate-spin" />}
              Submit Review
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ============ TAB 3: AT-RISK TICKETS ============
function AtRiskTab() {
  const { data, isLoading, refetch } = useGetAtRiskTicketsQuery(undefined, {
    pollingInterval: 30000, // Poll every 30 seconds
  });

  const tickets = useMemo(() => {
    return [...(data?.tickets || [])].sort((a, b) => a.minutesLeft - b.minutesLeft);
  }, [data]);

  const criticalCount = tickets.filter((t) => t.slaStatus === 'critical').length;
  const warningCount = tickets.filter((t) => t.slaStatus === 'warning').length;

  return (
    <>
      {/* Header */}
      <div className="bg-white rounded-xl border border-gray-200 p-4 flex items-center justify-between">
        <div className="flex items-center gap-4">
          <h3 className="font-semibold text-gray-900">
            At-Risk Right Now ({tickets.length})
          </h3>
          {criticalCount > 0 && (
            <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-red-100 text-red-700 rounded text-xs font-medium">
              <AlertTriangle className="h-3 w-3" />
              {criticalCount} critical
            </span>
          )}
          {warningCount > 0 && (
            <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-amber-100 text-amber-700 rounded text-xs font-medium">
              <Clock className="h-3 w-3" />
              {warningCount} warning
            </span>
          )}
        </div>
        <button
          onClick={() => refetch()}
          className="flex items-center gap-2 px-3 py-2 text-gray-600 hover:text-gray-900"
        >
          <RefreshCw className="h-4 w-4" />
          Refresh
        </button>
      </div>

      {/* Ticket Cards */}
      <div className="space-y-3">
        {isLoading ? (
          <div className="bg-white rounded-xl border border-gray-200 p-12 flex items-center justify-center">
            <Loader2 className="h-8 w-8 text-indigo-500 animate-spin" />
          </div>
        ) : tickets.length === 0 ? (
          <div className="bg-white rounded-xl border border-gray-200 p-12 text-center">
            <CheckCircle className="h-12 w-12 mx-auto mb-3 text-green-500" />
            <p className="text-lg font-medium text-gray-900">All Clear!</p>
            <p className="text-gray-500">No tickets are at risk of breaching SLA</p>
          </div>
        ) : (
          tickets.map((ticket) => <AtRiskTicketCard key={ticket.ticketId} ticket={ticket} />)
        )}
      </div>
    </>
  );
}

function AtRiskTicketCard({ ticket }: { ticket: AtRiskTicket }) {
  const isCritical = ticket.slaStatus === 'critical';

  return (
    <div
      className={`bg-white rounded-xl border-2 p-4 ${
        isCritical ? 'border-red-300 bg-red-50/30' : 'border-amber-300 bg-amber-50/30'
      }`}
    >
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          {/* Countdown */}
          <div
            className={`w-20 h-20 rounded-xl flex flex-col items-center justify-center ${
              isCritical ? 'bg-red-100' : 'bg-amber-100'
            }`}
          >
            <span className={`text-2xl font-bold ${isCritical ? 'text-red-600' : 'text-amber-600'}`}>
              {ticket.minutesLeft}
            </span>
            <span className={`text-xs ${isCritical ? 'text-red-500' : 'text-amber-500'}`}>min left</span>
          </div>

          {/* Info */}
          <div>
            <p className="font-medium text-gray-900">{ticket.subject}</p>
            <div className="flex items-center gap-2 mt-1">
              <span
                className={`inline-flex px-2 py-0.5 rounded text-xs font-bold ${
                  ticket.priority === 'P1'
                    ? 'bg-red-100 text-red-700'
                    : ticket.priority === 'P2'
                      ? 'bg-orange-100 text-orange-700'
                      : 'bg-amber-100 text-amber-700'
                }`}
              >
                {ticket.priority}
              </span>
              {ticket.category && (
                <span className="text-xs px-2 py-0.5 bg-gray-100 text-gray-600 rounded">
                  {ticket.category}
                </span>
              )}
              {ticket.assignedAgent ? (
                <span className="text-xs text-gray-500">Assigned to: {ticket.assignedAgent}</span>
              ) : (
                <span className="text-xs text-red-500 font-medium">Unassigned</span>
              )}
            </div>
          </div>
        </div>

        {/* Actions */}
        <div className="flex items-center gap-3">
          {!ticket.assignedAgent && (
            <button className="flex items-center gap-2 px-4 py-2 bg-indigo-600 text-white rounded-lg text-sm hover:bg-indigo-700">
              <UserPlus className="h-4 w-4" />
              Assign Now
            </button>
          )}
          <a
            href={`/tickets?id=${ticket.ticketId}`}
            className="flex items-center gap-2 px-4 py-2 border border-gray-300 rounded-lg text-sm text-gray-700 hover:bg-gray-50"
          >
            <ExternalLink className="h-4 w-4" />
            View Ticket
          </a>
        </div>
      </div>
    </div>
  );
}

export default SLADashboard;
