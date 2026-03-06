"use client";

import React, { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useUser, useFirestore } from '@/firebase';
import { doc, collection, serverTimestamp } from 'firebase/firestore';
import { useToast } from '@/hooks/use-toast';
import { setDocumentNonBlocking, updateDocumentNonBlocking } from '@/firebase/non-blocking-updates';
import { FileText, Calendar, Truck, Save } from 'lucide-react';

interface AddFactureModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  factures: any[];
  editFacture?: any | null;
  associatedArticles?: any[];
}

export default function AddFactureModal({ open, onOpenChange, editFacture, associatedArticles }: AddFactureModalProps) {
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
        id: editFacture.id || '',
        arrivalDate: editFacture.arrivalDate || new Date().toISOString().split('T')[0],
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

    // Non-blocking write for the facture
    setDocumentNonBlocking(docRef, factureData, { merge: true });

    // PROPAGATION: If the arrival date has changed for an existing facture, update all linked articles
    if (editFacture && formData.arrivalDate !== editFacture.arrivalDate && associatedArticles && associatedArticles.length > 0) {
      associatedArticles.forEach((article: any) => {
        const articleRef = doc(firestore, 'users', user.uid, 'articles', article.id);
        updateDocumentNonBlocking(articleRef, { arrivalDate: formData.arrivalDate });
      });
      toast({ 
        title: "Dossier mis à jour", 
        description: `N° ${factureId} - Date propagée à ${associatedArticles.length} articles.` 
      });
    } else {
      toast({ title: "Facture enregistrée", description: `Dossier ${factureId} activé.` });
    }

    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md border-stone-200">
        <DialogHeader>
          <DialogTitle className="text-lg font-black text-stone-900 uppercase tracking-tighter flex items-center gap-2">
            <FileText className="w-5 h-5 text-stone-400" />
            {editFacture?.isOrphaned ? 'Régulariser Facture' : (editFacture ? 'Modifier Dossier' : 'Déclaration d\'Arrivage')}
          </DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-6 py-4">
          <div className="space-y-1.5">
            <Label className="text-[10px] font-black text-stone-400 uppercase tracking-widest">N° de Facture / Conteneur</Label>
            <Input 
              value={formData.id}
              onChange={e => setFormData((prev: any) => ({ ...prev, id: e.target.value }))}
              required 
              disabled={!!editFacture && !editFacture.isOrphaned}
              className="uppercase font-black border-stone-200 h-11" 
              placeholder="EX: INV-2026-001"
            />
          </div>

          <div className="space-y-1.5">
            <Label className="text-[10px] font-black text-stone-400 uppercase tracking-widest">Fournisseur</Label>
            <Input 
              value={formData.supplierId}
              onChange={e => setFormData((prev: any) => ({ ...prev, supplierId: e.target.value }))}
              placeholder="Ex: MH, JIMMY..."
              className="font-bold border-stone-200 h-11"
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label className="text-[10px] font-black text-stone-400 uppercase tracking-widest flex items-center gap-1">
                <Calendar className="w-3 h-3" /> Arrivée
              </Label>
              <Input 
                type="date"
                required
                className="border-stone-200 h-11 font-bold"
                value={formData.arrivalDate}
                onChange={e => setFormData((prev: any) => ({ ...prev, arrivalDate: e.target.value }))}
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-[10px] font-black text-stone-400 uppercase tracking-widest flex items-center gap-1">
                <Truck className="w-3 h-3" /> Fret (€)
              </Label>
              <Input 
                type="number"
                step="0.01"
                className="border-stone-200 h-11 font-bold"
                value={formData.freightCost}
                onChange={e => setFormData((prev: any) => ({ ...prev, freightCost: parseFloat(e.target.value) || 0 }))}
                placeholder="0.00"
              />
            </div>
          </div>
          
          {associatedArticles && associatedArticles.length > 0 && (
            <div className="p-3 bg-stone-50 rounded-lg border border-stone-100">
              <p className="text-[9px] font-bold text-stone-500 uppercase leading-tight">
                Attention : Modifier la date mettra à jour {associatedArticles.length} articles déjà liés à ce numéro.
              </p>
            </div>
          )}
        </form>

        <DialogFooter className="border-t pt-4">
          <Button variant="ghost" onClick={() => onOpenChange(false)} className="text-[10px] font-black uppercase tracking-widest">Annuler</Button>
          <Button onClick={handleSubmit} className="bg-stone-900 hover:bg-black text-white font-black uppercase text-[10px] tracking-widest px-8 h-11 rounded-lg gap-2">
            <Save className="w-4 h-4" /> Enregistrer le dossier
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
