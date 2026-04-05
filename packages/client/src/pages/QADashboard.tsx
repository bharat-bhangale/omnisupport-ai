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
  X,
  RefreshCw,
  Users,
  Award,
  Trophy,
  Medal,
} from 'lucide-react';
import {
  BarChart,
  Bar,
  LineChart,
  Line,
  RadarChart,
  Radar,
  PolarGrid,
  PolarAngleAxis,
  PolarRadiusAxis,
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
  useGetAgentLeaderboardQuery,
  useReviewQAReportMutation,
  type QAReport,
} from '../api/qaApi';
import StatCard from '../components/StatCard';
import QAScoreCard from '../components/QAScoreCard';
import toast from 'react-hot-toast';

type TabType = 'overview' | 'scores' | 'agents';

// Dimension labels for display
const dimensionLabels: Record<string, string> = {
  intentUnderstanding: 'Intent',
  responseAccuracy: 'Accuracy',
  resolutionSuccess: 'Resolution',
  escalationCorrectness: 'Escalation',
  customerExperience: 'Experience',
};

// Chart colors
const barColors = ['#ef4444', '#f97316', '#f59e0b', '#22c55e', '#15803d'];

export default function QADashboard() {
  const [activeTab, setActiveTab] = useState<TabType>('overview');
  const [days, setDays] = useState(30);
  const [channel, setChannel] = useState<'voice' | 'text' | undefined>(undefined);
  const [flaggedOnly, setFlaggedOnly] = useState(false);
  const [scoreRange, setScoreRange] = useState<[number, number]>([0, 100]);
  const [page, setPage] = useState(1);
  const [selectedReportId, setSelectedReportId] = useState<string | null>(null);

  // Fetch data
  const { data: summary, refetch: refetchSummary } = useGetQASummaryQuery({ days });
  const { data: reportsData, refetch: refetchReports } = useGetQAReportsQuery({
    days,
    channel,
    flaggedOnly,
    minScore: scoreRange[0],
    maxScore: scoreRange[1],
    page,
    limit: 15,
  });
  const { data: leaderboardData } = useGetAgentLeaderboardQuery({ days });

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

  // Tab buttons
  const tabs: { id: TabType; label: string; icon: React.ReactNode }[] = [
    { id: 'overview', label: 'Overview', icon: <BarChart3 className="h-4 w-4" /> },
    { id: 'scores', label: 'Interaction Scores', icon: <ClipboardCheck className="h-4 w-4" /> },
    { id: 'agents', label: 'Agent Performance', icon: <Users className="h-4 w-4" /> },
  ];

  return (
    <div className="min-h-screen bg-[#0A1835] p-6">
      {/* Header */}
      <div className="mb-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold text-[#F9FAFB] flex items-center gap-3">
              <ClipboardCheck className="h-8 w-8 text-indigo-600" />
              QA Dashboard
            </h1>
            <p className="mt-1 text-[#9CA3AF]">
              Monitor AI interaction quality and review flagged interactions
            </p>
          </div>
          <div className="flex items-center gap-3">
            <select
              value={days}
              onChange={(e) => setDays(parseInt(e.target.value))}
              className="px-3 py-2 bg-[#0A1835] border border-[#1E3461] rounded-lg text-sm text-[#F9FAFB] focus:outline-none focus:ring-2 focus:ring-indigo-500"
            >
              <option value={7}>Last 7 days</option>
              <option value={30}>Last 30 days</option>
              <option value={90}>Last 90 days</option>
            </select>
            <button
              onClick={handleRefresh}
              className="flex items-center gap-2 px-4 py-2 text-[#F9FAFB] bg-[#162240] border border-[#1E3461] rounded-lg hover:bg-[#0F1F3D]"
            >
              <RefreshCw className="h-4 w-4" />
              Refresh
            </button>
          </div>
        </div>
      </div>

      {/* Tab Navigation */}
      <div className="flex gap-1 bg-[#0F1F3D] p-1 rounded-lg w-fit mb-6">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`flex items-center gap-2 px-4 py-2 rounded-md text-sm font-medium transition-colors ${
              activeTab === tab.id
                ? 'bg-[#162240] text-indigo-400 shadow-sm'
                : 'text-[#9CA3AF] hover:text-[#F9FAFB]'
            }`}
          >
            {tab.icon}
            {tab.label}
          </button>
        ))}
      </div>

      {/* Tab Content */}
      {activeTab === 'overview' && (
        <OverviewTab
          summary={summary}
          days={days}
          reportsData={reportsData}
          onViewReport={handleViewReport}
        />
      )}

      {activeTab === 'scores' && (
        <InteractionScoresTab
          channel={channel}
          setChannel={setChannel}
          flaggedOnly={flaggedOnly}
          setFlaggedOnly={setFlaggedOnly}
          scoreRange={scoreRange}
          setScoreRange={setScoreRange}
          page={page}
          setPage={setPage}
          reportsData={reportsData}
          onViewReport={handleViewReport}
        />
      )}

      {activeTab === 'agents' && (
        <AgentPerformanceTab leaderboardData={leaderboardData} />
      )}

      {/* Detail Slide-in Panel */}
      {selectedReportId && (
        <ReportDetailPanel reportId={selectedReportId} onClose={handleCloseDetail} />
      )}
    </div>
  );
}

