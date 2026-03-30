import { useState, useEffect } from 'react';
import { Settings, Save, RotateCcw, Loader2, AlertTriangle } from 'lucide-react';
import type { SLAPolicy, SLAPolicyTier } from '../api/slaApi';

// Default SLA policy
const DEFAULT_POLICY: SLAPolicy = {
  P1: { responseMinutes: 15, resolutionHours: 4 },
  P2: { responseMinutes: 60, resolutionHours: 24 },
  P3: { responseMinutes: 240, resolutionHours: 72 },
  P4: { responseMinutes: 480, resolutionHours: 168 },
};

// Priority colors
const priorityColors: Record<string, { bg: string; text: string; border: string }> = {
  P1: { bg: 'bg-red-100', text: 'text-red-700', border: 'border-red-200' },
  P2: { bg: 'bg-orange-100', text: 'text-orange-700', border: 'border-orange-200' },
  P3: { bg: 'bg-amber-100', text: 'text-amber-700', border: 'border-amber-200' },
  P4: { bg: 'bg-gray-100', text: 'text-gray-700', border: 'border-gray-200' },
};

interface SLAPolicyEditorProps {
  policy: SLAPolicy;
  onSave: (policy: SLAPolicy) => void;
  isLoading?: boolean;
  readOnly?: boolean;
}

export function SLAPolicyEditor({
  policy,
  onSave,
  isLoading = false,
  readOnly = false,
}: SLAPolicyEditorProps) {
  const [editedPolicy, setEditedPolicy] = useState<SLAPolicy>(policy);
  const [hasChanges, setHasChanges] = useState(false);

  useEffect(() => {
    setEditedPolicy(policy);
    setHasChanges(false);
  }, [policy]);

  const handleChange = (
    priority: keyof SLAPolicy,
    field: keyof SLAPolicyTier,
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

  const handleRestoreDefault = (priority: keyof SLAPolicy) => {
    setEditedPolicy((prev) => ({
      ...prev,
      [priority]: { ...DEFAULT_POLICY[priority] },
    }));
    setHasChanges(true);
  };

  const handleSave = () => {
    onSave(editedPolicy);
    setHasChanges(false);
  };

  const priorities: (keyof SLAPolicy)[] = ['P1', 'P2', 'P3', 'P4'];

  return (
    <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
      {/* Header */}
      <div className="px-6 py-4 bg-gray-50 border-b border-gray-200 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="p-2 bg-indigo-100 text-indigo-600 rounded-lg">
            <Settings className="h-5 w-5" />
          </div>
          <div>
            <h3 className="font-semibold text-gray-900">SLA Policy Configuration</h3>
            <p className="text-xs text-gray-500">
              Define response and resolution times per priority
            </p>
          </div>
        </div>
        {!readOnly && (
          <button
            onClick={handleSave}
            disabled={!hasChanges || isLoading}
            className="flex items-center gap-2 px-4 py-2 bg-indigo-600 text-white rounded-lg text-sm font-medium hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {isLoading ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Save className="h-4 w-4" />
            )}
            Save SLA Policy
          </button>
        )}
      </div>

      {/* Policy rows */}
      <div className="divide-y divide-gray-100">
        {priorities.map((priority) => {
          const colors = priorityColors[priority];
          const tier = editedPolicy[priority];
          const isDefault =
            tier.responseMinutes === DEFAULT_POLICY[priority].responseMinutes &&
            tier.resolutionHours === DEFAULT_POLICY[priority].resolutionHours;

          return (
            <div key={priority} className="p-4 flex items-center gap-6">
              {/* Priority badge */}
              <div
                className={`w-12 h-12 rounded-lg flex items-center justify-center font-bold text-lg ${colors.bg} ${colors.text}`}
              >
                {priority}
              </div>

              {/* Response time */}
              <div className="flex-1">
                <label className="block text-xs text-gray-500 mb-1">
                  Response Time
                </label>
                <div className="flex items-center gap-2">
                  <input
                    type="number"
                    min={1}
                    value={tier.responseMinutes}
                    onChange={(e) =>
                      handleChange(priority, 'responseMinutes', parseInt(e.target.value) || 0)
                    }
                    disabled={readOnly}
                    className="w-24 px-3 py-2 border border-gray-300 rounded-lg text-center focus:outline-none focus:ring-2 focus:ring-indigo-500 disabled:bg-gray-50"
                  />
                  <span className="text-sm text-gray-500">minutes</span>
                </div>
              </div>

              {/* Resolution time */}
              <div className="flex-1">
                <label className="block text-xs text-gray-500 mb-1">
                  Resolution Time
                </label>
                <div className="flex items-center gap-2">
                  <input
                    type="number"
                    min={1}
                    value={tier.resolutionHours}
                    onChange={(e) =>
                      handleChange(priority, 'resolutionHours', parseInt(e.target.value) || 0)
                    }
                    disabled={readOnly}
                    className="w-24 px-3 py-2 border border-gray-300 rounded-lg text-center focus:outline-none focus:ring-2 focus:ring-indigo-500 disabled:bg-gray-50"
                  />
                  <span className="text-sm text-gray-500">hours</span>
                </div>
              </div>

              {/* Restore default */}
              {!readOnly && (
                <div className="w-24">
                  {!isDefault && (
                    <button
                      onClick={() => handleRestoreDefault(priority)}
                      className="text-xs text-indigo-600 hover:text-indigo-700 flex items-center gap-1"
                    >
                      <RotateCcw className="h-3 w-3" />
                      Restore default
                    </button>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Read-only notice */}
      {readOnly && (
        <div className="px-4 py-3 bg-amber-50 border-t border-amber-200 flex items-center gap-2 text-amber-700 text-sm">
          <AlertTriangle className="h-4 w-4" />
          Only administrators can modify SLA policy settings.
        </div>
      )}
    </div>
  );
}

export default SLAPolicyEditor;
