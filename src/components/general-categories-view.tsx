
"use client";

import React, { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Layers, Plus, Trash2, ArrowRight, FolderSearch } from 'lucide-react';
import { useUser, useFirestore, setDocumentNonBlocking, deleteDocumentNonBlocking } from '@/firebase';
import { doc, collection } from 'firebase/firestore';
import { useToast } from '@/hooks/use-toast';
import { GeneralCategory, Category } from '@/lib/types';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';

interface GeneralCategoriesViewProps {
  generalCategories: GeneralCategory[];
  subCategories: Category[];
  onSelectGeneralCategory: (id: string) => void;
}

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
    <div className="space-y-6 fade-in">
      <div className="bg-white rounded-xl shadow-sm border border-stone-100 p-6 flex flex-col md:flex-row justify-between items-center gap-4">
        <div>
          <h1 className="text-3xl font-bold text-stone-800 mb-2">Catégories Générales</h1>
          <p className="text-stone-600">Regroupez vos produits par grandes familles d'activité.</p>
        </div>
        <Button onClick={() => setIsModalOpen(true)} className="bg-stone-800 hover:bg-black text-white font-bold gap-2">
          <Plus className="w-5 h-5" /> Nouvelle Catégorie
        </Button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
        {generalCategories.length === 0 ? (
          <div className="col-span-full py-20 text-center border-2 border-dashed border-stone-200 rounded-xl">
            <FolderSearch className="w-12 h-12 text-stone-300 mx-auto mb-4" />
            <p className="text-stone-400 font-medium">Aucune catégorie générale définie.</p>
          </div>
        ) : generalCategories.map((gc) => {
          const linkedSubs = subCategories.filter(s => s.generalCategoryId === gc.id).length;
          return (
            <Card 
              key={gc.id} 
              onClick={() => onSelectGeneralCategory(gc.id)}
              className="cursor-pointer hover:shadow-md hover:border-amber-300 transition-all border-l-8 border-l-stone-800 group"
            >
              <CardContent className="p-6 flex flex-col h-full">
                <div className="flex justify-between items-start mb-4">
                  <h3 className="text-xl font-black text-stone-800 group-hover:text-amber-600 transition-colors uppercase tracking-tight">
                    {gc.name}
                  </h3>
                  <Button 
                    variant="ghost" 
                    size="icon" 
                    className="h-8 w-8 text-stone-300 hover:text-red-500"
                    onClick={(e) => handleDelete(e, gc.id, gc.name)}
                  >
                    <Trash2 className="w-4 h-4" />
                  </Button>
                </div>
                <div className="flex-grow flex items-center gap-2 text-stone-500 text-sm mb-4">
                  <Layers className="w-4 h-4" />
                  <span className="font-bold">{linkedSubs}</span> sous-catégories
                </div>
                <div className="pt-4 border-t border-stone-100 flex justify-between items-center">
                  <span className="text-[10px] font-bold text-stone-400 uppercase tracking-widest">Voir le groupe</span>
                  <ArrowRight className="w-4 h-4 text-stone-300 group-hover:translate-x-1 group-hover:text-amber-500 transition-all" />
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>

      <Dialog open={isModalOpen} onOpenChange={setIsModalOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Nouvelle Famille de Produits</DialogTitle>
          </DialogHeader>
          <div className="py-4 space-y-4">
            <div className="space-y-1">
              <label className="text-sm font-bold text-stone-700">Nom de la Catégorie Générale</label>
              <Input 
                value={newCatName}
                onChange={e => setNewCatName(e.target.value)}
                placeholder="Ex: ACCESSOIRES, TEXTILES..."
                className="uppercase font-bold"
                autoFocus
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsModalOpen(false)}>Annuler</Button>
            <Button onClick={handleAddGeneralCategory} className="bg-stone-800 hover:bg-black text-white">Créer</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
