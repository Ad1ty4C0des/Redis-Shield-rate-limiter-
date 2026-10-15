import { useState, useEffect, useCallback } from 'react';

function getWebSocketUrl() {
  if (import.meta.env.VITE_WS_URL) {
    return import.meta.env.VITE_WS_URL;
  }
  if (import.meta.env.VITE_API_URL) {
    return import.meta.env.VITE_API_URL.replace(/^http/, 'ws');
  }
  if (typeof window !== 'undefined') {
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    if (window.location.port === '5173') {
      return 'ws://localhost:3000';
    }
    return `${protocol}//${window.location.host}`;
  }
  return 'ws://localhost:3000';
}

const WS_URL = getWebSocketUrl();

export function useWebSocket() {
  const [isConnected, setIsConnected] = useState(false);
  const [events, setEvents] = useState([]);

  useEffect(() => {
    let ws;
    let reconnectTimer;
    let isUnmounted = false;

    function connect() {
      if (isUnmounted) return;
      ws = new WebSocket(WS_URL);

      ws.onopen = () => {
        console.log('✅ Connected to Rate Limiter WebSocket');
        setIsConnected(true);
      };

      ws.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);

          if (data.type === 'BLOCKED') {
            setEvents((prev) => [data, ...prev.slice(0, 49)]);
          }
        } catch (err) {
          console.error('Failed to parse WS message:', err);
        }
      };

      ws.onclose = () => {
        if (isUnmounted) return;
        console.log('📡 WS disconnected. Reconnecting in 3s...');
        setIsConnected(false);
        reconnectTimer = setTimeout(connect, 3000);
      };

      ws.onerror = (err) => {
        console.error('WS Error:', err);
        ws.close();
      };
    }

    connect();

    return () => {
      isUnmounted = true;
      clearTimeout(reconnectTimer);
      if (ws) ws.close();
    };
  }, []);

  const clearEvents = useCallback(() => {
    setEvents([]);
  }, []);

  return { isConnected, events, clearEvents };
}
