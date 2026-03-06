"use client";

import React, { useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { 
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, 
  Cell, AreaChart, Area 
} from 'recharts';
import { 
  Package, 
  FileText, 
  Factory, 
  TrendingUp, 
  DollarSign,
  Box,
  Truck
} from 'lucide-react';

interface DashboardViewProps {
  articles: any[];
  factures: any[];
  onNavigate: (tab: any) => void;
}

const COLORS = ['#CC8626', '#BF3914', '#4B5563', '#1F2937', '#D1D5DB'];

export default function DashboardView({ articles = [], factures = [], onNavigate }: DashboardViewProps) {
  
  const stats = useMemo(() => {
    const now = new Date();
    let totalVal = 0;
    let totalCbm = 0;
    let inTransitCbm = 0;
    let inTransitVal = 0;

    articles.forEach(art => {
      const val = (Number(art.quantity) || 0) * (Number(art.purchasePricePerUnit) || 0);
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

    // Ajouter les frais de port des factures au total
    factures.forEach(f => {
      totalVal += (Number(f.freightCost) || 0);
    });

    return {
      totalVal,
      totalCbm,
      inTransitCbm,
      inTransitVal,
      totalFactures: factures.length,
      pendingOrders: articles.filter(a => a.status === 'TO_ORDER').length
    };
  }, [articles, factures]);

  const chartData = useMemo(() => {
    const categories: Record<string, number> = {};
    articles.forEach(art => {
      const cat = art.categoryId || 'Autre';
      categories[cat] = (categories[cat] || 0) + (Number(art.quantity) * Number(art.purchasePricePerUnit));
    });
    return Object.entries(categories)
      .map(([name, value]) => ({ name, value }))
      .sort((a, b) => b.value - a.value)
      .slice(0, 5);
  }, [articles]);

  const volumeData = useMemo(() => {
    const units: Record<string, number> = {};
    articles.forEach(art => {
      const unit = art.unitOfMeasure || 'pcs';
      units[unit] = (units[unit] || 0) + Number(art.quantity);
    });
    return Object.entries(units).map(([name, value]) => ({ name, value }));
  }, [articles]);

  return (
    <div className="space-y-6">
      {/* KPI Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card className="border-none shadow-sm bg-white">
          <CardContent className="p-5">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs font-medium text-stone-500 uppercase tracking-wider">Valeur Totale</p>
                <h3 className="text-2xl font-bold text-stone-900 mt-1">{Math.round(stats.totalVal).toLocaleString()} €</h3>
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
                <p className="text-xs font-medium text-stone-500 uppercase tracking-wider">Volume Global</p>
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
                <p className="text-xs font-medium text-stone-500 uppercase tracking-wider">En Transit</p>
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
                <p className="text-xs font-medium text-stone-500 uppercase tracking-wider">Factures</p>
                <h3 className="text-2xl font-bold text-stone-900 mt-1">{stats.totalFactures}</h3>
              </div>
              <div className="p-3 bg-purple-50 rounded-full">
                <FileText className="w-5 h-5 text-purple-600" />
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Charts */}
        <Card className="border-none shadow-sm bg-white">
          <CardHeader>
            <CardTitle className="text-sm font-bold uppercase tracking-widest text-stone-600">Valeur par Catégorie (€)</CardTitle>
          </CardHeader>
          <CardContent className="h-[300px]">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={chartData} layout="vertical">
                <CartesianGrid strokeDasharray="3 3" horizontal={true} vertical={false} stroke="#f1f5f9" />
                <XAxis type="number" hide />
                <YAxis dataKey="name" type="category" width={100} fontSize={12} tickLine={false} axisLine={false} />
                <Tooltip 
                  cursor={{fill: '#f9f6f0'}}
                  contentStyle={{ borderRadius: '8px', border: 'none', boxShadow: '0 10px 15px -3px rgb(0 0 0 / 0.1)' }}
                />
                <Bar dataKey="value" fill="#CC8626" radius={[0, 4, 4, 0]} barSize={20} />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        <Card className="border-none shadow-sm bg-white">
          <CardHeader>
            <CardTitle className="text-sm font-bold uppercase tracking-widest text-stone-600">Volume Total par Unité</CardTitle>
          </CardHeader>
          <CardContent className="h-[300px]">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={volumeData}>
                <defs>
                  <linearGradient id="colorVolume" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#BF3914" stopOpacity={0.1}/>
                    <stop offset="95%" stopColor="#BF3914" stopOpacity={0}/>
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                <XAxis dataKey="name" fontSize={12} tickLine={false} axisLine={false} />
                <YAxis fontSize={12} tickLine={false} axisLine={false} />
                <Tooltip 
                   contentStyle={{ borderRadius: '8px', border: 'none', boxShadow: '0 10px 15px -3px rgb(0 0 0 / 0.1)' }}
                />
                <Area type="monotone" dataKey="value" stroke="#BF3914" fillOpacity={1} fill="url(#colorVolume)" strokeWidth={2} />
              </AreaChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
