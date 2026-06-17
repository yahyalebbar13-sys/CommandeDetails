"use client";

import React, { useState, useEffect, useMemo } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Loader2, FileText, ChevronDown, ChevronRight, Eye, EyeOff, Download } from 'lucide-react';
import { useFirestore, useUser } from '@/firebase';
import { collection, getDocs, query, where } from 'firebase/firestore';
import { exportCommercialPDF } from '@/lib/pdf-export';

const DEFAULT_TAUX = 10;

interface CommercialExportModalProps {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  clientName: string;
  articles: any[];
  factures: any[];
  categories: any[];
}

// Build a compact color/size summary string from an article
function getVariantsSummary(article: any): string {
  const cb = Array.isArray(article.colorBreakdown) ? article.colorBreakdown : [];
  const sb = Array.isArray(article.sizeBreakdown) ? article.sizeBreakdown : [];
  if (cb.length > 0) {
    return cb.map((r: any) => {
      const c = r.colorCode || r.color || '?';
      const q = Number(r.rolls) || Number(r.quantity) || 0;
      return `${c} ×${q}`;
    }).join(', ');
  }
  if (sb.length > 0) {
    return sb.map((r: any) => {
      const s = r.size || '?';
      const q = Number(r.quantity) || 0;
      return `${s} ×${q}`;
    }).join(', ');
  }
  return article.color || '—';
}

// Get total quantity (from breakdown or article.quantity)
function getTotalQty(article: any): number {
  const cb = Array.isArray(article.colorBreakdown) ? article.colorBreakdown : [];
  const sb = Array.isArray(article.sizeBreakdown) ? article.sizeBreakdown : [];
  if (cb.length > 0) return cb.reduce((s: number, r: any) => s + (Number(r.rolls) || Number(r.quantity) || 0), 0);
  if (sb.length > 0) return sb.reduce((s: number, r: any) => s + (Number(r.quantity) || 0), 0);
  return Number(article.quantity) || 0;
}

// Compute pauTtc for an article (simplified, mirrors devis-pi-view logic)
function computePauTtc(
  article: any,
  allOverrides: Record<string, any>,
  factures: any[],
  allArticles: any[],
  categories: any[]
): number {
  const ov = allOverrides[article.id] || {};
  const qty = getTotalQty(article);
  const prix = Number(article.purchasePricePerUnit) || 0;
  const cbm = (ov.cubicMeasurement != null ? Number(ov.cubicMeasurement) : Number(article.cubicMeasurement)) || 0;
  const nw = (ov.netWeight != null ? Number(ov.netWeight) : Number(article.netWeight)) || 0;

  if (qty === 0) return 0;

  const linkedFac = factures.find(f => f.id === article.factureId);
  let tc = DEFAULT_TAUX;
  let fraisTransitMad = 0, fraisChangeMad = 0, fraisSuppMad = 0, fretTotal$ = 0;

  if (linkedFac) {
    const paid = Number(linkedFac.invoicePaidDhs) || 0;
    const declared = Number(linkedFac.declaredValue) || 0;
    if (paid > 0 && declared > 0) tc = paid / declared;
    else if (Number(linkedFac.exchangeRate) > 0) tc = Number(linkedFac.exchangeRate);
    else if (Number(linkedFac.tauxChange) > 0) tc = Number(linkedFac.tauxChange);

    fraisTransitMad = Number(linkedFac.supplierInvoiceAmount) || 0;
    fraisChangeMad = Number(linkedFac.exchangeInvoiceAmount) || 0;
    fraisSuppMad = Number(linkedFac.additionalCostsAmount) || 0;
    fretTotal$ = Number(linkedFac.freightCost) || Number(linkedFac.freight) || 0;
  }

  const totalFraisHT = (fraisTransitMad + fraisChangeMad + fraisSuppMad) / 1.20;
  const fretMad = (fretTotal$ * tc) / 1.20;
  const mtFraisTotal = totalFraisHT + fretMad;

  const cbmTotal = linkedFac
    ? allArticles.filter(a => a.factureId === linkedFac.id).reduce((s, a) => {
        const aOv = allOverrides[a.id] || {};
        return s + ((aOv.cubicMeasurement != null ? Number(aOv.cubicMeasurement) : Number(a.cubicMeasurement)) || 0);
      }, 0) || 1
    : 1;

  const fraisCmd = cbm > 0 && cbmTotal > 0 ? (cbm / cbmTotal) * mtFraisTotal : 0;

  const cat = categories.find(c => c.name === article.categoryId || c.id === article.categoryId);
  const customsVpKg = ov.customsValuePerKg != null ? Number(ov.customsValuePerKg) : (cat?.customsValuePerKg != null ? Number(cat.customsValuePerKg) : 0);
  const diRate = (ov.importDutyRate != null ? Number(ov.importDutyRate) : (cat?.importDutyRate ?? 0)) / 100;
  const tpiRate = (ov.tpiRate != null ? Number(ov.tpiRate) : (cat?.tpiRate ?? 0)) / 100;
  const ticRate = (ov.ticRate != null ? Number(ov.ticRate) : (cat?.ticRate ?? 0)) / 100;
  const tvaRate = (ov.tvaRate != null ? Number(ov.tvaRate) : (cat?.tvaRate ?? 20)) / 100;

  const hasCust = customsVpKg > 0 && nw > 0;
  const valDouane = hasCust ? nw * customsVpKg : 0;
  const diMad = valDouane * diRate;
  const tpiMad = valDouane * tpiRate;
  const ticMad = valDouane * ticRate;
  const tvaMad = (valDouane + diMad + tpiMad + ticMad) * tvaRate;
  const totalTaxes = diMad + tpiMad + ticMad + tvaMad;
  const valAchat = qty * prix * tc;
  const coutTotal = valAchat + fraisCmd + totalTaxes;
  return qty > 0 ? coutTotal / qty : 0;
}

