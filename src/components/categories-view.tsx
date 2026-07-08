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
  ArrowUpFromLine
} from 'lucide-react';
import EditOrderModal from './edit-order-modal';
import DesignLibrary from './design-library';
import { 
  BarChart, Bar, XAxis, YAxis, Tooltip as RechartsTooltip, ResponsiveContainer, 
  Cell, PieChart, Pie, Legend, LineChart, Line, CartesianGrid
} from 'recharts';
import { useUser, useFirestore, deleteDocumentNonBlocking, updateDocumentNonBlocking } from '@/firebase';
import { computeEffectiveStatus } from '@/lib/status-utils';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { doc } from 'firebase/firestore';
import { getStorage, ref as storageRef, uploadBytesResumable, getDownloadURL, deleteObject } from 'firebase/storage';
import { getApp } from 'firebase/app';
import { useToast } from '@/hooks/use-toast';
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
function FicheStock({ article: a, color, pct, entriesIN, entriesOUT, factures }: {
  article: any; color: string; pct: number;
  entriesIN: any[]; entriesOUT: any[]; factures: any[];
}) {
  const { firestore, user } = useFirebase();
  const [open, setOpen] = React.useState(false);
  const [overridesCache, setOverridesCache] = React.useState<Record<string, any>>({});
  const [loadingOverrides, setLoadingOverrides] = React.useState(false);
  const totalIn  = a.initialQty + a.mouvementsIn;
  const totalOut = a.mouvementsOut;

  React.useEffect(() => {
    if (!open || !firestore || !user || entriesIN.length === 0) return;
    const factureIds = Array.from(new Set(entriesIN.map(mv => mv.factureId).filter(Boolean)));
    if (factureIds.length === 0) return;

    let mounted = true;
    setLoadingOverrides(true);
    const fetchOverrides = async () => {
      const cache: Record<string, any> = {};
      try {
        await Promise.all(
          factureIds.map(async (fid: string) => {
            const snap = await getDoc(doc(firestore, 'users', user.uid, 'dp_declarations', fid));
            if (snap.exists() && snap.data().overrides) {
              cache[fid] = snap.data().overrides;
            }
          })
        );
        if (mounted) setOverridesCache(cache);
      } catch (e) {
        console.error(e);
      } finally {
        if (mounted) setLoadingOverrides(false);
      }
    };
    fetchOverrides();
    return () => { mounted = false; };
  }, [open, firestore, user, entriesIN]);

  return (
    <div className="bg-white rounded-2xl shadow-md border border-stone-100 overflow-hidden transition-all duration-300">
      {/* ── En-tête produit (toujours visible) ── */}
      <button
        onClick={() => setOpen(o => !o)}
        className="w-full text-left"
      >
        {/* barre couleur */}
        <div className="h-1 w-full" style={{ backgroundColor: color }} />
        <div className="flex items-center gap-4 px-5 py-4">

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

            {/* Chevron */}
            <div className={`w-7 h-7 rounded-xl border border-stone-200 flex items-center justify-center transition-transform duration-300 ${open ? 'rotate-180 bg-stone-900 border-stone-900' : 'bg-white'}`}>
              <ChevronDown className={`w-4 h-4 ${open ? 'text-white' : 'text-stone-400'}`} />
            </div>
          </div>
        </div>
      </button>

      {/* ── Détail historique (déplié) ── */}
      {open && (
        <div className="border-t border-stone-100 bg-stone-50/60 px-5 py-4 space-y-5 animate-in slide-in-from-top-2 duration-200">

          {/* ENTRÉES */}
          <div>
            <div className="flex items-center gap-2 mb-3 justify-between">
              <div className="flex items-center gap-2">
                <div className="w-5 h-5 rounded-lg bg-emerald-100 flex items-center justify-center">
                  <ArrowDownToLine className="w-3 h-3 text-emerald-600" />
                </div>
                <p className="text-[9px] font-black text-stone-600 uppercase tracking-widest">Entrées en stock — {entriesIN.length} arrivage{entriesIN.length > 1 ? 's' : ''}</p>
              </div>
              {loadingOverrides && (
                <div className="flex items-center gap-1.5 text-[8px] font-black text-stone-400 uppercase tracking-widest animate-pulse">
                  <Loader2 className="w-3 h-3 animate-spin" /> Vérification Douane
                </div>
              )}
            </div>
            {entriesIN.length === 0 ? (
              <p className="text-[9px] text-stone-300 font-bold pl-7">Aucune entrée enregistrée</p>
            ) : (
              <div className="space-y-2">
                {entriesIN.map((mv, i) => {
                  const facture = factures.find((f: any) => f.id === mv.factureId);
                  const hasCost = mv.purchasePriceMAD != null && mv.purchasePriceMAD > 0;
                  const articleOverrides = (mv.factureId && mv.articleId) ? overridesCache[mv.factureId]?.[mv.articleId] : null;
                  const hasOverride = articleOverrides && Object.keys(articleOverrides).length > 0;

                  return (
                    <div key={i} className="flex flex-col gap-2 bg-white rounded-xl px-4 py-3 border border-emerald-100 shadow-sm">
                      <div className="flex items-center gap-3">
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
                      
                      {hasOverride && (
                        <div className="ml-5 mt-1 pt-2 border-t border-stone-50 flex items-center gap-2">
                          <span className="flex items-center gap-1 bg-red-50 text-red-600 text-[8px] font-black uppercase tracking-widest px-2 py-0.5 rounded border border-red-100">
                            Fausse Déclaration (Override)
                          </span>
                          {articleOverrides.customsValuePerKg && (
                            <span className="text-[9px] font-bold text-stone-500">Val. Douane: {articleOverrides.customsValuePerKg} MAD/kg</span>
                          )}
                          {articleOverrides.netWeight && (
                            <span className="text-[9px] font-bold text-stone-500">Poids Net: {articleOverrides.netWeight} kg</span>
                          )}
                        </div>
                      )}
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
  
  const [expandedStockItems, setExpandedStockItems] = useState<Set<string>>(new Set());
  
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
    tvaRate: ''
  });

  useEffect(() => {
    if (currentCategoryObj && isCustomsModalOpen) {
      setCustomsForm({
        hsCode: currentCategoryObj.hsCode || '',
        customsValuePerKg: currentCategoryObj.customsValuePerKg ?? '',
        importDutyRate: currentCategoryObj.importDutyRate ?? '',
        tpiRate: currentCategoryObj.tpiRate ?? '',
        ticRate: currentCategoryObj.ticRate ?? '',
        tvaRate: currentCategoryObj.tvaRate ?? ''
      });
    }
  }, [currentCategoryObj, isCustomsModalOpen]);

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
    if (window.confirm(`Supprimer définitivement la famille "${name}" ?`)) {
      const docRef = doc(firestore, 'users', user.uid, 'categories', id);
      deleteDocumentNonBlocking(docRef);
      toast({ title: "Famille supprimée", description: name });
    }
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
    
    const productsSet = new Set<string>();
    currentArticles.forEach(a => {
      if (allowedSizes && !allowedSizes.includes(a.size)) return;

      const parts = [];
      const isTechnical = isTechnicalZipper(a.categoryId);
      
      if (a.size) parts.push(a.size);
      
      if (isTechnical) {
        if (a.zipperType) parts.push(a.zipperType);
        if (a.slider) parts.push(a.slider);
      }
      
      if (a.color) parts.push(a.color.toUpperCase());
      
      const key = parts.length > 0 ? parts.join(' - ') : 'DIVERS';
      productsSet.add(key);
    });
    const uniqueProducts = Array.from(productsSet);

    const dateGroups: Record<string, any> = {};
    currentArticles.forEach(a => {
      const date = a.orderDate || (a.createdAt ? new Date(a.createdAt.seconds * 1000).toISOString().split('T')[0] : null);
      if (!date) return;

      if (allowedSizes && !allowedSizes.includes(a.size)) return;

      if (!dateGroups[date]) dateGroups[date] = { date };
      
      const parts = [];
      const isTechnical = isTechnicalZipper(a.categoryId);
      
      if (a.size) parts.push(a.size);
      
      if (isTechnical) {
        if (a.zipperType) parts.push(a.zipperType);
        if (a.slider) parts.push(a.slider);
      }
      
      if (a.color) parts.push(a.color.toUpperCase());
      
      const productKey = parts.length > 0 ? parts.join(' - ') : 'DIVERS';
      
      dateGroups[date][productKey] = Number(a.purchasePricePerUnit) || 0;
    });

    const priceData = Object.values(dateGroups).sort((a, b) => a.date.localeCompare(b.date));

    return { statusValue, quantityData, priceData, uniqueProducts, supplierDistribution };
  }, [selectedCategory, currentArticles, groupedData, todayStr]);

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
      g.items.sort((a, b) => (a.stat.name || '').localeCompare(b.stat.name || ''));
    });

    return result.filter(g => g.items.length > 0);
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

        {/* ── Design Library — Zipper / Slider / Puller ── */}
        {currentCategoryObj && (isTechnicalZipper(selectedCategory) || (selectedCategory || '').toUpperCase().includes('SLIDER') || (selectedCategory || '').toUpperCase().includes('PULLER')) && (
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
                <TrendingUp className="w-3 h-3 text-blue-500" /> Évolution Prix par Variante ($)
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
          <DialogContent className="max-w-md rounded-[1.5rem] p-0 border-none overflow-hidden">
            <div className="bg-amber-600 p-6 text-white">
              <DialogTitle className="text-lg font-black uppercase tracking-tight">Informations Douanières</DialogTitle>
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
              </div>
            </div>
            <DialogFooter className="p-6 bg-stone-50 gap-3">
              <Button variant="ghost" onClick={() => setIsCustomsModalOpen(false)} className="h-10 font-black uppercase text-[9px] tracking-widest flex-1">Annuler</Button>
              <Button onClick={handleUpdateCustoms} className="h-10 bg-amber-600 hover:bg-amber-700 text-white font-black uppercase text-[9px] tracking-widest rounded-xl flex-[1.5] shadow-lg shadow-amber-200">Enregistrer</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
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
      </>
    );
  }

  return (
    <div className="space-y-10 animate-in fade-in duration-700">
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
                    <div className="mt-6 flex justify-end">
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
