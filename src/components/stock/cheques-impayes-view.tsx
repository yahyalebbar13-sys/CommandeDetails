"use client";

import React, { useState, useMemo } from 'react';
import { 
  CreditCard, AlertTriangle, CheckCircle2, Search, Filter, Printer, 
  Eye, Phone, ArrowUpRight, RotateCcw, Calendar, Building2, 
  FileText, Clock, AlertCircle, Sparkles, Check, X, ShieldAlert,
  Download, ArrowUpDown, ChevronDown
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useToast } from '@/hooks/use-toast';
import type { ClientPayment, Client, Invoice, StoreLocation, Store } from '@/lib/types';

interface ChequesImpayesViewProps {
  payments: ClientPayment[];
  allPayments?: ClientPayment[];
  clients: Client[];
  invoices: Invoice[];
  stores: Store[];
  activeStore: StoreLocation | 'ALL';
  userRole: 'ADMIN' | 'COMMERCIAL';
  userStoreId?: string;
  onUpdatePaymentStatus: (paymentId: string, status: 'PENDING' | 'CLEARED' | 'REJECTED') => Promise<void>;
  onNavigate?: (v: any) => void;
}

const fmt$ = (n: number) => n.toLocaleString('fr-MA', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' MAD';

export default function ChequesImpayesView({
  payments,
  clients,
  invoices,
  stores,
  activeStore,
  userRole,
  userStoreId,
  onUpdatePaymentStatus,
  onNavigate
}: ChequesImpayesViewProps) {
  const { toast } = useToast();

  const [statusFilter, setStatusFilter] = useState<'ALL' | 'REJECTED' | 'PENDING' | 'OVERDUE' | 'CLEARED'>('ALL');
  const [methodFilter, setMethodFilter] = useState<'ALL' | 'CHEQUE' | 'EFFET'>('ALL');
  const [search, setSearch] = useState('');
  const [selectedStoreFilter, setSelectedStoreFilter] = useState<string>('ALL');
  const [sortBy, setSortBy] = useState<'dueDate_asc' | 'dueDate_desc' | 'amount_desc' | 'date_desc'>('dueDate_asc');
  
  const [previewPayment, setPreviewPayment] = useState<ClientPayment | null>(null);
  const [processingId, setProcessingId] = useState<string | null>(null);

  // Map des clients pour accès rapide
  const clientsMap = useMemo(() => {
    const map = new Map<string, Client>();
    clients.forEach(c => map.set(c.id, c));
    return map;
  }, [clients]);

  // Map des soldes dus par client
  const clientBalances = useMemo(() => {
    const map = new Map<string, number>();
    for (const inv of invoices) {
      if (inv.status !== 'CANCELLED') {
        const bal = typeof inv.remainingBalance === 'number' 
          ? inv.remainingBalance 
          : Math.max(0, (inv.totalAfterDiscount || 0) - (inv.paidAmount || 0));
        if (inv.clientId) {
          map.set(inv.clientId, (map.get(inv.clientId) || 0) + bal);
        }
      }
    }
    return map;
  }, [invoices]);

  // Date du jour pour calculs de retard
  const todayStr = useMemo(() => new Date().toISOString().split('T')[0], []);
  const todayTime = useMemo(() => {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    return d.getTime();
  }, []);

  // Filtrer uniquement les moyens de paiement papiers (Chèques, Effets, LC, LCN)
  const paperPayments = useMemo(() => {
    return payments.filter(p => {
      const m = p.method as string;
      return m === 'CHEQUE' || m === 'EFFET' || m === 'LC' || m === 'LCN' || m === 'CHECK';
    });
  }, [payments]);

  // Statistiques globales
  const stats = useMemo(() => {
    let totalImpayesAmount = 0;
    let totalImpayesCount = 0;

    let totalPendingAmount = 0;
    let totalPendingCount = 0;

    let totalOverdueAmount = 0;
    let totalOverdueCount = 0;

    let totalClearedAmount = 0;
    let totalClearedCount = 0;

    let urgent7DaysCount = 0;
    let urgent7DaysAmount = 0;

    paperPayments.forEach(p => {
      const status = p.status || 'PENDING';
      const amt = Number(p.amount) || 0;

      if (status === 'REJECTED') {
        totalImpayesAmount += amt;
        totalImpayesCount++;
      } else if (status === 'CLEARED') {
        totalClearedAmount += amt;
        totalClearedCount++;
      } else {
        // PENDING
        totalPendingAmount += amt;
        totalPendingCount++;

        if (p.dueDate) {
          const dueTime = new Date(p.dueDate).getTime();
          const diffDays = Math.ceil((dueTime - todayTime) / (1000 * 60 * 60 * 24));
          if (diffDays < 0) {
            totalOverdueAmount += amt;
            totalOverdueCount++;
          } else if (diffDays <= 7) {
            urgent7DaysCount++;
            urgent7DaysAmount += amt;
          }
        }
      }
    });

    return {
      totalImpayesAmount,
      totalImpayesCount,
      totalPendingAmount,
      totalPendingCount,
      totalOverdueAmount,
      totalOverdueCount,
      totalClearedAmount,
      totalClearedCount,
      urgent7DaysCount,
      urgent7DaysAmount
    };
  }, [paperPayments, todayTime]);

  // Calcul du statut de retard pour un paiement
  const getDelayInfo = (dueDate?: string, status?: string) => {
    if (status === 'REJECTED') {
      return { label: 'Impayé / Rejeté', color: 'red', isOverdue: true, days: 0 };
    }
    if (status === 'CLEARED') {
      return { label: 'Encaissé', color: 'emerald', isOverdue: false, days: 0 };
    }
    if (!dueDate) {
      return { label: 'Sans échéance', color: 'stone', isOverdue: false, days: 0 };
    }
    const dueTime = new Date(dueDate).getTime();
    const diffDays = Math.ceil((dueTime - todayTime) / (1000 * 60 * 60 * 24));

    if (diffDays < 0) {
      return { label: `Échu (-${Math.abs(diffDays)} j)`, color: 'rose', isOverdue: true, days: diffDays };
    }
    if (diffDays === 0) {
      return { label: "Échéance aujourd'hui", color: 'amber', isOverdue: false, days: 0 };
    }
    if (diffDays <= 7) {
      return { label: `Dans ${diffDays} j`, color: 'amber', isOverdue: false, days: diffDays };
    }
    return { label: `Dans ${diffDays} j`, color: 'emerald', isOverdue: false, days: diffDays };
  };

  // Filtrage et Tri de la liste
  const filteredList = useMemo(() => {
    return paperPayments.filter(p => {
      const status = p.status || 'PENDING';
      const delay = getDelayInfo(p.dueDate, status);

      // Filtre de statut
      if (statusFilter === 'REJECTED' && status !== 'REJECTED') return false;
      if (statusFilter === 'PENDING' && (status !== 'PENDING' || delay.isOverdue)) return false;
      if (statusFilter === 'OVERDUE' && (!delay.isOverdue || status !== 'PENDING')) return false;
      if (statusFilter === 'CLEARED' && status !== 'CLEARED') return false;

      // Filtre méthode
      if (methodFilter === 'CHEQUE') {
        const isChq = p.method === 'CHEQUE' || (p.method as string) === 'CHECK';
        if (!isChq) return false;
      } else if (methodFilter === 'EFFET') {
        const isEff = p.method === 'EFFET' || p.method === 'LC' || p.method === 'LCN';
        if (!isEff) return false;
      }

      // Filtre magasin (pour admin)
      if (selectedStoreFilter !== 'ALL') {
        const client = clientsMap.get(p.clientId);
        const pStore = p.storeId || client?.storeId;
        if (pStore !== selectedStoreFilter) return false;
      }

      // Recherche texte
      if (search.trim()) {
        const q = search.trim().toLowerCase();
        const client = clientsMap.get(p.clientId);
        const clientName = (client?.name || (p as any).clientName || '').toLowerCase();
        const checkNum = (p.checkNumber || '').toLowerCase();
        const bank = (p.bankName || '').toLowerCase();
        const notes = (p.notes || '').toLowerCase();
        const amtStr = String(p.amount);
        const match = clientName.includes(q) || checkNum.includes(q) || bank.includes(q) || notes.includes(q) || amtStr.includes(q);
        if (!match) return false;
      }

      return true;
    }).sort((a, b) => {
      if (sortBy === 'dueDate_asc') {
        return (a.dueDate || '9999-99-99').localeCompare(b.dueDate || '9999-99-99');
      }
      if (sortBy === 'dueDate_desc') {
        return (b.dueDate || '').localeCompare(a.dueDate || '');
      }
      if (sortBy === 'amount_desc') {
        return (b.amount || 0) - (a.amount || 0);
      }
      return (b.date || '').localeCompare(a.date || '');
    });
  }, [paperPayments, statusFilter, methodFilter, selectedStoreFilter, search, sortBy, clientsMap, todayTime]);

  // Action 1-clic : Déclarer Impayé
  const handleDeclareImpaye = async (paymentId: string) => {
    setProcessingId(paymentId);
    try {
      await onUpdatePaymentStatus(paymentId, 'REJECTED');
      const p = payments.find(x => x.id === paymentId);
      const client = p ? clientsMap.get(p.clientId) : null;
      toast({
        title: "🚨 Impayé Déclaré !",
        description: `Le chèque/effet de ${p?.amount ? fmt$(p.amount) : ''} a été marqué comme impayé. Le solde de ${client?.name || 'ce client'} a été réouvert.`,
        variant: "destructive",
      });
      if (previewPayment?.id === paymentId) {
        setPreviewPayment(prev => prev ? { ...prev, status: 'REJECTED' } : null);
      }
    } catch (err: any) {
      toast({
        title: "Erreur",
        description: "Impossible de modifier le statut : " + (err?.message || "erreur inconnue"),
        variant: "destructive"
      });
    } finally {
      setProcessingId(null);
    }
  };

  // Action 1-clic : Marquer Encaissé
  const handleMarkCleared = async (paymentId: string) => {
    setProcessingId(paymentId);
    try {
      await onUpdatePaymentStatus(paymentId, 'CLEARED');
      toast({
        title: "✅ Paiement Encaissé",
        description: "Le chèque/effet a été marqué comme encaissé avec succès sur le compte bancaire.",
      });
      if (previewPayment?.id === paymentId) {
        setPreviewPayment(prev => prev ? { ...prev, status: 'CLEARED' } : null);
      }
    } catch (err: any) {
      toast({
        title: "Erreur",
        description: "Impossible de valider l'encaissement : " + (err?.message || "erreur inconnue"),
        variant: "destructive"
      });
    } finally {
      setProcessingId(null);
    }
  };

  // Action 1-clic : Remettre en attente (si erreur)
  const handleResetPending = async (paymentId: string) => {
    setProcessingId(paymentId);
    try {
      await onUpdatePaymentStatus(paymentId, 'PENDING');
      toast({
        title: "⏳ Remis en portefeuille",
        description: "Le chèque/effet est à nouveau en attente d'encaissement.",
      });
      if (previewPayment?.id === paymentId) {
        setPreviewPayment(prev => prev ? { ...prev, status: 'PENDING' } : null);
      }
    } catch (err: any) {
      toast({
        title: "Erreur",
        description: "Action impossible : " + (err?.message || "erreur inconnue"),
        variant: "destructive"
      });
    } finally {
      setProcessingId(null);
    }
  };

  // Impression
  const handlePrint = () => {
    window.print();
  };

  return (
    <div className="space-y-6 animate-in fade-in duration-300 pb-12">
      {/* ── Entête & Titre ── */}
      <div className="bg-stone-900 rounded-3xl p-6 sm:p-8 relative overflow-hidden shadow-2xl">
        <div className="absolute top-0 right-0 w-96 h-96 bg-rose-500/10 rounded-full -translate-y-1/2 translate-x-1/2 blur-3xl" />
        <div className="relative z-10 flex flex-col md:flex-row md:items-center justify-between gap-6">
          <div>
            <div className="flex items-center gap-2 mb-2">
              <span className="text-[9px] font-black uppercase tracking-[0.3em] text-rose-400 bg-rose-950/60 border border-rose-800/60 px-3 py-1 rounded-full">
                Gestion Commerciale & Trésorerie
              </span>
              {stats.totalImpayesCount > 0 && (
                <span className="text-[9px] font-black uppercase tracking-wider text-white bg-rose-600 animate-pulse px-2.5 py-0.5 rounded-full shadow-lg shadow-rose-600/50 flex items-center gap-1">
                  <AlertTriangle className="w-3 h-3" /> {stats.totalImpayesCount} IMPAYÉ(S) DÉTECTÉ(S)
                </span>
              )}
            </div>
            <h1 className="text-2xl sm:text-4xl font-black text-white uppercase tracking-tighter flex items-center gap-3">
              <span>Chèques / <span className="text-rose-500">Impayés</span></span>
            </h1>
            <p className="text-stone-400 text-xs sm:text-sm font-bold mt-1 max-w-2xl">
              Portefeuille complet des chèques et LCN. Déclarez les impayés bancaires en <span className="text-white underline font-black">1 seul clic</span> pour réouvrir immédiatement le solde du client.
            </p>
          </div>

          <div className="flex items-center gap-3 shrink-0">
            <Button
              onClick={handlePrint}
              variant="outline"
              className="bg-stone-800 hover:bg-stone-700 text-white border-stone-700 font-black text-xs uppercase px-4 h-11 rounded-2xl gap-2 shadow-sm"
            >
              <Printer className="w-4 h-4" />
              <span>Imprimer</span>
            </Button>
          </div>
        </div>
      </div>

      {/* ── KPI Cards ── */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Carte Impayés (Prioritaire) */}
        <div 
          onClick={() => setStatusFilter(statusFilter === 'REJECTED' ? 'ALL' : 'REJECTED')}
          className={`cursor-pointer rounded-2xl p-5 border transition-all ${
            statusFilter === 'REJECTED' 
              ? 'bg-rose-50 border-rose-400 ring-2 ring-rose-500 shadow-xl' 
              : 'bg-white border-stone-100 hover:border-rose-200 hover:shadow-lg'
          }`}
        >
          <div className="flex items-center justify-between mb-3">
            <span className="text-[9px] font-black uppercase tracking-widest text-rose-600 bg-rose-100 px-2 py-0.5 rounded-md flex items-center gap-1">
              <AlertTriangle className="w-3 h-3" /> Impayés Déclarés
            </span>
            <span className="text-xs font-black text-rose-700 bg-rose-100/80 px-2 py-0.5 rounded-full">
              {stats.totalImpayesCount}
            </span>
          </div>
          <p className="text-xl sm:text-2xl font-black text-rose-600 tracking-tight">
            {fmt$(stats.totalImpayesAmount)}
          </p>
          <p className="text-[10px] text-stone-400 font-bold mt-1">
            Chèques rejetés sans provision
          </p>
        </div>

        {/* Carte En Portefeuille */}
        <div 
          onClick={() => setStatusFilter(statusFilter === 'PENDING' ? 'ALL' : 'PENDING')}
          className={`cursor-pointer rounded-2xl p-5 border transition-all ${
            statusFilter === 'PENDING' 
              ? 'bg-amber-50 border-amber-400 ring-2 ring-amber-500 shadow-xl' 
              : 'bg-white border-stone-100 hover:border-amber-200 hover:shadow-lg'
          }`}
        >
          <div className="flex items-center justify-between mb-3">
            <span className="text-[9px] font-black uppercase tracking-widest text-amber-700 bg-amber-100 px-2 py-0.5 rounded-md flex items-center gap-1">
              <Clock className="w-3 h-3" /> En Portefeuille
            </span>
            <span className="text-xs font-black text-amber-800 bg-amber-100 px-2 py-0.5 rounded-full">
              {stats.totalPendingCount}
            </span>
          </div>
          <p className="text-xl sm:text-2xl font-black text-stone-900 tracking-tight">
            {fmt$(stats.totalPendingAmount)}
          </p>
          <p className="text-[10px] text-stone-400 font-bold mt-1">
            En attente d'échéance / encaissement
          </p>
        </div>

        {/* Carte Échus non réglés */}
        <div 
          onClick={() => setStatusFilter(statusFilter === 'OVERDUE' ? 'ALL' : 'OVERDUE')}
          className={`cursor-pointer rounded-2xl p-5 border transition-all ${
            statusFilter === 'OVERDUE' 
              ? 'bg-orange-50 border-orange-400 ring-2 ring-orange-500 shadow-xl' 
              : 'bg-white border-stone-100 hover:border-orange-200 hover:shadow-lg'
          }`}
        >
          <div className="flex items-center justify-between mb-3">
            <span className="text-[9px] font-black uppercase tracking-widest text-orange-700 bg-orange-100 px-2 py-0.5 rounded-md flex items-center gap-1">
              <AlertCircle className="w-3 h-3" /> Échéance Dépassée
            </span>
            <span className={`text-xs font-black px-2 py-0.5 rounded-full ${stats.totalOverdueCount > 0 ? 'bg-orange-500 text-white animate-pulse' : 'bg-stone-100 text-stone-600'}`}>
              {stats.totalOverdueCount}
            </span>
          </div>
          <p className="text-xl sm:text-2xl font-black text-orange-600 tracking-tight">
            {fmt$(stats.totalOverdueAmount)}
          </p>
          <p className="text-[10px] text-stone-400 font-bold mt-1">
            Date passée mais pas encore encaissés
          </p>
        </div>

        {/* Carte Encaissés */}
        <div 
          onClick={() => setStatusFilter(statusFilter === 'CLEARED' ? 'ALL' : 'CLEARED')}
          className={`cursor-pointer rounded-2xl p-5 border transition-all ${
            statusFilter === 'CLEARED' 
              ? 'bg-emerald-50 border-emerald-400 ring-2 ring-emerald-500 shadow-xl' 
              : 'bg-white border-stone-100 hover:border-emerald-200 hover:shadow-lg'
          }`}
        >
          <div className="flex items-center justify-between mb-3">
            <span className="text-[9px] font-black uppercase tracking-widest text-emerald-700 bg-emerald-100 px-2 py-0.5 rounded-md flex items-center gap-1">
              <CheckCircle2 className="w-3 h-3" /> Encaissés avec Succès
            </span>
            <span className="text-xs font-black text-emerald-800 bg-emerald-100 px-2 py-0.5 rounded-full">
              {stats.totalClearedCount}
            </span>
          </div>
          <p className="text-xl sm:text-2xl font-black text-emerald-600 tracking-tight">
            {fmt$(stats.totalClearedAmount)}
          </p>
          <p className="text-[10px] text-stone-400 font-bold mt-1">
            Fonds reçus en banque
          </p>
        </div>
      </div>

      {/* ── Filtres & Barre d'outils ── */}
      <div className="bg-white rounded-3xl p-5 shadow-xl border border-stone-100 space-y-4">
        {/* Onglets de Statut */}
        <div className="flex flex-wrap items-center gap-2 pb-2 border-b border-stone-100">
          {[
            { id: 'ALL', label: 'Tous', count: paperPayments.length, color: 'stone' },
            { id: 'REJECTED', label: '🚨 Impayés', count: stats.totalImpayesCount, color: 'rose' },
            { id: 'OVERDUE', label: '⚠️ Échus non réglés', count: stats.totalOverdueCount, color: 'orange' },
            { id: 'PENDING', label: '⏳ En Portefeuille', count: stats.totalPendingCount, color: 'amber' },
            { id: 'CLEARED', label: '✅ Encaissés', count: stats.totalClearedCount, color: 'emerald' },
          ].map(tab => {
            const isActive = statusFilter === tab.id;
            return (
              <button
                key={tab.id}
                onClick={() => setStatusFilter(tab.id as any)}
                className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-black uppercase tracking-wider transition-all ${
                  isActive
                    ? tab.color === 'rose'
                      ? 'bg-rose-600 text-white shadow-lg shadow-rose-600/30'
                      : tab.color === 'orange'
                      ? 'bg-orange-600 text-white shadow-lg shadow-orange-600/30'
                      : tab.color === 'amber'
                      ? 'bg-amber-600 text-white shadow-lg shadow-amber-600/30'
                      : tab.color === 'emerald'
                      ? 'bg-emerald-600 text-white shadow-lg shadow-emerald-600/30'
                      : 'bg-stone-900 text-white shadow-lg'
                    : 'bg-stone-100 text-stone-600 hover:bg-stone-200'
                }`}
              >
                <span>{tab.label}</span>
                <span className={`text-[10px] px-2 py-0.5 rounded-full font-black ${
                  isActive ? 'bg-white/20 text-white' : 'bg-stone-200 text-stone-700'
                }`}>
                  {tab.count}
                </span>
              </button>
            );
          })}
        </div>

        {/* Barre de recherche et sélecteurs */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
          <div className="relative">
            <Search className="w-4 h-4 text-stone-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
            <Input
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Rechercher client, N° chèque, banque..."
              className="pl-10 h-11 rounded-2xl border-stone-200 text-xs font-bold"
            />
            {search && (
              <button 
                onClick={() => setSearch('')}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-stone-400 hover:text-stone-600 p-1"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>

          <Select value={methodFilter} onValueChange={(v: any) => setMethodFilter(v)}>
            <SelectTrigger className="h-11 rounded-2xl border-stone-200 text-xs font-bold bg-white">
              <SelectValue placeholder="Moyen de paiement" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="ALL">💳 Tous les moyens (Chèques & LC)</SelectItem>
              <SelectItem value="CHEQUE">📜 Chèques bancaires uniquement</SelectItem>
              <SelectItem value="EFFET">📄 Effets / LCN uniquement</SelectItem>
            </SelectContent>
          </Select>

          {userRole === 'ADMIN' && activeStore === 'ALL' && (
            <Select value={selectedStoreFilter} onValueChange={setSelectedStoreFilter}>
              <SelectTrigger className="h-11 rounded-2xl border-stone-200 text-xs font-bold bg-white">
                <SelectValue placeholder="Magasin" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="ALL">🏪 Tous les magasins</SelectItem>
                {stores.filter(s => s.type !== 'WAREHOUSE').map(s => (
                  <SelectItem key={s.id} value={s.id}>
                    🏪 {s.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}

          <Select value={sortBy} onValueChange={(v: any) => setSortBy(v)}>
            <SelectTrigger className="h-11 rounded-2xl border-stone-200 text-xs font-bold bg-white">
              <SelectValue placeholder="Trier par" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="dueDate_asc">📅 Échéance la plus proche</SelectItem>
              <SelectItem value="dueDate_desc">📅 Échéance la plus lointaine</SelectItem>
              <SelectItem value="amount_desc">💰 Montant le plus élevé</SelectItem>
              <SelectItem value="date_desc">⏱️ Date de réception récente</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* ── Liste des chèques & effets ── */}
      {filteredList.length === 0 ? (
        <div className="bg-white rounded-3xl p-16 text-center border border-stone-100 shadow-xl">
          <div className="w-16 h-16 rounded-3xl bg-stone-100 flex items-center justify-center mx-auto mb-4 text-stone-400">
            <CreditCard className="w-8 h-8" />
          </div>
          <p className="text-stone-700 font-black uppercase tracking-wider text-sm">
            Aucun chèque ou effet trouvé
          </p>
          <p className="text-stone-400 text-xs font-bold mt-1">
            {search || statusFilter !== 'ALL' || methodFilter !== 'ALL'
              ? "Modifiez vos filtres ou votre recherche pour afficher des résultats."
              : "Aucun paiement par chèque ou traite n'a été enregistré pour le moment."}
          </p>
        </div>
      ) : (
        <div className="bg-white rounded-3xl shadow-xl border border-stone-100 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-stone-50/80 border-b border-stone-100 text-[9px] font-black uppercase tracking-wider text-stone-500">
                  <th className="py-3.5 px-4">Statut</th>
                  <th className="py-3.5 px-4">Type & N° Pièce</th>
                  <th className="py-3.5 px-4">Client</th>
                  <th className="py-3.5 px-4">Banque</th>
                  <th className="py-3.5 px-4">Date d'Échéance</th>
                  <th className="py-3.5 px-4 text-right">Montant</th>
                  <th className="py-3.5 px-4 text-center">Scan</th>
                  <th className="py-3.5 px-4 text-center min-w-[220px]">Action 1-Clic</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-stone-100">
                {filteredList.map(p => {
                  const client = clientsMap.get(p.clientId);
                  const clientName = client?.name || (p as any).clientName || 'Client Inconnu';
                  const clientBal = client ? (clientBalances.get(client.id) || 0) : 0;
                  const status = p.status || 'PENDING';
                  const delay = getDelayInfo(p.dueDate, status);
                  const isProcessing = processingId === p.id;
                  const isChq = p.method === 'CHEQUE' || (p.method as string) === 'CHECK';

                  return (
                    <tr 
                      key={p.id}
                      className={`transition-colors hover:bg-stone-50/60 ${
                        status === 'REJECTED' ? 'bg-rose-50/40' : ''
                      }`}
                    >
                      {/* Statut Badge */}
                      <td className="py-4 px-4 whitespace-nowrap">
                        {status === 'REJECTED' ? (
                          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-xl text-[10px] font-black uppercase tracking-wider bg-rose-600 text-white shadow-md shadow-rose-600/30 animate-pulse">
                            <AlertTriangle className="w-3 h-3" />
                            <span>Impayé</span>
                          </span>
                        ) : status === 'CLEARED' ? (
                          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-xl text-[10px] font-black uppercase tracking-wider bg-emerald-100 text-emerald-800 border border-emerald-200">
                            <CheckCircle2 className="w-3 h-3 text-emerald-600" />
                            <span>Encaissé</span>
                          </span>
                        ) : (
                          <span className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-xl text-[10px] font-black uppercase tracking-wider border ${
                            delay.isOverdue
                              ? 'bg-orange-100 text-orange-900 border-orange-300'
                              : 'bg-amber-100 text-amber-900 border-amber-200'
                          }`}>
                            <Clock className="w-3 h-3" />
                            <span>{delay.isOverdue ? 'Échu' : 'En attente'}</span>
                          </span>
                        )}
                      </td>

                      {/* Type & Numéro */}
                      <td className="py-4 px-4">
                        <div className="flex flex-col">
                          <span className={`text-[9px] font-black uppercase tracking-widest px-2 py-0.5 rounded w-fit mb-1 ${
                            isChq ? 'bg-blue-100 text-blue-800' : 'bg-purple-100 text-purple-800'
                          }`}>
                            {isChq ? 'Chèque' : 'Effet / LCN'}
                          </span>
                          <span className="text-xs font-black font-mono text-stone-900 tracking-wider">
                            {p.checkNumber || 'Sans N°'}
                          </span>
                          <span className="text-[9px] text-stone-400 font-bold mt-0.5">
                            Reçu le {p.date}
                          </span>
                        </div>
                      </td>

                      {/* Client */}
                      <td className="py-4 px-4">
                        <div className="flex flex-col">
                          <span className="font-black text-xs text-stone-900 uppercase">
                            {clientName}
                          </span>
                          <div className="flex items-center gap-2 mt-1">
                            {client?.phone && (
                              <a 
                                href={`tel:${client.phone}`}
                                className="text-[10px] text-stone-500 hover:text-emerald-600 font-bold flex items-center gap-1 transition-colors"
                                title="Appeler le client"
                              >
                                <Phone className="w-2.5 h-2.5" />
                                <span>{client.phone}</span>
                              </a>
                            )}
                            {clientBal > 0 && (
                              <span className="text-[9px] font-bold text-rose-600 bg-rose-50 px-1.5 py-0.5 rounded border border-rose-100">
                                Dû: {fmt$(clientBal)}
                              </span>
                            )}
                          </div>
                        </div>
                      </td>

                      {/* Banque */}
                      <td className="py-4 px-4">
                        <div className="flex flex-col">
                          <span className="text-xs font-bold text-stone-700 flex items-center gap-1.5">
                            <Building2 className="w-3.5 h-3.5 text-stone-400" />
                            <span>{p.bankName || 'Attijariwafa Bank'}</span>
                          </span>
                          {p.cashingCompany && (
                            <span className="text-[9px] font-black uppercase text-stone-400 mt-0.5">
                              Société: {p.cashingCompany}
                            </span>
                          )}
                        </div>
                      </td>

                      {/* Date d'échéance */}
                      <td className="py-4 px-4 whitespace-nowrap">
                        <div className="flex flex-col">
                          <span className="text-xs font-black font-mono text-stone-900 flex items-center gap-1.5">
                            <Calendar className="w-3.5 h-3.5 text-stone-400" />
                            <span>{p.dueDate || '—'}</span>
                          </span>
                          <span className={`text-[10px] font-black uppercase mt-1 px-2 py-0.5 rounded-md w-fit ${
                            delay.color === 'rose'
                              ? 'bg-rose-100 text-rose-700 font-black animate-pulse'
                              : delay.color === 'amber'
                              ? 'bg-amber-100 text-amber-800'
                              : delay.color === 'red'
                              ? 'bg-red-100 text-red-700'
                              : delay.color === 'emerald'
                              ? 'bg-emerald-100 text-emerald-800'
                              : 'bg-stone-100 text-stone-500'
                          }`}>
                            {delay.label}
                          </span>
                        </div>
                      </td>

                      {/* Montant */}
                      <td className="py-4 px-4 text-right whitespace-nowrap">
                        <span className="text-sm font-black text-stone-900 tracking-tight">
                          {fmt$(p.amount)}
                        </span>
                      </td>

                      {/* Scan Preview */}
                      <td className="py-4 px-4 text-center whitespace-nowrap">
                        {p.scannedImageUrl ? (
                          <button
                            type="button"
                            onClick={() => setPreviewPayment(p)}
                            className="group relative inline-block p-1 rounded-xl hover:bg-stone-100 transition-colors"
                            title="Voir le scan en grand"
                          >
                            <img
                              src={p.scannedImageUrl}
                              alt="Scan"
                              className="w-12 h-8 rounded-lg object-cover border border-stone-200 shadow-sm group-hover:scale-105 transition-transform"
                            />
                            <div className="absolute inset-0 bg-stone-900/30 rounded-xl opacity-0 group-hover:opacity-100 flex items-center justify-center transition-opacity text-white">
                              <Eye className="w-3 h-3" />
                            </div>
                          </button>
                        ) : (
                          <span className="text-[10px] font-bold text-stone-300 italic">
                            Aucun scan
                          </span>
                        )}
                      </td>

                      {/* ── ACTION 1-CLIC ── */}
                      <td className="py-4 px-4 text-center whitespace-nowrap">
                        <div className="flex items-center justify-center gap-2">
                          {status !== 'REJECTED' ? (
                            <>
                              {/* BOUTON 1-CLIC : DÉCLARER IMPAYÉ */}
                              <Button
                                onClick={() => handleDeclareImpaye(p.id)}
                                disabled={isProcessing}
                                size="sm"
                                className="bg-rose-600 hover:bg-rose-700 text-white font-black text-[10px] uppercase tracking-wider h-8 px-3 rounded-xl shadow-md shadow-rose-600/20 gap-1.5 transition-all active:scale-95"
                              >
                                <AlertTriangle className="w-3 h-3" />
                                <span>{isProcessing ? 'En cours...' : 'Déclarer Impayé'}</span>
                              </Button>

                              {/* Action secondaire : Encaisser */}
                              {status === 'PENDING' && (
                                <Button
                                  onClick={() => handleMarkCleared(p.id)}
                                  disabled={isProcessing}
                                  size="sm"
                                  variant="outline"
                                  className="h-8 px-2.5 text-[9px] font-bold border-stone-200 text-emerald-700 hover:bg-emerald-50 hover:border-emerald-300 rounded-xl"
                                  title="Marquer comme encaissé en banque"
                                >
                                  <Check className="w-3 h-3" />
                                  <span>Encaissé</span>
                                </Button>
                              )}
                            </>
                          ) : (
                            /* Si déjà marqué IMPAYÉ : options de régularisation */
                            <div className="flex items-center gap-1.5">
                              <Button
                                onClick={() => handleMarkCleared(p.id)}
                                disabled={isProcessing}
                                size="sm"
                                className="bg-emerald-600 hover:bg-emerald-700 text-white font-black text-[10px] uppercase tracking-wider h-8 px-3 rounded-xl shadow-md shadow-emerald-600/20 gap-1"
                                title="Régulariser et marquer encaissé"
                              >
                                <CheckCircle2 className="w-3 h-3" />
                                <span>Régulariser (Encaisser)</span>
                              </Button>

                              <Button
                                onClick={() => handleResetPending(p.id)}
                                disabled={isProcessing}
                                size="sm"
                                variant="ghost"
                                className="h-8 px-2 text-[9px] font-bold text-stone-500 hover:text-stone-900 rounded-xl"
                                title="Remettre en attente si erreur"
                              >
                                <RotateCcw className="w-3 h-3" />
                              </Button>
                            </div>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* Footer tableau */}
          <div className="p-4 bg-stone-50 border-t border-stone-100 flex flex-col sm:flex-row items-center justify-between gap-3 text-xs text-stone-500 font-bold">
            <div>
              Affichage de <span className="font-black text-stone-900">{filteredList.length}</span> chèque(s) / effet(s) sur un total de {paperPayments.length}
            </div>
            <div className="flex items-center gap-4">
              <span>
                Total affiché : <strong className="text-stone-900 font-black">{fmt$(filteredList.reduce((s, p) => s + (Number(p.amount) || 0), 0))}</strong>
              </span>
            </div>
          </div>
        </div>
      )}

      {/* ── MODAL APERÇU SCAN & ACTION 1-CLIC DIRECTE ── */}
      <Dialog open={!!previewPayment} onOpenChange={(open) => !open && setPreviewPayment(null)}>
        <DialogContent className="max-w-3xl rounded-3xl p-0 overflow-hidden border-none shadow-2xl">
          {previewPayment && (() => {
            const client = clientsMap.get(previewPayment.clientId);
            const clientName = client?.name || (previewPayment as any).clientName || 'Client';
            const status = previewPayment.status || 'PENDING';
            const isChq = previewPayment.method === 'CHEQUE' || (previewPayment.method as string) === 'CHECK';

            return (
              <div>
                <div className="bg-stone-900 p-6 text-white flex items-center justify-between">
                  <div>
                    <span className="text-[9px] font-black uppercase tracking-widest text-stone-400 bg-white/10 px-2.5 py-0.5 rounded-full">
                      Scan Officiel · {isChq ? 'Chèque Bancaire' : 'Effet / LCN'}
                    </span>
                    <DialogTitle className="text-xl font-black uppercase tracking-tight text-white mt-1">
                      N° {previewPayment.checkNumber || 'Sans Numéro'} — {fmt$(previewPayment.amount)}
                    </DialogTitle>
                    <p className="text-xs text-stone-300 font-bold mt-0.5">
                      Client : <strong className="text-white uppercase">{clientName}</strong> · Banque : <strong>{previewPayment.bankName || 'Attijariwafa Bank'}</strong>
                    </p>
                  </div>
                  <div className="text-right">
                    <span className="text-[10px] font-black uppercase tracking-widest text-stone-400">Échéance</span>
                    <p className="text-base font-black text-amber-400">{previewPayment.dueDate || 'Non définie'}</p>
                  </div>
                </div>

                {/* Image du Scan */}
                <div className="p-6 bg-stone-100 flex items-center justify-center max-h-[60vh] overflow-auto">
                  {previewPayment.scannedImageUrl ? (
                    <img
                      src={previewPayment.scannedImageUrl}
                      alt="Scan Chèque"
                      className="max-w-full max-h-[50vh] object-contain rounded-2xl shadow-lg bg-white border border-stone-200"
                    />
                  ) : (
                    <div className="p-12 text-center text-stone-400 font-bold">
                      Aucune image disponible pour ce chèque.
                    </div>
                  )}
                </div>

                {/* Footer avec Bouton 1-Clic dans le modal */}
                <DialogFooter className="p-4 bg-white border-t border-stone-100 flex flex-row items-center justify-between gap-3">
                  <Button
                    variant="ghost"
                    onClick={() => setPreviewPayment(null)}
                    className="text-xs font-black uppercase tracking-wider rounded-xl"
                  >
                    Fermer
                  </Button>

                  <div className="flex items-center gap-2">
                    {status !== 'REJECTED' ? (
                      <Button
                        onClick={() => handleDeclareImpaye(previewPayment.id)}
                        disabled={processingId === previewPayment.id}
                        className="bg-rose-600 hover:bg-rose-700 text-white font-black text-xs uppercase tracking-wider h-11 px-5 rounded-2xl shadow-lg shadow-rose-600/30 gap-2"
                      >
                        <AlertTriangle className="w-4 h-4" />
                        <span>Déclarer ce Chèque Impayé en 1-Clic</span>
                      </Button>
                    ) : (
                      <Button
                        onClick={() => handleMarkCleared(previewPayment.id)}
                        disabled={processingId === previewPayment.id}
                        className="bg-emerald-600 hover:bg-emerald-700 text-white font-black text-xs uppercase tracking-wider h-11 px-5 rounded-2xl shadow-lg shadow-emerald-600/30 gap-2"
                      >
                        <CheckCircle2 className="w-4 h-4" />
                        <span>Régulariser (Marquer Encaissé)</span>
                      </Button>
                    )}
                  </div>
                </DialogFooter>
              </div>
            );
          })()}
        </DialogContent>
      </Dialog>
    </div>
  );
}
