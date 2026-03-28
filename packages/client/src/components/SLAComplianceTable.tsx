import React from 'react';
import { CheckCircle, AlertTriangle, XCircle } from 'lucide-react';

export interface PriorityCompliance {
  total: number;
  onTime: number;
  breached: number;
  complianceRate: number;
}

export interface SLAComplianceData {
  P1: PriorityCompliance;
  P2: PriorityCompliance;
  P3: PriorityCompliance;
  P4: PriorityCompliance;
}

interface SLAComplianceTableProps {
  data: SLAComplianceData;
  compact?: boolean;
}

type ComplianceStatus = 'good' | 'warning' | 'at-risk';

function getComplianceStatus(rate: number): ComplianceStatus {
  if (rate >= 95) return 'good';
  if (rate >= 85) return 'warning';
  return 'at-risk';
}

function StatusBadge({ rate }: { rate: number }): React.ReactElement {
  const status = getComplianceStatus(rate);
  
  const config = {
    'good': {
      bg: 'bg-green-100',
      text: 'text-green-700',
      label: 'Good',
      icon: CheckCircle,
    },
    'warning': {
      bg: 'bg-amber-100',
      text: 'text-amber-700',
      label: 'Warning',
      icon: AlertTriangle,
    },
    'at-risk': {
      bg: 'bg-red-100',
      text: 'text-red-700',
      label: 'At Risk',
      icon: XCircle,
    },
  };
  
  const { bg, text, label, icon: Icon } = config[status];
  
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium ${bg} ${text}`}>
      <Icon className="w-3 h-3" />
      {label}
    </span>
  );
}

const priorityLabels: Record<string, { label: string; color: string }> = {
  P1: { label: 'P1 (Urgent)', color: 'text-red-600' },
  P2: { label: 'P2 (High)', color: 'text-amber-600' },
  P3: { label: 'P3 (Normal)', color: 'text-blue-600' },
  P4: { label: 'P4 (Low)', color: 'text-gray-600' },
};

export function SLAComplianceTable({
  data,
  compact = false,
}: SLAComplianceTableProps): React.ReactElement {
  const priorities = ['P1', 'P2', 'P3', 'P4'] as const;
  
  if (compact) {
    return (
      <div className="grid grid-cols-4 gap-2">
        {priorities.map((p) => {
          const stats = data[p];
          const status = getComplianceStatus(stats.complianceRate);
          const statusColors = {
            'good': 'border-green-200 bg-green-50',
            'warning': 'border-amber-200 bg-amber-50',
            'at-risk': 'border-red-200 bg-red-50',
          };
          
          return (
            <div
              key={p}
              className={`rounded-lg border p-3 text-center ${statusColors[status]}`}
            >
              <div className={`text-sm font-bold ${priorityLabels[p].color}`}>
                {p}
              </div>
              <div className="text-2xl font-bold text-gray-900">
                {stats.complianceRate}%
              </div>
              <div className="text-xs text-gray-500">
                {stats.onTime}/{stats.total}
              </div>
            </div>
          );
        })}
      </div>
    );
  }
  
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-gray-200">
            <th className="px-4 py-3 text-left font-medium text-gray-500">Priority</th>
            <th className="px-4 py-3 text-right font-medium text-gray-500">Total</th>
            <th className="px-4 py-3 text-right font-medium text-gray-500">On Time</th>
            <th className="px-4 py-3 text-right font-medium text-gray-500">Breached</th>
            <th className="px-4 py-3 text-right font-medium text-gray-500">Rate</th>
            <th className="px-4 py-3 text-center font-medium text-gray-500">Status</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-100">
          {priorities.map((p) => {
            const stats = data[p];
            const { label, color } = priorityLabels[p];
            
            return (
              <tr key={p} className="hover:bg-gray-50">
                <td className={`px-4 py-3 font-medium ${color}`}>{label}</td>
                <td className="px-4 py-3 text-right text-gray-900">{stats.total}</td>
                <td className="px-4 py-3 text-right text-green-600">{stats.onTime}</td>
                <td className="px-4 py-3 text-right text-red-600">{stats.breached}</td>
                <td className="px-4 py-3 text-right font-semibold text-gray-900">
                  {stats.complianceRate}%
                </td>
                <td className="px-4 py-3 text-center">
                  <StatusBadge rate={stats.complianceRate} />
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

export default SLAComplianceTable;
