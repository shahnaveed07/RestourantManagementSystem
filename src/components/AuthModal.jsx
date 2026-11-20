import React, { useState, useEffect } from 'react';
import { X, ArrowRight, UserCheck, ShieldCheck, UtensilsCrossed, ConciergeBell, ChefHat } from 'lucide-react';
import toast from 'react-hot-toast';
import { useAuth } from '../context/AuthContext';
import { BrandLogo } from './BrandLogo';

const DEMO_ACCOUNTS = [
  {
    role: 'customer',
    title: 'Customer',
    email: 'customer@demo.com',
    summary: 'Test guest checkout & order tracking',
    icon: UserCheck,
    highlight: true,
  },
  {
    role: 'admin',
    title: 'Admin',
    email: 'admin@demo.com',
    summary: 'Full dashboard, QR codes & tools',
    icon: ShieldCheck,
  },
  {
    role: 'manager',
    title: 'Manager',
    email: 'manager@demo.com',
    summary: 'Orders, menu & reports',
    icon: UtensilsCrossed,
  },
  {
    role: 'waiter',
    title: 'Waiter',
    email: 'waiter@demo.com',
    summary: 'Floor tables, calls & billing',
    icon: ConciergeBell,
  },
  {
    role: 'kitchen',
    title: 'Kitchen',
    email: 'kitchen@demo.com',
    summary: 'Kitchen ticket display',
    icon: ChefHat,
  },
];

