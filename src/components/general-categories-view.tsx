"use client";

import React, { useState } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Layers, Plus, Trash2, ArrowRight, FolderSearch, Tag, MoreVertical } from 'lucide-react';
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
  const [newCatName, setNewCatName] = useState('');

  const handleAddGeneralCategory = () => {
    if (!user || !firestore || !newCatName.trim()) return;
    const id = crypto.randomUUID();
    const docRef = doc(firestore, 'users', user.uid, 'generalCategories', id);
    setDocumentNonBlocking(docRef, { id, name: newCatName.trim().toUpperCase() }, { merge: true });
    toast({ title: "Groupe créé" });
    setNewCatName('');
    setIsModalOpen(false);
  };

  const handleDelete = (e: React.MouseEvent, id: string, name: string) => {
    e.stopPropagation();
    if (!user || !firestore) return;
    if (window.confirm(`Supprimer le groupe "${name}" ?`)) {
      const docRef = doc(firestore, 'users', user.uid, 'generalCategories', id);
      deleteDocumentNonBlocking(docRef);
      toast({ title: "Groupe supprimé" });
    }
  };

  return (
    <div className="space-y-8 fade-in">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <h1 className="text-2xl font-black text-stone-900 uppercase tracking-tight">Groupes de Produits</h1>
          <p className="text-sm text-stone-500 font-medium">Organisation de haut niveau de l'inventaire</p>
        </div>
        <Button onClick={() => setIsModalOpen(true)} className="bg-stone-900 hover:bg-black text-white px-6 h-10 rounded-md shadow-sm flex items-center gap-2 text-xs uppercase font-bold">
          <Plus className="w-4 h-4" /> Nouveau Groupe
        </Button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
        {generalCategories.length === 0 ? (
          <div className="col-span-full py-20 text-center border border-dashed border-stone-300 rounded-lg bg-white/50">
            <FolderSearch className="w-12 h-12 text-stone-300 mx-auto mb-3" />
            <p className="text-stone-400 font-bold uppercase tracking-widest text-[10px]">Aucun groupe défini</p>
          </div>
        ) : generalCategories.map((gc, index) => {
          const color = CATEGORY_COLORS[index % CATEGORY_COLORS.length];
          const linkedSubs = (subCategories || []).filter(s => s.generalCategoryId === gc.id).length;
          
          return (
            <Card 
              key={gc.id} 
              onClick={() => onSelectGeneralCategory(gc.id)}
              className="cursor-pointer hover:border-stone-400 border-stone-200 transition-all group overflow-hidden"
            >
              <CardContent className="p-0">
                <div className={`h-1.5 ${color}`} />
                <div className="p-5">
                  <div className="flex justify-between items-start mb-4">
                    <div className="space-y-1">
                      <p className="text-[9px] font-black text-stone-400 uppercase tracking-widest">Catégorie</p>
                      <h3 className="text-lg font-black text-stone-800 uppercase leading-none">{gc.name}</h3>
                    </div>
                    <Button 
                      variant="ghost" 
                      size="icon" 
                      className="h-8 w-8 text-stone-300 hover:text-red-600 -mt-1 -mr-1"
                      onClick={(e) => handleDelete(e, gc.id, gc.name)}
                    >
                      <Trash2 className="w-4 h-4" />
                    </Button>
                  </div>
                  
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2 text-stone-600">
                      <div className="w-7 h-7 rounded bg-stone-100 flex items-center justify-center">
                        <Layers className="w-3.5 h-3.5 text-stone-500" />
                      </div>
                      <span className="text-xs font-bold">{linkedSubs} Sous-cat.</span>
                    </div>
                    <div className="p-1.5 bg-stone-50 rounded group-hover:bg-stone-900 group-hover:text-white transition-all">
                      <ArrowRight className="w-3.5 h-3.5" />
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>

      <Dialog open={isModalOpen} onOpenChange={setIsModalOpen}>
        <DialogContent className="max-w-sm rounded-lg">
          <DialogHeader>
            <DialogTitle className="text-sm font-bold uppercase tracking-wider text-stone-900">Nouveau Groupe</DialogTitle>
          </DialogHeader>
          <div className="py-4 space-y-4">
            <div className="space-y-2">
              <label className="text-[10px] font-bold text-stone-500 uppercase tracking-widest">Désignation du groupe</label>
              <Input 
                value={newCatName}
                onChange={e => setNewCatName(e.target.value)}
                placeholder="EX: ACCESSOIRES"
                className="uppercase font-bold border-stone-200"
                autoFocus
              />
            </div>
          </div>
          <DialogFooter className="gap-2 sm:gap-0">
            <Button variant="ghost" onClick={() => setIsModalOpen(false)} className="text-xs font-bold uppercase">Annuler</Button>
            <Button onClick={handleAddGeneralCategory} className="bg-stone-900 text-white text-xs font-bold uppercase px-6">Confirmer</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}