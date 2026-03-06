'use client';

import React, { useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { 
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, 
  Cell
} from 'recharts';
import { 
  DollarSign,
  Box,
  FileText,
  Anchor,
  ClipboardList,
  Factory,
  ArrowRight,
  TrendingUp
} from 'lucide-react';
import { ViewType } from '@/lib/types';

interface DashboardViewProps {
  articles: any[];
  factures: any[];
  onNavigate: (view: ViewType) => void;
}

const COLORS = ['#CC8626', '#1E293B', '#334155', '#475569', '#64748B', '#94A3B8'];

const DashboardView: React.FC<DashboardViewProps> = ({ articles = [], factures = [], onNavigate }) => {
  const safeArticles = articles || [];
  const safeFactures = factures || [];

  const stats = useMemo(() => {
    let totalVal = 0;
    let totalCbm = 0;
    let totalFreight = 0;

    const toOrderArticles = safeArticles.filter(a => a.status === 'TO_ORDER');
    const piArticles = safeArticles.filter(a => a.status === 'PI');

    safeArticles.forEach(art => {
      const val = (Number(art.quantity) || 0) * (Number(art.purchasePricePerUnit) || 0);
      const cbm = Number(art.cubicMeasurement) || 0;
      totalVal += val;
      totalCbm += cbm;
    });

    safeFactures.forEach(f => {
      totalFreight += (Number(f.freightCost) || Number(f.freight) || 0);
    });

    const avgEfficiency = totalCbm > 0 ? totalFreight / totalCbm : 0;

    return {
      totalVal,
      totalCbm,
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
      .slice(0, 10); // Top 10 categories
  }, [safeArticles]);

  return (
    <div className="space-y-8 animate-in fade-in duration-500">
      {/* Quick Nav Indicators */}
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

      {/* Main Analytics: Category Distribution */}
      <Card className="border-none shadow-sm bg-white">
        <CardHeader className="py-6 border-b border-stone-50">
          <CardTitle className="text-[11px] font-black uppercase text-stone-500 flex items-center gap-2 tracking-[0.2em]">
            <TrendingUp className="w-4 h-4 text-amber-500" /> Répartition du Capital par Catégorie (€)
          </CardTitle>
        </CardHeader>
        <CardContent className="p-8">
          <div className="h-[500px] w-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart 
                data={categoryData} 
                layout="vertical" 
                margin={{ top: 5, right: 30, left: 40, bottom: 5 }}
              >
                <CartesianGrid strokeDasharray="3 3" horizontal={true} vertical={false} stroke="#f1f1f1" />
                <XAxis type="number" hide />
                <YAxis 
                  dataKey="name" 
                  type="category" 
                  axisLine={false} 
                  tickLine={false} 
                  width={150}
                  style={{ fontSize: '10px', fontWeight: '900', textTransform: 'uppercase', fill: '#64748b' }}
                />
                <Tooltip 
                  cursor={{ fill: '#f8fafc' }}
                  formatter={(val: number) => [`${val.toLocaleString()} €`, 'Valeur']}
                  contentStyle={{ border: 'none', borderRadius: '12px', boxShadow: '0 10px 30px rgba(0,0,0,0.1)', fontWeight: 'bold' }}
                />
                <Bar dataKey="value" radius={[0, 6, 6, 0]} barSize={32}>
                  {categoryData.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </CardContent>
      </Card>
    </div>
  );
};

export default DashboardView;