export function AuthModal({
  open,
  initialMode = 'login',
  subtitle,
  onClose,
  onSuccess,
}) {
  const { config, login, signup, demoLogin } = useAuth();
  const [mode, setMode] = useState(initialMode);
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (open) {
      setMode(initialMode);
      setError(null);
    }
  }, [open, initialMode]);

  if (!open) return null;

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError(null);

    if (mode === 'signup') {
      if (!name.trim() || name.trim().length < 2) {
        setError('Please enter your name (at least 2 characters).');
        return;
      }
      if (!email.trim() || password.length < 6) {
        setError('Please enter a valid email and a password with at least 6 characters.');
        return;
      }
    } else if (!email.trim() || !password) {
      setError('Please enter both your email and password.');
      return;
    }

    setSubmitting(true);
    try {
      const signedInUser =
        mode === 'signup'
          ? await signup(name.trim(), email.trim(), password)
          : await login(email.trim(), password);
      toast.success(
        mode === 'signup'
          ? `Welcome, ${signedInUser.name}!`
          : `Signed in as ${signedInUser.name}`
      );
      onSuccess?.(signedInUser);
    } catch (err) {
      setError(err.message);
    } finally {
      setSubmitting(false);
    }
  };

  const handleDemo = async (role) => {
    setError(null);
    setSubmitting(true);
    try {
      const signedInUser = await demoLogin(role);
      toast.success(`Signed in as ${signedInUser.name}`);
      onSuccess?.(signedInUser);
    } catch (err) {
      setError(err.message);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-[60] bg-slate-950/65 flex items-center justify-center p-0 sm:p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="auth-modal-title"
    >
      {/* Full screen on mobile, centered card on tablet/desktop */}
      <div className="bg-white w-full h-full sm:h-auto sm:max-h-[92vh] sm:max-w-md sm:rounded-2xl sm:border sm:border-slate-200 shadow-2xl overflow-y-auto flex flex-col">
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-200 sticky top-0 bg-white z-10">
          <div className="flex items-center gap-3 min-w-0">
            <BrandLogo size="sm" />
            <div className="min-w-0">
              <h2 id="auth-modal-title" className="text-base font-bold text-slate-900 truncate">
                {mode === 'signup' ? 'Create Account' : 'Sign In'}
              </h2>
              <p className="text-xs text-slate-500 truncate">
                {subtitle || `${config.restaurantName} · Checkout & Order Tracking`}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close sign in dialog"
            className="min-w-[44px] min-h-[44px] flex items-center justify-center rounded-lg text-slate-500 hover:bg-slate-100 hover:text-slate-900"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-5 sm:p-6 space-y-5 flex-1">
          {/* Mode Tabs */}
          <div className="grid grid-cols-2 gap-1 p-1 bg-slate-100 rounded-xl" role="tablist">
            <button
              type="button"
              role="tab"
              aria-selected={mode === 'login'}
              onClick={() => {
                setMode('login');
                setError(null);
              }}
              className={`min-h-[44px] rounded-lg text-sm font-semibold transition-colors ${
                mode === 'login'
                  ? 'bg-white text-slate-900 shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              Log In
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={mode === 'signup'}
              onClick={() => {
                setMode('signup');
                setError(null);
              }}
              className={`min-h-[44px] rounded-lg text-sm font-semibold transition-colors ${
                mode === 'signup'
                  ? 'bg-white text-slate-900 shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              Sign Up
            </button>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            {error && (
              <div
                role="alert"
                className="p-3 rounded-lg bg-red-50 border border-red-200 text-xs text-red-700 font-medium"
              >
                {error}
              </div>
            )}

            {mode === 'signup' && (
              <div>
                <label htmlFor="modal-auth-name" className="block text-xs font-medium text-slate-700 mb-1.5">
                  Full Name
                </label>
                <input
                  id="modal-auth-name"
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Alex Rivera"
                  autoComplete="name"
                  className="w-full min-h-[44px] px-3.5 py-2.5 rounded-lg border border-slate-300 bg-white text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-teal-600"
                />
              </div>
            )}

            <div>
              <label htmlFor="modal-auth-email" className="block text-xs font-medium text-slate-700 mb-1.5">
                Email Address
              </label>
              <input
                id="modal-auth-email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="customer@demo.com"
                autoComplete="email"
                className="w-full min-h-[44px] px-3.5 py-2.5 rounded-lg border border-slate-300 bg-white text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-teal-600"
              />
            </div>

            <div>
              <label htmlFor="modal-auth-password" className="block text-xs font-medium text-slate-700 mb-1.5">
                Password
              </label>
              <input
                id="modal-auth-password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder={mode === 'signup' ? 'At least 6 characters' : 'Enter password'}
                autoComplete={mode === 'signup' ? 'new-password' : 'current-password'}
                className="w-full min-h-[44px] px-3.5 py-2.5 rounded-lg border border-slate-300 bg-white text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-teal-600"
              />
            </div>

            <button
              type="submit"
              disabled={submitting}
              className="w-full min-h-[46px] py-2.5 px-4 rounded-xl bg-teal-700 text-white text-sm font-semibold hover:bg-teal-800 disabled:opacity-60 transition-colors inline-flex items-center justify-center gap-2"
            >
              {submitting
                ? 'Please wait...'
                : mode === 'signup'
                  ? 'Create Account & Continue'
                  : 'Sign In & Continue'}
              <ArrowRight className="w-4 h-4" />
            </button>
          </form>

          {config.demoMode && (
            <div className="pt-4 border-t border-slate-200">
              <div className="flex items-center justify-between mb-2.5">
                <span className="text-xs font-semibold text-slate-800">One-Click Demo Login</span>
                <span className="text-[11px] text-slate-500">Instant access</span>
              </div>

              <div className="grid grid-cols-1 gap-2">
                {DEMO_ACCOUNTS.slice(0, 1).map((item) => {
                  const Icon = item.icon;
                  return (
                    <button
                      key={item.role}
                      type="button"
                      disabled={submitting}
                      onClick={() => handleDemo(item.role)}
                      className="min-h-[48px] w-full text-left px-3.5 py-2.5 rounded-xl bg-teal-50/70 border border-teal-200 hover:border-teal-600 hover:bg-teal-50 transition-colors flex items-center justify-between gap-3"
                    >
                      <div className="min-w-0">
                        <span className="text-sm font-semibold text-teal-900 block">
                          Demo {item.title} ({item.email})
                        </span>
                        <span className="text-xs text-teal-700 block truncate">{item.summary}</span>
                      </div>
                      <Icon className="w-4 h-4 text-teal-700 shrink-0" />
                    </button>
                  );
                })}
              </div>

              <div className="grid grid-cols-2 gap-2 mt-2">
                {DEMO_ACCOUNTS.slice(1).map((item) => {
                  const Icon = item.icon;
                  return (
                    <button
                      key={item.role}
                      type="button"
                      disabled={submitting}
                      onClick={() => handleDemo(item.role)}
                      className="min-h-[44px] text-left px-3 py-2 rounded-xl bg-white border border-slate-200 hover:border-teal-600 hover:bg-slate-50 transition-colors flex items-center justify-between gap-2"
                    >
                      <span className="text-xs font-semibold text-slate-800">{item.title}</span>
                      <Icon className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                    </button>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
