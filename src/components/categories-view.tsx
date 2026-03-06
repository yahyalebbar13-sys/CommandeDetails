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
  Clock
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

export default function CategoriesView({
  articles = [],
  generalCategories = [],
  subCategories = [],
  selectedCategory,
  setSelectedCategory,
  selectedGeneralCategoryId,
  onSelectGeneralCategory
}: CategoriesViewProps) {

  // Logic for the Main Category View (Groups)
  const groupStats = useMemo(() => {
    const stats: Record<string, any> = {};
    generalCategories.forEach(gc => {
      const groupArticles = articles.filter(a => a.generalCategoryId === gc.id);
      const units: Record<string, number> = {};
      
      groupArticles.forEach(a => {
        const unit = (a.unitOfMeasure || 'PCS').toUpperCase();
        units[unit] = (units[unit] || 0) + (Number(a.quantity) || 0);
      });

      stats[gc.id] = {
        name: gc.name,
        count: groupArticles.length,
        units
      };
    });
    return stats;
  }, [generalCategories, articles]);

  // Logic for the Sub-category Selection View
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

  // Logic for the Detailed Article View
  const currentArticles = useMemo(() => {
    if (!selectedCategory) return [];
    return articles.filter(a => a.categoryId === selectedCategory);
  }, [selectedCategory, articles]);

  // Table Groups
  const groupedData = useMemo(() => {
    if (!selectedCategory) return null;
    const now = new Date();
    return {
      transit: currentArticles.filter(a => a.status === 'SHIPPED' && (!a.arrivalDate || new Date(a.arrivalDate) > now)),
      arrived: currentArticles.filter(a => a.status === 'ARRIVED' || (a.status === 'SHIPPED' && a.arrivalDate && new Date(a.arrivalDate) <= now)),
      pending: currentArticles.filter(a => a.status === 'TO_ORDER' || a.status === 'PI')
    };
  }, [currentArticles, selectedCategory]);

  // Totals by Unit for current selection
  const currentTotals = useMemo(() => {
    const totals: Record<string, number> = {};
    currentArticles.forEach(a => {
      const unit = (a.unitOfMeasure || 'PCS').toUpperCase();
      totals[unit] = (totals[unit] || 0) + (Number(a.quantity) || 0);
    });
    return totals;
  }, [currentArticles]);

  // RENDER: Detailed View for a specific sub-category
  if (selectedCategory && groupedData) {
    return (
      <div className="space-y-8 animate-in fade-in slide-in-from-bottom-2 duration-300">
        <header className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <Button variant="outline" size="icon" onClick={() => setSelectedCategory(null)} className="rounded-full">
              <ChevronLeft className="w-4 h-4" />
            </Button>
            <div>
              <h2 className="text-2xl font-bold text-stone-800">{selectedCategory}</h2>
              <p className="text-stone-500 text-sm">Gestion détaillée des stocks et mouvements</p>
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            {Object.entries(currentTotals).map(([unit, total]) => (
              <div key={unit} className="px-4 py-2 bg-white border border-stone-200 rounded-lg shadow-sm">
                <p className="text-[10px] font-bold text-stone-400 uppercase tracking-tighter">TOTAL {unit}</p>
                <p className="text-lg font-bold text-stone-800">{total.toLocaleString()}</p>
              </div>
            ))}
          </div>
        </header>

        {/* 1. ARTICLES EN TRANSIT */}
        <section className="space-y-3">
          <div className="flex items-center gap-2">
            <div className="bg-blue-500 w-1 h-6 rounded-full" />
            <h3 className="font-bold text-stone-700 flex items-center gap-2 uppercase text-sm tracking-wide">
              <Truck className="w-4 h-4" /> Commandes en Transit
            </h3>
          </div>
          <Card className="border-none shadow-sm overflow-hidden">
            <Table>
              <TableHeader className="bg-blue-50/50">
                <TableRow>
                  <TableHead>Désignation</TableHead>
                  <TableHead>Fournisseur</TableHead>
                  <TableHead>Facture / Conteneur</TableHead>
                  <TableHead>Arrivée Prévue</TableHead>
                  <TableHead className="text-right">Quantité</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {groupedData.transit.length > 0 ? groupedData.transit.map(a => (
                  <TableRow key={a.id}>
                    <TableCell className="font-medium">{a.name}</TableCell>
                    <TableCell>{a.supplierId}</TableCell>
                    <TableCell className="font-mono text-xs">{a.factureId}</TableCell>
                    <TableCell className="text-blue-600 font-medium">{a.arrivalDate}</TableCell>
                    <TableCell className="text-right font-bold">{a.quantity.toLocaleString()} {a.unitOfMeasure}</TableCell>
                  </TableRow>
                )) : (
                  <TableRow><TableCell colSpan={5} className="text-center py-8 text-stone-400">Aucune commande en cours d'acheminement</TableCell></TableRow>
                )}
              </TableBody>
            </Table>
          </Card>
        </section>

        {/* 2. ARTICLES ARRIVES */}
        <section className="space-y-3">
          <div className="flex items-center gap-2">
            <div className="bg-emerald-500 w-1 h-6 rounded-full" />
            <h3 className="font-bold text-stone-700 flex items-center gap-2 uppercase text-sm tracking-wide">
              <CheckCircle2 className="w-4 h-4" /> Stock Réel (Arrivé)
            </h3>
          </div>
          <Card className="border-none shadow-sm overflow-hidden">
            <Table>
              <TableHeader className="bg-emerald-50/50">
                <TableRow>
                  <TableHead>Désignation</TableHead>
                  <TableHead>Date Arrivée</TableHead>
                  <TableHead>Spécifications</TableHead>
                  <TableHead className="text-right">Quantité en Stock</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {groupedData.arrived.length > 0 ? groupedData.arrived.map(a => (
                  <TableRow key={a.id}>
                    <TableCell className="font-medium">{a.name}</TableCell>
                    <TableCell className="text-stone-500">{a.arrivalDate}</TableCell>
                    <TableCell className="text-xs text-stone-400 italic">{a.specs || 'N/A'}</TableCell>
                    <TableCell className="text-right font-bold text-emerald-700">{a.quantity.toLocaleString()} {a.unitOfMeasure}</TableCell>
                  </TableRow>
                )) : (
                  <TableRow><TableCell colSpan={4} className="text-center py-8 text-stone-400">Aucun stock réceptionné</TableCell></TableRow>
                )}
              </TableBody>
            </Table>
          </Card>
        </section>

        {/* 3. ARTICLES EN ATTENTE / PRODUCTION */}
        <section className="space-y-3">
          <div className="flex items-center gap-2">
            <div className="bg-amber-500 w-1 h-6 rounded-full" />
            <h3 className="font-bold text-stone-700 flex items-center gap-2 uppercase text-sm tracking-wide">
              <Clock className="w-4 h-4" /> Commandes en Attente / Production
            </h3>
          </div>
          <Card className="border-none shadow-sm overflow-hidden">
            <Table>
              <TableHeader className="bg-amber-50/50">
                <TableRow>
                  <TableHead>Désignation</TableHead>
                  <TableHead>État</TableHead>
                  <TableHead>Date de Commande</TableHead>
                  <TableHead className="text-right">Quantité Prévue</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {groupedData.pending.length > 0 ? groupedData.pending.map(a => (
                  <TableRow key={a.id}>
                    <TableCell className="font-medium">{a.name}</TableCell>
                    <TableCell>
                      <Badge variant="outline" className="bg-amber-50 text-amber-700 border-amber-200 text-[10px]">
                        {a.status === 'PI' ? 'PRODUCTION' : 'À COMMANDER'}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-stone-500">{a.orderDate}</TableCell>
                    <TableCell className="text-right font-bold text-amber-700">{a.quantity.toLocaleString()} {a.unitOfMeasure}</TableCell>
                  </TableRow>
                )) : (
                  <TableRow><TableCell colSpan={4} className="text-center py-8 text-stone-400">Aucune commande en attente</TableCell></TableRow>
                )}
              </TableBody>
            </Table>
          </Card>
        </section>
      </div>
    );
  }

  // RENDER: Selection of Sub-category
  if (selectedGeneralCategoryId) {
    const parent = generalCategories.find(g => g.id === selectedGeneralCategoryId);
    return (
      <div className="space-y-6 animate-in fade-in duration-300">
        <div className="flex items-center gap-4">
          <Button variant="outline" size="icon" onClick={() => onSelectGeneralCategory(null)} className="rounded-full">
            <ChevronLeft className="w-4 h-4" />
          </Button>
          <div>
            <h2 className="text-2xl font-bold text-stone-800">{parent?.name}</h2>
            <p className="text-stone-500 text-sm">Choisissez une sous-catégorie pour voir les détails</p>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {subCategoryStats.map(sc => (
            <Card 
              key={sc.id} 
              className="cursor-pointer border border-stone-200 hover:border-amber-400 transition-all hover:shadow-md bg-white"
              onClick={() => setSelectedCategory(sc.name)}
            >
              <CardContent className="p-6">
                <div className="flex justify-between items-center mb-4">
                  <div className="p-2 bg-amber-50 rounded-lg">
                    <Box className="w-5 h-5 text-amber-600" />
                  </div>
                  <ChevronRight className="w-5 h-5 text-stone-300" />
                </div>
                <h3 className="font-bold text-lg text-stone-800 mb-4">{sc.name}</h3>
                <div className="space-y-2">
                  {Object.entries(sc.units).map(([unit, total]) => (
                    <div key={unit} className="flex justify-between items-center border-t border-stone-50 pt-2">
                      <span className="text-xs text-stone-500 font-medium">Stock Total {unit}</span>
                      <span className="font-bold text-stone-800">{(total as number).toLocaleString()}</span>
                    </div>
                  ))}
                  <div className="flex justify-between items-center pt-2 border-t border-stone-100 mt-2">
                    <span className="text-[10px] text-stone-400 uppercase font-bold">Variantes</span>
                    <span className="text-xs font-bold text-stone-600">{sc.count}</span>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
    );
  }

  // RENDER: Main Groups View
  return (
    <div className="space-y-6 animate-in fade-in duration-300">
      <div className="flex flex-col gap-1">
        <h2 className="text-2xl font-bold text-stone-800">Catégories</h2>
        <p className="text-stone-500 text-sm">Gestion des groupes principaux de stock</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {Object.entries(groupStats).map(([id, stat]) => (
          <Card 
            key={id} 
            className="group cursor-pointer border border-stone-200 hover:border-amber-500 transition-all shadow-sm hover:shadow-md bg-white"
            onClick={() => onSelectGeneralCategory(id)}
          >
            <CardContent className="p-6">
              <div className="flex justify-between items-start mb-6">
                <div className="p-3 bg-stone-50 group-hover:bg-amber-50 rounded-xl transition-colors">
                  <Layers className="w-6 h-6 text-stone-500 group-hover:text-amber-600" />
                </div>
                <div className="text-right">
                  <p className="text-[10px] font-bold text-stone-400 uppercase tracking-widest">Articles</p>
                  <p className="text-xl font-bold text-stone-800">{stat.count}</p>
                </div>
              </div>
              <h3 className="text-lg font-bold text-stone-800 mb-1 group-hover:text-amber-700">{stat.name}</h3>
              <div className="mt-4 space-y-2">
                {Object.entries(stat.units).map(([unit, total]) => (
                  <div key={unit} className="flex justify-between items-center text-xs border-t border-stone-50 pt-2">
                    <span className="text-stone-500">Stock {unit}</span>
                    <span className="font-bold text-stone-700">{(total as number).toLocaleString()}</span>
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