
"use client";

import React, { useMemo } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { 
  Timer, Ship, CheckCircle2, ChevronRight, Anchor, 
  Package, CalendarDays, Factory, ArrowRight, Hash 
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
    const dateGroups: Record<string, { 
      date: string; 
      factures: any[]; 
      isPast: boolean;
      totalCbm: number;
      totalValue: number;
    }> = {};

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

    // Tri par date la plus proche d'aujourd'hui
    // Les arrivages futurs en premier (croissant), puis les arrivages passés (décroissant)
    return Object.values(dateGroups).sort((a, b) => {
      const dateA = new Date(a.date).getTime();
      const dateB = new Date(b.date).getTime();
      const nowTime = now.getTime();

      // Si les deux sont futurs
      if (dateA >= nowTime && dateB >= nowTime) return dateA - dateB;
      // Si les deux sont passés
      if (dateA < nowTime && dateB < nowTime) return dateB - dateA;
      // Le futur passe avant le passé
      return dateA >= nowTime ? -1 : 1;
    });
  }, [articles, factures, now]);

  return (
    <div className="space-y-6 fade-in pb-10">
      <header className="bg-stone-900 p-6 rounded-[1.5rem] shadow-xl relative overflow-hidden">
        <div className="absolute top-0 right-0 w-64 h-64 bg-amber-500/10 rounded-full -translate-y-1/2 translate-x-1/2 blur-3xl" />
        <div className="relative z-10 flex flex-col md:flex-row justify-between items-center gap-4">
          <div>
            <h2 className="text-2xl font-black text-white uppercase tracking-tighter leading-none">Timeline des Flux</h2>
            <p className="text-stone-400 text-[10px] font-bold uppercase tracking-widest mt-1.5">Séquence chronologique des arrivages portuaires</p>
          </div>
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-2 px-3 py-1 bg-blue-500/20 border border-blue-500/30 rounded-full">
              <div className="w-2 h-2 rounded-full bg-blue-500 animate-pulse" />
              <span className="text-[9px] font-black text-blue-400 uppercase">En Transit</span>
            </div>
            <div className="flex items-center gap-2 px-3 py-1 bg-emerald-500/20 border border-emerald-500/30 rounded-full">
              <div className="w-2 h-2 rounded-full bg-emerald-500" />
              <span className="text-[9px] font-black text-emerald-400 uppercase">Réceptionné</span>
            </div>
          </div>
        </div>
      </header>

      <div className="max-w-3xl mx-auto space-y-8 relative px-4 mt-4">
        {/* Ligne verticale réduite */}
        <div className="absolute left-6 md:left-1/2 top-0 bottom-0 w-0.5 bg-stone-200 -translate-x-1/2" />

        {timelineData.length === 0 ? (
          <div className="text-center py-20 border-2 border-dashed border-stone-200 rounded-[2rem] bg-white/50">
            <CalendarDays className="w-10 h-10 text-stone-300 mx-auto mb-3" />
            <p className="text-stone-400 font-black uppercase text-[10px] tracking-widest">Aucun mouvement planifié</p>
          </div>
        ) : timelineData.map((group) => (
          <div key={group.date} className="relative">
            {/* Indicateur de Date */}
            <div className="flex justify-start md:justify-center mb-4 relative z-10">
              <div className={`px-4 py-1.5 rounded-xl shadow-md border font-black text-[10px] uppercase tracking-[0.15em] ${group.isPast ? 'bg-stone-50 border-stone-200 text-stone-400' : 'bg-blue-600 border-blue-500 text-white shadow-blue-500/20'}`}>
                {group.date} {group.isPast ? '(ARCHIVES)' : '(PROCHAINEMENT)'}
              </div>
            </div>

            <div className="flex flex-col gap-3">
              {group.factures.map((f) => (
                <div 
                  key={f.id} 
                  className={`relative md:w-[45%] ${group.isPast ? 'opacity-80' : 'opacity-100'} self-start md:self-auto ${timelineData.indexOf(group) % 2 === 0 ? 'md:ml-auto md:pl-8' : 'md:mr-auto md:pr-8 md:text-right'}`}
                >
                  {/* Point sur la ligne */}
                  <div className={`absolute top-1/2 -translate-y-1/2 w-3 h-3 rounded-full border-2 border-white shadow-sm left-6 md:left-auto ${timelineData.indexOf(group) % 2 === 0 ? 'md:-left-1.5' : 'md:-right-1.5'} ${group.isPast ? 'bg-stone-300' : 'bg-blue-500'}`} />

                  <Card 
                    onClick={() => onNavigateToFacture(f.id)}
                    className="cursor-pointer border-stone-100 shadow-lg hover:shadow-xl transition-all rounded-2xl overflow-hidden bg-white active:scale-[0.98] group"
                  >
                    <div className={`h-1 w-full ${group.isPast ? 'bg-emerald-500' : 'bg-blue-500'}`} />
                    <CardContent className="p-4">
                      <div className="flex justify-between items-start mb-2">
                        <div>
                          <p className="text-[8px] font-black text-stone-400 uppercase tracking-widest mb-0.5">Dossier</p>
                          <h3 className="text-base font-black text-stone-900 uppercase tracking-tighter">{f.id}</h3>
                        </div>
                        <div className={`p-1.5 rounded-lg ${group.isPast ? 'bg-emerald-50 text-emerald-600' : 'bg-blue-50 text-blue-600'}`}>
                          {group.isPast ? <CheckCircle2 className="w-4 h-4" /> : <Ship className="w-4 h-4" />}
                        </div>
                      </div>

                      <div className="space-y-3">
                        <div className="flex flex-wrap gap-2 items-center">
                          <span className="text-[9px] font-bold text-stone-500 uppercase flex items-center gap-1.5 bg-stone-50 px-2 py-0.5 rounded border border-stone-100">
                            <Factory className="w-2.5 h-2.5" /> {f.supplierId || f.supplier}
                          </span>
                          {f.noBL && (
                            <span className="text-[9px] font-bold text-blue-600 uppercase flex items-center gap-1.5 bg-blue-50 px-2 py-0.5 rounded border border-blue-100">
                              <Hash className="w-2.5 h-2.5" /> BL: {f.noBL}
                            </span>
                          )}
                        </div>

                        <div className="flex flex-wrap gap-1.5">
                          {Object.entries(f.summary).slice(0, 3).map(([cat, qty]: any) => (
                            <Badge key={cat} variant="outline" className="text-[7px] font-black uppercase px-1.5 h-4 border-stone-100 text-stone-400">
                              {Math.round(qty).toLocaleString()} {cat}
                            </Badge>
                          ))}
                          {Object.keys(f.summary).length > 3 && (
                            <Badge variant="outline" className="text-[7px] font-black uppercase px-1.5 h-4 border-stone-100 text-stone-300">
                              +{Object.keys(f.summary).length - 3}
                            </Badge>
                          )}
                        </div>

                        <div className="pt-3 border-t border-stone-50 flex justify-between items-center text-[9px] font-black">
                          <span className="text-stone-400">VOL: {f.cbm.toFixed(2)} m³</span>
                          <span className={group.isPast ? 'text-emerald-600' : 'text-blue-600'}>VAL: {Math.round(f.itemsVal).toLocaleString()} $</span>
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
  );
}
