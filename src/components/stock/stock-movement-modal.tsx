"use client";

import React, { useState, useEffect, useMemo } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import type { StockMovement, StockMovementReason, StockMovementType, StockItem } from '@/lib/types';
import {
  ArrowDown, ArrowUp, SlidersHorizontal, PackageCheck,
  ChevronLeft, Package, Layers, CheckCircle2, AlertTriangle, Search
} from 'lucide-react';

// ── Helpers ───────────────────────────────────────────────────────────────────
const UI_COLORS = ['#CC8626','#1E293B','#3B82F6','#10B981','#6366F1','#F43F5E','#8B5CF6','#EC4899'];
function fmt(n: number) { return Math.round(n).toLocaleString('fr-MA'); }

interface StockMovementModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  articles: any[];
  categories: any[];
  generalCategories?: any[];
  stockItems: StockItem[];
  stores: Store[];
  preselectedArticleId?: string;
  preselectedType?: StockMovementType;
  activeStore?: StoreLocation | 'ALL';
  onSubmit: (movement: Omit<StockMovement, 'id' | 'createdAt'>) => Promise<void>;
}

const REASONS_BY_TYPE: Record<StockMovementType, { value: StockMovementReason; label: string }[]> = {
  IN: [
    { value: 'ARRIVAGE',   label: '📦 Arrivage fournisseur' },
    { value: 'RETOUR',     label: '↩️ Retour client' },
    { value: 'INVENTAIRE', label: '🔄 Ajustement inventaire' },
  ],
  OUT: [
    { value: 'VENTE',      label: '🛒 Vente / Livraison' },
    { value: 'PERTE',      label: '❌ Perte / Casse' },
    { value: 'INVENTAIRE', label: '🔄 Ajustement inventaire' },
  ],
  ADJUSTMENT: [
    { value: 'INVENTAIRE', label: '🔄 Régularisation inventaire' },
    { value: 'PERTE',      label: '❌ Perte / Différence' },
  ],
};

const TYPE_CONFIG = {
  IN:         { label: 'Entrée Stock',  color: 'emerald', icon: ArrowDown },
  OUT:        { label: 'Sortie Stock',  color: 'red',     icon: ArrowUp },
  ADJUSTMENT: { label: 'Ajustement',   color: 'blue',    icon: SlidersHorizontal },
};

