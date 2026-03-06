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
import { Layers, Package, Save, Palette, Ruler, ClipboardList } from 'lucide-react';

const UNITS = ["pièces", "doz", "m", "rolls", "kg"];
const COLORS = ["white", "black", "raw black", "raw white", "various", "various x black", "various x white"];

export default function AddOrderModal({ open, onOpenChange, factures }: { open: boolean, onOpenChange: (o: boolean) => void, factures: any[] | null }) {
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
    specs: '',
    quantity: 0,
    purchasePricePerUnit: 0,
    unitOfMeasure: 'pièces',
    color: 'white',
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
    
    // Status is strictly TO_ORDER for new additions
    setDocumentNonBlocking(docRef, { 
      ...formData, 
      id, 
      name: formData.categoryId,
      generalCategoryId: selectedGenCatId,
      status: 'TO_ORDER',
      createdAt: serverTimestamp() 
    }, { merge: true });

    toast({ title: "Besoins enregistrés", description: "L'article a été ajouté à la liste des rappels." });
    onOpenChange(false);
    
    setFormData({
      categoryId: '',
      specs: '',
      quantity: 0,
      purchasePricePerUnit: 0,
      unitOfMeasure: 'pièces',
      color: 'white',
    });
    setSelectedGenCatId('');
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md border-stone-200 max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="text-lg font-black text-stone-900 uppercase tracking-tighter flex items-center gap-2">
            <Package className="w-5 h-5 text-stone-400" /> Nouvel Article
          </DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-5 py-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label className="text-[10px] font-black text-stone-400 uppercase tracking-widest flex items-center gap-1">
                <Layers className="w-3 h-3" /> Pôle Logistique
              </Label>
              <Select value={selectedGenCatId} onValueChange={setSelectedGenCatId}>
                <SelectTrigger className="h-11 border-stone-200 bg-white font-bold">
                  <SelectValue placeholder="Choisir..." />
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
                <Package className="w-3 h-3" /> Type de Produit
              </Label>
              <Select 
                disabled={!selectedGenCatId} 
                onValueChange={v => setFormData((p: any) => ({...p, categoryId: v}))}
              >
                <SelectTrigger className="h-11 border-stone-200 bg-white font-bold">
                  <SelectValue placeholder="Choisir..." />
                </SelectTrigger>
                <SelectContent>
                  {(filteredSubCategories || []).map(sc => (
                    <SelectItem key={sc.id} value={sc.name} className="font-bold">{sc.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="space-y-1.5">
            <Label className="text-[10px] font-black text-stone-400 uppercase tracking-widest flex items-center gap-1">
              <ClipboardList className="w-3 h-3" /> Détails Techniques / Specs
            </Label>
            <Input 
              placeholder="Ex: 20cm, 50m/roll, 120D/2..." 
              className="h-11 border-stone-200 font-bold"
              value={formData.specs}
              onChange={e => setFormData((p: any) => ({...p, specs: e.target.value}))}
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label className="text-[10px] font-black text-stone-400 uppercase tracking-widest flex items-center gap-1">
                <Ruler className="w-3 h-3" /> Unité
              </Label>
              <Select value={formData.unitOfMeasure} onValueChange={v => setFormData((p: any) => ({...p, unitOfMeasure: v}))}>
                <SelectTrigger className="h-11 border-stone-200 bg-white font-bold">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {UNITS.map(u => <SelectItem key={u} value={u} className="font-bold uppercase">{u}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label className="text-[10px] font-black text-stone-400 uppercase tracking-widest flex items-center gap-1">
                <Palette className="w-3 h-3" /> Couleur
              </Label>
              <Select value={formData.color} onValueChange={v => setFormData((p: any) => ({...p, color: v}))}>
                <SelectTrigger className="h-11 border-stone-200 bg-white font-bold">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {COLORS.map(c => <SelectItem key={c} value={c} className="font-bold uppercase">{c}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label className="text-[10px] font-black text-stone-400 uppercase tracking-widest">Quantité</Label>
              <Input type="number" required className="h-11 border-stone-200 font-bold" value={formData.quantity} onChange={e => setFormData((p: any) => ({...p, quantity: parseFloat(e.target.value)}))} />
            </div>
            <div className="space-y-1.5">
              <Label className="text-[10px] font-black text-stone-400 uppercase tracking-widest">Prix Unitaire (€)</Label>
              <Input type="number" step="0.0001" className="h-11 border-stone-200 font-bold text-amber-700" value={formData.purchasePricePerUnit} onChange={e => setFormData((p: any) => ({...p, purchasePricePerUnit: parseFloat(e.target.value)}))} />
            </div>
          </div>

          <div className="p-4 bg-stone-50 rounded-lg border border-dashed border-stone-300">
            <p className="text-[9px] font-bold text-stone-500 uppercase text-center italic">
              Le suivi opérationnel (PI/Facture) sera activé une fois l'article lancé.
            </p>
          </div>

          <Button type="submit" className="w-full bg-stone-900 hover:bg-black text-white font-black uppercase tracking-widest h-12 rounded-lg gap-2 mt-2">
            <Save className="w-4 h-4" /> Enregistrer le besoin
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}