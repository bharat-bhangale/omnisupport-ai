import React, { useState } from 'react';
import {
  Clock,
  AlertTriangle,
  CheckCircle,
  TrendingUp,
  Settings,
  Save,
  Loader2,
  ExternalLink,
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
import toast from 'react-hot-toast';
import {
  useGetSLAComplianceQuery,
  useGetAtRiskTicketsQuery,
  useGetSLAHistoryQuery,
  useGetSLAPolicyQuery,
  useUpdateSLAPolicyMutation,
  useGetSLASummaryQuery,
  type SLAPolicy,
} from '../api/slaApi';
import { SLAComplianceTable } from '../components/SLAComplianceTable';

interface StatCardProps {
  title: string;
  value: string | number;
  subtitle?: string;
  icon: React.ReactNode;
  color: 'green' | 'amber' | 'red' | 'blue';
}

function StatCard({ title, value, subtitle, icon, color }: StatCardProps): React.ReactElement {
  const colorClasses = {
    green: 'bg-green-50 border-green-200 text-green-600',
    amber: 'bg-amber-50 border-amber-200 text-amber-600',
    red: 'bg-red-50 border-red-200 text-red-600',
    blue: 'bg-blue-50 border-blue-200 text-blue-600',
  };

  return (
    <div className={`rounded-xl border p-4 ${colorClasses[color]}`}>
      <div className="flex items-center gap-3">
        <div className="p-2 rounded-lg bg-white/50">{icon}</div>
        <div>
          <p className="text-sm font-medium text-gray-600">{title}</p>
          <p className="text-2xl font-bold text-gray-900">{value}</p>
          {subtitle && <p className="text-xs text-gray-500">{subtitle}</p>}
        </div>
      </div>
    </div>
  );
}

function AtRiskTicketRow({
  ticket,
}: {
  ticket: {
    ticketId: string;
    subject: string;
    priority: string;
    slaStatus: 'warning' | 'critical';
    minutesLeft: number;
    assignedAgent: string | null;
  };
}): React.ReactElement {
  const statusColors = {
    warning: 'bg-amber-100 text-amber-700',
    critical: 'bg-red-100 text-red-700',
  };

  return (
    <div className="flex items-center justify-between py-2 px-3 hover:bg-gray-50 rounded-lg">
      <div className="flex items-center gap-3">
        <span
          className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${statusColors[ticket.slaStatus]}`}
        >
          {ticket.minutesLeft}m
        </span>
        <div>
          <p className="text-sm font-medium text-gray-900 truncate max-w-xs">
            {ticket.subject}
          </p>
          <p className="text-xs text-gray-500">
            #{ticket.ticketId.slice(-6)} • {ticket.priority.toUpperCase()}
            {ticket.assignedAgent && ` • ${ticket.assignedAgent}`}
          </p>
        </div>
      </div>
      <a
        href={`/tickets?id=${ticket.ticketId}`}
        className="text-blue-600 hover:text-blue-700"
      >
        <ExternalLink className="w-4 h-4" />
      </a>
    </div>
  );
}

function SLAPolicyEditor({
  policy,
  onSave,
  isLoading,
  isAdmin,
}: {
  policy: SLAPolicy;
  onSave: (policy: SLAPolicy) => void;
  isLoading: boolean;
  isAdmin: boolean;
}): React.ReactElement {
  const [editedPolicy, setEditedPolicy] = useState<SLAPolicy>(policy);
  const [hasChanges, setHasChanges] = useState(false);

  const handleChange = (
    priority: keyof SLAPolicy,
    field: 'responseMinutes' | 'resolutionHours',
    value: number
  ) => {
    setEditedPolicy((prev) => ({
      ...prev,
      [priority]: {
        ...prev[priority],
        [field]: value,
      },
    }));
    setHasChanges(true);
  };

  const handleSave = () => {
    onSave(editedPolicy);
    setHasChanges(false);
  };

  const priorities = ['P1', 'P2', 'P3', 'P4'] as const;

  return (
    <div className="rounded-xl border border-gray-200 bg-white overflow-hidden">
      <div className="px-4 py-3 bg-gray-50 border-b border-gray-200 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Settings className="w-4 h-4 text-gray-500" />
          <span className="font-medium text-gray-700">SLA Policy Settings</span>
        </div>
        {isAdmin && hasChanges && (
          <button
            onClick={handleSave}
            disabled={isLoading}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 disabled:opacity-50"
          >
            {isLoading ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <Save className="w-4 h-4" />
            )}
            Save Changes
          </button>
        )}
      </div>
      <div className="p-4">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-gray-500">
              <th className="text-left py-2">Priority</th>
              <th className="text-center py-2">Response (min)</th>
              <th className="text-center py-2">Resolution (hrs)</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {priorities.map((p) => (
              <tr key={p}>
                <td className="py-2 font-medium text-gray-700">{p}</td>
                <td className="py-2 text-center">
                  <input
                    type="number"
                    value={editedPolicy[p].responseMinutes}
                    onChange={(e) =>
                      handleChange(p, 'responseMinutes', parseInt(e.target.value) || 0)
                    }
                    disabled={!isAdmin}
                    className="w-20 px-2 py-1 text-center border border-gray-200 rounded disabled:bg-gray-50"
                  />
                </td>
                <td className="py-2 text-center">
                  <input
                    type="number"
                    value={editedPolicy[p].resolutionHours}
                    onChange={(e) =>
                      handleChange(p, 'resolutionHours', parseInt(e.target.value) || 0)
                    }
                    disabled={!isAdmin}
                    className="w-20 px-2 py-1 text-center border border-gray-200 rounded disabled:bg-gray-50"
                  />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {!isAdmin && (
          <p className="text-xs text-gray-400 mt-3">
            Only admins can modify SLA policy settings.
          </p>
        )}
      </div>
    </div>
  );
}

export function SLADashboard(): React.ReactElement {
  // Mock admin status - in production, get from auth context
  const isAdmin = true;

  const { data: complianceData, isLoading: isLoadingCompliance } = useGetSLAComplianceQuery({ days: 30 });
  const { data: atRiskData, isLoading: isLoadingAtRisk } = useGetAtRiskTicketsQuery();
  const { data: historyData, isLoading: isLoadingHistory } = useGetSLAHistoryQuery({ days: 30 });
  const { data: policyData, isLoading: isLoadingPolicy } = useGetSLAPolicyQuery();
  const { data: summaryData } = useGetSLASummaryQuery();
  const [updatePolicy, { isLoading: isUpdating }] = useUpdateSLAPolicyMutation();

  const handleUpdatePolicy = async (policy: SLAPolicy) => {
    try {
      await updatePolicy(policy).unwrap();
      toast.success('SLA policy updated');
    } catch {
      toast.error('Failed to update SLA policy');
    }
  };

  const compliance = complianceData?.compliance;
  const atRiskTickets = atRiskData?.tickets || [];
  const history = historyData?.history || [];
  const policy = policyData?.policy;

  // Calculate overall compliance
  const overallCompliance = compliance
    ? Math.round(
        (compliance.P1.complianceRate +
          compliance.P2.complianceRate +
          compliance.P3.complianceRate +
          compliance.P4.complianceRate) /
          4
      )
    : 0;

  return (
    <div className="min-h-screen bg-gray-50 p-6">
      <div className="max-w-7xl mx-auto space-y-6">
        {/* Header */}
        <div>
          <h1 className="text-2xl font-bold text-gray-900">SLA Dashboard</h1>
          <p className="text-gray-500 mt-1">
            Monitor service level agreement compliance and response times
          </p>
        </div>

        {/* Stat Cards */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          <StatCard
            title="P1 Compliance"
            value={`${compliance?.P1.complianceRate || 0}%`}
            subtitle="Urgent tickets"
            icon={<AlertTriangle className="w-5 h-5" />}
            color={compliance?.P1.complianceRate && compliance.P1.complianceRate >= 95 ? 'green' : 'red'}
          />
          <StatCard
            title="P2 Compliance"
            value={`${compliance?.P2.complianceRate || 0}%`}
            subtitle="High priority"
            icon={<Clock className="w-5 h-5" />}
            color={compliance?.P2.complianceRate && compliance.P2.complianceRate >= 95 ? 'green' : 'amber'}
          />
          <StatCard
            title="At-Risk Tickets"
            value={summaryData?.critical || 0}
            subtitle={`${summaryData?.warning || 0} in warning`}
            icon={<TrendingUp className="w-5 h-5" />}
            color="amber"
          />
          <StatCard
            title="Breached Today"
            value={summaryData?.breachesToday || 0}
            subtitle="SLA violations"
            icon={<CheckCircle className="w-5 h-5" />}
            color={summaryData?.breachesToday === 0 ? 'green' : 'red'}
          />
        </div>

        {/* Main Content Grid */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Compliance Table */}
          <div className="lg:col-span-2 bg-white rounded-xl border border-gray-200 shadow-sm">
            <div className="px-4 py-3 border-b border-gray-200">
              <h2 className="font-semibold text-gray-900">SLA Compliance by Priority</h2>
              <p className="text-xs text-gray-500">Last 30 days • {overallCompliance}% overall</p>
            </div>
            <div className="p-4">
              {isLoadingCompliance ? (
                <div className="flex items-center justify-center py-12">
                  <Loader2 className="w-6 h-6 text-blue-500 animate-spin" />
                </div>
              ) : compliance ? (
                <SLAComplianceTable data={compliance} />
              ) : (
                <p className="text-center text-gray-500 py-8">No compliance data available</p>
              )}
            </div>
          </div>

          {/* At-Risk Tickets */}
          <div className="bg-white rounded-xl border border-gray-200 shadow-sm">
            <div className="px-4 py-3 border-b border-gray-200 flex items-center justify-between">
              <div>
                <h2 className="font-semibold text-gray-900">At-Risk Tickets</h2>
                <p className="text-xs text-gray-500">{atRiskTickets.length} tickets</p>
              </div>
            </div>
            <div className="p-2 max-h-80 overflow-y-auto">
              {isLoadingAtRisk ? (
                <div className="flex items-center justify-center py-12">
                  <Loader2 className="w-6 h-6 text-blue-500 animate-spin" />
                </div>
              ) : atRiskTickets.length === 0 ? (
                <div className="text-center py-8 text-gray-500">
                  <CheckCircle className="w-8 h-8 mx-auto mb-2 text-green-400" />
                  <p className="text-sm">No at-risk tickets!</p>
                </div>
              ) : (
                <div className="space-y-1">
                  {atRiskTickets.map((ticket) => (
                    <AtRiskTicketRow key={ticket.ticketId} ticket={ticket} />
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Bottom Row */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Trend Chart */}
          <div className="lg:col-span-2 bg-white rounded-xl border border-gray-200 shadow-sm">
            <div className="px-4 py-3 border-b border-gray-200">
              <h2 className="font-semibold text-gray-900">SLA Breach Trend</h2>
              <p className="text-xs text-gray-500">Daily breaches over 30 days</p>
            </div>
            <div className="p-4">
              {isLoadingHistory ? (
                <div className="flex items-center justify-center h-64">
                  <Loader2 className="w-6 h-6 text-blue-500 animate-spin" />
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
                      <Line
                        type="monotone"
                        dataKey="P1"
                        name="P1 (Urgent)"
                        stroke="#DC2626"
                        strokeWidth={2}
                        dot={false}
                      />
                      <Line
                        type="monotone"
                        dataKey="P2"
                        name="P2 (High)"
                        stroke="#F59E0B"
                        strokeWidth={2}
                        dot={false}
                      />
                      <Line
                        type="monotone"
                        dataKey="P3"
                        name="P3 (Normal)"
                        stroke="#3B82F6"
                        strokeWidth={2}
                        dot={false}
                      />
                      <Line
                        type="monotone"
                        dataKey="P4"
                        name="P4 (Low)"
                        stroke="#6B7280"
                        strokeWidth={2}
                        dot={false}
                      />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              )}
            </div>
          </div>

          {/* Policy Settings */}
          {isLoadingPolicy ? (
            <div className="bg-white rounded-xl border border-gray-200 flex items-center justify-center">
              <Loader2 className="w-6 h-6 text-blue-500 animate-spin" />
            </div>
          ) : policy ? (
            <SLAPolicyEditor
              policy={policy}
              onSave={handleUpdatePolicy}
              isLoading={isUpdating}
              isAdmin={isAdmin}
            />
          ) : null}
        </div>
      </div>
    </div>
  );
}

export default SLADashboard;