// ── Picker produit — Famille → Sous-cat → Produit ────────────────────────────
function ProductPicker({
  stockItems, categories, generalCategories, onSelect
}: {
  stockItems: StockItem[];
  categories: any[];
  generalCategories: any[];
  onSelect: (articleId: string) => void;
}) {
  const [step, setStep] = useState<'gencat' | 'subcat' | 'product'>('gencat');
  const [selGenCat, setSelGenCat] = useState<string | null>(null);
  const [selSubCat, setSelSubCat] = useState<string | null>(null);
  const [search, setSearch] = useState('');

  // Index stockItems par categoryId
  const stockByCat = useMemo(() => {
    const map: Record<string, StockItem[]> = {};
    stockItems.forEach(si => {
      const k = si.categoryId || '';
      if (!map[k]) map[k] = [];
      map[k].push(si);
    });
    return map;
  }, [stockItems]);

  // General categories qui ont du stock
  const genCatsWS = useMemo(() => {
    const ids = new Set<string>();
    stockItems.forEach(si => {
      const cat = categories.find(c => c.name === si.categoryId || c.id === si.categoryId);
      if (cat?.generalCategoryId) ids.add(cat.generalCategoryId);
    });
    return (generalCategories || []).filter(gc => ids.has(gc.id));
  }, [generalCategories, stockItems, categories]);

  // Sub-categories d'une general cat avec du stock
  const subCatsWS = useMemo(() => {
    if (!selGenCat) return [];
    return categories.filter(c =>
      c.generalCategoryId === selGenCat &&
      (stockByCat[c.name]?.length || 0) > 0
    );
  }, [categories, selGenCat, stockByCat]);

  // Produits d'une sub-category
  const products = useMemo(() => {
    if (!selSubCat) return [];
    const sc = categories.find(c => c.id === selSubCat || c.name === selSubCat);
    const items = stockByCat[sc?.name || selSubCat] || [];
    if (!search.trim()) return items;
    const q = search.toLowerCase();
    return items.filter(i =>
      (i.productName || '').toLowerCase().includes(q) ||
      (i.color || '').toLowerCase().includes(q) ||
      (i.size || '').toLowerCase().includes(q)
    );
  }, [selSubCat, stockByCat, categories, search]);

  // ── Step 1 : Famille ────────────────────────────────────────────────────────
  if (step === 'gencat') {
    // Fallback si pas de general categories : aller direct aux sub-cats
    if (genCatsWS.length === 0) {
      // Pas de general categories configurées → lister les sub-categories directement
      const subCatsAll = categories.filter(c => (stockByCat[c.name]?.length || 0) > 0);
      return (
        <div className="space-y-2">
          <p className="text-[8px] font-black text-stone-400 uppercase tracking-widest">Choisir une famille</p>
          <div className="grid grid-cols-2 gap-2 max-h-[200px] overflow-y-auto">
            {subCatsAll.map((sc, idx) => {
              const count = stockByCat[sc.name]?.length || 0;
              const color = UI_COLORS[idx % UI_COLORS.length];
              return (
                <button key={sc.id} type="button"
                  onClick={() => { setSelSubCat(sc.id || sc.name); setStep('product'); }}
                  className="flex items-center gap-2 px-3 py-2.5 rounded-xl border-2 border-stone-100 hover:border-stone-300 bg-stone-50 hover:bg-white transition-all text-left"
                  style={{ borderLeftColor: color, borderLeftWidth: 4 }}
                >
                  <Layers className="w-3 h-3 shrink-0" style={{ color }} />
                  <div>
                    <p className="text-[9px] font-black text-stone-800 uppercase">{sc.name}</p>
                    <p className="text-[7px] text-stone-400 font-bold">{count} réf.</p>
                  </div>
                </button>
              );
            })}
          </div>
        </div>
      );
    }

    return (
      <div className="space-y-2">
        <p className="text-[8px] font-black text-stone-400 uppercase tracking-widest">1 · Choisir une famille</p>
        <div className="grid grid-cols-2 gap-2 max-h-[200px] overflow-y-auto pr-1">
          {genCatsWS.map((gc, idx) => {
            const gcSubs  = categories.filter(c => c.generalCategoryId === gc.id);
            const gcItems = stockItems.filter(i => gcSubs.some(s => s.name === i.categoryId || s.id === i.categoryId));
            const color   = UI_COLORS[idx % UI_COLORS.length];
            return (
              <button key={gc.id} type="button"
                onClick={() => { setSelGenCat(gc.id); setStep('subcat'); }}
                className="flex items-center gap-2 px-3 py-2.5 rounded-xl border-2 border-stone-100 hover:border-stone-300 bg-stone-50 hover:bg-white transition-all text-left"
                style={{ borderLeftColor: color, borderLeftWidth: 4 }}
              >
                <Layers className="w-3.5 h-3.5 shrink-0" style={{ color }} />
                <div>
                  <p className="text-[9px] font-black text-stone-800 uppercase leading-tight">{gc.name}</p>
                  <p className="text-[7px] text-stone-400 font-bold">{gcItems.length} réf. en stock</p>
                </div>
              </button>
            );
          })}
        </div>
      </div>
    );
  }

  // ── Step 2 : Sous-catégorie ─────────────────────────────────────────────────
  if (step === 'subcat') {
    const gc = (generalCategories || []).find(g => g.id === selGenCat);
    return (
      <div className="space-y-2">
        <div className="flex items-center gap-2">
          <button type="button" onClick={() => { setStep('gencat'); setSelGenCat(null); }}
            className="flex items-center gap-1 text-[8px] font-black text-stone-400 hover:text-stone-700 uppercase tracking-widest transition-colors">
            <ChevronLeft className="w-3 h-3" /> Retour
          </button>
          <span className="text-stone-200">/</span>
          <span className="text-[8px] font-black text-stone-700 uppercase">{gc?.name}</span>
        </div>
        <p className="text-[8px] font-black text-stone-400 uppercase tracking-widest">2 · Choisir une sous-catégorie</p>
        <div className="grid grid-cols-2 gap-2 max-h-[200px] overflow-y-auto pr-1">
          {subCatsWS.map((sc, idx) => {
            const count = stockByCat[sc.name]?.length || 0;
            const color = UI_COLORS[idx % UI_COLORS.length];
            return (
              <button key={sc.id} type="button"
                onClick={() => { setSelSubCat(sc.id || sc.name); setStep('product'); }}
                className="flex items-center gap-2 px-3 py-2.5 rounded-xl border-2 border-stone-100 hover:border-stone-300 bg-stone-50 hover:bg-white transition-all text-left"
                style={{ borderLeftColor: color, borderLeftWidth: 4 }}
              >
                <Layers className="w-3 h-3 shrink-0" style={{ color }} />
                <div>
                  <p className="text-[9px] font-black text-stone-800 uppercase leading-tight">{sc.name}</p>
                  <p className="text-[7px] text-stone-400 font-bold">{count} réf.</p>
                </div>
              </button>
            );
          })}
        </div>
      </div>
    );
  }

  // ── Step 3 : Produits groupés par nom → variantes couleur/taille avec qtés exactes ──
  const sc = categories.find(c => c.id === selSubCat || c.name === selSubCat);
  const colorMap: Record<string, string> = {
    rouge:'#ef4444',red:'#ef4444',bleu:'#3b82f6',blue:'#3b82f6',vert:'#22c55e',green:'#22c55e',
    noir:'#1c1917',black:'#1c1917',blanc:'#f0f0f0',white:'#e5e7eb',gris:'#6b7280',grey:'#6b7280',
    jaune:'#eab308',yellow:'#eab308',orange:'#f97316',violet:'#8b5cf6',rose:'#f43f5e',pink:'#ec4899',
    marron:'#92400e',brown:'#92400e',beige:'#d6c5a3',marine:'#1e3a5f',bordeaux:'#6b1e2b',
    kaki:'#6b7a42',turquoise:'#14b8a6',navy:'#1e3a5f',
  };

  // Grouper par nom de produit
  const grouped = new Map<string, StockItem[]>();
  products.forEach(si => {
    if (!grouped.has(si.productName)) grouped.set(si.productName, []);
    grouped.get(si.productName)!.push(si);
  });

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2">
        <button type="button"
          onClick={() => { setStep('subcat'); setSelSubCat(null); setSearch(''); }}
          className="flex items-center gap-1 text-[8px] font-black text-stone-400 hover:text-stone-700 uppercase tracking-widest transition-colors">
          <ChevronLeft className="w-3 h-3" /> Retour
        </button>
        <span className="text-stone-200">/</span>
        <span className="text-[8px] font-black text-stone-700 uppercase">{sc?.name}</span>
      </div>
      <p className="text-[8px] font-black text-stone-400 uppercase tracking-widest">3 · Produit + variante (couleur / taille)</p>

      {products.length > 5 && (
        <div className="relative">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3 h-3 text-stone-300" />
          <input type="text" placeholder="Rechercher nom, couleur, taille..."
            value={search} onChange={e => setSearch(e.target.value)}
            className="w-full pl-7 pr-3 py-2 text-[9px] font-bold border border-stone-200 rounded-xl focus:outline-none focus:ring-1 focus:ring-stone-400" />
        </div>
      )}

      {grouped.size === 0 && (
        <p className="text-center text-stone-300 text-[9px] font-black uppercase py-6">Aucun produit trouvé</p>
      )}

      <div className="space-y-2 max-h-[340px] overflow-y-auto pr-1">
        {Array.from(grouped.entries()).map(([name, variants], gIdx) => {
          const accent = UI_COLORS[gIdx % UI_COLORS.length];
          const totalQty = variants.reduce((s, v) => s + v.currentQty, 0);
          const sortedVariants = [...variants].sort((a, b) =>
            `${a.color||''}${a.size||''}`.localeCompare(`${b.color||''}${b.size||''}`)
          );
          const isSingleNoVariant = variants.length === 1 && !variants[0].color && !variants[0].size;

          return (
            <div key={name} className="rounded-xl overflow-hidden border border-stone-200 bg-white shadow-sm"
              style={{ borderLeftColor: accent, borderLeftWidth: 3 }}>

              {/* En-tête : nom produit + total + pastilles couleurs */}
              <div className="flex items-center gap-2.5 px-3 py-2.5 bg-stone-50/80 border-b border-stone-100">
                <div className="flex shrink-0">
                  {sortedVariants.slice(0, 6).map((v, vi) => (
                    <div key={v.articleId} className="w-4 h-4 rounded-full border-2 border-white shadow-sm"
                      style={{ backgroundColor: v.color ? (colorMap[v.color.toLowerCase()] || '#d4d4d4') : accent,
                        marginLeft: vi > 0 ? -5 : 0, zIndex: 6 - vi, position: 'relative' }}
                      title={[v.color, v.size].filter(Boolean).join(' N°') || name}
                    />
                  ))}
                  {variants.length > 6 && <span className="text-[6px] font-black text-stone-400 ml-1">+{variants.length - 6}</span>}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-[10px] font-black text-stone-900 uppercase tracking-tight truncate">{name}</p>
                  <p className="text-[7px] font-bold text-stone-400">
                    {variants.length} variante{variants.length > 1 ? 's' : ''} · total stock :&nbsp;
                    <span className="font-black" style={{ color: totalQty === 0 ? '#ef4444' : '#059669' }}>{fmt(totalQty)}</span>
                  </p>
                </div>
              </div>

              {/* Variantes */}
              <div className="divide-y divide-stone-50">
                {isSingleNoVariant ? (
                  // Produit sans variante → bouton direct
                  <button type="button" disabled={totalQty === 0}
                    onClick={() => onSelect(variants[0].articleId)}
                    className={`w-full flex items-center justify-between px-4 py-3 text-left transition-colors ${
                      totalQty === 0 ? 'opacity-40 cursor-not-allowed' : 'hover:bg-emerald-50 active:bg-emerald-100'
                    }`}>
                    <span className="text-[9px] font-bold text-stone-500 uppercase">{variants[0].unitOfMeasure}</span>
                    <span className={`text-[10px] font-black ${totalQty === 0 ? 'text-red-400' : 'text-emerald-600'}`}>
                      {totalQty === 0 ? 'RUPTURE' : `${fmt(totalQty)} en stock  →`}
                    </span>
                  </button>
                ) : sortedVariants.map(si => {
                  const isEmpty = si.currentQty === 0;
                  const isAlert = si.minThreshold != null && si.currentQty <= si.minThreshold && !isEmpty;
                  const maxRef = Math.max(si.initialQty + si.mouvementsIn, 1);
                  const pct = Math.min(100, Math.round(si.currentQty / maxRef * 100));
                  const barColor = isEmpty ? '#e5e7eb' : pct < 25 ? '#ef4444' : pct < 60 ? '#f59e0b' : '#10b981';
                  const swatch = si.color ? (colorMap[si.color.toLowerCase()] || '#d4d4d4') : null;

                  return (
                    <button key={si.articleId} type="button"
                      disabled={isEmpty}
                      onClick={() => onSelect(si.articleId)}
                      className={`w-full flex items-center gap-3 px-3 py-2.5 text-left transition-colors ${
                        isEmpty ? 'opacity-30 cursor-not-allowed' : 'hover:bg-emerald-50/80 active:bg-emerald-100/80'
                      }`}>

                      {/* Pastille couleur */}
                      <div className="w-8 h-8 rounded-lg border border-stone-200 shrink-0 flex items-center justify-center"
                        style={{ backgroundColor: swatch || '#f5f5f4' }}>
                        {!swatch && <span className="text-[7px] text-stone-300 font-bold">—</span>}
                      </div>

                      {/* Couleur + taille */}
                      <div className="w-20 shrink-0">
                        {si.color && <p className="text-[9px] font-black text-stone-800 uppercase leading-none">{si.color}</p>}
                        {si.size  && <p className="text-[8px] font-bold text-stone-500 leading-none mt-0.5">N° {si.size}</p>}
                        {!si.color && !si.size && <p className="text-[8px] text-stone-400 font-bold">Standard</p>}
                      </div>

                      {/* Barre stock proportionnelle */}
                      <div className="flex-1">
                        <div className="h-2.5 bg-stone-100 rounded-full overflow-hidden">
                          <div className="h-full rounded-full transition-all" style={{ width: `${pct}%`, backgroundColor: barColor }} />
                        </div>
                      </div>

                      {/* QUANTITÉ EXACTE — affichage principal */}
                      <div className="text-right shrink-0">
                        <p className="text-[18px] font-black leading-none" style={{ color: isEmpty ? '#d1d5db' : barColor }}>
                          {fmt(si.currentQty)}
                        </p>
                        <p className="text-[6px] font-bold text-stone-400 uppercase">{si.unitOfMeasure}</p>
                      </div>

                      {/* Statut */}
                      <div className="w-14 text-right shrink-0">
                        {isEmpty  && <span className="text-[7px] font-black text-red-400 bg-red-50 px-1.5 py-0.5 rounded uppercase block">Rupture</span>}
                        {!isEmpty && isAlert && <span className="text-[7px] font-black text-amber-500 bg-amber-50 px-1.5 py-0.5 rounded uppercase block">⚠ Bas</span>}
                        {!isEmpty && !isAlert && <span className="text-[7px] font-black text-emerald-600 bg-emerald-50 px-1.5 py-0.5 rounded uppercase block">✓ OK</span>}
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ── Modal principal ───────────────────────────────────────────────────────────
export default function StockMovementModal({
  open, onOpenChange, articles, categories, generalCategories = [], stockItems, stores = [],
  preselectedArticleId, preselectedType, activeStore, onSubmit,
}: StockMovementModalProps) {

  const today = new Date().toISOString().split('T')[0];

  const [form, setForm] = useState({
    type:      (preselectedType ?? 'OUT') as StockMovementType,
    articleId: preselectedArticleId ?? '',
    reason:    '' as StockMovementReason | '',
    quantity:  '' as string | number,
    storeId:   (activeStore || '') as StoreLocation | '',
    toStoreId: '' as StoreLocation | '',
    date:      today,
    notes:     '',
  });
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (open) {
      setForm({
        type:      preselectedType ?? 'OUT',
        articleId: preselectedArticleId ?? '',
        reason:    '',
        quantity:  '',
        storeId:   (activeStore || '') as StoreLocation | '',
        toStoreId: '',
        date:      today,
        notes:     '',
      });
    }
  }, [open, preselectedArticleId, preselectedType]);

  const selectedStock = stockItems.find(s => s.articleId === form.articleId);
  const reasons       = REASONS_BY_TYPE[form.type] || [];
  const typeConf      = TYPE_CONFIG[form.type];

  const isMainStore = stores.find(s => s.id === activeStore)?.isMain;
  const canChooseStore = activeStore === 'ALL' || isMainStore;
  const Icon          = typeConf.icon;

  const headerClass =
    form.type === 'IN'  ? 'bg-gradient-to-r from-emerald-600 to-emerald-500' :
    form.type === 'OUT' ? 'bg-gradient-to-r from-red-600 to-red-500'         :
                          'bg-gradient-to-r from-blue-600 to-blue-500';

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.articleId || !form.reason || !form.quantity || !form.date) return;
    if (!form.storeId) return;
    if (form.reason === 'TRANSFERT' && !form.toStoreId) return;
    if (!selectedStock) return;

    setSaving(true);

    // Résoudre l'articleId réel si c'est un ID virtuel (various explosé)
    const realArticleId = (selectedStock as any)._realArticleId || form.articleId;

    const selectedArticle = articles.find(a => a.id === realArticleId);
    const parts: string[] = [];
    if (selectedArticle?.zipperType) parts.push(selectedArticle.zipperType);
    if (selectedArticle?.slider)     parts.push(selectedArticle.slider);
    const productName = parts.length > 0 ? parts.join(' ') : (selectedStock.productName || selectedArticle?.name || 'Produit');

    await onSubmit({
      articleId:     realArticleId,           // ← toujours l'ID Firestore réel
      categoryId:    selectedStock.categoryId,
      productName,
      color:         selectedStock.color,     // ← couleur de la variante
      size:          selectedStock.size,      // ← taille de la variante
      unitOfMeasure: selectedStock.unitOfMeasure || 'unité',
      type:          form.type,
      reason:        form.reason as StockMovementReason,
      storeId:       form.storeId as StoreLocation,
      toStoreId:     form.reason === 'TRANSFERT' ? (form.toStoreId as StoreLocation) : undefined,
      quantity:      Number(form.quantity),
      date:          form.date,
      notes:         form.notes || undefined,
    });
    setSaving(false);
    onOpenChange(false);
  };


  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg p-0 rounded-3xl overflow-hidden border-none shadow-2xl">

        {/* Header */}
        <div className={`${headerClass} p-5 text-white`}>
          <DialogHeader>
            <div className="flex items-center gap-3">
              <div className="p-2.5 bg-white/20 backdrop-blur rounded-xl">
                <Icon className="w-5 h-5" />
              </div>
              <div>
                <DialogTitle className="text-lg font-black uppercase tracking-tight leading-none">
                  {typeConf.label}
                </DialogTitle>
                <p className="text-[9px] font-bold opacity-80 uppercase tracking-widest mt-1">
                  Enregistrer un mouvement de stock
                </p>
              </div>
            </div>
          </DialogHeader>

          {/* Type switcher */}
          <div className="flex gap-2 mt-4">
            {(Object.keys(TYPE_CONFIG) as StockMovementType[]).map(t => (
              <button key={t} type="button"
                onClick={() => setForm(f => ({ ...f, type: t, reason: '', articleId: '' }))}
                className={`flex-1 py-2 rounded-xl text-[9px] font-black uppercase tracking-wider transition-all border ${
                  form.type === t
                    ? 'bg-white text-stone-900 border-white shadow-lg'
                    : 'bg-white/10 text-white border-white/20 hover:bg-white/20'
                }`}
              >
                {TYPE_CONFIG[t].label}
              </button>
            ))}
          </div>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="p-5 space-y-4 bg-white max-h-[70vh] overflow-y-auto">

          {/* ── Sélection produit ── */}
          {!form.articleId ? (
            // Pas encore de produit sélectionné → picker cascade
            <ProductPicker
              stockItems={stockItems.filter(s => s.currentQty > 0 || form.type !== 'OUT')}
              categories={categories}
              generalCategories={generalCategories}
              onSelect={id => setForm(f => ({ ...f, articleId: id }))}
            />
          ) : (
            // Produit sélectionné — fiche avec champs étiquetés
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label className="text-[9px] font-black uppercase tracking-widest text-stone-500">Produit sélectionné</Label>
                <button
                  type="button"
                  onClick={() => setForm(f => ({ ...f, articleId: '' }))}
                  className="text-[7px] font-black text-stone-400 hover:text-red-600 uppercase tracking-widest underline decoration-dotted transition-colors"
                >
                  ✕ Changer
                </button>
              </div>

              {/* Carte produit détaillée */}
              <div className="bg-stone-50 rounded-2xl border border-stone-200 overflow-hidden">
                {/* Bandeau couleur + nom */}
                <div className="flex items-center gap-3 px-4 py-3 bg-white border-b border-stone-100">
                  <div className="w-9 h-9 rounded-xl bg-emerald-100 flex items-center justify-center shrink-0">
                    <PackageCheck className="w-4.5 h-4.5 text-emerald-600" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-[11px] font-black text-stone-900 uppercase tracking-tight leading-none truncate">
                      {selectedStock?.productName}
                    </p>
                    <p className="text-[7px] font-bold text-stone-400 mt-0.5">{selectedStock?.categoryId}</p>
                  </div>
                </div>

                {/* Grille des attributs */}
                <div className="grid grid-cols-3 divide-x divide-stone-100 border-b border-stone-100">
                  <div className="px-3 py-2.5 text-center">
                    <p className="text-[6px] font-black text-stone-400 uppercase tracking-widest mb-0.5">Couleur</p>
                    {selectedStock?.color
                      ? <p className="text-[10px] font-black text-stone-800 uppercase">{selectedStock.color}</p>
                      : <p className="text-[9px] text-stone-300 font-bold">—</p>}
                  </div>
                  <div className="px-3 py-2.5 text-center">
                    <p className="text-[6px] font-black text-stone-400 uppercase tracking-widest mb-0.5">Taille / N°</p>
                    {selectedStock?.size
                      ? <p className="text-[10px] font-black text-stone-800 uppercase">{selectedStock.size}</p>
                      : <p className="text-[9px] text-stone-300 font-bold">—</p>}
                  </div>
                  <div className="px-3 py-2.5 text-center">
                    <p className="text-[6px] font-black text-stone-400 uppercase tracking-widest mb-0.5">Unité</p>
                    <p className="text-[10px] font-black text-stone-800 uppercase">{selectedStock?.unitOfMeasure || '—'}</p>
                  </div>
                </div>

                {/* Stock actuel + simulation */}
                <div className="px-4 py-3 flex items-center justify-between gap-3">
                  <div>
                    <p className="text-[6px] font-black text-stone-400 uppercase tracking-widest">Stock actuel</p>
                    <p className="text-[16px] font-black text-stone-900 leading-none mt-0.5">
                      {fmt(selectedStock?.currentQty || 0)}
                      <span className="text-[9px] font-bold text-stone-400 ml-1">{selectedStock?.unitOfMeasure}</span>
                    </p>
                  </div>
                  {form.type === 'OUT' && Number(form.quantity) > 0 && (
                    <div className="text-right">
                      <p className="text-[6px] font-black text-stone-400 uppercase tracking-widest">Après sortie</p>
                      <p className={`text-[16px] font-black leading-none mt-0.5 ${
                        (selectedStock?.currentQty || 0) - Number(form.quantity) < 0 ? 'text-red-600' : 'text-emerald-600'
                      }`}>
                        {fmt((selectedStock?.currentQty || 0) - Number(form.quantity))}
                        <span className="text-[9px] font-bold ml-1">{selectedStock?.unitOfMeasure}</span>
                      </p>
                    </div>
                  )}
                  {form.type === 'IN' && Number(form.quantity) > 0 && (
                    <div className="text-right">
                      <p className="text-[6px] font-black text-stone-400 uppercase tracking-widest">Après entrée</p>
                      <p className="text-[16px] font-black text-emerald-600 leading-none mt-0.5">
                        {fmt((selectedStock?.currentQty || 0) + Number(form.quantity))}
                        <span className="text-[9px] font-bold ml-1">{selectedStock?.unitOfMeasure}</span>
                      </p>
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* ── Le reste du formulaire — visible seulement si produit choisi ── */}
          {form.articleId && (
            <>
              {/* Raison */}
              <div className="space-y-1.5">
                <Label className="text-[9px] font-black uppercase tracking-widest text-stone-500">Raison *</Label>
                <Select value={form.reason} onValueChange={v => setForm(f => ({ ...f, reason: v as StockMovementReason }))}>
                  <SelectTrigger className="h-11 rounded-xl border-stone-200 font-bold text-sm">
                    <SelectValue placeholder="Choisir la raison..." />
                  </SelectTrigger>
                  <SelectContent>
                    {reasons.map(r => (
                      <SelectItem key={r.value} value={r.value}>
                        <span className="font-bold text-sm">{r.label}</span>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {/* Sélection du Magasin (si non forcé) */}
              {canChooseStore && (
                <div className="space-y-1.5">
                  <Label className="text-[9px] font-black uppercase tracking-widest text-stone-500">
                    {form.type === 'IN' ? 'Emplacement (Destination) *' : 'Emplacement (Origine) *'}
                  </Label>
                  <Select value={form.storeId} onValueChange={v => setForm(f => ({ ...f, storeId: v as StoreLocation }))}>
                    <SelectTrigger className="h-11 rounded-xl border-stone-200 font-bold text-sm">
                      <SelectValue placeholder="Choisir le magasin..." />
                    </SelectTrigger>
                    <SelectContent>
                      {stores.map(s => (
                        <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}


              {/* Quantité + Date */}
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label className="text-[9px] font-black uppercase tracking-widest text-stone-500">
                    Quantité * {selectedStock && <span className="font-normal text-stone-400 normal-case">({selectedStock.unitOfMeasure})</span>}
                  </Label>
                  <Input
                    type="number" min={0.01} step="any" required
                    placeholder="0"
                    value={form.quantity}
                    onChange={e => setForm(f => ({ ...f, quantity: e.target.value }))}
                    className="h-11 rounded-xl border-stone-200 font-black text-lg"
                    autoFocus
                  />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-[9px] font-black uppercase tracking-widest text-stone-500">Date *</Label>
                  <Input
                    type="date" required
                    value={form.date}
                    onChange={e => setForm(f => ({ ...f, date: e.target.value }))}
                    className="h-11 rounded-xl border-stone-200 font-bold"
                  />
                </div>
              </div>

              {/* Notes */}
              <div className="space-y-1.5">
                <Label className="text-[9px] font-black uppercase tracking-widest text-stone-500">Notes (optionnel)</Label>
                <Input
                  placeholder="Réf. bon de livraison, client, remarque..."
                  value={form.notes}
                  onChange={e => setForm(f => ({ ...f, notes: e.target.value }))}
                  className="h-11 rounded-xl border-stone-200 font-medium text-sm"
                />
              </div>

              {/* Warning sortie en négatif */}
              {form.type === 'OUT' && selectedStock && Number(form.quantity) > selectedStock.currentQty && (
                <div className="flex items-center gap-2 px-3 py-2.5 bg-red-50 rounded-xl border border-red-200">
                  <AlertTriangle className="w-3.5 h-3.5 text-red-600 shrink-0" />
                  <span className="text-[9px] font-black text-red-600 uppercase tracking-wider">
                    Quantité supérieure au stock disponible ({selectedStock.currentQty} {selectedStock.unitOfMeasure})
                  </span>
                </div>
              )}
            </>
          )}
        </form>

        <DialogFooter className="px-5 pb-5 bg-white gap-2">
          <Button variant="ghost" onClick={() => onOpenChange(false)} className="rounded-xl font-black uppercase text-[10px] tracking-widest">Annuler</Button>
          <Button
            onClick={handleSubmit}
            disabled={saving || !form.articleId || !form.reason || !form.quantity || !form.storeId || (form.reason === 'TRANSFERT' && !form.toStoreId)}
            className={`flex-1 h-11 rounded-xl font-black uppercase text-[10px] tracking-widest text-white shadow-lg ${
              form.type === 'IN'  ? 'bg-emerald-600 hover:bg-emerald-700 shadow-emerald-500/20' :
              form.type === 'OUT' ? 'bg-red-600 hover:bg-red-700 shadow-red-500/20' :
                                    'bg-blue-600 hover:bg-blue-700 shadow-blue-500/20'
            }`}
          >
            {saving ? 'Enregistrement...' : `Confirmer ${typeConf.label}`}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
