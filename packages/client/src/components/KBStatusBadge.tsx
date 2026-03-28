import React from 'react';
import type { KBDocumentStatus } from '../types/kb';

interface KBStatusBadgeProps {
  status: KBDocumentStatus;
  progress?: number;
}

const statusConfig: Record<
  KBDocumentStatus,
  { label: string; bg: string; text: string; dot: string }
> = {
  indexed: {
    label: 'Indexed',
    bg: 'bg-green-100',
    text: 'text-green-700',
    dot: 'bg-green-500',
  },
  indexing: {
    label: 'Indexing',
    bg: 'bg-amber-100',
    text: 'text-amber-700',
    dot: 'bg-amber-500',
  },
  pending: {
    label: 'Pending',
    bg: 'bg-gray-100',
    text: 'text-gray-600',
    dot: 'bg-gray-400',
  },
  error: {
    label: 'Error',
    bg: 'bg-red-100',
    text: 'text-red-700',
    dot: 'bg-red-500',
  },
};

export function KBStatusBadge({
  status,
  progress,
}: KBStatusBadgeProps): React.ReactElement {
  const config = statusConfig[status];
  const showProgress = status === 'indexing' && progress !== undefined;

  return (
    <div className="inline-flex flex-col items-start gap-1">
      <span
        className={`inline-flex items-center gap-1.5 rounded-full px-2 py-1 text-xs font-medium ${config.bg} ${config.text}`}
      >
        <span className={`w-1.5 h-1.5 rounded-full ${config.dot}`} />
        {config.label}
        {showProgress && <span className="ml-1">{Math.round(progress)}%</span>}
      </span>
      {showProgress && (
        <div className="w-full h-1.5 bg-gray-200 rounded-full overflow-hidden">
          <div
            className="h-full bg-amber-500 transition-all duration-300 ease-out"
            style={{ width: `${progress}%` }}
          />
        </div>
      )}
    </div>
  );
}

export default KBStatusBadge;
