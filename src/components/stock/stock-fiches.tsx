"use client";

import React, { useState, useMemo } from 'react';
import {
  Package, ArrowDownToLine, ArrowUpFromLine, ChevronDown,
  Boxes, TrendingDown, TrendingUp
} from 'lucide-react';

const COLOR_MAP: Record<string, string> = {
  rouge:'#ef4444', red:'#ef4444', bleu:'#3b82f6', blue:'#3b82f6',
  vert:'#22c55e', green:'#22c55e', noir:'#1c1917', black:'#1c1917',
  blanc:'#f5f5f4', white:'#f5f5f4', gris:'#6b7280', grey:'#6b7280',
  jaune:'#eab308', yellow:'#eab308', orange:'#f97316', violet:'#8b5cf6',
  rose:'#f43f5e', pink:'#ec4899', marron:'#92400e', brown:'#92400e',
  beige:'#d6c5a3', marine:'#1e3a5f', kaki:'#6b7a42',
};
const UI_COLORS = ['#CC8626','#1E293B','#3B82F6','#10B981','#6366F1','#F43F5E','#8B5CF6','#EC4899'];

function getColorCSS(c?: string) {
  if (!c) return '#f5f5f4';
  return COLOR_MAP[c.toLowerCase()] || '#e7e5e4';
}

