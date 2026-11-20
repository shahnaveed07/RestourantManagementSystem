import axios from 'axios';

const TOKEN_STORAGE_KEY = 'passline_access_token';

export function getStoredToken() {
  try {
    return localStorage.getItem(TOKEN_STORAGE_KEY);
  } catch {
    return null;
  }
}

export function setStoredToken(token) {
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

async function unwrap(promise) {
  try {
    const res = await promise;
    if (!res.data.success) {
      throw new Error(res.data.message || 'Request failed');
    }
    return res.data.data;
  } catch (err) {
    if (axios.isAxiosError(err)) {
      const msg = err.response?.data?.message || err.message;
      throw new Error(msg);
    }
    throw err;
  }
}

export const api = {
  // Public config
  getConfig: () => unwrap(http.get('/config')),

  // Auth
  login: (email, password) => unwrap(http.post('/auth/login', { email, password })),
  demoLogin: (role) => unwrap(http.post('/auth/demo-login', { role })),
  logout: () => unwrap(http.post('/auth/logout')),
  me: () => unwrap(http.get('/auth/me')),
  getSession: () => unwrap(http.get('/auth/session')),

  // Guest QR endpoints
  getGuestTableData: (qrToken, sessionId) =>
    unwrap(http.get(`/guest/table/${encodeURIComponent(qrToken)}`, { params: { sessionId } })),

  placeGuestOrder: (qrToken, payload) =>
    unwrap(http.post(`/guest/table/${encodeURIComponent(qrToken)}/orders`, payload)),

  createGuestCall: (qrToken, payload) =>
    unwrap(http.post(`/guest/table/${encodeURIComponent(qrToken)}/calls`, payload)),

  // Tables
  listTables: () => unwrap(http.get('/tables')),
  createTable: (payload) => unwrap(http.post('/tables', payload)),
  updateTable: (id, payload) => unwrap(http.put(`/tables/${id}`, payload)),
  updateTableStatus: (id, status) => unwrap(http.patch(`/tables/${id}/status`, { status })),
  rotateTableQr: (id) => unwrap(http.post(`/tables/${id}/rotate-qr`)),
  deleteTable: (id) => unwrap(http.delete(`/tables/${id}`)),
  getTableHistory: (id) => unwrap(http.get(`/tables/${id}/history`)),

  // Menu
  getMenu: () => unwrap(http.get('/menu')),
  createCategory: (payload) => unwrap(http.post('/menu/categories', payload)),
  updateCategory: (id, payload) => unwrap(http.put(`/menu/categories/${id}`, payload)),
  deleteCategory: (id) => unwrap(http.delete(`/menu/categories/${id}`)),
  createMenuItem: (payload) => unwrap(http.post('/menu/items', payload)),
  updateMenuItem: (id, payload) => unwrap(http.put(`/menu/items/${id}`, payload)),
  toggleMenuItemAvailability: (id, isAvailable) =>
    unwrap(http.patch(`/menu/items/${id}/availability`, { isAvailable })),
  bulkPriceUpdate: (payload) => unwrap(http.post('/menu/items/bulk-price', payload)),
  deleteMenuItem: (id) => unwrap(http.delete(`/menu/items/${id}`)),

  // Orders
  listOrders: (params) => unwrap(http.get('/orders', { params })),
  createStaffOrder: (payload) => unwrap(http.post('/orders', payload)),
  updateOrderStatus: (id, status) => unwrap(http.patch(`/orders/${id}/status`, { status })),
  updateOrderItemStatus: (id, itemIndex, status) =>
    unwrap(http.patch(`/orders/${id}/items/${itemIndex}/status`, { status })),

  // Calls
  listCalls: (params) => unwrap(http.get('/calls', { params })),
  acknowledgeCall: (id) => unwrap(http.patch(`/calls/${id}/acknowledge`)),
  resolveCall: (id) => unwrap(http.patch(`/calls/${id}/resolve`)),

  // Billing
  getBillingTables: () => unwrap(http.get('/billing/tables')),
  recordPayment: (tableId, payload) => unwrap(http.post(`/billing/table/${tableId}/pay`, payload)),

  // Reports
  getReportsSummary: (params) => unwrap(http.get('/reports/summary', { params })),

  // Staff (Admin)
  listStaff: () => unwrap(http.get('/staff')),
  createStaff: (payload) => unwrap(http.post('/staff', payload)),
  updateStaff: (id, payload) => unwrap(http.put(`/staff/${id}`, payload)),
  resetStaffPassword: (id, newPassword) =>
    unwrap(http.post(`/staff/${id}/reset-password`, { newPassword })),

  // Demo Tools (Admin + DEMO_MODE)
  getDemoStatus: () => unwrap(http.get('/demo/status')),
  simulateOrder: (tableId) => unwrap(http.post('/demo/simulate-order', { tableId })),
  simulateCall: (tableId, type) => unwrap(http.post('/demo/simulate-call', { tableId, type })),
  setAutoPlay: (enabled, intervalSeconds) =>
    unwrap(http.post('/demo/autoplay', { enabled, intervalSeconds })),
  timeTravel: (minutesBack) => unwrap(http.post('/demo/time-travel', { minutesBack })),
  resetDemoData: () => unwrap(http.post('/demo/reset')),
};
