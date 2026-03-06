
"use client";

import React, { useMemo, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { ChevronLeft, Package, Trash2, Plus } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { useUser, useFirestore, deleteDocumentNonBlocking, setDocumentNonBlocking } from '@/firebase';
import { doc } from 'firebase/firestore';
import { useToast } from '@/hooks/use-toast';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';

interface CategoriesViewProps {
  articles: any[];
  factures: any[];
  selectedCategory: string | null;
  setSelectedCategory: (category: string | null) => void;
}

export default function CategoriesView({ articles, factures, selectedCategory, setSelectedCategory }: CategoriesViewProps) {
  const { user } = useUser();
  const firestore = useFirestore();
  const { toast } = useToast();
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [newCatName, setNewCatName] = useState('');

  const categoriesData = useMemo(() => {
    const data: Record<string, { qty: number; val: number; count: number; cbm: number }> = {};
    (articles || []).forEach(o => {
      const cat = o.categoryId || 'Inconnu';
      if (!data[cat]) data[cat] = { qty: 0, val: 0, count: 0, cbm: 0 };
      data[cat].qty += o.quantity || 0;
      data[cat].val += ((o.quantity || 0) * (o.purchasePricePerUnit || 0));
      data[cat].cbm += (o.cubicMeasurement || 0);
      data[cat].count += 1;
    });
    return Object.entries(data).sort((a, b) => a[0].localeCompare(b[0]));
  }, [articles]);

  const handleAddCategory = () => {
    if (!user || !firestore || !newCatName.trim()) return;
    const id = crypto.randomUUID();
    const docRef = doc(firestore, 'users', user.uid, 'categories', id);
    setDocumentNonBlocking(docRef, { id, name: newCatName.trim() }, { merge: true });
    toast({ title: "Catégorie créée" });
    setIsModalOpen(false);
    setNewCatName('');
  };

  if (selectedCategory) {
    const catArticles = articles.filter(o => o.categoryId === selectedCategory);
    return (
      <div className="space-y-6 fade-in">
        <div className="flex justify-between items-center">
          <Button variant="ghost" onClick={() => setSelectedCategory(null)}><ChevronLeft className="mr-2" /> Retour</Button>
          <h2 className="text-2xl font-bold">{selectedCategory}</h2>
        </div>
        <Card><CardContent className="p-0"><Table>
          <TableHeader><TableRow><TableHead>Article</TableHead><TableHead className="text-right">Qté</TableHead><TableHead className="text-right">PA</TableHead><TableHead className="text-right">Total</TableHead></TableRow></TableHeader>
          <TableBody>{catArticles.map(o => (
            <TableRow key={o.id}><TableCell className="font-bold">{o.name}</TableCell><TableCell className="text-right">{o.quantity}</TableCell><TableCell className="text-right">{o.purchasePricePerUnit}</TableCell><TableCell className="text-right font-bold">{(o.quantity * o.purchasePricePerUnit).toFixed(2)} €</TableCell></TableRow>
          ))}</TableBody>
        </Table></CardContent></Card>
      </div>
    );
  }

  return (
    <div className="space-y-6 fade-in">
      <div className="flex justify-between items-center">
        <h1 className="text-2xl font-bold">Catégories de Produits</h1>
        <Button onClick={() => setIsModalOpen(true)} className="bg-amber-600 text-white"><Plus className="mr-2" /> Nouvelle Catégorie</Button>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-4 gap-6">
        {categoriesData.map(([name, stats]) => (
          <Card key={name} onClick={() => setSelectedCategory(name)} className="cursor-pointer hover:shadow-md transition-all">
            <CardContent className="p-6">
              <h3 className="text-xl font-bold mb-4">{name}</h3>
              <div className="text-sm text-stone-500">Articles: {stats.count}</div>
              <div className="text-lg font-black text-amber-700 mt-2">{Math.round(stats.val).toLocaleString()} €</div>
            </CardContent>
          </Card>
        ))}
      </div>
      <Dialog open={isModalOpen} onOpenChange={setIsModalOpen}><DialogContent>
        <DialogHeader><DialogTitle>Nouvelle Catégorie</DialogTitle></DialogHeader>
        <Input value={newCatName} onChange={e => setNewCatName(e.target.value)} placeholder="Nom..." />
        <DialogFooter><Button onClick={handleAddCategory} className="bg-amber-600 text-white">Créer</Button></DialogFooter>
      </DialogContent></Dialog>
    </div>
  );
}
