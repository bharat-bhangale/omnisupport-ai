// packages/client/src/pages/TicketDetail.tsx
// P07 Ticket Detail & AI Draft Panel
// Route: /tickets/:id

import { useState, useEffect } from 'react';
import { useParams, Link } from 'react-router-dom';
import {
  ArrowLeft,
  User,
  Building2,
  Mail,
  Phone,
  Clock,
  AlertTriangle,
  CheckCircle2,
  XCircle,
  MessageSquare,
  Paperclip,
  Send,
  Save,
  RefreshCw,
  Sparkles,
  ChevronDown,
  ChevronUp,
  FileText,
  UserPlus,
  ArrowUpRight,
  Merge,
  Star,
  ThumbsUp,
  ThumbsDown,
  Copy,
  MoreHorizontal,
  Tag,
  History,
} from 'lucide-react';

// Types
interface Customer {
  id: string;
  name: string;
  email: string;
  phone: string;
  company: string;
  tier: 'enterprise' | 'pro' | 'starter';
  lifetimeValue: number;
  totalTickets: number;
  avatarUrl?: string;
}

interface Message {
  id: string;
  type: 'customer' | 'agent' | 'ai_suggestion' | 'internal_note' | 'system';
  content: string;
  timestamp: string;
  author: string;
  attachments?: { name: string; size: string; type: string }[];
}

interface KBArticle {
  id: string;
  title: string;
  relevance: number;
}

interface AIDraft {
  content: string;
  confidence: number;
  sentiment: 'positive' | 'neutral' | 'negative';
  sources: KBArticle[];
  generatedAt: string;
}

interface Ticket {
  id: string;
  ticketNumber: string;
  subject: string;
  priority: 1 | 2 | 3 | 4;
  status: 'open' | 'pending' | 'resolved' | 'closed';
  channel: 'email' | 'chat' | 'phone' | 'web';
  category: string;
  tags: string[];
  assignee?: string;
  createdAt: string;
  updatedAt: string;
  customer: Customer;
  messages: Message[];
  aiDraft?: AIDraft;
}

// Priority badge component
function PriorityBadge({ priority }: { priority: 1 | 2 | 3 | 4 }) {
  const styles = {
    1: 'bg-red-500/20 text-red-400 border-red-500/30',
    2: 'bg-amber-500/20 text-amber-400 border-amber-500/30',
    3: 'bg-blue-500/20 text-blue-400 border-blue-500/30',
    4: 'bg-gray-500/20 text-gray-400 border-gray-500/30',
  };

  return (
    <span className={`px-2 py-0.5 text-xs font-bold rounded border ${styles[priority]}`}>
      P{priority}
    </span>
  );
}

// Status badge component
function StatusBadge({ status }: { status: Ticket['status'] }) {
  const styles = {
    open: 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30',
    pending: 'bg-amber-500/20 text-amber-400 border-amber-500/30',
    resolved: 'bg-blue-500/20 text-blue-400 border-blue-500/30',
    closed: 'bg-gray-500/20 text-gray-400 border-gray-500/30',
  };

  const labels = {
    open: 'Open',
    pending: 'Pending',
    resolved: 'Resolved',
    closed: 'Closed',
  };

  return (
    <span className={`px-2 py-0.5 text-xs font-medium rounded border ${styles[status]}`}>
      {labels[status]}
    </span>
  );
}

// Tier badge component
function TierBadge({ tier }: { tier: Customer['tier'] }) {
  const styles = {
    enterprise: 'bg-purple-500/20 text-purple-400 border-purple-500/30',
    pro: 'bg-blue-500/20 text-blue-400 border-blue-500/30',
    starter: 'bg-gray-500/20 text-gray-400 border-gray-500/30',
  };

  return (
    <span className={`px-2 py-0.5 text-xs font-medium rounded border ${styles[tier]}`}>
      {tier.charAt(0).toUpperCase() + tier.slice(1)}
    </span>
  );
}

