"use client";

import React, { useMemo, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Label } from '@/components/ui/label';
import { 
  ChevronLeft, 
  Package, 
  Layers,
  ArrowRight,
  TrendingUp,
  Box,
  ChevronRight
} from 'lucide-react';
import { useUser, useFirestore } from '@/firebase';
import { doc } from 'firebase/firestore';
import { setDocumentNonBlocking } from '@/firebase/non-blocking-updates';
import { useToast } from '@/hooks/use-toast';
import { 
  LineChart, 
  Line, 
  XAxis, 
  YAxis, 
  CartesianGrid, 
  Tooltip as RechartsTooltip, 
  ResponsiveContainer 
} from 'recharts';

interface CategoriesViewProps {
  articles: any[];
  factures: any[];
  generalCategories: any[];
  subCategories: any[];
  selectedCategory: string | null;
  setSelectedCategory: (category: string | null) => void;
  selectedGeneralCategoryId: string | null;
  onSelectGeneralCategory: (id: string) => void;
}

export default function CategoriesView({ 
  articles = [], 
  factures = [], 
  generalCategories = [], 
  subCategories = [],
  selectedCategory, 
  setSelectedCategory, 
  selectedGeneralCategoryId,
  onSelectGeneralCategory
}: CategoriesViewProps) {
  
  const { user } = useUser();
  const firestore = useFirestore();
  const { toast } = useToast();
  const now = new Date();

  // Liste des catégories principales
  const displayMainCategories = useMemo(() => {
    return generalCategories.map(gc => {
      const subs = subCategories.filter(sc => sc.generalCategoryId === gc.id);
      const artCount = articles.filter(a => a.generalCategoryId === gc.id).length;
      return { ...gc, subCount: subs.length, artCount };
    });
  }, [generalCategories, subCategories, articles]);

  // Liste des sous-catégories du groupe sélectionné
  const displaySubCategories = useMemo(() => {
    if (!selectedGeneralCategoryId) return [];
    return subCategories
      .filter(sc => sc.generalCategoryId === selectedGeneralCategoryId)
      .map(sc => {
        const catArticles = articles.filter(a => a.categoryId === sc.name);
        
        // Calcul des totaux par unité
        const totalsByUnit: Record<string, number> = {};
        catArticles.forEach(a => {
          const unit = a.unitOfMeasure || 'PCS';
          totalsByUnit[unit] = (totalsByUnit[unit] || 0) + (Number(a.quantity) || 0);
        });

        return { ...sc, totalsByUnit };
      });
  }, [selectedGeneralCategoryId, subCategories, articles]);

  // Détails de la sous-catégorie sélectionnée
  const categoryDetails = useMemo(() => {
    if (!selectedCategory) return null;
    const items = articles.filter(a => a.categoryId === selectedCategory);
    
    const transit = items.filter(a => {
      const arrival = a.arrivalDate ? new Date(a.arrivalDate) : null;
      return a.status === 'SHIPPED' && arrival && arrival > now;
    });

    const arrived = items.filter(a => {
      const arrival = a.arrivalDate ? new Date(a.arrivalDate) : null;
      return a.status === 'SHIPPED' && arrival && arrival <= now;
    });

    const pending = items.filter(a => a.status === 'TO_ORDER' || a.status === 'PI');

    const totals: Record<string, number> = {};
    items.forEach(a => {
      const unit = a.unitOfMeasure || 'PCS';
      totals[unit] = (totals[unit] || 0) + (Number(a.quantity) || 0);
    });

    return { items, transit, arrived, pending, totals };
  }, [selectedCategory, articles, now]);

  // Vue 3: Détails d'une sous-catégorie
  if (selectedCategory && categoryDetails) {
    return (
      <div className="space-y-6 animate-in fade-in slide-in-from-bottom-2 duration-300">
        <div className="flex items-center justify-between border-b pb-4">
          <div className="flex items-center gap-4">
            <Button variant="outline" size="icon" onClick={() => setSelectedCategory(null)} className="rounded-full">
              <ChevronLeft className="w-4 h-4" />
            </Button>
            <div>
              <h2 className="text-2xl font-bold text-stone-800">{selectedCategory}</h2>
              <p className="text-stone-500 text-sm">Vue détaillée des stocks et commandes</p>
            </div>
          </div>
          <div className="flex gap-4">
            {Object.entries(categoryDetails.totals).map(([unit, val]) => (
              <div key={unit} className="bg-white px-4 py-2 rounded-lg border shadow-sm">
                <p className="text-[10px] font-bold text-stone-400 uppercase tracking-tighter">TOTAL {unit}</p>
                <p className="text-xl font-bold text-stone-800">{val.toLocaleString()}</p>
              </div>
            ))}
          </div>
        </div>

        <div className="space-y-8">
          {/* Section Transit */}
          <div className="space-y-3">
            <div className="flex items-center gap-2">
              <div className="w-2 h-6 bg-blue-500 rounded-full" />
              <h3 className="text-sm font-bold uppercase tracking-widest text-stone-700">Commandes en Transit</h3>
            </div>
            <div className="bg-white rounded-xl border shadow-sm overflow-hidden">
              <Table>
                <TableHeader className="bg-stone-50/50">
                  <TableRow>
                    <TableHead>Désignation</TableHead>
                    <TableHead>Facture</TableHead>
                    <TableHead>Arrivée prévue</TableHead>
                    <TableHead className="text-right">Quantité</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {categoryDetails.transit.length > 0 ? categoryDetails.transit.map(a => (
                    <TableRow key={a.id}>
                      <TableCell className="font-medium">{a.name}</TableCell>
                      <TableCell className="text-stone-500 text-xs">{a.factureId}</TableCell>
                      <TableCell className="text-blue-600 font-medium">{a.arrivalDate}</TableCell>
                      <TableCell className="text-right font-bold">{a.quantity.toLocaleString()} {a.unitOfMeasure}</TableCell>
                    </TableRow>
                  )) : (
                    <TableRow><TableCell colSpan={4} className="text-center py-6 text-stone-400">Aucune commande en transit</TableCell></TableRow>
                  )}
                </TableBody>
              </Table>
            </div>
          </div>

          {/* Section Arrivées */}
          <div className="space-y-3">
            <div className="flex items-center gap-2">
              <div className="w-2 h-6 bg-emerald-500 rounded-full" />
              <h3 className="text-sm font-bold uppercase tracking-widest text-stone-700">Stock Arrivé</h3>
            </div>
            <div className="bg-white rounded-xl border shadow-sm overflow-hidden">
              <Table>
                <TableHeader className="bg-stone-50/50">
                  <TableRow>
                    <TableHead>Désignation</TableHead>
                    <TableHead>Facture</TableHead>
                    <TableHead>Date d'entrée</TableHead>
                    <TableHead className="text-right">Quantité</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {categoryDetails.arrived.length > 0 ? categoryDetails.arrived.map(a => (
                    <TableRow key={a.id}>
                      <TableCell className="font-medium">{a.name}</TableCell>
                      <TableCell className="text-stone-500 text-xs">{a.factureId}</TableCell>
                      <TableCell className="text-stone-500">{a.arrivalDate}</TableCell>
                      <TableCell className="text-right font-bold text-emerald-700">{a.quantity.toLocaleString()} {a.unitOfMeasure}</TableCell>
                    </TableRow>
                  )) : (
                    <TableRow><TableCell colSpan={4} className="text-center py-6 text-stone-400">Aucun stock disponible</TableCell></TableRow>
                  )}
                </TableBody>
              </Table>
            </div>
          </div>

          {/* Section Attente / Production */}
          <div className="space-y-3">
            <div className="flex items-center gap-2">
              <div className="w-2 h-6 bg-amber-500 rounded-full" />
              <h3 className="text-sm font-bold uppercase tracking-widest text-stone-700">En attente / Production</h3>
            </div>
            <div className="bg-white rounded-xl border shadow-sm overflow-hidden">
              <Table>
                <TableHeader className="bg-stone-50/50">
                  <TableRow>
                    <TableHead>Désignation</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Date commande</TableHead>
                    <TableHead className="text-right">Quantité</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {categoryDetails.pending.length > 0 ? categoryDetails.pending.map(a => (
                    <TableRow key={a.id}>
                      <TableCell className="font-medium">{a.name}</TableCell>
                      <TableCell>
                        <Badge variant="outline" className="text-amber-700 bg-amber-50 border-amber-200">
                          {a.status === 'PI' ? 'PRODUCTION' : 'À COMMANDER'}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-stone-500 text-xs">{a.orderDate}</TableCell>
                      <TableCell className="text-right font-bold">{a.quantity.toLocaleString()} {a.unitOfMeasure}</TableCell>
                    </TableRow>
                  )) : (
                    <TableRow><TableCell colSpan={4} className="text-center py-6 text-stone-400">Aucune commande en attente</TableCell></TableRow>
                  )}
                </TableBody>
              </Table>
            </div>
          </div>
        </div>
        
        {/* Graphiques d'analyse en bas */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 pt-8 border-t">
          <Card className="bg-stone-50 border-dashed">
            <CardHeader>
              <CardTitle className="text-xs font-bold uppercase tracking-widest text-stone-500">Tendance des approvisionnements</CardTitle>
            </CardHeader>
            <CardContent className="h-[200px]">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={[
                  { name: 'Jan', val: 400 },
                  { name: 'Fév', val: 300 },
                  { name: 'Mar', val: 600 },
                  { name: 'Avr', val: 800 },
                  { name: 'Mai', val: 500 },
                ]}>
                  <XAxis dataKey="name" fontSize={10} axisLine={false} tickLine={false} />
                  <YAxis hide />
                  <RechartsTooltip />
                  <Line type="monotone" dataKey="val" stroke="#d97706" strokeWidth={2} dot={{ r: 4 }} activeDot={{ r: 6 }} />
                </LineChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>
          <div className="flex flex-col justify-center p-6 bg-white border rounded-xl shadow-sm italic text-stone-400 text-sm text-center">
            Analyses et prévisions avancées à venir prochainement pour cette catégorie.
          </div>
        </div>
      </div>
    );
  }

  // Vue 2: Liste des sous-catégories
  if (selectedGeneralCategoryId) {
    const parent = generalCategories.find(g => g.id === selectedGeneralCategoryId);
    return (
      <div className="space-y-6 animate-in fade-in duration-300">
        <div className="flex items-center gap-4 border-b pb-4">
          <Button variant="outline" size="icon" onClick={() => onSelectGeneralCategory('')} className="rounded-full">
            <ChevronLeft className="w-4 h-4" />
          </Button>
          <div>
            <h2 className="text-2xl font-bold text-stone-800">{parent?.name || "Sous-catégories"}</h2>
            <p className="text-stone-500 text-sm">Sélectionnez un type de produit pour voir le stock</p>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          {displaySubCategories.map(sc => (
            <Card 
              key={sc.id} 
              className="group cursor-pointer border-none shadow-sm hover:ring-2 hover:ring-amber-500/30 transition-all duration-200"
              onClick={() => setSelectedCategory(sc.name)}
            >
              <CardContent className="p-5 flex flex-col h-full">
                <div className="flex justify-between items-start mb-4">
                  <div className="p-2 bg-stone-100 rounded-lg group-hover:bg-amber-100 transition-colors">
                    <Box className="w-5 h-5 text-stone-500 group-hover:text-amber-600" />
                  </div>
                  <ChevronRight className="w-4 h-4 text-stone-300 group-hover:text-amber-400" />
                </div>
                <h3 className="font-bold text-stone-800 mb-3">{sc.name}</h3>
                <div className="mt-auto pt-3 border-t border-stone-100">
                  {Object.entries(sc.totalsByUnit).length > 0 ? (
                    <div className="space-y-1">
                      {Object.entries(sc.totalsByUnit).map(([unit, val]) => (
                        <div key={unit} className="flex justify-between items-center text-xs">
                          <span className="text-stone-500">Total {unit}</span>
                          <span className="font-bold text-stone-700">{val.toLocaleString()}</span>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="text-xs text-stone-400 italic">Aucun article enregistré</p>
                  )}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
    );
  }

  // Vue 1: Liste des catégories principales
  return (
    <div className="space-y-6 animate-in fade-in duration-300">
      <div className="flex flex-col gap-1">
        <h2 className="text-2xl font-bold text-stone-800">Catégories de Produits</h2>
        <p className="text-stone-500 text-sm">Explorez votre inventaire par groupe de produits</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {displayMainCategories.map((gc, idx) => (
          <Card 
            key={gc.id} 
            className="group cursor-pointer border-none shadow-sm hover:shadow-md transition-all duration-300 overflow-hidden"
            onClick={() => onSelectGeneralCategory(gc.id)}
          >
            <div className={`h-1.5 w-full bg-stone-200 group-hover:bg-amber-500 transition-colors`} />
            <CardContent className="p-6">
              <div className="flex justify-between items-center mb-6">
                <div className="p-3 bg-stone-100 rounded-xl group-hover:bg-amber-50 transition-colors">
                  <Layers className="w-6 h-6 text-stone-500 group-hover:text-amber-600" />
                </div>
                <div className="text-right">
                  <p className="text-[10px] font-bold text-stone-400 uppercase tracking-widest">Articles</p>
                  <p className="text-xl font-bold text-stone-800">{gc.artCount}</p>
                </div>
              </div>
              <h3 className="text-lg font-bold text-stone-800 mb-1">{gc.name}</h3>
              <p className="text-sm text-stone-500">{gc.subCount} sous-catégories associées</p>
              
              <div className="mt-6 flex items-center text-xs font-bold text-amber-600 opacity-0 group-hover:opacity-100 transition-opacity">
                VOIR LES DÉTAILS <ArrowRight className="w-3 h-3 ml-1" />
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}