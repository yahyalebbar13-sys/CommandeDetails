
"use client";

import React, { useState, useMemo } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useUser, useFirestore, useCollection, useMemoFirebase } from '@/firebase';
import { doc, collection, serverTimestamp } from 'firebase/firestore';
import { useToast } from '@/hooks/use-toast';
import { setDocumentNonBlocking } from '@/firebase/non-blocking-updates';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Layers, Package, Save } from 'lucide-react';

export default function AddOrderModal({ open, onOpenChange, factures }: { open: boolean, onOpenChange: (o: boolean) => void, factures: any[] }) {
  const { user } = useUser();
  const firestore = useFirestore();
  const { toast } = useToast();
  
  const genCatsRef = useMemoFirebase(() => user ? collection(firestore, 'users', user.uid, 'generalCategories') : null, [firestore, user]);
  const subCatsRef = useMemoFirebase(() => user ? collection(firestore, 'users', user.uid, 'categories') : null, [firestore, user]);
  
  const { data: generalCategories = [] } = useCollection(genCatsRef);
  const { data: subCategories = [] } = useCollection(subCatsRef);

  const [selectedGenCatId, setSelectedGenCatId] = useState<string>('');
  const [formData, setFormData] = useState<any>({
    categoryId: '',
    name: '',
    quantity: 0,
    purchasePricePerUnit: 0,
    unitOfMeasure: 'pcs',
    orderDate: new Date().toISOString().split('T')[0],
    status: 'TO_ORDER'
  });

  const filteredSubCategories = useMemo(() => {
    if (!selectedGenCatId) return [];
    return (subCategories || []).filter(sc => sc.generalCategoryId === selectedGenCatId);
  }, [selectedGenCatId, subCategories]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!user || !firestore || !formData.categoryId || !selectedGenCatId) return;
    const id = crypto.randomUUID();
    const docRef = doc(firestore, 'users', user.uid, 'articles', id);
    setDocumentNonBlocking(docRef, { 
      ...formData, 
      id, 
      generalCategoryId: selectedGenCatId,
      createdAt: serverTimestamp() 
    }, { merge: true });
    toast({ title: "Besoin enregistré" });
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md border-stone-200">
        <DialogHeader>
          <DialogTitle className="text-lg font-black text-stone-900 uppercase tracking-tighter flex items-center gap-2">
            <Package className="w-5 h-5 text-stone-400" /> Expression de Besoin
          </DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-6 py-4">
          <div className="space-y-1.5">
            <Label className="text-[10px] font-black text-stone-400 uppercase tracking-widest flex items-center gap-1">
              <Layers className="w-3 h-3" /> Pôle Logistique
            </Label>
            <Select value={selectedGenCatId} onValueChange={setSelectedGenCatId}>
              <SelectTrigger className="h-11 border-stone-200 bg-white font-bold">
                <SelectValue placeholder="Choisir un groupe..." />
              </SelectTrigger>
              <SelectContent>
                {(generalCategories || []).map(gc => (
                  <SelectItem key={gc.id} value={gc.id} className="font-bold">{gc.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1.5">
            <Label className="text-[10px] font-black text-stone-400 uppercase tracking-widest flex items-center gap-1">
              <Package className="w-3 h-3" /> Désignation (Sous-Cat)
            </Label>
            <Select 
              disabled={!selectedGenCatId} 
              onValueChange={v => setFormData((p: any) => ({...p, categoryId: v, name: v}))}
            >
              <SelectTrigger className="h-11 border-stone-200 bg-white font-bold">
                <SelectValue placeholder="Choisir le type de produit..." />
              </SelectTrigger>
              <SelectContent>
                {(filteredSubCategories || []).map(sc => (
                  <SelectItem key={sc.id} value={sc.name} className="font-bold">{sc.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="text-[9px] text-stone-400 font-bold uppercase mt-1 italic">Note: Le nom de l'article sera identique à la sous-catégorie.</p>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label className="text-[10px] font-black text-stone-400 uppercase tracking-widest">Quantité</Label>
              <div className="flex gap-2">
                <Input type="number" required className="h-11 border-stone-200 font-bold" value={formData.quantity} onChange={e => setFormData((p: any) => ({...p, quantity: parseFloat(e.target.value)}))} />
                <Input className="w-20 h-11 border-stone-200 font-bold uppercase" placeholder="pcs" value={formData.unitOfMeasure} onChange={e => setFormData((p: any) => ({...p, unitOfMeasure: e.target.value}))} />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label className="text-[10px] font-black text-stone-400 uppercase tracking-widest">Prix Est. (€)</Label>
              <Input type="number" step="0.01" className="h-11 border-stone-200 font-bold" value={formData.purchasePricePerUnit} onChange={e => setFormData((p: any) => ({...p, purchasePricePerUnit: parseFloat(e.target.value)}))} />
            </div>
          </div>

          <div className="space-y-1.5">
            <Label className="text-[10px] font-black text-stone-400 uppercase tracking-widest">État du dossier</Label>
            <Select value={formData.status} onValueChange={v => setFormData((p: any) => ({...p, status: v}))}>
              <SelectTrigger className="h-11 border-stone-200 bg-white font-bold">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="TO_ORDER" className="font-bold">À COMMANDER (Rappel)</SelectItem>
                <SelectItem value="PI" className="font-bold text-amber-600">PRODUCTION LANCÉE (PI)</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <Button type="submit" className="w-full bg-stone-900 hover:bg-black text-white font-black uppercase tracking-widest h-12 rounded-lg gap-2">
            <Save className="w-4 h-4" /> Enregistrer dans le suivi
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}
