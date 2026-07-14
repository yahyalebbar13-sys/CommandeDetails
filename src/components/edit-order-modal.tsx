
"use client";

import React, { useState, useMemo, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Sparkles, Loader2, Layers, Package, Save, Palette, Ruler, ClipboardList, Maximize, Settings2, MousePointer2, Scissors, UserCircle2, Copy, Clock, ImagePlus, X as XIcon } from 'lucide-react';
import { suggestArticleSpecifications } from '@/ai/flows/suggest-article-specifications-flow';
import { useUser, useFirestore, useCollection, useMemoFirebase } from '@/firebase';
import { doc, collection, serverTimestamp } from 'firebase/firestore';
import { getStorage, ref as storageRef, uploadBytesResumable, getDownloadURL, deleteObject } from 'firebase/storage';
import { getApp } from 'firebase/app';
import { useToast } from '@/hooks/use-toast';
import { updateDocumentNonBlocking, setDocumentNonBlocking } from '@/firebase/non-blocking-updates';
import { sendStatusNotification } from '@/lib/send-status-notification';
import { computeEffectiveStatus } from '@/lib/status-utils';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue, SelectGroup, SelectLabel } from '@/components/ui/select';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Switch } from '@/components/ui/switch';
import { Check, ChevronDown as ChevronDownIcon } from 'lucide-react';
import ColorBreakdownInput, { ColorBreakdownRow } from './color-breakdown-input';
import SizeBreakdownInput, { SizeBreakdownRow } from './size-breakdown-input';
import DesignPicker from './design-picker';

const UNITS = ["pièces", "doz", "m", "rolls", "kg", "bag", "yds"];
const COLORS = ["white", "black", "raw black", "raw white", "various", "various x black", "various x white", "nickel", "various x black x white", "silver", "gold", "black x white", "beige", "black nickel", "transparent"];
const ZIPPER_TYPES = ["O/E", "C/E"];
const SLIDER_TYPES = ["A/L", "P/L", "N/L", "SEMI A/L"];

interface EditOrderModalProps {
  article: any | null;
  onOpenChange: (open: boolean) => void;
  factures: any[];
}

