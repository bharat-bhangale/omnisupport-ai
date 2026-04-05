import { useState, useCallback, useMemo } from 'react';
import {
  Phone,
  Ticket,
  Bot,
  DollarSign,
  Activity,
  Clock,
  AlertCircle,
  CheckCircle2,
  XCircle,
  Sparkles,
  ChevronRight,
  RefreshCw,
} from 'lucide-react';
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
} from 'recharts';
import StatCard from '../components/StatCard';
import { useDashboardSocket } from '../hooks/useDashboardSocket';
import {
  useGetDashboardSummaryQuery,
  useGetLiveActivityQuery,
  useGetActiveCallsQuery,
  useGetRecentTicketsQuery,
  useGetResolutionChartQuery,
  useGetSystemStatusQuery,
  type ActivityItem,
} from '../api/analyticsApi';

export default function Dashboard() {
  const [activities, setActivities] = useState<ActivityItem[]>([]);

  // Fetch data with RTK Query
  const { data: summary, refetch: refetchSummary } = useGetDashboardSummaryQuery(
    { days: 1 },
    { pollingInterval: 30000 }
  );
  const { data: activityData } = useGetLiveActivityQuery(
    { limit: 10 },
    { pollingInterval: 30000 }
  );
  const { data: activeCallsData } = useGetActiveCallsQuery(undefined, {
    pollingInterval: 10000,
  });
  const { data: recentTicketsData } = useGetRecentTicketsQuery({ limit: 5 });
  const { data: chartData } = useGetResolutionChartQuery();
  const { data: systemStatus } = useGetSystemStatusQuery(undefined, {
    pollingInterval: 60000,
  });

  // Merge socket activity with fetched activity
  const displayActivities = useMemo(() => {
    const socketActivities = activities;
    const fetchedActivities = activityData?.activities || [];

    // Combine and deduplicate by id
    const combined = [...socketActivities, ...fetchedActivities];
    const seen = new Set<string>();
    const unique = combined.filter((a) => {
      if (seen.has(a.id)) return false;
      seen.add(a.id);
      return true;
    });

    // Sort by timestamp and limit
    return unique
      .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())
      .slice(0, 10);
  }, [activities, activityData]);

  // Socket event handlers
  const handleActivityNew = useCallback((activity: ActivityItem) => {
    setActivities((prev) => [activity, ...prev].slice(0, 10));
  }, []);

  // Connect to dashboard socket
  useDashboardSocket({
    onActivityNew: handleActivityNew,
  });

  // Format date for header
  const today = new Date();
  const dayName = today.toLocaleDateString('en-US', { weekday: 'long' });
  const dateStr = today.toLocaleDateString('en-US', { month: 'long', day: 'numeric' });

  return (
    <div className="min-h-screen bg-[#0A1835] p-6">
      {/* Header */}
      <div className="mb-8">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold text-[#F9FAFB]">Dashboard</h1>
            <p className="mt-1 text-[#9CA3AF]">
              {dayName}, {dateStr} • {summary?.activeCalls || 0} live calls •{' '}
              {summary?.openTickets || 0} open tickets
            </p>
          </div>
          <button
            onClick={() => refetchSummary()}
            className="flex items-center gap-2 px-4 py-2 text-[#9CA3AF] bg-[#162240] border border-[#1E3461] rounded-lg hover:bg-[#0F1F3D] hover:text-[#F9FAFB] transition-colors"
          >
            <RefreshCw className="h-4 w-4" />
            Refresh
          </button>
        </div>
      </div>

      {/* ROW 1: 4 StatCards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
        <StatCard
          value={summary?.activeCalls || 0}
          label="Active Calls Right Now"
          accent="blue"
          isLive={!!summary?.activeCalls && summary.activeCalls > 0}
        />
        <StatCard
          value={summary?.openTickets || 0}
          label="Open Tickets"
          trend={summary?.openTicketTrend}
          trendPositive={false}
          accent="amber"
          subtitle="vs yesterday"
        />
        <StatCard
          value={summary?.aiResolutionRate || 0}
          label="AI Resolution Rate"
          trend={summary?.resolutionRateTrend}
          trendPositive={true}
          accent="teal"
          suffix="%"
          subtitle="vs last week"
        />
        <StatCard
          value={summary?.costSavedToday || 0}
          label="Cost Saved Today"
          accent="green"
          prefix="$"
          subtitle={`${summary?.interactionsToday || 0} interactions`}
        />
      </div>

      {/* ROW 2: Live Activity + Active Calls */}
      <div className="grid grid-cols-1 lg:grid-cols-5 gap-6 mb-8">
        {/* Live Activity Feed (60%) */}
        <div className="lg:col-span-3 bg-[#162240] rounded-xl border border-[#1E3461] p-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-semibold text-[#F9FAFB] flex items-center gap-2">
              <Activity className="h-5 w-5 text-[#3B82F6]" />
              Live Activity
            </h2>
            <span className="flex items-center gap-1.5 px-2 py-0.5 bg-red-500/20 rounded-full">
              <span className="relative flex h-2 w-2">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75"></span>
                <span className="relative inline-flex rounded-full h-2 w-2 bg-red-500"></span>
              </span>
              <span className="text-xs font-medium text-red-400">LIVE</span>
            </span>
          </div>

          <div className="space-y-3">
            {displayActivities.length === 0 ? (
              <p className="text-[#6B7280] text-sm py-8 text-center">No recent activity</p>
            ) : (
              displayActivities.map((activity) => (
                <ActivityRow key={activity.id} activity={activity} />
              ))
            )}
          </div>
        </div>

        {/* Active Calls (40%) */}
        <div className="lg:col-span-2 bg-[#162240] rounded-xl border border-[#1E3461] p-6">
          <h2 className="text-lg font-semibold text-[#F9FAFB] flex items-center gap-2 mb-4">
            <Phone className="h-5 w-5 text-[#0F766E]" />
            Active Calls
          </h2>

          <div className="space-y-3">
            {!activeCallsData?.calls?.length ? (
              <p className="text-[#6B7280] text-sm py-8 text-center">No active calls</p>
            ) : (
              activeCallsData.calls.map((call) => (
                <ActiveCallCard key={call.id} call={call} />
              ))
            )}
          </div>
        </div>
      </div>

      {/* ROW 3: Recent Tickets + Resolution Chart */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-8">
        {/* Recent Tickets */}
        <div className="bg-[#162240] rounded-xl border border-[#1E3461] p-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-semibold text-[#F9FAFB] flex items-center gap-2">
              <Ticket className="h-5 w-5 text-[#3B82F6]" />
              Recent Tickets
            </h2>
            <a
              href="/tickets"
              className="text-sm text-[#3B82F6] hover:text-[#60A5FA] flex items-center gap-1"
            >
              View all <ChevronRight className="h-4 w-4" />
            </a>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="text-left text-xs text-[#6B7280] border-b border-[#1E3461]">
                  <th className="pb-2 font-medium">Priority</th>
                  <th className="pb-2 font-medium">Subject</th>
                  <th className="pb-2 font-medium">Category</th>
                  <th className="pb-2 font-medium">Time</th>
                  <th className="pb-2 font-medium">Draft</th>
                </tr>
              </thead>
              <tbody className="text-sm">
                {recentTicketsData?.tickets.map((ticket) => (
                  <tr key={ticket.id} className="border-b border-[#1E3461]/50">
                    <td className="py-3">
                      <PriorityBadge priority={ticket.priority} />
                    </td>
                    <td className="py-3 text-[#F9FAFB]">{ticket.subject}</td>
                    <td className="py-3 text-[#9CA3AF]">{ticket.category || '-'}</td>
                    <td className="py-3 text-[#9CA3AF]">{formatTimeAgo(ticket.createdAt)}</td>
                    <td className="py-3">
                      {ticket.hasDraft && (
                        <span className="flex items-center gap-1 text-[#8B5CF6]">
                          <Sparkles className="h-3.5 w-3.5" />
                          <span className="text-xs">Draft</span>
                        </span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* Resolution Chart */}
        <div className="bg-[#162240] rounded-xl border border-gray-700 p-6">
          <h2 className="text-lg font-semibold text-white flex items-center gap-2 mb-4">
            <Bot className="h-5 w-5 text-blue-400" />
            7-Day Resolution Rate
          </h2>

          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={chartData?.data || []}>
                <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
                <XAxis
                  dataKey="date"
                  stroke="#9CA3AF"
                  tick={{ fill: '#9CA3AF', fontSize: 12 }}
                  tickFormatter={(d) => new Date(d).toLocaleDateString('en-US', { weekday: 'short' })}
                />
                <YAxis stroke="#9CA3AF" tick={{ fill: '#9CA3AF', fontSize: 12 }} />
                <Tooltip
                  contentStyle={{
                    backgroundColor: '#1F2937',
                    border: 'none',
                    borderRadius: '8px',
                    color: '#fff',
                  }}
                />
                <Legend />
                <Line
                  type="monotone"
                  dataKey="aiResolved"
                  name="AI Resolved"
                  stroke="#3B82F6"
                  strokeWidth={2}
                  dot={false}
                />
                <Line
                  type="monotone"
                  dataKey="humanResolved"
                  name="Human Resolved"
                  stroke="#F59E0B"
                  strokeWidth={2}
                  dot={false}
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>

      {/* ROW 4: System Status Bar */}
      <div className="bg-[#162240] rounded-xl border border-[#1E3461] p-4">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-medium text-[#9CA3AF]">System Status</h3>
          <div className="flex items-center gap-6">
            {systemStatus?.services &&
              Object.entries(systemStatus.services).map(([name, service]) => (
                <div key={name} className="flex items-center gap-2">
                  <StatusDot status={service.status} />
                  <span className="text-sm text-[#9CA3AF] capitalize">{name}</span>
                  {service.lastSync && (
                    <span className="text-xs text-[#6B7280]">
                      {formatTimeAgo(service.lastSync)}
                    </span>
                  )}
                </div>
              ))}
          </div>
        </div>
      </div>
    </div>
  );
}

// Activity Row Component
function ActivityRow({ activity }: { activity: ActivityItem }) {
  const typeConfig: Record<string, { color: string; icon: React.ReactNode }> = {
    call_active: { color: 'bg-[#0F766E]', icon: <Phone className="h-3 w-3" /> },
    call_completed: { color: 'bg-emerald-500', icon: <Phone className="h-3 w-3" /> },
    ticket_update: { color: 'bg-[#3B82F6]', icon: <Ticket className="h-3 w-3" /> },
    ticket_draft_ready: { color: 'bg-[#8B5CF6]', icon: <Sparkles className="h-3 w-3" /> },
    escalation_waiting: { color: 'bg-red-500', icon: <AlertCircle className="h-3 w-3" /> },
    escalation_accepted: { color: 'bg-[#0F766E]', icon: <CheckCircle2 className="h-3 w-3" /> },
  };

  const config = typeConfig[activity.type] || { color: 'bg-[#6B7280]', icon: null };

  return (
    <div className="flex items-start gap-3 py-2 border-b border-[#1E3461]/50 last:border-0">
      <div className={`w-6 h-6 rounded-full ${config.color} flex items-center justify-center text-white`}>
        {config.icon}
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-sm text-[#F9FAFB] truncate">{activity.description}</p>
        <div className="flex items-center gap-2 mt-0.5">
          <span className="text-xs text-[#6B7280]">{formatTimeAgo(activity.timestamp)}</span>
          {activity.category && (
            <span className="text-xs px-1.5 py-0.5 bg-[#0A1835] text-[#9CA3AF] rounded">
              {activity.category}
            </span>
          )}
        </div>
      </div>
      {activity.sentiment && <SentimentDot sentiment={activity.sentiment} />}
    </div>
  );
}

// Active Call Card Component
function ActiveCallCard({ call }: { call: { id: string; phone: string; intent: string; sentiment: string; confidence: number; duration: number } }) {
  const formatDuration = (seconds: number): string => {
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    return `${m}:${s.toString().padStart(2, '0')}`;
  };

  return (
    <div className="p-3 bg-[#0A1835] rounded-lg border border-[#1E3461]">
      <div className="flex items-center justify-between mb-2">
        <span className="font-mono text-sm text-[#F9FAFB]">{call.phone}</span>
        <span className="flex items-center gap-1 text-sm text-[#9CA3AF]">
          <Clock className="h-3.5 w-3.5" />
          {formatDuration(call.duration)}
        </span>
      </div>
      <div className="flex items-center justify-between">
        <span className="text-xs px-2 py-0.5 bg-[#0F766E]/20 text-[#0F766E] rounded border border-[#0F766E]/30">
          {call.intent}
        </span>
        <div className="flex items-center gap-2">
          {/* Confidence bar */}
          <div className="w-16 h-1.5 bg-[#1E3461] rounded-full overflow-hidden">
            <div
              className="h-full bg-emerald-500 rounded-full"
              style={{ width: `${call.confidence * 100}%` }}
            />
          </div>
          <SentimentDot sentiment={call.sentiment} />
        </div>
      </div>
    </div>
  );
}

// Priority Badge Component
function PriorityBadge({ priority }: { priority: string }) {
  const config: Record<string, string> = {
    urgent: 'bg-red-500/20 text-red-400 border border-red-500/30',
    high: 'bg-amber-500/20 text-amber-400 border border-amber-500/30',
    medium: 'bg-[#3B82F6]/20 text-[#3B82F6] border border-[#3B82F6]/30',
    low: 'bg-[#6B7280]/20 text-[#9CA3AF] border border-[#6B7280]/30',
  };

  return (
    <span className={`text-xs px-2 py-0.5 rounded ${config[priority] || config.medium}`}>
      {priority}
    </span>
  );
}

// Sentiment Dot Component
function SentimentDot({ sentiment }: { sentiment: string }) {
  const colors: Record<string, string> = {
    positive: 'bg-green-500',
    neutral: 'bg-gray-400',
    negative: 'bg-red-500',
  };

  return (
    <span
      className={`w-2.5 h-2.5 rounded-full ${colors[sentiment] || colors.neutral}`}
      title={sentiment}
    />
  );
}

// Status Dot Component
function StatusDot({ status }: { status: string }) {
  const colors: Record<string, string> = {
    healthy: 'bg-green-500',
    degraded: 'bg-amber-500',
    unhealthy: 'bg-red-500',
  };

  return <span className={`w-2 h-2 rounded-full ${colors[status] || colors.unhealthy}`} />;
}

// Time ago formatter
function formatTimeAgo(timestamp: string | Date): string {
  const date = new Date(timestamp);
  const now = new Date();
  const seconds = Math.floor((now.getTime() - date.getTime()) / 1000);

  if (seconds < 60) return `${seconds}s ago`;
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`;
  return `${Math.floor(seconds / 86400)}d ago`;
}
