import crypto from 'node:crypto';

export type UserRole = 'admin' | 'manager' | 'waiter' | 'kitchen';
export type TableStatus = 'free' | 'occupied' | 'reserved' | 'cleaning';
export type OrderStatus =
  | 'pending'
  | 'accepted'
  | 'preparing'
  | 'ready'
  | 'served'
  | 'paid'
  | 'cancelled';
export type OrderItemStatus = 'pending' | 'preparing' | 'ready' | 'served';
export type ServiceCallType = 'waiter' | 'bill' | 'water' | 'napkins' | 'other';
export type ServiceCallStatus = 'open' | 'acknowledged' | 'resolved';
export type PaymentMethod = 'cash' | 'card' | 'upi' | 'demo';

export interface AuthoritativeMenuItem {
  id: string;
  name: string;
  price: number;
  isAvailable: boolean;
  isActive: boolean;
  prepTimeMinutes: number;
}

export interface RequestedOrderItem {
  menuItemId: string;
  qty: number;
  notes?: string;
  // Intentionally ignored even if supplied by a malicious client
  price?: number;
}

export interface ComputedOrderItem {
  menuItemId: string;
  name: string;
  price: number;
  qty: number;
  notes: string;
  status: OrderItemStatus;
  prepTimeMinutes: number;
}

export interface OrderTotals {
  items: ComputedOrderItem[];
  subtotal: number;
  tax: number;
  discount: number;
  total: number;
}

export function roundCurrency(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

/**
 * Always computes order item snapshots and totals from authoritative server-side menu records.
 * Rejects unavailable or inactive dishes and completely ignores any client-submitted prices.
 */
export function computeAuthoritativeOrder(
  requestedItems: RequestedOrderItem[],
  menuMap: Map<string, AuthoritativeMenuItem>,
  taxRate = 0.08,
  discountAmount = 0
): OrderTotals {
  if (!Array.isArray(requestedItems) || requestedItems.length === 0) {
    throw new Error('Order must contain at least one item.');
  }

  const computedItems: ComputedOrderItem[] = [];
  let subtotal = 0;

  for (const req of requestedItems) {
    const qty = Math.floor(Number(req.qty));
    if (!Number.isFinite(qty) || qty < 1 || qty > 50) {
      throw new Error('Item quantity must be between 1 and 50.');
    }

    const menuItem = menuMap.get(req.menuItemId);
    if (!menuItem || !menuItem.isActive) {
      throw new Error(`Menu item not found: ${req.menuItemId}`);
    }
    if (!menuItem.isAvailable) {
      throw new Error(`"${menuItem.name}" is currently unavailable.`);
    }

    const lineTotal = roundCurrency(menuItem.price * qty);
    subtotal = roundCurrency(subtotal + lineTotal);

    computedItems.push({
      menuItemId: menuItem.id,
      name: menuItem.name,
      price: roundCurrency(menuItem.price),
      qty,
      notes: sanitizeText(req.notes || '').slice(0, 200),
      status: 'pending',
      prepTimeMinutes: menuItem.prepTimeMinutes,
    });
  }

  const safeDiscount = Math.max(0, Math.min(roundCurrency(discountAmount), subtotal));
  const taxableBase = Math.max(0, roundCurrency(subtotal - safeDiscount));
  const tax = roundCurrency(taxableBase * taxRate);
  const total = roundCurrency(taxableBase + tax);

  return {
    items: computedItems,
    subtotal,
    tax,
    discount: safeDiscount,
    total,
  };
}

export function computeConsolidatedBill(
  orders: Array<{ subtotal: number }>,
  taxRate = 0.08,
  discountPercent = 0,
  flatDiscount = 0
): { subtotal: number; discount: number; tax: number; total: number } {
  const subtotal = roundCurrency(orders.reduce((sum, o) => sum + Number(o.subtotal || 0), 0));
  const pct = Math.max(0, Math.min(100, Number(discountPercent) || 0));
  const flat = Math.max(0, Number(flatDiscount) || 0);
  const rawDiscount = roundCurrency((subtotal * pct) / 100 + flat);
  const discount = Math.min(subtotal, rawDiscount);
  const taxable = Math.max(0, roundCurrency(subtotal - discount));
  const tax = roundCurrency(taxable * taxRate);
  const total = roundCurrency(taxable + tax);
  return { subtotal, discount, tax, total };
}

export const ORDER_TRANSITIONS: Record<OrderStatus, OrderStatus[]> = {
  pending: ['accepted', 'preparing', 'ready', 'cancelled'],
  accepted: ['preparing', 'ready', 'cancelled'],
  preparing: ['ready', 'served', 'cancelled'],
  ready: ['served', 'paid'],
  served: ['paid'],
  paid: [],
  cancelled: [],
};

export function canTransitionOrderStatus(from: OrderStatus, to: OrderStatus): boolean {
  if (from === to) return true;
  return (ORDER_TRANSITIONS[from] || []).includes(to);
}

/**
 * Derives overall order status from per-item kitchen progress.
 */
export function deriveOrderStatusFromItems(
  currentStatus: OrderStatus,
  itemStatuses: OrderItemStatus[]
): OrderStatus {
  if (currentStatus === 'paid' || currentStatus === 'cancelled' || currentStatus === 'served') {
    return currentStatus;
  }
  if (itemStatuses.length === 0) return currentStatus;

  const allReadyOrServed = itemStatuses.every((s) => s === 'ready' || s === 'served');
  if (allReadyOrServed) return 'ready';

  const anyStarted = itemStatuses.some((s) => s === 'preparing' || s === 'ready' || s === 'served');
  if (anyStarted) return 'preparing';

  return currentStatus;
}

export function isServiceCallOverdue(
  createdAtIso: string,
  status: ServiceCallStatus,
  nowMs = Date.now(),
  thresholdMinutes = 3
): boolean {
  if (status === 'resolved') return false;
  const elapsedMs = nowMs - new Date(createdAtIso).getTime();
  return elapsedMs >= thresholdMinutes * 60 * 1000;
}

export function getElapsedMinutes(createdAtIso: string, nowMs = Date.now()): number {
  const diff = Math.max(0, nowMs - new Date(createdAtIso).getTime());
  return Math.floor(diff / 60000);
}

export const ROLE_PERMISSIONS: Record<UserRole, string[]> = {
  admin: [
    'dashboard',
    'orders',
    'calls',
    'tables',
    'menu',
    'kitchen',
    'waiter',
    'billing',
    'reports',
    'staff',
    'demo-tools',
  ],
  manager: ['dashboard', 'orders', 'calls', 'tables', 'menu', 'kitchen', 'waiter', 'billing', 'reports'],
  waiter: ['waiter', 'orders', 'calls', 'tables', 'billing'],
  kitchen: ['kitchen'],
};

export function canRoleAccess(role: UserRole, permission: string): boolean {
  return (ROLE_PERMISSIONS[role] || []).includes(permission);
}

export function generateQrToken(tableNumber?: number): string {
  const randomHex = crypto.randomBytes(6).toString('hex');
  if (typeof tableNumber === 'number') {
    return `t${String(tableNumber).padStart(2, '0')}-${randomHex}`;
  }
  return `tbl-${randomHex}`;
}

export function sanitizeText(input: string): string {
  return String(input || '')
    .replace(/[<>]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

export function escapeCsvCell(value: string | number | boolean | null | undefined): string {
  const str = String(value ?? '');
  if (/[",\n\r]/.test(str)) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}
