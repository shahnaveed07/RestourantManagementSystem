import React, { useEffect, useState, useCallback } from 'react';
import { useSearchParams } from 'react-router-dom';
import toast from 'react-hot-toast';
import { Printer, CheckCircle2, CreditCard, Banknote, Smartphone, Sparkles } from 'lucide-react';
import { Layout } from '../components/Layout';
import { api } from '../api/client';
import { useAuth } from '../context/AuthContext';
import { useSocket } from '../context/SocketContext';
import { formatCurrency, formatDateTime } from '../utils/format';
import { BrandLogo } from '../components/BrandLogo';

export function BillingPage() {
  const { config } = useAuth();
  const { socket, syncVersion } = useSocket();
  const [searchParams] = useSearchParams();
  const initialTableId = searchParams.get('tableId') || '';

  const [taxRate, setTaxRate] = useState(0.08);
  const [tabs, setTabs] = useState([]);
  const [selectedTableId, setSelectedTableId] = useState(initialTableId);
  const [discountPercent, setDiscountPercent] = useState('0');
  const [flatDiscount, setFlatDiscount] = useState('0');
  const [method, setMethod] = useState('card');
  const [nextTableStatus, setNextTableStatus] = useState('free');
  const [loading, setLoading] = useState(true);
  const [processing, setProcessing] = useState(false);

  const [lastReceipt, setLastReceipt] = useState(null);

  const fetchBilling = useCallback(async () => {
    try {
      const data = await api.getBillingTables();
      setTaxRate(data.taxRate);
      setTabs(data.tabs);
      if (data.tabs.length > 0) {
        setSelectedTableId((cur) => {
          if (cur && data.tabs.some((t) => t.table.id === cur)) return cur;
          if (initialTableId && data.tabs.some((t) => t.table.id === initialTableId)) {
            return initialTableId;
          }
          return data.tabs[0].table.id;
        });
      }
    } catch (err) {
      toast.error(err.message);
    } finally {
      setLoading(false);
    }
  }, [initialTableId]);

  useEffect(() => {
    fetchBilling();
  }, [fetchBilling, syncVersion]);

  useEffect(() => {
    if (!socket) return;
    const onRefresh = () => fetchBilling();
    socket.on('order:created', onRefresh);
    socket.on('order:updated', onRefresh);
    socket.on('table:statusChanged', onRefresh);
    return () => {
      socket.off('order:created', onRefresh);
      socket.off('order:updated', onRefresh);
      socket.off('table:statusChanged', onRefresh);
    };
  }, [socket, fetchBilling]);

  const activeTab = tabs.find((t) => t.table.id === selectedTableId) || null;

  const pct = Math.max(0, Math.min(100, Number(discountPercent) || 0));
  const flat = Math.max(0, Number(flatDiscount) || 0);
  const subtotal = activeTab?.subtotal || 0;
  const computedDiscount = Math.min(subtotal, Math.round(((subtotal * pct) / 100 + flat) * 100) / 100);
  const taxable = Math.max(0, subtotal - computedDiscount);
  const computedTax = Math.round(taxable * taxRate * 100) / 100;
  const computedTotal = Math.round((taxable + computedTax) * 100) / 100;

  const handleSettle = async () => {
    if (!activeTab || activeTab.orders.length === 0) return;
    setProcessing(true);
    try {
      const res = await api.recordPayment(activeTab.table.id, {
        method,
        discountPercent: pct,
        flatDiscount: flat,
        nextTableStatus,
      });
      setLastReceipt({
        payment: res.payment,
        tableName: activeTab.table.name,
        orders: res.settledOrders,
      });
      setDiscountPercent('0');
      setFlatDiscount('0');
      toast.success(`Table ${activeTab.table.number} settled (${formatCurrency(res.payment.amount)})`);
      fetchBilling();
    } catch (err) {
      toast.error(err.message);
    } finally {
      setProcessing(false);
    }
  };

  return (
    <Layout
      title="Table Billing & Receipts"
      subtitle="Consolidate all open orders on a table, apply discounts, record payment, and print receipts"
    >
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* Open Table Tabs Sidebar */}
        <section className="lg:col-span-4 bg-white border border-slate-200 rounded-xl overflow-hidden no-print">
          <div className="px-5 py-4 border-b border-slate-200">
            <h2 className="text-sm font-bold text-slate-900">Open Table Tabs ({tabs.length})</h2>
          </div>

          {loading ? (
            <div className="p-6 text-xs text-slate-500">Loading active tabs...</div>
          ) : tabs.length === 0 ? (
            <div className="p-8 text-center text-xs text-slate-500">
              No tables currently have unsettled orders.
            </div>
          ) : (
            <div className="divide-y divide-slate-100">
              {tabs.map((tab) => {
                const selected = tab.table.id === selectedTableId;
                return (
                  <button
                    key={tab.table.id}
                    type="button"
                    onClick={() => {
                      setSelectedTableId(tab.table.id);
                      setLastReceipt(null);
                    }}
                    className={`w-full text-left px-5 py-4 flex items-center justify-between gap-3 transition-colors ${
                      selected ? 'bg-teal-50/70' : 'hover:bg-slate-50'
                    }`}
                  >
                    <div>
                      <p className="text-sm font-bold text-slate-900">
                        Table {tab.table.number}
                      </p>
                      <p className="text-xs text-slate-500">
                        {tab.orders.length} order{tab.orders.length === 1 ? '' : 's'} · {tab.itemCount} items
                      </p>
                    </div>
                    <span className="text-sm font-mono font-bold text-slate-900 tabular-nums">
                      {formatCurrency(tab.total)}
                    </span>
                  </button>
                );
              })}
            </div>
          )}
        </section>

        {/* Bill & Receipt Panel */}
        <section className="lg:col-span-8 space-y-6">
          {lastReceipt ? (
            <div className="bg-white border border-slate-200 rounded-xl p-6 sm:p-8 max-w-xl">
              <div className="flex items-center justify-between pb-4 border-b border-slate-200 no-print">
                <div className="inline-flex items-center gap-2 text-emerald-700 font-semibold text-sm">
                  <CheckCircle2 className="w-5 h-5" />
                  Payment Recorded & Table Closed
                </div>
                <button
                  type="button"
                  onClick={() => window.print()}
                  className="px-3.5 py-2 rounded-lg bg-slate-900 text-white text-xs font-semibold hover:bg-slate-800 inline-flex items-center gap-1.5"
                >
                  <Printer className="w-3.5 h-3.5" />
                  Print Receipt
                </button>
              </div>

              <div className="mt-6 space-y-4">
                <div className="text-center border-b border-dashed border-slate-300 pb-4">
                  <BrandLogo size="lg" className="mx-auto mb-2" />
                  <h2 className="text-lg font-bold text-slate-900">{config.restaurantName}</h2>
                  <p className="text-xs text-slate-500">
                    Receipt #{lastReceipt.payment.id.slice(-6).toUpperCase()} · Table{' '}
                    {lastReceipt.payment.tableNumber} ({lastReceipt.tableName})
                  </p>
                  <p className="text-xs text-slate-500">
                    {formatDateTime(lastReceipt.payment.createdAt)} · Paid via{' '}
                    <span className="uppercase font-semibold">{lastReceipt.payment.method}</span>
                  </p>
                </div>

                <div className="space-y-2 text-xs">
                  {lastReceipt.orders.flatMap((o) =>
                    o.items.map((it, idx) => (
                      <div key={`${o.id}-${idx}`} className="flex justify-between">
                        <span className="text-slate-700">
                          <span className="font-mono font-semibold">{it.qty}×</span> {it.name}
                        </span>
                        <span className="font-mono tabular-nums text-slate-900">
                          {formatCurrency(it.price * it.qty)}
                        </span>
                      </div>
                    ))
                  )}
                </div>

                <div className="border-t border-dashed border-slate-300 pt-3 space-y-1 text-sm">
                  <div className="flex justify-between text-slate-600">
                    <span>Subtotal</span>
                    <span className="font-mono tabular-nums">
                      {formatCurrency(lastReceipt.payment.subtotal)}
                    </span>
                  </div>
                  {lastReceipt.payment.discount > 0 && (
                    <div className="flex justify-between text-emerald-700">
                      <span>Discount</span>
                      <span className="font-mono tabular-nums">
                        -{formatCurrency(lastReceipt.payment.discount)}
                      </span>
                    </div>
                  )}
                  <div className="flex justify-between text-slate-600">
                    <span>Tax</span>
                    <span className="font-mono tabular-nums">
                      {formatCurrency(lastReceipt.payment.tax)}
                    </span>
                  </div>
                  <div className="flex justify-between font-bold text-base text-slate-900 pt-2 border-t border-slate-200">
                    <span>Total Paid</span>
                    <span className="font-mono tabular-nums">
                      {formatCurrency(lastReceipt.payment.amount)}
                    </span>
                  </div>
                </div>
              </div>
            </div>
          ) : !activeTab ? (
            <div className="bg-white border border-slate-200 rounded-xl p-12 text-center text-sm text-slate-500">
              Select an open table on the left to review its itemized bill and process payment.
            </div>
          ) : (
            <div className="bg-white border border-slate-200 rounded-xl p-6 space-y-6">
              <div className="flex flex-wrap items-center justify-between gap-2 pb-4 border-b border-slate-200">
                <div>
                  <h2 className="text-lg font-bold text-slate-900">
                    Table {activeTab.table.number} — Consolidated Bill
                  </h2>
                  <p className="text-xs text-slate-500">
                    {activeTab.table.name} · {activeTab.orders.length} open order
                    {activeTab.orders.length === 1 ? '' : 's'}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => window.print()}
                  className="px-3.5 py-2 rounded-lg border border-slate-200 text-xs font-semibold text-slate-700 hover:bg-slate-50 inline-flex items-center gap-1.5 no-print"
                >
                  <Printer className="w-3.5 h-3.5" />
                  Print Pro-Forma
                </button>
              </div>

              {/* Consolidated Itemized Lines */}
              <div className="space-y-4">
                {activeTab.orders.map((order) => (
                  <div key={order.id} className="space-y-1.5">
                    <div className="flex items-center justify-between text-xs text-slate-500">
                      <span className="font-mono font-semibold">{order.orderNumber}</span>
                      <span>{formatDateTime(order.createdAt)}</span>
                    </div>
                    <div className="divide-y divide-slate-100 border border-slate-100 rounded-lg">
                      {order.items.map((item, idx) => (
                        <div
                          key={idx}
                          className="px-3.5 py-2.5 flex items-center justify-between text-sm"
                        >
                          <span>
                            <span className="font-mono font-semibold text-slate-900 mr-2">
                              {item.qty}×
                            </span>
                            {item.name}
                          </span>
                          <span className="font-mono tabular-nums text-slate-900">
                            {formatCurrency(item.price * item.qty)}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>

              {/* Discount & Payment Controls */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-4 border-t border-slate-200 no-print">
                <div>
                  <label htmlFor="bill-disc-pct" className="block text-xs font-medium text-slate-700 mb-1">
                    Discount (%)
                  </label>
                  <input
                    id="bill-disc-pct"
                    type="number"
                    min={0}
                    max={100}
                    value={discountPercent}
                    onChange={(e) => setDiscountPercent(e.target.value)}
                    className="w-full px-3 py-2 rounded-lg border border-slate-300 text-sm font-mono"
                  />
                </div>
                <div>
                  <label htmlFor="bill-disc-flat" className="block text-xs font-medium text-slate-700 mb-1">
                    Flat Discount (USD)
                  </label>
                  <input
                    id="bill-disc-flat"
                    type="number"
                    min={0}
                    step="0.5"
                    value={flatDiscount}
                    onChange={(e) => setFlatDiscount(e.target.value)}
                    className="w-full px-3 py-2 rounded-lg border border-slate-300 text-sm font-mono"
                  />
                </div>
              </div>

              {/* Payment Method */}
              <div className="space-y-2 no-print">
                <p className="text-xs font-medium text-slate-700">Payment Method</p>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                  {[
                    { id: 'card', label: 'Card', icon: CreditCard },
                    { id: 'cash', label: 'Cash', icon: Banknote },
                    { id: 'upi', label: 'UPI', icon: Smartphone },
                    { id: 'demo', label: 'Demo Pay', icon: Sparkles },
                  ].map((pm) => {
                    const Icon = pm.icon;
                    return (
                      <button
                        key={pm.id}
                        type="button"
                        onClick={() => setMethod(pm.id)}
                        className={`min-h-[44px] px-3 py-2 rounded-lg border text-xs font-semibold inline-flex items-center justify-center gap-1.5 transition-colors ${
                          method === pm.id
                            ? 'bg-slate-900 border-slate-900 text-white'
                            : 'bg-white border-slate-200 text-slate-700 hover:bg-slate-50'
                        }`}
                      >
                        <Icon className="w-3.5 h-3.5" />
                        {pm.label}
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Totals Summary */}
              <div className="bg-slate-50 border border-slate-200 rounded-xl p-4 space-y-1.5 text-sm">
                <div className="flex justify-between text-slate-600">
                  <span>Subtotal</span>
                  <span className="font-mono tabular-nums">{formatCurrency(subtotal)}</span>
                </div>
                {computedDiscount > 0 && (
                  <div className="flex justify-between text-emerald-700">
                    <span>Discount</span>
                    <span className="font-mono tabular-nums">-{formatCurrency(computedDiscount)}</span>
                  </div>
                )}
                <div className="flex justify-between text-slate-600">
                  <span>Tax ({Math.round(taxRate * 100)}%)</span>
                  <span className="font-mono tabular-nums">{formatCurrency(computedTax)}</span>
                </div>
                <div className="flex justify-between font-bold text-base text-slate-900 pt-2 border-t border-slate-200">
                  <span>Amount Due</span>
                  <span className="font-mono tabular-nums">{formatCurrency(computedTotal)}</span>
                </div>
              </div>

              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pt-2 no-print">
                <div className="flex items-center gap-3 text-xs text-slate-600">
                  <span>After payment, set table to:</span>
                  <select
                    aria-label="Table status after payment"
                    value={nextTableStatus}
                    onChange={(e) => setNextTableStatus(e.target.value)}
                    className="px-2.5 py-1.5 rounded-lg border border-slate-300 bg-white text-xs font-semibold text-slate-900"
                  >
                    <option value="free">Free</option>
                    <option value="cleaning">Cleaning</option>
                  </select>
                </div>

                <button
                  type="button"
                  disabled={processing || activeTab.orders.length === 0}
                  onClick={handleSettle}
                  className="min-h-[46px] px-6 py-2.5 rounded-lg bg-teal-700 text-white text-sm font-semibold hover:bg-teal-800 disabled:opacity-50"
                >
                  {processing
                    ? 'Recording Payment...'
                    : `Record Payment & Close Table (${formatCurrency(computedTotal)})`}
                </button>
              </div>
            </div>
          )}
        </section>
      </div>
    </Layout>
  );
}
