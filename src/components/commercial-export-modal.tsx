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
  articles: any[];   // all app articles (filtered externally to client's articles)
  factures: any[];   // all dp_declarations
  categories: any[]; // sub-categories with tax rates
}

// Expand an article into color/size rows (same logic as devis-pi-view)
function expandArticleToRows(article: any): any[] {
  const cb = Array.isArray(article.colorBreakdown) ? article.colorBreakdown : [];
  const sb = Array.isArray(article.sizeBreakdown) ? article.sizeBreakdown : [];

  if (cb.length > 0) {
    return cb.map((r: any) => ({
      ...article,
      _rowId: `${article.id}_cb_${r.color || r.id || Math.random()}`,
      _parentId: article.id,
      color: r.color || article.color || '—',
      quantity: Number(r.rolls) || Number(r.quantity) || 0,
      purchasePricePerUnit: (r.priceOverride !== '' && r.priceOverride != null)
        ? Number(r.priceOverride)
        : Number(article.purchasePricePerUnit || 0),
    }));
  }
  if (sb.length > 0) {
    return sb.map((r: any) => ({
      ...article,
      _rowId: `${article.id}_sb_${r.size || r.id || Math.random()}`,
      _parentId: article.id,
      size: r.size || article.size || '—',
      quantity: Number(r.quantity) || 0,
      purchasePricePerUnit: (r.priceOverride !== '' && r.priceOverride != null)
        ? Number(r.priceOverride)
        : Number(article.purchasePricePerUnit || 0),
    }));
  }
  return [{ ...article, _rowId: article.id, _parentId: article.id }];
}

