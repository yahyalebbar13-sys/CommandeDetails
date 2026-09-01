"use client";

import React, { useState, useMemo, useEffect } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Package, Search, DollarSign, Truck, Layers, BarChart3,
  ChevronLeft, ArrowRight, Tag, Image as ImageIcon,
  ExternalLink, Boxes, ShoppingCart
} from 'lucide-react';
import { getFirestore, collection, getDocs, doc, getDoc } from 'firebase/firestore';
import { getApps, getApp, initializeApp } from 'firebase/app';
import { firebaseConfig } from '@/firebase/config';
import { SHOP_CATEGORIES } from '@/lib/shop-products-data';
import type { ShopProduct } from '@/lib/shop-types';

const app = getApps().length ? getApp() : initializeApp(firebaseConfig);
const db = getFirestore(app);

interface UnifiedProductsViewProps {
  articles: any[];
  factures: any[];
  subCategories: any[];
  generalCategories: any[];
}

// ── Row helper ─────────────────────────────────────────────────────
function Row({ label, value, bold, mono, highlight }: {
  label: string; value?: string | number | null; bold?: boolean; mono?: boolean; highlight?: boolean;
}) {
  const display = value != null && value !== '' ? String(value) : '—';
  const isEmpty = display === '—';
  return (
    <div className="flex items-baseline justify-between gap-2 text-[10px]">
      <span className="text-stone-400 font-bold uppercase shrink-0">{label}</span>
      <span className={`text-right truncate ${
        isEmpty ? 'text-stone-200' : highlight ? 'text-emerald-700 font-black' : bold ? 'font-black text-stone-900' : mono ? 'font-mono text-[9px] text-stone-500' : 'font-black text-stone-700'
      }`}>{display}</span>
    </div>
  );
}

