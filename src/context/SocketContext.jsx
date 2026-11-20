import React, { createContext, useContext, useEffect, useRef, useState, useCallback } from 'react';
import { io } from 'socket.io-client';
import toast from 'react-hot-toast';
import { useAuth } from './AuthContext';
import { api } from '../api/client';
import { playAlertChime, CALL_TYPE_LABEL } from '../utils/format';

const SocketContext = createContext(null);

export function SocketProvider({ children }) {
  const { user, token } = useAuth();
  const socketRef = useRef(null);
  const [socket, setSocket] = useState(null);
  const [connectionState, setConnectionState] = useState('offline');
  const [pendingOrdersCount, setPendingOrdersCount] = useState(0);
  const [openCallsCount, setOpenCallsCount] = useState(0);
  const [callFlashActive, setCallFlashActive] = useState(false);
  const [soundEnabled, setSoundEnabled] = useState(true);
  const [syncVersion, setSyncVersion] = useState(0);
  const soundEnabledRef = useRef(soundEnabled);
  soundEnabledRef.current = soundEnabled;

  const refreshBadges = useCallback(async () => {
    if (!user) {
      setPendingOrdersCount(0);
      setOpenCallsCount(0);
      return;
    }
    try {
      const orders = await api.listOrders({ status: 'pending,accepted,preparing,ready' });
      setPendingOrdersCount(orders.filter((o) => o.status === 'pending').length);
      if (user.role !== 'kitchen') {
        const calls = await api.listCalls({ status: 'open,acknowledged' });
        setOpenCallsCount(calls.length);
      }
    } catch {
      // ignore if user role does not have calls access
    }
  }, [user]);

  useEffect(() => {
    if (!user) {
      if (socketRef.current) {
        socketRef.current.disconnect();
        socketRef.current = null;
        setSocket(null);
      }
      setConnectionState('offline');
      return;
    }

    refreshBadges();

    const s = io(window.location.origin, {
      withCredentials: true,
      auth: { token: token || undefined, mode: 'staff' },
      reconnection: true,
      reconnectionAttempts: Infinity,
      reconnectionDelay: 1000,
      reconnectionDelayMax: 5000,
    });

    socketRef.current = s;
    setSocket(s);

    const handleConnect = () => {
      setConnectionState('live');
      if (token) {
        s.emit('staff:authenticate', token);
      }
      setSyncVersion((v) => v + 1);
      refreshBadges();
    };

    const handleDisconnect = () => {
      setConnectionState('offline');
    };

    const handleReconnectAttempt = () => {
      setConnectionState('reconnecting');
    };

    const handleOrderCreated = (order) => {
      setPendingOrdersCount((c) => c + 1);
      if (soundEnabledRef.current) playAlertChime('order');
      toast(`New order ${order.orderNumber} from Table ${order.tableNumber}`, {
        id: `ord-${order.id}`,
      });
    };

    const handleOrderChange = () => {
      refreshBadges();
    };

    const handleCallCreated = (call) => {
      if (user.role === 'kitchen') return;
      setOpenCallsCount((c) => c + 1);
      setCallFlashActive(true);
      window.setTimeout(() => setCallFlashActive(false), 3600);
      if (soundEnabledRef.current) playAlertChime('call');
      toast.error(`Table ${call.tableNumber}: ${CALL_TYPE_LABEL[call.type]}`, {
        id: `call-${call.id}`,
        duration: 5000,
      });
    };

    const handleCallChange = () => {
      refreshBadges();
    };

    s.on('connect', handleConnect);
    s.on('disconnect', handleDisconnect);
    s.io.on('reconnect_attempt', handleReconnectAttempt);
    s.on('order:created', handleOrderCreated);
    s.on('order:updated', handleOrderChange);
    s.on('order:cancelled', handleOrderChange);
    s.on('call:created', handleCallCreated);
    s.on('call:acknowledged', handleCallChange);
    s.on('call:resolved', handleCallChange);

    return () => {
      s.off('connect', handleConnect);
      s.off('disconnect', handleDisconnect);
      s.io.off('reconnect_attempt', handleReconnectAttempt);
      s.off('order:created', handleOrderCreated);
      s.off('order:updated', handleOrderChange);
      s.off('order:cancelled', handleOrderChange);
      s.off('call:created', handleCallCreated);
      s.off('call:acknowledged', handleCallChange);
      s.off('call:resolved', handleCallChange);
      s.disconnect();
      socketRef.current = null;
      setSocket(null);
    };
  }, [user, token, refreshBadges]);

  return (
    <SocketContext.Provider
      value={{
        socket,
        connectionState,
        pendingOrdersCount,
        openCallsCount,
        callFlashActive,
        soundEnabled,
        setSoundEnabled,
        syncVersion,
        refreshBadges,
      }}
    >
      {children}
    </SocketContext.Provider>
  );
}

export function useSocket() {
  const ctx = useContext(SocketContext);
  if (!ctx) throw new Error('useSocket must be used inside SocketProvider');
  return ctx;
}
