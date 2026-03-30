import { useEffect, useRef, useCallback } from 'react';
import { io, Socket } from 'socket.io-client';
import { useDispatch } from 'react-redux';
import { omnisupportApi } from '../api/omnisupportApi';

// Event types
export interface CallStartedEvent {
  callId: string;
  callerPhone: string;
  intent?: string;
  sentiment?: string;
  language?: string;
  startedAt: string;
  customerName?: string;
  customerTier?: string;
}

export interface CallEndedEvent {
  callId: string;
  callerPhone: string;
  endedAt: string;
  duration: number;
  disposition: 'completed' | 'escalated' | 'dropped' | 'voicemail';
  qaScore?: number;
}

export interface TranscriptUpdateEvent {
  callId: string;
  turn: {
    role: 'user' | 'assistant' | 'tool';
    content: string;
    timestamp: string;
    toolName?: string;
    sentiment?: string;
  };
}

export interface SentimentUpdateEvent {
  callId: string;
  sentiment: 'positive' | 'neutral' | 'negative';
  confidence: number;
  timestamp: string;
}

export interface IntentDetectedEvent {
  callId: string;
  intent: string;
  confidence: number;
  timestamp: string;
}

export interface EscalationTriggeredEvent {
  callId: string;
  reason: string;
  priority: 'urgent' | 'high' | 'medium' | 'low';
  timestamp: string;
  customerName?: string;
  customerTier?: string;
}

export interface CallMetricsEvent {
  totalActiveCalls: number;
  averageCallDuration: number;
  aiResolutionRate: number;
  escalationRate: number;
}

export interface UseCallMonitorSocketOptions {
  enabled?: boolean;
  onCallStarted?: (event: CallStartedEvent) => void;
  onCallEnded?: (event: CallEndedEvent) => void;
  onTranscriptUpdate?: (event: TranscriptUpdateEvent) => void;
  onSentimentUpdate?: (event: SentimentUpdateEvent) => void;
  onIntentDetected?: (event: IntentDetectedEvent) => void;
  onEscalationTriggered?: (event: EscalationTriggeredEvent) => void;
  onMetricsUpdate?: (event: CallMetricsEvent) => void;
}

export interface UseCallMonitorSocketReturn {
  isConnected: boolean;
  subscribeToCall: (callId: string) => void;
  unsubscribeFromCall: (callId: string) => void;
  requestMetrics: () => void;
}

const SOCKET_URL = import.meta.env.VITE_SOCKET_URL || '';

