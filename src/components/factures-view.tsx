"use client";

import React, { useState, useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { ChevronLeft, Plus, CalendarDays, Trash2, TrendingDown, AlertCircle, CheckCircle2 } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import AddFactureModal from './add-facture-modal';
import { useUser, useFirestore } from '@/firebase';
import { doc } from 'firebase/firestore';
import { deleteDocumentNonBlocking } from '@/firebase/non-blocking-updates';
import { useToast } from '@/hooks/use-toast';

interface FacturesViewProps {
  articles: any[];
  factures: any[];
  selectedFactureId: string | null;
  setSelectedFactureId: (id: string | null) => void;
  onNavigateToCategory: (categoryName: string) => void;
}

export default function FacturesView({ 
  articles, 
  factures, 
  selectedFactureId, 
  setSelectedFactureId,
  onNavigateToCategory 
}: FacturesViewProps) {
  const { user } = useUser();
  const firestore = useFirestore();
  const { toast } = useToast();
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [modalInitialData, setModalInitialData] = useState<any>(null);

  // Aggregation logic including "virtual" invoices found in articles but not in the factures collection
  const { declaredFactures, orphanedFactureIds } = useMemo(() => {
    const declaredIds = new Set((factures || []).map(f => f.id));
    const allIdsFromArticles = new Set(articles.map(a => a.factureId).filter(Boolean));
    
    const orphaned = Array.from(allIdsFromArticles).filter(id => !declaredIds.has(id));

    const aggregated = (factures || []).map(f => {
      const fArticles = articles.filter(o => o.factureId === f.id);
      const itemsCount = fArticles.length;
      const itemsVal = fArticles.reduce((sum, o) => sum + (o.quantity * o.purchasePricePerUnit), 0);
      const cbm = fArticles.reduce((sum, o) => sum + (o.cubicMeasurement || 0), 0);
      const freight = f.freightCost || f.freight || 0;
      const efficiency = cbm > 0 ? (freight / cbm) : 0;
      return { ...f, itemsCount, itemsVal, cbm, freight, efficiency, isOrphaned: false };
    }).sort((a, b) => new Date(b.arrivalDate).getTime() - new Date(a.arrivalDate).getTime());

    return { declaredFactures: aggregated, orphanedFactureIds: orphaned };
  }, [articles, factures]);

  const selectedFacture = useMemo(() => {
    if (!selectedFactureId) return null;
    return declaredFactures.find(f => f.id === selectedFactureId);
  }, [declaredFactures, selectedFactureId]);

  const selectedFactureArticles = useMemo(() => {
    if (!selectedFactureId) return [];
    return articles.filter(o => o.factureId === selectedFactureId);
  }, [articles, selectedFactureId]);

  const handleAddFacture = (initialId?: string) => {
    if (initialId) {
      const sample = articles.find(a => a.factureId === initialId);
      setModalInitialData({ 
        id: initialId, 
        arrivalDate: sample?.arrivalDate || '',
        supplierId: sample?.supplierId || ''
      });
    } else {
      setModalInitialData(null);
    }
    setIsEditModalOpen(true);
  };

  const handleDeleteItem = (articleId: string, name: string) => {
    if (!user || !firestore || !window.confirm(`Retirer l'article "${name}" de cette facture ?`)) return;
    const docRef = doc(firestore, 'users', user.uid, 'articles', articleId);
    deleteDocumentNonBlocking(docRef);
    toast({ title: "Article supprimé", description: name });
  };

  if (selectedFactureId && selectedFacture) {
    return (
      <div className="space-y-6 animate-in fade-in duration-300">
        <div className="bg-white rounded-xl shadow-sm border border-stone-100 p-6 flex flex-col lg:flex-row justify-between items-start lg:items-center gap-4 border-l-8 border-l-stone-900">
          <div className="flex-1">
            <Button variant="ghost" size="sm" onClick={() => setSelectedFactureId(null)} className="text-stone-400 hover:text-stone-900 mb-2 p-0 h-auto font-bold uppercase text-[10px] tracking-widest">
              <ChevronLeft className="w-4 h-4 mr-1" /> Retour au registre
            </Button>
            <h2 className="text-3xl font-black text-stone-900 tracking-tighter uppercase">
              Facture {selectedFacture.id}
            </h2>
            <div className="text-[10px] font-black text-stone-400 uppercase tracking-widest mt-1">
              Fournisseur : <span className="text-stone-900">{selectedFacture.supplierId || selectedFacture.supplier}</span>
            </div>
          </div>
          
          <div className="flex flex-wrap gap-3 mt-4 lg:mt-0 justify-end w-full lg:w-auto">
             <div className="text-right bg-stone-50 p-3 rounded-lg border border-stone-200 min-w-[120px]">
              <div className="text-[8px] text-stone-400 uppercase tracking-tighter font-black flex items-center justify-end gap-1">
                EFFICIENCE <TrendingDown className="w-3 h-3 text-stone-300" />
              </div>
              <div className="text-lg font-black text-stone-900">{selectedFacture.efficiency.toFixed(2)} <span className="text-[10px] text-stone-400 font-bold">€/CBM</span></div>
            </div>
            <div 
              onClick={() => { setModalInitialData(selectedFacture); setIsEditModalOpen(true); }} 
              className="text-right bg-stone-50 p-3 rounded-lg border border-stone-200 min-w-[120px] cursor-pointer hover:bg-white transition-colors group"
            >
              <div className="text-[8px] text-stone-400 uppercase tracking-tighter font-black flex items-center justify-end gap-1 group-hover:text-stone-900">
                ARRIVÉE <CalendarDays className="w-3 h-3 text-stone-300" />
              </div>
              <div className="text-lg font-black text-stone-900">{selectedFacture.arrivalDate}</div>
            </div>
            <div className="text-right bg-stone-50 p-3 rounded-lg border border-stone-200 min-w-[100px]">
              <div className="text-[8px] text-stone-400 uppercase tracking-tighter font-black">VOLUME TOTAL</div>
              <div className="text-lg font-black text-stone-900">{selectedFacture.cbm.toFixed(2)} <span className="text-[10px] text-stone-400 font-bold">m³</span></div>
            </div>
            <div className="text-right bg-stone-900 p-3 rounded-lg border border-stone-800 min-w-[150px]">
              <div className="text-[8px] text-stone-400 uppercase tracking-tighter font-black">VALEUR LOGISTIQUE</div>
              <div className="text-xl font-black text-white">{(selectedFacture.itemsVal + selectedFacture.freight).toLocaleString()} €</div>
            </div>
          </div>
        </div>

        <Card className="border-stone-200 shadow-none overflow-hidden">
          <CardHeader className="bg-stone-50/50 py-4 px-6 border-b border-stone-100">
            <div className="flex justify-between items-center">
              <CardTitle className="text-[11px] font-black uppercase text-stone-500 tracking-widest">Manifeste de la cargaison</CardTitle>
              <Badge variant="outline" className="text-[9px] font-black uppercase border-stone-200 bg-white">
                {selectedFactureArticles.length} ARTICLES RÉFÉRENCÉS
              </Badge>
            </div>
          </CardHeader>
          <CardContent className="p-0">
            <Table>
              <TableHeader className="bg-stone-50/30">
                <TableRow>
                  <TableHead className="text-[10px] font-black uppercase py-2">Catégorie</TableHead>
                  <TableHead className="text-[10px] font-black uppercase py-2">Désignation</TableHead>
                  <TableHead className="text-right text-[10px] font-black uppercase py-2">Quantité</TableHead>
                  <TableHead className="text-right text-[10px] font-black uppercase py-2">Volume</TableHead>
                  <TableHead className="text-right text-[10px] font-black uppercase py-2">Valeur</TableHead>
                  <TableHead className="w-[50px]"></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {selectedFactureArticles.map((o, i) => (
                  <TableRow key={o.id || i} className="hover:bg-stone-50/50 transition-colors border-stone-100">
                    <TableCell className="py-2">
                      <button 
                        onClick={() => onNavigateToCategory(o.categoryId)}
                        className="text-[10px] font-black text-stone-400 hover:text-stone-900 uppercase underline decoration-stone-200 underline-offset-4"
                      >
                        {o.categoryId}
                      </button>
                    </TableCell>
                    <TableCell className="font-bold text-xs text-stone-800 py-2">{o.name}</TableCell>
                    <TableCell className="text-right font-black text-xs py-2">
                      {o.quantity.toLocaleString()} <span className="text-[9px] text-stone-400 font-normal uppercase">{o.unitOfMeasure}</span>
                    </TableCell>
                    <TableCell className="text-right text-stone-500 font-bold text-xs py-2">{o.cubicMeasurement?.toFixed(2)} <span className="text-[9px] text-stone-300">m³</span></TableCell>
                    <TableCell className="text-right font-black text-stone-900 text-xs py-2">{(o.quantity * o.purchasePricePerUnit).toLocaleString()} €</TableCell>
                    <TableCell className="py-2">
                      <Button 
                        variant="ghost" 
                        size="icon" 
                        className="h-7 w-7 text-stone-200 hover:text-red-500"
                        onClick={() => handleDeleteItem(o.id, o.name)}
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>

        <AddFactureModal
          open={isEditModalOpen}
          onOpenChange={setIsEditModalOpen}
          factures={factures}
          editFacture={modalInitialData}
          associatedArticles={selectedFactureArticles}
        />
      </div>
    );
  }

  return (
    <div className="space-y-8 animate-in fade-in duration-300">
      <header className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 bg-white p-6 rounded-xl border border-stone-200 shadow-sm">
        <div>
          <h2 className="text-2xl font-black text-stone-900 uppercase tracking-tighter">Registre des Arrivages</h2>
          <p className="text-[10px] font-bold text-stone-400 uppercase tracking-widest mt-1">Gestion logistique et analyse des frais de fret</p>
        </div>
        <Button onClick={() => handleAddFacture()} className="bg-stone-900 hover:bg-black text-white font-black uppercase text-[10px] tracking-widest px-6 h-11 rounded-lg shadow-sm gap-2">
          <Plus className="w-4 h-4" /> Déclarer une Facture
        </Button>
      </header>

      {orphanedFactureIds.length > 0 && (
        <section className="space-y-3">
          <div className="flex items-center gap-2 px-1">
            <AlertCircle className="w-4 h-4 text-amber-500" />
            <h3 className="text-[11px] font-black text-amber-600 uppercase tracking-widest">Factures à régulariser ({orphanedFactureIds.length})</h3>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
            {orphanedFactureIds.map(id => (
              <Card key={id} className="border-amber-200 bg-amber-50/20 shadow-none group">
                <CardContent className="p-4 flex justify-between items-center">
                  <div>
                    <p className="text-[8px] font-black text-amber-500 uppercase tracking-tighter">ID DÉTECTÉ DANS STOCK</p>
                    <h4 className="text-sm font-black text-stone-900 uppercase">{id}</h4>
                  </div>
                  <Button 
                    size="sm" 
                    variant="outline" 
                    onClick={() => handleAddFacture(id)}
                    className="h-8 border-amber-200 bg-white text-[9px] font-black uppercase text-amber-600 hover:bg-amber-600 hover:text-white transition-all"
                  >
                    Régulariser
                  </Button>
                </CardContent>
              </Card>
            ))}
          </div>
        </section>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {declaredFactures.map(f => (
          <div 
            key={f.id} 
            onClick={() => setSelectedFactureId(f.id)}
            className="bg-white rounded-xl shadow-sm border border-stone-200 p-6 hover:border-stone-900 cursor-pointer transition-all flex flex-col relative overflow-hidden group"
          >
            <div className="absolute top-0 right-0 bg-stone-50 text-stone-400 text-[8px] font-black px-3 py-1.5 rounded-bl-lg group-hover:bg-stone-900 group-hover:text-white transition-colors uppercase tracking-widest">
              ARR. {f.arrivalDate}
            </div>
            <div className="flex-grow pt-2">
              <div className="text-[9px] text-stone-400 font-black uppercase tracking-widest mb-1">{f.supplierId || f.supplier}</div>
              <h3 className="text-xl font-black text-stone-900 tracking-tighter mb-4 group-hover:text-stone-900 transition-colors uppercase">{f.id}</h3>
              
              <div className="grid grid-cols-2 gap-2 mb-4">
                <div className="bg-stone-50 p-2 rounded border border-stone-100">
                  <p className="text-[7px] font-black text-stone-400 uppercase">Volume</p>
                  <p className="text-xs font-black text-stone-800">{f.cbm.toFixed(2)} m³</p>
                </div>
                <div className="bg-stone-50 p-2 rounded border border-stone-100">
                  <p className="text-[7px] font-black text-stone-400 uppercase">Efficience</p>
                  <p className="text-xs font-black text-stone-800">{f.efficiency.toFixed(2)} €/m³</p>
                </div>
              </div>

              <div className="flex justify-between items-center text-[10px] font-black uppercase border-t border-stone-50 pt-3">
                <span className="text-stone-400">Articles référencés</span>
                <span className="text-stone-900 bg-stone-100 px-2 py-0.5 rounded-full">{f.itemsCount}</span>
              </div>
            </div>
            
            <div className="mt-6 pt-4 border-t border-stone-100 flex justify-between items-end">
              <div>
                <p className="text-[8px] font-black text-stone-400 uppercase tracking-tighter">VALEUR TOTALE</p>
                <p className="text-xl font-black text-stone-900 tracking-tighter">{(f.itemsVal + f.freight).toLocaleString()} €</p>
              </div>
              <div className="flex items-center gap-1 text-[8px] font-black text-emerald-500 uppercase">
                <CheckCircle2 className="w-3 h-3" /> Enregistré
              </div>
            </div>
          </div>
        ))}
        {declaredFactures.length === 0 && (
          <div className="col-span-full py-20 text-center border border-dashed border-stone-200 rounded-xl bg-white/50">
            <TrendingDown className="w-10 h-10 text-stone-200 mx-auto mb-4" />
            <p className="text-stone-400 font-black uppercase text-[10px] tracking-widest">Aucune facture enregistrée dans le registre</p>
          </div>
        )}
      </div>

      <AddFactureModal
        open={isEditModalOpen}
        onOpenChange={setIsEditModalOpen}
        factures={factures}
        editFacture={modalInitialData}
      />
    </div>
  );
}
