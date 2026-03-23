"use client";

import React, { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useUser, useFirestore } from '@/firebase';
import { doc, serverTimestamp } from 'firebase/firestore';
import { useToast } from '@/hooks/use-toast';
import { updateDocumentNonBlocking } from '@/firebase/non-blocking-updates';
import { ShoppingCart, Calendar, Factory, Banknote, Cuboid, Scale } from 'lucide-react';

interface LaunchOrderModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  article: any | null;
}

export default function LaunchOrderModal({ open, onOpenChange, article }: LaunchOrderModalProps) {
  const { user } = useUser();
  const firestore = useFirestore();
  const { toast } = useToast();

  const [formData, setFormData] = useState({
    supplierId: '',
    orderDate: new Date().toISOString().split('T')[0],
    cubicMeasurement: 0,
    netWeight: 0,
    purchasePricePerUnit: 0
  });

  useEffect(() => {
    if (open) {
      setFormData({
        supplierId: '',
        orderDate: new Date().toISOString().split('T')[0],
        cubicMeasurement: 0,
        netWeight: 0,
        purchasePricePerUnit: 0
      });
    }
  }, [open]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!user || !firestore || !article || !formData.supplierId || !formData.orderDate) return;

    const docRef = doc(firestore, 'users', user.uid, 'articles', article.id);
    
    updateDocumentNonBlocking(docRef, {
      ...formData,
      status: 'PI', // Move to Production
      launchedAt: serverTimestamp()
    });

    toast({ 
      title: "Commande Lancée !", 
      description: `L'article ${article.name} est maintenant en production (PI).` 
    });
    
    onOpenChange(false);
  };

  if (!article) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="text-xl font-bold text-stone-800 flex items-center gap-2">
            <ShoppingCart className="w-6 h-6" /> Passer la Commande
          </DialogTitle>
          <DialogDescription>
            Complétez les informations pour transformer ce rappel en commande officielle (PI).
          </DialogDescription>
        </DialogHeader>

        <div className="bg-stone-50 p-4 rounded-lg border border-stone-200 mb-2">
          <div className="text-[10px] text-stone-500 uppercase font-bold mb-1">Besoin identifié</div>
          <div className="font-bold text-stone-800">{article.name}</div>
          <div className="text-sm text-stone-600">{article.quantity.toLocaleString()} {article.unitOfMeasure} • {article.categoryId}</div>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4 py-4">
          <div className="space-y-1">
            <Label className="font-bold flex items-center gap-1">
              <Factory className="w-4 h-4 text-stone-400" /> Fournisseur
            </Label>
            <Input 
              required 
              value={formData.supplierId}
              onChange={e => setFormData(p => ({ ...p, supplierId: e.target.value }))}
              placeholder="Ex: MH"
              autoFocus
            />
          </div>

          <div className="space-y-1">
            <Label className="font-bold flex items-center gap-1">
              <Calendar className="w-4 h-4 text-stone-400" /> Date de Commande
            </Label>
            <Input 
              type="date"
              required
              value={formData.orderDate}
              onChange={e => setFormData(p => ({ ...p, orderDate: e.target.value }))}
            />
          </div>

          <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
            <div className="space-y-1">
              <Label className="font-bold flex items-center gap-1">
                <Cuboid className="w-4 h-4 text-emerald-500" /> Volume (CBM)
              </Label>
              <Input 
                type="number"
                step="0.001"
                required
                className="bg-emerald-50 border-emerald-200"
                value={formData.cubicMeasurement}
                onChange={e => setFormData(p => ({ ...p, cubicMeasurement: parseFloat(e.target.value) || 0 }))}
              />
            </div>
            <div className="space-y-1">
              <Label className="font-bold flex items-center gap-1">
                <Scale className="w-4 h-4 text-blue-500" /> N.W (kg)
              </Label>
              <Input 
                type="number"
                step="0.01"
                className="bg-blue-50 border-blue-200"
                value={formData.netWeight}
                onChange={e => setFormData(p => ({ ...p, netWeight: parseFloat(e.target.value) || 0 }))}
              />
            </div>
            <div className="space-y-1">
              <Label className="font-bold flex items-center gap-1">
                <Banknote className="w-4 h-4 text-amber-500" /> Prix (PA)
              </Label>
              <Input 
                type="number"
                step="0.0001"
                required
                className="bg-amber-50 border-amber-200"
                value={formData.purchasePricePerUnit}
                onChange={e => setFormData(p => ({ ...p, purchasePricePerUnit: parseFloat(e.target.value) || 0 }))}
              />
            </div>
          </div>
        </form>

        <DialogFooter className="border-t pt-4">
          <Button variant="outline" onClick={() => onOpenChange(false)}>Annuler</Button>
          <Button onClick={handleSubmit} className="bg-amber-600 hover:bg-amber-700 text-white font-bold">Lancer la Commande (PI)</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}