/**
 * ProductMaster Service — CRUD + liaison + synchronisation
 * 
 * Gère la collection Firestore `products_master` et fournit des hooks React
 * pour accéder aux données unifiées des produits.
 */

import { useState, useEffect, useMemo } from 'react';
import { initializeApp, getApps, getApp } from 'firebase/app';
import {
  getFirestore,
  collection,
  doc,
  getDoc,
  getDocs,
  setDoc,
  updateDoc,
  deleteDoc,
  onSnapshot,
  serverTimestamp,
  writeBatch,
} from 'firebase/firestore';
import { firebaseConfig } from '@/firebase/config';
import type { ProductMaster } from './product-master-types';
import { normalizeProductName } from './product-master-types';

const app = getApps().length ? getApp() : initializeApp(firebaseConfig);
const db = getFirestore(app);

const COLLECTION = 'products_master';

// ── CRUD Operations ──────────────────────────────────────────────────────────

/**
 * Récupère tous les ProductMaster
 */
export async function getAllProductMasters(): Promise<ProductMaster[]> {
  const snap = await getDocs(collection(db, COLLECTION));
  return snap.docs.map(d => ({ id: d.id, ...d.data() } as ProductMaster));
}

/**
 * Récupère un ProductMaster par ID
 */
export async function getProductMaster(id: string): Promise<ProductMaster | null> {
  const snap = await getDoc(doc(db, COLLECTION, id));
  if (!snap.exists()) return null;
  return { id: snap.id, ...snap.data() } as ProductMaster;
}

/**
 * Crée ou met à jour un ProductMaster
 */
export async function saveProductMaster(pm: Partial<ProductMaster> & { id: string }): Promise<void> {
  const { id, ...data } = pm;
  await setDoc(doc(db, COLLECTION, id), {
    ...data,
    updatedAt: serverTimestamp(),
  }, { merge: true });
}

/**
 * Met à jour des champs spécifiques d'un ProductMaster
 */
export async function updateProductMasterFields(
  id: string,
  fields: Partial<Omit<ProductMaster, 'id'>>
): Promise<void> {
  await updateDoc(doc(db, COLLECTION, id), {
    ...fields,
    updatedAt: serverTimestamp(),
  });
}

/**
 * Supprime un ProductMaster
 */
export async function deleteProductMaster(id: string): Promise<void> {
  await deleteDoc(doc(db, COLLECTION, id));
}

// ── Linking Operations ───────────────────────────────────────────────────────

/**
 * Lie un article Gestion à un ProductMaster
 */
export async function linkGestionArticle(masterId: string, articleId: string): Promise<void> {
  const pm = await getProductMaster(masterId);
  if (!pm) throw new Error(`ProductMaster ${masterId} introuvable`);

  const ids = new Set(pm.gestionArticleIds || []);
  ids.add(articleId);

  await updateProductMasterFields(masterId, {
    gestionArticleIds: Array.from(ids),
  });
}

/**
 * Délie un article Gestion d'un ProductMaster
 */
export async function unlinkGestionArticle(masterId: string, articleId: string): Promise<void> {
  const pm = await getProductMaster(masterId);
  if (!pm) return;

  await updateProductMasterFields(masterId, {
    gestionArticleIds: (pm.gestionArticleIds || []).filter(id => id !== articleId),
  });
}

/**
 * Lie un produit Shop à un ProductMaster
 */
export async function linkShopProduct(masterId: string, shopProductId: string): Promise<void> {
  await updateProductMasterFields(masterId, { shopProductId });
}

/**
 * Délie le produit Shop d'un ProductMaster
 */
export async function unlinkShopProduct(masterId: string): Promise<void> {
  await updateProductMasterFields(masterId, { shopProductId: '' });
}

// ── Auto-Matching ────────────────────────────────────────────────────────────

interface MatchCandidate {
  gestionArticle: any;
  shopProduct: any;
  score: number;
}

/**
 * Tente de matcher automatiquement les articles Gestion avec les produits Shop
 * basé sur la similarité des noms normalisés
 */
export function findAutoMatches(
  gestionArticles: any[],
  shopProducts: any[]
): MatchCandidate[] {
  const matches: MatchCandidate[] = [];

  for (const article of gestionArticles) {
    const articleName = normalizeProductName(article.name || '');
    if (!articleName) continue;

    for (const product of shopProducts) {
      const productName = normalizeProductName(product.name || '');
      if (!productName) continue;

      // Calculate similarity score
      let score = 0;

      // Exact match
      if (articleName === productName) {
        score = 100;
      }
      // One contains the other
      else if (articleName.includes(productName) || productName.includes(articleName)) {
        score = 70;
      }
      // Word overlap
      else {
        const articleWords = new Set(articleName.match(/[a-z0-9]+/g) || []);
        const productWords = new Set(productName.match(/[a-z0-9]+/g) || []);
        const common = [...articleWords].filter(w => productWords.has(w));
        const total = new Set([...articleWords, ...productWords]).size;
        if (total > 0) {
          score = Math.round((common.length / total) * 100);
        }
      }

      if (score >= 40) {
        matches.push({ gestionArticle: article, shopProduct: product, score });
      }
    }
  }

  // Sort by score descending
  matches.sort((a, b) => b.score - a.score);
  return matches;
}

// ── Build from existing data ─────────────────────────────────────────────────

/**
 * Crée un ProductMaster à partir d'un article Gestion
 */
