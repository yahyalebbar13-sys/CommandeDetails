"use client";

import React, { useMemo, useState, useEffect } from 'react';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import {
  ShoppingCart, ChevronDown, AlertTriangle, Info, FileDown, Loader2, TrendingUp, DollarSign, FileText, Package
} from 'lucide-react';
import { exportCostSalePDF } from '@/lib/pdf-export';
import { useFirebase } from '@/firebase';
import { doc, getDoc } from 'firebase/firestore';

const MARGE_RATE = 0.05;

interface CostSaleViewProps {
  articles: any[];
  factures: any[];
  subCategories: any[];
}

export default function CostSaleView({ articles, factures, subCategories }: CostSaleViewProps) {
  const { user, firestore } = useFirebase();
  const [selectedFactureId, setSelectedFactureId] = useState<string | null>(
    factures.length > 0 ? factures[0].id : null
  );
  const [puMap, setPuMap] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(false);

  const selectedFacture = useMemo(
    () => factures.find(f => f.id === selectedFactureId) || null,
    [factures, selectedFactureId]
  );

  // Load saved DP puMap from Firebase when dossier changes
  useEffect(() => {
    if (!selectedFactureId || !firestore || !user) return;
    setLoading(true);
    setPuMap({});
    getDoc(doc(firestore, 'users', user.uid, 'dp_declarations', selectedFactureId))
      .then(snap => {
        if (snap.exists()) {
          const data = snap.data();
          if (data.puMap) setPuMap(data.puMap);
        }
      })
      .catch(err => console.error('DP load error:', err))
      .finally(() => setLoading(false));
  }, [selectedFactureId, firestore, user]);

  // Group articles by category (same logic as dp-view)
  const categoryLines = useMemo(() => {
    if (!selectedFactureId) return [];
    const dossierArticles = articles.filter(a => a.factureId === selectedFactureId);
    const map: Record<string, { qty: number; nw: number; cbm: number; unit: string }> = {};
    for (const a of dossierArticles) {
      const cat = a.categoryId || '—';
      if (!map[cat]) map[cat] = { qty: 0, nw: 0, cbm: 0, unit: a.unitOfMeasure || 'U' };
      map[cat].qty += Number(a.quantity) || 0;
      map[cat].nw += Number(a.netWeight) || 0;
      map[cat].cbm += Number(a.cubicMeasurement) || 0;
    }
    return Object.entries(map)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([categoryId, { qty, nw, cbm, unit }]) => {
        const cat = subCategories.find(c => c.name === categoryId);
        return { categoryId, totalQty: qty, totalNW: nw, totalCBM: cbm, unit, cat };
      });
  }, [articles, selectedFactureId, subCategories]);

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
      const { categoryId, totalQty: qty, totalNW: nw, totalCBM: cbm, unit, cat } = line;

      // PU from DP declaration (USD)
      const puDollar = parseFloat(puMap[categoryId] ?? '') || 0;
      const valAchatMad = qty * puDollar * tauxChange;

      // Logistics prorated by CBM
      const fraisCmd = cbmTotal > 0 ? (cbm / cbmTotal) * mtFraisTotal : 0;

      // Customs
      const customsValuePerKg = cat?.customsValuePerKg != null ? Number(cat.customsValuePerKg) : null;
      const importDutyRate = cat?.importDutyRate != null ? Number(cat.importDutyRate) / 100 : null;
      const tpiRate = cat?.tpiRate != null ? Number(cat.tpiRate) / 100 : null;
      const ticRate = cat?.ticRate != null ? Number(cat.ticRate) / 100 : null;
      const tvaRate = cat?.tvaRate != null ? Number(cat.tvaRate) / 100 : null;
      const hasCustData = customsValuePerKg !== null;

      const valDouane = hasCustData ? nw * customsValuePerKg! : 0;
      const di = importDutyRate != null ? valDouane * importDutyRate : 0;
      const tpi = tpiRate != null ? valDouane * tpiRate : 0;
      const tic = ticRate != null ? valDouane * ticRate : 0;

      const totalHT = valAchatMad + fraisCmd + di + tpi + tic;
      const marge = totalHT * MARGE_RATE;
      // TVA = (Total HT + Marge) × taux TVA
      const baseTva = totalHT + marge;
      const tva = tvaRate != null ? baseTva * tvaRate : 0;
      const totalVenteTtc = baseTva + tva;
      const pvuTtc = qty > 0 ? totalVenteTtc / qty : 0;

      return {
        categoryId, qty, nw, cbm, unit, cat,
        puDollar, valAchatMad, fraisCmd,
        customsValuePerKg, importDutyRate, tpiRate, ticRate, tvaRate,
        hasCustData, valDouane, di, tpi, tic,
        totalHT, marge, baseTva, tva, totalVenteTtc, pvuTtc,
        missingDP: puDollar === 0,
        missingCust: !hasCustData,
      };
    });

    const totalMarge = rows.reduce((s, r) => s + r.marge, 0);
    const totalTVA = rows.reduce((s, r) => s + r.tva, 0);

    return { tauxChange, mtFraisTotal, cbmTotal, exchange, transitaire, fraisSupp, totalMarge, totalTVA, rows };
  }, [selectedFacture, categoryLines, subCategories, puMap]);

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
            <label className="text-[10px] font-black text-stone-500 uppercase tracking-widest">Sélectionner un Dossier</label>
            <div className="flex gap-3">
              <div className="relative flex-1 lg:w-72">
                <select
                  value={selectedFactureId || ''}
                  onChange={e => setSelectedFactureId(e.target.value)}
                  className="w-full bg-white/10 border border-white/20 text-white font-black uppercase text-sm rounded-xl px-4 h-12 appearance-none pr-10 focus:outline-none focus:border-emerald-500 transition-colors"
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
                  onClick={() => exportCostSalePDF(selectedFacture, analysis.rows, analysis)}
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
                        <div className="font-black text-[12px] text-stone-900 uppercase">{row.categoryId}</div>
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
