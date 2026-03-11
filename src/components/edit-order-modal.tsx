
"use client";

import React, { useState, useMemo, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Sparkles, Loader2, Layers, Package, Save, Palette, Ruler, ClipboardList, Maximize } from 'lucide-react';
import { suggestArticleSpecifications } from '@/ai/flows/suggest-article-specifications-flow';
import { useUser, useFirestore, useCollection, useMemoFirebase } from '@/firebase';
import { doc, collection } from 'firebase/firestore';
import { useToast } from '@/hooks/use-toast';
import { updateDocumentNonBlocking } from '@/firebase/non-blocking-updates';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

const UNITS = ["pièces", "doz", "m", "rolls", "kg", "bag"];
const COLORS = ["white", "black", "raw black", "raw white", "various", "various x black", "various x white", "nickel", "various x black x white", "transparent"];

interface EditOrderModalProps {
  article: any | null;
  onOpenChange: (open: boolean) => void;
  factures: any[];
}

export default function EditOrderModal({ article, onOpenChange, factures }: EditOrderModalProps) {
  const { user } = useUser();
  const firestore = useFirestore();
  const { toast } = useToast();
  
  const genCatsRef = useMemoFirebase(() => {
    if (!firestore || !user) return null;
    return collection(firestore, 'users', user.uid, 'generalCategories');
  }, [firestore, user]);

  const catsRef = useMemoFirebase(() => {
    if (!firestore || !user) return null;
    return collection(firestore, 'users', user.uid, 'categories');
  }, [firestore, user]);

  const { data: generalCategories = [] } = useCollection(genCatsRef);
  const { data: subCategories = [] } = useCollection(catsRef);

  const [selectedGenCatId, setSelectedGenCatId] = useState<string>('');
  const [formData, setFormData] = useState<any>(null);
  const [isSuggesting, setIsSuggesting] = useState(false);

  useEffect(() => {
    if (article) {
      setFormData({ 
        ...article,
        factureId: article.factureId || 'NONE',
        size: article.size || ''
      });
      setSelectedGenCatId(article.generalCategoryId || '');
    } else {
      setFormData(null);
    }
  }, [article]);

  const filteredSubCategories = useMemo(() => {
    if (!selectedGenCatId || !subCategories) return [];
    return (subCategories || []).filter(sc => sc.generalCategoryId === selectedGenCatId);
  }, [selectedGenCatId, subCategories]);

  const handleSuggestSpecs = async () => {
    if (!formData?.categoryId) return;
    setIsSuggesting(true);
    try {
      const result = await suggestArticleSpecifications({
        category: formData.categoryId,
        article: formData.categoryId
      });
      setFormData((prev: any) => ({ ...prev, specs: result.specs }));
    } catch (err) {
      console.error(err);
    } finally {
      setIsSuggesting(false);
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!user || !firestore || !article || !formData) return;

    const docRef = doc(firestore, 'users', user.uid, 'articles', article.id);
    
    let arrivalDate = formData.arrivalDate || '';
    const finalFactureId = formData.factureId === 'NONE' ? '' : formData.factureId;

    if (formData.status === 'SHIPPED' && finalFactureId) {
      const selectedFacture = (factures || []).find(f => f.id === finalFactureId);
      if (selectedFacture) arrivalDate = selectedFacture.arrivalDate;
    }

    const finalData = {
      ...formData,
      name: formData.categoryId,
      generalCategoryId: selectedGenCatId,
      factureId: finalFactureId,
      arrivalDate
    };

    updateDocumentNonBlocking(docRef, finalData);

    toast({ title: "Modifié !", description: `L'article a été mis à jour.` });
    onOpenChange(false);
  };

  if (!formData) return null;

  return (
    <Dialog open={!!article} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto border-stone-200">
        <DialogHeader>
          <DialogTitle className="text-lg font-black text-stone-900 uppercase tracking-tighter flex items-center gap-2">
            <Package className="w-5 h-5 text-stone-400" /> Paramétrage Article
          </DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-6 py-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
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
                value={formData.categoryId} 
                onValueChange={(v) => setFormData((p: any) => ({...p, categoryId: v}))}
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
            
            <div className="space-y-1.5 md:col-span-2">
              <Label className="text-[10px] font-black text-stone-400 uppercase tracking-widest flex items-center gap-1">
                <Maximize className="w-3 h-3" /> Taille / Dimension
              </Label>
              <Input 
                value={formData.size || ''} 
                onChange={e => setFormData((prev: any) => ({ ...prev, size: e.target.value }))} 
                className="h-11 border-stone-200 font-bold"
                placeholder="Ex: No.5, 20cm, 120D/2..."
              />
            </div>

            <div className="space-y-1.5 md:col-span-2">
              <Label className="text-[10px] font-black text-stone-400 uppercase tracking-widest flex items-center gap-1">
                <ClipboardList className="w-3 h-3" /> Détails Techniques / Spécifications
              </Label>
              <div className="flex gap-2">
                <Input 
                  value={formData.specs || ''} 
                  onChange={e => setFormData((prev: any) => ({ ...prev, specs: e.target.value }))} 
                  className="h-11 border-stone-200 font-bold"
                  placeholder="Ex: Semi-Auto, 50m/roll..."
                />
                <Button 
                  type="button" 
                  variant="outline" 
                  className="h-11 w-11 border-stone-200"
                  onClick={handleSuggestSpecs} 
                  disabled={isSuggesting || !formData.categoryId}
                >
                  {isSuggesting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4 text-amber-500" />}
                </Button>
              </div>
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

            <div className="grid grid-cols-2 gap-4 md:col-span-2">
              <div className="space-y-1.5">
                <Label className="text-[10px] font-black text-stone-400 uppercase tracking-widest">Quantité</Label>
                <Input 
                  type="number" 
                  required 
                  value={formData.quantity || 0} 
                  onChange={e => setFormData((prev: any) => ({ ...prev, quantity: parseFloat(e.target.value) || 0 }))} 
                  className="h-11 border-stone-200 font-bold"
                />
              </div>
              
              <div className="space-y-1.5">
                <Label className="text-[10px] font-black text-stone-400 uppercase tracking-widest">Prix Unitaire ($)</Label>
                <Input 
                  type="number" 
                  step="0.0001" 
                  required 
                  value={formData.purchasePricePerUnit || 0} 
                  onChange={e => setFormData((prev: any) => ({ ...prev, purchasePricePerUnit: parseFloat(e.target.value) || 0 }))} 
                  className="h-11 border-stone-200 font-bold text-amber-700"
                />
              </div>
            </div>

            <div className="space-y-3 p-4 bg-stone-50 rounded-lg border border-stone-200 md:col-span-2">
              <Label className="text-[10px] font-black text-stone-500 uppercase tracking-widest">État & Logistique</Label>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <Select value={formData.status} onValueChange={v => setFormData((p: any) => ({...p, status: v}))}>
                  <SelectTrigger className="h-11 border-stone-200 bg-white font-bold">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="TO_ORDER" className="font-bold uppercase">À Commander</SelectItem>
                    <SelectItem value="PI" className="font-bold text-amber-600 uppercase">Production Lancée (PI)</SelectItem>
                    <SelectItem value="SHIPPED" className="font-bold text-blue-600 uppercase">Expédié (Sur Facture)</SelectItem>
                  </SelectContent>
                </Select>

                {formData.status !== 'TO_ORDER' && (
                  <Select value={formData.factureId || 'NONE'} onValueChange={v => setFormData((p: any) => ({...p, factureId: v}))}>
                    <SelectTrigger className="h-11 border-stone-200 bg-white font-bold">
                      <SelectValue placeholder="Facture..." />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="NONE" className="font-bold italic">PAS DE FACTURE</SelectItem>
                      {(factures || []).map(f => (
                        <SelectItem key={f.id} value={f.id} className="font-bold uppercase">{f.id}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
                
                {formData.status !== 'TO_ORDER' && (
                  <>
                    <Input 
                      placeholder="Fournisseur" 
                      value={formData.supplierId || ''} 
                      onChange={e => setFormData((prev: any) => ({ ...prev, supplierId: e.target.value.toUpperCase() }))}
                      className="h-11 border-stone-200 font-bold uppercase"
                    />
                    <Input 
                      type="number" 
                      step="0.001" 
                      placeholder="Volume (CBM)"
                      value={formData.cubicMeasurement || 0} 
                      onChange={e => setFormData((prev: any) => ({ ...prev, cubicMeasurement: parseFloat(e.target.value) || 0 }))} 
                      className="h-11 border-stone-200 font-bold"
                    />
                  </>
                )}
              </div>
            </div>
          </div>
          <Button type="submit" className="w-full bg-stone-900 hover:bg-black text-white font-black uppercase text-[10px] tracking-widest h-12 rounded-xl gap-2 shadow-lg shadow-stone-200">
            <Save className="w-4 h-4" /> Sauvegarder les modifications
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}
