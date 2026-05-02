"use client";

import React, { useState, useEffect, useMemo } from 'react';
import { useFirebase } from '@/firebase';
import { collection, getDocs } from 'firebase/firestore';
import {
  TrendingUp, TrendingDown, BarChart3, Package, Minus,
  Calculator, ShoppingCart, ChevronUp, ChevronDown, Loader2, Info
} from 'lucide-react';

interface ReconciliationViewProps {
  factures: any[];
}

interface DossierTotals {
  factureId: string;
  arrivalDate: string;
  coutRevientTtcTotal: number | null;
  coutVenteTtcTotal: number | null;
}

type SortKey = 'arrivalDate' | 'coutRevient' | 'coutVente' | 'diff' | 'pct';
type SortDir = 'asc' | 'desc';

export default function ReconciliationView({ factures }: ReconciliationViewProps) {
  const { user, firestore } = useFirebase();
  const [totalsMap, setTotalsMap] = useState<Record<string, DossierTotals>>({});
  const [loading, setLoading] = useState(true);
  const [sortKey, setSortKey] = useState<SortKey>('arrivalDate');
  const [sortDir, setSortDir] = useState<SortDir>('desc');

  // Load all dp_declarations to get saved totals
  useEffect(() => {
    if (!user || !firestore) return;
    setLoading(true);
    getDocs(collection(firestore, 'users', user.uid, 'dp_declarations'))
      .then(snap => {
        const map: Record<string, DossierTotals> = {};
        snap.docs.forEach(d => {
          const data = d.data();
          map[d.id] = {
            factureId: d.id,
            arrivalDate: '',
            coutRevientTtcTotal: data.coutRevientTtcTotal != null ? Number(data.coutRevientTtcTotal) : null,
            coutVenteTtcTotal:   data.coutVenteTtcTotal   != null ? Number(data.coutVenteTtcTotal)   : null,
          };
        });
        setTotalsMap(map);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [user, firestore]);

  // Merge factures with totals
  const rows = useMemo(() => {
    return factures.map(f => {
      const t = totalsMap[f.id];
      const revient = t?.coutRevientTtcTotal ?? null;
      const vente   = t?.coutVenteTtcTotal   ?? null;
      const diff    = revient !== null && vente !== null ? revient - vente : null;
      const pct     = revient !== null && revient > 0 && diff !== null ? (diff / revient) * 100 : null;
      return {
        id: f.id,
        arrivalDate: f.arrivalDate || '—',
        supplier: f.supplierId || f.shippingLine || '—',
        revient,
        vente,
        diff,
        pct,
        hasData: revient !== null || vente !== null,
      };
    });
  }, [factures, totalsMap]);

  // Sort
  const sorted = useMemo(() => {
    return [...rows].sort((a, b) => {
      let va: any, vb: any;
      if (sortKey === 'arrivalDate') { va = a.arrivalDate; vb = b.arrivalDate; }
      else if (sortKey === 'coutRevient') { va = a.revient ?? -Infinity; vb = b.revient ?? -Infinity; }
      else if (sortKey === 'coutVente')   { va = a.vente   ?? -Infinity; vb = b.vente   ?? -Infinity; }
      else if (sortKey === 'diff')        { va = a.diff    ?? -Infinity; vb = b.diff    ?? -Infinity; }
      else                               { va = a.pct     ?? -Infinity; vb = b.pct     ?? -Infinity; }
      if (va < vb) return sortDir === 'asc' ? -1 : 1;
      if (va > vb) return sortDir === 'asc' ?  1 : -1;
      return 0;
    });
  }, [rows, sortKey, sortDir]);

  // Global KPIs
  const withData = rows.filter(r => r.revient !== null && r.vente !== null);
  const totalRevient = withData.reduce((s, r) => s + (r.revient ?? 0), 0);
  const totalVente   = withData.reduce((s, r) => s + (r.vente   ?? 0), 0);
  const totalDiff    = totalRevient - totalVente;
  const totalPct     = totalRevient > 0 ? (totalDiff / totalRevient) * 100 : 0;
  const gainCount    = withData.filter(r => (r.diff ?? 0) <= 0).length;
  const perteCount   = withData.filter(r => (r.diff ?? 0) > 0).length;

  const handleSort = (key: SortKey) => {
    if (sortKey === key) setSortDir(d => d === 'asc' ? 'desc' : 'asc');
    else { setSortKey(key); setSortDir('desc'); }
  };

  const fmt = (v: number) => v.toLocaleString('fr-MA', { maximumFractionDigits: 0 });
  const fmtPct = (v: number) => (v >= 0 ? '+' : '') + v.toFixed(1) + '%';

  const SortIcon = ({ k }: { k: SortKey }) => {
    if (sortKey !== k) return <Minus className="w-2.5 h-2.5 text-stone-300" />;
    return sortDir === 'desc'
      ? <ChevronDown className="w-2.5 h-2.5 text-amber-500" />
      : <ChevronUp   className="w-2.5 h-2.5 text-amber-500" />;
  };

  const ThBtn = ({ label, k, cls = '' }: { label: string; k: SortKey; cls?: string }) => (
    <th
      onClick={() => handleSort(k)}
      className={`px-4 py-3.5 text-[9px] font-black uppercase tracking-widest cursor-pointer select-none ${cls}`}
    >
      <div className="flex items-center gap-1 justify-end">
        {label} <SortIcon k={k} />
      </div>
    </th>
  );

  return (
    <div className="space-y-8 fade-in">

      {/* Header */}
      <header className="bg-stone-900 rounded-[2rem] p-8 shadow-2xl relative overflow-hidden">
        <div className="absolute top-0 right-0 w-[500px] h-[500px] bg-violet-500/10 rounded-full -translate-y-1/2 translate-x-1/2 blur-[100px]" />
        <div className="relative z-10 flex flex-col lg:flex-row justify-between items-start lg:items-center gap-6">
          <div>
            <div className="flex items-center gap-3 mb-3">
              <div className="p-2.5 bg-violet-500 rounded-xl">
                <BarChart3 className="w-6 h-6 text-white" />
              </div>
              <div>
                <p className="text-[10px] font-black text-violet-400 uppercase tracking-[0.2em]">Vue Consolidée</p>
                <h2 className="text-3xl font-black text-white tracking-tighter uppercase leading-none">
                  Réconciliation Financière
                </h2>
              </div>
            </div>
            <p className="text-stone-400 text-sm font-medium max-w-lg">
              Coût de Revient − Coût de Vente par arrivage · Négatif = gain (vente couvre les coûts)
            </p>
          </div>

          {/* Global KPIs */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 w-full lg:w-auto">
            <KpiCard label="Coût de Revient Total" value={fmt(totalRevient)} sub="MAD" color="text-amber-400" />
            <KpiCard label="Coût de Vente Total"   value={fmt(totalVente)}   sub="MAD" color="text-emerald-400" />
            <div className={`p-4 rounded-2xl border ${totalDiff <= 0 ? 'bg-emerald-600/20 border-emerald-500/30' : 'bg-red-600/20 border-red-500/30'}`}>
              <p className="text-[8px] font-black text-stone-400 uppercase tracking-widest mb-1">Différence Globale</p>
              <p className={`text-xl font-black leading-none ${totalDiff <= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                {fmt(totalDiff)}
              </p>
              <p className="text-[8px] font-bold text-stone-500 mt-1">MAD · {fmtPct(totalPct)}</p>
            </div>
            <div className="bg-white/5 border border-white/10 p-4 rounded-2xl">
              <p className="text-[8px] font-black text-stone-400 uppercase tracking-widest mb-2">Dossiers</p>
              <div className="flex gap-2">
                <span className="flex items-center gap-1 text-[9px] font-black text-emerald-400">
                  <TrendingUp className="w-3 h-3" />{gainCount}
                </span>
                <span className="text-stone-600">·</span>
                <span className="flex items-center gap-1 text-[9px] font-black text-red-400">
                  <TrendingDown className="w-3 h-3" />{perteCount}
                </span>
              </div>
              <p className="text-[8px] font-bold text-stone-500 mt-1">{withData.length} avec données</p>
            </div>
          </div>
        </div>
      </header>

      {loading ? (
        <div className="flex items-center justify-center py-24 gap-3">
          <Loader2 className="w-6 h-6 animate-spin text-violet-500" />
          <p className="text-[10px] font-black text-stone-400 uppercase tracking-widest">Chargement…</p>
        </div>
      ) : (
        <div className="bg-white rounded-3xl shadow-xl border border-stone-100 overflow-hidden">
          {/* Table header */}
          <div className="bg-stone-900 px-8 py-5 flex items-center justify-between">
            <div>
              <p className="text-[9px] font-black text-stone-500 uppercase tracking-widest mb-1">{sorted.length} dossiers</p>
              <h3 className="text-lg font-black text-white uppercase tracking-tight">
                Détail par Arrivage
              </h3>
            </div>
            <div className="flex items-center gap-2 text-[8px] font-bold text-stone-500 uppercase bg-stone-800 px-3 py-2 rounded-xl">
              <Info className="w-3 h-3 text-amber-400" />
              Diff = Coût de Revient − Coût de Vente
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="bg-stone-50 border-b border-stone-100 text-stone-400">
                  <th className="px-6 py-3.5 text-left text-[9px] font-black uppercase tracking-widest">Dossier</th>
                  <th
                    onClick={() => handleSort('arrivalDate')}
                    className="px-4 py-3.5 text-[9px] font-black uppercase tracking-widest cursor-pointer select-none text-left"
                  >
                    <div className="flex items-center gap-1">Date Arrivée <SortIcon k="arrivalDate" /></div>
                  </th>
                  <th className="px-4 py-3.5 text-[9px] font-black uppercase tracking-widest text-left">Fournisseur</th>
                  <ThBtn label="Coût de Revient" k="coutRevient" cls="text-amber-600" />
                  <ThBtn label="Coût de Vente"   k="coutVente"   cls="text-emerald-600" />
                  <ThBtn label="Différence"       k="diff"        cls="text-violet-600" />
                  <ThBtn label="%"                k="pct"         cls="text-violet-600" />
                  <th className="px-4 py-3.5 text-[9px] font-black uppercase tracking-widest text-center">Statut</th>
                </tr>
              </thead>
              <tbody>
                {sorted.length === 0 && (
                  <tr>
                    <td colSpan={8} className="text-center py-16 text-stone-300 font-black uppercase text-[10px] tracking-widest">
                      Aucun dossier — ouvrez d'abord les pages Coût de Revient et Coût de Vente
                    </td>
                  </tr>
                )}
                {sorted.map((row, idx) => {
                  const isGain = (row.diff ?? 0) <= 0; // revient <= vente = gain (diff négatif)
                  const hasRevient = row.revient !== null;
                  const hasVente   = row.vente   !== null;
                  return (
                    <tr
                      key={row.id}
                      className={`border-b border-stone-50 transition-colors hover:bg-stone-50/60 ${idx % 2 === 0 ? '' : 'bg-stone-50/20'}`}
                    >
                      {/* Dossier ID */}
                      <td className="px-6 py-4">
                        <p className="font-black text-stone-900 uppercase text-[12px] tracking-tight">{row.id}</p>
                      </td>

                      {/* Date */}
                      <td className="px-4 py-4">
                        <p className="text-[10px] font-bold text-stone-500">{row.arrivalDate}</p>
                      </td>

                      {/* Supplier */}
                      <td className="px-4 py-4">
                        <p className="text-[10px] font-bold text-stone-500 max-w-[120px] truncate">{row.supplier}</p>
                      </td>

                      {/* Coût de Revient */}
                      <td className="px-4 py-4 text-right bg-amber-50/30">
                        {hasRevient ? (
                          <div>
                            <p className="font-black text-amber-700 text-[13px]">{fmt(row.revient!)}</p>
                            <p className="text-[8px] font-bold text-amber-400 uppercase">MAD</p>
                          </div>
                        ) : (
                          <span className="text-[9px] font-bold text-stone-300 flex items-center gap-1 justify-end">
                            <Calculator className="w-3 h-3" /> Non calculé
                          </span>
                        )}
                      </td>

                      {/* Coût de Vente */}
                      <td className="px-4 py-4 text-right bg-emerald-50/30">
                        {hasVente ? (
                          <div>
                            <p className="font-black text-emerald-700 text-[13px]">{fmt(row.vente!)}</p>
                            <p className="text-[8px] font-bold text-emerald-400 uppercase">MAD</p>
                          </div>
                        ) : (
                          <span className="text-[9px] font-bold text-stone-300 flex items-center gap-1 justify-end">
                            <ShoppingCart className="w-3 h-3" /> Non calculé
                          </span>
                        )}
                      </td>

                      {/* Différence */}
                      <td className="px-4 py-4 text-right">
                        {row.diff !== null ? (
                          <div>
                            <p className={`font-black text-[14px] leading-none ${isGain ? 'text-emerald-600' : 'text-red-600'}`}>
                              {fmt(row.diff)}
                            </p>
                            <p className={`text-[8px] font-bold uppercase mt-0.5 ${isGain ? 'text-emerald-400' : 'text-red-400'}`}>MAD</p>
                          </div>
                        ) : (
                          <span className="text-stone-300 text-[9px]">—</span>
                        )}
                      </td>

                      {/* % */}
                      <td className="px-4 py-4 text-right">
                        {row.pct !== null ? (
                          <span className={`inline-flex items-center gap-0.5 px-2 py-1 rounded-lg text-[10px] font-black ${
                            isGain ? 'bg-emerald-50 text-emerald-700' : 'bg-red-50 text-red-700'
                          }`}>
                            {isGain ? <TrendingUp className="w-3 h-3" /> : <TrendingDown className="w-3 h-3" />}
                            {fmtPct(row.pct)}
                          </span>
                        ) : (
                          <span className="text-stone-300 text-[9px]">—</span>
                        )}
                      </td>

                      {/* Statut */}
                      <td className="px-4 py-4 text-center">
                        {!row.hasData ? (
                          <span className="inline-flex items-center gap-1 px-2 py-1 rounded-lg bg-stone-100 text-stone-400 text-[8px] font-black uppercase">
                            En attente
                          </span>
                        ) : row.diff === null ? (
                          <span className="inline-flex items-center gap-1 px-2 py-1 rounded-lg bg-amber-50 text-amber-600 text-[8px] font-black uppercase">
                            Incomplet
                          </span>
                        ) : isGain ? (
                          <span className="inline-flex items-center gap-1 px-2 py-1 rounded-lg bg-emerald-50 text-emerald-700 text-[8px] font-black uppercase">
                            <TrendingUp className="w-2.5 h-2.5" /> Gain
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 px-2 py-1 rounded-lg bg-red-50 text-red-700 text-[8px] font-black uppercase">
                            <TrendingDown className="w-2.5 h-2.5" /> Perte
                          </span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>

              {/* Footer total row */}
              {withData.length > 1 && (
                <tfoot>
                  <tr className="bg-stone-900 text-white">
                    <td colSpan={3} className="px-6 py-4 font-black text-[11px] uppercase tracking-widest text-stone-300">
                      TOTAL — {withData.length} dossiers
                    </td>
                    <td className="px-4 py-4 text-right bg-amber-900/30">
                      <p className="font-black text-amber-300 text-[13px]">{fmt(totalRevient)}</p>
                      <p className="text-[8px] text-amber-500 font-bold uppercase">MAD</p>
                    </td>
                    <td className="px-4 py-4 text-right bg-emerald-900/20">
                      <p className="font-black text-emerald-300 text-[13px]">{fmt(totalVente)}</p>
                      <p className="text-[8px] text-emerald-500 font-bold uppercase">MAD</p>
                    </td>
                    <td className="px-4 py-4 text-right">
                      <p className={`font-black text-[14px] leading-none ${totalDiff <= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                        {fmt(totalDiff)}
                      </p>
                      <p className="text-[8px] text-stone-500 font-bold uppercase">MAD</p>
                    </td>
                    <td className="px-4 py-4 text-right">
                      <span className={`font-black text-[12px] ${totalDiff <= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                        {fmtPct(totalPct)}
                      </span>
                    </td>
                    <td />
                  </tr>
                </tfoot>
              )}
            </table>
          </div>

          {/* Legend */}
          <div className="px-6 py-4 bg-stone-50 border-t border-stone-100 flex flex-wrap gap-6 text-[9px] font-bold text-stone-400 uppercase">
            <span className="flex items-center gap-1.5 text-amber-600"><span className="w-3 h-3 rounded-sm bg-amber-100 inline-block" /> Coût de Revient (pages Coût Revient)</span>
            <span className="flex items-center gap-1.5 text-emerald-600"><span className="w-3 h-3 rounded-sm bg-emerald-100 inline-block" /> Coût de Vente (page Coût Vente)</span>
            <span className="flex items-center gap-1.5"><span className="w-3 h-3 rounded-sm bg-violet-100 inline-block" /> Différence = Revient − Vente (négatif = gain)</span>
            <span className="ml-auto italic normal-case text-stone-300">
              Les totaux sont automatiquement mis à jour en visitant les pages Coût de Revient et Coût de Vente
            </span>
          </div>
        </div>
      )}
    </div>
  );
}

function KpiCard({ label, value, sub, color }: { label: string; value: string; sub: string; color: string }) {
  return (
    <div className="bg-white/5 border border-white/10 p-4 rounded-2xl">
      <p className="text-[8px] font-black text-stone-400 uppercase tracking-widest mb-1">{label}</p>
      <p className={`text-xl font-black leading-none ${color}`}>{value}</p>
      <p className="text-[8px] font-bold text-stone-500 mt-1 uppercase">{sub}</p>
    </div>
  );
}
