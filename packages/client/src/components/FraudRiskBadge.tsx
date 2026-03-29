// ============================================================================
// FRAUD RISK BADGE COMPONENT
// ============================================================================
// Compact colored badge showing risk level with optional score
// Critical level has pulsing animation

import { type RiskLevel } from '../api/fraudApi';

interface FraudRiskBadgeProps {
  riskLevel: RiskLevel;
  score?: number;
  showScore?: boolean;
  size?: 'sm' | 'md';
}

export function FraudRiskBadge({
  riskLevel,
  score,
  showScore = false,
  size = 'md',
}: FraudRiskBadgeProps) {
  const config = {
    critical: {
      bg: 'bg-red-500/20',
      text: 'text-red-400',
      border: 'border-red-500/50',
      pulse: true,
      label: 'Critical',
    },
    high: {
      bg: 'bg-orange-500/20',
      text: 'text-orange-400',
      border: 'border-orange-500/50',
      pulse: false,
      label: 'High',
    },
    medium: {
      bg: 'bg-amber-500/20',
      text: 'text-amber-400',
      border: 'border-amber-500/50',
      pulse: false,
      label: 'Medium',
    },
    low: {
      bg: 'bg-slate-600',
      text: 'text-slate-300',
      border: 'border-slate-500/50',
      pulse: false,
      label: 'Low',
    },
  };

  const { bg, text, border, pulse, label } = config[riskLevel];
  const sizeClasses = size === 'sm' ? 'px-1.5 py-0.5 text-xs' : 'px-2 py-1 text-xs';

  return (
    <span
      className={`
        inline-flex items-center gap-1.5 rounded font-medium
        ${bg} ${text} border ${border} ${sizeClasses}
        ${pulse ? 'animate-pulse' : ''}
      `}
    >
      {/* Risk indicator dot */}
      <span
        className={`w-1.5 h-1.5 rounded-full ${
          riskLevel === 'critical'
            ? 'bg-red-500'
            : riskLevel === 'high'
            ? 'bg-orange-500'
            : riskLevel === 'medium'
            ? 'bg-amber-500'
            : 'bg-slate-400'
        }`}
      />
      {label}
      {showScore && score !== undefined && (
        <span className="ml-1 opacity-75">({(score * 100).toFixed(0)}%)</span>
      )}
    </span>
  );
}

export default FraudRiskBadge;
