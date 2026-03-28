import React, { useState, useCallback, useMemo, useEffect } from 'react';
import {
  Search,
  Filter,
  SortAsc,
  SortDesc,
  Clock,
  Sparkles,
  AlertTriangle,
  User,
  ChevronRight,
  RefreshCw,
  Users,
  X,
  MessageSquare,
  ExternalLink,
  Loader2,
} from 'lucide-react';
import toast from 'react-hot-toast';
import { useGetTicketsQuery, useEscalateTicketMutation, useCloseTicketMutation, useReassignTicketMutation, useAddTicketNoteMutation } from '../api/ticketsApi';
import { useGetCustomerCardQuery } from '../api/customersApi';
import { useTicketSocket } from '../hooks/useTicketSocket';
import { PriorityBadge, PriorityDot } from '../components/PriorityBadge';
import { SentimentBar, SentimentEmoji } from '../components/SentimentBar';
import { AIDraftPanel } from '../components/AIDraftPanel';
import { CustomerContextCard } from '../components/CustomerContextCard';
import { ResponseHistoryAccordion } from '../components/ResponseHistoryAccordion';
import type { Ticket, TicketStatus, InternalPriority, TicketSource, TicketListQuery } from '../types/ticket';

// Filter state type
interface FilterState {
  statuses: TicketStatus[];
  priorities: InternalPriority[];
  categories: string[];
  assignedToMe: boolean;
  draftReady: boolean;
}

// Status options
const statusOptions: { value: TicketStatus; label: string }[] = [
  { value: 'new', label: 'New' },
  { value: 'open', label: 'Open' },
  { value: 'pending', label: 'Pending' },
  { value: 'on-hold', label: 'On Hold' },
  { value: 'solved', label: 'Solved' },
  { value: 'closed', label: 'Closed' },
];

// Priority options with colors
const priorityOptions: { value: InternalPriority; label: string; color: string }[] = [
  { value: 'urgent', label: 'Urgent', color: 'bg-red-500' },
  { value: 'high', label: 'High', color: 'bg-amber-500' },
  { value: 'normal', label: 'Normal', color: 'bg-blue-500' },
  { value: 'low', label: 'Low', color: 'bg-gray-400' },
];

// Category options (can be dynamic based on company)
const categoryOptions = [
  'Technical Support',
  'Billing',
  'Account',
  'Feature Request',
  'Bug Report',
  'General Inquiry',
];

// Sort options
const sortOptions: { value: TicketListQuery['sortBy']; label: string }[] = [
  { value: 'createdAt', label: 'Created Date' },
  { value: 'updatedAt', label: 'Last Updated' },
  { value: 'priority', label: 'Priority' },
  { value: 'sla.responseDeadline', label: 'SLA Deadline' },
];

