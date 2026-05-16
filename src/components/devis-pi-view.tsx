"use client";

import React, { useState, useMemo } from 'react';
import { FileDown, ReceiptText, Calculator, Search, Package, CheckSquare, Square, Check, Lock, AlertTriangle, X } from 'lucide-react';
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
  const [showConfirmDialog, setShowConfirmDialog] = useState(false);
  const [isConfirming, setIsConfirming] = useState(false);

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

  const avgFreightPerCbm = useMemo(() => {
    const validFactures = factures.filter(f =>
      (Number(f.freightCost) || Number(f.freight) || 0) > 0 &&
      articles.filter(a => a.factureId === f.id).reduce((s: number, a: any) => s + (a.cubicMeasurement || 0), 0) > 0
    );
    if (validFactures.length === 0) return 1500 / CBM_STD;
    const total = validFactures.reduce((sum, f) => {
      const freight = Number(f.freightCost) || Number(f.freight) || 0;
      const cbm = articles.filter(a => a.factureId === f.id).reduce((s: number, a: any) => s + (a.cubicMeasurement || 0), 0);
      return sum + (cbm > 0 ? freight / cbm : 0);
    }, 0);
    return total / validFactures.length;
  }, [factures, articles]);

  // Compute cost for selected articles
  const computedArray = useMemo(() => {
    const globalTc = Number(tauxChange) || DEFAULT_TAUX;
    const globalFraisTransitMad = Number(fraisTransit) || 0;
    const globalFraisChangeMad = Number(fraisChange) || 0;
    const globalFraisSuppMad = Number(fraisSupp) || 0;

    return Array.from(selectedArticleIds).flatMap(id => {
      const parentArticle = articles.find(a => a.id === id);
      if (!parentArticle) return [];

      const cb = Array.isArray(parentArticle.colorBreakdown) ? parentArticle.colorBreakdown : [];
      const sb = Array.isArray(parentArticle.sizeBreakdown) ? parentArticle.sizeBreakdown : [];
      const parentQty = Number(parentArticle.quantity) || 1;

      let variants: any[] = [];

      if (cb.length > 0) {
        const groups = new Map<number, any[]>();
        cb.forEach(r => {
          const p = (r.priceOverride !== '' && r.priceOverride != null) ? Number(r.priceOverride) : Number(parentArticle.purchasePricePerUnit || 0);
          if (!groups.has(p)) groups.set(p, []);
          groups.get(p)!.push(r);
        });
        groups.forEach((rows, p) => {
          const groupQty = rows.reduce((s: number, r: any) => s + (Number(r.rolls) || 0), 0);
          const ratio = groupQty / parentQty;
          variants.push({
            ...parentArticle,
            id: groups.size > 1 ? `${parentArticle.id}_${p}` : parentArticle.id,
            originalId: parentArticle.id,
            purchasePricePerUnit: p,
            quantity: groupQty,
            colorBreakdown: rows,
            sizeBreakdown: null,
            netWeight: (Number(parentArticle.netWeight) || 0) * ratio,
            cubicMeasurement: (Number(parentArticle.cubicMeasurement) || 0) * ratio,
          });
        });
      } else if (sb.length > 0) {
        const groups = new Map<number, any[]>();
        sb.forEach(r => {
          const p = (r.priceOverride !== '' && r.priceOverride != null) ? Number(r.priceOverride) : Number(parentArticle.purchasePricePerUnit || 0);
          if (!groups.has(p)) groups.set(p, []);
          groups.get(p)!.push(r);
        });
        groups.forEach((rows, p) => {
          const groupQty = rows.reduce((s: number, r: any) => s + (Number(r.quantity) || 0), 0);
          const ratio = groupQty / parentQty;
          variants.push({
            ...parentArticle,
            id: groups.size > 1 ? `${parentArticle.id}_${p}` : parentArticle.id,
            originalId: parentArticle.id,
            purchasePricePerUnit: p,
            quantity: groupQty,
            sizeBreakdown: rows,
            colorBreakdown: null,
            netWeight: (Number(parentArticle.netWeight) || 0) * ratio,
            cubicMeasurement: (Number(parentArticle.cubicMeasurement) || 0) * ratio,
          });
        });
      } else {
        variants.push({ ...parentArticle, originalId: parentArticle.id });
      }

      return variants.map(article => {
      
      const qty = Number(article.quantity) || 0;
      const prix = Number(article.purchasePricePerUnit) || 0;
      const cbm = Number(article.cubicMeasurement) || 0;

      const linkedFac = factures.find(f => f.id === article.factureId);

      let tc = globalTc;
      let fraisTransitMad = globalFraisTransitMad;
      let fraisChangeMad = globalFraisChangeMad;
      let fraisSuppMad = globalFraisSuppMad;
      let fretTotal$ = avgFreightPerCbm * CBM_STD;

      if (linkedFac) {
        const invoicePaidDhs = Number(linkedFac.invoicePaidDhs) || 0;
        const declaredValue = Number(linkedFac.declaredValue) || 0;
        if (invoicePaidDhs > 0 && declaredValue > 0) {
          tc = invoicePaidDhs / declaredValue;
        } else if (Number(linkedFac.exchangeRate) > 0) {
          tc = Number(linkedFac.exchangeRate);
        } else if (Number(linkedFac.tauxChange) > 0) {
          tc = Number(linkedFac.tauxChange);
        }

        const transit = Number(linkedFac.supplierInvoiceAmount) || 0;
        const change = Number(linkedFac.exchangeInvoiceAmount) || 0;
        const supp = Number(linkedFac.additionalCostsAmount) || 0;
        fraisTransitMad = transit > 0 ? transit : DEFAULT_FRAIS.transit;
        fraisChangeMad = change > 0 ? change : DEFAULT_FRAIS.change;
        fraisSuppMad = supp > 0 ? supp : DEFAULT_FRAIS.supp;
        fretTotal$ = Number(linkedFac.freightCost) || Number(linkedFac.freight) || 0;
      }

      // Logistic costs (Divide by 1.20 as in CostAnalysisView)
      const totalFraisHT = (fraisTransitMad + fraisChangeMad + fraisSuppMad) / 1.20;
      const fretMad = (fretTotal$ * tc) / 1.20;
      const mtFraisTotal = totalFraisHT + fretMad;

      const cbmTotal = linkedFac
        ? (articles.filter(a => a.factureId === linkedFac.id).reduce((s: number, a: any) => s + (Number(a.cubicMeasurement) || 0), 0) || CBM_STD)
        : CBM_STD;

      const fraisCmd = cbm > 0 && cbmTotal > 0 ? (cbm / cbmTotal) * mtFraisTotal : 0;

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
      // TVA Base excludes TIC in CostAnalysisView line 127
      const tvaMad = (valeurDouaneMad + diMad + tpiMad) * tva;
      const totalTaxesMad = diMad + tpiMad + ticMad + tvaMad;

      const valAchatMad = qty * prix * tc;
      const coutTotalMad = valAchatMad + fraisCmd + totalTaxesMad;
      const coutUniteMad = qty > 0 ? coutTotalMad / qty : 0;
      const marge = Number(margePercent) || 0;
      const prixVenteUniteMad = coutUniteMad * (1 + marge / 100);
      const prixVenteTotalMad = coutTotalMad * (1 + marge / 100);

      return {
        article,
        computed: {
          qty, prix, cbm, cbmTotal, fretTotal$, fraisCmd,
          valAchatMad, totalTaxesMad,
          coutTotalMad, coutUniteMad, prixVenteUniteMad, prixVenteTotalMad,
          fraisTransitMad, fraisChangeMad, fraisSuppMad,
          isEstimated: !linkedFac,
          hasCustData: true,
        }
      };
      });
    }).filter(Boolean);
  }, [selectedArticleIds, tauxChange, margePercent, fraisTransit, fraisChange, fraisSupp, articles, factures, categories, avgFreightPerCbm]);

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

  const handleConfirm = async () => {
    if (computedArray.length === 0 || hasIncomplete || !user || !firestore) return;
    setIsConfirming(true);
    
    // Group variants back to their original document to accumulate totals
    const updates = new Map<string, any>();
    
    computedArray.forEach(c => {
      if (!c) return;
      const articleId = c.article.originalId || c.article.id;
      
      if (!updates.has(articleId)) {
        updates.set(articleId, {
          devisTauxChange: Number(tauxChange),
          devisMargePercent: Number(margePercent),
          devisPrixVenteTotalMad: 0,
          devisCoutTotalMad: 0,
          devisDate: new Date().toISOString(),
          devisConfirmedAt: new Date().toISOString(),
          devisConfirmed: true,
          // We keep the last unit price, though for mixed prices it's an average/approximate concept at the DB level
          devisPrixVenteUniteMad: c.computed.prixVenteUniteMad,
        });
      }
      
      const current = updates.get(articleId);
      current.devisPrixVenteTotalMad += c.computed.prixVenteTotalMad;
      current.devisCoutTotalMad += c.computed.coutTotalMad;
    });

    updates.forEach((data, articleId) => {
      const docRef = doc(firestore, 'users', user.uid, 'articles', articleId);
      updateDocumentNonBlocking(docRef, data);
    });

    setIsConfirming(false);
    setShowConfirmDialog(false);
    toast({ 
      title: "✅ Prix de Vente Fixé", 
      description: `${updates.size} article(s) confirmé(s). Le prix est maintenant visible dans l'espace client et ne peut plus être modifié.` 
    });
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

                  {/* Result per article */}
                  {computedArray.length > 0 && totalCoutTotalMad > 0 && (
                    <div className="bg-stone-900 rounded-2xl p-5 relative overflow-hidden">
                      <div className="absolute top-0 right-0 w-48 h-48 bg-amber-500/10 rounded-full -translate-y-1/2 translate-x-1/2 blur-3xl pointer-events-none" />
                      <div className="relative z-10 space-y-3">
                        <p className="text-[9px] font-black text-stone-400 uppercase tracking-widest">Récapitulatif — {computedArray.length} ligne(s)</p>
                        
                        {/* Per-article breakdown */}
                        <div className="space-y-2 max-h-52 overflow-y-auto pr-1">
                          {computedArray.map((c, i) => c && (
                            <div key={i} className="bg-stone-800/60 rounded-xl px-3 py-2.5 flex items-center justify-between gap-2">
                              <div className="min-w-0">
                                <p className="text-[9px] font-black text-stone-400 uppercase truncate">{c.article.clientName || '—'}</p>
                                <p className="text-[10px] font-black text-white uppercase truncate">{c.article.categoryId || c.article.name}</p>
                                <p className="text-[8px] font-bold text-stone-500">{Number(c.computed.qty).toLocaleString('fr-MA')} {c.article.unitOfMeasure}</p>
                              </div>
                              <div className="text-right shrink-0">
                                <p className="text-[8px] font-black text-stone-500 uppercase">P.V. Unitaire</p>
                                <p className="text-sm font-black text-amber-400">{fmtMAD(c.computed.prixVenteUniteMad)}</p>
                                <p className="text-[8px] font-bold text-stone-500">{fmtMAD(c.computed.prixVenteTotalMad)} total</p>
                              </div>
                            </div>
                          ))}
                        </div>

                        <div className="border-t border-stone-700 pt-3 flex items-center justify-between">
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
                      onClick={() => setShowConfirmDialog(true)}
                      disabled={computedArray.length === 0 || isExporting}
                      className="w-full sm:w-1/2 h-14 bg-emerald-500 hover:bg-emerald-600 disabled:opacity-40 disabled:cursor-not-allowed text-white font-black uppercase text-[11px] tracking-widest rounded-2xl flex items-center justify-center gap-2 transition-colors shadow-xl shadow-emerald-500/20"
                    >
                      <Lock className="w-5 h-5" />
                      Confirmer &amp; Fixer Prix
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

      {/* ── CONFIRMATION DIALOG ── */}
      {showConfirmDialog && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(6px)' }}>
          <div className="bg-white rounded-3xl shadow-2xl max-w-md w-full overflow-hidden animate-in fade-in zoom-in-95">
            {/* Header */}
            <div className="bg-stone-900 px-6 py-5 relative overflow-hidden">
              <div className="absolute top-0 right-0 w-32 h-32 bg-emerald-500/10 rounded-full -translate-y-1/2 translate-x-1/2 blur-2xl" />
              <button type="button" onClick={() => setShowConfirmDialog(false)} className="absolute top-4 right-4 text-stone-500 hover:text-white transition-colors">
                <X className="w-4 h-4" />
              </button>
              <div className="flex items-center gap-3 relative z-10">
                <div className="w-10 h-10 bg-emerald-500 rounded-xl flex items-center justify-center shrink-0">
                  <Lock className="w-5 h-5 text-white" />
                </div>
                <div>
                  <p className="text-[9px] font-black text-emerald-400 uppercase tracking-widest">Action irréversible</p>
                  <h3 className="text-lg font-black text-white uppercase tracking-tight">Confirmer le Devis Client</h3>
                </div>
              </div>
            </div>
            {/* Body */}
            <div className="p-6 space-y-4">
              <div className="flex items-start gap-3 bg-amber-50 border border-amber-100 rounded-2xl p-4">
                <AlertTriangle className="w-5 h-5 text-amber-500 shrink-0 mt-0.5" />
                <div>
                  <p className="text-sm font-black text-stone-900">Ce prix devient le prix de vente officiel</p>
                  <p className="text-xs font-bold text-stone-500 mt-1">Une fois confirmé, le prix sera affiché dans l'espace client et verrouillé. Vous ne pourrez plus le modifier librement.</p>
                </div>
              </div>

              {/* Summary */}
              <div className="bg-stone-50 border border-stone-100 rounded-2xl p-4 space-y-2">
                <p className="text-[9px] font-black text-stone-400 uppercase tracking-widest mb-3">Résumé des prix à confirmer</p>
                {computedArray.slice(0, 4).map((c, i) => c && (
                  <div key={i} className="flex items-center justify-between gap-2">
                    <div className="min-w-0">
                      <p className="text-[10px] font-black text-stone-700 uppercase truncate">{c.article.clientName} · {c.article.categoryId || c.article.name}</p>
                    </div>
                    <div className="text-right shrink-0">
                      <p className="text-sm font-black text-emerald-600">{fmtMAD(c.computed.prixVenteUniteMad)} MAD/u</p>
                    </div>
                  </div>
                ))}
                {computedArray.length > 4 && (
                  <p className="text-[9px] font-bold text-stone-400 text-center pt-1">+ {computedArray.length - 4} autre(s)...</p>
                )}
                <div className="border-t border-stone-200 pt-2 mt-2 flex justify-between">
                  <p className="text-[10px] font-black text-stone-500 uppercase">Prix de vente total</p>
                  <p className="text-sm font-black text-emerald-600">{fmtMAD(totalPrixVenteTotalMad)} MAD</p>
                </div>
              </div>

              {/* Actions */}
              <div className="flex gap-3">
                <button
                  type="button"
                  onClick={() => setShowConfirmDialog(false)}
                  className="flex-1 h-12 bg-stone-100 hover:bg-stone-200 text-stone-700 font-black uppercase text-[10px] tracking-widest rounded-2xl transition-colors"
                >
                  Annuler
                </button>
                <button
                  type="button"
                  onClick={handleConfirm}
                  disabled={isConfirming}
                  className="flex-1 h-12 bg-emerald-500 hover:bg-emerald-600 disabled:opacity-50 text-white font-black uppercase text-[10px] tracking-widest rounded-2xl flex items-center justify-center gap-2 transition-colors shadow-lg shadow-emerald-500/30"
                >
                  {isConfirming ? (
                    <><span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />Confirmation...</>
                  ) : (
                    <><Lock className="w-4 h-4" />Confirmer &amp; Fixer</>  
                  )}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
