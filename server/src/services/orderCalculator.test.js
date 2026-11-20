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
  assert.equal(canTransitionOrderStatus('pending', 'preparing'), true);
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
