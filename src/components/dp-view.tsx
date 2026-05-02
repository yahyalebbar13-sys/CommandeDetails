"use client";

import React, { useMemo, useState, useEffect, useCallback } from 'react';
import { Badge } from '@/components/ui/badge';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow
} from '@/components/ui/table';
import {
  FileCheck, ChevronDown, Info, FileDown, Eye, EyeOff, Lightbulb, Save, CheckCircle2, Loader2,
  TrendingUp, TrendingDown, DollarSign, Calculator
} from 'lucide-react';
import { exportDPPDF } from '@/lib/pdf-export';
import { useFirebase } from '@/firebase';
import { doc, getDoc, setDoc } from 'firebase/firestore';

interface DPViewProps {
  articles: any[];
  factures: any[];
  subCategories: any[];
  generalCategories: any[];
}

export default function DPView({ articles, factures, subCategories, generalCategories }: DPViewProps) {
  const { user, firestore } = useFirebase();

  const [selectedFactureId, setSelectedFactureId] = useState<string | null>(
    factures.length > 0 ? factures[0].id : null
  );
  const [puMap, setPuMap] = useState<Record<string, string>>({});
  const [showSuggested, setShowSuggested] = useState(true);
  const [saving, setSaving] = useState(false);
  const [savedOk, setSavedOk] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [tauxChange, setTauxChange] = useState<string>('10.5');
  const [freightInput, setFreightInput] = useState<string>('');

  const selectedFacture = useMemo(
    () => factures.find(f => f.id === selectedFactureId) || null,
    [factures, selectedFactureId]
  );

  // ── Load saved PU + totaux depuis Firebase quand le dossier change ──
  const [savedCoutRevient, setSavedCoutRevient] = useState<number | null>(null);
  const [savedCoutVente, setSavedCoutVente]     = useState<number | null>(null);

  useEffect(() => {
    if (!selectedFactureId || !firestore || !user) return;
    setLoading(true);
    setSavedCoutRevient(null);
    setSavedCoutVente(null);
    setPuMap({});
    setFreightInput('');
    getDoc(doc(firestore, 'users', user.uid, 'dp_declarations', selectedFactureId))
      .then(snap => {
        if (snap.exists()) {
          const data = snap.data();
          if (data.puMap)               setPuMap(data.puMap);
          if (data.coutRevientTtcTotal) setSavedCoutRevient(Number(data.coutRevientTtcTotal));
          if (data.coutVenteTtcTotal)   setSavedCoutVente(Number(data.coutVenteTtcTotal));
          if (data.freightValue != null) setFreightInput(String(data.freightValue));
        }
      })
      .catch(err => console.error('DP load error:', err))
      .finally(() => setLoading(false));
  }, [selectedFactureId, firestore, user]);

  // ── Pole grouping: only Zipper and Slider are grouped by generalCategoryId (pole).
  // All other categories stay as individual sub-categories (PS).
  const isPoleCategory = (catName: string, genCatName: string): boolean => {
    const upper = (catName + ' ' + genCatName).toUpperCase();
    return upper.includes('ZIPPER') || upper.includes('SLIDER');
  };

  const categoryLines = useMemo(() => {
    if (!selectedFactureId) return [];
    const dossierArticles = articles.filter(a => a.factureId === selectedFactureId);

    type MapEntry = { qty: number; nw: number; unit: string; firstCatName: string; genCatId: string | null; isGrouped: boolean };
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
      if (!map[key]) map[key] = { qty: 0, nw: 0, unit: isGrouped ? 'KG' : (a.unitOfMeasure || 'U'), firstCatName: rawCat, genCatId: isGrouped ? genCatId : null, isGrouped };
      map[key].qty += Number(a.quantity) || 0;
      map[key].nw += Number(a.netWeight) || 0;
    }

    return Object.entries(map)
      .sort(([, a], [, b]) => {
        const aName = a.genCatId ? (generalCategories.find((g: any) => g.id === a.genCatId)?.name || a.firstCatName) : a.firstCatName;
        const bName = b.genCatId ? (generalCategories.find((g: any) => g.id === b.genCatId)?.name || b.firstCatName) : b.firstCatName;
        return aName.localeCompare(bName);
      })
      .map(([, { qty, nw, unit, firstCatName, genCatId, isGrouped }]) => {
        const effectiveQty = isGrouped ? nw : qty;
        const displayId = genCatId ? (generalCategories.find((g: any) => g.id === genCatId)?.name || genCatId) : firstCatName;
        const cat = subCategories.find((c: any) => c.name === firstCatName);
        const customsValuePerKg = cat?.customsValuePerKg != null ? Number(cat.customsValuePerKg) : null;
        const suggestedPU = (customsValuePerKg !== null && effectiveQty > 0)
          ? isGrouped ? customsValuePerKg : (nw * customsValuePerKg) / effectiveQty
          : null;
        return { categoryId: displayId, totalQty: effectiveQty, totalNW: nw, unit, customsValuePerKg, suggestedPU, isPole: isGrouped };
      });
  }, [articles, selectedFactureId, subCategories, generalCategories]);

  // ── Save to Firebase ──
  const handleSave = useCallback(async () => {
    if (!selectedFactureId || !firestore || !user) return;
    setSaving(true);
    setSaveError(null);
    try {
      // Compute totalMT from current puMap + categoryLines at save time
      const computedTotalMT = categoryLines.reduce((sum, line) => {
        const pu = parseFloat(puMap[line.categoryId] ?? '') || 0;
        return sum + pu * line.totalQty;
      }, 0);

      // 1. Save declaration PU map + freight value
      const freightNum = parseFloat(freightInput) || 0;
      await setDoc(
        doc(firestore, 'users', user.uid, 'dp_declarations', selectedFactureId),
        { puMap, freightValue: freightNum, savedAt: new Date().toISOString(), factureId: selectedFactureId },
        { merge: true }
      );

      // 2. Update declaredValue on the facture so the dossier reflects the new declared total
      if (computedTotalMT > 0) {
        await setDoc(
          doc(firestore, 'users', user.uid, 'factures', selectedFactureId),
          { declaredValue: computedTotalMT },
          { merge: true }
        );
      }

      setSavedOk(true);
      setTimeout(() => setSavedOk(false), 3000);
    } catch (err: any) {
      console.error('DP save error:', err);
      setSaveError(err?.message || 'Erreur de sauvegarde');
      setTimeout(() => setSaveError(null), 4000);
    } finally {
      setSaving(false);
    }
  }, [selectedFactureId, firestore, user, puMap, categoryLines, freightInput]);


  const lines = categoryLines.map(line => ({
    ...line,
    puNum: parseFloat(puMap[line.categoryId] ?? '') || 0,
    mt: (parseFloat(puMap[line.categoryId] ?? '') || 0) * line.totalQty,
  }));

  const totalQty = lines.reduce((s, l) => s + l.totalQty, 0);
  const totalMT = lines.reduce((s, l) => s + l.mt, 0);
  // Valeur déclarée en douane (USD) depuis le dossier
  const declaredValueDollar = Number(selectedFacture?.declaredValue) || 0;

  // ── Diff = totaux exacts lus depuis Firebase (sauvegardés par cost-analysis-view & cost-sale-view) ──
  const coutRevientData = useMemo(() => {
    if (!selectedFacture) return null;
    if (savedCoutRevient === null && savedCoutVente === null) return null;
    const coutRevientTtc = savedCoutRevient ?? 0;
    const coutVenteTtc   = savedCoutVente   ?? 0;
    if (coutRevientTtc === 0 && coutVenteTtc === 0) return null;
    const diff = coutRevientTtc - coutVenteTtc;
    const pct  = coutRevientTtc > 0 ? (diff / coutRevientTtc) * 100 : 0;
    return { coutRevientTtc, coutVenteTtc, diff, pct };
  }, [selectedFacture, savedCoutRevient, savedCoutVente]);

  const setPU = (categoryId: string, val: string) => {
    setPuMap(prev => ({ ...prev, [categoryId]: val }));
    setSavedOk(false);
  };

  const inputCls = "w-full bg-stone-50 border border-stone-200 text-stone-900 text-sm font-black rounded-lg px-3 h-9 focus:outline-none focus:border-amber-500 focus:ring-2 focus:ring-amber-500/20 transition-all text-right";

  return (
    <div className="space-y-8 fade-in">
      {/* Header */}
      <header className="bg-stone-900 rounded-[2rem] p-8 shadow-2xl relative overflow-hidden">
        <div className="absolute top-0 right-0 w-[500px] h-[500px] bg-blue-500/10 rounded-full -translate-y-1/2 translate-x-1/2 blur-[100px]" />
        <div className="relative z-10 flex flex-col lg:flex-row justify-between items-start lg:items-center gap-6">
          <div>
            <div className="flex items-center gap-3 mb-3">
              <div className="p-2.5 bg-blue-500 rounded-xl">
                <FileCheck className="w-6 h-6 text-white" />
              </div>
              <div>
                <p className="text-[10px] font-black text-blue-400 uppercase tracking-[0.2em]">Document Officiel</p>
                <h2 className="text-3xl font-black text-white tracking-tighter uppercase leading-none">Déclaration en Douane</h2>
              </div>
            </div>
            <p className="text-stone-400 text-sm font-medium max-w-lg">
              Regroupement par catégorie · Saisie du PU déclaré · Valeur déclarée automatique depuis le dossier · Sauvegarde Firebase
            </p>
          </div>

          <div className="flex flex-col gap-2 w-full lg:w-auto">
            <label className="text-[10px] font-black text-stone-500 uppercase tracking-widest">Sélectionner un Dossier</label>
            <div className="flex gap-3">
              <div className="relative flex-1 lg:w-72">
                <select
                  value={selectedFactureId || ''}
                  onChange={e => { setSelectedFactureId(e.target.value); setSavedOk(false); }}
                  className="w-full bg-white/10 border border-white/20 text-white font-black uppercase text-sm rounded-xl px-4 h-12 appearance-none pr-10 focus:outline-none focus:border-blue-500 transition-colors"
                >
                  {factures.map(f => (
                    <option key={f.id} value={f.id} className="text-stone-900 bg-white">
                      {f.id} — {f.arrivalDate}
                    </option>
                  ))}
                </select>
                <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-stone-400 pointer-events-none" />
              </div>
              {/* Save button */}
              <button
                onClick={handleSave}
                disabled={saving || !selectedFacture}
                className={`h-12 px-4 font-black text-[10px] uppercase tracking-widest rounded-xl flex items-center gap-2 transition-colors shrink-0 ${
                  saveError
                    ? 'bg-red-500 text-white shadow-lg shadow-red-500/20'
                    : savedOk
                    ? 'bg-emerald-500 text-white shadow-lg shadow-emerald-500/20'
                    : 'bg-blue-500 hover:bg-blue-600 text-white shadow-lg shadow-blue-500/20'
                } disabled:opacity-50`}
              >
                {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : savedOk ? <CheckCircle2 className="w-4 h-4" /> : <Save className="w-4 h-4" />}
                {saveError ? 'Erreur!' : savedOk ? 'Sauvegardé' : 'Sauvegarder'}
              </button>
              {/* PDF export */}
              {selectedFacture && lines.length > 0 && (
                <button
                  onClick={() => {
                    const validLines = lines.filter(l => l.puNum > 0);
                    if (validLines.length === 0) {
                      alert('Veuillez saisir au moins un PU déclaré avant d\'exporter le PDF.');
                      return;
                    }
                    exportDPPDF(selectedFacture, lines, parseFloat(freightInput) || 0);
                  }}
                  className="h-12 px-5 bg-red-500 hover:bg-red-600 text-white font-black text-[10px] uppercase tracking-widest rounded-xl flex items-center gap-2 transition-colors shadow-lg shadow-red-500/20 shrink-0"
                >
                  <FileDown className="w-4 h-4" /> PDF
                </button>
              )}
            </div>
          </div>
        </div>
      </header>

      {!selectedFacture && (
        <div className="py-32 text-center text-stone-300 font-black uppercase text-[11px] tracking-widest">
          Sélectionnez un dossier pour créer la déclaration
        </div>
      )}

      {selectedFacture && (
        <>
          {/* Info banner */}
          <div className="flex items-start gap-3 bg-blue-50 border border-blue-200 rounded-2xl p-4">
            <Info className="w-5 h-5 text-blue-500 shrink-0 mt-0.5" />
            <div className="flex-1">
              <p className="text-[11px] font-black text-blue-800 uppercase tracking-tight">
                Dossier {selectedFacture.id} — {selectedFacture.arrivalDate || '—'}
              </p>
              <p className="text-[10px] font-bold text-blue-600 mt-0.5">
                Fournisseur: {selectedFacture.supplierId || '—'} · {lines.length} catégorie{lines.length > 1 ? 's' : ''} · {totalQty.toLocaleString('fr-MA')} unités
              </p>
            </div>
            <button
              onClick={() => setShowSuggested(v => !v)}
              className={`flex items-center gap-1.5 px-3 h-8 rounded-xl text-[9px] font-black uppercase tracking-widest transition-colors ${showSuggested ? 'bg-amber-100 text-amber-700 hover:bg-amber-200' : 'bg-stone-100 text-stone-500 hover:bg-stone-200'}`}
            >
              {showSuggested ? <Eye className="w-3 h-3" /> : <EyeOff className="w-3 h-3" />}
              Valeur suggérée
            </button>
          </div>

          {/* Freight include (saisie manuelle) */}
          <div className="flex items-center gap-4 bg-emerald-50 border border-emerald-200 rounded-2xl px-5 py-3">
            <div className="flex-1">
              <p className="text-[9px] font-black text-emerald-700 uppercase tracking-widest mb-0.5">Freight Included (USD)</p>
              <p className="text-[8px] font-bold text-emerald-500">Valeur du fret à inclure dans la déclaration PDF — saisie manuelle</p>
            </div>
            <input
              type="number"
              placeholder="0.00"
              value={freightInput}
              onChange={e => setFreightInput(e.target.value)}
              step="0.01"
              min="0"
              className="w-36 bg-white border border-emerald-300 text-emerald-900 text-sm font-black rounded-xl px-3 h-10 focus:outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20 transition-all text-right"
            />
            <span className="text-[10px] font-black text-emerald-600 uppercase">USD</span>
          </div>

          {/* Tableau */}
          <div className="bg-white rounded-3xl shadow-xl border border-stone-100 overflow-hidden">
            <div className="bg-stone-900 px-8 py-5 flex items-center justify-between">
              <div>
                <p className="text-[9px] font-black text-stone-500 uppercase tracking-widest mb-1">Déclaration en Douane</p>
                <h3 className="text-lg font-black text-white uppercase tracking-tight">
                  {selectedFacture.id}
                </h3>
              </div>
              <Badge className="bg-blue-500 text-white border-none text-[9px] font-black uppercase tracking-widest px-3 py-1">
                {lines.length} catégories
              </Badge>
            </div>

            {loading ? (
              <div className="flex items-center justify-center py-20 gap-3">
                <Loader2 className="w-6 h-6 animate-spin text-blue-500" />
                <span className="text-[11px] font-black text-stone-400 uppercase tracking-widest">Chargement des valeurs sauvegardées...</span>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow className="bg-stone-50 border-b border-stone-100">
                      <TableHead className="text-[9px] font-black uppercase text-stone-400 py-4 px-6 min-w-[200px]">Catégorie</TableHead>
                      <TableHead className="text-[9px] font-black uppercase text-stone-400 py-4 text-right">QTÉ Totale</TableHead>
                      <TableHead className="text-[9px] font-black uppercase text-stone-400 py-4 text-right">NW Total (kg)</TableHead>
                      {showSuggested && (
                        <TableHead className="text-[9px] font-black uppercase text-amber-500 py-4 text-right bg-amber-50/40">
                          <span className="flex items-center gap-1 justify-end">
                            <Lightbulb className="w-3 h-3" /> Val. Suggérée (MAD/U)
                          </span>
                          <div className="text-[7px] font-bold text-amber-400 normal-case mt-0.5">(NW × val.douane/kg) ÷ QTÉ — référence interne</div>
                        </TableHead>
                      )}
                      <TableHead className="text-[9px] font-black uppercase text-blue-500 py-4 text-right bg-blue-50/30 min-w-[160px]">PU Déclaré (USD)</TableHead>
                      <TableHead className="text-[9px] font-black uppercase text-emerald-600 py-4 text-right bg-emerald-50/40 pr-6">MT (USD)</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {lines.length === 0 && (
                      <TableRow>
                        <TableCell colSpan={showSuggested ? 6 : 5} className="text-center py-16 text-stone-300 font-black uppercase text-[10px] tracking-widest">
                          Aucun article lié à ce dossier
                        </TableCell>
                      </TableRow>
                    )}
                    {lines.map((line, idx) => (
                      <TableRow key={line.categoryId} className={`border-stone-50 hover:bg-stone-50/50 transition-colors ${idx % 2 === 0 ? '' : 'bg-stone-50/30'}`}>
                        <TableCell className="py-4 px-6">
                          <div className="font-black text-[12px] text-stone-900 uppercase">{line.categoryId}</div>
                          <div className="text-[9px] text-stone-400 font-bold mt-0.5">
                            {line.customsValuePerKg != null
                              ? `Val. douane: ${line.customsValuePerKg.toFixed(2)} MAD/kg`
                              : <span className="text-amber-500">Pas de val. douane définie</span>}
                          </div>
                        </TableCell>
                        <TableCell className="text-right font-black text-[13px] text-stone-900 py-4">
                          {line.totalQty.toLocaleString('fr-MA')}
                          <div className="text-[8px] text-stone-400 font-bold uppercase">{line.unit}</div>
                        </TableCell>
                        <TableCell className="text-right font-bold text-[11px] text-stone-600 py-4">
                          {line.totalNW > 0 ? line.totalNW.toLocaleString('fr-MA', { maximumFractionDigits: 2 }) : <span className="text-stone-300">—</span>}
                          <div className="text-[8px] text-stone-400 font-bold">kg</div>
                        </TableCell>
                        {showSuggested && (
                          <TableCell className="text-right py-4 bg-amber-50/30">
                            {line.suggestedPU != null ? (
                              <div>
                                <div className="font-black text-[13px] text-amber-600">
                                  {line.suggestedPU.toLocaleString('fr-MA', { minimumFractionDigits: 2, maximumFractionDigits: 4 })}
                                </div>
                                <div className="text-[8px] text-amber-400 font-bold">MAD/unité</div>
                              </div>
                            ) : <span className="text-stone-300 text-[9px]">—</span>}
                          </TableCell>
                        )}
                        <TableCell className="py-3 px-4 bg-blue-50/20">
                          <div className="flex flex-col gap-1">
                            <input
                              type="number"
                              className={inputCls}
                              placeholder="0.00"
                              value={puMap[line.categoryId] ?? ''}
                              onChange={e => setPU(line.categoryId, e.target.value)}
                              step="0.0001"
                            />
                          </div>
                        </TableCell>
                        <TableCell className="text-right py-4 pr-6 bg-emerald-50/30">
                          {line.puNum > 0 ? (
                            <div>
                              <div className="font-black text-[15px] text-emerald-700 leading-none">
                                {line.mt.toLocaleString('fr-MA', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                              </div>
                              <div className="text-[8px] font-black text-emerald-500 uppercase mt-0.5">USD</div>
                            </div>
                          ) : (
                            <span className="text-stone-300 font-normal text-[9px]">Saisir le PU</span>
                          )}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}

            {/* Totaux */}
            {lines.length > 0 && (
              <div className="px-6 py-5 bg-stone-900 border-t border-stone-100 flex flex-wrap items-center justify-between gap-4">
                <div>
                  <p className="text-[8px] font-black text-stone-500 uppercase tracking-widest">QTÉ Totale</p>
                  <p className="text-lg font-black text-white">{totalQty.toLocaleString('fr-MA')}</p>
                </div>
                <div className="text-right bg-emerald-500/30 border border-emerald-500/40 rounded-xl px-6 py-4">
                  <p className="text-[8px] font-black text-emerald-300 uppercase tracking-widest mb-1">Valeur Totale Déclarée en Douane</p>
                  <p className="text-3xl font-black text-emerald-100 leading-none">
                    {totalMT > 0
                      ? totalMT.toLocaleString('fr-MA', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
                      : '—'}
                  </p>
                  <p className="text-[8px] font-black text-emerald-400 uppercase mt-1">USD  ·  Σ (PU × QTÉ)</p>
                </div>
              </div>
            )}

            {/* Note */}
            <div className="px-6 py-3 bg-stone-50 border-t border-stone-100 flex flex-wrap gap-4 text-[9px] font-bold text-stone-500 uppercase">
              <span className="flex items-center gap-1.5"><span className="w-3 h-3 rounded-sm bg-blue-200 inline-block" /> PU déclaré en USD (saisie manuelle)</span>
              <span className="flex items-center gap-1.5"><span className="w-3 h-3 rounded-sm bg-emerald-300 inline-block" /> Valeur déclarée = Σ (PU × QTÉ) en USD</span>
              {showSuggested && <span className="flex items-center gap-1.5"><span className="w-3 h-3 rounded-sm bg-amber-200 inline-block" /> Valeur suggérée en MAD — référence interne</span>}
              <span className="ml-auto italic normal-case text-stone-400 flex items-center gap-1">
                <Info className="w-3 h-3" /> Les valeurs saisies sont sauvegardées en Firebase
              </span>
            </div>
          </div>

          {/* ═══════════════════════════════════════════════════════════════════ */}
          {/* DIFFÉRENCE VS COÛT DE REVIENT TTC                                 */}
          {/* ═══════════════════════════════════════════════════════════════════ */}
          {totalMT > 0 && coutRevientData && (
            <div className="bg-white rounded-3xl shadow-xl border border-stone-100 overflow-hidden">
              {/* Header */}
              <div className="bg-gradient-to-r from-stone-900 via-stone-800 to-stone-900 px-8 py-5 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
                <div>
                  <p className="text-[9px] font-black text-stone-500 uppercase tracking-widest mb-1">Analyse Financière · Dossier</p>
                  <h3 className="text-lg font-black text-white uppercase tracking-tight flex items-center gap-2">
                    <Calculator className="w-5 h-5 text-amber-400" />
                    Analyse · Coût de Revient vs Coût de Vente
                  </h3>
                </div>
                {/* Taux de change input */}
                <div className="flex items-center gap-3 bg-white/5 border border-white/10 rounded-xl px-4 py-2.5">
                  <DollarSign className="w-4 h-4 text-amber-400 shrink-0" />
                  <div>
                    <p className="text-[8px] font-black text-stone-500 uppercase tracking-widest">Taux de Change</p>
                    <p className="text-[8px] text-stone-400 font-bold">1 $ = ? MAD</p>
                  </div>
                  <input
                    type="number"
                    value={tauxChange}
                    onChange={e => setTauxChange(e.target.value)}
                    step="0.1"
                    min="1"
                    max="20"
                    className="w-20 bg-white/10 border border-white/20 text-white font-black text-sm rounded-lg px-3 h-9 focus:outline-none focus:border-amber-500 focus:ring-2 focus:ring-amber-500/20 transition-all text-center"
                  />
                  <div className="flex gap-1">
                    {[10, 10.5, 11].map(v => (
                      <button
                        key={v}
                        onClick={() => setTauxChange(String(v))}
                        className={`px-2 py-1 rounded-lg text-[8px] font-black transition-all ${parseFloat(tauxChange) === v ? 'bg-amber-500 text-white' : 'bg-white/10 text-stone-400 hover:bg-white/20'}`}
                      >
                        {v}
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              {/* Body */}
              <div className="p-6 grid grid-cols-1 lg:grid-cols-3 gap-6">

                {/* Col 1: Valeur déclarée */}
                <div className="bg-blue-50 border border-blue-100 rounded-2xl p-5 space-y-3">
                  <p className="text-[9px] font-black text-blue-600 uppercase tracking-widest flex items-center gap-1.5">
                    <DollarSign className="w-3.5 h-3.5" /> Coût de Vente TTC
                  </p>
                  <div>
                    <p className="text-2xl font-black text-blue-800 leading-none">
                      {coutRevientData.coutVenteTtc.toLocaleString('fr-MA', { maximumFractionDigits: 0 })}
                    </p>
                    <p className="text-[9px] font-black text-blue-500 uppercase mt-1">MAD</p>
                  </div>
                  <div className="pt-3 border-t border-blue-100 space-y-1.5">
                    <div className="flex justify-between text-[9px]">
                      <span className="text-blue-500 font-bold">Valeur USD déclarée (DP)</span>
                      <span className="font-black text-blue-700">{totalMT.toLocaleString('fr-MA', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} $</span>
                    </div>
                    <div className="flex justify-between text-[9px]">
                      <span className="text-blue-500 font-bold">Taux effectif (MAD/$)</span>
                      <span className="font-black text-blue-700">{(parseFloat(tauxChange) || 10.5).toFixed(4)}</span>
                    </div>
                  </div>
                </div>

                {/* Col 2: Coût de Revient TTC */}
                <div className="bg-stone-50 border border-stone-100 rounded-2xl p-5 space-y-3">
                  <p className="text-[9px] font-black text-stone-600 uppercase tracking-widest flex items-center gap-1.5">
                    <Calculator className="w-3.5 h-3.5" /> Coût de Revient TTC
                  </p>
                  <div>
                    <p className="text-2xl font-black text-stone-800 leading-none">
                      {coutRevientData.coutRevientTtc.toLocaleString('fr-MA', { maximumFractionDigits: 0 })}
                    </p>
                    <p className="text-[9px] font-black text-stone-500 uppercase mt-1">MAD</p>
                  </div>
                  <div className="pt-3 border-t border-stone-200 space-y-1.5">
                    <p className="text-[8px] text-stone-400 font-bold italic normal-case leading-relaxed">
                      Achat FOB + Fret + Taxes douane (DI/TPI/TIC/TVA réels) + Frais dossier (transit, change, divers)
                    </p>
                  </div>
                </div>

                {/* Col 3: DIFFÉRENCE — diff = Revient - Vente ; négatif = gain */}
                {(() => {
                  const isGain = coutRevientData.diff <= 0; // revient <= vente = gain
                  const absDiff = Math.abs(coutRevientData.diff);
                  const absPct  = Math.abs(coutRevientData.pct);
                  return (
                    <div className={`rounded-2xl p-5 space-y-3 border ${
                      isGain ? 'bg-emerald-50 border-emerald-200' : 'bg-red-50 border-red-200'
                    }`}>
                      <p className={`text-[9px] font-black uppercase tracking-widest flex items-center gap-1.5 ${
                        isGain ? 'text-emerald-600' : 'text-red-600'
                      }`}>
                        {isGain
                          ? <TrendingUp className="w-3.5 h-3.5" />
                          : <TrendingDown className="w-3.5 h-3.5" />
                        }
                        {isGain ? 'Gain / Bénéfice' : 'Perte / À Ajuster'}
                      </p>
                      <div>
                        <p className={`text-2xl font-black leading-none ${
                          isGain ? 'text-emerald-700' : 'text-red-700'
                        }`}>
                          {isGain ? '+' : '-'}{absDiff.toLocaleString('fr-MA', { maximumFractionDigits: 0 })}
                        </p>
                        <p className={`text-[9px] font-black uppercase mt-1 ${
                          isGain ? 'text-emerald-500' : 'text-red-500'
                        }`}>MAD</p>
                      </div>
                      <div className="pt-3 border-t space-y-1.5" style={{ borderColor: isGain ? '#d1fae5' : '#fee2e2' }}>
                        <div className="flex justify-between text-[9px]">
                          <span className={`font-bold ${isGain ? 'text-emerald-600' : 'text-red-500'}`}>Marge</span>
                          <span className={`font-black ${isGain ? 'text-emerald-700' : 'text-red-700'}`}>
                            {isGain ? '+' : '-'}{absPct.toFixed(1)}%
                          </span>
                        </div>
                        <div className={`mt-2 px-3 py-2 rounded-xl text-[8px] font-bold uppercase leading-relaxed ${
                          isGain ? 'bg-emerald-100 text-emerald-700' : 'bg-red-100 text-red-700'
                        }`}>
                          {isGain
                            ? `✓ Vous gagnez ${absDiff.toLocaleString('fr-MA', { maximumFractionDigits: 0 })} MAD sur ce dossier.`
                            : `⚠ Perte de ${absDiff.toLocaleString('fr-MA', { maximumFractionDigits: 0 })} MAD. Vérifiez les PU ou les taxes.`
                          }
                        </div>
                      </div>
                    </div>
                  );
                })()}
              </div>

              {/* Footer note */}
              <div className="px-6 py-3 bg-amber-50/50 border-t border-amber-100 flex items-center gap-2">
                <Info className="w-3.5 h-3.5 text-amber-500 shrink-0" />
                <p className="text-[8px] font-bold text-amber-600 uppercase tracking-wide">
                  Coût de Vente calculé avec la même formule que la page Coût de Vente (HT × 1.05 + TVA). Coût de Revient = FOB + Fret + Taxes douane réelles (DI/TPI/TIC/TVA par catégorie) + Frais dossier.
                </p>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