export default function UnifiedProductsView({
  articles, factures, subCategories, generalCategories,
}: UnifiedProductsViewProps) {
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedProductId, setSelectedProductId] = useState<string | null>(null);
  const [filterCategory, setFilterCategory] = useState('all');

  // ── Load shop products from Firestore ───────────────────────────
  const [shopProducts, setShopProducts] = useState<ShopProduct[]>([]);
  const [overrides, setOverrides] = useState<Record<string, any>>({});
  const [allCategories, setAllCategories] = useState(SHOP_CATEGORIES);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([
      getDocs(collection(db, 'shop_custom_products')),
      getDocs(collection(db, 'shop_product_overrides')),
      getDocs(collection(db, 'shop_custom_categories')),
      getDocs(collection(db, 'shop_category_overrides')),
    ]).then(([cpSnap, ovSnap, ccSnap, catOverSnap]) => {
      // Products
      const products = cpSnap.docs.map(d => ({ id: d.id, ...d.data() } as ShopProduct));
      setShopProducts(products);

      // Overrides
      const ov: Record<string, any> = {};
      ovSnap.docs.forEach(d => { ov[d.id] = d.data(); });
      setOverrides(ov);

      // Categories: base + overrides + custom
      const catOverrides: Record<string, any> = {};
      catOverSnap.docs.forEach(d => { catOverrides[d.id] = d.data(); });
      const mergedBase = SHOP_CATEGORIES.map(c => ({ ...c, ...(catOverrides[c.slug] || {}) }));
      const existingSlugs = new Set(SHOP_CATEGORIES.map(c => c.slug));
      const customCats = ccSnap.docs.map(d => ({ id: d.id, ...d.data() } as any)).filter((c: any) => !existingSlugs.has(c.slug));
      const allCats = [...mergedBase, ...customCats].sort((a: any, b: any) => (b.priority || 0) - (a.priority || 0));
      setAllCategories(allCats as any);
    }).catch(console.error).finally(() => setLoading(false));
  }, []);

  // Merge product with overrides
  const getMerged = (p: ShopProduct): ShopProduct => {
    const ov = overrides[p.id];
    if (!ov) return p;
    return { ...p, ...ov } as ShopProduct;
  };

  // Build category map
  const catMap = useMemo(() => new Map(allCategories.map(c => [c.slug, c])), [allCategories]);

  // ── Group products by shop category ─────────────────────────────
  const grouped = useMemo(() => {
    const lowerSearch = searchTerm.toLowerCase();
    const filtered = shopProducts.filter(p => {
      const m = getMerged(p);
      if ((overrides[p.id] as any)?.hidden) return false;
      if (filterCategory !== 'all' && m.categorySlug !== filterCategory) return false;
      if (lowerSearch && !(
        m.name.toLowerCase().includes(lowerSearch) ||
        (m.categorySlug || '').toLowerCase().includes(lowerSearch) ||
        (m.shortDescription || '').toLowerCase().includes(lowerSearch)
      )) return false;
      return true;
    });

    const groups = new Map<string, ShopProduct[]>();
    filtered.forEach(p => {
      const m = getMerged(p);
      const cat = m.categorySlug || 'autres';
      if (!groups.has(cat)) groups.set(cat, []);
      groups.get(cat)!.push(p);
    });

    // Sort by category priority
    return Array.from(groups.entries()).sort((a, b) => {
      const ca = catMap.get(a[0]);
      const cb = catMap.get(b[0]);
      return ((cb as any)?.priority || 0) - ((ca as any)?.priority || 0);
    });
  }, [shopProducts, overrides, searchTerm, filterCategory, catMap]);

  // ── Global KPIs ─────────────────────────────────────────────────
  const globalKPIs = useMemo(() => {
    const total = shopProducts.filter(p => !(overrides[p.id] as any)?.hidden).length;
    const withImages = shopProducts.filter(p => { const m = getMerged(p); return m.images?.length > 0; }).length;
    const withDesc = shopProducts.filter(p => { const m = getMerged(p); return !!(m.description || m.shortDescription); }).length;
    const linked = shopProducts.filter(p => { const ov = overrides[p.id] || {}; return !!(ov as any).stockArticleId || !!(p as any).stockArticleId; }).length;
    return { total, withImages, withDesc, linked };
  }, [shopProducts, overrides]);

  // Find linked gestion article for a shop product
  const getLinkedArticle = (p: ShopProduct) => {
    const stockId = (overrides[p.id] as any)?.stockArticleId || (p as any).stockArticleId;
    if (!stockId) return null;
    return articles.find(a => a.id === stockId) || null;
  };

  // ── DETAIL VIEW ─────────────────────────────────────────────────
  const selectedProduct = selectedProductId ? shopProducts.find(p => p.id === selectedProductId) : null;

  if (selectedProduct) {
    const merged = getMerged(selectedProduct);
    const cat = catMap.get(merged.categorySlug || '');
    const catColor = (cat as any)?.color || '#CC8626';
    const linkedArticle = getLinkedArticle(selectedProduct);
    const linkedFacture = linkedArticle?.factureId ? factures.find(f => f.id === linkedArticle.factureId) : null;
    const linkedCategory = linkedArticle?.categoryId ? subCategories.find(c => c.name === linkedArticle.categoryId) : null;

    return (
      <div className="space-y-6 fade-in">
        {/* Back + Header */}
        <div className="flex items-center gap-4">
          <Button variant="ghost" onClick={() => setSelectedProductId(null)} className="h-10 w-10 rounded-xl hover:bg-stone-100 shrink-0">
            <ChevronLeft className="w-5 h-5" />
          </Button>
          <div className="flex-1 min-w-0">
            <p className="text-[10px] font-black uppercase tracking-[0.25em] mb-0.5" style={{ color: catColor }}>{(cat as any)?.name || merged.categorySlug}</p>
            <h1 className="text-2xl font-black text-stone-900 uppercase tracking-tighter truncate">{merged.name}</h1>
            {merged.nameAr && <p className="text-sm text-stone-400 font-bold mt-0.5" dir="rtl">{merged.nameAr}</p>}
          </div>
          <div className="px-4 py-2 rounded-xl" style={{ backgroundColor: `${catColor}15`, color: catColor }}>
            <p className="text-[9px] font-black uppercase tracking-widest">{merged.price ? `${merged.price} MAD` : '—'}</p>
          </div>
        </div>

        {/* Images */}
        {merged.images?.length > 0 && (
          <div className="flex gap-3 overflow-x-auto pb-2">
            {merged.images.map((img: string, i: number) => (
              <img key={i} src={img} alt={merged.name} className="w-32 h-32 rounded-2xl object-cover shadow-md border border-stone-100 shrink-0" />
            ))}
          </div>
        )}

        {/* Detail cards grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">

          {/* Identité Produit Shop */}
          <Card className="border-none shadow-md rounded-2xl overflow-hidden">
            <div className="h-1 w-full" style={{ backgroundColor: catColor }} />
            <CardContent className="p-5 space-y-2">
              <h4 className="text-[10px] font-black text-stone-500 uppercase tracking-wider flex items-center gap-1.5 pb-2 border-b border-stone-100"><ShoppingCart className="w-3.5 h-3.5" /> Produit Shop</h4>
              <Row label="Nom FR" value={merged.name} bold />
              <Row label="Nom AR" value={merged.nameAr} />
              <Row label="Nom catalogue" value={merged.catalogueName} />
              <Row label="Catégorie" value={(cat as any)?.name} />
              <Row label="Prix" value={merged.price ? `${merged.price} MAD` : '—'} highlight />
              <Row label="Prix barré" value={merged.comparePrice ? `${merged.comparePrice} MAD` : '—'} />
              <Row label="Prix gros" value={(merged as any).wholesalePrice ? `${(merged as any).wholesalePrice} MAD` : '—'} />
              <Row label="Min commande" value={merged.minOrderQty} />
              <Row label="En vedette" value={merged.isFeatured ? 'Oui' : 'Non'} />
              <Row label="Nouveau" value={merged.isNew ? 'Oui' : 'Non'} />
              <Row label="Stock" value={merged.inStock === false ? 'Rupture' : 'Disponible'} />
              <Row label="ID" value={merged.id} mono />
            </CardContent>
          </Card>

          {/* Description */}
          <Card className="border-none shadow-md rounded-2xl overflow-hidden">
            <div className="h-1 w-full bg-blue-500" />
            <CardContent className="p-5 space-y-2">
              <h4 className="text-[10px] font-black text-stone-500 uppercase tracking-wider flex items-center gap-1.5 pb-2 border-b border-stone-100"><Tag className="w-3.5 h-3.5" /> Description & Specs</h4>
              <div className="space-y-3">
                {merged.shortDescription && (
                  <div>
                    <p className="text-[8px] font-black text-stone-400 uppercase mb-1">Description courte</p>
                    <p className="text-xs text-stone-600">{merged.shortDescription}</p>
                  </div>
                )}
                {merged.description && (
                  <div>
                    <p className="text-[8px] font-black text-stone-400 uppercase mb-1">Description</p>
                    <p className="text-xs text-stone-600 whitespace-pre-line">{merged.description}</p>
                  </div>
                )}
                {(merged as any).composition && <Row label="Composition" value={(merged as any).composition} />}
                {(merged as any).matiere && <Row label="Matière" value={(merged as any).matiere} />}
                {(merged as any).paysFabrication && <Row label="Origine" value={(merged as any).paysFabrication} />}
                {(merged as any).utilisation && <Row label="Utilisation" value={(merged as any).utilisation} />}
              </div>
            </CardContent>
          </Card>

          {/* Variantes */}
          {merged.variants?.length > 0 && (
            <Card className="border-none shadow-md rounded-2xl overflow-hidden">
              <div className="h-1 w-full bg-pink-500" />
              <CardContent className="p-5 space-y-2">
                <h4 className="text-[10px] font-black text-stone-500 uppercase tracking-wider flex items-center gap-1.5 pb-2 border-b border-stone-100"><Layers className="w-3.5 h-3.5" /> Variantes · {merged.variants.length}</h4>
                <div className="max-h-64 overflow-y-auto space-y-1.5">
                  {merged.variants.map((v: any) => (
                    <div key={v.id} className="flex items-center gap-2 text-[10px] py-1">
                      <div className="w-4 h-4 rounded-full border border-stone-200 shrink-0" style={{ backgroundColor: v.colorHex || '#e7e5e4' }} />
                      <span className="font-black text-stone-700 flex-1 truncate">{v.color || v.size || v.id}</span>
                      {v.size && <span className="text-stone-400">{v.size}</span>}
                      <span className={`font-bold ${v.stock > 0 || v.stockStatus === 'available' ? 'text-emerald-600' : 'text-stone-300'}`}>
                        {v.stock != null ? v.stock : (v.stockStatus === 'available' ? '✓' : '✗')}
                      </span>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}

          {/* Article Gestion lié */}
          {linkedArticle && (
            <Card className="border-none shadow-md rounded-2xl overflow-hidden">
              <div className="h-1 w-full bg-amber-500" />
              <CardContent className="p-5 space-y-2">
                <h4 className="text-[10px] font-black text-stone-500 uppercase tracking-wider flex items-center gap-1.5 pb-2 border-b border-stone-100"><Package className="w-3.5 h-3.5" /> Article Gestion lié</h4>
                <Row label="Nom EN" value={linkedArticle.name} bold />
                <Row label="Specs" value={linkedArticle.specs} />
                <Row label="Catégorie" value={linkedArticle.categoryId} />
                <Row label="Couleur" value={linkedArticle.color} />
                <Row label="Taille" value={linkedArticle.size} />
                <Row label="Fournisseur" value={linkedArticle.supplierId} bold />
                <Row label="Quantité" value={`${Number(linkedArticle.quantity || 0).toLocaleString('fr-MA')} ${linkedArticle.unitOfMeasure || ''}`} />
                <Row label="Prix FOB" value={Number(linkedArticle.purchasePricePerUnit) > 0 ? `$${Number(linkedArticle.purchasePricePerUnit).toFixed(4)}` : '—'} />
                <Row label="Prix MAD" value={Number(linkedArticle.purchasePriceMAD) > 0 ? `${Number(linkedArticle.purchasePriceMAD).toFixed(2)} MAD` : '—'} />
                <Row label="Statut" value={linkedArticle.status || linkedArticle.effectiveStatus} />
                <Row label="ID" value={linkedArticle.id} mono />
              </CardContent>
            </Card>
          )}

          {/* Dossier Import */}
          {linkedFacture && (
            <Card className="border-none shadow-md rounded-2xl overflow-hidden">
              <div className="h-1 w-full bg-violet-500" />
              <CardContent className="p-5 space-y-2">
                <h4 className="text-[10px] font-black text-stone-500 uppercase tracking-wider flex items-center gap-1.5 pb-2 border-b border-stone-100"><Boxes className="w-3.5 h-3.5" /> Dossier Import</h4>
                <Row label="Dossier" value={linkedFacture.id} bold mono />
                <Row label="Fournisseur" value={linkedFacture.supplierId} />
                <Row label="Expédition" value={linkedFacture.shippingDate} />
                <Row label="Arrivée" value={linkedFacture.arrivalDate} />
                <Row label="Stock" value={linkedFacture.stockEntryDate} />
                <Row label="Transitaire" value={linkedFacture.forwarder} />
                <Row label="Fret" value={linkedFacture.freightCost ? `$${Number(linkedFacture.freightCost).toFixed(2)}` : '—'} />
              </CardContent>
            </Card>
          )}

          {/* Douane */}
          {linkedCategory?.hsCode && (
            <Card className="border-none shadow-md rounded-2xl overflow-hidden">
              <div className="h-1 w-full bg-orange-500" />
              <CardContent className="p-5 space-y-2">
                <h4 className="text-[10px] font-black text-stone-500 uppercase tracking-wider flex items-center gap-1.5 pb-2 border-b border-stone-100"><Truck className="w-3.5 h-3.5" /> Douane</h4>
                <Row label="Code HS" value={linkedCategory.hsCode} mono bold />
                <Row label="Val. douane/kg" value={linkedCategory.customsValuePerKg ? `${linkedCategory.customsValuePerKg} MAD/kg` : '—'} />
                <Row label="DI" value={linkedCategory.importDutyRate ? `${linkedCategory.importDutyRate}%` : '—'} />
                <Row label="TPI" value={linkedCategory.tpiRate ? `${linkedCategory.tpiRate}%` : '—'} />
                <Row label="TVA" value={linkedCategory.tvaRate ? `${linkedCategory.tvaRate}%` : '—'} />
              </CardContent>
            </Card>
          )}

          {/* Pas d'article lié */}
          {!linkedArticle && (
            <Card className="border-none shadow-md rounded-2xl overflow-hidden border-2 border-dashed border-stone-100">
              <CardContent className="p-5 flex flex-col items-center justify-center text-center py-8">
                <Package className="w-8 h-8 text-stone-200 mb-2" />
                <p className="text-[10px] font-black text-stone-300 uppercase tracking-wider">Aucun article Gestion lié</p>
                <p className="text-[9px] text-stone-300 mt-1">Liez cet article dans Admin Shop → Modifier</p>
              </CardContent>
            </Card>
          )}
        </div>
      </div>
    );
  }

  // ── MAIN VIEW: Cards grid by category ───────────────────────────
  if (loading) {
    return (
      <div className="py-24 text-center">
        <div className="w-8 h-8 border-2 border-amber-500 border-t-transparent rounded-full animate-spin mx-auto mb-4" />
        <p className="text-[10px] font-black text-stone-400 uppercase tracking-widest">Chargement des produits...</p>
      </div>
    );
  }

  return (
    <div className="space-y-8 fade-in">
      {/* ── Header ── */}
      <div className="bg-stone-900 rounded-[2rem] p-8 shadow-2xl relative overflow-hidden">
        <div className="absolute top-0 right-0 w-[500px] h-[500px] bg-amber-500/8 rounded-full -translate-y-1/2 translate-x-1/2 blur-[120px] pointer-events-none" />
        <div className="relative z-10 flex flex-col lg:flex-row justify-between items-start lg:items-center gap-6">
          <div>
            <p className="text-[10px] font-black text-amber-500 uppercase tracking-[0.25em] mb-2">Catalogue Unifié</p>
            <h1 className="text-3xl font-black text-white uppercase tracking-tighter leading-none">
              Fiches<br /><span className="text-amber-500">Produits</span>
            </h1>
            <p className="text-stone-400 text-xs font-medium mt-3 max-w-sm">
              Tous les produits avec descriptions, photos, prix, variantes et articles Gestion liés.
            </p>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 w-full lg:w-auto">
            {[
              { label: 'Produits', value: globalKPIs.total, icon: Package, color: 'text-amber-400' },
              { label: 'Avec photos', value: globalKPIs.withImages, icon: ImageIcon, color: 'text-blue-400' },
              { label: 'Avec desc.', value: globalKPIs.withDesc, icon: Tag, color: 'text-emerald-400' },
              { label: 'Liés stock', value: globalKPIs.linked, icon: Boxes, color: 'text-violet-400' },
            ].map(({ label, value, icon: Icon, color }) => (
              <div key={label} className="bg-white/5 border border-white/10 rounded-xl p-4 backdrop-blur-md text-center">
                <Icon className={`w-4 h-4 ${color} mx-auto mb-2`} />
                <p className={`text-lg font-black ${color} leading-none`}>{value}</p>
                <p className="text-[8px] font-black text-stone-500 uppercase tracking-widest mt-1">{label}</p>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* ── Toolbar ── */}
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3">
        <div className="relative flex-1 max-w-xs">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-stone-400" />
          <Input placeholder="Rechercher un produit..." value={searchTerm} onChange={e => setSearchTerm(e.target.value)}
            className="pl-9 h-10 text-[10px] font-bold border-stone-200 bg-white rounded-xl" />
        </div>
        <select value={filterCategory} onChange={e => setFilterCategory(e.target.value)}
          className="h-10 rounded-xl border border-stone-200 px-3 text-[10px] font-black uppercase tracking-wider text-stone-600 bg-white">
          <option value="all">Toutes catégories</option>
          {allCategories.map(c => <option key={c.slug} value={c.slug}>{c.name}</option>)}
        </select>
      </div>

      {/* ── Content: sections by shop category ── */}
      <div className="space-y-10">
        {grouped.length === 0 ? (
          <div className="py-24 text-center border-2 border-dashed border-stone-100 rounded-[2rem] bg-white/50">
            <Package className="w-12 h-12 text-stone-200 mx-auto mb-4" />
            <p className="text-stone-300 font-black uppercase tracking-[0.2em] text-[9px]">Aucun produit trouvé</p>
          </div>
        ) : (
          grouped.map(([categorySlug, products]) => {
            const cat = catMap.get(categorySlug);
            const catColor = (cat as any)?.color || '#CC8626';
            const catName = (cat as any)?.name || categorySlug;
            const catIcon = (cat as any)?.icon || '📦';

            return (
              <div key={categorySlug} className="space-y-4">
                {/* Section header */}
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="w-1.5 h-6 rounded-full" style={{ backgroundColor: catColor }} />
                    <span className="text-lg">{catIcon}</span>
                    <h3 className="text-lg font-black text-stone-900 uppercase tracking-tighter">{catName}</h3>
                    <span className="text-[8px] font-black text-stone-400 bg-stone-100 px-2 py-0.5 rounded-full uppercase">
                      {products.length} produits
                    </span>
                  </div>
                </div>

                {/* Product cards */}
                <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4">
                  {products.map((product, index) => {
                    const merged = getMerged(product);
                    const hasImage = merged.images?.length > 0;
                    const linked = getLinkedArticle(product);
                    const variantCount = merged.variants?.length || 0;

                    return (
                      <Card key={product.id} onClick={() => setSelectedProductId(product.id)}
                        className="group cursor-pointer border-none bg-white shadow-md hover:shadow-xl transition-all duration-300 rounded-[1.2rem] overflow-hidden active:scale-95">
                        {/* Image or accent bar */}
                        {hasImage ? (
                          <div className="h-28 w-full overflow-hidden">
                            <img src={merged.images[0]} alt={merged.name} className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500" />
                          </div>
                        ) : (
                          <div className="h-1 w-full" style={{ backgroundColor: catColor }} />
                        )}

                        <CardContent className="p-4">
                          {/* Name */}
                          <h3 className="text-[11px] font-black text-stone-800 uppercase leading-tight tracking-tighter group-hover:text-stone-900 line-clamp-2 min-h-[2rem] mb-1">
                            {merged.name}
                          </h3>
                          {merged.shortDescription && (
                            <p className="text-[8px] text-stone-400 line-clamp-2 mb-3">{merged.shortDescription}</p>
                          )}

                          {/* Stats */}
                          <div className="pt-2 border-t border-stone-50 space-y-1.5">
                            <div className="flex justify-between items-center text-[8px]">
                              <span className="text-stone-400 font-black uppercase flex items-center gap-1"><DollarSign className="w-2.5 h-2.5" /> PRIX</span>
                              <span className="font-black" style={{ color: catColor }}>{merged.price ? `${merged.price} MAD` : '—'}</span>
                            </div>
                            {variantCount > 0 && (
                              <div className="flex justify-between items-center text-[8px]">
                                <span className="text-stone-400 font-black uppercase flex items-center gap-1"><Layers className="w-2.5 h-2.5" /> VARIANTES</span>
                                <span className="font-black text-stone-900">{variantCount}</span>
                              </div>
                            )}
                          </div>

                          {/* Footer */}
                          <div className="mt-3 flex justify-between items-center">
                            <div className="flex items-center gap-1">
                              {linked && (
                                <span className="px-2 py-0.5 rounded text-[7px] font-black uppercase bg-emerald-50 text-emerald-600">LIÉ</span>
                              )}
                              {!hasImage && (
                                <span className="px-2 py-0.5 rounded text-[7px] font-black uppercase bg-stone-50 text-stone-400">PAS D'IMAGE</span>
                              )}
                            </div>
                            <div className="p-1 bg-stone-50 rounded opacity-0 group-hover:opacity-100 transition-all translate-x-2 group-hover:translate-x-0">
                              <ArrowRight className="w-2.5 h-2.5 text-stone-900" />
                            </div>
                          </div>
                        </CardContent>
                      </Card>
                    );
                  })}
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
