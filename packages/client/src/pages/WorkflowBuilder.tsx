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
} from 'lucide-react';
import toast from 'react-hot-toast';
import {
  useGetWorkflowsQuery,
  useGetTemplatesQuery,
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
} from '../api/workflowsApi';

// Trigger event options
const TRIGGER_EVENTS: { value: WorkflowTriggerEvent; label: string; description: string }[] = [
  { value: 'ticket:created', label: 'Ticket Created', description: 'When a new ticket is created' },
  { value: 'ticket:classified', label: 'Ticket Classified', description: 'When AI classifies a ticket' },
  { value: 'ticket:sla_warning', label: 'SLA Warning', description: 'When SLA is about to breach' },
  { value: 'ticket:sla_breached', label: 'SLA Breached', description: 'When SLA deadline is missed' },
  { value: 'ticket:escalated', label: 'Ticket Escalated', description: 'When a ticket is escalated' },
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
  { value: 'priority', label: 'Priority' },
  { value: 'status', label: 'Status' },
  { value: 'classification.intent', label: 'Category' },
  { value: 'customer.tier', label: 'Customer Tier' },
  { value: 'sentiment', label: 'Sentiment' },
  { value: 'source', label: 'Source' },
  { value: 'sla.minutesUntilBreach', label: 'Minutes Until SLA' },
];

// Action types with icons and param schemas
const ACTION_TYPES: {
  value: WorkflowActionType;
  label: string;
  icon: React.ReactNode;
  params: { key: string; label: string; type: 'text' | 'select'; options?: string[] }[];
}[] = [
  {
    value: 'assign_agent',
    label: 'Assign Agent',
    icon: <UserPlus className="w-4 h-4" />,
    params: [
      { key: 'agentId', label: 'Agent ID', type: 'text' },
      { key: 'team', label: 'Or Team', type: 'text' },
    ],
  },
  {
    value: 'add_tag',
    label: 'Add Tag',
    icon: <Tag className="w-4 h-4" />,
    params: [{ key: 'tag', label: 'Tag Name', type: 'text' }],
  },
  {
    value: 'send_email',
    label: 'Send Email',
    icon: <Mail className="w-4 h-4" />,
    params: [
      { key: 'to', label: 'To Email', type: 'text' },
      { key: 'subject', label: 'Subject', type: 'text' },
      { key: 'body', label: 'Body', type: 'text' },
    ],
  },
  {
    value: 'notify_slack',
    label: 'Notify Slack',
    icon: <MessageSquare className="w-4 h-4" />,
    params: [
      { key: 'channel', label: 'Channel', type: 'text' },
      { key: 'mention', label: 'Mention (optional)', type: 'text' },
    ],
  },
  {
    value: 'webhook',
    label: 'Call Webhook',
    icon: <Globe className="w-4 h-4" />,
    params: [
      { key: 'url', label: 'URL', type: 'text' },
      { key: 'method', label: 'Method', type: 'select', options: ['POST', 'PUT', 'PATCH'] },
    ],
  },
  {
    value: 'escalate',
    label: 'Escalate',
    icon: <ArrowUp className="w-4 h-4" />,
    params: [{ key: 'reason', label: 'Reason', type: 'text' }],
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
    value: 'close_ticket',
    label: 'Close Ticket',
    icon: <XOctagon className="w-4 h-4" />,
    params: [{ key: 'reason', label: 'Reason', type: 'text' }],
  },
  {
    value: 'add_note',
    label: 'Add Note',
    icon: <FileText className="w-4 h-4" />,
    params: [{ key: 'note', label: 'Note Content', type: 'text' }],
  },
];

