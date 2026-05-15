
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
import { sendStatusNotification } from '@/lib/send-status-notification';
import { Ship, CalendarDays, CheckCircle2, Loader2 } from 'lucide-react';

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
  const [isSending, setIsSending] = useState(false);

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

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user || !firestore || !order || !formData.factureId || !formData.arrivalDate) return;

    setIsSending(true);

    const docRef = doc(firestore, 'users', user.uid, 'articles', order.id);
    
    updateDocumentNonBlocking(docRef, {
      factureId: formData.factureId,
      arrivalDate: formData.arrivalDate,
      status: 'SHIPPED',
      validatedAt: serverTimestamp()
    });

    toast({ 
      title: "Commande expédiée !", 
      description: `L'article ${order.name} est associé à la facture ${formData.factureId}.` 
    });

    // ── Send notification if article has a clientName ──
    const clientName = (order.clientName || '').trim();
    if (clientName && order.isPreorder) {
      toast({ title: '📧 Envoi en cours...', description: `Notification client → ${clientName}` });
      
      let transitDuration: string | undefined;
      const transitArrivalDate = formData.arrivalDate;
      if (transitArrivalDate) {
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        const eta = new Date(transitArrivalDate);
        eta.setHours(0, 0, 0, 0);
        const diffMs = eta.getTime() - today.getTime();
        const diffDays = Math.round(diffMs / (1000 * 60 * 60 * 24));
        if (diffDays > 0) {
          transitDuration = diffDays === 1 ? '1 jour' : `${diffDays} jours`;
        } else if (diffDays === 0) {
          transitDuration = "aujourd'hui";
        }
      }

      const result = await sendStatusNotification({
        firestore,
        adminUid: user.uid,
        clientName,
        articleName: order.categoryId || order.name,
        oldStatus: 'PI',
        newStatus: 'SHIPPED',
        quantity: order.quantity,
        unitOfMeasure: order.unitOfMeasure,
        specs: order.specs,
        color: order.color,
        size: order.size,
        estimatedProductionDelay: order.estimatedProductionDelay,
        imageUrl: order.imageUrl || undefined,
        transitArrivalDate,
        transitDuration,
      });
      if (result.ok) {
        toast({ title: '✅ Notification envoyée', description: `Email envoyé à ${result.email}` });
      } else if (result.error) {
        toast({ title: '⚠️ Erreur notification', description: result.error, variant: 'destructive' });
      }
    }

    setIsSending(false);
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
            Assignez un numéro de facture et une date d'arrivée pour confirmer l'expédition.
          </DialogDescription>
        </DialogHeader>

        <div className="bg-stone-50 p-4 rounded-lg border border-stone-200 mb-2">
          <div className="text-[10px] text-stone-500 uppercase font-bold mb-1">Article en cours</div>
          <div className="font-bold text-stone-800">{order.name}</div>
          <div className="text-sm text-stone-600">{order.quantity?.toLocaleString()} {order.unitOfMeasure} • {order.supplierId}</div>
          {order.isPreorder && order.clientName && (
            <div className="mt-1 text-[11px] font-black text-indigo-600 bg-indigo-50 border border-indigo-100 rounded-lg px-2 py-1 inline-flex items-center gap-1">
              📧 Notification client : {order.clientName}
            </div>
          )}
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
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>Annuler</Button>
          <Button
            type="button"
            onClick={handleSubmit}
            disabled={isSending || !formData.factureId || !formData.arrivalDate}
            className="bg-blue-600 hover:bg-blue-700 text-white font-bold gap-2"
          >
            {isSending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Ship className="w-4 h-4" />}
            Confirmer l'expédition
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
