import React, { useState } from 'react';
import { NavLink, useNavigate } from 'react-router-dom';
import {
  LayoutDashboard,
  ClipboardList,
  BellRing,
  Grid2x2,
  UtensilsCrossed,
  ChefHat,
  ConciergeBell,
  Receipt,
  BarChart3,
  Users,
  FlaskConical,
  LogOut,
  Menu as MenuIcon,
  X,
  Volume2,
  VolumeX,
  Wifi,
  WifiOff,
  RefreshCw,
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { useSocket } from '../context/SocketContext';
import { ROLE_LABELS } from '../utils/format';
import { BrandLogo } from './BrandLogo';

export function Layout({ title, subtitle, actions, darkMode = false, children }) {
  const { user, config, logout } = useAuth();
  const {
    connectionState,
    pendingOrdersCount,
    openCallsCount,
    callFlashActive,
    soundEnabled,
    setSoundEnabled,
  } = useSocket();
  const navigate = useNavigate();
  const [mobileOpen, setMobileOpen] = useState(false);

  if (!user) return null;

  const allNavItems = [
    { to: '/dashboard', label: 'Overview', icon: LayoutDashboard, roles: ['admin', 'manager'] },
    {
      to: '/orders',
      label: 'Live Orders',
      icon: ClipboardList,
      roles: ['admin', 'manager', 'waiter'],
      badge: pendingOrdersCount,
    },
    {
      to: '/calls',
      label: 'Live Calls',
      icon: BellRing,
      roles: ['admin', 'manager', 'waiter'],
      badge: openCallsCount,
    },
    { to: '/tables', label: 'Tables & QR', icon: Grid2x2, roles: ['admin', 'manager', 'waiter'] },
    { to: '/menu', label: 'Menu', icon: UtensilsCrossed, roles: ['admin', 'manager'] },
    { to: '/kitchen', label: 'Kitchen Display', icon: ChefHat, roles: ['admin', 'manager', 'kitchen'] },
    { to: '/waiter', label: 'Waiter Floor', icon: ConciergeBell, roles: ['admin', 'manager', 'waiter'] },
    { to: '/billing', label: 'Billing', icon: Receipt, roles: ['admin', 'manager', 'waiter'] },
    { to: '/reports', label: 'Reports', icon: BarChart3, roles: ['admin', 'manager'] },
    { to: '/staff', label: 'Staff & Audit', icon: Users, roles: ['admin'] },
    { to: '/demo-tools', label: 'Demo Tools', icon: FlaskConical, roles: ['admin'], demoOnly: true },
  ];

  const navItems = allNavItems.filter((item) => {
    if (!item.roles.includes(user.role)) return false;
    if (item.demoOnly && !config.demoMode) return false;
    return true;
  });

  const handleLogout = async () => {
    await logout();
    navigate('/login');
  };

  const sidebarContent = (
    <div
      className={`flex flex-col h-full ${
        darkMode
          ? 'bg-slate-950 text-slate-100 border-r border-slate-800'
          : 'bg-white text-slate-900 border-r border-slate-200'
      }`}
    >
      <div className="px-4 py-4 border-b border-inherit flex items-center justify-between gap-2">
        <div className="flex items-center gap-3 min-w-0">
          <BrandLogo size="md" />
          <div className="min-w-0">
            <span className="text-sm font-bold tracking-tight block truncate">{config.restaurantName}</span>
            <span className={`text-xs block truncate ${darkMode ? 'text-slate-400' : 'text-slate-500'}`}>
              Passline Operations
            </span>
          </div>
        </div>
        <button
          type="button"
          onClick={() => setMobileOpen(false)}
          aria-label="Close navigation menu"
          className="lg:hidden p-1.5 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800"
        >
          <X className="w-4 h-4" />
        </button>
      </div>

      <nav className="flex-1 overflow-y-auto px-3 py-4 space-y-1" aria-label="Primary navigation">
        {navItems.map((item) => {
          const Icon = item.icon;
          return (
            <NavLink
              key={item.to}
              to={item.to}
              onClick={() => setMobileOpen(false)}
              className={({ isActive }) =>
                `flex items-center justify-between px-3 py-2.5 rounded-lg text-sm font-medium transition-colors whitespace-nowrap ${
                  isActive
                    ? darkMode
                      ? 'bg-teal-600/20 text-teal-300'
                      : 'bg-teal-50 text-teal-800'
                    : darkMode
                      ? 'text-slate-300 hover:bg-slate-900 hover:text-white'
                      : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'
                }`
              }
            >
              <span className="flex items-center gap-3 min-w-0">
                <Icon className="w-4 h-4 shrink-0" />
                <span className="truncate">{item.label}</span>
              </span>
              {typeof item.badge === 'number' && item.badge > 0 && (
                <span
                  className={`ml-2 text-xs font-mono font-semibold tabular-nums px-1.5 py-0.5 rounded ${
                    item.to === '/calls'
                      ? 'bg-red-600 text-white'
                      : 'bg-teal-700 text-white'
                  }`}
                >
                  {item.badge}
                </span>
              )}
            </NavLink>
          );
        })}
      </nav>

      <div className="p-4 border-t border-inherit">
        <div className="flex items-center justify-between gap-2 mb-3">
          <div className="min-w-0">
            <p className="text-sm font-medium truncate">{user.name}</p>
            <p className={`text-xs truncate ${darkMode ? 'text-slate-400' : 'text-slate-500'}`}>
              {ROLE_LABELS[user.role]} · {user.email}
            </p>
          </div>
        </div>
        <button
          type="button"
          onClick={handleLogout}
          className={`w-full px-3 py-2 rounded-lg text-xs font-medium inline-flex items-center justify-center gap-2 transition-colors ${
            darkMode
              ? 'border border-slate-700 text-slate-300 hover:bg-slate-900'
              : 'border border-slate-200 text-slate-700 hover:bg-slate-50'
          }`}
        >
          <LogOut className="w-3.5 h-3.5" />
          Sign Out
        </button>
      </div>
    </div>
  );

  return (
    <div
      className={`min-h-screen flex ${
        darkMode ? 'bg-slate-950 text-slate-100' : 'bg-slate-50 text-slate-900'
      }`}
    >
      {/* Desktop Sidebar */}
      <aside className="hidden lg:block w-60 shrink-0 sticky top-0 h-screen no-print">
        {sidebarContent}
      </aside>

      {/* Mobile Sidebar Drawer */}
      {mobileOpen && (
        <div className="fixed inset-0 z-50 lg:hidden flex no-print">
          <div className="w-64 max-w-[82vw] h-full shadow-2xl">{sidebarContent}</div>
          <button
            type="button"
            aria-label="Close navigation backdrop"
            className="flex-1 bg-slate-950/50"
            onClick={() => setMobileOpen(false)}
          />
        </div>
      )}

      {/* Main Content */}
      <div className="flex-1 min-w-0 flex flex-col">
        {config.demoMode && (
          <div className="bg-amber-50 border-b border-amber-200 px-4 lg:px-6 py-1.5 flex items-center justify-between gap-3 text-xs text-amber-900 no-print">
            <span>
              <strong className="font-semibold">DEMO MODE</strong> — Seeded restaurant environment active with live simulation tools.
            </span>
            {user.role === 'admin' && (
              <NavLink
                to="/demo-tools"
                className="font-semibold underline underline-offset-2 hover:text-amber-950 whitespace-nowrap shrink-0"
              >
                Open Demo Tools
              </NavLink>
            )}
          </div>
        )}

        <header
          className={`sticky top-0 z-30 px-4 lg:px-8 py-3.5 border-b flex items-center justify-between gap-4 no-print ${
            callFlashActive ? 'animate-call-flash' : ''
          } ${
            darkMode
              ? 'bg-slate-950/95 border-slate-800 backdrop-blur-xs'
              : 'bg-white/95 border-slate-200 backdrop-blur-xs'
          }`}
        >
          <div className="flex items-center gap-3 min-w-0">
            <button
              type="button"
              onClick={() => setMobileOpen(true)}
              aria-label="Open navigation menu"
              className={`lg:hidden p-2 rounded-lg ${
                darkMode ? 'text-slate-300 hover:bg-slate-800' : 'text-slate-600 hover:bg-slate-100'
              }`}
            >
              <MenuIcon className="w-5 h-5" />
            </button>
            <div className="min-w-0">
              <h1 className="text-lg font-bold tracking-tight truncate">{title}</h1>
              {subtitle && (
                <p className={`text-xs truncate ${darkMode ? 'text-slate-400' : 'text-slate-500'}`}>
                  {subtitle}
                </p>
              )}
            </div>
          </div>

          <div className="flex items-center gap-3 shrink-0">
            <div
              className={`inline-flex items-center gap-1.5 text-xs font-medium whitespace-nowrap ${
                connectionState === 'live'
                  ? darkMode
                    ? 'text-emerald-400'
                    : 'text-emerald-700'
                  : connectionState === 'reconnecting'
                    ? 'text-amber-600'
                    : 'text-red-600'
              }`}
              title="Real-time WebSocket connection status"
            >
              {connectionState === 'live' && <Wifi className="w-3.5 h-3.5" />}
              {connectionState === 'reconnecting' && <RefreshCw className="w-3.5 h-3.5 animate-spin" />}
              {connectionState === 'offline' && <WifiOff className="w-3.5 h-3.5" />}
              <span>
                {connectionState === 'live'
                  ? 'Live'
                  : connectionState === 'reconnecting'
                    ? 'Reconnecting'
                    : 'Offline'}
              </span>
            </div>

            <button
              type="button"
              onClick={() => setSoundEnabled(!soundEnabled)}
              aria-label={soundEnabled ? 'Mute alert chimes' : 'Enable alert chimes'}
              title={soundEnabled ? 'Mute alert chimes' : 'Enable alert chimes'}
              className={`p-2 rounded-lg transition-colors ${
                darkMode
                  ? 'text-slate-300 hover:bg-slate-800'
                  : 'text-slate-600 hover:bg-slate-100'
              }`}
            >
              {soundEnabled ? <Volume2 className="w-4 h-4" /> : <VolumeX className="w-4 h-4" />}
            </button>

            {actions}
          </div>
        </header>

        <main className="flex-1 p-4 lg:p-8 max-w-[1440px] w-full mx-auto">{children}</main>
      </div>
    </div>
  );
}
