import React, { useState, useMemo } from 'react';
import {
  Download,
  Calendar,
  TrendingUp,
  DollarSign,
  Clock,
  Activity,
  AlertTriangle,
  CheckCircle,
  Phone,
  Ticket,
  MessageSquare,
  HelpCircle,
} from 'lucide-react';
import {
  AreaChart,
  Area,
  BarChart,
  Bar,
  LineChart,
  Line,
  PieChart,
  Pie,
  Cell,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
} from 'recharts';
import {
  useGetFullAnalyticsQuery,
  type DailyResolutionRate,
  type DailyTicketVolume,
  type TopIntent,
  type SentimentTrend,
  type SLACompliance,
} from '../api/analyticsApi';
import StatCard from '../components/StatCard';

// Chart theme
const CHART_THEME = {
  bg: '#162240',
  grid: '#1E3461',
  axisLabel: '#9CA3AF',
  primary: '#3B82F6',
  secondary: '#0F766E',
  amber: '#F59E0B',
  green: '#10B981',
  red: '#EF4444',
};

// Tooltip styles
const tooltipStyle = {
  backgroundColor: '#1E293B',
  border: '1px solid #334155',
  borderRadius: '8px',
  color: '#fff',
};

// Date range options
const DATE_RANGES = [
  { label: '7D', value: 7 },
  { label: '30D', value: 30 },
  { label: '90D', value: 90 },
];

// Donut chart colors
const CHANNEL_COLORS = ['#3B82F6', '#0F766E', '#F59E0B', '#9333EA'];

