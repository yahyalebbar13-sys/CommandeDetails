"use client";

import React, { useState } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Layers, Plus, Trash2, ArrowRight, FolderSearch, PlusCircle } from 'lucide-react';
import { useUser, useFirestore, setDocumentNonBlocking, deleteDocumentNonBlocking } from '@/firebase';
import { doc } from 'firebase/firestore';
import { useToast } from '@/hooks/use-toast';
import { GeneralCategory, Category } from '@/lib/types';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';

interface GeneralCategoriesViewProps {
  generalCategories: GeneralCategory[];
  subCategories: Category[];
  onSelectGeneralCategory: (id: string) => void;
}

const CATEGORY_COLORS = [
  'bg-blue-600',
  'bg-emerald-600',
  'bg-amber-600',
  'bg-indigo-600',
  'bg-rose-600',
  'bg-slate-800',
];

export default function GeneralCategoriesView({ generalCategories, subCategories, onSelectGeneralCategory }: GeneralCategoriesViewProps) {
  const { user } = useUser();
  const firestore = useFirestore();
  const { toast } = useToast();
  
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isSubModalOpen, setIsSubModalOpen] = useState(false);
  
  const [newCatName, setNewCatName] = useState('');
  const [newSubName, setNewSubName] = useState('');
  const [targetGenCatId, setTargetGenCatId] = useState<string | null>(null);

  const handleAddGeneralCategory = () => {
    if (!user || !firestore || !newCatName.trim()) return;
    const id = crypto.randomUUID();
    const docRef = doc(firestore, 'users', user.uid, 'generalCategories', id);
    setDocumentNonBlocking(docRef, { id, name: newCatName.trim().toUpperCase() }, { merge: true });
    toast({ title: "Pôle logistique créé" });
    setNewCatName('');
    setIsModalOpen(false);
  };

  const handleAddSubCategory = () => {
    if (!user || !firestore || !newSubName.trim() || !targetGenCatId) return;
    const id = crypto.randomUUID();
    const docRef = doc(firestore, 'users', user.uid, 'categories', id);
    setDocumentNonBlocking(docRef, { 
      id, 
      name: newSubName.trim().toUpperCase(), 
      generalCategoryId: targetGenCatId 
    }, { merge: true });
    
    toast({ title: "Sous-catégorie ajoutée" });
    setNewSubName('');
    setTargetGenCatId(null);
    setIsSubModalOpen(false);
  };

  const handleDelete = (e: React.MouseEvent, id: string, name: string) => {
    e.stopPropagation();
    if (!user || !firestore) return;
    if (window.confirm(`Supprimer le groupe "${name}" ainsi que ses configurations ?`)) {
      const docRef = doc(firestore, 'users', user.uid, 'generalCategories', id);
      deleteDocumentNonBlocking(docRef);
      toast({ title: "Groupe supprimé" });
    }
  };

  const openSubModal = (e: React.MouseEvent, genCatId: string) => {
    e.stopPropagation();
    setTargetGenCatId(genCatId);
    setIsSubModalOpen(true);
  };

  return (
    <div className="space-y-8 fade-in">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 bg-white p-8 rounded-[2rem] shadow-sm border border-stone-100">
        <div>
          <h1 className="text-3xl font-black text-stone-900 uppercase tracking-tighter">Architecture Logistique</h1>
          <p className="text-stone-500 font-medium mt-1">Définissez vos pôles d'activité et vos familles de produits</p>
        </div>
        <Button onClick={() => setIsModalOpen(true)} className="bg-stone-900 hover:bg-black text-white px-8 h-12 rounded-xl shadow-lg shadow-stone-200 flex items-center gap-3 text-[10px] uppercase font-black tracking-widest transition-all hover:scale-105 active:scale-95">
          <Plus className="w-5 h-5" /> Nouveau Pôle
        </Button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
        {generalCategories.length === 0 ? (
          <div className="col-span-full py-40 text-center border-4 border-dashed border-stone-100 rounded-[3rem] bg-white/50">
            <FolderSearch className="w-16 h-16 text-stone-200 mx-auto mb-4" />
            <p className="text-stone-300 font-black uppercase tracking-[0.3em] text-[12px]">Aucun pôle configuré</p>
          </div>
        ) : generalCategories.map((gc, index) => {
          const color = CATEGORY_COLORS[index % CATEGORY_COLORS.length];
          const linkedSubs = (subCategories || []).filter(s => s.generalCategoryId === gc.id).length;
          
          return (
            <Card 
              key={gc.id} 
              onClick={() => onSelectGeneralCategory(gc.id)}
              className="group cursor-pointer border-none bg-white shadow-xl hover:shadow-2xl transition-all rounded-[2rem] overflow-hidden active:scale-95 relative"
            >
              <div className={`h-2 w-full ${color}`} />
              <CardContent className="p-8">
                <div className="flex justify-between items-start mb-8">
                  <div className="p-4 bg-stone-50 rounded-2xl text-stone-300 group-hover:bg-stone-900 group-hover:text-white transition-all">
                    <Layers className="w-7 h-7" />
                  </div>
                  <div className="flex flex-col items-end gap-2">
                    <Button 
                      variant="ghost" 
                      size="icon" 
                      className="h-10 w-10 text-stone-300 hover:text-red-600 hover:bg-red-50 rounded-xl transition-colors"
                      onClick={(e) => handleDelete(e, gc.id, gc.name)}
                    >
                      <Trash2 className="w-5 h-5" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-10 w-10 text-amber-500 hover:text-amber-600 hover:bg-amber-50 rounded-xl transition-colors"
                      onClick={(e) => openSubModal(e, gc.id)}
                      title="Ajouter une sous-catégorie"
                    >
                      <PlusCircle className="w-7 h-7" />
                    </Button>
                  </div>
                </div>
                
                <div className="space-y-1">
                  <p className="text-[9px] font-black text-stone-400 uppercase tracking-[0.2em]">Pôle Logistique</p>
                  <h3 className="text-2xl font-black text-stone-800 uppercase leading-none tracking-tighter group-hover:text-stone-900 line-clamp-2 min-h-[3rem]">{gc.name}</h3>
                </div>
                
                <div className="mt-8 pt-6 border-t border-stone-50 flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="px-3 py-1 bg-stone-100 rounded-full text-[10px] font-black text-stone-600 uppercase">
                      {linkedSubs} FAMILLES
                    </div>
                  </div>
                  <div className="p-2 bg-stone-50 rounded-lg opacity-0 group-hover:opacity-100 transition-all translate-x-4 group-hover:translate-x-0">
                    <ArrowRight className="w-4 h-4 text-stone-900" />
                  </div>
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>

      {/* Modal Nouveau Pôle */}
      <Dialog open={isModalOpen} onOpenChange={setIsModalOpen}>
        <DialogContent className="max-w-md rounded-[2rem] p-0 border-none overflow-hidden">
          <div className="bg-stone-900 p-8 text-white">
            <DialogTitle className="text-xl font-black uppercase tracking-tight">Initialiser un Pôle</DialogTitle>
            <p className="text-stone-400 text-[10px] font-bold uppercase tracking-widest mt-2">Architecture de haut niveau</p>
          </div>
          <div className="p-8 space-y-6">
            <div className="space-y-2">
              <label className="text-[10px] font-black text-stone-400 uppercase tracking-widest">Désignation du Pôle</label>
              <Input 
                value={newCatName}
                onChange={e => setNewCatName(e.target.value)}
                placeholder="EX: TEXTILES, ACCESSOIRES, EMBALLAGE..."
                className="h-14 uppercase font-black border-stone-200 rounded-xl focus:ring-stone-900 text-lg"
                autoFocus
              />
            </div>
          </div>
          <DialogFooter className="p-8 bg-stone-50 gap-4">
            <Button variant="ghost" onClick={() => setIsModalOpen(false)} className="h-12 font-black uppercase text-[10px] tracking-widest flex-1">Annuler</Button>
            <Button onClick={handleAddGeneralCategory} className="h-12 bg-stone-900 text-white font-black uppercase text-[10px] tracking-widest rounded-xl flex-[2] shadow-lg shadow-stone-200">Créer le Pôle</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Modal Nouvelle Sous-Catégorie */}
      <Dialog open={isSubModalOpen} onOpenChange={setIsSubModalOpen}>
        <DialogContent className="max-w-md rounded-[2rem] p-0 border-none overflow-hidden">
          <div className="bg-amber-600 p-8 text-white">
            <DialogTitle className="text-xl font-black uppercase tracking-tight">Nouvelle Sous-Catégorie</DialogTitle>
            <p className="text-amber-200 text-[10px] font-bold uppercase tracking-widest mt-2">
              Groupe : {generalCategories.find(g => g.id === targetGenCatId)?.name}
            </p>
          </div>
          <div className="p-8 space-y-6">
            <div className="space-y-2">
              <label className="text-[10px] font-black text-stone-400 uppercase tracking-widest">Nom de la famille produit</label>
              <Input 
                value={newSubName}
                onChange={e => setNewSubName(e.target.value)}
                placeholder="EX: ZIPPER NO5, FIL 40/2..."
                className="h-14 uppercase font-black border-stone-200 rounded-xl focus:ring-amber-600 text-lg"
                autoFocus
              />
            </div>
          </div>
          <DialogFooter className="p-8 bg-stone-50 gap-4">
            <Button variant="ghost" onClick={() => setIsSubModalOpen(false)} className="h-12 font-black uppercase text-[10px] tracking-widest flex-1">Annuler</Button>
            <Button onClick={handleAddSubCategory} className="h-12 bg-amber-600 text-white font-black uppercase text-[10px] tracking-widest rounded-xl flex-[2] shadow-lg shadow-amber-200">Ajouter la Famille</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}