import React, { useState, useEffect, useCallback } from 'react';
import { Clock, AlertTriangle } from 'lucide-react';

interface SLACountdownProps {
  slaDeadline: string;
  priority?: string;
  compact?: boolean;
  showIcon?: boolean;
}

type SLAStatus = 'compliant' | 'warning' | 'critical' | 'breached';

function getTimeRemaining(deadline: string): number {
  const deadlineMs = new Date(deadline).getTime();
  return deadlineMs - Date.now();
}

function formatCountdown(ms: number): string {
  if (ms <= 0) return 'BREACHED';
  
  const totalMinutes = Math.floor(ms / 60000);
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  
  if (hours > 0) {
    return `${hours}h ${minutes}m`;
  }
  return `${minutes}m`;
}

function getSLAStatus(ms: number): SLAStatus {
  if (ms <= 0) return 'breached';
  if (ms <= 1800000) return 'critical'; // < 30 min
  if (ms <= 3600000) return 'warning';  // 30-60 min
  return 'compliant';
}

function getStatusStyles(status: SLAStatus, compact: boolean): {
  bg: string;
  text: string;
  border: string;
} {
  const styles = {
    compliant: {
      bg: compact ? 'bg-green-100' : 'bg-green-50',
      text: 'text-green-700',
      border: 'border-green-200',
    },
    warning: {
      bg: compact ? 'bg-amber-100' : 'bg-amber-50',
      text: 'text-amber-700',
      border: 'border-amber-200',
    },
    critical: {
      bg: compact ? 'bg-red-100' : 'bg-red-50',
      text: 'text-red-700',
      border: 'border-red-200',
    },
    breached: {
      bg: compact ? 'bg-red-600' : 'bg-red-100',
      text: compact ? 'text-white' : 'text-red-800',
      border: 'border-red-400',
    },
  };
  return styles[status];
}

export function SLACountdown({
  slaDeadline,
  priority,
  compact = false,
  showIcon = true,
}: SLACountdownProps): React.ReactElement {
  const [timeRemaining, setTimeRemaining] = useState<number>(() => getTimeRemaining(slaDeadline));
  
  const updateTime = useCallback(() => {
    setTimeRemaining(getTimeRemaining(slaDeadline));
  }, [slaDeadline]);
  
  useEffect(() => {
    updateTime();
    const interval = setInterval(updateTime, 60000); // Update every minute
    return () => clearInterval(interval);
  }, [updateTime]);
  
  const status = getSLAStatus(timeRemaining);
  const styles = getStatusStyles(status, compact);
  const countdown = formatCountdown(timeRemaining);
  
  if (compact) {
    return (
      <span
        className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-medium ${styles.bg} ${styles.text}`}
        title={`SLA Deadline: ${new Date(slaDeadline).toLocaleString()}`}
      >
        {status === 'breached' ? (
          <>
            <AlertTriangle className="w-3 h-3" />
            SLA
          </>
        ) : (
          <>
            <Clock className="w-3 h-3" />
            {countdown}
          </>
        )}
      </span>
    );
  }
  
  return (
    <div
      className={`rounded-lg border p-3 ${styles.bg} ${styles.border}`}
    >
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          {showIcon && (
            status === 'breached' ? (
              <AlertTriangle className={`w-4 h-4 ${styles.text}`} />
            ) : (
              <Clock className={`w-4 h-4 ${styles.text}`} />
            )
          )}
          <span className={`text-sm font-medium ${styles.text}`}>
            {status === 'breached' ? 'SLA: BREACHED' : `SLA in: ${countdown}`}
          </span>
        </div>
        {priority && (
          <span className="text-xs text-gray-500">{priority.toUpperCase()}</span>
        )}
      </div>
      {status === 'breached' && (
        <p className="text-xs text-red-600 mt-1">
          Response deadline has passed
        </p>
      )}
    </div>
  );
}

/**
 * Compact chip variant for ticket list rows
 */
export function SLAChip({ slaDeadline }: { slaDeadline: string }): React.ReactElement {
  return <SLACountdown slaDeadline={slaDeadline} compact showIcon={false} />;
}

export default SLACountdown;
