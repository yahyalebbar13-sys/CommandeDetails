'use client';

import React, { useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { 
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, 
  Cell, Legend, Radar, RadarChart, PolarGrid, PolarAngleAxis, PolarRadiusAxis
} from 'recharts';
import { 
  DollarSign,
  Box,
  FileText,
  Anchor,
  ClipboardList,
  Factory,
  ArrowRight,
  TrendingUp,
  Users,
  ShieldAlert,
  Activity
} from 'lucide-react';
import { ViewType } from '@/lib/types';

interface DashboardViewProps {
  articles: any[];
  factures: any[];
  onNavigate: (view: ViewType) => void;
}

const COLORS = ['#CC8626', '#1E293B', '#3B82F6', '#10B981', '#6366F1', '#F43F5E', '#8B5CF6', '#EC4899'];

const DashboardView: React.FC<DashboardViewProps> = ({ articles = [], factures = [], onNavigate }) => {
  const safeArticles = articles || [];
  const safeFactures = factures || [];

  const stats = useMemo(() => {
    let totalVal = 0;
    let totalCbm = 0;
    let totalFreight = 0;

    const toOrderArticles = safeArticles.filter(a => a.status === 'TO_ORDER');
    const piArticles = safeArticles.filter(a => a.status === 'PI');

    const totalToOrderQty = toOrderArticles.reduce((s, a) => s + (Number(a.quantity) || 0), 0);
    const totalPiQty = piArticles.reduce((s, a) => s + (Number(a.quantity) || 0), 0);

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
      totalToOrderQty,
      piCount: piArticles.length,
      totalPiQty,
      avgEfficiency
    };
  }, [safeArticles, safeFactures]);

  const analyticsData = useMemo(() => {
    const catMap: Record<string, number> = {};
    const supMap: Record<string, number> = {};
    const depMap: Record<string, Record<string, number>> = {};

    safeArticles.forEach(art => {
      const cat = art.categoryId || 'Non classé';
      const sup = art.supplierId || 'Inconnu';
      const val = (Number(art.quantity) || 0) * (Number(art.purchasePricePerUnit) || 0);

      catMap[cat] = (catMap[cat] || 0) + val;
      supMap[sup] = (supMap[sup] || 0) + val;

      if (!depMap[cat]) depMap[cat] = {};
      depMap[cat][sup] = (depMap[cat][sup] || 0) + val;
    });

    const categoryData = Object.entries(catMap)
      .map(([name, value]) => ({ name, value }))
      .sort((a, b) => b.value - a.value)
      .slice(0, 10);

    const supplierValueData = Object.entries(supMap)
      .map(([name, value]) => ({ name, value }))
      .sort((a, b) => b.value - a.value);

    // Dependency Analysis: Qualitative (Low/Medium/Strong)
    const dependencyData = Object.entries(depMap)
      .map(([category, sups]) => {
        const values = Object.values(sups) as number[];
        const total = values.reduce((s, v) => s + v, 0);
        const maxVal = Math.max(...values);
        const concentration = total > 0 ? (maxVal / total) * 100 : 0;
        
        let level = 'Faible';
        if (concentration > 70) level = 'Forte';
        else if (concentration > 40) level = 'Moyenne';

        return { 
          category, 
          concentration: Number(concentration.toFixed(1)),
          level,
          fullMark: 100 
        };
      })
      .sort((a, b) => b.concentration - a.concentration)
      .slice(0, 8);

    return { 
      categoryData, 
      supplierValueData, 
      dependencyData
    };
  }, [safeArticles]);

  return (
    <div className="space-y-8 animate-in fade-in duration-500">
      {/* Quick Nav Indicators with mini volume recalls */}
      <div className="flex flex-wrap gap-4">
        <button 
          onClick={() => onNavigate('to-order')}
          className="bg-white border border-stone-200 rounded-2xl p-4 flex items-center gap-4 hover:border-amber-500 transition-all shadow-sm group min-w-[240px]"
        >
          <div className="p-2 bg-stone-100 rounded-xl group-hover:bg-amber-100 transition-colors">
            <ClipboardList className="w-5 h-5 text-stone-500 group-hover:text-amber-600" />
          </div>
          <div className="text-left">
            <p className="text-[9px] font-black text-stone-400 uppercase tracking-[0.2em]">Besoins Identifiés</p>
            <p className="text-xl font-black text-stone-900 leading-none mt-1">{stats.toOrderCount} <span className="text-[10px] text-stone-400 font-bold">RAPPELS</span></p>
            <p className="text-[10px] text-amber-600 font-black mt-1">VOL: {stats.totalToOrderQty.toLocaleString()}</p>
          </div>
          <ArrowRight className="w-4 h-4 text-stone-200 group-hover:text-amber-500 ml-auto" />
        </button>

        <button 
          onClick={() => onNavigate('pending')}
          className="bg-white border border-stone-200 rounded-2xl p-4 flex items-center gap-4 hover:border-amber-500 transition-all shadow-sm group min-w-[240px]"
        >
          <div className="p-2 bg-stone-100 rounded-xl group-hover:bg-amber-100 transition-colors">
            <Factory className="w-5 h-5 text-stone-500 group-hover:text-amber-600" />
          </div>
          <div className="text-left">
            <p className="text-[9px] font-black text-stone-400 uppercase tracking-[0.2em]">En Production</p>
            <p className="text-xl font-black text-stone-900 leading-none mt-1">{stats.piCount} <span className="text-[10px] text-stone-400 font-bold">PI LNC</span></p>
            <p className="text-[10px] text-amber-600 font-black mt-1">VOL: {stats.totalPiQty.toLocaleString()}</p>
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

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        {/* Category Distribution Chart - Vertical Bar */}
        <Card className="border-none shadow-sm bg-white">
          <CardHeader className="py-6 border-b border-stone-50">
            <CardTitle className="text-[11px] font-black uppercase text-stone-500 flex items-center gap-2 tracking-[0.2em]">
              <TrendingUp className="w-4 h-4 text-amber-500" /> Capital par Catégorie (€)
            </CardTitle>
          </CardHeader>
          <CardContent className="p-8">
            <div className="h-[400px] w-full">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={analyticsData.categoryData} layout="vertical" margin={{ left: 40 }}>
                  <CartesianGrid strokeDasharray="3 3" horizontal={true} vertical={false} stroke="#f1f1f1" />
                  <XAxis type="number" hide />
                  <YAxis dataKey="name" type="category" axisLine={false} tickLine={false} width={120} style={{ fontSize: '9px', fontWeight: '900', textTransform: 'uppercase', fill: '#64748b' }} />
                  <Tooltip cursor={{ fill: '#f8fafc' }} formatter={(val: number) => [`${val.toLocaleString()} €`]} contentStyle={{ border: 'none', borderRadius: '12px', boxShadow: '0 10px 30px rgba(0,0,0,0.1)', fontWeight: 'bold' }} />
                  <Bar dataKey="value" radius={[0, 4, 4, 0]} barSize={24}>
                    {analyticsData.categoryData.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>

        {/* Supplier Value Chart - Vertical Bar */}
        <Card className="border-none shadow-sm bg-white">
          <CardHeader className="py-6 border-b border-stone-50">
            <CardTitle className="text-[11px] font-black uppercase text-stone-500 flex items-center gap-2 tracking-[0.2em]">
              <Users className="w-4 h-4 text-blue-500" /> Valeur Totale par Fournisseur (€)
            </CardTitle>
          </CardHeader>
          <CardContent className="p-8">
            <div className="h-[400px] w-full">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={analyticsData.supplierValueData} layout="vertical" margin={{ left: 40 }}>
                  <CartesianGrid strokeDasharray="3 3" horizontal={true} vertical={false} stroke="#f1f1f1" />
                  <XAxis type="number" hide />
                  <YAxis dataKey="name" type="category" axisLine={false} tickLine={false} width={120} style={{ fontSize: '9px', fontWeight: '900', textTransform: 'uppercase', fill: '#64748b' }} />
                  <Tooltip cursor={{ fill: '#f8fafc' }} formatter={(val: number) => [`${val.toLocaleString()} €`]} contentStyle={{ border: 'none', borderRadius: '12px', boxShadow: '0 10px 30px rgba(0,0,0,0.1)', fontWeight: 'bold' }} />
                  <Bar dataKey="value" fill="#1E293B" radius={[0, 4, 4, 0]} barSize={24} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Dependency Analysis - Radar Chart (Spider Chart) */}
      <Card className="border-none shadow-sm bg-white">
        <CardHeader className="py-6 border-b border-stone-50">
          <CardTitle className="text-[11px] font-black uppercase text-stone-500 flex items-center gap-2 tracking-[0.2em]">
            <ShieldAlert className="w-4 h-4 text-emerald-500" /> Radar de Dépendance Logistique (Risque %)
          </CardTitle>
        </CardHeader>
        <CardContent className="p-8">
          <div className="h-[450px] w-full flex flex-col md:flex-row items-center gap-8">
            <div className="flex-1 h-full w-full">
              <ResponsiveContainer width="100%" height="100%">
                <RadarChart cx="50%" cy="50%" outerRadius="80%" data={analyticsData.dependencyData}>
                  <PolarGrid stroke="#e2e8f0" />
                  <PolarAngleAxis dataKey="category" tick={{ fontSize: 9, fontWeight: 900, fill: '#64748b' }} />
                  <PolarRadiusAxis angle={30} domain={[0, 100]} tick={{ fontSize: 8 }} />
                  <Radar
                    name="Niveau de Dépendance"
                    dataKey="concentration"
                    stroke="#CC8626"
                    fill="#CC8626"
                    fillOpacity={0.5}
                  />
                  <Tooltip 
                    contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 10px 30px rgba(0,0,0,0.1)', fontWeight: 'bold' }} 
                    formatter={(val: number) => [`${val}%`, 'Concentration Fournisseur']}
                  />
                </RadarChart>
              </ResponsiveContainer>
            </div>
            <div className="w-full md:w-64 space-y-4">
              <div className="p-4 bg-stone-50 rounded-2xl border border-stone-100">
                <p className="text-[10px] font-black text-stone-900 uppercase tracking-widest mb-4 flex items-center gap-2">
                  <Activity className="w-3 h-3 text-amber-500" /> Échelle de Risque
                </p>
                <div className="space-y-3">
                  <div className="flex justify-between items-center">
                    <span className="text-[9px] font-black text-red-600 uppercase">Forte Dépendance</span>
                    <span className="text-[9px] font-black text-stone-400">&gt; 70%</span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-[9px] font-black text-amber-600 uppercase">Risque Moyen</span>
                    <span className="text-[9px] font-black text-stone-400">40-70%</span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-[9px] font-black text-emerald-600 uppercase">Flux Diversifié</span>
                    <span className="text-[9px] font-black text-stone-400">&lt; 40%</span>
                  </div>
                </div>
              </div>
              <p className="text-[9px] text-stone-400 font-bold uppercase leading-relaxed italic">
                Ce radar mesure la concentration de vos achats. Une pointe vers l'extérieur indique qu'un seul fournisseur domine la catégorie.
              </p>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
};

export default DashboardView;
