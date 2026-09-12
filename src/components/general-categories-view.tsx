"use client";

import React, { useState, useMemo } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Layers, Plus, Trash2, ArrowRight, FolderSearch, PlusCircle,
  Truck, DollarSign, TrendingUp, Package, Search, BarChart3, ChevronRight,
  ArrowRightLeft, Pencil
} from 'lucide-react';
import { useUser, useFirestore, setDocumentNonBlocking, deleteDocumentNonBlocking, updateDocumentNonBlocking } from '@/firebase';
import { doc } from 'firebase/firestore';
import { useToast } from '@/hooks/use-toast';
import { GeneralCategory, Category } from '@/lib/types';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from '@/components/ui/alert-dialog';

interface GeneralCategoriesViewProps {
  articles: any[];
  generalCategories: GeneralCategory[];
  subCategories: Category[];
  onSelectGeneralCategory: (id: string) => void;
}

const LINE_COLORS: Record<string, string> = {
  'Fabric':          '#8B5CF6',
  'Slider et puller':'#3B82F6',
  'Zipper':          '#F59E0B',
  'Thread':          '#0D9488',
  'Bouton':          '#10B981',
  'Reste':           '#6B7280',
};

const UI_COLORS = ['#CC8626', '#1E293B', '#3B82F6', '#10B981', '#6366F1', '#F43F5E', '#8B5CF6', '#EC4899', '#0D9488'];

const GROUPS_ORDER = [
  { title: 'Fabric',           keywords: ['fabric','non woven','t/c fabric','popeline','leather','felt fabric','polyester fabric','taffeta fabric','woven interlining'] },
  { title: 'Slider et puller', keywords: ['puller','slider for nylon zipper','slider for plastic zipper','slider for metal zipper'] },
  { title: 'Zipper',           keywords: ['zipper','plastic zipper','nylon zipper','metal zipper','zipper long chain','nylon zipper long chain'] },
  { title: 'Thread',           keywords: ['thread','sewing thread','fil','fil à coudre','cone','cône','yarn','elastic thread','spun polyester'] },
  { title: 'Bouton',           keywords: ['covered mould button','snap button','button'] },
  { title: 'Reste',            keywords: ['ruban','tape','rope','tack pin','hook and loop','divers','opp bag'], isFallback: true },
];

