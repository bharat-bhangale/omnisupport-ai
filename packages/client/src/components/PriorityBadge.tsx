import React from 'react';
import type { TicketPriority, InternalPriority } from '../types/ticket';

interface PriorityBadgeProps {
  priority: TicketPriority | InternalPriority;
  size?: 'sm' | 'md';
}

const priorityConfig: Record<
  TicketPriority | InternalPriority,
  { label: string; bg: string; text: string; dot: string }
> = {
  // Ticket Priority (P1-P4)
  P1: {
    label: 'P1',
    bg: 'bg-red-100',
    text: 'text-red-700',
    dot: 'bg-red-500',
  },
  P2: {
    label: 'P2',
    bg: 'bg-amber-100',
    text: 'text-amber-700',
    dot: 'bg-amber-500',
  },
  P3: {
    label: 'P3',
    bg: 'bg-blue-100',
    text: 'text-blue-700',
    dot: 'bg-blue-500',
  },
  P4: {
    label: 'P4',
    bg: 'bg-gray-100',
    text: 'text-gray-600',
    dot: 'bg-gray-400',
  },
  // Internal Priority mapping
  urgent: {
    label: 'Urgent',
    bg: 'bg-red-100',
    text: 'text-red-700',
    dot: 'bg-red-500',
  },
  high: {
    label: 'High',
    bg: 'bg-amber-100',
    text: 'text-amber-700',
    dot: 'bg-amber-500',
  },
  normal: {
    label: 'Normal',
    bg: 'bg-blue-100',
    text: 'text-blue-700',
    dot: 'bg-blue-500',
  },
  low: {
    label: 'Low',
    bg: 'bg-gray-100',
    text: 'text-gray-600',
    dot: 'bg-gray-400',
  },
};

export function PriorityBadge({ priority, size = 'md' }: PriorityBadgeProps): React.ReactElement {
  const config = priorityConfig[priority];
  
  const sizeClasses = size === 'sm' 
    ? 'px-1.5 py-0.5 text-xs' 
    : 'px-2 py-1 text-sm';

  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full font-medium ${config.bg} ${config.text} ${sizeClasses}`}
    >
      <span className={`w-1.5 h-1.5 rounded-full ${config.dot}`} />
      {config.label}
    </span>
  );
}

interface PriorityDotProps {
  priority: TicketPriority | InternalPriority;
  size?: 'sm' | 'md';
}

export function PriorityDot({ priority, size = 'md' }: PriorityDotProps): React.ReactElement {
  const config = priorityConfig[priority];
  const dotSize = size === 'sm' ? 'w-2 h-2' : 'w-2.5 h-2.5';

  return (
    <span 
      className={`inline-block rounded-full ${config.dot} ${dotSize}`}
      title={config.label}
    />
  );
}

export default PriorityBadge;
