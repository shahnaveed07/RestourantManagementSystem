import React, { useEffect, useState, useCallback, useMemo, useRef } from 'react';
import { useSearchParams } from 'react-router-dom';
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
import { createRealtimeSocket } from '../utils/realtimeSocket';
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
  getOrderSourceMeta,
  ORDER_STATUS_LABEL,
} from '../utils/format';

const HERO_IMAGE = '/src/assets/images/hero_dining_room_1795178823770.jpg';

export function HomePage() {
  const { user, config } = useAuth();
  const {
    cart,
    cartCount,
    total,
    selectedTable,
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

  // Real-time menu availability & live customer/table order updates
  const hasConnectedOnceRef = useRef(false);
  useEffect(() => {
    const s = createRealtimeSocket({
      mode: user ? 'customer' : 'guest',
      tableId: selectedTable?.id || '',
    });

    const onConnect = () => {
      if (selectedTable?.id) s.emit('guest:watchTable', selectedTable.id);
      if (hasConnectedOnceRef.current) {
        loadMenu();
      } else {
        hasConnectedOnceRef.current = true;
      }
    };

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

    const onOrderCreated = (order) => {
      if (!user) return;
      const oid = order.id || order.orderId;
      setMyOrders((prev) => (prev.some((o) => o.id === oid) ? prev : [{ ...order, id: oid }, ...prev]));
    };

    const onOrderUpdated = (order) => {
      if (!user) return;
      const oid = order.id || order.orderId;
      setMyOrders((prev) => {
        const exists = prev.some((o) => o.id === oid);
        if (!exists) return prev;
        return prev.map((o) => (o.id === oid ? { ...o, ...order, id: oid } : o));
      });
    };

    const onOrderCancelled = (order) => {
      if (!user) return;
      const oid = order.id || order.orderId;
      setMyOrders((prev) =>
        prev.map((o) => (o.id === oid ? { ...o, status: 'cancelled' } : o))
      );
    };

    s.on('connect', onConnect);
    s.on('menu:itemAvailabilityChanged', onAvailabilityChanged);
    s.on('menu:updated', onMenuUpdated);
    s.on('order:created', onOrderCreated);
    s.on('order:updated', onOrderUpdated);
    s.on('order:cancelled', onOrderCancelled);

    return () => {
      s.off('connect', onConnect);
      s.off('menu:itemAvailabilityChanged', onAvailabilityChanged);
      s.off('menu:updated', onMenuUpdated);
      s.off('order:created', onOrderCreated);
      s.off('order:updated', onOrderUpdated);
      s.off('order:cancelled', onOrderCancelled);
      s.disconnect();
    };
  }, [loadMenu, syncMenuAvailability, user, selectedTable?.id]);

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
        <div className="relative bg-gradient-to-r from-slate-950/90 via-slate-950/70 to-slate-950/40">
          <div className="compact-hero-inner max-w-7xl mx-auto px-3 sm:px-6 lg:px-8 py-3 sm:py-8 md:py-12 lg:py-16">
            <div className="max-w-2xl">
              <p className="text-[11px] sm:text-sm font-medium text-teal-300 tracking-wide mb-0.5 sm:mb-2">
                Wood-Fired Kitchen &amp; Craft Drinks
              </p>
              <h1 className="compact-hero-title text-xl sm:text-3xl md:text-4xl lg:text-5xl font-bold tracking-tight leading-tight">
                {config.restaurantName}
              </h1>
              <p className="compact-hero-sub mt-1 sm:mt-3 text-xs sm:text-base text-slate-200 leading-snug sm:leading-relaxed max-w-xl line-clamp-2 sm:line-clamp-none">
                Seasonal small plates, hand-rolled pasta, sourdough flatbreads, and zero-proof botanicals—browse the full menu and build your order in seconds.
              </p>
              <div className="compact-hero-cta mt-2.5 sm:mt-6 flex flex-wrap items-center gap-3 sm:gap-4">
                <a
                  href="#menu-catalog"
                  className="min-h-[44px] px-3.5 sm:px-5 py-2 sm:py-2.5 rounded-xl bg-teal-600 hover:bg-teal-500 text-white text-xs sm:text-sm font-semibold inline-flex items-center gap-1.5 sm:gap-2 transition-colors whitespace-nowrap"
                >
                  Browse Menu
                  <ArrowDown className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
                </a>
                <span className="hidden sm:inline text-xs text-slate-300">
                  Open daily · Order straight to your dining table
                </span>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Main Menu Catalog */}
      <main
        id="menu-catalog"
        className="flex-1 max-w-7xl w-full mx-auto px-3 sm:px-6 lg:px-8 py-3 sm:py-8 pb-24 space-y-4 sm:space-y-6"
      >
        {/* Search & Category Filter Controls */}
        <div className="space-y-2 sm:space-y-3">
          <div className="flex flex-row items-center sm:justify-between gap-2 sm:gap-3">
            <div className="relative flex-1 min-w-0 sm:max-w-md">
              <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
              <input
                type="search"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search dishes..."
                aria-label="Search dishes"
                className="w-full min-h-[44px] pl-9 pr-3 rounded-xl border border-slate-200 bg-white text-base sm:text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-teal-600"
              />
            </div>

            <button
              type="button"
              onClick={() => setVegOnly((v) => !v)}
              aria-pressed={vegOnly}
              aria-label="Vegetarian only filter"
              className={`min-h-[44px] px-3 sm:px-4 rounded-xl border text-xs sm:text-sm font-semibold inline-flex items-center justify-center gap-1.5 sm:gap-2 whitespace-nowrap transition-colors shrink-0 ${
                vegOnly
                  ? 'bg-emerald-700 border-emerald-700 text-white'
                  : 'bg-white border-slate-200 text-slate-700 hover:bg-slate-100'
              }`}
            >
              <Leaf className="w-4 h-4" />
              <span className="sm:hidden">Veg</span>
              <span className="hidden sm:inline">Vegetarian Only</span>
            </button>
          </div>

          {/* Category Filter Tabs: horizontally scrollable on mobile, wrap on lg+ */}
          <div
            className="flex flex-nowrap lg:flex-wrap items-center gap-1.5 sm:gap-2 overflow-x-auto snap-x snap-mandatory no-scrollbar pb-0.5 sm:pb-1"
            role="tablist"
            aria-label="Menu categories"
          >
            <button
              type="button"
              role="tab"
              aria-selected={selectedCategory === 'all'}
              onClick={() => setSelectedCategory('all')}
              className={`snap-start min-h-[44px] px-3 sm:px-4 py-1.5 sm:py-2 rounded-xl text-xs sm:text-sm font-semibold transition-colors whitespace-nowrap shrink-0 ${
                selectedCategory === 'all'
                  ? 'bg-slate-900 text-white'
                  : 'bg-white border border-slate-200 text-slate-700 hover:bg-slate-100'
              }`}
            >
              All ({menuItems.length})
            </button>
            {categories.map((cat) => (
              <button
                key={cat.id}
                type="button"
                role="tab"
                aria-selected={selectedCategory === cat.id}
                onClick={() => setSelectedCategory(cat.id)}
                className={`snap-start min-h-[44px] px-3 sm:px-4 py-1.5 sm:py-2 rounded-xl text-xs sm:text-sm font-semibold transition-colors whitespace-nowrap shrink-0 ${
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
            className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-2.5 sm:gap-5"
          >
            {Array.from({ length: 8 }).map((_, idx) => (
              <div
                key={idx}
                className="bg-white border border-slate-200 rounded-xl overflow-hidden flex flex-row sm:flex-col animate-pulse"
              >
                <div className="w-24 h-24 m-2.5 sm:m-0 sm:w-full sm:h-48 rounded-lg sm:rounded-none bg-slate-200 shrink-0" />
                <div className="p-2.5 sm:p-4 flex-1 space-y-2.5">
                  <div className="flex justify-between gap-4">
                    <div className="h-4 bg-slate-200 rounded w-2/3" />
                    <div className="h-4 bg-slate-200 rounded w-12" />
                  </div>
                  <div className="h-3 bg-slate-200 rounded w-full" />
                  <div className="pt-1">
                    <div className="h-10 bg-slate-200 rounded-lg w-24 sm:w-full ml-auto" />
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
          <div className="space-y-6 sm:space-y-10">
            {groupedByCategory.map(({ category, items }) => (
              <section key={category.id} className="space-y-2.5 sm:space-y-4">
                <div className="flex items-baseline justify-between border-b border-slate-200 pb-1.5 sm:pb-2.5">
                  <h2 className="text-base sm:text-xl font-bold text-slate-900">{category.name}</h2>
                  <span className="text-[11px] sm:text-xs font-medium text-slate-500 tabular-nums">
                    {items.length} dish{items.length === 1 ? '' : 'es'}
                  </span>
                </div>

                {/* Compact horizontal cards on <sm, 2/3/4-column vertical cards on sm+ */}
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-2.5 sm:gap-5">
                  {items.map((item) => {
                    const inCart = cart[item.id];
                    return (
                      <article
                        key={item.id}
                        className={`bg-white border rounded-xl overflow-hidden flex flex-row sm:flex-col transition-all ${
                          item.isAvailable
                            ? 'border-slate-200 hover:border-slate-300 hover-lift'
                            : 'border-slate-200 opacity-75'
                        }`}
                      >
                        <div className="relative overflow-hidden w-20 h-20 sm:w-full sm:h-auto shrink-0 self-center m-2.5 sm:m-0 rounded-lg sm:rounded-none">
                          <DishImage
                            src={item.imageUrl}
                            alt={item.name}
                            className={`w-full h-full sm:aspect-[4/3] ${!item.isAvailable ? 'grayscale' : ''}`}
                          />
                          {!item.isAvailable && (
                            <div className="absolute inset-0 bg-slate-950/60 flex items-center justify-center">
                              <span className="px-2 py-0.5 sm:px-3 sm:py-1 rounded bg-slate-950 text-white text-[10px] sm:text-xs font-semibold tracking-wide">
                                Unavailable
                              </span>
                            </div>
                          )}
                        </div>

                        <div className="py-2 pr-2.5 pl-0 sm:p-4 flex-1 min-w-0 flex flex-col justify-between gap-1 sm:gap-4">
                          <div className="min-w-0">
                            <div className="flex items-start justify-between gap-2">
                              <h3 className="text-sm sm:text-base font-semibold text-slate-900 leading-snug line-clamp-1 sm:line-clamp-none">
                                {item.name}
                              </h3>
                              <span className="text-xs sm:text-sm font-mono font-bold text-slate-900 tabular-nums shrink-0 pt-0.5">
                                {formatCurrency(item.price)}
                              </span>
                            </div>

                            <p className="mt-0.5 sm:mt-1.5 text-xs sm:text-sm text-slate-600 leading-snug sm:leading-relaxed line-clamp-1 sm:line-clamp-2">
                              {item.description}
                            </p>

                            {/* Unboxed metadata row (visible on sm+, compact inline on mobile below) */}
                            <div className="hidden sm:flex mt-3 flex-wrap items-center gap-x-2 gap-y-1 text-xs text-slate-500">
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

                          <div className="pt-1 sm:pt-3 sm:border-t sm:border-slate-100 flex items-center justify-between sm:justify-end gap-2">
                            {/* Compact mobile metadata inline with action button */}
                            <div className="flex sm:hidden items-center gap-1.5 text-[11px] text-slate-500 min-w-0 truncate">
                              <span
                                className={`inline-flex items-center gap-1 font-medium shrink-0 ${
                                  item.isVeg ? 'text-emerald-700' : 'text-rose-700'
                                }`}
                              >
                                <span
                                  className={`w-2 h-2 rounded-xs border flex items-center justify-center ${
                                    item.isVeg ? 'border-emerald-700' : 'border-rose-700'
                                  }`}
                                  aria-hidden="true"
                                >
                                  <span
                                    className={`w-1 h-1 rounded-full ${
                                      item.isVeg ? 'bg-emerald-600' : 'bg-rose-600'
                                    }`}
                                  />
                                </span>
                                {item.isVeg ? 'Veg' : 'Non-Veg'}
                              </span>
                              <span aria-hidden="true">·</span>
                              <span className="inline-flex items-center gap-0.5 shrink-0">
                                <Clock className="w-3 h-3" />
                                {item.prepTimeMinutes}m
                              </span>
                            </div>

                            {!item.isAvailable ? (
                              <button
                                type="button"
                                disabled
                                className="sm:w-full min-h-[44px] px-3 sm:px-4 py-1.5 sm:py-2 rounded-lg bg-slate-100 text-slate-400 text-xs sm:text-sm font-semibold cursor-not-allowed shrink-0"
                              >
                                Unavailable
                              </button>
                            ) : inCart ? (
                              <div className="sm:w-full inline-flex items-center justify-between border border-teal-700 rounded-lg overflow-hidden bg-teal-50/40 shrink-0">
                                <button
                                  type="button"
                                  onClick={() => updateQty(item.id, -1)}
                                  aria-label={`Remove one ${item.name}`}
                                  className="min-w-[44px] min-h-[44px] flex items-center justify-center text-teal-800 hover:bg-teal-100"
                                >
                                  <Minus className="w-4 h-4" />
                                </button>
                                <span className="px-1.5 sm:px-0 text-xs sm:text-sm font-mono font-bold text-slate-900 tabular-nums">
                                  {inCart.qty}
                                  <span className="hidden sm:inline"> in cart</span>
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
                                className="sm:w-full min-h-[44px] px-3.5 sm:px-4 py-1.5 sm:py-2 rounded-lg bg-teal-700 text-white text-xs sm:text-sm font-semibold hover:bg-teal-800 inline-flex items-center justify-center gap-1 sm:gap-1.5 transition-colors shrink-0"
                              >
                                <Plus className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
                                <span className="sm:hidden">Add</span>
                                <span className="hidden sm:inline">Add to cart</span>
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

      {/* Floating Cart Button: compact bottom bar on mobile with safe-area padding, fixed bottom-4 right-4 on desktop */}
      {cartCount > 0 && (
        <div className="fixed bottom-0 left-0 right-0 md:bottom-4 md:right-4 md:left-auto z-30 bg-white/95 md:bg-transparent backdrop-blur-xs md:backdrop-blur-none border-t border-slate-200 md:border-t-0 px-3 pt-2 safe-bottom-bar md:p-0">
          <button
            type="button"
            onClick={() => setCartOpen(true)}
            aria-label={`Open floating cart with ${cartCount} items totaling ${formatCurrency(total)}`}
            className="w-full md:w-auto min-h-[44px] sm:min-h-[48px] px-4 sm:px-5 py-2 sm:py-3 rounded-xl bg-slate-900 hover:bg-slate-800 text-white text-xs sm:text-sm font-semibold shadow-xl flex items-center justify-between md:justify-center gap-4 transition-colors"
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
                myOrders.map((order) => {
                  const srcMeta = getOrderSourceMeta(order.source);
                  return (
                  <div
                    key={order.id}
                    className="border border-slate-200 rounded-xl p-4 space-y-2"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex flex-wrap items-center gap-1.5">
                        <span className="text-sm font-mono font-bold text-slate-900">
                          {order.orderNumber}
                        </span>
                        <span className="text-xs text-slate-500">
                          {formatOrderLocation(order)} · {formatTimeShort(order.createdAt)}
                        </span>
                        <span className={`px-1.5 py-0.5 rounded border text-[10px] font-semibold ${srcMeta.className}`}>
                          {srcMeta.label}
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
                  );
                })
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
