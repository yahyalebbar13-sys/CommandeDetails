'use client';

import React, { useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { 
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, 
  Cell, PieChart, Pie, Legend
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
  Activity
} from 'lucide-react';

interface DashboardViewProps {
  articles: any[];
  factures: any[];
  onNavigate: (view: any) => void;
}

const COLORS = ['#CC8626', '#44403c', '#78716c', '#a8a29e', '#d6d3d1', '#e7e5e4'];
const STATUS_COLORS = {
  'TO_ORDER': '#a8a29e',
  'PI': '#CC8626',
  'SHIPPED': '#3b82f6',
  'ARRIVED': '#10b981'
};

const DashboardView: React.FC<DashboardViewProps> = ({ articles = [], factures = [] }) => {
  const stats = useMemo(() => {
    const safeArticles = articles || [];
    const safeFactures = factures || [];

    let totalVal = 0;
    let totalCbm = 0;
    let inTransitVal = 0;
    let arrivedVal = 0;
    let totalFreight = 0;

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
      pendingCount: safeArticles.filter(a => a.status === 'TO_ORDER' || a.status === 'PI').length,
      avgEfficiency
    };
  }, [articles, factures]);

  const valueData = useMemo(() => {
    const data: Record<string, number> = {};
    articles?.forEach(art => {
      const cat = art.categoryId || 'Non classé';
      const val = (Number(art.quantity) || 0) * (Number(art.purchasePricePerUnit) || 0);
      data[cat] = (data[cat] || 0) + val;
    });
    return Object.entries(data)
      .map(([name, value]) => ({ name, value }))
      .sort((a, b) => b.value - a.value)
      .slice(0, 8);
  }, [articles]);

  const statusValueData = useMemo(() => {
    const data = [
      { name: 'À commander', key: 'TO_ORDER', value: 0, color: STATUS_COLORS.TO_ORDER },
      { name: 'En production', key: 'PI', value: 0, color: STATUS_COLORS.PI },
      { name: 'En transit', key: 'SHIPPED', value: 0, color: STATUS_COLORS.SHIPPED },
      { name: 'Arrivé', key: 'ARRIVED', value: 0, color: STATUS_COLORS.ARRIVED },
    ];

    articles?.forEach(art => {
      const val = (Number(art.quantity) || 0) * (Number(art.purchasePricePerUnit) || 0);
      const item = data.find(d => d.key === art.status);
      if (item) item.value += val;
    });

    return data;
  }, [articles]);

  return (
    <div className="space-y-8 animate-in fade-in duration-500">
      {/* Header Statistique - Style Enterprise */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card className="border-none shadow-sm bg-white overflow-hidden group hover:shadow-md transition-shadow">
          <div className="h-1 w-full bg-amber-500" />
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-[10px] font-bold text-stone-400 uppercase tracking-widest mb-1">Valeur Totale Portefeuille</p>
                <h3 className="text-2xl font-black text-stone-900">{stats.totalVal.toLocaleString()} €</h3>
              </div>
              <div className="p-3 bg-amber-50 rounded-lg group-hover:scale-110 transition-transform">
                <DollarSign className="w-5 h-5 text-amber-600" />
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="border-none shadow-sm bg-white overflow-hidden group hover:shadow-md transition-shadow">
          <div className="h-1 w-full bg-blue-500" />
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-[10px] font-bold text-stone-400 uppercase tracking-widest mb-1">Volume Global Importé</p>
                <h3 className="text-2xl font-black text-stone-900">{stats.totalCbm.toFixed(2)} m³</h3>
              </div>
              <div className="p-3 bg-blue-50 rounded-lg group-hover:scale-110 transition-transform">
                <Box className="w-5 h-5 text-blue-600" />
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="border-none shadow-sm bg-white overflow-hidden group hover:shadow-md transition-shadow">
          <div className="h-1 w-full bg-indigo-500" />
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-[10px] font-bold text-stone-400 uppercase tracking-widest mb-1">Efficacité Fret Moyenne</p>
                <h3 className="text-2xl font-black text-stone-900">{stats.avgEfficiency.toFixed(2)} <span className="text-sm font-normal text-stone-400">€/CBM</span></h3>
              </div>
              <div className="p-3 bg-indigo-50 rounded-lg group-hover:scale-110 transition-transform">
                <Anchor className="w-5 h-5 text-indigo-600" />
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="border-none shadow-sm bg-white overflow-hidden group hover:shadow-md transition-shadow">
          <div className="h-1 w-full bg-emerald-500" />
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-[10px] font-bold text-stone-400 uppercase tracking-widest mb-1">Total Factures Impor.</p>
                <h3 className="text-2xl font-black text-stone-900">{stats.totalFactures}</h3>
              </div>
              <div className="p-3 bg-emerald-50 rounded-lg group-hover:scale-110 transition-transform">
                <FileText className="w-5 h-5 text-emerald-600" />
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Analytics Center */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card className="border-none shadow-sm bg-white">
          <CardHeader className="border-b border-stone-100 bg-stone-50/50">
            <CardTitle className="text-xs font-bold uppercase text-stone-500 flex items-center gap-2">
              <BarChart3 className="w-4 h-4" /> Répartition par Catégorie (€)
            </CardTitle>
          </CardHeader>
          <CardContent className="h-[350px] p-6">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={valueData}
                  cx="50%"
                  cy="50%"
                  innerRadius={80}
                  outerRadius={110}
                  paddingAngle={5}
                  dataKey="value"
                >
                  {valueData.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip 
                  formatter={(value: number) => [`${value.toLocaleString()} €`, 'Valeur']}
                  contentStyle={{ border: 'none', borderRadius: '12px', boxShadow: '0 10px 30px rgba(0,0,0,0.1)', fontWeight: 'bold' }}
                />
                <Legend verticalAlign="bottom" height={36} iconType="circle" />
              </PieChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        <Card className="border-none shadow-sm bg-white">
          <CardHeader className="border-b border-stone-100 bg-stone-50/50">
            <CardTitle className="text-xs font-bold uppercase text-stone-500 flex items-center gap-2">
              <Activity className="w-4 h-4" /> Flux de Valeur par État (€)
            </CardTitle>
          </CardHeader>
          <CardContent className="h-[350px] p-6">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={statusValueData} layout="vertical" margin={{ left: 20, right: 40 }}>
                <CartesianGrid strokeDasharray="3 3" horizontal={true} vertical={false} stroke="#f5f5f5" />
                <XAxis type="number" hide />
                <YAxis 
                  dataKey="name" 
                  type="category" 
                  axisLine={false} 
                  tickLine={false}
                  width={120}
                  style={{ fontSize: '11px', fontWeight: '700', textTransform: 'uppercase', color: '#78716c' }}
                />
                <Tooltip 
                  formatter={(value: number) => [`${value.toLocaleString()} €`, 'Valeur']}
                  cursor={{ fill: '#f8fafc' }}
                  contentStyle={{ border: 'none', borderRadius: '12px', boxShadow: '0 10px 30px rgba(0,0,0,0.1)' }}
                />
                <Bar 
                  dataKey="value" 
                  radius={[0, 6, 6, 0]} 
                  barSize={32}
                >
                  {statusValueData.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={entry.color} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      </div>

      {/* Business Critical Monitoring */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <Card className="border-none shadow-sm bg-white group">
          <CardHeader className="pb-2 border-b border-stone-100 bg-amber-50/20">
            <CardTitle className="text-[10px] font-bold uppercase text-amber-600 tracking-widest flex items-center gap-2">
              <Activity className="w-3 h-3" /> Monitoring des Commandes
            </CardTitle>
          </CardHeader>
          <CardContent className="p-8">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-4xl font-black text-stone-900">{stats.pendingCount}</p>
                <p className="text-xs font-bold text-stone-400 mt-2 uppercase tracking-wide">Articles en attente / production</p>
              </div>
              <div className="h-16 w-16 bg-amber-100 rounded-2xl flex items-center justify-center group-hover:rotate-12 transition-transform">
                <Factory className="w-8 h-8 text-amber-600" />
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="border-none shadow-sm bg-white overflow-hidden">
          <CardHeader className="pb-2 border-b border-stone-100 bg-stone-50/50">
            <CardTitle className="text-[10px] font-bold uppercase text-stone-500 tracking-widest">Répartition Logistique</CardTitle>
          </CardHeader>
          <CardContent className="p-8">
            <div className="space-y-6">
              <div>
                <div className="flex justify-between text-[11px] font-black uppercase mb-2">
                  <span className="text-emerald-600">Stock Arrivé</span>
                  <span>{Math.round((stats.arrivedVal / stats.totalVal) * 100 || 0)}%</span>
                </div>
                <div className="h-2.5 w-full bg-stone-100 rounded-full overflow-hidden">
                  <div 
                    className="h-full bg-emerald-500 transition-all duration-1000" 
                    style={{ width: `${(stats.arrivedVal / stats.totalVal) * 100 || 0}%` }}
                  />
                </div>
              </div>
              <div>
                <div className="flex justify-between text-[11px] font-black uppercase mb-2">
                  <span className="text-blue-600">Stock en Transit</span>
                  <span>{Math.round((stats.inTransitVal / stats.totalVal) * 100 || 0)}%</span>
                </div>
                <div className="h-2.5 w-full bg-stone-100 rounded-full overflow-hidden">
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
