"use client";

import React, { useMemo, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { 
  ChevronLeft, 
  Plus, 
  TrendingUp, 
  Cuboid, 
  Package, 
  Ship, 
  ArrowUpRight, 
  History,
  LayoutGrid,
  CheckCircle2,
  Clock,
  ArrowRight
} from 'lucide-react';
import { useUser, useFirestore } from '@/firebase';
import { doc } from 'firebase/firestore';
import { setDocumentNonBlocking } from '@/firebase/non-blocking-updates';
import { useToast } from '@/hooks/use-toast';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { 
  ResponsiveContainer, 
  XAxis, 
  YAxis, 
  CartesianGrid, 
  Tooltip as RechartsTooltip, 
  BarChart, 
  Bar, 
  AreaChart, 
  Area,
  LineChart,
  Line
} from 'recharts';
import { Badge } from '@/components/ui/badge';

interface CategoriesViewProps {
  articles: any[];
  factures: any[];
  generalCategories: any[];
  selectedCategory: string | null;
  setSelectedCategory: (category: string | null) => void;
  selectedGeneralCategoryId?: string | null;
}

export default function CategoriesView({ articles = [], factures = [], generalCategories = [], selectedCategory, setSelectedCategory, selectedGeneralCategoryId }: CategoriesViewProps) {
  const { user } = useUser();
  const firestore = useFirestore();
  const { toast } = useToast();
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [newCatName, setNewCatName] = useState('');
  const [targetGenCatId, setTargetGenCatId] = useState(selectedGeneralCategoryId || '');

  const now = useMemo(() => new Date(), []);

  const filteredCategoriesList = useMemo(() => {
    const data: Record<string, { qtyByUnit: Record<string, number>; val: number; count: number; cbm: number; genCatId: string }> = {};
    
    (articles || []).forEach(o => {
      if (selectedGeneralCategoryId && o.generalCategoryId !== selectedGeneralCategoryId) return;

      const cat = o.categoryId || 'Inconnu';
      if (!data[cat]) {
        data[cat] = { qtyByUnit: {}, val: 0, count: 0, cbm: 0, genCatId: o.generalCategoryId || '' };
      }
      
      const unit = (o.unitOfMeasure || 'pcs').toUpperCase();
      const qty = Number(o.quantity) || 0;
      const price = Number(o.purchasePricePerUnit) || 0;
      const cbm = Number(o.cubicMeasurement) || 0;

      data[cat].qtyByUnit[unit] = (data[cat].qtyByUnit[unit] || 0) + qty;
      data[cat].val += (qty * price);
      data[cat].cbm += cbm;
      data[cat].count += 1;
    });

    return Object.entries(data).sort((a, b) => a[0].localeCompare(b[0]));
  }, [articles, selectedGeneralCategoryId]);

  const catArticles = useMemo(() => {
    if (!selectedCategory) return [];
    return (articles || [])
      .filter(o => o.categoryId === selectedCategory && (!selectedGeneralCategoryId || o.generalCategoryId === selectedGeneralCategoryId))
      .sort((a, b) => new Date(b.orderDate).getTime() - new Date(a.orderDate).getTime());
  }, [articles, selectedCategory, selectedGeneralCategoryId]);

  const { transitArticles, arrivedArticles, pendingArticles } = useMemo(() => {
    const transit: any[] = [];
    const arrived: any[] = [];
    const pending: any[] = [];

    catArticles.forEach(o => {
      const arrivalDate = o.arrivalDate ? new Date(o.arrivalDate) : null;
      if (o.status === 'SHIPPED') {
        if (arrivalDate && arrivalDate > now) {
          transit.push(o);
        } else {
          arrived.push(o);
        }
      } else {
        pending.push(o);
      }
    });

    return { transitArticles: transit, arrivedArticles: arrived, pendingArticles: pending };
  }, [catArticles, now]);

  const stats = useMemo(() => {
    if (!selectedCategory || catArticles.length === 0) return null;
    
    let val = 0;
    let cbm = 0;
    const qtyByUnit: Record<string, { total: number; arrived: number; transit: number; pending: number }> = {};
    
    catArticles.forEach(o => {
      const qty = Number(o.quantity) || 0;
      const price = Number(o.purchasePricePerUnit) || 0;
      const itemVal = qty * price;
      const unit = (o.unitOfMeasure || 'pcs').toUpperCase();
      const itemCbm = Number(o.cubicMeasurement) || 0;
      
      if (!qtyByUnit[unit]) {
        qtyByUnit[unit] = { total: 0, arrived: 0, transit: 0, pending: 0 };
      }
      
      qtyByUnit[unit].total += qty;
      val += itemVal;
      cbm += itemCbm;

      const arrivalDate = o.arrivalDate ? new Date(o.arrivalDate) : null;
      if (o.status === 'SHIPPED') {
        if (arrivalDate && arrivalDate <= now) {
          qtyByUnit[unit].arrived += qty;
        } else {
          qtyByUnit[unit].transit += qty;
        }
      } else {
        qtyByUnit[unit].pending += qty;
      }
    });

    const dates = catArticles.map(o => new Date(o.orderDate).getTime()).filter(d => !isNaN(d));
    const arrivals = catArticles
      .filter(o => o.arrivalDate && new Date(o.arrivalDate) > now)
      .map(o => new Date(o.arrivalDate).getTime())
      .filter(d => !isNaN(d));

    return {
      val,
      cbm,
      qtyByUnit,
      lastOrder: dates.length > 0 ? new Date(Math.max(...dates)).toISOString().split('T')[0] : '-',
      nextArrival: arrivals.length > 0 ? new Date(Math.min(...arrivals)).toISOString().split('T')[0] : 'Aucune',
      avgInterval: dates.length > 1 ? Math.round((Math.max(...dates) - Math.min(...dates)) / (dates.length - 1) / (1000 * 60 * 60 * 24)) : 0
    };
  }, [catArticles, selectedCategory, now]);

  const topArticles = useMemo(() => {
    if (!selectedCategory) return [];
    const artMap: Record<string, { name: string; val: number; qty: number; unit: string }> = {};
    catArticles.forEach(o => {
      if (!artMap[o.name]) artMap[o.name] = { name: o.name, val: 0, qty: 0, unit: o.unitOfMeasure };
      artMap[o.name].val += (Number(o.quantity) * Number(o.purchasePricePerUnit));
      artMap[o.name].qty += Number(o.quantity);
    });
    return Object.values(artMap).sort((a, b) => b.val - a.val).slice(0, 5);
  }, [catArticles, selectedCategory]);

  const analysisData = useMemo(() => {
    if (!selectedCategory) return [];
    const monthly: Record<string, { val: number; cbm: number; pa: number; count: number }> = {};
    const timeline: any[] = [];
    
    catArticles.forEach(o => {
      const month = o.orderDate?.substring(0, 7);
      if (month) {
        if (!monthly[month]) monthly[month] = { val: 0, cbm: 0, pa: 0, count: 0 };
        monthly[month].val += (Number(o.quantity) * Number(o.purchasePricePerUnit));
        monthly[month].cbm += (Number(o.cubicMeasurement) || 0);
        monthly[month].pa += Number(o.purchasePricePerUnit);
        monthly[month].count += 1;
      }
    });

    Object.entries(monthly).sort().forEach(([month, data]) => {
      timeline.push({
        month,
        val: Math.round(data.val),
        cbm: Number(data.cbm.toFixed(2)),
        pa: Number((data.pa / data.count).toFixed(4))
      });
    });

    return timeline;
  }, [catArticles, selectedCategory]);

  const handleAddCategory = () => {
    if (!user || !firestore || !newCatName.trim() || !targetGenCatId) return;
    const id = crypto.randomUUID();
    const docRef = doc(firestore, 'users', user.uid, 'categories', id);
    setDocumentNonBlocking(docRef, { id, name: newCatName.trim().toUpperCase(), generalCategoryId: targetGenCatId }, { merge: true });
    toast({ title: "Sous-catégorie créée" });
    setIsModalOpen(false);
    setNewCatName('');
  };

  const renderTableSection = (title: string, data: any[], icon: React.ReactNode, type: 'transit' | 'arrived' | 'pending') => {
    if (data.length === 0) return null;

    const colors = {
      transit: { border: 'border-l-blue-500', bg: 'bg-blue-50/30', text: 'text-blue-700' },
      arrived: { border: 'border-l-emerald-500', bg: 'bg-emerald-50/30', text: 'text-emerald-700' },
      pending: { border: 'border-l-amber-500', bg: 'bg-amber-50/30', text: 'text-amber-700' }
    };

    const currentStyle = colors[type];

    return (
      <Card className={`shadow-sm border-none border-l-4 ${currentStyle.border} overflow-hidden bg-white mb-8`}>
        <div className={`${currentStyle.bg} px-6 py-4 border-b border-stone-100 flex items-center justify-between`}>
          <div className="flex items-center gap-3">
            <div className={`p-2 rounded-lg bg-white shadow-sm ${currentStyle.text}`}>
              {icon}
            </div>
            <h3 className="font-bold text-stone-800">{title}</h3>
          </div>
          <Badge variant="outline" className="bg-white/80 border-stone-200 text-stone-600 font-bold">
            {data.length} RÉFÉRENCES
          </Badge>
        </div>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow className="bg-stone-50/50">
                  <TableHead className="py-4 px-6 text-xs font-black uppercase tracking-widest">Article</TableHead>
                  <TableHead className="text-xs font-black uppercase tracking-widest">Spécifications</TableHead>
                  <TableHead className="text-xs font-black uppercase tracking-widest">Dates</TableHead>
                  <TableHead className="text-right text-xs font-black uppercase tracking-widest">Quantité</TableHead>
                  <TableHead className="text-right text-xs font-black uppercase tracking-widest">Volume</TableHead>
                  <TableHead className="text-right text-xs font-black uppercase tracking-widest">Valeur</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.map(o => (
                  <TableRow key={o.id} className="hover:bg-stone-50/80 transition-colors border-stone-100">
                    <TableCell className="py-4 px-6">
                      <div className="font-bold text-stone-900">{o.name}</div>
                      <div className="text-[10px] text-stone-400 font-bold uppercase">{o.supplierId || 'Sans fournisseur'}</div>
                    </TableCell>
                    <TableCell>
                      <div className="text-xs font-medium text-stone-600">{o.specs || 'N/A'}</div>
                      <div className="text-[10px] text-stone-400 font-bold uppercase">{o.color || 'Unique'}</div>
                    </TableCell>
                    <TableCell>
                      <div className="flex flex-col gap-1">
                        <div className="flex items-center gap-1.5 text-[10px] font-bold text-stone-400">
                          <span className="w-1.5 h-1.5 rounded-full bg-stone-300"></span> CMD: {o.orderDate}
                        </div>
                        {o.arrivalDate && (
                          <div className={`flex items-center gap-1.5 text-[10px] font-bold ${type === 'arrived' ? 'text-emerald-600' : 'text-blue-600'}`}>
                            <span className={`w-1.5 h-1.5 rounded-full ${type === 'arrived' ? 'bg-emerald-500' : 'bg-blue-500'}`}></span> ARR: {o.arrivalDate}
                          </div>
                        )}
                      </div>
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="font-black text-stone-900">{o.quantity.toLocaleString()}</div>
                      <div className="text-[10px] font-bold text-stone-400 uppercase">{o.unitOfMeasure}</div>
                    </TableCell>
                    <TableCell className="text-right font-bold text-emerald-700">
                      {o.cubicMeasurement ? `${o.cubicMeasurement.toFixed(2)} m³` : '-'}
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="font-black text-stone-900">{Math.round(o.quantity * o.purchasePricePerUnit).toLocaleString()} €</div>
                      <div className="text-[10px] font-bold text-stone-400">@ {o.purchasePricePerUnit.toFixed(4)}</div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>
    );
  };

  if (selectedCategory && stats) {
    return (
      <div className="space-y-8 fade-in">
        <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-6">
          <div className="space-y-2">
            <button 
              onClick={() => setSelectedCategory(null)} 
              className="flex items-center gap-2 text-stone-400 hover:text-stone-900 transition-all font-bold text-xs uppercase tracking-widest group"
            >
              <ChevronLeft className="w-4 h-4 group-hover:-translate-x-1 transition-transform" /> Retour à la liste
            </button>
            <h2 className="text-4xl font-black text-stone-900 uppercase tracking-tighter flex items-center gap-4">
              {selectedCategory}
              <div className="h-10 w-px bg-stone-200 mx-2"></div>
              <span className="text-amber-600">{catArticles.length} <span className="text-stone-400 text-lg">RÉFS</span></span>
            </h2>
          </div>
          
          <div className="flex flex-wrap gap-3 justify-end w-full md:w-auto">
            <KPIItem label="Valeur Totale" value={Math.round(stats.val).toLocaleString() + " €"} icon={<TrendingUp className="w-4 h-4" />} color="text-amber-700" />
            <KPIItem label="Volume Total" value={stats.cbm.toFixed(2) + " m³"} icon={<Cuboid className="w-4 h-4" />} color="text-emerald-700" />
            <KPIItem label="Dernière Cmd" value={stats.lastOrder} icon={<History className="w-4 h-4" />} color="text-stone-800" />
            <KPIItem label="Next Arrivée" value={stats.nextArrival} icon={<Ship className="w-4 h-4" />} color="text-blue-700" isHighlight={stats.nextArrival !== 'Aucune'} />
          </div>
        </div>

        {/* Tables Section First as requested */}
        <div className="space-y-4">
          {renderTableSection("Commandes en Transit", transitArticles, <Ship className="w-5 h-5" />, 'transit')}
          {renderTableSection("Historique des Réceptions", arrivedArticles, <CheckCircle2 className="w-5 h-5" />, 'arrived')}
          {renderTableSection("En cours de commande / Production", pendingArticles, <Clock className="w-5 h-5" />, 'pending')}
        </div>

        {/* Analytics Section */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8 pt-4">
          <Card className="lg:col-span-1 border-none shadow-sm bg-stone-900 text-white rounded-2xl">
            <CardHeader className="border-b border-stone-800 pb-4 flex flex-row items-center justify-between">
              <CardTitle className="text-xs font-black uppercase tracking-widest text-amber-400 flex items-center gap-2">
                <ArrowUpRight className="w-4 h-4" /> Top 5 Articles
              </CardTitle>
              <div className="text-[10px] text-stone-500 font-bold">PAR VALEUR</div>
            </CardHeader>
            <CardContent className="p-0">
              {topArticles.map((art, idx) => (
                <div key={idx} className="p-5 border-b border-stone-800 last:border-0 flex justify-between items-center hover:bg-stone-800/50 transition-colors">
                  <div className="flex items-center gap-4">
                    <span className="text-xl font-black text-stone-700">0{idx + 1}</span>
                    <div>
                      <div className="text-xs font-black text-stone-100 uppercase truncate max-w-[160px]">{art.name}</div>
                      <div className="text-[10px] text-stone-500 font-bold uppercase">{art.qty.toLocaleString()} {art.unit}</div>
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="text-sm font-black text-amber-400">{Math.round(art.val).toLocaleString()} €</div>
                    <div className="text-[10px] font-bold text-stone-500 uppercase tracking-widest">{((art.val / (stats?.val || 1)) * 100).toFixed(1)}%</div>
                  </div>
                </div>
              ))}
            </CardContent>
          </Card>

          <div className="lg:col-span-2 space-y-6">
            <Card className="shadow-sm border-none bg-white rounded-2xl overflow-hidden">
              <CardHeader className="bg-stone-50/50 border-b border-stone-100 pb-4">
                <CardTitle className="text-xs font-black uppercase tracking-widest flex items-center gap-2 text-stone-600">
                  <TrendingUp className="w-4 h-4 text-amber-600" /> Analyse de Flux Financier
                </CardTitle>
              </CardHeader>
              <CardContent className="h-[300px] pt-8">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={analysisData}>
                    <defs>
                      <linearGradient id="colorValCat" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#d97706" stopOpacity={0.15}/>
                        <stop offset="95%" stopColor="#d97706" stopOpacity={0}/>
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f1f1" />
                    <XAxis dataKey="month" fontSize={10} fontWeight="bold" tickLine={false} axisLine={false} tick={{fill: '#a8a29e'}} />
                    <YAxis fontSize={10} fontWeight="bold" tickLine={false} axisLine={false} tick={{fill: '#a8a29e'}} tickFormatter={(v) => `${v/1000}k`} />
                    <RechartsTooltip 
                      contentStyle={{borderRadius: '12px', border: 'none', boxShadow: '0 10px 15px -3px rgb(0 0 0 / 0.1)'}}
                      formatter={(v: any) => [`${Number(v).toLocaleString()} €`, 'Volume Mensuel']} 
                    />
                    <Area type="monotone" dataKey="val" stroke="#d97706" strokeWidth={4} fillOpacity={1} fill="url(#colorValCat)" />
                  </AreaChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
               <Card className="shadow-sm border-none bg-white rounded-2xl">
                <CardHeader className="pb-2">
                  <CardTitle className="text-[10px] font-black uppercase tracking-widest text-stone-400">Tendance Prix d'Achat</CardTitle>
                </CardHeader>
                <CardContent className="h-[160px]">
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={analysisData}>
                      <XAxis dataKey="month" hide />
                      <YAxis hide domain={['auto', 'auto']} />
                      <RechartsTooltip />
                      <Line type="monotone" dataKey="pa" stroke="#44403c" strokeWidth={3} dot={{r: 4, fill: '#44403c'}} />
                    </LineChart>
                  </ResponsiveContainer>
                </CardContent>
              </Card>
              <Card className="shadow-sm border-none bg-white rounded-2xl">
                <CardHeader className="pb-2">
                  <CardTitle className="text-[10px] font-black uppercase tracking-widest text-stone-400">Flux Volumétrique (CBM)</CardTitle>
                </CardHeader>
                <CardContent className="h-[160px]">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={analysisData}>
                      <XAxis dataKey="month" hide />
                      <YAxis hide />
                      <RechartsTooltip />
                      <Bar dataKey="cbm" fill="#059669" radius={[6, 6, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </CardContent>
              </Card>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-8 fade-in">
      <div className="bg-white rounded-2xl shadow-sm border border-stone-100 p-10 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-6">
        <div>
          <h1 className="text-4xl font-black text-stone-900 uppercase tracking-tighter">Sous-Catégories</h1>
          {selectedGeneralCategoryId ? (
            <div className="flex items-center gap-3 mt-3">
               <Badge className="bg-amber-600 text-white px-3 py-1 rounded-lg font-black text-xs uppercase tracking-widest border-none">
                 GROUPE: {generalCategories.find(gc => gc.id === selectedGeneralCategoryId)?.name || 'Inconnu'}
               </Badge>
               <div className="h-4 w-px bg-stone-200"></div>
               <span className="text-stone-400 text-xs font-bold uppercase tracking-widest">{filteredCategoriesList.length} TYPES RÉPERTORIÉS</span>
            </div>
          ) : (
            <div className="flex items-center gap-2 mt-3 text-stone-400 animate-pulse">
              <div className="w-2 h-2 rounded-full bg-amber-500"></div>
              <p className="text-xs font-bold uppercase tracking-widest">Sélectionnez un groupe pour filtrer</p>
            </div>
          )}
        </div>
        <Button onClick={() => setIsModalOpen(true)} className="bg-stone-900 hover:bg-black text-white font-black uppercase tracking-widest h-14 px-8 rounded-2xl shadow-xl shadow-stone-200 transition-all hover:-translate-y-1 active:scale-95 flex items-center gap-3">
          <Plus className="w-6 h-6" /> Nouveau Type
        </Button>
      </div>
      
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-8">
        {filteredCategoriesList.length === 0 ? (
          <div className="col-span-full py-32 text-center border-2 border-dashed border-stone-200 rounded-[2.5rem] bg-white/40">
            <div className="bg-white w-20 h-20 rounded-3xl shadow-sm flex items-center justify-center mx-auto mb-6">
               <Package className="w-10 h-10 text-stone-200" />
            </div>
            <p className="text-stone-400 font-black uppercase tracking-widest text-sm">Aucune donnée disponible</p>
          </div>
        ) : filteredCategoriesList.map(([name, stats]) => (
          <Card 
            key={name} 
            onClick={() => setSelectedCategory(name)} 
            className="cursor-pointer hover:shadow-2xl hover:scale-[1.02] transition-all group border-none shadow-lg overflow-hidden bg-white rounded-[2rem]"
          >
            <div className="h-3 w-full bg-stone-100 group-hover:bg-amber-500 transition-colors" />
            <CardContent className="p-8">
              <h3 className="text-2xl font-black mb-8 group-hover:text-amber-600 transition-colors uppercase tracking-tighter leading-none h-12 flex items-center">{name}</h3>
              
              <div className="grid grid-cols-2 gap-6 mb-8">
                <div>
                  <div className="text-[10px] text-stone-400 font-black uppercase tracking-widest mb-2">Volume Total</div>
                  <div className="text-xl font-black text-emerald-700 tracking-tight">{stats.cbm.toFixed(2)} m³</div>
                </div>
                <div>
                  <div className="text-[10px] text-stone-400 font-black uppercase tracking-widest mb-2">Val. Cumulée</div>
                  <div className="text-xl font-black text-amber-700 tracking-tight">{Math.round(stats.val).toLocaleString()} €</div>
                </div>
              </div>

              <div className="pt-6 border-t border-stone-50">
                <div className="text-[10px] text-stone-400 font-black uppercase tracking-widest mb-3">Répartition Principale</div>
                <div className="flex flex-wrap gap-2">
                  {Object.entries(stats.qtyByUnit).slice(0, 3).map(([unit, qty]) => (
                    <div key={unit} className="bg-stone-50 text-stone-600 px-3 py-1.5 rounded-xl text-[10px] font-black border border-stone-100 uppercase">
                      {qty.toLocaleString()} {unit}
                    </div>
                  ))}
                </div>
              </div>

              <div className="mt-8 flex justify-between items-center pt-6 border-t border-stone-50">
                <span className="text-stone-400 text-[10px] font-black uppercase tracking-widest">{stats.count} RÉFÉRENCES</span>
                <span className="bg-stone-900 text-white p-2 rounded-xl group-hover:bg-amber-600 transition-all">
                  <ArrowRight className="w-4 h-4" />
                </span>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      <Dialog open={isModalOpen} onOpenChange={setIsModalOpen}>
        <DialogContent className="rounded-[2.5rem] border-none shadow-2xl p-8">
          <DialogHeader>
            <DialogTitle className="text-3xl font-black text-stone-900 uppercase tracking-tighter">Paramétrage Type</DialogTitle>
          </DialogHeader>
          <div className="space-y-8 py-8">
            <div className="space-y-3">
              <label className="text-xs font-black uppercase text-stone-400 tracking-widest">Groupe Parent</label>
              <Select value={targetGenCatId} onValueChange={setTargetGenCatId}>
                <SelectTrigger className="h-14 rounded-2xl bg-stone-50 border-stone-100 px-6 font-bold text-stone-700"><SelectValue placeholder="Sélectionner..." /></SelectTrigger>
                <SelectContent className="rounded-2xl border-stone-100">
                  {(generalCategories || []).map(gc => (
                    <SelectItem key={gc.id} value={gc.id} className="font-bold uppercase py-3">{gc.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-3">
              <label className="text-xs font-black uppercase text-stone-400 tracking-widest">Désignation du Type</label>
              <Input 
                value={newCatName} 
                onChange={e => setNewCatName(e.target.value.toUpperCase())} 
                placeholder="Ex: ZIPPER NO5" 
                className="h-14 rounded-2xl uppercase font-black bg-stone-50 border-stone-100 px-6 text-lg focus:ring-amber-500" 
              />
            </div>
          </div>
          <DialogFooter>
            <Button onClick={handleAddCategory} className="w-full bg-stone-900 hover:bg-black h-16 rounded-2xl text-white font-black uppercase tracking-widest text-sm shadow-xl transition-all active:scale-95">Créer la Sous-Catégorie</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function KPIItem({ label, value, icon, color, isHighlight }: any) {
  return (
    <div className={`bg-white p-5 rounded-2xl shadow-sm border border-stone-100 flex flex-col min-w-[160px] transition-all ${isHighlight ? 'ring-2 ring-blue-500/20 bg-blue-50/10' : ''}`}>
      <div className="text-[10px] text-stone-400 font-black uppercase tracking-widest mb-2 flex items-center gap-2">
        <span className={isHighlight ? 'text-blue-500' : 'text-stone-300'}>{icon}</span>
        {label}
      </div>
      <div className={`text-xl font-black tracking-tight ${color}`}>{value}</div>
    </div>
  );
}
