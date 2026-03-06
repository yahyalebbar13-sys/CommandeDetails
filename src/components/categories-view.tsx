"use client";

import React, { useMemo, useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { ChevronLeft, Package, Calendar, Clock, TrendingUp, BarChart3, PieChart as PieIcon, Info, Trash2, Plus, FilterX, LineChart as LineIcon, Truck, Cuboid } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { useUser, useFirestore, deleteDocumentNonBlocking, setDocumentNonBlocking, useCollection, useMemoFirebase } from '@/firebase';
import { doc, collection } from 'firebase/firestore';
import { useToast } from '@/hooks/use-toast';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { 
  BarChart, 
  Bar, 
  XAxis, 
  YAxis, 
  CartesianGrid, 
  Tooltip, 
  ResponsiveContainer, 
  PieChart, 
  Pie, 
  Cell,
  LineChart,
  Line,
  Legend
} from 'recharts';

interface CategoriesViewProps {
  articles: any[];
  factures: any[];
  selectedCategory: string | null;
  setSelectedCategory: (category: string | null) => void;
  initialGeneralCategoryId?: string | null;
  subCategories: any[];
}

export default function CategoriesView({ articles, factures, selectedCategory, setSelectedCategory, initialGeneralCategoryId, subCategories }: CategoriesViewProps) {
  const { user } = useUser();
  const firestore = useFirestore();
  const { toast } = useToast();
  
  const genCatsRef = useMemoFirebase(() => {
    if (!firestore || !user) return null;
    return collection(firestore, 'users', user.uid, 'generalCategories');
  }, [firestore, user]);
  const { data: generalCategories = [] } = useCollection(genCatsRef);

  const [isModalOpen, setIsModalOpen] = useState(false);
  const [newSubCat, setNewSubCat] = useState({ name: '', generalCategoryId: initialGeneralCategoryId || '' });
  const [filterGenCatId, setFilterGenCatId] = useState<string | null>(initialGeneralCategoryId || null);

  useEffect(() => {
    if (initialGeneralCategoryId) {
      setFilterGenCatId(initialGeneralCategoryId);
    }
  }, [initialGeneralCategoryId]);

  const filteredCategoriesNames = useMemo(() => {
    if (!filterGenCatId) return null;
    return (subCategories || [])
      .filter(sc => sc.generalCategoryId === filterGenCatId)
      .map(sc => sc.name);
  }, [filterGenCatId, subCategories]);

  const categoriesData = useMemo(() => {
    const data: Record<string, { qty: number; val: number; count: number; cbm: number }> = {};
    (articles || []).forEach(o => {
      const cat = o.categoryId || 'Inconnu';
      
      if (filteredCategoriesNames && !filteredCategoriesNames.includes(cat)) return;

      if (!data[cat]) data[cat] = { qty: 0, val: 0, count: 0, cbm: 0 };
      data[cat].qty += o.quantity || 0;
      data[cat].val += ((o.quantity || 0) * (o.purchasePricePerUnit || 0));
      data[cat].cbm += (o.cubicMeasurement || 0);
      data[cat].count += 1;
    });
    return Object.entries(data).sort((a, b) => a[0].localeCompare(b[0]));
  }, [articles, filteredCategoriesNames]);

  const handleAddSubCategory = () => {
    if (!user || !firestore || !newSubCat.name.trim() || !newSubCat.generalCategoryId) return;
    const id = crypto.randomUUID();
    const docRef = doc(firestore, 'users', user.uid, 'categories', id);
    setDocumentNonBlocking(docRef, { ...newSubCat, id, name: newSubCat.name.trim() }, { merge: true });
    toast({ title: "Sous-catégorie créée", description: newSubCat.name });
    setIsModalOpen(false);
    setNewSubCat({ name: '', generalCategoryId: filterGenCatId || '' });
  };

  const activeGenCatName = useMemo(() => {
    if (!filterGenCatId) return null;
    return (generalCategories || [])?.find(gc => gc.id === filterGenCatId)?.name;
  }, [filterGenCatId, generalCategories]);

  if (selectedCategory) {
    return (
      <CategoryDetailView 
        categoryName={selectedCategory} 
        articles={articles || []} 
        onBack={() => setSelectedCategory(null)} 
      />
    );
  }

  return (
    <div className="space-y-6 fade-in">
      <div className="bg-white rounded-xl shadow-sm border border-stone-100 p-6 flex flex-col md:flex-row justify-between items-center gap-4">
        <div>
          <h1 className="text-3xl font-bold text-stone-800 mb-2">Sous-catégories de Produits</h1>
          <p className="text-stone-600">
            {activeGenCatName ? `Affichage des types de produits du groupe : ${activeGenCatName}` : 'Détail analytique par type de produit spécifique.'}
          </p>
        </div>
        <div className="flex gap-2">
          {filterGenCatId && (
            <Button variant="outline" onClick={() => setFilterGenCatId(null)} className="gap-2 border-stone-200">
              <FilterX className="w-4 h-4" /> Effacer filtre
            </Button>
          )}
          <Button onClick={() => setIsModalOpen(true)} className="bg-amber-600 hover:bg-amber-700 text-white font-bold gap-2">
            <Plus className="w-5 h-5" /> Nouvelle Sous-catégorie
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
        {categoriesData.length === 0 ? (
          <div className="col-span-full py-20 text-center text-stone-400 border-2 border-dashed border-stone-100 rounded-xl">
            Aucun article trouvé dans cette sélection.
          </div>
        ) : categoriesData.map(([name, stats]) => (
          <Card 
            key={name} 
            onClick={() => setSelectedCategory(name)}
            className="cursor-pointer hover:shadow-md hover:border-amber-300 transition-all flex flex-col"
          >
            <CardContent className="p-6 flex flex-col h-full">
              <div className="flex-grow">
                <h3 className="text-xl font-bold text-stone-800 group-hover:text-amber-600 mb-4">{name}</h3>
                <div className="flex justify-between text-sm mb-1">
                  <span className="text-stone-500">Volume (CBM):</span>
                  <span className="font-bold text-emerald-700">{stats.cbm.toFixed(2)} m³</span>
                </div>
                <div className="flex justify-between text-sm mb-1">
                  <span className="text-stone-500">Quantité:</span>
                  <span className="font-bold">{stats.qty.toLocaleString()}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-stone-500">Articles:</span>
                  <span className="font-medium">{stats.count}</span>
                </div>
              </div>
              <div className="mt-4 pt-4 border-t border-stone-100 text-lg font-black text-amber-700">
                {Math.round(stats.val).toLocaleString()} €
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      <Dialog open={isModalOpen} onOpenChange={setIsModalOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Nouvelle Sous-catégorie</DialogTitle>
          </DialogHeader>
          <div className="py-4 space-y-4">
            <div className="space-y-1">
              <label className="text-sm font-bold text-stone-700">Nom de la Sous-catégorie</label>
              <Input 
                value={newSubCat.name} 
                onChange={e => setNewSubCat(p => ({...p, name: e.target.value}))}
                placeholder="Ex: Zip N°5, Fil 40/2..."
              />
            </div>
            <div className="space-y-1">
              <label className="text-sm font-bold text-stone-700">Grouper dans (Catégorie Générale)</label>
              <Select 
                value={newSubCat.generalCategoryId} 
                onValueChange={v => setNewSubCat(p => ({...p, generalCategoryId: v}))}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Choisir un groupe..." />
                </SelectTrigger>
                <SelectContent>
                  {(generalCategories || []).map(gc => (
                    <SelectItem key={gc.id} value={gc.id}>{gc.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsModalOpen(false)}>Annuler</Button>
            <Button onClick={handleAddSubCategory} className="bg-amber-600 text-white">Enregistrer</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function CategoryDetailView({ categoryName, articles, onBack }: { categoryName: string, articles: any[], onBack: () => void }) {
  const catArticles = useMemo(() => articles.filter(o => o.categoryId === categoryName), [articles, categoryName]);
  
  const now = new Date();
  const transit = catArticles.filter(o => o.factureId && new Date(o.arrivalDate) > now);
  const arrived = catArticles.filter(o => o.factureId && new Date(o.arrivalDate) <= now);
  const pending = catArticles.filter(o => !o.factureId && o.status === 'PI');
  
  const totalVal = useMemo(() => catArticles.reduce((s, o) => s + (o.quantity * o.purchasePricePerUnit), 0), [catArticles]);
  const totalQty = useMemo(() => catArticles.reduce((s, o) => s + o.quantity, 0), [catArticles]);
  const totalCbm = useMemo(() => catArticles.reduce((s, o) => s + (o.cubicMeasurement || 0), 0), [catArticles]);

  const orderDates = useMemo(() => catArticles
    .map(o => new Date(o.orderDate).getTime())
    .filter(t => !isNaN(t))
    .sort((a, b) => a - b), [catArticles]);
  
  const seasonalityData = useMemo(() => {
    const months: Record<string, number> = {};
    catArticles.forEach(o => {
      const month = o.orderDate?.substring(0, 7) || 'N/A';
      months[month] = (months[month] || 0) + (o.quantity * o.purchasePricePerUnit);
    });
    return Object.entries(months)
      .sort((a, b) => a[0].localeCompare(b[0]))
      .map(([name, value]) => ({ name, value }));
  }, [catArticles]);

  const priceEvolutionData = useMemo(() => {
    const groupedByDate = catArticles.reduce((acc: any, o) => {
      const d = o.orderDate || 'N/A';
      if (d === 'N/A') return acc;
      if (!acc[d]) acc[d] = { sum: 0, count: 0 };
      acc[d].sum += o.purchasePricePerUnit;
      acc[d].count += 1;
      return acc;
    }, {});

    return Object.entries(groupedByDate)
      .map(([date, stats]: any) => ({
        date,
        price: stats.sum / stats.count
      }))
      .sort((a, b) => a.date.localeCompare(b.date));
  }, [catArticles]);

  const cbmEvolutionData = useMemo(() => {
    const groupedByDate = catArticles.reduce((acc: any, o) => {
      const d = o.orderDate || 'N/A';
      if (d === 'N/A') return acc;
      acc[d] = (acc[d] || 0) + (o.cubicMeasurement || 0);
      return acc;
    }, {});

    return Object.entries(groupedByDate)
      .map(([date, cbm]: any) => ({
        date,
        cbm
      }))
      .sort((a, b) => a.date.localeCompare(b.date));
  }, [catArticles]);

  return (
    <div className="space-y-6 fade-in pb-12">
      <div className="bg-white rounded-xl shadow-sm border border-stone-100 p-6 flex flex-col md:flex-row justify-between items-start md:items-center gap-4 border-l-8 border-l-amber-500">
        <div>
          <button onClick={onBack} className="flex items-center text-stone-500 hover:text-amber-600 mb-2 text-sm font-medium transition-colors">
            <ChevronLeft className="w-4 h-4 mr-1" /> Retour au catalogue
          </button>
          <h2 className="text-3xl font-bold text-stone-900">{categoryName}</h2>
        </div>
        <div className="flex gap-4">
          <div className="text-right bg-emerald-50 p-3 rounded-lg border border-emerald-200">
            <div className="text-[10px] text-emerald-600 uppercase tracking-wide font-bold">Volume Total CBM</div>
            <div className="text-2xl font-black text-emerald-700">{totalCbm.toFixed(2)} m³</div>
          </div>
          <div className="text-right bg-amber-50 p-3 rounded-lg border border-amber-200">
            <div className="text-[10px] text-amber-600 uppercase tracking-wide font-bold">Valeur Marchandise</div>
            <div className="text-2xl font-black text-amber-700">{Math.round(totalVal).toLocaleString()} €</div>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
        <StatCard label="Quantité Totale" value={totalQty.toLocaleString()} icon={<Package className="w-4 h-4 text-stone-400" />} />
        <StatCard label="Moyenne CBM / Commande" value={`${(totalCbm / (catArticles.length || 1)).toFixed(2)} m³`} icon={<Cuboid className="w-4 h-4 text-emerald-500" />} />
        <StatCard label="Articles Distincts" value={catArticles.length} icon={<BarChart3 className="w-4 h-4 text-amber-500" />} />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        <Card>
          <CardHeader>
            <CardTitle className="text-sm font-bold flex items-center gap-2">
              <Cuboid className="w-4 h-4 text-emerald-500" />
              Étude des Volumes (CBM) par Commande
            </CardTitle>
          </CardHeader>
          <CardContent className="h-[300px]">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={cbmEvolutionData}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} />
                <XAxis dataKey="date" fontSize={10} tickLine={false} axisLine={false} />
                <YAxis fontSize={10} tickLine={false} axisLine={false} />
                <Tooltip formatter={(value: any) => [`${value.toFixed(2)} m³`, 'Volume CBM']} />
                <Bar dataKey="cbm" fill="#10b981" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-sm font-bold flex items-center gap-2">
              <LineIcon className="w-4 h-4 text-amber-500" />
              Évolution du Prix d'Achat (PA)
            </CardTitle>
          </CardHeader>
          <CardContent className="h-[300px]">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={priceEvolutionData}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} />
                <XAxis dataKey="date" fontSize={10} tickLine={false} axisLine={false} />
                <YAxis fontSize={10} tickLine={false} axisLine={false} />
                <Tooltip formatter={(value: any) => [`${parseFloat(value).toFixed(4)} €`, 'Prix Moyen']} />
                <Line type="monotone" dataKey="price" stroke="#d97706" strokeWidth={3} dot={{ r: 4, fill: '#d97706' }} />
              </LineChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      </div>

      {pending.length > 0 && <CategoryTableSection title="🏭 En Production (PI)" data={pending} color="amber" count={pending.length} />}
      <CategoryTableSection title="🚢 Commandes en Transit" data={transit} color="blue" count={transit.length} />
      <CategoryTableSection title="✅ Commandes Arrivées" data={arrived} color="green" count={arrived.length} />
    </div>
  );
}

function StatCard({ label, value, icon, className }: any) {
  return (
    <Card className={`bg-white p-5 rounded-xl shadow-sm border border-stone-100 ${className}`}>
      <div className="flex items-center gap-2 mb-1">
        {icon}
        <span className="text-[10px] text-stone-500 uppercase tracking-wide font-bold">{label}</span>
      </div>
      <div className="text-xl font-bold text-stone-800">{value}</div>
    </Card>
  );
}

function CategoryTableSection({ title, data, color, count }: any) {
  const { user } = useUser();
  const firestore = useFirestore();
  const { toast } = useToast();

  const colorClasses = {
    blue: 'border-blue-100 bg-blue-50 text-blue-800',
    green: 'border-green-100 bg-green-50 text-green-800',
    amber: 'border-amber-100 bg-amber-50 text-amber-800'
  } as const;

  const handleDelete = (articleId: string, name: string) => {
    if (!user || !firestore || !articleId) return;
    if (window.confirm(`Supprimer l'article "${name}" ?`)) {
      const docRef = doc(firestore, 'users', user.uid, 'articles', articleId);
      deleteDocumentNonBlocking(docRef);
      toast({ title: "Article supprimé", description: name });
    }
  };

  return (
    <Card className={`overflow-hidden border-${color}-100 mt-6`}>
      <CardHeader className={`${colorClasses[color as keyof typeof colorClasses]} py-4 px-6 flex flex-row justify-between items-center`}>
        <CardTitle className="text-lg font-bold">{title}</CardTitle>
        <Badge variant="outline" className={`${colorClasses[color as keyof typeof colorClasses]} border-current`}>
          {count}
        </Badge>
      </CardHeader>
      <CardContent className="p-0">
        <div className="overflow-x-auto max-h-[400px]">
          <Table>
            <TableHeader className="bg-stone-50 sticky top-0 z-10">
              <TableRow>
                <TableHead>Article</TableHead>
                <TableHead>Facture</TableHead>
                <TableHead>Date Cmd</TableHead>
                <TableHead>Arrivée</TableHead>
                <TableHead className="text-right">Qté</TableHead>
                <TableHead className="text-right">CBM</TableHead>
                <TableHead className="text-right">PA</TableHead>
                <TableHead className="text-right">Total</TableHead>
                <TableHead className="w-[50px]"></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {data.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={9} className="text-center text-stone-400 italic py-8">Aucune commande</TableCell>
                </TableRow>
              ) : data.map((d: any, i: number) => (
                <TableRow key={d.id || i} className="hover:bg-stone-50 transition-colors">
                  <TableCell className="font-bold">{d.name}</TableCell>
                  <TableCell className="font-bold text-stone-600 bg-stone-50/50">{d.factureId || 'PI'}</TableCell>
                  <TableCell className="text-xs font-medium text-stone-500">{d.orderDate}</TableCell>
                  <TableCell className={`font-bold ${color === 'blue' ? 'text-blue-600' : color === 'green' ? 'text-green-600' : 'text-amber-600'}`}>{d.arrivalDate || '-'}</TableCell>
                  <TableCell className="text-right font-bold">{d.quantity.toLocaleString()}</TableCell>
                  <TableCell className="text-right text-emerald-700 font-bold text-xs">{d.cubicMeasurement?.toFixed(2)}</TableCell>
                  <TableCell className="text-right text-xs font-mono">{d.purchasePricePerUnit}</TableCell>
                  <TableCell className="text-right font-black text-amber-700">{Math.round(d.quantity * d.purchasePricePerUnit).toLocaleString()} €</TableCell>
                  <TableCell>
                    <Button 
                      variant="ghost" 
                      size="icon" 
                      className="h-8 w-8 text-stone-300 hover:text-red-500"
                      onClick={() => handleDelete(d.id, d.name)}
                    >
                      <Trash2 className="w-4 h-4" />
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </CardContent>
    </Card>
  );
}
