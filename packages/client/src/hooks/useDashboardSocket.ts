import { useEffect, useCallback, useRef } from 'react';
import { io, Socket } from 'socket.io-client';
import { useDispatch } from 'react-redux';
import { omnisupportApi } from '../api/omnisupportApi';

interface LiveCounts {
  activeCalls: number;
  openTickets: number;
  waitingEscalations: number;
}

interface ActivityEvent {
  id: string;
  type: string;
  description: string;
  category?: string;
  timestamp: string;
  sentiment?: string;
  priority?: string;
}

interface CallEvent {
  callId: string;
  phone: string;
  intent?: string;
  sentiment?: string;
  startedAt?: string;
  endedAt?: string;
}

export interface UseDashboardSocketOptions {
  onLiveCounts?: (counts: LiveCounts) => void;
  onActivityNew?: (activity: ActivityEvent) => void;
  onCallStarted?: (call: CallEvent) => void;
  onCallEnded?: (call: CallEvent) => void;
}

const SOCKET_URL = import.meta.env.VITE_SOCKET_URL || '';

export function useDashboardSocket(options: UseDashboardSocketOptions = {}) {
  const dispatch = useDispatch();
  const socketRef = useRef<Socket | null>(null);
  const optionsRef = useRef(options);

  // Keep options ref updated
  optionsRef.current = options;

  // Invalidate RTK Query caches
  const invalidateCaches = useCallback(() => {
    dispatch(omnisupportApi.util.invalidateTags(['Analytics', 'Calls', 'Tickets']));
  }, [dispatch]);

  useEffect(() => {
    // Get auth token from localStorage
    const token = localStorage.getItem('auth_token');
    const companyId = localStorage.getItem('company_id') || 'dev-company';
    const userId = localStorage.getItem('user_id') || 'dev-user';

    // Create socket connection
    const socket = io(SOCKET_URL, {
      path: '/socket.io',
      auth: {
        token,
        companyId,
        userId,
      },
      transports: ['websocket', 'polling'],
      reconnection: true,
      reconnectionAttempts: 5,
      reconnectionDelay: 1000,
    });

    socketRef.current = socket;

    // Connection handlers
    socket.on('connect', () => {
      console.log('[Dashboard Socket] Connected:', socket.id);
      // Join the company agents room for real-time updates
      socket.emit('join:agents');
    });

    socket.on('disconnect', (reason) => {
      console.log('[Dashboard Socket] Disconnected:', reason);
    });

    socket.on('connect_error', (error) => {
      console.error('[Dashboard Socket] Connection error:', error.message);
    });

    // Live counts update
    socket.on('analytics:liveCounts', (data: LiveCounts) => {
      console.log('[Dashboard Socket] Live counts:', data);
      optionsRef.current.onLiveCounts?.(data);
      invalidateCaches();
    });

    // New activity event
    socket.on('activity:new', (data: ActivityEvent) => {
      console.log('[Dashboard Socket] New activity:', data);
      optionsRef.current.onActivityNew?.(data);
    });

    // Call started
    socket.on('call:started', (data: CallEvent) => {
      console.log('[Dashboard Socket] Call started:', data);
      optionsRef.current.onCallStarted?.(data);
      invalidateCaches();
    });

    // Call ended
    socket.on('call:ended', (data: CallEvent) => {
      console.log('[Dashboard Socket] Call ended:', data);
      optionsRef.current.onCallEnded?.(data);
      invalidateCaches();
    });

    // Cleanup on unmount
    return () => {
      socket.emit('leave:agents');
      socket.disconnect();
      socketRef.current = null;
    };
  }, [invalidateCaches]);

  // Return socket instance for manual operations
  return {
    socket: socketRef.current,
    isConnected: socketRef.current?.connected ?? false,
  };
}

export default useDashboardSocket;
