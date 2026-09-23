"use client";

import React, { useState, useMemo, useEffect } from 'react';
import { 
  Receipt, Fuel, Utensils, Car, ParkingCircle, Package, MoreHorizontal,
  Plus, Search, Filter, Calendar, Download, Trash2, CheckCircle2, 
  Clock, AlertCircle, Camera, Check, X, ShieldAlert, Sparkles, Building2, User,
  ShoppingBag, ArrowDownRight, Tag, Layers, Settings2, Palette, Maximize, Ruler, DollarSign, MapPin
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
  SelectGroup, SelectLabel
} from '@/components/ui/select';
import {
  SectionFormulaire, Champ, Encadre, LigneResume, Recapitulatif, BoutonValider, CLASSE_CHAMP,
} from './ui-formulaire';
import { useToast } from '@/hooks/use-toast';
import type { CommercialExpense, ExpenseCategory, StoreLocation, Store } from '@/lib/types';
import { exportReportPDF } from '@/lib/pdf-export-reports';
import { findLastOrderPrice } from '@/lib/order-utils';
import { type StorageLocation, compareLocationCodes } from '@/lib/warehouse-locations';
import { isFabricLineOrCategory, isZipperLineOrCategory, isThreadLineOrCategory, isSliderLineOrCategory } from '@/lib/constants';
import ColorBreakdownInput, { ColorBreakdownRow } from '@/components/color-breakdown-input';
import QualityBreakdownInput, { QualityBreakdownRow } from '@/components/quality-breakdown-input';

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
  locations?: StorageLocation[];
  onAddExpense: (expense: Omit<CommercialExpense, 'id' | 'createdAt'>) => Promise<void>;
  onUpdateExpenseStatus?: (id: string, status: 'PENDING' | 'APPROVED' | 'REIMBURSED') => Promise<void>;
  onDeleteExpense?: (id: string) => Promise<void>;
}

const UNITS = ["pièces", "doz", "gross (144p)", "m", "rolls", "kg", "bag", "yds"];
const UNIT_MAP_FR: Record<string, string> = {
  "pièces": "Pièces (pcs)",
  "doz": "Douzaines (12 pcs)",
  "gross (144p)": "Gross (144 pcs)",
  "m": "Mètres (m)",
  "rolls": "Rouleaux (rolls)",
  "kg": "Kilogrammes (kg)",
  "bag": "Sacs / Paquets (bags)",
  "yds": "Yards (yds)",
  "pcs": "Pièces (pcs)",
};

