"use client";

import React, { useState } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Layers, Plus, Trash2, ArrowRight, FolderSearch, Tag } from 'lucide-react';
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
  'border-l-amber-500 bg-amber-50/30',
  'border-l-blue-500 bg-blue-50/30',
  'border-l-emerald-500 bg-emerald-50/30',
  'border-l-purple-500 bg-purple-50/30',
  'border-l-rose-500 bg-rose-50/30',
  'border-l-indigo-500 bg-indigo-50/30',
  'border-l-orange-500 bg-orange-50/30',
  'border-l-cyan-500 bg-cyan-50/30',
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
    toast({ title: "Catégorie créée", description: newCatName.toUpperCase() });
    setNewCatName('');
    setIsModalOpen(false);
  };

  const handleDelete = (e: React.MouseEvent, id: string, name: string) => {
    e.stopPropagation();
    if (!user || !firestore) return;
    if (window.confirm(`Supprimer la catégorie générale "${name}" ? Attention, cela n'affecte pas les sous-catégories existantes.`)) {
      const docRef = doc(firestore, 'users', user.uid, 'generalCategories', id);
      deleteDocumentNonBlocking(docRef);
      toast({ title: "Catégorie supprimée", description: name });
    }
  };

  return (
    <div className="space-y-8 fade-in">
      <div className="bg-white rounded-2xl shadow-sm border border-stone-200 p-8 flex flex-col md:flex-row justify-between items-center gap-6">
        <div className="space-y-1">
          <h1 className="text-3xl font-black text-stone-900 uppercase tracking-tight">Catégories Principales</h1>
          <p className="text-stone-500 font-medium">Structuration de l'inventaire par pôles d'activité</p>
        </div>
        <Button onClick={() => setIsModalOpen(true)} className="bg-stone-900 hover:bg-black text-white font-bold h-12 px-8 rounded-xl shadow-lg transition-all hover:scale-105 active:scale-95">
          <Plus className="w-5 h-5 mr-2" /> Créer un groupe
        </Button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {generalCategories.length === 0 ? (
          <div className="col-span-full py-24 text-center border-2 border-dashed border-stone-200 rounded-2xl bg-white/50">
            <FolderSearch className="w-16 h-16 text-stone-300 mx-auto mb-4" />
            <p className="text-stone-400 font-medium text-lg">Aucune catégorie pour le moment</p>
            <Button variant="link" onClick={() => setIsModalOpen(true)} className="text-amber-600 font-bold">Ajouter la première</Button>
          </div>
        ) : generalCategories.map((gc, index) => {
          const colorClass = CATEGORY_COLORS[index % CATEGORY_COLORS.length];
          const linkedSubs = (subCategories || []).filter(s => s.generalCategoryId === gc.id).length;
          
          return (
            <Card 
              key={gc.id} 
              onClick={() => onSelectGeneralCategory(gc.id)}
              className={`cursor-pointer hover:shadow-xl hover:-translate-y-1 transition-all border-l-[6px] ${colorClass} group relative overflow-hidden`}
            >
              <CardContent className="p-8 flex flex-col h-full">
                <div className="flex justify-between items-start mb-6">
                  <div className="space-y-1">
                    <div className="flex items-center gap-2 text-stone-400 mb-1">
                      <Tag className="w-3 h-3" />
                      <span className="text-[10px] font-bold uppercase tracking-widest">Catégorie</span>
                    </div>
                    <h3 className="text-2xl font-black text-stone-800 group-hover:text-stone-900 transition-colors uppercase leading-tight">
                      {gc.name}
                    </h3>
                  </div>
                  <Button 
                    variant="ghost" 
                    size="icon" 
                    className="h-10 w-10 text-stone-300 hover:text-red-600 hover:bg-red-50 rounded-full transition-all"
                    onClick={(e) => handleDelete(e, gc.id, gc.name)}
                  >
                    <Trash2 className="w-5 h-5" />
                  </Button>
                </div>
                
                <div className="flex-grow flex items-center gap-3 text-stone-600 bg-white/50 p-3 rounded-xl border border-stone-100">
                  <div className="p-2 bg-stone-900 text-white rounded-lg">
                    <Layers className="w-4 h-4" />
                  </div>
                  <div>
                    <span className="block text-lg font-black leading-none">{linkedSubs}</span>
                    <span className="text-[10px] font-bold uppercase text-stone-400">Sous-catégories</span>
                  </div>
                </div>

                <div className="mt-6 flex justify-end items-center">
                  <span className="text-[10px] font-black uppercase text-stone-400 group-hover:text-stone-600 transition-colors mr-2">Explorer</span>
                  <div className="p-1.5 bg-stone-100 rounded-full group-hover:bg-stone-900 group-hover:text-white transition-all">
                    <ArrowRight className="w-4 h-4" />
                  </div>
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>

      <Dialog open={isModalOpen} onOpenChange={setIsModalOpen}>
        <DialogContent className="max-w-md rounded-2xl p-0 overflow-hidden border-none">
          <div className="bg-stone-900 p-6 text-white">
            <DialogTitle className="text-xl font-black uppercase tracking-tight">Nouveau Groupe</DialogTitle>
            <p className="text-stone-400 text-sm">Créez une nouvelle famille de produits</p>
          </div>
          <div className="p-8 space-y-6 bg-white">
            <div className="space-y-2">
              <label className="text-xs font-black text-stone-500 uppercase tracking-widest">Nom de la catégorie</label>
              <Input 
                value={newCatName}
                onChange={e => setNewCatName(e.target.value)}
                placeholder="EX: TEXTILES, BOUTONS..."
                className="uppercase font-bold h-12 border-stone-200 focus:ring-amber-500 rounded-xl"
                autoFocus
              />
            </div>
            <div className="flex gap-3 pt-2">
              <Button variant="outline" onClick={() => setIsModalOpen(false)} className="flex-1 h-12 rounded-xl border-stone-200 font-bold">Annuler</Button>
              <Button onClick={handleAddGeneralCategory} className="flex-1 h-12 rounded-xl bg-amber-600 hover:bg-amber-700 text-white font-bold">Créer le groupe</Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
