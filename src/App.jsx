import React from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { Toaster } from 'react-hot-toast';
import { AuthProvider } from './context/AuthContext';
import { CartProvider } from './context/CartContext';
import { SocketProvider } from './context/SocketContext';
import { RoleRoute } from './routes/ProtectedRoute';

import { HomePage } from './pages/HomePage';
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

export default function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <CartProvider>
          <SocketProvider>
            <Toaster
              position="top-center"
              containerStyle={{ top: 72 }}
              toastOptions={{
                duration: 2400,
                style: {
                  fontSize: '13px',
                  borderRadius: '10px',
                  border: '1px solid #e2e8f0',
                },
              }}
            />
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

              <Route path="*" element={<Navigate to="/" replace />} />
            </Routes>
          </SocketProvider>
        </CartProvider>
      </AuthProvider>
    </BrowserRouter>
  );
}
