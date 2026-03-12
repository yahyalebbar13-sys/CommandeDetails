
"use client";

import React, { useState, useMemo } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import { ListTodo, Trash2, ArrowRight, ShoppingCart, Pencil, Box } from 'lucide-react';
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
    return c.includes("ZIPPER") || c.includes("SLIDER");
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
            Liste des articles dont vous avez besoin. Complétez les informations pour lancer la commande réelle (PI).
          </p>
        </div>
        <div className="bg-stone-50 px-4 py-2 rounded-lg border border-stone-200">
          <div className="text-[10px] text-stone-500 font-bold uppercase">En attente</div>
          <div className="text-2xl font-black text-stone-800">{toOrderArticles.length} Rappels</div>
        </div>
      </div>

      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader className="bg-stone-50">
              <TableRow>
                <TableHead>Article / Catégorie</TableHead>
                <TableHead>Spécifications Techniques</TableHead>
                <TableHead>Taille</TableHead>
                <TableHead>Couleur</TableHead>
                <TableHead className="text-right">Qté Prévue</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {toOrderArticles.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={6} className="text-center py-20 text-stone-400 italic">
                    Aucun article dans vos rappels "À Commander".
                  </TableCell>
                </TableRow>
              ) : (
                toOrderArticles.map((o) => {
                  const isZipper = isZipperCategory(o.categoryId);
                  return (
                    <TableRow key={o.id} className="hover:bg-stone-50 transition-colors">
                      <TableCell>
                        <div className="font-bold text-stone-900">{o.name}</div>
                        <div className="text-[10px] text-stone-500 uppercase">{o.categoryId}</div>
                      </TableCell>
                      <TableCell className="text-[10px]">
                        {isZipper ? (
                          <div className="flex flex-col gap-0.5">
                            <span className="text-amber-600 font-black">TYPE: {o.zipperType || '-'}</span>
                            <span className="text-blue-600 font-black">SLIDER: {o.slider || '-'} ({o.sliderType || '-'})</span>
                          </div>
                        ) : (
                          <span className="text-stone-500 font-bold">{o.specs || '-'}</span>
                        )}
                      </TableCell>
                      <TableCell className="text-xs font-black text-amber-700">
                        {o.size ? <span className="flex items-center gap-1"><Box className="w-2.5 h-2.5" /> {o.size}</span> : '-'}
                      </TableCell>
                      <TableCell className="text-xs uppercase">{o.color || '-'}</TableCell>
                      <TableCell className="text-right font-bold">
                        {o.quantity.toLocaleString()} <span className="text-[10px] text-stone-400 font-normal">{o.unitOfMeasure}</span>
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex justify-end items-center gap-1">
                          <Button 
                            variant="ghost" 
                            size="icon" 
                            className="text-stone-400 hover:text-amber-600"
                            onClick={() => onEdit(o)}
                            title="Modifier"
                          >
                            <Pencil className="w-4 h-4" />
                          </Button>
                          <Button 
                            variant="ghost" 
                            size="icon" 
                            className="text-stone-400 hover:text-red-500"
                            onClick={() => handleActionDelete(o.id, o.name)}
                            title="Supprimer ce rappel"
                          >
                            <Trash2 className="w-4 h-4" />
                          </Button>
                          <Button 
                            size="sm" 
                            onClick={() => setSelectedArticle(o) || setIsLaunchModalOpen(true)}
                            className="bg-stone-800 hover:bg-black text-white font-bold gap-1"
                          >
                            Lancer Commande <ArrowRight className="w-3 h-3" />
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
