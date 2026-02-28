"use client";

import React, { useMemo } from 'react';
import { Order } from '@/lib/types';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Users } from 'lucide-react';

interface SuppliersViewProps {
  orders: Order[];
}

export default function SuppliersView({ orders }: SuppliersViewProps) {
  const supplierStats = useMemo(() => {
    const stats: Record<string, { val: number; orders: number; categories: Set<string> }> = {};
    orders.forEach(o => {
      if (!stats[o.supplier]) stats[o.supplier] = { val: 0, orders: 0, categories: new Set() };
      stats[o.supplier].val += (o.qty * o.pa);
      stats[o.supplier].orders += 1;
      stats[o.supplier].categories.add(o.category);
    });
    return Object.entries(stats).sort((a, b) => b[1].val - a[1].val);
  }, [orders]);

  return (
    <div className="space-y-8 fade-in">
      <div className="bg-white p-6 rounded-xl shadow-sm border border-stone-100">
        <h2 className="text-2xl font-bold text-stone-800">Analyse Fournisseurs</h2>
        <p className="text-stone-600">Performance financière par partenaire commercial.</p>
      </div>
      
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
        {supplierStats.map(([name, stat]) => (
          <Card key={name} className="border-l-4 border-l-stone-800 shadow-sm hover:shadow-md transition-shadow">
            <CardHeader className="pb-2">
              <div className="flex justify-between items-start">
                <CardTitle className="text-xl font-bold">{name}</CardTitle>
                <Users className="w-4 h-4 text-stone-300" />
              </div>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-black text-amber-700 mb-4">{Math.round(stat.val).toLocaleString()} €</div>
              <div className="space-y-1 text-sm text-stone-500">
                <div className="flex justify-between">
                  <span>Articles commandés:</span>
                  <span className="font-bold text-stone-700">{stat.orders}</span>
                </div>
                <div className="flex justify-between">
                  <span>Types de produits:</span>
                  <span className="font-bold text-stone-700">{stat.categories.size}</span>
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}