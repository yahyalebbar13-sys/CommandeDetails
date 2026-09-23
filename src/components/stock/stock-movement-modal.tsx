"use client";

import React, { useState, useEffect, useMemo } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import type { StockMovement, StockMovementReason, StockMovementType, StockItem, Store, StoreLocation } from '@/lib/types';
import {
  ArrowDown, ArrowUp, SlidersHorizontal, PackageCheck,
  ChevronLeft, Package, Layers, Search,
  Undo2, RefreshCw, ShoppingCart, XCircle, MapPin,
} from 'lucide-react';
import { getLocalDateString } from '@/lib/constants';
import {
  type StorageLocation, compareLocationCodes, computeArticleLocationStock, suggestInboundLocation,
  stockItemVariant,
} from '@/lib/warehouse-locations';
import {
  SectionFormulaire, Champ, Encadre, LigneResume, Recapitulatif, BoutonValider, CLASSE_CHAMP,
} from './ui-formulaire';

// ── Helpers ───────────────────────────────────────────────────────────────────
const UI_COLORS = ['#CC8626','#1E293B','#3B82F6','#10B981','#6366F1','#F43F5E','#8B5CF6','#EC4899'];
function fmt(n: number) { return Math.round(n).toLocaleString('fr-MA'); }
/** Affichage seulement : 2026-09-22 → 22/09/2026, sans jamais réinterpréter la date saisie. */
function dateLisible(iso: string) {
  const [annee, mois, jour] = (iso || '').split('-');
  return jour ? `${jour}/${mois}/${annee}` : (iso || '—');
}

interface StockMovementModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  articles: any[];
  categories: any[];
  generalCategories?: any[];
  stockItems: StockItem[];
  stores?: Store[];
  /** Emplacements physiques configurés (cf. /stock → Emplacements) — filtrés sur le lieu choisi. */
  locations?: StorageLocation[];
  /** Tous les mouvements, pour pré-remplir l'emplacement automatiquement (FIFO en sortie). */
  allMovements?: any[];
  preselectedArticleId?: string;
  preselectedType?: StockMovementType;
  activeStore?: StoreLocation | 'ALL';
  onSubmit: (movement: Omit<StockMovement, 'id' | 'createdAt'>) => Promise<void>;
}

/**
 * Motifs proposés selon le type. `aide` dit ce que le motif raconte du mouvement : c'est ce mot
 * qu'on relira dans six mois pour comprendre pourquoi le stock a bougé.
 */
const REASONS_BY_TYPE: Record<StockMovementType, { value: StockMovementReason; label: string; icon: any; aide: string }[]> = {
  IN: [
    { value: 'ARRIVAGE',   label: 'Arrivage fournisseur', icon: Package,
      aide: "Une commande reçue : la marchandise se range en réserve." },
    { value: 'RETOUR',     label: 'Retour client', icon: Undo2,
      aide: "Un client rapporte la marchandise : elle redevient vendable." },
    { value: 'INVENTAIRE', label: 'Ajustement inventaire', icon: RefreshCw,
      aide: "Le comptage a trouvé plus que ce que le logiciel annonçait." },
  ],
  OUT: [
    { value: 'VENTE',      label: 'Vente / Livraison', icon: ShoppingCart,
      aide: "La marchandise part chez un client." },
    { value: 'PERTE',      label: 'Perte / Casse', icon: XCircle,
      aide: "Marchandise abîmée, perdue ou introuvable : elle ne se vendra pas." },
    { value: 'INVENTAIRE', label: 'Ajustement inventaire', icon: RefreshCw,
      aide: "Le comptage a trouvé moins que ce que le logiciel annonçait." },
  ],
  ADJUSTMENT: [
    { value: 'INVENTAIRE', label: 'Régularisation inventaire', icon: RefreshCw,
      aide: "On remet le chiffre du logiciel sur le chiffre compté en rayon." },
    { value: 'PERTE',      label: 'Perte / Différence', icon: XCircle,
      aide: "L'écart ne s'explique pas par une vente : on l'inscrit en perte." },
  ],
};

const TYPE_CONFIG: Record<StockMovementType, {
  /** Titre de la fenêtre. */ label: string;
  /** Nom court sur le bouton de choix. */ court: string;
  /** Ce que le type fait au stock, en une ligne. */ sens: string;
  /** Idem, en trois mots, sous le bouton de choix. */ sensCourt: string;
  color: string; icon: any;
  /** Libellé du bouton d'enregistrement. */ verbe: string;
}> = {
  IN: {
    label: 'Entrée de marchandise', court: 'Entrée', color: 'emerald', icon: ArrowDown,
    sens: 'La marchandise arrive : le stock augmente.',
    sensCourt: 'le stock monte',
    verbe: "Enregistrer l'entrée",
  },
  OUT: {
    label: 'Sortie de marchandise', court: 'Sortie', color: 'red', icon: ArrowUp,
    sens: 'La marchandise part : le stock diminue.',
    sensCourt: 'le stock baisse',
    verbe: 'Enregistrer la sortie',
  },
  ADJUSTMENT: {
    label: 'Ajustement de stock', court: 'Ajustement', color: 'blue', icon: SlidersHorizontal,
    sens: 'Le chiffre du logiciel est remis sur ce qui a été compté en rayon.',
    sensCourt: 'on corrige le chiffre',
    verbe: "Enregistrer l'ajustement",
  },
};

