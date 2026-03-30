import { RadialBarChart, RadialBar, ResponsiveContainer, PolarAngleAxis } from 'recharts';
import { TrendingUp, TrendingDown } from 'lucide-react';

interface SLAComplianceGaugeProps {
  rate: number; // 0-100
  trend: number; // percentage change
  trendPositive: boolean;
}

function getGaugeColor(rate: number): string {
  if (rate >= 95) return '#22c55e'; // green
  if (rate >= 85) return '#f59e0b'; // amber
  return '#ef4444'; // red
}

function getStatusText(rate: number): string {
  if (rate >= 95) return 'Excellent';
  if (rate >= 90) return 'Good';
  if (rate >= 85) return 'Fair';
  return 'At Risk';
}

export function SLAComplianceGauge({ rate, trend, trendPositive }: SLAComplianceGaugeProps) {
  const color = getGaugeColor(rate);
  const statusText = getStatusText(rate);

  const data = [
    {
      name: 'Compliance',
      value: rate,
      fill: color,
    },
  ];

  return (
    <div className="flex flex-col items-center">
      <div className="relative w-48 h-48">
        <ResponsiveContainer width="100%" height="100%">
          <RadialBarChart
            cx="50%"
            cy="50%"
            innerRadius="70%"
            outerRadius="100%"
            barSize={20}
            data={data}
            startAngle={180}
            endAngle={0}
          >
            <PolarAngleAxis
              type="number"
              domain={[0, 100]}
              angleAxisId={0}
              tick={false}
            />
            <RadialBar
              background={{ fill: '#e5e7eb' }}
              dataKey="value"
              cornerRadius={10}
              angleAxisId={0}
            />
          </RadialBarChart>
        </ResponsiveContainer>

        {/* Center content */}
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <span className="text-4xl font-bold" style={{ color }}>
            {rate}%
          </span>
          <span className="text-sm text-gray-500 mt-1">{statusText}</span>
        </div>
      </div>

      {/* Trend indicator */}
      <div className="flex items-center gap-1 mt-2">
        <span className="text-sm text-gray-500">vs last 30 days:</span>
        <span
          className={`flex items-center gap-0.5 text-sm font-medium ${
            trendPositive ? 'text-green-600' : 'text-red-600'
          }`}
        >
          {trendPositive ? (
            <TrendingUp className="h-4 w-4" />
          ) : (
            <TrendingDown className="h-4 w-4" />
          )}
          {trendPositive ? '+' : ''}
          {trend.toFixed(1)}%
        </span>
      </div>
    </div>
  );
}

export default SLAComplianceGauge;
