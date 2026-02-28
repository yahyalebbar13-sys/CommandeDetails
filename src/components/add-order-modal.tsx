
"use client";

import React, { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Sparkles, Loader2, CheckCircle2 } from 'lucide-react';
import { suggestArticleSpecifications } from '@/ai/flows/suggest-article-specifications-flow';
import { useUser, useFirestore } from '@/firebase';
import { doc, collection, serverTimestamp } from 'firebase/firestore';
import { useToast } from '@/hooks/use-toast';
import { setDocumentNonBlocking } from '@/firebase/non-blocking-updates';

interface AddOrderModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  factures: any[];
}

export default function AddOrderModal({ open, onOpenChange, factures }: AddOrderModalProps) {
  const { user } = useUser();
  const firestore = useFirestore();
  const { toast } = useToast();
  
  const [formData, setFormData] = useState<any>({
    orderDate: new Date().toISOString().split('T')[0],
    arrivalDate: '',
    quantity: 0,
    purchasePricePerUnit: 0,
    cubicMeasurement: 0,
    unitOfMeasure: 'pcs',
    color: '',
    categoryId: '',
    name: '',
    supplierId: '',
    factureId: '',
    specs: ''
  });
  const [isSuggesting, setIsSuggesting] = useState(false);
  const [autofillVisible, setAutofillVisible] = useState(false);

  const handleFactureInput = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value.toUpperCase();
    setFormData((prev: any) => ({ ...prev, factureId: val }));
    
    // Recherche de la facture pour l'auto-remplissage
    const knownFacture = factures.find(f => f.id === val);
    if (knownFacture) {
      setFormData((prev: any) => ({
        ...prev,
        arrivalDate: knownFacture.arrivalDate || prev.arrivalDate,
        supplierId: knownFacture.supplierId || knownFacture.supplier || prev.supplierId
      }));
      setAutofillVisible(true);
      setTimeout(() => setAutofillVisible(false), 3000);
    }
  };

  const handleSuggestSpecs = async () => {
    if (!formData.categoryId || !formData.name) return;
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
    if (!user || !firestore) return;

    if (formData.categoryId && formData.name && formData.supplierId && formData.factureId) {
      const articleId = crypto.randomUUID();
      const articlesRef = collection(firestore, 'users', user.uid, 'articles');
      const docRef = doc(articlesRef, articleId);
      
      const articleData = {
        ...formData,
        id: articleId,
        createdAt: serverTimestamp()
      };

      // Utilisation de setDocumentNonBlocking pour garantir l'ID
      setDocumentNonBlocking(docRef, articleData, { merge: true });

      toast({ title: "Article ajouté !", description: `${formData.name} a été enregistré.` });
      onOpenChange(false);
      
      // Reset form
      setFormData({
        orderDate: new Date().toISOString().split('T')[0],
        arrivalDate: '',
        quantity: 0,
        purchasePricePerUnit: 0,
        cubicMeasurement: 0,
        unitOfMeasure: 'pcs',
        color: '',
        categoryId: '',
        name: '',
        supplierId: '',
        factureId: '',
        specs: ''
      });
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="text-xl font-bold text-stone-800">Nouvelle Commande d'Article</DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4 py-4">
          <div className="bg-amber-50 p-4 rounded-lg border border-amber-100 mb-4 transition-all">
            <Label className="block text-sm font-bold text-stone-800 mb-1">
              N° de Facture <span className="text-amber-600 font-normal">(Auto-remplissage actif)</span>
            </Label>
            <div className="relative">
              <Input 
                value={formData.factureId || ''}
                onChange={handleFactureInput}
                list="factures-suggestions"
                required 
                className="uppercase font-bold text-lg bg-white border-amber-200 focus:ring-amber-500" 
                placeholder="Saisissez ou sélectionnez une facture"
              />
              <datalist id="factures-suggestions">
                {factures.map(f => (
                  <option key={f.id} value={f.id}>
                    {f.supplierId || f.supplier} - {f.arrivalDate}
                  </option>
                ))}
              </datalist>
            </div>
            {autofillVisible && (
              <div className="flex items-center gap-1 text-xs font-bold text-blue-600 mt-2 animate-pulse">
                <CheckCircle2 className="w-3 h-3" />
                Données pré-remplies par la facture !
              </div>
            )}
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-1">
              <Label>Fournisseur</Label>
              <Input 
                required 
                value={formData.supplierId || ''} 
                onChange={e => setFormData((prev: any) => ({ ...prev, supplierId: e.target.value }))}
                placeholder="Auto-rempli par la facture"
                className={autofillVisible ? "highlight-autofill" : ""}
              />
            </div>
            <div className="space-y-1">
              <Label>Catégorie</Label>
              <Input 
                required 
                value={formData.categoryId || ''} 
                onChange={e => setFormData((prev: any) => ({ ...prev, categoryId: e.target.value }))} 
                placeholder="Ex: Zipper No5" 
              />
            </div>
            <div className="space-y-1 md:col-span-2">
              <Label>Article</Label>
              <Input 
                required 
                value={formData.name || ''} 
                onChange={e => setFormData((prev: any) => ({ ...prev, name: e.target.value }))} 
                placeholder="Ex: NO.5 NYGURADE ZIPPER" 
              />
            </div>
            
            <div className="space-y-1 md:col-span-2 relative">
              <Label>Spécifications / Pack</Label>
              <div className="flex gap-2">
                <Input 
                  value={formData.specs || ''} 
                  onChange={e => setFormData((prev: any) => ({ ...prev, specs: e.target.value }))} 
                  placeholder="Ex: 12cm SEMI AUTO" 
                />
                <Button 
                  type="button" 
                  variant="outline" 
                  size="icon" 
                  onClick={handleSuggestSpecs} 
                  disabled={isSuggesting || !formData.categoryId || !formData.name}
                  title="Suggérer par IA"
                  className="shrink-0"
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
            <div className="grid grid-cols-2 gap-2">
              <div className="space-y-1">
                <Label>Date Commande</Label>
                <Input 
                  type="date" 
                  required 
                  value={formData.orderDate || ''} 
                  onChange={e => setFormData((prev: any) => ({ ...prev, orderDate: e.target.value }))} 
                />
              </div>
              <div className="space-y-1">
                <Label className="text-blue-700">Date Arrivée</Label>
                <Input 
                  type="date" 
                  required 
                  className={`bg-blue-50 border-blue-200 ${autofillVisible ? "highlight-autofill" : ""}`}
                  value={formData.arrivalDate || ''} 
                  onChange={e => setFormData((prev: any) => ({ ...prev, arrivalDate: e.target.value }))} 
                />
              </div>
            </div>

            <div className="grid grid-cols-3 gap-2 md:col-span-2">
              <div className="space-y-1">
                <Label>Quantité</Label>
                <Input 
                  type="number" 
                  required 
                  value={formData.quantity || 0} 
                  onChange={e => setFormData((prev: any) => ({ ...prev, quantity: parseFloat(e.target.value) || 0 }))} 
                />
              </div>
              <div className="space-y-1">
                <Label>Unité</Label>
                <Input 
                  required 
                  value={formData.unitOfMeasure || ''} 
                  onChange={e => setFormData((prev: any) => ({ ...prev, unitOfMeasure: e.target.value }))} 
                />
              </div>
              <div className="space-y-1">
                <Label className="text-emerald-700">Volume (CBM)</Label>
                <Input 
                  type="number" 
                  step="0.001" 
                  className="bg-emerald-50 border-emerald-200" 
                  required 
                  value={formData.cubicMeasurement || 0} 
                  onChange={e => setFormData((prev: any) => ({ ...prev, cubicMeasurement: parseFloat(e.target.value) || 0 }))} 
                />
              </div>
            </div>

            <div className="space-y-1 md:col-span-2">
              <Label>Prix (PA)</Label>
              <Input 
                type="number" 
                step="0.0001" 
                required 
                value={formData.purchasePricePerUnit || 0} 
                onChange={e => setFormData((prev: any) => ({ ...prev, purchasePricePerUnit: parseFloat(e.target.value) || 0 }))} 
                className="max-w-[200px]" 
              />
            </div>
          </div>
        </form>

        <DialogFooter className="border-t pt-4">
          <Button variant="outline" onClick={() => onOpenChange(false)}>Annuler</Button>
          <Button onClick={handleSubmit} className="bg-amber-600 hover:bg-amber-700 text-white font-bold">Enregistrer l'article</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
