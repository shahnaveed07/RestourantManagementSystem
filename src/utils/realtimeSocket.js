/**
 * Lightweight native WebSocket client for Cloudflare Durable Object Hub (/ws).
 * Supports event pub/sub (.on / .off / .emit / .disconnect), exponential backoff
 * auto-reconnect, heartbeat pings, and automatic session refresh on auth close.
 */
export function createRealtimeSocket(options = {}) {
  const {
    mode = 'guest',
    qrToken = '',
    tableId = '',
    onBeforeReconnect = null,
    heartbeatMs = 25000,
    minBackoffMs = 1000,
    maxBackoffMs = 15000,
  } = options;

  const listeners = new Map();
  let ws = null;
  let manuallyClosed = false;
  let reconnectTimer = null;
  let heartbeatTimer = null;
  let attempt = 0;

  function notify(event, payload) {
    const handlers = listeners.get(event);
    if (!handlers || handlers.size === 0) return;
    for (const fn of Array.from(handlers)) {
      try {
        fn(payload);
      } catch (err) {
        console.error(`[RealtimeSocket] Listener error for "${event}":`, err);
      }
    }
  }

  function clearTimers() {
    if (reconnectTimer) {
      window.clearTimeout(reconnectTimer);
      reconnectTimer = null;
    }
    if (heartbeatTimer) {
      window.clearInterval(heartbeatTimer);
      heartbeatTimer = null;
    }
  }

  function buildUrl() {
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const url = new URL(`${protocol}//${window.location.host}/ws`);
    if (mode) url.searchParams.set('mode', mode);
    if (qrToken) url.searchParams.set('qrToken', qrToken);
    if (tableId) url.searchParams.set('tableId', tableId);
    return url.toString();
  }

  function startHeartbeat() {
    if (heartbeatTimer) window.clearInterval(heartbeatTimer);
    heartbeatTimer = window.setInterval(() => {
      if (ws && ws.readyState === WebSocket.OPEN) {
        try {
          ws.send(JSON.stringify({ event: 'ping', data: { ts: Date.now() } }));
        } catch {
          // ignore send errors; close handler will trigger reconnect
        }
      }
    }, heartbeatMs);
  }

  function scheduleReconnect() {
    if (manuallyClosed) return;
    attempt += 1;
    const delay = Math.min(maxBackoffMs, minBackoffMs * Math.pow(2, Math.min(attempt - 1, 4)));
    notify('reconnect_attempt', attempt);
    reconnectTimer = window.setTimeout(async () => {
      reconnectTimer = null;
      if (manuallyClosed) return;
      if (typeof onBeforeReconnect === 'function') {
        try {
          await onBeforeReconnect();
        } catch {
          // proceed with reconnect attempt anyway
        }
      }
      connect();
    }, delay);
  }

  function connect() {
    if (manuallyClosed) return;
    clearTimers();

    try {
      ws = new WebSocket(buildUrl());
    } catch {
      scheduleReconnect();
      return;
    }

    ws.onopen = () => {
      attempt = 0;
      startHeartbeat();
      notify('connect');
    };

    ws.onmessage = (evt) => {
      if (typeof evt.data !== 'string') return;
      try {
        const msg = JSON.parse(evt.data);
        if (msg && typeof msg.event === 'string') {
          if (msg.event === 'pong') return;
          notify(msg.event, msg.data);
        }
      } catch {
        // ignore malformed frames
      }
    };

    ws.onclose = () => {
      clearTimers();
      ws = null;
      notify('disconnect');
      if (!manuallyClosed) {
        scheduleReconnect();
      }
    };

    ws.onerror = () => {
      // Browser fires onclose immediately after onerror; let onclose manage reconnect
    };
  }

  connect();

  return {
    on(event, fn) {
      if (!listeners.has(event)) listeners.set(event, new Set());
      listeners.get(event).add(fn);
      return this;
    },
    off(event, fn) {
      const handlers = listeners.get(event);
      if (!handlers) return this;
      if (fn) {
        handlers.delete(fn);
      } else {
        handlers.clear();
      }
      return this;
    },
    emit(event, data) {
      if (ws && ws.readyState === WebSocket.OPEN) {
        try {
          ws.send(JSON.stringify({ event, data }));
        } catch {
          // ignore send errors on closing socket
        }
      }
      return this;
    },
    disconnect() {
      manuallyClosed = true;
      clearTimers();
      if (ws) {
        try {
          ws.close(1000, 'Client disconnected');
        } catch {
          // ignore close errors
        }
        ws = null;
      }
      listeners.clear();
    },
  };
}
