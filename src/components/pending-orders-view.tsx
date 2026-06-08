"use client";

import React, { useState, useMemo } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Clock, ArrowRight, Trash2, Pencil,
  Container, UserCircle2,
  Maximize, Palette, ChevronDown, ChevronUp, Package
} from 'lucide-react';
import ValidateOrderModal from './validate-order-modal';
import { useUser, useFirestore, deleteDocumentNonBlocking } from '@/firebase';
import { doc } from 'firebase/firestore';
import { useToast } from '@/hooks/use-toast';

interface PendingOrdersViewProps {
  articles: any[];
  factures: any[];
  onEdit: (article: any) => void;
}

export default function PendingOrdersView({ articles, factures, onEdit }: PendingOrdersViewProps) {
  const { user } = useUser();
  const firestore = useFirestore();
  const { toast } = useToast();
  const [selectedOrder, setSelectedOrder] = useState<any>(null);
  const [isValidating, setIsValidating] = useState(false);
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());
  const [collapsedGroups, setCollapsedGroups] = useState<Set<string>>(new Set());
  const [activeTab, setActiveTab] = useState<'mine' | 'clients'>('mine');

  const pendingOrders = useMemo(() => {
    return articles
      .filter(o => o.status === 'PI')
      .sort((a, b) => new Date(b.orderDate).getTime() - new Date(a.orderDate).getTime());
  }, [articles]);

  // Separate into my orders and client orders
  const myOrders = useMemo(() => pendingOrders.filter(o => !(o.isPreorder && o.clientName)), [pendingOrders]);
  const clientOrders = useMemo(() => pendingOrders.filter(o => o.isPreorder && o.clientName), [pendingOrders]);

  const activeOrders = activeTab === 'mine' ? myOrders : clientOrders;

  // Group by containerRef (if set), then remaining by supplier
  const { containerRefGroups, supplierGroups } = useMemo(() => {
    const byRef = new Map<string, any[]>();
    const noRef: any[] = [];

    activeOrders.forEach(o => {
      const ref = (o.containerRef || '').trim();
      if (ref) {
        if (!byRef.has(ref)) byRef.set(ref, []);
        byRef.get(ref)!.push(o);
      } else {
        noRef.push(o);
      }
    });

    const containerRefGroups = Array.from(byRef.entries()).map(([ref, arts]) => ({
      ref,
      arts,
      totalCbm: arts.reduce((s, o) => s + (Number(o.cubicMeasurement) || 0), 0),
      totalValue: arts.reduce((s, o) => s + (Number(o.quantity) * Number(o.purchasePricePerUnit || 0)), 0),
    }));

    const bySupplier: Record<string, any[]> = {};
    noRef.forEach(o => {
      const sup = o.supplierId || 'NON SPÉCIFIÉ';
      if (!bySupplier[sup]) bySupplier[sup] = [];
      bySupplier[sup].push(o);
    });

    return { containerRefGroups, supplierGroups: bySupplier };
  }, [activeOrders]);

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
    if (window.confirm(`Supprimer définitivement la commande PI "${name}" ?`)) {
      const docRef = doc(firestore, 'users', user.uid, 'articles', id);
      deleteDocumentNonBlocking(docRef);
      toast({ title: "Commande supprimée", description: name });
    }
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

  const ArticleCard = ({ o }: { o: any }) => {
    const isZipper = isZipperCategory(o.categoryId);
    const expanded = expandedIds.has(o.id);
    const hasBreakdown = (o.colorBreakdown?.length > 0) || (o.sizeBreakdown?.length > 0);
    return (
      <div className="bg-white rounded-2xl border border-stone-100 shadow-sm hover:shadow-md transition-all p-4 space-y-2.5">
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex-1 min-w-[160px]">
            <div className="flex items-center gap-2 flex-wrap">
              <p className="font-black text-stone-900 text-[12px] uppercase">{o.name}</p>
              {o.isFullContainer && (
                <span className="inline-flex items-center gap-0.5 text-[7px] font-black text-orange-600 bg-orange-50 border border-orange-200 px-1.5 py-0.5 rounded-full uppercase">
                  <Container className="w-2 h-2" /> FCL
                </span>
              )}
              {o.isPreorder && o.clientName && (
                <span className="text-[7px] font-black text-indigo-600 bg-indigo-50 border border-indigo-100 px-1.5 py-0.5 rounded-full uppercase flex items-center gap-0.5">
                  <UserCircle2 className="w-2 h-2" />{o.clientName}
                </span>
              )}
            </div>
            <div className="flex flex-wrap gap-1 mt-1">
              {o.size && o.size !== 'various' && <span className="text-[8px] font-bold text-stone-400 bg-stone-50 border border-stone-100 px-1.5 py-0.5 rounded uppercase">{o.size}</span>}
              {o.sizeBreakdown?.length > 0 && <span className="text-[8px] font-bold text-teal-600 bg-teal-50 border border-teal-100 px-1.5 py-0.5 rounded uppercase">{o.sizeBreakdown.length} tailles</span>}
              {o.color && o.color !== 'various' && <span className="text-[8px] font-bold text-stone-400 bg-stone-50 border border-stone-100 px-1.5 py-0.5 rounded uppercase">{o.color}</span>}
              {o.colorBreakdown?.length > 0 && <span className="text-[8px] font-bold text-violet-600 bg-violet-50 border border-violet-100 px-1.5 py-0.5 rounded uppercase">{o.colorBreakdown.length} couleurs</span>}
              {isZipper && o.zipperType && <span className="text-[8px] font-black text-amber-700 bg-amber-50 border border-amber-100 px-1.5 py-0.5 rounded uppercase">{o.zipperType} {o.slider || ''}</span>}
              {!isZipper && o.specs && <span className="text-[8px] font-bold text-stone-400 px-1.5 py-0.5">{o.specs}</span>}
            </div>
          </div>

          <div className="flex items-center gap-1 text-stone-400 font-bold text-[10px]">
            <Clock className="w-3 h-3" /> {o.orderDate}
          </div>

          <div className="text-right shrink-0">
            <p className="font-black text-stone-900 text-[12px]">{Number(o.quantity).toLocaleString()} <span className="text-[9px] text-stone-400 font-bold">{o.unitOfMeasure}</span></p>
            <p className="font-black text-amber-700 text-[10px]">${(Number(o.quantity) * Number(o.purchasePricePerUnit || 0)).toLocaleString('en-US', { maximumFractionDigits: 2 })}</p>
          </div>

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
        {/* Mes Commandes — prioritaire, actif par défaut */}
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

        {/* Commandes Clients */}
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

      {activeOrders.length === 0 ? (
        <Card className="border-none shadow-xl rounded-2xl overflow-hidden">
          <CardContent className="py-20 text-center text-stone-300 font-black uppercase text-[10px] tracking-widest">
            {activeTab === 'mine'
              ? 'Aucune commande personnelle en production.'
              : 'Aucune commande client en production.'}
          </CardContent>
        </Card>
      ) : (
        <>
          {/* ─── GROUPES CONTENEUR (par référence) ─── */}
          {containerRefGroups.length > 0 && (
            <div className="space-y-4">
              <div className="flex items-center gap-3 px-2">
                <div className="h-px flex-1 bg-orange-100" />
                <div className="flex items-center gap-2 bg-orange-500/10 border border-orange-300/30 px-4 py-1.5 rounded-full">
                  <Container className="w-3.5 h-3.5 text-orange-600" />
                  <span className="text-[10px] font-black text-orange-700 uppercase tracking-widest">Conteneurs Groupés</span>
                  <span className="text-[9px] font-black bg-orange-500 text-white px-2 py-0.5 rounded-full">{containerRefGroups.length}</span>
                </div>
                <div className="h-px flex-1 bg-orange-100" />
              </div>

              {containerRefGroups.map(({ ref, arts, totalCbm, totalValue: grpVal }) => {
                const collapsed = collapsedGroups.has(ref);
                return (
                  <div key={ref} className="rounded-2xl border-2 border-orange-200 bg-orange-50/30 overflow-hidden shadow-sm">
                    <button
                      type="button"
                      onClick={() => toggleGroup(ref)}
                      className="w-full flex items-center gap-4 px-6 py-4 bg-gradient-to-r from-orange-100/80 to-amber-50/80 hover:from-orange-100 hover:to-amber-100 transition-colors text-left"
                    >
                      <div className="p-2 bg-orange-500/10 rounded-xl border border-orange-200 shrink-0">
                        <Container className="w-4 h-4 text-orange-600" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-[13px] font-black text-orange-900 uppercase tracking-widest">{ref}</p>
                        <div className="flex items-center gap-3 mt-0.5 flex-wrap">
                          <span className="text-[9px] font-bold text-orange-600 uppercase">{arts.length} commande{arts.length > 1 ? 's' : ''}</span>
                          {totalCbm > 0 && <span className="text-[9px] font-bold text-blue-600 uppercase">{totalCbm.toLocaleString('en-US', { maximumFractionDigits: 3 })} m³</span>}
                          <span className="text-[9px] font-bold text-amber-700 uppercase">${grpVal.toLocaleString('en-US', { maximumFractionDigits: 0 })}</span>
                        </div>
                      </div>
                      <div className="flex items-center gap-3 shrink-0">
                        <div className="text-right hidden md:block">
                          <p className="text-[8px] font-black text-orange-400 uppercase tracking-widest">Valeur totale</p>
                          <p className="text-base font-black text-orange-700">${grpVal.toLocaleString('en-US', { maximumFractionDigits: 0 })}</p>
                        </div>
                        <ChevronDown className={`w-4 h-4 text-orange-500 transition-transform shrink-0 ${collapsed ? '' : 'rotate-180'}`} />
                      </div>
                    </button>

                    {!collapsed && (
                      <div className="p-4 space-y-2">
                        {arts.map(o => <ArticleCard key={o.id} o={o} />)}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}

          {/* ─── COMMANDES SANS RÉFÉRENCE, groupées par fournisseur ─── */}
          {Object.entries(supplierGroups).map(([supplier, supplierOrders]) => (
            <div key={supplier} className="space-y-4">
              <div className="flex items-center gap-3 px-2">
                <div className="h-px flex-1 bg-stone-100" />
                <Badge className={`px-4 py-1.5 rounded-full text-[10px] font-black uppercase tracking-[0.2em] ${
                  activeTab === 'mine' ? 'bg-stone-900 text-white' : 'bg-indigo-600 text-white'
                }`}>
                  {supplier}
                </Badge>
                <div className="h-px flex-1 bg-stone-100" />
              </div>

              <div className="space-y-2">
                {(supplierOrders as any[]).map(o => <ArticleCard key={o.id} o={o} />)}
              </div>
            </div>
          ))}
        </>
      )}

      <ValidateOrderModal
        open={isValidating}
        onOpenChange={setIsValidating}
        order={selectedOrder}
        factures={factures}
      />
    </div>
  );
}
