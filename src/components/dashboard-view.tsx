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
  History,
  TrendingUp
} from 'lucide-react';

interface DashboardViewProps {
  articles: any[];
  factures: any[];
  onNavigate: (view: any) => void;
}

const COLORS = ['#CC8626', '#44403c', '#78716c', '#a8a29e', '#d6d3d1', '#e7e5e4'];
const STATUS_COLORS = {
  'TO_ORDER': '#78716c',
  'PI': '#d97706',
  'SHIPPED': '#3b82f6',
  'ARRIVED': '#10b981'
};

const DashboardView: React.FC<DashboardViewProps> = ({ articles = [], factures = [], onNavigate }) => {
  const stats = useMemo(() => {
    const safeArticles = articles || [];
    const safeFactures = factures || [];

    let totalVal = 0;
    let totalCbm = 0;
    let inTransitVal = 0;
    let arrivedVal = 0;

    safeArticles.forEach(art => {
      const val = (Number(art.quantity) || 0) * (Number(art.purchasePricePerUnit) || 0);
      const cbm = Number(art.cubicMeasurement) || 0;
      
      totalVal += val;
      totalCbm += cbm;

      if (art.status === 'SHIPPED') inTransitVal += val;
      if (art.status === 'ARRIVED') arrivedVal += val;
    });

    return {
      totalVal,
      totalCbm,
      inTransitVal,
      arrivedVal,
      totalFactures: safeFactures.length,
      pendingCount: safeArticles.filter(a => a.status === 'TO_ORDER' || a.status === 'PI').length
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
      .slice(0, 8); // Top 8 categories
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
    <div className="space-y-6">
      {/* Header Summary */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card className="border-none shadow-sm bg-white">
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs font-medium text-stone-500 uppercase mb-1">Valeur Totale</p>
                <h3 className="text-2xl font-bold text-stone-900">{stats.totalVal.toLocaleString()} €</h3>
              </div>
              <div className="p-3 bg-amber-50 rounded-full">
                <DollarSign className="w-5 h-5 text-amber-600" />
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="border-none shadow-sm bg-white">
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs font-medium text-stone-500 uppercase mb-1">Volume Stock</p>
                <h3 className="text-2xl font-bold text-stone-900">{stats.totalCbm.toFixed(2)} m³</h3>
              </div>
              <div className="p-3 bg-blue-50 rounded-full">
                <Box className="w-5 h-5 text-blue-600" />
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="border-none shadow-sm bg-white">
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs font-medium text-stone-500 uppercase mb-1">Valeur en Transit</p>
                <h3 className="text-2xl font-bold text-stone-900">{stats.inTransitVal.toLocaleString()} €</h3>
              </div>
              <div className="p-3 bg-indigo-50 rounded-full">
                <Truck className="w-5 h-5 text-indigo-600" />
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="border-none shadow-sm bg-white">
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs font-medium text-stone-500 uppercase mb-1">Factures Impor.</p>
                <h3 className="text-2xl font-bold text-stone-900">{stats.totalFactures}</h3>
              </div>
              <div className="p-3 bg-emerald-50 rounded-full">
                <FileText className="w-5 h-5 text-emerald-600" />
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Analytics Charts */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card className="border-none shadow-sm bg-white">
          <CardHeader>
            <CardTitle className="text-sm font-bold uppercase text-stone-500 flex items-center gap-2">
              <TrendingUp className="w-4 h-4" /> Répartition par Catégorie (€)
            </CardTitle>
          </CardHeader>
          <CardContent className="h-[350px]">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={valueData}
                  cx="50%"
                  cy="50%"
                  innerRadius={70}
                  outerRadius={100}
                  paddingAngle={5}
                  dataKey="value"
                >
                  {valueData.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip 
                  formatter={(value: number) => [`${value.toLocaleString()} €`, 'Valeur']}
                  contentStyle={{ border: 'none', borderRadius: '8px', boxShadow: '0 4px 12px rgba(0,0,0,0.1)' }}
                />
                <Legend iconType="circle" />
              </PieChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        <Card className="border-none shadow-sm bg-white">
          <CardHeader>
            <CardTitle className="text-sm font-bold uppercase text-stone-500 flex items-center gap-2">
              <History className="w-4 h-4" /> Valeur par État Logistique (€)
            </CardTitle>
          </CardHeader>
          <CardContent className="h-[350px]">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={statusValueData} layout="vertical" margin={{ left: 40, right: 40 }}>
                <CartesianGrid strokeDasharray="3 3" horizontal={true} vertical={false} stroke="#f5f5f5" />
                <XAxis type="number" hide />
                <YAxis 
                  dataKey="name" 
                  type="category" 
                  axisLine={false} 
                  tickLine={false}
                  width={100}
                  style={{ fontSize: '12px', fontWeight: 500 }}
                />
                <Tooltip 
                  formatter={(value: number) => [`${value.toLocaleString()} €`, 'Valeur']}
                  cursor={{ fill: '#f5f5f5' }}
                  contentStyle={{ border: 'none', borderRadius: '8px', boxShadow: '0 4px 12px rgba(0,0,0,0.1)' }}
                />
                <Bar 
                  dataKey="value" 
                  radius={[0, 4, 4, 0]} 
                  barSize={30}
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

      {/* Overview Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <Card className="border-none shadow-sm bg-white">
          <CardHeader className="pb-2 border-b">
            <CardTitle className="text-sm font-bold uppercase text-stone-500">Alertes Commandes</CardTitle>
          </CardHeader>
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-3xl font-bold text-stone-900">{stats.pendingCount}</p>
                <p className="text-xs text-stone-500 mt-1">Articles en attente ou production</p>
              </div>
              <div className="h-12 w-12 bg-amber-100 rounded-full flex items-center justify-center">
                <Factory className="w-6 h-6 text-amber-600" />
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="border-none shadow-sm bg-white">
          <CardHeader className="pb-2 border-b">
            <CardTitle className="text-sm font-bold uppercase text-stone-500">Flux de Valeur</CardTitle>
          </CardHeader>
          <CardContent className="p-6">
            <div className="space-y-4">
              <div>
                <div className="flex justify-between text-xs mb-1">
                  <span className="text-stone-500">Stock Arrivé</span>
                  <span className="font-bold">{Math.round((stats.arrivedVal / stats.totalVal) * 100 || 0)}%</span>
                </div>
                <div className="h-2 w-full bg-stone-100 rounded-full overflow-hidden">
                  <div 
                    className="h-full bg-emerald-500 transition-all duration-500" 
                    style={{ width: `${(stats.arrivedVal / stats.totalVal) * 100 || 0}%` }}
                  />
                </div>
              </div>
              <div>
                <div className="flex justify-between text-xs mb-1">
                  <span className="text-stone-500">Stock en Transit</span>
                  <span className="font-bold">{Math.round((stats.inTransitVal / stats.totalVal) * 100 || 0)}%</span>
                </div>
                <div className="h-2 w-full bg-stone-100 rounded-full overflow-hidden">
                  <div 
                    className="h-full bg-blue-500 transition-all duration-500" 
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