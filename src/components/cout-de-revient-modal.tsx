
"use client";

import React, { useState, useMemo, useEffect } from 'react';
import { Dialog, DialogContent } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import {
  Calculator, Package, TrendingUp, Truck, FileText,
  AlertCircle, CheckCircle, Warehouse, DollarSign,
  Boxes, ArrowRight, Info, RefreshCw
} from 'lucide-react';

interface CoutDeRevientModalProps {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  article: any;
  factures: any[];
  articles: any[];
}

// ─── Constants ───────────────────────────────────────────────────────────────
const CBM_CONTAINER_STD = 68; // CBM d'un conteneur standard
const FRAIS_CHANGE_FIXE = 6500;    // MAD — bureau de change
const FRAIS_TRANSIT_FIXE = 6000;   // MAD — facture transitaire
const FRAIS_SUPP_FIXE = 1500;      // MAD — divers
const TOTAL_FRAIS_FIXES_MAD = FRAIS_CHANGE_FIXE + FRAIS_TRANSIT_FIXE + FRAIS_SUPP_FIXE; // = 14 000

// ─── Row: DI / TPI / TIC / TVA ────────────────────────────────────────────────
interface TaxLine { label: string; key: string; color: string; }
const TAX_LINES: TaxLine[] = [
  { label: "Droit Import (DI)", key: "importDutyRate", color: "text-blue-600" },
  { label: "Taxes Parafiscales (TPI)", key: "tpiRate", color: "text-violet-600" },
  { label: "TIC", key: "ticRate", color: "text-orange-600" },
];

function SummaryLine({ label, value, sub = '', bold = false, accent = '' }: { label: string; value: string; sub?: string; bold?: boolean; accent?: string }) {
  return (
    <div className={`flex items-center justify-between py-2 border-b border-stone-50 ${bold ? 'bg-stone-100 -mx-4 px-4 rounded-xl mt-1' : ''}`}>
      <span className={`text-[10px] font-${bold ? 'black' : 'bold'} ${bold ? 'text-stone-900 uppercase tracking-wider' : 'text-stone-500'}`}>{label}</span>
      <span className={`text-[11px] font-black ${accent || (bold ? 'text-stone-900' : 'text-stone-700')}`}>{value} {sub && <span className="text-[9px] font-bold text-stone-400">{sub}</span>}</span>
    </div>
  );
}

