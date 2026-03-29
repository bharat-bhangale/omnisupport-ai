// ============================================================================
// FRAUD DETECTION DASHBOARD PAGE
// ============================================================================
// Route: /fraud

import { useState } from 'react';
import {
  useGetFraudIncidentsQuery,
  useGetFraudSummaryQuery,
  useGetRiskDistributionQuery,
  useGetWatchlistQuery,
  useAddToWatchlistMutation,
  useRemoveFromWatchlistMutation,
  useResolveIncidentMutation,
  useGetFraudIncidentQuery,
  type FraudIncident,
  type RiskLevel,
  type FraudAction,
} from '../api/fraudApi';
import { FraudRiskBadge } from '../components/FraudRiskBadge';

// ============================================================================
// STAT CARD COMPONENT
// ============================================================================

interface StatCardProps {
  title: string;
  value: string | number;
  icon: React.ReactNode;
  color: string;
  subtitle?: string;
}

function StatCard({ title, value, icon, color, subtitle }: StatCardProps) {
  return (
    <div className="bg-slate-800 rounded-xl p-6">
      <div className="flex items-center justify-between mb-4">
        <span className="text-slate-400 text-sm">{title}</span>
        <div className={`p-2 rounded-lg ${color}`}>{icon}</div>
      </div>
      <div className="text-3xl font-bold mb-1">{value}</div>
      {subtitle && <div className="text-sm text-slate-400">{subtitle}</div>}
    </div>
  );
}

// ============================================================================
// DONUT CHART COMPONENT
// ============================================================================

interface DonutChartProps {
  data: Record<RiskLevel, number>;
  total: number;
}

