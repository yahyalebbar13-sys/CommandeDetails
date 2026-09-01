"use client";

import React, { useState, useMemo } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Clock, ArrowRight, Trash2, Pencil,
  Container, UserCircle2,
  Maximize, Palette, ChevronDown, ChevronUp, Package,
  Building2, Tag, Layers
} from 'lucide-react';
import ValidateOrderModal from './validate-order-modal';
import { useUser, useFirestore, deleteDocumentNonBlocking } from '@/firebase';
import { doc } from 'firebase/firestore';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from '@/components/ui/alert-dialog';
import { useToast } from '@/hooks/use-toast';

interface PendingOrdersViewProps {
  articles: any[];
  factures: any[];
  generalCategories: any[];
  onEdit: (article: any) => void;
}

export default function PendingOrdersView({ articles, factures, generalCategories, onEdit }: PendingOrdersViewProps) {
  const { user } = useUser();
  const firestore = useFirestore();
  const { toast } = useToast();
  const [selectedOrder, setSelectedOrder] = useState<any>(null);
  const [isValidating, setIsValidating] = useState(false);
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());
  const [collapsedGroups, setCollapsedGroups] = useState<Set<string>>(new Set());
  const [activeTab, setActiveTab] = useState<'mine' | 'clients'>('mine');
  const [deleteConfirm, setDeleteConfirm] = useState<{open: boolean; id?: string; name?: string}>({open: false});

  const pendingOrders = useMemo(() => {
    return articles
      .filter(o => o.status === 'PI')
      .sort((a, b) => new Date(b.orderDate).getTime() - new Date(a.orderDate).getTime());
  }, [articles]);

  const myOrders = useMemo(() => pendingOrders.filter(o => !(o.isPreorder && o.clientName)), [pendingOrders]);
  const clientOrders = useMemo(() => pendingOrders.filter(o => o.isPreorder && o.clientName), [pendingOrders]);
  const activeOrders = activeTab === 'mine' ? myOrders : clientOrders;

  // Grouping logic: Container first, then Supplier
  const groupedBlocks = useMemo(() => {
    const poleNameMap: Record<string, string> = {};
    (generalCategories || []).forEach((gc: any) => { poleNameMap[gc.id] = gc.name || gc.id; });

    const containerMap = new Map<string, any[]>();
    const supplierMap = new Map<string, any[]>();

    activeOrders.forEach(o => {
      if (o.isFullContainer || (o.containerRef && o.containerRef.trim() !== '')) {
        const cRef = (o.containerRef && o.containerRef.trim() !== '') ? o.containerRef.trim().toUpperCase() : `FCL - ${o.supplierId || 'SANS FOURNISSEUR'}`;
        if (!containerMap.has(cRef)) containerMap.set(cRef, []);
        containerMap.get(cRef)!.push(o);
      } else {
        const sup = o.supplierId || 'NON SPÉCIFIÉ';
        if (!supplierMap.has(sup)) supplierMap.set(sup, []);
        supplierMap.get(sup)!.push(o);
      }
    });

    const buildPoleGroups = (arts: any[]) => {
      const byPole = new Map<string, any[]>();
      arts.forEach((o: any) => {
        const poleId = o.generalCategoryId || '__other__';
        if (!byPole.has(poleId)) byPole.set(poleId, []);
        byPole.get(poleId)!.push(o);
      });
      return Array.from(byPole.entries()).map(([poleId, poleArts]) => {
        const poleName = poleId === '__other__' ? 'Autres' : (poleNameMap[poleId] || poleId);
        const byCat = new Map<string, any[]>();
        poleArts.forEach((o: any) => {
          const cat = o.categoryId || o.name || 'Non spécifié';
          if (!byCat.has(cat)) byCat.set(cat, []);
          byCat.get(cat)!.push(o);
        });
        const catGroups = Array.from(byCat.entries()).map(([cat, catArts]) => ({ cat, arts: catArts })).sort((a, b) => a.cat.localeCompare(b.cat));
        return { poleId, poleName, catGroups, allArts: poleArts };
      }).sort((a, b) => a.poleName.localeCompare(b.poleName));
    };

    const containerBlocks = Array.from(containerMap.entries()).map(([cRef, arts]) => ({
      type: 'container' as const,
      id: `container-${cRef}`,
      title: cRef,
      poleGroups: buildPoleGroups(arts),
      allArts: arts,
      totalValue: arts.reduce((s: number, o: any) => s + (Number(o.quantity) * Number(o.purchasePricePerUnit || 0)), 0),
      totalQty: arts.reduce((s: number, o: any) => s + (Number(o.quantity) || 0), 0),
      totalCbm: arts.reduce((s: number, o: any) => s + (Number(o.cubicMeasurement) || 0), 0),
    })).sort((a, b) => a.title.localeCompare(b.title));

    const supplierBlocks = Array.from(supplierMap.entries()).map(([sup, arts]) => ({
      type: 'supplier' as const,
      id: `supplier-${sup}`,
      title: sup,
      poleGroups: buildPoleGroups(arts),
      allArts: arts,
      totalValue: arts.reduce((s: number, o: any) => s + (Number(o.quantity) * Number(o.purchasePricePerUnit || 0)), 0),
      totalQty: arts.reduce((s: number, o: any) => s + (Number(o.quantity) || 0), 0),
      totalCbm: arts.reduce((s: number, o: any) => s + (Number(o.cubicMeasurement) || 0), 0),
    })).sort((a, b) => a.title.localeCompare(b.title));

    return [...containerBlocks, ...supplierBlocks];
  }, [activeOrders, generalCategories]);

  const totalValue = activeOrders.reduce((s, o) =>
    s + (Number(o.quantity) * Number(o.purchasePricePerUnit || 0)), 0);

  const toggleGroup = (key: string) => {
    setCollapsedGroups(prev => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key); else next.add(key);
      return next;
    });
  };

  const handleActionDelete = (id: string, name: string) => {
    if (!user || !firestore || !id) return;
    setDeleteConfirm({ open: true, id, name });
  };

  const isZipperCategory = (cat: string) => {
    const c = cat?.toUpperCase() || "";
    return c.includes("ZIPPER") && !c.includes("LONG CHAIN") && !c.includes("SLIDER");
  };

  const toggleExpand = (id: string) => {
    setExpandedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  // Category color palette
  const getCategoryColor = (cat: string) => {
    const c = cat.toUpperCase();
    if (c.includes('SLIDER') || c.includes('PULLER')) return { bg: 'bg-violet-50', border: 'border-violet-200', header: 'bg-violet-700', text: 'text-violet-700', badge: 'bg-violet-700 text-white', dot: 'bg-violet-500' };
    if (c.includes('ZIPPER')) return { bg: 'bg-amber-50', border: 'border-amber-200', header: 'bg-amber-600', text: 'text-amber-700', badge: 'bg-amber-600 text-white', dot: 'bg-amber-500' };
    if (c.includes('FABRIC') || c.includes('TISSU')) return { bg: 'bg-teal-50', border: 'border-teal-200', header: 'bg-teal-700', text: 'text-teal-700', badge: 'bg-teal-700 text-white', dot: 'bg-teal-500' };
    if (c.includes('BOUTON') || c.includes('BUTTON')) return { bg: 'bg-pink-50', border: 'border-pink-200', header: 'bg-pink-600', text: 'text-pink-700', badge: 'bg-pink-600 text-white', dot: 'bg-pink-500' };
    if (c.includes('LONG CHAIN')) return { bg: 'bg-orange-50', border: 'border-orange-200', header: 'bg-orange-600', text: 'text-orange-700', badge: 'bg-orange-600 text-white', dot: 'bg-orange-500' };
    return { bg: 'bg-stone-50', border: 'border-stone-200', header: 'bg-stone-700', text: 'text-stone-700', badge: 'bg-stone-700 text-white', dot: 'bg-stone-400' };
  };

  const ArticleCard = ({ o }: { o: any }) => {
    const isZipper = isZipperCategory(o.categoryId);
    const expanded = expandedIds.has(o.id);
    const hasBreakdown = (o.colorBreakdown?.length > 0) || (o.sizeBreakdown?.length > 0);
    return (
      <div className="bg-white rounded-2xl border border-stone-100 shadow-sm hover:shadow-md transition-all p-4 space-y-2.5">
        <div className="flex flex-wrap items-start gap-3">

          {/* Photo */}
          {(o.imageUrl || o.designImageUrl) && (
            <img
              src={o.imageUrl || o.designImageUrl}
              alt={o.name}
              className="w-12 h-12 rounded-xl object-cover border border-stone-100 shrink-0 cursor-pointer hover:opacity-90 transition-opacity"
              onClick={() => window.open(o.imageUrl || o.designImageUrl, '_blank')}
              title="Voir la photo"
            />
          )}

          {/* Info principale */}
          <div className="flex-1 min-w-[160px]">
            <div className="flex items-center gap-2 flex-wrap">
              <p className="font-black text-stone-900 text-[12px] uppercase">{o.name}</p>
              {o.isFullContainer && (
                <span className="inline-flex items-center gap-0.5 text-[7px] font-black text-orange-600 bg-orange-50 border border-orange-200 px-1.5 py-0.5 rounded-full uppercase">
                  <Container className="w-2 h-2" /> FCL
                </span>
              )}
              {o.containerRef && (
                <span className="inline-flex items-center gap-0.5 text-[7px] font-black text-orange-700 bg-orange-50 border border-orange-200 px-1.5 py-0.5 rounded-full uppercase">
                  <Container className="w-2 h-2" /> {o.containerRef}
                </span>
              )}
              {o.isPreorder && o.clientName && (
                <span className="text-[7px] font-black text-indigo-600 bg-indigo-50 border border-indigo-100 px-1.5 py-0.5 rounded-full uppercase flex items-center gap-0.5">
                  <UserCircle2 className="w-2 h-2" />{o.clientName}
                </span>
              )}
            </div>
            <div className="flex flex-wrap gap-1 mt-1.5">
              {/* Fournisseur */}
              {o.supplierId && (
                <span className="inline-flex items-center gap-1 text-[8px] font-black text-blue-700 bg-blue-50 border border-blue-100 px-1.5 py-0.5 rounded uppercase">
                  <Building2 className="w-2.5 h-2.5" /> {o.supplierId}
                </span>
              )}
              {o.size && o.size !== 'various' && <span className="text-[8px] font-bold text-stone-400 bg-stone-50 border border-stone-100 px-1.5 py-0.5 rounded uppercase">{o.size}</span>}
              {o.sizeBreakdown?.length > 0 && <span className="text-[8px] font-bold text-teal-600 bg-teal-50 border border-teal-100 px-1.5 py-0.5 rounded uppercase">{o.sizeBreakdown.length} tailles</span>}
              {o.color && o.color !== 'various' && <span className="text-[8px] font-bold text-stone-400 bg-stone-50 border border-stone-100 px-1.5 py-0.5 rounded uppercase">{o.color}</span>}
              {o.colorBreakdown?.length > 0 && <span className="text-[8px] font-bold text-violet-600 bg-violet-50 border border-violet-100 px-1.5 py-0.5 rounded uppercase">{o.colorBreakdown.length} couleurs</span>}
              {isZipper && o.zipperType && <span className="text-[8px] font-black text-amber-700 bg-amber-50 border border-amber-100 px-1.5 py-0.5 rounded uppercase">{o.zipperType} {o.slider || ''}</span>}
              {!isZipper && o.specs && <span className="text-[8px] font-bold text-stone-400 px-1.5 py-0.5">{o.specs}</span>}
            </div>
          </div>

          {/* Date */}
          <div className="flex items-center gap-1 text-stone-400 font-bold text-[10px] shrink-0">
            <Clock className="w-3 h-3" /> {o.orderDate}
          </div>

          {/* Qty + Valeur */}
          <div className="text-right shrink-0">
            <p className="font-black text-stone-900 text-[12px]">{Number(o.quantity).toLocaleString()} <span className="text-[9px] text-stone-400 font-bold">{o.unitOfMeasure}</span></p>
            <p className="font-black text-amber-700 text-[10px]">${(Number(o.quantity) * Number(o.purchasePricePerUnit || 0)).toLocaleString('en-US', { maximumFractionDigits: 2 })}</p>
          </div>

          {/* Actions */}
          <div className="flex items-center gap-1 shrink-0">
            {hasBreakdown && (
              <Button variant="ghost" size="icon" className="h-8 w-8 text-stone-300 hover:text-stone-600 hover:bg-stone-50 rounded-xl" onClick={() => toggleExpand(o.id)}>
                {expanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
              </Button>
            )}
            <Button variant="ghost" size="icon" className="h-8 w-8 text-stone-300 hover:text-amber-600 hover:bg-amber-50 rounded-xl" onClick={() => onEdit(o)}>
              <Pencil className="w-4 h-4" />
            </Button>
            <Button variant="ghost" size="icon" className="h-8 w-8 text-stone-300 hover:text-red-500 hover:bg-red-50 rounded-xl" onClick={() => handleActionDelete(o.id, o.name)}>
              <Trash2 className="w-4 h-4" />
            </Button>
            <Button size="sm" onClick={() => { setSelectedOrder(o); setIsValidating(true); }} className="bg-blue-600 hover:bg-blue-700 text-white font-black uppercase text-[9px] tracking-widest px-4 h-8 rounded-lg ml-1">
              Expédier <ArrowRight className="w-3 h-3 ml-1" />
            </Button>
          </div>
        </div>

        {/* Breakdown detail */}
        {expanded && hasBreakdown && (
          <div className="mt-3 pt-3 border-t border-stone-50 grid grid-cols-1 md:grid-cols-2 gap-3 animate-in fade-in duration-200">
            {o.sizeBreakdown?.length > 0 && (
              <div className="rounded-xl border border-teal-100 overflow-hidden">
                <div className="bg-teal-600 px-3 py-1.5 flex items-center gap-1.5">
                  <Maximize className="w-3 h-3 text-teal-200" />
                  <span className="text-[8px] font-black text-teal-200 uppercase tracking-widest">Détail Tailles — {o.sizeBreakdown.length} tailles</span>
                </div>
                <div className="divide-y divide-teal-50 bg-white">
                  {o.sizeBreakdown.map((r: any, i: number) => (
                    <div key={i} className="grid grid-cols-[1fr_60px] px-3 py-1.5 text-[10px]">
                      <span className="font-black text-stone-800 uppercase">{r.size}</span>
                      <span className="font-bold text-stone-500 text-right">{Number(r.quantity).toLocaleString()}</span>
                    </div>
                  ))}
                  <div className="grid grid-cols-[1fr_60px] px-3 py-1.5 bg-teal-600 text-white">
                    <span className="text-[8px] font-black uppercase">TOTAL</span>
                    <span className="text-[9px] font-black text-right">{o.sizeBreakdown.reduce((s: number, r: any) => s + (Number(r.quantity) || 0), 0).toLocaleString()}</span>
                  </div>
                </div>
              </div>
            )}
            {o.colorBreakdown?.length > 0 && (
              <div className="rounded-xl border border-violet-100 overflow-hidden">
                <div className="bg-violet-600 px-3 py-1.5 flex items-center gap-1.5">
                  <Palette className="w-3 h-3 text-violet-200" />
                  <span className="text-[8px] font-black text-violet-200 uppercase tracking-widest">Détail Couleurs — {o.colorBreakdown.length} couleurs</span>
                </div>
                <div className="divide-y divide-violet-50 bg-white">
                  {o.colorBreakdown.map((r: any, i: number) => (
                    <div key={i} className="grid grid-cols-[1fr_80px] px-3 py-1.5 text-[10px]">
                      <span className="font-black text-stone-800 uppercase">{r.colorCode}</span>
                      <span className="font-bold text-stone-500 text-right">{Number(r.rolls).toLocaleString()} rolls</span>
                    </div>
                  ))}
                  <div className="grid grid-cols-[1fr_80px] px-3 py-1.5 bg-violet-600 text-white">
                    <span className="text-[8px] font-black uppercase">TOTAL</span>
                    <span className="text-[9px] font-black text-right">{o.colorBreakdown.reduce((s: number, r: any) => s + (Number(r.rolls) || 0), 0).toLocaleString()} rolls</span>
                  </div>
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="space-y-8 fade-in">

      {/* ─── Header premium ─── */}
      <header className="bg-stone-900 rounded-[2rem] shadow-2xl overflow-hidden relative">
        <div className="absolute top-0 right-0 w-96 h-96 bg-amber-500/5 rounded-full -translate-y-1/2 translate-x-1/3 blur-3xl pointer-events-none" />
        <div className="absolute bottom-0 left-1/4 w-64 h-64 bg-amber-400/5 rounded-full translate-y-1/2 blur-3xl pointer-events-none" />
        <div className="relative z-10 p-8 flex flex-col lg:flex-row lg:items-center justify-between gap-8">
          <div>
            <p className="text-[10px] font-black text-stone-500 uppercase tracking-[0.3em] mb-2">Logistique — Fabrication</p>
            <h2 className="text-4xl font-black text-white uppercase tracking-tighter leading-none">
              Commandes<br /><span className="text-amber-500">Production (PI)</span>
            </h2>
            <p className="text-stone-400 text-xs font-bold uppercase tracking-widest mt-3">
              Suivi en temps réel · Fabrication chez le partenaire
            </p>
          </div>
          <div className="grid grid-cols-3 gap-3 lg:w-auto w-full">
            <div className="bg-amber-500/10 border border-amber-500/20 p-4 rounded-2xl text-center">
              <p className="text-[8px] font-black text-amber-400 uppercase tracking-widest mb-1">Mes PI</p>
              <div className="text-2xl font-black text-amber-400">{myOrders.length}</div>
            </div>
            <div className="bg-indigo-500/10 border border-indigo-500/20 p-4 rounded-2xl text-center">
              <p className="text-[8px] font-black text-indigo-400 uppercase tracking-widest mb-1">PI Clients</p>
              <div className="text-2xl font-black text-indigo-400">{clientOrders.length}</div>
            </div>
            <div className="bg-emerald-500/10 border border-emerald-500/20 p-4 rounded-2xl text-center">
              <p className="text-[8px] font-black text-emerald-400 uppercase tracking-widest mb-1">Valeur Est.</p>
              <div className="text-lg font-black text-emerald-400">${totalValue.toLocaleString('en-US', { maximumFractionDigits: 0 })}</div>
            </div>
          </div>
        </div>
      </header>

      {/* ─── Tab Bar ─── */}
      <div className="bg-white rounded-2xl shadow-sm border border-stone-100 p-1.5 flex gap-1.5">
        <button
          type="button"
          onClick={() => { setActiveTab('mine'); setCollapsedGroups(new Set()); }}
          className={`flex-1 flex items-center justify-center gap-2.5 px-5 py-3 rounded-xl font-black text-[11px] uppercase tracking-widest transition-all duration-200 ${
            activeTab === 'mine'
              ? 'bg-amber-500 text-white shadow-lg shadow-amber-200'
              : 'text-stone-400 hover:text-stone-700 hover:bg-stone-50'
          }`}
        >
          <Package className="w-4 h-4 shrink-0" />
          Mes Commandes
          <span className={`inline-flex items-center justify-center min-w-[22px] h-[22px] px-1.5 rounded-full text-[10px] font-black ${
            activeTab === 'mine' ? 'bg-white/20 text-white' : 'bg-amber-100 text-amber-700'
          }`}>
            {myOrders.length}
          </span>
        </button>

        <button
          type="button"
          onClick={() => { setActiveTab('clients'); setCollapsedGroups(new Set()); }}
          className={`flex-1 flex items-center justify-center gap-2.5 px-5 py-3 rounded-xl font-black text-[11px] uppercase tracking-widest transition-all duration-200 ${
            activeTab === 'clients'
              ? 'bg-indigo-500 text-white shadow-lg shadow-indigo-200'
              : 'text-stone-400 hover:text-stone-700 hover:bg-stone-50'
          }`}
        >
          <UserCircle2 className="w-4 h-4 shrink-0" />
          Commandes Clients
          <span className={`inline-flex items-center justify-center min-w-[22px] h-[22px] px-1.5 rounded-full text-[10px] font-black ${
            activeTab === 'clients' ? 'bg-white/20 text-white' : 'bg-indigo-100 text-indigo-700'
          }`}>
            {clientOrders.length}
          </span>
        </button>
      </div>

      {/* ─── Contenu ─── */}
      {activeOrders.length === 0 ? (
        <Card className="border-none shadow-xl rounded-2xl overflow-hidden">
          <CardContent className="py-20 text-center text-stone-300 font-black uppercase text-[10px] tracking-widest">
            {activeTab === 'mine'
              ? 'Aucune commande personnelle en production.'
              : 'Aucune commande client en production.'}
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-5">
          {groupedBlocks.map(({ type, id, title, poleGroups, allArts, totalValue: blockVal, totalQty: blockQty, totalCbm }) => {
            const collapsed = collapsedGroups.has(id);
            const cbmPercent = Math.min(((totalCbm || 0) / 68) * 100, 100);
            const isContainer = type === 'container';
            return (
              <div key={id} className={`rounded-2xl border-2 overflow-hidden shadow-sm ${isContainer ? 'border-teal-200' : 'border-stone-200'}`}>
                {/* ── Block header (collapsible) ── */}
                <button
                  type="button"
                  onClick={() => toggleGroup(id)}
                  className={`w-full flex items-center gap-4 px-6 py-4 transition-colors text-left ${isContainer ? 'bg-teal-900 hover:bg-teal-950' : 'bg-stone-900 hover:bg-stone-800'}`}
                >
                  <div className="p-2 bg-white/10 rounded-xl shrink-0">
                    {isContainer ? <Container className="w-5 h-5 text-teal-400" /> : <Building2 className="w-5 h-5 text-amber-400" />}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-[15px] font-black text-white uppercase tracking-wider">{isContainer ? `Conteneur: ${title}` : title}</p>
                    <div className="flex items-center gap-3 mt-0.5 flex-wrap">
                      <span className={`text-[9px] font-bold uppercase ${isContainer ? 'text-teal-200' : 'text-stone-400'}`}>
                        {allArts.length} commande{allArts.length > 1 ? 's' : ''}
                      </span>
                      <span className={`text-[9px] font-bold uppercase ${isContainer ? 'text-teal-400' : 'text-amber-400'}`}>
                        {poleGroups.length} pôle{poleGroups.length > 1 ? 's' : ''}
                      </span>
                    </div>
                  </div>
                  <div className="flex items-center gap-6 shrink-0">
                    <div className="hidden lg:flex items-center gap-2 bg-black/40 px-3 py-1.5 rounded-lg border border-white/5">
                      <span className={`text-[8px] font-black uppercase tracking-widest ${isContainer ? 'text-teal-400' : 'text-stone-400'}`}>Conteneur HQ</span>
                      <div className={`w-24 h-1.5 rounded-full overflow-hidden shadow-inner ${isContainer ? 'bg-teal-950' : 'bg-stone-800'}`}>
                        <div className={`h-full transition-all ${cbmPercent >= 100 ? 'bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.5)]' : 'bg-blue-500'}`} style={{ width: `${cbmPercent}%` }} />
                      </div>
                      <span className="text-[9px] font-black text-stone-200">{(totalCbm || 0).toFixed(1)} <span className="text-[8px] opacity-50">/ 68 CBM</span></span>
                    </div>
                    
                    <div className="text-right hidden md:block">
                      <p className={`text-[8px] font-black uppercase tracking-widest ${isContainer ? 'text-teal-400/60' : 'text-stone-500'}`}>Valeur totale</p>
                      <p className={`text-base font-black ${isContainer ? 'text-teal-400' : 'text-amber-400'}`}>${blockVal.toLocaleString('en-US', { maximumFractionDigits: 0 })}</p>
                    </div>
                    <Badge className={`${isContainer ? 'bg-teal-500' : 'bg-amber-500'} text-white border-none text-[9px] font-black px-3 py-1`}>
                      {blockQty.toLocaleString()} unités
                    </Badge>
                    <ChevronDown className={`w-4 h-4 text-white/50 transition-transform shrink-0 ${collapsed ? '' : 'rotate-180'}`} />
                  </div>
                </button>

                {/* ── Pôle sub-sections ── */}
                {!collapsed && (
                  <div className="bg-white/60 divide-y divide-stone-100">
                    {poleGroups.map(({ poleId, poleName, catGroups, allArts: poleArts }) => (
                      <div key={poleId}>
                        {/* Pôle separator — shown only if supplier has multiple pôles */}
                        {poleGroups.length > 1 && (
                          <div className="flex items-center gap-3 px-6 py-2.5 bg-stone-50 border-b border-stone-100">
                            <Layers className="w-3 h-3 text-stone-400" />
                            <span className="text-[9px] font-black text-stone-500 uppercase tracking-widest">{poleName}</span>
                            <span className="ml-auto text-[9px] font-bold text-stone-400">{poleArts.length} art.</span>
                          </div>
                        )}
                        {/* Categories inside pôle */}
                        {catGroups.map(({ cat, arts }) => {
                          const colors = getCategoryColor(cat);
                          return (
                            <div key={cat}>
                              {catGroups.length > 1 && (
                                <div className={`flex items-center gap-2 px-8 py-1.5 ${colors.bg} border-b ${colors.border}`}>
                                  <span className={`w-1.5 h-1.5 rounded-full ${colors.dot}`} />
                                  <span className={`text-[8px] font-black uppercase tracking-widest ${colors.text}`}>{cat}</span>
                                  <span className={`ml-auto text-[8px] font-bold ${colors.text} opacity-60`}>{arts.length} art.</span>
                                </div>
                              )}
                              <div className="p-4 space-y-2">
                                {(arts as any[]).map((o: any) => <ArticleCard key={o.id} o={o} />)}
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      <ValidateOrderModal
        open={isValidating}
        onOpenChange={setIsValidating}
        order={selectedOrder}
        factures={factures}
      />
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
                const docRef = doc(firestore, 'users', user?.uid || '', 'articles', deleteConfirm.id);
                deleteDocumentNonBlocking(docRef);
                toast({ title: "Commande supprimée", description: deleteConfirm.name });
              }
            }} className="bg-red-600 hover:bg-red-700">
              Supprimer
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
