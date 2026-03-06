"use client";

import React, { useMemo, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Label } from '@/components/ui/label';
import { 
  ChevronLeft, 
  Plus, 
  Package, 
  Ship, 
  CheckCircle2,
  Clock,
  ArrowRight,
  BarChart3,
  Box,
  Layers,
  Settings
} from 'lucide-react';
import { useUser, useFirestore } from '@/firebase';
import { doc } from 'firebase/firestore';
import { setDocumentNonBlocking } from '@/firebase/non-blocking-updates';
import { useToast } from '@/hooks/use-toast';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { 
  ResponsiveContainer, 
  XAxis, 
  YAxis, 
  CartesianGrid, 
  Tooltip as RechartsTooltip, 
  LineChart, 
  Line 
} from 'recharts';

interface CategoriesViewProps {
  articles: any[];
  factures: any[];
  generalCategories: any[];
  subCategories: any[];
  selectedCategory: string | null;
  setSelectedCategory: (category: string | null) => void;
  selectedGeneralCategoryId: string | null;
  onSelectGeneralCategory: (id: string) => void;
}

const CAT_COLORS = [
  'border-t-amber-500',
  'border-t-orange-600',
  'border-t-red-700',
  'border-t-stone-800',
  'border-t-blue-600',
  'border-t-emerald-600'
];