// ── Fiche dépliable par produit ─────────────────────────────────────────────
function FicheStock({ article: a, color, movements, factures }: {
  article: any; color: string; movements: any[]; factures: any[];
}) {
  const [open, setOpen] = useState(false);

  const artMovements = useMemo(() =>
    movements.filter(m => m.articleId === a.articleId),
    [movements, a.articleId]
  );
  const entriesIN  = useMemo(() => artMovements.filter(m => m.type === 'IN').sort((x,y) => (y.date||'').localeCompare(x.date||'')), [artMovements]);
  const entriesOUT = useMemo(() => artMovements.filter(m => m.type === 'OUT').sort((x,y) => (y.date||'').localeCompare(x.date||'')), [artMovements]);

  const totalIn  = a.initialQty + a.mouvementsIn;
  const totalOut = a.mouvementsOut;
  const pct = totalIn > 0 ? Math.min(100, Math.round((a.currentQty / totalIn) * 100)) : 100;
  const stockColor = pct < 30 ? '#ef4444' : pct < 60 ? '#f59e0b' : '#10b981';

  return (
    <div className="bg-white rounded-2xl shadow-sm border border-stone-100 overflow-hidden">
      {/* ── Header cliquable ── */}
      <button onClick={() => setOpen(o => !o)} className="w-full text-left hover:bg-stone-50/50 transition-colors">
        <div className="h-1 w-full" style={{ backgroundColor: color }} />
        <div className="flex items-center gap-4 px-5 py-4">

          {/* Swatch couleur */}
          <div className="w-10 h-10 rounded-xl border border-stone-100 shrink-0 flex items-center justify-center"
            style={{ backgroundColor: getColorCSS(a.color) }}>
            {!a.color && <Package className="w-4 h-4 text-stone-300" />}
          </div>

          {/* Nom + tags */}
          <div className="flex-1 min-w-0">
            <p className="text-[12px] font-black text-stone-900 uppercase tracking-tighter leading-tight">{a.productName}</p>
            <div className="flex items-center gap-1.5 mt-0.5 flex-wrap">
              {a.size  && <span className="text-[7px] font-black bg-stone-100 text-stone-500 px-1.5 py-0.5 rounded uppercase">{a.size}</span>}
              {a.color && <span className="text-[7px] font-black bg-stone-100 text-stone-500 px-1.5 py-0.5 rounded uppercase">{a.color}</span>}
              <span className="text-[7px] font-bold text-stone-300">{a.unitOfMeasure}</span>
            </div>
          </div>

          {/* Stats inline */}
          <div className="flex items-center gap-4 shrink-0">

            {/* Entrées */}
            <div className="text-center hidden sm:block">
              <p className="text-[7px] font-black text-stone-400 uppercase tracking-widest">Entrées</p>
              <p className="text-[14px] font-black text-emerald-600">+{Number(totalIn).toLocaleString('fr-MA')}</p>
            </div>

            {/* Sorties */}
            <div className="text-center hidden sm:block">
              <p className="text-[7px] font-black text-stone-400 uppercase tracking-widest">Sorties</p>
              <p className={`text-[14px] font-black ${totalOut > 0 ? 'text-rose-500' : 'text-stone-300'}`}>
                {totalOut > 0 ? `-${Number(totalOut).toLocaleString('fr-MA')}` : '—'}
              </p>
            </div>

            {/* Stock réel */}
            <div className="text-center bg-stone-50 rounded-xl px-4 py-2 min-w-[90px]">
              <p className="text-[7px] font-black text-stone-400 uppercase tracking-widest">Stock Réel</p>
              <p className="text-[18px] font-black text-stone-900">{Number(a.currentQty).toLocaleString('fr-MA')}</p>
              <div className="h-1 bg-stone-200 rounded-full mt-1 overflow-hidden">
                <div className="h-full rounded-full transition-all" style={{ width: `${pct}%`, backgroundColor: stockColor }} />
              </div>
            </div>

            {/* Valeur */}
            <div className="text-center hidden md:block">
              <p className="text-[7px] font-black text-stone-400 uppercase tracking-widest">Valeur</p>
              <p className="text-[11px] font-black" style={{ color }}>
                {Number(a.totalValue).toLocaleString('fr-MA', { maximumFractionDigits: 0 })} {a.hasTTCCost ? 'MAD' : '$'}
              </p>
              {a.purchasePricePerUnit > 0 && (
                <p className="text-[8px] font-bold text-stone-400">
                  {Number(a.purchasePricePerUnit).toLocaleString('fr-MA', { maximumFractionDigits: 2 })} MAD/u
                </p>
              )}
            </div>

            {/* Chevron */}
            <div className={`w-7 h-7 rounded-xl border flex items-center justify-center transition-all duration-300 ${
              open ? 'rotate-180 bg-stone-900 border-stone-900' : 'border-stone-200 bg-white'
            }`}>
              <ChevronDown className={`w-4 h-4 ${open ? 'text-white' : 'text-stone-400'}`} />
            </div>
          </div>
        </div>
      </button>

      {/* ── Détail historique ── */}
      {open && (
        <div className="border-t border-stone-100 bg-stone-50/40 px-5 py-5 space-y-5">

          {/* ENTRÉES */}
          <div>
            <div className="flex items-center gap-2 mb-3">
              <div className="w-5 h-5 rounded-lg bg-emerald-100 flex items-center justify-center shrink-0">
                <ArrowDownToLine className="w-3 h-3 text-emerald-600" />
              </div>
              <p className="text-[9px] font-black text-stone-700 uppercase tracking-widest">
                Entrées en stock — {entriesIN.length} arrivage{entriesIN.length !== 1 ? 's' : ''}
              </p>
            </div>
            {entriesIN.length === 0 ? (
              <p className="text-[9px] text-stone-300 font-bold pl-7">Aucune entrée enregistrée</p>
            ) : (
              <div className="space-y-2">
                {entriesIN.map((mv, i) => {
                  const facture = factures.find((f: any) => f.id === mv.factureId);
                  const hasCost = mv.purchasePriceMAD != null && mv.purchasePriceMAD > 0;
                  return (
                    <div key={i} className="flex items-start gap-3 bg-white rounded-xl px-4 py-3 border border-emerald-100 shadow-sm">
                      <div className="w-2 h-2 rounded-full bg-emerald-400 mt-1.5 shrink-0" />
                      <div className="flex-1 grid grid-cols-2 sm:grid-cols-4 gap-3">
                        <div>
                          <p className="text-[7px] font-black text-stone-400 uppercase tracking-widest">Date</p>
                          <p className="text-[10px] font-black text-stone-700">{mv.date || '—'}</p>
                        </div>
                        <div>
                          <p className="text-[7px] font-black text-stone-400 uppercase tracking-widest">Quantité</p>
                          <p className="text-[10px] font-black text-emerald-700">+{Number(mv.quantity).toLocaleString('fr-MA')} {a.unitOfMeasure}</p>
                        </div>
                        <div>
                          <p className="text-[7px] font-black text-stone-400 uppercase tracking-widest">Coût de Revient</p>
                          {hasCost ? (
                            <p className="text-[10px] font-black text-violet-700">
                              {Number(mv.purchasePriceMAD).toLocaleString('fr-MA', { maximumFractionDigits: 2 })} MAD/u
                            </p>
                          ) : a.purchasePricePerUnit > 0 ? (
                            <p className="text-[10px] font-black text-violet-500">
                              {Number(a.purchasePricePerUnit).toLocaleString('fr-MA', { maximumFractionDigits: 2 })} MAD/u
                            </p>
                          ) : (
                            <p className="text-[10px] font-bold text-stone-300">—</p>
                          )}
                        </div>
                        <div>
                          <p className="text-[7px] font-black text-stone-400 uppercase tracking-widest">Arrivage</p>
                          <p className="text-[10px] font-black text-stone-500 truncate">
                            {facture?.id || mv.factureId || mv.notes || '—'}
                          </p>
                          {facture?.supplierId && (
                            <p className="text-[8px] text-stone-300 font-bold">{facture.supplierId}</p>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* SORTIES */}
          <div>
            <div className="flex items-center gap-2 mb-3">
              <div className="w-5 h-5 rounded-lg bg-rose-100 flex items-center justify-center shrink-0">
                <ArrowUpFromLine className="w-3 h-3 text-rose-600" />
              </div>
              <p className="text-[9px] font-black text-stone-700 uppercase tracking-widest">
                Sorties — {entriesOUT.length} mouvement{entriesOUT.length !== 1 ? 's' : ''}
              </p>
            </div>
            {entriesOUT.length === 0 ? (
              <p className="text-[9px] text-stone-300 font-bold pl-7">Aucune sortie enregistrée</p>
            ) : (
              <div className="space-y-2">
                {entriesOUT.map((mv, i) => (
                  <div key={i} className="flex items-start gap-3 bg-white rounded-xl px-4 py-3 border border-rose-100 shadow-sm">
                    <div className="w-2 h-2 rounded-full bg-rose-400 mt-1.5 shrink-0" />
                    <div className="flex-1 grid grid-cols-2 sm:grid-cols-3 gap-3">
                      <div>
                        <p className="text-[7px] font-black text-stone-400 uppercase tracking-widest">Date</p>
                        <p className="text-[10px] font-black text-stone-700">{mv.date || '—'}</p>
                      </div>
                      <div>
                        <p className="text-[7px] font-black text-stone-400 uppercase tracking-widest">Quantité</p>
                        <p className="text-[10px] font-black text-rose-600">-{Number(mv.quantity).toLocaleString('fr-MA')} {a.unitOfMeasure}</p>
                      </div>
                      <div>
                        <p className="text-[7px] font-black text-stone-400 uppercase tracking-widest">Raison</p>
                        <p className="text-[10px] font-black text-stone-500">{mv.reason || mv.notes || '—'}</p>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

// ── Vue principale : fiches groupées par catégorie ───────────────────────────
export default function StockFiches({ stockItems, movements, categories, factures }: {
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
  const totalStock = stockItems.reduce((s, i) => s + i.currentQty, 0);
  const totalVal   = stockItems.reduce((s, i) => s + (i.totalValue || 0), 0);

  if (stockItems.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-32 text-center">
        <div className="w-16 h-16 rounded-2xl bg-emerald-50 flex items-center justify-center mb-4">
          <Boxes className="w-8 h-8 text-emerald-300" />
        </div>
        <p className="text-stone-400 font-black uppercase text-[10px] tracking-widest">Aucun article en stock</p>
        <p className="text-stone-300 text-[9px] font-bold mt-1">
          Validez un arrivage depuis l'onglet <strong>Arrivages</strong> → bouton <strong>"Enregistrer en Stock"</strong>
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-6">

      {/* ── Header ── */}
      <div className="bg-gradient-to-br from-emerald-900 to-emerald-800 rounded-3xl p-8 relative overflow-hidden">
        <div className="absolute top-0 right-0 w-64 h-64 bg-emerald-400/10 rounded-full -translate-y-1/2 translate-x-1/2 blur-3xl" />
        <div className="relative z-10 flex items-start justify-between flex-wrap gap-4">
          <div>
            <p className="text-[9px] font-black text-emerald-300 uppercase tracking-[0.3em] mb-2">Gestion des stocks</p>
            <h2 className="text-3xl font-black text-white uppercase tracking-tighter">
              Fiches <span className="text-emerald-400">En Stock</span>
            </h2>
            <p className="text-emerald-300/70 text-sm mt-2">
              {stockItems.length} référence{stockItems.length > 1 ? 's' : ''} · validation arrivage requise
            </p>
          </div>
          <div className="flex gap-4">
            <div className="bg-white/10 backdrop-blur rounded-2xl px-5 py-3 text-center">
              <p className="text-[8px] font-black text-emerald-300 uppercase tracking-widest">Stock Total</p>
              <p className="text-2xl font-black text-white">{Number(totalStock).toLocaleString('fr-MA')}</p>
            </div>
            <div className="bg-white/10 backdrop-blur rounded-2xl px-5 py-3 text-center">
              <p className="text-[8px] font-black text-emerald-300 uppercase tracking-widest">Valeur MAD</p>
              <p className="text-2xl font-black text-emerald-400">
                {Number(totalVal).toLocaleString('fr-MA', { maximumFractionDigits: 0 })}
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* ── Filtres catégories ── */}
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
              style={isActive ? { backgroundColor: color, borderColor: color } : {}}
            >
              {cat} <span className="opacity-60">({count})</span>
            </button>
          );
        })}
      </div>

      {/* ── Fiches produits ── */}
      {items.length === 0 ? (
        <div className="bg-white rounded-2xl p-16 text-center border border-stone-100">
          <Package className="w-10 h-10 text-stone-200 mx-auto mb-3" />
          <p className="text-stone-300 font-black uppercase text-[10px] tracking-widest">Aucun article dans cette catégorie</p>
        </div>
      ) : (
        <div className="space-y-3">
          {/* Résumé catégorie */}
          <div className="flex items-center gap-3 px-1">
            <div className="flex items-center gap-2">
              <TrendingUp className="w-4 h-4 text-emerald-500" />
              <span className="text-[10px] font-black text-stone-600 uppercase">
                {items.length} produit{items.length > 1 ? 's' : ''} · {activeCat}
              </span>
            </div>
            <div className="h-px flex-1 bg-stone-100" />
            <span className="text-[9px] font-bold text-stone-400">
              Stock total : <strong className="text-stone-600">{items.reduce((s,i) => s+i.currentQty,0).toLocaleString('fr-MA')}</strong>
            </span>
          </div>

          {items.map((item, idx) => (
            <FicheStock
              key={item.articleId}
              article={item}
              color={UI_COLORS[idx % UI_COLORS.length]}
              movements={movements}
              factures={factures}
            />
          ))}
        </div>
      )}
    </div>
  );
}
