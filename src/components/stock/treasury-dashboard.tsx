"use client";

import React, { useMemo, useState } from 'react';
import { 
  Landmark, CreditCard, TrendingUp, AlertTriangle, CheckCircle2, XCircle, FileText, 
  Image as ImageIcon, Calendar as CalendarIcon, Check, Building2, Printer, Sparkles,
  ArrowRight, ShieldAlert, CheckCheck, HelpCircle, RefreshCw
} from 'lucide-react';
import { ClientPayment, Client, Invoice, CashingCompany } from '@/lib/types';
import { Dialog, DialogContent, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';

const fmt = (n: number) => n.toLocaleString('fr-MA', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

const getDaysRemaining = (dueDate?: string) => {
  if (!dueDate) return null;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const due = new Date(dueDate);
  due.setHours(0, 0, 0, 0);
  return Math.ceil((due.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
};

interface TreasuryDashboardProps {
  payments: ClientPayment[];
  clients: Client[];
  invoices: Invoice[];
  onUpdatePaymentStatus: (paymentId: string, status: 'PENDING' | 'CLEARED' | 'REJECTED') => Promise<void>;
  onAssignPaymentCompany?: (paymentId: string, company: CashingCompany) => Promise<void>;
}

export default function TreasuryDashboard({ 
  payments, 
  clients, 
  invoices, 
  onUpdatePaymentStatus,
  onAssignPaymentCompany 
}: TreasuryDashboardProps) {
  const [viewScan, setViewScan] = useState<string | null>(null);
  const [companyFilter, setCompanyFilter] = useState<'ALL' | 'URGENT_7D' | 'LEBTEX' | 'ROBE IN BOX' | 'UNASSIGNED'>('ALL');
  const [printRemiseCompany, setPrintRemiseCompany] = useState<CashingCompany | null>(null);
  const [assigningId, setAssigningId] = useState<string | null>(null);

  // Statistiques globales
  const stats = useMemo(() => {
    let directCash = 0; // CASH + VIREMENT + AUTRE
    let pendingEffects = 0; // EFFET / CHEQUE / LC (PENDING)
    let clearedEffects = 0; // EFFET / CHEQUE / LC (CLEARED)
    let rejectedEffects = 0; // EFFET / CHEQUE / LC (REJECTED)
    let lebtexTotal = 0;
    let lebtexCount = 0;
    let robeTotal = 0;
    let robeCount = 0;
    let unassignedUrgentCount = 0;

    payments.forEach(p => {
      const isPaper = p.method === 'CHEQUE' || p.method === 'EFFET' || p.method === 'LC' || p.method === 'LCN';
      if (isPaper) {
        if (p.status === 'CLEARED') {
          clearedEffects += p.amount;
        } else if (p.status === 'REJECTED') {
          rejectedEffects += p.amount;
        } else {
          // PENDING
          pendingEffects += p.amount;
          if (p.cashingCompany === 'LEBTEX') {
            lebtexTotal += p.amount;
            lebtexCount++;
          } else if (p.cashingCompany === 'ROBE IN BOX') {
            robeTotal += p.amount;
            robeCount++;
          }
          
          if (!p.cashingCompany && p.dueDate) {
            const days = getDaysRemaining(p.dueDate);
            if (days !== null && days <= 7) {
              unassignedUrgentCount++;
            }
          }
        }
      } else {
        directCash += p.amount;
      }
    });

    return { directCash, pendingEffects, clearedEffects, rejectedEffects, lebtexTotal, lebtexCount, robeTotal, robeCount, unassignedUrgentCount };
  }, [payments]);

  // Liste des effets en attente
  const allPendingPayments = useMemo(() => {
    return payments
      .filter(p => (p.method === 'CHEQUE' || p.method === 'EFFET' || p.method === 'LC' || p.method === 'LCN') && p.status !== 'CLEARED' && p.status !== 'REJECTED')
      .sort((a, b) => {
        const d1 = a.dueDate || '9999-12-31';
        const d2 = b.dueDate || '9999-12-31';
        return d1.localeCompare(d2);
      });
  }, [payments]);

  // Effets urgents sans société à J-7 (ou déjà échus sans société)
  const urgentUnassignedPayments = useMemo(() => {
    return allPendingPayments.filter(p => {
      if (p.cashingCompany) return false;
      const days = getDaysRemaining(p.dueDate);
      return days !== null && days <= 7;
    });
  }, [allPendingPayments]);

  // Liste filtrée selon l'onglet actif
  const displayedPayments = useMemo(() => {
    if (companyFilter === 'URGENT_7D') {
      return urgentUnassignedPayments;
    }
    if (companyFilter === 'LEBTEX') {
      return allPendingPayments.filter(p => p.cashingCompany === 'LEBTEX');
    }
    if (companyFilter === 'ROBE IN BOX') {
      return allPendingPayments.filter(p => p.cashingCompany === 'ROBE IN BOX');
    }
    if (companyFilter === 'UNASSIGNED') {
      return allPendingPayments.filter(p => !p.cashingCompany);
    }
    return allPendingPayments;
  }, [allPendingPayments, urgentUnassignedPayments, companyFilter]);

  // Effets pour l'impression de la remise Attijariwafa Bank
  const remisePayments = useMemo(() => {
    if (!printRemiseCompany) return [];
    return allPendingPayments.filter(p => p.cashingCompany === printRemiseCompany);
  }, [allPendingPayments, printRemiseCompany]);

  const remiseTotal = useMemo(() => {
    return remisePayments.reduce((acc, p) => acc + p.amount, 0);
  }, [remisePayments]);

  const forecastData = useMemo(() => {
    const today = new Date();
    const periods = [
      { name: '0-30 jours', min: 0, max: 30, amount: 0 },
      { name: '31-60 jours', min: 31, max: 60, amount: 0 },
      { name: '61-90 jours', min: 61, max: 90, amount: 0 },
      { name: '90+ jours', min: 91, max: 9999, amount: 0 },
    ];
    payments.forEach(p => {
      const isPaper = p.method === 'CHEQUE' || p.method === 'EFFET' || p.method === 'LC' || p.method === 'LCN';
      if (isPaper && p.status !== 'CLEARED' && p.status !== 'REJECTED' && p.dueDate) {
        const due = new Date(p.dueDate);
        const daysUntilDue = Math.ceil((due.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
        const period = periods.find(pr => daysUntilDue >= pr.min && daysUntilDue <= pr.max);
        if (period) period.amount += p.amount;
      }
    });
    return periods;
  }, [payments]);

  const getClientName = (id: string) => clients.find(c => c.id === id)?.name || 'Client Inconnu';
  const getInvoiceNumber = (invId?: string) => {
    if (!invId) return '—';
    const inv = invoices.find(i => i.id === invId);
    if (!inv) return '—';
    return inv.invoiceNumber || `FAC-${String(invoices.findIndex(i => i.id === invId) + 1).padStart(4, '0')}`;
  };

  const handleAssign = async (paymentId: string, company: CashingCompany) => {
    if (!onAssignPaymentCompany) return;
    try {
      setAssigningId(paymentId);
      await onAssignPaymentCompany(paymentId, company);
    } finally {
      setAssigningId(null);
    }
  };

  return (
    <div className="p-6 space-y-6 max-w-7xl mx-auto pb-32">
      {/* Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-2xl font-black text-stone-900 uppercase tracking-tight flex items-center gap-2">
            <Landmark className="w-6 h-6 text-emerald-600" />
            Trésorerie & Banque Attijari
          </h2>
          <p className="text-[11px] font-bold text-stone-500 uppercase tracking-widest mt-1">
            Gestion centralisée des encaissements Attijariwafa Bank · LEBTEX & ROBE IN BOX
          </p>
        </div>

        {/* Quick actions for print remise */}
        <div className="flex items-center gap-2 flex-wrap">
          <Button
            variant="outline"
            size="sm"
            onClick={() => setPrintRemiseCompany('LEBTEX')}
            className="h-9 px-3 border-stone-200 hover:border-emerald-500 hover:bg-emerald-50 text-stone-700 hover:text-emerald-700 font-black text-xs rounded-xl flex items-center gap-1.5 shadow-sm"
          >
            <Printer className="w-3.5 h-3.5 text-emerald-600" />
            <span>Remise Attijari LEBTEX</span>
            {stats.lebtexCount > 0 && (
              <span className="bg-emerald-600 text-white text-[10px] px-1.5 py-0.2 rounded-full font-black ml-0.5">
                {stats.lebtexCount}
              </span>
            )}
          </Button>

          <Button
            variant="outline"
            size="sm"
            onClick={() => setPrintRemiseCompany('ROBE IN BOX')}
            className="h-9 px-3 border-stone-200 hover:border-purple-500 hover:bg-purple-50 text-stone-700 hover:text-purple-700 font-black text-xs rounded-xl flex items-center gap-1.5 shadow-sm"
          >
            <Printer className="w-3.5 h-3.5 text-purple-600" />
            <span>Remise Attijari ROBE IN BOX</span>
            {stats.robeCount > 0 && (
              <span className="bg-purple-600 text-white text-[10px] px-1.5 py-0.2 rounded-full font-black ml-0.5">
                {stats.robeCount}
              </span>
            )}
          </Button>
        </div>
      </div>

      {/* ⚠️ SECTION ALERTE CRITIQUE J-7 : DEMANDE ARBITRAGE SOCIETE */}
      {urgentUnassignedPayments.length > 0 && (
        <div className="bg-gradient-to-r from-amber-500/15 via-orange-500/10 to-amber-500/15 border-2 border-amber-400 rounded-3xl p-5 sm:p-6 shadow-lg shadow-amber-500/10 animate-in fade-in slide-in-from-top-4 duration-300">
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 mb-4 pb-3 border-b border-amber-200/60">
            <div className="flex items-center gap-3">
              <div className="h-10 w-10 rounded-2xl bg-amber-500 text-white flex items-center justify-center shadow-md shadow-amber-500/30 shrink-0">
                <AlertTriangle className="w-5 h-5 animate-pulse" />
              </div>
              <div>
                <h3 className="text-base font-black text-amber-900 uppercase tracking-tight flex items-center gap-2">
                  <span>Alerte Échéance J-7 · Arbitrage Société Obligatoire</span>
                  <span className="bg-amber-600 text-white text-[10px] px-2 py-0.5 rounded-full font-black">
                    {urgentUnassignedPayments.length} effet(s)
                  </span>
                </h3>
                <p className="text-xs font-bold text-amber-800/90 mt-0.5">
                  Ces chèques / LCN arrivent à échéance dans 7 jours ou moins sur votre compte <span className="font-black text-amber-950">Attijariwafa Bank</span>. Choisissez la société sur laquelle les émettre :
                </p>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
            {urgentUnassignedPayments.map(p => {
              const days = getDaysRemaining(p.dueDate);
              const isOverdue = days !== null && days < 0;
              const isToday = days === 0;
              const isAssigning = assigningId === p.id;

              return (
                <div 
                  key={p.id}
                  className="bg-white rounded-2xl p-4 border border-amber-300 shadow-sm flex flex-col justify-between space-y-3 relative hover:shadow-md transition-shadow"
                >
                  <div className="space-y-1.5">
                    <div className="flex items-center justify-between">
                      <span className={`text-[9px] font-black uppercase px-2 py-0.5 rounded-md ${
                        p.method === 'CHEQUE' ? 'bg-blue-50 text-blue-700' : 'bg-purple-50 text-purple-700'
                      }`}>
                        {p.method}
                      </span>
                      <span className={`text-[10px] font-black px-2 py-0.5 rounded-full ${
                        isOverdue ? 'bg-red-100 text-red-700 border border-red-200' :
                        isToday ? 'bg-orange-100 text-orange-800 border border-orange-200 animate-pulse' :
                        'bg-amber-100 text-amber-800 border border-amber-200'
                      }`}>
                        {isOverdue ? `Échu (J+${Math.abs(days!)})` : isToday ? "Aujourd'hui !" : `Dans ${days} jours (J-${days})`}
                      </span>
                    </div>

                    <div>
                      <p className="text-xs font-black text-stone-900 line-clamp-1">{getClientName(p.clientId)}</p>
                      <p className="text-[10px] font-bold text-stone-500">{getInvoiceNumber(p.invoiceId)} · N° {p.checkNumber || '—'}</p>
                    </div>

                    <div className="flex items-baseline justify-between pt-1">
                      <span className="text-[10px] font-bold text-stone-400">Tiré sur {p.bankName || 'Banque'}</span>
                      <span className="text-base font-black text-stone-900">{fmt(p.amount)} <span className="text-xs text-stone-400">MAD</span></span>
                    </div>
                  </div>

                  {/* Boutons d'arbitrage 1-clic */}
                  <div className="pt-2 border-t border-stone-100 space-y-1.5">
                    <p className="text-[9px] font-black text-stone-400 uppercase tracking-wider text-center">Émettre sur :</p>
                    <div className="grid grid-cols-2 gap-2">
                      <button
                        onClick={() => handleAssign(p.id, 'LEBTEX')}
                        disabled={isAssigning}
                        className="h-9 rounded-xl bg-emerald-600 hover:bg-emerald-700 active:scale-95 text-white font-black text-[10px] uppercase flex items-center justify-center gap-1 shadow-sm transition-all disabled:opacity-50"
                      >
                        <Building2 className="w-3 h-3" />
                        <span>LEBTEX</span>
                      </button>

                      <button
                        onClick={() => handleAssign(p.id, 'ROBE IN BOX')}
                        disabled={isAssigning}
                        className="h-9 rounded-xl bg-purple-600 hover:bg-purple-700 active:scale-95 text-white font-black text-[10px] uppercase flex items-center justify-center gap-1 shadow-sm transition-all disabled:opacity-50"
                      >
                        <Sparkles className="w-3 h-3" />
                        <span>ROBE IN BOX</span>
                      </button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-white rounded-3xl p-5 border border-stone-100 shadow-sm relative overflow-hidden">
          <div className="absolute top-0 right-0 p-4 opacity-10"><TrendingUp className="w-16 h-16 text-emerald-500" /></div>
          <p className="text-[10px] font-black text-stone-400 uppercase tracking-widest mb-1 relative z-10">Cash Direct & Virements</p>
          <p className="text-2xl font-black text-stone-900 relative z-10">{fmt(stats.directCash)} <span className="text-sm text-stone-400">MAD</span></p>
          <p className="text-[9px] font-bold text-emerald-600 uppercase mt-2 bg-emerald-50 inline-block px-2 py-0.5 rounded-full relative z-10">Encaissé</p>
        </div>

        <div className="bg-white rounded-3xl p-5 border border-stone-100 shadow-sm relative overflow-hidden">
          <div className="absolute top-0 right-0 p-4 opacity-10"><CalendarIcon className="w-16 h-16 text-violet-500" /></div>
          <p className="text-[10px] font-black text-stone-400 uppercase tracking-widest mb-1 relative z-10">Total Effets en Portefeuille</p>
          <p className="text-2xl font-black text-violet-700 relative z-10">{fmt(stats.pendingEffects)} <span className="text-sm text-violet-400">MAD</span></p>
          <div className="flex items-center gap-2 mt-2">
            <span className="text-[9px] font-bold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-full">
              LEBTEX: {fmt(stats.lebtexTotal)} MAD
            </span>
            <span className="text-[9px] font-bold text-purple-700 bg-purple-50 px-2 py-0.5 rounded-full">
              ROBE: {fmt(stats.robeTotal)} MAD
            </span>
          </div>
        </div>

        <div className="bg-white rounded-3xl p-5 border border-stone-100 shadow-sm relative overflow-hidden">
          <div className="absolute top-0 right-0 p-4 opacity-10"><CheckCircle2 className="w-16 h-16 text-emerald-500" /></div>
          <p className="text-[10px] font-black text-stone-400 uppercase tracking-widest mb-1 relative z-10">Effets Encaissés (Payés)</p>
          <p className="text-2xl font-black text-emerald-600 relative z-10">{fmt(stats.clearedEffects)} <span className="text-sm text-emerald-400">MAD</span></p>
          <p className="text-[9px] font-bold text-emerald-600 uppercase mt-2 bg-emerald-50 inline-block px-2 py-0.5 rounded-full relative z-10">Crédité sur compte</p>
        </div>

        <div className="bg-white rounded-3xl p-5 border border-stone-100 shadow-sm relative overflow-hidden">
          <div className="absolute top-0 right-0 p-4 opacity-10"><AlertTriangle className="w-16 h-16 text-red-500" /></div>
          <p className="text-[10px] font-black text-stone-400 uppercase tracking-widest mb-1 relative z-10">Effets Impayés / Rejetés</p>
          <p className="text-2xl font-black text-red-600 relative z-10">{fmt(stats.rejectedEffects)} <span className="text-sm text-red-400">MAD</span></p>
          <p className="text-[9px] font-bold text-red-600 uppercase mt-2 bg-red-50 inline-block px-2 py-0.5 rounded-full relative z-10">Contentieux / À relancer</p>
        </div>
      </div>

      {/* Table of pending effects with Company Selection */}
      <div className="bg-white border border-stone-100 rounded-3xl shadow-sm overflow-hidden flex flex-col">
        <div className="p-5 border-b border-stone-100 bg-stone-50/50 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3">
          <div>
            <h3 className="text-sm font-black text-stone-900 uppercase tracking-tight flex items-center gap-2">
              <CreditCard className="w-4 h-4 text-violet-600" />
              Portefeuille d'effets (Banque Attijari)
            </h3>
            <p className="text-[10px] font-bold text-stone-500 uppercase tracking-widest mt-0.5">
              Affectez chaque chèque et LCN à la société LEBTEX ou ROBE IN BOX
            </p>
          </div>

          {/* Filtres par société & J-7 */}
          <div className="flex items-center gap-1.5 flex-wrap">
            <button
              onClick={() => setCompanyFilter('ALL')}
              className={`px-3 py-1.5 rounded-xl text-[10px] font-black uppercase transition-all ${
                companyFilter === 'ALL'
                  ? 'bg-stone-900 text-white shadow-sm'
                  : 'bg-stone-100 text-stone-600 hover:bg-stone-200'
              }`}
            >
              Tous ({allPendingPayments.length})
            </button>

            <button
              onClick={() => setCompanyFilter('URGENT_7D')}
              className={`px-3 py-1.5 rounded-xl text-[10px] font-black uppercase transition-all flex items-center gap-1 ${
                companyFilter === 'URGENT_7D'
                  ? 'bg-amber-600 text-white shadow-sm'
                  : urgentUnassignedPayments.length > 0
                    ? 'bg-amber-100 text-amber-800 hover:bg-amber-200 border border-amber-300 animate-pulse'
                    : 'bg-stone-100 text-stone-600 hover:bg-stone-200'
              }`}
            >
              <AlertTriangle className="w-3 h-3" />
              <span>À arbitrer J-7 ({urgentUnassignedPayments.length})</span>
            </button>

            <button
              onClick={() => setCompanyFilter('LEBTEX')}
              className={`px-3 py-1.5 rounded-xl text-[10px] font-black uppercase transition-all flex items-center gap-1 ${
                companyFilter === 'LEBTEX'
                  ? 'bg-emerald-600 text-white shadow-sm'
                  : 'bg-stone-100 text-stone-600 hover:bg-stone-200'
              }`}
            >
              <Building2 className="w-3 h-3 text-emerald-600" />
              <span>LEBTEX ({stats.lebtexCount})</span>
            </button>

            <button
              onClick={() => setCompanyFilter('ROBE IN BOX')}
              className={`px-3 py-1.5 rounded-xl text-[10px] font-black uppercase transition-all flex items-center gap-1 ${
                companyFilter === 'ROBE IN BOX'
                  ? 'bg-purple-600 text-white shadow-sm'
                  : 'bg-stone-100 text-stone-600 hover:bg-stone-200'
              }`}
            >
              <Sparkles className="w-3 h-3 text-purple-600" />
              <span>ROBE IN BOX ({stats.robeCount})</span>
            </button>

            <button
              onClick={() => setCompanyFilter('UNASSIGNED')}
              className={`px-3 py-1.5 rounded-xl text-[10px] font-black uppercase transition-all ${
                companyFilter === 'UNASSIGNED'
                  ? 'bg-stone-700 text-white shadow-sm'
                  : 'bg-stone-100 text-stone-600 hover:bg-stone-200'
              }`}
            >
              Non affectés ({allPendingPayments.filter(p => !p.cashingCompany).length})
            </button>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-stone-50 border-b border-stone-100">
                <th className="px-4 py-3 text-[9px] font-black text-stone-400 uppercase tracking-widest">Type</th>
                <th className="px-4 py-3 text-[9px] font-black text-stone-400 uppercase tracking-widest">Client / Facture</th>
                <th className="px-4 py-3 text-[9px] font-black text-stone-400 uppercase tracking-widest">Banque Tirée & N°</th>
                <th className="px-4 py-3 text-[9px] font-black text-stone-400 uppercase tracking-widest">Échéance</th>
                <th className="px-4 py-3 text-[9px] font-black text-stone-400 uppercase tracking-widest">Société Émettrice (Attijari)</th>
                <th className="px-4 py-3 text-right text-[9px] font-black text-stone-400 uppercase tracking-widest">Montant</th>
                <th className="px-4 py-3 text-center text-[9px] font-black text-stone-400 uppercase tracking-widest">Scan</th>
                <th className="px-4 py-3 text-right text-[9px] font-black text-stone-400 uppercase tracking-widest">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-stone-50">
              {displayedPayments.length === 0 ? (
                <tr>
                  <td colSpan={8} className="p-8 text-center text-stone-400 text-xs font-bold uppercase tracking-widest">
                    Aucun effet dans cette vue
                  </td>
                </tr>
              ) : displayedPayments.map(p => {
                const days = getDaysRemaining(p.dueDate);
                const isOverdue = days !== null && days < 0;
                const isUrgent = days !== null && days <= 7;
                const isAssigning = assigningId === p.id;

                return (
                  <tr key={p.id} className="hover:bg-stone-50/40 transition-colors">
                    <td className="px-4 py-3.5">
                      <span className={`text-[10px] font-black uppercase px-2 py-1 rounded-md ${
                        p.method === 'CHEQUE' ? 'bg-blue-50 text-blue-700' :
                        (p.method === 'LC' || p.method === 'LCN') ? 'bg-purple-50 text-purple-700' :
                        'bg-violet-50 text-violet-700'
                      }`}>
                        {p.method}
                      </span>
                    </td>
                    <td className="px-4 py-3.5">
                      <p className="text-xs font-black text-stone-900">{getClientName(p.clientId)}</p>
                      <p className="text-[10px] font-bold text-stone-500">{getInvoiceNumber(p.invoiceId)}</p>
                    </td>
                    <td className="px-4 py-3.5">
                      <p className="text-[11px] font-bold text-stone-800">{p.bankName || 'Banque non précisée'}</p>
                      <p className="text-[10px] font-bold text-stone-500 font-mono">{p.checkNumber || 'N° manquant'}</p>
                    </td>
                    <td className="px-4 py-3.5">
                      {p.dueDate ? (
                        <div className="flex flex-col">
                          <span className={`text-[11px] font-black px-2 py-0.5 rounded-lg w-fit ${
                            isOverdue ? 'bg-red-100 text-red-700 border border-red-200' :
                            isUrgent ? 'bg-amber-100 text-amber-700 border border-amber-200' :
                            'bg-stone-100 text-stone-600'
                          }`}>
                            {p.dueDate}
                          </span>
                          <span className={`text-[9px] font-bold mt-0.5 ${
                            isOverdue ? 'text-red-600' : isUrgent ? 'text-amber-600 font-black' : 'text-stone-400'
                          }`}>
                            {days !== null && (
                              days < 0 ? `Échu (+${Math.abs(days)}j)` :
                              days === 0 ? "Aujourd'hui !" :
                              `J-${days}`
                            )}
                          </span>
                        </div>
                      ) : <span className="text-stone-300">—</span>}
                    </td>

                    {/* Société d'encaissement (Attijariwafa Bank) */}
                    <td className="px-4 py-3.5">
                      {p.cashingCompany === 'LEBTEX' ? (
                        <div className="flex items-center gap-1.5">
                          <span className="inline-flex items-center gap-1 bg-emerald-50 text-emerald-700 border border-emerald-200 font-black text-[10px] uppercase px-2 py-1 rounded-lg">
                            <Building2 className="w-3 h-3" />
                            LEBTEX (Attijari)
                          </span>
                          <button
                            onClick={() => handleAssign(p.id, 'ROBE IN BOX')}
                            title="Basculer vers ROBE IN BOX"
                            disabled={isAssigning}
                            className="text-[9px] font-bold text-stone-400 hover:text-purple-600 p-1 hover:bg-purple-50 rounded"
                          >
                            <RefreshCw className="w-3 h-3" />
                          </button>
                        </div>
                      ) : p.cashingCompany === 'ROBE IN BOX' ? (
                        <div className="flex items-center gap-1.5">
                          <span className="inline-flex items-center gap-1 bg-purple-50 text-purple-700 border border-purple-200 font-black text-[10px] uppercase px-2 py-1 rounded-lg">
                            <Sparkles className="w-3 h-3" />
                            ROBE IN BOX (Attijari)
                          </span>
                          <button
                            onClick={() => handleAssign(p.id, 'LEBTEX')}
                            title="Basculer vers LEBTEX"
                            disabled={isAssigning}
                            className="text-[9px] font-bold text-stone-400 hover:text-emerald-600 p-1 hover:bg-emerald-50 rounded"
                          >
                            <RefreshCw className="w-3 h-3" />
                          </button>
                        </div>
                      ) : (
                        <div className="flex items-center gap-1 flex-wrap">
                          <button
                            onClick={() => handleAssign(p.id, 'LEBTEX')}
                            disabled={isAssigning}
                            className={`h-7 px-2 rounded-lg font-black text-[9px] uppercase transition-all flex items-center gap-1 ${
                              isUrgent 
                                ? 'bg-emerald-600 text-white hover:bg-emerald-700 shadow-sm'
                                : 'bg-stone-100 hover:bg-emerald-50 text-stone-600 hover:text-emerald-700 border border-stone-200'
                            }`}
                          >
                            <Building2 className="w-2.5 h-2.5" />
                            LEBTEX
                          </button>
                          <button
                            onClick={() => handleAssign(p.id, 'ROBE IN BOX')}
                            disabled={isAssigning}
                            className={`h-7 px-2 rounded-lg font-black text-[9px] uppercase transition-all flex items-center gap-1 ${
                              isUrgent 
                                ? 'bg-purple-600 text-white hover:bg-purple-700 shadow-sm'
                                : 'bg-stone-100 hover:bg-purple-50 text-stone-600 hover:text-purple-700 border border-stone-200'
                            }`}
                          >
                            <Sparkles className="w-2.5 h-2.5" />
                            ROBE IN BOX
                          </button>
                        </div>
                      )}
                    </td>

                    <td className="px-4 py-3.5 text-right">
                      <p className="text-sm font-black text-stone-900">{fmt(p.amount)}</p>
                    </td>

                    <td className="px-4 py-3.5 text-center">
                      {p.scannedImageUrl ? (
                        <button onClick={() => setViewScan(p.scannedImageUrl!)} className="p-2 bg-emerald-50 text-emerald-600 rounded-xl hover:bg-emerald-100 transition-colors inline-flex">
                          <ImageIcon className="w-4 h-4" />
                        </button>
                      ) : (
                        <span className="text-stone-300 p-2 inline-flex"><FileText className="w-4 h-4" /></span>
                      )}
                    </td>

                    <td className="px-4 py-3.5 text-right">
                      <div className="flex items-center justify-end gap-1.5">
                        <button 
                          onClick={() => onUpdatePaymentStatus(p.id, 'CLEARED')}
                          title="Marquer comme encaissé (Payé)"
                          className="h-8 w-8 rounded-full bg-stone-100 text-stone-400 hover:bg-emerald-100 hover:text-emerald-600 flex items-center justify-center transition-colors"
                        >
                          <Check className="w-4 h-4" />
                        </button>
                        <button 
                          onClick={() => onUpdatePaymentStatus(p.id, 'REJECTED')}
                          title="Marquer comme rejeté / impayé"
                          className="h-8 w-8 rounded-full bg-stone-100 text-stone-400 hover:bg-red-100 hover:text-red-600 flex items-center justify-center transition-colors"
                        >
                          <XCircle className="w-4 h-4" />
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* Échéancier Prévisionnel */}
      <div className="bg-white border border-stone-100 rounded-3xl shadow-sm overflow-hidden">
        <div className="p-5 border-b border-stone-100 bg-stone-50/50">
          <h3 className="text-sm font-black text-stone-900 uppercase tracking-tight flex items-center gap-2">
            <CalendarIcon className="w-4 h-4 text-violet-600" />
            Échéancier Prévisionnel des Effets
          </h3>
          <p className="text-[10px] font-bold text-stone-500 uppercase tracking-widest mt-1">Encaissements prévus par période sur compte Attijariwafa Bank</p>
        </div>
        <div className="p-5">
          {forecastData.some(d => d.amount > 0) ? (
            <ResponsiveContainer width="100%" height={220}>
              <BarChart data={forecastData} margin={{ top: 5, right: 20, left: 10, bottom: 5 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f5f5f4" />
                <XAxis dataKey="name" tick={{ fontSize: 10, fontWeight: 700, fill: '#78716c' }} />
                <YAxis tick={{ fontSize: 10, fill: '#a8a29e' }} tickFormatter={(v: number) => `${(v/1000).toFixed(0)}k`} />
                <Tooltip formatter={(v: number) => [`${v.toLocaleString('fr-MA', {minimumFractionDigits: 2})} MAD`, 'Montant']} />
                <Bar dataKey="amount" fill="#8b5cf6" radius={[8, 8, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          ) : (
            <p className="text-center text-stone-400 text-xs font-bold uppercase tracking-widest py-8">Aucun effet en attente avec date d'échéance</p>
          )}
        </div>
      </div>

      {/* Modal Impression Bordereau de Remise Attijariwafa Bank */}
      <Dialog open={!!printRemiseCompany} onOpenChange={o => !o && setPrintRemiseCompany(null)}>
        <DialogContent className="sm:max-w-4xl bg-white p-0 overflow-hidden rounded-3xl max-h-[90vh] flex flex-col">
          <div className="p-4 border-b border-stone-200 flex justify-between items-center bg-stone-50">
            <div>
              <DialogTitle className="text-base font-black text-stone-900 uppercase">
                Bordereau de Remise Attijariwafa Bank · {printRemiseCompany}
              </DialogTitle>
              <p className="text-[10px] font-bold text-stone-500 uppercase tracking-widest">
                Prêt pour l'encaissement au guichet Attijariwafa Bank
              </p>
            </div>
            <Button
              onClick={() => window.print()}
              className="bg-emerald-600 hover:bg-emerald-700 text-white font-black text-xs uppercase rounded-xl gap-1.5 h-9"
            >
              <Printer className="w-4 h-4" />
              <span>Imprimer Bordereau</span>
            </Button>
          </div>

          <div className="p-8 overflow-y-auto print:p-0" id="bordereau-remise-print">
            <div className="border-2 border-stone-800 p-6 rounded-2xl space-y-6">
              {/* En-tête officiel bancaire */}
              <div className="flex justify-between items-start border-b-2 border-stone-800 pb-4">
                <div>
                  <h1 className="text-2xl font-black tracking-tighter text-amber-600 uppercase">
                    ATTIJARIWAFA BANK
                  </h1>
                  <p className="text-xs font-bold text-stone-600 tracking-wider">
                    BORDEREAU DE REMISE DE CHÈQUES & EFFETS DE COMMERCE
                  </p>
                </div>
                <div className="text-right text-xs">
                  <p className="font-bold text-stone-500">Date de remise :</p>
                  <p className="font-black text-stone-900 text-sm">{new Date().toLocaleDateString('fr-MA')}</p>
                </div>
              </div>

              {/* Infos Compte et Titulaire */}
              <div className="grid grid-cols-2 gap-4 bg-stone-50 p-4 rounded-xl border border-stone-200">
                <div>
                  <p className="text-[9px] font-black uppercase text-stone-400">Titulaire du compte :</p>
                  <p className="text-sm font-black text-stone-900">
                    {printRemiseCompany === 'LEBTEX' ? 'LEBTEX SARL AU' : 'ROBE IN BOX SARL'}
                  </p>
                  <p className="text-xs font-bold text-stone-600 mt-0.5">Société domiciliée au Maroc</p>
                </div>
                <div>
                  <p className="text-[9px] font-black uppercase text-stone-400">Banque Domiciliataire :</p>
                  <p className="text-sm font-black text-stone-900">Attijariwafa Bank</p>
                  <p className="text-xs font-bold text-stone-600 mt-0.5">Encaissement / Escompte</p>
                </div>
              </div>

              {/* Tableau des valeurs */}
              <table className="w-full text-left border-collapse border border-stone-300">
                <thead>
                  <tr className="bg-stone-100 text-stone-700 text-[10px] font-black uppercase">
                    <th className="border border-stone-300 p-2 w-10 text-center">N°</th>
                    <th className="border border-stone-300 p-2">Tireur (Client)</th>
                    <th className="border border-stone-300 p-2">Banque Tirée</th>
                    <th className="border border-stone-300 p-2">N° Valeur (Chèque / LCN)</th>
                    <th className="border border-stone-300 p-2">Échéance</th>
                    <th className="border border-stone-300 p-2 text-right">Montant MAD</th>
                  </tr>
                </thead>
                <tbody className="text-xs">
                  {remisePayments.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="p-6 text-center text-stone-400 font-bold uppercase">
                        Aucun effet affecté à {printRemiseCompany}
                      </td>
                    </tr>
                  ) : (
                    remisePayments.map((p, idx) => (
                      <tr key={p.id} className="border-b border-stone-200">
                        <td className="border border-stone-300 p-2 text-center font-mono font-bold">{idx + 1}</td>
                        <td className="border border-stone-300 p-2 font-bold text-stone-900">{getClientName(p.clientId)}</td>
                        <td className="border border-stone-300 p-2">{p.bankName || 'Attijariwafa Bank'}</td>
                        <td className="border border-stone-300 p-2 font-mono font-bold">{p.checkNumber || '—'}</td>
                        <td className="border border-stone-300 p-2 font-bold">{p.dueDate || 'À vue'}</td>
                        <td className="border border-stone-300 p-2 text-right font-black">{fmt(p.amount)}</td>
                      </tr>
                    ))
                  )}
                </tbody>
                <tfoot>
                  <tr className="bg-stone-100 font-black text-stone-900 text-sm">
                    <td colSpan={5} className="border border-stone-300 p-2.5 text-right uppercase">
                      Total Général ({remisePayments.length} valeurs) :
                    </td>
                    <td className="border border-stone-300 p-2.5 text-right text-base text-emerald-800 font-black">
                      {fmt(remiseTotal)} MAD
                    </td>
                  </tr>
                </tfoot>
              </table>

              {/* Zones de signatures */}
              <div className="grid grid-cols-2 gap-8 pt-4">
                <div className="border border-stone-300 rounded-xl p-4 min-h-[110px] flex flex-col justify-between">
                  <p className="text-[10px] font-black uppercase text-stone-500">Cachet & Signature de l'Émetteur :</p>
                  <p className="text-[10px] text-stone-400 italic">Pour le compte de {printRemiseCompany}</p>
                </div>
                <div className="border border-stone-300 rounded-xl p-4 min-h-[110px] flex flex-col justify-between">
                  <p className="text-[10px] font-black uppercase text-stone-500">Reçu et Visa Guichet Attijariwafa Bank :</p>
                  <p className="text-[10px] text-stone-400 italic">Date et cachet de l'agence réceptrice</p>
                </div>
              </div>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Modal View Scan */}
      <Dialog open={!!viewScan} onOpenChange={o => !o && setViewScan(null)}>
        <DialogContent className="sm:max-w-2xl bg-stone-900 border-none p-0 overflow-hidden rounded-3xl">
          <div className="p-4 border-b border-stone-800 flex justify-between items-center bg-black/50">
            <DialogTitle className="text-sm font-black text-white uppercase tracking-widest">
              Scan du Document
            </DialogTitle>
          </div>
          <div className="p-6 flex items-center justify-center bg-stone-900 min-h-[300px]">
            {viewScan && (
              <img src={viewScan} alt="Document Scan" className="max-w-full max-h-[70vh] rounded-xl object-contain shadow-2xl" />
            )}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