export default function CategoriesView({ 
  articles = [], 
  factures = [], 
  generalCategories = [], 
  subCategories = [],
  selectedCategory, 
  setSelectedCategory, 
  selectedGeneralCategoryId,
  onSelectGeneralCategory
}: CategoriesViewProps) {
  
  const { user } = useUser();
  const firestore = useFirestore();
  const { toast } = useToast();
  
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [newCatName, setNewCatName] = useState('');
  const [targetGenCatId, setTargetGenCatId] = useState(selectedGeneralCategoryId || '');

  const now = useMemo(() => new Date(), []);

  // 1. Logic for main category list
  const mainCategoriesList = useMemo(() => {
    return generalCategories.map(gc => {
      const relatedArticles = articles.filter(a => a.generalCategoryId === gc.id);
      const totalVal = relatedArticles.reduce((sum, a) => sum + (Number(a.quantity) * Number(a.purchasePricePerUnit)), 0);
      const subCount = subCategories.filter(sc => sc.generalCategoryId === gc.id).length;
      return { ...gc, totalVal, subCount };
    });
  }, [generalCategories, articles, subCategories]);

  // 2. Logic for sub-categories of a selected main category
  const subCategoriesList = useMemo(() => {
    if (!selectedGeneralCategoryId) return [];
    return subCategories
      .filter(sc => sc.generalCategoryId === selectedGeneralCategoryId)
      .map(sc => {
        const relatedArticles = articles.filter(a => a.categoryId === sc.name);
        const totalVal = relatedArticles.reduce((sum, a) => sum + (Number(a.quantity) * Number(a.purchasePricePerUnit)), 0);
        
        // Group totals by unit
        const totalsByUnit: Record<string, number> = {};
        relatedArticles.forEach(a => {
          const unit = a.unitOfMeasure || 'pcs';
          totalsByUnit[unit] = (totalsByUnit[unit] || 0) + Number(a.quantity);
        });

        return { ...sc, totalVal, totalsByUnit };
      });
  }, [selectedGeneralCategoryId, subCategories, articles]);

  // 3. Logic for detailed view of a specific sub-category
  const detailData = useMemo(() => {
    if (!selectedCategory) return null;
    const catArticles = articles.filter(a => a.categoryId === selectedCategory);
    
    const transit = catArticles.filter(a => {
      const arrival = a.arrivalDate ? new Date(a.arrivalDate) : null;
      return a.status === 'SHIPPED' && arrival && arrival > now;
    });

    const arrived = catArticles.filter(a => {
      const arrival = a.arrivalDate ? new Date(a.arrivalDate) : null;
      return a.status === 'SHIPPED' && arrival && arrival <= now;
    });

    const pending = catArticles.filter(a => a.status !== 'SHIPPED');

    // Totals by unit for summary
    const totals: Record<string, number> = {};
    catArticles.forEach(a => {
      const unit = a.unitOfMeasure || 'pcs';
      totals[unit] = (totals[unit] || 0) + Number(a.quantity);
    });

    return { transit, arrived, pending, totals };
  }, [selectedCategory, articles, now]);

  const handleAddCategory = () => {
    if (!user || !firestore || !newCatName.trim() || !targetGenCatId) return;
    const id = crypto.randomUUID();
    const docRef = doc(firestore, 'users', user.uid, 'categories', id);
    setDocumentNonBlocking(docRef, { id, name: newCatName.trim().toUpperCase(), generalCategoryId: targetGenCatId }, { merge: true });
    toast({ title: "Sous-catégorie créée" });
    setIsModalOpen(false);
    setNewCatName('');
  };

  // --- RENDERING ---

  // 1. Detailed Sub-category View (Tables first)
  if (selectedCategory && detailData) {
    return (
      <div className="space-y-6 fade-in">
        <div className="flex items-center justify-between">
          <Button variant="ghost" onClick={() => setSelectedCategory(null)} className="text-stone-500 gap-2">
            <ChevronLeft className="w-4 h-4" /> Retour
          </Button>
          <h2 className="text-2xl font-black text-stone-900 uppercase">{selectedCategory}</h2>
          <div className="flex gap-4">
            {Object.entries(detailData.totals).map(([unit, val]) => (
              <div key={unit} className="text-right">
                <p className="text-[10px] font-bold text-stone-400 uppercase">{unit}</p>
                <p className="text-lg font-bold text-stone-900">{val.toLocaleString()}</p>
              </div>
            ))}
          </div>
        </div>

        <div className="grid grid-cols-1 gap-8">
          {/* Table 1: In Transit */}
          <section className="space-y-3">
            <div className="flex items-center gap-2 border-b pb-2">
              <Ship className="w-5 h-5 text-blue-600" />
              <h3 className="text-sm font-bold uppercase tracking-widest text-stone-700">En Transit</h3>
            </div>
            <div className="bg-white border rounded-lg overflow-hidden shadow-sm">
              <Table>
                <TableHeader className="bg-stone-50">
                  <TableRow>
                    <TableHead>Article</TableHead>
                    <TableHead>Facture</TableHead>
                    <TableHead>Arrivée Prévue</TableHead>
                    <TableHead className="text-right">Quantité</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {detailData.transit.length > 0 ? detailData.transit.map(a => (
                    <TableRow key={a.id}>
                      <TableCell className="font-medium">{a.name}</TableCell>
                      <TableCell className="font-mono text-xs text-stone-500">{a.factureId}</TableCell>
                      <TableCell className="text-blue-600 font-medium">{a.arrivalDate}</TableCell>
                      <TableCell className="text-right font-bold">{a.quantity.toLocaleString()} {a.unitOfMeasure}</TableCell>
                    </TableRow>
                  )) : <TableRow><TableCell colSpan={4} className="text-center py-8 text-stone-400">Aucun article en transit</TableCell></TableRow>}
                </TableBody>
              </Table>
            </div>
          </section>

          {/* Table 2: Arrived */}
          <section className="space-y-3">
            <div className="flex items-center gap-2 border-b pb-2">
              <CheckCircle2 className="w-5 h-5 text-emerald-600" />
              <h3 className="text-sm font-bold uppercase tracking-widest text-stone-700">Stock Arrivé</h3>
            </div>
            <div className="bg-white border rounded-lg overflow-hidden shadow-sm">
              <Table>
                <TableHeader className="bg-stone-50">
                  <TableRow>
                    <TableHead>Article</TableHead>
                    <TableHead>Facture</TableHead>
                    <TableHead>Date d'Entrée</TableHead>
                    <TableHead className="text-right">Quantité</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {detailData.arrived.length > 0 ? detailData.arrived.map(a => (
                    <TableRow key={a.id}>
                      <TableCell className="font-medium">{a.name}</TableCell>
                      <TableCell className="font-mono text-xs text-stone-500">{a.factureId}</TableCell>
                      <TableCell className="text-stone-500">{a.arrivalDate}</TableCell>
                      <TableCell className="text-right font-bold">{a.quantity.toLocaleString()} {a.unitOfMeasure}</TableCell>
                    </TableRow>
                  )) : <TableRow><TableCell colSpan={4} className="text-center py-8 text-stone-400">Aucun stock disponible</TableCell></TableRow>}
                </TableBody>
              </Table>
            </div>
          </section>

          {/* Table 3: Pending */}
          <section className="space-y-3">
            <div className="flex items-center gap-2 border-b pb-2">
              <Clock className="w-5 h-5 text-amber-600" />
              <h3 className="text-sm font-bold uppercase tracking-widest text-stone-700">En Attente / Production</h3>
            </div>
            <div className="bg-white border rounded-lg overflow-hidden shadow-sm">
              <Table>
                <TableHeader className="bg-stone-50">
                  <TableRow>
                    <TableHead>Article</TableHead>
                    <TableHead>Statut</TableHead>
                    <TableHead>Date Commande</TableHead>
                    <TableHead className="text-right">Quantité</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {detailData.pending.length > 0 ? detailData.pending.map(a => (
                    <TableRow key={a.id}>
                      <TableCell className="font-medium">{a.name}</TableCell>
                      <TableCell><Badge variant="outline" className="text-amber-700 bg-amber-50">{a.status}</Badge></TableCell>
                      <TableCell className="text-stone-500">{a.orderDate}</TableCell>
                      <TableCell className="text-right font-bold">{a.quantity.toLocaleString()} {a.unitOfMeasure}</TableCell>
                    </TableRow>
                  )) : <TableRow><TableCell colSpan={4} className="text-center py-8 text-stone-400">Aucune commande en attente</TableCell></TableRow>}
                </TableBody>
              </Table>
            </div>
          </section>
        </div>
      </div>
    );
  }

  // 2. Sub-categories of a specific Main Category
  if (selectedGeneralCategoryId) {
    return (
      <div className="space-y-6 fade-in">
        <div className="flex items-center justify-between">
          <Button variant="ghost" onClick={() => onSelectGeneralCategory('')} className="text-stone-500 gap-2">
            <ChevronLeft className="w-4 h-4" /> Retour aux Groupes
          </Button>
          <Button onClick={() => setIsModalOpen(true)} variant="outline" className="gap-2 text-xs font-bold uppercase border-stone-300">
            <Plus className="w-4 h-4" /> Nouvelle Sous-Catégorie
          </Button>
        </div>
        
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {subCategoriesList.map((sc, idx) => (
            <Card 
              key={sc.id} 
              className="border-none shadow-sm hover:ring-2 hover:ring-amber-500/20 cursor-pointer transition-all"
              onClick={() => setSelectedCategory(sc.name)}
            >
              <CardContent className="p-5">
                <div className="flex justify-between items-start mb-4">
                  <h3 className="text-lg font-bold text-stone-900">{sc.name}</h3>
                  <Box className="w-5 h-5 text-amber-600" />
                </div>
                <div className="space-y-2">
                  <div className="flex justify-between items-center">
                    <span className="text-xs text-stone-500 uppercase font-medium">Valeur Totale</span>
                    <span className="text-sm font-bold text-stone-900">{Math.round(sc.totalVal).toLocaleString()} €</span>
                  </div>
                  <div className="border-t pt-2 mt-2">
                    <p className="text-[10px] text-stone-400 uppercase font-bold mb-1">Stock Actuel</p>
                    <div className="flex flex-wrap gap-2">
                      {Object.entries(sc.totalsByUnit).map(([unit, val]) => (
                        <span key={unit} className="text-xs font-bold px-2 py-0.5 bg-stone-100 rounded text-stone-700">
                          {val.toLocaleString()} {unit}
                        </span>
                      ))}
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
        
        {/* Modal for adding sub-category */}
        <Dialog open={isModalOpen} onOpenChange={setIsModalOpen}>
          <DialogContent className="max-w-md">
            <DialogHeader><DialogTitle>Nouvelle Sous-Catégorie</DialogTitle></DialogHeader>
            <div className="space-y-4 py-4">
              <div className="space-y-2">
                <Label>Groupe Parent</Label>
                <Select value={targetGenCatId} onValueChange={setTargetGenCatId}>
                  <SelectTrigger>
                    <SelectValue placeholder="Sélectionner un groupe..." />
                  </SelectTrigger>
                  <SelectContent>
                    {generalCategories.map(gc => (
                      <SelectItem key={gc.id} value={gc.id}>{gc.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Nom de la Sous-Catégorie</Label>
                <Input 
                  value={newCatName} 
                  onChange={(e) => setNewCatName(e.target.value)}
                  placeholder="Ex: Fermetures"
                />
              </div>
            </div>
            <DialogFooter>
              <Button onClick={handleAddCategory} className="bg-amber-600">Enregistrer</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    );
  }

  // 3. Main Groups List
  return (
    <div className="space-y-6 fade-in">
      <div className="flex justify-between items-center">
        <h2 className="text-2xl font-black text-stone-900 uppercase">Groupes de Produits</h2>
        <Button onClick={() => setIsModalOpen(true)} className="bg-stone-900 text-white gap-2 font-bold uppercase text-xs">
          <Plus className="w-4 h-4" /> Nouveau Groupe
        </Button>
      </div>
      
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {mainCategoriesList.map((gc, idx) => (
          <Card 
            key={gc.id} 
            className={`border-t-4 ${CAT_COLORS[idx % CAT_COLORS.length]} shadow-sm hover:shadow-md cursor-pointer transition-all`}
            onClick={() => onSelectGeneralCategory(gc.id)}
          >
            <CardContent className="p-6">
              <div className="flex justify-between items-start mb-4">
                <h3 className="text-xl font-bold text-stone-900">{gc.name}</h3>
                <Layers className="w-5 h-5 text-stone-400" />
              </div>
              <div className="grid grid-cols-2 gap-4 mt-6">
                <div>
                  <p className="text-[10px] text-stone-500 uppercase font-bold">Sous-catégories</p>
                  <p className="text-lg font-bold text-stone-900">{gc.subCount}</p>
                </div>
                <div>
                  <p className="text-[10px] text-stone-500 uppercase font-bold">Valeur Globale</p>
                  <p className="text-lg font-bold text-stone-900">{Math.round(gc.totalVal).toLocaleString()} €</p>
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      <Dialog open={isModalOpen} onOpenChange={setIsModalOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle>Nouveau Groupe de Produits</DialogTitle></DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label>Nom du Groupe</Label>
              <Input 
                value={newCatName} 
                onChange={(e) => setNewCatName(e.target.value)}
                placeholder="Ex: Textiles, Mercerie..."
              />
            </div>
          </div>
          <DialogFooter>
            <Button onClick={handleAddGeneralCategory} className="bg-amber-600">Créer le groupe</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
