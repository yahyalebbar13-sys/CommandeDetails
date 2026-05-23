"use client";

import React, { createContext, useContext, useState, useEffect, useMemo, useCallback } from 'react';
import { initializeApp, getApps, getApp } from 'firebase/app';
import { getFirestore, collection, getDocs, doc, setDoc } from 'firebase/firestore';
import { firebaseConfig } from '@/firebase/config';
import { SHOP_PRODUCTS_DATA, SHOP_CATEGORIES } from '@/lib/shop-products-data';
import type { ShopProduct, ShopCategory } from '@/lib/shop-types';

const app = getApps().length ? getApp() : initializeApp(firebaseConfig);
const db = getFirestore(app);

// Fields that can be overridden from admin
export interface ProductOverride {
  price?: number;
  comparePrice?: number | null;
  images?: string[];
  isFeatured?: boolean;
  isNew?: boolean;
  isPromo?: boolean;
  inStock?: boolean;
  stockQty?: number;
  name?: string;
  shortDescription?: string;
  description?: string;
  wholesalePrice?: number;
  minOrderQty?: number;
}

interface ShopProductsContextType {
  products: ShopProduct[];
  categories: ShopCategory[];
  isLoading: boolean;
  getProductById: (id: string) => ShopProduct | undefined;
  getProductsByCategory: (slug: string) => ShopProduct[];
  getFeaturedProducts: (limit?: number) => ShopProduct[];
  getNewProducts: (limit?: number) => ShopProduct[];
  getPromoProducts: (limit?: number) => ShopProduct[];
  getSimilarProducts: (product: ShopProduct, limit?: number) => ShopProduct[];
  searchProducts: (query: string) => ShopProduct[];
  // Admin functions
  updateProduct: (productId: string, override: ProductOverride) => Promise<void>;
  overrides: Record<string, ProductOverride>;
}

const ShopProductsContext = createContext<ShopProductsContextType | null>(null);

