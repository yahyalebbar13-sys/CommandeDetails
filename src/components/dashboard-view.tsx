"use client";

import React, { useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { 
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, 
  Cell, PieChart, Pie, Legend, ResponsiveContainer as RespCont
} from 'recharts';
import { 
  Package, 
  FileText, 
  Factory, 
  DollarSign,
  Box,
  Truck,
  TrendingUp
} from 'lucide-react';

interface DashboardViewProps {
  articles: any[];
  factures: any[];
  onNavigate: (view: string) => void;
}

const COLORS = ['#d97706', '#059669', '#2563eb', '#7c3aed', '#db2777', '#4b5563'];

export default function DashboardView({ articles = [], factures = [], onNavigate }: DashboardViewProps) {
  
  const stats = useMemo(() => {
    const safeArticles = articles || [];
    const safeFactures = factures || [];

    let totalVal = 0;
    let totalCbm = 0;
    let inTransitCbm = 0;
    let inTransitVal = 0;

    safeArticles.forEach(art => {
      const val = (Number(art.quantity) || 0) * (Number(art.purchasePricePerUnit) || 0);
      const cbm = Number(art.cubicMeasurement) || 0;
      
      totalVal += val;
      totalCbm += cbm;

      if (art.status === 'SHIPPED') {
        inTransitCbm += cbm;
        inTransitVal += val;
      }
    });

    return {
      totalVal,
      totalCbm,
      inTransitCbm,
      inTransitVal,
      totalFactures: safeFactures.length,
      pendingOrders: safeArticles.filter(a => a.status === 'TO_ORDER').length
    };
  }, [articles, factures]);

  const categoryValueData = useMemo(() => {
    const safeArticles = articles || [];
    const data: Record<string, number> = {};
    safeArticles.forEach(art => {
      const cat = art.generalCategoryId || 'Autres';
      const val = (Number(art.quantity) || 0) * (Number(art.purchasePricePerUnit) || 0);
      data[cat] = (data[cat] || 0) + val;
    });
    return Object.entries(data).map(([name, value]) => ({ name, value }));
  }, [articles]);

  return (
    <div className="space-y-8 animate-in fade-in duration-500">
      <div className="flex flex-col gap-1">
        <h2 className="text-2xl font-bold text-stone-800">Tableau de bord</h2>
        <p className="text-stone-500 text-sm">Vue globale de l'activité et des stocks.</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card className="border border-stone-200 shadow-sm">
          <CardContent className="p-5">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-[11px] font-bold text-stone-400 uppercase tracking-wider">Valeur Totale</p>
                <h3 className="text-2xl font-bold text-stone-900 mt-1">{stats.totalVal.toLocaleString()} €</h3>
              </div>
              <div className="p-3 bg-amber-50 rounded-lg">
                <DollarSign className="w-5 h-5 text-amber-600" />
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="border border-stone-200 shadow-sm">
          <CardContent className="p-5">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-[11px] font-bold text-stone-400 uppercase tracking-wider">Volume Total</p>
                <h3 className="text-2xl font-bold text-stone-900 mt-1">{stats.totalCbm.toFixed(2)} m³</h3>
              </div>
              <div className="p-3 bg-blue-50 rounded-lg">
                <Box className="w-5 h-5 text-blue-600" />
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="border border-stone-200 shadow-sm">
          <CardContent className="p-5">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-[11px] font-bold text-stone-400 uppercase tracking-wider">En Transit</p>
                <h3 className="text-2xl font-bold text-stone-900 mt-1">{stats.inTransitVal.toLocaleString()} €</h3>
              </div>
              <div className="p-3 bg-indigo-50 rounded-lg">
                <Truck className="w-5 h-5 text-indigo-600" />
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="border border-stone-200 shadow-sm">
          <CardContent className="p-5">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-[11px] font-bold text-stone-400 uppercase tracking-wider">Factures Actives</p>
                <h3 className="text-2xl font-bold text-stone-900 mt-1">{stats.totalFactures}</h3>
              </div>
              <div className="p-3 bg-emerald-50 rounded-lg">
                <FileText className="w-5 h-5 text-emerald-600" />
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card className="border border-stone-200 shadow-sm">
          <CardHeader>
            <CardTitle className="text-sm font-bold uppercase tracking-widest text-stone-500 flex items-center gap-2">
              <TrendingUp className="w-4 h-4" /> Répartition de la Valeur (€)
            </CardTitle>
          </CardHeader>
          <CardContent className="h-[350px]">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={categoryValueData}
                  cx="50%"
                  cy="50%"
                  innerRadius={80}
                  outerRadius={110}
                  paddingAngle={5}
                  dataKey="value"
                  label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}
                >
                  {categoryValueData.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip 
                  formatter={(value: number) => `${value.toLocaleString()} €`}
                  contentStyle={{ borderRadius: '8px', border: 'none', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }}
                />
              </PieChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        <Card className="border border-stone-200 shadow-sm">
          <CardHeader>
            <CardTitle className="text-sm font-bold uppercase tracking-widest text-stone-500">Statistiques de Stock</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col justify-center items-center h-[350px] text-center space-y-4">
             <div className="p-4 bg-stone-50 rounded-xl w-full">
                <p className="text-sm text-stone-500 mb-1 font-medium">Capacité Totale Utilisée</p>
                <p className="text-3xl font-bold text-stone-900">{stats.totalCbm.toFixed(2)} m³</p>
             </div>
             <div className="p-4 bg-stone-50 rounded-xl w-full">
                <p className="text-sm text-stone-500 mb-1 font-medium">Valeur Moyenne par Article</p>
                <p className="text-3xl font-bold text-stone-900">
                  {articles && articles.length > 0 ? (stats.totalVal / articles.length).toFixed(2) : 0} €
                </p>
             </div>
             <p className="text-xs text-stone-400 italic">Données synchronisées en temps réel avec la base de données.</p>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
