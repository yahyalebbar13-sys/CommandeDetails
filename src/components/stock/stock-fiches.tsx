"use client";

import React, { useState, useMemo } from 'react';
import {
  Package, ArrowDownToLine, ArrowUpFromLine, ChevronDown, ChevronUp,
  Boxes, TrendingUp, AlertTriangle, CheckCircle2, BarChart3, DollarSign
} from 'lucide-react';

// ── Helpers ──────────────────────────────────────────────────────────────────
const UI_COLORS = ['#CC8626','#1E293B','#3B82F6','#10B981','#6366F1','#F43F5E','#8B5CF6','#EC4899'];

function fmt(n: number) { return Math.round(n).toLocaleString('fr-MA'); }
function fmtDec(n: number) { return Number(n).toLocaleString('fr-MA', { minimumFractionDigits: 2, maximumFractionDigits: 2 }); }

function StockBar({ pct }: { pct: number }) {
  const color = pct < 25 ? 'bg-red-500' : pct < 50 ? 'bg-amber-400' : pct < 75 ? 'bg-blue-400' : 'bg-emerald-500';
  return (
    <div className="flex items-center gap-2">
      <div className="h-1.5 bg-stone-100 rounded-full overflow-hidden flex-1 min-w-[60px]">
        <div className={`h-full rounded-full transition-all ${color}`} style={{ width: `${pct}%` }} />
      </div>
      <span className={`text-[8px] font-black w-7 text-right ${pct < 25 ? 'text-red-600' : pct < 50 ? 'text-amber-600' : 'text-stone-500'}`}>
        {pct}%
      </span>
    </div>
  );
}

function StockBadge({ pct, qty, seuil }: { pct: number; qty: number; seuil?: number }) {
  if (qty === 0) return (
    <span className="inline-flex items-center gap-1 bg-red-100 text-red-700 text-[7px] font-black uppercase px-1.5 py-0.5 rounded-full">
      <AlertTriangle className="w-2.5 h-2.5" /> Rupture
    </span>
  );
  if (seuil && qty <= seuil) return (
    <span className="inline-flex items-center gap-1 bg-amber-100 text-amber-700 text-[7px] font-black uppercase px-1.5 py-0.5 rounded-full">
      <AlertTriangle className="w-2.5 h-2.5" /> Alerte
    </span>
  );
  return (
    <span className="inline-flex items-center gap-1 bg-emerald-100 text-emerald-700 text-[7px] font-black uppercase px-1.5 py-0.5 rounded-full">
      <CheckCircle2 className="w-2.5 h-2.5" /> OK
    </span>
  );
}

