import { useEffect, useState, useRef } from 'react';
import { TrendingUp, TrendingDown, Minus } from 'lucide-react';

export interface StatCardProps {
  value: number | string;
  label: string;
  trend?: number;
  trendPositive?: boolean;
  accent: 'blue' | 'amber' | 'teal' | 'green' | 'red' | 'purple';
  subtitle?: string;
  isLive?: boolean;
  prefix?: string;
  suffix?: string;
}

const accentColors = {
  blue: {
    bar: 'bg-blue-500',
    bg: 'bg-blue-50',
    text: 'text-blue-600',
    live: 'bg-blue-500',
  },
  amber: {
    bar: 'bg-amber-500',
    bg: 'bg-amber-50',
    text: 'text-amber-600',
    live: 'bg-amber-500',
  },
  teal: {
    bar: 'bg-teal-500',
    bg: 'bg-teal-50',
    text: 'text-teal-600',
    live: 'bg-teal-500',
  },
  green: {
    bar: 'bg-green-500',
    bg: 'bg-green-50',
    text: 'text-green-600',
    live: 'bg-green-500',
  },
  red: {
    bar: 'bg-red-500',
    bg: 'bg-red-50',
    text: 'text-red-600',
    live: 'bg-red-500',
  },
  purple: {
    bar: 'bg-purple-500',
    bg: 'bg-purple-50',
    text: 'text-purple-600',
    live: 'bg-purple-500',
  },
};

function useCountUp(end: number, duration: number = 1000): number {
  const [count, setCount] = useState(0);
  const prevEndRef = useRef(end);

  useEffect(() => {
    // Only animate if value changed
    if (prevEndRef.current === end) {
      setCount(end);
      return;
    }

    prevEndRef.current = end;
    const startValue = count;
    const startTime = performance.now();

    const animate = (currentTime: number) => {
      const elapsed = currentTime - startTime;
      const progress = Math.min(elapsed / duration, 1);

      // Ease out quad
      const easeOut = 1 - (1 - progress) * (1 - progress);
      const currentValue = startValue + (end - startValue) * easeOut;

      setCount(Math.round(currentValue));

      if (progress < 1) {
        requestAnimationFrame(animate);
      }
    };

    requestAnimationFrame(animate);
  }, [end, duration]);

  return count;
}

export default function StatCard({
  value,
  label,
  trend,
  trendPositive,
  accent,
  subtitle,
  isLive,
  prefix = '',
  suffix = '',
}: StatCardProps) {
  const colors = accentColors[accent];
  const numericValue = typeof value === 'number' ? value : parseFloat(value) || 0;
  const animatedValue = useCountUp(numericValue);
  const displayValue = typeof value === 'number' ? animatedValue : value;

  // Determine trend direction
  const showTrend = trend !== undefined && trend !== 0;
  const trendUp = trend !== undefined && trend > 0;
  const trendNeutral = trend === 0;

  // Format trend display
  const formatTrend = (t: number): string => {
    const absVal = Math.abs(t);
    if (absVal >= 1000) {
      return `${(absVal / 1000).toFixed(1)}k`;
    }
    return absVal.toFixed(absVal < 10 ? 1 : 0);
  };

  return (
    <div className="relative bg-white rounded-xl border border-gray-200 overflow-hidden">
      {/* Left accent bar */}
      <div className={`absolute left-0 top-0 bottom-0 w-1 ${colors.bar}`} />

      <div className="p-6 pl-5">
        {/* Header with live indicator */}
        <div className="flex items-center justify-between mb-2">
          <span className="text-sm text-gray-500">{label}</span>
          {isLive && (
            <span className="flex items-center gap-1.5 px-2 py-0.5 bg-red-50 rounded-full">
              <span className="relative flex h-2 w-2">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75"></span>
                <span className="relative inline-flex rounded-full h-2 w-2 bg-red-500"></span>
              </span>
              <span className="text-xs font-medium text-red-600">LIVE</span>
            </span>
          )}
        </div>

        {/* Main value */}
        <div className="flex items-baseline gap-2">
          <span className={`text-4xl font-bold ${colors.text}`}>
            {prefix}
            {displayValue}
            {suffix}
          </span>

          {/* Trend indicator */}
          {showTrend && (
            <span
              className={`flex items-center gap-0.5 text-sm font-medium ${
                trendPositive === undefined
                  ? trendUp
                    ? 'text-green-600'
                    : 'text-red-600'
                  : trendPositive
                    ? 'text-green-600'
                    : 'text-red-600'
              }`}
            >
              {trendUp ? (
                <TrendingUp className="h-4 w-4" />
              ) : (
                <TrendingDown className="h-4 w-4" />
              )}
              {formatTrend(trend!)}
            </span>
          )}

          {trendNeutral && (
            <span className="flex items-center gap-0.5 text-sm font-medium text-gray-400">
              <Minus className="h-4 w-4" />
              0
            </span>
          )}
        </div>

        {/* Subtitle */}
        {subtitle && <p className="mt-1 text-sm text-gray-500">{subtitle}</p>}

        {/* Mini sparkline placeholder */}
        <div className="mt-3 h-8">
          <MiniSparkline accent={accent} />
        </div>
      </div>
    </div>
  );
}

// Simple sparkline visualization
function MiniSparkline({ accent }: { accent: string }) {
  const colors = accentColors[accent as keyof typeof accentColors];

  // Generate random-ish sparkline data for visualization
  const points = [30, 45, 25, 60, 35, 70, 50, 65, 55, 80, 60, 75];
  const width = 100;
  const height = 32;
  const maxVal = Math.max(...points);
  const minVal = Math.min(...points);
  const range = maxVal - minVal || 1;

  const pathD = points
    .map((p, i) => {
      const x = (i / (points.length - 1)) * width;
      const y = height - ((p - minVal) / range) * height;
      return `${i === 0 ? 'M' : 'L'} ${x} ${y}`;
    })
    .join(' ');

  return (
    <svg
      viewBox={`0 0 ${width} ${height}`}
      className="w-full h-full"
      preserveAspectRatio="none"
    >
      <defs>
        <linearGradient id={`sparkGradient-${accent}`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={colors.bar.replace('bg-', '')} stopOpacity="0.3" />
          <stop offset="100%" stopColor={colors.bar.replace('bg-', '')} stopOpacity="0.05" />
        </linearGradient>
      </defs>
      {/* Fill area under line */}
      <path
        d={`${pathD} L ${width} ${height} L 0 ${height} Z`}
        className={`${colors.bg} opacity-50`}
        fill="currentColor"
      />
      {/* Line */}
      <path
        d={pathD}
        fill="none"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        className={`${colors.text}`}
        stroke="currentColor"
      />
    </svg>
  );
}