export default function CoutDeRevientModal({ open, onOpenChange, article, factures, articles }: CoutDeRevientModalProps) {
  const [tauxChange, setTauxChange] = useState<string>('10.5');

  // ─── Detect if article is linked to a real facture/dossier ────────────────
  const linkedFacture = useMemo(() => {
    if (!article?.factureId) return null;
    return factures.find(f => f.id === article.factureId) || null;
  }, [article, factures]);

  const isLinked = !!linkedFacture;

  // ─── Compute average freight per CBM from historical data ────────────────
  const avgFreightPerCbm = useMemo(() => {
    const validFactures = factures.filter(f =>
      (Number(f.freightCost) || Number(f.freight) || 0) > 0 &&
      articles.filter(a => a.factureId === f.id).reduce((s: number, a: any) => s + (a.cubicMeasurement || 0), 0) > 0
    );
    if (validFactures.length === 0) return 1500; // fallback $1,500 / 68 cbm ≈ 22$/cbm
    const total = validFactures.reduce((sum, f) => {
      const freight = Number(f.freightCost) || Number(f.freight) || 0;
      const cbm = articles.filter(a => a.factureId === f.id).reduce((s: number, a: any) => s + (a.cubicMeasurement || 0), 0);
      return sum + (cbm > 0 ? freight / cbm : 0);
    }, 0);
    return total / validFactures.length;
  }, [factures, articles]);

  // ─── Get cost values ────────────────────────────────────────────────────
  const computed = useMemo(() => {
    if (!article) return null;

    const qty = Number(article.quantity) || 0;
    const prix = Number(article.purchasePricePerUnit) || 0;
    const cbmArticle = Number(article.cubicMeasurement) || 0;
    const tc = Number(tauxChange) || 10.5;

    // Valeur FOB de l'article ($)
    const valeurFOB = qty * prix;

    // ─── Freight & container computation ────────────────────────────────
    let fretTotal$: number;
    let cbmTotal: number;
    let fraisFixesMad: number;
    let dosArticles: any[] = [];

    if (isLinked && linkedFacture) {
      fretTotal$ = Number(linkedFacture.freightCost) || Number(linkedFacture.freight) || 0;
      dosArticles = articles.filter(a => a.factureId === linkedFacture.id);
      cbmTotal = dosArticles.reduce((s: number, a: any) => s + (a.cubicMeasurement || 0), 0) || CBM_CONTAINER_STD;
      fraisFixesMad = (Number(linkedFacture.supplierInvoiceAmount) || 0) > 0
        ? Number(linkedFacture.supplierInvoiceAmount)
        : TOTAL_FRAIS_FIXES_MAD;
    } else {
      fretTotal$ = avgFreightPerCbm * CBM_CONTAINER_STD;
      cbmTotal = CBM_CONTAINER_STD;
      fraisFixesMad = TOTAL_FRAIS_FIXES_MAD;
    }

    // Part de fret de cet article ($) proportionnelle au CBM
    const partFret$ = cbmTotal > 0 && cbmArticle > 0
      ? (cbmArticle / cbmTotal) * fretTotal$
      : 0;

    // Part des frais fixes de ce article (MAD), proratisée au CBM
    const partFraisMad = cbmTotal > 0 && cbmArticle > 0
      ? (cbmArticle / cbmTotal) * fraisFixesMad
      : 0;

    // ─── Valeur douane ───────────────────────────────────────────────────
    // ⚡ Si l'audit analytique (dossier lié) mentionne une valeur déclarée en douane,
    //    on l'utilise directement (proratisée par la part FOB de cet article)
    //    sinon on calcule FOB + part fret (méthode CAF standard)
    const dossierDeclaredValue = isLinked && linkedFacture
      ? Number(linkedFacture.declaredValue) || 0
      : 0;

    let valeurDouane$: number;
    let douaneSource: 'declared' | 'calculated';

    if (dossierDeclaredValue > 0 && dosArticles.length > 0) {
      // Proratiser par la valeur FOB de l'article vs total FOB du dossier
      const totalFOBDossier = dosArticles.reduce((s: number, a: any) => s + (Number(a.quantity) * Number(a.purchasePricePerUnit)), 0);
      const artFobShare = totalFOBDossier > 0 ? valeurFOB / totalFOBDossier : 0;
      valeurDouane$ = dossierDeclaredValue * artFobShare;
      douaneSource = 'declared';
    } else {
      // Calcul standard CAF = FOB + part fret
      valeurDouane$ = valeurFOB + partFret$;
      douaneSource = 'calculated';
    }

    // Taux
    const importDutyRate = (article.importDutyRate ?? 0) / 100;
    const tpiRate = (article.tpiRate ?? 0) / 100;
    const ticRate = (article.ticRate ?? 0) / 100;
    const tvaRate = (article.tvaRate ?? 20) / 100;

    // Droits & Taxes ($)
    const di$ = valeurDouane$ * importDutyRate;
    const tpi$ = valeurDouane$ * tpiRate;
    const tic$ = valeurDouane$ * ticRate;
    const baseTVA$ = valeurDouane$ + di$ + tpi$ + tic$;
    const tva$ = baseTVA$ * tvaRate;
    const totalTaxes$ = di$ + tpi$ + tic$ + tva$;

    // Total taxes en MAD
    const totalTaxesMad = totalTaxes$ * tc;

    // Coût total de revient MAD
    const coutAchatMad = valeurFOB * tc;
    const fretPartMad = partFret$ * tc;
    const coutTotal$ = valeurFOB + partFret$ + totalTaxes$;
    const coutTotalMad = coutAchatMad + fretPartMad + totalTaxesMad + partFraisMad;

    // Unitaires
    const coutUnite$ = qty > 0 ? coutTotal$ / qty : 0;
    const coutUniteMad = qty > 0 ? coutTotalMad / qty : 0;

    return {
      qty, prix, valeurFOB,
      cbmArticle, cbmTotal, fretTotal$,
      partFret$, partFraisMad,
      valeurDouane$, douaneSource, dossierDeclaredValue,
      di$, tpi$, tic$, tva$, totalTaxes$,
      totalTaxesMad,
      coutAchatMad, fretPartMad,
      coutTotal$, coutTotalMad,
      coutUnite$, coutUniteMad,
      fraisFixesMad,
      importDutyRate: importDutyRate * 100,
      tpiRate: tpiRate * 100,
      ticRate: ticRate * 100,
      tvaRate: tvaRate * 100,
      cbmPct: cbmTotal > 0 && cbmArticle > 0 ? (cbmArticle / cbmTotal) * 100 : 0,
      isEstimated: !isLinked,
    };
  }, [article, tauxChange, isLinked, linkedFacture, avgFreightPerCbm, articles]);


  const fmt = (n: number, d = 2) => n.toLocaleString('en-US', { maximumFractionDigits: d, minimumFractionDigits: d });
  const fmtMAD = (n: number) => n.toLocaleString('fr-MA', { maximumFractionDigits: 0 });

  if (!article) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg rounded-[2rem] p-0 border-none overflow-hidden shadow-2xl bg-stone-50 max-h-[92vh] overflow-y-auto">
        {/* ─── Header ─── */}
        <div className="bg-stone-900 p-6 relative overflow-hidden shrink-0">
          <div className="absolute top-0 right-0 w-64 h-64 bg-emerald-500/5 rounded-full -translate-y-1/2 translate-x-1/4 blur-3xl pointer-events-none" />
          <div className="absolute bottom-0 left-0 w-40 h-40 bg-amber-500/5 rounded-full translate-y-1/2 blur-2xl pointer-events-none" />
          <div className="relative z-10">
            <div className="flex items-center gap-3 mb-3">
              <div className="w-10 h-10 bg-emerald-500/10 border border-emerald-500/20 rounded-2xl flex items-center justify-center">
                <Calculator className="w-5 h-5 text-emerald-400" />
              </div>
              <div>
                <p className="text-[8px] font-black text-stone-500 uppercase tracking-[0.3em]">Simulateur</p>
                <h2 className="text-lg font-black text-white uppercase tracking-tight leading-none">Prix de Revient TTC</h2>
              </div>
              {computed?.isEstimated ? (
                <span className="ml-auto text-[8px] font-black text-amber-400 bg-amber-500/10 border border-amber-500/20 px-2.5 py-1 rounded-full uppercase tracking-widest">
                  Estimé
                </span>
              ) : (
                <span className="ml-auto text-[8px] font-black text-emerald-400 bg-emerald-500/10 border border-emerald-500/20 px-2.5 py-1 rounded-full uppercase tracking-widest flex items-center gap-1">
                  <CheckCircle className="w-2.5 h-2.5" /> Réel
                </span>
              )}
            </div>
            <div className="flex items-baseline gap-3 flex-wrap">
              <span className="text-sm font-black text-stone-300 uppercase">{article.categoryId}</span>
              {article.supplierId && <span className="text-[9px] font-bold text-stone-500 uppercase">{article.supplierId}</span>}
              {article.size && article.size !== 'various' && <Badge className="bg-stone-800 text-stone-300 border-stone-700 text-[8px] font-bold uppercase">{article.size}</Badge>}
              {article.color && article.color !== 'various' && <Badge className="bg-stone-800 text-stone-300 border-stone-700 text-[8px] font-bold uppercase">{article.color}</Badge>}
            </div>
          </div>
        </div>

        <div className="p-5 space-y-5">
          {/* ─── Source info ────────────────────────────────────────────────────── */}
          <div className={`rounded-2xl border p-4 flex items-start gap-3 ${isLinked ? 'bg-emerald-50 border-emerald-100' : 'bg-amber-50 border-amber-100'}`}>
            <div className={`w-8 h-8 rounded-xl flex items-center justify-center shrink-0 mt-0.5 ${isLinked ? 'bg-emerald-100' : 'bg-amber-100'}`}>
              {isLinked ? <Warehouse className="w-4 h-4 text-emerald-600" /> : <Truck className="w-4 h-4 text-amber-600" />}
            </div>
            <div>
              <p className={`text-[9px] font-black uppercase tracking-widest ${isLinked ? 'text-emerald-700' : 'text-amber-700'}`}>
                {isLinked ? `Dossier lié : ${article.factureId}` : 'Mode Estimation (pas encore lié à un dossier)'}
              </p>
              <p className={`text-[8px] font-bold mt-0.5 ${isLinked ? 'text-emerald-600/80' : 'text-amber-600/80'}`}>
                {isLinked
                  ? `Fret & frais réels du dossier utilisés — Arrivée : ${linkedFacture?.arrivalDate || 'non définie'}`
                  : `Fret estimé sur base de la moyenne historique · CBM conteneur : ${CBM_CONTAINER_STD} m³`
                }
              </p>
            </div>
          </div>

          {/* ─── Taux de change input ──────────────────────────────────────────── */}
          <div className="bg-white rounded-2xl border border-stone-100 p-4 shadow-sm">
            <Label className="text-[9px] font-black text-stone-400 uppercase tracking-widest mb-3 flex items-center gap-1.5">
              <DollarSign className="w-3 h-3" /> Taux de Change (1 $ = __ MAD)
            </Label>
            <div className="flex gap-3 items-center">
              <Input
                type="number"
                step="0.01"
                min={1}
                max={50}
                value={tauxChange}
                onChange={e => setTauxChange(e.target.value)}
                className="h-12 border-stone-200 font-black text-lg text-stone-900 max-w-[140px] rounded-xl"
                placeholder="10.5"
              />
              <div className="flex flex-wrap gap-2">
                {[10, 10.5, 11, 11.5].map(tc => (
                  <button
                    key={tc}
                    type="button"
                    onClick={() => setTauxChange(String(tc))}
                    className={`px-3 py-1.5 rounded-xl text-[9px] font-black uppercase border transition-all ${Number(tauxChange) === tc ? 'bg-stone-900 text-white border-stone-900' : 'bg-stone-50 text-stone-500 border-stone-100 hover:border-stone-300'}`}
                  >
                    {tc}
                  </button>
                ))}
              </div>
            </div>
          </div>

          {computed && (
            <>
              {/* ─── Base values ────────────────────────────────────────────────── */}
              <div className="bg-white rounded-2xl border border-stone-100 p-4 shadow-sm space-y-0.5">
                <p className="text-[9px] font-black text-stone-400 uppercase tracking-widest mb-3 flex items-center gap-1.5">
                  <Boxes className="w-3 h-3" /> Base de Calcul
                </p>
                <SummaryLine label="Quantité" value={`${computed.qty.toLocaleString()} ${article.unitOfMeasure || 'u'}`} />
                <SummaryLine label="Prix unitaire" value={`$${fmt(computed.prix)}`} />
                <SummaryLine label="Valeur FOB totale" value={`$${fmt(computed.valeurFOB)}`} />
                <SummaryLine label={`CBM article`} value={`${computed.cbmArticle > 0 ? fmt(computed.cbmArticle, 3) : '—'} m³`} />
                <SummaryLine label={`CBM conteneur (${isLinked ? 'réel' : 'estimé'})`} value={`${fmt(computed.cbmTotal, 1)} m³`} />
                {computed.cbmPct > 0 && <SummaryLine label="Part dans le conteneur" value={`${fmt(computed.cbmPct, 1)}%`} accent="text-indigo-600" />}
              </div>

              {/* ─── Frais de fret ──────────────────────────────────────────────── */}
              <div className="bg-white rounded-2xl border border-stone-100 p-4 shadow-sm space-y-0.5">
                <p className="text-[9px] font-black text-stone-400 uppercase tracking-widest mb-3 flex items-center gap-1.5">
                  <Truck className="w-3 h-3" /> Frais de Transport & Dossier
                </p>
                <SummaryLine label={`Fret total (${isLinked ? 'réel' : 'estimé moy.'})`} value={`$${fmt(computed.fretTotal$)}`} />
                {computed.cbmPct > 0 && <SummaryLine label="Part fret article" value={`$${fmt(computed.partFret$)}`} />}
                <div className="mt-2 pt-2 border-t border-stone-50 space-y-0.5">
                  <SummaryLine label="Frais Bureau de Change" value={`${fmtMAD(FRAIS_CHANGE_FIXE)} MAD`} />
                  <SummaryLine label="Facture Transitaire" value={`${fmtMAD(FRAIS_TRANSIT_FIXE)} MAD`} />
                  <SummaryLine label="Frais Supplémentaires" value={`${fmtMAD(FRAIS_SUPP_FIXE)} MAD`} />
                  <SummaryLine label="Total frais fixes CTR" value={`${fmtMAD(computed.fraisFixesMad)} MAD`} bold />
                  {computed.partFraisMad > 0 ? (
                    <SummaryLine label="Part frais article" value={`${fmtMAD(computed.partFraisMad)} MAD`} accent="text-indigo-600" />
                  ) : (
                    <div className="flex items-center gap-1.5 pt-1">
                      <AlertCircle className="w-3 h-3 text-amber-400 shrink-0" />
                      <span className="text-[8px] font-bold text-amber-500 uppercase">CBM article non défini — frais fixes non imputés</span>
                    </div>
                  )}
                </div>
              </div>

              {/* ─── Valeur douane + taxes ──────────────────────────────────────── */}
              <div className="bg-white rounded-2xl border border-stone-100 p-4 shadow-sm space-y-0.5">
                <p className="text-[9px] font-black text-stone-400 uppercase tracking-widest mb-3 flex items-center gap-1.5">
                  <FileText className="w-3 h-3" /> Douanes & Taxes
                </p>

                {/* Source badge */}
                <div className="flex items-center gap-2 mb-3">
                  {computed.douaneSource === 'declared' ? (
                    <span className="inline-flex items-center gap-1 px-2.5 py-1 bg-emerald-50 border border-emerald-200 rounded-full text-[8px] font-black text-emerald-700 uppercase tracking-widest">
                      <CheckCircle className="w-2.5 h-2.5" /> Valeur déclarée (Audit Analytique)
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-1 px-2.5 py-1 bg-amber-50 border border-amber-200 rounded-full text-[8px] font-black text-amber-700 uppercase tracking-widest">
                      <AlertCircle className="w-2.5 h-2.5" /> Calculée (FOB + Fret — aucune valeur déclarée saisie)
                    </span>
                  )}
                </div>

                {computed.douaneSource === 'declared' && (
                  <SummaryLine
                    label="Valeur déclarée dossier (total)"
                    value={`$${fmt(computed.dossierDeclaredValue)}`}
                    accent="text-stone-400"
                  />
                )}
                <SummaryLine
                  label={computed.douaneSource === 'declared'
                    ? `Valeur douane article (part proratisée)`
                    : `Valeur en douane (FOB + Fret)`}
                  value={`$${fmt(computed.valeurDouane$)}`}
                  bold
                />


                {/* Tax lines */}
                <div className="mt-2 space-y-0.5">
                  <SummaryLine
                    label={`DI (${fmt(computed.importDutyRate, 1)}%)`}
                    value={computed.importDutyRate > 0 ? `$${fmt(computed.di$)}` : '—'}
                    accent={computed.importDutyRate > 0 ? "text-blue-600" : "text-stone-300"}
                  />
                  <SummaryLine
                    label={`TPI (${fmt(computed.tpiRate, 1)}%)`}
                    value={computed.tpiRate > 0 ? `$${fmt(computed.tpi$)}` : '—'}
                    accent={computed.tpiRate > 0 ? "text-violet-600" : "text-stone-300"}
                  />
                  <SummaryLine
                    label={`TIC (${fmt(computed.ticRate, 1)}%)`}
                    value={computed.ticRate > 0 ? `$${fmt(computed.tic$)}` : '—'}
                    accent={computed.ticRate > 0 ? "text-orange-600" : "text-stone-300"}
                  />
                  <SummaryLine
                    label={`TVA (${fmt(computed.tvaRate, 1)}%)`}
                    value={`$${fmt(computed.tva$)}`}
                    accent="text-red-600"
                  />
                </div>

                {(computed.importDutyRate === 0 && computed.tpiRate === 0 && computed.ticRate === 0) && (
                  <div className="flex items-center gap-1.5 mt-2">
                    <Info className="w-3 h-3 text-stone-300 shrink-0" />
                    <span className="text-[8px] font-bold text-stone-400 uppercase">Taux DI/TPI/TIC non définis sur cet article — vérifiez la catégorie</span>
                  </div>
                )}

                <SummaryLine label="Total taxes import" value={`$${fmt(computed.totalTaxes$)} · ${fmtMAD(computed.totalTaxesMad)} MAD`} bold accent="text-red-600" />
              </div>

              {/* ─── Prix de revient final ──────────────────────────────────────── */}
              <div className="bg-stone-900 rounded-2xl p-5 relative overflow-hidden">
                <div className="absolute top-0 right-0 w-40 h-40 bg-emerald-500/10 rounded-full -translate-y-1/2 translate-x-1/2 blur-3xl pointer-events-none" />
                <div className="relative z-10">
                  <p className="text-[8px] font-black text-stone-400 uppercase tracking-[0.3em] mb-4 flex items-center gap-1.5">
                    <TrendingUp className="w-3 h-3" /> Prix de Revient (Coût Total)
                  </p>

                  <div className="space-y-2 mb-4">
                    <div className="flex justify-between items-center">
                      <span className="text-[9px] font-bold text-stone-400 uppercase">Achat FOB</span>
                      <span className="text-[10px] font-black text-stone-300">{fmtMAD(computed.coutAchatMad)} MAD</span>
                    </div>
                    <div className="flex justify-between items-center">
                      <span className="text-[9px] font-bold text-stone-400 uppercase">Part Fret</span>
                      <span className="text-[10px] font-black text-stone-300">{fmtMAD(computed.fretPartMad)} MAD</span>
                    </div>
                    <div className="flex justify-between items-center">
                      <span className="text-[9px] font-bold text-stone-400 uppercase">Taxes Douane</span>
                      <span className="text-[10px] font-black text-red-400">{fmtMAD(computed.totalTaxesMad)} MAD</span>
                    </div>
                    <div className="flex justify-between items-center">
                      <span className="text-[9px] font-bold text-stone-400 uppercase">Frais Dossier (part)</span>
                      <span className="text-[10px] font-black text-amber-400">{fmtMAD(computed.partFraisMad)} MAD</span>
                    </div>
                  </div>

                  <div className="border-t border-stone-700 pt-4 grid grid-cols-2 gap-4">
                    <div>
                      <p className="text-[8px] font-black text-stone-500 uppercase tracking-widest mb-1">Coût Total</p>
                      <p className="text-2xl font-black text-emerald-400 leading-none">{fmtMAD(computed.coutTotalMad)}</p>
                      <p className="text-[8px] font-bold text-stone-500 mt-0.5">MAD · {fmt(computed.coutTotal$)} $</p>
                    </div>
                    <div className="border-l border-stone-700 pl-4">
                      <p className="text-[8px] font-black text-stone-500 uppercase tracking-widest mb-1">Coût Unitaire</p>
                      <p className="text-2xl font-black text-amber-400 leading-none">{fmtMAD(computed.coutUniteMad)}</p>
                      <p className="text-[8px] font-bold text-stone-500 mt-0.5">MAD / {article.unitOfMeasure || 'u'} · {fmt(computed.coutUnite$)} $</p>
                    </div>
                  </div>

                  {computed.isEstimated && (
                    <div className="mt-4 flex items-start gap-2 bg-amber-500/10 border border-amber-500/20 rounded-xl p-3">
                      <AlertCircle className="w-3.5 h-3.5 text-amber-400 shrink-0 mt-0.5" />
                      <p className="text-[8px] font-bold text-amber-300 uppercase leading-relaxed">
                        Simulation basée sur les hypothèses : CBM={CBM_CONTAINER_STD}m³, Fret moyen+frais fixes {fmtMAD(TOTAL_FRAIS_FIXES_MAD)} MAD.
                        {computed.cbmArticle === 0 ? ' ⚠ CBM article non défini — les frais de dossier ne sont pas répartis.' : ''}
                      </p>
                    </div>
                  )}
                </div>
              </div>

              {/* ─── Close ──────────────────────────────────────────────────────── */}
              <Button
                onClick={() => onOpenChange(false)}
                className="w-full h-12 bg-stone-900 hover:bg-black text-white font-black uppercase text-[10px] tracking-widest rounded-2xl"
              >
                Fermer
              </Button>
            </>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
