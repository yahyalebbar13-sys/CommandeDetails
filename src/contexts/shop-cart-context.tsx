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
    case 'LOAD_CART': {
      const safeItems = Array.isArray(action.payload) ? action.payload.filter(i => i && typeof i === 'object') : [];
      return { ...state, items: safeItems };
    }
    default:
      return state;
  }
}

// ─── Context ──────────────────────────────────────────────────────────────────
interface CartStateValue {
  items: CartItem[];
  isOpen: boolean;
  itemCount: number;
  subtotal: number;
  productQtyMap: Record<string, number>;
}

interface CartActionsValue {
  addItem: (item: CartItem) => void;
  addItems: (items: CartItem[]) => void;
  removeItem: (productId: string, variantId?: string) => void;
  updateQty: (productId: string, quantity: number, variantId?: string) => void;
  clearCart: () => void;
  toggleCart: () => void;
  openCart: () => void;
  closeCart: () => void;
}

const CartStateContext = createContext<CartStateValue | null>(null);
const CartActionsContext = createContext<CartActionsValue | null>(null);

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

  const actions = useMemo(() => ({
    addItem: (item: CartItem) => dispatch({ type: 'ADD_ITEM', payload: item }),
    addItems: (items: CartItem[]) => dispatch({ type: 'ADD_ITEMS', payload: items }),
    removeItem: (productId: string, variantId?: string) => dispatch({ type: 'REMOVE_ITEM', payload: { productId, variantId } }),
    updateQty: (productId: string, quantity: number, variantId?: string) => dispatch({ type: 'UPDATE_QTY', payload: { productId, variantId, quantity } }),
    clearCart: () => dispatch({ type: 'CLEAR_CART' }),
    toggleCart: () => dispatch({ type: 'TOGGLE_CART' }),
    openCart: () => dispatch({ type: 'OPEN_CART' }),
    closeCart: () => dispatch({ type: 'CLOSE_CART' }),
  }), []);

  const itemCount = useMemo(() => state.items.reduce((s, i) => s + (i.quantity || 1), 0), [state.items]);

  const subtotal = useMemo(() => {
    // 1. Calculate total qty per productId
    const productQtyMap: Record<string, number> = {};
    for (const item of state.items) {
      productQtyMap[item.productId] = (productQtyMap[item.productId] || 0) + (item.quantity || 1);
    }

    // 2. Calculate subtotal
    return state.items.reduce((s, item) => {
      const totalQty = productQtyMap[item.productId];
      const isWholesale = item.minOrderQty && totalQty >= item.minOrderQty && item.wholesalePrice;
      const effectivePrice = isWholesale ? item.wholesalePrice! : (item.originalPrice || item.price || 0);
      return s + effectivePrice * (item.quantity || 1);
    }, 0);
  }, [state.items]);

  const stateValue = useMemo(() => ({
    items: state.items,
    isOpen: state.isOpen,
    itemCount,
    subtotal,
    productQtyMap: state.items.reduce((acc, item) => {
      acc[item.productId] = (acc[item.productId] || 0) + (item.quantity || 1);
      return acc;
    }, {} as Record<string, number>),
  }), [state.items, state.isOpen, itemCount, subtotal]);

  return (
    <CartActionsContext.Provider value={actions}>
      <CartStateContext.Provider value={stateValue}>
        {children}
      </CartStateContext.Provider>
    </CartActionsContext.Provider>
  );
}

// Hook backward compatibility for components that need everything
export function useShopCart(): CartStateValue & CartActionsValue {
  const stateCtx = useContext(CartStateContext);
  const actionsCtx = useContext(CartActionsContext);
  if (!stateCtx || !actionsCtx) throw new Error('useShopCart must be used within ShopCartProvider');
  return { ...stateCtx, ...actionsCtx };
}

// Specialized hooks to avoid re-renders
export function useShopCartState(): CartStateValue {
  const ctx = useContext(CartStateContext);
  if (!ctx) throw new Error('useShopCartState must be used within ShopCartProvider');
  return ctx;
}

export function useShopCartActions(): CartActionsValue {
  const ctx = useContext(CartActionsContext);
  if (!ctx) throw new Error('useShopCartActions must be used within ShopCartProvider');
  return ctx;
}