export function ShopProductsProvider({ children }: { children: React.ReactNode }) {
  const [overrides, setOverrides] = useState<Record<string, ProductOverride>>({});
  const [customProducts, setCustomProducts] = useState<ShopProduct[]>([]);
  const [customCategories, setCustomCategories] = useState<ShopCategory[]>([]);
  const [categoryOverrides, setCategoryOverrides] = useState<Record<string, Partial<ShopCategory>>>({});
  const [isLoading, setIsLoading] = useState(true);

  // Load overrides, custom products, and custom categories from Firestore on mount
  useEffect(() => {
    Promise.all([
      getDocs(collection(db, 'shop_product_overrides')),
      getDocs(collection(db, 'shop_custom_products')),
      getDocs(collection(db, 'shop_custom_categories')),
      getDocs(collection(db, 'shop_category_overrides')),
    ])
      .then(([ovSnap, cpSnap, ccSnap, coSnap]) => {
        const ov: Record<string, ProductOverride> = {};
        ovSnap.docs.forEach(d => { ov[d.id] = d.data() as ProductOverride; });
        setOverrides(ov);
        setCustomProducts(cpSnap.docs.map(d => ({ id: d.id, ...d.data() } as ShopProduct)));
        setCustomCategories(ccSnap.docs.map(d => ({ id: d.id, ...d.data() } as ShopCategory)));
        const catOv: Record<string, Partial<ShopCategory>> = {};
        if (coSnap) {
          coSnap.docs.forEach(d => { catOv[d.id] = d.data(); });
        }
        setCategoryOverrides(catOv);
      })
      .catch(() => {})
      .finally(() => setIsLoading(false));
  }, []);



  // Merge hardcoded data with Firestore overrides and custom products
  const products = useMemo(() => {
    const hardcoded = SHOP_PRODUCTS_DATA.map(p => {
      const ov = overrides[p.id];
      if (!ov) return p;
      return {
        ...p,
        ...(ov.price !== undefined && { price: ov.price }),
        ...(ov.comparePrice !== undefined && { comparePrice: ov.comparePrice ?? undefined }),
        ...(ov.images && ov.images.length > 0 && { images: ov.images }),
        ...(ov.isFeatured !== undefined && { isFeatured: ov.isFeatured }),
        ...(ov.isNew !== undefined && { isNew: ov.isNew }),
        ...(ov.isPromo !== undefined && { isPromo: ov.isPromo }),
        ...(ov.inStock !== undefined && { inStock: ov.inStock }),
        ...(ov.stockQty !== undefined && { stockQty: ov.stockQty }),
        ...(ov.name && { name: ov.name }),
        ...(ov.shortDescription && { shortDescription: ov.shortDescription }),
        ...(ov.description && { description: ov.description }),
        ...(ov.wholesalePrice !== undefined && { wholesalePrice: ov.wholesalePrice }),
        ...(ov.minOrderQty !== undefined && { minOrderQty: ov.minOrderQty }),
      };
    });
    const existingIds = new Set(hardcoded.map(p => p.id));
    return [...hardcoded, ...customProducts.filter(p => !existingIds.has(p.id))];
  }, [overrides, customProducts]);

  const allCategories = useMemo(() => {
    const existingSlugs = new Set(SHOP_CATEGORIES.map(c => c.slug));
    const mergedHardcoded = SHOP_CATEGORIES.map(c => {
      const ov = categoryOverrides[c.slug];
      if (!ov) return c;
      return { ...c, ...ov };
    });
    
    const combined = [...mergedHardcoded, ...customCategories.filter(c => !existingSlugs.has(c.slug))];
    
    // Sort categories by priority descending, then by name
    combined.sort((a, b) => {
      const priorityA = a.priority || 0;
      const priorityB = b.priority || 0;
      if (priorityA !== priorityB) {
        return priorityB - priorityA;
      }
      return a.name.localeCompare(b.name);
    });
    
    return combined.map(cat => {
      if (cat.image) return cat;
      const firstProduct = products.find(p => p.categorySlug === cat.slug && p.images && p.images.length > 0);
      if (firstProduct && firstProduct.images[0]) {
        return { ...cat, image: firstProduct.images[0] };
      }
      return cat;
    });
  }, [customCategories, categoryOverrides, products]);

  const updateProduct = useCallback(async (productId: string, override: ProductOverride) => {
    // Save to Firestore
    await setDoc(doc(db, 'shop_product_overrides', productId), override, { merge: true });
    // Update local state
    setOverrides(prev => ({
      ...prev,
      [productId]: { ...(prev[productId] || {}), ...override },
    }));
  }, []);

  const getProductById = useCallback((id: string) => products.find(p => p.id === id), [products]);
  const getProductsByCategory = useCallback((slug: string) => products.filter(p => p.categorySlug === slug), [products]);
  const getFeaturedProducts = useCallback((limit = 8) => products.filter(p => p.isFeatured).slice(0, limit), [products]);
  const getNewProducts = useCallback((limit = 6) => products.filter(p => p.isNew).slice(0, limit), [products]);
  const getPromoProducts = useCallback((limit = 6) => products.filter(p => p.isPromo && p.comparePrice).slice(0, limit), [products]);
  const getSimilarProducts = useCallback((product: ShopProduct, limit = 4) => 
    products.filter(p => p.id !== product.id && p.categorySlug === product.categorySlug).slice(0, limit), [products]);
  const searchProducts = useCallback((query: string) => {
    if (!query.trim()) return products;
    const q = query.toLowerCase();
    return products.filter(p =>
      p.name.toLowerCase().includes(q) ||
      p.description.toLowerCase().includes(q) ||
      p.categoryName?.toLowerCase().includes(q) ||
      p.tags.some(t => t.includes(q))
    );
  }, [products]);

  return (
    <ShopProductsContext.Provider value={{
      products, categories: allCategories, isLoading, overrides,
      getProductById, getProductsByCategory, getFeaturedProducts,
      getNewProducts, getPromoProducts, getSimilarProducts, searchProducts,
      updateProduct,
    }}>
      {children}
    </ShopProductsContext.Provider>
  );
}

export function useShopProducts() {
  const ctx = useContext(ShopProductsContext);
  if (!ctx) {
    // Fallback for pages outside the provider (like admin)
    return {
      products: SHOP_PRODUCTS_DATA,
      categories: SHOP_CATEGORIES,
      isLoading: false,
      overrides: {} as Record<string, ProductOverride>,
      getProductById: (id: string) => SHOP_PRODUCTS_DATA.find(p => p.id === id),
      getProductsByCategory: (slug: string) => SHOP_PRODUCTS_DATA.filter(p => p.categorySlug === slug),
      getFeaturedProducts: (limit = 8) => SHOP_PRODUCTS_DATA.filter(p => p.isFeatured).slice(0, limit),
      getNewProducts: (limit = 6) => SHOP_PRODUCTS_DATA.filter(p => p.isNew).slice(0, limit),
      getPromoProducts: (limit = 6) => SHOP_PRODUCTS_DATA.filter(p => p.isPromo && p.comparePrice).slice(0, limit),
      getSimilarProducts: (product: ShopProduct, limit = 4) => SHOP_PRODUCTS_DATA.filter(p => p.id !== product.id && p.categorySlug === product.categorySlug).slice(0, limit),
      searchProducts: (query: string) => {
        if (!query.trim()) return SHOP_PRODUCTS_DATA;
        const q = query.toLowerCase();
        return SHOP_PRODUCTS_DATA.filter(p => p.name.toLowerCase().includes(q) || p.description.toLowerCase().includes(q) || p.tags.some(t => t.includes(q)));
      },
      updateProduct: async () => {},
    };
  }
  return ctx;
}
