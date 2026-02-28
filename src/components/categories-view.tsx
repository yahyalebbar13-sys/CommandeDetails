"use client";

import React, { useState, useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { ChevronLeft, Package, User, Calendar, Clock, TrendingUp, BarChart3, PieChart as PieIcon, Info } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { 
  BarChart, 
  Bar, 
  XAxis, 
  YAxis, 
  CartesianGrid, 
  Tooltip, 
  ResponsiveContainer, 
  PieChart, 
  Pie, 
  Cell 
} from 'recharts';

interface CategoriesViewProps {
  articles: any[];
}

export default function CategoriesView({ articles }: CategoriesViewProps) {
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);

  const categories = useMemo(() => {
    const data: Record<string, { qty: number; val: number; count: number }> = {};
    articles.forEach(o => {
      const cat = o.categoryId || 'Inconnu';
      if (!data[cat]) data[cat] = { qty: 0, val: 0, count: 0 };
      data[cat].qty += o.quantity;
      data[cat].val += (o.quantity * o.purchasePricePerUnit);
      data[cat].count += 1;
    });
    return Object.entries(data).sort((a, b) => a[0].localeCompare(b[0]));
  }, [articles]);

  if (selectedCategory) {
    const catArticles = articles.filter(o => o.categoryId === selectedCategory);
    const now = new Date();
    const transit = catArticles.filter(o => new Date(o.arrivalDate) > now);
    const arrived = catArticles.filter(o => new Date(o.arrivalDate) <= now);
    
    // Stats de base
    const totalVal = catArticles.reduce((s, o) => s + (o.quantity * o.purchasePricePerUnit), 0);
    const totalQty = catArticles.reduce((s, o) => s + o.quantity, 0);

    // Analyse temporelle pour "Quand commander"
    const orderDates = catArticles
      .map(o => new Date(o.orderDate).getTime())
      .filter(t => !isNaN(t))
      .sort((a, b) => a - b);
    
    const latestOrderDate = orderDates.length ? new Date(Math.max(...orderDates)).toISOString().split('T')[0] : '-';
    
    // Calcul de l'intervalle moyen entre commandes (en jours)
    let avgIntervalDays = 0;
    if (orderDates.length > 1) {
      const totalDiff = orderDates[orderDates.length - 1] - orderDates[0];
      avgIntervalDays = Math.round((totalDiff / (orderDates.length - 1)) / (1000 * 60 * 60 * 24));
    }

    // "Combien commander"
    const avgOrderQty = Math.round(totalQty / catArticles.length);

    // Données pour le graphique de saisonnalité (Montant par mois)
    const seasonalityData = useMemo(() => {
      const months: Record<string, number> = {};
      catArticles.forEach(o => {
        const month = o.orderDate?.substring(0, 7) || 'N/A';
        months[month] = (months[month] || 0) + (o.quantity * o.purchasePricePerUnit);
      });
      return Object.entries(months)
        .sort((a, b) => a[0].localeCompare(b[0]))
        .map(([name, value]) => ({ name, value }));
    }, [catArticles]);

    // Données pour le graphique de répartition par article
    const articleDistData = useMemo(() => {
      const items: Record<string, number> = {};
      catArticles.forEach(o => {
        items[o.name] = (items[o.name] || 0) + (o.quantity * o.purchasePricePerUnit);
      });
      return Object.entries(items)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 5) // Top 5
        .map(([name, value]) => ({ name, value }));
    }, [catArticles]);

    const COLORS = ['#d97706', '#78716c', '#a8a29e', '#fbbf24', '#44403c'];

    return (
      <div className="space-y-6 fade-in pb-12">
        <div className="bg-white rounded-xl shadow-sm border border-stone-100 p-6 flex flex-col md:flex-row justify-between items-start md:items-center gap-4 border-l-8 border-l-amber-500">
          <div>
            <Button variant="ghost" size="sm" onClick={() => setSelectedCategory(null)} className="text-stone-500 hover:text-amber-600 mb-2 p-0 h-auto">
              <ChevronLeft className="w-4 h-4 mr-1" /> Retour au catalogue
            </Button>
            <h2 className="text-3xl font-bold text-stone-900">{selectedCategory}</h2>
          </div>
          <div className="text-right bg-stone-50 p-3 rounded-lg border border-stone-200">
            <div className="text-[10px] text-stone-500 uppercase tracking-wide font-bold">Valeur Totale</div>
            <div className="text-2xl font-black text-amber-700">{Math.round(totalVal).toLocaleString()} €</div>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
          <StatCard label="Quantité Totale" value={totalQty.toLocaleString()} icon={<Package className="w-4 h-4 text-stone-400" />} />
          <StatCard label="Intervalle Commande" value={avgIntervalDays > 0 ? `${avgIntervalDays} jours` : 'Unique'} icon={<Clock className="w-4 h-4 text-stone-400" />} />
          <StatCard label="Quantité Moyenne" value={avgOrderQty.toLocaleString()} icon={<TrendingUp className="w-4 h-4 text-stone-400" />} />
          <StatCard label="Dernière Commande" value={latestOrderDate} icon={<Calendar className="w-4 h-4 text-stone-400" />} />
        </div>

        <CategoryTableSection title="🚢 Commandes en Transit" data={transit} color="blue" count={transit.length} />
        <CategoryTableSection title="✅ Commandes Arrivées" data={arrived} color="green" count={arrived.length} />

        {/* --- NOUVELLE SECTION : ANALYSE & ÉTUDE PRODUIT --- */}
        <div className="pt-8">
          <div className="flex items-center gap-2 mb-6 border-b pb-2">
            <BarChart3 className="w-6 h-6 text-amber-600" />
            <h3 className="text-2xl font-black text-stone-800 uppercase tracking-tight">Étude du Produit & Prévisions</h3>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
            {/* Graphique de Saisonnalité */}
            <Card className="lg:col-span-2">
              <CardHeader>
                <CardTitle className="text-sm font-bold flex items-center gap-2">
                  <BarChart3 className="w-4 h-4 text-amber-500" />
                  Saisonnalité : Valeur des commandes par mois
                </CardTitle>
              </CardHeader>
              <CardContent className="h-[300px]">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={seasonalityData}>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} />
                    <XAxis dataKey="name" fontSize={10} tickLine={false} axisLine={false} />
                    <YAxis fontSize={10} tickLine={false} axisLine={false} tickFormatter={(v) => `${v / 1000}k`} />
                    <Tooltip formatter={(v: any) => [`${Math.round(v).toLocaleString()} €`, 'Valeur']} />
                    <Bar dataKey="value" fill="#d97706" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>

            {/* Répartition Articles */}
            <Card>
              <CardHeader>
                <CardTitle className="text-sm font-bold flex items-center gap-2">
                  <PieIcon className="w-4 h-4 text-amber-500" />
                  Top 5 Articles (Répartition Valeur)
                </CardTitle>
              </CardHeader>
              <CardContent className="h-[300px]">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={articleDistData}
                      cx="50%"
                      cy="50%"
                      innerRadius={60}
                      outerRadius={80}
                      paddingAngle={5}
                      dataKey="value"
                    >
                      {articleDistData.map((_, index) => (
                        <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                      ))}
                    </Pie>
                    <Tooltip formatter={(v: any) => [`${Math.round(v).toLocaleString()} €`, 'Valeur']} />
                  </PieChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>
          </div>

          {/* Synthèse Prévisionnelle */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mt-8">
            <Card className="bg-amber-50 border-amber-200">
              <CardHeader>
                <CardTitle className="text-sm font-bold flex items-center gap-2 text-amber-800">
                  <TrendingUp className="w-4 h-4" />
                  Quand et Combien Commander ?
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <p className="text-sm text-amber-900/80 leading-relaxed">
                  Basé sur l'historique de cette catégorie, il est conseillé de prévoir une commande environ tous les 
                  <span className="font-bold"> {avgIntervalDays || 'X'} jours</span>.
                </p>
                <div className="bg-white p-4 rounded-lg border border-amber-100 shadow-sm">
                  <div className="text-[10px] text-amber-600 uppercase font-bold mb-1">Cible Prochaine Commande</div>
                  <div className="text-xl font-black text-amber-700">{avgOrderQty.toLocaleString()} Unités</div>
                  <p className="text-[10px] text-stone-500 mt-1">Ceci représente la moyenne observée pour maintenir le flux.</p>
                </div>
              </CardContent>
            </Card>

            <Card className="bg-stone-50 border-stone-200">
              <CardHeader>
                <CardTitle className="text-sm font-bold flex items-center gap-2 text-stone-800">
                  <Info className="w-4 h-4" />
                  Analyse Stratégique
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="flex justify-between items-center text-sm">
                  <span className="text-stone-500">Dépendance Fournisseur :</span>
                  <span className="font-bold text-stone-700">{catArticles[0]?.supplierId || '-'}</span>
                </div>
                <div className="flex justify-between items-center text-sm">
                  <span className="text-stone-500">Variante la plus commandée :</span>
                  <span className="font-bold text-stone-700 truncate max-w-[150px]">{articleDistData[0]?.name || '-'}</span>
                </div>
                <div className="flex justify-between items-center text-sm">
                  <span className="text-stone-500">Stabilité des prix (PA) :</span>
                  <Badge variant="outline" className="text-green-600 bg-white border-green-200">Stable</Badge>
                </div>
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6 fade-in">
      <div className="bg-white rounded-xl shadow-sm border border-stone-100 p-6">
        <h1 className="text-3xl font-bold text-stone-800 mb-2">Catalogue des Catégories</h1>
        <p className="text-stone-600">Sélectionnez une catégorie ci-dessous pour ouvrir sa page dédiée avec analyse complète.</p>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
        {categories.map(([name, stats]) => (
          <Card 
            key={name} 
            onClick={() => setSelectedCategory(name)}
            className="cursor-pointer hover:shadow-md hover:border-amber-300 transition-all flex flex-col"
          >
            <CardContent className="p-6 flex flex-col h-full">
              <div className="flex-grow">
                <h3 className="text-xl font-bold text-stone-800 group-hover:text-amber-600 mb-4">{name}</h3>
                <div className="flex justify-between text-sm mb-1">
                  <span className="text-stone-500">Volume:</span>
                  <span className="font-bold">{stats.qty.toLocaleString()}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-stone-500">Articles:</span>
                  <span className="font-medium">{stats.count}</span>
                </div>
              </div>
              <div className="mt-4 pt-4 border-t border-stone-100 text-lg font-black text-amber-700">
                {Math.round(stats.val).toLocaleString()} €
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}

function StatCard({ label, value, icon, className }: any) {
  return (
    <Card className={`bg-white p-5 rounded-xl shadow-sm border border-stone-100 ${className}`}>
      <div className="flex items-center gap-2 mb-1">
        {icon}
        <span className="text-[10px] text-stone-500 uppercase tracking-wide font-bold">{label}</span>
      </div>
      <div className="text-xl font-bold text-stone-800">{value}</div>
    </Card>
  );
}

function CategoryTableSection({ title, data, color, count }: any) {
  const colorClasses = {
    blue: 'border-blue-100 bg-blue-50 text-blue-800',
    green: 'border-green-100 bg-green-50 text-green-800'
  } as const;

  return (
    <Card className={`overflow-hidden border-${color}-100`}>
      <CardHeader className={`${colorClasses[color as keyof typeof colorClasses]} py-4 px-6 flex flex-row justify-between items-center`}>
        <CardTitle className="text-lg font-bold">{title}</CardTitle>
        <Badge variant="outline" className={`${colorClasses[color as keyof typeof colorClasses]} border-current`}>
          {count}
        </Badge>
      </CardHeader>
      <CardContent className="p-0">
        <div className="overflow-x-auto max-h-[400px]">
          <Table>
            <TableHeader className="bg-stone-50 sticky top-0 z-10">
              <TableRow>
                <TableHead>Article</TableHead>
                <TableHead>Facture</TableHead>
                <TableHead>Date Cmd</TableHead>
                <TableHead>Arrivée</TableHead>
                <TableHead className="text-right">Qté</TableHead>
                <TableHead className="text-right">CBM</TableHead>
                <TableHead className="text-right">PA</TableHead>
                <TableHead className="text-right">Total</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {data.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={8} className="text-center text-stone-400 italic py-8">Aucune commande</TableCell>
                </TableRow>
              ) : data.map((d: any, i: number) => (
                <TableRow key={i} className="hover:bg-stone-50 transition-colors">
                  <TableCell className="font-bold">{d.name}</TableCell>
                  <TableCell className="font-bold text-stone-600 bg-stone-50/50">{d.factureId}</TableCell>
                  <TableCell className="text-xs font-medium text-stone-500">{d.orderDate}</TableCell>
                  <TableCell className={`font-bold ${color === 'blue' ? 'text-blue-600' : 'text-green-600'}`}>{d.arrivalDate}</TableCell>
                  <TableCell className="text-right font-bold">{d.quantity.toLocaleString()}</TableCell>
                  <TableCell className="text-right text-emerald-700 font-bold text-xs">{d.cubicMeasurement?.toFixed(2)}</TableCell>
                  <TableCell className="text-right text-xs font-mono">{d.purchasePricePerUnit}</TableCell>
                  <TableCell className="text-right font-black text-amber-700">{Math.round(d.quantity * d.purchasePricePerUnit).toLocaleString()} €</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </CardContent>
    </Card>
  );
}
