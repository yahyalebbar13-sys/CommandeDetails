"use client";

import React, { useState, useEffect, useMemo } from 'react';
import { useFirebase } from '@/firebase';
import { collection, getDocs } from 'firebase/firestore';
import {
  TrendingUp, TrendingDown, BarChart3, Package, Minus,
  Calculator, ShoppingCart, ChevronUp, ChevronDown, Loader2, Info,
  Lock, Unlock
} from 'lucide-react';

interface ReconciliationViewProps {
  factures: any[];
  articles: any[];
  subCategories: any[];
  generalCategories: any[];
}

type SortKey = 'arrivalDate' | 'coutRevient' | 'coutVente' | 'marge' | 'margePercent';
type SortDir = 'asc' | 'desc';

const MARGE_VENTE = 0.05;

export default function ReconciliationView({ factures, articles, subCategories, generalCategories }: ReconciliationViewProps) {
  const { user, firestore } = useFirebase();
  const [dpData, setDpData] = useState<Record<string, any>>({});
  const [loading, setLoading] = useState(true);
  const [sortKey, setSortKey] = useState<SortKey>('arrivalDate');
  const [sortDir, setSortDir] = useState<SortDir>('desc');

  // Load all dp_declarations (overrides, puMap, locked values)
  useEffect(() => {
    if (!user || !firestore) return;
    setLoading(true);
    getDocs(collection(firestore, 'users', user.uid, 'dp_declarations'))
      .then(snap => {
        const map: Record<string, any> = {};
        snap.docs.forEach(d => { map[d.id] = d.data(); });
        setDpData(map);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [user, firestore]);

  // ── Compute live values for every facture ──
  const rows = useMemo(() => {
    return factures.map(f => {
      const dp = dpData[f.id] || {};
      const overrides = dp.overrides || {};
      const puMap = dp.puMap || {};

      // Locked values take priority
      const lockedRevient = dp.coutRevientLocked ? Number(dp.coutRevientLockedValue) || null : null;
      const lockedVente = dp.coutVenteLocked ? Number(dp.coutVenteLockedValue) || null : null;

      const dossierArticles = articles
        .filter(a => a.factureId === f.id)
        .sort((a, b) => (a.categoryId || '').localeCompare(b.categoryId || ''));

      // ── Taux de change ──
      const invoicePaidDhs = Number(f.invoicePaidDhs) || 0;
      const declaredValue = Number(f.declaredValue) || 0;
      const tauxChange = declaredValue > 0 ? invoicePaidDhs / declaredValue : 0;

      // ── COÛT DE REVIENT (same logic as cost-analysis-view) ──
      let liveRevient: number | null = null;
      if (dossierArticles.length > 0 && tauxChange > 0) {
        const exchange = Number(f.exchangeInvoiceAmount) || 0;
        const transitaire = Number(f.supplierInvoiceAmount) || 0;
        const fraisSupp = Number(f.additionalCostsAmount) || 0;
        const fretMad = (Number(f.freightCost) || 0) * tauxChange;
        const mtFraisTotal = (exchange + transitaire + fraisSupp + fretMad) / 1.20;
        const cbmTotal = dossierArticles.reduce((s, a) => s + (Number(a.cubicMeasurement) || 0), 0);

        let total = 0;
        let hasData = false;

        dossierArticles.forEach(a => {
          const ov = overrides[a.id] || {};
          const cbm = (ov.cubicMeasurement != null ? Number(ov.cubicMeasurement) : Number(a.cubicMeasurement)) || 0;
          const nw = (ov.netWeight != null ? Number(ov.netWeight) : Number(a.netWeight)) || 0;
          const qty = (ov.quantity != null ? Number(ov.quantity) : Number(a.quantity)) || 0;
          const fraisCmd = cbmTotal > 0 ? (cbm / cbmTotal) * mtFraisTotal : 0;

          const cat = subCategories.find(c => c.name === a.categoryId);
          const customsValuePerKg = ov.customsValuePerKg != null
            ? Number(ov.customsValuePerKg)
            : (cat?.customsValuePerKg != null ? Number(cat.customsValuePerKg) : null);
          const importDutyRate = ov.importDutyRate != null
            ? Number(ov.importDutyRate) / 100
            : (cat?.importDutyRate != null ? Number(cat.importDutyRate) / 100 : null);
          const tpiRate = ov.tpiRate != null
            ? Number(ov.tpiRate) / 100
            : (cat?.tpiRate != null ? Number(cat.tpiRate) / 100 : null);
          const ticRate = ov.ticRate != null
            ? Number(ov.ticRate) / 100
            : (cat?.ticRate != null ? Number(cat.ticRate) / 100 : null);
          const tvaRate = ov.tvaRate != null
            ? Number(ov.tvaRate) / 100
            : (cat?.tvaRate != null ? Number(cat.tvaRate) / 100 : null);

          if (customsValuePerKg !== null) {
            hasData = true;
            const valDouane = nw * customsValuePerKg;
            const di = importDutyRate != null ? valDouane * importDutyRate : 0;
            const tpi = tpiRate != null ? valDouane * tpiRate : 0;
            const tic = ticRate != null ? valDouane * ticRate : 0;
            const tva = tvaRate != null ? (valDouane + di + tpi + tic) * tvaRate : 0;
            const totalDouane = di + tpi + tic + tva;

            const pauDollar = (ov.purchasePricePerUnit != null ? Number(ov.purchasePricePerUnit) : Number(a.purchasePricePerUnit)) || 0;
            const valAchatMad = qty * pauDollar * tauxChange;
            total += valAchatMad + fraisCmd + totalDouane;
          }
        });

        if (hasData) liveRevient = total;
      }

      // ── COÛT DE VENTE (same logic as cost-sale-view) ──
      let liveVente: number | null = null;
      if (dossierArticles.length > 0 && tauxChange > 0) {
        // Group by generalCategory (same as cost-sale-view)
        const groups = new Map<string, { qty: number; nw: number; cbm: number; unit: string; firstCatName: string; genCatId: string; isGrouped: boolean; firstOverride: any }>();
        dossierArticles.forEach(a => {
          const ov = overrides[a.id] || {};
          const genCatId = a.generalCategoryId || '';
          const catName = a.categoryId || '';
          const key = genCatId || catName;
          const existing = groups.get(key);
          const qty = (ov.quantity != null ? Number(ov.quantity) : Number(a.quantity)) || 0;
          const nw = (ov.netWeight != null ? Number(ov.netWeight) : Number(a.netWeight)) || 0;
          const cbm = (ov.cubicMeasurement != null ? Number(ov.cubicMeasurement) : Number(a.cubicMeasurement)) || 0;
          const unit = a.unit || 'PCS';
          if (existing) {
            existing.qty += qty;
            existing.nw += nw;
            existing.cbm += cbm;
          } else {
            groups.set(key, { qty, nw, cbm, unit, firstCatName: catName, genCatId, isGrouped: !!genCatId, firstOverride: Object.keys(ov).length > 0 ? ov : null });
          }
        });

        const categoryLines = Array.from(groups.entries()).map(([, g]) => {
          const effectiveQty = g.isGrouped ? g.nw : g.qty;
          const displayId = g.genCatId ? (generalCategories.find((gc: any) => gc.id === g.genCatId)?.name || g.genCatId) : g.firstCatName;
          const cat = subCategories.find((c: any) => c.name === g.firstCatName);
          return { categoryId: displayId, totalQty: effectiveQty, totalNW: g.nw, totalCBM: g.cbm, unit: g.unit, cat, ov: g.firstOverride };
        });

        const exchange = Number(f.exchangeInvoiceAmount) || 0;
        const transitaire = Number(f.supplierInvoiceAmount) || 0;
        const fraisSupp = Number(f.additionalCostsAmount) || 0;
        const mtFraisTotal = (exchange + transitaire + fraisSupp) / 1.20; // Fret exclu du coût de vente
        const cbmTotal = categoryLines.reduce((s, l) => s + l.totalCBM, 0);

        let totalVente = 0;
        let hasVenteData = false;

        categoryLines.forEach(line => {
          const puDollar = parseFloat(puMap[line.categoryId] ?? '') || 0;
          if (puDollar === 0) return;

          const { totalQty: qty, totalNW: nw, totalCBM: cbm, cat, ov } = line;
          const valAchatMad = qty * puDollar * tauxChange;
          const fraisCmd = cbmTotal > 0 ? (cbm / cbmTotal) * mtFraisTotal : 0;

          const customsValuePerKg = ov?.customsValuePerKg != null
            ? Number(ov.customsValuePerKg)
            : (cat?.customsValuePerKg != null ? Number(cat.customsValuePerKg) : null);
          const importDutyRate = ov?.importDutyRate != null
            ? Number(ov.importDutyRate) / 100
            : (cat?.importDutyRate != null ? Number(cat.importDutyRate) / 100 : null);
          const tpiRate = ov?.tpiRate != null
            ? Number(ov.tpiRate) / 100
            : (cat?.tpiRate != null ? Number(cat.tpiRate) / 100 : null);
          const ticRate = ov?.ticRate != null
            ? Number(ov.ticRate) / 100
            : (cat?.ticRate != null ? Number(cat.ticRate) / 100 : null);
          const tvaRate = ov?.tvaRate != null
            ? Number(ov.tvaRate) / 100
            : (cat?.tvaRate != null ? Number(cat.tvaRate) / 100 : null);

          if (customsValuePerKg !== null) {
            hasVenteData = true;
            const valDouane = nw * customsValuePerKg;
            const di = importDutyRate != null ? valDouane * importDutyRate : 0;
            const tpi = tpiRate != null ? valDouane * tpiRate : 0;
            const tic = ticRate != null ? valDouane * ticRate : 0;
            const totalHT = valAchatMad + fraisCmd + di + tpi + tic;
            const marge = totalHT * MARGE_VENTE;
            const baseTva = valDouane + di + tpi + tic + fraisCmd;
            const tva = tvaRate != null ? baseTva * tvaRate : 0;
            totalVente += totalHT + marge + tva;
          }
        });

        if (hasVenteData) liveVente = totalVente;
      }

      // Use locked values if available, otherwise live
      const revient = lockedRevient ?? liveRevient;
      const vente = lockedVente ?? liveVente;
      const marge = revient !== null && vente !== null ? vente - revient : null;
      const margePercent = revient !== null && revient > 0 && marge !== null ? (marge / revient) * 100 : null;

      return {
        id: f.id,
        arrivalDate: f.arrivalDate || '—',
        supplier: f.supplierId || f.shippingLine || '—',
        revient,
        vente,
        marge,
        margePercent,
        hasData: revient !== null || vente !== null,
        isLockedRevient: lockedRevient !== null,
        isLockedVente: lockedVente !== null,
        isLive: lockedRevient === null || lockedVente === null,
        articleCount: dossierArticles.length,
      };
    });
  }, [factures, articles, subCategories, generalCategories, dpData]);

  // Sort
  const sorted = useMemo(() => {
    return [...rows].sort((a, b) => {
      let va: any, vb: any;
      if (sortKey === 'arrivalDate') { va = a.arrivalDate; vb = b.arrivalDate; }
      else if (sortKey === 'coutRevient') { va = a.revient ?? -Infinity; vb = b.revient ?? -Infinity; }
      else if (sortKey === 'coutVente')   { va = a.vente   ?? -Infinity; vb = b.vente   ?? -Infinity; }
      else if (sortKey === 'marge')       { va = a.marge   ?? -Infinity; vb = b.marge   ?? -Infinity; }
      else                               { va = a.margePercent ?? -Infinity; vb = b.margePercent ?? -Infinity; }
      if (va < vb) return sortDir === 'asc' ? -1 : 1;
      if (va > vb) return sortDir === 'asc' ?  1 : -1;
      return 0;
    });
  }, [rows, sortKey, sortDir]);

  // Global KPIs
  const withData = rows.filter(r => r.revient !== null && r.vente !== null);
  const totalRevient = withData.reduce((s, r) => s + (r.revient ?? 0), 0);
  const totalVente   = withData.reduce((s, r) => s + (r.vente   ?? 0), 0);
  const totalMarge   = totalVente - totalRevient;
  const totalPct     = totalRevient > 0 ? (totalMarge / totalRevient) * 100 : 0;
  const gainCount    = withData.filter(r => (r.marge ?? 0) >= 0).length;
  const perteCount   = withData.filter(r => (r.marge ?? 0) < 0).length;
  const noDataCount  = rows.filter(r => !r.hasData).length;

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
              Marge = Coût de Vente TTC − Coût de Revient TTC · Valeurs calculées en temps réel depuis les articles
            </p>
          </div>

          {/* Global KPIs */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 w-full lg:w-auto">
            <KpiCard label="Coût de Revient" value={fmt(totalRevient)} sub="MAD" color="text-amber-400" />
            <KpiCard label="Coût de Vente"   value={fmt(totalVente)}   sub="MAD" color="text-emerald-400" />
            <div className={`p-4 rounded-2xl border ${totalMarge >= 0 ? 'bg-emerald-600/20 border-emerald-500/30' : 'bg-red-600/20 border-red-500/30'}`}>
              <p className="text-[8px] font-black text-stone-400 uppercase tracking-widest mb-1">Marge Globale</p>
              <p className={`text-xl font-black leading-none ${totalMarge >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                {fmt(totalMarge)}
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
              <p className="text-[8px] font-bold text-stone-500 mt-1">{withData.length} avec données · {noDataCount} en attente</p>
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
              Marge = Vente TTC − Revient TTC · Positif = bénéfice
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
                  <th className="px-4 py-3.5 text-[9px] font-black uppercase tracking-widest text-center">Articles</th>
                  <ThBtn label="Coût de Revient" k="coutRevient" cls="text-amber-600" />
                  <ThBtn label="Coût de Vente"   k="coutVente"   cls="text-emerald-600" />
                  <ThBtn label="Marge"            k="marge"       cls="text-violet-600" />
                  <ThBtn label="%"                k="margePercent" cls="text-violet-600" />
                  <th className="px-4 py-3.5 text-[9px] font-black uppercase tracking-widest text-center">Source</th>
                </tr>
              </thead>
              <tbody>
                {sorted.length === 0 && (
                  <tr>
                    <td colSpan={9} className="text-center py-16 text-stone-300 font-black uppercase text-[10px] tracking-widest">
                      Aucun dossier
                    </td>
                  </tr>
                )}
                {sorted.map((row, idx) => {
                  const isProfit = (row.marge ?? 0) >= 0;
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

                      {/* Articles count */}
                      <td className="px-4 py-4 text-center">
                        <span className="inline-flex items-center gap-1 px-2 py-1 rounded-lg bg-stone-100 text-stone-500 text-[9px] font-black">
                          <Package className="w-2.5 h-2.5" /> {row.articleCount}
                        </span>
                      </td>

                      {/* Coût de Revient */}
                      <td className="px-4 py-4 text-right bg-amber-50/30">
                        {hasRevient ? (
                          <div className="flex items-center justify-end gap-1.5">
                            {row.isLockedRevient && <Lock className="w-2.5 h-2.5 text-amber-400" />}
                            <div>
                              <p className="font-black text-amber-700 text-[13px]">{fmt(row.revient!)}</p>
                              <p className="text-[8px] font-bold text-amber-400 uppercase">MAD</p>
                            </div>
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
                          <div className="flex items-center justify-end gap-1.5">
                            {row.isLockedVente && <Lock className="w-2.5 h-2.5 text-emerald-400" />}
                            <div>
                              <p className="font-black text-emerald-700 text-[13px]">{fmt(row.vente!)}</p>
                              <p className="text-[8px] font-bold text-emerald-400 uppercase">MAD</p>
                            </div>
                          </div>
                        ) : (
                          <span className="text-[9px] font-bold text-stone-300 flex items-center gap-1 justify-end">
                            <ShoppingCart className="w-3 h-3" /> Non calculé
                          </span>
                        )}
                      </td>

                      {/* Marge */}
                      <td className="px-4 py-4 text-right">
                        {row.marge !== null ? (
                          <div>
                            <p className={`font-black text-[14px] leading-none ${isProfit ? 'text-emerald-600' : 'text-red-600'}`}>
                              {fmt(row.marge)}
                            </p>
                            <p className={`text-[8px] font-bold uppercase mt-0.5 ${isProfit ? 'text-emerald-400' : 'text-red-400'}`}>MAD</p>
                          </div>
                        ) : (
                          <span className="text-stone-300 text-[9px]">—</span>
                        )}
                      </td>

                      {/* % */}
                      <td className="px-4 py-4 text-right">
                        {row.margePercent !== null ? (
                          <span className={`inline-flex items-center gap-0.5 px-2 py-1 rounded-lg text-[10px] font-black ${
                            isProfit ? 'bg-emerald-50 text-emerald-700' : 'bg-red-50 text-red-700'
                          }`}>
                            {isProfit ? <TrendingUp className="w-3 h-3" /> : <TrendingDown className="w-3 h-3" />}
                            {fmtPct(row.margePercent)}
                          </span>
                        ) : (
                          <span className="text-stone-300 text-[9px]">—</span>
                        )}
                      </td>

                      {/* Source */}
                      <td className="px-4 py-4 text-center">
                        {!row.hasData ? (
                          <span className="inline-flex items-center gap-1 px-2 py-1 rounded-lg bg-stone-100 text-stone-400 text-[8px] font-black uppercase">
                            En attente
                          </span>
                        ) : row.isLockedRevient && row.isLockedVente ? (
                          <span className="inline-flex items-center gap-1 px-2 py-1 rounded-lg bg-violet-50 text-violet-700 text-[8px] font-black uppercase">
                            <Lock className="w-2.5 h-2.5" /> Verrouillé
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 px-2 py-1 rounded-lg bg-blue-50 text-blue-600 text-[8px] font-black uppercase">
                            <Unlock className="w-2.5 h-2.5" /> Live
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
                    <td colSpan={4} className="px-6 py-4 font-black text-[11px] uppercase tracking-widest text-stone-300">
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
                      <p className={`font-black text-[14px] leading-none ${totalMarge >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                        {fmt(totalMarge)}
                      </p>
                      <p className="text-[8px] text-stone-500 font-bold uppercase">MAD</p>
                    </td>
                    <td className="px-4 py-4 text-right">
                      <span className={`font-black text-[12px] ${totalMarge >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
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
            <span className="flex items-center gap-1.5 text-amber-600"><span className="w-3 h-3 rounded-sm bg-amber-100 inline-block" /> Coût de Revient TTC (achats + frais + douane + TVA)</span>
            <span className="flex items-center gap-1.5 text-emerald-600"><span className="w-3 h-3 rounded-sm bg-emerald-100 inline-block" /> Coût de Vente TTC (achats + frais + douane + marge 5% + TVA)</span>
            <span className="flex items-center gap-1.5"><span className="w-3 h-3 rounded-sm bg-violet-100 inline-block" /> Marge = Vente − Revient (positif = bénéfice)</span>
            <span className="flex items-center gap-1.5 ml-auto normal-case italic text-stone-300">
              <Lock className="w-3 h-3" /> = valeur verrouillée · <Unlock className="w-3 h-3" /> = calcul en temps réel
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
