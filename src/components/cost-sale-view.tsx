"use client";

import React, { useMemo, useState, useEffect } from 'react';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import {
  ShoppingCart, ChevronDown, AlertTriangle, Info, FileDown, Loader2, TrendingUp, DollarSign, FileText, Package, ShieldCheck, XCircle
} from 'lucide-react';
import { exportCostSalePDF, exportCoutVenteSimplePDF } from '@/lib/pdf-export';
import { useFirebase } from '@/firebase';
import { doc, getDoc, getDocs, collection, setDoc } from 'firebase/firestore';
import { ArticleOverride } from './article-override-modal';

// The 4 checklist IDs that must all be true to unlock a dossier in Cost Sale
const REQUIRED_CHECKS = ['douane_ok', 'facture_mad_ok', 'nw_cbm_ok', 'dp_ok'];

const MARGE_RATE = 0.05;

interface CostSaleViewProps {
  articles: any[];
  factures: any[];
  subCategories: any[];
  generalCategories: any[];
}

export default function CostSaleView({ articles, factures, subCategories, generalCategories }: CostSaleViewProps) {
  const { user, firestore } = useFirebase();

  // ── Checklist state: map of factureId -> checks object ──
  const [checklists, setChecklists] = useState<Record<string, Record<string, boolean>>>({});
  const [checklistsLoaded, setChecklistsLoaded] = useState(false);

  // Load all checklists once — stored under users/{uid}/checklists/
  useEffect(() => {
    if (!firestore || !user) return;
    getDocs(collection(firestore, 'users', user.uid, 'checklists'))
      .then(snap => {
        const result: Record<string, Record<string, boolean>> = {};
        snap.docs.forEach(d => { result[d.id] = d.data().checks || {}; });
        setChecklists(result);
      })
      .catch(() => {})
      .finally(() => setChecklistsLoaded(true));
  }, [firestore, user]);

  // A dossier is visible in Coût de Vente ONLY when the user has manually checked all 4 items
  const isFactureValidated = (f: any): boolean => {
    const c = checklists[f.id] || {};
    return !!c['douane_ok'] && !!c['facture_mad_ok'] && !!c['nw_cbm_ok'] && !!c['dp_ok'];
  };

  // ── Only show validated factures ──
  const validatedFactures = useMemo(
    () => checklistsLoaded ? factures.filter(isFactureValidated) : [],
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [factures, checklists, checklistsLoaded]
  );


  const [selectedFactureId, setSelectedFactureId] = useState<string | null>(null);

  // Auto-select first validated dossier when list loads
  useEffect(() => {
    if (checklistsLoaded && validatedFactures.length > 0 && !selectedFactureId) {
      setSelectedFactureId(validatedFactures[0].id);
    }
  }, [checklistsLoaded, validatedFactures, selectedFactureId]);

  const [puMap, setPuMap] = useState<Record<string, string>>({});
  // overrides from cost-analysis (persisted in Firebase under dp_declarations/{id}.overrides)
  const [overrides, setOverrides] = useState<Record<string, ArticleOverride>>({});
  const [loading, setLoading] = useState(false);

  const selectedFacture = useMemo(
    () => validatedFactures.find(f => f.id === selectedFactureId) || null,
    [validatedFactures, selectedFactureId]
  );

  // Load saved DP puMap AND overrides from Firebase when dossier changes
  useEffect(() => {
    if (!selectedFactureId || !firestore || !user) return;
    setLoading(true);
    setPuMap({});
    setOverrides({});
    getDoc(doc(firestore, 'users', user.uid, 'dp_declarations', selectedFactureId))
      .then(snap => {
        if (snap.exists()) {
          const data = snap.data();
          if (data.puMap) setPuMap(data.puMap);
          if (data.overrides) setOverrides(data.overrides);
        }
      })
      .catch(err => console.error('DP load error:', err))
      .finally(() => setLoading(false));
  }, [selectedFactureId, firestore, user]);

  // ── Only Zipper and Slider are grouped by generalCategoryId (pole).
  // All other categories stay as individual sub-categories (PS).
  const isPoleCategory = (catName: string, genCatName: string): boolean => {
    const upper = (catName + ' ' + genCatName).toUpperCase();
    return upper.includes('ZIPPER') || upper.includes('SLIDER');
  };

  // Build per-category lines. Also collect the first override found for each category key,
  // so customs overrides from cost-analysis propagate into cost-sale.
  const categoryLines = useMemo(() => {
    if (!selectedFactureId) return [];
    const dossierArticles = articles.filter(a => a.factureId === selectedFactureId);
    type MapEntry = { qty: number; nw: number; cbm: number; unit: string; firstCatName: string; genCatId: string | null; isGrouped: boolean; firstOverride: ArticleOverride | null; sizes: Set<string>; colors: Set<string> };
    const map: Record<string, MapEntry> = {};
    for (const a of dossierArticles) {
      const rawCat = a.categoryId || '—';
      const subCat = subCategories.find((c: any) => c.name === rawCat);
      const genCatId: string | null = subCat?.generalCategoryId || a.generalCategoryId || null;
      const genCatName = genCatId ? (generalCategories.find((g: any) => g.id === genCatId)?.name || '') : '';
      // Only group by pole if the category is Zipper or Slider
      const shouldGroup = !!genCatId && isPoleCategory(rawCat, genCatName);
      const key = shouldGroup ? `GEN:${genCatId}` : rawCat;
      const isGrouped = shouldGroup;
      // Capture first override for this category key
      const articleOverride: ArticleOverride | null = overrides[a.id] ? overrides[a.id] : null;
      if (!map[key]) map[key] = { qty: 0, nw: 0, cbm: 0, unit: isGrouped ? 'KG' : (a.unitOfMeasure || 'U'), firstCatName: rawCat, genCatId: isGrouped ? genCatId : null, isGrouped, firstOverride: articleOverride, sizes: new Set(), colors: new Set() };
      map[key].qty += Number(a.quantity) || 0;
      map[key].nw += Number(a.netWeight) || 0;
      map[key].cbm += Number(a.cubicMeasurement) || 0;
      // Collect unique sizes and colors
      if (a.size && a.size !== 'various') map[key].sizes.add(a.size.toUpperCase());
      if (a.color && a.color !== 'various') map[key].colors.add(a.color.toUpperCase());
      // If no override captured yet for this key, grab it from this article
      if (!map[key].firstOverride && articleOverride) map[key].firstOverride = articleOverride;
    }
    return Object.entries(map)
      .sort(([, a], [, b]) => {
        const aName = a.genCatId ? (generalCategories.find((g: any) => g.id === a.genCatId)?.name || a.firstCatName) : a.firstCatName;
        const bName = b.genCatId ? (generalCategories.find((g: any) => g.id === b.genCatId)?.name || b.firstCatName) : b.firstCatName;
        return aName.localeCompare(bName);
      })
      .map(([, { qty, nw, cbm, unit, firstCatName, genCatId, isGrouped, firstOverride, sizes, colors }]) => {
        const effectiveQty = isGrouped ? nw : qty;
        const displayId = genCatId ? (generalCategories.find((g: any) => g.id === genCatId)?.name || genCatId) : firstCatName;
        const cat = subCategories.find((c: any) => c.name === firstCatName);
        // Unique size: show only if all articles share the same single size
        const uniqueSize = sizes.size === 1 ? [...sizes][0] : null;
        // Unique color: show only if all articles share the same single color
        const uniqueColor = colors.size === 1 ? [...colors][0] : null;
        return { categoryId: displayId, totalQty: effectiveQty, totalNW: nw, totalCBM: cbm, unit, cat, isPole: isGrouped, ov: firstOverride, uniqueSize, uniqueColor };
      });
  }, [articles, selectedFactureId, subCategories, generalCategories, overrides]);

  const analysis = useMemo(() => {
    if (!selectedFacture || categoryLines.length === 0) return null;

    const invoicePaidDhs = Number(selectedFacture.invoicePaidDhs) || 0;
    const declaredValue = Number(selectedFacture.declaredValue) || 0;
    const tauxChange = declaredValue > 0 ? invoicePaidDhs / declaredValue : 0;

    const exchange = Number(selectedFacture.exchangeInvoiceAmount) || 0;
    const transitaire = Number(selectedFacture.supplierInvoiceAmount) || 0;
    const fraisSupp = Number(selectedFacture.additionalCostsAmount) || 0;
    // Fret maritime exclu du coût de vente
    const mtFraisTotal = (exchange + transitaire + fraisSupp) / 1.20;

    const cbmTotal = categoryLines.reduce((s, l) => s + l.totalCBM, 0);

    const rows = categoryLines.map(line => {
      const { categoryId, totalQty: qty, totalNW: nw, totalCBM: cbm, unit, cat, ov } = line;

      // PU from DP declaration (USD)
      const puDollar = parseFloat(puMap[categoryId] ?? '') || 0;
      const valAchatMad = qty * puDollar * tauxChange;

      // Logistics prorated by CBM
      const fraisCmd = cbmTotal > 0 ? (cbm / cbmTotal) * mtFraisTotal : 0;

      // Customs: override (from cost-analysis) takes priority over category defaults
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
      const hasCustData = customsValuePerKg !== null;
      const hasOverride = !!(ov && Object.keys(ov).length > 0);

      const valDouane = hasCustData ? nw * customsValuePerKg! : 0;
      const di = importDutyRate != null ? valDouane * importDutyRate : 0;
      const tpi = tpiRate != null ? valDouane * tpiRate : 0;
      const tic = ticRate != null ? valDouane * ticRate : 0;

      // Total HT = Valeur Achat + Frais Log + DI + TPI + TIC
      const totalHT = hasCustData ? valAchatMad + fraisCmd + di + tpi + tic : 0;
      const marge = hasCustData ? totalHT * MARGE_RATE : 0;

      // Base TVA = Valeur Douane + DI + TPI + Frais Log (sans valeur d'achat)
      const baseTva = hasCustData ? valDouane + di + tpi + fraisCmd : 0;
      const tva = (hasCustData && tvaRate != null) ? baseTva * tvaRate : 0;

      // Total Vente TTC = Total HT + Marge + TVA
      const totalVenteTtc = hasCustData ? totalHT + marge + tva : 0;
      const pvuTtc = (hasCustData && qty > 0) ? totalVenteTtc / qty : 0;

      return {
        categoryId, qty, nw, cbm, unit, cat,
        puDollar, valAchatMad, fraisCmd,
        customsValuePerKg, importDutyRate, tpiRate, ticRate, tvaRate,
        hasCustData, valDouane, di, tpi, tic,
        totalHT, marge, baseTva, tva, totalVenteTtc, pvuTtc,
        missingDP: puDollar === 0,
        missingCust: !hasCustData,
        hasOverride,
        uniqueSize: line.uniqueSize ?? null,
        uniqueColor: line.uniqueColor ?? null,
      };
    });

    const totalMarge = rows.reduce((s, r) => s + r.marge, 0);
    const totalTVA = rows.reduce((s, r) => s + r.tva, 0);

    return { tauxChange, mtFraisTotal, cbmTotal, exchange, transitaire, fraisSupp, totalMarge, totalTVA, rows };
  }, [selectedFacture, categoryLines, subCategories, puMap]);

  // ── Persiste le total Coût de Vente dans Firebase pour la page Déclaration Provisoire ──
  useEffect(() => {
    if (!analysis || !selectedFactureId || !firestore || !user) return;
    const totalCoutVente = analysis.rows.reduce((s, r) => s + (r.totalVenteTtc || 0), 0);
    if (totalCoutVente <= 0) return;
    setDoc(
      doc(firestore, 'users', user.uid, 'dp_declarations', selectedFactureId),
      { coutVenteTtcTotal: totalCoutVente },
      { merge: true }
    ).catch(() => {});
  }, [analysis, selectedFactureId, firestore, user]);

  const missingDPCount = analysis?.rows.filter(r => r.missingDP).length || 0;

  return (
    <div className="space-y-8 fade-in">
      {/* Header */}
      <header className="bg-stone-900 rounded-[2rem] p-8 shadow-2xl relative overflow-hidden">
        <div className="absolute top-0 right-0 w-[500px] h-[500px] bg-emerald-500/10 rounded-full -translate-y-1/2 translate-x-1/2 blur-[100px]" />
        <div className="relative z-10 flex flex-col lg:flex-row justify-between items-start lg:items-center gap-6">
          <div>
            <div className="flex items-center gap-3 mb-3">
              <div className="p-2.5 bg-emerald-500 rounded-xl">
                <ShoppingCart className="w-6 h-6 text-white" />
              </div>
              <div>
                <p className="text-[10px] font-black text-emerald-500 uppercase tracking-[0.2em]">Depuis Déclaration Provisoire</p>
                <h2 className="text-3xl font-black text-white tracking-tighter uppercase leading-none">Coût de Vente TTC</h2>
              </div>
            </div>
            <p className="text-stone-400 text-sm font-medium max-w-lg">
              Prix de vente par catégorie · PU issu de la Déclaration Provisoire · Marge 5% + TVA
            </p>
          </div>
          <div className="flex flex-col gap-2 w-full lg:w-auto">
            <div className="flex items-center justify-between">
              <label className="text-[10px] font-black text-stone-500 uppercase tracking-widest">Sélectionner un Dossier</label>
              <span className="flex items-center gap-1.5 text-[9px] font-black text-emerald-400 uppercase tracking-widest">
                <ShieldCheck className="w-3 h-3" /> {validatedFactures.length} dossier{validatedFactures.length !== 1 ? 's' : ''} validé{validatedFactures.length !== 1 ? 's' : ''}
              </span>
            </div>
            <div className="flex gap-3">
              <div className="relative flex-1 lg:w-72">
                <select
                  value={selectedFactureId || ''}
                  onChange={e => setSelectedFactureId(e.target.value)}
                  className="w-full bg-white/10 border border-white/20 text-white font-black uppercase text-sm rounded-xl px-4 h-12 appearance-none pr-10 focus:outline-none focus:border-emerald-500 transition-colors"
                >
                  {validatedFactures.length === 0 && (
                    <option value="" disabled className="text-stone-400 bg-white">
                      Aucun dossier validé — Vérifiez la checklist
                    </option>
                  )}
                  {validatedFactures.map(f => (
                    <option key={f.id} value={f.id} className="text-stone-900 bg-white">
                      {f.id} — {f.arrivalDate}
                    </option>
                  ))}
                </select>
                <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-stone-400 pointer-events-none" />
              </div>
              {selectedFacture && analysis && (
                <div className="flex gap-2 flex-wrap">
                  <button
                    onClick={() => exportCostSalePDF(selectedFacture, analysis.rows, analysis)}
                    className="h-12 px-4 bg-red-500 hover:bg-red-600 text-white font-black text-[9px] uppercase tracking-widest rounded-xl flex items-center gap-2 transition-colors shadow-lg shadow-red-500/20 shrink-0"
                    title="Export complet (toutes colonnes)"
                  >
                    <FileDown className="w-4 h-4" /> Complet
                  </button>
                  <button
                    onClick={() => exportCoutVenteSimplePDF(selectedFacture, analysis.rows, analysis)}
                    className="h-12 px-4 bg-emerald-600 hover:bg-emerald-700 text-white font-black text-[9px] uppercase tracking-widest rounded-xl flex items-center gap-2 transition-colors shadow-lg shadow-emerald-600/20 shrink-0"
                    title="PDF Coût de Vente TTC — version simplifiée"
                  >
                    <FileDown className="w-4 h-4" /> Prix Vente
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
      </header>

      {!selectedFacture && checklistsLoaded && validatedFactures.length === 0 && (
        <div className="py-24 text-center">
          <div className="inline-flex flex-col items-center gap-4 bg-amber-50 border border-amber-200 rounded-3xl px-12 py-10">
            <XCircle className="w-10 h-10 text-amber-400" />
            <p className="text-[13px] font-black text-amber-800 uppercase tracking-tight">Aucun dossier validé</p>
            <p className="text-[10px] font-bold text-amber-600 max-w-xs text-center leading-relaxed">
              Pour afficher un dossier ici, complétez les 4 vérifications dans l'onglet <span className="font-black">Dossiers → Vérifier le Dossier</span>.
            </p>
            <div className="grid grid-cols-2 gap-2 mt-2 text-left">
              {['Douane correcte', 'Facture MAD payée', 'NW · CBM · Facture', 'DP créée + PU'].map((t, i) => (
                <div key={i} className="flex items-center gap-2 text-[9px] font-black text-amber-700 uppercase">
                  <span className="w-5 h-5 rounded-full bg-amber-200 text-amber-700 flex items-center justify-center text-[8px] shrink-0">{i + 1}</span>
                  {t}
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {!selectedFacture && checklistsLoaded && validatedFactures.length > 0 && (
        <div className="py-32 text-center text-stone-300 font-black uppercase text-[11px] tracking-widest">
          Sélectionnez un dossier pour voir l'analyse
        </div>
      )}

      {!checklistsLoaded && (
        <div className="flex items-center justify-center py-20 gap-3">
          <Loader2 className="w-5 h-5 animate-spin text-emerald-500" />
          <span className="text-[11px] font-black text-stone-400 uppercase tracking-widest">Chargement des dossiers validés...</span>
        </div>
      )}

      {selectedFacture && loading && (
        <div className="flex items-center justify-center py-20 gap-3">
          <Loader2 className="w-6 h-6 animate-spin text-emerald-500" />
          <span className="text-[11px] font-black text-stone-400 uppercase tracking-widest">Chargement de la Déclaration Provisoire...</span>
        </div>
      )}

      {selectedFacture && !loading && analysis && (
        <>
          {/* Synthèse */}
          <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-7 gap-4">
            <SCard label="Taux de Change" value={analysis.tauxChange > 0 ? analysis.tauxChange.toFixed(4) : '—'} sub="MAD/$" color="text-blue-600" bg="bg-blue-50" icon={<TrendingUp className="w-4 h-4" />} />
            <SCard label="Fact. Échange" value={analysis.exchange.toLocaleString('fr-MA', { maximumFractionDigits: 0 })} sub="MAD" color="text-violet-600" bg="bg-violet-50" icon={<DollarSign className="w-4 h-4" />} />
            <SCard label="Fact. Transitaire" value={analysis.transitaire.toLocaleString('fr-MA', { maximumFractionDigits: 0 })} sub="MAD" color="text-purple-600" bg="bg-purple-50" icon={<FileText className="w-4 h-4" />} />
            <SCard label="Frais Supp." value={analysis.fraisSupp.toLocaleString('fr-MA', { maximumFractionDigits: 0 })} sub="MAD" color="text-rose-600" bg="bg-rose-50" icon={<Package className="w-4 h-4" />} />
            <SCard label="CBM Total" value={analysis.cbmTotal.toLocaleString('fr-MA', { maximumFractionDigits: 3 })} sub="m³" color="text-sky-600" bg="bg-sky-50" icon={<Package className="w-4 h-4" />} />
            <div className="col-span-1 bg-emerald-600 rounded-2xl p-4 flex flex-col justify-between shadow-lg shadow-emerald-600/20">
              <p className="text-[9px] font-black text-emerald-100 uppercase tracking-widest">Total Marge (5%)</p>
              <div>
                <p className="text-2xl font-black text-white leading-none">{analysis.totalMarge.toLocaleString('fr-MA', { maximumFractionDigits: 0 })}</p>
                <p className="text-[10px] font-bold text-emerald-200 mt-1">MAD</p>
              </div>
            </div>
            <div className="col-span-1 bg-amber-500 rounded-2xl p-4 flex flex-col justify-between shadow-lg shadow-amber-500/20">
              <p className="text-[9px] font-black text-amber-100 uppercase tracking-widest">Total TVA</p>
              <div>
                <p className="text-2xl font-black text-white leading-none">{analysis.totalTVA.toLocaleString('fr-MA', { maximumFractionDigits: 0 })}</p>
                <p className="text-[10px] font-bold text-amber-200 mt-1">MAD</p>
              </div>
            </div>
          </div>

          {missingDPCount > 0 && (
            <div className="flex items-start gap-3 bg-amber-50 border border-amber-200 rounded-2xl p-4">
              <AlertTriangle className="w-5 h-5 text-amber-500 shrink-0 mt-0.5" />
              <div>
                <p className="text-[11px] font-black text-amber-800 uppercase tracking-tight">
                  {missingDPCount} catégorie{missingDPCount > 1 ? 's' : ''} sans PU dans la Déclaration Provisoire
                </p>
                <p className="text-[10px] font-bold text-amber-600 mt-0.5">
                  Veuillez saisir les PU déclarés dans l'onglet "Décl. Provisoire" puis revenir ici.
                </p>
              </div>
            </div>
          )}

          {/* Table */}
          <div className="bg-white rounded-3xl shadow-xl border border-stone-100 overflow-hidden">
            <div className="bg-stone-900 px-8 py-5 flex items-center justify-between">
              <div>
                <p className="text-[9px] font-black text-stone-500 uppercase tracking-widest mb-1">Dossier {selectedFacture.id}</p>
                <h3 className="text-lg font-black text-white uppercase tracking-tight">Coût de Vente TTC par Catégorie</h3>
              </div>
              <Badge className="bg-emerald-500 text-white border-none text-[9px] font-black uppercase tracking-widest px-3 py-1">
                {analysis.rows.length} catégories
              </Badge>
            </div>

            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow className="bg-stone-50 border-b border-stone-100">
                    <TableHead className="text-[9px] font-black uppercase text-stone-400 py-4 px-6 min-w-[180px]">Catégorie</TableHead>
                    <TableHead className="text-[9px] font-black uppercase text-stone-400 py-4 text-right">QTÉ</TableHead>
                    <TableHead className="text-[9px] font-black uppercase text-stone-400 py-4 text-right">NW (kg)</TableHead>
                    <TableHead className="text-[9px] font-black uppercase text-sky-500 py-4 text-right bg-sky-50/30">Val. Achat (MAD)</TableHead>
                    <TableHead className="text-[9px] font-black uppercase text-indigo-400 py-4 text-right bg-indigo-50/30">Frais Log. (MAD)</TableHead>
                    <TableHead className="text-[9px] font-black uppercase text-orange-400 py-4 text-right bg-orange-50/30">DI (MAD)</TableHead>
                    <TableHead className="text-[9px] font-black uppercase text-orange-400 py-4 text-right bg-orange-50/30">TPI (MAD)</TableHead>
                    <TableHead className="text-[9px] font-black uppercase text-orange-400 py-4 text-right bg-orange-50/30">TIC (MAD)</TableHead>
                    <TableHead className="text-[9px] font-black uppercase text-stone-500 py-4 text-right bg-stone-50">Total HT (MAD)</TableHead>
                    <TableHead className="text-[9px] font-black uppercase text-emerald-500 py-4 text-right bg-emerald-50/40">Marge 5%</TableHead>
                    <TableHead className="text-[9px] font-black uppercase text-amber-500 py-4 text-right bg-amber-50/30">TVA (MAD)</TableHead>
                    <TableHead className="text-[9px] font-black uppercase text-emerald-700 py-4 text-right bg-emerald-50/60 pr-6">P.V.U TTC (MAD)</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {analysis.rows.length === 0 && (
                    <TableRow>
                      <TableCell colSpan={12} className="text-center py-16 text-stone-300 font-black uppercase text-[10px] tracking-widest">
                        Aucun article lié à ce dossier
                      </TableCell>
                    </TableRow>
                  )}
                  {analysis.rows.map(row => (
                    <TableRow key={row.categoryId} className={`border-stone-50 hover:bg-stone-50/50 transition-colors ${row.missingDP ? 'bg-amber-50/20' : ''}`}>
                      <TableCell className="py-4 px-6">
                        <div className="font-black text-[12px] text-stone-900 uppercase flex items-center gap-1.5">
                          {row.categoryId}
                          {row.hasOverride && (
                            <span className="inline-flex items-center gap-0.5 text-[7px] font-black text-amber-600 bg-amber-100 px-1 py-0.5 rounded uppercase">
                              <AlertTriangle className="w-2 h-2" /> Override
                            </span>
                          )}
                        </div>
                        {row.missingDP ? (
                          <span className="inline-flex items-center gap-1 text-[8px] font-black text-amber-600 bg-amber-100 px-1.5 py-0.5 rounded mt-1 uppercase">
                            <AlertTriangle className="w-2.5 h-2.5" /> PU manquant (DP)
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 text-[8px] font-black text-blue-600 bg-blue-50 px-1.5 py-0.5 rounded mt-1 uppercase">
                            {row.puDollar.toFixed(4)} USD/u · DP
                          </span>
                        )}
                      </TableCell>
                      <TableCell className="text-right font-black text-[11px] text-stone-900 py-4">
                        {row.qty.toLocaleString('fr-MA')}
                        <div className="text-[8px] text-stone-400 font-bold uppercase">{row.unit}</div>
                      </TableCell>
                      <TableCell className="text-right font-bold text-[10px] text-stone-600 py-4">
                        {row.nw > 0 ? row.nw.toLocaleString('fr-MA', { maximumFractionDigits: 2 }) : <span className="text-stone-300">—</span>}
                      </TableCell>
                      <TableCell className="text-right font-black text-[11px] text-sky-700 py-4 bg-sky-50/20">
                        {row.puDollar > 0 ? row.valAchatMad.toLocaleString('fr-MA', { maximumFractionDigits: 2 }) : <span className="text-stone-300 font-normal text-[9px]">—</span>}
                        {row.puDollar > 0 && <div className="text-[8px] text-sky-400 font-bold">{row.puDollar.toFixed(4)} $ × {analysis.tauxChange.toFixed(4)}</div>}
                      </TableCell>
                      <TableCell className="text-right font-black text-[11px] text-indigo-700 py-4 bg-indigo-50/20">
                        {row.cbm > 0 ? row.fraisCmd.toLocaleString('fr-MA', { maximumFractionDigits: 2 }) : <span className="text-stone-300 font-normal text-[9px]">CBM manquant</span>}
                      </TableCell>
                      <MCell value={row.di} ok={row.hasCustData && row.nw > 0} rate={row.importDutyRate} />
                      <MCell value={row.tpi} ok={row.hasCustData && row.nw > 0} rate={row.tpiRate} />
                      <MCell value={row.tic} ok={row.hasCustData && row.nw > 0} rate={row.ticRate} />
                      <TableCell className="text-right font-black text-[11px] text-stone-700 py-4 bg-stone-50/60">
                        {row.totalHT > 0 ? row.totalHT.toLocaleString('fr-MA', { maximumFractionDigits: 2 }) : <span className="text-stone-300 font-normal text-[9px]">—</span>}
                      </TableCell>
                      <TableCell className="text-right py-4 bg-emerald-50/30">
                        <div className="font-black text-[11px] text-emerald-600">{row.marge > 0 ? row.marge.toLocaleString('fr-MA', { maximumFractionDigits: 2 }) : <span className="text-stone-300 font-normal text-[9px]">—</span>}</div>
                        {row.marge > 0 && <div className="text-[8px] text-emerald-400 font-bold">5%</div>}
                      </TableCell>
                      <TableCell className="text-right py-4 bg-amber-50/20">
                        {row.hasCustData && row.tvaRate != null ? (
                          <div>
                            <div className="font-black text-[11px] text-amber-600">{row.tva.toLocaleString('fr-MA', { maximumFractionDigits: 2 })}</div>
                            <div className="text-[8px] text-amber-400 font-bold">{((row.tvaRate) * 100).toFixed(0)}%</div>
                          </div>
                        ) : <span className="text-stone-300 font-normal text-[9px]">—</span>}
                      </TableCell>
                      <TableCell className="text-right py-4 pr-6 bg-emerald-50/60">
                        {row.pvuTtc > 0 ? (
                          <div>
                            <p className="font-black text-base text-emerald-700 leading-none">
                              {row.pvuTtc.toLocaleString('fr-MA', { minimumFractionDigits: 2, maximumFractionDigits: 4 })}
                            </p>
                            <p className="text-[8px] font-black text-emerald-500 uppercase mt-0.5">MAD / {row.unit}</p>
                          </div>
                        ) : (
                          <span className="text-stone-300 font-normal text-[9px]">Données manquantes</span>
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>

            {/* Legend */}
            <div className="px-6 py-4 bg-stone-50 border-t border-stone-100 flex flex-wrap gap-6 text-[9px] font-bold text-stone-500 uppercase">
              <span className="flex items-center gap-1.5"><span className="w-3 h-3 rounded-sm bg-blue-200 inline-block" /> PU issu de la Déclaration Provisoire (USD)</span>
              <span className="flex items-center gap-1.5"><span className="w-3 h-3 rounded-sm bg-indigo-200 inline-block" /> Frais logistiques (CBM)</span>
              <span className="flex items-center gap-1.5"><span className="w-3 h-3 rounded-sm bg-orange-200 inline-block" /> Droits douane</span>
              <span className="flex items-center gap-1.5"><span className="w-3 h-3 rounded-sm bg-emerald-200 inline-block" /> Marge 5% + TVA</span>
              <span className="ml-auto flex items-center gap-1.5 italic normal-case text-stone-400">
                <Info className="w-3 h-3" /> PVU_TTC = (HT + Marge + TVA) ÷ Qté
              </span>
            </div>
          </div>
        </>
      )}
    </div>
  );
}

function SCard({ label, value, sub, color, bg, icon }: { label: string; value: string; sub: string; color: string; bg: string; icon: React.ReactNode }) {
  return (
    <div className={`${bg} rounded-2xl p-4 border border-white flex flex-col gap-2`}>
      <div className={`${color} flex items-center gap-1.5`}>
        {icon}
        <p className={`text-[8px] font-black uppercase tracking-widest ${color}`}>{label}</p>
      </div>
      <div>
        <p className={`text-xl font-black ${color} leading-none`}>{value}</p>
        <p className="text-[9px] font-bold text-stone-400 mt-0.5 uppercase">{sub}</p>
      </div>
    </div>
  );
}

function MCell({ value, ok, rate }: { value: number; ok: boolean; rate: number | null }) {
  if (!ok) return <TableCell className="text-right text-stone-300 text-[9px] font-normal py-4 bg-orange-50/20">—</TableCell>;
  return (
    <TableCell className="text-right font-bold text-[10px] text-orange-600 py-4 bg-orange-50/20">
      <div>{value.toLocaleString('fr-MA', { maximumFractionDigits: 2 })}</div>
      {rate != null && <div className="text-[8px] text-orange-300 font-bold">{(rate * 100).toFixed(0)}%</div>}
    </TableCell>
  );
}
