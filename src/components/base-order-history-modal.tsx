"use client";

import React, { useState, useEffect, useMemo } from 'react';
import { X, History, AlertTriangle, Package, Calendar, Tag, ShieldAlert } from 'lucide-react';
import { useFirebase } from '@/firebase';
import { doc, getDoc } from 'firebase/firestore';

interface BaseOrderHistoryModalProps {
  baseOrder: any;
  articles: any[];
  factures: any[];
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export default function BaseOrderHistoryModal({ baseOrder, articles, factures, open, onOpenChange }: BaseOrderHistoryModalProps) {
  const { firestore, user } = useFirebase();
  const [overridesCache, setOverridesCache] = useState<Record<string, any>>({});
  const [loading, setLoading] = useState(false);

  // Find all articles generated from this base order
  const historyArticles = useMemo(() => {
    if (!baseOrder) return [];
    return articles
      .filter(a => a.generatedFromBaseOrder === baseOrder.name || a.containerRef === baseOrder.name)
      .sort((a, b) => new Date(b.orderDate || 0).getTime() - new Date(a.orderDate || 0).getTime());
  }, [articles, baseOrder]);

  const factureIds = useMemo(() => {
    const ids = new Set<string>();
    historyArticles.forEach(a => {
      if (a.factureId) ids.add(a.factureId);
    });
    return Array.from(ids);
  }, [historyArticles]);

  useEffect(() => {
    if (!open || !firestore || !user || factureIds.length === 0) return;

    let mounted = true;
    setLoading(true);

    const fetchOverrides = async () => {
      const cache: Record<string, any> = {};
      try {
        await Promise.all(
          factureIds.map(async (fid) => {
            const snap = await getDoc(doc(firestore, 'users', user.uid, 'dp_declarations', fid));
            if (snap.exists() && snap.data().overrides) {
              cache[fid] = snap.data().overrides;
            }
          })
        );
        if (mounted) {
          setOverridesCache(cache);
        }
      } catch (err) {
        console.error("Failed to load overrides:", err);
      } finally {
        if (mounted) setLoading(false);
      }
    };

    fetchOverrides();
    return () => { mounted = false; };
  }, [open, firestore, user, factureIds]);

  if (!open || !baseOrder) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" onClick={() => onOpenChange(false)}>
      <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" />
      <div
        className="relative bg-stone-900 rounded-2xl shadow-2xl border border-stone-700 w-full max-w-4xl max-h-[85vh] flex flex-col"
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-start justify-between p-6 border-b border-stone-700 shrink-0">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <div className="p-1.5 bg-indigo-500/20 rounded-lg">
                <History className="w-4 h-4 text-indigo-400" />
              </div>
              <span className="text-[9px] font-black text-indigo-400 uppercase tracking-widest">Audit Analytique</span>
            </div>
            <h2 className="text-xl font-black text-white uppercase tracking-tight leading-none flex items-center gap-3">
              Historique d'Importation
            </h2>
            <p className="text-[11px] font-bold text-amber-500 mt-2 uppercase flex items-center gap-1.5">
              <Package className="w-3.5 h-3.5" /> Modèle : {baseOrder.name}
            </p>
          </div>
          <button onClick={() => onOpenChange(false)} className="p-2 hover:bg-stone-800 rounded-xl transition-colors">
            <X className="w-5 h-5 text-stone-400" />
          </button>
        </div>

        {/* Body */}
        <div className="p-6 overflow-y-auto space-y-4">
          {historyArticles.length === 0 ? (
            <div className="text-center py-12">
              <History className="w-12 h-12 text-stone-700 mx-auto mb-3" />
              <p className="text-stone-400 font-bold uppercase tracking-wider text-xs">Aucune importation trouvée pour ce modèle</p>
            </div>
          ) : (
            <div className="space-y-3">
              {historyArticles.map((article, idx) => {
                const facture = factures.find(f => f.id === article.factureId);
                const articleOverrides = facture ? (overridesCache[facture.id]?.[article.id] || null) : null;
                const hasOverride = articleOverrides && Object.keys(articleOverrides).length > 0;

                // Calculer la quantité totale si c'est un tableau de taille/couleur
                const totalQty = (article.colorBreakdown && article.colorBreakdown.length > 0)
                  ? article.colorBreakdown.reduce((sum: number, b: any) => sum + (Number(b.rolls) || Number(b.quantity) || 0), 0)
                  : (article.sizeBreakdown && article.sizeBreakdown.length > 0)
                  ? article.sizeBreakdown.reduce((sum: number, b: any) => sum + (Number(b.quantity) || 0), 0)
                  : Number(article.quantity) || 0;

                return (
                  <div key={article.id || idx} className="bg-stone-800/50 border border-stone-700 rounded-xl p-4 flex flex-col md:flex-row gap-4 md:items-center justify-between hover:bg-stone-800 transition-colors">
                    
                    {/* Left: Info de base */}
                    <div className="space-y-2">
                      <div className="flex items-center gap-3">
                        <span className="text-[10px] font-black text-stone-400 uppercase tracking-widest flex items-center gap-1">
                          <Calendar className="w-3 h-3" />
                          {article.orderDate || 'Date inconnue'}
                        </span>
                        <span className={`text-[9px] font-black uppercase tracking-widest px-2 py-0.5 rounded-full ${
                          article.status === 'PI' ? 'bg-amber-500/20 text-amber-400' :
                          article.status === 'SHIPPED' ? 'bg-sky-500/20 text-sky-400' :
                          article.status === 'TRANSIT' ? 'bg-indigo-500/20 text-indigo-400' :
                          article.status === 'CUSTOMS' ? 'bg-orange-500/20 text-orange-400' :
                          article.status === 'STOCK' ? 'bg-emerald-500/20 text-emerald-400' :
                          'bg-stone-700 text-stone-300'
                        }`}>
                          {article.status === 'PI' ? 'Production' : article.status === 'SHIPPED' || article.status === 'TRANSIT' ? 'Transit' : article.status === 'CUSTOMS' ? 'Douane' : article.status === 'STOCK' ? 'Stock' : article.status}
                        </span>
                      </div>
                      
                      <div className="flex flex-col gap-1">
                        <div className="flex items-center gap-2">
                          <span className="text-sm font-bold text-white">Dossier: {facture?.id || 'Aucun (Production)'}</span>
                          {facture?.supplierId && (
                            <span className="text-xs font-bold text-stone-400">({facture.supplierId})</span>
                          )}
                        </div>
                        <div className="text-xs text-stone-400 font-medium">
                          Quantité : <span className="text-amber-400 font-bold">{totalQty} {article.unitOfMeasure || 'pcs'}</span>
                          {article.purchasePricePerUnit ? ` • PAU : $${article.purchasePricePerUnit}` : ''}
                        </div>
                      </div>
                    </div>

                    {/* Right: Override Status */}
                    <div className="flex items-center gap-3 mt-2 md:mt-0">
                      {loading ? (
                        <div className="flex items-center gap-2 text-stone-500 text-[10px] font-black uppercase tracking-widest">
                          <div className="w-3 h-3 border-2 border-stone-500 border-t-transparent rounded-full animate-spin" />
                          Vérification...
                        </div>
                      ) : hasOverride ? (
                        <div className="flex flex-col items-end gap-1">
                          <span className="flex items-center gap-1.5 bg-red-500/10 border border-red-500/20 text-red-400 text-[9px] font-black uppercase tracking-widest px-3 py-1.5 rounded-lg">
                            <ShieldAlert className="w-3.5 h-3.5" /> Fausse Déclaration (Override)
                          </span>
                          {articleOverrides.customsValuePerKg && (
                            <span className="text-[10px] font-bold text-stone-400">Val. Douane: {articleOverrides.customsValuePerKg} MAD/kg</span>
                          )}
                        </div>
                      ) : facture ? (
                        <span className="flex items-center gap-1.5 bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-[9px] font-black uppercase tracking-widest px-3 py-1.5 rounded-lg">
                          Valeur par défaut
                        </span>
                      ) : (
                        <span className="text-[9px] font-black text-stone-500 uppercase tracking-widest">En attente de facture</span>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
