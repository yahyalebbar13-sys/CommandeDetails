"use client";

import React, { useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { 
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow 
} from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { 
  ChevronLeft, 
  ChevronRight, 
  Box, 
  Layers, 
  Truck, 
  CheckCircle2,
  Clock,
  LayoutGrid,
  TrendingUp,
  FileText
} from 'lucide-react';

interface CategoriesViewProps {
  articles: any[];
  factures: any[];
  generalCategories: any[];
  subCategories: any[];
  selectedCategory: string | null;
  setSelectedCategory: (category: string | null) => void;
  selectedGeneralCategoryId: string | null;
  onSelectGeneralCategory: (id: string | null) => void;
}

const CATEGORY_UI_COLORS = [
  'border-l-amber-500',
  'border-l-blue-500',
  'border-l-emerald-500',
  'border-l-indigo-500',
  'border-l-rose-500',
  'border-l-slate-800',
];

export default function CategoriesView({
  articles = [],
  generalCategories = [],
  subCategories = [],
  selectedCategory,
  setSelectedCategory,
  selectedGeneralCategoryId,
  onSelectGeneralCategory
}: CategoriesViewProps) {

  const groupStats = useMemo(() => {
    const stats: Record<string, any> = {};
    generalCategories.forEach(gc => {
      const groupArticles = articles.filter(a => a.generalCategoryId === gc.id);
      const units: Record<string, number> = {};
      groupArticles.forEach(a => {
        const unit = (a.unitOfMeasure || 'PCS').toUpperCase();
        units[unit] = (units[unit] || 0) + (Number(a.quantity) || 0);
      });
      stats[gc.id] = { name: gc.name, count: groupArticles.length, units };
    });
    return stats;
  }, [generalCategories, articles]);

  const subCategoryStats = useMemo(() => {
    if (!selectedGeneralCategoryId) return [];
    return subCategories
      .filter(sc => sc.generalCategoryId === selectedGeneralCategoryId)
      .map(sc => {
        const catArticles = articles.filter(a => a.categoryId === sc.name);
        const units: Record<string, number> = {};
        catArticles.forEach(a => {
          const unit = (a.unitOfMeasure || 'PCS').toUpperCase();
          units[unit] = (units[unit] || 0) + (Number(a.quantity) || 0);
        });
        return { ...sc, units, count: catArticles.length };
      });
  }, [selectedGeneralCategoryId, subCategories, articles]);

  const currentArticles = useMemo(() => {
    if (!selectedCategory) return [];
    return articles.filter(a => a.categoryId === selectedCategory);
  }, [selectedCategory, articles]);

  const groupedData = useMemo(() => {
    if (!selectedCategory) return null;
    const now = new Date();
    return {
      transit: currentArticles.filter(a => a.status === 'SHIPPED' && (!a.arrivalDate || new Date(a.arrivalDate) > now)),
      arrived: currentArticles.filter(a => a.status === 'ARRIVED' || (a.status === 'SHIPPED' && a.arrivalDate && new Date(a.arrivalDate) <= now)),
      pending: currentArticles.filter(a => a.status === 'TO_ORDER' || a.status === 'PI')
    };
  }, [currentArticles, selectedCategory]);

  const currentTotals = useMemo(() => {
    const totals: Record<string, number> = {};
    currentArticles.forEach(a => {
      const unit = (a.unitOfMeasure || 'PCS').toUpperCase();
      totals[unit] = (totals[unit] || 0) + (Number(a.quantity) || 0);
    });
    return totals;
  }, [currentArticles]);

  // RENDER: Detailed View
  if (selectedCategory && groupedData) {
    return (
      <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
        <header className="flex flex-col md:flex-row md:items-center justify-between gap-6 bg-white p-6 rounded-2xl border border-stone-200 shadow-sm">
          <div className="flex items-center gap-4">
            <Button variant="outline" size="icon" onClick={() => setSelectedCategory(null)} className="rounded-xl h-12 w-12 border-stone-200 hover:bg-stone-50">
              <ChevronLeft className="w-5 h-5" />
            </Button>
            <div>
              <p className="text-[10px] font-black text-stone-400 uppercase tracking-widest">Sous-catégorie sélectionnée</p>
              <h2 className="text-3xl font-black text-stone-900 uppercase tracking-tighter">{selectedCategory}</h2>
            </div>
          </div>
          <div className="flex flex-wrap gap-3">
            {Object.entries(currentTotals).map(([unit, total]) => (
              <div key={unit} className="px-5 py-3 bg-stone-50 border border-stone-200 rounded-xl shadow-sm">
                <p className="text-[9px] font-black text-stone-500 uppercase tracking-widest mb-1">TOTAL {unit}</p>
                <p className="text-xl font-black text-stone-900">{total.toLocaleString()}</p>
              </div>
            ))}
          </div>
        </header>

        {/* SECTION 1: TRANSIT */}
        <section className="space-y-4">
          <div className="flex items-center gap-3">
            <div className="bg-blue-600 p-2 rounded-lg"><Truck className="w-4 h-4 text-white" /></div>
            <h3 className="font-black text-stone-800 uppercase text-xs tracking-widest">Manifeste de Transit (En mer)</h3>
          </div>
          <Card className="border-none shadow-sm overflow-hidden rounded-xl border border-stone-100">
            <Table>
              <TableHeader className="bg-blue-50/30">
                <TableRow className="hover:bg-transparent">
                  <TableHead className="text-[10px] uppercase font-black text-blue-600">Désignation</TableHead>
                  <TableHead className="text-[10px] uppercase font-black text-blue-600">Fournisseur</TableHead>
                  <TableHead className="text-[10px] uppercase font-black text-blue-600">Facture / Conteneur</TableHead>
                  <TableHead className="text-[10px] uppercase font-black text-blue-600">Arrivée Prévue</TableHead>
                  <TableHead className="text-right text-[10px] uppercase font-black text-blue-600">Quantité</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {groupedData.transit.length > 0 ? groupedData.transit.map(a => (
                  <TableRow key={a.id} className="hover:bg-stone-50 transition-colors">
                    <TableCell className="font-bold text-stone-800">{a.name}</TableCell>
                    <TableCell className="text-stone-500 font-medium">{a.supplierId}</TableCell>
                    <TableCell className="font-mono text-[11px] font-bold text-blue-700 bg-blue-50 px-2 py-0.5 rounded inline-block mt-2 ml-4 uppercase">{a.factureId}</TableCell>
                    <TableCell className="text-blue-600 font-black">{a.arrivalDate}</TableCell>
                    <TableCell className="text-right font-black text-stone-900">{a.quantity.toLocaleString()} <span className="text-[10px] text-stone-400">{a.unitOfMeasure}</span></TableCell>
                  </TableRow>
                )) : (
                  <TableRow><TableCell colSpan={5} className="text-center py-12 text-stone-300 font-bold uppercase text-[10px] tracking-widest">Aucun chargement en transit</TableCell></TableRow>
                )}
              </TableBody>
            </Table>
          </Card>
        </section>

        {/* SECTION 2: ARRIVED */}
        <section className="space-y-4">
          <div className="flex items-center gap-3">
            <div className="bg-emerald-600 p-2 rounded-lg"><CheckCircle2 className="w-4 h-4 text-white" /></div>
            <h3 className="font-black text-stone-800 uppercase text-xs tracking-widest">Stock Réel Réceptionné</h3>
          </div>
          <Card className="border-none shadow-sm overflow-hidden rounded-xl border border-stone-100">
            <Table>
              <TableHeader className="bg-emerald-50/30">
                <TableRow className="hover:bg-transparent">
                  <TableHead className="text-[10px] uppercase font-black text-emerald-600">Désignation</TableHead>
                  <TableHead className="text-[10px] uppercase font-black text-emerald-600">Date Réception</TableHead>
                  <TableHead className="text-[10px] uppercase font-black text-emerald-600">Spécifications Techniques</TableHead>
                  <TableHead className="text-right text-[10px] uppercase font-black text-emerald-600">Quantité en Stock</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {groupedData.arrived.length > 0 ? groupedData.arrived.map(a => (
                  <TableRow key={a.id} className="hover:bg-stone-50 transition-colors">
                    <TableCell className="font-bold text-stone-800">{a.name}</TableCell>
                    <TableCell className="text-stone-500 font-medium">{a.arrivalDate}</TableCell>
                    <TableCell className="text-xs text-stone-400 italic font-medium">{a.specs || 'Non renseigné'}</TableCell>
                    <TableCell className="text-right font-black text-emerald-700">{a.quantity.toLocaleString()} <span className="text-[10px] text-emerald-600/50">{a.unitOfMeasure}</span></TableCell>
                  </TableRow>
                )) : (
                  <TableRow><TableCell colSpan={4} className="text-center py-12 text-stone-300 font-bold uppercase text-[10px] tracking-widest">Inventaire vide</TableCell></TableRow>
                )}
              </TableBody>
            </Table>
          </Card>
        </section>

        {/* SECTION 3: PENDING */}
        <section className="space-y-4">
          <div className="flex items-center gap-3">
            <div className="bg-amber-600 p-2 rounded-lg"><Clock className="w-4 h-4 text-white" /></div>
            <h3 className="font-black text-stone-800 uppercase text-xs tracking-widest">Prévisions de Production & Rappels</h3>
          </div>
          <Card className="border-none shadow-sm overflow-hidden rounded-xl border border-stone-100">
            <Table>
              <TableHeader className="bg-amber-50/30">
                <TableRow className="hover:bg-transparent">
                  <TableHead className="text-[10px] uppercase font-black text-amber-600">Désignation</TableHead>
                  <TableHead className="text-[10px] uppercase font-black text-amber-600">Phase Actuelle</TableHead>
                  <TableHead className="text-[10px] uppercase font-black text-amber-600">Date d'Origine</TableHead>
                  <TableHead className="text-right text-[10px] uppercase font-black text-amber-600">Quantité Estimée</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {groupedData.pending.length > 0 ? groupedData.pending.map(a => (
                  <TableRow key={a.id} className="hover:bg-stone-50 transition-colors">
                    <TableCell className="font-bold text-stone-800">{a.name}</TableCell>
                    <TableCell>
                      <Badge variant="outline" className="bg-amber-50 text-amber-700 border-amber-200 text-[9px] font-black uppercase py-0 px-2 h-5">
                        {a.status === 'PI' ? 'PRODUCTION' : 'À COMMANDER'}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-stone-500 font-medium">{a.orderDate}</TableCell>
                    <TableCell className="text-right font-black text-amber-700">{a.quantity.toLocaleString()} <span className="text-[10px] text-amber-600/50">{a.unitOfMeasure}</span></TableCell>
                  </TableRow>
                )) : (
                  <TableRow><TableCell colSpan={4} className="text-center py-12 text-stone-300 font-bold uppercase text-[10px] tracking-widest">Aucune production prévue</TableCell></TableRow>
                )}
              </TableBody>
            </Table>
          </Card>
        </section>
      </div>
    );
  }

  // RENDER: Sub-category Grid
  if (selectedGeneralCategoryId) {
    const parent = generalCategories.find(g => g.id === selectedGeneralCategoryId);
    return (
      <div className="space-y-8 animate-in fade-in duration-500">
        <div className="flex items-center gap-4">
          <Button variant="outline" size="icon" onClick={() => onSelectGeneralCategory(null)} className="rounded-xl h-12 w-12 border-stone-200 shadow-sm">
            <ChevronLeft className="w-5 h-5" />
          </Button>
          <div>
            <p className="text-[10px] font-black text-stone-400 uppercase tracking-widest">Groupe</p>
            <h2 className="text-3xl font-black text-stone-900 uppercase tracking-tighter">{parent?.name}</h2>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
          {subCategoryStats.map((sc, idx) => (
            <Card 
              key={sc.id} 
              className={`cursor-pointer border-none shadow-sm hover:shadow-md transition-all bg-white overflow-hidden group border-l-4 ${CATEGORY_UI_COLORS[idx % CATEGORY_UI_COLORS.length]}`}
              onClick={() => setSelectedCategory(sc.name)}
            >
              <CardContent className="p-6">
                <div className="flex justify-between items-center mb-4">
                  <div className="p-2 bg-stone-50 rounded-lg group-hover:bg-stone-900 transition-colors">
                    <Box className="w-5 h-5 text-stone-400 group-hover:text-white" />
                  </div>
                  <ChevronRight className="w-5 h-5 text-stone-200 group-hover:text-stone-900" />
                </div>
                <h3 className="font-black text-lg text-stone-800 mb-6 uppercase leading-tight group-hover:text-stone-900">{sc.name}</h3>
                <div className="space-y-3">
                  {Object.entries(sc.units).map(([unit, total]) => (
                    <div key={unit} className="flex justify-between items-center bg-stone-50 px-3 py-2 rounded-lg border border-stone-100">
                      <span className="text-[10px] text-stone-400 font-black uppercase tracking-widest">{unit}</span>
                      <span className="font-black text-stone-800 text-sm">{(total as number).toLocaleString()}</span>
                    </div>
                  ))}
                  <div className="flex justify-between items-center pt-2 border-t border-stone-100 mt-2">
                    <span className="text-[9px] text-stone-300 uppercase font-black">Variantes</span>
                    <span className="text-[10px] font-black text-stone-400 uppercase tracking-tighter">{sc.count}</span>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
    );
  }

  // RENDER: Main Groups
  return (
    <div className="space-y-8 animate-in fade-in duration-500">
      <div className="flex flex-col gap-1">
        <h2 className="text-3xl font-black text-stone-900 uppercase tracking-tighter">Explorateur d'Inventaire</h2>
        <p className="text-stone-500 text-sm font-medium">Analyse structurelle des flux de produits par groupe.</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-8">
        {Object.entries(groupStats).map(([id, stat], idx) => (
          <Card 
            key={id} 
            className={`group cursor-pointer border-none shadow-sm hover:shadow-xl transition-all bg-white relative overflow-hidden border-l-4 ${CATEGORY_UI_COLORS[idx % CATEGORY_UI_COLORS.length]}`}
            onClick={() => onSelectGeneralCategory(id)}
          >
            <CardContent className="p-8">
              <div className="flex justify-between items-start mb-8">
                <div className="p-4 bg-stone-50 group-hover:bg-stone-900 rounded-2xl transition-all">
                  <LayoutGrid className="w-6 h-6 text-stone-400 group-hover:text-white" />
                </div>
                <div className="text-right">
                  <p className="text-[10px] font-black text-stone-300 uppercase tracking-widest">Articles</p>
                  <p className="text-2xl font-black text-stone-900 tracking-tighter">{stat.count}</p>
                </div>
              </div>
              <h3 className="text-xl font-black text-stone-800 mb-6 uppercase group-hover:text-stone-900 leading-none">{stat.name}</h3>
              <div className="mt-4 space-y-2">
                {Object.entries(stat.units).slice(0, 3).map(([unit, total]) => (
                  <div key={unit} className="flex justify-between items-center text-[11px] border-b border-stone-50 pb-2">
                    <span className="text-stone-400 font-black uppercase tracking-widest">{unit}</span>
                    <span className="font-black text-stone-800">{(total as number).toLocaleString()}</span>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
