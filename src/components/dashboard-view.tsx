
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
  Line,
  Legend
} from 'recharts';
import { Package, Banknote, Cuboid as Cube, FileText, CheckCircle2, Ship, Factory, ListTodo } from 'lucide-react';

interface DashboardViewProps {
  articles: any[];
  factures: any[];
  onNavigate: (tab: ViewType) => void;
}

export default function DashboardView({ articles, factures, onNavigate }: DashboardViewProps) {
  const stats = useMemo(() => {
    const now = new Date();
    let totalQty = 0, arrivedQty = 0, transitQty = 0, pendingQty = 0, toOrderQty = 0;
    let totalVal = 0, arrivedVal = 0, transitVal = 0, pendingVal = 0;
    let totalCbm = 0, arrivedCbm = 0, transitCbm = 0, pendingCbm = 0;

    (articles || []).forEach(o => {
      const val = (o.quantity || 0) * (o.purchasePricePerUnit || 0);
      
      if (o.status === 'TO_ORDER') {
        toOrderQty += 1;
        return;
      }

      // Cas : Commande en Production (PI)
      if (o.status === 'PI' || !o.factureId) {
        pendingQty += (o.quantity || 0);
        pendingVal += val;
        pendingCbm += (o.cubicMeasurement || 0);
        return;
      }

      // Cas : Commande Expédiée (Facturée)
      const arrival = new Date(o.arrivalDate);
      const isArrived = arrival <= now;

      totalQty += (o.quantity || 0);
      totalVal += val;
      totalCbm += (o.cubicMeasurement || 0);

      if (isArrived) {
        arrivedQty += (o.quantity || 0);
        arrivedVal += val;
        arrivedCbm += (o.cubicMeasurement || 0);
      } else {
        transitQty += (o.quantity || 0);
        transitVal += val;
        transitCbm += (o.cubicMeasurement || 0);
      }
    });

    // Add freight to total value (only for factures)
    (factures || []).forEach(f => {
      const freight = f.freightCost || f.freight || 0;
      totalVal += freight;
      if (new Date(f.arrivalDate) <= now) {
        arrivedVal += freight;
      } else {
        transitVal += freight;
      }
    });

    return {
      totalQty, arrivedQty, transitQty, pendingQty, toOrderQty,
      totalVal, arrivedVal, transitVal, pendingVal,
      totalCbm, arrivedCbm, transitCbm, pendingCbm,
      facturesCount: (factures || []).length,
      arrivedFactures: (factures || []).filter(f => new Date(f.arrivalDate) <= now).length,
      transitFactures: (factures || []).filter(f => new Date(f.arrivalDate) > now).length
    };
  }, [articles, factures]);

  const categoryData = useMemo(() => {
    const data: Record<string, number> = {};
    (articles || []).forEach(o => {
      if (o.status === 'TO_ORDER') return;
      if (o.status === 'PI' || !o.factureId) return; 
      const cat = o.categoryId || 'Inconnu';
      data[cat] = (data[cat] || 0) + (o.quantity * o.purchasePricePerUnit);
    });
    return Object.entries(data).map(([name, value]) => ({ name, value }));
  }, [articles]);

  const timelineData = useMemo(() => {
    const data: Record<string, number> = {};
    (articles || []).forEach(o => {
      if (o.status === 'TO_ORDER') return;
      if (o.status === 'PI' || !o.factureId) return; 
      const month = o.orderDate?.substring(0, 7) || 'Inconnu';
      data[month] = (data[month] || 0) + (o.quantity * o.purchasePricePerUnit);
    });
    return Object.entries(data).sort().map(([name, value]) => ({ name, value }));
  }, [articles]);

  const COLORS = ['#d97706', '#78716c', '#a8a29e', '#fbbf24', '#44403c', '#d6d3d1'];

  return (
    <div className="space-y-8 fade-in">
      <div className="bg-white rounded-xl shadow-sm border border-stone-100 p-6 flex flex-col md:flex-row justify-between items-center gap-6">
        <div>
          <h1 className="text-3xl font-bold text-stone-800 mb-2">Tableau de Bord</h1>
          <p className="text-stone-600">Vue d'ensemble des flux d'importation.</p>
        </div>
        
        <div className="flex flex-col sm:flex-row gap-4 w-full md:w-auto">
          <div 
            onClick={() => onNavigate('to-order')}
            className="bg-stone-800 text-white px-6 py-4 rounded-xl cursor-pointer hover:bg-black transition-colors group flex-1"
          >
            <div className="text-[10px] font-black uppercase tracking-widest flex items-center gap-2">
              <ListTodo className="w-3 h-3" /> À Commander (Rappels)
            </div>
            <div className="text-2xl font-black">{stats.toOrderQty} <span className="text-sm font-bold opacity-70">Articles</span></div>
            <div className="text-xs font-bold text-stone-400 mt-1 flex items-center gap-1">
              Voir les besoins <ArrowRight className="w-3 h-3 group-hover:translate-x-1 transition-transform" />
            </div>
          </div>

          <div 
            onClick={() => onNavigate('pending')}
            className="bg-amber-100 text-amber-800 px-6 py-4 rounded-xl border border-amber-200 cursor-pointer hover:bg-amber-200 transition-colors group flex-1"
          >
            <div className="text-[10px] font-black uppercase tracking-widest flex items-center gap-2">
              <Factory className="w-3 h-3" /> En Production (PI)
            </div>
            <div className="text-2xl font-black">{stats.pendingQty.toLocaleString()} <span className="text-sm font-bold opacity-70">Unités</span></div>
            <div className="text-xs font-bold text-amber-700 mt-1 flex items-center gap-1">
              Gérer les expéditions <ArrowRight className="w-3 h-3 group-hover:translate-x-1 transition-transform" />
            </div>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        <KpiCard 
          label="Quantité Expédiée" 
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
            <CardTitle>Chronologie des Imports (Valeur)</CardTitle>
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
                <Pie 
                  data={categoryData} 
                  cx="50%" 
                  cy="50%" 
                  innerRadius={60} 
                  outerRadius={100} 
                  paddingAngle={5} 
                  dataKey="value"
                  nameKey="name"
                >
                  {categoryData.map((_, index) => (
                    <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                  ))}
                </Pie>
                <RechartsTooltip formatter={(value: any, name: string) => [`${Math.round(value).toLocaleString()} €`, name]} />
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

function ArrowRight(props: any) {
  return (
    <svg
      {...props}
      xmlns="http://www.w3.org/2000/svg"
      width="24"
      height="24"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M5 12h14" />
      <path d="m12 5 7 7-7 7" />
    </svg>
  )
}