const COLORS = ["white", "black", "raw black", "raw white", "various", "various x black", "various x white", "nickel", "various x black x white", "silver", "gold", "black x white", "beige", "black nickel", "transparent"];
const COLOR_MAP_FR: Record<string, string> = {
  "white": "Blanc",
  "black": "Noir",
  "raw black": "Noir brut",
  "raw white": "Blanc brut / Écru",
  "various": "Divers / Couleurs variées",
  "various x black": "Divers x Noir",
  "various x white": "Divers x Blanc",
  "nickel": "Nickel",
  "various x black x white": "Divers x Noir x Blanc",
  "silver": "Argenté",
  "gold": "Doré",
  "black x white": "Noir x Blanc",
  "beige": "Beige",
  "black nickel": "Nickel noir",
  "transparent": "Transparent",
};
const ZIPPER_TYPES = ["O/E", "C/E"];
const SLIDER_TYPES = ["A/L", "P/L", "N/L", "SEMI A/L"];

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
  locations = [],
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
  const [colorBreakdown, setColorBreakdown] = useState<ColorBreakdownRow[] | null>(null);
  const [qualityBreakdown, setQualityBreakdown] = useState<QualityBreakdownRow[] | null>(null);
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
  const [newLocationCode, setNewLocationCode] = useState<string>('');

  useEffect(() => {
    if (warehouseOptions.length > 0 && (!newWarehouseId || !warehouseOptions.some(w => w.id === newWarehouseId))) {
      setNewWarehouseId(warehouseOptions[0].id);
    }
  }, [warehouseOptions, newWarehouseId]);

  // Emplacements de l'entrepôt ciblé. Changer d'entrepôt invalide le choix précédent.
  const expenseLocations = useMemo(
    () => (locations || [])
      .filter(l => l.storeId === newWarehouseId && l.active !== false)
      .sort((a, b) => compareLocationCodes(a.code, b.code)),
    [locations, newWarehouseId]
  );
  useEffect(() => { setNewLocationCode(''); }, [newWarehouseId]);

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

    const getGroupIndex = (sc: any) => {
      const n = `${sc.name || ''} ${sc.nameFR || ''}`.toLowerCase().trim();
      const fabricKw   = ["fabric", "tissu", "toile", "non woven", "non-tissé", "t/c fabric", "popeline", "poplin", "leather", "cuir", "felt", "feutre", "polyester", "taffeta", "taffetas", "interlining", "entoilage"];
      const sliderKw   = ["puller", "tirette", "slider", "curseur"];
      const zipperKw   = ["zipper", "fermeture", "fermeture à glissière", "plastic zipper", "nylon zipper", "metal zipper", "long chain"];
      const buttonKw   = ["covered mould button", "snap button", "button", "bouton"];
      if (fabricKw.some(k => n.includes(k)))  return 1;
      if (sliderKw.some(k => n.includes(k)))  return 2;
      if (zipperKw.some(k => n.includes(k)))  return 3;
      if (buttonKw.some(k => n.includes(k)))  return 4;
      return 5;
    };

    return filtered.sort((a: any, b: any) => {
      const diff = getGroupIndex(a) - getGroupIndex(b);
      const nameA = a.nameFR || a.name || '';
      const nameB = b.nameFR || b.name || '';
      return diff !== 0 ? diff : nameA.localeCompare(nameB, 'fr');
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

  const selectedGenCat = useMemo(() => {
    let genCatId = selectedGenCatId;
    if (!genCatId && selectedSubCat) genCatId = selectedSubCat.generalCategoryId;
    return (generalCategories || []).find((gc: any) => gc.id === genCatId);
  }, [selectedGenCatId, selectedSubCat, generalCategories]);

  const fabricQualities = useMemo(() => {
    return [
      ...(Array.isArray(selectedSubCat?.fabricQualities) ? selectedSubCat.fabricQualities : []),
      ...(Array.isArray(selectedGenCat?.fabricQualities) ? selectedGenCat.fabricQualities : [])
    ];
  }, [selectedSubCat, selectedGenCat]);

  const zipperQualities = useMemo(() => {
    return [
      ...(Array.isArray(selectedSubCat?.zipperQualities) ? selectedSubCat.zipperQualities : []),
      ...(Array.isArray(selectedGenCat?.zipperQualities) ? selectedGenCat.zipperQualities : [])
    ];
  }, [selectedSubCat, selectedGenCat]);

  const threadQualities = useMemo(() => {
    return [
      ...(Array.isArray(selectedSubCat?.threadQualities) ? selectedSubCat.threadQualities : []),
      ...(Array.isArray(selectedGenCat?.threadQualities) ? selectedGenCat.threadQualities : [])
    ];
  }, [selectedSubCat, selectedGenCat]);

  const sliderQualities = useMemo(() => {
    return [
      ...(Array.isArray(selectedSubCat?.sliderQualities) ? selectedSubCat.sliderQualities : []),
      ...(Array.isArray(selectedGenCat?.sliderQualities) ? selectedGenCat.sliderQualities : [])
    ];
  }, [selectedSubCat, selectedGenCat]);

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

  // Nom complet reconstitué de l'article pour le stock et l'affichage (avec libellés en français)
  const computedArticleName = useMemo(() => {
    if (isManualArticle) return newArticleName.trim();
    if (!selectedCategoryName) return '';
    const baseName = selectedSubCat?.nameFR || selectedCategoryName;
    const parts: string[] = [baseName];
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
    if (selectedColor && selectedColor !== 'various') {
      const colorFr = COLOR_MAP_FR[selectedColor] || selectedColor.toUpperCase();
      parts.push(colorFr.toUpperCase());
    }
    return parts.join(' · ');
  }, [isManualArticle, newArticleName, selectedCategoryName, selectedSubCat, isFabric, isZipper, isThread, selectedGsm, selectedFabricWidth, selectedSize, selectedZipperType, selectedSlider, selectedConeWeightG, selectedThreadWeightG, selectedLengthPerPiece, selectedLengthUnit, selectedSpecs, selectedColor]);

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

  // Helper GroupedCategorySelect avec libellés et noms en français
  const GroupedCategorySelect = () => {
    const LABEL_MAP: Record<string, string> = {
      'Fabric': 'Tissus & Toiles',
      'Slider et puller': 'Curseurs & Tirettes',
      'Zipper': 'Fermetures à Glissière',
      'Bouton': 'Boutons & Accessoires',
      'Reste': 'Autres Articles'
    };
    const groups: Record<string, any[]> = {};
    (filteredSubCategories || []).forEach((sc: any) => {
      const n = `${sc.name || ''} ${sc.nameFR || ''}`.toLowerCase().trim();
      const fabricKw = ["fabric", "tissu", "toile", "non woven", "non-tissé", "t/c fabric", "popeline", "poplin", "leather", "cuir", "felt", "feutre", "polyester", "taffeta", "taffetas", "interlining", "entoilage"];
      const sliderKw = ["puller", "tirette", "slider", "curseur"];
      const zipperKw = ["zipper", "fermeture", "fermeture à glissière", "plastic zipper", "nylon zipper", "metal zipper", "long chain"];
      const buttonKw = ["covered mould button", "snap button", "button", "bouton"];
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
          const sorted = [...groups[key]].sort((a: any, b: any) => {
            const nameA = a.nameFR || a.name || '';
            const nameB = b.nameFR || b.name || '';
            return nameA.localeCompare(nameB, 'fr');
          });
          return (
            <SelectGroup key={key}>
              <SelectLabel className="text-[11px] text-stone-400 font-black uppercase tracking-widest bg-stone-50 py-1.5">{display}</SelectLabel>
              {sorted.map((sc: any) => (
                <SelectItem key={sc.id || sc.name} value={sc.name} className="font-bold pl-6 text-[11px]">
                  {sc.nameFR || sc.name}
                </SelectItem>
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
  const parseNum = (v: string) => parseFloat(String(v).replace(/\s/g, '').replace(/\.(?=\d{3})/g, '').replace(',', '.'));

  const resetForm = () => {
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
    setColorBreakdown(null);
    setQualityBreakdown(null);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
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

    // ── Cas multi-qualités / multi-couleurs : un achat marché peut couvrir plusieurs lots ──
    const hasQualityRows = isMarchandise && !!qualityBreakdown && qualityBreakdown.length > 0;
    const hasColorRows = isMarchandise && !hasQualityRows && !!colorBreakdown && colorBreakdown.length > 0;

    if (hasQualityRows || hasColorRows) {
      const globalPrice = newUnitPrice ? parseNum(newUnitPrice) : 0;
      const rows = (hasQualityRows ? qualityBreakdown! : colorBreakdown!)
        .map((r: any) => ({
          label: hasQualityRows ? r.quality : r.colorCode,
          qty: Number(hasQualityRows ? r.quantity : r.rolls) || 0,
          price: (r.priceOverride !== '' && r.priceOverride != null && Number(r.priceOverride) > 0) ? Number(r.priceOverride) : globalPrice,
          color: hasQualityRows ? selectedColor : r.colorCode,
          quality: hasQualityRows ? r.quality : selectedSpecs,
        }))
        .filter(r => r.label && r.qty > 0);

      if (rows.length === 0) {
        toast({ variant: 'destructive', title: 'Lignes invalides', description: 'Renseignez au moins une ligne avec une quantité.' });
        return;
      }
      if (rows.some(r => r.price <= 0)) {
        toast({ variant: 'destructive', title: 'Prix manquant', description: "Renseignez le P.U Achat global ou un prix par ligne pour chaque lot." });
        return;
      }

      setSaving(true);
      try {
        for (const row of rows) {
          await onAddExpense({
            date: newDate,
            amount: row.qty * row.price,
            category: newCategory,
            description: `Achat marché : ${finalArticleName} — ${row.label} (${row.qty} ${newUnitOfMeasure})${newSupplierName.trim() ? ` chez ${newSupplierName.trim()}` : ''}${newDescription.trim() ? ` — ${newDescription.trim()}` : ''}`,
            commercialName: currentUserName || 'Admin',
            ...(currentUserId ? { commercialId: currentUserId } : {}),
            storeId: newWarehouseId || 'ENTREPOT',
            ...(newReceiptUrl.trim() ? { receiptUrl: newReceiptUrl.trim() } : {}),
            status: userRole === 'ADMIN' ? 'APPROVED' : 'PENDING',
            articleName: `${finalArticleName} — ${row.label}`,
            generalCategoryId: selectedGenCatId || undefined,
            categoryId: selectedCategoryName || undefined,
            color: row.color || undefined,
            size: selectedSize || undefined,
            specs: row.quality || undefined,
            zipperType: selectedZipperType || undefined,
            slider: selectedSlider || undefined,
            sliderType: selectedSliderType || undefined,
            gsm: selectedGsm ? Number(selectedGsm) : undefined,
            fabricWidth: selectedFabricWidth ? Number(selectedFabricWidth) : undefined,
            rollLength: selectedRollLength ? Number(selectedRollLength) : undefined,
            quantity: row.qty,
            unitPrice: row.price,
            unitOfMeasure: newUnitOfMeasure || 'pcs',
            supplierName: newSupplierName.trim() || undefined,
            addToStock: newAddToStock,
          });
        }
        toast({ title: 'Dépenses enregistrées', description: `${rows.length} lot(s) · ${finalArticleName}` });
        resetForm();
      } catch (err: any) {
        toast({ variant: 'destructive', title: 'Erreur', description: err?.message || 'Action impossible.' });
      } finally {
        setSaving(false);
      }
      return;
    }

    // ── Cas standard : une seule ligne ──
    const amt = parseNum(newAmount);
    if (!amt || amt <= 0) {
      toast({ variant: 'destructive', title: 'Montant invalide', description: 'Veuillez renseigner un montant supérieur à 0.' });
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
        ...(isMarchandise && newLocationCode ? {
          locationCode: newLocationCode,
          locationId: expenseLocations.find(l => l.code === newLocationCode)?.id,
        } : {}),
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
          quantity: newQuantity ? parseNum(newQuantity) : undefined,
          unitPrice: newUnitPrice ? parseNum(newUnitPrice) : (newQuantity ? amt / parseNum(newQuantity) : undefined),
          unitOfMeasure: newUnitOfMeasure || 'pcs',
          supplierName: newSupplierName.trim() || undefined,
          addToStock: newAddToStock,
        } : {}),
      });

      resetForm();
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

  // ── Valeurs d'affichage du formulaire (récapitulatif, phrases d'aide, bouton) ──
  // Rien ici n'entre dans l'enregistrement : ce sont des relectures de ce qui est déjà saisi.
  const estAchatMarchandise = newCategory === 'ACHAT_MARCHANDISE';

  // Le nom qui partira en stock, reconstitué à l'identique de ce que calcule l'enregistrement.
  const apercuMarchandise = isManualArticle
    ? newArticleName.trim()
    : (computedArticleName || selectedCategoryName || newArticleName.trim());

  const nomEntrepotChoisi = warehouseOptions.find(w => w.id === newWarehouseId)?.name || 'la réserve choisie';

  // Nombre de lots détaillés : l'enregistrement crée alors une dépense par lot.
  const nbLots = (qualityBreakdown?.length || 0) > 0
    ? (qualityBreakdown?.length || 0)
    : (colorBreakdown?.length || 0);

  // Ce qui sera RÉELLEMENT comptabilisé quand l'achat est détaillé en lots : l'enregistrement
  // écrit une dépense par lot, au prix propre du lot s'il en a un, et n'utilise jamais le montant
  // global saisi. Le récapitulatif affichait ce montant global : dès qu'un lot portait son propre
  // prix, le chiffre relu avant de valider n'était pas celui qui partait en comptabilité.
  const montantReelLots = (() => {
    if (nbLots === 0) return null;
    const prixGlobal = newUnitPrice ? parseNum(newUnitPrice) : 0;
    const lignes = ((qualityBreakdown?.length || 0) > 0 ? qualityBreakdown! : colorBreakdown!) as any[];
    return lignes.reduce((somme, r: any) => {
      const qte = Number((qualityBreakdown?.length || 0) > 0 ? r.quantity : r.rolls) || 0;
      const prix = (r.priceOverride !== '' && r.priceOverride != null && Number(r.priceOverride) > 0)
        ? Number(r.priceOverride) : prixGlobal;
      return somme + qte * prix;
    }, 0);
  })();

  // Cohérence entre le montant payé et quantité × prix d'une unité (signalée, jamais bloquante).
  const totalLigneCalcule = Number(newQuantity) * Number(newUnitPrice);
  const ecartMontant = estAchatMarchandise && nbLots === 0
    && newQuantity !== '' && newUnitPrice !== '' && newAmount !== ''
    && Math.abs(totalLigneCalcule - Number(newAmount)) > 0.01;

  // Pourquoi le bouton est grisé. Reprend mot pour mot les champs déjà obligatoires : rien de nouveau
  // n'est exigé, la raison est simplement dite avant le clic au lieu d'après.
  const raisonBoutonDesactive =
    !newDate ? 'Indiquer la date de la dépense (étape 1).'
    : !newAmount ? 'Indiquer le montant payé (étape 1).'
    : estAchatMarchandise && !apercuMarchandise ? 'Choisir la marchandise achetée (étape 2).'
    : estAchatMarchandise && !newQuantity ? 'Indiquer la quantité achetée (étape 2).'
    : estAchatMarchandise && !newUnitPrice ? "Indiquer le prix d'une unité (étape 2)."
    : !estAchatMarchandise && !newDescription.trim() ? 'Indiquer le motif de la dépense (étape 1).'
    : null;

  return (
    <div className="space-y-6 animate-in fade-in duration-300 pb-12">
      {/* ── Header ── */}
      <div className="bg-stone-900 rounded-3xl p-6 sm:p-8 relative overflow-hidden shadow-2xl">
        <div className="absolute top-0 right-0 w-96 h-96 bg-amber-500/10 rounded-full -translate-y-1/2 translate-x-1/2 blur-3xl" />
        <div className="relative z-10 flex flex-col md:flex-row md:items-center justify-between gap-6">
          <div>
            <div className="flex items-center gap-2 mb-2">
              <span className="text-[11px] font-black uppercase tracking-[0.3em] text-amber-400 bg-amber-950/60 border border-amber-800/60 px-3 py-1 rounded-full">
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
            <span className="text-[11px] font-black uppercase tracking-widest text-stone-500 bg-stone-100 px-2 py-0.5 rounded-md">
              Ce mois-ci
            </span>
            <Receipt className="w-4 h-4 text-stone-400" />
          </div>
          <p className="text-xl sm:text-2xl font-black text-stone-900 tracking-tight">
            {fmt$(kpis.totalMonth)}
          </p>
          <p className="text-[11px] text-stone-400 font-bold mt-1">
            Total des frais déclarés
          </p>
        </div>

        {/* Cette semaine */}
        <div className="bg-white rounded-2xl p-4 sm:p-5 border border-stone-100 shadow-sm">
          <div className="flex items-center justify-between mb-2">
            <span className="text-[11px] font-black uppercase tracking-widest text-blue-700 bg-blue-100 px-2 py-0.5 rounded-md">
              Cette semaine
            </span>
            <Calendar className="w-4 h-4 text-blue-500" />
          </div>
          <p className="text-xl sm:text-2xl font-black text-blue-700 tracking-tight">
            {fmt$(kpis.totalWeek)}
          </p>
          <p className="text-[11px] text-stone-400 font-bold mt-1">
            Bilan hebdomadaire (Vendredi)
          </p>
        </div>

        {/* Achats Marchandise Marché */}
        <div className="bg-white rounded-2xl p-4 sm:p-5 border border-stone-100 shadow-sm">
          <div className="flex items-center justify-between mb-2">
            <span className="text-[11px] font-black uppercase tracking-widest text-indigo-700 bg-indigo-100 px-2 py-0.5 rounded-md flex items-center gap-1">
              <ShoppingBag className="w-3 h-3" /> Marchandise
            </span>
          </div>
          <p className="text-xl sm:text-2xl font-black text-indigo-600 tracking-tight">
            {fmt$(kpis.totalMarchandise)}
          </p>
          <p className="text-[11px] text-stone-400 font-bold mt-1">
            Achats dépannage marché
          </p>
        </div>

        {/* Carburant */}
        <div className="bg-white rounded-2xl p-4 sm:p-5 border border-stone-100 shadow-sm">
          <div className="flex items-center justify-between mb-2">
            <span className="text-[11px] font-black uppercase tracking-widest text-amber-700 bg-amber-100 px-2 py-0.5 rounded-md flex items-center gap-1">
              <Fuel className="w-3 h-3" /> Carburant
            </span>
          </div>
          <p className="text-xl sm:text-2xl font-black text-amber-600 tracking-tight">
            {fmt$(kpis.totalCarburant)}
          </p>
          <p className="text-[11px] text-stone-400 font-bold mt-1">
            Gasoil & Essence tournées
          </p>
        </div>

        {/* En attente validation */}
        <div className="bg-white rounded-2xl p-4 sm:p-5 border border-stone-100 shadow-sm col-span-2 lg:col-span-1">
          <div className="flex items-center justify-between mb-2">
            <span className="text-[11px] font-black uppercase tracking-widest text-orange-700 bg-orange-100 px-2 py-0.5 rounded-md">
              En Attente
            </span>
            <Clock className="w-4 h-4 text-orange-500" />
          </div>
          <p className="text-xl sm:text-2xl font-black text-orange-600 tracking-tight">
            {fmt$(kpis.totalPending)}
          </p>
          <p className="text-[11px] text-stone-400 font-bold mt-1">
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
              <SelectItem value="PENDING"><Clock className="inline w-3.5 h-3.5 mr-1.5 -mt-0.5" />En attente</SelectItem>
              <SelectItem value="APPROVED"><CheckCircle2 className="inline w-3.5 h-3.5 mr-1.5 -mt-0.5" />Validé</SelectItem>
              <SelectItem value="REIMBURSED"><DollarSign className="inline w-3.5 h-3.5 mr-1.5 -mt-0.5" />Remboursé</SelectItem>
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
                                <span className="inline-flex items-center gap-1 text-[11px] font-black uppercase text-emerald-800 bg-emerald-100 border border-emerald-300 px-2 py-0.5 rounded-full">
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
                          <span className="text-[11px] font-black text-emerald-700 bg-emerald-100 px-2 py-0.5 rounded-full uppercase">
                            Validé
                          </span>
                        ) : expense.status === 'REIMBURSED' ? (
                          <span className="text-[11px] font-black text-blue-700 bg-blue-100 px-2 py-0.5 rounded-full uppercase">
                            Remboursé
                          </span>
                        ) : (
                          <span className="text-[11px] font-black text-orange-700 bg-orange-100 px-2 py-0.5 rounded-full uppercase">
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

      {/* ── Fenêtre : nouvelle dépense / achat au marché ── */}
      <Dialog open={isModalOpen} onOpenChange={setIsModalOpen}>
        <DialogContent className="max-w-2xl rounded-3xl p-6 max-h-[92vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="text-lg font-black tracking-tight flex items-center gap-2">
              <Receipt className="w-5 h-5 text-amber-500" />
              <span>Nouvelle dépense</span>
            </DialogTitle>
            <p className="text-[11px] font-medium text-stone-500 leading-snug text-left">
              Trois questions dans l'ordre : ce qui a été payé, la marchandise s'il y en a une, et l'endroit où
              elle entre.
            </p>
          </DialogHeader>

          <form onSubmit={handleSubmit} className="space-y-6 pt-3">
            {/* ── 1. Quelle dépense ? ── */}
            <SectionFormulaire
              numero={1}
              titre="Quelle dépense ?"
              aide="La catégorie commande tout le reste : elle seule décide si de la marchandise entre en stock."
            >
              <Champ
                label="Catégorie"
                obligatoire
                aide="« Achat Marchandise (Marché) » ouvre l'étape 2 et peut créer le produit ; les autres catégories ne font que sortir de l'argent."
              >
                <Select value={newCategory} onValueChange={(v: ExpenseCategory) => setNewCategory(v)}>
                  <SelectTrigger className={CLASSE_CHAMP}>
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
              </Champ>

              {estAchatMarchandise ? (
                <Encadre ton="attention" titre="Cette catégorie touche à la marchandise">
                  Avec la case de l'étape 3 cochée, l'enregistrement crée le produit <strong>et</strong> son entrée
                  en réserve. L'argent sort quand même de la caisse : un achat au marché reste un décaissement.
                </Encadre>
              ) : (
                <Encadre>
                  Une dépense ordinaire ne touche pas au stock : elle sort seulement de la caisse. Aucun produit
                  n'est créé, aucune quantité n'est modifiée.
                </Encadre>
              )}

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                <Champ label="Date de la dépense" obligatoire htmlFor="depense-date">
                  <Input
                    id="depense-date"
                    type="date"
                    value={newDate}
                    onChange={e => setNewDate(e.target.value)}
                    className={CLASSE_CHAMP}
                    required
                  />
                </Champ>

                <Champ
                  label="Montant payé (MAD)"
                  obligatoire
                  htmlFor="depense-montant"
                  aide={estAchatMarchandise
                    ? "Se recalcule tout seul dès que la quantité et le prix d'une unité de l'étape 2 sont saisis. À corriger si le vendeur a arrondi."
                    : "La somme qui sort réellement de la caisse."}
                >
                  <Input
                    id="depense-montant"
                    type="number"
                    step="any"
                    min="0.1"
                    placeholder="Ex. 250"
                    value={newAmount}
                    onChange={e => setNewAmount(e.target.value)}
                    className={CLASSE_CHAMP}
                    required
                  />
                </Champ>
              </div>

              <Champ
                label={estAchatMarchandise ? 'Précisions pour la caisse' : 'Motif de la dépense'}
                obligatoire={!estAchatMarchandise}
                htmlFor="depense-motif"
                aide={estAchatMarchandise
                  ? "Facultatif : ce qui ne tient pas dans la désignation, un numéro de bon, un arrangement avec le vendeur. Le texte s'ajoute à la ligne de dépense."
                  : "C'est ce que la comptabilité relira dans plusieurs mois : dire ce qui a été payé et pour quoi."}
              >
                <Input
                  id="depense-motif"
                  placeholder={estAchatMarchandise ? 'Note ou détail pour la caisse' : 'Ex. Plein de la camionnette, tournée Derb Omar'}
                  value={newDescription}
                  onChange={e => setNewDescription(e.target.value)}
                  className={CLASSE_CHAMP}
                  required={newCategory !== 'ACHAT_MARCHANDISE'}
                />
              </Champ>

              <Champ
                label="Photo du ticket ou du bon"
                htmlFor="depense-recu"
                aide="Le justificatif reste attaché à la dépense et se rouvre depuis la liste, au moment de la valider."
              >
                <input
                  id="depense-recu"
                  type="file"
                  accept="image/*"
                  capture="environment"
                  onChange={handleReceiptFile}
                  className="w-full text-xs file:mr-3 file:py-2 file:px-3 file:rounded-xl file:border-0 file:text-xs file:font-black file:bg-stone-100 file:text-stone-700 hover:file:bg-stone-200 cursor-pointer"
                />
                {newReceiptUrl && (
                  <p className="text-[11px] text-emerald-600 font-bold flex items-center gap-1">
                    <Check className="w-3 h-3" /> Photo chargée
                  </p>
                )}
              </Champ>
            </SectionFormulaire>

            {/* ── 2. Quelle marchandise ? (achat au marché seulement) ── */}
            {estAchatMarchandise && (
              <SectionFormulaire
                numero={2}
                titre="Quelle marchandise ?"
                aide="Cette description devient la fiche produit et la ligne d'entrée en stock : elle doit être reconnaissable par quelqu'un qui n'était pas au marché."
              >
                <Champ
                  label="Origine de la référence"
                  aide="« Catalogue Lebtex » reprend une référence qui existe déjà. « Saisie libre » en crée une nouvelle : ne l'employer que si la référence n'existe vraiment pas."
                >
                  <div className="inline-flex items-center gap-1.5 rounded-xl border border-stone-200 bg-stone-100 p-1">
                    <button
                      type="button"
                      onClick={() => setIsManualArticle(false)}
                      className={`px-3 h-9 rounded-lg text-xs transition-all ${
                        !isManualArticle
                          ? 'bg-indigo-600 text-white font-black shadow-sm'
                          : 'text-stone-600 font-bold hover:bg-white'
                      }`}
                    >
                      Catalogue Lebtex
                    </button>
                    <button
                      type="button"
                      onClick={() => setIsManualArticle(true)}
                      className={`px-3 h-9 rounded-lg text-xs transition-all ${
                        isManualArticle
                          ? 'bg-indigo-600 text-white font-black shadow-sm'
                          : 'text-stone-600 font-bold hover:bg-white'
                      }`}
                    >
                      Saisie libre
                    </button>
                  </div>
                </Champ>

                {!isManualArticle ? (
                  <>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                      {/* Famille (catégorie générale) */}
                      <Champ
                        label="Famille de produit"
                        obligatoire
                        aide="Tant qu'elle n'est pas choisie, la liste des produits reste vide."
                      >
                        <Select
                          value={selectedGenCatId}
                          onValueChange={id => {
                            setSelectedGenCatId(id);
                            setSelectedCategoryName('');
                          }}
                        >
                          <SelectTrigger className={`${CLASSE_CHAMP} bg-white`}>
                            <SelectValue placeholder="Choisir la famille…">
                              {(() => {
                                const gc = (generalCategories || []).find((g: any) => g.id === selectedGenCatId);
                                return gc ? (gc.nameFR || gc.name) : undefined;
                              })()}
                            </SelectValue>
                          </SelectTrigger>
                          <SelectContent className="max-h-72">
                            {(() => {
                              const sorted = [...(generalCategories || [])].sort((a: any, b: any) => {
                                const nameA = a.nameFR || a.name || '';
                                const nameB = b.nameFR || b.name || '';
                                return nameA.localeCompare(nameB, 'fr');
                              });
                              const grouped: Record<string, any[]> = {};
                              sorted.forEach((gc: any) => {
                                const displayName = gc.nameFR || gc.name || '?';
                                const letter = displayName[0].toUpperCase();
                                if (!grouped[letter]) grouped[letter] = [];
                                grouped[letter].push({ ...gc, displayName });
                              });
                              return Object.entries(grouped).map(([letter, items]) => (
                                <SelectGroup key={letter}>
                                  <SelectLabel className="text-[11px] text-stone-400 font-black uppercase tracking-widest bg-stone-50 py-1">{letter}</SelectLabel>
                                  {items.map((gc: any) => (
                                    <SelectItem key={gc.id} value={gc.id} className="font-bold pl-6 text-xs">{gc.displayName}</SelectItem>
                                  ))}
                                </SelectGroup>
                              ));
                            })()}
                          </SelectContent>
                        </Select>
                      </Champ>

                      {/* Produit (sous-catégorie) */}
                      <Champ
                        label="Produit"
                        obligatoire
                        aide="Le produit choisi décide des caractéristiques demandées en dessous, de l'unité de comptage, et rappelle le dernier prix payé."
                      >
                        <Select
                          disabled={!selectedGenCatId}
                          value={selectedCategoryName}
                          onValueChange={handleSelectSubCategory}
                        >
                          <SelectTrigger className={`${CLASSE_CHAMP} bg-white ${!selectedGenCatId ? 'opacity-50' : ''}`}>
                            <SelectValue placeholder={selectedGenCatId ? 'Choisir le produit…' : "Choisir la famille d'abord"}>
                              {selectedSubCat ? (selectedSubCat.nameFR || selectedSubCat.name) : undefined}
                            </SelectValue>
                          </SelectTrigger>
                          <SelectContent className="max-h-72">
                            <GroupedCategorySelect />
                          </SelectContent>
                        </Select>
                      </Champ>
                    </div>

                    {/* Caractéristiques du produit */}
                    {selectedCategoryName && (
                      <div className="space-y-3.5 rounded-2xl border border-indigo-200 bg-indigo-50/60 p-3.5">
                        <div>
                          <p className="text-[13px] font-bold text-stone-900 leading-tight">Caractéristiques du produit</p>
                          <p className="text-[11px] font-medium text-stone-500 leading-snug mt-0.5">
                            Elles composent la désignation : deux articles qui ne diffèrent que par la couleur
                            restent deux produits séparés en stock.
                          </p>
                        </div>

                        {isFabric ? (
                          /* CAS TISSU */
                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                            <Champ
                              label={<span className="inline-flex items-center gap-1.5"><Maximize className="w-3.5 h-3.5 text-indigo-600" /> Qualité du tissu</span>}
                              aide="La qualité choisie remplit d'un coup le grammage, la laize et la longueur du rouleau."
                            >
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
                                  <SelectTrigger className={`${CLASSE_CHAMP} bg-white`}>
                                    <SelectValue placeholder="Choisir une qualité…" />
                                  </SelectTrigger>
                                  <SelectContent>
                                    {fabricQualities.map((q: any, i: number) => (
                                      <SelectItem key={i} value={String(i)} className="font-bold text-xs">{q.nameFR || q.label}</SelectItem>
                                    ))}
                                  </SelectContent>
                                </Select>
                              ) : (
                                <div className="grid grid-cols-2 gap-2">
                                  <Input
                                    type="number"
                                    placeholder="Grammage, ex. 120"
                                    value={selectedGsm}
                                    onChange={e => setSelectedGsm(e.target.value)}
                                    className={`${CLASSE_CHAMP} bg-white`}
                                  />
                                  <Input
                                    type="number"
                                    placeholder="Laize en cm, ex. 150"
                                    value={selectedFabricWidth}
                                    onChange={e => setSelectedFabricWidth(e.target.value)}
                                    className={`${CLASSE_CHAMP} bg-white`}
                                  />
                                </div>
                              )}
                            </Champ>

                            <Champ
                              label={<span className="inline-flex items-center gap-1.5"><Palette className="w-3.5 h-3.5 text-indigo-600" /> Couleur</span>}
                              aide="Choisir « Divers » quand le lot mélange plusieurs couleurs sans les compter séparément."
                            >
                              <Select value={selectedColor} onValueChange={setSelectedColor}>
                                <SelectTrigger className={`${CLASSE_CHAMP} bg-white`}>
                                  <SelectValue>{COLOR_MAP_FR[selectedColor] || selectedColor}</SelectValue>
                                </SelectTrigger>
                                <SelectContent className="max-h-60">
                                  {COLORS.map(c => (
                                    <SelectItem key={c} value={c} className="font-bold text-xs">{COLOR_MAP_FR[c] || c}</SelectItem>
                                  ))}
                                </SelectContent>
                              </Select>
                            </Champ>
                          </div>
                        ) : isZipper ? (
                          /* CAS FERMETURE À GLISSIÈRE */
                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                            <Champ
                              label={<span className="inline-flex items-center gap-1.5"><Ruler className="w-3.5 h-3.5 text-indigo-600" /> Longueur de la fermeture</span>}
                              aide="Une qualité choisie remplit d'un coup la longueur, le type et le curseur."
                            >
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
                                  <SelectTrigger className={`${CLASSE_CHAMP} bg-white`}>
                                    <SelectValue placeholder="Choisir une qualité…" />
                                  </SelectTrigger>
                                  <SelectContent>
                                    {zipperQualities.map((q: any, i: number) => (
                                      <SelectItem key={i} value={String(i)} className="font-bold text-xs">{q.nameFR || q.label}</SelectItem>
                                    ))}
                                  </SelectContent>
                                </Select>
                              ) : (
                                <Input
                                  placeholder="Ex. 20 cm, 50 cm, chaîne continue"
                                  value={selectedSize}
                                  onChange={e => setSelectedSize(e.target.value)}
                                  className={`${CLASSE_CHAMP} bg-white`}
                                />
                              )}
                            </Champ>

                            <Champ
                              label={<span className="inline-flex items-center gap-1.5"><Palette className="w-3.5 h-3.5 text-indigo-600" /> Couleur</span>}
                              aide="Choisir « Divers » quand le lot mélange plusieurs couleurs sans les compter séparément."
                            >
                              <Select value={selectedColor} onValueChange={setSelectedColor}>
                                <SelectTrigger className={`${CLASSE_CHAMP} bg-white`}>
                                  <SelectValue>{COLOR_MAP_FR[selectedColor] || selectedColor}</SelectValue>
                                </SelectTrigger>
                                <SelectContent className="max-h-60">
                                  {COLORS.map(c => (
                                    <SelectItem key={c} value={c} className="font-bold text-xs">{COLOR_MAP_FR[c] || c}</SelectItem>
                                  ))}
                                </SelectContent>
                              </Select>
                            </Champ>
                          </div>
                        ) : isThread ? (
                          /* CAS FIL À COUDRE */
                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                            <Champ
                              label="Qualité du fil"
                              aide="Elle fixe le poids du cône, le poids du fil et la longueur par pièce, qui servent à compter le stock."
                            >
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
                                  <SelectTrigger className={`${CLASSE_CHAMP} bg-white`}>
                                    <SelectValue placeholder="Choisir une qualité…" />
                                  </SelectTrigger>
                                  <SelectContent>
                                    {threadQualities.map((q: any, i: number) => (
                                      <SelectItem key={i} value={String(i)} className="font-bold text-xs">{q.nameFR || q.label}</SelectItem>
                                    ))}
                                  </SelectContent>
                                </Select>
                              ) : (
                                <div className="grid grid-cols-2 gap-2">
                                  <Input
                                    placeholder="Poids du cône, ex. 10 g"
                                    value={selectedConeWeightG}
                                    onChange={e => setSelectedConeWeightG(e.target.value)}
                                    className={`${CLASSE_CHAMP} bg-white`}
                                  />
                                  <Input
                                    placeholder="Poids du fil, ex. 100 g"
                                    value={selectedThreadWeightG}
                                    onChange={e => setSelectedThreadWeightG(e.target.value)}
                                    className={`${CLASSE_CHAMP} bg-white`}
                                  />
                                </div>
                              )}
                            </Champ>

                            <Champ
                              label={<span className="inline-flex items-center gap-1.5"><Palette className="w-3.5 h-3.5 text-teal-600" /> Couleur</span>}
                              aide="Choisir « Divers » quand le lot mélange plusieurs couleurs sans les compter séparément."
                            >
                              <Select value={selectedColor} onValueChange={setSelectedColor}>
                                <SelectTrigger className={`${CLASSE_CHAMP} bg-white`}>
                                  <SelectValue>{COLOR_MAP_FR[selectedColor] || selectedColor}</SelectValue>
                                </SelectTrigger>
                                <SelectContent className="max-h-60">
                                  {COLORS.map(c => (
                                    <SelectItem key={c} value={c} className="font-bold text-xs">{COLOR_MAP_FR[c] || c}</SelectItem>
                                  ))}
                                </SelectContent>
                              </Select>
                            </Champ>
                          </div>
                        ) : isSlider ? (
                          /* CAS CURSEUR */
                          <div className="space-y-3.5">
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                              <Champ
                                label="Modèle du curseur"
                                aide="Le modèle remplit la taille, le poids et le conditionnement, et rattache la photo du curseur."
                              >
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
                                    <SelectTrigger className={`${CLASSE_CHAMP} bg-white`}>
                                      <SelectValue placeholder="Choisir un modèle…" />
                                    </SelectTrigger>
                                    <SelectContent>
                                      {sliderQualities.map((q: any, i: number) => (
                                        <SelectItem key={i} value={String(i)} className="font-bold text-xs">
                                          <div className="flex items-center gap-2">
                                            {q.imageUrl && <img src={q.imageUrl} alt="" className="w-4 h-4 rounded object-cover" />}
                                            <span>{q.nameFR || q.label}</span>
                                            {q.size && <span className="text-orange-600 font-bold">({q.size})</span>}
                                          </div>
                                        </SelectItem>
                                      ))}
                                    </SelectContent>
                                  </Select>
                                ) : (
                                  <div className="grid grid-cols-2 gap-2">
                                    <Input
                                      placeholder="Taille, ex. #3"
                                      value={selectedSize}
                                      onChange={e => setSelectedSize(e.target.value)}
                                      className={`${CLASSE_CHAMP} bg-white`}
                                    />
                                    <Input
                                      placeholder="Poids, ex. 2,5 g"
                                      value={selectedSliderWeightG}
                                      onChange={e => setSelectedSliderWeightG(e.target.value)}
                                      className={`${CLASSE_CHAMP} bg-white`}
                                    />
                                  </div>
                                )}
                              </Champ>

                              <Champ
                                label={<span className="inline-flex items-center gap-1.5"><Palette className="w-3.5 h-3.5 text-orange-600" /> Couleur</span>}
                                aide="Choisir « Divers » quand le lot mélange plusieurs couleurs sans les compter séparément."
                              >
                                <Select value={selectedColor} onValueChange={setSelectedColor}>
                                  <SelectTrigger className={`${CLASSE_CHAMP} bg-white`}>
                                    <SelectValue>{COLOR_MAP_FR[selectedColor] || selectedColor}</SelectValue>
                                  </SelectTrigger>
                                  <SelectContent className="max-h-60">
                                    {COLORS.map(c => (
                                      <SelectItem key={c} value={c} className="font-bold text-xs">{COLOR_MAP_FR[c] || c}</SelectItem>
                                    ))}
                                  </SelectContent>
                                </Select>
                              </Champ>
                            </div>

                            {/* Aperçu du modèle retenu */}
                            <div className="flex items-center gap-3">
                              {selectedDesignImageUrl && (
                                <img src={selectedDesignImageUrl} alt="" className="w-10 h-10 rounded-lg object-cover border border-orange-200 shrink-0" />
                              )}
                              <div className="flex flex-wrap gap-1.5">
                                {selectedSize && <span className="px-2 py-0.5 rounded bg-orange-100 text-orange-800 text-[11px] font-bold">{selectedSize}</span>}
                                {selectedSliderWeightG && <span className="px-2 py-0.5 rounded bg-amber-100 text-amber-800 text-[11px] font-bold">{selectedSliderWeightG} g par pièce</span>}
                                {selectedPcsPerBag && <span className="px-2 py-0.5 rounded bg-cyan-100 text-cyan-800 text-[11px] font-bold">{selectedPcsPerBag} pièces par sachet</span>}
                                {selectedBagsPerCarton && <span className="px-2 py-0.5 rounded bg-indigo-100 text-indigo-700 text-[11px] font-bold">{selectedBagsPerCarton} sachets par carton</span>}
                              </div>
                            </div>
                          </div>
                        ) : (
                          /* CAS GÉNÉRAL */
                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                            <Champ
                              label="Taille"
                              aide="Elle entre dans la désignation : sans elle, deux tailles du même article se confondent en stock."
                            >
                              {availableSizes.length > 0 ? (
                                <Select value={selectedSize} onValueChange={setSelectedSize}>
                                  <SelectTrigger className={`${CLASSE_CHAMP} bg-white`}>
                                    <SelectValue placeholder="Choisir…" />
                                  </SelectTrigger>
                                  <SelectContent>
                                    {availableSizes.map((s: string) => (
                                      <SelectItem key={s} value={s} className="font-bold text-xs">{s}</SelectItem>
                                    ))}
                                  </SelectContent>
                                </Select>
                              ) : (
                                <Input
                                  placeholder="Ex. 14L, 18L, 20 mm"
                                  value={selectedSize}
                                  onChange={e => setSelectedSize(e.target.value)}
                                  className={`${CLASSE_CHAMP} bg-white`}
                                />
                              )}
                            </Champ>

                            <Champ
                              label={<span className="inline-flex items-center gap-1.5"><Palette className="w-3.5 h-3.5 text-indigo-600" /> Couleur</span>}
                              aide="Choisir « Divers » quand le lot mélange plusieurs couleurs sans les compter séparément."
                            >
                              <Select value={selectedColor} onValueChange={setSelectedColor}>
                                <SelectTrigger className={`${CLASSE_CHAMP} bg-white`}>
                                  <SelectValue>{COLOR_MAP_FR[selectedColor] || selectedColor}</SelectValue>
                                </SelectTrigger>
                                <SelectContent className="max-h-60">
                                  {COLORS.map(c => (
                                    <SelectItem key={c} value={c} className="font-bold text-xs">{COLOR_MAP_FR[c] || c}</SelectItem>
                                  ))}
                                </SelectContent>
                              </Select>
                            </Champ>
                          </div>
                        )}

                        {/* Désignation reconstituée */}
                        {computedArticleName && (
                          <div className="rounded-xl border border-indigo-200 bg-white p-3 flex items-start gap-2.5">
                            <Sparkles className="w-4 h-4 text-indigo-600 shrink-0 mt-0.5" />
                            <div className="min-w-0">
                              <p className="text-[11px] font-medium text-stone-500 leading-snug">
                                Nom sous lequel la marchandise apparaîtra en stock
                              </p>
                              <p className="text-[13px] font-black text-indigo-950 leading-tight mt-0.5 break-words">
                                {computedArticleName}
                              </p>
                            </div>
                          </div>
                        )}
                      </div>
                    )}
                  </>
                ) : (
                  /* Saisie libre : une nouvelle référence sera créée */
                  <Champ
                    label="Désignation de la marchandise"
                    obligatoire
                    htmlFor="marchandise-libre"
                    aide="Écrire le nom tel qu'il devra se lire en réserve : matière, taille, couleur. Une référence sera créée sous ce nom."
                  >
                    <Input
                      id="marchandise-libre"
                      placeholder="Ex. Tissu doublure sergé écru 150 cm"
                      value={newArticleName}
                      onChange={e => setNewArticleName(e.target.value)}
                      className={`${CLASSE_CHAMP} bg-white`}
                    />
                  </Champ>
                )}

                {/* Plusieurs lots dans le même achat */}
                {!isManualArticle && selectedCategoryName && (
                  <Champ
                    label="Plusieurs qualités ou plusieurs couleurs dans le même achat"
                    aide="Détailler ici pour garder chaque lot séparé : une dépense sera enregistrée par ligne, et la quantité totale se reporte plus bas."
                  >
                    <div className="space-y-2">
                      <QualityBreakdownInput
                        value={qualityBreakdown}
                        onChange={(rows, total) => {
                          setQualityBreakdown(rows);
                          if (rows && rows.length > 0) handleQtyChange(String(total));
                        }}
                        unit={newUnitOfMeasure}
                        availableQualities={isFabric ? fabricQualities : isZipper ? zipperQualities : isThread ? threadQualities : isSlider ? sliderQualities : []}
                        isFabric={isFabric}
                        isZipper={isZipper}
                        isThread={isThread}
                        isSlider={isSlider}
                      />
                      {(!qualityBreakdown || qualityBreakdown.length === 0) && (
                        <ColorBreakdownInput
                          value={colorBreakdown}
                          onChange={(rows, total) => {
                            setColorBreakdown(rows);
                            if (rows && rows.length > 0) handleQtyChange(String(total));
                          }}
                          unit={newUnitOfMeasure}
                        />
                      )}
                    </div>
                  </Champ>
                )}

                {/* Combien, et à quel prix */}
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3.5">
                  <Champ
                    label="Quantité"
                    obligatoire
                    htmlFor="marchandise-quantite"
                    aide="Ce qui a réellement été emporté du marché."
                  >
                    <Input
                      id="marchandise-quantite"
                      type="number"
                      step="any"
                      min="0.1"
                      placeholder="Ex. 25"
                      value={newQuantity}
                      onChange={e => handleQtyChange(e.target.value)}
                      className={`${CLASSE_CHAMP} bg-white`}
                      required
                    />
                  </Champ>

                  <Champ
                    label="Unité de comptage"
                    aide="C'est dans cette unité que la réserve comptera la marchandise."
                  >
                    <Select value={newUnitOfMeasure} onValueChange={setNewUnitOfMeasure}>
                      <SelectTrigger className={`${CLASSE_CHAMP} bg-white`}>
                        <SelectValue>{UNIT_MAP_FR[newUnitOfMeasure] || newUnitOfMeasure}</SelectValue>
                      </SelectTrigger>
                      <SelectContent>
                        {UNITS.map(u => (
                          <SelectItem key={u} value={u} className="text-xs font-bold">{UNIT_MAP_FR[u] || u}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </Champ>

                  <Champ
                    label="Prix d'une unité (MAD)"
                    obligatoire
                    htmlFor="marchandise-prix"
                    aide="Le prix d'une seule unité, pas le total payé."
                  >
                    <Input
                      id="marchandise-prix"
                      type="number"
                      step="any"
                      min="0"
                      placeholder="Ex. 15,50"
                      value={newUnitPrice}
                      onChange={e => handlePriceChange(e.target.value)}
                      className={`${CLASSE_CHAMP} bg-white`}
                      required
                    />
                  </Champ>
                </div>

                {newQuantity && newUnitPrice && (
                  <p className="text-[11px] font-medium text-stone-500 leading-snug">
                    {newQuantity} {UNIT_MAP_FR[newUnitOfMeasure] || newUnitOfMeasure} × {newUnitPrice} MAD ={' '}
                    <span className="font-black text-stone-900">{fmt$(totalLigneCalcule)}</span>, reporté sur le
                    montant de l'étape 1.
                  </p>
                )}

                {/* Suggestion du dernier prix payé */}
                {lastOrderInfo?.price && (
                  <div className="flex items-center justify-between gap-3 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-[11px] font-medium text-amber-900">
                    <span>
                      Dernier prix payé pour ce produit :{' '}
                      <strong>{lastOrderInfo.price} MAD / {lastOrderInfo.unitOfMeasure || 'unité'}</strong>
                    </span>
                    <button
                      type="button"
                      onClick={() => handlePriceChange(String(lastOrderInfo.price))}
                      className="shrink-0 text-[11px] font-black underline hover:text-amber-950"
                    >
                      Reprendre ce prix
                    </button>
                  </div>
                )}

                <Champ
                  label="Vendeur ou grossiste"
                  htmlFor="marchandise-vendeur"
                  aide="Facultatif. Le nom reste sur la ligne de dépense et permet de retrouver plus tard chez qui la marchandise a été prise."
                >
                  <Input
                    id="marchandise-vendeur"
                    list="known-suppliers-list"
                    placeholder="Ex. Grossiste Derb Omar"
                    value={newSupplierName}
                    onChange={e => setNewSupplierName(e.target.value)}
                    className={`${CLASSE_CHAMP} bg-white`}
                  />
                  <datalist id="known-suppliers-list">
                    {knownSuppliers.map(s => <option key={s} value={s} />)}
                  </datalist>
                </Champ>
              </SectionFormulaire>
            )}

            {/* ── 3. Où la faire entrer ? (achat au marché) ── */}
            {estAchatMarchandise && (
              <SectionFormulaire
                numero={3}
                titre="Où la faire entrer ?"
                aide="Une marchandise achetée au marché entre dans une réserve, jamais directement au comptoir."
              >
                <Encadre ton="attention" titre="Elle entre en réserve, pas en boutique">
                  La réserve compte dans le stock du magasin principal : la marchandise y est vendable sans transfert. Une boutique secondaire, elle, doit d'abord la recevoir.
                </Encadre>

                <Champ
                  label="Faire entrer la marchandise en stock"
                  aide="Cochée, cette case crée le produit et son entrée dans la réserve choisie ci-dessous. Décochée, seule la dépense est enregistrée et rien ne bouge en stock."
                >
                  <label
                    htmlFor="addToStock"
                    className="flex items-start gap-2.5 rounded-2xl border border-stone-200 bg-white p-3 cursor-pointer"
                  >
                    <input
                      type="checkbox"
                      id="addToStock"
                      checked={newAddToStock}
                      onChange={e => setNewAddToStock(e.target.checked)}
                      className="w-4 h-4 mt-0.5 rounded text-indigo-600 cursor-pointer"
                    />
                    <span className="text-[13px] font-bold text-stone-800 leading-snug">
                      Créer le produit et son entrée dans {nomEntrepotChoisi}
                    </span>
                  </label>
                </Champ>

                <Champ
                  label="Réserve de destination"
                  obligatoire
                  aide="C'est dans cette réserve que la marchandise sera comptée."
                  indice={warehouseOptions.length > 0 ? `${warehouseOptions.length} réserve${warehouseOptions.length > 1 ? 's' : ''}` : undefined}
                >
                  {warehouseOptions.length === 0 ? (
                    <Encadre ton="attention">
                      Aucune réserve n'est encore configurée. Elles se créent dans l'onglet <strong>Paramètres</strong>,
                      rubrique <strong>Entrepôts</strong>.
                    </Encadre>
                  ) : (
                    <Select value={newWarehouseId} onValueChange={setNewWarehouseId}>
                      <SelectTrigger className={`${CLASSE_CHAMP} bg-white`}>
                        <SelectValue placeholder="Choisir la réserve" />
                      </SelectTrigger>
                      <SelectContent>
                        {warehouseOptions.map(wh => (
                          <SelectItem key={wh.id} value={wh.id} className="text-xs font-bold">
                            {wh.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  )}
                </Champ>

                {expenseLocations.length > 0 && (
                  <Champ
                    label={<span className="inline-flex items-center gap-1.5"><MapPin className="w-3.5 h-3.5 text-amber-600" /> Emplacement dans la réserve</span>}
                    aide="Le rayon où la marchandise sera rangée. Sans emplacement, elle entre bien en stock, mais personne ne saura où aller la chercher."
                  >
                    <Select
                      value={newLocationCode || '__NONE__'}
                      onValueChange={v => setNewLocationCode(v === '__NONE__' ? '' : v)}
                    >
                      <SelectTrigger className={`${CLASSE_CHAMP} bg-white`}>
                        <SelectValue placeholder="Non précisé" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="__NONE__" className="text-xs font-bold">Non précisé</SelectItem>
                        {expenseLocations.map(l => (
                          <SelectItem key={l.id} value={l.code} className="text-xs font-bold font-mono">
                            {l.code}{l.label ? ` — ${l.label}` : ''}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </Champ>
                )}
              </SectionFormulaire>
            )}

            {/* ── 2. Qui supporte la dépense ? (dépense ordinaire) ── */}
            {!estAchatMarchandise && (
              <SectionFormulaire
                numero={2}
                titre="Quel magasin supporte la dépense ?"
                aide="Le montant est rattaché à ce magasin dans les relevés. Le stock n'est pas touché."
              >
                <Champ
                  label="Magasin rattaché"
                  obligatoire
                  aide="Choisir le magasin pour le compte duquel la dépense a été faite."
                >
                  <Select value={newStoreId} onValueChange={setNewStoreId}>
                    <SelectTrigger className={CLASSE_CHAMP}>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {stores.map(s => (
                        <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </Champ>
              </SectionFormulaire>
            )}

            {/* ── Relecture avant enregistrement ── */}
            <div className="space-y-3">
              <Recapitulatif titre="Avant d'enregistrer">
                <LigneResume libelle="Catégorie" valeur={CATEGORY_CONFIG[newCategory]?.label || '—'} />
                <LigneResume libelle="Date" valeur={newDate || '—'} />
                {estAchatMarchandise ? (
                  <>
                    <LigneResume libelle="Marchandise" valeur={apercuMarchandise || '—'} />
                    <LigneResume
                      libelle="Quantité"
                      valeur={newQuantity ? `${newQuantity} ${UNIT_MAP_FR[newUnitOfMeasure] || newUnitOfMeasure}` : '—'}
                    />
                    <LigneResume libelle="Prix d'une unité" valeur={newUnitPrice ? fmt$(Number(newUnitPrice)) : '—'} />
                    {nbLots > 0 && (
                      <LigneResume
                        libelle="Lots détaillés"
                        valeur={`${nbLots} ligne${nbLots > 1 ? 's' : ''} — une dépense par lot`}
                      />
                    )}
                    <LigneResume
                      libelle="Entrée en stock"
                      ton={newAddToStock ? 'positif' : 'alerte'}
                      valeur={newAddToStock
                        ? `${nomEntrepotChoisi}${newLocationCode ? ` · ${newLocationCode}` : ''}`
                        : "Aucune — rien n'entre en stock"}
                    />
                  </>
                ) : (
                  <LigneResume libelle="Magasin" valeur={stores.find(s => s.id === newStoreId)?.name || '—'} />
                )}
                <LigneResume
                  libelle={montantReelLots !== null ? `Sort de la caisse — ${nbLots} dépense${nbLots > 1 ? 's' : ''}` : 'Sort de la caisse'}
                  valeur={fmt$(montantReelLots !== null ? montantReelLots : (Number(newAmount) || 0))}
                  fort
                />
                {ecartMontant && (
                  <LigneResume libelle="Quantité × prix d'une unité" valeur={fmt$(totalLigneCalcule)} ton="alerte" />
                )}
              </Recapitulatif>

              {ecartMontant && (
                <Encadre ton="attention" titre="Le montant ne correspond pas au calcul">
                  Le montant de l'étape 1 n'est pas égal à la quantité multipliée par le prix d'une unité. Corriger
                  l'un des trois avant d'enregistrer, sinon la caisse et le stock ne raconteront pas la même chose.
                </Encadre>
              )}

              <BoutonValider
                type="submit"
                enCours={saving}
                raisonDesactive={raisonBoutonDesactive}
                className="!bg-amber-500 hover:!bg-amber-600 !text-stone-950"
              >
                {estAchatMarchandise && newAddToStock
                  ? "Enregistrer la dépense et l'entrée en stock"
                  : 'Enregistrer la dépense'}
              </BoutonValider>

              <button
                type="button"
                onClick={() => setIsModalOpen(false)}
                className="w-full text-[11px] font-bold text-stone-500 hover:text-stone-800 transition-colors"
              >
                Annuler
              </button>
            </div>
          </form>
        </DialogContent>
      </Dialog>

      {/* ── Modal Visualisation Photo Reçu ── */}
      <Dialog open={!!previewImage} onOpenChange={() => setPreviewImage(null)}>
        <DialogContent className="max-w-lg p-3 bg-stone-900 border-stone-800 rounded-3xl overflow-hidden">
          <div className="flex justify-between items-center p-2 text-white">
            <DialogTitle className="text-sm font-black tracking-tight">Justificatif de la dépense</DialogTitle>
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
