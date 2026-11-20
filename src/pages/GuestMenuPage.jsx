import React, { useEffect, useState, useCallback, useMemo } from 'react';
import { useParams, Link } from 'react-router-dom';
import { io } from 'socket.io-client';
import toast from 'react-hot-toast';
import {
  Search,
  ShoppingBag,
  BellRing,
  Plus,
  Minus,
  Trash2,
  X,
  CheckCircle2,
  Clock,
  Wifi,
  WifiOff,
  Flame,
  Leaf,
  ChevronUp,
} from 'lucide-react';
import { api } from '../api/client';
import { DishImage } from '../components/DishImage';
import {
  formatCurrency,
  ORDER_STATUS_LABEL,
  CALL_TYPE_LABEL,
  formatTimeShort,
} from '../utils/format';

const PROGRESS_STEPS = ['pending', 'preparing', 'ready', 'served'];

function getOrCreateGuestSession(tableToken) {
  const key = `passline_guest_session_${tableToken}`;
  try {
    const existing = localStorage.getItem(key);
    if (existing) return existing;
    const created = `guest-${tableToken}-${Math.random().toString(36).slice(2, 10)}`;
    localStorage.setItem(key, created);
    return created;
  } catch {
    return `guest-${tableToken}-${Date.now()}`;
  }
}

