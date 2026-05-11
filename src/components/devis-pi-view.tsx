"use client";

import React, { useState, useMemo } from 'react';
import { FileDown, ReceiptText, Calculator, Search, Package, CheckSquare, Square, Check } from 'lucide-react';
import { exportDevisClientPIPDF } from '@/lib/pdf-export';
import { useUser, useFirestore } from '@/firebase';
import { doc } from 'firebase/firestore';
import { updateDocumentNonBlocking } from '@/firebase/non-blocking-updates';
import { useToast } from '@/hooks/use-toast';

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
  const { user } = useUser();
  const firestore = useFirestore();
  const { toast } = useToast();

  const [search, setSearch] = useState('');
  const [selectedArticleIds, setSelectedArticleIds] = useState<Set<string>>(new Set());
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

  const toggleSelection = (id: string) => {
    setSelectedArticleIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const toggleSelectAll = () => {
    if (selectedArticleIds.size === piArticles.length && piArticles.length > 0) {
      setSelectedArticleIds(new Set());
    } else {
      setSelectedArticleIds(new Set(piArticles.map(a => a.id)));
    }
  };

  // Compute cost for selected articles
  const computedArray = useMemo(() => {
    const globalTc = Number(tauxChange) || DEFAULT_TAUX;
    const globalFraisTransitMad = Number(fraisTransit) || 0;
    const globalFraisChangeMad = Number(fraisChange) || 0;
    const globalFraisSuppMad = Number(fraisSupp) || 0;

    return Array.from(selectedArticleIds).map(id => {
      const article = articles.find(a => a.id === id);
      if (!article) return null;
      
      const qty = Number(article.quantity) || 0;
      const prix = Number(article.purchasePricePerUnit) || 0;
      const cbm = Number(article.cubicMeasurement) || 0;

      const linkedFac = factures.find(f => f.id === article.factureId);
      const isShipped = article.status === 'SHIPPED' || article.status === 'shipped';

      let tc = globalTc;
      let fraisTransitMad = globalFraisTransitMad;
      let fraisChangeMad = globalFraisChangeMad;
      let fraisSuppMad = globalFraisSuppMad;
      let fretTotal$ = 1500;

      if (isShipped && linkedFac) {
        const invoicePaidDhs = Number(linkedFac.invoicePaidDhs) || 0;
        const declaredValue = Number(linkedFac.declaredValue) || 0;
        if (invoicePaidDhs > 0 && declaredValue > 0) {
          tc = invoicePaidDhs / declaredValue;
        } else if (Number(linkedFac.tauxChange) > 0) {
           tc = Number(linkedFac.tauxChange);
        }
        fraisTransitMad = Number(linkedFac.supplierInvoiceAmount) || DEFAULT_FRAIS.transit;
        fraisChangeMad = Number(linkedFac.exchangeInvoiceAmount) || DEFAULT_FRAIS.change;
        fraisSuppMad = Number(linkedFac.additionalCostsAmount) || DEFAULT_FRAIS.supp;
        fretTotal$ = Number(linkedFac.freightCost) || Number(linkedFac.freight) || 0;
      } else if (linkedFac) {
        fretTotal$ = Number(linkedFac.freightCost) || Number(linkedFac.freight) || 1500;
      }

      const totalFrais = fraisTransitMad + fraisChangeMad + fraisSuppMad;

      const cbmTotal = linkedFac
        ? (articles.filter(a => a.factureId === linkedFac.id).reduce((s: number, a: any) => s + (Number(a.cubicMeasurement) || 0), 0) || CBM_STD)
        : CBM_STD;

      const partFret$ = cbm > 0 && cbmTotal > 0 ? (cbm / cbmTotal) * fretTotal$ : 0;
      const partFraisMad = cbm > 0 && cbmTotal > 0 ? (cbm / cbmTotal) * totalFrais : 0;

      const cat = categories.find(c => c.name === article.categoryId || c.id === article.categoryId);
      const hasCustData = cat && cat.customsValuePerKg != null;
      const nw = Number(article.netWeight) || 0;
      const customsVpKg = Number(cat?.customsValuePerKg) || 0;
      const di = (cat?.importDutyRate ?? 0) / 100;
      const tpi = (cat?.tpiRate ?? 0) / 100;
      const tic = (cat?.ticRate ?? 0) / 100;
      const tva = (cat?.tvaRate ?? 20) / 100;

      const valeurFOB = qty * prix;
      const dossierDeclaredValue = linkedFac ? Number(linkedFac.declaredValue) || 0 : 0;
      const weightBaseDouaneMad = (nw > 0 && customsVpKg > 0) ? nw * customsVpKg : 0;
      let valeurDouaneMad = 0;

      if (weightBaseDouaneMad > 0) {
        valeurDouaneMad = weightBaseDouaneMad;
      } else if (dossierDeclaredValue > 0 && linkedFac) {
        const dosArticles = articles.filter(a => a.factureId === linkedFac.id);
        const totalFOBDossier = dosArticles.reduce((s: number, a: any) => s + (Number(a.quantity) * Number(a.purchasePricePerUnit)), 0);
        const artFobShare = totalFOBDossier > 0 ? valeurFOB / totalFOBDossier : 0;
        valeurDouaneMad = (dossierDeclaredValue * artFobShare) * tc;
      } else {
        valeurDouaneMad = valeurFOB * tc;
      }

      const diMad = valeurDouaneMad * di;
      const tpiMad = valeurDouaneMad * tpi;
      const ticMad = valeurDouaneMad * tic;
      const tvaMad = (valeurDouaneMad + diMad + tpiMad + ticMad) * tva;
      const totalTaxesMad = diMad + tpiMad + ticMad + tvaMad;

      const coutAchatMad = qty * prix * tc;
      const fretPartMad = partFret$ * tc;
      const coutTotalMad = hasCustData ? coutAchatMad + fretPartMad + totalTaxesMad + partFraisMad : 0;
      const coutUniteMad = hasCustData && qty > 0 ? coutTotalMad / qty : 0;
      const marge = Number(margePercent) || 0;
      const prixVenteUniteMad = hasCustData ? coutUniteMad * (1 + marge / 100) : 0;
      const prixVenteTotalMad = hasCustData ? coutTotalMad * (1 + marge / 100) : 0;

      return {
        article,
        computed: {
          qty, prix, cbm, cbmTotal, fretTotal$, partFret$, partFraisMad,
          totalFrais, coutAchatMad, fretPartMad, totalTaxesMad,
          coutTotalMad, coutUniteMad, prixVenteUniteMad, prixVenteTotalMad,
          fraisTransitMad, fraisChangeMad, fraisSuppMad,
          isEstimated: !linkedFac,
          hasCustData,
        }
      };
    }).filter(Boolean);
  }, [selectedArticleIds, tauxChange, margePercent, fraisTransit, fraisChange, fraisSupp, articles, factures, categories]);

  const totalCoutTotalMad = computedArray.reduce((acc, curr) => acc + (curr?.computed.coutTotalMad || 0), 0);
  const totalPrixVenteTotalMad = computedArray.reduce((acc, curr) => acc + (curr?.computed.prixVenteTotalMad || 0), 0);

  const hasIncomplete = computedArray.some(c => 
    !c?.article.purchasePricePerUnit || 
    !c?.article.netWeight || 
    !c?.article.cubicMeasurement || 
    !c?.article.quantity || 
    !c?.computed.hasCustData
  );

  const fmtMAD = (n: number) => n.toLocaleString('fr-MA', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

  const handleExport = async () => {
    if (computedArray.length === 0 || hasIncomplete) return;
    setIsExporting(true);
    try {
      await exportDevisClientPIPDF({
        items: computedArray,
        tauxChange: Number(tauxChange) || DEFAULT_TAUX,
        margePercent: Number(margePercent) || 0,
      });
    } finally { setIsExporting(false); }
  };

  const handleConfirm = () => {
    if (computedArray.length === 0 || hasIncomplete || !user || !firestore) return;
    
    computedArray.forEach(c => {
      if (!c) return;
      const articleId = c.article.id;
      const docRef = doc(firestore, 'users', user.uid, 'articles', articleId);
      
      updateDocumentNonBlocking(docRef, {
        devisTauxChange: Number(tauxChange),
        devisMargePercent: Number(margePercent),
        devisPrixVenteUniteMad: c.computed.prixVenteUniteMad,
        devisPrixVenteTotalMad: c.computed.prixVenteTotalMad,
        devisCoutTotalMad: c.computed.coutTotalMad,
        devisDate: new Date().toISOString()
      });
    });

    toast({ title: "Devis Confirmé", description: `${computedArray.length} article(s) mis à jour avec le prix de vente fixé.` });
  };

  const isAllSelected = piArticles.length > 0 && selectedArticleIds.size === piArticles.length;

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
          <div className="bg-stone-900 px-6 py-4 flex items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <Package className="w-4 h-4 text-amber-400" />
              <h3 className="text-sm font-black text-white uppercase tracking-tight">Articles PI</h3>
              <span className="bg-amber-500/20 text-amber-400 text-[9px] font-black uppercase tracking-widest px-2 py-0.5 rounded-full">{piArticles.length} articles</span>
            </div>
            <button 
              onClick={toggleSelectAll} 
              className="flex items-center gap-1.5 text-[9px] font-black uppercase tracking-widest text-stone-300 hover:text-white transition-colors"
            >
              {isAllSelected ? <CheckSquare className="w-4 h-4 text-amber-400" /> : <Square className="w-4 h-4" />}
              {isAllSelected ? 'Tout désélectionner' : 'Tout sélectionner'}
            </button>
          </div>
          <div className="p-4 border-b border-stone-100">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-stone-300" />
              <input
                value={search}
                onChange={e => setSearch(e.target.value)}
                placeholder="Rechercher par client, fournisseur, ou catégorie..."
                className="w-full pl-9 pr-4 h-10 rounded-xl border border-stone-200 text-sm font-bold text-stone-700 focus:outline-none focus:border-amber-400 transition-colors"
              />
            </div>
          </div>
          <div className="overflow-y-auto flex-1" style={{ maxHeight: 420 }}>
            {piArticles.length === 0 ? (
              <div className="py-16 text-center text-stone-300 font-black uppercase text-[10px] tracking-widest">Aucun article PI trouvé</div>
            ) : piArticles.map(a => {
              const isSelected = selectedArticleIds.has(a.id);
              return (
                <button
                  key={a.id}
                  onClick={() => toggleSelection(a.id)}
                  className={`w-full text-left px-5 py-3.5 border-b border-stone-50 flex items-center gap-3 transition-colors ${isSelected ? 'bg-amber-50 border-amber-100' : 'hover:bg-stone-50'}`}
                >
                  <div className="shrink-0 text-amber-500">
                    {isSelected ? <CheckSquare className="w-4 h-4" /> : <Square className="w-4 h-4 text-stone-300" />}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <p className="text-[11px] font-black text-stone-900 uppercase truncate">{a.name || a.categoryId}</p>
                      {a.devisPrixVenteUniteMad && <span className="text-[8px] px-1.5 py-0.5 rounded bg-emerald-100 text-emerald-700 font-black">CONFIRMÉ</span>}
                    </div>
                    <p className="text-[9px] font-bold text-stone-400 uppercase mt-0.5">
                      {a.clientName && <span className="text-indigo-500 font-black mr-1">{a.clientName} ·</span>}
                      {a.categoryId}
                      {Number(a.quantity) > 0 ? ` · ${Number(a.quantity).toLocaleString('fr-MA')} ${a.unitOfMeasure || 'u'}` : ''}
                      {a.devisPrixVenteUniteMad ? ` · P.V: ${fmtMAD(a.devisPrixVenteUniteMad)}` : (Number(a.purchasePricePerUnit) > 0 ? ` · $${Number(a.purchasePricePerUnit).toFixed(4)}` : '')}
                    </p>
                  </div>
                </button>
              );
            })}
          </div>
        </div>

        {/* RIGHT — Config + Result */}
        <div className="space-y-4">
          {selectedArticleIds.size === 0 ? (
            <div className="bg-white rounded-3xl border border-stone-100 shadow-xl py-24 flex flex-col items-center justify-center gap-4">
              <div className="w-14 h-14 bg-stone-100 rounded-2xl flex items-center justify-center">
                <ReceiptText className="w-7 h-7 text-stone-300" />
              </div>
              <p className="text-[10px] font-black text-stone-300 uppercase tracking-widest">Sélectionnez au moins un article</p>
            </div>
          ) : (
            <>
              {/* Article info banner */}
              <div className="bg-stone-900 rounded-2xl px-5 py-4 flex items-center gap-3">
                <div className="flex-1">
                  <p className="text-[9px] font-black text-stone-400 uppercase tracking-widest mb-0.5">Articles sélectionnés</p>
                  <p className="text-base font-black text-white uppercase">{selectedArticleIds.size} Article{selectedArticleIds.size > 1 ? 's' : ''}</p>
                </div>
              </div>

              {hasIncomplete ? (
                <div className="bg-red-50 border border-red-100 rounded-2xl p-6 text-center space-y-2">
                  <p className="text-[10px] font-black text-red-500 uppercase tracking-widest">Informations incomplètes</p>
                  <p className="text-sm font-bold text-red-800">Impossible de calculer le devis. Certains articles sélectionnés ont des données manquantes (quantité, prix, poids, etc).</p>
                </div>
              ) : (
                <>
                  {/* Parameters */}
                  <div className="bg-white rounded-2xl border border-stone-100 shadow-sm p-5 space-y-4">
                    <p className="text-[9px] font-black text-stone-400 uppercase tracking-widest flex items-center gap-1.5"><Calculator className="w-3 h-3" /> Paramètres Globaux</p>
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
                  {computedArray.length > 0 && totalCoutTotalMad > 0 && (
                    <div className="bg-stone-900 rounded-2xl p-5 relative overflow-hidden">
                      <div className="absolute top-0 right-0 w-48 h-48 bg-amber-500/10 rounded-full -translate-y-1/2 translate-x-1/2 blur-3xl pointer-events-none" />
                      <div className="relative z-10">
                        <p className="text-[9px] font-black text-stone-400 uppercase tracking-widest mb-4">Total pour {computedArray.length} article(s)</p>
                        
                        <div className="border-b border-stone-700 pb-4 mb-4 flex items-center justify-between">
                          <div>
                            <p className="text-[8px] font-black text-stone-500 uppercase">Total prix de vente</p>
                            <p className="text-2xl font-black text-amber-400">{fmtMAD(totalPrixVenteTotalMad)} MAD</p>
                          </div>
                          <div className="text-right">
                            <p className="text-[8px] font-black text-stone-500 uppercase">Coût de revient total</p>
                            <p className="text-lg font-black text-stone-300">{fmtMAD(totalCoutTotalMad)} MAD</p>
                          </div>
                        </div>
                      </div>
                    </div>
                  )}

                  {/* Export and Confirm */}
                  <div className="flex flex-col sm:flex-row gap-3">
                    <button
                      onClick={handleConfirm}
                      disabled={computedArray.length === 0 || isExporting}
                      className="w-full sm:w-1/2 h-14 bg-emerald-500 hover:bg-emerald-600 disabled:opacity-40 disabled:cursor-not-allowed text-white font-black uppercase text-[11px] tracking-widest rounded-2xl flex items-center justify-center gap-2 transition-colors shadow-xl shadow-emerald-500/20"
                    >
                      <Check className="w-5 h-5" />
                      Confirmer les Devis
                    </button>
                    <button
                      onClick={handleExport}
                      disabled={computedArray.length === 0 || isExporting}
                      className="w-full sm:w-1/2 h-14 bg-amber-500 hover:bg-amber-600 disabled:opacity-40 disabled:cursor-not-allowed text-white font-black uppercase text-[11px] tracking-widest rounded-2xl flex items-center justify-center gap-2 transition-colors shadow-xl shadow-amber-500/20"
                    >
                      <FileDown className="w-5 h-5" />
                      {isExporting ? 'Génération...' : 'Exporter (PDF)'}
                    </button>
                  </div>
                </>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
