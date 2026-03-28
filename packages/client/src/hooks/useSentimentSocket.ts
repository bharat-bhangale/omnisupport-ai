import { useEffect, useRef } from 'react';
import { io, Socket } from 'socket.io-client';
import toast from 'react-hot-toast';

interface SentimentUpdateEvent {
  callId: string;
  score: number;
  label: 'positive' | 'neutral' | 'negative' | 'highly_negative';
  timestamp: string;
}

interface ChurnAlertEvent {
  customerId: string;
  customerName: string;
  score: number;
  riskLevel: 'low' | 'medium' | 'high';
  timestamp: string;
}

interface EscalationAlertEvent {
  ticketId: string;
  customerId: string;
  reason: string;
  priority: string;
  timestamp: string;
}

interface UseSentimentSocketOptions {
  enabled?: boolean;
  onSentimentUpdate?: (event: SentimentUpdateEvent) => void;
  onChurnAlert?: (event: ChurnAlertEvent) => void;
  onEscalationAlert?: (event: EscalationAlertEvent) => void;
}

interface UseSentimentSocketReturn {
  isConnected: boolean;
}

export function useSentimentSocket({
  enabled = true,
  onSentimentUpdate,
  onChurnAlert,
  onEscalationAlert,
}: UseSentimentSocketOptions = {}): UseSentimentSocketReturn {
  const socketRef = useRef<Socket | null>(null);
  const isConnectedRef = useRef(false);

  useEffect(() => {
    if (!enabled) return;

    const socketUrl = import.meta.env.VITE_SOCKET_URL || window.location.origin;

    const socket = io(socketUrl, {
      path: '/socket.io',
      transports: ['websocket', 'polling'],
      auth: {
        token: localStorage.getItem('auth_token'),
      },
      reconnection: true,
      reconnectionAttempts: 5,
      reconnectionDelay: 1000,
    });

    socketRef.current = socket;

    socket.on('connect', () => {
      isConnectedRef.current = true;
      // Join supervisors room for sentiment alerts
      socket.emit('join:supervisors');
    });

    socket.on('disconnect', () => {
      isConnectedRef.current = false;
    });

    // Handle sentiment updates for live calls
    socket.on('sentimentUpdate', (event: SentimentUpdateEvent) => {
      onSentimentUpdate?.(event);
    });

    // Handle churn alerts
    socket.on('churnAlert', (event: ChurnAlertEvent) => {
      // Show persistent toast for churn alerts
      toast(
        (t) => (
          <div className="flex items-start gap-3">
            <div
              className={`w-2 h-2 mt-2 rounded-full flex-shrink-0 ${
                event.riskLevel === 'high'
                  ? 'bg-red-500'
                  : event.riskLevel === 'medium'
                  ? 'bg-amber-500'
                  : 'bg-green-500'
              }`}
            />
            <div>
              <p className="font-medium text-gray-900">Churn Risk Alert</p>
              <p className="text-sm text-gray-600">
                {event.customerName} - {event.riskLevel} risk ({Math.round(event.score * 100)}%)
              </p>
            </div>
            <button
              onClick={() => toast.dismiss(t.id)}
              className="text-gray-400 hover:text-gray-600"
            >
              ×
            </button>
          </div>
        ),
        {
          duration: 10000, // Persistent for 10 seconds
          position: 'top-right',
        }
      );

      onChurnAlert?.(event);
    });

    // Handle escalation alerts
    socket.on('escalationAlert', (event: EscalationAlertEvent) => {
      toast.error(`Escalation: ${event.reason}`, {
        duration: 8000,
        position: 'top-right',
      });

      onEscalationAlert?.(event);
    });

    socket.on('connect_error', (error) => {
      console.error('[SentimentSocket] Connection error:', error.message);
    });

    return () => {
      socket.emit('leave:supervisors');
      socket.disconnect();
      socketRef.current = null;
      isConnectedRef.current = false;
    };
  }, [enabled, onSentimentUpdate, onChurnAlert, onEscalationAlert]);

  return {
    isConnected: isConnectedRef.current,
  };
}

export default useSentimentSocket;
