"use client";

import React, { useState, useMemo } from 'react';
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
  article, variants, movements, factures, onBack, color, inline = false
}: {
  article: any; variants: any[]; movements: any[]; factures: any[]; onBack: () => void; color: string; inline?: boolean;
}) {
  const cost = article.purchasePricePerUnit || 0;

  const artMovs = useMemo(() =>
    movements.filter(m => variants.some(v => m.articleId === v.articleId))
      .sort((a, b) => (a.date || '').localeCompare(b.date || '')),
    [movements, variants]
  );

  const entriesIN  = artMovs.filter(m => m.type === 'IN');
  const entriesOUT = artMovs.filter(m => m.type === 'OUT');
  const fifoBatches = useMemo(() => computeFIFO(entriesIN, entriesOUT, cost), [entriesIN, entriesOUT, cost]);

  const totalIn  = variants.reduce((s, v) => s + v.initialQty + v.mouvementsIn, 0);
  const totalOut = variants.reduce((s, v) => s + v.mouvementsOut, 0);
  const currentQty = variants.reduce((s, v) => s + v.currentQty, 0);
  const initialQty = variants.reduce((s, v) => s + v.initialQty, 0);
  const fifoValue = fifoBatches.reduce((s, b) => s + b.batchValue, 0);
  const isAlert   = variants.some(v => v.minThreshold != null && v.currentQty <= v.minThreshold);
  const pct       = totalIn > 0 ? Math.min(100, Math.round((currentQty / totalIn) * 100)) : 100;

  // Stock cumulatif pour le tableau mouvements
  let running = initialQty;

  return (
    <div className="space-y-5">
      {/* Breadcrumb — caché en mode inline */}
      {!inline && (
        <div className="flex items-center gap-2">
          <button onClick={onBack} className="flex items-center gap-1.5 text-[9px] font-black text-stone-500 hover:text-stone-900 uppercase tracking-widest transition-colors">
            <ChevronLeft className="w-3.5 h-3.5" /> Retour
          </button>
          <span className="text-stone-200">/</span>
          <span className="text-[9px] font-black uppercase tracking-widest" style={{ color }}>{article.productName}</span>
        </div>
      )}

      {/* ── En-tête produit ── */}
      <div className="bg-white rounded-3xl border border-stone-100 shadow-sm overflow-hidden">
        <div className="h-2 w-full" style={{ background: `linear-gradient(90deg, ${color}, ${color}88)` }} />
        <div className="p-6 flex flex-col sm:flex-row sm:items-center gap-6">
          {/* Infos */}
          <div className="flex-1">
            <p className="text-[8px] font-black text-stone-400 uppercase tracking-widest">{article.categoryId}</p>
            <h3 className="text-2xl font-black text-stone-900 uppercase tracking-tighter mt-0.5">{article.productName}</h3>
            <div className="flex items-center gap-2 mt-2 flex-wrap">
              {article.size  && <span className="text-[8px] font-black bg-stone-100 text-stone-500 px-2 py-0.5 rounded uppercase">{article.size}</span>}
              {article.color && <span className="text-[8px] font-black bg-stone-100 text-stone-500 px-2 py-0.5 rounded uppercase">{article.color}</span>}
              {article.unitOfMeasure && <span className="text-[8px] font-bold text-stone-300">{article.unitOfMeasure}</span>}
            </div>
          </div>

          {/* KPIs produit */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {[
              { label: 'Entrées', value: `+${fmt(totalIn)}`, sub: article.unitOfMeasure, cls: 'text-emerald-600' },
              { label: 'Sorties', value: totalOut > 0 ? `-${fmt(totalOut)}` : '—', sub: totalOut > 0 ? article.unitOfMeasure : '', cls: totalOut > 0 ? 'text-rose-600' : 'text-stone-300' },
              { label: 'Stock Réel', value: fmt(currentQty), sub: isAlert ? '⚠ Alerte' : 'OK', cls: isAlert ? 'text-amber-600' : 'text-stone-900' },
              { label: 'Valeur FIFO', value: fifoValue > 0 ? `${fmt(fifoValue)} MAD` : '—', sub: cost > 0 ? `${fmtDec(cost)} MAD/u` : '', cls: 'text-violet-700' },
            ].map(({ label, value, sub, cls }) => (
              <div key={label} className="bg-stone-50 rounded-2xl px-4 py-3 text-center">
                <p className="text-[7px] font-black text-stone-400 uppercase tracking-widest">{label}</p>
                <p className={`text-[15px] font-black ${cls} leading-tight mt-0.5`}>{value}</p>
                {sub && <p className="text-[7px] font-bold text-stone-300 mt-0.5">{sub}</p>}
              </div>
            ))}
          </div>
        </div>

        {/* Barre de stock */}
        <div className="px-6 pb-5">
          <div className="flex items-center justify-between mb-1.5">
            <p className="text-[7px] font-black text-stone-400 uppercase tracking-widest">
              Niveau de stock — {pct}% restant{article.minThreshold != null ? ` · Seuil mini : ${fmt(article.minThreshold)} ${article.unitOfMeasure}` : ''}
            </p>
          </div>
          <div className="h-2 bg-stone-100 rounded-full overflow-hidden">
            <div
              className="h-full rounded-full transition-all"
              style={{
                width: `${pct}%`,
                backgroundColor: pct < 25 ? '#ef4444' : pct < 50 ? '#f59e0b' : pct < 75 ? '#3b82f6' : '#10b981'
              }}
            />
          </div>
        </div>
      </div>

      {/* ── Détail des variantes (si plusieurs) ── */}
      {(() => {
        const groupedVariantsDetails = Array.from(
          variants.reduce((map, v) => {
            const key = `${v.color || ''}|${v.size || ''}`.toLowerCase();
            if (!map.has(key)) {
              map.set(key, { ...v, currentQty: 0 });
            }
            map.get(key).currentQty += v.currentQty;
            return map;
          }, new Map<string, any>()).values()
        ).sort((a: any, b: any) => b.currentQty - a.currentQty);

        if (groupedVariantsDetails.length <= 1) return null;

        const totalVarQty = groupedVariantsDetails.reduce((s: number, v: any) => s + v.currentQty, 0);

        return (
          <div className="bg-white rounded-2xl border border-stone-100 shadow-sm overflow-hidden">
            <div className="px-6 py-4 border-b border-stone-100 bg-gradient-to-r from-stone-50 to-white flex items-center gap-2">
              <div className="w-5 h-5 rounded-lg bg-stone-100 flex items-center justify-center">
                <Package className="w-3 h-3 text-stone-600" />
              </div>
              <h4 className="text-[9px] font-black text-stone-700 uppercase tracking-widest">Détail des Variantes</h4>
              <span className="ml-auto text-[8px] font-black text-stone-500 bg-stone-100 px-2 py-0.5 rounded-full uppercase">{groupedVariantsDetails.length} variantes</span>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-[11px]">
                <thead>
                  <tr className="bg-stone-50 border-b border-stone-100">
                    <th className="px-5 py-3 text-left text-[7px] font-black text-stone-400 uppercase tracking-widest">Couleur</th>
                    <th className="px-5 py-3 text-left text-[7px] font-black text-stone-400 uppercase tracking-widest">Taille</th>
                    <th className="px-5 py-3 text-right text-[7px] font-black text-stone-400 uppercase tracking-widest">Stock Réel</th>
                    <th className="px-5 py-3 text-right text-[7px] font-black text-stone-400 uppercase tracking-widest">Statut</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-stone-50">
                  {groupedVariantsDetails.map((v: any, i: number) => {
                    const isRupt = v.currentQty === 0;
                    const isAlerte = v.minThreshold != null && v.currentQty <= v.minThreshold;
                    return (
                      <tr key={i} className="hover:bg-stone-50/50 transition-colors">
                        <td className="px-5 py-3.5">
                          {v.color ? <span className="text-[9px] font-black bg-stone-100 text-stone-600 px-2 py-1 rounded uppercase">{v.color}</span> : <span className="text-stone-300">—</span>}
                        </td>
                        <td className="px-5 py-3.5">
                          {v.size ? <span className="text-[9px] font-black bg-stone-100 text-stone-600 px-2 py-1 rounded uppercase">{v.size}</span> : <span className="text-stone-300">—</span>}
                        </td>
                        <td className="px-5 py-3.5 text-right font-black text-[13px] text-stone-700">
                          {fmt(v.currentQty)} <span className="text-[8px] text-stone-400">{v.unitOfMeasure}</span>
                        </td>
                        <td className="px-5 py-3.5 text-right">
                          {isRupt ? (
                            <span className="text-[8px] font-black text-red-600 bg-red-50 px-2 py-1 rounded-full uppercase">Rupture</span>
                          ) : isAlerte ? (
                            <span className="text-[8px] font-black text-amber-600 bg-amber-50 px-2 py-1 rounded-full uppercase">Alerte</span>
                          ) : (
                            <span className="text-[8px] font-black text-emerald-600 bg-emerald-50 px-2 py-1 rounded-full uppercase">OK</span>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
                <tfoot>
                  <tr className="bg-stone-900 text-white border-t-2 border-stone-700">
                    <td colSpan={2} className="px-5 py-3 text-[8px] font-black text-stone-400 uppercase tracking-widest">Total Variantes</td>
                    <td className="px-5 py-3 text-right font-black text-emerald-400 text-[14px]">{fmt(totalVarQty)}</td>
                    <td></td>
                  </tr>
                </tfoot>
              </table>
            </div>
          </div>
        );
      })()}

      {/* ── Lots FIFO ── */}
      {fifoBatches.length > 0 && (
        <div className="bg-white rounded-2xl border border-stone-100 shadow-sm overflow-hidden">
          <div className="px-6 py-4 border-b border-stone-100 bg-gradient-to-r from-violet-50 to-white flex items-center gap-2">
            <div className="w-5 h-5 rounded-lg bg-violet-100 flex items-center justify-center">
              <Hash className="w-3 h-3 text-violet-600" />
            </div>
            <h4 className="text-[9px] font-black text-stone-700 uppercase tracking-widest">Lots d'achat — Méthode FIFO</h4>
            <span className="ml-auto text-[8px] font-black text-violet-600 bg-violet-100 px-2 py-0.5 rounded-full uppercase">{fifoBatches.length} lot{fifoBatches.length > 1 ? 's' : ''}</span>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-[11px]">
              <thead>
                <tr className="bg-stone-50 border-b border-stone-100">
                  {['#','Date Arrivage','Réf. Dossier','Qté Reçue','Consommée (FIFO)','Restante','Coût MAD/u','Valeur Restante MAD','Statut'].map(h => (
                    <th key={h} className={`px-5 py-3 text-[7px] font-black text-stone-400 uppercase tracking-widest whitespace-nowrap ${h === '#' ? 'text-center' : 'text-left'}`}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-stone-50">
                {fifoBatches.map((b, i) => (
                  <tr key={i} className={`hover:bg-stone-50/50 transition-colors ${
                    b.status === 'ÉPUISÉ' ? 'opacity-50' : ''
                  }`}>
                    <td className="px-5 py-3.5 text-center text-[8px] font-black text-stone-300">{i + 1}</td>
                    <td className="px-5 py-3.5">
                      <div className="flex items-center gap-2">
                        <Calendar className="w-3 h-3 text-stone-300 shrink-0" />
                        <span className="font-bold text-stone-700">{b.date}</span>
                      </div>
                    </td>
                    <td className="px-5 py-3.5 font-bold text-stone-500">{b.factureId}</td>
                    <td className="px-5 py-3.5 font-black text-emerald-700">+{fmt(b.qtyIn)}</td>
                    <td className="px-5 py-3.5 font-black text-rose-600">
                      {b.consumed > 0 ? `-${fmt(b.consumed)}` : <span className="text-stone-200">—</span>}
                    </td>
                    <td className="px-5 py-3.5">
                      <span className={`text-[12px] font-black ${b.remaining === 0 ? 'text-stone-300' : 'text-stone-900'}`}>
                        {fmt(b.remaining)}
                      </span>
                    </td>
                    <td className="px-5 py-3.5 font-black text-violet-700">
                      {b.costPerUnit > 0 ? `${fmtDec(b.costPerUnit)} MAD` : <span className="text-stone-200">—</span>}
                    </td>
                    <td className="px-5 py-3.5 font-black text-stone-800">
                      {b.batchValue > 0 ? `${fmt(b.batchValue)} MAD` : <span className="text-stone-200">—</span>}
                    </td>
                    <td className="px-5 py-3.5">
                      <span className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[7px] font-black uppercase ${
                        b.status === 'ÉPUISÉ'    ? 'bg-stone-100 text-stone-400' :
                        b.status === 'PARTIEL'   ? 'bg-amber-100 text-amber-700' :
                                                   'bg-emerald-100 text-emerald-700'
                      }`}>
                        {b.status === 'ÉPUISÉ'  ? <AlertTriangle className="w-2.5 h-2.5" /> :
                         b.status === 'PARTIEL' ? <AlertTriangle className="w-2.5 h-2.5" /> :
                                                  <CheckCircle2 className="w-2.5 h-2.5" />}
                        {b.status}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="bg-stone-900 text-white border-t-2 border-stone-700">
                  <td colSpan={3} className="px-5 py-3 text-[8px] font-black text-stone-400 uppercase tracking-widest">Totaux FIFO</td>
                  <td className="px-5 py-3 font-black text-emerald-400">+{fmt(fifoBatches.reduce((s,b)=>s+b.qtyIn,0))}</td>
                  <td className="px-5 py-3 font-black text-rose-400">-{fmt(fifoBatches.reduce((s,b)=>s+b.consumed,0))}</td>
                  <td className="px-5 py-3 font-black text-white text-[14px]">{fmt(fifoBatches.reduce((s,b)=>s+b.remaining,0))}</td>
                  <td className="px-5 py-3 font-black text-violet-300">{cost > 0 ? `${fmtDec(cost)} MAD` : '—'}</td>
                  <td className="px-5 py-3 font-black text-emerald-400">{fmt(fifoValue)} MAD</td>
                  <td className="px-5 py-3"></td>
                </tr>
              </tfoot>
            </table>
          </div>
        </div>
      )}

      {/* ── Tableau des mouvements ── */}
      <div className="bg-white rounded-2xl border border-stone-100 shadow-sm overflow-hidden">
        <div className="px-6 py-4 border-b border-stone-100 bg-gradient-to-r from-stone-50 to-white flex items-center gap-2">
          <div className="w-5 h-5 rounded-lg bg-stone-100 flex items-center justify-center">
            <TrendingUp className="w-3 h-3 text-stone-600" />
          </div>
          <h4 className="text-[9px] font-black text-stone-700 uppercase tracking-widest">Historique des Mouvements</h4>
          <span className="ml-auto text-[8px] font-black text-stone-500 bg-stone-100 px-2 py-0.5 rounded-full uppercase">{artMovs.length} ligne{artMovs.length > 1 ? 's' : ''}</span>
        </div>

        {artMovs.length === 0 ? (
          <div className="px-6 py-16 text-center">
            <Info className="w-8 h-8 text-stone-200 mx-auto mb-3" />
            <p className="text-stone-300 font-black uppercase text-[9px] tracking-widest">Aucun mouvement enregistré</p>
            <p className="text-stone-200 text-[8px] font-bold mt-1">Validez un arrivage depuis l'onglet Arrivages</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-[11px]">
              <thead>
                <tr className="border-b border-stone-100">
                  <th className="px-5 py-3 text-left text-[7px] font-black text-stone-400 uppercase tracking-widest bg-stone-50">Date</th>
                  <th className="px-5 py-3 text-left text-[7px] font-black text-stone-400 uppercase tracking-widest bg-stone-50">Type</th>
                  <th className="px-5 py-3 text-left text-[7px] font-black text-stone-400 uppercase tracking-widest bg-stone-50">Raison</th>
                  <th className="px-5 py-3 text-right text-[7px] font-black text-stone-400 uppercase tracking-widest bg-stone-50">Entrée</th>
                  <th className="px-5 py-3 text-right text-[7px] font-black text-stone-400 uppercase tracking-widest bg-stone-50">Sortie</th>
                  <th className="px-5 py-3 text-right text-[7px] font-black text-stone-400 uppercase tracking-widest bg-stone-50">Stock Après</th>
                  <th className="px-5 py-3 text-right text-[7px] font-black text-stone-400 uppercase tracking-widest bg-stone-50">Coût MAD/u</th>
                  <th className="px-5 py-3 text-right text-[7px] font-black text-stone-400 uppercase tracking-widest bg-stone-50">Valeur MAD</th>
                  <th className="px-5 py-3 text-left text-[7px] font-black text-stone-400 uppercase tracking-widest bg-stone-50">Référence</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-stone-50">
                {artMovs.map((mv, i) => {
                  const isIN  = mv.type === 'IN';
                  const isOUT = mv.type === 'OUT';
                  const qty   = Number(mv.quantity) || 0;
                  if (isIN)  running += qty;
                  if (isOUT) running -= qty;
                  const cumul   = Math.max(0, running);
                  const mvCost  = (mv.purchasePriceMAD != null && mv.purchasePriceMAD > 0) ? mv.purchasePriceMAD : (isIN ? cost : 0);
                  const valeur  = mvCost > 0 ? Math.round(cumul * mvCost) : 0;
                  const facture = factures.find((f: any) => f.id === mv.factureId);

                  return (
                    <tr key={i} className={`transition-colors hover:bg-stone-50/60 ${
                      isIN  ? 'border-l-[3px] border-l-emerald-400 bg-emerald-50/20' :
                      isOUT ? 'border-l-[3px] border-l-rose-400 bg-rose-50/20' :
                              'border-l-[3px] border-l-amber-400 bg-amber-50/20'
                    }`}>
                      <td className="px-5 py-3.5 font-bold text-stone-700 whitespace-nowrap">{mv.date || '—'}</td>
                      <td className="px-5 py-3.5">
                        <span className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[7px] font-black uppercase ${
                          isIN  ? 'bg-emerald-100 text-emerald-800' :
                          isOUT ? 'bg-rose-100 text-rose-800' :
                                  'bg-amber-100 text-amber-800'
                        }`}>
                          {isIN  ? <ArrowDownToLine className="w-2.5 h-2.5" /> :
                           isOUT ? <ArrowUpFromLine className="w-2.5 h-2.5" /> : null}
                          {mv.type}
                        </span>
                      </td>
                      <td className="px-5 py-3.5 text-stone-500 font-bold">{mv.reason || '—'}</td>
                      <td className="px-5 py-3.5 text-right">
                        {isIN
                          ? <span className="font-black text-emerald-700">+{fmt(qty)}</span>
                          : <span className="text-stone-200">—</span>}
                      </td>
                      <td className="px-5 py-3.5 text-right">
                        {isOUT
                          ? <span className="font-black text-rose-600">-{fmt(qty)}</span>
                          : <span className="text-stone-200">—</span>}
                      </td>
                      <td className="px-5 py-3.5 text-right font-black text-stone-900">{fmt(cumul)}</td>
                      <td className="px-5 py-3.5 text-right">
                        {mvCost > 0
                          ? <span className="font-black text-violet-700">{fmtDec(mvCost)}</span>
                          : <span className="text-stone-200">—</span>}
                      </td>
                      <td className="px-5 py-3.5 text-right">
                        {valeur > 0
                          ? <span className="font-black text-stone-800">{fmt(valeur)}</span>
                          : <span className="text-stone-200">—</span>}
                      </td>
                      <td className="px-5 py-3.5 text-stone-400 font-bold text-[9px]">
                        {facture?.id || mv.factureId || mv.notes || '—'}
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
        )}
      </div>
    </div>
  );
}

// ── Tableau niveau 3 : produits d'une sous-catégorie ─────────────────────────
function ProductsTable({
  items, subCatName, movements, factures, onBack
}: {
  items: any[]; subCatName: string; movements: any[]; factures: any[];
  onBack: () => void;
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
        />
      </div>
    );
  }

  return (
    <div className="space-y-4 animate-in fade-in duration-200">
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
  stockItems, movements, categories, generalCategories, factures
}: {
  stockItems: any[]; movements: any[]; categories: any[];
  generalCategories: any[]; factures: any[];
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
        <StockHeader totalRefs={totalRefs} totalStock={totalStock} totalVal={totalVal} alertCount={alertCount} />
        <ProductsTable
          items={items} subCatName={subCat?.name || selSubCat}
          movements={movements} factures={factures}
          onBack={() => setSelSubCat(null)}
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
