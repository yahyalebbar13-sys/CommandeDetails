"use client";

import React, { useMemo, useState, useEffect, useCallback } from 'react';
import { Badge } from '@/components/ui/badge';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow
} from '@/components/ui/table';
import {
  FileCheck, ChevronDown, Info, FileDown, Eye, EyeOff, Lightbulb, Save, CheckCircle2, Loader2
} from 'lucide-react';
import { exportDPPDF } from '@/lib/pdf-export';
import { useFirebase } from '@/firebase';
import { doc, getDoc, setDoc } from 'firebase/firestore';

interface DPViewProps {
  articles: any[];
  factures: any[];
  subCategories: any[];
}

export default function DPView({ articles, factures, subCategories }: DPViewProps) {
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

  const selectedFacture = useMemo(
    () => factures.find(f => f.id === selectedFactureId) || null,
    [factures, selectedFactureId]
  );

  // ── Load saved PU from Firebase when dossier changes ──
  useEffect(() => {
    if (!selectedFactureId || !firestore) return;
    setLoading(true);
    setPuMap({});
    // Use top-level collection matching the app's pattern
    getDoc(doc(firestore, 'dp_declarations', selectedFactureId))
      .then(snap => {
        if (snap.exists()) {
          const data = snap.data();
          if (data.puMap) setPuMap(data.puMap);
        }
      })
      .catch(err => console.error('DP load error:', err))
      .finally(() => setLoading(false));
  }, [selectedFactureId, firestore]);

  // ── Save to Firebase ──
  const handleSave = useCallback(async () => {
    if (!selectedFactureId || !firestore) return;
    setSaving(true);
    setSaveError(null);
    try {
      await setDoc(
        doc(firestore, 'dp_declarations', selectedFactureId),
        { puMap, savedAt: new Date().toISOString(), factureId: selectedFactureId },
        { merge: true }
      );
      setSavedOk(true);
      setTimeout(() => setSavedOk(false), 3000);
    } catch (err: any) {
      console.error('DP save error:', err);
      setSaveError(err?.message || 'Erreur de sauvegarde');
      setTimeout(() => setSaveError(null), 4000);
    } finally {
      setSaving(false);
    }
  }, [selectedFactureId, firestore, puMap]);

  // Group articles by category for selected facture
  const categoryLines = useMemo(() => {
    if (!selectedFactureId) return [];
    const dossierArticles = articles.filter(a => a.factureId === selectedFactureId);

    const map: Record<string, { qty: number; nw: number; unit: string }> = {};
    for (const a of dossierArticles) {
      const cat = a.categoryId || '—';
      if (!map[cat]) map[cat] = { qty: 0, nw: 0, unit: a.unitOfMeasure || 'U' };
      map[cat].qty += Number(a.quantity) || 0;
      map[cat].nw += Number(a.netWeight) || 0;
    }

    return Object.entries(map)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([categoryId, { qty, nw, unit }]) => {
        const cat = subCategories.find(c => c.name === categoryId);
        const customsValuePerKg = cat?.customsValuePerKg != null ? Number(cat.customsValuePerKg) : null;
        const suggestedPU = (customsValuePerKg !== null && qty > 0)
          ? (nw * customsValuePerKg) / qty
          : null;
        return { categoryId, totalQty: qty, totalNW: nw, unit, customsValuePerKg, suggestedPU };
      });
  }, [articles, selectedFactureId, subCategories]);

  const lines = categoryLines.map(line => ({
    ...line,
    puNum: parseFloat(puMap[line.categoryId] ?? '') || 0,
    mt: (parseFloat(puMap[line.categoryId] ?? '') || 0) * line.totalQty,
  }));

  const totalQty = lines.reduce((s, l) => s + l.totalQty, 0);
  // MT Total = declaredValue ($) from the dossier
  const declaredValueDollar = Number(selectedFacture?.declaredValue) || 0;

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
                    exportDPPDF(selectedFacture, lines);
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
                          <div className="text-[7px] font-bold text-amber-400 normal-case mt-0.5">(NW × val.douane/kg) ÷ QTÉ — interne</div>
                        </TableHead>
                      )}
                      <TableHead className="text-[9px] font-black uppercase text-blue-500 py-4 text-right bg-blue-50/30 min-w-[160px]">PU Déclaré (MAD)</TableHead>
                      <TableHead className="text-[9px] font-black uppercase text-emerald-600 py-4 text-right bg-emerald-50/40 pr-6">MT (MAD)</TableHead>
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
                              step="0.01"
                            />
                            {line.puNum > 0 && line.suggestedPU != null && (
                              <div className={`text-[8px] font-black text-right px-1 ${line.puNum < line.suggestedPU * 0.9 ? 'text-red-500' : 'text-emerald-500'}`}>
                                {line.puNum < line.suggestedPU * 0.9 ? '⚠ En dessous suggéré' : '✓ OK'}
                              </div>
                            )}
                          </div>
                        </TableCell>
                        <TableCell className="text-right py-4 pr-6 bg-emerald-50/30">
                          {line.puNum > 0 ? (
                            <div>
                              <div className="font-black text-[15px] text-emerald-700 leading-none">
                                {line.mt.toLocaleString('fr-MA', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                              </div>
                              <div className="text-[8px] font-black text-emerald-500 uppercase mt-0.5">MAD</div>
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
                <div className="flex items-center gap-4">
                  {/* Valeur Déclarée en Douane ($) from the dossier */}
                  <div className="text-right bg-blue-500/20 rounded-xl px-5 py-3">
                    <p className="text-[8px] font-black text-blue-300 uppercase tracking-widest">Valeur Déclarée en Douane</p>
                    <p className="text-2xl font-black text-blue-200 leading-none">
                      {declaredValueDollar > 0
                        ? declaredValueDollar.toLocaleString('fr-MA', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
                        : '—'}
                    </p>
                    <p className="text-[8px] font-black text-blue-400 uppercase mt-0.5">USD (depuis le dossier)</p>
                  </div>
                </div>
              </div>
            )}

            {/* Note */}
            <div className="px-6 py-3 bg-stone-50 border-t border-stone-100 flex flex-wrap gap-4 text-[9px] font-bold text-stone-500 uppercase">
              <span className="flex items-center gap-1.5"><span className="w-3 h-3 rounded-sm bg-blue-200 inline-block" /> PU déclaré (saisie manuelle)</span>
              <span className="flex items-center gap-1.5"><span className="w-3 h-3 rounded-sm bg-emerald-200 inline-block" /> MT = PU × QTÉ (MAD)</span>
              <span className="flex items-center gap-1.5"><span className="w-3 h-3 rounded-sm bg-blue-400 inline-block" /> Valeur déclarée = champ du dossier ($)</span>
              {showSuggested && <span className="flex items-center gap-1.5"><span className="w-3 h-3 rounded-sm bg-amber-200 inline-block" /> Valeur suggérée — usage interne</span>}
              <span className="ml-auto italic normal-case text-stone-400 flex items-center gap-1">
                <Info className="w-3 h-3" /> Les valeurs saisies sont sauvegardées en Firebase
              </span>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
