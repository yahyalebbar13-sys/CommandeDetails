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
  const [originalAccessEmail, setOriginalAccessEmail] = useState<string | null>(null);
  const [editingPassword, setEditingPassword] = useState('');
  const [loading, setLoading] = useState(false);

  const openEditModal = (store?: Store) => {
    if (store) {
      setEditingStore(store);
      setOriginalAccessEmail(store.accessEmail || null);
    } else {
      setEditingStore({ type: 'WAREHOUSE' });
      setOriginalAccessEmail(null);
    }
    setEditingPassword('');
    setModalOpen(true);
  };

  const handleSaveStore = async () => {
    if (!firestore || !adminUid || !editingStore.id || !editingStore.name) return;
    
    const safeId = editingStore.id.toUpperCase().replace(/\s+/g, '_');
    const newEmail = editingStore.accessEmail?.trim().toLowerCase() || null;
    const oldEmail = originalAccessEmail?.trim().toLowerCase() || null;
    setLoading(true);
    
    try {
      // Si un email est fourni, on gère le compte Firebase Auth + storeAccess
      if (newEmail) {
        // Créer/mettre à jour le compte Firebase Auth si un mot de passe est fourni
        if (editingPassword) {
          const res = await fetch('/api/admin/manage-user', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              action: 'CREATE',
              email: newEmail,
              password: editingPassword
            })
          });
          
          if (!res.ok) {
            const text = await res.text();
            let data;
            try { data = JSON.parse(text); } catch(e) {}
            
            if (data && data.error && data.error.includes('already exists')) {
              // S'il existe déjà, mettre à jour le mot de passe
              const updateRes = await fetch('/api/admin/manage-user', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                  action: 'UPDATE_PASSWORD',
                  email: newEmail,
                  password: editingPassword
                })
              });
              if (!updateRes.ok) {
                throw new Error('Erreur lors de la mise à jour du mot de passe');
              }
            } else {
              throw new Error(`API a retourné une erreur ${res.status}: ${text.substring(0,50)}`);
            }
          }
        }
        
        // Si l'email a changé, supprimer l'ancien document storeAccess
        if (oldEmail && oldEmail !== newEmail) {
          await deleteDoc(doc(firestore, 'storeAccess', oldEmail));
        }
        
        // Créer/mettre à jour le document storeAccess avec le nouvel email
        await setDoc(doc(firestore, 'storeAccess', newEmail), {
          storeId: safeId,
          role: 'COMMERCIAL',
          adminUid: adminUid
        }, { merge: true });
      } else if (oldEmail) {
        // L'email a été vidé → supprimer l'ancien accès
        await deleteDoc(doc(firestore, 'storeAccess', oldEmail));
      }

      const docRef = doc(firestore, 'users', adminUid, 'stores', safeId);
      await setDoc(docRef, {
        id: safeId,
        name: editingStore.name,
        type: editingStore.type || 'STORE',
        isMain: editingStore.isMain || false,
        accessEmail: newEmail || null
      }, { merge: true });

      toast({ title: 'Enregistré', description: `Le lieu ${editingStore.name} a été enregistré.` });
      setModalOpen(false);
      setEditingStore({ type: 'WAREHOUSE' });
      setOriginalAccessEmail(null);
      setEditingPassword('');
    } catch (e: any) {
      toast({ variant: 'destructive', title: 'Erreur', description: e.message || 'Sauvegarde impossible.' });
    } finally {
      setLoading(false);
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
        <Button onClick={() => openEditModal()} className="bg-emerald-500 hover:bg-emerald-600 text-white font-black uppercase text-[10px] tracking-widest px-6 rounded-2xl h-11">
          <Plus className="w-4 h-4 mr-2" /> Nouveau Lieu
        </Button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {stores.map(store => (
          <div key={store.id} className="bg-white p-6 rounded-2xl border-2 border-stone-100 shadow-sm flex flex-col gap-4">
            <div className="flex items-start justify-between">
              <div>
                <div className="flex items-center gap-2 mb-2">
                  <span className={`inline-flex items-center px-2 py-1 rounded-md text-[8px] font-black uppercase tracking-widest ${store.type === 'WAREHOUSE' ? 'bg-blue-100 text-blue-700' : 'bg-emerald-100 text-emerald-700'}`}>
                    {store.type === 'WAREHOUSE' ? 'Entrepôt' : 'Magasin'}
                  </span>
                  {store.isMain && (
                    <span className="inline-flex items-center px-2 py-1 rounded-md text-[8px] font-black uppercase tracking-widest bg-amber-100 text-amber-800 border border-amber-300">
                      ⭐ Principal
                    </span>
                  )}
                </div>
                <h3 className="text-xl font-black text-stone-900">{store.name}</h3>
                <p className="text-[10px] text-stone-400 font-bold font-mono mt-1">ID: {store.id}</p>
                {store.accessEmail && (
                  <p className="text-[10px] text-stone-500 font-bold mt-1">
                    🔑 Identifiant: <span className="font-mono text-emerald-700">{store.name}</span> (ou {store.accessEmail})
                  </p>
                )}
              </div>
              <div className="flex gap-2">
                <button onClick={() => openEditModal(store)} className="p-2 text-stone-400 hover:text-blue-600 bg-stone-50 hover:bg-blue-50 rounded-lg transition-colors">
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
            
            <div className="pt-4 border-t border-stone-100 space-y-4">
              <h4 className="text-[10px] font-black uppercase tracking-widest text-stone-500">Gérer l'Accès (Connexion)</h4>
              <div className="space-y-2">
                <label className="text-[10px] font-black uppercase text-stone-500">E-mail de connexion</label>
                <Input value={editingStore.accessEmail || ''} onChange={e => setEditingStore(s => ({ ...s, accessEmail: e.target.value }))} placeholder="Ex: vendeur@lebtex.ma" className="h-12 rounded-xl font-bold" />
              </div>
              <div className="space-y-2">
                <label className="text-[10px] font-black uppercase text-stone-500">Mot de passe {editingStore.accessEmail && '(Laissez vide pour conserver)'}</label>
                <Input type="password" value={editingPassword} onChange={e => setEditingPassword(e.target.value)} placeholder="Nouveau mot de passe..." className="h-12 rounded-xl font-bold" />
                {editingPassword.length > 0 && editingPassword.length < 6 && (
                  <p className="text-red-500 text-[10px] font-bold">Le mot de passe doit faire au moins 6 caractères.</p>
                )}
              </div>
            </div>

          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => { setModalOpen(false); setEditingPassword(''); }} disabled={loading} className="rounded-xl text-[10px] font-black uppercase">Annuler</Button>
            <Button onClick={handleSaveStore} disabled={loading || (editingPassword.length > 0 && editingPassword.length < 6)} className="bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-[10px] font-black uppercase tracking-widest px-8">
              {loading ? 'En cours...' : <><Save className="w-4 h-4 mr-2" /> Enregistrer</>}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