// Sentiment indicator component
function SentimentIndicator({ sentiment }: { sentiment: AIDraft['sentiment'] }) {
  const config = {
    positive: { color: 'text-emerald-400', bg: 'bg-emerald-500', label: 'Positive' },
    neutral: { color: 'text-amber-400', bg: 'bg-amber-500', label: 'Neutral' },
    negative: { color: 'text-red-400', bg: 'bg-red-500', label: 'Negative' },
  };

  const { color, bg, label } = config[sentiment];

  return (
    <div className="flex items-center gap-2">
      <span className={`w-2 h-2 rounded-full ${bg} animate-pulse`} />
      <span className={`text-sm ${color}`}>{label}</span>
    </div>
  );
}

// Confidence meter component
function ConfidenceMeter({ confidence }: { confidence: number }) {
  const color = confidence >= 80 ? 'bg-emerald-500' : confidence >= 60 ? 'bg-amber-500' : 'bg-red-500';

  return (
    <div className="flex items-center gap-3">
      <div className="flex-1 h-2 bg-[#1E3461] rounded-full overflow-hidden">
        <div
          className={`h-full ${color} transition-all duration-500`}
          style={{ width: `${confidence}%` }}
        />
      </div>
      <span className="text-sm font-medium text-[#F9FAFB]">{confidence}%</span>
    </div>
  );
}

