import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { QrCode, ArrowRight, ShieldCheck, UtensilsCrossed, ChefHat, ConciergeBell } from 'lucide-react';
import toast from 'react-hot-toast';
import { useAuth } from '../context/AuthContext';
import { ROLE_HOME_ROUTE } from '../utils/format';
import type { UserRole } from '../types';

const HERO_IMAGE = '/src/assets/images/hero_dining_room_1795178823770.jpg';

const DEMO_ROLES: Array<{
  role: UserRole;
  title: string;
  email: string;
  summary: string;
  icon: React.ComponentType<{ className?: string }>;
}> = [
  {
    role: 'admin',
    title: 'Admin',
    email: 'admin@demo.com',
    summary: 'Full access, staff, QR codes & demo tools',
    icon: ShieldCheck,
  },
  {
    role: 'manager',
    title: 'Manager',
    email: 'manager@demo.com',
    summary: 'Overview, orders, calls, menu & reports',
    icon: UtensilsCrossed,
  },
  {
    role: 'waiter',
    title: 'Waiter',
    email: 'waiter@demo.com',
    summary: 'Floor tables, calls, manual orders & billing',
    icon: ConciergeBell,
  },
  {
    role: 'kitchen',
    title: 'Kitchen',
    email: 'kitchen@demo.com',
    summary: 'High-contrast kitchen ticket display',
    icon: ChefHat,
  },
];

