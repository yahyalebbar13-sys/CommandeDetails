"use client";

import React, { useState, useMemo } from 'react';
import { Order } from '@/lib/types';
import { Input } from '@/components/ui/input';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Search } from 'lucide-react';

interface DataViewProps {
  orders: Order[];
}

export default function DataView({ orders }: DataViewProps) {
  const [searchTerm, setSearchTerm] = useState('');

  const filteredOrders = useMemo(() => {
    const term = searchTerm.toLowerCase();
    if (!term) return orders;
    return orders.filter(o => 
      o.category.toLowerCase().includes(term) ||
      o.article.toLowerCase().includes(term) ||
      o.supplier.toLowerCase().includes(term) ||
      o.facture.toLowerCase().includes(term) ||
      (o.color && o.color.toLowerCase().includes(term))
    );
  }, [orders, searchTerm]);

  return (
    <div className="fade-in space-y-4">
      <Card>
        <CardHeader className="flex flex-col sm:flex-row justify-between items-center space-y-4 sm:space-y-0 pb-6 border-b border-stone-100">
          <CardTitle className="text-xl font-bold text-stone-800">Base de Données Globale</CardTitle>
          <div className="relative w-full sm:w-80">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-stone-400" />
            <Input 
              placeholder="Recherche globale..." 
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="pl-9 bg-stone-50 border-stone-200"
            />
          </div>
        </CardHeader>
        <CardContent className="p-0">
          <div className="overflow-x-auto max-h-[70vh]">
            <Table>
              <TableHeader className="bg-stone-50 sticky top-0 z-10 shadow-sm">
                <TableRow>
                  <TableHead className="bg-stone-100">Catégorie</TableHead>
                  <TableHead>Article</TableHead>
                  <TableHead>Fournisseur</TableHead>
                  <TableHead className="bg-stone-200/50">Facture</TableHead>
                  <TableHead className="bg-blue-50/50">Date Arrivée</TableHead>
                  <TableHead className="text-right">Qté</TableHead>
                  <TableHead className="text-right">CBM</TableHead>
                  <TableHead className="text-right bg-orange-50">Valeur</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredOrders.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={8} className="text-center py-12 text-stone-400">Aucun résultat trouvé</TableCell>
                  </TableRow>
                ) : (
                  filteredOrders.map((o, i) => (
                    <TableRow key={i} className="hover:bg-stone-50 transition-colors">
                      <TableCell className="font-bold text-xs bg-stone-50">{o.category}</TableCell>
                      <TableCell className="font-bold text-xs">{o.article}</TableCell>
                      <TableCell className="text-xs">{o.supplier}</TableCell>
                      <TableCell className="font-bold text-xs bg-stone-100">{o.facture}</TableCell>
                      <TableCell className="font-bold text-blue-600 bg-blue-50/30 text-xs">{o.arrivalDate}</TableCell>
                      <TableCell className="text-right font-bold text-xs">{o.qty.toLocaleString()}</TableCell>
                      <TableCell className="text-right text-emerald-700 font-bold text-xs">{o.cbm.toFixed(2)}</TableCell>
                      <TableCell className="text-right font-black text-amber-700 bg-orange-50/50 text-xs">{(o.qty * o.pa).toLocaleString()} €</TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}