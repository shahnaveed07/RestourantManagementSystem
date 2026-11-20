import test from 'node:test';
import assert from 'node:assert/strict';
import {
  computeAuthoritativeOrder,
  computeConsolidatedBill,
  canTransitionOrderStatus,
  deriveOrderStatusFromItems,
  isServiceCallOverdue,
  canRoleAccess,
  generateQrToken,
  escapeCsvCell,
  validateTableForOrder,
  resolveOrderSessionId,
  resolveOrderSource,
  toPublicTableSummary,
  buildOrderCreatedSocketPayload,
} from './orderCalculator.js';

const sampleMenu = new Map([
  [
    'item-1',
    {
      id: 'item-1',
      name: 'Heirloom Burrata',
      price: 16.5,
      isAvailable: true,
      isActive: true,
      prepTimeMinutes: 8,
    },
  ],
  [
    'item-2',
    {
      id: 'item-2',
      name: 'Pan-Seared Salmon',
      price: 32,
      isAvailable: true,
      isActive: true,
      prepTimeMinutes: 16,
    },
  ],
  [
    'item-3',
    {
      id: 'item-3',
      name: 'Sold Out Souffle',
      price: 14,
      isAvailable: false,
      isActive: true,
      prepTimeMinutes: 20,
    },
  ],
]);

test('computeAuthoritativeOrder ignores client-supplied prices and uses menu prices', () => {
  const result = computeAuthoritativeOrder(
    [
      { menuItemId: 'item-1', qty: 2, price: 0.01, notes: '  extra <basil>  ' },
      { menuItemId: 'item-2', qty: 1, price: 1 },
    ],
    sampleMenu,
    0.08
  );

  assert.equal(result.subtotal, 65);
  assert.equal(result.tax, 5.2);
  assert.equal(result.total, 70.2);
  assert.equal(result.items[0].price, 16.5);
  assert.equal(result.items[0].notes, 'extra basil');
});

test('computeAuthoritativeOrder rejects unavailable items', () => {
  assert.throws(
    () =>
      computeAuthoritativeOrder(
        [{ menuItemId: 'item-3', qty: 1 }],
        sampleMenu,
        0.08
      ),
    /currently unavailable/
  );
});

test('computeConsolidatedBill calculates percentage and flat discounts accurately', () => {
  const bill = computeConsolidatedBill(
    [{ subtotal: 60 }, { subtotal: 40 }],
    0.1,
    10,
    5
  );
  assert.equal(bill.subtotal, 100);
  assert.equal(bill.discount, 15);
  assert.equal(bill.tax, 8.5);
  assert.equal(bill.total, 93.5);
});

test('order status transitions and item-derived status work accurately', () => {
  assert.equal(canTransitionOrderStatus('pending', 'accepted'), true);
  assert.equal(canTransitionOrderStatus('pending', 'preparing'), false);
  assert.equal(canTransitionOrderStatus('pending', 'cancelled'), true);
  assert.equal(canTransitionOrderStatus('accepted', 'preparing'), true);
  assert.equal(canTransitionOrderStatus('accepted', 'cancelled'), true);
  assert.equal(canTransitionOrderStatus('preparing', 'ready'), true);
  assert.equal(canTransitionOrderStatus('preparing', 'cancelled'), false);
  assert.equal(canTransitionOrderStatus('ready', 'served'), true);
  assert.equal(canTransitionOrderStatus('ready', 'paid'), false);
  assert.equal(canTransitionOrderStatus('served', 'paid'), true);
  assert.equal(canTransitionOrderStatus('paid', 'pending'), false);
  assert.equal(deriveOrderStatusFromItems('pending', ['preparing', 'pending']), 'preparing');
  assert.equal(deriveOrderStatusFromItems('preparing', ['ready', 'ready']), 'ready');
});

test('isServiceCallOverdue highlights open calls older than 3 minutes', () => {
  const now = Date.UTC(2026, 10, 20, 12, 10, 0);
  const fourMinAgo = new Date(now - 4 * 60 * 1000).toISOString();
  const twoMinAgo = new Date(now - 2 * 60 * 1000).toISOString();

  assert.equal(isServiceCallOverdue(fourMinAgo, 'open', now, 3), true);
  assert.equal(isServiceCallOverdue(twoMinAgo, 'open', now, 3), false);
  assert.equal(isServiceCallOverdue(fourMinAgo, 'resolved', now, 3), false);
});

