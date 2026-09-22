"use client";

import React, { useState, useMemo } from 'react';
import { Truck, Plus, CheckCircle2, Clock, XCircle, Search, Save, X, Printer } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { useFirestore, useUser } from '@/firebase';
import { collection, doc, updateDoc, serverTimestamp, writeBatch } from 'firebase/firestore';
import { useToast } from '@/hooks/use-toast';
import type { TransferOrder, TransferOrderItem, StockItem, StoreLocation, StockMovement, Store } from '@/lib/types';
import { exportTransferOrderPDF } from '@/lib/pdf-export-reports';
import { logAudit } from '@/lib/audit-log';
import { cleanUndefined } from '@/lib/utils';
import {
  type StockVariant, type VariantDimension, splitOutboundLines, suggestInboundLocation, stockItemVariant,
} from '@/lib/warehouse-locations';

interface TransferOrdersViewProps {
  transferOrders: TransferOrder[];
  stockItems: StockItem[];
  stores: Store[];
  /** Mouvements, pour résoudre automatiquement les emplacements (FIFO en sortie). */
  movements?: any[];
  userRole: 'ADMIN' | 'COMMERCIAL' | 'UNAUTHORIZED';
  activeStore: StoreLocation | 'ALL';
  adminUid: string | null;
}

/**
 * Variante (couleur, qualité ou taille) d'une ligne de transfert, pour ne prendre et ne ranger
 * que dans les racks de CETTE variante. La ligne garde l'articleId de sa ligne de stock : pour un
 * article éclaté, c'est l'id virtuel de computeStockItems (`<id réel>__color__Bleu`), qui porte à
 * lui seul la dimension et le libellé — utile pour un bon enregistré dont la ligne de stock n'est
 * plus listée (vue entrepôt : les lignes vides sont masquées).
 */
function transferItemVariant(item: TransferOrderItem, stockItems: StockItem[]): StockVariant | null {
  const fromStock = stockItemVariant(stockItems.find(s => s.articleId === item.articleId));
  if (fromStock) return fromStock;
  const m = /__(quality|color|size)__(.+)$/.exec(String(item.articleId || ''));
  return m ? { dimension: m[1] as VariantDimension, value: m[2] } : null;
}

