// ============================================================================
// PROACTIVE CONTEXT DISPLAY COMPONENT
// ============================================================================
// Used inside TranscriptDrawer to show active proactive context for a call

import { useGetProactiveContextQuery } from '../api/proactiveApi';

interface ProactiveContextDisplayProps {
  callId: string;
}

export function ProactiveContextDisplay({ callId }: ProactiveContextDisplayProps) {
  const { data, isLoading, error } = useGetProactiveContextQuery(callId, {
    pollingInterval: 15000, // Refresh every 15s while open
    skip: !callId,
  });

  // Don't show anything if no context
  if (!data?.hasContext || (!data.triggers.length && !data.predictions.length)) {
    return null;
  }

  if (isLoading) {
    return (
      <div className="p-4 bg-purple-500/10 rounded-lg animate-pulse">
        <div className="h-4 bg-purple-500/20 rounded w-32 mb-2" />
        <div className="h-3 bg-purple-500/20 rounded w-full" />
      </div>
    );
  }

  if (error) {
    return null; // Silently fail for this component
  }

  return (
    <div className="bg-purple-500/10 border border-purple-500/30 rounded-lg overflow-hidden">
      {/* Header */}
      <div className="px-4 py-2.5 bg-purple-500/20 flex items-center gap-2">
        <span className="text-lg">✨</span>
        <span className="font-medium text-purple-300">Proactive Context Active</span>
      </div>

      <div className="p-4 space-y-4">
        {/* Triggered Insights */}
        {data.triggers.length > 0 && (
          <div>
            <h4 className="text-xs font-medium text-slate-400 uppercase tracking-wider mb-2">
              Triggered Insights
            </h4>
            <ul className="space-y-2">
              {data.triggers.map((trigger, idx) => (
                <li
                  key={idx}
                  className="flex items-start gap-2 text-sm text-slate-300"
                >
                  <span className="text-purple-400 mt-0.5">•</span>
                  <span>{trigger}</span>
                </li>
              ))}
            </ul>
          </div>
        )}

        {/* Predicted Follow-ups */}
        {data.predictions.length > 0 && (
          <div>
            <h4 className="text-xs font-medium text-slate-400 uppercase tracking-wider mb-2">
              Predicted Follow-up Questions
            </h4>
            <ul className="space-y-2">
              {data.predictions.map((prediction, idx) => (
                <li
                  key={idx}
                  className="flex items-start gap-2 text-sm text-slate-300"
                >
                  <span className="text-amber-400 mt-0.5">?</span>
                  <span className="italic">{prediction}</span>
                </li>
              ))}
            </ul>
          </div>
        )}

        {/* Info Note */}
        <p className="text-xs text-slate-500 pt-2 border-t border-slate-700">
          The AI will weave these insights naturally into the conversation
        </p>
      </div>
    </div>
  );
}

export default ProactiveContextDisplay;
