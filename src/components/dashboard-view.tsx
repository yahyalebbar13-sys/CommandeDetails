"use client";

import React, { useMemo } from 'react';
import { ViewType } from '@/lib/types';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { 
  XAxis, 
  YAxis, 
  CartesianGrid, 
  Tooltip as RechartsTooltip, 
  ResponsiveContainer, 
  PieChart, 
  Pie, 
  Cell,
  LineChart,
  Line
} from 'recharts';
import { Package, Banknote, Cuboid as Cube, FileText, CheckCircle2, Ship } from 'lucide-react';

interface DashboardViewProps {
  articles: any[];
  factures: any[];
  onNavigate: (tab: ViewType) => void;
}

export default function DashboardView({ articles, factures, onNavigate }: DashboardViewProps) {
  const stats = useMemo(() => {
    const now = new Date();
    let totalQty = 0, arrivedQty = 0;
    let totalVal = 0, arrivedVal = 0;
    let totalCbm = 0, arrivedCbm = 0;

    articles.forEach(o => {
      const val = o.quantity * o.purchasePricePerUnit;
      const arrival = new Date(o.arrivalDate);
      const isArrived = arrival <= now;

      totalQty += o.quantity;
      totalVal += val;
      totalCbm += o.cubicMeasurement;

      if (isArrived) {
        arrivedQty += o.quantity;
        arrivedVal += val;
        arrivedCbm += o.cubicMeasurement;
      }
    });

    // Add freight to total value
    factures.forEach(f => {
      const freight = f.freightCost || f.freight || 0;
      totalVal += freight;
      if (new Date(f.arrivalDate) <= now) {
        arrivedVal += freight;
      }
    });

    return {
      totalQty, arrivedQty, transitQty: totalQty - arrivedQty,
      totalVal, arrivedVal, transitVal: totalVal - arrivedVal,
      totalCbm, arrivedCbm, transitCbm: totalCbm - arrivedCbm,
      facturesCount: factures.length,
      arrivedFactures: factures.filter(f => new Date(f.arrivalDate) <= now).length,
      transitFactures: factures.filter(f => new Date(f.arrivalDate) > now).length
    };
  }, [articles, factures]);

  const categoryData = useMemo(() => {
    const data: Record<string, number> = {};
    articles.forEach(o => {
      const cat = o.categoryId || 'Inconnu';
      data[cat] = (data[cat] || 0) + (o.quantity * o.purchasePricePerUnit);
    });
    return Object.entries(data).map(([name, value]) => ({ name, value }));
  }, [articles]);

  const timelineData = useMemo(() => {
    const data: Record<string, number> = {};
    articles.forEach(o => {
      const month = o.orderDate?.substring(0, 7) || 'Inconnu';
      data[month] = (data[month] || 0) + (o.quantity * o.purchasePricePerUnit);
    });
    return Object.entries(data).sort().map(([name, value]) => ({ name, value }));
  }, [articles]);

  const COLORS = ['#d97706', '#78716c', '#a8a29e', '#fbbf24', '#44403c', '#d6d3d1'];

  return (
    <div className="space-y-8 fade-in">
      <div className="bg-white rounded-xl shadow-sm border border-stone-100 p-6">
        <h1 className="text-3xl font-bold text-stone-800 mb-2">Vue d'ensemble Générale</h1>
        <p className="text-stone-600">Consolidation de tous les imports (Tissus, Zips, Fils, Boutons...).</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        <KpiCard 
          label="Quantité Globale" 
          value={stats.totalQty} 
          arrived={stats.arrivedQty} 
          transit={stats.transitQty} 
          unit="Unités"
          icon={<Package className="w-5 h-5 text-stone-500" />}
        />
        <KpiCard 
          label="Valeur Totale + Fret" 
          value={stats.totalVal} 
          arrived={stats.arrivedVal} 
          transit={stats.transitVal} 
          unit="€" 
          colorClass="text-amber-600 border-b-4 border-b-amber-500"
          icon={<Banknote className="w-5 h-5 text-amber-500" />}
        />
        <KpiCard 
          label="Volume Physique (CBM)" 
          value={stats.totalCbm} 
          arrived={stats.arrivedCbm} 
          transit={stats.transitCbm} 
          unit="m³" 
          colorClass="border-l-4 border-l-emerald-500"
          icon={<Cube className="w-5 h-5 text-emerald-500" />}
        />
        <KpiCard 
          label="Conteneurs / Factures" 
          value={stats.facturesCount} 
          arrived={stats.arrivedFactures} 
          transit={stats.transitFactures} 
          unit="Doc" 
          onClick={() => onNavigate('factures')}
          className="cursor-pointer hover:bg-stone-50 transition-colors"
          icon={<FileText className="w-5 h-5 text-blue-500" />}
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        <Card>
          <CardHeader>
            <CardTitle>Chronologie des Commandes</CardTitle>
          </CardHeader>
          <CardContent className="h-[300px]">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={timelineData}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} />
                <XAxis dataKey="name" stroke="#888" fontSize={12} tickLine={false} axisLine={false} />
                <YAxis stroke="#888" fontSize={12} tickLine={false} axisLine={false} tickFormatter={(v) => `${v / 1000}k`} />
                <RechartsTooltip formatter={(v: any) => [`${Math.round(v).toLocaleString()} €`, 'Valeur']} />
                <Line type="monotone" dataKey="value" stroke="#d97706" strokeWidth={3} dot={{ r: 4, fill: '#d97706' }} activeDot={{ r: 6 }} />
              </LineChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Répartition par Catégorie</CardTitle>
          </CardHeader>
          <CardContent className="h-[300px]">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie data={categoryData} cx="50%" cy="50%" innerRadius={60} outerRadius={100} paddingAngle={5} dataKey="value">
                  {categoryData.map((_, index) => (
                    <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                  ))}
                </Pie>
                <RechartsTooltip formatter={(v: any) => [`${Math.round(v).toLocaleString()} €`, 'Valeur']} />
              </PieChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function KpiCard({ label, value, arrived, transit, unit, colorClass, className, icon, onClick }: any) {
  return (
    <Card className={`overflow-hidden ${colorClass} ${className}`} onClick={onClick}>
      <CardContent className="p-6">
        <div className="flex justify-between items-start mb-2">
          <h3 className="text-sm font-medium text-stone-500 uppercase tracking-wider">{label}</h3>
          {icon}
        </div>
        <div className="flex items-baseline gap-1 my-2">
          <span className={`text-3xl font-bold ${colorClass?.includes('text-') ? '' : 'text-stone-800'}`}>
            {typeof value === 'number' && value % 1 !== 0 ? value.toFixed(2) : value.toLocaleString()}
          </span>
          <span className="text-sm font-bold text-stone-400">{unit}</span>
        </div>
        <div className="flex justify-between pt-2 border-t border-stone-100 text-[10px] md:text-xs font-bold">
          <span className="text-green-600 flex items-center gap-1">
            <CheckCircle2 className="w-3 h-3" /> {Math.round(arrived).toLocaleString()}
          </span>
          <span className="text-blue-600 flex items-center gap-1">
            <Ship className="w-3 h-3" /> {Math.round(transit).toLocaleString()}
          </span>
        </div>
      </CardContent>
    </Card>
  );
}
