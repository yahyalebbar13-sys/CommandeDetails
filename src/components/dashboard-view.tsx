"use client";

import React, { useMemo } from 'react';
import { ViewType } from '@/lib/types';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { 
  XAxis, 
  YAxis, 
  CartesianGrid, 
  Tooltip as RechartsTooltip, 
  ResponsiveContainer, 
  Cell,
  AreaChart,
  Area,
  BarChart, 
  Bar,
  Legend
} from 'recharts';
import { 
  Banknote, 
  Cuboid as Cube, 
  FileText, 
  Factory, 
  ListTodo, 
  TrendingUp, 
  Activity,
  Package
} from 'lucide-react';
import { Badge } from '@/components/ui/badge';

interface DashboardViewProps {
  articles: any[];
  factures: any[];
  onNavigate: (tab: ViewType) => void;
}

const COLORS = ['#d97706', '#059669', '#2563eb', '#7c3aed', '#db2777', '#4b5563', '#ea580c', '#0891b2'];

export default function DashboardView({ articles = [], factures = [], onNavigate }: DashboardViewProps) {
  const stats = useMemo(() => {
    const now = new Date();
    const unitStats: Record<string, { total: number; arrived: number; transit: number; production: number }> = {};
    let totalVal = 0;
    let totalCbm = 0;
    let toOrderCount = 0;

    const safeArticles = articles || [];
    const safeFactures = factures || [];

    safeArticles.forEach(o => {
      const val = (Number(o.quantity) || 0) * (Number(o.purchasePricePerUnit) || 0);
      const unit = (o.unitOfMeasure || 'pcs').toUpperCase();
      const qty = Number(o.quantity) || 0;
      const cbm = Number(o.cubicMeasurement) || 0;

      if (o.status === 'TO_ORDER') {
        toOrderCount++;
        return;
      }

      if (!unitStats[unit]) {
        unitStats[unit] = { total: 0, arrived: 0, transit: 0, production: 0 };
      }

      unitStats[unit].total += qty;

      if (o.status === 'PI' || !o.factureId) {
        unitStats[unit].production += qty;
      } else {
        totalVal += val;
        totalCbm += cbm;
        const arrivalDate = o.arrivalDate ? new Date(o.arrivalDate) : null;
        if (arrivalDate && arrivalDate <= now) {
          unitStats[unit].arrived += qty;
        } else {
          unitStats[unit].transit += qty;
        }
      }
    });

    safeFactures.forEach(f => {
      totalVal += (Number(f.freightCost) || Number(f.freight) || 0);
    });

    return {
      unitStats,
      totalVal,
      totalCbm,
      toOrderCount,
      facturesCount: safeFactures.length,
      transitFactures: safeFactures.filter(f => f.arrivalDate && new Date(f.arrivalDate) > now).length
    };
  }, [articles, factures]);

  // Données pour la répartition par catégorie (Valeur)
  const categoryValueData = useMemo(() => {
    const data: Record<string, { name: string; value: number }> = {};
    (articles || []).forEach(o => {
      if (o.status === 'TO_ORDER') return;
      const cat = o.categoryId || 'Inconnu';
      if (!data[cat]) data[cat] = { name: cat, value: 0 };
      data[cat].value += (Number(o.quantity) || 0) * (Number(o.purchasePricePerUnit) || 0);
    });
    return Object.values(data).sort((a, b) => b.value - a.value).slice(0, 8);
  }, [articles]);

  // Données pour le volume par catégorie
  const categoryVolumeData = useMemo(() => {
    const data: Record<string, { name: string; cbm: number }> = {};
    (articles || []).forEach(o => {
      if (o.status === 'TO_ORDER') return;
      const cat = o.categoryId || 'Inconnu';
      if (!data[cat]) data[cat] = { name: cat, cbm: 0 };
      data[cat].cbm += Number(o.cubicMeasurement) || 0;
    });
    return Object.values(data).sort((a, b) => b.cbm - a.cbm).slice(0, 8);
  }, [articles]);

  // Données pour l'évolution mensuelle
  const monthlyTrendData = useMemo(() => {
    const trend: Record<string, { month: string; total: number; volume: number }> = {};
    (articles || []).forEach(o => {
      if (!o.orderDate) return;
      const month = o.orderDate.substring(0, 7); // YYYY-MM
      if (!trend[month]) trend[month] = { month, total: 0, volume: 0 };
      trend[month].total += (Number(o.quantity) || 0) * (Number(o.purchasePricePerUnit) || 0);
      trend[month].volume += Number(o.cubicMeasurement) || 0;
    });
    return Object.values(trend).sort((a, b) => a.month.localeCompare(b.month)).slice(-6);
  }, [articles]);

  return (
    <div className="space-y-8 fade-in">
      {/* Header Section */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-6">
        <div>
          <h1 className="text-4xl font-black text-stone-900 tracking-tight uppercase">Tableau de bord</h1>
          <p className="text-stone-500 font-medium">Analyse globale de l'inventaire et des flux</p>
        </div>
        
        <div className="flex flex-wrap gap-3">
          <div 
            onClick={() => onNavigate('to-order')}
            className="bg-white border border-stone-200 p-4 rounded-2xl cursor-pointer hover:shadow-md transition-all min-w-[160px]"
          >
            <div className="flex items-center gap-2 text-stone-400 text-[10px] font-bold uppercase tracking-widest mb-1">
              <ListTodo className="w-3 h-3" /> À Commander
            </div>
            <div className="text-2xl font-black text-stone-800">{stats.toOrderCount} <span className="text-xs font-normal text-stone-400">Réf.</span></div>
          </div>

          <div 
            onClick={() => onNavigate('pending')}
            className="bg-amber-600 text-white p-4 rounded-2xl cursor-pointer hover:scale-105 transition-transform shadow-lg min-w-[160px]"
          >
            <div className="flex items-center gap-2 text-amber-100 text-[10px] font-bold uppercase tracking-widest mb-1">
              <Factory className="w-3 h-3" /> En Production
            </div>
            <div className="text-2xl font-black">
              {Object.values(stats.unitStats).reduce((acc, curr) => acc + curr.production, 0).toLocaleString()} 
              <span className="text-xs font-normal opacity-80 ml-1">Unités</span>
            </div>
          </div>
        </div>
      </div>

      {/* Main KPIs */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <Card className="border-none shadow-sm bg-white overflow-hidden">
          <div className="h-1.5 bg-amber-600 w-full" />
          <CardContent className="p-6">
            <div className="flex justify-between items-start mb-4">
              <div>
                <p className="text-[10px] font-bold text-stone-400 uppercase tracking-widest">Valeur Stock & Transit</p>
                <h3 className="text-3xl font-black text-stone-900 mt-1">{Math.round(stats.totalVal).toLocaleString()} €</h3>
              </div>
              <div className="p-2 bg-amber-50 rounded-lg text-amber-600">
                <Banknote className="w-6 h-6" />
              </div>
            </div>
            <p className="text-xs text-stone-500 font-medium">Articles commandés + frais logistiques</p>
          </CardContent>
        </Card>

        <Card className="border-none shadow-sm bg-white overflow-hidden">
          <div className="h-1.5 bg-emerald-600 w-full" />
          <CardContent className="p-6">
            <div className="flex justify-between items-start mb-4">
              <div>
                <p className="text-[10px] font-bold text-stone-400 uppercase tracking-widest">Volume Global (CBM)</p>
                <h3 className="text-3xl font-black text-stone-900 mt-1">{stats.totalCbm.toFixed(2)} <span className="text-lg text-stone-400 font-bold">m³</span></h3>
              </div>
              <div className="p-2 bg-emerald-50 rounded-lg text-emerald-600">
                <Cube className="w-6 h-6" />
              </div>
            </div>
            <p className="text-xs text-stone-500 font-medium">Volume total des marchandises suivies</p>
          </CardContent>
        </Card>

        <Card className="border-none shadow-sm bg-white overflow-hidden">
          <div className="h-1.5 bg-blue-600 w-full" />
          <CardContent className="p-6">
            <div className="flex justify-between items-start mb-4">
              <div>
                <p className="text-[10px] font-bold text-stone-400 uppercase tracking-widest">Documents & Transit</p>
                <h3 className="text-3xl font-black text-stone-900 mt-1">{stats.facturesCount} <span className="text-lg font-bold text-stone-400">Factures</span></h3>
              </div>
              <div className="p-2 bg-blue-50 rounded-lg text-blue-600">
                <FileText className="w-6 h-6" />
              </div>
            </div>
            <div className="flex gap-3 text-xs font-bold mt-2">
              <span className="text-emerald-600 px-2 py-0.5 bg-emerald-50 rounded-full">✓ {stats.facturesCount - stats.transitFactures} Arrivées</span>
              <span className="text-blue-600 px-2 py-0.5 bg-blue-50 rounded-full">🚢 {stats.transitFactures} En mer</span>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Analytics Charts */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Value Distribution */}
        <Card className="border border-stone-200 shadow-sm bg-white">
          <CardHeader>
            <CardTitle className="text-sm font-bold flex items-center gap-2 uppercase tracking-wider text-stone-700">
              <TrendingUp className="w-4 h-4 text-amber-600" />
              Valeur par Sous-Catégorie
            </CardTitle>
          </CardHeader>
          <CardContent className="h-[300px] pb-6">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={categoryValueData} layout="vertical" margin={{ left: 40, right: 30, top: 10, bottom: 10 }}>
                <CartesianGrid strokeDasharray="3 3" horizontal={true} vertical={false} stroke="#f5f5f5" />
                <XAxis type="number" hide />
                <YAxis 
                  dataKey="name" 
                  type="category" 
                  width={120} 
                  fontSize={10} 
                  fontWeight="bold" 
                  axisLine={false} 
                  tickLine={false}
                  tick={{ fill: '#57534e' }}
                />
                <RechartsTooltip 
                  cursor={{fill: '#fafaf9'}}
                  contentStyle={{borderRadius: '12px', border: '1px solid #e7e5e4', boxShadow: '0 10px 15px -3px rgb(0 0 0 / 0.1)'}}
                  formatter={(v: any) => [`${Math.round(v).toLocaleString()} €`, 'Valeur']} 
                />
                <Bar dataKey="value" radius={[0, 6, 6, 0]} barSize={20}>
                  {categoryValueData.map((_, index) => (
                    <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        {/* Volume Distribution */}
        <Card className="border border-stone-200 shadow-sm bg-white">
          <CardHeader>
            <CardTitle className="text-sm font-bold flex items-center gap-2 uppercase tracking-wider text-stone-700">
              <Cube className="w-4 h-4 text-emerald-600" />
              Volume par Sous-Catégorie (CBM)
            </CardTitle>
          </CardHeader>
          <CardContent className="h-[300px] pb-6">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={categoryVolumeData} layout="vertical" margin={{ left: 40, right: 30, top: 10, bottom: 10 }}>
                <CartesianGrid strokeDasharray="3 3" horizontal={true} vertical={false} stroke="#f5f5f5" />
                <XAxis type="number" hide />
                <YAxis 
                  dataKey="name" 
                  type="category" 
                  width={120} 
                  fontSize={10} 
                  fontWeight="bold" 
                  axisLine={false} 
                  tickLine={false}
                  tick={{ fill: '#57534e' }}
                />
                <RechartsTooltip 
                  cursor={{fill: '#fafaf9'}}
                  contentStyle={{borderRadius: '12px', border: '1px solid #e7e5e4', boxShadow: '0 10px 15px -3px rgb(0 0 0 / 0.1)'}}
                  formatter={(v: any) => [`${v.toFixed(2)} m³`, 'Volume']} 
                />
                <Bar dataKey="cbm" radius={[0, 6, 6, 0]} barSize={20}>
                  {categoryVolumeData.map((_, index) => (
                    <Cell key={`cell-${index}`} fill={COLORS[(index + 2) % COLORS.length]} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        {/* Trend Analysis */}
        <Card className="lg:col-span-2 border border-stone-200 shadow-sm bg-white">
          <CardHeader>
            <CardTitle className="text-sm font-bold flex items-center gap-2 uppercase tracking-wider text-stone-700">
              <Activity className="w-4 h-4 text-blue-600" />
              Évolution Mensuelle des Flux
            </CardTitle>
          </CardHeader>
          <CardContent className="h-[350px] pb-6">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={monthlyTrendData} margin={{ top: 10, right: 30, left: 0, bottom: 0 }}>
                <defs>
                  <linearGradient id="colorTotal" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#d97706" stopOpacity={0.1}/>
                    <stop offset="95%" stopColor="#d97706" stopOpacity={0}/>
                  </linearGradient>
                  <linearGradient id="colorVolume" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#2563eb" stopOpacity={0.1}/>
                    <stop offset="95%" stopColor="#2563eb" stopOpacity={0}/>
                  </linearGradient>
                </defs>
                <XAxis dataKey="month" fontSize={10} axisLine={false} tickLine={false} />
                <YAxis fontSize={10} axisLine={false} tickLine={false} />
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f1f1" />
                <RechartsTooltip 
                  contentStyle={{borderRadius: '12px', border: '1px solid #e7e5e4', boxShadow: '0 10px 15px -3px rgb(0 0 0 / 0.1)'}}
                />
                <Legend verticalAlign="top" align="right" height={36}/>
                <Area 
                  type="monotone" 
                  name="Valeur (€)"
                  dataKey="total" 
                  stroke="#d97706" 
                  strokeWidth={3}
                  fillOpacity={1} 
                  fill="url(#colorTotal)" 
                />
                <Area 
                  type="monotone" 
                  name="Volume (m³)"
                  dataKey="volume" 
                  stroke="#2563eb" 
                  strokeWidth={3}
                  fillOpacity={1} 
                  fill="url(#colorVolume)" 
                />
              </AreaChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        {/* Unit Summary Card */}
        <Card className="border border-stone-200 shadow-sm bg-white">
          <CardHeader>
            <CardTitle className="text-sm font-bold flex items-center gap-2 uppercase tracking-wider text-stone-700">
              <Package className="w-4 h-4 text-stone-500" />
              Volumes par Unité
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {Object.entries(stats.unitStats).map(([unit, data]) => (
                <div key={unit} className="p-3 bg-stone-50 rounded-lg border border-stone-100">
                  <div className="flex justify-between items-center mb-1">
                    <span className="text-xs font-black text-stone-600">{unit}</span>
                    <span className="text-xs font-bold text-stone-900">{data.total.toLocaleString()} total</span>
                  </div>
                  <div className="grid grid-cols-3 gap-2 text-[10px] text-stone-500 font-medium">
                    <div>Arr: <span className="text-emerald-600">{data.arrived.toLocaleString()}</span></div>
                    <div>Tra: <span className="text-blue-600">{data.transit.toLocaleString()}</span></div>
                    <div>Prd: <span className="text-amber-600">{data.production.toLocaleString()}</span></div>
                  </div>
                </div>
              ))}
              {Object.keys(stats.unitStats).length === 0 && (
                <p className="text-center text-stone-400 text-sm italic py-4">Aucune donnée d'unité</p>
              )}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