export default function EditOrderModal({ article, onOpenChange, factures }: EditOrderModalProps) {
  const { user } = useUser();
  const firestore = useFirestore();
  const { toast } = useToast();

  const genCatsRef = useMemoFirebase(() => {
    if (!firestore || !user) return null;
    return collection(firestore, 'users', user.uid, 'generalCategories');
  }, [firestore, user]);

  const catsRef = useMemoFirebase(() => {
    if (!firestore || !user) return null;
    return collection(firestore, 'users', user.uid, 'categories');
  }, [firestore, user]);

  const { data: generalCategories = [] } = useCollection(genCatsRef);
  const { data: subCategories = [] } = useCollection(catsRef);

  const [selectedGenCatId, setSelectedGenCatId] = useState<string>('');
  const [formData, setFormData] = useState<any>(null);
  const [isSuggesting, setIsSuggesting] = useState(false);
  const [colorBreakdown, setColorBreakdown] = useState<ColorBreakdownRow[] | null>(null);
  const [sizeBreakdown, setSizeBreakdown] = useState<any[] | null>(null);
  const [colorOpen, setColorOpen] = useState(false);
  const [imageUploading, setImageUploading] = useState(false);
  const [imageUploadProgress, setImageUploadProgress] = useState(0);

  const handleColorBreakdownChange = (rows: ColorBreakdownRow[] | null, total: number) => {
    setColorBreakdown(rows);
    if (rows && rows.length > 0) {
      setFormData((p: any) => p ? { ...p, quantity: total, color: 'various' } : p);
    }
  };

  const handleSizeBreakdownChange = (rows: SizeBreakdownRow[] | null, total: number) => {
    setSizeBreakdown(rows);
    if (rows && rows.length > 0) {
      setFormData((p: any) => p ? { ...p, quantity: total, size: 'various' } : p);
    }
  };

  useEffect(() => {
    if (article) {
      setFormData({
        ...article,
        // Use rawStatus (real Firestore status) if article was enriched,
        // otherwise fall back to article.status
        status: article.rawStatus || article.status,
        factureId: article.factureId || 'NONE',
        size: article.size || '',
        zipperType: article.zipperType || '',
        slider: article.slider || '',
        sliderType: article.sliderType || '',
        priority: article.priority || 'todo',
        isPreorder: article.isPreorder || false,
        clientName: article.clientName || '',
        estimatedProductionDelay: article.estimatedProductionDelay || '',
        imageUrl: article.imageUrl || '',
        designRef: article.designRef || '',
        designImageUrl: article.designImageUrl || '',
      });
      setSelectedGenCatId(article.generalCategoryId || '');
      setColorBreakdown(article.colorBreakdown || null);
      setSizeBreakdown(Array.isArray(article.sizeBreakdown) ? article.sizeBreakdown : null);
    } else {
      setFormData(null);
      setColorBreakdown(null);
      setSizeBreakdown(null);
    }
  }, [article]);

  // ── Upload product image to Firebase Storage ──
  const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !user || !article) return;
    if (!file.type.startsWith('image/')) {
      toast({ variant: 'destructive', title: 'Format invalide', description: 'Sélectionnez une image (JPG, PNG, WEBP...)' });
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      toast({ variant: 'destructive', title: 'Fichier trop grand', description: 'Maximum 5 MB par image.' });
      return;
    }
    setImageUploading(true);
    setImageUploadProgress(0);
    try {
      const storage = getStorage(getApp());
      const path = `users/${user.uid}/articles/${article.id}/product-image`;
      const imageRef = storageRef(storage, path);
      const uploadTask = uploadBytesResumable(imageRef, file);
      await new Promise<void>((resolve, reject) => {
        uploadTask.on(
          'state_changed',
          (snap) => setImageUploadProgress(Math.round((snap.bytesTransferred / snap.totalBytes) * 100)),
          reject,
          async () => {
            const url = await getDownloadURL(uploadTask.snapshot.ref);
            setFormData((prev: any) => ({ ...prev, imageUrl: url }));
            resolve();
          }
        );
      });
      toast({ title: '📸 Photo ajoutée', description: 'La photo du produit a été uploadée.' });
    } catch (err: any) {
      toast({ variant: 'destructive', title: 'Erreur upload', description: err.message });
    } finally {
      setImageUploading(false);
    }
  };

  const handleRemoveImage = async () => {
    if (!user || !article || !formData?.imageUrl) return;
    try {
      const storage = getStorage(getApp());
      const path = `users/${user.uid}/articles/${article.id}/product-image`;
      await deleteObject(storageRef(storage, path)).catch(() => {}); // ignore if already deleted
      setFormData((prev: any) => ({ ...prev, imageUrl: '' }));
      toast({ title: 'Photo supprimée' });
    } catch (err: any) {
      toast({ variant: 'destructive', title: 'Erreur', description: err.message });
    }
  };

  const filteredSubCategories = useMemo(() => {
    if (!selectedGenCatId || !subCategories) return [];
    const filtered = (subCategories || []).filter(sc => sc.generalCategoryId === selectedGenCatId);
    
    const getGroupIndex = (name: string) => {
      const catName = (name || '').toLowerCase().trim();
      
      const fabricKeywords = ["fabric", "non woven", "t/c fabric", "popeline", "leather", "felt fabric", "polyester fabric", "taffeta fabric", "woven interlining"];
      const sliderKeywords = ["puller", "slider for nylon zipper", "slider for plastic zipper", "slider for metal zipper"];
      const zipperKeywords = ["zipper", "plastic zipper", "nylon zipper", "metal zipper", "zipper long chain", "nylon zipper long chain"];
      const buttonKeywords = ["covered mould button", "snap button", "button"];

      if (fabricKeywords.some(kw => catName.includes(kw))) return 1;
      if (sliderKeywords.some(kw => catName.includes(kw))) return 2;
      if (zipperKeywords.some(kw => catName.includes(kw))) return 3;
      if (buttonKeywords.some(kw => catName.includes(kw))) return 4;
      return 5;
    };

    return filtered.sort((a, b) => {
      const indexA = getGroupIndex(a.name);
      const indexB = getGroupIndex(b.name);
      if (indexA !== indexB) {
        return indexA - indexB;
      }
      return (a.name || '').localeCompare(b.name || '');
    });
  }, [selectedGenCatId, subCategories]);

  const isZipper = useMemo(() => {
    const upper = formData?.categoryId?.toUpperCase() || "";
    return upper.includes('ZIPPER') && !upper.includes('LONG CHAIN') && !upper.includes('SLIDER');
  }, [formData?.categoryId]);

  const isSlider = useMemo(() => {
    const upper = formData?.categoryId?.toUpperCase() || '';
    return upper.includes('SLIDER') || upper.includes('PULLER');
  }, [formData?.categoryId]);

  const isDesignCategory = useMemo(() => {
    const upper = (formData?.categoryId || '').toUpperCase();
    return isZipper || isSlider || upper.includes('PRINT') || upper.includes('DESIGN') || upper.includes('PATTERN');
  }, [isZipper, isSlider, formData?.categoryId]);

  const handleSuggestSpecs = async () => {
    if (!formData?.categoryId) return;
    setIsSuggesting(true);
    try {
      const result = await suggestArticleSpecifications({
        category: formData.categoryId,
        article: formData.categoryId
      });
      setFormData((prev: any) => ({ ...prev, specs: result.specs }));
    } catch (err) {
      console.error(err);
    } finally {
      setIsSuggesting(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user || !firestore || !article || !formData) return;

    const docRef = doc(firestore, 'users', user.uid, 'articles', article.id);

    const finalFactureId = formData.factureId === 'NONE' ? '' : formData.factureId;

    // When article has a dossier, NEVER write dates into the article document.
    // The dossier (facture) is the single source of truth for arrivalDate & stockEntryDate.
    // Only save 'DELIVERED' if admin explicitly marked it, otherwise keep 'SHIPPED' as base.
    const statusToSave = finalFactureId
      ? (formData.status === 'DELIVERED' ? 'DELIVERED' : 'SHIPPED')
      : formData.status;

    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { effectiveStatus: _es, rawStatus: _rs, arrivalDate: _ad, stockEntryDate: _sed, ...cleanFormData } = formData;
    
    let isSplit = false;
    let splitCount = 1;

    const groups = new Map<number, ColorBreakdownRow[]>();
    if (colorBreakdown && colorBreakdown.length > 0) {
      for (const row of colorBreakdown) {
        const price = (row.priceOverride !== '' && row.priceOverride !== undefined)
          ? Number(row.priceOverride)
          : Number(formData.purchasePricePerUnit || 0);
        if (!groups.has(price)) groups.set(price, []);
        groups.get(price)!.push(row);
      }
    }

    if (groups.size > 1) {
      isSplit = true;
      splitCount = groups.size;
      let isFirst = true;
      groups.forEach((rows, price) => {
        const groupQty = rows.reduce((s, r) => s + (Number(r.rolls) || 0), 0);
        if (isFirst) {
          // Update the original document
          const finalData = {
            ...cleanFormData,
            name: formData.categoryId,
            generalCategoryId: selectedGenCatId,
            factureId: finalFactureId,
            status: statusToSave,
            purchasePricePerUnit: price,
            quantity: groupQty,
            colorBreakdown: rows,
            sizeBreakdown: sizeBreakdown && sizeBreakdown.length > 0 ? sizeBreakdown : null,
          };
          updateDocumentNonBlocking(docRef, finalData);
          isFirst = false;
        } else {
          // Create new document for other price groups
          const newId = crypto.randomUUID();
          const newDocRef = doc(firestore, 'users', user.uid, 'articles', newId);
          const finalData = {
            ...cleanFormData,
            id: newId,
            name: formData.categoryId,
            generalCategoryId: selectedGenCatId,
            factureId: finalFactureId,
            status: statusToSave,
            purchasePricePerUnit: price,
            quantity: groupQty,
            colorBreakdown: rows,
            sizeBreakdown: sizeBreakdown && sizeBreakdown.length > 0 ? sizeBreakdown : null,
            createdAt: serverTimestamp(),
          };
          setDocumentNonBlocking(newDocRef, finalData, { merge: true });
        }
      });
    } else {
      const finalData = {
        ...cleanFormData,
        name: formData.categoryId,
        generalCategoryId: selectedGenCatId,
        factureId: finalFactureId,
        status: statusToSave,
        colorBreakdown: colorBreakdown && colorBreakdown.length > 0 ? colorBreakdown : null,
        sizeBreakdown: sizeBreakdown && sizeBreakdown.length > 0 ? sizeBreakdown : null,
      };
      updateDocumentNonBlocking(docRef, finalData);
    }

    // ── Send Gmail notification if status changed and client is a preorder ──
    // article.rawStatus = real Firestore status (SHIPPED/PI/etc)
    // article.status   = enriched effective status (TRANSIT/CUSTOMS/STOCK)
    const storedOldStatus = article.rawStatus || article.status; // true Firestore value before edit
    const storedNewStatus = formData.status;                      // what admin chose in the form
    const clientName = (formData.clientName || '').trim();

    if (clientName) {
      // Compute effective status for old state (before this save)
      const effectiveOld = computeEffectiveStatus({
        status: storedOldStatus,
        arrivalDate: article.arrivalDate,
        stockEntryDate: article.stockEntryDate,
      });
      // Compute effective status for new state (after this save)
      const effectiveNew = computeEffectiveStatus({
        status: storedNewStatus,
        arrivalDate: arrivalDate,
        stockEntryDate: stockEntryDate,
      });

      const oldDisplayStatus = article.effectiveStatus || effectiveOld; // use pre-enriched value if available

      if (oldDisplayStatus !== effectiveNew) {
        toast({ title: '📧 Envoi en cours...', description: `Notification → ${clientName} (${effectiveNew})` });

        // Compute transit info from the linked facture
        let transitArrivalDate: string | undefined;
        let transitDuration: string | undefined;

        if (arrivalDate) {
          transitArrivalDate = arrivalDate;
          const today = new Date();
          today.setHours(0, 0, 0, 0);
          const eta = new Date(arrivalDate);
          eta.setHours(0, 0, 0, 0);
          const diffMs = eta.getTime() - today.getTime();
          const diffDays = Math.round(diffMs / (1000 * 60 * 60 * 24));
          if (diffDays > 0) {
            transitDuration = diffDays === 1 ? '1 jour' : `${diffDays} jours`;
          } else if (diffDays === 0) {
            transitDuration = "aujourd'hui";
          }
        } else if (effectiveNew === 'STOCK' && stockEntryDate) {
          transitArrivalDate = stockEntryDate;
        }

        const result = await sendStatusNotification({
          firestore,
          adminUid: user.uid,
          clientName,
          articleName: formData.categoryId || formData.name,
          oldStatus: effectiveOld,
          newStatus: effectiveNew,
          quantity: formData.quantity,
          unitOfMeasure: formData.unitOfMeasure,
          specs: formData.specs,
          color: formData.color,
          size: formData.size,
          estimatedProductionDelay: formData.estimatedProductionDelay,
          imageUrl: formData.imageUrl || undefined,
          transitArrivalDate,
          transitDuration,
        });
        if (result.ok) {
          toast({ title: '✅ Notification envoyée', description: `Email envoyé à ${result.email} — ${effectiveNew}` });
        } else if (result.error) {
          toast({ title: '⚠️ Erreur notification', description: result.error, variant: 'destructive' });
        }
      }
    }

    toast({ 
      title: 'Modifié !', 
      description: isSplit 
        ? `L'article a été mis à jour et séparé en ${splitCount} articles (prix différents).` 
        : `L'article a été mis à jour.` 
    });
    onOpenChange(false);
  };

  const handleDuplicate = () => {
    if (!user || !firestore || !article || !formData) return;
    
    // Auto-save logic like handleSubmit but inserting a new document
    let arrivalDate = formData.arrivalDate || '';
    let stockEntryDate = formData.stockEntryDate || '';
    const finalFactureId = formData.factureId === 'NONE' ? '' : formData.factureId;

    if (formData.status === 'SHIPPED' && finalFactureId) {
      const selectedFacture = (factures || []).find(f => f.id === finalFactureId);
      if (selectedFacture) {
        arrivalDate = selectedFacture.arrivalDate;
        stockEntryDate = selectedFacture.stockEntryDate || '';
      }
    }

    const newId = crypto.randomUUID();
    const docRef = doc(firestore, 'users', user.uid, 'articles', newId);

    const duplicateData = {
      ...formData,
      id: newId,
      name: formData.categoryId,
      generalCategoryId: selectedGenCatId,
      factureId: finalFactureId,
      arrivalDate,
      stockEntryDate,
      createdAt: serverTimestamp(), // reset creation date
      colorBreakdown: colorBreakdown && colorBreakdown.length > 0 ? colorBreakdown : null,
    };
    
    setDocumentNonBlocking(docRef, duplicateData, { merge: true });
    toast({ title: "Article Dupliqué", description: `Un nouvel article a été créé à l'identique.` });
    onOpenChange(false);
  };

  if (!formData) return null;

  return (
    <Dialog open={!!article} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto border-stone-200 rounded-2xl p-0">
        <div className="bg-stone-900 p-6 flex items-center gap-3 text-white">
          <div className="p-2 bg-white/10 rounded-lg">
            <Package className="w-6 h-6" />
          </div>
          <div>
            <DialogTitle className="text-xl font-black uppercase tracking-tight leading-none">Paramétrage Article</DialogTitle>
            <p className="text-[10px] font-bold text-stone-400 uppercase tracking-widest mt-1">Mise à jour des données logistiques</p>
          </div>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label className="text-[10px] font-black text-stone-400 uppercase tracking-widest flex items-center gap-1">
                <Layers className="w-3 h-3" /> Pôle Logistique
              </Label>
              <Select value={selectedGenCatId} onValueChange={setSelectedGenCatId}>
                <SelectTrigger className="h-12 border-stone-200 bg-white font-bold rounded-xl">
                  <SelectValue placeholder="Choisir..." />
                </SelectTrigger>
                <SelectContent>
                  {(generalCategories || []).map(gc => (
                    <SelectItem key={gc.id} value={gc.id} className="font-bold">{gc.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1.5">
              <Label className="text-[10px] font-black text-stone-400 uppercase tracking-widest flex items-center gap-1">
                <Package className="w-3 h-3" /> Type de Produit
              </Label>
              <Select
                disabled={!selectedGenCatId}
                value={formData.categoryId}
                onValueChange={(v) => setFormData((p: any) => ({ ...p, categoryId: v }))}
              >
                <SelectTrigger className="h-12 border-stone-200 bg-white font-bold rounded-xl">
                  <SelectValue placeholder="Choisir..." />
                </SelectTrigger>
                <SelectContent>
                  {(() => {
                    const groups: Record<string, any[]> = {};
                    (filteredSubCategories || []).forEach(sc => {
                      const catName = (sc.name || '').toLowerCase().trim();
                      const fabricKeywords = ["fabric", "non woven", "t/c fabric", "popeline", "leather", "felt fabric", "polyester fabric", "taffeta fabric", "woven interlining"];
                      const sliderKeywords = ["puller", "slider for nylon zipper", "slider for plastic zipper", "slider for metal zipper"];
                      const zipperKeywords = ["zipper", "plastic zipper", "nylon zipper", "metal zipper", "zipper long chain", "nylon zipper long chain"];
                      const buttonKeywords = ["covered mould button", "snap button", "button"];
                      let label = "Reste";
                      if (fabricKeywords.some(kw => catName.includes(kw))) label = "Fabric";
                      else if (sliderKeywords.some(kw => catName.includes(kw))) label = "Slider et puller";
                      else if (zipperKeywords.some(kw => catName.includes(kw))) label = "Zipper";
                      else if (buttonKeywords.some(kw => catName.includes(kw))) label = "Bouton";
                      if (!groups[label]) groups[label] = [];
                      groups[label].push(sc);
                    });
                    return ["Fabric", "Slider et puller", "Zipper", "Bouton", "Reste"].map(label => {
                      if (!groups[label] || groups[label].length === 0) return null;
                      return (
                        <SelectGroup key={label}>
                          <SelectLabel className="text-[10px] text-stone-400 font-black uppercase tracking-widest bg-stone-50 py-2">{label}</SelectLabel>
                          {groups[label].map(sc => (
                            <SelectItem key={sc.id} value={sc.name} className="font-bold pl-6">{sc.name}</SelectItem>
                          ))}
                        </SelectGroup>
                      );
                    });
                  })()}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1.5">
              <Label className="text-[10px] font-black text-stone-400 uppercase tracking-widest flex items-center gap-1">
                <Maximize className="w-3 h-3" /> Taille / Dimension
              </Label>
              <Input
                value={formData.size || ''}
                onChange={e => setFormData((prev: any) => ({ ...prev, size: e.target.value }))}
                className="h-12 border-stone-200 font-bold rounded-xl"
                placeholder="Ex: No.5, 20cm..."
              />
            </div>

            {isZipper && (
              <div className="space-y-1.5">
                <Label className="text-[10px] font-black text-stone-400 uppercase tracking-widest flex items-center gap-1">
                  <Settings2 className="w-3 h-3" /> Type Zipper
                </Label>
                <Select value={formData.zipperType || ''} onValueChange={v => setFormData((prev: any) => ({ ...prev, zipperType: v }))}>
                  <SelectTrigger className="h-12 border-stone-200 bg-white font-bold rounded-xl">
                    <SelectValue placeholder="Type..." />
                  </SelectTrigger>
                  <SelectContent>
                    {ZIPPER_TYPES.map(t => <SelectItem key={t} value={t} className="font-bold uppercase">{t}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            )}

            {isZipper && (
              <>
                <div className="space-y-1.5">
                  <Label className="text-[10px] font-black text-stone-400 uppercase tracking-widest flex items-center gap-1">
                    <MousePointer2 className="w-3 h-3" /> Curseur
                  </Label>
                  <Input
                    value={formData.slider || ''}
                    onChange={e => setFormData((prev: any) => ({ ...prev, slider: e.target.value }))}
                    className="h-12 border-stone-200 font-bold rounded-xl"
                    placeholder="Ex: Auto-lock..."
                  />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-[10px] font-black text-stone-400 uppercase tracking-widest flex items-center gap-1">
                    <Scissors className="w-3 h-3" /> Type Curseur
                  </Label>
                  <Select value={formData.sliderType || ''} onValueChange={v => setFormData((prev: any) => ({ ...prev, sliderType: v }))}>
                    <SelectTrigger className="h-12 border-stone-200 bg-white font-bold rounded-xl">
                      <SelectValue placeholder="Type Curseur..." />
                    </SelectTrigger>
                    <SelectContent>
                      {SLIDER_TYPES.map(t => <SelectItem key={t} value={t} className="font-bold uppercase">{t}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
              </>
            )}

            <div className="space-y-1.5 md:col-span-2">
              <Label className="text-[10px] font-black text-stone-400 uppercase tracking-widest flex items-center gap-1">
                <ClipboardList className="w-3 h-3" /> {isZipper ? 'Notes Additionnelles' : 'Détails Techniques / Spécifications'}
              </Label>
              <div className="flex gap-2">
                <Input
                  value={formData.specs || ''}
                  onChange={e => setFormData((prev: any) => ({ ...prev, specs: e.target.value }))}
                  className="h-12 border-stone-200 font-bold rounded-xl"
                  placeholder={isZipper ? "Notes..." : "Ex: Semi-Auto, 50m/roll..."}
                />
                {!isZipper && (
                  <Button
                    type="button"
                    variant="outline"
                    className="h-12 w-12 border-stone-200 rounded-xl"
                    onClick={handleSuggestSpecs}
                    disabled={isSuggesting || !formData.categoryId}
                  >
                    {isSuggesting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4 text-amber-500" />}
                  </Button>
                )}
              </div>
            </div>

            {/* ── Design Picker — zipper & slider ── */}
            {isDesignCategory && formData.categoryId && (
              <div className="md:col-span-2">
                <DesignPicker
                  categoryName={formData.categoryId}
                  subCategories={subCategories || []}
                  value={formData.designRef}
                  onChange={(ref, imageUrl) =>
                    setFormData((prev: any) => ({ ...prev, designRef: ref, designImageUrl: imageUrl || '' }))
                  }
                />
              </div>
            )}

            <div className="space-y-1.5">
              <Label className="text-[10px] font-black text-stone-400 uppercase tracking-widest flex items-center gap-1">
                <Palette className="w-3 h-3" /> Couleur
              </Label>
              {colorBreakdown && colorBreakdown.length > 0 ? (
                <div className="h-12 border border-violet-200 bg-violet-50 rounded-xl flex items-center px-3">
                  <span className="text-[10px] font-black text-violet-700 uppercase">VARIOUS (multi-couleurs)</span>
                </div>
              ) : (
                <Popover open={colorOpen} onOpenChange={setColorOpen}>
                  <PopoverTrigger asChild>
                    <button
                      type="button"
                      className="h-12 w-full border border-stone-200 bg-white font-bold rounded-xl px-3 flex items-center justify-between text-sm hover:border-stone-400 transition-colors"
                    >
                      <span className="uppercase font-bold text-stone-800">{formData.color || 'Choisir...'}</span>
                      <ChevronDownIcon className="w-4 h-4 text-stone-400" />
                    </button>
                  </PopoverTrigger>
                  <PopoverContent className="w-64 p-1 max-h-60 overflow-y-auto" align="start" sideOffset={4}>
                    {COLORS.map(c => (
                      <button
                        key={c}
                        type="button"
                        onClick={() => { setFormData((p: any) => ({ ...p, color: c })); setColorOpen(false); }}
                        className={`w-full flex items-center gap-2 px-3 py-2 rounded-md hover:bg-stone-100 transition-colors text-left ${
                          formData.color === c ? 'bg-stone-100 font-black' : 'font-bold'
                        }`}
                      >
                        {formData.color === c && <Check className="w-3.5 h-3.5 text-stone-700 shrink-0" />}
                        {formData.color !== c && <span className="w-3.5 shrink-0" />}
                        <span className="text-sm uppercase text-stone-800">{c}</span>
                      </button>
                    ))}
                  </PopoverContent>
                </Popover>
              )}
            </div>
            <div className="space-y-1.5">
              <Label className="text-[10px] font-black text-stone-400 uppercase tracking-widest flex items-center gap-1">
                <Ruler className="w-3 h-3" /> Unité
              </Label>
              <Select
                value={formData.unitOfMeasure}
                onValueChange={v => setFormData((p: any) => ({ ...p, unitOfMeasure: v }))}
              >
                <SelectTrigger className="h-12 border-stone-200 bg-white font-bold rounded-xl">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {UNITS.map(u => <SelectItem key={u} value={u} className="font-bold uppercase">{u}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>

            <div className="grid grid-cols-2 gap-4 md:col-span-2">
              <div className="space-y-1.5">
                <Label className="text-[10px] font-black text-stone-400 uppercase tracking-widest">Quantité</Label>
                {colorBreakdown && colorBreakdown.length > 0 ? (
                  <div className="h-12 border border-violet-200 bg-violet-50 rounded-xl flex items-center px-3 justify-between">
                    <span className="text-[10px] font-black text-violet-700">{(formData.quantity || 0).toLocaleString()} {formData.unitOfMeasure}</span>
                    <span className="text-[9px] font-bold text-violet-400 uppercase">calculé auto</span>
                  </div>
                ) : (
                  <Input
                    type="number"
                    required
                    value={formData.quantity || 0}
                    onChange={e => setFormData((prev: any) => ({ ...prev, quantity: parseFloat(e.target.value) || 0 }))}
                    className="h-12 border-stone-200 font-bold rounded-xl"
                  />
                )}
              </div>

              <div className="space-y-1.5">
                <Label className="text-[10px] font-black text-stone-400 uppercase tracking-widest flex items-center gap-1">
                  <ClipboardList className="w-3 h-3" /> Importance
                </Label>
                <Select value={formData.priority} onValueChange={v => setFormData((p: any) => ({ ...p, priority: v }))}>
                  <SelectTrigger className="h-12 border-stone-200 bg-white font-bold rounded-xl">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="urgent" className="font-bold text-red-600 uppercase">Urgent</SelectItem>
                    <SelectItem value="important" className="font-bold text-amber-600 uppercase">Important</SelectItem>
                    <SelectItem value="todo" className="font-bold text-stone-600 uppercase">À faire</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label className="text-[10px] font-black text-stone-400 uppercase tracking-widest">Prix Unitaire ($)</Label>
                <Input
                  type="number"
                  step="0.0001"
                  required
                  value={formData.purchasePricePerUnit || 0}
                  onChange={e => setFormData((prev: any) => ({ ...prev, purchasePricePerUnit: parseFloat(e.target.value) || 0 }))}
                  className="h-12 border-stone-200 font-bold text-amber-700 rounded-xl"
                />
              </div>
            </div>

            {/* Délai de production estimé — dans le formulaire principal */}
            <div className="space-y-1.5 md:col-span-2">
              <Label className="text-[10px] font-black text-stone-400 uppercase tracking-widest flex items-center gap-1">
                <Clock className="w-3 h-3" /> Délai de production estimé
              </Label>
              <Input
                placeholder="Ex: 30 jours, 6 semaines..."
                value={formData.estimatedProductionDelay || ''}
                onChange={e => setFormData((prev: any) => ({ ...prev, estimatedProductionDelay: e.target.value }))}
                className="h-12 border-stone-200 font-bold rounded-xl"
              />
            </div>

            {/* ── Photo du Produit ─────────────────────────────────────────── */}
            <div className="space-y-2 md:col-span-2">
              <Label className="text-[10px] font-black text-stone-400 uppercase tracking-widest flex items-center gap-1">
                <ImagePlus className="w-3 h-3" /> Photo du Produit
                <span className="ml-1 text-[8px] font-bold text-stone-300 normal-case">(visible dans le portail client)</span>
              </Label>

              {formData.imageUrl ? (
                <div className="relative rounded-xl overflow-hidden border border-stone-200 bg-stone-50 h-40 flex items-center justify-center">
                  <img
                    src={formData.imageUrl}
                    alt="Photo produit"
                    className="h-full w-full object-contain"
                  />
                  <button
                    type="button"
                    onClick={handleRemoveImage}
                    className="absolute top-2 right-2 w-7 h-7 bg-red-500 hover:bg-red-600 text-white rounded-full flex items-center justify-center shadow-lg transition-colors"
                  >
                    <XIcon className="w-3.5 h-3.5" />
                  </button>
                </div>
              ) : (
                <label className={`flex flex-col items-center justify-center h-28 border-2 border-dashed rounded-xl cursor-pointer transition-all ${imageUploading ? 'border-indigo-300 bg-indigo-50' : 'border-stone-200 bg-stone-50 hover:border-indigo-300 hover:bg-indigo-50/50'}`}>
                  {imageUploading ? (
                    <div className="flex flex-col items-center gap-2 w-full px-6">
                      <Loader2 className="w-5 h-5 animate-spin text-indigo-500" />
                      <div className="w-full bg-indigo-100 rounded-full h-1.5">
                        <div className="bg-indigo-500 h-1.5 rounded-full transition-all" style={{ width: `${imageUploadProgress}%` }} />
                      </div>
                      <span className="text-[10px] font-bold text-indigo-600">{imageUploadProgress}%</span>
                    </div>
                  ) : (
                    <>
                      <ImagePlus className="w-6 h-6 text-stone-300 mb-1.5" />
                      <span className="text-[10px] font-black text-stone-400 uppercase tracking-widest">Cliquer pour uploader</span>
                      <span className="text-[9px] text-stone-300 mt-0.5">JPG, PNG, WEBP — max 5 MB</span>
                    </>
                  )}
                  <input
                    type="file"
                    accept="image/*"
                    className="hidden"
                    onChange={handleImageUpload}
                    disabled={imageUploading}
                  />
                </label>
              )}
            </div>


            <div className="space-y-3 p-4 bg-stone-50 rounded-xl border border-stone-200 md:col-span-2">
              <div className="md:col-span-2 space-y-4">
                <ColorBreakdownInput
                  categoryId={(subCategories || []).find((sc: any) => sc.name === formData?.categoryId)?.id}
                  value={colorBreakdown}
                  onChange={handleColorBreakdownChange}
                  unit={formData.unitOfMeasure}
                />
                <SizeBreakdownInput
                  value={sizeBreakdown}
                  onChange={handleSizeBreakdownChange}
                  unit={formData.unitOfMeasure}
                />
              </div>
              <Label className="text-[10px] font-black text-stone-500 uppercase tracking-widest">État & Logistique</Label>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {/* If article has a dossier → status is automatic (TRANSIT/CUSTOMS/STOCK) */}
                {formData.factureId && formData.factureId !== 'NONE' ? (
                  <div className="md:col-span-2 space-y-2">
                    {/* Auto status display */}
                    <div className="h-12 border border-stone-200 bg-stone-50 rounded-xl px-4 flex items-center gap-3">
                      <span className="text-[10px] font-black text-stone-400 uppercase tracking-widest">Statut logistique :</span>
                      <span className="text-[11px] font-black text-stone-900 uppercase">{article?.status || formData.status}</span>
                      <span className="ml-auto text-[9px] text-stone-400 font-medium italic">🔄 Calculé depuis le dossier {formData.factureId}</span>
                    </div>
                    {/* Only manual action possible at this stage: mark as delivered */}
                    {formData.isPreorder && formData.clientName && (
                      <button
                        type="button"
                        onClick={() => setFormData((p: any) => ({ ...p, status: p.status === 'DELIVERED' ? 'SHIPPED' : 'DELIVERED' }))}
                        className={`w-full h-10 rounded-xl text-[10px] font-black uppercase tracking-widest border transition-all ${
                          formData.status === 'DELIVERED'
                            ? 'bg-emerald-600 text-white border-emerald-600'
                            : 'bg-white text-emerald-700 border-emerald-300 hover:bg-emerald-50'
                        }`}
                      >
                        {formData.status === 'DELIVERED' ? '✅ Livré au client (cliquer pour annuler)' : '📦 Marquer comme Livré au Client'}
                      </button>
                    )}
                  </div>
                ) : (
                  <Select value={formData.status} onValueChange={v => setFormData((p: any) => ({ ...p, status: v }))}>
                    <SelectTrigger className="h-12 border-stone-200 bg-white font-bold rounded-xl">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="TO_ORDER" className="font-bold uppercase">📋 À Commander</SelectItem>
                      <SelectItem value="PI" className="font-bold text-amber-600 uppercase">🏭 Production Lancée (PI)</SelectItem>
                      <SelectItem
                        value="DELIVERED"
                        className="font-bold text-emerald-600 uppercase"
                        disabled={!formData.isPreorder || !formData.clientName}
                      >
                        📦 Livré au Client {!formData.isPreorder || !formData.clientName ? '(Req. Client)' : ''}
                      </SelectItem>
                    </SelectContent>
                  </Select>
                )}

                {formData.status !== 'TO_ORDER' && (
                  <Select value={formData.factureId || 'NONE'} onValueChange={v => setFormData((p: any) => ({ ...p, factureId: v }))}>
                    <SelectTrigger className="h-12 border-stone-200 bg-white font-bold rounded-xl">
                      <SelectValue placeholder="Facture..." />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="NONE" className="font-bold italic">PAS DE FACTURE</SelectItem>
                      {(factures || []).map(f => (
                        <SelectItem key={f.id} value={f.id} className="font-bold uppercase">{f.id}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}

                {formData.status !== 'TO_ORDER' && (
                  <>
                    <Input
                      placeholder="Fournisseur"
                      value={formData.supplierId || ''}
                      onChange={e => setFormData((prev: any) => ({ ...prev, supplierId: e.target.value.toUpperCase() }))}
                      className="h-12 border-stone-200 font-bold uppercase rounded-xl"
                    />
                    <Input
                      type="number"
                      step="0.001"
                      placeholder="Volume (CBM)"
                      value={formData.cubicMeasurement || 0}
                      onChange={e => setFormData((prev: any) => ({ ...prev, cubicMeasurement: parseFloat(e.target.value) || 0 }))}
                      className="h-12 border-stone-200 font-bold rounded-xl"
                    />
                    <Input
                      type="number"
                      step="0.01"
                      placeholder="N.W (kg)"
                      value={formData.netWeight || ''}
                      onChange={e => setFormData((prev: any) => ({ ...prev, netWeight: parseFloat(e.target.value) || 0 }))}
                      className="h-12 border-stone-200 font-bold rounded-xl"
                    />
                  </>
                )}
              </div>
            </div>

            {/* Précommande client */}
            <div className={`p-4 rounded-xl border transition-all md:col-span-2 ${formData.isPreorder ? 'bg-indigo-50 border-indigo-200' : 'bg-stone-50 border-dashed border-stone-200'}`}>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <UserCircle2 className={`w-4 h-4 ${formData.isPreorder ? 'text-indigo-600' : 'text-stone-400'}`} />
                  <span className={`text-[10px] font-black uppercase tracking-widest ${formData.isPreorder ? 'text-indigo-700' : 'text-stone-500'}`}>
                    Précommande Client
                  </span>
                </div>
                <Switch
                  checked={formData.isPreorder || false}
                  onCheckedChange={v => setFormData((p: any) => ({ ...p, isPreorder: v, clientName: v ? p.clientName : '' }))}
                />
              </div>
              {formData.isPreorder && (
                <div className="mt-3 space-y-1.5">
                  <Label className="text-[10px] font-black text-indigo-500 uppercase tracking-widest flex items-center gap-1">
                    <UserCircle2 className="w-3 h-3" /> Nom du Client
                  </Label>
                  <Input
                    placeholder="Ex: Zara, H&M, Client X..."
                    className="h-11 border-indigo-200 font-bold rounded-xl bg-white"
                    value={formData.clientName || ''}
                    onChange={e => setFormData((p: any) => ({ ...p, clientName: e.target.value }))}
                  />
                  <p className="text-[9px] text-indigo-400 font-bold mt-1">
                    📧 L&apos;email du client est récupéré automatiquement depuis son accès portail.
                  </p>
                </div>
              )}
              {!formData.isPreorder && (
                <p className="text-[9px] font-bold text-stone-400 uppercase mt-2 text-center italic">
                  Activer si cet article est précommandé par un client
                </p>
              )}
            </div>
          </div>
          <div className="flex flex-col md:flex-row gap-3 pt-2">
            <Button 
              type="button" 
              onClick={handleDuplicate}
              variant="outline"
              className="flex-1 border-amber-200 text-amber-700 hover:bg-amber-50 hover:text-amber-800 font-black uppercase text-[10px] tracking-widest h-14 rounded-xl gap-2 transition-colors"
            >
              <Copy className="w-4 h-4" /> Dupliquer cet article
            </Button>
            <Button 
              type="submit" 
              className="flex-1 bg-stone-900 hover:bg-black text-white font-black uppercase text-[10px] tracking-widest h-14 rounded-xl gap-2 shadow-lg shadow-stone-200"
            >
              <Save className="w-4 h-4" /> Sauvegarder
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
