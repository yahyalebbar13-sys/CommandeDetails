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
  Box
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

    return Object.entries(data).sort((a, b) => a[0].localeCompare(b[0]));
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
    const monthly: Record<string, { val: number; pa: number; count: number }> = {};
    
    catArticles.forEach(o => {
      const month = o.orderDate?.substring(0, 7);
      if (month) {
        if (!monthly[month]) monthly[month] = { val: 0, pa: 0, count: 0 };
        monthly[month].val += (Number(o.quantity) * Number(o.purchasePricePerUnit));
        monthly[month].pa += Number(o.purchasePricePerUnit);
        monthly[month].count += 1;
      }
    });

    return Object.entries(monthly).sort().map(([month, data]) => ({
      month,
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

    return (
      <div className="space-y-3">
        <div className="flex items-center gap-2">
          {icon}
          <h3 className="text-sm font-bold uppercase tracking-wider text-stone-700">{title}</h3>
          <Badge variant="secondary" className="ml-2 font-bold">{data.length}</Badge>
        </div>
        <div className="bg-white border border-stone-200 rounded-lg shadow-sm overflow-hidden">
          <Table>
            <TableHeader className="bg-stone-50">
              <TableRow>
                <TableHead className="text-[11px] font-bold uppercase">Article</TableHead>
                <TableHead className="text-[11px] font-bold uppercase">Specs / Couleur</TableHead>
                <TableHead className="text-[11px] font-bold uppercase text-center">Facture</TableHead>
                <TableHead className="text-[11px] font-bold uppercase">Dates</TableHead>
                <TableHead className="text-right text-[11px] font-bold uppercase">Quantité</TableHead>
                <TableHead className="text-right text-[11px] font-bold uppercase">Valeur</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {data.map(o => (
                <TableRow key={o.id} className="hover:bg-stone-50/50">
                  <TableCell className="py-3">
                    <div className="font-bold text-stone-900">{o.name}</div>
                    <div className="text-[10px] text-stone-400 font-medium uppercase">{o.supplierId || 'N/A'}</div>
                  </TableCell>
                  <TableCell>
                    <div className="text-xs text-stone-600">{o.specs || '-'}</div>
                    <div className="text-[10px] text-stone-400 font-medium uppercase">{o.color || '-'}</div>
                  </TableCell>
                  <TableCell className="text-center">
                    {o.factureId ? (
                      <Badge variant="outline" className="font-mono text-[10px] bg-stone-50 text-stone-600 border-stone-200">
                        {o.factureId}
                      </Badge>
                    ) : (
                      <span className="text-stone-300">—</span>
                    )}
                  </TableCell>
                  <TableCell>
                    <div className="text-[10px] font-medium text-stone-500">Cmd: {o.orderDate}</div>
                    {o.arrivalDate && <div className={`text-[10px] font-bold ${variant === 'blue' ? 'text-blue-600' : 'text-emerald-600'}`}>Arr: {o.arrivalDate}</div>}
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="font-bold text-stone-900">{o.quantity.toLocaleString()}</div>
                    <div className="text-[10px] text-stone-400 font-bold uppercase">{o.unitOfMeasure}</div>
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="font-bold text-stone-900">{Math.round(o.quantity * o.purchasePricePerUnit).toLocaleString()} €</div>
                    <div className="text-[10px] text-stone-400">@ {o.purchasePricePerUnit.toFixed(3)}</div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </div>
    );
  };

  // VUE DÉTAILLÉE D'UNE CATÉGORIE
  if (selectedCategory && stats) {
    return (
      <div className="space-y-8 fade-in">
        <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 border-b border-stone-200 pb-6">
          <div>
            <button 
              onClick={() => setSelectedCategory(null)} 
              className="flex items-center gap-1 text-stone-400 hover:text-stone-900 transition-all font-bold text-xs uppercase tracking-widest mb-2"
            >
              <ChevronLeft className="w-4 h-4" /> Retour
            </button>
            <h2 className="text-3xl font-black text-stone-900 uppercase tracking-tight">{selectedCategory}</h2>
          </div>
          
          <div className="flex flex-wrap gap-4">
            <div className="text-right">
              <p className="text-[10px] font-bold text-stone-400 uppercase">Valeur Totale</p>
              <p className="text-2xl font-black text-amber-600">{Math.round(stats.totalValue).toLocaleString()} €</p>
            </div>
            <div className="w-px h-10 bg-stone-200 hidden md:block"></div>
            <div className="text-right">
              <p className="text-[10px] font-bold text-stone-400 uppercase">Dernière commande</p>
              <p className="text-lg font-bold text-stone-700">{stats.lastOrder}</p>
            </div>
          </div>
        </div>

        {/* 1. TABLEAUX DE DONNÉES */}
        <div className="space-y-10">
          {renderTable("Commandes en Transit", transitArticles, <Ship className="w-5 h-5 text-blue-500" />, 'blue')}
          {renderTable("Articles en Stock (Arrivés)", arrivedArticles, <CheckCircle2 className="w-5 h-5 text-emerald-500" />, 'emerald')}
          {renderTable("Rappels & Production", pendingArticles, <Clock className="w-5 h-5 text-amber-500" />, 'amber')}
        </div>

        {/* 2. ANALYSES ET GRAPHIQUES */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 pt-6 border-t border-stone-200">
          <Card className="border border-stone-200 shadow-sm bg-white">
            <CardHeader className="border-b border-stone-100 bg-stone-50/50">
              <CardTitle className="text-xs font-bold uppercase tracking-widest flex items-center gap-2">
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
                  <XAxis dataKey="month" fontSize={10} axisLine={false} tickLine={false} />
                  <YAxis fontSize={10} axisLine={false} tickLine={false} />
                  <RechartsTooltip />
                  <Area type="monotone" dataKey="val" stroke="#d97706" fillOpacity={1} fill="url(#colorVal)" />
                </AreaChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>

          <Card className="border border-stone-200 shadow-sm bg-white">
            <CardHeader className="border-b border-stone-100 bg-stone-50/50">
              <CardTitle className="text-xs font-bold uppercase tracking-widest flex items-center gap-2">
                <LineChartIcon className="w-4 h-4 text-blue-600" /> Évolution du prix d'achat
              </CardTitle>
            </CardHeader>
            <CardContent className="h-[250px] p-6">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={analysisData}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f1f1" />
                  <XAxis dataKey="month" fontSize={10} axisLine={false} tickLine={false} />
                  <YAxis fontSize={10} axisLine={false} tickLine={false} />
                  <RechartsTooltip />
                  <Line type="monotone" dataKey="pa" stroke="#2563eb" strokeWidth={2} dot={{r: 4}} />
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
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-3xl font-black text-stone-900 uppercase tracking-tight">Sous-Catégories</h1>
          {selectedGeneralCategoryId && (
            <Badge variant="secondary" className="mt-2 font-bold bg-stone-100 text-stone-600">
              FILTRE : {generalCategories.find(gc => gc.id === selectedGeneralCategoryId)?.name}
            </Badge>
          )}
        </div>
        <Button onClick={() => setIsModalOpen(true)} className="bg-stone-900 hover:bg-black text-white font-bold h-11 px-6 rounded-lg shadow-sm transition-all">
          <Plus className="w-4 h-4 mr-2" /> Ajouter un type
        </Button>
      </div>
      
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {filteredCategoriesList.length === 0 ? (
          <div className="col-span-full py-20 text-center border-2 border-dashed border-stone-200 rounded-xl bg-white">
            <Package className="w-12 h-12 text-stone-300 mx-auto mb-4" />
            <p className="text-stone-400 font-medium italic">Aucune donnée disponible</p>
          </div>
        ) : filteredCategoriesList.map(([name, stats]) => (
          <Card 
            key={name} 
            onClick={() => setSelectedCategory(name)} 
            className="cursor-pointer hover:border-amber-500/50 hover:shadow-md transition-all border border-stone-200 shadow-sm rounded-xl group bg-white"
          >
            <CardContent className="p-6">
              <div className="flex justify-between items-start mb-6">
                <div className="flex items-center gap-2">
                  <div className="p-2 bg-stone-50 rounded-lg group-hover:bg-amber-50 transition-colors">
                    <Box className="w-5 h-5 text-stone-400 group-hover:text-amber-600" />
                  </div>
                  <h3 className="text-lg font-black text-stone-800 uppercase group-hover:text-amber-600 transition-colors leading-tight">
                    {name}
                  </h3>
                </div>
                <ArrowRight className="w-4 h-4 text-stone-300 group-hover:text-amber-600 group-hover:translate-x-1 transition-all" />
              </div>
              
              <div className="space-y-4">
                <div>
                  <p className="text-[10px] font-bold text-stone-400 uppercase tracking-wider mb-1">Valeur Cumulée</p>
                  <p className="text-xl font-black text-stone-900">{Math.round(stats.val).toLocaleString()} €</p>
                </div>

                <div className="pt-4 border-t border-stone-100">
                  <p className="text-[10px] font-bold text-stone-400 uppercase tracking-wider mb-2">Stocks par unité</p>
                  <div className="flex flex-wrap gap-2">
                    {Object.entries(stats.qtyByUnit).map(([unit, qty]) => (
                      <Badge key={unit} variant="outline" className="text-[10px] font-bold bg-white text-stone-600 border-stone-200">
                        {qty.toLocaleString()} {unit}
                      </Badge>
                    ))}
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      <Dialog open={isModalOpen} onOpenChange={setIsModalOpen}>
        <DialogContent className="sm:max-w-[425px]">
          <DialogHeader>
            <DialogTitle className="font-bold">Nouvelle Sous-Catégorie</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label>Groupe Parent</Label>
              <Select value={targetGenCatId} onValueChange={setTargetGenCatId}>
                <SelectTrigger className="bg-white">
                  <SelectValue placeholder="Sélectionner un groupe..." />
                </SelectTrigger>
                <SelectContent>
                  {(generalCategories || []).map(gc => (
                    <SelectItem key={gc.id} value={gc.id}>{gc.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Nom de la Sous-Catégorie</Label>
              <Input 
                value={newCatName} 
                onChange={e => setNewCatName(e.target.value.toUpperCase())} 
                placeholder="Ex: FERMETURES" 
                className="uppercase"
              />
            </div>
          </div>
          <DialogFooter>
            <Button onClick={handleAddCategory} className="w-full bg-stone-900 text-white font-bold h-11">Créer</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}