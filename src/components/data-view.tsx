"use client";

import React, { useState, useMemo } from 'react';
import { Input } from '@/components/ui/input';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Card, CardContent } from '@/components/ui/card';
import { Search, Trash2, Pencil, Box, Settings2, MousePointer2, Database, Info } from 'lucide-react';
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
      (o.size || '').toLowerCase().includes(term) ||
      (o.specs || '').toLowerCase().includes(term)
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

  const isTechnicalZipper = (cat: string) => {
    const c = cat?.toUpperCase() || "";
    return c.includes("NYLON ZIPPER") || 
           c.includes("PLASTIC ZIPPER") || 
           c.includes("METAL ZIPPER") || 
           c.includes("ALUMINIUM ZIPPER");
  };

  return (
    <div className="fade-in space-y-6">
      <header className="bg-white p-6 rounded-[1.5rem] shadow-lg border border-stone-200 overflow-hidden relative">
        <div className="absolute top-0 right-0 w-64 h-64 bg-amber-500/5 rounded-full -translate-y-1/2 translate-x-1/2 blur-3xl" />
        <div className="flex flex-col md:flex-row justify-between items-center gap-6 relative z-10">
          <div className="flex items-center gap-4">
            <div className="p-3 bg-stone-900 rounded-xl shadow-md">
              <Database className="w-6 h-6 text-amber-500" />
            </div>
            <div>
              <h1 className="text-2xl font-black text-stone-900 uppercase tracking-tighter leading-none">Data Lab Global</h1>
              <p className="text-[9px] text-stone-400 font-bold uppercase tracking-[0.2em] mt-1.5 flex items-center gap-2">
                <Info className="w-3 h-3" /> Audit du patrimoine logistique
              </p>
            </div>
          </div>
          <div className="relative w-full md:w-80">
            <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-stone-400" />
            <Input 
              placeholder="Rechercher un article..." 
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="pl-10 bg-stone-50 border-stone-200 rounded-xl h-11 text-xs font-bold focus:ring-amber-500 transition-all shadow-inner"
            />
          </div>
        </div>
      </header>

      <Card className="border-none shadow-xl rounded-[1.5rem] overflow-hidden bg-white">
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader className="bg-stone-50/80 backdrop-blur-sm">
                <TableRow className="hover:bg-transparent border-stone-100">
                  <TableHead className="text-[9px] font-black uppercase py-4 px-6 text-stone-500 tracking-widest">Désignation</TableHead>
                  <TableHead className="text-[9px] font-black uppercase py-4 text-stone-500 tracking-widest">Taille</TableHead>
                  <TableHead className="text-[9px] font-black uppercase py-4 text-stone-500 tracking-widest">Couleur</TableHead>
                  <TableHead className="text-[9px] font-black uppercase py-4 text-stone-500 tracking-widest">Technique / Specs</TableHead>
                  <TableHead className="text-[9px] font-black uppercase py-4 text-stone-500 tracking-widest">Fournisseur</TableHead>
                  <TableHead className="text-[9px] font-black uppercase py-4 text-stone-500 tracking-widest text-center">Dossier</TableHead>
                  <TableHead className="text-right text-[9px] font-black uppercase py-4 text-stone-500 tracking-widest">Quantité</TableHead>
                  <TableHead className="text-right text-[9px] font-black uppercase py-4 text-stone-500 tracking-widest">Prix Unit.</TableHead>
                  <TableHead className="text-right text-[9px] font-black uppercase py-4 px-6 text-stone-500 tracking-widest bg-amber-50/30">Total ($)</TableHead>
                  <TableHead className="w-[80px]"></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredArticles.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={10} className="text-center py-20 text-stone-300 font-black uppercase text-[10px] tracking-widest bg-stone-50/10">
                      Aucun article répertorié
                    </TableCell>
                  </TableRow>
                ) : (
                  filteredArticles.map((o) => {
                    const isZipper = isTechnicalZipper(o.categoryId);
                    return (
                      <TableRow key={o.id} className="hover:bg-amber-50/10 transition-colors border-stone-50 group">
                        <TableCell className="py-3 px-6">
                          <div className="font-black text-[11px] text-stone-900 uppercase tracking-tight leading-tight">{o.name}</div>
                        </TableCell>
                        <TableCell className="py-3">
                          <span className="text-[10px] text-stone-600 uppercase">{o.size || '-'}</span>
                        </TableCell>
                        <TableCell className="py-3">
                          <span className="text-[9px] text-stone-900 uppercase tracking-wider">
                            {o.color || '-'}
                          </span>
                        </TableCell>
                        <TableCell className="py-3">
                          {isZipper ? (
                            <div className="flex flex-col gap-0.5">
                              <span className="text-amber-600 font-black text-[8px] flex items-center gap-1.5 uppercase">
                                <Settings2 className="w-2.5 h-2.5" /> TYPE: {o.zipperType || '-'}
                              </span>
                              <span className="text-blue-600 font-black text-[8px] flex items-center gap-1.5 uppercase">
                                <MousePointer2 className="w-2.5 h-2.5" /> {o.slider || '-'} ({o.sliderType || '-'})
                              </span>
                            </div>
                          ) : (
                            <div className="text-[9px] text-stone-500 font-bold uppercase leading-tight truncate max-w-[150px]">
                              {o.specs || '-'}
                            </div>
                          )}
                        </TableCell>
                        <TableCell className="py-3">
                          <span className="text-[9px] uppercase text-stone-400 font-black tracking-widest">
                            {o.supplierId || '---'}
                          </span>
                        </TableCell>
                        <TableCell className="py-3 text-center">
                          <span className={`font-black text-[8px] px-2 py-0.5 rounded-full border uppercase ${o.factureId ? 'text-blue-700 bg-blue-50 border-blue-100' : 'text-stone-400 bg-stone-50 border-stone-100'}`}>
                            {o.factureId || 'EN PI'}
                          </span>
                        </TableCell>
                        <TableCell className="text-right py-3 font-black text-[11px] text-stone-900">
                          {o.quantity.toLocaleString()} <span className="text-[8px] text-stone-400 font-bold ml-0.5 uppercase">{o.unitOfMeasure}</span>
                        </TableCell>
                        <TableCell className="text-right py-3 font-black text-[9px] text-amber-700">
                          {Number(o.purchasePricePerUnit).toFixed(4)}
                        </TableCell>
                        <TableCell className="text-right py-3 font-black text-[11px] text-amber-600 bg-amber-50/20 px-6">
                          {Math.round(o.quantity * o.purchasePricePerUnit).toLocaleString()}
                        </TableCell>
                        <TableCell className="py-3 pr-6">
                          <div className="flex justify-end gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                            <Button 
                              variant="ghost" 
                              size="icon" 
                              className="h-7 w-7 text-stone-300 hover:text-amber-600 hover:bg-amber-50 rounded-lg"
                              onClick={() => onEdit(o)}
                            >
                              <Pencil className="w-3.5 h-3.5" />
                            </Button>
                            <Button 
                              variant="ghost" 
                              size="icon" 
                              className="h-7 w-7 text-stone-300 hover:text-red-500 hover:bg-red-50 rounded-lg"
                              onClick={() => handleDelete(o.id, o.name)}
                            >
                              <Trash2 className="w-3.5 h-3.5" />
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
      <footer className="text-center py-2">
        <p className="text-[8px] text-stone-300 font-black uppercase tracking-[0.3em]">Catalogue de données • {filteredArticles.length} articles</p>
      </footer>
    </div>
  );
}
