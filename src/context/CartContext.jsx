import React, { createContext, useContext, useState, useEffect, useCallback, useMemo } from 'react';
import toast from 'react-hot-toast';
import { useAuth } from './AuthContext';
import {
  addCartItem,
  updateCartItemQty,
  updateCartItemNotes,
  reconcileCartWithMenu,
  getCartTotals,
  loadStoredCart,
  saveStoredCart,
  clearStoredCart,
  loadStoredTable,
  saveStoredTable,
  clearStoredTable,
} from '../utils/cart';

const CartContext = createContext(null);

export function CartProvider({ children }) {
  const { config } = useAuth();
  const [cart, setCart] = useState(() => loadStoredCart());
  const [selectedTable, setSelectedTable] = useState(() => loadStoredTable());
  const [cartOpen, setCartOpen] = useState(false);

  // Sync cart and selectedTable changes to localStorage so they survive auth redirects or reloads
  useEffect(() => {
    saveStoredCart(cart);
  }, [cart]);

  useEffect(() => {
    saveStoredTable(selectedTable);
  }, [selectedTable]);

  const clearSelectedTable = useCallback(() => {
    setSelectedTable(null);
    clearStoredTable();
  }, []);

  const addToCart = useCallback((item) => {
    if (!item || !item.isAvailable) {
      toast.error('This dish is currently unavailable.');
      return;
    }
    setCart((prev) => addCartItem(prev, item));
    toast.success(`Added ${item.name} to cart`, { id: `cart-add-${item.id}` });
  }, []);

  const updateQty = useCallback((itemId, delta) => {
    setCart((prev) => updateCartItemQty(prev, itemId, delta));
  }, []);

  const updateNotes = useCallback((itemId, notes) => {
    setCart((prev) => updateCartItemNotes(prev, itemId, notes));
  }, []);

  const clearCart = useCallback(() => {
    setCart({});
    clearStoredCart();
  }, []);

  const syncMenuAvailability = useCallback((menuItems) => {
    setCart((prev) => {
      if (Object.keys(prev).length === 0) return prev;
      const { nextCart, removedNames } = reconcileCartWithMenu(prev, menuItems);
      if (removedNames.length > 0) {
        toast.error(`${removedNames.join(', ')} sold out and removed from your cart.`);
      }
      return nextCart;
    });
  }, []);

  const totals = useMemo(() => getCartTotals(cart, config.taxRate), [cart, config.taxRate]);

  return (
    <CartContext.Provider
      value={{
        cart,
        selectedTable,
        setSelectedTable,
        clearSelectedTable,
        cartOpen,
        setCartOpen,
        addToCart,
        updateQty,
        updateNotes,
        clearCart,
        syncMenuAvailability,
        cartCount: totals.count,
        cartEntries: totals.entries,
        ...totals,
      }}
    >
      {children}
    </CartContext.Provider>
  );
}

export function useCart() {
  const ctx = useContext(CartContext);
  if (!ctx) throw new Error('useCart must be used inside CartProvider');
  return ctx;
}
