"use client";

import React, { useState, useMemo } from 'react';
import { FileDown, ReceiptText, Calculator, Search, Package } from 'lucide-react';
import { exportDevisClientPIPDF } from '@/lib/pdf-export';

interface DevisPIViewProps {
  articles: any[];
  factures: any[];
  categories: any[];
}

const DEFAULT_TAUX = 10.5;
const DEFAULT_MARGE = 15;
const DEFAULT_FRAIS = { transit: 6000, change: 6500, supp: 1500 };
const CBM_STD = 68;

export default function DevisPIView({ articles, factures, categories }: DevisPIViewProps) {
  const [search, setSearch] = useState('');
  const [selectedArticle, setSelectedArticle] = useState<any | null>(null);
  const [tauxChange, setTauxChange] = useState(String(DEFAULT_TAUX));
  const [margePercent, setMargePercent] = useState(String(DEFAULT_MARGE));
  const [fraisTransit, setFraisTransit] = useState(String(DEFAULT_FRAIS.transit));
  const [fraisChange, setFraisChange] = useState(String(DEFAULT_FRAIS.change));
  const [fraisSupp, setFraisSupp] = useState(String(DEFAULT_FRAIS.supp));
  const [isExporting, setIsExporting] = useState(false);

  // Only PI articles that have a clientName assigned
  const piArticles = useMemo(() =>
    articles.filter(a => ['PI', 'pi', 'SHIPPED', 'shipped'].includes(a.status) && a.clientName && a.clientName.trim() !== '')
      .filter(a => {
        if (!search.trim()) return true;
        const q = search.toLowerCase();
        return (a.categoryId || '').toLowerCase().includes(q) ||
          (a.name || '').toLowerCase().includes(q) ||
          (a.supplierId || '').toLowerCase().includes(q) ||
          (a.clientName || '').toLowerCase().includes(q);
      })
      .sort((a, b) => (a.clientName || '').localeCompare(b.clientName || '') || (a.categoryId || '').localeCompare(b.categoryId || ''))
  , [articles, search]);

  // Compute cost for selected article
  const computed = useMemo(() => {
    if (!selectedArticle) return null;
    const tc = Number(tauxChange) || DEFAULT_TAUX;
    const qty = Number(selectedArticle.quantity) || 0;
    const prix = Number(selectedArticle.purchasePricePerUnit) || 0;
    const cbm = Number(selectedArticle.cubicMeasurement) || 0;

    const fraisTransitMad = Number(fraisTransit) || 0;
    const fraisChangeMad = Number(fraisChange) || 0;
    const fraisSuppMad = Number(fraisSupp) || 0;
    const totalFrais = fraisTransitMad + fraisChangeMad + fraisSuppMad;

    const linkedFac = factures.find(f => f.id === selectedArticle.factureId);
    const fretTotal$ = linkedFac ? (Number(linkedFac.freightCost) || 0) : 1500;
    const cbmTotal = linkedFac
      ? (articles.filter(a => a.factureId === linkedFac.id).reduce((s: number, a: any) => s + (Number(a.cubicMeasurement) || 0), 0) || CBM_STD)
      : CBM_STD;

    const partFret$ = cbm > 0 && cbmTotal > 0 ? (cbm / cbmTotal) * fretTotal$ : 0;
    const partFraisMad = cbm > 0 && cbmTotal > 0 ? (cbm / cbmTotal) * totalFrais : 0;

    const cat = categories.find(c => c.name === selectedArticle.categoryId || c.id === selectedArticle.categoryId);
    const nw = Number(selectedArticle.netWeight) || 0;
    const customsVpKg = Number(cat?.customsValuePerKg) || 0;
    const di = (cat?.importDutyRate ?? 0) / 100;
    const tpi = (cat?.tpiRate ?? 0) / 100;
    const tic = (cat?.ticRate ?? 0) / 100;
    const tva = (cat?.tvaRate ?? 20) / 100;

    let totalTaxesMad = 0;
    if (nw > 0 && customsVpKg > 0) {
      const base = nw * customsVpKg;
      const diMad = base * di; const tpiMad = base * tpi; const ticMad = base * tic;
      const tvaMad = (base + diMad + tpiMad + ticMad) * tva;
      totalTaxesMad = diMad + tpiMad + ticMad + tvaMad;
    }

    const coutAchatMad = qty * prix * tc;
    const fretPartMad = partFret$ * tc;
    const coutTotalMad = coutAchatMad + fretPartMad + totalTaxesMad + partFraisMad;
    const coutUniteMad = qty > 0 ? coutTotalMad / qty : 0;
    const marge = Number(margePercent) || 0;
    const prixVenteUniteMad = coutUniteMad * (1 + marge / 100);
    const prixVenteTotalMad = coutTotalMad * (1 + marge / 100);

    return {
      qty, prix, cbm, cbmTotal, fretTotal$, partFret$, partFraisMad,
      totalFrais, coutAchatMad, fretPartMad, totalTaxesMad,
      coutTotalMad, coutUniteMad, prixVenteUniteMad, prixVenteTotalMad,
      fraisTransitMad, fraisChangeMad, fraisSuppMad,
      isEstimated: !linkedFac,
    };
  }, [selectedArticle, tauxChange, margePercent, fraisTransit, fraisChange, fraisSupp, articles, factures, categories]);

  const fmtMAD = (n: number) => n.toLocaleString('fr-MA', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

  const handleExport = async () => {
    if (!computed || !selectedArticle) return;
    setIsExporting(true);
    try {
      await exportDevisClientPIPDF({
        article: selectedArticle,
        tauxChange: Number(tauxChange) || DEFAULT_TAUX,
        coutTotalMad: computed.coutTotalMad,
        coutUniteMad: computed.coutUniteMad,
        'coutTotal$': computed.coutTotalMad / (Number(tauxChange) || DEFAULT_TAUX),
        'coutUnite$': computed.coutUniteMad / (Number(tauxChange) || DEFAULT_TAUX),
        margePercent: Number(margePercent) || 0,
        prixVenteUniteMad: computed.prixVenteUniteMad,
        prixVenteTotalMad: computed.prixVenteTotalMad,
        isEstimated: computed.isEstimated,
        fraisDetails: {
          fraisTransitMad: computed.fraisTransitMad,
          fraisChangeMad: computed.fraisChangeMad,
          fraisSuppMad: computed.fraisSuppMad,
          fretPartMad: computed.fretPartMad,
          totalTaxesMad: computed.totalTaxesMad,
          coutAchatMad: computed.coutAchatMad,
        },
      });
    } finally { setIsExporting(false); }
  };

  return (
    <div className="space-y-6 fade-in">
      {/* Header */}
      <header className="bg-stone-900 rounded-[2rem] p-8 shadow-2xl relative overflow-hidden">
        <div className="absolute top-0 right-0 w-96 h-96 bg-amber-500/10 rounded-full -translate-y-1/2 translate-x-1/2 blur-[80px]" />
        <div className="relative z-10 flex flex-col lg:flex-row justify-between items-start lg:items-center gap-6">
          <div>
            <div className="flex items-center gap-3 mb-2">
              <div className="p-2.5 bg-amber-500 rounded-xl"><ReceiptText className="w-6 h-6 text-white" /></div>
              <div>
                <p className="text-[10px] font-black text-amber-500 uppercase tracking-[0.2em]">Usage confidentiel</p>
                <h2 className="text-3xl font-black text-white tracking-tighter uppercase leading-none">Devis Client PI</h2>
              </div>
            </div>
            <p className="text-stone-400 text-sm font-medium max-w-lg">
              Calculez le prix de vente estimatif à communiquer au client, basé sur le coût de revient TTC des articles en production.
            </p>
          </div>
        </div>
      </header>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* LEFT — Article selector */}
        <div className="bg-white rounded-3xl shadow-xl border border-stone-100 overflow-hidden flex flex-col">
          <div className="bg-stone-900 px-6 py-4 flex items-center gap-3">
            <Package className="w-4 h-4 text-amber-400" />
            <h3 className="text-sm font-black text-white uppercase tracking-tight">Articles PI</h3>
            <span className="ml-auto bg-amber-500/20 text-amber-400 text-[9px] font-black uppercase tracking-widest px-2 py-0.5 rounded-full">{piArticles.length} articles</span>
          </div>
          <div className="p-4 border-b border-stone-100">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-stone-300" />
              <input
                value={search}
                onChange={e => setSearch(e.target.value)}
                placeholder="Rechercher un article PI..."
                className="w-full pl-9 pr-4 h-10 rounded-xl border border-stone-200 text-sm font-bold text-stone-700 focus:outline-none focus:border-amber-400 transition-colors"
              />
            </div>
          </div>
          <div className="overflow-y-auto flex-1" style={{ maxHeight: 420 }}>
            {piArticles.length === 0 ? (
              <div className="py-16 text-center text-stone-300 font-black uppercase text-[10px] tracking-widest">Aucun article PI trouvé</div>
            ) : piArticles.map(a => (
              <button
                key={a.id}
                onClick={() => setSelectedArticle(a)}
                className={`w-full text-left px-5 py-3.5 border-b border-stone-50 flex items-center gap-3 transition-colors ${selectedArticle?.id === a.id ? 'bg-amber-50 border-amber-100' : 'hover:bg-stone-50'}`}
              >
                <div className={`w-2 h-2 rounded-full shrink-0 ${selectedArticle?.id === a.id ? 'bg-amber-500' : 'bg-stone-200'}`} />
                <div className="flex-1 min-w-0">
                  <p className="text-[11px] font-black text-stone-900 uppercase truncate">{a.name || a.categoryId}</p>
                  <p className="text-[9px] font-bold text-stone-400 uppercase mt-0.5">
                    {a.categoryId}
                    {Number(a.quantity) > 0 ? ` · ${Number(a.quantity).toLocaleString('fr-MA')} ${a.unitOfMeasure || 'u'}` : ''}
                    {Number(a.purchasePricePerUnit) > 0 ? ` · $${Number(a.purchasePricePerUnit).toFixed(4)}` : ''}
                  </p>
                </div>
                {selectedArticle?.id === a.id && (
                  <span className="text-[8px] font-black text-amber-600 bg-amber-100 px-2 py-0.5 rounded-full uppercase shrink-0">Sélectionné</span>
                )}
              </button>
            ))}
          </div>
        </div>

        {/* RIGHT — Config + Result */}
        <div className="space-y-4">
          {!selectedArticle ? (
            <div className="bg-white rounded-3xl border border-stone-100 shadow-xl py-24 flex flex-col items-center justify-center gap-4">
              <div className="w-14 h-14 bg-stone-100 rounded-2xl flex items-center justify-center">
                <ReceiptText className="w-7 h-7 text-stone-300" />
              </div>
              <p className="text-[10px] font-black text-stone-300 uppercase tracking-widest">Sélectionnez un article PI</p>
            </div>
          ) : (
            <>
              {/* Article info banner */}
              <div className="bg-stone-900 rounded-2xl px-5 py-4 flex items-center gap-3">
                <div className="flex-1">
                  <p className="text-[9px] font-black text-stone-400 uppercase tracking-widest mb-0.5">Article sélectionné</p>
                  <p className="text-base font-black text-white uppercase">{selectedArticle.name || selectedArticle.categoryId}</p>
                  <p className="text-[9px] font-bold text-amber-400 uppercase mt-0.5">
                    {Number(selectedArticle.quantity) > 0 ? `${Number(selectedArticle.quantity).toLocaleString('fr-MA')} ${selectedArticle.unitOfMeasure || 'u'}` : 'QTE MANQUANTE'}
                    {Number(selectedArticle.purchasePricePerUnit) > 0 ? ` · $${Number(selectedArticle.purchasePricePerUnit).toFixed(4)}/u` : ' · PRIX MANQUANT'}
                    {selectedArticle.supplierId && ` · ${selectedArticle.supplierId}`}
                  </p>
                </div>
              </div>

              {(!selectedArticle.purchasePricePerUnit || !selectedArticle.netWeight || !selectedArticle.cubicMeasurement || !selectedArticle.quantity) ? (
                <div className="bg-red-50 border border-red-100 rounded-2xl p-6 text-center space-y-2">
                  <p className="text-[10px] font-black text-red-500 uppercase tracking-widest">Informations incomplètes</p>
                  <p className="text-sm font-bold text-red-800">Impossible de calculer le devis. Veuillez renseigner :</p>
                  <div className="flex flex-wrap justify-center gap-2 mt-3">
                    {!selectedArticle.quantity && <span className="bg-white text-red-600 text-[10px] font-black px-3 py-1 rounded-full shadow-sm">Quantité</span>}
                    {!selectedArticle.purchasePricePerUnit && <span className="bg-white text-red-600 text-[10px] font-black px-3 py-1 rounded-full shadow-sm">Prix d'achat</span>}
                    {!selectedArticle.netWeight && <span className="bg-white text-red-600 text-[10px] font-black px-3 py-1 rounded-full shadow-sm">Poids Net (NW)</span>}
                    {!selectedArticle.cubicMeasurement && <span className="bg-white text-red-600 text-[10px] font-black px-3 py-1 rounded-full shadow-sm">Volume (CBM)</span>}
                  </div>
                </div>
              ) : (
                <>
                  {/* Parameters */}
                  <div className="bg-white rounded-2xl border border-stone-100 shadow-sm p-5 space-y-4">
                <p className="text-[9px] font-black text-stone-400 uppercase tracking-widest flex items-center gap-1.5"><Calculator className="w-3 h-3" /> Paramètres</p>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-1.5">
                    <label className="text-[8px] font-black text-stone-400 uppercase tracking-widest block">Taux de change (MAD/$)</label>
                    <input type="number" step="0.01" value={tauxChange} onChange={e => setTauxChange(e.target.value)}
                      className="w-full h-10 border border-stone-200 rounded-xl px-3 font-black text-stone-900 text-sm focus:outline-none focus:border-amber-400 transition-colors" />
                    <div className="flex gap-1 flex-wrap">
                      {[10, 10.5, 11, 11.5].map(v => (
                        <button key={v} onClick={() => setTauxChange(String(v))}
                          className={`px-2 py-0.5 rounded-lg text-[8px] font-black border transition-all ${Number(tauxChange) === v ? 'bg-stone-900 text-white border-stone-900' : 'bg-stone-50 text-stone-400 border-stone-100 hover:border-stone-300'}`}>
                          {v}
                        </button>
                      ))}
                    </div>
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-[8px] font-black text-stone-400 uppercase tracking-widest block">Marge (%)</label>
                    <input type="number" step="0.5" min={0} value={margePercent} onChange={e => setMargePercent(e.target.value)}
                      className="w-full h-10 border-2 border-amber-200 rounded-xl px-3 font-black text-stone-900 text-sm focus:outline-none focus:border-amber-400 transition-colors text-center" />
                    <div className="flex gap-1 flex-wrap">
                      {[10, 15, 20, 25, 30].map(v => (
                        <button key={v} onClick={() => setMargePercent(String(v))}
                          className={`px-2 py-0.5 rounded-lg text-[8px] font-black border transition-all ${Number(margePercent) === v ? 'bg-amber-500 text-white border-amber-500' : 'bg-amber-50 text-amber-600 border-amber-100 hover:border-amber-300'}`}>
                          {v}%
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
                <div className="grid grid-cols-3 gap-2 pt-2 border-t border-stone-50">
                  {[
                    { label: 'Transitaire (MAD)', val: fraisTransit, set: setFraisTransit },
                    { label: 'Bureau Change (MAD)', val: fraisChange, set: setFraisChange },
                    { label: 'Frais Supp. (MAD)', val: fraisSupp, set: setFraisSupp },
                  ].map(({ label, val, set }) => (
                    <div key={label} className="space-y-1">
                      <label className="text-[7px] font-black text-stone-400 uppercase tracking-wider block">{label}</label>
                      <input type="number" step="100" value={val} onChange={e => set(e.target.value)}
                        className="w-full h-9 border border-stone-200 rounded-lg px-2 font-black text-stone-800 text-xs focus:outline-none focus:border-stone-400 transition-colors" />
                    </div>
                  ))}
                </div>
              </div>

              {/* Result */}
              {computed && computed.coutTotalMad > 0 && (
                <div className="bg-stone-900 rounded-2xl p-5 relative overflow-hidden">
                  <div className="absolute top-0 right-0 w-48 h-48 bg-amber-500/10 rounded-full -translate-y-1/2 translate-x-1/2 blur-3xl pointer-events-none" />
                  <div className="relative z-10">
                    <p className="text-[9px] font-black text-stone-400 uppercase tracking-widest mb-4">Résultat du calcul</p>
                    <div className="grid grid-cols-2 gap-4 mb-4">
                      <div>
                        <p className="text-[8px] font-black text-stone-500 uppercase mb-1">Coût de revient / unité</p>
                        <p className="text-2xl font-black text-indigo-400 leading-none">{fmtMAD(computed.coutUniteMad)}</p>
                        <p className="text-[8px] text-stone-500 mt-0.5">MAD / {selectedArticle.unitOfMeasure || 'u'}</p>
                      </div>
                      <div className="border-l border-stone-700 pl-4">
                        <p className="text-[8px] font-black text-stone-500 uppercase mb-1">Prix de vente / unité</p>
                        <p className="text-2xl font-black text-amber-400 leading-none">{fmtMAD(computed.prixVenteUniteMad)}</p>
                        <p className="text-[8px] text-stone-500 mt-0.5">MAD / {selectedArticle.unitOfMeasure || 'u'}</p>
                      </div>
                    </div>
                    <div className="border-t border-stone-700 pt-4 flex items-center justify-between">
                      <div>
                        <p className="text-[8px] font-black text-stone-500 uppercase">Total prix de vente</p>
                        <p className="text-xl font-black text-amber-300">{fmtMAD(computed.prixVenteTotalMad)} MAD</p>
                      </div>
                      <div className="text-right">
                        <p className="text-[8px] font-black text-stone-500 uppercase">Coût de revient total</p>
                        <p className="text-sm font-black text-stone-400">{fmtMAD(computed.coutTotalMad)} MAD</p>
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {/* Export */}
              <button
                onClick={handleExport}
                disabled={!computed || computed.coutUniteMad <= 0 || isExporting}
                className="w-full h-14 bg-amber-500 hover:bg-amber-600 disabled:opacity-40 disabled:cursor-not-allowed text-white font-black uppercase text-[11px] tracking-widest rounded-2xl flex items-center justify-center gap-3 transition-colors shadow-xl shadow-amber-500/20"
              >
                <FileDown className="w-5 h-5" />
                {isExporting ? 'Génération du PDF...' : 'Exporter le Devis Client (PDF)'}
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