/** Couleurs d'accent par type — déjà celles de l'écran, rassemblées en un seul endroit. */
const TYPE_STYLE: Record<StockMovementType, { actif: string; icone: string; texte: string; bouton: string }> = {
  IN:         { actif: 'border-emerald-500 bg-emerald-50', icone: 'text-emerald-600', texte: 'text-emerald-800',
                bouton: 'bg-emerald-600 hover:bg-emerald-700 shadow-emerald-500/20' },
  OUT:        { actif: 'border-red-500 bg-red-50',         icone: 'text-red-600',     texte: 'text-red-800',
                bouton: 'bg-red-600 hover:bg-red-700 shadow-red-500/20' },
  ADJUSTMENT: { actif: 'border-blue-500 bg-blue-50',       icone: 'text-blue-600',    texte: 'text-blue-800',
                bouton: 'bg-blue-600 hover:bg-blue-700 shadow-blue-500/20' },
};

/** Où l'on en est dans le choix du produit — remplace les « 1 · », « 2 · » qui se mélangeaient
 *  avec les étapes numérotées du formulaire. */
function FilAriane({ etape }: { etape: 1 | 2 | 3 }) {
  const etapes = ['Famille', 'Sous-catégorie', 'Référence exacte'];
  return (
    <div className="flex items-center gap-1.5 text-[11px] font-medium text-stone-400">
      {etapes.map((nom, i) => (
        <React.Fragment key={nom}>
          {i > 0 && <span className="text-stone-300">›</span>}
          <span className={i + 1 === etape ? 'font-bold text-stone-800' : ''}>{nom}</span>
        </React.Fragment>
      ))}
    </div>
  );
}

/** Titre d'une étape du choix produit, avec sa phrase d'explication. */
function TitreEtape({ titre, aide }: { titre: string; aide?: React.ReactNode }) {
  return (
    <div>
      <p className="text-[13px] font-bold text-stone-800 leading-tight">{titre}</p>
      {aide && <p className="text-[11px] font-medium text-stone-500 leading-snug mt-0.5">{aide}</p>}
    </div>
  );
}

