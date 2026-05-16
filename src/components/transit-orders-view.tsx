
"use client";

import React, { useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Ship, Clock, Pencil, Trash2, Box, Settings2, MousePointer2 } from 'lucide-react';
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
      // Articles enrichis ont status = 'TRANSIT' quand arrivalDate est dans le futur
      // Fallback : inclure aussi les SHIPPED avec arrivalDate future (articles non enrichis)
      .filter(o =>
        o.status === 'TRANSIT' ||
        (o.status === 'SHIPPED' && o.arrivalDate && new Date(o.arrivalDate) > now)
      )
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
    const isZipper = c.includes("ZIPPER");
    const isExcluded = c.includes("LONG CHAIN") || c.includes("SLIDER");
    return isZipper && !isExcluded;
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
            <div className="text-xl font-black text-blue-700">{stats.cbm.toLocaleString('en-US', { maximumFractionDigits: 3 })} m³</div>
          </div>
          <div className="bg-amber-50 px-4 py-2 rounded-lg border border-amber-200">
            <div className="text-[10px] text-amber-600 font-bold uppercase">Valeur Engagée</div>
            <div className="text-xl font-black text-amber-700">{Number(stats.val).toLocaleString('en-US', { maximumFractionDigits: 3 })} $</div>
          </div>
        </div>
      </div>

      <Card className="border-none shadow-xl rounded-2xl overflow-hidden">
        <CardHeader className="bg-stone-50 border-b flex flex-row items-center justify-between py-4">
          <CardTitle className="text-xs font-black uppercase text-stone-500 tracking-widest">Détail du Transit</CardTitle>
          <div className="flex gap-2">
            {Object.entries(stats.qtyByUnit).map(([unit, qty]) => (
              <Badge key={unit} className="text-[10px] bg-white text-stone-900 border-stone-200 font-black uppercase">
                {qty.toLocaleString()} {unit}
              </Badge>
            ))}
          </div>
        </CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader className="bg-stone-50/50">
              <TableRow>
                <TableHead className="text-[10px] font-black uppercase py-4 px-6">Désignation</TableHead>
                <TableHead className="text-[10px] font-black uppercase py-4">Taille</TableHead>
                <TableHead className="text-[10px] font-black uppercase py-4">Couleur</TableHead>
                <TableHead className="text-[10px] font-black uppercase py-4">Dossier</TableHead>
                <TableHead className="text-[10px] font-black uppercase py-4">Technique / Spécifications</TableHead>
                <TableHead className="text-[10px] font-black uppercase py-4">Arrivée</TableHead>
                <TableHead className="text-right text-[10px] font-black uppercase py-4">Qté</TableHead>
                <TableHead className="text-right text-[10px] font-black uppercase py-4">Volume</TableHead>
                <TableHead className="text-right text-[10px] font-black uppercase py-4 bg-amber-50/30">Total</TableHead>
                <TableHead className="w-[100px] text-[10px] font-black uppercase py-4"></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {transitOrders.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={10} className="text-center py-20 text-stone-400 italic font-bold">
                    Aucune commande n'est actuellement en transit.
                  </TableCell>
                </TableRow>
              ) : (
                transitOrders.map((o) => {
                  const isZipper = isZipperCategory(o.categoryId);
                  return (
                    <TableRow key={o.id} className="hover:bg-blue-50/10 transition-colors group border-stone-50">
                      <TableCell className="py-3 px-6">
                        <div className="font-black text-stone-900 text-xs uppercase">{o.name}</div>
                      </TableCell>
                      <TableCell className="py-3">
                        <span className="text-[10px] text-stone-600 uppercase">{o.size || '-'}</span>
                      </TableCell>
                      <TableCell className="py-3">
                        <span className="text-[10px] text-stone-900 uppercase">{o.color || '-'}</span>
                      </TableCell>
                      <TableCell className="py-3">
                        <Badge variant="secondary" className="font-black text-[10px] bg-stone-100 text-stone-600 border-stone-200 rounded px-2">#{o.factureId}</Badge>
                      </TableCell>
                      <TableCell className="text-[10px] py-3">
                        {isZipper ? (
                          <div className="flex flex-col gap-0.5">
                            <span className="text-amber-600 font-black text-[8px] flex items-center gap-1.5 uppercase"><Settings2 className="w-2.5 h-2.5" /> TYPE: {o.zipperType || '-'}</span>
                            <span className="text-blue-600 font-black text-[8px] flex items-center gap-1.5 uppercase"><MousePointer2 className="w-2.5 h-2.5" /> {o.slider || '-'} ({o.sliderType || '-'})</span>
                          </div>
                        ) : (
                          <span className="text-stone-500 font-bold uppercase">{o.specs || '-'}</span>
                        )}
                      </TableCell>
                      <TableCell className="font-black text-blue-600 text-[11px] py-3">
                        <div className="flex items-center gap-1.5">
                          <Clock className="w-3 h-3 text-blue-400" /> {o.arrivalDate}
                        </div>
                      </TableCell>
                      <TableCell className="text-right font-black text-xs py-3">
                        {o.quantity.toLocaleString()} <span className="text-[9px] text-stone-400 font-bold ml-1 uppercase">{o.unitOfMeasure}</span>
                      </TableCell>
                      <TableCell className="text-right text-emerald-700 font-black text-xs py-3">{o.cubicMeasurement?.toLocaleString('en-US', { maximumFractionDigits: 3 })} <span className="text-[9px] font-bold text-stone-300 ml-0.5 uppercase">m³</span></TableCell>
                      <TableCell className="text-right font-black text-amber-700 bg-amber-50/10 text-xs py-3 px-6">
                        {Number(o.quantity * o.purchasePricePerUnit).toLocaleString('en-US', { maximumFractionDigits: 3 })} $
                      </TableCell>
                      <TableCell className="py-3">
                        <div className="flex justify-end gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                          <Button 
                            variant="ghost" 
                            size="icon" 
                            className="h-8 w-8 text-stone-300 hover:text-amber-600 hover:bg-amber-50 rounded-xl"
                            onClick={() => onEdit(o)}
                          >
                            <Pencil className="w-4 h-4" />
                          </Button>
                          <Button 
                            variant="ghost" 
                            size="icon" 
                            className="h-8 w-8 text-stone-300 hover:text-red-500 hover:bg-red-50 rounded-xl"
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
