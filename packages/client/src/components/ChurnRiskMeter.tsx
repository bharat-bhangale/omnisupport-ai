import React from 'react';

interface ChurnRiskMeterProps {
  score: number; // 0-1
  size?: 'sm' | 'md' | 'lg';
}

function getRiskLevel(score: number): { label: string; color: string } {
  if (score < 0.4) {
    return { label: 'Low', color: 'green' };
  } else if (score < 0.65) {
    return { label: 'Medium', color: 'amber' };
  } else {
    return { label: 'High', color: 'red' };
  }
}

export function ChurnRiskMeter({ score, size = 'md' }: ChurnRiskMeterProps): React.ReactElement {
  const { label, color } = getRiskLevel(score);
  const percentage = Math.min(Math.max(score * 100, 0), 100);

  const sizeConfig = {
    sm: {
      height: 'h-1.5',
      markerSize: 'w-2 h-2',
      fontSize: 'text-xs',
      width: 'w-24',
    },
    md: {
      height: 'h-2',
      markerSize: 'w-3 h-3',
      fontSize: 'text-sm',
      width: 'w-32',
    },
    lg: {
      height: 'h-3',
      markerSize: 'w-4 h-4',
      fontSize: 'text-base',
      width: 'w-48',
    },
  };

  const config = sizeConfig[size];

  return (
    <div className="flex items-center gap-2">
      <div className={`relative ${config.width}`}>
        {/* Background gradient bar */}
        <div
          className={`${config.height} rounded-full overflow-hidden`}
          style={{
            background: 'linear-gradient(to right, #22c55e 0%, #22c55e 40%, #f59e0b 40%, #f59e0b 65%, #ef4444 65%, #ef4444 100%)',
          }}
        />
        
        {/* Marker */}
        <div
          className={`absolute top-1/2 -translate-y-1/2 ${config.markerSize} bg-white border-2 rounded-full shadow-md transition-all duration-300`}
          style={{
            left: `calc(${percentage}% - ${size === 'sm' ? '4px' : size === 'md' ? '6px' : '8px'})`,
            borderColor: color === 'green' ? '#22c55e' : color === 'amber' ? '#f59e0b' : '#ef4444',
          }}
        />
      </div>
      
      {/* Label */}
      <span
        className={`${config.fontSize} font-medium ${
          color === 'green'
            ? 'text-green-600'
            : color === 'amber'
            ? 'text-amber-600'
            : 'text-red-600'
        }`}
      >
        {label} ({Math.round(percentage)}%)
      </span>
    </div>
  );
}

/**
 * Compact version for use in tables/lists
 */
export function ChurnRiskBadge({ score }: { score: number }): React.ReactElement {
  const { label, color } = getRiskLevel(score);

  const bgColor =
    color === 'green'
      ? 'bg-green-100 text-green-700'
      : color === 'amber'
      ? 'bg-amber-100 text-amber-700'
      : 'bg-red-100 text-red-700';

  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium ${bgColor}`}>
      <span
        className={`w-1.5 h-1.5 rounded-full ${
          color === 'green' ? 'bg-green-500' : color === 'amber' ? 'bg-amber-500' : 'bg-red-500'
        }`}
      />
      {label} Risk
    </span>
  );
}

export default ChurnRiskMeter;
