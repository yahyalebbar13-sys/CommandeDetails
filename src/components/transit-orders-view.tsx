
"use client";

import React, { useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Ship, Clock, Pencil, Trash2, Box } from 'lucide-react';
import { useUser, useFirestore, deleteDocumentNonBlocking } from '@/firebase';
import { doc } from 'firebase/firestore';
import { useToast } from '@/hooks/use-toast';

interface TransitOrdersViewProps {
  articles: any[];
  onEdit: (article: any) => void;
}

export default function TransitOrdersView({ articles, onEdit }: TransitOrdersViewProps) {
  const { user } = useUser();
  const firestore = useFirestore();
  const { toast } = useToast();
  const now = new Date();

  const transitOrders = useMemo(() => {
    return (articles || [])
      .filter(o => o.status === 'SHIPPED' && o.arrivalDate && new Date(o.arrivalDate) > now)
      .sort((a, b) => new Date(a.arrivalDate).getTime() - new Date(b.arrivalDate).getTime());
  }, [articles, now]);

  const stats = useMemo(() => {
    let val = 0;
    let cbm = 0;
    const qtyByUnit: Record<string, number> = {};

    transitOrders.forEach(o => {
      val += (o.quantity * o.purchasePricePerUnit);
      cbm += (o.cubicMeasurement || 0);
      const unit = o.unitOfMeasure || 'pcs';
      qtyByUnit[unit] = (qtyByUnit[unit] || 0) + o.quantity;
    });

    return { val, cbm, qtyByUnit };
  }, [transitOrders]);

  const isZipperCategory = (cat: string) => {
    const c = cat?.toUpperCase() || "";
    return c.includes("ZIPPER") || c.includes("SLIDER");
  };

  const handleDelete = (id: string, name: string) => {
    if (!user || !firestore || !id) return;
    if (window.confirm(`Supprimer définitivement l'article en transit "${name}" ?`)) {
      const docRef = doc(firestore, 'users', user.uid, 'articles', id);
      deleteDocumentNonBlocking(docRef);
      toast({ title: "Article supprimé", description: name });
    }
  };

  return (
    <div className="space-y-6 fade-in">
      <div className="bg-white rounded-xl shadow-sm border border-stone-100 p-6 flex flex-col md:flex-row justify-between items-start md:items-center gap-4 border-l-8 border-l-blue-500">
        <div>
          <h2 className="text-3xl font-bold text-stone-900 flex items-center gap-2">
            <Ship className="w-8 h-8 text-blue-500" />
            Commandes en Transit
          </h2>
          <p className="text-stone-600 mt-1">
            Articles expédiés en attente d'arrivée au port.
          </p>
        </div>
        <div className="flex gap-4">
          <div className="bg-blue-50 px-4 py-2 rounded-lg border border-blue-200">
            <div className="text-[10px] text-blue-600 font-bold uppercase">Volume Total</div>
            <div className="text-xl font-black text-blue-700">{stats.cbm.toFixed(2)} m³</div>
          </div>
          <div className="bg-amber-50 px-4 py-2 rounded-lg border border-amber-200">
            <div className="text-[10px] text-amber-600 font-bold uppercase">Valeur Engagée</div>
            <div className="text-xl font-black text-amber-700">{Math.round(stats.val).toLocaleString()} $</div>
          </div>
        </div>
      </div>

      <Card>
        <CardHeader className="bg-stone-50 border-b flex flex-row items-center justify-between py-4">
          <CardTitle className="text-sm font-bold">Détail du Transit</CardTitle>
          <div className="flex gap-2">
            {Object.entries(stats.qtyByUnit).map(([unit, qty]) => (
              <Badge key={unit} variant="outline" className="text-[10px] border-stone-300">
                {qty.toLocaleString()} {unit}
              </Badge>
            ))}
          </div>
        </CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader className="bg-stone-50">
              <TableRow>
                <TableHead>Article / Taille</TableHead>
                <TableHead>Facture</TableHead>
                <TableHead>Spécifications</TableHead>
                <TableHead>Arrivée</TableHead>
                <TableHead className="text-right">Qté</TableHead>
                <TableHead className="text-right">CBM</TableHead>
                <TableHead className="text-right">PA</TableHead>
                <TableHead className="text-right bg-amber-50/50">Total</TableHead>
                <TableHead className="w-[100px]"></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {transitOrders.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={9} className="text-center py-20 text-stone-400 italic">
                    Aucune commande n'est actuellement en transit.
                  </TableCell>
                </TableRow>
              ) : (
                transitOrders.map((o) => {
                  const isZipper = isZipperCategory(o.categoryId);
                  return (
                    <TableRow key={o.id} className="hover:bg-blue-50/30 transition-colors group">
                      <TableCell>
                        <div className="font-bold text-stone-900">{o.name}</div>
                        <div className="text-[10px] text-stone-500 uppercase flex items-center gap-2 mt-1">
                          {o.size ? <span className="flex items-center gap-1 font-black text-amber-700"><Box className="w-2.5 h-2.5" /> {o.size}</span> : '-'}
                          <span className="text-stone-300">|</span>
                          <span>{o.color || 'DIVERS'}</span>
                        </div>
                      </TableCell>
                      <TableCell>
                        <Badge variant="secondary" className="font-mono text-[10px] bg-stone-100">{o.factureId}</Badge>
                      </TableCell>
                      <TableCell className="text-[10px]">
                        {isZipper ? (
                          <div className="flex flex-col gap-0.5">
                            <span className="text-amber-600 font-black">TYPE: {o.zipperType || '-'}</span>
                            <span className="text-blue-600 font-black">SLIDER: {o.slider || '-'}</span>
                          </div>
                        ) : (
                          <span className="text-stone-500 font-bold">{o.specs || '-'}</span>
                        )}
                      </TableCell>
                      <TableCell className="font-bold text-blue-600 text-sm">
                        <div className="flex items-center gap-1">
                          <Clock className="w-3 h-3" /> {o.arrivalDate}
                        </div>
                      </TableCell>
                      <TableCell className="text-right font-bold">
                        {o.quantity.toLocaleString()} <span className="text-[10px] text-stone-400 font-normal">{o.unitOfMeasure}</span>
                      </TableCell>
                      <TableCell className="text-right text-emerald-700 font-bold">{o.cubicMeasurement?.toFixed(2)}</TableCell>
                      <TableCell className="text-right text-stone-400 font-mono text-xs">{o.purchasePricePerUnit.toFixed(4)}</TableCell>
                      <TableCell className="text-right font-black text-amber-700 bg-amber-50/20">
                        {Math.round(o.quantity * o.purchasePricePerUnit).toLocaleString()} $
                      </TableCell>
                      <TableCell>
                        <div className="flex justify-end gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                          <Button 
                            variant="ghost" 
                            size="icon" 
                            className="h-8 w-8 text-stone-400 hover:text-amber-600"
                            onClick={() => onEdit(o)}
                          >
                            <Pencil className="w-4 h-4" />
                          </Button>
                          <Button 
                            variant="ghost" 
                            size="icon" 
                            className="h-8 w-8 text-stone-400 hover:text-red-500"
                            onClick={() => handleDelete(o.id, o.name)}
                          >
                            <Trash2 className="w-4 h-4" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  );
                })
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
