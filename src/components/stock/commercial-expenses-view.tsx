"use client";

import React, { useState, useMemo, useEffect } from 'react';
import { 
  Receipt, Fuel, Utensils, Car, ParkingCircle, Package, MoreHorizontal,
  Plus, Search, Filter, Calendar, Download, Trash2, CheckCircle2, 
  Clock, AlertCircle, Camera, Check, X, ShieldAlert, Sparkles, Building2, User,
  ShoppingBag, ArrowDownRight, Tag, Layers, Settings2, Palette, Maximize, Ruler, DollarSign
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { 
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
  SelectGroup, SelectLabel
} from '@/components/ui/select';
import { useToast } from '@/hooks/use-toast';
import type { CommercialExpense, ExpenseCategory, StoreLocation, Store } from '@/lib/types';
import { exportReportPDF } from '@/lib/pdf-export-reports';
import { findLastOrderPrice } from '@/lib/order-utils';
import { isFabricLineOrCategory, isZipperLineOrCategory, isThreadLineOrCategory, isSliderLineOrCategory } from '@/lib/constants';

interface CommercialExpensesViewProps {
  expenses: CommercialExpense[];
  stores: Store[];
  activeStore: StoreLocation | 'ALL';
  userRole: 'ADMIN' | 'COMMERCIAL';
  currentUserName?: string;
  currentUserId?: string;
  generalCategories?: any[];
  categories?: any[];
  articles?: any[];
  onAddExpense: (expense: Omit<CommercialExpense, 'id' | 'createdAt'>) => Promise<void>;
  onUpdateExpenseStatus?: (id: string, status: 'PENDING' | 'APPROVED' | 'REIMBURSED') => Promise<void>;
  onDeleteExpense?: (id: string) => Promise<void>;
}

const UNITS = ["pièces", "doz", "gross (144p)", "m", "rolls", "kg", "bag", "yds"];
const COLORS = ["white", "black", "raw black", "raw white", "various", "various x black", "various x white", "nickel", "various x black x white", "silver", "gold", "black x white", "beige", "black nickel", "transparent"];
const ZIPPER_TYPES = ["O/E", "C/E"];
const SLIDER_TYPES = ["A/L", "P/L", "N/L", "SEMI A/L"];

function SectionLabel({ icon, label }: { icon: React.ReactNode; label: string }) {
  return (
    <div className="flex items-center gap-2 -mb-1">
      <div className="p-1.5 bg-stone-100 rounded-lg text-stone-500">{icon}</div>
      <span className="text-[9px] font-black text-stone-400 uppercase tracking-[0.2em]">{label}</span>
      <div className="flex-1 h-px bg-stone-100" />
    </div>
  );
}

const CATEGORY_CONFIG: Record<ExpenseCategory, { label: string; icon: any; color: string; bg: string }> = {
  ACHAT_MARCHANDISE: { label: 'Achat Marchandise (Marché)', icon: ShoppingBag, color: 'text-indigo-600', bg: 'bg-indigo-50 border-indigo-200' },
  CARBURANT:         { label: 'Carburant',                icon: Fuel,        color: 'text-amber-600',  bg: 'bg-amber-50 border-amber-200' },
  TRANSPORT:         { label: 'Transport',                icon: Car,         color: 'text-blue-600',   bg: 'bg-blue-50 border-blue-200' },
  REPAS:             { label: 'Repas / Déjeuners',        icon: Utensils,    color: 'text-emerald-600',bg: 'bg-emerald-50 border-emerald-200' },
  PEAGE_PARKING:     { label: 'Péage & Parking',          icon: ParkingCircle, color: 'text-purple-600', bg: 'bg-purple-50 border-purple-200' },
  FOURNITURES:       { label: 'Fournitures',              icon: Package,     color: 'text-stone-600',  bg: 'bg-stone-50 border-stone-200' },
  AUTRE:             { label: 'Autre / Divers',           icon: MoreHorizontal, color: 'text-rose-600', bg: 'bg-rose-50 border-rose-200' },
};

const fmt$ = (n: number) => n.toLocaleString('fr-MA', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' MAD';

export default function CommercialExpensesView({
  expenses = [],
  stores = [],
  activeStore,
  userRole,
  currentUserName,
  currentUserId,
  generalCategories = [],
  categories = [],
  articles = [],
  onAddExpense,
  onUpdateExpenseStatus,
  onDeleteExpense,
}: CommercialExpensesViewProps) {
  const { toast } = useToast();

  const [search, setSearch] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<string>('ALL');
  const [selectedStatus, setSelectedStatus] = useState<string>('ALL');
  const [selectedMonth, setSelectedMonth] = useState<string>('ALL');

  // Modal d'ajout
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [newDate, setNewDate] = useState(new Date().toISOString().split('T')[0]);
  const [newAmount, setNewAmount] = useState<string>('');
  const [newCategory, setNewCategory] = useState<ExpenseCategory>('ACHAT_MARCHANDISE');
  const [newDescription, setNewDescription] = useState('');
  const [newStoreId, setNewStoreId] = useState<string>(activeStore !== 'ALL' && activeStore !== 'ALL_MAIN' ? activeStore : (stores[0]?.id || ''));
  const [newReceiptUrl, setNewReceiptUrl] = useState<string>('');
  const [previewImage, setPreviewImage] = useState<string | null>(null);

  // Champs spécifiques Achat Marchandise (exactement comme nvx ptds dans lebtex/gestion)
  const [selectedGenCatId, setSelectedGenCatId] = useState<string>('');
  const [selectedCategoryName, setSelectedCategoryName] = useState<string>('');
  const [selectedColor, setSelectedColor] = useState<string>('white');
  const [selectedSize, setSelectedSize] = useState<string>('');
  const [selectedSpecs, setSelectedSpecs] = useState<string>('');
  const [selectedZipperType, setSelectedZipperType] = useState<string>('');
  const [selectedSlider, setSelectedSlider] = useState<string>('');
  const [selectedSliderType, setSelectedSliderType] = useState<string>('');
  const [selectedGsm, setSelectedGsm] = useState<string>('');
  const [selectedFabricWidth, setSelectedFabricWidth] = useState<string>('');
  const [selectedRollLength, setSelectedRollLength] = useState<string>('');
  const [selectedRollLengthUnit, setSelectedRollLengthUnit] = useState<'m' | 'yds'>('m');
  const [selectedPackagingPerBag, setSelectedPackagingPerBag] = useState<string>('');
  const [selectedConeWeightG, setSelectedConeWeightG] = useState<string>('');
  const [selectedThreadWeightG, setSelectedThreadWeightG] = useState<string>('');
  const [selectedLengthPerPiece, setSelectedLengthPerPiece] = useState<string>('');
  const [selectedLengthUnit, setSelectedLengthUnit] = useState<'m' | 'yds'>('m');
  const [selectedPcsPerBag, setSelectedPcsPerBag] = useState<string>('');
  const [selectedBagsPerCarton, setSelectedBagsPerCarton] = useState<string>('');
  const [selectedSliderWeightG, setSelectedSliderWeightG] = useState<string>('');
  const [selectedDesignImageUrl, setSelectedDesignImageUrl] = useState<string>('');
  const [isManualArticle, setIsManualArticle] = useState(false);
  const [newArticleName, setNewArticleName] = useState('');
  const [newQuantity, setNewQuantity] = useState('');
  const [newUnitPrice, setNewUnitPrice] = useState('');
  const [newUnitOfMeasure, setNewUnitOfMeasure] = useState('pcs');
  const [newSupplierName, setNewSupplierName] = useState('');
  const [newAddToStock, setNewAddToStock] = useState(true);

  // Options d'entrepôts pour l'achat de marchandise
  const warehouseOptions = useMemo(() => {
    return (stores || []).filter((s: any) =>
      s.type === 'WAREHOUSE' ||
      s.name?.toLowerCase().includes('entrep') ||
      s.name?.toLowerCase().includes('dépôt') ||
      s.name?.toLowerCase().includes('depot')
    );
  }, [stores]);

  const [newWarehouseId, setNewWarehouseId] = useState<string>('');

  useEffect(() => {
    if (warehouseOptions.length > 0 && (!newWarehouseId || !warehouseOptions.some(w => w.id === newWarehouseId))) {
      setNewWarehouseId(warehouseOptions[0].id);
    }
  }, [warehouseOptions, newWarehouseId]);

  // Mois disponibles
  const availableMonths = useMemo(() => {
    const s = new Set<string>();
    expenses.forEach(e => { if (e.date) s.add(e.date.substring(0, 7)); });
    return Array.from(s).sort().reverse();
  }, [expenses]);

  // Filtrage sous-catégories par Pôle (Catégorie Générale)
  const filteredSubCategories = useMemo(() => {
    if (!selectedGenCatId) return [];
    const filtered = (categories || []).filter((sc: any) => sc.generalCategoryId === selectedGenCatId);

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
  }, [selectedGenCatId, categories]);

  const isZipper = useMemo(() => {
    let genCatId = selectedGenCatId;
    if (!genCatId && selectedCategoryName) {
      const cat = (categories || []).find((sc: any) => sc.name === selectedCategoryName);
      if (cat) genCatId = cat.generalCategoryId;
    }
    const genCat = genCatId ? (generalCategories || []).find((gc: any) => gc.id === genCatId) : null;
    return isZipperLineOrCategory(selectedCategoryName, genCat);
  }, [selectedGenCatId, generalCategories, selectedCategoryName, categories]);

  const isFabric = useMemo(() => {
    let genCatId = selectedGenCatId;
    if (!genCatId && selectedCategoryName) {
      const cat = (categories || []).find((sc: any) => sc.name === selectedCategoryName);
      if (cat) genCatId = cat.generalCategoryId;
    }
    const genCat = genCatId ? (generalCategories || []).find((gc: any) => gc.id === genCatId) : null;
    return isFabricLineOrCategory(selectedCategoryName, genCat);
  }, [selectedGenCatId, generalCategories, selectedCategoryName, categories]);

  const isThread = useMemo(() => {
    let genCatId = selectedGenCatId;
    if (!genCatId && selectedCategoryName) {
      const cat = (categories || []).find((sc: any) => sc.name === selectedCategoryName);
      if (cat) genCatId = cat.generalCategoryId;
    }
    const genCat = genCatId ? (generalCategories || []).find((gc: any) => gc.id === genCatId) : null;
    return isThreadLineOrCategory(selectedCategoryName, genCat);
  }, [selectedGenCatId, generalCategories, selectedCategoryName, categories]);

  const isSlider = useMemo(() => {
    let genCatId = selectedGenCatId;
    if (!genCatId && selectedCategoryName) {
      const cat = (categories || []).find((sc: any) => sc.name === selectedCategoryName);
      if (cat) genCatId = cat.generalCategoryId;
    }
    const genCat = genCatId ? (generalCategories || []).find((gc: any) => gc.id === genCatId) : null;
    return isSliderLineOrCategory(selectedCategoryName, genCat);
  }, [selectedGenCatId, generalCategories, selectedCategoryName, categories]);

  const selectedSubCat = useMemo(() => {
    return (categories || []).find((sc: any) => sc.name === selectedCategoryName);
  }, [categories, selectedCategoryName]);

  const fabricQualities = useMemo(() => {
    return Array.isArray(selectedSubCat?.fabricQualities) ? selectedSubCat.fabricQualities : [];
  }, [selectedSubCat]);

  const zipperQualities = useMemo(() => {
    return Array.isArray(selectedSubCat?.zipperQualities) ? selectedSubCat.zipperQualities : [];
  }, [selectedSubCat]);

  const threadQualities = useMemo(() => {
    return Array.isArray(selectedSubCat?.threadQualities) ? selectedSubCat.threadQualities : [];
  }, [selectedSubCat]);

  const sliderQualities = useMemo(() => {
    return Array.isArray(selectedSubCat?.sliderQualities) ? selectedSubCat.sliderQualities : [];
  }, [selectedSubCat]);

  const availableSizes = useMemo(() => {
    return Array.isArray(selectedSubCat?.availableSizes) && selectedSubCat.availableSizes.length > 0 ? selectedSubCat.availableSizes : [];
  }, [selectedSubCat]);

  // Fournisseurs connus issus des commandes passées
  const knownSuppliers = useMemo(() => {
    const set = new Set<string>();
    (articles || []).forEach((a: any) => { if (a.supplierId) set.add(a.supplierId); });
    return Array.from(set).sort();
  }, [articles]);

  // Détection du dernier prix d'achat enregistré dans le système
  const lastOrderInfo = useMemo(() => {
    if (!selectedCategoryName) return null;
    return findLastOrderPrice(
      {
        categoryId: selectedCategoryName,
        name: selectedCategoryName,
        size: selectedSize,
        color: selectedColor,
        specs: selectedSpecs,
        zipperType: selectedZipperType,
        slider: selectedSlider,
        sliderType: selectedSliderType,
        gsm: selectedGsm,
        fabricWidth: selectedFabricWidth,
      },
      articles || []
    );
  }, [selectedCategoryName, selectedSize, selectedColor, selectedSpecs, selectedZipperType, selectedSlider, selectedSliderType, selectedGsm, selectedFabricWidth, articles]);

  // Nom complet reconstitué de l'article pour le stock et l'affichage
  const computedArticleName = useMemo(() => {
    if (isManualArticle) return newArticleName.trim();
    if (!selectedCategoryName) return '';
    const parts: string[] = [selectedCategoryName];
    if (isFabric) {
      if (selectedGsm) parts.push(`${selectedGsm}g`);
      if (selectedFabricWidth) parts.push(`${selectedFabricWidth}cm`);
    } else if (isZipper) {
      if (selectedSize) parts.push(selectedSize);
      if (selectedZipperType) parts.push(selectedZipperType);
      if (selectedSlider) parts.push(`Curseur ${selectedSlider}`);
    } else if (isThread) {
      if (selectedConeWeightG) parts.push(`Cône ${selectedConeWeightG}g`);
      if (selectedThreadWeightG) parts.push(`Fil ${selectedThreadWeightG}g`);
      if (selectedLengthPerPiece) parts.push(`${selectedLengthPerPiece}${selectedLengthUnit || 'm'}`);
    } else {
      if (selectedSize) parts.push(selectedSize);
      if (selectedSpecs) parts.push(selectedSpecs);
    }
    if (selectedColor && selectedColor !== 'various') parts.push(selectedColor.toUpperCase());
    return parts.join(' · ');
  }, [isManualArticle, newArticleName, selectedCategoryName, isFabric, isZipper, isThread, selectedGsm, selectedFabricWidth, selectedSize, selectedZipperType, selectedSlider, selectedConeWeightG, selectedThreadWeightG, selectedLengthPerPiece, selectedLengthUnit, selectedSpecs, selectedColor]);

  // Handler de sélection d'une sous-catégorie
  const handleSelectSubCategory = (catName: string) => {
    setSelectedCategoryName(catName);
    
    // Unité par défaut
    const upper = catName.toUpperCase();
    const isFab = upper.includes('FABRIC') || upper.includes('TISSU') || upper.includes('POPELINE') || upper.includes('INTERLINING');
    if (isFab) {
      setNewUnitOfMeasure('rolls');
    } else {
      setNewUnitOfMeasure('pièces');
    }

    // Dernier prix commandé si disponible
    const last = findLastOrderPrice({ categoryId: catName, name: catName }, articles || []);
    if (last?.price) {
      setNewUnitPrice(String(last.price));
      if (newQuantity && Number(newQuantity) > 0) {
        setNewAmount((Number(newQuantity) * last.price).toFixed(2));
      }
    }
    if (last?.supplierId && !newSupplierName) {
      setNewSupplierName(last.supplierId);
    }
  };

  // Helper GroupedCategorySelect identique à AddOrderModal
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
              <SelectLabel className="text-[9px] text-stone-400 font-black uppercase tracking-widest bg-stone-50 py-1.5">{display}</SelectLabel>
              {groups[key].map((sc: any) => (
                <SelectItem key={sc.id || sc.name} value={sc.name} className="font-bold pl-6 text-[11px]">{sc.name}</SelectItem>
              ))}
            </SelectGroup>
          );
        })}
      </>
    );
  };

  // Filtrage
  const filteredExpenses = useMemo(() => {
    return expenses.filter(e => {
      if (selectedCategory !== 'ALL' && e.category !== selectedCategory) return false;
      if (selectedStatus !== 'ALL' && (e.status || 'PENDING') !== selectedStatus) return false;
      if (selectedMonth !== 'ALL' && !e.date?.startsWith(selectedMonth)) return false;
      if (search.trim()) {
        const q = search.toLowerCase();
        const desc = (e.description || '').toLowerCase();
        const comm = (e.commercialName || '').toLowerCase();
        const art = (e.articleName || '').toLowerCase();
        const supp = (e.supplierName || '').toLowerCase();
        const catLabel = (CATEGORY_CONFIG[e.category]?.label || '').toLowerCase();
        if (!desc.includes(q) && !comm.includes(q) && !catLabel.includes(q) && !art.includes(q) && !supp.includes(q)) return false;
      }
      return true;
    }).sort((a, b) => (b.date || '').localeCompare(a.date || ''));
  }, [expenses, selectedCategory, selectedStatus, selectedMonth, search]);

  // KPIs
  const kpis = useMemo(() => {
    const now = new Date();
    const currentMonthPrefix = now.toISOString().substring(0, 7);

    // Semaine actuelle (lundi à aujourd'hui)
    const day = now.getDay();
    const diff = (day + 6) % 7;
    const monday = new Date(now);
    monday.setDate(now.getDate() - diff);
    const mondayStr = monday.toISOString().split('T')[0];

    let totalMonth = 0;
    let totalWeek = 0;
    let totalMarchandise = 0;
    let totalCarburant = 0;
    let totalPending = 0;

    expenses.forEach(e => {
      const amt = Number(e.amount) || 0;
      if (e.date?.startsWith(currentMonthPrefix)) totalMonth += amt;
      if (e.date && e.date >= mondayStr) totalWeek += amt;
      if (e.category === 'ACHAT_MARCHANDISE') totalMarchandise += amt;
      if (e.category === 'CARBURANT') totalCarburant += amt;
      if (!e.status || e.status === 'PENDING') totalPending += amt;
    });

    return { totalMonth, totalWeek, totalMarchandise, totalCarburant, totalPending, count: expenses.length };
  }, [expenses]);

  // Calcul automatique du montant total si quantité et prix unitaire changent
  const handleQtyChange = (qtyVal: string) => {
    setNewQuantity(qtyVal);
    const q = parseFloat(qtyVal);
    const p = parseFloat(newUnitPrice);
    if (!isNaN(q) && !isNaN(p) && q > 0 && p > 0) {
      setNewAmount((q * p).toFixed(2));
    }
  };

  const handlePriceChange = (priceVal: string) => {
    setNewUnitPrice(priceVal);
    const q = parseFloat(newQuantity);
    const p = parseFloat(priceVal);
    if (!isNaN(q) && !isNaN(p) && q > 0 && p > 0) {
      setNewAmount((q * p).toFixed(2));
    }
  };

  // Soumission
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const amt = parseFloat(newAmount);
    if (!amt || amt <= 0) {
      toast({ variant: 'destructive', title: 'Montant invalide', description: 'Veuillez renseigner un montant supérieur à 0.' });
      return;
    }

    const isMarchandise = newCategory === 'ACHAT_MARCHANDISE';
    const finalArticleName = isManualArticle 
      ? newArticleName.trim()
      : (computedArticleName || selectedCategoryName || newArticleName.trim());

    if (isMarchandise && !finalArticleName) {
      toast({ variant: 'destructive', title: 'Produit requis', description: 'Veuillez sélectionner le pôle et type de produit ou indiquer la marchandise.' });
      return;
    }

    if (!isMarchandise && !newDescription.trim()) {
      toast({ variant: 'destructive', title: 'Motif requis', description: 'Veuillez préciser la nature de la dépense.' });
      return;
    }

    const desc = isMarchandise
      ? `Achat marché : ${finalArticleName}${newQuantity ? ` (${newQuantity} ${newUnitOfMeasure})` : ''}${newSupplierName.trim() ? ` chez ${newSupplierName.trim()}` : ''}${newDescription.trim() ? ` — ${newDescription.trim()}` : ''}`
      : newDescription.trim();

    setSaving(true);
    try {
      await onAddExpense({
        date: newDate,
        amount: amt,
        category: newCategory,
        description: desc,
        commercialName: currentUserName || 'Admin',
        ...(currentUserId ? { commercialId: currentUserId } : {}),
        storeId: isMarchandise ? (newWarehouseId || 'ENTREPOT') : (newStoreId || (stores[0]?.id || 'CHRIFA')),
        ...(newReceiptUrl.trim() ? { receiptUrl: newReceiptUrl.trim() } : {}),
        status: userRole === 'ADMIN' ? 'APPROVED' : 'PENDING',
        ...(isMarchandise ? {
          articleName: finalArticleName,
          generalCategoryId: selectedGenCatId || undefined,
          categoryId: selectedCategoryName || undefined,
          color: selectedColor || undefined,
          size: selectedSize || undefined,
          specs: selectedSpecs || undefined,
          zipperType: selectedZipperType || undefined,
          slider: selectedSlider || undefined,
          sliderType: selectedSliderType || undefined,
          gsm: selectedGsm ? Number(selectedGsm) : undefined,
          fabricWidth: selectedFabricWidth ? Number(selectedFabricWidth) : undefined,
          rollLength: selectedRollLength ? Number(selectedRollLength) : undefined,
          sliderWeightG: selectedSliderWeightG ? Number(selectedSliderWeightG) : undefined,
          pcsPerBag: selectedPcsPerBag ? Number(selectedPcsPerBag) : undefined,
          bagsPerCarton: selectedBagsPerCarton ? Number(selectedBagsPerCarton) : undefined,
          designImageUrl: selectedDesignImageUrl || undefined,
          quantity: newQuantity ? parseFloat(newQuantity) : undefined,
          unitPrice: newUnitPrice ? parseFloat(newUnitPrice) : (newQuantity ? amt / parseFloat(newQuantity) : undefined),
          unitOfMeasure: newUnitOfMeasure || 'pcs',
          supplierName: newSupplierName.trim() || undefined,
          addToStock: newAddToStock,
        } : {}),
      });

      setIsModalOpen(false);
      setNewAmount('');
      setNewDescription('');
      setNewReceiptUrl('');
      setNewArticleName('');
      setNewQuantity('');
      setNewUnitPrice('');
      setNewSupplierName('');
      setNewAddToStock(true);
      setNewWarehouseId(warehouseOptions[0]?.id || '');
      setSelectedGenCatId('');
      setSelectedCategoryName('');
      setSelectedColor('white');
      setSelectedSize('');
      setSelectedSpecs('');
      setSelectedZipperType('');
      setSelectedSlider('');
      setSelectedSliderType('');
      setSelectedGsm('');
      setSelectedFabricWidth('');
      setSelectedRollLength('');
      setIsManualArticle(false);
    } catch (err: any) {
      toast({ variant: 'destructive', title: 'Erreur', description: err?.message || 'Action impossible.' });
    } finally {
      setSaving(false);
    }
  };

  // Upload photo
  const handleReceiptFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      const b64 = reader.result as string;
      setNewReceiptUrl(b64);
    };
    reader.readAsDataURL(file);
  };

  // Export PDF
  const handleExportPDF = () => {
    const total = filteredExpenses.reduce((s, e) => s + (e.amount || 0), 0);
    const marchandise = filteredExpenses.filter(e => e.category === 'ACHAT_MARCHANDISE').reduce((s, e) => s + (e.amount || 0), 0);
    const carburant = filteredExpenses.filter(e => e.category === 'CARBURANT').reduce((s, e) => s + (e.amount || 0), 0);

    exportReportPDF({
      title: 'Frais & Dépenses des Commerciaux',
      subtitle: `${filteredExpenses.length} note(s) de frais — Total : ${fmt$(total)}`,
      columns: [
        { header: 'Date', dataKey: 'date', width: 22 },
        { header: 'Commercial', dataKey: 'commercial', width: 30 },
        { header: 'Catégorie', dataKey: 'category', width: 25 },
        { header: 'Motif / Description', dataKey: 'description' },
        { header: 'Montant (MAD)', dataKey: 'amount', width: 25 },
        { header: 'Statut', dataKey: 'status', width: 22 },
      ],
      data: filteredExpenses.map(e => ({
        date: e.date || '',
        commercial: e.commercialName || '—',
        category: CATEGORY_CONFIG[e.category]?.label || e.category,
        description: e.description || '',
        amount: `${(e.amount || 0).toLocaleString('fr-MA', { minimumFractionDigits: 2 })} MAD`,
        status: e.status === 'APPROVED' ? 'Validé' : e.status === 'REIMBURSED' ? 'Remboursé' : 'En attente',
      })),
      summaryRows: [
        { label: 'Total Général Dépenses', value: fmt$(total) },
        { label: 'Achats Marchandise Marché', value: fmt$(marchandise) },
        { label: 'Part Carburant', value: fmt$(carburant) },
      ],
      footer: 'LEBTEX SARL AU — Relevé Officiel des Frais Commerciaux & Justificatifs',
    });
  };

  return (
    <div className="space-y-6 animate-in fade-in duration-300 pb-12">
      {/* ── Header ── */}
      <div className="bg-stone-900 rounded-3xl p-6 sm:p-8 relative overflow-hidden shadow-2xl">
        <div className="absolute top-0 right-0 w-96 h-96 bg-amber-500/10 rounded-full -translate-y-1/2 translate-x-1/2 blur-3xl" />
        <div className="relative z-10 flex flex-col md:flex-row md:items-center justify-between gap-6">
          <div>
            <div className="flex items-center gap-2 mb-2">
              <span className="text-[9px] font-black uppercase tracking-[0.3em] text-amber-400 bg-amber-950/60 border border-amber-800/60 px-3 py-1 rounded-full">
                Gestion Commerciale & Dépenses
              </span>
            </div>
            <h1 className="text-2xl sm:text-4xl font-black text-white uppercase tracking-tighter flex items-center gap-3">
              <span>Frais, Dépenses & <span className="text-amber-500">Achats Marché</span></span>
            </h1>
            <p className="text-xs sm:text-sm text-stone-400 font-medium mt-2 max-w-xl">
              Suivi des dépenses sur le terrain, achats de marchandise au marché (dépannage local), carburant et justificatifs de frais.
            </p>
          </div>

          <div className="flex items-center gap-3 flex-wrap">
            <Button
              variant="outline"
              onClick={handleExportPDF}
              className="bg-stone-800 hover:bg-stone-700 text-white border-stone-700 font-black text-xs uppercase px-4 h-11 rounded-2xl gap-2 shadow-sm"
            >
              <Download className="w-4 h-4" />
              <span>Exporter PDF</span>
            </Button>
            <Button
              onClick={() => setIsModalOpen(true)}
              className="bg-amber-500 hover:bg-amber-600 text-stone-950 font-black text-xs uppercase px-5 h-11 rounded-2xl gap-2 shadow-lg shadow-amber-500/20"
            >
              <Plus className="w-4 h-4" />
              <span>Déclarer une dépense</span>
            </Button>
          </div>
        </div>
      </div>

      {/* ── KPI Cards ── */}
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
        {/* Total Mois */}
        <div className="bg-white rounded-2xl p-4 sm:p-5 border border-stone-100 shadow-sm">
          <div className="flex items-center justify-between mb-2">
            <span className="text-[9px] font-black uppercase tracking-widest text-stone-500 bg-stone-100 px-2 py-0.5 rounded-md">
              Ce mois-ci
            </span>
            <Receipt className="w-4 h-4 text-stone-400" />
          </div>
          <p className="text-xl sm:text-2xl font-black text-stone-900 tracking-tight">
            {fmt$(kpis.totalMonth)}
          </p>
          <p className="text-[9px] text-stone-400 font-bold mt-1">
            Total des frais déclarés
          </p>
        </div>

        {/* Cette semaine */}
        <div className="bg-white rounded-2xl p-4 sm:p-5 border border-stone-100 shadow-sm">
          <div className="flex items-center justify-between mb-2">
            <span className="text-[9px] font-black uppercase tracking-widest text-blue-700 bg-blue-100 px-2 py-0.5 rounded-md">
              Cette semaine
            </span>
            <Calendar className="w-4 h-4 text-blue-500" />
          </div>
          <p className="text-xl sm:text-2xl font-black text-blue-700 tracking-tight">
            {fmt$(kpis.totalWeek)}
          </p>
          <p className="text-[9px] text-stone-400 font-bold mt-1">
            Bilan hebdomadaire (Vendredi)
          </p>
        </div>

        {/* Achats Marchandise Marché */}
        <div className="bg-white rounded-2xl p-4 sm:p-5 border border-stone-100 shadow-sm">
          <div className="flex items-center justify-between mb-2">
            <span className="text-[9px] font-black uppercase tracking-widest text-indigo-700 bg-indigo-100 px-2 py-0.5 rounded-md flex items-center gap-1">
              <ShoppingBag className="w-3 h-3" /> Marchandise
            </span>
          </div>
          <p className="text-xl sm:text-2xl font-black text-indigo-600 tracking-tight">
            {fmt$(kpis.totalMarchandise)}
          </p>
          <p className="text-[9px] text-stone-400 font-bold mt-1">
            Achats dépannage marché
          </p>
        </div>

        {/* Carburant */}
        <div className="bg-white rounded-2xl p-4 sm:p-5 border border-stone-100 shadow-sm">
          <div className="flex items-center justify-between mb-2">
            <span className="text-[9px] font-black uppercase tracking-widest text-amber-700 bg-amber-100 px-2 py-0.5 rounded-md flex items-center gap-1">
              <Fuel className="w-3 h-3" /> Carburant
            </span>
          </div>
          <p className="text-xl sm:text-2xl font-black text-amber-600 tracking-tight">
            {fmt$(kpis.totalCarburant)}
          </p>
          <p className="text-[9px] text-stone-400 font-bold mt-1">
            Gasoil & Essence tournées
          </p>
        </div>

        {/* En attente validation */}
        <div className="bg-white rounded-2xl p-4 sm:p-5 border border-stone-100 shadow-sm col-span-2 lg:col-span-1">
          <div className="flex items-center justify-between mb-2">
            <span className="text-[9px] font-black uppercase tracking-widest text-orange-700 bg-orange-100 px-2 py-0.5 rounded-md">
              En Attente
            </span>
            <Clock className="w-4 h-4 text-orange-500" />
          </div>
          <p className="text-xl sm:text-2xl font-black text-orange-600 tracking-tight">
            {fmt$(kpis.totalPending)}
          </p>
          <p className="text-[9px] text-stone-400 font-bold mt-1">
            À valider par la direction
          </p>
        </div>
      </div>

      {/* ── Toolbar & Filtres ── */}
      <div className="bg-white rounded-2xl p-4 border border-stone-100 shadow-sm flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
        <div className="relative flex-1 max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-stone-400" />
          <Input
            placeholder="Rechercher commercial, marchandise, motif..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="pl-9 h-10 text-xs font-bold rounded-xl border-stone-200 bg-stone-50/50"
          />
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {/* Filtre Catégorie */}
          <Select value={selectedCategory} onValueChange={setSelectedCategory}>
            <SelectTrigger className="h-10 text-xs font-bold rounded-xl border-stone-200 min-w-[170px]">
              <SelectValue placeholder="Catégorie" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="ALL">Toutes les catégories</SelectItem>
              {Object.entries(CATEGORY_CONFIG).map(([k, cfg]) => (
                <SelectItem key={k} value={k}>
                  {cfg.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          {/* Filtre Statut */}
          <Select value={selectedStatus} onValueChange={setSelectedStatus}>
            <SelectTrigger className="h-10 text-xs font-bold rounded-xl border-stone-200 min-w-[130px]">
              <SelectValue placeholder="Statut" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="ALL">Tous les statuts</SelectItem>
              <SelectItem value="PENDING">⏳ En attente</SelectItem>
              <SelectItem value="APPROVED">✅ Validé</SelectItem>
              <SelectItem value="REIMBURSED">💵 Remboursé</SelectItem>
            </SelectContent>
          </Select>

          {/* Filtre Mois */}
          {availableMonths.length > 0 && (
            <Select value={selectedMonth} onValueChange={setSelectedMonth}>
              <SelectTrigger className="h-10 text-xs font-bold rounded-xl border-stone-200 min-w-[120px]">
                <SelectValue placeholder="Mois" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="ALL">Tous les mois</SelectItem>
                {availableMonths.map(m => (
                  <SelectItem key={m} value={m}>{m}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
        </div>
      </div>

      {/* ── Table des Dépenses ── */}
      <div className="bg-white rounded-3xl border border-stone-100 shadow-sm overflow-hidden">
        {filteredExpenses.length === 0 ? (
          <div className="py-20 text-center space-y-3">
            <div className="w-12 h-12 rounded-2xl bg-stone-100 text-stone-400 mx-auto flex items-center justify-center">
              <Receipt className="w-6 h-6" />
            </div>
            <p className="text-sm font-black uppercase tracking-wider text-stone-400">
              Aucune note de frais enregistrée
            </p>
            <Button
              onClick={() => setIsModalOpen(true)}
              variant="outline"
              size="sm"
              className="rounded-xl text-xs font-black uppercase"
            >
              Ajouter une dépense
            </Button>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs border-collapse">
              <thead>
                <tr className="border-b border-stone-100 bg-stone-50/50 text-[10px] font-black uppercase tracking-widest text-stone-400">
                  <th className="py-3 px-4">Date</th>
                  <th className="py-3 px-4">Affectation / Magasin</th>
                  <th className="py-3 px-4">Catégorie</th>
                  <th className="py-3 px-4">Détails & Marchandise</th>
                  <th className="py-3 px-4 text-right">Montant</th>
                  <th className="py-3 px-4 text-center">Statut</th>
                  <th className="py-3 px-4 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-stone-100">
                {filteredExpenses.map(expense => {
                  const catCfg = CATEGORY_CONFIG[expense.category] || CATEGORY_CONFIG.AUTRE;
                  const Icon = catCfg.icon;
                  const store = stores.find(s => s.id === expense.storeId);
                  const isMarchandise = expense.category === 'ACHAT_MARCHANDISE';

                  return (
                    <tr key={expense.id} className="hover:bg-stone-50/70 transition-colors">
                      <td className="py-3 px-4 whitespace-nowrap font-mono text-stone-600 font-bold">
                        {expense.date || '—'}
                      </td>
                      <td className="py-3 px-4 whitespace-nowrap">
                        {isMarchandise ? (
                          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-xl bg-amber-50 border border-amber-200 text-amber-900 text-[11px] font-black uppercase">
                            <Building2 className="w-3.5 h-3.5 text-amber-600" />
                            {store?.name || (expense.storeId === 'ENTREPOT' ? 'Entrepôt Principal' : (expense.storeId || 'Entrepôt'))}
                          </span>
                        ) : (
                          <div>
                            {store ? (
                              <span className="text-xs text-stone-800 font-bold flex items-center gap-1">
                                <Building2 className="w-3.5 h-3.5 text-stone-400" /> {store.name}
                              </span>
                            ) : (
                              <span className="text-[10px] text-stone-400 font-bold">Magasin général</span>
                            )}
                          </div>
                        )}
                      </td>
                      <td className="py-3 px-4 whitespace-nowrap">
                        <span className={`inline-flex items-center gap-1.5 text-[10px] font-black uppercase tracking-wider px-2.5 py-1 rounded-lg border ${catCfg.bg} ${catCfg.color}`}>
                          <Icon className="w-3 h-3" />
                          {catCfg.label}
                        </span>
                      </td>
                      <td className="py-3 px-4">
                        <div className="space-y-1">
                          <p className="text-stone-800 font-bold line-clamp-2">{expense.description}</p>
                          
                          {/* Badge spécifique Achat Marchandise & Entrée Stock */}
                          {isMarchandise && (
                            <div className="flex items-center gap-2 flex-wrap">
                              {expense.articleName && (
                                <span className="inline-flex items-center gap-1 text-[10px] font-black text-indigo-800 bg-indigo-50 border border-indigo-200 px-2 py-0.5 rounded-md">
                                  <Tag className="w-3 h-3 text-indigo-600" />
                                  {expense.articleName} {expense.quantity ? `(${expense.quantity} ${expense.unitOfMeasure || 'pcs'})` : ''}
                                </span>
                              )}
                              {(expense.stockMovementId || expense.addToStock) && (
                                <span className="inline-flex items-center gap-1 text-[9px] font-black uppercase text-emerald-800 bg-emerald-100 border border-emerald-300 px-2 py-0.5 rounded-full">
                                  <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
                                  Entré en stock ({store?.name || (expense.storeId === 'ENTREPOT' ? 'Entrepôt Principal' : (expense.storeId || 'Entrepôt'))})
                                </span>
                              )}
                              {expense.supplierName && (
                                <span className="text-[10px] text-stone-500 font-bold">
                                  Vendeur : <span className="text-stone-700">{expense.supplierName}</span>
                                </span>
                              )}
                            </div>
                          )}

                          {expense.receiptUrl && (
                            <button
                              onClick={() => setPreviewImage(expense.receiptUrl!)}
                              className="text-[10px] font-black text-blue-600 hover:underline flex items-center gap-1 mt-0.5"
                            >
                              <Camera className="w-3 h-3" /> Voir ticket / reçu
                            </button>
                          )}
                        </div>
                      </td>
                      <td className="py-3 px-4 text-right whitespace-nowrap">
                        <span className="text-sm font-black text-stone-900">
                          {fmt$(expense.amount)}
                        </span>
                      </td>
                      <td className="py-3 px-4 text-center whitespace-nowrap">
                        {expense.status === 'APPROVED' ? (
                          <span className="text-[9px] font-black text-emerald-700 bg-emerald-100 px-2 py-0.5 rounded-full uppercase">
                            Validé
                          </span>
                        ) : expense.status === 'REIMBURSED' ? (
                          <span className="text-[9px] font-black text-blue-700 bg-blue-100 px-2 py-0.5 rounded-full uppercase">
                            Remboursé
                          </span>
                        ) : (
                          <span className="text-[9px] font-black text-orange-700 bg-orange-100 px-2 py-0.5 rounded-full uppercase">
                            En attente
                          </span>
                        )}
                      </td>
                      <td className="py-3 px-4 text-right whitespace-nowrap">
                        <div className="flex items-center justify-end gap-1.5">
                          {userRole === 'ADMIN' && onUpdateExpenseStatus && expense.status !== 'APPROVED' && (
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => onUpdateExpenseStatus(expense.id, 'APPROVED')}
                              className="h-8 px-2.5 rounded-xl border-emerald-200 text-emerald-700 hover:bg-emerald-50 text-[10px] font-black uppercase"
                              title="Valider la dépense"
                            >
                              <Check className="w-3.5 h-3.5 mr-1" /> Valider
                            </Button>
                          )}
                          {onDeleteExpense && (userRole === 'ADMIN' || expense.status === 'PENDING') && (
                            <Button
                              size="sm"
                              variant="ghost"
                              onClick={() => onDeleteExpense(expense.id)}
                              className="h-8 w-8 p-0 text-stone-300 hover:text-red-600 rounded-xl"
                              title="Supprimer la note"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </Button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* ── Modal d'Ajout d'une Dépense ── */}
      <Dialog open={isModalOpen} onOpenChange={setIsModalOpen}>
        <DialogContent className="max-w-2xl rounded-3xl p-6 max-h-[92vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="text-lg font-black uppercase tracking-tight flex items-center gap-2">
              <Receipt className="w-5 h-5 text-amber-500" />
              <span>Déclarer une Dépense / Achat Marché</span>
            </DialogTitle>
          </DialogHeader>

          <form onSubmit={handleSubmit} className="space-y-4 pt-2">
            <div className="space-y-1">
              <Label className="text-[10px] font-black uppercase text-stone-500">Catégorie de dépense</Label>
              <Select value={newCategory} onValueChange={(v: ExpenseCategory) => setNewCategory(v)}>
                <SelectTrigger className="rounded-xl h-10 text-xs font-bold">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {Object.entries(CATEGORY_CONFIG).map(([k, cfg]) => (
                    <SelectItem key={k} value={k}>
                      {cfg.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* SECTION DÉDIÉE : ACHAT MARCHANDISE DU MARCHÉ (EXACTEMENT COMME NVX PTDS DANS LEBTEX/GESTION) */}
            {newCategory === 'ACHAT_MARCHANDISE' && (
              <div className="p-4 rounded-2xl bg-indigo-50/70 border-2 border-indigo-200 space-y-4 animate-in fade-in">
                {/* En-tête avec switch Catalogue vs Saisie libre */}
                <div className="flex items-center justify-between gap-2 border-b border-indigo-200/60 pb-3">
                  <div className="flex items-center gap-2">
                    <ShoppingBag className="w-4 h-4 text-indigo-700" />
                    <span className="text-xs font-black uppercase text-indigo-950 tracking-wider">
                      Sélection du Produit Achete au Marché
                    </span>
                  </div>
                  <div className="flex items-center gap-1.5 bg-white/80 p-1 rounded-xl border border-indigo-200 text-[10px] font-bold">
                    <button
                      type="button"
                      onClick={() => setIsManualArticle(false)}
                      className={`px-2.5 py-1 rounded-lg transition-all ${
                        !isManualArticle
                          ? 'bg-indigo-600 text-white font-black shadow-sm'
                          : 'text-indigo-700 hover:bg-indigo-50'
                      }`}
                    >
                      Catalogue Lebtex
                    </button>
                    <button
                      type="button"
                      onClick={() => setIsManualArticle(true)}
                      className={`px-2.5 py-1 rounded-lg transition-all ${
                        isManualArticle
                          ? 'bg-indigo-600 text-white font-black shadow-sm'
                          : 'text-indigo-700 hover:bg-indigo-50'
                      }`}
                    >
                      Hors Catalogue
                    </button>
                  </div>
                </div>

                {!isManualArticle ? (
                  <>
                    {/* ── 1. Identification (Pôle & Type Produit) ── */}
                    <SectionLabel icon={<Layers className="w-3 h-3" />} label="1. Identification Catalogue" />
                    
                    <div className="grid grid-cols-2 gap-3">
                      {/* Pôle (Catégorie Générale) */}
                      <div className="space-y-1.5">
                        <Label className="text-[10px] font-black text-stone-500 uppercase tracking-widest flex items-center gap-1">
                          <Layers className="w-3 h-3" /> Pôle
                        </Label>
                        <Select 
                          value={selectedGenCatId} 
                          onValueChange={id => { 
                            setSelectedGenCatId(id); 
                            setSelectedCategoryName(''); 
                          }}
                        >
                          <SelectTrigger className="h-10 font-bold rounded-xl border-stone-200 bg-white text-xs">
                            <SelectValue placeholder="Choisir le pôle..." />
                          </SelectTrigger>
                          <SelectContent className="max-h-72">
                            {(() => {
                              const sorted = [...(generalCategories || [])].sort((a: any, b: any) => (a.name || '').localeCompare(b.name || '', 'fr'));
                              const grouped: Record<string, any[]> = {};
                              sorted.forEach((gc: any) => {
                                const letter = (gc.name || '?')[0].toUpperCase();
                                if (!grouped[letter]) grouped[letter] = [];
                                grouped[letter].push(gc);
                              });
                              return Object.entries(grouped).map(([letter, items]) => (
                                <SelectGroup key={letter}>
                                  <SelectLabel className="text-[9px] text-stone-400 font-black uppercase tracking-widest bg-stone-50 py-1">{letter}</SelectLabel>
                                  {items.map((gc: any) => (
                                    <SelectItem key={gc.id} value={gc.id} className="font-bold pl-6 text-xs">{gc.name}</SelectItem>
                                  ))}
                                </SelectGroup>
                              ));
                            })()}
                          </SelectContent>
                        </Select>
                      </div>

                      {/* Type Produit (Sous-catégorie) */}
                      <div className="space-y-1.5">
                        <Label className="text-[10px] font-black text-stone-500 uppercase tracking-widest flex items-center gap-1">
                          <Package className="w-3 h-3" /> Type Produit
                        </Label>
                        <Select
                          disabled={!selectedGenCatId}
                          value={selectedCategoryName}
                          onValueChange={handleSelectSubCategory}
                        >
                          <SelectTrigger className={`h-10 font-bold rounded-xl border text-xs ${!selectedGenCatId ? 'opacity-50' : 'border-stone-200 bg-white'}`}>
                            <SelectValue placeholder={selectedGenCatId ? "Choisir le produit..." : "← Pôle d'abord"} />
                          </SelectTrigger>
                          <SelectContent className="max-h-72">
                            <GroupedCategorySelect />
                          </SelectContent>
                        </Select>
                      </div>
                    </div>

                    {/* ── 2. Spécifications & Caractéristiques ── */}
                    {selectedCategoryName && (
                      <div className="space-y-3 pt-1">
                        <SectionLabel icon={<Settings2 className="w-3 h-3" />} label="2. Spécifications du Produit" />

                        {isFabric ? (
                          /* CAS FABRIC */
                          <div className="space-y-3 p-3.5 rounded-2xl bg-white/80 border border-indigo-200">
                            <div className="grid grid-cols-2 gap-3">
                              {/* Qualité Fabric */}
                              <div className="space-y-1">
                                <Label className="text-[10px] font-black text-indigo-900 uppercase tracking-wider flex items-center gap-1">
                                  <Maximize className="w-3 h-3 text-indigo-600" /> Qualité Tissu
                                </Label>
                                {fabricQualities.length > 0 ? (
                                  <Select onValueChange={v => {
                                    const q = fabricQualities[Number(v)];
                                    if (q) {
                                      setSelectedGsm(q.gsm ? String(q.gsm) : '');
                                      setSelectedFabricWidth(q.fabricWidth ? String(q.fabricWidth) : '');
                                      setSelectedRollLength(q.rollLength ? String(q.rollLength) : '');
                                      setSelectedRollLengthUnit(q.rollLengthUnit || 'm');
                                      setSelectedPackagingPerBag(q.packagingPerBag ? String(q.packagingPerBag) : '');
                                    }
                                  }}>
                                    <SelectTrigger className="h-9 border-indigo-200 bg-white font-bold rounded-xl text-xs text-indigo-900">
                                      <SelectValue placeholder="Choisir une qualité..." />
                                    </SelectTrigger>
                                    <SelectContent>
                                      {fabricQualities.map((q: any, i: number) => (
                                        <SelectItem key={i} value={String(i)} className="font-bold text-xs">{q.label}</SelectItem>
                                      ))}
                                    </SelectContent>
                                  </Select>
                                ) : (
                                  <div className="grid grid-cols-2 gap-2">
                                    <Input
                                      type="number"
                                      placeholder="GSM (ex: 120)"
                                      value={selectedGsm}
                                      onChange={e => setSelectedGsm(e.target.value)}
                                      className="h-9 border-stone-200 bg-white rounded-xl text-xs font-bold"
                                    />
                                    <Input
                                      type="number"
                                      placeholder="Larg cm (ex: 150)"
                                      value={selectedFabricWidth}
                                      onChange={e => setSelectedFabricWidth(e.target.value)}
                                      className="h-9 border-stone-200 bg-white rounded-xl text-xs font-bold"
                                    />
                                  </div>
                                )}
                              </div>

                              {/* Couleur Fabric */}
                              <div className="space-y-1">
                                <Label className="text-[10px] font-black text-indigo-900 uppercase tracking-wider flex items-center gap-1">
                                  <Palette className="w-3 h-3 text-indigo-600" /> Couleur
                                </Label>
                                <Select value={selectedColor} onValueChange={setSelectedColor}>
                                  <SelectTrigger className="h-9 border-indigo-200 bg-white font-bold rounded-xl text-xs uppercase">
                                    <SelectValue />
                                  </SelectTrigger>
                                  <SelectContent className="max-h-60">
                                    {COLORS.map(c => (
                                      <SelectItem key={c} value={c} className="font-bold uppercase text-xs">{c}</SelectItem>
                                    ))}
                                  </SelectContent>
                                </Select>
                              </div>
                            </div>
                          </div>
                        ) : isZipper ? (
                          /* CAS ZIPPER */
                          <div className="space-y-3 p-3.5 rounded-2xl bg-white/80 border border-indigo-200">
                            <div className="grid grid-cols-2 gap-3">
                              {/* Qualité / Taille Zipper */}
                              <div className="space-y-1">
                                <Label className="text-[10px] font-black text-indigo-900 uppercase tracking-wider flex items-center gap-1">
                                  <Ruler className="w-3 h-3 text-indigo-600" /> Longueur / Taille
                                </Label>
                                {zipperQualities.length > 0 ? (
                                  <Select onValueChange={v => {
                                    const q = zipperQualities[Number(v)];
                                    if (q) {
                                      setSelectedSize(q.length || '');
                                      setSelectedZipperType(q.zipperType || '');
                                      setSelectedSlider(q.slider || '');
                                      setSelectedSliderType(q.sliderType || '');
                                    }
                                  }}>
                                    <SelectTrigger className="h-9 border-indigo-200 bg-white font-bold rounded-xl text-xs text-indigo-900">
                                      <SelectValue placeholder="Choisir une qualité..." />
                                    </SelectTrigger>
                                    <SelectContent>
                                      {zipperQualities.map((q: any, i: number) => (
                                        <SelectItem key={i} value={String(i)} className="font-bold text-xs">{q.label}</SelectItem>
                                      ))}
                                    </SelectContent>
                                  </Select>
                                ) : (
                                  <Input
                                    placeholder="Ex: 20cm, 50cm, Long Chain..."
                                    value={selectedSize}
                                    onChange={e => setSelectedSize(e.target.value)}
                                    className="h-9 border-stone-200 bg-white rounded-xl text-xs font-bold"
                                  />
                                )}
                              </div>

                              {/* Couleur Zipper */}
                              <div className="space-y-1">
                                <Label className="text-[10px] font-black text-indigo-900 uppercase tracking-wider flex items-center gap-1">
                                  <Palette className="w-3 h-3 text-indigo-600" /> Couleur
                                </Label>
                                <Select value={selectedColor} onValueChange={setSelectedColor}>
                                  <SelectTrigger className="h-9 border-indigo-200 bg-white font-bold rounded-xl text-xs uppercase">
                                    <SelectValue />
                                  </SelectTrigger>
                                  <SelectContent className="max-h-60">
                                    {COLORS.map(c => (
                                      <SelectItem key={c} value={c} className="font-bold uppercase text-xs">{c}</SelectItem>
                                    ))}
                                  </SelectContent>
                                </Select>
                              </div>
                            </div>
                          </div>
                        ) : isThread ? (
                          /* CAS THREAD */
                          <div className="space-y-3 p-3.5 rounded-2xl bg-white/80 border border-teal-200">
                            <div className="grid grid-cols-2 gap-3">
                              {/* Qualité Thread */}
                              <div className="space-y-1">
                                <Label className="text-[10px] font-black text-teal-900 uppercase tracking-wider flex items-center gap-1">
                                  <span className="text-xs">🪡</span> Qualité Thread
                                </Label>
                                {threadQualities.length > 0 ? (
                                  <Select onValueChange={v => {
                                    const q = threadQualities[Number(v)];
                                    if (q) {
                                      setSelectedConeWeightG(q.coneWeightG ? String(q.coneWeightG) : '');
                                      setSelectedThreadWeightG(q.threadWeightG ? String(q.threadWeightG) : '');
                                      setSelectedLengthPerPiece(q.lengthPerPiece ? String(q.lengthPerPiece) : '');
                                      setSelectedLengthUnit(q.lengthUnit || 'm');
                                      setSelectedPcsPerBag(q.pcsPerBag ? String(q.pcsPerBag) : '');
                                      setSelectedBagsPerCarton(q.bagsPerCarton ? String(q.bagsPerCarton) : '');
                                    }
                                  }}>
                                    <SelectTrigger className="h-9 border-teal-200 bg-white font-bold rounded-xl text-xs text-teal-900">
                                      <SelectValue placeholder="Choisir une qualité..." />
                                    </SelectTrigger>
                                    <SelectContent>
                                      {threadQualities.map((q: any, i: number) => (
                                        <SelectItem key={i} value={String(i)} className="font-bold text-xs">{q.label}</SelectItem>
                                      ))}
                                    </SelectContent>
                                  </Select>
                                ) : (
                                  <div className="grid grid-cols-2 gap-2">
                                    <Input
                                      placeholder="Cône (ex: 10g)"
                                      value={selectedConeWeightG}
                                      onChange={e => setSelectedConeWeightG(e.target.value)}
                                      className="h-9 border-stone-200 bg-white rounded-xl text-xs font-bold"
                                    />
                                    <Input
                                      placeholder="Fil (ex: 100g)"
                                      value={selectedThreadWeightG}
                                      onChange={e => setSelectedThreadWeightG(e.target.value)}
                                      className="h-9 border-stone-200 bg-white rounded-xl text-xs font-bold"
                                    />
                                  </div>
                                )}
                              </div>

                              {/* Couleur Thread */}
                              <div className="space-y-1">
                                <Label className="text-[10px] font-black text-teal-900 uppercase tracking-wider flex items-center gap-1">
                                  <Palette className="w-3 h-3 text-teal-600" /> Couleur
                                </Label>
                                <Select value={selectedColor} onValueChange={setSelectedColor}>
                                  <SelectTrigger className="h-9 border-teal-200 bg-white font-bold rounded-xl text-xs uppercase">
                                    <SelectValue />
                                  </SelectTrigger>
                                  <SelectContent className="max-h-60">
                                    {COLORS.map(c => (
                                      <SelectItem key={c} value={c} className="font-bold uppercase text-xs">{c}</SelectItem>
                                    ))}
                                  </SelectContent>
                                </Select>
                              </div>
                            </div>
                          </div>
                        ) : isSlider ? (
                          /* CAS SLIDER */
                          <div className="space-y-3 p-3.5 rounded-2xl bg-white/80 border border-orange-200">
                            <div className="grid grid-cols-2 gap-3">
                              {/* Qualité / Modèle Slider */}
                              <div className="space-y-1">
                                <Label className="text-[10px] font-black text-orange-900 uppercase tracking-wider flex items-center gap-1">
                                  <span className="text-xs">🎛️</span> Qualité / Modèle Slider
                                </Label>
                                {sliderQualities.length > 0 ? (
                                  <Select onValueChange={v => {
                                    const q = sliderQualities[Number(v)];
                                    if (q) {
                                      setSelectedSize(q.size || '');
                                      setSelectedSliderWeightG(q.sliderWeightG ? String(q.sliderWeightG) : '');
                                      setSelectedPcsPerBag(q.pcsPerBag ? String(q.pcsPerBag) : '');
                                      setSelectedBagsPerCarton(q.bagsPerCarton ? String(q.bagsPerCarton) : '');
                                      setSelectedDesignImageUrl(q.imageUrl || '');
                                    }
                                  }}>
                                    <SelectTrigger className="h-9 border-orange-200 bg-white font-bold rounded-xl text-xs text-orange-900">
                                      <SelectValue placeholder="Choisir un modèle..." />
                                    </SelectTrigger>
                                    <SelectContent>
                                      {sliderQualities.map((q: any, i: number) => (
                                        <SelectItem key={i} value={String(i)} className="font-bold text-xs">
                                          <div className="flex items-center gap-2">
                                            {q.imageUrl && <img src={q.imageUrl} alt="" className="w-4 h-4 rounded object-cover" />}
                                            <span>{q.label}</span>
                                            {q.size && <span className="text-orange-600 font-bold">({q.size})</span>}
                                          </div>
                                        </SelectItem>
                                      ))}
                                    </SelectContent>
                                  </Select>
                                ) : (
                                  <div className="grid grid-cols-2 gap-2">
                                    <Input
                                      placeholder="Taille (ex: #3)"
                                      value={selectedSize}
                                      onChange={e => setSelectedSize(e.target.value)}
                                      className="h-9 border-stone-200 bg-white rounded-xl text-xs font-bold"
                                    />
                                    <Input
                                      placeholder="Poids curseur (ex: 2.5g)"
                                      value={selectedSliderWeightG}
                                      onChange={e => setSelectedSliderWeightG(e.target.value)}
                                      className="h-9 border-stone-200 bg-white rounded-xl text-xs font-bold"
                                    />
                                  </div>
                                )}
                              </div>

                              {/* Couleur */}
                              <div className="space-y-1">
                                <Label className="text-[10px] font-black text-stone-400 uppercase tracking-wider">Couleur</Label>
                                <Select value={selectedColor} onValueChange={setSelectedColor}>
                                  <SelectTrigger className="h-9 border-stone-200 bg-white font-bold rounded-xl text-xs uppercase">
                                    <SelectValue />
                                  </SelectTrigger>
                                  <SelectContent className="max-h-60">
                                    {COLORS.map(c => (
                                      <SelectItem key={c} value={c} className="font-bold uppercase text-xs">{c}</SelectItem>
                                    ))}
                                  </SelectContent>
                                </Select>
                              </div>
                            </div>

                            {/* Aperçu Photo & Badges */}
                            <div className="flex items-center gap-3">
                              {selectedDesignImageUrl && (
                                <img src={selectedDesignImageUrl} alt="" className="w-10 h-10 rounded-lg object-cover border border-orange-200 shrink-0" />
                              )}
                              <div className="flex flex-wrap gap-1.5">
                                {selectedSize && <span className="px-2 py-0.5 rounded bg-orange-100 text-orange-800 text-[10px] font-black">{selectedSize}</span>}
                                {selectedSliderWeightG && <span className="px-2 py-0.5 rounded bg-amber-100 text-amber-800 text-[10px] font-black">{selectedSliderWeightG}g/pc</span>}
                                {selectedPcsPerBag && <span className="px-2 py-0.5 rounded bg-cyan-100 text-cyan-800 text-[10px] font-black">{selectedPcsPerBag} pcs/bag</span>}
                                {selectedBagsPerCarton && <span className="px-2 py-0.5 rounded bg-indigo-100 text-indigo-700 text-[10px] font-black">{selectedBagsPerCarton} bags/ctn</span>}
                              </div>
                            </div>
                          </div>
                        ) : (
                          /* CAS STANDARD / AUTRE */
                          <div className="space-y-3 p-3.5 rounded-2xl bg-white/80 border border-indigo-200">
                            <div className="grid grid-cols-2 gap-3">
                              <div className="space-y-1">
                                <Label className="text-[10px] font-black text-indigo-900 uppercase tracking-wider">Taille / Dimension</Label>
                                {availableSizes.length > 0 ? (
                                  <Select value={selectedSize} onValueChange={setSelectedSize}>
                                    <SelectTrigger className="h-9 border-indigo-200 bg-white font-bold rounded-xl text-xs">
                                      <SelectValue placeholder="Choisir..." />
                                    </SelectTrigger>
                                    <SelectContent>
                                      {availableSizes.map((s: string) => (
                                        <SelectItem key={s} value={s} className="font-bold text-xs">{s}</SelectItem>
                                      ))}
                                    </SelectContent>
                                  </Select>
                                ) : (
                                  <Input
                                    placeholder="Ex: 14L, 18L, 20mm..."
                                    value={selectedSize}
                                    onChange={e => setSelectedSize(e.target.value)}
                                    className="h-9 border-stone-200 bg-white rounded-xl text-xs font-bold"
                                  />
                                )}
                              </div>

                              <div className="space-y-1">
                                <Label className="text-[10px] font-black text-indigo-900 uppercase tracking-wider">Couleur</Label>
                                <Select value={selectedColor} onValueChange={setSelectedColor}>
                                  <SelectTrigger className="h-9 border-indigo-200 bg-white font-bold rounded-xl text-xs uppercase">
                                    <SelectValue />
                                  </SelectTrigger>
                                  <SelectContent className="max-h-60">
                                    {COLORS.map(c => (
                                      <SelectItem key={c} value={c} className="font-bold uppercase text-xs">{c}</SelectItem>
                                    ))}
                                  </SelectContent>
                                </Select>
                              </div>
                            </div>
                          </div>
                        )}

                        {/* Badge de synthèse du produit */}
                        {computedArticleName && (
                          <div className="p-2.5 rounded-xl bg-indigo-100/90 border border-indigo-300 flex items-center justify-between gap-2">
                            <div className="flex items-center gap-2">
                              <Sparkles className="w-4 h-4 text-indigo-600 shrink-0" />
                              <div>
                                <p className="text-[9px] font-black uppercase text-indigo-600 tracking-wider">Désignation Générée</p>
                                <p className="text-xs font-black text-indigo-950">{computedArticleName}</p>
                              </div>
                            </div>
                            <span className="text-[9px] font-black uppercase tracking-widest px-2 py-0.5 rounded-md bg-white text-indigo-700 border border-indigo-200">
                              Catalogue
                            </span>
                          </div>
                        )}
                      </div>
                    )}
                  </>
                ) : (
                  /* ── Mode Saisie Libre Hors Catalogue ── */
                  <div className="space-y-1 bg-white/80 p-3.5 rounded-2xl border border-indigo-200">
                    <Label className="text-[10px] font-black uppercase text-indigo-900">
                      Désignation libre de la marchandise *
                    </Label>
                    <Input
                      placeholder="Ex: Tissu doublure sergé spécial, fil à coudre écru..."
                      value={newArticleName}
                      onChange={e => setNewArticleName(e.target.value)}
                      className="rounded-xl h-10 text-xs font-bold bg-white border-indigo-200"
                    />
                  </div>
                )}

                {/* ── 3. Quantité & Prix d'Achat Constaté ── */}
                <div className="space-y-2 pt-1">
                  <SectionLabel icon={<DollarSign className="w-3 h-3" />} label="3. Quantité & Prix Achat Constaté" />

                  <div className="grid grid-cols-3 gap-2 bg-white/90 p-3 rounded-2xl border border-indigo-200">
                    <div className="space-y-1">
                      <Label className="text-[10px] font-black uppercase text-indigo-900">Quantité *</Label>
                      <Input
                        type="number"
                        step="any"
                        min="0.1"
                        placeholder="Ex: 25"
                        value={newQuantity}
                        onChange={e => handleQtyChange(e.target.value)}
                        className="rounded-xl h-9 text-xs font-bold bg-white border-indigo-200"
                        required
                      />
                    </div>

                    <div className="space-y-1">
                      <Label className="text-[10px] font-black uppercase text-indigo-900">Unité</Label>
                      <Select value={newUnitOfMeasure} onValueChange={setNewUnitOfMeasure}>
                        <SelectTrigger className="rounded-xl h-9 text-xs font-bold bg-white border-indigo-200">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {UNITS.map(u => (
                            <SelectItem key={u} value={u} className="text-xs font-bold">{u}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>

                    <div className="space-y-1">
                      <Label className="text-[10px] font-black uppercase text-indigo-900">P.U Achat (MAD) *</Label>
                      <Input
                        type="number"
                        step="any"
                        min="0"
                        placeholder="Ex: 15.50"
                        value={newUnitPrice}
                        onChange={e => handlePriceChange(e.target.value)}
                        className="rounded-xl h-9 text-xs font-bold bg-white border-indigo-200"
                        required
                      />
                    </div>
                  </div>

                  {/* Suggestion dernier prix d'achat */}
                  {lastOrderInfo?.price && (
                    <div className="flex items-center justify-between text-[10px] font-bold px-3 py-1.5 bg-amber-50 rounded-xl border border-amber-200 text-amber-900">
                      <span>💡 Dernier prix constaté dans les commandes : <strong>{lastOrderInfo.price} MAD/{lastOrderInfo.unitOfMeasure || 'unité'}</strong></span>
                      <button
                        type="button"
                        onClick={() => handlePriceChange(String(lastOrderInfo.price))}
                        className="text-[9px] font-black uppercase underline hover:text-amber-950 ml-2"
                      >
                        Appliquer ce prix
                      </button>
                    </div>
                  )}

                  {/* Total calculé en direct */}
                  {newQuantity && newUnitPrice && (
                    <div className="p-3 bg-stone-900 rounded-2xl text-white flex justify-between items-center shadow-sm">
                      <div className="text-[10px] uppercase font-bold text-stone-300">
                        Total calculé : <span className="text-amber-400 font-black">{newQuantity} {newUnitOfMeasure} × {newUnitPrice} MAD</span>
                      </div>
                      <div className="text-base font-black text-amber-400">
                        {fmt$(Number(newAmount) || 0)}
                      </div>
                    </div>
                  )}
                </div>

                {/* ── 4. Fournisseur & Entrée Stock ── */}
                <div className="space-y-2 pt-1">
                  <SectionLabel icon={<Building2 className="w-3 h-3" />} label="4. Vendeur Marché & Entrée Stock" />

                  <div className="space-y-1">
                    <Label className="text-[10px] font-black uppercase text-indigo-900">
                      Grossiste / Vendeur du marché (Optionnel)
                    </Label>
                    <Input
                      list="known-suppliers-list"
                      placeholder="Ex: Grossiste Derb Omar, Tissus Maroc..."
                      value={newSupplierName}
                      onChange={e => setNewSupplierName(e.target.value)}
                      className="rounded-xl h-9 text-xs font-bold bg-white border-indigo-200"
                    />
                    <datalist id="known-suppliers-list">
                      {knownSuppliers.map(s => <option key={s} value={s} />)}
                    </datalist>
                  </div>

                  {/* Sélection de l'Entrepôt de destination */}
                  <div className="p-3.5 rounded-2xl bg-amber-50/90 border border-amber-200 space-y-2">
                    <div className="flex items-center justify-between">
                      <Label className="text-[10px] font-black uppercase tracking-wider text-amber-900 flex items-center gap-1.5">
                        <Building2 className="w-3.5 h-3.5 text-amber-700" />
                        Sélection de l'Entrepôt de destination *
                      </Label>
                      <span className="text-[9px] font-black uppercase px-2 py-0.5 rounded-md bg-amber-200 text-amber-900">
                        {warehouseOptions.length} entrepôt{warehouseOptions.length > 1 ? 's' : ''}
                      </span>
                    </div>

                    {warehouseOptions.length === 0 ? (
                      <div className="p-3 bg-white rounded-xl border border-amber-300 text-amber-900 text-xs font-medium">
                        ⚠️ Aucun entrepôt configuré dans le système. Vous pouvez créer vos entrepôts personnalisés dans l'onglet <strong>Paramètres</strong> / <strong>Entrepôts</strong>.
                      </div>
                    ) : (
                      <Select value={newWarehouseId} onValueChange={setNewWarehouseId}>
                        <SelectTrigger className="rounded-xl h-10 text-xs font-black bg-white border-amber-300 shadow-sm">
                          <SelectValue placeholder="Choisir l'entrepôt" />
                        </SelectTrigger>
                        <SelectContent>
                          {warehouseOptions.map(wh => (
                            <SelectItem key={wh.id} value={wh.id} className="text-xs font-bold">
                              🏭 {wh.name} ({wh.id})
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    )}
                  </div>

                  {/* Case à cocher : Entrée automatique en stock entrepôt */}
                  <div className="flex items-start gap-2.5 bg-white p-3 rounded-2xl border border-indigo-200 shadow-sm">
                    <input
                      type="checkbox"
                      id="addToStock"
                      checked={newAddToStock}
                      onChange={e => setNewAddToStock(e.target.checked)}
                      className="w-4 h-4 mt-0.5 rounded text-indigo-600 cursor-pointer"
                    />
                    <label htmlFor="addToStock" className="text-[11px] text-indigo-950 font-bold leading-tight cursor-pointer">
                      <span className="font-black flex items-center gap-1.5">
                        <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
                        Faire entrer automatiquement cette marchandise dans l'entrepôt sélectionné
                      </span>
                      <span className="block text-[10px] text-indigo-700 font-normal mt-0.5">
                        Crée l'article et le mouvement IN directement dans {warehouseOptions.find(w => w.id === newWarehouseId)?.name || 'l\'entrepôt sélectionné'}.
                      </span>
                    </label>
                  </div>
                </div>
              </div>
            )}

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label className="text-[10px] font-black uppercase text-stone-500">Date</Label>
                <Input
                  type="date"
                  value={newDate}
                  onChange={e => setNewDate(e.target.value)}
                  className="rounded-xl h-10 text-xs font-bold"
                  required
                />
              </div>

              <div className="space-y-1">
                <Label className="text-[10px] font-black uppercase text-stone-500">Montant Total (MAD) *</Label>
                <Input
                  type="number"
                  step="any"
                  min="0.1"
                  placeholder="Ex: 250"
                  value={newAmount}
                  onChange={e => setNewAmount(e.target.value)}
                  className="rounded-xl h-10 text-xs font-bold"
                  required
                />
              </div>
            </div>

            <div className="space-y-1">
              <Label className="text-[10px] font-black uppercase text-stone-500">
                {newCategory === 'ACHAT_MARCHANDISE' ? 'Précisions / Note supplémentaire' : 'Motif / Description *'}
              </Label>
              <Input
                placeholder={newCategory === 'ACHAT_MARCHANDISE' ? 'Note ou détail pour la caisse / comptabilité' : 'Ex: Plein carburant camionnette tournée Derb Omar'}
                value={newDescription}
                onChange={e => setNewDescription(e.target.value)}
                className="rounded-xl h-10 text-xs font-bold"
                required={newCategory !== 'ACHAT_MARCHANDISE'}
              />
            </div>

            {/* Magasin rattaché uniquement pour les frais généraux (pas pour l'achat marchandise qui va à l'Entrepôt) */}
            {newCategory !== 'ACHAT_MARCHANDISE' && (
              <div className="space-y-1">
                <Label className="text-[10px] font-black uppercase text-stone-500">Magasin rattaché</Label>
                <Select value={newStoreId} onValueChange={setNewStoreId}>
                  <SelectTrigger className="rounded-xl h-10 text-xs font-bold">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {stores.map(s => (
                      <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}

            {/* Photo / Justificatif du reçu */}
            <div className="space-y-1 pt-1">
              <Label className="text-[10px] font-black uppercase text-stone-500 flex items-center gap-1.5">
                <Camera className="w-3.5 h-3.5 text-stone-400" />
                <span>Photo du bon / ticket de caisse / reçu marché</span>
              </Label>
              <input
                type="file"
                accept="image/*"
                capture="environment"
                onChange={handleReceiptFile}
                className="w-full text-xs file:mr-3 file:py-2 file:px-3 file:rounded-xl file:border-0 file:text-xs file:font-black file:bg-stone-100 file:text-stone-700 hover:file:bg-stone-200 cursor-pointer"
              />
              {newReceiptUrl && (
                <p className="text-[10px] text-emerald-600 font-black flex items-center gap-1 mt-1">
                  <Check className="w-3 h-3" /> Justificatif photo chargé avec succès
                </p>
              )}
            </div>

            <DialogFooter className="pt-4 flex justify-between items-center gap-2">
              <Button
                type="button"
                variant="outline"
                onClick={() => setIsModalOpen(false)}
                className="rounded-xl text-xs font-bold"
              >
                Annuler
              </Button>
              <Button
                type="submit"
                disabled={saving}
                className="bg-amber-500 hover:bg-amber-600 text-stone-950 font-black text-xs uppercase px-5 rounded-xl shadow-md"
              >
                {saving ? 'Enregistrement...' : 'Enregistrer la Dépense'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* ── Modal Visualisation Photo Reçu ── */}
      <Dialog open={!!previewImage} onOpenChange={() => setPreviewImage(null)}>
        <DialogContent className="max-w-lg p-3 bg-stone-900 border-stone-800 rounded-3xl overflow-hidden">
          <div className="flex justify-between items-center p-2 text-white">
            <span className="text-xs font-black uppercase tracking-wider">Justificatif / Reçu</span>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setPreviewImage(null)}
              className="text-stone-400 hover:text-white h-7 w-7 p-0"
            >
              <X className="w-4 h-4" />
            </Button>
          </div>
          {previewImage && (
            <div className="max-h-[75vh] overflow-auto rounded-2xl flex items-center justify-center bg-black/40 p-2">
              <img
                src={previewImage}
                alt="Reçu"
                className="max-h-[70vh] w-auto object-contain rounded-xl shadow-2xl"
              />
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
