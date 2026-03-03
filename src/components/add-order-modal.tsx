
"use client";

import React, { useState, useMemo } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Sparkles, Loader2, CheckCircle2, Factory, ListTodo, Layers, Package } from 'lucide-react';
import { suggestArticleSpecifications } from '@/ai/flows/suggest-article-specifications-flow';
import { useUser, useFirestore, useCollection, useMemoFirebase } from '@/firebase';
import { doc, collection, serverTimestamp } from 'firebase/firestore';
import { useToast } from '@/hooks/use-toast';
import { setDocumentNonBlocking } from '@/firebase/non-blocking-updates';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

interface AddOrderModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  factures: any[];
}

export default function AddOrderModal({ open, onOpenChange, factures }: AddOrderModalProps) {
  const { user } = useUser();
  const firestore = useFirestore();
  const { toast } = useToast();
  
  // Fetch Categories for selection
  const genCatsRef = useMemoFirebase(() => {
    if (!firestore || !user) return null;
    return collection(firestore, 'users', user.uid, 'generalCategories');
  }, [firestore, user]);

  const catsRef = useMemoFirebase(() => {
    if (!firestore || !user) return null;
    return collection(firestore, 'users', user.uid, 'categories');
  }, [firestore, user]);

  const { data: generalCategories = [] } = useCollection(genCatsRef);
  const { data: subCategories = [] } = useCollection(catsRef);

  const [selectedGenCatId, setSelectedGenCatId] = useState<string>('');
  
  const filteredSubCategories = useMemo(() => {
    if (!selectedGenCatId || !subCategories) return [];
    return (subCategories || []).filter(sc => sc.generalCategoryId === selectedGenCatId);
  }, [selectedGenCatId, subCategories]);

  const [formData, setFormData] = useState<any>({
    orderDate: '',
    arrivalDate: '',
    quantity: 0,
    purchasePricePerUnit: 0,
    cubicMeasurement: 0,
    unitOfMeasure: 'pcs',
    color: '',
    categoryId: '', // Stores the sub-category name
    name: '',
    supplierId: '',
    factureId: '',
    specs: '',
    status: 'PI'
  });
  const [isSuggesting, setIsSuggesting] = useState(false);
  const [autofillVisible, setAutofillVisible] = useState(false);

  const handleFactureInput = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value.toUpperCase();
    setFormData((prev: any) => ({ ...prev, factureId: val }));
    
    if (!val) {
      setFormData((prev: any) => ({ ...prev, arrivalDate: '' }));
      return;
    }

    const knownFacture = (factures || []).find(f => f.id === val);
    if (knownFacture) {
      setFormData((prev: any) => ({
        ...prev,
        arrivalDate: knownFacture.arrivalDate || prev.arrivalDate,
        supplierId: knownFacture.supplierId || knownFacture.supplier || prev.supplierId
      }));
      setAutofillVisible(true);
      setTimeout(() => setAutofillVisible(false), 3000);
    }
  };

  const handleSuggestSpecs = async () => {
    if (!formData.categoryId || !formData.name) return;
    setIsSuggesting(true);
    try {
      const result = await suggestArticleSpecifications({
        category: formData.categoryId,
        article: formData.name
      });
      setFormData((prev: any) => ({ ...prev, specs: result.specs }));
    } catch (err) {
      console.error(err);
    } finally {
      setIsSuggesting(false);
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!user || !firestore) return;

    if (formData.categoryId && formData.name) {
      const articleId = crypto.randomUUID();
      const articlesRef = collection(firestore, 'users', user.uid, 'articles');
      const docRef = doc(articlesRef, articleId);
      
      const finalStatus = formData.factureId ? 'SHIPPED' : formData.status;
      
      const articleData = {
        ...formData,
        status: finalStatus,
        id: articleId,
        createdAt: serverTimestamp()
      };

      setDocumentNonBlocking(docRef, articleData, { merge: true });

      const msg = finalStatus === 'TO_ORDER' ? "Enregistré en rappel !" : 
                 (finalStatus === 'PI' ? "Commande PI enregistrée !" : "Article ajouté !");
      
      toast({ title: msg, description: `${formData.name} a été enregistré.` });
      
      onOpenChange(false);
      
      // Reset form
      setFormData({
        orderDate: '',
        arrivalDate: '',
        quantity: 0,
        purchasePricePerUnit: 0,
        cubicMeasurement: 0,
        unitOfMeasure: 'pcs',
        color: '',
        categoryId: '',
        name: '',
        supplierId: '',
        factureId: '',
        specs: '',
        status: 'PI'
      });
      setSelectedGenCatId('');
    } else {
      toast({ variant: "destructive", title: "Erreur", description: "Veuillez sélectionner une sous-catégorie et un nom d'article." });
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="text-xl font-bold text-stone-800">Nouvel Article / Commande</DialogTitle>
        </DialogHeader>

        <Tabs defaultValue="PI" onValueChange={(v) => setFormData((p: any) => ({...p, status: v}))} className="mb-4">
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="PI" className="flex items-center gap-2">
              <Factory className="w-4 h-4" /> Commande (PI)
            </TabsTrigger>
            <TabsTrigger value="TO_ORDER" className="flex items-center gap-2">
              <ListTodo className="w-4 h-4" /> Rappel (À Commander)
            </TabsTrigger>
          </TabsList>
        </Tabs>

        <form onSubmit={handleSubmit} className="space-y-4 py-4">
          {formData.status === 'PI' && (
            <div className="bg-amber-50 p-4 rounded-lg border border-amber-100 mb-4 transition-all">
              <div className="flex justify-between items-center mb-1">
                <Label className="block text-sm font-bold text-stone-800">
                  N° de Facture <span className="text-stone-500 font-normal">(Optionnel si en prod.)</span>
                </Label>
                {!formData.factureId && (
                  <div className="flex items-center gap-1 text-[10px] font-bold text-amber-600 uppercase">
                    <Factory className="w-3 h-3" /> État : PI / Production
                  </div>
                )}
              </div>
              <div className="relative">
                <Input 
                  value={formData.factureId || ''}
                  onChange={handleFactureInput}
                  list="factures-suggestions"
                  className="uppercase font-bold text-lg bg-white border-amber-200 focus:ring-amber-500" 
                  placeholder="Ex: 26HD1004"
                />
                <datalist id="factures-suggestions">
                  {(factures || []).map(f => (
                    <option key={f.id} value={f.id}>
                      {f.supplierId || f.supplier} - {f.arrivalDate}
                    </option>
                  ))}
                </datalist>
              </div>
              {autofillVisible && (
                <div className="flex items-center gap-1 text-xs font-bold text-blue-600 mt-2 animate-pulse">
                  <CheckCircle2 className="w-3 h-3" />
                  Données pré-remplies !
                </div>
              )}
            </div>
          )}

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-1">
              <Label className="flex items-center gap-1"><Layers className="w-3 h-3" /> Catégorie Générale</Label>
              <Select value={selectedGenCatId} onValueChange={setSelectedGenCatId}>
                <SelectTrigger className="bg-white">
                  <SelectValue placeholder="Choisir un groupe..." />
                </SelectTrigger>
                <SelectContent>
                  {(generalCategories || []).map(gc => (
                    <SelectItem key={gc.id} value={gc.id}>{gc.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1">
              <Label className="flex items-center gap-1"><Package className="w-3 h-3" /> Sous-catégorie</Label>
              <Select 
                disabled={!selectedGenCatId} 
                value={formData.categoryId} 
                onValueChange={(v) => {
                  setFormData((p: any) => ({...p, categoryId: v}));
                  // Option: auto-fill name if needed, but usually Article Name is unique
                }}
              >
                <SelectTrigger className="bg-white">
                  <SelectValue placeholder={selectedGenCatId ? "Choisir une sous-catégorie..." : "Sélectionnez d'abord un groupe"} />
                </SelectTrigger>
                <SelectContent>
                  {(filteredSubCategories || []).map(sc => (
                    <SelectItem key={sc.id} value={sc.name}>{sc.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1 md:col-span-2">
              <Label>Nom de l'Article</Label>
              <Input 
                required 
                value={formData.name || ''} 
                onChange={e => setFormData((prev: any) => ({ ...prev, name: e.target.value }))} 
                placeholder="Ex: NO.5 NYGURADE ZIPPER" 
              />
            </div>
            
            <div className="space-y-1 md:col-span-2 relative">
              <Label>Spécifications / Pack</Label>
              <div className="flex gap-2">
                <Input 
                  value={formData.specs || ''} 
                  onChange={e => setFormData((prev: any) => ({ ...prev, specs: e.target.value }))} 
                  placeholder="Ex: 12cm SEMI AUTO" 
                />
                <Button 
                  type="button" 
                  variant="outline" 
                  size="icon" 
                  onClick={handleSuggestSpecs} 
                  disabled={isSuggesting || !formData.categoryId || !formData.name}
                  title="Suggérer par IA"
                  className="shrink-0"
                >
                  {isSuggesting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4 text-amber-500" />}
                </Button>
              </div>
            </div>

            <div className="space-y-1">
              <Label>Couleur</Label>
              <Input 
                value={formData.color || ''} 
                onChange={e => setFormData((prev: any) => ({ ...prev, color: e.target.value }))} 
              />
            </div>
            <div className="space-y-1">
              <Label>Quantité & Unité</Label>
              <div className="flex gap-2">
                <Input 
                  type="number" 
                  required 
                  value={formData.quantity || 0} 
                  onChange={e => setFormData((prev: any) => ({ ...prev, quantity: parseFloat(e.target.value) || 0 }))} 
                />
                <Input 
                  required 
                  className="w-24"
                  value={formData.unitOfMeasure || ''} 
                  onChange={e => setFormData((prev: any) => ({ ...prev, unitOfMeasure: e.target.value }))} 
                />
              </div>
            </div>

            {formData.status === 'PI' && (
              <>
                <div className="space-y-1">
                  <Label>Fournisseur</Label>
                  <Input 
                    required 
                    value={formData.supplierId || ''} 
                    onChange={e => setFormData((prev: any) => ({ ...prev, supplierId: e.target.value }))}
                    placeholder="Ex: MH"
                    className={autofillVisible ? "highlight-autofill" : ""}
                  />
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <div className="space-y-1">
                    <Label>Date Commande</Label>
                    <Input 
                      type="date" 
                      required 
                      value={formData.orderDate || ''} 
                      onChange={e => setFormData((prev: any) => ({ ...prev, orderDate: e.target.value }))} 
                    />
                  </div>
                  <div className="space-y-1">
                    <Label className={formData.factureId ? "text-blue-700" : "text-stone-400"}>Date Arrivée</Label>
                    <Input 
                      type="date" 
                      required={!!formData.factureId}
                      className={`bg-blue-50 border-blue-200 ${autofillVisible ? "highlight-autofill" : ""} ${!formData.factureId ? "opacity-50" : ""}`}
                      value={formData.arrivalDate || ''} 
                      onChange={e => setFormData((prev: any) => ({ ...prev, arrivalDate: e.target.value }))} 
                    />
                  </div>
                </div>

                <div className="space-y-1">
                  <Label className="text-emerald-700">Volume (CBM)</Label>
                  <Input 
                    type="number" 
                    step="0.001" 
                    className="bg-emerald-50 border-emerald-200" 
                    required 
                    value={formData.cubicMeasurement || 0} 
                    onChange={e => setFormData((prev: any) => ({ ...prev, cubicMeasurement: parseFloat(e.target.value) || 0 }))} 
                  />
                </div>

                <div className="space-y-1">
                  <Label>Prix (PA)</Label>
                  <Input 
                    type="number" 
                    step="0.0001" 
                    required 
                    value={formData.purchasePricePerUnit || 0} 
                    onChange={e => setFormData((prev: any) => ({ ...prev, purchasePricePerUnit: parseFloat(e.target.value) || 0 }))} 
                  />
                </div>
              </>
            )}
          </div>
        </form>

        <DialogFooter className="border-t pt-4">
          <Button variant="outline" onClick={() => onOpenChange(false)}>Annuler</Button>
          <Button onClick={handleSubmit} className={`${formData.status === 'TO_ORDER' ? 'bg-stone-800' : 'bg-amber-600'} hover:opacity-90 text-white font-bold`}>
            {formData.status === 'TO_ORDER' ? 'Enregistrer en Rappel (À Commander)' : (formData.factureId ? 'Enregistrer Shipped' : 'Enregistrer en Prod. (PI)')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
