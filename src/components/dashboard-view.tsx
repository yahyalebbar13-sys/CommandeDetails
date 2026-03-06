'use client';

import React, { useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { 
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, 
  Cell, PieChart, Pie, Legend, AreaChart, Area
} from 'recharts';
import { 
  Package, 
  FileText, 
  Factory, 
  DollarSign,
  Box,
  Truck,
  TrendingUp,
  BarChart3,
  Anchor,
  Activity,
  ClipboardList,
  ArrowRight
} from 'lucide-react';
import { ViewType } from '@/lib/types';

interface DashboardViewProps {
  articles: any[];
  factures: any[];
  onNavigate: (view: ViewType) => void;
}

const COLORS = ['#CC8626', '#1E293B', '#334155', '#475569', '#64748B', '#94A3B8'];
const STATUS_COLORS = {
  'TO_ORDER': '#94A3B8',
  'PI': '#CC8626',
  'SHIPPED': '#3B82F6',
  'ARRIVED': '#10B981'
};

const DashboardView: React.FC<DashboardViewProps> = ({ articles = [], factures = [], onNavigate }) => {
  // Garantir que les props ne sont jamais null pour les opérations de filtrage
  const safeArticles = articles || [];
  const safeFactures = factures || [];

  const stats = useMemo(() => {
    let totalVal = 0;
    let totalCbm = 0;
    let inTransitVal = 0;
    let arrivedVal = 0;
    let totalFreight = 0;

    const toOrderArticles = safeArticles.filter(a => a.status === 'TO_ORDER');
    const piArticles = safeArticles.filter(a => a.status === 'PI');

    safeArticles.forEach(art => {
      const val = (Number(art.quantity) || 0) * (Number(art.purchasePricePerUnit) || 0);
      const cbm = Number(art.cubicMeasurement) || 0;
      totalVal += val;
      totalCbm += cbm;
      if (art.status === 'SHIPPED') inTransitVal += val;
      if (art.status === 'ARRIVED') arrivedVal += val;
    });

    safeFactures.forEach(f => {
      totalFreight += (Number(f.freightCost) || Number(f.freight) || 0);
    });

    const avgEfficiency = totalCbm > 0 ? totalFreight / totalCbm : 0;

    return {
      totalVal,
      totalCbm,
      inTransitVal,
      arrivedVal,
      totalFactures: safeFactures.length,
      toOrderCount: toOrderArticles.length,
      piCount: piArticles.length,
      avgEfficiency
    };
  }, [safeArticles, safeFactures]);

  const categoryData = useMemo(() => {
    const data: Record<string, number> = {};
    safeArticles.forEach(art => {
      const cat = art.categoryId || 'Non classé';
      const val = (Number(art.quantity) || 0) * (Number(art.purchasePricePerUnit) || 0);
      data[cat] = (data[cat] || 0) + val;
    });
    return Object.entries(data)
      .map(([name, value]) => ({ name, value }))
      .sort((a, b) => b.value - a.value)
      .slice(0, 6);
  }, [safeArticles]);

  const statusValueData = useMemo(() => {
    return [
      { 
        name: 'À commander', 
        value: safeArticles.filter(a => a.status === 'TO_ORDER').reduce((sum, a) => sum + (a.quantity * a.purchasePricePerUnit), 0), 
        color: STATUS_COLORS.TO_ORDER 
      },
      { 
        name: 'En production', 
        value: safeArticles.filter(a => a.status === 'PI').reduce((sum, a) => sum + (a.quantity * a.purchasePricePerUnit), 0), 
        color: STATUS_COLORS.PI 
      },
      { 
        name: 'En transit', 
        value: safeArticles.filter(a => a.status === 'SHIPPED').reduce((sum, a) => sum + (a.quantity * a.purchasePricePerUnit), 0), 
        color: STATUS_COLORS.SHIPPED 
      },
      { 
        name: 'Arrivé', 
        value: safeArticles.filter(a => a.status === 'ARRIVED').reduce((sum, a) => sum + (a.quantity * a.purchasePricePerUnit), 0), 
        color: STATUS_COLORS.ARRIVED 
      },
    ];
  }, [safeArticles]);

  const volumeTrend = useMemo(() => {
    return [
      { name: 'M-3', value: stats.totalCbm * 0.7 },
      { name: 'M-2', value: stats.totalCbm * 0.85 },
      { name: 'M-1', value: stats.totalCbm * 0.95 },
      { name: 'Now', value: stats.totalCbm },
    ];
  }, [stats.totalCbm]);

  return (
    <div className="space-y-8 animate-in fade-in duration-500">
      {/* Quick Nav Indicators - Besoins & Production */}
      <div className="flex flex-wrap gap-4">
        <button 
          onClick={() => onNavigate('to-order')}
          className="bg-white border border-stone-200 rounded-2xl p-4 flex items-center gap-4 hover:border-amber-500 transition-all shadow-sm group min-w-[200px]"
        >
          <div className="p-2 bg-stone-100 rounded-xl group-hover:bg-amber-100 transition-colors">
            <ClipboardList className="w-5 h-5 text-stone-500 group-hover:text-amber-600" />
          </div>
          <div className="text-left">
            <p className="text-[10px] font-black text-stone-400 uppercase tracking-widest">Besoins</p>
            <p className="text-xl font-black text-stone-900 leading-none mt-1">{stats.toOrderCount} <span className="text-[10px] text-stone-400 font-bold">RAPPELS</span></p>
          </div>
          <ArrowRight className="w-4 h-4 text-stone-200 group-hover:text-amber-500 ml-auto" />
        </button>

        <button 
          onClick={() => onNavigate('pending')}
          className="bg-white border border-stone-200 rounded-2xl p-4 flex items-center gap-4 hover:border-amber-500 transition-all shadow-sm group min-w-[200px]"
        >
          <div className="p-2 bg-stone-100 rounded-xl group-hover:bg-amber-100 transition-colors">
            <Factory className="w-5 h-5 text-stone-500 group-hover:text-amber-600" />
          </div>
          <div className="text-left">
            <p className="text-[10px] font-black text-stone-400 uppercase tracking-widest">Production</p>
            <p className="text-xl font-black text-stone-900 leading-none mt-1">{stats.piCount} <span className="text-[10px] text-stone-400 font-bold">PI LNC</span></p>
          </div>
          <ArrowRight className="w-4 h-4 text-stone-200 group-hover:text-amber-500 ml-auto" />
        </button>
      </div>

      {/* Primary KPI Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card className="border-none shadow-sm bg-white overflow-hidden group">
          <div className="h-1 w-full bg-stone-900" />
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-[10px] font-bold text-stone-400 uppercase tracking-widest mb-1">Valeur Portefeuille</p>
                <h3 className="text-2xl font-black text-stone-900">{stats.totalVal.toLocaleString()} €</h3>
              </div>
              <DollarSign className="w-5 h-5 text-stone-200 group-hover:text-stone-900 transition-colors" />
            </div>
          </CardContent>
        </Card>

        <Card className="border-none shadow-sm bg-white overflow-hidden group">
          <div className="h-1 w-full bg-amber-500" />
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-[10px] font-bold text-stone-400 uppercase tracking-widest mb-1">Volume Importé</p>
                <h3 className="text-2xl font-black text-stone-900">{stats.totalCbm.toFixed(2)} m³</h3>
              </div>
              <Box className="w-5 h-5 text-stone-200 group-hover:text-amber-500 transition-colors" />
            </div>
          </CardContent>
        </Card>

        <Card className="border-none shadow-sm bg-white overflow-hidden group">
          <div className="h-1 w-full bg-blue-500" />
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-[10px] font-bold text-stone-400 uppercase tracking-widest mb-1">Efficacité Fret</p>
                <h3 className="text-2xl font-black text-stone-900">{stats.avgEfficiency.toFixed(2)} <span className="text-xs text-stone-400">€/m³</span></h3>
              </div>
              <Anchor className="w-5 h-5 text-stone-200 group-hover:text-blue-500 transition-colors" />
            </div>
          </CardContent>
        </Card>

        <Card 
          onClick={() => onNavigate('factures')}
          className="border-none shadow-sm bg-white overflow-hidden group cursor-pointer hover:shadow-md transition-all active:scale-95"
        >
          <div className="h-1 w-full bg-emerald-500" />
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-[10px] font-bold text-stone-400 uppercase tracking-widest mb-1">Factures Import</p>
                <h3 className="text-2xl font-black text-stone-900">{stats.totalFactures} <span className="text-[10px] text-stone-300 font-bold uppercase ml-2">Voir tout</span></h3>
              </div>
              <FileText className="w-5 h-5 text-stone-200 group-hover:text-emerald-500 transition-colors" />
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Analytics Center */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card className="border-none shadow-sm bg-white">
          <CardHeader className="py-4 border-b border-stone-50">
            <CardTitle className="text-[10px] font-black uppercase text-stone-500 flex items-center gap-2 tracking-widest">
              <TrendingUp className="w-3 h-3" /> Distribution des Catégories
            </CardTitle>
          </CardHeader>
          <CardContent className="h-[300px] p-6">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={categoryData}
                  cx="50%"
                  cy="50%"
                  innerRadius={70}
                  outerRadius={100}
                  paddingAngle={8}
                  dataKey="value"
                  stroke="none"
                >
                  {categoryData.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip 
                  formatter={(val: number) => [`${val.toLocaleString()} €`, 'Valeur']}
                  contentStyle={{ border: 'none', borderRadius: '12px', boxShadow: '0 10px 30px rgba(0,0,0,0.1)', fontWeight: 'bold' }}
                />
                <Legend verticalAlign="bottom" height={36} iconType="circle" wrapperStyle={{ fontSize: '10px', fontWeight: '900', textTransform: 'uppercase', paddingTop: '20px' }} />
              </PieChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        <Card className="border-none shadow-sm bg-white">
          <CardHeader className="py-4 border-b border-stone-50">
            <CardTitle className="text-[10px] font-black uppercase text-stone-500 flex items-center gap-2 tracking-widest">
              <BarChart3 className="w-3 h-3" /> Valorisation par État (€)
            </CardTitle>
          </CardHeader>
          <CardContent className="h-[300px] p-6">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={statusValueData} margin={{ top: 20, right: 30, left: 20, bottom: 5 }}>
                <XAxis 
                  dataKey="name" 
                  axisLine={false} 
                  tickLine={false} 
                  style={{ fontSize: '10px', fontWeight: '900', textTransform: 'uppercase', color: '#94A3B8' }}
                />
                <Tooltip 
                  cursor={{ fill: '#f8fafc' }}
                  formatter={(val: number) => [`${val.toLocaleString()} €`, 'Valeur']}
                  contentStyle={{ border: 'none', borderRadius: '12px', boxShadow: '0 10px 30px rgba(0,0,0,0.1)' }}
                />
                <Bar dataKey="value" radius={[6, 6, 0, 0]} barSize={40}>
                  {statusValueData.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={entry.color} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      </div>

      {/* Bottom Analytics */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card className="border-none shadow-sm bg-white">
          <CardHeader className="py-4 border-b border-stone-50">
            <CardTitle className="text-[10px] font-black uppercase text-stone-500 flex items-center gap-2 tracking-widest">
              <Activity className="w-3 h-3" /> Tendance Volumétrique (m³)
            </CardTitle>
          </CardHeader>
          <CardContent className="h-[200px] p-6">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={volumeTrend}>
                <defs>
                  <linearGradient id="colorValue" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#CC8626" stopOpacity={0.1}/>
                    <stop offset="95%" stopColor="#CC8626" stopOpacity={0}/>
                  </linearGradient>
                </defs>
                <Area type="monotone" dataKey="value" stroke="#CC8626" strokeWidth={3} fillOpacity={1} fill="url(#colorValue)" />
                <Tooltip />
              </AreaChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        <Card className="border-none shadow-sm bg-white overflow-hidden">
          <CardHeader className="py-4 border-b border-stone-50">
            <CardTitle className="text-[10px] font-black uppercase text-stone-500 tracking-widest">Couverture Logistique</CardTitle>
          </CardHeader>
          <CardContent className="p-8">
            <div className="space-y-6">
              <div>
                <div className="flex justify-between text-[11px] font-black uppercase mb-2">
                  <span className="text-emerald-600">Arrivages Consolidés</span>
                  <span>{Math.round((stats.arrivedVal / stats.totalVal) * 100 || 0)}%</span>
                </div>
                <div className="h-2 w-full bg-stone-100 rounded-full overflow-hidden">
                  <div 
                    className="h-full bg-emerald-500 transition-all duration-1000" 
                    style={{ width: `${(stats.arrivedVal / stats.totalVal) * 100 || 0}%` }}
                  />
                </div>
              </div>
              <div>
                <div className="flex justify-between text-[11px] font-black uppercase mb-2">
                  <span className="text-blue-600">Flux en Transit</span>
                  <span>{Math.round((stats.inTransitVal / stats.totalVal) * 100 || 0)}%</span>
                </div>
                <div className="h-2 w-full bg-stone-100 rounded-full overflow-hidden">
                  <div 
                    className="h-full bg-blue-500 transition-all duration-1000" 
                    style={{ width: `${(stats.inTransitVal / stats.totalVal) * 100 || 0}%` }}
                  />
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
};

export default DashboardView;
