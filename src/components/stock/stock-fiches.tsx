"use client";

import React, { useState, useMemo } from 'react';
import {
  Layers, Package, ArrowRight, ArrowDownToLine, ArrowUpFromLine,
  ChevronLeft, ChevronDown, ChevronUp, AlertTriangle, CheckCircle2,
  BarChart3, DollarSign, Boxes, TrendingUp, TrendingDown
} from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';

// ── Helpers ──────────────────────────────────────────────────────────────────
const UI_COLORS = ['#CC8626','#1E293B','#3B82F6','#10B981','#6366F1','#F43F5E','#8B5CF6','#EC4899'];
const LINE_COLORS: Record<string, string> = {
  'Fabric':'#8B5CF6','Slider et puller':'#3B82F6','Zipper':'#F59E0B','Bouton':'#10B981','Reste':'#6B7280',
};

function fmt(n: number) { return Math.round(n).toLocaleString('fr-MA'); }
function fmtDec(n: number) {
  return Number(n).toLocaleString('fr-MA', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

// ── Sous-tableau mouvements ───────────────────────────────────────────────────
function MovementsDetail({ article, movements, factures }: { article: any; movements: any[]; factures: any[] }) {
  const artMovs = useMemo(() =>
    movements.filter(m => m.articleId === article.articleId)
      .sort((a, b) => (a.date || '').localeCompare(b.date || '')),
    [movements, article.articleId]
  );
  const cost = article.purchasePricePerUnit || 0;
  let running = article.initialQty;

  if (artMovs.length === 0) {
    return (
      <tr>
        <td colSpan={10} className="px-8 py-6 text-center text-stone-300 text-[9px] font-black uppercase tracking-widest bg-stone-50">
          Aucun mouvement enregistré — validez un arrivage pour alimenter ce stock
        </td>
      </tr>
    );
  }

  return (
    <>
      <tr className="bg-stone-800">
        <td colSpan={10} className="px-8 py-2">
          <span className="text-[7px] font-black text-stone-300 uppercase tracking-[0.25em]">
            Historique des mouvements · {artMovs.length} ligne{artMovs.length > 1 ? 's' : ''}
          </span>
        </td>
      </tr>
      <tr className="bg-stone-700">
        {['Date','Type','Raison','Entrée','Sortie','Stock Cumul','Coût Rev. MAD/u','Valeur MAD','Réf. Arrivage'].map(h => (
          <td key={h} className="px-5 py-2 text-[7px] font-black uppercase tracking-widest text-stone-400 text-left">{h}</td>
        ))}
        <td className="px-4 py-2" />
      </tr>
      {artMovs.map((mv, i) => {
        const isIN  = mv.type === 'IN';
        const isOUT = mv.type === 'OUT';
        const qty = Number(mv.quantity) || 0;
        if (isIN)  running += qty;
        if (isOUT) running -= qty;
        const cumul = Math.max(0, running);
        const mvCost = (mv.purchasePriceMAD != null && mv.purchasePriceMAD > 0) ? mv.purchasePriceMAD : (isIN ? cost : 0);
        const facture = factures.find((f: any) => f.id === mv.factureId);
        return (
          <tr key={i} className={`border-b border-stone-100 text-[10px] ${
            isIN ? 'bg-emerald-50/40 border-l-2 border-l-emerald-400' :
            isOUT ? 'bg-rose-50/40 border-l-2 border-l-rose-400' :
                    'bg-amber-50/40 border-l-2 border-l-amber-400'
          }`}>
            <td className="px-5 py-2.5 font-bold text-stone-700 whitespace-nowrap">{mv.date || '—'}</td>
            <td className="px-5 py-2.5">
              <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-[7px] font-black uppercase ${
                isIN ? 'bg-emerald-100 text-emerald-800' : isOUT ? 'bg-rose-100 text-rose-800' : 'bg-amber-100 text-amber-800'
              }`}>
                {isIN ? <ArrowDownToLine className="w-2.5 h-2.5" /> : isOUT ? <ArrowUpFromLine className="w-2.5 h-2.5" /> : null}
                {mv.type}
              </span>
            </td>
            <td className="px-5 py-2.5 text-stone-500 font-bold">{mv.reason || '—'}</td>
            <td className="px-5 py-2.5 font-black text-emerald-700">{isIN ? `+${fmt(qty)}` : <span className="text-stone-200">—</span>}</td>
            <td className="px-5 py-2.5 font-black text-rose-600">{isOUT ? `-${fmt(qty)}` : <span className="text-stone-200">—</span>}</td>
            <td className="px-5 py-2.5 font-black text-stone-900">{fmt(cumul)}</td>
            <td className="px-5 py-2.5 font-black text-violet-700">{mvCost > 0 ? `${fmtDec(mvCost)} MAD` : <span className="text-stone-200">—</span>}</td>
            <td className="px-5 py-2.5 font-black text-stone-700">{mvCost > 0 ? `${fmt(Math.round(cumul * mvCost))} MAD` : <span className="text-stone-200">—</span>}</td>
            <td className="px-5 py-2.5 text-stone-400 font-bold text-[9px]">{facture?.id || mv.factureId || mv.notes || '—'}</td>
            <td className="px-4 py-2.5" />
          </tr>
        );
      })}
      {/* Total produit */}
      <tr className="bg-stone-900 text-white text-[9px]">
        <td colSpan={3} className="px-5 py-3 font-black text-stone-400 uppercase tracking-widest">Totaux</td>
        <td className="px-5 py-3 font-black text-emerald-400">+{fmt(article.initialQty + article.mouvementsIn)}</td>
        <td className="px-5 py-3 font-black text-rose-400">{article.mouvementsOut > 0 ? `-${fmt(article.mouvementsOut)}` : '—'}</td>
        <td className="px-5 py-3 font-black text-white">{fmt(article.currentQty)}</td>
        <td className="px-5 py-3 font-black text-violet-300">{cost > 0 ? `${fmtDec(cost)} MAD` : '—'}</td>
        <td className="px-5 py-3 font-black text-emerald-400">{cost > 0 ? `${fmt(Math.round(article.currentQty * cost))} MAD` : '—'}</td>
        <td className="px-5 py-3 text-stone-500">—</td>
        <td className="px-4 py-3" />
      </tr>
    </>
  );
}

// ── Ligne produit dans le tableau ────────────────────────────────────────────
function ProductRow({ article: a, idx, movements, factures }: { article: any; idx: number; movements: any[]; factures: any[] }) {
  const [expanded, setExpanded] = useState(false);
  const cost = a.purchasePricePerUnit || 0;
  const totalIn = a.initialQty + a.mouvementsIn;
  const pct = totalIn > 0 ? Math.min(100, Math.round((a.currentQty / totalIn) * 100)) : 100;
  const stockColor = pct < 25 ? '#ef4444' : pct < 50 ? '#f59e0b' : pct < 75 ? '#3b82f6' : '#10b981';
  const isAlert = a.minThreshold != null && a.currentQty <= a.minThreshold;
  const isRupture = a.currentQty === 0;
  const color = UI_COLORS[idx % UI_COLORS.length];

  return (
    <>
      <tr
        onClick={() => setExpanded(e => !e)}
        className={`border-b border-stone-100 cursor-pointer transition-colors hover:bg-stone-50/70 ${expanded ? 'bg-emerald-50/20' : ''}`}
        style={{ borderLeftWidth: 3, borderLeftColor: color, borderLeftStyle: 'solid' }}
      >
        {/* # */}
        <td className="px-4 py-3.5 text-[8px] font-black text-stone-300 text-center w-10">{idx + 1}</td>
        {/* Produit */}
        <td className="px-4 py-3.5">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0" style={{ backgroundColor: `${color}20` }}>
              <Package className="w-3.5 h-3.5" style={{ color }} />
            </div>
            <div>
              <p className="text-[11px] font-black text-stone-900 uppercase tracking-tight leading-none">{a.productName}</p>
              <div className="flex items-center gap-1 mt-1">
                {a.size  && <span className="text-[7px] font-bold bg-stone-100 text-stone-500 px-1.5 py-0.5 rounded uppercase">{a.size}</span>}
                {a.color && <span className="text-[7px] font-bold bg-stone-100 text-stone-500 px-1.5 py-0.5 rounded uppercase">{a.color}</span>}
                <span className="text-[7px] text-stone-300 font-bold">{a.unitOfMeasure}</span>
              </div>
            </div>
          </div>
        </td>
        {/* Entrées */}
        <td className="px-4 py-3.5 text-right">
          <span className="text-[12px] font-black text-emerald-600">+{fmt(totalIn)}</span>
        </td>
        {/* Sorties */}
        <td className="px-4 py-3.5 text-right">
          <span className={`text-[12px] font-black ${a.mouvementsOut > 0 ? 'text-rose-600' : 'text-stone-200'}`}>
            {a.mouvementsOut > 0 ? `-${fmt(a.mouvementsOut)}` : '—'}
          </span>
        </td>
        {/* Stock Réel */}
        <td className="px-4 py-3.5 min-w-[140px]">
          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <span className="text-[14px] font-black text-stone-900">{fmt(a.currentQty)}</span>
              {isRupture ? (
                <span className="text-[7px] font-black bg-red-100 text-red-700 px-1.5 py-0.5 rounded-full uppercase">Rupture</span>
              ) : isAlert ? (
                <span className="text-[7px] font-black bg-amber-100 text-amber-700 px-1.5 py-0.5 rounded-full uppercase flex items-center gap-0.5">
                  <AlertTriangle className="w-2 h-2" /> Alerte
                </span>
              ) : (
                <span className="text-[7px] font-black bg-emerald-100 text-emerald-700 px-1.5 py-0.5 rounded-full uppercase flex items-center gap-0.5">
                  <CheckCircle2 className="w-2 h-2" /> OK
                </span>
              )}
            </div>
            <div className="h-1.5 bg-stone-100 rounded-full overflow-hidden">
              <div className="h-full rounded-full transition-all" style={{ width: `${pct}%`, backgroundColor: stockColor }} />
            </div>
          </div>
        </td>
        {/* Seuil */}
        <td className="px-4 py-3.5 text-center">
          {a.minThreshold != null ? (
            <span className={`text-[11px] font-black ${isAlert ? 'text-red-600' : 'text-stone-500'}`}>
              {fmt(a.minThreshold)}
            </span>
          ) : <span className="text-stone-200 text-[10px]">—</span>}
        </td>
        {/* Coût Rev. */}
        <td className="px-4 py-3.5 text-right">
          {cost > 0
            ? <span className="text-[10px] font-black text-violet-700">{fmtDec(cost)} MAD</span>
            : <span className="text-stone-200 text-[10px]">—</span>}
        </td>
        {/* Valeur */}
        <td className="px-4 py-3.5 text-right">
          {cost > 0 && a.currentQty > 0
            ? <span className="text-[11px] font-black text-stone-800">{fmt(Math.round(a.currentQty * cost))} MAD</span>
            : <span className="text-stone-200 text-[10px]">—</span>}
        </td>
        {/* Expand */}
        <td className="px-4 py-3.5 text-center w-10">
          <div className={`w-6 h-6 rounded-lg border flex items-center justify-center transition-all mx-auto ${
            expanded ? 'bg-stone-900 border-stone-900' : 'border-stone-200 bg-white'
          }`}>
            {expanded ? <ChevronUp className="w-3.5 h-3.5 text-white" /> : <ChevronDown className="w-3.5 h-3.5 text-stone-400" />}
          </div>
        </td>
      </tr>
      {expanded && <MovementsDetail article={a} movements={movements} factures={factures} />}
    </>
  );
}

// ── Tableau des produits d'une sous-catégorie ─────────────────────────────────
function ProductsTable({ items, subCatName, movements, factures, onBack }: {
  items: any[]; subCatName: string; movements: any[]; factures: any[]; onBack: () => void;
}) {
  const totalIn  = items.reduce((s, i) => s + i.initialQty + i.mouvementsIn, 0);
  const totalOut = items.reduce((s, i) => s + i.mouvementsOut, 0);
  const totalQty = items.reduce((s, i) => s + i.currentQty, 0);
  const totalVal = items.reduce((s, i) => s + Math.round(i.currentQty * (i.purchasePricePerUnit || 0)), 0);
  const alertCount = items.filter(i => i.minThreshold != null && i.currentQty <= i.minThreshold).length;

  return (
    <div className="space-y-4 animate-in fade-in duration-200">
      {/* Breadcrumb + back */}
      <div className="flex items-center gap-2">
        <button onClick={onBack} className="flex items-center gap-1.5 text-[9px] font-black text-stone-500 hover:text-stone-900 uppercase tracking-widest transition-colors">
          <ChevronLeft className="w-3.5 h-3.5" /> Retour
        </button>
        <span className="text-stone-200">/</span>
        <span className="text-[9px] font-black text-stone-900 uppercase tracking-widest">{subCatName}</span>
      </div>

      {/* KPIs sous-cat */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[
          { label: 'Références', value: items.length, icon: Boxes, color: 'text-stone-700' },
          { label: 'Entrées', value: `+${fmt(totalIn)}`, icon: TrendingUp, color: 'text-emerald-600' },
          { label: 'Stock Réel', value: fmt(totalQty), icon: Package, color: 'text-blue-600' },
          { label: 'Valeur MAD', value: `${fmt(totalVal)} MAD`, icon: DollarSign, color: 'text-violet-700' },
        ].map(({ label, value, icon: Icon, color }) => (
          <div key={label} className="bg-white rounded-2xl border border-stone-100 p-4 flex items-center gap-3 shadow-sm">
            <div className="w-8 h-8 rounded-xl bg-stone-50 flex items-center justify-center shrink-0">
              <Icon className={`w-4 h-4 ${color}`} />
            </div>
            <div>
              <p className="text-[7px] font-black text-stone-400 uppercase tracking-widest">{label}</p>
              <p className={`text-[13px] font-black ${color}`}>{value}</p>
            </div>
          </div>
        ))}
      </div>

      {alertCount > 0 && (
        <div className="bg-amber-50 border border-amber-200 rounded-2xl px-5 py-3 flex items-center gap-3">
          <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0" />
          <p className="text-[10px] font-black text-amber-800 uppercase tracking-wider">
            {alertCount} produit{alertCount > 1 ? 's' : ''} sous le seuil minimum
          </p>
        </div>
      )}

      {/* Tableau principal */}
      <div className="bg-white rounded-2xl border border-stone-100 overflow-hidden shadow-sm">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="bg-stone-50 border-b border-stone-200">
                <th className="px-4 py-3 w-10"></th>
                <th className="px-4 py-3 text-left text-[7px] font-black text-stone-400 uppercase tracking-widest">Produit</th>
                <th className="px-4 py-3 text-right text-[7px] font-black text-stone-400 uppercase tracking-widest">Entrées</th>
                <th className="px-4 py-3 text-right text-[7px] font-black text-stone-400 uppercase tracking-widest">Sorties</th>
                <th className="px-4 py-3 text-left text-[7px] font-black text-stone-400 uppercase tracking-widest min-w-[140px]">Stock Réel</th>
                <th className="px-4 py-3 text-center text-[7px] font-black text-stone-400 uppercase tracking-widest">Seuil Mini</th>
                <th className="px-4 py-3 text-right text-[7px] font-black text-stone-400 uppercase tracking-widest">Coût Rev. MAD/u</th>
                <th className="px-4 py-3 text-right text-[7px] font-black text-stone-400 uppercase tracking-widest">Valeur MAD</th>
                <th className="px-4 py-3 w-10"></th>
              </tr>
            </thead>
            <tbody>
              {items.length === 0 ? (
                <tr>
                  <td colSpan={9} className="px-6 py-16 text-center text-stone-300 text-[10px] font-black uppercase tracking-widest">
                    Aucun article validé en stock dans cette sous-catégorie
                  </td>
                </tr>
              ) : (
                items.map((item, idx) => (
                  <ProductRow key={item.articleId} article={item} idx={idx} movements={movements} factures={factures} />
                ))
              )}
            </tbody>
            {items.length > 0 && (
              <tfoot>
                <tr className="bg-stone-900 text-white">
                  <td colSpan={2} className="px-4 py-3 text-[8px] font-black text-stone-400 uppercase tracking-widest">
                    TOTAL — {items.length} référence{items.length !== 1 ? 's' : ''}
                  </td>
                  <td className="px-4 py-3 text-right text-[11px] font-black text-emerald-400">+{fmt(totalIn)}</td>
                  <td className="px-4 py-3 text-right text-[11px] font-black text-rose-400">
                    {totalOut > 0 ? `-${fmt(totalOut)}` : '—'}
                  </td>
                  <td className="px-4 py-3 text-left text-[14px] font-black text-white">{fmt(totalQty)}</td>
                  <td className="px-4 py-3"></td>
                  <td className="px-4 py-3"></td>
                  <td className="px-4 py-3 text-right text-[11px] font-black text-emerald-400">
                    {totalVal > 0 ? `${fmt(totalVal)} MAD` : '—'}
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

// ── Vue principale : navigation 3 niveaux ─────────────────────────────────────
export default function StockFiches({
  stockItems, movements, categories, generalCategories, factures
}: {
  stockItems: any[]; movements: any[]; categories: any[]; generalCategories: any[]; factures: any[];
}) {
  const [selGenCat, setSelGenCat] = useState<string | null>(null);
  const [selSubCat, setSelSubCat] = useState<string | null>(null);

  // Index: categoryId → stock items
  const stockByCategory = useMemo(() => {
    const map: Record<string, any[]> = {};
    stockItems.forEach(item => {
      const k = item.categoryId || '';
      if (!map[k]) map[k] = [];
      map[k].push(item);
    });
    return map;
  }, [stockItems]);

  // Sub-categories under a general category that have stock
  const subCatsWithStock = useMemo(() => {
    if (!selGenCat) return [];
    return categories.filter(c =>
      c.generalCategoryId === selGenCat &&
      (stockByCategory[c.name]?.length || 0) > 0
    );
  }, [categories, selGenCat, stockByCategory]);

  // General categories that have at least 1 stock item
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

  // ── Niveau 3 : produits de la sous-catégorie ─────────────────────────────
  if (selGenCat && selSubCat) {
    const subCat = categories.find(c => c.id === selSubCat || c.name === selSubCat);
    const items  = stockByCategory[subCat?.name || selSubCat] || [];
    return (
      <div className="space-y-6">
        <StockHeader totalRefs={totalRefs} totalStock={totalStock} totalVal={totalVal} alertCount={alertCount} />
        <ProductsTable
          items={items}
          subCatName={subCat?.name || selSubCat}
          movements={movements}
          factures={factures}
          onBack={() => setSelSubCat(null)}
        />
      </div>
    );
  }

  // ── Niveau 2 : sous-catégories d'une famille ─────────────────────────────
  if (selGenCat) {
    const gc = generalCategories.find(g => g.id === selGenCat);
    const lineColor = LINE_COLORS[(gc as any)?.line] || '#6B7280';

    return (
      <div className="space-y-6">
        <StockHeader totalRefs={totalRefs} totalStock={totalStock} totalVal={totalVal} alertCount={alertCount} />

        {/* Breadcrumb */}
        <div className="flex items-center gap-2">
          <button onClick={() => setSelGenCat(null)} className="flex items-center gap-1.5 text-[9px] font-black text-stone-500 hover:text-stone-900 uppercase tracking-widest transition-colors">
            <ChevronLeft className="w-3.5 h-3.5" /> Retour
          </button>
          <span className="text-stone-200">/</span>
          <div className="flex items-center gap-2">
            <div className="w-2 h-2 rounded-full" style={{ backgroundColor: lineColor }} />
            <span className="text-[9px] font-black text-stone-900 uppercase tracking-widest">{gc?.name}</span>
          </div>
        </div>

        {subCatsWithStock.length === 0 ? (
          <div className="bg-white rounded-2xl p-16 text-center border border-stone-100">
            <Package className="w-10 h-10 text-stone-200 mx-auto mb-3" />
            <p className="text-stone-300 font-black uppercase text-[10px] tracking-widest">Aucune sous-catégorie avec du stock validé</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
            {subCatsWithStock.map((sc, idx) => {
              const items = stockByCategory[sc.name] || [];
              const qty   = items.reduce((s: number, i: any) => s + i.currentQty, 0);
              const val   = items.reduce((s: number, i: any) => s + Math.round(i.currentQty * (i.purchasePricePerUnit || 0)), 0);
              const alerts = items.filter((i: any) => i.minThreshold != null && i.currentQty <= i.minThreshold).length;
              const color  = UI_COLORS[idx % UI_COLORS.length];
              const pct    = items.length > 0
                ? Math.round(items.filter((i: any) => i.currentQty > (i.minThreshold || 0)).length / items.length * 100)
                : 100;

              return (
                <Card
                  key={sc.id}
                  onClick={() => setSelSubCat(sc.id || sc.name)}
                  className="group cursor-pointer border-none shadow-md hover:shadow-xl transition-all duration-300 rounded-[1.2rem] overflow-hidden active:scale-95"
                >
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
                    <div className="h-1 bg-stone-100 rounded-full overflow-hidden">
                      <div className="h-full rounded-full" style={{ width: `${pct}%`, backgroundColor: color }} />
                    </div>
                    <div className="space-y-1 pt-1 border-t border-stone-50">
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

  // ── Niveau 1 : familles (general categories) ─────────────────────────────
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
              <Card
                key={gc.id}
                onClick={() => setSelGenCat(gc.id)}
                className="group cursor-pointer border-none shadow-md hover:shadow-xl transition-all duration-300 rounded-[1.2rem] overflow-hidden active:scale-95"
              >
                <div className="h-1 w-full" style={{ backgroundColor: lineColor }} />
                <CardContent className="p-4 space-y-3">
                  <div className="flex items-start justify-between">
                    <div className="p-2 rounded-lg" style={{ backgroundColor: `${lineColor}15`, color: lineColor }}>
                      <Layers className="w-3.5 h-3.5" />
                    </div>
                    {gcAlerts > 0 && (
                      <span className="text-[7px] font-black bg-amber-100 text-amber-700 px-1.5 py-0.5 rounded-full uppercase flex items-center gap-0.5">
                        <AlertTriangle className="w-2.5 h-2.5" /> {gcAlerts} alerte{gcAlerts > 1 ? 's' : ''}
                      </span>
                    )}
                  </div>
                  <div>
                    <h3 className="text-[12px] font-black text-stone-800 uppercase tracking-tighter leading-tight line-clamp-2 min-h-[2rem]">
                      {gc.name}
                    </h3>
                    <p className="text-[8px] text-stone-400 font-bold mt-0.5">{subCount} famille{subCount !== 1 ? 's' : ''} · {gcItems.length} ref.</p>
                  </div>
                  <div className="h-1 bg-stone-100 rounded-full overflow-hidden">
                    <div className="h-full rounded-full transition-all duration-700" style={{ width: `${Math.min(100, Math.round(gcItems.length / Math.max(1, stockItems.length) * 500))}%`, backgroundColor: lineColor }} />
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

// ── Header KPI commun ─────────────────────────────────────────────────────────
function StockHeader({ totalRefs, totalStock, totalVal, alertCount }: { totalRefs: number; totalStock: number; totalVal: number; alertCount: number }) {
  return (
    <div className="bg-gradient-to-br from-stone-900 to-stone-800 rounded-3xl p-8 relative overflow-hidden">
      <div className="absolute inset-0 bg-gradient-to-r from-emerald-900/30 to-transparent pointer-events-none" />
      <div className="relative z-10 flex items-start justify-between flex-wrap gap-6">
        <div>
          <p className="text-[8px] font-black text-emerald-400 uppercase tracking-[0.4em] mb-1">Stock Physique Validé</p>
          <h2 className="text-3xl font-black text-white uppercase tracking-tighter leading-none">
            Fiches de <span className="text-emerald-400">Stock</span>
          </h2>
          <p className="text-stone-400 text-xs mt-2">Entrées manuellement validées · coûts de revient réels</p>
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {[
            { label: 'Références', value: String(totalRefs), icon: BarChart3, color: 'text-stone-300' },
            { label: 'Stock Total', value: fmt(totalStock), icon: Boxes, color: 'text-blue-400' },
            { label: 'Valeur MAD', value: `${fmt(totalVal)} MAD`, icon: DollarSign, color: 'text-emerald-400' },
            { label: 'Alertes', value: String(alertCount), icon: AlertTriangle, color: alertCount > 0 ? 'text-amber-400' : 'text-stone-500' },
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
