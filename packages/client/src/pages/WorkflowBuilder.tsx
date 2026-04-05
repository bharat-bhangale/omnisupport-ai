import React, { useState, useCallback, useMemo } from 'react';
import {
  Plus,
  Edit2,
  Trash2,
  Play,
  Zap,
  Clock,
  CheckCircle,
  XCircle,
  ChevronRight,
  ChevronDown,
  GripVertical,
  AlertTriangle,
  Mail,
  MessageSquare,
  Globe,
  Tag,
  UserPlus,
  XOctagon,
  ArrowUp,
  FileText,
  Loader2,
  X,
  Copy,
  Sparkles,
  History,
  LayoutGrid,
  List,
  Filter,
  Calendar,
  TrendingUp,
  Users,
  Bell,
  Shield,
  Settings,
  Inbox,
  FlaskConical,
  Check,
} from 'lucide-react';
import toast from 'react-hot-toast';
import {
  useGetWorkflowsQuery,
  useGetTemplatesQuery,
  useGetWorkflowHistoryQuery,
  useCreateWorkflowMutation,
  useUpdateWorkflowMutation,
  useDeleteWorkflowMutation,
  useToggleWorkflowActiveMutation,
  useTestWorkflowMutation,
  useCreateFromTemplateMutation,
  type Workflow,
  type WorkflowTemplate,
  type WorkflowTriggerEvent,
  type ConditionOperator,
  type WorkflowActionType,
  type WorkflowCondition,
  type WorkflowAction,
  type CreateWorkflowPayload,
  type WorkflowExecutionLog,
} from '../api/workflowsApi';

// Tab types
type TabType = 'workflows' | 'templates' | 'history';

// Trigger event options with icons
const TRIGGER_EVENTS: { value: WorkflowTriggerEvent; label: string; description: string; icon: React.ReactNode }[] = [
  { value: 'ticket:created', label: 'Ticket Received', description: 'When a new ticket is created', icon: <Inbox className="w-5 h-5" /> },
  { value: 'ticket:classified', label: 'Ticket Classified', description: 'When AI classifies a ticket', icon: <Tag className="w-5 h-5" /> },
  { value: 'ticket:sla_warning', label: 'SLA Deadline Approaching', description: 'When SLA is about to breach', icon: <Clock className="w-5 h-5" /> },
  { value: 'customer:at_risk', label: 'Customer Sentiment Drops', description: 'When sentiment score drops', icon: <TrendingUp className="w-5 h-5" /> },
  { value: 'ticket:escalated', label: 'Ticket Reassigned', description: 'When a ticket is reassigned', icon: <ArrowUp className="w-5 h-5" /> },
];

// Condition operators
const CONDITION_OPERATORS: { value: ConditionOperator; label: string }[] = [
  { value: 'equals', label: 'Equals' },
  { value: 'not_equals', label: 'Not Equals' },
  { value: 'contains', label: 'Contains' },
  { value: 'not_contains', label: 'Does Not Contain' },
  { value: 'greater_than', label: 'Greater Than' },
  { value: 'less_than', label: 'Less Than' },
  { value: 'in', label: 'In List' },
  { value: 'exists', label: 'Exists' },
  { value: 'not_exists', label: 'Does Not Exist' },
];

// Condition fields
const CONDITION_FIELDS = [
  { value: 'customer.tier', label: 'Customer Tier' },
  { value: 'priority', label: 'Priority' },
  { value: 'classification.intent', label: 'Category' },
  { value: 'sentiment', label: 'Sentiment Score' },
  { value: 'assignedTo', label: 'Assigned Agent' },
  { value: 'tags', label: 'Tags' },
  { value: 'createdAt.hour', label: 'Time of Day' },
  { value: 'createdAt.dayOfWeek', label: 'Day of Week' },
];

// Template category config
const TEMPLATE_CATEGORIES: Record<string, { label: string; icon: React.ReactNode; color: string }> = {
  routing: { label: 'Routing', icon: <Users className="w-5 h-5" />, color: 'bg-blue-100 text-blue-600' },
  notification: { label: 'Notification', icon: <Bell className="w-5 h-5" />, color: 'bg-purple-100 text-purple-600' },
  escalation: { label: 'Escalation', icon: <ArrowUp className="w-5 h-5" />, color: 'bg-red-100 text-red-600' },
  automation: { label: 'Automation', icon: <Settings className="w-5 h-5" />, color: 'bg-green-100 text-green-600' },
  sla: { label: 'SLA', icon: <Clock className="w-5 h-5" />, color: 'bg-amber-100 text-amber-600' },
};

