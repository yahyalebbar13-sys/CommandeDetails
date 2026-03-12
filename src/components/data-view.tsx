
"use client";

import React, { useState, useMemo } from 'react';
import { Input } from '@/components/ui/input';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Search, Trash2, Pencil, Box } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useUser, useFirestore, deleteDocumentNonBlocking } from '@/firebase';
import { doc } from 'firebase/firestore';
import { useToast } from '@/hooks/use-toast';
import { Badge } from '@/components/ui/badge';

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

  const isZipperCategory = (cat: string) => {
    const c = cat?.toUpperCase() || "";
    return c.includes("ZIPPER") || c.includes("SLIDER");
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
                  <TableHead className="bg-stone-100">Désignation / Taille</TableHead>
                  <TableHead>Spécifications Techniques</TableHead>
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
                  filteredArticles.map((o, i) => {
                    const isZipper = isZipperCategory(o.categoryId);
                    return (
                      <TableRow key={o.id || i} className="hover:bg-stone-50 transition-colors">
                        <TableCell className="py-4">
                          <div className="font-black text-xs text-stone-900">{o.name}</div>
                          <div className="text-[10px] text-stone-500 uppercase flex items-center gap-2 mt-1">
                            <Badge variant="outline" className="text-[8px] px-1 h-3.5 border-stone-200">{o.categoryId}</Badge>
                            {o.size && <span className="flex items-center gap-1 text-amber-700 font-bold"><Box className="w-2.5 h-2.5" /> {o.size}</span>}
                            <span>• {o.color?.toUpperCase() || 'DIVERS'}</span>
                          </div>
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
                        <TableCell className="text-xs uppercase text-stone-400 font-bold">{o.supplierId}</TableCell>
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
                    );
                  })
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
