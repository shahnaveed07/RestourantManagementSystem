import React, { useEffect, useState, useCallback } from 'react';
import { Link } from 'react-router-dom';
import toast from 'react-hot-toast';
import { Clock, Search, XCircle, ArrowRight } from 'lucide-react';
import { Layout } from '../components/Layout';
import { api } from '../api/client';
import { useSocket } from '../context/SocketContext';
import { formatCurrency, formatElapsed, formatOrderLocation } from '../utils/format';

const COLUMNS = [
  {
    key: 'pending',
    label: 'Pending',
    statuses: ['pending', 'accepted'],
    nextStatus: 'preparing',
    nextLabel: 'Start Preparing',
  },
  {
    key: 'preparing',
    label: 'Preparing',
    statuses: ['preparing'],
    nextStatus: 'ready',
    nextLabel: 'Mark Ready',
  },
  {
    key: 'ready',
    label: 'Ready for Pickup',
    statuses: ['ready'],
    nextStatus: 'served',
    nextLabel: 'Mark Served',
  },
  {
    key: 'served',
    label: 'Served (Open Tab)',
    statuses: ['served'],
  },
];

export function LiveOrdersPage() {
  const { socket, syncVersion } = useSocket();
  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [activeColumn, setActiveColumn] = useState('pending');
  const [busyId, setBusyId] = useState(null);
  const [nowMs, setNowMs] = useState(Date.now());

  const fetchOrders = useCallback(async () => {
    try {
      const list = await api.listOrders({ status: 'pending,accepted,preparing,ready,served' });
      setOrders(list);
    } catch (err) {
      toast.error(err.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchOrders();
  }, [fetchOrders, syncVersion]);

  useEffect(() => {
    const interval = window.setInterval(() => setNowMs(Date.now()), 5000);
    return () => window.clearInterval(interval);
  }, []);

  useEffect(() => {
    if (!socket) return;

    const onCreated = (order) => {
      setOrders((prev) => (prev.some((o) => o.id === order.id) ? prev : [order, ...prev]));
    };

    const onUpdated = (order) => {
      setOrders((prev) => {
        if (order.status === 'paid' || order.status === 'cancelled') {
          return prev.filter((o) => o.id !== order.id);
        }
        const exists = prev.some((o) => o.id === order.id);
        return exists ? prev.map((o) => (o.id === order.id ? order : o)) : [order, ...prev];
      });
    };

    const onCancelled = (order) => {
      setOrders((prev) => prev.filter((o) => o.id !== order.id));
    };

    socket.on('order:created', onCreated);
    socket.on('order:updated', onUpdated);
    socket.on('order:cancelled', onCancelled);

    return () => {
      socket.off('order:created', onCreated);
      socket.off('order:updated', onUpdated);
      socket.off('order:cancelled', onCancelled);
    };
  }, [socket]);

  const handleAdvance = async (orderId, nextStatus) => {
    setBusyId(orderId);
    try {
      const updated = await api.updateOrderStatus(orderId, nextStatus);
      setOrders((prev) =>
        nextStatus === 'cancelled' || nextStatus === 'paid'
          ? prev.filter((o) => o.id !== orderId)
          : prev.map((o) => (o.id === orderId ? updated : o))
      );
      toast.success(`Order ${updated.orderNumber} moved to ${nextStatus}`);
    } catch (err) {
      toast.error(err.message);
    } finally {
      setBusyId(null);
    }
  };

  const filtered = orders.filter((o) => {
    const q = search.trim().toLowerCase();
    if (!q) return true;
    return (
      o.orderNumber.toLowerCase().includes(q) ||
      `table ${o.tableNumber}`.includes(q) ||
      o.items.some((i) => i.name.toLowerCase().includes(q))
    );
  });

  return (
    <Layout
      title="Live Orders Board"
      subtitle="Real-time Kanban progression across Pending, Preparing, Ready, and Served"
      actions={
        <div className="relative hidden sm:block w-60">
          <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Filter table, order, dish..."
            aria-label="Filter live orders"
            className="w-full min-h-[44px] pl-9 pr-3 py-2 rounded-lg border border-slate-200 bg-white text-base sm:text-xs text-slate-900 focus:outline-none focus:ring-2 focus:ring-teal-600"
          />
        </div>
      }
    >
      {/* Mobile search bar */}
      <div className="sm:hidden mb-4">
        <div className="relative">
          <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Filter table, order, dish..."
            aria-label="Filter live orders mobile"
            className="w-full min-h-[44px] pl-9 pr-3 py-2 rounded-lg border border-slate-200 bg-white text-base text-slate-900 focus:outline-none focus:ring-2 focus:ring-teal-600"
          />
        </div>
      </div>

      {/* Mobile & Tablet (< lg) Column Tab Switcher */}
      <div className="lg:hidden mb-4 flex items-center gap-1.5 overflow-x-auto no-scrollbar pb-1" role="tablist" aria-label="Order stage columns">
        {COLUMNS.map((col) => {
          const count = filtered.filter((o) => col.statuses.includes(o.status)).length;
          const isSelected = activeColumn === col.key;
          return (
            <button
              key={col.key}
              type="button"
              role="tab"
              aria-selected={isSelected}
              onClick={() => setActiveColumn(col.key)}
              className={`min-h-[44px] px-3.5 py-2 rounded-lg text-xs font-semibold whitespace-nowrap inline-flex items-center gap-2 transition-colors ${
                isSelected
                  ? 'bg-slate-900 text-white'
                  : 'bg-white border border-slate-200 text-slate-700'
              }`}
            >
              <span>{col.key === 'ready' ? 'Ready' : col.key === 'served' ? 'Served' : col.label}</span>
              <span
                className={`px-1.5 py-0.5 rounded font-mono text-[11px] tabular-nums ${
                  isSelected ? 'bg-white/20 text-white' : 'bg-slate-100 text-slate-700'
                }`}
              >
                {count}
              </span>
            </button>
          );
        })}
      </div>

      {loading ? (
        <div className="grid grid-cols-1 lg:grid-cols-4 gap-5">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="h-96 rounded-xl bg-white border border-slate-200 animate-pulse" />
          ))}
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-4 gap-5 items-start">
          {COLUMNS.map((col) => {
            const colOrders = filtered
              .filter((o) => col.statuses.includes(o.status))
              .sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());

            return (
              <section
                key={col.key}
                className={`bg-slate-100/80 border border-slate-200 rounded-xl p-3.5 space-y-3 ${
                  activeColumn === col.key ? 'block' : 'hidden lg:block'
                }`}
              >
                <div className="flex items-center justify-between px-1">
                  <h2 className="text-sm font-bold text-slate-900">{col.label}</h2>
                  <span className="text-xs font-mono font-semibold text-slate-600 tabular-nums">
                    {colOrders.length}
                  </span>
                </div>

                {colOrders.length === 0 ? (
                  <div className="bg-white/70 border border-dashed border-slate-200 rounded-lg p-6 text-center text-xs text-slate-400">
                    No orders in {col.label.toLowerCase()}
                  </div>
                ) : (
                  <div className="space-y-3">
                    {colOrders.map((order) => {
                      const mins = (nowMs - new Date(order.createdAt).getTime()) / 60000;
                      const late = mins >= 15 && col.key !== 'served';

                      return (
                        <article
                          key={order.id}
                          className={`bg-white border rounded-xl p-4 space-y-3 ${
                            late ? 'border-amber-400' : 'border-slate-200'
                          }`}
                        >
                          <div className="flex items-start justify-between gap-2">
                            <div>
                              <h3 className="text-sm font-bold text-slate-900">
                                {formatOrderLocation(order)}
                              </h3>
                              <p className="text-[11px] text-slate-500 font-mono">
                                {order.orderNumber} ·{' '}
                                {order.source === 'guest_qr'
                                  ? 'QR'
                                  : order.source === 'customer_web'
                                    ? 'Online'
                                    : 'Staff'}
                              </p>
                            </div>
                            <div className="text-right">
                              <span
                                className={`inline-flex items-center gap-1 text-xs font-mono font-semibold tabular-nums ${
                                  late ? 'text-amber-700' : 'text-slate-600'
                                }`}
                              >
                                <Clock className="w-3 h-3" />
                                {formatElapsed(order.createdAt, nowMs)}
                              </span>
                              <span className="block text-xs font-mono text-slate-500 tabular-nums">
                                {formatCurrency(order.total)}
                              </span>
                            </div>
                          </div>

                          <ul className="space-y-1.5 pt-2 border-t border-slate-100 text-xs">
                            {order.items.map((item, idx) => (
                              <li key={idx} className="flex items-start justify-between gap-2">
                                <div className="min-w-0">
                                  <span className="font-mono font-semibold text-slate-900 mr-1.5">
                                    {item.qty}×
                                  </span>
                                  <span className="text-slate-800">{item.name}</span>
                                  {item.notes && (
                                    <p className="text-[11px] text-amber-800 mt-0.5">
                                      Note: {item.notes}
                                    </p>
                                  )}
                                </div>
                                <span className="text-[11px] text-slate-400 capitalize shrink-0">
                                  {item.status}
                                </span>
                              </li>
                            ))}
                          </ul>

                          <div className="pt-2 border-t border-slate-100 flex items-center gap-2">
                            {col.nextStatus ? (
                              <button
                                type="button"
                                disabled={busyId === order.id}
                                onClick={() => handleAdvance(order.id, col.nextStatus)}
                                className="flex-1 min-h-[44px] py-2 px-3 rounded-lg bg-teal-700 text-white text-xs font-semibold hover:bg-teal-800 disabled:opacity-60 transition-colors"
                              >
                                {col.nextLabel}
                              </button>
                            ) : (
                              <Link
                                to={`/billing?tableId=${order.tableId}`}
                                className="flex-1 min-h-[44px] py-2 px-3 rounded-lg bg-slate-900 text-white text-xs font-semibold hover:bg-slate-800 inline-flex items-center justify-center gap-1"
                              >
                                Settle Bill
                                <ArrowRight className="w-3.5 h-3.5" />
                              </Link>
                            )}

                            {(col.key === 'pending' || col.key === 'preparing') && (
                              <button
                                type="button"
                                disabled={busyId === order.id}
                                onClick={() => handleAdvance(order.id, 'cancelled')}
                                aria-label={`Cancel order ${order.orderNumber}`}
                                title="Cancel order"
                                className="min-w-[44px] min-h-[44px] p-2 rounded-lg border border-slate-200 text-slate-500 hover:text-red-700 hover:border-red-300 hover:bg-red-50 inline-flex items-center justify-center"
                              >
                                <XCircle className="w-4 h-4" />
                              </button>
                            )}
                          </div>
                        </article>
                      );
                    })}
                  </div>
                )}
              </section>
            );
          })}
        </div>
      )}
    </Layout>
  );
}