// Action types with icons and param schemas
const ACTION_TYPES: {
  value: WorkflowActionType;
  label: string;
  icon: React.ReactNode;
  params: { key: string; label: string; type: 'text' | 'select' | 'textarea'; options?: string[]; placeholder?: string }[];
}[] = [
  {
    value: 'assign_agent',
    label: 'Assign Agent',
    icon: <UserPlus className="w-4 h-4" />,
    params: [
      { key: 'agentId', label: 'Agent/Queue', type: 'select', options: ['senior_queue', 'finance_queue', 'tech_queue', 'general_queue'] },
    ],
  },
  {
    value: 'add_tag',
    label: 'Add Tag',
    icon: <Tag className="w-4 h-4" />,
    params: [{ key: 'tag', label: 'Tag Name', type: 'text', placeholder: 'e.g., vip-priority' }],
  },
  {
    value: 'send_email',
    label: 'Send Email',
    icon: <Mail className="w-4 h-4" />,
    params: [
      { key: 'template', label: 'Template', type: 'select', options: ['ack_p1', 'sla_breach', 'escalation_notice'] },
      { key: 'to', label: 'To', type: 'select', options: ['customer', 'manager', 'assigned_agent'] },
    ],
  },
  {
    value: 'notify_slack',
    label: 'Notify Slack',
    icon: <MessageSquare className="w-4 h-4" />,
    params: [
      { key: 'message', label: 'Message', type: 'textarea', placeholder: 'Use {subject}, {priority}, {customerName}' },
    ],
  },
  {
    value: 'webhook',
    label: 'Call Webhook',
    icon: <Globe className="w-4 h-4" />,
    params: [
      { key: 'url', label: 'URL', type: 'text', placeholder: 'https://api.example.com/webhook' },
      { key: 'method', label: 'Method', type: 'select', options: ['POST', 'GET', 'PUT'] },
    ],
  },
  {
    value: 'create_ticket',
    label: 'Create Ticket',
    icon: <FileText className="w-4 h-4" />,
    params: [
      { key: 'subject', label: 'Subject', type: 'text', placeholder: 'Follow-up: {subject}' },
      { key: 'priority', label: 'Priority', type: 'select', options: ['low', 'normal', 'high', 'urgent'] },
    ],
  },
  {
    value: 'close_ticket',
    label: 'Close Ticket',
    icon: <XOctagon className="w-4 h-4" />,
    params: [{ key: 'reason', label: 'Resolution Reason', type: 'text', placeholder: 'Automatically resolved' }],
  },
  {
    value: 'escalate',
    label: 'Escalate',
    icon: <ArrowUp className="w-4 h-4" />,
    params: [
      { key: 'priority', label: 'Priority', type: 'select', options: ['normal', 'high', 'urgent'] },
    ],
  },
  {
    value: 'set_priority',
    label: 'Set Priority',
    icon: <AlertTriangle className="w-4 h-4" />,
    params: [
      { key: 'priority', label: 'Priority', type: 'select', options: ['low', 'normal', 'high', 'urgent'] },
    ],
  },
  {
    value: 'add_note',
    label: 'Add Note',
    icon: <FileText className="w-4 h-4" />,
    params: [{ key: 'note', label: 'Note Content', type: 'textarea', placeholder: 'Internal note...' }],
  },
];

// Template icons
const TEMPLATE_ICONS: Record<string, React.ReactNode> = {
  'auto-acknowledge-p1': <Bell className="w-6 h-6 text-red-500" />,
  'vip-customer-fast-track': <Sparkles className="w-6 h-6 text-purple-500" />,
  'sla-breach-alert': <AlertTriangle className="w-6 h-6 text-amber-500" />,
  'billing-to-finance-queue': <Tag className="w-6 h-6 text-green-500" />,
  'negative-sentiment-escalation': <TrendingUp className="w-6 h-6 text-red-500" />,
  'enterprise-priority-routing': <Shield className="w-6 h-6 text-blue-500" />,
  'technical-support-routing': <Settings className="w-6 h-6 text-cyan-500" />,
  'after-hours-auto-response': <Clock className="w-6 h-6 text-indigo-500" />,
  'churn-risk-alert': <AlertTriangle className="w-6 h-6 text-orange-500" />,
  'negative-feedback-followup': <MessageSquare className="w-6 h-6 text-pink-500" />,
};