export function LoginPage() {
  const { config, login, demoLogin } = useAuth();
  const navigate = useNavigate();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (!email.trim() || !password) {
      setError('Please enter both your email and password.');
      return;
    }
    setSubmitting(true);
    try {
      const user = await login(email.trim(), password);
      toast.success(`Signed in as ${user.name}`);
      navigate(ROLE_HOME_ROUTE[user.role], { replace: true });
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setSubmitting(false);
    }
  };

  const handleDemoRole = async (role: UserRole) => {
    setError(null);
    setSubmitting(true);
    try {
      const user = await demoLogin(role);
      toast.success(`Signed in as ${user.name} (${role})`);
      navigate(ROLE_HOME_ROUTE[user.role], { replace: true });
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col">
      {config.demoMode && (
        <div className="bg-amber-50 border-b border-amber-200 px-6 py-2 text-center text-xs text-amber-900">
          <strong className="font-semibold">DEMO MODE</strong> — Instant role sign-in and guest QR table menus are active.
        </div>
      )}

      <div className="flex-1 grid grid-cols-1 lg:grid-cols-12 items-stretch">
        {/* Left Editorial Photography Column */}
        <div className="hidden lg:flex lg:col-span-6 relative bg-slate-900 overflow-hidden">
          <img
            src={HERO_IMAGE}
            alt="Linden & Rye dining room and open kitchen pass"
            referrerPolicy="no-referrer"
            className="w-full h-full object-cover"
          />
          <div className="absolute inset-0 bg-gradient-to-t from-slate-950/85 via-slate-950/35 to-slate-950/20 flex flex-col justify-between p-12 text-white">
            <div>
              <span className="text-sm font-semibold tracking-tight text-teal-300">Passline</span>
            </div>
            <div className="max-w-md">
              <h1 className="text-4xl font-bold tracking-tight leading-tight">
                {config.restaurantName}
              </h1>
              <p className="mt-3 text-sm text-slate-200 leading-relaxed">
                Synchronized dining room floor, QR-code guest ordering, live service calls, kitchen display, and table billing in one calm workspace.
              </p>
              <div className="mt-6 pt-6 border-t border-white/20 flex items-center gap-6 text-xs text-slate-300">
                <span>12 Dining Tables</span>
                <span aria-hidden="true">·</span>
                <span>Real-Time Socket Sync</span>
                <span aria-hidden="true">·</span>
                <span>Role-Based Access</span>
              </div>
            </div>
          </div>
        </div>

        {/* Right Sign-In & Demo Column */}
        <div className="lg:col-span-6 flex items-center justify-center p-6 sm:p-10 lg:p-14">
          <div className="w-full max-w-md">
            <div className="mb-8">
              <span className="text-xs font-semibold text-teal-700 lg:hidden block mb-1">
                Passline · {config.restaurantName}
              </span>
              <h2 className="text-2xl font-bold text-slate-900 tracking-tight">Staff Sign In</h2>
              <p className="mt-1.5 text-sm text-slate-600">
                Sign in with your staff credentials or launch a seeded role below.
              </p>
            </div>

            <form onSubmit={handleSubmit} className="space-y-4 bg-white border border-slate-200 rounded-xl p-6">
              {error && (
                <div
                  role="alert"
                  className="p-3 rounded-lg bg-red-50 border border-red-200 text-xs text-red-700 font-medium"
                >
                  {error}
                </div>
              )}

              <div>
                <label htmlFor="login-email" className="block text-xs font-medium text-slate-700 mb-1.5">
                  Work Email
                </label>
                <input
                  id="login-email"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="admin@demo.com"
                  autoComplete="email"
                  className="w-full px-3.5 py-2.5 rounded-lg border border-slate-300 bg-white text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-teal-600 focus:border-teal-600"
                />
              </div>

              <div>
                <label htmlFor="login-password" className="block text-xs font-medium text-slate-700 mb-1.5">
                  Password
                </label>
                <input
                  id="login-password"
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Enter password"
                  autoComplete="current-password"
                  className="w-full px-3.5 py-2.5 rounded-lg border border-slate-300 bg-white text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-teal-600 focus:border-teal-600"
                />
              </div>

              <button
                type="submit"
                disabled={submitting}
                className="w-full py-2.5 px-4 rounded-lg bg-teal-700 text-white text-sm font-semibold hover:bg-teal-800 disabled:opacity-60 transition-colors inline-flex items-center justify-center gap-2"
              >
                {submitting ? 'Signing in...' : 'Sign In'}
                <ArrowRight className="w-4 h-4" />
              </button>
            </form>

            {config.demoMode && (
              <div className="mt-7">
                <div className="flex items-center justify-between mb-3">
                  <h3 className="text-sm font-semibold text-slate-900">One-Click Demo Access</h3>
                  <span className="text-xs text-slate-500">Seeded accounts</span>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                  {DEMO_ROLES.map((item) => {
                    const Icon = item.icon;
                    return (
                      <button
                        key={item.role}
                        type="button"
                        disabled={submitting}
                        onClick={() => handleDemoRole(item.role)}
                        className="text-left p-3.5 rounded-xl bg-white border border-slate-200 hover:border-teal-600 hover:bg-teal-50/40 transition-colors group"
                      >
                        <div className="flex items-center justify-between mb-1">
                          <span className="text-sm font-semibold text-slate-900 group-hover:text-teal-800">
                            {item.title}
                          </span>
                          <Icon className="w-4 h-4 text-slate-400 group-hover:text-teal-700" />
                        </div>
                        <p className="text-xs text-slate-500 leading-snug">{item.summary}</p>
                      </button>
                    );
                  })}
                </div>

                {config.demoTables.length > 0 && (
                  <div className="mt-5 pt-5 border-t border-slate-200">
                    <div className="flex items-center gap-2 text-xs font-medium text-slate-700 mb-2.5">
                      <QrCode className="w-3.5 h-3.5 text-teal-700" />
                      <span>Preview Guest QR Table Menu (no login required)</span>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      {config.demoTables.slice(0, 4).map((t) => (
                        <Link
                          key={t.qrToken}
                          to={`/t/${t.qrToken}`}
                          className="px-3 py-1.5 rounded-lg border border-slate-200 bg-white text-xs font-medium text-slate-700 hover:border-teal-600 hover:text-teal-800 transition-colors whitespace-nowrap"
                        >
                          Table {t.number} Menu
                        </Link>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
