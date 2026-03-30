import { useEffect, useState, useCallback } from 'react';
import { useSocket } from './useSocket';
import toast from 'react-hot-toast';

interface SLABreachedEvent {
  ticketId: string;
  subject: string;
  priority: string;
  breachedAt: string;
}

interface SLACriticalEvent {
  ticketId: string;
  subject: string;
  priority: string;
  minutesLeft: number;
}

interface SLAWarningEvent {
  ticketId: string;
  subject: string;
  priority: string;
  minutesLeft: number;
}

interface SLANoticeEvent {
  ticketId: string;
  subject: string;
  minutesLeft: number;
}

interface UseSLASocketReturn {
  breachedTickets: SLABreachedEvent[];
  criticalTickets: SLACriticalEvent[];
  warningTickets: SLAWarningEvent[];
  breachedCount: number;
  criticalCount: number;
  warningCount: number;
  clearBreached: (ticketId: string) => void;
  clearCritical: (ticketId: string) => void;
  clearWarning: (ticketId: string) => void;
  clearAllBreached: () => void;
}

/**
 * Request browser notification permission
 */
function requestNotificationPermission(): void {
  if ('Notification' in window && Notification.permission === 'default') {
    Notification.requestPermission();
  }
}

/**
 * Show browser notification
 */
function showBrowserNotification(title: string, body: string): void {
  if ('Notification' in window && Notification.permission === 'granted') {
    new Notification(title, {
      body,
      icon: '/favicon.ico',
      tag: 'sla-alert',
      requireInteraction: true,
    });
  }
}

/**
 * Play alert sound
 */
function playAlertSound(): void {
  try {
    const audio = new Audio('/sounds/alert.mp3');
    audio.volume = 0.5;
    audio.play().catch(() => {
      // Ignore audio play errors (user hasn't interacted with page)
    });
  } catch {
    // Audio not supported
  }
}

/**
 * Hook for listening to SLA socket events
 */
export function useSLASocket(): UseSLASocketReturn {
  const { socket, isConnected } = useSocket();
  const [breachedTickets, setBreachedTickets] = useState<SLABreachedEvent[]>([]);
  const [criticalTickets, setCriticalTickets] = useState<SLACriticalEvent[]>([]);
  const [warningTickets, setWarningTickets] = useState<SLAWarningEvent[]>([]);

  // Request notification permission on mount
  useEffect(() => {
    requestNotificationPermission();
  }, []);

  // Handle SLA breached event - urgent with sound
  const handleBreached = useCallback((event: SLABreachedEvent) => {
    // Add to breached list (avoid duplicates)
    setBreachedTickets((prev) => {
      if (prev.some((t) => t.ticketId === event.ticketId)) return prev;
      return [...prev, event];
    });

    // Play alert sound
    playAlertSound();

    // Show urgent red toast
    toast.error(
      `🚨 SLA BREACHED: Ticket #${event.ticketId.slice(-6)} — ${event.subject}`,
      {
        duration: 15000,
        style: {
          background: '#DC2626',
          color: 'white',
          fontWeight: 'bold',
        },
      }
    );

    // Show browser notification
    showBrowserNotification(
      '🚨 SLA BREACHED',
      `Ticket #${event.ticketId.slice(-6)}: ${event.subject}`
    );
  }, []);

  // Handle SLA critical event - persistent amber banner
  const handleCritical = useCallback((event: SLACriticalEvent) => {
    // Update or add to critical list
    setCriticalTickets((prev) => {
      const existing = prev.findIndex((t) => t.ticketId === event.ticketId);
      if (existing >= 0) {
        const updated = [...prev];
        updated[existing] = event;
        return updated;
      }
      return [...prev, event];
    });

    // Show persistent amber toast
    toast(
      `⏰ CRITICAL: ${event.minutesLeft}min left — Ticket #${event.ticketId.slice(-6)}`,
      {
        duration: 30000, // Persist longer
        style: {
          background: '#D97706',
          color: 'white',
          fontWeight: 'bold',
        },
      }
    );
  }, []);

  // Handle SLA warning event
  const handleWarning = useCallback((event: SLAWarningEvent) => {
    // Update or add to warning list
    setWarningTickets((prev) => {
      const existing = prev.findIndex((t) => t.ticketId === event.ticketId);
      if (existing >= 0) {
        const updated = [...prev];
        updated[existing] = event;
        return updated;
      }
      return [...prev, event];
    });

    // Show amber toast
    toast(
      `⚠️ SLA Warning: ${event.minutesLeft}min left — Ticket #${event.ticketId.slice(-6)}`,
      {
        duration: 6000,
        style: {
          background: '#F59E0B',
          color: 'white',
        },
      }
    );
  }, []);

  // Handle SLA notice event (just for counting)
  const handleNotice = useCallback((_event: SLANoticeEvent) => {
    // Notices are silent - just tracked for sidebar badge
  }, []);

  // Setup socket listeners
  useEffect(() => {
    if (!socket || !isConnected) return;

    socket.on('sla:breached', handleBreached);
    socket.on('sla:critical', handleCritical);
    socket.on('sla:warning', handleWarning);
    socket.on('sla:notice', handleNotice);

    return () => {
      socket.off('sla:breached', handleBreached);
      socket.off('sla:critical', handleCritical);
      socket.off('sla:warning', handleWarning);
      socket.off('sla:notice', handleNotice);
    };
  }, [socket, isConnected, handleBreached, handleCritical, handleWarning, handleNotice]);

  // Clear functions
  const clearBreached = useCallback((ticketId: string) => {
    setBreachedTickets((prev) => prev.filter((t) => t.ticketId !== ticketId));
  }, []);

  const clearCritical = useCallback((ticketId: string) => {
    setCriticalTickets((prev) => prev.filter((t) => t.ticketId !== ticketId));
  }, []);

  const clearWarning = useCallback((ticketId: string) => {
    setWarningTickets((prev) => prev.filter((t) => t.ticketId !== ticketId));
  }, []);

  const clearAllBreached = useCallback(() => {
    setBreachedTickets([]);
  }, []);

  return {
    breachedTickets,
    criticalTickets,
    warningTickets,
    breachedCount: breachedTickets.length,
    criticalCount: criticalTickets.length,
    warningCount: warningTickets.length,
    clearBreached,
    clearCritical,
    clearWarning,
    clearAllBreached,
  };
}

export default useSLASocket;
