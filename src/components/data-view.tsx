"use client";

import React, { useState, useMemo } from 'react';
import { Input } from '@/components/ui/input';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Search, Trash2, Pencil } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useUser, useFirestore, deleteDocumentNonBlocking } from '@/firebase';
import { doc } from 'firebase/firestore';
import { useToast } from '@/hooks/use-toast';

interface DataViewProps {
  articles: any[];
  onEdit: (article: any) => void;
}

export default function DataView({ articles, onEdit }: DataViewProps) {
  const { user } = useUser();
  const firestore = useFirestore();
  const { toast } = useToast();
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

  const handleDelete = (articleId: string, name: string) => {
    if (!user || !firestore || !articleId) return;
    
    if (window.confirm(`Supprimer définitivement l'article "${name}" de la base de données ?`)) {
      const docRef = doc(firestore, 'users', user.uid, 'articles', articleId);
      deleteDocumentNonBlocking(docRef);
      toast({ 
        title: "Article supprimé", 
        description: name 
      });
    }
  };

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
                  <TableHead className="text-right">P.A. Unit.</TableHead>
                  <TableHead className="text-right">CBM</TableHead>
                  <TableHead className="text-right bg-orange-50">Valeur Tot.</TableHead>
                  <TableHead className="w-[80px]"></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredArticles.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={10} className="text-center py-12 text-stone-400">Aucun résultat trouvé</TableCell>
                  </TableRow>
                ) : (
                  filteredArticles.map((o, i) => (
                    <TableRow key={o.id || i} className="hover:bg-stone-50 transition-colors">
                      <TableCell className="font-bold text-xs bg-stone-50">{o.categoryId}</TableCell>
                      <TableCell className="font-bold text-xs">{o.name}</TableCell>
                      <TableCell className="text-xs">{o.supplierId}</TableCell>
                      <TableCell className="font-bold text-xs bg-stone-100">{o.factureId || 'PI'}</TableCell>
                      <TableCell className="font-bold text-blue-600 bg-blue-50/30 text-xs">{o.arrivalDate || '-'}</TableCell>
                      <TableCell className="text-right font-bold text-xs">{o.quantity.toLocaleString()}</TableCell>
                      <TableCell className="text-right font-bold text-xs text-amber-600">{Number(o.purchasePricePerUnit).toFixed(4)}</TableCell>
                      <TableCell className="text-right text-emerald-700 font-bold text-xs">{o.cubicMeasurement?.toFixed(2)}</TableCell>
                      <TableCell className="text-right font-black text-amber-700 bg-orange-50/50 text-xs">{(o.quantity * o.purchasePricePerUnit).toLocaleString()} $</TableCell>
                      <TableCell>
                        <div className="flex gap-1">
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