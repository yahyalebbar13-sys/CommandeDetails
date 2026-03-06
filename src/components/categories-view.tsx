"use client";

import React, { useMemo, useState } from 'react';
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
  Clock,
  LayoutGrid,
  BarChart3,
  PieChart as PieChartIcon,
  Activity,
  Package,
  ArrowUpRight,
  Search,
  Filter
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
  const [searchTerm, setSearchTerm] = useState('');

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
      })
      .filter(sc => sc.name.toLowerCase().includes(searchTerm.toLowerCase()));
  }, [selectedGeneralCategoryId, subCategories, articles, searchTerm]);

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

  const detailedAnalytics = useMemo(() => {
    if (!selectedCategory || !groupedData) return null;
    
    const statusValue = [
      { name: 'En Transit', value: 0, color: STATUS_COLORS.TRANSIT },
      { name: 'Réceptionné', value: 0, color: STATUS_COLORS.ARRIVED },
      { name: 'En Attente', value: 0, color: STATUS_COLORS.PENDING },
    ];
    
    groupedData.transit.forEach(a => statusValue[0].value += (a.quantity * a.purchasePricePerUnit));
    groupedData.arrived.forEach(a => statusValue[1].value += (a.quantity * a.purchasePricePerUnit));
    groupedData.pending.forEach(a => statusValue[2].value += (a.quantity * a.purchasePricePerUnit));

    const supplierMap: Record<string, number> = {};
    currentArticles.forEach(a => {
      const s = a.supplierId || 'Inconnu';
      supplierMap[s] = (supplierMap[s] || 0) + (a.quantity * a.purchasePricePerUnit);
    });
    const supplierData = Object.entries(supplierMap).map(([name, value]) => ({ name, value }));

    const volumeData = [
      { name: 'Transit', cbm: groupedData.transit.reduce((s, a) => s + (a.cubicMeasurement || 0), 0) || 0 },
      { name: 'Réceptionné', cbm: groupedData.arrived.reduce((s, a) => s + (a.cubicMeasurement || 0), 0) || 0 },
    ];

    return { statusValue, supplierData, volumeData };
  }, [selectedCategory, currentArticles, groupedData]);

  // VUE DÉTAILLÉE
  if (selectedCategory && groupedData && detailedAnalytics) {
    return (
      <div className="space-y-6 animate-in fade-in slide-in-from-bottom-2 duration-300">
        <header className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-white p-6 rounded-xl border border-stone-200 shadow-sm">
          <div className="flex items-center gap-4">
            <Button variant="outline" size="icon" onClick={() => setSelectedCategory(null)} className="rounded-lg h-10 w-10">
              <ChevronLeft className="w-5 h-5" />
            </Button>
            <div>
              <p className="text-[10px] font-black text-stone-400 uppercase tracking-widest">Détail Produit</p>
              <h2 className="text-2xl font-black text-stone-900 uppercase tracking-tight leading-none">{selectedCategory}</h2>
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            {Object.entries(currentTotalsByUnit).map(([unit, total]) => (
              <div key={unit} className="px-4 py-2 bg-stone-50 border border-stone-200 rounded-lg text-center">
                <p className="text-[8px] font-black text-stone-500 uppercase tracking-tighter">STOCK {unit}</p>
                <p className="text-lg font-black text-stone-900 leading-none">{total.toLocaleString()}</p>
              </div>
            ))}
          </div>
        </header>

        <div className="grid grid-cols-1 gap-6">
          {/* TRANSIT */}
          <section className="space-y-3">
            <div className="flex items-center gap-2">
              <Truck className="w-4 h-4 text-blue-600" />
              <h3 className="font-black text-stone-800 uppercase text-[11px] tracking-widest">Commandes en Transit</h3>
              <Badge variant="outline" className="text-blue-600 border-blue-100 bg-blue-50/50 text-[9px] px-2 py-0">
                {groupedData.transit.length} lignes
              </Badge>
            </div>
            <Card className="border-stone-200 shadow-none">
              <Table>
                <TableHeader className="bg-stone-50/50">
                  <TableRow>
                    <TableHead className="text-[10px] uppercase font-black py-2">Désignation</TableHead>
                    <TableHead className="text-[10px] uppercase font-black py-2">Fournisseur</TableHead>
                    <TableHead className="text-[10px] uppercase font-black py-2">Facture</TableHead>
                    <TableHead className="text-[10px] uppercase font-black py-2 text-right">Quantité</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {groupedData.transit.length > 0 ? groupedData.transit.map(a => (
                    <TableRow key={a.id} className="hover:bg-blue-50/20">
                      <TableCell className="font-bold text-xs py-2">{a.name}</TableCell>
                      <TableCell className="text-stone-500 text-xs py-2">{a.supplierId}</TableCell>
                      <TableCell className="py-2">
                        <span className="text-[10px] font-black text-blue-700 uppercase">{a.factureId}</span>
                      </TableCell>
                      <TableCell className="text-right font-black text-stone-900 text-xs py-2">
                        {a.quantity.toLocaleString()} <span className="text-[9px] text-stone-400">{a.unitOfMeasure}</span>
                      </TableCell>
                    </TableRow>
                  )) : (
                    <TableRow><TableCell colSpan={4} className="text-center py-6 text-stone-300 text-[10px] uppercase font-bold">Aucun transit</TableCell></TableRow>
                  )}
                </TableBody>
              </Table>
            </Card>
          </section>

          {/* STOCK RÉEL */}
          <section className="space-y-3">
            <div className="flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 text-emerald-600" />
              <h3 className="font-black text-stone-800 uppercase text-[11px] tracking-widest">Stock Réceptionné</h3>
            </div>
            <Card className="border-stone-200 shadow-none">
              <Table>
                <TableHeader className="bg-stone-50/50">
                  <TableRow>
                    <TableHead className="text-[10px] uppercase font-black py-2">Désignation</TableHead>
                    <TableHead className="text-[10px] uppercase font-black py-2">Arrivée</TableHead>
                    <TableHead className="text-[10px] uppercase font-black py-2">Specs</TableHead>
                    <TableHead className="text-right text-[10px] uppercase font-black py-2">Quantité</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {groupedData.arrived.length > 0 ? groupedData.arrived.map(a => (
                    <TableRow key={a.id} className="hover:bg-emerald-50/20">
                      <TableCell className="font-bold text-xs py-2">{a.name}</TableCell>
                      <TableCell className="text-stone-500 text-[10px] py-2">{a.arrivalDate}</TableCell>
                      <TableCell className="text-[10px] text-stone-400 py-2">{a.specs || '-'}</TableCell>
                      <TableCell className="text-right font-black text-emerald-700 text-xs py-2">
                        {a.quantity.toLocaleString()} <span className="text-[9px] text-stone-400">{a.unitOfMeasure}</span>
                      </TableCell>
                    </TableRow>
                  )) : (
                    <TableRow><TableCell colSpan={4} className="text-center py-6 text-stone-300 text-[10px] uppercase font-bold">Stock à zéro</TableCell></TableRow>
                  )}
                </TableBody>
              </Table>
            </Card>
          </section>

          {/* ATTENTE */}
          <section className="space-y-3">
            <div className="flex items-center gap-2">
              <Clock className="w-4 h-4 text-amber-600" />
              <h3 className="font-black text-stone-800 uppercase text-[11px] tracking-widest">En Attente / Production</h3>
            </div>
            <Card className="border-stone-200 shadow-none">
              <Table>
                <TableHeader className="bg-stone-50/50">
                  <TableRow>
                    <TableHead className="text-[10px] uppercase font-black py-2">Désignation</TableHead>
                    <TableHead className="text-[10px] uppercase font-black py-2">Statut</TableHead>
                    <TableHead className="text-right text-[10px] uppercase font-black py-2">Quantité Prévue</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {groupedData.pending.length > 0 ? groupedData.pending.map(a => (
                    <TableRow key={a.id} className="hover:bg-amber-50/20">
                      <TableCell className="font-bold text-xs py-2">{a.name}</TableCell>
                      <TableCell className="py-2">
                        <Badge variant="outline" className="text-[9px] uppercase font-black h-5 px-2">
                          {a.status === 'PI' ? 'PRODUCTION' : 'À COMMANDER'}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-right font-black text-amber-700 text-xs py-2">
                        {a.quantity.toLocaleString()} <span className="text-[9px] text-stone-400">{a.unitOfMeasure}</span>
                      </TableCell>
                    </TableRow>
                  )) : (
                    <TableRow><TableCell colSpan={3} className="text-center py-6 text-stone-300 text-[10px] uppercase font-bold">Aucune prévision</TableCell></TableRow>
                  )}
                </TableBody>
              </Table>
            </Card>
          </section>
        </div>

        {/* ANALYTICS BAS DE PAGE */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 pt-6 border-t border-stone-200">
          <Card className="border-stone-200 shadow-none">
            <CardHeader className="py-3 border-b border-stone-50"><CardTitle className="text-[10px] font-black uppercase text-stone-500">Valeur Engagée (€)</CardTitle></CardHeader>
            <CardContent className="h-[200px] p-2">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie data={detailedAnalytics.statusValue} cx="50%" cy="50%" innerRadius={40} outerRadius={60} paddingAngle={4} dataKey="value">
                    {detailedAnalytics.statusValue.map((entry, index) => <Cell key={`cell-${index}`} fill={entry.color} />)}
                  </Pie>
                  <RechartsTooltip formatter={(val: number) => [`${val.toLocaleString()} €`]} contentStyle={{ fontSize: '10px' }} />
                </PieChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>
          <Card className="border-stone-200 shadow-none">
            <CardHeader className="py-3 border-b border-stone-50"><CardTitle className="text-[10px] font-black uppercase text-stone-500">Source Fournisseurs</CardTitle></CardHeader>
            <CardContent className="h-[200px] p-4">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={detailedAnalytics.supplierData}>
                  <XAxis dataKey="name" axisLine={false} tickLine={false} style={{ fontSize: '9px', fontWeight: 'bold' }} />
                  <Bar dataKey="value" fill="#CC8626" radius={[4, 4, 0, 0]} barSize={25} />
                </BarChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>
          <Card className="border-stone-200 shadow-none">
            <CardHeader className="py-3 border-b border-stone-50"><CardTitle className="text-[10px] font-black uppercase text-stone-500">Volume Total (m³)</CardTitle></CardHeader>
            <CardContent className="p-6 flex flex-col items-center justify-center h-[200px]">
              <p className="text-4xl font-black text-stone-900">{(detailedAnalytics.volumeData[0].cbm + detailedAnalytics.volumeData[1].cbm).toFixed(2)}</p>
              <p className="text-[10px] font-bold text-stone-400 uppercase tracking-widest mt-1">Mètres Cubes Globaux</p>
            </CardContent>
          </Card>
        </div>
      </div>
    );
  }

  // GRILLE DES SOUS-CATÉGORIES (VUE COMPACTE)
  if (selectedGeneralCategoryId) {
    const parent = generalCategories.find(g => g.id === selectedGeneralCategoryId);
    return (
      <div className="space-y-6 animate-in fade-in duration-300">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="flex items-center gap-4">
            <Button variant="outline" size="icon" onClick={() => onSelectGeneralCategory(null)} className="h-10 w-10">
              <ChevronLeft className="w-5 h-5" />
            </Button>
            <div>
              <p className="text-[10px] font-black text-stone-400 uppercase tracking-widest">Exploration / {parent?.name}</p>
              <h2 className="text-2xl font-black text-stone-900 uppercase tracking-tight">{parent?.name}</h2>
            </div>
          </div>
          <div className="relative w-full md:w-64">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-stone-400" />
            <Input 
              placeholder="Filtrer..." 
              value={searchTerm} 
              onChange={e => setSearchTerm(e.target.value)}
              className="pl-9 h-9 text-xs border-stone-200 bg-white"
            />
          </div>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-3">
          {subCategoryStats.map((sc, idx) => (
            <Card 
              key={sc.id} 
              className="cursor-pointer border-stone-200 hover:border-amber-400 hover:bg-amber-50/30 transition-all shadow-sm group"
              onClick={() => setSelectedCategory(sc.name)}
            >
              <CardContent className="p-4">
                <div className="flex justify-between items-start mb-3">
                  <div className={`w-1.5 h-6 rounded-full ${UI_COLORS[idx % UI_COLORS.length]}`} />
                  <Badge variant="secondary" className="bg-stone-100 text-stone-500 text-[9px] font-bold">{sc.count}</Badge>
                </div>
                <h3 className="font-black text-xs text-stone-800 uppercase leading-tight mb-3 line-clamp-2 min-h-[2rem]">{sc.name}</h3>
                <div className="space-y-1">
                  {Object.entries(sc.units).slice(0, 2).map(([unit, total]) => (
                    <div key={unit} className="flex justify-between items-center text-[10px]">
                      <span className="text-stone-400 font-bold">{unit}</span>
                      <span className="font-black text-stone-800">{(total as number).toLocaleString()}</span>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          ))}
          {subCategoryStats.length === 0 && (
            <div className="col-span-full py-12 text-center text-stone-300 font-bold uppercase text-[10px] tracking-widest border border-dashed rounded-lg">
              Aucune sous-catégorie trouvée
            </div>
          )}
        </div>
      </div>
    );
  }

  // LISTE DES GROUPES GÉNÉRAUX
  return (
    <div className="space-y-6 animate-in fade-in duration-300">
      <header>
        <h2 className="text-2xl font-black text-stone-900 uppercase tracking-tight">Répertoire Logistique</h2>
        <p className="text-stone-500 text-[11px] font-bold uppercase tracking-widest">Sélectionnez un pôle d'activité pour explorer les stocks.</p>
      </header>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
        {Object.entries(groupStats).map(([id, stat], idx) => (
          <Card 
            key={id} 
            className="group cursor-pointer border-stone-200 hover:border-stone-900 transition-all bg-white shadow-sm overflow-hidden"
            onClick={() => onSelectGeneralCategory(id)}
          >
            <div className={`h-1.5 ${UI_COLORS[idx % UI_COLORS.length]}`} style={{ backgroundColor: UI_COLORS[idx % UI_COLORS.length] }} />
            <CardContent className="p-6">
              <div className="flex justify-between items-center mb-6">
                <LayoutGrid className="w-6 h-6 text-stone-200 group-hover:text-stone-900 transition-colors" />
                <div className="text-right">
                  <p className="text-[18px] font-black text-stone-900">{stat.count}</p>
                  <p className="text-[8px] font-black text-stone-400 uppercase">Items</p>
                </div>
              </div>
              <h3 className="text-lg font-black text-stone-800 uppercase leading-none mb-6 group-hover:text-stone-900">{stat.name}</h3>
              <div className="space-y-2">
                {Object.entries(stat.units).slice(0, 3).map(([unit, total]) => (
                  <div key={unit} className="flex justify-between items-center text-[11px] border-b border-stone-50 pb-2">
                    <span className="text-stone-400 font-bold">{unit}</span>
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
