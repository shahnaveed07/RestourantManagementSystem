const CART_STORAGE_KEY = 'passline_cart_v1';

export function roundCurrency(value) {
  return Math.round((Number(value || 0) + Number.EPSILON) * 100) / 100;
}

export function addCartItem(cart, item) {
  if (!item || !item.id || !item.isAvailable || item.isActive === false) {
    return cart;
  }
  const existing = cart[item.id];
  const nextQty = Math.min(50, (existing?.qty || 0) + 1);
  return {
    ...cart,
    [item.id]: {
      item: {
        id: item.id,
        name: item.name,
        price: Number(item.price),
        imageUrl: item.imageUrl || '',
        isVeg: Boolean(item.isVeg),
        spiceLevel: item.spiceLevel || 'none',
        isAvailable: Boolean(item.isAvailable),
      },
      qty: nextQty,
      notes: existing?.notes || '',
    },
  };
}

export function updateCartItemQty(cart, itemId, delta) {
  const existing = cart[itemId];
  if (!existing) return cart;
  const nextQty = existing.qty + delta;
  if (nextQty <= 0) {
    const copy = { ...cart };
    delete copy[itemId];
    return copy;
  }
  return {
    ...cart,
    [itemId]: {
      ...existing,
      qty: Math.min(50, nextQty),
    },
  };
}

export function updateCartItemNotes(cart, itemId, notes) {
  const existing = cart[itemId];
  if (!existing) return cart;
  return {
    ...cart,
    [itemId]: {
      ...existing,
      notes: String(notes || '').slice(0, 200),
    },
  };
}

export function reconcileCartWithMenu(cart, menuItems) {
  if (!Array.isArray(menuItems) || menuItems.length === 0) return { nextCart: cart, removedNames: [] };
  const menuMap = new Map(menuItems.map((m) => [m.id, m]));
  const nextCart = {};
  const removedNames = [];

  for (const [id, entry] of Object.entries(cart)) {
    const fresh = menuMap.get(id);
    if (!fresh || !fresh.isAvailable || fresh.isActive === false) {
      removedNames.push(entry.item?.name || 'Item');
      continue;
    }
    nextCart[id] = {
      ...entry,
      item: {
        id: fresh.id,
        name: fresh.name,
        price: Number(fresh.price),
        imageUrl: fresh.imageUrl || '',
        isVeg: Boolean(fresh.isVeg),
        spiceLevel: fresh.spiceLevel || 'none',
        isAvailable: Boolean(fresh.isAvailable),
      },
    };
  }
  return { nextCart, removedNames };
}

export function getCartTotals(cart, taxRate = 0.08) {
  const entries = Object.values(cart || {});
  const count = entries.reduce((sum, e) => sum + e.qty, 0);
  const subtotal = roundCurrency(
    entries.reduce((sum, e) => sum + Number(e.item.price || 0) * e.qty, 0)
  );
  const tax = roundCurrency(subtotal * taxRate);
  const total = roundCurrency(subtotal + tax);
  return { entries, count, subtotal, tax, total };
}

export function loadStoredCart() {
  try {
    if (typeof localStorage === 'undefined') return {};
    const raw = localStorage.getItem(CART_STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return {};
  }
}

export function saveStoredCart(cart) {
  try {
    if (typeof localStorage === 'undefined') return;
    localStorage.setItem(CART_STORAGE_KEY, JSON.stringify(cart || {}));
  } catch {
    // ignore storage quota errors
  }
}

export function clearStoredCart() {
  try {
    if (typeof localStorage === 'undefined') return;
    localStorage.removeItem(CART_STORAGE_KEY);
  } catch {
    // ignore storage errors
  }
}