function DonutChart({ data, total }: DonutChartProps) {
  const colors = {
    critical: '#ef4444',
    high: '#f97316',
    medium: '#f59e0b',
    low: '#6b7280',
  };

  // Calculate percentages and angles
  const segments: Array<{ level: RiskLevel; count: number; percentage: number; offset: number }> = [];
  let offset = 0;

  (['critical', 'high', 'medium', 'low'] as RiskLevel[]).forEach((level) => {
    const count = data[level] || 0;
    const percentage = total > 0 ? (count / total) * 100 : 0;
    segments.push({ level, count, percentage, offset });
    offset += percentage;
  });

  const radius = 80;
  const circumference = 2 * Math.PI * radius;

  return (
    <div className="bg-slate-800 rounded-xl p-6">
      <h3 className="text-lg font-semibold mb-4">Risk Level Distribution</h3>
      <div className="flex items-center gap-8">
        {/* SVG Donut */}
        <div className="relative">
          <svg width="200" height="200" viewBox="0 0 200 200">
            {/* Background circle */}
            <circle
              cx="100"
              cy="100"
              r={radius}
              fill="none"
              stroke="#334155"
              strokeWidth="20"
            />
            {/* Segments */}
            {segments.map((seg) => (
              <circle
                key={seg.level}
                cx="100"
                cy="100"
                r={radius}
                fill="none"
                stroke={colors[seg.level]}
                strokeWidth="20"
                strokeDasharray={`${(seg.percentage / 100) * circumference} ${circumference}`}
                strokeDashoffset={-((seg.offset / 100) * circumference)}
                transform="rotate(-90 100 100)"
                className="transition-all duration-500"
              />
            ))}
          </svg>
          {/* Center text */}
          <div className="absolute inset-0 flex flex-col items-center justify-center">
            <span className="text-3xl font-bold">{total}</span>
            <span className="text-sm text-slate-400">Total</span>
          </div>
        </div>

        {/* Legend */}
        <div className="space-y-3">
          {segments.map((seg) => (
            <div key={seg.level} className="flex items-center gap-3">
              <div
                className="w-3 h-3 rounded-full"
                style={{ backgroundColor: colors[seg.level] }}
              />
              <span className="text-sm capitalize">{seg.level}</span>
              <span className="text-sm text-slate-400">({seg.count})</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// ============================================================================
// INCIDENT DETAIL PANEL
// ============================================================================

interface IncidentDetailProps {
  incidentId: string;
  onClose: () => void;
  onAddToWatchlist: (phone: string) => void;
}

function IncidentDetail({ incidentId, onClose, onAddToWatchlist }: IncidentDetailProps) {
  const { data, isLoading } = useGetFraudIncidentQuery(incidentId);
  const [resolveIncident, { isLoading: isResolving }] = useResolveIncidentMutation();
  const [notes, setNotes] = useState('');

  const incident = data?.incident;

  const handleResolve = async () => {
    try {
      await resolveIncident({ id: incidentId, notes }).unwrap();
      onClose();
    } catch (err) {
      console.error('Failed to resolve:', err);
    }
  };

  if (isLoading) {
    return (
      <div className="fixed inset-y-0 right-0 w-[480px] bg-slate-800 shadow-xl z-50 flex items-center justify-center">
        <div className="animate-spin w-8 h-8 border-2 border-blue-500 border-t-transparent rounded-full" />
      </div>
    );
  }

  if (!incident) return null;

  return (
    <>
      {/* Backdrop */}
      <div className="fixed inset-0 bg-black/50 z-40" onClick={onClose} />

      {/* Panel */}
      <div className="fixed inset-y-0 right-0 w-[480px] bg-slate-800 shadow-xl z-50 overflow-y-auto">
        {/* Header */}
        <div className="sticky top-0 bg-slate-800 border-b border-slate-700 px-6 py-4 flex items-center justify-between">
          <div>
            <h2 className="text-xl font-semibold">Incident Details</h2>
            <p className="text-sm text-slate-400">{incident.callId.slice(0, 12)}...</p>
          </div>
          <button
            onClick={onClose}
            className="text-slate-400 hover:text-white transition-colors"
          >
            <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div className="p-6 space-y-6">
          {/* Phone + Actions */}
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-slate-400">Caller Phone</p>
              <p className="text-lg font-mono">{incident.callerPhone}</p>
            </div>
            <button
              onClick={() => onAddToWatchlist(incident.callerPhone)}
              className="px-3 py-1.5 bg-red-600/20 text-red-400 hover:bg-red-600/30 rounded-lg text-sm transition-colors"
            >
              Add to Blocklist
            </button>
          </div>

          {/* Risk Level */}
          <div className="flex items-center gap-4">
            <FraudRiskBadge riskLevel={incident.riskLevel} score={incident.compositeScore} />
            <span className="text-sm text-slate-400">
              Composite Score: {(incident.compositeScore * 100).toFixed(1)}%
            </span>
          </div>

          {/* Score Breakdown */}
          <div className="bg-slate-700/50 rounded-lg p-4 space-y-4">
            <h3 className="text-sm font-medium text-slate-300">Score Breakdown</h3>

            {/* Phone Reputation */}
            <div>
              <div className="flex justify-between text-sm mb-1">
                <span className="text-slate-400">Phone Reputation</span>
                <span>{(incident.phoneReputationScore * 100).toFixed(0)}%</span>
              </div>
              <div className="h-2 bg-slate-600 rounded-full overflow-hidden">
                <div
                  className="h-full bg-amber-500 transition-all"
                  style={{ width: `${incident.phoneReputationScore * 100}%` }}
                />
              </div>
            </div>

            {/* Velocity Flag */}
            <div className="flex items-center justify-between">
              <span className="text-slate-400 text-sm">Velocity Flag</span>
              <span
                className={`px-2 py-0.5 rounded text-xs ${
                  incident.velocityFlag
                    ? 'bg-red-500/20 text-red-400'
                    : 'bg-slate-600 text-slate-300'
                }`}
              >
                {incident.velocityFlag ? 'FLAGGED' : 'Normal'}
              </span>
            </div>

            {/* Conversation Score */}
            <div>
              <div className="flex justify-between text-sm mb-1">
                <span className="text-slate-400">Conversation Analysis</span>
                <span>{(incident.conversationScore * 100).toFixed(0)}%</span>
              </div>
              <div className="h-2 bg-slate-600 rounded-full overflow-hidden">
                <div
                  className="h-full bg-purple-500 transition-all"
                  style={{ width: `${incident.conversationScore * 100}%` }}
                />
              </div>
            </div>
          </div>

          {/* Signals */}
          {incident.signals.length > 0 && (
            <div>
              <h3 className="text-sm font-medium text-slate-300 mb-3">Fraud Signals Detected</h3>
              <ul className="space-y-2">
                {incident.signals.map((signal, idx) => (
                  <li key={idx} className="flex items-start gap-2 text-sm">
                    <svg className="w-4 h-4 text-red-400 mt-0.5 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                    </svg>
                    <span className="text-slate-300">{signal}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* Action Taken */}
          <div className="flex items-center gap-3">
            <span className="text-sm text-slate-400">Action Taken:</span>
            <span
              className={`px-2 py-0.5 rounded text-xs font-medium ${
                incident.action === 'blocked'
                  ? 'bg-red-500/20 text-red-400'
                  : incident.action === 'escalated'
                  ? 'bg-amber-500/20 text-amber-400'
                  : 'bg-slate-600 text-slate-300'
              }`}
            >
              {incident.action.toUpperCase()}
            </span>
          </div>

          {/* Transcript */}
          {incident.transcript && incident.transcript.length > 0 && (
            <div>
              <h3 className="text-sm font-medium text-slate-300 mb-3">Call Transcript</h3>
              <div className="bg-slate-900 rounded-lg p-4 max-h-60 overflow-y-auto space-y-3">
                {incident.transcript.map((turn, idx) => (
                  <div
                    key={idx}
                    className={`flex ${
                      turn.role === 'user' ? 'justify-start' : 'justify-end'
                    }`}
                  >
                    <div
                      className={`max-w-[80%] px-3 py-2 rounded-lg text-sm ${
                        turn.role === 'user'
                          ? 'bg-slate-700 text-slate-200'
                          : 'bg-blue-600/30 text-blue-100'
                      }`}
                    >
                      {turn.content}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Resolve Section */}
          {!incident.resolvedAt && (
            <div className="border-t border-slate-700 pt-6">
              <h3 className="text-sm font-medium text-slate-300 mb-3">Resolve Incident</h3>
              <textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                className="w-full bg-slate-700 border border-slate-600 rounded-lg px-4 py-2.5 resize-none focus:outline-none focus:ring-2 focus:ring-blue-500"
                rows={2}
                placeholder="Add resolution notes (optional)"
              />
              <button
                onClick={handleResolve}
                disabled={isResolving}
                className="mt-3 w-full py-2.5 bg-green-600 hover:bg-green-500 disabled:opacity-50 rounded-lg font-medium transition-colors"
              >
                {isResolving ? 'Resolving...' : 'Mark as Resolved'}
              </button>
            </div>
          )}

          {incident.resolvedAt && (
            <div className="bg-green-500/10 border border-green-500/30 rounded-lg p-4">
              <p className="text-green-400 font-medium">✓ Resolved</p>
              <p className="text-sm text-slate-400 mt-1">
                {new Date(incident.resolvedAt).toLocaleString()}
              </p>
              {incident.notes && (
                <p className="text-sm text-slate-300 mt-2">{incident.notes}</p>
              )}
            </div>
          )}
        </div>
      </div>
    </>
  );
}

// ============================================================================
// WATCHLIST TAB
// ============================================================================

function WatchlistTab() {
  const { data, isLoading } = useGetWatchlistQuery();
  const [addToWatchlist, { isLoading: isAdding }] = useAddToWatchlistMutation();
  const [removeFromWatchlist] = useRemoveFromWatchlistMutation();

  const [showAddModal, setShowAddModal] = useState(false);
  const [newPhone, setNewPhone] = useState('');
  const [newReason, setNewReason] = useState('');

  const handleAdd = async () => {
    try {
      await addToWatchlist({ phone: newPhone, reason: newReason }).unwrap();
      setShowAddModal(false);
      setNewPhone('');
      setNewReason('');
    } catch (err) {
      console.error('Failed to add:', err);
    }
  };

  const handleRemove = async (phone: string) => {
    if (!confirm('Remove this phone from the blocklist?')) return;
    try {
      await removeFromWatchlist(phone).unwrap();
    } catch (err) {
      console.error('Failed to remove:', err);
    }
  };

  if (isLoading) {
    return (
      <div className="flex justify-center py-12">
        <div className="animate-spin w-8 h-8 border-2 border-blue-500 border-t-transparent rounded-full" />
      </div>
    );
  }

  return (
    <div>
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-lg font-semibold">Phone Blocklist</h3>
        <button
          onClick={() => setShowAddModal(true)}
          className="flex items-center gap-2 px-4 py-2 bg-red-600 hover:bg-red-500 rounded-lg text-sm font-medium transition-colors"
        >
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
          </svg>
          Add to Blocklist
        </button>
      </div>

      {/* Table */}
      {data?.entries.length === 0 ? (
        <div className="bg-slate-800 rounded-xl p-8 text-center">
          <p className="text-slate-400">No blocked phone numbers</p>
        </div>
      ) : (
        <div className="bg-slate-800 rounded-xl overflow-hidden">
          <table className="w-full">
            <thead>
              <tr className="bg-slate-700/50 text-left text-sm text-slate-400">
                <th className="px-4 py-3 font-medium">Phone Number</th>
                <th className="px-4 py-3 font-medium">Reason</th>
                <th className="px-4 py-3 font-medium">Date Added</th>
                <th className="px-4 py-3 font-medium">Actions</th>
              </tr>
            </thead>
            <tbody>
              {data?.entries.map((entry) => (
                <tr key={entry._id} className="border-t border-slate-700/50">
                  <td className="px-4 py-3 font-mono">{entry.phone}</td>
                  <td className="px-4 py-3 text-slate-300">{entry.reason}</td>
                  <td className="px-4 py-3 text-slate-400 text-sm">
                    {new Date(entry.createdAt).toLocaleDateString()}
                  </td>
                  <td className="px-4 py-3">
                    <button
                      onClick={() => handleRemove(entry.phone)}
                      className="text-red-400 hover:text-red-300 text-sm"
                    >
                      Remove
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Add Modal */}
      {showAddModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-slate-800 rounded-xl p-6 w-full max-w-md mx-4">
            <h3 className="text-lg font-semibold mb-4">Add to Blocklist</h3>
            <div className="space-y-4">
              <div>
                <label className="block text-sm text-slate-400 mb-1">Phone Number</label>
                <input
                  type="text"
                  value={newPhone}
                  onChange={(e) => setNewPhone(e.target.value)}
                  className="w-full bg-slate-700 border border-slate-600 rounded-lg px-4 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
                  placeholder="+1234567890"
                />
              </div>
              <div>
                <label className="block text-sm text-slate-400 mb-1">Reason</label>
                <textarea
                  value={newReason}
                  onChange={(e) => setNewReason(e.target.value)}
                  className="w-full bg-slate-700 border border-slate-600 rounded-lg px-4 py-2 resize-none focus:outline-none focus:ring-2 focus:ring-blue-500"
                  rows={3}
                  placeholder="Why is this number being blocked?"
                />
              </div>
            </div>
            <div className="flex justify-end gap-3 mt-6">
              <button
                onClick={() => setShowAddModal(false)}
                className="px-4 py-2 text-slate-300 hover:text-white transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleAdd}
                disabled={!newPhone || !newReason || isAdding}
                className="px-4 py-2 bg-red-600 hover:bg-red-500 disabled:opacity-50 rounded-lg font-medium transition-colors"
              >
                {isAdding ? 'Adding...' : 'Add to Blocklist'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ============================================================================
// MAIN PAGE COMPONENT
// ============================================================================

export function FraudDashboard() {
  const [activeTab, setActiveTab] = useState<'incidents' | 'watchlist'>('incidents');
  const [selectedIncident, setSelectedIncident] = useState<string | null>(null);
  const [filters, setFilters] = useState<{
    riskLevel?: RiskLevel;
    action?: FraudAction;
  }>({});

  const { data: summary } = useGetFraudSummaryQuery(30);
  const { data: distribution } = useGetRiskDistributionQuery(30);
  const { data: incidents, isLoading } = useGetFraudIncidentsQuery({
    days: 30,
    ...filters,
  });
  const [addToWatchlist] = useAddToWatchlistMutation();

  const handleAddToWatchlist = async (phone: string) => {
    const reason = prompt('Enter reason for blocking this number:');
    if (!reason) return;
    try {
      await addToWatchlist({ phone, reason }).unwrap();
      setSelectedIncident(null);
    } catch (err) {
      console.error('Failed to add to watchlist:', err);
    }
  };

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 0,
    }).format(amount);
  };

  const maskPhone = (phone: string) => {
    if (phone.length < 6) return phone;
    return phone.slice(0, 3) + '****' + phone.slice(-4);
  };

  return (
    <div className="p-6 max-w-7xl mx-auto">
      {/* Header */}
      <div className="mb-6">
        <h1 className="text-2xl font-bold">Fraud Detection</h1>
        <p className="text-slate-400 mt-1">Monitor and manage suspicious call activity</p>
      </div>

      {/* Stats Row */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        <StatCard
          title="Fraud Attempts (30d)"
          value={summary?.total || 0}
          icon={
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
            </svg>
          }
          color="bg-red-500/20 text-red-400"
        />
        <StatCard
          title="Blocked Calls"
          value={summary?.blockedCount || 0}
          icon={
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M18.364 18.364A9 9 0 005.636 5.636m12.728 12.728A9 9 0 015.636 5.636m12.728 12.728L5.636 5.636" />
            </svg>
          }
          color="bg-orange-500/20 text-orange-400"
        />
        <StatCard
          title="Escalated"
          value={summary?.escalatedCount || 0}
          icon={
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6" />
            </svg>
          }
          color="bg-amber-500/20 text-amber-400"
        />
        <StatCard
          title="Cost Protected"
          value={formatCurrency(summary?.costSaved || 0)}
          icon={
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
            </svg>
          }
          color="bg-green-500/20 text-green-400"
          subtitle="Estimated savings"
        />
      </div>

      {/* Chart + Tabs */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-6">
        {/* Donut Chart */}
        <DonutChart
          data={distribution?.distribution || { critical: 0, high: 0, medium: 0, low: 0 }}
          total={distribution?.total || 0}
        />

        {/* Tabs Section */}
        <div className="lg:col-span-2">
          {/* Tab Buttons */}
          <div className="flex gap-2 mb-4">
            <button
              onClick={() => setActiveTab('incidents')}
              className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                activeTab === 'incidents'
                  ? 'bg-blue-600 text-white'
                  : 'bg-slate-700 text-slate-300 hover:bg-slate-600'
              }`}
            >
              Incidents
            </button>
            <button
              onClick={() => setActiveTab('watchlist')}
              className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                activeTab === 'watchlist'
                  ? 'bg-blue-600 text-white'
                  : 'bg-slate-700 text-slate-300 hover:bg-slate-600'
              }`}
            >
              Watchlist
            </button>
          </div>
        </div>
      </div>

      {/* Tab Content */}
      {activeTab === 'incidents' ? (
        <div>
          {/* Filters */}
          <div className="flex gap-2 mb-4">
            <select
              value={filters.riskLevel || ''}
              onChange={(e) =>
                setFilters((f) => ({
                  ...f,
                  riskLevel: e.target.value as RiskLevel | undefined || undefined,
                }))
              }
              className="bg-slate-700 border border-slate-600 rounded-lg px-3 py-2 text-sm"
            >
              <option value="">All Risk Levels</option>
              <option value="critical">Critical</option>
              <option value="high">High</option>
              <option value="medium">Medium</option>
              <option value="low">Low</option>
            </select>
            <select
              value={filters.action || ''}
              onChange={(e) =>
                setFilters((f) => ({
                  ...f,
                  action: e.target.value as FraudAction | undefined || undefined,
                }))
              }
              className="bg-slate-700 border border-slate-600 rounded-lg px-3 py-2 text-sm"
            >
              <option value="">All Actions</option>
              <option value="blocked">Blocked</option>
              <option value="escalated">Escalated</option>
              <option value="monitored">Monitored</option>
            </select>
          </div>

          {/* Table */}
          {isLoading ? (
            <div className="bg-slate-800 rounded-xl p-8 flex justify-center">
              <div className="animate-spin w-8 h-8 border-2 border-blue-500 border-t-transparent rounded-full" />
            </div>
          ) : incidents?.incidents.length === 0 ? (
            <div className="bg-slate-800 rounded-xl p-8 text-center">
              <p className="text-slate-400">No fraud incidents found</p>
            </div>
          ) : (
            <div className="bg-slate-800 rounded-xl overflow-hidden">
              <table className="w-full">
                <thead>
                  <tr className="bg-slate-700/50 text-left text-sm text-slate-400">
                    <th className="px-4 py-3 font-medium">Date & Time</th>
                    <th className="px-4 py-3 font-medium">Phone</th>
                    <th className="px-4 py-3 font-medium">Risk Level</th>
                    <th className="px-4 py-3 font-medium">Score</th>
                    <th className="px-4 py-3 font-medium">Key Signals</th>
                    <th className="px-4 py-3 font-medium">Action</th>
                    <th className="px-4 py-3 font-medium"></th>
                  </tr>
                </thead>
                <tbody>
                  {incidents?.incidents.map((incident) => (
                    <tr
                      key={incident._id}
                      className="border-t border-slate-700/50 hover:bg-slate-700/30 transition-colors"
                    >
                      <td className="px-4 py-3 text-sm text-slate-300">
                        {new Date(incident.createdAt).toLocaleString()}
                      </td>
                      <td className="px-4 py-3 font-mono text-sm">
                        {maskPhone(incident.callerPhone)}
                      </td>
                      <td className="px-4 py-3">
                        <FraudRiskBadge
                          riskLevel={incident.riskLevel}
                          score={incident.compositeScore}
                        />
                      </td>
                      <td className="px-4 py-3 text-sm">
                        {(incident.compositeScore * 100).toFixed(0)}%
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex flex-wrap gap-1">
                          {incident.signals.slice(0, 2).map((signal, idx) => (
                            <span
                              key={idx}
                              className="px-2 py-0.5 bg-slate-700 rounded text-xs text-slate-300 truncate max-w-[120px]"
                              title={signal}
                            >
                              {signal}
                            </span>
                          ))}
                          {incident.signals.length > 2 && (
                            <span className="text-xs text-slate-400">
                              +{incident.signals.length - 2}
                            </span>
                          )}
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        <span
                          className={`px-2 py-0.5 rounded text-xs font-medium ${
                            incident.action === 'blocked'
                              ? 'bg-red-500/20 text-red-400'
                              : incident.action === 'escalated'
                              ? 'bg-amber-500/20 text-amber-400'
                              : 'bg-slate-600 text-slate-300'
                          }`}
                        >
                          {incident.action.charAt(0).toUpperCase() + incident.action.slice(1)}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <button
                          onClick={() => setSelectedIncident(incident._id)}
                          className="px-3 py-1 bg-slate-700 hover:bg-slate-600 rounded text-sm transition-colors"
                        >
                          Review
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      ) : (
        <WatchlistTab />
      )}

      {/* Incident Detail Panel */}
      {selectedIncident && (
        <IncidentDetail
          incidentId={selectedIncident}
          onClose={() => setSelectedIncident(null)}
          onAddToWatchlist={handleAddToWatchlist}
        />
      )}
    </div>
  );
}

export default FraudDashboard;
