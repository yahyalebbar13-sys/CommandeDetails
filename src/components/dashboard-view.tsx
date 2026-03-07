'use client';

import React, { useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { 
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, 
  Cell, Radar, RadarChart, PolarGrid, PolarAngleAxis, PolarRadiusAxis
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
  AlertTriangle,
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
    const depMap: Record<string, Record<string, number>> = {};

    safeArticles.forEach(art => {
      const gId = art.generalCategoryId || 'Non classé';
      const sup = art.supplierId || 'Inconnu';
      const val = (Number(art.quantity) || 0) * (Number(art.purchasePricePerUnit) || 0);
      const catName = art.categoryId || 'Non classé';

      const gName = generalCategories.find(gc => gc.id === gId)?.name || gId;

      groupMap[gName] = (groupMap[gName] || 0) + val;

      if (!depMap[catName]) depMap[catName] = {};
      depMap[catName][sup] = (depMap[catName][sup] || 0) + val;
    });

    const groupValueData = Object.entries(groupMap)
      .map(([name, value]) => ({ name, value }))
      .sort((a, b) => b.value - a.value);

    const dependencyData = Object.entries(depMap)
      .map(([category, sups]) => {
        const entries = Object.entries(sups);
        const total = entries.reduce((s, [_, v]) => s + v, 0);
        
        let maxVal = 0;
        let dominantSupplier = 'N/A';
        entries.forEach(([sup, val]) => {
          if (val > maxVal) {
            maxVal = val;
            dominantSupplier = sup;
          }
        });

        const concentration = total > 0 ? (maxVal / total) * 100 : 0;
        
        let level = 'Faible';
        let color = 'text-emerald-600';
        if (concentration > 70) { level = 'Forte'; color = 'text-red-600'; }
        else if (concentration > 40) { level = 'Moyenne'; color = 'text-amber-600'; }

        return { 
          category, 
          concentration: Number(concentration.toFixed(1)),
          dominantSupplier,
          level,
          color,
          fullMark: 100 
        };
      })
      .sort((a, b) => b.concentration - a.concentration);

    return { 
      groupValueData, 
      dependencyData
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

      <div className="grid grid-cols-1 gap-8">
        <Card className="border-none shadow-sm bg-white">
          <CardHeader className="py-6 border-b border-stone-50">
            <CardTitle className="text-[11px] font-black uppercase text-stone-500 flex items-center gap-2 tracking-[0.2em]">
              <Layers className="w-4 h-4 text-amber-500" /> Capital par Pôle Logistique (Groupes)
            </CardTitle>
          </CardHeader>
          <CardContent className="p-8">
            <div className="h-[400px] w-full">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={analyticsData.groupValueData} layout="vertical" margin={{ left: 100 }}>
                  <CartesianGrid strokeDasharray="3 3" horizontal={true} vertical={false} stroke="#f1f1f1" />
                  <XAxis type="number" hide />
                  <YAxis dataKey="name" type="category" axisLine={false} tickLine={false} width={150} style={{ fontSize: '10px', fontWeight: '900', textTransform: 'uppercase', fill: '#1E293B' }} />
                  <Tooltip cursor={{ fill: '#f8fafc' }} formatter={(val: number) => [`${val.toLocaleString()} €`]} contentStyle={{ border: 'none', borderRadius: '12px', boxShadow: '0 10px 30px rgba(0,0,0,0.1)', fontWeight: 'bold' }} />
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

      <Card className="border-none shadow-sm bg-white">
        <CardHeader className="py-6 border-b border-stone-50">
          <CardTitle className="text-[11px] font-black uppercase text-stone-500 flex items-center gap-2 tracking-[0.2em]">
            <ShieldAlert className="w-4 h-4 text-emerald-500" /> Radar de Dépendance Logistique (Risque %)
          </CardTitle>
        </CardHeader>
        <CardContent className="p-8">
          <div className="h-auto w-full flex flex-col xl:flex-row items-center gap-12">
            <div className="flex-1 h-[450px] w-full">
              <ResponsiveContainer width="100%" height="100%">
                <RadarChart cx="50%" cy="50%" outerRadius="80%" data={analyticsData.dependencyData.slice(0, 12)}>
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
                    formatter={(val: number, name: string, props: any) => [
                      `${val}% (${props.payload.dominantSupplier})`, 
                      'Concentration'
                    ]}
                  />
                </RadarChart>
              </ResponsiveContainer>
            </div>
            
            <div className="w-full xl:w-96 space-y-6">
              <div className="p-6 bg-stone-50 rounded-[2rem] border border-stone-100">
                <p className="text-[10px] font-black text-stone-900 uppercase tracking-[0.2em] mb-6 flex items-center gap-2">
                  <AlertTriangle className="w-4 h-4 text-red-500" /> Alertes de Concentration
                </p>
                <div className="space-y-4 max-h-[350px] overflow-y-auto pr-2 custom-scrollbar">
                  {analyticsData.dependencyData.filter(d => d.concentration > 40).map((d) => (
                    <div key={d.category} className="flex flex-col border-b border-stone-200/50 pb-3 last:border-0">
                      <div className="flex justify-between items-center mb-1">
                        <span className="text-[9px] font-black text-stone-900 uppercase tracking-tighter truncate w-2/3">{d.category}</span>
                        <span className={`text-[10px] font-black ${d.color}`}>{d.concentration}%</span>
                      </div>
                      <div className="flex justify-between items-center">
                        <span className="text-[8px] font-bold text-stone-400 uppercase tracking-widest flex items-center gap-1">
                          <Users className="w-2 h-2" /> {d.dominantSupplier}
                        </span>
                        <span className={`text-[8px] font-black uppercase tracking-widest bg-white px-2 py-0.5 rounded border border-stone-100 shadow-sm`}>
                          Risque {d.level}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
              <p className="text-[9px] text-stone-400 font-bold uppercase leading-relaxed italic px-2">
                * Le risque est calculé sur la part de valeur détenue par le fournisseur principal au sein de la catégorie.
              </p>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
};

export default DashboardView;