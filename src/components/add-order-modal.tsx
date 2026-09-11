
"use client";

import React, { useState, useMemo, useCallback } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useUser, useFirestore, useCollection, useMemoFirebase } from '@/firebase';
import { doc, collection, serverTimestamp } from 'firebase/firestore';
import { useToast } from '@/hooks/use-toast';
import { setDocumentNonBlocking } from '@/firebase/non-blocking-updates';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
  SelectGroup, SelectLabel
} from '@/components/ui/select';
import {
  Layers, Package, Save, Palette, Ruler, ClipboardList,
  Maximize, Settings2, MousePointer2, Scissors, UserCircle2,
  AlertCircle, DollarSign, Building2, Star, ChevronRight, Mail, Clock
} from 'lucide-react';
import { Switch } from '@/components/ui/switch';
import ColorBreakdownInput, { ColorBreakdownRow } from './color-breakdown-input';
import SizeBreakdownInput, { SizeBreakdownRow } from './size-breakdown-input';
import DesignBreakdownInput, { DesignBreakdownRow } from './design-breakdown-input';
import QualityBreakdownInput, { QualityBreakdownRow } from './quality-breakdown-input';
import DesignPicker from './design-picker';
import { findLastOrderPrice } from '@/lib/order-utils';
import { isFabricLineOrCategory, isZipperLineOrCategory } from '@/lib/constants';

const UNITS = ["pièces", "doz", "gross (144p)", "m", "rolls", "kg", "bag", "yds"];
const COLORS = ["white", "black", "raw black", "raw white", "various", "various x black", "various x white", "nickel", "various x black x white", "silver", "gold", "black x white", "beige", "black nickel", "transparent"];
const ZIPPER_TYPES = ["O/E", "C/E"];
const SLIDER_TYPES = ["A/L", "P/L", "N/L", "SEMI A/L"];
const PRIORITY_CONFIG = [
  { value: 'urgent',    label: 'Urgent',    color: 'bg-red-500',   dot: 'bg-red-500',   text: 'text-red-700',   bg: 'bg-red-50 border-red-200' },
  { value: 'important', label: 'Important', color: 'bg-amber-500', dot: 'bg-amber-500', text: 'text-amber-700', bg: 'bg-amber-50 border-amber-200' },
  { value: 'todo',      label: 'À faire',   color: 'bg-stone-400', dot: 'bg-stone-400', text: 'text-stone-600', bg: 'bg-stone-50 border-stone-200' },
];

const EMPTY_FORM = {
  supplierId: '',
  categoryId: '',
  specs: '',
  quantity: '' as string | number,
  unitOfMeasure: 'pièces',
  color: 'white',
  size: '',
  zipperType: '',
  slider: '',
  sliderType: '',
  purchasePricePerUnit: '' as string | number,
  priority: 'todo',
  isPreorder: false,
  clientName: '',
  clientEmail: '',
  estimatedProductionDelay: '',
  designRef: '',
  designImageUrl: '',
  // Fabric fields
  gsm: '' as string | number,
  fabricWidth: '' as string | number,
  rollLength: '' as string | number,
  rollLengthUnit: 'm' as 'm' | 'yds',
  packagingPerBag: '' as string | number,
  // Zipper fields
  tapeWeightGsm: '' as string | number,
  sliderWeightG: '' as string | number,
  pcsPerBag: '' as string | number,
  bagsPerCarton: '' as string | number,
};

