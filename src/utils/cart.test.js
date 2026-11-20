import test from 'node:test';
import assert from 'node:assert/strict';
import {
  addCartItem,
  updateCartItemQty,
  updateCartItemNotes,
  reconcileCartWithMenu,
  getCartTotals,
  validateSelectedTable,
  filterPublicTables,
} from './cart.js';

const availableDish = {
  id: 'dish-1',
  name: 'Heirloom Tomato & Burrata',
  price: 16.5,
  isVeg: true,
  spiceLevel: 'none',
  isAvailable: true,
  isActive: true,
};

const soldOutDish = {
  id: 'dish-2',
  name: 'Truffle Arancini Trio',
  price: 15.5,
  isVeg: true,
  spiceLevel: 'none',
  isAvailable: false,
  isActive: true,
};

test('addCartItem adds available dishes and blocks unavailable dishes', () => {
  let cart = {};
  cart = addCartItem(cart, availableDish);
  assert.equal(cart['dish-1'].qty, 1);

  cart = addCartItem(cart, availableDish);
  assert.equal(cart['dish-1'].qty, 2);

  cart = addCartItem(cart, soldOutDish);
  assert.equal(cart['dish-2'], undefined);
});

test('updateCartItemQty increments, decrements, and removes at zero', () => {
  let cart = addCartItem({}, availableDish);
  cart = updateCartItemQty(cart, 'dish-1', 2);
  assert.equal(cart['dish-1'].qty, 3);

  cart = updateCartItemQty(cart, 'dish-1', -3);
  assert.equal(cart['dish-1'], undefined);
});

test('updateCartItemNotes stores trimmed note up to 200 chars', () => {
  let cart = addCartItem({}, availableDish);
  cart = updateCartItemNotes(cart, 'dish-1', 'Dressing on the side');
  assert.equal(cart['dish-1'].notes, 'Dressing on the side');
});

test('getCartTotals computes subtotal, tax, and total accurately', () => {
  let cart = addCartItem({}, availableDish);
  cart = addCartItem(cart, availableDish);
  const totals = getCartTotals(cart, 0.08);
  assert.equal(totals.count, 2);
  assert.equal(totals.subtotal, 33);
  assert.equal(totals.tax, 2.64);
  assert.equal(totals.total, 35.64);
});

test('reconcileCartWithMenu drops items that became unavailable', () => {
  let cart = addCartItem({}, availableDish);
  const { nextCart, removedNames } = reconcileCartWithMenu(cart, [
    { ...availableDish, isAvailable: false },
  ]);
  assert.equal(Object.keys(nextCart).length, 0);
  assert.deepEqual(removedNames, ['Heirloom Tomato & Burrata']);
});

test('validateSelectedTable enforces table presence and rejects reserved/cleaning tables', () => {
  assert.deepEqual(validateSelectedTable(null), {
    valid: false,
    error: 'Please select your table number to continue.',
  });
  assert.deepEqual(validateSelectedTable({ id: 't1', number: 1, status: 'reserved' }), {
    valid: false,
    error: 'This table is not accepting orders right now.',
  });
  assert.deepEqual(validateSelectedTable({ id: 't2', number: 2, status: 'cleaning' }), {
    valid: false,
    error: 'This table is not accepting orders right now.',
  });
  assert.deepEqual(validateSelectedTable({ id: 't3', number: 3, status: 'free' }), {
    valid: true,
  });
  assert.deepEqual(validateSelectedTable({ id: 't4', number: 4, status: 'occupied' }), {
    valid: true,
  });
});

test('filterPublicTables filters by section and search query', () => {
  const sample = [
    { id: '1', number: 1, name: 'Window Two-Top', section: 'Main Dining' },
    { id: '2', number: 9, name: 'Courtyard Cedar', section: 'Patio' },
    { id: '3', number: 12, name: 'Chef Counter', section: 'Bar' },
  ];
  assert.equal(filterPublicTables(sample, { section: 'Patio' }).length, 1);
  assert.equal(filterPublicTables(sample, { search: '12' })[0].id, '3');
  assert.equal(filterPublicTables(sample, { search: 'window' })[0].id, '1');
});
