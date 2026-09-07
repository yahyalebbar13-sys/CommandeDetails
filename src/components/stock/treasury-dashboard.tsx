"use client";

import React, { useMemo, useState } from 'react';
import { 
  Landmark, CreditCard, TrendingUp, AlertTriangle, CheckCircle2, XCircle, FileText, 
  Image as ImageIcon, Calendar as CalendarIcon, Check, Building2, Printer, Sparkles,
  ArrowRight, ShieldAlert, CheckCheck, HelpCircle, RefreshCw, History, Download,
  CheckSquare, Square, Eye, Search, Filter, Clock
} from 'lucide-react';
import { ClientPayment, Client, Invoice, CashingCompany, CheckRemittance, RemittanceStatus } from '@/lib/types';
import { Dialog, DialogContent, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import { exportCheckRemittancePDF } from '@/lib/pdf-export-reports';

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
  remittances?: CheckRemittance[];
  onUpdatePaymentStatus: (paymentId: string, status: 'PENDING' | 'CLEARED' | 'REJECTED') => Promise<void>;
  onAssignPaymentCompany?: (paymentId: string, company: CashingCompany) => Promise<void>;
  onCreateRemittance?: (company: CashingCompany, selectedPaymentIds: string[], notes?: string) => Promise<any>;
  onUpdateRemittanceStatus?: (remittanceId: string, status: RemittanceStatus) => Promise<void>;
}

