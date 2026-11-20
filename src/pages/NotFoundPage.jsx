import React from 'react';
import { Link } from 'react-router-dom';
import { Home, LayoutDashboard } from 'lucide-react';
import { BrandLogo } from '../components/BrandLogo';
import { useAuth } from '../context/AuthContext';
import { ROLE_HOME_ROUTE } from '../utils/format';

export function NotFoundPage() {
  const { user, config } = useAuth();
  const roleHome = user ? ROLE_HOME_ROUTE[user.role] || '/' : null;

  return (
    <div className="min-h-dvh bg-slate-50 flex items-center justify-center p-4 sm:p-6">
      <div className="max-w-md w-full bg-white border border-slate-200 rounded-2xl p-6 sm:p-8 text-center shadow-sm">
        <div className="flex justify-center mb-4">
          <Link
            to="/"
            aria-label="Go to home"
            className="rounded-xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-600"
          >
            <BrandLogo size="lg" />
          </Link>
        </div>
        <p className="text-xs font-mono font-bold tracking-wider uppercase text-teal-700">
          404 · Page Not Found
        </p>
        <h1 className="mt-2 text-2xl font-bold text-slate-900 tracking-tight">
          We couldn’t find that page
        </h1>
        <p className="mt-2 text-sm text-slate-600 leading-relaxed">
          The link you followed may be outdated or the address might be misspelled. Return to {config.restaurantName} to continue.
        </p>

        <div className="mt-6 flex flex-col sm:flex-row items-center justify-center gap-2.5">
          <Link
            to="/"
            className="w-full sm:w-auto min-h-[44px] px-5 py-2.5 rounded-xl bg-teal-700 text-white text-sm font-semibold hover:bg-teal-800 inline-flex items-center justify-center gap-2 transition-colors"
          >
            <Home className="w-4 h-4" />
            Go to Home
          </Link>
          {roleHome && roleHome !== '/' && (
            <Link
              to={roleHome}
              className="w-full sm:w-auto min-h-[44px] px-5 py-2.5 rounded-xl border border-slate-200 bg-white text-slate-700 text-sm font-semibold hover:bg-slate-50 inline-flex items-center justify-center gap-2 transition-colors"
            >
              <LayoutDashboard className="w-4 h-4" />
              My Workspace
            </Link>
          )}
        </div>
      </div>
    </div>
  );
}
