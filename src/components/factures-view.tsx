"use client";

import React, { useState, useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { ChevronLeft, Plus, CalendarDays, Trash2, TrendingDown, AlertCircle, CheckCircle2, FileText, Box, Euro } from 'lucide-react';
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

  // Logic to aggregate data and detect orphanded IDs (present in articles but not in factures collection)
  const { declaredFactures, orphanedFactureIds } = useMemo(() => {
    const declaredIds = new Set((factures || []).map(f => f.id));
    const allIdsFromArticles = new Set(articles.map(a => a.factureId).filter(Boolean));
    const orphaned = Array.from(allIdsFromArticles).filter(id => !declaredIds.has(id));

    const aggregated = (factures || []).map(f => {
      const fArticles = articles.filter(o => o.factureId === f.id);
      const itemsCount = fArticles.length;
      const itemsVal = fArticles.reduce((sum, o) => sum + ((Number(o.quantity) || 0) * (Number(o.purchasePricePerUnit) || 0)), 0);
      const cbm = fArticles.reduce((sum, o) => sum + (Number(o.cubicMeasurement) || 0), 0);
      const freight = Number(f.freightCost) || Number(f.freight) || 0;
      const efficiency = cbm > 0 ? (freight / cbm) : 0;
      return { ...f, itemsCount, itemsVal, cbm, freight, efficiency };
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
        supplierId: sample?.supplierId || '',
        isOrphaned: true
      });
    } else {
      setModalInitialData(null);
    }
    setIsEditModalOpen(true);
  };

  const handleDeleteItem = (articleId: string, name: string) => {
    if (!user || !firestore || !window.confirm(`Supprimer cet article "${name}" ?`)) return;
    const docRef = doc(firestore, 'users', user.uid, 'articles', articleId);
    deleteDocumentNonBlocking(docRef);
    toast({ title: "Article supprimé", description: name });
  };

  // DETAILED VIEW OF ONE INVOICE
  if (selectedFactureId && selectedFacture) {
    return (
      <div className="space-y-6 animate-in fade-in slide-in-from-bottom-2 duration-300">
        <header className="bg-white rounded-xl shadow-sm border border-stone-200 p-6 flex flex-col lg:flex-row justify-between items-start lg:items-center gap-6 border-l-8 border-l-stone-900">
          <div className="space-y-2">
            <Button 
              variant="ghost" 
              size="sm" 
              onClick={() => setSelectedFactureId(null)} 
              className="text-stone-400 hover:text-stone-900 -ml-2 font-black uppercase text-[10px] tracking-widest gap-1"
            >
              <ChevronLeft className="w-3.5 h-3.5" /> Retour au registre
            </Button>
            <div className="flex items-center gap-3">
              <div className="p-3 bg-stone-900 rounded-lg">
                <FileText className="w-6 h-6 text-white" />
              </div>
              <div>
                <h2 className="text-3xl font-black text-stone-900 tracking-tighter uppercase leading-none">
                  DOSSIER {selectedFacture.id}
                </h2>
                <p className="text-[10px] font-black text-stone-400 uppercase tracking-widest mt-1">
                  PROVENANCE : <span className="text-stone-900">{selectedFacture.supplierId || selectedFacture.supplier}</span>
                </p>
              </div>
            </div>
          </div>
          
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 w-full lg:w-auto">
            <div className="bg-stone-50 p-4 rounded-lg border border-stone-100 text-center">
              <p className="text-[8px] font-black text-stone-400 uppercase tracking-tighter mb-1">EFFICIENCE FRET</p>
              <div className="text-lg font-black text-stone-900">{selectedFacture.efficiency.toFixed(2)} <span className="text-[10px] text-stone-400">€/m³</span></div>
            </div>
            <div className="bg-stone-50 p-4 rounded-lg border border-stone-100 text-center">
              <p className="text-[8px] font-black text-stone-400 uppercase tracking-tighter mb-1">DATE D'ARRIVÉE</p>
              <div className="text-lg font-black text-stone-900 flex items-center justify-center gap-1.5">
                <CalendarDays className="w-3.5 h-3.5 text-stone-300" />
                {selectedFacture.arrivalDate}
              </div>
            </div>
            <div className="bg-stone-50 p-4 rounded-lg border border-stone-100 text-center">
              <p className="text-[8px] font-black text-stone-400 uppercase tracking-tighter mb-1">VOLUME TOTAL</p>
              <div className="text-lg font-black text-stone-900">{selectedFacture.cbm.toFixed(2)} <span className="text-[10px] text-stone-400">m³</span></div>
            </div>
            <div className="bg-amber-600 p-4 rounded-lg border border-amber-500 text-center text-white">
              <p className="text-[8px] font-black text-amber-200 uppercase tracking-tighter mb-1">VALEUR LOGISTIQUE</p>
              <div className="text-lg font-black leading-none">{(selectedFacture.itemsVal + selectedFacture.freight).toLocaleString()} €</div>
            </div>
          </div>
        </header>

        <Card className="border-stone-200 shadow-none overflow-hidden">
          <CardHeader className="bg-stone-50/50 py-4 px-6 border-b border-stone-100 flex flex-row items-center justify-between">
            <CardTitle className="text-[11px] font-black uppercase text-stone-500 tracking-widest flex items-center gap-2">
              <Box className="w-4 h-4" /> Manifeste de Cargaison
            </CardTitle>
            <div className="flex gap-2">
              <Button 
                variant="outline" 
                size="sm" 
                onClick={() => { setModalInitialData(selectedFacture); setIsEditModalOpen(true); }}
                className="h-8 text-[10px] font-black uppercase tracking-widest"
              >
                Éditer Dossier
              </Button>
            </div>
          </CardHeader>
          <CardContent className="p-0">
            <Table>
              <TableHeader className="bg-stone-50/50">
                <TableRow>
                  <TableHead className="text-[10px] font-black uppercase py-3">Catégorie</TableHead>
                  <TableHead className="text-[10px] font-black uppercase py-3">Spécifications</TableHead>
                  <TableHead className="text-right text-[10px] font-black uppercase py-3">Quantité</TableHead>
                  <TableHead className="text-right text-[10px] font-black uppercase py-3">CBM</TableHead>
                  <TableHead className="text-right text-[10px) font-black uppercase py-3">Valeur March.</TableHead>
                  <TableHead className="w-[50px]"></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {selectedFactureArticles.map((o) => (
                  <TableRow key={o.id} className="hover:bg-stone-50/30 transition-colors border-stone-100">
                    <TableCell className="py-3">
                      <button 
                        onClick={() => onNavigateToCategory(o.categoryId)}
                        className="text-[10px] font-black text-stone-400 hover:text-amber-600 uppercase underline decoration-stone-200 underline-offset-4"
                      >
                        {o.categoryId}
                      </button>
                    </TableCell>
                    <TableCell className="text-[10px] font-bold text-stone-600">{o.specs || '-'}</TableCell>
                    <TableCell className="text-right font-black text-xs">
                      {o.quantity.toLocaleString()} <span className="text-[9px] text-stone-400 font-normal uppercase">{o.unitOfMeasure}</span>
                    </TableCell>
                    <TableCell className="text-right text-stone-500 font-bold text-xs">{o.cubicMeasurement?.toFixed(3)} <span className="text-[9px] text-stone-300">m³</span></TableCell>
                    <TableCell className="text-right font-black text-stone-900 text-xs">{(o.quantity * o.purchasePricePerUnit).toLocaleString()} €</TableCell>
                    <TableCell className="text-right">
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

  // MAIN REGISTRY VIEW
  return (
    <div className="space-y-8 animate-in fade-in duration-300">
      <header className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 bg-white p-8 rounded-2xl border border-stone-200 shadow-sm overflow-hidden relative">
        <div className="absolute top-0 right-0 w-64 h-64 bg-stone-50 rounded-full -translate-y-1/2 translate-x-1/2 -z-10" />
        <div className="relative">
          <h2 className="text-3xl font-black text-stone-900 uppercase tracking-tighter">Registre des Arrivages</h2>
          <p className="text-[11px] font-bold text-stone-400 uppercase tracking-widest mt-1">Analyse logistique et consolidation des dossiers d'importation</p>
        </div>
        <Button onClick={() => handleAddFacture()} className="bg-stone-900 hover:bg-black text-white font-black uppercase text-[10px] tracking-widest px-8 h-12 rounded-xl shadow-lg shadow-stone-200 gap-2 relative z-10 transition-transform hover:scale-105 active:scale-95">
          <Plus className="w-4 h-4" /> Déclarer un Arrivage
        </Button>
      </header>

      {orphanedFactureIds.length > 0 && (
        <section className="space-y-4">
          <div className="flex items-center gap-2 px-1">
            <AlertCircle className="w-5 h-5 text-amber-500" />
            <h3 className="text-xs font-black text-stone-800 uppercase tracking-widest">Dossiers Orphelins à Régulariser ({orphanedFactureIds.length})</h3>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
            {orphanedFactureIds.map(id => (
              <Card key={id} className="border-amber-200 bg-amber-50/20 shadow-none hover:bg-amber-50/40 transition-colors border-dashed">
                <CardContent className="p-4 flex justify-between items-center">
                  <div>
                    <p className="text-[8px] font-black text-amber-500 uppercase tracking-tighter mb-1">RÉFÉRENCE DÉTECTÉE</p>
                    <h4 className="text-base font-black text-stone-900 uppercase tracking-tight">{id}</h4>
                  </div>
                  <Button 
                    size="sm" 
                    variant="outline" 
                    onClick={() => handleAddFacture(id)}
                    className="h-9 border-amber-200 bg-white text-[9px] font-black uppercase text-amber-600 hover:bg-amber-600 hover:text-white transition-all rounded-lg"
                  >
                    Régulariser
                  </Button>
                </CardContent>
              </Card>
            ))}
          </div>
        </section>
      )}

      <section className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
        {declaredFactures.map((f, idx) => (
          <div 
            key={f.id} 
            onClick={() => setSelectedFactureId(f.id)}
            className="group bg-white rounded-2xl shadow-sm border border-stone-200 p-6 hover:border-stone-900 cursor-pointer transition-all flex flex-col relative overflow-hidden active:scale-95"
          >
            <div className="absolute top-0 right-0 p-3">
              <div className="bg-stone-50 text-stone-400 text-[8px] font-black px-3 py-1.5 rounded-lg group-hover:bg-stone-900 group-hover:text-white transition-colors uppercase tracking-widest border border-stone-100">
                {f.arrivalDate}
              </div>
            </div>

            <div className="pt-2">
              <p className="text-[9px] text-stone-400 font-black uppercase tracking-widest mb-1">{f.supplierId || f.supplier}</p>
              <h3 className="text-2xl font-black text-stone-900 tracking-tighter uppercase mb-6 group-hover:text-stone-900 transition-colors">{f.id}</h3>
              
              <div className="grid grid-cols-2 gap-3 mb-6">
                <div className="bg-stone-50/50 p-3 rounded-xl border border-stone-100 flex flex-col items-center">
                  <p className="text-[7px] font-black text-stone-400 uppercase mb-1">Efficience</p>
                  <p className="text-sm font-black text-stone-800">{f.efficiency.toFixed(2)}</p>
                  <p className="text-[7px] font-bold text-stone-300">€/m³</p>
                </div>
                <div className="bg-stone-50/50 p-3 rounded-xl border border-stone-100 flex flex-col items-center">
                  <p className="text-[7px] font-black text-stone-400 uppercase mb-1">Volume</p>
                  <p className="text-sm font-black text-stone-800">{f.cbm.toFixed(2)}</p>
                  <p className="text-[7px] font-bold text-stone-300">m³</p>
                </div>
              </div>

              <div className="flex justify-between items-center text-[10px] font-black uppercase border-t border-stone-100 pt-4">
                <span className="text-stone-400 flex items-center gap-1.5">
                  <Box className="w-3 h-3" /> {f.itemsCount} lignes
                </span>
                <span className="text-emerald-500 flex items-center gap-1">
                   <CheckCircle2 className="w-3 h-3" /> Validé
                </span>
              </div>
            </div>
            
            <div className="mt-8 pt-4 border-t border-stone-100 flex justify-between items-end">
              <div>
                <p className="text-[8px] font-black text-stone-400 uppercase tracking-tighter">VALEUR CONSOLIDÉE</p>
                <p className="text-2xl font-black text-stone-900 tracking-tighter">{(f.itemsVal + f.freight).toLocaleString()} €</p>
              </div>
              <div className="w-10 h-10 rounded-full bg-stone-50 flex items-center justify-center group-hover:bg-stone-900 transition-colors">
                <TrendingDown className="w-5 h-5 text-stone-200 group-hover:text-white transition-colors" />
              </div>
            </div>
          </div>
        ))}
        {declaredFactures.length === 0 && (
          <div className="col-span-full py-32 text-center border-2 border-dashed border-stone-200 rounded-3xl bg-white/50">
            <div className="w-20 h-20 bg-stone-100 rounded-full flex items-center justify-center mx-auto mb-6">
              <Box className="w-10 h-10 text-stone-300" />
            </div>
            <p className="text-stone-400 font-black uppercase text-[11px] tracking-widest">Aucun dossier dans le registre logistique</p>
            <Button variant="outline" onClick={() => handleAddFacture()} className="mt-6 font-black uppercase text-[10px] tracking-widest rounded-xl px-8 h-10 border-stone-200">
              Déclarer le premier arrivage
            </Button>
          </div>
        )}
      </section>

      <AddFactureModal
        open={isEditModalOpen}
        onOpenChange={setIsEditModalOpen}
        factures={factures}
        editFacture={modalInitialData}
      />
    </div>
  );
}
