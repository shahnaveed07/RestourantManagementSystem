import React, { useEffect, useState, useCallback, useMemo, useRef } from 'react';
import { useSearchParams } from 'react-router-dom';
import { io } from 'socket.io-client';
import toast from 'react-hot-toast';
import {
  Search,
  ShoppingBag,
  Plus,
  Minus,
  Flame,
  Clock,
  Leaf,
  ArrowDown,
  X,
  RefreshCw,
} from 'lucide-react';
import { api } from '../api/client';
import { useAuth } from '../context/AuthContext';
import { useCart } from '../context/CartContext';
import { StorefrontNavbar } from '../components/StorefrontNavbar';
import { CartDrawer } from '../components/CartDrawer';
import { AuthModal } from '../components/AuthModal';
import { DishImage } from '../components/DishImage';
import { useModalA11y } from '../utils/useModalA11y';
import {
  formatCurrency,
  formatOrderLocation,
  formatTimeShort,
  ORDER_STATUS_LABEL,
} from '../utils/format';

const HERO_IMAGE = '/src/assets/images/hero_dining_room_1795178823770.jpg';

export function HomePage() {
  const { user, config } = useAuth();
  const {
    cart,
    cartCount,
    total,
    setCartOpen,
    addToCart,
    updateQty,
    syncMenuAvailability,
  } = useCart();
  const [searchParams, setSearchParams] = useSearchParams();

  const [categories, setCategories] = useState([]);
  const [menuItems, setMenuItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const [selectedCategory, setSelectedCategory] = useState('all');
  const [search, setSearch] = useState('');
  const [vegOnly, setVegOnly] = useState(false);

  const [authModalOpen, setAuthModalOpen] = useState(false);
  const [authModalMode, setAuthModalMode] = useState('login');
  const [authFromCheckout, setAuthFromCheckout] = useState(false);

  const [myOrdersOpen, setMyOrdersOpen] = useState(false);
  const [myOrders, setMyOrders] = useState([]);
  const [loadingOrders, setLoadingOrders] = useState(false);
  const myOrdersRef = useRef(null);

  useModalA11y(myOrdersOpen, () => setMyOrdersOpen(false), myOrdersRef);

  const loadMenu = useCallback(async () => {
    try {
      const data = await api.getMenu();
      const activeCats = (data.categories || []).filter((c) => c.isActive !== false);
      setCategories(activeCats);
      setMenuItems(data.items || []);
      syncMenuAvailability(data.items || []);
      setError(null);
    } catch (err) {
      setError(err.message || 'Unable to load menu right now.');
    } finally {
      setLoading(false);
    }
  }, [syncMenuAvailability]);

  useEffect(() => {
    loadMenu();
  }, [loadMenu]);

  // Re-open cart automatically if returning from /login?redirect=/?checkout=1
  useEffect(() => {
    if (searchParams.get('checkout') === '1') {
      setCartOpen(true);
      searchParams.delete('checkout');
      setSearchParams(searchParams, { replace: true });
    }
  }, [searchParams, setSearchParams, setCartOpen]);

  // Real-time menu availability updates so sold-out dishes lock immediately
  useEffect(() => {
    const s = io(window.location.origin, {
      auth: { mode: 'guest' },
      reconnection: true,
    });

    const onAvailabilityChanged = (updatedItem) => {
      setMenuItems((prev) => {
        const next = prev.map((m) => (m.id === updatedItem.id ? updatedItem : m));
        syncMenuAvailability(next);
        return next;
      });
    };

    const onMenuUpdated = () => {
      loadMenu();
    };

    s.on('menu:itemAvailabilityChanged', onAvailabilityChanged);
    s.on('menu:updated', onMenuUpdated);

    return () => {
      s.off('menu:itemAvailabilityChanged', onAvailabilityChanged);
      s.off('menu:updated', onMenuUpdated);
      s.disconnect();
    };
  }, [loadMenu, syncMenuAvailability]);

  const loadMyOrders = useCallback(async () => {
    if (!user) return;
    setLoadingOrders(true);
    try {
      const list = await api.listOrders();
      setMyOrders(list || []);
    } catch (err) {
      toast.error(err.message);
    } finally {
      setLoadingOrders(false);
    }
  }, [user]);

  useEffect(() => {
    if (myOrdersOpen && user) {
      loadMyOrders();
    }
  }, [myOrdersOpen, user, loadMyOrders]);

  const filteredItems = useMemo(() => {
    const q = search.trim().toLowerCase();
    return menuItems.filter((item) => {
      if (selectedCategory !== 'all' && item.categoryId !== selectedCategory) return false;
      if (vegOnly && !item.isVeg) return false;
      if (
        q &&
        !item.name.toLowerCase().includes(q) &&
        !item.description.toLowerCase().includes(q)
      ) {
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

  const openAuthModal = (mode = 'login', fromCheckout = false) => {
    setAuthModalMode(mode);
    setAuthFromCheckout(fromCheckout);
    setAuthModalOpen(true);
  };

  const handleAuthSuccess = () => {
    setAuthModalOpen(false);
    if (authFromCheckout) {
      setAuthFromCheckout(false);
      setCartOpen(true);
    }
  };

  return (
    <div className="min-h-dvh bg-slate-50 text-slate-900 flex flex-col">
      <StorefrontNavbar
        onOpenAuth={(mode) => openAuthModal(mode, false)}
        onOpenMyOrders={() => setMyOrdersOpen(true)}
      />

      {/* Storefront Hero Banner */}
      <section className="relative bg-slate-900 text-white overflow-hidden">
        <img
          src={HERO_IMAGE}
          alt={`${config.restaurantName} wood-fired dining room`}
          referrerPolicy="no-referrer"
          className="absolute inset-0 w-full h-full object-cover"
        />
        <div className="relative bg-gradient-to-r from-slate-950/90 via-slate-950/65 to-slate-950/35">
          <div className="max-w-7xl mx-auto px-4 md:px-6 lg:px-8 py-10 sm:py-16 lg:py-20">
            <div className="max-w-2xl">
              <p className="text-xs sm:text-sm font-medium text-teal-300 tracking-wide mb-2">
                Wood-Fired Kitchen &amp; Craft Drinks
              </p>
              <h1 className="text-2xl sm:text-4xl lg:text-5xl font-bold tracking-tight leading-tight">
                {config.restaurantName}
              </h1>
              <p className="mt-3 text-sm sm:text-base text-slate-200 leading-relaxed max-w-xl">
                Seasonal small plates, hand-rolled pasta, sourdough flatbreads, and zero-proof botanicals—browse the full menu and build your order in seconds.
              </p>
              <div className="mt-6 flex flex-wrap items-center gap-4">
                <a
                  href="#menu-catalog"
                  className="min-h-[44px] px-5 py-2.5 rounded-xl bg-teal-600 hover:bg-teal-500 text-white text-sm font-semibold inline-flex items-center gap-2 transition-colors whitespace-nowrap"
                >
                  Browse Full Menu
                  <ArrowDown className="w-4 h-4" />
                </a>
                <span className="text-xs text-slate-300">
                  Open daily · Dine-in &amp; Counter Pickup
                </span>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Main Menu Catalog */}
      <main
        id="menu-catalog"
        className="flex-1 max-w-7xl w-full mx-auto px-4 md:px-6 lg:px-8 py-6 sm:py-8 pb-28 md:pb-24 space-y-6"
      >
        {/* Search & Category Filter Controls */}
        <div className="space-y-3">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
            <div className="relative w-full sm:max-w-md">
              <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
              <input
                type="search"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search dishes, ingredients..."
                aria-label="Search dishes"
                className="w-full min-h-[44px] pl-10 pr-4 rounded-xl border border-slate-200 bg-white text-base sm:text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-teal-600"
              />
            </div>

            <button
              type="button"
              onClick={() => setVegOnly((v) => !v)}
              aria-pressed={vegOnly}
              className={`min-h-[44px] px-4 rounded-xl border text-xs sm:text-sm font-semibold inline-flex items-center justify-center gap-2 whitespace-nowrap transition-colors shrink-0 ${
                vegOnly
                  ? 'bg-emerald-700 border-emerald-700 text-white'
                  : 'bg-white border-slate-200 text-slate-700 hover:bg-slate-100'
              }`}
            >
              <Leaf className="w-4 h-4" />
              Vegetarian Only
            </button>
          </div>

          {/* Category Filter Tabs: horizontally scrollable on mobile, wrap on lg+ */}
          <div
            className="flex flex-nowrap lg:flex-wrap items-center gap-2 overflow-x-auto snap-x snap-mandatory no-scrollbar pb-1"
            role="tablist"
            aria-label="Menu categories"
          >
            <button
              type="button"
              role="tab"
              aria-selected={selectedCategory === 'all'}
              onClick={() => setSelectedCategory('all')}
              className={`snap-start min-h-[44px] px-4 py-2 rounded-xl text-xs sm:text-sm font-semibold transition-colors whitespace-nowrap shrink-0 ${
                selectedCategory === 'all'
                  ? 'bg-slate-900 text-white'
                  : 'bg-white border border-slate-200 text-slate-700 hover:bg-slate-100'
              }`}
            >
              All Menu ({menuItems.length})
            </button>
            {categories.map((cat) => (
              <button
                key={cat.id}
                type="button"
                role="tab"
                aria-selected={selectedCategory === cat.id}
                onClick={() => setSelectedCategory(cat.id)}
                className={`snap-start min-h-[44px] px-4 py-2 rounded-xl text-xs sm:text-sm font-semibold transition-colors whitespace-nowrap shrink-0 ${
                  selectedCategory === cat.id
                    ? 'bg-slate-900 text-white'
                    : 'bg-white border border-slate-200 text-slate-700 hover:bg-slate-100'
                }`}
              >
                {cat.name}
              </button>
            ))}
          </div>
        </div>

        {/* Loading Skeleton / Error / Menu Grid */}
        {loading ? (
          <div
            aria-label="Loading menu"
            className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-5"
          >
            {Array.from({ length: 8 }).map((_, idx) => (
              <div
                key={idx}
                className="bg-white border border-slate-200 rounded-xl overflow-hidden animate-pulse"
              >
                <div className="h-48 bg-slate-200" />
                <div className="p-4 space-y-3">
                  <div className="flex justify-between gap-4">
                    <div className="h-4 bg-slate-200 rounded w-2/3" />
                    <div className="h-4 bg-slate-200 rounded w-14" />
                  </div>
                  <div className="h-3 bg-slate-200 rounded w-full" />
                  <div className="h-3 bg-slate-200 rounded w-4/5" />
                  <div className="pt-2">
                    <div className="h-11 bg-slate-200 rounded-lg w-full" />
                  </div>
                </div>
              </div>
            ))}
          </div>
        ) : error ? (
          <div className="bg-white border border-red-200 rounded-xl p-8 text-center space-y-3">
            <p className="text-sm font-semibold text-red-800">{error}</p>
            <button
              type="button"
              onClick={loadMenu}
              className="min-h-[44px] px-4 py-2 rounded-lg bg-slate-900 text-white text-xs font-semibold inline-flex items-center gap-2 hover:bg-slate-800"
            >
              <RefreshCw className="w-4 h-4" />
              Retry
            </button>
          </div>
        ) : groupedByCategory.length === 0 ? (
          <div className="bg-white border border-slate-200 rounded-xl p-10 text-center space-y-3">
            <p className="text-sm font-medium text-slate-600">
              No dishes match your current search or dietary filter.
            </p>
            {(search || vegOnly || selectedCategory !== 'all') && (
              <button
                type="button"
                onClick={() => {
                  setSearch('');
                  setVegOnly(false);
                  setSelectedCategory('all');
                }}
                className="min-h-[44px] px-4 py-2 rounded-lg border border-slate-300 text-xs font-semibold text-slate-700 hover:bg-slate-50"
              >
                Reset Filters
              </button>
            )}
          </div>
        ) : (
          <div className="space-y-10">
            {groupedByCategory.map(({ category, items }) => (
              <section key={category.id} className="space-y-4">
                <div className="flex items-baseline justify-between border-b border-slate-200 pb-2.5">
                  <h2 className="text-xl font-bold text-slate-900">{category.name}</h2>
                  <span className="text-xs font-medium text-slate-500 tabular-nums">
                    {items.length} dish{items.length === 1 ? '' : 'es'}
                  </span>
                </div>

                {/* Responsive CSS Grid: 1 col (<640), 2 cols (sm-lg), 3 cols (lg), 4 cols (xl) */}
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-5">
                  {items.map((item) => {
                    const inCart = cart[item.id];
                    return (
                      <article
                        key={item.id}
                        className={`bg-white border rounded-xl overflow-hidden flex flex-col transition-all ${
                          item.isAvailable
                            ? 'border-slate-200 hover:border-slate-300 hover-lift'
                            : 'border-slate-200 opacity-75'
                        }`}
                      >
                        <div className="relative overflow-hidden">
                          <DishImage
                            src={item.imageUrl}
                            alt={item.name}
                            className={`w-full aspect-[4/3] ${!item.isAvailable ? 'grayscale' : ''}`}
                          />
                          {!item.isAvailable && (
                            <div className="absolute inset-0 bg-slate-950/60 flex items-center justify-center">
                              <span className="px-3 py-1 rounded bg-slate-950 text-white text-xs font-semibold tracking-wide">
                                Unavailable
                              </span>
                            </div>
                          )}
                        </div>

                        <div className="p-4 flex-1 flex flex-col justify-between gap-4">
                          <div>
                            <div className="flex items-start justify-between gap-2">
                              <h3 className="text-base font-semibold text-slate-900 leading-snug">
                                {item.name}
                              </h3>
                              <span className="text-sm font-mono font-bold text-slate-900 tabular-nums shrink-0 pt-0.5">
                                {formatCurrency(item.price)}
                              </span>
                            </div>

                            <p className="mt-1.5 text-xs sm:text-sm text-slate-600 leading-relaxed line-clamp-2">
                              {item.description}
                            </p>

                            {/* Unboxed metadata row */}
                            <div className="mt-3 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-slate-500">
                              <span
                                className={`inline-flex items-center gap-1.5 font-medium ${
                                  item.isVeg ? 'text-emerald-700' : 'text-rose-700'
                                }`}
                              >
                                <span
                                  className={`w-2.5 h-2.5 rounded-xs border flex items-center justify-center ${
                                    item.isVeg ? 'border-emerald-700' : 'border-rose-700'
                                  }`}
                                  aria-hidden="true"
                                >
                                  <span
                                    className={`w-1.5 h-1.5 rounded-full ${
                                      item.isVeg ? 'bg-emerald-600' : 'bg-rose-600'
                                    }`}
                                  />
                                </span>
                                {item.isVeg ? 'Veg' : 'Non-Veg'}
                              </span>

                              {item.spiceLevel && item.spiceLevel !== 'none' && (
                                <>
                                  <span aria-hidden="true">·</span>
                                  <span className="inline-flex items-center gap-0.5 text-amber-700 font-medium capitalize">
                                    <Flame className="w-3.5 h-3.5" />
                                    {item.spiceLevel}
                                  </span>
                                </>
                              )}

                              <span aria-hidden="true">·</span>
                              <span className="inline-flex items-center gap-1">
                                <Clock className="w-3.5 h-3.5" />
                                {item.prepTimeMinutes}m
                              </span>
                            </div>
                          </div>

                          <div className="pt-3 border-t border-slate-100 flex items-center justify-end">
                            {!item.isAvailable ? (
                              <button
                                type="button"
                                disabled
                                className="w-full min-h-[44px] px-4 py-2 rounded-lg bg-slate-100 text-slate-400 text-xs sm:text-sm font-semibold cursor-not-allowed"
                              >
                                Unavailable
                              </button>
                            ) : inCart ? (
                              <div className="w-full inline-flex items-center justify-between border border-teal-700 rounded-lg overflow-hidden bg-teal-50/40">
                                <button
                                  type="button"
                                  onClick={() => updateQty(item.id, -1)}
                                  aria-label={`Remove one ${item.name}`}
                                  className="min-w-[44px] min-h-[44px] flex items-center justify-center text-teal-800 hover:bg-teal-100"
                                >
                                  <Minus className="w-4 h-4" />
                                </button>
                                <span className="text-xs sm:text-sm font-mono font-bold text-slate-900 tabular-nums">
                                  {inCart.qty} in cart
                                </span>
                                <button
                                  type="button"
                                  onClick={() => updateQty(item.id, 1)}
                                  aria-label={`Add one more ${item.name}`}
                                  className="min-w-[44px] min-h-[44px] flex items-center justify-center text-teal-800 hover:bg-teal-100"
                                >
                                  <Plus className="w-4 h-4" />
                                </button>
                              </div>
                            ) : (
                              <button
                                type="button"
                                onClick={() => addToCart(item)}
                                aria-label={`Add ${item.name} to cart`}
                                className="w-full min-h-[44px] px-4 py-2 rounded-lg bg-teal-700 text-white text-xs sm:text-sm font-semibold hover:bg-teal-800 inline-flex items-center justify-center gap-1.5 transition-colors"
                              >
                                <Plus className="w-4 h-4" />
                                Add to cart
                              </button>
                            )}
                          </div>
                        </div>
                      </article>
                    );
                  })}
                </div>
              </section>
            ))}
          </div>
        )}
      </main>

      {/* Floating Cart Button: sticky bottom bar on mobile with safe-area padding, fixed bottom-4 right-4 on desktop */}
      {cartCount > 0 && (
        <div className="fixed bottom-0 left-0 right-0 md:bottom-4 md:right-4 md:left-auto z-30 bg-white/95 md:bg-transparent backdrop-blur-xs md:backdrop-blur-none border-t border-slate-200 md:border-t-0 px-4 pt-2.5 safe-bottom-bar md:p-0">
          <button
            type="button"
            onClick={() => setCartOpen(true)}
            aria-label={`Open floating cart with ${cartCount} items totaling ${formatCurrency(total)}`}
            className="w-full md:w-auto min-h-[48px] px-5 py-3 rounded-xl bg-slate-900 hover:bg-slate-800 text-white text-sm font-semibold shadow-xl flex items-center justify-between md:justify-center gap-4 transition-colors"
          >
            <span className="inline-flex items-center gap-2">
              <ShoppingBag className="w-4 h-4 text-teal-300" />
              <span>
                View Cart ({cartCount} item{cartCount === 1 ? '' : 's'})
              </span>
            </span>
            <span className="font-mono font-bold tabular-nums text-teal-300">
              {formatCurrency(total)}
            </span>
          </button>
        </div>
      )}

      {/* Responsive Cart Sheet / Side Drawer */}
      <CartDrawer
        onRequireAuth={() => openAuthModal('login', true)}
        onOrderPlaced={() => {
          if (user) loadMyOrders();
        }}
      />

      {/* Responsive Login / Sign Up Modal */}
      <AuthModal
        open={authModalOpen}
        initialMode={authModalMode}
        subtitle={
          authFromCheckout
            ? 'Sign in or create an account to place your order'
            : undefined
        }
        onClose={() => {
          setAuthModalOpen(false);
          setAuthFromCheckout(false);
        }}
        onSuccess={handleAuthSuccess}
      />

      {/* Customer Order History Drawer */}
      {myOrdersOpen && (
        <div
          className="fixed inset-0 z-50 bg-slate-950/60 flex items-end md:items-center justify-center p-0 md:p-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby="my-orders-title"
        >
          <div
            ref={myOrdersRef}
            className="bg-white w-full md:max-w-lg rounded-t-2xl md:rounded-2xl max-h-[85dvh] flex flex-col border border-slate-200 shadow-2xl safe-bottom-bar md:pb-0"
          >
            <div className="px-5 py-4 border-b border-slate-200 flex items-center justify-between">
              <div>
                <h2 id="my-orders-title" className="text-base font-bold text-slate-900">
                  My Orders
                </h2>
                <p className="text-xs text-slate-500">Live kitchen status for your recent orders</p>
              </div>
              <button
                type="button"
                onClick={() => setMyOrdersOpen(false)}
                aria-label="Close my orders"
                className="min-w-[44px] min-h-[44px] flex items-center justify-center rounded-lg text-slate-500 hover:bg-slate-100"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="p-5 overflow-y-auto space-y-3 flex-1">
              {loadingOrders ? (
                <p className="text-sm text-slate-500 py-8 text-center">Loading your orders...</p>
              ) : myOrders.length === 0 ? (
                <p className="text-sm text-slate-500 py-8 text-center">
                  You have not placed any orders yet.
                </p>
              ) : (
                myOrders.map((order) => (
                  <div
                    key={order.id}
                    className="border border-slate-200 rounded-xl p-4 space-y-2"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <div>
                        <span className="text-sm font-mono font-bold text-slate-900">
                          {order.orderNumber}
                        </span>
                        <span className="text-xs text-slate-500 ml-2">
                          {formatOrderLocation(order)} · {formatTimeShort(order.createdAt)}
                        </span>
                      </div>
                      <span className="text-xs font-semibold text-teal-800">
                        {ORDER_STATUS_LABEL[order.status] || order.status}
                      </span>
                    </div>
                    <ul className="text-xs text-slate-600 space-y-1">
                      {order.items.map((it, idx) => (
                        <li key={idx} className="flex justify-between">
                          <span>
                            <strong className="font-mono text-slate-900">{it.qty}×</strong>{' '}
                            {it.name}
                          </span>
                          <span className="font-mono tabular-nums">
                            {formatCurrency(it.price * it.qty)}
                          </span>
                        </li>
                      ))}
                    </ul>
                    <div className="pt-2 border-t border-slate-100 flex justify-between text-xs font-bold text-slate-900">
                      <span>Total</span>
                      <span className="font-mono tabular-nums">{formatCurrency(order.total)}</span>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