export function GuestMenuPage() {
  const { qrToken = '' } = useParams();
  const [sessionId] = useState(() => getOrCreateGuestSession(qrToken));
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [restaurantName, setRestaurantName] = useState('Linden & Rye');
  const [taxRate, setTaxRate] = useState(0.08);
  const [table, setTable] = useState(null);
  const [categories, setCategories] = useState([]);
  const [menuItems, setMenuItems] = useState([]);
  const [orders, setOrders] = useState([]);
  const [calls, setCalls] = useState([]);

  const [selectedCategory, setSelectedCategory] = useState('all');
  const [search, setSearch] = useState('');
  const [vegOnly, setVegOnly] = useState(false);
  const [cart, setCart] = useState({});
  const [cartOpen, setCartOpen] = useState(false);
  const [callDrawerOpen, setCallDrawerOpen] = useState(false);
  const [customCallMsg, setCustomCallMsg] = useState('');
  const [placingOrder, setPlacingOrder] = useState(false);
  const [sendingCall, setSendingCall] = useState(false);
  const [socketLive, setSocketLive] = useState(false);

  const loadData = useCallback(async () => {
    try {
      const data = await api.getGuestTableData(qrToken, sessionId);
      setRestaurantName(data.restaurantName);
      setTaxRate(data.taxRate);
      setTable(data.table);
      setCategories(data.categories);
      setMenuItems(data.menuItems);
      setOrders(data.orders);
      setCalls(data.calls);
      setError(null);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [qrToken, sessionId]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  // Real-time Socket.IO connection strictly scoped to this table's qrToken
  useEffect(() => {
    if (!qrToken) return;
    const s = io(window.location.origin, {
      auth: { qrToken, mode: 'guest' },
      reconnection: true,
    });

    s.on('connect', () => {
      setSocketLive(true);
      s.emit('guest:joinTable', qrToken);
      loadData();
    });

    s.on('disconnect', () => {
      setSocketLive(false);
    });

    s.on('order:created', (order) => {
      setOrders((prev) => (prev.some((o) => o.id === order.id) ? prev : [order, ...prev]));
    });

    s.on('order:updated', (order) => {
      setOrders((prev) => {
        if (order.status === 'paid' || order.status === 'cancelled') {
          return prev.filter((o) => o.id !== order.id);
        }
        const exists = prev.some((o) => o.id === order.id);
        return exists ? prev.map((o) => (o.id === order.id ? order : o)) : [order, ...prev];
      });
      toast(`Order ${order.orderNumber} is now ${ORDER_STATUS_LABEL[order.status]}`, {
        id: `guest-ord-${order.id}-${order.status}`,
      });
    });

    s.on('order:cancelled', (order) => {
      setOrders((prev) => prev.filter((o) => o.id !== order.id));
    });

    s.on('call:created', (call) => {
      setCalls((prev) => (prev.some((c) => c.id === call.id) ? prev : [call, ...prev]));
    });

    s.on('call:acknowledged', (call) => {
      setCalls((prev) => prev.map((c) => (c.id === call.id ? call : c)));
      toast.success(`${call.acknowledgedByName || 'A waiter'} acknowledged your request`);
    });

    s.on('call:resolved', (call) => {
      setCalls((prev) => prev.filter((c) => c.id !== call.id));
    });

    s.on('menu:itemAvailabilityChanged', (updatedItem) => {
      setMenuItems((prev) => prev.map((m) => (m.id === updatedItem.id ? updatedItem : m)));
      if (!updatedItem.isAvailable) {
        setCart((prev) => {
          if (!prev[updatedItem.id]) return prev;
          const copy = { ...prev };
          delete copy[updatedItem.id];
          toast.error(`"${updatedItem.name}" just sold out and was removed from your cart.`);
          return copy;
        });
      }
    });

    s.on('menu:updated', () => {
      loadData();
    });

    return () => {
      s.disconnect();
    };
  }, [qrToken, loadData]);

  const addToCart = (item) => {
    if (!item.isAvailable) return;
    setCart((prev) => {
      const existing = prev[item.id];
      return {
        ...prev,
        [item.id]: {
          item,
          qty: existing ? existing.qty + 1 : 1,
          notes: existing?.notes || '',
        },
      };
    });
  };

  const updateCartQty = (itemId, delta) => {
    setCart((prev) => {
      const existing = prev[itemId];
      if (!existing) return prev;
      const nextQty = existing.qty + delta;
      if (nextQty <= 0) {
        const copy = { ...prev };
        delete copy[itemId];
        return copy;
      }
      return { ...prev, [itemId]: { ...existing, qty: nextQty } };
    });
  };

  const updateCartNotes = (itemId, notes) => {
    setCart((prev) => {
      const existing = prev[itemId];
      if (!existing) return prev;
      return { ...prev, [itemId]: { ...existing, notes } };
    });
  };

  const cartEntries = useMemo(() => Object.values(cart), [cart]);
  const cartCount = useMemo(() => cartEntries.reduce((s, e) => s + e.qty, 0), [cartEntries]);
  const cartSubtotal = useMemo(
    () => cartEntries.reduce((s, e) => s + e.item.price * e.qty, 0),
    [cartEntries]
  );
  const cartTax = cartSubtotal * taxRate;
  const cartTotal = cartSubtotal + cartTax;

  const handlePlaceOrder = async () => {
    if (cartEntries.length === 0) return;
    setPlacingOrder(true);
    try {
      const created = await api.placeGuestOrder(qrToken, {
        sessionId,
        items: cartEntries.map((e) => ({
          menuItemId: e.item.id,
          qty: e.qty,
          notes: e.notes.trim() || undefined,
        })),
      });
      setOrders((prev) => (prev.some((o) => o.id === created.id) ? prev : [created, ...prev]));
      setCart({});
      setCartOpen(false);
      toast.success(`Order ${created.orderNumber} sent to the kitchen!`);
    } catch (err) {
      toast.error(err.message);
      loadData();
    } finally {
      setPlacingOrder(false);
    }
  };

  const handleServiceCall = async (type, message) => {
    setSendingCall(true);
    try {
      const created = await api.createGuestCall(qrToken, {
        sessionId,
        type,
        message: message?.trim() || undefined,
      });
      setCalls((prev) => (prev.some((c) => c.id === created.id) ? prev : [created, ...prev]));
      setCustomCallMsg('');
      setCallDrawerOpen(false);
      toast.success('Your server has been notified');
    } catch (err) {
      toast.error(err.message);
    } finally {
      setSendingCall(false);
    }
  };

  const filteredItems = useMemo(() => {
    const q = search.trim().toLowerCase();
    return menuItems.filter((item) => {
      if (selectedCategory !== 'all' && item.categoryId !== selectedCategory) return false;
      if (vegOnly && !item.isVeg) return false;
      if (q && !item.name.toLowerCase().includes(q) && !item.description.toLowerCase().includes(q)) {
        return false;
      }
      return true;
    });
  }, [menuItems, selectedCategory, vegOnly, search]);

  const groupedByCategory = useMemo(() => {
    return categories
      .map((cat) => ({
        category: cat,
        items: filteredItems.filter((i) => i.categoryId === cat.id),
      }))
      .filter((g) => g.items.length > 0);
  }, [categories, filteredItems]);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50 p-6">
        <p className="text-sm text-slate-500">Loading your table menu...</p>
      </div>
    );
  }

  if (error || !table) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50 p-6">
        <div className="max-w-md w-full bg-white border border-slate-200 rounded-xl p-8 text-center">
          <h1 className="text-xl font-bold text-slate-900">Table QR Code Not Recognized</h1>
          <p className="mt-2 text-sm text-slate-600">
            {error || 'Please scan the active QR code on your table or ask your server for assistance.'}
          </p>
          <Link
            to="/login"
            className="mt-6 inline-flex items-center justify-center px-4 py-2.5 rounded-lg bg-teal-700 text-white text-sm font-medium hover:bg-teal-800"
          >
            Go to Staff Login
          </Link>
        </div>
      </div>
    );
  }

  const cartPanelContent = (
    <div className="flex flex-col h-full">
      <div className="flex items-center justify-between pb-4 border-b border-slate-200">
        <div>
          <h2 className="text-base font-bold text-slate-900">Your Order</h2>
          <p className="text-xs text-slate-500">Table {table.number} · {cartCount} items</p>
        </div>
        <button
          type="button"
          onClick={() => setCartOpen(false)}
          aria-label="Close cart"
          className="lg:hidden p-2 rounded-lg text-slate-500 hover:bg-slate-100"
        >
          <X className="w-4 h-4" />
        </button>
      </div>

      {cartEntries.length === 0 ? (
        <div className="py-10 text-center text-sm text-slate-500">
          Add dishes from the menu to start your table order.
        </div>
      ) : (
        <>
          <div className="flex-1 overflow-y-auto divide-y divide-slate-100 my-2">
            {cartEntries.map(({ item, qty, notes }) => (
              <div key={item.id} className="py-3.5 space-y-2">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-slate-900">{item.name}</p>
                    <p className="text-xs font-mono text-slate-500 tabular-nums">
                      {formatCurrency(item.price)} each
                    </p>
                  </div>
                  <span className="text-sm font-mono font-semibold text-slate-900 tabular-nums">
                    {formatCurrency(item.price * qty)}
                  </span>
                </div>

                <div className="flex items-center justify-between gap-2">
                  <div className="inline-flex items-center border border-slate-200 rounded-lg bg-slate-50">
                    <button
                      type="button"
                      onClick={() => updateCartQty(item.id, -1)}
                      aria-label={`Decrease quantity of ${item.name}`}
                      className="w-9 h-9 flex items-center justify-center text-slate-700 hover:bg-slate-200 rounded-l-lg"
                    >
                      {qty === 1 ? <Trash2 className="w-3.5 h-3.5 text-red-600" /> : <Minus className="w-3.5 h-3.5" />}
                    </button>
                    <span className="w-8 text-center text-sm font-mono font-semibold tabular-nums">
                      {qty}
                    </span>
                    <button
                      type="button"
                      onClick={() => updateCartQty(item.id, 1)}
                      aria-label={`Increase quantity of ${item.name}`}
                      className="w-9 h-9 flex items-center justify-center text-slate-700 hover:bg-slate-200 rounded-r-lg"
                    >
                      <Plus className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>

                <input
                  type="text"
                  value={notes}
                  onChange={(e) => updateCartNotes(item.id, e.target.value)}
                  placeholder="Add kitchen note (e.g., no onions, allergy)..."
                  aria-label={`Notes for ${item.name}`}
                  className="w-full px-3 py-1.5 rounded-lg border border-slate-200 text-xs text-slate-800 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-teal-600"
                />
              </div>
            ))}
          </div>

          <div className="pt-4 border-t border-slate-200 space-y-1.5 text-sm">
            <div className="flex justify-between text-slate-600">
              <span>Subtotal</span>
              <span className="font-mono tabular-nums">{formatCurrency(cartSubtotal)}</span>
            </div>
            <div className="flex justify-between text-slate-600">
              <span>Tax ({Math.round(taxRate * 100)}%)</span>
              <span className="font-mono tabular-nums">{formatCurrency(cartTax)}</span>
            </div>
            <div className="flex justify-between font-bold text-slate-900 pt-1.5 border-t border-slate-100">
              <span>Estimated Total</span>
              <span className="font-mono tabular-nums">{formatCurrency(cartTotal)}</span>
            </div>

            <button
              type="button"
              disabled={placingOrder}
              onClick={handlePlaceOrder}
              className="mt-4 w-full min-h-[46px] py-3 px-4 rounded-xl bg-teal-700 text-white text-sm font-semibold hover:bg-teal-800 disabled:opacity-60 transition-colors"
            >
              {placingOrder ? 'Sending to Kitchen...' : `Place Order · ${formatCurrency(cartTotal)}`}
            </button>
          </div>
        </>
      )}
    </div>
  );

  return (
    <div className="min-h-screen bg-slate-50 pb-24 lg:pb-12">
      {/* Compact Sticky Top Bar (<7% viewport height on mobile) */}
      <header className="sticky top-0 z-30 bg-white/95 backdrop-blur-xs border-b border-slate-200">
        <div className="max-w-7xl mx-auto px-4 lg:px-8 h-14 flex items-center justify-between gap-4">
          <div className="min-w-0">
            <span className="text-base font-bold text-slate-900 truncate block">
              {restaurantName}
            </span>
          </div>

          <div className="flex items-center gap-3 shrink-0">
            <span className="text-xs font-mono font-semibold text-slate-700 whitespace-nowrap">
              Table {table.number}
            </span>
            <span
              className={`inline-flex items-center gap-1 text-xs font-medium ${
                socketLive ? 'text-emerald-700' : 'text-amber-600'
              }`}
            >
              {socketLive ? <Wifi className="w-3.5 h-3.5" /> : <WifiOff className="w-3.5 h-3.5" />}
              <span className="hidden sm:inline">{socketLive ? 'Live' : 'Syncing'}</span>
            </span>
            <button
              type="button"
              onClick={() => setCallDrawerOpen(true)}
              className="min-h-[40px] px-3.5 py-2 rounded-lg bg-slate-900 text-white text-xs font-semibold hover:bg-slate-800 inline-flex items-center gap-1.5 whitespace-nowrap"
            >
              <BellRing className="w-3.5 h-3.5" />
              Call Waiter
            </button>
          </div>
        </div>
      </header>

      <div className="max-w-7xl mx-auto px-4 lg:px-8 pt-6 grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
        {/* Main Menu + Live Trackers */}
        <div className="lg:col-span-8 space-y-6">
          {/* Quick Service Call Chips */}
          <section className="bg-white border border-slate-200 rounded-xl p-4 sm:p-5">
            <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
              <div>
                <h1 className="text-lg font-bold text-slate-900">
                  Welcome to {table.name}
                </h1>
                <p className="text-xs text-slate-500">
                  {table.section} · Orders are added to your open table tab automatically
                </p>
              </div>
              <Link
                to="/login"
                className="text-xs text-slate-500 hover:text-slate-900 underline underline-offset-2"
              >
                Staff Portal
              </Link>
            </div>

            <div className="flex flex-wrap items-center gap-2 pt-2 border-t border-slate-100">
              <span className="text-xs font-medium text-slate-500 mr-1">Quick request:</span>
              {['water', 'napkins', 'bill', 'waiter'].map((type) => (
                <button
                  key={type}
                  type="button"
                  disabled={sendingCall}
                  onClick={() => handleServiceCall(type)}
                  className="min-h-[38px] px-3 py-1.5 rounded-lg border border-slate-200 bg-slate-50 hover:bg-teal-50 hover:border-teal-600 text-xs font-medium text-slate-700 hover:text-teal-900 transition-colors whitespace-nowrap"
                >
                  {type === 'water'
                    ? 'Water'
                    : type === 'napkins'
                      ? 'Napkins'
                      : type === 'bill'
                        ? 'Request Bill'
                        : 'Call Waiter'}
                </button>
              ))}
              <button
                type="button"
                onClick={() => setCallDrawerOpen(true)}
                className="min-h-[38px] px-3 py-1.5 rounded-lg border border-slate-200 bg-white hover:bg-slate-100 text-xs font-medium text-slate-700 whitespace-nowrap"
              >
                Other...
              </button>
            </div>

            {/* Active Service Calls Status */}
            {calls.length > 0 && (
              <div className="mt-4 pt-3 border-t border-slate-100 space-y-2">
                {calls.map((c) => (
                  <div
                    key={c.id}
                    className="flex items-center justify-between gap-3 text-xs bg-slate-50 border border-slate-200 rounded-lg px-3 py-2"
                  >
                    <div className="min-w-0">
                      <span className="font-semibold text-slate-900">{CALL_TYPE_LABEL[c.type]}</span>
                      <span className="text-slate-400 mx-1.5">·</span>
                      <span className="text-slate-600">{c.message}</span>
                    </div>
                    <span
                      className={`font-semibold whitespace-nowrap shrink-0 ${
                        c.status === 'acknowledged' ? 'text-teal-700' : 'text-amber-700'
                      }`}
                    >
                      {c.status === 'acknowledged'
                        ? `On the way (${c.acknowledgedByName || 'Waiter'})`
                        : 'Sent to staff'}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </section>

          {/* Live Order Tracker */}
          {orders.length > 0 && (
            <section className="bg-white border border-slate-200 rounded-xl p-4 sm:p-5 space-y-4">
              <div className="flex items-center justify-between">
                <h2 className="text-sm font-bold text-slate-900">Your Active Table Orders</h2>
                <span className="text-xs font-mono text-slate-500 tabular-nums">
                  Open Tab: {formatCurrency(orders.reduce((s, o) => s + o.total, 0))}
                </span>
              </div>

              <div className="space-y-4 divide-y divide-slate-100">
                {orders.map((order) => {
                  const normalizedStep =
                    order.status === 'accepted' ? 'pending' : order.status;
                  const stepIdx = PROGRESS_STEPS.indexOf(normalizedStep);

                  return (
                    <div key={order.id} className="pt-3 first:pt-0">
                      <div className="flex items-center justify-between gap-2 mb-2.5">
                        <div className="flex items-center gap-2 text-xs">
                          <span className="font-mono font-semibold text-slate-900">
                            {order.orderNumber}
                          </span>
                          <span className="text-slate-400">·</span>
                          <span className="text-slate-500">{formatTimeShort(order.createdAt)}</span>
                        </div>
                        <span className="text-xs font-semibold text-teal-800">
                          {ORDER_STATUS_LABEL[order.status]}
                        </span>
                      </div>

                      {/* 4-step live progression */}
                      <div className="grid grid-cols-4 gap-1.5 mb-3">
                        {PROGRESS_STEPS.map((step, i) => {
                          const reached = stepIdx >= i;
                          return (
                            <div key={step} className="space-y-1">
                              <div
                                className={`h-1.5 rounded-full transition-colors ${
                                  reached ? 'bg-teal-600' : 'bg-slate-200'
                                }`}
                              />
                              <span
                                className={`text-[11px] block capitalize ${
                                  reached ? 'font-semibold text-slate-900' : 'text-slate-400'
                                }`}
                              >
                                {step}
                              </span>
                            </div>
                          );
                        })}
                      </div>

                      <ul className="text-xs text-slate-600 space-y-1">
                        {order.items.map((it, idx) => (
                          <li key={idx} className="flex items-center justify-between gap-2">
                            <span>
                              <strong className="font-mono text-slate-900">{it.qty}×</strong>{' '}
                              {it.name}
                              {it.notes && <span className="text-slate-400"> — {it.notes}</span>}
                            </span>
                            <span className="text-[11px] font-medium text-slate-500 capitalize">
                              {it.status}
                            </span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  );
                })}
              </div>
            </section>
          )}

          {/* Search & Category Tabs */}
          <div className="space-y-3">
            <div className="flex flex-col sm:flex-row gap-2.5">
              <div className="relative flex-1">
                <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
                <input
                  type="search"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Search dishes, ingredients..."
                  aria-label="Search menu"
                  className="w-full min-h-[44px] pl-10 pr-4 rounded-xl border border-slate-200 bg-white text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-teal-600"
                />
              </div>
              <button
                type="button"
                onClick={() => setVegOnly((v) => !v)}
                className={`min-h-[44px] px-4 rounded-xl border text-xs font-semibold inline-flex items-center justify-center gap-1.5 whitespace-nowrap transition-colors ${
                  vegOnly
                    ? 'bg-emerald-700 border-emerald-700 text-white'
                    : 'bg-white border-slate-200 text-slate-700 hover:bg-slate-100'
                }`}
              >
                <Leaf className="w-3.5 h-3.5" />
                Vegetarian Only
              </button>
            </div>

            <div className="flex items-center gap-1.5 overflow-x-auto pb-1">
              <button
                type="button"
                onClick={() => setSelectedCategory('all')}
                className={`min-h-[40px] px-3.5 py-2 rounded-lg text-xs font-semibold transition-colors whitespace-nowrap shrink-0 ${
                  selectedCategory === 'all'
                    ? 'bg-slate-900 text-white'
                    : 'bg-white border border-slate-200 text-slate-600 hover:text-slate-900'
                }`}
              >
                All Menu ({menuItems.length})
              </button>
              {categories.map((cat) => (
                <button
                  key={cat.id}
                  type="button"
                  onClick={() => setSelectedCategory(cat.id)}
                  className={`min-h-[40px] px-3.5 py-2 rounded-lg text-xs font-semibold transition-colors whitespace-nowrap shrink-0 ${
                    selectedCategory === cat.id
                      ? 'bg-slate-900 text-white'
                      : 'bg-white border border-slate-200 text-slate-600 hover:text-slate-900'
                  }`}
                >
                  {cat.name}
                </button>
              ))}
            </div>
          </div>

          {/* Menu Sections Grouped by Category */}
          {groupedByCategory.length === 0 ? (
            <div className="bg-white border border-slate-200 rounded-xl p-10 text-center text-sm text-slate-500">
              No dishes match your current filter.
            </div>
          ) : (
            groupedByCategory.map(({ category, items }) => (
              <section key={category.id} className="space-y-3">
                <div className="flex items-baseline justify-between border-b border-slate-200 pb-2">
                  <h2 className="text-lg font-bold text-slate-900">{category.name}</h2>
                  <span className="text-xs text-slate-500">{items.length} dishes</span>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {items.map((item) => {
                    const inCart = cart[item.id];
                    return (
                      <article
                        key={item.id}
                        className={`bg-white border rounded-xl overflow-hidden flex flex-col transition-colors ${
                          item.isAvailable
                            ? 'border-slate-200 hover:border-slate-300'
                            : 'border-slate-200 opacity-70'
                        }`}
                      >
                        <div className="relative">
                          <DishImage
                            src={item.imageUrl}
                            alt={item.name}
                            className={`w-full h-44 ${!item.isAvailable ? 'grayscale' : ''}`}
                          />
                          {!item.isAvailable && (
                            <div className="absolute inset-0 bg-slate-950/55 flex items-center justify-center">
                              <span className="px-3 py-1 rounded bg-slate-950 text-white text-xs font-semibold tracking-wide">
                                Unavailable
                              </span>
                            </div>
                          )}
                        </div>

                        <div className="p-4 flex-1 flex flex-col justify-between gap-3">
                          <div>
                            <div className="flex items-start justify-between gap-2">
                              <h3 className="text-sm font-bold text-slate-900 leading-snug">
                                {item.name}
                              </h3>
                              <span className="text-sm font-mono font-bold text-slate-900 tabular-nums shrink-0">
                                {formatCurrency(item.price)}
                              </span>
                            </div>

                            <p className="mt-1.5 text-xs text-slate-600 leading-relaxed">
                              {item.description}
                            </p>

                            {/* Clean unboxed inline metadata with typographic separators */}
                            <div className="mt-2.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-[11px] text-slate-500">
                              <span
                                className={`inline-flex items-center gap-1 font-medium ${
                                  item.isVeg ? 'text-emerald-700' : 'text-rose-700'
                                }`}
                              >
                                <span
                                  className={`w-2 h-2 rounded-xs border ${
                                    item.isVeg
                                      ? 'border-emerald-700 bg-emerald-600'
                                      : 'border-rose-700 bg-rose-600'
                                  }`}
                                  aria-hidden="true"
                                />
                                {item.isVeg ? 'Veg' : 'Non-Veg'}
                              </span>
                              {item.spiceLevel !== 'none' && (
                                <>
                                  <span aria-hidden="true">·</span>
                                  <span className="inline-flex items-center gap-0.5 text-amber-700 font-medium capitalize">
                                    <Flame className="w-3 h-3" />
                                    {item.spiceLevel}
                                  </span>
                                </>
                              )}
                              <span aria-hidden="true">·</span>
                              <span className="inline-flex items-center gap-0.5">
                                <Clock className="w-3 h-3" />
                                {item.prepTimeMinutes}m
                              </span>
                              {item.allergens.length > 0 && (
                                <>
                                  <span aria-hidden="true">·</span>
                                  <span>Contains {item.allergens.join(', ')}</span>
                                </>
                              )}
                            </div>
                          </div>

                          <div className="pt-2 border-t border-slate-100 flex items-center justify-end">
                            {!item.isAvailable ? (
                              <button
                                type="button"
                                disabled
                                className="min-h-[40px] px-4 py-2 rounded-lg bg-slate-100 text-slate-400 text-xs font-semibold cursor-not-allowed"
                              >
                                Unavailable
                              </button>
                            ) : inCart ? (
                              <div className="inline-flex items-center border border-teal-700 rounded-lg overflow-hidden">
                                <button
                                  type="button"
                                  onClick={() => updateCartQty(item.id, -1)}
                                  aria-label={`Remove one ${item.name}`}
                                  className="w-10 h-10 flex items-center justify-center text-teal-800 hover:bg-teal-50"
                                >
                                  <Minus className="w-3.5 h-3.5" />
                                </button>
                                <span className="w-8 text-center text-xs font-mono font-bold text-slate-900 tabular-nums">
                                  {inCart.qty}
                                </span>
                                <button
                                  type="button"
                                  onClick={() => updateCartQty(item.id, 1)}
                                  aria-label={`Add one more ${item.name}`}
                                  className="w-10 h-10 flex items-center justify-center text-teal-800 hover:bg-teal-50"
                                >
                                  <Plus className="w-3.5 h-3.5" />
                                </button>
                              </div>
                            ) : (
                              <button
                                type="button"
                                onClick={() => addToCart(item)}
                                aria-label={`Add ${item.name} to order`}
                                className="min-h-[40px] px-4 py-2 rounded-lg bg-teal-700 text-white text-xs font-semibold hover:bg-teal-800 inline-flex items-center gap-1.5 transition-colors"
                              >
                                <Plus className="w-3.5 h-3.5" />
                                Add to Order
                              </button>
                            )}
                          </div>
                        </div>
                      </article>
                    );
                  })}
                </div>
              </section>
            ))
          )}
        </div>

        {/* Desktop Sticky Cart Column */}
        <aside className="hidden lg:block lg:col-span-4 sticky top-20 bg-white border border-slate-200 rounded-xl p-5 max-h-[calc(100vh-6.5rem)] overflow-hidden">
          {cartPanelContent}
        </aside>
      </div>

      {/* Mobile Compact Bottom Cart Bar */}
      {cartCount > 0 && (
        <div className="lg:hidden fixed bottom-0 left-0 right-0 z-30 p-3 bg-white/95 backdrop-blur-xs border-t border-slate-200">
          <button
            type="button"
            onClick={() => setCartOpen(true)}
            className="w-full min-h-[48px] px-4 py-3 rounded-xl bg-teal-700 text-white text-sm font-semibold flex items-center justify-between shadow-lg"
          >
            <span className="inline-flex items-center gap-2">
              <ShoppingBag className="w-4 h-4" />
              View Order ({cartCount})
            </span>
            <span className="inline-flex items-center gap-1 font-mono tabular-nums">
              {formatCurrency(cartTotal)}
              <ChevronUp className="w-4 h-4" />
            </span>
          </button>
        </div>
      )}

      {/* Mobile Cart Sheet */}
      {cartOpen && (
        <div className="lg:hidden fixed inset-0 z-50 bg-slate-950/50 flex items-end">
          <div className="w-full bg-white rounded-t-2xl p-5 max-h-[85vh] overflow-y-auto">
            {cartPanelContent}
          </div>
        </div>
      )}

      {/* Call Waiter Modal */}
      {callDrawerOpen && (
        <div
          className="fixed inset-0 z-50 bg-slate-950/50 flex items-end sm:items-center justify-center p-0 sm:p-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby="call-waiter-title"
        >
          <div className="bg-white rounded-t-2xl sm:rounded-xl w-full max-w-md p-6 border border-slate-200">
            <div className="flex items-center justify-between mb-4">
              <div>
                <h2 id="call-waiter-title" className="text-base font-bold text-slate-900">
                  Call Server — Table {table.number}
                </h2>
                <p className="text-xs text-slate-500">Tap a quick request or send a note</p>
              </div>
              <button
                type="button"
                onClick={() => setCallDrawerOpen(false)}
                aria-label="Close service call dialog"
                className="p-2 rounded-lg text-slate-500 hover:bg-slate-100"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="grid grid-cols-2 gap-2.5 mb-4">
              {[
                { type: 'waiter', label: 'Waiter Assistance' },
                { type: 'water', label: 'Water Refill' },
                { type: 'napkins', label: 'Fresh Napkins' },
                { type: 'bill', label: 'Bring the Bill' },
              ].map((opt) => (
                <button
                  key={opt.type}
                  type="button"
                  disabled={sendingCall}
                  onClick={() => handleServiceCall(opt.type)}
                  className="min-h-[44px] px-3 py-2.5 rounded-lg border border-slate-200 bg-slate-50 hover:bg-teal-50 hover:border-teal-600 text-xs font-semibold text-slate-800 transition-colors"
                >
                  {opt.label}
                </button>
              ))}
            </div>

            <div className="space-y-2.5">
              <label htmlFor="custom-call-note" className="block text-xs font-medium text-slate-700">
                Or send a specific note
              </label>
              <input
                id="custom-call-note"
                type="text"
                value={customCallMsg}
                onChange={(e) => setCustomCallMsg(e.target.value)}
                placeholder="e.g., Extra cutlery, high chair, allergy question..."
                className="w-full min-h-[44px] px-3.5 py-2 rounded-lg border border-slate-300 text-sm focus:outline-none focus:ring-2 focus:ring-teal-600"
              />
              <button
                type="button"
                disabled={sendingCall}
                onClick={() => handleServiceCall('other', customCallMsg)}
                className="w-full min-h-[44px] py-2.5 px-4 rounded-lg bg-teal-700 text-white text-sm font-semibold hover:bg-teal-800 inline-flex items-center justify-center gap-2"
              >
                <CheckCircle2 className="w-4 h-4" />
                {sendingCall ? 'Notifying...' : 'Send Request to Server'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
