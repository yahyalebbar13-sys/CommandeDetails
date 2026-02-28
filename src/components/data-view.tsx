"use client";

import React, { useState, useMemo } from 'react';
import { Input } from '@/components/ui/input';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Search } from 'lucide-react';

interface DataViewProps {
  articles: any[];
}

export default function DataView({ articles }: DataViewProps) {
  const [searchTerm, setSearchTerm] = useState('');

  const filteredArticles = useMemo(() => {
    const term = searchTerm.toLowerCase();
    if (!term) return articles;
    return articles.filter(o => 
      (o.categoryId || '').toLowerCase().includes(term) ||
      (o.name || '').toLowerCase().includes(term) ||
      (o.supplierId || '').toLowerCase().includes(term) ||
      (o.factureId || '').toLowerCase().includes(term) ||
      (o.color || '').toLowerCase().includes(term)
    );
  }, [articles, searchTerm]);

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
                {filteredArticles.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={8} className="text-center py-12 text-stone-400">Aucun résultat trouvé</TableCell>
                  </TableRow>
                ) : (
                  filteredArticles.map((o, i) => (
                    <TableRow key={i} className="hover:bg-stone-50 transition-colors">
                      <TableCell className="font-bold text-xs bg-stone-50">{o.categoryId}</TableCell>
                      <TableCell className="font-bold text-xs">{o.name}</TableCell>
                      <TableCell className="text-xs">{o.supplierId}</TableCell>
                      <TableCell className="font-bold text-xs bg-stone-100">{o.factureId}</TableCell>
                      <TableCell className="font-bold text-blue-600 bg-blue-50/30 text-xs">{o.arrivalDate}</TableCell>
                      <TableCell className="text-right font-bold text-xs">{o.quantity.toLocaleString()}</TableCell>
                      <TableCell className="text-right text-emerald-700 font-bold text-xs">{o.cubicMeasurement?.toFixed(2)}</TableCell>
                      <TableCell className="text-right font-black text-amber-700 bg-orange-50/50 text-xs">{(o.quantity * o.purchasePricePerUnit).toLocaleString()} €</TableCell>
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
