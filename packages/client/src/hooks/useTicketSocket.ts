import { useEffect, useRef, useCallback } from 'react';
import { io, Socket } from 'socket.io-client';
import { useDispatch } from 'react-redux';
import { ticketsApi, updateTicketFromSocket } from '../api/ticketsApi';
import type {
  TicketClassifiedEvent,
  TicketDraftReadyEvent,
  TicketUpdatedEvent,
} from '../types/ticket';

interface UseTicketSocketOptions {
  companyId: string;
  enabled?: boolean;
  onTicketClassified?: (event: TicketClassifiedEvent) => void;
  onDraftReady?: (event: TicketDraftReadyEvent) => void;
  onTicketUpdated?: (event: TicketUpdatedEvent) => void;
}

interface UseTicketSocketReturn {
  isConnected: boolean;
  joinTicketRoom: (ticketId: string) => void;
  leaveTicketRoom: (ticketId: string) => void;
}

export function useTicketSocket({
  companyId,
  enabled = true,
  onTicketClassified,
  onDraftReady,
  onTicketUpdated,
}: UseTicketSocketOptions): UseTicketSocketReturn {
  const socketRef = useRef<Socket | null>(null);
  const isConnectedRef = useRef(false);
  const dispatch = useDispatch();

  // Initialize socket connection
  useEffect(() => {
    if (!enabled || !companyId) return;

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
      // Join company room for ticket updates
      socket.emit('join:company', { companyId });
    });

    socket.on('disconnect', () => {
      isConnectedRef.current = false;
    });

    // Handle ticket classified event
    socket.on('ticket:classified', (event: TicketClassifiedEvent) => {
      // Update RTK Query cache
      updateTicketFromSocket(
        dispatch as Parameters<typeof updateTicketFromSocket>[0],
        event
      );
      // Call user callback
      onTicketClassified?.(event);
    });

    // Handle draft ready event
    socket.on('ticket:draftReady', (event: TicketDraftReadyEvent) => {
      // Update RTK Query cache
      updateTicketFromSocket(
        dispatch as Parameters<typeof updateTicketFromSocket>[0],
        event
      );
      // Call user callback
      onDraftReady?.(event);
    });

    // Handle general ticket update event
    socket.on('ticket:updated', (event: TicketUpdatedEvent) => {
      // Update RTK Query cache
      updateTicketFromSocket(
        dispatch as Parameters<typeof updateTicketFromSocket>[0],
        event
      );
      // Call user callback
      onTicketUpdated?.(event);
    });

    // Handle errors
    socket.on('connect_error', (error) => {
      console.error('[TicketSocket] Connection error:', error.message);
    });

    // Cleanup on unmount
    return () => {
      socket.emit('leave:company', { companyId });
      socket.disconnect();
      socketRef.current = null;
      isConnectedRef.current = false;
    };
  }, [companyId, enabled, dispatch, onTicketClassified, onDraftReady, onTicketUpdated]);

  // Join a specific ticket room for detailed updates
  const joinTicketRoom = useCallback((ticketId: string) => {
    if (socketRef.current?.connected) {
      socketRef.current.emit('join:ticket', { ticketId });
    }
  }, []);

  // Leave a specific ticket room
  const leaveTicketRoom = useCallback((ticketId: string) => {
    if (socketRef.current?.connected) {
      socketRef.current.emit('leave:ticket', { ticketId });
    }
  }, []);

  return {
    isConnected: isConnectedRef.current,
    joinTicketRoom,
    leaveTicketRoom,
  };
}

export default useTicketSocket;
