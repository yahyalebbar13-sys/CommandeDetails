
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
import { Layers, Package } from 'lucide-react';

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
    toast({ title: "Article ajouté" });
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader><DialogTitle>Nouvelle Commande / Rappel</DialogTitle></DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-1">
            <Label className="flex items-center gap-1"><Layers className="w-3 h-3" /> Catégorie Générale</Label>
            <Select value={selectedGenCatId} onValueChange={setSelectedGenCatId}>
              <SelectTrigger><SelectValue placeholder="Choisir un groupe..." /></SelectTrigger>
              <SelectContent>
                {(generalCategories || []).map(gc => (
                  <SelectItem key={gc.id} value={gc.id}>{gc.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1">
            <Label className="flex items-center gap-1"><Package className="w-3 h-3" /> Type de Produit (Sous-Cat)</Label>
            <Select 
              disabled={!selectedGenCatId} 
              onValueChange={v => setFormData((p: any) => ({...p, categoryId: v}))}
            >
              <SelectTrigger><SelectValue placeholder="Choisir..." /></SelectTrigger>
              <SelectContent>
                {(filteredSubCategories || []).map(sc => (
                  <SelectItem key={sc.id} value={sc.name}>{sc.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1">
            <Label>Nom de l'Article</Label>
            <Input required value={formData.name} onChange={e => setFormData((p: any) => ({...p, name: e.target.value}))} />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1">
              <Label>Quantité Prévue</Label>
              <div className="flex gap-2">
                <Input type="number" required value={formData.quantity} onChange={e => setFormData((p: any) => ({...p, quantity: parseFloat(e.target.value)}))} />
                <Input className="w-20" placeholder="pcs" value={formData.unitOfMeasure} onChange={e => setFormData((p: any) => ({...p, unitOfMeasure: e.target.value}))} />
              </div>
            </div>
            <div className="space-y-1">
              <Label>Prix (Optionnel)</Label>
              <Input type="number" step="0.01" value={formData.purchasePricePerUnit} onChange={e => setFormData((p: any) => ({...p, purchasePricePerUnit: parseFloat(e.target.value)}))} />
            </div>
          </div>

          <div className="space-y-1">
            <Label>Statut Initial</Label>
            <Select value={formData.status} onValueChange={v => setFormData((p: any) => ({...p, status: v}))}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="TO_ORDER">À COMMANDER (Rappel)</SelectItem>
                <SelectItem value="PI">LANCÉ EN PRODUCTION (PI)</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <Button type="submit" className="w-full bg-amber-600 text-white font-bold h-12">ENREGISTRER</Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}