// Format duration from seconds
function formatDuration(seconds: number): string {
  if (seconds < 60) return `${seconds}s`;
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ${seconds % 60}s`;
  const hrs = Math.floor(seconds / 3600);
  const mins = Math.floor((seconds % 3600) / 60);
  return `${hrs}h ${mins}m`;
}

// Format currency
function formatCurrency(value: number): string {
  if (value >= 1000) {
    return `$${(value / 1000).toFixed(1)}k`;
  }
  return `$${value.toFixed(0)}`;
}

export function AnalyticsDashboard(): React.ReactElement {
  const [days, setDays] = useState(30);

  const { data: analytics, isLoading, error } = useGetFullAnalyticsQuery({ days });

  // Process ticket volume for stacked bar chart
  const ticketVolumeData = useMemo(() => {
    if (!analytics?.ticketVolume) return [];

    // Group by date
    const byDate = new Map<string, Record<string, number>>();
    for (const item of analytics.ticketVolume) {
      const existing = byDate.get(item.date) || {};
      existing[item.category] = (existing[item.category] || 0) + item.count;
      byDate.set(item.date, existing);
    }

    // Get all unique categories
    const categories = new Set<string>();
    for (const item of analytics.ticketVolume) {
      categories.add(item.category);
    }

    return Array.from(byDate.entries()).map(([date, counts]) => ({
      date: date.slice(5), // MM-DD format
      ...counts,
    }));
  }, [analytics?.ticketVolume]);

  // Get unique categories for bar chart
  const ticketCategories = useMemo(() => {
    if (!analytics?.ticketVolume) return [];
    const cats = new Set(analytics.ticketVolume.map((v) => v.category));
    return Array.from(cats).slice(0, 5); // Top 5 categories
  }, [analytics?.ticketVolume]);

  // Process resolution rate for area chart
  const resolutionData = useMemo(() => {
    if (!analytics?.resolutionRate) return [];
    return analytics.resolutionRate.map((item) => ({
      date: item.date.slice(5),
      resolved: item.resolvedByAI,
      escalated: item.escalated,
      rate: Math.round(item.resolutionRate),
    }));
  }, [analytics?.resolutionRate]);

  // Process sentiment for line chart
  const sentimentData = useMemo(() => {
    if (!analytics?.sentimentTrend) return [];
    return analytics.sentimentTrend.map((item) => ({
      date: item.date.slice(5),
      voice: Math.round((item.voiceAvg + 1) * 50), // Convert -1 to 1 → 0 to 100
      text: Math.round((item.textAvg + 1) * 50),
    }));
  }, [analytics?.sentimentTrend]);

  // Export CSV
  const handleExport = () => {
    if (!analytics) return;

    const rows = [
      ['Section', 'Metric', 'Value'],
      // Summary
      ['Summary', 'AI Resolution Rate', `${analytics.summary.aiResolutionRate}%`],
      ['Summary', 'Total Interactions', String(analytics.summary.totalInteractions)],
      ['Summary', 'Cost Saved', `$${analytics.costSavings.total}`],
      ['Summary', 'Avg Handle Time', `${analytics.summary.avgHandleTime}s`],
      // Resolution rates
      ...analytics.resolutionRate.map((r) => [
        'Resolution Rate',
        r.date,
        `${r.resolutionRate.toFixed(1)}%`,
      ]),
      // SLA compliance
      ...Object.entries(analytics.slaCompliance).map(([priority, data]) => [
        'SLA Compliance',
        priority,
        `${data.rate}% (${data.total - data.breached}/${data.total})`,
      ]),
    ];

    const csv = rows.map((row) => row.map((cell) => `"${cell}"`).join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `analytics-${days}d-${new Date().toISOString().split('T')[0]}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  if (isLoading) {
    return (
      <div className="min-h-screen bg-gray-50 p-6">
        <div className="max-w-7xl mx-auto">
          <div className="animate-pulse">
            <div className="h-8 bg-gray-200 rounded w-48 mb-6" />
            <div className="grid grid-cols-4 gap-4 mb-6">
              {[...Array(4)].map((_, i) => (
                <div key={i} className="h-32 bg-gray-200 rounded-xl" />
              ))}
            </div>
            <div className="grid grid-cols-2 gap-6">
              <div className="h-64 bg-gray-200 rounded-xl" />
              <div className="h-64 bg-gray-200 rounded-xl" />
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (error || !analytics) {
    return (
      <div className="min-h-screen bg-gray-50 p-6 flex items-center justify-center">
        <div className="text-center">
          <AlertTriangle className="w-12 h-12 text-red-400 mx-auto mb-4" />
          <p className="text-gray-600">Failed to load analytics</p>
        </div>
      </div>
    );
  }

  const { summary, costSavings, topIntents, slaCompliance, kbHealth, channelDistribution } = analytics;

  return (
    <div className="min-h-screen bg-gray-50 p-6">
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Analytics Dashboard</h1>
            <p className="text-gray-500 mt-1">
              Last updated: {new Date(analytics.cachedAt).toLocaleString()}
            </p>
          </div>

          <div className="flex items-center gap-4">
            {/* Date range tabs */}
            <div className="flex bg-white border border-gray-200 rounded-lg p-1">
              {DATE_RANGES.map((range) => (
                <button
                  key={range.value}
                  onClick={() => setDays(range.value)}
                  className={`px-4 py-1.5 text-sm font-medium rounded-md transition-colors ${
                    days === range.value
                      ? 'bg-blue-600 text-white'
                      : 'text-gray-600 hover:bg-gray-50'
                  }`}
                >
                  {range.label}
                </button>
              ))}
            </div>

            {/* Export button */}
            <button
              onClick={handleExport}
              className="inline-flex items-center gap-2 px-4 py-2 bg-white border border-gray-200 rounded-lg text-gray-700 hover:bg-gray-50"
            >
              <Download className="w-4 h-4" />
              Export Report
            </button>
          </div>
        </div>

        {/* ROW 1: Stat Cards */}
        <div className="grid grid-cols-4 gap-4 mb-6">
          <StatCard
            value={summary.aiResolutionRate}
            label="AI Resolution Rate"
            accent="blue"
            suffix="%"
            subtitle="Resolved without human"
          />
          <StatCard
            value={summary.totalInteractions}
            label="Total Interactions"
            accent="teal"
            subtitle={`${summary.callCount} calls, ${summary.ticketCount} tickets`}
          />
          <StatCard
            value={costSavings.total}
            label="Cost Saved"
            accent="green"
            prefix="$"
            subtitle={`Voice: $${costSavings.callSavings} | Text: $${costSavings.ticketSavings}`}
          />
          <StatCard
            value={summary.avgHandleTime}
            label="Avg Handle Time"
            accent="amber"
            suffix="s"
            subtitle={formatDuration(summary.avgHandleTime)}
          />
        </div>

        {/* ROW 2: Resolution Rate + Ticket Volume */}
        <div className="grid grid-cols-12 gap-6 mb-6">
          {/* Resolution Rate Area Chart */}
          <div className="col-span-7 bg-[#162240] rounded-xl p-5">
            <h3 className="text-lg font-semibold text-white mb-4">Resolution Rate</h3>
            <div className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={resolutionData}>
                  <defs>
                    <linearGradient id="resolvedGradient" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor={CHART_THEME.primary} stopOpacity={0.4} />
                      <stop offset="95%" stopColor={CHART_THEME.primary} stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke={CHART_THEME.grid} />
                  <XAxis dataKey="date" stroke={CHART_THEME.axisLabel} tick={{ fontSize: 12 }} />
                  <YAxis stroke={CHART_THEME.axisLabel} tick={{ fontSize: 12 }} />
                  <Tooltip contentStyle={tooltipStyle} />
                  <Area
                    type="monotone"
                    dataKey="resolved"
                    name="Resolved by AI"
                    stroke={CHART_THEME.primary}
                    fill="url(#resolvedGradient)"
                    strokeWidth={2}
                    animationDuration={500}
                  />
                  <Line
                    type="monotone"
                    dataKey="escalated"
                    name="Escalated"
                    stroke={CHART_THEME.amber}
                    strokeWidth={2}
                    dot={false}
                    animationDuration={500}
                  />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* Ticket Volume Stacked Bar Chart */}
          <div className="col-span-5 bg-[#162240] rounded-xl p-5">
            <h3 className="text-lg font-semibold text-white mb-4">Ticket Volume</h3>
            <div className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={ticketVolumeData}>
                  <CartesianGrid strokeDasharray="3 3" stroke={CHART_THEME.grid} />
                  <XAxis dataKey="date" stroke={CHART_THEME.axisLabel} tick={{ fontSize: 11 }} />
                  <YAxis stroke={CHART_THEME.axisLabel} tick={{ fontSize: 12 }} />
                  <Tooltip contentStyle={tooltipStyle} />
                  {ticketCategories.map((cat, idx) => (
                    <Bar
                      key={cat}
                      dataKey={cat}
                      stackId="a"
                      fill={CHANNEL_COLORS[idx % CHANNEL_COLORS.length]}
                      animationDuration={500}
                    />
                  ))}
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>
        </div>

        {/* ROW 3: Top Intents + Sentiment Trend + Channel Split */}
        <div className="grid grid-cols-3 gap-6 mb-6">
          {/* Top Intents */}
          <div className="bg-[#162240] rounded-xl p-5">
            <h3 className="text-lg font-semibold text-white mb-4">Top Intents</h3>
            <div className="h-52">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={topIntents.slice(0, 8)} layout="vertical">
                  <CartesianGrid strokeDasharray="3 3" stroke={CHART_THEME.grid} />
                  <XAxis type="number" stroke={CHART_THEME.axisLabel} tick={{ fontSize: 11 }} />
                  <YAxis
                    dataKey="intent"
                    type="category"
                    stroke={CHART_THEME.axisLabel}
                    tick={{ fontSize: 11 }}
                    width={100}
                  />
                  <Tooltip contentStyle={tooltipStyle} />
                  <Bar dataKey="count" fill={CHART_THEME.primary} animationDuration={500} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* Sentiment Trend */}
          <div className="bg-[#162240] rounded-xl p-5">
            <h3 className="text-lg font-semibold text-white mb-4">Sentiment Trend</h3>
            <div className="h-52">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={sentimentData}>
                  <CartesianGrid strokeDasharray="3 3" stroke={CHART_THEME.grid} />
                  <XAxis dataKey="date" stroke={CHART_THEME.axisLabel} tick={{ fontSize: 11 }} />
                  <YAxis stroke={CHART_THEME.axisLabel} tick={{ fontSize: 12 }} domain={[0, 100]} />
                  <Tooltip contentStyle={tooltipStyle} />
                  <Line
                    type="monotone"
                    dataKey="voice"
                    name="Voice"
                    stroke={CHART_THEME.secondary}
                    strokeWidth={2}
                    dot={false}
                    animationDuration={500}
                  />
                  <Line
                    type="monotone"
                    dataKey="text"
                    name="Text"
                    stroke={CHART_THEME.primary}
                    strokeWidth={2}
                    dot={false}
                    animationDuration={500}
                  />
                  <Legend wrapperStyle={{ color: '#9CA3AF' }} />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* Channel Split Donut */}
          <div className="bg-[#162240] rounded-xl p-5">
            <h3 className="text-lg font-semibold text-white mb-4">Channel Distribution</h3>
            <div className="h-52 flex items-center justify-center">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={channelDistribution}
                    dataKey="count"
                    nameKey="channel"
                    cx="50%"
                    cy="50%"
                    innerRadius={45}
                    outerRadius={70}
                    paddingAngle={2}
                    animationDuration={500}
                  >
                    {channelDistribution.map((_, idx) => (
                      <Cell key={idx} fill={CHANNEL_COLORS[idx % CHANNEL_COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip contentStyle={tooltipStyle} />
                  <Legend wrapperStyle={{ color: '#9CA3AF', fontSize: 12 }} />
                </PieChart>
              </ResponsiveContainer>
            </div>
          </div>
        </div>

        {/* ROW 4: SLA Compliance + Cost Savings */}
        <div className="grid grid-cols-2 gap-6 mb-6">
          {/* SLA Compliance Table */}
          <div className="bg-white rounded-xl border border-gray-200 p-5">
            <h3 className="text-lg font-semibold text-gray-900 mb-4">SLA Compliance</h3>
            <table className="w-full">
              <thead>
                <tr className="text-left text-sm text-gray-500 border-b border-gray-100">
                  <th className="pb-3">Priority</th>
                  <th className="pb-3">Total</th>
                  <th className="pb-3">On-Time</th>
                  <th className="pb-3">Breached</th>
                  <th className="pb-3">Rate</th>
                </tr>
              </thead>
              <tbody>
                {(['P1', 'P2', 'P3', 'P4'] as const).map((priority) => {
                  const data = slaCompliance[priority];
                  const onTime = data.total - data.breached;
                  return (
                    <tr key={priority} className="border-b border-gray-50">
                      <td className="py-3">
                        <span
                          className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${
                            priority === 'P1'
                              ? 'bg-red-100 text-red-700'
                              : priority === 'P2'
                                ? 'bg-amber-100 text-amber-700'
                                : priority === 'P3'
                                  ? 'bg-blue-100 text-blue-700'
                                  : 'bg-gray-100 text-gray-700'
                          }`}
                        >
                          {priority}
                        </span>
                      </td>
                      <td className="py-3 text-gray-700">{data.total}</td>
                      <td className="py-3 text-green-600">{onTime}</td>
                      <td className="py-3 text-red-600">{data.breached}</td>
                      <td className="py-3">
                        <div className="flex items-center gap-2">
                          <div className="w-16 h-2 bg-gray-200 rounded-full overflow-hidden">
                            <div
                              className={`h-full rounded-full ${
                                data.rate >= 90 ? 'bg-green-500' : data.rate >= 70 ? 'bg-amber-500' : 'bg-red-500'
                              }`}
                              style={{ width: `${data.rate}%` }}
                            />
                          </div>
                          <span className="text-sm font-medium text-gray-700">{data.rate}%</span>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* Cost Savings Breakdown */}
          <div className="bg-white rounded-xl border border-gray-200 p-5">
            <h3 className="text-lg font-semibold text-gray-900 mb-4">Cost Savings Breakdown</h3>
            <div className="space-y-6">
              {/* Voice Savings */}
              <div>
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-2">
                    <Phone className="w-5 h-5 text-blue-500" />
                    <span className="text-gray-700 font-medium">Voice Calls</span>
                  </div>
                  <span className="text-xl font-bold text-green-600">
                    {formatCurrency(costSavings.callSavings)}
                  </span>
                </div>
                <div className="h-3 bg-gray-200 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-blue-500 rounded-full"
                    style={{
                      width: `${(costSavings.callSavings / costSavings.total) * 100}%`,
                    }}
                  />
                </div>
                <p className="text-sm text-gray-500 mt-1">
                  {costSavings.callCount} calls × $11.56 saved per AI-handled call
                </p>
              </div>

              {/* Ticket Savings */}
              <div>
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-2">
                    <MessageSquare className="w-5 h-5 text-teal-500" />
                    <span className="text-gray-700 font-medium">Ticket Drafts</span>
                  </div>
                  <span className="text-xl font-bold text-green-600">
                    {formatCurrency(costSavings.ticketSavings)}
                  </span>
                </div>
                <div className="h-3 bg-gray-200 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-teal-500 rounded-full"
                    style={{
                      width: `${(costSavings.ticketSavings / costSavings.total) * 100}%`,
                    }}
                  />
                </div>
                <p className="text-sm text-gray-500 mt-1">
                  {costSavings.ticketCount} tickets × $12.22 saved per AI draft
                </p>
              </div>

              {/* Total */}
              <div className="pt-4 border-t border-gray-200">
                <div className="flex items-center justify-between">
                  <span className="text-gray-900 font-semibold">Total Savings</span>
                  <span className="text-2xl font-bold text-green-600">
                    {formatCurrency(costSavings.total)}
                  </span>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* ROW 5: KB Health */}
        <div className="bg-white rounded-xl border border-gray-200 p-5">
          <div className="flex items-center gap-2 mb-4">
            <HelpCircle className="w-5 h-5 text-purple-500" />
            <h3 className="text-lg font-semibold text-gray-900">Knowledge Base Health</h3>
          </div>
          <div className="grid grid-cols-4 gap-6">
            <div>
              <p className="text-sm text-gray-500 mb-1">Total Queries</p>
              <p className="text-2xl font-bold text-gray-900">{kbHealth.totalQueries}</p>
            </div>
            <div>
              <p className="text-sm text-gray-500 mb-1">Answered</p>
              <p className="text-2xl font-bold text-green-600">
                {kbHealth.totalQueries - kbHealth.unanswered}
              </p>
            </div>
            <div>
              <p className="text-sm text-gray-500 mb-1">Unanswered</p>
              <p className="text-2xl font-bold text-red-600">{kbHealth.unanswered}</p>
            </div>
            <div>
              <p className="text-sm text-gray-500 mb-1">Hit Rate</p>
              <div className="flex items-center gap-3">
                <p className="text-2xl font-bold text-purple-600">{kbHealth.hitRate}%</p>
                <div className="flex-1 h-3 bg-gray-200 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-purple-500 rounded-full"
                    style={{ width: `${kbHealth.hitRate}%` }}
                  />
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export default AnalyticsDashboard;
