import React, { useState, useEffect } from 'react';
import { Link, useNavigate, useSearchParams, useLocation } from 'react-router-dom';
import {
  QrCode,
  ArrowRight,
  ArrowLeft,
  ShieldCheck,
  UtensilsCrossed,
  ChefHat,
  ConciergeBell,
  UserCheck,
  KeyRound,
  Smartphone,
} from 'lucide-react';
import toast from 'react-hot-toast';
import { useAuth } from '../context/AuthContext';
import { ROLE_HOME_ROUTE } from '../utils/format';
import { BrandLogo } from '../components/BrandLogo';
import { CustomerAuthForm } from '../components/CustomerAuthForm';

const HERO_IMAGE = '/src/assets/images/hero_dining_room_1795178823770.jpg';

const STAFF_DEMO_ROLES = [
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

export function LoginPage({ initialMode = 'login' }) {
  const { config, passwordLogin, demoLogin } = useAuth();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const location = useLocation();

  const [accountType, setAccountType] = useState('customer'); // 'customer' | 'staff'
  const [staffEmail, setStaffEmail] = useState('');
  const [staffPassword, setStaffPassword] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [staffError, setStaffError] = useState(null);

  useEffect(() => {
    setStaffError(null);
  }, [initialMode]);

  const redirectTarget = searchParams.get('redirect') || location.state?.from || null;

  const navigateAfterAuth = (signedInUser) => {
    if (redirectTarget) {
      navigate(redirectTarget, { replace: true });
      return;
    }
    navigate(ROLE_HOME_ROUTE[signedInUser.role] || '/', { replace: true });
  };

  const handleStaffSubmit = async (e) => {
    e.preventDefault();
    setStaffError(null);

    if (!staffEmail.trim() || !staffPassword) {
      setStaffError('Please enter your staff email and password.');
      return;
    }

    setSubmitting(true);
    try {
      const user = await passwordLogin(staffEmail.trim(), staffPassword);
      toast.success(`Signed in as ${user.name}`);
      navigateAfterAuth(user);
    } catch (err) {
      setStaffError(err.message);
    } finally {
      setSubmitting(false);
    }
  };

  const handleDemoRole = async (role) => {
    setStaffError(null);
    setSubmitting(true);
    try {
      const user = await demoLogin(role);
      toast.success(`Signed in as ${user.name} (${role})`);
      navigateAfterAuth(user);
    } catch (err) {
      setStaffError(err.message);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="min-h-dvh bg-slate-50 flex flex-col">
      {config.demoMode && (
        <div className="bg-amber-50 border-b border-amber-200 px-4 sm:px-6 py-2 text-center text-xs text-amber-900">
          <strong className="font-semibold">DEMO MODE</strong> — Instant Demo Customer login, OTP{' '}
          <strong className="font-mono">{config.demoOtpHint || '123456'}</strong>, and guest QR table menus are active.
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
            <div className="flex items-center gap-3">
              <BrandLogo size="lg" />
              <div>
                <span className="text-base font-bold tracking-tight text-white block">Passline</span>
                <span className="text-xs text-teal-300">Restaurant Operations</span>
              </div>
            </div>
            <div className="max-w-md">
              <h1 className="text-4xl font-bold tracking-tight leading-tight">
                {config.restaurantName}
              </h1>
              <p className="mt-3 text-sm text-slate-200 leading-relaxed">
                Synchronized dining room floor, mobile &amp; email OTP checkout, QR ordering, live service calls, and kitchen display.
              </p>
              <div className="mt-6 pt-6 border-t border-white/20 flex items-center gap-6 text-xs text-slate-300">
                <span>12 Dining Tables</span>
                <span aria-hidden="true">·</span>
                <span>Passwordless Customer OTP</span>
                <span aria-hidden="true">·</span>
                <span>Role-Based Access</span>
              </div>
            </div>
          </div>
        </div>

        {/* Right Sign-In & Demo Column */}
        <div className="lg:col-span-6 flex items-center justify-center p-4 sm:p-10 lg:p-14">
          <div className="w-full max-w-md">
            <div className="mb-4">
              <Link
                to="/"
                className="inline-flex items-center gap-1.5 text-xs font-semibold text-teal-700 hover:text-teal-900 min-h-[44px]"
              >
                <ArrowLeft className="w-3.5 h-3.5" />
                Back to Restaurant Menu
              </Link>
            </div>

            <div className="mb-5 flex items-center gap-3.5">
              <BrandLogo size="lg" className="lg:hidden" />
              <div>
                <span className="text-xs font-semibold text-teal-700 lg:hidden block mb-0.5">
                  Passline · {config.restaurantName}
                </span>
                <h2 className="text-2xl font-bold text-slate-900 tracking-tight">
                  {accountType === 'customer' ? 'Customer Sign In' : 'Staff Sign In'}
                </h2>
                <p className="mt-1 text-sm text-slate-600">
                  {accountType === 'customer'
                    ? 'Sign in or register using a 6-digit OTP sent to your mobile or email.'
                    : 'Restaurant staff sign in with their work email and password.'}
                </p>
              </div>
            </div>

            {/* Customer OTP vs Staff Password Switcher */}
            <div className="grid grid-cols-2 gap-2 mb-5">
              <button
                type="button"
                onClick={() => {
                  setAccountType('customer');
                  setStaffError(null);
                }}
                className={`min-h-[44px] px-3 rounded-xl border text-xs sm:text-sm font-semibold inline-flex items-center justify-center gap-2 transition-colors ${
                  accountType === 'customer'
                    ? 'bg-teal-50 border-teal-600 text-teal-900'
                    : 'bg-white border-slate-200 text-slate-600 hover:bg-slate-50'
                }`}
              >
                <Smartphone className="w-4 h-4 shrink-0" />
                Customer OTP
              </button>
              <button
                type="button"
                onClick={() => {
                  setAccountType('staff');
                  setStaffError(null);
                }}
                className={`min-h-[44px] px-3 rounded-xl border text-xs sm:text-sm font-semibold inline-flex items-center justify-center gap-2 transition-colors ${
                  accountType === 'staff'
                    ? 'bg-teal-50 border-teal-600 text-teal-900'
                    : 'bg-white border-slate-200 text-slate-600 hover:bg-slate-50'
                }`}
              >
                <KeyRound className="w-4 h-4 shrink-0" />
                Staff Login
              </button>
            </div>

            <div className="bg-white border border-slate-200 rounded-xl p-5 sm:p-6">
              {accountType === 'customer' ? (
                <CustomerAuthForm
                  initialMode={initialMode}
                  onSuccess={navigateAfterAuth}
                />
              ) : (
                <form onSubmit={handleStaffSubmit} className="space-y-4">
                  {staffError && (
                    <div
                      role="alert"
                      className="p-3 rounded-lg bg-red-50 border border-red-200 text-xs text-red-700 font-medium"
                    >
                      {staffError}
                    </div>
                  )}

                  <div>
                    <label htmlFor="staff-email" className="block text-xs font-medium text-slate-700 mb-1.5">
                      Staff Email Address
                    </label>
                    <input
                      id="staff-email"
                      type="email"
                      value={staffEmail}
                      onChange={(e) => setStaffEmail(e.target.value)}
                      placeholder="admin@demo.com"
                      autoComplete="email"
                      className="w-full min-h-[44px] px-3.5 py-2.5 rounded-lg border border-slate-300 bg-white text-base sm:text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-teal-600 focus:border-teal-600"
                    />
                  </div>

                  <div>
                    <label htmlFor="staff-password" className="block text-xs font-medium text-slate-700 mb-1.5">
                      Password
                    </label>
                    <input
                      id="staff-password"
                      type="password"
                      value={staffPassword}
                      onChange={(e) => setStaffPassword(e.target.value)}
                      placeholder="Enter staff password"
                      autoComplete="current-password"
                      className="w-full min-h-[44px] px-3.5 py-2.5 rounded-lg border border-slate-300 bg-white text-base sm:text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-teal-600 focus:border-teal-600"
                    />
                  </div>

                  <button
                    type="submit"
                    disabled={submitting}
                    className="w-full min-h-[46px] py-2.5 px-4 rounded-lg bg-teal-700 text-white text-sm font-semibold hover:bg-teal-800 disabled:opacity-60 transition-colors inline-flex items-center justify-center gap-2"
                  >
                    {submitting ? 'Signing in...' : 'Sign In as Staff'}
                    <ArrowRight className="w-4 h-4" />
                  </button>
                </form>
              )}
            </div>

            {config.demoMode && (
              <div className="mt-7 space-y-3">
                <div className="flex items-center justify-between">
                  <h3 className="text-sm font-semibold text-slate-900">One-Click Demo Access</h3>
                  <span className="text-xs text-slate-500">Seeded accounts</span>
                </div>

                <button
                  type="button"
                  disabled={submitting}
                  onClick={() => handleDemoRole('customer')}
                  className="w-full min-h-[60px] text-left p-3.5 rounded-xl border bg-teal-50/70 border-teal-200 hover:border-teal-600 hover:bg-teal-50 transition-colors group"
                >
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-sm font-semibold text-teal-950">
                      Login as Demo Customer
                    </span>
                    <UserCheck className="w-4 h-4 text-teal-700 shrink-0" />
                  </div>
                  <p className="text-xs text-teal-800 leading-snug">
                    9999999991 / customer@demo.com (instant sign-in, no OTP needed)
                  </p>
                </button>

                <p className="text-xs text-slate-500 px-1">
                  To test the new signup OTP flow, select <strong>Sign Up</strong> above with{' '}
                  <strong className="font-mono text-slate-700">9999999992</strong> or{' '}
                  <strong className="text-slate-700">guest@demo.com</strong> (OTP{' '}
                  <strong className="font-mono text-slate-700">{config.demoOtpHint || '123456'}</strong>).
                </p>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                  {STAFF_DEMO_ROLES.map((item) => {
                    const Icon = item.icon;
                    return (
                      <button
                        key={item.role}
                        type="button"
                        disabled={submitting}
                        onClick={() => handleDemoRole(item.role)}
                        className="min-h-[60px] text-left p-3.5 rounded-xl border bg-white border-slate-200 hover:border-teal-600 hover:bg-teal-50/40 transition-colors group"
                      >
                        <div className="flex items-center justify-between mb-1">
                          <span className="text-sm font-semibold text-slate-900 group-hover:text-teal-800">
                            {item.title} ({item.email})
                          </span>
                          <Icon className="w-4 h-4 text-slate-400 group-hover:text-teal-700 shrink-0" />
                        </div>
                        <p className="text-xs text-slate-500 leading-snug">{item.summary}</p>
                      </button>
                    );
                  })}
                </div>

                {config.demoTables.length > 0 && (
                  <div className="mt-4 pt-4 border-t border-slate-200">
                    <div className="flex items-center gap-2 text-xs font-medium text-slate-700 mb-2.5">
                      <QrCode className="w-3.5 h-3.5 text-teal-700" />
                      <span>Preview Guest QR Table Menu</span>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      {config.demoTables.slice(0, 4).map((t) => (
                        <Link
                          key={t.qrToken}
                          to={`/t/${t.qrToken}`}
                          className="min-h-[44px] inline-flex items-center px-3 py-1.5 rounded-lg border border-slate-200 bg-white text-xs font-medium text-slate-700 hover:border-teal-600 hover:text-teal-800 transition-colors whitespace-nowrap"
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
