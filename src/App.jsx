import React, { Suspense, lazy } from 'react';
import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { Toaster } from 'react-hot-toast';
import { AuthProvider } from './context/AuthContext';
import { CartProvider } from './context/CartContext';
import { SocketProvider } from './context/SocketContext';
import { RoleRoute } from './routes/ProtectedRoute';
import { useMediaQuery } from './utils/useMediaQuery';

import { HomePage } from './pages/HomePage';
import { LoginPage } from './pages/LoginPage';
import { GuestMenuPage } from './pages/GuestMenuPage';

const lazyPage = (loader, exportName) =>
  lazy(() => loader().then((mod) => ({ default: mod[exportName] })));

const NotFoundPage = lazyPage(() => import('./pages/NotFoundPage'), 'NotFoundPage');
const DashboardPage = lazyPage(() => import('./pages/DashboardPage'), 'DashboardPage');
const LiveOrdersPage = lazyPage(() => import('./pages/LiveOrdersPage'), 'LiveOrdersPage');
const LiveCallsPage = lazyPage(() => import('./pages/LiveCallsPage'), 'LiveCallsPage');
const TablesPage = lazyPage(() => import('./pages/TablesPage'), 'TablesPage');
const MenuPage = lazyPage(() => import('./pages/MenuPage'), 'MenuPage');
const KitchenPage = lazyPage(() => import('./pages/KitchenPage'), 'KitchenPage');
const WaiterPage = lazyPage(() => import('./pages/WaiterPage'), 'WaiterPage');
const BillingPage = lazyPage(() => import('./pages/BillingPage'), 'BillingPage');
const ReportsPage = lazyPage(() => import('./pages/ReportsPage'), 'ReportsPage');
const StaffPage = lazyPage(() => import('./pages/StaffPage'), 'StaffPage');
const DemoToolsPage = lazyPage(() => import('./pages/DemoToolsPage'), 'DemoToolsPage');

function RouteFallback() {
  return (
    <div className="min-h-dvh flex items-center justify-center bg-slate-50 p-6">
      <div className="flex flex-col items-center gap-3 text-slate-500">
        <div className="w-8 h-8 rounded-full border-2 border-teal-600 border-t-transparent animate-spin" />
        <p className="text-xs font-medium tracking-wide">Loading workspace...</p>
      </div>
    </div>
  );
}

export default function App() {
  const isDesktop = useMediaQuery('(min-width: 768px)');

  return (
    <BrowserRouter>
      <AuthProvider>
        <CartProvider>
          <SocketProvider>
            <Toaster
              position={isDesktop ? 'top-right' : 'top-center'}
              containerStyle={{ top: 12, zIndex: 70 }}
              toastOptions={{
                duration: 2400,
                style: {
                  fontSize: '13px',
                  borderRadius: '10px',
                  border: '1px solid #e2e8f0',
                  maxWidth: '90vw',
                },
              }}
            />
            <Suspense fallback={<RouteFallback />}>
              <Routes>
                {/* Public storefront & menu landing */}
                <Route path="/" element={<HomePage />} />
                <Route path="/login" element={<LoginPage initialMode="login" />} />
                <Route path="/signup" element={<LoginPage initialMode="signup" />} />
                <Route path="/t/:qrToken" element={<GuestMenuPage />} />

                {/* Role-protected staff routes */}
                <Route
                  path="/dashboard"
                  element={
                    <RoleRoute allowedRoles={['admin', 'manager']}>
                      <DashboardPage />
                    </RoleRoute>
                  }
                />
                <Route
                  path="/orders"
                  element={
                    <RoleRoute allowedRoles={['admin', 'manager', 'waiter']}>
                      <LiveOrdersPage />
                    </RoleRoute>
                  }
                />
                <Route
                  path="/calls"
                  element={
                    <RoleRoute allowedRoles={['admin', 'manager', 'waiter']}>
                      <LiveCallsPage />
                    </RoleRoute>
                  }
                />
                <Route
                  path="/tables"
                  element={
                    <RoleRoute allowedRoles={['admin', 'manager', 'waiter']}>
                      <TablesPage />
                    </RoleRoute>
                  }
                />
                <Route
                  path="/menu"
                  element={
                    <RoleRoute allowedRoles={['admin', 'manager']}>
                      <MenuPage />
                    </RoleRoute>
                  }
                />
                <Route
                  path="/kitchen"
                  element={
                    <RoleRoute allowedRoles={['admin', 'manager', 'kitchen']}>
                      <KitchenPage />
                    </RoleRoute>
                  }
                />
                <Route
                  path="/waiter"
                  element={
                    <RoleRoute allowedRoles={['admin', 'manager', 'waiter']}>
                      <WaiterPage />
                    </RoleRoute>
                  }
                />
                <Route
                  path="/billing"
                  element={
                    <RoleRoute allowedRoles={['admin', 'manager', 'waiter']}>
                      <BillingPage />
                    </RoleRoute>
                  }
                />
                <Route
                  path="/reports"
                  element={
                    <RoleRoute allowedRoles={['admin', 'manager']}>
                      <ReportsPage />
                    </RoleRoute>
                  }
                />
                <Route
                  path="/staff"
                  element={
                    <RoleRoute allowedRoles={['admin']}>
                      <StaffPage />
                    </RoleRoute>
                  }
                />
                <Route
                  path="/demo-tools"
                  element={
                    <RoleRoute allowedRoles={['admin']}>
                      <DemoToolsPage />
                    </RoleRoute>
                  }
                />

                <Route path="*" element={<NotFoundPage />} />
              </Routes>
            </Suspense>
          </SocketProvider>
        </CartProvider>
      </AuthProvider>
    </BrowserRouter>
  );
}
