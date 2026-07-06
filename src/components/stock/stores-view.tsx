"use client";

import React, { useState } from 'react';
import { Store as StoreIcon, Plus, Save, Trash2, ShieldAlert } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { useFirestore, useUser } from '@/firebase';
import { collection, doc, setDoc, deleteDoc } from 'firebase/firestore';
import { useToast } from '@/hooks/use-toast';
import type { Store } from '@/lib/types';

interface StoresViewProps {
  stores: Store[];
  adminUid: string | null;
}

export default function StoresView({ stores, adminUid }: StoresViewProps) {
  const { user } = useUser();
  const firestore = useFirestore();
  const { toast } = useToast();

  const [modalOpen, setModalOpen] = useState(false);
  const [editingStore, setEditingStore] = useState<Partial<Store>>({ type: 'WAREHOUSE' });

  const handleSaveStore = async () => {
    if (!firestore || !adminUid || !editingStore.id || !editingStore.name) return;
    
    // Check if ID is uppercase without spaces
    const safeId = editingStore.id.toUpperCase().replace(/\s+/g, '_');
    
    try {
      const docRef = doc(firestore, 'users', adminUid, 'stores', safeId);
      await setDoc(docRef, {
        id: safeId,
        name: editingStore.name,
        type: editingStore.type || 'STORE',
        isMain: editingStore.isMain || false
      }, { merge: true });

      toast({ title: 'Enregistré', description: `Le lieu ${editingStore.name} a été enregistré.` });
      setModalOpen(false);
      setEditingStore({ type: 'WAREHOUSE' });
    } catch (e) {
      toast({ variant: 'destructive', title: 'Erreur', description: 'Sauvegarde impossible.' });
    }
  };

  const handleDeleteStore = async (storeId: string) => {
    if (!firestore || !adminUid) return;
    if (!confirm('Êtes-vous sûr de vouloir supprimer ce lieu ? (Peut causer des erreurs si des mouvements y sont liés)')) return;

    try {
      await deleteDoc(doc(firestore, 'users', adminUid, 'stores', storeId));
      toast({ title: 'Supprimé', description: `Le lieu a été supprimé.` });
    } catch (e) {
      toast({ variant: 'destructive', title: 'Erreur', description: 'Suppression impossible.' });
    }
  };

  return (
    <div className="space-y-6 animate-in fade-in duration-500">
      <div className="bg-gradient-to-br from-stone-800 to-stone-900 p-8 rounded-3xl shadow-xl flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <p className="text-[9px] font-black text-stone-400 uppercase tracking-[0.3em] mb-1">Configuration</p>
          <h1 className="text-3xl font-black text-white uppercase tracking-tighter">
            Lieux de <span className="text-emerald-400">Stockage</span>
          </h1>
        </div>
        <Button onClick={() => { setEditingStore({ type: 'WAREHOUSE' }); setModalOpen(true); }} className="bg-emerald-500 hover:bg-emerald-600 text-white font-black uppercase text-[10px] tracking-widest px-6 rounded-2xl h-11">
          <Plus className="w-4 h-4 mr-2" /> Nouveau Lieu
        </Button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {stores.map(store => (
          <div key={store.id} className="bg-white p-6 rounded-2xl border-2 border-stone-100 shadow-sm flex flex-col gap-4">
            <div className="flex items-start justify-between">
              <div>
                <span className={`inline-flex items-center px-2 py-1 rounded-md text-[8px] font-black uppercase tracking-widest mb-2 ${store.type === 'WAREHOUSE' ? 'bg-blue-100 text-blue-700' : 'bg-emerald-100 text-emerald-700'}`}>
                  {store.type === 'WAREHOUSE' ? 'Entrepôt' : 'Magasin'}
                </span>
                <h3 className="text-xl font-black text-stone-900">{store.name}</h3>
                <p className="text-[10px] text-stone-400 font-bold font-mono mt-1">ID: {store.id}</p>
              </div>
              <div className="flex gap-2">
                <button onClick={() => { setEditingStore(store); setModalOpen(true); }} className="p-2 text-stone-400 hover:text-blue-600 bg-stone-50 hover:bg-blue-50 rounded-lg transition-colors">
                  <StoreIcon className="w-4 h-4" />
                </button>
                <button onClick={() => handleDeleteStore(store.id)} className="p-2 text-stone-400 hover:text-red-600 bg-stone-50 hover:bg-red-50 rounded-lg transition-colors">
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            </div>
          </div>
        ))}
        {stores.length === 0 && (
          <div className="col-span-full py-12 text-center text-stone-400">
            <ShieldAlert className="w-12 h-12 mx-auto mb-4 opacity-50" />
            <p className="font-bold">Aucun lieu de stockage configuré.</p>
          </div>
        )}
      </div>

      <Dialog open={modalOpen} onOpenChange={setModalOpen}>
        <DialogContent className="sm:max-w-md rounded-3xl">
          <DialogHeader>
            <DialogTitle className="text-lg font-black uppercase">Lieu de Stockage</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <label className="text-[10px] font-black uppercase tracking-widest text-stone-500">Nom du lieu</label>
              <Input value={editingStore.name || ''} onChange={e => setEditingStore(s => ({ ...s, name: e.target.value }))} placeholder="Ex: Entrepôt Tit Mellil" className="h-12 rounded-xl font-bold" />
            </div>
            <div className="space-y-2">
              <label className="text-[10px] font-black uppercase tracking-widest text-stone-500">Identifiant (Code unique)</label>
              <Input value={editingStore.id || ''} onChange={e => setEditingStore(s => ({ ...s, id: e.target.value }))} placeholder="Ex: TIT_MELLIL" className="h-12 rounded-xl font-bold font-mono uppercase" disabled={!!stores.find(s => s.id === editingStore.id)} />
              <p className="text-[9px] text-stone-400 font-bold">Sans espaces ni caractères spéciaux. Ne peut plus être modifié une fois créé.</p>
            </div>
            <div className="space-y-2">
              <label className="text-[10px] font-black uppercase tracking-widest text-stone-500">Type de lieu</label>
              <select value={editingStore.type} onChange={e => setEditingStore(s => ({ ...s, type: e.target.value as 'WAREHOUSE' | 'STORE' }))} className="w-full h-12 px-3 border border-stone-200 rounded-xl font-bold bg-white outline-none focus:ring-2 focus:ring-emerald-500">
                <option value="WAREHOUSE">Entrepôt</option>
                <option value="STORE">Magasin / Point de vente</option>
              </select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setModalOpen(false)} className="rounded-xl text-[10px] font-black uppercase">Annuler</Button>
            <Button onClick={handleSaveStore} className="bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-[10px] font-black uppercase tracking-widest px-8">
              <Save className="w-4 h-4 mr-2" /> Enregistrer
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
