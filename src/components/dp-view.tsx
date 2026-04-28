"use client";

import React, { useMemo, useState } from 'react';
import { Badge } from '@/components/ui/badge';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow
} from '@/components/ui/table';
import {
  FileCheck, ChevronDown, Info, FileDown, Eye, EyeOff, Lightbulb
} from 'lucide-react';
import { exportDPPDF } from '@/lib/pdf-export';

interface DPViewProps {
  articles: any[];
  factures: any[];
  subCategories: any[];
}

interface CategoryLine {
  categoryId: string;
  totalQty: number;
  totalNW: number;
  unit: string;
  customsValuePerKg: number | null;
  suggestedPU: number | null; // = (NW_total × customsValuePerKg) / QTÉ_total
  puDeclare: string; // user input
}

export default function DPView({ articles, factures, subCategories }: DPViewProps) {
  const [selectedFactureId, setSelectedFactureId] = useState<string | null>(
    factures.length > 0 ? factures[0].id : null
  );
  const [puMap, setPuMap] = useState<Record<string, string>>({}); // categoryId → pu saisi
  const [showSuggested, setShowSuggested] = useState(true);

  const selectedFacture = useMemo(
    () => factures.find(f => f.id === selectedFactureId) || null,
    [factures, selectedFactureId]
  );

  // Group articles by category for selected facture
  const categoryLines = useMemo((): CategoryLine[] => {
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
        return {
          categoryId,
          totalQty: qty,
          totalNW: nw,
          unit,
          customsValuePerKg,
          suggestedPU,
          puDeclare: puMap[categoryId] ?? '',
        };
      });
  }, [articles, selectedFactureId, subCategories, puMap]);

  const lines = categoryLines.map(line => ({
    ...line,
    puNum: parseFloat(line.puDeclare) || 0,
    mt: (parseFloat(line.puDeclare) || 0) * line.totalQty,
  }));

  const totalMT = lines.reduce((s, l) => s + l.mt, 0);
  const totalQty = lines.reduce((s, l) => s + l.totalQty, 0);

  const setPU = (categoryId: string, val: string) => {
    setPuMap(prev => ({ ...prev, [categoryId]: val }));
  };

  // Derived declared value in $ — uses invoicePaidDhs / tauxChange
  const tauxChange = useMemo(() => {
    if (!selectedFacture) return 0;
    const paid = Number(selectedFacture.invoicePaidDhs) || 0;
    const decl = Number(selectedFacture.declaredValue) || 0;
    return decl > 0 ? paid / decl : 0;
  }, [selectedFacture]);

  const totalMTDollar = tauxChange > 0 ? totalMT / tauxChange : null;

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
                <h2 className="text-3xl font-black text-white tracking-tighter uppercase leading-none">Déclaration Provisoire</h2>
              </div>
            </div>
            <p className="text-stone-400 text-sm font-medium max-w-lg">
              Regroupement par catégorie · Saisie manuelle du PU déclaré · Export DP officiel
            </p>
          </div>

          <div className="flex flex-col gap-2 w-full lg:w-auto">
            <label className="text-[10px] font-black text-stone-500 uppercase tracking-widest">Sélectionner un Dossier</label>
            <div className="flex gap-3">
              <div className="relative flex-1 lg:w-72">
                <select
                  value={selectedFactureId || ''}
                  onChange={e => { setSelectedFactureId(e.target.value); setPuMap({}); }}
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
              {selectedFacture && lines.length > 0 && (
                <button
                  onClick={() => exportDPPDF(selectedFacture, lines)}
                  className="h-12 px-5 bg-red-500 hover:bg-red-600 text-white font-black text-[10px] uppercase tracking-widest rounded-xl flex items-center gap-2 transition-colors shadow-lg shadow-red-500/20 shrink-0"
                >
                  <FileDown className="w-4 h-4" /> PDF DP
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
                Fournisseur: {selectedFacture.supplierId || '—'} · {lines.length} catégorie{lines.length > 1 ? 's' : ''} · {totalQty.toLocaleString('fr-MA')} unités totales
                {tauxChange > 0 && ` · Taux de change: ${tauxChange.toFixed(4)} MAD/$`}
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
                <p className="text-[9px] font-black text-stone-500 uppercase tracking-widest mb-1">Déclaration Provisoire</p>
                <h3 className="text-lg font-black text-white uppercase tracking-tight">
                  DP — {selectedFacture.id}
                </h3>
              </div>
              <div className="flex items-center gap-3">
                {showSuggested && (
                  <span className="flex items-center gap-1.5 bg-amber-500/20 text-amber-400 text-[9px] font-black uppercase tracking-widest px-3 py-1 rounded-full">
                    <Lightbulb className="w-3 h-3" /> Indicateur interne visible
                  </span>
                )}
                <Badge className="bg-blue-500 text-white border-none text-[9px] font-black uppercase tracking-widest px-3 py-1">
                  {lines.length} catégories
                </Badge>
              </div>
            </div>

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
                    <TableHead className="text-[9px] font-black uppercase text-emerald-600 py-4 text-right bg-emerald-50/40 pr-6">MT Total (MAD)</TableHead>
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
                      {/* Catégorie */}
                      <TableCell className="py-4 px-6">
                        <div className="font-black text-[12px] text-stone-900 uppercase">{line.categoryId}</div>
                        <div className="text-[9px] text-stone-400 font-bold mt-0.5">
                          {line.customsValuePerKg != null
                            ? `Val. douane: ${line.customsValuePerKg.toFixed(2)} MAD/kg`
                            : <span className="text-amber-500">Pas de val. douane définie</span>}
                        </div>
                      </TableCell>

                      {/* QTÉ */}
                      <TableCell className="text-right font-black text-[13px] text-stone-900 py-4">
                        {line.totalQty.toLocaleString('fr-MA')}
                        <div className="text-[8px] text-stone-400 font-bold uppercase">{line.unit}</div>
                      </TableCell>

                      {/* NW */}
                      <TableCell className="text-right font-bold text-[11px] text-stone-600 py-4">
                        {line.totalNW > 0 ? line.totalNW.toLocaleString('fr-MA', { maximumFractionDigits: 2 }) : <span className="text-stone-300">—</span>}
                        <div className="text-[8px] text-stone-400 font-bold">kg</div>
                      </TableCell>

                      {/* Valeur suggérée (interne) */}
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

                      {/* PU Déclaré — saisie */}
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

                      {/* MT */}
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

            {/* Totaux */}
            {lines.length > 0 && (
              <div className="px-6 py-5 bg-stone-900 border-t border-stone-100 flex flex-wrap items-center justify-between gap-4">
                <div className="flex items-center gap-6">
                  <div>
                    <p className="text-[8px] font-black text-stone-500 uppercase tracking-widest">QTÉ Totale</p>
                    <p className="text-lg font-black text-white">{totalQty.toLocaleString('fr-MA')}</p>
                  </div>
                </div>
                <div className="flex items-center gap-4">
                  <div className="text-right">
                    <p className="text-[8px] font-black text-stone-400 uppercase tracking-widest">MT Total Déclaré</p>
                    <p className="text-2xl font-black text-emerald-400 leading-none">
                      {totalMT.toLocaleString('fr-MA', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    </p>
                    <p className="text-[8px] font-black text-stone-500 uppercase mt-0.5">MAD</p>
                  </div>
                  {totalMTDollar != null && totalMT > 0 && (
                    <div className="text-right bg-white/10 rounded-xl px-4 py-2">
                      <p className="text-[8px] font-black text-stone-400 uppercase tracking-widest">Équivalent $</p>
                      <p className="text-xl font-black text-blue-300 leading-none">
                        {totalMTDollar.toLocaleString('fr-MA', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                      </p>
                      <p className="text-[8px] font-black text-stone-500 uppercase mt-0.5">USD</p>
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* Note */}
            <div className="px-6 py-3 bg-stone-50 border-t border-stone-100 flex flex-wrap gap-4 text-[9px] font-bold text-stone-500 uppercase">
              <span className="flex items-center gap-1.5"><span className="w-3 h-3 rounded-sm bg-blue-200 inline-block" /> PU déclaré (saisie manuelle)</span>
              <span className="flex items-center gap-1.5"><span className="w-3 h-3 rounded-sm bg-emerald-200 inline-block" /> MT = PU × QTÉ totale par catégorie</span>
              {showSuggested && <span className="flex items-center gap-1.5"><span className="w-3 h-3 rounded-sm bg-amber-200 inline-block" /> Valeur suggérée = (NW × val.douane/kg) ÷ QTÉ — usage interne uniquement</span>}
              <span className="ml-auto italic normal-case text-stone-400 flex items-center gap-1">
                <Info className="w-3 h-3" /> La valeur suggérée n'apparaît pas dans le PDF
              </span>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