// ============ TAB 1: OVERVIEW ============
function OverviewTab({
  summary,
  days,
  reportsData,
  onViewReport,
}: {
  summary: ReturnType<typeof useGetQASummaryQuery>['data'];
  days: number;
  reportsData: ReturnType<typeof useGetQAReportsQuery>['data'];
  onViewReport: (id: string) => void;
}) {
  // Find worst dimension
  const worstDimension = summary
    ? Object.entries(summary.avgByDimension).reduce(
        (worst, [key, score]) => (score < (worst?.score || Infinity) ? { key, score } : worst),
        { key: '', score: Infinity }
      )
    : null;

  // Radar chart data
  const radarData = summary
    ? Object.entries(summary.avgByDimension).map(([key, score]) => ({
        dimension: dimensionLabels[key] || key,
        score,
        fullMark: 10,
      }))
    : [];

  // Flagged reports
  const flaggedReports = reportsData?.reports.filter((r) => r.flaggedForReview && !r.reviewedBy) || [];

  return (
    <>
      {/* TOP ROW: 4 Stat Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
        <StatCard
          value={summary?.avgOverallScore || 0}
          label="Avg QA Score"
          accent="blue"
          subtitle={`${days}-day average`}
        />
        <StatCard
          value={summary?.flaggedCount || 0}
          label="Flagged for Review"
          accent={summary && summary.flaggedCount > 10 ? 'red' : 'amber'}
          subtitle="Needs attention"
        />
        <StatCard
          value={summary?.coverage || 0}
          label="Coverage"
          accent="teal"
          suffix="%"
          subtitle="of all interactions"
        />
        <StatCard
          value={summary?.trendVsLastPeriod || 0}
          label="Trend"
          accent={summary && summary.trendVsLastPeriod >= 0 ? 'green' : 'red'}
          prefix={summary && summary.trendVsLastPeriod >= 0 ? '+' : ''}
          suffix="%"
          subtitle="vs last period"
        />
      </div>

      {/* ROW 2: 3 Charts */}
      <div className="grid grid-cols-1 lg:grid-cols-10 gap-6 mb-8">
        {/* LEFT: Score Distribution (40%) */}
        <div className="lg:col-span-4 bg-[#162240] rounded-xl border border-[#1E3461] p-6">
          <h3 className="text-lg font-semibold text-[#F9FAFB] flex items-center gap-2 mb-4">
            <BarChart3 className="h-5 w-5 text-indigo-600" />
            Score Distribution
          </h3>
          <div className="h-56">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={summary?.scoreDistribution || []}>
                <CartesianGrid strokeDasharray="3 3" stroke="#1E3461" />
                <XAxis dataKey="range" tick={{ fontSize: 12, fill: '#9CA3AF' }} stroke="#1E3461" />
                <YAxis tick={{ fontSize: 12, fill: '#9CA3AF' }} stroke="#1E3461" />
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

        {/* CENTER: By Dimension Radar (30%) */}
        <div className="lg:col-span-3 bg-[#162240] rounded-xl border border-[#1E3461] p-6">
          <h3 className="text-lg font-semibold text-[#F9FAFB] flex items-center gap-2 mb-4">
            <Award className="h-5 w-5 text-purple-600" />
            By Dimension
          </h3>
          <div className="h-56">
            <ResponsiveContainer width="100%" height="100%">
              <RadarChart cx="50%" cy="50%" outerRadius="70%" data={radarData}>
                <PolarGrid stroke="#1E3461" />
                <PolarAngleAxis dataKey="dimension" tick={{ fontSize: 10, fill: '#9CA3AF' }} />
                <PolarRadiusAxis angle={30} domain={[0, 10]} tick={{ fontSize: 10, fill: '#9CA3AF' }} />
                <Radar
                  name="Avg Score"
                  dataKey="score"
                  stroke="#8B5CF6"
                  fill="#8B5CF6"
                  fillOpacity={0.4}
                />
              </RadarChart>
            </ResponsiveContainer>
          </div>
          {worstDimension && worstDimension.key && (
            <div className="mt-2 text-xs text-amber-400 bg-amber-900/30 px-3 py-2 rounded-lg">
              <AlertTriangle className="h-3.5 w-3.5 inline mr-1" />
              Lowest: {dimensionLabels[worstDimension.key]} at {worstDimension.score.toFixed(1)}/10
            </div>
          )}
        </div>

        {/* RIGHT: QA Trend (30%) */}
        <div className="lg:col-span-3 bg-gray-900 rounded-xl p-6">
          <h3 className="text-lg font-semibold text-white flex items-center gap-2 mb-4">
            <TrendingUp className="h-5 w-5 text-green-400" />
            QA Trend
          </h3>
          <div className="h-56">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={summary?.trendByDay || []}>
                <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
                <XAxis
                  dataKey="date"
                  tick={{ fontSize: 10, fill: '#9CA3AF' }}
                  stroke="#4B5563"
                  tickFormatter={(d) =>
                    new Date(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
                  }
                />
                <YAxis domain={[0, 100]} tick={{ fontSize: 10, fill: '#9CA3AF' }} stroke="#4B5563" />
                <Tooltip
                  contentStyle={{ background: '#1F2937', border: 'none', borderRadius: '8px' }}
                  labelStyle={{ color: '#9CA3AF' }}
                  formatter={(value: number) => [value.toFixed(1), 'Avg Score']}
                  labelFormatter={(label) => new Date(label).toLocaleDateString()}
                />
                <Line
                  type="monotone"
                  dataKey="avgScore"
                  stroke="#10B981"
                  strokeWidth={2}
                  dot={{ fill: '#10B981', r: 3 }}
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>

      {/* ROW 3: Flagged Interactions */}
      <div className="bg-[#162240] rounded-xl border border-[#1E3461]">
        <div className="p-4 border-b border-[#1E3461] flex items-center justify-between">
          <h3 className="text-lg font-semibold text-[#F9FAFB] flex items-center gap-2">
            <AlertTriangle className="h-5 w-5 text-amber-600" />
            Flagged Interactions
            {flaggedReports.length > 0 && (
              <span className="text-xs bg-amber-900/50 text-amber-400 px-2 py-0.5 rounded-full">
                {flaggedReports.length} pending
              </span>
            )}
          </h3>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="text-left text-xs text-[#9CA3AF] border-b border-[#1E3461]">
                <th className="px-4 py-3 font-medium">Date</th>
                <th className="px-4 py-3 font-medium">ID</th>
                <th className="px-4 py-3 font-medium">Channel</th>
                <th className="px-4 py-3 font-medium">Score</th>
                <th className="px-4 py-3 font-medium">Flagged Dimensions</th>
                <th className="px-4 py-3 font-medium">Status</th>
                <th className="px-4 py-3 font-medium">Action</th>
              </tr>
            </thead>
            <tbody className="text-sm">
              {flaggedReports.slice(0, 5).map((report) => (
                <FlaggedReportRow key={report._id} report={report} onView={() => onViewReport(report._id)} />
              ))}
              {flaggedReports.length === 0 && (
                <tr>
                  <td colSpan={7} className="px-4 py-8 text-center text-[#9CA3AF]">
                    <CheckCircle2 className="h-8 w-8 mx-auto mb-2 text-green-500" />
                    All flagged interactions have been reviewed
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </>
  );
}

// Flagged report row with Mark Reviewed button
function FlaggedReportRow({ report, onView }: { report: QAReport; onView: () => void }) {
  const [reviewQAReport, { isLoading }] = useReviewQAReportMutation();

  const handleMarkReviewed = async () => {
    try {
      await reviewQAReport({ id: report._id, reviewNote: 'Reviewed from dashboard' }).unwrap();
      toast.success('Marked as reviewed');
    } catch {
      toast.error('Failed to mark as reviewed');
    }
  };

  return (
    <tr className="border-b border-[#1E3461]/50 hover:bg-[#0F1F3D]">
      <td className="px-4 py-3 text-[#9CA3AF]">{new Date(report.createdAt).toLocaleDateString()}</td>
      <td className="px-4 py-3">
        <span className="font-mono text-xs text-[#9CA3AF]">{report.interactionId.slice(0, 8)}...</span>
      </td>
      <td className="px-4 py-3">
        <span className="flex items-center gap-1.5 text-[#9CA3AF]">
          {report.channel === 'voice' ? <Phone className="h-3.5 w-3.5" /> : <MessageSquare className="h-3.5 w-3.5" />}
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
        <div className="flex flex-wrap gap-1">
          {report.flaggedDimensions.map((dim) => (
            <span key={dim} className="text-xs px-2 py-0.5 bg-red-100 text-red-700 rounded">
              {dimensionLabels[dim] || dim}
            </span>
          ))}
        </div>
      </td>
      <td className="px-4 py-3">
        <span className="text-amber-400 text-sm">Pending</span>
      </td>
      <td className="px-4 py-3">
        <div className="flex items-center gap-2">
          <button
            onClick={onView}
            className="flex items-center gap-1 text-indigo-400 hover:text-indigo-300 text-sm"
          >
            <Eye className="h-4 w-4" />
          </button>
          <button
            onClick={handleMarkReviewed}
            disabled={isLoading}
            className="text-xs px-2 py-1 bg-amber-900/50 text-amber-400 rounded hover:bg-amber-900/70 disabled:opacity-50"
          >
            {isLoading ? '...' : 'Mark Reviewed'}
          </button>
        </div>
      </td>
    </tr>
  );
}

// ============ TAB 2: INTERACTION SCORES ============
function InteractionScoresTab({
  channel,
  setChannel,
  flaggedOnly,
  setFlaggedOnly,
  scoreRange,
  setScoreRange,
  page,
  setPage,
  reportsData,
  onViewReport,
}: {
  channel: 'voice' | 'text' | undefined;
  setChannel: (c: 'voice' | 'text' | undefined) => void;
  flaggedOnly: boolean;
  setFlaggedOnly: (f: boolean) => void;
  scoreRange: [number, number];
  setScoreRange: (r: [number, number]) => void;
  page: number;
  setPage: (p: number) => void;
  reportsData: ReturnType<typeof useGetQAReportsQuery>['data'];
  onViewReport: (id: string) => void;
}) {
  return (
    <div className="bg-[#162240] rounded-xl border border-[#1E3461]">
      {/* Filter Bar */}
      <div className="p-4 border-b border-[#1E3461] flex flex-wrap items-center gap-4">
        <Filter className="h-5 w-5 text-[#6B7280]" />

        {/* Channel toggle */}
        <div className="flex bg-[#0F1F3D] rounded-lg p-1">
          <button
            onClick={() => setChannel(undefined)}
            className={`px-3 py-1 rounded text-sm ${!channel ? 'bg-[#162240] shadow-sm text-[#F9FAFB]' : 'text-[#9CA3AF]'}`}
          >
            All
          </button>
          <button
            onClick={() => setChannel('voice')}
            className={`px-3 py-1 rounded text-sm flex items-center gap-1 ${channel === 'voice' ? 'bg-[#162240] shadow-sm text-[#F9FAFB]' : 'text-[#9CA3AF]'}`}
          >
            <Phone className="h-3.5 w-3.5" /> Voice
          </button>
          <button
            onClick={() => setChannel('text')}
            className={`px-3 py-1 rounded text-sm flex items-center gap-1 ${channel === 'text' ? 'bg-[#162240] shadow-sm text-[#F9FAFB]' : 'text-[#9CA3AF]'}`}
          >
            <MessageSquare className="h-3.5 w-3.5" /> Text
          </button>
        </div>

        {/* Flagged only toggle */}
        <label className="flex items-center gap-2 text-sm text-[#F9FAFB]">
          <input
            type="checkbox"
            checked={flaggedOnly}
            onChange={(e) => setFlaggedOnly(e.target.checked)}
            className="rounded border-[#1E3461] bg-[#0A1835] text-indigo-600 focus:ring-indigo-500"
          />
          Flagged only
        </label>

        {/* Score range */}
        <div className="flex items-center gap-2 text-sm">
          <span className="text-[#9CA3AF]">Score:</span>
          <input
            type="number"
            min={0}
            max={100}
            value={scoreRange[0]}
            onChange={(e) => setScoreRange([parseInt(e.target.value) || 0, scoreRange[1]])}
            className="w-16 px-2 py-1 bg-[#0A1835] border border-[#1E3461] rounded text-center text-[#F9FAFB]"
          />
          <span className="text-[#6B7280]">–</span>
          <input
            type="number"
            min={0}
            max={100}
            value={scoreRange[1]}
            onChange={(e) => setScoreRange([scoreRange[0], parseInt(e.target.value) || 100])}
            className="w-16 px-2 py-1 bg-[#0A1835] border border-[#1E3461] rounded text-center text-[#F9FAFB]"
          />
        </div>
      </div>

      {/* Table */}
      <div className="overflow-x-auto">
        <table className="w-full">
          <thead>
            <tr className="text-left text-xs text-[#9CA3AF] border-b border-[#1E3461]">
              <th className="px-4 py-3 font-medium">Date</th>
              <th className="px-4 py-3 font-medium">ID</th>
              <th className="px-4 py-3 font-medium">Channel</th>
              <th className="px-4 py-3 font-medium">Overall Score</th>
              <th className="px-4 py-3 font-medium">Dimensions</th>
              <th className="px-4 py-3 font-medium">Review</th>
              <th className="px-4 py-3 font-medium">Detail</th>
            </tr>
          </thead>
          <tbody className="text-sm">
            {reportsData?.reports.map((report) => (
              <InteractionScoreRow key={report._id} report={report} onView={() => onViewReport(report._id)} />
            ))}
            {(!reportsData?.reports || reportsData.reports.length === 0) && (
              <tr>
                <td colSpan={7} className="px-4 py-8 text-center text-[#9CA3AF]">
                  No QA reports found
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {/* Pagination */}
      {reportsData && reportsData.pagination.totalPages > 1 && (
        <div className="p-4 border-t border-[#1E3461] flex items-center justify-between">
          <span className="text-sm text-[#9CA3AF]">
            Page {page} of {reportsData.pagination.totalPages} ({reportsData.pagination.total} total)
          </span>
          <div className="flex gap-2">
            <button
              onClick={() => setPage(Math.max(1, page - 1))}
              disabled={page === 1}
              className="px-3 py-1 border border-[#1E3461] rounded text-sm text-[#F9FAFB] disabled:opacity-50"
            >
              Previous
            </button>
            <button
              onClick={() => setPage(Math.min(reportsData.pagination.totalPages, page + 1))}
              disabled={page === reportsData.pagination.totalPages}
              className="px-3 py-1 border border-[#1E3461] rounded text-sm text-[#F9FAFB] disabled:opacity-50"
            >
              Next
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function InteractionScoreRow({ report, onView }: { report: QAReport; onView: () => void }) {
  const dimensions = Object.entries(report.dimensions);

  return (
    <tr className="border-b border-[#1E3461]/50 hover:bg-[#0F1F3D]">
      <td className="px-4 py-3 text-[#9CA3AF]">{new Date(report.createdAt).toLocaleDateString()}</td>
      <td className="px-4 py-3">
        <span className="font-mono text-xs text-[#9CA3AF]">{report.interactionId.slice(0, 8)}...</span>
      </td>
      <td className="px-4 py-3">
        <span className="flex items-center gap-1.5 text-[#9CA3AF]">
          {report.channel === 'voice' ? <Phone className="h-3.5 w-3.5" /> : <MessageSquare className="h-3.5 w-3.5" />}
          {report.channel}
        </span>
      </td>
      <td className="px-4 py-3">
        <span
          className={`inline-flex items-center px-3 py-1 rounded-full text-sm font-bold ${
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
        <div className="flex gap-1">
          {dimensions.slice(0, 3).map(([key, dim]) => (
            <span
              key={key}
              className={`text-xs px-2 py-0.5 rounded ${
                dim.score >= 8 ? 'bg-green-100 text-green-700' : dim.score >= 6 ? 'bg-amber-100 text-amber-700' : 'bg-red-100 text-red-700'
              }`}
              title={`${dimensionLabels[key]}: ${dim.score}/10`}
            >
              {dim.score}
            </span>
          ))}
          {dimensions.length > 3 && <span className="text-xs text-[#6B7280]">+{dimensions.length - 3}</span>}
        </div>
      </td>
      <td className="px-4 py-3">
        {report.reviewedBy ? (
          <span className="flex items-center gap-1 text-green-600">
            <CheckCircle2 className="h-4 w-4" />
            <span className="text-xs">Reviewed</span>
          </span>
        ) : report.flaggedForReview ? (
          <span className="flex items-center gap-1 text-amber-600">
            <AlertTriangle className="h-4 w-4" />
            <span className="text-xs">Pending</span>
          </span>
        ) : (
          <span className="text-[#6B7280]">—</span>
        )}
      </td>
      <td className="px-4 py-3">
        <button onClick={onView} className="flex items-center gap-1 text-indigo-600 hover:text-indigo-700 text-sm">
          <Eye className="h-4 w-4" />
          View
        </button>
      </td>
    </tr>
  );
}

// ============ TAB 3: AGENT PERFORMANCE ============
function AgentPerformanceTab({
  leaderboardData,
}: {
  leaderboardData: ReturnType<typeof useGetAgentLeaderboardQuery>['data'];
}) {
  const getMedalIcon = (rank: number) => {
    switch (rank) {
      case 1:
        return <Trophy className="h-5 w-5 text-yellow-500" />;
      case 2:
        return <Medal className="h-5 w-5 text-gray-400" />;
      case 3:
        return <Medal className="h-5 w-5 text-amber-600" />;
      default:
        return <span className="text-[#9CA3AF] font-medium">{rank}</span>;
    }
  };

  const currentAgentId = leaderboardData?.currentAgentId;

  return (
    <div className="bg-[#162240] rounded-xl border border-[#1E3461]">
      <div className="p-4 border-b border-[#1E3461]">
        <h3 className="text-lg font-semibold text-[#F9FAFB] flex items-center gap-2">
          <Trophy className="h-5 w-5 text-yellow-500" />
          Agent QA Leaderboard
        </h3>
        {leaderboardData?.period && (
          <p className="text-sm text-[#9CA3AF] mt-1">
            {new Date(leaderboardData.period.start).toLocaleDateString()} –{' '}
            {new Date(leaderboardData.period.end).toLocaleDateString()}
          </p>
        )}
      </div>

      <div className="overflow-x-auto">
        <table className="w-full">
          <thead>
            <tr className="text-left text-xs text-[#9CA3AF] border-b border-[#1E3461]">
              <th className="px-4 py-3 font-medium w-16">Rank</th>
              <th className="px-4 py-3 font-medium">Agent</th>
              <th className="px-4 py-3 font-medium text-right">Avg QA Score</th>
              <th className="px-4 py-3 font-medium text-right">Tickets Handled</th>
              <th className="px-4 py-3 font-medium text-right">AI Draft Used</th>
              <th className="px-4 py-3 font-medium text-right">Trend</th>
            </tr>
          </thead>
          <tbody className="text-sm">
            {leaderboardData?.leaderboard.map((agent) => (
              <tr
                key={agent.agentId}
                className={`border-b border-[#1E3461]/50 ${
                  agent.agentId === currentAgentId ? 'bg-indigo-900/30' : 'hover:bg-[#0F1F3D]'
                }`}
              >
                <td className="px-4 py-4 text-center">{getMedalIcon(agent.rank)}</td>
                <td className="px-4 py-4">
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded-full bg-gradient-to-br from-indigo-500 to-purple-500 flex items-center justify-center text-white text-sm font-medium">
                      {agent.agentName.charAt(0)}
                    </div>
                    <div>
                      <p className="font-medium text-[#F9FAFB]">
                        {agent.agentName}
                        {agent.agentId === currentAgentId && (
                          <span className="ml-2 text-xs px-2 py-0.5 bg-indigo-900/50 text-indigo-400 rounded">You</span>
                        )}
                      </p>
                      <p className="text-xs text-[#9CA3AF]">{agent.agentEmail}</p>
                    </div>
                  </div>
                </td>
                <td className="px-4 py-4 text-right">
                  <span
                    className={`inline-flex items-center px-3 py-1 rounded-full text-sm font-bold ${
                      agent.avgScore >= 80
                        ? 'bg-green-100 text-green-700'
                        : agent.avgScore >= 60
                          ? 'bg-amber-100 text-amber-700'
                          : 'bg-red-100 text-red-700'
                    }`}
                  >
                    {agent.avgScore.toFixed(1)}
                  </span>
                </td>
                <td className="px-4 py-4 text-right text-[#9CA3AF]">{agent.totalInteractions}</td>
                <td className="px-4 py-4 text-right">
                  <div className="flex items-center justify-end gap-2">
                    <div className="w-20 h-2 bg-[#0F1F3D] rounded-full overflow-hidden">
                      <div
                        className="h-full bg-indigo-500 rounded-full"
                        style={{ width: `${agent.aiDraftUsagePercent}%` }}
                      />
                    </div>
                    <span className="text-[#9CA3AF] w-10 text-right">{agent.aiDraftUsagePercent}%</span>
                  </div>
                </td>
                <td className="px-4 py-4 text-right">
                  <span
                    className={`flex items-center justify-end gap-1 ${
                      agent.trend >= 0 ? 'text-green-600' : 'text-red-600'
                    }`}
                  >
                    {agent.trend >= 0 ? <TrendingUp className="h-4 w-4" /> : <TrendingDown className="h-4 w-4" />}
                    {agent.trend >= 0 ? '+' : ''}
                    {agent.trend.toFixed(1)}%
                  </span>
                </td>
              </tr>
            ))}
            {(!leaderboardData?.leaderboard || leaderboardData.leaderboard.length === 0) && (
              <tr>
                <td colSpan={6} className="px-4 py-8 text-center text-[#9CA3AF]">
                  No agent data available
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ============ DETAIL PANEL ============
function ReportDetailPanel({ reportId, onClose }: { reportId: string; onClose: () => void }) {
  const { data, isLoading, refetch } = useGetQAReportQuery(reportId);

  return (
    <div className="fixed inset-0 z-50 flex justify-end">
      {/* Backdrop */}
      <div className="fixed inset-0 bg-black/50" onClick={onClose} />

      {/* Panel */}
      <div className="relative w-full max-w-xl bg-[#162240] shadow-xl overflow-y-auto">
        <div className="sticky top-0 bg-[#162240] border-b border-[#1E3461] p-4 flex items-center justify-between z-10">
          <h2 className="text-lg font-semibold text-[#F9FAFB]">QA Report Details</h2>
          <button onClick={onClose} className="text-[#6B7280] hover:text-[#9CA3AF]">
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
            <p className="text-[#9CA3AF] text-center py-8">Report not found</p>
          )}
        </div>
      </div>
    </div>
  );
}
