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
  AreaChart,
  Area,
  BarChart,
  Bar
} from 'recharts';
import { Package, Banknote, Cuboid as Cube, FileText, CheckCircle2, Ship, Factory, ListTodo, TrendingUp, ArrowRight } from 'lucide-react';
import { Badge } from '@/components/ui/badge';

interface DashboardViewProps {
  articles: any[];
  factures: any[];
  onNavigate: (tab: ViewType) => void;
}

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
      const unit = (o.unitOfMeasure || 'pcs').toLowerCase();
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
        const arrival = new Date(o.arrivalDate);
        if (arrival <= now) {
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
      transitFactures: safeFactures.filter(f => new Date(f.arrivalDate) > now).length
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
          <h1 className="text-4xl font-black text-stone-900 tracking-tight uppercase">Dashboard</h1>
          <p className="text-stone-500 font-medium">Analyse globale de la chaîne d'approvisionnement</p>
        </div>
        
        <div className="flex flex-wrap gap-3">
          <div 
            onClick={() => onNavigate('to-order')}
            className="bg-stone-900 text-white p-4 rounded-2xl cursor-pointer hover:scale-105 transition-transform shadow-lg min-w-[160px]"
          >
            <div className="flex items-center gap-2 text-stone-400 text-[10px] font-bold uppercase tracking-widest mb-1">
              <ListTodo className="w-3 h-3" /> À Commander
            </div>
            <div className="text-2xl font-black">{stats.toOrderCount} <span className="text-xs opacity-60">Réf.</span></div>
          </div>

          <div 
            onClick={() => onNavigate('pending')}
            className="bg-amber-500 text-white p-4 rounded-2xl cursor-pointer hover:scale-105 transition-transform shadow-lg min-w-[160px]"
          >
            <div className="flex items-center gap-2 text-amber-100 text-[10px] font-bold uppercase tracking-widest mb-1">
              <Factory className="w-3 h-3" /> En Production
            </div>
            <div className="text-2xl font-black">
              {Object.values(stats.unitStats).reduce((acc, curr) => acc + curr.production, 0).toLocaleString()} 
              <span className="text-xs opacity-60 ml-1">Total</span>
            </div>
          </div>
        </div>
      </div>

      {/* Main KPIs */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <Card className="border-none shadow-sm bg-white overflow-hidden">
          <div className="h-1 bg-amber-500 w-full" />
          <CardContent className="p-6">
            <div className="flex justify-between items-start mb-4">
              <div>
                <p className="text-[10px] font-bold text-stone-400 uppercase tracking-widest">Valeur Totale Importée</p>
                <h3 className="text-3xl font-black text-stone-900 mt-1">{Math.round(stats.totalVal).toLocaleString()} €</h3>
              </div>
              <div className="p-2 bg-amber-50 rounded-lg text-amber-600">
                <Banknote className="w-6 h-6" />
              </div>
            </div>
            <p className="text-xs text-stone-500 font-medium">Cumul articles + frais de transport</p>
          </CardContent>
        </Card>

        <Card className="border-none shadow-sm bg-white overflow-hidden">
          <div className="h-1 bg-emerald-500 w-full" />
          <CardContent className="p-6">
            <div className="flex justify-between items-start mb-4">
              <div>
                <p className="text-[10px] font-bold text-stone-400 uppercase tracking-widest">Volume Total</p>
                <h3 className="text-3xl font-black text-stone-900 mt-1">{stats.totalCbm.toFixed(2)} m³</h3>
              </div>
              <div className="p-2 bg-emerald-50 rounded-lg text-emerald-600">
                <Cube className="w-6 h-6" />
              </div>
            </div>
            <p className="text-xs text-stone-500 font-medium">Volume physique total réceptionné</p>
          </CardContent>
        </Card>

        <Card className="border-none shadow-sm bg-white overflow-hidden">
          <div className="h-1 bg-blue-500 w-full" />
          <CardContent className="p-6">
            <div className="flex justify-between items-start mb-4">
              <div>
                <p className="text-[10px] font-bold text-stone-400 uppercase tracking-widest">Flux Factures</p>
                <h3 className="text-3xl font-black text-stone-900 mt-1">{stats.facturesCount} <span className="text-lg font-bold text-stone-400">Docs</span></h3>
              </div>
              <div className="p-2 bg-blue-50 rounded-lg text-blue-600">
                <FileText className="w-6 h-6" />
              </div>
            </div>
            <div className="flex gap-3 text-xs font-bold">
              <span className="text-emerald-600">✓ {stats.facturesCount - stats.transitFactures} Arrivées</span>
              <span className="text-blue-600">🚢 {stats.transitFactures} En mer</span>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Units Breakdown - Crucial Request */}
      <Card className="border-none shadow-sm bg-white">
        <CardHeader className="border-b border-stone-50">
          <CardTitle className="text-sm font-bold flex items-center gap-2">
            <Package className="w-4 h-4 text-amber-600" />
            Répartition des Quantités par Unité
          </CardTitle>
        </CardHeader>
        <CardContent className="p-6">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
            {Object.entries(stats.unitStats).map(([unit, data]) => (
              <div key={unit} className="space-y-3 p-4 rounded-xl bg-stone-50 border border-stone-100">
                <div className="flex justify-between items-center">
                  <span className="text-lg font-black uppercase text-stone-800">{unit}</span>
                  <Badge variant="outline" className="bg-white">{data.total.toLocaleString()}</Badge>
                </div>
                <div className="space-y-2">
                  <div className="w-full bg-white rounded-full h-1.5 overflow-hidden">
                    <div 
                      className="bg-emerald-500 h-full" 
                      style={{ width: `${(data.arrived / data.total) * 100}%` }} 
                    />
                  </div>
                  <div className="flex justify-between text-[10px] font-bold uppercase tracking-tight">
                    <span className="text-emerald-600">Arrivé: {data.arrived.toLocaleString()}</span>
                    <span className="text-blue-600">Transit: {data.transit.toLocaleString()}</span>
                  </div>
                  <div className="text-[10px] font-bold uppercase text-amber-600 text-center pt-1 border-t border-white">
                    En Production: {data.production.toLocaleString()}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Charts Section */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <Card className="lg:col-span-2 border-none shadow-sm">
          <CardHeader>
            <CardTitle className="text-sm font-bold flex items-center gap-2">
              <TrendingUp className="w-4 h-4 text-amber-600" />
              Répartition Financière par Catégorie
            </CardTitle>
          </CardHeader>
          <CardContent className="h-[350px]">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={chartData} layout="vertical" margin={{ left: 40, right: 20 }}>
                <CartesianGrid strokeDasharray="3 3" horizontal={true} vertical={false} stroke="#f0f0f0" />
                <XAxis type="number" hide />
                <YAxis 
                  dataKey="name" 
                  type="category" 
                  width={100} 
                  fontSize={10} 
                  fontWeight="bold" 
                  axisLine={false} 
                  tickLine={false}
                />
                <RechartsTooltip 
                  cursor={{fill: '#f9fafb'}}
                  contentStyle={{borderRadius: '8px', border: 'none', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)'}}
                  formatter={(v: any) => [`${Math.round(v).toLocaleString()} €`, 'Valeur']} 
                />
                <Bar dataKey="value" radius={[0, 4, 4, 0]}>
                  {chartData.map((_, index) => (
                    <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        <Card className="border-none shadow-sm bg-stone-900 text-white">
          <CardHeader>
            <CardTitle className="text-sm font-bold text-amber-400">Statut des Opérations</CardTitle>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="space-y-2">
              <div className="flex justify-between text-xs font-bold uppercase tracking-widest">
                <span>Commandes Reçues</span>
                <span className="text-emerald-400">{Math.round(((stats.facturesCount - stats.transitFactures) / (stats.facturesCount || 1)) * 100)}%</span>
              </div>
              <div className="w-full bg-stone-800 h-2 rounded-full overflow-hidden">
                <div 
                  className="bg-emerald-500 h-full transition-all duration-1000" 
                  style={{ width: `${((stats.facturesCount - stats.transitFactures) / (stats.facturesCount || 1)) * 100}%` }} 
                />
              </div>
            </div>

            <div className="pt-6 border-t border-stone-800">
              <h4 className="text-[10px] font-bold text-stone-500 uppercase tracking-widest mb-4">Actions Rapides</h4>
              <div className="grid grid-cols-1 gap-2">
                <Button variant="ghost" className="justify-start text-xs hover:bg-stone-800 text-stone-300" onClick={() => onNavigate('to-order')}>
                  <ArrowRight className="w-3 h-3 mr-2" /> Gérer les rappels de commande
                </Button>
                <Button variant="ghost" className="justify-start text-xs hover:bg-stone-800 text-stone-300" onClick={() => onNavigate('factures')}>
                  <ArrowRight className="w-3 h-3 mr-2" /> Voir les factures récentes
                </Button>
                <Button variant="ghost" className="justify-start text-xs hover:bg-stone-800 text-stone-300" onClick={() => onNavigate('data')}>
                  <ArrowRight className="w-3 h-3 mr-2" /> Consulter la base de données
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
