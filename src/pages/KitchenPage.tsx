import React, { useEffect, useState, useCallback } from 'react';
import toast from 'react-hot-toast';
import { Clock, Check, Flame, CheckCheck } from 'lucide-react';
import { Layout } from '../components/Layout';
import { api } from '../api/client';
import { useSocket } from '../context/SocketContext';
import { formatElapsed } from '../utils/format';
import type { Order, OrderItemStatus } from '../types';

export function KitchenPage() {
  const { socket, syncVersion } = useSocket();
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyKey, setBusyKey] = useState<string | null>(null);
  const [nowMs, setNowMs] = useState(Date.now());

  const fetchTickets = useCallback(async () => {
    try {
      const list = await api.listOrders({ status: 'pending,accepted,preparing' });
      setOrders(list.sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()));
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchTickets();
  }, [fetchTickets, syncVersion]);

  useEffect(() => {
    const timer = window.setInterval(() => setNowMs(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    if (!socket) return;

    const upsert = (order: Order) => {
      setOrders((prev) => {
        if (!['pending', 'accepted', 'preparing'].includes(order.status)) {
          return prev.filter((o) => o.id !== order.id);
        }
        const exists = prev.some((o) => o.id === order.id);
        const next = exists ? prev.map((o) => (o.id === order.id ? order : o)) : [...prev, order];
        return next.sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());
      });
    };

    const remove = (order: Order) => {
      setOrders((prev) => prev.filter((o) => o.id !== order.id));
    };

    socket.on('order:created', upsert);
    socket.on('order:updated', upsert);
    socket.on('order:cancelled', remove);

    return () => {
      socket.off('order:created', upsert);
      socket.off('order:updated', upsert);
      socket.off('order:cancelled', remove);
    };
  }, [socket]);

  const handleItemStatus = async (orderId: string, itemIdx: number, status: OrderItemStatus) => {
    const key = `${orderId}-${itemIdx}`;
    setBusyKey(key);
    try {
      const updated = await api.updateOrderItemStatus(orderId, itemIdx, status);
      setOrders((prev) =>
        ['pending', 'accepted', 'preparing'].includes(updated.status)
          ? prev.map((o) => (o.id === orderId ? updated : o))
          : prev.filter((o) => o.id !== orderId)
      );
      if (updated.status === 'ready') {
        toast.success(`${updated.orderNumber} (Table ${updated.tableNumber}) is READY for pickup`);
      }
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setBusyKey(null);
    }
  };

  const handleBumpOrderReady = async (order: Order) => {
    setBusyKey(order.id);
    try {
      await api.updateOrderStatus(order.id, 'ready');
      setOrders((prev) => prev.filter((o) => o.id !== order.id));
      toast.success(`Bumped ${order.orderNumber} to Ready`);
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setBusyKey(null);
    }
  };

  return (
    <Layout
      title="Kitchen Display System"
      subtitle={`${orders.length} active ticket${orders.length === 1 ? '' : 's'} on the line`}
      darkMode
    >
      {loading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-5">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="h-72 rounded-xl bg-slate-900 border border-slate-800 animate-pulse" />
          ))}
        </div>
      ) : orders.length === 0 ? (
        <div className="bg-slate-900 border border-slate-800 rounded-xl p-14 text-center">
          <p className="text-lg font-bold text-slate-100">All Caught Up</p>
          <p className="mt-1.5 text-sm text-slate-400">
            Incoming guest QR and staff orders will appear here immediately with prep timers.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-5 items-start">
          {orders.map((order) => {
            const mins = (nowMs - new Date(order.createdAt).getTime()) / 60000;
            const urgent = mins >= 15;
            const warning = mins >= 8 && mins < 15;

            return (
              <article
                key={order.id}
                className={`rounded-xl border overflow-hidden bg-slate-900 ${
                  urgent
                    ? 'border-red-500'
                    : warning
                      ? 'border-amber-500/80'
                      : 'border-slate-700'
                }`}
              >
                {/* Ticket Header */}
                <div
                  className={`px-5 py-3.5 border-b flex items-center justify-between gap-2 ${
                    urgent
                      ? 'bg-red-950/70 border-red-800'
                      : warning
                        ? 'bg-amber-950/50 border-amber-800/70'
                        : 'bg-slate-800/80 border-slate-700'
                  }`}
                >
                  <div>
                    <div className="flex items-center gap-2">
                      <h2 className="text-lg font-bold text-white font-mono">
                        Table {order.tableNumber}
                      </h2>
                      <span className="text-xs font-mono text-slate-300">{order.orderNumber}</span>
                    </div>
                    <p className="text-xs text-slate-400 capitalize">
                      {order.status} · {order.source === 'guest_qr' ? 'QR Order' : 'Staff Order'}
                    </p>
                  </div>

                  <div className="text-right">
                    <span
                      className={`inline-flex items-center gap-1.5 text-base font-mono font-bold tabular-nums ${
                        urgent ? 'text-red-300' : warning ? 'text-amber-300' : 'text-emerald-300'
                      }`}
                    >
                      <Clock className="w-4 h-4" />
                      {formatElapsed(order.createdAt, nowMs)}
                    </span>
                    {urgent && <span className="block text-[11px] font-semibold text-red-300">Overdue</span>}
                  </div>
                </div>

                {/* Per-item prep controls */}
                <ul className="divide-y divide-slate-800">
                  {order.items.map((item, idx) => {
                    const itemKey = `${order.id}-${idx}`;
                    const isReady = item.status === 'ready' || item.status === 'served';
                    const isPreparing = item.status === 'preparing';

                    return (
                      <li
                        key={idx}
                        className={`px-5 py-3.5 flex items-center justify-between gap-3 ${
                          isReady ? 'bg-emerald-950/25 opacity-65' : ''
                        }`}
                      >
                        <div className="min-w-0">
                          <div className="flex items-baseline gap-2">
                            <span className="font-mono text-base font-bold text-teal-300">
                              {item.qty}×
                            </span>
                            <span
                              className={`text-sm font-semibold ${
                                isReady ? 'line-through text-slate-400' : 'text-white'
                              }`}
                            >
                              {item.name}
                            </span>
                          </div>
                          {item.notes && (
                            <p className="mt-1 text-xs font-medium text-amber-300">
                              Note: {item.notes}
                            </p>
                          )}
                        </div>

                        <div className="flex items-center gap-1.5 shrink-0">
                          {item.status === 'pending' && (
                            <button
                              type="button"
                              disabled={busyKey === itemKey}
                              onClick={() => handleItemStatus(order.id, idx, 'preparing')}
                              className="min-h-[38px] px-3 py-1.5 rounded-lg bg-amber-600 text-white text-xs font-semibold hover:bg-amber-500 inline-flex items-center gap-1 whitespace-nowrap"
                            >
                              <Flame className="w-3.5 h-3.5" />
                              Cook
                            </button>
                          )}
                          {!isReady ? (
                            <button
                              type="button"
                              disabled={busyKey === itemKey}
                              onClick={() => handleItemStatus(order.id, idx, 'ready')}
                              aria-label={`Mark ${item.name} done`}
                              className={`min-h-[38px] px-3 py-1.5 rounded-lg text-xs font-semibold inline-flex items-center gap-1 whitespace-nowrap ${
                                isPreparing
                                  ? 'bg-emerald-600 text-white hover:bg-emerald-500'
                                  : 'bg-slate-800 border border-slate-700 text-slate-200 hover:bg-emerald-700 hover:border-emerald-600'
                              }`}
                            >
                              <Check className="w-3.5 h-3.5" />
                              Done
                            </button>
                          ) : (
                            <span className="text-xs font-semibold text-emerald-400 px-2">
                              Ready
                            </span>
                          )}
                        </div>
                      </li>
                    );
                  })}
                </ul>

                {/* Ticket Footer */}
                <div className="px-5 py-3 bg-slate-950/60 border-t border-slate-800">
                  <button
                    type="button"
                    disabled={busyKey === order.id}
                    onClick={() => handleBumpOrderReady(order)}
                    className="w-full min-h-[42px] py-2 px-4 rounded-lg bg-teal-600 text-white text-xs font-bold hover:bg-teal-500 inline-flex items-center justify-center gap-2 transition-colors"
                  >
                    <CheckCheck className="w-4 h-4" />
                    All Items Ready — Bump Ticket
                  </button>
                </div>
              </article>
            );
          })}
        </div>
      )}
    </Layout>
  );
}
