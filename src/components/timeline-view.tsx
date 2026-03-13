
"use client";

import React, { useMemo } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { 
  Timer, Ship, CheckCircle2, ChevronRight, Anchor, 
  Package, CalendarDays, Factory, ArrowRight 
} from 'lucide-react';

interface TimelineViewProps {
  articles: any[];
  factures: any[];
  onNavigateToFacture: (id: string) => void;
}

export default function TimelineView({ articles, factures, onNavigateToFacture }: TimelineViewProps) {
  const now = new Date();
  now.setHours(0, 0, 0, 0);

  const timelineData = useMemo(() => {
    // Collect all unique arrival dates from factures and SHIPPED articles
    const dateGroups: Record<string, { 
      date: string; 
      factures: any[]; 
      isPast: boolean;
      totalCbm: number;
      totalValue: number;
    }> = {};

    // Process factures
    factures.forEach(f => {
      if (!f.arrivalDate) return;
      const dateKey = f.arrivalDate;
      if (!dateGroups[dateKey]) {
        dateGroups[dateKey] = { 
          date: dateKey, 
          factures: [], 
          isPast: new Date(dateKey) < now,
          totalCbm: 0,
          totalValue: 0
        };
      }
      
      const fArticles = articles.filter(a => a.factureId === f.id);
      const itemsCount = fArticles.length;
      const itemsVal = fArticles.reduce((sum, o) => sum + ((Number(o.quantity) || 0) * (Number(o.purchasePricePerUnit) || 0)), 0);
      const cbm = fArticles.reduce((sum, o) => sum + (Number(o.cubicMeasurement) || 0), 0);
      
      dateGroups[dateKey].factures.push({
        ...f,
        itemsCount,
        itemsVal,
        cbm,
        summary: fArticles.reduce((acc: any, curr) => {
          const cat = curr.categoryId || 'DIVERS';
          acc[cat] = (acc[cat] || 0) + Number(curr.quantity);
          return acc;
        }, {})
      });

      dateGroups[dateKey].totalCbm += cbm;
      dateGroups[dateKey].totalValue += (itemsVal + (Number(f.freightCost) || 0));
    });

    return Object.values(dateGroups).sort((a, b) => b.date.localeCompare(a.date));
  }, [articles, factures, now]);

  return (
    <div className="space-y-10 fade-in pb-20">
      <header className="bg-stone-900 p-10 rounded-[2.5rem] shadow-2xl relative overflow-hidden">
        <div className="absolute top-0 right-0 w-[500px] h-[500px] bg-amber-500/10 rounded-full -translate-y-1/2 translate-x-1/2 blur-[100px]" />
        <div className="relative z-10">
          <Badge className="bg-amber-500 text-white border-none px-4 py-1 text-[10px] font-black uppercase tracking-widest rounded-full mb-4">
            Suivi Chronologique
          </Badge>
          <h2 className="text-5xl font-black text-white uppercase tracking-tighter leading-tight">
            Timeline des <br /> <span className="text-amber-500">Flux Entrants</span>
          </h2>
          <p className="text-stone-400 text-sm font-medium mt-4 max-w-md leading-relaxed">
            Visualisation temporelle des arrivages portuaires, du transit maritime à la réception certifiée en entrepôt.
          </p>
        </div>
      </header>

      <div className="max-w-4xl mx-auto relative px-4">
        {/* Vertical Line */}
        <div className="absolute left-1/2 top-0 bottom-0 w-px bg-stone-200 -translate-x-1/2 hidden md:block" />

        <div className="space-y-16 relative">
          {timelineData.length === 0 ? (
            <div className="text-center py-20 border-2 border-dashed border-stone-200 rounded-[2rem] bg-white/50">
              <CalendarDays className="w-12 h-12 text-stone-300 mx-auto mb-4" />
              <p className="text-stone-400 font-black uppercase text-xs tracking-widest">Aucun mouvement logistique planifié</p>
            </div>
          ) : timelineData.map((group, idx) => (
            <div key={group.date} className="relative">
              {/* Date Header Center */}
              <div className="flex justify-center mb-8 sticky top-24 z-20">
                <div className={`px-6 py-2 rounded-full shadow-lg border font-black text-xs uppercase tracking-widest ${group.isPast ? 'bg-stone-100 border-stone-200 text-stone-500' : 'bg-blue-600 border-blue-500 text-white animate-pulse'}`}>
                  {group.isPast ? 'Archives - ' : 'Prochainement - '} {group.date}
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-8 md:gap-24 items-start">
                {group.factures.map((f, fIdx) => (
                  <div 
                    key={f.id} 
                    className={`relative group ${fIdx % 2 === 0 ? 'md:text-right' : 'md:text-left md:col-start-2'}`}
                  >
                    {/* Circle on the line */}
                    <div className={`absolute top-10 w-4 h-4 rounded-full border-4 border-white shadow-md hidden md:block z-10 transition-transform group-hover:scale-125 ${group.isPast ? 'bg-stone-400 left-1/2 -translate-x-1/2' : 'bg-blue-500 left-1/2 -translate-x-1/2'}`} />

                    <Card 
                      onClick={() => onNavigateToFacture(f.id)}
                      className={`cursor-pointer border-none shadow-xl rounded-3xl overflow-hidden transition-all hover:scale-[1.02] active:scale-95 status-glow-${group.isPast ? 'green' : 'blue'} bg-white`}
                    >
                      <div className={`h-1.5 w-full ${group.isPast ? 'bg-emerald-500' : 'bg-blue-500'}`} />
                      <CardContent className="p-6">
                        <div className={`flex items-center gap-3 mb-4 ${fIdx % 2 === 0 ? 'md:flex-row-reverse' : 'flex-row'}`}>
                          <div className={`p-2 rounded-xl ${group.isPast ? 'bg-emerald-50 text-emerald-600' : 'bg-blue-50 text-blue-600'}`}>
                            {group.isPast ? <CheckCircle2 className="w-5 h-5" /> : <Ship className="w-5 h-5" />}
                          </div>
                          <div>
                            <p className="text-[8px] font-black text-stone-400 uppercase tracking-widest">Dossier Logistique</p>
                            <h3 className="text-lg font-black text-stone-900 uppercase tracking-tighter">{f.id}</h3>
                          </div>
                        </div>

                        <div className="space-y-4">
                          <div className={`flex items-center gap-2 text-[10px] font-bold text-stone-500 uppercase ${fIdx % 2 === 0 ? 'md:justify-end' : 'justify-start'}`}>
                            <Factory className="w-3 h-3" /> {f.supplierId || f.supplier}
                          </div>

                          <div className={`flex flex-wrap gap-2 ${fIdx % 2 === 0 ? 'md:justify-end' : 'justify-start'}`}>
                            {Object.entries(f.summary).map(([cat, qty]: any) => (
                              <Badge key={cat} variant="secondary" className="bg-stone-50 text-stone-600 text-[8px] font-black uppercase px-2 py-0.5 rounded border border-stone-100">
                                {Math.round(qty).toLocaleString()} {cat}
                              </Badge>
                            ))}
                          </div>

                          <div className="pt-4 border-t border-stone-50 flex justify-between items-center gap-4">
                            <div className="text-left">
                              <p className="text-[7px] font-black text-stone-400 uppercase">Volume</p>
                              <p className="text-sm font-black text-stone-900">{f.cbm.toFixed(2)} m³</p>
                            </div>
                            <div className="text-right">
                              <p className="text-[7px] font-black text-stone-400 uppercase">Valeur</p>
                              <p className={`text-sm font-black ${group.isPast ? 'text-emerald-600' : 'text-blue-600'}`}>{Math.round(f.itemsVal).toLocaleString()} $</p>
                            </div>
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