// Message bubble component
function MessageBubble({ message }: { message: Message }) {
  const isCustomer = message.type === 'customer';
  const isAI = message.type === 'ai_suggestion';
  const isInternal = message.type === 'internal_note';
  const isSystem = message.type === 'system';

  if (isSystem) {
    return (
      <div className="flex justify-center py-2">
        <span className="text-xs text-[#6B7280] bg-[#162240] px-3 py-1 rounded-full">
          {message.content}
        </span>
      </div>
    );
  }

  return (
    <div className={`flex ${isCustomer ? 'justify-start' : 'justify-end'}`}>
      <div
        className={`max-w-[80%] rounded-xl p-4 ${
          isCustomer
            ? 'bg-[#162240] border border-[#1E3461]'
            : isAI
            ? 'bg-[#8B5CF6]/10 border border-[#8B5CF6]/30'
            : isInternal
            ? 'bg-amber-500/10 border border-amber-500/30'
            : 'bg-[#3B82F6]/10 border border-[#3B82F6]/30'
        }`}
      >
        <div className="flex items-center gap-2 mb-2">
          {isAI && (
            <span className="flex items-center gap-1 text-xs font-medium text-[#8B5CF6]">
              <Sparkles className="w-3 h-3" />
              AI Suggestion
            </span>
          )}
          {isInternal && (
            <span className="text-xs font-medium text-amber-400">Internal Note</span>
          )}
          {!isAI && !isInternal && (
            <span className="text-sm font-medium text-[#F9FAFB]">{message.author}</span>
          )}
          <span className="text-xs text-[#6B7280]">{message.timestamp}</span>
        </div>
        <p className="text-sm text-[#9CA3AF] leading-relaxed">{message.content}</p>
        {message.attachments && message.attachments.length > 0 && (
          <div className="mt-3 flex flex-wrap gap-2">
            {message.attachments.map((att, idx) => (
              <div
                key={idx}
                className="flex items-center gap-2 bg-[#0A1835] px-3 py-1.5 rounded-lg text-xs"
              >
                <Paperclip className="w-3 h-3 text-[#6B7280]" />
                <span className="text-[#9CA3AF]">{att.name}</span>
                <span className="text-[#6B7280]">({att.size})</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// Skeleton loader for loading state
function TicketDetailSkeleton() {
  return (
    <div className="min-h-screen bg-[#0A1835] p-8">
      <div className="animate-pulse">
        {/* Header skeleton */}
        <div className="flex items-center gap-4 mb-6">
          <div className="w-10 h-10 bg-[#1E3461] rounded-lg" />
          <div className="h-8 w-48 bg-[#1E3461] rounded" />
          <div className="h-6 w-16 bg-[#1E3461] rounded" />
          <div className="h-6 w-20 bg-[#1E3461] rounded" />
        </div>

        {/* Main content skeleton */}
        <div className="grid grid-cols-1 lg:grid-cols-5 gap-6">
          {/* Left panel */}
          <div className="lg:col-span-3 space-y-6">
            <div className="bg-[#162240] rounded-xl p-6 h-32" />
            <div className="bg-[#162240] rounded-xl p-6 h-96" />
          </div>
          {/* Right panel */}
          <div className="lg:col-span-2 space-y-6">
            <div className="bg-[#162240] rounded-xl p-6 h-64" />
            <div className="bg-[#162240] rounded-xl p-6 h-48" />
          </div>
        </div>
      </div>
    </div>
  );
}

// Main component
export default function TicketDetail() {
  const { id } = useParams<{ id: string }>();
  const [ticket, setTicket] = useState<Ticket | null>(null);
  const [loading, setLoading] = useState(true);
  const [replyContent, setReplyContent] = useState('');
  const [aiDraftExpanded, setAiDraftExpanded] = useState(true);
  const [sourcesExpanded, setSourcesExpanded] = useState(false);
  const [regenerating, setRegenerating] = useState(false);

  // Mock data - in production this would come from RTK Query
  useEffect(() => {
    const mockTicket: Ticket = {
      id: id || 'tkt-001',
      ticketNumber: 'TKT-2847',
      subject: 'Order #4821 not delivered - 7 days late',
      priority: 1,
      status: 'open',
      channel: 'email',
      category: 'Shipping',
      tags: ['urgent', 'vip-customer', 'logistics'],
      assignee: 'Alex Chen',
      createdAt: '2024-03-22T10:15:00Z',
      updatedAt: '2024-03-22T14:30:00Z',
      customer: {
        id: 'cust-001',
        name: 'Priya Mehta',
        email: 'priya.mehta@techcorp.com',
        phone: '+1 (555) 234-5678',
        company: 'TechCorp Industries',
        tier: 'enterprise',
        lifetimeValue: 48500,
        totalTickets: 12,
      },
      messages: [
        {
          id: 'msg-001',
          type: 'customer',
          content:
            "Hi, I placed order #4821 over a week ago and it still hasn't arrived. The tracking shows it's been stuck at a sorting facility for 5 days. This is really frustrating as I needed these parts for an important project. Can you please help?",
          timestamp: 'Mar 22, 10:15 AM',
          author: 'Priya Mehta',
          attachments: [{ name: 'order_confirmation.pdf', size: '245 KB', type: 'pdf' }],
        },
        {
          id: 'msg-002',
          type: 'system',
          content: 'Ticket automatically assigned to Alex Chen based on workload balancing',
          timestamp: 'Mar 22, 10:16 AM',
          author: 'System',
        },
        {
          id: 'msg-003',
          type: 'ai_suggestion',
          content:
            "Based on the customer's order history and current shipping status, I recommend offering expedited reshipping with a 15% discount on their next order. The package appears to be delayed at the regional sorting center due to weather conditions.",
          timestamp: 'Mar 22, 10:17 AM',
          author: 'AI Assistant',
        },
        {
          id: 'msg-004',
          type: 'internal_note',
          content:
            'Escalated to Logistics team for investigation. Weather delays confirmed in the midwest region. Priority handling requested.',
          timestamp: 'Mar 22, 11:30 AM',
          author: 'Alex Chen',
        },
      ],
      aiDraft: {
        content: `Hi Priya,

Thank you for reaching out, and I sincerely apologize for the delay with your order #4821. I completely understand how frustrating this must be, especially with an important project depending on these parts.

I've looked into your shipment and can confirm it's currently at the regional sorting center in Chicago. Unfortunately, severe weather conditions have caused delays in that area over the past few days.

Here's what I'm doing to help:
1. I've escalated your package for priority handling
2. Requested expedited shipping at no additional cost once it leaves the facility
3. Added a 15% discount code (VIP15PRIYA) for your next order as an apology for the inconvenience

You should see movement on your tracking within 24-48 hours. I'll personally monitor this and send you an update tomorrow.

Is there anything else I can help you with in the meantime?

Best regards,
Alex Chen
Customer Success Team`,
        confidence: 92,
        sentiment: 'negative',
        sources: [
          { id: 'kb-001', title: 'Shipping Delay Protocols', relevance: 95 },
          { id: 'kb-002', title: 'VIP Customer Retention Guide', relevance: 88 },
          { id: 'kb-003', title: 'Discount Authorization Matrix', relevance: 82 },
        ],
        generatedAt: '2024-03-22T10:17:00Z',
      },
    };

    // Simulate API call
    setTimeout(() => {
      setTicket(mockTicket);
      setLoading(false);
    }, 800);
  }, [id]);

  const handleRegenerate = () => {
    setRegenerating(true);
    setTimeout(() => {
      setRegenerating(false);
    }, 2000);
  };

  const handleApplyDraft = () => {
    if (ticket?.aiDraft) {
      setReplyContent(ticket.aiDraft.content);
    }
  };

  const handleSendReply = () => {
    // In production, this would call an RTK Query mutation
    console.log('Sending reply:', replyContent);
    setReplyContent('');
  };

  if (loading) {
    return <TicketDetailSkeleton />;
  }

  if (!ticket) {
    return (
      <div className="min-h-screen bg-[#0A1835] flex items-center justify-center">
        <div className="text-center">
          <XCircle className="w-16 h-16 text-red-500 mx-auto mb-4" />
          <h2 className="text-xl font-bold text-[#F9FAFB] mb-2">Ticket Not Found</h2>
          <p className="text-[#9CA3AF] mb-4">The ticket you're looking for doesn't exist.</p>
          <Link
            to="/tickets"
            className="inline-flex items-center gap-2 px-4 py-2 bg-[#3B82F6] text-white rounded-lg hover:bg-[#1D4ED8] transition-colors"
          >
            <ArrowLeft className="w-4 h-4" />
            Back to Tickets
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#0A1835]">
      {/* Header */}
      <div className="sticky top-0 z-10 bg-[#0A1835]/95 backdrop-blur-sm border-b border-[#1E3461] px-6 py-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <Link
              to="/tickets"
              className="p-2 hover:bg-[#162240] rounded-lg transition-colors"
            >
              <ArrowLeft className="w-5 h-5 text-[#9CA3AF]" />
            </Link>
            <div>
              <div className="flex items-center gap-3">
                <span className="text-lg font-bold text-[#F9FAFB]">
                  #{ticket.ticketNumber}
                </span>
                <PriorityBadge priority={ticket.priority} />
                <StatusBadge status={ticket.status} />
              </div>
              <h1 className="text-sm text-[#9CA3AF] mt-0.5">{ticket.subject}</h1>
            </div>
          </div>

          {/* Actions */}
          <div className="flex items-center gap-2">
            <button className="flex items-center gap-2 px-3 py-2 text-sm text-[#9CA3AF] hover:text-[#F9FAFB] hover:bg-[#162240] rounded-lg transition-colors">
              <UserPlus className="w-4 h-4" />
              Assign
            </button>
            <button className="flex items-center gap-2 px-3 py-2 text-sm text-amber-400 hover:bg-amber-500/10 rounded-lg transition-colors">
              <ArrowUpRight className="w-4 h-4" />
              Escalate
            </button>
            <button className="flex items-center gap-2 px-3 py-2 text-sm text-[#9CA3AF] hover:text-[#F9FAFB] hover:bg-[#162240] rounded-lg transition-colors">
              <Merge className="w-4 h-4" />
              Merge
            </button>
            <button className="flex items-center gap-2 px-3 py-2 text-sm text-emerald-400 hover:bg-emerald-500/10 rounded-lg transition-colors">
              <CheckCircle2 className="w-4 h-4" />
              Resolve
            </button>
            <button className="p-2 hover:bg-[#162240] rounded-lg transition-colors">
              <MoreHorizontal className="w-5 h-5 text-[#9CA3AF]" />
            </button>
          </div>
        </div>
      </div>

      {/* Main content */}
      <div className="p-6">
        <div className="grid grid-cols-1 lg:grid-cols-5 gap-6">
          {/* Left Panel - Ticket Details & Conversation */}
          <div className="lg:col-span-3 space-y-6">
            {/* Customer Info Card */}
            <div className="bg-[#162240] rounded-xl border border-[#1E3461] p-5">
              <div className="flex items-start justify-between">
                <div className="flex items-center gap-4">
                  <div className="w-12 h-12 bg-gradient-to-br from-[#3B82F6] to-[#8B5CF6] rounded-full flex items-center justify-center">
                    <span className="text-lg font-bold text-white">
                      {ticket.customer.name.charAt(0)}
                    </span>
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <h3 className="text-lg font-semibold text-[#F9FAFB]">
                        {ticket.customer.name}
                      </h3>
                      <TierBadge tier={ticket.customer.tier} />
                    </div>
                    <p className="text-sm text-[#9CA3AF]">{ticket.customer.company}</p>
                  </div>
                </div>
                <Link
                  to={`/customers/${ticket.customer.id}`}
                  className="text-sm text-[#3B82F6] hover:text-[#60A5FA] flex items-center gap-1"
                >
                  View Profile
                  <ArrowUpRight className="w-3 h-3" />
                </Link>
              </div>

              <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mt-4 pt-4 border-t border-[#1E3461]">
                <div className="flex items-center gap-2">
                  <Mail className="w-4 h-4 text-[#6B7280]" />
                  <span className="text-sm text-[#9CA3AF] truncate">
                    {ticket.customer.email}
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <Phone className="w-4 h-4 text-[#6B7280]" />
                  <span className="text-sm text-[#9CA3AF]">{ticket.customer.phone}</span>
                </div>
                <div className="flex items-center gap-2">
                  <Star className="w-4 h-4 text-amber-500" />
                  <span className="text-sm text-[#9CA3AF]">
                    ${ticket.customer.lifetimeValue.toLocaleString()} LTV
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <MessageSquare className="w-4 h-4 text-[#6B7280]" />
                  <span className="text-sm text-[#9CA3AF]">
                    {ticket.customer.totalTickets} tickets
                  </span>
                </div>
              </div>
            </div>

            {/* Tags */}
            <div className="flex items-center gap-2 flex-wrap">
              <Tag className="w-4 h-4 text-[#6B7280]" />
              {ticket.tags.map((tag) => (
                <span
                  key={tag}
                  className="px-2 py-1 text-xs bg-[#162240] border border-[#1E3461] text-[#9CA3AF] rounded-full"
                >
                  {tag}
                </span>
              ))}
              <button className="px-2 py-1 text-xs text-[#3B82F6] hover:bg-[#3B82F6]/10 rounded-full transition-colors">
                + Add tag
              </button>
            </div>

            {/* Conversation Timeline */}
            <div className="bg-[#162240] rounded-xl border border-[#1E3461] p-5">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-base font-semibold text-[#F9FAFB] flex items-center gap-2">
                  <History className="w-4 h-4 text-[#6B7280]" />
                  Conversation
                </h3>
                <span className="text-xs text-[#6B7280]">
                  {ticket.messages.length} messages
                </span>
              </div>

              <div className="space-y-4">
                {ticket.messages.map((message) => (
                  <MessageBubble key={message.id} message={message} />
                ))}
              </div>
            </div>

            {/* Reply Editor */}
            <div className="bg-[#162240] rounded-xl border border-[#1E3461] p-5">
              <div className="mb-3 flex items-center justify-between">
                <h3 className="text-sm font-medium text-[#F9FAFB]">Reply</h3>
                <div className="flex items-center gap-2">
                  <button className="text-xs text-[#9CA3AF] hover:text-[#F9FAFB] flex items-center gap-1">
                    <FileText className="w-3 h-3" />
                    Canned responses
                    <ChevronDown className="w-3 h-3" />
                  </button>
                </div>
              </div>

              <textarea
                value={replyContent}
                onChange={(e) => setReplyContent(e.target.value)}
                placeholder="Type your reply..."
                className="w-full h-40 bg-[#0A1835] border border-[#1E3461] rounded-lg p-4 text-sm text-[#F9FAFB] placeholder-[#6B7280] resize-none focus:outline-none focus:border-[#3B82F6] transition-colors"
              />

              <div className="flex items-center justify-between mt-4">
                <div className="flex items-center gap-2">
                  <button className="p-2 hover:bg-[#0A1835] rounded-lg transition-colors">
                    <Paperclip className="w-4 h-4 text-[#6B7280]" />
                  </button>
                </div>
                <div className="flex items-center gap-2">
                  <button className="flex items-center gap-2 px-4 py-2 text-sm text-[#9CA3AF] hover:text-[#F9FAFB] hover:bg-[#0A1835] rounded-lg transition-colors">
                    <Save className="w-4 h-4" />
                    Save Draft
                  </button>
                  <button
                    onClick={handleSendReply}
                    disabled={!replyContent.trim()}
                    className="flex items-center gap-2 px-4 py-2 text-sm bg-[#3B82F6] text-white rounded-lg hover:bg-[#1D4ED8] transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    <Send className="w-4 h-4" />
                    Send Reply
                  </button>
                </div>
              </div>
            </div>
          </div>

          {/* Right Panel - AI Draft & Insights */}
          <div className="lg:col-span-2 space-y-6">
            {/* AI Suggested Response */}
            {ticket.aiDraft && (
              <div className="bg-[#162240] rounded-xl border border-[#8B5CF6]/30 overflow-hidden">
                <button
                  onClick={() => setAiDraftExpanded(!aiDraftExpanded)}
                  className="w-full flex items-center justify-between p-4 bg-[#8B5CF6]/10 border-b border-[#8B5CF6]/30"
                >
                  <div className="flex items-center gap-2">
                    <Sparkles className="w-4 h-4 text-[#8B5CF6]" />
                    <span className="text-sm font-semibold text-[#F9FAFB]">
                      AI Suggested Response
                    </span>
                  </div>
                  {aiDraftExpanded ? (
                    <ChevronUp className="w-4 h-4 text-[#9CA3AF]" />
                  ) : (
                    <ChevronDown className="w-4 h-4 text-[#9CA3AF]" />
                  )}
                </button>

                {aiDraftExpanded && (
                  <div className="p-4 space-y-4">
                    {/* Confidence & Sentiment */}
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <p className="text-xs text-[#6B7280] mb-2">Confidence</p>
                        <ConfidenceMeter confidence={ticket.aiDraft.confidence} />
                      </div>
                      <div>
                        <p className="text-xs text-[#6B7280] mb-2">Customer Sentiment</p>
                        <SentimentIndicator sentiment={ticket.aiDraft.sentiment} />
                      </div>
                    </div>

                    {/* Draft Content */}
                    <div className="bg-[#0A1835] rounded-lg p-4 border border-[#1E3461]">
                      <pre className="text-sm text-[#9CA3AF] whitespace-pre-wrap font-sans leading-relaxed">
                        {ticket.aiDraft.content}
                      </pre>
                    </div>

                    {/* Actions */}
                    <div className="flex items-center gap-2">
                      <button
                        onClick={handleRegenerate}
                        disabled={regenerating}
                        className="flex-1 flex items-center justify-center gap-2 px-4 py-2 text-sm border border-[#1E3461] text-[#9CA3AF] hover:text-[#F9FAFB] hover:bg-[#0A1835] rounded-lg transition-colors disabled:opacity-50"
                      >
                        <RefreshCw
                          className={`w-4 h-4 ${regenerating ? 'animate-spin' : ''}`}
                        />
                        {regenerating ? 'Regenerating...' : 'Regenerate'}
                      </button>
                      <button
                        onClick={handleApplyDraft}
                        className="flex-1 flex items-center justify-center gap-2 px-4 py-2 text-sm bg-[#8B5CF6] text-white rounded-lg hover:bg-[#7C3AED] transition-colors"
                      >
                        <Copy className="w-4 h-4" />
                        Apply to Reply
                      </button>
                    </div>

                    {/* Feedback */}
                    <div className="flex items-center justify-center gap-4 pt-2 border-t border-[#1E3461]">
                      <span className="text-xs text-[#6B7280]">Was this helpful?</span>
                      <button className="p-1.5 hover:bg-emerald-500/10 rounded-lg transition-colors">
                        <ThumbsUp className="w-4 h-4 text-[#6B7280] hover:text-emerald-400" />
                      </button>
                      <button className="p-1.5 hover:bg-red-500/10 rounded-lg transition-colors">
                        <ThumbsDown className="w-4 h-4 text-[#6B7280] hover:text-red-400" />
                      </button>
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* Knowledge Base Sources */}
            {ticket.aiDraft && (
              <div className="bg-[#162240] rounded-xl border border-[#1E3461] overflow-hidden">
                <button
                  onClick={() => setSourcesExpanded(!sourcesExpanded)}
                  className="w-full flex items-center justify-between p-4"
                >
                  <div className="flex items-center gap-2">
                    <FileText className="w-4 h-4 text-[#3B82F6]" />
                    <span className="text-sm font-semibold text-[#F9FAFB]">
                      Knowledge Base Sources
                    </span>
                    <span className="text-xs text-[#6B7280]">
                      ({ticket.aiDraft.sources.length})
                    </span>
                  </div>
                  {sourcesExpanded ? (
                    <ChevronUp className="w-4 h-4 text-[#9CA3AF]" />
                  ) : (
                    <ChevronDown className="w-4 h-4 text-[#9CA3AF]" />
                  )}
                </button>

                {sourcesExpanded && (
                  <div className="p-4 pt-0 space-y-2">
                    {ticket.aiDraft.sources.map((source) => (
                      <div
                        key={source.id}
                        className="flex items-center justify-between p-3 bg-[#0A1835] rounded-lg hover:bg-[#0D1B38] transition-colors cursor-pointer"
                      >
                        <div className="flex items-center gap-3">
                          <FileText className="w-4 h-4 text-[#3B82F6]" />
                          <span className="text-sm text-[#F9FAFB]">{source.title}</span>
                        </div>
                        <span className="text-xs text-[#6B7280]">
                          {source.relevance}% match
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* Ticket Metadata */}
            <div className="bg-[#162240] rounded-xl border border-[#1E3461] p-4">
              <h3 className="text-sm font-semibold text-[#F9FAFB] mb-4">Details</h3>
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-sm text-[#6B7280]">Assignee</span>
                  <span className="text-sm text-[#F9FAFB]">
                    {ticket.assignee || 'Unassigned'}
                  </span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-sm text-[#6B7280]">Channel</span>
                  <span className="text-sm text-[#F9FAFB] capitalize">{ticket.channel}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-sm text-[#6B7280]">Category</span>
                  <span className="text-sm text-[#F9FAFB]">{ticket.category}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-sm text-[#6B7280]">Created</span>
                  <span className="text-sm text-[#9CA3AF] flex items-center gap-1">
                    <Clock className="w-3 h-3" />
                    {new Date(ticket.createdAt).toLocaleDateString()}
                  </span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-sm text-[#6B7280]">Last Updated</span>
                  <span className="text-sm text-[#9CA3AF] flex items-center gap-1">
                    <Clock className="w-3 h-3" />
                    {new Date(ticket.updatedAt).toLocaleDateString()}
                  </span>
                </div>
              </div>
            </div>

            {/* Quick Actions */}
            <div className="bg-[#162240] rounded-xl border border-[#1E3461] p-4">
              <h3 className="text-sm font-semibold text-[#F9FAFB] mb-4">Quick Actions</h3>
              <div className="grid grid-cols-2 gap-2">
                <button className="flex items-center justify-center gap-2 px-3 py-2 text-sm bg-[#0A1835] text-[#9CA3AF] hover:text-[#F9FAFB] rounded-lg transition-colors">
                  <User className="w-4 h-4" />
                  View Customer
                </button>
                <button className="flex items-center justify-center gap-2 px-3 py-2 text-sm bg-[#0A1835] text-[#9CA3AF] hover:text-[#F9FAFB] rounded-lg transition-colors">
                  <Building2 className="w-4 h-4" />
                  View Company
                </button>
                <button className="flex items-center justify-center gap-2 px-3 py-2 text-sm bg-[#0A1835] text-[#9CA3AF] hover:text-[#F9FAFB] rounded-lg transition-colors">
                  <AlertTriangle className="w-4 h-4" />
                  Flag Issue
                </button>
                <button className="flex items-center justify-center gap-2 px-3 py-2 text-sm bg-[#0A1835] text-[#9CA3AF] hover:text-[#F9FAFB] rounded-lg transition-colors">
                  <MessageSquare className="w-4 h-4" />
                  Add Note
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
