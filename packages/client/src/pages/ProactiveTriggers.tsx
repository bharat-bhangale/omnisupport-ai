// ============================================================================
// PROACTIVE TRIGGERS MANAGEMENT PAGE
// ============================================================================
// Route: /settings/proactive-triggers

import { useState } from 'react';
import {
  useGetTriggersQuery,
  useCreateTriggerMutation,
  useUpdateTriggerMutation,
  useToggleTriggerMutation,
  useDeleteTriggerMutation,
  useTestTriggerMutation,
  type ProactiveTrigger,
  type ProactiveTriggerCondition,
} from '../api/proactiveApi';
import { useGetActiveCallsQuery } from '../api/callsApi';

// ============================================================================
// CONSTANTS
// ============================================================================

const INTENT_OPTIONS = [
  'order_status',
  'shipping_inquiry',
  'billing',
  'refund',
  'cancellation',
  'technical_support',
  'account_inquiry',
  'product_info',
  'complaint',
  'general',
];

const FIELD_OPTIONS = [
  { value: 'order.status', label: 'Order Status' },
  { value: 'order.delayDays', label: 'Order Delay (days)' },
  { value: 'account.tier', label: 'Account Tier' },
  { value: 'account.openTickets', label: 'Open Tickets' },
  { value: 'account.daysSincePurchase', label: 'Days Since Last Purchase' },
  { value: 'account.totalOrders', label: 'Total Orders' },
  { value: 'customer.ltv', label: 'Customer LTV' },
  { value: 'subscription.status', label: 'Subscription Status' },
  { value: 'subscription.daysUntilRenewal', label: 'Days Until Renewal' },
];

const OPERATOR_OPTIONS = [
  { value: 'equals', label: 'Equals', needsValue: true },
  { value: 'contains', label: 'Contains', needsValue: true },
  { value: 'gt', label: 'Greater than', needsValue: true },
  { value: 'lt', label: 'Less than', needsValue: true },
  { value: 'gte', label: 'Greater or equal', needsValue: true },
  { value: 'lte', label: 'Less or equal', needsValue: true },
  { value: 'exists', label: 'Exists', needsValue: false },
  { value: 'notExists', label: 'Does not exist', needsValue: false },
];

// ============================================================================
// TRIGGER FORM MODAL
// ============================================================================

interface TriggerFormProps {
  trigger?: ProactiveTrigger;
  onClose: () => void;
  activeCalls: string[];
}

