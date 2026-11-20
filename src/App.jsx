import React from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { Toaster } from 'react-hot-toast';
import { AuthProvider, useAuth } from './context/AuthContext';
import { SocketProvider } from './context/SocketContext';
import { ProtectedRoute, RoleRoute } from './routes/ProtectedRoute';
import { ROLE_HOME_ROUTE } from './utils/format';

import { LoginPage } from './pages/LoginPage';
import { GuestMenuPage } from './pages/GuestMenuPage';
import { DashboardPage } from './pages/DashboardPage';
import { LiveOrdersPage } from './pages/LiveOrdersPage';
import { LiveCallsPage } from './pages/LiveCallsPage';
import { TablesPage } from './pages/TablesPage';
import { MenuPage } from './pages/MenuPage';
import { KitchenPage } from './pages/KitchenPage';
import { WaiterPage } from './pages/WaiterPage';
import { BillingPage } from './pages/BillingPage';
import { ReportsPage } from './pages/ReportsPage';
import { StaffPage } from './pages/StaffPage';
import { DemoToolsPage } from './pages/DemoToolsPage';

function HomeRedirect() {
  const { user, loading } = useAuth();
  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50 text-sm text-slate-500">
        Loading Passline...
      </div>
    );
  }
  if (!user) return <Navigate to="/login" replace />;
  return <Navigate to={ROLE_HOME_ROUTE[user.role]} replace />;
}

export default function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <SocketProvider>
          <Toaster
            position="bottom-right"
            containerStyle={{ bottom: 20, right: 20 }}
            toastOptions={{
              duration: 2800,
              style: {
                fontSize: '13px',
                borderRadius: '10px',
                border: '1px solid #e2e8f0',
              },
            }}
          />
          <Routes>
            {/* Public routes */}
            <Route path="/login" element={<LoginPage />} />
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

            <Route
              path="/"
              element={
                <ProtectedRoute>
                  <HomeRedirect />
                </ProtectedRoute>
              }
            />
            <Route path="*" element={<HomeRedirect />} />
          </Routes>
        </SocketProvider>
      </AuthProvider>
    </BrowserRouter>
  );
}