// Compute pauTtc for a single row (simplified, mirrors devis-pi-view logic)
function computePauTtc(
  row: any,
  allOverrides: Record<string, any>,
  factures: any[],
  allArticles: any[],
  categories: any[]
): number {
  const ov = allOverrides[row._parentId || row.id] || {};
  const qty = Number(row.quantity) || 0;
  const prix = Number(row.purchasePricePerUnit) || 0;
  const cbm = (ov.cubicMeasurement != null ? Number(ov.cubicMeasurement) : Number(row.cubicMeasurement)) || 0;
  const nw = (ov.netWeight != null ? Number(ov.netWeight) : Number(row.netWeight)) || 0;

  if (qty === 0) return 0;

  const linkedFac = factures.find(f => f.id === row.factureId);
  let tc = DEFAULT_TAUX;
  let fraisTransitMad = 0;
  let fraisChangeMad = 0;
  let fraisSuppMad = 0;
  let fretTotal$ = 0;

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

  const cat = categories.find(c => c.name === row.categoryId || c.id === row.categoryId);
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
  const [prices, setPrices] = useState<Record<string, string>>({}); // rowId → prix de vente (string for input)
  const [showSuggestions, setShowSuggestions] = useState(true);
  const [expandedDossiers, setExpandedDossiers] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(false);
  const [generating, setGenerating] = useState(false);

  // Load overrides from dp_declarations for client articles
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
          // Also check directly by document id = factureId
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

  // Build rows per dossier
  const dossiers = useMemo(() => {
    // Group articles by factureId (or 'sans-dossier')
    const grouped: Record<string, any[]> = {};
    articles.forEach(article => {
      const key = article.factureId || 'sans-dossier';
      if (!grouped[key]) grouped[key] = [];
      grouped[key].push(article);
    });

    return Object.entries(grouped).map(([factureId, dosArticles]) => {
      const facture = factures.find(f => f.id === factureId);
      const label = facture?.reference || facture?.name || facture?.ref || factureId;
      const rows: any[] = [];
      dosArticles.forEach(art => {
        expandArticleToRows(art).forEach(row => rows.push(row));
      });
      return { factureId, label, facture, rows };
    });
  }, [articles, factures]);

  // Initialise prices from suggestions when overrides/dossiers are ready
  useEffect(() => {
    if (loading || dossiers.length === 0) return;
    const init: Record<string, string> = {};
    dossiers.forEach(d => {
      d.rows.forEach(row => {
        if (!prices[row._rowId]) {
          const sugg = computePauTtc(row, overrides, factures, articles, categories);
          init[row._rowId] = sugg > 0 ? fmt(sugg).replace(/\s/g, '') : '';
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
      const pdfRows = dossiers.flatMap(d =>
        d.rows.map(row => ({
          ...row,
          _dossierLabel: d.label,
          _prixVente: parseFloat((prices[row._rowId] || '0').replace(/,/g, '.')) || 0,
        }))
      );
      await exportCommercialPDF(clientName, pdfRows);
    } catch (e) {
      console.error('Export commercial PDF error:', e);
    } finally {
      setGenerating(false);
    }
  };

  const totalTtc = dossiers.flatMap(d => d.rows).reduce((s, row) => {
    const p = parseFloat((prices[row._rowId] || '0').replace(/,/g, '.')) || 0;
    return s + p * (Number(row.quantity) || 0);
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
              Aucun article trouvé pour ce client.
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
                        {dossier.rows.length} ligne{dossier.rows.length > 1 ? 's' : ''}
                      </Badge>
                    </div>
                    <span className="text-[10px] font-bold text-stone-400">
                      {dossier.rows.reduce((s, r) => s + (Number(r.quantity) || 0), 0).toLocaleString('fr-MA')} unités
                    </span>
                  </button>

                  {/* Rows */}
                  {isOpen && (
                    <div className="divide-y divide-stone-100">
                      {/* Column headers */}
                      <div className="grid px-4 py-2 bg-stone-900 text-white" style={{ gridTemplateColumns: showSuggestions ? '2fr 1fr 1fr 1fr 1.2fr 1.2fr 1fr' : '2fr 1fr 1fr 1fr 1.2fr 1fr' }}>
                        {['Désignation', 'Couleur', 'Taille', 'Qté', ...(showSuggestions ? ['💡 PA TTC (admin)'] : []), 'Prix Vente (MAD)', 'Total TTC'].map(col => (
                          <span key={col} className="text-[8px] font-black uppercase tracking-widest truncate pr-2">{col}</span>
                        ))}
                      </div>

                      {dossier.rows.map((row, ri) => {
                        const sugg = computePauTtc(row, overrides, factures, articles, categories);
                        const priceVal = parseFloat((prices[row._rowId] || '').replace(/,/g, '.')) || 0;
                        const total = priceVal * (Number(row.quantity) || 0);

                        return (
                          <div
                            key={row._rowId}
                            className={`grid items-center px-4 py-2.5 gap-2 ${ri % 2 === 0 ? 'bg-white' : 'bg-stone-50/50'}`}
                            style={{ gridTemplateColumns: showSuggestions ? '2fr 1fr 1fr 1fr 1.2fr 1.2fr 1fr' : '2fr 1fr 1fr 1fr 1.2fr 1fr' }}
                          >
                            {/* Désignation */}
                            <span className="text-[11px] font-bold text-stone-800 truncate">
                              {row.categoryId || row.name || '—'}
                            </span>
                            {/* Couleur */}
                            <span className="text-[10px] font-medium text-stone-600 truncate">
                              {row.color || '—'}
                            </span>
                            {/* Taille */}
                            <span className="text-[10px] font-medium text-stone-600 truncate">
                              {row.size || '—'}
                            </span>
                            {/* Qté */}
                            <span className="text-[10px] font-black text-stone-800">
                              {(Number(row.quantity) || 0).toLocaleString('fr-MA')} {row.unitOfMeasure || ''}
                            </span>
                            {/* Suggestion PA TTC (admin only) */}
                            {showSuggestions && (
                              <div className="flex items-center gap-1">
                                <span className="text-[10px] font-bold text-amber-600 bg-amber-50 border border-amber-200 rounded px-1.5 py-0.5 whitespace-nowrap">
                                  {sugg > 0 ? `${fmt(sugg)} MAD` : '—'}
                                </span>
                              </div>
                            )}
                            {/* Prix de vente (editable) */}
                            <div className="flex items-center gap-1">
                              <Input
                                type="number"
                                step="0.01"
                                min="0"
                                placeholder="0.00"
                                value={prices[row._rowId] || ''}
                                onChange={e => setPrices(p => ({ ...p, [row._rowId]: e.target.value }))}
                                className="h-8 text-[11px] font-bold border-indigo-200 rounded-lg text-right focus:border-indigo-500 focus:ring-indigo-200"
                              />
                            </div>
                            {/* Total */}
                            <span className="text-[11px] font-black text-stone-700 text-right">
                              {total > 0 ? `${fmt(total)}` : '—'}
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
