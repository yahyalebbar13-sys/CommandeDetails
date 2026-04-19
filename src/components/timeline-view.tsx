"use client";

import React, { useMemo, useState } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Timer, Ship, CheckCircle2, Archive, Anchor,
  Package, CalendarDays, Factory, ArrowRight, Hash,
  AlertTriangle, Clock, TrendingUp, Boxes, DollarSign,
  ChevronDown, ChevronUp, Eye
} from 'lucide-react';

interface TimelineViewProps {
  articles: any[];
  factures: any[];
  onNavigateToFacture: (id: string) => void;
  onPassToStock: (factureId: string) => void;
}

type TimelineGroup = {
  state: 'TRANSIT' | 'CLEARANCE' | 'STOCKED';
  title: string;
  factures: any[];
};

function getDaysDiff(dateStr: string, referenceDate: Date): number {
  const d = new Date(dateStr);
  d.setHours(0, 0, 0, 0);
  return Math.round((d.getTime() - referenceDate.getTime()) / (1000 * 60 * 60 * 24));
}

function DaysBadge({ days, state }: { days: number; state: string }) {
  if (state === 'STOCKED') return null;

  if (state === 'CLEARANCE') {
    // days since arrival (negative = past)
    const daysSince = -days;
    if (daysSince <= 3) {
      return (
        <span className="inline-flex items-center gap-1 text-[9px] font-black uppercase px-2 py-0.5 rounded-full bg-amber-100 text-amber-700 border border-amber-300">
          <Clock className="w-2.5 h-2.5" />J+{daysSince}
        </span>
      );
    }
    if (daysSince <= 10) {
      return (
        <span className="inline-flex items-center gap-1 text-[9px] font-black uppercase px-2 py-0.5 rounded-full bg-orange-100 text-orange-700 border border-orange-300">
          <AlertTriangle className="w-2.5 h-2.5" />J+{daysSince}
        </span>
      );
    }
    return (
      <span className="inline-flex items-center gap-1 text-[9px] font-black uppercase px-2 py-0.5 rounded-full bg-red-100 text-red-700 border border-red-300 animate-pulse">
        <AlertTriangle className="w-2.5 h-2.5" />J+{daysSince} ⚠
      </span>
    );
  }

  // TRANSIT
  if (days > 14) {
    return (
      <span className="inline-flex items-center gap-1 text-[9px] font-black uppercase px-2 py-0.5 rounded-full bg-blue-100 text-blue-700 border border-blue-200">
        <Ship className="w-2.5 h-2.5" />J-{days}
      </span>
    );
  }
  if (days > 3) {
    return (
      <span className="inline-flex items-center gap-1 text-[9px] font-black uppercase px-2 py-0.5 rounded-full bg-indigo-100 text-indigo-700 border border-indigo-300">
        <Ship className="w-2.5 h-2.5" />J-{days}
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 text-[9px] font-black uppercase px-2 py-0.5 rounded-full bg-violet-100 text-violet-700 border border-violet-300 animate-pulse">
      <Ship className="w-2.5 h-2.5" />IMMINENCE J-{days}
    </span>
  );
}

function StateIcon({ state, className }: { state: string; className?: string }) {
  if (state === 'TRANSIT') return <Ship className={className} />;
  if (state === 'CLEARANCE') return <Anchor className={className} />;
  return <CheckCircle2 className={className} />;
}

const STATE_CONFIG = {
  TRANSIT: {
    color: 'blue',
    dot: 'bg-blue-500',
    bar: 'bg-blue-500',
    header: 'from-blue-600 to-blue-800',
    badge: 'bg-blue-50 text-blue-700 border-blue-200',
    card: 'border-blue-100',
    icon: 'text-blue-500',
    label: 'EN TRANSIT',
    pulse: true,
  },
  CLEARANCE: {
    color: 'amber',
    dot: 'bg-amber-500',
    bar: 'bg-amber-500',
    header: 'from-amber-500 to-orange-600',
    badge: 'bg-amber-50 text-amber-700 border-amber-200',
    card: 'border-amber-100',
    icon: 'text-amber-500',
    label: 'AU PORT',
    pulse: true,
  },
  STOCKED: {
    color: 'emerald',
    dot: 'bg-emerald-500',
    bar: 'bg-emerald-500',
    header: 'from-emerald-600 to-teal-700',
    badge: 'bg-emerald-50 text-emerald-700 border-emerald-200',
    card: 'border-emerald-100',
    icon: 'text-emerald-500',
    label: 'STOCKÉ',
    pulse: false,
  },
};

function FactureCard({
  f,
  state,
  now,
  onNavigateToFacture,
  onPassToStock,
}: {
  f: any;
  state: 'TRANSIT' | 'CLEARANCE' | 'STOCKED';
  now: Date;
  onNavigateToFacture: (id: string) => void;
  onPassToStock: (factureId: string) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const cfg = STATE_CONFIG[state];

  const days =
    f.arrivalDate ? getDaysDiff(f.arrivalDate, now) : null;

  const clearanceDays = state === 'CLEARANCE' && f.arrivalDate
    ? -getDaysDiff(f.arrivalDate, now)
    : 0;

  // Show urgency ring on clearance cards > 7 days
  const isUrgent = state === 'CLEARANCE' && clearanceDays > 7;

  return (
    <div className={`relative group transition-all duration-300 ${state === 'STOCKED' ? 'opacity-70 hover:opacity-100' : ''}`}>
      {/* Urgency glow */}
      {isUrgent && (
        <div className="absolute -inset-0.5 rounded-2xl bg-gradient-to-r from-red-400 to-orange-400 opacity-30 blur-sm animate-pulse pointer-events-none" />
      )}

      <Card className={`relative border ${cfg.card} shadow-md hover:shadow-xl transition-all duration-300 rounded-2xl overflow-hidden bg-white`}>
        {/* Top color bar */}
        <div className={`h-1 w-full bg-gradient-to-r ${cfg.header}`} />

        <CardContent className="p-0">
          {/* Header */}
          <div
            className="p-4 cursor-pointer"
            onClick={() => onNavigateToFacture(f.id)}
          >
            <div className="flex justify-between items-start">
              <div className="flex-1 min-w-0">
                <p className="text-[8px] font-black text-stone-400 uppercase tracking-[0.2em] mb-0.5">
                  Dossier
                </p>
                <h3 className="text-lg font-black text-stone-900 uppercase tracking-tight truncate leading-none">
                  {f.id}
                </h3>
                <div className="flex flex-wrap items-center gap-1.5 mt-2">
                  {f.supplierId || f.supplier ? (
                    <span className="inline-flex items-center gap-1 text-[8px] font-black text-stone-500 uppercase bg-stone-50 border border-stone-100 px-2 py-0.5 rounded">
                      <Factory className="w-2.5 h-2.5" />
                      {f.supplierId || f.supplier}
                    </span>
                  ) : null}
                  {f.noBL && (
                    <span className="inline-flex items-center gap-1 text-[8px] font-black text-stone-500 uppercase bg-stone-50 border border-stone-100 px-2 py-0.5 rounded">
                      <Hash className="w-2.5 h-2.5" />
                      BL: {f.noBL}
                    </span>
                  )}
                </div>
              </div>

              <div className="flex flex-col items-end gap-2 ml-3 flex-shrink-0">
                <div className={`p-2 rounded-xl bg-stone-50 border border-stone-100`}>
                  <StateIcon state={state} className={`w-5 h-5 ${cfg.icon}`} />
                </div>
                {days !== null && (
                  <DaysBadge days={days} state={state} />
                )}
              </div>
            </div>
          </div>

          {/* State-specific info band */}
          {state === 'TRANSIT' && (
            <div className="mx-4 mb-3 bg-blue-50 border border-blue-100 rounded-xl p-3">
              <div className="flex justify-between items-center">
                <span className="text-[8px] font-black text-blue-600 uppercase tracking-widest flex items-center gap-1">
                  <Ship className="w-3 h-3" /> Arrivée Port Prévue
                </span>
                <span className="text-[10px] font-black text-blue-800 bg-blue-100 px-2 py-0.5 rounded-lg">
                  {f.arrivalDate}
                </span>
              </div>
            </div>
          )}

          {state === 'CLEARANCE' && (
            <div className="mx-4 mb-3 space-y-2">
              <div className={`${isUrgent ? 'bg-red-50 border-red-200' : 'bg-amber-50 border-amber-100'} border rounded-xl p-3`}>
                <div className="flex justify-between items-center mb-2">
                  <span className={`text-[8px] font-black uppercase tracking-widest flex items-center gap-1 ${isUrgent ? 'text-red-600' : 'text-amber-600'}`}>
                    <Anchor className="w-3 h-3" /> {f.forwarder || 'Transitaire N/A'}
                  </span>
                  <span className={`text-[9px] font-black px-2 py-0.5 rounded-lg ${isUrgent ? 'bg-red-100 text-red-800' : 'bg-amber-100 text-amber-800'}`}>
                    Arrivé le {f.arrivalDate}
                  </span>
                </div>
                {/* Clearance duration bar */}
                <div className="space-y-1">
                  <div className="flex justify-between">
                    <span className="text-[7px] font-black text-stone-400 uppercase">Durée en port</span>
                    <span className={`text-[8px] font-black ${clearanceDays > 7 ? 'text-red-600' : 'text-amber-600'}`}>
                      {clearanceDays} jour{clearanceDays > 1 ? 's' : ''}
                    </span>
                  </div>
                  <div className="h-1.5 bg-stone-100 rounded-full overflow-hidden">
                    <div
                      className={`h-full rounded-full transition-all ${clearanceDays <= 5 ? 'bg-amber-400' : clearanceDays <= 10 ? 'bg-orange-500' : 'bg-red-500'}`}
                      style={{ width: `${Math.min((clearanceDays / 15) * 100, 100)}%` }}
                    />
                  </div>
                </div>
                {f.forwarderGivenDate && (
                  <p className="text-[7px] text-amber-600/70 font-bold mt-1.5 flex items-center gap-1">
                    <CalendarDays className="w-2.5 h-2.5" />
                    Remis transitaire le {f.forwarderGivenDate}
                  </p>
                )}
              </div>
            </div>
          )}

          {state === 'STOCKED' && (
            <div className="mx-4 mb-3 bg-emerald-50 border border-emerald-100 rounded-xl p-3">
              <div className="flex justify-between items-center">
                <span className="text-[8px] font-black text-emerald-600 uppercase flex items-center gap-1">
                  <Archive className="w-3 h-3" /> Entré en stock
                </span>
                <span className="text-[10px] font-black text-emerald-800 bg-emerald-100 px-2 py-0.5 rounded-lg">
                  {f.stockEntryDate}
                </span>
              </div>
            </div>
          )}

          {/* Category badges (collapsed by default if many) */}
          <div className="px-4 pb-3">
            <div className="flex flex-wrap gap-1.5">
              {Object.entries(f.summary)
                .slice(0, expanded ? undefined : 3)
                .map(([cat, qty]: any) => (
                  <Badge
                    key={cat}
                    variant="outline"
                    className="text-[7px] font-black uppercase px-1.5 h-4 border-stone-100 text-stone-400 bg-stone-50"
                  >
                    {Number(qty).toLocaleString('fr-FR', { maximumFractionDigits: 0 })} {cat}
                  </Badge>
                ))}
              {Object.keys(f.summary).length > 3 && (
                <button
                  onClick={() => setExpanded(!expanded)}
                  className="text-[7px] font-black text-stone-400 border border-stone-100 bg-stone-50 px-1.5 h-4 rounded inline-flex items-center gap-0.5 hover:bg-stone-100 transition-colors"
                >
                  {expanded ? <ChevronUp className="w-2 h-2" /> : <ChevronDown className="w-2 h-2" />}
                  {expanded ? 'Moins' : `+${Object.keys(f.summary).length - 3}`}
                </button>
              )}
            </div>
          </div>

          {/* Footer stats */}
          <div className="px-4 pb-4 border-t border-stone-50 pt-3">
            <div className="flex justify-between items-center">
              <div className="flex gap-3">
                <span className="text-[8px] font-black text-stone-400 flex items-center gap-1">
                  <Boxes className="w-3 h-3" />
                  {f.itemsCount} réf.
                </span>
                <span className="text-[8px] font-black text-stone-400 flex items-center gap-1">
                  <Package className="w-3 h-3" />
                  {f.cbm.toLocaleString('fr-FR', { maximumFractionDigits: 2 })} m³
                </span>
              </div>
              <span className="text-[9px] font-black text-stone-700 flex items-center gap-1">
                <DollarSign className="w-3 h-3 text-stone-400" />
                {Number(f.totalRealValue).toLocaleString('fr-FR', { maximumFractionDigits: 0 })}
              </span>
            </div>
          </div>

          {/* Action buttons */}
          <div className="px-4 pb-4 flex gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => onNavigateToFacture(f.id)}
              className="flex-1 h-8 text-[9px] font-black uppercase tracking-widest border-stone-200 text-stone-500 hover:bg-stone-50 rounded-xl"
            >
              <Eye className="w-3 h-3 mr-1.5" /> Voir Dossier
            </Button>

            {state === 'CLEARANCE' && (
              <Button
                size="sm"
                onClick={(e) => { e.stopPropagation(); onPassToStock(f.id); }}
                className="flex-1 h-8 bg-emerald-500 hover:bg-emerald-600 text-white font-black uppercase text-[9px] tracking-widest rounded-xl shadow-md shadow-emerald-500/20"
              >
                <ArrowRight className="w-3 h-3 mr-1.5" /> Passer en Stock
              </Button>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

export default function TimelineView({ articles, factures, onNavigateToFacture, onPassToStock }: TimelineViewProps) {
  const now = new Date();
  now.setHours(0, 0, 0, 0);

  const { timelineData, kpis } = useMemo(() => {
    const transit: any[] = [];
    const clearance: any[] = [];
    const stocked: any[] = [];
    let totalValue = 0;

    factures.forEach(f => {
      if (!f.arrivalDate) return;

      const fArticles = articles.filter(a => a.factureId === f.id);
      const itemsCount = fArticles.length;
      const itemsVal = fArticles.reduce((sum, o) => sum + ((Number(o.quantity) || 0) * (Number(o.purchasePricePerUnit) || 0)), 0);
      const cbm = fArticles.reduce((sum, o) => sum + (Number(o.cubicMeasurement) || 0), 0);
      const freight = Number(f.freightCost) || Number(f.freight) || 0;
      const totalRealValue = itemsVal + freight;
      totalValue += totalRealValue;

      const enrichedF = {
        ...f,
        itemsCount,
        itemsVal,
        totalRealValue,
        cbm,
        summary: fArticles.reduce((acc: any, curr) => {
          const cat = curr.categoryId || 'DIVERS';
          acc[cat] = (acc[cat] || 0) + Number(curr.quantity);
          return acc;
        }, {})
      };

      const arrivalTime = new Date(f.arrivalDate).getTime();
      const stockTime = f.stockEntryDate ? new Date(f.stockEntryDate).getTime() : null;
      const nowTime = now.getTime();

      if (stockTime && stockTime <= nowTime) {
        stocked.push(enrichedF);
      } else if (arrivalTime <= nowTime) {
        clearance.push(enrichedF);
      } else {
        transit.push(enrichedF);
      }
    });

    transit.sort((a, b) => new Date(a.arrivalDate).getTime() - new Date(b.arrivalDate).getTime());
    clearance.sort((a, b) => new Date(a.arrivalDate).getTime() - new Date(b.arrivalDate).getTime());
    stocked.sort((a, b) => new Date(b.stockEntryDate).getTime() - new Date(a.stockEntryDate).getTime());

    const groups: TimelineGroup[] = [
      { state: 'CLEARANCE', title: 'EN DÉDOUANEMENT — AU PORT', factures: clearance },
      { state: 'TRANSIT', title: 'EN TRANSIT — PROCHAINEMENT', factures: transit },
      { state: 'STOCKED', title: 'ENTRÉ EN STOCK', factures: stocked },
    ].filter(g => g.factures.length > 0) as TimelineGroup[];

    const urgentCount = clearance.filter(f => -getDaysDiff(f.arrivalDate, now) > 7).length;

    return {
      timelineData: groups,
      kpis: { transit: transit.length, clearance: clearance.length, stocked: stocked.length, totalValue, urgentCount }
    };
  }, [articles, factures]);

  return (
    <div className="space-y-6 fade-in pb-10">
      {/* ─── Header ─────────────────────────────────────────────── */}
      <header className="bg-stone-900 p-6 rounded-[1.5rem] shadow-xl relative overflow-hidden">
        <div className="absolute top-0 right-0 w-80 h-80 bg-amber-500/10 rounded-full -translate-y-1/2 translate-x-1/2 blur-3xl" />
        <div className="absolute bottom-0 left-20 w-40 h-40 bg-blue-500/10 rounded-full translate-y-1/2 blur-2xl" />
        <div className="relative z-10">
          <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 mb-5">
            <div>
              <h2 className="text-2xl font-black text-white uppercase tracking-tighter leading-none flex items-center gap-3">
                <Timer className="w-6 h-6 text-amber-400" />
                Timeline des Flux
              </h2>
              <p className="text-stone-400 text-[10px] font-bold uppercase tracking-widest mt-1.5">
                Séquence temporelle et statut des dossiers logistiques
              </p>
            </div>
            <div className="flex items-center gap-2 flex-wrap">
              {[
                { label: 'Transit', dot: 'bg-blue-500', pulse: true },
                { label: 'Port', dot: 'bg-amber-500', pulse: true },
                { label: 'Stocké', dot: 'bg-emerald-500', pulse: false },
              ].map(({ label, dot, pulse }) => (
                <div key={label} className="flex items-center gap-1.5 px-3 py-1 bg-white/5 border border-white/10 rounded-full">
                  <div className={`w-2 h-2 rounded-full ${dot} ${pulse ? 'animate-pulse' : ''}`} />
                  <span className="text-[9px] font-black text-stone-300 uppercase">{label}</span>
                </div>
              ))}
            </div>
          </div>

          {/* KPI strip */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <div className="bg-blue-500/15 border border-blue-500/20 rounded-xl p-3 flex items-center gap-3">
              <Ship className="w-5 h-5 text-blue-400 flex-shrink-0" />
              <div>
                <p className="text-2xl font-black text-white leading-none">{kpis.transit}</p>
                <p className="text-[7px] font-black text-blue-300 uppercase tracking-widest">En Transit</p>
              </div>
            </div>
            <div className={`${kpis.urgentCount > 0 ? 'bg-red-500/15 border-red-500/30' : 'bg-amber-500/15 border-amber-500/20'} border rounded-xl p-3 flex items-center gap-3`}>
              <Anchor className={`w-5 h-5 flex-shrink-0 ${kpis.urgentCount > 0 ? 'text-red-400' : 'text-amber-400'}`} />
              <div>
                <p className="text-2xl font-black text-white leading-none">{kpis.clearance}</p>
                <p className={`text-[7px] font-black uppercase tracking-widest ${kpis.urgentCount > 0 ? 'text-red-300' : 'text-amber-300'}`}>
                  Au Port {kpis.urgentCount > 0 && `(${kpis.urgentCount} urgent${kpis.urgentCount > 1 ? 's' : ''})`}
                </p>
              </div>
            </div>
            <div className="bg-emerald-500/15 border border-emerald-500/20 rounded-xl p-3 flex items-center gap-3">
              <Archive className="w-5 h-5 text-emerald-400 flex-shrink-0" />
              <div>
                <p className="text-2xl font-black text-white leading-none">{kpis.stocked}</p>
                <p className="text-[7px] font-black text-emerald-300 uppercase tracking-widest">Stockés</p>
              </div>
            </div>
            <div className="bg-white/5 border border-white/10 rounded-xl p-3 flex items-center gap-3">
              <TrendingUp className="w-5 h-5 text-stone-300 flex-shrink-0" />
              <div>
                <p className="text-base font-black text-white leading-none">
                  {Number(kpis.totalValue).toLocaleString('fr-FR', { maximumFractionDigits: 0 })} $
                </p>
                <p className="text-[7px] font-black text-stone-400 uppercase tracking-widest">Val. Totale</p>
              </div>
            </div>
          </div>
        </div>
      </header>

      {/* ─── Content ─────────────────────────────────────────────── */}
      {timelineData.length === 0 ? (
        <div className="text-center py-24 border-2 border-dashed border-stone-200 rounded-[2rem] bg-white/50">
          <CalendarDays className="w-12 h-12 text-stone-300 mx-auto mb-4" />
          <p className="text-stone-400 font-black uppercase text-[10px] tracking-widest">Aucun mouvement enregistré</p>
          <p className="text-stone-300 text-[9px] font-bold mt-1">Les dossiers avec une date d'arrivée apparaîtront ici</p>
        </div>
      ) : (
        <div className="space-y-8">
          {timelineData.map((group) => {
            const cfg = STATE_CONFIG[group.state];
            return (
              <section key={group.state}>
                {/* Section header */}
                <div className="flex items-center gap-3 mb-4">
                  <div className={`flex items-center gap-2 px-4 py-2 rounded-xl border font-black text-[11px] uppercase tracking-[0.12em] ${cfg.badge}`}>
                    <div className={`w-2 h-2 rounded-full ${cfg.dot} ${cfg.pulse ? 'animate-pulse' : ''}`} />
                    {group.title}
                    <span className="ml-1 opacity-60">({group.factures.length})</span>
                  </div>
                  <div className="flex-1 h-px bg-stone-100" />
                </div>

                {/* Cards grid */}
                <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
                  {group.factures.map((f) => (
                    <FactureCard
                      key={f.id}
                      f={f}
                      state={group.state}
                      now={now}
                      onNavigateToFacture={onNavigateToFacture}
                      onPassToStock={onPassToStock}
                    />
                  ))}
                </div>
              </section>
            );
          })}
        </div>
      )}
    </div>
  );
}