export default function TransferOrdersView({ transferOrders, stockItems, stores, movements = [], userRole, activeStore, adminUid }: TransferOrdersViewProps) {
  const { user } = useUser();
  const firestore = useFirestore();
  const { toast } = useToast();

  const getStoreLabel = (id: string) => stores.find(s => s.id === id)?.name || id;

  const [search, setSearch] = useState('');
  
  // Modals
  const [createModal, setCreateModal] = useState(false);
  const [validateModal, setValidateModal] = useState<{ open: boolean; order?: TransferOrder }>({ open: false });

  // Create Form State
  const [fromStore, setFromStore] = useState<string>(activeStore === 'ALL' || activeStore === 'ALL_MAIN' ? (stores?.[0]?.id || '') : activeStore);
  const [toStore, setToStore] = useState<string>('');
  const [selectedItems, setSelectedItems] = useState<TransferOrderItem[]>([]);
  const [articleSearch, setArticleSearch] = useState('');

  // Validate Form State
  const [receivedItems, setReceivedItems] = useState<Record<string, number>>({}); // articleId -> qty

  const filteredOrders = useMemo(() => {
    let res = [...transferOrders];
    if (search) {
      res = res.filter(o => o.id.toLowerCase().includes(search.toLowerCase()) || getStoreLabel(o.toStore)?.toLowerCase().includes(search.toLowerCase()));
    }
    return res.sort((a, b) => new Date(b.date || 0).getTime() - new Date(a.date || 0).getTime());
  }, [transferOrders, search, stores]);

  const addArticleToTransfer = (item: StockItem) => {
    if (selectedItems.find(i => i.articleId === item.articleId)) return;
    const availableInSource = fromStore && item.qtyByStore ? ((item.qtyByStore as any)[fromStore] || 0) : item.currentQty;
    if (availableInSource <= 0) {
      toast({
        variant: 'destructive',
        title: 'Stock insuffisant',
        description: `L'article "${item.productName}" n'a aucun stock dans l'emplacement source sélectionné (${getStoreLabel(fromStore)}).`
      });
      return;
    }
    setSelectedItems(prev => [...prev, {
      articleId: item.articleId,
      realArticleId: (item as any)._realArticleId || item.articleId,
      categoryId: item.categoryId,
      productName: item.nameFR || item.productName,
      nameFR: item.nameFR,
      color: item.color,
      size: item.size,
      quality: item.quality,
      unitOfMeasure: item.unitOfMeasure,
      sentQty: Math.min(1, availableInSource)
    }]);
    setArticleSearch('');
  };

  const handleCreateTransfer = async () => {
    if (!firestore || !adminUid || selectedItems.length === 0) return;
    if (!fromStore || !toStore) return toast({ variant: 'destructive', title: 'Erreur', description: 'Veuillez sélectionner la source et la destination.' });
    if (fromStore === toStore) return toast({ variant: 'destructive', title: 'Erreur', description: 'Source et destination doivent être différentes.' });
    
    // Vérification stricte des stocks sources disponibles
    for (const item of selectedItems) {
      const originalStock = stockItems.find(s => s.articleId === item.articleId);
      const available = fromStore && originalStock?.qtyByStore ? ((originalStock.qtyByStore as any)[fromStore] || 0) : (originalStock?.currentQty || 0);
      if (item.sentQty <= 0) {
        return toast({ variant: 'destructive', title: 'Quantité invalide', description: `Veuillez spécifier une quantité valide pour ${item.productName}.` });
      }
      if (item.sentQty > available) {
        return toast({
          variant: 'destructive',
          title: 'Stock insuffisant',
          description: `Quantité demandée (${item.sentQty}) supérieure au stock disponible (${available}) à ${getStoreLabel(fromStore)} pour ${item.productName}.`
        });
      }
    }

    try {
      const now = new Date().toISOString();
      // Transfert confirmé immédiatement : plus d'étape "Réceptionner" séparée —
      // le stock source et destination sont mis à jour dans le même mouvement.
      const validatedItems = selectedItems.map(item => ({ ...item, receivedQty: item.sentQty }));
      const transferData: Omit<TransferOrder, 'id'> = {
        fromStore: fromStore as StoreLocation,
        toStore: toStore as StoreLocation,
        status: 'VALIDATED',
        items: validatedItems,
        date: now,
        receivedDate: now,
        createdAt: serverTimestamp(),
      };

      // Le bon ET ses mouvements dans le MÊME lot : écrit avant, il restait en base marqué
      // « Validé », quantités reçues remplies et imprimable, alors qu'aucun mouvement n'avait pu
      // être écrit — un bon fantôme que rien ne permettait de rejouer.
      // cleanUndefined partout : une ligne peut n'avoir ni taille ni qualité (variante couleur), et
      // Firestore refuse un champ undefined (« Unsupported field value: undefined »).
      const docRef = doc(collection(firestore, 'users', adminUid, 'transferOrders'));

      // Mouvements OUT (source) + IN (destination) dans le même batch atomique
      const batch = writeBatch(firestore);
      batch.set(docRef, cleanUndefined(transferData));
      // Copie de travail : chaque ligne générée y est ajoutée, pour que la ligne suivante d'une même
      // variante ne reprenne pas dans un rack que la précédente vient de vider.
      const work = [...movements];
      for (const item of selectedItems) {
        const realId = item.realArticleId || item.articleId;
        const variant = transferItemVariant(item, stockItems);
        const common = {
          articleId: realId,
          categoryId: item.categoryId,
          productName: item.nameFR || item.productName,
          nameFR: item.nameFR,
          color: item.color,
          size: item.size,
          quality: item.quality,
          unitOfMeasure: item.unitOfMeasure,
          date: now.split('T')[0],
          createdAt: serverTimestamp()
        };

        // Sortie de la source : emplacement résolu automatiquement en FIFO, sans rien demander,
        // parmi les racks de la variante transférée.
        const outBase = {
          ...common,
          type: 'OUT' as const,
          reason: 'TRANSFERT' as const,
          storeId: fromStore,
          toStoreId: toStore,
          notes: `Transfert ${docRef.id} vers ${getStoreLabel(toStore)}`,
        };
        const outLines = splitOutboundLines(work, fromStore, realId, item.sentQty, outBase, variant);
        for (const line of outLines) {
          batch.set(doc(collection(firestore, 'users', adminUid, 'stockMovements')), cleanUndefined(line));
        }
        work.push(...outLines);

        // Entrée à destination : on range là où le produit est déjà, si l'endroit est unique.
        const dest = suggestInboundLocation(work, toStore, realId, variant);
        const inLine = {
          ...common,
          type: 'IN' as const,
          reason: 'TRANSFERT' as const,
          storeId: toStore,
          toStoreId: toStore,
          fromStoreId: fromStore,
          ...(dest ? { locationCode: dest.locationCode, ...(dest.locationId ? { locationId: dest.locationId } : {}) } : {}),
          quantity: item.sentQty,
          notes: `Transfert ${docRef.id} depuis ${getStoreLabel(fromStore)}`,
        };
        batch.set(doc(collection(firestore, 'users', adminUid, 'stockMovements')), cleanUndefined(inLine));
        work.push(inLine);
      }
      await batch.commit();

      logAudit(firestore, adminUid, {
        action: 'TRANSFER_VALIDATED',
        userId: user?.uid || '',
        userEmail: user?.email || '',
        entityType: 'transfer',
        entityId: docRef.id,
        description: `Transfert confirmé ${getStoreLabel(fromStore)} → ${getStoreLabel(toStore)} · ${selectedItems.length} référence(s), ${selectedItems.reduce((s, i) => s + i.sentQty, 0)} unité(s)`,
        metadata: { fromStore, toStore, itemCount: selectedItems.length },
      });

      toast({ title: 'Transfert confirmé', description: 'Le stock a été mis à jour immédiatement à la source et à la destination.' });
      setCreateModal(false);
      setSelectedItems([]);
    } catch (e: any) {
      const isPermission = e?.code === 'permission-denied' || /permission/i.test(String(e?.message || ''));
      toast({
        variant: 'destructive',
        title: 'Erreur',
        description: isPermission
          ? "Vous n'avez pas les droits pour confirmer un transfert vers ce magasin. Demandez à un compte ayant accès aux deux magasins de l'effectuer."
          : 'Impossible de créer le bon.'
      });
    }
  };

  const handleValidateTransfer = async () => {
    if (!firestore || !adminUid || !validateModal.order) return;
    const order = validateModal.order;
    if (order.status === 'VALIDATED') {
      toast({ title: 'Déjà validé', description: 'Ce transfert a déjà été réceptionné et validé.' });
      setValidateModal({ open: false });
      return;
    }

    try {
      const now = new Date().toISOString();
      const updatedItems = order.items.map(item => ({
        ...item,
        receivedQty: receivedItems[item.articleId] ?? item.sentQty
      }));

      for (const item of updatedItems) {
        if (item.receivedQty < 0 || item.receivedQty > item.sentQty * 1.1) {
          toast({ variant: 'destructive', title: 'Erreur', description: `La quantité reçue pour ${item.productName} doit être entre 0 et ${Math.floor(item.sentQty * 1.1)}.` });
          return;
        }
      }

      const batch = writeBatch(firestore);

      // Update Transfer Order Status
      const orderRef = doc(firestore, 'users', adminUid, 'transferOrders', order.id);
      batch.update(orderRef, cleanUndefined({
        status: 'VALIDATED',
        items: updatedItems,
        receivedDate: now
      }));

      // Copie de travail : réceptions et pertes déjà générées y sont ajoutées, pour que deux lignes
      // d'une même variante ne puisent pas deux fois dans le même rack.
      const work = [...movements];

      // Create IN movements for the receiver + handle discrepancies
      for (const item of updatedItems) {
        const realId = item.realArticleId || item.articleId;
        const variant = transferItemVariant(item, stockItems);
        if (item.receivedQty && item.receivedQty > 0) {
          const inRef = doc(collection(firestore, 'users', adminUid, 'stockMovements'));
          // Réception : on range là où le produit est déjà dans ce magasin, si l'endroit est unique
          // (pour un article éclaté : là où SA variante est déjà).
          const dest = suggestInboundLocation(work, order.toStore, realId, variant);
          const inLine = {
            articleId: realId,
            categoryId: item.categoryId,
            productName: item.productName,
            nameFR: item.nameFR,
            color: item.color,
            size: item.size,
            quality: item.quality,
            unitOfMeasure: item.unitOfMeasure,
            type: 'IN' as const,
            reason: 'TRANSFERT' as const,
            storeId: order.toStore,
            toStoreId: order.toStore,
            fromStoreId: order.fromStore,
            ...(dest ? { locationCode: dest.locationCode, ...(dest.locationId ? { locationId: dest.locationId } : {}) } : {}),
            quantity: item.receivedQty,
            date: now.split('T')[0],
            notes: `Réception Bon de transfert ${order.id} depuis ${getStoreLabel(order.fromStore)}`,
            createdAt: serverTimestamp()
          };
          batch.set(inRef, cleanUndefined(inLine));
          work.push(inLine);
        }

        // Handle discrepancies (Losses)
        const discrepancy = item.sentQty - (item.receivedQty || 0);
        if (discrepancy > 0) {
          // La perte est constatée à l'arrivée : elle sort de l'emplacement de destination
          // où la réception vient d'être créditée, résolu automatiquement en FIFO.
          const lossBase = {
            articleId: realId,
            categoryId: item.categoryId,
            productName: item.productName,
            nameFR: item.nameFR,
            color: item.color,
            size: item.size,
            quality: item.quality,
            unitOfMeasure: item.unitOfMeasure,
            type: 'OUT' as const,
            reason: 'PERTE' as const,
            storeId: order.toStore,
            date: now.split('T')[0],
            notes: `Perte/Manquant lors de la réception ${order.id}`,
            createdAt: serverTimestamp()
          };
          const lossLines = splitOutboundLines(work, order.toStore, realId, discrepancy, lossBase, variant);
          for (const line of lossLines) {
            batch.set(doc(collection(firestore, 'users', adminUid, 'stockMovements')), cleanUndefined(line));
          }
          work.push(...lossLines);
        }
      }

      await batch.commit();

      logAudit(firestore, adminUid, {
        action: 'TRANSFER_VALIDATED',
        userId: user?.uid || '',
        userEmail: user?.email || '',
        entityType: 'transfer',
        entityId: order.id,
        description: `Réception transfert ${getStoreLabel(order.fromStore)} → ${getStoreLabel(order.toStore)} · ${updatedItems.reduce((s, i) => s + (i.receivedQty || 0), 0)} unité(s) reçue(s)`,
        metadata: { fromStore: order.fromStore, toStore: order.toStore },
      });

      toast({ title: 'Transfert validé', description: 'Le stock a été mis à jour.' });
      setValidateModal({ open: false });
    } catch (e) {
      toast({ variant: 'destructive', title: 'Erreur', description: 'Impossible de valider le bon.' });
    }
  };

  return (
    <div className="space-y-6 animate-in fade-in duration-500">
      {/* Header */}
      <div className="bg-gradient-to-br from-blue-900 to-blue-800 p-8 rounded-3xl shadow-2xl relative overflow-hidden">
        <div className="absolute top-0 right-0 w-64 h-64 bg-blue-500/10 rounded-full -translate-y-1/2 translate-x-1/2 blur-3xl" />
        <div className="relative z-10 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <p className="text-[11px] font-black text-blue-300 uppercase tracking-[0.3em] mb-1">Logistique Interne</p>
            <h1 className="text-3xl font-black text-white uppercase tracking-tighter">
              Bons de <span className="text-blue-300">Transfert</span>
            </h1>
          </div>
          <Button onClick={() => setCreateModal(true)} className="bg-white hover:bg-stone-50 text-blue-900 font-black uppercase text-[10px] tracking-widest h-11 px-6 rounded-2xl shadow-lg">
            <Plus className="w-4 h-4 mr-2" /> Nouveau Transfert
          </Button>
        </div>
      </div>

      {/* List */}
      <div className="bg-white rounded-2xl shadow-xl border border-stone-100 overflow-hidden">
        <div className="p-4 border-b border-stone-100 flex items-center gap-4">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-stone-400" />
            <Input placeholder="Rechercher un bon..." value={search} onChange={e => setSearch(e.target.value)} className="pl-10 rounded-xl" />
          </div>
        </div>
        <table className="w-full text-left border-collapse">
          <thead>
            <tr className="bg-stone-50/50">
              <th className="px-6 py-4 text-[10px] font-black text-stone-500 uppercase tracking-widest">Date & ID</th>
              <th className="px-6 py-4 text-[10px] font-black text-stone-500 uppercase tracking-widest">Trajet</th>
              <th className="px-6 py-4 text-[10px] font-black text-stone-500 uppercase tracking-widest">Articles</th>
              <th className="px-6 py-4 text-[10px] font-black text-stone-500 uppercase tracking-widest">Statut</th>
              <th className="px-6 py-4 text-[10px] font-black text-stone-500 uppercase tracking-widest text-right">Action</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-stone-100">
            {filteredOrders.map(order => (
              <tr key={order.id} className="hover:bg-stone-50 transition-colors">
                <td className="px-6 py-4">
                  <div className="text-xs font-bold text-stone-900">{new Date(order.date).toLocaleDateString('fr-FR')}</div>
                  <div className="text-[10px] text-stone-400 uppercase">{order.id.slice(0, 8)}</div>
                </td>
                <td className="px-6 py-4">
                  <div className="flex items-center gap-2 text-xs font-bold text-stone-700">
                    <span className="bg-stone-100 px-2 py-1 rounded-md">{getStoreLabel(order.fromStore)}</span>
                    <Truck className="w-3 h-3 text-stone-400" />
                    <span className="bg-blue-50 text-blue-700 px-2 py-1 rounded-md">{getStoreLabel(order.toStore)}</span>
                  </div>
                </td>
                <td className="px-6 py-4">
                  <div className="text-xs font-bold text-stone-700">{order.items.length} référence(s)</div>
                  <div className="text-[10px] text-stone-400">{order.items.reduce((acc, i) => acc + i.sentQty, 0)} unités totales</div>
                </td>
                <td className="px-6 py-4">
                  {order.status === 'PENDING' ? (
                    <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-amber-100 text-amber-700 text-[10px] font-black uppercase tracking-widest">
                      <Clock className="w-3 h-3" /> En transit
                    </span>
                  ) : order.status === 'VALIDATED' ? (
                    <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-emerald-100 text-emerald-700 text-[10px] font-black uppercase tracking-widest">
                      <CheckCircle2 className="w-3 h-3" /> Validé
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-red-100 text-red-700 text-[10px] font-black uppercase tracking-widest">
                      <XCircle className="w-3 h-3" /> Annulé
                    </span>
                  )}
                </td>
                <td className="px-6 py-4 text-right">
                  <div className="flex items-center justify-end gap-2">
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => exportTransferOrderPDF(order, stores)}
                      className="h-8 px-3 rounded-xl border-stone-200 text-stone-700 hover:text-blue-600 hover:border-blue-200 text-[10px] uppercase font-black tracking-wider gap-1.5 shadow-sm"
                      title="Imprimer / Télécharger le Bon de Transfert"
                    >
                      <Printer className="w-3.5 h-3.5" />
                      <span>Bon PDF</span>
                    </Button>
                    {order.status === 'PENDING' && (userRole === 'ADMIN' || activeStore === order.toStore || activeStore === 'ALL_MAIN') && (
                      <Button size="sm" onClick={() => {
                        const init: Record<string, number> = {};
                        order.items.forEach(i => init[i.articleId] = i.sentQty);
                        setReceivedItems(init);
                        setValidateModal({ open: true, order });
                      }} className="bg-blue-600 hover:bg-blue-700 text-[10px] uppercase font-black tracking-widest h-8 px-3 rounded-xl">
                        Réceptionner
                      </Button>
                    )}
                  </div>
                </td>
              </tr>
            ))}
            {filteredOrders.length === 0 && (
              <tr>
                <td colSpan={5} className="px-6 py-12 text-center text-stone-400 font-bold">Aucun transfert trouvé.</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {/* CREATE MODAL */}
      <Dialog open={createModal} onOpenChange={setCreateModal}>
        <DialogContent className="max-w-3xl rounded-3xl">
          <DialogHeader>
            <DialogTitle className="text-lg font-black uppercase">Nouveau Transfert</DialogTitle>
          </DialogHeader>
          <div className="space-y-6">
            <div className="flex gap-4">
              <div className="flex-1 space-y-2">
                <label className="text-[10px] font-black uppercase text-stone-500">De (Emplacement Source)</label>
                <select value={fromStore} onChange={e => {
                  setFromStore(e.target.value);
                  setSelectedItems([]); // Réinitialiser car les stocks sources changent
                }} className="w-full h-10 px-3 bg-white border border-stone-200 rounded-xl text-sm font-bold outline-none">
                  <option value="" disabled>Choisir l'origine...</option>
                  {stores.map(s => (
                    <option key={s.id} value={s.id}>{s.type === 'WAREHOUSE' ? '🏢' : '🏪'} {s.name}</option>
                  ))}
                </select>
              </div>
              <div className="flex-1 space-y-2">
                <label className="text-[10px] font-black uppercase text-stone-500">Vers (Emplacement Destination)</label>
                <select value={toStore} onChange={e => setToStore(e.target.value)} className="w-full h-10 px-3 bg-white border border-stone-200 rounded-xl text-sm font-bold outline-none">
                  <option value="" disabled>Choisir la destination...</option>
                  {stores.map(s => (
                    <option key={s.id} value={s.id}>{s.type === 'WAREHOUSE' ? '🏢' : '🏪'} {s.name}</option>
                  ))}
                </select>
              </div>
            </div>

            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <label className="text-[10px] font-black uppercase text-stone-500">Articles à transférer</label>
                <span className="text-[10px] font-bold text-stone-400">Origine active : <strong className="text-stone-700">{getStoreLabel(fromStore)}</strong></span>
              </div>
              
              {/* Search & Add */}
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-stone-400" />
                <Input placeholder="Rechercher un article..." value={articleSearch} onChange={e => setArticleSearch(e.target.value)} className="pl-10 rounded-xl" />
                
                {articleSearch && (
                  <div className="absolute top-full left-0 right-0 mt-2 max-h-48 overflow-y-auto bg-white border border-stone-200 rounded-xl shadow-xl z-50 p-2">
                    {stockItems.filter(i => i.productName.toLowerCase().includes(articleSearch.toLowerCase()) || i.color?.toLowerCase().includes(articleSearch.toLowerCase()) || i.quality?.toLowerCase().includes(articleSearch.toLowerCase())).slice(0, 10).map(item => {
                      const availInSrc = fromStore && item.qtyByStore ? ((item.qtyByStore as any)[fromStore] || 0) : item.currentQty;
                      return (
                        <button key={item.articleId} onClick={() => addArticleToTransfer(item)} className="w-full text-left px-3 py-2 hover:bg-stone-50 rounded-lg flex items-center justify-between">
                          <div>
                            <p className="text-xs font-bold">{item.productName}</p>
                            <p className="text-[10px] text-stone-400">{[item.quality, item.color, item.size].filter(Boolean).join(' · ')}</p>
                          </div>
                          <span className={`text-[10px] font-black px-2 py-1 rounded-md ${availInSrc > 0 ? 'bg-emerald-100 text-emerald-800' : 'bg-red-100 text-red-700'}`}>
                            Dispo {getStoreLabel(fromStore)}: {availInSrc}
                          </span>
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>

              {/* Selected Items */}
              <div className="border border-stone-200 rounded-xl overflow-hidden">
                <table className="w-full text-left">
                  <thead className="bg-stone-50 border-b border-stone-200">
                    <tr>
                      <th className="px-4 py-2 text-[10px] font-black uppercase text-stone-500">Article</th>
                      <th className="px-4 py-2 text-[10px] font-black uppercase text-stone-500 w-32">Qté envoyée</th>
                      <th className="px-4 py-2 w-10"></th>
                    </tr>
                  </thead>
                  <tbody>
                    {selectedItems.map((item, idx) => {
                      const originalStock = stockItems.find(s => s.articleId === item.articleId);
                      const availInSrc = fromStore && originalStock?.qtyByStore ? ((originalStock.qtyByStore as any)[fromStore] || 0) : (originalStock?.currentQty || 0);

                      return (
                        <tr key={item.articleId} className="border-b border-stone-100 last:border-0">
                          <td className="px-4 py-2 text-xs font-bold text-stone-700">
                            <div>
                              <p>{item.productName} {[item.quality ? `[${item.quality}]` : '', item.color, item.size].filter(Boolean).join(' · ')}</p>
                              <p className="text-[10px] text-stone-400 font-normal">Dispo source: <strong className="text-emerald-700">{availInSrc}</strong></p>
                            </div>
                          </td>
                          <td className="px-4 py-2">
                            <Input
                              type="number"
                              min={1}
                              max={availInSrc}
                              value={item.sentQty}
                              onChange={e => {
                                const val = parseFloat(e.target.value) || 0;
                                const bounded = Math.max(0, Math.min(val, availInSrc));
                                setSelectedItems(prev => prev.map((p, i) => i === idx ? { ...p, sentQty: bounded } : p));
                              }}
                              className="h-8 text-xs font-bold text-center"
                            />
                          </td>
                          <td className="px-4 py-2">
                            <button onClick={() => setSelectedItems(prev => prev.filter((_, i) => i !== idx))} className="text-red-500 hover:text-red-700">
                              <X className="w-4 h-4" />
                            </button>
                          </td>
                        </tr>
                      );
                    })}
                    {selectedItems.length === 0 && (
                      <tr><td colSpan={3} className="px-4 py-8 text-center text-stone-400 text-xs font-bold">Aucun article sélectionné.</td></tr>
                    )}
                  </tbody>
                </table>
              </div>

            </div>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setCreateModal(false)} className="rounded-xl text-[10px] uppercase font-black">Annuler</Button>
            <Button onClick={handleCreateTransfer} disabled={selectedItems.length === 0} className="bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-[10px] uppercase font-black tracking-widest px-8">
              Émettre le Bon
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* VALIDATE MODAL */}
      <Dialog open={validateModal.open} onOpenChange={open => !open && setValidateModal({ open: false })}>
        <DialogContent className="max-w-2xl rounded-3xl">
          <DialogHeader>
            <DialogTitle className="text-lg font-black uppercase">Réception du Transfert</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <p className="text-xs text-stone-500 font-bold">Vérifiez les quantités reçues avant de valider. Tout écart sera comptabilisé comme perte.</p>
            <table className="w-full text-left border border-stone-200 rounded-xl overflow-hidden">
              <thead className="bg-stone-50 border-b border-stone-200">
                <tr>
                  <th className="px-4 py-2 text-[10px] font-black uppercase text-stone-500">Article</th>
                  <th className="px-4 py-2 text-[10px] font-black uppercase text-stone-500 w-24">Qté Envoyée</th>
                  <th className="px-4 py-2 text-[10px] font-black uppercase text-stone-500 w-32">Qté Reçue</th>
                </tr>
              </thead>
              <tbody>
                {validateModal.order?.items.map(item => (
                  <tr key={item.articleId} className="border-b border-stone-100 last:border-0">
                    <td className="px-4 py-3 text-xs font-bold text-stone-700">{item.productName} {item.color ? ` - ${item.color}` : ''}</td>
                    <td className="px-4 py-3 text-xs font-black text-blue-600">{item.sentQty}</td>
                    <td className="px-4 py-2">
                      <Input type="number" min={0} max={item.sentQty} value={receivedItems[item.articleId] ?? ''} onChange={e => {
                        const val = parseFloat(e.target.value) || 0;
                        setReceivedItems(prev => ({ ...prev, [item.articleId]: val }));
                      }} className="h-8 text-xs font-bold text-center border-emerald-200 focus-visible:ring-emerald-500" />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <DialogFooter className="flex items-center justify-between sm:justify-between w-full">
            <Button
              variant="outline"
              type="button"
              onClick={() => validateModal.order && exportTransferOrderPDF(validateModal.order, stores)}
              className="rounded-xl text-[10px] uppercase font-black tracking-wider gap-1.5"
            >
              <Printer className="w-3.5 h-3.5" />
              <span>Imprimer Bon</span>
            </Button>
            <div className="flex items-center gap-2">
              <Button variant="ghost" onClick={() => setValidateModal({ open: false })} className="rounded-xl text-[10px] uppercase font-black">Annuler</Button>
              <Button onClick={handleValidateTransfer} className="bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-[10px] uppercase font-black tracking-widest px-8">
                Valider la Réception
              </Button>
            </div>
          </DialogFooter>
        </DialogContent>
      </Dialog>

    </div>
  );
}
