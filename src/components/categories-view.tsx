
"use client";

import React, { useMemo, useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { 
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow 
} from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { 
  ChevronLeft, 
  Truck, 
  CheckCircle2,
  LayoutGrid,
  Package,
  ArrowUpRight,
  Search,
  TrendingUp,
  Box,
  DollarSign,
  Trash2,
  Users,
  Factory,
  Settings2,
  MousePointer2
} from 'lucide-react';
import { 
  BarChart, Bar, XAxis, YAxis, Tooltip as RechartsTooltip, ResponsiveContainer, 
  Cell, PieChart, Pie, Legend, LineChart, Line, CartesianGrid
} from 'recharts';
import { useUser, useFirestore, deleteDocumentNonBlocking } from '@/firebase';
import { doc } from 'firebase/firestore';
import { useToast } from '@/hooks/use-toast';

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

const UI_COLORS = ['#CC8626', '#1E293B', '#3B82F6', '#10B981', '#6366F1', '#F43F5E', '#8B5CF6', '#EC4899'];
const STATUS_COLORS = {
  'TRANSIT': '#3B82F6',
  'ARRIVED': '#10B981',
  'PENDING': '#F59E0B'
};

export default function CategoriesView({
  articles = [],
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
  const [searchTerm, setSearchTerm] = useState('');
  const [todayStr, setTodayStr] = useState('');

  useEffect(() => {
    const today = new Date();
    const year = today.getFullYear();
    const month = String(today.getMonth() + 1).padStart(2, '0');
    const day = String(today.getDate()).padStart(2, '0');
    setTodayStr(`${year}-${month}-${day}`);
  }, []);

  const isSpecialZipperCategory = (catName: string | undefined) => {
    if (!catName) return false;
    const upper = catName.toUpperCase();
    const isZipper = upper.includes('ZIPPER');
    const isExcluded = upper.includes('LONG CHAIN') || upper.includes('SLIDER');
    return isZipper && !isExcluded;
  };

  const handleDeleteSubCategory = (e: React.MouseEvent, id: string, name: string) => {
    e.stopPropagation();
    if (!user || !firestore) return;
    if (window.confirm(`Supprimer définitivement la famille "${name}" ?`)) {
      const docRef = doc(firestore, 'users', user.uid, 'categories', id);
      deleteDocumentNonBlocking(docRef);
      toast({ title: "Famille supprimée", description: name });
    }
  };

  const groupStats = useMemo(() => {
    if (!todayStr) return {};
    const stats: Record<string, any> = {};

    generalCategories.forEach(gc => {
      const subCatNames = subCategories
        .filter(sc => sc.generalCategoryId === gc.id)
        .map(sc => sc.name);

      const groupArticles = articles.filter(a => 
        a.generalCategoryId === gc.id || 
        subCatNames.includes(a.categoryId)
      );

      let totalValue = 0;
      
      const futureArrivals = groupArticles
        .filter(a => a.status === 'SHIPPED' && a.arrivalDate && a.arrivalDate > todayStr)
        .map(a => a.arrivalDate as string);
      
      const nextArrival = futureArrivals.length > 0 
        ? futureArrivals.sort()[0]
        : '-';

      groupArticles.forEach(a => {
        totalValue += (Number(a.quantity) || 0) * (Number(a.purchasePricePerUnit) || 0);
      });

      stats[gc.id] = { 
        name: gc.name, 
        count: groupArticles.length, 
        totalValue,
        nextArrival
      };
    });
    return stats;
  }, [generalCategories, articles, subCategories, todayStr]);

  const subCategoryStats = useMemo(() => {
    if (!selectedGeneralCategoryId || !todayStr) return [];
    
    return subCategories
      .filter(sc => sc.generalCategoryId === selectedGeneralCategoryId)
      .map(sc => {
        const catArticles = articles.filter(a => a.categoryId === sc.name);
        let totalValue = 0;
        
        const futureArrivals = catArticles
          .filter(a => a.status === 'SHIPPED' && a.arrivalDate && a.arrivalDate > todayStr)
          .map(a => a.arrivalDate as string);
        
        const nextArrival = futureArrivals.length > 0 
          ? futureArrivals.sort()[0]
          : '-';

        catArticles.forEach(a => {
          totalValue += (Number(a.quantity) || 0) * (Number(a.purchasePricePerUnit) || 0);
        });

        return { 
          ...sc, 
          count: catArticles.length, 
          nextArrival, 
          totalValue 
        };
      })
      .filter(sc => sc.name.toLowerCase().includes(searchTerm.toLowerCase()));
  }, [selectedGeneralCategoryId, subCategories, articles, searchTerm, todayStr]);

  const currentArticles = useMemo(() => {
    if (!selectedCategory) return [];
    return articles.filter(a => a.categoryId === selectedCategory);
  }, [selectedCategory, articles]);

  const groupedData = useMemo(() => {
    if (!selectedCategory || !todayStr) return null;
    
    return {
      transit: currentArticles.filter(a => a.status === 'SHIPPED' && a.arrivalDate && a.arrivalDate > todayStr),
      arrived: currentArticles.filter(a => 
        (a.status === 'SHIPPED' && a.arrivalDate && a.arrivalDate <= todayStr)
      ),
      production: currentArticles.filter(a => a.status === 'PI'),
      pending: currentArticles.filter(a => a.status === 'TO_ORDER')
    };
  }, [currentArticles, selectedCategory, todayStr]);

  const headerStats = useMemo(() => {
    if (!currentArticles.length || !todayStr) return null;
    
    const totalVal = currentArticles.reduce((s, a) => s + ((Number(a.quantity) || 0) * (Number(a.purchasePricePerUnit) || 0)), 0);
    const totalQty = currentArticles.reduce((s, a) => s + (Number(a.quantity) || 0), 0);

    const futureArrivals = currentArticles
      .filter(a => a.status === 'SHIPPED' && a.arrivalDate && a.arrivalDate > todayStr)
      .map(a => a.arrivalDate as string);
    
    const nextArrival = futureArrivals.length > 0 
      ? futureArrivals.sort()[0]
      : '-';

    const allOrderDates = currentArticles
      .map(a => a.orderDate || (a.createdAt ? new Date(a.createdAt.seconds * 1000).toISOString().split('T')[0] : null))
      .filter(Boolean) as string[];
    
    const lastOrder = allOrderDates.length > 0
      ? allOrderDates.sort((a, b) => b.localeCompare(a))[0]
      : '-';

    return {
      totalVal,
      totalQty,
      nextArrival,
      lastOrder
    };
  }, [currentArticles, todayStr]);

  const detailedAnalytics = useMemo(() => {
    if (!selectedCategory || !groupedData) return null;
    
    const statusValue = [
      { name: 'En Transit', value: 0, color: STATUS_COLORS.TRANSIT },
      { name: 'Réceptionné', value: 0, color: STATUS_COLORS.ARRIVED },
      { name: 'En Production', value: 0, color: STATUS_COLORS.PENDING },
    ];
    
    groupedData.transit.forEach(a => statusValue[0].value += ((Number(a.quantity) || 0) * (Number(a.purchasePricePerUnit) || 0)));
    groupedData.arrived.forEach(a => statusValue[1].value += ((Number(a.quantity) || 0) * (Number(a.purchasePricePerUnit) || 0)));
    groupedData.production.forEach(a => statusValue[2].value += ((Number(a.quantity) || 0) * (Number(a.purchasePricePerUnit) || 0)));

    const quantityEvolution: Record<string, number> = {};
    const supplierMap: Record<string, number> = {};

    currentArticles.forEach(a => {
      const date = a.orderDate || (a.createdAt ? new Date(a.createdAt.seconds * 1000).toISOString().split('T')[0] : null);
      if (date) {
        const month = date.substring(0, 7);
        quantityEvolution[month] = (quantityEvolution[month] || 0) + (Number(a.quantity) || 0);
      }

      const sup = a.supplierId || 'Inconnu';
      const val = (Number(a.quantity) || 0) * (Number(a.purchasePricePerUnit) || 0);
      supplierMap[sup] = (supplierMap[sup] || 0) + val;
    });

    const quantityData = Object.entries(quantityEvolution)
      .map(([date, value]) => ({ date, value }))
      .sort((a, b) => a.date.localeCompare(b.date));

    const supplierDistribution = Object.entries(supplierMap)
      .map(([name, value]) => ({ name, value }))
      .sort((a, b) => b.value - a.value);

    const productsSet = new Set<string>();
    currentArticles.forEach(a => {
      const parts = [];
      const isSpecial = isSpecialZipperCategory(a.categoryId);
      
      if (a.size) parts.push(a.size);
      
      if (isSpecial) {
        if (a.zipperType) parts.push(a.zipperType);
        if (a.slider) parts.push(a.slider);
      }
      
      if (a.color) parts.push(a.color.toUpperCase());
      
      const key = parts.length > 0 ? parts.join(' - ') : 'DIVERS';
      productsSet.add(key);
    });
    const uniqueProducts = Array.from(productsSet);

    const dateGroups: Record<string, any> = {};
    currentArticles.forEach(a => {
      const date = a.orderDate || (a.createdAt ? new Date(a.createdAt.seconds * 1000).toISOString().split('T')[0] : null);
      if (!date) return;
      if (!dateGroups[date]) dateGroups[date] = { date };
      
      const parts = [];
      const isSpecial = isSpecialZipperCategory(a.categoryId);
      
      if (a.size) parts.push(a.size);
      
      if (isSpecial) {
        if (a.zipperType) parts.push(a.zipperType);
        if (a.slider) parts.push(a.slider);
      }
      
      if (a.color) parts.push(a.color.toUpperCase());
      
      const productKey = parts.length > 0 ? parts.join(' - ') : 'DIVERS';
      
      dateGroups[date][productKey] = Number(a.purchasePricePerUnit) || 0;
    });

    const priceData = Object.values(dateGroups).sort((a, b) => a.date.localeCompare(b.date));

    return { statusValue, quantityData, priceData, uniqueProducts, supplierDistribution };
  }, [selectedCategory, currentArticles, groupedData, todayStr]);

  if (selectedCategory && groupedData && detailedAnalytics) {
    return (
      <div className="space-y-8 animate-in fade-in slide-in-from-bottom-2 duration-500">
        <header className="bg-white rounded-[2rem] shadow-xl border border-stone-200 overflow-hidden">
          <div className="bg-stone-900 p-8 flex flex-col xl:flex-row justify-between items-start xl:items-center gap-8 relative">
            <div className="absolute top-0 right-0 w-[600px] h-[600px] bg-amber-500/5 rounded-full -translate-y-1/2 translate-x-1/4 blur-[120px]" />
            
            <div className="flex items-center gap-5 relative z-10 lg:w-1/3">
              <Button 
                variant="outline" 
                size="icon" 
                onClick={() => setSelectedCategory(null)} 
                className="h-12 w-12 rounded-2xl bg-white/5 border-white/10 text-white hover:bg-white/10 transition-all shadow-xl"
              >
                <ChevronLeft className="w-5 h-5" />
              </Button>
              <div>
                <p className="text-[9px] font-black text-amber-500 uppercase tracking-[0.3em] mb-1">Audit Analytique Produit</p>
                <h2 className="text-3xl font-black text-white tracking-tighter uppercase leading-none">{selectedCategory}</h2>
              </div>
            </div>

            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 relative z-10 w-full xl:w-2/3">
              {headerStats && (
                <>
                  <div className="px-5 py-3 bg-white/5 border border-white/10 rounded-xl backdrop-blur-md">
                    <p className="text-[7px] font-black text-stone-500 uppercase tracking-widest mb-1.5">Valeur Totale CMD</p>
                    <p className="text-lg font-black text-white leading-none">{headerStats.totalVal.toLocaleString()} $</p>
                  </div>
                  <div className="px-5 py-3 bg-white/5 border border-white/10 rounded-xl backdrop-blur-md">
                    <p className="text-[7px] font-black text-stone-500 uppercase tracking-widest mb-1.5">Quantité Totale CMD</p>
                    <p className="text-lg font-black text-white leading-none">{headerStats.totalQty.toLocaleString()}</p>
                  </div>
                  <div className="px-5 py-3 bg-white/5 border border-white/10 rounded-xl backdrop-blur-md">
                    <p className="text-[7px] font-black text-stone-500 uppercase tracking-widest mb-1.5">Prochaine Arrivée</p>
                    <p className="text-lg font-black text-blue-400 leading-none">{headerStats.nextArrival}</p>
                  </div>
                  <div className="px-5 py-3 bg-white/5 border border-white/10 rounded-xl backdrop-blur-md">
                    <p className="text-[7px] font-black text-stone-500 uppercase tracking-widest mb-1.5">Dernière Commande</p>
                    <p className="text-lg font-black text-stone-200 leading-none">{headerStats.lastOrder}</p>
                  </div>
                </>
              )}
            </div>
          </div>
        </header>

        <div className="grid grid-cols-1 gap-10">
          <section className="space-y-4">
            <div className="flex items-center justify-between px-2">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-amber-500/10 rounded-xl">
                  <Factory className="w-5 h-5 text-amber-600" />
                </div>
                <div>
                  <h3 className="font-black text-stone-900 uppercase text-xs tracking-[0.2em]">Manifeste de Production (PI)</h3>
                  <p className="text-[10px] text-stone-400 font-bold uppercase">Commandes lancées en cours de fabrication</p>
                </div>
              </div>
              <Badge variant="secondary" className="bg-amber-50 text-amber-700 border-amber-100 font-black text-[10px]">
                {groupedData.production.length} LIGNES EN PRODUCTION
              </Badge>
            </div>
            <Card className="border-stone-200 shadow-xl rounded-2xl overflow-hidden">
              <Table>
                <TableHeader className="bg-stone-50/80 backdrop-blur-sm">
                  <TableRow>
                    <TableHead className="text-[10px] uppercase font-black py-4 px-6 text-stone-500">Désignation</TableHead>
                    <TableHead className="text-[10px] uppercase font-black py-4 text-stone-500">Taille</TableHead>
                    <TableHead className="text-[10px] uppercase font-black py-4 text-stone-500">Couleur</TableHead>
                    <TableHead className="text-[10px] uppercase font-black py-4 text-stone-500">Technique / Spécifications</TableHead>
                    <TableHead className="text-[10px] uppercase font-black py-4 text-stone-500">Fournisseur</TableHead>
                    <TableHead className="text-[10px] uppercase font-black py-4 text-stone-500">Date Cmd</TableHead>
                    <TableHead className="text-right text-[10px] uppercase font-black py-4 text-stone-500">Quantité</TableHead>
                    <TableHead className="text-right text-[10px] uppercase font-black py-4 text-stone-500">P.A. Unit.</TableHead>
                    <TableHead className="text-right text-[10px] uppercase font-black py-4 px-6 text-stone-500">Valeur Est.</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {groupedData.production.length > 0 ? groupedData.production.map(a => {
                    const isSpecial = isSpecialZipperCategory(a.categoryId);
                    return (
                      <TableRow key={a.id} className="hover:bg-amber-50/20 transition-colors">
                        <TableCell className="py-3 px-6">
                          <div className="font-black text-[11px] text-stone-900 uppercase">{a.name}</div>
                        </TableCell>
                        <TableCell className="py-3">
                          <span className="text-[10px] text-stone-600 uppercase">{a.size || '-'}</span>
                        </TableCell>
                        <TableCell className="py-3">
                          <span className="text-[10px] text-stone-900 uppercase">{a.color || '-'}</span>
                        </TableCell>
                        <TableCell className="text-[10px] py-3">
                          {isSpecial ? (
                            <div className="flex flex-col gap-0.5">
                              <span className="text-amber-600 font-black text-[8px] flex items-center gap-1.5 uppercase"><Settings2 className="w-2.5 h-2.5" /> TYPE: {a.zipperType || '-'}</span>
                              <span className="text-blue-600 font-black text-[8px] flex items-center gap-1.5 uppercase"><MousePointer2 className="w-2.5 h-2.5" /> {a.slider || '-'} ({a.sliderType || '-'})</span>
                            </div>
                          ) : (
                            <span className="text-stone-500 font-bold uppercase">{a.specs || '-'}</span>
                          )}
                        </TableCell>
                        <TableCell className="text-stone-400 font-black text-[10px] py-3 uppercase">{a.supplierId}</TableCell>
                        <TableCell className="text-stone-500 font-bold text-[10px] py-3">{a.orderDate || '-'}</TableCell>
                        <TableCell className="text-right font-black text-stone-900 text-[11px] py-3">
                          {a.quantity.toLocaleString()} <span className="text-[8px] text-stone-400 font-bold ml-1 uppercase">{a.unitOfMeasure}</span>
                        </TableCell>
                        <TableCell className="text-right font-black text-amber-700 text-[10px] py-3">
                          {Number(a.purchasePricePerUnit).toFixed(4)} $
                        </TableCell>
                        <TableCell className="text-right font-black text-amber-600 text-[11px] py-3 px-6">
                          {(a.quantity * a.purchasePricePerUnit).toLocaleString()} $
                        </TableCell>
                      </TableRow>
                    );
                  }) : (
                    <TableRow><TableCell colSpan={9} className="text-center py-12 text-stone-300 text-[10px] uppercase font-black tracking-widest bg-stone-50/20">Aucune commande en production détectée</TableCell></TableRow>
                  )}
                </TableBody>
              </Table>
            </Card>
          </section>

          <section className="space-y-4">
            <div className="flex items-center justify-between px-2">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-blue-500/10 rounded-xl">
                  <Truck className="w-5 h-5 text-blue-600" />
                </div>
                <div>
                  <h3 className="font-black text-stone-900 uppercase text-xs tracking-[0.2em]">Manifeste de Transit</h3>
                  <p className="text-[10px] text-stone-400 font-bold uppercase">Flux logistiques en cours d'acheminement</p>
                </div>
              </div>
              <Badge variant="secondary" className="bg-blue-50 text-blue-700 border-blue-100 font-black text-[10px]">
                {groupedData.transit.length} LIGNES ACTIVES
              </Badge>
            </div>
            <Card className="border-stone-200 shadow-xl rounded-2xl overflow-hidden">
              <Table>
                <TableHeader className="bg-stone-50/80 backdrop-blur-sm">
                  <TableRow>
                    <TableHead className="text-[10px] uppercase font-black py-4 px-6 text-stone-500">Désignation</TableHead>
                    <TableHead className="text-[10px] uppercase font-black py-4 text-stone-500">Taille</TableHead>
                    <TableHead className="text-[10px] uppercase font-black py-4 text-stone-500">Couleur</TableHead>
                    <TableHead className="text-[10px] uppercase font-black py-4 text-stone-500">Technique / Spécifications</TableHead>
                    <TableHead className="text-[10px] uppercase font-black py-4 text-stone-500">Partenaire</TableHead>
                    <TableHead className="text-[10px] uppercase font-black py-4 text-stone-500">Arrivée</TableHead>
                    <TableHead className="text-[10px] uppercase font-black py-4 text-stone-500">N° Dossier</TableHead>
                    <TableHead className="text-right text-[10px] uppercase font-black py-4 text-stone-500">Quantité</TableHead>
                    <TableHead className="text-right text-[10px] uppercase font-black py-4 px-6 text-stone-500">Valeur Totale</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {groupedData.transit.length > 0 ? groupedData.transit.map(a => {
                    const isSpecial = isSpecialZipperCategory(a.categoryId);
                    return (
                      <TableRow key={a.id} className="hover:bg-blue-50/20 transition-colors">
                        <TableCell className="py-3 px-6">
                          <div className="font-black text-[11px] text-stone-900 uppercase">{a.name}</div>
                        </TableCell>
                        <TableCell className="py-3">
                          <span className="text-[10px] text-stone-600 uppercase">{a.size || '-'}</span>
                        </TableCell>
                        <TableCell className="py-3">
                          <span className="text-[10px] text-stone-900 uppercase">{a.color || '-'}</span>
                        </TableCell>
                        <TableCell className="text-[10px] py-3">
                          {isSpecial ? (
                            <div className="flex flex-col gap-0.5">
                              <span className="text-amber-600 font-black text-[8px] flex items-center gap-1.5 uppercase"><Settings2 className="w-2.5 h-2.5" /> TYPE: {a.zipperType || '-'}</span>
                              <span className="text-blue-600 font-black text-[8px] flex items-center gap-1.5 uppercase"><MousePointer2 className="w-2.5 h-2.5" /> {a.slider || '-'} ({a.sliderType || '-'})</span>
                            </div>
                          ) : (
                            <span className="text-stone-500 font-bold uppercase">{a.specs || '-'}</span>
                          )}
                        </TableCell>
                        <TableCell className="text-stone-400 font-black text-[10px] py-3 uppercase">{a.supplierId}</TableCell>
                        <TableCell className="text-blue-600 font-black text-[10px] py-3">{a.arrivalDate || '-'}</TableCell>
                        <TableCell className="py-3">
                          <span className="text-[10px] font-black text-blue-700 bg-blue-50 px-3 py-1 rounded-full border border-blue-100 uppercase">{a.factureId}</span>
                        </TableCell>
                        <TableCell className="text-right font-black text-stone-900 text-[11px] py-3">
                          {a.quantity.toLocaleString()} <span className="text-[8px] text-stone-400 font-bold ml-1 uppercase">{a.unitOfMeasure}</span>
                        </TableCell>
                        <TableCell className="text-right font-black text-blue-700 text-[11px] py-3 px-6">
                          {(a.quantity * a.purchasePricePerUnit).toLocaleString()} $
                        </TableCell>
                      </TableRow>
                    );
                  }) : (
                    <TableRow><TableCell colSpan={9} className="text-center py-12 text-stone-300 text-[10px] uppercase font-black tracking-widest bg-stone-50/20">Aucun mouvement en transit détecté</TableCell></TableRow>
                  )}
                </TableBody>
              </Table>
            </Card>
          </section>

          <section className="space-y-4">
            <div className="flex items-center justify-between px-2">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-emerald-500/10 rounded-xl">
                  <CheckCircle2 className="w-5 h-5 text-emerald-600" />
                </div>
                <div>
                  <h3 className="font-black text-stone-900 uppercase text-xs tracking-[0.2em]">Inventaire Réceptionné</h3>
                  <p className="text-[10px] text-stone-400 font-bold uppercase">Stock physique certifié disponible</p>
                </div>
              </div>
              <Badge variant="secondary" className="bg-emerald-50 text-emerald-700 border-emerald-100 font-black text-[10px]">
                {groupedData.arrived.length} LIGNES EN STOCK
              </Badge>
            </div>
            <Card className="border-stone-200 shadow-xl rounded-2xl overflow-hidden">
              <Table>
                <TableHeader className="bg-stone-50/80">
                  <TableRow>
                    <TableHead className="text-[10px] font-black uppercase py-4 px-6 text-stone-500">Désignation</TableHead>
                    <TableHead className="text-[10px] font-black uppercase py-4 text-stone-500">Taille</TableHead>
                    <TableHead className="text-[10px] font-black uppercase py-4 text-stone-500">Couleur</TableHead>
                    <TableHead className="text-[10px] font-black uppercase py-4 text-stone-500">Technique / Spécifications</TableHead>
                    <TableHead className="text-[10px] font-black uppercase py-4 text-stone-500">Date Cmd</TableHead>
                    <TableHead className="text-[10px] font-black uppercase py-4 text-stone-500">Réceptionné le</TableHead>
                    <TableHead className="text-right text-[10px] font-black uppercase py-4 text-stone-500">Stock Réel</TableHead>
                    <TableHead className="text-right text-[10px] font-black uppercase py-4 px-6 text-stone-500">Valeur Totale</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {groupedData.arrived.length > 0 ? groupedData.arrived.map(a => {
                    const isSpecial = isSpecialZipperCategory(a.categoryId);
                    return (
                      <TableRow key={a.id} className="hover:bg-emerald-50/20 transition-colors">
                        <TableCell className="py-3 px-6">
                          <div className="font-black text-[11px] text-stone-900 uppercase">{a.name}</div>
                        </TableCell>
                        <TableCell className="py-3">
                          <span className="text-[10px] text-stone-600 uppercase">{a.size || '-'}</span>
                        </TableCell>
                        <TableCell className="py-3">
                          <span className="text-[10px] text-stone-900 uppercase">{a.color || '-'}</span>
                        </TableCell>
                        <TableCell className="text-[10px] py-3">
                          {isSpecial ? (
                            <div className="flex flex-col gap-0.5">
                              <span className="text-amber-600 font-black text-[8px] flex items-center gap-1.5 uppercase"><Settings2 className="w-2.5 h-2.5" /> TYPE: {a.zipperType || '-'}</span>
                              <span className="text-blue-600 font-black text-[8px] flex items-center gap-1.5 uppercase"><MousePointer2 className="w-2.5 h-2.5" /> {a.slider || '-'} ({a.sliderType || '-'})</span>
                            </div>
                          ) : (
                            <span className="text-stone-500 font-bold uppercase">{a.specs || '-'}</span>
                          )}
                        </TableCell>
                        <TableCell className="text-stone-500 font-bold text-[10px] py-3">{a.orderDate || '-'}</TableCell>
                        <TableCell className="text-emerald-700 font-black text-[10px] py-3 uppercase">{a.arrivalDate}</TableCell>
                        <TableCell className="text-right font-black text-stone-900 text-[11px] py-3">
                          {a.quantity.toLocaleString()} <span className="text-[8px] text-stone-400 font-normal uppercase ml-1">{a.unitOfMeasure}</span>
                        </TableCell>
                        <TableCell className="text-right font-black text-emerald-700 text-[11px] py-3 px-6">
                          {(a.quantity * a.purchasePricePerUnit).toLocaleString()} $
                        </TableCell>
                      </TableRow>
                    );
                  }) : (
                    <TableRow><TableCell colSpan={8} className="text-center py-12 text-stone-300 text-[10px] uppercase font-black tracking-widest bg-stone-50/20">Rupture de stock physique</TableCell></TableRow>
                  )}
                </TableBody>
              </Table>
            </Card>
          </section>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8 pt-10 border-t border-stone-200">
          <Card className="border-none shadow-xl bg-white rounded-3xl overflow-hidden group">
            <div className="h-1.5 w-full bg-stone-900" />
            <CardHeader className="py-4 border-b border-stone-50">
              <CardTitle className="text-[10px] font-black uppercase text-stone-400 tracking-widest flex items-center gap-2">
                <Box className="w-3 h-3 text-amber-500" /> Volumes Mensuels Commandés
              </CardTitle>
            </CardHeader>
            <CardContent className="h-[300px] p-4">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={detailedAnalytics.quantityData}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f1f1" />
                  <XAxis dataKey="date" axisLine={false} tickLine={false} style={{ fontSize: '9px', fontWeight: '900' }} />
                  <YAxis axisLine={false} tickLine={false} style={{ fontSize: '9px', fontWeight: '900' }} />
                  <RechartsTooltip contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 10px 40px rgba(0,0,0,0.1)', fontWeight: 'bold' }} />
                  <Bar dataKey="value" fill="#CC8626" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>

          <Card className="border-none shadow-xl bg-white rounded-3xl overflow-hidden group">
            <div className="h-1.5 w-full bg-blue-500" />
            <CardHeader className="py-4 border-b border-stone-50">
              <CardTitle className="text-[10px] font-black uppercase text-stone-400 tracking-widest flex items-center gap-2">
                <TrendingUp className="w-3 h-3 text-blue-500" /> Évolution du Prix par Variante ($)
              </CardTitle>
            </CardHeader>
            <CardContent className="h-[300px] p-6">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={detailedAnalytics.priceData}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f1f1" />
                  <XAxis dataKey="date" axisLine={false} tickLine={false} style={{ fontSize: '9px', fontVariantCaps: 'all-small-caps', fontWeight: '900', textTransform: 'uppercase' }} />
                  <YAxis axisLine={false} tickLine={false} style={{ fontSize: '9px', fontWeight: '900' }} />
                  <RechartsTooltip contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 10px 40px rgba(0,0,0,0.1)', fontWeight: 'bold' }} />
                  <Legend verticalAlign="top" height={36} iconType="circle" wrapperStyle={{ fontSize: '8px', fontVariantCaps: 'all-small-caps', fontWeight: '900', textTransform: 'uppercase', paddingBottom: '20px' }} />
                  {detailedAnalytics.uniqueProducts.map((product, idx) => (
                    <Line 
                      key={product} 
                      type="monotone" 
                      dataKey={product} 
                      name={product}
                      stroke={UI_COLORS[idx % UI_COLORS.length]} 
                      strokeWidth={3} 
                      dot={{ r: 4, fill: UI_COLORS[idx % UI_COLORS.length], strokeWidth: 0 }} 
                      activeDot={{ r: 6 }} 
                      connectNulls={true}
                    />
                  ))}
                </LineChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>

          <Card className="border-none shadow-xl bg-white rounded-3xl overflow-hidden group">
            <div className="h-1.5 w-full bg-emerald-500" />
            <CardHeader className="py-4 border-b border-stone-50">
              <CardTitle className="text-[10px] font-black uppercase text-stone-400 tracking-widest flex items-center gap-2">
                <Users className="w-3 h-3 text-emerald-500" /> Répartition par Fournisseur (%)
              </CardTitle>
            </CardHeader>
            <CardContent className="h-[300px] p-6">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={detailedAnalytics.supplierDistribution}
                    cx="50%"
                    cy="50%"
                    innerRadius={60}
                    outerRadius={80}
                    paddingAngle={5}
                    dataKey="value"
                  >
                    {detailedAnalytics.supplierDistribution.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={UI_COLORS[index % UI_COLORS.length]} />
                    ))}
                  </Pie>
                  <RechartsTooltip formatter={(val: number) => [`${val.toLocaleString()} $`]} />
                  <Legend verticalAlign="bottom" height={36} iconType="circle" wrapperStyle={{ fontSize: '9px', fontWeight: '900', textTransform: 'uppercase' }} />
                </PieChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>
        </div>
      </div>
    );
  }

  if (selectedGeneralCategoryId) {
    const parent = generalCategories.find(g => g.id === selectedGeneralCategoryId);
    return (
      <div className="space-y-6 animate-in fade-in duration-500">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-white p-6 rounded-[1.5rem] shadow-xl border border-stone-100">
          <div className="flex items-center gap-4">
            <Button variant="outline" size="icon" onClick={() => onSelectGeneralCategory(null)} className="h-10 w-10 rounded-xl border-stone-200 hover:border-stone-900 transition-all">
              <ChevronLeft className="w-4 h-4" />
            </Button>
            <div>
              <p className="text-[9px] font-black text-amber-500 uppercase tracking-[0.2em] mb-0.5">Exploration du Pôle</p>
              <h2 className="text-xl font-black text-stone-900 uppercase tracking-tighter leading-none">{parent?.name}</h2>
            </div>
          </div>
          <div className="relative w-full md:w-64">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-stone-400" />
            <Input 
              placeholder="Chercher famille..." 
              value={searchTerm} 
              onChange={e => setSearchTerm(e.target.value)}
              className="pl-9 h-10 text-[10px] font-bold border-stone-200 bg-stone-50 rounded-xl focus:ring-stone-900 transition-all"
            />
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-5 gap-4">
          {subCategoryStats.map((sc, idx) => (
            <Card 
              key={sc.id} 
              className="cursor-pointer border-stone-100 hover:border-amber-400 hover:bg-amber-50/20 transition-all shadow-lg hover:shadow-amber-500/10 group rounded-[1.2rem] overflow-hidden bg-white active:scale-95"
              onClick={() => setSelectedCategory(sc.name)}
            >
              <CardContent className="p-0">
                <div className={`h-1 w-full ${UI_COLORS[idx % UI_COLORS.length]}`} style={{ backgroundColor: UI_COLORS[idx % UI_COLORS.length] }} />
                <div className="p-4">
                  <div className="flex justify-between items-start mb-3">
                    <div className="p-2 bg-stone-50 rounded-lg group-hover:bg-white transition-colors">
                      <Package className="w-3.5 h-3.5 text-stone-300 group-hover:text-stone-900" />
                    </div>
                    <div className="flex items-center gap-1">
                      <Button 
                        variant="ghost" 
                        size="icon" 
                        className="h-6 w-6 text-stone-300 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors opacity-0 group-hover:opacity-100"
                        onClick={(e) => handleDeleteSubCategory(e, sc.id, sc.name)}
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </Button>
                      <Badge className="bg-stone-900 text-white text-[8px] font-black uppercase px-2">{sc.count}</Badge>
                    </div>
                  </div>
                  <h3 className="font-black text-[11px] text-stone-800 uppercase leading-tight mb-4 line-clamp-2 min-h-[2rem] group-hover:text-stone-900">{sc.name}</h3>
                  
                  <div className="space-y-2 pt-3 border-t border-stone-50">
                    <div className="flex justify-between items-center text-[8px]">
                      <span className="text-stone-400 font-black uppercase flex items-center gap-1">
                        <Truck className="w-2.5 h-2.5" /> PROCHAINE
                      </span>
                      <span className={`font-black ${sc.nextArrival !== '-' ? 'text-blue-600' : 'text-stone-300'}`}>
                        {sc.nextArrival}
                      </span>
                    </div>
                    <div className="flex justify-between items-center text-[8px]">
                      <span className="text-stone-400 font-black uppercase flex items-center gap-1">
                        <DollarSign className="w-2.5 h-2.5" /> VALEUR TOTALE
                      </span>
                      <span className="font-black text-stone-900">
                        {Math.round(sc.totalValue).toLocaleString()} $
                      </span>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-10 animate-in fade-in duration-700">
      <header className="bg-stone-900 p-8 rounded-[2.5rem] shadow-2xl relative overflow-hidden">
        <div className="absolute top-0 right-0 w-[500px] h-[500px] bg-amber-500/5 rounded-full -translate-y-1/2 translate-x-1/2 blur-[100px]" />
        <div className="relative z-10">
          <Badge className="bg-amber-500 text-white border-none px-4 py-1 text-[9px] font-black uppercase tracking-widest rounded-full mb-4">Architecture de Données</Badge>
          <h2 className="text-4xl font-black text-white uppercase tracking-tighter leading-tight">Répertoire <br /><span className="text-amber-500">Logistique</span></h2>
          <p className="text-stone-400 text-xs font-medium mt-3 max-sm leading-relaxed">Exploration granulaire des stocks et flux financiers par pôle d'activité.</p>
        </div>
      </header>

      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-6">
        {Object.entries(groupStats).map(([id, stat], idx) => (
          <Card 
            key={id} 
            className="group cursor-pointer border-none bg-white shadow-xl hover:shadow-2xl transition-all rounded-[1.5rem] overflow-hidden active:scale-95 status-glow-amber"
            onClick={() => onSelectGeneralCategory(id)}
          >
            <div className={`h-1.5 w-full`} style={{ backgroundColor: UI_COLORS[idx % UI_COLORS.length] }} />
            <CardContent className="p-6">
              <div className="flex justify-between items-center mb-6">
                <div className="p-3 bg-stone-50 rounded-xl text-stone-200 group-hover:bg-stone-900 group-hover:text-white transition-all">
                  <LayoutGrid className="w-6 h-6" />
                </div>
                <div className="text-right">
                  <p className="text-xl font-black text-stone-900">{stat.count}</p>
                  <p className="text-[8px] font-black text-stone-400 uppercase tracking-widest">Articles</p>
                </div>
              </div>
              <h3 className="text-sm font-black text-stone-800 uppercase leading-none mb-6 group-hover:text-stone-900 tracking-tighter">{stat.name}</h3>
              <div className="space-y-2 pt-5 border-t border-stone-50">
                <div className="flex justify-between items-center text-[9px]">
                  <span className="text-stone-400 font-black uppercase flex items-center gap-1">
                    <Truck className="w-2.5 h-2.5" /> PROCHAINE
                  </span>
                  <span className={`font-black ${stat.nextArrival !== '-' ? 'text-blue-600' : 'text-stone-300'}`}>
                    {stat.nextArrival}
                  </span>
                </div>
                <div className="flex justify-between items-center text-[9px]">
                  <span className="text-stone-400 font-black uppercase flex items-center gap-1">
                    <DollarSign className="w-2.5 h-2.5" /> VALEUR TOTALE
                  </span>
                  <span className="font-black text-stone-800">
                    {Math.round(stat.totalValue).toLocaleString()} $
                  </span>
                </div>
              </div>
              <div className="mt-6 flex justify-end">
                <div className="p-1.5 bg-stone-50 rounded opacity-0 group-hover:opacity-100 transition-all translate-x-2 group-hover:translate-x-0">
                  <ArrowUpRight className="w-3.5 h-3.5 text-stone-900" />
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
