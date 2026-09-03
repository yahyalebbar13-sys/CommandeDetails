"use client";

import React, { useMemo, useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { 
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow 
} from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import type { ReactNode } from 'react';
import { 
  ChevronLeft, 
  Truck, 
  CheckCircle2,
  LayoutGrid,
  Package,
  ArrowUpRight,
  Search,
  TrendingUp,
  Box,
  DollarSign,
  Trash2,
  Users,
  Factory,
  Settings2,
  MousePointer2,
  Pencil,
  Palette,
  Hash,
  ImagePlus,
  Loader2,
  X as XIcon,
  ChevronDown,
  ChevronRight,
  ArrowRightLeft,
  ArrowDownToLine,
  ArrowUpFromLine,
  ShieldAlert,
  Calculator,
  Plus,
  Maximize
} from 'lucide-react';
import EditOrderModal from './edit-order-modal';
import DesignLibrary from './design-library';
import CustomsHistoryModal from './customs-history-modal';
import { 
  BarChart, Bar, XAxis, YAxis, Tooltip as RechartsTooltip, ResponsiveContainer, 
  Cell, PieChart, Pie, Legend, LineChart, Line, CartesianGrid
} from 'recharts';
import { useUser, useFirestore, deleteDocumentNonBlocking, updateDocumentNonBlocking } from '@/firebase';
import { computeEffectiveStatus } from '@/lib/status-utils';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { doc, collection, getDocs } from 'firebase/firestore';
import { getStorage, ref as storageRef, uploadBytesResumable, getDownloadURL, deleteObject } from 'firebase/storage';
import { getApp } from 'firebase/app';
import { useToast } from '@/hooks/use-toast';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from '@/components/ui/alert-dialog';
import { isZipperCategory as isTechnicalZipper } from '@/lib/constants';
import { computeReorderAlert, formatReorderBadge } from '@/lib/reorder-utils';
import type { OrderScheduleSeason } from '@/lib/reorder-utils';

interface CategoriesViewProps {
  articles: any[];
  factures: any[];
  generalCategories: any[];
  subCategories: any[];
  stockItems?: any[];
  selectedCategory: string | null;
  setSelectedCategory: (category: string | null) => void;
  selectedGeneralCategoryId: string | null;
  onSelectGeneralCategory: (id: string | null) => void;
  onBackToGroupes?: () => void;
  movements?: any[];
}

const UI_COLORS = ['#CC8626', '#1E293B', '#3B82F6', '#10B981', '#6366F1', '#F43F5E', '#8B5CF6', '#EC4899'];
const STATUS_COLORS = {
  'TRANSIT': '#3B82F6',
  'ARRIVED': '#10B981',
  'PENDING': '#F59E0B'
};
// ── FicheStock : fiche dépliable par produit ────────────────────────────────
function FicheStock({ article: a, color, pct, entriesIN, entriesOUT, factures, onOpenHistory }: {
  article: any; color: string; pct: number;
  entriesIN: any[]; entriesOUT: any[]; factures: any[];
  onOpenHistory: (article: any, entries: any[]) => void;
}) {
  const [open, setOpen] = React.useState(false);
  const totalIn  = a.initialQty + a.mouvementsIn;
  const totalOut = a.mouvementsOut;

  return (
    <div className="bg-white rounded-2xl shadow-md border border-stone-100 overflow-hidden transition-all duration-300">
      {/* ── En-tête produit (toujours visible) ── */}
      <div className="w-full text-left relative group">
        {/* barre couleur */}
        <div className="h-1 w-full" style={{ backgroundColor: color }} />
        <div 
          className="flex items-center gap-4 px-5 py-4 cursor-pointer"
          onClick={() => setOpen(o => !o)}
        >

          {/* Swatch couleur */}
          <div className="w-10 h-10 rounded-xl border border-stone-100 shrink-0 flex items-center justify-center"
            style={{ backgroundColor: a.color ? (() => {
              const m: Record<string,string> = { rouge:'#ef4444',bleu:'#3b82f6',vert:'#22c55e',noir:'#1c1917',blanc:'#f5f5f4',gris:'#6b7280',jaune:'#eab308',orange:'#f97316',violet:'#8b5cf6',rose:'#f43f5e',marron:'#92400e',beige:'#d6c5a3',kaki:'#6b7a42' };
              return m[a.color.toLowerCase()] || '#e7e5e4';
            })() : '#f5f5f4' }}>
            {!a.color && <Package className="w-4 h-4 text-stone-300" />}
          </div>

          {/* Infos produit */}
          <div className="flex-1 min-w-0">
            <p className="text-[12px] font-black text-stone-900 uppercase tracking-tighter leading-tight">{a.productName}</p>
            <div className="flex items-center gap-2 mt-0.5 flex-wrap">
              {a.size  && <span className="text-[7px] font-black bg-stone-100 text-stone-500 px-1.5 py-0.5 rounded uppercase">{a.size}</span>}
              {a.color && <span className="text-[7px] font-black bg-stone-100 text-stone-500 px-1.5 py-0.5 rounded uppercase">{a.color}</span>}
            </div>
          </div>

          {/* Stats compactes */}
          <div className="flex items-center gap-5 shrink-0">
            <div className="text-center">
              <p className="text-[8px] font-black text-stone-400 uppercase">Entrées</p>
              <p className="text-[13px] font-black text-emerald-600">+{Number(totalIn).toLocaleString('fr-MA')}</p>
              <p className="text-[7px] text-stone-300 font-bold">{a.unitOfMeasure}</p>
            </div>
            <div className="text-center">
              <p className="text-[8px] font-black text-stone-400 uppercase">Sorties</p>
              <p className={`text-[13px] font-black ${totalOut > 0 ? 'text-rose-600' : 'text-stone-300'}`}>
                {totalOut > 0 ? `-${Number(totalOut).toLocaleString('fr-MA')}` : '—'}
              </p>
              <p className="text-[7px] text-stone-300 font-bold">{totalOut > 0 ? a.unitOfMeasure : ''}</p>
            </div>
            <div className="text-center bg-stone-50 rounded-xl px-3 py-2 min-w-[80px]">
              <p className="text-[8px] font-black text-stone-400 uppercase">Stock Réel</p>
              <p className="text-[16px] font-black text-stone-900">{Number(a.currentQty).toLocaleString('fr-MA')}</p>
              <div className="h-1 bg-stone-200 rounded-full mt-1 overflow-hidden">
                <div className={`h-full rounded-full ${pct < 30 ? 'bg-rose-400' : pct < 60 ? 'bg-amber-400' : 'bg-emerald-400'}`} style={{ width: `${pct}%` }} />
              </div>
            </div>
            <div className="text-center">
              <p className="text-[8px] font-black text-stone-400 uppercase">Valeur</p>
              <p className="text-[11px] font-black" style={{ color }}>{Number(a.totalValue).toLocaleString('fr-MA', { maximumFractionDigits: 0 })} {a.hasTTCCost ? 'MAD' : '$'}</p>
            </div>

            {/* Bouton Historique Dédouanement */}
            <div className="shrink-0 ml-2" onClick={e => e.stopPropagation()}>
              <Button 
                onClick={() => onOpenHistory(a, entriesIN)}
                size="sm" 
                variant="outline"
                className="h-8 bg-orange-50 hover:bg-orange-100 text-orange-600 border-orange-200 text-[9px] font-black uppercase tracking-widest rounded-lg px-3 shadow-sm"
              >
                <ShieldAlert className="w-3.5 h-3.5 mr-1.5" /> Hist. Douane
              </Button>
            </div>

            {/* Chevron */}
            <div className={`w-7 h-7 ml-3 rounded-xl border border-stone-200 flex items-center justify-center transition-transform duration-300 ${open ? 'rotate-180 bg-stone-900 border-stone-900' : 'bg-white'}`}>
              <ChevronDown className={`w-4 h-4 ${open ? 'text-white' : 'text-stone-400'}`} />
            </div>
          </div>
        </div>
      </div>

      {/* ── Détail historique (déplié) ── */}
      {open && (
        <div className="border-t border-stone-100 bg-stone-50/60 px-5 py-4 space-y-5 animate-in slide-in-from-top-2 duration-200">

          {/* ENTRÉES */}
          <div>
            <div className="flex items-center gap-2 mb-3">
              <div className="w-5 h-5 rounded-lg bg-emerald-100 flex items-center justify-center">
                <ArrowDownToLine className="w-3 h-3 text-emerald-600" />
              </div>
              <p className="text-[9px] font-black text-stone-600 uppercase tracking-widest">Entrées en stock — {entriesIN.length} arrivage{entriesIN.length > 1 ? 's' : ''}</p>
            </div>
            {entriesIN.length === 0 ? (
              <p className="text-[9px] text-stone-300 font-bold pl-7">Aucune entrée enregistrée</p>
            ) : (
              <div className="space-y-2">
                {entriesIN.map((mv, i) => {
                  const facture = factures.find((f: any) => f.id === mv.factureId);
                  const hasCost = mv.purchasePriceMAD != null && mv.purchasePriceMAD > 0;
                  return (
                    <div key={i} className="flex items-center gap-3 bg-white rounded-xl px-4 py-3 border border-emerald-100 shadow-sm">
                      <div className="w-2 h-2 rounded-full bg-emerald-400 shrink-0" />
                      <div className="flex-1 grid grid-cols-4 gap-3 text-[10px]">
                        <div>
                          <p className="text-stone-400 font-bold uppercase text-[7px]">Date</p>
                          <p className="font-black text-stone-700">{mv.date || '—'}</p>
                        </div>
                        <div>
                          <p className="text-stone-400 font-bold uppercase text-[7px]">Quantité</p>
                          <p className="font-black text-emerald-700">+{Number(mv.quantity).toLocaleString('fr-MA')} {a.unitOfMeasure}</p>
                        </div>
                        <div>
                          <p className="text-stone-400 font-bold uppercase text-[7px]">Coût de Revient</p>
                          {hasCost ? (
                            <p className="font-black text-violet-700">{Number(mv.purchasePriceMAD).toLocaleString('fr-MA', { maximumFractionDigits: 2 })} MAD/u</p>
                          ) : (
                            <p className="font-bold text-stone-300">—</p>
                          )}
                        </div>
                        <div>
                          <p className="text-stone-400 font-bold uppercase text-[7px]">Arrivage</p>
                          <p className="font-black text-stone-500 truncate">{facture?.id || mv.factureId || mv.notes || '—'}</p>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* SORTIES */}
          <div>
            <div className="flex items-center gap-2 mb-3">
              <div className="w-5 h-5 rounded-lg bg-rose-100 flex items-center justify-center">
                <ArrowUpFromLine className="w-3 h-3 text-rose-600" />
              </div>
              <p className="text-[9px] font-black text-stone-600 uppercase tracking-widest">Sorties — {entriesOUT.length} mouvement{entriesOUT.length > 1 ? 's' : ''}</p>
            </div>
            {entriesOUT.length === 0 ? (
              <p className="text-[9px] text-stone-300 font-bold pl-7">Aucune sortie enregistrée</p>
            ) : (
              <div className="space-y-2">
                {entriesOUT.map((mv, i) => (
                  <div key={i} className="flex items-center gap-3 bg-white rounded-xl px-4 py-3 border border-rose-100 shadow-sm">
                    <div className="w-2 h-2 rounded-full bg-rose-400 shrink-0" />
                    <div className="flex-1 grid grid-cols-3 gap-3 text-[10px]">
                      <div>
                        <p className="text-stone-400 font-bold uppercase text-[7px]">Date</p>
                        <p className="font-black text-stone-700">{mv.date || '—'}</p>
                      </div>
                      <div>
                        <p className="text-stone-400 font-bold uppercase text-[7px]">Quantité</p>
                        <p className="font-black text-rose-600">-{Number(mv.quantity).toLocaleString('fr-MA')} {a.unitOfMeasure}</p>
                      </div>
                      <div>
                        <p className="text-stone-400 font-bold uppercase text-[7px]">Raison</p>
                        <p className="font-black text-stone-500">{mv.reason || mv.notes || '—'}</p>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

export default function CategoriesView({
  articles = [],
  factures = [],
  generalCategories = [],
  subCategories = [],
  stockItems = [],
  selectedCategory,
  setSelectedCategory,
  selectedGeneralCategoryId,
  onSelectGeneralCategory,
  onBackToGroupes,
  movements = []
}: CategoriesViewProps) {
  const { user } = useUser();
  const firestore = useFirestore();
  const { toast } = useToast();
  const [searchTerm, setSearchTerm] = useState('');
  const [debouncedSearchTerm, setDebouncedSearchTerm] = useState('');
  const [todayStr, setTodayStr] = useState(() => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  });
  const [editingArticle, setEditingArticle] = useState<any>(null);
  const [colorDetailArticle, setColorDetailArticle] = useState<any>(null);
  const [imageUploading, setImageUploading] = useState(false);
  const [imageUploadProgress, setImageUploadProgress] = useState(0);
  // ── Reorder schedule config modal
  const [reorderConfigCat, setReorderConfigCat] = useState<any>(null);
  const [reorderSeasons, setReorderSeasons] = useState<OrderScheduleSeason[]>([]);
  const [reorderSaving, setReorderSaving] = useState(false);
  // ── Move entities
  const [movingSubCategory, setMovingSubCategory] = useState<any>(null);
  const [movingGeneralCategory, setMovingGeneralCategory] = useState<any>(null);
  const [moveTargetId, setMoveTargetId] = useState('');
  
  const [expandedStockItems, setExpandedStockItems] = useState<Set<string>>(new Set());
  const [activeTab, setActiveTab] = useState<'categories' | 'articles' | 'stock'>('categories');
  const [historyModalOpen, setHistoryModalOpen] = useState(false);
  const [historyArticles, setHistoryArticles] = useState<any[]>([]);
  const [historyEntries, setHistoryEntries] = useState<any[]>([]);

  const [declarations, setDeclarations] = useState<Record<string, any>>({});
  const [deleteConfirm, setDeleteConfirm] = useState<{open: boolean; id?: string; name?: string}>({open: false});
  
  useEffect(() => {
    if (!firestore || !user || !selectedCategory) return;
    getDocs(collection(firestore, 'users', user.uid, 'dp_declarations'))
      .then(snap => {
        const decls: Record<string, any> = {};
        snap.forEach(d => { decls[d.id] = d.data(); });
        setDeclarations(decls);
      });
  }, [firestore, user, selectedCategory]);

  const toggleStockExpand = (articleId: string) => {
    setExpandedStockItems(prev => {
      const next = new Set(prev);
      if (next.has(articleId)) next.delete(articleId);
      else next.add(articleId);
      return next;
    });
  };

  // Debounce search: only filter after 200ms of inactivity
  useEffect(() => {
    const timer = setTimeout(() => setDebouncedSearchTerm(searchTerm), 200);
    return () => clearTimeout(timer);
  }, [searchTerm]);

  const currentCategoryObj = useMemo(() => {
    if (!selectedCategory || !subCategories) return null;
    return subCategories.find(c => c.name === selectedCategory) || null;
  }, [selectedCategory, subCategories]);

  const [isCustomsModalOpen, setIsCustomsModalOpen] = useState(false);
  const [customsForm, setCustomsForm] = useState({
    hsCode: '',
    customsValuePerKg: '',
    importDutyRate: '',
    tpiRate: '',
    ticRate: '',
    tvaRate: '',
    defaultPcsPerCtn: '',
    availableSizes: [] as string[],
    availableGsm: [] as number[],
    availableWidths: [] as number[],
    fabricQualities: [] as { label: string; gsm?: number; fabricWidth?: number; rollLength?: number; rollLengthUnit?: string; packagingPerBag?: number }[],
  });
  const [newSizeInput, setNewSizeInput] = useState('');
  const [newGsmInput, setNewGsmInput] = useState('');
  const [newWidthInput, setNewWidthInput] = useState('');
  const [newQualityForm, setNewQualityForm] = useState({ label: '', gsm: '', fabricWidth: '', rollLength: '', rollLengthUnit: 'm', packagingPerBag: '' });

  useEffect(() => {
    if (currentCategoryObj && isCustomsModalOpen) {
      setCustomsForm({
        hsCode: currentCategoryObj.hsCode || '',
        customsValuePerKg: currentCategoryObj.customsValuePerKg ?? '',
        importDutyRate: currentCategoryObj.importDutyRate ?? '',
        tpiRate: currentCategoryObj.tpiRate ?? '',
        ticRate: currentCategoryObj.ticRate ?? '',
        tvaRate: currentCategoryObj.tvaRate ?? '',
        defaultPcsPerCtn: currentCategoryObj.defaultPcsPerCtn ?? '',
        availableSizes: Array.isArray(currentCategoryObj.availableSizes) ? currentCategoryObj.availableSizes : [],
        availableGsm: Array.isArray(currentCategoryObj.availableGsm) ? currentCategoryObj.availableGsm : [],
        availableWidths: Array.isArray(currentCategoryObj.availableWidths) ? currentCategoryObj.availableWidths : [],
        fabricQualities: Array.isArray(currentCategoryObj.fabricQualities) ? currentCategoryObj.fabricQualities : [],
      });
      setNewSizeInput('');
      setNewGsmInput('');
      setNewWidthInput('');
      setNewQualityForm({ label: '', gsm: '', fabricWidth: '', rollLength: '', rollLengthUnit: 'm', packagingPerBag: '' });
    }
  }, [currentCategoryObj, isCustomsModalOpen]);

  // Detect if current category is in the Fabric pôle
  // Strategy: check pôle name first, then fallback to subcategory name keywords
  const FABRIC_POLE_KW = ['fabric', 'tissu', 'textile', 'interlining', 'non woven', 'woven'];
  const FABRIC_CAT_KW = ['fabric', 'non woven', 't/c fabric', 'popeline', 'leather', 'felt fabric', 'polyester fabric', 'taffeta fabric', 'woven interlining', 'interlining', 'pocketing', 'eva film', 't/c twill', 'oxford', 'twill'];
  const isFabricCat = useMemo(() => {
    // 1) Check pôle name
    const genCatId = selectedGeneralCategoryId || currentCategoryObj?.generalCategoryId;
    if (genCatId) {
      const genCat = generalCategories.find(g => g.id === genCatId);
      if (genCat) {
        const lower = (genCat.name || '').toLowerCase();
        if (FABRIC_POLE_KW.some(kw => lower.includes(kw))) return true;
      }
    }
    // 2) Fallback: check subcategory name
    if (selectedCategory) {
      const lower = selectedCategory.toLowerCase();
      if (FABRIC_CAT_KW.some(kw => lower.includes(kw))) return true;
    }
    return false;
  }, [selectedGeneralCategoryId, currentCategoryObj, generalCategories, selectedCategory]);

  const handleUpdateCustoms = () => {
    if (!user || !firestore || !currentCategoryObj) return;
    const docRef = doc(firestore, 'users', user.uid, 'categories', currentCategoryObj.id);
    updateDocumentNonBlocking(docRef, {
      hsCode: customsForm.hsCode || null,
      customsValuePerKg: customsForm.customsValuePerKg === '' ? null : Number(customsForm.customsValuePerKg),
      importDutyRate: customsForm.importDutyRate === '' ? null : Number(customsForm.importDutyRate),
      tpiRate: customsForm.tpiRate === '' ? null : Number(customsForm.tpiRate),
      ticRate: customsForm.ticRate === '' ? null : Number(customsForm.ticRate),
      tvaRate: customsForm.tvaRate === '' ? null : Number(customsForm.tvaRate),
      defaultPcsPerCtn: customsForm.defaultPcsPerCtn === '' ? null : Number(customsForm.defaultPcsPerCtn),
      availableSizes: customsForm.availableSizes.length > 0 ? customsForm.availableSizes : null,
      availableGsm: customsForm.availableGsm.length > 0 ? customsForm.availableGsm : null,
      availableWidths: customsForm.availableWidths.length > 0 ? customsForm.availableWidths : null,
      fabricQualities: customsForm.fabricQualities.length > 0 ? customsForm.fabricQualities : null,
    });
    toast({ title: 'Données douanières mises à jour' });
    setIsCustomsModalOpen(false);
  };

  // ── Upload / supprimer la photo de la catégorie ──
  const handleCategoryImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !user || !currentCategoryObj) return;
    if (!file.type.startsWith('image/')) {
      toast({ variant: 'destructive', title: 'Format invalide', description: 'Sélectionnez une image (JPG, PNG, WEBP...)' });
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      toast({ variant: 'destructive', title: 'Fichier trop grand', description: 'Maximum 5 MB.' });
      return;
    }
    setImageUploading(true);
    setImageUploadProgress(0);
    try {
      const storage = getStorage(getApp());
      const path = `users/${user.uid}/categories/${currentCategoryObj.id}/photo`;
      const imgRef = storageRef(storage, path);
      const task = uploadBytesResumable(imgRef, file);
      await new Promise<void>((resolve, reject) => {
        task.on(
          'state_changed',
          (snap) => setImageUploadProgress(Math.round((snap.bytesTransferred / snap.totalBytes) * 100)),
          reject,
          async () => {
            const url = await getDownloadURL(task.snapshot.ref);
            const docRef = doc(firestore!, 'users', user.uid, 'categories', currentCategoryObj.id);
            updateDocumentNonBlocking(docRef, { imageUrl: url });
            resolve();
          }
        );
      });
      toast({ title: '📸 Photo ajoutée', description: 'Photo de la catégorie mise à jour.' });
    } catch (err: any) {
      toast({ variant: 'destructive', title: 'Erreur upload', description: err.message });
    } finally {
      setImageUploading(false);
    }
  };

  const handleRemoveCategoryImage = async () => {
    if (!user || !firestore || !currentCategoryObj) return;
    try {
      const storage = getStorage(getApp());
      await deleteObject(storageRef(storage, `users/${user.uid}/categories/${currentCategoryObj.id}/photo`)).catch(() => {});
      const docRef = doc(firestore, 'users', user.uid, 'categories', currentCategoryObj.id);
      updateDocumentNonBlocking(docRef, { imageUrl: null });
      toast({ title: 'Photo supprimée' });
    } catch (err: any) {
      toast({ variant: 'destructive', title: 'Erreur', description: err.message });
    }
  };


  // isTechnicalZipper importé depuis @/lib/constants

  // ── Alertes de réapprovisionnement
  const reorderAlerts = useMemo(() => {
    const result: Record<string, ReturnType<typeof computeReorderAlert>> = {};
    subCategories.forEach(sc => { result[sc.name] = computeReorderAlert(sc, articles); });
    return result;
  }, [subCategories, articles]);

  const activeAlerts = useMemo(() =>
    subCategories
      .map(sc => ({ cat: sc, alert: reorderAlerts[sc.name] }))
      .filter(x => x.alert && x.alert.level !== 'OK')
      .sort((a, b) => a.alert!.daysLeft - b.alert!.daysLeft),
  [subCategories, reorderAlerts]);

  const handleDeleteSubCategory = (e: React.MouseEvent, id: string, name: string) => {
    e.stopPropagation();
    if (!user || !firestore) return;
    setDeleteConfirm({ open: true, id, name });
  };

  const groupStats = useMemo(() => {
    if (!todayStr) return {};
    const stats: Record<string, any> = {};

    generalCategories.forEach(gc => {
      const subCatNames = subCategories
        .filter(sc => sc.generalCategoryId === gc.id)
        .map(sc => sc.name);

      const groupArticles = articles.filter(a => 
        a.generalCategoryId === gc.id || 
        subCatNames.includes(a.categoryId)
      );

      let totalValue = 0;
      
      const futureArrivals = groupArticles
        .filter(a => {
          const eff = computeEffectiveStatus(a);
          return (eff === 'TRANSIT' || eff === 'SHIPPED') && a.arrivalDate && a.arrivalDate > todayStr;
        })
        .map(a => a.arrivalDate as string);
      
      const nextArrival = futureArrivals.length > 0 
        ? futureArrivals.sort()[0]
        : '-';

      groupArticles.forEach(a => {
        totalValue += (Number(a.quantity) || 0) * (Number(a.purchasePricePerUnit) || 0);
      });

      stats[gc.id] = { 
        name: gc.name,
        line: (gc as any).line,
        count: groupArticles.length, 
        totalValue,
        nextArrival
      };
    });
    return stats;
  }, [generalCategories, articles, subCategories, todayStr]);

  const subCategoryStats = useMemo(() => {
    if (!selectedGeneralCategoryId || !todayStr) return [];
    
    return subCategories
      .filter(sc => sc.generalCategoryId === selectedGeneralCategoryId)
      .map(sc => {
        const catArticles = articles.filter(a => a.categoryId === sc.name);
        let totalValue = 0;
        
        const futureArrivals = catArticles
          .filter(a => {
            const eff = computeEffectiveStatus(a);
            return (eff === 'TRANSIT' || eff === 'SHIPPED') && a.arrivalDate && a.arrivalDate > todayStr;
          })
          .map(a => a.arrivalDate as string);
        
        const nextArrival = futureArrivals.length > 0 
          ? futureArrivals.sort()[0]
          : '-';

        catArticles.forEach(a => {
          totalValue += (Number(a.quantity) || 0) * (Number(a.purchasePricePerUnit) || 0);
        });

        return { 
          ...sc, 
          count: catArticles.length, 
          nextArrival, 
          totalValue 
        };
      })
      .filter(sc => sc.name.toLowerCase().includes(debouncedSearchTerm.toLowerCase()))
      .sort((a, b) => (a.name || '').localeCompare(b.name || ''));
  }, [selectedGeneralCategoryId, subCategories, articles, debouncedSearchTerm, todayStr]);

  const currentArticles = useMemo(() => {
    if (!selectedCategory) return [];
    return articles.filter(a => a.categoryId === selectedCategory);
  }, [selectedCategory, articles]);

  const groupedData = useMemo(() => {
    if (!selectedCategory || !todayStr) return null;
    
    return {
      transit: currentArticles.filter(a => {
        const eff = computeEffectiveStatus(a);
        return eff === 'TRANSIT' || eff === 'SHIPPED'; // seulement les vraies commandes en chemin
      }),
      arrived: currentArticles.filter(a => {
        const eff = computeEffectiveStatus(a);
        // CUSTOMS = arrivé au port, pas encore validé en stock → considéré "arrivé"
        return eff === 'STOCK' || eff === 'DELIVERED' || eff === 'CUSTOMS';
      }),
      production: currentArticles.filter(a => computeEffectiveStatus(a) === 'PI'),
      pending: currentArticles.filter(a => computeEffectiveStatus(a) === 'TO_ORDER')
    };
  }, [currentArticles, selectedCategory, todayStr]);

  const headerStats = useMemo(() => {
    if (!currentArticles.length || !todayStr) return null;
    
    const totalVal = currentArticles.reduce((s, a) => s + ((Number(a.quantity) || 0) * (Number(a.purchasePricePerUnit) || 0)), 0);
    const totalQty = currentArticles.reduce((s, a) => s + (Number(a.quantity) || 0), 0);

    const futureArrivals = currentArticles
      .filter(a => {
        const eff = computeEffectiveStatus(a);
        return (eff === 'TRANSIT' || eff === 'SHIPPED') && a.arrivalDate && a.arrivalDate > todayStr;
      })
      .map(a => a.arrivalDate as string);
    
    const nextArrival = futureArrivals.length > 0 
      ? futureArrivals.sort()[0]
      : '-';

    const allOrderDates = currentArticles
      .map(a => a.orderDate || (a.createdAt ? new Date(a.createdAt.seconds * 1000).toISOString().split('T')[0] : null))
      .filter(Boolean) as string[];
    
    const lastOrder = allOrderDates.length > 0
      ? allOrderDates.sort((a, b) => b.localeCompare(a))[0]
      : '-';
    return {
      totalVal,
      totalQty,
      nextArrival,
      lastOrder
    };
  }, [currentArticles, todayStr]);

  const detailedAnalytics = useMemo(() => {
    if (!selectedCategory || !groupedData) return null;
    
    const statusValue = [
      { name: 'En Transit', value: 0, color: STATUS_COLORS.TRANSIT },
      { name: 'Réceptionné', value: 0, color: STATUS_COLORS.ARRIVED },
      { name: 'En Production', value: 0, color: STATUS_COLORS.PENDING },
    ];
    
    groupedData.transit.forEach(a => statusValue[0].value += ((Number(a.quantity) || 0) * (Number(a.purchasePricePerUnit) || 0)));
    groupedData.arrived.forEach(a => statusValue[1].value += ((Number(a.quantity) || 0) * (Number(a.purchasePricePerUnit) || 0)));
    groupedData.production.forEach(a => statusValue[2].value += ((Number(a.quantity) || 0) * (Number(a.purchasePricePerUnit) || 0)));

    const quantityEvolution: Record<string, number> = {};
    const supplierMap: Record<string, number> = {};

    currentArticles.forEach(a => {
      const date = a.orderDate || (a.createdAt ? new Date(a.createdAt.seconds * 1000).toISOString().split('T')[0] : null);
      if (date) {
        const month = date.substring(0, 7);
        quantityEvolution[month] = (quantityEvolution[month] || 0) + (Number(a.quantity) || 0);
      }

      const sup = a.supplierId || 'Inconnu';
      const val = (Number(a.quantity) || 0) * (Number(a.purchasePricePerUnit) || 0);
      supplierMap[sup] = (supplierMap[sup] || 0) + val;
    });

    const quantityData = Object.entries(quantityEvolution)
      .map(([date, value]) => ({ date, value }))
      .sort((a, b) => a.date.localeCompare(b.date));

    const supplierDistribution = Object.entries(supplierMap)
      .map(([name, value]) => ({ name, value }))
      .sort((a, b) => b.value - a.value);

    // Filtre de taille optionnel — lu depuis currentCategoryObj.sizeFilter
    const allowedSizes: string[] | null =
      Array.isArray(currentCategoryObj?.sizeFilter) && currentCategoryObj.sizeFilter.length > 0
        ? currentCategoryObj.sizeFilter : null;
    
    // ── Évolution prix par QUALITÉ (Fabric) ou TAILLE (autres) ──
    const sizesSet = new Set<string>();
    currentArticles.forEach(a => {
      if (allowedSizes && !allowedSizes.includes(a.size)) return;
      if (isFabricCat) {
        // Group by GSM + width
        const gsm = a.gsm ? `${a.gsm}gsm` : null;
        const width = a.fabricWidth ? `${a.fabricWidth}cm` : null;
        if (gsm || width) sizesSet.add([gsm, width].filter(Boolean).join(' · '));
      } else {
        const sizeKey = (a.size && a.size !== 'various') ? a.size.toUpperCase() : null;
        if (sizeKey) sizesSet.add(sizeKey);
      }
    });
    const uniqueProducts = Array.from(sizesSet).sort();

    const dateGroups: Record<string, any> = {};
    currentArticles.forEach(a => {
      const date = a.orderDate || (a.createdAt ? new Date(a.createdAt.seconds * 1000).toISOString().split('T')[0] : null);
      if (!date) return;

      if (allowedSizes && !allowedSizes.includes(a.size)) return;

      let key: string | null = null;
      if (isFabricCat) {
        const gsm = a.gsm ? `${a.gsm}gsm` : null;
        const width = a.fabricWidth ? `${a.fabricWidth}cm` : null;
        if (gsm || width) key = [gsm, width].filter(Boolean).join(' · ');
      } else {
        key = (a.size && a.size !== 'various') ? a.size.toUpperCase() : null;
      }
      if (!key) return;

      if (!dateGroups[date]) dateGroups[date] = { date };
      
      dateGroups[date][key] = Number(a.purchasePricePerUnit) || 0;
    });

    const priceData = Object.values(dateGroups).sort((a, b) => a.date.localeCompare(b.date));

    return { statusValue, quantityData, priceData, uniqueProducts, supplierDistribution };
  }, [selectedCategory, currentArticles, groupedData, todayStr]);

  const costHistoryData = useMemo(() => {
    if (!selectedCategory || !factures || !articles) return [];
    
    // Group all articles by facture
    const articlesByFacture = articles.reduce((acc, a) => {
      if (!acc[a.factureId]) acc[a.factureId] = [];
      acc[a.factureId].push(a);
      return acc;
    }, {} as Record<string, any[]>);

    const result: any[] = [];

    for (const facture of factures) {
      const dossierArticles = articlesByFacture[facture.id] || [];
      if (dossierArticles.length === 0) continue;

      const factureDecl = declarations[facture.id] || {};
      const overrides = factureDecl.overrides || {};

      const invoicePaidDhs = Number(facture.invoicePaidDhs) || 0;
      const declaredValue = Number(facture.declaredValue) || 0;
      const tauxChange = declaredValue > 0 ? invoicePaidDhs / declaredValue : 0;

      const exchange = Number(facture.exchangeInvoiceAmount) || 0;
      const transitaire = Number(facture.supplierInvoiceAmount) || 0;
      const fraisSupp = Number(facture.additionalCostsAmount) || 0;
      const fretMad = (Number(facture.freightCost) || 0) * tauxChange;
      const mtFraisTotal = (exchange + transitaire + fraisSupp + fretMad) / 1.20;

      const cbmTotal = dossierArticles.reduce((s: number, a: any) => s + (Number(a.cubicMeasurement) || 0), 0);

      const catArticles = dossierArticles.filter(a => a.categoryId === selectedCategory);
      if (catArticles.length === 0) continue;

      catArticles.forEach(a => {
        const ov = overrides[a.id] || {};
        const cbm = (ov.cubicMeasurement != null ? Number(ov.cubicMeasurement) : Number(a.cubicMeasurement)) || 0;
        const nw = (ov.netWeight != null ? Number(ov.netWeight) : Number(a.netWeight)) || 0;
        const qty = (ov.quantity != null ? Number(ov.quantity) : Number(a.quantity)) || 0;

        const fraisCmd = cbmTotal > 0 ? (cbm / cbmTotal) * mtFraisTotal : 0;

        const cat = subCategories.find(c => c.name === a.categoryId);
        const customsValuePerKg = ov.customsValuePerKg != null
          ? Number(ov.customsValuePerKg)
          : (cat?.customsValuePerKg != null ? Number(cat.customsValuePerKg) : null);
        const importDutyRate = ov.importDutyRate != null
          ? Number(ov.importDutyRate) / 100
          : (cat?.importDutyRate != null ? Number(cat.importDutyRate) / 100 : null);
        const tpiRate = ov.tpiRate != null
          ? Number(ov.tpiRate) / 100
          : (cat?.tpiRate != null ? Number(cat.tpiRate) / 100 : null);
        const ticRate = ov.ticRate != null
          ? Number(ov.ticRate) / 100
          : (cat?.ticRate != null ? Number(cat.ticRate) / 100 : null);
        const tvaRate = ov.tvaRate != null
          ? Number(ov.tvaRate) / 100
          : (cat?.tvaRate != null ? Number(cat.tvaRate) / 100 : null);
        const hasCustData = customsValuePerKg !== null;

        const valDouane = hasCustData ? nw * customsValuePerKg! : 0;
        const di = importDutyRate != null ? valDouane * importDutyRate : 0;
        const tpi = tpiRate != null ? valDouane * tpiRate : 0;
        const tic = ticRate != null ? valDouane * ticRate : 0;
        const tva = tvaRate != null ? (valDouane + di + tpi + tic) * tvaRate : 0;
        const totalDouane = di + tpi + tic + tva;

        const pauDollar = (ov.purchasePricePerUnit != null ? Number(ov.purchasePricePerUnit) : Number(a.purchasePricePerUnit)) || 0;
        const valAchatMad = qty * pauDollar * tauxChange;

        const mtTotal = hasCustData ? (valAchatMad + fraisCmd + totalDouane) : 0;
        const pauTtc = (hasCustData && qty > 0) ? mtTotal / qty : 0;

        if (facture.arrivalDate || a.arrivalDate) {
            result.push({
            ...a,
            factureName: facture.id,
            factureDate: facture.arrivalDate || a.arrivalDate,
            qty,
            valAchatMad,
            fraisCmd,
            totalDouane,
            pauTtc
            });
        }
      });
    }

    const aggregatedByFacture = result.reduce((acc, curr) => {
      if (!acc[curr.factureName]) {
        acc[curr.factureName] = { ...curr, count: 1, sumTtc: curr.pauTtc };
      } else {
        acc[curr.factureName].count += 1;
        acc[curr.factureName].sumTtc += curr.pauTtc;
        acc[curr.factureName].qty += curr.qty;
        acc[curr.factureName].valAchatMad += curr.valAchatMad;
        acc[curr.factureName].fraisCmd += curr.fraisCmd;
        acc[curr.factureName].totalDouane += curr.totalDouane;
        acc[curr.factureName].pauTtc = acc[curr.factureName].sumTtc / acc[curr.factureName].count;
      }
      return acc;
    }, {} as Record<string, any>);

    return Object.values(aggregatedByFacture).sort((a: any, b: any) => new Date(a.factureDate).getTime() - new Date(b.factureDate).getTime());
  }, [selectedCategory, factures, articles, declarations, subCategories]);

  const organizedCategories = useMemo(() => {
    const structure = [
      {
        title: "Fabric",
        keywords: ["fabric", "non woven", "t/c fabric", "popeline", "leather", "felt fabric", "polyester fabric", "taffeta fabric", "woven interlining"],
      },
      {
        title: "Slider et puller",
        keywords: ["puller", "slider for nylon zipper", "slider for plastic zipper", "slider for metal zipper"],
      },
      {
        title: "Zipper",
        keywords: ["zipper", "plastic zipper", "nylon zipper", "metal zipper", "zipper long chain", "nylon zipper long chain"],
      },
      {
        title: "Bouton",
        keywords: ["covered mould button", "snap button", "button"],
      },
      {
        title: "Reste",
        keywords: ["ruban", "tape", "rope", "thread", "elastic thread", "tack pin", "hook and loop", "divers", "opp bag"],
        isFallback: true
      }
    ];

    const result = structure.map(g => ({ ...g, items: [] as {id: string, stat: any}[] }));

    Object.entries(groupStats).forEach(([id, stat]) => {
      const catName = (stat.name || '').toLowerCase().trim();
      const explicitLine = stat.line;
      let matched = false;

      if (explicitLine) {
        const group = result.find(g => g.title === explicitLine);
        if (group) {
          group.items.push({ id, stat });
          matched = true;
        }
      }

      if (!matched) {
        for (const group of result) {
          if (group.keywords.includes(catName)) {
            group.items.push({ id, stat });
            matched = true;
            break;
          }
        }
      }
      if (!matched) {
        const fallback = result.find(g => g.isFallback);
        if (fallback) fallback.items.push({ id, stat });
      }
    });

    result.forEach(g => {
      g.items.sort((a, b) => (b.stat.totalValue || 0) - (a.stat.totalValue || 0));
    });

    const filtered = result.filter(g => g.items.length > 0);
    // Sort the groups (pôles) by their total value
    filtered.sort((a, b) => {
      const aTotal = a.items.reduce((s, i) => s + (i.stat.totalValue || 0), 0);
      const bTotal = b.items.reduce((s, i) => s + (i.stat.totalValue || 0), 0);
      return bTotal - aTotal;
    });
    return filtered;
  }, [groupStats]);

  // Active tab for the manifeste tabs
  const [activeManifeste, setActiveManifeste] = useState<'production' | 'transit' | 'stock'>('transit');

  if (selectedCategory && groupedData && detailedAnalytics) {
    const manifesteTabs = [
      {
        key: 'production' as const,
        label: 'Production',
        count: groupedData.production.length,
        icon: Factory,
        activeColor: 'bg-amber-500',
        activeBg: 'bg-amber-50 text-amber-800',
        inactiveBg: 'bg-white text-stone-500',
        dot: 'bg-amber-500',
      },
      {
        key: 'transit' as const,
        label: 'Transit',
        count: groupedData.transit.length,
        icon: Truck,
        activeColor: 'bg-blue-500',
        activeBg: 'bg-blue-50 text-blue-800',
        inactiveBg: 'bg-white text-stone-500',
        dot: 'bg-blue-500',
      },
      {
        key: 'stock' as const,
        label: 'En Stock',
        count: groupedData.arrived.length, // articles arrivés (CUSTOMS + STOCK + DELIVERED)
        icon: CheckCircle2,
        activeColor: 'bg-emerald-500',
        activeBg: 'bg-emerald-50 text-emerald-800',
        inactiveBg: 'bg-white text-stone-500',
        dot: 'bg-emerald-500',
      },
    ];

    const activeTab = manifesteTabs.find(t => t.key === activeManifeste)!;

    return (
      <div className="space-y-6 animate-in fade-in slide-in-from-bottom-2 duration-500">
        {/* ── Premium Header ── */}
        <header className="bg-stone-900 rounded-[2rem] overflow-hidden shadow-2xl relative">
          <div className="absolute top-0 right-0 w-[600px] h-[600px] bg-amber-500/5 rounded-full -translate-y-1/2 translate-x-1/4 blur-[120px] pointer-events-none" />
          <div className="absolute bottom-0 left-0 w-[300px] h-[300px] bg-blue-500/5 rounded-full translate-y-1/2 -translate-x-1/4 blur-[80px] pointer-events-none" />

          <div className="relative z-10 p-8">
            {/* Top row: back + title + HS button */}
            <div className="flex flex-col xl:flex-row justify-between items-start xl:items-start gap-8">
              <div className="flex items-start gap-5">
                <Button
                  variant="outline"
                  size="icon"
                  onClick={() => {
                    if (onBackToGroupes) onBackToGroupes();
                    else setSelectedCategory(null);
                  }}
                  className="h-12 w-12 rounded-2xl bg-white/5 border-white/10 text-white hover:bg-white/10 transition-all shadow-xl shrink-0 mt-1"
                >
                  <ChevronLeft className="w-5 h-5" />
                </Button>
                <div>
                  <p className="text-[9px] font-black text-amber-500 uppercase tracking-[0.3em] mb-1">Audit Analytique Produit</p>
                  <h2 className="text-3xl font-black text-white tracking-tighter uppercase leading-none mb-3">{selectedCategory}</h2>

                  {/* Customs data row */}
                  <div className="flex flex-wrap items-center gap-2">
                    {currentCategoryObj && (
                      <Button
                        variant="outline"
                        size="sm"
                        className="h-8 border-stone-700 bg-stone-800 text-stone-300 hover:bg-stone-700 hover:text-white rounded-lg px-3 gap-2 text-[10px] uppercase font-bold"
                        onClick={() => setIsCustomsModalOpen(true)}
                      >
                        <span>HS: {currentCategoryObj.hsCode || 'NON DÉFINI'}</span>
                        <Pencil className="w-3 h-3 text-amber-500" />
                      </Button>
                    )}
                    {currentCategoryObj && (
                      <Button
                        variant="outline"
                        size="sm"
                        className="h-8 border-stone-700 bg-stone-800 text-stone-300 hover:bg-stone-700 hover:text-white rounded-lg px-3 gap-2 text-[10px] uppercase font-bold"
                        onClick={() => {
                          setHistoryArticles(currentArticles);
                          setHistoryModalOpen(true);
                        }}
                      >
                        <ShieldAlert className="w-3 h-3 text-orange-500" />
                        <span>Hist. Douane</span>
                      </Button>
                    )}
                    {currentCategoryObj && (currentCategoryObj.customsValuePerKg != null || currentCategoryObj.importDutyRate != null) && (
                      <div className="flex flex-wrap gap-2">
                        {currentCategoryObj.customsValuePerKg != null && (
                          <span className="text-[9px] font-black text-stone-400 bg-stone-800/60 border border-stone-700 px-2 py-1 rounded-lg">
                            Val: <span className="text-stone-200">{currentCategoryObj.customsValuePerKg} dh/kg</span>
                          </span>
                        )}
                        {currentCategoryObj.importDutyRate != null && (
                          <span className="text-[9px] font-black text-stone-400 bg-stone-800/60 border border-stone-700 px-2 py-1 rounded-lg">
                            DI: <span className="text-stone-200">{currentCategoryObj.importDutyRate}%</span>
                          </span>
                        )}
                        {currentCategoryObj.tpiRate != null && (
                          <span className="text-[9px] font-black text-stone-400 bg-stone-800/60 border border-stone-700 px-2 py-1 rounded-lg">
                            TPI: <span className="text-stone-200">{currentCategoryObj.tpiRate}%</span>
                          </span>
                        )}
                        {currentCategoryObj.ticRate != null && (
                          <span className="text-[9px] font-black text-stone-400 bg-stone-800/60 border border-stone-700 px-2 py-1 rounded-lg">
                            TIC: <span className="text-stone-200">{currentCategoryObj.ticRate}%</span>
                          </span>
                        )}
                        {currentCategoryObj.tvaRate != null && (
                          <span className="text-[9px] font-black text-stone-400 bg-stone-800/60 border border-stone-700 px-2 py-1 rounded-lg">
                            TVA: <span className="text-stone-200">{currentCategoryObj.tvaRate}%</span>
                          </span>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              </div>

              {/* Photo de la catégorie */}
              <div className="shrink-0 self-start">
                {currentCategoryObj?.imageUrl ? (
                  <div className="relative w-28 h-28 rounded-2xl overflow-hidden border border-white/10 bg-white/5 shadow-xl">
                    <img src={currentCategoryObj.imageUrl} alt={selectedCategory || ''} className="w-full h-full object-cover" />
                    <button
                      type="button"
                      onClick={handleRemoveCategoryImage}
                      className="absolute top-1.5 right-1.5 w-6 h-6 bg-red-500 hover:bg-red-600 text-white rounded-full flex items-center justify-center shadow transition-colors"
                    >
                      <XIcon className="w-3 h-3" />
                    </button>
                  </div>
                ) : (
                  <label className={`flex flex-col items-center justify-center w-28 h-28 rounded-2xl border-2 border-dashed cursor-pointer transition-all ${
                    imageUploading
                      ? 'border-amber-400/50 bg-amber-500/10'
                      : 'border-white/20 bg-white/5 hover:border-amber-400/50 hover:bg-amber-500/10'
                  }`}>
                    {imageUploading ? (
                      <div className="flex flex-col items-center gap-1.5">
                        <Loader2 className="w-5 h-5 animate-spin text-amber-400" />
                        <div className="w-16 bg-white/10 rounded-full h-1">
                          <div className="bg-amber-400 h-1 rounded-full transition-all" style={{ width: `${imageUploadProgress}%` }} />
                        </div>
                        <span className="text-[9px] font-bold text-amber-400">{imageUploadProgress}%</span>
                      </div>
                    ) : (
                      <>
                        <ImagePlus className="w-5 h-5 text-white/30 mb-1" />
                        <span className="text-[8px] font-black text-white/30 uppercase text-center leading-tight">Ajouter<br/>Photo</span>
                      </>
                    )}
                    <input type="file" accept="image/*" className="hidden" onChange={handleCategoryImageUpload} disabled={imageUploading} />
                  </label>
                )}
              </div>

              {/* KPI cards */}
              {headerStats && (
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3 w-full xl:w-auto xl:min-w-[500px]">
                  {[
                    { label: 'Valeur Totale', value: `${Number(headerStats.totalVal).toLocaleString('en-US', { maximumFractionDigits: 0 })} $`, color: 'text-amber-400' },
                    { label: 'Qté Totale', value: Number(headerStats.totalQty).toLocaleString('en-US', { maximumFractionDigits: 0 }), color: 'text-white' },
                    { label: 'Prochaine Arrivée', value: headerStats.nextArrival, color: 'text-blue-400' },
                    { label: 'Dernière Cmd', value: headerStats.lastOrder, color: 'text-stone-300' },
                  ].map(({ label, value, color }) => (
                    <div key={label} className="px-4 py-3 bg-white/5 border border-white/10 rounded-xl backdrop-blur-md">
                      <p className="text-[7px] font-black text-stone-500 uppercase tracking-widest mb-1.5">{label}</p>
                      <p className={`text-sm font-black ${color} leading-none`}>{value}</p>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Status summary bar */}
            <div className="mt-6 pt-5 border-t border-stone-800 flex flex-wrap gap-3">
              {manifesteTabs.map(tab => (
                <button
                  key={tab.key}
                  onClick={() => setActiveManifeste(tab.key)}
                  className={`flex items-center gap-2 px-4 py-2 rounded-xl transition-all border ${
                    activeManifeste === tab.key
                      ? 'bg-white/10 border-white/20 text-white'
                      : 'bg-transparent border-transparent text-stone-500 hover:text-stone-300'
                  }`}
                >
                  <span className={`w-2 h-2 rounded-full ${tab.dot} ${activeManifeste === tab.key ? 'animate-pulse' : 'opacity-40'}`} />
                  <span className="text-[10px] font-black uppercase tracking-wider">{tab.label}</span>
                  <span className={`text-[9px] font-black px-1.5 py-0.5 rounded ${
                    activeManifeste === tab.key ? 'bg-white/20 text-white' : 'bg-stone-800 text-stone-400'
                  }`}>{tab.count}</span>
                </button>
              ))}
            </div>
          </div>
        </header>

        {/* ── Design Library — Zipper / Slider / Puller / Print Taffeta 190T ── */}
        {currentCategoryObj && (isTechnicalZipper(selectedCategory) || (selectedCategory || '').toUpperCase().includes('SLIDER') || (selectedCategory || '').toUpperCase().includes('PULLER') || (selectedCategory || '').toUpperCase().includes('PRINT TAFFETA 190T')) && (
          <div className="bg-white rounded-[1.5rem] shadow-xl border border-stone-100 overflow-hidden p-6">
            <DesignLibrary
              categoryId={currentCategoryObj.id}
              categoryName={selectedCategory}
            />
          </div>
        )}

        {/* ── Tabbed Manifeste Section ── */}
        <div className="bg-white rounded-[1.5rem] shadow-xl border border-stone-100 overflow-hidden">
          {/* Tab bar */}
          <div className="flex items-center justify-between px-6 py-4 border-b border-stone-100">
            <div className="flex items-center gap-3">
              {(() => {
                const Icon = activeTab.icon;
                return (
                  <div className={`p-2 rounded-xl ${
                    activeManifeste === 'production' ? 'bg-amber-100' :
                    activeManifeste === 'transit' ? 'bg-blue-100' : 'bg-emerald-100'
                  }`}>
                    <Icon className={`w-4 h-4 ${
                      activeManifeste === 'production' ? 'text-amber-600' :
                      activeManifeste === 'transit' ? 'text-blue-600' : 'text-emerald-600'
                    }`} />
                  </div>
                );
              })()}
              <div>
                <h3 className="font-black text-stone-900 uppercase text-xs tracking-[0.2em]">
                  {activeManifeste === 'production' ? 'Manifeste de Production (PI)' :
                   activeManifeste === 'transit' ? 'Manifeste de Transit' : 'Inventaire Réceptionné'}
                </h3>
                <p className="text-[10px] text-stone-400 font-bold uppercase">
                  {activeManifeste === 'production' ? 'Commandes lancées en cours de fabrication' :
                   activeManifeste === 'transit' ? 'Flux logistiques en cours d\'acheminement' : 'Stock physique certifié disponible'}
                </p>
              </div>
            </div>
            <Badge variant="secondary" className={`font-black text-[10px] border ${
              activeManifeste === 'production' ? 'bg-amber-50 text-amber-700 border-amber-100' :
              activeManifeste === 'transit' ? 'bg-blue-50 text-blue-700 border-blue-100' : 'bg-emerald-50 text-emerald-700 border-emerald-100'
            }`}>
              {activeManifeste === 'production' ? groupedData.production.length :
               activeManifeste === 'transit' ? groupedData.transit.length : groupedData.arrived.length} LIGNES
            </Badge>
          </div>

          <div className="overflow-x-auto">
            {/* Production table */}
            {activeManifeste === 'production' && (
              <Table>
                <TableHeader className="bg-stone-50/80 backdrop-blur-sm">
                  <TableRow>
                    <TableHead className="text-[10px] uppercase font-black py-4 px-6 text-stone-500">Désignation</TableHead>
                    <TableHead className="text-[10px] uppercase font-black py-4 text-stone-500">Taille</TableHead>
                    <TableHead className="text-[10px] uppercase font-black py-4 text-stone-500">Couleur</TableHead>
                    <TableHead className="text-[10px] uppercase font-black py-4 text-stone-500">Technique / Spécifications</TableHead>
                    <TableHead className="text-[10px] uppercase font-black py-4 text-stone-500">Fournisseur</TableHead>
                    <TableHead className="text-[10px] uppercase font-black py-4 text-stone-500">Date Cmd</TableHead>
                    <TableHead className="text-right text-[10px] uppercase font-black py-4 text-stone-500">Quantité</TableHead>
                    <TableHead className="text-right text-[10px] uppercase font-black py-4 text-stone-500">P.A. Unit.</TableHead>
                    <TableHead className="text-right text-[10px] uppercase font-black py-4 px-6 text-stone-500">Valeur Est.</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {groupedData.production.length > 0 ? groupedData.production.map(a => {
                    const isTechnical = isTechnicalZipper(a.categoryId);
                    return (
                      <TableRow key={a.id} className="hover:bg-amber-50/30 transition-colors border-stone-50">
                        <TableCell className="py-3.5 px-6 align-top">
                          <div className="font-black text-[11px] text-stone-900 uppercase leading-tight flex items-center justify-between gap-2">
                            <span>{a.name}</span>
                            <Button variant="ghost" size="icon" className="h-5 w-5 text-stone-300 hover:text-amber-600 shrink-0" onClick={(e) => { e.stopPropagation(); setEditingArticle(a); }}>
                              <Pencil className="w-3 h-3" />
                            </Button>
                          </div>
                        </TableCell>
                        <TableCell className="py-3.5"><span className="text-[10px] text-stone-600 uppercase font-bold bg-stone-50 px-2 py-0.5 rounded">{a.size || '-'}</span></TableCell>
                        <TableCell className="py-3.5">
                          {a.colorBreakdown && a.colorBreakdown.length > 0 ? (
                            <div className="flex items-center gap-1.5">
                              <span className="text-violet-700 font-black uppercase text-[9px]">VARIOUS ({a.colorBreakdown.length})</span>
                              <button onClick={() => setColorDetailArticle(a)} className="flex items-center gap-1 text-[8px] font-black uppercase bg-violet-100 text-violet-600 hover:bg-violet-200 px-2 py-0.5 rounded-full transition-colors"><Palette className="w-2.5 h-2.5" /> Détail</button>
                            </div>
                          ) : (
                            <span className="text-[10px] text-stone-900 uppercase font-bold">{a.color || '-'}</span>
                          )}
                        </TableCell>
                        <TableCell className="text-[10px] py-3.5">
                          {isTechnical ? (
                            <div className="flex flex-col gap-0.5">
                              <span className="text-amber-600 font-black text-[8px] flex items-center gap-1.5 uppercase"><Settings2 className="w-2.5 h-2.5" /> {a.zipperType || '-'}</span>
                              <span className="text-blue-600 font-black text-[8px] flex items-center gap-1.5 uppercase"><MousePointer2 className="w-2.5 h-2.5" /> {a.slider || '-'} ({a.sliderType || '-'})</span>
                            </div>
                          ) : (a.gsm || a.fabricWidth) ? (
                            <div className="flex flex-wrap gap-1">
                              {a.gsm && <span className="px-1.5 py-0.5 rounded bg-violet-100 text-violet-700 text-[8px] font-black">{a.gsm}gsm</span>}
                              {a.fabricWidth && <span className="px-1.5 py-0.5 rounded bg-blue-100 text-blue-700 text-[8px] font-black">{a.fabricWidth}cm</span>}
                              {a.rollLength && <span className="px-1.5 py-0.5 rounded bg-stone-100 text-stone-600 text-[8px] font-black">{a.rollLength}{a.rollLengthUnit || 'm'}</span>}
                              {a.packagingPerBag && <span className="px-1.5 py-0.5 rounded bg-amber-100 text-amber-700 text-[8px] font-black">{a.packagingPerBag}rlx/sac</span>}
                            </div>
                          ) : <span className="text-stone-500 font-bold uppercase">{a.specs || '-'}</span>}
                        </TableCell>
                        <TableCell className="py-3.5">
                          <span className="text-[9px] font-black text-stone-600 bg-stone-50 border border-stone-100 px-2 py-1 rounded uppercase">{a.supplierId}</span>
                        </TableCell>
                        <TableCell className="text-stone-500 font-bold text-[10px] py-3.5">{a.orderDate || '-'}</TableCell>
                        <TableCell className="text-right py-3.5">
                          <span className="font-black text-stone-900 text-[11px]">{Number(a.quantity).toLocaleString('en-US', { maximumFractionDigits: 0 })}</span>
                          <span className="text-[8px] text-stone-400 font-bold ml-1 uppercase">{a.unitOfMeasure}</span>
                          {Number(a.netWeight) > 0 && Number(a.quantity) > 0 && (
                            <div className="text-[8px] text-stone-400 font-bold uppercase mt-0.5">{(Number(a.netWeight)/Number(a.quantity)).toLocaleString('en-US',{maximumFractionDigits:3})} kg/u</div>
                          )}
                        </TableCell>
                        <TableCell className="text-right font-black text-amber-700 text-[10px] py-3.5">{Number(a.purchasePricePerUnit).toLocaleString('en-US', { maximumFractionDigits: 3 })} $</TableCell>
                        <TableCell className="text-right py-3.5 px-6">
                          <span className="font-black text-amber-600 text-[11px]">{Number(a.quantity * a.purchasePricePerUnit).toLocaleString('en-US', { maximumFractionDigits: 0 })} $</span>
                        </TableCell>
                      </TableRow>
                    );
                  }) : (
                    <TableRow><TableCell colSpan={9} className="text-center py-16 text-stone-300 text-[10px] uppercase font-black tracking-widest">Aucune commande en production</TableCell></TableRow>
                  )}
                </TableBody>
              </Table>
            )}

            {/* Transit table */}
            {activeManifeste === 'transit' && (
              <Table>
                <TableHeader className="bg-stone-50/80 backdrop-blur-sm">
                  <TableRow>
                    <TableHead className="text-[10px] uppercase font-black py-4 px-6 text-stone-500">Désignation</TableHead>
                    <TableHead className="text-[10px] uppercase font-black py-4 text-stone-500">Taille</TableHead>
                    <TableHead className="text-[10px] uppercase font-black py-4 text-stone-500">Couleur</TableHead>
                    <TableHead className="text-[10px] uppercase font-black py-4 text-stone-500">Technique</TableHead>
                    <TableHead className="text-[10px] uppercase font-black py-4 text-stone-500">Partenaire</TableHead>
                    <TableHead className="text-[10px] uppercase font-black py-4 text-stone-500">ETA</TableHead>
                    <TableHead className="text-[10px] uppercase font-black py-4 text-stone-500">Dossier</TableHead>
                    <TableHead className="text-right text-[10px] uppercase font-black py-4 text-stone-500">Quantité</TableHead>
                    <TableHead className="text-right text-[10px] uppercase font-black py-4 px-6 text-stone-500">Valeur</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {groupedData.transit.length > 0 ? groupedData.transit.map(a => {
                    const isTechnical = isTechnicalZipper(a.categoryId);
                    return (
                      <TableRow key={a.id} className="hover:bg-blue-50/20 transition-colors border-stone-50">
                        <TableCell className="py-3.5 px-6 align-top">
                          <div className="font-black text-[11px] text-stone-900 uppercase leading-tight flex items-center justify-between gap-2">
                            <span>{a.name}</span>
                            <Button variant="ghost" size="icon" className="h-5 w-5 text-stone-300 hover:text-amber-600 shrink-0" onClick={(e) => { e.stopPropagation(); setEditingArticle(a); }}><Pencil className="w-3 h-3" /></Button>
                          </div>
                        </TableCell>
                        <TableCell className="py-3.5"><span className="text-[10px] text-stone-600 uppercase font-bold bg-stone-50 px-2 py-0.5 rounded">{a.size || '-'}</span></TableCell>
                        <TableCell className="py-3.5">
                          {a.colorBreakdown && a.colorBreakdown.length > 0 ? (
                            <div className="flex items-center gap-1.5">
                              <span className="text-violet-700 font-black uppercase text-[9px]">VARIOUS ({a.colorBreakdown.length})</span>
                              <button onClick={() => setColorDetailArticle(a)} className="flex items-center gap-1 text-[8px] font-black uppercase bg-violet-100 text-violet-600 hover:bg-violet-200 px-2 py-0.5 rounded-full transition-colors"><Palette className="w-2.5 h-2.5" /> Détail</button>
                            </div>
                          ) : <span className="text-[10px] text-stone-900 uppercase font-bold">{a.color || '-'}</span>}
                        </TableCell>
                        <TableCell className="text-[10px] py-3.5">
                          {isTechnical ? (
                            <div className="flex flex-col gap-0.5">
                              <span className="text-amber-600 font-black text-[8px] flex items-center gap-1.5 uppercase"><Settings2 className="w-2.5 h-2.5" /> {a.zipperType || '-'}</span>
                              <span className="text-blue-600 font-black text-[8px] flex items-center gap-1.5 uppercase"><MousePointer2 className="w-2.5 h-2.5" /> {a.slider || '-'} ({a.sliderType || '-'})</span>
                            </div>
                          ) : (a.gsm || a.fabricWidth) ? (
                            <div className="flex flex-wrap gap-1">
                              {a.gsm && <span className="px-1.5 py-0.5 rounded bg-violet-100 text-violet-700 text-[8px] font-black">{a.gsm}gsm</span>}
                              {a.fabricWidth && <span className="px-1.5 py-0.5 rounded bg-blue-100 text-blue-700 text-[8px] font-black">{a.fabricWidth}cm</span>}
                              {a.rollLength && <span className="px-1.5 py-0.5 rounded bg-stone-100 text-stone-600 text-[8px] font-black">{a.rollLength}{a.rollLengthUnit || 'm'}</span>}
                              {a.packagingPerBag && <span className="px-1.5 py-0.5 rounded bg-amber-100 text-amber-700 text-[8px] font-black">{a.packagingPerBag}rlx/sac</span>}
                            </div>
                          ) : <span className="text-stone-500 font-bold uppercase">{a.specs || '-'}</span>}
                        </TableCell>
                        <TableCell className="py-3.5">
                          <span className="text-[9px] font-black text-stone-600 bg-stone-50 border border-stone-100 px-2 py-1 rounded uppercase">{a.supplierId}</span>
                        </TableCell>
                        <TableCell className="py-3.5">
                          {a.arrivalDate ? (
                            <span className="inline-flex items-center gap-1 text-[10px] font-black text-blue-700 bg-blue-50 px-2 py-1 rounded-lg border border-blue-100">
                              <Truck className="w-2.5 h-2.5" />{a.arrivalDate}
                            </span>
                          ) : <span className="text-stone-300 text-[10px]">-</span>}
                        </TableCell>
                        <TableCell className="py-3.5">
                          <span className="text-[9px] font-black text-blue-700 bg-blue-50 px-2 py-1 rounded-full border border-blue-100 uppercase">{a.factureId}</span>
                        </TableCell>
                        <TableCell className="text-right py-3.5">
                          <span className="font-black text-stone-900 text-[11px]">{Number(a.quantity).toLocaleString('en-US', { maximumFractionDigits: 0 })}</span>
                          <span className="text-[8px] text-stone-400 font-bold ml-1 uppercase">{a.unitOfMeasure}</span>
                          {Number(a.netWeight) > 0 && Number(a.quantity) > 0 && (
                            <div className="text-[8px] text-stone-400 font-bold uppercase mt-0.5">{(Number(a.netWeight)/Number(a.quantity)).toLocaleString('en-US',{maximumFractionDigits:3})} kg/u</div>
                          )}
                        </TableCell>
                        <TableCell className="text-right py-3.5 px-6">
                          <span className="font-black text-blue-700 text-[11px]">{Number(a.quantity * a.purchasePricePerUnit).toLocaleString('en-US', { maximumFractionDigits: 0 })} $</span>
                        </TableCell>
                      </TableRow>
                    );
                  }) : (
                    <TableRow><TableCell colSpan={9} className="text-center py-16 text-stone-300 text-[10px] uppercase font-black tracking-widest">Aucun flux en transit</TableCell></TableRow>
                  )}
                </TableBody>
              </Table>
            )}

            {/* ── Articles Arrivés / En Stock ── */}
            {activeManifeste === 'stock' && (() => {
              if (groupedData.arrived.length === 0) {
                return (
                  <div className="flex flex-col items-center justify-center py-20 text-center">
                    <div className="w-14 h-14 rounded-2xl bg-stone-50 flex items-center justify-center mb-4">
                      <Package className="w-7 h-7 text-stone-200" />
                    </div>
                    <p className="text-stone-300 text-[10px] uppercase font-black tracking-widest">Aucun article arrivé</p>
                    <p className="text-stone-200 text-[9px] font-bold mt-1">Les commandes arrivées apparaîtront ici automatiquement</p>
                  </div>
                );
              }
              // Articles arrivés = CUSTOMS (arrivé, pas encore validé) OU STOCK/DELIVERED (validé)
              const arrivedArticles = groupedData.arrived;
              const validatedIds = new Set(stockItems.map(s => s._realArticleId || s.articleId));
              return (
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader className="bg-stone-50/80 backdrop-blur-sm">
                      <TableRow>
                        <TableHead className="text-[10px] uppercase font-black py-4 px-6 text-stone-500">Désignation</TableHead>
                        <TableHead className="text-[10px] uppercase font-black py-4 text-stone-500">Taille</TableHead>
                        <TableHead className="text-[10px] uppercase font-black py-4 text-stone-500">Couleur</TableHead>
                        <TableHead className="text-[10px] uppercase font-black py-4 text-stone-500">Technique</TableHead>
                        <TableHead className="text-[10px] uppercase font-black py-4 text-stone-500">Fournisseur</TableHead>
                        <TableHead className="text-[10px] uppercase font-black py-4 text-stone-500">Arrivée</TableHead>
                        <TableHead className="text-[10px] uppercase font-black py-4 text-stone-500">Dossier</TableHead>
                        <TableHead className="text-[10px] uppercase font-black py-4 text-stone-500">Statut Stock</TableHead>
                        <TableHead className="text-right text-[10px] uppercase font-black py-4 text-stone-500">Quantité</TableHead>
                        <TableHead className="text-right text-[10px] uppercase font-black py-4 px-6 text-stone-500">Valeur</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {arrivedArticles.map(a => {
                        const eff = computeEffectiveStatus(a);
                        const isValidated = validatedIds.has(a.id);
                        const isTechnical = isTechnicalZipper(a.categoryId);
                        return (
                          <TableRow key={a.id} className={`transition-colors border-stone-50 ${
                            isValidated ? 'hover:bg-emerald-50/20' : 'hover:bg-amber-50/20'
                          }`}>
                            <TableCell className="py-3.5 px-6 align-top">
                              <div className="font-black text-[11px] text-stone-900 uppercase leading-tight flex items-center justify-between gap-2">
                                <span>{a.name}</span>
                                <Button variant="ghost" size="icon" className="h-5 w-5 text-stone-300 hover:text-amber-600 shrink-0" onClick={(e) => { e.stopPropagation(); setEditingArticle(a); }}>
                                  <Pencil className="w-3 h-3" />
                                </Button>
                              </div>
                            </TableCell>
                            <TableCell className="py-3.5"><span className="text-[10px] text-stone-600 uppercase font-bold bg-stone-50 px-2 py-0.5 rounded">{a.size || '-'}</span></TableCell>
                            <TableCell className="py-3.5">
                              {a.colorBreakdown && a.colorBreakdown.length > 0 ? (
                                <div className="flex items-center gap-1.5">
                                  <span className="text-violet-700 font-black uppercase text-[9px]">VARIOUS ({a.colorBreakdown.length})</span>
                                  <button onClick={() => setColorDetailArticle(a)} className="flex items-center gap-1 text-[8px] font-black uppercase bg-violet-100 text-violet-600 hover:bg-violet-200 px-2 py-0.5 rounded-full transition-colors"><Palette className="w-2.5 h-2.5" /> Détail</button>
                                </div>
                              ) : <span className="text-[10px] text-stone-900 uppercase font-bold">{a.color || '-'}</span>}
                            </TableCell>
                            <TableCell className="text-[10px] py-3.5">
                              {isTechnical ? (
                                <div className="flex flex-col gap-0.5">
                                  <span className="text-amber-600 font-black text-[8px] flex items-center gap-1.5 uppercase"><Settings2 className="w-2.5 h-2.5" /> {a.zipperType || '-'}</span>
                                  <span className="text-blue-600 font-black text-[8px] flex items-center gap-1.5 uppercase"><MousePointer2 className="w-2.5 h-2.5" /> {a.slider || '-'}</span>
                                </div>
                              ) : (a.gsm || a.fabricWidth) ? (
                                <div className="flex flex-wrap gap-1">
                                  {a.gsm && <span className="px-1.5 py-0.5 rounded bg-violet-100 text-violet-700 text-[8px] font-black">{a.gsm}gsm</span>}
                                  {a.fabricWidth && <span className="px-1.5 py-0.5 rounded bg-blue-100 text-blue-700 text-[8px] font-black">{a.fabricWidth}cm</span>}
                                  {a.rollLength && <span className="px-1.5 py-0.5 rounded bg-stone-100 text-stone-600 text-[8px] font-black">{a.rollLength}{a.rollLengthUnit || 'm'}</span>}
                                  {a.packagingPerBag && <span className="px-1.5 py-0.5 rounded bg-amber-100 text-amber-700 text-[8px] font-black">{a.packagingPerBag}rlx/sac</span>}
                                </div>
                              ) : <span className="text-stone-500 font-bold uppercase">{a.specs || '-'}</span>}
                            </TableCell>
                            <TableCell className="py-3.5"><span className="text-[9px] font-black text-stone-600 bg-stone-50 border border-stone-100 px-2 py-1 rounded uppercase">{a.supplierId}</span></TableCell>
                            <TableCell className="py-3.5">
                              <span className="inline-flex items-center gap-1 text-[10px] font-black text-emerald-700 bg-emerald-50 px-2 py-1 rounded-lg border border-emerald-100">
                                <CheckCircle2 className="w-2.5 h-2.5" />{a.arrivalDate || '-'}
                              </span>
                            </TableCell>
                            <TableCell className="py-3.5"><span className="text-[9px] font-black text-emerald-700 bg-emerald-50 px-2 py-1 rounded-full border border-emerald-100 uppercase">{a.factureId || '-'}</span></TableCell>
                            <TableCell className="py-3.5">
                              {isValidated ? (
                                <span className="inline-flex items-center gap-1 text-[8px] font-black text-emerald-700 bg-emerald-100 px-2 py-0.5 rounded-full"><CheckCircle2 className="w-2.5 h-2.5" /> Validé Stock</span>
                              ) : (
                                <span className="inline-flex items-center gap-1 text-[8px] font-black text-amber-700 bg-amber-100 px-2 py-0.5 rounded-full">⚠ Arrivé — À valider</span>
                              )}
                            </TableCell>
                            <TableCell className="text-right py-3.5">
                              <span className="font-black text-stone-900 text-[11px]">{Number(a.quantity).toLocaleString('en-US', { maximumFractionDigits: 0 })}</span>
                              <span className="text-[8px] text-stone-400 font-bold ml-1 uppercase">{a.unitOfMeasure}</span>
                            </TableCell>
                            <TableCell className="text-right py-3.5 px-6">
                              <span className="font-black text-emerald-700 text-[11px]">{Number(a.quantity * a.purchasePricePerUnit).toLocaleString('en-US', { maximumFractionDigits: 0 })} $</span>
                            </TableCell>
                          </TableRow>
                        );
                      })}
                    </TableBody>
                  </Table>
                </div>
              );
            })()}
          </div>
        </div>

        {/* ── Type de Produit — Fabric only ── */}
        {isFabricCat && (() => {
          const qualities = Array.isArray(currentCategoryObj?.fabricQualities) ? currentCategoryObj.fabricQualities : [];
          
          // Also compute order stats per quality
          const qualityStats = qualities.map(q => {
            const matchingArticles = currentArticles.filter((a: any) => {
              if (q.gsm && Number(a.gsm) !== q.gsm) return false;
              if (q.fabricWidth && Number(a.fabricWidth) !== q.fabricWidth) return false;
              return true;
            });
            return {
              ...q,
              count: matchingArticles.length,
              totalQty: matchingArticles.reduce((s: number, a: any) => s + (Number(a.quantity) || 0), 0),
              totalValue: matchingArticles.reduce((s: number, a: any) => s + ((Number(a.purchasePricePerUnit) || 0) * (Number(a.quantity) || 0)), 0),
              suppliers: [...new Set(matchingArticles.map((a: any) => a.supplierId).filter(Boolean))],
            };
          });

          return (
            <Card className="border-none shadow-xl bg-white rounded-3xl overflow-hidden">
              <div className="h-1.5 w-full bg-violet-500" />
              <CardHeader className="py-4 border-b border-stone-50">
                <CardTitle className="text-[10px] font-black uppercase text-stone-400 tracking-widest flex items-center gap-2">
                  <Factory className="w-3 h-3 text-violet-500" /> Types de Produit — Qualités Fixes
                  <span className="ml-auto text-[8px] font-bold bg-violet-100 text-violet-700 px-2 py-0.5 rounded-full">{qualities.length} qualités</span>
                </CardTitle>
              </CardHeader>
              <CardContent className="p-0">
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow className="bg-stone-50/50">
                        <TableHead className="text-[8px] font-black uppercase tracking-widest text-stone-400 py-3">Qualité</TableHead>
                        <TableHead className="text-[8px] font-black uppercase tracking-widest text-stone-400 py-3 text-center">GSM</TableHead>
                        <TableHead className="text-[8px] font-black uppercase tracking-widest text-stone-400 py-3 text-center">Largeur</TableHead>
                        <TableHead className="text-[8px] font-black uppercase tracking-widest text-stone-400 py-3 text-center">Longueur</TableHead>
                        <TableHead className="text-[8px] font-black uppercase tracking-widest text-stone-400 py-3 text-center">Condit.</TableHead>
                        <TableHead className="text-[8px] font-black uppercase tracking-widest text-stone-400 py-3 text-center">Fournisseurs</TableHead>
                        <TableHead className="text-[8px] font-black uppercase tracking-widest text-stone-400 py-3 text-center">Nb cmd</TableHead>
                        <TableHead className="text-[8px] font-black uppercase tracking-widest text-stone-400 py-3 text-right">Valeur</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {qualityStats.map((pt, idx) => (
                        <TableRow key={idx} className="hover:bg-violet-50/30 transition-colors">
                          <TableCell className="text-[10px] font-black text-stone-800 uppercase tracking-tighter py-3">{pt.label}</TableCell>
                          <TableCell className="text-center">
                            {pt.gsm ? (
                              <span className="px-2 py-0.5 rounded-lg bg-violet-100 text-violet-700 text-[10px] font-black">{pt.gsm}</span>
                            ) : <span className="text-stone-200 text-[9px]">—</span>}
                          </TableCell>
                          <TableCell className="text-center">
                            {pt.fabricWidth ? (
                              <span className="text-[10px] font-black text-stone-700">{pt.fabricWidth}cm</span>
                            ) : <span className="text-stone-200 text-[9px]">—</span>}
                          </TableCell>
                          <TableCell className="text-center">
                            {pt.rollLength ? (
                              <span className="text-[10px] font-black text-stone-700">{pt.rollLength}{pt.rollLengthUnit || 'm'}</span>
                            ) : <span className="text-stone-200 text-[9px]">—</span>}
                          </TableCell>
                          <TableCell className="text-center">
                            {pt.packagingPerBag ? (
                              <span className="text-[10px] font-black text-stone-700">{pt.packagingPerBag}rlx/sac</span>
                            ) : <span className="text-stone-200 text-[9px]">—</span>}
                          </TableCell>
                          <TableCell className="text-center">
                            <span className="text-[9px] font-bold text-stone-500">{pt.suppliers.length > 0 ? pt.suppliers.join(', ') : '—'}</span>
                          </TableCell>
                          <TableCell className="text-center">
                            <span className="px-2 py-0.5 rounded-full bg-stone-100 text-stone-600 text-[9px] font-black">{pt.count}</span>
                          </TableCell>
                          <TableCell className="text-right text-[10px] font-black text-stone-800">
                            {pt.totalValue.toLocaleString('en-US', { maximumFractionDigits: 0 })} $
                          </TableCell>
                        </TableRow>
                      ))}
                      {qualities.length === 0 && (
                        <TableRow>
                          <TableCell colSpan={8} className="text-center py-8 text-stone-300 text-[10px] font-black uppercase tracking-widest">
                            Aucune qualité définie — ouvrez Config & Douane pour en ajouter
                          </TableCell>
                        </TableRow>
                      )}
                    </TableBody>
                  </Table>
                </div>
              </CardContent>
            </Card>
          );
        })()}

        {/* ── Analytics Charts ── */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <Card className="border-none shadow-xl bg-white rounded-3xl overflow-hidden">
            <div className="h-1.5 w-full bg-amber-500" />
            <CardHeader className="py-4 border-b border-stone-50">
              <CardTitle className="text-[10px] font-black uppercase text-stone-400 tracking-widest flex items-center gap-2">
                <Box className="w-3 h-3 text-amber-500" /> Volumes Mensuels Commandés
              </CardTitle>
            </CardHeader>
            <CardContent className="h-[280px] p-4">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={detailedAnalytics.quantityData}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f5f5f4" />
                  <XAxis dataKey="date" axisLine={false} tickLine={false} style={{ fontSize: '9px', fontWeight: '900' }} />
                  <YAxis axisLine={false} tickLine={false} tickFormatter={(v) => Number(v).toLocaleString('en-US', { maximumFractionDigits: 0 })} style={{ fontSize: '9px', fontWeight: '900' }} />
                  <RechartsTooltip
                    formatter={(val: number) => [Number(val).toLocaleString('en-US', { maximumFractionDigits: 0 })]}
                    contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 10px 40px rgba(0,0,0,0.1)', fontWeight: 'bold' }}
                  />
                  <Bar dataKey="value" fill="#F59E0B" radius={[6, 6, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>

          <Card className="border-none shadow-xl bg-white rounded-3xl overflow-hidden">
            <div className="h-1.5 w-full bg-blue-500" />
            <CardHeader className="py-4 border-b border-stone-50">
              <CardTitle className="text-[10px] font-black uppercase text-stone-400 tracking-widest flex items-center gap-2">
                <TrendingUp className="w-3 h-3 text-blue-500" /> {isFabricCat ? 'Évolution Prix par Qualité ($)' : 'Évolution Prix par Taille ($)'}
              </CardTitle>
            </CardHeader>
            <CardContent className="h-[280px] p-4">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={detailedAnalytics.priceData}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f5f5f4" />
                  <XAxis dataKey="date" axisLine={false} tickLine={false} style={{ fontSize: '9px', fontWeight: '900' }} />
                  <YAxis axisLine={false} tickLine={false} tickFormatter={(v) => v.toLocaleString('en-US', { maximumFractionDigits: 3 })} style={{ fontSize: '9px', fontWeight: '900' }} />
                  <RechartsTooltip
                    formatter={(val: number) => [`${val.toLocaleString('en-US', { maximumFractionDigits: 3 })} $`]}
                    contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 10px 40px rgba(0,0,0,0.1)', fontWeight: 'bold' }}
                  />
                  <Legend verticalAlign="top" height={36} iconType="circle" wrapperStyle={{ fontSize: '8px', fontWeight: '900', textTransform: 'uppercase', paddingBottom: '16px' }} />
                  {detailedAnalytics.uniqueProducts.map((product, idx) => (
                    <Line key={product} type="monotone" dataKey={product} name={product} stroke={UI_COLORS[idx % UI_COLORS.length]} strokeWidth={2.5} dot={{ r: 4, fill: UI_COLORS[idx % UI_COLORS.length], strokeWidth: 0 }} activeDot={{ r: 6 }} connectNulls={true} />
                  ))}
                </LineChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>

          <Card className="border-none shadow-xl bg-white rounded-3xl overflow-hidden">
            <div className="h-1.5 w-full bg-emerald-500" />
            <CardHeader className="py-4 border-b border-stone-50">
              <CardTitle className="text-[10px] font-black uppercase text-stone-400 tracking-widest flex items-center gap-2">
                <Users className="w-3 h-3 text-emerald-500" /> Répartition par Fournisseur
              </CardTitle>
            </CardHeader>
            <CardContent className="h-[280px] p-4">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie data={detailedAnalytics.supplierDistribution} cx="50%" cy="45%" innerRadius={55} outerRadius={75} paddingAngle={4} dataKey="value">
                    {detailedAnalytics.supplierDistribution.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={UI_COLORS[index % UI_COLORS.length]} />
                    ))}
                  </Pie>
                  <RechartsTooltip formatter={(val: number) => [`${Number(val).toLocaleString('en-US', { maximumFractionDigits: 0 })} $`]} contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 10px 40px rgba(0,0,0,0.1)' }} />
                  <Legend verticalAlign="bottom" height={36} iconType="circle" wrapperStyle={{ fontSize: '9px', fontWeight: '900', textTransform: 'uppercase' }} />
                </PieChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>

          <Card className="border-none shadow-xl bg-white rounded-3xl overflow-hidden col-span-full">
            <div className="h-1.5 w-full bg-emerald-500" />
            <CardHeader className="py-4 border-b border-stone-50 flex flex-row items-center justify-between">
              <CardTitle className="text-[10px] font-black uppercase text-stone-400 tracking-widest flex items-center gap-2">
                <Calculator className="w-3 h-3 text-emerald-500" /> Historique & Évolution du Coût de Revient par Dossier
              </CardTitle>
            </CardHeader>
            <CardContent className="p-6 space-y-6">
              {costHistoryData.length > 0 ? (
                <>
                  <div className="h-[250px] w-full">
                    <ResponsiveContainer width="100%" height="100%">
                      <LineChart data={costHistoryData}>
                        <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f5f5f4" />
                        <XAxis dataKey="factureDate" axisLine={false} tickLine={false} style={{ fontSize: '9px', fontWeight: '900' }} />
                        <YAxis axisLine={false} tickLine={false} domain={['auto', 'auto']} tickFormatter={(v) => v.toLocaleString('fr-MA', { maximumFractionDigits: 1 })} style={{ fontSize: '9px', fontWeight: '900' }} />
                        <RechartsTooltip
                          formatter={(val: number) => [`${val.toLocaleString('fr-MA', { maximumFractionDigits: 2 })} MAD`, 'PAU TTC']}
                          labelFormatter={(label) => `Date: ${label}`}
                          contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 10px 40px rgba(0,0,0,0.1)', fontWeight: 'bold' }}
                        />
                        <Line type="monotone" dataKey="pauTtc" name="PAU TTC" stroke="#10B981" strokeWidth={3} dot={{ r: 4, fill: '#10B981', strokeWidth: 0 }} activeDot={{ r: 6 }} />
                      </LineChart>
                    </ResponsiveContainer>
                  </div>
                  
                  <div className="rounded-xl overflow-hidden border border-stone-100">
                    <Table>
                      <TableHeader className="bg-stone-50">
                        <TableRow>
                          <TableHead className="text-[9px] uppercase font-black text-stone-500 py-3">Date</TableHead>
                          <TableHead className="text-[9px] uppercase font-black text-stone-500 py-3">Dossier</TableHead>
                          <TableHead className="text-right text-[9px] uppercase font-black text-stone-500 py-3">Qté Totale</TableHead>
                          <TableHead className="text-right text-[9px] uppercase font-black text-sky-500 py-3">Val. Achat (MAD)</TableHead>
                          <TableHead className="text-right text-[9px] uppercase font-black text-indigo-400 py-3">Frais Log. (MAD)</TableHead>
                          <TableHead className="text-right text-[9px] uppercase font-black text-orange-400 py-3">Total Douane (MAD)</TableHead>
                          <TableHead className="text-right text-[9px] uppercase font-black text-emerald-600 py-3 px-4">P.A.U TTC (MAD)</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {costHistoryData.slice().reverse().map((row: any, i: number) => (
                          <TableRow key={i} className="hover:bg-stone-50/50 transition-colors">
                            <TableCell className="font-bold text-[10px] text-stone-400 py-3">{row.factureDate}</TableCell>
                            <TableCell className="font-black text-[11px] uppercase text-stone-900 py-3">{row.factureName}</TableCell>
                            <TableCell className="text-right font-black text-[11px] py-3">{row.qty.toLocaleString()}</TableCell>
                            <TableCell className="text-right font-black text-[11px] text-sky-700 py-3">{row.valAchatMad > 0 ? row.valAchatMad.toLocaleString('fr-MA', { maximumFractionDigits: 2 }) : '-'}</TableCell>
                            <TableCell className="text-right font-black text-[11px] text-indigo-700 py-3">{row.fraisCmd > 0 ? row.fraisCmd.toLocaleString('fr-MA', { maximumFractionDigits: 2 }) : '-'}</TableCell>
                            <TableCell className="text-right font-black text-[11px] text-orange-700 py-3">{row.totalDouane > 0 ? row.totalDouane.toLocaleString('fr-MA', { maximumFractionDigits: 2 }) : '-'}</TableCell>
                            <TableCell className="text-right font-black text-[11px] text-emerald-700 bg-emerald-50/30 py-3 px-4">
                              {row.pauTtc > 0 ? row.pauTtc.toLocaleString('fr-MA', { minimumFractionDigits: 2, maximumFractionDigits: 4 }) : 'Manquant'}
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                </>
              ) : (
                <div className="flex items-center justify-center py-10">
                  <p className="text-[10px] font-black uppercase text-stone-300 tracking-widest">Aucun historique de revient</p>
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        {editingArticle && (
          <EditOrderModal article={editingArticle} onOpenChange={(open) => !open && setEditingArticle(null)} factures={factures} />
        )}

        {colorDetailArticle && (
          <Dialog open={!!colorDetailArticle} onOpenChange={(open) => !open && setColorDetailArticle(null)}>
            <DialogContent className="max-w-sm border-stone-200 rounded-2xl p-0 overflow-hidden">
              <div className="bg-violet-700 p-5 flex items-center gap-3 text-white">
                <div className="p-2 bg-white/10 rounded-lg"><Palette className="w-5 h-5" /></div>
                <div>
                  <DialogTitle className="text-base font-black uppercase tracking-tight leading-none">Détail Multi-Couleurs</DialogTitle>
                  <p className="text-[9px] font-bold text-violet-300 uppercase tracking-widest mt-0.5">{colorDetailArticle.name} · {colorDetailArticle.size || ''}</p>
                </div>
              </div>
              <div className="p-4">
                <div className="rounded-xl overflow-hidden border border-violet-100">
                  <div className="grid grid-cols-[1fr_100px] bg-violet-100/60">
                    <div className="py-2 px-3 text-[9px] font-black uppercase text-violet-600 tracking-widest flex items-center gap-1"><Hash className="w-2.5 h-2.5" /> N° Couleur</div>
                    <div className="py-2 px-3 text-[9px] font-black uppercase text-violet-600 tracking-widest text-right">Rouleaux</div>
                  </div>
                  <div className="divide-y divide-violet-50">
                    {(colorDetailArticle.colorBreakdown || []).map((row: any, i: number) => (
                      <div key={i} className="grid grid-cols-[1fr_100px] hover:bg-violet-50/30 transition-colors">
                        <div className="py-2.5 px-3 text-[11px] font-black text-stone-800 uppercase">{row.colorCode}</div>
                        <div className="py-2.5 px-3 text-[11px] font-black text-stone-900 text-right">{Number(row.rolls).toLocaleString()}</div>
                      </div>
                    ))}
                  </div>
                  <div className="grid grid-cols-[1fr_100px] bg-violet-600 text-white">
                    <div className="py-2.5 px-3 text-[9px] font-black uppercase tracking-widest">TOTAL</div>
                    <div className="py-2.5 px-3 text-right text-[11px] font-black">{(colorDetailArticle.colorBreakdown || []).reduce((s: number, r: any) => s + (Number(r.rolls) || 0), 0).toLocaleString('en-US')} rolls</div>
                  </div>
                </div>
              </div>
            </DialogContent>
          </Dialog>
        )}

        <Dialog open={isCustomsModalOpen} onOpenChange={setIsCustomsModalOpen}>
          <DialogContent className="max-w-md max-h-[90vh] rounded-[1.5rem] p-0 border-none overflow-y-auto">
            <div className="bg-amber-600 p-6 text-white">
              <DialogTitle className="text-lg font-black uppercase tracking-tight">Configuration & Douane</DialogTitle>
              <p className="text-amber-200 text-[9px] font-bold uppercase tracking-widest mt-1">Audit Analytique Produit — {selectedCategory}</p>
            </div>
            <div className="p-6 space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label className="text-[9px] font-black text-amber-700 uppercase tracking-widest">Code HS</Label>
                  <Input placeholder="0000.00.00" className="h-10 text-[11px] font-bold border-amber-200 focus:ring-amber-600" value={customsForm.hsCode} onChange={e => setCustomsForm(p => ({ ...p, hsCode: e.target.value }))} />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-[9px] font-black text-amber-700 uppercase tracking-widest">Val Douane / Kg (dh)</Label>
                  <Input type="number" step="0.01" placeholder="0.00" className="h-10 text-[11px] font-bold border-amber-200 focus:ring-amber-600" value={customsForm.customsValuePerKg} onChange={e => setCustomsForm(p => ({ ...p, customsValuePerKg: e.target.value }))} />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label className="text-[9px] font-black text-amber-700 uppercase tracking-widest">Taux DI (%)</Label>
                  <Input type="number" step="0.1" placeholder="0.0" className="h-10 text-[11px] font-bold border-amber-200 focus:ring-amber-600" value={customsForm.importDutyRate} onChange={e => setCustomsForm(p => ({ ...p, importDutyRate: e.target.value }))} />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-[9px] font-black text-amber-700 uppercase tracking-widest">TPI (%)</Label>
                  <Input type="number" step="0.01" placeholder="0.0" className="h-10 text-[11px] font-bold border-amber-200 focus:ring-amber-600" value={customsForm.tpiRate} onChange={e => setCustomsForm(p => ({ ...p, tpiRate: e.target.value }))} />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-[9px] font-black text-amber-700 uppercase tracking-widest">TIC (%)</Label>
                  <Input type="number" step="0.01" placeholder="0.0" className="h-10 text-[11px] font-bold border-amber-200 focus:ring-amber-600" value={customsForm.ticRate} onChange={e => setCustomsForm(p => ({ ...p, ticRate: e.target.value }))} />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-[9px] font-black text-amber-700 uppercase tracking-widest">TVA (%)</Label>
                  <Input type="number" step="0.1" placeholder="0.0" className="h-10 text-[11px] font-bold border-amber-200 focus:ring-amber-600" value={customsForm.tvaRate} onChange={e => setCustomsForm(p => ({ ...p, tvaRate: e.target.value }))} />
                </div>
                <div className="space-y-1.5 col-span-2">
                  <Label className="text-[9px] font-black text-amber-700 uppercase tracking-widest">Pièces par CTN/SAC (Par Défaut)</Label>
                  <Input type="number" step="1" placeholder="Ex: 50" className="h-10 text-[11px] font-bold border-amber-200 focus:ring-amber-600" value={customsForm.defaultPcsPerCtn} onChange={e => setCustomsForm(p => ({ ...p, defaultPcsPerCtn: e.target.value }))} />
                </div>
              </div>

              {/* ── Tailles Fixes du Produit ──────────────────────────────── */}
              <div className="border-t border-amber-100 pt-4 mt-2">
                <div className="flex items-center gap-2 mb-3">
                  <div className="p-1.5 bg-teal-100 rounded-lg"><Maximize className="w-3.5 h-3.5 text-teal-600" /></div>
                  <span className="text-[9px] font-black text-teal-700 uppercase tracking-[0.2em]">Tailles Fixes du Produit</span>
                  {customsForm.availableSizes.length > 0 && (
                    <span className="text-[8px] font-bold bg-teal-100 text-teal-700 px-2 py-0.5 rounded-full">{customsForm.availableSizes.length} tailles</span>
                  )}
                </div>

                {/* Tailles existantes (chips) */}
                {customsForm.availableSizes.length > 0 && (
                  <div className="flex flex-wrap gap-1.5 mb-3">
                    {customsForm.availableSizes.map((sz, idx) => (
                      <span key={idx} className="inline-flex items-center gap-1 px-2.5 py-1 bg-teal-50 border border-teal-200 rounded-lg text-[10px] font-black text-teal-800 uppercase">
                        {sz}
                        <button
                          type="button"
                          onClick={() => setCustomsForm(p => ({ ...p, availableSizes: p.availableSizes.filter((_, i) => i !== idx) }))}
                          className="ml-0.5 p-0.5 rounded hover:bg-red-100 hover:text-red-500 transition-colors"
                        >
                          <XIcon className="w-3 h-3" />
                        </button>
                      </span>
                    ))}
                  </div>
                )}

                {/* Ajout d'une nouvelle taille */}
                <div className="flex gap-2">
                  <Input
                    placeholder="Ex: NO.5, 20CM..."
                    className="h-9 text-[11px] font-bold border-teal-200 focus:ring-teal-500 flex-1 uppercase"
                    value={newSizeInput}
                    onChange={e => setNewSizeInput(e.target.value.toUpperCase())}
                    onKeyDown={e => {
                      if (e.key === 'Enter') {
                        e.preventDefault();
                        const val = newSizeInput.trim().toUpperCase();
                        if (val && !customsForm.availableSizes.includes(val)) {
                          setCustomsForm(p => ({ ...p, availableSizes: [...p.availableSizes, val] }));
                          setNewSizeInput('');
                        }
                      }
                    }}
                  />
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="h-9 px-3 border-teal-200 text-teal-600 hover:bg-teal-50 font-black text-[9px] uppercase tracking-widest rounded-lg"
                    onClick={() => {
                      const val = newSizeInput.trim().toUpperCase();
                      if (val && !customsForm.availableSizes.includes(val)) {
                        setCustomsForm(p => ({ ...p, availableSizes: [...p.availableSizes, val] }));
                        setNewSizeInput('');
                      }
                    }}
                  >
                    <Plus className="w-3.5 h-3.5" />
                  </Button>
                </div>
                {customsForm.availableSizes.length === 0 && (
                  <p className="text-[8px] font-bold text-stone-400 uppercase mt-2 italic">
                    Aucune taille définie — le champ taille restera libre dans les commandes
                  </p>
                )}
              </div>
            </div>

            {/* ── Fabric: Qualités pré-définies ── */}
            {isFabricCat && (
              <div className="space-y-4 p-4 rounded-2xl bg-violet-50/50 border border-violet-100">
                <p className="text-[9px] font-black text-violet-600 uppercase tracking-widest">⚙️ Qualités Fabric Pré-définies</p>
                
                {/* Existing qualities */}
                {customsForm.fabricQualities.length > 0 && (
                  <div className="space-y-2">
                    {customsForm.fabricQualities.map((q, idx) => (
                      <div key={idx} className="flex items-center gap-2 p-2.5 rounded-xl bg-white border border-violet-100">
                        <span className="text-[10px] font-black text-stone-800 flex-1 uppercase">{q.label}</span>
                        <div className="flex gap-1">
                          {q.gsm && <span className="px-1.5 py-0.5 rounded bg-violet-100 text-violet-700 text-[8px] font-black">{q.gsm}gsm</span>}
                          {q.fabricWidth && <span className="px-1.5 py-0.5 rounded bg-blue-100 text-blue-700 text-[8px] font-black">{q.fabricWidth}cm</span>}
                          {q.rollLength && <span className="px-1.5 py-0.5 rounded bg-stone-100 text-stone-600 text-[8px] font-black">{q.rollLength}{q.rollLengthUnit || 'm'}</span>}
                          {q.packagingPerBag && <span className="px-1.5 py-0.5 rounded bg-amber-100 text-amber-700 text-[8px] font-black">{q.packagingPerBag}rlx/sac</span>}
                        </div>
                        <button type="button" className="text-stone-300 hover:text-red-500 transition-colors"
                          onClick={() => setCustomsForm(p => ({ ...p, fabricQualities: p.fabricQualities.filter((_, i) => i !== idx) }))}>×</button>
                      </div>
                    ))}
                  </div>
                )}
                {customsForm.fabricQualities.length === 0 && (
                  <p className="text-[8px] font-bold text-stone-400 uppercase italic">Aucune qualité définie</p>
                )}

                {/* Add new quality form */}
                <div className="space-y-2 p-3 rounded-xl bg-violet-100/30 border border-violet-200">
                  <p className="text-[8px] font-black text-violet-500 uppercase tracking-widest">+ Nouvelle Qualité</p>
                  <Input placeholder="Label (auto si vide)" className="h-8 text-[10px] font-bold border-violet-200 rounded-lg"
                    value={newQualityForm.label} onChange={e => setNewQualityForm(p => ({ ...p, label: e.target.value }))} />
                  <div className="grid grid-cols-5 gap-2">
                    <Input type="number" placeholder="GSM" className="h-8 text-[10px] font-bold border-violet-200 rounded-lg"
                      value={newQualityForm.gsm} onChange={e => setNewQualityForm(p => ({ ...p, gsm: e.target.value }))} />
                    <Input type="number" placeholder="Larg. cm" className="h-8 text-[10px] font-bold border-violet-200 rounded-lg"
                      value={newQualityForm.fabricWidth} onChange={e => setNewQualityForm(p => ({ ...p, fabricWidth: e.target.value }))} />
                    <Input type="number" placeholder="Long. rlx" className="h-8 text-[10px] font-bold border-violet-200 rounded-lg"
                      value={newQualityForm.rollLength} onChange={e => setNewQualityForm(p => ({ ...p, rollLength: e.target.value }))} />
                    <select className="h-8 text-[10px] font-bold border border-violet-200 rounded-lg bg-white px-1"
                      value={newQualityForm.rollLengthUnit} onChange={e => setNewQualityForm(p => ({ ...p, rollLengthUnit: e.target.value }))}>
                      <option value="m">m</option>
                      <option value="yds">yds</option>
                    </select>
                    <Input type="number" placeholder="Rlx/sac" className="h-8 text-[10px] font-bold border-violet-200 rounded-lg"
                      value={newQualityForm.packagingPerBag} onChange={e => setNewQualityForm(p => ({ ...p, packagingPerBag: e.target.value }))} />
                  </div>
                  <Button type="button" variant="outline" size="sm"
                    className="h-8 w-full border-violet-300 text-violet-600 hover:bg-violet-100 font-black text-[9px] uppercase tracking-widest rounded-lg"
                    onClick={() => {
                      const gsm = newQualityForm.gsm ? Number(newQualityForm.gsm) : null;
                      const fabricWidth = newQualityForm.fabricWidth ? Number(newQualityForm.fabricWidth) : null;
                      const rollLength = newQualityForm.rollLength ? Number(newQualityForm.rollLength) : null;
                      const packagingPerBag = newQualityForm.packagingPerBag ? Number(newQualityForm.packagingPerBag) : null;
                      const autoLabel = [gsm ? `${gsm}gsm` : null, fabricWidth ? `${fabricWidth}cm` : null, rollLength ? `${rollLength}${newQualityForm.rollLengthUnit}/rlx` : null, packagingPerBag ? `${packagingPerBag}rlx/sac` : null].filter(Boolean).join(' · ');
                      const label = newQualityForm.label.trim() || autoLabel || 'Qualité';
                      if (!gsm && !fabricWidth) return; // At least GSM or width required
                      setCustomsForm(p => ({ ...p, fabricQualities: [...p.fabricQualities, { label, gsm, fabricWidth, rollLength, rollLengthUnit: newQualityForm.rollLengthUnit, packagingPerBag }] }));
                      setNewQualityForm({ label: '', gsm: '', fabricWidth: '', rollLength: '', rollLengthUnit: 'm', packagingPerBag: '' });
                    }}>
                    <Plus className="w-3 h-3 mr-1" /> Ajouter Qualité
                  </Button>
                </div>
              </div>
            )}

            <DialogFooter className="p-6 bg-stone-50 gap-3">
              <Button variant="ghost" onClick={() => setIsCustomsModalOpen(false)} className="h-10 font-black uppercase text-[9px] tracking-widest flex-1">Annuler</Button>
              <Button onClick={handleUpdateCustoms} className="h-10 bg-amber-600 hover:bg-amber-700 text-white font-black uppercase text-[9px] tracking-widest rounded-xl flex-[1.5] shadow-lg shadow-amber-200">Enregistrer</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* MODALE HISTORIQUE DOUANE (Vue Détaillée) */}
        <CustomsHistoryModal 
          open={historyModalOpen}
          onOpenChange={(v) => {
            setHistoryModalOpen(v);
            if (!v) setHistoryArticles([]);
          }}
          articles={historyArticles}
          categoryName={selectedCategory || ''}
          factures={factures}
        />
      </div>
    );
  }

  if (selectedGeneralCategoryId) {
    const parent = generalCategories.find(g => g.id === selectedGeneralCategoryId);
    return (
      <>
      <div className="space-y-6 animate-in fade-in duration-500">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-white p-6 rounded-[1.5rem] shadow-xl border border-stone-100">
          <div className="flex items-center gap-4">
            <Button variant="outline" size="icon" onClick={() => onSelectGeneralCategory(null)} className="h-10 w-10 rounded-xl border-stone-200 hover:border-stone-900 transition-all">
              <ChevronLeft className="w-4 h-4" />
            </Button>
            <div>
              <p className="text-[9px] font-black text-amber-500 uppercase tracking-[0.2em] mb-0.5">Exploration du Pôle</p>
              <h2 className="text-xl font-black text-stone-900 uppercase tracking-tighter leading-none">{parent?.name}</h2>
            </div>
          </div>
          <div className="relative w-full md:w-64">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-stone-400" />
            <Input 
              placeholder="Chercher famille..." 
              value={searchTerm} 
              onChange={e => setSearchTerm(e.target.value)}
              className="pl-9 h-10 text-[10px] font-bold border-stone-200 bg-stone-50 rounded-xl focus:ring-stone-900 transition-all"
            />
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-5 gap-4">

          {/* Banner alertes */}
          {activeAlerts.length > 0 && (
            <div className="col-span-full rounded-2xl border border-orange-200 bg-orange-50 overflow-hidden">
              <div className="flex items-center gap-3 px-5 py-2.5 bg-orange-100/70 border-b border-orange-200">
                <span className="w-2 h-2 rounded-full bg-orange-500 animate-pulse shrink-0" />
                <span className="text-[10px] font-black text-orange-800 uppercase tracking-widest flex-1">
                  {activeAlerts.length} catégorie{activeAlerts.length > 1 ? 's' : ''} à commander bientôt
                </span>
              </div>
              <div className="divide-y divide-orange-100">
                {activeAlerts.map(({ cat, alert }) => (
                  <div key={cat.id} className="flex items-center gap-3 px-5 py-2 hover:bg-orange-100/40 transition-colors cursor-pointer" onClick={() => setSelectedCategory(cat.name)}>
                    <span className={`text-[9px] font-black px-2 py-0.5 rounded-full uppercase ${
                      alert!.level === 'OVERDUE' ? 'bg-red-100 text-red-700' :
                      alert!.level === 'URGENT' ? 'bg-orange-100 text-orange-700' : 'bg-amber-100 text-amber-700'
                    }`}>{alert!.level === 'OVERDUE' ? 'Dépassé' : alert!.level === 'URGENT' ? 'Urgent' : 'Bientôt'}</span>
                    <span className="text-[10px] font-black text-stone-800 uppercase flex-1">{cat.name}</span>
                    <span className="text-[9px] font-bold text-stone-500">{formatReorderBadge(alert!)}</span>
                    <span className="text-[8px] text-stone-400 font-bold">{alert!.season.season}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
          {subCategoryStats.map((sc, idx) => {
            const alert = reorderAlerts[sc.name];
            const alertVisible = alert && alert.level !== 'OK';
            const alertColor = alert?.level === 'OVERDUE'
              ? { bg: 'bg-red-500', border: 'border-red-200', text: 'text-red-700', light: 'bg-red-50' }
              : alert?.level === 'URGENT'
              ? { bg: 'bg-orange-500', border: 'border-orange-200', text: 'text-orange-700', light: 'bg-orange-50' }
              : { bg: 'bg-amber-400', border: 'border-amber-200', text: 'text-amber-700', light: 'bg-amber-50' };
            const catObj = subCategories.find(s => s.name === sc.name);
            return (
            <Card 
              key={sc.id} 
              className={`cursor-pointer border-stone-100 hover:border-amber-400 hover:bg-amber-50/20 transition-all shadow-lg hover:shadow-amber-500/10 group rounded-[1.2rem] overflow-hidden bg-white active:scale-95${alertVisible ? ` ring-1 ring-offset-1 ${alertColor.border}` : ''}`}
              onClick={() => setSelectedCategory(sc.name)}
            >
              <CardContent className="p-0">
                <div className={`h-1 w-full ${UI_COLORS[idx % UI_COLORS.length]}`} style={{ backgroundColor: UI_COLORS[idx % UI_COLORS.length] }} />
                <div className="p-4 pb-2">
                  <div className="flex justify-between items-start mb-3">
                    <div className="p-2 bg-stone-50 rounded-lg group-hover:bg-white transition-colors">
                      <Package className="w-3.5 h-3.5 text-stone-300 group-hover:text-stone-900" />
                    </div>
                    <div className="flex items-center gap-1">
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-6 w-6 text-stone-300 hover:text-amber-600 hover:bg-amber-50 rounded-lg transition-colors opacity-0 group-hover:opacity-100"
                        title="Configurer le rappel de commande"
                        onClick={(e) => { e.stopPropagation(); if (catObj) { setReorderConfigCat(catObj); setReorderSeasons(catObj.orderSchedule ? [...catObj.orderSchedule] : []); } }}
                      >
                        <Settings2 className="w-3 h-3" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-6 w-6 text-stone-300 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors opacity-0 group-hover:opacity-100"
                        title="Déplacer vers un autre pôle"
                        onClick={(e) => { e.stopPropagation(); if (catObj) setMovingSubCategory(catObj); }}
                      >
                        <ArrowRightLeft className="w-3 h-3" />
                      </Button>
                      <Button 
                        variant="ghost" 
                        size="icon" 
                        className="h-6 w-6 text-stone-300 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors opacity-0 group-hover:opacity-100"
                        onClick={(e) => handleDeleteSubCategory(e, sc.id, sc.name)}
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </Button>
                      <Badge className="bg-stone-900 text-white text-[8px] font-black uppercase px-2">{sc.count}</Badge>
                    </div>
                  </div>
                    <h3 className="font-black text-[11px] text-stone-800 uppercase leading-tight mb-3 line-clamp-2 min-h-[2rem] group-hover:text-stone-900">{sc.name}</h3>

                  {alertVisible && (
                    <div className={`mb-2 px-2.5 py-1.5 rounded-xl border ${alertColor.border} ${alertColor.light} flex items-center gap-2`}>
                      <span className={`w-1.5 h-1.5 rounded-full ${alertColor.bg} shrink-0 animate-pulse`} />
                      <span className={`text-[8px] font-black uppercase tracking-wider ${alertColor.text} flex-1 leading-tight`}>
                        {formatReorderBadge(alert!)}
                      </span>
                      <span className="text-[7px] text-stone-400 font-bold shrink-0">{alert!.season.season}</span>
                    </div>
                  )}

                  <div className="space-y-2 pt-3 border-t border-stone-50">
                    <div className="flex justify-between items-center text-[8px]">
                      <span className="text-stone-400 font-black uppercase flex items-center gap-1">
                        <Truck className="w-2.5 h-2.5" /> PROCHAINE
                      </span>
                      <span className={`font-black ${sc.nextArrival !== '-' ? 'text-blue-600' : 'text-stone-300'}`}>
                        {sc.nextArrival}
                      </span>
                    </div>
                    <div className="flex justify-between items-center text-[8px]">
                      <span className="text-stone-400 font-black uppercase flex items-center gap-1">
                        <DollarSign className="w-2.5 h-2.5" /> VALEUR TOTALE
                      </span>
                      <span className="font-black text-stone-900">
                        {Number(sc.totalValue).toLocaleString('en-US', { maximumFractionDigits: 3 })} $
                      </span>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
            );
          })}
        </div>
      </div>

      {/* ── Modal configuration rappel de commande ── */}
      <Dialog open={!!reorderConfigCat} onOpenChange={open => { if (!open) setReorderConfigCat(null); }}>
        <DialogContent className="sm:max-w-lg rounded-3xl border-none shadow-2xl">
          <DialogHeader>
            <DialogTitle className="text-[11px] font-black uppercase tracking-widest text-stone-500">Rappel de Commande</DialogTitle>
            <p className="text-base font-black text-stone-900 uppercase tracking-tight mt-0.5">{reorderConfigCat?.name}</p>
          </DialogHeader>
          <div className="space-y-4 py-2 max-h-[65vh] overflow-y-auto pr-1">
            <p className="text-[10px] text-stone-500 font-bold uppercase tracking-widest">Intervalles de commande par saison</p>
            {reorderSeasons.length === 0 && (
              <p className="text-xs text-stone-400 text-center py-4">Aucune saison configurée. Ajoutez-en une ci-dessous.</p>
            )}
            {reorderSeasons.map((s, i) => (
              <div key={i} className="bg-stone-50 border border-stone-100 rounded-2xl p-4 space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-[9px] font-black text-stone-400 uppercase tracking-widest">Saison {i + 1}</span>
                  <button type="button" onClick={() => setReorderSeasons(prev => prev.filter((_, j) => j !== i))}
                    className="h-6 w-6 flex items-center justify-center rounded-lg text-stone-300 hover:text-red-500 hover:bg-red-50 transition-colors">
                    <Trash2 className="w-3 h-3" />
                  </button>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1">
                    <Label className="text-[9px] font-black uppercase tracking-widest text-stone-500">Nom de la saison</Label>
                    <Input value={s.season} onChange={e => setReorderSeasons(prev => prev.map((x, j) => j === i ? { ...x, season: e.target.value } : x))}
                      placeholder="Été, Hiver, Ramadan..." className="h-9 text-xs font-bold rounded-xl border-stone-200" />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-[9px] font-black uppercase tracking-widest text-stone-500">Intervalle (jours)</Label>
                    <Input type="number" min={1} value={s.intervalDays}
                      onChange={e => setReorderSeasons(prev => prev.map((x, j) => j === i ? { ...x, intervalDays: Number(e.target.value) } : x))}
                      placeholder="60" className="h-9 text-xs font-bold rounded-xl border-stone-200" />
                  </div>
                </div>
                <div className="space-y-1.5">
                  <Label className="text-[9px] font-black uppercase tracking-widest text-stone-500">
                    Mois actifs <span className="font-normal text-stone-400 normal-case">(vide = toute l&apos;année)</span>
                  </Label>
                  <div className="flex flex-wrap gap-1.5">
                    {['Jan','Fév','Mar','Avr','Mai','Jun','Jul','Aoû','Sep','Oct','Nov','Déc'].map((m, mi) => {
                      const active = s.months.includes(mi + 1);
                      return (
                        <button key={mi} type="button"
                          onClick={() => setReorderSeasons(prev => prev.map((x, j) => j !== i ? x : {
                            ...x, months: active ? x.months.filter(n => n !== mi + 1) : [...x.months, mi + 1].sort((a,b)=>a-b)
                          }))}
                          className={`text-[9px] font-black px-2.5 py-1 rounded-lg border transition-all uppercase ${
                            active ? 'bg-amber-500 text-white border-amber-500 shadow-sm' : 'bg-white text-stone-400 border-stone-200 hover:border-stone-400'
                          }`}>{m}</button>
                      );
                    })}
                  </div>
                </div>
              </div>
            ))}
            <button type="button"
              onClick={() => setReorderSeasons(prev => [...prev, { season: '', intervalDays: 60, months: [] }])}
              className="w-full py-2.5 rounded-2xl border-2 border-dashed border-stone-200 text-[10px] font-black text-stone-400 hover:border-amber-400 hover:text-amber-600 transition-all uppercase tracking-widest">
              + Ajouter une saison
            </button>
          </div>
          <DialogFooter className="gap-2 pt-2">
            <Button variant="ghost" onClick={() => setReorderConfigCat(null)} className="rounded-xl text-[10px] font-black uppercase">Annuler</Button>
            <Button disabled={reorderSaving}
              onClick={() => {
                if (!user || !firestore || !reorderConfigCat) return;
                setReorderSaving(true);
                const docRef = doc(firestore, 'users', user.uid, 'categories', reorderConfigCat.id);
                updateDocumentNonBlocking(docRef, { orderSchedule: reorderSeasons });
                toast({ title: 'Rappel enregistré', description: reorderConfigCat.name });
                setReorderSaving(false);
                setReorderConfigCat(null);
              }}
              className="bg-stone-900 hover:bg-black text-white font-black uppercase text-[10px] tracking-widest px-6 rounded-xl">
              {reorderSaving ? 'Sauvegarde...' : 'Enregistrer'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Modal changer de Pôle (pour SubCategory) ── */}
      <Dialog open={!!movingSubCategory} onOpenChange={open => { if (!open) { setMovingSubCategory(null); setMoveTargetId(''); } }}>
        <DialogContent className="sm:max-w-sm rounded-3xl border-none shadow-2xl p-0 overflow-hidden">
          <div className="bg-blue-600 p-5 text-white">
            <DialogTitle className="text-base font-black uppercase tracking-tight">Déplacer la catégorie</DialogTitle>
            <p className="text-blue-200 text-[10px] font-bold uppercase tracking-widest mt-1">{movingSubCategory?.name}</p>
          </div>
          <div className="p-5 space-y-4">
            <div className="space-y-1.5">
              <Label className="text-[10px] font-black text-stone-400 uppercase tracking-widest">Nouveau Pôle</Label>
              <Select value={moveTargetId} onValueChange={setMoveTargetId}>
                <SelectTrigger className="h-11 border-stone-200 bg-white font-bold rounded-xl">
                  <SelectValue placeholder="Choisir un pôle..." />
                </SelectTrigger>
                <SelectContent>
                  {generalCategories
                    .filter(gc => gc.id !== movingSubCategory?.generalCategoryId)
                    .map(gc => (
                      <SelectItem key={gc.id} value={gc.id} className="font-bold uppercase">{gc.name}</SelectItem>
                    ))}
                </SelectContent>
              </Select>
            </div>
            <div className="flex gap-2">
              <Button variant="ghost" className="flex-1 h-10 font-black text-[9px] uppercase tracking-widest" onClick={() => { setMovingSubCategory(null); setMoveTargetId(''); }}>Annuler</Button>
              <Button
                className="flex-[1.5] h-10 bg-blue-600 hover:bg-blue-700 text-white font-black text-[9px] uppercase tracking-widest rounded-xl shadow-lg"
                disabled={!moveTargetId}
                onClick={() => {
                  if (!user || !firestore || !movingSubCategory || !moveTargetId) return;
                  const docRef = doc(firestore, 'users', user.uid, 'categories', movingSubCategory.id);
                  updateDocumentNonBlocking(docRef, { generalCategoryId: moveTargetId });
                  const catArticles = articles.filter(a => a.categoryId === movingSubCategory.name);
                  catArticles.forEach(a => {
                    const aRef = doc(firestore, 'users', user.uid, 'articles', a.id);
                    updateDocumentNonBlocking(aRef, { generalCategoryId: moveTargetId });
                  });
                  const targetPole = generalCategories.find(gc => gc.id === moveTargetId);
                  toast({ title: '✅ Catégorie déplacée', description: `${movingSubCategory.name} → ${targetPole?.name || moveTargetId}` });
                  setMovingSubCategory(null);
                  setMoveTargetId('');
                }}
              >
                Déplacer
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      </>
    );
  }

  return (
    <div className="space-y-10 animate-in fade-in duration-700">
      <AlertDialog open={deleteConfirm.open} onOpenChange={(o) => !o && setDeleteConfirm({open: false})}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Confirmer la suppression</AlertDialogTitle>
            <AlertDialogDescription>
              Supprimer définitivement "{deleteConfirm.name}" ? Cette action est irréversible.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Annuler</AlertDialogCancel>
            <AlertDialogAction onClick={() => {
              if (deleteConfirm.id) {
                const docRef = doc(firestore, 'users', user?.uid || '', 'categories', deleteConfirm.id);
                deleteDocumentNonBlocking(docRef);
                toast({ title: "Famille supprimée", description: deleteConfirm.name });
              }
            }} className="bg-red-600 hover:bg-red-700">
              Supprimer
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* ── Modal changer de Ligne de production (pour GeneralCategory) ── */}
      <Dialog open={!!movingGeneralCategory} onOpenChange={open => { if (!open) { setMovingGeneralCategory(null); setMoveTargetId(''); } }}>
        <DialogContent className="sm:max-w-sm rounded-3xl border-none shadow-2xl p-0 overflow-hidden">
          <div className="bg-blue-600 p-5 text-white">
            <DialogTitle className="text-base font-black uppercase tracking-tight">Changer de Ligne de Production</DialogTitle>
            <p className="text-blue-200 text-[10px] font-bold uppercase tracking-widest mt-1">{movingGeneralCategory?.name}</p>
          </div>
          <div className="p-5 space-y-4">
            <div className="space-y-1.5">
              <Label className="text-[10px] font-black text-stone-400 uppercase tracking-widest">Nouvelle Ligne</Label>
              <Select value={moveTargetId} onValueChange={setMoveTargetId}>
                <SelectTrigger className="h-11 border-stone-200 bg-white font-bold rounded-xl">
                  <SelectValue placeholder="Choisir une ligne..." />
                </SelectTrigger>
                <SelectContent>
                  {["Fabric", "Slider et puller", "Zipper", "Bouton", "Reste"].map(pole => (
                    <SelectItem key={pole} value={pole} className="font-bold uppercase">{pole}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="flex gap-2">
              <Button variant="ghost" className="flex-1 h-10 font-black text-[9px] uppercase tracking-widest" onClick={() => { setMovingGeneralCategory(null); setMoveTargetId(''); }}>Annuler</Button>
              <Button
                className="flex-[1.5] h-10 bg-blue-600 hover:bg-blue-700 text-white font-black text-[9px] uppercase tracking-widest rounded-xl shadow-lg"
                disabled={!moveTargetId}
                onClick={() => {
                  if (!user || !firestore || !movingGeneralCategory || !moveTargetId) return;
                  const docRef = doc(firestore, 'users', user.uid, 'generalCategories', movingGeneralCategory.id);
                  updateDocumentNonBlocking(docRef, { line: moveTargetId });
                  toast({ title: '✅ Ligne modifiée', description: `${movingGeneralCategory.name} → ${moveTargetId}` });
                  setMovingGeneralCategory(null);
                  setMoveTargetId('');
                }}
              >
                Déplacer
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      <header className="bg-stone-900 p-8 rounded-[2.5rem] shadow-2xl relative overflow-hidden">
        <div className="absolute top-0 right-0 w-[500px] h-[500px] bg-amber-500/5 rounded-full -translate-y-1/2 translate-x-1/2 blur-[100px]" />
        <div className="relative z-10">
          <Badge className="bg-amber-500 text-white border-none px-4 py-1 text-[9px] font-black uppercase tracking-widest rounded-full mb-4">Architecture de Données</Badge>
          <h2 className="text-4xl font-black text-white uppercase tracking-tighter leading-tight">Répertoire <br /><span className="text-amber-500">Logistique</span></h2>
          <p className="text-stone-400 text-xs font-medium mt-3 max-sm leading-relaxed">Exploration granulaire des stocks et flux financiers par pôle d'activité.</p>
        </div>
      </header>

      <div className="space-y-12">
        {organizedCategories.map((group, groupIdx) => (
          <div key={groupIdx} className="space-y-5">
            <h3 className="text-xl font-black text-stone-900 uppercase tracking-tighter flex items-center gap-3">
              <div className="w-2 h-6 bg-amber-500 rounded-full" />
              {group.title}
            </h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-6">
              {group.items.map(({ id, stat }, idx) => (
                <Card 
                  key={id} 
                  className="group cursor-pointer border-none bg-white shadow-xl hover:shadow-2xl transition-all rounded-[1.5rem] overflow-hidden active:scale-95 status-glow-amber"
                  onClick={() => onSelectGeneralCategory(id)}
                >
                  <div className={`h-1.5 w-full`} style={{ backgroundColor: UI_COLORS[idx % UI_COLORS.length] }} />
                  <CardContent className="p-6">
                    <div className="flex justify-between items-center mb-6">
                      <div className="p-3 bg-stone-50 rounded-xl text-stone-200 group-hover:bg-stone-900 group-hover:text-white transition-all">
                        <LayoutGrid className="w-6 h-6" />
                      </div>
                      <div className="text-right">
                        <p className="text-xl font-black text-stone-900">{stat.count}</p>
                        <p className="text-[8px] font-black text-stone-400 uppercase tracking-widest">Articles</p>
                      </div>
                    </div>
                    <h3 className="text-sm font-black text-stone-800 uppercase leading-none mb-6 group-hover:text-stone-900 tracking-tighter">{stat.name}</h3>
                    <div className="space-y-2 pt-5 border-t border-stone-50">
                      <div className="flex justify-between items-center text-[9px]">
                        <span className="text-stone-400 font-black uppercase flex items-center gap-1">
                          <Truck className="w-2.5 h-2.5" /> PROCHAINE
                        </span>
                        <span className={`font-black ${stat.nextArrival !== '-' ? 'text-blue-600' : 'text-stone-300'}`}>
                          {stat.nextArrival}
                        </span>
                      </div>
                      <div className="flex justify-between items-center text-[9px]">
                        <span className="text-stone-400 font-black uppercase flex items-center gap-1">
                          <DollarSign className="w-2.5 h-2.5" /> VALEUR TOTALE
                        </span>
                        <span className="font-black text-stone-800">
                          {Number(stat.totalValue).toLocaleString('en-US', { maximumFractionDigits: 3 })} $
                        </span>
                      </div>
                    </div>
                    <div className="mt-6 flex justify-between items-center">
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7 text-stone-300 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-all opacity-0 group-hover:opacity-100"
                        title="Déplacer vers un autre pôle"
                        onClick={(e) => { e.stopPropagation(); const catObj = generalCategories.find(gc => gc.id === id); if (catObj) setMovingCategory(catObj); }}
                      >
                        <ArrowRightLeft className="w-3.5 h-3.5" />
                      </Button>
                      <div className="p-1.5 bg-stone-50 rounded opacity-0 group-hover:opacity-100 transition-all translate-x-2 group-hover:translate-x-0">
                        <ArrowUpRight className="w-3.5 h-3.5 text-stone-900" />
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
