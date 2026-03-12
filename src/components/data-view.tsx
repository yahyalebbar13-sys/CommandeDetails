
"use client";

import React, { useState, useMemo } from 'react';
import { Input } from '@/components/ui/input';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Search, Trash2, Pencil, Box, Settings2, MousePointer2 } from 'lucide-react';
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
      (o.color || '').toLowerCase().includes(term) ||
      (o.size || '').toLowerCase().includes(term)
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
    return c.includes("NYLON ZIPPER") || 
           c.includes("PLASTIC ZIPPER") || 
           c.includes("METAL ZIPPER") || 
           c.includes("ALUMINIUM ZIPPER");
  };

  return (
    <div className="fade-in space-y-4">
      <Card className="border-none shadow-xl rounded-2xl overflow-hidden bg-white">
        <CardHeader className="flex flex-col sm:flex-row justify-between items-center space-y-4 sm:space-y-0 pb-6 border-b border-stone-100">
          <div>
            <CardTitle className="text-xl font-black text-stone-900 uppercase tracking-tight">Base de Données Globale</CardTitle>
            <p className="text-[10px] text-stone-400 font-bold uppercase tracking-widest mt-1">Audit exhaustif du portefeuille logistique</p>
          </div>
          <div className="relative w-full sm:w-80">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-stone-400" />
            <Input 
              placeholder="Chercher article, taille, couleur..." 
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="pl-9 bg-stone-50 border-stone-200 rounded-xl h-11 text-xs font-bold"
            />
          </div>
        </CardHeader>
        <CardContent className="p-0">
          <div className="overflow-x-auto max-h-[70vh]">
            <Table>
              <TableHeader className="bg-stone-50 sticky top-0 z-10">
                <TableRow>
                  <TableHead className="text-[10px] font-black uppercase py-4">Désignation / Taille / Couleur</TableHead>
                  <TableHead className="text-[10px] font-black uppercase py-4">Technique / Spécifications</TableHead>
                  <TableHead className="text-[10px] font-black uppercase py-4">Fournisseur</TableHead>
                  <TableHead className="text-[10px] font-black uppercase py-4 bg-stone-100/50">Dossier</TableHead>
                  <TableHead className="text-[10px] font-black uppercase py-4">Arrivée</TableHead>
                  <TableHead className="text-right text-[10px] font-black uppercase py-4">Qté</TableHead>
                  <TableHead className="text-right text-[10px] font-black uppercase py-4">P.A.</TableHead>
                  <TableHead className="text-right text-[10px] font-black uppercase py-4 bg-amber-50/30">Total</TableHead>
                  <TableHead className="w-[80px]"></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredArticles.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={9} className="text-center py-20 text-stone-400 font-black uppercase text-xs">Aucun résultat trouvé</TableCell>
                  </TableRow>
                ) : (
                  filteredArticles.map((o, i) => {
                    const isZipper = isZipperCategory(o.categoryId);
                    return (
                      <TableRow key={o.id || i} className="hover:bg-stone-50 transition-colors border-stone-50 group">
                        <TableCell className="py-4">
                          <div className="font-black text-xs text-stone-900 uppercase">{o.name}</div>
                          <div className="flex items-center gap-3 mt-1.5">
                            <Badge variant="outline" className="text-[8px] font-black uppercase px-1 h-4 border-stone-200">{o.categoryId}</Badge>
                            {o.size && <Badge className="bg-amber-100 text-amber-800 border-amber-200 text-[9px] font-black uppercase flex items-center gap-1"><Box className="w-2.5 h-2.5" /> {o.size}</Badge>}
                            {o.color && <span className="text-[10px] text-stone-900 font-black uppercase">{o.color}</span>}
                          </div>
                        </TableCell>
                        <TableCell className="text-[10px]">
                          {isZipper ? (
                            <div className="flex flex-col gap-1">
                              <span className="text-amber-600 font-black flex items-center gap-1.5"><Settings2 className="w-3 h-3" /> {o.zipperType || '-'}</span>
                              <span className="text-blue-600 font-black flex items-center gap-1.5"><MousePointer2 className="w-3 h-3" /> {o.slider || '-'}</span>
                            </div>
                          ) : (
                            <span className="text-stone-500 font-bold uppercase">{o.specs || '-'}</span>
                          )}
                        </TableCell>
                        <TableCell className="text-[10px] uppercase text-stone-400 font-black">{o.supplierId}</TableCell>
                        <TableCell className="font-black text-[10px] bg-stone-100/30 uppercase">{o.factureId || 'PI'}</TableCell>
                        <TableCell className="font-black text-blue-600 text-[10px] uppercase">{o.arrivalDate || '-'}</TableCell>
                        <TableCell className="text-right font-black text-xs">{o.quantity.toLocaleString()}</TableCell>
                        <TableCell className="text-right font-black text-[10px] text-amber-700">{Number(o.purchasePricePerUnit).toFixed(4)}</TableCell>
                        <TableCell className="text-right font-black text-amber-700 bg-amber-50/20 text-xs">{(o.quantity * o.purchasePricePerUnit).toLocaleString()} $</TableCell>
                        <TableCell>
                          <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
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
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
