
"use client";

import React, { useState, useMemo } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Clock, Factory, ArrowRight, Trash2, Pencil,
  Settings2, MousePointer2, Container, UserCircle2,
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

  const pendingOrders = useMemo(() => {
    return articles
      .filter(o => o.status === 'PI')
      .sort((a, b) => new Date(b.orderDate).getTime() - new Date(a.orderDate).getTime());
  }, [articles]);

  const fullContainerOrders = pendingOrders.filter(o => o.isFullContainer);
  const regularOrders = pendingOrders.filter(o => !o.isFullContainer);

  const totalValue = pendingOrders.reduce((s, o) =>
    s + (Number(o.quantity) * Number(o.purchasePricePerUnit || 0)), 0);

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

  const ordersBySupplier = useMemo(() => {
    const groups: Record<string, any[]> = {};
    regularOrders.forEach(o => {
      const sup = o.supplierId || 'NON SPÉCIFIÉ';
      if (!groups[sup]) groups[sup] = [];
      groups[sup].push(o);
    });
    return groups;
  }, [regularOrders]);

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
              <p className="text-[8px] font-black text-amber-400 uppercase tracking-widest mb-1">Lignes PI</p>
              <div className="text-2xl font-black text-amber-400">{pendingOrders.length}</div>
            </div>
            <div className="bg-orange-500/10 border border-orange-500/20 p-4 rounded-2xl text-center">
              <p className="text-[8px] font-black text-orange-400 uppercase tracking-widest mb-1">Conteneurs</p>
              <div className="text-2xl font-black text-orange-400">{fullContainerOrders.length}</div>
            </div>
            <div className="bg-emerald-500/10 border border-emerald-500/20 p-4 rounded-2xl text-center">
              <p className="text-[8px] font-black text-emerald-400 uppercase tracking-widest mb-1">Valeur Est.</p>
              <div className="text-lg font-black text-emerald-400">${totalValue.toLocaleString('en-US', { maximumFractionDigits: 0 })}</div>
            </div>
          </div>
        </div>
      </header>

      {pendingOrders.length === 0 ? (
        <Card className="border-none shadow-xl rounded-2xl overflow-hidden">
          <CardContent className="py-20 text-center text-stone-300 font-black uppercase text-[10px] tracking-widest">
            Aucune commande en production détectée.
          </CardContent>
        </Card>
      ) : (
        <>
          {/* ─── Conteneurs Complets ─── */}
          {fullContainerOrders.length > 0 && (
            <div className="space-y-4">
              <div className="flex items-center gap-3 px-2">
                <div className="h-px flex-1 bg-orange-100" />
                <div className="flex items-center gap-2 bg-orange-500/10 border border-orange-300/30 px-4 py-1.5 rounded-full">
                  <Container className="w-3.5 h-3.5 text-orange-600" />
                  <span className="text-[10px] font-black text-orange-700 uppercase tracking-widest">Conteneurs Complets</span>
                  <span className="text-[9px] font-black bg-orange-500 text-white px-2 py-0.5 rounded-full">{fullContainerOrders.length}</span>
                </div>
                <div className="h-px flex-1 bg-orange-100" />
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
                {fullContainerOrders.map(o => {
                  const isZipper = isZipperCategory(o.categoryId);
                  const expanded = expandedIds.has(o.id);
                  const hasBreakdown = (o.colorBreakdown?.length > 0) || (o.sizeBreakdown?.length > 0);
                  return (
                    <div key={o.id} className="bg-white rounded-2xl border border-orange-100 shadow-md hover:shadow-lg transition-all overflow-hidden">
                      {/* Card header */}
                      <div className="bg-gradient-to-r from-orange-500 to-amber-500 px-4 py-3 flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <Container className="w-4 h-4 text-white/80" />
                          <span className="text-white font-black text-[11px] uppercase tracking-wider">Conteneur Complet</span>
                        </div>
                        <span className="text-white/70 font-black text-[9px] uppercase">{o.orderDate}</span>
                      </div>

                      <div className="p-4 space-y-3">
                        <div>
                          <p className="font-black text-stone-900 text-[13px] uppercase leading-tight">{o.name}</p>
                          {o.supplierId && (
                            <p className="text-[9px] font-bold text-stone-400 uppercase mt-0.5">{o.supplierId}</p>
                          )}
                        </div>

                        <div className="flex flex-wrap gap-1.5">
                          {o.size && o.size !== 'various' && (
                            <span className="text-[9px] font-bold text-stone-500 bg-stone-50 border border-stone-100 px-2 py-0.5 rounded-lg uppercase">{o.size}</span>
                          )}
                          {o.color && o.color !== 'various' && (
                            <span className="text-[9px] font-bold text-stone-500 bg-stone-50 border border-stone-100 px-2 py-0.5 rounded-lg uppercase">{o.color}</span>
                          )}
                          {isZipper && o.zipperType && (
                            <span className="text-[9px] font-black text-amber-700 bg-amber-50 border border-amber-100 px-2 py-0.5 rounded-lg uppercase">{o.zipperType} {o.slider || ''}</span>
                          )}
                          {o.isPreorder && o.clientName && (
                            <span className="text-[8px] font-black text-indigo-600 bg-indigo-50 border border-indigo-100 px-2 py-0.5 rounded-full flex items-center gap-1">
                              <UserCircle2 className="w-2.5 h-2.5" />{o.clientName}
                            </span>
                          )}
                        </div>

                        <div className="flex items-center justify-between border-t border-stone-50 pt-2">
                          <div>
                            <p className="text-[8px] font-black text-stone-400 uppercase tracking-widest">Quantité</p>
                            <p className="text-sm font-black text-stone-900">{Number(o.quantity).toLocaleString()} <span className="text-[9px] text-stone-400 font-bold">{o.unitOfMeasure}</span></p>
                          </div>
                          <div className="text-right">
                            <p className="text-[8px] font-black text-stone-400 uppercase tracking-widest">Valeur Est.</p>
                            <p className="text-sm font-black text-amber-700">${(Number(o.quantity) * Number(o.purchasePricePerUnit || 0)).toLocaleString('en-US', { maximumFractionDigits: 2 })}</p>
                          </div>
                        </div>

                        {/* Breakdown preview toggle */}
                        {hasBreakdown && (
                          <button
                            type="button"
                            onClick={() => toggleExpand(o.id)}
                            className="w-full text-[8px] font-black uppercase tracking-widest text-stone-400 hover:text-stone-600 flex items-center justify-center gap-1 py-1 border-t border-stone-50"
                          >
                            {expanded ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
                            {expanded ? 'Masquer' : `Voir détails breakdown`}
                          </button>
                        )}

                        {expanded && hasBreakdown && (
                          <div className="space-y-2 animate-in fade-in duration-200">
                            {o.sizeBreakdown?.length > 0 && (
                              <div className="rounded-xl border border-teal-100 overflow-hidden">
                                <div className="bg-teal-600 px-3 py-1.5 flex items-center gap-1.5">
                                  <Maximize className="w-3 h-3 text-teal-200" />
                                  <span className="text-[8px] font-black text-teal-200 uppercase tracking-widest">Détail Tailles</span>
                                </div>
                                <div className="divide-y divide-teal-50 bg-white text-[10px]">
                                  {o.sizeBreakdown.map((r: any, i: number) => (
                                    <div key={i} className="grid grid-cols-[1fr_auto] px-3 py-1.5">
                                      <span className="font-black text-stone-800 uppercase">{r.size}</span>
                                      <span className="font-bold text-stone-500">{Number(r.quantity).toLocaleString()}</span>
                                    </div>
                                  ))}
                                </div>
                              </div>
                            )}
                            {o.colorBreakdown?.length > 0 && (
                              <div className="rounded-xl border border-violet-100 overflow-hidden">
                                <div className="bg-violet-600 px-3 py-1.5 flex items-center gap-1.5">
                                  <Palette className="w-3 h-3 text-violet-200" />
                                  <span className="text-[8px] font-black text-violet-200 uppercase tracking-widest">Détail Couleurs</span>
                                </div>
                                <div className="divide-y divide-violet-50 bg-white text-[10px]">
                                  {o.colorBreakdown.map((r: any, i: number) => (
                                    <div key={i} className="grid grid-cols-[1fr_auto] px-3 py-1.5">
                                      <span className="font-black text-stone-800 uppercase">{r.colorCode}</span>
                                      <span className="font-bold text-stone-500">{Number(r.rolls).toLocaleString()} rolls</span>
                                    </div>
                                  ))}
                                </div>
                              </div>
                            )}
                          </div>
                        )}

                        <div className="flex items-center gap-1 pt-1 border-t border-stone-50">
                          <Button variant="ghost" size="icon" className="h-7 w-7 text-stone-300 hover:text-amber-600 hover:bg-amber-50 rounded-lg" onClick={() => onEdit(o)}>
                            <Pencil className="w-3.5 h-3.5" />
                          </Button>
                          <Button variant="ghost" size="icon" className="h-7 w-7 text-stone-300 hover:text-red-500 hover:bg-red-50 rounded-lg" onClick={() => handleActionDelete(o.id, o.name)}>
                            <Trash2 className="w-3.5 h-3.5" />
                          </Button>
                          <Button size="sm" onClick={() => { setSelectedOrder(o); setIsValidating(true); }} className="flex-1 bg-blue-600 hover:bg-blue-700 text-white font-black uppercase text-[8px] tracking-widest h-7 rounded-lg gap-1">
                            Expédier <ArrowRight className="w-2.5 h-2.5" />
                          </Button>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* ─── Commandes Régulières par fournisseur ─── */}
          {Object.entries(ordersBySupplier).map(([supplier, supplierOrders]) => (
            <div key={supplier} className="space-y-4">
              <div className="flex items-center gap-3 px-2">
                <div className="h-px flex-1 bg-stone-100" />
                <Badge className="bg-stone-900 text-white px-4 py-1.5 rounded-full text-[10px] font-black uppercase tracking-[0.2em]">
                  {supplier}
                </Badge>
                <div className="h-px flex-1 bg-stone-100" />
              </div>

              <div className="space-y-2">
                {supplierOrders.map((o) => {
                  const isZipper = isZipperCategory(o.categoryId);
                  const expanded = expandedIds.has(o.id);
                  const hasBreakdown = (o.colorBreakdown?.length > 0) || (o.sizeBreakdown?.length > 0);
                  return (
                    <div key={o.id} className="bg-white rounded-2xl border border-stone-100 shadow-sm hover:shadow-md transition-all p-4">
                      <div className="flex flex-wrap items-center gap-3">
                        {/* Name + specs */}
                        <div className="flex-1 min-w-[160px]">
                          <div className="flex items-center gap-2">
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

                        {/* Date */}
                        <div className="flex items-center gap-1 text-stone-400 font-bold text-[10px]">
                          <Clock className="w-3 h-3" /> {o.orderDate}
                        </div>

                        {/* Qty + Value */}
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
                })}
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
