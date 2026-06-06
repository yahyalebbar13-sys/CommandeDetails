"use client";

import React, { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useUser, useFirestore } from '@/firebase';
import { doc, serverTimestamp, addDoc, collection } from 'firebase/firestore';
import { useToast } from '@/hooks/use-toast';
import { updateDocumentNonBlocking } from '@/firebase/non-blocking-updates';
import { Archive, Calendar, Save, DollarSign, AlertTriangle, Truck } from 'lucide-react';

interface PassToStockModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  facture: any;
  associatedArticles: any[];
  subCategories: any[];
}

export default function PassToStockModal({ open, onOpenChange, facture, associatedArticles, subCategories }: PassToStockModalProps) {
  const { user } = useUser();
  const firestore = useFirestore();
  const { toast } = useToast();

  const [formData, setFormData] = useState({
    stockEntryDate: '',
    invoicePaidDhs: 0,
    exchangeInvoiceAmount: 0,
    supplierInvoiceAmount: 0,
    additionalCostsAmount: 0
  });

  useEffect(() => {
    if (facture && open) {
      setFormData({
        stockEntryDate: facture.stockEntryDate || new Date().toISOString().split('T')[0],
        invoicePaidDhs: Number(facture.invoicePaidDhs) || 0,
        exchangeInvoiceAmount: Number(facture.exchangeInvoiceAmount) || 0,
        supplierInvoiceAmount: Number(facture.supplierInvoiceAmount) || 0,
        additionalCostsAmount: Number(facture.additionalCostsAmount) || 0
      });
    }
  }, [facture, open]);

  // Calcul automatique du total droits payés (DI+TPI+TVA) depuis les articles liés
  const calculatedDroitsPayes = React.useMemo(() => {
    if (!facture) return 0;
    const invoicePaidDhs = Number(facture.invoicePaidDhs) || 0;
    const declaredValue = Number(facture.declaredValue) || 0;
    const tauxChange = declaredValue > 0 ? invoicePaidDhs / declaredValue : 0;
    return (associatedArticles || []).reduce((total, a) => {
      const nw = Number(a.netWeight) || 0;
      const cat = (subCategories || []).find((c: any) => c.name === a.categoryId);
      if (!cat || cat.customsValuePerKg == null) return total;
      const customsValuePerKg = Number(cat.customsValuePerKg);
      const importDutyRate = cat.importDutyRate != null ? Number(cat.importDutyRate) / 100 : 0;
      const tpiRate = cat.tpiRate != null ? Number(cat.tpiRate) / 100 : 0;
      const tvaRate = cat.tvaRate != null ? Number(cat.tvaRate) / 100 : 0;
      const valDouane = nw * customsValuePerKg;
      const di = valDouane * importDutyRate;
      const tpi = valDouane * tpiRate;
      const tva = (valDouane + di + tpi) * tvaRate;
      return total + di + tpi + tva;
    }, 0);
  }, [facture, associatedArticles, subCategories]);

  // ── Calcul du coût de revient TTC unitaire MAD par article ──────────────────
  const computeCoutRevientMad = React.useCallback((article: any): number => {
    if (!facture || !article) return 0;

    const qty = Number(article.quantity) || 0;
    if (qty <= 0) return 0;

    // Taux de change réel depuis les données dossier
    const invoicePaidDhs = Number(formData.invoicePaidDhs) || 0;
    const declaredValue  = Number(facture.declaredValue) || 0;
    const tc = (invoicePaidDhs > 0 && declaredValue > 0)
      ? invoicePaidDhs / declaredValue
      : (Number(facture.exchangeRate) || Number(facture.tauxChange) || 10.5);

    // Achat FOB en MAD
    const prixUnitaire = Number(article.purchasePricePerUnit) || 0;
    const valeurFOB    = qty * prixUnitaire;
    const coutAchatMad = valeurFOB * tc;

    // Frais dossier réels (du formulaire)
    const fraisTransit = Number(formData.supplierInvoiceAmount) || 0;
    const fraisChange  = Number(formData.exchangeInvoiceAmount) || 0;
    const fraisSupp    = Number(formData.additionalCostsAmount) || 0;
    const totalFraisFixesHT = (fraisTransit + fraisChange + fraisSupp) / 1.20;

    // Fret dossier réel
    const fretTotal$ = Number(facture.freightCost) || Number(facture.freight) || 0;
    const totalFretMad = (fretTotal$ * tc) / 1.20;

    // CBM pour proratisation
    const cbmArticle = Number(article.cubicMeasurement) || 0;
    const cbmTotal = (associatedArticles || []).reduce((s: number, a: any) => s + (Number(a.cubicMeasurement) || 0), 0) || 68;

    const partFraisMad = (cbmArticle > 0 && cbmTotal > 0)
      ? (cbmArticle / cbmTotal) * totalFraisFixesHT : 0;
    const fretPartMad  = (cbmArticle > 0 && cbmTotal > 0)
      ? (cbmArticle / cbmTotal) * totalFretMad : 0;

    // Taxes douanières article
    const cat = (subCategories || []).find((c: any) => c.name === article.categoryId || c.id === article.categoryId);
    const importDutyRate = cat?.importDutyRate != null ? Number(cat.importDutyRate) / 100 : 0;
    const tpiRate        = cat?.tpiRate        != null ? Number(cat.tpiRate)        / 100 : 0;
    const ticRate        = cat?.ticRate        != null ? Number(cat.ticRate)        / 100 : 0;
    const tvaRate        = cat?.tvaRate        != null ? Number(cat.tvaRate)        / 100 : 0.20;

    const customsValuePerKg = Number(cat?.customsValuePerKg) || 0;
    const netWeight = Number(article.netWeight) || 0;

    let totalTaxesMad = 0;
    if (netWeight > 0 && customsValuePerKg > 0) {
      const valDouane = netWeight * customsValuePerKg;
      const di  = valDouane * importDutyRate;
      const tpi = valDouane * tpiRate;
      const tic = valDouane * ticRate;
      const tva = (valDouane + di + tpi) * tvaRate;
      totalTaxesMad = di + tpi + tic + tva;
    } else {
      // Fallback : base FOB en MAD
      const di$  = valeurFOB * importDutyRate;
      const tpi$ = valeurFOB * tpiRate;
      const tic$ = valeurFOB * ticRate;
      const tva$ = (valeurFOB + di$ + tpi$) * tvaRate;
      totalTaxesMad = (di$ + tpi$ + tic$ + tva$) * tc;
    }

    const coutTotalMad  = coutAchatMad + partFraisMad + fretPartMad + totalTaxesMad;
    const coutUniteMad  = coutTotalMad / qty;
    return Math.round(coutUniteMad * 100) / 100;
  }, [facture, formData, associatedArticles, subCategories]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!user || !firestore || !facture) return;

    onOpenChange(false);

    // Update Facture
    const factureRef = doc(firestore, 'users', user.uid, 'factures', facture.id);
    const updates = {
      stockEntryDate: formData.stockEntryDate,
      customsPaidDhs: calculatedDroitsPayes,
      invoicePaidDhs: formData.invoicePaidDhs,
      exchangeInvoiceAmount: formData.exchangeInvoiceAmount,
      supplierInvoiceAmount: formData.supplierInvoiceAmount,
      additionalCostsAmount: formData.additionalCostsAmount,
      updatedAt: serverTimestamp()
    };
    
    updateDocumentNonBlocking(factureRef, updates);

    // Propagate Stock Entry Date + coût de revient MAD à chaque article
    if (associatedArticles && associatedArticles.length > 0) {
      associatedArticles.forEach((article: any) => {
        const articleRef = doc(firestore, 'users', user.uid, 'articles', article.id);

        // Calcule le coût de revient TTC unitaire MAD pour cet article
        const purchasePriceMAD = computeCoutRevientMad(article);

        updateDocumentNonBlocking(articleRef, {
          stockEntryDate:   formData.stockEntryDate,
          purchasePriceMAD: purchasePriceMAD > 0 ? purchasePriceMAD : undefined,
        });

        // Créer un mouvement IN dans stockMovements automatiquement
        const parts: string[] = [];
        if (article.zipperType) parts.push(article.zipperType);
        if (article.slider)     parts.push(article.slider);
        const productName = parts.length > 0 ? parts.join(' ') : (article.name || article.specs || article.categoryId || 'Produit');

        const coutRevient = computeCoutRevientMad(article);
        addDoc(collection(firestore, 'users', user.uid, 'stockMovements'), {
          articleId:        article.id,
          categoryId:       article.categoryId,
          productName,
          color:            article.color || null,
          size:             article.size  || null,
          unitOfMeasure:    article.unitOfMeasure || 'unité',
          type:             'IN',
          reason:           'ARRIVAGE',
          quantity:         Number(article.quantity) || 0,
          date:             formData.stockEntryDate,
          factureId:        facture.id,
          factureRef:       facture.id,
          purchasePriceMAD: coutRevient > 0 ? coutRevient : null,
          notes:            `Arrivage ${facture.id}`,
          createdAt:        serverTimestamp(),
        }).catch(err => console.warn('[StockMovement] failed:', err));
      });
    }

    toast({ 
      title: "Entrée en stock validée", 
      description: `Dossier ${facture.id} transféré au stock avec succès.` 
    });
  };

  if (!facture) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-xl border-stone-200 overflow-hidden p-0 rounded-2xl">
        <div className="bg-emerald-600 p-6 flex items-center gap-3 text-white">
          <div className="p-2 bg-white/20 rounded-lg">
            <Archive className="w-6 h-6" />
          </div>
          <div>
            <DialogTitle className="text-xl font-black uppercase tracking-tight leading-none flex items-center gap-2">
              Entrée en Stock <span className="opacity-70">&bull; {facture.id}</span>
            </DialogTitle>
            <p className="text-[10px] font-bold text-emerald-200 uppercase tracking-widest mt-1">Saisie de clôture et valorisation</p>
          </div>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-5 max-h-[65vh] overflow-y-auto bg-white">
          <div className="space-y-1.5 focus-within:text-emerald-600">
            <Label className="text-[10px] font-black text-stone-500 uppercase tracking-widest flex items-center gap-1 transition-colors">
              <Calendar className="w-3 h-3" /> DATE D'ENTRÉE EN STOCK EFFECTIVE
            </Label>
            <Input 
              type="date"
              required
              className="border-stone-200 h-12 font-black text-lg bg-stone-50 rounded-xl focus:ring-emerald-500 focus:border-emerald-500"
              value={formData.stockEntryDate}
              onChange={e => setFormData(prev => ({ ...prev, stockEntryDate: e.target.value }))}
            />
          </div>

          <div className="pt-4 border-t border-stone-100">
            <h4 className="text-[11px] font-black text-stone-900 uppercase tracking-widest mb-4 flex items-center gap-2">
              <DollarSign className="w-4 h-4 text-emerald-500" /> Bilan Financier (MAD)
            </h4>
            
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label className="text-[10px] font-bold text-stone-500 uppercase tracking-wides">Facture Fournisseur</Label>
                <div className="relative">
                  <Input 
                    type="number" step="0.01" placeholder="0.00"
                    className="border-stone-200 h-11 font-bold pl-8 rounded-xl"
                    value={formData.supplierInvoiceAmount || ''}
                    onChange={e => setFormData(prev => ({ ...prev, supplierInvoiceAmount: parseFloat(e.target.value) || 0 }))}
                  />
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-stone-400 font-bold text-xs uppercase">MAD</span>
                </div>
              </div>

              <div className="space-y-1.5">
                <Label className="text-[10px] font-bold text-stone-500 uppercase tracking-widest">Facture d'Échange</Label>
                <div className="relative">
                  <Input 
                    type="number" step="0.01" placeholder="0.00"
                    className="border-stone-200 h-11 font-bold pl-8 rounded-xl"
                    value={formData.exchangeInvoiceAmount || ''}
                    onChange={e => setFormData(prev => ({ ...prev, exchangeInvoiceAmount: parseFloat(e.target.value) || 0 }))}
                  />
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-stone-400 font-bold text-xs uppercase">MAD</span>
                </div>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label className="text-[10px] font-bold text-stone-500 uppercase tracking-widest">Total Droits Douane</Label>
              <div className="h-11 rounded-xl border border-red-200 bg-red-50 flex items-center justify-between px-3">
                <span className="text-[9px] font-black text-red-400 uppercase tracking-widest">Σ DI + TPI + TVA (auto)</span>
                <span className="font-black text-red-600 text-sm">
                  {calculatedDroitsPayes.toLocaleString('fr-MA', { maximumFractionDigits: 0 })} MAD
                </span>
              </div>
            </div>

            <div className="space-y-1.5">
              <Label className="text-[10px] font-bold text-stone-500 uppercase tracking-widest flex items-center gap-1">
                <Truck className="w-3 h-3" /> Frais Supplémentaires
              </Label>
              <div className="relative">
                <Input 
                  type="number" step="0.01" placeholder="0.00"
                  className="border-stone-200 h-11 font-bold pl-8 rounded-xl"
                  value={formData.additionalCostsAmount || ''}
                  onChange={e => setFormData(prev => ({ ...prev, additionalCostsAmount: parseFloat(e.target.value) || 0 }))}
                />
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-stone-400 font-bold text-xs uppercase">MAD</span>
              </div>
            </div>
          </div>

          <div className="p-4 bg-emerald-50 rounded-xl border border-emerald-100 mt-2">
            <Label className="text-[11px] font-black text-emerald-800 uppercase tracking-widest mb-1.5 block">TOTAL PAYÉ (Dossier global)</Label>
            <div className="relative">
              <Input 
                type="number" step="0.01" placeholder="0.00"
                className="border-emerald-200 h-14 font-black text-xl text-emerald-900 bg-white pl-10 rounded-xl shadow-inner"
                value={formData.invoicePaidDhs || ''}
                onChange={e => setFormData(prev => ({ ...prev, invoicePaidDhs: parseFloat(e.target.value) || 0 }))}
              />
              <span className="absolute left-4 top-1/2 -translate-y-1/2 text-emerald-600 font-black text-sm uppercase">MAD</span>
            </div>
          </div>
          
          {associatedArticles && associatedArticles.length > 0 && (
            <div className="flex gap-3 items-center pt-2">
              <AlertTriangle className="w-4 h-4 text-emerald-500 shrink-0" />
              <p className="text-[9px] font-bold text-emerald-700 uppercase leading-tight">
                La date d'entrée en stock sera appliquée aux {associatedArticles.length} articles de cet arrivage ("Inventaire Réceptionné").
              </p>
            </div>
          )}
        </form>

        <DialogFooter className="p-6 bg-stone-50 border-t border-stone-100 flex flex-row gap-3">
          <Button variant="ghost" onClick={() => onOpenChange(false)} className="flex-1 text-[10px] font-black uppercase tracking-widest h-11 hover:bg-stone-200">Annuler</Button>
          <Button onClick={handleSubmit} className="flex-[2] bg-emerald-600 hover:bg-emerald-700 text-white font-black uppercase text-[10px] tracking-widest h-11 rounded-xl gap-2 shadow-lg shadow-emerald-600/20">
            <Save className="w-4 h-4" /> Finaliser l'Entrée
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
