
"use client";

import React, { useState, useMemo, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Sparkles, Loader2, Factory, ListTodo, Layers, Package, Save } from 'lucide-react';
import { suggestArticleSpecifications } from '@/ai/flows/suggest-article-specifications-flow';
import { useUser, useFirestore, useCollection, useMemoFirebase } from '@/firebase';
import { doc, collection } from 'firebase/firestore';
import { useToast } from '@/hooks/use-toast';
import { updateDocumentNonBlocking } from '@/firebase/non-blocking-updates';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

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
    if (!formData?.categoryId || !formData?.name) return;
    setIsSuggesting(true);
    try {
      const result = await suggestArticleSpecifications({
        category: formData.categoryId,
        article: formData.name
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
    
    updateDocumentNonBlocking(docRef, {
      ...formData,
      generalCategoryId: selectedGenCatId
    });

    toast({ title: "Modifié !", description: `L'article ${formData.name} a été mis à jour.` });
    onOpenChange(false);
  };

  if (!formData) return null;

  return (
    <Dialog open={!!article} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="text-xl font-bold text-stone-800 flex items-center gap-2">
            <Package className="w-5 h-5" /> Modifier l'Article
          </DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4 py-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-1">
              <Label className="flex items-center gap-1"><Layers className="w-3 h-3" /> Catégorie Générale</Label>
              <Select value={selectedGenCatId} onValueChange={setSelectedGenCatId}>
                <SelectTrigger className="bg-white">
                  <SelectValue placeholder="Choisir un groupe..." />
                </SelectTrigger>
                <SelectContent>
                  {(generalCategories || []).map(gc => (
                    <SelectItem key={gc.id} value={gc.id}>{gc.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1">
              <Label className="flex items-center gap-1"><Package className="w-3 h-3" /> Sous-catégorie</Label>
              <Select 
                disabled={!selectedGenCatId} 
                value={formData.categoryId} 
                onValueChange={(v) => setFormData((p: any) => ({...p, categoryId: v}))}
              >
                <SelectTrigger className="bg-white">
                  <SelectValue placeholder="Choisir..." />
                </SelectTrigger>
                <SelectContent>
                  {(filteredSubCategories || []).map(sc => (
                    <SelectItem key={sc.id} value={sc.name}>{sc.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1 md:col-span-2">
              <Label>Nom de l'Article</Label>
              <Input 
                required 
                value={formData.name || ''} 
                onChange={e => setFormData((prev: any) => ({ ...prev, name: e.target.value }))} 
              />
            </div>
            
            <div className="space-y-1 md:col-span-2">
              <Label>Spécifications</Label>
              <div className="flex gap-2">
                <Input 
                  value={formData.specs || ''} 
                  onChange={e => setFormData((prev: any) => ({ ...prev, specs: e.target.value }))} 
                />
                <Button 
                  type="button" 
                  variant="outline" 
                  size="icon" 
                  onClick={handleSuggestSpecs} 
                  disabled={isSuggesting || !formData.categoryId || !formData.name}
                >
                  {isSuggesting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4 text-amber-500" />}
                </Button>
              </div>
            </div>

            <div className="space-y-1">
              <Label>Couleur</Label>
              <Input 
                value={formData.color || ''} 
                onChange={e => setFormData((prev: any) => ({ ...prev, color: e.target.value }))} 
              />
            </div>
            <div className="space-y-1">
              <Label>Quantité & Unité</Label>
              <div className="flex gap-2">
                <Input 
                  type="number" 
                  required 
                  value={formData.quantity || 0} 
                  onChange={e => setFormData((prev: any) => ({ ...prev, quantity: parseFloat(e.target.value) || 0 }))} 
                />
                <Input 
                  required 
                  className="w-24"
                  value={formData.unitOfMeasure || ''} 
                  onChange={e => setFormData((prev: any) => ({ ...prev, unitOfMeasure: e.target.value }))} 
                />
              </div>
            </div>

            {formData.status !== 'TO_ORDER' && (
              <>
                <div className="space-y-1">
                  <Label>Fournisseur</Label>
                  <Input 
                    required 
                    value={formData.supplierId || ''} 
                    onChange={e => setFormData((prev: any) => ({ ...prev, supplierId: e.target.value }))}
                  />
                </div>
                <div className="space-y-1">
                  <Label>Volume (CBM)</Label>
                  <Input 
                    type="number" 
                    step="0.001" 
                    required 
                    value={formData.cubicMeasurement || 0} 
                    onChange={e => setFormData((prev: any) => ({ ...prev, cubicMeasurement: parseFloat(e.target.value) || 0 }))} 
                  />
                </div>
                <div className="space-y-1">
                  <Label>Prix (PA)</Label>
                  <Input 
                    type="number" 
                    step="0.0001" 
                    required 
                    value={formData.purchasePricePerUnit || 0} 
                    onChange={e => setFormData((prev: any) => ({ ...prev, purchasePricePerUnit: parseFloat(e.target.value) || 0 }))} 
                  />
                </div>
                <div className="space-y-1">
                  <Label>Facture</Label>
                  <Input 
                    value={formData.factureId || ''} 
                    onChange={e => setFormData((prev: any) => ({ ...prev, factureId: e.target.value.toUpperCase() }))}
                    className="uppercase"
                  />
                </div>
              </>
            )}
          </div>
        </form>

        <DialogFooter className="border-t pt-4">
          <Button variant="outline" onClick={() => onOpenChange(false)}>Annuler</Button>
          <Button onClick={handleSubmit} className="bg-stone-800 hover:bg-black text-white font-bold gap-2">
            <Save className="w-4 h-4" /> Enregistrer les modifications
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
