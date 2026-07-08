"use client";

import React, { createContext, useContext, useReducer, useEffect, useCallback, useRef, useMemo } from 'react';
import type { CartItem } from '@/lib/shop-types';

// ─── State ────────────────────────────────────────────────────────────────────
interface CartState {
  items: CartItem[];
  isOpen: boolean;
}

// Unique key per cart line (productId + optional variantId)
function cartKey(productId: string, variantId?: string) {
  return variantId ? `${productId}::${variantId}` : productId;
}

type CartAction =
  | { type: 'ADD_ITEM'; payload: CartItem }
  | { type: 'ADD_ITEMS'; payload: CartItem[] }
  | { type: 'REMOVE_ITEM'; payload: { productId: string; variantId?: string } }
  | { type: 'UPDATE_QTY'; payload: { productId: string; variantId?: string; quantity: number } }
  | { type: 'CLEAR_CART' }
  | { type: 'TOGGLE_CART' }
  | { type: 'OPEN_CART' }
  | { type: 'CLOSE_CART' }
  | { type: 'LOAD_CART'; payload: CartItem[] };

function cartReducer(state: CartState, action: CartAction): CartState {
  switch (action.type) {
    case 'ADD_ITEM': {
      const key = cartKey(action.payload.productId, action.payload.variant?.variantId);
      const existing = state.items.findIndex(
        i => cartKey(i.productId, i.variant?.variantId) === key
      );
      if (existing >= 0) {
        const items = [...state.items];
        const newQty = Math.min(items[existing].quantity + action.payload.quantity, items[existing].maxStock);
        items[existing] = { ...items[existing], quantity: newQty };
        return { ...state, items, isOpen: true };
      }
      return { ...state, items: [...state.items, action.payload], isOpen: true };
    }
    case 'ADD_ITEMS': {
      let items = [...state.items];
      for (const newItem of action.payload) {
        const key = cartKey(newItem.productId, newItem.variant?.variantId);
        const existing = items.findIndex(i => cartKey(i.productId, i.variant?.variantId) === key);
        if (existing >= 0) {
          const newQty = Math.min(items[existing].quantity + newItem.quantity, items[existing].maxStock);
          items[existing] = { ...items[existing], quantity: newQty };
        } else {
          items.push(newItem);
        }
      }
      return { ...state, items, isOpen: true };
    }
    case 'REMOVE_ITEM': {
      const { productId, variantId } = action.payload;
      const key = cartKey(productId, variantId);
      return {
        ...state,
        items: state.items.filter(i => cartKey(i.productId, i.variant?.variantId) !== key),
      };
    }
    case 'UPDATE_QTY': {
      const { productId, variantId, quantity } = action.payload;
      const key = cartKey(productId, variantId);
      const items = state.items.map(i =>
        cartKey(i.productId, i.variant?.variantId) === key
          ? { ...i, quantity: Math.max(1, Math.min(quantity, i.maxStock)) }
          : i
      );
      return { ...state, items };
    }
    case 'CLEAR_CART':
      return { ...state, items: [] };
    case 'TOGGLE_CART':
      return { ...state, isOpen: !state.isOpen };
    case 'OPEN_CART':
      return { ...state, isOpen: true };
    case 'CLOSE_CART':
      return { ...state, isOpen: false };
    case 'LOAD_CART':
      return { ...state, items: action.payload };
    default:
      return state;
  }
}

// ─── Context ──────────────────────────────────────────────────────────────────
interface CartContextValue {
  items: CartItem[];
  isOpen: boolean;
  itemCount: number;
  subtotal: number;
  addItem: (item: CartItem) => void;
  addItems: (items: CartItem[]) => void;
  removeItem: (productId: string, variantId?: string) => void;
  updateQty: (productId: string, quantity: number, variantId?: string) => void;
  clearCart: () => void;
  toggleCart: () => void;
  openCart: () => void;
  closeCart: () => void;
}

const CartContext = createContext<CartContextValue | null>(null);

const STORAGE_KEY = 'lebtex_cart_v1';

export function ShopCartProvider({ children }: { children: React.ReactNode }) {
  const [state, dispatch] = useReducer(cartReducer, { items: [], isOpen: false });
  const loaded = useRef(false);

  // Load from localStorage on mount
  useEffect(() => {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored) {
        const items = JSON.parse(stored);
        dispatch({ type: 'LOAD_CART', payload: items });
      }
    } catch {}
    loaded.current = true;
  }, []);

  // Persist to localStorage on change
  useEffect(() => {
    if (!loaded.current) return;
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state.items));
    } catch {}
  }, [state.items]);

  const addItem  = useCallback((item: CartItem) => dispatch({ type: 'ADD_ITEM', payload: item }), []);
  const addItems = useCallback((items: CartItem[]) => dispatch({ type: 'ADD_ITEMS', payload: items }), []);
  const removeItem = useCallback(
    (productId: string, variantId?: string) =>
      dispatch({ type: 'REMOVE_ITEM', payload: { productId, variantId } }),
    []
  );
  const updateQty = useCallback(
    (productId: string, quantity: number, variantId?: string) =>
      dispatch({ type: 'UPDATE_QTY', payload: { productId, variantId, quantity } }),
    []
  );
  const clearCart  = useCallback(() => dispatch({ type: 'CLEAR_CART' }), []);
  const toggleCart = useCallback(() => dispatch({ type: 'TOGGLE_CART' }), []);
  const openCart   = useCallback(() => dispatch({ type: 'OPEN_CART' }), []);
  const closeCart  = useCallback(() => dispatch({ type: 'CLOSE_CART' }), []);

  const itemCount = useMemo(() => state.items.reduce((s, i) => s + i.quantity, 0), [state.items]);
  const subtotal  = useMemo(() => state.items.reduce((s, i) => s + i.price * i.quantity, 0), [state.items]);

  return (
    <CartContext.Provider value={{
      items: state.items,
      isOpen: state.isOpen,
      itemCount,
      subtotal,
      addItem,
      addItems,
      removeItem,
      updateQty,
      clearCart,
      toggleCart,
      openCart,
      closeCart,
    }}>
      {children}
    </CartContext.Provider>
  );
}

export function useShopCart(): CartContextValue {
  const ctx = useContext(CartContext);
  if (!ctx) throw new Error('useShopCart must be used within ShopCartProvider');
  return ctx;
}
