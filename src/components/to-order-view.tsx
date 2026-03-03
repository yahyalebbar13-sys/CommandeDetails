
"use client";

import React, { useState, useMemo } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import { ListTodo, Trash2, ArrowRight, ShoppingCart } from 'lucide-react';
import { useUser, useFirestore } from '@/firebase';
import { doc } from 'firebase/firestore';
import { deleteDocumentNonBlocking } from '@/firebase/non-blocking-updates';
import { useToast } from '@/hooks/use-toast';
import LaunchOrderModal from './launch-order-modal';

interface ToOrderViewProps {
  articles: any[];
}

export default function ToOrderView({ articles }: ToOrderViewProps) {
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

  const handleDelete = (articleId: string, name: string) => {
    if (!user || !firestore || !window.confirm(`Supprimer ce rappel "${name}" ?`)) return;
    const docRef = doc(firestore, 'users', user.uid, 'articles', articleId);
    deleteDocumentNonBlocking(docRef);
    toast({ title: "Rappel supprimé", description: name });
  };

  const handleLaunch = (article: any) => {
    setSelectedArticle(article);
    setIsLaunchModalOpen(true);
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
                <TableHead>Catégorie / Article</TableHead>
                <TableHead>Spécifications</TableHead>
                <TableHead>Couleur</TableHead>
                <TableHead className="text-right">Qté Prévue</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {toOrderArticles.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={5} className="text-center py-20 text-stone-400 italic">
                    Aucun article dans vos rappels "À Commander".
                  </TableCell>
                </TableRow>
              ) : (
                toOrderArticles.map((o) => (
                  <TableRow key={o.id} className="hover:bg-stone-50 transition-colors">
                    <TableCell>
                      <div className="font-bold text-stone-900">{o.name}</div>
                      <div className="text-[10px] text-stone-500 uppercase">{o.categoryId}</div>
                    </TableCell>
                    <TableCell className="text-xs text-stone-600">{o.specs || '-'}</TableCell>
                    <TableCell className="text-xs">{o.color || '-'}</TableCell>
                    <TableCell className="text-right font-bold">
                      {o.quantity.toLocaleString()} <span className="text-[10px] text-stone-400 font-normal">{o.unitOfMeasure}</span>
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex justify-end items-center gap-2">
                        <Button 
                          size="sm" 
                          variant="ghost"
                          className="h-8 w-8 p-0 text-stone-300 hover:text-red-500"
                          onClick={() => handleDelete(o.id, o.name)}
                        >
                          <Trash2 className="w-4 h-4" />
                        </Button>
                        <Button 
                          size="sm" 
                          onClick={() => handleLaunch(o)}
                          className="bg-stone-800 hover:bg-black text-white font-bold gap-1"
                        >
                          Lancer Commande <ArrowRight className="w-3 h-3" />
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

      <LaunchOrderModal 
        open={isLaunchModalOpen}
        onOpenChange={setIsLaunchModalOpen}
        article={selectedArticle}
      />
    </div>
  );
}
