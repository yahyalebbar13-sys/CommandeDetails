"use client";

import React, { useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
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
  AlertCircle
} from 'lucide-react';

interface DashboardViewProps {
  articles: any[];
  factures: any[];
  onNavigate: (tab: string) => void;
}

const COLORS = ['#d97706', '#059669', '#2563eb', '#7c3aed', '#db2777', '#4b5563'];

export default function DashboardView({ articles = [], factures = [], onNavigate }: DashboardViewProps) {
  // Sécurisation de l'accès aux données avec une valeur par défaut
  const safeArticles = articles || [];
  const safeFactures = factures || [];

  const stats = useMemo(() => {
    const now = new Date();
    let totalVal = 0;
    let totalCbm = 0;
    let inTransitCbm = 0;
    let inTransitVal = 0;

    safeArticles.forEach(art => {
      const val = (Number(art.quantity) * (Number(art.purchasePricePerUnit) || 0)) || 0;
      const cbm = Number(art.cubicMeasurement) || 0;
      
      if (art.status === 'SHIPPED') {
        const arrival = art.arrivalDate ? new Date(art.arrivalDate) : null;
        if (arrival && arrival > now) {
          inTransitCbm += cbm;
          inTransitVal += val;
        }
      }
      totalVal += val;
      totalCbm += cbm;
    });

    safeFactures.forEach(f => {
      totalVal += (Number(f.freightCost) || 0);
    });

    return {
      totalVal,
      totalCbm,
      inTransitCbm,
      inTransitVal,
      totalFactures: safeFactures.length,
      pendingOrders: safeArticles.filter(a => a.status === 'TO_ORDER').length
    };
  }, [safeArticles, safeFactures]);

  const categoryData = useMemo(() => {
    const data: Record<string, number> = {};
    safeArticles.forEach(art => {
      const cat = art.categoryId || 'Non classé';
      data[cat] = (data[cat] || 0) + (Number(art.quantity) * (Number(art.purchasePricePerUnit) || 0));
    });
    return Object.entries(data).map(([name, value]) => ({ name, value }));
  }, [safeArticles]);

  const unitData = useMemo(() => {
    const data: Record<string, number> = {};
    safeArticles.forEach(art => {
      const unit = art.unitOfMeasure || 'PCS';
      data[unit] = (data[unit] || 0) + Number(art.quantity);
    });
    return Object.entries(data).map(([name, value]) => ({ name, value }));
  }, [safeArticles]);

  return (
    <div className="space-y-8 animate-in fade-in duration-500">
      <div className="flex flex-col gap-2">
        <h2 className="text-2xl font-bold text-stone-800">Vue d'ensemble</h2>
        <p className="text-stone-500 text-sm">Indicateurs clés de performance de votre inventaire.</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card className="border-none shadow-sm bg-white">
          <CardContent className="p-5">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-[11px] font-bold text-stone-400 uppercase tracking-wider">Valeur Totale Stock</p>
                <h3 className="text-2xl font-bold text-stone-900 mt-1">{stats.totalVal.toLocaleString()} €</h3>
              </div>
              <div className="p-3 bg-amber-50 rounded-full">
                <DollarSign className="w-5 h-5 text-amber-600" />
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="border-none shadow-sm bg-white">
          <CardContent className="p-5">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-[11px] font-bold text-stone-400 uppercase tracking-wider">Volume Total</p>
                <h3 className="text-2xl font-bold text-stone-900 mt-1">{stats.totalCbm.toFixed(2)} m³</h3>
              </div>
              <div className="p-3 bg-orange-50 rounded-full">
                <Box className="w-5 h-5 text-orange-600" />
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="border-none shadow-sm bg-white">
          <CardContent className="p-5">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-[11px] font-bold text-stone-400 uppercase tracking-wider">Stock en Transit</p>
                <h3 className="text-2xl font-bold text-stone-900 mt-1">{stats.inTransitCbm.toFixed(2)} m³</h3>
              </div>
              <div className="p-3 bg-blue-50 rounded-full">
                <Truck className="w-5 h-5 text-blue-600" />
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="border-none shadow-sm bg-white">
          <CardContent className="p-5">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-[11px] font-bold text-stone-400 uppercase tracking-wider">Rappels en attente</p>
                <h3 className="text-2xl font-bold text-stone-900 mt-1">{stats.pendingOrders}</h3>
              </div>
              <div className="p-3 bg-red-50 rounded-full">
                <AlertCircle className="w-5 h-5 text-red-600" />
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card className="border-none shadow-sm bg-white">
          <CardHeader>
            <CardTitle className="text-sm font-bold uppercase tracking-widest text-stone-500">Répartition de la valeur par catégorie</CardTitle>
          </CardHeader>
          <CardContent className="h-[300px]">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={categoryData}
                  cx="50%"
                  cy="50%"
                  innerRadius={60}
                  outerRadius={100}
                  paddingAngle={5}
                  dataKey="value"
                >
                  {categoryData.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip />
                <Legend layout="vertical" align="right" verticalAlign="middle" />
              </PieChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        <Card className="border-none shadow-sm bg-white">
          <CardHeader>
            <CardTitle className="text-sm font-bold uppercase tracking-widest text-stone-500">Volume total par unité</CardTitle>
          </CardHeader>
          <CardContent className="h-[300px]">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={unitData}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                <XAxis dataKey="name" fontSize={12} tickLine={false} axisLine={false} />
                <YAxis fontSize={12} tickLine={false} axisLine={false} />
                <Tooltip cursor={{fill: '#f8fafc'}} />
                <Bar dataKey="value" fill="#d97706" radius={[4, 4, 0, 0]} barSize={40} />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}