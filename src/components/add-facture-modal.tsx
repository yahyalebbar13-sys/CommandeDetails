"use client";

import React, { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useUser, useFirestore } from '@/firebase';
import { doc, collection, serverTimestamp } from 'firebase/firestore';
import { useToast } from '@/hooks/use-toast';
import { setDocumentNonBlocking } from '@/firebase/non-blocking-updates';

interface AddFactureModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  factures: any[];
  editFacture?: any | null;
}

export default function AddFactureModal({ open, onOpenChange, editFacture }: AddFactureModalProps) {
  const { user } = useUser();
  const firestore = useFirestore();
  const { toast } = useToast();

  const [formData, setFormData] = useState<any>({
    id: '',
    arrivalDate: '',
    supplierId: '',
    freightCost: 0
  });

  useEffect(() => {
    if (editFacture) {
      setFormData({
        id: editFacture.id,
        arrivalDate: editFacture.arrivalDate,
        supplierId: editFacture.supplierId || editFacture.supplier || '',
        freightCost: editFacture.freightCost || editFacture.freight || 0
      });
    } else {
      setFormData({
        id: '',
        arrivalDate: new Date().toISOString().split('T')[0],
        supplierId: '',
        freightCost: 0
      });
    }
  }, [editFacture, open]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!user || !firestore || !formData.id) return;

    const factureId = formData.id.toUpperCase().trim();
    const facturesRef = collection(firestore, 'users', user.uid, 'factures');
    const docRef = doc(facturesRef, factureId);
    
    const factureData = {
      ...formData,
      id: factureId,
      updatedAt: serverTimestamp()
    };

    // Non-blocking write
    setDocumentNonBlocking(docRef, factureData, { merge: true });

    toast({ title: "Facture enregistrée !", description: `N° ${factureId}` });
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="text-xl font-bold text-stone-800">
            {editFacture ? 'Modifier Facture' : 'Déclarer Facture'}
          </DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4 py-4">
          <div className="space-y-1">
            <Label className="font-bold text-stone-800">N° de Facture / Conteneur</Label>
            <Input 
              value={formData.id}
              onChange={e => setFormData((prev: any) => ({ ...prev, id: e.target.value }))}
              required 
              disabled={!!editFacture}
              className="uppercase font-bold" 
              placeholder="Ex: INV-2026-001"
            />
            {!editFacture && <p className="text-[10px] text-stone-500 mt-1">Saisir un N° existant pour modifier ses détails.</p>}
          </div>

          <div className="space-y-1">
            <Label>Fournisseur (Optionnel)</Label>
            <Input 
              value={formData.supplierId}
              onChange={e => setFormData((prev: any) => ({ ...prev, supplierId: e.target.value }))}
              placeholder="Ex: MH"
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1">
              <Label className="text-blue-700 font-bold">Date Arrivée</Label>
              <Input 
                type="date"
                required
                className="bg-blue-50 border-blue-200"
                value={formData.arrivalDate}
                onChange={e => setFormData((prev: any) => ({ ...prev, arrivalDate: e.target.value }))}
              />
            </div>
            <div className="space-y-1">
              <Label className="text-red-600 font-bold">Fret / Transport</Label>
              <Input 
                type="number"
                step="0.01"
                className="bg-red-50 border-red-200"
                value={formData.freightCost}
                onChange={e => setFormData((prev: any) => ({ ...prev, freightCost: parseFloat(e.target.value) || 0 }))}
                placeholder="Ex: 1500"
              />
            </div>
          </div>
        </form>

        <DialogFooter className="border-t pt-4">
          <Button variant="outline" onClick={() => onOpenChange(false)}>Annuler</Button>
          <Button onClick={handleSubmit} className="bg-blue-600 hover:bg-blue-700 text-white font-bold">Enregistrer</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
