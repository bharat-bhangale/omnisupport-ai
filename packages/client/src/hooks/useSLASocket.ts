import { useEffect, useState, useCallback } from 'react';
import { useSocket } from './useSocket';
import toast from 'react-hot-toast';

interface SLABreachedEvent {
  ticketId: string;
  subject: string;
  priority: string;
  breachedAt: string;
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
  warningTickets: SLAWarningEvent[];
  noticeCount: number;
  clearBreached: (ticketId: string) => void;
  clearWarning: (ticketId: string) => void;
  resetNoticeCount: () => void;
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
 * Hook for listening to SLA socket events
 */
export function useSLASocket(): UseSLASocketReturn {
  const { socket, isConnected } = useSocket();
  const [breachedTickets, setBreachedTickets] = useState<SLABreachedEvent[]>([]);
  const [warningTickets, setWarningTickets] = useState<SLAWarningEvent[]>([]);
  const [noticeCount, setNoticeCount] = useState(0);

  // Request notification permission on mount
  useEffect(() => {
    requestNotificationPermission();
  }, []);

  // Handle SLA breached event
  const handleBreached = useCallback((event: SLABreachedEvent) => {
    // Add to breached list (avoid duplicates)
    setBreachedTickets((prev) => {
      if (prev.some((t) => t.ticketId === event.ticketId)) return prev;
      return [...prev, event];
    });

    // Show urgent red toast
    toast.error(
      `🚨 SLA BREACHED: Ticket #${event.ticketId.slice(-6)} — ${event.subject}`,
      {
        duration: 10000,
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

  // Handle SLA notice event
  const handleNotice = useCallback((_event: SLANoticeEvent) => {
    // Just increment notice count for sidebar badge
    setNoticeCount((prev) => prev + 1);
  }, []);

  // Setup socket listeners
  useEffect(() => {
    if (!socket || !isConnected) return;

    socket.on('sla:breached', handleBreached);
    socket.on('sla:warning', handleWarning);
    socket.on('sla:notice', handleNotice);

    return () => {
      socket.off('sla:breached', handleBreached);
      socket.off('sla:warning', handleWarning);
      socket.off('sla:notice', handleNotice);
    };
  }, [socket, isConnected, handleBreached, handleWarning, handleNotice]);

  // Clear functions
  const clearBreached = useCallback((ticketId: string) => {
    setBreachedTickets((prev) => prev.filter((t) => t.ticketId !== ticketId));
  }, []);

  const clearWarning = useCallback((ticketId: string) => {
    setWarningTickets((prev) => prev.filter((t) => t.ticketId !== ticketId));
  }, []);

  const resetNoticeCount = useCallback(() => {
    setNoticeCount(0);
  }, []);

  return {
    breachedTickets,
    warningTickets,
    noticeCount,
    clearBreached,
    clearWarning,
    resetNoticeCount,
  };
}

export default useSLASocket;
