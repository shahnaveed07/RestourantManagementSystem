import axios from 'axios';
import type {
  AppConfig,
  AuthUser,
  BillingTab,
  Category,
  MenuItem,
  Order,
  OrderItemStatus,
  OrderStatus,
  Payment,
  PaymentMethod,
  ReportsSummary,
  ServiceCall,
  ServiceCallType,
  TableItem,
  TableStatus,
  UserRole,
  AuditLog,
} from '../types';

const TOKEN_STORAGE_KEY = 'passline_access_token';

export function getStoredToken(): string | null {
  try {
    return localStorage.getItem(TOKEN_STORAGE_KEY);
  } catch {
    return null;
  }
}

export function setStoredToken(token: string | null) {
  try {
    if (token) {
      localStorage.setItem(TOKEN_STORAGE_KEY, token);
    } else {
      localStorage.removeItem(TOKEN_STORAGE_KEY);
    }
  } catch {
    // ignore storage errors
  }
}

export const http = axios.create({
  baseURL: '/api',
  withCredentials: true,
  headers: { 'Content-Type': 'application/json' },
});

http.interceptors.request.use((config) => {
  const token = getStoredToken();
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

interface ApiEnvelope<T> {
  success: boolean;
  data: T;
  message: string;
}

async function unwrap<T>(promise: Promise<{ data: ApiEnvelope<T> }>): Promise<T> {
  try {
    const res = await promise;
    if (!res.data.success) {
      throw new Error(res.data.message || 'Request failed');
    }
    return res.data.data;
  } catch (err) {
    if (axios.isAxiosError(err)) {
      const msg = (err.response?.data as { message?: string } | undefined)?.message || err.message;
      throw new Error(msg);
    }
    throw err;
  }
}

export const api = {
  // Public config
  getConfig: () => unwrap<AppConfig>(http.get('/config')),

  // Auth
  login: (email: string, password: string) =>
    unwrap<{ accessToken: string; user: AuthUser }>(http.post('/auth/login', { email, password })),
  demoLogin: (role: UserRole) =>
    unwrap<{ accessToken: string; user: AuthUser }>(http.post('/auth/demo-login', { role })),
  logout: () => unwrap<{ loggedOut: boolean }>(http.post('/auth/logout')),
  me: () => unwrap<AuthUser>(http.get('/auth/me')),
  getSession: () => unwrap<AuthUser | null>(http.get('/auth/session')),

  // Guest QR endpoints
  getGuestTableData: (qrToken: string, sessionId?: string) =>
    unwrap<{
      restaurantName: string;
      taxRate: number;
      table: TableItem;
      categories: Category[];
      menuItems: MenuItem[];
      orders: Order[];
      calls: ServiceCall[];
    }>(http.get(`/guest/table/${encodeURIComponent(qrToken)}`, { params: { sessionId } })),

  placeGuestOrder: (
    qrToken: string,
    payload: { sessionId: string; items: Array<{ menuItemId: string; qty: number; notes?: string }> }
  ) => unwrap<Order>(http.post(`/guest/table/${encodeURIComponent(qrToken)}/orders`, payload)),

  createGuestCall: (
    qrToken: string,
    payload: { sessionId?: string; type: ServiceCallType; message?: string }
  ) => unwrap<ServiceCall>(http.post(`/guest/table/${encodeURIComponent(qrToken)}/calls`, payload)),

  // Tables
  listTables: () => unwrap<TableItem[]>(http.get('/tables')),
  createTable: (payload: { number: number; name: string; capacity: number; section: string }) =>
    unwrap<TableItem>(http.post('/tables', payload)),
  updateTable: (id: string, payload: Partial<TableItem>) =>
    unwrap<TableItem>(http.put(`/tables/${id}`, payload)),
  updateTableStatus: (id: string, status: TableStatus) =>
    unwrap<TableItem>(http.patch(`/tables/${id}/status`, { status })),
  rotateTableQr: (id: string) => unwrap<TableItem>(http.post(`/tables/${id}/rotate-qr`)),
  deleteTable: (id: string) => unwrap<{ deleted: boolean }>(http.delete(`/tables/${id}`)),
  getTableHistory: (id: string) =>
    unwrap<{ table: TableItem; orders: Order[]; calls: ServiceCall[] }>(http.get(`/tables/${id}/history`)),

  // Menu
  getMenu: () => unwrap<{ categories: Category[]; items: MenuItem[] }>(http.get('/menu')),
  createCategory: (payload: { name: string; sortOrder: number }) =>
    unwrap<Category>(http.post('/menu/categories', payload)),
  updateCategory: (id: string, payload: Partial<Category>) =>
    unwrap<Category>(http.put(`/menu/categories/${id}`, payload)),
  deleteCategory: (id: string) => unwrap<{ deleted: boolean }>(http.delete(`/menu/categories/${id}`)),
  createMenuItem: (payload: Omit<MenuItem, 'id' | 'isActive'>) =>
    unwrap<MenuItem>(http.post('/menu/items', payload)),
  updateMenuItem: (id: string, payload: Partial<MenuItem>) =>
    unwrap<MenuItem>(http.put(`/menu/items/${id}`, payload)),
  toggleMenuItemAvailability: (id: string, isAvailable: boolean) =>
    unwrap<MenuItem>(http.patch(`/menu/items/${id}/availability`, { isAvailable })),
  bulkPriceUpdate: (payload: { categoryId?: string; mode: 'percent' | 'flat'; amount: number }) =>
    unwrap<{ updatedCount: number }>(http.post('/menu/items/bulk-price', payload)),
  deleteMenuItem: (id: string) => unwrap<{ deleted: boolean }>(http.delete(`/menu/items/${id}`)),

  // Orders
  listOrders: (params?: { status?: string; tableId?: string }) =>
    unwrap<Order[]>(http.get('/orders', { params })),
  createStaffOrder: (payload: {
    tableId: string;
    items: Array<{ menuItemId: string; qty: number; notes?: string }>;
  }) => unwrap<Order>(http.post('/orders', payload)),
  updateOrderStatus: (id: string, status: OrderStatus) =>
    unwrap<Order>(http.patch(`/orders/${id}/status`, { status })),
  updateOrderItemStatus: (id: string, itemIndex: number, status: OrderItemStatus) =>
    unwrap<Order>(http.patch(`/orders/${id}/items/${itemIndex}/status`, { status })),

  // Calls
  listCalls: (params?: { status?: string }) =>
    unwrap<ServiceCall[]>(http.get('/calls', { params })),
  acknowledgeCall: (id: string) => unwrap<ServiceCall>(http.patch(`/calls/${id}/acknowledge`)),
  resolveCall: (id: string) => unwrap<ServiceCall>(http.patch(`/calls/${id}/resolve`)),

  // Billing
  getBillingTables: () => unwrap<{ taxRate: number; tabs: BillingTab[] }>(http.get('/billing/tables')),
  recordPayment: (
    tableId: string,
    payload: {
      method: PaymentMethod;
      discountPercent: number;
      flatDiscount: number;
      nextTableStatus: 'free' | 'cleaning';
    }
  ) =>
    unwrap<{ payment: Payment; table: TableItem; settledOrders: Order[] }>(
      http.post(`/billing/table/${tableId}/pay`, payload)
    ),

  // Reports
  getReportsSummary: (params?: { from?: string; to?: string }) =>
    unwrap<ReportsSummary>(http.get('/reports/summary', { params })),

  // Staff (Admin)
  listStaff: () => unwrap<{ users: AuthUser[]; auditLogs: AuditLog[] }>(http.get('/staff')),
  createStaff: (payload: { name: string; email: string; password: string; role: UserRole }) =>
    unwrap<AuthUser>(http.post('/staff', payload)),
  updateStaff: (id: string, payload: Partial<{ name: string; role: UserRole; isActive: boolean }>) =>
    unwrap<AuthUser>(http.put(`/staff/${id}`, payload)),
  resetStaffPassword: (id: string, newPassword: string) =>
    unwrap<{ updated: boolean }>(http.post(`/staff/${id}/reset-password`, { newPassword })),

  // Demo Tools (Admin + DEMO_MODE)
  getDemoStatus: () =>
    unwrap<{ demoMode: boolean; autoPlayRunning: boolean; intervalSeconds: number }>(
      http.get('/demo/status')
    ),
  simulateOrder: (tableId?: string) => unwrap<Order>(http.post('/demo/simulate-order', { tableId })),
  simulateCall: (tableId?: string, type?: ServiceCallType) =>
    unwrap<ServiceCall>(http.post('/demo/simulate-call', { tableId, type })),
  setAutoPlay: (enabled: boolean, intervalSeconds: number) =>
    unwrap<{ autoPlayRunning: boolean; intervalSeconds: number }>(
      http.post('/demo/autoplay', { enabled, intervalSeconds })
    ),
  timeTravel: (minutesBack: number) =>
    unwrap<{ ordersShifted: number; callsShifted: number }>(
      http.post('/demo/time-travel', { minutesBack })
    ),
  resetDemoData: () => unwrap<unknown>(http.post('/demo/reset')),
};
