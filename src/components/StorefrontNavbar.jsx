import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { Menu, X, ShoppingBag, LogOut, LayoutDashboard, ClipboardList } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { useCart } from '../context/CartContext';
import { ROLE_HOME_ROUTE, ROLE_LABELS, formatCurrency } from '../utils/format';
import { BrandLogo } from './BrandLogo';

export function StorefrontNavbar({ onOpenAuth, onOpenMyOrders }) {
  const { user, config, logout } = useAuth();
  const { cartCount, total, setCartOpen } = useCart();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  const isStaff = user && ['admin', 'manager', 'waiter', 'kitchen'].includes(user.role);
  const firstDemoTable = config.demoTables?.[0];

  const handleLogout = async () => {
    await logout();
    setMobileMenuOpen(false);
  };

  return (
    <header className="sticky top-0 z-40 bg-white/95 backdrop-blur-xs border-b border-slate-200">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between gap-2 sm:gap-4 lg:gap-8">
        {/* Zone 1: Brand Wordmark */}
        <Link
          to="/"
          className="flex items-center gap-2 sm:gap-2.5 min-w-0 shrink-0"
          aria-label={`${config.restaurantName} Home`}
        >
          <BrandLogo size="sm" />
          <span className="text-base sm:text-lg font-bold tracking-tight text-slate-900 whitespace-nowrap">
            {config.restaurantName}
          </span>
        </Link>

        {/* Zone 2: Desktop Navigation Links */}
        <nav
          className="hidden md:flex items-center gap-3 lg:gap-6 text-sm font-medium text-slate-600 min-w-0"
          aria-label="Primary navigation"
        >
          <a
            href="#menu-catalog"
            className="hover:text-slate-900 transition-colors whitespace-nowrap shrink-0"
          >
            Menu
          </a>
          {firstDemoTable && (
            <Link
              to={`/t/${firstDemoTable.qrToken}`}
              className="hover:text-slate-900 transition-colors whitespace-nowrap shrink-0"
            >
              <span className="lg:hidden">QR Menu</span>
              <span className="hidden lg:inline">Table QR Demo</span>
            </Link>
          )}
          {user && (
            <button
              type="button"
              onClick={onOpenMyOrders}
              className="hover:text-slate-900 transition-colors whitespace-nowrap shrink-0"
            >
              My Orders
            </button>
          )}
          {isStaff && (
            <Link
              to={ROLE_HOME_ROUTE[user.role]}
              className="text-teal-700 hover:text-teal-900 transition-colors whitespace-nowrap shrink-0"
            >
              <span className="lg:hidden">Workspace</span>
              <span className="hidden lg:inline">Staff Workspace</span>
            </Link>
          )}
          {!user && (
            <Link
              to="/login"
              className="hover:text-slate-900 transition-colors whitespace-nowrap shrink-0"
            >
              Login
            </Link>
          )}
        </nav>

        {/* Zone 3: Desktop Actions & Mobile Hamburger */}
        <div className="flex items-center gap-2 lg:gap-3 shrink-0">
          {user && (
            <div className="hidden md:flex items-center gap-2 lg:gap-3">
              <span className="hidden lg:inline text-xs font-medium text-slate-600 whitespace-nowrap max-w-[140px] truncate">
                {user.name}
              </span>
              <button
                type="button"
                onClick={handleLogout}
                className="min-h-[40px] px-2.5 lg:px-3 py-2 rounded-lg border border-slate-200 text-xs font-medium text-slate-700 hover:bg-slate-50 inline-flex items-center gap-1.5 whitespace-nowrap"
              >
                <LogOut className="w-3.5 h-3.5" />
                Sign Out
              </button>
            </div>
          )}

          <button
            type="button"
            onClick={() => setCartOpen(true)}
            aria-label={`Open cart with ${cartCount} items`}
            className="min-h-[44px] min-w-[44px] px-3 lg:px-4 py-2 rounded-xl bg-teal-700 text-white text-xs sm:text-sm font-semibold hover:bg-teal-800 transition-colors inline-flex items-center justify-center gap-1.5 sm:gap-2 whitespace-nowrap shrink-0"
          >
            <ShoppingBag className="w-4 h-4 shrink-0" />
            <span>Cart ({cartCount})</span>
            {cartCount > 0 && (
              <span className="hidden lg:inline font-mono tabular-nums">
                · {formatCurrency(total)}
              </span>
            )}
          </button>

          <button
            type="button"
            onClick={() => setMobileMenuOpen((v) => !v)}
            aria-label={mobileMenuOpen ? 'Close navigation menu' : 'Open navigation menu'}
            aria-expanded={mobileMenuOpen}
            className="md:hidden min-w-[44px] min-h-[44px] flex items-center justify-center rounded-xl border border-slate-200 text-slate-700 hover:bg-slate-100"
          >
            {mobileMenuOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
          </button>
        </div>
      </div>

      {/* Mobile Hamburger Drawer */}
      {mobileMenuOpen && (
        <nav
          aria-label="Mobile navigation"
          className="md:hidden border-t border-slate-200 bg-white px-4 py-3 space-y-1.5 shadow-lg"
        >
          <a
            href="#menu-catalog"
            onClick={() => setMobileMenuOpen(false)}
            className="min-h-[44px] px-3 rounded-lg flex items-center text-sm font-medium text-slate-800 hover:bg-slate-50"
          >
            Menu
          </a>
          {firstDemoTable && (
            <Link
              to={`/t/${firstDemoTable.qrToken}`}
              onClick={() => setMobileMenuOpen(false)}
              className="min-h-[44px] px-3 rounded-lg flex items-center text-sm font-medium text-slate-800 hover:bg-slate-50"
            >
              Table QR Menu Demo
            </Link>
          )}
          {user && (
            <button
              type="button"
              onClick={() => {
                setMobileMenuOpen(false);
                onOpenMyOrders();
              }}
              className="w-full min-h-[44px] px-3 rounded-lg flex items-center gap-2 text-sm font-medium text-slate-800 hover:bg-slate-50 text-left"
            >
              <ClipboardList className="w-4 h-4 text-slate-500" />
              My Orders
            </button>
          )}
          {isStaff && (
            <Link
              to={ROLE_HOME_ROUTE[user.role]}
              onClick={() => setMobileMenuOpen(false)}
              className="min-h-[44px] px-3 rounded-lg flex items-center gap-2 text-sm font-semibold text-teal-800 hover:bg-teal-50"
            >
              <LayoutDashboard className="w-4 h-4" />
              Staff Workspace ({ROLE_LABELS[user.role]})
            </Link>
          )}

          <div className="pt-2 mt-2 border-t border-slate-100 flex flex-col gap-2">
            {user ? (
              <div className="flex items-center justify-between px-3 py-1">
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-slate-900 truncate">{user.name}</p>
                  <p className="text-xs text-slate-500 truncate">{user.email}</p>
                </div>
                <button
                  type="button"
                  onClick={handleLogout}
                  className="min-h-[44px] px-3.5 rounded-lg border border-slate-200 text-xs font-semibold text-slate-700 hover:bg-slate-50 inline-flex items-center gap-1.5 shrink-0"
                >
                  <LogOut className="w-3.5 h-3.5" />
                  Sign Out
                </button>
              </div>
            ) : (
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => {
                    setMobileMenuOpen(false);
                    onOpenAuth('login');
                  }}
                  className="min-h-[44px] px-4 rounded-xl border border-slate-300 text-sm font-semibold text-slate-800 hover:bg-slate-50"
                >
                  Log In
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setMobileMenuOpen(false);
                    onOpenAuth('signup');
                  }}
                  className="min-h-[44px] px-4 rounded-xl bg-teal-700 text-white text-sm font-semibold hover:bg-teal-800"
                >
                  Sign Up
                </button>
              </div>
            )}
          </div>
        </nav>
      )}
    </header>
  );
}
