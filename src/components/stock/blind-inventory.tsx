"use client";

import React, { useState, useMemo } from 'react';
import { ClipboardCheck, CheckCircle2, History, Search, X, AlertTriangle, Minus, Plus, Equal, Flag } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { ProductPicker } from './stock-movement-modal';
import type { StockItem, StockMovement, Store } from '@/lib/types';
import { suggestInboundLocation } from '@/lib/warehouse-locations';

interface CountedLine {
  articleId: string;
  realArticleId: string;
  productName: string;
  color?: string;
  size?: string;
  quality?: string;
  categoryId: string;
  unitOfMeasure: string;
  theoretical: number;
  counted: number;
}

interface BlindInventoryProps {
  stockItems: StockItem[];
  categories: any[];
  generalCategories: any[];
  activeStore: string;
  stores: Store[];
  /** Mouvements, pour rattacher l'ajustement à l'emplacement où le produit se trouve. */
  movements?: any[];
  onAddMovement: (m: Omit<StockMovement, 'id' | 'createdAt'>) => Promise<void>;
  onFinalizeSession?: (storeId: string, itemCount: number, varianceCount: number) => Promise<void>;
  adminUid: string | null;
}

export default function BlindInventory({
  stockItems, categories, generalCategories, activeStore, stores, movements = [],
  onAddMovement, onFinalizeSession,
}: BlindInventoryProps) {
  const [picking, setPicking] = useState(false);
  const [selected, setSelected] = useState<StockItem | null>(null);
  const [countedValue, setCountedValue] = useState('');
  const [saving, setSaving] = useState(false);
  const [finalizing, setFinalizing] = useState(false);
  const [session, setSession] = useState<CountedLine[]>([]);

  const currentStore = stores.find(s => s.id === activeStore);
  const isRealStore = activeStore !== 'ALL' && activeStore !== 'ALL_MAIN';

  const theoreticalQty = (item: StockItem): number => {
    if (!isRealStore) return item.currentQty;
    return item.qtyByStore ? ((item.qtyByStore as any)[activeStore] || 0) : 0;
  };

  const handlePick = (articleId: string) => {
    const item = stockItems.find(i => i.articleId === articleId);
    if (!item) return;
    setSelected(item);
    setCountedValue('');
    setPicking(false);
  };

  const ecart = useMemo(() => {
    if (!selected || countedValue === '') return null;
    return (Number(countedValue) || 0) - theoreticalQty(selected);
  }, [selected, countedValue, activeStore]);

  const handleConfirmCount = async () => {
    if (!selected || countedValue === '' || saving) return;
    const theoretical = theoreticalQty(selected);
    const counted = Number(countedValue) || 0;
    const diff = counted - theoretical;

    setSaving(true);
    try {
      if (diff !== 0) {
        const invStore = isRealStore ? (activeStore as any) : (currentStore?.id as any) || 'CHRIFA';
        const realId = (selected as any)._realArticleId || selected.articleId;
        // Un comptage porte sur le magasin entier : on ne rattache l'écart à un emplacement
        // que si le produit n'est rangé qu'à un seul endroit — sinon on ne devine pas.
        const spot = suggestInboundLocation(movements, invStore, realId);
        await onAddMovement({
          articleId: (selected as any)._realArticleId || selected.articleId,
          categoryId: selected.categoryId,
          productName: selected.nameFR || selected.productName,
          nameFR: selected.nameFR,
          color: selected.color,
          size: selected.size,
          quality: selected.quality,
          unitOfMeasure: selected.unitOfMeasure || 'unité',
          type: 'ADJUSTMENT',
          reason: 'INVENTAIRE',
          storeId: invStore,
          ...(spot ? { locationCode: spot.locationCode, locationId: spot.locationId } : {}),
          quantity: diff,
          date: new Date().toISOString().split('T')[0],
          notes: `Inventaire physique : théorique ${theoretical}, compté ${counted}`,
        });
      }
      setSession(prev => [{
        articleId: selected.articleId,
        realArticleId: (selected as any)._realArticleId || selected.articleId,
        productName: selected.nameFR || selected.productName,
        color: selected.color,
        size: selected.size,
        quality: selected.quality,
        categoryId: selected.categoryId,
        unitOfMeasure: selected.unitOfMeasure || 'unité',
        theoretical,
        counted,
      }, ...prev]);
      setSelected(null);
      setCountedValue('');
    } finally {
      setSaving(false);
    }
  };

  const varianceCount = session.filter(l => l.counted !== l.theoretical).length;

  const handleFinalize = async () => {
    if (!onFinalizeSession || !isRealStore || session.length === 0 || finalizing) return;
    setFinalizing(true);
    try {
      await onFinalizeSession(activeStore, session.length, varianceCount);
      setSession([]);
    } finally {
      setFinalizing(false);
    }
  };

  return (
    <div className="space-y-6 animate-in fade-in duration-300 pb-32">
      {/* Header */}
      <div className="bg-gradient-to-br from-amber-900 to-amber-700 p-8 rounded-3xl shadow-2xl relative overflow-hidden">
        <div className="absolute bottom-0 left-1/3 w-64 h-64 bg-amber-400/10 rounded-full translate-y-1/2 blur-3xl" />
        <div className="relative z-10 flex flex-col sm:flex-row justify-between items-start gap-4">
          <div>
            <div className="flex items-center gap-3 mb-2">
              <ClipboardCheck className="w-6 h-6 text-amber-300" />
              <p className="text-[11px] font-black text-amber-300 uppercase tracking-[0.3em]">Inventaire Physique</p>
            </div>
            <h1 className="text-3xl font-black text-white uppercase tracking-tighter">
              Session de Comptage
            </h1>
            <p className="text-[10px] font-bold text-amber-400 uppercase tracking-widest mt-2">
              {currentStore?.name || 'Sélectionnez un magasin'} — comptez un produit à la fois, l'écart ajuste le stock automatiquement
            </p>
          </div>
          <div className="flex items-center gap-3">
            <div className="text-right">
              <p className="text-3xl font-black text-white">{session.length}</p>
              <p className="text-[11px] font-black text-amber-400 uppercase tracking-widest mt-1">Comptés</p>
            </div>
            {varianceCount > 0 && (
              <div className="text-right border-l border-amber-500/30 pl-3">
                <p className="text-3xl font-black text-orange-200">{varianceCount}</p>
                <p className="text-[11px] font-black text-amber-400 uppercase tracking-widest mt-1">Écarts</p>
              </div>
            )}
          </div>
        </div>
      </div>

      {!isRealStore && (
        <div className="p-4 bg-amber-50 border border-amber-200 rounded-2xl flex items-center gap-2.5 text-amber-800 text-xs font-bold">
          <AlertTriangle className="w-4 h-4 shrink-0" />
          Sélectionnez un magasin précis (pas « Vue Globale ») en haut de l'écran pour lancer une session d'inventaire.
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Colonne de gauche : comptage */}
        <div className="lg:col-span-2 space-y-4">
          <div className="bg-white rounded-3xl shadow-lg border border-stone-100 p-5">
            {!selected ? (
              picking ? (
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <p className="text-xs font-black text-stone-700 uppercase">Choisir un produit à compter</p>
                    <button onClick={() => setPicking(false)} className="text-stone-400 hover:text-stone-700">
                      <X className="w-4 h-4" />
                    </button>
                  </div>
                  <ProductPicker
                    stockItems={stockItems}
                    categories={categories}
                    generalCategories={generalCategories}
                    formType="ADJUSTMENT"
                    onSelect={handlePick}
                  />
                </div>
              ) : (
                <Button
                  onClick={() => setPicking(true)}
                  disabled={!isRealStore}
                  className="w-full h-14 bg-stone-900 hover:bg-stone-800 text-white font-black uppercase text-xs rounded-2xl gap-2"
                >
                  <Search className="w-4 h-4" /> Rechercher un produit à compter
                </Button>
              )
            ) : (
              <div className="space-y-4">
                <div className="flex items-start justify-between">
                  <div>
                    <p className="text-sm font-black text-stone-900">{selected.nameFR || selected.productName}</p>
                    <p className="text-[10px] font-bold text-stone-400 mt-0.5">
                      {[selected.quality, selected.color, selected.size].filter(Boolean).join(' · ') || selected.categoryId}
                    </p>
                  </div>
                  <button onClick={() => { setSelected(null); setCountedValue(''); }} className="text-stone-400 hover:text-red-600">
                    <X className="w-4 h-4" />
                  </button>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div className="p-4 bg-stone-50 rounded-2xl border border-stone-100">
                    <p className="text-[11px] font-black text-stone-400 uppercase tracking-widest">Stock théorique</p>
                    <p className="text-2xl font-black text-stone-900 mt-1">{theoreticalQty(selected)} <span className="text-xs font-bold text-stone-400">{selected.unitOfMeasure}</span></p>
                  </div>
                  <div className="p-4 bg-emerald-50 rounded-2xl border border-emerald-100">
                    <p className="text-[11px] font-black text-emerald-600 uppercase tracking-widest">Quantité comptée</p>
                    <Input
                      type="number" min={0} step="any" autoFocus
                      value={countedValue}
                      onChange={e => setCountedValue(e.target.value)}
                      onKeyDown={e => { if (e.key === 'Enter') handleConfirmCount(); }}
                      className="h-10 mt-1 text-xl font-black bg-white border-emerald-200"
                      placeholder="0"
                    />
                  </div>
                </div>

                {ecart !== null && (
                  <div className={`p-3.5 rounded-2xl flex items-center justify-between border ${
                    ecart === 0 ? 'bg-emerald-50 border-emerald-200' : ecart > 0 ? 'bg-blue-50 border-blue-200' : 'bg-red-50 border-red-200'
                  }`}>
                    <span className={`text-[10px] font-black uppercase tracking-widest flex items-center gap-1.5 ${
                      ecart === 0 ? 'text-emerald-700' : ecart > 0 ? 'text-blue-700' : 'text-red-700'
                    }`}>
                      {ecart === 0 ? <Equal className="w-3.5 h-3.5" /> : ecart > 0 ? <Plus className="w-3.5 h-3.5" /> : <Minus className="w-3.5 h-3.5" />}
                      {ecart === 0 ? 'Aucun écart' : ecart > 0 ? 'Surplus détecté' : 'Manquant détecté'}
                    </span>
                    <span className={`text-lg font-black ${ecart === 0 ? 'text-emerald-800' : ecart > 0 ? 'text-blue-800' : 'text-red-800'}`}>
                      {ecart > 0 ? '+' : ''}{ecart}
                    </span>
                  </div>
                )}

                <Button
                  onClick={handleConfirmCount}
                  disabled={countedValue === '' || saving}
                  className="w-full h-12 bg-emerald-600 hover:bg-emerald-700 text-white font-black uppercase text-xs rounded-2xl gap-2"
                >
                  <CheckCircle2 className="w-4 h-4" /> {saving ? 'Enregistrement...' : 'Valider ce comptage'}
                </Button>
              </div>
            )}
          </div>

          {session.length > 0 && isRealStore && (
            <Button
              onClick={handleFinalize}
              disabled={finalizing}
              variant="outline"
              className="w-full h-12 border-amber-300 text-amber-700 hover:bg-amber-50 font-black uppercase text-xs rounded-2xl gap-2"
            >
              <Flag className="w-4 h-4" /> {finalizing ? 'Clôture...' : `Clôturer la session (${session.length} article${session.length > 1 ? 's' : ''})`}
            </Button>
          )}
        </div>

        {/* Colonne de droite : historique de session */}
        <div className="bg-white rounded-3xl shadow-lg border border-stone-100 overflow-hidden flex flex-col max-h-[700px]">
          <div className="p-5 border-b border-stone-100 bg-stone-50/50 flex items-center gap-2">
            <History className="w-4 h-4 text-stone-400" />
            <h2 className="text-sm font-black text-stone-900 uppercase tracking-tight">Comptages de la session</h2>
          </div>

          <div className="flex-1 overflow-y-auto p-4 space-y-2.5">
            {session.length === 0 ? (
              <div className="text-center py-12">
                <CheckCircle2 className="w-8 h-8 text-stone-200 mx-auto mb-2" />
                <p className="text-[10px] font-black uppercase tracking-widest text-stone-400">Aucun produit compté</p>
              </div>
            ) : (
              session.map((l, i) => {
                const diff = l.counted - l.theoretical;
                return (
                  <div key={i} className={`p-3 rounded-2xl border ${diff === 0 ? 'bg-stone-50 border-stone-100' : diff > 0 ? 'bg-blue-50 border-blue-100' : 'bg-red-50 border-red-100'}`}>
                    <p className="text-[10px] font-black text-stone-900 leading-tight">{l.productName}</p>
                    {(l.color || l.size || l.quality) && (
                      <p className="text-[11px] font-bold text-stone-400 mt-0.5">{[l.quality, l.color, l.size].filter(Boolean).join(' · ')}</p>
                    )}
                    <div className="flex justify-between items-center mt-2 pt-2 border-t border-black/5">
                      <span className="text-[11px] font-bold text-stone-400">Théo. {l.theoretical} → Compté {l.counted}</span>
                      <span className={`text-xs font-black ${diff === 0 ? 'text-emerald-600' : diff > 0 ? 'text-blue-600' : 'text-red-600'}`}>
                        {diff === 0 ? 'RAS' : (diff > 0 ? '+' : '') + diff}
                      </span>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
