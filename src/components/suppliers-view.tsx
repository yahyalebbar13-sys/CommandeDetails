
"use client";

import React, { useState, useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Users, ChevronLeft, Package, Calendar, Clock, Ship } from 'lucide-react';
import { Badge } from '@/components/ui/badge';

interface SuppliersViewProps {
  articles: any[];
}

export default function SuppliersView({ articles }: SuppliersViewProps) {
  const [selectedSupplier, setSelectedSupplier] = useState<string | null>(null);

  const supplierStats = useMemo(() => {
    const stats: Record<string, { val: number; orders: number; categories: Set<string> }> = {};
    articles.forEach(o => {
      const sup = o.supplierId || 'Inconnu';
      if (!stats[sup]) stats[sup] = { val: 0, orders: 0, categories: new Set() };
      stats[sup].val += (o.quantity * o.purchasePricePerUnit);
      stats[sup].orders += 1;
      stats[sup].categories.add(o.categoryId || 'Inconnu');
    });
    return Object.entries(stats).sort((a, b) => b[1].val - a[1].val);
  }, [articles]);

  if (selectedSupplier) {
    const supArticles = articles.filter(o => o.supplierId === selectedSupplier);
    const now = new Date();
    const transit = supArticles.filter(o => new Date(o.arrivalDate) > now);
    const arrived = supArticles.filter(o => new Date(o.arrivalDate) <= now);
    
    const totalVal = supArticles.reduce((s, o) => s + (o.quantity * o.purchasePricePerUnit), 0);
    const totalQty = supArticles.reduce((s, o) => s + o.quantity, 0);
    const categoriesCount = new Set(supArticles.map(o => o.categoryId)).size;

    const futureArrivals = supArticles.map(o => new Date(o.arrivalDate).getTime()).filter(t => t > now.getTime());
    const nextArrivalDate = futureArrivals.length ? new Date(Math.min(...futureArrivals)).toISOString().split('T')[0] : 'Aucune';

    return (
      <div className="space-y-6 fade-in">
        <div className="bg-white rounded-xl shadow-sm border border-stone-100 p-6 flex flex-col md:flex-row justify-between items-start md:items-center gap-4 border-l-8 border-l-stone-800">
          <div>
            <Button variant="ghost" size="sm" onClick={() => setSelectedSupplier(null)} className="text-stone-500 hover:text-stone-800 mb-2 p-0 h-auto">
              <ChevronLeft className="w-4 h-4 mr-1" /> Retour aux fournisseurs
            </Button>
            <h2 className="text-3xl font-bold text-stone-900">{selectedSupplier}</h2>
          </div>
          <div className="text-right bg-stone-50 p-3 rounded-lg border border-stone-200">
            <div className="text-[10px] text-stone-500 uppercase tracking-wide font-bold">Volume Financier</div>
            <div className="text-2xl font-black text-amber-700">{Math.round(totalVal).toLocaleString()} €</div>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
          <StatCard label="Quantité Totale" value={totalQty.toLocaleString()} icon={<Package className="w-4 h-4 text-stone-400" />} />
          <StatCard label="Types Produits" value={categoriesCount} icon={<Ship className="w-4 h-4 text-stone-400" />} />
          <StatCard label="Prochaine Arrivée" value={nextArrivalDate} icon={<Clock className="w-4 h-4 text-blue-400" />} className="bg-blue-50/50" />
          <StatCard label="Nombre Commandes" value={supArticles.length} icon={<Calendar className="w-4 h-4 text-stone-400" />} />
        </div>

        <SupplierTableSection title="🚢 En Cours d'Import" data={transit} color="blue" count={transit.length} />
        <SupplierTableSection title="✅ Historique Arrivées" data={arrived} color="green" count={arrived.length} />
      </div>
    );
  }

  return (
    <div className="space-y-8 fade-in">
      <div className="bg-white p-6 rounded-xl shadow-sm border border-stone-100">
        <h2 className="text-2xl font-bold text-stone-800">Analyse Fournisseurs</h2>
        <p className="text-stone-600">Performance financière par partenaire commercial. Cliquez sur un nom pour voir les détails.</p>
      </div>
      
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
        {supplierStats.map(([name, stat]) => (
          <Card 
            key={name} 
            onClick={() => setSelectedSupplier(name)}
            className="cursor-pointer border-l-4 border-l-stone-800 shadow-sm hover:shadow-md hover:border-amber-300 transition-all group"
          >
            <CardHeader className="pb-2">
              <div className="flex justify-between items-start">
                <CardTitle className="text-xl font-bold group-hover:text-amber-600 transition-colors">{name}</CardTitle>
                <Users className="w-4 h-4 text-stone-300" />
              </div>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-black text-amber-700 mb-4">{Math.round(stat.val).toLocaleString()} €</div>
              <div className="space-y-1 text-sm text-stone-500">
                <div className="flex justify-between">
                  <span>Articles commandés:</span>
                  <span className="font-bold text-stone-700">{stat.orders}</span>
                </div>
                <div className="flex justify-between">
                  <span>Types de produits:</span>
                  <span className="font-bold text-stone-700">{stat.categories.size}</span>
                </div>
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

function SupplierTableSection({ title, data, color, count }: any) {
  const colorClasses = {
    blue: 'border-blue-100 bg-blue-50 text-blue-800',
    green: 'border-green-100 bg-green-50 text-green-800'
  } as const;

  return (
    <Card className={`overflow-hidden border-${color}-100 shadow-sm`}>
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
                <TableHead>Catégorie</TableHead>
                <TableHead>Article</TableHead>
                <TableHead>Facture</TableHead>
                <TableHead>Date Cmd</TableHead>
                <TableHead>Arrivée</TableHead>
                <TableHead className="text-right">Qté</TableHead>
                <TableHead className="text-right">CBM</TableHead>
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
                  <TableCell className="text-[10px] font-bold text-stone-500 uppercase tracking-tighter">{d.categoryId}</TableCell>
                  <TableCell className="font-bold">{d.name}</TableCell>
                  <TableCell className="font-bold text-stone-600 bg-stone-50/50">{d.factureId}</TableCell>
                  <TableCell className="text-xs font-medium text-stone-400">{d.orderDate}</TableCell>
                  <TableCell className={`font-bold ${color === 'blue' ? 'text-blue-600' : 'text-green-600'}`}>{d.arrivalDate}</TableCell>
                  <TableCell className="text-right font-bold">{d.quantity.toLocaleString()} {d.unitOfMeasure}</TableCell>
                  <TableCell className="text-right text-emerald-700 font-bold text-xs">{d.cubicMeasurement?.toFixed(2)}</TableCell>
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
