import { useEffect, useRef } from 'react';
import { io, Socket } from 'socket.io-client';
import { useDispatch } from 'react-redux';
import { kbApi, updateKBDocumentFromSocket } from '../api/kbApi';
import type { KBIndexProgressEvent, KBDocumentStatus } from '../types/kb';

interface UseKBSocketOptions {
  enabled?: boolean;
  onIndexProgress?: (event: KBIndexProgressEvent) => void;
}

interface UseKBSocketReturn {
  isConnected: boolean;
}

export function useKBSocket({
  enabled = true,
  onIndexProgress,
}: UseKBSocketOptions = {}): UseKBSocketReturn {
  const socketRef = useRef<Socket | null>(null);
  const isConnectedRef = useRef(false);
  const dispatch = useDispatch();

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
      socket.emit('join:kb');
    });

    socket.on('disconnect', () => {
      isConnectedRef.current = false;
    });

    socket.on('kb:indexProgress', (event: KBIndexProgressEvent) => {
      const updates: {
        status: KBDocumentStatus;
        errorMessage?: string;
        lastIndexed?: string;
      } = {
        status: event.status,
      };

      if (event.errorMessage) {
        updates.errorMessage = event.errorMessage;
      }

      if (event.status === 'indexed') {
        updates.lastIndexed = new Date().toISOString();
      }

      updateKBDocumentFromSocket(
        dispatch as Parameters<typeof updateKBDocumentFromSocket>[0],
        event.documentId,
        updates
      );

      // When indexing completes, invalidate to get accurate chunk count
      if (event.status === 'indexed' || event.status === 'error') {
        dispatch(
          kbApi.util.invalidateTags([
            { type: 'KnowledgeBase', id: event.documentId },
          ])
        );
      }

      onIndexProgress?.(event);
    });

    socket.on('connect_error', (error) => {
      console.error('[KBSocket] Connection error:', error.message);
    });

    return () => {
      socket.emit('leave:kb');
      socket.disconnect();
      socketRef.current = null;
      isConnectedRef.current = false;
    };
  }, [enabled, dispatch, onIndexProgress]);

  return {
    isConnected: isConnectedRef.current,
  };
}

export default useKBSocket;
