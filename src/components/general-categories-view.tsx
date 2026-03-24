"use client";

import React, { useState, useMemo } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Layers, Plus, Trash2, ArrowRight, FolderSearch, PlusCircle, Truck, DollarSign } from 'lucide-react';
import { useUser, useFirestore, setDocumentNonBlocking, deleteDocumentNonBlocking } from '@/firebase';
import { doc } from 'firebase/firestore';
import { useToast } from '@/hooks/use-toast';
import { GeneralCategory, Category } from '@/lib/types';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';

interface GeneralCategoriesViewProps {
  articles: any[];
  generalCategories: GeneralCategory[];
  subCategories: Category[];
  onSelectGeneralCategory: (id: string) => void;
}

const UI_COLORS = ['#CC8626', '#1E293B', '#3B82F6', '#10B981', '#6366F1', '#F43F5E', '#8B5CF6', '#EC4899'];

export default function GeneralCategoriesView({ articles = [], generalCategories, subCategories, onSelectGeneralCategory }: GeneralCategoriesViewProps) {
  const { user } = useUser();
  const firestore = useFirestore();
  const { toast } = useToast();
  
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isSubModalOpen, setIsSubModalOpen] = useState(false);
  
  const [newCatName, setNewCatName] = useState('');
  const [newSubName, setNewSubName] = useState('');
  const [targetGenCatId, setTargetGenCatId] = useState<string | null>(null);

  const groupStats = useMemo(() => {
    const stats: Record<string, any> = {};
    const now = new Date();

    generalCategories.forEach(gc => {
      // Find all sub-category names belonging to this general category
      const subCatNames = subCategories
        .filter(sc => sc.generalCategoryId === gc.id)
        .map(sc => sc.name);

      // Filter articles that belong to this group (either via ID or via its sub-categories)
      const groupArticles = articles.filter(a => 
        a.generalCategoryId === gc.id || 
        subCatNames.includes(a.categoryId)
      );

      let totalValue = 0;
      
      const futureArrivals = groupArticles
        .filter(a => a.status === 'SHIPPED' && a.arrivalDate && new Date(a.arrivalDate) > now)
        .map(a => new Date(a.arrivalDate as string).getTime());
      
      const nextArrival = futureArrivals.length > 0 
        ? new Date(Math.min(...futureArrivals)).toISOString().split('T')[0]
        : '-';

      groupArticles.forEach(a => {
        totalValue += (Number(a.quantity) || 0) * (Number(a.purchasePricePerUnit) || 0);
      });

      stats[gc.id] = { 
        name: gc.name, 
        count: subCatNames.length, 
        nextArrival, 
        totalValue 
      };
    });
    return stats;
  }, [generalCategories, articles, subCategories]);

  const organizedCategories = useMemo(() => {
    const structure = [
      { title: "Fabric", keywords: ["non woven", "t/c fabric", "popeline", "leather", "felt fabric", "polyester fabric", "taffeta fabric", "woven interlining"] },
      { title: "Slider et puller", keywords: ["puller", "slider for nylon zipper", "slider for plastic zipper", "slider for metal zipper"] },
      { title: "Zipper", keywords: ["plastic zipper", "nylon zipper", "metal zipper", "zipper long chain"] },
      { title: "Bouton", keywords: ["covered mould button", "snap button", "button"] },
      { title: "Reste", keywords: ["ruban", "tape", "rope", "thread", "elastic thread", "tack pin", "hook and loop", "divers", "opp bag"], isFallback: true }
    ];

    const result = structure.map(g => ({ ...g, items: [] as { gc: GeneralCategory, stats: any }[] }));

    generalCategories.forEach(gc => {
      const catName = (gc.name || '').toLowerCase().trim();
      let matched = false;
      for (const group of result) {
        if (group.keywords.includes(catName)) {
          group.items.push({ gc, stats: groupStats[gc.id] });
          matched = true;
          break;
        }
      }
      if (!matched) {
        const fallback = result.find(g => g.isFallback);
        if (fallback) fallback.items.push({ gc, stats: groupStats[gc.id] });
      }
    });

    return result.filter(g => g.items.length > 0);
  }, [generalCategories, groupStats]);

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
    <div className="space-y-6 fade-in">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 bg-white p-6 rounded-[1.5rem] shadow-sm border border-stone-100">
        <div>
          <h1 className="text-xl font-black text-stone-900 uppercase tracking-tighter leading-none">Architecture Logistique</h1>
          <p className="text-stone-500 text-[10px] font-bold uppercase mt-1 tracking-wider">Gestion des pôles et flux financiers consolidés</p>
        </div>
        <Button onClick={() => setIsModalOpen(true)} className="bg-stone-900 hover:bg-black text-white px-5 h-10 rounded-xl shadow-lg shadow-stone-200 flex items-center gap-2 text-[10px] uppercase font-black tracking-widest transition-all hover:scale-105 active:scale-95">
          <Plus className="w-3.5 h-3.5" /> Nouveau Pôle
        </Button>
      </div>

      <div className="space-y-12">
        {generalCategories.length === 0 ? (
          <div className="py-20 text-center border-2 border-dashed border-stone-100 rounded-[2rem] bg-white/50">
            <FolderSearch className="w-10 h-10 text-stone-200 mx-auto mb-3" />
            <p className="text-stone-300 font-black uppercase tracking-[0.2em] text-[9px]">Aucun pôle configuré</p>
          </div>
        ) : organizedCategories.map((group, groupIdx) => (
          <div key={groupIdx} className="space-y-5">
            <h3 className="text-xl font-black text-stone-900 uppercase tracking-tighter flex items-center gap-3">
              <div className="w-2 h-6 bg-amber-500 rounded-full" />
              {group.title}
            </h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4">
              {group.items.map(({ gc, stats }, index) => {
                const color = UI_COLORS[(groupIdx + index) % UI_COLORS.length];
                
                return (
                  <Card 
                    key={gc.id} 
                    onClick={() => onSelectGeneralCategory(gc.id)}
                    className="group cursor-pointer border-none bg-white shadow-md hover:shadow-xl transition-all rounded-[1.2rem] overflow-hidden active:scale-95 relative"
                  >
              <div className="h-1 w-full" style={{ backgroundColor: color }} />
              <CardContent className="p-4">
                <div className="flex justify-between items-start mb-3">
                  <div className="p-2 bg-stone-50 rounded-lg text-stone-300 group-hover:bg-stone-900 group-hover:text-white transition-all">
                    <Layers className="w-3.5 h-3.5" />
                  </div>
                  <div className="flex items-center gap-1">
                    <Button 
                      variant="ghost" 
                      size="icon" 
                      className="h-6 w-6 text-amber-500 hover:text-amber-600 hover:bg-amber-50 rounded-lg transition-colors"
                      onClick={(e) => openSubModal(e, gc.id)}
                    >
                      <PlusCircle className="w-3.5 h-3.5" />
                    </Button>
                    <Button 
                      variant="ghost" 
                      size="icon" 
                      className="h-6 w-6 text-stone-200 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                      onClick={(e) => handleDelete(e, gc.id, gc.name)}
                    >
                      <Trash2 className="w-3 h-3" />
                    </Button>
                  </div>
                </div>
                
                <div className="min-h-[2rem]">
                  <h3 className="text-[11px] font-black text-stone-800 uppercase leading-tight tracking-tighter group-hover:text-stone-900 line-clamp-2">{gc.name}</h3>
                </div>
                
                <div className="mt-4 pt-3 border-t border-stone-50 space-y-1.5">
                  <div className="flex justify-between items-center text-[8px]">
                    <span className="text-stone-400 font-black uppercase flex items-center gap-1">
                      <Truck className="w-2.5 h-2.5" /> PROCHAINE
                    </span>
                    <span className={`font-black ${stats.nextArrival !== '-' ? 'text-blue-600' : 'text-stone-300'}`}>
                      {stats.nextArrival}
                    </span>
                  </div>
                  <div className="flex justify-between items-center text-[8px]">
                    <span className="text-stone-400 font-black uppercase flex items-center gap-1">
                      <DollarSign className="w-2.5 h-2.5" /> VALEUR TOTALE
                    </span>
                    <span className="font-black text-stone-900">
                      {Math.round(stats.totalValue).toLocaleString()} $
                    </span>
                  </div>
                </div>

                <div className="mt-3 flex justify-between items-center">
                   <div className="px-2 py-0.5 bg-stone-50 rounded text-[7px] font-black text-stone-400 uppercase">
                      {stats.count} FAMILLES
                    </div>
                  <div className="p-1 bg-stone-50 rounded opacity-0 group-hover:opacity-100 transition-all translate-x-2 group-hover:translate-x-0">
                    <ArrowRight className="w-2.5 h-2.5 text-stone-900" />
                  </div>
                </div>
              </CardContent>
            </Card>
          );
              })}
            </div>
          </div>
        ))}
      </div>

      <Dialog open={isModalOpen} onOpenChange={setIsModalOpen}>
        <DialogContent className="max-w-sm rounded-[1.5rem] p-0 border-none overflow-hidden">
          <div className="bg-stone-900 p-6 text-white">
            <DialogTitle className="text-lg font-black uppercase tracking-tight">Initialiser un Pôle</DialogTitle>
            <p className="text-stone-400 text-[9px] font-bold uppercase tracking-widest mt-1">Architecture logistique haut niveau</p>
          </div>
          <div className="p-6 space-y-4">
            <div className="space-y-1.5">
              <label className="text-[9px] font-black text-stone-400 uppercase tracking-widest">Désignation du Pôle</label>
              <Input 
                value={newCatName}
                onChange={e => setNewCatName(e.target.value)}
                placeholder="EX: TEXTILES, ACCESSOIRES..."
                className="h-12 uppercase font-black border-stone-200 rounded-xl focus:ring-stone-900 text-base"
                autoFocus
              />
            </div>
          </div>
          <DialogFooter className="p-6 bg-stone-50 gap-3">
            <Button variant="ghost" onClick={() => setIsModalOpen(false)} className="h-10 font-black uppercase text-[9px] tracking-widest flex-1">Annuler</Button>
            <Button onClick={handleAddGeneralCategory} className="h-10 bg-stone-900 text-white font-black uppercase text-[9px] tracking-widest rounded-xl flex-[1.5] shadow-lg shadow-stone-200">Créer</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={isSubModalOpen} onOpenChange={setIsSubModalOpen}>
        <DialogContent className="max-w-sm rounded-[1.5rem] p-0 border-none overflow-hidden">
          <div className="bg-amber-600 p-6 text-white">
            <DialogTitle className="text-lg font-black uppercase tracking-tight">Nouvelle Famille</DialogTitle>
            <p className="text-amber-200 text-[9px] font-bold uppercase tracking-widest mt-1">
              Pôle : {generalCategories.find(g => g.id === targetGenCatId)?.name}
            </p>
          </div>
          <div className="p-6 space-y-4">
            <div className="space-y-1.5">
              <label className="text-[9px] font-black text-stone-400 uppercase tracking-widest">Nom de la famille produit</label>
              <Input 
                value={newSubName}
                onChange={e => setNewSubName(e.target.value)}
                placeholder="EX: ZIPPER NO5, FIL 40/2..."
                className="h-12 uppercase font-black border-stone-200 rounded-xl focus:ring-amber-600 text-base"
                autoFocus
              />
            </div>
          </div>
          <DialogFooter className="p-6 bg-stone-50 gap-3">
            <Button variant="ghost" onClick={() => setIsSubModalOpen(false)} className="h-10 font-black uppercase text-[9px] tracking-widest flex-1">Annuler</Button>
            <Button onClick={handleAddSubCategory} className="h-10 bg-amber-600 text-white font-black uppercase text-[9px] tracking-widest rounded-xl flex-[1.5] shadow-lg shadow-amber-200">Ajouter</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}