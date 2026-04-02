"use client";

import React, { useMemo } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { 
  Timer, Ship, CheckCircle2, Archive, Anchor,
  Package, CalendarDays, Factory, ArrowRight, Hash 
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
  color: string;
  bgIndicator: string;
  factures: any[];
};

export default function TimelineView({ articles, factures, onNavigateToFacture, onPassToStock }: TimelineViewProps) {
  const now = new Date();
  now.setHours(0, 0, 0, 0);

  const timelineData: TimelineGroup[] = useMemo(() => {
    const transit: any[] = [];
    const clearance: any[] = [];
    const stocked: any[] = [];

    factures.forEach(f => {
      if (!f.arrivalDate) return;
      
      const fArticles = articles.filter(a => a.factureId === f.id);
      const itemsCount = fArticles.length;
      const itemsVal = fArticles.reduce((sum, o) => sum + ((Number(o.quantity) || 0) * (Number(o.purchasePricePerUnit) || 0)), 0);
      const cbm = fArticles.reduce((sum, o) => sum + (Number(o.cubicMeasurement) || 0), 0);
      const freight = Number(f.freightCost) || Number(f.freight) || 0;
      const totalRealValue = itemsVal + freight;
      
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

    // Closest arriving first for Transit
    transit.sort((a,b) => new Date(a.arrivalDate).getTime() - new Date(b.arrivalDate).getTime());
    // Oldest in clearance first for Clearance
    clearance.sort((a,b) => new Date(a.arrivalDate).getTime() - new Date(b.arrivalDate).getTime());
    // Most recently stocked first for Stocked
    stocked.sort((a,b) => new Date(b.stockEntryDate).getTime() - new Date(a.stockEntryDate).getTime());

    return [
      { state: 'TRANSIT', title: 'EN TRANSIT / PROCHAINEMENT', color: 'bg-blue-500', bgIndicator: 'bg-blue-50 border-blue-200 text-blue-600', factures: transit },
      { state: 'CLEARANCE', title: 'EN DÉDOUANEMENT (PORT)', color: 'bg-amber-500', bgIndicator: 'bg-amber-50 border-amber-200 text-amber-600 shadow-amber-500/20', factures: clearance },
      { state: 'STOCKED', title: 'ENTRÉ EN STOCK (ARCHIVES)', color: 'bg-emerald-500', bgIndicator: 'bg-stone-50 border-stone-200 text-stone-500', factures: stocked }
    ].filter(g => g.factures.length > 0) as TimelineGroup[];
  }, [articles, factures, now]);

  return (
    <div className="space-y-6 fade-in pb-10">
      <header className="bg-stone-900 p-6 rounded-[1.5rem] shadow-xl relative overflow-hidden">
        <div className="absolute top-0 right-0 w-64 h-64 bg-amber-500/10 rounded-full -translate-y-1/2 translate-x-1/2 blur-3xl" />
        <div className="relative z-10 flex flex-col md:flex-row justify-between items-center gap-4">
          <div>
            <h2 className="text-2xl font-black text-white uppercase tracking-tighter leading-none">Timeline des Flux</h2>
            <p className="text-stone-400 text-[10px] font-bold uppercase tracking-widest mt-1.5">Séquence temporelle et Statut des dossiers</p>
          </div>
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-2 px-3 py-1 bg-blue-500/20 border border-blue-500/30 rounded-full">
              <div className="w-2 h-2 rounded-full bg-blue-500 animate-pulse" />
              <span className="text-[9px] font-black text-blue-400 uppercase">Transit</span>
            </div>
            <div className="flex items-center gap-2 px-3 py-1 bg-amber-500/20 border border-amber-500/30 rounded-full">
              <div className="w-2 h-2 rounded-full bg-amber-500 animate-pulse" />
              <span className="text-[9px] font-black text-amber-400 uppercase">Dédouanement</span>
            </div>
            <div className="flex items-center gap-2 px-3 py-1 bg-emerald-500/20 border border-emerald-500/30 rounded-full">
              <div className="w-2 h-2 rounded-full bg-emerald-500" />
              <span className="text-[9px] font-black text-emerald-400 uppercase">Stocké</span>
            </div>
          </div>
        </div>
      </header>

      <div className="max-w-3xl mx-auto space-y-12 relative px-4 mt-4">
        {/* Ligne verticale réduite */}
        <div className="absolute left-6 md:left-1/2 top-0 bottom-0 w-0.5 bg-stone-200 -translate-x-1/2" />

        {timelineData.length === 0 ? (
          <div className="text-center py-20 border-2 border-dashed border-stone-200 rounded-[2rem] bg-white/50">
            <CalendarDays className="w-10 h-10 text-stone-300 mx-auto mb-3" />
            <p className="text-stone-400 font-black uppercase text-[10px] tracking-widest">Aucun mouvement</p>
          </div>
        ) : timelineData.map((group) => (
          <div key={group.state} className="relative pt-6">
            <div className="flex justify-start md:justify-center mb-8 relative z-10">
              <div className={`px-5 py-2 rounded-xl shadow-md border font-black text-[12px] uppercase tracking-[0.15em] ${group.bgIndicator}`}>
                {group.title}
              </div>
            </div>

            <div className="flex flex-col gap-6">
              {group.factures.map((f, i) => (
                <div 
                  key={f.id} 
                  className={`relative md:w-[45%] ${group.state === 'STOCKED' ? 'opacity-80' : 'opacity-100'} self-start md:self-auto ${i % 2 === 0 ? 'md:ml-auto md:pl-8' : 'md:mr-auto md:pr-8 md:text-right'}`}
                >
                  <div className={`absolute top-1/2 -translate-y-1/2 w-4 h-4 rounded-full border-4 border-white shadow-sm left-6 md:left-auto ${i % 2 === 0 ? 'md:-left-2' : 'md:-right-2'} ${group.color}`} />

                  <Card className="border-stone-100 shadow-lg hover:shadow-xl transition-all rounded-2xl overflow-hidden bg-white group">
                    <div className={`h-1.5 w-full ${group.color}`} />
                    <CardContent className="p-4">
                      <div className="flex justify-between items-start mb-2 cursor-pointer" onClick={() => onNavigateToFacture(f.id)}>
                        <div>
                          <p className="text-[8px] font-black text-stone-400 uppercase tracking-widest mb-0.5">Dossier / Navire</p>
                          <h3 className="text-base font-black text-stone-900 uppercase tracking-tighter">{f.id}</h3>
                        </div>
                        <div className={`p-1.5 rounded-lg bg-stone-50`}>
                          {group.state === 'TRANSIT' && <Ship className="w-4 h-4 text-blue-500" />}
                          {group.state === 'CLEARANCE' && <Anchor className="w-4 h-4 text-amber-500" />}
                          {group.state === 'STOCKED' && <CheckCircle2 className="w-4 h-4 text-emerald-500" />}
                        </div>
                      </div>

                      <div className="space-y-3 cursor-pointer" onClick={() => onNavigateToFacture(f.id)}>
                        <div className="flex flex-wrap gap-2 items-center mb-1">
                          <span className="text-[9px] font-bold text-stone-500 uppercase flex items-center gap-1.5 bg-stone-50 px-2 py-0.5 rounded border border-stone-100">
                            <Factory className="w-2.5 h-2.5" /> {f.supplierId || f.supplier}
                          </span>
                          {f.noBL && (
                            <span className="text-[9px] font-bold text-stone-600 uppercase flex items-center gap-1.5 bg-stone-50 px-2 py-0.5 rounded border border-stone-100">
                              <Hash className="w-2.5 h-2.5" /> BL: {f.noBL}
                            </span>
                          )}
                        </div>

                        {group.state === 'CLEARANCE' && (
                          <div className="bg-amber-50 border border-amber-100 rounded-lg p-2.5 mb-2">
                            <div className="flex justify-between items-center mb-1">
                              <span className="text-[8px] font-black text-amber-600 uppercase tracking-widest">{f.forwarder || 'Transitaire Non Assigné'}</span>
                            </div>
                            <div className="flex justify-between items-center">
                              <span className="text-[8px] font-bold text-amber-700/70 flex items-center gap-1">
                                <CalendarDays className="w-2.5 h-2.5" /> {f.forwarderGivenDate ? `Remis le ${f.forwarderGivenDate}` : 'Date en attente'}
                              </span>
                              <span className="text-[9px] font-black text-amber-600 bg-amber-100/50 px-1.5 py-0.5 rounded">ETA: {f.arrivalDate}</span>
                            </div>
                          </div>
                        )}
                        
                        {group.state === 'STOCKED' && (
                          <div className="bg-stone-50 border border-stone-100 rounded-lg p-2.5 mb-2">
                            <div className="flex justify-between items-center">
                              <span className="text-[8px] font-black text-emerald-600 uppercase tracking-widest flex items-center gap-1"><Archive className="w-3 h-3" /> Entré en stock</span>
                              <span className="text-[9px] font-black text-emerald-700 bg-emerald-100 px-1.5 py-0.5 rounded">{f.stockEntryDate}</span>
                            </div>
                          </div>
                        )}
                        
                        {group.state === 'TRANSIT' && (
                          <div className="bg-blue-50 border border-blue-100 rounded-lg p-2.5 mb-2">
                            <div className="flex justify-between items-center">
                              <span className="text-[8px] font-black text-blue-600 uppercase tracking-widest flex items-center gap-1"><Ship className="w-3 h-3" /> Arrivée Port prévue</span>
                              <span className="text-[9px] font-black text-blue-700 bg-blue-100 px-1.5 py-0.5 rounded">{f.arrivalDate}</span>
                            </div>
                          </div>
                        )}

                        <div className="flex flex-wrap gap-1.5">
                          {Object.entries(f.summary).slice(0, 3).map(([cat, qty]: any) => (
                            <Badge key={cat} variant="outline" className="text-[7px] font-black uppercase px-1.5 h-4 border-stone-100 text-stone-400">
                              {Number(qty).toLocaleString('en-US', { maximumFractionDigits: 3 })} {cat}
                            </Badge>
                          ))}
                          {Object.keys(f.summary).length > 3 && (
                            <Badge variant="outline" className="text-[7px] font-black uppercase px-1.5 h-4 border-stone-100 text-stone-300">
                              +{Object.keys(f.summary).length - 3}
                            </Badge>
                          )}
                        </div>

                        <div className="pt-3 border-t border-stone-50 flex justify-between items-center text-[9px] font-black">
                          <span className="text-stone-400">VOL: {f.cbm.toLocaleString('en-US', { maximumFractionDigits: 3 })} m³</span>
                          <span className="text-stone-600">VAL RÉELLE: {Number(f.totalRealValue).toLocaleString('en-US', { maximumFractionDigits: 3 })} $</span>
                        </div>
                      </div>

                      {group.state === 'CLEARANCE' && (
                        <div className="mt-4 pt-3 border-t border-stone-100">
                          <Button 
                            onClick={(e) => { e.stopPropagation(); onPassToStock(f.id); }}
                            className="w-full bg-emerald-50 text-emerald-600 hover:bg-emerald-600 hover:text-white font-black uppercase text-[10px] tracking-widest border border-emerald-200 transition-colors h-9"
                          >
                            Valider l'Entrée en Stock <ArrowRight className="w-3 h-3 ml-2" />
                          </Button>
                        </div>
                      )}
                    </CardContent>
                  </Card>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
