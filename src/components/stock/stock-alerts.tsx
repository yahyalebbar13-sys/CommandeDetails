"use client";

import React, { useState, useMemo } from 'react';
import { Bell, AlertTriangle, CheckCircle2, XCircle, Plus, Settings, ArrowRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import type { StockMovement, StockItem } from '@/lib/types';
import { useUser, useFirestore } from '@/firebase';
import { doc } from 'firebase/firestore';
import { updateDocumentNonBlocking } from '@/firebase/non-blocking-updates';
import { useToast } from '@/hooks/use-toast';
import { computeReorderAlert, formatReorderBadge } from '@/lib/reorder-utils';
import type { StoreLocation } from '@/lib/types';
import StockMovementModal from './stock-movement-modal';
import type { StorageLocation } from '@/lib/warehouse-locations';

type StockView = 'dashboard' | 'stock' | 'movements' | 'alerts';

interface StockAlertsProps {
  stockItems: StockItem[];
  articles: any[];
  categories: any[];
  movements: StockMovement[];
  stores?: any[];
  locations?: StorageLocation[];
  activeStore: StoreLocation | 'ALL';
  onNavigate: (v: StockView) => void;
  adminUid?: string | null;
  onAddMovement: (m: Omit<StockMovement, 'id' | 'createdAt'>) => Promise<void>;
  readOnly?: boolean;
}

export default function StockAlerts({ stockItems, articles, categories, movements, stores = [], locations = [], activeStore, onNavigate, adminUid, onAddMovement, readOnly = false }: StockAlertsProps) {
  const { user } = useUser();
  const firestore = useFirestore();
  const { toast } = useToast();

  const [thresholdItem, setThresholdItem] = useState<StockItem | null>(null);
  const [thresholdValue, setThresholdValue] = useState('');
  const [movementItem, setMovementItem] = useState<StockItem | null>(null);
  const [movementModalOpen, setMovementModalOpen] = useState(false);

  // Vue globale admin ('ALL') : currentQty n'agrège que le stock entrepôt (comportement
  // volontaire ailleurs dans l'app — le stock magasin tourne trop vite pour la vue globale),
  // donc une rupture réelle à CHRIFA/Derb Omar/IDAA reste invisible ici, voire faussement
  // comptée à 0 alors que le magasin a du stock. Pour les articles avec un seuil configuré,
  // on détecte donc les alertes magasin par magasin via qtyByStore (déjà calculé
  // indépendamment de la vue active), sans changer le comportement des autres vues.
  const perStoreTrackedRows = useMemo(() => {
    if (activeStore !== 'ALL') return null;
    const rows: (StockItem & { _storeLabel?: string })[] = [];
    for (const item of stockItems) {
      if (item.minThreshold == null) continue;
      const byStore = item.qtyByStore;
      if (!byStore || Object.keys(byStore).length === 0) continue;
      for (const [storeId, qty] of Object.entries(byStore)) {
        rows.push({ ...item, currentQty: Number(qty) || 0, _storeLabel: storeId } as any);
      }
    }
    return rows;
  }, [stockItems, activeStore]);

  // Alertes stock bas (sous seuil)
  const lowStockItems = useMemo(() => {
    const base = perStoreTrackedRows ?? stockItems;
    return base.filter(i => i.minThreshold != null && i.currentQty <= i.minThreshold)
      .sort((a, b) => (a.currentQty / (a.minThreshold || 1)) - (b.currentQty / (b.minThreshold || 1)));
  }, [perStoreTrackedRows, stockItems]);

  // Ruptures totales
  const ruptureItems = useMemo(() => {
    if (perStoreTrackedRows) return perStoreTrackedRows.filter(i => i.currentQty === 0);
    return stockItems.filter(i => i.currentQty === 0);
  }, [perStoreTrackedRows, stockItems]);

  // Items sans seuil configuré
  const noThresholdItems = useMemo(() =>
    stockItems.filter(i => i.minThreshold == null),
    [stockItems]
  );

  // Alertes de réapprovisionnement (reorder-utils)
  const reorderItems = useMemo(() => {
    const subCategories = categories;
    return subCategories
      .map(cat => {
        const alert = computeReorderAlert(cat, articles);
        return alert && alert.level !== 'OK' ? { cat, alert } : null;
      })
      .filter(Boolean)
      .sort((a, b) => a!.alert.daysLeft - b!.alert.daysLeft) as { cat: any; alert: ReturnType<typeof computeReorderAlert> }[];
  }, [categories, articles]);

  const handleSaveThreshold = () => {
    if (!user || !firestore || !thresholdItem) return;
    const effectiveUid = adminUid || user.uid;
    
    if (thresholdValue.trim() === '') {
      const docRef = doc(firestore, 'users', effectiveUid, 'articles', thresholdItem.articleId);
      updateDocumentNonBlocking(docRef, { minStockThreshold: null });
      toast({ title: 'Seuil supprimé', description: `${thresholdItem.productName} n'a plus de seuil minimal.` });
      setThresholdItem(null);
      return;
    }

    const val = parseFloat(thresholdValue);
    if (isNaN(val) || val < 0) return;
    const docRef = doc(firestore, 'users', effectiveUid, 'articles', thresholdItem.articleId);
    updateDocumentNonBlocking(docRef, { minStockThreshold: val });
    toast({ title: 'Seuil enregistré', description: `${thresholdItem.productName} → seuil : ${val} ${thresholdItem.unitOfMeasure}` });
    setThresholdItem(null);
  };

  const totalAlerts = lowStockItems.length + ruptureItems.length;

  return (
    <div className="space-y-6 animate-in fade-in duration-500">

      {/* Header */}
      <div className="bg-gradient-to-br from-red-900 to-red-800 p-8 rounded-3xl shadow-2xl relative overflow-hidden">
        <div className="absolute top-0 right-0 w-64 h-64 bg-red-500/10 rounded-full -translate-y-1/2 translate-x-1/2 blur-3xl" />
        <div className="relative z-10">
          <p className="text-[11px] font-black text-red-300 uppercase tracking-[0.3em] mb-1">Surveillance en temps réel</p>
          <h1 className="text-3xl font-black text-white uppercase tracking-tighter">
            Centre des <span className="text-red-300">Alertes</span>
          </h1>
          <div className="flex items-center gap-4 mt-3">
            <div className="flex items-center gap-2 bg-white/10 rounded-xl px-3 py-1.5">
              <XCircle className="w-3.5 h-3.5 text-red-300" />
              <span className="text-[10px] font-black text-white">{ruptureItems.length} rupture{ruptureItems.length > 1 ? 's' : ''}</span>
            </div>
            <div className="flex items-center gap-2 bg-white/10 rounded-xl px-3 py-1.5">
              <AlertTriangle className="w-3.5 h-3.5 text-orange-300" />
              <span className="text-[10px] font-black text-white">{lowStockItems.filter(i => i.currentQty > 0).length} stock bas</span>
            </div>
            <div className="flex items-center gap-2 bg-white/10 rounded-xl px-3 py-1.5">
              <Bell className="w-3.5 h-3.5 text-amber-300" />
              <span className="text-[10px] font-black text-white">{reorderItems.length} rappel{reorderItems.length > 1 ? 's' : ''} commande</span>
            </div>
          </div>
        </div>
      </div>

      {/* Si aucune alerte */}
      {totalAlerts === 0 && reorderItems.length === 0 && (
        <div className="flex flex-col items-center justify-center py-16 bg-white rounded-3xl shadow-lg border border-emerald-100 space-y-4">
          <div className="w-20 h-20 rounded-3xl bg-emerald-50 flex items-center justify-center">
            <CheckCircle2 className="w-10 h-10 text-emerald-500" />
          </div>
          <h3 className="text-xl font-black text-stone-900 uppercase tracking-tighter">Tout est en ordre !</h3>
          <p className="text-stone-400 text-sm font-bold text-center max-w-sm">
            Aucune alerte de stock bas ou de rupture. Continuez à surveiller vos niveaux.
          </p>
          <Button onClick={() => onNavigate('stock')} variant="outline" className="rounded-xl font-black uppercase text-[10px] tracking-widest gap-2">
            Voir le stock <ArrowRight className="w-3.5 h-3.5" />
          </Button>
        </div>
      )}

      {/* Ruptures */}
      {ruptureItems.length > 0 && (
        <section className="space-y-3">
          <div className="flex items-center gap-2">
            <XCircle className="w-5 h-5 text-red-500" />
            <h2 className="text-lg font-black text-stone-900 uppercase tracking-tighter">Ruptures de Stock</h2>
            <span className="bg-red-100 text-red-700 text-[11px] font-black px-2 py-0.5 rounded-full uppercase">{ruptureItems.length}</span>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {ruptureItems.map((item: any) => (
              <AlertCard key={`${item.articleId}-${item._storeLabel || 'x'}`} item={item} level="rupture" readOnly={readOnly}
                onOrder={() => { setMovementItem(item); setMovementModalOpen(true); }}
                onThreshold={() => { setThresholdItem(item); setThresholdValue(String(item.minThreshold || '')); }}
              />
            ))}
          </div>
        </section>
      )}

      {/* Stock bas */}
      {lowStockItems.filter(i => i.currentQty > 0).length > 0 && (
        <section className="space-y-3">
          <div className="flex items-center gap-2">
            <AlertTriangle className="w-5 h-5 text-orange-500" />
            <h2 className="text-lg font-black text-stone-900 uppercase tracking-tighter">Stock Bas</h2>
            <span className="bg-orange-100 text-orange-700 text-[11px] font-black px-2 py-0.5 rounded-full uppercase">
              {lowStockItems.filter(i => i.currentQty > 0).length}
            </span>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {lowStockItems.filter(i => i.currentQty > 0).map((item: any) => (
              <AlertCard key={`${item.articleId}-${item._storeLabel || 'x'}`} item={item} level="low" readOnly={readOnly}
                onOrder={() => { setMovementItem(item); setMovementModalOpen(true); }}
                onThreshold={() => { setThresholdItem(item); setThresholdValue(String(item.minThreshold || '')); }}
              />
            ))}
          </div>
        </section>
      )}

      {/* Rappels de commande (reorder-utils) */}
      {reorderItems.length > 0 && (
        <section className="space-y-3">
          <div className="flex items-center gap-2">
            <Bell className="w-5 h-5 text-amber-500" />
            <h2 className="text-lg font-black text-stone-900 uppercase tracking-tighter">Rappels de Commande</h2>
            <span className="bg-amber-100 text-amber-700 text-[11px] font-black px-2 py-0.5 rounded-full uppercase">{reorderItems.length}</span>
          </div>
          <div className="bg-white rounded-2xl shadow-lg border border-amber-100 overflow-hidden divide-y divide-amber-50">
            {reorderItems.map(({ cat, alert }) => (
              <div key={cat.id} className="flex items-center gap-4 px-5 py-3.5 hover:bg-amber-50/40 transition-colors">
                <div className={`w-2 h-2 rounded-full shrink-0 animate-pulse ${
                  alert!.level === 'OVERDUE' ? 'bg-red-500' : alert!.level === 'URGENT' ? 'bg-orange-500' : 'bg-amber-400'
                }`} />
                <div className="flex-1 min-w-0">
                  <p className="text-[11px] font-black text-stone-800 uppercase">{cat.name}</p>
                  <p className="text-[11px] font-bold text-stone-400">{alert!.season.season}</p>
                </div>
                <span className={`text-[11px] font-black px-2.5 py-1 rounded-full uppercase ${
                  alert!.level === 'OVERDUE' ? 'bg-red-100 text-red-700' :
                  alert!.level === 'URGENT' ? 'bg-orange-100 text-orange-700' : 'bg-amber-100 text-amber-700'
                }`}>
                  {alert!.level === 'OVERDUE' ? 'Dépassé' : alert!.level === 'URGENT' ? 'Urgent' : 'Bientôt'}
                </span>
                <span className="text-[10px] font-bold text-stone-500 whitespace-nowrap">{formatReorderBadge(alert!)}</span>
              </div>
            ))}
          </div>
          <p className="text-[10px] text-stone-400 font-bold text-center">
            Ces rappels sont configurés dans StockVue &rarr; <a href="/" className="text-emerald-600 underline">Catégories</a>
          </p>
        </section>
      )}

      {/* Items sans seuil — info */}
      {noThresholdItems.length > 0 && (
        <section className="bg-stone-50 rounded-2xl border border-stone-200 p-5">
          <div className="flex items-center gap-2 mb-3">
            <Settings className="w-4 h-4 text-stone-400" />
            <h3 className="text-[11px] font-black text-stone-600 uppercase tracking-widest">
              {noThresholdItems.length} Produit{noThresholdItems.length > 1 ? 's' : ''} sans seuil configuré
            </h3>
          </div>
          <p className="text-[10px] text-stone-400 font-bold mb-3">
            Configurez un seuil minimal pour ces produits afin d'activer les alertes automatiques.
          </p>
          <div className="flex flex-wrap gap-2">
            {noThresholdItems.slice(0, 8).map(item => (
              <button key={item.articleId}
                onClick={() => { setThresholdItem(item); setThresholdValue(''); }}
                className="text-[11px] font-black px-3 py-1.5 bg-white border border-stone-200 rounded-xl text-stone-600 hover:border-emerald-400 hover:text-emerald-700 transition-colors uppercase"
              >
                {item.productName.length > 25 ? item.productName.substring(0, 25) + '…' : item.productName}
              </button>
            ))}
            {noThresholdItems.length > 8 && (
              <span className="text-[11px] font-bold text-stone-400 px-3 py-1.5">+{noThresholdItems.length - 8} autres</span>
            )}
          </div>
        </section>
      )}

      {/* Modal seuil */}
      <Dialog open={!!thresholdItem} onOpenChange={open => !open && setThresholdItem(null)}>
        <DialogContent className="sm:max-w-sm rounded-3xl border-none shadow-2xl">
          <DialogHeader>
            <DialogTitle className="text-[11px] font-black uppercase tracking-widest text-stone-500">Seuil d'alerte</DialogTitle>
            <p className="text-base font-black text-stone-900 uppercase tracking-tight">{thresholdItem?.productName}</p>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <p className="text-xs text-stone-500 font-bold">
              Stock actuel : <strong>{thresholdItem?.currentQty} {thresholdItem?.unitOfMeasure}</strong>
            </p>
            <div className="space-y-1.5">
              <Label className="text-[11px] font-black uppercase tracking-widest text-stone-500">
                Seuil minimal ({thresholdItem?.unitOfMeasure})
              </Label>
              <Input
                type="number" min={0} step="any"
                value={thresholdValue}
                onChange={e => setThresholdValue(e.target.value)}
                placeholder="Ex: 500"
                className="h-11 text-xl font-black rounded-xl border-stone-200"
              />
              <p className="text-[11px] text-stone-400 font-bold">
                Une alerte sera déclenchée quand le stock passe sous ce seuil.
              </p>
            </div>
          </div>
          <DialogFooter className="gap-2">
            <Button variant="ghost" onClick={() => setThresholdItem(null)} className="rounded-xl font-black uppercase text-[10px]">Annuler</Button>
            <Button onClick={handleSaveThreshold} className="bg-emerald-600 hover:bg-emerald-700 text-white font-black uppercase text-[10px] tracking-widest px-6 rounded-xl">
              Enregistrer
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Modal mouvement */}
      <StockMovementModal
        open={movementModalOpen}
        onOpenChange={setMovementModalOpen}
        articles={articles}
        categories={categories}
        stockItems={stockItems}
        stores={stores}
        locations={locations}
        allMovements={movements}
        preselectedArticleId={movementItem?.articleId}
        preselectedType="IN"
        activeStore={activeStore}
        onSubmit={onAddMovement}
      />
    </div>
  );
}

