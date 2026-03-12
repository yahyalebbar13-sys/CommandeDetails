
"use client";

import React, { useState, useMemo } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import { ListTodo, Trash2, ArrowRight, ShoppingCart, Pencil, Box, Badge, Settings2, MousePointer2 } from 'lucide-react';
import { useUser, useFirestore, deleteDocumentNonBlocking } from '@/firebase';
import { doc } from 'firebase/firestore';
import { useToast } from '@/hooks/use-toast';
import LaunchOrderModal from './launch-order-modal';

interface ToOrderViewProps {
  articles: any[];
  onEdit: (article: any) => void;
}

export default function ToOrderView({ articles, onEdit }: ToOrderViewProps) {
  const { user } = useUser();
  const firestore = useFirestore();
  const { toast } = useToast();
  const [selectedArticle, setSelectedArticle] = useState<any>(null);
  const [isLaunchModalOpen, setIsLaunchModalOpen] = useState(false);

  const toOrderArticles = useMemo(() => {
    return articles
      .filter(o => o.status === 'TO_ORDER')
      .sort((a, b) => (b.createdAt?.seconds || 0) - (a.createdAt?.seconds || 0));
  }, [articles]);

  const handleActionDelete = (id: string, name: string) => {
    if (!user || !firestore || !id) return;
    
    if (window.confirm(`Supprimer ce rappel pour "${name}" ?`)) {
      const docRef = doc(firestore, 'users', user.uid, 'articles', id);
      deleteDocumentNonBlocking(docRef);
      toast({ 
        title: "Rappel supprimé", 
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
      <div className="bg-white rounded-xl shadow-sm border border-stone-100 p-6 flex flex-col md:flex-row justify-between items-start md:items-center gap-4 border-l-8 border-l-stone-800">
        <div>
          <h2 className="text-3xl font-bold text-stone-900 flex items-center gap-2">
            <ListTodo className="w-8 h-8 text-stone-600" />
            Articles À Commander
          </h2>
          <p className="text-stone-600 mt-1">
            Liste des besoins identifiés en attente de commande officielle.
          </p>
        </div>
        <div className="bg-stone-50 px-4 py-2 rounded-lg border border-stone-200">
          <div className="text-[10px] text-stone-500 font-black uppercase">Rappels en cours</div>
          <div className="text-2xl font-black text-stone-800">{toOrderArticles.length} Besoins</div>
        </div>
      </div>

      <Card className="border-none shadow-xl rounded-2xl overflow-hidden">
        <CardContent className="p-0">
          <Table>
            <TableHeader className="bg-stone-50/80">
              <TableRow>
                <TableHead className="text-[10px] font-black uppercase py-4">Désignation</TableHead>
                <TableHead className="text-[10px] font-black uppercase py-4">Taille</TableHead>
                <TableHead className="text-[10px] font-black uppercase py-4">Couleur</TableHead>
                <TableHead className="text-[10px] font-black uppercase py-4">Technique / Specs</TableHead>
                <TableHead className="text-right text-[10px] font-black uppercase py-4">Quantité Prévue</TableHead>
                <TableHead className="text-right text-[10px] font-black uppercase py-4">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {toOrderArticles.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={6} className="text-center py-20 text-stone-400 italic font-bold">
                    Aucun besoin identifié pour le moment.
                  </TableCell>
                </TableRow>
              ) : (
                toOrderArticles.map((o) => {
                  const isZipper = isZipperCategory(o.categoryId);
                  return (
                    <TableRow key={o.id} className="hover:bg-stone-50 transition-colors border-stone-50">
                      <TableCell className="py-3">
                        <div className="font-black text-stone-900 text-xs uppercase">{o.name}</div>
                      </TableCell>
                      <TableCell className="py-3">
                        {o.size && <Badge className="bg-amber-500 text-white border-none text-[8px] font-black uppercase flex items-center gap-1 h-4 px-1.5"><Box className="w-2 h-2" /> {o.size}</Badge>}
                      </TableCell>
                      <TableCell className="py-3">
                        <span className="text-[10px] text-stone-900 font-black uppercase">{o.color || '-'}</span>
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
                      <TableCell className="text-right font-black text-xs py-3">
                        {o.quantity.toLocaleString()} <span className="text-[9px] text-stone-400 font-bold ml-1 uppercase">{o.unitOfMeasure}</span>
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
                            onClick={() => setSelectedArticle(o) || setIsLaunchModalOpen(true)}
                            className="bg-stone-900 hover:bg-black text-white font-black uppercase text-[9px] tracking-widest px-4 h-8 rounded-lg ml-2"
                          >
                            Commander <ArrowRight className="w-3 h-3 ml-1" />
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

      <LaunchOrderModal 
        open={isLaunchModalOpen}
        onOpenChange={setIsLaunchModalOpen}
        article={selectedArticle}
      />
    </div>
  );
}
