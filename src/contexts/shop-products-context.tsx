"use client";

import React, { createContext, useContext, useState, useEffect, useMemo, useCallback } from 'react';
import { initializeApp, getApps, getApp } from 'firebase/app';
import { getFirestore, doc, setDoc } from 'firebase/firestore';
import { firebaseConfig } from '@/firebase/config';
import { SHOP_PRODUCTS_DATA, SHOP_CATEGORIES } from '@/lib/shop-products-data';
import type { ShopProduct, ShopCategory } from '@/lib/shop-types';
import { getProductPromo } from '@/lib/shop-utils';
import shopStaticData from '@/lib/shop-firebase-dump.json';
import { fusionnerProduits, fusionnerRayons, type ProductOverride } from '@/lib/catalogue-boutique';

// Produits affichés avec un prix barré, plus forte remise d'abord
function selectPromoProducts<T extends Pick<ShopProduct, 'price' | 'comparePrice' | 'variants'>>(products: T[], limit: number): T[] {
  return products
    .filter(p => getProductPromo(p).active)
    .sort((a, b) => getProductPromo(b).percent - getProductPromo(a).percent)
    .slice(0, limit);
}

const app = getApps().length ? getApp() : initializeApp(firebaseConfig);
const db = getFirestore(app);

// Fields that can be overridden from admin : le type vit dans lib/catalogue-boutique
// (partagé avec le serveur), toujours exporté ici pour l'admin.
export type { ProductOverride };

interface ShopProductsContextType {
  products: ShopProduct[];
  categories: ShopCategory[];
  isLoading: boolean;
  getProductById: (id: string) => ShopProduct | undefined;
  getProductsByCategory: (slug: string) => ShopProduct[];
  getProductForCategory: (product: ShopProduct, categorySlug: string) => ShopProduct;
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
  const [overrides, setOverrides] = useState<Record<string, ProductOverride>>((shopStaticData.overrides as any) || {});
  const [customProducts, setCustomProducts] = useState<ShopProduct[]>((shopStaticData.customProducts as any) || []);
  const [customCategories, setCustomCategories] = useState<ShopCategory[]>((shopStaticData.customCategories as any) || []);
  const [categoryOverrides, setCategoryOverrides] = useState<Record<string, Partial<ShopCategory>>>((shopStaticData.categoryOverrides as any) || {});
  const [isLoading, setIsLoading] = useState(false);

  // Merge hardcoded data with Firestore overrides and custom products
  // (règle partagée avec le serveur : lib/catalogue-boutique)
  const products = useMemo(
    () => fusionnerProduits(SHOP_PRODUCTS_DATA, overrides, customProducts),
    [overrides, customProducts]
  );

  // Rayons visibles (règle partagée avec le serveur : lib/catalogue-boutique)
  const allCategories = useMemo(
    () => fusionnerRayons(SHOP_CATEGORIES, customCategories, categoryOverrides, products),
    [customCategories, categoryOverrides, products]
  );

  const updateProduct = useCallback(async (productId: string, override: ProductOverride) => {
    // Save to Firestore
    await setDoc(doc(db, 'shop_product_overrides', productId), override, { merge: true });
    // Update local state
    setOverrides(prev => ({
      ...prev,
      [productId]: { ...(prev[productId] || {}), ...override },
    }));
  }, []);

  // Helper: does this product belong to this category?
  const productBelongsToCategory = useCallback((p: ShopProduct, slug: string) =>
    p.categorySlug === slug || 
    p.additionalCategorySlugs?.includes(slug) || 
    p.categoryAliases?.some(a => a.slug === slug), []);

  const getProductById = useCallback((id: string) => products.find(p => p.id === id), [products]);
  const getProductsByCategory = useCallback((slug: string) => products.filter(p => productBelongsToCategory(p, slug)), [products, productBelongsToCategory]);
  
  // Returns a product with alias overrides applied for a specific category
  const getProductForCategory = useCallback((product: ShopProduct, categorySlug: string): ShopProduct => {
    const alias = product.categoryAliases?.find(a => a.slug === categorySlug);
    if (!alias) return product;
    return {
      ...product,
      ...(alias.name && { name: alias.name }),
      ...(alias.nameAr && { nameAr: alias.nameAr }),
      ...(alias.shortDescription && { shortDescription: alias.shortDescription }),
      ...(alias.shortDescriptionAr && { shortDescriptionAr: alias.shortDescriptionAr }),
      ...(alias.images && alias.images.length > 0 && { images: alias.images }),
    };
  }, []);
  const getFeaturedProducts = useCallback((limit = 8) => products.filter(p => p.isFeatured).slice(0, limit), [products]);
  const getNewProducts = useCallback((limit = 6) => products.filter(p => p.isNew).slice(0, limit), [products]);
  const getPromoProducts = useCallback((limit = 6) => selectPromoProducts(products, limit), [products]);
  const getSimilarProducts = useCallback((product: ShopProduct, limit = 4) => 
    products.filter(p => p.id !== product.id && (p.categorySlug === product.categorySlug || p.additionalCategorySlugs?.includes(product.categorySlug))).slice(0, limit), [products]);
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
      getProductById, getProductsByCategory, getProductForCategory, getFeaturedProducts,
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
      getProductsByCategory: (slug: string) => SHOP_PRODUCTS_DATA.filter(p => p.categorySlug === slug || p.additionalCategorySlugs?.includes(slug) || p.categoryAliases?.some(a => a.slug === slug)),
      getProductForCategory: (product: ShopProduct, categorySlug: string) => {
        const alias = product.categoryAliases?.find(a => a.slug === categorySlug);
        if (!alias) return product;
        return { ...product, ...(alias.name && { name: alias.name }), ...(alias.nameAr && { nameAr: alias.nameAr }), ...(alias.shortDescription && { shortDescription: alias.shortDescription }) };
      },
      getFeaturedProducts: (limit = 8) => SHOP_PRODUCTS_DATA.filter(p => p.isFeatured).slice(0, limit),
      getNewProducts: (limit = 6) => SHOP_PRODUCTS_DATA.filter(p => p.isNew).slice(0, limit),
      getPromoProducts: (limit = 6) => selectPromoProducts(SHOP_PRODUCTS_DATA, limit),
      getSimilarProducts: (product: ShopProduct, limit = 4) => SHOP_PRODUCTS_DATA.filter(p => p.id !== product.id && (p.categorySlug === product.categorySlug || p.additionalCategorySlugs?.includes(product.categorySlug))).slice(0, limit),
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
