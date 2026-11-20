import test from 'node:test';
import assert from 'node:assert/strict';
import {
  addCartItem,
  updateCartItemQty,
  updateCartItemNotes,
  reconcileCartWithMenu,
  getCartTotals,
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