function TriggerFormModal({ trigger, onClose, activeCalls }: TriggerFormProps) {
  const [createTrigger, { isLoading: isCreating }] = useCreateTriggerMutation();
  const [updateTrigger, { isLoading: isUpdating }] = useUpdateTriggerMutation();
  const [testTrigger, { isLoading: isTesting, data: testResult }] = useTestTriggerMutation();

  const [formData, setFormData] = useState({
    name: trigger?.name || '',
    description: trigger?.description || '',
    relevantIntents: trigger?.relevantIntents || [],
    condition: trigger?.condition || { field: '', operator: 'equals' as const, value: '' },
    statementTemplate: trigger?.statementTemplate || '',
    priority: trigger?.priority || 5,
    channel: trigger?.channel || 'voice' as 'voice' | 'both',
    isActive: trigger?.isActive ?? true,
  });

  const [selectedTestCall, setSelectedTestCall] = useState('');

  const operatorConfig = OPERATOR_OPTIONS.find(o => o.value === formData.condition.operator);

  const handleIntentToggle = (intent: string) => {
    setFormData((prev) => ({
      ...prev,
      relevantIntents: prev.relevantIntents.includes(intent)
        ? prev.relevantIntents.filter((i) => i !== intent)
        : [...prev.relevantIntents, intent],
    }));
  };

  const handleConditionChange = (field: keyof ProactiveTriggerCondition, value: unknown) => {
    setFormData((prev) => ({
      ...prev,
      condition: { ...prev.condition, [field]: value },
    }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      if (trigger) {
        await updateTrigger({
          id: trigger._id,
          ...formData,
        }).unwrap();
      } else {
        await createTrigger(formData).unwrap();
      }
      onClose();
    } catch (err) {
      console.error('Failed to save trigger:', err);
    }
  };

  const handleTest = async () => {
    if (!trigger || !selectedTestCall) return;
    try {
      await testTrigger({ id: trigger._id, callId: selectedTestCall }).unwrap();
    } catch (err) {
      console.error('Failed to test trigger:', err);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-slate-800 rounded-xl w-full max-w-2xl max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="sticky top-0 bg-slate-800 border-b border-slate-700 px-6 py-4 flex items-center justify-between">
          <h2 className="text-xl font-semibold">
            {trigger ? 'Edit Trigger' : 'Add Trigger'}
          </h2>
          <button
            onClick={onClose}
            className="text-slate-400 hover:text-white transition-colors"
          >
            <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-6">
          {/* Name */}
          <div>
            <label className="block text-sm font-medium mb-2">Name *</label>
            <input
              type="text"
              value={formData.name}
              onChange={(e) => setFormData((p) => ({ ...p, name: e.target.value }))}
              className="w-full bg-slate-700 border border-slate-600 rounded-lg px-4 py-2.5 focus:outline-none focus:ring-2 focus:ring-blue-500"
              placeholder="Delayed Order Alert"
              required
            />
          </div>

          {/* Description */}
          <div>
            <label className="block text-sm font-medium mb-2">Description</label>
            <textarea
              value={formData.description}
              onChange={(e) => setFormData((p) => ({ ...p, description: e.target.value }))}
              className="w-full bg-slate-700 border border-slate-600 rounded-lg px-4 py-2.5 focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
              rows={2}
              placeholder="Triggers when an order is delayed by more than 3 days"
            />
          </div>

          {/* Relevant Intents */}
          <div>
            <label className="block text-sm font-medium mb-2">Relevant Intents</label>
            <div className="flex flex-wrap gap-2">
              {INTENT_OPTIONS.map((intent) => (
                <button
                  key={intent}
                  type="button"
                  onClick={() => handleIntentToggle(intent)}
                  className={`px-3 py-1.5 rounded-full text-sm transition-colors ${
                    formData.relevantIntents.includes(intent)
                      ? 'bg-blue-600 text-white'
                      : 'bg-slate-700 text-slate-300 hover:bg-slate-600'
                  }`}
                >
                  {intent.replace(/_/g, ' ')}
                </button>
              ))}
            </div>
            <p className="text-xs text-slate-400 mt-1">
              Leave empty to match all intents
            </p>
          </div>

          {/* Condition Builder */}
          <div className="bg-slate-700/50 rounded-lg p-4 space-y-4">
            <h3 className="text-sm font-medium">Condition</h3>
            <div className="grid grid-cols-3 gap-3">
              {/* Field */}
              <div>
                <label className="block text-xs text-slate-400 mb-1">Field</label>
                <select
                  value={formData.condition.field}
                  onChange={(e) => handleConditionChange('field', e.target.value)}
                  className="w-full bg-slate-700 border border-slate-600 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  <option value="">Select field...</option>
                  {FIELD_OPTIONS.map((f) => (
                    <option key={f.value} value={f.value}>
                      {f.label}
                    </option>
                  ))}
                </select>
              </div>

              {/* Operator */}
              <div>
                <label className="block text-xs text-slate-400 mb-1">Operator</label>
                <select
                  value={formData.condition.operator}
                  onChange={(e) => handleConditionChange('operator', e.target.value)}
                  className="w-full bg-slate-700 border border-slate-600 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  {OPERATOR_OPTIONS.map((o) => (
                    <option key={o.value} value={o.value}>
                      {o.label}
                    </option>
                  ))}
                </select>
              </div>

              {/* Value */}
              <div>
                <label className="block text-xs text-slate-400 mb-1">Value</label>
                <input
                  type="text"
                  value={String(formData.condition.value || '')}
                  onChange={(e) => {
                    const val = e.target.value;
                    // Try to parse as number
                    const numVal = Number(val);
                    handleConditionChange('value', isNaN(numVal) ? val : numVal);
                  }}
                  disabled={!operatorConfig?.needsValue}
                  className="w-full bg-slate-700 border border-slate-600 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:opacity-50"
                  placeholder={operatorConfig?.needsValue ? 'Enter value' : 'N/A'}
                />
              </div>
            </div>
          </div>

          {/* Statement Template */}
          <div>
            <label className="block text-sm font-medium mb-2">Statement Template *</label>
            <textarea
              value={formData.statementTemplate}
              onChange={(e) => setFormData((p) => ({ ...p, statementTemplate: e.target.value }))}
              className="w-full bg-slate-700 border border-slate-600 rounded-lg px-4 py-2.5 focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none font-mono text-sm"
              rows={3}
              placeholder="Your order {order_id} is delayed by {delay_days} days. We apologize for the inconvenience."
              required
            />
            <p className="text-xs text-slate-400 mt-1">
              Use {'{variable}'} for dynamic values from customer data
            </p>
          </div>

          {/* Priority & Channel */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium mb-2">Priority (1-10)</label>
              <input
                type="number"
                min={1}
                max={10}
                value={formData.priority}
                onChange={(e) => setFormData((p) => ({ ...p, priority: Number(e.target.value) }))}
                className="w-full bg-slate-700 border border-slate-600 rounded-lg px-4 py-2.5 focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
              <p className="text-xs text-slate-400 mt-1">Lower = higher priority</p>
            </div>

            <div>
              <label className="block text-sm font-medium mb-2">Channel</label>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => setFormData((p) => ({ ...p, channel: 'voice' }))}
                  className={`flex-1 py-2.5 rounded-lg transition-colors ${
                    formData.channel === 'voice'
                      ? 'bg-blue-600 text-white'
                      : 'bg-slate-700 text-slate-300 hover:bg-slate-600'
                  }`}
                >
                  Voice Only
                </button>
                <button
                  type="button"
                  onClick={() => setFormData((p) => ({ ...p, channel: 'both' }))}
                  className={`flex-1 py-2.5 rounded-lg transition-colors ${
                    formData.channel === 'both'
                      ? 'bg-blue-600 text-white'
                      : 'bg-slate-700 text-slate-300 hover:bg-slate-600'
                  }`}
                >
                  Both
                </button>
              </div>
            </div>
          </div>

          {/* Test on Live Call */}
          {trigger && activeCalls.length > 0 && (
            <div className="bg-amber-500/10 border border-amber-500/30 rounded-lg p-4">
              <h3 className="text-sm font-medium text-amber-400 mb-3">Test on Live Call</h3>
              <div className="flex gap-3">
                <select
                  value={selectedTestCall}
                  onChange={(e) => setSelectedTestCall(e.target.value)}
                  className="flex-1 bg-slate-700 border border-slate-600 rounded-lg px-3 py-2"
                >
                  <option value="">Select active call...</option>
                  {activeCalls.map((callId) => (
                    <option key={callId} value={callId}>
                      {callId.slice(0, 8)}...
                    </option>
                  ))}
                </select>
                <button
                  type="button"
                  onClick={handleTest}
                  disabled={!selectedTestCall || isTesting}
                  className="px-4 py-2 bg-amber-600 hover:bg-amber-500 disabled:opacity-50 rounded-lg transition-colors"
                >
                  {isTesting ? 'Testing...' : 'Test'}
                </button>
              </div>

              {testResult && (
                <div
                  className={`mt-3 p-3 rounded-lg ${
                    testResult.triggered
                      ? 'bg-green-500/20 border border-green-500/30'
                      : 'bg-slate-700/50'
                  }`}
                >
                  {testResult.triggered ? (
                    <>
                      <p className="text-green-400 font-medium">✓ Trigger matched!</p>
                      <p className="text-sm text-slate-300 mt-1">{testResult.statement}</p>
                    </>
                  ) : (
                    <p className="text-slate-400">Condition not met for this call</p>
                  )}
                </div>
              )}
            </div>
          )}

          {/* Actions */}
          <div className="flex justify-end gap-3 pt-4 border-t border-slate-700">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2.5 text-slate-300 hover:text-white transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isCreating || isUpdating}
              className="px-6 py-2.5 bg-blue-600 hover:bg-blue-500 disabled:opacity-50 rounded-lg font-medium transition-colors"
            >
              {isCreating || isUpdating ? 'Saving...' : 'Save Trigger'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ============================================================================
// TRIGGER CARD
// ============================================================================

interface TriggerCardProps {
  trigger: ProactiveTrigger;
  onEdit: () => void;
  onDelete: () => void;
  onToggle: () => void;
}

function TriggerCard({ trigger, onEdit, onDelete, onToggle }: TriggerCardProps) {
  const fieldLabel = FIELD_OPTIONS.find((f) => f.value === trigger.condition.field)?.label || trigger.condition.field;
  const operatorLabel = OPERATOR_OPTIONS.find((o) => o.value === trigger.condition.operator)?.label || trigger.condition.operator;

  const conditionSummary = `${fieldLabel} ${operatorLabel}${
    trigger.condition.value !== undefined ? ` "${trigger.condition.value}"` : ''
  }`;

  return (
    <tr className="border-b border-slate-700/50 hover:bg-slate-700/30 transition-colors">
      {/* Name */}
      <td className="px-4 py-4">
        <div className="font-medium">{trigger.name}</div>
        {trigger.description && (
          <div className="text-sm text-slate-400 mt-0.5">{trigger.description}</div>
        )}
      </td>

      {/* Intents */}
      <td className="px-4 py-4">
        <div className="flex flex-wrap gap-1">
          {trigger.relevantIntents.length > 0 ? (
            trigger.relevantIntents.slice(0, 3).map((intent) => (
              <span
                key={intent}
                className="px-2 py-0.5 bg-slate-700 rounded text-xs text-slate-300"
              >
                {intent.replace(/_/g, ' ')}
              </span>
            ))
          ) : (
            <span className="text-slate-500 text-sm">All intents</span>
          )}
          {trigger.relevantIntents.length > 3 && (
            <span className="text-slate-400 text-xs">
              +{trigger.relevantIntents.length - 3} more
            </span>
          )}
        </div>
      </td>

      {/* Condition */}
      <td className="px-4 py-4">
        <span className="text-sm text-slate-300">{conditionSummary}</span>
      </td>

      {/* Priority */}
      <td className="px-4 py-4 text-center">
        <span
          className={`inline-flex items-center justify-center w-6 h-6 rounded-full text-xs font-medium ${
            trigger.priority <= 3
              ? 'bg-red-500/20 text-red-400'
              : trigger.priority <= 6
              ? 'bg-amber-500/20 text-amber-400'
              : 'bg-slate-600 text-slate-300'
          }`}
        >
          {trigger.priority}
        </span>
      </td>

      {/* Status Toggle */}
      <td className="px-4 py-4">
        <button
          onClick={onToggle}
          className={`relative w-11 h-6 rounded-full transition-colors ${
            trigger.isActive ? 'bg-green-600' : 'bg-slate-600'
          }`}
        >
          <span
            className={`absolute top-1 w-4 h-4 bg-white rounded-full transition-transform ${
              trigger.isActive ? 'left-6' : 'left-1'
            }`}
          />
        </button>
      </td>

      {/* Actions */}
      <td className="px-4 py-4">
        <div className="flex items-center gap-2">
          <button
            onClick={onEdit}
            className="p-2 text-slate-400 hover:text-white hover:bg-slate-700 rounded-lg transition-colors"
            title="Edit"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"
              />
            </svg>
          </button>
          <button
            onClick={onDelete}
            className="p-2 text-slate-400 hover:text-red-400 hover:bg-slate-700 rounded-lg transition-colors"
            title="Delete"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"
              />
            </svg>
          </button>
        </div>
      </td>
    </tr>
  );
}

// ============================================================================
// MAIN PAGE
// ============================================================================

export function ProactiveTriggers() {
  const { data, isLoading, error } = useGetTriggersQuery();
  const { data: callsData } = useGetActiveCallsQuery(undefined, { pollingInterval: 30000 });
  const [toggleTrigger] = useToggleTriggerMutation();
  const [deleteTrigger] = useDeleteTriggerMutation();

  const [showModal, setShowModal] = useState(false);
  const [editingTrigger, setEditingTrigger] = useState<ProactiveTrigger | undefined>();
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null);

  const activeCalls = callsData?.calls?.map((c) => c.callId) || [];

  const handleEdit = (trigger: ProactiveTrigger) => {
    setEditingTrigger(trigger);
    setShowModal(true);
  };

  const handleAddNew = () => {
    setEditingTrigger(undefined);
    setShowModal(true);
  };

  const handleCloseModal = () => {
    setShowModal(false);
    setEditingTrigger(undefined);
  };

  const handleToggle = async (trigger: ProactiveTrigger) => {
    try {
      await toggleTrigger({ id: trigger._id, isActive: !trigger.isActive }).unwrap();
    } catch (err) {
      console.error('Failed to toggle trigger:', err);
    }
  };

  const handleDelete = async (id: string) => {
    try {
      await deleteTrigger(id).unwrap();
      setDeleteConfirm(null);
    } catch (err) {
      console.error('Failed to delete trigger:', err);
    }
  };

  if (error) {
    return (
      <div className="p-6">
        <div className="bg-red-500/10 border border-red-500/30 rounded-lg p-4 text-red-400">
          Failed to load triggers. Please try again.
        </div>
      </div>
    );
  }

  return (
    <div className="p-6 max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <h1 className="text-2xl font-bold">Proactive Triggers</h1>
          {data && (
            <span className="px-2.5 py-1 bg-blue-500/20 text-blue-400 rounded-full text-sm font-medium">
              {data.count}
            </span>
          )}
        </div>
        <button
          onClick={handleAddNew}
          className="flex items-center gap-2 px-4 py-2.5 bg-blue-600 hover:bg-blue-500 rounded-lg font-medium transition-colors"
        >
          <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
          </svg>
          Add Trigger
        </button>
      </div>

      {/* Info Banner */}
      <div className="bg-purple-500/10 border border-purple-500/30 rounded-lg p-4 mb-6 flex items-start gap-3">
        <span className="text-purple-400 text-xl">✨</span>
        <div>
          <p className="text-purple-300 font-medium">AI-Powered Proactive Support</p>
          <p className="text-sm text-slate-400 mt-1">
            Triggers inject contextual insights into the AI's responses, helping it anticipate customer needs
            and provide more helpful support. The AI will weave these insights naturally into the conversation.
          </p>
        </div>
      </div>

      {/* Triggers Table */}
      {isLoading ? (
        <div className="bg-slate-800 rounded-xl p-8 flex items-center justify-center">
          <div className="animate-spin w-8 h-8 border-2 border-blue-500 border-t-transparent rounded-full" />
        </div>
      ) : data?.triggers.length === 0 ? (
        <div className="bg-slate-800 rounded-xl p-12 text-center">
          <div className="w-16 h-16 bg-slate-700 rounded-full flex items-center justify-center mx-auto mb-4">
            <svg className="w-8 h-8 text-slate-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M13 10V3L4 14h7v7l9-11h-7z"
              />
            </svg>
          </div>
          <h3 className="text-lg font-medium mb-2">No Triggers Yet</h3>
          <p className="text-slate-400 mb-4">
            Create your first proactive trigger to enhance AI support
          </p>
          <button
            onClick={handleAddNew}
            className="px-4 py-2 bg-blue-600 hover:bg-blue-500 rounded-lg font-medium transition-colors"
          >
            Create First Trigger
          </button>
        </div>
      ) : (
        <div className="bg-slate-800 rounded-xl overflow-hidden">
          <table className="w-full">
            <thead>
              <tr className="bg-slate-700/50 text-left text-sm text-slate-400">
                <th className="px-4 py-3 font-medium">Name</th>
                <th className="px-4 py-3 font-medium">Relevant Intents</th>
                <th className="px-4 py-3 font-medium">Condition</th>
                <th className="px-4 py-3 font-medium text-center">Priority</th>
                <th className="px-4 py-3 font-medium">Status</th>
                <th className="px-4 py-3 font-medium">Actions</th>
              </tr>
            </thead>
            <tbody>
              {data?.triggers.map((trigger) => (
                <TriggerCard
                  key={trigger._id}
                  trigger={trigger}
                  onEdit={() => handleEdit(trigger)}
                  onDelete={() => setDeleteConfirm(trigger._id)}
                  onToggle={() => handleToggle(trigger)}
                />
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Modal */}
      {showModal && (
        <TriggerFormModal
          trigger={editingTrigger}
          onClose={handleCloseModal}
          activeCalls={activeCalls}
        />
      )}

      {/* Delete Confirmation */}
      {deleteConfirm && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-slate-800 rounded-xl p-6 max-w-md w-full mx-4">
            <h3 className="text-lg font-semibold mb-2">Delete Trigger?</h3>
            <p className="text-slate-400 mb-6">
              This action cannot be undone. The trigger will be permanently removed.
            </p>
            <div className="flex justify-end gap-3">
              <button
                onClick={() => setDeleteConfirm(null)}
                className="px-4 py-2 text-slate-300 hover:text-white transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={() => handleDelete(deleteConfirm)}
                className="px-4 py-2 bg-red-600 hover:bg-red-500 rounded-lg font-medium transition-colors"
              >
                Delete
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default ProactiveTriggers;
