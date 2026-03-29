// ============================================================================
// FRAUD SOCKET HOOK
// ============================================================================
// Listens for fraud:highRisk events and shows alert modal for supervisors

import { useEffect, useState, useCallback } from 'react';
import { io, Socket } from 'socket.io-client';
import type { RiskLevel } from '../api/fraudApi';

interface FraudAlert {
  callId: string;
  callerPhone: string;
  riskLevel: RiskLevel;
  compositeScore: number;
  signals: string[];
}

interface UseFraudSocketReturn {
  alert: FraudAlert | null;
  dismissAlert: () => void;
  overrideEscalation: (callId: string) => void;
}

export function useFraudSocket(companyId: string | undefined): UseFraudSocketReturn {
  const [socket, setSocket] = useState<Socket | null>(null);
  const [alert, setAlert] = useState<FraudAlert | null>(null);

  useEffect(() => {
    if (!companyId) return;

    const apiUrl = import.meta.env.VITE_API_URL || 'http://localhost:3001';
    const socketInstance = io(apiUrl, {
      auth: {
        token: localStorage.getItem('accessToken'),
      },
      transports: ['websocket', 'polling'],
    });

    socketInstance.on('connect', () => {
      // Join supervisor room for fraud alerts
      socketInstance.emit('join', `company:${companyId}:supervisors`);
    });

    // Listen for high-risk fraud alerts
    socketInstance.on('fraud:highRisk', (data: FraudAlert) => {
      setAlert(data);

      // Browser notification if permitted
      if (Notification.permission === 'granted') {
        new Notification('⚠️ High Risk Fraud Alert', {
          body: `Phone: ${data.callerPhone}\nRisk: ${data.riskLevel}\nScore: ${(data.compositeScore * 100).toFixed(0)}%`,
          icon: '/fraud-alert.png',
          requireInteraction: true,
        });
      }
    });

    setSocket(socketInstance);

    return () => {
      socketInstance.disconnect();
    };
  }, [companyId]);

  const dismissAlert = useCallback(() => {
    setAlert(null);
  }, []);

  const overrideEscalation = useCallback(
    (callId: string) => {
      if (socket) {
        socket.emit('fraud:overrideEscalation', { callId });
      }
      setAlert(null);
    },
    [socket]
  );

  return { alert, dismissAlert, overrideEscalation };
}

// ============================================================================
// FRAUD ALERT MODAL COMPONENT
// ============================================================================
// Full-screen alert modal for supervisors when high-risk fraud is detected

interface FraudAlertModalProps {
  alert: FraudAlert;
  onDismiss: () => void;
  onOverride: (callId: string) => void;
}

export function FraudAlertModal({ alert, onDismiss, onOverride }: FraudAlertModalProps) {
  const riskColors = {
    critical: 'border-red-500 bg-red-500/10',
    high: 'border-orange-500 bg-orange-500/10',
    medium: 'border-amber-500 bg-amber-500/10',
    low: 'border-slate-500 bg-slate-500/10',
  };

  return (
    <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-[100] p-4">
      <div
        className={`
          w-full max-w-lg rounded-xl border-2 p-6
          ${riskColors[alert.riskLevel]}
          animate-pulse
        `}
      >
        {/* Header */}
        <div className="flex items-center gap-3 mb-6">
          <div className="p-3 bg-red-500/20 rounded-full">
            <svg
              className="w-8 h-8 text-red-400"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
              />
            </svg>
          </div>
          <div>
            <h2 className="text-2xl font-bold text-white">Fraud Alert</h2>
            <p className="text-red-400 font-medium capitalize">
              {alert.riskLevel} Risk Detected
            </p>
          </div>
        </div>

        {/* Details */}
        <div className="space-y-4 mb-6">
          <div className="flex items-center justify-between py-2 border-b border-slate-700">
            <span className="text-slate-400">Caller Phone</span>
            <span className="font-mono text-white">{alert.callerPhone}</span>
          </div>
          <div className="flex items-center justify-between py-2 border-b border-slate-700">
            <span className="text-slate-400">Risk Score</span>
            <span className="font-bold text-red-400">
              {(alert.compositeScore * 100).toFixed(0)}%
            </span>
          </div>
        </div>

        {/* Signals */}
        {alert.signals.length > 0 && (
          <div className="mb-6">
            <h3 className="text-sm font-medium text-slate-300 mb-2">
              Fraud Signals Detected
            </h3>
            <ul className="space-y-2">
              {alert.signals.map((signal, idx) => (
                <li key={idx} className="flex items-start gap-2 text-sm">
                  <svg
                    className="w-4 h-4 text-red-400 mt-0.5 flex-shrink-0"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
                    />
                  </svg>
                  <span className="text-slate-300">{signal}</span>
                </li>
              ))}
            </ul>
          </div>
        )}

        {/* Actions */}
        <div className="flex gap-3">
          <button
            onClick={onDismiss}
            className="flex-1 py-3 bg-slate-700 hover:bg-slate-600 rounded-lg font-medium transition-colors"
          >
            Acknowledge
          </button>
          <button
            onClick={() => onOverride(alert.callId)}
            className="flex-1 py-3 bg-amber-600 hover:bg-amber-500 rounded-lg font-medium transition-colors"
          >
            Override Escalation
          </button>
        </div>

        <p className="text-xs text-slate-500 text-center mt-4">
          This call has been flagged for escalation. Override only if you're certain it's a false positive.
        </p>
      </div>
    </div>
  );
}

export default useFraudSocket;
