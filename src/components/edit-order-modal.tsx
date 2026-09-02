
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
import DesignBreakdownInput, { DesignBreakdownRow } from './design-breakdown-input';
import DesignPicker from './design-picker';

const UNITS = ["pièces", "doz", "gross (144p)", "m", "rolls", "kg", "bag", "yds"];
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

  const articlesRef = useMemoFirebase(() => {
    if (!firestore || !user) return null;
    return collection(firestore, 'users', user.uid, 'articles');
  }, [firestore, user]);

  const { data: generalCategories = [] } = useCollection(genCatsRef);
  const { data: subCategories = [] } = useCollection(catsRef);
  const { data: allArticles = [] } = useCollection(articlesRef);

  const [selectedGenCatId, setSelectedGenCatId] = useState<string>('');
  const [formData, setFormData] = useState<any>(null);
  const [isSuggesting, setIsSuggesting] = useState(false);
  const [colorBreakdown, setColorBreakdown] = useState<ColorBreakdownRow[] | null>(null);
  const [splitOpen, setSplitOpen] = useState(false);
  const [splitColorQtys, setSplitColorQtys] = useState<Record<string, number>>({});
  const [splitQty, setSplitQty] = useState<number>(0);
  
  const handleOpenChange = (o: boolean) => {
    if (!o) {
      setSplitOpen(false);
      setSplitColorQtys({});
      setSplitQty(0);
    }
    onOpenChange(o);
  };

  const [sizeBreakdown, setSizeBreakdown] = useState<any[] | null>(null);
  const [designBreakdown, setDesignBreakdown] = useState<DesignBreakdownRow[] | null>(null);
  const [colorOpen, setColorOpen] = useState(false);
  const [imageUploading, setImageUploading] = useState(false);
  const [imageUploadProgress, setImageUploadProgress] = useState(0);

  const handleColorBreakdownChange = (rows: ColorBreakdownRow[] | null, total: number) => {
    if (rows && rows.length === 1) {
      setColorBreakdown(null);
      setFormData((p: any) => p ? { ...p, quantity: total, color: rows[0].colorCode || '' } : p);
    } else if (rows && rows.length > 1) {
      setColorBreakdown(rows);
      setFormData((p: any) => p ? { ...p, quantity: total, color: 'various' } : p);
    } else {
      setColorBreakdown(null);
    }
  };

  const handleSizeBreakdownChange = (rows: SizeBreakdownRow[] | null, total: number) => {
    if (rows && rows.length === 1) {
      setSizeBreakdown(null);
      setFormData((p: any) => p ? { ...p, quantity: total, size: rows[0].size || '' } : p);
    } else if (rows && rows.length > 1) {
      setSizeBreakdown(rows);
      setFormData((p: any) => p ? { ...p, quantity: total, size: 'various' } : p);
    } else {
      setSizeBreakdown(null);
    }
  };

  const handleDesignBreakdownChange = (rows: DesignBreakdownRow[] | null, total: number) => {
    setDesignBreakdown(rows);
    if (rows && rows.length > 0) {
      setFormData((p: any) => p ? { ...p, quantity: total, designRef: 'various' } : p);
    }
  };

  useEffect(() => {
    if (article) {
      setFormData({
        ...article,
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
      setDesignBreakdown(article.designBreakdown || null);
    } else {
      setFormData(null);
      setColorBreakdown(null);
      setSizeBreakdown(null);
      setDesignBreakdown(null);
    }
  }, [article]);

  const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !user || !article) return;
    if (!file.type.startsWith('image/')) {
      toast({ variant: 'destructive', title: 'Format invalide', description: 'Slectionnez une image (JPG, PNG, WEBP...)' });
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
      toast({ title: ' Photo ajoute', description: 'La photo du produit a t uploade.' });
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
      await deleteObject(storageRef(storage, path)).catch(() => {});
      setFormData((prev: any) => ({ ...prev, imageUrl: '' }));
      toast({ title: 'Photo supprime' });
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

  const availableSizes = useMemo(() => {
    if (!formData?.categoryId) return [];
    const cat = (subCategories || []).find((sc: any) => sc.name === formData.categoryId);
    return Array.isArray(cat?.availableSizes) && cat.availableSizes.length > 0 ? cat.availableSizes : [];
  }, [formData?.categoryId, subCategories]);

  // ── Fabric detection — check pôle name, fallback to category name keywords ──
  const isFabric = useMemo(() => {
    const POLE_KW = ['fabric', 'tissu', 'textile', 'interlining', 'non woven', 'woven'];
    const CAT_KW = ['fabric', 'non woven', 't/c fabric', 'popeline', 'leather', 'felt fabric', 'polyester fabric', 'taffeta fabric', 'woven interlining', 'interlining', 'pocketing', 'eva film', 't/c twill', 'oxford', 'twill'];
    // 1) Check pôle name
    let genCatId = selectedGenCatId;
    if (!genCatId && formData?.categoryId) {
      const cat = (subCategories || []).find((sc: any) => sc.name === formData.categoryId);
      if (cat) genCatId = cat.generalCategoryId;
    }
    if (genCatId) {
      const genCat = (generalCategories || []).find((gc: any) => gc.id === genCatId);
      if (genCat) {
        const lower = (genCat.name || '').toLowerCase();
        if (POLE_KW.some(kw => lower.includes(kw))) return true;
      }
    }
    // 2) Fallback: check category name
    if (formData?.categoryId) {
      const lower = formData.categoryId.toLowerCase();
      if (CAT_KW.some(kw => lower.includes(kw))) return true;
    }
    return false;
  }, [selectedGenCatId, formData?.categoryId, generalCategories, subCategories]);

  const availableGsm = useMemo(() => {
    if (!formData?.categoryId) return [];
    const cat = (subCategories || []).find((sc: any) => sc.name === formData.categoryId);
    return Array.isArray(cat?.availableGsm) && cat.availableGsm.length > 0 ? cat.availableGsm.map(String) : [];
  }, [formData?.categoryId, subCategories]);

  const availableWidths = useMemo(() => {
    if (!formData?.categoryId) return [];
    const cat = (subCategories || []).find((sc: any) => sc.name === formData.categoryId);
    return Array.isArray(cat?.availableWidths) && cat.availableWidths.length > 0 ? cat.availableWidths.map(String) : [];
  }, [formData?.categoryId, subCategories]);

  const fabricQualities = useMemo(() => {
    if (!formData?.categoryId) return [];
    const cat = (subCategories || []).find((sc: any) => sc.name === formData.categoryId);
    return Array.isArray(cat?.fabricQualities) ? cat.fabricQualities : [];
  }, [formData?.categoryId, subCategories]);

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

    const statusToSave = finalFactureId
      ? (formData.status === 'DELIVERED' ? 'DELIVERED' : 'SHIPPED')
      : formData.status;

    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { effectiveStatus: _es, rawStatus: _rs, arrivalDate: _ad, stockEntryDate: _sed, ...rawFormData } = formData;
    const cleanFormData = {
      ...rawFormData,
      gsm: isFabric && rawFormData.gsm ? Number(rawFormData.gsm) : null,
      fabricWidth: isFabric && rawFormData.fabricWidth ? Number(rawFormData.fabricWidth) : null,
      rollLength: isFabric && rawFormData.rollLength ? Number(rawFormData.rollLength) : null,
      packagingPerBag: isFabric && rawFormData.packagingPerBag ? Number(rawFormData.packagingPerBag) : null,
    };
    
    let isSplit = false;
    let splitCount = 1;

    const groups = new Map<number, any[]>();
    let splitType = '';

    if (designBreakdown && designBreakdown.length > 0) {
      splitType = 'design';
      for (const row of designBreakdown) {
        const price = (row.priceOverride !== '' && row.priceOverride !== undefined) ? Number(row.priceOverride) : Number(formData.purchasePricePerUnit || 0);
        if (!groups.has(price)) groups.set(price, []);
        groups.get(price)!.push(row);
      }
    } else if (colorBreakdown && colorBreakdown.length > 0) {
      splitType = 'color';
      for (const row of colorBreakdown) {
        const price = (row.priceOverride !== '' && row.priceOverride !== undefined) ? Number(row.priceOverride) : Number(formData.purchasePricePerUnit || 0);
        if (!groups.has(price)) groups.set(price, []);
        groups.get(price)!.push(row);
      }
    } else if (sizeBreakdown && sizeBreakdown.length > 0) {
      splitType = 'size';
      for (const row of sizeBreakdown) {
        const price = (row.priceOverride !== '' && row.priceOverride !== undefined) ? Number(row.priceOverride) : Number(formData.purchasePricePerUnit || 0);
        if (!groups.has(price)) groups.set(price, []);
        groups.get(price)!.push(row);
      }
    }

    if (groups.size > 1) {
      isSplit = true;
      splitCount = groups.size;
      let isFirst = true;
      groups.forEach((rows, price) => {
        const groupQty = rows.reduce((s, r) => s + (Number(r.rolls || r.quantity) || 0), 0);
        const splitData = {
          designBreakdown: splitType === 'design' ? rows : (designBreakdown && designBreakdown.length > 0 ? designBreakdown : null),
          colorBreakdown: splitType === 'color' ? rows : (colorBreakdown && colorBreakdown.length > 0 ? colorBreakdown : null),
          sizeBreakdown: splitType === 'size' ? rows : (sizeBreakdown && sizeBreakdown.length > 0 ? sizeBreakdown : null),
        };
        if (isFirst) {
          const finalData = {
            ...cleanFormData,
            name: formData.categoryId,
            generalCategoryId: selectedGenCatId,
            factureId: finalFactureId,
            status: statusToSave,
            purchasePricePerUnit: price,
            quantity: groupQty,
            ...splitData,
          };
          updateDocumentNonBlocking(docRef, finalData);
          isFirst = false;
        } else {
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
            ...splitData,
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
        designBreakdown: designBreakdown && designBreakdown.length > 0 ? designBreakdown : null,
        colorBreakdown: colorBreakdown && colorBreakdown.length > 0 ? colorBreakdown : null,
        sizeBreakdown: sizeBreakdown && sizeBreakdown.length > 0 ? sizeBreakdown : null,
      };
      updateDocumentNonBlocking(docRef, finalData);
    }

    const storedOldStatus = article.rawStatus || article.status;
    const storedNewStatus = formData.status;
    const clientName = (formData.clientName || '').trim();

    if (clientName) {
      const effectiveOld = computeEffectiveStatus({
        status: storedOldStatus,
        arrivalDate: article.arrivalDate,
        stockEntryDate: article.stockEntryDate,
      });
      const effectiveNew = computeEffectiveStatus({
        status: storedNewStatus,
        arrivalDate: article.arrivalDate,
        stockEntryDate: article.stockEntryDate,
      });

      const oldDisplayStatus = article.effectiveStatus || effectiveOld;

      if (oldDisplayStatus !== effectiveNew) {
        toast({ title: ' Envoi en cours...', description: `Notification  ${clientName} (${effectiveNew})` });

        let transitArrivalDate: string | undefined;
        let transitDuration: string | undefined;

        if (article.arrivalDate) {
          transitArrivalDate = article.arrivalDate;
          const today = new Date();
          today.setHours(0, 0, 0, 0);
          const eta = new Date(article.arrivalDate);
          eta.setHours(0, 0, 0, 0);
          const diffMs = eta.getTime() - today.getTime();
          const diffDays = Math.round(diffMs / (1000 * 60 * 60 * 24));
          if (diffDays > 0) {
            transitDuration = diffDays === 1 ? '1 jour' : `${diffDays} jours`;
          } else if (diffDays === 0) {
            transitDuration = "aujourd'hui";
          }
        } else if (effectiveNew === 'STOCK' && article.stockEntryDate) {
          transitArrivalDate = article.stockEntryDate;
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
          toast({ title: ' Notification envoye', description: `Email envoy  ${result.email}  ${effectiveNew}` });
        } else if (result.error) {
          toast({ title: ' Erreur notification', description: result.error, variant: 'destructive' });
        }
      }
    }

    toast({ 
      title: 'Modifi !', 
      description: isSplit 
        ? `L'article a t mis  jour et spar en ${splitCount} articles (prix diffrents).` 
        : `L'article a t mis  jour.` 
    });
    onOpenChange(false);
  };

  const handleDuplicate = () => {
    if (!user || !firestore || !article || !formData) return;
    
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
      createdAt: serverTimestamp(),
      colorBreakdown: colorBreakdown && colorBreakdown.length > 0 ? colorBreakdown : null,
    };
    
    setDocumentNonBlocking(docRef, duplicateData, { merge: true });
    toast({ title: "Article Dupliqu", description: `Un nouvel article a t cr  l'identique.` });
    onOpenChange(false);
  };

  const handleSplit = () => {
    if (!user || !firestore || !article || !colorBreakdown) return;

    if (Array.isArray(colorBreakdown) && colorBreakdown.length > 1) {
      const selectedColorCodes = Object.keys(splitColorQtys).filter(k => splitColorQtys[k] > 0);
      
      if (selectedColorCodes.length === 0) {
        toast({ variant: 'destructive', title: 'Aucune slection', description: 'Veuillez saisir une quantit pour au moins une couleur.' });
        return;
      }

      let allColorsCompletelySent = true;
      for (const row of colorBreakdown) {
        if ((splitColorQtys[row.colorCode] || 0) < Number(row.rolls)) {
          allColorsCompletelySent = false;
          break;
        }
      }
      
      if (allColorsCompletelySent) {
        toast({ variant: 'destructive', title: 'Toute la commande slectionne', description: 'Vous avez slectionn toute la quantit de toutes les couleurs. Utilisez simplement la sauvegarde normale.' });
        return;
      }

      const splitRows: any[] = [];
      const remainRows: any[] = [];
      
      for (const row of colorBreakdown) {
        const sentQty = splitColorQtys[row.colorCode] || 0;
        const origQty = Number(row.rolls) || 0;
        if (sentQty > 0) {
          splitRows.push({ ...row, rolls: sentQty });
        }
        if (origQty - sentQty > 0) {
          remainRows.push({ ...row, rolls: origQty - sentQty });
        }
      }

      const splitTotal = splitRows.reduce((s: number, r: any) => s + (Number(r.rolls) || 0), 0);
      const remainTotal = remainRows.reduce((s: number, r: any) => s + (Number(r.rolls) || 0), 0);

      const newId = crypto.randomUUID();
      const newRef = doc(firestore, 'users', user.uid, 'articles', newId);
      setDocumentNonBlocking(newRef, {
        ...formData,
        id: newId,
        name: formData.categoryId,
        generalCategoryId: selectedGenCatId,
        factureId: '',
        status: 'TRANSIT',
        arrivalDate: '',
        stockEntryDate: '',
        createdAt: serverTimestamp(),
        quantity: splitTotal,
        color: splitRows.length === 1 ? splitRows[0].colorCode : 'various',
        colorBreakdown: splitRows.length > 1 ? splitRows : null,
      }, { merge: true });

      const originalRef = doc(firestore, 'users', user.uid, 'articles', article.id);
      updateDocumentNonBlocking(originalRef, {
        quantity: remainTotal,
        color: remainRows.length === 1 ? remainRows[0].colorCode : 'various',
        colorBreakdown: remainRows.length > 1 ? remainRows : null,
      });

      toast({ title: ' Fractionn !', description: `Une partie a t dplace vers un nouvel article en TRANSIT.` });
    } else {
      const qty = Number(splitQty);
      const origQty = Number(formData.quantity) || 0;
      if (!qty || qty <= 0) {
        toast({ variant: 'destructive', title: 'Quantit invalide', description: 'Entrez une quantit  fractionner.' });
        return;
      }
      if (qty >= origQty) {
        toast({ variant: 'destructive', title: 'Quantit trop grande', description: `La quantit fractionne doit tre infrieure  ${origQty}.` });
        return;
      }

      // Nouvel article
      const newId = crypto.randomUUID();
      const newRef = doc(firestore, 'users', user.uid, 'articles', newId);
      setDocumentNonBlocking(newRef, {
        ...formData,
        id: newId,
        name: formData.categoryId,
        generalCategoryId: selectedGenCatId,
        factureId: '',
        status: 'TRANSIT',
        arrivalDate: '',
        stockEntryDate: '',
        createdAt: serverTimestamp(),
        quantity: qty,
        colorBreakdown: null,
      }, { merge: true });

      // Original rduit
      const originalRef = doc(firestore, 'users', user.uid, 'articles', article.id);
      updateDocumentNonBlocking(originalRef, { quantity: origQty - qty });

      toast({ title: ' Fractionn !', description: `${qty} units dplaces vers un nouvel article en TRANSIT.` });
    }

    setSplitOpen(false);
    setSplitSelectedColors(new Set());
    setSplitQty(0);
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
            <DialogTitle className="text-xl font-black uppercase tracking-tight leading-none">Paramtrage Article</DialogTitle>
            <p className="text-[10px] font-bold text-stone-400 uppercase tracking-widest mt-1">Mise  jour des donnes logistiques</p>
          </div>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label className="text-[10px] font-black text-stone-400 uppercase tracking-widest flex items-center gap-1">
                <Layers className="w-3 h-3" /> Ple Logistique
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
                   {/* Taille - caché pour Fabric */}
            {!isFabric && (
              <div className="space-y-1.5">
                <Label className="text-[10px] font-black text-stone-400 uppercase tracking-widest flex items-center gap-1">
                  <Maximize className="w-3 h-3" /> Taille / Dimension
                </Label>
                {sizeBreakdown && sizeBreakdown.length > 0 ? (
                  <div className="h-12 border border-teal-200 bg-teal-50 rounded-xl flex items-center px-4 shadow-inner">
                    <span className="text-[10px] font-black text-teal-700 uppercase tracking-widest">VARIOUS (multi-tailles)</span>
                  </div>
                ) : availableSizes.length > 0 ? (
                  <Select value={formData.size || ''} onValueChange={v => setFormData((prev: any) => ({ ...prev, size: v }))}>
                    <SelectTrigger className="h-12 border-stone-200 bg-white font-bold rounded-xl">
                      <SelectValue placeholder="Choisir la taille..." />
                    </SelectTrigger>
                    <SelectContent>
                      {availableSizes.map((sz: string) => (
                        <SelectItem key={sz} value={sz} className="font-bold uppercase">{sz}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                ) : (
                  <Input
                    value={formData.size || ''}
                    onChange={e => setFormData((prev: any) => ({ ...prev, size: e.target.value }))}
                    className="h-12 border-stone-200 font-bold rounded-xl"
                    placeholder="Ex: No.5, 20cm..."
                  />
                )}
              </div>
            )}

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

                 {/* ── Fabric fields ── */}
            {isFabric && (
              <div className="space-y-3 p-4 rounded-2xl bg-violet-50/50 border border-violet-100 md:col-span-2">
                <p className="text-[9px] font-black text-violet-600 uppercase tracking-widest flex items-center gap-1.5">
                  <Maximize className="w-3 h-3" /> Spécifications Fabric
                </p>
                {fabricQualities.length > 0 ? (
                  <>
                    <div className="space-y-1.5">
                      <Label className="text-[10px] font-black text-violet-500 uppercase tracking-widest">Qualité</Label>
                      <Select onValueChange={v => {
                        const q = fabricQualities[Number(v)];
                        if (q) setFormData((p: any) => ({ ...p, size: q.fabricWidth ? `${q.fabricWidth}cm` : p.size, gsm: q.gsm || '', fabricWidth: q.fabricWidth || '', rollLength: q.rollLength || '', rollLengthUnit: q.rollLengthUnit || 'm', packagingPerBag: q.packagingPerBag || '' }));
                      }}>
                        <SelectTrigger className="h-11 border-violet-200 bg-white font-bold rounded-xl text-violet-700">
                          <SelectValue placeholder="Choisir une qualité..." />
                        </SelectTrigger>
                        <SelectContent>
                          {fabricQualities.map((q: any, i: number) => (
                            <SelectItem key={i} value={String(i)} className="font-bold text-[11px]">{q.label}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    {/* Show current values as badges */}
                    {(formData.gsm || formData.fabricWidth) && (
                      <div className="flex flex-wrap gap-1.5">
                        {formData.gsm && <span className="px-2 py-1 rounded-lg bg-violet-100 text-violet-700 text-[10px] font-black">{formData.gsm} g/m²</span>}
                        {formData.fabricWidth && <span className="px-2 py-1 rounded-lg bg-blue-100 text-blue-700 text-[10px] font-black">{formData.fabricWidth} cm</span>}
                        {formData.rollLength && <span className="px-2 py-1 rounded-lg bg-stone-100 text-stone-600 text-[10px] font-black">{formData.rollLength}{formData.rollLengthUnit || 'm'}/rlx</span>}
                        {formData.packagingPerBag && <span className="px-2 py-1 rounded-lg bg-amber-100 text-amber-700 text-[10px] font-black">{formData.packagingPerBag} rlx/sac</span>}
                      </div>
                    )}
                  </>
                ) : (
                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-1.5">
                      <Label className="text-[10px] font-black text-stone-400 uppercase tracking-widest">GSM (g/m²)</Label>
                      <Input type="number" placeholder="Ex: 225" className="h-11 border-stone-200 font-bold rounded-xl"
                        value={formData.gsm || ''} onChange={e => setFormData((p: any) => ({ ...p, gsm: e.target.value }))} />
                    </div>
                    <div className="space-y-1.5">
                      <Label className="text-[10px] font-black text-stone-400 uppercase tracking-widest">Largeur (cm)</Label>
                      <Input type="number" placeholder="Ex: 160" className="h-11 border-stone-200 font-bold rounded-xl"
                        value={formData.fabricWidth || ''} onChange={e => setFormData((p: any) => ({ ...p, fabricWidth: e.target.value }))} />
                    </div>
                    <div className="space-y-1.5">
                      <Label className="text-[10px] font-black text-stone-400 uppercase tracking-widest">Longueur Rlx</Label>
                      <div className="flex gap-1">
                        <Input type="number" placeholder="Ex: 100" className="h-11 border-stone-200 font-bold rounded-xl flex-1"
                          value={formData.rollLength || ''} onChange={e => setFormData((p: any) => ({ ...p, rollLength: e.target.value }))} />
                        <Select value={formData.rollLengthUnit || 'm'} onValueChange={v => setFormData((p: any) => ({ ...p, rollLengthUnit: v }))}>
                          <SelectTrigger className="w-[70px] h-11 border-stone-200 bg-stone-50 font-bold rounded-xl px-2">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="m" className="font-bold">m</SelectItem>
                            <SelectItem value="yds" className="font-bold">yds</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                    </div>
                    <div className="space-y-1.5">
                      <Label className="text-[10px] font-black text-stone-400 uppercase tracking-widest">Rlx par sac</Label>
                      <Input type="number" placeholder="Ex: 10" className="h-11 border-stone-200 font-bold rounded-xl"
                        value={formData.packagingPerBag || ''} onChange={e => setFormData((p: any) => ({ ...p, packagingPerBag: e.target.value }))} />
                    </div>
                  </div>
                )}
              </div>
            )}

            <div className="space-y-1.5 md:col-span-2">
              <Label className="text-[10px] font-black text-stone-400 uppercase tracking-widest flex items-center gap-1">
                <ClipboardList className="w-3 h-3" /> {isZipper ? 'Notes Additionnelles' : 'Dtails Techniques / Spcifications'}
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

            {/*  Design Picker  zipper & slider  */}
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
              {colorBreakdown && colorBreakdown.length > 1 ? (
                <div className="flex items-center gap-2">
                  <div className="flex-1 h-12 border border-violet-200 bg-violet-50 rounded-xl flex items-center px-3">
                    <span className="text-[10px] font-black text-violet-700 uppercase">VARIOUS (multi-couleurs)</span>
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      setColorBreakdown(null);
                      setFormData((p: any) => ({ ...p, color: '', colorBreakdown: null }));
                    }}
                    className="shrink-0 h-12 px-3 rounded-xl border border-stone-200 bg-white text-[9px] font-black text-stone-500 hover:bg-red-50 hover:border-red-200 hover:text-red-600 transition-all uppercase tracking-wide"
                    title="Passer  une couleur unique"
                  >
                    Couleur unique
                  </button>
                </div>
              ) : (
                <Select
                  value={formData.color || ''}
                  onValueChange={v => setFormData((p: any) => ({ ...p, color: v }))}
                >
                  <SelectTrigger className="h-12 border-stone-200 bg-white font-bold rounded-xl uppercase">
                    <SelectValue placeholder="Choisir..." />
                  </SelectTrigger>
                  <SelectContent>
                    {COLORS.map(c => (
                      <SelectItem key={c} value={c} className="font-bold uppercase">{c}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            </div>
            <div className="space-y-1.5">
              <Label className="text-[10px] font-black text-stone-400 uppercase tracking-widest flex items-center gap-1">
                <Ruler className="w-3 h-3" /> Unit
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
                <Label className="text-[10px] font-black text-stone-400 uppercase tracking-widest">Quantit</Label>
                {colorBreakdown && colorBreakdown.length > 0 ? (
                  <div className="h-12 border border-violet-200 bg-violet-50 rounded-xl flex items-center px-3 justify-between">
                    <span className="text-[10px] font-black text-violet-700">{(formData.quantity || 0).toLocaleString()} {formData.unitOfMeasure}</span>
                    <span className="text-[9px] font-bold text-violet-400 uppercase">calcul auto</span>
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
                    <SelectItem value="todo" className="font-bold text-stone-600 uppercase"> faire</SelectItem>
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

            {/* Dlai de production estim  dans le formulaire principal */}
            <div className="space-y-1.5 md:col-span-2">
              <Label className="text-[10px] font-black text-stone-400 uppercase tracking-widest flex items-center gap-1">
                <Clock className="w-3 h-3" /> Dlai de production estim
              </Label>
              <Input
                placeholder="Ex: 30 jours, 6 semaines..."
                value={formData.estimatedProductionDelay || ''}
                onChange={e => setFormData((prev: any) => ({ ...prev, estimatedProductionDelay: e.target.value }))}
                className="h-12 border-stone-200 font-bold rounded-xl"
              />
            </div>

            {/*  Photo du Produit  */}
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
                      <span className="text-[9px] text-stone-300 mt-0.5">JPG, PNG, WEBP  max 5 MB</span>
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
                {isDesignCategory && formData.categoryId && (
                  <DesignBreakdownInput
                    categoryId={(subCategories || []).find((sc: any) => sc.name === formData?.categoryId)?.id}
                    value={designBreakdown}
                    onChange={handleDesignBreakdownChange}
                    unit={formData.unitOfMeasure}
                  />
                )}
                <SizeBreakdownInput
                  value={sizeBreakdown}
                  onChange={handleSizeBreakdownChange}
                  unit={formData.unitOfMeasure}
                  availableSizes={availableSizes}
                />
              </div>
              <Label className="text-[10px] font-black text-stone-500 uppercase tracking-widest">tat & Logistique</Label>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {/* If article has a dossier  status is automatic (TRANSIT/CUSTOMS/STOCK) */}
                {formData.factureId && formData.factureId !== 'NONE' ? (
                  <div className="md:col-span-2 space-y-2">
                    {/* Auto status display */}
                    <div className="h-12 border border-stone-200 bg-stone-50 rounded-xl px-4 flex items-center gap-3">
                      <span className="text-[10px] font-black text-stone-400 uppercase tracking-widest">Statut logistique :</span>
                      <span className="text-[11px] font-black text-stone-900 uppercase">{article?.status || formData.status}</span>
                      <span className="ml-auto text-[9px] text-stone-400 font-medium italic"> Calcul depuis le dossier {formData.factureId}</span>
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
                        {formData.status === 'DELIVERED' ? ' Livr au client (cliquer pour annuler)' : ' Marquer comme Livr au Client'}
                      </button>
                    )}
                  </div>
                ) : (
                  <Select value={formData.status} onValueChange={v => setFormData((p: any) => ({ ...p, status: v }))}>
                    <SelectTrigger className="h-12 border-stone-200 bg-white font-bold rounded-xl">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="TO_ORDER" className="font-bold uppercase">  Commander</SelectItem>
                      <SelectItem value="PI" className="font-bold text-amber-600 uppercase"> Production Lance (PI)</SelectItem>
                      <SelectItem
                        value="DELIVERED"
                        className="font-bold text-emerald-600 uppercase"
                        disabled={!formData.isPreorder || !formData.clientName}
                      >
                         Livr au Client {!formData.isPreorder || !formData.clientName ? '(Req. Client)' : ''}
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
                    <Input
                      type="number"
                      step="1"
                      placeholder="Pices / CTN"
                      value={formData.pcsPerCtn || ''}
                      onChange={e => setFormData((prev: any) => ({ ...prev, pcsPerCtn: parseInt(e.target.value) || 0 }))}
                      className="h-12 border-stone-200 font-bold rounded-xl"
                    />
                  </>
                )}
              </div>
            </div>

            {/* Prcommande client */}
            <div className={`p-4 rounded-xl border transition-all md:col-span-2 ${formData.isPreorder ? 'bg-indigo-50 border-indigo-200' : 'bg-stone-50 border-dashed border-stone-200'}`}>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <UserCircle2 className={`w-4 h-4 ${formData.isPreorder ? 'text-indigo-600' : 'text-stone-400'}`} />
                  <span className={`text-[10px] font-black uppercase tracking-widest ${formData.isPreorder ? 'text-indigo-700' : 'text-stone-500'}`}>
                    Prcommande Client
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
                     L&apos;email du client est rcupr automatiquement depuis son accs portail.
                  </p>
                </div>
              )}
              {!formData.isPreorder && (
                <p className="text-[9px] font-bold text-stone-400 uppercase mt-2 text-center italic">
                  Activer si cet article est prcommand par un client
                </p>
              )}
            </div>
          </div>
          {/*  Fractionner  */}
          {splitOpen && (
            <div className="rounded-2xl border-2 border-dashed border-orange-300 bg-orange-50 p-4 space-y-3">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-[11px] font-black text-orange-700 uppercase tracking-widest flex items-center gap-1.5"><Scissors className="w-3.5 h-3.5" /> Fractionner la commande</p>
                  <p className="text-[9px] text-orange-500 font-bold mt-0.5">Sparez une partie en un nouvel article  l&apos;original sera rduit en consquence.</p>
                </div>
                <button type="button" onClick={() => setSplitOpen(false)} className="text-orange-400 hover:text-orange-700"><XIcon className="w-4 h-4" /></button>
              </div>

              {Array.isArray(colorBreakdown) && colorBreakdown.length > 1 ? (
                <div className="space-y-2">
                  <p className="text-[9px] font-black text-orange-600 uppercase">Saisissez la quantit  fractionner par couleur :</p>
                  <div className="space-y-1.5">
                    {colorBreakdown.map(row => {
                      const rowMax = Number(row.rolls) || 0;
                      const val = splitColorQtys[row.colorCode] || '';
                      const isSelected = !!val && val > 0;
                      return (
                        <div key={row.colorCode} className={`flex items-center gap-2 px-3 py-1.5 rounded-xl border transition-all ${
                          isSelected ? 'bg-orange-100 border-orange-400' : 'bg-white border-stone-200'
                        }`}>
                          <span className="text-[10px] font-black uppercase w-20 truncate text-stone-700">{row.colorCode}</span>
                          <Input
                            type="number"
                            min={0}
                            max={rowMax}
                            value={val}
                            onChange={e => {
                              let n = Number(e.target.value);
                              if (n > rowMax) n = rowMax;
                              if (n < 0) n = 0;
                              setSplitColorQtys(prev => ({ ...prev, [row.colorCode]: n }));
                            }}
                            placeholder="0"
                            className="h-9 border-orange-200 bg-white font-bold rounded-lg flex-1 text-right text-[11px]"
                          />
                          <span className="text-[9px] text-stone-400 font-bold w-16 text-right">/ {rowMax} {formData.unitOfMeasure}</span>
                        </div>
                      );
                    })}
                  </div>

                  {/* Rcapitulatif automatique */}
                  {Object.values(splitColorQtys).some(v => v > 0) && (() => {
                    const transitQty = Object.values(splitColorQtys).reduce((s, v) => s + (v || 0), 0);
                    const remainQty = Number(formData.quantity) - transitQty;
                    return (
                      <div className="grid grid-cols-2 gap-2 mt-1">
                        <div className="bg-blue-50 border border-blue-200 rounded-xl p-3">
                          <p className="text-[8px] font-black text-blue-500 uppercase tracking-widest mb-1"> Nouvel article  Transit</p>
                          <p className="text-[12px] font-black text-blue-800">{transitQty} {formData.unitOfMeasure}</p>
                        </div>
                        <div className="bg-amber-50 border border-amber-200 rounded-xl p-3">
                          <p className="text-[8px] font-black text-amber-500 uppercase tracking-widest mb-1"> Article original  Production</p>
                          <p className="text-[12px] font-black text-amber-800">{remainQty} {formData.unitOfMeasure}</p>
                        </div>
                      </div>
                    );
                  })()}
                </div>
              ) : (
                <div className="space-y-2">
                  <p className="text-[9px] font-black text-orange-600 uppercase">Quantit  fractionner (max {formData.quantity}) :</p>
                  <div className="flex items-center gap-2">
                    <Input
                      type="number"
                      min={1}
                      max={(Number(formData.quantity) || 1) - 1}
                      value={splitQty || ''}
                      onChange={e => setSplitQty(Number(e.target.value))}
                      placeholder="Ex: 500"
                      className="h-11 border-orange-200 bg-white font-bold rounded-xl flex-1"
                    />
                    <span className="text-[10px] font-bold text-orange-600">{formData.unitOfMeasure}</span>
                  </div>
                  {splitQty > 0 && Number(formData.quantity) > splitQty && (
                    <div className="grid grid-cols-2 gap-2 mt-1">
                      <div className="bg-blue-50 border border-blue-200 rounded-xl p-3">
                        <p className="text-[8px] font-black text-blue-500 uppercase tracking-widest mb-1"> Nouvel article  Transit</p>
                        <p className="text-[11px] font-black text-blue-800">{splitQty} {formData.unitOfMeasure}</p>
                        <p className="text-[9px] text-blue-500 font-bold uppercase">{formData.color || ''}</p>
                      </div>
                      <div className="bg-amber-50 border border-amber-200 rounded-xl p-3">
                        <p className="text-[8px] font-black text-amber-500 uppercase tracking-widest mb-1"> Article original  Production</p>
                        <p className="text-[11px] font-black text-amber-800">{Number(formData.quantity) - splitQty} {formData.unitOfMeasure}</p>
                        <p className="text-[9px] text-amber-500 font-bold uppercase">{formData.color || ''}</p>
                      </div>
                    </div>
                  )}
                </div>
              )}

              <Button
                type="button"
                onClick={handleSplit}
                className="w-full bg-orange-500 hover:bg-orange-600 text-white font-black uppercase text-[10px] tracking-widest h-12 rounded-xl gap-2"
              >
                <Scissors className="w-4 h-4" /> Confirmer le fractionnement
              </Button>
            </div>
          )}

          <div className="flex flex-col md:flex-row gap-3 pt-2">
            <Button
              type="button"
              onClick={() => { setSplitOpen(s => !s); setSplitColorQtys({}); setSplitQty(0); }}
              variant="outline"
              className="flex-1 border-orange-200 text-orange-600 hover:bg-orange-50 hover:text-orange-700 font-black uppercase text-[10px] tracking-widest h-14 rounded-xl gap-2 transition-colors"
            >
              <Scissors className="w-4 h-4" /> Fractionner
            </Button>
            <Button 
              type="button" 
              onClick={handleDuplicate}
              variant="outline"
              className="flex-1 border-amber-200 text-amber-700 hover:bg-amber-50 hover:text-amber-800 font-black uppercase text-[10px] tracking-widest h-14 rounded-xl gap-2 transition-colors"
            >
              <Copy className="w-4 h-4" /> Dupliquer
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
