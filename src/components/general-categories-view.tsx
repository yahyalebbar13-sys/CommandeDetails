"use client";

import React, { useState, useMemo } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Layers, Plus, Trash2, ArrowRight, FolderSearch, PlusCircle,
  Truck, DollarSign, TrendingUp, Package, Search, BarChart3, ChevronRight
} from 'lucide-react';
import { useUser, useFirestore, setDocumentNonBlocking, deleteDocumentNonBlocking } from '@/firebase';
import { doc } from 'firebase/firestore';
import { useToast } from '@/hooks/use-toast';
import { GeneralCategory, Category } from '@/lib/types';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';

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
  'Bouton':          '#10B981',
  'Reste':           '#6B7280',
};

const UI_COLORS = ['#CC8626', '#1E293B', '#3B82F6', '#10B981', '#6366F1', '#F43F5E', '#8B5CF6', '#EC4899'];

const GROUPS_ORDER = [
  { title: 'Fabric',           keywords: ['fabric','non woven','t/c fabric','popeline','leather','felt fabric','polyester fabric','taffeta fabric','woven interlining'] },
  { title: 'Slider et puller', keywords: ['puller','slider for nylon zipper','slider for plastic zipper','slider for metal zipper'] },
  { title: 'Zipper',           keywords: ['zipper','plastic zipper','nylon zipper','metal zipper','zipper long chain','nylon zipper long chain'] },
  { title: 'Bouton',           keywords: ['covered mould button','snap button','button'] },
  { title: 'Reste',            keywords: ['ruban','tape','rope','thread','elastic thread','tack pin','hook and loop','divers','opp bag'], isFallback: true },
];

