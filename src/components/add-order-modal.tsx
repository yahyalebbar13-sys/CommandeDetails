
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
import DesignPicker from './design-picker';

const UNITS = ["pièces", "doz", "m", "rolls", "kg", "bag", "yds"];
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
};

export default function AddOrderModal({ open, onOpenChange }: { open: boolean, onOpenChange: (o: boolean) => void }) {
  const { user } = useUser();
  const firestore = useFirestore();
  const { toast } = useToast();

  const genCatsRef = useMemoFirebase(() => user ? collection(firestore, 'users', user.uid, 'generalCategories') : null, [firestore, user]);
  const subCatsRef = useMemoFirebase(() => user ? collection(firestore, 'users', user.uid, 'categories') : null, [firestore, user]);
  const articlesRef = useMemoFirebase(() => user ? collection(firestore, 'users', user.uid, 'articles') : null, [firestore, user]);

  const { data: generalCategories = [] } = useCollection(genCatsRef);
  const { data: subCategories = [] } = useCollection(subCatsRef);
  const { data: allArticles = [] } = useCollection(articlesRef);

  const [selectedGenCatId, setSelectedGenCatId] = useState<string>('');
  const [colorBreakdown, setColorBreakdown] = useState<ColorBreakdownRow[] | null>(null);
  const [sizeBreakdown, setSizeBreakdown] = useState<SizeBreakdownRow[] | null>(null);
  const [isFullContainer, setIsFullContainer] = useState(false);
  const [formData, setFormData] = useState<any>({ ...EMPTY_FORM });

  // Derive unique supplier list from past articles for autocomplete
  const knownSuppliers = useMemo(() => {
    const set = new Set<string>();
    (allArticles || []).forEach((a: any) => { if (a.supplierId) set.add(a.supplierId); });
    return Array.from(set).sort();
  }, [allArticles]);

  const handleColorBreakdownChange = useCallback((rows: ColorBreakdownRow[] | null, total: number) => {
    setColorBreakdown(rows);
    if (rows && rows.length > 0) {
      setFormData((p: any) => ({ ...p, quantity: total, color: 'various' }));
    }
  }, []);

  const handleSizeBreakdownChange = useCallback((rows: SizeBreakdownRow[] | null, total: number) => {
    setSizeBreakdown(rows);
    if (rows && rows.length > 0) {
      setFormData((p: any) => ({ ...p, quantity: total, size: 'various' }));
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
    const upper = (formData.categoryId || '').toUpperCase();
    return upper.includes('ZIPPER') && !upper.includes('LONG CHAIN') && !upper.includes('SLIDER');
  }, [formData.categoryId]);

  const isSlider = useMemo(() => {
    const upper = (formData.categoryId || '').toUpperCase();
    return upper.includes('SLIDER') || upper.includes('PULLER');
  }, [formData.categoryId]);

  const isDesignCategory = useMemo(() => {
    const upper = (formData.categoryId || '').toUpperCase();
    return isZipper || isSlider || upper.includes('PRINT') || upper.includes('DESIGN') || upper.includes('PATTERN');
  }, [isZipper, isSlider, formData.categoryId]);

  // Validation
  const errors = useMemo(() => {
    const e: Record<string, string> = {};
    if (!selectedGenCatId) e.genCat = 'Requis';
    if (!formData.categoryId) e.category = 'Requis';
    if (!colorBreakdown?.length && !sizeBreakdown?.length && (!formData.quantity || Number(formData.quantity) <= 0))
      e.quantity = 'Quantité requise';
    return e;
  }, [selectedGenCatId, formData.categoryId, formData.quantity, colorBreakdown, sizeBreakdown]);

  const isValid = Object.keys(errors).length === 0;
  const priorityConf = PRIORITY_CONFIG.find(p => p.value === formData.priority) || PRIORITY_CONFIG[2];

  const resetForm = () => {
    setColorBreakdown(null);
    setSizeBreakdown(null);
    setIsFullContainer(false);
    setFormData({ ...EMPTY_FORM });
    setSelectedGenCatId('');
  };

  const handleClose = (open: boolean) => {
    if (!open) resetForm();
    onOpenChange(open);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!user || !firestore || !isValid) return;

    const selectedSubCat = (subCategories || []).find((sc: any) => sc.name === formData.categoryId);
    const basePayload = {
      ...formData,
      name: formData.categoryId,
      generalCategoryId: selectedGenCatId,
      status: 'TO_ORDER',
      isFullContainer,
      createdAt: serverTimestamp(),
      hsCode: selectedSubCat?.hsCode || null,
      importDutyRate: selectedSubCat?.importDutyRate ?? null,
      tpiRate: selectedSubCat?.tpiRate ?? null,
      ticRate: selectedSubCat?.ticRate ?? null,
      tvaRate: selectedSubCat?.tvaRate ?? null,
    };

    // ── Color split ──
    if (!colorBreakdown || colorBreakdown.length === 0) {
      // ── Size split ──
      if (!sizeBreakdown || sizeBreakdown.length === 0) {
        const id = crypto.randomUUID();
        setDocumentNonBlocking(
          doc(firestore, 'users', user.uid, 'articles', id),
          { ...basePayload, id, colorBreakdown: null, sizeBreakdown: null },
          { merge: true }
        );
      } else {
        const sizeGroups = new Map<number, SizeBreakdownRow[]>();
        for (const row of sizeBreakdown) {
          const price = (row.priceOverride !== '' && row.priceOverride !== undefined)
            ? Number(row.priceOverride)
            : Number(formData.purchasePricePerUnit || 0);
          if (!sizeGroups.has(price)) sizeGroups.set(price, []);
          sizeGroups.get(price)!.push(row);
        }
        sizeGroups.forEach((rows, price) => {
          const id = crypto.randomUUID();
          const groupQty = rows.reduce((s, r) => s + (Number(r.quantity) || 0), 0);
          setDocumentNonBlocking(
            doc(firestore, 'users', user.uid, 'articles', id),
            { ...basePayload, id, purchasePricePerUnit: price, quantity: groupQty, sizeBreakdown: rows, colorBreakdown: null },
            { merge: true }
          );
        });
      }
    } else {
      const groups = new Map<number, ColorBreakdownRow[]>();
      for (const row of colorBreakdown) {
        const price = (row.priceOverride !== '' && row.priceOverride !== undefined)
          ? Number(row.priceOverride)
          : Number(formData.purchasePricePerUnit || 0);
        if (!groups.has(price)) groups.set(price, []);
        groups.get(price)!.push(row);
      }
      groups.forEach((rows, price) => {
        const id = crypto.randomUUID();
        const groupQty = rows.reduce((s, r) => s + (Number(r.rolls) || 0), 0);
        setDocumentNonBlocking(
          doc(firestore, 'users', user.uid, 'articles', id),
          { ...basePayload, id, purchasePricePerUnit: price, quantity: groupQty, colorBreakdown: rows, sizeBreakdown: null },
          { merge: true }
        );
      });
    }

    const colorSplitCount = colorBreakdown
      ? new Set(colorBreakdown.map(r => r.priceOverride !== '' && r.priceOverride !== undefined ? r.priceOverride : 'default')).size
      : 1;
    const sizeSplitCount = sizeBreakdown
      ? new Set(sizeBreakdown.map(r => r.priceOverride !== '' && r.priceOverride !== undefined ? r.priceOverride : 'default')).size
      : 1;
    const splitCount = Math.max(colorSplitCount, sizeSplitCount);

    toast({
      title: "✅ Besoin enregistré",
      description: splitCount > 1
        ? `${splitCount} articles créés (auto-split par prix)`
        : "L'article a été ajouté à la liste des rappels.",
    });

    resetForm();
    onOpenChange(false);
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
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-w-lg border-stone-200 max-h-[92vh] overflow-y-auto rounded-2xl p-0">

        {/* ── Header ─────────────────────────────────────────────────────── */}
        <div className="bg-gradient-to-br from-stone-900 to-stone-800 p-6 flex items-start gap-4 text-white sticky top-0 z-10">
          <div className="p-2.5 bg-amber-500/20 rounded-xl border border-amber-500/30 shrink-0 mt-0.5">
            <Package className="w-5 h-5 text-amber-400" />
          </div>
          <div className="flex-1 min-w-0">
            <DialogTitle className="text-lg font-black uppercase tracking-tight leading-none">
              Nouvel Article
            </DialogTitle>
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
                onValueChange={v => setFormData((p: any) => ({ ...p, categoryId: v }))}
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
              ) : (
                <Input
                  placeholder="No.5, 20cm..."
                  className="h-11 border-stone-200 font-bold rounded-xl"
                  value={formData.size}
                  onChange={e => setFormData((p: any) => ({ ...p, size: e.target.value }))}
                />
              )}
            </div>

            {/* Zipper Type — conditionnel */}
            {isZipper ? (
              <div className="space-y-1.5">
                <Label className="text-[10px] font-black text-stone-400 uppercase tracking-widest flex items-center gap-1">
                  <Settings2 className="w-3 h-3" /> Type Zipper
                </Label>
                <Select value={formData.zipperType} onValueChange={v => setFormData((p: any) => ({ ...p, zipperType: v }))}>
                  <SelectTrigger className="h-11 border-stone-200 bg-white font-bold rounded-xl">
                    <SelectValue placeholder="Type..." />
                  </SelectTrigger>
                  <SelectContent>
                    {ZIPPER_TYPES.map(t => <SelectItem key={t} value={t} className="font-bold uppercase">{t}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            ) : (
              /* Couleur — standard si pas zipper */
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
            )}
          </div>

          {/* Zipper extra fields */}
          {isZipper && (
            <div className="grid grid-cols-3 gap-3">
              {/* Couleur pour zipper */}
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
              <div className="space-y-1.5">
                <Label className="text-[10px] font-black text-stone-400 uppercase tracking-widest flex items-center gap-1">
                  <MousePointer2 className="w-3 h-3" /> Curseur
                </Label>
                <Input
                  placeholder="Auto-lock..."
                  className="h-11 border-stone-200 font-bold rounded-xl"
                  value={formData.slider}
                  onChange={e => setFormData((p: any) => ({ ...p, slider: e.target.value }))}
                />
              </div>
              <div className="space-y-1.5">
                <Label className="text-[10px] font-black text-stone-400 uppercase tracking-widest flex items-center gap-1">
                  <Scissors className="w-3 h-3" /> Type Curseur
                </Label>
                <Select value={formData.sliderType} onValueChange={v => setFormData((p: any) => ({ ...p, sliderType: v }))}>
                  <SelectTrigger className="h-11 border-stone-200 bg-white font-bold rounded-xl">
                    <SelectValue placeholder="..." />
                  </SelectTrigger>
                  <SelectContent>
                    {SLIDER_TYPES.map(t => <SelectItem key={t} value={t} className="font-bold uppercase">{t}</SelectItem>)}
                  </SelectContent>
                </Select>
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

          {/* ── Section 3a: Tailles Multi ──────────────────────────────────── */}
          <SizeBreakdownInput value={sizeBreakdown} onChange={handleSizeBreakdownChange} />

          {/* ── Section 3b: Couleurs Multi ─────────────────────────────────── */}
          <ColorBreakdownInput
            categoryId={currentCategoryObj?.id}
            value={colorBreakdown}
            onChange={handleColorBreakdownChange}
            unit={formData.unitOfMeasure}
          />

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
              {colorBreakdown && colorBreakdown.length > 0 ? (
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
              <Label className="text-[10px] font-black text-stone-400 uppercase tracking-widest flex items-center gap-1">
                <DollarSign className="w-3 h-3" /> PA ($)
              </Label>
              <Input
                type="text"
                inputMode="decimal"
                placeholder="0.00"
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
            Enregistrer le besoin
            {isValid && <ChevronRight className="w-4 h-4 ml-auto opacity-50" />}
          </Button>

          {!isValid && (
            <p className="text-[9px] text-red-400 font-bold uppercase text-center -mt-3">
              Complète les champs requis pour continuer
            </p>
          )}
        </form>
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