// ── Picker produit — Famille → Sous-cat → Produit ────────────────────────────
export function ProductPicker({
  stockItems, categories, generalCategories, formType, onSelect, masquerQuantites = false
}: {
  stockItems: StockItem[];
  categories: any[];
  generalCategories: any[];
  formType: StockMovementType;
  onSelect: (articleId: string) => void;
  /**
   * Cache les quantités : l'inventaire aveugle ne doit RIEN montrer avant la saisie du comptage.
   * Sinon le magasinier lit le chiffre du logiciel et le recopie au lieu de compter, et l'écart
   * — le seul intérêt de l'opération — ne se révèle jamais. Une référence à zéro reste alors
   * sélectionnable : on peut très bien trouver en rayon ce que le logiciel croit épuisé.
   */
  masquerQuantites?: boolean;
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

  // ── Étape 1 : Famille ───────────────────────────────────────────────────────
  if (step === 'gencat') {
    // Fallback si pas de general categories : aller direct aux sub-cats
    if (genCatsWS.length === 0) {
      // Pas de general categories configurées → lister les sub-categories directement
      const subCatsAll = categories.filter(c => (stockByCat[c.name]?.length || 0) > 0);
      return (
        <div className="space-y-2.5">
          <TitreEtape titre="Choisissez la famille" aide="Ensuite viendra la référence exacte." />
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
                  <Layers className="w-3.5 h-3.5 shrink-0" style={{ color }} />
                  <div className="min-w-0">
                    <p className="text-[13px] font-bold text-stone-800 leading-tight truncate">{sc.nameFR || sc.name}</p>
                    <p className="text-[11px] font-medium text-stone-400">{count} référence{count > 1 ? 's' : ''}</p>
                  </div>
                </button>
              );
            })}
          </div>
        </div>
      );
    }

    return (
      <div className="space-y-2.5">
        <FilAriane etape={1} />
        <TitreEtape titre="Choisissez la famille" aide="Puis la sous-catégorie, puis la référence exacte." />
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
                <Layers className="w-4 h-4 shrink-0" style={{ color }} />
                <div className="min-w-0">
                  <p className="text-[13px] font-bold text-stone-800 leading-tight truncate">{gc.nameFR || gc.name}</p>
                  <p className="text-[11px] font-medium text-stone-400">{gcItems.length} référence{gcItems.length > 1 ? 's' : ''} en stock</p>
                </div>
              </button>
            );
          })}
        </div>
      </div>
    );
  }

  // ── Étape 2 : Sous-catégorie ────────────────────────────────────────────────
  if (step === 'subcat') {
    const gc = (generalCategories || []).find(g => g.id === selGenCat);
    return (
      <div className="space-y-2.5">
        <div className="flex items-center gap-2">
          <button type="button" onClick={() => { setStep('gencat'); setSelGenCat(null); }}
            className="flex items-center gap-1 text-[12px] font-bold text-stone-400 hover:text-stone-800 transition-colors">
            <ChevronLeft className="w-3.5 h-3.5" /> Retour
          </button>
          <span className="text-stone-200">/</span>
          <span className="text-[12px] font-bold text-stone-700 truncate">{gc?.nameFR || gc?.name}</span>
        </div>
        <FilAriane etape={2} />
        <TitreEtape titre="Choisissez la sous-catégorie" />
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
                <Layers className="w-3.5 h-3.5 shrink-0" style={{ color }} />
                <div className="min-w-0">
                  <p className="text-[13px] font-bold text-stone-800 leading-tight truncate">{sc.nameFR || sc.name}</p>
                  <p className="text-[11px] font-medium text-stone-400">{count} référence{count > 1 ? 's' : ''}</p>
                </div>
              </button>
            );
          })}
        </div>
      </div>
    );
  }

  // ── Étape 3 : Produits groupés par nom → variantes couleur/qualité avec qtés exactes ──
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
    <div className="space-y-2.5">
      <div className="flex items-center gap-2">
        <button type="button"
          onClick={() => { setStep('subcat'); setSelSubCat(null); setSearch(''); }}
          className="flex items-center gap-1 text-[12px] font-bold text-stone-400 hover:text-stone-800 transition-colors">
          <ChevronLeft className="w-3.5 h-3.5" /> Retour
        </button>
        <span className="text-stone-200">/</span>
        <span className="text-[12px] font-bold text-stone-700 truncate">{sc?.nameFR || sc?.name}</span>
      </div>
      <FilAriane etape={3} />
      <TitreEtape
        titre="Choisissez la référence exacte"
        aide="Chaque ligne est une couleur, une qualité ou un numéro différent. Le mouvement ne touchera que la ligne choisie."
      />

      {formType === 'OUT' && (
        <Encadre ton="info">
          Les références sans stock ne sont pas proposées : on ne peut pas faire sortir ce qui n'est pas là.
        </Encadre>
      )}

      {products.length > 5 && (
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-stone-300" />
          <input type="text" placeholder="Rechercher un nom, une couleur, un numéro…"
            value={search} onChange={e => setSearch(e.target.value)}
            className="w-full h-11 pl-9 pr-3 text-sm font-bold text-stone-900 placeholder:font-medium placeholder:text-stone-400 border border-stone-200 rounded-xl focus:outline-none focus:ring-1 focus:ring-stone-400" />
        </div>
      )}

      {grouped.size === 0 && (
        <p className="text-center text-stone-400 text-[13px] font-medium py-6">Aucun produit ne correspond.</p>
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
                  {variants.length > 6 && <span className="text-[11px] font-bold text-stone-400 ml-1">+{variants.length - 6}</span>}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-[13px] font-bold text-stone-900 leading-tight truncate">{name}</p>
                  <p className="text-[11px] font-medium text-stone-500">
                    {variants.length} variante{variants.length > 1 ? 's' : ''}
                    {!masquerQuantites && <>
                      {' · stock total :\u00a0'}
                      <span className="font-bold" style={{ color: totalQty === 0 ? '#ef4444' : '#059669' }}>{fmt(totalQty)}</span>
                    </>}
                  </p>
                </div>
              </div>

              {/* Variantes */}
              <div className="divide-y divide-stone-50">
                {isSingleNoVariant ? (
                  // Produit sans variante → bouton direct
                  <button type="button" disabled={totalQty === 0 && !masquerQuantites}
                    title={totalQty === 0 && !masquerQuantites ? "Aucun stock enregistré pour ce produit." : undefined}
                    onClick={() => onSelect(variants[0].articleId)}
                    className={`w-full flex items-center justify-between px-4 py-3 text-left transition-colors ${
                      totalQty === 0 && !masquerQuantites ? 'opacity-40 cursor-not-allowed' : 'hover:bg-emerald-50 active:bg-emerald-100'
                    }`}>
                    <span className="text-[12px] font-medium text-stone-500">Se compte en {variants[0].unitOfMeasure}</span>
                    <span className={`text-[12px] font-bold ${totalQty === 0 && !masquerQuantites ? 'text-red-500' : 'text-emerald-600'}`}>
                      {masquerQuantites ? 'Compter  →' : (totalQty === 0 ? 'Rupture' : `${fmt(totalQty)} en stock  →`)}
                    </span>
                  </button>
                ) : sortedVariants.map(si => {
                  const isEmpty = si.currentQty === 0;
                  const isAlert = si.minThreshold != null && si.currentQty <= si.minThreshold && !isEmpty;
                  const maxRef = Math.max((si.initialQty || 0) + (si.mouvementsIn || 0), 1);
                  const pct = Math.min(100, Math.round(si.currentQty / maxRef * 100));
                  const barColor = isEmpty ? '#e5e7eb' : pct < 25 ? '#ef4444' : pct < 60 ? '#f59e0b' : '#10b981';
                  const swatch = si.color ? (colorMap[si.color.toLowerCase()] || '#d4d4d4') : null;

                  const isDisabled = formType === 'OUT' && isEmpty;

                  return (
                    <button key={si.articleId} type="button"
                      disabled={isDisabled}
                      title={isDisabled ? "Stock à zéro : rien à faire sortir sur cette variante." : undefined}
                      onClick={() => onSelect(si.articleId)}
                      className={`w-full flex items-center gap-3 px-3 py-2.5 text-left transition-colors ${
                        isDisabled ? 'opacity-30 cursor-not-allowed' : 'hover:bg-emerald-50/80 active:bg-emerald-100/80'
                      }`}>

                      {/* Pastille couleur */}
                      <div className="w-8 h-8 rounded-lg border border-stone-200 shrink-0 flex items-center justify-center"
                        style={{ backgroundColor: swatch || '#f5f5f4' }}>
                        {!swatch && <span className="text-[11px] text-stone-300 font-bold">—</span>}
                      </div>

                      {/* Qualité + couleur + numéro */}
                      <div className="w-28 shrink-0">
                        {si.quality && (
                          <span className="inline-block text-[11px] font-bold bg-violet-100 text-violet-700 px-1.5 py-0.5 rounded mb-0.5">
                            {si.quality}
                          </span>
                        )}
                        {si.color && <p className="text-[13px] font-bold text-stone-800 capitalize leading-tight truncate">{si.color}</p>}
                        {si.size  && <p className="text-[12px] font-medium text-stone-500 leading-tight">N° {si.size}</p>}
                        {!si.quality && !si.color && !si.size && <p className="text-[12px] text-stone-400 font-medium">Standard</p>}
                      </div>

                      {/* Barre stock proportionnelle — masquée pour un comptage à l'aveugle */}
                      <div className="flex-1">
                        {!masquerQuantites && (
                          <div className="h-2.5 bg-stone-100 rounded-full overflow-hidden">
                            <div className="h-full rounded-full transition-all" style={{ width: `${pct}%`, backgroundColor: barColor }} />
                          </div>
                        )}
                      </div>

                      {/* QUANTITÉ EXACTE — affichage principal */}
                      <div className="text-right shrink-0">
                        {masquerQuantites ? (
                          <p className="text-[12px] font-bold text-stone-400">{si.unitOfMeasure}</p>
                        ) : (<>
                          <p className="text-[18px] font-black leading-none" style={{ color: isEmpty ? '#d1d5db' : barColor }}>
                            {fmt(si.currentQty)}
                          </p>
                          <p className="text-[11px] font-medium text-stone-400">{si.unitOfMeasure}</p>
                        </>)}
                      </div>

                      {/* Statut */}
                      <div className="w-16 text-right shrink-0">
                        {masquerQuantites && <span className="text-[11px] font-bold text-stone-500 bg-stone-100 px-1.5 py-0.5 rounded block">À compter</span>}
                        {!masquerQuantites && isEmpty  && <span className="text-[11px] font-bold text-red-500 bg-red-50 px-1.5 py-0.5 rounded block">Rupture</span>}
                        {!masquerQuantites && !isEmpty && isAlert && <span className="text-[11px] font-bold text-amber-600 bg-amber-50 px-1.5 py-0.5 rounded block">Stock bas</span>}
                        {!masquerQuantites && !isEmpty && !isAlert && <span className="text-[11px] font-bold text-emerald-600 bg-emerald-50 px-1.5 py-0.5 rounded block">Disponible</span>}
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
  locations = [], allMovements = [], preselectedArticleId, preselectedType, activeStore, onSubmit,
}: StockMovementModalProps) {

  const today = getLocalDateString();

  const [form, setForm] = useState({
    type:      (preselectedType ?? 'OUT') as StockMovementType,
    articleId: preselectedArticleId ?? '',
    reason:    '' as StockMovementReason | '',
    quantity:  '' as string | number,
    storeId:   (activeStore || '') as StoreLocation | '',
    // Lieu PHYSIQUE réellement choisi, avant la normalisation entrepôt→CHRIFA appliquée à
    // storeId : c'est lui qui porte les emplacements. Un entrepôt compte dans le stock de
    // CHRIFA mais reste un bâtiment distinct, avec ses propres racks.
    physicalStoreId: (activeStore || '') as StoreLocation | '',
    toStoreId: '' as StoreLocation | '',
    locationCode: '',
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
        physicalStoreId: (activeStore || '') as StoreLocation | '',
        toStoreId: '',
        locationCode: '',
        date:      today,
        notes:     '',
      });
    }
  }, [open, preselectedArticleId, preselectedType]);

  // Emplacements physiques du lieu sélectionné — magasin comme entrepôt. Vide tant que le lieu
  // n'a pas été découpé dans /stock → Emplacements : le champ est alors simplement masqué.
  const availableLocations = useMemo(
    () => {
      const place = form.physicalStoreId || form.storeId;
      return (locations || [])
        .filter(l => l.storeId === place && l.active !== false)
        .sort((a, b) => compareLocationCodes(a.code, b.code));
    },
    [locations, form.physicalStoreId, form.storeId]
  );

  const physicalPlaceName = stores.find(s => s.id === (form.physicalStoreId || form.storeId))?.name || '';

  // Pré-remplit l'emplacement tout seul — même logique qu'à la caisse : en sortie on prend le
  // plus ancien dépôt (FIFO), en entrée on range là où le produit se trouve déjà. L'utilisateur
  // garde la main pour corriger, mais il n'a rien à saisir dans le cas courant.
  // Pour un article éclaté, seuls les racks de la variante choisie sont proposés : un mouvement
  // de Bleu ne pré-remplit jamais le rack du Rouge du même article.
  useEffect(() => {
    if (!form.articleId || availableLocations.length === 0) return;
    const place = form.physicalStoreId || form.storeId;
    if (!place) return;
    const stock = stockItems.find(s => s.articleId === form.articleId);
    const realId = (stock as any)?._realArticleId || form.articleId;
    const variant = stockItemVariant(stock);
    const suggestion = form.type === 'OUT'
      ? computeArticleLocationStock(allMovements, place, realId, variant)[0]?.locationCode
      : suggestInboundLocation(allMovements, place, realId, variant)?.locationCode;
    if (!suggestion) return;
    setForm(f => (f.locationCode ? f : { ...f, locationCode: suggestion }));
  }, [form.articleId, form.type, form.physicalStoreId, form.storeId, availableLocations.length, allMovements, stockItems]);

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
      quality:       selectedStock.quality || undefined,
      gsm:           selectedStock.gsm || undefined,
      fabricWidth:   selectedStock.fabricWidth || undefined,
      rollLength:    selectedStock.rollLength || undefined,
      rollLengthUnit: selectedStock.rollLengthUnit || undefined,
      unitOfMeasure: selectedStock.unitOfMeasure || 'unité',
      type:          form.type,
      reason:        form.reason as StockMovementReason,
      storeId:       form.storeId as StoreLocation,
      toStoreId:     form.reason === 'TRANSFERT' ? (form.toStoreId as StoreLocation) : undefined,
      locationCode:  form.locationCode || undefined,
      locationId:    availableLocations.find(l => l.code === form.locationCode)?.id,
      quantity:      Number(form.quantity),
      date:          form.date,
      notes:         form.notes || undefined,
    });
    setSaving(false);
    onOpenChange(false);
  };

  // Le bouton d'enregistrement vit dans le pied de la fenêtre, hors du <form> : on relaie donc
  // l'appel vers le même enregistrement, avec un événement sans effet. Rien d'autre ne change.
  const validerDepuisLePied = () => { void handleSubmit({ preventDefault: () => {} } as unknown as React.FormEvent); };

  // ── Valeurs d'affichage — aucune règle de gestion ici ────────────────────────
  const motifChoisi     = reasons.find(r => r.value === form.reason);
  const unite           = selectedStock?.unitOfMeasure || '';
  const variante        = [
    selectedStock?.quality,
    selectedStock?.color,
    selectedStock?.size ? `N° ${selectedStock.size}` : null,
  ].filter(Boolean).join(' · ');
  const quantiteSaisie  = Number(form.quantity);
  // Une quantité « lisible » est une quantité réellement saisie : le récapitulatif ne simule pas
  // un stock après enregistrement pour 0, sinon il annonce un mouvement qui n'aura pas lieu.
  const quantiteLisible = form.quantity !== '' && Number.isFinite(quantiteSaisie) && quantiteSaisie !== 0;
  const lieuChoisi      = stores.find(s => s.id === (form.physicalStoreId || form.storeId));
  const lieuEstReserve  = lieuChoisi?.type === 'WAREHOUSE';
  const arrivageEnCours = form.type === 'IN' && form.reason === 'ARRIVAGE';
  const sortieTropGrande = form.type === 'OUT' && !!selectedStock && Number(form.quantity) > selectedStock.currentQty;
  const stockApres      = (selectedStock?.currentQty || 0) + (form.type === 'IN' ? quantiteSaisie : -quantiteSaisie);

  // Reprend, mot pour mot, les conditions qui grisent déjà le bouton — pour les dire à voix haute.
  const raisonDesactive =
    !form.articleId ? "Choisissez d'abord le produit concerné (étape 1)." :
    !form.reason    ? "Indiquez le motif du mouvement (étape 2)." :
    !form.quantity  ? "Indiquez la quantité (étape 3)." :
    !form.storeId   ? "Indiquez le lieu concerné (étape 3)." :
    (form.reason === 'TRANSFERT' && !form.toStoreId) ? "Indiquez le lieu d'arrivée du transfert." :
    null;

  const libelleLieu =
    arrivageEnCours     ? "Entrepôt d'arrivée" :
    form.type === 'IN'  ? 'Lieu où la marchandise entre' :
    form.type === 'OUT' ? "Lieu d'où la marchandise sort" :
                          'Lieu concerné par la correction';

  const aideLieu =
    arrivageEnCours     ? "Un arrivage se range en réserve : seuls les entrepôts sont proposés." :
    form.type === 'IN'  ? "C'est ce lieu qui recevra la marchandise, et dont le stock augmentera." :
    form.type === 'OUT' ? "C'est ce lieu qui décide d'où la marchandise sort : son stock baissera, pas celui des autres." :
                          "C'est le stock de ce lieu qui sera corrigé.";

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
              <div className="min-w-0">
                <DialogTitle className="text-lg font-black tracking-tight leading-tight">
                  {typeConf.label}
                </DialogTitle>
                <p className="text-[12px] font-medium opacity-90 leading-snug mt-0.5">
                  {typeConf.sens}
                </p>
              </div>
            </div>
          </DialogHeader>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="p-5 space-y-5 bg-white max-h-[70vh] overflow-y-auto">

          {/* ── 1 · Quel produit ? ── */}
          <SectionFormulaire
            numero={1}
            titre="Quel produit ?"
            aide={form.articleId
              ? "Le mouvement ne touchera que cette référence."
              : "Descendez de la famille jusqu'à la référence exacte."}
            action={form.articleId ? (
              <button
                type="button"
                onClick={() => setForm(f => ({ ...f, articleId: '', locationCode: '' }))}
                className="text-[12px] font-bold text-stone-500 hover:text-stone-900 underline decoration-dotted underline-offset-2 transition-colors shrink-0"
              >
                Changer de produit
              </button>
            ) : undefined}
          >
            {!form.articleId ? (
              <>
                {form.type === 'OUT' && (
                  <Encadre ton="info">
                    En sortie, seules les références qui ont du stock sont proposées. Pour faire entrer un
                    produit tombé à zéro, passez le type sur « Entrée » à l'étape 2.
                  </Encadre>
                )}
                {/* Pas encore de produit sélectionné → picker cascade */}
                <ProductPicker
                  stockItems={stockItems.filter(s => s.currentQty > 0 || form.type !== 'OUT')}
                  categories={categories}
                  generalCategories={generalCategories}
                  formType={form.type}
                  // L'emplacement suit le produit : celui d'une autre variante ne vaut plus.
                  onSelect={id => setForm(f => ({ ...f, articleId: id, locationCode: '' }))}
                />
              </>
            ) : (
              // Produit sélectionné — fiche de relecture
              <div className="space-y-3">
                <div className="bg-stone-50 rounded-2xl border border-stone-200 overflow-hidden">
                  {/* Bandeau : nom du produit */}
                  <div className="flex items-center gap-3 px-4 py-3 bg-white border-b border-stone-100">
                    <div className="w-9 h-9 rounded-xl bg-emerald-100 flex items-center justify-center shrink-0">
                      <PackageCheck className="w-4.5 h-4.5 text-emerald-600" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-[14px] font-bold text-stone-900 leading-tight truncate">
                        {selectedStock?.nameFR || selectedStock?.productName}
                      </p>
                      <p className="text-[11px] font-medium text-stone-500 mt-0.5">{selectedStock?.categoryNameFR || selectedStock?.categoryId}</p>
                    </div>
                  </div>

                  {/* Grille des attributs */}
                  <div className="grid grid-cols-3 divide-x divide-stone-100 border-b border-stone-100">
                    <div className="px-3 py-2.5 text-center">
                      <p className="text-[11px] font-medium text-stone-500 mb-0.5">Couleur</p>
                      {selectedStock?.color
                        ? <p className="text-[13px] font-bold text-stone-800 capitalize">{selectedStock.color}</p>
                        : <p className="text-[13px] text-stone-300 font-bold">—</p>}
                    </div>
                    <div className="px-3 py-2.5 text-center">
                      <p className="text-[11px] font-medium text-stone-500 mb-0.5">Numéro / taille</p>
                      {selectedStock?.size
                        ? <p className="text-[13px] font-bold text-stone-800">{selectedStock.size}</p>
                        : <p className="text-[13px] text-stone-300 font-bold">—</p>}
                    </div>
                    <div className="px-3 py-2.5 text-center">
                      <p className="text-[11px] font-medium text-stone-500 mb-0.5">Se compte en</p>
                      <p className="text-[13px] font-bold text-stone-800">{selectedStock?.unitOfMeasure || '—'}</p>
                    </div>
                  </div>

                  {/* Stock actuel de la variante */}
                  <div className="px-4 py-3">
                    <p className="text-[11px] font-medium text-stone-500">Stock enregistré aujourd'hui</p>
                    <p className="text-[20px] font-black text-stone-900 leading-none mt-1">
                      {fmt(selectedStock?.currentQty || 0)}
                      <span className="text-[12px] font-bold text-stone-400 ml-1.5">{selectedStock?.unitOfMeasure}</span>
                    </p>
                  </div>
                </div>

                {variante && (
                  <Encadre ton="astuce">
                    Ce mouvement ne touche que la variante <strong>{variante}</strong>. Les autres couleurs
                    ou qualités du même produit ne bougeront pas.
                  </Encadre>
                )}
              </div>
            )}
          </SectionFormulaire>

          {/* ── 2 · Quel mouvement ? ── */}
          <SectionFormulaire
            numero={2}
            titre="Quel mouvement ?"
            aide="Le type commande tout le reste : les motifs proposés, le sens du stock et les produits disponibles."
          >
            <Champ
              label="Type de mouvement"
              obligatoire
              aide="En changer relance le choix du produit, car la liste des produits n'est pas la même."
            >
              <div className="grid grid-cols-3 gap-2">
                {(Object.keys(TYPE_CONFIG) as StockMovementType[]).map(t => {
                  const conf = TYPE_CONFIG[t];
                  const style = TYPE_STYLE[t];
                  const IconeType = conf.icon;
                  const actif = form.type === t;
                  return (
                    <button key={t} type="button"
                      onClick={() => setForm(f => ({ ...f, type: t, reason: '', articleId: '' }))}
                      className={`rounded-xl border-2 px-2.5 py-2.5 text-left transition-all ${
                        actif ? `${style.actif} shadow-sm` : 'border-stone-200 bg-white hover:border-stone-300'
                      }`}
                    >
                      <span className="flex items-center gap-1.5">
                        <IconeType className={`w-3.5 h-3.5 shrink-0 ${actif ? style.icone : 'text-stone-400'}`} />
                        <span className={`text-[13px] font-bold ${actif ? style.texte : 'text-stone-700'}`}>{conf.court}</span>
                      </span>
                      <span className="block text-[11px] font-medium text-stone-500 leading-snug mt-0.5">
                        {conf.sensCourt}
                      </span>
                    </button>
                  );
                })}
              </div>
            </Champ>

            <Champ
              label="Motif"
              obligatoire
              htmlFor="mouvement-motif"
              aide="C'est ce que l'on relira dans six mois pour comprendre pourquoi le stock a bougé."
            >
              <>
                <Select
                  value={form.reason}
                  onValueChange={v => {
                    setForm(f => {
                      let nextStoreId = f.storeId;
                      if (f.type === 'IN' && v === 'ARRIVAGE') {
                        const isWh = stores.some(s => s.id === f.storeId && s.type === 'WAREHOUSE');
                        if (!isWh) {
                          nextStoreId = (stores.find(s => s.type === 'WAREHOUSE')?.id || 'ENTREPOT') as StoreLocation;
                        }
                      }
                      return { ...f, reason: v as StockMovementReason, storeId: nextStoreId };
                    });
                  }}
                >
                  <SelectTrigger id="mouvement-motif" className={CLASSE_CHAMP}>
                    <SelectValue placeholder="Choisir le motif…" />
                  </SelectTrigger>
                  <SelectContent>
                    {reasons.map(r => (
                      <SelectItem key={r.value} value={r.value}>
                        <span className="font-bold text-sm inline-flex items-center gap-2">
                          <r.icon className="w-3.5 h-3.5" />{r.label}
                        </span>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {motifChoisi && (
                  <p className="text-[11px] font-medium text-stone-500 leading-snug mt-1.5">{motifChoisi.aide}</p>
                )}
              </>
            </Champ>

            {arrivageEnCours && (
              <Encadre ton="info" titre="Un arrivage se range en réserve">
                Le lieu a été basculé sur l'entrepôt : à l'étape 3, seuls les entrepôts sont proposés.
                La réserve est celle du magasin principal, sa marchandise compte donc déjà dans le stock.
              </Encadre>
            )}
          </SectionFormulaire>

          {/* ── 3 · Combien et où ? — visible seulement si produit choisi ── */}
          {form.articleId && (
            <SectionFormulaire
              numero={3}
              titre="Combien et où ?"
              aide="La quantité dit ce qui bouge, le lieu dit d'où, l'emplacement dit à quel rack."
            >
              <Champ
                label={`Quantité${unite ? ` (en ${unite})` : ''}`}
                obligatoire
                htmlFor="mouvement-quantite"
                indice={selectedStock ? `stock : ${fmt(selectedStock.currentQty)} ${selectedStock.unitOfMeasure}` : undefined}
                aide={form.type === 'ADJUSTMENT'
                  ? "Un ajustement accepte un nombre négatif quand le comptage trouve moins que le logiciel."
                  : undefined}
              >
                <Input
                  id="mouvement-quantite"
                  type="number" min={form.type === 'ADJUSTMENT' ? undefined : 0.01} step="any" required
                  placeholder="0"
                  value={form.quantity}
                  onChange={e => setForm(f => ({ ...f, quantity: e.target.value }))}
                  className={`${CLASSE_CHAMP} font-black text-lg`}
                  autoFocus
                />
              </Champ>

              {/* Sortie supérieure au stock : signalée, jamais bloquée */}
              {sortieTropGrande && selectedStock && (
                <Encadre ton="attention" titre="Plus que le stock enregistré">
                  Le stock enregistré est de {selectedStock.currentQty} {selectedStock.unitOfMeasure}.
                  L'enregistrement reste possible : le stock passera en négatif, ce qui signale un écart
                  à régulariser par un inventaire.
                </Encadre>
              )}

              {/* Lieu : magasin ou réserve */}
              {canChooseStore ? (
                <Champ label={libelleLieu} obligatoire htmlFor="mouvement-lieu" aide={aideLieu}>
                  <Select value={form.storeId} onValueChange={v => setForm(f => {
                    // Un entrepôt n'est pas un emplacement de vente/mouvement indépendant (sauf
                    // pour un arrivage, qui cible volontairement un entrepôt précis) — c'est le
                    // stock de CHRIFA. Sinon les règles Firestore refuseraient l'écriture pour
                    // un compte commercial (storeId ne correspondrait pas à son propre magasin).
                    const isArrivage = f.type === 'IN' && f.reason === 'ARRIVAGE';
                    const picked = stores.find(s => s.id === v);
                    const normalized = (!isArrivage && picked?.type === 'WAREHOUSE') ? 'CHRIFA' : v;
                    // L'emplacement appartient au lieu : changer de lieu invalide le choix.
                    // physicalStoreId garde l'entrepôt réel pour retrouver SES racks, même
                    // quand storeId est ramené à CHRIFA pour la comptabilité du stock.
                    return { ...f, storeId: normalized as StoreLocation, physicalStoreId: v as StoreLocation, locationCode: '' };
                  })}>
                    <SelectTrigger id="mouvement-lieu" className={CLASSE_CHAMP}>
                      <SelectValue placeholder={arrivageEnCours ? "Choisir l'entrepôt…" : 'Choisir le lieu…'} />
                    </SelectTrigger>
                    <SelectContent>
                      {(form.type === 'IN' && form.reason === 'ARRIVAGE' ? stores.filter(s => s.type === 'WAREHOUSE') : stores).map(s => (
                        <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </Champ>
              ) : (
                <Encadre ton="info" titre="Lieu du mouvement">
                  Ce mouvement sera enregistré sur {physicalPlaceName || 'votre magasin'} : depuis un
                  magasin, on ne bouge que son propre stock.
                </Encadre>
              )}

              {canChooseStore && lieuEstReserve && (
                <Encadre ton="info">
                  {physicalPlaceName || 'Cet entrepôt'} est une réserve, pas un magasin à part : sa
                  marchandise compte dans le stock du magasin principal, mais les emplacements
                  proposés ci-dessous sont bien ceux de ce bâtiment.
                </Encadre>
              )}

              {/* Emplacement physique — proposé seulement si le lieu a été découpé en zones */}
              {availableLocations.length > 0 && (
                <Champ
                  label={
                    <span className="inline-flex items-center gap-1.5">
                      <MapPin className="w-3.5 h-3.5 text-blue-500" />
                      {form.type === 'IN' ? 'Emplacement où ranger' : 'Emplacement où prendre'}
                    </span>
                  }
                  htmlFor="mouvement-emplacement"
                  /* Nomme le bâtiment : pour une sortie d'entrepôt, storeId est ramené à
                     CHRIFA alors que les racks restent ceux de l'entrepôt. */
                  indice={physicalPlaceName || undefined}
                  aide="Pré-rempli : à l'entrée, le rack où le produit est déjà rangé s'il n'y en a qu'un ; à la sortie, le rack où il dort depuis le plus longtemps. Corrigez-le si la marchandise part d'ailleurs."
                >
                  <Select
                    value={form.locationCode || '__NONE__'}
                    onValueChange={v => setForm(f => ({ ...f, locationCode: v === '__NONE__' ? '' : v }))}
                  >
                    <SelectTrigger id="mouvement-emplacement" className={CLASSE_CHAMP}>
                      <SelectValue placeholder="Non précisé" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="__NONE__">Non précisé</SelectItem>
                      {availableLocations.map(l => (
                        <SelectItem key={l.id} value={l.code}>
                          {l.code}{l.label ? ` — ${l.label}` : ''}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </Champ>
              )}

              <Champ label="Date du mouvement" obligatoire htmlFor="mouvement-date">
                <Input
                  id="mouvement-date"
                  type="date" required
                  value={form.date}
                  onChange={e => setForm(f => ({ ...f, date: e.target.value }))}
                  className={CLASSE_CHAMP}
                />
              </Champ>

              <Champ
                label={<>Notes <span className="font-medium text-stone-400">(facultatif)</span></>}
                htmlFor="mouvement-notes"
                aide="Ce qui permettra de retrouver ce mouvement plus tard : numéro de bon, nom du client, remarque."
              >
                <Input
                  id="mouvement-notes"
                  placeholder="Réf. bon de livraison, client, remarque…"
                  value={form.notes}
                  onChange={e => setForm(f => ({ ...f, notes: e.target.value }))}
                  className={`${CLASSE_CHAMP} font-medium`}
                />
              </Champ>
            </SectionFormulaire>
          )}

          {/* ── Relecture avant enregistrement ── */}
          {form.articleId && (
            <Recapitulatif titre="À relire avant d'enregistrer">
              <LigneResume
                libelle="Mouvement"
                valeur={`${typeConf.court} · ${motifChoisi?.label || 'motif à choisir'}`}
              />
              <LigneResume
                libelle="Produit"
                valeur={selectedStock?.nameFR || selectedStock?.productName || '—'}
              />
              {variante && <LigneResume libelle="Variante" valeur={variante} />}
              <LigneResume libelle="Lieu" valeur={physicalPlaceName || 'à choisir'} />
              {availableLocations.length > 0 && (
                <LigneResume libelle="Emplacement" valeur={form.locationCode || 'non précisé'} />
              )}
              <LigneResume libelle="Date" valeur={dateLisible(form.date)} />
              <LigneResume
                fort
                libelle="Quantité"
                valeur={quantiteLisible
                  ? `${form.type === 'IN' ? '+ ' : form.type === 'OUT' ? '− ' : ''}${form.quantity} ${unite}`
                  : 'à saisir'}
              />
              {quantiteLisible && form.type !== 'ADJUSTMENT' && (
                <LigneResume
                  fort
                  libelle="Stock après enregistrement"
                  valeur={`${fmt(stockApres)} ${unite}`}
                  ton={stockApres < 0 ? 'alerte' : 'positif'}
                />
              )}
            </Recapitulatif>
          )}
        </form>

        <DialogFooter className="px-5 pb-5 bg-white gap-2">
          <Button
            variant="ghost"
            onClick={() => onOpenChange(false)}
            className="rounded-xl text-[13px] font-bold text-stone-500 hover:text-stone-900"
          >
            Annuler
          </Button>
          <div className="flex-1">
            <BoutonValider
              onClick={validerDepuisLePied}
              enCours={saving}
              libelleEnCours="Enregistrement…"
              raisonDesactive={raisonDesactive}
              className={`shadow-lg ${TYPE_STYLE[form.type].bouton}`}
            >
              {typeConf.verbe}
            </BoutonValider>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