export function useCallMonitorSocket({
  enabled = true,
  onCallStarted,
  onCallEnded,
  onTranscriptUpdate,
  onSentimentUpdate,
  onIntentDetected,
  onEscalationTriggered,
  onMetricsUpdate,
}: UseCallMonitorSocketOptions = {}): UseCallMonitorSocketReturn {
  const socketRef = useRef<Socket | null>(null);
  const isConnectedRef = useRef(false);
  const subscribedCallsRef = useRef<Set<string>>(new Set());
  const dispatch = useDispatch();

  // Keep callback refs updated
  const callbacksRef = useRef({
    onCallStarted,
    onCallEnded,
    onTranscriptUpdate,
    onSentimentUpdate,
    onIntentDetected,
    onEscalationTriggered,
    onMetricsUpdate,
  });

  callbacksRef.current = {
    onCallStarted,
    onCallEnded,
    onTranscriptUpdate,
    onSentimentUpdate,
    onIntentDetected,
    onEscalationTriggered,
    onMetricsUpdate,
  };

  // Invalidate RTK Query caches for call data
  const invalidateCallCaches = useCallback(() => {
    dispatch(omnisupportApi.util.invalidateTags(['Calls', 'Analytics']));
  }, [dispatch]);

  useEffect(() => {
    if (!enabled) return;

    const token = localStorage.getItem('auth_token');
    const companyId = localStorage.getItem('company_id') || 'dev-company';
    const userId = localStorage.getItem('user_id') || 'dev-user';

    const socket = io(SOCKET_URL, {
      path: '/socket.io',
      auth: {
        token,
        companyId,
        userId,
      },
      transports: ['websocket', 'polling'],
      reconnection: true,
      reconnectionAttempts: 10,
      reconnectionDelay: 1000,
    });

    socketRef.current = socket;

    // Connection handlers
    socket.on('connect', () => {
      isConnectedRef.current = true;
      console.log('[CallMonitorSocket] Connected:', socket.id);

      // Join calls room for real-time updates
      socket.emit('join:calls');

      // Re-subscribe to any previously subscribed calls
      subscribedCallsRef.current.forEach((callId) => {
        socket.emit('subscribe:call', { callId });
      });
    });

    socket.on('disconnect', (reason) => {
      isConnectedRef.current = false;
      console.log('[CallMonitorSocket] Disconnected:', reason);
    });

    socket.on('connect_error', (error) => {
      console.error('[CallMonitorSocket] Connection error:', error.message);
    });

    // Call lifecycle events
    socket.on('call:started', (data: CallStartedEvent) => {
      console.log('[CallMonitorSocket] Call started:', data.callId);
      callbacksRef.current.onCallStarted?.(data);
      invalidateCallCaches();
    });

    socket.on('call:ended', (data: CallEndedEvent) => {
      console.log('[CallMonitorSocket] Call ended:', data.callId);
      callbacksRef.current.onCallEnded?.(data);
      invalidateCallCaches();

      // Auto-unsubscribe from ended call
      subscribedCallsRef.current.delete(data.callId);
    });

    // Real-time transcript updates
    socket.on('call:transcript', (data: TranscriptUpdateEvent) => {
      callbacksRef.current.onTranscriptUpdate?.(data);
    });

    // Sentiment updates during call
    socket.on('call:sentiment', (data: SentimentUpdateEvent) => {
      callbacksRef.current.onSentimentUpdate?.(data);
    });

    // Intent detection
    socket.on('call:intent', (data: IntentDetectedEvent) => {
      callbacksRef.current.onIntentDetected?.(data);
    });

    // Escalation triggered
    socket.on('call:escalation', (data: EscalationTriggeredEvent) => {
      console.log('[CallMonitorSocket] Escalation triggered:', data.callId);
      callbacksRef.current.onEscalationTriggered?.(data);
      invalidateCallCaches();
    });

    // Aggregated metrics
    socket.on('calls:metrics', (data: CallMetricsEvent) => {
      callbacksRef.current.onMetricsUpdate?.(data);
    });

    // Cleanup on unmount
    return () => {
      socket.emit('leave:calls');
      subscribedCallsRef.current.forEach((callId) => {
        socket.emit('unsubscribe:call', { callId });
      });
      socket.disconnect();
      socketRef.current = null;
      isConnectedRef.current = false;
    };
  }, [enabled, invalidateCallCaches]);

  // Subscribe to a specific call for detailed updates
  const subscribeToCall = useCallback((callId: string) => {
    if (socketRef.current?.connected) {
      socketRef.current.emit('subscribe:call', { callId });
      subscribedCallsRef.current.add(callId);
      console.log('[CallMonitorSocket] Subscribed to call:', callId);
    }
  }, []);

  // Unsubscribe from a specific call
  const unsubscribeFromCall = useCallback((callId: string) => {
    if (socketRef.current?.connected) {
      socketRef.current.emit('unsubscribe:call', { callId });
      subscribedCallsRef.current.delete(callId);
      console.log('[CallMonitorSocket] Unsubscribed from call:', callId);
    }
  }, []);

  // Request current metrics
  const requestMetrics = useCallback(() => {
    if (socketRef.current?.connected) {
      socketRef.current.emit('request:callMetrics');
    }
  }, []);

  return {
    isConnected: isConnectedRef.current,
    subscribeToCall,
    unsubscribeFromCall,
    requestMetrics,
  };
}

export default useCallMonitorSocket;
