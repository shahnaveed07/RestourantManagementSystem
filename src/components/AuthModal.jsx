import React, { useState, useRef } from 'react';
import { X, UserCheck, ShieldCheck, UtensilsCrossed, ConciergeBell, ChefHat } from 'lucide-react';
import toast from 'react-hot-toast';
import { useAuth } from '../context/AuthContext';
import { BrandLogo } from './BrandLogo';
import { CustomerAuthForm } from './CustomerAuthForm';
import { useModalA11y } from '../utils/useModalA11y';

const STAFF_DEMO_ACCOUNTS = [
  { role: 'admin', title: 'Admin', icon: ShieldCheck },
  { role: 'manager', title: 'Manager', icon: UtensilsCrossed },
  { role: 'waiter', title: 'Waiter', icon: ConciergeBell },
  { role: 'kitchen', title: 'Kitchen', icon: ChefHat },
];

export function AuthModal({
  open,
  initialMode = 'login',
  subtitle,
  onClose,
  onSuccess,
}) {
  const { config, demoLogin } = useAuth();
  const [submitting, setSubmitting] = useState(false);
  const [demoError, setDemoError] = useState(null);
  const modalRef = useRef(null);

  useModalA11y(open, onClose, modalRef);

  if (!open) return null;

  const handleDemo = async (role) => {
    setDemoError(null);
    setSubmitting(true);
    try {
      const signedInUser = await demoLogin(role);
      toast.success(`Signed in as ${signedInUser.name}`);
      onSuccess?.(signedInUser);
    } catch (err) {
      setDemoError(err.message);
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
      {/* Full screen on mobile (360px), centered card on tablet/desktop */}
      <div
        ref={modalRef}
        className="bg-white w-full h-dvh sm:h-auto sm:max-h-[92dvh] sm:max-w-md sm:rounded-2xl sm:border sm:border-slate-200 shadow-2xl overflow-y-auto flex flex-col"
      >
        {config.demoMode && (
          <div className="bg-amber-50 border-b border-amber-200 px-4 py-2 text-center text-[11px] font-medium text-amber-900 shrink-0">
            <strong>DEMO MODE</strong> · Instant Demo Customer or OTP <strong>{config.demoOtpHint || '123456'}</strong>
          </div>
        )}

        <div className="flex items-center justify-between gap-2 px-4 sm:px-5 py-3.5 sm:py-4 border-b border-slate-200 sticky top-0 bg-white z-10 shrink-0">
          <button
            type="button"
            onClick={onClose}
            aria-label="Close sign in dialog"
            className="order-first sm:order-last min-w-[44px] min-h-[44px] flex items-center justify-center rounded-lg text-slate-500 hover:bg-slate-100 hover:text-slate-900 shrink-0"
          >
            <X className="w-5 h-5" />
          </button>
          <div className="flex items-center gap-3 min-w-0 flex-1">
            <BrandLogo size="sm" />
            <div className="min-w-0">
              <h2 id="auth-modal-title" className="text-base font-bold text-slate-900 truncate">
                Customer Sign In
              </h2>
              <p className="text-xs text-slate-500 truncate">
                {subtitle || `${config.restaurantName} · Checkout & Order Tracking`}
              </p>
            </div>
          </div>
        </div>

        <div className="p-5 sm:p-6 space-y-5 flex-1">
          <CustomerAuthForm
            initialMode={initialMode}
            onSuccess={onSuccess}
            resetKey={open ? 1 : 0}
          />

          {config.demoMode && (
            <div className="pt-4 border-t border-slate-200 space-y-2.5">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-slate-800">One-Click Demo Access</span>
                <span className="text-[11px] text-slate-500">No OTP required</span>
              </div>

              {demoError && (
                <div
                  role="alert"
                  className="p-2.5 rounded-lg bg-red-50 border border-red-200 text-xs text-red-700"
                >
                  {demoError}
                </div>
              )}

              <button
                type="button"
                disabled={submitting}
                onClick={() => handleDemo('customer')}
                className="min-h-[48px] w-full text-left px-3.5 py-2.5 rounded-xl bg-teal-50/80 border border-teal-200 hover:border-teal-600 hover:bg-teal-50 transition-colors flex items-center justify-between gap-3"
              >
                <div className="min-w-0">
                  <span className="text-sm font-semibold text-teal-900 block">
                    Login as Demo Customer
                  </span>
                  <span className="text-xs text-teal-700 block truncate">
                    +91 9999999991 · customer@demo.com
                  </span>
                </div>
                <UserCheck className="w-4 h-4 text-teal-700 shrink-0" />
              </button>

              <p className="text-[11px] text-slate-500 leading-relaxed">
                Seeded OTP logins:{' '}
                <strong className="font-mono text-slate-700">9999999991</strong> /{' '}
                <strong className="text-slate-700">customer@demo.com</strong> and{' '}
                <strong className="font-mono text-slate-700">9999999992</strong> /{' '}
                <strong className="text-slate-700">guest@demo.com</strong>. Test new{' '}
                <strong>Sign Up</strong> with any fresh number or email (e.g.{' '}
                <strong className="font-mono text-slate-700">9999999993</strong>).
              </p>

              <div className="grid grid-cols-2 gap-2 pt-1">
                {STAFF_DEMO_ACCOUNTS.map((item) => {
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
