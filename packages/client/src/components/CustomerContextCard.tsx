import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import {
  User,
  Phone,
  Mail,
  AlertTriangle,
  TrendingUp,
  TrendingDown,
  Minus,
  Clock,
  Ticket,
  PhoneCall,
  ChevronDown,
  ChevronUp,
  ExternalLink,
  Star,
  Shield,
  Crown,
  Award,
} from 'lucide-react';
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  Legend,
} from 'recharts';
import type {
  CustomerIntelligenceCard as CardType,
  CustomerTier,
  SentimentTrend,
  CallSummary,
  TicketSummary,
  SentimentDataPoint,
} from '../types/customer';

interface CustomerContextCardProps {
  card: CardType;
  mode: 'compact' | 'full';
  recentCalls?: CallSummary[];
  recentTickets?: TicketSummary[];
  sentimentData?: {
    voice: SentimentDataPoint[];
    text: SentimentDataPoint[];
  };
  onViewTranscript?: (callId: string) => void;
}

const tierConfig: Record<CustomerTier, { label: string; color: string; icon: React.ReactNode }> = {
  standard: { label: 'Standard', color: 'bg-gray-100 text-gray-700', icon: <User className="w-3 h-3" /> },
  premium: { label: 'Premium', color: 'bg-blue-100 text-blue-700', icon: <Star className="w-3 h-3" /> },
  vip: { label: 'VIP', color: 'bg-amber-100 text-amber-700', icon: <Crown className="w-3 h-3" /> },
  enterprise: { label: 'Enterprise', color: 'bg-purple-100 text-purple-700', icon: <Shield className="w-3 h-3" /> },
};

const trendConfig: Record<SentimentTrend, { icon: React.ReactNode; color: string }> = {
  improving: { icon: <TrendingUp className="w-4 h-4" />, color: 'text-green-600' },
  stable: { icon: <Minus className="w-4 h-4" />, color: 'text-gray-500' },
  worsening: { icon: <TrendingDown className="w-4 h-4" />, color: 'text-red-600' },
};

function getInitials(name?: string): string {
  if (!name) return '?';
  return name
    .split(' ')
    .map((n) => n[0])
    .join('')
    .toUpperCase()
    .slice(0, 2);
}

function formatDaysAgo(dateString?: string): string {
  if (!dateString) return 'Never';
  const days = Math.floor((Date.now() - new Date(dateString).getTime()) / (1000 * 60 * 60 * 24));
  if (days === 0) return 'Today';
  if (days === 1) return 'Yesterday';
  return `${days} days ago`;
}

function formatDuration(seconds: number): string {
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return `${mins}:${secs.toString().padStart(2, '0')}`;
}

function ChurnRiskMeter({ score }: { score: number }) {
  const percentage = Math.round(score * 100);
  const color = score > 0.65 ? 'bg-red-500' : score > 0.4 ? 'bg-amber-500' : 'bg-green-500';

  return (
    <div className="w-full">
      <div className="flex justify-between text-xs mb-1">
        <span className="text-gray-600">Churn Risk</span>
        <span className={score > 0.65 ? 'text-red-600 font-medium' : 'text-gray-700'}>{percentage}%</span>
      </div>
      <div className="h-2 bg-gray-200 rounded-full overflow-hidden">
        <div className={`h-full ${color} transition-all`} style={{ width: `${percentage}%` }} />
      </div>
    </div>
  );
}

