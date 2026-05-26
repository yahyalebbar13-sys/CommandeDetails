"use client";

import React, { useState, useMemo } from 'react';
import {
  Package, ArrowDownToLine, ArrowUpFromLine, ChevronDown,
  Boxes, TrendingUp, CheckCircle2, Anchor
} from 'lucide-react';

const UI_COLORS = ['#CC8626','#1E293B','#3B82F6','#10B981','#6366F1','#F43F5E','#8B5CF6','#EC4899'];

const COLOR_MAP: Record<string, string> = {
  rouge:'#ef4444', red:'#ef4444', bleu:'#3b82f6', blue:'#3b82f6',
  vert:'#22c55e', green:'#22c55e', noir:'#1c1917', black:'#1c1917',
  blanc:'#f5f5f4', white:'#f5f5f4', gris:'#6b7280', grey:'#6b7280',
  jaune:'#eab308', orange:'#f97316', violet:'#8b5cf6', rose:'#f43f5e',
  marron:'#92400e', beige:'#d6c5a3', kaki:'#6b7a42',
};
function getColorCSS(c?: string) {
  if (!c) return '#f5f5f4';
  return COLOR_MAP[c.toLowerCase()] || '#e7e5e4';
}
function fmt(n: number) {
  return Math.round(n).toLocaleString('fr-MA');
}
function fmtDec(n: number, d = 2) {
  return Number(n).toLocaleString('fr-MA', { minimumFractionDigits: d, maximumFractionDigits: d });
}