export default function GeneralCategoriesView({ articles = [], generalCategories, subCategories, onSelectGeneralCategory }: GeneralCategoriesViewProps) {
  const { user } = useUser();
  const firestore = useFirestore();
  const { toast } = useToast();

  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isSubModalOpen, setIsSubModalOpen] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');

  const [newCatName, setNewCatName] = useState('');
  const [newCatLine, setNewCatLine] = useState('');
  const [newSubName, setNewSubName] = useState('');
  const [newSubHsCode, setNewSubHsCode] = useState('');
  const [newSubCustomsValue, setNewSubCustomsValue] = useState<number | ''>('');
  const [newSubDutyRate, setNewSubDutyRate] = useState<number | ''>('');
  const [newSubTpiRate, setNewSubTpiRate] = useState<number | ''>('');
  const [newSubTvaRate, setNewSubTvaRate] = useState<number | ''>('');
  const [targetGenCatId, setTargetGenCatId] = useState<string | null>(null);

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
    return allGroups.filter(g => g.items.length > 0);
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
    if (newCatLine) data.line = newCatLine;
    setDocumentNonBlocking(docRef, data, { merge: true });
    toast({ title: 'Pôle logistique créé' });
    setNewCatName(''); setNewCatLine(''); setIsModalOpen(false);
  };

  const handleAddSubCategory = () => {
    if (!user || !firestore || !newSubName.trim() || !targetGenCatId) return;
    const id = crypto.randomUUID();
    const docRef = doc(firestore, 'users', user.uid, 'categories', id);
    const catData: any = { id, name: newSubName.trim().toUpperCase(), generalCategoryId: targetGenCatId };
    if (newSubHsCode) catData.hsCode = newSubHsCode;
    if (newSubCustomsValue !== '') catData.customsValuePerKg = Number(newSubCustomsValue);
    if (newSubDutyRate !== '') catData.importDutyRate = Number(newSubDutyRate);
    if (newSubTpiRate !== '') catData.tpiRate = Number(newSubTpiRate);
    if (newSubTvaRate !== '') catData.tvaRate = Number(newSubTvaRate);
    setDocumentNonBlocking(docRef, catData, { merge: true });
    toast({ title: 'Sous-catégorie ajoutée' });
    setNewSubName(''); setNewSubHsCode(''); setNewSubCustomsValue('');
    setNewSubDutyRate(''); setNewSubTpiRate(''); setNewSubTvaRate('');
    setTargetGenCatId(null); setIsSubModalOpen(false);
  };

  const handleDelete = (e: React.MouseEvent, id: string, name: string) => {
    e.stopPropagation();
    if (!user || !firestore) return;
    if (window.confirm(`Supprimer le groupe "${name}" ainsi que ses configurations ?`)) {
      const docRef = doc(firestore, 'users', user.uid, 'generalCategories', id);
      deleteDocumentNonBlocking(docRef);
      toast({ title: 'Groupe supprimé' });
    }
  };

  const openSubModal = (e: React.MouseEvent, genCatId: string) => {
    e.stopPropagation();
    setTargetGenCatId(genCatId);
    setIsSubModalOpen(true);
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
                    <h3 className="text-lg font-black text-stone-900 uppercase tracking-tighter">{group.title}</h3>
                    <span className="text-[8px] font-black text-stone-400 bg-stone-100 px-2 py-0.5 rounded-full uppercase">
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
                                onClick={(e) => openSubModal(e, gc.id)}
                              >
                                <PlusCircle className="w-3.5 h-3.5" />
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
                          <h3 className="text-[11px] font-black text-stone-800 uppercase leading-tight tracking-tighter group-hover:text-stone-900 line-clamp-2 min-h-[2rem] mb-3">
                            {gc.name}
                          </h3>

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
                              <span className="px-2 py-0.5 bg-stone-50 rounded text-[7px] font-black text-stone-400 uppercase">
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
        <DialogContent className="max-w-sm rounded-[1.5rem] p-0 border-none overflow-hidden">
          <div className="bg-stone-900 p-6 text-white">
            <DialogTitle className="text-lg font-black uppercase tracking-tight">Initialiser un Pôle</DialogTitle>
            <p className="text-stone-400 text-[9px] font-bold uppercase tracking-widest mt-1">Architecture logistique haut niveau</p>
          </div>
          <div className="p-6 space-y-4">
            <div className="space-y-1.5">
              <label className="text-[9px] font-black text-stone-400 uppercase tracking-widest">Désignation du Pôle</label>
              <Input
                value={newCatName}
                onChange={e => setNewCatName(e.target.value)}
                placeholder="EX: TEXTILES, ACCESSOIRES..."
                className="h-12 uppercase font-black border-stone-200 rounded-xl focus:ring-stone-900 text-base"
                autoFocus
                onKeyDown={e => e.key === 'Enter' && handleAddGeneralCategory()}
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
                      onClick={() => setNewCatLine(line)}
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
                  onChange={e => setNewCatLine(e.target.value)}
                  className="h-10 uppercase font-bold border-stone-200 rounded-xl focus:ring-stone-900 text-xs"
                />
              </div>
            </div>
          </div>
          <DialogFooter className="p-6 bg-stone-50 gap-3">
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
        <DialogContent className="max-w-sm rounded-[1.5rem] p-0 border-none overflow-hidden">
          <div className="bg-amber-600 p-6 text-white">
            <DialogTitle className="text-lg font-black uppercase tracking-tight">Nouvelle Famille</DialogTitle>
            <p className="text-amber-200 text-[9px] font-bold uppercase tracking-widest mt-1">
              Pôle : {generalCategories.find(g => g.id === targetGenCatId)?.name}
            </p>
          </div>
          <div className="p-6 space-y-4">
            <div className="space-y-1.5">
              <label className="text-[9px] font-black text-stone-400 uppercase tracking-widest">Nom de la famille produit</label>
              <Input
                value={newSubName}
                onChange={e => setNewSubName(e.target.value)}
                placeholder="EX: ZIPPER NO5, FIL 40/2..."
                className="h-12 uppercase font-black border-stone-200 rounded-xl focus:ring-amber-600 text-base"
                autoFocus
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
          <DialogFooter className="p-6 bg-stone-50 gap-3">
            <Button variant="ghost" onClick={() => setIsSubModalOpen(false)} className="h-10 font-black uppercase text-[9px] tracking-widest flex-1">Annuler</Button>
            <Button onClick={handleAddSubCategory} className="h-10 bg-amber-600 text-white font-black uppercase text-[9px] tracking-widest rounded-xl flex-[1.5] shadow-lg shadow-amber-200">Ajouter</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}