export default function GeneralCategoriesView({ articles = [], generalCategories, subCategories, onSelectGeneralCategory }: GeneralCategoriesViewProps) {
  const { user } = useUser();
  const firestore = useFirestore();
  const { toast } = useToast();

  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isSubModalOpen, setIsSubModalOpen] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');

  const [newCatName, setNewCatName] = useState('');
  const [newCatNameFR, setNewCatNameFR] = useState('');
  const [newCatLine, setNewCatLine] = useState('');
  const [newCatSpecType, setNewCatSpecType] = useState<'fabric' | 'zipper' | 'thread' | 'slider' | 'tape' | 'none'>('fabric');
  const [newSubName, setNewSubName] = useState('');
  const [newSubNameFR, setNewSubNameFR] = useState('');
  const [newSubHsCode, setNewSubHsCode] = useState('');
  const [newSubCustomsValue, setNewSubCustomsValue] = useState<number | ''>('');
  const [newSubDutyRate, setNewSubDutyRate] = useState<number | ''>('');
  const [newSubTpiRate, setNewSubTpiRate] = useState<number | ''>('');
  const [newSubTvaRate, setNewSubTvaRate] = useState<number | ''>('');
  const [targetGenCatId, setTargetGenCatId] = useState<string | null>(null);
  const [deleteConfirm, setDeleteConfirm] = useState<{open: boolean; id?: string; name?: string}>({open: false});
  const [movingPole, setMovingPole] = useState<GeneralCategory | null>(null);
  const [moveTargetLine, setMoveTargetLine] = useState('');
  const [editingPole, setEditingPole] = useState<GeneralCategory | null>(null);
  const [editPoleName, setEditPoleName] = useState('');
  const [editPoleNameFR, setEditPoleNameFR] = useState('');
  const [editPoleLine, setEditPoleLine] = useState('');
  const [editPoleSpecType, setEditPoleSpecType] = useState<'fabric' | 'zipper' | 'thread' | 'slider' | 'tape' | 'none'>('fabric');

  const now = new Date();

  const groupStats = useMemo(() => {
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
        .filter(a => a.status === 'SHIPPED' && a.arrivalDate && new Date(a.arrivalDate) > now)
        .map(a => new Date(a.arrivalDate as string).getTime());

      const nextArrival = futureArrivals.length > 0
        ? new Date(Math.min(...futureArrivals)).toISOString().split('T')[0]
        : '-';

      const activeArticles = groupArticles.filter(a => a.status === 'SHIPPED' || a.status === 'PI').length;

      groupArticles.forEach(a => {
        totalValue += (Number(a.quantity) || 0) * (Number(a.purchasePricePerUnit) || 0);
      });

      stats[gc.id] = {
        name: gc.name,
        count: subCatNames.length,
        articleCount: groupArticles.length,
        activeArticles,
        nextArrival,
        totalValue,
        line: (gc as any).line,
      };
    });
    return stats;
  }, [generalCategories, articles, subCategories]);

  // Global KPIs
  const globalKPIs = useMemo(() => {
    const totalValue = Object.values(groupStats).reduce((s: number, st: any) => s + st.totalValue, 0);
    const totalGroups = generalCategories.length;
    const totalFamilies = subCategories.length;
    const activeLines = Object.values(groupStats).filter((st: any) => st.nextArrival !== '-').length;
    return { totalValue, totalGroups, totalFamilies, activeLines };
  }, [groupStats, generalCategories, subCategories]);

  const organizedCategories = useMemo(() => {
    const result = GROUPS_ORDER.map(g => ({ ...g, items: [] as { gc: GeneralCategory; stats: any }[] }));
    const customGroupsMap = new Map<string, any>();

    const lowerSearch = searchTerm.toLowerCase();

    generalCategories.forEach(gc => {
      if (lowerSearch && !gc.name.toLowerCase().includes(lowerSearch)) return;

      const catName = (gc.name || '').toLowerCase().trim();
      const explicitLine = (gc as any).line;
      let matched = false;

      if (explicitLine) {
        const group = result.find(g => g.title === explicitLine);
        if (group) { 
          group.items.push({ gc, stats: groupStats[gc.id] }); 
          matched = true; 
        } else {
          if (!customGroupsMap.has(explicitLine)) {
            customGroupsMap.set(explicitLine, { title: explicitLine, keywords: [], items: [] });
          }
          customGroupsMap.get(explicitLine).items.push({ gc, stats: groupStats[gc.id] });
          matched = true;
        }
      }

      if (!matched) {
        for (const group of result) {
          if (group.keywords.includes(catName)) {
            group.items.push({ gc, stats: groupStats[gc.id] });
            matched = true;
            break;
          }
        }
      }
      if (!matched) {
        const fallback = result.find(g => g.isFallback);
        if (fallback) fallback.items.push({ gc, stats: groupStats[gc.id] });
      }
    });

    const allGroups = [...result, ...Array.from(customGroupsMap.values())];
    const filtered = allGroups.filter(g => g.items.length > 0);
    filtered.sort((a, b) => {
      const aTotal = a.items.reduce((s: number, i: any) => s + (i.stats?.totalValue || 0), 0);
      const bTotal = b.items.reduce((s: number, i: any) => s + (i.stats?.totalValue || 0), 0);
      return bTotal - aTotal;
    });
    return filtered;
  }, [generalCategories, groupStats, searchTerm]);

  // Dynamically compute all available lines for the modal
  const availableLines = useMemo(() => {
    const lines = new Set(Object.keys(LINE_COLORS));
    generalCategories.forEach(gc => {
      if ((gc as any).line) lines.add((gc as any).line);
    });
    return Array.from(lines);
  }, [generalCategories]);

  // Max value for relative bar width
  const maxValue = useMemo(() => {
    return Math.max(...Object.values(groupStats).map((s: any) => s.totalValue || 0), 1);
  }, [groupStats]);

  const handleAddGeneralCategory = () => {
    if (!user || !firestore || !newCatName.trim() || !newCatLine) return;
    const id = crypto.randomUUID();
    const docRef = doc(firestore, 'users', user.uid, 'generalCategories', id);
    const data: any = { id, name: newCatName.trim().toUpperCase() };
    if (newCatNameFR.trim()) data.nameFR = newCatNameFR.trim().toUpperCase();
    if (newCatLine) data.line = newCatLine;

    let finalSpec = newCatSpecType;
    const lineLower = newCatLine.toLowerCase();
    const nameLower = newCatName.toLowerCase();
    if (lineLower.includes('slider') || lineLower.includes('puller') || lineLower.includes('curseur') || nameLower.includes('slider') || nameLower.includes('puller') || nameLower.includes('curseur')) {
      if (finalSpec !== 'none') finalSpec = 'slider';
    } else if (lineLower === 'zipper' || lineLower.includes('zipper') || lineLower.includes('fermeture') || nameLower.includes('zipper')) {
      if (finalSpec !== 'none') finalSpec = 'zipper';
    } else if (lineLower === 'fabric' || lineLower.includes('fabric') || lineLower.includes('tissu') || nameLower.includes('fabric') || nameLower.includes('popeline')) {
      if (finalSpec !== 'none') finalSpec = 'fabric';
    } else if (lineLower === 'thread' || lineLower.includes('thread') || lineLower.includes('fil') || nameLower.includes('thread') || nameLower.includes('fil')) {
      if (finalSpec !== 'none') finalSpec = 'thread';
    } else if (lineLower.includes('tape') || lineLower.includes('ruban') || lineLower.includes('ribbon') || lineLower.includes('sangle') || nameLower.includes('tape') || nameLower.includes('ruban') || nameLower.includes('sangle')) {
      if (finalSpec !== 'none') finalSpec = 'tape';
    }
    data.specType = finalSpec;

    setDocumentNonBlocking(docRef, data, { merge: true });
    toast({ title: 'Pôle logistique créé' });
    setNewCatName(''); setNewCatNameFR(''); setNewCatLine(''); setNewCatSpecType('none'); setIsModalOpen(false);
  };

  const handleAddSubCategory = () => {
    if (!user || !firestore || !newSubName.trim() || !targetGenCatId) return;
    const id = crypto.randomUUID();
    const docRef = doc(firestore, 'users', user.uid, 'categories', id);
    const catData: any = { id, name: newSubName.trim().toUpperCase(), generalCategoryId: targetGenCatId };
    if (newSubNameFR.trim()) catData.nameFR = newSubNameFR.trim().toUpperCase();
    if (newSubHsCode) catData.hsCode = newSubHsCode;
    if (newSubCustomsValue !== '') catData.customsValuePerKg = Number(newSubCustomsValue);
    if (newSubDutyRate !== '') catData.importDutyRate = Number(newSubDutyRate);
    if (newSubTpiRate !== '') catData.tpiRate = Number(newSubTpiRate);
    if (newSubTvaRate !== '') catData.tvaRate = Number(newSubTvaRate);
    setDocumentNonBlocking(docRef, catData, { merge: true });
    toast({ title: 'Sous-catégorie ajoutée' });
    setNewSubName(''); setNewSubNameFR(''); setNewSubHsCode(''); setNewSubCustomsValue('');
    setNewSubDutyRate(''); setNewSubTpiRate(''); setNewSubTvaRate('');
    setTargetGenCatId(null); setIsSubModalOpen(false);
  };

  const handleDelete = (e: React.MouseEvent, id: string, name: string) => {
    e.stopPropagation();
    if (!user || !firestore) return;
    setDeleteConfirm({ open: true, id, name });
  };

  const openSubModal = (e: React.MouseEvent, genCatId: string) => {
    e.stopPropagation();
    setTargetGenCatId(genCatId);
    setIsSubModalOpen(true);
  };

  const handleSavePole = () => {
    if (!user || !firestore || !editingPole) return;
    const oldName = editingPole.name;
    const newName = (editPoleName.trim() || oldName).toUpperCase();
    const nameFR = editPoleNameFR.trim() ? editPoleNameFR.trim().toUpperCase() : null;
    const docRef = doc(firestore, 'users', user.uid, 'generalCategories', editingPole.id);
    const updateData: any = { name: newName, nameFR };
    if (editPoleLine) updateData.line = editPoleLine;

    let finalSpec = editPoleSpecType;
    const lineLower = (editPoleLine || '').toLowerCase();
    const nameLower = newName.toLowerCase();
    if (lineLower.includes('slider') || lineLower.includes('puller') || lineLower.includes('curseur') || nameLower.includes('slider') || nameLower.includes('puller') || nameLower.includes('curseur')) {
      if (finalSpec !== 'none') finalSpec = 'slider';
    } else if (lineLower === 'zipper' || lineLower.includes('zipper') || lineLower.includes('fermeture') || nameLower.includes('zipper')) {
      if (finalSpec !== 'none') finalSpec = 'zipper';
    } else if (lineLower === 'fabric' || lineLower.includes('fabric') || lineLower.includes('tissu') || nameLower.includes('fabric') || nameLower.includes('popeline')) {
      if (finalSpec !== 'none') finalSpec = 'fabric';
    } else if (lineLower === 'thread' || lineLower.includes('thread') || lineLower.includes('fil') || nameLower.includes('thread') || nameLower.includes('fil')) {
      if (finalSpec !== 'none') finalSpec = 'thread';
    } else if (lineLower.includes('tape') || lineLower.includes('ruban') || lineLower.includes('ribbon') || lineLower.includes('sangle') || nameLower.includes('tape') || nameLower.includes('ruban') || nameLower.includes('sangle')) {
      if (finalSpec !== 'none') finalSpec = 'tape';
    }
    updateData.specType = finalSpec;

    updateDocumentNonBlocking(docRef, updateData);
    toast({ title: '✅ Pôle enregistré', description: `${newName}${nameFR ? ` · FR: ${nameFR}` : ''}` });
    setEditingPole(null);
    setEditPoleName('');
    setEditPoleNameFR('');
    setEditPoleLine('');
  };

  return (
    <div className="space-y-8 fade-in">
      {/* ── Header ── */}
      <div className="bg-stone-900 rounded-[2rem] p-8 shadow-2xl relative overflow-hidden">
        <div className="absolute top-0 right-0 w-[500px] h-[500px] bg-amber-500/8 rounded-full -translate-y-1/2 translate-x-1/2 blur-[120px] pointer-events-none" />
        <div className="relative z-10 flex flex-col lg:flex-row justify-between items-start lg:items-center gap-6">
          <div>
            <p className="text-[10px] font-black text-amber-500 uppercase tracking-[0.25em] mb-2">Vue Consolidée</p>
            <h1 className="text-3xl font-black text-white uppercase tracking-tighter leading-none">
              Architecture<br /><span className="text-amber-500">Logistique</span>
            </h1>
            <p className="text-stone-400 text-xs font-medium mt-3 max-w-sm">
              Pôles d'activité, familles produits et flux financiers consolidés.
            </p>
          </div>

          {/* Global KPIs */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 w-full lg:w-auto">
            {[
              { label: 'Pôles', value: globalKPIs.totalGroups, icon: BarChart3, color: 'text-amber-400' },
              { label: 'Familles', value: globalKPIs.totalFamilies, icon: Layers, color: 'text-blue-400' },
              { label: 'Flux Actifs', value: globalKPIs.activeLines, icon: Truck, color: 'text-emerald-400' },
              { label: 'Valeur Totale', value: `${(globalKPIs.totalValue / 1000).toFixed(1)}k $`, icon: DollarSign, color: 'text-violet-400' },
            ].map(({ label, value, icon: Icon, color }) => (
              <div key={label} className="bg-white/5 border border-white/10 rounded-xl p-4 backdrop-blur-md text-center">
                <Icon className={`w-4 h-4 ${color} mx-auto mb-2`} />
                <p className={`text-lg font-black ${color} leading-none`}>{value}</p>
                <p className="text-[8px] font-black text-stone-500 uppercase tracking-widest mt-1">{label}</p>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* ── Toolbar ── */}
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
        <div className="relative flex-1 max-w-xs">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-stone-400" />
          <Input
            placeholder="Rechercher un pôle..."
            value={searchTerm}
            onChange={e => setSearchTerm(e.target.value)}
            className="pl-9 h-10 text-[10px] font-bold border-stone-200 bg-white rounded-xl focus:ring-stone-900 transition-all"
          />
        </div>
        <Button
          onClick={() => setIsModalOpen(true)}
          className="bg-amber-500 hover:bg-amber-600 text-white px-5 h-10 rounded-xl shadow-lg shadow-amber-500/20 flex items-center gap-2 text-[10px] uppercase font-black tracking-widest transition-all hover:scale-105 active:scale-95"
        >
          <Plus className="w-3.5 h-3.5" /> Nouveau Pôle
        </Button>
      </div>

      {/* ── Content ── */}
      <div className="space-y-12">
        {generalCategories.length === 0 ? (
          <div className="py-24 text-center border-2 border-dashed border-stone-100 rounded-[2rem] bg-white/50">
            <FolderSearch className="w-12 h-12 text-stone-200 mx-auto mb-4" />
            <p className="text-stone-300 font-black uppercase tracking-[0.2em] text-[9px]">Aucun pôle configuré</p>
            <p className="text-stone-200 text-xs mt-2">Créez votre premier pôle logistique</p>
          </div>
        ) : organizedCategories.length === 0 ? (
          <div className="py-16 text-center text-stone-300 font-black uppercase text-[10px] tracking-widest">
            Aucun résultat pour « {searchTerm} »
          </div>
        ) : (
          organizedCategories.map((group, groupIdx) => {
            const lineColor = LINE_COLORS[group.title] || UI_COLORS[group.title.length % UI_COLORS.length];
            const groupTotal = group.items.reduce((s, { stats }) => s + (stats?.totalValue || 0), 0);

            return (
              <div key={groupIdx} className="space-y-4">
                {/* Section header */}
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="w-1.5 h-6 rounded-full" style={{ backgroundColor: lineColor }} />
                    <h3 className="text-lg font-black text-stone-950 uppercase tracking-tighter">{group.title}</h3>
                    <span className="text-[8px] font-black text-stone-900 bg-stone-200 px-2 py-0.5 rounded-full uppercase">
                      {group.items.length} pôles
                    </span>
                  </div>
                  <span className="text-[10px] font-black text-stone-500 uppercase">
                    {groupTotal.toLocaleString('en-US', { maximumFractionDigits: 0 })} $
                  </span>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4">
                  {group.items.map(({ gc, stats }, index) => {
                    const color = UI_COLORS[(groupIdx * 3 + index) % UI_COLORS.length];
                    const barWidth = maxValue > 0 ? Math.max(4, (stats.totalValue / maxValue) * 100) : 4;
                    const hasArrival = stats.nextArrival !== '-';

                    return (
                      <Card
                        key={gc.id}
                        onClick={() => onSelectGeneralCategory(gc.id)}
                        className="group cursor-pointer border-none bg-white shadow-md hover:shadow-xl transition-all duration-300 rounded-[1.2rem] overflow-hidden active:scale-95 relative"
                        style={{ '--card-color': color } as any}
                      >
                        {/* Top accent bar */}
                        <div className="h-1 w-full" style={{ backgroundColor: color }} />

                        <CardContent className="p-4">
                          {/* Action buttons */}
                          <div className="flex justify-between items-start mb-3">
                            <div
                              className="p-2 rounded-lg transition-all group-hover:text-white"
                              style={{ backgroundColor: `${color}15`, color }}
                            >
                              <Layers className="w-3.5 h-3.5" />
                            </div>
                            <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-6 w-6 hover:bg-amber-50 rounded-lg transition-colors"
                                style={{ color }}
                                title="Ajouter une sous-catégorie"
                                onClick={(e) => openSubModal(e, gc.id)}
                              >
                                <PlusCircle className="w-3.5 h-3.5" />
                              </Button>
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-6 w-6 text-stone-400 hover:text-stone-900 hover:bg-stone-100 rounded-lg transition-colors"
                                title="Modifier le pôle"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setEditingPole(gc);
                                  setEditPoleName(gc.name || '');
                                  setEditPoleNameFR(gc.nameFR || '');
                                  setEditPoleLine((gc as any).line || '');
                                  const autoSpec = (gc as any).specType || (
                                    (gc as any).line?.toLowerCase().includes('slider') || (gc as any).line?.toLowerCase().includes('puller') || (gc as any).line?.toLowerCase().includes('curseur') ? 'slider' :
                                    (gc as any).line?.toLowerCase() === 'fabric' ? 'fabric' :
                                    (gc as any).line?.toLowerCase() === 'zipper' ? 'zipper' :
                                    (gc as any).line?.toLowerCase() === 'thread' ? 'thread' : 'none'
                                  );
                                  setEditPoleSpecType(autoSpec);
                                }}
                              >
                                <Pencil className="w-3 h-3" />
                              </Button>
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-6 w-6 text-stone-300 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
                                title="Changer de ligne"
                                onClick={(e) => { e.stopPropagation(); setMovingPole(gc); }}
                              >
                                <ArrowRightLeft className="w-3 h-3" />
                              </Button>
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-6 w-6 text-stone-200 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                                onClick={(e) => handleDelete(e, gc.id, gc.name)}
                              >
                                <Trash2 className="w-3 h-3" />
                              </Button>
                            </div>
                          </div>

                          {/* Name */}
                          <div className="min-h-[2.5rem] mb-3">
                            <h3 className="text-[12px] font-black text-stone-950 uppercase leading-tight tracking-tight group-hover:text-stone-900 line-clamp-2">
                              {gc.name}
                            </h3>
                            {gc.nameFR && (
                              <p className="text-[9px] font-bold text-stone-400 uppercase tracking-wider mt-0.5 truncate">
                                FR (Stock) : {gc.nameFR}
                              </p>
                            )}
                            <div className="flex items-center gap-1 mt-1">
                              {gc.specType === 'fabric' && <span className="px-1.5 py-0.5 rounded bg-violet-100 text-violet-700 text-[8px] font-black uppercase">🧵 Spé Fabric</span>}
                              {gc.specType === 'zipper' && <span className="px-1.5 py-0.5 rounded bg-amber-100 text-amber-700 text-[8px] font-black uppercase">⚡ Spé Zipper</span>}
                              {gc.specType === 'thread' && <span className="px-1.5 py-0.5 rounded bg-teal-100 text-teal-700 text-[8px] font-black uppercase">🪡 Spé Thread</span>}
                              {gc.specType === 'slider' && <span className="px-1.5 py-0.5 rounded bg-blue-100 text-blue-700 text-[8px] font-black uppercase">🎛️ Spé Slider</span>}
                            </div>
                          </div>

                          {/* Value progress bar */}
                          <div className="mb-3">
                            <div className="h-1 bg-stone-100 rounded-full overflow-hidden">
                              <div
                                className="h-full rounded-full transition-all duration-700"
                                style={{ width: `${barWidth}%`, backgroundColor: color }}
                              />
                            </div>
                          </div>

                          {/* Stats */}
                          <div className="pt-2 border-t border-stone-50 space-y-1.5">
                            <div className="flex justify-between items-center text-[8px]">
                              <span className="text-stone-400 font-black uppercase flex items-center gap-1">
                                <Truck className="w-2.5 h-2.5" /> PROCHAINE
                              </span>
                              <span className={`font-black ${hasArrival ? 'text-blue-600' : 'text-stone-300'}`}>
                                {stats.nextArrival}
                              </span>
                            </div>
                            <div className="flex justify-between items-center text-[8px]">
                              <span className="text-stone-400 font-black uppercase flex items-center gap-1">
                                <DollarSign className="w-2.5 h-2.5" /> VALEUR
                              </span>
                              <span className="font-black text-stone-900">
                                {Number(stats.totalValue).toLocaleString('en-US', { maximumFractionDigits: 0 })} $
                              </span>
                            </div>
                          </div>

                          {/* Footer */}
                          <div className="mt-3 flex justify-between items-center">
                            <div className="flex items-center gap-1">
                              <span className="px-2 py-0.5 bg-stone-100 rounded text-[7px] font-black text-stone-900 uppercase">
                                {stats.count} FAMILLES
                              </span>
                              {stats.activeArticles > 0 && (
                                <span className="px-2 py-0.5 rounded text-[7px] font-black uppercase" style={{ backgroundColor: `${color}15`, color }}>
                                  {stats.activeArticles} ACTIFS
                                </span>
                              )}
                            </div>
                            <div className="p-1 bg-stone-50 rounded opacity-0 group-hover:opacity-100 transition-all translate-x-2 group-hover:translate-x-0">
                              <ArrowRight className="w-2.5 h-2.5 text-stone-900" />
                            </div>
                          </div>
                        </CardContent>
                      </Card>
                    );
                  })}
                </div>
              </div>
            );
          })
        )}
      </div>

      {/* ── Modal: Nouveau Pôle ── */}
      <Dialog open={isModalOpen} onOpenChange={setIsModalOpen}>
        <DialogContent className="max-w-sm max-h-[85vh] sm:max-h-[90vh] flex flex-col gap-0 rounded-[1.5rem] p-0 border-none overflow-hidden shadow-2xl">
          <div className="bg-stone-900 p-5 sm:p-6 text-white shrink-0">
            <DialogTitle className="text-lg font-black uppercase tracking-tight">Initialiser un Pôle</DialogTitle>
            <p className="text-stone-400 text-[9px] font-bold uppercase tracking-widest mt-1">Architecture logistique haut niveau</p>
          </div>
          <div className="p-5 sm:p-6 space-y-4 flex-1 min-h-0 overflow-y-auto overscroll-contain" style={{ WebkitOverflowScrolling: 'touch', touchAction: 'pan-y' }}>
            <div className="space-y-1.5">
              <label className="text-[9px] font-black text-stone-400 uppercase tracking-widest">Désignation du Pôle (Code / Nom d'origine)</label>
              <Input
                value={newCatName}
                onChange={e => {
                  const val = e.target.value;
                  setNewCatName(val);
                  const lower = val.toLowerCase();
                  if (lower.includes('slider') || lower.includes('puller') || lower.includes('curseur')) {
                    setNewCatSpecType('slider');
                    if (!newCatLine) setNewCatLine('Slider & Puller');
                  } else if (lower.includes('zipper') || lower.includes('fermeture') || lower.includes('plastic') || lower.includes('zip') || lower.includes('resine')) {
                    setNewCatSpecType('zipper');
                    if (!newCatLine) setNewCatLine('Zipper');
                  } else if (lower.includes('fabric') || lower.includes('popeline') || lower.includes('tissu') || lower.includes('interlining')) {
                    setNewCatSpecType('fabric');
                    if (!newCatLine) setNewCatLine('Fabric');
                  } else if (lower.includes('thread') || lower.includes('fil') || lower.includes('coudre') || lower.includes('cone') || lower.includes('cône') || lower.includes('yarn')) {
                    setNewCatSpecType('thread');
                    if (!newCatLine) setNewCatLine('Thread');
                  }
                }}
                placeholder="EX: TEXTILES, ZIPPER, FIL, SLIDER..."
                className="h-12 uppercase font-black border-stone-200 rounded-xl focus:ring-stone-900 text-base"
                autoFocus
                onKeyDown={e => e.key === 'Enter' && handleAddGeneralCategory()}
              />
            </div>
            <div className="space-y-1.5">
              <label className="text-[9px] font-black text-amber-700 uppercase tracking-widest flex items-center gap-1">
                Nom en Français (pour le Stock) <span className="text-stone-400 font-normal lowercase">(optionnel)</span>
              </label>
              <Input
                value={newCatNameFR}
                onChange={e => setNewCatNameFR(e.target.value)}
                placeholder="EX: TISSUS, FERMETURES ÉCLAIR, FILS, CURSEURS..."
                className="h-10 uppercase font-bold border-amber-200 bg-amber-50/40 rounded-xl focus:ring-amber-600 text-xs"
              />
            </div>
            <div className="space-y-1.5">
              <label className="text-[9px] font-black text-stone-400 uppercase tracking-widest">Ligne logistique</label>
              <div className="grid grid-cols-1 gap-2">
                {availableLines.map((line) => {
                  const color = LINE_COLORS[line] || UI_COLORS[line.length % UI_COLORS.length];
                  return (
                    <button
                      key={line}
                      type="button"
                      onClick={() => {
                        setNewCatLine(line);
                        const l = line.toLowerCase();
                        if (l.includes('slider') || l.includes('puller') || l.includes('curseur')) setNewCatSpecType('slider');
                        else if (l === 'fabric' || l.includes('fabric') || l.includes('tissu')) setNewCatSpecType('fabric');
                        else if (l === 'zipper' || l.includes('zipper') || l.includes('fermeture')) setNewCatSpecType('zipper');
                        else if (l === 'thread' || l.includes('thread') || l.includes('fil')) setNewCatSpecType('thread');
                        else setNewCatSpecType('none');
                      }}
                      className={`flex items-center gap-3 px-4 py-3 rounded-xl border-2 transition-all text-left ${newCatLine === line ? 'border-stone-900 bg-stone-50' : 'border-stone-100 hover:border-stone-200'}`}
                    >
                      <div className="w-3 h-3 rounded-full shrink-0" style={{ backgroundColor: color }} />
                      <span className="text-[10px] font-black uppercase text-stone-700">{line}</span>
                      {newCatLine === line && <ChevronRight className="w-3 h-3 text-stone-900 ml-auto" />}
                    </button>
                  );
                })}
              </div>
              <div className="pt-2">
                <label className="text-[9px] font-black text-stone-400 uppercase tracking-widest mb-1 block">Créer une ligne personnalisée</label>
                <Input 
                  placeholder="EX: TEXTILES, ACCESSOIRES..."
                  value={!availableLines.includes(newCatLine) ? newCatLine : ''}
                  onChange={e => {
                    const v = e.target.value;
                    setNewCatLine(v);
                    const l = v.toLowerCase();
                    if (l.includes('slider') || l.includes('puller') || l.includes('curseur')) setNewCatSpecType('slider');
                    else if (l.includes('fabric') || l.includes('tissu')) setNewCatSpecType('fabric');
                    else if (l.includes('zipper') || l.includes('fermeture')) setNewCatSpecType('zipper');
                    else if (l.includes('thread') || l.includes('fil')) setNewCatSpecType('thread');
                  }}
                  className="h-10 uppercase font-bold border-stone-200 rounded-xl focus:ring-stone-900 text-xs"
                />
              </div>

              {/* ── Choix explicite du modèle de spécifications ── */}
              <div className="pt-3 border-t border-stone-100 space-y-1.5">
                <label className="text-[9px] font-black text-stone-600 uppercase tracking-widest block">
                  Spécifications Qualités à donner
                </label>
                <div className="grid grid-cols-2 sm:grid-cols-6 gap-2">
                  <button
                    type="button"
                    onClick={() => setNewCatSpecType('fabric')}
                    className={`p-2.5 rounded-xl border-2 text-center transition-all ${
                      newCatSpecType === 'fabric'
                        ? 'border-violet-600 bg-violet-50 text-violet-900 font-black shadow-sm'
                        : 'border-stone-100 hover:border-stone-200 text-stone-500 font-bold bg-white'
                    }`}
                  >
                    <span className="text-[10px] block uppercase font-black">🧵 Fabric</span>
                    <span className="text-[7.5px] text-stone-400 block font-bold leading-tight mt-0.5">GSM, Largeur...</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setNewCatSpecType('zipper')}
                    className={`p-2.5 rounded-xl border-2 text-center transition-all ${
                      newCatSpecType === 'zipper'
                        ? 'border-amber-500 bg-amber-50 text-amber-900 font-black shadow-sm'
                        : 'border-stone-100 hover:border-stone-200 text-stone-500 font-bold bg-white'
                    }`}
                  >
                    <span className="text-[10px] block uppercase font-black">⚡ Zipper</span>
                    <span className="text-[7.5px] text-stone-400 block font-bold leading-tight mt-0.5">Curseur, Taille...</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setNewCatSpecType('thread')}
                    className={`p-2.5 rounded-xl border-2 text-center transition-all ${
                      newCatSpecType === 'thread'
                        ? 'border-teal-600 bg-teal-50 text-teal-900 font-black shadow-sm'
                        : 'border-stone-100 hover:border-stone-200 text-stone-500 font-bold bg-white'
                    }`}
                  >
                    <span className="text-[10px] block uppercase font-black">🪡 Thread</span>
                    <span className="text-[7.5px] text-stone-400 block font-bold leading-tight mt-0.5">Cône, Fil, Lg...</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setNewCatSpecType('slider')}
                    className={`p-2.5 rounded-xl border-2 text-center transition-all ${
                      newCatSpecType === 'slider'
                        ? 'border-blue-600 bg-blue-50 text-blue-900 font-black shadow-sm'
                        : 'border-stone-100 hover:border-stone-200 text-stone-500 font-bold bg-white'
                    }`}
                  >
                    <span className="text-[10px] block uppercase font-black">🎛️ Slider</span>
                    <span className="text-[7.5px] text-stone-400 block font-bold leading-tight mt-0.5">Design, Pcs/ctn</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setNewCatSpecType('tape')}
                    className={`p-2.5 rounded-xl border-2 text-center transition-all ${
                      newCatSpecType === 'tape'
                        ? 'border-indigo-600 bg-indigo-50 text-indigo-900 font-black shadow-sm'
                        : 'border-stone-100 hover:border-stone-200 text-stone-500 font-bold bg-white'
                    }`}
                  >
                    <span className="text-[10px] block uppercase font-black">🎗️ Ruban</span>
                    <span className="text-[7.5px] text-stone-400 block font-bold leading-tight mt-0.5">Largeur, Poids/m</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setNewCatSpecType('none')}
                    className={`p-2.5 rounded-xl border-2 text-center transition-all ${
                      newCatSpecType === 'none'
                        ? 'border-stone-800 bg-stone-100 text-stone-900 font-black shadow-sm'
                        : 'border-stone-100 hover:border-stone-200 text-stone-500 font-bold bg-white'
                    }`}
                  >
                    <span className="text-[10px] block uppercase font-black">📦 Standard</span>
                    <span className="text-[7.5px] text-stone-400 block font-bold leading-tight mt-0.5">Sans spé fixes</span>
                  </button>
                </div>
              </div>
            </div>
          </div>
          <DialogFooter className="p-4 sm:p-6 bg-stone-50 gap-2 sm:gap-3 shrink-0 border-t border-stone-100 flex-row">
            <Button variant="ghost" onClick={() => setIsModalOpen(false)} className="h-10 font-black uppercase text-[9px] tracking-widest flex-1">Annuler</Button>
            <Button
              onClick={handleAddGeneralCategory}
              disabled={!newCatName.trim() || !newCatLine}
              className="h-10 bg-stone-900 text-white font-black uppercase text-[9px] tracking-widest rounded-xl flex-[1.5] shadow-lg shadow-stone-200 disabled:opacity-40"
            >
              Créer
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Modal: Nouvelle Famille ── */}
      <Dialog open={isSubModalOpen} onOpenChange={setIsSubModalOpen}>
        <DialogContent className="max-w-sm max-h-[85vh] sm:max-h-[90vh] flex flex-col gap-0 rounded-[1.5rem] p-0 border-none overflow-hidden shadow-2xl">
          <div className="bg-amber-600 p-5 sm:p-6 text-white shrink-0">
            <DialogTitle className="text-lg font-black uppercase tracking-tight">Nouvelle Famille</DialogTitle>
            <p className="text-amber-200 text-[9px] font-bold uppercase tracking-widest mt-1">
              Pôle : {generalCategories.find(g => g.id === targetGenCatId)?.name}
            </p>
          </div>
          <div className="p-5 sm:p-6 space-y-4 flex-1 min-h-0 overflow-y-auto overscroll-contain" style={{ WebkitOverflowScrolling: 'touch', touchAction: 'pan-y' }}>
            <div className="space-y-1.5">
              <label className="text-[9px] font-black text-stone-400 uppercase tracking-widest">Nom de la famille produit (Code / Nom technique)</label>
              <Input
                value={newSubName}
                onChange={e => setNewSubName(e.target.value)}
                placeholder="EX: NYLON ZIPPER, T/C TWILL..."
                className="h-12 uppercase font-black border-stone-200 rounded-xl focus:ring-amber-600 text-base"
                autoFocus
              />
            </div>
            <div className="space-y-1.5">
              <label className="text-[9px] font-black text-amber-700 uppercase tracking-widest flex items-center gap-1">
                Nom en Français (pour le Stock) <span className="text-stone-400 font-normal lowercase">(optionnel)</span>
              </label>
              <Input
                value={newSubNameFR}
                onChange={e => setNewSubNameFR(e.target.value)}
                placeholder="EX: FERMETURE NYLON, DOUBLURE SATIN..."
                className="h-10 uppercase font-bold border-amber-200 bg-amber-50/40 rounded-xl focus:ring-amber-600 text-xs"
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <label className="text-[9px] font-black text-stone-400 uppercase tracking-widest">Code HS</label>
                <Input value={newSubHsCode} onChange={e => setNewSubHsCode(e.target.value)} placeholder="0000.00.00" className="h-10 text-[11px] font-bold border-stone-200 rounded-xl focus:ring-amber-600" />
              </div>
              <div className="space-y-1.5">
                <label className="text-[9px] font-black text-stone-400 uppercase tracking-widest">Val Douane / Kg (dh)</label>
                <Input type="number" step="0.01" value={newSubCustomsValue} onChange={e => setNewSubCustomsValue(e.target.value ? Number(e.target.value) : '')} placeholder="0.00" className="h-10 text-[11px] font-bold border-stone-200 rounded-xl focus:ring-amber-600" />
              </div>
            </div>
            <div className="grid grid-cols-3 gap-3">
              <div className="space-y-1.5">
                <label className="text-[9px] font-black text-stone-400 uppercase tracking-widest">DI (%)</label>
                <Input type="number" step="0.1" value={newSubDutyRate} onChange={e => setNewSubDutyRate(e.target.value ? Number(e.target.value) : '')} placeholder="2.5" className="h-10 text-[11px] font-bold border-stone-200 rounded-xl focus:ring-amber-600" />
              </div>
              <div className="space-y-1.5">
                <label className="text-[9px] font-black text-stone-400 uppercase tracking-widest">TPI (%)</label>
                <Input type="number" step="0.01" value={newSubTpiRate} onChange={e => setNewSubTpiRate(e.target.value ? Number(e.target.value) : '')} placeholder="0.25" className="h-10 text-[11px] font-bold border-stone-200 rounded-xl focus:ring-amber-600" />
              </div>
              <div className="space-y-1.5">
                <label className="text-[9px] font-black text-stone-400 uppercase tracking-widest">TVA (%)</label>
                <Input type="number" step="0.1" value={newSubTvaRate} onChange={e => setNewSubTvaRate(e.target.value ? Number(e.target.value) : '')} placeholder="20" className="h-10 text-[11px] font-bold border-stone-200 rounded-xl focus:ring-amber-600" />
              </div>
            </div>
          </div>
          <DialogFooter className="p-4 sm:p-6 bg-stone-50 gap-2 sm:gap-3 shrink-0 border-t border-stone-100 flex-row">
            <Button variant="ghost" onClick={() => setIsSubModalOpen(false)} className="h-10 font-black uppercase text-[9px] tracking-widest flex-1">Annuler</Button>
            <Button onClick={handleAddSubCategory} className="h-10 bg-amber-600 text-white font-black uppercase text-[9px] tracking-widest rounded-xl flex-[1.5] shadow-lg shadow-amber-200">Ajouter</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
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
                const docRef = doc(firestore, 'users', user?.uid || '', 'generalCategories', deleteConfirm.id);
                deleteDocumentNonBlocking(docRef);
                toast({ title: 'Groupe supprimé' });
              }
            }} className="bg-red-600 hover:bg-red-700">
              Supprimer
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* ── Modal changer de ligne ── */}
      <Dialog open={!!movingPole} onOpenChange={open => { if (!open) { setMovingPole(null); setMoveTargetLine(''); } }}>
        <DialogContent className="sm:max-w-sm max-h-[85vh] sm:max-h-[90vh] flex flex-col gap-0 rounded-3xl border-none shadow-2xl p-0 overflow-hidden">
          <div className="bg-blue-600 p-5 text-white shrink-0">
            <DialogTitle className="text-base font-black uppercase tracking-tight">Changer de Ligne</DialogTitle>
            <p className="text-blue-200 text-[10px] font-bold uppercase tracking-widest mt-1">{movingPole?.name}</p>
          </div>
          <div className="p-5 space-y-4 flex-1 min-h-0 overflow-y-auto overscroll-contain" style={{ WebkitOverflowScrolling: 'touch', touchAction: 'pan-y' }}>
            <div className="space-y-1.5">
              <Label className="text-[10px] font-black text-stone-400 uppercase tracking-widest">Nouvelle Ligne</Label>
              <Select value={moveTargetLine} onValueChange={setMoveTargetLine}>
                <SelectTrigger className="h-11 border-stone-200 bg-white font-bold rounded-xl">
                  <SelectValue placeholder="Choisir une ligne..." />
                </SelectTrigger>
                <SelectContent>
                  {availableLines.map(line => (
                    <SelectItem key={line} value={line} className="font-bold uppercase">{line}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="flex gap-2 pt-2">
              <Button variant="ghost" className="flex-1 h-10 font-black text-[9px] uppercase tracking-widest" onClick={() => { setMovingPole(null); setMoveTargetLine(''); }}>Annuler</Button>
              <Button
                className="flex-[1.5] h-10 bg-blue-600 hover:bg-blue-700 text-white font-black text-[9px] uppercase tracking-widest rounded-xl shadow-lg"
                disabled={!moveTargetLine}
                onClick={() => {
                  if (!user || !firestore || !movingPole || !moveTargetLine) return;
                  const docRef = doc(firestore, 'users', user.uid, 'generalCategories', movingPole.id);
                  updateDocumentNonBlocking(docRef, { line: moveTargetLine });
                  toast({ title: '✅ Ligne modifiée', description: `${movingPole.name} → ${moveTargetLine}` });
                  setMovingPole(null);
                  setMoveTargetLine('');
                }}
              >
                Déplacer
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* ── Modal modifier pôle ── */}
      <Dialog open={!!editingPole} onOpenChange={open => { if (!open) { setEditingPole(null); setEditPoleName(''); setEditPoleNameFR(''); } }}>
        <DialogContent className="sm:max-w-sm rounded-3xl border-none shadow-2xl p-0 overflow-hidden">
          <div className="bg-stone-900 p-5 text-white shrink-0">
            <DialogTitle className="text-base font-black uppercase tracking-tight">Modifier le Pôle</DialogTitle>
            <p className="text-stone-400 text-[10px] font-bold uppercase tracking-widest mt-1">Vous pouvez inclure des chiffres (ex: PÔLE 1, ZIPPER #5...)</p>
          </div>
          <div className="p-5 space-y-4">
            <div className="space-y-1.5">
              <Label className="text-[10px] font-black text-stone-600 uppercase tracking-widest">Nom / Titre du Pôle (Gestion)</Label>
              <Input
                value={editPoleName}
                onChange={e => setEditPoleName(e.target.value)}
                placeholder="Ex: 1. ZIPPER, POLE 2..."
                className="h-11 border-stone-200 bg-white font-bold rounded-xl text-xs uppercase"
                autoFocus
                onKeyDown={e => { if (e.key === 'Enter') handleSavePole(); }}
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-[10px] font-black text-amber-700 uppercase tracking-widest">Nom Commercial en Français (Stock)</Label>
              <Input
                value={editPoleNameFR}
                onChange={e => setEditPoleNameFR(e.target.value)}
                placeholder="Ex: FERMETURES ÉCLAIR 1, TISSUS 2..."
                className="h-11 border-amber-200 bg-amber-50/30 font-bold rounded-xl text-xs uppercase"
                onKeyDown={e => { if (e.key === 'Enter') handleSavePole(); }}
              />
              <p className="text-[9px] text-stone-400 font-medium">Les chiffres et caractères spéciaux sont acceptés dans les deux titres.</p>
            </div>

            <div className="space-y-1.5">
              <Label className="text-[10px] font-black text-stone-600 uppercase tracking-widest">Ligne Logistique</Label>
              <Select value={editPoleLine} onValueChange={(val) => {
                setEditPoleLine(val);
                const l = val.toLowerCase();
                if (l.includes('slider') || l.includes('puller') || l.includes('curseur')) setEditPoleSpecType('slider');
                else if (l === 'fabric' || l.includes('fabric') || l.includes('tissu')) setEditPoleSpecType('fabric');
                else if (l === 'zipper' || l.includes('zipper') || l.includes('fermeture')) setEditPoleSpecType('zipper');
                else if (l === 'thread' || l.includes('thread') || l.includes('fil')) setEditPoleSpecType('thread');
                else if (l === 'tape' || l.includes('tape') || l.includes('ruban') || l.includes('sangle') || l.includes('ribbon')) setEditPoleSpecType('tape');
                else setEditPoleSpecType('none');
              }}>
                <SelectTrigger className="h-11 border-stone-200 bg-white font-bold rounded-xl text-xs uppercase">
                  <SelectValue placeholder="Choisir une ligne..." />
                </SelectTrigger>
                <SelectContent>
                  {availableLines.map(line => (
                    <SelectItem key={line} value={line} className="font-bold uppercase text-xs">{line}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1.5 pt-1">
              <Label className="text-[10px] font-black text-stone-600 uppercase tracking-widest">Modèle Spécifications Qualités</Label>
              <div className="grid grid-cols-2 sm:grid-cols-6 gap-2">
                <button
                  type="button"
                  onClick={() => setEditPoleSpecType('fabric')}
                  className={`p-2 rounded-xl border-2 text-center transition-all ${
                    editPoleSpecType === 'fabric'
                      ? 'border-violet-600 bg-violet-50 text-violet-900 font-black'
                      : 'border-stone-100 hover:border-stone-200 text-stone-500 font-bold bg-white'
                  }`}
                >
                  <span className="text-[9px] block uppercase font-black">🧵 Fabric</span>
                  <span className="text-[7px] text-stone-400 block">GSM, Largeur</span>
                </button>
                <button
                  type="button"
                  onClick={() => setEditPoleSpecType('zipper')}
                  className={`p-2 rounded-xl border-2 text-center transition-all ${
                    editPoleSpecType === 'zipper'
                      ? 'border-amber-500 bg-amber-50 text-amber-900 font-black'
                      : 'border-stone-100 hover:border-stone-200 text-stone-500 font-bold bg-white'
                  }`}
                >
                  <span className="text-[9px] block uppercase font-black">⚡ Zipper</span>
                  <span className="text-[7px] text-stone-400 block">Curseur, Taille</span>
                </button>
                <button
                  type="button"
                  onClick={() => setEditPoleSpecType('thread')}
                  className={`p-2 rounded-xl border-2 text-center transition-all ${
                    editPoleSpecType === 'thread'
                      ? 'border-teal-600 bg-teal-50 text-teal-900 font-black'
                      : 'border-stone-100 hover:border-stone-200 text-stone-500 font-bold bg-white'
                  }`}
                >
                  <span className="text-[9px] block uppercase font-black">🪡 Thread</span>
                  <span className="text-[7px] text-stone-400 block">Cône, Fil, Lg</span>
                </button>
                <button
                  type="button"
                  onClick={() => setEditPoleSpecType('slider')}
                  className={`p-2 rounded-xl border-2 text-center transition-all ${
                    editPoleSpecType === 'slider'
                      ? 'border-blue-600 bg-blue-50 text-blue-900 font-black'
                      : 'border-stone-100 hover:border-stone-200 text-stone-500 font-bold bg-white'
                  }`}
                >
                  <span className="text-[9px] block uppercase font-black">🎛️ Slider</span>
                  <span className="text-[7px] text-stone-400 block">Design, Ctn</span>
                </button>
                <button
                  type="button"
                  onClick={() => setEditPoleSpecType('tape')}
                  className={`p-2 rounded-xl border-2 text-center transition-all ${
                    editPoleSpecType === 'tape'
                      ? 'border-indigo-600 bg-indigo-50 text-indigo-900 font-black'
                      : 'border-stone-100 hover:border-stone-200 text-stone-500 font-bold bg-white'
                  }`}
                >
                  <span className="text-[9px] block uppercase font-black">🎗️ Ruban</span>
                  <span className="text-[7px] text-stone-400 block">Largeur, Poids/m</span>
                </button>
                <button
                  type="button"
                  onClick={() => setEditPoleSpecType('none')}
                  className={`p-2 rounded-xl border-2 text-center transition-all ${
                    editPoleSpecType === 'none'
                      ? 'border-stone-800 bg-stone-100 text-stone-900 font-black'
                      : 'border-stone-100 hover:border-stone-200 text-stone-500 font-bold bg-white'
                  }`}
                >
                  <span className="text-[9px] block uppercase font-black">📦 Standard</span>
                  <span className="text-[7px] text-stone-400 block">Sans spé</span>
                </button>
              </div>
            </div>

            <div className="flex gap-2 pt-2">
              <Button variant="ghost" className="flex-1 h-10 font-black text-[9px] uppercase tracking-widest" onClick={() => { setEditingPole(null); setEditPoleName(''); setEditPoleNameFR(''); setEditPoleLine(''); }}>Annuler</Button>
              <Button
                className="flex-[1.5] h-10 bg-stone-900 hover:bg-stone-800 text-white font-black text-[9px] uppercase tracking-widest rounded-xl shadow-lg"
                onClick={handleSavePole}
              >
                Enregistrer
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}