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
  Calendar, 
  Package, 
  Ship, 
  ArrowUpRight, 
  BarChart3,
  History,
  LayoutGrid,
  CheckCircle2,
  Clock
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

  const now = new Date();

  const filteredCategoriesList = useMemo(() => {
    const data: Record<string, { qtyByUnit: Record<string, number>; val: number; count: number; cbm: number; genCatId: string }> = {};
    
    (articles || []).forEach(o => {
      if (selectedGeneralCategoryId && o.generalCategoryId !== selectedGeneralCategoryId) return;

      const cat = o.categoryId || 'Inconnu';
      if (!data[cat]) {
        data[cat] = { qtyByUnit: {}, val: 0, count: 0, cbm: 0, genCatId: o.generalCategoryId || '' };
      }
      
      const unit = (o.unitOfMeasure || 'pcs').toLowerCase();
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
      const unit = (o.unitOfMeasure || 'pcs').toLowerCase();
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

  const renderTable = (title: string, data: any[], icon: React.ReactNode, type: 'transit' | 'arrived' | 'pending') => {
    if (data.length === 0) return null;

    const accentClass = 
      type === 'transit' ? 'border-l-blue-500' : 
      type === 'arrived' ? 'border-l-emerald-500' : 'border-l-amber-500';

    const bgHeaderClass = 
      type === 'transit' ? 'bg-blue-50/50' : 
      type === 'arrived' ? 'bg-emerald-50/50' : 'bg-amber-50/50';

    return (
      <Card className={`shadow-sm border-stone-200 border-l-4 ${accentClass} overflow-hidden mb-6`}>
        <CardHeader className={`${bgHeaderClass} border-b flex flex-row items-center justify-between py-3`}>
          <CardTitle className="text-sm font-bold flex items-center gap-2">
            {icon} {title}
          </CardTitle>
          <Badge variant="outline" className="bg-white/50">{data.length} articles</Badge>
        </CardHeader>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader className="bg-white">
                <TableRow>
                  <TableHead>Article</TableHead>
                  <TableHead>Specs / Couleur</TableHead>
                  <TableHead><Calendar className="w-3 h-3 inline mr-1" /> Commande</TableHead>
                  <TableHead><Ship className="w-3 h-3 inline mr-1" /> Arrivée</TableHead>
                  <TableHead className="text-right">Quantité</TableHead>
                  <TableHead className="text-right">PA (€)</TableHead>
                  <TableHead className="text-right">Vol. (CBM)</TableHead>
                  <TableHead className="text-right">Valeur Totale</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.map(o => (
                  <TableRow key={o.id} className="hover:bg-stone-50/50 transition-colors">
                    <TableCell className="font-bold text-stone-900">{o.name}</TableCell>
                    <TableCell className="text-[10px] text-stone-500 uppercase font-bold">
                      {o.specs || '-'} • <span className="text-stone-400">{o.color || 'UNIQUE'}</span>
                    </TableCell>
                    <TableCell className="text-stone-500 text-xs font-medium">{o.orderDate || '-'}</TableCell>
                    <TableCell className={`text-xs font-bold ${type === 'arrived' ? 'text-emerald-600' : type === 'transit' ? 'text-blue-600' : 'text-amber-600'}`}>
                      {o.arrivalDate || '-'}
                    </TableCell>
                    <TableCell className="text-right font-black">
                      {(o.quantity || 0).toLocaleString()} <span className="text-[10px] text-stone-400 font-normal">{o.unitOfMeasure}</span>
                    </TableCell>
                    <TableCell className="text-right text-stone-400 font-mono text-xs">{(o.purchasePricePerUnit || 0).toFixed(4)}</TableCell>
                    <TableCell className="text-right text-emerald-700 font-bold">{(o.cubicMeasurement || 0).toFixed(2)}</TableCell>
                    <TableCell className="text-right font-black">
                      {((o.quantity || 0) * (o.purchasePricePerUnit || 0)).toLocaleString()} €
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
          <div className="space-y-1">
            <Button variant="ghost" onClick={() => setSelectedCategory(null)} className="p-0 h-auto hover:bg-transparent text-stone-500 mb-2">
              <ChevronLeft className="mr-1 w-4 h-4" /> Retour aux sous-catégories
            </Button>
            <h2 className="text-4xl font-black text-stone-900 uppercase tracking-tighter flex items-center gap-3">
              {selectedCategory}
              <Badge className="bg-amber-600 text-white border-none">{catArticles.length} au total</Badge>
            </h2>
            <p className="text-stone-500 font-medium">Analyse stratégique et étude des flux pour {selectedCategory}</p>
          </div>
          
          <div className="flex flex-wrap gap-3 justify-end w-full md:w-auto">
            <KPIItem label="Valeur Totale" value={Math.round(stats.val).toLocaleString() + " €"} icon={<TrendingUp className="w-4 h-4" />} color="text-amber-700" />
            <KPIItem label="Volume Total" value={stats.cbm.toFixed(2) + " m³"} icon={<Cuboid className="w-4 h-4" />} color="text-emerald-700" />
            <KPIItem label="Dernière Commande" value={stats.lastOrder} icon={<History className="w-4 h-4" />} color="text-stone-800" />
            <KPIItem label="Prochaine Arrivée" value={stats.nextArrival} icon={<Ship className="w-4 h-4" />} color="text-blue-700" isHighlight={stats.nextArrival !== 'Aucune'} />
          </div>
        </div>

        {/* Units Breakdown */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          {Object.entries(stats.qtyByUnit).map(([unit, q]) => (
            <Card key={unit} className="border-l-4 border-l-stone-800 shadow-sm">
              <CardContent className="p-4">
                <div className="text-[10px] font-black text-stone-400 uppercase tracking-widest mb-2 flex justify-between items-center">
                   <span>Unités: {unit}</span>
                   <Package className="w-3 h-3" />
                </div>
                <div className="text-2xl font-black text-stone-800 mb-3">{q.total.toLocaleString()}</div>
                <div className="space-y-1 text-xs font-bold">
                  <div className="flex justify-between text-emerald-600 bg-emerald-50/50 p-1 rounded">
                    <span className="flex items-center gap-1">✅ Arrivé</span>
                    <span>{q.arrived.toLocaleString()}</span>
                  </div>
                  <div className="flex justify-between text-blue-600 bg-blue-50/50 p-1 rounded">
                    <span className="flex items-center gap-1">🚢 En Transit</span>
                    <span>{q.transit.toLocaleString()}</span>
                  </div>
                  <div className="flex justify-between text-amber-600 bg-amber-50/50 p-1 rounded">
                    <span className="flex items-center gap-1">🕒 En cours</span>
                    <span>{q.pending.toLocaleString()}</span>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
          <Card className="bg-stone-50 border-dashed shadow-none">
            <CardContent className="p-4 flex flex-col justify-center h-full">
              <div className="text-[10px] font-black text-stone-400 uppercase tracking-widest mb-1">Intervalle de Commande</div>
              <div className="text-xl font-black text-stone-700">{stats.avgInterval} jours</div>
              <p className="text-[10px] text-stone-400 mt-1">Délai moyen entre chaque rappel de stock.</p>
            </CardContent>
          </Card>
        </div>

        {/* Tables Section */}
        <div className="space-y-8">
          {renderTable("Commandes en Transit", transitArticles, <Ship className="w-4 h-4 text-blue-500" />, 'transit')}
          {renderTable("Commandes Arrivées", arrivedArticles, <CheckCircle2 className="w-4 h-4 text-emerald-500" />, 'arrived')}
          {renderTable("Rappels et Production", pendingArticles, <Clock className="w-4 h-4 text-amber-500" />, 'pending')}
        </div>

        {/* Analysis Charts */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          <Card className="lg:col-span-1 border-none shadow-sm bg-stone-900 text-white">
            <CardHeader className="border-b border-stone-800 pb-4">
              <CardTitle className="text-sm font-bold flex items-center gap-2 text-amber-400"><ArrowUpRight className="w-4 h-4" /> Top 5 Articles (Valeur)</CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              {topArticles.map((art, idx) => (
                <div key={idx} className="p-4 border-b border-stone-800 last:border-0 flex justify-between items-center hover:bg-stone-800/50 transition-colors">
                  <div className="flex items-center gap-3">
                    <span className="text-lg font-black text-stone-700">0{idx + 1}</span>
                    <div>
                      <div className="text-xs font-black text-stone-100 uppercase truncate max-w-[150px]">{art.name}</div>
                      <div className="text-[10px] text-stone-500">{art.qty.toLocaleString()} {art.unit}</div>
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
            <Card className="shadow-sm">
              <CardHeader className="pb-0">
                <CardTitle className="text-sm font-bold flex items-center gap-2"><TrendingUp className="w-4 h-4" /> Analyse de la Valeur Mensuelle</CardTitle>
              </CardHeader>
              <CardContent className="h-[280px] pt-4">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={analysisData}>
                    <defs>
                      <linearGradient id="colorVal" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#d97706" stopOpacity={0.1}/>
                        <stop offset="95%" stopColor="#d97706" stopOpacity={0}/>
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f5f5f5" />
                    <XAxis dataKey="month" fontSize={10} tickLine={false} axisLine={false} />
                    <YAxis fontSize={10} tickLine={false} axisLine={false} tickFormatter={(v) => `${v/1000}k`} />
                    <RechartsTooltip formatter={(v: any) => [`${Number(v).toLocaleString()} €`, 'Valeur Mensuelle']} />
                    <Area type="monotone" dataKey="val" stroke="#d97706" strokeWidth={3} fillOpacity={1} fill="url(#colorVal)" />
                  </AreaChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
               <Card className="shadow-sm">
                <CardHeader className="pb-2">
                  <CardTitle className="text-[10px] font-black uppercase tracking-widest text-stone-400">Tendance du Prix (PA)</CardTitle>
                </CardHeader>
                <CardContent className="h-[150px]">
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={analysisData}>
                      <XAxis dataKey="month" hide />
                      <YAxis hide domain={['auto', 'auto']} />
                      <RechartsTooltip />
                      <Line type="stepAfter" dataKey="pa" stroke="#44403c" strokeWidth={2} dot={false} />
                    </LineChart>
                  </ResponsiveContainer>
                </CardContent>
              </Card>
              <Card className="shadow-sm">
                <CardHeader className="pb-2">
                  <CardTitle className="text-[10px] font-black uppercase tracking-widest text-stone-400">Flux de Volume (CBM)</CardTitle>
                </CardHeader>
                <CardContent className="h-[150px]">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={analysisData}>
                      <XAxis dataKey="month" hide />
                      <YAxis hide />
                      <RechartsTooltip />
                      <Bar dataKey="cbm" fill="#059669" radius={[4, 4, 0, 0]} />
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
      <div className="bg-white rounded-2xl shadow-sm border border-stone-100 p-8 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-6">
        <div>
          <h1 className="text-3xl font-black text-stone-900 uppercase tracking-tighter">Types de Produits</h1>
          {selectedGeneralCategoryId ? (
            <div className="flex items-center gap-2 mt-2">
               <Badge className="bg-amber-100 text-amber-800 border-none font-bold">
                 GROUPE : {generalCategories.find(gc => gc.id === selectedGeneralCategoryId)?.name || 'Inconnu'}
               </Badge>
               <span className="text-stone-400 text-xs font-medium">• {filteredCategoriesList.length} types trouvés</span>
            </div>
          ) : (
            <p className="text-stone-500 font-medium mt-1 italic">Sélectionnez une famille générale pour affiner la liste.</p>
          )}
        </div>
        <Button onClick={() => setIsModalOpen(true)} className="bg-stone-900 hover:bg-black text-white font-bold h-12 px-6 rounded-xl shadow-lg shadow-stone-200 transition-all hover:-translate-y-1">
          <Plus className="mr-2 w-5 h-5" /> Nouveau Type
        </Button>
      </div>
      
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
        {filteredCategoriesList.length === 0 ? (
          <div className="col-span-full py-24 text-center border-2 border-dashed border-stone-200 rounded-3xl bg-white/50">
            <div className="bg-stone-100 w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-4">
               <Package className="w-8 h-8 text-stone-300" />
            </div>
            <p className="text-stone-400 font-bold uppercase tracking-widest text-sm">Aucun type de produit trouvé</p>
          </div>
        ) : filteredCategoriesList.map(([name, stats]) => (
          <Card 
            key={name} 
            onClick={() => setSelectedCategory(name)} 
            className="cursor-pointer hover:shadow-xl transition-all group border-none shadow-sm overflow-hidden bg-white"
          >
            <div className="h-2 w-full bg-stone-800 group-hover:bg-amber-600 transition-colors" />
            <CardContent className="p-6">
              <h3 className="text-xl font-black mb-6 group-hover:text-amber-600 transition-colors uppercase tracking-tight truncate">{name}</h3>
              
              <div className="grid grid-cols-2 gap-4 mb-6">
                <div>
                  <div className="text-[10px] text-stone-400 font-black uppercase tracking-widest mb-1">Volume Fis.</div>
                  <div className="text-lg font-black text-emerald-700">{stats.cbm.toFixed(2)} m³</div>
                </div>
                <div>
                  <div className="text-[10px] text-stone-400 font-black uppercase tracking-widest mb-1">Val. Totale</div>
                  <div className="text-lg font-black text-amber-700">{Math.round(stats.val).toLocaleString()} €</div>
                </div>
              </div>

              <div className="pt-4 border-t border-stone-100">
                <div className="text-[10px] text-stone-400 font-bold uppercase mb-2">Répartition Quantités</div>
                <div className="flex flex-wrap gap-1.5">
                  {Object.entries(stats.qtyByUnit).slice(0, 3).map(([unit, qty]) => (
                    <Badge key={unit} variant="secondary" className="bg-stone-50 text-stone-600 border-stone-100 text-[10px] font-bold">
                      {qty.toLocaleString()} {unit}
                    </Badge>
                  ))}
                </div>
              </div>

              <div className="mt-6 flex justify-between items-center text-xs pt-4 border-t border-stone-50">
                <span className="text-stone-400 font-medium">{stats.count} Articles</span>
                <span className="text-stone-900 font-black uppercase tracking-tighter group-hover:translate-x-1 transition-transform flex items-center gap-1">Détails <LayoutGrid className="w-3 h-3" /></span>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      <Dialog open={isModalOpen} onOpenChange={setIsModalOpen}>
        <DialogContent className="rounded-2xl border-none shadow-2xl">
          <DialogHeader>
            <DialogTitle className="text-2xl font-black text-stone-900 uppercase tracking-tighter">Nouveau Type de Produit</DialogTitle>
          </DialogHeader>
          <div className="space-y-6 py-6">
            <div className="space-y-2">
              <label className="text-xs font-black uppercase text-stone-500 tracking-widest">Famille Générale (Parent)</label>
              <Select value={targetGenCatId} onValueChange={setTargetGenCatId}>
                <SelectTrigger className="h-12 rounded-xl bg-stone-50 border-stone-100"><SelectValue placeholder="Choisir le groupe..." /></SelectTrigger>
                <SelectContent className="rounded-xl">
                  {(generalCategories || []).map(gc => (
                    <SelectItem key={gc.id} value={gc.id}>{gc.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <label className="text-xs font-black uppercase text-stone-500 tracking-widest">Nom du Type (ex: ZIP NO5)</label>
              <Input 
                value={newCatName} 
                onChange={e => setNewCatName(e.target.value.toUpperCase())} 
                placeholder="Nom..." 
                className="h-12 rounded-xl uppercase font-bold bg-stone-50 border-stone-100" 
              />
            </div>
          </div>
          <DialogFooter>
            <Button onClick={handleAddCategory} className="w-full bg-stone-900 h-12 rounded-xl text-white font-black uppercase tracking-widest">Créer la Sous-Catégorie</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function KPIItem({ label, value, icon, color, isHighlight }: any) {
  return (
    <div className={`bg-white p-4 rounded-2xl shadow-sm border border-stone-100 flex flex-col min-w-[140px] ${isHighlight ? 'ring-2 ring-blue-500 ring-offset-2' : ''}`}>
      <div className="text-[10px] text-stone-400 font-black uppercase tracking-widest mb-1 flex items-center gap-1">
        {icon} {label}
      </div>
      <div className={`text-lg font-black tracking-tight ${color}`}>{value}</div>
    </div>
  );
}
