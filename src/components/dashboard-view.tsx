'use client';

import React, { useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { 
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, 
  Cell, LineChart, Line, PieChart, Pie, Legend
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
  Layers,
  Truck,
  CalendarDays
} from 'lucide-react';
import { ViewType, GeneralCategory } from '@/lib/types';
import { Badge } from '@/components/ui/badge';

interface DashboardViewProps {
  articles: any[];
  factures: any[];
  generalCategories: GeneralCategory[];
  onNavigate: (view: ViewType) => void;
  onNavigateToFacture?: (factureId: string) => void;
}

const COLORS = ['#CC8626', '#1E293B', '#3B82F6', '#10B981', '#6366F1', '#F43F5E', '#8B5CF6', '#EC4899'];

const DashboardView: React.FC<DashboardViewProps> = ({ articles = [], factures = [], generalCategories = [], onNavigate, onNavigateToFacture }) => {
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

  const nextArrivingFacture = useMemo(() => {
    const now = new Date();
    now.setHours(0, 0, 0, 0);
    
    const futureFactures = [...safeFactures]
      .filter(f => f.arrivalDate && new Date(f.arrivalDate) >= now)
      .sort((a, b) => new Date(a.arrivalDate).getTime() - new Date(b.arrivalDate).getTime());
    
    if (futureFactures.length === 0) return null;
    
    const facture = futureFactures[0];
    const items = safeArticles.filter(a => a.factureId === facture.id);
    
    const summary: Record<string, { qty: number, unit: string }> = {};
    items.forEach(item => {
      const cat = item.categoryId || 'DIVERS';
      if (!summary[cat]) summary[cat] = { qty: 0, unit: item.unitOfMeasure || '' };
      summary[cat].qty += Number(item.quantity) || 0;
    });
    
    return {
      ...facture,
      categorySummary: Object.entries(summary).map(([name, data]) => ({ name, ...data }))
    };
  }, [safeFactures, safeArticles]);

  const analyticsData = useMemo(() => {
    const groupMap: Record<string, number> = {};
    const supplierMap: Record<string, number> = {};
    const evolutionMap: Record<string, number> = {};

    safeArticles.forEach(art => {
      const gId = art.generalCategoryId || 'Non classé';
      const sup = art.supplierId || 'Inconnu';
      const val = (Number(art.quantity) || 0) * (Number(art.purchasePricePerUnit) || 0);
      const date = art.arrivalDate || art.orderDate || (art.createdAt ? new Date(art.createdAt.seconds * 1000).toISOString().split('T')[0] : null);

      const gName = generalCategories.find(gc => gc.id === gId)?.name || gId;

      groupMap[gName] = (groupMap[gName] || 0) + val;
      supplierMap[sup] = (supplierMap[sup] || 0) + val;
      if (date) {
        // Group by Month (YYYY-MM)
        const month = date.substring(0, 7);
        evolutionMap[month] = (evolutionMap[month] || 0) + val;
      }
    });

    const groupValueData = Object.entries(groupMap)
      .map(([name, value]) => ({ name, value }))
      .sort((a, b) => b.value - a.value);

    const supplierData = Object.entries(supplierMap)
      .map(([name, value]) => ({ name, value }))
      .sort((a, b) => b.value - a.value);

    const evolutionData = Object.entries(evolutionMap)
      .map(([date, value]) => ({ date, value }))
      .sort((a, b) => a.date.localeCompare(b.date));

    return { 
      groupValueData, 
      supplierData,
      evolutionData
    };
  }, [safeArticles, generalCategories]);

  return (
    <div className="space-y-8 animate-in fade-in duration-500">
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

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card className="border-none shadow-sm bg-white overflow-hidden group">
          <div className="h-1 w-full bg-stone-900" />
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-[10px] font-bold text-stone-400 uppercase tracking-widest mb-1">Valeur Portefeuille</p>
                <h3 className="text-2xl font-black text-stone-900">{stats.totalVal.toLocaleString()} $</h3>
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
                <h3 className="text-2xl font-black text-stone-900">{stats.avgEfficiency.toFixed(2)} <span className="text-xs text-stone-400">$/m³</span></h3>
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

      {nextArrivingFacture && (
        <Card className="border-none shadow-xl bg-stone-900 text-white rounded-[2rem] overflow-hidden relative group">
          <div className="absolute top-0 right-0 w-64 h-64 bg-amber-500/10 rounded-full -translate-y-1/2 translate-x-1/2 blur-3xl group-hover:bg-amber-500/20 transition-all duration-700" />
          <CardHeader className="pb-4 border-b border-white/5">
            <div className="flex justify-between items-center">
              <CardTitle className="text-[11px] font-black uppercase text-amber-500 flex items-center gap-3 tracking-[0.2em]">
                <Truck className="w-5 h-5" /> Prochain Arrivage Imminent
              </CardTitle>
              <Badge className="bg-blue-500 text-white border-none animate-pulse font-black text-[10px] px-3 py-1">FLUX ENTRANT</Badge>
            </div>
          </CardHeader>
          <CardContent className="p-8">
            <div className="flex flex-col lg:flex-row gap-12 items-center">
              <div className="flex-1 space-y-6 w-full">
                <div className="flex flex-col md:flex-row gap-8">
                  <div>
                    <p className="text-[8px] font-black text-stone-500 uppercase tracking-widest mb-1.5">N° Facture / Dossier</p>
                    <p className="text-3xl font-black tracking-tighter uppercase">{nextArrivingFacture.id}</p>
                  </div>
                  <div className="h-10 w-px bg-white/10 hidden md:block" />
                  <div>
                    <p className="text-[8px] font-black text-stone-500 uppercase tracking-widest mb-1.5">Date d'Arrivée Port</p>
                    <p className="text-3xl font-black tracking-tighter text-blue-400 flex items-center gap-2">
                      <CalendarDays className="w-6 h-6" /> {nextArrivingFacture.arrivalDate}
                    </p>
                  </div>
                  <div className="h-10 w-px bg-white/10 hidden md:block" />
                  <div>
                    <p className="text-[8px] font-black text-stone-500 uppercase tracking-widest mb-1.5">Fournisseur</p>
                    <p className="text-2xl font-black text-stone-300 uppercase">{nextArrivingFacture.supplierId || nextArrivingFacture.supplier}</p>
                  </div>
                </div>

                <div className="pt-8 border-t border-white/5">
                  <p className="text-[9px] font-black text-stone-500 uppercase tracking-[0.2em] mb-4">Contenu du Manifeste (Résumé)</p>
                  <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-5 gap-3">
                    {nextArrivingFacture.categorySummary.map((item, idx) => (
                      <div key={idx} className="bg-white/5 border border-white/10 p-3 rounded-xl hover:bg-white/10 transition-colors">
                        <p className="text-[8px] font-black text-stone-400 uppercase truncate mb-1">{item.name}</p>
                        <p className="text-sm font-black text-white">{item.qty.toLocaleString()} <span className="text-[9px] text-stone-500 font-bold">{item.unit}</span></p>
                      </div>
                    ))}
                  </div>
                </div>
              </div>

              <div className="w-full lg:w-48 flex justify-center lg:justify-end">
                <Button 
                  onClick={() => onNavigateToFacture ? onNavigateToFacture(nextArrivingFacture.id) : onNavigate('factures')}
                  variant="outline" 
                  className="h-16 w-16 rounded-2xl border-white/10 bg-white/5 hover:bg-white/10 hover:border-white/30 text-white transition-all group/btn"
                >
                  <ArrowRight className="w-8 h-8 group-hover/btn:translate-x-1 transition-transform" />
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        <Card className="border-none shadow-sm bg-white">
          <CardHeader className="py-6 border-b border-stone-50">
            <CardTitle className="text-[11px] font-black uppercase text-stone-500 flex items-center gap-2 tracking-[0.2em]">
              <TrendingUp className="w-4 h-4 text-amber-500" /> Évolution Mensuelle des Importations ($)
            </CardTitle>
          </CardHeader>
          <CardContent className="p-8">
            <div className="h-[300px] w-full">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={analyticsData.evolutionData}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f1f1" />
                  <XAxis dataKey="date" axisLine={false} tickLine={false} style={{ fontSize: '9px', fontWeight: '900' }} />
                  <YAxis axisLine={false} tickLine={false} style={{ fontSize: '9px', fontWeight: '900' }} />
                  <Tooltip contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 10px 30px rgba(0,0,0,0.1)', fontWeight: 'bold' }} />
                  <Line type="monotone" dataKey="value" stroke="#CC8626" strokeWidth={3} dot={{ r: 4, fill: '#CC8626' }} activeDot={{ r: 6 }} />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>

        <Card className="border-none shadow-sm bg-white">
          <CardHeader className="py-6 border-b border-stone-50">
            <CardTitle className="text-[11px] font-black uppercase text-stone-500 flex items-center gap-2 tracking-[0.2em]">
              <Users className="w-4 h-4 text-blue-500" /> Répartition par Fournisseur (%)
            </CardTitle>
          </CardHeader>
          <CardContent className="p-8">
            <div className="h-[300px] w-full">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={analyticsData.supplierData}
                    cx="50%"
                    cy="50%"
                    innerRadius={60}
                    outerRadius={80}
                    paddingAngle={5}
                    dataKey="value"
                  >
                    {analyticsData.supplierData.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip formatter={(val: number) => [`${val.toLocaleString()} $`]} />
                  <Legend verticalAlign="bottom" height={36} iconType="circle" wrapperStyle={{ fontSize: '9px', fontWeight: '900', textTransform: 'uppercase' }} />
                </PieChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>
      </div>

      <Card className="border-none shadow-sm bg-white">
        <CardHeader className="py-6 border-b border-stone-50">
          <CardTitle className="text-[11px] font-black uppercase text-stone-500 flex items-center gap-2 tracking-[0.2em]">
            <Layers className="w-4 h-4 text-stone-900" /> Capital par Pôle Logistique ($)
          </CardTitle>
        </CardHeader>
        <CardContent className="p-8">
          <div className="h-[400px] w-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={analyticsData.groupValueData} layout="vertical" margin={{ left: 100 }}>
                <CartesianGrid strokeDasharray="3 3" horizontal={true} vertical={false} stroke="#f1f1f1" />
                <XAxis type="number" hide />
                <YAxis dataKey="name" type="category" axisLine={false} tickLine={false} width={150} style={{ fontSize: '10px', fontWeight: '900', textTransform: 'uppercase', fill: '#1E293B' }} />
                <Tooltip cursor={{ fill: '#f8fafc' }} formatter={(val: number) => [`${val.toLocaleString()} $`]} contentStyle={{ border: 'none', borderRadius: '12px', boxShadow: '0 10px 30px rgba(0,0,0,0.1)', fontWeight: 'bold' }} />
                <Bar dataKey="value" radius={[0, 4, 4, 0]} barSize={40}>
                  {analyticsData.groupValueData.map((entry, index) => (
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