export function AddOrderForm({ 
  onClose,
  isInventoryMode = false,
  activeStore = 'CHRIFA',
  adminUid = null,
  onSuccess
}: { 
  onClose: () => void,
  isInventoryMode?: boolean,
  activeStore?: string,
  adminUid?: string | null,
  onSuccess?: (payload: any) => void
}) {
  const { user } = useUser();
  const firestore = useFirestore();
  const { toast } = useToast();

  const effectiveUid = adminUid || user?.uid;

  const genCatsRef = useMemoFirebase(() => effectiveUid ? collection(firestore, 'users', effectiveUid, 'generalCategories') : null, [firestore, effectiveUid]);
  const subCatsRef = useMemoFirebase(() => effectiveUid ? collection(firestore, 'users', effectiveUid, 'categories') : null, [firestore, effectiveUid]);
  const articlesRef = useMemoFirebase(() => effectiveUid ? collection(firestore, 'users', effectiveUid, 'articles') : null, [firestore, effectiveUid]);

  const { data: generalCategories = [] } = useCollection(genCatsRef);
  const { data: subCategories = [] } = useCollection(subCatsRef);
  const { data: allArticles = [] } = useCollection(articlesRef);

  const [selectedGenCatId, setSelectedGenCatId] = useState<string>('');
  const [qualityBreakdown, setQualityBreakdown] = useState<QualityBreakdownRow[] | null>(null);
  const [colorBreakdown, setColorBreakdown] = useState<ColorBreakdownRow[] | null>(null);
  const [sizeBreakdown, setSizeBreakdown] = useState<SizeBreakdownRow[] | null>(null);
  const [designBreakdown, setDesignBreakdown] = useState<DesignBreakdownRow[] | null>(null);
  const [isFullContainer, setIsFullContainer] = useState(false);
  const [formData, setFormData] = useState<any>({ ...EMPTY_FORM });

  // Derive unique supplier list from past articles for autocomplete
  const knownSuppliers = useMemo(() => {
    const set = new Set<string>();
    (allArticles || []).forEach((a: any) => { if (a.supplierId) set.add(a.supplierId); });
    return Array.from(set).sort();
  }, [allArticles]);

  // Find last order price for selected product / variant
  const lastOrderInfo = useMemo(() => {
    if (!formData.categoryId) return null;
    return findLastOrderPrice(
      {
        categoryId: formData.categoryId,
        name: formData.categoryId,
        size: formData.size,
        color: formData.color,
        specs: formData.specs,
        zipperType: formData.zipperType,
        slider: formData.slider,
        sliderType: formData.sliderType,
        gsm: formData.gsm,
        fabricWidth: formData.fabricWidth,
        tapeWeightGsm: formData.tapeWeightGsm,
        sliderWeightG: formData.sliderWeightG,
      },
      allArticles || []
    );
  }, [
    formData.categoryId,
    formData.size,
    formData.color,
    formData.specs,
    formData.zipperType,
    formData.slider,
    formData.sliderType,
    formData.gsm,
    formData.fabricWidth,
    formData.tapeWeightGsm,
    formData.sliderWeightG,
    allArticles
  ]);

  const handleColorBreakdownChange = useCallback((rows: ColorBreakdownRow[] | null, total: number) => {
    if (rows && rows.length === 1) {
      setColorBreakdown(null);
      setFormData((p: any) => ({ ...p, quantity: total, color: rows[0].colorCode || '' }));
    } else if (rows && rows.length > 1) {
      setColorBreakdown(rows);
      setFormData((p: any) => ({ ...p, quantity: total, color: 'various' }));
    } else {
      setColorBreakdown(null);
    }
  }, []);

  const handleSizeBreakdownChange = useCallback((rows: SizeBreakdownRow[] | null, total: number) => {
    if (rows && rows.length === 1) {
      setSizeBreakdown(null);
      setFormData((p: any) => ({ ...p, quantity: total, size: rows[0].size || '' }));
    } else if (rows && rows.length > 1) {
      setSizeBreakdown(rows);
      setFormData((p: any) => ({ ...p, quantity: total, size: 'various' }));
    } else {
      setSizeBreakdown(null);
    }
  }, []);

  const handleDesignBreakdownChange = useCallback((rows: DesignBreakdownRow[] | null, total: number) => {
    setDesignBreakdown(rows);
    if (rows && rows.length > 0) {
      setFormData((p: any) => ({ ...p, quantity: total, designRef: 'various' }));
    }
  }, []);

  const handleQualityBreakdownChange = useCallback((rows: QualityBreakdownRow[] | null, total: number) => {
    if (rows && rows.length === 1) {
      setQualityBreakdown(null);
      const q = rows[0];
      setFormData((p: any) => ({
        ...p,
        quantity: total,
        ...(q.gsm ? { gsm: q.gsm } : {}),
        ...(q.fabricWidth ? { fabricWidth: q.fabricWidth } : {}),
        ...(q.rollLength ? { rollLength: q.rollLength, rollLengthUnit: q.rollLengthUnit || 'm' } : {}),
        ...(q.packagingPerBag ? { packagingPerBag: q.packagingPerBag } : {}),
        ...(q.size ? { size: q.size } : {}),
        ...(q.zipperType ? { zipperType: q.zipperType } : {}),
        ...(q.slider ? { slider: q.slider } : {}),
        ...(q.sliderType ? { sliderType: q.sliderType } : {}),
        ...(q.tapeWeightGsm ? { tapeWeightGsm: q.tapeWeightGsm } : {}),
        ...(q.sliderWeightG ? { sliderWeightG: q.sliderWeightG } : {}),
        ...(q.pcsPerBag ? { pcsPerBag: q.pcsPerBag } : {}),
        ...(q.bagsPerCarton ? { bagsPerCarton: q.bagsPerCarton } : {}),
      }));
    } else if (rows && rows.length > 1) {
      setQualityBreakdown(rows);
      setFormData((p: any) => ({ ...p, quantity: total }));
    } else {
      setQualityBreakdown(null);
    }
  }, []);

  const filteredSubCategories = useMemo(() => {
    if (!selectedGenCatId) return [];
    const filtered = (subCategories || []).filter((sc: any) => sc.generalCategoryId === selectedGenCatId);

    const getGroupIndex = (name: string) => {
      const n = (name || '').toLowerCase().trim();
      const fabricKw   = ["fabric", "non woven", "t/c fabric", "popeline", "leather", "felt fabric", "polyester fabric", "taffeta fabric", "woven interlining"];
      const sliderKw   = ["puller", "slider for nylon zipper", "slider for plastic zipper", "slider for metal zipper"];
      const zipperKw   = ["zipper", "plastic zipper", "nylon zipper", "metal zipper", "zipper long chain", "nylon zipper long chain"];
      const buttonKw   = ["covered mould button", "snap button", "button"];
      if (fabricKw.some(k => n.includes(k)))  return 1;
      if (sliderKw.some(k => n.includes(k)))  return 2;
      if (zipperKw.some(k => n.includes(k)))  return 3;
      if (buttonKw.some(k => n.includes(k)))  return 4;
      return 5;
    };

    return filtered.sort((a: any, b: any) => {
      const diff = getGroupIndex(a.name) - getGroupIndex(b.name);
      return diff !== 0 ? diff : (a.name || '').localeCompare(b.name || '');
    });
  }, [selectedGenCatId, subCategories]);

  const isZipper = useMemo(() => {
    let genCatId = selectedGenCatId;
    if (!genCatId && formData.categoryId) {
      const cat = (subCategories || []).find((sc: any) => sc.name === formData.categoryId);
      if (cat) genCatId = cat.generalCategoryId;
    }
    const genCat = genCatId ? (generalCategories || []).find((gc: any) => gc.id === genCatId) : null;
    return isZipperLineOrCategory(formData.categoryId, genCat);
  }, [selectedGenCatId, generalCategories, formData.categoryId, subCategories]);

  const isSlider = useMemo(() => {
    const upper = (formData.categoryId || '').toUpperCase();
    return upper.includes('SLIDER') || upper.includes('PULLER');
  }, [formData.categoryId]);

  const isDesignCategory = useMemo(() => {
    const upper = (formData.categoryId || '').toUpperCase();
    return isZipper || isSlider || upper.includes('PRINT') || upper.includes('DESIGN') || upper.includes('PATTERN');
  }, [isZipper, isSlider, formData.categoryId]);

  const availableSizes = useMemo(() => {
    if (!formData.categoryId) return [];
    const cat = (subCategories || []).find((sc: any) => sc.name === formData.categoryId);
    return Array.isArray(cat?.availableSizes) && cat.availableSizes.length > 0 ? cat.availableSizes : [];
  }, [formData.categoryId, subCategories]);

  // ── Fabric detection — check pôle line, specType, keywords ──
  const isFabric = useMemo(() => {
    let genCatId = selectedGenCatId;
    if (!genCatId && formData.categoryId) {
      const cat = (subCategories || []).find((sc: any) => sc.name === formData.categoryId);
      if (cat) genCatId = cat.generalCategoryId;
    }
    const genCat = genCatId ? (generalCategories || []).find((gc: any) => gc.id === genCatId) : null;
    return isFabricLineOrCategory(formData.categoryId, genCat);
  }, [selectedGenCatId, generalCategories, formData.categoryId, subCategories]);

  const availableGsm = useMemo(() => {
    if (!formData.categoryId) return [];
    const cat = (subCategories || []).find((sc: any) => sc.name === formData.categoryId);
    return Array.isArray(cat?.availableGsm) && cat.availableGsm.length > 0 ? cat.availableGsm.map(String) : [];
  }, [formData.categoryId, subCategories]);

  const availableWidths = useMemo(() => {
    if (!formData.categoryId) return [];
    const cat = (subCategories || []).find((sc: any) => sc.name === formData.categoryId);
    return Array.isArray(cat?.availableWidths) && cat.availableWidths.length > 0 ? cat.availableWidths.map(String) : [];
  }, [formData.categoryId, subCategories]);

  const fabricQualities = useMemo(() => {
    if (!formData.categoryId && !selectedGenCatId) return [];
    const cat = (subCategories || []).find((sc: any) => sc.name === formData.categoryId);
    const genCatId = selectedGenCatId || cat?.generalCategoryId;
    const genCat = (generalCategories || []).find((gc: any) => gc.id === genCatId);
    const raw = [
      ...(Array.isArray(cat?.fabricQualities) ? cat.fabricQualities : []),
      ...(Array.isArray(genCat?.fabricQualities) ? genCat.fabricQualities : [])
    ];
    return raw.filter((q, idx, arr) => arr.findIndex(x => (x.label && x.label === q.label) || (x.gsm && x.gsm === q.gsm && x.fabricWidth && x.fabricWidth === q.fabricWidth)) === idx);
  }, [formData.categoryId, selectedGenCatId, subCategories, generalCategories]);

  const zipperQualities = useMemo(() => {
    if (!formData.categoryId && !selectedGenCatId) return [];
    const cat = (subCategories || []).find((sc: any) => sc.name === formData.categoryId);
    const genCatId = selectedGenCatId || cat?.generalCategoryId;
    const genCat = (generalCategories || []).find((gc: any) => gc.id === genCatId);
    const raw = [
      ...(Array.isArray(cat?.zipperQualities) ? cat.zipperQualities : []),
      ...(Array.isArray(genCat?.zipperQualities) ? genCat.zipperQualities : [])
    ];
    return raw
      .filter((q: any) => Boolean(q && (q.length || q.slider || q.tapeWeightGsm || q.sliderWeightG || q.pcsPerBag || q.bagsPerCarton || q.nameFR || (q.label && q.label !== 'C/E · (A/L)' && q.label !== 'Qualité Zipper'))))
      .filter((q, idx, arr) => arr.findIndex(x => x.label === q.label || (x.length === q.length && x.zipperType === q.zipperType && x.slider === q.slider)) === idx);
  }, [formData.categoryId, selectedGenCatId, subCategories, generalCategories]);

  // Validation
  const errors = useMemo(() => {
    const e: Record<string, string> = {};
    if (!selectedGenCatId) e.genCat = 'Requis';
    if (!formData.categoryId) e.category = 'Requis';
    if (!qualityBreakdown?.length && !colorBreakdown?.length && !sizeBreakdown?.length && !designBreakdown?.length && (!formData.quantity || Number(formData.quantity) <= 0))
      e.quantity = 'Quantité requise';
    return e;
  }, [selectedGenCatId, formData.categoryId, formData.quantity, qualityBreakdown, colorBreakdown, sizeBreakdown, designBreakdown]);

  const isValid = Object.keys(errors).length === 0;
  const priorityConf = PRIORITY_CONFIG.find(p => p.value === formData.priority) || PRIORITY_CONFIG[2];

  const resetForm = () => {
    setQualityBreakdown(null);
    setColorBreakdown(null);
    setSizeBreakdown(null);
    setDesignBreakdown(null);
    setIsFullContainer(false);
    setFormData({ ...EMPTY_FORM });
    setSelectedGenCatId('');
  };

  const handleClose = () => {
    resetForm();
    onClose();
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!user || !firestore || !isValid) return;

    const selectedSubCat = (subCategories || []).find((sc: any) => sc.name === formData.categoryId);
    const finalPrice = (formData.purchasePricePerUnit !== '' && Number(formData.purchasePricePerUnit) > 0)
      ? Number(formData.purchasePricePerUnit)
      : (lastOrderInfo?.price || 0);

    const basePayload: any = {
      ...formData,
      purchasePricePerUnit: finalPrice,
      lastOrderPrice: lastOrderInfo?.price || null,
      name: formData.categoryId,
      nameFR: formData.nameFR?.trim() || null,
      generalCategoryId: selectedGenCatId,
      status: isInventoryMode ? 'STOCK' : 'TO_ORDER',
      isFullContainer,
      createdAt: serverTimestamp(),
      hsCode: selectedSubCat?.hsCode || null,
      importDutyRate: selectedSubCat?.importDutyRate ?? null,
      tpiRate: selectedSubCat?.tpiRate ?? null,
      ticRate: selectedSubCat?.ticRate ?? null,
      tvaRate: selectedSubCat?.tvaRate ?? null,
      pcsPerCtn: selectedSubCat?.defaultPcsPerCtn ?? null,
      // Fabric fields — convert to numbers, null if empty
      gsm: formData.gsm ? Number(formData.gsm) : null,
      fabricWidth: formData.fabricWidth ? Number(formData.fabricWidth) : null,
      rollLength: formData.rollLength ? Number(formData.rollLength) : null,
      rollLengthUnit: formData.rollLength ? formData.rollLengthUnit : null,
      packagingPerBag: formData.packagingPerBag ? Number(formData.packagingPerBag) : null,
      // Zipper fields — convert to numbers, null if empty
      tapeWeightGsm: formData.tapeWeightGsm ? Number(formData.tapeWeightGsm) : null,
      sliderWeightG: formData.sliderWeightG ? Number(formData.sliderWeightG) : null,
      pcsPerBag: formData.pcsPerBag ? Number(formData.pcsPerBag) : null,
      bagsPerCarton: formData.bagsPerCarton ? Number(formData.bagsPerCarton) : null,
    };

    if (isInventoryMode) {
      basePayload.stockEntryDate = new Date().toISOString().split('T')[0];
    }

    if (qualityBreakdown && qualityBreakdown.length > 0) {
      const groups = new Map<number, QualityBreakdownRow[]>();
      for (const row of qualityBreakdown) {
        const price = (row.priceOverride !== '' && row.priceOverride !== undefined)
          ? Number(row.priceOverride)
          : Number(formData.purchasePricePerUnit || 0);
        if (!groups.has(price)) groups.set(price, []);
        groups.get(price)!.push(row);
      }
      groups.forEach((rows, price) => {
        const id = doc(collection(firestore, 'users', effectiveUid, 'articles')).id;
        const groupQty = rows.reduce((sum, r) => sum + (Number((r as any).quantity) || 0), 0);
        const extraPayload = isInventoryMode ? { initialQtyByStore: { [activeStore || 'CHRIFA']: groupQty } } : {};
        const firstRow = rows[0];
        const rowSpecs = rows.length === 1 ? {
          ...(firstRow.nameFR ? { nameFR: firstRow.nameFR } : {}),
          ...(firstRow.gsm ? { gsm: firstRow.gsm } : {}),
          ...(firstRow.fabricWidth ? { fabricWidth: firstRow.fabricWidth } : {}),
          ...(firstRow.rollLength ? { rollLength: firstRow.rollLength, rollLengthUnit: firstRow.rollLengthUnit || 'm' } : {}),
          ...(firstRow.packagingPerBag ? { packagingPerBag: firstRow.packagingPerBag } : {}),
          ...(firstRow.size ? { size: firstRow.size } : {}),
          ...(firstRow.zipperType ? { zipperType: firstRow.zipperType } : {}),
          ...(firstRow.slider ? { slider: firstRow.slider } : {}),
          ...(firstRow.sliderType ? { sliderType: firstRow.sliderType } : {}),
          ...(firstRow.tapeWeightGsm ? { tapeWeightGsm: firstRow.tapeWeightGsm } : {}),
          ...(firstRow.sliderWeightG ? { sliderWeightG: firstRow.sliderWeightG } : {}),
          ...(firstRow.pcsPerBag ? { pcsPerBag: firstRow.pcsPerBag } : {}),
          ...(firstRow.bagsPerCarton ? { bagsPerCarton: firstRow.bagsPerCarton } : {}),
        } : {};

        setDocumentNonBlocking(
          doc(firestore, 'users', effectiveUid, 'articles', id),
          {
            ...basePayload,
            ...rowSpecs,
            id,
            purchasePricePerUnit: price,
            quantity: groupQty,
            qualityBreakdown: rows,
            colorBreakdown: colorBreakdown && colorBreakdown.length > 0 ? colorBreakdown : null,
            sizeBreakdown: null,
            designBreakdown: null,
            ...extraPayload
          },
          { merge: true }
        );
      });
    } else if (designBreakdown && designBreakdown.length > 0) {
      const groups = new Map<number, DesignBreakdownRow[]>();
      for (const row of designBreakdown) {
        const price = (row.priceOverride !== '' && row.priceOverride !== undefined)
          ? Number(row.priceOverride)
          : Number(formData.purchasePricePerUnit || 0);
        if (!groups.has(price)) groups.set(price, []);
        groups.get(price)!.push(row);
      }
      groups.forEach((rows, price) => {
        const id = doc(collection(firestore, 'users', effectiveUid, 'articles')).id;
        const groupQty = rows.reduce((sum, r) => sum + (Number((r as any).quantity) || Number((r as any).rolls) || 0), 0);
        const extraPayload = isInventoryMode ? { initialQtyByStore: { [activeStore || 'CHRIFA']: groupQty } } : {};
        setDocumentNonBlocking(
          doc(firestore, 'users', effectiveUid, 'articles', id),
          { ...basePayload, id, purchasePricePerUnit: price, quantity: groupQty, designBreakdown: rows, colorBreakdown: null, sizeBreakdown: null, qualityBreakdown: null, ...extraPayload },
          { merge: true }
        );
      });
    } else if (colorBreakdown && colorBreakdown.length > 0) {
      const groups = new Map<number, ColorBreakdownRow[]>();
      for (const row of colorBreakdown) {
        const price = (row.priceOverride !== '' && row.priceOverride !== undefined)
          ? Number(row.priceOverride)
          : Number(formData.purchasePricePerUnit || 0);
        if (!groups.has(price)) groups.set(price, []);
        groups.get(price)!.push(row);
      }
      groups.forEach((rows, price) => {
        const groupQty = rows.reduce((sum, r) => sum + (Number((r as any).quantity) || Number((r as any).rolls) || 0), 0);
        const id = doc(collection(firestore, 'users', effectiveUid, 'articles')).id;
        const extraPayload = isInventoryMode ? { initialQtyByStore: { [activeStore || 'CHRIFA']: groupQty } } : {};
        setDocumentNonBlocking(
          doc(firestore, 'users', effectiveUid, 'articles', id),
          { ...basePayload, id, purchasePricePerUnit: price, quantity: groupQty, colorBreakdown: rows, sizeBreakdown: null, designBreakdown: null, qualityBreakdown: null, ...extraPayload },
          { merge: true }
        );
      });
    } else if (sizeBreakdown && sizeBreakdown.length > 0) {
      const groups = new Map<number, SizeBreakdownRow[]>();
      for (const row of sizeBreakdown) {
        const price = (row.priceOverride !== '' && row.priceOverride !== undefined)
          ? Number(row.priceOverride)
          : Number(formData.purchasePricePerUnit || 0);
        if (!groups.has(price)) groups.set(price, []);
        groups.get(price)!.push(row);
      }
      groups.forEach((rows, price) => {
        const groupQty = rows.reduce((sum, r) => sum + (Number((r as any).quantity) || Number((r as any).rolls) || 0), 0);
        const id = doc(collection(firestore, 'users', effectiveUid, 'articles')).id;
        const extraPayload = isInventoryMode ? { initialQtyByStore: { [activeStore || 'CHRIFA']: groupQty } } : {};
        setDocumentNonBlocking(
          doc(firestore, 'users', effectiveUid, 'articles', id),
          { ...basePayload, id, purchasePricePerUnit: price, quantity: groupQty, sizeBreakdown: rows, colorBreakdown: null, designBreakdown: null, qualityBreakdown: null, ...extraPayload },
          { merge: true }
        );
      });
    } else {
      const id = doc(collection(firestore, 'users', effectiveUid, 'articles')).id;
      const extraPayload = isInventoryMode ? { initialQtyByStore: { [activeStore || 'CHRIFA']: Number(formData.quantity) || 0 } } : {};
      setDocumentNonBlocking(
        doc(firestore, 'users', effectiveUid, 'articles', id),
        { ...basePayload, id, colorBreakdown: null, sizeBreakdown: null, designBreakdown: null, qualityBreakdown: null, ...extraPayload },
        { merge: true }
      );
    }

    const qualitySplitCount = qualityBreakdown ? new Set(qualityBreakdown.map(r => r.priceOverride !== '' && r.priceOverride !== undefined ? r.priceOverride : 'default')).size : 1;
    const designSplitCount = designBreakdown ? new Set(designBreakdown.map(r => r.priceOverride !== '' && r.priceOverride !== undefined ? r.priceOverride : 'default')).size : 1;
    const colorSplitCount = colorBreakdown ? new Set(colorBreakdown.map(r => r.priceOverride !== '' && r.priceOverride !== undefined ? r.priceOverride : 'default')).size : 1;
    const sizeSplitCount = sizeBreakdown ? new Set(sizeBreakdown.map(r => r.priceOverride !== '' && r.priceOverride !== undefined ? r.priceOverride : 'default')).size : 1;
    const splitCount = Math.max(qualitySplitCount, designSplitCount, colorSplitCount, sizeSplitCount);

    toast({
      title: isInventoryMode ? "✅ Produit ajouté au stock" : "✅ Besoin enregistré",
      description: isInventoryMode
        ? "L'article a été ajouté avec succès à l'inventaire."
        : (splitCount > 1
            ? `${splitCount} articles créés (auto-split par prix)`
            : "L'article a été ajouté à la liste des rappels."),
    });
    if (onSuccess) onSuccess({
      ...basePayload,
      splitCount,
      quantity: formData.quantity
    });

    resetForm();
    onClose();
  };

  // ── Grouped Select Content helper ──────────────────────────────────────────
  const GroupedCategorySelect = () => {
    const LABEL_MAP: Record<string, string> = {
      'Fabric': 'Fabric', 'Slider et puller': 'Slider / Puller',
      'Zipper': 'Zipper', 'Bouton': 'Bouton', 'Reste': 'Reste'
    };
    const groups: Record<string, any[]> = {};
    (filteredSubCategories || []).forEach((sc: any) => {
      const n = (sc.name || '').toLowerCase().trim();
      const fabricKw = ["fabric", "non woven", "t/c fabric", "popeline", "leather", "felt fabric", "polyester fabric", "taffeta fabric", "woven interlining"];
      const sliderKw = ["puller", "slider for nylon zipper", "slider for plastic zipper", "slider for metal zipper"];
      const zipperKw = ["zipper", "plastic zipper", "nylon zipper", "metal zipper", "zipper long chain", "nylon zipper long chain"];
      const buttonKw = ["covered mould button", "snap button", "button"];
      let label = 'Reste';
      if (fabricKw.some(k => n.includes(k)))  label = 'Fabric';
      else if (sliderKw.some(k => n.includes(k))) label = 'Slider et puller';
      else if (zipperKw.some(k => n.includes(k))) label = 'Zipper';
      else if (buttonKw.some(k => n.includes(k))) label = 'Bouton';
      if (!groups[label]) groups[label] = [];
      groups[label].push(sc);
    });
    return (
      <>
        {Object.entries(LABEL_MAP).map(([key, display]) => {
          if (!groups[key]?.length) return null;
          return (
            <SelectGroup key={key}>
              <SelectLabel className="text-[9px] text-stone-400 font-black uppercase tracking-widest bg-stone-50 py-2">{display}</SelectLabel>
              {groups[key].map((sc: any) => (
                <SelectItem key={sc.id} value={sc.name} className="font-bold pl-6 text-[11px]">{sc.name}</SelectItem>
              ))}
            </SelectGroup>
          );
        })}
      </>
    );
  };

  return (
    <div className="flex flex-col bg-white">
      {/* ── Header ─────────────────────────────────────────────────────── */}
        <div className="bg-gradient-to-br from-stone-900 to-stone-800 p-6 flex items-start gap-4 text-white sticky top-0 z-10">
          <div className="p-2.5 bg-amber-500/20 rounded-xl border border-amber-500/30 shrink-0 mt-0.5">
            <Package className="w-5 h-5 text-amber-400" />
          </div>
          <div className="flex-1 min-w-0">
            <h2 className="text-lg font-black uppercase tracking-tight leading-none">
              Nouvel Article
            </h2>
            <p className="text-[10px] font-bold text-stone-400 uppercase tracking-widest mt-1">
              Identification du besoin logistique
            </p>
          </div>
          {/* Priority badge in header */}
          <div className={`px-3 py-1.5 rounded-full border text-[9px] font-black uppercase tracking-widest flex items-center gap-1.5 shrink-0 ${priorityConf.bg} ${priorityConf.text}`}>
            <span className={`w-1.5 h-1.5 rounded-full ${priorityConf.dot}`} />
            {priorityConf.label}
          </div>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-5">

          {/* ── Section 1: Identification ──────────────────────────────────── */}
          <SectionLabel icon={<Layers className="w-3 h-3" />} label="Identification" />

          <div className="grid grid-cols-2 gap-3">
            {/* Pôle */}
            <div className="space-y-1.5">
              <Label className="text-[10px] font-black text-stone-400 uppercase tracking-widest flex items-center gap-1">
                <Layers className="w-3 h-3" /> Pôle
                {errors.genCat && <AlertCircle className="w-3 h-3 text-red-400 ml-auto" />}
              </Label>
              <Select value={selectedGenCatId} onValueChange={id => { setSelectedGenCatId(id); setFormData((p: any) => ({ ...p, categoryId: '' })); }}>
                <SelectTrigger className={`h-11 font-bold rounded-xl border ${errors.genCat ? 'border-red-300 bg-red-50' : 'border-stone-200 bg-white'}`}>
                  <SelectValue placeholder="Choisir..." />
                </SelectTrigger>
                <SelectContent className="max-h-72">
                  {(() => {
                    const sorted = [...(generalCategories || [])].sort((a: any, b: any) => (a.name || '').localeCompare(b.name || '', 'fr'));
                    // Group by first letter
                    const grouped: Record<string, any[]> = {};
                    sorted.forEach((gc: any) => {
                      const letter = (gc.name || '?')[0].toUpperCase();
                      if (!grouped[letter]) grouped[letter] = [];
                      grouped[letter].push(gc);
                    });
                    return Object.entries(grouped).map(([letter, items]) => (
                      <SelectGroup key={letter}>
                        <SelectLabel className="text-[9px] text-stone-400 font-black uppercase tracking-widest bg-stone-50 py-1.5">{letter}</SelectLabel>
                        {items.map((gc: any) => (
                          <SelectItem key={gc.id} value={gc.id} className="font-bold pl-6 text-[11px]">{gc.name}</SelectItem>
                        ))}
                      </SelectGroup>
                    ));
                  })()}
                </SelectContent>
              </Select>
            </div>

            {/* Type Produit */}
            <div className="space-y-1.5">
              <Label className="text-[10px] font-black text-stone-400 uppercase tracking-widest flex items-center gap-1">
                <Package className="w-3 h-3" /> Type Produit
                {errors.category && <AlertCircle className="w-3 h-3 text-red-400 ml-auto" />}
              </Label>
              <Select
                disabled={!selectedGenCatId}
                value={formData.categoryId}
                onValueChange={v => {
                  const lastForCat = findLastOrderPrice({ categoryId: v, name: v }, allArticles || []);
                  setFormData((p: any) => ({
                    ...p,
                    categoryId: v,
                    purchasePricePerUnit: (!p.purchasePricePerUnit || p.purchasePricePerUnit === 0) && lastForCat?.price ? lastForCat.price : p.purchasePricePerUnit,
                    supplierId: (!p.supplierId && lastForCat?.supplierId) ? lastForCat.supplierId : p.supplierId,
                  }));
                }}
              >
                <SelectTrigger className={`h-11 font-bold rounded-xl border ${!selectedGenCatId ? 'opacity-50' : errors.category ? 'border-red-300 bg-red-50' : 'border-stone-200 bg-white'}`}>
                  <SelectValue placeholder={selectedGenCatId ? "Choisir..." : "← Pôle d'abord"} />
                </SelectTrigger>
                <SelectContent>
                  <GroupedCategorySelect />
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* ── Section 2: Spécifications ──────────────────────────────────── */}
          <SectionLabel icon={<Settings2 className="w-3 h-3" />} label="Spécifications" />

          {/* CAS 1: Pôle Fabric */}
          {isFabric ? (
            <div className="space-y-3 p-4 rounded-2xl bg-violet-50/50 border border-violet-100">
              <div className="grid grid-cols-2 gap-3">
                {/* Qualité Fabric */}
                <div className="space-y-1.5">
                  <Label className="text-[10px] font-black text-violet-600 uppercase tracking-widest flex items-center gap-1.5">
                    <Maximize className="w-3 h-3" /> Qualité Fabric
                  </Label>
                  {qualityBreakdown && qualityBreakdown.length > 0 ? (
                    <div className="h-11 border border-fuchsia-200 bg-fuchsia-50 rounded-xl flex items-center px-3">
                      <span className="text-[10px] font-black text-fuchsia-700 uppercase">VARIOUS (multi-qualités)</span>
                    </div>
                  ) : fabricQualities.length > 0 ? (
                    <Select onValueChange={v => {
                      const q = fabricQualities[Number(v)];
                      if (q) setFormData((p: any) => ({
                        ...p,
                        size: q.fabricWidth ? `${q.fabricWidth}cm` : p.size,
                        gsm: q.gsm || '',
                        fabricWidth: q.fabricWidth || '',
                        rollLength: q.rollLength || '',
                        rollLengthUnit: q.rollLengthUnit || 'm',
                        packagingPerBag: q.packagingPerBag || '',
                        nameFR: q.nameFR || p.nameFR,
                      }));
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
                  ) : (
                    <p className="text-[9px] font-bold text-stone-400 italic py-2">
                      Aucune qualité définie dans Config & Douane
                    </p>
                  )}
                </div>

                {/* Couleur Fabric */}
                <div className="space-y-1.5">
                  <Label className="text-[10px] font-black text-stone-400 uppercase tracking-widest flex items-center gap-1">
                    <Palette className="w-3 h-3" /> Couleur
                  </Label>
                  {colorBreakdown && colorBreakdown.length > 0 ? (
                    <div className="h-11 border border-violet-200 bg-violet-50 rounded-xl flex items-center px-3">
                      <span className="text-[10px] font-black text-violet-700 uppercase">VARIOUS (multi-couleurs)</span>
                    </div>
                  ) : (
                    <Select value={formData.color} onValueChange={v => setFormData((p: any) => ({ ...p, color: v }))}>
                      <SelectTrigger className="h-11 border-stone-200 bg-white font-bold rounded-xl">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {COLORS.map(c => <SelectItem key={c} value={c} className="font-bold uppercase">{c}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  )}
                </div>
              </div>

              {/* Badges résumant la qualité choisie */}
              {qualityBreakdown && qualityBreakdown.length > 0 ? (
                <div className="flex flex-wrap gap-1.5 pt-1">
                  <span className="px-2 py-1 rounded-lg bg-fuchsia-100 text-fuchsia-700 text-[10px] font-black">
                    {qualityBreakdown.length} qualités sélectionnées ({qualityBreakdown.reduce((s, r) => s + (Number(r.quantity) || 0), 0).toLocaleString()} {formData.unitOfMeasure || 'rolls'})
                  </span>
                </div>
              ) : (formData.gsm || formData.fabricWidth || formData.rollLength) && (
                <div className="flex flex-wrap gap-1.5 pt-1">
                  {formData.gsm && <span className="px-2 py-1 rounded-lg bg-violet-100 text-violet-700 text-[10px] font-black">{formData.gsm} g/m²</span>}
                  {formData.fabricWidth && <span className="px-2 py-1 rounded-lg bg-blue-100 text-blue-700 text-[10px] font-black">{formData.fabricWidth} cm</span>}
                  {formData.rollLength && <span className="px-2 py-1 rounded-lg bg-stone-100 text-stone-600 text-[10px] font-black">{formData.rollLength}{formData.rollLengthUnit || 'm'}/rlx</span>}
                  {formData.packagingPerBag && <span className="px-2 py-1 rounded-lg bg-amber-100 text-amber-700 text-[10px] font-black">{formData.packagingPerBag} rlx/sac</span>}
                </div>
              )}

              {/* Fallback uniquement si aucune qualité définie */}
              {fabricQualities.length === 0 && (
                <div className="grid grid-cols-2 gap-3 pt-2">
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
                        <SelectTrigger className="w-[70px] h-11 border-stone-200 bg-stone-50 font-bold rounded-xl px-2"><SelectValue /></SelectTrigger>
                        <SelectContent><SelectItem value="m" className="font-bold">m</SelectItem><SelectItem value="yds" className="font-bold">yds</SelectItem></SelectContent>
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
          ) : isZipper ? (
            /* CAS 2: Pôle Zipper */
            <div className="space-y-3 p-4 rounded-2xl bg-amber-50/50 border border-amber-100">
              <div className="grid grid-cols-2 gap-3">
                {/* Qualité Zipper */}
                <div className="space-y-1.5">
                  <Label className="text-[10px] font-black text-amber-600 uppercase tracking-widest flex items-center gap-1.5">
                    <Settings2 className="w-3 h-3" /> Qualité Zipper
                  </Label>
                  {qualityBreakdown && qualityBreakdown.length > 0 ? (
                    <div className="h-11 border border-fuchsia-200 bg-fuchsia-50 rounded-xl flex items-center px-3">
                      <span className="text-[10px] font-black text-fuchsia-700 uppercase">VARIOUS (multi-qualités)</span>
                    </div>
                  ) : zipperQualities.length > 0 ? (
                    <Select onValueChange={v => {
                      const q = zipperQualities[Number(v)];
                      if (q) {
                        setFormData((p: any) => ({
                          ...p,
                          size: q.length || p.size,
                          zipperType: q.zipperType || p.zipperType,
                          slider: q.slider || p.slider,
                          sliderType: q.sliderType || p.sliderType,
                          tapeWeightGsm: q.tapeWeightGsm ?? p.tapeWeightGsm,
                          sliderWeightG: q.sliderWeightG ?? p.sliderWeightG,
                          pcsPerBag: q.pcsPerBag ?? p.pcsPerBag,
                          bagsPerCarton: q.bagsPerCarton ?? p.bagsPerCarton,
                          nameFR: q.nameFR || p.nameFR,
                        }));
                      }
                    }}>
                      <SelectTrigger className="h-11 border-amber-200 bg-white font-bold rounded-xl text-amber-800">
                        <SelectValue placeholder="Choisir une qualité..." />
                      </SelectTrigger>
                      <SelectContent>
                        {zipperQualities.map((q: any, i: number) => (
                          <SelectItem key={i} value={String(i)} className="font-bold text-[11px]">{q.label}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  ) : (
                    <p className="text-[9px] font-bold text-stone-400 italic py-2">
                      Aucune qualité définie dans Config & Douane
                    </p>
                  )}
                </div>

                {/* Couleur Zipper */}
                <div className="space-y-1.5">
                  <Label className="text-[10px] font-black text-stone-400 uppercase tracking-widest flex items-center gap-1">
                    <Palette className="w-3 h-3" /> Couleur
                  </Label>
                  {colorBreakdown && colorBreakdown.length > 0 ? (
                    <div className="h-11 border border-violet-200 bg-violet-50 rounded-xl flex items-center px-3">
                      <span className="text-[9px] font-black text-violet-700 uppercase">VARIOUS</span>
                    </div>
                  ) : (
                    <Select value={formData.color} onValueChange={v => setFormData((p: any) => ({ ...p, color: v }))}>
                      <SelectTrigger className="h-11 border-stone-200 bg-white font-bold rounded-xl">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {COLORS.map(c => <SelectItem key={c} value={c} className="font-bold uppercase">{c}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  )}
                </div>
              </div>

              {/* Badges résumant la qualité choisie */}
              {qualityBreakdown && qualityBreakdown.length > 0 ? (
                <div className="flex flex-wrap gap-1.5 pt-1">
                  <span className="px-2 py-1 rounded-lg bg-fuchsia-100 text-fuchsia-700 text-[10px] font-black">
                    {qualityBreakdown.length} qualités sélectionnées ({qualityBreakdown.reduce((s, r) => s + (Number(r.quantity) || 0), 0).toLocaleString()} {formData.unitOfMeasure || 'pcs'})
                  </span>
                </div>
              ) : (formData.size || formData.zipperType || formData.slider || formData.tapeWeightGsm || formData.sliderWeightG || formData.pcsPerBag || formData.bagsPerCarton) && (
                <div className="flex flex-wrap gap-1.5 pt-1">
                  {formData.size && <span className="px-2 py-1 rounded-lg bg-blue-100 text-blue-700 text-[10px] font-black">Taille: {formData.size}</span>}
                  {formData.zipperType && <span className="px-2 py-1 rounded-lg bg-amber-100 text-amber-700 text-[10px] font-black">{formData.zipperType}</span>}
                  {formData.slider && <span className="px-2 py-1 rounded-lg bg-stone-100 text-stone-700 text-[10px] font-black">Curseur: {formData.slider}</span>}
                  {formData.sliderType && <span className="px-2 py-1 rounded-lg bg-purple-100 text-purple-700 text-[10px] font-black">Type: {formData.sliderType}</span>}
                  {formData.tapeWeightGsm && <span className="px-2 py-1 rounded-lg bg-emerald-100 text-emerald-700 text-[10px] font-black">Ruban: {formData.tapeWeightGsm} g/m</span>}
                  {formData.sliderWeightG && <span className="px-2 py-1 rounded-lg bg-orange-100 text-orange-700 text-[10px] font-black">Curseur: {formData.sliderWeightG} g/pc</span>}
                  {formData.pcsPerBag && <span className="px-2 py-1 rounded-lg bg-teal-100 text-teal-700 text-[10px] font-black">{formData.pcsPerBag} pcs/bag</span>}
                  {formData.bagsPerCarton && <span className="px-2 py-1 rounded-lg bg-indigo-100 text-indigo-700 text-[10px] font-black">{formData.bagsPerCarton} bags/ctn</span>}
                </div>
              )}

              {/* Fallback uniquement si aucune qualité définie */}
              {zipperQualities.length === 0 && (
                <div className="space-y-3 pt-2">
                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-1.5">
                      <Label className="text-[10px] font-black text-stone-400 uppercase tracking-widest">Taille</Label>
                      <Input placeholder="Ex: 20cm" className="h-11 border-stone-200 font-bold rounded-xl"
                        value={formData.size} onChange={e => setFormData((p: any) => ({ ...p, size: e.target.value }))} />
                    </div>
                    <div className="space-y-1.5">
                      <Label className="text-[10px] font-black text-stone-400 uppercase tracking-widest">Type Zipper</Label>
                      <Select value={formData.zipperType} onValueChange={v => setFormData((p: any) => ({ ...p, zipperType: v }))}>
                        <SelectTrigger className="h-11 border-stone-200 bg-white font-bold rounded-xl"><SelectValue placeholder="Type..." /></SelectTrigger>
                        <SelectContent>{ZIPPER_TYPES.map(t => <SelectItem key={t} value={t} className="font-bold uppercase">{t}</SelectItem>)}</SelectContent>
                      </Select>
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-1.5">
                      <Label className="text-[10px] font-black text-stone-400 uppercase tracking-widest">Curseur</Label>
                      <Input placeholder="Auto-lock..." className="h-11 border-stone-200 font-bold rounded-xl"
                        value={formData.slider} onChange={e => setFormData((p: any) => ({ ...p, slider: e.target.value }))} />
                    </div>
                    <div className="space-y-1.5">
                      <Label className="text-[10px] font-black text-stone-400 uppercase tracking-widest">Type Curseur</Label>
                      <Select value={formData.sliderType} onValueChange={v => setFormData((p: any) => ({ ...p, sliderType: v }))}>
                        <SelectTrigger className="h-11 border-stone-200 bg-white font-bold rounded-xl"><SelectValue placeholder="..." /></SelectTrigger>
                        <SelectContent>{SLIDER_TYPES.map(t => <SelectItem key={t} value={t} className="font-bold uppercase">{t}</SelectItem>)}</SelectContent>
                      </Select>
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-1.5">
                      <Label className="text-[10px] font-black text-stone-400 uppercase tracking-widest">Grammage Ruban (g/m)</Label>
                      <Input type="number" step="any" placeholder="Ex: 20.5" className="h-11 border-stone-200 font-bold rounded-xl"
                        value={formData.tapeWeightGsm || ''} onChange={e => setFormData((p: any) => ({ ...p, tapeWeightGsm: e.target.value }))} />
                    </div>
                    <div className="space-y-1.5">
                      <Label className="text-[10px] font-black text-stone-400 uppercase tracking-widest">Poids Curseur (g/pcs)</Label>
                      <Input type="number" step="any" placeholder="Ex: 1.2" className="h-11 border-stone-200 font-bold rounded-xl"
                        value={formData.sliderWeightG || ''} onChange={e => setFormData((p: any) => ({ ...p, sliderWeightG: e.target.value }))} />
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-1.5">
                      <Label className="text-[10px] font-black text-stone-400 uppercase tracking-widest">Pcs par Bag</Label>
                      <Input type="number" step="any" placeholder="Ex: 50" className="h-11 border-stone-200 font-bold rounded-xl"
                        value={formData.pcsPerBag || ''} onChange={e => setFormData((p: any) => ({ ...p, pcsPerBag: e.target.value }))} />
                    </div>
                    <div className="space-y-1.5">
                      <Label className="text-[10px] font-black text-stone-400 uppercase tracking-widest">Bags par Carton</Label>
                      <Input type="number" step="any" placeholder="Ex: 10" className="h-11 border-stone-200 font-bold rounded-xl"
                        value={formData.bagsPerCarton || ''} onChange={e => setFormData((p: any) => ({ ...p, bagsPerCarton: e.target.value }))} />
                    </div>
                  </div>
                </div>
              )}
            </div>
          ) : (
            /* CAS 3: Autres pôles (standard) */
            <div className="grid grid-cols-2 gap-3">
              {/* Taille */}
              <div className="space-y-1.5">
                <Label className="text-[10px] font-black text-stone-400 uppercase tracking-widest flex items-center gap-1">
                  <Maximize className="w-3 h-3" /> Taille
                </Label>
                {sizeBreakdown && sizeBreakdown.length > 0 ? (
                  <div className="h-11 border border-teal-200 bg-teal-50 rounded-xl flex items-center px-3">
                    <span className="text-[10px] font-black text-teal-700 uppercase">VARIOUS (multi-tailles)</span>
                  </div>
                ) : availableSizes.length > 0 ? (
                  <Select value={formData.size} onValueChange={v => setFormData((p: any) => ({ ...p, size: v }))}>
                    <SelectTrigger className="h-11 border-stone-200 bg-white font-bold rounded-xl">
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
                    placeholder="No.5, 20cm..."
                    className="h-11 border-stone-200 font-bold rounded-xl"
                    value={formData.size}
                    onChange={e => setFormData((p: any) => ({ ...p, size: e.target.value }))}
                  />
                )}
              </div>

              {/* Couleur */}
              <div className="space-y-1.5">
                <Label className="text-[10px] font-black text-stone-400 uppercase tracking-widest flex items-center gap-1">
                  <Palette className="w-3 h-3" /> Couleur
                </Label>
                {colorBreakdown && colorBreakdown.length > 0 ? (
                  <div className="h-11 border border-violet-200 bg-violet-50 rounded-xl flex items-center px-3">
                    <span className="text-[10px] font-black text-violet-700 uppercase">VARIOUS (multi-couleurs)</span>
                  </div>
                ) : (
                  <Select value={formData.color} onValueChange={v => setFormData((p: any) => ({ ...p, color: v }))}>
                    <SelectTrigger className="h-11 border-stone-200 bg-white font-bold rounded-xl">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {COLORS.map(c => <SelectItem key={c} value={c} className="font-bold uppercase">{c}</SelectItem>)}
                    </SelectContent>
                  </Select>
                )}
              </div>
            </div>
          )}

          {/* Specs / Notes */}
          <div className="space-y-1.5">
            <Label className="text-[10px] font-black text-stone-400 uppercase tracking-widest flex items-center gap-1">
              <ClipboardList className="w-3 h-3" />
              {isZipper ? 'Notes additionnelles' : 'Détails Techniques / Specs'}
            </Label>
            <Input
              placeholder={isZipper ? 'Notes...' : 'Ex: Semi-Auto, 50m/roll...'}
              className="h-11 border-stone-200 font-bold rounded-xl"
              value={formData.specs}
              onChange={e => setFormData((p: any) => ({ ...p, specs: e.target.value }))}
            />
          </div>

          {/* ── Design Picker — zipper & slider ── */}
          {isDesignCategory && formData.categoryId && (
            <DesignPicker
              categoryName={formData.categoryId}
              subCategories={subCategories || []}
              value={formData.designRef}
              onChange={(ref, imageUrl) =>
                setFormData((p: any) => ({ ...p, designRef: ref, designImageUrl: imageUrl || '' }))
              }
            />
          )}

          {/* ── Section 3a: Qualités Multi ─────────────────────────────────── */}
          <QualityBreakdownInput
            value={qualityBreakdown}
            onChange={handleQualityBreakdownChange}
            unit={formData.unitOfMeasure}
            availableQualities={isFabric ? fabricQualities : isZipper ? zipperQualities : []}
            isFabric={isFabric}
            isZipper={isZipper}
          />

          {/* ── Section 3b: Tailles Multi ──────────────────────────────────── */}
          <SizeBreakdownInput value={sizeBreakdown} onChange={handleSizeBreakdownChange} availableSizes={availableSizes} />

          {/* ── Section 3c: Couleurs Multi ─────────────────────────────────── */}
          <ColorBreakdownInput
            value={colorBreakdown}
            onChange={handleColorBreakdownChange}
            unit={formData.unitOfMeasure}
          />

          {/* ── Section 3d: Modèles Multi ─────────────────────────────────── */}
          {isDesignCategory && formData.categoryId && (
            <DesignBreakdownInput
              categoryId={(subCategories || []).find((sc: any) => sc.name === formData?.categoryId)?.id}
              value={designBreakdown}
              onChange={handleDesignBreakdownChange}
              unit={formData.unitOfMeasure}
            />
          )}

          {/* ── Section 4: Commande ───────────────────────────────────────── */}
          <SectionLabel icon={<Ruler className="w-3 h-3" />} label="Commande & Prix" />

          {/* Unité + Quantité + Prix */}
          <div className="grid grid-cols-3 gap-3">
            <div className="space-y-1.5">
              <Label className="text-[10px] font-black text-stone-400 uppercase tracking-widest">Unité</Label>
              <Select
                value={formData.unitOfMeasure}
                onValueChange={v => setFormData((p: any) => ({ ...p, unitOfMeasure: v }))}
              >
                <SelectTrigger className="h-11 border-stone-200 bg-white font-bold rounded-xl">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {UNITS.map(u => <SelectItem key={u} value={u} className="font-bold uppercase">{u}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1.5">
              <Label className="text-[10px] font-black text-stone-400 uppercase tracking-widest flex items-center gap-1">
                Quantité
                {errors.quantity && <AlertCircle className="w-3 h-3 text-red-400 ml-auto" />}
              </Label>
              {((qualityBreakdown && qualityBreakdown.length > 0) || (colorBreakdown && colorBreakdown.length > 0) || (sizeBreakdown && sizeBreakdown.length > 0) || (designBreakdown && designBreakdown.length > 0)) ? (
                <div className="h-11 border border-violet-200 bg-violet-50 rounded-xl flex items-center px-3 justify-between">
                  <span className="text-[10px] font-black text-violet-700">{Number(formData.quantity).toLocaleString()}</span>
                  <span className="text-[8px] font-bold text-violet-400 uppercase">auto</span>
                </div>
              ) : (
                <Input
                  type="text"
                  inputMode="decimal"
                  placeholder="0"
                  className={`h-11 border font-black rounded-xl text-center text-stone-900 ${errors.quantity ? 'border-red-300 bg-red-50' : 'border-stone-200'}`}
                  value={formData.quantity === 0 ? '' : formData.quantity}
                  onChange={e => {
                    const raw = e.target.value.replace(',', '.');
                    if (raw === '' || raw === '.') { setFormData((p: any) => ({ ...p, quantity: raw === '' ? '' : raw })); return; }
                    const num = parseFloat(raw);
                    setFormData((p: any) => ({ ...p, quantity: isNaN(num) ? p.quantity : e.target.value }));
                  }}
                  onBlur={e => {
                    const raw = e.target.value.replace(',', '.');
                    const num = parseFloat(raw);
                    setFormData((p: any) => ({ ...p, quantity: isNaN(num) ? '' : num }));
                  }}
                />
              )}
            </div>

            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <Label className="text-[10px] font-black text-stone-400 uppercase tracking-widest flex items-center gap-1">
                  <DollarSign className="w-3 h-3" /> PA ($)
                </Label>
                {lastOrderInfo && (
                  <button
                    type="button"
                    onClick={() => setFormData((p: any) => ({ ...p, purchasePricePerUnit: lastOrderInfo.price }))}
                    className="text-[8px] font-black text-emerald-700 bg-emerald-50 border border-emerald-200 px-1.5 py-0.5 rounded hover:bg-emerald-100 transition-colors flex items-center gap-1"
                    title="Cliquer pour appliquer le dernier prix"
                  >
                    <span>Dernier: {lastOrderInfo.price} $</span>
                    {lastOrderInfo.supplierId && <span className="text-stone-400 font-bold">({lastOrderInfo.supplierId})</span>}
                  </button>
                )}
              </div>
              <Input
                type="text"
                inputMode="decimal"
                placeholder={lastOrderInfo ? String(lastOrderInfo.price) : "0.00"}
                className="h-11 border-stone-200 font-black rounded-xl text-center text-amber-700"
                value={formData.purchasePricePerUnit === 0 ? '' : formData.purchasePricePerUnit}
                onChange={e => {
                  const raw = e.target.value.replace(',', '.');
                  if (raw === '' || raw === '.') { setFormData((p: any) => ({ ...p, purchasePricePerUnit: raw === '' ? '' : raw })); return; }
                  const num = parseFloat(raw);
                  setFormData((p: any) => ({ ...p, purchasePricePerUnit: isNaN(num) ? p.purchasePricePerUnit : e.target.value }));
                }}
                onBlur={e => {
                  const raw = e.target.value.replace(',', '.');
                  const num = parseFloat(raw);
                  setFormData((p: any) => ({ ...p, purchasePricePerUnit: isNaN(num) ? '' : num }));
                }}
              />
            </div>
          </div>

          {/* Fournisseur + Priorité */}
          {!isInventoryMode && (
            <>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label className="text-[10px] font-black text-stone-400 uppercase tracking-widest flex items-center gap-1">
                    <Building2 className="w-3 h-3" /> Fournisseur
                  </Label>
                  <Input
                    list="suppliers-list"
                    placeholder="Nom du fournisseur..."
                    className="h-11 border-stone-200 font-bold rounded-xl"
                    value={formData.supplierId}
                    onChange={e => setFormData((p: any) => ({ ...p, supplierId: e.target.value }))}
                  />
                  <datalist id="suppliers-list">
                    {knownSuppliers.map(s => <option key={s} value={s} />)}
                  </datalist>
                </div>

                <div className="space-y-1.5">
                  <Label className="text-[10px] font-black text-stone-400 uppercase tracking-widest flex items-center gap-1">
                    <Star className="w-3 h-3" /> Priorité
                  </Label>
                  <div className="grid grid-cols-3 gap-1.5 h-11">
                    {PRIORITY_CONFIG.map(p => (
                      <button
                        key={p.value}
                        type="button"
                        onClick={() => setFormData((f: any) => ({ ...f, priority: p.value }))}
                        className={`h-full rounded-xl text-[9px] font-black uppercase tracking-wider border transition-all ${
                          formData.priority === p.value
                            ? `${p.bg} ${p.text} border-current shadow-sm`
                            : 'bg-white border-stone-200 text-stone-400 hover:border-stone-300'
                        }`}
                      >
                        {p.label}
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              {/* ── Section 5.5: Conteneur Complet ────────────────────────────── */}
              <div className={`rounded-xl border transition-all ${isFullContainer ? 'bg-orange-50 border-orange-200' : 'bg-stone-50 border-dashed border-stone-200'}`}>
                <div className="flex items-center justify-between p-3.5">
                  <div className="flex items-center gap-2">
                    <Package className={`w-4 h-4 ${isFullContainer ? 'text-orange-600' : 'text-stone-400'}`} />
                    <div>
                      <span className={`text-[10px] font-black uppercase tracking-widest ${isFullContainer ? 'text-orange-700' : 'text-stone-500'}`}>
                        Conteneur Complet (PI)
                      </span>
                      {isFullContainer && (
                        <p className="text-[8px] font-bold text-orange-500 uppercase mt-0.5">Cette commande occupera un conteneur entier</p>
                      )}
                    </div>
                  </div>
                  <Switch
                    checked={isFullContainer}
                    onCheckedChange={v => setIsFullContainer(v)}
                  />
                </div>
                {!isFullContainer && (
                  <p className="text-[9px] font-bold text-stone-400 uppercase text-center pb-3 italic">
                    Activer si cette PI va remplir un conteneur complet
                  </p>
                )}
              </div>

              {/* Délai de production estimé — champ principal */}
              <div className="space-y-1.5">
                <Label className="text-[10px] font-black text-stone-400 uppercase tracking-widest flex items-center gap-1">
                  <Clock className="w-3 h-3" /> Délai de production estimé
                </Label>
                <Input
                  placeholder="Ex: 30 jours, 6 semaines..."
                  className="h-11 border-stone-200 font-bold rounded-xl"
                  value={formData.estimatedProductionDelay}
                  onChange={e => setFormData((p: any) => ({ ...p, estimatedProductionDelay: e.target.value }))}
                />
              </div>

              {/* ── Section Précommande Client ─────────────────────────────── */}
              <div className={`rounded-xl border transition-all ${formData.isPreorder ? 'bg-indigo-50 border-indigo-200' : 'bg-stone-50 border-dashed border-stone-200'}`}>
                <div className="flex items-center justify-between p-3.5">
                  <div className="flex items-center gap-2">
                    <UserCircle2 className={`w-4 h-4 ${formData.isPreorder ? 'text-indigo-600' : 'text-stone-400'}`} />
                    <span className={`text-[10px] font-black uppercase tracking-widest ${formData.isPreorder ? 'text-indigo-700' : 'text-stone-500'}`}>
                      Précommande Client
                    </span>
                  </div>
                  <Switch
                    checked={formData.isPreorder}
                    onCheckedChange={v => setFormData((p: any) => ({ ...p, isPreorder: v, clientName: v ? p.clientName : '' }))}
                  />
                </div>
                {formData.isPreorder && (
                  <div className="px-3.5 pb-3.5 space-y-1.5">
                    <Label className="text-[10px] font-black text-indigo-500 uppercase tracking-widest flex items-center gap-1">
                      <UserCircle2 className="w-3 h-3" /> Nom du Client
                    </Label>
                    <Input
                      placeholder="Ex: Zara, H&M, Client X..."
                      className="h-11 border-indigo-200 font-bold rounded-xl bg-white"
                      value={formData.clientName}
                      onChange={e => setFormData((p: any) => ({ ...p, clientName: e.target.value }))}
                    />
                    <p className="text-[9px] text-indigo-400 font-bold mt-1">
                      📧 L&apos;email est récupéré automatiquement depuis l&apos;accès portail du client.
                    </p>
                  </div>
                )}
                {!formData.isPreorder && (
                  <p className="text-[9px] font-bold text-stone-400 uppercase text-center pb-3 italic">
                    Activer si cet article est précommandé par un client
                  </p>
                )}
              </div>
            </>
          )}

          {/* ── Submit ─────────────────────────────────────────────────────── */}
          <Button
            type="submit"
            disabled={!isValid}
            className={`w-full font-black uppercase tracking-widest h-13 rounded-xl gap-2 mt-1 shadow-lg transition-all ${
              isValid
                ? 'bg-stone-900 hover:bg-black text-white shadow-stone-200'
                : 'bg-stone-200 text-stone-400 cursor-not-allowed shadow-none'
            }`}
          >
            <Save className="w-4 h-4" />
            {isInventoryMode ? 'Ajouter à l\'inventaire' : 'Enregistrer le besoin'}
            {isValid && <ChevronRight className="w-4 h-4 ml-auto opacity-50" />}
          </Button>

          {!isValid && (
            <p className="text-[9px] text-red-400 font-bold uppercase text-center -mt-3">
              Complète les champs requis pour continuer
            </p>
          )}
        </form>
    </div>
  );
}

export interface AddOrderModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  isInventoryMode?: boolean;
  activeStore?: string;
  adminUid?: string | null;
  onSuccess?: (payload: any) => void;
}

export default function AddOrderModal({
  open,
  onOpenChange,
  isInventoryMode = false,
  activeStore = 'CHRIFA',
  adminUid = null,
  onSuccess
}: AddOrderModalProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg border-stone-200 max-h-[92vh] overflow-y-auto rounded-2xl p-0">
        <AddOrderForm
          key={open ? 'open' : 'closed'}
          onClose={() => onOpenChange(false)}
          isInventoryMode={isInventoryMode}
          activeStore={activeStore}
          adminUid={adminUid}
          onSuccess={onSuccess}
        />
      </DialogContent>
    </Dialog>
  );
}

// ── Section label helper ───────────────────────────────────────────────────────
function SectionLabel({ icon, label }: { icon: React.ReactNode; label: string }) {
  return (
    <div className="flex items-center gap-2 -mb-1">
      <div className="p-1.5 bg-stone-100 rounded-lg text-stone-500">{icon}</div>
      <span className="text-[9px] font-black text-stone-400 uppercase tracking-[0.2em]">{label}</span>
      <div className="flex-1 h-px bg-stone-100" />
    </div>
  );
}
