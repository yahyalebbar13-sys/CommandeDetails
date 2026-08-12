"use client";

import React, { useState, useMemo, useEffect } from 'react';
import {
  Layers, Package, ArrowRight, ArrowDownToLine, ArrowUpFromLine,
  ChevronLeft, AlertTriangle, CheckCircle2, BarChart3, DollarSign,
  Boxes, TrendingUp, Hash, Calendar, Tag, Info
} from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog';

// ── Helpers ───────────────────────────────────────────────────────────────────
const UI_COLORS = ['#CC8626','#1E293B','#3B82F6','#10B981','#6366F1','#F43F5E','#8B5CF6','#EC4899'];
const LINE_COLORS: Record<string, string> = {
  'Fabric':'#8B5CF6','Slider et puller':'#3B82F6','Zipper':'#F59E0B','Bouton':'#10B981','Reste':'#6B7280',
};

function fmt(n: number) { return Math.round(n).toLocaleString('fr-MA'); }
function fmtDec(n: number, d = 2) {
  return Number(n).toLocaleString('fr-MA', { minimumFractionDigits: d, maximumFractionDigits: d });
}

// ── Calcul FIFO ───────────────────────────────────────────────────────────────
interface FIFOBatch {
  date: string;
  factureId: string;
  qtyIn: number;
  consumed: number;
  remaining: number;
  costPerUnit: number;   // MAD/u
  batchValue: number;    // valeur restante MAD
  status: 'ÉPUISÉ' | 'PARTIEL' | 'DISPONIBLE';
}

function computeFIFO(
  entriesIN: any[],
  entriesOUT: any[],
  defaultCost: number
): FIFOBatch[] {
  // Trier les entrées par date (plus ancien = prioritaire FIFO)
  const batches: FIFOBatch[] = [...entriesIN]
    .sort((a, b) => (a.date || '').localeCompare(b.date || ''))
    .map(e => ({
      date:        e.date || '—',
      factureId:   e.factureId || e.notes || '—',
      qtyIn:       Number(e.quantity) || 0,
      consumed:    0,
      remaining:   Number(e.quantity) || 0,
      costPerUnit: (e.purchasePriceMAD != null && e.purchasePriceMAD > 0) ? e.purchasePriceMAD : defaultCost,
      batchValue:  0,
      status:      'DISPONIBLE',
    }));

  // Appliquer les sorties en FIFO
  const exits = [...entriesOUT].sort((a, b) => (a.date || '').localeCompare(b.date || ''));
  exits.forEach(exit => {
    let toConsume = Number(exit.quantity) || 0;
    for (const batch of batches) {
      if (toConsume <= 0 || batch.remaining <= 0) continue;
      const consume = Math.min(toConsume, batch.remaining);
      batch.consumed  += consume;
      batch.remaining -= consume;
      toConsume       -= consume;
    }
  });

  // Calculer valeurs finales
  batches.forEach(b => {
    b.batchValue = Math.round(b.remaining * b.costPerUnit);
    b.status = b.remaining === 0 ? 'ÉPUISÉ' : b.consumed > 0 ? 'PARTIEL' : 'DISPONIBLE';
  });

  return batches;
}

