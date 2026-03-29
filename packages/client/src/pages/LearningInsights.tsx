import { useState, useCallback } from 'react';
import {
  Brain,
  Lightbulb,
  MessageCircleQuestion,
  FlaskConical,
  ChevronRight,
  ChevronDown,
  TrendingUp,
  Plus,
  Check,
  X,
  Play,
  Pause,
  Trophy,
  Phone,
  MessageSquare,
  AlertCircle,
  Sparkles,
  RefreshCw,
  Calendar,
  BarChart3,
} from 'lucide-react';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Cell,
} from 'recharts';
import {
  useGetGapReportQuery,
  useGetGapsQuery,
  useResolveGapMutation,
  useGetFeedbackSummaryQuery,
  useGetAbTestsQuery,
  useActivateWinnerMutation,
  useStartAbTestMutation,
  usePauseAbTestMutation,
  type KBGap,
  type PromptVariant,
} from '../api/learningApi';

type TabType = 'gaps' | 'feedback' | 'abtests';

export default function LearningInsights() {
  const [activeTab, setActiveTab] = useState<TabType>('gaps');
  const [expandedGapId, setExpandedGapId] = useState<string | null>(null);
  const [gapAnswer, setGapAnswer] = useState('');
  const [showResolvedGaps, setShowResolvedGaps] = useState(false);

  // Fetch data
  const { data: gapReportData, refetch: refetchReport } = useGetGapReportQuery();
  const { data: openGapsData, refetch: refetchOpenGaps } = useGetGapsQuery({ status: 'open', limit: 50 });
  const { data: resolvedGapsData } = useGetGapsQuery({ status: 'resolved', limit: 20 });
  const { data: feedbackData } = useGetFeedbackSummaryQuery({ days: 30 });
  const { data: abTestsData, refetch: refetchTests } = useGetAbTestsQuery();

  const [resolveGap, { isLoading: isResolving }] = useResolveGapMutation();
  const [activateWinner] = useActivateWinnerMutation();
  const [startTest] = useStartAbTestMutation();
  const [pauseTest] = usePauseAbTestMutation();

  const report = gapReportData?.report;
  const openGaps = openGapsData?.gaps || [];
  const resolvedGaps = resolvedGapsData?.gaps || [];

  const handleRefresh = useCallback(() => {
    refetchReport();
    refetchOpenGaps();
    refetchTests();
  }, [refetchReport, refetchOpenGaps, refetchTests]);

  const handleExpandGap = useCallback((id: string) => {
    setExpandedGapId(expandedGapId === id ? null : id);
    setGapAnswer('');
  }, [expandedGapId]);

  const handleResolveGap = useCallback(async (gap: KBGap, addToKB: boolean) => {
    try {
      await resolveGap({
        id: gap._id,
        data: {
          answer: gapAnswer || undefined,
          addToKB,
          markResolved: true,
          title: gap.query.slice(0, 100),
        },
      }).unwrap();
      setExpandedGapId(null);
      setGapAnswer('');
    } catch (error) {
      console.error('Failed to resolve gap:', error);
    }
  }, [resolveGap, gapAnswer]);

  const handleActivateWinner = useCallback(async (testId: string) => {
    try {
      await activateWinner(testId).unwrap();
    } catch (error) {
      console.error('Failed to activate winner:', error);
    }
  }, [activateWinner]);

  const handleToggleTest = useCallback(async (test: PromptVariant) => {
    try {
      if (test.status === 'running') {
        await pauseTest(test._id).unwrap();
      } else if (test.status === 'draft' || test.status === 'paused') {
        await startTest(test._id).unwrap();
      }
    } catch (error) {
      console.error('Failed to toggle test:', error);
    }
  }, [startTest, pauseTest]);

  // Summary stats
  const stats = {
    gapsIdentified: report?.gapStats?.totalGaps || openGaps.length,
    gapsResolved: report?.gapStats?.resolvedGaps || resolvedGaps.length,
    feedbackEvents: feedbackData?.totalEvents || 0,
    abTests: (abTestsData?.activeTests?.length || 0) + (abTestsData?.pastTests?.length || 0),
  };

  // Feedback chart data
  const feedbackChartData = feedbackData?.byIssueType?.slice(0, 8).map((item) => ({
    name: formatIssueType(item.issueType),
    count: item.count,
    rating: item.avgRating,
  })) || [];

  return (
    <div className="min-h-screen bg-gray-50 p-6">
      {/* Header */}
      <div className="mb-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold text-gray-900 flex items-center gap-3">
              <Brain className="h-8 w-8 text-purple-600" />
              Learning & Insights
            </h1>
            <p className="text-gray-500 mt-1">
              Continuous improvement through AI feedback and gap analysis
            </p>
          </div>
          <button
            onClick={handleRefresh}
            className="flex items-center gap-2 px-4 py-2 bg-white border border-gray-200 rounded-lg hover:bg-gray-50"
          >
            <RefreshCw className="h-4 w-4" />
            Refresh
          </button>
        </div>
      </div>

      {/* Week Summary Banner */}
      <div className="mb-6 bg-purple-50 border border-purple-200 rounded-xl p-4">
        <div className="flex items-center gap-6 text-purple-900">
          <div className="flex items-center gap-2">
            <Sparkles className="h-5 w-5 text-purple-600" />
            <span className="font-medium">This Week Summary</span>
          </div>
          <div className="flex-1 flex items-center gap-6 text-sm">
            <span>{stats.gapsIdentified} gaps identified</span>
            <span className="text-purple-400">|</span>
            <span>{stats.gapsResolved} resolved</span>
            <span className="text-purple-400">|</span>
            <span>{stats.feedbackEvents} feedback events</span>
            <span className="text-purple-400">|</span>
            <span>{stats.abTests} A/B tests</span>
          </div>
          {report?.weekLabel && (
            <div className="text-sm text-purple-600 flex items-center gap-1">
              <Calendar className="h-4 w-4" />
              {report.weekLabel}
            </div>
          )}
        </div>
      </div>

      {/* Tabs */}
      <div className="mb-6 border-b border-gray-200">
        <nav className="flex gap-6">
          <TabButton
            active={activeTab === 'gaps'}
            onClick={() => setActiveTab('gaps')}
            icon={<MessageCircleQuestion className="h-4 w-4" />}
            label="KB Gaps"
            badge={openGaps.length}
          />
          <TabButton
            active={activeTab === 'feedback'}
            onClick={() => setActiveTab('feedback')}
            icon={<Lightbulb className="h-4 w-4" />}
            label="Agent Feedback"
            badge={feedbackData?.totalEvents}
          />
          <TabButton
            active={activeTab === 'abtests'}
            onClick={() => setActiveTab('abtests')}
            icon={<FlaskConical className="h-4 w-4" />}
            label="A/B Tests"
            badge={abTestsData?.activeTests?.length}
          />
        </nav>
      </div>

      {/* Tab Content */}
      {activeTab === 'gaps' && (
        <KBGapsTab
          openGaps={openGaps}
          resolvedGaps={resolvedGaps}
          expandedGapId={expandedGapId}
          gapAnswer={gapAnswer}
          showResolvedGaps={showResolvedGaps}
          isResolving={isResolving}
          onExpandGap={handleExpandGap}
          onGapAnswerChange={setGapAnswer}
          onResolveGap={handleResolveGap}
          onToggleResolved={() => setShowResolvedGaps(!showResolvedGaps)}
        />
      )}

      {activeTab === 'feedback' && (
        <FeedbackTab
          feedbackData={feedbackData}
          chartData={feedbackChartData}
        />
      )}

      {activeTab === 'abtests' && (
        <ABTestsTab
          activeTests={abTestsData?.activeTests || []}
          pastTests={abTestsData?.pastTests || []}
          onActivateWinner={handleActivateWinner}
          onToggleTest={handleToggleTest}
        />
      )}
    </div>
  );
}