// ── Fiche complète par produit ───────────────────────────────────────────────
function FicheStock({
  article: a, color, movements, factures
}: {
  article: any; color: string; movements: any[]; factures: any[];
}) {
  const [open, setOpen] = useState(false);

  const artMovements = useMemo(() =>
    movements.filter(m => m.articleId === a.articleId)
      .sort((x, y) => (x.date || '').localeCompare(y.date || '')),
    [movements, a.articleId]
  );

  const totalIn  = a.initialQty + a.mouvementsIn;
  const totalOut = a.mouvementsOut;
  const pct = totalIn > 0 ? Math.min(100, Math.round((a.currentQty / totalIn) * 100)) : 100;
  const stockColor = pct < 30 ? '#ef4444' : pct < 60 ? '#f59e0b' : '#10b981';

  // Coût de revient = purchasePriceMAD directement depuis l'article (calculé dans StockVue)
  const coutRevient = a.purchasePricePerUnit || 0; // déjà = purchasePriceMAD dans computeStockItems
  const valeurStock = Math.round(a.currentQty * coutRevient);

  return (
    <div className="bg-white rounded-2xl overflow-hidden border border-stone-100 shadow-sm">

      {/* ── En-tête produit ── */}
      <button
        onClick={() => setOpen(o => !o)}
        className="w-full text-left hover:bg-stone-50/30 transition-colors"
      >
        <div className="h-1 w-full" style={{ backgroundColor: color }} />
        <div className="flex items-center gap-4 px-5 py-4">

          {/* Swatch */}
          <div
            className="w-10 h-10 rounded-xl border border-stone-100 shrink-0 flex items-center justify-center"
            style={{ backgroundColor: getColorCSS(a.color) }}
          >
            {!a.color && <Package className="w-4 h-4 text-stone-300" />}
          </div>

          {/* Nom + tags */}
          <div className="flex-1 min-w-0">
            <p className="text-[12px] font-black text-stone-900 uppercase tracking-tighter">{a.productName}</p>
            <div className="flex items-center gap-1.5 mt-0.5 flex-wrap">
              {a.size  && <span className="text-[7px] font-black bg-stone-100 text-stone-500 px-1.5 py-0.5 rounded uppercase">{a.size}</span>}
              {a.color && <span className="text-[7px] font-black bg-stone-100 text-stone-500 px-1.5 py-0.5 rounded uppercase">{a.color}</span>}
              {a.unitOfMeasure && <span className="text-[7px] font-bold text-stone-300">{a.unitOfMeasure}</span>}
            </div>
          </div>

          {/* Stats */}
          <div className="flex items-center gap-3 sm:gap-5 shrink-0">

            <div className="text-center hidden md:block">
              <p className="text-[7px] font-black text-stone-400 uppercase tracking-widest">Entrées</p>
              <p className="text-[15px] font-black text-emerald-600">+{fmt(totalIn)}</p>
            </div>

            <div className="text-center hidden md:block">
              <p className="text-[7px] font-black text-stone-400 uppercase tracking-widest">Sorties</p>
              <p className={`text-[15px] font-black ${totalOut > 0 ? 'text-rose-500' : 'text-stone-300'}`}>
                {totalOut > 0 ? `-${fmt(totalOut)}` : '—'}
              </p>
            </div>

            {/* Stock réel encadré */}
            <div className="bg-stone-50 rounded-xl px-4 py-2.5 text-center min-w-[88px]">
              <p className="text-[7px] font-black text-stone-400 uppercase tracking-widest">Stock Réel</p>
              <p className="text-[20px] font-black text-stone-900 leading-tight">{fmt(a.currentQty)}</p>
              <div className="h-1 bg-stone-200 rounded-full mt-1.5 overflow-hidden">
                <div className="h-full rounded-full transition-all" style={{ width: `${pct}%`, backgroundColor: stockColor }} />
              </div>
            </div>

            {/* Coût de revient MAD/u */}
            <div className="text-center hidden sm:block">
              <p className="text-[7px] font-black text-stone-400 uppercase tracking-widest">Coût Rev.</p>
              <p className="text-[11px] font-black text-violet-700">
                {coutRevient > 0 ? `${fmtDec(coutRevient)} MAD/u` : '—'}
              </p>
            </div>

            {/* Valeur totale */}
            <div className="text-center hidden sm:block">
              <p className="text-[7px] font-black text-stone-400 uppercase tracking-widest">Valeur</p>
              <p className="text-[11px] font-black" style={{ color }}>
                {coutRevient > 0 ? `${fmt(valeurStock)} MAD` : '—'}
              </p>
            </div>

            {/* Chevron */}
            <div className={`w-7 h-7 rounded-xl border flex items-center justify-center transition-all duration-300 ${
              open ? 'rotate-180 bg-stone-900 border-stone-900' : 'bg-white border-stone-200'
            }`}>
              <ChevronDown className={`w-4 h-4 ${open ? 'text-white' : 'text-stone-400'}`} />
            </div>
          </div>
        </div>
      </button>

      {/* ── Tableau complet des mouvements ── */}
      {open && (
        <div className="border-t border-stone-100">
          {artMovements.length === 0 ? (
            <div className="px-6 py-8 text-center text-stone-300 text-[10px] font-black uppercase tracking-widest">
              Aucun mouvement enregistré
            </div>
          ) : (
            <table className="w-full text-[10px]">
              <thead>
                <tr className="bg-stone-50 border-b border-stone-100">
                  <th className="px-5 py-2.5 text-left font-black text-stone-400 uppercase tracking-widest text-[7px]">Date</th>
                  <th className="px-4 py-2.5 text-left font-black text-stone-400 uppercase tracking-widest text-[7px]">Type</th>
                  <th className="px-4 py-2.5 text-left font-black text-stone-400 uppercase tracking-widest text-[7px]">Raison</th>
                  <th className="px-4 py-2.5 text-right font-black text-stone-400 uppercase tracking-widest text-[7px]">Entrée</th>
                  <th className="px-4 py-2.5 text-right font-black text-stone-400 uppercase tracking-widest text-[7px]">Sortie</th>
                  <th className="px-4 py-2.5 text-right font-black text-stone-400 uppercase tracking-widest text-[7px]">Coût Rev. MAD/u</th>
                  <th className="px-5 py-2.5 text-left font-black text-stone-400 uppercase tracking-widest text-[7px]">Réf. Arrivage</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-stone-50">
                {artMovements.map((mv, i) => {
                  const facture = factures.find((f: any) => f.id === mv.factureId);
                  const isIN  = mv.type === 'IN';
                  const isOUT = mv.type === 'OUT';
                  const hasCost = mv.purchasePriceMAD != null && mv.purchasePriceMAD > 0;
                  // Coût de revient : depuis le mouvement (si disponible) sinon depuis l'article
                  const costDisplay = hasCost
                    ? fmtDec(mv.purchasePriceMAD)
                    : (isIN && coutRevient > 0 ? fmtDec(coutRevient) : null);

                  return (
                    <tr key={i} className={`hover:bg-stone-50/50 transition-colors ${
                      isIN ? 'border-l-2 border-l-emerald-300' : isOUT ? 'border-l-2 border-l-rose-300' : 'border-l-2 border-l-amber-300'
                    }`}>
                      <td className="px-5 py-3 font-bold text-stone-700">{mv.date || '—'}</td>
                      <td className="px-4 py-3">
                        <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-[8px] font-black uppercase ${
                          isIN  ? 'bg-emerald-100 text-emerald-700' :
                          isOUT ? 'bg-rose-100 text-rose-700' :
                                  'bg-amber-100 text-amber-700'
                        }`}>
                          {isIN  ? <ArrowDownToLine className="w-2.5 h-2.5" /> :
                           isOUT ? <ArrowUpFromLine className="w-2.5 h-2.5" /> : null}
                          {mv.type}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-stone-500 font-bold">{mv.reason || '—'}</td>
                      <td className="px-4 py-3 text-right font-black text-emerald-700">
                        {isIN ? `+${fmt(mv.quantity)} ${a.unitOfMeasure}` : <span className="text-stone-200">—</span>}
                      </td>
                      <td className="px-4 py-3 text-right font-black text-rose-600">
                        {isOUT ? `-${fmt(mv.quantity)} ${a.unitOfMeasure}` : <span className="text-stone-200">—</span>}
                      </td>
                      <td className="px-4 py-3 text-right font-black text-violet-700">
                        {costDisplay ? `${costDisplay} MAD` : <span className="text-stone-200">—</span>}
                      </td>
                      <td className="px-5 py-3 text-stone-500 font-bold text-[9px]">
                        {facture?.id || mv.factureId || mv.notes || '—'}
                        {facture?.supplierId && (
                          <p className="text-[7px] text-stone-300">{facture.supplierId}</p>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
              {/* Pied de tableau — totaux */}
              <tfoot>
                <tr className="bg-stone-900 text-white">
                  <td colSpan={3} className="px-5 py-3 text-[8px] font-black uppercase tracking-widest">Totaux</td>
                  <td className="px-4 py-3 text-right font-black text-emerald-400">+{fmt(totalIn)} {a.unitOfMeasure}</td>
                  <td className="px-4 py-3 text-right font-black text-rose-400">{totalOut > 0 ? `-${fmt(totalOut)} ${a.unitOfMeasure}` : '—'}</td>
                  <td className="px-4 py-3 text-right font-black text-violet-300">
                    {coutRevient > 0 ? `${fmtDec(coutRevient)} MAD/u` : '—'}
                  </td>
                  <td className="px-5 py-3 text-right font-black text-emerald-400">
                    Stock : {fmt(a.currentQty)} — {coutRevient > 0 ? `${fmt(valeurStock)} MAD` : '—'}
                  </td>
                </tr>
              </tfoot>
            </table>
          )}
        </div>
      )}
    </div>
  );
}

// ── Vue principale ───────────────────────────────────────────────────────────
export default function StockFiches({
  stockItems, movements, categories, factures
}: {
  stockItems: any[]; movements: any[]; categories: any[]; factures: any[];
}) {
  const [selCat, setSelCat] = useState<string | null>(null);

  // Grouper par catégorie
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

  const totalRefs  = stockItems.length;
  const totalStock = stockItems.reduce((s, i) => s + i.currentQty, 0);
  const totalVal   = stockItems.reduce((s, i) => s + Math.round(i.currentQty * (i.purchasePricePerUnit || 0)), 0);

  if (stockItems.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-32 text-center space-y-4">
        <div className="w-16 h-16 rounded-2xl bg-emerald-50 flex items-center justify-center">
          <Boxes className="w-8 h-8 text-emerald-300" />
        </div>
        <div>
          <p className="text-stone-400 font-black uppercase text-[10px] tracking-widest">Aucun article validé en stock</p>
          <p className="text-stone-300 text-[9px] font-bold mt-1">
            Onglet <strong className="text-stone-400">Arrivages</strong> → <strong className="text-stone-400">"Enregistrer en Stock"</strong> pour valider un arrivage et son coût de revient
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">

      {/* ── Header ── */}
      <div className="bg-gradient-to-br from-emerald-900 to-stone-900 rounded-3xl p-8 relative overflow-hidden">
        <div className="absolute top-0 right-0 w-72 h-72 bg-emerald-400/10 rounded-full -translate-y-1/2 translate-x-1/2 blur-3xl pointer-events-none" />
        <div className="relative z-10 flex items-start justify-between flex-wrap gap-6">
          <div>
            <p className="text-[9px] font-black text-emerald-400 uppercase tracking-[0.35em] mb-1">Stock Physique</p>
            <h2 className="text-3xl font-black text-white uppercase tracking-tighter">
              Fiches <span className="text-emerald-400">Stock</span>
            </h2>
            <p className="text-stone-400 text-sm mt-2">
              {totalRefs} référence{totalRefs !== 1 ? 's' : ''} · entrées validées manuellement uniquement
            </p>
          </div>
          <div className="flex gap-3">
            <div className="bg-white/10 backdrop-blur-sm rounded-2xl px-5 py-3 text-center">
              <p className="text-[7px] font-black text-emerald-300 uppercase tracking-widest">Stock Total</p>
              <p className="text-2xl font-black text-white">{fmt(totalStock)}</p>
            </div>
            <div className="bg-white/10 backdrop-blur-sm rounded-2xl px-5 py-3 text-center">
              <p className="text-[7px] font-black text-emerald-300 uppercase tracking-widest">Valeur MAD</p>
              <p className="text-2xl font-black text-emerald-400">{fmt(totalVal)}</p>
            </div>
          </div>
        </div>
      </div>

      {/* ── Filtres catégories (pill buttons) ── */}
      {catNames.length > 1 && (
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-[8px] font-black text-stone-400 uppercase tracking-widest shrink-0">Catégorie :</span>
          {catNames.map((cat, idx) => {
            const count = grouped[cat]?.length || 0;
            const color = UI_COLORS[idx % UI_COLORS.length];
            const isActive = cat === activeCat;
            return (
              <button
                key={cat}
                onClick={() => setSelCat(cat)}
                className={`px-3 py-1.5 rounded-xl text-[9px] font-black uppercase tracking-wider transition-all border ${
                  isActive ? 'text-white border-transparent shadow-md' : 'text-stone-500 border-stone-200 hover:bg-stone-50'
                }`}
                style={isActive ? { backgroundColor: color } : {}}
              >
                {cat} <span className="opacity-60">({count})</span>
              </button>
            );
          })}
        </div>
      )}

      {/* ── Fiches produits ── */}
      <div className="space-y-3">
        {/* Résumé de la catégorie active */}
        {activeCat && (
          <div className="flex items-center gap-3 px-1">
            <div className="flex items-center gap-2">
              <TrendingUp className="w-3.5 h-3.5 text-emerald-500" />
              <span className="text-[10px] font-black text-stone-600 uppercase tracking-wider">
                {items.length} produit{items.length !== 1 ? 's' : ''} · {activeCat}
              </span>
            </div>
            <div className="h-px flex-1 bg-stone-100" />
            <span className="text-[9px] font-bold text-stone-400">
              Stock : <strong className="text-stone-700">{fmt(items.reduce((s,i)=>s+i.currentQty,0))}</strong>
              {' · '}
              Valeur : <strong className="text-emerald-700">{fmt(items.reduce((s,i)=>s+Math.round(i.currentQty*(i.purchasePricePerUnit||0)),0))} MAD</strong>
            </span>
          </div>
        )}

        {items.length === 0 ? (
          <div className="bg-white rounded-2xl p-14 text-center border border-stone-100">
            <Package className="w-8 h-8 text-stone-200 mx-auto mb-3" />
            <p className="text-stone-300 font-black uppercase text-[10px] tracking-widest">Aucun article validé dans cette catégorie</p>
          </div>
        ) : (
          items.map((item, idx) => (
            <FicheStock
              key={item.articleId}
              article={item}
              color={UI_COLORS[idx % UI_COLORS.length]}
              movements={movements}
              factures={factures}
            />
          ))
        )}
      </div>
    </div>
  );
}
