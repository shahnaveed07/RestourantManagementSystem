import React, { useState, useRef, useCallback } from 'react';
import { X, Minus, Plus, Trash2, ShoppingBag, CheckCircle2, Lock } from 'lucide-react';
import toast from 'react-hot-toast';
import { useAuth } from '../context/AuthContext';
import { useCart } from '../context/CartContext';
import { api } from '../api/client';
import { formatCurrency } from '../utils/format';
import { useModalA11y } from '../utils/useModalA11y';

export function CartDrawer({ onRequireAuth, onOrderPlaced }) {
  const { user, config } = useAuth();
  const {
    cartOpen,
    setCartOpen,
    entries,
    count,
    subtotal,
    tax,
    total,
    updateQty,
    updateNotes,
    clearCart,
  } = useCart();

  const [orderType, setOrderType] = useState('pickup');
  const [selectedTableId, setSelectedTableId] = useState('');
  const [placing, setPlacing] = useState(false);
  const [lastOrder, setLastOrder] = useState(null);
  const drawerRef = useRef(null);

  const handleClose = useCallback(() => {
    setLastOrder(null);
    setCartOpen(false);
  }, [setCartOpen]);

  useModalA11y(cartOpen, handleClose, drawerRef);

  if (!cartOpen) return null;

  const tables = config.tables || [];

  const handleCheckout = async () => {
    if (entries.length === 0) return;

    // Require login before placing order
    if (!user) {
      onRequireAuth();
      return;
    }

    if (orderType === 'dine_in' && !selectedTableId) {
      toast.error('Please select your dining table or choose Counter Pickup.');
      return;
    }

    setPlacing(true);
    try {
      const payload = {
        orderType,
        tableId: orderType === 'dine_in' ? selectedTableId : 'pickup',
        items: entries.map((e) => ({
          menuItemId: e.item.id,
          qty: e.qty,
          notes: e.notes?.trim() || undefined,
        })),
      };
      const created = await api.createOrder(payload);
      setLastOrder(created);
      clearCart();
      toast.success(`Order ${created.orderNumber} sent to the kitchen!`);
      onOrderPlaced?.(created);
    } catch (err) {
      toast.error(err.message);
    } finally {
      setPlacing(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 bg-slate-950/60 flex items-end md:items-stretch md:justify-end"
      role="dialog"
      aria-modal="true"
      aria-labelledby="cart-drawer-title"
    >
      {/* Clickable backdrop */}
      <button
        type="button"
        aria-label="Close cart backdrop"
        onClick={handleClose}
        className="flex-1 hidden md:block cursor-default"
      />

      {/* Bottom sheet on mobile (max-h-[85dvh]), right side drawer on desktop (400px) */}
      <div
        ref={drawerRef}
        className="w-full md:w-[400px] max-w-full bg-white rounded-t-2xl md:rounded-none md:rounded-l-2xl max-h-[85dvh] md:max-h-dvh md:h-dvh flex flex-col shadow-2xl border-t md:border-t-0 md:border-l border-slate-200"
      >
        <div className="px-5 py-4 border-b border-slate-200 flex items-center justify-between gap-3 shrink-0">
          <div>
            <h2 id="cart-drawer-title" className="text-base font-bold text-slate-900">
              {lastOrder ? 'Order Confirmed' : 'Your Order'}
            </h2>
            <p className="text-xs text-slate-500">
              {lastOrder
                ? `${lastOrder.orderNumber} · Sent to Kitchen`
                : `${count} item${count === 1 ? '' : 's'} · ${config.restaurantName}`}
            </p>
          </div>
          <button
            type="button"
            onClick={handleClose}
            aria-label="Close cart drawer"
            className="min-w-[44px] min-h-[44px] flex items-center justify-center rounded-lg text-slate-500 hover:bg-slate-100 hover:text-slate-900"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {lastOrder ? (
          <div className="p-6 flex-1 overflow-y-auto space-y-5">
            <div className="rounded-xl bg-emerald-50 border border-emerald-200 p-4 flex items-start gap-3">
              <CheckCircle2 className="w-5 h-5 text-emerald-700 shrink-0 mt-0.5" />
              <div>
                <p className="text-sm font-bold text-emerald-950">
                  Order {lastOrder.orderNumber} Received
                </p>
                <p className="text-xs text-emerald-800 mt-0.5">
                  {lastOrder.tableNumber > 0
                    ? `Serving Table ${lastOrder.tableNumber} (${lastOrder.tableName})`
                    : 'Counter Pickup — We will notify you as it progresses.'}
                </p>
              </div>
            </div>

            <div className="border border-slate-200 rounded-xl divide-y divide-slate-100">
              {lastOrder.items.map((it, idx) => (
                <div key={idx} className="px-4 py-3 flex items-center justify-between text-sm">
                  <span>
                    <strong className="font-mono text-slate-900 mr-1.5">{it.qty}×</strong>
                    {it.name}
                  </span>
                  <span className="font-mono tabular-nums text-slate-700">
                    {formatCurrency(it.price * it.qty)}
                  </span>
                </div>
              ))}
              <div className="px-4 py-3 flex items-center justify-between font-bold text-slate-900 bg-slate-50 rounded-b-xl">
                <span>Total Paid / Due</span>
                <span className="font-mono tabular-nums">{formatCurrency(lastOrder.total)}</span>
              </div>
            </div>

            <button
              type="button"
              onClick={() => {
                setLastOrder(null);
                setCartOpen(false);
              }}
              className="w-full min-h-[48px] rounded-xl bg-teal-700 text-white text-sm font-semibold hover:bg-teal-800"
            >
              Back to Menu
            </button>
          </div>
        ) : entries.length === 0 ? (
          <div className="p-8 flex-1 flex flex-col items-center justify-center text-center">
            <div className="w-12 h-12 rounded-xl bg-slate-100 flex items-center justify-center text-slate-400 mb-3">
              <ShoppingBag className="w-6 h-6" />
            </div>
            <p className="text-sm font-semibold text-slate-900">Your cart is empty</p>
            <p className="mt-1 text-xs text-slate-500 max-w-xs">
              Browse the menu and add dishes to build your order before checking out.
            </p>
          </div>
        ) : (
          <>
            <div className="flex-1 overflow-y-auto px-5 divide-y divide-slate-100">
              {entries.map(({ item, qty, notes }) => (
                <div key={item.id} className="py-4 space-y-2.5">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="text-sm font-semibold text-slate-900">{item.name}</p>
                      <p className="text-xs font-mono text-slate-500 tabular-nums">
                        {formatCurrency(item.price)} each
                      </p>
                    </div>
                    <span className="text-sm font-mono font-bold text-slate-900 tabular-nums shrink-0">
                      {formatCurrency(item.price * qty)}
                    </span>
                  </div>

                  <div className="flex items-center justify-between gap-3">
                    <div className="inline-flex items-center border border-slate-200 rounded-lg bg-slate-50">
                      <button
                        type="button"
                        onClick={() => updateQty(item.id, -1)}
                        aria-label={`Decrease quantity of ${item.name}`}
                        className="w-11 h-11 flex items-center justify-center text-slate-700 hover:bg-slate-200 rounded-l-lg"
                      >
                        {qty === 1 ? (
                          <Trash2 className="w-4 h-4 text-red-600" />
                        ) : (
                          <Minus className="w-4 h-4" />
                        )}
                      </button>
                      <span className="w-9 text-center text-sm font-mono font-semibold tabular-nums">
                        {qty}
                      </span>
                      <button
                        type="button"
                        onClick={() => updateQty(item.id, 1)}
                        aria-label={`Increase quantity of ${item.name}`}
                        className="w-11 h-11 flex items-center justify-center text-slate-700 hover:bg-slate-200 rounded-r-lg"
                      >
                        <Plus className="w-4 h-4" />
                      </button>
                    </div>
                  </div>

                  <input
                    type="text"
                    value={notes}
                    onChange={(e) => updateNotes(item.id, e.target.value)}
                    placeholder="Kitchen note (e.g., no onions, extra sauce)..."
                    aria-label={`Notes for ${item.name}`}
                    className="w-full min-h-[44px] px-3 py-2 rounded-lg border border-slate-200 text-base sm:text-xs text-slate-800 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-teal-600"
                  />
                </div>
              ))}
            </div>

            <div className="p-5 safe-bottom-bar border-t border-slate-200 bg-slate-50/90 space-y-3 shrink-0">
              {/* Service Option */}
              <div className="space-y-2">
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => setOrderType('pickup')}
                    className={`min-h-[44px] px-3 rounded-lg border text-xs font-semibold transition-colors ${
                      orderType === 'pickup'
                        ? 'bg-slate-900 border-slate-900 text-white'
                        : 'bg-white border-slate-200 text-slate-700 hover:bg-slate-100'
                    }`}
                  >
                    Counter Pickup
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setOrderType('dine_in');
                      if (!selectedTableId && tables.length > 0) {
                        setSelectedTableId(tables[0].id);
                      }
                    }}
                    className={`min-h-[44px] px-3 rounded-lg border text-xs font-semibold transition-colors ${
                      orderType === 'dine_in'
                        ? 'bg-slate-900 border-slate-900 text-white'
                        : 'bg-white border-slate-200 text-slate-700 hover:bg-slate-100'
                    }`}
                  >
                    Dine-In Table
                  </button>
                </div>

                {orderType === 'dine_in' && tables.length > 0 && (
                  <select
                    aria-label="Select dining table"
                    value={selectedTableId}
                    onChange={(e) => setSelectedTableId(e.target.value)}
                    className="w-full min-h-[44px] px-3 rounded-lg border border-slate-300 bg-white text-base sm:text-xs font-medium text-slate-800 focus:outline-none focus:ring-2 focus:ring-teal-600"
                  >
                    {tables.map((t) => (
                      <option key={t.id} value={t.id}>
                        Table {t.number} — {t.section}
                      </option>
                    ))}
                  </select>
                )}
              </div>

              {/* Totals */}
              <div className="space-y-1 text-sm pt-1">
                <div className="flex justify-between text-slate-600">
                  <span>Subtotal</span>
                  <span className="font-mono tabular-nums">{formatCurrency(subtotal)}</span>
                </div>
                <div className="flex justify-between text-slate-600">
                  <span>Tax ({Math.round(config.taxRate * 100)}%)</span>
                  <span className="font-mono tabular-nums">{formatCurrency(tax)}</span>
                </div>
                <div className="flex justify-between font-bold text-slate-900 pt-1.5 border-t border-slate-200">
                  <span>Total</span>
                  <span className="font-mono tabular-nums">{formatCurrency(total)}</span>
                </div>
              </div>

              {user ? (
                <div className="text-xs text-slate-600 flex items-center justify-between">
                  <span>Ordering as <strong className="text-slate-900">{user.name}</strong></span>
                </div>
              ) : (
                <div className="text-xs text-slate-600 flex items-center gap-1.5">
                  <Lock className="w-3.5 h-3.5 text-teal-700 shrink-0" />
                  <span>Sign in or create a free account at checkout to place your order.</span>
                </div>
              )}

              <button
                type="button"
                disabled={placing}
                onClick={handleCheckout}
                className="w-full min-h-[48px] py-3 px-4 rounded-xl bg-teal-700 text-white text-sm font-semibold hover:bg-teal-800 disabled:opacity-60 transition-colors flex items-center justify-center gap-2"
              >
                {placing
                  ? 'Sending Order...'
                  : user
                    ? `Place Order · ${formatCurrency(total)}`
                    : `Checkout · ${formatCurrency(total)}`}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
