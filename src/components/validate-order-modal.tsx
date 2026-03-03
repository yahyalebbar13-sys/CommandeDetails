
"use client";

import React, { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useUser, useFirestore } from '@/firebase';
import { doc, collection, serverTimestamp } from 'firebase/firestore';
import { useToast } from '@/hooks/use-toast';
import { updateDocumentNonBlocking } from '@/firebase/non-blocking-updates';
import { Ship, CalendarDays, CheckCircle2 } from 'lucide-react';

interface ValidateOrderModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  order: any | null;
  factures: any[];
}

export default function ValidateOrderModal({ open, onOpenChange, order, factures }: ValidateOrderModalProps) {
  const { user } = useUser();
  const firestore = useFirestore();
  const { toast } = useToast();

  const [formData, setFormData] = useState({
    factureId: '',
    arrivalDate: ''
  });
  const [autofillVisible, setAutofillVisible] = useState(false);

  useEffect(() => {
    if (open) {
      setFormData({ factureId: '', arrivalDate: '' });
      setAutofillVisible(false);
    }
  }, [open]);

  const handleFactureInput = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value.toUpperCase();
    setFormData(prev => ({ ...prev, factureId: val }));
    
    const knownFacture = factures.find(f => f.id === val);
    if (knownFacture) {
      setFormData(prev => ({ ...prev, arrivalDate: knownFacture.arrivalDate }));
      setAutofillVisible(true);
      setTimeout(() => setAutofillVisible(false), 3000);
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!user || !firestore || !order || !formData.factureId || !formData.arrivalDate) return;

    const docRef = doc(firestore, 'users', user.uid, 'articles', order.id);
    
    updateDocumentNonBlocking(docRef, {
      factureId: formData.factureId,
      arrivalDate: formData.arrivalDate,
      status: 'SHIPPED', // Move to Shipped status
      validatedAt: serverTimestamp()
    });

    toast({ 
      title: "Commande validée !", 
      description: `L'article ${order.name} est maintenant associé à la facture ${formData.factureId}.` 
    });
    
    onOpenChange(false);
  };

  if (!order) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="text-xl font-bold text-blue-700 flex items-center gap-2">
            <Ship className="w-6 h-6" /> Validation d'Expédition
          </DialogTitle>
          <DialogDescription className="text-stone-500">
            Assignez un numéro de facture et une date d'arrivée pour confirmer l'envoi de cette commande.
          </DialogDescription>
        </DialogHeader>

        <div className="bg-stone-50 p-4 rounded-lg border border-stone-200 mb-2">
          <div className="text-[10px] text-stone-500 uppercase font-bold mb-1">Article en cours</div>
          <div className="font-bold text-stone-800">{order.name}</div>
          <div className="text-sm text-stone-600">{order.quantity.toLocaleString()} {order.unitOfMeasure} • {order.supplierId}</div>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4 py-4">
          <div className="space-y-1">
            <Label className="font-bold text-stone-800">N° de Facture / Conteneur</Label>
            <div className="relative">
              <Input 
                value={formData.factureId}
                onChange={handleFactureInput}
                list="val-factures-suggestions"
                required 
                autoFocus
                className="uppercase font-bold border-blue-200 focus:ring-blue-500" 
                placeholder="Ex: 26HD1004"
              />
              <datalist id="val-factures-suggestions">
                {factures.map(f => (
                  <option key={f.id} value={f.id}>{f.arrivalDate}</option>
                ))}
              </datalist>
            </div>
            {autofillVisible && (
              <div className="flex items-center gap-1 text-xs font-bold text-emerald-600 mt-2 animate-pulse">
                <CheckCircle2 className="w-3 h-3" />
                Date récupérée de la facture !
              </div>
            )}
          </div>

          <div className="space-y-1">
            <Label className="text-blue-700 font-bold flex items-center gap-1">
              <CalendarDays className="w-4 h-4" /> Date d'Arrivée prévue
            </Label>
            <Input 
              type="date"
              required
              className={`bg-blue-50 border-blue-200 font-bold ${autofillVisible ? "highlight-autofill" : ""}`}
              value={formData.arrivalDate}
              onChange={e => setFormData(prev => ({ ...prev, arrivalDate: e.target.value }))}
            />
          </div>
        </form>

        <DialogFooter className="border-t pt-4">
          <Button variant="outline" onClick={() => onOpenChange(false)}>Annuler</Button>
          <Button onClick={handleSubmit} className="bg-blue-600 hover:bg-blue-700 text-white font-bold">Confirmer l'expédition</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
