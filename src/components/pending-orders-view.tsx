"use client";

import React, { useState, useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Clock, Factory, Ship, ArrowRight, Loader2, Trash2, Pencil, Box, Settings2, MousePointer2 } from 'lucide-react';
import ValidateOrderModal from './validate-order-modal';
import { useUser, useFirestore, deleteDocumentNonBlocking } from '@/firebase';
import { doc } from 'firebase/firestore';
import { useToast } from '@/hooks/use-toast';

interface PendingOrdersViewProps {
  articles: any[];
  factures: any[];
  onEdit: (article: any) => void;
}

export default function PendingOrdersView({ articles, factures, onEdit }: PendingOrdersViewProps) {
  const { user } = useUser();
  const firestore = useFirestore();
  const { toast } = useToast();
  const [selectedOrder, setSelectedOrder] = useState<any>(null);
  const [isValidating, setIsValidating] = useState(false);

  const pendingOrders = useMemo(() => {
    return articles
      .filter(o => o.status === 'PI')
      .sort((a, b) => new Date(b.orderDate).getTime() - new Date(a.orderDate).getTime());
  }, [articles]);

  const handleActionDelete = (id: string, name: string) => {
    if (!user || !firestore || !id) return;
    
    if (window.confirm(`Supprimer définitivement la commande PI "${name}" ?`)) {
      const docRef = doc(firestore, 'users', user.uid, 'articles', id);
      deleteDocumentNonBlocking(docRef);
      toast({ 
        title: "Commande supprimée", 
        description: name 
      });
    }
  };

  const isZipperCategory = (cat: string) => {
    const c = cat?.toUpperCase() || "";
    return c.includes("NYLON ZIPPER") || 
           c.includes("PLASTIC ZIPPER") || 
           c.includes("METAL ZIPPER") || 
           c.includes("ALUMINIUM ZIPPER");
  };

  return (
    <div className="space-y-6 fade-in">
      <div className="bg-white rounded-xl shadow-sm border border-stone-100 p-6 flex flex-col md:flex-row justify-between items-start md:items-center gap-4 border-l-8 border-l-amber-400">
        <div>
          <h2 className="text-3xl font-bold text-stone-900 flex items-center gap-2">
            <Factory className="w-8 h-8 text-amber-500" />
            Commandes en Production (PI)
          </h2>
          <p className="text-stone-600 mt-1">
            Commandes officiellement lancées en cours de fabrication chez le partenaire.
          </p>
        </div>
        <div className="bg-amber-50 px-4 py-2 rounded-lg border border-amber-200">
          <div className="text-[10px] text-amber-600 font-bold uppercase">Articles actifs</div>
          <div className="text-2xl font-black text-amber-700">{pendingOrders.length} Lignes</div>
        </div>
      </div>

      <Card className="border-none shadow-xl rounded-2xl overflow-hidden">
        <CardContent className="p-0">
          <Table>
            <TableHeader className="bg-stone-50/80">
              <TableRow>
                <TableHead className="text-[10px] font-black uppercase py-4">Fournisseur</TableHead>
                <TableHead className="text-[10px] font-black uppercase py-4">Désignation</TableHead>
                <TableHead className="text-[10px] font-black uppercase py-4">Taille</TableHead>
                <TableHead className="text-[10px] font-black uppercase py-4">Couleur</TableHead>
                <TableHead className="text-[10px] font-black uppercase py-4">Technique / Specs</TableHead>
                <TableHead className="text-[10px] font-black uppercase py-4">Date Commande</TableHead>
                <TableHead className="text-right text-[10px] font-black uppercase py-4">Qté</TableHead>
                <TableHead className="text-right text-[10px] font-black uppercase py-4">Valeur Est.</TableHead>
                <TableHead className="text-right text-[10px] font-black uppercase py-4">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {pendingOrders.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={9} className="text-center py-20 text-stone-400 italic font-bold">
                    Aucune commande en production détectée.
                  </TableCell>
                </TableRow>
              ) : (
                pendingOrders.map((o) => {
                  const isZipper = isZipperCategory(o.categoryId);
                  return (
                    <TableRow key={o.id} className="hover:bg-amber-50/20 transition-colors border-stone-50">
                      <TableCell className="font-black text-stone-900 uppercase text-xs py-3">{o.supplierId}</TableCell>
                      <TableCell className="py-3">
                        <div className="font-black text-stone-900 text-xs uppercase">{o.name}</div>
                      </TableCell>
                      <TableCell className="py-3">
                        <span className="text-[10px] text-stone-600 uppercase">{o.size || '-'}</span>
                      </TableCell>
                      <TableCell className="py-3">
                        <span className="text-[10px] text-stone-900 uppercase">{o.color || '-'}</span>
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
                      <TableCell className="py-3">
                        <div className="flex items-center gap-1 text-stone-600 font-bold text-xs">
                          <Clock className="w-3 h-3 text-stone-400" /> {o.orderDate}
                        </div>
                      </TableCell>
                      <TableCell className="text-right font-black text-xs py-3">
                        {o.quantity.toLocaleString()} <span className="text-[10px] text-stone-400 font-bold ml-1 uppercase">{o.unitOfMeasure}</span>
                      </TableCell>
                      <TableCell className="text-right font-black text-amber-700 text-xs py-3">
                        {Math.round(o.quantity * o.purchasePricePerUnit).toLocaleString()} $
                      </TableCell>
                      <TableCell className="text-right py-3">
                        <div className="flex justify-end items-center gap-1">
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
                            onClick={() => handleActionDelete(o.id, o.name)}
                          >
                            <Trash2 className="w-4 h-4" />
                          </Button>
                          <Button 
                            size="sm" 
                            onClick={() => setSelectedOrder(o) || setIsValidating(true)}
                            className="bg-blue-600 hover:bg-blue-700 text-white font-black uppercase text-[9px] tracking-widest px-4 h-8 rounded-lg ml-2"
                          >
                            Expédier <ArrowRight className="w-3 h-3 ml-1" />
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

      <ValidateOrderModal 
        open={isValidating}
        onOpenChange={setIsValidating}
        order={selectedOrder}
        factures={factures}
      />
    </div>
  );
}
