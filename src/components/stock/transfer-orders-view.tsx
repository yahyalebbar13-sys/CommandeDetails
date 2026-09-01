"use client";

import React, { useState, useMemo } from 'react';
import { Truck, Plus, CheckCircle2, Clock, XCircle, Search, Save, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { useFirestore, useUser } from '@/firebase';
import { collection, doc, addDoc, updateDoc, serverTimestamp, writeBatch } from 'firebase/firestore';
import { useToast } from '@/hooks/use-toast';
import type { TransferOrder, TransferOrderItem, StockItem, StoreLocation, StockMovement } from '@/lib/types';

interface TransferOrdersViewProps {
  transferOrders: TransferOrder[];
  stockItems: StockItem[];
  stores: Store[];
  userRole: 'ADMIN' | 'COMMERCIAL' | 'UNAUTHORIZED';
  activeStore: StoreLocation | 'ALL';
  adminUid: string | null;
}



export default function TransferOrdersView({ transferOrders, stockItems, stores, userRole, activeStore, adminUid }: TransferOrdersViewProps) {
  const { user } = useUser();
  const firestore = useFirestore();
  const { toast } = useToast();

  const getStoreLabel = (id: string) => stores.find(s => s.id === id)?.name || id;

  const [search, setSearch] = useState('');
  
  // Modals
  const [createModal, setCreateModal] = useState(false);
  const [validateModal, setValidateModal] = useState<{ open: boolean; order?: TransferOrder }>({ open: false });

  // Create Form State
  const [fromStore, setFromStore] = useState<string>(activeStore === 'ALL' || activeStore === 'ALL_MAIN' ? (stores[0]?.id || '') : activeStore);
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
    setSelectedItems(prev => [...prev, {
      articleId: item.articleId,
      categoryId: item.categoryId,
      productName: item.productName,
      color: item.color,
      size: item.size,
      unitOfMeasure: item.unitOfMeasure,
      sentQty: 1
    }]);
    setArticleSearch('');
  };

  const handleCreateTransfer = async () => {
    if (!firestore || !adminUid || selectedItems.length === 0) return;
    if (!fromStore || !toStore) return toast({ variant: 'destructive', title: 'Erreur', description: 'Veuillez sélectionner la source et la destination.' });
    if (fromStore === toStore) return toast({ variant: 'destructive', title: 'Erreur', description: 'Source et destination doivent être différentes.' });
    
    try {
      const now = new Date().toISOString();
      const transferData: Omit<TransferOrder, 'id'> = {
        fromStore: fromStore as StoreLocation,
        toStore: toStore as StoreLocation,
        status: 'PENDING',
        items: selectedItems,
        date: now,
        createdAt: serverTimestamp(),
      };

      const docRef = await addDoc(collection(firestore, 'users', adminUid, 'transferOrders'), transferData);

      // Create OUT movements atomically via batch
      const batch = writeBatch(firestore);
      for (const item of selectedItems) {
        const movRef = doc(collection(firestore, 'users', adminUid, 'stockMovements'));
        batch.set(movRef, {
          articleId: item.articleId,
          categoryId: item.categoryId,
          productName: item.productName,
          color: item.color,
          size: item.size,
          unitOfMeasure: item.unitOfMeasure,
          type: 'OUT',
          reason: 'TRANSFERT',
          storeId: fromStore,
          quantity: item.sentQty,
          date: now.split('T')[0],
          notes: `Bon de transfert ${docRef.id}`,
          createdAt: serverTimestamp()
        });
      }
      await batch.commit();

      toast({ title: 'Bon de transfert créé', description: 'Les articles sont en transit.' });
      setCreateModal(false);
      setSelectedItems([]);
    } catch (e) {
      toast({ variant: 'destructive', title: 'Erreur', description: 'Impossible de créer le bon.' });
    }
  };

  const handleValidateTransfer = async () => {
    if (!firestore || !adminUid || !validateModal.order) return;
    const order = validateModal.order;

    try {
      const now = new Date().toISOString();
      const updatedItems = order.items.map(item => ({
        ...item,
        receivedQty: receivedItems[item.articleId] ?? item.sentQty
      }));

      const batch = writeBatch(firestore);

      // Update Transfer Order Status
      const orderRef = doc(firestore, 'users', adminUid, 'transferOrders', order.id);
      batch.update(orderRef, {
        status: 'VALIDATED',
        items: updatedItems,
        receivedDate: now
      });

      // Create IN movements for the receiver + handle discrepancies
      for (const item of updatedItems) {
        if (item.receivedQty && item.receivedQty > 0) {
          const inRef = doc(collection(firestore, 'users', adminUid, 'stockMovements'));
          batch.set(inRef, {
            articleId: item.articleId,
            categoryId: item.categoryId,
            productName: item.productName,
            color: item.color,
            size: item.size,
            unitOfMeasure: item.unitOfMeasure,
            type: 'IN',
            reason: 'TRANSFERT',
            toStoreId: order.toStore,
            quantity: item.receivedQty,
            date: now.split('T')[0],
            notes: `Réception Bon de transfert ${order.id}`,
            createdAt: serverTimestamp()
          });
        }

        // Handle discrepancies (Losses)
        const discrepancy = item.sentQty - (item.receivedQty || 0);
        if (discrepancy > 0) {
          const lossRef = doc(collection(firestore, 'users', adminUid, 'stockMovements'));
          batch.set(lossRef, {
            articleId: item.articleId,
            categoryId: item.categoryId,
            productName: item.productName,
            color: item.color,
            size: item.size,
            unitOfMeasure: item.unitOfMeasure,
            type: 'OUT',
            reason: 'ADJUSTMENT',
            storeId: order.toStore,
            quantity: discrepancy,
            date: now.split('T')[0],
            notes: `Perte/Manquant lors de la réception ${order.id}`,
            createdAt: serverTimestamp()
          });
        }
      }

      await batch.commit();

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
            <p className="text-[9px] font-black text-blue-300 uppercase tracking-[0.3em] mb-1">Logistique Interne</p>
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
                  {order.status === 'PENDING' && (userRole === 'ADMIN' || activeStore === order.toStore || activeStore === 'ALL_MAIN') && (
                    <Button size="sm" onClick={() => {
                      const init: Record<string, number> = {};
                      order.items.forEach(i => init[i.articleId] = i.sentQty);
                      setReceivedItems(init);
                      setValidateModal({ open: true, order });
                    }} className="bg-blue-600 hover:bg-blue-700 text-[10px] uppercase font-black tracking-widest">
                      Réceptionner
                    </Button>
                  )}
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
                <label className="text-[10px] font-black uppercase text-stone-500">De (Source)</label>
                <select value={fromStore} onChange={e => setFromStore(e.target.value)} className="w-full h-10 px-3 bg-white border border-stone-200 rounded-xl text-sm font-bold outline-none">
                  <option value="" disabled>Choisir l'origine...</option>
                  {stores.map(s => (
                    <option key={s.id} value={s.id}>{s.name}</option>
                  ))}
                </select>
              </div>
              <div className="flex-1 space-y-2">
                <label className="text-[10px] font-black uppercase text-stone-500">Vers (Destination)</label>
                <select value={toStore} onChange={e => setToStore(e.target.value)} className="w-full h-10 px-3 bg-white border border-stone-200 rounded-xl text-sm font-bold outline-none">
                  <option value="" disabled>Choisir la destination...</option>
                  {stores.map(s => (
                    <option key={s.id} value={s.id}>{s.name}</option>
                  ))}
                </select>
              </div>
            </div>

            <div className="space-y-4">
              <label className="text-[10px] font-black uppercase text-stone-500">Articles à transférer</label>
              
              {/* Search & Add */}
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-stone-400" />
                <Input placeholder="Rechercher un article..." value={articleSearch} onChange={e => setArticleSearch(e.target.value)} className="pl-10 rounded-xl" />
                
                {articleSearch && (
                  <div className="absolute top-full left-0 right-0 mt-2 max-h-48 overflow-y-auto bg-white border border-stone-200 rounded-xl shadow-xl z-50 p-2">
                    {stockItems.filter(i => i.productName.toLowerCase().includes(articleSearch.toLowerCase()) || i.color?.toLowerCase().includes(articleSearch.toLowerCase())).slice(0, 10).map(item => (
                      <button key={item.articleId} onClick={() => addArticleToTransfer(item)} className="w-full text-left px-3 py-2 hover:bg-stone-50 rounded-lg flex items-center justify-between">
                        <div>
                          <p className="text-xs font-bold">{item.productName}</p>
                          <p className="text-[10px] text-stone-400">{item.color} {item.size}</p>
                        </div>
                        <span className="text-[10px] font-black bg-emerald-100 text-emerald-800 px-2 py-1 rounded-md">Stock: {item.currentQty}</span>
                      </button>
                    ))}
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
                    {selectedItems.map((item, idx) => (
                      <tr key={item.articleId} className="border-b border-stone-100 last:border-0">
                        <td className="px-4 py-2 text-xs font-bold text-stone-700">{item.productName} {item.color ? ` - ${item.color}` : ''}</td>
                        <td className="px-4 py-2">
                          <Input type="number" min={1} value={item.sentQty} onChange={e => {
                            const val = parseFloat(e.target.value) || 0;
                            setSelectedItems(prev => prev.map((p, i) => i === idx ? { ...p, sentQty: val } : p));
                          }} className="h-8 text-xs font-bold text-center" />
                        </td>
                        <td className="px-4 py-2">
                          <button onClick={() => setSelectedItems(prev => prev.filter((_, i) => i !== idx))} className="text-red-500 hover:text-red-700">
                            <X className="w-4 h-4" />
                          </button>
                        </td>
                      </tr>
                    ))}
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
          <DialogFooter>
            <Button variant="ghost" onClick={() => setValidateModal({ open: false })} className="rounded-xl text-[10px] uppercase font-black">Annuler</Button>
            <Button onClick={handleValidateTransfer} className="bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-[10px] uppercase font-black tracking-widest px-8">
              Valider la Réception
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

    </div>
  );
}