// Template icons
const TEMPLATE_ICONS: Record<string, React.ReactNode> = {
  'auto-escalate-p1': <AlertTriangle className="w-6 h-6 text-red-500" />,
  'sla-breach-notification': <Clock className="w-6 h-6 text-amber-500" />,
  'vip-routing': <Sparkles className="w-6 h-6 text-purple-500" />,
  'negative-feedback-alert': <MessageSquare className="w-6 h-6 text-blue-500" />,
  'auto-close-resolved': <XOctagon className="w-6 h-6 text-gray-500" />,
  'billing-category-routing': <Tag className="w-6 h-6 text-green-500" />,
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

function getTriggerLabel(event: WorkflowTriggerEvent): string {
  return TRIGGER_EVENTS.find((e) => e.value === event)?.label || event;
}

// Template Gallery Component
function TemplateGallery({
  templates,
  onSelect,
}: {
  templates: WorkflowTemplate[];
  onSelect: (template: WorkflowTemplate) => void;
}): React.ReactElement {
  return (
    <div className="mt-8">
      <h3 className="text-lg font-medium text-gray-900 mb-4">Start from a Template</h3>
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {templates.map((template) => (
          <button
            key={template.id}
            onClick={() => onSelect(template)}
            className="text-left p-4 rounded-lg border border-gray-200 hover:border-cyan-400 hover:shadow-md transition-all group"
          >
            <div className="flex items-start gap-3">
              <div className="p-2 bg-gray-100 rounded-lg group-hover:bg-cyan-50">
                {TEMPLATE_ICONS[template.id] || <Zap className="w-6 h-6 text-cyan-500" />}
              </div>
              <div className="flex-1 min-w-0">
                <h4 className="font-medium text-gray-900 group-hover:text-cyan-600">
                  {template.name}
                </h4>
                <p className="text-sm text-gray-500 mt-1 line-clamp-2">
                  {template.description}
                </p>
                <p className="text-xs text-gray-400 mt-2">
                  {getTriggerLabel(template.trigger.event)} → {template.actions.length} action{template.actions.length !== 1 ? 's' : ''}
                </p>
              </div>
            </div>
          </button>
        ))}
      </div>
    </div>
  );
}

// Workflow Builder Form Component
function WorkflowBuilderForm({
  workflow,
  onSave,
  onCancel,
  isSaving,
}: {
  workflow?: Workflow;
  onSave: (data: CreateWorkflowPayload, activate: boolean) => void;
  onCancel: () => void;
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
  const [expandedSections, setExpandedSections] = useState({
    trigger: true,
    conditions: true,
    actions: true,
  });

  const toggleSection = (section: keyof typeof expandedSections) => {
    setExpandedSections((prev) => ({ ...prev, [section]: !prev[section] }));
  };

  const addCondition = () => {
    setConditions([...conditions, { field: 'priority', operator: 'equals', value: '' }]);
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

  const updateAction = (index: number, updates: Partial<WorkflowAction>) => {
    setActions(actions.map((a, i) => (i === index ? { ...a, ...updates } : a)));
  };

  const updateActionParam = (index: number, key: string, value: unknown) => {
    setActions(
      actions.map((a, i) =>
        i === index ? { ...a, params: { ...a.params, [key]: value } } : a
      )
    );
  };

  const removeAction = (index: number) => {
    setActions(actions.filter((_, i) => i !== index).map((a, i) => ({ ...a, order: i })));
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

    onSave(
      {
        name: name.trim(),
        description: description.trim() || undefined,
        isActive: activate,
        trigger: { event: triggerEvent },
        conditions,
        conditionLogic,
        actions,
      },
      activate
    );
  };

  return (
    <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
      {/* Header */}
      <div className="px-6 py-4 border-b border-gray-200 flex items-center justify-between">
        <h2 className="text-lg font-medium text-gray-900">
          {workflow ? 'Edit Workflow' : 'Create Workflow'}
        </h2>
        <button
          onClick={onCancel}
          className="p-1.5 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded"
        >
          <X className="w-5 h-5" />
        </button>
      </div>

      <div className="p-6 space-y-6">
        {/* Name & Description */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Workflow Name *
            </label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g., Auto-escalate VIP tickets"
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-cyan-500"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Description
            </label>
            <input
              type="text"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="What does this workflow do?"
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-cyan-500"
            />
          </div>
        </div>

        {/* Section 1: Trigger */}
        <div className="border border-gray-200 rounded-lg overflow-hidden">
          <button
            onClick={() => toggleSection('trigger')}
            className="w-full px-4 py-3 bg-gray-50 flex items-center justify-between"
          >
            <div className="flex items-center gap-2">
              <span className="px-2 py-0.5 bg-cyan-100 text-cyan-700 text-xs font-medium rounded">
                TRIGGER
              </span>
              <span className="text-sm text-gray-700">When this happens...</span>
            </div>
            {expandedSections.trigger ? (
              <ChevronDown className="w-5 h-5 text-gray-400" />
            ) : (
              <ChevronRight className="w-5 h-5 text-gray-400" />
            )}
          </button>
          {expandedSections.trigger && (
            <div className="p-4 bg-white">
              <select
                value={triggerEvent}
                onChange={(e) => setTriggerEvent(e.target.value as WorkflowTriggerEvent)}
                className="w-full max-w-md px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-cyan-500"
              >
                {TRIGGER_EVENTS.map((event) => (
                  <option key={event.value} value={event.value}>
                    {event.label} — {event.description}
                  </option>
                ))}
              </select>
            </div>
          )}
        </div>

        {/* Section 2: Conditions */}
        <div className="border border-gray-200 rounded-lg overflow-hidden">
          <button
            onClick={() => toggleSection('conditions')}
            className="w-full px-4 py-3 bg-gray-50 flex items-center justify-between"
          >
            <div className="flex items-center gap-2">
              <span className="px-2 py-0.5 bg-cyan-100 text-cyan-700 text-xs font-medium rounded">
                CONDITIONS
              </span>
              <span className="text-sm text-gray-700">
                Only if these are true ({conditions.length})
              </span>
            </div>
            {expandedSections.conditions ? (
              <ChevronDown className="w-5 h-5 text-gray-400" />
            ) : (
              <ChevronRight className="w-5 h-5 text-gray-400" />
            )}
          </button>
          {expandedSections.conditions && (
            <div className="p-4 bg-white space-y-3">
              {/* AND/OR Toggle */}
              {conditions.length > 1 && (
                <div className="flex items-center gap-2 mb-4">
                  <span className="text-sm text-gray-600">Match:</span>
                  <button
                    onClick={() => setConditionLogic('AND')}
                    className={`px-3 py-1 text-sm rounded-full ${
                      conditionLogic === 'AND'
                        ? 'bg-cyan-600 text-white'
                        : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                    }`}
                  >
                    ALL (AND)
                  </button>
                  <button
                    onClick={() => setConditionLogic('OR')}
                    className={`px-3 py-1 text-sm rounded-full ${
                      conditionLogic === 'OR'
                        ? 'bg-cyan-600 text-white'
                        : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                    }`}
                  >
                    ANY (OR)
                  </button>
                </div>
              )}

              {/* Condition Rows */}
              {conditions.map((condition, index) => (
                <div key={index} className="flex items-center gap-2">
                  <select
                    value={condition.field}
                    onChange={(e) => updateCondition(index, { field: e.target.value })}
                    className="px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-cyan-500"
                  >
                    {CONDITION_FIELDS.map((field) => (
                      <option key={field.value} value={field.value}>
                        {field.label}
                      </option>
                    ))}
                  </select>
                  <select
                    value={condition.operator}
                    onChange={(e) =>
                      updateCondition(index, { operator: e.target.value as ConditionOperator })
                    }
                    className="px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-cyan-500"
                  >
                    {CONDITION_OPERATORS.map((op) => (
                      <option key={op.value} value={op.value}>
                        {op.label}
                      </option>
                    ))}
                  </select>
                  <input
                    type="text"
                    value={String(condition.value || '')}
                    onChange={(e) => updateCondition(index, { value: e.target.value })}
                    placeholder="Value"
                    className="flex-1 px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-cyan-500"
                  />
                  <button
                    onClick={() => removeCondition(index)}
                    className="p-2 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>
              ))}

              <button
                onClick={addCondition}
                className="text-sm text-cyan-600 hover:text-cyan-700 font-medium"
              >
                + Add condition
              </button>
            </div>
          )}
        </div>

        {/* Section 3: Actions */}
        <div className="border border-gray-200 rounded-lg overflow-hidden">
          <button
            onClick={() => toggleSection('actions')}
            className="w-full px-4 py-3 bg-gray-50 flex items-center justify-between"
          >
            <div className="flex items-center gap-2">
              <span className="px-2 py-0.5 bg-cyan-100 text-cyan-700 text-xs font-medium rounded">
                ACTIONS
              </span>
              <span className="text-sm text-gray-700">
                Then do this... ({actions.length})
              </span>
            </div>
            {expandedSections.actions ? (
              <ChevronDown className="w-5 h-5 text-gray-400" />
            ) : (
              <ChevronRight className="w-5 h-5 text-gray-400" />
            )}
          </button>
          {expandedSections.actions && (
            <div className="p-4 bg-white space-y-3">
              {actions.map((action, index) => {
                const actionConfig = ACTION_TYPES.find((a) => a.value === action.type);
                return (
                  <div
                    key={index}
                    className="flex items-start gap-3 p-3 bg-gray-50 rounded-lg border border-gray-200"
                  >
                    <div className="p-1.5 text-gray-400 cursor-grab">
                      <GripVertical className="w-4 h-4" />
                    </div>
                    <div className="flex-1 space-y-2">
                      <div className="flex items-center gap-2">
                        <span className="text-xs text-gray-500 font-medium">#{index + 1}</span>
                        <select
                          value={action.type}
                          onChange={(e) =>
                            updateAction(index, {
                              type: e.target.value as WorkflowActionType,
                              params: {},
                            })
                          }
                          className="px-3 py-1.5 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-cyan-500"
                        >
                          {ACTION_TYPES.map((at) => (
                            <option key={at.value} value={at.value}>
                              {at.label}
                            </option>
                          ))}
                        </select>
                      </div>
                      {actionConfig && (
                        <div className="grid grid-cols-2 gap-2">
                          {actionConfig.params.map((param) => (
                            <div key={param.key}>
                              <label className="block text-xs text-gray-500 mb-1">
                                {param.label}
                              </label>
                              {param.type === 'select' ? (
                                <select
                                  value={String(action.params[param.key] || '')}
                                  onChange={(e) =>
                                    updateActionParam(index, param.key, e.target.value)
                                  }
                                  className="w-full px-2 py-1.5 border border-gray-300 rounded text-sm focus:outline-none focus:ring-2 focus:ring-cyan-500"
                                >
                                  <option value="">Select...</option>
                                  {param.options?.map((opt) => (
                                    <option key={opt} value={opt}>
                                      {opt}
                                    </option>
                                  ))}
                                </select>
                              ) : (
                                <input
                                  type="text"
                                  value={String(action.params[param.key] || '')}
                                  onChange={(e) =>
                                    updateActionParam(index, param.key, e.target.value)
                                  }
                                  placeholder={param.label}
                                  className="w-full px-2 py-1.5 border border-gray-300 rounded text-sm focus:outline-none focus:ring-2 focus:ring-cyan-500"
                                />
                              )}
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                    <button
                      onClick={() => removeAction(index)}
                      className="p-1.5 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  </div>
                );
              })}

              {/* Add Action Dropdown */}
              <div className="relative">
                <select
                  value=""
                  onChange={(e) => {
                    if (e.target.value) {
                      addAction(e.target.value as WorkflowActionType);
                    }
                  }}
                  className="text-sm text-cyan-600 font-medium bg-transparent border-none cursor-pointer focus:outline-none"
                >
                  <option value="">+ Add action</option>
                  {ACTION_TYPES.map((at) => (
                    <option key={at.value} value={at.value}>
                      {at.label}
                    </option>
                  ))}
                </select>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Footer */}
      <div className="px-6 py-4 border-t border-gray-200 flex items-center justify-between bg-gray-50">
        <button
          onClick={onCancel}
          className="px-4 py-2 text-gray-600 text-sm font-medium hover:bg-gray-100 rounded-lg"
        >
          Cancel
        </button>
        <div className="flex items-center gap-3">
          <button
            onClick={() => handleSave(false)}
            disabled={isSaving}
            className="px-4 py-2 border border-gray-300 text-gray-700 text-sm font-medium rounded-lg hover:bg-gray-50 disabled:opacity-50"
          >
            Save Draft
          </button>
          <button
            onClick={() => handleSave(true)}
            disabled={isSaving}
            className="inline-flex items-center gap-2 px-4 py-2 bg-cyan-600 text-white text-sm font-medium rounded-lg hover:bg-cyan-700 disabled:opacity-50"
          >
            {isSaving && <Loader2 className="w-4 h-4 animate-spin" />}
            Activate
          </button>
        </div>
      </div>
    </div>
  );
}

// Main WorkflowBuilder Page
export function WorkflowBuilder(): React.ReactElement {
  const [view, setView] = useState<'list' | 'builder'>('list');
  const [editingWorkflow, setEditingWorkflow] = useState<Workflow | undefined>();
  const [selectedTemplate, setSelectedTemplate] = useState<WorkflowTemplate | undefined>();

  const { data: workflowsData, isLoading: isLoadingWorkflows } = useGetWorkflowsQuery({});
  const { data: templatesData } = useGetTemplatesQuery();

  const [createWorkflow, { isLoading: isCreating }] = useCreateWorkflowMutation();
  const [updateWorkflow, { isLoading: isUpdating }] = useUpdateWorkflowMutation();
  const [deleteWorkflow] = useDeleteWorkflowMutation();
  const [toggleActive] = useToggleWorkflowActiveMutation();
  const [createFromTemplate] = useCreateFromTemplateMutation();

  const workflows = workflowsData?.workflows || [];
  const templates = templatesData?.templates || [];
  const isEmpty = workflows.length === 0;

  const handleNewWorkflow = () => {
    setEditingWorkflow(undefined);
    setSelectedTemplate(undefined);
    setView('builder');
  };

  const handleEditWorkflow = (workflow: Workflow) => {
    setEditingWorkflow(workflow);
    setSelectedTemplate(undefined);
    setView('builder');
  };

  const handleSelectTemplate = async (template: WorkflowTemplate) => {
    try {
      const result = await createFromTemplate({
        templateId: template.id,
      }).unwrap();
      setEditingWorkflow(result.workflow);
      setView('builder');
      toast.success('Workflow created from template');
    } catch {
      toast.error('Failed to create from template');
    }
  };

  const handleSaveWorkflow = async (data: CreateWorkflowPayload, activate: boolean) => {
    try {
      if (editingWorkflow) {
        await updateWorkflow({
          id: editingWorkflow._id,
          data: { ...data, isActive: activate },
        }).unwrap();
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
    if (!confirm('Are you sure you want to delete this workflow?')) return;
    try {
      await deleteWorkflow(id).unwrap();
      toast.success('Workflow deleted');
    } catch {
      toast.error('Failed to delete workflow');
    }
  };

  const handleToggleActive = async (id: string) => {
    try {
      await toggleActive(id).unwrap();
    } catch {
      toast.error('Failed to toggle workflow');
    }
  };

  const handleCancel = () => {
    setView('list');
    setEditingWorkflow(undefined);
    setSelectedTemplate(undefined);
  };

  // Builder View
  if (view === 'builder') {
    return (
      <div className="min-h-screen bg-gray-100 p-6">
        <div className="max-w-4xl mx-auto">
          <WorkflowBuilderForm
            workflow={editingWorkflow}
            onSave={handleSaveWorkflow}
            onCancel={handleCancel}
            isSaving={isCreating || isUpdating}
          />
        </div>
      </div>
    );
  }

  // List View
  return (
    <div className="min-h-screen bg-gray-100 p-6">
      <div className="max-w-6xl mx-auto">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Workflow Automation</h1>
            <p className="text-sm text-gray-500 mt-1">
              Automate actions based on ticket events and conditions
            </p>
          </div>
          <button
            onClick={handleNewWorkflow}
            className="inline-flex items-center gap-2 px-4 py-2 bg-cyan-600 text-white font-medium rounded-lg hover:bg-cyan-700"
          >
            <Plus className="w-4 h-4" />
            New Workflow
          </button>
        </div>

        {/* Loading State */}
        {isLoadingWorkflows && (
          <div className="flex items-center justify-center h-64">
            <Loader2 className="w-8 h-8 text-cyan-500 animate-spin" />
          </div>
        )}

        {/* Empty State with Templates */}
        {!isLoadingWorkflows && isEmpty && (
          <div className="bg-white rounded-lg border border-gray-200 p-8 text-center">
            <Zap className="w-12 h-12 text-gray-400 mx-auto mb-4" />
            <h3 className="text-lg font-medium text-gray-900">No workflows yet</h3>
            <p className="text-gray-500 mt-1 mb-6">
              Create your first workflow to automate repetitive tasks
            </p>
            <button
              onClick={handleNewWorkflow}
              className="inline-flex items-center gap-2 px-4 py-2 bg-cyan-600 text-white font-medium rounded-lg hover:bg-cyan-700"
            >
              <Plus className="w-4 h-4" />
              Create Workflow
            </button>

            {templates.length > 0 && (
              <TemplateGallery templates={templates} onSelect={handleSelectTemplate} />
            )}
          </div>
        )}

        {/* Workflow Table */}
        {!isLoadingWorkflows && !isEmpty && (
          <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
            <table className="w-full">
              <thead>
                <tr className="bg-gray-50 border-b border-gray-200">
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                    Name
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                    Trigger
                  </th>
                  <th className="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase">
                    Status
                  </th>
                  <th className="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase">
                    Triggered
                  </th>
                  <th className="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase">
                    Last Run
                  </th>
                  <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {workflows.map((workflow) => (
                  <tr key={workflow._id} className="hover:bg-gray-50">
                    <td className="px-4 py-3">
                      <div>
                        <span className="font-medium text-gray-900">{workflow.name}</span>
                        {workflow.description && (
                          <p className="text-xs text-gray-500 mt-0.5 truncate max-w-xs">
                            {workflow.description}
                          </p>
                        )}
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <span className="inline-flex items-center px-2 py-1 rounded-full text-xs bg-gray-100 text-gray-700">
                        <Zap className="w-3 h-3 mr-1" />
                        {getTriggerLabel(workflow.trigger.event)}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-center">
                      <button
                        onClick={() => handleToggleActive(workflow._id)}
                        className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                          workflow.isActive ? 'bg-cyan-600' : 'bg-gray-300'
                        }`}
                      >
                        <span
                          className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                            workflow.isActive ? 'translate-x-6' : 'translate-x-1'
                          }`}
                        />
                      </button>
                    </td>
                    <td className="px-4 py-3 text-center">
                      <span className="text-sm text-gray-700">
                        {workflow.stats.triggeredCount}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-center">
                      <span className="text-sm text-gray-500">
                        {formatTimeAgo(workflow.stats.lastTriggeredAt)}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right">
                      <div className="flex items-center justify-end gap-1">
                        <button
                          onClick={() => handleEditWorkflow(workflow)}
                          className="p-1.5 text-gray-400 hover:text-cyan-600 hover:bg-cyan-50 rounded"
                          title="Edit"
                        >
                          <Edit2 className="w-4 h-4" />
                        </button>
                        <button
                          onClick={() => handleDeleteWorkflow(workflow._id)}
                          className="p-1.5 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded"
                          title="Delete"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* Templates Section (shown even when workflows exist) */}
        {!isLoadingWorkflows && !isEmpty && templates.length > 0 && (
          <TemplateGallery templates={templates} onSelect={handleSelectTemplate} />
        )}
      </div>
    </div>
  );
}

export default WorkflowBuilder;