function formatTimeAgo(dateString: string): string {
  const seconds = Math.floor((Date.now() - new Date(dateString).getTime()) / 1000);
  if (seconds < 60) return 'just now';
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

function getSLAStatus(deadline?: string): { color: string; urgent: boolean; text: string } {
  if (!deadline) return { color: 'bg-gray-400', urgent: false, text: 'No SLA' };
  
  const remaining = new Date(deadline).getTime() - Date.now();
  const minutes = Math.floor(remaining / (1000 * 60));
  
  if (minutes < 0) return { color: 'bg-red-500', urgent: true, text: 'Breached' };
  if (minutes < 30) return { color: 'bg-red-500', urgent: true, text: `${minutes}m left` };
  if (minutes < 60) return { color: 'bg-amber-500', urgent: false, text: `${minutes}m left` };
  
  const hours = Math.floor(minutes / 60);
  return { color: 'bg-green-500', urgent: false, text: `${hours}h left` };
}

function getCustomerId(ticket: Ticket): string | undefined {
  if (!ticket.customerId) return undefined;
  if (typeof ticket.customerId === 'string') return ticket.customerId;
  return ticket.customerId._id;
}

function getCustomerDisplay(ticket: Ticket): { name?: string; email?: string } {
  if (!ticket.customerId) return {};
  if (typeof ticket.customerId === 'string') return {};
  return {
    name: ticket.customerId.name,
    email: ticket.customerId.email,
  };
}

// Filters Sidebar Component
function FiltersSidebar({
  filters,
  onChange,
}: {
  filters: FilterState;
  onChange: (filters: FilterState) => void;
}): React.ReactElement {
  const toggleStatus = (status: TicketStatus) => {
    const newStatuses = filters.statuses.includes(status)
      ? filters.statuses.filter((s) => s !== status)
      : [...filters.statuses, status];
    onChange({ ...filters, statuses: newStatuses });
  };

  const togglePriority = (priority: InternalPriority) => {
    const newPriorities = filters.priorities.includes(priority)
      ? filters.priorities.filter((p) => p !== priority)
      : [...filters.priorities, priority];
    onChange({ ...filters, priorities: newPriorities });
  };

  const toggleCategory = (category: string) => {
    const newCategories = filters.categories.includes(category)
      ? filters.categories.filter((c) => c !== category)
      : [...filters.categories, category];
    onChange({ ...filters, categories: newCategories });
  };

  const clearFilters = () => {
    onChange({
      statuses: [],
      priorities: [],
      categories: [],
      assignedToMe: false,
      draftReady: false,
    });
  };

  const hasFilters =
    filters.statuses.length > 0 ||
    filters.priorities.length > 0 ||
    filters.categories.length > 0 ||
    filters.assignedToMe ||
    filters.draftReady;

  return (
    <aside className="w-[220px] flex-shrink-0 border-r border-gray-200 bg-gray-50 p-4 overflow-y-auto">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <Filter className="w-4 h-4 text-gray-500" />
          <span className="font-medium text-gray-900">Filters</span>
        </div>
        {hasFilters && (
          <button
            onClick={clearFilters}
            className="text-xs text-blue-600 hover:text-blue-800"
          >
            Clear all
          </button>
        )}
      </div>

      {/* Status Filters */}
      <div className="mb-5">
        <h4 className="text-xs font-medium text-gray-500 uppercase tracking-wider mb-2">
          Status
        </h4>
        <div className="space-y-1.5">
          {statusOptions.map((option) => (
            <label key={option.value} className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={filters.statuses.includes(option.value)}
                onChange={() => toggleStatus(option.value)}
                className="w-3.5 h-3.5 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
              />
              <span className="text-sm text-gray-700">{option.label}</span>
            </label>
          ))}
        </div>
      </div>

      {/* Priority Filters */}
      <div className="mb-5">
        <h4 className="text-xs font-medium text-gray-500 uppercase tracking-wider mb-2">
          Priority
        </h4>
        <div className="space-y-1.5">
          {priorityOptions.map((option) => (
            <label key={option.value} className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={filters.priorities.includes(option.value)}
                onChange={() => togglePriority(option.value)}
                className="w-3.5 h-3.5 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
              />
              <span className={`w-2 h-2 rounded-full ${option.color}`} />
              <span className="text-sm text-gray-700">{option.label}</span>
            </label>
          ))}
        </div>
      </div>

      {/* Category Filters */}
      <div className="mb-5">
        <h4 className="text-xs font-medium text-gray-500 uppercase tracking-wider mb-2">
          Category
        </h4>
        <div className="space-y-1.5">
          {categoryOptions.map((category) => (
            <label key={category} className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={filters.categories.includes(category)}
                onChange={() => toggleCategory(category)}
                className="w-3.5 h-3.5 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
              />
              <span className="text-sm text-gray-700">{category}</span>
            </label>
          ))}
        </div>
      </div>

      {/* Toggle Filters */}
      <div className="space-y-3">
        <label className="flex items-center gap-2 cursor-pointer">
          <input
            type="checkbox"
            checked={filters.assignedToMe}
            onChange={(e) => onChange({ ...filters, assignedToMe: e.target.checked })}
            className="w-3.5 h-3.5 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
          />
          <User className="w-3.5 h-3.5 text-gray-400" />
          <span className="text-sm text-gray-700">Assigned to me</span>
        </label>

        <label className="flex items-center gap-2 cursor-pointer">
          <input
            type="checkbox"
            checked={filters.draftReady}
            onChange={(e) => onChange({ ...filters, draftReady: e.target.checked })}
            className="w-3.5 h-3.5 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
          />
          <Sparkles className="w-3.5 h-3.5 text-purple-500" />
          <span className="text-sm text-gray-700">Draft Ready</span>
        </label>
      </div>
    </aside>
  );
}

// Ticket Row Component
function TicketRow({
  ticket,
  isSelected,
  onClick,
}: {
  ticket: Ticket;
  isSelected: boolean;
  onClick: () => void;
}): React.ReactElement {
  const customer = getCustomerDisplay(ticket);
  const sla = getSLAStatus(ticket.sla?.responseDeadline);
  const isP1 = ticket.priority === 'urgent';
  const hasDraft = !!ticket.aiDraft;

  return (
    <div
      onClick={onClick}
      className={`
        flex items-center gap-3 px-4 py-3 border-b border-gray-100 cursor-pointer transition-colors
        ${isSelected ? 'bg-blue-50 border-l-4 border-l-blue-500' : 'border-l-4 border-l-transparent hover:bg-gray-50'}
        ${isP1 && !isSelected ? 'bg-red-50/50' : ''}
      `}
    >
      {/* Priority Badge */}
      <div className="flex-shrink-0 w-14">
        <PriorityBadge priority={ticket.priority} size="sm" />
      </div>

      {/* Subject + Customer */}
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-gray-900 truncate">{ticket.subject}</p>
        <p className="text-xs text-gray-500 truncate">
          {customer.name || customer.email || 'Unknown customer'}
        </p>
      </div>

      {/* Category Chip */}
      <div className="flex-shrink-0">
        {ticket.classification?.intent && (
          <span className="inline-flex items-center px-2 py-0.5 rounded text-xs bg-gray-100 text-gray-600">
            {ticket.classification.intent}
          </span>
        )}
      </div>

      {/* Sentiment Emoji */}
      <div className="flex-shrink-0 w-6">
        <SentimentEmoji sentiment={ticket.sentiment} size="sm" />
      </div>

      {/* Draft Badge */}
      <div className="flex-shrink-0 w-6">
        {hasDraft && (
          <Sparkles className="w-4 h-4 text-purple-500" title="AI Draft Ready" />
        )}
      </div>

      {/* Time + SLA */}
      <div className="flex-shrink-0 flex items-center gap-2 text-xs text-gray-500">
        <span>{formatTimeAgo(ticket.createdAt)}</span>
        <span className={`w-2 h-2 rounded-full ${sla.color}`} title={sla.text} />
      </div>

      {/* Chevron */}
      <ChevronRight className="w-4 h-4 text-gray-400 flex-shrink-0" />
    </div>
  );
}

// Ticket Detail Panel Component
function TicketDetailPanel({
  ticket,
  onClose,
}: {
  ticket: Ticket;
  onClose: () => void;
}): React.ReactElement {
  const [noteText, setNoteText] = useState('');
  const customerId = getCustomerId(ticket);
  
  const { data: customerData } = useGetCustomerCardQuery(customerId ?? '', {
    skip: !customerId,
  });

  const [escalateTicket, { isLoading: isEscalating }] = useEscalateTicketMutation();
  const [closeTicket, { isLoading: isClosing }] = useCloseTicketMutation();
  const [reassignTicket, { isLoading: isReassigning }] = useReassignTicketMutation();
  const [addNote, { isLoading: isAddingNote }] = useAddTicketNoteMutation();

  const sla = getSLAStatus(ticket.sla?.responseDeadline);

  const handleEscalate = async () => {
    try {
      await escalateTicket({ id: ticket._id, reason: 'Manual escalation' }).unwrap();
      toast.success('Ticket escalated');
    } catch {
      toast.error('Failed to escalate ticket');
    }
  };

  const handleClose = async () => {
    try {
      await closeTicket({ id: ticket._id }).unwrap();
      toast.success('Ticket closed');
      onClose();
    } catch {
      toast.error('Failed to close ticket');
    }
  };

  const handleAddNote = async () => {
    if (!noteText.trim()) return;
    try {
      await addNote({ id: ticket._id, note: noteText }).unwrap();
      setNoteText('');
      toast.success('Note added');
    } catch {
      toast.error('Failed to add note');
    }
  };

  return (
    <aside className="w-[440px] flex-shrink-0 border-l border-gray-200 bg-white overflow-y-auto">
      {/* Header */}
      <div className="sticky top-0 bg-white border-b border-gray-200 px-4 py-3 flex items-center justify-between z-10">
        <h3 className="font-medium text-gray-900 truncate flex-1">{ticket.subject}</h3>
        <button
          onClick={onClose}
          className="p-1.5 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded"
        >
          <X className="w-4 h-4" />
        </button>
      </div>

      <div className="p-4 space-y-4">
        {/* Customer Context Card */}
        {customerData?.customer && (
          <CustomerContextCard
            card={customerData.customer}
            mode="compact"
          />
        )}

        {/* Ticket Content */}
        <div className="rounded-lg border border-gray-200 bg-gray-50 p-4">
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-2">
              <PriorityBadge priority={ticket.priority} size="sm" />
              <span className="text-xs text-gray-500">{ticket.status}</span>
            </div>
            {ticket.externalUrl && (
              <a
                href={ticket.externalUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="text-blue-600 hover:text-blue-800"
              >
                <ExternalLink className="w-4 h-4" />
              </a>
            )}
          </div>
          <h4 className="font-medium text-gray-900 mb-2">{ticket.subject}</h4>
          <p className="text-sm text-gray-700 whitespace-pre-wrap">{ticket.description}</p>
          <div className="mt-3 flex flex-wrap gap-1">
            {ticket.tags.map((tag) => (
              <span
                key={tag}
                className="inline-flex items-center px-2 py-0.5 rounded text-xs bg-gray-200 text-gray-600"
              >
                {tag}
              </span>
            ))}
          </div>
        </div>

        {/* AI Draft Panel */}
        <AIDraftPanel ticket={ticket} />

        {/* Sentiment Bar */}
        <div className="rounded-lg border border-gray-200 p-4">
          <h4 className="text-sm font-medium text-gray-700 mb-3">Customer Sentiment</h4>
          <SentimentBar sentiment={ticket.sentiment} showScore />
        </div>

        {/* SLA Countdown */}
        <div
          className={`rounded-lg border p-4 ${
            sla.urgent ? 'border-red-200 bg-red-50' : 'border-gray-200 bg-gray-50'
          }`}
        >
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Clock className={`w-4 h-4 ${sla.urgent ? 'text-red-600' : 'text-gray-500'}`} />
              <span className={`text-sm font-medium ${sla.urgent ? 'text-red-700' : 'text-gray-700'}`}>
                SLA Response Time
              </span>
            </div>
            <span
              className={`text-sm font-medium ${
                sla.urgent ? 'text-red-600' : 'text-gray-600'
              }`}
            >
              {sla.text}
            </span>
          </div>
          {ticket.sla?.isBreached && (
            <div className="mt-2 flex items-center gap-1 text-red-600">
              <AlertTriangle className="w-4 h-4" />
              <span className="text-xs font-medium">SLA Breached</span>
            </div>
          )}
        </div>

        {/* Add Note */}
        <div className="rounded-lg border border-gray-200 p-4">
          <h4 className="text-sm font-medium text-gray-700 mb-2">Add Internal Note</h4>
          <textarea
            value={noteText}
            onChange={(e) => setNoteText(e.target.value)}
            placeholder="Add a note..."
            className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
            rows={2}
          />
          <button
            onClick={handleAddNote}
            disabled={!noteText.trim() || isAddingNote}
            className="mt-2 inline-flex items-center gap-1.5 px-3 py-1.5 bg-gray-100 text-gray-700 text-sm font-medium rounded-lg hover:bg-gray-200 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {isAddingNote ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <MessageSquare className="w-3.5 h-3.5" />}
            Add Note
          </button>
        </div>

        {/* Response History */}
        <ResponseHistoryAccordion ticketId={ticket._id} />

        {/* Action Buttons */}
        <div className="flex flex-wrap gap-2">
          <button
            onClick={() => toast('Reassign modal would open')}
            disabled={isReassigning}
            className="flex-1 inline-flex items-center justify-center gap-1.5 px-3 py-2 border border-gray-200 text-gray-700 text-sm font-medium rounded-lg hover:bg-gray-50 disabled:opacity-50"
          >
            <Users className="w-4 h-4" />
            Reassign
          </button>
          <button
            onClick={handleEscalate}
            disabled={isEscalating}
            className="flex-1 inline-flex items-center justify-center gap-1.5 px-3 py-2 border border-amber-200 text-amber-700 text-sm font-medium rounded-lg hover:bg-amber-50 disabled:opacity-50"
          >
            {isEscalating ? <Loader2 className="w-4 h-4 animate-spin" /> : <AlertTriangle className="w-4 h-4" />}
            Escalate
          </button>
          <button
            onClick={handleClose}
            disabled={isClosing}
            className="flex-1 inline-flex items-center justify-center gap-1.5 px-3 py-2 border border-green-200 text-green-700 text-sm font-medium rounded-lg hover:bg-green-50 disabled:opacity-50"
          >
            {isClosing ? <Loader2 className="w-4 h-4 animate-spin" /> : <X className="w-4 h-4" />}
            Close
          </button>
        </div>
      </div>
    </aside>
  );
}

// Main TicketQueue Page
export function TicketQueue(): React.ReactElement {
  // Mock user for demo - in production, get from auth context
  const companyId = 'demo-company';
  const currentUserId = 'current-user';

  const [filters, setFilters] = useState<FilterState>({
    statuses: [],
    priorities: [],
    categories: [],
    assignedToMe: false,
    draftReady: false,
  });

  const [sortBy, setSortBy] = useState<TicketListQuery['sortBy']>('createdAt');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('desc');
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedTicketId, setSelectedTicketId] = useState<string | null>(null);

  // Build query params from filters
  const queryParams = useMemo<TicketListQuery>(() => {
    const params: TicketListQuery = {
      sortBy,
      sortOrder,
      page: 1,
      limit: 50,
    };

    if (filters.statuses.length === 1) {
      params.status = filters.statuses[0];
    }
    if (filters.priorities.length === 1) {
      params.priority = filters.priorities[0];
    }
    if (filters.assignedToMe) {
      params.assignedTo = currentUserId;
    }
    if (filters.draftReady) {
      params.hasDraft = true;
    }

    return params;
  }, [filters, sortBy, sortOrder, currentUserId]);

  // Fetch tickets
  const { data, isLoading, isFetching, refetch } = useGetTicketsQuery(queryParams);

  // Setup socket for real-time updates
  useTicketSocket({
    companyId,
    onTicketClassified: (event) => {
      toast.success(`Ticket classified: ${event.classification.category}`);
    },
    onDraftReady: (event) => {
      toast.success('AI draft ready!', { icon: '✨' });
    },
  });

  // Filter tickets client-side for multi-select filters and search
  const filteredTickets = useMemo(() => {
    if (!data?.tickets) return [];

    return data.tickets.filter((ticket) => {
      // Multi-status filter
      if (filters.statuses.length > 1 && !filters.statuses.includes(ticket.status)) {
        return false;
      }
      // Multi-priority filter
      if (filters.priorities.length > 1 && !filters.priorities.includes(ticket.priority)) {
        return false;
      }
      // Category filter
      if (filters.categories.length > 0) {
        const ticketCategory = ticket.classification?.intent ?? '';
        if (!filters.categories.some((c) => ticketCategory.toLowerCase().includes(c.toLowerCase()))) {
          return false;
        }
      }
      // Search filter
      if (searchQuery) {
        const query = searchQuery.toLowerCase();
        const customer = getCustomerDisplay(ticket);
        const searchable = [
          ticket.subject,
          ticket.description,
          customer.name,
          customer.email,
          ticket.classification?.intent,
        ]
          .filter(Boolean)
          .join(' ')
          .toLowerCase();
        if (!searchable.includes(query)) {
          return false;
        }
      }
      return true;
    });
  }, [data?.tickets, filters, searchQuery]);

  const selectedTicket = filteredTickets.find((t) => t._id === selectedTicketId);

  const toggleSortOrder = () => {
    setSortOrder((prev) => (prev === 'asc' ? 'desc' : 'asc'));
  };

  return (
    <div className="flex h-screen bg-gray-100">
      {/* Left: Filters Sidebar */}
      <FiltersSidebar filters={filters} onChange={setFilters} />

      {/* Center: Ticket List */}
      <main className="flex-1 flex flex-col overflow-hidden">
        {/* Sort Bar */}
        <div className="bg-white border-b border-gray-200 px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-4">
            {/* Search */}
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search tickets..."
                className="pl-9 pr-4 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 w-64"
              />
            </div>

            {/* Count */}
            <span className="text-sm text-gray-500">
              {filteredTickets.length} ticket{filteredTickets.length !== 1 ? 's' : ''}
            </span>
          </div>

          <div className="flex items-center gap-2">
            {/* Sort dropdown */}
            <select
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value as TicketListQuery['sortBy'])}
              className="px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              {sortOptions.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>

            {/* Sort order toggle */}
            <button
              onClick={toggleSortOrder}
              className="p-2 border border-gray-200 rounded-lg hover:bg-gray-50"
              title={sortOrder === 'asc' ? 'Ascending' : 'Descending'}
            >
              {sortOrder === 'asc' ? (
                <SortAsc className="w-4 h-4 text-gray-600" />
              ) : (
                <SortDesc className="w-4 h-4 text-gray-600" />
              )}
            </button>

            {/* Refresh button */}
            <button
              onClick={() => refetch()}
              disabled={isFetching}
              className="p-2 border border-gray-200 rounded-lg hover:bg-gray-50 disabled:opacity-50"
              title="Refresh"
            >
              <RefreshCw className={`w-4 h-4 text-gray-600 ${isFetching ? 'animate-spin' : ''}`} />
            </button>
          </div>
        </div>

        {/* Ticket List */}
        <div className="flex-1 overflow-y-auto bg-white">
          {isLoading ? (
            <div className="flex items-center justify-center h-64">
              <Loader2 className="w-8 h-8 text-blue-500 animate-spin" />
            </div>
          ) : filteredTickets.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-64 text-gray-500">
              <MessageSquare className="w-12 h-12 mb-2 opacity-50" />
              <p className="text-lg font-medium">No tickets found</p>
              <p className="text-sm">Try adjusting your filters</p>
            </div>
          ) : (
            filteredTickets.map((ticket) => (
              <TicketRow
                key={ticket._id}
                ticket={ticket}
                isSelected={ticket._id === selectedTicketId}
                onClick={() => setSelectedTicketId(ticket._id)}
              />
            ))
          )}
        </div>
      </main>

      {/* Right: Detail Panel */}
      {selectedTicket && (
        <TicketDetailPanel
          ticket={selectedTicket}
          onClose={() => setSelectedTicketId(null)}
        />
      )}
    </div>
  );
}

export default TicketQueue;
