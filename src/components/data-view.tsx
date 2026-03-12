
"use client";

import React, { useState, useMemo } from 'react';
import { Input } from '@/components/ui/input';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
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
      <header className="bg-white p-8 rounded-[2rem] shadow-xl border border-stone-200 overflow-hidden relative">
        <div className="absolute top-0 right-0 w-64 h-64 bg-amber-500/5 rounded-full -translate-y-1/2 translate-x-1/2 blur-3xl" />
        <div className="flex flex-col md:flex-row justify-between items-center gap-6 relative z-10">
          <div className="flex items-center gap-5">
            <div className="p-4 bg-stone-900 rounded-2xl shadow-lg">
              <Database className="w-8 h-8 text-amber-500" />
            </div>
            <div>
              <h1 className="text-3xl font-black text-stone-900 uppercase tracking-tighter leading-none">Base de Données Globale</h1>
              <p className="text-[10px] text-stone-400 font-bold uppercase tracking-[0.2em] mt-2 flex items-center gap-2">
                <Info className="w-3 h-3" /> Audit exhaustif du patrimoine logistique et financier
              </p>
            </div>
          </div>
          <div className="relative w-full md:w-96">
            <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-stone-400" />
            <Input 
              placeholder="Chercher par article, taille, couleur, fournisseur..." 
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="pl-11 bg-stone-50 border-stone-200 rounded-2xl h-14 text-sm font-bold focus:ring-amber-500 focus:border-amber-500 transition-all shadow-inner"
            />
          </div>
        </div>
      </header>

      <Card className="border-none shadow-2xl rounded-[2rem] overflow-hidden bg-white">
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader className="bg-stone-50/80 backdrop-blur-sm">
                <TableRow className="hover:bg-transparent border-stone-100">
                  <TableHead className="text-[10px] font-black uppercase py-6 px-8 text-stone-500 tracking-widest">Désignation / Variante</TableHead>
                  <TableHead className="text-[10px] font-black uppercase py-6 text-stone-500 tracking-widest">Spécifications / Technique</TableHead>
                  <TableHead className="text-[10px] font-black uppercase py-6 text-stone-500 tracking-widest">Fournisseur</TableHead>
                  <TableHead className="text-[10px] font-black uppercase py-6 text-stone-500 tracking-widest text-center">Dossier</TableHead>
                  <TableHead className="text-right text-[10px] font-black uppercase py-6 text-stone-500 tracking-widest">Quantité</TableHead>
                  <TableHead className="text-right text-[10px] font-black uppercase py-6 text-stone-500 tracking-widest">Prix Unit.</TableHead>
                  <TableHead className="text-right text-[10px] font-black uppercase py-6 px-8 text-stone-500 tracking-widest bg-amber-50/30">Total ($)</TableHead>
                  <TableHead className="w-[100px]"></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredArticles.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={8} className="text-center py-32 text-stone-300 font-black uppercase text-xs tracking-widest bg-stone-50/30">
                      Aucune donnée correspondant à votre recherche
                    </TableCell>
                  </TableRow>
                ) : (
                  filteredArticles.map((o) => {
                    const isZipper = isTechnicalZipper(o.categoryId);
                    return (
                      <TableRow key={o.id} className="hover:bg-amber-50/10 transition-colors border-stone-50 group">
                        <TableCell className="py-6 px-8">
                          <div className="font-black text-[13px] text-stone-900 uppercase tracking-tight">{o.name}</div>
                          <div className="flex flex-wrap items-center gap-2 mt-2">
                            <Badge variant="outline" className="text-[8px] font-black uppercase px-2 h-5 border-stone-200 text-stone-400 bg-stone-50">
                              {o.categoryId}
                            </Badge>
                            {o.size && (
                              <Badge className="bg-amber-500 text-white border-none text-[9px] font-black uppercase flex items-center gap-1 h-5 px-2 shadow-sm shadow-amber-500/20">
                                <Box className="w-2.5 h-2.5" /> {o.size}
                              </Badge>
                            )}
                            {o.color && (
                              <span className="text-[10px] text-stone-900 font-black uppercase tracking-wider bg-white border border-stone-100 px-2 py-0.5 rounded shadow-sm">
                                {o.color}
                              </span>
                            )}
                          </div>
                        </TableCell>
                        <TableCell className="py-6">
                          {isZipper ? (
                            <div className="flex flex-col gap-1.5">
                              <span className="text-amber-600 font-black text-[9px] flex items-center gap-2 bg-amber-50 px-2 py-0.5 rounded-full w-fit uppercase">
                                <Settings2 className="w-3 h-3" /> Type: {o.zipperType || '-'}
                              </span>
                              <span className="text-blue-600 font-black text-[9px] flex items-center gap-2 bg-blue-50 px-2 py-0.5 rounded-full w-fit uppercase">
                                <MousePointer2 className="w-3 h-3" /> {o.slider || '-'} ({o.sliderType || '-'})
                              </span>
                            </div>
                          ) : (
                            <div className="text-[10px] text-stone-500 font-bold uppercase leading-relaxed max-w-[200px]">
                              {o.specs || <span className="text-stone-300 italic">Aucun détail</span>}
                            </div>
                          )}
                        </TableCell>
                        <TableCell className="py-6">
                          <span className="text-[10px] uppercase text-stone-400 font-black tracking-widest bg-stone-100/50 px-3 py-1 rounded-lg border border-stone-100">
                            {o.supplierId || '---'}
                          </span>
                        </TableCell>
                        <TableCell className="py-6 text-center">
                          <span className={`font-black text-[9px] px-3 py-1 rounded-full border uppercase ${o.factureId ? 'text-blue-700 bg-blue-50 border-blue-100' : 'text-stone-400 bg-stone-50 border-stone-100'}`}>
                            {o.factureId || 'PI LNC'}
                          </span>
                        </TableCell>
                        <TableCell className="text-right py-6 font-black text-[13px] text-stone-900">
                          {o.quantity.toLocaleString()} <span className="text-[9px] text-stone-400 font-bold ml-1 uppercase">{o.unitOfMeasure}</span>
                        </TableCell>
                        <TableCell className="text-right py-6 font-black text-[11px] text-amber-700">
                          {Number(o.purchasePricePerUnit).toFixed(4)} $
                        </TableCell>
                        <TableCell className="text-right py-6 font-black text-[13px] text-amber-600 bg-amber-50/20 px-8">
                          {(o.quantity * o.purchasePricePerUnit).toLocaleString()} $
                        </TableCell>
                        <TableCell className="py-6 pr-8">
                          <div className="flex justify-end gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                            <Button 
                              variant="ghost" 
                              size="icon" 
                              className="h-9 w-9 text-stone-300 hover:text-amber-600 hover:bg-amber-50 rounded-xl transition-all"
                              onClick={() => onEdit(o)}
                            >
                              <Pencil className="w-4 h-4" />
                            </Button>
                            <Button 
                              variant="ghost" 
                              size="icon" 
                              className="h-9 w-9 text-stone-300 hover:text-red-500 hover:bg-red-50 rounded-xl transition-all"
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
      <footer className="text-center py-4">
        <p className="text-[10px] text-stone-300 font-black uppercase tracking-[0.3em]">Fin du catalogue de données • Total {filteredArticles.length} articles répertoriés</p>
      </footer>
    </div>
  );
}
