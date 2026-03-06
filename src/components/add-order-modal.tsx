
"use client";

import React, { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useUser, useFirestore, useCollection, useMemoFirebase } from '@/firebase';
import { doc, collection, serverTimestamp } from 'firebase/firestore';
import { useToast } from '@/hooks/use-toast';
import { setDocumentNonBlocking } from '@/firebase/non-blocking-updates';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

export default function AddOrderModal({ open, onOpenChange, factures }: { open: boolean, onOpenChange: (o: boolean) => void, factures: any[] }) {
  const { user } = useUser();
  const firestore = useFirestore();
  const { toast } = useToast();
  const catsRef = useMemoFirebase(() => user ? collection(firestore, 'users', user.uid, 'categories') : null, [firestore, user]);
  const { data: categories = [] } = useCollection(catsRef);

  const [formData, setFormData] = useState<any>({
    categoryId: '',
    name: '',
    quantity: 0,
    purchasePricePerUnit: 0,
    unitOfMeasure: 'pcs',
    orderDate: new Date().toISOString().split('T')[0],
    status: 'PI'
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!user || !firestore) return;
    const id = crypto.randomUUID();
    const docRef = doc(firestore, 'users', user.uid, 'articles', id);
    setDocumentNonBlocking(docRef, { ...formData, id, createdAt: serverTimestamp() }, { merge: true });
    toast({ title: "Article ajouté" });
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader><DialogTitle>Nouvelle Commande</DialogTitle></DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-1">
            <Label>Catégorie</Label>
            <Select onValueChange={v => setFormData((p: any) => ({...p, categoryId: v}))}>
              <SelectTrigger><SelectValue placeholder="Choisir..." /></SelectTrigger>
              <SelectContent>{(categories || []).map(c => <SelectItem key={c.id} value={c.name}>{c.name}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div className="space-y-1"><Label>Nom</Label><Input required value={formData.name} onChange={e => setFormData((p: any) => ({...p, name: e.target.value}))} /></div>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1"><Label>Quantité</Label><Input type="number" required value={formData.quantity} onChange={e => setFormData((p: any) => ({...p, quantity: parseFloat(e.target.value)}))} /></div>
            <div className="space-y-1"><Label>Prix (PA)</Label><Input type="number" step="0.01" required value={formData.purchasePricePerUnit} onChange={e => setFormData((p: any) => ({...p, purchasePricePerUnit: parseFloat(e.target.value)}))} /></div>
          </div>
          <Button type="submit" className="w-full bg-amber-600 text-white">Enregistrer</Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}