function fmt(n: number) {
  return n.toLocaleString('fr-MA', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export default function CommercialExportModal({
  open, onOpenChange, clientName, articles, factures, categories
}: CommercialExportModalProps) {
  const { user } = useUser();
  const firestore = useFirestore();
  const [overrides, setOverrides] = useState<Record<string, any>>({});
  const [prices, setPrices] = useState<Record<string, string>>({}); // articleId → prix de vente
  const [showSuggestions, setShowSuggestions] = useState(true);
  const [expandedDossiers, setExpandedDossiers] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(false);
  const [generating, setGenerating] = useState(false);

  // Load overrides from dp_declarations
  useEffect(() => {
    if (!open || !firestore || !user || articles.length === 0) return;
    setLoading(true);

    const factureIds = [...new Set(articles.map(a => a.factureId).filter(Boolean))];
    if (factureIds.length === 0) { setLoading(false); return; }

    (async () => {
      try {
        const merged: Record<string, any> = {};
        for (const fid of factureIds) {
          const snap = await getDocs(query(
            collection(firestore, 'users', user.uid, 'dp_declarations'),
            where('factureId', '==', fid)
          ));
          snap.docs.forEach(d => {
            const data = d.data();
            if (data.overrides) Object.assign(merged, data.overrides);
          });
          try {
            const direct = await getDocs(collection(firestore, 'users', user.uid, 'dp_declarations'));
            direct.docs.forEach(d => {
              if (d.id === fid || d.data().factureId === fid) {
                const data = d.data();
                if (data.overrides) Object.assign(merged, data.overrides);
              }
            });
          } catch (_) {}
        }
        setOverrides(merged);
      } catch (e) {
        console.error('CommercialExportModal overrides load error:', e);
      } finally {
        setLoading(false);
      }
    })();
  }, [open, firestore, user, articles]);

  // Build dossiers — ONE ROW PER ARTICLE (not per color)
  const dossiers = useMemo(() => {
    const grouped: Record<string, any[]> = {};
    articles.forEach(article => {
      const key = article.factureId || 'sans-dossier';
      if (!grouped[key]) grouped[key] = [];
      grouped[key].push(article);
    });

    return Object.entries(grouped).map(([factureId, dosArticles]) => {
      const facture = factures.find(f => f.id === factureId);
      const label = facture?.reference || facture?.name || facture?.ref || factureId;
      return { factureId, label, facture, rows: dosArticles };
    });
  }, [articles, factures]);

  // Initialise prices from suggestions
  useEffect(() => {
    if (loading || dossiers.length === 0) return;
    const init: Record<string, string> = {};
    dossiers.forEach(d => {
      d.rows.forEach(art => {
        if (!prices[art.id]) {
          const sugg = computePauTtc(art, overrides, factures, articles, categories);
          init[art.id] = sugg > 0 ? fmt(sugg).replace(/\s/g, '') : '';
        }
      });
    });
    if (Object.keys(init).length > 0) setPrices(p => ({ ...init, ...p }));
  }, [loading, dossiers, overrides]);

  // Expand all by default on first open
  useEffect(() => {
    if (open && dossiers.length > 0) {
      setExpandedDossiers(new Set(dossiers.map(d => d.factureId)));
    }
  }, [open, dossiers.length]);

  const toggleDossier = (id: string) => {
    setExpandedDossiers(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  const handleGenerate = async () => {
    setGenerating(true);
    try {
      // Pass articles directly (not expanded) with price + dossier label
      const pdfRows = dossiers.flatMap(d =>
        d.rows.map(art => ({
          ...art,
          _dossierLabel: d.label,
          _prixVente: parseFloat((prices[art.id] || '0').replace(/,/g, '.')) || 0,
          _variantsSummary: getVariantsSummary(art),
          _totalQty: getTotalQty(art),
        }))
      );
      await exportCommercialPDF(clientName, pdfRows);
    } catch (e) {
      console.error('Export commercial PDF error:', e);
    } finally {
      setGenerating(false);
    }
  };

  const totalTtc = dossiers.flatMap(d => d.rows).reduce((s, art) => {
    const p = parseFloat((prices[art.id] || '0').replace(/,/g, '.')) || 0;
    return s + p * getTotalQty(art);
  }, 0);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-hidden flex flex-col p-0 rounded-2xl">
        {/* Header */}
        <div className="bg-stone-900 px-6 py-5 flex items-center justify-between shrink-0">
          <div>
            <DialogTitle className="text-white font-black text-lg uppercase tracking-tight">
              Offre Commerciale
            </DialogTitle>
            <p className="text-stone-400 text-[10px] font-bold uppercase tracking-widest mt-0.5">
              {clientName} · Saisie des prix de vente
            </p>
          </div>
          <button
            onClick={() => setShowSuggestions(s => !s)}
            className={`flex items-center gap-1.5 text-[9px] font-black uppercase tracking-widest px-3 py-1.5 rounded-lg border transition-all ${
              showSuggestions
                ? 'bg-amber-500/20 border-amber-500/40 text-amber-300'
                : 'bg-white/10 border-white/20 text-stone-400'
            }`}
          >
            {showSuggestions ? <Eye className="w-3 h-3" /> : <EyeOff className="w-3 h-3" />}
            PA TTC (admin)
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-6 py-4 space-y-4">
          {loading ? (
            <div className="flex items-center justify-center py-16">
              <Loader2 className="w-8 h-8 animate-spin text-stone-300" />
            </div>
          ) : dossiers.length === 0 ? (
            <div className="text-center py-16 text-stone-400 text-sm">
              Aucun article trouvé.
            </div>
          ) : (
            dossiers.map(dossier => {
              const isOpen = expandedDossiers.has(dossier.factureId);
              return (
                <div key={dossier.factureId} className="border border-stone-200 rounded-xl overflow-hidden">
                  {/* Dossier header */}
                  <button
                    className="w-full flex items-center justify-between px-4 py-3 bg-stone-50 hover:bg-stone-100 transition-colors"
                    onClick={() => toggleDossier(dossier.factureId)}
                  >
                    <div className="flex items-center gap-2">
                      {isOpen ? <ChevronDown className="w-4 h-4 text-stone-400" /> : <ChevronRight className="w-4 h-4 text-stone-400" />}
                      <span className="text-[11px] font-black text-stone-700 uppercase tracking-wide">
                        📦 Dossier : {dossier.label}
                      </span>
                      <Badge variant="outline" className="text-[9px] font-black">
                        {dossier.rows.length} article{dossier.rows.length > 1 ? 's' : ''}
                      </Badge>
                    </div>
                  </button>

                  {/* Rows — one per article */}
                  {isOpen && (
                    <div className="divide-y divide-stone-100">
                      {/* Column headers */}
                      <div className="grid px-4 py-2 bg-stone-900 text-white" style={{ gridTemplateColumns: showSuggestions ? '2fr 2.5fr 0.8fr 1fr 1.2fr 1fr' : '2fr 2.5fr 0.8fr 1.2fr 1fr' }}>
                        {['Désignation', 'Couleurs / Variantes', 'Qté', ...(showSuggestions ? ['💡 PA TTC'] : []), 'Prix Vente (MAD)', 'Total TTC'].map(col => (
                          <span key={col} className="text-[8px] font-black uppercase tracking-widest truncate pr-2">{col}</span>
                        ))}
                      </div>

                      {dossier.rows.map((art, ri) => {
                        const sugg = computePauTtc(art, overrides, factures, articles, categories);
                        const priceVal = parseFloat((prices[art.id] || '').replace(/,/g, '.')) || 0;
                        const qty = getTotalQty(art);
                        const total = priceVal * qty;
                        const variants = getVariantsSummary(art);

                        return (
                          <div
                            key={art.id}
                            className={`grid items-center px-4 py-2.5 gap-2 ${ri % 2 === 0 ? 'bg-white' : 'bg-stone-50/50'}`}
                            style={{ gridTemplateColumns: showSuggestions ? '2fr 2.5fr 0.8fr 1fr 1.2fr 1fr' : '2fr 2.5fr 0.8fr 1.2fr 1fr' }}
                          >
                            {/* Désignation */}
                            <span className="text-[11px] font-bold text-stone-800 truncate">
                              {art.categoryId || art.name || '—'}
                            </span>
                            {/* Couleurs / Variantes — compact */}
                            <div className="flex flex-wrap gap-1">
                              {Array.isArray(art.colorBreakdown) && art.colorBreakdown.length > 0 ? (
                                art.colorBreakdown.map((r: any, ci: number) => (
                                  <span key={ci} className="text-[8px] font-bold bg-violet-50 text-violet-700 border border-violet-200 rounded px-1.5 py-0.5 whitespace-nowrap">
                                    {r.colorCode || r.color || '?'} ×{Number(r.rolls) || Number(r.quantity) || 0}
                                  </span>
                                ))
                              ) : Array.isArray(art.sizeBreakdown) && art.sizeBreakdown.length > 0 ? (
                                art.sizeBreakdown.map((r: any, si: number) => (
                                  <span key={si} className="text-[8px] font-bold bg-blue-50 text-blue-700 border border-blue-200 rounded px-1.5 py-0.5 whitespace-nowrap">
                                    {r.size || '?'} ×{Number(r.quantity) || 0}
                                  </span>
                                ))
                              ) : (
                                <span className="text-[10px] font-medium text-stone-500">{art.color || '—'}</span>
                              )}
                            </div>
                            {/* Qté totale */}
                            <span className="text-[10px] font-black text-stone-800">
                              {qty.toLocaleString('fr-MA')}
                            </span>
                            {/* Suggestion PA TTC (admin only) */}
                            {showSuggestions && (
                              <span className="text-[10px] font-bold text-amber-600 bg-amber-50 border border-amber-200 rounded px-1.5 py-0.5 whitespace-nowrap w-fit">
                                {sugg > 0 ? `${fmt(sugg)}` : '—'}
                              </span>
                            )}
                            {/* Prix de vente */}
                            <Input
                              type="number"
                              step="0.01"
                              min="0"
                              placeholder="0.00"
                              value={prices[art.id] || ''}
                              onChange={e => setPrices(p => ({ ...p, [art.id]: e.target.value }))}
                              className="h-8 text-[11px] font-bold border-indigo-200 rounded-lg text-right focus:border-indigo-500 focus:ring-indigo-200"
                            />
                            {/* Total */}
                            <span className="text-[11px] font-black text-stone-700 text-right">
                              {total > 0 ? fmt(total) : '—'}
                            </span>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              );
            })
          )}
        </div>

        {/* Footer */}
        <div className="border-t px-6 py-4 flex items-center justify-between bg-stone-50 shrink-0">
          <div>
            <p className="text-[9px] font-black text-stone-400 uppercase tracking-widest">Total TTC estimé</p>
            <p className="text-xl font-black text-stone-900">{fmt(totalTtc)} <span className="text-sm font-bold text-stone-400">MAD</span></p>
          </div>
          <div className="flex gap-3">
            <Button variant="outline" onClick={() => onOpenChange(false)} className="font-black text-[10px] uppercase">
              Annuler
            </Button>
            <Button
              onClick={handleGenerate}
              disabled={generating || loading}
              className="bg-indigo-600 hover:bg-indigo-700 text-white font-black text-[10px] uppercase tracking-widest gap-2 px-5"
            >
              {generating ? <Loader2 className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4" />}
              Générer PDF Commercial
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
