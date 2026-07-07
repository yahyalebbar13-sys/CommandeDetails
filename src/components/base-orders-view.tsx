"use client";

import React, { useState, useMemo, useCallback } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow
} from '@/components/ui/table';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter
} from '@/components/ui/dialog';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue
} from '@/components/ui/select';
import {
  ClipboardList, Plus, Edit2, Trash2, ArrowRight, FileDown, Layers, Loader2, Save
} from 'lucide-react';
import { useUser, useFirestore, useCollection, useMemoFirebase, deleteDocumentNonBlocking, setDocumentNonBlocking } from '@/firebase';
import { collection, doc, serverTimestamp, getDocs, writeBatch } from 'firebase/firestore';
import { useToast } from '@/hooks/use-toast';
import { exportBaseOrderPDF } from '@/lib/pdf-export';

interface BaseOrdersViewProps {
  subCategories: any[];
  generalCategories: any[];
}

export default function BaseOrdersView({ subCategories, generalCategories }: BaseOrdersViewProps) {
  const { user } = useUser();
  const firestore = useFirestore();
  const { toast } = useToast();

  const baseOrdersRef = useMemoFirebase(() => (!firestore || !user) ? null : collection(firestore, 'users', user.uid, 'baseOrders'), [firestore, user]);
  const { data: rawBaseOrders, isLoading } = useCollection(baseOrdersRef);
  const baseOrders = rawBaseOrders || [];

  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingOrder, setEditingOrder] = useState<any>(null);

  // Form state
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [items, setItems] = useState<any[]>([]);

  // Generator modal state
  const [isGeneratorOpen, setIsGeneratorOpen] = useState(false);
  const [selectedBaseOrder, setSelectedBaseOrder] = useState<any>(null);
  const [supplierId, setSupplierId] = useState('');

  // Suppliers list (for generator)
  const [knownSuppliers, setKnownSuppliers] = useState<string[]>([]);

  // Fetch unique suppliers from articles when generator opens
  const openGenerator = async (order: any) => {
    setSelectedBaseOrder(order);
    setSupplierId('');
    setIsGeneratorOpen(true);
    if (firestore && user) {
      try {
        const snap = await getDocs(collection(firestore, 'users', user.uid, 'articles'));
        const suppliers = new Set<string>();
        snap.docs.forEach(d => {
          const s = d.data().supplierId;
          if (s) suppliers.add(s);
        });
        setKnownSuppliers(Array.from(suppliers).sort());
      } catch (e) {
        console.error(e);
      }
    }
  };

  const handleOpenNew = () => {
    setEditingOrder(null);
    setName('');
    setDescription('');
    setItems([]);
    setIsModalOpen(true);
  };

  const handleOpenEdit = (order: any) => {
    setEditingOrder(order);
    setName(order.name || '');
    setDescription(order.description || '');
    setItems(order.items || []);
    setIsModalOpen(true);
  };

  const addItem = () => {
    setItems([...items, {
      id: Date.now().toString(),
      categoryId: '',
      color: '',
      size: '',
      quantity: '',
      unitOfMeasure: 'pièces',
      purchasePricePerUnit: ''
    }]);
  };

  const updateItem = (index: number, field: string, value: any) => {
    const newItems = [...items];
    newItems[index][field] = value;
    setItems(newItems);
  };

  const removeItem = (index: number) => {
    const newItems = [...items];
    newItems.splice(index, 1);
    setItems(newItems);
  };

  const handleSave = async () => {
    if (!name.trim()) {
      toast({ title: 'Erreur', description: 'Le nom du modèle est obligatoire', variant: 'destructive' });
      return;
    }
    if (items.length === 0) {
      toast({ title: 'Erreur', description: 'Ajoutez au moins un article', variant: 'destructive' });
      return;
    }

    try {
      const orderId = editingOrder ? editingOrder.id : `base_${Date.now()}`;
      const payload = {
        name: name.trim(),
        description: description.trim(),
        items,
        updatedAt: serverTimestamp(),
        ...(editingOrder ? {} : { createdAt: serverTimestamp() })
      };
      
      await setDocumentNonBlocking(firestore, `users/${user!.uid}/baseOrders/${orderId}`, payload);
      
      toast({ title: 'Succès', description: 'Modèle sauvegardé' });
      setIsModalOpen(false);
    } catch (err: any) {
      toast({ title: 'Erreur', description: err.message, variant: 'destructive' });
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Voulez-vous vraiment supprimer ce modèle ?')) return;
    try {
      await deleteDocumentNonBlocking(firestore, `users/${user!.uid}/baseOrders/${id}`);
      toast({ title: 'Succès', description: 'Modèle supprimé' });
    } catch (err: any) {
      toast({ title: 'Erreur', description: err.message, variant: 'destructive' });
    }
  };

  const generateRealOrder = async () => {
    if (!supplierId.trim()) {
      toast({ title: 'Erreur', description: 'Veuillez renseigner un fournisseur', variant: 'destructive' });
      return;
    }
    if (!selectedBaseOrder || !selectedBaseOrder.items.length) return;

    try {
      const batch = writeBatch(firestore!);
      selectedBaseOrder.items.forEach((item: any) => {
        const articleRef = doc(collection(firestore!, 'users', user!.uid, 'articles'));
        const sc = subCategories.find(c => c.name === item.categoryId);
        batch.set(articleRef, {
          supplierId: supplierId.trim(),
          categoryId: item.categoryId || '',
          generalCategoryId: sc?.generalCategoryId || '',
          quantity: Number(item.quantity) || 0,
          unitOfMeasure: item.unitOfMeasure || 'pièces',
          color: item.color || '',
          size: item.size || '',
          purchasePricePerUnit: Number(item.purchasePricePerUnit) || 0,
          status: 'TO_ORDER', // Start in "to order" state
          priority: 'todo',
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
          generatedFromBaseOrder: selectedBaseOrder.name
        });
      });
      await batch.commit();
      toast({ title: 'Succès', description: 'Commande générée avec succès (ajoutée aux commandes à passer)' });
      setIsGeneratorOpen(false);
    } catch (err: any) {
      toast({ title: 'Erreur', description: err.message, variant: 'destructive' });
    }
  };

  if (isLoading) {
    return (
      <div className="flex flex-col items-center justify-center py-20 space-y-4">
        <Loader2 className="w-8 h-8 animate-spin text-indigo-500" />
        <p className="text-stone-400 font-bold uppercase tracking-widest text-xs">Chargement des modèles...</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-end">
        <div>
          <h2 className="text-2xl font-black text-stone-900 uppercase tracking-tighter flex items-center gap-2">
            <ClipboardList className="w-6 h-6 text-indigo-500" />
            Commandes Fixes (La Base)
          </h2>
          <p className="text-sm font-bold text-stone-400 uppercase tracking-widest mt-1">
            Modèles pour générer rapidement des commandes récurrentes
          </p>
        </div>
        <Button onClick={handleOpenNew} className="bg-indigo-600 hover:bg-indigo-700 text-white shadow-lg shadow-indigo-600/20 rounded-xl h-11 px-6 font-black uppercase tracking-widest text-[10px]">
          <Plus className="w-4 h-4 mr-2" /> Nouveau Modèle
        </Button>
      </div>

      {baseOrders.length === 0 ? (
        <Card className="border-dashed border-2 border-stone-200 bg-stone-50/50">
          <CardContent className="flex flex-col items-center justify-center py-20 text-center">
            <div className="w-16 h-16 bg-white rounded-2xl flex items-center justify-center shadow-sm border border-stone-100 mb-4">
              <Layers className="w-8 h-8 text-stone-300" />
            </div>
            <p className="text-stone-500 font-bold uppercase tracking-widest text-xs mb-2">Aucun modèle défini</p>
            <p className="text-stone-400 text-sm max-w-sm">Créez votre première commande fixe pour pouvoir la réutiliser plus tard.</p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {baseOrders.map(order => (
            <Card key={order.id} className="overflow-hidden border-0 shadow-xl shadow-stone-200/40 rounded-2xl bg-white group hover:shadow-2xl transition-all duration-300">
              <div className="p-6">
                <div className="flex justify-between items-start mb-4">
                  <div>
                    <h3 className="text-lg font-black text-stone-900 tracking-tighter uppercase line-clamp-1">{order.name}</h3>
                    {order.description && <p className="text-xs font-bold text-stone-400 mt-1 line-clamp-2">{order.description}</p>}
                  </div>
                  <div className="bg-indigo-50 text-indigo-600 font-black text-[10px] px-2.5 py-1 rounded-lg uppercase tracking-widest whitespace-nowrap">
                    {order.items?.length || 0} art.
                  </div>
                </div>

                <div className="space-y-2 mb-6">
                  {(order.items || []).slice(0, 3).map((item: any, i: number) => (
                    <div key={i} className="flex items-center justify-between text-xs bg-stone-50 p-2 rounded-lg">
                      <span className="font-bold text-stone-700 truncate">{item.categoryId || 'Sans cat.'}</span>
                      <div className="flex items-center gap-2 shrink-0">
                        <span className="font-medium text-stone-500">{item.color}</span>
                        <span className="font-black text-stone-900 bg-white px-2 py-0.5 rounded border border-stone-200">{item.quantity} {item.unitOfMeasure}</span>
                      </div>
                    </div>
                  ))}
                  {(order.items?.length || 0) > 3 && (
                    <div className="text-center text-[10px] font-bold text-stone-400 uppercase tracking-widest pt-1">
                      + {(order.items?.length || 0) - 3} autres articles
                    </div>
                  )}
                </div>

                <div className="grid grid-cols-2 gap-2 pt-4 border-t border-stone-100">
                  <Button onClick={() => openGenerator(order)} className="w-full bg-stone-900 hover:bg-black text-white h-9 text-[10px] uppercase font-black tracking-widest rounded-xl">
                    <ArrowRight className="w-3.5 h-3.5 mr-1.5" /> Générer
                  </Button>
                  <Button onClick={() => exportBaseOrderPDF(order)} variant="outline" className="w-full border-stone-200 text-stone-600 hover:bg-stone-50 h-9 text-[10px] uppercase font-black tracking-widest rounded-xl">
                    <FileDown className="w-3.5 h-3.5 mr-1.5" /> Export PDF
                  </Button>
                </div>
              </div>
              <div className="bg-stone-50 px-4 py-2 border-t border-stone-100 flex justify-end gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                <Button variant="ghost" size="sm" onClick={() => handleOpenEdit(order)} className="h-7 text-[10px] font-black uppercase text-indigo-600 hover:text-indigo-700 hover:bg-indigo-50 px-2 rounded-lg">
                  <Edit2 className="w-3 h-3 mr-1" /> Modifier
                </Button>
                <Button variant="ghost" size="sm" onClick={() => handleDelete(order.id)} className="h-7 text-[10px] font-black uppercase text-red-600 hover:text-red-700 hover:bg-red-50 px-2 rounded-lg">
                  <Trash2 className="w-3 h-3 mr-1" /> Supprimer
                </Button>
              </div>
            </Card>
          ))}
        </div>
      )}

      {/* MODAL CRÉATION / ÉDITION DE MODÈLE */}
      <Dialog open={isModalOpen} onOpenChange={setIsModalOpen}>
        <DialogContent className="max-w-5xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="text-xl font-black uppercase tracking-tighter text-stone-900">
              {editingOrder ? 'Modifier le modèle' : 'Nouveau Modèle de Commande'}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-6 py-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label className="text-[10px] font-black uppercase tracking-widest text-stone-400">Nom du Modèle</Label>
                <Input value={name} onChange={e => setName(e.target.value)} placeholder="Ex: Commande Type Zipper O/E" className="font-bold rounded-xl" />
              </div>
              <div className="space-y-2">
                <Label className="text-[10px] font-black uppercase tracking-widest text-stone-400">Description (Optionnelle)</Label>
                <Input value={description} onChange={e => setDescription(e.target.value)} placeholder="Détails, saison..." className="rounded-xl" />
              </div>
            </div>

            <div className="space-y-3">
              <div className="flex justify-between items-center">
                <Label className="text-[10px] font-black uppercase tracking-widest text-stone-400">Articles du Modèle</Label>
                <Button onClick={addItem} size="sm" className="h-8 bg-indigo-50 text-indigo-600 hover:bg-indigo-100 font-black uppercase tracking-widest text-[10px] rounded-lg">
                  <Plus className="w-3 h-3 mr-1" /> Ajouter Ligne
                </Button>
              </div>
              
              <div className="border border-stone-200 rounded-xl overflow-hidden bg-white">
                <Table>
                  <TableHeader className="bg-stone-50">
                    <TableRow>
                      <TableHead className="text-[10px] font-black uppercase text-stone-400">Catégorie</TableHead>
                      <TableHead className="text-[10px] font-black uppercase text-stone-400">Couleur</TableHead>
                      <TableHead className="text-[10px] font-black uppercase text-stone-400">Taille/Specs</TableHead>
                      <TableHead className="text-[10px] font-black uppercase text-stone-400">Quantité</TableHead>
                      <TableHead className="text-[10px] font-black uppercase text-stone-400">Unité</TableHead>
                      <TableHead className="text-[10px] font-black uppercase text-stone-400">Prix U.</TableHead>
                      <TableHead className="w-10"></TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {items.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={7} className="text-center py-8 text-stone-400 text-sm">
                          Aucun article. Cliquez sur "Ajouter Ligne".
                        </TableCell>
                      </TableRow>
                    ) : (
                      items.map((item, idx) => (
                        <TableRow key={item.id || idx}>
                          <TableCell className="p-2">
                            <Select value={item.categoryId} onValueChange={(v) => updateItem(idx, 'categoryId', v)}>
                              <SelectTrigger className="h-8 text-xs font-bold border-0 bg-stone-50 focus:ring-0">
                                <SelectValue placeholder="Catégorie" />
                              </SelectTrigger>
                              <SelectContent>
                                {generalCategories.map(gc => (
                                  <optgroup key={gc.id} label={gc.name}>
                                    {subCategories.filter(sc => sc.generalCategoryId === gc.id).map(sc => (
                                      <SelectItem key={sc.id} value={sc.name}>{sc.name}</SelectItem>
                                    ))}
                                  </optgroup>
                                ))}
                              </SelectContent>
                            </Select>
                          </TableCell>
                          <TableCell className="p-2">
                            <Input value={item.color} onChange={(e) => updateItem(idx, 'color', e.target.value)} className="h-8 text-xs border-0 bg-stone-50 focus-visible:ring-0" placeholder="Couleur" />
                          </TableCell>
                          <TableCell className="p-2">
                            <Input value={item.size} onChange={(e) => updateItem(idx, 'size', e.target.value)} className="h-8 text-xs border-0 bg-stone-50 focus-visible:ring-0" placeholder="Taille" />
                          </TableCell>
                          <TableCell className="p-2">
                            <Input type="number" value={item.quantity} onChange={(e) => updateItem(idx, 'quantity', e.target.value)} className="h-8 text-xs border-0 bg-stone-50 focus-visible:ring-0" placeholder="Qté" />
                          </TableCell>
                          <TableCell className="p-2">
                            <Input value={item.unitOfMeasure} onChange={(e) => updateItem(idx, 'unitOfMeasure', e.target.value)} className="h-8 text-xs border-0 bg-stone-50 focus-visible:ring-0" placeholder="Unité" />
                          </TableCell>
                          <TableCell className="p-2">
                            <Input type="number" step="0.01" value={item.purchasePricePerUnit} onChange={(e) => updateItem(idx, 'purchasePricePerUnit', e.target.value)} className="h-8 text-xs border-0 bg-stone-50 focus-visible:ring-0" placeholder="Prix" />
                          </TableCell>
                          <TableCell className="p-2">
                            <Button variant="ghost" size="icon" onClick={() => removeItem(idx)} className="h-8 w-8 text-stone-400 hover:text-red-600 hover:bg-red-50 rounded-lg">
                              <Trash2 className="w-4 h-4" />
                            </Button>
                          </TableCell>
                        </TableRow>
                      ))
                    )}
                  </TableBody>
                </Table>
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsModalOpen(false)} className="rounded-xl font-black uppercase tracking-widest text-[10px]">Annuler</Button>
            <Button onClick={handleSave} className="bg-stone-900 hover:bg-black text-white rounded-xl font-black uppercase tracking-widest text-[10px]">
              <Save className="w-4 h-4 mr-2" /> Sauvegarder Modèle
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* MODAL GÉNÉRATION COMMANDE */}
      <Dialog open={isGeneratorOpen} onOpenChange={setIsGeneratorOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="text-xl font-black uppercase tracking-tighter text-stone-900">
              Générer une Commande
            </DialogTitle>
          </DialogHeader>
          <div className="py-4 space-y-4">
            <p className="text-sm font-bold text-stone-600">
              Vous allez générer une vraie commande (statut <Badge variant="outline" className="text-[10px] bg-stone-100 text-stone-600 border-stone-200">À COMMANDER</Badge>) 
              avec les {selectedBaseOrder?.items?.length || 0} articles du modèle <span className="text-indigo-600 font-black uppercase tracking-tighter">"{selectedBaseOrder?.name}"</span>.
            </p>
            <div className="space-y-2 pt-2">
              <Label className="text-[10px] font-black uppercase tracking-widest text-stone-400">Fournisseur de la commande</Label>
              {knownSuppliers.length > 0 ? (
                <div className="relative">
                  <Input 
                    value={supplierId} 
                    onChange={e => setSupplierId(e.target.value)} 
                    placeholder="Saisissez ou choisissez un fournisseur" 
                    className="font-black text-sm rounded-xl border-stone-200 uppercase"
                    list="suppliers-list"
                  />
                  <datalist id="suppliers-list">
                    {knownSuppliers.map(s => <option key={s} value={s} />)}
                  </datalist>
                </div>
              ) : (
                <Input 
                  value={supplierId} 
                  onChange={e => setSupplierId(e.target.value)} 
                  placeholder="Nom du fournisseur" 
                  className="font-black text-sm rounded-xl border-stone-200 uppercase"
                />
              )}
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsGeneratorOpen(false)} className="rounded-xl font-black uppercase tracking-widest text-[10px]">Annuler</Button>
            <Button onClick={generateRealOrder} disabled={!supplierId.trim()} className="bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl font-black uppercase tracking-widest text-[10px]">
              <ArrowRight className="w-4 h-4 mr-2" /> Générer
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function Badge({ children, className, variant }: any) {
  return <span className={`inline-block px-2 py-0.5 rounded font-black ${className}`}>{children}</span>;
}
