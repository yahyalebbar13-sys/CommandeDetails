"use client";

import React, { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useUser, useFirestore } from '@/firebase';
import { doc, collection, serverTimestamp } from 'firebase/firestore';
import { useToast } from '@/hooks/use-toast';
import { setDocumentNonBlocking, updateDocumentNonBlocking } from '@/firebase/non-blocking-updates';
import { FileText, Calendar, Truck, Save, AlertTriangle, Hash, Ship, DollarSign, Building2 } from 'lucide-react';

interface AddFactureModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  factures: any[];
  editFacture?: any | null;
  associatedArticles?: any[];
}

const COMPANIES = ["New fournitures", "Lebtex", "Robe in box"];

export default function AddFactureModal({ open, onOpenChange, editFacture, associatedArticles }: AddFactureModalProps) {
  const { user } = useUser();
  const firestore = useFirestore();
  const { toast } = useToast();

  const [formData, setFormData] = useState<any>({
    id: '',
    noBL: '',
    arrivalDate: '',
    shippingDate: '',
    shippingLine: '',
    supplierId: '',
    declaringCompany: '',
    freightCost: 0,
    declaredValue: 0
  });

  useEffect(() => {
    if (editFacture) {
      setFormData({
        id: editFacture.id || '',
        noBL: editFacture.noBL || '',
        arrivalDate: editFacture.arrivalDate || new Date().toISOString().split('T')[0],
        shippingDate: editFacture.shippingDate || '',
        shippingLine: editFacture.shippingLine || '',
        supplierId: editFacture.supplierId || editFacture.supplier || '',
        declaringCompany: editFacture.declaringCompany || '',
        freightCost: Number(editFacture.freightCost) || Number(editFacture.freight) || 0,
        declaredValue: Number(editFacture.declaredValue) || 0
      });
    } else {
      setFormData({
        id: '',
        noBL: '',
        arrivalDate: new Date().toISOString().split('T')[0],
        shippingDate: '',
        shippingLine: '',
        supplierId: '',
        declaringCompany: '',
        freightCost: 0,
        declaredValue: 0
      });
    }
  }, [editFacture, open]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onOpenChange(false);
    if (!user || !firestore || !formData.id) return;

    const factureId = formData.id.toUpperCase().trim();
    const facturesRef = collection(firestore, 'users', user.uid, 'factures');
    const docRef = doc(facturesRef, factureId);
    
    const factureData = {
      ...formData,
      id: factureId,
      noBL: formData.noBL.toUpperCase().trim(),
      shippingLine: formData.shippingLine.toUpperCase().trim(),
      updatedAt: serverTimestamp()
    };

    setDocumentNonBlocking(docRef, factureData, { merge: true });

    if (editFacture && formData.arrivalDate !== editFacture.arrivalDate && associatedArticles && associatedArticles.length > 0) {
      associatedArticles.forEach((article: any) => {
        const articleRef = doc(firestore, 'users', user.uid, 'articles', article.id);
        updateDocumentNonBlocking(articleRef, { arrivalDate: formData.arrivalDate });
      });
      toast({ 
        title: "Dossier et articles synchronisés", 
        description: `Date propagée à ${associatedArticles.length} articles liés.` 
      });
    } else {
      toast({ 
        title: editFacture?.isOrphaned ? "Dossier régularisé" : "Facture enregistrée", 
        description: `Référence ${factureId} activée.` 
      });
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-xl border-stone-200 overflow-hidden p-0 rounded-2xl">
        <div className="bg-stone-900 p-6 flex items-center gap-3 text-white">
          <div className="p-2 bg-white/10 rounded-lg">
            <FileText className="w-6 h-6" />
          </div>
          <div>
            <DialogTitle className="text-xl font-black uppercase tracking-tight leading-none">
              {editFacture?.isOrphaned ? 'Régulariser Arrivage' : (editFacture ? 'Modifier Dossier' : 'Nouveau Dossier')}
            </DialogTitle>
            <p className="text-[10px] font-bold text-stone-400 uppercase tracking-widest mt-1">Configuration transport et douane</p>
          </div>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-5">
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label className="text-[10px] font-black text-stone-400 uppercase tracking-widest">N° FACTURE / CONTENEUR</Label>
              <Input 
                value={formData.id}
                onChange={e => setFormData((prev: any) => ({ ...prev, id: e.target.value }))}
                required 
                disabled={!!editFacture && !editFacture.isOrphaned}
                className="uppercase font-black border-stone-200 h-11 rounded-xl focus:ring-stone-900" 
                placeholder="EX: 26HD1004"
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-[10px] font-black text-stone-400 uppercase tracking-widest flex items-center gap-1">
                <Hash className="w-3 h-3" /> N° BL
              </Label>
              <Input 
                value={formData.noBL}
                onChange={e => setFormData((prev: any) => ({ ...prev, noBL: e.target.value }))}
                className="uppercase font-black border-stone-200 h-11 rounded-xl focus:ring-stone-900" 
                placeholder="EX: COSU63..."
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label className="text-[10px] font-black text-stone-400 uppercase tracking-widest">FOURNISSEUR</Label>
              <Input 
                value={formData.supplierId}
                onChange={e => setFormData((prev: any) => ({ ...prev, supplierId: e.target.value.toUpperCase() }))}
                placeholder="EX: MH, JIMMY..."
                className="font-bold border-stone-200 h-11 rounded-xl uppercase"
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-[10px] font-black text-stone-400 uppercase tracking-widest flex items-center gap-1">
                <Building2 className="w-3 h-3" /> SOCIÉTÉ DÉCLARANTE
              </Label>
              <Select 
                value={formData.declaringCompany} 
                onValueChange={v => setFormData((prev: any) => ({ ...prev, declaringCompany: v }))}
              >
                <SelectTrigger className="h-11 border-stone-200 bg-white font-bold rounded-xl">
                  <SelectValue placeholder="Choisir la société..." />
                </SelectTrigger>
                <SelectContent>
                  {COMPANIES.map(company => (
                    <SelectItem key={company} value={company} className="font-bold">{company}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label className="text-[10px] font-black text-stone-400 uppercase tracking-widest flex items-center gap-1">
                <Ship className="w-3 h-3" /> COMPAGNIE MARITIME
              </Label>
              <Input 
                value={formData.shippingLine}
                onChange={e => setFormData((prev: any) => ({ ...prev, shippingLine: e.target.value }))}
                placeholder="EX: MSC, MAERSK..."
                className="font-bold border-stone-200 h-11 rounded-xl uppercase"
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-[10px] font-black text-stone-400 uppercase tracking-widest flex items-center gap-1">
                <Calendar className="w-3 h-3" /> DATE D'EXPÉDITION (ETD)
              </Label>
              <Input 
                type="date"
                className="border-stone-200 h-11 font-bold rounded-xl"
                value={formData.shippingDate}
                onChange={e => setFormData((prev: any) => ({ ...prev, shippingDate: e.target.value }))}
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label className="text-[10px] font-black text-stone-400 uppercase tracking-widest flex items-center gap-1">
                <Calendar className="w-3 h-3" /> DATE D'ARRIVÉE (ETA)
              </Label>
              <Input 
                type="date"
                required
                className="border-stone-200 h-11 font-bold rounded-xl"
                value={formData.arrivalDate}
                onChange={e => setFormData((prev: any) => ({ ...prev, arrivalDate: e.target.value }))}
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-[10px] font-black text-stone-400 uppercase tracking-widest flex items-center gap-1">
                <Truck className="w-3 h-3" /> FRAIS DE FRET ($)
              </Label>
              <Input 
                type="number"
                step="0.01"
                className="border-stone-200 h-11 font-black text-stone-900 rounded-xl"
                value={formData.freightCost}
                onChange={e => setFormData((prev: any) => ({ ...prev, freightCost: parseFloat(e.target.value) || 0 }))}
                placeholder="0.00"
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <Label className="text-[10px] font-black text-stone-400 uppercase tracking-widest flex items-center gap-1">
              <DollarSign className="w-3 h-3" /> VRAIE VALEUR DÉCLARÉE EN DOUANE ($)
            </Label>
            <Input 
              type="number"
              step="0.01"
              className="border-stone-200 h-11 font-black text-amber-600 rounded-xl"
              value={formData.declaredValue}
              onChange={e => setFormData((prev: any) => ({ ...prev, declaredValue: parseFloat(e.target.value) || 0 }))}
              placeholder="0.00"
            />
          </div>
          
          {associatedArticles && associatedArticles.length > 0 && (
            <div className="p-3 bg-amber-50 rounded-xl border border-amber-100 flex gap-3">
              <AlertTriangle className="w-4 h-4 text-amber-500 shrink-0" />
              <div>
                <p className="text-[10px] font-black text-amber-800 uppercase tracking-tight">Propagation Automatique</p>
                <p className="text-[9px] font-bold text-amber-600 uppercase leading-tight mt-0.5">
                  La modification de la date d'arrivée impactera {associatedArticles.length} articles déjà liés.
                </p>
              </div>
            </div>
          )}
        </form>

        <DialogFooter className="p-6 bg-stone-50 border-t border-stone-100 flex flex-row gap-3">
          <Button variant="ghost" onClick={() => onOpenChange(false)} className="flex-1 text-[10px] font-black uppercase tracking-widest h-11">Annuler</Button>
          <Button onClick={handleSubmit} className="flex-[2] bg-stone-900 hover:bg-black text-white font-black uppercase text-[10px] tracking-widest h-11 rounded-xl gap-2 shadow-lg shadow-stone-200">
            <Save className="w-4 h-4" /> Enregistrer le dossier
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
