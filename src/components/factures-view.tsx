"use client";

import React, { useState, useMemo, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { 
  ChevronLeft, Plus, CalendarDays, Trash2, TrendingDown, 
  AlertCircle, CheckCircle2, FileText, Box, Truck,
  ShieldCheck, Info, ArrowUpRight, Anchor, Settings2, MousePointer2, Hash, Ship, DollarSign, Building2, Pencil, FileDown, Palette, ClipboardCheck
} from 'lucide-react';
import { exportFacturePDF } from '@/lib/pdf-export';
import { Badge } from '@/components/ui/badge';
import AddFactureModal from './add-facture-modal';
import EditOrderModal from './edit-order-modal';
import { useUser, useFirestore } from '@/firebase';
import { doc, collection, getDocs } from 'firebase/firestore';
import { deleteDocumentNonBlocking } from '@/firebase/non-blocking-updates';
import { useToast } from '@/hooks/use-toast';
import DossierChecklistModal from './dossier-checklist-modal';
import { getStatusInfo } from '@/lib/status-utils';

interface FacturesViewProps {
  articles: any[];
  factures: any[];
  subCategories: any[];
  selectedFactureId: string | null;
  setSelectedFactureId: (id: string | null) => void;
  onNavigateToCategory: (categoryName: string) => void;
  onBack?: () => void;
}

export default function FacturesView({ 
  articles, 
  factures,
  subCategories,
  selectedFactureId, 
  setSelectedFactureId,
  onNavigateToCategory,
  onBack
}: FacturesViewProps) {
  const { user } = useUser();
  const firestore = useFirestore();
  const { toast } = useToast();
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [modalInitialData, setModalInitialData] = useState<any>(null);
  const [editingArticle, setEditingArticle] = useState<any>(null);
  const [colorDetailArticle, setColorDetailArticle] = useState<any>(null);
  const [checklistFacture, setChecklistFacture] = useState<any>(null);
  const [dpDeclarations, setDpDeclarations] = useState<Record<string, Record<string, string>>>({});

  useEffect(() => {
    if (!firestore || !user) return;
    getDocs(collection(firestore, 'users', user.uid, 'dp_declarations'))
      .then(snap => {
        const result: Record<string, Record<string, string>> = {};
        snap.docs.forEach(d => { if (d.data().puMap) result[d.id] = d.data().puMap; });
        setDpDeclarations(result);
      }).catch(() => {});
  }, [firestore, user]);

  // Coût de Revient et Coût de Vente par dossier
  const costsPerFacture = useMemo(() => {
    const MARGE_RATE = 0.05;
    const result: Record<string, { revient: number; vente: number; hasDp: boolean }> = {};

    (factures || []).forEach(facture => {
      const fArticles = articles.filter(a => a.factureId === facture.id);
      const puMap = dpDeclarations[facture.id] || {};
      const hasDp = Object.values(puMap).some(v => parseFloat(v as string) > 0);
      if (fArticles.length === 0) { result[facture.id] = { revient: 0, vente: 0, hasDp }; return; }

      const invoicePaidDhs = Number(facture.invoicePaidDhs) || 0;
      const declaredValue = Number(facture.declaredValue) || 0;
      const tauxChange = declaredValue > 0 ? invoicePaidDhs / declaredValue : 0;
      const exchange = Number(facture.exchangeInvoiceAmount) || 0;
      const transitaire = Number(facture.supplierInvoiceAmount) || 0;
      const fraisSupp = Number(facture.additionalCostsAmount) || 0;
      const fretMad = (Number(facture.freightCost) || 0) * tauxChange;
      const mtFraisRevient = (exchange + transitaire + fraisSupp + fretMad) / 1.20;
      const mtFraisVente = (exchange + transitaire + fraisSupp) / 1.20;
      const cbmTotal = fArticles.reduce((s, a) => s + (Number(a.cubicMeasurement) || 0), 0);

      let dosRevient = 0;
      fArticles.forEach(a => {
        const cbm = Number(a.cubicMeasurement) || 0;
        const nw = Number(a.netWeight) || 0;
        const qty = Number(a.quantity) || 0;
        const fraisCmd = cbmTotal > 0 ? (cbm / cbmTotal) * mtFraisRevient : 0;
        const valAchatMad = qty * (Number(a.purchasePricePerUnit) || 0) * tauxChange;
        const cat = subCategories.find((c: any) => c.name === a.categoryId);
        const cvk = cat?.customsValuePerKg != null ? Number(cat.customsValuePerKg) : null;
        const idr = cat?.importDutyRate != null ? Number(cat.importDutyRate) / 100 : null;
        const tpr = cat?.tpiRate != null ? Number(cat.tpiRate) / 100 : null;
        const ticr = cat?.ticRate != null ? Number(cat.ticRate) / 100 : null;
        const tvar = cat?.tvaRate != null ? Number(cat.tvaRate) / 100 : null;
        const vd = cvk != null ? nw * cvk : 0;
        const di = idr != null ? vd * idr : 0;
        const tpi = tpr != null ? vd * tpr : 0;
        const tic = ticr != null ? vd * ticr : 0;
        const tva = tvar != null ? (vd + di + tpi) * tvar : 0;
        dosRevient += valAchatMad + fraisCmd + di + tpi + tic + tva;
      });

      const catMap: Record<string, { qty: number; nw: number; cbm: number }> = {};
      fArticles.forEach(a => {
        const catId = a.categoryId || '—';
        if (!catMap[catId]) catMap[catId] = { qty: 0, nw: 0, cbm: 0 };
        catMap[catId].qty += Number(a.quantity) || 0;
        catMap[catId].nw += Number(a.netWeight) || 0;
        catMap[catId].cbm += Number(a.cubicMeasurement) || 0;
      });

      let dosVente = 0;
      Object.entries(catMap).forEach(([categoryId, { qty, nw, cbm }]) => {
        const puDollar = parseFloat(puMap[categoryId] ?? '') || 0;
        if (puDollar === 0) return;
        const valAchatMad = qty * puDollar * tauxChange;
        const fraisCmd = cbmTotal > 0 ? (cbm / cbmTotal) * mtFraisVente : 0;
        const cat = subCategories.find((c: any) => c.name === categoryId);
        const cvk = cat?.customsValuePerKg != null ? Number(cat.customsValuePerKg) : null;
        const idr = cat?.importDutyRate != null ? Number(cat.importDutyRate) / 100 : null;
        const tpr = cat?.tpiRate != null ? Number(cat.tpiRate) / 100 : null;
        const ticr = cat?.ticRate != null ? Number(cat.ticRate) / 100 : null;
        const tvar = cat?.tvaRate != null ? Number(cat.tvaRate) / 100 : null;
        const vd = cvk != null ? nw * cvk : 0;
        const di = idr != null ? vd * idr : 0;
        const tpi = tpr != null ? vd * tpr : 0;
        const tic = ticr != null ? vd * ticr : 0;
        const totalHT = valAchatMad + fraisCmd + di + tpi + tic;
        const marge = totalHT * MARGE_RATE;
        const baseTva = vd + di + tpi + fraisCmd;
        const tva = tvar != null ? baseTva * tvar : 0;
        dosVente += totalHT + marge + tva;
      });

      result[facture.id] = { revient: dosRevient, vente: dosVente, hasDp };
    });
    return result;
  }, [factures, articles, subCategories, dpDeclarations]);

  const { declaredFactures, orphanedFactureIds } = useMemo(() => {
    const declaredIds = new Set((factures || []).map(f => f.id));
    const allIdsFromArticles = new Set(articles.map(a => a.factureId).filter(Boolean));
    const orphaned = Array.from(allIdsFromArticles).filter(id => !declaredIds.has(id));

    const aggregated = (factures || []).map(f => {
      const fArticles = articles.filter(o => o.factureId === f.id);
      const itemsCount = fArticles.length;
      const itemsVal = fArticles.reduce((sum, o) => sum + ((Number(o.quantity) || 0) * (Number(o.purchasePricePerUnit) || 0)), 0);
      const cbm = fArticles.reduce((sum, o) => sum + (Number(o.cubicMeasurement) || 0), 0);
      const netWeight = fArticles.reduce((sum, o) => sum + (Number(o.netWeight) || 0), 0);
      const freight = Number(f.freightCost) || Number(f.freight) || 0;
      const efficiency = cbm > 0 ? (freight / cbm) : 0;
      const realFactureValue = itemsVal + freight;
      const isIncomplete = fArticles.some(o => !Number(o.netWeight) || !Number(o.cubicMeasurement));
      return { ...f, itemsCount, itemsVal, cbm, netWeight, freight, efficiency, realFactureValue, isIncomplete };
    }).sort((a, b) => new Date(b.arrivalDate).getTime() - new Date(a.arrivalDate).getTime());

    return { declaredFactures: aggregated, orphanedFactureIds: orphaned };
  }, [articles, factures]);

  const selectedFacture = useMemo(() => {
    if (!selectedFactureId) return null;
    return declaredFactures.find(f => f.id === selectedFactureId);
  }, [declaredFactures, selectedFactureId]);

  const selectedFactureArticles = useMemo(() => {
    if (!selectedFactureId) return [];
    return articles
      .filter(o => o.factureId === selectedFactureId)
      .sort((a, b) => (a.name || '').localeCompare(b.name || ''));
  }, [articles, selectedFactureId]);

  // Calcul automatique du total droits payés (DI+TPI+TVA) pour le dossier sélectionné
  const calculatedDroitsPayes = useMemo(() => {
    if (!selectedFactureId) return 0;
    const factureArticles = articles.filter(a => a.factureId === selectedFactureId);
    const facture = declaredFactures.find(f => f.id === selectedFactureId);
    if (!facture) return 0;
    const invoicePaidDhs = Number(facture.invoicePaidDhs) || 0;
    const declaredValue = Number(facture.declaredValue) || 0;
    const tauxChange = declaredValue > 0 ? invoicePaidDhs / declaredValue : 0;
    return factureArticles.reduce((total, a) => {
      const nw = Number(a.netWeight) || 0;
      const cat = subCategories.find(c => c.name === a.categoryId);
      if (!cat || cat.customsValuePerKg == null) return total;
      const customsValuePerKg = Number(cat.customsValuePerKg);
      const importDutyRate = cat.importDutyRate != null ? Number(cat.importDutyRate) / 100 : 0;
      const tpiRate = cat.tpiRate != null ? Number(cat.tpiRate) / 100 : 0;
      const ticRate = cat.ticRate != null ? Number(cat.ticRate) / 100 : 0;
      const tvaRate = cat.tvaRate != null ? Number(cat.tvaRate) / 100 : 0;
      const valDouane = nw * customsValuePerKg;
      const di = valDouane * importDutyRate;
      const tpi = valDouane * tpiRate;
      const tic = valDouane * ticRate;
      const tva = (valDouane + di + tpi) * tvaRate;
      return total + di + tpi + tic + tva;
    }, 0);
  }, [selectedFactureId, articles, declaredFactures, subCategories]);

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

  const isZipperCategory = (cat: string) => {
    const c = cat?.toUpperCase() || "";
    const isZipper = c.includes("ZIPPER");
    const isExcluded = c.includes("LONG CHAIN") || c.includes("SLIDER");
    return isZipper && !isExcluded;
  };

  if (selectedFactureId && selectedFacture) {
    return (
      <div className="space-y-8 fade-in">
        <div className="flex items-center gap-3">
          <Button 
            variant="ghost" 
            size="sm" 
            onClick={() => onBack ? onBack() : setSelectedFactureId(null)} 
            className="text-stone-500 hover:text-stone-900 font-bold uppercase text-[10px] tracking-widest gap-2 bg-white shadow-sm border border-stone-100 rounded-full px-4 h-9"
          >
            <ChevronLeft className="w-4 h-4" /> Retour au Registre
          </Button>
        </div>

        <header className="bg-white rounded-3xl shadow-xl border border-stone-200 overflow-hidden">
          <div className="bg-stone-900 p-8 flex flex-col lg:flex-row justify-between items-start lg:items-center gap-8 relative overflow-hidden">
            <div className="absolute top-0 right-0 w-96 h-96 bg-white/5 rounded-full -translate-y-1/2 translate-x-1/2 blur-3xl" />
            
            <div className="flex items-center gap-6 relative z-10">
              <div className="p-4 bg-amber-500 rounded-2xl shadow-lg shadow-amber-500/20">
                <FileText className="w-8 h-8 text-white" />
              </div>
              <div>
                <p className="text-[10px] font-black text-amber-500 uppercase tracking-[0.2em] mb-1">Dossier d'Arrivage Officiel</p>
                <h2 className="text-4xl font-black text-white tracking-tighter uppercase leading-none">
                  {selectedFacture.id}
                </h2>
                <div className="flex flex-wrap items-center gap-4 mt-3">
                  <Badge className="bg-white/10 text-white border-white/20 px-3 py-1 text-[10px] font-bold uppercase tracking-widest">
                    <CheckCircle2 className="w-3 h-3 mr-2 text-emerald-400" /> Dossier Certifié
                  </Badge>
                  {selectedFacture.declaringCompany && (
                    <Badge className="bg-blue-600 text-white border-none px-3 py-1 text-[10px] font-bold uppercase tracking-widest">
                      <Building2 className="w-3 h-3 mr-2" /> {selectedFacture.declaringCompany}
                    </Badge>
                  )}
                  {selectedFacture.noBL && (
                    <Badge variant="outline" className="text-blue-400 border-blue-500/30 px-3 py-1 text-[10px] font-bold uppercase tracking-widest">
                      <Hash className="w-3 h-3 mr-2" /> BL: {selectedFacture.noBL}
                    </Badge>
                  )}
                  {selectedFacture.forwarder && (
                    <Badge variant="outline" className="text-amber-400 border-amber-500/30 px-3 py-1 text-[10px] font-bold uppercase tracking-widest">
                      <Truck className="w-3 h-3 mr-2" /> {selectedFacture.forwarder}
                    </Badge>
                  )}
                  {selectedFacture.shippingLine && (
                    <Badge variant="outline" className="text-stone-400 border-white/10 px-3 py-1 text-[10px] font-bold uppercase tracking-widest">
                      <Ship className="w-3 h-3 mr-2" /> {selectedFacture.shippingLine}
                    </Badge>
                  )}
                  <span className="text-stone-400 text-[10px] font-bold uppercase tracking-widest">
                    Partenaire : <span className="text-white ml-1">{selectedFacture.supplierId || selectedFacture.supplier}</span>
                  </span>
                </div>
              </div>
              {selectedFacture.stockEntryDate && (
                <div className="bg-emerald-500/20 p-3 px-4 rounded-2xl border border-emerald-500/30 shrink-0">
                  <p className="text-[8px] font-black text-emerald-400 uppercase tracking-widest mb-1">Entrée Stock</p>
                  <p className="text-sm font-black text-white uppercase">{selectedFacture.stockEntryDate}</p>
                </div>
              )}
            </div>

            <div className="grid grid-cols-2 md:grid-cols-5 gap-4 w-full lg:w-auto relative z-10">
              <SummaryBlock label="Efficience Fret" value={Number(selectedFacture.efficiency).toLocaleString('en-US', { maximumFractionDigits: 3 })} sub="$ / m³" color="text-amber-500" />
              <SummaryBlock label="Volume Total" value={Number(selectedFacture.cbm).toLocaleString('en-US', { maximumFractionDigits: 3 })} sub="m³" color="text-blue-400" />
              <div className="bg-stone-800 p-5 rounded-2xl text-white shadow-lg">
                <p className="text-[8px] font-black text-stone-400 uppercase tracking-widest mb-1">Valeur Facture Réelle</p>
                <div className="text-xl font-black">{Number(selectedFacture.realFactureValue).toLocaleString('en-US', { maximumFractionDigits: 3 })} $</div>
              </div>
              <div className="bg-amber-600 p-5 rounded-2xl text-white shadow-lg shadow-amber-600/20">
                <p className="text-[8px] font-black text-amber-200 uppercase tracking-widest mb-1">Valeur Douane</p>
                <div className="text-xl font-black">{Number(selectedFacture.declaredValue || selectedFacture.realFactureValue).toLocaleString('en-US', { maximumFractionDigits: 3 })} $</div>
              </div>
              <div className="bg-red-600 p-5 rounded-2xl text-white shadow-lg shadow-red-600/20">
                <p className="text-[8px] font-black text-red-100 uppercase tracking-widest mb-1">Droits Payés</p>
                <div className="text-xl font-black">{calculatedDroitsPayes.toLocaleString('fr-MA', { maximumFractionDigits: 0 })} <span className="text-[10px] font-bold text-red-200 ml-1">MAD</span></div>
                <p className="text-[7px] font-bold text-red-300 uppercase mt-0.5">Σ DI + TPI + TIC + TVA</p>
              </div>
            </div>
          </div>

          <div className="px-8 py-4 bg-stone-50 border-b border-stone-100 flex items-center justify-between">
            <div className="flex gap-8">
              <div>
                <p className="text-[8px] font-black text-stone-400 uppercase tracking-widest">Date d'Expédition (ETD)</p>
                <p className="text-[11px] font-bold text-stone-600">{selectedFacture.shippingDate || 'Non spécifiée'}</p>
              </div>
              <div>
                <p className="text-[8px] font-black text-stone-400 uppercase tracking-widest">Date d'Arrivée (ETA)</p>
                <p className="text-[11px] font-bold text-stone-600">{selectedFacture.arrivalDate}</p>
              </div>
              <div>
                <p className="text-[8px] font-black text-stone-400 uppercase tracking-widest">Transitaire (Remis le)</p>
                <p className="text-[11px] font-bold text-stone-600">{selectedFacture.forwarder || '-'} {selectedFacture.forwarderGivenDate ? `(${selectedFacture.forwarderGivenDate})` : ''}</p>
              </div>
              <div>
                <p className="text-[8px] font-black text-stone-400 uppercase tracking-widest">Valeur Marchandise Seule</p>
                <p className="text-[11px] font-bold text-stone-600">{Number(selectedFacture.itemsVal).toLocaleString('en-US', { maximumFractionDigits: 3 })} $</p>
              </div>
              <div>
                <p className="text-[8px] font-black text-stone-400 uppercase tracking-widest">Frais de Fret Appliqués</p>
                <div className="flex items-center gap-2">
                  <p className="text-[11px] font-bold text-blue-600">{Number(selectedFacture.freight).toLocaleString('en-US', { maximumFractionDigits: 3 })} $</p>
                  {Number(selectedFacture.netWeight) > 0 && (
                    <span className="text-[9px] font-bold text-stone-400 bg-stone-100 px-1.5 py-0.5 rounded uppercase">
                      NW: {selectedFacture.netWeight.toLocaleString()} kg
                    </span>
                  )}
                </div>
              </div>
            </div>
          </div>

          {(selectedFacture.invoicePaidDhs || selectedFacture.exchangeInvoiceAmount || selectedFacture.supplierInvoiceAmount || selectedFacture.additionalCostsAmount) && (
            <div className="px-8 py-3 bg-stone-900 border-t border-white/5 flex gap-12 overflow-x-auto whitespace-nowrap scrollbar-hide">
              {selectedFacture.invoicePaidDhs > 0 && (
                <div>
                  <p className="text-[7px] font-bold text-emerald-400 uppercase tracking-widest mb-0.5">Total Payé (MAD)</p>
                  <p className="text-[12px] font-black text-emerald-400">{selectedFacture.invoicePaidDhs.toLocaleString()} <span className="text-[8px] font-bold opacity-60 ml-0.5">MAD</span></p>
                </div>
              )}
              {selectedFacture.exchangeInvoiceAmount > 0 && (
                <div>
                  <p className="text-[7px] font-bold text-stone-400 uppercase tracking-widest mb-0.5">Facture Échange</p>
                  <p className="text-[12px] font-black text-white">{selectedFacture.exchangeInvoiceAmount.toLocaleString()} <span className="text-[8px] font-bold opacity-60 ml-0.5">MAD</span></p>
                </div>
              )}
              {selectedFacture.supplierInvoiceAmount > 0 && (
                <div>
                  <p className="text-[7px] font-bold text-stone-400 uppercase tracking-widest mb-0.5">Facture Transitaire</p>
                  <p className="text-[12px] font-black text-white">{selectedFacture.supplierInvoiceAmount.toLocaleString()} <span className="text-[8px] font-bold opacity-60 ml-0.5">MAD</span></p>
                </div>
              )}
              {selectedFacture.additionalCostsAmount > 0 && (
                <div>
                  <p className="text-[7px] font-bold text-stone-400 uppercase tracking-widest mb-0.5">Frais Supp.</p>
                  <p className="text-[12px] font-black text-stone-300">{selectedFacture.additionalCostsAmount.toLocaleString()} <span className="text-[8px] font-bold opacity-60 ml-0.5">MAD</span></p>
                </div>
              )}
              {selectedFacture.invoicePaidDhs > 0 && selectedFacture.declaredValue > 0 && (
                <div className="border-l border-white/10 pl-8">
                  <p className="text-[7px] font-bold text-blue-400 uppercase tracking-widest mb-0.5">Taux de Change</p>
                  <p className="text-[12px] font-black text-blue-300">
                    {(selectedFacture.invoicePaidDhs / selectedFacture.declaredValue).toFixed(4)}
                    <span className="text-[8px] font-bold opacity-60 ml-1">MAD/$</span>
                  </p>
                  <p className="text-[7px] text-blue-500/60 uppercase tracking-widest">FACTURE PAYÉE ÷ VALEUR DOUANE</p>
                </div>
              )}
            </div>
          )}

          <div className="p-0">
            <Table>
              <TableHeader className="bg-stone-50/50">
                <TableRow>
                  <TableHead className="text-[10px] font-black uppercase py-5 px-8 text-stone-500">Article</TableHead>
                  <TableHead className="text-[10px] font-black uppercase py-5 text-stone-500">Statut</TableHead>
                  <TableHead className="text-[10px] font-black uppercase py-5 text-stone-500">Taille</TableHead>
                  <TableHead className="text-[10px] font-black uppercase py-5 text-stone-500">Couleur</TableHead>
                  <TableHead className="text-[10px] font-black uppercase py-5 text-stone-500">Technique / Spécifications</TableHead>
                  <TableHead className="text-right text-[10px] font-black uppercase py-5 text-stone-500">Quantité</TableHead>
                  <TableHead className="text-right text-[10px] font-black uppercase py-5 text-stone-500">Volume CBM</TableHead>
                  <TableHead className="text-right text-[10px] font-black uppercase py-5 text-stone-500">P.A. Unitaire</TableHead>
                  <TableHead className="text-right text-[10px] font-black uppercase py-5 pr-8 text-stone-500">Valeur March.</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {selectedFactureArticles.map((o) => {
                  const isZipper = isZipperCategory(o.categoryId);
                  return (
                    <TableRow 
                      key={o.id} 
                      className="hover:bg-stone-50/50 transition-colors border-stone-100 group cursor-pointer"
                      onClick={() => setEditingArticle(o)}
                    >
                      <TableCell className="py-3 px-8">
                        <div className="font-black text-[11px] text-stone-900 uppercase leading-tight flex items-center justify-between gap-2">
                          <button 
                            onClick={(e) => { e.stopPropagation(); onNavigateToCategory(o.categoryId); }}
                            className="group-hover:text-amber-600 flex items-center gap-2 transition-colors text-left"
                          >
                            {o.name} <ArrowUpRight className="w-3 h-3 opacity-0 group-hover:opacity-100 transition-opacity" />
                          </button>
                          <Button 
                            variant="ghost" 
                            size="icon" 
                            className="h-5 w-5 text-stone-300 hover:text-amber-600 shrink-0 opacity-0 group-hover:opacity-100 transition-opacity" 
                            onClick={(e) => { e.stopPropagation(); setEditingArticle(o); }}
                          >
                            <Pencil className="w-3 h-3" />
                          </Button>
                        </div>
                      </TableCell>
                      <TableCell className="py-3">
                        {(() => {
                          const si = getStatusInfo(o);
                          return (
                            <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[9px] font-black uppercase tracking-wider ${si.bgClass} ${si.textClass}`}>
                              {si.emoji} {si.label}
                            </span>
                          );
                        })()}
                      </TableCell>
                      <TableCell className="py-3 text-[10px]">{o.size || '-'}</TableCell>
                      <TableCell className="py-3 text-[10px]">
                        {o.colorBreakdown && o.colorBreakdown.length > 0 ? (
                          <div className="flex items-center gap-2">
                            <span className="text-violet-700 font-black uppercase text-[9px]">VARIOUS ({o.colorBreakdown.length})</span>
                            <button
                              onClick={() => setColorDetailArticle(o)}
                              className="flex items-center gap-1 text-[8px] font-black uppercase bg-violet-100 text-violet-600 hover:bg-violet-200 px-2 py-0.5 rounded-full transition-colors"
                            >
                              <Palette className="w-2.5 h-2.5" /> Détail
                            </button>
                          </div>
                        ) : (
                          o.color || '-'
                        )}
                      </TableCell>
                      <TableCell className="text-[11px] py-3">
                        {isZipper ? (
                          <div className="flex flex-col gap-0.5">
                            <span className="text-amber-600 font-black text-[8px] flex items-center gap-1.5 uppercase"><Settings2 className="w-2.5 h-2.5" /> TYPE: {o.zipperType || '-'}</span>
                            <span className="text-blue-600 font-black text-[8px] flex items-center gap-1.5 uppercase"><MousePointer2 className="w-2.5 h-2.5" /> {o.slider || '-'} ({o.sliderType || '-'})</span>
                          </div>
                        ) : (
                          <span className="text-stone-500 uppercase text-[9px]">{o.specs || '-'}</span>
                        )}
                      </TableCell>
                      <TableCell className="text-right font-black text-xs py-3">
                        {Number(o.quantity).toLocaleString('en-US', { maximumFractionDigits: 3 })} <span className="text-[9px] text-stone-400 font-normal uppercase ml-1">{o.unitOfMeasure}</span>
                      </TableCell>
                      <TableCell className="text-right text-emerald-600 font-bold text-xs py-3">{o.cubicMeasurement?.toLocaleString('en-US', { maximumFractionDigits: 3 })} m³</TableCell>
                      <TableCell className="text-right font-black text-amber-700 text-[10px] py-3">{Number(o.purchasePricePerUnit).toLocaleString('en-US', { maximumFractionDigits: 3 })} $</TableCell>
                      <TableCell className="text-right font-black text-stone-900 text-xs py-3 pr-8">{Number(o.quantity * o.purchasePricePerUnit).toLocaleString('en-US', { maximumFractionDigits: 3 })} $</TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
        </header>

        <div className="flex justify-end gap-3">
          <Button
            variant="outline"
            onClick={() => exportFacturePDF(selectedFacture, selectedFactureArticles)}
            className="h-10 text-[10px] font-black uppercase tracking-widest border-stone-200 rounded-xl px-6 gap-2 text-red-600 border-red-200 hover:bg-red-50"
          >
            <FileDown className="w-4 h-4" /> Exporter PDF
          </Button>
          <Button
            variant="outline"
            onClick={() => setChecklistFacture(selectedFacture)}
            className="h-10 text-[10px] font-black uppercase tracking-widest border-emerald-200 rounded-xl px-6 gap-2 text-emerald-700 hover:bg-emerald-50"
          >
            <ClipboardCheck className="w-4 h-4" /> Vérifier le Dossier
          </Button>
           <Button 
            variant="outline" 
            onClick={() => { setModalInitialData(selectedFacture); setIsEditModalOpen(true); }}
            className="h-10 text-[10px] font-black uppercase tracking-widest border-stone-200 rounded-xl px-6"
          >
            Paramétrer le Dossier
          </Button>
        </div>

        <AddFactureModal
          open={isEditModalOpen}
          onOpenChange={setIsEditModalOpen}
          factures={factures}
          editFacture={modalInitialData}
          associatedArticles={selectedFactureArticles}
        />

        {editingArticle && (
          <EditOrderModal 
            article={editingArticle} 
            onOpenChange={(open) => !open && setEditingArticle(null)} 
            factures={factures} 
          />
        )}

        <DossierChecklistModal
          open={!!checklistFacture}
          onOpenChange={(open) => !open && setChecklistFacture(null)}
          facture={checklistFacture}
          articles={articles}
        />

        {/* Color Breakdown Detail Dialog */}
        {colorDetailArticle && (
          <Dialog open={!!colorDetailArticle} onOpenChange={(open) => !open && setColorDetailArticle(null)}>
            <DialogContent className="max-w-sm border-stone-200 rounded-2xl p-0 overflow-hidden">
              <div className="bg-violet-700 p-5 flex items-center gap-3 text-white">
                <div className="p-2 bg-white/10 rounded-lg">
                  <Palette className="w-5 h-5" />
                </div>
                <div>
                  <DialogTitle className="text-base font-black uppercase tracking-tight leading-none">
                    Détail Multi-Couleurs
                  </DialogTitle>
                  <p className="text-[9px] font-bold text-violet-300 uppercase tracking-widest mt-0.5">
                    {colorDetailArticle.name} · {colorDetailArticle.size || ''}
                  </p>
                </div>
              </div>
              <div className="p-4">
                <div className="rounded-xl overflow-hidden border border-violet-100">
                  <div className="grid grid-cols-[1fr_100px] bg-violet-100/60">
                    <div className="py-2 px-3 text-[9px] font-black uppercase text-violet-600 tracking-widest flex items-center gap-1">
                      <Hash className="w-2.5 h-2.5" /> N° Couleur
                    </div>
                    <div className="py-2 px-3 text-[9px] font-black uppercase text-violet-600 tracking-widest text-right">
                      Rouleaux
                    </div>
                  </div>
                  <div className="divide-y divide-violet-50 max-h-64 overflow-y-auto">
                    {(colorDetailArticle.colorBreakdown || []).map((row: any, i: number) => (
                      <div key={i} className="grid grid-cols-[1fr_100px] hover:bg-violet-50/30 transition-colors">
                        <div className="py-2.5 px-3 text-[11px] font-black text-stone-800 uppercase">{row.colorCode}</div>
                        <div className="py-2.5 px-3 text-[11px] font-black text-stone-900 text-right">{Number(row.rolls).toLocaleString()}</div>
                      </div>
                    ))}
                  </div>
                  <div className="grid grid-cols-[1fr_100px] bg-violet-600 text-white">
                    <div className="py-2.5 px-3 text-[9px] font-black uppercase tracking-widest">TOTAL</div>
                    <div className="py-2.5 px-3 text-right text-[11px] font-black">
                      {(colorDetailArticle.colorBreakdown || []).reduce((s: number, r: any) => s + (Number(r.rolls) || 0), 0).toLocaleString('en-US')} rolls
                    </div>
                  </div>
                </div>
              </div>
            </DialogContent>
          </Dialog>
        )}
      </div>
    );
  }

  return (
    <div className="space-y-10 fade-in">
      <header className="flex flex-col md:flex-row justify-between items-start md:items-center gap-6 bg-stone-900 p-10 rounded-[2.5rem] shadow-2xl relative overflow-hidden">
        <div className="absolute top-0 right-0 w-[500px] h-[500px] bg-amber-500/10 rounded-full -translate-y-1/2 translate-x-1/2 blur-[100px]" />
        
        <div className="relative z-10">
          <div className="flex items-center gap-3 mb-4">
            <Badge className="bg-amber-500 text-white border-none px-4 py-1 text-[10px] font-black uppercase tracking-widest rounded-full shadow-lg shadow-amber-500/30">
              Supply Chain Center
            </Badge>
          </div>
          <h2 className="text-5xl font-black text-white uppercase tracking-tighter leading-tight">
            Registre des <br /> <span className="text-amber-500">Arrivages</span>
          </h2>
          <p className="text-stone-400 text-sm font-medium mt-4 max-w-md leading-relaxed">
            Centralisation et analyse de performance logistique pour chaque conteneur et facture d'importation.
          </p>
        </div>

        <div className="flex flex-col gap-4 relative z-10 w-full md:w-auto">
          <Button onClick={() => handleAddFacture()} className="bg-amber-500 hover:bg-amber-600 text-white font-black uppercase text-[11px] tracking-widest px-10 h-14 rounded-2xl shadow-xl shadow-amber-500/20 gap-3 transition-all hover:scale-105 active:scale-95">
            <Plus className="w-5 h-5" /> Déclarer un Dossier
          </Button>
          <div className="flex gap-4">
            <div className="bg-white/5 border border-white/10 px-6 py-4 rounded-2xl text-center flex-1">
              <p className="text-[8px] font-black text-stone-500 uppercase tracking-widest mb-1">Efficience Moyenne</p>
              <p className="text-xl font-black text-white">42 $/m³</p>
            </div>
            <div className="bg-white/5 border border-white/10 px-6 py-4 rounded-2xl text-center flex-1">
              <p className="text-[8px] font-black text-stone-500 uppercase tracking-widest mb-1">Factures</p>
              <p className="text-xl font-black text-white">{declaredFactures.length}</p>
            </div>
          </div>
        </div>
      </header>

      {orphanedFactureIds.length > 0 && (
        <section className="space-y-4">
          <div className="flex items-center gap-3 px-2">
            <div className="w-2 h-2 rounded-full bg-amber-500 animate-pulse" />
            <h3 className="text-[11px] font-black text-stone-800 uppercase tracking-[0.2em]">Dossiers en attente de régularisation ({orphanedFactureIds.length})</h3>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
            {orphanedFactureIds.map(id => (
              <Card key={id} className="border-amber-200 bg-white shadow-lg shadow-amber-500/5 hover:bg-amber-50/50 transition-all border-dashed rounded-2xl group cursor-pointer" onClick={() => handleAddFacture(id)}>
                <CardContent className="p-6 flex justify-between items-center">
                  <div>
                    <p className="text-[9px] font-black text-amber-600 uppercase tracking-widest mb-1 flex items-center gap-2">
                      <AlertCircle className="w-3 h-3" /> Référence Détectée
                    </p>
                    <h4 className="text-lg font-black text-stone-900 uppercase tracking-tight">{id}</h4>
                  </div>
                  <div className="p-3 bg-amber-100 rounded-xl group-hover:bg-amber-500 group-hover:text-white transition-all">
                    <ArrowUpRight className="w-5 h-5" />
                  </div>
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
            className="group bg-white rounded-[2rem] shadow-xl border border-stone-100 p-8 hover:border-amber-500 cursor-pointer transition-all flex flex-col relative overflow-hidden active:scale-95 status-glow-amber"
          >
            <div className="absolute top-0 left-0 w-2 h-full bg-amber-500 group-hover:w-3 transition-all" />
            
            {f.isIncomplete && (
              <div className="absolute top-4 right-4 flex items-center gap-1 bg-orange-100 text-orange-700 border border-orange-200 px-2 py-1 rounded-full text-[8px] font-black uppercase tracking-wide">
                <AlertCircle className="w-2.5 h-2.5" /> Incomplet
              </div>
            )}
            <div className="flex justify-between items-start mb-8">
              <div className="p-3 bg-stone-50 rounded-2xl text-stone-400 group-hover:bg-amber-50 group-hover:text-amber-600 transition-colors">
                <Anchor className="w-6 h-6" />
              </div>
              <Badge variant="outline" className="text-[9px] font-black uppercase tracking-widest border-stone-200 px-3 py-1">
                {f.arrivalDate}
              </Badge>
            </div>

            <div className="flex-grow">
              <div className="flex items-center gap-2 mb-1">
                <p className="text-[10px] text-stone-400 font-black uppercase tracking-[0.15em]">{f.supplierId || f.supplier}</p>
                {f.shippingLine && <span className="text-[8px] text-stone-300 font-bold uppercase">• {f.shippingLine}</span>}
              </div>
              <h3 className="text-2xl font-black text-stone-900 tracking-tighter uppercase mb-2 line-clamp-1">{f.id}</h3>
              {f.declaringCompany && (
                <p className="text-[10px] font-black text-blue-600 uppercase mb-6 flex items-center gap-1.5">
                  <Building2 className="w-3 h-3" /> {f.declaringCompany}
                </p>
              )}
              
              <div className="grid grid-cols-2 gap-4 mb-8">
                <div className="bg-stone-50 p-4 rounded-2xl text-center group-hover:bg-stone-100/50 transition-colors">
                  <p className="text-[8px] font-black text-stone-400 uppercase mb-1">Valeur Facture</p>
                  <p className="text-base font-black text-stone-900">{Number(f.realFactureValue).toLocaleString('en-US', { maximumFractionDigits: 3 })}</p>
                  <p className="text-[7px] font-bold text-stone-300">TOTAL RÉEL $</p>
                </div>
                <div className="bg-stone-50 p-4 rounded-2xl text-center group-hover:bg-stone-100/50 transition-colors">
                  <p className="text-[8px] font-black text-stone-400 uppercase mb-1">Volume</p>
                  <p className="text-base font-black text-stone-900">{Number(f.cbm).toLocaleString('en-US', { maximumFractionDigits: 3 })}</p>
                  <p className="text-[7px] font-bold text-stone-300">m³</p>
                </div>
              </div>

              <div className="pt-6 border-t border-stone-100 flex justify-between items-end">
                <div>
                  <p className="text-[8px] font-black text-stone-400 uppercase tracking-widest mb-1">Valeur Déclarée (Douane)</p>
                  <p className="text-2xl font-black text-amber-600 tracking-tighter">{Number(f.declaredValue || f.realFactureValue).toLocaleString('en-US', { maximumFractionDigits: 3 })} $</p>
                </div>
                <div className="p-3 bg-stone-50 rounded-xl group-hover:bg-stone-900 group-hover:text-white transition-all">
                  <ArrowUpRight className="w-4 h-4" />
                </div>
              </div>

              {/* Coûts calculés */}
              {costsPerFacture[f.id] && costsPerFacture[f.id].revient > 0 && (
                <div className="mt-4 pt-4 border-t border-stone-100 space-y-1.5">
                  <div className="flex justify-between items-center">
                    <span className="text-[8px] font-black text-stone-400 uppercase tracking-widest">Coût Revient TTC</span>
                    <span className="text-[11px] font-black text-stone-700">{(costsPerFacture[f.id].revient / 1000).toLocaleString('fr-FR', { minimumFractionDigits: 1, maximumFractionDigits: 1 })}K MAD</span>
                  </div>
                  {costsPerFacture[f.id].hasDp && costsPerFacture[f.id].vente > 0 && (
                    <>
                      <div className="flex justify-between items-center">
                        <span className="text-[8px] font-black text-stone-400 uppercase tracking-widest">Coût Vente TTC</span>
                        <span className="text-[11px] font-black text-sky-600">{(costsPerFacture[f.id].vente / 1000).toLocaleString('fr-FR', { minimumFractionDigits: 1, maximumFractionDigits: 1 })}K MAD</span>
                      </div>
                      <div className="flex justify-between items-center pt-1.5 border-t border-stone-100">
                        <span className="text-[8px] font-black text-stone-400 uppercase tracking-widest">Différence</span>
                        <span className={`text-sm font-black ${
                          (costsPerFacture[f.id].revient - costsPerFacture[f.id].vente) >= 0
                            ? 'text-emerald-600' : 'text-red-500'
                        }`}>
                          {(costsPerFacture[f.id].revient - costsPerFacture[f.id].vente) >= 0 ? '+' : ''}
                          {((costsPerFacture[f.id].revient - costsPerFacture[f.id].vente) / 1000).toLocaleString('fr-FR', { minimumFractionDigits: 1, maximumFractionDigits: 1 })}K
                        </span>
                      </div>
                    </>
                  )}
                  {!costsPerFacture[f.id].hasDp && (
                    <p className="text-[8px] font-bold text-amber-500 uppercase tracking-widest">⚠ DP non remplie</p>
                  )}
                </div>
              )}
            </div>
          </div>
        ))}
        
        {declaredFactures.length === 0 && (
          <div className="col-span-full py-40 text-center border-4 border-dashed border-stone-100 rounded-[3rem] bg-white/50">
            <div className="w-24 h-24 bg-stone-50 rounded-full flex items-center justify-center mx-auto mb-8">
              <Box className="w-10 h-10 text-stone-200" />
            </div>
            <p className="text-stone-300 font-black uppercase text-[12px] tracking-[0.2em]">Dossier Logistique Vide</p>
            <Button variant="outline" onClick={() => handleAddFacture()} className="mt-8 font-black uppercase text-[11px] tracking-widest rounded-2xl px-10 h-12 border-stone-200 hover:bg-stone-900 hover:text-white transition-all">
              Initialiser un Dossier
            </Button>
          </div>
        )}
      </section>

      <AddFactureModal
        open={isEditModalOpen}
        onOpenChange={setIsEditModalOpen}
        factures={factures}
        editFacture={modalInitialData}
        associatedArticles={modalInitialData ? articles.filter((a: any) => a.factureId === modalInitialData.id) : []}
      />
    </div>
  );
}

function SummaryBlock({ label, value, sub, icon, color }: { label: string, value: string, sub?: string, icon?: React.ReactNode, color: string }) {
  return (
    <div className="bg-white/5 border border-white/10 p-5 rounded-2xl text-center min-w-[140px]">
      <p className="text-[8px] font-black text-stone-500 uppercase tracking-widest mb-1">{label}</p>
      <div className={`text-xl font-black ${color} flex items-center justify-center gap-2 leading-none`}>
        {icon}
        {value} <span className="text-[10px] font-normal text-stone-500 ml-1">{sub}</span>
      </div>
    </div>
  );
}