// ============================================================================
// TAB BUTTON COMPONENT
// ============================================================================

function TabButton({
  active,
  onClick,
  icon,
  label,
  badge,
}: {
  active: boolean;
  onClick: () => void;
  icon: React.ReactNode;
  label: string;
  badge?: number;
}) {
  return (
    <button
      onClick={onClick}
      className={`flex items-center gap-2 px-4 py-3 border-b-2 transition-colors ${
        active
          ? 'border-purple-600 text-purple-600'
          : 'border-transparent text-gray-500 hover:text-gray-700'
      }`}
    >
      {icon}
      <span className="font-medium">{label}</span>
      {badge !== undefined && badge > 0 && (
        <span className={`px-2 py-0.5 text-xs rounded-full ${
          active ? 'bg-purple-100 text-purple-700' : 'bg-gray-100 text-gray-600'
        }`}>
          {badge}
        </span>
      )}
    </button>
  );
}

// ============================================================================
// KB GAPS TAB
// ============================================================================

function KBGapsTab({
  openGaps,
  resolvedGaps,
  expandedGapId,
  gapAnswer,
  showResolvedGaps,
  isResolving,
  onExpandGap,
  onGapAnswerChange,
  onResolveGap,
  onToggleResolved,
}: {
  openGaps: KBGap[];
  resolvedGaps: KBGap[];
  expandedGapId: string | null;
  gapAnswer: string;
  showResolvedGaps: boolean;
  isResolving: boolean;
  onExpandGap: (id: string) => void;
  onGapAnswerChange: (value: string) => void;
  onResolveGap: (gap: KBGap, addToKB: boolean) => void;
  onToggleResolved: () => void;
}) {
  return (
    <div className="space-y-6">
      {/* Title */}
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold text-gray-900">
          Top Unanswered Queries This Week
        </h2>
      </div>

      {/* Open Gaps Table */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
        <table className="w-full">
          <thead className="bg-gray-50 border-b border-gray-200">
            <tr>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                Rank
              </th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                Query
              </th>
              <th className="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase">
                Times Asked
              </th>
              <th className="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase">
                Channel
              </th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                First Asked
              </th>
              <th className="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase">
                Action
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-200">
            {openGaps.length === 0 ? (
              <tr>
                <td colSpan={6} className="px-4 py-8 text-center text-gray-500">
                  No unanswered queries found 🎉
                </td>
              </tr>
            ) : (
              openGaps.map((gap, index) => (
                <GapRow
                  key={gap._id}
                  gap={gap}
                  rank={index + 1}
                  isExpanded={expandedGapId === gap._id}
                  gapAnswer={gapAnswer}
                  isResolving={isResolving}
                  onExpand={() => onExpandGap(gap._id)}
                  onAnswerChange={onGapAnswerChange}
                  onResolve={(addToKB) => onResolveGap(gap, addToKB)}
                />
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* Resolved Gaps Section */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
        <button
          onClick={onToggleResolved}
          className="w-full px-4 py-3 flex items-center justify-between hover:bg-gray-50"
        >
          <span className="text-sm font-medium text-gray-700">
            Resolved This Week ({resolvedGaps.length})
          </span>
          {showResolvedGaps ? (
            <ChevronDown className="h-4 w-4 text-gray-400" />
          ) : (
            <ChevronRight className="h-4 w-4 text-gray-400" />
          )}
        </button>
        {showResolvedGaps && (
          <div className="border-t border-gray-200">
            {resolvedGaps.length === 0 ? (
              <div className="px-4 py-4 text-center text-gray-500 text-sm">
                No resolved gaps yet
              </div>
            ) : (
              <ul className="divide-y divide-gray-100">
                {resolvedGaps.map((gap) => (
                  <li key={gap._id} className="px-4 py-3 flex items-center justify-between">
                    <div className="flex-1">
                      <p className="text-sm text-gray-700 line-clamp-1">{gap.query}</p>
                      <p className="text-xs text-gray-400 mt-0.5">
                        Resolved {new Date(gap.resolution?.resolvedAt || '').toLocaleDateString()}
                      </p>
                    </div>
                    <Check className="h-4 w-4 text-green-500" />
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

function GapRow({
  gap,
  rank,
  isExpanded,
  gapAnswer,
  isResolving,
  onExpand,
  onAnswerChange,
  onResolve,
}: {
  gap: KBGap;
  rank: number;
  isExpanded: boolean;
  gapAnswer: string;
  isResolving: boolean;
  onExpand: () => void;
  onAnswerChange: (value: string) => void;
  onResolve: (addToKB: boolean) => void;
}) {
  return (
    <>
      <tr className={isExpanded ? 'bg-purple-50' : 'hover:bg-gray-50'}>
        <td className="px-4 py-3 text-sm font-medium text-gray-500">#{rank}</td>
        <td className="px-4 py-3 text-sm text-gray-900 max-w-md">
          <p className="line-clamp-2">{gap.query}</p>
        </td>
        <td className="px-4 py-3 text-center">
          <span className="inline-flex items-center px-2 py-1 bg-amber-100 text-amber-700 text-sm font-medium rounded-full">
            {gap.frequency}x
          </span>
        </td>
        <td className="px-4 py-3 text-center">
          {gap.channel === 'voice' ? (
            <Phone className="h-4 w-4 text-blue-500 mx-auto" />
          ) : (
            <MessageSquare className="h-4 w-4 text-green-500 mx-auto" />
          )}
        </td>
        <td className="px-4 py-3 text-sm text-gray-500">
          {new Date(gap.firstOccurredAt).toLocaleDateString()}
        </td>
        <td className="px-4 py-3 text-center">
          <button
            onClick={onExpand}
            className="inline-flex items-center gap-1 px-3 py-1.5 bg-purple-100 text-purple-700 text-sm font-medium rounded-lg hover:bg-purple-200"
          >
            <Plus className="h-3 w-3" />
            Add Answer
          </button>
        </td>
      </tr>
      {isExpanded && (
        <tr>
          <td colSpan={6} className="px-4 py-4 bg-purple-50 border-t border-purple-100">
            <div className="space-y-3">
              <textarea
                value={gapAnswer}
                onChange={(e) => onAnswerChange(e.target.value)}
                placeholder="Enter the answer to add to the knowledge base..."
                className="w-full px-3 py-2 border border-purple-200 rounded-lg resize-none focus:ring-2 focus:ring-purple-500 focus:border-purple-500"
                rows={3}
              />
              <div className="flex items-center gap-3">
                <button
                  onClick={() => onResolve(true)}
                  disabled={!gapAnswer.trim() || isResolving}
                  className="inline-flex items-center gap-2 px-4 py-2 bg-purple-600 text-white text-sm font-medium rounded-lg hover:bg-purple-700 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  <Check className="h-4 w-4" />
                  Save to KB
                </button>
                <button
                  onClick={() => onResolve(false)}
                  disabled={isResolving}
                  className="inline-flex items-center gap-2 px-4 py-2 text-gray-600 text-sm font-medium hover:text-gray-800"
                >
                  Mark Resolved (no KB needed)
                </button>
                <button
                  onClick={onExpand}
                  className="ml-auto text-gray-400 hover:text-gray-600"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
            </div>
          </td>
        </tr>
      )}
    </>
  );
}

// ============================================================================
// FEEDBACK TAB
// ============================================================================

function FeedbackTab({
  feedbackData,
  chartData,
}: {
  feedbackData: ReturnType<typeof useGetFeedbackSummaryQuery>['data'];
  chartData: Array<{ name: string; count: number; rating: number }>;
}) {
  const barColors = ['#7c3aed', '#8b5cf6', '#a78bfa', '#c4b5fd', '#ddd6fe', '#ede9fe', '#f5f3ff', '#faf5ff'];

  return (
    <div className="grid grid-cols-2 gap-6">
      {/* Left: Chart */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
        <h3 className="text-lg font-semibold text-gray-900 mb-4 flex items-center gap-2">
          <BarChart3 className="h-5 w-5 text-purple-600" />
          Feedback by Issue Type (30 days)
        </h3>
        <div className="h-80">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart
              data={chartData}
              layout="vertical"
              margin={{ top: 10, right: 30, left: 100, bottom: 10 }}
            >
              <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" horizontal />
              <XAxis type="number" tick={{ fill: '#6b7280', fontSize: 12 }} />
              <YAxis
                type="category"
                dataKey="name"
                tick={{ fill: '#374151', fontSize: 12 }}
                width={90}
              />
              <Tooltip
                contentStyle={{
                  backgroundColor: '#162240',
                  border: 'none',
                  borderRadius: '8px',
                  color: '#fff',
                }}
                formatter={(value: number) => [value, 'Count']}
              />
              <Bar dataKey="count" radius={[0, 4, 4, 0]}>
                {chartData.map((_, index) => (
                  <Cell key={`cell-${index}`} fill={barColors[index % barColors.length]} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Right: Feedback Feed */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
        <h3 className="text-lg font-semibold text-gray-900 mb-4">
          Recent Feedback Events
        </h3>
        <div className="space-y-3 max-h-96 overflow-y-auto">
          {feedbackData?.recentEvents?.length === 0 ? (
            <p className="text-center text-gray-500 py-8">No feedback events yet</p>
          ) : (
            feedbackData?.recentEvents?.slice(0, 20).map((event) => (
              <div
                key={event._id}
                className="flex items-start gap-3 p-3 bg-gray-50 rounded-lg"
              >
                <div className="flex-shrink-0">
                  {event.channel === 'voice' ? (
                    <div className="p-2 bg-blue-100 rounded-full">
                      <Phone className="h-4 w-4 text-blue-600" />
                    </div>
                  ) : (
                    <div className="p-2 bg-green-100 rounded-full">
                      <MessageSquare className="h-4 w-4 text-green-600" />
                    </div>
                  )}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    {event.issueType && (
                      <span className="px-2 py-0.5 bg-amber-100 text-amber-700 text-xs font-medium rounded">
                        {formatIssueType(event.issueType)}
                      </span>
                    )}
                    <span className="text-xs text-gray-400">
                      {new Date(event.createdAt).toLocaleDateString()}
                    </span>
                  </div>
                  {event.notes && (
                    <p className="text-sm text-gray-600 mt-1 line-clamp-2">{event.notes}</p>
                  )}
                  <div className="flex items-center gap-1 mt-1">
                    {[1, 2, 3, 4, 5].map((star) => (
                      <span
                        key={star}
                        className={`text-sm ${
                          star <= event.rating ? 'text-yellow-400' : 'text-gray-300'
                        }`}
                      >
                        ★
                      </span>
                    ))}
                  </div>
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}

// ============================================================================
// A/B TESTS TAB
// ============================================================================

function ABTestsTab({
  activeTests,
  pastTests,
  onActivateWinner,
  onToggleTest,
}: {
  activeTests: PromptVariant[];
  pastTests: PromptVariant[];
  onActivateWinner: (id: string) => void;
  onToggleTest: (test: PromptVariant) => void;
}) {
  return (
    <div className="space-y-6">
      {/* Active Tests */}
      <div>
        <h3 className="text-lg font-semibold text-gray-900 mb-4">Active Tests</h3>
        {activeTests.length === 0 ? (
          <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-8 text-center">
            <FlaskConical className="h-12 w-12 text-gray-300 mx-auto mb-3" />
            <p className="text-gray-500">No active A/B tests</p>
            <p className="text-sm text-gray-400 mt-1">
              Create a new test to experiment with prompt variations
            </p>
          </div>
        ) : (
          <div className="space-y-4">
            {activeTests.map((test) => (
              <ActiveTestCard
                key={test._id}
                test={test}
                onActivateWinner={() => onActivateWinner(test._id)}
                onToggle={() => onToggleTest(test)}
              />
            ))}
          </div>
        )}
      </div>

      {/* Past Tests */}
      {pastTests.length > 0 && (
        <div>
          <h3 className="text-lg font-semibold text-gray-900 mb-4">Past Tests</h3>
          <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
            <table className="w-full">
              <thead className="bg-gray-50 border-b border-gray-200">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                    Name
                  </th>
                  <th className="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase">
                    Winner
                  </th>
                  <th className="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase">
                    Improvement
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                    Date Concluded
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200">
                {pastTests.map((test) => (
                  <tr key={test._id} className="hover:bg-gray-50">
                    <td className="px-4 py-3 text-sm font-medium text-gray-900">
                      {test.name}
                    </td>
                    <td className="px-4 py-3 text-center">
                      {test.winner ? (
                        <span className="inline-flex items-center gap-1 px-2 py-1 bg-green-100 text-green-700 text-sm font-medium rounded-full">
                          <Trophy className="h-3 w-3" />
                          Variant {test.winner}
                        </span>
                      ) : (
                        <span className="text-gray-400">—</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-center">
                      {test.winnerDelta ? (
                        <span className="inline-flex items-center gap-1 text-green-600 font-medium">
                          <TrendingUp className="h-4 w-4" />
                          +{test.winnerDelta.toFixed(1)}%
                        </span>
                      ) : (
                        <span className="text-gray-400">—</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-500">
                      {test.endDate
                        ? new Date(test.endDate).toLocaleDateString()
                        : '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}

function ActiveTestCard({
  test,
  onActivateWinner,
  onToggle,
}: {
  test: PromptVariant;
  onActivateWinner: () => void;
  onToggle: () => void;
}) {
  const leading = test.leading || (test.variantA.resolutionRate > test.variantB.resolutionRate ? 'A' : 'B');
  const delta = test.delta || Math.abs(test.variantA.resolutionRate - test.variantB.resolutionRate);
  const confidence = test.calculatedConfidence || test.confidenceLevel || 0;

  return (
    <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
      <div className="flex items-start justify-between mb-4">
        <div>
          <h4 className="text-lg font-semibold text-gray-900">{test.name}</h4>
          <p className="text-sm text-gray-500 mt-1">{test.description}</p>
        </div>
        <div className="flex items-center gap-2">
          {test.status === 'running' && (
            <span className="px-2 py-1 bg-green-100 text-green-700 text-xs font-medium rounded-full flex items-center gap-1">
              <span className="w-2 h-2 bg-green-500 rounded-full animate-pulse" />
              Running
            </span>
          )}
          {test.status === 'winner_identified' && (
            <span className="px-2 py-1 bg-amber-100 text-amber-700 text-xs font-medium rounded-full flex items-center gap-1">
              <AlertCircle className="h-3 w-3" />
              Winner Found
            </span>
          )}
        </div>
      </div>

      {/* Variant Comparison */}
      <div className="grid grid-cols-2 gap-4 mb-4">
        <VariantCard
          variant="A"
          description={test.variantA.description}
          calls={test.variantA.calls}
          rate={test.variantA.resolutionRate}
          isLeading={leading === 'A'}
        />
        <VariantCard
          variant="B"
          description={test.variantB.description}
          calls={test.variantB.calls}
          rate={test.variantB.resolutionRate}
          isLeading={leading === 'B'}
        />
      </div>

      {/* Status Line */}
      <div className="flex items-center justify-between pt-4 border-t border-gray-200">
        <div className="text-sm">
          {delta > 0 ? (
            <span className="text-gray-600">
              Variant {leading} leading by{' '}
              <span className="font-semibold text-green-600">{delta.toFixed(1)}%</span>
              {confidence > 0 && (
                <span className="text-gray-400 ml-2">— {confidence}% confidence</span>
              )}
            </span>
          ) : (
            <span className="text-gray-500">No significant difference yet</span>
          )}
        </div>
        <div className="flex items-center gap-2">
          {test.status === 'running' && (
            <button
              onClick={onToggle}
              className="inline-flex items-center gap-1 px-3 py-1.5 text-gray-600 text-sm hover:text-gray-800"
            >
              <Pause className="h-4 w-4" />
              Pause
            </button>
          )}
          {(test.status === 'draft' || test.status === 'paused') && (
            <button
              onClick={onToggle}
              className="inline-flex items-center gap-1 px-3 py-1.5 text-purple-600 text-sm hover:text-purple-800"
            >
              <Play className="h-4 w-4" />
              Start
            </button>
          )}
          {(test.status === 'winner_identified' || (delta > 5 && confidence >= 90)) && (
            <button
              onClick={onActivateWinner}
              className="inline-flex items-center gap-2 px-4 py-2 bg-green-600 text-white text-sm font-medium rounded-lg hover:bg-green-700"
            >
              <Trophy className="h-4 w-4" />
              Activate Winner
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

function VariantCard({
  variant,
  description,
  calls,
  rate,
  isLeading,
}: {
  variant: 'A' | 'B';
  description?: string;
  calls: number;
  rate: number;
  isLeading: boolean;
}) {
  return (
    <div
      className={`p-4 rounded-lg border-2 ${
        isLeading ? 'border-green-300 bg-green-50' : 'border-gray-200 bg-gray-50'
      }`}
    >
      <div className="flex items-center justify-between mb-2">
        <span className="font-semibold text-gray-900">Variant {variant}</span>
        {isLeading && (
          <Trophy className="h-4 w-4 text-green-600" />
        )}
      </div>
      {description && (
        <p className="text-xs text-gray-500 mb-3 line-clamp-2">{description}</p>
      )}
      <div className="grid grid-cols-2 gap-2 text-sm">
        <div>
          <span className="text-gray-500">Calls:</span>
          <span className="ml-2 font-medium">{calls.toLocaleString()}</span>
        </div>
        <div>
          <span className="text-gray-500">Rate:</span>
          <span className="ml-2 font-medium">{rate.toFixed(1)}%</span>
        </div>
      </div>
    </div>
  );
}

// ============================================================================
// HELPERS
// ============================================================================

function formatIssueType(type: string): string {
  return type
    .replace(/_/g, ' ')
    .replace(/\b\w/g, (c) => c.toUpperCase());
}
