"use client";

import React, { useState, useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { 
  Users, ChevronLeft, Package, Calendar, Clock, 
  Ship, FileText, ArrowRight, Factory, DollarSign, Plus, 
  Trash2, Landmark, CheckCircle2, History, Building2, Layers, Briefcase, Download, UserCircle2, KeyRound, Loader2, Info, AlertTriangle
} from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { useUser, useFirestore } from '@/firebase';
import { doc, collection, serverTimestamp, setDoc } from 'firebase/firestore';
import { setDocumentNonBlocking, deleteDocumentNonBlocking } from '@/firebase/non-blocking-updates';
import { useToast } from '@/hooks/use-toast';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Separator } from '@/components/ui/separator';
import { exportSupplierPDF, exportCompanyPDF, exportShippingPDF, exportForwarderPDF } from '@/lib/pdf-export';
import { initializeApp, getApps, deleteApp } from 'firebase/app';
import { getAuth, createUserWithEmailAndPassword, signInWithEmailAndPassword, updateProfile } from 'firebase/auth';
import { firebaseConfig } from '@/firebase/config';

interface SuppliersViewProps {
  articles: any[];
  factures: any[];
  payments: any[];
  onNavigateToFacture: (factureId: string) => void;
}

const COMPANIES_LIST = ["New fournitures", "Lebtex", "Robe in box"];

