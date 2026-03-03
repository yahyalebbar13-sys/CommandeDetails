
"use client";

import React, { useState, useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Clock, Factory, Ship, ArrowRight, Loader2, Trash2 } from 'lucide-react';
import ValidateOrderModal from './validate-order-modal';
import { useUser, useFirestore, deleteDocumentNonBlocking } from '@/firebase';
import { doc } from 'firebase/firestore';
import { useToast } from '@/hooks/use-toast';

interface PendingOrdersViewProps {
  articles: any[];
  factures: any[];
}

export default function PendingOrdersView({ articles, factures }: PendingOrdersViewProps) {
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

  const handleValidate = (order: any) => {
    setSelectedOrder(order);
    setIsValidating(true);
  };

  const handleDelete = (articleId: string, name: string) => {
    if (!user || !firestore || !articleId) return;
    
    if (window.confirm(`Supprimer définitivement la commande PI "${name}" ?`)) {
      const docRef = doc(firestore, 'users', user.uid, 'articles', articleId);
      deleteDocumentNonBlocking(docRef);
      toast({ 
        title: "Commande PI supprimée", 
        description: name 
      });
    }
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
            Ces commandes n'ont pas encore de facture ni de date d'arrivée. Validez-les dès qu'elles sont expédiées.
          </p>
        </div>
        <div className="bg-amber-50 px-4 py-2 rounded-lg border border-amber-200">
          <div className="text-[10px] text-amber-600 font-bold uppercase">Total en attente</div>
          <div className="text-2xl font-black text-amber-700">{pendingOrders.length} Articles</div>
        </div>
      </div>

      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader className="bg-stone-50">
              <TableRow>
                <TableHead>Fournisseur</TableHead>
                <TableHead>Catégorie / Article</TableHead>
                <TableHead>Date Commande</TableHead>
                <TableHead className="text-right">Qté</TableHead>
                <TableHead className="text-right">Valeur Est.</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {pendingOrders.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={6} className="text-center py-20 text-stone-400 italic">
                    Aucune commande en attente de validation.
                  </TableCell>
                </TableRow>
              ) : (
                pendingOrders.map((o) => (
                  <TableRow key={o.id} className="hover:bg-amber-50/30 transition-colors">
                    <TableCell className="font-bold text-stone-700">{o.supplierId}</TableCell>
                    <TableCell>
                      <div className="font-bold text-stone-900">{o.name}</div>
                      <div className="text-[10px] text-stone-500 uppercase">{o.categoryId} • {o.color || 'DIVERS'}</div>
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-1 text-stone-600 text-sm">
                        <Clock className="w-3 h-3" /> {o.orderDate}
                      </div>
                    </TableCell>
                    <TableCell className="text-right font-bold">
                      {o.quantity.toLocaleString()} <span className="text-[10px] text-stone-400 font-normal">{o.unitOfMeasure}</span>
                    </TableCell>
                    <TableCell className="text-right font-black text-amber-700">
                      {Math.round(o.quantity * o.purchasePricePerUnit).toLocaleString()} €
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex justify-end items-center gap-2">
                        <Button 
                          size="sm" 
                          variant="ghost"
                          className="h-8 w-8 p-0 text-stone-400 hover:text-red-500 hover:bg-red-50"
                          onClick={() => handleDelete(o.id, o.name)}
                          title="Supprimer cette commande PI"
                        >
                          <Trash2 className="w-4 h-4" />
                        </Button>
                        <Button 
                          size="sm" 
                          onClick={() => handleValidate(o)}
                          className="bg-blue-600 hover:bg-blue-700 text-white font-bold gap-1"
                        >
                          Valider Expédition <ArrowRight className="w-3 h-3" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))
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
