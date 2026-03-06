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
  Bar
} from 'recharts';
import { 
  Banknote, 
  Cuboid as Cube, 
  FileText, 
  Factory, 
  ListTodo, 
  TrendingUp, 
  ArrowRight,
  PieChart as PieChartIcon
} from 'lucide-react';
import { Badge } from '@/components/ui/badge';

interface DashboardViewProps {
  articles: any[];
  factures: any[];
  onNavigate: (tab: ViewType) => void;
}

export default function DashboardView({ articles = [], factures = [], onNavigate }: DashboardViewProps) {
  const stats = useMemo(() => {
    const now = new Date();
    // Structure pour stocker les totaux par unité de mesure
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

      // Initialisation de l'entrée pour cette unité si elle n'existe pas
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

    // Ajouter le fret à la valeur totale
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

  const chartData = useMemo(() => {
    const data: Record<string, { name: string; value: number }> = {};
    (articles || []).forEach(o => {
      if (o.status === 'TO_ORDER' || o.status === 'PI') return;
      const cat = o.categoryId || 'Inconnu';
      if (!data[cat]) data[cat] = { name: cat, value: 0 };
      data[cat].value += (Number(o.quantity) || 0) * (Number(o.purchasePricePerUnit) || 0);
    });
    return Object.values(data).sort((a, b) => b.value - a.value);
  }, [articles]);

  const COLORS = ['#d97706', '#059669', '#2563eb', '#7c3aed', '#db2777', '#4b5563'];

  return (
    <div className="space-y-8 fade-in">
      {/* Header Section */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-6">
        <div>
          <h1 className="text-4xl font-black text-stone-900 tracking-tight uppercase italic">Tableau de bord</h1>
          <p className="text-stone-500 font-medium">Suivi global de l'inventaire et des flux logistiques</p>
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
              <span className="text-xs font-normal opacity-80 ml-1">Total Unités</span>
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
            <p className="text-xs text-stone-500 font-medium">Cumul articles + frais de transport réels</p>
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
            <p className="text-xs text-stone-500 font-medium">Volume physique total traité</p>
          </CardContent>
        </Card>

        <Card className="border-none shadow-sm bg-white overflow-hidden">
          <div className="h-1.5 bg-blue-600 w-full" />
          <CardContent className="p-6">
            <div className="flex justify-between items-start mb-4">
              <div>
                <p className="text-[10px] font-bold text-stone-400 uppercase tracking-widest">Suivi Factures</p>
                <h3 className="text-3xl font-black text-stone-900 mt-1">{stats.facturesCount} <span className="text-lg font-bold text-stone-400">Docs</span></h3>
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

      {/* Bottom Visualizations */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <Card className="lg:col-span-2 border-none shadow-sm bg-white">
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle className="text-sm font-bold flex items-center gap-2">
              <TrendingUp className="w-4 h-4 text-amber-600" />
              Répartition par Catégorie (Valeur)
            </CardTitle>
            <div className="text-[10px] font-bold text-stone-400 uppercase tracking-widest">Impact financier</div>
          </CardHeader>
          <CardContent className="h-[350px] pb-6">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={chartData} layout="vertical" margin={{ left: 40, right: 30, top: 10, bottom: 10 }}>
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
                <Bar dataKey="value" radius={[0, 6, 6, 0]} barSize={24}>
                  {chartData.map((_, index) => (
                    <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        <Card className="border-none shadow-sm bg-stone-900 text-white overflow-hidden">
          <div className="absolute top-0 right-0 p-4 opacity-10">
            <PieChartIcon className="w-24 h-24" />
          </div>
          <CardHeader>
            <CardTitle className="text-sm font-bold text-amber-400 uppercase tracking-wider">Navigation Rapide</CardTitle>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="space-y-4">
              <div className="flex justify-between items-center bg-stone-800/50 p-3 rounded-xl border border-stone-700/50">
                <span className="text-xs font-medium text-stone-300">Articles à commander</span>
                <Badge className="bg-amber-600 text-white border-none">{stats.toOrderCount}</Badge>
              </div>
              <div className="flex justify-between items-center bg-stone-800/50 p-3 rounded-xl border border-stone-700/50">
                <span className="text-xs font-medium text-stone-300">Envois en mer</span>
                <Badge className="bg-blue-600 text-white border-none">{stats.transitFactures}</Badge>
              </div>
            </div>

            <div className="pt-4 border-t border-stone-800 space-y-2">
              <Button 
                variant="ghost" 
                className="w-full justify-start text-xs hover:bg-stone-800 text-stone-300" 
                onClick={() => onNavigate('to-order')}
              >
                <ArrowRight className="w-3 h-3 mr-2" /> 
                Gérer les rappels de commande
              </Button>
              <Button 
                variant="ghost" 
                className="w-full justify-start text-xs hover:bg-stone-800 text-stone-300" 
                onClick={() => onNavigate('factures')}
              >
                <ArrowRight className="w-3 h-3 mr-2" /> 
                Liste des factures et arrivages
              </Button>
              <Button 
                variant="ghost" 
                className="w-full justify-start text-xs hover:bg-stone-800 text-stone-300" 
                onClick={() => onNavigate('data')}
              >
                <ArrowRight className="w-3 h-3 mr-2" /> 
                Consulter la base de données
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