// ── Détail mouvements (sous-tableau) ─────────────────────────────────────────
function MovementsTable({ article, movements, factures }: { article: any; movements: any[]; factures: any[] }) {
  const artMovs = useMemo(() =>
    movements
      .filter(m => m.articleId === article.articleId)
      .sort((a, b) => (a.date || '').localeCompare(b.date || '')),
    [movements, article.articleId]
  );

  const coutRevient = article.purchasePricePerUnit || 0;

  // Calcul du stock cumulatif ligne par ligne
  let running = article.initialQty;

  if (artMovs.length === 0) return (
    <tr>
      <td colSpan={9} className="px-6 py-5 text-center text-stone-300 text-[9px] font-black uppercase tracking-widest bg-stone-50/50">
        Aucun mouvement — validez un arrivage pour enregistrer les entrées
      </td>
    </tr>
  );

  return (
    <>
      {/* Sous-header mouvements */}
      <tr className="bg-stone-800">
        <td colSpan={9} className="px-6 py-2">
          <span className="text-[7px] font-black text-stone-300 uppercase tracking-[0.2em]">
            Historique des mouvements — {artMovs.length} ligne(s)
          </span>
        </td>
      </tr>
      <tr className="bg-stone-700 text-white">
        <td className="px-6 py-2 text-[7px] font-black uppercase tracking-widest text-stone-400">Date</td>
        <td className="px-4 py-2 text-[7px] font-black uppercase tracking-widest text-stone-400">Type</td>
        <td className="px-4 py-2 text-[7px] font-black uppercase tracking-widest text-stone-400">Raison</td>
        <td className="px-4 py-2 text-[7px] font-black uppercase tracking-widest text-stone-400 text-right">Entrée</td>
        <td className="px-4 py-2 text-[7px] font-black uppercase tracking-widest text-stone-400 text-right">Sortie</td>
        <td className="px-4 py-2 text-[7px] font-black uppercase tracking-widest text-stone-400 text-right">Stock Cumul</td>
        <td className="px-4 py-2 text-[7px] font-black uppercase tracking-widest text-stone-400 text-right">Coût Rev. MAD/u</td>
        <td className="px-4 py-2 text-[7px] font-black uppercase tracking-widest text-stone-400 text-right">Valeur MAD</td>
        <td className="px-6 py-2 text-[7px] font-black uppercase tracking-widest text-stone-400">Réf. Dossier</td>
      </tr>
      {artMovs.map((mv, i) => {
        const isIN  = mv.type === 'IN';
        const isOUT = mv.type === 'OUT';
        const qty   = Number(mv.quantity) || 0;
        if (isIN)  running += qty;
        if (isOUT) running -= qty;
        const stockCumul = Math.max(0, running);
        // Coût de revient : depuis le mouvement en priorité, sinon depuis l'article
        const cost = (mv.purchasePriceMAD != null && mv.purchasePriceMAD > 0)
          ? mv.purchasePriceMAD
          : (isIN ? coutRevient : 0);
        const facture = factures.find((f: any) => f.id === mv.factureId);

        return (
          <tr key={i} className={`border-b border-stone-100 hover:bg-stone-50/50 transition-colors text-[10px] ${
            isIN  ? 'bg-emerald-50/30 border-l-2 border-l-emerald-400' :
            isOUT ? 'bg-rose-50/30 border-l-2 border-l-rose-400' :
                    'bg-amber-50/30 border-l-2 border-l-amber-300'
          }`}>
            <td className="px-6 py-2.5 font-bold text-stone-700 whitespace-nowrap">{mv.date || '—'}</td>
            <td className="px-4 py-2.5">
              <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-[7px] font-black uppercase ${
                isIN  ? 'bg-emerald-100 text-emerald-800' :
                isOUT ? 'bg-rose-100 text-rose-800' :
                        'bg-amber-100 text-amber-800'
              }`}>
                {isIN  ? <ArrowDownToLine className="w-2.5 h-2.5" /> :
                 isOUT ? <ArrowUpFromLine className="w-2.5 h-2.5" /> : null}
                {mv.type}
              </span>
            </td>
            <td className="px-4 py-2.5 text-stone-500 font-bold">{mv.reason || '—'}</td>
            <td className="px-4 py-2.5 text-right font-black text-emerald-700">
              {isIN ? `+${fmt(qty)}` : <span className="text-stone-200">—</span>}
            </td>
            <td className="px-4 py-2.5 text-right font-black text-rose-600">
              {isOUT ? `-${fmt(qty)}` : <span className="text-stone-200">—</span>}
            </td>
            <td className="px-4 py-2.5 text-right font-black text-stone-900">{fmt(stockCumul)}</td>
            <td className="px-4 py-2.5 text-right font-black text-violet-700">
              {cost > 0 ? `${fmtDec(cost)} MAD` : <span className="text-stone-200">—</span>}
            </td>
            <td className="px-4 py-2.5 text-right font-black text-stone-700">
              {cost > 0 ? `${fmt(Math.round(stockCumul * cost))} MAD` : <span className="text-stone-200">—</span>}
            </td>
            <td className="px-6 py-2.5 text-stone-400 font-bold text-[9px]">
              {facture?.id || mv.factureId || mv.notes || '—'}
            </td>
          </tr>
        );
      })}
      {/* Ligne totaux du produit */}
      <tr className="bg-stone-900 text-white text-[9px]">
        <td colSpan={3} className="px-6 py-2.5 font-black uppercase tracking-widest text-stone-400">Totaux produit</td>
        <td className="px-4 py-2.5 text-right font-black text-emerald-400">
          +{fmt(article.initialQty + article.mouvementsIn)}
        </td>
        <td className="px-4 py-2.5 text-right font-black text-rose-400">
          {article.mouvementsOut > 0 ? `-${fmt(article.mouvementsOut)}` : '—'}
        </td>
        <td className="px-4 py-2.5 text-right font-black text-white">{fmt(article.currentQty)}</td>
        <td className="px-4 py-2.5 text-right font-black text-violet-300">
          {coutRevient > 0 ? `${fmtDec(coutRevient)} MAD` : '—'}
        </td>
        <td className="px-4 py-2.5 text-right font-black text-emerald-400">
          {coutRevient > 0 ? `${fmt(Math.round(article.currentQty * coutRevient))} MAD` : '—'}
        </td>
        <td className="px-6 py-2.5 text-stone-500 font-bold">—</td>
      </tr>
    </>
  );
}

// ── Ligne de tableau principal ────────────────────────────────────────────────
function StockRow({ article: a, color, movements, factures, idx }: {
  article: any; color: string; movements: any[]; factures: any[]; idx: number;
}) {
  const [expanded, setExpanded] = useState(false);

  const coutRevient = a.purchasePricePerUnit || 0;
  const totalIn     = a.initialQty + a.mouvementsIn;
  const totalOut    = a.mouvementsOut;
  const pct         = totalIn > 0 ? Math.min(100, Math.round((a.currentQty / totalIn) * 100)) : 100;
  const valeur      = Math.round(a.currentQty * coutRevient);
  const seuil       = a.minThreshold;

  return (
    <>
      <tr
        onClick={() => setExpanded(e => !e)}
        className={`border-b border-stone-100 cursor-pointer transition-all hover:bg-stone-50 ${expanded ? 'bg-stone-50 border-l-4' : 'border-l-4'}`}
        style={{ borderLeftColor: color }}
      >
        {/* # */}
        <td className="px-4 py-3 text-center">
          <span className="text-[8px] font-black text-stone-400">{idx + 1}</span>
        </td>
        {/* Produit */}
        <td className="px-4 py-3">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg shrink-0" style={{ backgroundColor: color, opacity: 0.15 }} />
            <div className="-ml-7 w-8 h-8 rounded-lg shrink-0 flex items-center justify-center border border-stone-100"
              style={{ backgroundColor: `${color}22` }}>
              <Package className="w-3.5 h-3.5" style={{ color }} />
            </div>
            <div>
              <p className="text-[11px] font-black text-stone-900 uppercase tracking-tight">{a.productName}</p>
              <div className="flex items-center gap-1 mt-0.5">
                {a.size  && <span className="text-[7px] bg-stone-100 text-stone-500 px-1.5 py-0.5 rounded font-bold uppercase">{a.size}</span>}
                {a.color && <span className="text-[7px] bg-stone-100 text-stone-500 px-1.5 py-0.5 rounded font-bold uppercase">{a.color}</span>}
              </div>
            </div>
          </div>
        </td>
        {/* Unité */}
        <td className="px-4 py-3 text-center text-[9px] font-bold text-stone-400">{a.unitOfMeasure}</td>
        {/* Entrées */}
        <td className="px-4 py-3 text-right">
          <span className="text-[11px] font-black text-emerald-600">+{fmt(totalIn)}</span>
        </td>
        {/* Sorties */}
        <td className="px-4 py-3 text-right">
          <span className={`text-[11px] font-black ${totalOut > 0 ? 'text-rose-600' : 'text-stone-300'}`}>
            {totalOut > 0 ? `-${fmt(totalOut)}` : '—'}
          </span>
        </td>
        {/* Stock Réel */}
        <td className="px-4 py-3 min-w-[130px]">
          <div className="space-y-1">
            <div className="flex items-baseline justify-between">
              <span className="text-[14px] font-black text-stone-900">{fmt(a.currentQty)}</span>
              <StockBadge pct={pct} qty={a.currentQty} seuil={seuil} />
            </div>
            <StockBar pct={pct} />
          </div>
        </td>
        {/* Seuil */}
        <td className="px-4 py-3 text-center">
          {seuil != null ? (
            <div className="text-center">
              <span className={`text-[11px] font-black ${a.currentQty <= seuil ? 'text-red-600' : 'text-stone-500'}`}>
                {fmt(seuil)}
              </span>
              {a.currentQty <= seuil && (
                <p className="text-[7px] text-red-500 font-black uppercase">⚠ Critique</p>
              )}
            </div>
          ) : <span className="text-stone-200 text-[10px]">—</span>}
        </td>
        {/* Coût Revient */}
        <td className="px-4 py-3 text-right">
          {coutRevient > 0
            ? <span className="text-[10px] font-black text-violet-700">{fmtDec(coutRevient)} MAD</span>
            : <span className="text-stone-200 text-[10px]">—</span>}
        </td>
        {/* Valeur */}
        <td className="px-4 py-3 text-right">
          {coutRevient > 0 && a.currentQty > 0
            ? <span className="text-[11px] font-black text-stone-800">{fmt(valeur)} MAD</span>
            : <span className="text-stone-200 text-[10px]">—</span>}
        </td>
        {/* Expand */}
        <td className="px-4 py-3 text-center">
          <div className={`w-6 h-6 rounded-lg border flex items-center justify-center transition-all ${
            expanded ? 'bg-stone-900 border-stone-900' : 'border-stone-200'
          }`}>
            {expanded
              ? <ChevronUp className="w-3.5 h-3.5 text-white" />
              : <ChevronDown className="w-3.5 h-3.5 text-stone-400" />}
          </div>
        </td>
      </tr>

      {/* Sous-tableau mouvements */}
      {expanded && (
        <MovementsTable article={a} movements={movements} factures={factures} />
      )}
    </>
  );
}

// ── Vue principale ────────────────────────────────────────────────────────────
export default function StockFiches({
  stockItems, movements, categories, factures
}: {
  stockItems: any[]; movements: any[]; categories: any[]; factures: any[];
}) {
  const [selCat, setSelCat] = useState<string | null>(null);

  const grouped = useMemo(() => {
    const map: Record<string, any[]> = {};
    stockItems.forEach(item => {
      const cat = item.categoryId || 'Sans catégorie';
      if (!map[cat]) map[cat] = [];
      map[cat].push(item);
    });
    return map;
  }, [stockItems]);

  const catNames = Object.keys(grouped).sort();
  const activeCat = selCat || catNames[0] || null;
  const items = activeCat ? (grouped[activeCat] || []) : [];

  const totalRefs   = stockItems.length;
  const totalStock  = stockItems.reduce((s, i) => s + i.currentQty, 0);
  const totalVal    = stockItems.reduce((s, i) => s + Math.round(i.currentQty * (i.purchasePricePerUnit || 0)), 0);
  const alertCount  = stockItems.filter(i => i.minThreshold != null && i.currentQty <= i.minThreshold).length;
  const ruptureCount = stockItems.filter(i => i.currentQty === 0).length;

  if (stockItems.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-32 text-center space-y-4">
        <div className="w-20 h-20 rounded-3xl bg-emerald-50 flex items-center justify-center">
          <Boxes className="w-10 h-10 text-emerald-200" />
        </div>
        <div>
          <p className="text-stone-500 font-black uppercase text-[11px] tracking-widest">Aucun article validé en stock</p>
          <p className="text-stone-300 text-[9px] font-bold mt-2 max-w-sm">
            Onglet <strong className="text-stone-500">Arrivages</strong> → bouton <strong className="text-stone-500">"Valider l'Entrée en Stock + Coût de Revient"</strong>
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">

      {/* ── KPI Header ── */}
      <div className="bg-gradient-to-br from-stone-900 to-stone-800 rounded-3xl p-8 relative overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-r from-emerald-900/40 to-transparent pointer-events-none" />
        <div className="relative z-10">
          <div className="flex items-start justify-between flex-wrap gap-4 mb-6">
            <div>
              <p className="text-[8px] font-black text-emerald-400 uppercase tracking-[0.4em] mb-1">Gestion Stock Physique</p>
              <h2 className="text-3xl font-black text-white uppercase tracking-tighter leading-none">
                Fiches de Stock
              </h2>
              <p className="text-stone-400 text-xs mt-2">Entrées validées manuellement · coûts de revient réels</p>
            </div>
          </div>
          {/* KPI Cards */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <div className="bg-white/10 backdrop-blur-sm rounded-2xl p-4">
              <div className="flex items-center gap-2 mb-1">
                <BarChart3 className="w-3.5 h-3.5 text-emerald-400" />
                <p className="text-[7px] font-black text-stone-400 uppercase tracking-widest">Références</p>
              </div>
              <p className="text-2xl font-black text-white">{totalRefs}</p>
            </div>
            <div className="bg-white/10 backdrop-blur-sm rounded-2xl p-4">
              <div className="flex items-center gap-2 mb-1">
                <Boxes className="w-3.5 h-3.5 text-blue-400" />
                <p className="text-[7px] font-black text-stone-400 uppercase tracking-widest">Stock Total</p>
              </div>
              <p className="text-2xl font-black text-white">{fmt(totalStock)}</p>
            </div>
            <div className="bg-white/10 backdrop-blur-sm rounded-2xl p-4">
              <div className="flex items-center gap-2 mb-1">
                <DollarSign className="w-3.5 h-3.5 text-emerald-400" />
                <p className="text-[7px] font-black text-stone-400 uppercase tracking-widest">Valeur MAD</p>
              </div>
              <p className="text-2xl font-black text-emerald-400">{fmt(totalVal)}</p>
            </div>
            <div className="bg-white/10 backdrop-blur-sm rounded-2xl p-4">
              <div className="flex items-center gap-2 mb-1">
                <AlertTriangle className="w-3.5 h-3.5 text-amber-400" />
                <p className="text-[7px] font-black text-stone-400 uppercase tracking-widest">Alertes</p>
              </div>
              <p className="text-2xl font-black text-amber-400">{alertCount}</p>
              {ruptureCount > 0 && (
                <p className="text-[7px] font-black text-red-400 uppercase">{ruptureCount} rupture(s)</p>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* ── Filtre catégories ── */}
      {catNames.length > 1 && (
        <div className="bg-white rounded-2xl border border-stone-100 p-4">
          <div className="flex items-center gap-3 flex-wrap">
            <span className="text-[8px] font-black text-stone-400 uppercase tracking-widest shrink-0">Catégorie :</span>
            {catNames.map((cat, idx) => {
              const count = grouped[cat]?.length || 0;
              const color = UI_COLORS[idx % UI_COLORS.length];
              const isActive = cat === activeCat;
              return (
                <button key={cat} onClick={() => setSelCat(cat)}
                  className={`px-3.5 py-1.5 rounded-xl text-[9px] font-black uppercase tracking-wider transition-all border ${
                    isActive ? 'text-white border-transparent shadow-md' : 'text-stone-500 border-stone-200 bg-stone-50 hover:bg-stone-100'
                  }`}
                  style={isActive ? { backgroundColor: color } : {}}
                >
                  {cat} <span className="opacity-60">({count})</span>
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* ── Tableau principal ── */}
      <div className="bg-white rounded-2xl border border-stone-100 overflow-hidden shadow-sm">
        {/* En-tête catégorie */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-stone-100 bg-stone-50/50">
          <div className="flex items-center gap-2">
            <TrendingUp className="w-4 h-4 text-emerald-500" />
            <span className="text-[10px] font-black text-stone-700 uppercase tracking-wider">
              {activeCat} — {items.length} produit{items.length !== 1 ? 's' : ''}
            </span>
          </div>
          <div className="flex gap-4 text-[9px] font-bold text-stone-400">
            <span>Stock : <strong className="text-stone-700">{fmt(items.reduce((s,i)=>s+i.currentQty,0))}</strong></span>
            <span>Valeur : <strong className="text-emerald-700">{fmt(items.reduce((s,i)=>s+Math.round(i.currentQty*(i.purchasePricePerUnit||0)),0))} MAD</strong></span>
          </div>
        </div>

        {/* Tableau */}
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-stone-50 border-b border-stone-200">
                <th className="px-4 py-3 text-center w-10 text-[7px] font-black text-stone-400 uppercase tracking-widest">#</th>
                <th className="px-4 py-3 text-left text-[7px] font-black text-stone-400 uppercase tracking-widest">Produit</th>
                <th className="px-4 py-3 text-center text-[7px] font-black text-stone-400 uppercase tracking-widest">Unité</th>
                <th className="px-4 py-3 text-right text-[7px] font-black text-stone-400 uppercase tracking-widest">Entrées</th>
                <th className="px-4 py-3 text-right text-[7px] font-black text-stone-400 uppercase tracking-widest">Sorties</th>
                <th className="px-4 py-3 text-left text-[7px] font-black text-stone-400 uppercase tracking-widest min-w-[130px]">Stock Réel</th>
                <th className="px-4 py-3 text-center text-[7px] font-black text-stone-400 uppercase tracking-widest">Seuil Mini</th>
                <th className="px-4 py-3 text-right text-[7px] font-black text-stone-400 uppercase tracking-widest">Coût Rev. MAD/u</th>
                <th className="px-4 py-3 text-right text-[7px] font-black text-stone-400 uppercase tracking-widest">Valeur MAD</th>
                <th className="px-4 py-3 w-10"></th>
              </tr>
            </thead>
            <tbody>
              {items.length === 0 ? (
                <tr>
                  <td colSpan={10} className="px-6 py-16 text-center text-stone-300 text-[10px] font-black uppercase tracking-widest">
                    Aucun article dans cette catégorie
                  </td>
                </tr>
              ) : (
                items.map((item, idx) => (
                  <StockRow
                    key={item.articleId}
                    article={item}
                    color={UI_COLORS[idx % UI_COLORS.length]}
                    movements={movements}
                    factures={factures}
                    idx={idx}
                  />
                ))
              )}
            </tbody>
            {/* Pied de tableau */}
            {items.length > 0 && (
              <tfoot>
                <tr className="bg-stone-900 text-white border-t-2 border-stone-800">
                  <td colSpan={3} className="px-4 py-3 text-[8px] font-black uppercase tracking-widest text-stone-400">
                    TOTAL — {items.length} référence{items.length !== 1 ? 's' : ''}
                  </td>
                  <td className="px-4 py-3 text-right text-[11px] font-black text-emerald-400">
                    +{fmt(items.reduce((s,i)=>s+(i.initialQty+i.mouvementsIn),0))}
                  </td>
                  <td className="px-4 py-3 text-right text-[11px] font-black text-rose-400">
                    {items.reduce((s,i)=>s+i.mouvementsOut,0) > 0
                      ? `-${fmt(items.reduce((s,i)=>s+i.mouvementsOut,0))}`
                      : '—'}
                  </td>
                  <td className="px-4 py-3 text-left">
                    <span className="text-[14px] font-black text-white">
                      {fmt(items.reduce((s,i)=>s+i.currentQty,0))}
                    </span>
                  </td>
                  <td className="px-4 py-3"></td>
                  <td className="px-4 py-3"></td>
                  <td className="px-4 py-3 text-right text-[11px] font-black text-emerald-400">
                    {fmt(items.reduce((s,i)=>s+Math.round(i.currentQty*(i.purchasePricePerUnit||0)),0))} MAD
                  </td>
                  <td className="px-4 py-3"></td>
                </tr>
              </tfoot>
            )}
          </table>
        </div>
      </div>
    </div>
  );
}