// ─── Alert Card ───────────────────────────────────────────────────────────────
function AlertCard({ item, level, onOrder, onThreshold, readOnly = false }: {
  item: StockItem;
  level: 'rupture' | 'low';
  onOrder: () => void;
  onThreshold: () => void;
  readOnly?: boolean;
}) {
  const pct = item.minThreshold ? Math.round((item.currentQty / item.minThreshold) * 100) : 0;
  const isRupture = level === 'rupture';

  return (
    <div className={`bg-white rounded-2xl shadow-lg border overflow-hidden ${isRupture ? 'border-red-200' : 'border-orange-200'}`}>
      <div className={`h-1.5 w-full ${isRupture ? 'bg-red-500' : 'bg-orange-400'}`} />
      <div className="p-4 space-y-3">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <p className="text-[11px] font-black text-stone-800 uppercase leading-tight">{item.nameFR || item.productName}</p>
            <div className="flex flex-wrap items-center gap-1.5 mt-0.5">
              <span className="text-[11px] font-bold text-stone-400">{item.categoryNameFR || item.categoryId}</span>
              {item.quality && (
                <span className="bg-violet-100 text-violet-700 font-black text-[11px] px-1.5 py-0.2 rounded uppercase">
                  {item.quality}
                </span>
              )}
              {item.color && <span className="text-[11px] font-bold bg-stone-100 text-stone-600 px-1 rounded uppercase">{item.color}</span>}
              {item.size && <span className="text-[11px] font-bold bg-stone-100 text-stone-600 px-1 rounded uppercase">T. {item.size}</span>}
            </div>
          </div>
          <div className="flex flex-col items-end gap-1 shrink-0">
            <span className={`text-[11px] font-black px-2 py-0.5 rounded-full uppercase ${isRupture ? 'bg-red-100 text-red-700' : 'bg-orange-100 text-orange-700'}`}>
              {isRupture ? 'Rupture' : 'Bas'}
            </span>
            {(item as any)._storeLabel && (
              <span className="text-[10px] font-black px-2 py-0.5 rounded-full uppercase bg-stone-100 text-stone-500">
                {String((item as any)._storeLabel).replace('_', ' ')}
              </span>
            )}
          </div>
        </div>

        {/* Barre de niveau */}
        <div className="space-y-1">
          <div className="flex justify-between text-[11px] font-black uppercase">
            <span className="text-stone-400">Stock actuel</span>
            <span className={isRupture ? 'text-red-600' : 'text-orange-600'}>
              {(Number(item.currentQty) || 0).toLocaleString('fr-FR')} / {(Number(item.minThreshold) || 0).toLocaleString('fr-FR')} {item.unitOfMeasure}
            </span>
          </div>
          <div className="h-2 bg-stone-100 rounded-full overflow-hidden">
            <div
              className={`h-full rounded-full transition-all ${isRupture ? 'bg-red-500' : pct < 50 ? 'bg-orange-500' : 'bg-amber-400'}`}
              style={{ width: `${Math.min(100, pct)}%` }}
            />
          </div>
        </div>

        <div className="flex gap-2 pt-1">
          {!readOnly && (
            <Button onClick={onOrder} size="sm"
              className="flex-1 h-8 bg-emerald-600 hover:bg-emerald-700 text-white text-[11px] font-black uppercase tracking-wider rounded-xl gap-1">
              <Plus className="w-3 h-3" /> Entrée
            </Button>
          )}
          <Button onClick={onThreshold} size="sm" variant="outline"
            className={`h-8 px-3 text-[11px] font-black uppercase tracking-wider rounded-xl border-stone-200 hover:border-emerald-400 ${readOnly ? 'flex-1' : ''}`}>
            <Settings className="w-3 h-3" /> {readOnly && 'Seuil'}
          </Button>
        </div>
      </div>
    </div>
  );
}
