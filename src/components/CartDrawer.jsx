import React, { useState, useRef, useCallback, useEffect } from 'react';
import {
  X,
  Minus,
  Plus,
  Trash2,
  ShoppingBag,
  CheckCircle2,
  Lock,
  ArrowLeft,
  UtensilsCrossed,
} from 'lucide-react';
import toast from 'react-hot-toast';
import { useAuth } from '../context/AuthContext';
import { useCart } from '../context/CartContext';
import { api } from '../api/client';
import { formatCurrency } from '../utils/format';
import { validateSelectedTable } from '../utils/cart';
import { useModalA11y } from '../utils/useModalA11y';
import { TableSelector } from './TableSelector';

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
    selectedTable,
    setSelectedTable,
    clearSelectedTable,
    updateQty,
    updateNotes,
    clearCart,
  } = useCart();

  const [step, setStep] = useState('review'); // 'review' | 'table'
  const [tableError, setTableError] = useState(null);
  const [tableRefreshKey, setTableRefreshKey] = useState(0);
  const [placing, setPlacing] = useState(false);
  const [lastOrder, setLastOrder] = useState(null);
  const drawerRef = useRef(null);

  const handleClose = useCallback(() => {
    setLastOrder(null);
    setTableError(null);
    setStep('review');
    setCartOpen(false);
  }, [setCartOpen]);

  useModalA11y(cartOpen, handleClose, drawerRef);

  const handleInvalidSelected = useCallback(
    (reason) => {
      clearSelectedTable();
      setTableError(reason || 'This table is not accepting orders right now.');
    },
    [clearSelectedTable]
  );

  // Refresh table availability whenever drawer opens on table step
  useEffect(() => {
    if (cartOpen && step === 'table') {
      setTableRefreshKey((k) => k + 1);
    }
  }, [cartOpen, step]);

  if (!cartOpen) return null;

  const handleSelectTable = (table) => {
    setSelectedTable(table);
    setTableError(null);
  };

  const submitHomeOrder = async () => {
    if (entries.length === 0) return;

    const validation = validateSelectedTable(selectedTable);
    if (!validation.valid) {
      setTableError(validation.error);
      setStep('table');
      return;
    }

    // Step 3: Login / OTP verification if not logged in (cart + selectedTable stay preserved)
    if (!user) {
      onRequireAuth();
      return;
    }

    setPlacing(true);
    setTableError(null);
    try {
      const payload = {
        tableId: selectedTable.id,
        source: 'home',
        items: entries.map((e) => ({
          menuItemId: e.item.id,
          qty: e.qty,
          notes: e.notes?.trim() || undefined,
        })),
      };
      const created = await api.createOrder(payload);
      setLastOrder(created);
      clearCart();
      setStep('review');
      toast.success(`Order ${created.orderNumber} sent to the kitchen!`);
      onOrderPlaced?.(created);
    } catch (err) {
      if (err.status === 409 || err.status === 404 || err.status === 400) {
        if (err.status === 409 || err.status === 404) {
          clearSelectedTable();
          setTableRefreshKey((k) => k + 1);
        }
        setTableError(err.message);
        setStep('table');
      }
      toast.error(err.message);
    } finally {
      setPlacing(false);
    }
  };

  const handlePrimaryReviewAction = () => {
    if (entries.length === 0) return;
    if (!selectedTable) {
      setTableError(null);
      setStep('table');
      return;
    }
    submitHomeOrder();
  };

  const isTableStep = !lastOrder && entries.length > 0 && step === 'table';

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

      {/* Bottom sheet on mobile, side drawer on desktop (widens cleanly for 4/6-col table grid) */}
      <div
        ref={drawerRef}
        className={`w-full max-w-full bg-white rounded-t-2xl md:rounded-none md:rounded-l-2xl max-h-[90dvh] md:max-h-dvh md:h-dvh flex flex-col shadow-2xl border-t md:border-t-0 md:border-l border-slate-200 transition-[width] ${
          isTableStep ? 'md:w-[700px] lg:w-[920px]' : 'md:w-[420px]'
        }`}
      >
        <div className="px-5 py-4 border-b border-slate-200 flex items-center justify-between gap-3 shrink-0">
          <div className="flex items-center gap-2.5 min-w-0">
            {isTableStep && (
              <button
                type="button"
                onClick={() => {
                  setTableError(null);
                  setStep('review');
                }}
                aria-label="Back to cart review"
                className="min-w-[40px] min-h-[40px] flex items-center justify-center rounded-lg border border-slate-200 text-slate-700 hover:bg-slate-100 shrink-0"
              >
                <ArrowLeft className="w-4 h-4" />
              </button>
            )}
            <div className="min-w-0">
              <h2 id="cart-drawer-title" className="text-base font-bold text-slate-900 truncate">
                {lastOrder
                  ? 'Order Confirmed'
                  : isTableStep
                    ? 'Select Your Table'
                    : 'Your Order'}
              </h2>
              <p className="text-xs text-slate-500 truncate">
                {lastOrder
                  ? `${lastOrder.orderNumber} · Table ${lastOrder.tableNumberSnapshot ?? lastOrder.tableNumber}`
                  : isTableStep
                    ? 'Step 2 of 3 · Choose where you are seated'
                    : `${count} item${count === 1 ? '' : 's'} · ${config.restaurantName}`}
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={handleClose}
            aria-label="Close cart drawer"
            className="min-w-[44px] min-h-[44px] flex items-center justify-center rounded-lg text-slate-500 hover:bg-slate-100 hover:text-slate-900 shrink-0"
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
                  Serving Table {lastOrder.tableNumberSnapshot ?? lastOrder.tableNumber} ({lastOrder.tableName})
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
                <span>Total Due at Table</span>
                <span className="font-mono tabular-nums">{formatCurrency(lastOrder.total)}</span>
              </div>
            </div>

            <button
              type="button"
              onClick={handleClose}
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
        ) : isTableStep ? (
          <>
            <div className="flex-1 overflow-y-auto p-5 space-y-4">
              {tableError && (
                <div
                  role="alert"
                  className="p-3.5 rounded-xl bg-red-50 border border-red-200 text-xs font-semibold text-red-700"
                >
                  {tableError}
                </div>
              )}

              <TableSelector
                selectedTable={selectedTable}
                onSelect={handleSelectTable}
                refreshKey={tableRefreshKey}
                onInvalidSelected={handleInvalidSelected}
              />
            </div>

            <div className="p-5 safe-bottom-bar border-t border-slate-200 bg-slate-50/90 space-y-3 shrink-0">
              <div className="flex items-center justify-between text-xs text-slate-600">
                <span>
                  {selectedTable
                    ? `Selected: Table ${selectedTable.number} (${selectedTable.section || selectedTable.name})`
                    : 'No table selected yet'}
                </span>
                <span className="font-mono font-bold text-slate-900 tabular-nums">
                  {formatCurrency(total)}
                </span>
              </div>

              {!user && (
                <div className="text-xs text-slate-600 flex items-center gap-1.5">
                  <Lock className="w-3.5 h-3.5 text-teal-700 shrink-0" />
                  <span>After selecting your table, sign in or verify via OTP to send your order.</span>
                </div>
              )}

              <button
                type="button"
                disabled={placing}
                onClick={submitHomeOrder}
                className="w-full min-h-[48px] py-3 px-4 rounded-xl bg-teal-700 text-white text-sm font-semibold hover:bg-teal-800 disabled:opacity-60 transition-colors flex items-center justify-center gap-2"
              >
                {placing
                  ? 'Sending Order...'
                  : user
                    ? `Place Order · ${formatCurrency(total)}`
                    : `Continue to Sign In · ${formatCurrency(total)}`}
              </button>
            </div>
          </>
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
              {tableError && (
                <div
                  role="alert"
                  className="p-3 rounded-lg bg-red-50 border border-red-200 text-xs font-semibold text-red-700"
                >
                  {tableError}
                </div>
              )}

              {/* Selected Table Summary Card */}
              <div className="rounded-xl border border-slate-200 bg-white p-3 space-y-1.5">
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2 min-w-0">
                    <UtensilsCrossed className="w-4 h-4 text-teal-700 shrink-0" />
                    <div className="min-w-0">
                      <p className="text-xs font-bold text-slate-900 truncate">
                        {selectedTable ? `Table ${selectedTable.number}` : 'Dining Table Required'}
                      </p>
                      <p className="text-[11px] text-slate-500 truncate">
                        {selectedTable
                          ? `${selectedTable.section || selectedTable.name} · ${selectedTable.capacity} seats`
                          : 'Select your table number to place this order'}
                      </p>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      setTableError(null);
                      setStep('table');
                    }}
                    className="min-h-[36px] px-3 rounded-lg border border-slate-200 text-xs font-semibold text-teal-800 hover:bg-teal-50 shrink-0"
                  >
                    {selectedTable ? 'Change' : 'Select Table'}
                  </button>
                </div>
                {selectedTable?.status === 'occupied' && (
                  <p className="text-[11px] font-medium text-amber-800 bg-amber-50 border border-amber-200 rounded-lg px-2.5 py-1.5">
                    This table has an open order. Your order will be added to it.
                  </p>
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
                  <span>
                    Ordering as <strong className="text-slate-900">{user.name}</strong>
                  </span>
                </div>
              ) : (
                <div className="text-xs text-slate-600 flex items-center gap-1.5">
                  <Lock className="w-3.5 h-3.5 text-teal-700 shrink-0" />
                  <span>Sign in or verify via OTP at checkout to send your order.</span>
                </div>
              )}

              <button
                type="button"
                disabled={placing}
                onClick={handlePrimaryReviewAction}
                className="w-full min-h-[48px] py-3 px-4 rounded-xl bg-teal-700 text-white text-sm font-semibold hover:bg-teal-800 disabled:opacity-60 transition-colors flex items-center justify-center gap-2"
              >
                {placing
                  ? 'Sending Order...'
                  : !selectedTable
                    ? `Choose Table & Checkout · ${formatCurrency(total)}`
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
