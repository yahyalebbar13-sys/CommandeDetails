"use client";

import React, { useState, useMemo, useEffect } from 'react';
import { FileDown, ReceiptText, Calculator, Search, CheckSquare, Square, Lock, AlertTriangle, X, Percent, Tag, History, ChevronDown, ChevronRight, User, Ship, Package } from 'lucide-react';
import { exportDevisClientPIPDF } from '@/lib/pdf-export';
import { useUser, useFirestore } from '@/firebase';
import { doc, collection, getDocs, getDoc } from 'firebase/firestore';
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
  const [remiseGlobale, setRemiseGlobale] = useState('0');
  const [remiseParArticle, setRemiseParArticle] = useState<Record<string, string>>({});
  const [prixVenteSaisiParArticle, setPrixVenteSaisiParArticle] = useState<Record<string, string>>({});
  const [allOverrides, setAllOverrides] = useState<Record<string, any>>({});
  const [confirmedArticlesMap, setConfirmedArticlesMap] = useState<Record<string, any>>({});
  const [expandedClients, setExpandedClients] = useState<Set<string>>(new Set());
  const [showParams, setShowParams] = useState(false);

  useEffect(() => {
    if (!user || !firestore) return;
    getDocs(collection(firestore, 'users', user.uid, 'dp_declarations'))
      .then(snap => {
        const globalOverrides: Record<string, any> = {};
        snap.forEach(docSnap => {
          const data = docSnap.data();
          if (data.overrides) Object.assign(globalOverrides, data.overrides);
        });
        setAllOverrides(globalOverrides);
      })
      .catch(err => console.error('Error loading overrides', err));
  }, [user, firestore]);

  useEffect(() => {
    if (!user || !firestore || selectedArticleIds.size === 0) return;
    const ids = Array.from(selectedArticleIds);
    Promise.all(
      ids.map(id => {
        const originalId = articles.find((a: any) => a.id === id)?.id || id;
        return getDoc(doc(firestore, 'users', user.uid, 'articles', originalId))
          .then(snap => snap.exists() ? { id: originalId, data: snap.data() } : null);
      })
    ).then(results => {
      const map: Record<string, any> = {};
      results.forEach((r: any) => {
        if (r && r.data.devisConfirmed && r.data.devisPrixVenteUniteMad) map[r.id] = r.data;
      });
      setConfirmedArticlesMap(map);
    }).catch(() => {});
  }, [user, firestore, selectedArticleIds, articles]);

  const isTransit = (s: string) => ['SHIPPED', 'shipped', 'TRANSIT', 'transit'].includes(s || '');
  const isStock = (s: string) => ['DELIVERED', 'STOCK', 'stock', 'DELIVERED '].includes(s || '');

  const piArticles = useMemo(() =>
    articles.filter(a => a.clientName && a.clientName.trim() !== '' && !a.devisConfirmed && !a.devisPrixVenteUniteMad && (isTransit(a.status) || isStock(a.status)))
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

  // Group by client
  const groupedByClient = useMemo(() => {
    const map = new Map<string, { name: string, articles: any[] }>();
    piArticles.forEach(a => {
      const rawName = (a.clientName || 'Sans client').trim();
      const normName = rawName.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
      if (!map.has(normName)) {
        map.set(normName, { name: rawName, articles: [] });
      }
      const clientData = map.get(normName)!;
      if (clientData.name === 'Sans client' && rawName !== 'Sans client') clientData.name = rawName;
      clientData.articles.push(a);
    });
    return Array.from(map.values())
      .map(c => [c.name, c.articles] as [string, any[]])
      .sort(([a], [b]) => a.localeCompare(b));
  }, [piArticles]);

  const toggleSelection = (id: string) => {
    setSelectedArticleIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const toggleClientSelection = (clientArticles: any[]) => {
    const allSelected = clientArticles.every(a => selectedArticleIds.has(a.id));
    setSelectedArticleIds(prev => {
      const next = new Set(prev);
      if (allSelected) clientArticles.forEach(a => next.delete(a.id));
      else clientArticles.forEach(a => next.add(a.id));
      return next;
    });
  };

  const toggleClient = (client: string) => {
    setExpandedClients(prev => {
      const next = new Set(prev);
      if (next.has(client)) next.delete(client); else next.add(client);
      return next;
    });
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

  const computedArray = useMemo(() => {
    const globalTc = Number(tauxChange) || DEFAULT_TAUX;
    const globalFraisTransitMad = Number(fraisTransit) || 0;
    const globalFraisChangeMad = Number(fraisChange) || 0;
    const globalFraisSuppMad = Number(fraisSupp) || 0;

    return Array.from(selectedArticleIds).map(id => {
      const article = articles.find(a => a.id === id);
      if (!article) return null;
        const ov = allOverrides[article.id] || {};
        const qty = (ov.quantity != null ? Number(ov.quantity) : Number(article.quantity)) || 0;
        const prix = (ov.purchasePricePerUnit != null ? Number(ov.purchasePricePerUnit) : Number(article.purchasePricePerUnit)) || 0;
        const cbm = (ov.cubicMeasurement != null ? Number(ov.cubicMeasurement) : Number(article.cubicMeasurement)) || 0;
        const nw = (ov.netWeight != null ? Number(ov.netWeight) : Number(article.netWeight)) || 0;
        const linkedFac = factures.find(f => f.id === article.factureId);

        let tc = globalTc, fraisTransitMad = globalFraisTransitMad, fraisChangeMad = globalFraisChangeMad, fraisSuppMad = globalFraisSuppMad;
        let fretTotal$ = avgFreightPerCbm * CBM_STD;

        if (linkedFac) {
          const invoicePaidDhs = Number(linkedFac.invoicePaidDhs) || 0;
          const declaredValue = Number(linkedFac.declaredValue) || 0;
          if (invoicePaidDhs > 0 && declaredValue > 0) tc = invoicePaidDhs / declaredValue;
          else if (Number(linkedFac.exchangeRate) > 0) tc = Number(linkedFac.exchangeRate);
          else if (Number(linkedFac.tauxChange) > 0) tc = Number(linkedFac.tauxChange);
          const transit = Number(linkedFac.supplierInvoiceAmount) || 0;
          const change = Number(linkedFac.exchangeInvoiceAmount) || 0;
          const supp = Number(linkedFac.additionalCostsAmount) || 0;
          fraisTransitMad = transit > 0 ? transit : DEFAULT_FRAIS.transit;
          fraisChangeMad = change > 0 ? change : DEFAULT_FRAIS.change;
          fraisSuppMad = supp > 0 ? supp : DEFAULT_FRAIS.supp;
          fretTotal$ = Number(linkedFac.freightCost) || Number(linkedFac.freight) || 0;
        }

        const totalFraisHT = (fraisTransitMad + fraisChangeMad + fraisSuppMad) / 1.20;
        const fretMad = (fretTotal$ * tc) / 1.20;
        const mtFraisTotal = totalFraisHT + fretMad;
        const cbmTotal = linkedFac
          ? (articles.filter(a => a.factureId === linkedFac.id).reduce((s: number, a: any) => { const aOv = allOverrides[a.id] || {}; const aCbm = (aOv.cubicMeasurement != null ? Number(aOv.cubicMeasurement) : Number(a.cubicMeasurement)) || 0; return s + aCbm; }, 0) || CBM_STD)
          : CBM_STD;
        const fraisCmd = cbm > 0 && cbmTotal > 0 ? (cbm / cbmTotal) * mtFraisTotal : 0;

        const cat = categories.find(c => c.name === article.categoryId || c.id === article.categoryId);
        const customsVpKg = ov.customsValuePerKg != null ? Number(ov.customsValuePerKg) : (cat?.customsValuePerKg != null ? Number(cat.customsValuePerKg) : 0);
        const di = ov.importDutyRate != null ? Number(ov.importDutyRate) / 100 : (cat?.importDutyRate ?? 0) / 100;
        const tpi = ov.tpiRate != null ? Number(ov.tpiRate) / 100 : (cat?.tpiRate ?? 0) / 100;
        const tic = ov.ticRate != null ? Number(ov.ticRate) / 100 : (cat?.ticRate ?? 0) / 100;
        const tva = ov.tvaRate != null ? Number(ov.tvaRate) / 100 : (cat?.tvaRate ?? 20) / 100;
        const hasCustData = (ov.customsValuePerKg != null || cat?.customsValuePerKg != null);
        const valeurDouaneMad = (hasCustData && customsVpKg > 0 && nw > 0) ? nw * customsVpKg : 0;
        const diMad = valeurDouaneMad * di, tpiMad = valeurDouaneMad * tpi, ticMad = valeurDouaneMad * tic;
        const tvaMad = (valeurDouaneMad + diMad + tpiMad + ticMad) * tva;
        const totalTaxesMad = diMad + tpiMad + ticMad + tvaMad;
      const valAchatMad = qty * prix * tc;
      const coutTotalMad = hasCustData ? (valAchatMad + fraisCmd + totalTaxesMad) : 0;
      const coutUniteMad = (hasCustData && qty > 0) ? coutTotalMad / qty : 0;
      
      const margeGlobale = Number(margePercent) || 0;
      const manualPv = prixVenteSaisiParArticle[article.id];
      let prixVenteUniteMad = 0;
      let usedMarge = margeGlobale;
      
      if (manualPv !== undefined && manualPv !== '') {
        prixVenteUniteMad = Number(manualPv);
        if (coutUniteMad > 0) usedMarge = ((prixVenteUniteMad / coutUniteMad) - 1) * 100;
      } else {
        prixVenteUniteMad = coutUniteMad * (1 + margeGlobale / 100);
      }
      
      const prixVenteTotalMad = prixVenteUniteMad * qty;
      const artRemise = remiseParArticle[article.id] !== undefined ? Number(remiseParArticle[article.id]) : Number(remiseGlobale) || 0;
      const prixRemiseUniteMad = prixVenteUniteMad * (1 - artRemise / 100);
      const prixRemiseTotalMad = prixVenteTotalMad * (1 - artRemise / 100);

      return { article, computed: { qty, prix, cbm, cbmTotal, fretTotal$, fraisCmd, valAchatMad, totalTaxesMad, coutTotalMad, coutUniteMad, prixVenteUniteMad, prixVenteTotalMad, fraisTransitMad, fraisChangeMad, fraisSuppMad, remise: artRemise, prixRemiseUniteMad, prixRemiseTotalMad, isEstimated: !linkedFac, hasCustData: true, usedMarge } };
    }).filter(Boolean);
  }, [selectedArticleIds, tauxChange, margePercent, fraisTransit, fraisChange, fraisSupp, remiseGlobale, remiseParArticle, prixVenteSaisiParArticle, allOverrides, articles, factures, categories, avgFreightPerCbm]);

  const totalCoutTotalMad = computedArray.reduce((acc, curr) => acc + (curr?.computed.coutTotalMad || 0), 0);
  const totalNetMad = computedArray.reduce((acc, curr) => acc + (curr?.computed.prixRemiseTotalMad || 0), 0);
  const hasIncomplete = computedArray.some(c => !c?.article.purchasePricePerUnit || !c?.article.netWeight || !c?.article.cubicMeasurement || !c?.article.quantity || !c?.computed.hasCustData);

  const fmtMAD = (n: number) => n.toLocaleString('fr-MA', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

  const handleExport = async () => {
    if (computedArray.length === 0 || hasIncomplete) return;
    setIsExporting(true);
    try {
      await exportDevisClientPIPDF({ items: computedArray, tauxChange: Number(tauxChange) || DEFAULT_TAUX, margePercent: Number(margePercent) || 0, remiseGlobale: Number(remiseGlobale) || 0 });
    } finally { setIsExporting(false); }
  };

  const handleConfirm = async () => {
    if (computedArray.length === 0 || hasIncomplete || !user || !firestore) return;
    setIsConfirming(true);
    const updates = new Map<string, any>();
    
    computedArray.forEach(c => {
      if (!c) return;
      const articleId = c.article.id;
      
      updates.set(articleId, {
        devisTauxChange: Number(tauxChange),
        devisMargePercent: c.computed.usedMarge,
        devisRemisePercent: c.computed.remise,
        devisPrixVenteTotalMad: c.computed.prixRemiseTotalMad,
        devisCoutTotalMad: c.computed.coutTotalMad,
        devisDate: new Date().toISOString(),
        devisConfirmedAt: new Date().toISOString(),
        devisConfirmed: true,
        devisPrixVenteUniteMad: c.computed.prixRemiseUniteMad
      });
    });

    const now = new Date().toISOString();
    const historyReads = await Promise.all(
      Array.from(updates.keys()).map(async articleId => {
        const snap = await getDoc(doc(firestore, 'users', user.uid, 'articles', articleId));
        const existing = snap.exists() ? snap.data() : {};
        const historyEntry = existing.devisConfirmed && existing.devisPrixVenteUniteMad ? { prix: existing.devisPrixVenteUniteMad, total: existing.devisPrixVenteTotalMad || null, margePercent: existing.devisMargePercent || null, remisePercent: existing.devisRemisePercent || null, tauxChange: existing.devisTauxChange || null, confirmedAt: existing.devisConfirmedAt || null, archivedAt: now } : null;
        const previousHistory: any[] = Array.isArray(existing.devisHistory) ? existing.devisHistory : [];
        return { articleId, devisHistory: historyEntry ? [...previousHistory, historyEntry] : previousHistory };
      })
    );
    historyReads.forEach(({ articleId, devisHistory }) => { const update = updates.get(articleId); if (update) update.devisHistory = devisHistory; });
    updates.forEach((data, articleId) => { const docRef = doc(firestore, 'users', user.uid, 'articles', articleId); updateDocumentNonBlocking(docRef, data); });
    setIsConfirming(false);
    setShowConfirmDialog(false);
    setConfirmedArticlesMap({});
    toast({ title: "Prix de Vente Fixe", description: `${updates.size} article(s) confirme(s).` });
  };

  const statusColor = (status: string) => {
    if (['PI', 'pi'].includes(status)) return 'bg-amber-100 text-amber-700';
    if (['SHIPPED', 'shipped', 'TRANSIT', 'transit'].includes(status)) return 'bg-blue-100 text-blue-700';
    if (['DELIVERED', 'STOCK'].includes(status)) return 'bg-emerald-100 text-emerald-700';
    return 'bg-stone-100 text-stone-500';
  };

  const renderArticle = (a: any) => {
    const isSelected = selectedArticleIds.has(a.id);
    const computed = computedArray.find(c => (c?.article.id) === a.id);
    return (
      <button
        key={a.id}
        onClick={() => toggleSelection(a.id)}
        className={`w-full text-left px-5 py-3.5 flex items-center gap-3 transition-all ${isSelected ? 'bg-amber-50/60' : 'hover:bg-stone-50'}`}
      >
        <div className="shrink-0">
          {isSelected
            ? <CheckSquare className="w-4 h-4 text-amber-500" />
            : <Square className="w-4 h-4 text-stone-200 group-hover:text-stone-400" />}
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <p className="text-[11px] font-black text-stone-800 uppercase">{a.name || a.categoryId}</p>
            {a.devisPrixVenteUniteMad && (
              <span className="text-[7px] px-1.5 py-0.5 rounded bg-emerald-100 text-emerald-700 font-black uppercase">Confirme</span>
            )}
            <span className={`text-[7px] px-1.5 py-0.5 rounded font-black uppercase ${statusColor(a.status)}`}>{a.status || '—'}</span>
          </div>
          <p className="text-[9px] font-bold text-stone-400 mt-0.5 uppercase">
            {a.categoryId}
            {Number(a.quantity) > 0 ? ` · ${Number(a.quantity).toLocaleString('fr-MA')} ${a.unitOfMeasure || 'u'}` : ''}
            {a.supplierId ? ` · ${a.supplierId}` : ''}
          </p>
        </div>
        <div className="text-right shrink-0">
          {computed ? (
            <div className="flex flex-col items-end gap-1">
              <p className="text-[9px] font-black text-stone-500 uppercase">Revient: {fmtMAD(computed.computed.coutUniteMad)} MAD</p>
              
              <div className="flex items-center gap-1.5 mt-1">
                <span className="text-[9px] font-black text-stone-400 uppercase">P.V:</span>
                <input
                  type="number"
                  step="0.01"
                  onClick={e => e.stopPropagation()}
                  value={prixVenteSaisiParArticle[a.id] !== undefined ? prixVenteSaisiParArticle[a.id] : ''}
                  placeholder={fmtMAD(computed.computed.prixVenteUniteMad)}
                  onChange={e => {
                    setPrixVenteSaisiParArticle(prev => ({ ...prev, [a.id]: e.target.value }));
                  }}
                  className={`w-20 h-7 border rounded-md px-1.5 font-black text-xs text-right focus:outline-none transition-colors ${
                    prixVenteSaisiParArticle[a.id] ? 'bg-amber-100 border-amber-300 text-amber-700 focus:border-amber-500' : 'bg-stone-50 border-stone-200 text-stone-700 focus:border-amber-400'
                  }`}
                />
              </div>

              {computed.computed.remise > 0 && (
                <div className="flex items-center gap-1 justify-end mt-0.5">
                  <p className="text-sm font-black text-rose-500">{fmtMAD(computed.computed.prixRemiseUniteMad)}</p>
                  <p className="text-[8px] text-rose-400 font-bold">-{computed.computed.remise}%</p>
                </div>
              )}
              
              {prixVenteSaisiParArticle[a.id] && (
                <p className="text-[8px] text-amber-600 font-bold">Marge: {computed.computed.usedMarge.toFixed(1)}%</p>
              )}
            </div>
          ) : a.devisPrixVenteUniteMad ? (
            <>
              <p className="text-sm font-black text-emerald-600">{fmtMAD(a.devisPrixVenteUniteMad)}</p>
              <p className="text-[8px] text-stone-400 font-bold">MAD/u (fixe)</p>
            </>
          ) : (
            <p className="text-[9px] text-stone-300 font-bold">Selectionner</p>
          )}
        </div>
      </button>
    );
  };

  return (
    <div className="space-y-4 fade-in">
      <div className="bg-stone-900 rounded-2xl p-5 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="p-2.5 bg-amber-500 rounded-xl">
            <ReceiptText className="w-5 h-5 text-white" />
          </div>
          <div>
            <p className="text-[9px] font-black text-amber-500 uppercase tracking-widest">Usage confidentiel</p>
            <h2 className="text-xl font-black text-white uppercase tracking-tight">Prix de Vente Client</h2>
          </div>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <div className="flex items-center gap-2 bg-white/5 rounded-xl px-3 py-2">
            <span className="text-[9px] font-black text-stone-400 uppercase">Marge</span>
            <input
              type="number"
              step="0.5"
              value={margePercent}
              onChange={e => setMargePercent(e.target.value)}
              className="w-14 h-7 bg-white/10 border border-white/10 rounded-lg px-2 font-black text-amber-400 text-sm focus:outline-none focus:border-amber-400 text-center"
            />
            <span className="text-amber-400 font-black text-sm">%</span>
          </div>
          <div className="flex items-center gap-2 bg-white/5 rounded-xl px-3 py-2">
            <span className="text-[9px] font-black text-stone-400 uppercase">Remise</span>
            <input
              type="number"
              step="0.5"
              min={0}
              max={100}
              value={remiseGlobale}
              onChange={e => setRemiseGlobale(e.target.value)}
              className="w-14 h-7 bg-white/10 border border-white/10 rounded-lg px-2 font-black text-rose-400 text-sm focus:outline-none focus:border-rose-400 text-center"
            />
            <span className="text-rose-400 font-black text-sm">%</span>
          </div>
          <button
            onClick={() => setShowParams(v => !v)}
            className="flex items-center gap-1.5 bg-white/5 hover:bg-white/10 border border-white/10 rounded-xl px-3 py-2 transition-all"
          >
            <Calculator className="w-3.5 h-3.5 text-stone-400" />
            <span className="text-[9px] font-black text-stone-400 uppercase">Params</span>
            {showParams ? <ChevronDown className="w-3 h-3 text-stone-400" /> : <ChevronRight className="w-3 h-3 text-stone-400" />}
          </button>
        </div>
      </div>

      {showParams && (
        <div className="bg-white rounded-2xl border border-stone-100 shadow-sm p-5 grid grid-cols-2 sm:grid-cols-5 gap-4 animate-in fade-in slide-in-from-top-2 duration-200">
          <div className="space-y-1 col-span-1">
            <label className="text-[8px] font-black text-stone-400 uppercase tracking-widest block">Taux change (MAD/$)</label>
            <input type="number" step="0.01" value={tauxChange} onChange={e => setTauxChange(e.target.value)} className="w-full h-9 border border-stone-200 rounded-xl px-3 font-black text-stone-900 text-sm focus:outline-none focus:border-amber-400" />
            <div className="flex gap-1 flex-wrap">{[10, 10.5, 11, 11.5].map(v => (<button key={v} onClick={() => setTauxChange(String(v))} className={`px-2 py-0.5 rounded-lg text-[8px] font-black border transition-all ${Number(tauxChange) === v ? 'bg-stone-900 text-white border-stone-900' : 'bg-stone-50 text-stone-400 border-stone-100 hover:border-stone-300'}`}>{v}</button>))}</div>
          </div>
          {[
            { label: 'Transitaire (MAD)', val: fraisTransit, set: setFraisTransit },
            { label: 'Bureau Change (MAD)', val: fraisChange, set: setFraisChange },
            { label: 'Frais Supp. (MAD)', val: fraisSupp, set: setFraisSupp },
          ].map(({ label, val, set }) => (
            <div key={label} className="space-y-1">
              <label className="text-[8px] font-black text-stone-400 uppercase tracking-widest block">{label}</label>
              <input type="number" step="100" value={val} onChange={e => set(e.target.value)} className="w-full h-9 border border-stone-200 rounded-xl px-3 font-black text-stone-900 text-sm focus:outline-none focus:border-stone-400" />
            </div>
          ))}
          {computedArray.length > 0 && (
            <div className="col-span-full border-t border-stone-100 pt-4">
              <p className="text-[8px] font-black text-stone-400 uppercase tracking-widest mb-2 flex items-center gap-1"><Tag className="w-2.5 h-2.5" /> Remise par article</p>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                {computedArray.map((c, i) => c && (
                  <div key={i} className="flex items-center gap-2 bg-stone-50 rounded-xl px-3 py-2">
                    <p className="text-[9px] font-black text-stone-600 uppercase flex-1 truncate min-w-0">{c.article.categoryId || c.article.name}</p>
                    <input type="number" step="0.5" min={0} max={100} placeholder={remiseGlobale} value={remiseParArticle[c.article.id] ?? ''} onChange={e => { const id = c.article.id; setRemiseParArticle(prev => ({ ...prev, [id]: e.target.value })); }} className="w-14 h-7 border border-rose-200 rounded-lg px-2 font-black text-stone-800 text-xs focus:outline-none focus:border-rose-400 text-center" />
                    <span className="text-[9px] text-rose-400 font-black">%</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Search */}
      <div className="relative">
        <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-stone-300" />
        <input
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="Rechercher par client, article, fournisseur..."
          className="w-full pl-11 pr-4 h-11 rounded-xl border border-stone-200 bg-white text-sm font-bold text-stone-700 focus:outline-none focus:border-amber-400 transition-colors shadow-sm"
        />
      </div>

      {/* No articles */}
      {groupedByClient.length === 0 && (
        <div className="bg-white rounded-2xl border border-stone-100 py-20 flex flex-col items-center justify-center gap-3">
          <div className="w-12 h-12 bg-stone-100 rounded-2xl flex items-center justify-center">
            <ReceiptText className="w-6 h-6 text-stone-300" />
          </div>
          <p className="text-[10px] font-black text-stone-300 uppercase tracking-widest">Aucun article avec un client</p>
        </div>
      )}

      {/* Grouped by client */}
      <div className="space-y-3">
        {groupedByClient.map(([client, clientArticles]) => {
          const isExpanded = expandedClients.has(client);
          const allSelected = clientArticles.every(a => selectedArticleIds.has(a.id));
          const someSelected = clientArticles.some(a => selectedArticleIds.has(a.id));
          const clientComputed = computedArray.filter(c => c?.article.clientName === client);
          const clientTotal = clientComputed.reduce((s, c) => s + (c?.computed.prixRemiseTotalMad || 0), 0);

          return (
            <div key={client} className="bg-white rounded-2xl border border-stone-100 shadow-sm overflow-hidden">
              {/* Client header */}
              <div
                className={`flex items-center gap-3 px-5 py-4 cursor-pointer transition-all ${someSelected ? 'bg-amber-50 border-b border-amber-100' : 'hover:bg-stone-50 border-b border-stone-50'}`}
                onClick={() => toggleClient(client)}
              >
                {/* Select all toggle */}
                <button
                  type="button"
                  onClick={e => { e.stopPropagation(); toggleClientSelection(clientArticles); }}
                  className="shrink-0 transition-colors"
                >
                  {allSelected
                    ? <CheckSquare className="w-5 h-5 text-amber-500" />
                    : someSelected
                      ? <CheckSquare className="w-5 h-5 text-amber-300" />
                      : <Square className="w-5 h-5 text-stone-300 hover:text-amber-400 transition-colors" />
                  }
                </button>

                <div className="flex items-center gap-2 flex-1 min-w-0">
                  <div className="w-8 h-8 rounded-xl bg-indigo-100 flex items-center justify-center shrink-0">
                    <User className="w-4 h-4 text-indigo-500" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-black text-stone-900 uppercase tracking-tight truncate">{client}</p>
                    <p className="text-[9px] font-bold text-stone-400">{clientArticles.length} article{clientArticles.length > 1 ? 's' : ''}</p>
                  </div>
                </div>

                <div className="flex items-center gap-3 shrink-0">
                  {clientTotal > 0 && (
                    <div className="text-right">
                      <p className="text-[8px] font-black text-stone-400 uppercase">Total client</p>
                      <p className="text-sm font-black text-amber-600">{fmtMAD(clientTotal)} MAD</p>
                    </div>
                  )}
                  <span className={`w-5 h-5 flex items-center justify-center transition-transform ${isExpanded ? 'rotate-90' : ''}`}>
                    <ChevronRight className="w-4 h-4 text-stone-400" />
                  </span>
                </div>
              </div>

              {/* Articles list */}
              {isExpanded && (
                <div className="divide-y divide-stone-50">
                  {/* Transit Section */}
                  {clientArticles.filter(a => isTransit(a.status)).length > 0 && (
                    <>
                      <div className="px-5 py-2.5 bg-blue-50 border-y border-blue-100 flex items-center gap-2">
                        <Ship className="w-3.5 h-3.5 text-blue-500" />
                        <span className="text-[10px] font-black text-blue-700 uppercase tracking-widest">En Transit</span>
                      </div>
                      {clientArticles.filter(a => isTransit(a.status)).map(a => renderArticle(a))}
                    </>
                  )}

                  {/* Stock Section */}
                  {clientArticles.filter(a => isStock(a.status)).length > 0 && (
                    <>
                      <div className="px-5 py-2.5 bg-emerald-50 border-y border-emerald-100 flex items-center gap-2">
                        <Package className="w-3.5 h-3.5 text-emerald-500" />
                        <span className="text-[10px] font-black text-emerald-700 uppercase tracking-widest">En Stock</span>
                      </div>
                      {clientArticles.filter(a => isStock(a.status)).map(a => renderArticle(a))}
                    </>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Bottom summary bar */}
      {selectedArticleIds.size > 0 && (
        <div className="sticky bottom-4 z-20">
          <div className="bg-stone-900 rounded-2xl p-4 shadow-2xl border border-white/5 flex flex-col sm:flex-row items-center gap-4">
            {/* Summary */}
            <div className="flex-1 grid grid-cols-3 gap-3 w-full sm:w-auto">
              <div className="text-center">
                <p className="text-[8px] font-black text-stone-500 uppercase tracking-widest">Articles</p>
                <p className="text-lg font-black text-white">{selectedArticleIds.size}</p>
              </div>
              <div className="text-center">
                <p className="text-[8px] font-black text-stone-500 uppercase tracking-widest">Cout revient</p>
                <p className="text-sm font-black text-stone-300">{fmtMAD(totalCoutTotalMad)}</p>
              </div>
              <div className="text-center">
                <p className="text-[8px] font-black text-amber-500 uppercase tracking-widest">Total client</p>
                <p className="text-lg font-black text-amber-400">{fmtMAD(totalNetMad)}</p>
              </div>
            </div>

            {/* Actions */}
            <div className="flex gap-2 w-full sm:w-auto">
              {hasIncomplete && (
                <div className="flex items-center gap-1.5 bg-red-500/10 border border-red-500/20 rounded-xl px-3 py-2">
                  <AlertTriangle className="w-3.5 h-3.5 text-red-400" />
                  <span className="text-[9px] font-black text-red-400 uppercase">Donnees manquantes</span>
                </div>
              )}
              <button
                onClick={() => setShowConfirmDialog(true)}
                disabled={hasIncomplete || computedArray.length === 0}
                className="flex-1 sm:flex-none h-11 px-5 bg-emerald-500 hover:bg-emerald-600 disabled:opacity-40 disabled:cursor-not-allowed text-white font-black uppercase text-[10px] tracking-widest rounded-xl flex items-center justify-center gap-2 transition-colors"
              >
                <Lock className="w-4 h-4" />
                Fixer Prix
              </button>
              <button
                onClick={handleExport}
                disabled={hasIncomplete || computedArray.length === 0 || isExporting}
                className="flex-1 sm:flex-none h-11 px-5 bg-amber-500 hover:bg-amber-600 disabled:opacity-40 disabled:cursor-not-allowed text-white font-black uppercase text-[10px] tracking-widest rounded-xl flex items-center justify-center gap-2 transition-colors"
              >
                <FileDown className="w-4 h-4" />
                {isExporting ? 'Export...' : 'PDF'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Confirm dialog */}
      {showConfirmDialog && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(6px)' }}>
          <div className="bg-white rounded-3xl shadow-2xl max-w-md w-full overflow-hidden animate-in fade-in zoom-in-95">
            <div className="bg-stone-900 px-6 py-5 relative overflow-hidden">
              <div className="absolute top-0 right-0 w-32 h-32 bg-emerald-500/10 rounded-full -translate-y-1/2 translate-x-1/2 blur-2xl" />
              <button type="button" onClick={() => setShowConfirmDialog(false)} className="absolute top-4 right-4 text-stone-500 hover:text-white transition-colors"><X className="w-4 h-4" /></button>
              <div className="flex items-center gap-3 relative z-10">
                <div className="w-10 h-10 bg-emerald-500 rounded-xl flex items-center justify-center shrink-0"><Lock className="w-5 h-5 text-white" /></div>
                <div>
                  <p className="text-[9px] font-black text-emerald-400 uppercase tracking-widest">Action irreversible</p>
                  <h3 className="text-lg font-black text-white uppercase tracking-tight">Confirmer le Devis</h3>
                </div>
              </div>
            </div>
            <div className="p-6 space-y-4">
              <div className="flex items-start gap-3 bg-amber-50 border border-amber-100 rounded-2xl p-4">
                <AlertTriangle className="w-5 h-5 text-amber-500 shrink-0 mt-0.5" />
                <div>
                  <p className="text-sm font-black text-stone-900">Ce prix devient le prix de vente officiel</p>
                  <p className="text-xs font-bold text-stone-500 mt-1">Une fois confirme, le prix sera affiche dans l&apos;espace client et verrouille.</p>
                </div>
              </div>
              <div className="bg-stone-50 border border-stone-100 rounded-2xl p-4 space-y-2">
                <p className="text-[9px] font-black text-stone-400 uppercase tracking-widest mb-3">Resume</p>
                {computedArray.some(c => c && confirmedArticlesMap[c.article.originalId || c.article.id]) && (
                  <div className="mb-3 space-y-2">
                    {computedArray.filter(c => c && confirmedArticlesMap[c.article.originalId || c.article.id]).map((c, i) => {
                      if (!c) return null;
                      const prev = confirmedArticlesMap[c.article.originalId || c.article.id];
                      return (
                        <div key={i} className="flex items-start gap-2 bg-amber-50 border border-amber-200 rounded-xl p-3">
                          <History className="w-3.5 h-3.5 text-amber-500 shrink-0 mt-0.5" />
                          <div className="min-w-0">
                            <p className="text-[9px] font-black text-amber-700 uppercase truncate">{c.article.clientName} · {c.article.categoryId}</p>
                            <p className="text-[8px] font-bold text-amber-600 mt-0.5">Ancien prix : <span className="font-black">{fmtMAD(prev.devisPrixVenteUniteMad)} MAD/u</span></p>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
                {computedArray.slice(0, 5).map((c, i) => c && (
                  <div key={i} className="flex items-center justify-between gap-2">
                    <div className="min-w-0">
                      <p className="text-[9px] font-black text-stone-700 uppercase truncate">{c.article.clientName} · {c.article.categoryId || c.article.name}</p>
                    </div>
                    <p className="text-sm font-black text-emerald-600 shrink-0">{fmtMAD(c.computed.prixVenteUniteMad)} MAD/u</p>
                  </div>
                ))}
                {computedArray.length > 5 && <p className="text-[9px] font-bold text-stone-400 text-center">+ {computedArray.length - 5} autre(s)...</p>}
                <div className="border-t border-stone-200 pt-2 mt-2 flex justify-between">
                  <p className="text-[10px] font-black text-stone-500 uppercase">Total net client</p>
                  <p className="text-sm font-black text-emerald-600">{fmtMAD(totalNetMad)} MAD</p>
                </div>
              </div>
              <div className="flex gap-3">
                <button type="button" onClick={() => setShowConfirmDialog(false)} className="flex-1 h-12 bg-stone-100 hover:bg-stone-200 text-stone-700 font-black uppercase text-[10px] tracking-widest rounded-2xl transition-colors">Annuler</button>
                <button type="button" onClick={handleConfirm} disabled={isConfirming} className="flex-1 h-12 bg-emerald-500 hover:bg-emerald-600 disabled:opacity-50 text-white font-black uppercase text-[10px] tracking-widest rounded-2xl flex items-center justify-center gap-2 transition-colors">
                  <Lock className="w-4 h-4" />
                  {isConfirming ? 'Confirmation...' : 'Confirmer'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
