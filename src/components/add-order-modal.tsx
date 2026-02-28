"use client";

import React, { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Facture, Order } from '@/lib/types';
import { Sparkles, Loader2 } from 'lucide-react';
import { suggestArticleSpecifications } from '@/ai/flows/suggest-article-specifications-flow';

interface AddOrderModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  factures: Facture[];
  onAdd: (order: Order) => void;
}

export default function AddOrderModal({ open, onOpenChange, factures, onAdd }: AddOrderModalProps) {
  const [formData, setFormData] = useState<Partial<Order>>({
    orderDate: new Date().toISOString().split('T')[0],
    arrivalDate: '',
    qty: 0,
    pa: 0,
    cbm: 0,
    unit: 'pcs'
  });
  const [isSuggesting, setIsSuggesting] = useState(false);
  const [autofillVisible, setAutofillVisible] = useState(false);

  const handleFactureInput = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value.toUpperCase();
    setFormData(prev => ({ ...prev, facture: val }));
    
    const knownFacture = factures.find(f => f.id === val);
    if (knownFacture) {
      setFormData(prev => ({
        ...prev,
        arrivalDate: knownFacture.arrivalDate,
        supplier: knownFacture.supplier
      }));
      setAutofillVisible(true);
      setTimeout(() => setAutofillVisible(false), 3000);
    }
  };

  const handleSuggestSpecs = async () => {
    if (!formData.category || !formData.article) return;
    setIsSuggesting(true);
    try {
      const result = await suggestArticleSpecifications({
        category: formData.category,
        article: formData.article
      });
      setFormData(prev => ({ ...prev, specs: result.specs }));
    } catch (err) {
      console.error(err);
    } finally {
      setIsSuggesting(false);
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (formData.category && formData.article && formData.supplier && formData.facture) {
      onAdd(formData as Order);
      onOpenChange(false);
      setFormData({
        orderDate: new Date().toISOString().split('T')[0],
        arrivalDate: '',
        qty: 0,
        pa: 0,
        cbm: 0,
        unit: 'pcs'
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
          <div className="bg-stone-50 p-4 rounded-lg border border-stone-200 mb-4">
            <Label className="block text-sm font-bold text-stone-800 mb-1">
              N° de Facture <span className="text-stone-500 font-normal">(Auto-remplissage actif)</span>
            </Label>
            <Input 
              value={formData.facture || ''}
              onChange={handleFactureInput}
              required 
              className="uppercase font-bold text-lg" 
              placeholder="Ex: 25MH114285"
            />
            {autofillVisible && (
              <p className="text-xs font-bold text-blue-600 mt-1 animate-pulse">Données pré-remplies par la facture !</p>
            )}
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-1">
              <Label>Fournisseur</Label>
              <Input required value={formData.supplier || ''} onChange={e => setFormData(prev => ({ ...prev, supplier: e.target.value }))} />
            </div>
            <div className="space-y-1">
              <Label>Catégorie</Label>
              <Input required value={formData.category || ''} onChange={e => setFormData(prev => ({ ...prev, category: e.target.value }))} placeholder="Ex: Zipper No5" />
            </div>
            <div className="space-y-1 md:col-span-2">
              <Label>Article</Label>
              <Input required value={formData.article || ''} onChange={e => setFormData(prev => ({ ...prev, article: e.target.value }))} placeholder="Ex: NO.5 NYGURADE ZIPPER" />
            </div>
            
            <div className="space-y-1 md:col-span-2 relative">
              <Label>Spécifications / Pack</Label>
              <div className="flex gap-2">
                <Input value={formData.specs || ''} onChange={e => setFormData(prev => ({ ...prev, specs: e.target.value }))} placeholder="Ex: 12cm SEMI AUTO" />
                <Button 
                  type="button" 
                  variant="outline" 
                  size="icon" 
                  onClick={handleSuggestSpecs} 
                  disabled={isSuggesting || !formData.category || !formData.article}
                  title="Suggérer par IA"
                  className="shrink-0"
                >
                  {isSuggesting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4 text-amber-500" />}
                </Button>
              </div>
            </div>

            <div className="space-y-1">
              <Label>Couleur</Label>
              <Input value={formData.color || ''} onChange={e => setFormData(prev => ({ ...prev, color: e.target.value }))} />
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div className="space-y-1">
                <Label>Date Commande</Label>
                <Input type="date" required value={formData.orderDate || ''} onChange={e => setFormData(prev => ({ ...prev, orderDate: e.target.value }))} />
              </div>
              <div className="space-y-1">
                <Label className="text-blue-700">Date Arrivée</Label>
                <Input type="date" required className="bg-blue-50 border-blue-200" value={formData.arrivalDate || ''} onChange={e => setFormData(prev => ({ ...prev, arrivalDate: e.target.value }))} />
              </div>
            </div>

            <div className="grid grid-cols-3 gap-2 md:col-span-2">
              <div className="space-y-1">
                <Label>Quantité</Label>
                <Input type="number" required value={formData.qty || 0} onChange={e => setFormData(prev => ({ ...prev, qty: parseFloat(e.target.value) || 0 }))} />
              </div>
              <div className="space-y-1">
                <Label>Unité</Label>
                <Input required value={formData.unit || ''} onChange={e => setFormData(prev => ({ ...prev, unit: e.target.value }))} />
              </div>
              <div className="space-y-1">
                <Label className="text-emerald-700">Volume (CBM)</Label>
                <Input type="number" step="0.001" className="bg-emerald-50 border-emerald-200" required value={formData.cbm || 0} onChange={e => setFormData(prev => ({ ...prev, cbm: parseFloat(e.target.value) || 0 }))} />
              </div>
            </div>

            <div className="space-y-1 md:col-span-2">
              <Label>Prix (PA)</Label>
              <Input type="number" step="0.0001" required value={formData.pa || 0} onChange={e => setFormData(prev => ({ ...prev, pa: parseFloat(e.target.value) || 0 }))} className="max-w-[200px]" />
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