export default function SuppliersView({ articles, factures, payments, onNavigateToFacture }: SuppliersViewProps) {
  const [selectedSupplier, setSelectedSupplier] = useState<string | null>(null);
  const [selectedCompany, setSelectedCompany] = useState<string | null>(null);
  const [selectedShipping, setSelectedShipping] = useState<string | null>(null);
  const [selectedForwarder, setSelectedForwarder] = useState<string | null>(null);
  const [selectedClient, setSelectedClient] = useState<string | null>(null);

  const supplierStats = useMemo(() => {
    const stats: Record<string, { val: number; orders: number; categories: Set<string> }> = {};
    articles.forEach(o => {
      const sup = o.supplierId || 'Inconnu';
      if (!stats[sup]) stats[sup] = { val: 0, orders: 0, categories: new Set() };
      stats[sup].val += (o.quantity * o.purchasePricePerUnit);
      stats[sup].orders += 1;
      stats[sup].categories.add(o.categoryId || 'Inconnu');
    });
    return Object.entries(stats).sort((a, b) => b[1].val - a[1].val);
  }, [articles]);

  const companyStats = useMemo(() => {
    return COMPANIES_LIST.map(name => {
      const companyFactures = factures.filter(f => f.declaringCompany === name);
      const companyArticles = articles.filter(a => companyFactures.some(f => f.id === a.factureId));
      
      let val = 0;
      companyFactures.forEach(f => {
        const fArticles = articles.filter(a => a.factureId === f.id);
        const itemsVal = fArticles.reduce((s, a) => s + (a.quantity * a.purchasePricePerUnit), 0);
        const freight = Number(f.freightCost) || Number(f.freight) || 0;
        val += (itemsVal + freight);
      });

      return {
        name,
        val,
        dossiers: companyFactures.length,
        articles: companyArticles.length
      };
    }).sort((a, b) => b.val - a.val);
  }, [articles, factures]);

  const shippingStats = useMemo(() => {
    const stats: Record<string, { val: number; dossiers: number; freight: number; cbm: number }> = {};
    factures.forEach(f => {
      const line = f.shippingLine || 'Inconnu';
      if (!stats[line]) stats[line] = { val: 0, dossiers: 0, freight: 0, cbm: 0 };
      
      const fArticles = articles.filter(a => a.factureId === f.id);
      const itemsVal = fArticles.reduce((s, a) => s + (a.quantity * a.purchasePricePerUnit), 0);
      const itemsCbm = fArticles.reduce((s, a) => s + (a.cubicMeasurement || 0), 0);
      const freight = Number(f.freightCost) || Number(f.freight) || 0;
      
      stats[line].val += (itemsVal + freight);
      stats[line].freight += freight;
      stats[line].dossiers += 1;
      stats[line].cbm += itemsCbm;
    });
    return Object.entries(stats)
      .map(([name, data]) => ({ name, ...data }))
      .sort((a, b) => b.freight - a.freight);
  }, [articles, factures]);

  const forwarderStats = useMemo(() => {
    const stats: Record<string, { dossiers: number; dossiersList: string[] }> = {};
    factures
      .filter(f => f.forwarder && f.forwarderGivenDate)
      .forEach(f => {
        const fw = f.forwarder;
        if (!stats[fw]) stats[fw] = { dossiers: 0, dossiersList: [] };
        stats[fw].dossiers += 1;
        stats[fw].dossiersList.push(f.id);
      });
    return Object.entries(stats)
      .map(([name, data]) => ({ name, ...data }))
      .sort((a, b) => b.dossiers - a.dossiers);
  }, [factures]);

  const clientStats = useMemo(() => {
    const stats: Record<string, { orders: number; categories: Set<string> }> = {};
    articles
      .filter(a => a.isPreorder && a.clientName)
      .forEach(a => {
        const client = a.clientName.trim();
        if (!stats[client]) stats[client] = { orders: 0, categories: new Set() };
        stats[client].orders += 1;
        stats[client].categories.add(a.categoryId || 'Inconnu');
      });
    return Object.entries(stats)
      .map(([name, data]) => ({ name, ...data }))
      .sort((a, b) => b.orders - a.orders);
  }, [articles]);

  if (selectedClient) {
    return (
      <ClientDetailView
        clientName={selectedClient}
        articles={articles}
        factures={factures}
        onBack={() => setSelectedClient(null)}
      />
    );
  }

  if (selectedSupplier) {
    return (
      <SupplierDetailView 
        supplierName={selectedSupplier} 
        articles={articles} 
        factures={factures}
        payments={payments}
        onBack={() => setSelectedSupplier(null)}
        onNavigateToFacture={onNavigateToFacture}
      />
    );
  }

  if (selectedCompany) {
    return (
      <CompanyDetailView 
        companyName={selectedCompany} 
        articles={articles} 
        factures={factures}
        onBack={() => setSelectedCompany(null)}
        onNavigateToFacture={onNavigateToFacture}
      />
    );
  }

  if (selectedShipping) {
    return (
      <ShippingDetailView 
        shippingName={selectedShipping} 
        articles={articles} 
        factures={factures}
        onBack={() => setSelectedShipping(null)}
        onNavigateToFacture={onNavigateToFacture}
      />
    );
  }

  if (selectedForwarder) {
    return (
      <ForwarderDetailView
        forwarderName={selectedForwarder}
        articles={articles}
        factures={factures}
        onBack={() => setSelectedForwarder(null)}
        onNavigateToFacture={onNavigateToFacture}
      />
    );
  }

  return (
    <div className="space-y-12 fade-in">
      <header className="bg-stone-900 p-8 rounded-[2rem] shadow-xl relative overflow-hidden">
        <div className="absolute top-0 right-0 w-64 h-64 bg-amber-500/5 rounded-full -translate-y-1/2 translate-x-1/2 blur-3xl" />
        <div className="relative z-10">
          <h2 className="text-3xl font-black text-white uppercase tracking-tighter leading-none">Analyse des <br /><span className="text-amber-500">Flux Partenaires</span></h2>
          <p className="text-stone-400 text-xs font-bold uppercase tracking-widest mt-3">Gestion de la performance financière globale</p>
        </div>
      </header>
      
      <section className="space-y-6">
        <div className="flex items-center gap-3 px-2">
          <div className="p-2 bg-amber-500/10 rounded-lg">
            <Users className="w-5 h-5 text-amber-600" />
          </div>
          <h3 className="text-lg font-black text-stone-900 uppercase tracking-tight">Analyse des Fournisseurs</h3>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
          {supplierStats.map(([name, stat]) => (
            <Card 
              key={name} 
              onClick={() => setSelectedSupplier(name)}
              className="cursor-pointer border-none bg-white shadow-lg hover:shadow-2xl transition-all rounded-2xl overflow-hidden group active:scale-95 status-glow-amber"
            >
              <div className="h-1 w-full bg-stone-900 group-hover:bg-amber-500 transition-colors" />
              <CardHeader className="pb-4">
                <div className="flex justify-between items-start">
                  <CardTitle className="text-lg font-black text-stone-900 uppercase tracking-tight group-hover:text-amber-600 transition-colors">{name}</CardTitle>
                  <div className="p-2 bg-stone-50 rounded-lg text-stone-300 group-hover:text-amber-500 transition-colors">
                    <Factory className="w-4 h-4" />
                  </div>
                </div>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-black text-stone-900 mb-6">{Number(stat.val).toLocaleString('en-US', { maximumFractionDigits: 3 })} $</div>
                <div className="space-y-2 pt-4 border-t border-stone-50">
                  <div className="flex justify-between items-center text-[10px] font-bold text-stone-400 uppercase">
                    <span>Articles</span>
                    <span className="text-stone-900">{stat.orders}</span>
                  </div>
                  <div className="flex justify-between items-center text-[10px] font-bold text-stone-400 uppercase">
                    <span>Familles</span>
                    <span className="text-stone-900">{stat.categories.size}</span>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      </section>

      <Separator className="bg-stone-200" />

      <section className="space-y-6 pb-10">
        <div className="flex items-center gap-3 px-2">
          <div className="p-2 bg-blue-500/10 rounded-lg">
            <Building2 className="w-5 h-5 text-blue-600" />
          </div>
          <h3 className="text-lg font-black text-stone-900 uppercase tracking-tight">Analyse de nos Entités</h3>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
          {companyStats.map((stat) => (
            <Card 
              key={stat.name} 
              onClick={() => setSelectedCompany(stat.name)}
              className="cursor-pointer border-none bg-white shadow-lg hover:shadow-2xl transition-all rounded-2xl overflow-hidden group active:scale-95 status-glow-blue"
            >
              <div className="h-1 w-full bg-stone-900 group-hover:bg-blue-500 transition-colors" />
              <CardHeader className="pb-4">
                <div className="flex justify-between items-start">
                  <CardTitle className="text-lg font-black text-stone-900 uppercase tracking-tight group-hover:text-blue-600 transition-colors">{stat.name}</CardTitle>
                  <div className="p-2 bg-stone-50 rounded-lg text-stone-300 group-hover:text-blue-500 transition-colors">
                    <Building2 className="w-4 h-4" />
                  </div>
                </div>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-black text-stone-900 mb-6">{Number(stat.val).toLocaleString('en-US', { maximumFractionDigits: 3 })} $</div>
                <div className="space-y-2 pt-4 border-t border-stone-50">
                  <div className="flex justify-between items-center text-[10px] font-bold text-stone-400 uppercase">
                    <span>Dossiers</span>
                    <span className="text-stone-900">{stat.dossiers}</span>
                  </div>
                  <div className="flex justify-between items-center text-[10px] font-bold text-stone-400 uppercase">
                    <span>Articles</span>
                    <span className="text-stone-900">{stat.articles}</span>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      </section>

      <Separator className="bg-stone-200" />

      <section className="space-y-6 pb-10">
        <div className="flex items-center gap-3 px-2">
          <div className="p-2 bg-emerald-500/10 rounded-lg">
            <Ship className="w-5 h-5 text-emerald-600" />
          </div>
          <h3 className="text-lg font-black text-stone-900 uppercase tracking-tight">Analyse des Compagnies Maritimes</h3>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
          {shippingStats.map((stat) => (
            <Card 
              key={stat.name} 
              onClick={() => setSelectedShipping(stat.name)}
              className="cursor-pointer border-none bg-white shadow-lg hover:shadow-2xl transition-all rounded-2xl overflow-hidden group active:scale-95 status-glow-emerald"
            >
              <div className="h-1 w-full bg-stone-900 group-hover:bg-emerald-500 transition-colors" />
              <CardHeader className="pb-4">
                <div className="flex justify-between items-start">
                  <CardTitle className="text-lg font-black text-stone-900 uppercase tracking-tight group-hover:text-emerald-600 transition-colors">{stat.name}</CardTitle>
                  <div className="p-2 bg-stone-50 rounded-lg text-stone-300 group-hover:text-emerald-500 transition-colors">
                    <Ship className="w-4 h-4" />
                  </div>
                </div>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-black text-stone-900 mb-6">{Number(stat.freight).toLocaleString('en-US', { maximumFractionDigits: 3 })} $</div>
                <div className="space-y-2 pt-4 border-t border-stone-50">
                  <div className="flex justify-between items-center text-[10px] font-bold text-stone-400 uppercase">
                    <span>Arrivages</span>
                    <span className="text-stone-900">{stat.dossiers}</span>
                  </div>
                  <div className="flex justify-between items-center text-[10px] font-bold text-stone-400 uppercase">
                    <span>Volume</span>
                    <span className="text-stone-900">{Number(stat.cbm).toLocaleString('en-US', { maximumFractionDigits: 3 })} m³</span>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      </section>

      <Separator className="bg-stone-200" />

      <section className="space-y-6 pb-10">
        <div className="flex items-center gap-3 px-2">
          <div className="p-2 bg-violet-500/10 rounded-lg">
            <Briefcase className="w-5 h-5 text-violet-600" />
          </div>
          <h3 className="text-lg font-black text-stone-900 uppercase tracking-tight">Analyse des Transitaires</h3>
        </div>
        {forwarderStats.length === 0 ? (
          <div className="text-center py-16 text-stone-300 font-bold uppercase text-[10px]">Aucun transitaire avec dossier remis pour le moment</div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
            {forwarderStats.map((stat) => (
              <Card
                key={stat.name}
                onClick={() => setSelectedForwarder(stat.name)}
                className="cursor-pointer border-none bg-white shadow-lg hover:shadow-2xl transition-all rounded-2xl overflow-hidden group active:scale-95"
              >
                <div className="h-1 w-full bg-stone-900 group-hover:bg-violet-500 transition-colors" />
                <CardHeader className="pb-4">
                  <div className="flex justify-between items-start">
                    <CardTitle className="text-lg font-black text-stone-900 uppercase tracking-tight group-hover:text-violet-600 transition-colors">{stat.name}</CardTitle>
                    <div className="p-2 bg-stone-50 rounded-lg text-stone-300 group-hover:text-violet-500 transition-colors">
                      <Briefcase className="w-4 h-4" />
                    </div>
                  </div>
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-black text-stone-900 mb-6">{stat.dossiers} <span className="text-sm font-bold text-stone-400">Dossiers</span></div>
                  <div className="space-y-2 pt-4 border-t border-stone-50">
                    <div className="flex justify-between items-center text-[10px] font-bold text-stone-400 uppercase">
                      <span>Dossiers remis</span>
                      <span className="text-violet-600 font-black">{stat.dossiers}</span>
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </section>

      <Separator className="bg-stone-200" />

      <section className="space-y-6 pb-10">
        <div className="flex items-center gap-3 px-2">
          <div className="p-2 bg-indigo-500/10 rounded-lg">
            <UserCircle2 className="w-5 h-5 text-indigo-600" />
          </div>
          <h3 className="text-lg font-black text-stone-900 uppercase tracking-tight">Analyse des Clients</h3>
        </div>
        {clientStats.length === 0 ? (
          <div className="text-center py-16 text-stone-300 font-bold uppercase text-[10px]">Aucune précommande client enregistrée</div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
            {clientStats.map((stat) => (
              <ClientCard
                key={stat.name}
                stat={stat}
                onSelect={() => setSelectedClient(stat.name)}
              />
            ))}
          </div>
        )}
      </section>
    </div>
  );
}

function SupplierDetailView({ 
  supplierName, 
  articles, 
  factures, 
  payments,
  onBack, 
  onNavigateToFacture 
}: { 
  supplierName: string, 
  articles: any[], 
  factures: any[], 
  payments: any[],
  onBack: () => void, 
  onNavigateToFacture: (id: string) => void 
}) {
  const { user } = useUser();
  const firestore = useFirestore();
  const { toast } = useToast();
  const [isPaymentModalOpen, setIsPaymentModalOpen] = useState(false);

  const supArticles = useMemo(() => articles.filter(o => o.supplierId === supplierName), [articles, supplierName]);
  const supPayments = useMemo(() => (payments || []).filter(p => p.supplierId === supplierName).sort((a, b) => b.date.localeCompare(a.date)), [payments, supplierName]);
  
  const now = new Date();
  
  const supplierFactures = useMemo(() => {
    const ids = Array.from(new Set(supArticles.map(a => a.factureId).filter(Boolean)));
    
    return ids.map(id => {
      const factInfo = factures.find(f => f.id === id);
      const fArticles = supArticles.filter(a => a.factureId === id);
      const itemsVal = fArticles.reduce((s, a) => s + (a.quantity * a.purchasePricePerUnit), 0);
      const cbm = fArticles.reduce((s, a) => s + (a.cubicMeasurement || 0), 0);
      const freight = Number(factInfo?.freightCost) || Number(factInfo?.freight) || 0;
      const declared = Number(factInfo?.declaredValue) || itemsVal + freight;
      
      return {
        id,
        arrivalDate: factInfo?.arrivalDate || fArticles[0]?.arrivalDate || '-',
        itemsVal,
        freight,
        cbm,
        declared,
        totalReal: itemsVal + freight,
        isArrived: factInfo?.arrivalDate ? new Date(factInfo.arrivalDate) <= now : false
      };
    }).sort((a, b) => new Date(b.arrivalDate).getTime() - new Date(a.arrivalDate).getTime());
  }, [supArticles, factures]);
  const totalRealVal = supplierFactures.reduce((s, f) => s + f.totalReal, 0);
  const totalDeclaredVal = supplierFactures.reduce((s, f) => s + f.declared, 0);
  const totalPaid = supPayments.reduce((s, p) => s + Number(p.amount), 0);
  const currentGap = totalRealVal - totalDeclaredVal;
  const remainingToPay = currentGap - totalPaid;

  const handleDeletePayment = (paymentId: string) => {
    if (!user || !firestore) return;
    if (window.confirm("Supprimer ce paiement ?")) {
      const docRef = doc(firestore, 'users', user.uid, 'supplierPayments', paymentId);
      deleteDocumentNonBlocking(docRef);
      toast({ title: "Paiement supprimé" });
    }
  };

  const handleExportPDF = () => {
    exportSupplierPDF(supplierName, supplierFactures, {
      totalReal: totalRealVal,
      totalDeclared: totalDeclaredVal,
      gap: currentGap,
      remaining: remainingToPay,
      articles: supArticles.length,
    });
  };

  return (
    <div className="space-y-8 fade-in">
      <div className="flex items-center justify-between gap-3">
        <Button 
          variant="ghost" 
          size="sm" 
          onClick={onBack} 
          className="text-stone-500 hover:text-stone-900 font-bold uppercase text-[10px] tracking-widest gap-2 bg-white shadow-sm border border-stone-100 rounded-full px-4 h-9"
        >
          <ChevronLeft className="w-4 h-4" /> Tous les Partenaires
        </Button>
        <Button
          size="sm"
          onClick={handleExportPDF}
          className="bg-amber-500 hover:bg-amber-600 text-stone-900 font-black uppercase text-[9px] tracking-widest px-4 h-9 rounded-full shadow-lg shadow-amber-100 gap-2"
        >
          <Download className="w-3.5 h-3.5" /> Exporter PDF
        </Button>
      </div>

      <header className="bg-white rounded-[2rem] shadow-xl border border-stone-200 overflow-hidden">
        <div className="bg-stone-900 p-8 flex flex-col xl:flex-row justify-between items-start xl:items-center gap-8 relative overflow-hidden">
          <div className="absolute top-0 right-0 w-[600px] h-[600px] bg-white/5 rounded-full -translate-y-1/2 translate-x-1/4 blur-[120px]" />
          
          <div className="flex items-center gap-6 relative z-10">
            <div className="p-4 bg-stone-800 rounded-2xl shadow-lg border border-white/5">
              <Factory className="w-8 h-8 text-white" />
            </div>
            <div>
              <p className="text-[10px] font-black text-stone-500 uppercase tracking-[0.2em] mb-1">Dossier Partenaire Consolidé</p>
              <h2 className="text-4xl font-black text-white tracking-tighter uppercase leading-none">{supplierName}</h2>
              <div className="flex gap-4 mt-4">
                <Badge className="bg-white/10 text-white border-white/10 px-3 py-1 text-[10px] font-bold uppercase">
                  {supplierFactures.length} Dossiers
                </Badge>
                <Badge className="bg-white/10 text-white border-white/10 px-3 py-1 text-[10px] font-bold uppercase">
                  {supArticles.length} Articles
                </Badge>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 w-full xl:w-auto relative z-10">
            <SummaryBlock label="Valeur Réelle Totale" value={Number(totalRealVal).toLocaleString('en-US', { maximumFractionDigits: 3 })} sub="$" color="text-white" />
            <SummaryBlock label="Valeur Déclarée Totale" value={Number(totalDeclaredVal).toLocaleString('en-US', { maximumFractionDigits: 3 })} sub="$" color="text-amber-500" />
            <div className="bg-stone-800 p-5 rounded-2xl text-white shadow-lg border border-white/5">
              <p className="text-[8px] font-black text-stone-400 uppercase tracking-widest mb-1">Différence Totale</p>
              <div className="text-xl font-black text-blue-400">{Number(currentGap).toLocaleString('en-US', { maximumFractionDigits: 3 })} $</div>
            </div>
            <div className={`p-5 rounded-2xl text-white shadow-lg border ${remainingToPay <= 0 ? 'bg-emerald-600 border-emerald-500' : 'bg-red-600 border-red-500'}`}>
              <p className="text-[8px] font-black opacity-70 uppercase tracking-widest mb-1">Reste à Régulariser</p>
              <div className="text-xl font-black">{Number(remainingToPay).toLocaleString('en-US', { maximumFractionDigits: 3 })} $</div>
            </div>
          </div>
        </div>
      </header>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        <div className="lg:col-span-2 space-y-6">
          <section className="space-y-4">
            <div className="flex items-center gap-3 px-2">
              <div className="p-2 bg-stone-100 rounded-lg">
                <FileText className="w-4 h-4 text-stone-500" />
              </div>
              <h3 className="text-xs font-black text-stone-900 uppercase tracking-widest">Historique des Factures & Arrivages</h3>
            </div>
            <Card className="border-stone-200 shadow-xl rounded-2xl overflow-hidden bg-white">
              <Table>
                <TableHeader className="bg-stone-50/80">
                  <TableRow>
                    <TableHead className="text-[9px] font-black uppercase py-4">Statut</TableHead>
                    <TableHead className="text-[9px] font-black uppercase py-4">N° Dossier</TableHead>
                    <TableHead className="text-[9px] font-black uppercase py-4">Arrivée</TableHead>
                    <TableHead className="text-right text-[9px] font-black uppercase py-4">Volume CBM</TableHead>
                    <TableHead className="text-right text-[9px] font-black uppercase py-4">Valeur Réelle</TableHead>
                    <TableHead className="text-right text-[9px] font-black uppercase py-4 text-amber-600">Valeur Déclarée</TableHead>
                    <TableHead className="w-10"></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {supplierFactures.length === 0 ? (
                    <TableRow><TableCell colSpan={7} className="text-center py-12 text-stone-300 font-bold uppercase text-[10px]">Aucun dossier détecté</TableCell></TableRow>
                  ) : supplierFactures.map((f) => (
                    <TableRow key={f.id} className="hover:bg-stone-50/50 transition-colors group">
                      <TableCell className="py-3">
                        {f.isArrived ? 
                          <Badge className="bg-emerald-50 text-emerald-700 border-emerald-100 text-[8px] font-black uppercase">Réceptionné</Badge> : 
                          <Badge className="bg-blue-50 text-blue-700 border-blue-100 text-[8px] font-black uppercase">Transit</Badge>
                        }
                      </TableCell>
                      <TableCell className="py-3 font-black text-stone-900 uppercase text-[11px]">{f.id}</TableCell>
                      <TableCell className={`py-3 text-[10px] font-bold ${f.isArrived ? 'text-emerald-600' : 'text-blue-600'}`}>{f.arrivalDate}</TableCell>
                      <TableCell className="py-3 text-right font-bold text-stone-500 text-[10px]">{f.cbm.toLocaleString('en-US', { maximumFractionDigits: 3 })} m³</TableCell>
                      <TableCell className="py-3 text-right font-black text-stone-900 text-[11px]">{Number(f.totalReal).toLocaleString('en-US', { maximumFractionDigits: 3 })} $</TableCell>
                      <TableCell className="py-3 text-right font-black text-amber-600 text-[11px] bg-amber-50/30">{Number(f.declared).toLocaleString('en-US', { maximumFractionDigits: 3 })} $</TableCell>
                      <TableCell className="py-3">
                        <Button variant="ghost" size="icon" onClick={() => onNavigateToFacture(f.id)} className="h-7 w-7 text-stone-300 hover:text-stone-900 opacity-0 group-hover:opacity-100">
                          <ArrowRight className="w-3.5 h-3.5" />
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </Card>
          </section>
        </div>

        <div className="space-y-6">
          <section className="space-y-4">
            <div className="flex items-center justify-between px-2">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-blue-100 rounded-lg">
                  <Landmark className="w-4 h-4 text-blue-600" />
                </div>
                <h3 className="text-xs font-black text-stone-900 uppercase tracking-widest">Règlements Différence</h3>
              </div>
              <Button 
                onClick={() => setIsPaymentModalOpen(true)}
                className="bg-stone-900 hover:bg-black text-white h-8 text-[9px] font-black uppercase px-3 rounded-lg shadow-lg shadow-stone-200"
              >
                <Plus className="w-3 h-3 mr-1.5" /> Transmettre
              </Button>
            </div>

            <Card className="border-stone-200 shadow-xl rounded-2xl overflow-hidden bg-white">
              <CardHeader className="bg-stone-50 py-3 border-b">
                <CardTitle className="text-[10px] font-black uppercase text-stone-400 flex items-center gap-2">
                  <History className="w-3 h-3" /> Historique des règlements
                </CardTitle>
              </CardHeader>
              <CardContent className="p-0">
                <Table>
                  <TableBody>
                    {supPayments.length === 0 ? (
                      <TableRow><TableCell className="text-center py-10 text-stone-300 font-bold uppercase text-[9px]">Aucun règlement enregistré</TableCell></TableRow>
                    ) : supPayments.map((p) => (
                      <TableRow key={p.id} className="hover:bg-blue-50/20 transition-colors group border-stone-50">
                        <TableCell className="py-3 pl-4">
                          <div className="text-[10px] font-black text-stone-900">{p.date}</div>
                          <div className="text-[8px] font-bold text-stone-400 uppercase truncate max-w-[120px]">{p.notes || 'Règlement diff.'}</div>
                        </TableCell>
                        <TableCell className="py-3 text-right font-black text-blue-600">
                          {Number(p.amount).toLocaleString('en-US', { maximumFractionDigits: 3 })} $
                        </TableCell>
                        <TableCell className="py-3 pr-4 w-10">
                          <Button variant="ghost" size="icon" onClick={() => handleDeletePayment(p.id)} className="h-6 w-6 text-stone-200 hover:text-red-500 opacity-0 group-hover:opacity-100">
                            <Trash2 className="w-3 h-3" />
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </CardContent>
              {supPayments.length > 0 && (
                <div className="p-4 bg-stone-50 border-t flex justify-between items-center">
                  <span className="text-[9px] font-black text-stone-400 uppercase">Total Transmis</span>
                  <span className="text-xs font-black text-blue-700">{Number(totalPaid).toLocaleString('en-US', { maximumFractionDigits: 3 })} $</span>
                </div>
              )}
            </Card>
          </section>

          <div className="bg-amber-50 border border-amber-100 rounded-2xl p-6">
            <div className="flex items-center gap-3 mb-4">
              <Landmark className="w-5 h-5 text-amber-600" />
              <h4 className="text-[11px] font-black text-amber-900 uppercase tracking-widest">Note Comptable</h4>
            </div>
            <p className="text-[10px] font-bold text-amber-700 leading-relaxed uppercase">
              "Le 'Reste à Régulariser' représente la somme due au partenaire pour compenser l'écart entre la facturation réelle et les montants déclarés en douane, déduction faite de vos transmissions déjà saisies."
            </p>
          </div>
        </div>
      </div>

      <AddPaymentModal 
        open={isPaymentModalOpen} 
        onOpenChange={setIsPaymentModalOpen} 
        supplierId={supplierName} 
      />
    </div>
  );
}

function CompanyDetailView({ 
  companyName, 
  articles, 
  factures, 
  onBack, 
  onNavigateToFacture 
}: { 
  companyName: string, 
  articles: any[], 
  factures: any[], 
  onBack: () => void, 
  onNavigateToFacture: (id: string) => void 
}) {
  const companyFactures = useMemo(() => {
    const now = new Date();
    return factures.filter(f => f.declaringCompany === companyName).map(f => {
      const fArticles = articles.filter(a => a.factureId === f.id);
      const itemsVal = fArticles.reduce((s, a) => s + (a.quantity * a.purchasePricePerUnit), 0);
      const freight = Number(f.freightCost) || Number(f.freight) || 0;
      return {
        ...f,
        totalReal: itemsVal + freight,
        isArrived: f.arrivalDate ? new Date(f.arrivalDate) <= now : false
      };
    }).sort((a, b) => new Date(b.arrivalDate).getTime() - new Date(a.arrivalDate).getTime());
  }, [companyName, factures, articles]);

  const totalRealVal = companyFactures.reduce((s, f) => s + f.totalReal, 0);
  const totalDeclaredVal = companyFactures.reduce((s, f) => s + (Number(f.declaredValue) || f.totalReal), 0);
  const currentGap = totalRealVal - totalDeclaredVal;

  return (
    <div className="space-y-8 fade-in">
      <div className="flex items-center justify-between gap-3">
        <Button 
          variant="ghost" 
          size="sm" 
          onClick={onBack} 
          className="text-stone-500 hover:text-stone-900 font-bold uppercase text-[10px] tracking-widest gap-2 bg-white shadow-sm border border-stone-100 rounded-full px-4 h-9"
        >
          <ChevronLeft className="w-4 h-4" /> Tous les Partenaires
        </Button>
        <Button
          size="sm"
          onClick={() => exportCompanyPDF(companyName, companyFactures, { totalReal: totalRealVal, totalDeclared: totalDeclaredVal, gap: currentGap })}
          className="bg-blue-500 hover:bg-blue-600 text-white font-black uppercase text-[9px] tracking-widest px-4 h-9 rounded-full shadow-lg shadow-blue-100 gap-2"
        >
          <Download className="w-3.5 h-3.5" /> Exporter PDF
        </Button>
      </div>

      <header className="bg-white rounded-[2rem] shadow-xl border border-stone-200 overflow-hidden">
        <div className="bg-stone-900 p-8 flex flex-col xl:flex-row justify-between items-start xl:items-center gap-8 relative overflow-hidden">
          <div className="absolute top-0 right-0 w-[600px] h-[600px] bg-white/5 rounded-full -translate-y-1/2 translate-x-1/4 blur-[120px]" />
          
          <div className="flex items-center gap-6 relative z-10">
            <div className="p-4 bg-stone-800 rounded-2xl shadow-lg border border-white/5">
              <Building2 className="w-8 h-8 text-white" />
            </div>
            <div>
              <p className="text-[10px] font-black text-stone-500 uppercase tracking-[0.2em] mb-1">Audit Entité Juridique</p>
              <h2 className="text-4xl font-black text-white tracking-tighter uppercase leading-none">{companyName}</h2>
              <div className="flex gap-4 mt-4">
                <Badge className="bg-white/10 text-white border-white/10 px-3 py-1 text-[10px] font-bold uppercase">
                  {companyFactures.length} Dossiers Déclarés
                </Badge>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-2 md:grid-cols-3 gap-4 w-full xl:w-auto relative z-10">
            <SummaryBlock label="Valeur Réelle Cumulée" value={Number(totalRealVal).toLocaleString('en-US', { maximumFractionDigits: 3 })} sub="$" color="text-white" />
            <SummaryBlock label="Valeur Douane Cumulée" value={Number(totalDeclaredVal).toLocaleString('en-US', { maximumFractionDigits: 3 })} sub="$" color="text-amber-500" />
            <div className="bg-stone-800 p-5 rounded-2xl text-white shadow-lg border border-white/5">
              <p className="text-[8px] font-black text-stone-400 uppercase tracking-widest mb-1">Différence à Régulariser</p>
              <div className="text-xl font-black text-blue-400">{Number(currentGap).toLocaleString('en-US', { maximumFractionDigits: 3 })} $</div>
            </div>
          </div>
        </div>
      </header>

      <section className="space-y-4">
        <div className="flex items-center gap-3 px-2">
          <div className="p-2 bg-stone-100 rounded-lg">
            <Layers className="w-4 h-4 text-stone-500" />
          </div>
          <h3 className="text-xs font-black text-stone-900 uppercase tracking-widest">Manifeste des Opérations de {companyName}</h3>
        </div>
        <Card className="border-stone-200 shadow-xl rounded-2xl overflow-hidden bg-white">
          <Table>
            <TableHeader className="bg-stone-50/80">
              <TableRow>
                <TableHead className="text-[9px] font-black uppercase py-4">Statut</TableHead>
                <TableHead className="text-[9px] font-black uppercase py-4">Fournisseur</TableHead>
                <TableHead className="text-[9px] font-black uppercase py-4">N° Dossier</TableHead>
                <TableHead className="text-[9px] font-black uppercase py-4">Arrivée</TableHead>
                <TableHead className="text-right text-[9px] font-black uppercase py-4">Valeur Réelle</TableHead>
                <TableHead className="text-right text-[9px] font-black uppercase py-4 text-amber-600">Valeur Déclarée</TableHead>
                <TableHead className="w-10"></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {companyFactures.length === 0 ? (
                <TableRow><TableCell colSpan={7} className="text-center py-12 text-stone-300 font-bold uppercase text-[10px]">Aucune opération enregistrée pour cette société</TableCell></TableRow>
              ) : companyFactures.map((f) => (
                <TableRow key={f.id} className="hover:bg-stone-50/50 transition-colors group">
                  <TableCell className="py-3">
                    {f.isArrived ? 
                      <Badge className="bg-emerald-50 text-emerald-700 border-emerald-100 text-[8px] font-black uppercase">Réceptionné</Badge> : 
                      <Badge className="bg-blue-50 text-blue-700 border-blue-100 text-[8px] font-black uppercase">Transit</Badge>
                    }
                  </TableCell>
                  <TableCell className="py-3 font-bold text-stone-500 uppercase text-[10px]">{f.supplierId}</TableCell>
                  <TableCell className="py-3 font-black text-stone-900 uppercase text-[11px]">{f.id}</TableCell>
                  <TableCell className={`py-3 text-[10px] font-bold ${f.isArrived ? 'text-emerald-600' : 'text-blue-600'}`}>{f.arrivalDate}</TableCell>
                  <TableCell className="py-3 text-right font-black text-stone-900 text-[11px]">{Number(f.totalReal).toLocaleString('en-US', { maximumFractionDigits: 3 })} $</TableCell>
                  <TableCell className="py-3 text-right font-black text-amber-600 text-[11px] bg-amber-50/30">{Number(Number(f.declaredValue) || f.totalReal).toLocaleString('en-US', { maximumFractionDigits: 3 })} $</TableCell>
                  <TableCell className="py-3">
                    <Button variant="ghost" size="icon" onClick={() => onNavigateToFacture(f.id)} className="h-7 w-7 text-stone-300 hover:text-stone-900 opacity-0 group-hover:opacity-100">
                      <ArrowRight className="w-3.5 h-3.5" />
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Card>
      </section>
    </div>
  );
}

function SummaryBlock({ label, value, sub, color }: { label: string, value: string, sub?: string, color: string }) {
  return (
    <div className="bg-white/5 border border-white/10 p-5 rounded-2xl text-center min-w-[140px] backdrop-blur-md">
      <p className="text-[8px] font-black text-stone-500 uppercase tracking-widest mb-1">{label}</p>
      <div className={`text-xl font-black ${color} leading-none`}>
        {value} <span className="text-[10px] font-normal text-stone-500 ml-1">{sub}</span>
      </div>
    </div>
  );
}

function AddPaymentModal({ open, onOpenChange, supplierId }: { open: boolean, onOpenChange: (o: boolean) => void, supplierId: string }) {
  const { user } = useUser();
  const firestore = useFirestore();
  const { toast } = useToast();
  const [formData, setFormData] = useState({
    amount: 0,
    date: new Date().toISOString().split('T')[0],
    notes: ''
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!user || !firestore || !formData.amount) return;

    const id = crypto.randomUUID();
    const docRef = doc(firestore, 'users', user.uid, 'supplierPayments', id);
    
    setDocumentNonBlocking(docRef, {
      ...formData,
      id,
      supplierId,
      createdAt: serverTimestamp()
    }, { merge: true });

    toast({ title: "Règlement enregistré", description: `${formData.amount} $ pour ${supplierId}` });
    onOpenChange(false);
    setFormData({ amount: 0, date: new Date().toISOString().split('T')[0], notes: '' });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-sm rounded-2xl p-0 border-none overflow-hidden">
        <div className="bg-stone-900 p-6 text-white">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-white/10 rounded-lg">
              <DollarSign className="w-5 h-5 text-amber-500" />
            </div>
            <div>
              <DialogTitle className="text-lg font-black uppercase tracking-tight">Transmettre Fonds</DialogTitle>
              <p className="text-stone-400 text-[9px] font-bold uppercase tracking-widest mt-1">Règlement différence {supplierId}</p>
            </div>
          </div>
        </div>
        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          <div className="space-y-1.5">
            <Label className="text-[9px] font-black text-stone-400 uppercase tracking-widest">Montant Transmis ($)</Label>
            <Input 
              type="number" 
              required 
              value={formData.amount}
              onChange={e => setFormData(p => ({ ...p, amount: parseFloat(e.target.value) || 0 }))}
              className="h-12 border-stone-200 font-black text-lg rounded-xl focus:ring-stone-900"
              autoFocus
            />
          </div>
          <div className="space-y-1.5">
            <Label className="text-[9px] font-black text-stone-400 uppercase tracking-widest">Date de Transmission</Label>
            <Input 
              type="date" 
              required 
              value={formData.date}
              onChange={e => setFormData(p => ({ ...p, date: e.target.value }))}
              className="h-12 border-stone-200 font-bold rounded-xl"
            />
          </div>
          <div className="space-y-1.5">
            <Label className="text-[9px] font-black text-stone-400 uppercase tracking-widest">Notes / Référence</Label>
            <Input 
              placeholder="Ex: Virement Western, Cash..." 
              value={formData.notes}
              onChange={e => setFormData(p => ({ ...p, notes: e.target.value }))}
              className="h-12 border-stone-200 font-bold rounded-xl"
            />
          </div>
        </form>
        <DialogFooter className="p-6 bg-stone-50 gap-3 border-t">
          <Button variant="ghost" onClick={() => onOpenChange(false)} className="h-11 font-black uppercase text-[10px] tracking-widest flex-1">Annuler</Button>
          <Button onClick={handleSubmit} className="h-11 bg-stone-900 text-white font-black uppercase text-[10px] tracking-widest rounded-xl flex-[1.5] shadow-lg shadow-stone-200">
            Confirmer l'envoi
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function ShippingDetailView({ 
  shippingName, 
  articles, 
  factures, 
  onBack, 
  onNavigateToFacture 
}: { 
  shippingName: string, 
  articles: any[], 
  factures: any[], 
  onBack: () => void, 
  onNavigateToFacture: (id: string) => void 
}) {
  const shippingFactures = useMemo(() => {
    const now = new Date();
    return factures.filter(f => (f.shippingLine || 'Inconnu') === shippingName).map(f => {
      const fArticles = articles.filter(a => a.factureId === f.id);
      const itemsVal = fArticles.reduce((s, a) => s + (a.quantity * a.purchasePricePerUnit), 0);
      const freight = Number(f.freightCost) || Number(f.freight) || 0;
      const cbm = fArticles.reduce((s, a) => s + (a.cubicMeasurement || 0), 0);
      return {
        ...f,
        totalReal: itemsVal + freight,
        freight,
        cbm,
        isArrived: f.arrivalDate ? new Date(f.arrivalDate) <= now : false
      };
    }).sort((a, b) => new Date(b.arrivalDate).getTime() - new Date(a.arrivalDate).getTime());
  }, [shippingName, factures, articles]);

  const totalFreightVal = shippingFactures.reduce((s, f) => s + f.freight, 0);
  const totalRealVal = shippingFactures.reduce((s, f) => s + f.totalReal, 0);
  const totalCbm = shippingFactures.reduce((s, f) => s + f.cbm, 0);

  return (
    <div className="space-y-8 fade-in">
      <div className="flex items-center justify-between gap-3">
        <Button 
          variant="ghost" 
          size="sm" 
          onClick={onBack} 
          className="text-stone-500 hover:text-stone-900 font-bold uppercase text-[10px] tracking-widest gap-2 bg-white shadow-sm border border-stone-100 rounded-full px-4 h-9"
        >
          <ChevronLeft className="w-4 h-4" /> Tous les Partenaires
        </Button>
        <Button
          size="sm"
          onClick={() => exportShippingPDF(shippingName, shippingFactures, { totalFreight: totalFreightVal, totalReal: totalRealVal, totalCbm })}
          className="bg-emerald-500 hover:bg-emerald-600 text-white font-black uppercase text-[9px] tracking-widest px-4 h-9 rounded-full shadow-lg shadow-emerald-100 gap-2"
        >
          <Download className="w-3.5 h-3.5" /> Exporter PDF
        </Button>
      </div>

      <header className="bg-white rounded-[2rem] shadow-xl border border-stone-200 overflow-hidden">
        <div className="bg-stone-900 p-8 flex flex-col xl:flex-row justify-between items-start xl:items-center gap-8 relative overflow-hidden">
          <div className="absolute top-0 right-0 w-[600px] h-[600px] bg-white/5 rounded-full -translate-y-1/2 translate-x-1/4 blur-[120px]" />
          
          <div className="flex items-center gap-6 relative z-10">
            <div className="p-4 bg-stone-800 rounded-2xl shadow-lg border border-white/5">
              <Ship className="w-8 h-8 text-white" />
            </div>
            <div>
              <p className="text-[10px] font-black text-stone-500 uppercase tracking-[0.2em] mb-1">Compagnie Maritime</p>
              <h2 className="text-4xl font-black text-white tracking-tighter uppercase leading-none">{shippingName}</h2>
              <div className="flex gap-4 mt-4">
                <Badge className="bg-white/10 text-white border-white/10 px-3 py-1 text-[10px] font-bold uppercase">
                  {shippingFactures.length} Arrivages
                </Badge>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-2 md:grid-cols-3 gap-4 w-full xl:w-auto relative z-10">
            <SummaryBlock label="Fret Total" value={Number(totalFreightVal).toLocaleString('en-US', { maximumFractionDigits: 3 })} sub="$" color="text-white" />
            <SummaryBlock label="Volume Total" value={Number(totalCbm).toLocaleString('en-US', { maximumFractionDigits: 3 })} sub="m³" color="text-emerald-500" />
            <div className="bg-stone-800 p-5 rounded-2xl text-white shadow-lg border border-white/5">
              <p className="text-[8px] font-black text-stone-400 uppercase tracking-widest mb-1">Valeur Transit</p>
              <div className="text-xl font-black text-stone-300">{Number(totalRealVal).toLocaleString('en-US', { maximumFractionDigits: 3 })} $</div>
            </div>
          </div>
        </div>
      </header>

      <section className="space-y-4">
        <div className="flex items-center gap-3 px-2">
          <div className="p-2 bg-stone-100 rounded-lg">
            <Layers className="w-4 h-4 text-stone-500" />
          </div>
          <h3 className="text-xs font-black text-stone-900 uppercase tracking-widest">Historique des Lignes de {shippingName}</h3>
        </div>
        <Card className="border-stone-200 shadow-xl rounded-2xl overflow-hidden bg-white">
          <Table>
            <TableHeader className="bg-stone-50/80">
              <TableRow>
                <TableHead className="text-[9px] font-black uppercase py-4">Statut</TableHead>
                <TableHead className="text-[9px] font-black uppercase py-4">N° Dossier</TableHead>
                <TableHead className="text-[9px] font-black uppercase py-4">Arrivée</TableHead>
                <TableHead className="text-right text-[9px] font-black uppercase py-4">Volume CBM</TableHead>
                <TableHead className="text-right text-[9px] font-black uppercase py-4 text-emerald-600">Fret Payé</TableHead>
                <TableHead className="text-right text-[9px] font-black uppercase py-4">Valeur Marchandise</TableHead>
                <TableHead className="w-10"></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {shippingFactures.length === 0 ? (
                <TableRow><TableCell colSpan={7} className="text-center py-12 text-stone-300 font-bold uppercase text-[10px]">Aucune opération pour cette ligne</TableCell></TableRow>
              ) : shippingFactures.map((f) => (
                <TableRow key={f.id} className="hover:bg-stone-50/50 transition-colors group">
                  <TableCell className="py-3">
                    {f.isArrived ? 
                      <Badge className="bg-emerald-50 text-emerald-700 border-emerald-100 text-[8px] font-black uppercase">Réceptionné</Badge> : 
                      <Badge className="bg-blue-50 text-blue-700 border-blue-100 text-[8px] font-black uppercase">Transit</Badge>
                    }
                  </TableCell>
                  <TableCell className="py-3 font-black text-stone-900 uppercase text-[11px]">{f.id}</TableCell>
                  <TableCell className={`py-3 text-[10px] font-bold ${f.isArrived ? 'text-emerald-600' : 'text-blue-600'}`}>{f.arrivalDate}</TableCell>
                  <TableCell className="py-3 text-right font-black text-stone-500 text-[11px]">{Number(f.cbm).toLocaleString('en-US', { maximumFractionDigits: 3 })} m³</TableCell>
                  <TableCell className="py-3 text-right font-black text-emerald-600 text-[11px] bg-emerald-50/30">{Number(f.freight).toLocaleString('en-US', { maximumFractionDigits: 3 })} $</TableCell>
                  <TableCell className="py-3 text-right font-black text-stone-900 text-[11px]">{Number(f.totalReal - f.freight).toLocaleString('en-US', { maximumFractionDigits: 3 })} $</TableCell>
                  <TableCell className="py-3">
                    <Button variant="ghost" size="icon" onClick={() => onNavigateToFacture(f.id)} className="h-7 w-7 text-stone-300 hover:text-stone-900 opacity-0 group-hover:opacity-100">
                      <ArrowRight className="w-3.5 h-3.5" />
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Card>
      </section>
    </div>
  );
}

function ForwarderDetailView({
  forwarderName,
  articles,
  factures,
  onBack,
  onNavigateToFacture
}: {
  forwarderName: string;
  articles: any[];
  factures: any[];
  onBack: () => void;
  onNavigateToFacture: (id: string) => void;
}) {
  const now = new Date();

  const forwarderDossiers = useMemo(() => {
    return factures
      .filter(f => f.forwarder === forwarderName && f.forwarderGivenDate)
      .map(f => {
        const fArticles = articles.filter(a => a.factureId === f.id);
        const itemsVal = fArticles.reduce((s: number, a: any) => s + (a.quantity * a.purchasePricePerUnit), 0);
        const freight = Number(f.freightCost) || Number(f.freight) || 0;
        const cbm = fArticles.reduce((s: number, a: any) => s + (a.cubicMeasurement || 0), 0);
        const isArrived = f.arrivalDate ? new Date(f.arrivalDate) <= now : false;
        const inStock = f.stockEntryDate ? true : false;
        return {
          ...f,
          totalReal: itemsVal + freight,
          freight,
          cbm,
          isArrived,
          inStock,
          articlesCount: fArticles.length,
        };
      })
      .sort((a: any, b: any) => {
        const dA = new Date(a.forwarderGivenDate || '').getTime();
        const dB = new Date(b.forwarderGivenDate || '').getTime();
        return dB - dA;
      });
  }, [forwarderName, factures, articles]);

  // Dossiers à remettre : forwarder assigné, pas encore remis, arrivée dans < 7 jours
  const dossiersARemettre = useMemo(() => {
    const oneWeekFromNow = new Date();
    oneWeekFromNow.setDate(oneWeekFromNow.getDate() + 7);
    return factures
      .filter(f => f.forwarder === forwarderName && !f.forwarderGivenDate && f.arrivalDate)
      .filter(f => new Date(f.arrivalDate) <= oneWeekFromNow)
      .map(f => {
        const arrival = new Date(f.arrivalDate);
        const daysLeft = Math.ceil((arrival.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
        return { ...f, daysLeft };
      })
      .sort((a: any, b: any) => new Date(a.arrivalDate).getTime() - new Date(b.arrivalDate).getTime());
  }, [forwarderName, factures]);

  const totalDossiers = forwarderDossiers.length;
  const totalFactureTransitaire = forwarderDossiers.reduce((s: number, f: any) => s + (Number(f.supplierInvoiceAmount) || 0), 0);

  return (
    <div className="space-y-8 fade-in">
      <div className="flex items-center justify-between gap-3">
        <Button
          variant="ghost"
          size="sm"
          onClick={onBack}
          className="text-stone-500 hover:text-stone-900 font-bold uppercase text-[10px] tracking-widest gap-2 bg-white shadow-sm border border-stone-100 rounded-full px-4 h-9"
        >
          <ChevronLeft className="w-4 h-4" /> Tous les Partenaires
        </Button>
        <Button
          size="sm"
          onClick={() => exportForwarderPDF(forwarderName, forwarderDossiers, dossiersARemettre, totalFactureTransitaire)}
          className="bg-violet-500 hover:bg-violet-600 text-white font-black uppercase text-[9px] tracking-widest px-4 h-9 rounded-full shadow-lg shadow-violet-100 gap-2"
        >
          <Download className="w-3.5 h-3.5" /> Exporter PDF
        </Button>
      </div>

      <header className="bg-white rounded-[2rem] shadow-xl border border-stone-200 overflow-hidden">
        <div className="bg-stone-900 p-8 flex flex-col xl:flex-row justify-between items-start xl:items-center gap-8 relative overflow-hidden">
          <div className="absolute top-0 right-0 w-[600px] h-[600px] bg-violet-500/5 rounded-full -translate-y-1/2 translate-x-1/4 blur-[120px]" />
          <div className="flex items-center gap-6 relative z-10">
            <div className="p-4 bg-stone-800 rounded-2xl shadow-lg border border-white/5">
              <Briefcase className="w-8 h-8 text-violet-400" />
            </div>
            <div>
              <p className="text-[10px] font-black text-stone-500 uppercase tracking-[0.2em] mb-1">Transitaire Partenaire</p>
              <h2 className="text-4xl font-black text-white tracking-tighter uppercase leading-none">{forwarderName}</h2>
              <div className="flex gap-4 mt-4 flex-wrap">
                <Badge className="bg-violet-500/20 text-violet-300 border-violet-500/20 px-3 py-1 text-[10px] font-bold uppercase">
                  {totalDossiers} Dossiers Remis
                </Badge>
                {dossiersARemettre.length > 0 && (
                  <Badge className="bg-red-500/20 text-red-300 border-red-500/20 px-3 py-1 text-[10px] font-bold uppercase animate-pulse">
                    ⚠ {dossiersARemettre.length} À Remettre
                  </Badge>
                )}
              </div>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4 w-full xl:w-auto relative z-10">
            <SummaryBlock label="Dossiers Remis" value={String(totalDossiers)} sub="" color="text-white" />
            <SummaryBlock label="Total Fact. Transitaire" value={Number(totalFactureTransitaire).toLocaleString('fr-MA', { maximumFractionDigits: 0 })} sub="MAD" color="text-violet-400" />
          </div>
        </div>
      </header>

      {/* Section dossiers urgents à remettre */}
      {dossiersARemettre.length > 0 && (
        <section className="space-y-4">
          <div className="flex items-center gap-3 px-2">
            <div className="p-2 bg-red-100 rounded-lg">
              <Calendar className="w-4 h-4 text-red-600" />
            </div>
            <h3 className="text-xs font-black text-red-700 uppercase tracking-widest">⚠ Dossiers À Remettre — Arrivée imminente (&lt; 7 jours)</h3>
          </div>
          <Card className="border-red-200 shadow-xl rounded-2xl overflow-hidden bg-white">
            <div className="h-1 w-full bg-red-500" />
            <Table>
              <TableHeader className="bg-red-50/60">
                <TableRow>
                  <TableHead className="text-[9px] font-black uppercase py-4 text-red-700">N° Dossier</TableHead>
                  <TableHead className="text-[9px] font-black uppercase py-4 text-red-700">N° BL</TableHead>
                  <TableHead className="text-[9px] font-black uppercase py-4 text-red-700">Date Arrivée</TableHead>
                  <TableHead className="text-[9px] font-black uppercase py-4 text-red-700">Délai</TableHead>
                  <TableHead className="text-[9px] font-black uppercase py-4">Fournisseur</TableHead>
                  <TableHead className="w-10"></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {dossiersARemettre.map((f: any) => (
                  <TableRow key={f.id} className="hover:bg-red-50/40 transition-colors group border-red-50">
                    <TableCell className="py-3 font-black text-stone-900 uppercase text-[11px]">{f.id}</TableCell>
                    <TableCell className="py-3 font-bold text-stone-500 text-[10px]">{f.noBL || '-'}</TableCell>
                    <TableCell className="py-3 text-[10px] font-black text-red-600">{f.arrivalDate}</TableCell>
                    <TableCell className="py-3">
                      <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[9px] font-black uppercase ${f.daysLeft <= 0 ? 'bg-red-600 text-white' : f.daysLeft <= 3 ? 'bg-red-100 text-red-700' : 'bg-amber-100 text-amber-700'}`}>
                        {f.daysLeft <= 0 ? 'Arrivé' : `J-${f.daysLeft}`}
                      </span>
                    </TableCell>
                    <TableCell className="py-3 font-bold text-stone-500 uppercase text-[10px]">{f.supplierId}</TableCell>
                    <TableCell className="py-3">
                      <Button variant="ghost" size="icon" onClick={() => onNavigateToFacture(f.id)} className="h-7 w-7 text-stone-300 hover:text-red-600 opacity-0 group-hover:opacity-100">
                        <ArrowRight className="w-3.5 h-3.5" />
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </Card>
        </section>
      )}

      {/* Section dossiers remis */}
      <section className="space-y-4">
        <div className="flex items-center gap-3 px-2">
          <div className="p-2 bg-violet-100 rounded-lg">
            <Layers className="w-4 h-4 text-violet-600" />
          </div>
          <h3 className="text-xs font-black text-stone-900 uppercase tracking-widest">Dossiers confiés à {forwarderName}</h3>
        </div>
        <Card className="border-stone-200 shadow-xl rounded-2xl overflow-hidden bg-white">
          <Table>
            <TableHeader className="bg-stone-50/80">
              <TableRow>
                <TableHead className="text-[9px] font-black uppercase py-4">Statut</TableHead>
                <TableHead className="text-[9px] font-black uppercase py-4">N° Dossier</TableHead>
                <TableHead className="text-[9px] font-black uppercase py-4">N° BL</TableHead>
                <TableHead className="text-[9px] font-black uppercase py-4">Compagnie Maritime</TableHead>
                <TableHead className="text-[9px] font-black uppercase py-4 text-violet-600">Date Remise</TableHead>
                <TableHead className="text-[9px] font-black uppercase py-4">Arrivée</TableHead>
                <TableHead className="text-[9px] font-black uppercase py-4">Fournisseur</TableHead>
                <TableHead className="text-right text-[9px] font-black uppercase py-4">CBM</TableHead>
                <TableHead className="text-right text-[9px] font-black uppercase py-4 text-violet-600">Fact. Transit.</TableHead>
                <TableHead className="w-10"></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {forwarderDossiers.length === 0 ? (
                <TableRow><TableCell colSpan={9} className="text-center py-12 text-stone-300 font-bold uppercase text-[10px]">Aucun dossier remis à ce transitaire</TableCell></TableRow>
              ) : forwarderDossiers.map((f: any) => (
                <TableRow key={f.id} className="hover:bg-violet-50/30 transition-colors group border-stone-50">
                  <TableCell className="py-3">
                    {f.inStock
                      ? <Badge className="bg-emerald-50 text-emerald-700 border-emerald-100 text-[8px] font-black uppercase">En Stock</Badge>
                      : f.isArrived
                      ? <Badge className="bg-amber-50 text-amber-700 border-amber-100 text-[8px] font-black uppercase">Dédouanement</Badge>
                      : <Badge className="bg-violet-50 text-violet-700 border-violet-100 text-[8px] font-black uppercase">En Transit</Badge>
                    }
                  </TableCell>
                  <TableCell className="py-3 font-black text-stone-900 uppercase text-[11px]">{f.id}</TableCell>
                  <TableCell className="py-3 font-bold text-stone-500 text-[10px]">{f.noBL || '-'}</TableCell>
                  <TableCell className="py-3 font-bold text-stone-500 text-[10px] uppercase">{f.shippingLine || '-'}</TableCell>
                  <TableCell className="py-3 text-[10px] font-black text-violet-600">{f.forwarderGivenDate}</TableCell>
                  <TableCell className={`py-3 text-[10px] font-bold ${f.isArrived ? 'text-emerald-600' : 'text-blue-500'}`}>{f.arrivalDate || '-'}</TableCell>
                  <TableCell className="py-3 font-bold text-stone-500 uppercase text-[10px]">{f.supplierId}</TableCell>
                  <TableCell className="py-3 text-right font-bold text-stone-500 text-[10px]">{Number(f.cbm).toLocaleString('en-US', { maximumFractionDigits: 3 })} m³</TableCell>
                  <TableCell className="py-3 text-right font-black text-violet-700 text-[11px] bg-violet-50/30">
                    {f.supplierInvoiceAmount ? `${Number(f.supplierInvoiceAmount).toLocaleString('fr-MA', { maximumFractionDigits: 0 })} MAD` : '-'}
                  </TableCell>
                  <TableCell className="py-3">
                    <Button variant="ghost" size="icon" onClick={() => onNavigateToFacture(f.id)} className="h-7 w-7 text-stone-300 hover:text-stone-900 opacity-0 group-hover:opacity-100">
                      <ArrowRight className="w-3.5 h-3.5" />
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
          {forwarderDossiers.length > 0 && (
            <div className="p-4 bg-violet-50 border-t border-violet-100 flex justify-between items-center">
              <span className="text-[9px] font-black text-violet-400 uppercase tracking-widest">Total Factures Transitaire</span>
              <span className="text-sm font-black text-violet-700">{Number(totalFactureTransitaire).toLocaleString('fr-MA', { maximumFractionDigits: 0 })} MAD</span>
            </div>
          )}
        </Card>
      </section>
    </div>
  );
}

function ClientCard({ stat, onSelect }: { stat: { name: string; orders: number; categories: Set<string> }; onSelect: () => void }) {
  const [isAccessModalOpen, setIsAccessModalOpen] = useState(false);
  const { user } = useUser();
  const canCreateAccount = user?.email === 'yahya.lebbar13@gmail.com';

  return (
    <>
      <Card
        className="border-none bg-white shadow-lg hover:shadow-2xl transition-all rounded-2xl overflow-hidden group"
      >
        <div className="h-1 w-full bg-stone-900 group-hover:bg-indigo-500 transition-colors" />
        <CardHeader className="pb-2">
          <div className="flex justify-between items-start">
            <CardTitle
              className="text-lg font-black text-stone-900 uppercase tracking-tight group-hover:text-indigo-600 transition-colors cursor-pointer"
              onClick={onSelect}
            >
              {stat.name}
            </CardTitle>
            <div className="p-2 bg-stone-50 rounded-lg text-stone-300 group-hover:text-indigo-500 transition-colors cursor-pointer" onClick={onSelect}>
              <UserCircle2 className="w-4 h-4" />
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <div className="text-2xl font-black text-stone-900 mb-4 cursor-pointer" onClick={onSelect}>
            {stat.orders} <span className="text-sm font-bold text-stone-400">Articles</span>
          </div>
          <div className="space-y-2 pt-3 border-t border-stone-50">
            <div className="flex justify-between items-center text-[10px] font-bold text-stone-400 uppercase cursor-pointer" onClick={onSelect}>
              <span>Familles</span>
              <span className="text-indigo-600 font-black">{stat.categories.size}</span>
            </div>
            {canCreateAccount && (
              <Button
                size="sm"
                variant="outline"
                className="w-full h-8 text-[9px] font-black uppercase tracking-wider border-indigo-200 text-indigo-600 hover:bg-indigo-50 hover:border-indigo-400 gap-1.5 mt-2"
                onClick={(e) => { e.stopPropagation(); setIsAccessModalOpen(true); }}
              >
                <KeyRound className="w-3 h-3" />
                Créer Accès Client
              </Button>
            )}
          </div>
        </CardContent>
      </Card>
      <CreateClientAccessModal
        open={isAccessModalOpen}
        onOpenChange={setIsAccessModalOpen}
        clientName={stat.name}
      />
    </>
  );
}

function CreateClientAccessModal({ open, onOpenChange, clientName }: { open: boolean; onOpenChange: (o: boolean) => void; clientName: string }) {
  const { user } = useUser();
  const firestore = useFirestore();
  const { toast } = useToast();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user || !firestore || !email || !password) return;

    if (user.email !== 'yahya.lebbar13@gmail.com') {
      toast({ variant: 'destructive', title: 'Accès refusé', description: "Seul l'administrateur principal peut créer des comptes clients." });
      return;
    }

    setLoading(true);
    try {
      // Use a secondary Firebase app to create/sign-in without logging out the admin
      const secondaryAppName = 'clientCreation_' + Date.now();
      const secondaryApp = initializeApp(firebaseConfig, secondaryAppName);
      const secondaryAuth = getAuth(secondaryApp);

      let clientUser: any;

      try {
        // Try creating a new Firebase Auth user
        const credential = await createUserWithEmailAndPassword(secondaryAuth, email, password);
        clientUser = credential.user;
      } catch (createErr: any) {
        if (createErr.code === 'auth/email-already-in-use') {
          // User already exists → sign in to get their user object
          const credential = await signInWithEmailAndPassword(secondaryAuth, email, password);
          clientUser = credential.user;
        } else {
          throw createErr;
        }
      }

      // ⭐ KEY FIX: Store role in the Auth displayName — works without Firestore permissions
      // Format: CLIENT:{clientName}:{adminUid}
      await updateProfile(clientUser, {
        displayName: `CLIENT:${clientName}:${user.uid}`,
      });

      const clientUid = clientUser.uid;
      await deleteApp(secondaryApp);

      // Also write to Firestore as supplementary data (used for loading articles/factures)
      await setDoc(doc(firestore, 'clientAccess', clientUid), {
        clientName,
        email,
        adminUid: user.uid,
        createdAt: serverTimestamp(),
      });

      toast({ title: '✅ Accès configuré', description: `Accès activé pour ${clientName} (${email})` });
      onOpenChange(false);
      setEmail('');
      setPassword('');
    } catch (err: any) {
      let msg = 'Impossible de configurer cet accès.';
      if (err.code === 'auth/wrong-password' || err.code === 'auth/invalid-credential') {
        msg = 'Mot de passe incorrect pour cet email existant.';
      } else if (err.code === 'auth/invalid-email') {
        msg = 'Adresse email invalide.';
      } else if (err.code === 'auth/weak-password') {
        msg = 'Mot de passe trop faible (min. 6 caractères).';
      } else if (err.message) {
        msg = err.message;
      }
      toast({ variant: 'destructive', title: 'Erreur', description: msg });
    } finally {
      setLoading(false);
    }
  };


  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-sm rounded-2xl p-0 border-none overflow-hidden">
        <div className="bg-indigo-900 p-6 text-white">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-white/10 rounded-lg">
              <KeyRound className="w-5 h-5 text-indigo-300" />
            </div>
            <div>
              <DialogTitle className="text-lg font-black uppercase tracking-tight">Créer Accès Client</DialogTitle>
              <p className="text-indigo-300 text-[9px] font-bold uppercase tracking-widest mt-1">{clientName}</p>
            </div>
          </div>
        </div>
        <form onSubmit={handleCreate} className="p-6 space-y-4">
          <div className="bg-indigo-50 border border-indigo-100 rounded-xl p-3 text-[10px] text-indigo-700 font-bold">
            Le client se connecte sur <span className="font-black text-indigo-700">le même site</span> avec ces identifiants. Il verra automatiquement <span className="font-black">uniquement ses précommandes</span>.
          </div>
          <div className="space-y-1.5">
            <Label className="text-[9px] font-black text-stone-400 uppercase tracking-widest">Email du Client</Label>
            <Input
              type="email"
              required
              placeholder="client@example.com"
              value={email}
              onChange={e => setEmail(e.target.value)}
              className="h-11 border-stone-200 font-bold rounded-xl"
              autoFocus
            />
          </div>
          <div className="space-y-1.5">
            <Label className="text-[9px] font-black text-stone-400 uppercase tracking-widest">Mot de Passe</Label>
            <Input
              type="password"
              required
              placeholder="Min. 6 caractères"
              value={password}
              onChange={e => setPassword(e.target.value)}
              className="h-11 border-stone-200 font-bold rounded-xl"
            />
          </div>
        </form>
        <DialogFooter className="p-6 bg-stone-50 gap-3 border-t">
          <Button variant="ghost" onClick={() => onOpenChange(false)} className="h-11 font-black uppercase text-[10px] tracking-widest flex-1" disabled={loading}>Annuler</Button>
          <Button onClick={handleCreate} className="h-11 bg-indigo-700 hover:bg-indigo-800 text-white font-black uppercase text-[10px] tracking-widest rounded-xl flex-[1.5] shadow-lg shadow-indigo-200 gap-2" disabled={loading}>
            {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <><KeyRound className="w-3.5 h-3.5" /> Créer l'Accès</>}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function ClientDetailView({
  clientName,
  articles,
  factures,
  onBack,
  isPortal = false,
}: {
  clientName: string;
  articles: any[];
  factures: any[];
  onBack?: () => void;
  isPortal?: boolean;
}) {
  const clientArticles = useMemo(() => {
    return articles
      .filter(a => a.isPreorder && a.clientName?.trim() === clientName)
      .map(a => {
        const facture = factures.find(f => f.id === a.factureId);
        return {
          ...a,
          arrivalDate: facture?.arrivalDate || a.arrivalDate || null,
        };
      })
      .sort((a, b) => (a.categoryId || '').localeCompare(b.categoryId || ''));
  }, [clientName, articles, factures]);

  const statusLabel = (status: string) => {
    if (status === 'TO_ORDER') return { label: 'À Commander', cls: 'bg-stone-100 text-stone-600 border-stone-200' };
    if (status === 'PI') return { label: 'En Production', cls: 'bg-amber-50 text-amber-700 border-amber-100' };
    if (status === 'SHIPPED') return { label: 'Expédié', cls: 'bg-blue-50 text-blue-700 border-blue-100' };
    if (status === 'TRANSIT') return { label: 'En Transit', cls: 'bg-indigo-50 text-indigo-700 border-indigo-100' };
    if (status === 'CUSTOMS') return { label: 'En Dédouanement', cls: 'bg-purple-50 text-purple-700 border-purple-100' };
    if (status === 'STOCK') return { label: 'En Stock', cls: 'bg-emerald-50 text-emerald-700 border-emerald-100' };
    return { label: status, cls: 'bg-stone-100 text-stone-600 border-stone-200' };
  };

  return (
    <div className="space-y-8 fade-in">
      {!isPortal && onBack && (
        <div className="flex items-center justify-between gap-3">
          <Button
            variant="ghost"
            size="sm"
            onClick={onBack}
            className="text-stone-500 hover:text-stone-900 font-bold uppercase text-[10px] tracking-widest gap-2 bg-white shadow-sm border border-stone-100 rounded-full px-4 h-9"
          >
            <ChevronLeft className="w-4 h-4" /> Tous les Partenaires
          </Button>
        </div>
      )}

      <header className="bg-white rounded-[2rem] shadow-xl border border-stone-200 overflow-hidden">
        <div className="bg-stone-900 p-8 flex flex-col xl:flex-row justify-between items-start xl:items-center gap-8 relative overflow-hidden">
          <div className="absolute top-0 right-0 w-[600px] h-[600px] bg-indigo-500/5 rounded-full -translate-y-1/2 translate-x-1/4 blur-[120px]" />
          <div className="flex items-center gap-6 relative z-10">
            <div className="p-4 bg-stone-800 rounded-2xl shadow-lg border border-white/5">
              <UserCircle2 className="w-8 h-8 text-indigo-400" />
            </div>
            <div>
              <p className="text-[10px] font-black text-stone-500 uppercase tracking-[0.2em] mb-1">Dossier Client — Précommandes</p>
              <h2 className="text-4xl font-black text-white tracking-tighter uppercase leading-none">{clientName}</h2>
              <div className="flex gap-4 mt-4 flex-wrap">
                <Badge className="bg-indigo-500/20 text-indigo-300 border-indigo-500/20 px-3 py-1 text-[10px] font-bold uppercase">
                  {clientArticles.length} Articles Précommandés
                </Badge>
              </div>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4 w-full xl:w-auto relative z-10">
            <SummaryBlock label="Articles" value={String(clientArticles.length)} sub="" color="text-white" />
            <SummaryBlock label="Familles" value={String(new Set(clientArticles.map(a => a.categoryId)).size)} sub="" color="text-indigo-400" />
          </div>
        </div>
      </header>

      <section className="space-y-4">
        <div className="flex items-center gap-3 px-2">
          <div className="p-2 bg-indigo-100 rounded-lg">
            <Package className="w-4 h-4 text-indigo-600" />
          </div>
          <h3 className="text-xs font-black text-stone-900 uppercase tracking-widest">Commandes de {clientName}</h3>
        </div>

        {/* ── MOBILE: Cards (< md) ── */}
        <div className="flex flex-col gap-4 md:hidden">
          {clientArticles.length === 0 ? (
            <div className="text-center py-16 text-stone-300 font-bold uppercase text-[10px] tracking-widest">
              Aucun article précommandé pour ce client
            </div>
          ) : clientArticles.map((a) => {
            const { label, cls } = statusLabel(a.status);
            const now = new Date();
            const isArrived = a.arrivalDate ? new Date(a.arrivalDate) <= now : false;
            return (
              <div key={a.id} className="bg-white rounded-2xl border border-stone-100 shadow-sm overflow-hidden">
                {/* Card header: status + date */}
                <div className="flex items-center justify-between px-4 pt-4 pb-3 border-b border-stone-50">
                  <Badge className={`${cls} text-[9px] font-black uppercase px-3 py-1`}>{label}</Badge>
                  {a.arrivalDate ? (
                    <span className={`text-[11px] font-black ${isArrived ? 'text-emerald-600' : 'text-indigo-600'}`}>
                      📅 {a.arrivalDate}
                    </span>
                  ) : (
                    <span className="text-stone-300 text-[10px] font-bold">Date non définie</span>
                  )}
                </div>
                {/* Card body: product info grid */}
                <div className="p-4 grid grid-cols-2 gap-x-4 gap-y-3">
                  <div>
                    <p className="text-[8px] font-black text-stone-400 uppercase tracking-widest mb-0.5">Type Produit</p>
                    <p className="text-[13px] font-black text-stone-900 leading-tight">{a.categoryId || '—'}</p>
                  </div>
                  <div>
                    <p className="text-[8px] font-black text-stone-400 uppercase tracking-widest mb-0.5">Quantité</p>
                    <p className="text-[13px] font-black text-stone-900 leading-tight">
                      {Number(a.quantity).toLocaleString('en-US')}
                      <span className="text-[10px] font-bold text-stone-400 ml-1">{a.unitOfMeasure || ''}</span>
                    </p>
                  </div>
                  {a.size && (
                    <div>
                      <p className="text-[8px] font-black text-stone-400 uppercase tracking-widest mb-0.5">Taille</p>
                      <p className="text-[12px] font-bold text-stone-700">{a.size}</p>
                    </div>
                  )}
                  {a.color && (
                    <div>
                      <p className="text-[8px] font-black text-stone-400 uppercase tracking-widest mb-0.5">Couleur</p>
                      <p className="text-[12px] font-bold text-stone-700 uppercase">{a.color}</p>
                    </div>
                  )}
                  {a.cbm != null && (
                    <div>
                      <p className="text-[8px] font-black text-stone-400 uppercase tracking-widest mb-0.5">CBM</p>
                      <p className="text-[12px] font-bold text-stone-700">{Number(a.cbm).toLocaleString('en-US')} m³</p>
                    </div>
                  )}
                  {a.netWeight != null && (
                    <div>
                      <p className="text-[8px] font-black text-stone-400 uppercase tracking-widest mb-0.5">Net Weight</p>
                      <p className="text-[12px] font-bold text-stone-700">{Number(a.netWeight).toLocaleString('en-US')} kg</p>
                    </div>
                  )}
                  {a.specs && (
                    <div className="col-span-2">
                      <p className="text-[8px] font-black text-stone-400 uppercase tracking-widest mb-0.5">Détails Techniques</p>
                      <p className="text-[11px] font-bold text-stone-500 leading-relaxed">{a.specs}</p>
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>

        {/* ── DESKTOP: Table (≥ md) ── */}
        <Card className="hidden md:block border-stone-200 shadow-xl rounded-2xl overflow-hidden bg-white">
          <Table>
            <TableHeader className="bg-stone-50/80">
              <TableRow>
                <TableHead className="text-[9px] font-black uppercase py-4">Statut</TableHead>
                <TableHead className="text-[9px] font-black uppercase py-4">Arrivée Prévue</TableHead>
                <TableHead className="text-[9px] font-black uppercase py-4">Type Produit</TableHead>
                <TableHead className="text-[9px] font-black uppercase py-4">Taille</TableHead>
                <TableHead className="text-[9px] font-black uppercase py-4">Couleur</TableHead>
                <TableHead className="text-[9px] font-black uppercase py-4">Détails Tech.</TableHead>
                <TableHead className="text-right text-[9px] font-black uppercase py-4">Qté</TableHead>
                <TableHead className="text-[9px] font-black uppercase py-4">Unité</TableHead>
                <TableHead className="text-[9px] font-black uppercase py-4 text-center">CBM</TableHead>
                <TableHead className="text-[9px] font-black uppercase py-4 text-center">Net Weight</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {clientArticles.length === 0 ? (
                <TableRow><TableCell colSpan={10} className="text-center py-12 text-stone-300 font-bold uppercase text-[10px]">Aucun article précommandé pour ce client</TableCell></TableRow>
              ) : clientArticles.map((a) => {
                const { label, cls } = statusLabel(a.status);
                const now = new Date();
                const isArrived = a.arrivalDate ? new Date(a.arrivalDate) <= now : false;
                return (
                  <TableRow key={a.id} className="hover:bg-indigo-50/20 transition-colors group border-stone-50">
                    <TableCell className="py-3">
                      <Badge className={`${cls} text-[8px] font-black uppercase`}>{label}</Badge>
                    </TableCell>
                    <TableCell className="py-3">
                      {a.arrivalDate ? (
                        <span className={`text-[10px] font-bold ${isArrived ? 'text-emerald-600' : 'text-blue-600'}`}>
                          {a.arrivalDate}
                        </span>
                      ) : (
                        <span className="text-stone-300 text-[10px]">—</span>
                      )}
                    </TableCell>
                    <TableCell className="py-3 font-black text-stone-900 text-[11px]">{a.categoryId || '—'}</TableCell>
                    <TableCell className="py-3 font-bold text-stone-500 text-[10px]">{a.size || '—'}</TableCell>
                    <TableCell className="py-3 font-bold text-stone-500 text-[10px] uppercase">{a.color || '—'}</TableCell>
                    <TableCell className="py-3 font-bold text-stone-400 text-[10px] max-w-[200px] truncate">{a.specs || '—'}</TableCell>
                    <TableCell className="py-3 text-right font-black text-stone-900 text-[11px]">{Number(a.quantity).toLocaleString('en-US')}</TableCell>
                    <TableCell className="py-3 font-bold text-stone-400 text-[10px] uppercase">{a.unitOfMeasure || '—'}</TableCell>
                    <TableCell className="py-3 text-center font-bold text-stone-600 text-[10px]">{a.cbm ? `${Number(a.cbm).toLocaleString('en-US')} m³` : '—'}</TableCell>
                    <TableCell className="py-3 text-center font-bold text-stone-600 text-[10px]">{a.netWeight ? `${Number(a.netWeight).toLocaleString('en-US')} kg` : '—'}</TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </Card>

      <div className="bg-gradient-to-r from-amber-50 to-amber-100/50 border border-amber-200/60 rounded-2xl p-5 flex items-start gap-4 mt-8 shadow-sm">
          <div className="bg-amber-100 p-2 rounded-xl shrink-0 mt-0.5">
            <AlertTriangle className="w-5 h-5 text-amber-600" />
          </div>
          <div>
            <h4 className="text-amber-900 font-black text-[11px] uppercase tracking-widest mb-1.5 flex items-center gap-2">
              Information Délais de Traitement <span className="w-1.5 h-1.5 rounded-full bg-amber-500 animate-pulse"></span>
            </h4>
            <p className="text-amber-800/80 font-bold text-[10px] uppercase tracking-widest leading-relaxed">
              Si le conteneur ou l'article affiche le statut <span className="bg-purple-100 text-purple-800 px-2 py-0.5 rounded-[4px] font-black border border-purple-200 mx-1">EN DÉDOUANEMENT</span>, la durée prévisionnelle de traitement est de <span className="font-black underline decoration-amber-400 underline-offset-4 decoration-2 px-1">7 à 15 jours</span> ouvrés.
            </p>
          </div>
        </div>

        <div className="grid grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-3 mt-6">
          <div className="p-3 bg-white rounded-2xl border border-stone-200 shadow-sm flex flex-col items-center text-center">
            <Badge className="bg-stone-100 text-stone-600 border-stone-200 text-[8px] uppercase font-black tracking-widest mb-2">À Commander</Badge>
            <p className="text-[9px] text-stone-400 font-bold uppercase tracking-widest leading-tight">Attente de validation usine</p>
          </div>
          <div className="p-3 bg-white rounded-2xl border border-amber-100 shadow-sm flex flex-col items-center text-center">
            <Badge className="bg-amber-50 text-amber-700 border-amber-100 text-[8px] uppercase font-black tracking-widest mb-2">En Production</Badge>
            <p className="text-[9px] text-amber-600/70 font-bold uppercase tracking-widest leading-tight">Fabrication en cours</p>
          </div>
          <div className="p-3 bg-white rounded-2xl border border-blue-100 shadow-sm flex flex-col items-center text-center">
            <Badge className="bg-blue-50 text-blue-700 border-blue-100 text-[8px] uppercase font-black tracking-widest mb-2">Expédié</Badge>
            <p className="text-[9px] text-blue-600/70 font-bold uppercase tracking-widest leading-tight">Départ usine effectué</p>
          </div>
          <div className="p-3 bg-white rounded-2xl border border-indigo-100 shadow-sm flex flex-col items-center text-center">
            <Badge className="bg-indigo-50 text-indigo-700 border-indigo-100 text-[8px] uppercase font-black tracking-widest mb-2">En Transit</Badge>
            <p className="text-[9px] text-indigo-600/70 font-bold uppercase tracking-widest leading-tight">En cours d'acheminement</p>
          </div>
          <div className="p-3 bg-white rounded-2xl border border-purple-100 shadow-sm flex flex-col items-center text-center">
            <Badge className="bg-purple-50 text-purple-700 border-purple-100 text-[8px] uppercase font-black tracking-widest mb-2">Dédouanement</Badge>
            <p className="text-[9px] text-purple-600/70 font-bold uppercase tracking-widest leading-tight">Procédures douanières</p>
          </div>
          <div className="p-3 bg-white rounded-2xl border border-emerald-100 shadow-sm flex flex-col items-center text-center">
            <Badge className="bg-emerald-50 text-emerald-700 border-emerald-100 text-[8px] uppercase font-black tracking-widest mb-2">En Stock</Badge>
            <p className="text-[9px] text-emerald-600/70 font-bold uppercase tracking-widest leading-tight">Arrivé à destination</p>
          </div>
        </div>
      </section>
    </div>
  );
}