function TierBadge({ tier }: { tier: CustomerTier }) {
  const config = tierConfig[tier];
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium ${config.color}`}>
      {config.icon}
      {config.label}
    </span>
  );
}

function CompactCard({
  card,
  onViewTranscript,
}: {
  card: CardType;
  onViewTranscript?: (callId: string) => void;
}) {
  const tier = card.tier || 'standard';
  const trend = trendConfig[card.sentimentTrend];

  return (
    <div className="bg-white border border-gray-200 rounded-lg p-4 shadow-sm">
      {/* Header */}
      <div className="flex items-start gap-3">
        {/* Avatar */}
        <div className="flex-shrink-0">
          <div className="w-10 h-10 rounded-full bg-gradient-to-br from-blue-500 to-purple-600 flex items-center justify-center text-white font-medium text-sm">
            {getInitials(card.name)}
          </div>
        </div>

        {/* Info */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="font-medium text-gray-900 truncate">{card.name || 'Unknown'}</span>
            <TierBadge tier={tier} />
          </div>

          {/* Stats Row */}
          <div className="flex items-center gap-4 mt-1 text-sm text-gray-600">
            <span className="flex items-center gap-1">
              <span className="font-medium text-gray-900">${(card.lifetimeValue || 0).toLocaleString()}</span>
              LTV
            </span>
            <span className="flex items-center gap-1">
              <Ticket className="w-3.5 h-3.5" />
              {card.openTickets} open
            </span>
            <span className="flex items-center gap-1">
              <Clock className="w-3.5 h-3.5" />
              {formatDaysAgo(card.lastContactDate)}
            </span>
            <span className={`flex items-center gap-1 ${trend.color}`}>
              {trend.icon}
            </span>
          </div>
        </div>

        {/* Churn Risk Badge */}
        {card.churnRiskScore > 0.65 && (
          <div className="flex-shrink-0">
            <span className="inline-flex items-center gap-1 px-2 py-1 bg-red-50 text-red-700 text-xs font-medium rounded">
              <AlertTriangle className="w-3 h-3" />
              At Risk
            </span>
          </div>
        )}
      </div>

      {/* Recent Call */}
      {card.callSummaries.length > 0 && (
        <div className="mt-3 pt-3 border-t border-gray-100">
          <div className="flex items-center gap-2 text-sm">
            <PhoneCall className="w-4 h-4 text-teal-600" />
            <span className="text-gray-600">Called {formatDaysAgo(card.lastContactDate)}</span>
            {onViewTranscript && (
              <button
                onClick={() => onViewTranscript(card.callSummaries[0] || '')}
                className="text-blue-600 hover:text-blue-700 text-xs font-medium"
              >
                View Transcript
              </button>
            )}
          </div>
        </div>
      )}

      {/* View Full Profile Link */}
      {card.customerId && (
        <Link
          to={`/customers/${card.customerId}`}
          className="mt-3 inline-flex items-center gap-1 text-sm text-blue-600 hover:text-blue-700 font-medium"
        >
          View full profile
          <ExternalLink className="w-3.5 h-3.5" />
        </Link>
      )}
    </div>
  );
}

function FullCard({
  card,
  recentCalls = [],
  recentTickets = [],
  sentimentData,
}: {
  card: CardType;
  recentCalls?: CallSummary[];
  recentTickets?: TicketSummary[];
  sentimentData?: { voice: SentimentDataPoint[]; text: SentimentDataPoint[] };
}) {
  const [activeTab, setActiveTab] = useState<'calls' | 'tickets'>('calls');
  const [expandedCall, setExpandedCall] = useState<string | null>(null);
  const tier = card.tier || 'standard';

  // Transform sentiment data for chart
  const chartData = React.useMemo(() => {
    if (!sentimentData) return [];

    const combined = [...sentimentData.voice, ...sentimentData.text]
      .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());

    const grouped = combined.reduce((acc, point) => {
      const date = new Date(point.date).toLocaleDateString();
      if (!acc[date]) {
        acc[date] = { date, voice: null as number | null, text: null as number | null };
      }
      if (point.source === 'call') {
        acc[date]!.voice = point.score;
      } else {
        acc[date]!.text = point.score;
      }
      return acc;
    }, {} as Record<string, { date: string; voice: number | null; text: number | null }>);

    return Object.values(grouped).slice(-30);
  }, [sentimentData]);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="bg-white border border-gray-200 rounded-lg p-6 shadow-sm">
        <div className="flex items-start gap-6">
          {/* Large Avatar */}
          <div className="flex-shrink-0">
            <div className="w-20 h-20 rounded-full bg-gradient-to-br from-blue-500 to-purple-600 flex items-center justify-center text-white font-semibold text-2xl">
              {getInitials(card.name)}
            </div>
          </div>

          {/* Customer Info */}
          <div className="flex-1">
            <div className="flex items-center gap-3 flex-wrap">
              <h1 className="text-2xl font-bold text-gray-900">{card.name || 'Unknown Customer'}</h1>
              <TierBadge tier={tier} />
              {card.churnRiskScore > 0.65 && (
                <span className="inline-flex items-center gap-1 px-2 py-1 bg-red-50 text-red-700 text-xs font-medium rounded">
                  <AlertTriangle className="w-3 h-3" />
                  High Churn Risk
                </span>
              )}
            </div>

            <div className="flex items-center gap-4 mt-2 text-sm text-gray-600">
              {card.email && (
                <span className="flex items-center gap-1">
                  <Mail className="w-4 h-4" />
                  {card.email}
                </span>
              )}
              {card.phone && (
                <span className="flex items-center gap-1">
                  <Phone className="w-4 h-4" />
                  {card.phone}
                </span>
              )}
            </div>

            {/* Churn Risk Meter */}
            <div className="mt-4 max-w-xs">
              <ChurnRiskMeter score={card.churnRiskScore} />
            </div>
          </div>
        </div>
      </div>

      {/* 3-Column Layout */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Column 1: Account Info */}
        <div className="space-y-6">
          {/* Account Details Card */}
          <div className="bg-white border border-gray-200 rounded-lg p-4 shadow-sm">
            <h3 className="font-semibold text-gray-900 mb-4">Account Information</h3>
            <dl className="space-y-3 text-sm">
              <div className="flex justify-between">
                <dt className="text-gray-600">Lifetime Value</dt>
                <dd className="font-medium text-gray-900">${(card.lifetimeValue || 0).toLocaleString()}</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-gray-600">Account Age</dt>
                <dd className="font-medium text-gray-900">{card.accountAge || 0} days</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-gray-600">Total Interactions</dt>
                <dd className="font-medium text-gray-900">{card.totalInteractions}</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-gray-600">Preferred Style</dt>
                <dd className="font-medium text-gray-900 capitalize">{card.preferredStyle || 'Casual'}</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-gray-600">Verbosity</dt>
                <dd className="font-medium text-gray-900 capitalize">{card.verbosity || 'Concise'}</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-gray-600">Language</dt>
                <dd className="font-medium text-gray-900 uppercase">{card.preferredLanguage || 'EN'}</dd>
              </div>
            </dl>
          </div>

          {/* Known Issues */}
          {card.knownIssues.length > 0 && (
            <div className="bg-white border border-gray-200 rounded-lg p-4 shadow-sm">
              <h3 className="font-semibold text-gray-900 mb-3">Known Issues</h3>
              <div className="flex flex-wrap gap-2">
                {card.knownIssues.map((issue, idx) => (
                  <span
                    key={idx}
                    className="px-2 py-1 bg-amber-50 text-amber-700 text-xs rounded-full"
                  >
                    {issue}
                  </span>
                ))}
              </div>
            </div>
          )}

          {/* Internal Notes */}
          {card.notes && (
            <div className="bg-white border border-gray-200 rounded-lg p-4 shadow-sm">
              <h3 className="font-semibold text-gray-900 mb-3">Internal Notes</h3>
              <p className="text-sm text-gray-600 whitespace-pre-wrap">{card.notes}</p>
            </div>
          )}
        </div>

        {/* Column 2: Interaction History */}
        <div className="bg-white border border-gray-200 rounded-lg p-4 shadow-sm">
          <h3 className="font-semibold text-gray-900 mb-4">Interaction History</h3>

          {/* Tabs */}
          <div className="flex border-b border-gray-200 mb-4">
            <button
              onClick={() => setActiveTab('calls')}
              className={`px-4 py-2 text-sm font-medium border-b-2 -mb-px transition-colors ${
                activeTab === 'calls'
                  ? 'border-teal-500 text-teal-600'
                  : 'border-transparent text-gray-500 hover:text-gray-700'
              }`}
            >
              <PhoneCall className="w-4 h-4 inline mr-1" />
              Voice Calls
            </button>
            <button
              onClick={() => setActiveTab('tickets')}
              className={`px-4 py-2 text-sm font-medium border-b-2 -mb-px transition-colors ${
                activeTab === 'tickets'
                  ? 'border-blue-500 text-blue-600'
                  : 'border-transparent text-gray-500 hover:text-gray-700'
              }`}
            >
              <Ticket className="w-4 h-4 inline mr-1" />
              Tickets
            </button>
          </div>

          {/* Calls List */}
          {activeTab === 'calls' && (
            <div className="space-y-2">
              {recentCalls.length === 0 ? (
                <p className="text-sm text-gray-500 text-center py-4">No recent calls</p>
              ) : (
                recentCalls.map((call) => (
                  <div key={call.callId} className="border border-gray-100 rounded-lg">
                    <button
                      onClick={() => setExpandedCall(expandedCall === call.callId ? null : call.callId)}
                      className="w-full px-3 py-2 flex items-center justify-between text-left hover:bg-gray-50"
                    >
                      <div className="flex items-center gap-3">
                        <span className="text-sm text-gray-600">
                          {new Date(call.date).toLocaleDateString()}
                        </span>
                        <span className="text-sm text-gray-500">{formatDuration(call.duration)}</span>
                        {call.resolution && (
                          <span className="px-2 py-0.5 bg-green-50 text-green-700 text-xs rounded">
                            {call.resolution}
                          </span>
                        )}
                      </div>
                      {expandedCall === call.callId ? (
                        <ChevronUp className="w-4 h-4 text-gray-400" />
                      ) : (
                        <ChevronDown className="w-4 h-4 text-gray-400" />
                      )}
                    </button>
                    {expandedCall === call.callId && (
                      <div className="px-3 py-2 bg-gray-50 border-t border-gray-100 text-sm">
                        {call.summary && <p className="text-gray-600 mb-2">{call.summary}</p>}
                        {call.intent && (
                          <p className="text-gray-500">
                            <span className="font-medium">Intent:</span> {call.intent}
                          </p>
                        )}
                      </div>
                    )}
                  </div>
                ))
              )}
            </div>
          )}

          {/* Tickets List */}
          {activeTab === 'tickets' && (
            <div className="overflow-x-auto">
              {recentTickets.length === 0 ? (
                <p className="text-sm text-gray-500 text-center py-4">No recent tickets</p>
              ) : (
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-left text-gray-500 border-b">
                      <th className="pb-2 font-medium">Priority</th>
                      <th className="pb-2 font-medium">Subject</th>
                      <th className="pb-2 font-medium">Status</th>
                      <th className="pb-2 font-medium">Date</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {recentTickets.map((ticket) => (
                      <tr key={ticket.ticketId} className="hover:bg-gray-50">
                        <td className="py-2">
                          <span
                            className={`px-2 py-0.5 text-xs rounded ${
                              ticket.priority === 'urgent'
                                ? 'bg-red-100 text-red-700'
                                : ticket.priority === 'high'
                                ? 'bg-orange-100 text-orange-700'
                                : 'bg-gray-100 text-gray-700'
                            }`}
                          >
                            {ticket.priority}
                          </span>
                        </td>
                        <td className="py-2 truncate max-w-[150px]">{ticket.subject}</td>
                        <td className="py-2">
                          <span
                            className={`px-2 py-0.5 text-xs rounded ${
                              ticket.status === 'solved' || ticket.status === 'closed'
                                ? 'bg-green-100 text-green-700'
                                : 'bg-blue-100 text-blue-700'
                            }`}
                          >
                            {ticket.status}
                          </span>
                        </td>
                        <td className="py-2 text-gray-500">
                          {new Date(ticket.date).toLocaleDateString()}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          )}
        </div>

        {/* Column 3: Sentiment Chart */}
        <div className="space-y-6">
          <div className="bg-white border border-gray-200 rounded-lg p-4 shadow-sm">
            <h3 className="font-semibold text-gray-900 mb-4">Sentiment Trend (30 days)</h3>

            {chartData.length > 0 ? (
              <div className="h-48">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={chartData}>
                    <XAxis dataKey="date" tick={{ fontSize: 10 }} />
                    <YAxis domain={[-1, 1]} tick={{ fontSize: 10 }} />
                    <Tooltip />
                    <Legend />
                    <Line
                      type="monotone"
                      dataKey="voice"
                      stroke="#14b8a6"
                      strokeWidth={2}
                      dot={false}
                      name="Voice"
                      connectNulls
                    />
                    <Line
                      type="monotone"
                      dataKey="text"
                      stroke="#3b82f6"
                      strokeWidth={2}
                      dot={false}
                      name="Text"
                      connectNulls
                    />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            ) : (
              <p className="text-sm text-gray-500 text-center py-8">No sentiment data available</p>
            )}
          </div>

          {/* Recent Issues Timeline */}
          {card.recentIssues.length > 0 && (
            <div className="bg-white border border-gray-200 rounded-lg p-4 shadow-sm">
              <h3 className="font-semibold text-gray-900 mb-4">Recent Issues</h3>
              <div className="space-y-3">
                {card.recentIssues.slice(0, 5).map((issue) => (
                  <div key={issue.id} className="flex items-start gap-3 text-sm">
                    <div
                      className={`flex-shrink-0 w-2 h-2 mt-1.5 rounded-full ${
                        issue.channel === 'voice' ? 'bg-teal-500' : 'bg-blue-500'
                      }`}
                    />
                    <div>
                      <p className="text-gray-900">{issue.subject}</p>
                      <p className="text-gray-500 text-xs">
                        {issue.channel === 'voice' ? 'Call' : 'Ticket'} • {issue.status} •{' '}
                        {new Date(issue.createdAt).toLocaleDateString()}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export function CustomerContextCard(props: CustomerContextCardProps) {
  if (props.mode === 'compact') {
    return <CompactCard card={props.card} onViewTranscript={props.onViewTranscript} />;
  }

  return (
    <FullCard
      card={props.card}
      recentCalls={props.recentCalls}
      recentTickets={props.recentTickets}
      sentimentData={props.sentimentData}
    />
  );
}
