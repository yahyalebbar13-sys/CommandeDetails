"use client";

import React, { useMemo, useState } from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow
} from '@/components/ui/table';
import {
  Calculator, ChevronDown, AlertTriangle, CheckCircle2,
  FileText, Truck, Package, DollarSign, TrendingUp, Info, FileDown
} from 'lucide-react';
import { exportCostAnalysisPDF } from '@/lib/pdf-export';

interface CostAnalysisViewProps {
  articles: any[];
  factures: any[];
  subCategories: any[];
}

export default function CostAnalysisView({ articles, factures, subCategories }: CostAnalysisViewProps) {
  const [selectedFactureId, setSelectedFactureId] = useState<string | null>(
    factures.length > 0 ? factures[0].id : null
  );

  const selectedFacture = useMemo(
    () => factures.find(f => f.id === selectedFactureId) || null,
    [factures, selectedFactureId]
  );

  // Articles linked to this dossier with status SHIPPED
  const dossierArticles = useMemo(
    () => articles.filter(a => a.factureId === selectedFactureId),
    [articles, selectedFactureId]
  );

  const analysis = useMemo(() => {
    if (!selectedFacture) return null;

    // ── Taux de change ──
    const invoicePaidDhs = Number(selectedFacture.invoicePaidDhs) || 0;
    const declaredValue = Number(selectedFacture.declaredValue) || 0;
    const tauxChange = declaredValue > 0 ? invoicePaidDhs / declaredValue : 0;

    // ── Frais logistiques totaux du dossier (MAD) ──
    const exchange = Number(selectedFacture.exchangeInvoiceAmount) || 0;
    const transitaire = Number(selectedFacture.supplierInvoiceAmount) || 0;
    const fraisSupp = Number(selectedFacture.additionalCostsAmount) || 0;
    const fretMad = (Number(selectedFacture.freightCost) || 0) * tauxChange;
    const mtFraisTotal = exchange + transitaire + fraisSupp + fretMad;

    // ── CBM total du dossier ──
    const cbmTotal = dossierArticles.reduce((s, a) => s + (Number(a.cubicMeasurement) || 0), 0);

    // ── Calcul par article ──
    const rows = dossierArticles.map(a => {
      const cbm = Number(a.cubicMeasurement) || 0;
      const nw = Number(a.netWeight) || 0;
      const qty = Number(a.quantity) || 0;

      // Frais affectés (répartition CBM)
      const fraisCmd = cbmTotal > 0 ? (cbm / cbmTotal) * mtFraisTotal : 0;

      // Données douanières du pôle (category)
      const cat = subCategories.find(c => c.name === a.categoryId);
      const customsValuePerKg = cat?.customsValuePerKg != null ? Number(cat.customsValuePerKg) : null;
      const importDutyRate = cat?.importDutyRate != null ? Number(cat.importDutyRate) / 100 : null;
      const tpiRate = cat?.tpiRate != null ? Number(cat.tpiRate) / 100 : null;
      const tvaRate = cat?.tvaRate != null ? Number(cat.tvaRate) / 100 : null;
      const hasCustData = customsValuePerKg !== null;

      // Valeur douane CMD
      const valDouane = hasCustData ? nw * customsValuePerKg! : 0;
      const di = importDutyRate != null ? valDouane * importDutyRate : 0;
      const tpi = tpiRate != null ? valDouane * tpiRate : 0;
      const tva = tvaRate != null ? (valDouane + di + tpi) * tvaRate : 0;
      const totalDouane = di + tpi + tva;

      // Valeur d'achat de la CMD convertie en MAD (depuis la facture originale)
      const pauDollar = Number(a.purchasePricePerUnit) || 0;
      const valAchatMad = qty * pauDollar * tauxChange;

      // MT Total = valeur achat MAD + frais logistiques + droits douane
      const mtTotal = valAchatMad + fraisCmd + totalDouane;
      const pauTtc = qty > 0 ? mtTotal / qty : 0;

      return {
        ...a,
        cbm, nw, qty, pauDollar,
        valAchatMad,
        fraisCmd,
        cat,
        customsValuePerKg, importDutyRate, tpiRate, tvaRate,
        hasCustData,
        valDouane, di, tpi, tva, totalDouane,
        mtTotal, pauTtc,
        missingData: !hasCustData
      };
    });

    return { tauxChange, mtFraisTotal, cbmTotal, exchange, transitaire, fraisSupp, fretMad, rows };
  }, [selectedFacture, dossierArticles, subCategories]);

  const missingCount = analysis?.rows.filter(r => r.missingData).length || 0;

  return (
    <div className="space-y-8 fade-in">
      {/* ── Header ── */}
      <header className="bg-stone-900 rounded-[2rem] p-8 shadow-2xl relative overflow-hidden">
        <div className="absolute top-0 right-0 w-[500px] h-[500px] bg-amber-500/10 rounded-full -translate-y-1/2 translate-x-1/2 blur-[100px]" />
        <div className="relative z-10 flex flex-col lg:flex-row justify-between items-start lg:items-center gap-6">
          <div>
            <div className="flex items-center gap-3 mb-3">
              <div className="p-2.5 bg-amber-500 rounded-xl">
                <Calculator className="w-6 h-6 text-white" />
              </div>
              <div>
                <p className="text-[10px] font-black text-amber-500 uppercase tracking-[0.2em]">Calcul Automatique</p>
                <h2 className="text-3xl font-black text-white tracking-tighter uppercase leading-none">Coût de Revient TTC</h2>
              </div>
            </div>
            <p className="text-stone-400 text-sm font-medium max-w-lg">
              Prix d'achat unitaire TTC par article, incluant frais logistiques (répartis par CBM) et droits de douane.
            </p>
          </div>

          {/* Sélecteur dossier + Export */}
          <div className="flex flex-col gap-2 w-full lg:w-auto">
            <label className="text-[10px] font-black text-stone-500 uppercase tracking-widest">Sélectionner un Dossier</label>
            <div className="flex gap-3">
              <div className="relative flex-1 lg:w-72">
                <select
                  value={selectedFactureId || ''}
                  onChange={e => setSelectedFactureId(e.target.value)}
                  className="w-full bg-white/10 border border-white/20 text-white font-black uppercase text-sm rounded-xl px-4 h-12 appearance-none pr-10 focus:outline-none focus:border-amber-500 transition-colors"
                >
                  {factures.map(f => (
                    <option key={f.id} value={f.id} className="text-stone-900 bg-white">
                      {f.id} — {f.arrivalDate}
                    </option>
                  ))}
                </select>
                <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-stone-400 pointer-events-none" />
              </div>
              {selectedFacture && analysis && (
                <button
                  onClick={() => exportCostAnalysisPDF(selectedFacture, analysis.rows, analysis)}
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
          Sélectionnez un dossier pour voir l'analyse
        </div>
      )}

      {selectedFacture && analysis && (
        <>
          {/* ── Synthèse frais ── */}
          <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-7 gap-4">
            <SyntheseCard
              label="Taux de Change"
              value={analysis.tauxChange > 0 ? analysis.tauxChange.toFixed(4) : '—'}
              sub="MAD/$"
              color="text-blue-600"
              bgColor="bg-blue-50"
              icon={<TrendingUp className="w-4 h-4" />}
            />
            <SyntheseCard
              label="Fret Maritime"
              value={analysis.fretMad.toLocaleString('fr-MA', { maximumFractionDigits: 0 })}
              sub="MAD"
              color="text-indigo-600"
              bgColor="bg-indigo-50"
              icon={<Truck className="w-4 h-4" />}
            />
            <SyntheseCard
              label="Fact. Échange"
              value={analysis.exchange.toLocaleString('fr-MA', { maximumFractionDigits: 0 })}
              sub="MAD"
              color="text-violet-600"
              bgColor="bg-violet-50"
              icon={<DollarSign className="w-4 h-4" />}
            />
            <SyntheseCard
              label="Fact. Transitaire"
              value={analysis.transitaire.toLocaleString('fr-MA', { maximumFractionDigits: 0 })}
              sub="MAD"
              color="text-purple-600"
              bgColor="bg-purple-50"
              icon={<FileText className="w-4 h-4" />}
            />
            <SyntheseCard
              label="Frais Supp."
              value={analysis.fraisSupp.toLocaleString('fr-MA', { maximumFractionDigits: 0 })}
              sub="MAD"
              color="text-rose-600"
              bgColor="bg-rose-50"
              icon={<Package className="w-4 h-4" />}
            />
            <SyntheseCard
              label="CBM Total"
              value={analysis.cbmTotal.toLocaleString('fr-MA', { maximumFractionDigits: 3 })}
              sub="m³"
              color="text-emerald-600"
              bgColor="bg-emerald-50"
              icon={<Package className="w-4 h-4" />}
            />
            <div className="col-span-1 bg-amber-500 rounded-2xl p-4 flex flex-col justify-between shadow-lg shadow-amber-500/20">
              <p className="text-[9px] font-black text-amber-100 uppercase tracking-widest">Total Frais Log.</p>
              <div>
                <p className="text-2xl font-black text-white leading-none">
                  {analysis.mtFraisTotal.toLocaleString('fr-MA', { maximumFractionDigits: 0 })}
                </p>
                <p className="text-[10px] font-bold text-amber-200 mt-1">MAD</p>
              </div>
            </div>
          </div>

          {/* Warning articles sans données douanières */}
          {missingCount > 0 && (
            <div className="flex items-start gap-3 bg-amber-50 border border-amber-200 rounded-2xl p-4">
              <AlertTriangle className="w-5 h-5 text-amber-500 shrink-0 mt-0.5" />
              <div>
                <p className="text-[11px] font-black text-amber-800 uppercase tracking-tight">
                  {missingCount} article{missingCount > 1 ? 's' : ''} sans données douanières
                </p>
                <p className="text-[10px] font-bold text-amber-600 mt-0.5">
                  Ces articles n'ont pas de valeur en douane par kg définie dans "Audit Analytique Produit". Le calcul des droits sera à zéro.
                </p>
              </div>
            </div>
          )}

          {/* ── Tableau détaillé ── */}
          <div className="bg-white rounded-3xl shadow-xl border border-stone-100 overflow-hidden">
            <div className="bg-stone-900 px-8 py-5 flex items-center justify-between">
              <div>
                <p className="text-[9px] font-black text-stone-500 uppercase tracking-widest mb-1">Dossier {selectedFacture.id}</p>
                <h3 className="text-lg font-black text-white uppercase tracking-tight">
                  Détail P.A.U TTC par Article
                </h3>
              </div>
              <Badge className="bg-amber-500 text-white border-none text-[9px] font-black uppercase tracking-widest px-3 py-1">
                {analysis.rows.length} articles
              </Badge>
            </div>

            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow className="bg-stone-50 border-b border-stone-100">
                    <TableHead className="text-[9px] font-black uppercase text-stone-400 py-4 px-6 min-w-[180px]">Article</TableHead>
                    <TableHead className="text-[9px] font-black uppercase text-stone-400 py-4 text-right">QTÉ</TableHead>
                    <TableHead className="text-[9px] font-black uppercase text-stone-400 py-4 text-right">NW (kg)</TableHead>
                    <TableHead className="text-[9px] font-black uppercase text-stone-400 py-4 text-right">CBM</TableHead>
                    {/* Valeur achat en MAD */}
                    <TableHead className="text-[9px] font-black uppercase text-sky-500 py-4 text-right bg-sky-50/30">Val. Achat (MAD)</TableHead>
                    {/* Frais logistiques */}
                    <TableHead className="text-[9px] font-black uppercase text-indigo-400 py-4 text-right bg-indigo-50/30">Frais Log. (MAD)</TableHead>
                    {/* Douane */}
                    <TableHead className="text-[9px] font-black uppercase text-orange-400 py-4 text-right bg-orange-50/30">Val. Douane (MAD)</TableHead>
                    <TableHead className="text-[9px] font-black uppercase text-orange-400 py-4 text-right bg-orange-50/30">DI (MAD)</TableHead>
                    <TableHead className="text-[9px] font-black uppercase text-orange-400 py-4 text-right bg-orange-50/30">TPI (MAD)</TableHead>
                    <TableHead className="text-[9px] font-black uppercase text-orange-400 py-4 text-right bg-orange-50/30">TVA (MAD)</TableHead>
                    <TableHead className="text-[9px] font-black uppercase text-orange-400 py-4 text-right bg-orange-50/30">Tot. Douane (MAD)</TableHead>
                    {/* Total */}
                    <TableHead className="text-[9px] font-black uppercase text-stone-400 py-4 text-right">MT Total (MAD)</TableHead>
                    {/* PAU */}
                    <TableHead className="text-[9px] font-black uppercase text-emerald-600 py-4 text-right bg-emerald-50/50 pr-6">P.A.U TTC (MAD)</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {analysis.rows.length === 0 && (
                    <TableRow>
                      <TableCell colSpan={13} className="text-center py-16 text-stone-300 font-black uppercase text-[10px] tracking-widest">
                        Aucun article lié à ce dossier
                      </TableCell>
                    </TableRow>
                  )}
                  {analysis.rows.map(row => (
                    <TableRow
                      key={row.id}
                      className={`border-stone-50 hover:bg-stone-50/50 transition-colors ${row.missingData ? 'bg-amber-50/20' : ''}`}
                    >
                      {/* Article */}
                      <TableCell className="py-4 px-6">
                        <div className="font-black text-[11px] text-stone-900 uppercase leading-tight">{row.name}</div>
                        <div className="text-[9px] text-stone-400 font-bold uppercase mt-0.5">{row.categoryId}</div>
                        {row.missingData ? (
                          <span className="inline-flex items-center gap-1 text-[8px] font-black text-amber-600 bg-amber-100 px-1.5 py-0.5 rounded mt-1 uppercase">
                            <AlertTriangle className="w-2.5 h-2.5" /> Sans données douane
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 text-[8px] font-black text-emerald-600 bg-emerald-50 px-1.5 py-0.5 rounded mt-1 uppercase">
                            <CheckCircle2 className="w-2.5 h-2.5" /> {row.cat?.hsCode || 'HS défini'}
                          </span>
                        )}
                      </TableCell>

                      {/* QTÉ */}
                      <TableCell className="text-right font-black text-[11px] text-stone-900 py-4">
                        {Number(row.qty).toLocaleString('fr-MA')}
                        <div className="text-[8px] text-stone-400 font-bold uppercase">{row.unitOfMeasure}</div>
                      </TableCell>

                      {/* NW */}
                      <TableCell className="text-right font-bold text-[10px] text-stone-600 py-4">
                        {row.nw > 0 ? row.nw.toLocaleString('fr-MA', { maximumFractionDigits: 2 }) : <span className="text-stone-300">—</span>}
                      </TableCell>

                      {/* CBM */}
                      <TableCell className="text-right font-bold text-[10px] text-stone-600 py-4">
                        {row.cbm > 0 ? row.cbm.toLocaleString('fr-MA', { maximumFractionDigits: 4 }) : <span className="text-stone-300">—</span>}
                      </TableCell>

                      {/* Valeur achat en MAD */}
                      <TableCell className="text-right font-black text-[11px] text-sky-700 py-4 bg-sky-50/20">
                        {analysis.tauxChange > 0 && row.pauDollar > 0
                          ? row.valAchatMad.toLocaleString('fr-MA', { maximumFractionDigits: 2 })
                          : <span className="text-stone-300 font-normal text-[9px]">—</span>
                        }
                        {row.pauDollar > 0 && (
                          <div className="text-[8px] text-sky-400 font-bold">{row.pauDollar.toLocaleString('fr-MA', { maximumFractionDigits: 4 })} $ × {analysis.tauxChange.toFixed(4)}</div>
                        )}
                      </TableCell>

                      {/* Frais logistiques */}
                      <TableCell className="text-right font-black text-[11px] text-indigo-700 py-4 bg-indigo-50/20">
                        {row.cbm > 0
                          ? row.fraisCmd.toLocaleString('fr-MA', { maximumFractionDigits: 2 })
                          : <span className="text-stone-300 font-normal text-[9px]">CBM manquant</span>
                        }
                      </TableCell>

                      {/* Valeur douane */}
                      <TableCell className="text-right font-bold text-[10px] text-orange-600 py-4 bg-orange-50/20">
                        {row.hasCustData && row.nw > 0
                          ? row.valDouane.toLocaleString('fr-MA', { maximumFractionDigits: 2 })
                          : <span className="text-stone-300 font-normal text-[9px]">—</span>
                        }
                      </TableCell>

                      {/* DI */}
                      <MontantCell value={row.di} hasData={row.hasCustData && row.nw > 0} rate={row.importDutyRate} />

                      {/* TPI */}
                      <MontantCell value={row.tpi} hasData={row.hasCustData && row.nw > 0} rate={row.tpiRate} />

                      {/* TVA */}
                      <MontantCell value={row.tva} hasData={row.hasCustData && row.nw > 0} rate={row.tvaRate} />

                      {/* Total douane */}
                      <TableCell className="text-right font-black text-[11px] text-orange-700 py-4 bg-orange-50/20">
                        {row.hasCustData && row.nw > 0
                          ? row.totalDouane.toLocaleString('fr-MA', { maximumFractionDigits: 2 })
                          : <span className="text-stone-300 font-normal text-[9px]">—</span>
                        }
                      </TableCell>

                      {/* MT Total */}
                      <TableCell className="text-right font-black text-[11px] text-stone-900 py-4">
                        {row.mtTotal > 0
                          ? row.mtTotal.toLocaleString('fr-MA', { maximumFractionDigits: 2 })
                          : <span className="text-stone-300 font-normal text-[9px]">—</span>
                        }
                      </TableCell>

                      {/* PAU TTC ← colonne finale */}
                      <TableCell className="text-right py-4 pr-6 bg-emerald-50/40">
                        {row.pauTtc > 0 ? (
                          <div>
                            <p className="font-black text-base text-emerald-700 leading-none">
                              {row.pauTtc.toLocaleString('fr-MA', { minimumFractionDigits: 2, maximumFractionDigits: 4 })}
                            </p>
                            <p className="text-[8px] font-black text-emerald-500 uppercase mt-0.5">MAD / {row.unitOfMeasure || 'U'}</p>
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

            {/* Légende */}
            <div className="px-6 py-4 bg-stone-50 border-t border-stone-100 flex flex-wrap gap-6 text-[9px] font-bold text-stone-500 uppercase">
              <span className="flex items-center gap-1.5"><span className="w-3 h-3 rounded-sm bg-sky-200 inline-block" /> Valeur achat (qty × PA$ × taux)</span>
              <span className="flex items-center gap-1.5"><span className="w-3 h-3 rounded-sm bg-indigo-200 inline-block" /> Frais logistiques (CBM)</span>
              <span className="flex items-center gap-1.5"><span className="w-3 h-3 rounded-sm bg-orange-200 inline-block" /> Droits de douane (pôle)</span>
              <span className="flex items-center gap-1.5"><span className="w-3 h-3 rounded-sm bg-emerald-200 inline-block" /> P.A.U TTC Final</span>
              <span className="ml-auto flex items-center gap-1.5 italic normal-case text-stone-400">
                <Info className="w-3 h-3" /> MT_Total = Val_Achat_MAD + Frais_Log + Droits_Douane — P.A.U_TTC = MT_Total ÷ Qté
              </span>
            </div>
          </div>
        </>
      )}
    </div>
  );
}

function SyntheseCard({ label, value, sub, color, bgColor, icon }: {
  label: string; value: string; sub: string;
  color: string; bgColor: string; icon: React.ReactNode;
}) {
  return (
    <div className={`${bgColor} rounded-2xl p-4 border border-white flex flex-col gap-2`}>
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

function MontantCell({ value, hasData, rate }: { value: number; hasData: boolean; rate: number | null }) {
  if (!hasData) {
    return <TableCell className="text-right text-stone-300 text-[9px] font-normal py-4 bg-orange-50/20">—</TableCell>;
  }
  return (
    <TableCell className="text-right font-bold text-[10px] text-orange-600 py-4 bg-orange-50/20">
      <div>{value.toLocaleString('fr-MA', { maximumFractionDigits: 2 })}</div>
      {rate != null && (
        <div className="text-[8px] text-orange-300 font-bold">{(rate * 100).toFixed(0)}%</div>
      )}
    </TableCell>
  );
}