function formatTimeAgo(dateString?: string): string {
  if (!dateString) return 'Never';
  const seconds = Math.floor((Date.now() - new Date(dateString).getTime()) / 1000);
  if (seconds < 60) return 'just now';
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`;
  return `${(ms / 60000).toFixed(1)}m`;
}

function formatDateShort(dateString: string): string {
  const date = new Date(dateString);
  const today = new Date();
  const isToday = date.toDateString() === today.toDateString();
  if (isToday) return `Today ${date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`;
  return date.toLocaleDateString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
}

function getTriggerLabel(event: WorkflowTriggerEvent): string {
  return TRIGGER_EVENTS.find((e) => e.value === event)?.label || event;
}

// =============================
// Workflow Card Component
// =============================
function WorkflowCard({
  workflow,
  onEdit,
  onDelete,
  onToggleActive,
}: {
  workflow: Workflow;
  onEdit: () => void;
  onDelete: () => void;
  onToggleActive: () => void;
}): React.ReactElement {
  const conditionsSummary = workflow.conditions.length > 0
    ? workflow.conditions
        .slice(0, 2)
        .map((c) => `${CONDITION_FIELDS.find((f) => f.value === c.field)?.label || c.field}=${String(c.value)}`)
        .join(` ${workflow.conditionLogic} `)
    : null;

  const visibleActions = workflow.actions.slice(0, 3);
  const hiddenCount = workflow.actions.length - 3;

  return (
    <div className="bg-[#162240] rounded-lg border border-[#1E3461] overflow-hidden hover:shadow-md transition-shadow">
      {/* Header */}
      <div className="px-4 py-3 border-b border-[#1E3461] flex items-center justify-between">
        <h3 className="font-semibold text-[#F9FAFB] truncate">{workflow.name}</h3>
        <button
          onClick={(e) => { e.stopPropagation(); onToggleActive(); }}
          className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
            workflow.isActive ? 'bg-green-500' : 'bg-gray-600'
          }`}
        >
          <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
            workflow.isActive ? 'translate-x-6' : 'translate-x-1'
          }`} />
        </button>
      </div>

      <div className="p-4 space-y-3">
        {/* Trigger Pill */}
        <div className="flex items-center gap-2">
          <span className="text-xs text-[#9CA3AF] font-medium">When:</span>
          <span className="inline-flex items-center px-2 py-1 rounded-full text-xs bg-cyan-900/30 text-cyan-400 border border-cyan-700">
            <Zap className="w-3 h-3 mr-1" />
            {getTriggerLabel(workflow.trigger.event)}
          </span>
        </div>

        {/* Conditions */}
        {conditionsSummary && (
          <div className="flex items-start gap-2">
            <span className="text-xs text-[#9CA3AF] font-medium flex-shrink-0">If:</span>
            <span className="text-xs text-[#9CA3AF]">{conditionsSummary}</span>
          </div>
        )}

        {/* Actions List */}
        <div className="space-y-1">
          <span className="text-xs text-[#9CA3AF] font-medium">Then:</span>
          <ol className="list-decimal list-inside text-xs text-[#9CA3AF] space-y-0.5 ml-1">
            {visibleActions.map((action, i) => {
              const cfg = ACTION_TYPES.find((a) => a.value === action.type);
              return (
                <li key={i} className="flex items-center gap-1.5">
                  {cfg?.icon}
                  <span>{cfg?.label || action.type}</span>
                </li>
              );
            })}
            {hiddenCount > 0 && <li className="text-[#6B7280]">+{hiddenCount} more</li>}
          </ol>
        </div>
      </div>

      {/* Footer */}
      <div className="px-4 py-2 bg-[#0F1F3D] border-t border-[#1E3461] flex items-center justify-between">
        <div className="flex items-center gap-4 text-xs text-[#9CA3AF]">
          <span>Triggered {workflow.stats.triggeredCount}×</span>
          <span>Last: {formatTimeAgo(workflow.stats.lastTriggeredAt)}</span></span>
        </div>
        <div className="flex items-center gap-1">
          <button onClick={onEdit} className="p-1.5 text-[#6B7280] hover:text-cyan-400 hover:bg-cyan-900/30 rounded" title="Edit">
            <Edit2 className="w-4 h-4" />
          </button>
          <button onClick={onDelete} className="p-1.5 text-[#6B7280] hover:text-red-400 hover:bg-red-900/30 rounded" title="Delete">
            <Trash2 className="w-4 h-4" />
          </button>
        </div>
      </div>
    </div>
  );
}

// =============================
// Tab 1: My Workflows
// =============================
function MyWorkflowsTab({
  workflows,
  isLoading,
  onNewWorkflow,
  onEditWorkflow,
  onDeleteWorkflow,
  onToggleActive,
}: {
  workflows: Workflow[];
  isLoading: boolean;
  onNewWorkflow: () => void;
  onEditWorkflow: (w: Workflow) => void;
  onDeleteWorkflow: (id: string) => void;
  onToggleActive: (id: string) => void;
}): React.ReactElement {
  const activeCount = workflows.filter((w) => w.isActive).length;

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="w-8 h-8 text-cyan-500 animate-spin" />
      </div>
    );
  }

  if (workflows.length === 0) {
    return (
      <div className="bg-[#162240] rounded-lg border border-[#1E3461] p-8 text-center">
        <Zap className="w-12 h-12 text-[#6B7280] mx-auto mb-4" />
        <h3 className="text-lg font-medium text-[#F9FAFB]">No workflows yet</h3>
        <p className="text-[#9CA3AF] mt-1 mb-6">Start from a template below ↓</p>
        <button
          onClick={onNewWorkflow}
          className="inline-flex items-center gap-2 px-4 py-2 bg-cyan-600 text-white font-medium rounded-lg hover:bg-cyan-700"
        >
          <Plus className="w-4 h-4" />
          Create Workflow
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <h2 className="text-lg font-semibold text-[#F9FAFB]">My Workflows</h2>
          {activeCount > 0 && (
            <span className="px-2 py-0.5 bg-green-100 text-green-700 text-xs font-medium rounded-full">
              {activeCount} active
            </span>
          )}
        </div>
        <button
          onClick={onNewWorkflow}
          className="inline-flex items-center gap-2 px-4 py-2 bg-cyan-600 text-white font-medium rounded-lg hover:bg-cyan-700"
        >
          <Plus className="w-4 h-4" />
          New Workflow
        </button>
      </div>

      {/* Workflow Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {workflows.map((w) => (
          <WorkflowCard
            key={w._id}
            workflow={w}
            onEdit={() => onEditWorkflow(w)}
            onDelete={() => onDeleteWorkflow(w._id)}
            onToggleActive={() => onToggleActive(w._id)}
          />
        ))}
      </div>
    </div>
  );
}

// =============================
// Tab 2: Templates Gallery
// =============================
function TemplatesTab({
  templates,
  byCategory,
  onSelectTemplate,
  isCreating,
}: {
  templates: WorkflowTemplate[];
  byCategory: Record<string, WorkflowTemplate[]>;
  onSelectTemplate: (t: WorkflowTemplate) => void;
  isCreating: boolean;
}): React.ReactElement {
  const categories = Object.keys(byCategory).filter((c) => byCategory[c]?.length > 0);

  if (templates.length === 0) {
    return (
      <div className="bg-[#162240] rounded-lg border border-[#1E3461] p-8 text-center">
        <LayoutGrid className="w-12 h-12 text-[#6B7280] mx-auto mb-4" />
        <h3 className="text-lg font-medium text-[#F9FAFB]">No templates available</h3>
      </div>
    );
  }

  return (
    <div className="space-y-8">
      {categories.map((category) => (
        <div key={category}>
          <div className="flex items-center gap-2 mb-4">
            <span className={`p-1.5 rounded-lg ${TEMPLATE_CATEGORIES[category]?.color || 'bg-[#1E3461] text-[#9CA3AF]'}`}>
              {TEMPLATE_CATEGORIES[category]?.icon || <Zap className="w-5 h-5" />}
            </span>
            <h3 className="text-lg font-semibold text-[#F9FAFB] capitalize">
              {TEMPLATE_CATEGORIES[category]?.label || category}
            </h3>
            <span className="text-sm text-[#9CA3AF]">({byCategory[category].length})</span>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {byCategory[category].map((template) => (
              <div key={template.id} className="bg-[#162240] rounded-lg border border-[#1E3461] p-4 hover:border-cyan-500 hover:shadow-md transition-all">
                <div className="flex items-start gap-3 mb-3">
                  <div className="p-2 bg-[#0F1F3D] rounded-lg">
                    {TEMPLATE_ICONS[template.id] || <Zap className="w-6 h-6 text-cyan-400" />}
                  </div>
                  <div className="flex-1 min-w-0">
                    <h4 className="font-medium text-[#F9FAFB]">{template.name}</h4>
                    <p className="text-sm text-[#9CA3AF] mt-1 line-clamp-2">{template.description}</p>
                  </div>
                </div>
                <div className="flex flex-wrap gap-1 mb-3">
                  <span className="px-2 py-0.5 bg-cyan-900/30 text-cyan-400 text-xs rounded-full">
                    {getTriggerLabel(template.trigger)}
                  </span>
                  {template.actions.slice(0, 2).map((a, i) => (
                    <span key={i} className="px-2 py-0.5 bg-[#0F1F3D] text-[#9CA3AF] text-xs rounded-full">
                      {ACTION_TYPES.find((at) => at.value === a.type)?.label || a.type}
                    </span>
                  ))}
                </div>
                <button
                  onClick={() => onSelectTemplate(template)}
                  disabled={isCreating}
                  className="w-full px-3 py-2 bg-cyan-600 text-white text-sm font-medium rounded-lg hover:bg-cyan-700 disabled:opacity-50"
                >
                  {isCreating ? <Loader2 className="w-4 h-4 animate-spin mx-auto" /> : 'Use This Template'}
                </button>
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

// =============================
// Tab 3: Execution History
// =============================
function ExecutionHistoryTab({ workflows }: { workflows: Workflow[] }): React.ReactElement {
  const [selectedWorkflowId, setSelectedWorkflowId] = useState<string>(workflows[0]?._id || '');
  const [days, setDays] = useState(7);
  const [expandedRow, setExpandedRow] = useState<string | null>(null);

  const { data: historyData, isLoading } = useGetWorkflowHistoryQuery(
    { id: selectedWorkflowId, days, limit: 100 },
    { skip: !selectedWorkflowId }
  );

  const executions = historyData?.executions || [];

  return (
    <div className="space-y-4">
      {/* Filters */}
      <div className="bg-[#162240] rounded-lg border border-[#1E3461] p-4 flex items-center gap-4">
        <div className="flex items-center gap-2">
          <Filter className="w-4 h-4 text-[#6B7280]" />
          <select
            value={selectedWorkflowId}
            onChange={(e) => setSelectedWorkflowId(e.target.value)}
            className="px-3 py-1.5 border border-[#1E3461] bg-[#0A1835] text-[#F9FAFB] rounded-lg text-sm focus:ring-2 focus:ring-cyan-500"
          >
            {workflows.map((w) => (
              <option key={w._id} value={w._id}>{w.name}</option>
            ))}
          </select>
        </div>
        <div className="flex items-center gap-2">
          <Calendar className="w-4 h-4 text-[#6B7280]" />
          <select
            value={days}
            onChange={(e) => setDays(Number(e.target.value))}
            className="px-3 py-1.5 border border-[#1E3461] bg-[#0A1835] text-[#F9FAFB] rounded-lg text-sm focus:ring-2 focus:ring-cyan-500"
          >
            <option value={7}>7 days</option>
            <option value={14}>14 days</option>
            <option value={30}>30 days</option>
          </select>
        </div>
      </div>

      {/* Table */}
      {isLoading ? (
        <div className="flex items-center justify-center h-32">
          <Loader2 className="w-6 h-6 text-cyan-500 animate-spin" />
        </div>
      ) : executions.length === 0 ? (
        <div className="bg-[#162240] rounded-lg border border-[#1E3461] p-8 text-center">
          <History className="w-12 h-12 text-[#6B7280] mx-auto mb-4" />
          <h3 className="text-lg font-medium text-[#F9FAFB]">No executions yet</h3>
        </div>
      ) : (
        <div className="bg-[#162240] rounded-lg border border-[#1E3461] overflow-hidden">
          <table className="w-full">
            <thead>
              <tr className="bg-[#0F1F3D] border-b border-[#1E3461]">
                <th className="px-4 py-3 text-left text-xs font-medium text-[#9CA3AF] uppercase">Timestamp</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-[#9CA3AF] uppercase">Workflow</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-[#9CA3AF] uppercase">Triggered By</th>
                <th className="px-4 py-3 text-center text-xs font-medium text-[#9CA3AF] uppercase">Actions</th>
                <th className="px-4 py-3 text-center text-xs font-medium text-[#9CA3AF] uppercase">Duration</th>
                <th className="px-4 py-3 text-center text-xs font-medium text-[#9CA3AF] uppercase">Status</th>
                <th className="px-4 py-3 w-8"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#1E3461]">
              {executions.map((exec) => (
                <React.Fragment key={exec._id}>
                  <tr className="hover:bg-[#0F1F3D] cursor-pointer" onClick={() => setExpandedRow(expandedRow === exec._id ? null : exec._id)}>
                    <td className="px-4 py-3 text-sm text-[#F9FAFB]">{formatDateShort(exec.createdAt)}</td>
                    <td className="px-4 py-3 text-sm text-[#F9FAFB] font-medium">{historyData?.workflowName}</td>
                    <td className="px-4 py-3 text-sm">
                      <span className="font-mono text-xs bg-[#0F1F3D] px-1.5 py-0.5 rounded text-[#9CA3AF]">{exec.triggerId?.slice(0, 8) || 'N/A'}</span>
                    </td>
                    <td className="px-4 py-3 text-center text-sm text-[#F9FAFB]">{exec.actionsExecuted.length}</td>
                    <td className="px-4 py-3 text-center text-sm text-[#9CA3AF]">{formatDuration(exec.durationMs)}</td>
                    <td className="px-4 py-3 text-center">
                      {exec.success ? (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-green-100 text-green-700 text-xs rounded-full">
                          <CheckCircle className="w-3 h-3" /> Success
                        </span>
                      ) : exec.actionsExecuted.length > 0 ? (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-amber-100 text-amber-700 text-xs rounded-full">
                          <AlertTriangle className="w-3 h-3" /> Partial
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-red-100 text-red-700 text-xs rounded-full">
                          <XCircle className="w-3 h-3" /> Failed
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      {expandedRow === exec._id ? <ChevronDown className="w-4 h-4 text-[#6B7280]" /> : <ChevronRight className="w-4 h-4 text-[#6B7280]" />}
                    </td>
                  </tr>
                  {expandedRow === exec._id && (
                    <tr>
                      <td colSpan={7} className="px-4 py-4 bg-[#0F1F3D]">
                        <div className="grid grid-cols-2 gap-6">
                          <div>
                            <h4 className="text-sm font-medium text-[#F9FAFB] mb-2">Context Data</h4>
                            <div className="bg-[#0A1835] rounded border border-[#1E3461] p-3 max-h-48 overflow-auto">
                              <pre className="text-xs text-[#9CA3AF] whitespace-pre-wrap">{JSON.stringify(exec.context, null, 2)}</pre>
                            </div>
                          </div>
                          <div>
                            <h4 className="text-sm font-medium text-[#F9FAFB] mb-2">Actions Executed</h4>
                            <div className="space-y-2">
                              {exec.actionsExecuted.map((action, i) => (
                                <div key={i} className="flex items-center gap-2 bg-[#0A1835] rounded border border-[#1E3461] px-3 py-2">
                                  <CheckCircle className="w-4 h-4 text-green-500" />
                                  <span className="text-sm text-[#F9FAFB]">{ACTION_TYPES.find((a) => a.value === action)?.label || action}</span>
                                </div>
                              ))}
                              {exec.errorMessage && (
                                <div className="bg-red-900/30 border border-red-700 rounded p-3 text-sm text-red-400">{exec.errorMessage}</div>
                              )}
                            </div>
                          </div>
                        </div>
                      </td>
                    </tr>
                  )}
                </React.Fragment>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

// =============================
// Workflow Builder Form (Full Canvas)
// =============================
function WorkflowBuilderForm({
  workflow,
  onSave,
  onCancel,
  onTest,
  isSaving,
}: {
  workflow?: Workflow;
  onSave: (data: CreateWorkflowPayload, activate: boolean) => void;
  onCancel: () => void;
  onTest: () => void;
  isSaving: boolean;
}): React.ReactElement {
  const [name, setName] = useState(workflow?.name || '');
  const [description, setDescription] = useState(workflow?.description || '');
  const [triggerEvent, setTriggerEvent] = useState<WorkflowTriggerEvent>(
    workflow?.trigger.event || 'ticket:created'
  );
  const [conditions, setConditions] = useState<WorkflowCondition[]>(
    workflow?.conditions || []
  );
  const [conditionLogic, setConditionLogic] = useState<'AND' | 'OR'>(
    workflow?.conditionLogic || 'AND'
  );
  const [actions, setActions] = useState<WorkflowAction[]>(
    workflow?.actions || [{ type: 'add_tag', params: { tag: '' }, order: 0 }]
  );

  const addCondition = () => {
    setConditions([...conditions, { field: 'customer.tier', operator: 'equals', value: '' }]);
  };

  const updateCondition = (index: number, updates: Partial<WorkflowCondition>) => {
    setConditions(conditions.map((c, i) => (i === index ? { ...c, ...updates } : c)));
  };

  const removeCondition = (index: number) => {
    setConditions(conditions.filter((_, i) => i !== index));
  };

  const addAction = (type: WorkflowActionType) => {
    setActions([...actions, { type, params: {}, order: actions.length }]);
  };

  const updateActionParam = (index: number, key: string, value: unknown) => {
    setActions(actions.map((a, i) => (i === index ? { ...a, params: { ...a.params, [key]: value } } : a)));
  };

  const removeAction = (index: number) => {
    setActions(actions.filter((_, i) => i !== index).map((a, i) => ({ ...a, order: i })));
  };

  const updateActionType = (index: number, type: WorkflowActionType) => {
    setActions(actions.map((a, i) => (i === index ? { ...a, type, params: {} } : a)));
  };

  const handleSave = (activate: boolean) => {
    if (!name.trim()) {
      toast.error('Workflow name is required');
      return;
    }
    if (actions.length === 0) {
      toast.error('At least one action is required');
      return;
    }
    onSave({
      name: name.trim(),
      description: description.trim() || undefined,
      isActive: activate,
      trigger: { event: triggerEvent },
      conditions,
      conditionLogic,
      actions,
    }, activate);
  };

  return (
    <div className="flex flex-col h-full bg-[#162240] rounded-lg border border-[#1E3461] overflow-hidden">
      {/* Breadcrumb Header */}
      <div className="px-6 py-4 border-b border-[#1E3461] flex items-center justify-between bg-[#0F1F3D]">
        <div className="flex items-center gap-2 text-sm">
          <button onClick={onCancel} className="text-[#9CA3AF] hover:text-cyan-400">Workflows</button>
          <ChevronRight className="w-4 h-4 text-[#6B7280]" />
          <span className="font-medium text-[#F9FAFB]">{workflow ? workflow.name : 'New Workflow'}</span>
        </div>
        <button onClick={onCancel} className="p-1.5 text-[#6B7280] hover:text-[#9CA3AF] hover:bg-[#1E3461] rounded">
          <X className="w-5 h-5" />
        </button>
      </div>

      {/* Main Content - Scrollable */}
      <div className="flex-1 overflow-y-auto p-6 space-y-8">
        {/* Top Bar: Name, Description, AND/OR Toggle */}
        <div className="space-y-4">
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Workflow Name *"
            className="w-full text-2xl font-semibold text-[#F9FAFB] border-0 border-b-2 border-transparent focus:border-cyan-500 focus:outline-none pb-2 bg-transparent placeholder-[#6B7280]"
          />
          <input
            type="text"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Add a description..."
            className="w-full text-[#9CA3AF] border-0 focus:outline-none bg-transparent placeholder-[#6B7280]"
          />
          <div className="flex items-center gap-3">
            <span className="text-sm text-[#9CA3AF]">Condition Logic:</span>
            <button
              onClick={() => setConditionLogic('AND')}
              className={`px-3 py-1 text-sm rounded-full ${conditionLogic === 'AND' ? 'bg-cyan-600 text-white' : 'bg-[#1E3461] text-[#9CA3AF] hover:bg-[#2a4070]'}`}
            >
              Match ALL (AND)
            </button>
            <button
              onClick={() => setConditionLogic('OR')}
              className={`px-3 py-1 text-sm rounded-full ${conditionLogic === 'OR' ? 'bg-cyan-600 text-white' : 'bg-[#1E3461] text-[#9CA3AF] hover:bg-[#2a4070]'}`}
            >
              Match ANY (OR)
            </button>
          </div>
        </div>

        {/* SECTION 1: TRIGGER */}
        <div className="space-y-4">
          <div className="flex items-center gap-3">
            <span className="flex items-center justify-center w-8 h-8 rounded-full bg-cyan-900/30 text-cyan-400 text-sm font-bold">1</span>
            <span className="text-lg font-semibold text-[#F9FAFB]">When this happens...</span>
          </div>
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-3">
            {TRIGGER_EVENTS.map((event) => (
              <button
                key={event.value}
                onClick={() => setTriggerEvent(event.value)}
                className={`p-4 rounded-lg border-2 text-left transition-all ${
                  triggerEvent === event.value
                    ? 'border-cyan-500 bg-cyan-900/20'
                    : 'border-[#1E3461] hover:border-cyan-600 hover:bg-[#0F1F3D]'
                }`}
              >
                <div className="flex items-center justify-between mb-2">
                  <span className={triggerEvent === event.value ? 'text-cyan-400' : 'text-[#6B7280]'}>{event.icon}</span>
                  {triggerEvent === event.value && <Check className="w-5 h-5 text-cyan-400" />}
                </div>
                <div className="text-sm font-medium text-[#F9FAFB]">{event.label}</div>
                <div className="text-xs text-[#9CA3AF] mt-1">{event.description}</div>
              </button>
            ))}
          </div>
        </div>

        {/* SECTION 2: CONDITIONS */}
        <div className="space-y-4">
          <div className="flex items-center gap-3">
            <span className="flex items-center justify-center w-8 h-8 rounded-full bg-cyan-900/30 text-cyan-400 text-sm font-bold">2</span>
            <span className="text-lg font-semibold text-[#F9FAFB]">Only if these conditions match...</span>
          </div>
          
          {conditions.length === 0 ? (
            <div className="bg-[#0F1F3D] rounded-lg p-4 text-center text-[#9CA3AF] text-sm border border-dashed border-[#1E3461]">
              No conditions — This workflow will fire for ALL matching triggers
            </div>
          ) : (
            <div className="space-y-2">
              {conditions.map((condition, index) => (
                <div key={index} className="flex items-center gap-2">
                  {index > 0 && (
                    <span className={`px-2 py-0.5 text-xs font-medium rounded ${conditionLogic === 'AND' ? 'bg-cyan-900/30 text-cyan-400' : 'bg-purple-900/30 text-purple-400'}`}>
                      {conditionLogic}
                    </span>
                  )}
                  <select
                    value={condition.field}
                    onChange={(e) => updateCondition(index, { field: e.target.value })}
                    className="px-3 py-2 border border-[#1E3461] bg-[#0A1835] text-[#F9FAFB] rounded-lg text-sm focus:ring-2 focus:ring-cyan-500"
                  >
                    {CONDITION_FIELDS.map((f) => <option key={f.value} value={f.value}>{f.label}</option>)}
                  </select>
                  <select
                    value={condition.operator}
                    onChange={(e) => updateCondition(index, { operator: e.target.value as ConditionOperator })}
                    className="px-3 py-2 border border-[#1E3461] bg-[#0A1835] text-[#F9FAFB] rounded-lg text-sm focus:ring-2 focus:ring-cyan-500"
                  >
                    {CONDITION_OPERATORS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                  </select>
                  <input
                    type="text"
                    value={String(condition.value || '')}
                    onChange={(e) => updateCondition(index, { value: e.target.value })}
                    placeholder="Value"
                    className="flex-1 px-3 py-2 border border-[#1E3461] bg-[#0A1835] text-[#F9FAFB] placeholder-[#6B7280] rounded-lg text-sm focus:ring-2 focus:ring-cyan-500"
                  />
                  <button onClick={() => removeCondition(index)} className="p-2 text-[#6B7280] hover:text-red-400 hover:bg-red-900/30 rounded">
                    <X className="w-4 h-4" />
                  </button>
                </div>
              ))}
            </div>
          )}
          <button onClick={addCondition} className="text-sm text-cyan-400 hover:text-cyan-300 font-medium">+ Add Condition</button>
        </div>

        {/* SECTION 3: ACTIONS */}
        <div className="space-y-4">
          <div className="flex items-center gap-3">
            <span className="flex items-center justify-center w-8 h-8 rounded-full bg-cyan-900/30 text-cyan-400 text-sm font-bold">3</span>
            <span className="text-lg font-semibold text-[#F9FAFB]">Then do these actions...</span>
          </div>
          
          <div className="space-y-3">
            {actions.map((action, index) => {
              const cfg = ACTION_TYPES.find((a) => a.value === action.type);
              return (
                <div key={index} className="flex items-start gap-3 p-4 bg-[#0F1F3D] rounded-lg border border-[#1E3461]">
                  <div className="p-1.5 text-[#6B7280] cursor-grab">
                    <GripVertical className="w-4 h-4" />
                  </div>
                  <div className="flex-1 space-y-3">
                    <div className="flex items-center gap-2">
                      <span className="text-xs text-[#9CA3AF] font-medium">#{index + 1}</span>
                      <span className="text-[#6B7280]">{cfg?.icon}</span>
                      <select
                        value={action.type}
                        onChange={(e) => updateActionType(index, e.target.value as WorkflowActionType)}
                        className="px-3 py-1.5 border border-[#1E3461] bg-[#0A1835] text-[#F9FAFB] rounded-lg text-sm focus:ring-2 focus:ring-cyan-500"
                      >
                        {ACTION_TYPES.map((at) => <option key={at.value} value={at.value}>{at.label}</option>)}
                      </select>
                    </div>
                    {cfg && (
                      <div className="grid grid-cols-2 gap-3">
                        {cfg.params.map((param) => (
                          <div key={param.key}>
                            <label className="block text-xs text-[#9CA3AF] mb-1">{param.label}</label>
                            {param.type === 'select' ? (
                              <select
                                value={String(action.params[param.key] || '')}
                                onChange={(e) => updateActionParam(index, param.key, e.target.value)}
                                className="w-full px-2 py-1.5 border border-[#1E3461] bg-[#0A1835] text-[#F9FAFB] rounded text-sm focus:ring-2 focus:ring-cyan-500"
                              >
                                <option value="">Select...</option>
                                {param.options?.map((opt) => <option key={opt} value={opt}>{opt}</option>)}
                              </select>
                            ) : param.type === 'textarea' ? (
                              <textarea
                                value={String(action.params[param.key] || '')}
                                onChange={(e) => updateActionParam(index, param.key, e.target.value)}
                                placeholder={param.placeholder}
                                rows={2}
                                className="w-full px-2 py-1.5 border border-[#1E3461] bg-[#0A1835] text-[#F9FAFB] placeholder-[#6B7280] rounded text-sm focus:ring-2 focus:ring-cyan-500"
                              />
                            ) : (
                              <input
                                type="text"
                                value={String(action.params[param.key] || '')}
                                onChange={(e) => updateActionParam(index, param.key, e.target.value)}
                                placeholder={param.placeholder}
                                className="w-full px-2 py-1.5 border border-[#1E3461] bg-[#0A1835] text-[#F9FAFB] placeholder-[#6B7280] rounded text-sm focus:ring-2 focus:ring-cyan-500"
                              />
                            )}
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                  <button onClick={() => removeAction(index)} className="p-1.5 text-[#6B7280] hover:text-red-400 hover:bg-red-900/30 rounded">
                    <X className="w-4 h-4" />
                  </button>
                </div>
              );
            })}
          </div>

          {/* Add Action Dropdown */}
          <div className="relative inline-block">
            <select
              value=""
              onChange={(e) => { if (e.target.value) addAction(e.target.value as WorkflowActionType); }}
              className="text-sm text-cyan-400 font-medium bg-transparent border border-cyan-700 rounded-lg px-3 py-2 cursor-pointer focus:outline-none focus:ring-2 focus:ring-cyan-500"
            >
              <option value="">+ Add Action</option>
              {ACTION_TYPES.map((at) => <option key={at.value} value={at.value}>{at.label}</option>)}
            </select>
          </div>
        </div>
      </div>

      {/* Sticky Bottom Action Bar */}
      <div className="px-6 py-4 border-t border-[#1E3461] flex items-center justify-between bg-[#0F1F3D]">
        <button
          onClick={onTest}
          className="inline-flex items-center gap-2 px-4 py-2 border border-[#1E3461] text-[#F9FAFB] text-sm font-medium rounded-lg hover:bg-[#1E3461]"
        >
          <FlaskConical className="w-4 h-4" />
          Test Workflow
        </button>
        <div className="flex items-center gap-3">
          <button
            onClick={() => handleSave(false)}
            disabled={isSaving}
            className="px-4 py-2 border border-[#1E3461] text-[#F9FAFB] text-sm font-medium rounded-lg hover:bg-[#1E3461] disabled:opacity-50"
          >
            Save as Draft
          </button>
          <button
            onClick={() => handleSave(true)}
            disabled={isSaving}
            className="inline-flex items-center gap-2 px-4 py-2 bg-cyan-600 text-white text-sm font-medium rounded-lg hover:bg-cyan-700 disabled:opacity-50"
          >
            {isSaving && <Loader2 className="w-4 h-4 animate-spin" />}
            Activate Workflow
          </button>
        </div>
      </div>
    </div>
  );
}

// =============================
// Test Modal Component
// =============================
function TestWorkflowModal({
  isOpen,
  onClose,
  workflowId,
}: {
  isOpen: boolean;
  onClose: () => void;
  workflowId?: string;
}): React.ReactElement | null {
  const [testWorkflow] = useTestWorkflowMutation();
  const [isLoading, setIsLoading] = useState(false);
  const [results, setResults] = useState<{ wouldTrigger: boolean; actionsToRun: string[] } | null>(null);

  const handleTest = async () => {
    if (!workflowId) return;
    setIsLoading(true);
    try {
      const result = await testWorkflow({ id: workflowId, context: { test: true } }).unwrap();
      setResults({ wouldTrigger: result.wouldTrigger, actionsToRun: result.actionsToRun.map((a) => a.type) });
    } catch {
      toast.error('Test failed');
    }
    setIsLoading(false);
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="bg-[#162240] rounded-lg w-full max-w-lg shadow-xl border border-[#1E3461]">
        <div className="px-6 py-4 border-b border-[#1E3461] flex items-center justify-between">
          <h3 className="text-lg font-semibold text-[#F9FAFB]">Test Workflow</h3>
          <button onClick={onClose} className="p-1 text-[#6B7280] hover:text-[#9CA3AF] rounded">
            <X className="w-5 h-5" />
          </button>
        </div>
        <div className="p-6 space-y-4">
          <p className="text-sm text-[#9CA3AF]">Test with last 5 tickets to see which would trigger this workflow.</p>
          {results && (
            <div className="bg-[#0F1F3D] rounded-lg p-4 space-y-2">
              <div className="flex items-center gap-2">
                <span className="font-medium text-[#F9FAFB]">Would Trigger:</span>
                <span className={results.wouldTrigger ? 'text-green-400' : 'text-red-400'}>
                  {results.wouldTrigger ? 'Yes' : 'No'}
                </span>
              </div>
              {results.actionsToRun.length > 0 && (
                <div>
                  <span className="font-medium text-[#F9FAFB]">Actions to run:</span>
                  <div className="flex flex-wrap gap-1 mt-1">
                    {results.actionsToRun.map((a, i) => (
                      <span key={i} className="px-2 py-0.5 bg-cyan-900/30 text-cyan-400 text-xs rounded-full">{a}</span>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
        <div className="px-6 py-4 border-t border-[#1E3461] flex justify-end gap-3">
          <button onClick={onClose} className="px-4 py-2 text-[#F9FAFB] text-sm font-medium hover:bg-[#1E3461] rounded-lg">
            Close
          </button>
          <button
            onClick={handleTest}
            disabled={isLoading || !workflowId}
            className="inline-flex items-center gap-2 px-4 py-2 bg-cyan-600 text-white text-sm font-medium rounded-lg hover:bg-cyan-700 disabled:opacity-50"
          >
            {isLoading && <Loader2 className="w-4 h-4 animate-spin" />}
            Run Test
          </button>
        </div>
      </div>
    </div>
  );
}

// =============================
// Main WorkflowBuilder Page with Tabs
// =============================
export function WorkflowBuilder(): React.ReactElement {
  const [activeTab, setActiveTab] = useState<TabType>('workflows');
  const [view, setView] = useState<'list' | 'builder'>('list');
  const [editingWorkflow, setEditingWorkflow] = useState<Workflow | undefined>();
  const [testModalOpen, setTestModalOpen] = useState(false);
  const [creatingFromTemplate, setCreatingFromTemplate] = useState(false);

  const { data: workflowsData, isLoading: isLoadingWorkflows } = useGetWorkflowsQuery({});
  const { data: templatesData } = useGetTemplatesQuery();

  const [createWorkflow, { isLoading: isCreating }] = useCreateWorkflowMutation();
  const [updateWorkflow, { isLoading: isUpdating }] = useUpdateWorkflowMutation();
  const [deleteWorkflow] = useDeleteWorkflowMutation();
  const [toggleActive] = useToggleWorkflowActiveMutation();
  const [createFromTemplate] = useCreateFromTemplateMutation();

  const workflows = workflowsData?.workflows || [];
  const templates = templatesData?.templates || [];
  const byCategory = templatesData?.byCategory || {};

  const handleNewWorkflow = () => {
    setEditingWorkflow(undefined);
    setView('builder');
  };

  const handleEditWorkflow = (workflow: Workflow) => {
    setEditingWorkflow(workflow);
    setView('builder');
  };

  const handleSelectTemplate = async (template: WorkflowTemplate) => {
    setCreatingFromTemplate(true);
    try {
      const result = await createFromTemplate({ templateId: template.id }).unwrap();
      setEditingWorkflow(result.workflow);
      setView('builder');
      toast.success('Workflow created from template');
    } catch {
      toast.error('Failed to create from template');
    }
    setCreatingFromTemplate(false);
  };

  const handleSaveWorkflow = async (data: CreateWorkflowPayload, activate: boolean) => {
    try {
      if (editingWorkflow) {
        await updateWorkflow({ id: editingWorkflow._id, data: { ...data, isActive: activate } }).unwrap();
        toast.success('Workflow updated');
      } else {
        await createWorkflow({ ...data, isActive: activate }).unwrap();
        toast.success('Workflow created');
      }
      setView('list');
      setEditingWorkflow(undefined);
    } catch {
      toast.error('Failed to save workflow');
    }
  };

  const handleDeleteWorkflow = async (id: string) => {
    if (!confirm('Delete this workflow?')) return;
    try {
      await deleteWorkflow(id).unwrap();
      toast.success('Workflow deleted');
    } catch {
      toast.error('Failed to delete');
    }
  };

  const handleToggleActive = async (id: string) => {
    try {
      await toggleActive(id).unwrap();
    } catch {
      toast.error('Failed to toggle');
    }
  };

  const handleCancel = () => {
    setView('list');
    setEditingWorkflow(undefined);
  };

  // Builder View (full screen)
  if (view === 'builder') {
    return (
      <div className="min-h-screen bg-[#0A1835] p-6">
        <div className="max-w-5xl mx-auto h-[calc(100vh-48px)]">
          <WorkflowBuilderForm
            workflow={editingWorkflow}
            onSave={handleSaveWorkflow}
            onCancel={handleCancel}
            onTest={() => setTestModalOpen(true)}
            isSaving={isCreating || isUpdating}
          />
        </div>
        <TestWorkflowModal
          isOpen={testModalOpen}
          onClose={() => setTestModalOpen(false)}
          workflowId={editingWorkflow?._id}
        />
      </div>
    );
  }

  // List View with Tabs
  return (
    <div className="min-h-screen bg-[#0A1835] p-6">
      <div className="max-w-6xl mx-auto">
        {/* Page Header */}
        <div className="mb-6">
          <h1 className="text-2xl font-bold text-[#F9FAFB]">Workflow Automation</h1>
          <p className="text-sm text-[#9CA3AF] mt-1">Automate actions based on ticket events and conditions</p>
        </div>

        {/* Tab Navigation */}
        <div className="flex items-center gap-1 mb-6 border-b border-[#1E3461]">
          <button
            onClick={() => setActiveTab('workflows')}
            className={`px-4 py-2 text-sm font-medium border-b-2 -mb-px transition-colors ${
              activeTab === 'workflows'
                ? 'border-cyan-500 text-cyan-400'
                : 'border-transparent text-[#9CA3AF] hover:text-[#F9FAFB]'
            }`}
          >
            <span className="inline-flex items-center gap-2">
              <List className="w-4 h-4" />
              My Workflows
            </span>
          </button>
          <button
            onClick={() => setActiveTab('templates')}
            className={`px-4 py-2 text-sm font-medium border-b-2 -mb-px transition-colors ${
              activeTab === 'templates'
                ? 'border-cyan-500 text-cyan-400'
                : 'border-transparent text-[#9CA3AF] hover:text-[#F9FAFB]'
            }`}
          >
            <span className="inline-flex items-center gap-2">
              <LayoutGrid className="w-4 h-4" />
              Templates
            </span>
          </button>
          <button
            onClick={() => setActiveTab('history')}
            className={`px-4 py-2 text-sm font-medium border-b-2 -mb-px transition-colors ${
              activeTab === 'history'
                ? 'border-cyan-500 text-cyan-400'
                : 'border-transparent text-[#9CA3AF] hover:text-[#F9FAFB]'
            }`}
          >
            <span className="inline-flex items-center gap-2">
              <History className="w-4 h-4" />
              Execution History
            </span>
          </button>
        </div>

        {/* Tab Content */}
        {activeTab === 'workflows' && (
          <MyWorkflowsTab
            workflows={workflows}
            isLoading={isLoadingWorkflows}
            onNewWorkflow={handleNewWorkflow}
            onEditWorkflow={handleEditWorkflow}
            onDeleteWorkflow={handleDeleteWorkflow}
            onToggleActive={handleToggleActive}
          />
        )}

        {activeTab === 'templates' && (
          <TemplatesTab
            templates={templates}
            byCategory={byCategory}
            onSelectTemplate={handleSelectTemplate}
            isCreating={creatingFromTemplate}
          />
        )}

        {activeTab === 'history' && (
          workflows.length > 0 ? (
            <ExecutionHistoryTab workflows={workflows} />
          ) : (
            <div className="bg-[#162240] rounded-lg border border-[#1E3461] p-8 text-center">
              <History className="w-12 h-12 text-[#6B7280] mx-auto mb-4" />
              <h3 className="text-lg font-medium text-[#F9FAFB]">No workflows to show history for</h3>
              <p className="text-[#9CA3AF] mt-1">Create a workflow first to see execution history</p>
            </div>
          )
        )}
      </div>
    </div>
  );
}

export default WorkflowBuilder;