test('RBAC role matrix enforces staff boundaries', () => {
  assert.equal(canRoleAccess('admin', 'staff'), true);
  assert.equal(canRoleAccess('admin', 'demo-tools'), true);
  assert.equal(canRoleAccess('manager', 'staff'), false);
  assert.equal(canRoleAccess('manager', 'reports'), true);
  assert.equal(canRoleAccess('waiter', 'menu'), false);
  assert.equal(canRoleAccess('waiter', 'billing'), true);
  assert.equal(canRoleAccess('kitchen', 'kitchen'), true);
  assert.equal(canRoleAccess('kitchen', 'billing'), false);
});

test('generateQrToken generates unique table-prefixed tokens and CSV escaping works', () => {
  const t1 = generateQrToken(4);
  const t2 = generateQrToken(4);
  assert.match(t1, /^t04-[a-f0-9]{12}$/);
  assert.notEqual(t1, t2);
  assert.equal(escapeCsvCell('Chef, "Special"'), '"Chef, ""Special"""');
});

test('validateTableForOrder accepts free/occupied tables and rejects missing, reserved, or cleaning tables', () => {
  assert.deepEqual(validateTableForOrder(null), {
    ok: false,
    status: 404,
    message: 'Table not found.',
  });
  assert.equal(validateTableForOrder({ id: 't1', status: 'free', isActive: false }).status, 404);
  assert.deepEqual(validateTableForOrder({ id: 't1', status: 'reserved', isActive: true }), {
    ok: false,
    status: 409,
    message: 'This table is not accepting orders right now.',
  });
  assert.deepEqual(validateTableForOrder({ id: 't1', status: 'cleaning', isActive: true }), {
    ok: false,
    status: 409,
    message: 'This table is not accepting orders right now.',
  });
  assert.equal(validateTableForOrder({ id: 't1', status: 'free', isActive: true }).ok, true);
  assert.equal(validateTableForOrder({ id: 't1', status: 'occupied', isActive: true }).ok, true);
});

test('resolveOrderSessionId reuses existing open table session or creates one', () => {
  assert.equal(
    resolveOrderSessionId({ number: 5, currentSessionId: 'sess-existing' }, 'req-sess', 1000),
    'sess-existing'
  );
  assert.equal(
    resolveOrderSessionId({ number: 5, currentSessionId: null }, 'guest-t05-abc', 1000),
    'guest-t05-abc'
  );
  assert.equal(
    resolveOrderSessionId({ number: 5, currentSessionId: null }, '', 12345),
    'sess-t5-12345'
  );
});

test('resolveOrderSource determines qr, home, and staff strictly', () => {
  assert.equal(resolveOrderSource({ qrToken: 't01-abc', userRole: 'customer', requestedSource: 'staff' }), 'qr');
  assert.equal(resolveOrderSource({ qrToken: null, userRole: 'customer', requestedSource: 'staff' }), 'home');
  assert.equal(resolveOrderSource({ qrToken: null, userRole: 'admin', requestedSource: 'home' }), 'home');
  assert.equal(resolveOrderSource({ qrToken: null, userRole: 'waiter', requestedSource: undefined }), 'staff');
});

test('toPublicTableSummary strips qrToken and internal session fields', () => {
  const pub = toPublicTableSummary({
    id: 't1',
    number: 3,
    name: 'Table 3 — Oak',
    section: 'Main Dining',
    status: 'free',
    capacity: 4,
    qrToken: 'secret-qr',
    currentSessionId: 'sess-secret',
  });
  assert.deepEqual(pub, {
    id: 't1',
    number: 3,
    name: 'Table 3 — Oak',
    section: 'Main Dining',
    status: 'free',
    capacity: 4,
  });
  assert.equal('qrToken' in pub, false);
  assert.equal('currentSessionId' in pub, false);
});

test('buildOrderCreatedSocketPayload includes required real-time fields and snapshot table number', () => {
  const payload = buildOrderCreatedSocketPayload({
    id: 'ord-1',
    orderNumber: 'ORD-1010',
    tableId: 'tbl-5',
    tableNumber: 5,
    tableNumberSnapshot: 5,
    source: 'home',
    items: [{ menuItemId: 'm1', name: 'Burrata', qty: 1, price: 16.5 }],
    total: 17.82,
    status: 'pending',
    createdAt: '2026-11-20T10:00:00.000Z',
  });
  assert.equal(payload.orderId, 'ord-1');
  assert.equal(payload.tableId, 'tbl-5');
  assert.equal(payload.tableNumber, 5);
  assert.equal(payload.source, 'home');
  assert.equal(payload.total, 17.82);
  assert.equal(payload.status, 'pending');
});

