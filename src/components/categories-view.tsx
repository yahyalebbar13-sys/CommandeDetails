
"use client";

import React, { useMemo, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { ChevronLeft, Plus, TrendingUp, Cuboid, Calendar, Package } from 'lucide-react';
import { useUser, useFirestore, setDocumentNonBlocking } from '@/firebase';
import { doc } from 'firebase/firestore';
import { useToast } from '@/hooks/use-toast';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { ResponsiveContainer, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip as RechartsTooltip, BarChart, Bar } from 'recharts';
import { Badge } from '@/components/ui/badge';

interface CategoriesViewProps {
  articles: any[];
  factures: any[];
  generalCategories: any[];
  selectedCategory: string | null;
  setSelectedCategory: (category: string | null) => void;
  selectedGeneralCategoryId?: string | null;
}

export default function CategoriesView({ articles, factures, generalCategories, selectedCategory, setSelectedCategory, selectedGeneralCategoryId }: CategoriesViewProps) {
  const { user } = useUser();
  const firestore = useFirestore();
  const { toast } = useToast();
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [newCatName, setNewCatName] = useState('');
  const [targetGenCatId, setTargetGenCatId] = useState(selectedGeneralCategoryId || '');

  // Filtrage et agrégation pour la vue liste des types de produits
  const filteredCategoriesList = useMemo(() => {
    const data: Record<string, { qtyByUnit: Record<string, number>; val: number; count: number; cbm: number; genCatId: string }> = {};
    
    (articles || []).forEach(o => {
      // Si un filtre de catégorie générale est actif, on ignore les articles qui n'en font pas partie
      if (selectedGeneralCategoryId && o.generalCategoryId !== selectedGeneralCategoryId) return;

      const cat = o.categoryId || 'Inconnu';
      if (!data[cat]) {
        data[cat] = { qtyByUnit: {}, val: 0, count: 0, cbm: 0, genCatId: o.generalCategoryId || '' };
      }
      
      const unit = o.unitOfMeasure || 'pcs';
      data[cat].qtyByUnit[unit] = (data[cat].qtyByUnit[unit] || 0) + (o.quantity || 0);
      data[cat].val += ((o.quantity || 0) * (o.purchasePricePerUnit || 0));
      data[cat].cbm += (o.cubicMeasurement || 0);
      data[cat].count += 1;
    });

    return Object.entries(data).sort((a, b) => a[0].localeCompare(b[0]));
  }, [articles, selectedGeneralCategoryId]);

  const handleAddCategory = () => {
    if (!user || !firestore || !newCatName.trim() || !targetGenCatId) return;
    const id = crypto.randomUUID();
    const docRef = doc(firestore, 'users', user.uid, 'categories', id);
    setDocumentNonBlocking(docRef, { id, name: newCatName.trim().toUpperCase(), generalCategoryId: targetGenCatId }, { merge: true });
    toast({ title: "Sous-catégorie créée" });
    setIsModalOpen(false);
    setNewCatName('');
  };

  // VUE DÉTAILLÉE D'UNE SOUS-CATÉGORIE
  if (selectedCategory) {
    const catArticles = articles
      .filter(o => o.categoryId === selectedCategory && (!selectedGeneralCategoryId || o.generalCategoryId === selectedGeneralCategoryId))
      .sort((a, b) => new Date(a.orderDate).getTime() - new Date(b.orderDate).getTime());

    const stats = {
      val: catArticles.reduce((s, o) => s + (o.quantity * o.purchasePricePerUnit), 0),
      qtyByUnit: catArticles.reduce((acc: Record<string, number>, o) => {
        const u = o.unitOfMeasure || 'pcs';
        acc[u] = (acc[u] || 0) + o.quantity;
        return acc;
      }, {}),
      cbm: catArticles.reduce((s, o) => s + (o.cubicMeasurement || 0), 0)
    };

    const chartData = catArticles.map(o => ({
      date: o.orderDate,
      pa: o.purchasePricePerUnit,
      cbm: o.cubicMeasurement || 0,
      name: o.name
    }));

    return (
      <div className="space-y-6 fade-in">
        <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
          <div>
            <Button variant="ghost" onClick={() => setSelectedCategory(null)} className="mb-2 p-0 h-auto hover:bg-transparent text-stone-500">
              <ChevronLeft className="mr-1 w-4 h-4" /> Retour aux sous-catégories
            </Button>
            <h2 className="text-3xl font-black text-stone-800 uppercase tracking-tight">{selectedCategory}</h2>
          </div>
          <div className="flex flex-wrap gap-4 justify-end">
            <div className="bg-white p-4 rounded-xl shadow-sm border border-stone-100">
              <div className="text-[10px] text-stone-500 font-bold uppercase mb-1">Volume Total</div>
              <div className="text-xl font-black text-emerald-600">{stats.cbm.toFixed(2)} m³</div>
            </div>
            <div className="bg-white p-4 rounded-xl shadow-sm border border-stone-100">
              <div className="text-[10px] text-stone-500 font-bold uppercase mb-1">Valeur Totale</div>
              <div className="text-xl font-black text-amber-700">{Math.round(stats.val).toLocaleString()} €</div>
            </div>
          </div>
        </div>

        {/* SOMME DES QUANTITÉS PAR UNITÉ */}
        <div className="flex flex-wrap gap-2">
          {Object.entries(stats.qtyByUnit).map(([unit, qty]) => (
            <Badge key={unit} variant="secondary" className="px-3 py-1 text-sm bg-stone-100 text-stone-700 border-stone-200">
              <Package className="w-3 h-3 mr-1" /> {qty.toLocaleString()} {unit}
            </Badge>
          ))}
        </div>

        {/* 1. TABLEAU DES ARTICLES (AVANT LES GRAPHIQUES) */}
        <Card>
          <CardHeader className="bg-stone-50/50 border-b">
            <CardTitle className="text-sm font-bold">Historique des commandes pour {selectedCategory}</CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <Table>
              <TableHeader className="bg-stone-50">
                <TableRow>
                  <TableHead>Article</TableHead>
                  <TableHead><Calendar className="w-3 h-3 inline mr-1" /> Date</TableHead>
                  <TableHead className="text-right">Quantité</TableHead>
                  <TableHead className="text-right">PA (€)</TableHead>
                  <TableHead className="text-right">Volume (CBM)</TableHead>
                  <TableHead className="text-right">Total Valeur</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {catArticles.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={6} className="text-center py-10 text-stone-400 italic">Aucun article trouvé</TableCell>
                  </TableRow>
                ) : catArticles.map(o => (
                  <TableRow key={o.id}>
                    <TableCell className="font-bold">{o.name}</TableCell>
                    <TableCell className="text-stone-500 text-xs">{o.orderDate}</TableCell>
                    <TableCell className="text-right font-medium">
                      {o.quantity.toLocaleString()} <span className="text-[10px] text-stone-400">{o.unitOfMeasure}</span>
                    </TableCell>
                    <TableCell className="text-right text-amber-700 font-bold">{o.purchasePricePerUnit.toFixed(4)}</TableCell>
                    <TableCell className="text-right text-emerald-600 font-bold">{o.cubicMeasurement?.toFixed(2)}</TableCell>
                    <TableCell className="text-right font-black">{(o.quantity * o.purchasePricePerUnit).toLocaleString()} €</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>

        {/* 2. GRAPHIQUES D'ÉTUDE (APRÈS LE TABLEAU) */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <Card>
            <CardHeader><CardTitle className="text-sm font-bold flex items-center gap-2"><TrendingUp className="w-4 h-4" /> Évolution du Prix d'Achat (PA)</CardTitle></CardHeader>
            <CardContent className="h-[300px]">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={chartData}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f0f0f0" />
                  <XAxis dataKey="date" fontSize={10} tickLine={false} axisLine={false} />
                  <YAxis fontSize={10} tickLine={false} axisLine={false} />
                  <RechartsTooltip formatter={(v: any) => [`${Number(v).toFixed(4)} €`, 'Prix d\'achat']} />
                  <Line type="monotone" dataKey="pa" stroke="#d97706" strokeWidth={3} dot={{ r: 4, fill: '#d97706' }} activeDot={{ r: 6 }} />
                </LineChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>

          <Card>
            <CardHeader><CardTitle className="text-sm font-bold flex items-center gap-2"><Cuboid className="w-4 h-4" /> Répartition du Volume (CBM)</CardTitle></CardHeader>
            <CardContent className="h-[300px]">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={chartData}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f0f0f0" />
                  <XAxis dataKey="date" fontSize={10} tickLine={false} axisLine={false} />
                  <YAxis fontSize={10} tickLine={false} axisLine={false} />
                  <RechartsTooltip formatter={(v: any) => [`${Number(v).toFixed(2)} m³`, 'Volume']} />
                  <Bar dataKey="cbm" fill="#059669" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>
        </div>
      </div>
    );
  }

  // VUE LISTE DES SOUS-CATÉGORIES
  return (
    <div className="space-y-6 fade-in">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-2xl font-bold text-stone-800">Sous-Catégories de Produits</h1>
          {selectedGeneralCategoryId && (
            <p className="text-stone-500 text-sm">Famille : <span className="font-bold text-amber-600">{generalCategories.find(gc => gc.id === selectedGeneralCategoryId)?.name || 'Inconnue'}</span></p>
          )}
        </div>
        <Button onClick={() => setIsModalOpen(true)} className="bg-amber-600 hover:bg-amber-700 text-white font-bold"><Plus className="mr-2 w-4 h-4" /> Nouveau Type</Button>
      </div>
      
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
        {filteredCategoriesList.length === 0 ? (
          <div className="col-span-full py-20 text-center border-2 border-dashed border-stone-200 rounded-xl text-stone-400">
            Aucun type de produit trouvé pour cette sélection.
          </div>
        ) : filteredCategoriesList.map(([name, stats]) => (
          <Card key={name} onClick={() => setSelectedCategory(name)} className="cursor-pointer hover:shadow-md transition-all group border-l-4 border-l-amber-600">
            <CardContent className="p-6">
              <h3 className="text-lg font-black mb-4 group-hover:text-amber-600 transition-colors uppercase truncate">{name}</h3>
              
              <div className="space-y-2">
                <div className="flex justify-between items-center text-[10px] text-stone-500 uppercase font-bold border-b border-stone-50 pb-1">
                  <span>Volume</span>
                  <span>Valeur</span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-sm font-bold text-emerald-700">{stats.cbm.toFixed(2)} m³</span>
                  <span className="text-sm font-bold text-amber-700">{Math.round(stats.val).toLocaleString()} €</span>
                </div>
              </div>

              <div className="mt-4 pt-4 border-t border-stone-100">
                <div className="text-[10px] text-stone-400 font-bold uppercase mb-1">Quantités par unité</div>
                <div className="flex flex-wrap gap-1">
                  {Object.entries(stats.qtyByUnit).slice(0, 3).map(([unit, qty]) => (
                    <span key={unit} className="text-[10px] bg-stone-100 px-1.5 py-0.5 rounded text-stone-600">
                      {qty.toLocaleString()} {unit}
                    </span>
                  ))}
                  {Object.keys(stats.qtyByUnit).length > 3 && <span className="text-[10px] text-stone-400">...</span>}
                </div>
              </div>

              <div className="mt-4 flex justify-between items-center text-xs">
                <span className="text-stone-400">{stats.count} Articles</span>
                <span className="text-amber-600 font-bold group-hover:translate-x-1 transition-transform">Détails →</span>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      <Dialog open={isModalOpen} onOpenChange={setIsModalOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>Nouveau Type de Produit</DialogTitle></DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-1">
              <label className="text-sm font-bold">Famille Générale (Parent)</label>
              <Select value={targetGenCatId} onValueChange={setTargetGenCatId}>
                <SelectTrigger className="bg-white"><SelectValue placeholder="Choisir le groupe..." /></SelectTrigger>
                <SelectContent>
                  {(generalCategories || []).map(gc => (
                    <SelectItem key={gc.id} value={gc.id}>{gc.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <label className="text-sm font-bold">Nom du Type (ex: ZIP NO5)</label>
              <Input value={newCatName} onChange={e => setNewCatName(e.target.value.toUpperCase())} placeholder="Nom..." className="uppercase" />
            </div>
          </div>
          <DialogFooter><Button onClick={handleAddCategory} className="bg-amber-600 text-white font-bold">Créer</Button></DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
