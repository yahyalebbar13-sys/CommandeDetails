"use client";

import React, { useMemo, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Label } from '@/components/ui/label';
import { 
  ChevronLeft, 
  Plus, 
  Package, 
  Ship, 
  CheckCircle2,
  Clock,
  ArrowRight,
  BarChart3,
  LineChart as LineChartIcon,
  TrendingUp,
  Box,
  LayoutGrid,
  Info
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

const SUB_COLORS = [
  'border-t-blue-500',
  'border-t-amber-500',
  'border-t-emerald-500',
  'border-t-purple-500',
  'border-t-rose-500',
  'border-t-indigo-500',
  'border-t-orange-500',
  'border-t-cyan-500',
];

export default function CategoriesView({ 
  articles = [], 
  factures = [], 
  generalCategories = [], 
  selectedCategory, 
  setSelectedCategory, 
  selectedGeneralCategoryId 
}: CategoriesViewProps) {
  const { user } = useUser();
  const firestore = useFirestore();
  const { toast } = useToast();
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [newCatName, setNewCatName] = useState('');
  const [targetGenCatId, setTargetGenCatId] = useState(selectedGeneralCategoryId || '');

  const now = useMemo(() => new Date(), []);

  // 1. Liste des catégories pour la grille
  const filteredCategoriesList = useMemo(() => {
    const data: Record<string, { qtyByUnit: Record<string, number>; val: number; count: number; genCatId: string }> = {};
    
    (articles || []).forEach(o => {
      if (selectedGeneralCategoryId && o.generalCategoryId !== selectedGeneralCategoryId) return;

      const cat = o.categoryId || 'Inconnu';
      if (!data[cat]) {
        data[cat] = { qtyByUnit: {}, val: 0, count: 0, genCatId: o.generalCategoryId || '' };
      }
      
      const unit = (o.unitOfMeasure || 'pcs').toUpperCase();
      const qty = Number(o.quantity) || 0;
      const price = Number(o.purchasePricePerUnit) || 0;

      data[cat].qtyByUnit[unit] = (data[cat].qtyByUnit[unit] || 0) + qty;
      data[cat].val += (qty * price);
      data[cat].count += 1;
    });

    return Object.entries(data).sort((a, b) => b.val - a.val);
  }, [articles, selectedGeneralCategoryId]);

  // 2. Articles de la catégorie sélectionnée
  const catArticles = useMemo(() => {
    if (!selectedCategory) return [];
    return (articles || [])
      .filter(o => o.categoryId === selectedCategory && (!selectedGeneralCategoryId || o.generalCategoryId === selectedGeneralCategoryId))
      .sort((a, b) => new Date(b.orderDate).getTime() - new Date(a.orderDate).getTime());
  }, [articles, selectedCategory, selectedGeneralCategoryId]);

  // 3. Répartition des articles par statut
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

  // 4. Statistiques globales de la catégorie
  const stats = useMemo(() => {
    if (!selectedCategory || catArticles.length === 0) return null;
    
    let totalValue = 0;
    const qtyByUnit: Record<string, { total: number; arrived: number; transit: number; pending: number }> = {};
    
    catArticles.forEach(o => {
      const qty = Number(o.quantity) || 0;
      const price = Number(o.purchasePricePerUnit) || 0;
      const unit = (o.unitOfMeasure || 'pcs').toUpperCase();
      
      if (!qtyByUnit[unit]) {
        qtyByUnit[unit] = { total: 0, arrived: 0, transit: 0, pending: 0 };
      }
      
      qtyByUnit[unit].total += qty;
      totalValue += (qty * price);

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
    const lastOrder = dates.length > 0 ? new Date(Math.max(...dates)).toLocaleDateString() : '-';

    return { totalValue, qtyByUnit, lastOrder };
  }, [catArticles, selectedCategory, now]);

  // 5. Données pour les graphiques
  const analysisData = useMemo(() => {
    if (!selectedCategory) return [];
    const monthly: Record<string, { month: string; val: number; pa: number; count: number }> = {};
    
    catArticles.forEach(o => {
      const month = o.orderDate?.substring(0, 7);
      if (month) {
        if (!monthly[month]) monthly[month] = { month, val: 0, pa: 0, count: 0 };
        monthly[month].val += (Number(o.quantity) * Number(o.purchasePricePerUnit));
        monthly[month].pa += Number(o.purchasePricePerUnit);
        monthly[month].count += 1;
      }
    });

    return Object.values(monthly).sort((a, b) => a.month.localeCompare(b.month)).map(data => ({
      ...data,
      val: Math.round(data.val),
      pa: Number((data.pa / data.count).toFixed(4))
    }));
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

  const renderTable = (title: string, data: any[], icon: React.ReactNode, variant: 'blue' | 'emerald' | 'amber') => {
    if (data.length === 0) return null;

    const variantStyles = {
      blue: "border-l-blue-500 bg-blue-50/20",
      emerald: "border-l-emerald-500 bg-emerald-50/20",
      amber: "border-l-amber-500 bg-amber-50/20"
    };

    return (
      <Card className={`border-l-4 ${variantStyles[variant]} shadow-sm overflow-hidden`}>
        <CardHeader className="py-4 border-b bg-white/50">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              {icon}
              <CardTitle className="text-sm font-black uppercase tracking-widest text-stone-700">{title}</CardTitle>
            </div>
            <Badge variant="outline" className="font-black">{data.length}</Badge>
          </div>
        </CardHeader>
        <CardContent className="p-0 bg-white">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader className="bg-stone-50">
                <TableRow>
                  <TableHead className="text-[10px] font-black uppercase py-2">Article</TableHead>
                  <TableHead className="text-[10px] font-black uppercase py-2">Specs / Couleur</TableHead>
                  <TableHead className="text-[10px] font-black uppercase py-2 text-center">Facture</TableHead>
                  <TableHead className="text-[10px] font-black uppercase py-2">Dates</TableHead>
                  <TableHead className="text-right text-[10px] font-black uppercase py-2">Quantité</TableHead>
                  <TableHead className="text-right text-[10px] font-black uppercase py-2">Valeur</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.map(o => (
                  <TableRow key={o.id} className="hover:bg-stone-50/50 border-b last:border-0">
                    <TableCell className="py-3">
                      <div className="font-bold text-stone-900 leading-tight">{o.name}</div>
                      <div className="text-[10px] text-stone-400 font-bold uppercase">{o.supplierId || 'N/A'}</div>
                    </TableCell>
                    <TableCell>
                      <div className="text-xs text-stone-600 font-medium">{o.specs || '-'}</div>
                      <div className="text-[10px] text-stone-400 font-bold uppercase">{o.color || '-'}</div>
                    </TableCell>
                    <TableCell className="text-center">
                      {o.factureId ? (
                        <Badge variant="outline" className="font-mono text-[9px] bg-stone-50 text-stone-600 border-stone-200">
                          {o.factureId}
                        </Badge>
                      ) : (
                        <span className="text-stone-300 text-xs">—</span>
                      )}
                    </TableCell>
                    <TableCell>
                      <div className="text-[10px] font-bold text-stone-500">Cmd: {o.orderDate}</div>
                      {o.arrivalDate && <div className={`text-[10px] font-black ${variant === 'blue' ? 'text-blue-600' : 'text-emerald-600'}`}>Arr: {o.arrivalDate}</div>}
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="font-black text-stone-900">{o.quantity.toLocaleString()}</div>
                      <div className="text-[10px] text-stone-400 font-bold uppercase">{o.unitOfMeasure}</div>
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="font-black text-stone-900">{Math.round(o.quantity * o.purchasePricePerUnit).toLocaleString()} €</div>
                      <div className="text-[10px] text-stone-400">@ {o.purchasePricePerUnit.toFixed(3)}</div>
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

  // VUE DÉTAILLÉE D'UNE CATÉGORIE
  if (selectedCategory && stats) {
    return (
      <div className="space-y-8 fade-in">
        <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-6 border-b border-stone-200 pb-8">
          <div className="space-y-2">
            <button 
              onClick={() => setSelectedCategory(null)} 
              className="flex items-center gap-1 text-amber-600 hover:text-amber-700 transition-all font-black text-[10px] uppercase tracking-widest"
            >
              <ChevronLeft className="w-4 h-4" /> Retour à la liste
            </button>
            <div className="flex items-center gap-3">
              <div className="p-3 bg-stone-900 text-white rounded-xl shadow-lg">
                <Box className="w-6 h-6" />
              </div>
              <h2 className="text-4xl font-black text-stone-900 uppercase tracking-tighter">{selectedCategory}</h2>
            </div>
          </div>
          
          <div className="flex flex-wrap gap-6 bg-white p-4 rounded-2xl shadow-sm border border-stone-100">
            <div className="text-right">
              <p className="text-[10px] font-black text-stone-400 uppercase tracking-widest mb-1">Valeur Totale</p>
              <p className="text-2xl font-black text-amber-600">{Math.round(stats.totalValue).toLocaleString()} €</p>
            </div>
            <div className="w-px h-10 bg-stone-200 hidden md:block"></div>
            <div className="text-right">
              <p className="text-[10px] font-black text-stone-400 uppercase tracking-widest mb-1">Dernière commande</p>
              <p className="text-xl font-black text-stone-700 uppercase">{stats.lastOrder}</p>
            </div>
          </div>
        </div>

        {/* Unités Section */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          {Object.entries(stats.qtyByUnit).map(([unit, data]) => (
            <Card key={unit} className="border-none shadow-sm bg-white overflow-hidden">
              <div className="h-1 bg-stone-900 w-full opacity-20" />
              <CardContent className="p-4">
                <div className="flex justify-between items-center mb-3">
                  <span className="text-xs font-black text-stone-400 uppercase tracking-wider">{unit}</span>
                  <Badge className="bg-stone-100 text-stone-900 border-none font-black">{data.total.toLocaleString()}</Badge>
                </div>
                <div className="grid grid-cols-1 gap-2">
                  <div className="flex justify-between text-[10px] font-bold">
                    <span className="text-stone-400">ARRIVÉ :</span>
                    <span className="text-emerald-600">{data.arrived.toLocaleString()}</span>
                  </div>
                  <div className="flex justify-between text-[10px] font-bold">
                    <span className="text-stone-400">TRANSIT :</span>
                    <span className="text-blue-600">{data.transit.toLocaleString()}</span>
                  </div>
                  <div className="flex justify-between text-[10px] font-bold">
                    <span className="text-stone-400">PROD :</span>
                    <span className="text-amber-600">{data.pending.toLocaleString()}</span>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>

        {/* 1. TABLEAUX DE DONNÉES */}
        <div className="space-y-8">
          {renderTable("Commandes en Transit", transitArticles, <Ship className="w-5 h-5 text-blue-500" />, 'blue')}
          {renderTable("Articles en Stock (Arrivés)", arrivedArticles, <CheckCircle2 className="w-5 h-5 text-emerald-500" />, 'emerald')}
          {renderTable("Rappels & Production", pendingArticles, <Clock className="w-5 h-5 text-amber-500" />, 'amber')}
        </div>

        {/* 2. ANALYSES ET GRAPHIQUES */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 pt-12 border-t border-stone-200">
          <Card className="border border-stone-200 shadow-sm bg-white rounded-2xl overflow-hidden">
            <CardHeader className="bg-stone-50/50 border-b border-stone-100">
              <CardTitle className="text-xs font-black uppercase tracking-widest flex items-center gap-2 text-stone-600">
                <BarChart3 className="w-4 h-4 text-amber-600" /> Flux d'achats mensuels
              </CardTitle>
            </CardHeader>
            <CardContent className="h-[250px] p-6">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={analysisData}>
                  <defs>
                    <linearGradient id="colorVal" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#d97706" stopOpacity={0.1}/>
                      <stop offset="95%" stopColor="#d97706" stopOpacity={0}/>
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f1f1" />
                  <XAxis dataKey="month" fontSize={10} fontWeight="bold" axisLine={false} tickLine={false} />
                  <YAxis fontSize={10} fontWeight="bold" axisLine={false} tickLine={false} />
                  <RechartsTooltip 
                    contentStyle={{borderRadius: '12px', border: 'none', boxShadow: '0 10px 15px -3px rgb(0 0 0 / 0.1)'}}
                  />
                  <Area type="monotone" dataKey="val" stroke="#d97706" strokeWidth={3} fillOpacity={1} fill="url(#colorVal)" />
                </AreaChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>

          <Card className="border border-stone-200 shadow-sm bg-white rounded-2xl overflow-hidden">
            <CardHeader className="bg-stone-50/50 border-b border-stone-100">
              <CardTitle className="text-xs font-black uppercase tracking-widest flex items-center gap-2 text-stone-600">
                <LineChartIcon className="w-4 h-4 text-blue-600" /> Évolution du prix d'achat (Moyen)
              </CardTitle>
            </CardHeader>
            <CardContent className="h-[250px] p-6">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={analysisData}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f1f1" />
                  <XAxis dataKey="month" fontSize={10} fontWeight="bold" axisLine={false} tickLine={false} />
                  <YAxis fontSize={10} fontWeight="bold" axisLine={false} tickLine={false} />
                  <RechartsTooltip 
                    contentStyle={{borderRadius: '12px', border: 'none', boxShadow: '0 10px 15px -3px rgb(0 0 0 / 0.1)'}}
                  />
                  <Line type="monotone" dataKey="pa" stroke="#2563eb" strokeWidth={3} dot={{r: 4, strokeWidth: 2, fill: '#fff'}} />
                </LineChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>
        </div>
      </div>
    );
  }

  // VUE LISTE DES CATÉGORIES
  return (
    <div className="space-y-8 fade-in">
      <div className="bg-white rounded-2xl shadow-sm border border-stone-200 p-8 flex flex-col md:flex-row justify-between items-center gap-6">
        <div className="space-y-1">
          <h1 className="text-3xl font-black text-stone-900 uppercase tracking-tighter">Sous-Catégories</h1>
          {selectedGeneralCategoryId ? (
            <div className="flex items-center gap-2">
              <LayoutGrid className="w-3 h-3 text-amber-600" />
              <span className="text-[10px] font-black uppercase tracking-widest text-stone-400">
                Filtre : {generalCategories.find(gc => gc.id === selectedGeneralCategoryId)?.name}
              </span>
            </div>
          ) : (
            <p className="text-stone-500 font-medium">Gestion et analyse par type de produit</p>
          )}
        </div>
        <Button onClick={() => setIsModalOpen(true)} className="bg-stone-900 hover:bg-black text-white font-bold h-12 px-8 rounded-xl shadow-lg transition-all hover:scale-105">
          <Plus className="w-5 h-5 mr-2" /> Nouveau type
        </Button>
      </div>
      
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {filteredCategoriesList.length === 0 ? (
          <div className="col-span-full py-24 text-center border-2 border-dashed border-stone-200 rounded-2xl bg-white/50">
            <Package className="w-16 h-16 text-stone-200 mx-auto mb-4" />
            <p className="text-stone-400 font-bold uppercase tracking-widest text-sm">Aucune donnée disponible</p>
          </div>
        ) : filteredCategoriesList.map(([name, stats], index) => {
          const colorClass = SUB_COLORS[index % SUB_COLORS.length];
          return (
            <Card 
              key={name} 
              onClick={() => setSelectedCategory(name)} 
              className={`cursor-pointer hover:shadow-xl hover:-translate-y-1 transition-all border-t-4 ${colorClass} group bg-white rounded-2xl overflow-hidden`}
            >
              <CardContent className="p-8">
                <div className="flex justify-between items-start mb-6">
                  <div className="space-y-1">
                    <div className="flex items-center gap-2 text-stone-400 mb-1">
                      <Box className="w-3 h-3" />
                      <span className="text-[10px] font-black uppercase tracking-widest">Type</span>
                    </div>
                    <h3 className="text-2xl font-black text-stone-800 group-hover:text-stone-900 transition-colors uppercase leading-tight">
                      {name}
                    </h3>
                  </div>
                  <div className="p-2 bg-stone-50 rounded-full group-hover:bg-stone-900 group-hover:text-white transition-all">
                    <ArrowRight className="w-4 h-4" />
                  </div>
                </div>
                
                <div className="space-y-6">
                  <div>
                    <p className="text-[10px] font-black text-stone-400 uppercase tracking-widest mb-1">Valeur Cumulée</p>
                    <p className="text-2xl font-black text-stone-900">{Math.round(stats.val).toLocaleString()} €</p>
                  </div>

                  <div className="pt-4 border-t border-stone-100 grid grid-cols-2 gap-2">
                    {Object.entries(stats.qtyByUnit).slice(0, 4).map(([unit, qty]) => (
                      <div key={unit} className="flex flex-col">
                        <span className="text-[9px] font-black text-stone-400 uppercase">{unit}</span>
                        <span className="text-sm font-black text-stone-700">{qty.toLocaleString()}</span>
                      </div>
                    ))}
                  </div>
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>

      <Dialog open={isModalOpen} onOpenChange={setIsModalOpen}>
        <DialogContent className="max-w-md rounded-2xl p-0 overflow-hidden border-none">
          <div className="bg-stone-900 p-6 text-white">
            <DialogTitle className="text-xl font-black uppercase tracking-tight">Nouvelle Sous-Catégorie</DialogTitle>
            <p className="text-stone-400 text-sm">Définissez un nouveau type de produit</p>
          </div>
          <div className="p-8 space-y-6 bg-white">
            <div className="space-y-4">
              <div className="space-y-2">
                <Label className="text-xs font-black text-stone-500 uppercase tracking-widest">Groupe Parent</Label>
                <Select value={targetGenCatId} onValueChange={setTargetGenCatId}>
                  <SelectTrigger className="h-12 border-stone-200 rounded-xl">
                    <SelectValue placeholder="Choisir un groupe..." />
                  </SelectTrigger>
                  <SelectContent>
                    {(generalCategories || []).map(gc => (
                      <SelectItem key={gc.id} value={gc.id}>{gc.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label className="text-xs font-black text-stone-500 uppercase tracking-widest">Nom du type</Label>
                <Input 
                  value={newCatName} 
                  onChange={e => setNewCatName(e.target.value.toUpperCase())} 
                  placeholder="EX: FERMETURES..." 
                  className="uppercase font-bold h-12 border-stone-200 focus:ring-amber-500 rounded-xl"
                />
              </div>
            </div>
            <div className="flex gap-3">
              <Button variant="outline" onClick={() => setIsModalOpen(false)} className="flex-1 h-12 rounded-xl border-stone-200 font-bold">Annuler</Button>
              <Button onClick={handleAddCategory} className="flex-1 h-12 rounded-xl bg-amber-600 hover:bg-amber-700 text-white font-bold">Créer</Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