// ── Header KPI partagé ────────────────────────────────────────────────────────
function StockHeader({
  totalRefs, totalStock, totalVal, alertCount
}: { totalRefs: number; totalStock: number; totalVal: number; alertCount: number }) {
  return (
    <div className="bg-gradient-to-br from-stone-900 to-stone-800 rounded-3xl p-8 relative overflow-hidden">
      <div className="absolute inset-0 bg-gradient-to-r from-emerald-900/30 to-transparent pointer-events-none" />
      <div className="relative z-10 flex items-start justify-between flex-wrap gap-6">
        <div>
          <p className="text-[8px] font-black text-emerald-400 uppercase tracking-[0.4em] mb-1">Stock Physique Validé</p>
          <h2 className="text-3xl font-black text-white uppercase tracking-tighter leading-none">
            Fiches de <span className="text-emerald-400">Stock</span>
          </h2>
          <p className="text-stone-400 text-xs mt-2">Méthode FIFO · entrées validées manuellement · coûts réels</p>
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {[
            { label: 'Références', value: String(totalRefs),         icon: BarChart3,    color: 'text-stone-300' },
            { label: 'Stock Total', value: fmt(totalStock),           icon: Boxes,        color: 'text-blue-400'  },
            { label: 'Valeur MAD',  value: `${fmt(totalVal)} MAD`,   icon: DollarSign,   color: 'text-emerald-400'},
            { label: 'Alertes',     value: String(alertCount),        icon: AlertTriangle,color: alertCount > 0 ? 'text-amber-400' : 'text-stone-500' },
          ].map(({ label, value, icon: Icon, color }) => (
            <div key={label} className="bg-white/10 backdrop-blur-sm rounded-2xl px-4 py-3 text-center">
              <Icon className={`w-4 h-4 ${color} mx-auto mb-1`} />
              <p className={`text-[14px] font-black ${color} leading-none`}>{value}</p>
              <p className="text-[7px] font-black text-stone-500 uppercase tracking-widest mt-1">{label}</p>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// ── Fiche complète d'un produit (niveau 4) ───────────────────────────────────
function ProductFiche({
  article, variants, movements, factures, onBack, color, inline = false, userRole = 'ADMIN'
}: {
  article: any; variants: any[]; movements: any[]; factures: any[]; onBack: () => void; color: string; inline?: boolean; userRole?: string;
}) {
  const artMovs = useMemo(() =>
    movements.filter(m => variants.some(v => m.articleId === v.articleId))
      .sort((a, b) => (b.date || '').localeCompare(a.date || '')), // tri DESC pour l'historique
    [movements, variants]
  );

  const totalIn  = variants.reduce((s, v) => s + v.initialQty + v.mouvementsIn, 0);
  const totalOut = variants.reduce((s, v) => s + v.mouvementsOut, 0);
  const currentQty = variants.reduce((s, v) => s + v.currentQty, 0);
  const totalValue = variants.reduce((s, v) => s + (v.currentQty * (v.purchasePricePerUnit || 0)), 0);
  const avgCost = currentQty > 0 ? totalValue / currentQty : (article.purchasePricePerUnit || 0);

  const isAlert   = variants.some(v => v.minThreshold != null && v.currentQty <= v.minThreshold);
  const pct       = totalIn > 0 ? Math.min(100, Math.round((currentQty / totalIn) * 100)) : 100;

  // Regrouper les variantes pour le tableau propre
  const groupedVariantsDetails = useMemo(() => {
    return Array.from(
      variants.reduce((map, v) => {
        const key = `${v.color || ''}|${v.size || ''}`.toLowerCase();
        if (!map.has(key)) {
          map.set(key, { 
            ...v, 
            totalIn: v.initialQty + v.mouvementsIn,
            totalOut: v.mouvementsOut,
            currentQty: v.currentQty,
            minThreshold: v.minThreshold,
            totalValue: v.currentQty * (v.purchasePricePerUnit || 0)
          });
        } else {
          const e = map.get(key);
          e.totalIn += (v.initialQty + v.mouvementsIn);
          e.totalOut += v.mouvementsOut;
          e.currentQty += v.currentQty;
          e.totalValue += (v.currentQty * (v.purchasePricePerUnit || 0));
        }
        return map;
      }, new Map<string, any>()).values()
    ).sort((a: any, b: any) => b.currentQty - a.currentQty);
  }, [variants]);

  const variantsBySize = useMemo(() => {
    const map = new Map<string, any[]>();
    groupedVariantsDetails.forEach(v => {
      const sizeKey = v.size || 'STANDARD';
      if (!map.has(sizeKey)) map.set(sizeKey, []);
      map.get(sizeKey)!.push(v);
    });
    return Array.from(map.entries()).sort((a, b) => a[0].localeCompare(b[0]));
  }, [groupedVariantsDetails]);

  const [selectedSize, setSelectedSize] = useState<string>(variantsBySize[0]?.[0] || 'STANDARD');

  // Si la taille sélectionnée n'existe plus (ex: filtre change), on reset
  useEffect(() => {
    if (variantsBySize.length > 0 && !variantsBySize.some(v => v[0] === selectedSize)) {
      setSelectedSize(variantsBySize[0][0]);
    }
  }, [variantsBySize, selectedSize]);

  const currentSizeVariants = variantsBySize.find(v => v[0] === selectedSize)?.[1] || [];

  return (
    <div className="space-y-6">
      {/* Breadcrumb — caché en mode inline */}
      {!inline && (
        <div className="flex items-center gap-2">
          <button onClick={onBack} className="flex items-center gap-1.5 text-[9px] font-black text-stone-500 hover:text-stone-900 uppercase tracking-widest transition-colors bg-stone-100 hover:bg-stone-200 px-3 py-1.5 rounded-lg">
            <ChevronLeft className="w-3.5 h-3.5" /> Retour
          </button>
        </div>
      )}

      {/* ── En-tête simplifié ── */}
      <div className="bg-white rounded-3xl border border-stone-100 shadow-sm overflow-hidden relative">
        <div className="h-1.5 w-full" style={{ background: color }} />
        <div className="p-6 flex flex-col md:flex-row md:items-center justify-between gap-6">
          <div>
            <p className="text-[9px] font-black text-stone-400 uppercase tracking-widest">{article.categoryId}</p>
            <h3 className="text-2xl font-black text-stone-900 uppercase tracking-tighter mt-1">{article.productName}</h3>
          </div>
          <div className="flex flex-wrap items-center gap-x-6 gap-y-4 justify-end">
            <div className="text-center">
              <p className="text-[8px] font-black text-stone-400 uppercase tracking-widest mb-1">Entrées</p>
              <p className="text-lg font-black text-emerald-600">+{fmt(totalIn)}</p>
            </div>
            <div className="w-px h-8 bg-stone-100 hidden sm:block"></div>
            <div className="text-center">
              <p className="text-[8px] font-black text-stone-400 uppercase tracking-widest mb-1">Sorties</p>
              <p className="text-lg font-black text-rose-600">{totalOut > 0 ? `-${fmt(totalOut)}` : '0'}</p>
            </div>
            <div className="w-px h-8 bg-stone-100 hidden sm:block"></div>
            <div className="text-center">
              <p className="text-[8px] font-black text-stone-400 uppercase tracking-widest mb-1">En Stock</p>
              <p className={`text-2xl font-black ${isAlert ? 'text-amber-600' : 'text-stone-900'}`}>{fmt(currentQty)} <span className="text-xs text-stone-400">{article.unitOfMeasure}</span></p>
            </div>
            
            {userRole === 'ADMIN' && (
              <>
                <div className="w-px h-8 bg-stone-100 hidden sm:block"></div>
                <div className="text-center bg-stone-50 rounded-xl px-4 py-2 border border-stone-100">
                  <p className="text-[8px] font-black text-stone-500 uppercase tracking-widest mb-1">Coût unitaire moy.</p>
                  <p className="text-lg font-black text-violet-600">{fmtDec(avgCost)} <span className="text-[10px] text-stone-400">MAD</span></p>
                </div>
                <div className="text-center bg-emerald-50 rounded-xl px-4 py-2 border border-emerald-100">
                  <p className="text-[8px] font-black text-emerald-700 uppercase tracking-widest mb-1">Valeur du Stock</p>
                  <p className="text-2xl font-black text-emerald-600">{fmt(totalValue)} <span className="text-[10px] text-emerald-400">MAD</span></p>
                </div>
              </>
            )}
          </div>
        </div>
        <div className="h-1.5 bg-stone-100 w-full">
          <div className="h-full transition-all" style={{ width: `${pct}%`, backgroundColor: pct < 25 ? '#ef4444' : pct < 50 ? '#f59e0b' : '#10b981' }} />
        </div>
      </div>

      {/* ── Tableaux des variantes avec Onglets par taille ── */}
      <div className="space-y-4">
        {variantsBySize.length > 1 && (
          <div className="flex items-center gap-2 overflow-x-auto pb-2">
            {variantsBySize.map(([sizeName]) => (
              <button
                key={sizeName}
                onClick={() => setSelectedSize(sizeName)}
                className={`px-6 py-2.5 rounded-2xl text-[11px] font-black uppercase tracking-widest transition-all whitespace-nowrap border ${
                  selectedSize === sizeName 
                    ? 'bg-stone-900 text-white border-stone-900 shadow-md scale-105'
                    : 'bg-white text-stone-500 border-stone-200 hover:bg-stone-50 hover:text-stone-700'
                }`}
              >
                Taille : {sizeName}
              </button>
            ))}
          </div>
        )}

        <div className="bg-white rounded-3xl border border-stone-100 shadow-sm overflow-hidden animate-in fade-in duration-300">
          <div className="px-6 py-4 border-b border-stone-50 bg-stone-50/50 flex items-center gap-2">
            <Package className="w-4 h-4 text-stone-500" />
            <h4 className="text-[10px] font-black text-stone-700 uppercase tracking-widest">
              {selectedSize === 'STANDARD' ? 'État des Variantes' : `Couleurs pour la taille : ${selectedSize}`}
            </h4>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-stone-100">
                  <th className="px-6 py-3 text-left font-black text-stone-400 uppercase tracking-widest text-[8px]">Couleur</th>
                  {selectedSize === 'STANDARD' && <th className="px-6 py-3 text-left font-black text-stone-400 uppercase tracking-widest text-[8px]">Taille</th>}
                  <th className="px-6 py-3 text-right font-black text-stone-400 uppercase tracking-widest text-[8px]">Seuil Min.</th>
                  <th className="px-6 py-3 text-right font-black text-emerald-600/70 uppercase tracking-widest text-[8px]">Entrées</th>
                  <th className="px-6 py-3 text-right font-black text-rose-600/70 uppercase tracking-widest text-[8px]">Sorties</th>
                  <th className="px-6 py-3 text-right font-black text-stone-800 uppercase tracking-widest text-[9px]">Stock Réel</th>
                  <th className="px-6 py-3 text-left font-black text-stone-400 uppercase tracking-widest text-[8px]">Répartition (par entrepôt)</th>
                  {userRole === 'ADMIN' && <th className="px-6 py-3 text-right font-black text-violet-600/70 uppercase tracking-widest text-[8px]">Coût Unitaire</th>}
                  {userRole === 'ADMIN' && <th className="px-6 py-3 text-right font-black text-emerald-600/70 uppercase tracking-widest text-[8px]">Valeur</th>}
                  <th className="px-6 py-3 text-right font-black text-stone-400 uppercase tracking-widest text-[8px]">Statut</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-stone-50">
                {currentSizeVariants.map((v: any, i: number) => {
                  const isRupt = v.currentQty <= 0;
                  const isAlerte = v.minThreshold != null && v.currentQty <= v.minThreshold;
                  return (
                    <tr key={i} className="hover:bg-stone-50 transition-colors">
                      <td className="px-6 py-4">
                        {v.color ? <span className="font-bold text-stone-700">{v.color}</span> : <span className="text-stone-300">—</span>}
                      </td>
                      {selectedSize === 'STANDARD' && (
                        <td className="px-6 py-4">
                          {v.size ? <span className="font-bold text-stone-700">{v.size}</span> : <span className="text-stone-300">—</span>}
                        </td>
                      )}
                      <td className="px-6 py-4 text-right">
                        {v.minThreshold != null ? <span className="font-bold text-stone-400">{fmt(v.minThreshold)}</span> : <span className="text-stone-300">—</span>}
                      </td>
                      <td className="px-6 py-4 text-right font-bold text-emerald-600">+{fmt(v.totalIn)}</td>
                      <td className="px-6 py-4 text-right font-bold text-rose-600">-{fmt(v.totalOut)}</td>
                      <td className="px-6 py-4 text-right font-black text-sm text-stone-900">{fmt(v.currentQty)}</td>
                      <td className="px-6 py-4 text-left">
                        {v.qtyByStore && Object.entries(v.qtyByStore).map(([sId, q]: any) => q > 0 && (
                          <div key={sId} className="text-[9px] text-stone-500 whitespace-nowrap">
                            <span className="font-bold">{sId.replace('_', ' ')}:</span> {q}
                          </div>
                        ))}
                      </td>
                      {userRole === 'ADMIN' && <td className="px-6 py-4 text-right font-bold text-violet-600">{fmtDec(v.purchasePricePerUnit || article.purchasePricePerUnit || 0)} <span className="text-[9px] text-stone-400">MAD</span></td>}
                      {userRole === 'ADMIN' && <td className="px-6 py-4 text-right font-black text-emerald-600">{fmt(v.totalValue)} <span className="text-[9px] text-stone-400">MAD</span></td>}
                      <td className="px-6 py-4 text-right">
                        {isRupt ? (
                          <span className="text-[9px] font-black text-red-600 bg-red-50 px-2.5 py-1 rounded-full uppercase">Rupture</span>
                        ) : isAlerte ? (
                          <span className="text-[9px] font-black text-amber-600 bg-amber-50 px-2.5 py-1 rounded-full uppercase">Alerte</span>
                        ) : (
                          <span className="text-[9px] font-black text-emerald-600 bg-emerald-50 px-2.5 py-1 rounded-full uppercase">OK</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {/* ── Historique des mouvements récent ── */}
      {artMovs.length > 0 && (
        <div className="bg-white rounded-3xl border border-stone-100 shadow-sm overflow-hidden">
          <div className="px-6 py-4 border-b border-stone-50 bg-stone-50/50 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <TrendingUp className="w-4 h-4 text-stone-500" />
              <h4 className="text-[10px] font-black text-stone-700 uppercase tracking-widest">Derniers Mouvements</h4>
            </div>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <tbody className="divide-y divide-stone-50">
                {artMovs.slice(0, 10).map((mv, i) => {
                  const isIN  = mv.type === 'IN';
                  const isOUT = mv.type === 'OUT';
                  const qty   = Number(mv.quantity) || 0;
                  return (
                    <tr key={i} className="hover:bg-stone-50 transition-colors">
                      <td className="px-6 py-3 text-stone-500 font-bold whitespace-nowrap">{mv.date || '—'}</td>
                      <td className="px-6 py-3">
                        <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[8px] font-black uppercase ${
                          isIN  ? 'bg-emerald-50 text-emerald-700' :
                          isOUT ? 'bg-rose-50 text-rose-700' :
                                  'bg-amber-50 text-amber-700'
                        }`}>
                          {isIN  ? <ArrowDownToLine className="w-3 h-3" /> : isOUT ? <ArrowUpFromLine className="w-3 h-3" /> : null}
                          {mv.type}
                        </span>
                      </td>
                      <td className="px-6 py-3">
                        <span className="font-bold text-stone-600">{mv.color} {mv.size}</span>
                      </td>
                      <td className="px-6 py-3 text-stone-400 font-medium">
                        {mv.reason || '—'}
                      </td>
                      <td className="px-6 py-3 text-right font-black text-sm">
                        {isIN ? <span className="text-emerald-600">+{fmt(qty)}</span> : 
                         isOUT ? <span className="text-rose-600">-{fmt(qty)}</span> :
                         <span className="text-amber-600">{fmt(qty)}</span>}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
              <tfoot>
                <tr className="bg-stone-900 text-white border-t-2 border-stone-700">
                  <td colSpan={3} className="px-5 py-3 text-[8px] font-black text-stone-400 uppercase tracking-widest">Totaux</td>
                  <td className="px-5 py-3 text-right font-black text-emerald-400">+{fmt(totalIn)}</td>
                  <td className="px-5 py-3 text-right font-black text-rose-400">{totalOut > 0 ? `-${fmt(totalOut)}` : '—'}</td>
                  <td className="px-5 py-3 text-right font-black text-white text-[14px]">{fmt(article.currentQty)}</td>
                  <td className="px-5 py-3 text-right font-black text-violet-300">{cost > 0 ? fmtDec(cost) : '—'}</td>
                  <td className="px-5 py-3 text-right font-black text-emerald-400">{fifoValue > 0 ? `${fmt(fifoValue)} MAD` : '—'}</td>
                  <td className="px-5 py-3"></td>
                </tr>
              </tfoot>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Tableau niveau 3 : produits d'une sous-catégorie ─────────────────────────
function ProductsTable({
  items, subCatName, movements, factures, onBack, headerProp, userRole = 'ADMIN'
}: {
  items: any[]; subCatName: string; movements: any[]; factures: any[];
  onBack: () => void; headerProp?: React.ReactNode; userRole?: string;
}) {
  const [selectedArticle, setSelectedArticle] = useState<any | null>(null);

  const groupedVariants = useMemo(() => {
    const grouped = new Map<string, any[]>();
    items.forEach(i => {
      const pid = (i.productName || '').trim().toLowerCase();
      if (!grouped.has(pid)) grouped.set(pid, []);
      grouped.get(pid)!.push(i);
    });
    return Array.from(grouped.values());
  }, [items]);

  const totalIn  = items.reduce((s, i) => s + i.initialQty + i.mouvementsIn, 0);
  const totalQty = items.reduce((s, i) => s + i.currentQty, 0);
  const totalVal = items.reduce((s, i) => s + Math.round(i.currentQty * (i.purchasePricePerUnit || 0)), 0);
  const alertCount = items.filter(i => i.minThreshold != null && i.currentQty <= i.minThreshold).length;

  if (groupedVariants.length === 1) {
    const variants = groupedVariants[0];
    const a = variants[0];
    return (
      <div className="animate-in fade-in duration-300">
        <ProductFiche
          article={a}
          variants={variants}
          movements={movements}
          factures={factures}
          color={UI_COLORS[0]}
          onBack={onBack}
          inline={false}
          userRole={userRole}
        />
      </div>
    );
  }

  if (selectedArticle) {
    return (
      <div className="animate-in fade-in duration-300">
        <ProductFiche
          article={selectedArticle}
          variants={selectedArticle._variants || [selectedArticle]}
          movements={movements}
          factures={factures}
          color={UI_COLORS[items.findIndex(i => i.articleId === selectedArticle.articleId) % UI_COLORS.length] || UI_COLORS[0]}
          onBack={() => setSelectedArticle(null)}
          inline={false}
          userRole={userRole}
        />
      </div>
    );
  }

  return (
    <div className="space-y-4 animate-in fade-in duration-200">
      {headerProp && <div className="mb-6">{headerProp}</div>}
      {/* Breadcrumb */}
      <div className="flex items-center gap-2">
        <button onClick={onBack} className="flex items-center gap-1.5 text-[9px] font-black text-stone-500 hover:text-stone-900 uppercase tracking-widest transition-colors">
          <ChevronLeft className="w-3.5 h-3.5" /> Retour
        </button>
        <span className="text-stone-200">/</span>
        <span className="text-[9px] font-black text-stone-900 uppercase tracking-widest">{subCatName}</span>
      </div>

      {alertCount > 0 && (
        <div className="bg-amber-50 border border-amber-200 rounded-2xl px-5 py-3 flex items-center gap-3">
          <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0" />
          <p className="text-[10px] font-black text-amber-800 uppercase tracking-wider">
            {alertCount} produit{alertCount > 1 ? 's' : ''} sous le seuil minimum · cliquez sur un produit pour voir le détail FIFO
          </p>
        </div>
      )}

      {/* Tableau */}
      <div className="bg-white rounded-2xl border border-stone-100 shadow-sm overflow-hidden">
        <div className="px-6 py-4 border-b border-stone-100 flex items-center justify-between bg-stone-50/50">
          <div className="flex items-center gap-2">
            <TrendingUp className="w-4 h-4 text-emerald-500" />
            <span className="text-[10px] font-black text-stone-700 uppercase tracking-wider">
              {subCatName} · {items.length} produit{items.length !== 1 ? 's' : ''}
            </span>
          </div>
          <div className="flex gap-4 text-[9px] font-bold text-stone-400">
            <span>Stock : <strong className="text-stone-700">{fmt(totalQty)}</strong></span>
            <span>Valeur : <strong className="text-emerald-700">{fmt(totalVal)} MAD</strong></span>
          </div>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6 p-6">
          {groupedVariants.length === 0 ? (
            <div className="col-span-full py-16 text-center text-stone-300 text-[9px] font-black uppercase tracking-widest">
              Aucun article validé dans cette sous-catégorie
            </div>
          ) : (
            groupedVariants.map((variants, idx) => {
              const a = variants[0];
              const isMulti = variants.length > 1;
              const color  = UI_COLORS[idx % UI_COLORS.length];
              const cost   = a.purchasePricePerUnit || 0;
              const totalIn = variants.reduce((s, v) => s + v.initialQty + v.mouvementsIn, 0);
              const totalCurrent = variants.reduce((s, v) => s + v.currentQty, 0);
              const pct    = totalIn > 0 ? Math.min(100, Math.round((totalCurrent / totalIn) * 100)) : 100;
              const artIN  = movements.filter(m => variants.some(v => m.articleId === v.articleId) && m.type === 'IN');
              const artOUT = movements.filter(m => variants.some(v => m.articleId === v.articleId) && m.type === 'OUT');
              const batches = computeFIFO(artIN, artOUT, cost);
              const fifoVal = batches.reduce((s, b) => s + b.batchValue, 0);
              const isAlert = variants.some(v => v.minThreshold != null && v.currentQty <= v.minThreshold);
              const isRupture = totalCurrent === 0;
              const pctColor = pct < 25 ? '#ef4444' : pct < 50 ? '#f59e0b' : pct < 75 ? '#3b82f6' : '#10b981';

              return (
                <div key={a._realArticleId || a.articleId} 
                  onClick={() => setSelectedArticle({ ...a, _variants: variants })}
                  className="group flex flex-col bg-white rounded-3xl shadow-sm hover:shadow-xl hover:-translate-y-1 transition-all duration-300 border border-stone-100 overflow-hidden cursor-pointer relative"
                >
                  <div className="h-2 w-full" style={{ background: `linear-gradient(90deg, ${color}, ${color}88)` }} />
                  <div className="p-5 flex-1 flex flex-col">
                    <div className="flex items-start justify-between mb-2">
                      <div className="w-10 h-10 rounded-2xl flex items-center justify-center" style={{ backgroundColor: `${color}15` }}>
                        <Package className="w-5 h-5" style={{ color }} />
                      </div>
                      {isAlert ? (
                        <div className="bg-amber-100 text-amber-700 px-2.5 py-1 rounded-full text-[9px] font-black uppercase flex items-center gap-1">
                          <AlertTriangle className="w-3 h-3" /> Alerte
                        </div>
                      ) : isRupture ? (
                        <div className="bg-red-100 text-red-700 px-2.5 py-1 rounded-full text-[9px] font-black uppercase">
                          Rupture
                        </div>
                      ) : (
                        <div className="bg-emerald-100 text-emerald-700 px-2.5 py-1 rounded-full text-[9px] font-black uppercase">
                          OK
                        </div>
                      )}
                    </div>
                    
                    <h3 className="text-sm font-black text-stone-900 uppercase leading-tight line-clamp-2 mt-2">{a.productName}</h3>
                    <div className="flex flex-wrap items-center gap-1.5 mt-2 mb-4">
                      {isMulti ? (
                        <span className="text-[9px] font-bold bg-stone-50 border border-stone-100 text-stone-500 px-2 py-0.5 rounded-md uppercase">
                          {variants.length} variantes
                        </span>
                      ) : (
                        <>
                          {a.size  && <span className="text-[9px] font-bold bg-stone-50 border border-stone-100 text-stone-500 px-2 py-0.5 rounded-md uppercase">{a.size}</span>}
                          {a.color && <span className="text-[9px] font-bold bg-stone-50 border border-stone-100 text-stone-500 px-2 py-0.5 rounded-md uppercase">{a.color}</span>}
                        </>
                      )}
                    </div>

                  <div className="mt-auto pt-4 border-t border-stone-100">
                    <div className="flex justify-between items-end mb-3">
                      <div>
                        <p className="text-[9px] font-black text-stone-400 uppercase tracking-widest mb-0.5">Stock Réel</p>
                        <p className={`text-2xl font-black leading-none ${totalCurrent === 0 ? 'text-red-600' : isAlert ? 'text-amber-600' : 'text-stone-900'}`}>
                          {fmt(totalCurrent)} <span className="text-[10px] text-stone-400 font-bold">{a.unitOfMeasure}</span>
                        </p>
                      </div>
                      <div className="text-right">
                        <p className="text-[9px] font-black text-stone-400 uppercase tracking-widest mb-0.5">Valeur FIFO</p>
                        <p className="text-sm font-black text-violet-700">{fmt(fifoVal)} <span className="text-[9px]">MAD</span></p>
                      </div>
                    </div>

                    <div className="h-1.5 bg-stone-100 rounded-full overflow-hidden">
                      <div className="h-full rounded-full" style={{ width: `${pct}%`, backgroundColor: pctColor }} />
                    </div>
                  </div>
                </div>
              </div>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
}

// ── Vue principale — navigation 3 niveaux ────────────────────────────────────
export default function StockFiches({
  stockItems, movements, categories, generalCategories, factures, userRole = 'ADMIN'
}: {
  stockItems: any[]; movements: any[]; categories: any[];
  generalCategories: any[]; factures: any[]; userRole?: string;
}) {
  const [selGenCat, setSelGenCat] = useState<string | null>(null);
  const [selSubCat, setSelSubCat] = useState<string | null>(null);

  const stockByCategory = useMemo(() => {
    const map: Record<string, any[]> = {};
    stockItems.forEach(item => {
      const k = item.categoryId || '';
      if (!map[k]) map[k] = [];
      map[k].push(item);
    });
    return map;
  }, [stockItems]);

  const genCatsWithStock = useMemo(() => {
    const gcIds = new Set<string>();
    stockItems.forEach(item => {
      const subCat = categories.find(c => c.name === item.categoryId || c.id === item.categoryId);
      if (subCat?.generalCategoryId) gcIds.add(subCat.generalCategoryId);
    });
    return generalCategories.filter(gc => gcIds.has(gc.id));
  }, [generalCategories, stockItems, categories]);

  const totalRefs  = stockItems.length;
  const totalStock = stockItems.reduce((s, i) => s + i.currentQty, 0);
  const totalVal   = stockItems.reduce((s, i) => s + Math.round(i.currentQty * (i.purchasePricePerUnit || 0)), 0);
  const alertCount = stockItems.filter(i => i.minThreshold != null && i.currentQty <= i.minThreshold).length;

  // ── Niveau 3 : tableau produits (expansion inline) ───────────────────────
  if (selGenCat && selSubCat) {
    const subCat = categories.find(c => c.id === selSubCat || c.name === selSubCat);
    const items  = stockByCategory[subCat?.name || selSubCat] || [];
    return (
      <div className="space-y-6">
        <ProductsTable
          items={items} subCatName={subCat?.name || selSubCat}
          movements={movements} factures={factures}
          onBack={() => setSelSubCat(null)}
          headerProp={<StockHeader totalRefs={totalRefs} totalStock={totalStock} totalVal={totalVal} alertCount={alertCount} />}
          userRole={userRole}
        />
      </div>
    );
  }

  // ── Niveau 2 : sous-catégories ────────────────────────────────────────────
  if (selGenCat) {
    const gc         = generalCategories.find(g => g.id === selGenCat);
    const lineColor  = LINE_COLORS[(gc as any)?.line] || '#6B7280';
    const subCatsWS  = categories.filter(c =>
      c.generalCategoryId === selGenCat &&
      (stockByCategory[c.name]?.length || 0) > 0
    );
    return (
      <div className="space-y-6">
        <StockHeader totalRefs={totalRefs} totalStock={totalStock} totalVal={totalVal} alertCount={alertCount} />
        <div className="flex items-center gap-2">
          <button onClick={() => setSelGenCat(null)} className="flex items-center gap-1.5 text-[9px] font-black text-stone-500 hover:text-stone-900 uppercase tracking-widest transition-colors">
            <ChevronLeft className="w-3.5 h-3.5" /> Retour
          </button>
          <span className="text-stone-200">/</span>
          <div className="flex items-center gap-2"><div className="w-2 h-2 rounded-full" style={{ backgroundColor: lineColor }} />
            <span className="text-[9px] font-black text-stone-900 uppercase tracking-widest">{gc?.name}</span>
          </div>
        </div>
        {subCatsWS.length === 0 ? (
          <div className="bg-white rounded-2xl p-16 text-center border border-stone-100">
            <Package className="w-10 h-10 text-stone-200 mx-auto mb-3" />
            <p className="text-stone-300 font-black uppercase text-[10px] tracking-widest">Aucune sous-catégorie avec du stock validé</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
            {subCatsWS.map((sc, idx) => {
              const items  = stockByCategory[sc.name] || [];
              const qty    = items.reduce((s:number, i:any) => s + i.currentQty, 0);
              const val    = items.reduce((s:number, i:any) => s + Math.round(i.currentQty * (i.purchasePricePerUnit || 0)), 0);
              const alerts = items.filter((i:any) => i.minThreshold != null && i.currentQty <= i.minThreshold).length;
              const color  = UI_COLORS[idx % UI_COLORS.length];
              return (
                <Card key={sc.id} onClick={() => setSelSubCat(sc.id || sc.name)}
                  className="group cursor-pointer border-none shadow-md hover:shadow-xl transition-all duration-300 rounded-[1.2rem] overflow-hidden active:scale-95">
                  <div className="h-1 w-full" style={{ backgroundColor: color }} />
                  <CardContent className="p-4 space-y-3">
                    <div className="flex items-start justify-between">
                      <div className="p-2 rounded-lg" style={{ backgroundColor: `${color}15`, color }}>
                        <Layers className="w-3.5 h-3.5" />
                      </div>
                      {alerts > 0 && (
                        <span className="text-[7px] font-black bg-amber-100 text-amber-700 px-1.5 py-0.5 rounded-full uppercase flex items-center gap-0.5">
                          <AlertTriangle className="w-2.5 h-2.5" /> {alerts}
                        </span>
                      )}
                    </div>
                    <div>
                      <h3 className="text-[11px] font-black text-stone-800 uppercase tracking-tighter line-clamp-2">{sc.name}</h3>
                      <p className="text-[8px] text-stone-400 font-bold mt-0.5">{items.length} référence{items.length !== 1 ? 's' : ''}</p>
                    </div>
                    <div className="space-y-1 pt-2 border-t border-stone-50">
                      <div className="flex justify-between text-[8px]">
                        <span className="text-stone-400 font-black uppercase">Stock</span>
                        <span className="font-black text-stone-800">{fmt(qty)}</span>
                      </div>
                      <div className="flex justify-between text-[8px]">
                        <span className="text-stone-400 font-black uppercase">Valeur</span>
                        <span className="font-black" style={{ color }}>{val > 0 ? `${fmt(val)} MAD` : '—'}</span>
                      </div>
                    </div>
                    <div className="flex justify-end">
                      <div className="p-1.5 bg-stone-50 rounded-lg group-hover:bg-stone-900 transition-colors">
                        <ArrowRight className="w-3 h-3 text-stone-400 group-hover:text-white transition-colors" />
                      </div>
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        )}
      </div>
    );
  }

  // ── Niveau 1 : familles ───────────────────────────────────────────────────
  return (
    <div className="space-y-6">
      <StockHeader totalRefs={totalRefs} totalStock={totalStock} totalVal={totalVal} alertCount={alertCount} />
      {genCatsWithStock.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-32 text-center space-y-4">
          <div className="w-20 h-20 rounded-3xl bg-emerald-50 flex items-center justify-center">
            <Boxes className="w-10 h-10 text-emerald-200" />
          </div>
          <div>
            <p className="text-stone-500 font-black uppercase text-[11px] tracking-widest">Aucun article validé en stock</p>
            <p className="text-stone-300 text-[9px] font-bold mt-2">
              Onglet <strong className="text-stone-500">Arrivages</strong> → <strong className="text-stone-500">"Valider l'Entrée en Stock + Coût de Revient"</strong>
            </p>
          </div>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4">
          {genCatsWithStock.map((gc, idx) => {
            const lineColor = LINE_COLORS[(gc as any).line] || UI_COLORS[idx % UI_COLORS.length];
            const gcSubs    = categories.filter(c => c.generalCategoryId === gc.id);
            const gcItems   = stockItems.filter(i => gcSubs.some(s => s.name === i.categoryId || s.id === i.categoryId));
            const gcQty     = gcItems.reduce((s, i) => s + i.currentQty, 0);
            const gcVal     = gcItems.reduce((s, i) => s + Math.round(i.currentQty * (i.purchasePricePerUnit || 0)), 0);
            const gcAlerts  = gcItems.filter(i => i.minThreshold != null && i.currentQty <= i.minThreshold).length;
            const subCount  = gcSubs.filter(s => (stockByCategory[s.name]?.length || 0) > 0).length;
            return (
              <Card key={gc.id} onClick={() => setSelGenCat(gc.id)}
                className="group cursor-pointer border-none shadow-md hover:shadow-xl transition-all duration-300 rounded-[1.2rem] overflow-hidden active:scale-95">
                <div className="h-1 w-full" style={{ backgroundColor: lineColor }} />
                <CardContent className="p-4 space-y-3">
                  <div className="flex items-start justify-between">
                    <div className="p-2 rounded-lg" style={{ backgroundColor: `${lineColor}15`, color: lineColor }}>
                      <Layers className="w-3.5 h-3.5" />
                    </div>
                    {gcAlerts > 0 && (
                      <span className="text-[7px] font-black bg-amber-100 text-amber-700 px-1.5 py-0.5 rounded-full uppercase flex items-center gap-0.5">
                        <AlertTriangle className="w-2.5 h-2.5" /> {gcAlerts}
                      </span>
                    )}
                  </div>
                  <div>
                    <h3 className="text-[12px] font-black text-stone-800 uppercase tracking-tighter line-clamp-2 min-h-[2rem]">{gc.name}</h3>
                    <p className="text-[8px] text-stone-400 font-bold mt-0.5">{subCount} famille{subCount !== 1 ? 's' : ''} · {gcItems.length} ref.</p>
                  </div>
                  <div className="space-y-1 pt-2 border-t border-stone-50">
                    <div className="flex justify-between text-[8px]">
                      <span className="text-stone-400 font-black uppercase">Stock</span>
                      <span className="font-black text-stone-800">{fmt(gcQty)}</span>
                    </div>
                    <div className="flex justify-between text-[8px]">
                      <span className="text-stone-400 font-black uppercase">Valeur MAD</span>
                      <span className="font-black" style={{ color: lineColor }}>{gcVal > 0 ? `${fmt(gcVal)} MAD` : '—'}</span>
                    </div>
                  </div>
                  <div className="flex justify-end">
                    <div className="p-1.5 bg-stone-50 rounded-lg group-hover:bg-stone-900 transition-colors">
                      <ArrowRight className="w-3 h-3 text-stone-400 group-hover:text-white transition-colors" />
                    </div>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
