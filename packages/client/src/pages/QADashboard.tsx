import { useState, useCallback } from 'react';
import {
  ClipboardCheck,
  AlertTriangle,
  TrendingUp,
  TrendingDown,
  BarChart3,
  Phone,
  MessageSquare,
  Filter,
  Eye,
  CheckCircle2,
  XCircle,
  X,
  RefreshCw,
} from 'lucide-react';
import {
  BarChart,
  Bar,
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Cell,
} from 'recharts';
import {
  useGetQAReportsQuery,
  useGetQASummaryQuery,
  useGetQAReportQuery,
  type QAReport,
} from '../api/qaApi';
import StatCard from '../components/StatCard';
import QAScoreCard from '../components/QAScoreCard';

export default function QADashboard() {
  const [days, setDays] = useState(30);
  const [channel, setChannel] = useState<'voice' | 'text' | undefined>(undefined);
  const [flaggedOnly, setFlaggedOnly] = useState(false);
  const [page, setPage] = useState(1);
  const [selectedReportId, setSelectedReportId] = useState<string | null>(null);

  // Fetch data
  const { data: summary, refetch: refetchSummary } = useGetQASummaryQuery({ days });
  const { data: reportsData, refetch: refetchReports } = useGetQAReportsQuery({
    days,
    channel,
    flaggedOnly,
    page,
    limit: 15,
  });

  const handleRefresh = useCallback(() => {
    refetchSummary();
    refetchReports();
  }, [refetchSummary, refetchReports]);

  const handleViewReport = useCallback((id: string) => {
    setSelectedReportId(id);
  }, []);

  const handleCloseDetail = useCallback(() => {
    setSelectedReportId(null);
  }, []);

  // Calculate flagged percentage
  const flaggedPercentage = summary
    ? Math.round((summary.flaggedCount / summary.totalReports) * 100) || 0
    : 0;

  // Find worst dimension
  const worstDimension = summary
    ? Object.entries(summary.avgByDimension).reduce((worst, [key, score]) =>
        score < (worst?.score || Infinity) ? { key, score } : worst
      , { key: '', score: Infinity })
    : null;

  const dimensionLabels: Record<string, string> = {
    intentUnderstanding: 'Intent Understanding',
    responseAccuracy: 'Response Accuracy',
    resolutionSuccess: 'Resolution Success',
    escalationCorrectness: 'Escalation Correctness',
    customerExperience: 'Customer Experience',
  };

  // Chart colors
  const barColors = ['#ef4444', '#f59e0b', '#f59e0b', '#22c55e', '#22c55e'];

  return (
    <div className="min-h-screen bg-gray-50 p-6">
      {/* Header */}
      <div className="mb-8">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold text-gray-900 flex items-center gap-3">
              <ClipboardCheck className="h-8 w-8 text-indigo-600" />
              QA Dashboard
            </h1>
            <p className="mt-1 text-gray-600">
              Monitor AI interaction quality and review flagged interactions
            </p>
          </div>
          <div className="flex items-center gap-3">
            <select
              value={days}
              onChange={(e) => setDays(parseInt(e.target.value))}
              className="px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
            >
              <option value={7}>Last 7 days</option>
              <option value={30}>Last 30 days</option>
              <option value={90}>Last 90 days</option>
            </select>
            <button
              onClick={handleRefresh}
              className="flex items-center gap-2 px-4 py-2 text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50"
            >
              <RefreshCw className="h-4 w-4" />
              Refresh
            </button>
          </div>
        </div>
      </div>

      {/* TOP ROW: 4 Stat Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
        <StatCard
          value={summary?.avgOverallScore || 0}
          label="Avg QA Score"
          accent="blue"
          subtitle={`${days}-day average`}
        />
        <StatCard
          value={flaggedPercentage}
          label="% Flagged for Review"
          accent={flaggedPercentage > 20 ? 'red' : flaggedPercentage > 10 ? 'amber' : 'green'}
          suffix="%"
          subtitle={`${summary?.flaggedCount || 0} interactions`}
        />
        <StatCard
          value={summary?.totalReports || 0}
          label="Total Scored"
          accent="teal"
          subtitle="Interactions evaluated"
        />
        <StatCard
          value={summary?.trendByDay?.[summary.trendByDay.length - 1]?.avgScore || 0}
          label="Today's Avg"
          accent="purple"
          trend={
            summary?.trendByDay && summary.trendByDay.length >= 2
              ? summary.trendByDay[summary.trendByDay.length - 1].avgScore -
                summary.trendByDay[summary.trendByDay.length - 2].avgScore
              : 0
          }
          trendPositive={true}
        />
      </div>

      {/* MAIN CONTENT: 2 columns */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* LEFT: QA Reports Table (55%) */}
        <div className="lg:col-span-7 bg-white rounded-xl border border-gray-200">
          {/* Filters */}
          <div className="p-4 border-b border-gray-100 flex items-center gap-4">
            <Filter className="h-5 w-5 text-gray-400" />

            <select
              value={channel || ''}
              onChange={(e) => setChannel((e.target.value as 'voice' | 'text') || undefined)}
              className="px-3 py-1.5 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
            >
              <option value="">All Channels</option>
              <option value="voice">Voice</option>
              <option value="text">Text</option>
            </select>

            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={flaggedOnly}
                onChange={(e) => setFlaggedOnly(e.target.checked)}
                className="rounded border-gray-300 text-indigo-600 focus:ring-indigo-500"
              />
              Flagged only
            </label>
          </div>

          {/* Table */}
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="text-left text-xs text-gray-500 border-b border-gray-100">
                  <th className="px-4 py-3 font-medium">Date</th>
                  <th className="px-4 py-3 font-medium">ID</th>
                  <th className="px-4 py-3 font-medium">Channel</th>
                  <th className="px-4 py-3 font-medium">Score</th>
                  <th className="px-4 py-3 font-medium">Flagged</th>
                  <th className="px-4 py-3 font-medium">Status</th>
                  <th className="px-4 py-3 font-medium">Action</th>
                </tr>
              </thead>
              <tbody className="text-sm">
                {reportsData?.reports.map((report) => (
                  <ReportRow
                    key={report._id}
                    report={report}
                    onView={() => handleViewReport(report._id)}
                  />
                ))}
                {(!reportsData?.reports || reportsData.reports.length === 0) && (
                  <tr>
                    <td colSpan={7} className="px-4 py-8 text-center text-gray-500">
                      No QA reports found
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          {/* Pagination */}
          {reportsData && reportsData.pagination.totalPages > 1 && (
            <div className="p-4 border-t border-gray-100 flex items-center justify-between">
              <span className="text-sm text-gray-500">
                Page {page} of {reportsData.pagination.totalPages} ({reportsData.pagination.total} total)
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
                  onClick={() => setPage((p) => Math.min(reportsData.pagination.totalPages, p + 1))}
                  disabled={page === reportsData.pagination.totalPages}
                  className="px-3 py-1 border border-gray-300 rounded text-sm disabled:opacity-50"
                >
                  Next
                </button>
              </div>
            </div>
          )}
        </div>

        {/* RIGHT: Charts (45%) */}
        <div className="lg:col-span-5 space-y-6">
          {/* Score Distribution */}
          <div className="bg-white rounded-xl border border-gray-200 p-6">
            <h3 className="text-lg font-semibold text-gray-900 flex items-center gap-2 mb-4">
              <BarChart3 className="h-5 w-5 text-indigo-600" />
              Score Distribution
            </h3>
            <div className="h-48">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={summary?.scoreDistribution || []}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#E5E7EB" />
                  <XAxis dataKey="range" tick={{ fontSize: 12 }} stroke="#9CA3AF" />
                  <YAxis tick={{ fontSize: 12 }} stroke="#9CA3AF" />
                  <Tooltip />
                  <Bar dataKey="count" radius={[4, 4, 0, 0]}>
                    {(summary?.scoreDistribution || []).map((_, index) => (
                      <Cell key={`cell-${index}`} fill={barColors[index]} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* QA Trend */}
          <div className="bg-white rounded-xl border border-gray-200 p-6">
            <h3 className="text-lg font-semibold text-gray-900 flex items-center gap-2 mb-4">
              <TrendingUp className="h-5 w-5 text-green-600" />
              QA Score Trend
            </h3>
            <div className="h-48">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={summary?.trendByDay || []}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#E5E7EB" />
                  <XAxis
                    dataKey="date"
                    tick={{ fontSize: 10 }}
                    stroke="#9CA3AF"
                    tickFormatter={(d) => new Date(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                  />
                  <YAxis domain={[0, 100]} tick={{ fontSize: 12 }} stroke="#9CA3AF" />
                  <Tooltip
                    formatter={(value: number) => [value.toFixed(1), 'Avg Score']}
                    labelFormatter={(label) => new Date(label).toLocaleDateString()}
                  />
                  <Line
                    type="monotone"
                    dataKey="avgScore"
                    stroke="#3B82F6"
                    strokeWidth={2}
                    dot={{ fill: '#3B82F6', r: 3 }}
                  />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* Worst Dimension */}
          {worstDimension && worstDimension.key && (
            <div className="bg-amber-50 rounded-xl border border-amber-200 p-6">
              <h3 className="text-lg font-semibold text-amber-900 flex items-center gap-2 mb-2">
                <AlertTriangle className="h-5 w-5 text-amber-600" />
                Needs Improvement
              </h3>
              <p className="text-amber-800">
                <span className="font-medium">{dimensionLabels[worstDimension.key]}</span> has the lowest
                average score this period at{' '}
                <span className="font-bold">{worstDimension.score.toFixed(1)}/10</span>
              </p>
              <p className="text-sm text-amber-600 mt-2">
                Consider reviewing training data or adjusting AI prompts for this dimension.
              </p>
            </div>
          )}
        </div>
      </div>

      {/* Detail Slide-in Panel */}
      {selectedReportId && (
        <ReportDetailPanel reportId={selectedReportId} onClose={handleCloseDetail} />
      )}
    </div>
  );
}

// Report row component
function ReportRow({ report, onView }: { report: QAReport; onView: () => void }) {
  return (
    <tr className="border-b border-gray-50 hover:bg-gray-50">
      <td className="px-4 py-3 text-gray-600">
        {new Date(report.createdAt).toLocaleDateString()}
      </td>
      <td className="px-4 py-3">
        <span className="font-mono text-xs text-gray-500">
          {report.interactionId.slice(0, 8)}...
        </span>
      </td>
      <td className="px-4 py-3">
        <span className="flex items-center gap-1.5 text-gray-600">
          {report.channel === 'voice' ? (
            <Phone className="h-3.5 w-3.5" />
          ) : (
            <MessageSquare className="h-3.5 w-3.5" />
          )}
          {report.channel}
        </span>
      </td>
      <td className="px-4 py-3">
        <span
          className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${
            report.overallScore >= 80
              ? 'bg-green-100 text-green-700'
              : report.overallScore >= 60
                ? 'bg-amber-100 text-amber-700'
                : 'bg-red-100 text-red-700'
          }`}
        >
          {report.overallScore}
        </span>
      </td>
      <td className="px-4 py-3">
        {report.flaggedForReview ? (
          <span className="flex items-center gap-1 text-amber-600">
            <AlertTriangle className="h-4 w-4" />
            {report.flaggedDimensions.length}
          </span>
        ) : (
          <span className="text-gray-400">—</span>
        )}
      </td>
      <td className="px-4 py-3">
        {report.reviewedBy ? (
          <span className="flex items-center gap-1 text-green-600">
            <CheckCircle2 className="h-4 w-4" />
            Reviewed
          </span>
        ) : report.flaggedForReview ? (
          <span className="text-amber-600 text-sm">Pending</span>
        ) : (
          <span className="text-gray-400">—</span>
        )}
      </td>
      <td className="px-4 py-3">
        <button
          onClick={onView}
          className="flex items-center gap-1 text-indigo-600 hover:text-indigo-700 text-sm"
        >
          <Eye className="h-4 w-4" />
          View
        </button>
      </td>
    </tr>
  );
}

// Report detail panel
function ReportDetailPanel({ reportId, onClose }: { reportId: string; onClose: () => void }) {
  const { data, isLoading, refetch } = useGetQAReportQuery(reportId);

  return (
    <div className="fixed inset-0 z-50 flex justify-end">
      {/* Backdrop */}
      <div className="fixed inset-0 bg-black/30" onClick={onClose} />

      {/* Panel */}
      <div className="relative w-full max-w-xl bg-white shadow-xl overflow-y-auto">
        <div className="sticky top-0 bg-white border-b border-gray-200 p-4 flex items-center justify-between z-10">
          <h2 className="text-lg font-semibold text-gray-900">QA Report Details</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600">
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="p-6">
          {isLoading ? (
            <div className="flex items-center justify-center h-64">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-600" />
            </div>
          ) : data?.report ? (
            <QAScoreCard report={data.report} onReviewed={refetch} />
          ) : (
            <p className="text-gray-500 text-center py-8">Report not found</p>
          )}
        </div>
      </div>
    </div>
  );
}
