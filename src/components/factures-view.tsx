"use client";

import React, { useState, useMemo } from 'react';
import { Order, Facture } from '@/lib/types';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Ship, ChevronLeft, Edit, Plus, Box } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import AddFactureModal from './add-facture-modal';

interface FacturesViewProps {
  orders: Order[];
  factures: Facture[];
  setFactures: React.Dispatch<React.SetStateAction<Facture[]>>;
}

export default function FacturesView({ orders, factures, setFactures }: FacturesViewProps) {
  const [selectedFactureId, setSelectedFactureId] = useState<string | null>(null);
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);

  const aggregatedFactures = useMemo(() => {
    return factures.map(f => {
      const fOrders = orders.filter(o => o.facture === f.id);
      const itemsCount = fOrders.length;
      const itemsVal = fOrders.reduce((sum, o) => sum + (o.qty * o.pa), 0);
      const cbm = fOrders.reduce((sum, o) => sum + o.cbm, 0);
      return { ...f, itemsCount, itemsVal, cbm };
    }).sort((a, b) => new Date(b.arrivalDate).getTime() - new Date(a.arrivalDate).getTime());
  }, [orders, factures]);

  const selectedFacture = useMemo(() => {
    if (!selectedFactureId) return null;
    return aggregatedFactures.find(f => f.id === selectedFactureId);
  }, [aggregatedFactures, selectedFactureId]);

  const selectedFactureOrders = useMemo(() => {
    if (!selectedFactureId) return [];
    return orders.filter(o => o.facture === selectedFactureId);
  }, [orders, selectedFactureId]);

  if (selectedFactureId && selectedFacture) {
    return (
      <div className="space-y-6 fade-in">
        <div className="bg-white rounded-xl shadow-sm border border-stone-100 p-6 flex flex-col lg:flex-row justify-between items-start lg:items-center gap-4 border-l-8 border-l-blue-500">
          <div className="flex-1">
            <Button variant="ghost" size="sm" onClick={() => setSelectedFactureId(null)} className="text-stone-500 hover:text-blue-600 mb-2 p-0 h-auto">
              <ChevronLeft className="w-4 h-4 mr-1" /> Retour aux factures
            </Button>
            <h2 className="text-3xl font-bold text-stone-900 flex items-center gap-3">
              {selectedFacture.id}
            </h2>
            <div className="text-sm text-stone-500 mt-1 font-medium">
              Fournisseur : <span className="text-stone-800 font-bold">{selectedFacture.supplier}</span>
            </div>
          </div>
          
          <div className="flex flex-wrap gap-4 mt-4 lg:mt-0 justify-end w-full lg:w-auto">
            <div className="text-right bg-blue-50 p-3 rounded-lg border border-blue-100">
              <div className="text-[10px] text-blue-600 uppercase tracking-wide font-bold">Arrivée</div>
              <div className="text-lg font-black text-blue-900">{selectedFacture.arrivalDate}</div>
            </div>
            <div className="text-right bg-emerald-50 p-3 rounded-lg border border-emerald-200">
              <div className="text-[10px] text-emerald-600 uppercase tracking-wide font-bold">Volume CBM</div>
              <div className="text-lg font-bold text-emerald-700">{selectedFacture.cbm.toFixed(2)} m³</div>
            </div>
            <div onClick={() => setIsEditModalOpen(true)} className="text-right bg-red-50 p-3 rounded-lg border border-red-200 cursor-pointer hover:bg-red-100 transition-colors">
              <div className="text-[10px] text-red-600 uppercase tracking-wide font-bold">Fret ✎</div>
              <div className="text-lg font-bold text-red-700">{selectedFacture.freight.toLocaleString()} €</div>
            </div>
            <div className="text-right bg-amber-50 p-3 rounded-lg border border-amber-200">
              <div className="text-[10px] text-amber-600 uppercase tracking-wide font-bold">Total Général</div>
              <div className="text-xl font-black text-amber-700">{(selectedFacture.itemsVal + selectedFacture.freight).toLocaleString()} €</div>
            </div>
          </div>
        </div>

        <Card className="overflow-hidden">
          <CardHeader className="bg-stone-50 py-4 px-6">
            <div className="flex justify-between items-center">
              <CardTitle className="text-lg">Contenu du Conteneur</CardTitle>
              <Badge variant="outline" className="text-blue-600 border-blue-200 bg-blue-50">
                Total : {selectedFactureOrders.reduce((s,o)=>s+o.qty, 0).toLocaleString()} {selectedFactureOrders[0]?.unit || 'Unités'}
              </Badge>
            </div>
          </CardHeader>
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <Table>
                <TableHeader className="bg-stone-50">
                  <TableRow>
                    <TableHead>Catégorie</TableHead>
                    <TableHead>Article</TableHead>
                    <TableHead>Specs</TableHead>
                    <TableHead className="text-right">Qté</TableHead>
                    <TableHead className="text-right">CBM</TableHead>
                    <TableHead className="text-right">PA</TableHead>
                    <TableHead className="text-right">Valeur</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {selectedFactureOrders.map((o, i) => (
                    <TableRow key={i} className="hover:bg-blue-50 transition-colors">
                      <TableCell className="font-bold text-stone-600">{o.category}</TableCell>
                      <TableCell className="font-bold">{o.article}</TableCell>
                      <TableCell className="text-stone-500 text-xs">{o.specs}</TableCell>
                      <TableCell className="text-right font-bold">{o.qty.toLocaleString()}</TableCell>
                      <TableCell className="text-right text-emerald-700 font-medium">{o.cbm.toFixed(2)}</TableCell>
                      <TableCell className="text-right text-stone-400 font-mono text-xs">{o.pa}</TableCell>
                      <TableCell className="text-right font-black text-amber-700">{(o.qty * o.pa).toLocaleString()} €</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>

        <AddFactureModal
          open={isEditModalOpen}
          onOpenChange={setIsEditModalOpen}
          factures={factures}
          editFacture={selectedFacture}
          onSave={(updated) => {
            setFactures(prev => prev.map(f => f.id === updated.id ? updated : f));
          }}
        />
      </div>
    );
  }

  return (
    <div className="space-y-8 fade-in">
      <div className="bg-white p-6 rounded-xl shadow-sm border border-stone-100 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h2 className="text-2xl font-bold text-stone-800">Gestion des Factures & Arrivages</h2>
          <p className="text-stone-600">Vue groupée par numéro de facture / conteneur.</p>
        </div>
        <Button onClick={() => setIsEditModalOpen(true)} className="bg-blue-600 hover:bg-blue-700 text-white font-bold gap-2">
          <Plus className="w-5 h-5" /> Déclarer Facture
        </Button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {aggregatedFactures.map(f => (
          <div 
            key={f.id} 
            onClick={() => setSelectedFactureId(f.id)}
            className="bg-white rounded-xl shadow-sm border border-stone-200 p-6 hover:shadow-md hover:border-blue-400 cursor-pointer transition-all flex flex-col relative overflow-hidden group"
          >
            <div className="absolute top-0 right-0 bg-blue-100 text-blue-800 text-[10px] font-bold px-3 py-1 rounded-bl-lg group-hover:bg-blue-600 group-hover:text-white transition-colors">
              Arr. {f.arrivalDate}
            </div>
            <div className="flex-grow pt-2">
              <div className="text-[10px] text-stone-500 font-medium uppercase mb-1">{f.supplier}</div>
              <h3 className="text-xl font-black text-stone-800 tracking-tight mb-2 group-hover:text-blue-600 transition-colors">{f.id}</h3>
              <div className="inline-block bg-emerald-100 text-emerald-800 text-[10px] font-bold px-2 py-1 rounded mb-4">
                Vol: {f.cbm.toFixed(2)} m³
              </div>
              <div className="flex justify-between items-center text-sm border-t border-stone-100 pt-3">
                <span className="text-stone-500">Articles :</span>
                <span className="font-bold text-stone-700 bg-stone-100 px-2 py-1 rounded">{f.itemsCount}</span>
              </div>
            </div>
            <div className="mt-4 pt-3 border-t border-stone-200 bg-stone-50 -mx-6 -mb-6 px-6 py-4">
              <div className="flex justify-between text-sm mb-1">
                <span className="text-stone-500">Valeur Articles</span>
                <span className="font-medium">{f.itemsVal.toLocaleString()} €</span>
              </div>
              <div className="flex justify-between text-sm mb-2 border-b border-stone-200 pb-2">
                <span className="text-stone-500">Frais (Fret)</span>
                <span className="font-medium text-red-600">+ {f.freight.toLocaleString()} €</span>
              </div>
              <div className="flex justify-between items-end mt-2">
                <div className="text-[10px] text-stone-500 uppercase tracking-wide font-bold">Total Facture</div>
                <div className="text-xl font-black text-amber-700">{(f.itemsVal + f.freight).toLocaleString()} €</div>
              </div>
            </div>
          </div>
        ))}
      </div>

      <AddFactureModal
        open={isEditModalOpen}
        onOpenChange={setIsEditModalOpen}
        factures={factures}
        onSave={(newF) => setFactures(prev => [newF, ...prev])}
      />
    </div>
  );
}