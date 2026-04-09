
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
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue, SelectGroup, SelectLabel } from '@/components/ui/select';
import { Layers, Package, Save, Palette, Ruler, ClipboardList, Maximize, Settings2, MousePointer2, Scissors } from 'lucide-react';

const UNITS = ["pièces", "doz", "m", "rolls", "kg", "bag", "yds"];
const COLORS = ["white", "black", "raw black", "raw white", "various", "various x black", "various x white", "nickel", "various x black x white", "silver", "gold", "black x white", "beige", "black nickel", "transparent"];
const ZIPPER_TYPES = ["O/E", "C/E"];
const SLIDER_TYPES = ["A/L", "P/L", "N/L", "SEMI A/L"];

export default function AddOrderModal({ open, onOpenChange }: { open: boolean, onOpenChange: (o: boolean) => void }) {
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
    unitOfMeasure: 'pièces',
    color: 'white',
    size: '',
    zipperType: '',
    slider: '',
    sliderType: '',
    purchasePricePerUnit: 0,
    priority: 'todo',
  });

  const filteredSubCategories = useMemo(() => {
    if (!selectedGenCatId) return [];
    const filtered = (subCategories || []).filter(sc => sc.generalCategoryId === selectedGenCatId);
    
    const getGroupIndex = (name: string) => {
      const catName = (name || '').toLowerCase().trim();
      
      const fabricKeywords = ["fabric", "non woven", "t/c fabric", "popeline", "leather", "felt fabric", "polyester fabric", "taffeta fabric", "woven interlining"];
      const sliderKeywords = ["puller", "slider for nylon zipper", "slider for plastic zipper", "slider for metal zipper"];
      const zipperKeywords = ["zipper", "plastic zipper", "nylon zipper", "metal zipper", "zipper long chain", "nylon zipper long chain"];
      const buttonKeywords = ["covered mould button", "snap button", "button"];

      if (fabricKeywords.some(kw => catName.includes(kw))) return 1;
      if (sliderKeywords.some(kw => catName.includes(kw))) return 2;
      if (zipperKeywords.some(kw => catName.includes(kw))) return 3;
      if (buttonKeywords.some(kw => catName.includes(kw))) return 4;
      return 5;
    };

    return filtered.sort((a, b) => {
      const indexA = getGroupIndex(a.name);
      const indexB = getGroupIndex(b.name);
      if (indexA !== indexB) {
        return indexA - indexB;
      }
      return (a.name || '').localeCompare(b.name || '');
    });
  }, [selectedGenCatId, subCategories]);

  const isZipper = useMemo(() => {
    const upper = formData.categoryId?.toUpperCase() || "";
    // On inclut les Zippers mais on exclut explicitement Long Chain et Slider
    return upper.includes('ZIPPER') && !upper.includes('LONG CHAIN') && !upper.includes('SLIDER');
  }, [formData.categoryId]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!user || !firestore || !formData.categoryId || !selectedGenCatId) return;

    const id = crypto.randomUUID();
    const docRef = doc(firestore, 'users', user.uid, 'articles', id);

    setDocumentNonBlocking(docRef, {
      ...formData,
      id,
      name: formData.categoryId,
      generalCategoryId: selectedGenCatId,
      status: 'TO_ORDER',
      createdAt: serverTimestamp()
    }, { merge: true });

    toast({ title: "Besoins enregistrés", description: "L'article a été ajouté à la liste des rappels." });

    setFormData({
      categoryId: '',
      specs: '',
      quantity: 0,
      unitOfMeasure: 'pièces',
      color: 'white',
      size: '',
      zipperType: '',
      slider: '',
      sliderType: '',
      purchasePricePerUnit: 0,
      priority: 'todo',
    });
    setSelectedGenCatId('');
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md border-stone-200 max-h-[90vh] overflow-y-auto rounded-2xl p-0">
        <div className="bg-stone-900 p-6 flex items-center gap-3 text-white">
          <div className="p-2 bg-white/10 rounded-lg">
            <Package className="w-6 h-6" />
          </div>
          <div>
            <DialogTitle className="text-xl font-black uppercase tracking-tight leading-none">Nouvel Article</DialogTitle>
            <p className="text-[10px] font-bold text-stone-400 uppercase tracking-widest mt-1">Identification du besoin initial</p>
          </div>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-6">
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label className="text-[10px] font-black text-stone-400 uppercase tracking-widest flex items-center gap-1">
                <Layers className="w-3 h-3" /> Pôle Logistique
              </Label>
              <Select value={selectedGenCatId} onValueChange={setSelectedGenCatId}>
                <SelectTrigger className="h-12 border-stone-200 bg-white font-bold rounded-xl">
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
                onValueChange={v => {
                  const cat = filteredSubCategories.find(c => c.name === v);
                  setFormData((p: any) => ({ 
                    ...p, 
                    categoryId: v
                  }));
                }}
              >
                <SelectTrigger className="h-12 border-stone-200 bg-white font-bold rounded-xl">
                  <SelectValue placeholder="Choisir..." />
                </SelectTrigger>
                <SelectContent>
                  {(() => {
                    const groups: Record<string, any[]> = {};
                    (filteredSubCategories || []).forEach(sc => {
                      const catName = (sc.name || '').toLowerCase().trim();
                      const fabricKeywords = ["fabric", "non woven", "t/c fabric", "popeline", "leather", "felt fabric", "polyester fabric", "taffeta fabric", "woven interlining"];
                      const sliderKeywords = ["puller", "slider for nylon zipper", "slider for plastic zipper", "slider for metal zipper"];
                      const zipperKeywords = ["zipper", "plastic zipper", "nylon zipper", "metal zipper", "zipper long chain", "nylon zipper long chain"];
                      const buttonKeywords = ["covered mould button", "snap button", "button"];
                      let label = "Reste";
                      if (fabricKeywords.some(kw => catName.includes(kw))) label = "Fabric";
                      else if (sliderKeywords.some(kw => catName.includes(kw))) label = "Slider et puller";
                      else if (zipperKeywords.some(kw => catName.includes(kw))) label = "Zipper";
                      else if (buttonKeywords.some(kw => catName.includes(kw))) label = "Bouton";
                      if (!groups[label]) groups[label] = [];
                      groups[label].push(sc);
                    });
                    return ["Fabric", "Slider et puller", "Zipper", "Bouton", "Reste"].map(label => {
                      if (!groups[label] || groups[label].length === 0) return null;
                      return (
                        <SelectGroup key={label}>
                          <SelectLabel className="text-[10px] text-stone-400 font-black uppercase tracking-widest bg-stone-50 py-2">{label}</SelectLabel>
                          {groups[label].map(sc => (
                            <SelectItem key={sc.id} value={sc.name} className="font-bold pl-6">{sc.name}</SelectItem>
                          ))}
                        </SelectGroup>
                      );
                    });
                  })()}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label className="text-[10px] font-black text-stone-400 uppercase tracking-widest flex items-center gap-1">
                <Maximize className="w-3 h-3" /> Taille / Dimension
              </Label>
              <Input
                placeholder="Ex: No.5, 20cm..."
                className="h-12 border-stone-200 font-bold rounded-xl"
                value={formData.size}
                onChange={e => setFormData((p: any) => ({ ...p, size: e.target.value }))}
              />
            </div>
            {isZipper && (
              <div className="space-y-1.5">
                <Label className="text-[10px] font-black text-stone-400 uppercase tracking-widest flex items-center gap-1">
                  <Settings2 className="w-3 h-3" /> Type Zipper
                </Label>
                <Select value={formData.zipperType} onValueChange={v => setFormData((p: any) => ({ ...p, zipperType: v }))}>
                  <SelectTrigger className="h-12 border-stone-200 bg-white font-bold rounded-xl">
                    <SelectValue placeholder="Type..." />
                  </SelectTrigger>
                  <SelectContent>
                    {ZIPPER_TYPES.map(t => <SelectItem key={t} value={t} className="font-bold uppercase">{t}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            )}
          </div>

          {isZipper && (
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label className="text-[10px] font-black text-stone-400 uppercase tracking-widest flex items-center gap-1">
                  <MousePointer2 className="w-3 h-3" /> Curseur
                </Label>
                <Input
                  placeholder="Ex: Auto-lock..."
                  className="h-12 border-stone-200 font-bold rounded-xl"
                  value={formData.slider}
                  onChange={e => setFormData((p: any) => ({ ...p, slider: e.target.value }))}
                />
              </div>
              <div className="space-y-1.5">
                <Label className="text-[10px] font-black text-stone-400 uppercase tracking-widest flex items-center gap-1">
                  <Scissors className="w-3 h-3" /> Type Curseur
                </Label>
                <Select value={formData.sliderType} onValueChange={v => setFormData((p: any) => ({ ...p, sliderType: v }))}>
                  <SelectTrigger className="h-12 border-stone-200 bg-white font-bold rounded-xl">
                    <SelectValue placeholder="Type Curseur..." />
                  </SelectTrigger>
                  <SelectContent>
                    {SLIDER_TYPES.map(t => <SelectItem key={t} value={t} className="font-bold uppercase">{t}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            </div>
          )}

          <div className="space-y-1.5">
            <Label className="text-[10px] font-black text-stone-400 uppercase tracking-widest flex items-center gap-1">
              <ClipboardList className="w-3 h-3" /> {isZipper ? 'Notes Additionnelles' : 'Détails Techniques / Specs'}
            </Label>
            <Input
              placeholder={isZipper ? "Notes..." : "Ex: Semi-Auto, 50m/roll..."}
              className="h-12 border-stone-200 font-bold rounded-xl"
              value={formData.specs}
              onChange={e => setFormData((p: any) => ({ ...p, specs: e.target.value }))}
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label className="text-[10px] font-black text-stone-400 uppercase tracking-widest flex items-center gap-1">
                <Ruler className="w-3 h-3" /> Unité
              </Label>
              <Select value={formData.unitOfMeasure} onValueChange={v => setFormData((p: any) => ({ ...p, unitOfMeasure: v }))}>
                <SelectTrigger className="h-12 border-stone-200 bg-white font-bold rounded-xl">
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
              <Select value={formData.color} onValueChange={v => setFormData((p: any) => ({ ...p, color: v }))}>
                <SelectTrigger className="h-12 border-stone-200 bg-white font-bold rounded-xl">
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
              <Input type="number" required className="h-12 border-stone-200 font-bold rounded-xl" value={formData.quantity} onChange={e => setFormData((p: any) => ({ ...p, quantity: parseFloat(e.target.value) || 0 }))} />
            </div>
            <div className="space-y-1.5">
              <Label className="text-[10px] font-black text-stone-400 uppercase tracking-widest flex items-center gap-1">
                <ClipboardList className="w-3 h-3" /> Importance
              </Label>
              <Select value={formData.priority} onValueChange={v => setFormData((p: any) => ({ ...p, priority: v }))}>
                <SelectTrigger className="h-12 border-stone-200 bg-white font-bold rounded-xl">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="urgent" className="font-bold text-red-600 uppercase">Urgent</SelectItem>
                  <SelectItem value="important" className="font-bold text-amber-600 uppercase">Important</SelectItem>
                  <SelectItem value="todo" className="font-bold text-stone-600 uppercase">À faire</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label className="text-[10px] font-black text-stone-400 uppercase tracking-widest">Estimation PA ($)</Label>
              <Input type="number" step="0.0001" className="h-12 border-stone-200 font-bold text-amber-700 rounded-xl" value={formData.purchasePricePerUnit} onChange={e => setFormData((p: any) => ({ ...p, purchasePricePerUnit: parseFloat(e.target.value) || 0 }))} />
            </div>
          </div>


          <div className="p-4 bg-stone-50 rounded-xl border border-dashed border-stone-200">
            <p className="text-[9px] font-bold text-stone-500 uppercase text-center italic">
              Le suivi logistique (Fournisseur, CBM, Facture) sera activé lors du passage en production.
            </p>
          </div>

          <Button type="submit" className="w-full bg-stone-900 hover:bg-black text-white font-black uppercase tracking-widest h-14 rounded-xl gap-2 mt-2 shadow-xl shadow-stone-200">
            <Save className="w-5 h-5" /> Enregistrer le besoin
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}
