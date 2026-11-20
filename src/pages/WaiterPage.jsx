import React, { useEffect, useState, useCallback } from 'react';
import { Link } from 'react-router-dom';
import toast from 'react-hot-toast';
import {
  Plus,
  BellRing,
  Check,
  CheckCheck,
  Utensils,
  Receipt,
  X,
  Minus,
  AlertTriangle,
} from 'lucide-react';
import { Layout } from '../components/Layout';
import { api } from '../api/client';
import { useSocket } from '../context/SocketContext';
import {
  CALL_TYPE_LABEL,
  formatCurrency,
  formatElapsed,
  formatOrderLocation,
  getElapsedMinutes,
  ORDER_STATUS_LABEL,
  TABLE_STATUS_LABEL,
} from '../utils/format';

export function WaiterPage() {
  const { socket, syncVersion } = useSocket();
  const [tables, setTables] = useState([]);
  const [orders, setOrders] = useState([]);
  const [calls, setCalls] = useState([]);
  const [categories, setCategories] = useState([]);
  const [menuItems, setMenuItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [nowMs, setNowMs] = useState(Date.now());

  // Manual order drawer state
  const [manualOpen, setManualOpen] = useState(false);
  const [selectedTableId, setSelectedTableId] = useState('');
  const [selectedCat, setSelectedCat] = useState('all');
  const [draftCart, setDraftCart] = useState({});
  const [submitting, setSubmitting] = useState(false);

  const fetchAll = useCallback(async () => {
    try {
      const [tbls, ords, cls, menu] = await Promise.all([
        api.listTables(),
        api.listOrders({ status: 'pending,accepted,preparing,ready,served' }),
        api.listCalls({ status: 'open,acknowledged' }),
        api.getMenu(),
      ]);
      setTables(tbls);
      setOrders(ords);
      setCalls(cls);
      setCategories(menu.categories);
      setMenuItems(menu.items.filter((m) => m.isAvailable));
      if (!selectedTableId && tbls.length > 0) {
        setSelectedTableId(tbls[0].id);
      }
    } catch (err) {
      toast.error(err.message);
    } finally {
      setLoading(false);
    }
  }, [selectedTableId]);

  useEffect(() => {
    fetchAll();
  }, [fetchAll, syncVersion]);

  useEffect(() => {
    const t = window.setInterval(() => setNowMs(Date.now()), 5000);
    return () => window.clearInterval(t);
  }, []);

  useEffect(() => {
    if (!socket) return;
    const onRefresh = () => fetchAll();
    socket.on('order:created', onRefresh);
    socket.on('order:updated', onRefresh);
    socket.on('order:cancelled', onRefresh);
    socket.on('call:created', onRefresh);
    socket.on('call:acknowledged', onRefresh);
    socket.on('call:resolved', onRefresh);
    socket.on('table:statusChanged', onRefresh);
    socket.on('menu:itemAvailabilityChanged', onRefresh);
    return () => {
      socket.off('order:created', onRefresh);
      socket.off('order:updated', onRefresh);
      socket.off('order:cancelled', onRefresh);
      socket.off('call:created', onRefresh);
      socket.off('call:acknowledged', onRefresh);
      socket.off('call:resolved', onRefresh);
      socket.off('table:statusChanged', onRefresh);
      socket.off('menu:itemAvailabilityChanged', onRefresh);
    };
  }, [socket, fetchAll]);

  const handleMarkServed = async (order) => {
    try {
      await api.updateOrderStatus(order.id, 'served');
      toast.success(`Marked ${order.orderNumber} (${formatOrderLocation(order)}) as Served`);
      fetchAll();
    } catch (err) {
      toast.error(err.message);
    }
  };

  const handleAckCall = async (id) => {
    try {
      await api.acknowledgeCall(id);
      toast.success('Call acknowledged');
      fetchAll();
    } catch (err) {
      toast.error(err.message);
    }
  };

  const handleResolveCall = async (id) => {
    try {
      await api.resolveCall(id);
      toast.success('Call resolved');
      fetchAll();
    } catch (err) {
      toast.error(err.message);
    }
  };

  const adjustDraft = (item, delta) => {
    setDraftCart((prev) => {
      const cur = prev[item.id];
      const nextQty = (cur?.qty || 0) + delta;
      if (nextQty <= 0) {
        const copy = { ...prev };
        delete copy[item.id];
        return copy;
      }
      return { ...prev, [item.id]: { item, qty: nextQty, notes: cur?.notes || '' } };
    });
  };

  const handleSubmitManualOrder = async () => {
    const entries = Object.values(draftCart);
    if (!selectedTableId || entries.length === 0) {
      toast.error('Select a table and add at least one dish.');
      return;
    }
    setSubmitting(true);
    try {
      const created = await api.createStaffOrder({
        tableId: selectedTableId,
        items: entries.map((e) => ({
          menuItemId: e.item.id,
          qty: e.qty,
          notes: e.notes || undefined,
        })),
      });
      toast.success(`Order ${created.orderNumber} sent to kitchen for Table ${created.tableNumber}`);
      setDraftCart({});
      setManualOpen(false);
      fetchAll();
    } catch (err) {
      toast.error(err.message);
    } finally {
      setSubmitting(false);
    }
  };

  const readyOrders = orders.filter((o) => o.status === 'ready');
  const inProgressOrders = orders.filter((o) =>
    ['pending', 'accepted', 'preparing'].includes(o.status)
  );
  const draftEntries = Object.values(draftCart);
  const draftSubtotal = draftEntries.reduce((s, e) => s + e.item.price * e.qty, 0);

  return (
    <Layout
      title="Waiter Floor View"
      subtitle="Respond to service calls, deliver ready plates, and ring in manual orders"
      actions={
        <button
          type="button"
          onClick={() => setManualOpen(true)}
          className="min-h-[40px] px-4 py-2 rounded-lg bg-teal-700 text-white text-xs font-semibold hover:bg-teal-800 inline-flex items-center gap-1.5 whitespace-nowrap"
        >
          <Plus className="w-4 h-4" />
          New Manual Order
        </button>
      }
    >
      {loading ? (
        <div className="h-64 rounded-xl bg-white border border-slate-200 animate-pulse" />
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
          {/* Left Column: Open Calls + Ready for Pickup */}
          <div className="lg:col-span-7 space-y-6">
            {/* Open Service Calls */}
            <section className="bg-white border border-slate-200 rounded-xl overflow-hidden">
              <div className="px-5 py-4 border-b border-slate-200 flex items-center justify-between">
                <h2 className="text-sm font-bold text-slate-900 inline-flex items-center gap-2">
                  <BellRing className="w-4 h-4 text-red-600" />
                  Active Service Calls ({calls.length})
                </h2>
              </div>
              {calls.length === 0 ? (
                <div className="p-8 text-center text-xs text-slate-500">
                  No open table calls right now.
                </div>
              ) : (
                <div className="divide-y divide-slate-100">
                  {calls.map((c) => {
                    const overdue = getElapsedMinutes(c.createdAt, nowMs) >= 3;
                    return (
                      <div
                        key={c.id}
                        className={`p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3 ${
                          overdue ? 'bg-red-50/60' : ''
                        }`}
                      >
                        <div>
                          <div className="flex items-center gap-2 text-sm">
                            <span className="font-mono font-bold text-slate-900">
                              Table {c.tableNumber}
                            </span>
                            <span className="text-slate-400">·</span>
                            <span className="font-semibold text-teal-800">
                              {CALL_TYPE_LABEL[c.type]}
                            </span>
                            {overdue && (
                              <span className="inline-flex items-center gap-1 text-xs font-bold text-red-700">
                                <AlertTriangle className="w-3.5 h-3.5" />
                                Overdue
                              </span>
                            )}
                          </div>
                          <p className="text-xs text-slate-600 mt-0.5">{c.message}</p>
                          <p className="text-[11px] font-mono text-slate-500 mt-1 tabular-nums">
                            Open {formatElapsed(c.createdAt, nowMs)} · {c.status}
                          </p>
                        </div>
                        <div className="flex items-center gap-2 shrink-0">
                          {c.status === 'open' && (
                            <button
                              type="button"
                              onClick={() => handleAckCall(c.id)}
                              className="min-h-[42px] px-3.5 py-2 rounded-lg border border-slate-300 bg-white text-xs font-semibold text-slate-800 hover:bg-slate-50 inline-flex items-center gap-1.5"
                            >
                              <Check className="w-3.5 h-3.5" />
                              Acknowledge
                            </button>
                          )}
                          <button
                            type="button"
                            onClick={() => handleResolveCall(c.id)}
                            className="min-h-[42px] px-3.5 py-2 rounded-lg bg-teal-700 text-white text-xs font-semibold hover:bg-teal-800 inline-flex items-center gap-1.5"
                          >
                            <CheckCheck className="w-3.5 h-3.5" />
                            Resolve
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </section>

            {/* Ready to Serve Orders */}
            <section className="bg-white border border-slate-200 rounded-xl overflow-hidden">
              <div className="px-5 py-4 border-b border-slate-200 flex items-center justify-between">
                <h2 className="text-sm font-bold text-slate-900 inline-flex items-center gap-2">
                  <Utensils className="w-4 h-4 text-emerald-700" />
                  Ready at the Pass ({readyOrders.length})
                </h2>
              </div>
              {readyOrders.length === 0 ? (
                <div className="p-8 text-center text-xs text-slate-500">
                  No orders waiting for pickup. {inProgressOrders.length} currently in kitchen.
                </div>
              ) : (
                <div className="divide-y divide-slate-100">
                  {readyOrders.map((order) => (
                    <div
                      key={order.id}
                      className="p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-emerald-50/35"
                    >
                      <div>
                        <div className="flex items-center gap-2 text-sm">
                          <span className="font-mono font-bold text-slate-900">
                            {formatOrderLocation(order)}
                          </span>
                          <span className="text-slate-400">·</span>
                          <span className="font-mono text-xs text-slate-500">{order.orderNumber}</span>
                        </div>
                        <p className="text-xs text-slate-700 mt-1">
                          {order.items.map((i) => `${i.qty}× ${i.name}`).join(', ')}
                        </p>
                      </div>
                      <button
                        type="button"
                        onClick={() => handleMarkServed(order)}
                        className="min-h-[42px] px-4 py-2 rounded-lg bg-emerald-700 text-white text-xs font-semibold hover:bg-emerald-800 whitespace-nowrap"
                      >
                        Mark Served
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </section>

            {/* In-Kitchen Orders */}
            <section className="bg-white border border-slate-200 rounded-xl overflow-hidden">
              <div className="px-5 py-4 border-b border-slate-200">
                <h2 className="text-sm font-bold text-slate-900">
                  In Kitchen ({inProgressOrders.length})
                </h2>
              </div>
              {inProgressOrders.length === 0 ? (
                <div className="p-6 text-center text-xs text-slate-500">No orders in kitchen.</div>
              ) : (
                <div className="divide-y divide-slate-100">
                  {inProgressOrders.map((order) => (
                    <div key={order.id} className="p-4 flex items-center justify-between gap-3 text-xs">
                      <div className="min-w-0">
                        <p className="font-semibold text-slate-900">
                          {formatOrderLocation(order)} · <span className="font-mono">{order.orderNumber}</span>
                        </p>
                        <p className="text-slate-600 truncate mt-0.5">
                          {order.items.map((i) => `${i.qty}× ${i.name}`).join(', ')}
                        </p>
                      </div>
                      <div className="text-right shrink-0">
                        <span className="font-semibold text-amber-700 block">
                          {ORDER_STATUS_LABEL[order.status]}
                        </span>
                        <span className="font-mono text-slate-500 tabular-nums">
                          {formatElapsed(order.createdAt, nowMs)}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </section>
          </div>

          {/* Right Column: Table Status Grid */}
          <section className="lg:col-span-5 bg-white border border-slate-200 rounded-xl p-5 space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-bold text-slate-900">Dining Room Tables</h2>
              <Link to="/billing" className="text-xs font-semibold text-teal-700 hover:underline">
                Open Billing
              </Link>
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-2 gap-3">
              {tables.map((t) => (
                <div
                  key={t.id}
                  className={`border rounded-xl p-3.5 flex flex-col justify-between gap-2 ${
                    t.status === 'occupied'
                      ? 'border-teal-500 bg-teal-50/40'
                      : t.status === 'reserved'
                        ? 'border-amber-300 bg-amber-50/40'
                        : 'border-slate-200 bg-white'
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-bold font-mono text-slate-900">T{t.number}</span>
                    <span className="text-[11px] font-semibold text-slate-600">
                      {TABLE_STATUS_LABEL[t.status]}
                    </span>
                  </div>
                  <p className="text-[11px] text-slate-500 truncate">{t.section}</p>
                  <div className="flex items-center justify-between pt-2 border-t border-slate-200/60">
                    <button
                      type="button"
                      onClick={() => {
                        setSelectedTableId(t.id);
                        setManualOpen(true);
                      }}
                      className="text-[11px] font-semibold text-teal-800 hover:underline"
                    >
                      + Order
                    </button>
                    {(t.openOrderCount || 0) > 0 && (
                      <Link
                        to={`/billing?tableId=${t.id}`}
                        className="text-[11px] font-mono font-semibold text-slate-900 inline-flex items-center gap-1 hover:text-teal-800"
                      >
                        <Receipt className="w-3 h-3" />
                        {formatCurrency(t.openTotal || 0)}
                      </Link>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </section>
        </div>
      )}

      {/* Manual Order Modal */}
      {manualOpen && (
        <div
          className="fixed inset-0 z-50 bg-slate-950/50 flex items-center justify-center p-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby="manual-order-title"
        >
          <div className="bg-white border border-slate-200 rounded-xl w-full max-w-3xl max-h-[90vh] flex flex-col overflow-hidden">
            <div className="px-6 py-4 border-b border-slate-200 flex items-center justify-between">
              <h2 id="manual-order-title" className="text-base font-bold text-slate-900">
                Create Manual Table Order
              </h2>
              <button
                type="button"
                onClick={() => setManualOpen(false)}
                aria-label="Close manual order modal"
                className="p-2 rounded-lg text-slate-500 hover:bg-slate-100"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="p-6 overflow-y-auto grid grid-cols-1 md:grid-cols-12 gap-6">
              <div className="md:col-span-7 space-y-4">
                <div>
                  <label htmlFor="manual-table" className="block text-xs font-medium text-slate-700 mb-1">
                    Select Table
                  </label>
                  <select
                    id="manual-table"
                    value={selectedTableId}
                    onChange={(e) => setSelectedTableId(e.target.value)}
                    className="w-full px-3 py-2.5 rounded-lg border border-slate-300 text-sm bg-white"
                  >
                    {tables.map((t) => (
                      <option key={t.id} value={t.id}>
                        Table {t.number} — {t.name} ({TABLE_STATUS_LABEL[t.status]})
                      </option>
                    ))}
                  </select>
                </div>

                <div className="flex gap-1.5 overflow-x-auto pb-1">
                  <button
                    type="button"
                    onClick={() => setSelectedCat('all')}
                    className={`px-3 py-1.5 rounded-lg text-xs font-semibold whitespace-nowrap ${
                      selectedCat === 'all' ? 'bg-slate-900 text-white' : 'bg-slate-100 text-slate-700'
                    }`}
                  >
                    All
                  </button>
                  {categories.map((c) => (
                    <button
                      key={c.id}
                      type="button"
                      onClick={() => setSelectedCat(c.id)}
                      className={`px-3 py-1.5 rounded-lg text-xs font-semibold whitespace-nowrap ${
                        selectedCat === c.id ? 'bg-slate-900 text-white' : 'bg-slate-100 text-slate-700'
                      }`}
                    >
                      {c.name}
                    </button>
                  ))}
                </div>

                <div className="divide-y divide-slate-100 border border-slate-200 rounded-lg max-h-80 overflow-y-auto">
                  {menuItems
                    .filter((m) => selectedCat === 'all' || m.categoryId === selectedCat)
                    .map((item) => {
                      const inDraft = draftCart[item.id]?.qty || 0;
                      return (
                        <div
                          key={item.id}
                          className="p-3 flex items-center justify-between gap-2 text-xs"
                        >
                          <div className="min-w-0">
                            <p className="font-semibold text-slate-900 truncate">{item.name}</p>
                            <p className="font-mono text-slate-500">{formatCurrency(item.price)}</p>
                          </div>
                          <div className="inline-flex items-center gap-1.5 shrink-0">
                            {inDraft > 0 && (
                              <>
                                <button
                                  type="button"
                                  onClick={() => adjustDraft(item, -1)}
                                  aria-label={`Remove one ${item.name}`}
                                  className="w-8 h-8 rounded border border-slate-200 flex items-center justify-center hover:bg-slate-100"
                                >
                                  <Minus className="w-3.5 h-3.5" />
                                </button>
                                <span className="w-6 text-center font-mono font-bold">{inDraft}</span>
                              </>
                            )}
                            <button
                              type="button"
                              onClick={() => adjustDraft(item, 1)}
                              aria-label={`Add one ${item.name}`}
                              className="w-8 h-8 rounded bg-teal-700 text-white flex items-center justify-center hover:bg-teal-800"
                            >
                              <Plus className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        </div>
                      );
                    })}
                </div>
              </div>

              <div className="md:col-span-5 flex flex-col justify-between border border-slate-200 rounded-xl p-4 bg-slate-50">
                <div>
                  <h3 className="text-sm font-bold text-slate-900 mb-3">Order Ticket</h3>
                  {draftEntries.length === 0 ? (
                    <p className="text-xs text-slate-500">Add dishes from the left list.</p>
                  ) : (
                    <div className="space-y-3 max-h-72 overflow-y-auto">
                      {draftEntries.map(({ item, qty, notes }) => (
                        <div key={item.id} className="space-y-1">
                          <div className="flex justify-between text-xs font-semibold text-slate-900">
                            <span>
                              {qty}× {item.name}
                            </span>
                            <span className="font-mono">{formatCurrency(item.price * qty)}</span>
                          </div>
                          <input
                            type="text"
                            value={notes}
                            onChange={(e) =>
                              setDraftCart((prev) => ({
                                ...prev,
                                [item.id]: { ...prev[item.id], notes: e.target.value },
                              }))
                            }
                            placeholder="Kitchen note..."
                            className="w-full px-2.5 py-1 rounded border border-slate-200 bg-white text-[11px]"
                          />
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                <div className="pt-4 mt-4 border-t border-slate-200 space-y-3">
                  <div className="flex justify-between text-sm font-bold text-slate-900">
                    <span>Subtotal</span>
                    <span className="font-mono tabular-nums">{formatCurrency(draftSubtotal)}</span>
                  </div>
                  <button
                    type="button"
                    disabled={submitting || draftEntries.length === 0}
                    onClick={handleSubmitManualOrder}
                    className="w-full min-h-[44px] py-2.5 px-4 rounded-lg bg-teal-700 text-white text-xs font-semibold hover:bg-teal-800 disabled:opacity-50"
                  >
                    {submitting ? 'Sending Order...' : 'Send Order to Kitchen'}
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </Layout>
  );
}