export function buildMasterFromGestionArticle(article: any): Omit<ProductMaster, 'id'> {
  const parts: string[] = [];
  if (article.zipperType) parts.push(article.zipperType);
  if (article.slider) parts.push(article.slider);
  const fallbackName = parts.length > 0 ? parts.join(' ') : (article.name || article.specs || 'Produit');

  return {
    nameEN: article.name || fallbackName,
    nameFR: '',  // À remplir via le Shop ou manuellement
    nameAR: '',
    nameStock: '', // À remplir manuellement par l'utilisateur
    gestionArticleIds: [article.id],
    gestionCategoryId: article.categoryId || '',
    gestionGeneralCategoryId: article.generalCategoryId || '',
    specs: article.specs || '',
    color: article.color || '',
    unitOfMeasure: article.unitOfMeasure || '',
    purchasePriceFOB: Number(article.purchasePricePerUnit) || 0,
    purchasePriceMAD: Number(article.purchasePriceMAD) || 0,
    supplierId: article.supplierId || '',
    images: [],
    tags: [],
  };
}

/**
 * Crée un ProductMaster à partir d'un produit Shop
 */
export function buildMasterFromShopProduct(product: any): Omit<ProductMaster, 'id'> {
  return {
    nameEN: '',  // À remplir via Gestion ou manuellement
    nameFR: product.name || '',
    nameAR: product.nameAr || '',
    nameStock: '',
    gestionArticleIds: product.stockArticleId ? [product.stockArticleId] : [],
    shopProductId: product.id,
    shopCategorySlug: product.categorySlug || '',
    specs: product.specification || '',
    unitOfMeasure: '',
    sellingPrice: Number(product.price) || 0,
    wholesalePrice: Number(product.wholesalePrice) || 0,
    shortDescription: product.shortDescription || '',
    description: product.description || '',
    images: product.images || [],
    tags: product.tags || [],
  };
}

// ── Batch Migration ──────────────────────────────────────────────────────────

/**
 * Migration en batch — crée des ProductMaster à partir d'articles Gestion
 * qui ne sont pas encore liés à aucun ProductMaster existant.
 * Retourne le nombre de documents créés.
 */
export async function batchCreateFromGestionArticles(
  articles: any[],
  existingMasters: ProductMaster[]
): Promise<number> {
  // Collect all already-linked article IDs
  const linkedIds = new Set<string>();
  for (const pm of existingMasters) {
    for (const aid of pm.gestionArticleIds || []) {
      linkedIds.add(aid);
    }
  }

  // Filter unlinked articles
  const unlinked = articles.filter(a => !linkedIds.has(a.id));
  if (unlinked.length === 0) return 0;

  // Group by normalized name + category + color to avoid duplicates
  const groups = new Map<string, any[]>();
  for (const a of unlinked) {
    const key = `${normalizeProductName(a.name || '')}__${a.categoryId || ''}__${normalizeProductName(a.color || '')}`;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key)!.push(a);
  }

  // Create ProductMasters in batches of 500
  let created = 0;
  const entries = Array.from(groups.entries());

  for (let i = 0; i < entries.length; i += 500) {
    const batch = writeBatch(db);
    const chunk = entries.slice(i, i + 500);

    for (const [, groupArticles] of chunk) {
      const ref = doc(collection(db, COLLECTION));
      const first = groupArticles[0];
      const master = buildMasterFromGestionArticle(first);
      master.gestionArticleIds = groupArticles.map((a: any) => a.id);

      batch.set(ref, {
        ...master,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
      created++;
    }

    await batch.commit();
  }

  return created;
}

// ── React Hook ───────────────────────────────────────────────────────────────

/**
 * Hook React pour écouter en temps réel la collection products_master
 */
export function useProductMasters() {
  const [masters, setMasters] = useState<ProductMaster[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const ref = collection(db, COLLECTION);
    const unsub = onSnapshot(ref, (snap) => {
      const data = snap.docs.map(d => ({ id: d.id, ...d.data() } as ProductMaster));
      setMasters(data);
      setIsLoading(false);
    }, (err) => {
      console.error('[useProductMasters] Error:', err);
      setIsLoading(false);
    });

    return () => unsub();
  }, []);

  return { masters, isLoading };
}

/**
 * Hook React pour construire une vue unifiée enrichie
 * Combine ProductMasters avec les données Gestion et Shop en mémoire
 */
export function useEnrichedProductMasters(
  masters: ProductMaster[],
  gestionArticles: any[],
  shopProducts: any[],
  shopCategories: any[],
  gestionCategories: any[]
) {
  return useMemo(() => {
    const articleMap = new Map(gestionArticles.map(a => [a.id, a]));
    const shopMap = new Map(shopProducts.map(p => [p.id, p]));
    const shopCatMap = new Map(shopCategories.map(c => [c.slug || c.id, c]));
    const gestCatMap = new Map(gestionCategories.map(c => [c.name || c.id, c]));

    return masters.map(pm => {
      // Enrich with linked Gestion articles
      const linkedArticles = (pm.gestionArticleIds || [])
        .map(id => articleMap.get(id))
        .filter(Boolean);

      // Enrich with linked Shop product
      const linkedShopProduct = pm.shopProductId ? shopMap.get(pm.shopProductId) : null;

      // Get category names
      const gestionCategoryName = pm.gestionCategoryId || '';
      const shopCategoryName = pm.shopCategorySlug
        ? (shopCatMap.get(pm.shopCategorySlug)?.name || pm.shopCategorySlug)
        : '';

      // Calculate total Gestion quantities
      const totalGestionQty = linkedArticles.reduce((sum: number, a: any) => sum + (Number(a?.quantity) || 0), 0);

      return {
        ...pm,
        linkedArticles,
        linkedShopProduct,
        gestionCategoryName,
        shopCategoryName,
        totalGestionQty,
      };
    });
  }, [masters, gestionArticles, shopProducts, shopCategories, gestionCategories]);
}
