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
  Filter,
  TrendingUp,
  Box,
  Factory
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

const UI_COLORS = ['#CC8626', '#1E293B', '#3B82F6', '#10B981', '#6366F1', '#F43F5E'];
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

  // ==========================================
  // VUE DÉTAILLÉE DU PRODUIT
  // ==========================================
  if (selectedCategory && groupedData && detailedAnalytics) {
    return (
      <div className="space-y-10 animate-in fade-in slide-in-from-bottom-2 duration-500">
        <header className="bg-white rounded-[2.5rem] shadow-xl border border-stone-200 overflow-hidden">
          <div className="bg-stone-900 p-8 flex flex-col lg:flex-row justify-between items-start lg:items-center gap-8 relative">
            <div className="absolute top-0 right-0 w-96 h-96 bg-amber-500/5 rounded-full -translate-y-1/2 translate-x-1/2 blur-3xl" />
            
            <div className="flex items-center gap-6 relative z-10">
              <Button 
                variant="outline" 
                size="icon" 
                onClick={() => setSelectedCategory(null)} 
                className="h-14 w-14 rounded-2xl bg-white/5 border-white/10 text-white hover:bg-white/10 transition-all shadow-xl"
              >
                <ChevronLeft className="w-6 h-6" />
              </Button>
              <div>
                <p className="text-[10px] font-black text-amber-500 uppercase tracking-[0.3em] mb-1">Détail Analytique Produit</p>
                <h2 className="text-4xl font-black text-white tracking-tighter uppercase leading-none">{selectedCategory}</h2>
                <div className="flex gap-2 mt-4">
                  <Badge className="bg-emerald-500/10 text-emerald-400 border-emerald-500/20 text-[9px] font-black uppercase tracking-widest px-3 py-1">Audit Actif</Badge>
                  <Badge className="bg-blue-500/10 text-blue-400 border-blue-500/20 text-[9px] font-black uppercase tracking-widest px-3 py-1">Tracking Global</Badge>
                </div>
              </div>
            </div>

            <div className="flex flex-wrap gap-4 relative z-10">
              {Object.entries(currentTotalsByUnit).map(([unit, total]) => (
                <div key={unit} className="px-6 py-4 bg-white/5 border border-white/10 rounded-2xl text-center min-w-[120px] backdrop-blur-sm">
                  <p className="text-[9px] font-black text-stone-400 uppercase tracking-widest mb-1">Stock {unit}</p>
                  <p className="text-2xl font-black text-white leading-none">{total.toLocaleString()}</p>
                </div>
              ))}
            </div>
          </div>
        </header>

        <div className="grid grid-cols-1 gap-10">
          {/* SECTION TRANSIT */}
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
            <Card className="border-stone-200 shadow-xl rounded-3xl overflow-hidden">
              <Table>
                <TableHeader className="bg-stone-50/80 backdrop-blur-sm">
                  <TableRow>
                    <TableHead className="text-[10px] uppercase font-black py-4 px-6 text-stone-500">Désignation Technique</TableHead>
                    <TableHead className="text-[10px] uppercase font-black py-4 text-stone-500">Partenaire</TableHead>
                    <TableHead className="text-[10px] uppercase font-black py-4 text-stone-500">N° Dossier</TableHead>
                    <TableHead className="text-right text-[10px] uppercase font-black py-4 px-6 text-stone-500">Quantité</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {groupedData.transit.length > 0 ? groupedData.transit.map(a => (
                    <TableRow key={a.id} className="hover:bg-blue-50/20 transition-colors">
                      <TableCell className="font-black text-xs py-5 px-6 text-stone-900">{a.name}</TableCell>
                      <TableCell className="text-stone-400 font-black text-[10px] py-5 uppercase">{a.supplierId}</TableCell>
                      <TableCell className="py-5">
                        <span className="text-[10px] font-black text-blue-700 bg-blue-50 px-3 py-1 rounded-full border border-blue-100 uppercase">{a.factureId}</span>
                      </TableCell>
                      <TableCell className="text-right font-black text-stone-900 text-xs py-5 px-6">
                        {a.quantity.toLocaleString()} <span className="text-[9px] text-stone-400 font-bold ml-1">{a.unitOfMeasure}</span>
                      </TableCell>
                    </TableRow>
                  )) : (
                    <TableRow><TableCell colSpan={4} className="text-center py-12 text-stone-300 text-[10px] uppercase font-black tracking-widest bg-stone-50/20">Aucun mouvement en transit détecté</TableCell></TableRow>
                  )}
                </TableBody>
              </Table>
            </Card>
          </section>

          {/* SECTION STOCK RÉEL */}
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
                PRÊT À L'EXPÉDITION
              </Badge>
            </div>
            <Card className="border-stone-200 shadow-xl rounded-3xl overflow-hidden">
              <Table>
                <TableHeader className="bg-stone-50/80">
                  <TableRow>
                    <TableHead className="text-[10px] uppercase font-black py-4 px-6 text-stone-500">Désignation</TableHead>
                    <TableHead className="text-[10px] uppercase font-black py-4 text-stone-500">Certifié le</TableHead>
                    <TableHead className="text-[10px] uppercase font-black py-4 text-stone-500">Spécifications</TableHead>
                    <TableHead className="text-right text-[10px] uppercase font-black py-4 px-6 text-stone-500">Stock Réel</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {groupedData.arrived.length > 0 ? groupedData.arrived.map(a => (
                    <TableRow key={a.id} className="hover:bg-emerald-50/20 transition-colors">
                      <TableCell className="font-black text-xs py-5 px-6 text-stone-900">{a.name}</TableCell>
                      <TableCell className="text-stone-400 font-black text-[10px] py-5 uppercase">{a.arrivalDate}</TableCell>
                      <TableCell className="text-[10px] text-stone-500 font-bold py-5">{a.specs || '-'}</TableCell>
                      <TableCell className="text-right font-black text-emerald-700 text-xs py-5 px-6">
                        {a.quantity.toLocaleString()} <span className="text-[9px] text-stone-400 font-bold ml-1">{a.unitOfMeasure}</span>
                      </TableCell>
                    </TableRow>
                  )) : (
                    <TableRow><TableCell colSpan={4} className="text-center py-12 text-stone-300 text-[10px] uppercase font-black tracking-widest bg-stone-50/20">Rupture de stock physique</TableCell></TableRow>
                  )}
                </TableBody>
              </Table>
            </Card>
          </section>

          {/* SECTION ATTENTE */}
          <section className="space-y-4">
            <div className="flex items-center justify-between px-2">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-amber-500/10 rounded-xl">
                  <Clock className="w-5 h-5 text-amber-600" />
                </div>
                <div>
                  <h3 className="font-black text-stone-900 uppercase text-xs tracking-[0.2em]">Prévisions & Besoins</h3>
                  <p className="text-[10px] text-stone-400 font-bold uppercase">Planification de production en attente</p>
                </div>
              </div>
            </div>
            <Card className="border-stone-200 shadow-xl rounded-3xl overflow-hidden">
              <Table>
                <TableHeader className="bg-stone-50/80">
                  <TableRow>
                    <TableHead className="text-[10px] uppercase font-black py-4 px-6 text-stone-500">Désignation</TableHead>
                    <TableHead className="text-[10px] uppercase font-black py-4 text-stone-500">État Production</TableHead>
                    <TableHead className="text-right text-[10px] uppercase font-black py-4 px-6 text-stone-500">Quantité Estimée</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {groupedData.pending.length > 0 ? groupedData.pending.map(a => (
                    <TableRow key={a.id} className="hover:bg-amber-50/20 transition-colors">
                      <TableCell className="font-black text-xs py-5 px-6 text-stone-900">{a.name}</TableCell>
                      <TableCell className="py-5">
                        <Badge variant="outline" className="text-[9px] font-black uppercase h-6 px-3 border-stone-200">
                          {a.status === 'PI' ? 'COMMANDE LANCÉE' : 'BESOIN IDENTIFIÉ'}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-right font-black text-amber-700 text-xs py-5 px-6">
                        {a.quantity.toLocaleString()} <span className="text-[9px] text-stone-400 font-bold ml-1">{a.unitOfMeasure}</span>
                      </TableCell>
                    </TableRow>
                  )) : (
                    <TableRow><TableCell colSpan={3} className="text-center py-12 text-stone-300 text-[10px] uppercase font-black tracking-widest bg-stone-50/20">Aucune prévision identifiée</TableCell></TableRow>
                  )}
                </TableBody>
              </Table>
            </Card>
          </section>
        </div>

        {/* ANALYTIQUE BAS DE PAGE */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8 pt-10 border-t border-stone-200">
          <Card className="border-none shadow-xl bg-white rounded-3xl overflow-hidden group">
            <div className="h-1.5 w-full bg-stone-900" />
            <CardHeader className="py-4 border-b border-stone-50">
              <CardTitle className="text-[10px] font-black uppercase text-stone-400 tracking-widest flex items-center gap-2">
                <TrendingUp className="w-3 h-3 text-amber-500" /> Répartition par État (%)
              </CardTitle>
            </CardHeader>
            <CardContent className="h-[250px] p-4">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie data={detailedAnalytics.statusValue} cx="50%" cy="50%" innerRadius={60} outerRadius={80} paddingAngle={8} dataKey="value" stroke="none">
                    {detailedAnalytics.statusValue.map((entry, index) => <Cell key={`cell-${index}`} fill={entry.color} />)}
                  </Pie>
                  <RechartsTooltip formatter={(val: number) => [`${val.toLocaleString()} €`]} contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 10px 40px rgba(0,0,0,0.1)', fontWeight: 'bold' }} />
                  <Legend verticalAlign="bottom" height={36} iconType="circle" wrapperStyle={{ fontSize: '9px', fontWeight: '900', textTransform: 'uppercase', paddingTop: '20px' }} />
                </PieChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>

          <Card className="border-none shadow-xl bg-white rounded-3xl overflow-hidden group">
            <div className="h-1.5 w-full bg-amber-500" />
            <CardHeader className="py-4 border-b border-stone-50">
              <CardTitle className="text-[10px] font-black uppercase text-stone-400 tracking-widest flex items-center gap-2">
                <Factory className="w-3 h-3 text-stone-900" /> Valeur par Fournisseur (€)
              </CardTitle>
            </CardHeader>
            <CardContent className="h-[250px] p-6">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={detailedAnalytics.supplierData}>
                  <XAxis dataKey="name" axisLine={false} tickLine={false} style={{ fontSize: '9px', fontWeight: '900', textTransform: 'uppercase' }} />
                  <Bar dataKey="value" fill="#1E293B" radius={[6, 6, 0, 0]} barSize={25} />
                  <RechartsTooltip formatter={(val: number) => [`${val.toLocaleString()} €`]} />
                </BarChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>

          <Card className="border-none shadow-xl bg-white rounded-3xl overflow-hidden group">
            <div className="h-1.5 w-full bg-blue-500" />
            <CardHeader className="py-4 border-b border-stone-50">
              <CardTitle className="text-[10px] font-black uppercase text-stone-400 tracking-widest flex items-center gap-2">
                <Box className="w-3 h-3 text-blue-500" /> Encombrement Total (m³)
              </CardTitle>
            </CardHeader>
            <CardContent className="p-8 flex flex-col items-center justify-center h-[250px]">
              <p className="text-6xl font-black text-stone-900 tracking-tighter">{(detailedAnalytics.volumeData[0].cbm + detailedAnalytics.volumeData[1].cbm).toFixed(2)}</p>
              <p className="text-[10px] font-black text-stone-400 uppercase tracking-[0.3em] mt-3">Capacité Cargo Utilisée</p>
              <div className="w-full h-2 bg-stone-100 rounded-full mt-6 overflow-hidden">
                <div className="h-full bg-blue-500" style={{ width: '65%' }} />
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    );
  }

  // ==========================================
  // VUE EXPLORATION (LISTE SOUS-CATÉGORIES)
  // ==========================================
  if (selectedGeneralCategoryId) {
    const parent = generalCategories.find(g => g.id === selectedGeneralCategoryId);
    return (
      <div className="space-y-8 animate-in fade-in duration-500">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-6 bg-white p-6 rounded-[2rem] shadow-xl border border-stone-100">
          <div className="flex items-center gap-4">
            <Button variant="outline" size="icon" onClick={() => onSelectGeneralCategory(null)} className="h-12 w-12 rounded-2xl border-stone-200 hover:border-stone-900 transition-all">
              <ChevronLeft className="w-5 h-5" />
            </Button>
            <div>
              <p className="text-[10px] font-black text-amber-500 uppercase tracking-[0.3em] mb-1">Exploration du Pôle</p>
              <h2 className="text-3xl font-black text-stone-900 uppercase tracking-tighter leading-none">{parent?.name}</h2>
            </div>
          </div>
          <div className="relative w-full md:w-80">
            <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-stone-400" />
            <Input 
              placeholder="Rechercher une sous-catégorie..." 
              value={searchTerm} 
              onChange={e => setSearchTerm(e.target.value)}
              className="pl-11 h-12 text-xs font-bold border-stone-200 bg-stone-50 rounded-2xl focus:ring-stone-900 transition-all"
            />
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-5 gap-4">
          {subCategoryStats.map((sc, idx) => (
            <Card 
              key={sc.id} 
              className="cursor-pointer border-stone-100 hover:border-amber-400 hover:bg-amber-50/20 transition-all shadow-lg hover:shadow-amber-500/10 group rounded-[1.5rem] overflow-hidden bg-white active:scale-95"
              onClick={() => setSelectedCategory(sc.name)}
            >
              <CardContent className="p-0">
                <div className={`h-1.5 w-full ${UI_COLORS[idx % UI_COLORS.length]}`} style={{ backgroundColor: UI_COLORS[idx % UI_COLORS.length] }} />
                <div className="p-5">
                  <div className="flex justify-between items-start mb-4">
                    <div className="p-2 bg-stone-50 rounded-xl group-hover:bg-white transition-colors">
                      <Package className="w-4 h-4 text-stone-300 group-hover:text-stone-900" />
                    </div>
                    <Badge className="bg-stone-900 text-white text-[9px] font-black uppercase px-2">{sc.count}</Badge>
                  </div>
                  <h3 className="font-black text-xs text-stone-800 uppercase leading-tight mb-4 line-clamp-2 min-h-[2.5rem] group-hover:text-stone-900">{sc.name}</h3>
                  <div className="space-y-1.5 pt-4 border-t border-stone-50">
                    {Object.entries(sc.units).slice(0, 3).map(([unit, total]) => (
                      <div key={unit} className="flex justify-between items-center text-[10px]">
                        <span className="text-stone-400 font-bold uppercase tracking-tighter">{unit}</span>
                        <span className="font-black text-stone-800">{(total as number).toLocaleString()}</span>
                      </div>
                    ))}
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
          {subCategoryStats.length === 0 && (
            <div className="col-span-full py-24 text-center text-stone-300 font-black uppercase text-xs tracking-[0.3em] border-4 border-dashed border-stone-50 rounded-[3rem] bg-white/50">
              <Search className="w-12 h-12 mx-auto mb-6 text-stone-100" />
              Aucun résultat pour "{searchTerm}"
            </div>
          )}
        </div>
      </div>
    );
  }

  // ==========================================
  // VUE INITIALE (LISTE DES GROUPES)
  // ==========================================
  return (
    <div className="space-y-10 animate-in fade-in duration-700">
      <header className="bg-stone-900 p-10 rounded-[2.5rem] shadow-2xl relative overflow-hidden">
        <div className="absolute top-0 right-0 w-[500px] h-[500px] bg-amber-500/5 rounded-full -translate-y-1/2 translate-x-1/2 blur-[100px]" />
        <div className="relative z-10">
          <Badge className="bg-amber-500 text-white border-none px-4 py-1 text-[9px] font-black uppercase tracking-widest rounded-full mb-4">Architecture de Données</Badge>
          <h2 className="text-5xl font-black text-white uppercase tracking-tighter leading-tight">Répertoire <br /><span className="text-amber-500">Logistique</span></h2>
          <p className="text-stone-400 text-sm font-medium mt-4 max-w-md leading-relaxed">Accédez aux pôles d'activité pour une analyse granulaire des stocks et des flux logistiques mondiaux.</p>
        </div>
      </header>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-8">
        {Object.entries(groupStats).map(([id, stat], idx) => (
          <Card 
            key={id} 
            className="group cursor-pointer border-none bg-white shadow-xl hover:shadow-2xl transition-all rounded-[2rem] overflow-hidden active:scale-95 status-glow-amber"
            onClick={() => onSelectGeneralCategory(id)}
          >
            <div className={`h-2 w-full`} style={{ backgroundColor: UI_COLORS[idx % UI_COLORS.length] }} />
            <CardContent className="p-8">
              <div className="flex justify-between items-center mb-8">
                <div className="p-4 bg-stone-50 rounded-2xl text-stone-200 group-hover:bg-stone-900 group-hover:text-white transition-all">
                  <LayoutGrid className="w-7 h-7" />
                </div>
                <div className="text-right">
                  <p className="text-2xl font-black text-stone-900 leading-none">{stat.count}</p>
                  <p className="text-[9px] font-black text-stone-400 uppercase tracking-widest mt-1">Éléments</p>
                </div>
              </div>
              <h3 className="text-xl font-black text-stone-800 uppercase leading-none mb-8 group-hover:text-stone-900 tracking-tighter">{stat.name}</h3>
              <div className="space-y-3 pt-6 border-t border-stone-50">
                {Object.entries(stat.units).slice(0, 3).map(([unit, total]) => (
                  <div key={unit} className="flex justify-between items-center text-[11px]">
                    <span className="text-stone-400 font-black uppercase tracking-tighter">{unit}</span>
                    <span className="font-black text-stone-800">{(total as number).toLocaleString()}</span>
                  </div>
                ))}
              </div>
              <div className="mt-8 flex justify-end">
                <div className="p-2 bg-stone-50 rounded-lg opacity-0 group-hover:opacity-100 transition-all translate-x-4 group-hover:translate-x-0">
                  <ArrowUpRight className="w-4 h-4 text-stone-900" />
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
