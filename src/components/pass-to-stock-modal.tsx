"use client";

import React, { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useUser, useFirestore, useCollection, useMemoFirebase } from '@/firebase';
import { doc, serverTimestamp, addDoc, collection, updateDoc, setDoc, query, where, getDocs, deleteDoc } from 'firebase/firestore';
import { useToast } from '@/hooks/use-toast';
import { cleanUndefined } from '@/lib/utils';
import { Archive, Calendar, Save, DollarSign, AlertTriangle, Truck, Loader2, Building2 } from 'lucide-react';

interface PassToStockModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  facture: any;
  associatedArticles: any[];
  subCategories: any[];
  stores?: any[];
  adminUid?: string | null;
  existingMovements?: any[];
}

export default function PassToStockModal({
  open,
  onOpenChange,
  facture,
  associatedArticles,
  subCategories,
  stores,
  adminUid,
  existingMovements
}: PassToStockModalProps) {
  const { user } = useUser();
  const firestore = useFirestore();
  const { toast } = useToast();
  const [isSubmitting, setIsSubmitting] = useState(false);

  const effectiveUid = adminUid || user?.uid;

  // Si stores n'est pas passé en prop, charger automatiquement depuis Firestore
  const storesRef = useMemoFirebase(
    () => (!firestore || !effectiveUid) ? null : collection(firestore, 'users', effectiveUid, 'stores'),
    [firestore, effectiveUid]
  );
  const { data: remoteStores = [] } = useCollection(storesRef);
  const effectiveStores = (stores && stores.length > 0) ? stores : remoteStores;

  // Dans la validation des arrivages, SEULS les entrepôts doivent être affichés (pas les magasins de vente)
  const warehouseOptions = React.useMemo(() => {
    const whs = (effectiveStores || []).filter((s: any) => s.type === 'WAREHOUSE');
    if (whs.length === 0) {
      return [{ id: 'ENTREPOT_NO1', name: '📦 Entrepôt Principal (Par défaut)', type: 'WAREHOUSE' }];
    }
    return whs.map((s: any) => ({
      id: s.id,
      name: `📦 ${s.name}`,
      type: 'WAREHOUSE'
    })).sort((a: any, b: any) => a.name.localeCompare(b.name));
  }, [effectiveStores]);

  const [remoteMovements, setRemoteMovements] = useState<any[]>([]);
  useEffect(() => {
    if (!open || !facture?.id || !firestore || !effectiveUid) {
      setRemoteMovements([]);
      return;
    }
    if (existingMovements && existingMovements.length > 0) {
      setRemoteMovements(existingMovements);
      return;
    }
    const q = query(
      collection(firestore, 'users', effectiveUid, 'stockMovements'),
      where('factureId', '==', facture.id)
    );
    getDocs(q).then(snap => {
      const list = snap.docs.map(d => ({ id: d.id, ...d.data() }));
      setRemoteMovements(list);
    }).catch(err => console.error('Error fetching movements for facture:', err));
  }, [open, facture?.id, firestore, effectiveUid, existingMovements]);

  const activeMovements = (existingMovements && existingMovements.length > 0) ? existingMovements : remoteMovements;

  const isAlreadyInStock = Boolean(
    facture?.status === 'STOCK' ||
    facture?.stockEntryDate ||
    activeMovements.length > 0
  );

  const [formData, setFormData] = useState({
    stockEntryDate: '',
    invoicePaidDhs: 0,
    exchangeInvoiceAmount: 0,
    supplierInvoiceAmount: 0,
    additionalCostsAmount: 0
  });

  const [storeSelections, setStoreSelections] = useState<Record<string, string>>({});
  const [globalStoreId, setGlobalStoreId] = useState<string>('');

  useEffect(() => {
    if (facture && open) {
      setFormData({
        stockEntryDate: facture.stockEntryDate || new Date().toISOString().split('T')[0],
        invoicePaidDhs: Number(facture.invoicePaidDhs) || 0,
        exchangeInvoiceAmount: Number(facture.exchangeInvoiceAmount) || 0,
        supplierInvoiceAmount: Number(facture.supplierInvoiceAmount) || 0,
        additionalCostsAmount: Number(facture.additionalCostsAmount) || 0
      });

      // Identifier si un entrepôt valide avait déjà été sélectionné
      const firstExistingStoreId = activeMovements?.find(m => m.storeId)?.storeId;
      const isExistingStoreValid = warehouseOptions.some(w => w.id === firstExistingStoreId);
      const defaultWh = isExistingStoreValid ? firstExistingStoreId : (warehouseOptions[0]?.id || 'ENTREPOT_NO1');
      setGlobalStoreId(defaultWh);

      if (associatedArticles && associatedArticles.length > 0) {
        const initialSelections: Record<string, string> = {};
        associatedArticles.forEach(a => {
          const movForArt = activeMovements?.find(m => m.articleId === a.id);
          const movStore = movForArt?.storeId;
          const isMovStoreValid = warehouseOptions.some(w => w.id === movStore);
          initialSelections[a.id] = (isMovStoreValid && movStore) ? movStore : defaultWh;
        });
        setStoreSelections(initialSelections);
      }
    }
  }, [facture, open, associatedArticles, warehouseOptions, activeMovements]);

  const handleGlobalStoreChange = (whId: string) => {
    setGlobalStoreId(whId);
    if (associatedArticles && associatedArticles.length > 0) {
      const updated: Record<string, string> = {};
      associatedArticles.forEach(a => {
        updated[a.id] = whId;
      });
      setStoreSelections(updated);
    }
  };

  // Calcul automatique du total droits payés (DI+TPI+TVA) depuis les articles liés
  const calculatedDroitsPayes = React.useMemo(() => {
    if (!facture) return 0;
    const invoicePaidDhs = Number(facture.invoicePaidDhs) || 0;
    const declaredValue = Number(facture.declaredValue) || 0;
    const tauxChange = declaredValue > 0 ? invoicePaidDhs / declaredValue : 0;
    return (associatedArticles || []).reduce((total, a) => {
      const nw = Number(a.netWeight) || 0;
      const cat = (subCategories || []).find((c: any) => c.name === a.categoryId || c.id === a.categoryId);
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

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!effectiveUid || !firestore || !facture) {
      toast({
        title: "Erreur",
        description: "Utilisateur ou base de données indisponible.",
        variant: "destructive"
      });
      return;
    }

    setIsSubmitting(true);

    try {
      // 1. Mettre à jour la Facture
      const factureRef = doc(firestore, 'users', effectiveUid, 'factures', facture.id);
      const updates = cleanUndefined({
        stockEntryDate: formData.stockEntryDate,
        status: 'STOCK',
        customsPaidDhs: calculatedDroitsPayes,
        invoicePaidDhs: Number(formData.invoicePaidDhs) || 0,
        exchangeInvoiceAmount: Number(formData.exchangeInvoiceAmount) || 0,
        supplierInvoiceAmount: Number(formData.supplierInvoiceAmount) || 0,
        additionalCostsAmount: Number(formData.additionalCostsAmount) || 0,
        updatedAt: serverTimestamp()
      });
      await setDoc(factureRef, updates, { merge: true });

      // 1b. Si l'arrivage existait déjà en stock ou est en cours de modification, supprimer les anciens mouvements d'arrivage pour éviter les doublons
      const movsColl = collection(firestore, 'users', effectiveUid, 'stockMovements');
      const q1 = query(movsColl, where('factureId', '==', facture.id));
      const oldSnap1 = await getDocs(q1);
      const deletePromises: Promise<any>[] = [];
      oldSnap1.forEach(d => {
        deletePromises.push(deleteDoc(d.ref));
      });

      const q2 = query(movsColl, where('factureRef', '==', facture.id));
      const oldSnap2 = await getDocs(q2);
      oldSnap2.forEach(d => {
        if (!oldSnap1.docs.some(x => x.id === d.id)) {
          deletePromises.push(deleteDoc(d.ref));
        }
      });
      await Promise.all(deletePromises);

      // 2. Propager Stock Entry Date + coût de revient MAD + Statut STOCK à chaque article
      if (associatedArticles && associatedArticles.length > 0) {
        for (const article of associatedArticles) {
          const articleRef = doc(firestore, 'users', effectiveUid, 'articles', article.id);
          const coutRevient = computeCoutRevientMad(article);

          await setDoc(articleRef, cleanUndefined({
            stockEntryDate:   formData.stockEntryDate,
            status:           'STOCK',
            purchasePriceMAD: coutRevient > 0 ? coutRevient : null,
            updatedAt:        serverTimestamp()
          }), { merge: true });

          const baseName = (article.nameFR || article.name || article.categoryId || '').trim();
          const parts: string[] = [];
          if (article.zipperType && !baseName.toLowerCase().includes(article.zipperType.toLowerCase())) {
            parts.push(article.zipperType);
          }
          if (article.slider && !baseName.toLowerCase().includes(article.slider.toLowerCase())) {
            parts.push(article.slider);
          }
          const fullEnglishName = parts.length > 0 ? `${baseName} ${parts.join(' ')}`.trim() : (baseName || article.specs || 'Produit');
          const defaultProductName = article.nameFR || fullEnglishName;
          const targetStore = storeSelections[article.id] || globalStoreId || warehouseOptions[0]?.id || 'ENTREPOT_NO1';

          const hasQualityBreakdown = Array.isArray(article.qualityBreakdown) && article.qualityBreakdown.length > 0;
          const hasColorBreakdown = (article.color === 'various' || article.color === 'Various') && Array.isArray(article.colorBreakdown) && article.colorBreakdown.length > 0;
          const hasSizeBreakdown = (article.size === 'various' || article.size === 'Various') && Array.isArray(article.sizeBreakdown) && article.sizeBreakdown.length > 0;

          if (hasQualityBreakdown) {
            for (const row of article.qualityBreakdown) {
              const rowQty = Number(row.quantity) || 0;
              if (rowQty <= 0) continue;
              const rowProductName = row.nameFR || (row.quality ? `${baseName} ${row.quality}`.trim() : defaultProductName);
              const rowPrice = (row.priceOverride !== '' && row.priceOverride !== undefined && Number(row.priceOverride) > 0)
                ? Number(row.priceOverride)
                : coutRevient;

              await addDoc(collection(firestore, 'users', effectiveUid, 'stockMovements'), cleanUndefined({
                articleId:        article.id,
                categoryId:       article.categoryId,
                productName:      rowProductName,
                nameFR:           row.nameFR || article.nameFR || null,
                color:            article.color || row.color || null,
                size:             row.size || article.size || null,
                quality:          row.quality || null,
                gsm:              row.gsm ?? article.gsm ?? null,
                fabricWidth:      row.fabricWidth ?? article.fabricWidth ?? null,
                rollLength:       row.rollLength ?? article.rollLength ?? null,
                rollLengthUnit:   row.rollLengthUnit ?? article.rollLengthUnit ?? null,
                packagingPerBag:  row.packagingPerBag ?? article.packagingPerBag ?? null,
                zipperType:       row.zipperType ?? article.zipperType ?? null,
                slider:           row.slider ?? article.slider ?? null,
                sliderType:       row.sliderType ?? article.sliderType ?? null,
                tapeWeightGsm:    row.tapeWeightGsm ?? article.tapeWeightGsm ?? null,
                sliderWeightG:    row.sliderWeightG ?? article.sliderWeightG ?? null,
                pcsPerBag:        row.pcsPerBag ?? article.pcsPerBag ?? null,
                bagsPerCarton:    row.bagsPerCarton ?? article.bagsPerCarton ?? null,
                unitOfMeasure:    article.unitOfMeasure || 'unité',
                type:             'IN',
                reason:           'ARRIVAGE',
                storeId:          targetStore,
                quantity:         rowQty,
                date:             formData.stockEntryDate,
                factureId:        facture.id,
                factureRef:       facture.id,
                purchasePriceMAD: rowPrice > 0 ? rowPrice : null,
                notes:            `Arrivage ${facture.id} · Qualité ${row.quality || ''}`,
                createdAt:        serverTimestamp(),
              }));
            }
          } else if (hasColorBreakdown) {
            for (const row of article.colorBreakdown) {
              const rowQty = Number(row.quantity) || 0;
              if (rowQty <= 0) continue;
              const colorLabel = (row.colorCode || row.description || row.color || '').trim();

              await addDoc(collection(firestore, 'users', effectiveUid, 'stockMovements'), cleanUndefined({
                articleId:        article.id,
                categoryId:       article.categoryId,
                productName:      defaultProductName,
                nameFR:           article.nameFR || null,
                color:            colorLabel || null,
                size:             article.size || null,
                quality:          article.quality || null,
                gsm:              article.gsm ?? null,
                fabricWidth:      article.fabricWidth ?? null,
                rollLength:       article.rollLength ?? null,
                rollLengthUnit:   article.rollLengthUnit ?? null,
                packagingPerBag:  article.packagingPerBag ?? null,
                zipperType:       article.zipperType ?? null,
                slider:           article.slider ?? null,
                sliderType:       article.sliderType ?? null,
                unitOfMeasure:    article.unitOfMeasure || 'unité',
                type:             'IN',
                reason:           'ARRIVAGE',
                storeId:          targetStore,
                quantity:         rowQty,
                date:             formData.stockEntryDate,
                factureId:        facture.id,
                factureRef:       facture.id,
                purchasePriceMAD: coutRevient > 0 ? coutRevient : null,
                notes:            `Arrivage ${facture.id} · Couleur ${colorLabel}`,
                createdAt:        serverTimestamp(),
              }));
            }
          } else if (hasSizeBreakdown) {
            for (const row of article.sizeBreakdown) {
              const rowQty = Number(row.quantity) || 0;
              if (rowQty <= 0) continue;
              const sizeLabel = (row.size || '').trim();

              await addDoc(collection(firestore, 'users', effectiveUid, 'stockMovements'), cleanUndefined({
                articleId:        article.id,
                categoryId:       article.categoryId,
                productName:      defaultProductName,
                nameFR:           article.nameFR || null,
                color:            article.color || null,
                size:             sizeLabel || null,
                quality:          article.quality || null,
                gsm:              article.gsm ?? null,
                fabricWidth:      article.fabricWidth ?? null,
                rollLength:       article.rollLength ?? null,
                rollLengthUnit:   article.rollLengthUnit ?? null,
                packagingPerBag:  article.packagingPerBag ?? null,
                zipperType:       article.zipperType ?? null,
                slider:           article.slider ?? null,
                sliderType:       article.sliderType ?? null,
                unitOfMeasure:    article.unitOfMeasure || 'unité',
                type:             'IN',
                reason:           'ARRIVAGE',
                storeId:          targetStore,
                quantity:         rowQty,
                date:             formData.stockEntryDate,
                factureId:        facture.id,
                factureRef:       facture.id,
                purchasePriceMAD: coutRevient > 0 ? coutRevient : null,
                notes:            `Arrivage ${facture.id} · Taille ${sizeLabel}`,
                createdAt:        serverTimestamp(),
              }));
            }
          } else {
            await addDoc(collection(firestore, 'users', effectiveUid, 'stockMovements'), cleanUndefined({
              articleId:        article.id,
              categoryId:       article.categoryId,
              productName:      defaultProductName,
              nameFR:           article.nameFR || null,
              color:            article.color || null,
              size:             article.size  || null,
              quality:          article.quality || null,
              gsm:              article.gsm ?? null,
              fabricWidth:      article.fabricWidth ?? null,
              rollLength:       article.rollLength ?? null,
              rollLengthUnit:   article.rollLengthUnit ?? null,
              packagingPerBag:  article.packagingPerBag ?? null,
              zipperType:       article.zipperType ?? null,
              slider:           article.slider ?? null,
              sliderType:       article.sliderType ?? null,
              unitOfMeasure:    article.unitOfMeasure || 'unité',
              type:             'IN',
              reason:           'ARRIVAGE',
              storeId:          targetStore,
              quantity:         Number(article.quantity) || 0,
              date:             formData.stockEntryDate,
              factureId:        facture.id,
              factureRef:       facture.id,
              purchasePriceMAD: coutRevient > 0 ? coutRevient : null,
              notes:            `Arrivage ${facture.id}${article.quality ? ` · Qualité ${article.quality}` : ''}`,
              createdAt:        serverTimestamp(),
            }));
          }
        }
      }

      toast({ 
        title: isAlreadyInStock ? "✅ Arrivage mis à jour" : "✅ Entrée en stock validée", 
        description: `Dossier ${facture.id} mis à jour dans le stock avec succès.` 
      });
      onOpenChange(false);
    } catch (err: any) {
      console.error('[PassToStockModal] error:', err);
      toast({
        title: "Erreur de validation",
        description: err?.message || "Une erreur est survenue lors de l'entrée en stock.",
        variant: "destructive"
      });
    } finally {
      setIsSubmitting(false);
    }
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
              {isAlreadyInStock ? "Modifier l'Entrée en Stock" : "Entrée en Stock"} <span className="opacity-70">&bull; {facture.id}</span>
            </DialogTitle>
            <p className="text-[10px] font-bold text-emerald-200 uppercase tracking-widest mt-1">
              {isAlreadyInStock ? "Mise à jour de l'affectation entrepôt et valorisation" : "Saisie de clôture et valorisation"}
            </p>
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
                <Label className="text-[10px] font-bold text-stone-500 uppercase tracking-widest">Facture Fournisseur</Label>
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
            <div className="pt-4 border-t border-stone-100">
              <div className="flex flex-wrap items-center justify-between gap-2 mb-4">
                <h4 className="text-[11px] font-black text-stone-900 uppercase tracking-widest flex items-center gap-2">
                  <Archive className="w-4 h-4 text-emerald-500" /> Affectation aux Entrepôts de Stockage
                </h4>
                <div className="flex items-center gap-2">
                  <span className="text-[9px] font-bold text-stone-400 uppercase">Affecter tout à :</span>
                  <select
                    value={globalStoreId}
                    onChange={(e) => handleGlobalStoreChange(e.target.value)}
                    className="h-7 px-2 rounded-lg border border-stone-200 text-[10px] font-bold bg-white"
                  >
                    {warehouseOptions.map((w: any) => (
                      <option key={w.id} value={w.id}>{w.name}</option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="space-y-3">
                {associatedArticles.map((article: any) => {
                  const baseName = (article.nameFR || article.name || article.categoryId || '').trim();
                  const parts: string[] = [];
                  if (article.zipperType && !baseName.toLowerCase().includes(article.zipperType.toLowerCase())) {
                    parts.push(article.zipperType);
                  }
                  if (article.slider && !baseName.toLowerCase().includes(article.slider.toLowerCase())) {
                    parts.push(article.slider);
                  }
                  const fullEnglishName = parts.length > 0 ? `${baseName} ${parts.join(' ')}`.trim() : (baseName || article.specs || 'Produit');
                  const productName = article.nameFR || fullEnglishName;
                  
                  return (
                    <div key={article.id} className="flex items-center justify-between p-3 rounded-xl border border-stone-100 bg-stone-50">
                      <div>
                        <p className="text-[11px] font-black text-stone-900 uppercase">{productName}</p>
                        <div className="flex items-center gap-2 mt-1">
                          {article.color && article.color !== 'various' && <span className="text-[9px] font-bold text-stone-500 uppercase bg-white px-2 py-0.5 rounded border border-stone-200">{article.color}</span>}
                          {article.size && article.size !== 'various' && <span className="text-[9px] font-bold text-stone-500 uppercase bg-white px-2 py-0.5 rounded border border-stone-200">{article.size}</span>}
                          <span className="text-[9px] font-black text-emerald-600 bg-emerald-50 px-2 py-0.5 rounded">{article.quantity} {article.unitOfMeasure}</span>
                        </div>
                      </div>
                      <select
                        value={storeSelections[article.id] || globalStoreId || warehouseOptions[0]?.id || ''}
                        onChange={(e) => setStoreSelections(prev => ({ ...prev, [article.id]: e.target.value }))}
                        className="h-8 rounded-lg border-stone-200 text-xs font-bold bg-white"
                      >
                        {warehouseOptions.map((w: any) => (
                          <option key={w.id} value={w.id}>{w.name}</option>
                        ))}
                      </select>
                    </div>
                  );
                })}
              </div>

              <div className="flex gap-3 items-center mt-5 p-3 bg-emerald-50 rounded-xl border border-emerald-100">
                <AlertTriangle className="w-4 h-4 text-emerald-500 shrink-0" />
                <p className="text-[9px] font-bold text-emerald-700 uppercase leading-tight">
                  La date d'entrée en stock sera appliquée aux {associatedArticles.length} articles de cet arrivage ("Inventaire Réceptionné").
                </p>
              </div>
            </div>
          )}
        </form>

        <DialogFooter className="p-6 bg-stone-50 border-t border-stone-100 flex flex-row gap-3">
          <Button
            variant="ghost"
            disabled={isSubmitting}
            onClick={() => onOpenChange(false)}
            className="flex-1 text-[10px] font-black uppercase tracking-widest h-11 hover:bg-stone-200"
          >
            Annuler
          </Button>
          <Button
            onClick={handleSubmit}
            disabled={isSubmitting}
            className="flex-[2] bg-emerald-600 hover:bg-emerald-700 text-white font-black uppercase text-[10px] tracking-widest h-11 rounded-xl gap-2 shadow-lg shadow-emerald-600/20"
          >
            {isSubmitting ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" /> Enregistrement...
              </>
            ) : (
              <>
                <Save className="w-4 h-4" /> {isAlreadyInStock ? "Enregistrer les modifications" : "Finaliser l'Entrée"}
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