export default function TreasuryDashboard({ 
  payments, 
  clients, 
  invoices, 
  remittances = [],
  onUpdatePaymentStatus,
  onAssignPaymentCompany,
  onCreateRemittance,
  onUpdateRemittanceStatus
}: TreasuryDashboardProps) {
  // Navigation entre Portefeuille et Historique
  const [activeTab, setActiveTab] = useState<'PORTFOLIO' | 'REMITTANCES'>('PORTFOLIO');

  const [viewScan, setViewScan] = useState<string | null>(null);
  const [companyFilter, setCompanyFilter] = useState<'ALL' | 'URGENT_7D' | 'LEBTEX' | 'ROBE IN BOX' | 'UNASSIGNED'>('ALL');
  const [assigningId, setAssigningId] = useState<string | null>(null);

  // Multi-sélection de chèques pour remise personnalisée
  const [selectedPaymentIds, setSelectedPaymentIds] = useState<string[]>([]);

  // Modale d'émission de bordereau
  const [remiseModalCompany, setRemiseModalCompany] = useState<CashingCompany | null>(null);
  const [remiseModalIncludedIds, setRemiseModalIncludedIds] = useState<string[]>([]);
  const [remiseModalNotes, setRemiseModalNotes] = useState<string>('');
  const [isSubmittingRemise, setIsSubmittingRemise] = useState(false);

  // Modale de détail d'un bordereau historique
  const [detailRemittance, setDetailRemittance] = useState<CheckRemittance | null>(null);

  // Filtres pour l'historique des remises
  const [historyFilterCompany, setHistoryFilterCompany] = useState<'ALL' | 'LEBTEX' | 'ROBE IN BOX'>('ALL');
  const [historyFilterStatus, setHistoryFilterStatus] = useState<'ALL' | 'REMIS' | 'ENCAISSE'>('ALL');
  const [historySearch, setHistorySearch] = useState('');

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

  // Liste filtrée selon l'onglet d'arbitrage
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

  // Échéancier prévisionnel
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

  // Statistiques de l'historique des remises
  const historyStats = useMemo(() => {
    const totalCount = remittances.length;
    const totalMAD = remittances.reduce((acc, r) => acc + (r.totalAmount || 0), 0);
    const pendingCount = remittances.filter(r => r.status === 'REMIS').length;
    const pendingMAD = remittances.filter(r => r.status === 'REMIS').reduce((acc, r) => acc + (r.totalAmount || 0), 0);
    const clearedCount = remittances.filter(r => r.status === 'ENCAISSE').length;
    const clearedMAD = remittances.filter(r => r.status === 'ENCAISSE').reduce((acc, r) => acc + (r.totalAmount || 0), 0);

    return { totalCount, totalMAD, pendingCount, pendingMAD, clearedCount, clearedMAD };
  }, [remittances]);

  // Remises filtrées
  const displayedRemittances = useMemo(() => {
    return remittances.filter(r => {
      if (historyFilterCompany !== 'ALL' && r.company !== historyFilterCompany) return false;
      if (historyFilterStatus !== 'ALL' && r.status !== historyFilterStatus) return false;
      if (historySearch.trim()) {
        const q = historySearch.toLowerCase();
        const refMatch = (r.reference || '').toLowerCase().includes(q);
        const compMatch = (r.company || '').toLowerCase().includes(q);
        const itemMatch = (r.items || []).some(it => 
          (it.clientName || '').toLowerCase().includes(q) || 
          (it.checkNumber || '').toLowerCase().includes(q) ||
          (it.bankName || '').toLowerCase().includes(q)
        );
        if (!refMatch && !compMatch && !itemMatch) return false;
      }
      return true;
    }).sort((a, b) => (b.remittedAt || '').localeCompare(a.remittedAt || ''));
  }, [remittances, historyFilterCompany, historyFilterStatus, historySearch]);

  const getClientName = (clientId: string) => {
    const c = clients.find(cl => cl.id === clientId);
    return c ? c.name : 'Client Inconnu';
  };

  const getInvoiceNumber = (invoiceId?: string) => {
    if (!invoiceId) return 'Acompte / Libre';
    const inv = invoices.find(i => i.id === invoiceId);
    return inv ? inv.invoiceNumber : 'Réf. Facture inconnue';
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

  // Ouvrir la modale d'émission de remise
  const openRemiseModal = (company: CashingCompany, preselectedIds?: string[]) => {
    setRemiseModalCompany(company);
    setRemiseModalNotes('');
    if (preselectedIds && preselectedIds.length > 0) {
      setRemiseModalIncludedIds(preselectedIds);
    } else {
      // Par défaut : tous les effets affectés à cette société et pas encore remis
      const ids = allPendingPayments
        .filter(p => p.cashingCompany === company && !p.remittanceId)
        .map(p => p.id);
      setRemiseModalIncludedIds(ids);
    }
  };

  // Calcul du montant total de la remise en cours d'émission
  const modalRemisePayments = useMemo(() => {
    if (!remiseModalCompany) return [];
    return allPendingPayments.filter(p => 
      p.cashingCompany === remiseModalCompany && 
      remiseModalIncludedIds.includes(p.id)
    );
  }, [remiseModalCompany, remiseModalIncludedIds, allPendingPayments]);

  const modalRemiseTotal = useMemo(() => {
    return modalRemisePayments.reduce((s, p) => s + (p.amount || 0), 0);
  }, [modalRemisePayments]);

  // Valider et émettre la remise
  const handleConfirmRemise = async () => {
    if (!remiseModalCompany || !onCreateRemittance) return;
    if (remiseModalIncludedIds.length === 0) return;

    try {
      setIsSubmittingRemise(true);
      await onCreateRemittance(remiseModalCompany, remiseModalIncludedIds, remiseModalNotes);
      setRemiseModalCompany(null);
      setSelectedPaymentIds([]);
      setActiveTab('REMITTANCES'); // Bascule automatique vers l'historique
    } catch (e) {
      console.error(e);
    } finally {
      setIsSubmittingRemise(false);
    }
  };

  // Toggle sélection chèques
  const toggleSelectPayment = (id: string) => {
    setSelectedPaymentIds(prev => 
      prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]
    );
  };

  const toggleSelectAllDisplayed = () => {
    if (selectedPaymentIds.length === displayedPayments.length) {
      setSelectedPaymentIds([]);
    } else {
      setSelectedPaymentIds(displayedPayments.map(p => p.id));
    }
  };

  return (
    <div className="p-6 space-y-6 max-w-7xl mx-auto pb-32">
      {/* Header avec onglets principaux */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-2xl font-black text-stone-900 uppercase tracking-tight flex items-center gap-2">
            <Landmark className="w-6 h-6 text-emerald-600" />
            Trésorerie & Banque Attijari
          </h2>
          <p className="text-[11px] font-bold text-stone-500 uppercase tracking-widest mt-1">
            Arbitrage LEBTEX & ROBE IN BOX · Remises en banque Attijariwafa · Historique des bordereaux
          </p>
        </div>

        {/* Navigation Onglets */}
        <div className="flex items-center gap-2 bg-stone-100 p-1.5 rounded-2xl border border-stone-200">
          <button
            onClick={() => setActiveTab('PORTFOLIO')}
            className={`flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-black uppercase transition-all ${
              activeTab === 'PORTFOLIO'
                ? 'bg-white text-stone-900 shadow-sm'
                : 'text-stone-500 hover:text-stone-900'
            }`}
          >
            <CreditCard className="w-4 h-4 text-emerald-600" />
            <span>Portefeuille & Arbitrage</span>
            {allPendingPayments.length > 0 && (
              <span className="bg-stone-200 text-stone-700 text-[10px] px-1.5 py-0.5 rounded-full font-bold ml-1">
                {allPendingPayments.length}
              </span>
            )}
          </button>

          <button
            onClick={() => setActiveTab('REMITTANCES')}
            className={`flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-black uppercase transition-all ${
              activeTab === 'REMITTANCES'
                ? 'bg-white text-stone-900 shadow-sm'
                : 'text-stone-500 hover:text-stone-900'
            }`}
          >
            <History className="w-4 h-4 text-amber-600" />
            <span>Historique des Remises</span>
            {remittances.length > 0 && (
              <span className="bg-amber-100 text-amber-800 text-[10px] px-1.5 py-0.5 rounded-full font-bold ml-1">
                {remittances.length}
              </span>
            )}
          </button>
        </div>
      </div>

      {/* ========================================================================= */}
      {/* VUE 1 : PORTEFEUILLE DES EFFETS & ARBITRAGE                             */}
      {/* ========================================================================= */}
      {activeTab === 'PORTFOLIO' && (
        <div className="space-y-6 animate-in fade-in duration-300">
          {/* Actions rapides d'émission de bordereau */}
          <div className="flex items-center justify-between gap-2 flex-wrap bg-white p-4 rounded-3xl border border-stone-200 shadow-sm">
            <div className="flex items-center gap-2">
              <p className="text-xs font-black uppercase text-stone-700 tracking-wider">
                🏦 Émettre Bordereau Attijariwafa Bank :
              </p>
            </div>
            <div className="flex items-center gap-2 flex-wrap">
              <Button
                variant="outline"
                size="sm"
                onClick={() => openRemiseModal('LEBTEX')}
                className="h-9 px-3 border-emerald-300 hover:border-emerald-500 bg-emerald-50/50 hover:bg-emerald-50 text-emerald-800 font-black text-xs rounded-xl flex items-center gap-1.5 shadow-sm"
              >
                <Building2 className="w-3.5 h-3.5 text-emerald-600" />
                <span>Remise LEBTEX ({stats.lebtexCount})</span>
                <span className="font-mono text-[11px] text-emerald-700 bg-white/80 px-1.5 py-0.5 rounded-lg border border-emerald-200">
                  {fmt(stats.lebtexTotal)} MAD
                </span>
              </Button>

              <Button
                variant="outline"
                size="sm"
                onClick={() => openRemiseModal('ROBE IN BOX')}
                className="h-9 px-3 border-purple-300 hover:border-purple-500 bg-purple-50/50 hover:bg-purple-50 text-purple-800 font-black text-xs rounded-xl flex items-center gap-1.5 shadow-sm"
              >
                <Sparkles className="w-3.5 h-3.5 text-purple-600" />
                <span>Remise ROBE IN BOX ({stats.robeCount})</span>
                <span className="font-mono text-[11px] text-purple-700 bg-white/80 px-1.5 py-0.5 rounded-lg border border-purple-200">
                  {fmt(stats.robeTotal)} MAD
                </span>
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
                    <div key={p.id} className="bg-white/90 backdrop-blur-sm p-4 rounded-2xl border border-amber-300 shadow-sm flex flex-col justify-between gap-3">
                      <div>
                        <div className="flex items-center justify-between">
                          <span className="text-[9px] font-black uppercase px-2 py-0.5 rounded bg-amber-100 text-amber-800 font-mono">
                            {p.method} · N° {p.checkNumber || '—'}
                          </span>
                          <span className={`text-[10px] font-black px-2 py-0.5 rounded-full ${
                            isOverdue ? 'bg-red-500 text-white animate-bounce' :
                            isToday ? 'bg-orange-500 text-white' :
                            'bg-amber-500 text-white'
                          }`}>
                            {isOverdue ? `Échu (+${Math.abs(days!)}j)` : isToday ? "Aujourd'hui !" : `J-${days}`}
                          </span>
                        </div>
                        <p className="text-xs font-black text-stone-900 mt-2 truncate">
                          {getClientName(p.clientId)}
                        </p>
                        <p className="text-[11px] font-bold text-stone-500 mt-0.5">
                          Tiré sur : <span className="text-stone-700">{p.bankName || 'Attijariwafa Bank'}</span>
                        </p>
                        <p className="text-sm font-black text-amber-950 mt-1">
                          {fmt(p.amount)} MAD
                        </p>
                      </div>

                      {/* Boutons d'arbitrage 1-clic */}
                      <div className="pt-2 border-t border-amber-100 flex items-center gap-2">
                        <button
                          onClick={() => handleAssign(p.id, 'LEBTEX')}
                          disabled={isAssigning}
                          className="flex-1 bg-emerald-600 hover:bg-emerald-700 active:scale-95 text-white py-1.5 px-2 rounded-xl text-[10px] font-black uppercase tracking-wider flex items-center justify-center gap-1 shadow-sm transition-all"
                        >
                          <Building2 className="w-3 h-3" />
                          <span>LEBTEX</span>
                        </button>
                        <button
                          onClick={() => handleAssign(p.id, 'ROBE IN BOX')}
                          disabled={isAssigning}
                          className="flex-1 bg-purple-600 hover:bg-purple-700 active:scale-95 text-white py-1.5 px-2 rounded-xl text-[10px] font-black uppercase tracking-wider flex items-center justify-center gap-1 shadow-sm transition-all"
                        >
                          <Sparkles className="w-3 h-3" />
                          <span>ROBE IN BOX</span>
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* KPI CARDS GLOBALES */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <div className="bg-white p-5 rounded-3xl border border-stone-200 shadow-sm flex items-center justify-between">
              <div>
                <p className="text-[10px] font-black text-stone-400 uppercase tracking-widest">Encaissé Direct</p>
                <p className="text-xl font-black text-emerald-800 mt-1">{fmt(stats.directCash)} <span className="text-xs">MAD</span></p>
                <p className="text-[10px] font-bold text-stone-400 mt-0.5">Cash / Virement</p>
              </div>
              <div className="w-10 h-10 rounded-2xl bg-emerald-50 text-emerald-600 flex items-center justify-center">
                <TrendingUp className="w-5 h-5" />
              </div>
            </div>

            <div className="bg-white p-5 rounded-3xl border border-stone-200 shadow-sm flex items-center justify-between">
              <div>
                <p className="text-[10px] font-black text-stone-400 uppercase tracking-widest">Portefeuille Effets</p>
                <p className="text-xl font-black text-blue-900 mt-1">{fmt(stats.pendingEffects)} <span className="text-xs">MAD</span></p>
                <p className="text-[10px] font-bold text-blue-600 mt-0.5">{allPendingPayments.length} effet(s) en attente</p>
              </div>
              <div className="w-10 h-10 rounded-2xl bg-blue-50 text-blue-600 flex items-center justify-center">
                <CreditCard className="w-5 h-5" />
              </div>
            </div>

            <div className="bg-white p-5 rounded-3xl border border-stone-200 shadow-sm flex items-center justify-between">
              <div>
                <p className="text-[10px] font-black text-stone-400 uppercase tracking-widest">Effets Encaissés</p>
                <p className="text-xl font-black text-stone-900 mt-1">{fmt(stats.clearedEffects)} <span className="text-xs">MAD</span></p>
                <p className="text-[10px] font-bold text-emerald-600 mt-0.5">Crédités en compte</p>
              </div>
              <div className="w-10 h-10 rounded-2xl bg-stone-100 text-stone-600 flex items-center justify-center">
                <CheckCircle2 className="w-5 h-5" />
              </div>
            </div>

            <div className="bg-white p-5 rounded-3xl border border-stone-200 shadow-sm flex items-center justify-between">
              <div>
                <p className="text-[10px] font-black text-stone-400 uppercase tracking-widest">Effets Rejetés</p>
                <p className="text-xl font-black text-rose-600 mt-1">{fmt(stats.rejectedEffects)} <span className="text-xs">MAD</span></p>
                <p className="text-[10px] font-bold text-rose-500 mt-0.5">Impayés réouverts</p>
              </div>
              <div className="w-10 h-10 rounded-2xl bg-rose-50 text-rose-600 flex items-center justify-center">
                <XCircle className="w-5 h-5" />
              </div>
            </div>
          </div>

          {/* Répartition Attijariwafa Bank (LEBTEX vs ROBE IN BOX) */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* Box LEBTEX */}
            <div className="bg-gradient-to-br from-emerald-900 via-stone-900 to-emerald-950 text-white p-6 rounded-3xl shadow-xl shadow-emerald-950/20 border border-emerald-800/40 relative overflow-hidden">
              <div className="relative z-10">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <div className="h-8 w-8 rounded-xl bg-emerald-500/20 text-emerald-400 flex items-center justify-center border border-emerald-500/30">
                      <Building2 className="w-4 h-4" />
                    </div>
                    <div>
                      <h4 className="text-xs font-black uppercase tracking-wider text-emerald-400">Compte Attijariwafa Bank</h4>
                      <p className="text-sm font-black text-white">LEBTEX SARL AU</p>
                    </div>
                  </div>
                  <span className="text-[10px] font-black uppercase px-2.5 py-1 bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 rounded-full">
                    {stats.lebtexCount} effet(s)
                  </span>
                </div>

                <div className="mt-5">
                  <p className="text-3xl font-black text-white tracking-tight">
                    {fmt(stats.lebtexTotal)} <span className="text-sm font-bold text-emerald-400">MAD</span>
                  </p>
                  <p className="text-xs text-stone-400 font-bold mt-1">
                    Total des effets en portefeuille affectés à LEBTEX
                  </p>
                </div>

                <div className="mt-5 pt-4 border-t border-white/10 flex items-center justify-between">
                  <Button
                    size="sm"
                    onClick={() => openRemiseModal('LEBTEX')}
                    className="bg-emerald-500 hover:bg-emerald-600 text-white font-black text-xs uppercase rounded-xl h-8 px-3 gap-1.5 shadow-md"
                  >
                    <Download className="w-3.5 h-3.5" />
                    <span>Déposer en Banque & Bordereau PDF</span>
                  </Button>
                  <button
                    onClick={() => setCompanyFilter('LEBTEX')}
                    className="text-[11px] font-bold text-emerald-300 hover:underline flex items-center gap-1"
                  >
                    Filtrer ces effets <ArrowRight className="w-3 h-3" />
                  </button>
                </div>
              </div>
            </div>

            {/* Box ROBE IN BOX */}
            <div className="bg-gradient-to-br from-purple-950 via-stone-900 to-purple-900 text-white p-6 rounded-3xl shadow-xl shadow-purple-950/20 border border-purple-800/40 relative overflow-hidden">
              <div className="relative z-10">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <div className="h-8 w-8 rounded-xl bg-purple-500/20 text-purple-400 flex items-center justify-center border border-purple-500/30">
                      <Sparkles className="w-4 h-4" />
                    </div>
                    <div>
                      <h4 className="text-xs font-black uppercase tracking-wider text-purple-400">Compte Attijariwafa Bank</h4>
                      <p className="text-sm font-black text-white">ROBE IN BOX SARL</p>
                    </div>
                  </div>
                  <span className="text-[10px] font-black uppercase px-2.5 py-1 bg-purple-500/20 text-purple-300 border border-purple-500/30 rounded-full">
                    {stats.robeCount} effet(s)
                  </span>
                </div>

                <div className="mt-5">
                  <p className="text-3xl font-black text-white tracking-tight">
                    {fmt(stats.robeTotal)} <span className="text-sm font-bold text-purple-400">MAD</span>
                  </p>
                  <p className="text-xs text-stone-400 font-bold mt-1">
                    Total des effets en portefeuille affectés à ROBE IN BOX
                  </p>
                </div>

                <div className="mt-5 pt-4 border-t border-white/10 flex items-center justify-between">
                  <Button
                    size="sm"
                    onClick={() => openRemiseModal('ROBE IN BOX')}
                    className="bg-purple-600 hover:bg-purple-700 text-white font-black text-xs uppercase rounded-xl h-8 px-3 gap-1.5 shadow-md"
                  >
                    <Download className="w-3.5 h-3.5" />
                    <span>Déposer en Banque & Bordereau PDF</span>
                  </Button>
                  <button
                    onClick={() => setCompanyFilter('ROBE IN BOX')}
                    className="text-[11px] font-bold text-purple-300 hover:underline flex items-center gap-1"
                  >
                    Filtrer ces effets <ArrowRight className="w-3 h-3" />
                  </button>
                </div>
              </div>
            </div>
          </div>

          {/* TABLEAU DU PORTEFEUILLE D'EFFETS */}
          <div className="bg-white rounded-3xl border border-stone-200 overflow-hidden shadow-sm">
            <div className="p-5 border-b border-stone-200 flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
              <div>
                <h3 className="text-base font-black text-stone-900 uppercase tracking-tight">
                  Portefeuille des Effets & Chèques en Attente
                </h3>
                <p className="text-[10px] font-bold text-stone-500 uppercase tracking-widest mt-0.5">
                  Affectez chaque chèque et LCN à la société LEBTEX ou ROBE IN BOX puis émettez le bordereau
                </p>
              </div>

              {/* Filtres par société */}
              <div className="flex items-center gap-1.5 flex-wrap bg-stone-100 p-1 rounded-2xl border border-stone-200">
                <button
                  onClick={() => setCompanyFilter('ALL')}
                  className={`px-3 py-1.5 rounded-xl text-[10px] font-black uppercase transition-all ${
                    companyFilter === 'ALL'
                      ? 'bg-white text-stone-900 shadow-sm'
                      : 'text-stone-500 hover:text-stone-900'
                  }`}
                >
                  Tous ({allPendingPayments.length})
                </button>

                {urgentUnassignedPayments.length > 0 && (
                  <button
                    onClick={() => setCompanyFilter('URGENT_7D')}
                    className={`px-3 py-1.5 rounded-xl text-[10px] font-black uppercase transition-all flex items-center gap-1 ${
                      companyFilter === 'URGENT_7D'
                        ? 'bg-amber-600 text-white shadow-sm'
                        : 'text-amber-700 bg-amber-100/60 hover:bg-amber-100'
                    }`}
                  >
                    <AlertTriangle className="w-3 h-3" />
                    <span>J-7 Urgent ({urgentUnassignedPayments.length})</span>
                  </button>
                )}

                <button
                  onClick={() => setCompanyFilter('LEBTEX')}
                  className={`px-3 py-1.5 rounded-xl text-[10px] font-black uppercase transition-all ${
                    companyFilter === 'LEBTEX'
                      ? 'bg-emerald-600 text-white shadow-sm'
                      : 'text-emerald-700 hover:bg-emerald-50'
                  }`}
                >
                  LEBTEX ({stats.lebtexCount})
                </button>

                <button
                  onClick={() => setCompanyFilter('ROBE IN BOX')}
                  className={`px-3 py-1.5 rounded-xl text-[10px] font-black uppercase transition-all ${
                    companyFilter === 'ROBE IN BOX'
                      ? 'bg-purple-600 text-white shadow-sm'
                      : 'text-purple-700 hover:bg-purple-50'
                  }`}
                >
                  ROBE IN BOX ({stats.robeCount})
                </button>

                <button
                  onClick={() => setCompanyFilter('UNASSIGNED')}
                  className={`px-3 py-1.5 rounded-xl text-[10px] font-black uppercase transition-all ${
                    companyFilter === 'UNASSIGNED'
                      ? 'bg-stone-800 text-white shadow-sm'
                      : 'text-stone-500 hover:text-stone-900'
                  }`}
                >
                  Non assignés
                </button>
              </div>
            </div>

            {/* Barre d'action multi-sélection */}
            {selectedPaymentIds.length > 0 && (
              <div className="bg-stone-900 text-white px-5 py-3 flex items-center justify-between gap-4 flex-wrap animate-in slide-in-from-top-2">
                <div className="flex items-center gap-2">
                  <CheckSquare className="w-4 h-4 text-emerald-400" />
                  <span className="text-xs font-black uppercase tracking-wider">
                    {selectedPaymentIds.length} chèque(s) sélectionné(s)
                  </span>
                  <span className="text-xs font-bold text-stone-400 font-mono ml-2">
                    ({fmt(allPendingPayments.filter(p => selectedPaymentIds.includes(p.id)).reduce((s, p) => s + p.amount, 0))} MAD)
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <Button
                    size="sm"
                    onClick={() => openRemiseModal('LEBTEX', selectedPaymentIds)}
                    className="bg-emerald-600 hover:bg-emerald-700 text-white font-black text-xs uppercase rounded-xl h-8 px-3 gap-1"
                  >
                    <Building2 className="w-3 h-3" />
                    Émettre Remise LEBTEX
                  </Button>
                  <Button
                    size="sm"
                    onClick={() => openRemiseModal('ROBE IN BOX', selectedPaymentIds)}
                    className="bg-purple-600 hover:bg-purple-700 text-white font-black text-xs uppercase rounded-xl h-8 px-3 gap-1"
                  >
                    <Sparkles className="w-3 h-3" />
                    Émettre Remise ROBE IN BOX
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setSelectedPaymentIds([])}
                    className="text-stone-400 hover:text-white h-8 text-xs font-bold"
                  >
                    Annuler
                  </Button>
                </div>
              </div>
            )}

            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="border-b border-stone-200 bg-stone-50/50 text-[10px] font-black uppercase text-stone-400 tracking-wider">
                    <th className="px-4 py-3 w-10 text-center">
                      <button onClick={toggleSelectAllDisplayed} title="Tout sélectionner">
                        {selectedPaymentIds.length === displayedPayments.length && displayedPayments.length > 0 ? (
                          <CheckSquare className="w-4 h-4 text-emerald-600" />
                        ) : (
                          <Square className="w-4 h-4 text-stone-400" />
                        )}
                      </button>
                    </th>
                    <th className="px-4 py-3">Type</th>
                    <th className="px-4 py-3">Client / Facture</th>
                    <th className="px-4 py-3">Banque & N°</th>
                    <th className="px-4 py-3">Échéance</th>
                    <th className="px-4 py-3">Société Attijari</th>
                    <th className="px-4 py-3">Bordereau / Dépôt</th>
                    <th className="px-4 py-3 text-right">Montant</th>
                    <th className="px-4 py-3 text-center">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-stone-100 text-xs">
                  {displayedPayments.length === 0 ? (
                    <tr>
                      <td colSpan={9} className="px-4 py-12 text-center text-stone-400 font-bold uppercase tracking-widest text-xs">
                        Aucun effet dans cette sélection
                      </td>
                    </tr>
                  ) : (
                    displayedPayments.map(p => {
                      const days = getDaysRemaining(p.dueDate);
                      const isOverdue = days !== null && days < 0;
                      const isUrgent = days !== null && days <= 7;
                      const isAssigning = assigningId === p.id;
                      const isSelected = selectedPaymentIds.includes(p.id);

                      return (
                        <tr key={p.id} className={`hover:bg-stone-50/60 transition-colors ${isSelected ? 'bg-emerald-50/30' : ''}`}>
                          <td className="px-4 py-3.5 text-center">
                            <button onClick={() => toggleSelectPayment(p.id)}>
                              {isSelected ? (
                                <CheckSquare className="w-4 h-4 text-emerald-600" />
                              ) : (
                                <Square className="w-4 h-4 text-stone-300 hover:text-stone-500" />
                              )}
                            </button>
                          </td>
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

                          {/* Arbitrage Société */}
                          <td className="px-4 py-3.5">
                            {p.cashingCompany === 'LEBTEX' ? (
                              <div className="flex items-center gap-1.5">
                                <span className="inline-flex items-center gap-1 bg-emerald-50 text-emerald-700 border border-emerald-200 font-black text-[10px] uppercase px-2 py-1 rounded-lg">
                                  <Building2 className="w-3 h-3" />
                                  LEBTEX
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
                                  ROBE IN BOX
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
                                  className="h-7 px-2 rounded-lg font-black text-[9px] uppercase bg-emerald-600 text-white hover:bg-emerald-700 shadow-sm flex items-center gap-1"
                                >
                                  <Building2 className="w-2.5 h-2.5" />
                                  LEBTEX
                                </button>
                                <button
                                  onClick={() => handleAssign(p.id, 'ROBE IN BOX')}
                                  disabled={isAssigning}
                                  className="h-7 px-2 rounded-lg font-black text-[9px] uppercase bg-purple-600 text-white hover:bg-purple-700 shadow-sm flex items-center gap-1"
                                >
                                  <Sparkles className="w-2.5 h-2.5" />
                                  ROBE IN BOX
                                </button>
                              </div>
                            )}
                          </td>

                          {/* Statut de Remise */}
                          <td className="px-4 py-3.5">
                            {p.remittanceRef ? (
                              <span className="inline-flex items-center gap-1 text-[9px] font-black text-amber-800 bg-amber-50 border border-amber-200 px-2 py-0.5 rounded-lg">
                                <FileText className="w-3 h-3" />
                                {p.remittanceRef}
                              </span>
                            ) : (
                              <span className="text-[10px] text-stone-400 font-bold">En portefeuille</span>
                            )}
                          </td>

                          <td className="px-4 py-3.5 text-right font-black text-stone-900">
                            {fmt(p.amount)} MAD
                          </td>

                          {/* Actions */}
                          <td className="px-4 py-3.5">
                            <div className="flex items-center justify-center gap-1">
                              {p.scannedImageUrl && (
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  className="h-7 w-7 text-stone-500 hover:text-stone-900 rounded-lg"
                                  onClick={() => setViewScan(p.scannedImageUrl!)}
                                  title="Voir Scan"
                                >
                                  <ImageIcon className="w-3.5 h-3.5" />
                                </Button>
                              )}

                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-7 w-7 text-emerald-600 hover:text-emerald-700 hover:bg-emerald-50 rounded-lg"
                                onClick={() => onUpdatePaymentStatus(p.id, 'CLEARED')}
                                title="Marquer comme Encaissé"
                              >
                                <Check className="w-3.5 h-3.5" />
                              </Button>

                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-7 w-7 text-rose-500 hover:text-rose-700 hover:bg-rose-50 rounded-lg"
                                onClick={() => onUpdatePaymentStatus(p.id, 'REJECTED')}
                                title="Déclarer Impayé"
                              >
                                <XCircle className="w-3.5 h-3.5" />
                              </Button>
                            </div>
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          </div>

          {/* ÉCHÉANCIER PRÉVISIONNEL */}
          <div className="bg-white p-6 rounded-3xl border border-stone-200 shadow-sm">
            <h3 className="text-base font-black text-stone-900 uppercase tracking-tight">
              Échéancier Prévisionnel des Encaissements
            </h3>
            <p className="text-[10px] font-bold text-stone-500 uppercase tracking-widest mt-0.5 mb-6">
              Volumes d'effets attendus par période
            </p>

            <div className="h-64 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={forecastData} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e7e5e4" />
                  <XAxis dataKey="name" tick={{ fontSize: 11, fontWeight: 700, fill: '#78716c' }} axisLine={false} tickLine={false} />
                  <YAxis tick={{ fontSize: 10, fontWeight: 700, fill: '#a8a29e' }} axisLine={false} tickLine={false} tickFormatter={v => `${(v/1000).toFixed(0)}k`} />
                  <Tooltip
                    formatter={(value: any) => [`${fmt(Number(value))} MAD`, 'Montant Attendu']}
                    contentStyle={{ borderRadius: '16px', border: '1px solid #e7e5e4', fontWeight: 800, fontSize: '12px' }}
                  />
                  <Bar dataKey="amount" fill="#059669" radius={[8, 8, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* VUE 2 : HISTORIQUE DES REMISES EN BANQUE                                 */}
      {/* ========================================================================= */}
      {activeTab === 'REMITTANCES' && (
        <div className="space-y-6 animate-in fade-in duration-300">
          {/* KPI CARDS HISTORIQUE */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <div className="bg-white p-5 rounded-3xl border border-stone-200 shadow-sm">
              <p className="text-[10px] font-black text-stone-400 uppercase tracking-widest">Total Bordereaux</p>
              <p className="text-2xl font-black text-stone-900 mt-1">{historyStats.totalCount}</p>
              <p className="text-[10px] font-bold text-stone-500 mt-0.5">Bordereaux émis</p>
            </div>

            <div className="bg-white p-5 rounded-3xl border border-stone-200 shadow-sm">
              <p className="text-[10px] font-black text-stone-400 uppercase tracking-widest">Montant Total Remis</p>
              <p className="text-2xl font-black text-amber-700 mt-1">{fmt(historyStats.totalMAD)} <span className="text-xs">MAD</span></p>
              <p className="text-[10px] font-bold text-stone-500 mt-0.5">Valeurs déposées au guichet</p>
            </div>

            <div className="bg-white p-5 rounded-3xl border border-stone-200 shadow-sm">
              <p className="text-[10px] font-black text-stone-400 uppercase tracking-widest">En Cours d'Encaissement</p>
              <p className="text-2xl font-black text-orange-600 mt-1">{fmt(historyStats.pendingMAD)} <span className="text-xs">MAD</span></p>
              <p className="text-[10px] font-bold text-orange-600 mt-0.5">{historyStats.pendingCount} bordereau(x) en cours</p>
            </div>

            <div className="bg-white p-5 rounded-3xl border border-stone-200 shadow-sm">
              <p className="text-[10px] font-black text-stone-400 uppercase tracking-widest">Totalement Encaissé</p>
              <p className="text-2xl font-black text-emerald-700 mt-1">{fmt(historyStats.clearedMAD)} <span className="text-xs">MAD</span></p>
              <p className="text-[10px] font-bold text-emerald-600 mt-0.5">{historyStats.clearedCount} bordereau(x) soldés</p>
            </div>
          </div>

          {/* TABLEAU DES REMISES PASSÉES */}
          <div className="bg-white rounded-3xl border border-stone-200 overflow-hidden shadow-sm">
            <div className="p-5 border-b border-stone-200 flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
              <div>
                <h3 className="text-base font-black text-stone-900 uppercase tracking-tight flex items-center gap-2">
                  <span>Historique des Bordereaux de Remise Attijariwafa Bank</span>
                  <span className="bg-amber-100 text-amber-800 text-[10px] px-2 py-0.5 rounded-full font-black">
                    {displayedRemittances.length} bordereaux
                  </span>
                </h3>
                <p className="text-[10px] font-bold text-stone-500 uppercase tracking-widest mt-0.5">
                  Consultez, réimprimez ou téléchargez les bordereaux PDF de remise à tout moment
                </p>
              </div>

              {/* Filtres de recherche */}
              <div className="flex items-center gap-2 flex-wrap w-full md:w-auto">
                <div className="relative flex-1 md:w-56">
                  <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-stone-400" />
                  <Input
                    placeholder="Recherche (Réf, Client, N°)..."
                    value={historySearch}
                    onChange={e => setHistorySearch(e.target.value)}
                    className="h-9 pl-9 pr-3 text-xs rounded-xl bg-stone-50 border-stone-200"
                  />
                </div>

                <div className="flex items-center gap-1 bg-stone-100 p-1 rounded-xl border border-stone-200">
                  <button
                    onClick={() => setHistoryFilterCompany('ALL')}
                    className={`px-2.5 py-1 rounded-lg text-[10px] font-black uppercase ${
                      historyFilterCompany === 'ALL' ? 'bg-white text-stone-900 shadow-sm' : 'text-stone-500'
                    }`}
                  >
                    Toutes
                  </button>
                  <button
                    onClick={() => setHistoryFilterCompany('LEBTEX')}
                    className={`px-2.5 py-1 rounded-lg text-[10px] font-black uppercase ${
                      historyFilterCompany === 'LEBTEX' ? 'bg-emerald-600 text-white shadow-sm' : 'text-emerald-700'
                    }`}
                  >
                    LEBTEX
                  </button>
                  <button
                    onClick={() => setHistoryFilterCompany('ROBE IN BOX')}
                    className={`px-2.5 py-1 rounded-lg text-[10px] font-black uppercase ${
                      historyFilterCompany === 'ROBE IN BOX' ? 'bg-purple-600 text-white shadow-sm' : 'text-purple-700'
                    }`}
                  >
                    ROBE IN BOX
                  </button>
                </div>
              </div>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="border-b border-stone-200 bg-stone-50/50 text-[10px] font-black uppercase text-stone-400 tracking-wider">
                    <th className="px-4 py-3">Date</th>
                    <th className="px-4 py-3">Réf. Bordereau</th>
                    <th className="px-4 py-3">Société / Compte</th>
                    <th className="px-4 py-3 text-center">Nbre Chèques</th>
                    <th className="px-4 py-3 text-right">Montant Total</th>
                    <th className="px-4 py-3 text-center">Statut</th>
                    <th className="px-4 py-3 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-stone-100 text-xs">
                  {displayedRemittances.length === 0 ? (
                    <tr>
                      <td colSpan={7} className="px-4 py-16 text-center text-stone-400 font-bold uppercase tracking-widest text-xs">
                        Aucun bordereau de remise enregistré
                      </td>
                    </tr>
                  ) : (
                    displayedRemittances.map(rem => {
                      const isLebtex = rem.company === 'LEBTEX';
                      const isCleared = rem.status === 'ENCAISSE';

                      return (
                        <tr key={rem.id} className="hover:bg-stone-50/60 transition-colors">
                          <td className="px-4 py-3.5 font-mono text-stone-600 font-bold">
                            {rem.remittedAt ? new Date(rem.remittedAt).toLocaleDateString('fr-MA') : '—'}
                          </td>
                          <td className="px-4 py-3.5">
                            <span className="font-mono font-black text-stone-900 bg-stone-100 px-2 py-1 rounded-lg border border-stone-200">
                              {rem.reference}
                            </span>
                          </td>
                          <td className="px-4 py-3.5">
                            <span className={`inline-flex items-center gap-1 font-black text-[10px] uppercase px-2.5 py-1 rounded-xl border ${
                              isLebtex 
                                ? 'bg-emerald-50 text-emerald-700 border-emerald-200' 
                                : 'bg-purple-50 text-purple-700 border-purple-200'
                            }`}>
                              {isLebtex ? <Building2 className="w-3 h-3" /> : <Sparkles className="w-3 h-3" />}
                              {rem.company} (Attijari)
                            </span>
                          </td>
                          <td className="px-4 py-3.5 text-center font-bold">
                            <span className="bg-stone-100 text-stone-800 px-2 py-0.5 rounded-full text-[11px]">
                              {rem.checkCount} chèque(s)
                            </span>
                          </td>
                          <td className="px-4 py-3.5 text-right font-black text-stone-900 text-sm">
                            {fmt(rem.totalAmount)} MAD
                          </td>
                          <td className="px-4 py-3.5 text-center">
                            {isCleared ? (
                              <span className="inline-flex items-center gap-1 bg-emerald-100 text-emerald-800 text-[10px] font-black uppercase px-2 py-0.5 rounded-full">
                                <CheckCircle2 className="w-3 h-3" />
                                Encaissé
                              </span>
                            ) : (
                              <span className="inline-flex items-center gap-1 bg-amber-100 text-amber-800 text-[10px] font-black uppercase px-2 py-0.5 rounded-full">
                                <Clock className="w-3 h-3" />
                                Déposé en banque
                              </span>
                            )}
                          </td>
                          <td className="px-4 py-3.5 text-right">
                            <div className="flex items-center justify-end gap-1.5">
                              {/* Re-télécharger PDF */}
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={() => exportCheckRemittancePDF(rem)}
                                className="h-8 px-2.5 rounded-xl border-stone-200 hover:border-emerald-500 hover:bg-emerald-50 text-stone-700 hover:text-emerald-800 font-black text-xs gap-1 shadow-sm"
                                title="Télécharger le Bordereau PDF officiel"
                              >
                                <Download className="w-3.5 h-3.5 text-emerald-600" />
                                <span className="hidden sm:inline">PDF</span>
                              </Button>

                              {/* Détail */}
                              <Button
                                size="sm"
                                variant="ghost"
                                onClick={() => setDetailRemittance(rem)}
                                className="h-8 px-2 rounded-xl text-stone-600 hover:text-stone-900 hover:bg-stone-100 text-xs font-bold gap-1"
                                title="Voir la liste des chèques inclus"
                              >
                                <Eye className="w-3.5 h-3.5" />
                                <span className="hidden sm:inline">Détail</span>
                              </Button>

                              {/* Valider encaissement global */}
                              {!isCleared && onUpdateRemittanceStatus && (
                                <Button
                                  size="sm"
                                  onClick={() => onUpdateRemittanceStatus(rem.id, 'ENCAISSE')}
                                  className="h-8 px-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-black text-[10px] uppercase shadow-sm"
                                  title="Marquer comme totalement encaissé en banque"
                                >
                                  <Check className="w-3 h-3" />
                                  <span>Encaisser</span>
                                </Button>
                              )}
                            </div>
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* MODALE D'ÉMISSION DU BORDEREAU DE REMISE                                  */}
      {/* ========================================================================= */}
      <Dialog open={!!remiseModalCompany} onOpenChange={o => !o && setRemiseModalCompany(null)}>
        <DialogContent className="sm:max-w-3xl bg-white p-0 overflow-hidden rounded-3xl max-h-[92vh] flex flex-col">
          <div className="p-5 border-b border-stone-200 bg-stone-50 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className={`w-10 h-10 rounded-2xl flex items-center justify-center text-white shadow-md ${
                remiseModalCompany === 'LEBTEX' ? 'bg-emerald-600' : 'bg-purple-600'
              }`}>
                {remiseModalCompany === 'LEBTEX' ? <Building2 className="w-5 h-5" /> : <Sparkles className="w-5 h-5" />}
              </div>
              <div>
                <DialogTitle className="text-base font-black text-stone-900 uppercase">
                  Émission Bordereau Attijariwafa Bank · {remiseModalCompany}
                </DialogTitle>
                <DialogDescription className="text-xs font-bold text-stone-500">
                  Sélectionnez les valeurs à déposer au guichet bancaire pour générer le bordereau PDF officiel
                </DialogDescription>
              </div>
            </div>
          </div>

          <div className="p-6 overflow-y-auto space-y-4">
            {/* Infos Société & Compte */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 p-4 rounded-2xl bg-stone-50 border border-stone-200 text-xs">
              <div>
                <p className="text-[10px] font-black uppercase text-stone-400">Titulaire (Remettant) :</p>
                <p className="text-sm font-black text-stone-900 mt-0.5">
                  {remiseModalCompany === 'LEBTEX' ? 'LEBTEX SARL AU' : 'ROBE IN BOX SARL'}
                </p>
                <p className="text-[11px] font-bold text-stone-500">Compte Commercial Attijariwafa Bank</p>
              </div>
              <div>
                <p className="text-[10px] font-black uppercase text-stone-400">Date de Remise :</p>
                <p className="text-sm font-black text-stone-900 mt-0.5">{new Date().toLocaleDateString('fr-MA')}</p>
                <p className="text-[11px] font-bold text-stone-500">Agence Casablanca</p>
              </div>
            </div>

            {/* Note / Agence facultative */}
            <div>
              <label className="text-xs font-black uppercase text-stone-700 tracking-wider block mb-1.5">
                Note / Référence Agence (Facultatif) :
              </label>
              <Input
                placeholder="Ex: Agence Zerktouni · Dépôt par coursier"
                value={remiseModalNotes}
                onChange={e => setRemiseModalNotes(e.target.value)}
                className="h-9 text-xs rounded-xl bg-stone-50 border-stone-200"
              />
            </div>

            {/* Tableau des chèques à inclure */}
            <div>
              <p className="text-xs font-black uppercase text-stone-700 tracking-wider mb-2">
                Chèques & Effets inclus dans ce bordereau :
              </p>

              <div className="border border-stone-200 rounded-2xl overflow-hidden max-h-60 overflow-y-auto">
                <table className="w-full text-left text-xs">
                  <thead className="bg-stone-100 text-[10px] font-black uppercase text-stone-600 border-b border-stone-200">
                    <tr>
                      <th className="p-2.5 w-10 text-center">Inclus</th>
                      <th className="p-2.5">N° Valeur</th>
                      <th className="p-2.5">Tireur (Client)</th>
                      <th className="p-2.5">Banque</th>
                      <th className="p-2.5">Échéance</th>
                      <th className="p-2.5 text-right">Montant</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-stone-100">
                    {allPendingPayments.filter(p => p.cashingCompany === remiseModalCompany).length === 0 ? (
                      <tr>
                        <td colSpan={6} className="p-6 text-center text-stone-400 font-bold uppercase">
                          Aucun effet affecté à {remiseModalCompany}
                        </td>
                      </tr>
                    ) : (
                      allPendingPayments
                        .filter(p => p.cashingCompany === remiseModalCompany)
                        .map(p => {
                          const isChecked = remiseModalIncludedIds.includes(p.id);

                          return (
                            <tr key={p.id} className={isChecked ? 'bg-emerald-50/20' : 'opacity-40'}>
                              <td className="p-2.5 text-center">
                                <input
                                  type="checkbox"
                                  checked={isChecked}
                                  onChange={() => {
                                    setRemiseModalIncludedIds(prev => 
                                      prev.includes(p.id) ? prev.filter(x => x !== p.id) : [...prev, p.id]
                                    );
                                  }}
                                  className="w-4 h-4 rounded text-emerald-600"
                                />
                              </td>
                              <td className="p-2.5 font-mono font-bold">{p.checkNumber || '—'}</td>
                              <td className="p-2.5 font-bold text-stone-900">{getClientName(p.clientId)}</td>
                              <td className="p-2.5">{p.bankName || 'Attijariwafa Bank'}</td>
                              <td className="p-2.5 font-bold">{p.dueDate || 'À vue'}</td>
                              <td className="p-2.5 text-right font-black">{fmt(p.amount)} MAD</td>
                            </tr>
                          );
                        })
                    )}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Total général */}
            <div className="p-4 rounded-2xl bg-amber-50 border border-amber-200 flex items-center justify-between">
              <div>
                <p className="text-xs font-black uppercase text-amber-900 tracking-tight">
                  Total Général à déposer ({modalRemisePayments.length} valeurs) :
                </p>
                <p className="text-[10px] font-bold text-amber-700">
                  Prêt pour l'encaissement et la signature
                </p>
              </div>
              <p className="text-xl font-black text-amber-950 font-mono">
                {fmt(modalRemiseTotal)} MAD
              </p>
            </div>
          </div>

          <DialogFooter className="p-4 border-t border-stone-200 bg-stone-50 flex justify-between items-center">
            <Button
              variant="outline"
              onClick={() => setRemiseModalCompany(null)}
              className="rounded-xl border-stone-200 text-xs font-bold"
            >
              Annuler
            </Button>

            <Button
              onClick={handleConfirmRemise}
              disabled={isSubmittingRemise || modalRemisePayments.length === 0}
              className={`rounded-xl text-white font-black text-xs uppercase px-5 h-10 shadow-md flex items-center gap-2 ${
                remiseModalCompany === 'LEBTEX' ? 'bg-emerald-600 hover:bg-emerald-700' : 'bg-purple-600 hover:bg-purple-700'
              }`}
            >
              <Download className="w-4 h-4" />
              <span>Valider le Dépôt & Télécharger le Bordereau PDF</span>
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ========================================================================= */}
      {/* MODALE DE DÉTAIL D'UN BORDEREAU DE L'HISTORIQUE                           */}
      {/* ========================================================================= */}
      <Dialog open={!!detailRemittance} onOpenChange={o => !o && setDetailRemittance(null)}>
        <DialogContent className="sm:max-w-3xl bg-white p-0 overflow-hidden rounded-3xl max-h-[90vh] flex flex-col">
          {detailRemittance && (
            <>
              <div className="p-5 border-b border-stone-200 bg-stone-50 flex items-center justify-between">
                <div>
                  <DialogTitle className="text-base font-black text-stone-900 uppercase">
                    Bordereau N° {detailRemittance.reference}
                  </DialogTitle>
                  <p className="text-xs font-bold text-stone-500">
                    Société : {detailRemittance.company} · Déposé le {new Date(detailRemittance.remittedAt).toLocaleDateString('fr-MA')}
                  </p>
                </div>
                <Button
                  size="sm"
                  onClick={() => exportCheckRemittancePDF(detailRemittance)}
                  className="bg-emerald-600 hover:bg-emerald-700 text-white font-black text-xs uppercase rounded-xl gap-1.5 h-9"
                >
                  <Download className="w-4 h-4" />
                  <span>Télécharger PDF</span>
                </Button>
              </div>

              <div className="p-6 overflow-y-auto space-y-4">
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 p-4 rounded-2xl bg-stone-50 border border-stone-200 text-xs">
                  <div>
                    <p className="text-[10px] font-black uppercase text-stone-400">Banque :</p>
                    <p className="font-bold text-stone-900">Attijariwafa Bank</p>
                  </div>
                  <div>
                    <p className="text-[10px] font-black uppercase text-stone-400">Valeurs :</p>
                    <p className="font-bold text-stone-900">{detailRemittance.checkCount} chèque(s)</p>
                  </div>
                  <div>
                    <p className="text-[10px] font-black uppercase text-stone-400">Montant Total :</p>
                    <p className="font-black text-emerald-800">{fmt(detailRemittance.totalAmount)} MAD</p>
                  </div>
                  <div>
                    <p className="text-[10px] font-black uppercase text-stone-400">Statut :</p>
                    <p className="font-bold text-stone-900">
                      {detailRemittance.status === 'ENCAISSE' ? '✅ Encaissé en compte' : '🟡 Déposé en banque'}
                    </p>
                  </div>
                </div>

                {detailRemittance.notes && (
                  <p className="text-xs bg-amber-50 p-3 rounded-xl border border-amber-200 text-amber-900 font-bold">
                    📝 Note : {detailRemittance.notes}
                  </p>
                )}

                <div className="border border-stone-200 rounded-2xl overflow-hidden">
                  <table className="w-full text-left text-xs">
                    <thead className="bg-stone-100 text-[10px] font-black uppercase text-stone-600 border-b border-stone-200">
                      <tr>
                        <th className="p-2.5 w-10 text-center">N°</th>
                        <th className="p-2.5">N° Valeur</th>
                        <th className="p-2.5">Tireur (Client)</th>
                        <th className="p-2.5">Banque Tirée</th>
                        <th className="p-2.5">Échéance</th>
                        <th className="p-2.5 text-right">Montant</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-stone-100">
                      {(detailRemittance.items || []).map((it, idx) => (
                        <tr key={idx}>
                          <td className="p-2.5 text-center font-mono font-bold text-stone-400">{idx + 1}</td>
                          <td className="p-2.5 font-mono font-bold text-stone-800">{it.checkNumber || '—'}</td>
                          <td className="p-2.5 font-bold text-stone-900">{it.clientName}</td>
                          <td className="p-2.5 text-stone-600">{it.bankName || 'Attijariwafa Bank'}</td>
                          <td className="p-2.5 font-bold text-stone-600">{it.dueDate || 'À vue'}</td>
                          <td className="p-2.5 text-right font-black text-stone-900">{fmt(it.amount)} MAD</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              <DialogFooter className="p-4 border-t border-stone-200 bg-stone-50 flex justify-between items-center">
                <Button
                  variant="outline"
                  onClick={() => setDetailRemittance(null)}
                  className="rounded-xl border-stone-200 text-xs font-bold"
                >
                  Fermer
                </Button>

                {detailRemittance.status !== 'ENCAISSE' && onUpdateRemittanceStatus && (
                  <Button
                    onClick={() => {
                      onUpdateRemittanceStatus(detailRemittance.id, 'ENCAISSE');
                      setDetailRemittance(prev => prev ? { ...prev, status: 'ENCAISSE' } : null);
                    }}
                    className="bg-emerald-600 hover:bg-emerald-700 text-white font-black text-xs uppercase rounded-xl h-9 px-4 gap-1.5"
                  >
                    <Check className="w-4 h-4" />
                    <span>Valider l'Encaissement de Tout le Bordereau</span>
                  </Button>
                )}
              </DialogFooter>
            </>
          )}
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
