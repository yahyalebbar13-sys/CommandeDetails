"use client";

import React, { createContext, useContext, useState, useEffect, useMemo, useCallback } from 'react';
import { initializeApp, getApps, getApp } from 'firebase/app';
import { getFirestore, doc, setDoc } from 'firebase/firestore';
import { firebaseConfig } from '@/firebase/config';
import { SHOP_PRODUCTS_DATA, SHOP_CATEGORIES } from '@/lib/shop-products-data';
import type { ShopProduct, ShopCategory } from '@/lib/shop-types';
import shopStaticData from '@/lib/shop-firebase-dump.json';

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
  catalogueName?: string | null;
  nameAr?: string;
  shortDescription?: string;
  shortDescriptionAr?: string;
  description?: string;
  descriptionAr?: string;
  wholesalePrice?: number;
  minOrderQty?: number;
  variants?: import('@/lib/shop-types').ProductVariant[];
  // Champs fiche produit
  material?: string;
  materialAr?: string;
  specification?: string;
  specificationAr?: string;
  weight?: number;
  width?: string;
  packaging?: string;
  packagingAr?: string;
  // Metadata additionnelle
  categorySlug?: string;
  categoryName?: string;
  categoryNameAr?: string;
  hidden?: boolean;
  // Détails Hyper Pro
  applications?: string;
  avantages?: string;
  conseilsEntretien?: string;
  informationCommerciale?: string;
  motsCles?: string;
  typeProduit?: string;
  matiereMailles?: string;
  compositionRuban?: string;
  couleur?: string;
  largeurMaille?: string;
  longueur?: string;
  type?: string;
  design?: string;
  securite?: string;
  resistance?: string;
  compatibleAvec?: string;
  paysFabrication?: string;
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
  const [overrides, setOverrides] = useState<Record<string, ProductOverride>>((shopStaticData.overrides as any) || {});
  const [customProducts, setCustomProducts] = useState<ShopProduct[]>((shopStaticData.customProducts as any) || []);
  const [customCategories, setCustomCategories] = useState<ShopCategory[]>((shopStaticData.customCategories as any) || []);
  const [categoryOverrides, setCategoryOverrides] = useState<Record<string, Partial<ShopCategory>>>((shopStaticData.categoryOverrides as any) || {});
  const [isLoading, setIsLoading] = useState(false);

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
        ...(ov.nameAr && { nameAr: ov.nameAr }),
        ...(ov.shortDescription && { shortDescription: ov.shortDescription }),
        ...(ov.shortDescriptionAr && { shortDescriptionAr: ov.shortDescriptionAr }),
        ...(ov.description && { description: ov.description }),
        ...(ov.descriptionAr && { descriptionAr: ov.descriptionAr }),
        ...(ov.wholesalePrice !== undefined && { wholesalePrice: ov.wholesalePrice }),
        ...(ov.minOrderQty !== undefined && { minOrderQty: ov.minOrderQty }),
        ...(ov.variants && ov.variants.length > 0 && { variants: ov.variants }),
        ...(ov.material && { material: ov.material }),
        ...(ov.materialAr && { materialAr: ov.materialAr }),
        ...(ov.specification && { specification: ov.specification }),
        ...(ov.specificationAr && { specificationAr: ov.specificationAr }),
        ...(ov.weight !== undefined && { weight: ov.weight }),
        ...(ov.width && { width: ov.width }),
        ...(ov.packaging && { packaging: ov.packaging }),
        ...(ov.packagingAr && { packagingAr: ov.packagingAr }),
        ...(ov.categorySlug && { categorySlug: ov.categorySlug }),
        ...(ov.categoryName && { categoryName: ov.categoryName }),
        ...(ov.categoryNameAr && { categoryNameAr: ov.categoryNameAr }),
        ...(ov.applications && { applications: ov.applications }),
        ...(ov.avantages && { avantages: ov.avantages }),
        ...(ov.conseilsEntretien && { conseilsEntretien: ov.conseilsEntretien }),
        ...(ov.informationCommerciale && { informationCommerciale: ov.informationCommerciale }),
        ...(ov.motsCles && { motsCles: ov.motsCles }),
        ...(ov.typeProduit && { typeProduit: ov.typeProduit }),
        ...(ov.matiereMailles && { matiereMailles: ov.matiereMailles }),
        ...(ov.compositionRuban && { compositionRuban: ov.compositionRuban }),
        ...(ov.couleur && { couleur: ov.couleur }),
        ...(ov.largeurMaille && { largeurMaille: ov.largeurMaille }),
        ...(ov.longueur && { longueur: ov.longueur }),
        ...(ov.type && { type: ov.type }),
        ...(ov.design && { design: ov.design }),
        ...(ov.securite && { securite: ov.securite }),
        ...(ov.resistance && { resistance: ov.resistance }),
        ...(ov.compatibleAvec && { compatibleAvec: ov.compatibleAvec }),
        ...(ov.paysFabrication && { paysFabrication: ov.paysFabrication }),
      };
    });
    // Filter out hardcoded products marked hidden by admin
    const visibleHardcoded = hardcoded.filter(p => !(overrides[p.id] as any)?.hidden);
    const existingIds = new Set(hardcoded.map(p => p.id));
    const mergedCustom = customProducts
      .filter(p => !existingIds.has(p.id) && !(overrides[p.id] as any)?.hidden)
      .map(p => {
        const ov = overrides[p.id];
        const baseInStock = p.inStock !== undefined ? p.inStock : true;
        const baseStockQty = p.stockQty !== undefined ? p.stockQty : 99;
        const baseCat = p.categorySlug || (p as any).categoryId || 'autres';
        if (!ov) return { ...p, inStock: baseInStock, stockQty: baseStockQty, categorySlug: baseCat };
        return {
          ...p,
          categorySlug: ov.categorySlug || baseCat,
          inStock: ov.inStock !== undefined ? ov.inStock : baseInStock,
          stockQty: ov.stockQty !== undefined ? ov.stockQty : baseStockQty,
          ...(ov.price !== undefined && { price: ov.price }),
          ...(ov.comparePrice !== undefined && { comparePrice: ov.comparePrice ?? undefined }),
          ...(ov.images && ov.images.length > 0 && { images: ov.images }),
          ...(ov.isFeatured !== undefined && { isFeatured: ov.isFeatured }),
          ...(ov.isNew !== undefined && { isNew: ov.isNew }),
          ...(ov.isPromo !== undefined && { isPromo: ov.isPromo }),
          ...(ov.name && { name: ov.name }),
          ...(ov.nameAr && { nameAr: ov.nameAr }),
          ...(ov.shortDescription && { shortDescription: ov.shortDescription }),
          ...(ov.shortDescriptionAr && { shortDescriptionAr: ov.shortDescriptionAr }),
          ...(ov.description && { description: ov.description }),
          ...(ov.descriptionAr && { descriptionAr: ov.descriptionAr }),
          ...(ov.wholesalePrice !== undefined && { wholesalePrice: ov.wholesalePrice }),
          ...(ov.minOrderQty !== undefined && { minOrderQty: ov.minOrderQty }),
          ...(ov.variants && ov.variants.length > 0 && { variants: ov.variants }),
          ...(ov.material && { material: ov.material }),
          ...(ov.materialAr && { materialAr: ov.materialAr }),
          ...(ov.specification && { specification: ov.specification }),
          ...(ov.specificationAr && { specificationAr: ov.specificationAr }),
          ...(ov.weight !== undefined && { weight: ov.weight }),
          ...(ov.width && { width: ov.width }),
          ...(ov.packaging && { packaging: ov.packaging }),
          ...(ov.packagingAr && { packagingAr: ov.packagingAr }),
          ...(ov.categoryName && { categoryName: ov.categoryName }),
          ...(ov.categoryNameAr && { categoryNameAr: ov.categoryNameAr }),
          ...(ov.applications && { applications: ov.applications }),
          ...(ov.avantages && { avantages: ov.avantages }),
          ...(ov.conseilsEntretien && { conseilsEntretien: ov.conseilsEntretien }),
          ...(ov.informationCommerciale && { informationCommerciale: ov.informationCommerciale }),
          ...(ov.motsCles && { motsCles: ov.motsCles }),
          ...(ov.typeProduit && { typeProduit: ov.typeProduit }),
          ...(ov.matiereMailles && { matiereMailles: ov.matiereMailles }),
          ...(ov.compositionRuban && { compositionRuban: ov.compositionRuban }),
          ...(ov.couleur && { couleur: ov.couleur }),
          ...(ov.largeurMaille && { largeurMaille: ov.largeurMaille }),
          ...(ov.longueur && { longueur: ov.longueur }),
          ...(ov.type && { type: ov.type }),
          ...(ov.design && { design: ov.design }),
          ...(ov.securite && { securite: ov.securite }),
          ...(ov.resistance && { resistance: ov.resistance }),
          ...(ov.compatibleAvec && { compatibleAvec: ov.compatibleAvec }),
          ...(ov.paysFabrication && { paysFabrication: ov.paysFabrication }),
        };
      });
    return [...visibleHardcoded, ...mergedCustom];
  }, [overrides, customProducts]);

  const allCategories = useMemo(() => {
    const existingSlugs = new Set(SHOP_CATEGORIES.map(c => c.slug));
    const mergedHardcoded = SHOP_CATEGORIES.map(c => {
      const ov = categoryOverrides[c.slug];
      if (!ov) return c;
      return { ...c, ...ov };
    });
    
    // Deduplicate custom categories: if two custom cats have the same slug, only keep the first one
    const seenCustomSlugs = new Set(existingSlugs);
    const deduplicatedCustom = customCategories.filter(c => {
      if (seenCustomSlugs.has(c.slug)) return false;
      seenCustomSlugs.add(c.slug);
      return true;
    });
    const combined = [...mergedHardcoded, ...deduplicatedCustom];
    
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
      if (firstProduct && firstProduct.images?.[0]) {
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
