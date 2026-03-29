import { useEffect, useRef, useCallback } from 'react';
import { io, Socket } from 'socket.io-client';
import toast from 'react-hot-toast';
import type {
  EscalationIncomingEvent,
  EscalationAcceptedEvent,
  EscalationHoldUpdateEvent,
  EscalationResolvedEvent,
} from '../types/escalation';

interface UseEscalationSocketOptions {
  enabled?: boolean;
  onIncoming?: (event: EscalationIncomingEvent) => void;
  onAccepted?: (event: EscalationAcceptedEvent) => void;
  onHoldUpdate?: (event: EscalationHoldUpdateEvent) => void;
  onResolved?: (event: EscalationResolvedEvent) => void;
}

interface UseEscalationSocketReturn {
  isConnected: boolean;
}

/**
 * Request browser notification permission
 */
async function requestNotificationPermission(): Promise<boolean> {
  if (!('Notification' in window)) {
    return false;
  }

  if (Notification.permission === 'granted') {
    return true;
  }

  if (Notification.permission !== 'denied') {
    const permission = await Notification.requestPermission();
    return permission === 'granted';
  }

  return false;
}

/**
 * Show browser notification
 */
function showNotification(title: string, body: string, onClick?: () => void): void {
  if (!('Notification' in window) || Notification.permission !== 'granted') {
    return;
  }

  const notification = new Notification(title, {
    body,
    icon: '/favicon.ico',
    tag: 'escalation',
    requireInteraction: true,
  });

  if (onClick) {
    notification.onclick = () => {
      window.focus();
      onClick();
      notification.close();
    };
  }

  // Auto-close after 30 seconds
  setTimeout(() => notification.close(), 30000);
}

/**
 * Format hold time for display
 */
function formatHoldTime(seconds: number): string {
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return `${mins}:${secs.toString().padStart(2, '0')}`;
}

/**
 * Get priority color class
 */
function getPriorityColor(priority: string): string {
  switch (priority) {
    case 'urgent':
      return 'bg-red-500';
    case 'high':
      return 'bg-orange-500';
    case 'medium':
      return 'bg-amber-500';
    default:
      return 'bg-blue-500';
  }
}

export function useEscalationSocket({
  enabled = true,
  onIncoming,
  onAccepted,
  onHoldUpdate,
  onResolved,
}: UseEscalationSocketOptions = {}): UseEscalationSocketReturn {
  const socketRef = useRef<Socket | null>(null);
  const isConnectedRef = useRef(false);

  // Request notification permission on mount
  useEffect(() => {
    if (enabled) {
      requestNotificationPermission();
    }
  }, [enabled]);

  useEffect(() => {
    if (!enabled) return;

    const socketUrl = import.meta.env.VITE_SOCKET_URL || window.location.origin;

    const socket = io(socketUrl, {
      path: '/socket.io',
      transports: ['websocket', 'polling'],
      auth: {
        token: localStorage.getItem('auth_token'),
        companyId: localStorage.getItem('company_id'),
        userId: localStorage.getItem('user_id'),
      },
      reconnection: true,
      reconnectionAttempts: 10,
      reconnectionDelay: 1000,
    });

    socketRef.current = socket;

    socket.on('connect', () => {
      isConnectedRef.current = true;
      // Join agents room for escalation alerts
      socket.emit('join:agents');
      console.log('[EscalationSocket] Connected and joined agents room');
    });

    socket.on('disconnect', () => {
      isConnectedRef.current = false;
      console.log('[EscalationSocket] Disconnected');
    });

    // Handle incoming escalations
    socket.on('escalation:incoming', (event: EscalationIncomingEvent) => {
      console.log('[EscalationSocket] Incoming escalation:', event);

      // Show toast notification
      toast(
        (t) => (
          <div className="flex items-start gap-3">
            <div
              className={`w-3 h-3 mt-1.5 rounded-full flex-shrink-0 animate-pulse ${getPriorityColor(
                event.priority
              )}`}
            />
            <div className="flex-1">
              <p className="font-semibold text-gray-900">📞 New Escalation</p>
              <p className="text-sm text-gray-600">{event.reason}</p>
              {event.customerName && (
                <p className="text-xs text-gray-500 mt-0.5">
                  {event.customerName}
                  {event.customerTier && event.customerTier !== 'standard' && (
                    <span className="ml-1 px-1 py-0.5 bg-purple-100 text-purple-700 rounded text-xs">
                      {event.customerTier.toUpperCase()}
                    </span>
                  )}
                </p>
              )}
            </div>
            <button
              onClick={() => toast.dismiss(t.id)}
              className="text-gray-400 hover:text-gray-600 text-lg"
            >
              ×
            </button>
          </div>
        ),
        {
          duration: 15000,
          position: 'top-right',
        }
      );

      // Show browser notification
      showNotification(
        '📞 New Escalation',
        `${event.reason}${event.customerName ? ` - ${event.customerName}` : ''}`,
        () => {
          // Navigate to escalations page when clicked
          window.location.href = '/escalations';
        }
      );

      // Play alert sound (optional)
      try {
        const audio = new Audio('/sounds/escalation-alert.mp3');
        audio.volume = 0.5;
        audio.play().catch(() => {
          // Ignore audio play errors
        });
      } catch {
        // Audio not available
      }

      onIncoming?.(event);
    });

    // Handle accepted escalations
    socket.on('escalation:accepted', (event: EscalationAcceptedEvent) => {
      console.log('[EscalationSocket] Escalation accepted:', event);

      toast.success(`Escalation accepted by ${event.acceptedBy}`, {
        duration: 5000,
        position: 'top-right',
      });

      onAccepted?.(event);
    });

    // Handle hold time updates
    socket.on('escalation:holdUpdate', (event: EscalationHoldUpdateEvent) => {
      // Only log if hold time is significant (> 5 minutes)
      if (event.holdSeconds > 300) {
        console.log(
          `[EscalationSocket] Hold update: ${event.escalationId} - ${formatHoldTime(
            event.holdSeconds
          )}`
        );
      }

      onHoldUpdate?.(event);
    });

    // Handle resolved escalations
    socket.on('escalation:resolved', (event: EscalationResolvedEvent) => {
      console.log('[EscalationSocket] Escalation resolved:', event);

      toast.success(`Escalation resolved: ${event.disposition.replace('_', ' ')}`, {
        duration: 4000,
        position: 'top-right',
      });

      onResolved?.(event);
    });

    socket.on('connect_error', (error) => {
      console.error('[EscalationSocket] Connection error:', error.message);
    });

    return () => {
      socket.emit('leave:agents');
      socket.disconnect();
      socketRef.current = null;
      isConnectedRef.current = false;
    };
  }, [enabled, onIncoming, onAccepted, onHoldUpdate, onResolved]);

  return {
    isConnected: isConnectedRef.current,
  };
}

export default useEscalationSocket;
