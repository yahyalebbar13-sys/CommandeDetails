"use client";

import React, { useState, useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { ChevronLeft, Package, User, Calendar, Clock } from 'lucide-react';
import { Badge } from '@/components/ui/badge';

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
    
    const supplierSpending: Record<string, number> = {};
    catArticles.forEach(o => {
      const sup = o.supplierId || 'Inconnu';
      supplierSpending[sup] = (supplierSpending[sup] || 0) + (o.quantity * o.purchasePricePerUnit);
    });
    const mainSupplier = Object.entries(supplierSpending).sort((a, b) => b[1] - a[1])[0]?.[0] || '-';
    
    const totalVal = catArticles.reduce((s, o) => s + (o.quantity * o.purchasePricePerUnit), 0);
    const totalQty = catArticles.reduce((s, o) => s + o.quantity, 0);

    const orderDates = catArticles.map(o => new Date(o.orderDate).getTime()).filter(t => !isNaN(t));
    const latestOrderDate = orderDates.length ? new Date(Math.max(...orderDates)).toISOString().split('T')[0] : '-';
    
    const futureArrivals = catArticles.map(o => new Date(o.arrivalDate).getTime()).filter(t => t > now.getTime());
    const nextArrivalDate = futureArrivals.length ? new Date(Math.min(...futureArrivals)).toISOString().split('T')[0] : 'Aucune';

    return (
      <div className="space-y-6 fade-in">
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
          <StatCard label="Frns. Principal" value={mainSupplier} icon={<User className="w-4 h-4 text-stone-400" />} />
          <StatCard label="Dernière Commande" value={latestOrderDate} icon={<Calendar className="w-4 h-4 text-stone-400" />} />
          <StatCard label="Prochaine Arrivée" value={nextArrivalDate} icon={<Clock className="w-4 h-4 text-blue-400" />} className="bg-blue-50/50" />
        </div>

        <CategoryTableSection title="🚢 Commandes en Transit" data={transit} color="blue" count={transit.length} />
        <CategoryTableSection title="✅ Commandes Arrivées" data={arrived} color="green" count={arrived.length} />
      </div>
    );
  }

  return (
    <div className="space-y-6 fade-in">
      <div className="bg-white rounded-xl shadow-sm border border-stone-100 p-6">
        <h1 className="text-3xl font-bold text-stone-800 mb-2">Catalogue des Catégories</h1>
        <p className="text-stone-600">Sélectionnez une catégorie ci-dessous pour ouvrir sa page dédiée.</p>
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
                <TableHead>Couleur</TableHead>
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
                  <TableCell colSpan={9} className="text-center text-stone-400 italic py-8">Aucune commande</TableCell>
                </TableRow>
              ) : data.map((d: any, i: number) => (
                <TableRow key={i} className="hover:bg-stone-50 transition-colors">
                  <TableCell className="font-bold">{d.name}</TableCell>
                  <TableCell className="text-xs">{d.color}</TableCell>
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
