import crypto from 'node:crypto';

export function roundCurrency(value) {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

/**
 * Always computes order item snapshots and totals from authoritative server-side menu records.
 * Rejects unavailable or inactive dishes and completely ignores any client-submitted prices.
 */
export function computeAuthoritativeOrder(
  requestedItems,
  menuMap,
  taxRate = 0.08,
  discountAmount = 0
) {
  if (!Array.isArray(requestedItems) || requestedItems.length === 0) {
    throw new Error('Order must contain at least one item.');
  }

  const computedItems = [];
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
  orders,
  taxRate = 0.08,
  discountPercent = 0,
  flatDiscount = 0
) {
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

export const ORDER_TRANSITIONS = {
  pending: ['accepted', 'cancelled'],
  accepted: ['preparing', 'cancelled'],
  preparing: ['ready'],
  ready: ['served'],
  served: ['paid'],
  paid: [],
  cancelled: [],
};

export function canTransitionOrderStatus(from, to) {
  if (from === to) return true;
  return (ORDER_TRANSITIONS[from] || []).includes(to);
}

/**
 * Derives overall order status from per-item kitchen progress.
 */
export function deriveOrderStatusFromItems(currentStatus, itemStatuses) {
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
  createdAtIso,
  status,
  nowMs = Date.now(),
  thresholdMinutes = 3
) {
  if (status === 'resolved') return false;
  const elapsedMs = nowMs - new Date(createdAtIso).getTime();
  return elapsedMs >= thresholdMinutes * 60 * 1000;
}

export function getElapsedMinutes(createdAtIso, nowMs = Date.now()) {
  const diff = Math.max(0, nowMs - new Date(createdAtIso).getTime());
  return Math.floor(diff / 60000);
}

export const ROLE_PERMISSIONS = {
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
  customer: ['menu', 'my-orders'],
};

export function canRoleAccess(role, permission) {
  return (ROLE_PERMISSIONS[role] || []).includes(permission);
}

export function generateQrToken(tableNumber) {
  const randomHex = crypto.randomBytes(6).toString('hex');
  if (typeof tableNumber === 'number') {
    return `t${String(tableNumber).padStart(2, '0')}-${randomHex}`;
  }
  return `tbl-${randomHex}`;
}

export function sanitizeText(input) {
  return String(input || '')
    .replace(/[<>]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

export function escapeCsvCell(value) {
  const str = String(value ?? '');
  if (/[",\n\r]/.test(str)) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

export function validateTableForOrder(table) {
  if (!table || table.isActive === false) {
    return {
      ok: false,
      status: 404,
      message: 'Table not found.',
    };
  }
  if (table.status === 'reserved' || table.status === 'cleaning') {
    return {
      ok: false,
      status: 409,
      message: 'This table is not accepting orders right now.',
    };
  }
  return { ok: true, status: 200, message: '' };
}

export function resolveOrderSessionId(table, requestedSessionId, nowMs = Date.now()) {
  if (table?.currentSessionId) {
    return String(table.currentSessionId);
  }
  const cleaned = sanitizeText(requestedSessionId || '');
  if (cleaned.length >= 4) {
    return cleaned;
  }
  return `sess-t${table?.number ?? 0}-${nowMs}`;
}

export function resolveOrderSource({ qrToken, userRole, requestedSource }) {
  if (qrToken) return 'qr';
  if (userRole === 'customer') return 'home';
  if (requestedSource === 'home' || requestedSource === 'staff' || requestedSource === 'qr') {
    return requestedSource;
  }
  return 'staff';
}

export function toPublicTableSummary(table) {
  return {
    id: table.id,
    number: table.number,
    name: table.name,
    section: table.section,
    status: table.status,
    capacity: table.capacity,
  };
}

export function buildOrderCreatedSocketPayload(order) {
  return {
    ...order,
    orderId: order.id,
    tableId: String(order.tableId),
    tableNumber: order.tableNumberSnapshot ?? order.tableNumber,
    source: order.source,
    items: order.items,
    total: order.total,
    status: order.status,
    createdAt: order.createdAt,
  };
}

