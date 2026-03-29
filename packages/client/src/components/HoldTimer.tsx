import React, { useState, useEffect, useMemo } from 'react';
import { Clock } from 'lucide-react';

interface HoldTimerProps {
  holdStarted: string;
  size?: 'sm' | 'md' | 'lg';
  showIcon?: boolean;
  className?: string;
}

/**
 * Format seconds to MM:SS
 */
function formatTime(seconds: number): string {
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return `${mins}:${secs.toString().padStart(2, '0')}`;
}

/**
 * Get color based on hold time
 * Green: < 2 minutes
 * Amber: 2-5 minutes
 * Red: > 5 minutes
 */
function getTimeColor(seconds: number): {
  text: string;
  bg: string;
  ring: string;
} {
  if (seconds < 120) {
    // < 2 minutes - green
    return {
      text: 'text-green-700',
      bg: 'bg-green-100',
      ring: 'ring-green-500',
    };
  } else if (seconds < 300) {
    // 2-5 minutes - amber
    return {
      text: 'text-amber-700',
      bg: 'bg-amber-100',
      ring: 'ring-amber-500',
    };
  } else {
    // > 5 minutes - red
    return {
      text: 'text-red-700',
      bg: 'bg-red-100',
      ring: 'ring-red-500',
    };
  }
}

/**
 * HoldTimer component
 * Counts up from holdStarted time
 * Changes color based on duration: green < 2min, amber 2-5min, red > 5min
 */
export function HoldTimer({
  holdStarted,
  size = 'md',
  showIcon = true,
  className = '',
}: HoldTimerProps): React.ReactElement {
  const [holdSeconds, setHoldSeconds] = useState<number>(() => {
    return Math.floor((Date.now() - new Date(holdStarted).getTime()) / 1000);
  });

  // Update every second
  useEffect(() => {
    const interval = setInterval(() => {
      const seconds = Math.floor((Date.now() - new Date(holdStarted).getTime()) / 1000);
      setHoldSeconds(Math.max(0, seconds));
    }, 1000);

    return () => clearInterval(interval);
  }, [holdStarted]);

  const colors = useMemo(() => getTimeColor(holdSeconds), [holdSeconds]);
  const formattedTime = useMemo(() => formatTime(holdSeconds), [holdSeconds]);

  // Size classes
  const sizeClasses = {
    sm: {
      container: 'px-1.5 py-0.5 text-xs',
      icon: 'w-3 h-3',
      gap: 'gap-1',
    },
    md: {
      container: 'px-2 py-1 text-sm',
      icon: 'w-4 h-4',
      gap: 'gap-1.5',
    },
    lg: {
      container: 'px-3 py-1.5 text-base',
      icon: 'w-5 h-5',
      gap: 'gap-2',
    },
  };

  const { container, icon, gap } = sizeClasses[size];

  return (
    <div
      className={`inline-flex items-center ${gap} ${container} rounded-full font-mono font-medium ${colors.bg} ${colors.text} ${className}`}
      title={`On hold since ${new Date(holdStarted).toLocaleTimeString()}`}
    >
      {showIcon && <Clock className={`${icon} ${holdSeconds >= 300 ? 'animate-pulse' : ''}`} />}
      <span>{formattedTime}</span>
    </div>
  );
}

/**
 * Standalone hold time display (not counting)
 * Used when receiving holdSeconds from socket updates
 */
interface StaticHoldTimeProps {
  seconds: number;
  size?: 'sm' | 'md' | 'lg';
  showIcon?: boolean;
  className?: string;
}

export function StaticHoldTime({
  seconds,
  size = 'md',
  showIcon = true,
  className = '',
}: StaticHoldTimeProps): React.ReactElement {
  const colors = getTimeColor(seconds);
  const formattedTime = formatTime(seconds);

  const sizeClasses = {
    sm: {
      container: 'px-1.5 py-0.5 text-xs',
      icon: 'w-3 h-3',
      gap: 'gap-1',
    },
    md: {
      container: 'px-2 py-1 text-sm',
      icon: 'w-4 h-4',
      gap: 'gap-1.5',
    },
    lg: {
      container: 'px-3 py-1.5 text-base',
      icon: 'w-5 h-5',
      gap: 'gap-2',
    },
  };

  const { container, icon, gap } = sizeClasses[size];

  return (
    <div
      className={`inline-flex items-center ${gap} ${container} rounded-full font-mono font-medium ${colors.bg} ${colors.text} ${className}`}
    >
      {showIcon && <Clock className={`${icon} ${seconds >= 300 ? 'animate-pulse' : ''}`} />}
      <span>{formattedTime}</span>
    </div>
  );
}

/**
 * Utility to format hold time for display
 */
export function formatHoldDuration(seconds: number): string {
  if (seconds < 60) {
    return `${seconds}s`;
  } else if (seconds < 3600) {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return secs > 0 ? `${mins}m ${secs}s` : `${mins}m`;
  } else {
    const hours = Math.floor(seconds / 3600);
    const mins = Math.floor((seconds % 3600) / 60);
    return mins > 0 ? `${hours}h ${mins}m` : `${hours}h`;
  }
}

export default HoldTimer;
