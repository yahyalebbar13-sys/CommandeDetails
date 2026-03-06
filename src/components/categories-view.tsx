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
  BarChart3,
  PieChart as PieChartIcon,
  Activity,
  Package,
  ArrowUpRight
} from 'lucide-react';
import { 
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip as RechartsTooltip, ResponsiveContainer, 
  Cell, PieChart, Pie, Legend
} from 'recharts';

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

const UI_COLORS = ['#CC8626', '#3b82f6', '#10b981', '#6366f1', '#f43f5e', '#1e293b'];
const STATUS_COLORS = {
  'TRANSIT': '#3b82f6',
  'ARRIVED': '#10b981',
  'PENDING': '#f59e0b'
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

  // Global Memos for data processing
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

  const currentTotalsByUnit = useMemo(() => {
    const totals: Record<string, number> = {};
    currentArticles.forEach(a => {
      const unit = (a.unitOfMeasure || 'PCS').toUpperCase();
      totals[unit] = (totals[unit] || 0) + (Number(a.quantity) || 0);
    });
    return totals;
  }, [currentArticles]);

  // Analytics for the detailed view
  const detailedAnalytics = useMemo(() => {
    if (!selectedCategory) return null;
    
    // 1. Status Value Distribution
    const statusValue = [
      { name: 'En Transit', value: 0, color: STATUS_COLORS.TRANSIT },
      { name: 'Réceptionné', value: 0, color: STATUS_COLORS.ARRIVED },
      { name: 'En Attente', value: 0, color: STATUS_COLORS.PENDING },
    ];
    
    groupedData?.transit.forEach(a => statusValue[0].value += (a.quantity * a.purchasePricePerUnit));
    groupedData?.arrived.forEach(a => statusValue[1].value += (a.quantity * a.purchasePricePerUnit));
    groupedData?.pending.forEach(a => statusValue[2].value += (a.quantity * a.purchasePricePerUnit));

    // 2. Supplier Distribution
    const supplierMap: Record<string, number> = {};
    currentArticles.forEach(a => {
      const s = a.supplierId || 'Inconnu';
      supplierMap[s] = (supplierMap[s] || 0) + (a.quantity * a.purchasePricePerUnit);
    });
    const supplierData = Object.entries(supplierMap).map(([name, value]) => ({ name, value }));

    // 3. Volume Analysis
    const volumeData = [
      { name: 'Transit', cbm: groupedData?.transit.reduce((s, a) => s + (a.cubicMeasurement || 0), 0) || 0 },
      { name: 'Réceptionné', cbm: groupedData?.arrived.reduce((s, a) => s + (a.cubicMeasurement || 0), 0) || 0 },
    ];

    return { statusValue, supplierData, volumeData };
  }, [selectedCategory, currentArticles, groupedData]);

  // RENDER: Detailed View
  if (selectedCategory && groupedData && detailedAnalytics) {
    return (
      <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500 pb-12">
        <header className="flex flex-col md:flex-row md:items-center justify-between gap-6 bg-white p-8 rounded-2xl border border-stone-200 shadow-sm">
          <div className="flex items-center gap-6">
            <Button variant="outline" size="icon" onClick={() => setSelectedCategory(null)} className="rounded-xl h-14 w-14 border-stone-200 hover:bg-stone-50 hover:border-stone-400 transition-all">
              <ChevronLeft className="w-6 h-6" />
            </Button>
            <div>
              <p className="text-[10px] font-black text-stone-400 uppercase tracking-[0.2em] mb-1">Détails de l'Article</p>
              <h2 className="text-4xl font-black text-stone-900 uppercase tracking-tighter leading-none">{selectedCategory}</h2>
            </div>
          </div>
          <div className="flex flex-wrap gap-4">
            {Object.entries(currentTotalsByUnit).map(([unit, total]) => (
              <div key={unit} className="px-6 py-4 bg-stone-50 border border-stone-200 rounded-xl shadow-sm text-center min-w-[120px]">
                <p className="text-[9px] font-black text-stone-500 uppercase tracking-widest mb-1">STOCK TOTAL {unit}</p>
                <p className="text-2xl font-black text-stone-900">{total.toLocaleString()}</p>
              </div>
            ))}
          </div>
        </header>

        <div className="grid grid-cols-1 gap-8">
          {/* SECTION 1: TRANSIT */}
          <section className="space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="bg-blue-600 p-2.5 rounded-xl shadow-blue-100 shadow-lg"><Truck className="w-5 h-5 text-white" /></div>
                <div>
                  <h3 className="font-black text-stone-800 uppercase text-xs tracking-widest">Manifeste de Transit</h3>
                  <p className="text-[10px] text-stone-400 font-bold uppercase">Cargaisons actuellement en mer ou port</p>
                </div>
              </div>
              <Badge className="bg-blue-50 text-blue-600 border-blue-100 hover:bg-blue-50 font-bold px-4 py-1 rounded-full uppercase text-[10px]">
                {groupedData.transit.length} Lignes
              </Badge>
            </div>
            <Card className="border-none shadow-sm overflow-hidden rounded-2xl border border-stone-100">
              <Table>
                <TableHeader className="bg-stone-50/50 border-b border-stone-100">
                  <TableRow className="hover:bg-transparent">
                    <TableHead className="text-[10px] uppercase font-black text-stone-500 py-4 px-6">Désignation</TableHead>
                    <TableHead className="text-[10px] uppercase font-black text-stone-500">Fournisseur</TableHead>
                    <TableHead className="text-[10px] uppercase font-black text-stone-500">N° Facture / Conteneur</TableHead>
                    <TableHead className="text-[10px] uppercase font-black text-stone-500">Arrivée Prévue</TableHead>
                    <TableHead className="text-right text-[10px] uppercase font-black text-stone-500 pr-6">Quantité</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {groupedData.transit.length > 0 ? groupedData.transit.map(a => (
                    <TableRow key={a.id} className="hover:bg-blue-50/30 transition-colors border-b border-stone-50">
                      <TableCell className="font-bold text-stone-800 py-4 px-6">{a.name}</TableCell>
                      <TableCell className="text-stone-500 font-bold text-xs">{a.supplierId}</TableCell>
                      <TableCell>
                        <span className="font-mono text-[10px] font-black text-blue-700 bg-blue-100/50 px-2 py-1 rounded uppercase tracking-wider">{a.factureId}</span>
                      </TableCell>
                      <TableCell className="text-blue-600 font-black text-xs">{a.arrivalDate}</TableCell>
                      <TableCell className="text-right font-black text-stone-900 pr-6">
                        {a.quantity.toLocaleString()} <span className="text-[10px] text-stone-400 ml-1">{a.unitOfMeasure}</span>
                      </TableCell>
                    </TableRow>
                  )) : (
                    <TableRow><TableCell colSpan={5} className="text-center py-16 text-stone-300 font-black uppercase text-[10px] tracking-[0.3em]">Aucune unité en transit</TableCell></TableRow>
                  )}
                </TableBody>
              </Table>
            </Card>
          </section>

          {/* SECTION 2: ARRIVED */}
          <section className="space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="bg-emerald-600 p-2.5 rounded-xl shadow-emerald-100 shadow-lg"><CheckCircle2 className="w-5 h-5 text-white" /></div>
                <div>
                  <h3 className="font-black text-stone-800 uppercase text-xs tracking-widest">Stock Réel Réceptionné</h3>
                  <p className="text-[10px] text-stone-400 font-bold uppercase">Inventaire physique disponible en entrepôt</p>
                </div>
              </div>
              <Badge className="bg-emerald-50 text-emerald-600 border-emerald-100 hover:bg-emerald-50 font-bold px-4 py-1 rounded-full uppercase text-[10px]">
                {groupedData.arrived.length} Lignes
              </Badge>
            </div>
            <Card className="border-none shadow-sm overflow-hidden rounded-2xl border border-stone-100">
              <Table>
                <TableHeader className="bg-stone-50/50 border-b border-stone-100">
                  <TableRow className="hover:bg-transparent">
                    <TableHead className="text-[10px] uppercase font-black text-stone-500 py-4 px-6">Désignation</TableHead>
                    <TableHead className="text-[10px] uppercase font-black text-stone-500">Date Réception</TableHead>
                    <TableHead className="text-[10px] uppercase font-black text-stone-500">Spécifications Techniques</TableHead>
                    <TableHead className="text-right text-[10px] uppercase font-black text-stone-500 pr-6">Quantité en Stock</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {groupedData.arrived.length > 0 ? groupedData.arrived.map(a => (
                    <TableRow key={a.id} className="hover:bg-emerald-50/30 transition-colors border-b border-stone-50">
                      <TableCell className="font-bold text-stone-800 py-4 px-6">{a.name}</TableCell>
                      <TableCell className="text-stone-500 font-bold text-xs">{a.arrivalDate}</TableCell>
                      <TableCell className="text-[10px] text-stone-400 italic font-bold tracking-tight">{a.specs || 'SANS SPÉCIFICATION'}</TableCell>
                      <TableCell className="text-right font-black text-emerald-700 pr-6">
                        {a.quantity.toLocaleString()} <span className="text-[10px] text-emerald-600/40 ml-1">{a.unitOfMeasure}</span>
                      </TableCell>
                    </TableRow>
                  )) : (
                    <TableRow><TableCell colSpan={4} className="text-center py-16 text-stone-300 font-black uppercase text-[10px] tracking-[0.3em]">Stock épuisé</TableCell></TableRow>
                  )}
                </TableBody>
              </Table>
            </Card>
          </section>

          {/* SECTION 3: PENDING */}
          <section className="space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="bg-amber-600 p-2.5 rounded-xl shadow-amber-100 shadow-lg"><Clock className="w-5 h-5 text-white" /></div>
                <div>
                  <h3 className="font-black text-stone-800 uppercase text-xs tracking-widest">Prévisions & Production</h3>
                  <p className="text-[10px] text-stone-400 font-bold uppercase">Besoins identifiés ou commandes en usine (PI)</p>
                </div>
              </div>
            </div>
            <Card className="border-none shadow-sm overflow-hidden rounded-2xl border border-stone-100">
              <Table>
                <TableHeader className="bg-stone-50/50 border-b border-stone-100">
                  <TableRow className="hover:bg-transparent">
                    <TableHead className="text-[10px] uppercase font-black text-stone-500 py-4 px-6">Désignation</TableHead>
                    <TableHead className="text-[10px] uppercase font-black text-stone-500">Phase de Flux</TableHead>
                    <TableHead className="text-[10px] uppercase font-black text-stone-500">Date Création</TableHead>
                    <TableHead className="text-right text-[10px] uppercase font-black text-stone-500 pr-6">Quantité Prévisionnelle</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {groupedData.pending.length > 0 ? groupedData.pending.map(a => (
                    <TableRow key={a.id} className="hover:bg-amber-50/30 transition-colors border-b border-stone-50">
                      <TableCell className="font-bold text-stone-800 py-4 px-6">{a.name}</TableCell>
                      <TableCell>
                        <Badge variant="outline" className="bg-white text-amber-700 border-amber-200 text-[9px] font-black uppercase py-0 px-2 h-6 shadow-sm">
                          {a.status === 'PI' ? 'PRODUCTION' : 'À COMMANDER'}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-stone-500 font-bold text-xs">{a.orderDate}</TableCell>
                      <TableCell className="text-right font-black text-amber-700 pr-6">
                        {a.quantity.toLocaleString()} <span className="text-[10px] text-amber-600/40 ml-1">{a.unitOfMeasure}</span>
                      </TableCell>
                    </TableRow>
                  )) : (
                    <TableRow><TableCell colSpan={4} className="text-center py-16 text-stone-300 font-black uppercase text-[10px] tracking-[0.3em]">Aucune prévision</TableCell></TableRow>
                  )}
                </TableBody>
              </Table>
            </Card>
          </section>
        </div>

        {/* ANALYTICS SECTION */}
        <section className="space-y-6 pt-12 border-t border-stone-200">
          <div className="flex items-center gap-3">
            <div className="bg-stone-900 p-2.5 rounded-xl"><Activity className="w-5 h-5 text-white" /></div>
            <div>
              <h3 className="font-black text-stone-800 uppercase text-xs tracking-widest">Intelligence Analytique</h3>
              <p className="text-[10px] text-stone-400 font-bold uppercase">Performance financière et logistique de l'article</p>
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
            {/* Value Distribution */}
            <Card className="border-none shadow-sm rounded-2xl bg-white">
              <CardHeader className="border-b border-stone-50 py-4 px-6">
                <CardTitle className="text-[11px] font-black uppercase text-stone-500 flex items-center gap-2">
                  <BarChart3 className="w-4 h-4" /> Valeur Engagée (€)
                </CardTitle>
              </CardHeader>
              <CardContent className="p-6 h-[300px]">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={detailedAnalytics.statusValue}
                      cx="50%"
                      cy="50%"
                      innerRadius={60}
                      outerRadius={80}
                      paddingAngle={8}
                      dataKey="value"
                    >
                      {detailedAnalytics.statusValue.map((entry, index) => (
                        <Cell key={`cell-${index}`} fill={entry.color} />
                      ))}
                    </Pie>
                    <RechartsTooltip 
                      formatter={(val: number) => [`${val.toLocaleString()} €`, 'Valeur']}
                      contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 10px 40px rgba(0,0,0,0.1)', fontWeight: 'bold' }}
                    />
                    <Legend verticalAlign="bottom" height={36} iconType="circle" />
                  </PieChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>

            {/* Supplier Dependency */}
            <Card className="border-none shadow-sm rounded-2xl bg-white">
              <CardHeader className="border-b border-stone-50 py-4 px-6">
                <CardTitle className="text-[11px] font-black uppercase text-stone-500 flex items-center gap-2">
                  <PieChartIcon className="w-4 h-4" /> Source Approvisionnement
                </CardTitle>
              </CardHeader>
              <CardContent className="p-6 h-[300px]">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={detailedAnalytics.supplierData} margin={{ top: 20, right: 30, left: 0, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f1f1" />
                    <XAxis dataKey="name" axisLine={false} tickLine={false} style={{ fontSize: '10px', fontWeight: 'bold' }} />
                    <YAxis hide />
                    <RechartsTooltip 
                      formatter={(val: number) => [`${val.toLocaleString()} €`, 'Volume']}
                      contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 10px 40px rgba(0,0,0,0.1)' }}
                    />
                    <Bar dataKey="value" fill="#CC8626" radius={[6, 6, 0, 0]} barSize={40} />
                  </BarChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>

            {/* Volume Analysis */}
            <Card className="border-none shadow-sm rounded-2xl bg-white">
              <CardHeader className="border-b border-stone-50 py-4 px-6">
                <CardTitle className="text-[11px] font-black uppercase text-stone-500 flex items-center gap-2">
                  <Package className="w-4 h-4" /> Analyse d'Encombrement (CBM)
                </CardTitle>
              </CardHeader>
              <CardContent className="p-8">
                <div className="space-y-8">
                  {detailedAnalytics.volumeData.map((v, i) => (
                    <div key={v.name} className="space-y-3">
                      <div className="flex justify-between items-center text-[11px] font-black uppercase">
                        <span className="text-stone-400">{v.name}</span>
                        <span className="text-stone-800">{v.cbm.toFixed(3)} m³</span>
                      </div>
                      <div className="h-2.5 w-full bg-stone-100 rounded-full overflow-hidden">
                        <div 
                          className={`h-full transition-all duration-1000 ${i === 0 ? 'bg-blue-500' : 'bg-emerald-500'}`}
                          style={{ width: `${Math.min(100, (v.cbm / (detailedAnalytics.volumeData[0].cbm + detailedAnalytics.volumeData[1].cbm || 1)) * 100)}%` }}
                        />
                      </div>
                    </div>
                  ))}
                  <div className="pt-4 border-t border-stone-100 mt-6 text-center">
                    <p className="text-[9px] font-black text-stone-400 uppercase tracking-widest mb-1">Volume Total Sous-Catégorie</p>
                    <p className="text-3xl font-black text-stone-900">{(detailedAnalytics.volumeData[0].cbm + detailedAnalytics.volumeData[1].cbm).toFixed(3)} m³</p>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>
        </section>
      </div>
    );
  }

  // RENDER: Sub-category Grid
  if (selectedGeneralCategoryId) {
    const parent = generalCategories.find(g => g.id === selectedGeneralCategoryId);
    return (
      <div className="space-y-8 animate-in fade-in duration-500">
        <div className="flex items-center gap-6">
          <Button variant="outline" size="icon" onClick={() => onSelectGeneralCategory(null)} className="rounded-xl h-14 w-14 border-stone-200 shadow-sm hover:border-stone-400">
            <ChevronLeft className="w-6 h-6" />
          </Button>
          <div>
            <p className="text-[10px] font-black text-stone-400 uppercase tracking-[0.2em]">Groupe Logistique</p>
            <h2 className="text-4xl font-black text-stone-900 uppercase tracking-tighter leading-none">{parent?.name}</h2>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
          {subCategoryStats.map((sc, idx) => (
            <Card 
              key={sc.id} 
              className={`cursor-pointer border-none shadow-sm hover:shadow-xl hover:-translate-y-1 transition-all bg-white overflow-hidden group border-l-4`}
              style={{ borderLeftColor: UI_COLORS[idx % UI_COLORS.length] }}
              onClick={() => setSelectedCategory(sc.name)}
            >
              <CardContent className="p-8">
                <div className="flex justify-between items-center mb-6">
                  <div className="p-3 bg-stone-50 rounded-2xl group-hover:bg-stone-900 transition-colors">
                    <Package className="w-6 h-6 text-stone-400 group-hover:text-white" />
                  </div>
                  <div className="flex items-center gap-1 text-[10px] font-black text-stone-300 group-hover:text-stone-900 transition-colors">
                    VOIR DÉTAILS <ArrowUpRight className="w-3 h-3" />
                  </div>
                </div>
                <h3 className="font-black text-xl text-stone-800 mb-8 uppercase leading-tight tracking-tight group-hover:text-stone-900">{sc.name}</h3>
                <div className="space-y-3">
                  {Object.entries(sc.units).map(([unit, total]) => (
                    <div key={unit} className="flex justify-between items-center bg-stone-50 px-4 py-3 rounded-xl border border-stone-100/50">
                      <span className="text-[10px] text-stone-400 font-black uppercase tracking-widest">{unit}</span>
                      <span className="font-black text-stone-800 text-lg">{(total as number).toLocaleString()}</span>
                    </div>
                  ))}
                  <div className="flex justify-between items-center pt-4 border-t border-stone-100 mt-4">
                    <span className="text-[9px] text-stone-300 uppercase font-black tracking-widest">Variantes Actives</span>
                    <Badge variant="secondary" className="bg-stone-100 text-stone-600 text-[10px] font-black">{sc.count}</Badge>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
    );
  }

  // RENDER: Main Groups List
  return (
    <div className="space-y-8 animate-in fade-in duration-500">
      <header className="flex flex-col gap-2">
        <h2 className="text-4xl font-black text-stone-900 uppercase tracking-tighter leading-none">Explorateur Logistique</h2>
        <p className="text-stone-500 text-base font-bold uppercase tracking-widest text-[11px] opacity-70">Analyse structurelle des flux de produits par pôle d'activité.</p>
      </header>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-8">
        {Object.entries(groupStats).map(([id, stat], idx) => (
          <Card 
            key={id} 
            className={`group cursor-pointer border-none shadow-sm hover:shadow-2xl transition-all bg-white relative overflow-hidden border-l-4`}
            style={{ borderLeftColor: UI_COLORS[idx % UI_COLORS.length] }}
            onClick={() => onSelectGeneralCategory(id)}
          >
            <CardContent className="p-10">
              <div className="flex justify-between items-start mb-10">
                <div className="p-5 bg-stone-50 group-hover:bg-stone-900 rounded-2xl shadow-sm transition-all">
                  <LayoutGrid className="w-8 h-8 text-stone-400 group-hover:text-white" />
                </div>
                <div className="text-right">
                  <p className="text-[10px] font-black text-stone-300 uppercase tracking-[0.2em] mb-1">Items</p>
                  <p className="text-3xl font-black text-stone-900 tracking-tighter">{stat.count}</p>
                </div>
              </div>
              <h3 className="text-2xl font-black text-stone-800 mb-8 uppercase group-hover:text-stone-900 leading-tight tracking-tight">{stat.name}</h3>
              <div className="mt-4 space-y-3">
                {Object.entries(stat.units).slice(0, 3).map(([unit, total]) => (
                  <div key={unit} className="flex justify-between items-center text-[12px] border-b border-stone-50 pb-3">
                    <span className="text-stone-400 font-black uppercase tracking-widest">{unit}</span>
                    <span className="font-black text-stone-800">{(total as number).toLocaleString()}</span>
                  </div>
                ))}
              </div>
              <div className="absolute bottom-0 right-0 p-4 opacity-0 group-hover:opacity-100 transition-opacity">
                 <ArrowUpRight className="w-5 h-5 text-stone-200" />
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
