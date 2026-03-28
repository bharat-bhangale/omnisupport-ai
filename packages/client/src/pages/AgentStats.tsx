import React, { useMemo } from 'react';
import {
  Ticket,
  CheckCircle,
  Sparkles,
  Clock,
  AlertTriangle,
  TrendingUp,
} from 'lucide-react';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from 'recharts';
import { useGetAgentStatsQuery } from '../api/analyticsApi';

interface StatCardProps {
  title: string;
  value: string | number;
  subtitle?: string;
  icon: React.ReactNode;
  trend?: {
    value: number;
    isPositive: boolean;
  };
}

function StatCard({ title, value, subtitle, icon, trend }: StatCardProps): React.ReactElement {
  return (
    <div className="bg-white rounded-xl border border-gray-200 p-5 shadow-sm">
      <div className="flex items-start justify-between">
        <div className="flex items-center gap-3">
          <div className="p-2.5 bg-blue-50 rounded-lg text-blue-600">{icon}</div>
          <div>
            <p className="text-sm text-gray-500 font-medium">{title}</p>
            <p className="text-2xl font-bold text-gray-900">{value}</p>
            {subtitle && <p className="text-xs text-gray-400 mt-0.5">{subtitle}</p>}
          </div>
        </div>
        {trend && (
          <div
            className={`flex items-center gap-1 text-sm ${
              trend.isPositive ? 'text-green-600' : 'text-red-600'
            }`}
          >
            <TrendingUp
              className={`w-4 h-4 ${!trend.isPositive ? 'rotate-180' : ''}`}
            />
            {Math.abs(trend.value)}%
          </div>
        )}
      </div>
    </div>
  );
}

export function AgentStats(): React.ReactElement {
  const { data, isLoading, error } = useGetAgentStatsQuery();

  const chartData = useMemo(() => {
    if (!data?.draftUsageByDay) return [];
    return data.draftUsageByDay.map((day) => ({
      name: day.date,
      draftsUsed: day.draftsUsed,
      draftsEdited: day.draftsEdited,
    }));
  }, [data?.draftUsageByDay]);

  if (isLoading) {
    return (
      <div className="min-h-screen bg-gray-50 p-6">
        <div className="max-w-6xl mx-auto">
          <div className="animate-pulse">
            <div className="h-8 bg-gray-200 rounded w-48 mb-6" />
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
              {[...Array(4)].map((_, i) => (
                <div key={i} className="h-28 bg-gray-200 rounded-xl" />
              ))}
            </div>
            <div className="h-64 bg-gray-200 rounded-xl" />
          </div>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen bg-gray-50 p-6 flex items-center justify-center">
        <div className="text-center">
          <AlertTriangle className="w-12 h-12 text-red-400 mx-auto mb-4" />
          <p className="text-gray-600">Failed to load agent statistics</p>
        </div>
      </div>
    );
  }

  const stats = data?.stats || {
    ticketsHandledWeek: 0,
    ticketsHandledMonth: 0,
    aiDraftUsedPercentage: 0,
    averageResponseTime: 0,
  };

  const topIssues = data?.topIssues || [];

  const formatResponseTime = (minutes: number): string => {
    if (minutes < 60) return `${minutes}m`;
    const hours = Math.floor(minutes / 60);
    const mins = minutes % 60;
    return mins > 0 ? `${hours}h ${mins}m` : `${hours}h`;
  };

  return (
    <div className="min-h-screen bg-gray-50 p-6">
      <div className="max-w-6xl mx-auto">
        {/* Header */}
        <div className="mb-6">
          <h1 className="text-2xl font-bold text-gray-900">My AI Assistance Stats</h1>
          <p className="text-gray-500 mt-1">
            Track your performance and AI draft usage metrics
          </p>
        </div>

        {/* Stats Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
          <StatCard
            title="Tickets This Week"
            value={stats.ticketsHandledWeek}
            icon={<Ticket className="w-5 h-5" />}
          />
          <StatCard
            title="Tickets This Month"
            value={stats.ticketsHandledMonth}
            subtitle="Compared to last month"
            icon={<CheckCircle className="w-5 h-5" />}
          />
          <StatCard
            title="AI Draft Used"
            value={`${stats.aiDraftUsedPercentage}%`}
            subtitle="Used without editing"
            icon={<Sparkles className="w-5 h-5" />}
            trend={{ value: 5, isPositive: true }}
          />
          <StatCard
            title="Avg Response Time"
            value={formatResponseTime(stats.averageResponseTime)}
            subtitle="From ticket creation"
            icon={<Clock className="w-5 h-5" />}
          />
        </div>

        {/* Charts Row */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Draft Usage Chart */}
          <div className="lg:col-span-2 bg-white rounded-xl border border-gray-200 p-5 shadow-sm">
            <h3 className="text-lg font-semibold text-gray-900 mb-4">
              AI Draft Usage by Day
            </h3>
            <div className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={chartData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                  <XAxis dataKey="name" tick={{ fontSize: 12 }} />
                  <YAxis tick={{ fontSize: 12 }} />
                  <Tooltip
                    contentStyle={{
                      backgroundColor: '#fff',
                      border: '1px solid #e5e7eb',
                      borderRadius: '8px',
                      fontSize: '12px',
                    }}
                  />
                  <Bar
                    dataKey="draftsUsed"
                    name="Drafts Used"
                    fill="#3B82F6"
                    radius={[4, 4, 0, 0]}
                  />
                  <Bar
                    dataKey="draftsEdited"
                    name="Drafts Edited"
                    fill="#F59E0B"
                    radius={[4, 4, 0, 0]}
                  />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* Top Issues */}
          <div className="bg-white rounded-xl border border-gray-200 p-5 shadow-sm">
            <h3 className="text-lg font-semibold text-gray-900 mb-4">
              Top AI Issues Flagged
            </h3>
            {topIssues.length === 0 ? (
              <div className="text-center py-8 text-gray-500 text-sm">
                <Sparkles className="w-8 h-8 mx-auto mb-2 text-gray-300" />
                No issues flagged yet
              </div>
            ) : (
              <ul className="space-y-3">
                {topIssues.map((issue, idx) => (
                  <li
                    key={issue.type}
                    className="flex items-center justify-between text-sm"
                  >
                    <div className="flex items-center gap-2">
                      <span className="w-5 h-5 rounded-full bg-gray-100 text-gray-600 flex items-center justify-center text-xs font-medium">
                        {idx + 1}
                      </span>
                      <span className="text-gray-700">{issue.label}</span>
                    </div>
                    <span className="text-gray-500">{issue.count}</span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

export default AgentStats;
