
"use client";

import React, { useState, useMemo, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Sparkles, Loader2, Factory, ListTodo, Layers, Package, Save, Palette, Ruler } from 'lucide-react';
import { suggestArticleSpecifications } from '@/ai/flows/suggest-article-specifications-flow';
import { useUser, useFirestore, useCollection, useMemoFirebase } from '@/firebase';
import { doc, collection } from 'firebase/firestore';
import { useToast } from '@/hooks/use-toast';
import { updateDocumentNonBlocking } from '@/firebase/non-blocking-updates';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

const UNITS = ["pièces", "doz", "m", "rolls", "kg"];
const COLORS = ["white", "black", "raw black", "raw white", "various", "various x black", "various x white"];

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
      setFormData({ ...article });
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
        article: formData.categoryId // On utilise la catégorie car le nom de l'article est identique
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
    
    // Le nom est TOUJOURS celui de la catégorie
    const finalData = {
      ...formData,
      name: formData.categoryId,
      generalCategoryId: selectedGenCatId
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
                <Package className="w-3 h-3" /> Type de Produit (Sous-Cat)
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
              <Label className="text-[10px] font-black text-stone-400 uppercase tracking-widest">Spécifications Techniques</Label>
              <div className="flex gap-2">
                <Input 
                  value={formData.specs || ''} 
                  onChange={e => setFormData((prev: any) => ({ ...prev, specs: e.target.value }))} 
                  className="h-11 border-stone-200 font-bold"
                  placeholder="Ex: 20cm, 50m/roll..."
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
                <Ruler className="w-3 h-3" /> Unité de Mesure
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
              <Label className="text-[10px] font-black text-stone-400 uppercase tracking-widest">Quantité Demandée</Label>
              <Input 
                type="number" 
                required 
                value={formData.quantity || 0} 
                onChange={e => setFormData((prev: any) => ({ ...prev, quantity: parseFloat(e.target.value) || 0 }))} 
                className="h-11 border-stone-200 font-bold"
              />
            </div>
            
            <div className="space-y-1.5">
              <Label className="text-[10px] font-black text-stone-400 uppercase tracking-widest">Prix d'Achat Unitaire (€)</Label>
              <Input 
                type="number" 
                step="0.0001" 
                required 
                value={formData.purchasePricePerUnit || 0} 
                onChange={e => setFormData((prev: any) => ({ ...prev, purchasePricePerUnit: parseFloat(e.target.value) || 0 }))} 
                className="h-11 border-stone-200 font-bold text-amber-700"
              />
            </div>

            {formData.status !== 'TO_ORDER' && (
              <>
                <div className="space-y-1.5">
                  <Label className="text-[10px] font-black text-stone-400 uppercase tracking-widest">Fournisseur Actuel</Label>
                  <Input 
                    required 
                    value={formData.supplierId || ''} 
                    onChange={e => setFormData((prev: any) => ({ ...prev, supplierId: e.target.value.toUpperCase() }))}
                    className="h-11 border-stone-200 font-bold uppercase"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-[10px] font-black text-stone-400 uppercase tracking-widest">Encombrement (CBM)</Label>
                  <Input 
                    type="number" 
                    step="0.001" 
                    required 
                    value={formData.cubicMeasurement || 0} 
                    onChange={e => setFormData((prev: any) => ({ ...prev, cubicMeasurement: parseFloat(e.target.value) || 0 }))} 
                    className="h-11 border-stone-200 font-bold"
                  />
                </div>
                <div className="space-y-1.5 md:col-span-2">
                  <Label className="text-[10px] font-black text-stone-400 uppercase tracking-widest">Lien Facture / Arrivage</Label>
                  <Select value={formData.factureId || ''} onValueChange={v => setFormData((p: any) => ({...p, factureId: v}))}>
                    <SelectTrigger className="h-11 border-stone-200 bg-white font-bold">
                      <SelectValue placeholder="Associer à un dossier logistique..." />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="" className="font-bold italic">PAS DE FACTURE (PI ISOLÉ)</SelectItem>
                      {factures.map(f => (
                        <SelectItem key={f.id} value={f.id} className="font-bold uppercase">{f.id} - {f.arrivalDate}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </>
            )}
          </div>
        </form>

        <DialogFooter className="border-t pt-4">
          <Button variant="ghost" onClick={() => onOpenChange(false)} className="text-[10px] font-black uppercase tracking-widest">Annuler</Button>
          <Button onClick={handleSubmit} className="bg-stone-900 hover:bg-black text-white font-black uppercase text-[10px] tracking-widest px-8 h-11 rounded-lg gap-2">
            <Save className="w-4 h-4" /> Sauvegarder
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
