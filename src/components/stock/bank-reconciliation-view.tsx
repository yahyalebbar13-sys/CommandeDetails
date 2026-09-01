"use client";

import React, { useState, useMemo, useCallback, useRef } from 'react';
import {
  Landmark, Upload, CheckCircle2, XCircle, Search,
  ArrowLeftRight, FileSpreadsheet, Link2, Unlink, AlertTriangle,
  ChevronDown, Trash2,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import type { ClientPayment, Client, BankTransaction, BankReconciliationStatus } from '@/lib/types';
import * as XLSX from 'xlsx';

const fmt = (n: number) => n.toLocaleString('fr-MA', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

// ── Banques marocaines courantes ──
const BANKS = [
  'Attijariwafa Bank', 'BMCE Bank (BOA)', 'Banque Populaire (BCP)',
  'BMCI', 'Société Générale Maroc', 'CIH Bank', 'Crédit du Maroc',
  'Al Barid Bank', 'CFG Bank', 'Autre',
];

interface BankReconciliationViewProps {
  payments: ClientPayment[];
  clients: Client[];
}

export default function BankReconciliationView({ payments, clients }: BankReconciliationViewProps) {
  // ── State ──
  const [bankTransactions, setBankTransactions] = useState<BankTransaction[]>([]);
  const [selectedBank, setSelectedBank] = useState('');
  const [period, setPeriod] = useState(() => new Date().toISOString().substring(0, 7));
  const [search, setSearch] = useState('');
  const [activeTab, setActiveTab] = useState<'all' | 'matched' | 'unmatched_bank' | 'unmatched_internal'>('all');
  const [importModalOpen, setImportModalOpen] = useState(false);
  const [matchModal, setMatchModal] = useState<{ open: boolean; transaction?: BankTransaction }>({ open: false });
  const [matchSearch, setMatchSearch] = useState('');
  const fileInputRef = useRef<HTMLInputElement>(null);

  // ── Paiements internes filtrés par période ──
  const internalPayments = useMemo(() => {
    return payments.filter(p => {
      if (!period) return true;
      return p.date?.startsWith(period);
    });
  }, [payments, period]);

  // ── Paiements non-rapprochés (pas liés à une transaction bancaire) ──
  const matchedPaymentIds = useMemo(() => {
    const set = new Set<string>();
    bankTransactions.forEach(t => {
      if (t.matchedPaymentId) set.add(t.matchedPaymentId);
    });
    return set;
  }, [bankTransactions]);

  const unmatchedInternalPayments = useMemo(() => {
    return internalPayments.filter(p => !matchedPaymentIds.has(p.id));
  }, [internalPayments, matchedPaymentIds]);

  // ── Statistiques ──
  const stats = useMemo(() => {
    const totalBank = bankTransactions.reduce((s, t) => s + t.credit, 0);
    const totalInternal = internalPayments.reduce((s, p) => s + p.amount, 0);
    const matched = bankTransactions.filter(t => t.status === 'MATCHED').length;
    const unmatchedBank = bankTransactions.filter(t => t.status === 'UNMATCHED_BANK').length;
    const unmatchedInternal = unmatchedInternalPayments.length;
    const ecart = totalBank - totalInternal;
    return { totalBank, totalInternal, matched, unmatchedBank, unmatchedInternal, ecart };
  }, [bankTransactions, internalPayments, unmatchedInternalPayments]);

  // ── Import Excel/CSV du relevé bancaire ──
  const handleFileImport = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (evt) => {
      try {
        const data = evt.target?.result;
        const workbook = XLSX.read(data, { type: 'array' });
        const sheetName = workbook.SheetNames[0];
        const worksheet = workbook.Sheets[sheetName];
        const jsonData: any[] = XLSX.utils.sheet_to_json(worksheet, { raw: false });

        console.log("Données importées :", jsonData);

        // Mapper les colonnes (détection ultra-robuste pour Attijariwafa et autres banques)
        const transactions: BankTransaction[] = jsonData.map((row, idx) => {
          let dateVal = '';
          let labelVal = '';
          let refVal = '';
          let creditVal = 0;
          let debitVal = 0;
          let montantVal = 0;

          // Parcourir toutes les colonnes pour trouver les correspondances, même avec de l'arabe ou des espaces
          Object.keys(row).forEach(key => {
            const k = key.toUpperCase().normalize("NFD").replace(/[\u0300-\u036f]/g, ""); // majuscule sans accent
            const val = row[key];
            if (!val) return;
            
            if (k.includes('DATE') || k.includes('تاريخ')) dateVal = dateVal || String(val);
            else if (k.includes('LIBELLE') || k.includes('OPERATION') || k.includes('DESIGNATION') || k.includes('عرف')) labelVal = labelVal || String(val);
            else if (k.includes('REFERENCE') || k.includes('REF')) refVal = refVal || String(val);
            else if (k.includes('CREDIT') || k.includes('ENCAISSEMENT') || k.includes('إعتماد') || k.includes('اعتماد')) {
              creditVal = creditVal || parseFloat(String(val).replace(/\s/g,'').replace(',', '.')) || 0;
            }
            else if (k.includes('DEBIT') || k.includes('DECAISSEMENT') || k.includes('دين')) {
              debitVal = debitVal || parseFloat(String(val).replace(/\s/g,'').replace(',', '.')) || 0;
            }
            else if (k.includes('MONTANT')) {
              montantVal = montantVal || parseFloat(String(val).replace(/\s/g,'').replace(',', '.')) || 0;
            }
          });

          return {
            id: `bank_${idx}_${Date.now()}`,
            date: dateVal.trim(),
            label: labelVal.trim(),
            reference: refVal.trim(),
            credit: creditVal || (montantVal > 0 ? montantVal : 0),
            debit: debitVal || (montantVal < 0 ? Math.abs(montantVal) : 0),
            status: 'UNMATCHED_BANK' as BankReconciliationStatus,
          };
        }).filter(t => t.date && (t.credit > 0 || t.debit > 0));

        if (transactions.length === 0) {
          alert("Aucune transaction trouvée. Vérifiez que les colonnes s'appellent bien 'Date', 'Libellé', 'Crédit' et 'Débit'.\n\nColonnes trouvées: " + Object.keys(jsonData[0] || {}).join(', '));
          return;
        }

        // Auto-match par montant exact + date proche
        const autoMatched = autoMatchTransactions(transactions, internalPayments);
        setBankTransactions(autoMatched);
        setImportModalOpen(false);
      } catch (err) {
        console.error("Erreur import", err);
        alert('Erreur lors de la lecture du fichier. Vérifiez le format (Excel ou CSV avec colonnes : Date, Libellé, Crédit, Débit).');
      }
    };
    reader.readAsArrayBuffer(file);
    if (fileInputRef.current) fileInputRef.current.value = '';
  }, [internalPayments]);

  // ── Auto-matching par montant et date ──
  const autoMatchTransactions = (transactions: BankTransaction[], pmts: ClientPayment[]): BankTransaction[] => {
    const usedPaymentIds = new Set<string>();

    return transactions.map(t => {
      if (t.credit <= 0) return t;

      const match = pmts.find(p => {
        if (usedPaymentIds.has(p.id)) return false;
        if (Math.abs(p.amount - t.credit) > 0.01) return false;

        const tDate = new Date(t.date);
        const pDate = new Date(p.date);
        const diffDays = Math.abs((tDate.getTime() - pDate.getTime()) / (1000 * 60 * 60 * 24));
        if (diffDays > 5) return false;

        if (t.reference && p.checkNumber && t.reference.includes(p.checkNumber)) return true;

        return true;
      });

      if (match) {
        usedPaymentIds.add(match.id);
        return { ...t, matchedPaymentId: match.id, status: 'MATCHED' as BankReconciliationStatus };
      }
      return t;
    });
  };

  // ── Match manuel ──
  const handleManualMatch = (transactionId: string, paymentId: string) => {
    setBankTransactions(prev => prev.map(t =>
      t.id === transactionId
        ? { ...t, matchedPaymentId: paymentId, status: 'MATCHED' as BankReconciliationStatus }
        : t
    ));
    setMatchModal({ open: false });
  };

  // ── Dé-rapprocher ──
  const handleUnmatch = (transactionId: string) => {
    setBankTransactions(prev => prev.map(t =>
      t.id === transactionId
        ? { ...t, matchedPaymentId: undefined, status: 'UNMATCHED_BANK' as BankReconciliationStatus }
        : t
    ));
  };

  const getClientName = (id: string) => clients.find(c => c.id === id)?.name || 'Anonyme';

  // ── Filtrage ──
  const filteredTransactions = useMemo(() => {
    let items = [...bankTransactions];
    if (activeTab === 'matched') items = items.filter(t => t.status === 'MATCHED');
    if (activeTab === 'unmatched_bank') items = items.filter(t => t.status === 'UNMATCHED_BANK');
    if (search) {
      const q = search.toLowerCase();
      items = items.filter(t => t.label.toLowerCase().includes(q) || t.reference?.toLowerCase().includes(q));
    }
    return items;
  }, [bankTransactions, activeTab, search]);

  const filteredMatchPayments = useMemo(() => {
    if (!matchSearch) return unmatchedInternalPayments.slice(0, 20);
    const q = matchSearch.toLowerCase();
    return unmatchedInternalPayments.filter(p =>
      getClientName(p.clientId).toLowerCase().includes(q) ||
      p.checkNumber?.toLowerCase().includes(q) ||
      String(p.amount).includes(q)
    ).slice(0, 20);
  }, [unmatchedInternalPayments, matchSearch]);

  return (
    <div className="space-y-6 animate-in fade-in duration-300 pb-32">

      {/* ── Header ── */}
      <div className="bg-gradient-to-br from-blue-900 to-blue-700 p-8 rounded-3xl shadow-2xl relative overflow-hidden">
        <div className="absolute bottom-0 left-1/3 w-64 h-64 bg-blue-400/10 rounded-full translate-y-1/2 blur-3xl" />
        <div className="relative z-10">
          <div className="flex items-center gap-3 mb-2">
            <Landmark className="w-6 h-6 text-blue-300" />
            <p className="text-[9px] font-black text-blue-300 uppercase tracking-[0.3em]">Comptabilité</p>
          </div>
          <h1 className="text-3xl font-black text-white uppercase tracking-tighter">
            Rapprochement <span className="text-blue-300">Bancaire</span>
          </h1>
          <p className="text-[10px] font-bold text-blue-400 uppercase tracking-widest mt-2">
            Comparez vos paiements internes avec votre relevé bancaire
          </p>
        </div>
      </div>

      {/* ── Toolbar ── */}
      <div className="bg-white rounded-2xl shadow-lg border border-stone-100 p-4 flex flex-wrap gap-3 items-end">
        <div>
          <Label className="text-[9px] font-black uppercase tracking-widest text-stone-500 mb-1 block">Banque</Label>
          <Select value={selectedBank} onValueChange={setSelectedBank}>
            <SelectTrigger className="h-10 w-52 rounded-xl border-stone-200 font-bold text-sm"><SelectValue placeholder="Sélectionner la banque" /></SelectTrigger>
            <SelectContent>
              {BANKS.map(b => <SelectItem key={b} value={b}>{b}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        <div>
          <Label className="text-[9px] font-black uppercase tracking-widest text-stone-500 mb-1 block">Période</Label>
          <Input type="month" value={period} onChange={e => setPeriod(e.target.value)}
            className="h-10 w-40 rounded-xl border-stone-200 font-bold text-sm" />
        </div>
        <div className="relative flex-1 min-w-48">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-stone-400" />
          <Input placeholder="Rechercher libellé, référence..." value={search} onChange={e => setSearch(e.target.value)}
            className="pl-9 h-10 rounded-xl border-stone-200 text-sm font-bold" />
        </div>
        <Button onClick={() => setImportModalOpen(true)}
          className="bg-blue-600 hover:bg-blue-700 text-white font-black uppercase text-xs h-10 rounded-xl gap-1.5 px-5">
          <Upload className="w-3.5 h-3.5" /> Importer Relevé
        </Button>
      </div>

      {/* ── KPI Cards ── */}
      <div className="grid grid-cols-1 md:grid-cols-5 gap-3">
        {[
          { label: 'Total Relevé Bancaire', value: fmt(stats.totalBank), color: 'text-blue-700', bg: 'bg-blue-50', icon: FileSpreadsheet },
          { label: 'Total Paiements Internes', value: fmt(stats.totalInternal), color: 'text-violet-700', bg: 'bg-violet-50', icon: Landmark },
          { label: 'Rapprochés', value: String(stats.matched), color: 'text-emerald-700', bg: 'bg-emerald-50', icon: CheckCircle2 },
          { label: 'Non rapprochés (Banque)', value: String(stats.unmatchedBank), color: 'text-amber-700', bg: 'bg-amber-50', icon: AlertTriangle },
          { label: 'Écart', value: `${stats.ecart >= 0 ? '+' : ''}${fmt(stats.ecart)}`, color: stats.ecart === 0 ? 'text-emerald-700' : 'text-red-700', bg: stats.ecart === 0 ? 'bg-emerald-50' : 'bg-red-50', icon: ArrowLeftRight },
        ].map(({ label, value, color, bg, icon: Icon }) => (
          <div key={label} className="bg-white rounded-2xl p-4 border border-stone-100 shadow-sm">
            <div className={`w-8 h-8 ${bg} rounded-xl flex items-center justify-center mb-2`}>
              <Icon className={`w-4 h-4 ${color}`} />
            </div>
            <p className={`text-lg font-black ${color}`}>{value} <span className="text-xs text-stone-400">MAD</span></p>
            <p className="text-[8px] font-black text-stone-400 uppercase tracking-widest mt-1">{label}</p>
          </div>
        ))}
      </div>

      {/* ── Tabs ── */}
      <div className="flex items-center gap-2 overflow-x-auto pb-1">
        {([
          { id: 'all', label: 'Tout', count: bankTransactions.length },
          { id: 'matched', label: 'Rapprochés', count: stats.matched },
          { id: 'unmatched_bank', label: 'Non rapprochés (Banque)', count: stats.unmatchedBank },
          { id: 'unmatched_internal', label: 'Non rapprochés (Internes)', count: stats.unmatchedInternal },
        ] as const).map(tab => (
          <button key={tab.id} onClick={() => setActiveTab(tab.id)}
            className={`px-5 py-2.5 rounded-2xl text-[10px] font-black uppercase tracking-widest transition-all whitespace-nowrap border ${
              activeTab === tab.id
                ? 'bg-stone-900 text-white border-stone-900 shadow-md'
                : 'bg-white text-stone-500 border-stone-200 hover:bg-stone-50'
            }`}>
            {tab.label} ({tab.count})
          </button>
        ))}
      </div>

      {/* ── Table des transactions bancaires ── */}
      {activeTab !== 'unmatched_internal' ? (
        <div className="bg-white border border-stone-100 rounded-3xl shadow-sm overflow-hidden">
          <div className="p-5 border-b border-stone-100 bg-stone-50/50 flex justify-between items-center">
            <h3 className="text-sm font-black text-stone-900 uppercase tracking-tight flex items-center gap-2">
              <FileSpreadsheet className="w-4 h-4 text-blue-600" />
              Opérations du relevé bancaire
            </h3>
            <span className="text-[10px] font-black bg-stone-200 text-stone-600 px-2.5 py-1 rounded-full uppercase">
              {filteredTransactions.length} opération{filteredTransactions.length > 1 ? 's' : ''}
            </span>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-stone-50 border-b border-stone-100">
                  <th className="px-5 py-3 text-[9px] font-black text-stone-400 uppercase tracking-widest">Date</th>
                  <th className="px-5 py-3 text-[9px] font-black text-stone-400 uppercase tracking-widest">Libellé</th>
                  <th className="px-5 py-3 text-[9px] font-black text-stone-400 uppercase tracking-widest">Réf.</th>
                  <th className="px-5 py-3 text-right text-[9px] font-black text-stone-400 uppercase tracking-widest">Crédit</th>
                  <th className="px-5 py-3 text-right text-[9px] font-black text-stone-400 uppercase tracking-widest">Débit</th>
                  <th className="px-5 py-3 text-center text-[9px] font-black text-stone-400 uppercase tracking-widest">Statut</th>
                  <th className="px-5 py-3 text-[9px] font-black text-stone-400 uppercase tracking-widest">Rapproché avec</th>
                  <th className="px-5 py-3 text-right text-[9px] font-black text-stone-400 uppercase tracking-widest">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-stone-50">
                {filteredTransactions.length === 0 ? (
                  <tr>
                    <td colSpan={8} className="p-12 text-center">
                      <Upload className="w-10 h-10 text-stone-200 mx-auto mb-3" />
                      <p className="text-stone-400 text-xs font-bold uppercase tracking-widest">
                        {bankTransactions.length === 0 ? 'Importez un relevé bancaire pour commencer' : 'Aucun résultat trouvé'}
                      </p>
                    </td>
                  </tr>
                ) : filteredTransactions.map(t => {
                  const matched = t.matchedPaymentId ? payments.find(p => p.id === t.matchedPaymentId) : null;
                  return (
                    <tr key={t.id} className={`hover:bg-stone-50/30 transition-colors ${t.status === 'MATCHED' ? '' : 'bg-amber-50/20'}`}>
                      <td className="px-5 py-3 text-xs font-bold text-stone-700 whitespace-nowrap">{t.date}</td>
                      <td className="px-5 py-3 text-xs font-bold text-stone-900 max-w-[250px] truncate">{t.label}</td>
                      <td className="px-5 py-3 text-xs font-mono text-stone-500">{t.reference || '—'}</td>
                      <td className="px-5 py-3 text-right text-xs font-black text-emerald-600">
                        {t.credit > 0 ? `+${fmt(t.credit)}` : '—'}
                      </td>
                      <td className="px-5 py-3 text-right text-xs font-black text-red-600">
                        {t.debit > 0 ? `-${fmt(t.debit)}` : '—'}
                      </td>
                      <td className="px-5 py-3 text-center">
                        <span className={`inline-block px-2.5 py-1 rounded-lg text-[9px] font-black uppercase ${
                          t.status === 'MATCHED' ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-700'
                        }`}>
                          {t.status === 'MATCHED' ? '✓ Rapproché' : 'En attente'}
                        </span>
                      </td>
                      <td className="px-5 py-3">
                        {matched ? (
                          <div className="text-[10px]">
                            <span className="font-black text-stone-900">{getClientName(matched.clientId)}</span>
                            <br /><span className="font-bold text-stone-500">{matched.method} · {fmt(matched.amount)} MAD</span>
                          </div>
                        ) : <span className="text-stone-300">—</span>}
                      </td>
                      <td className="px-5 py-3 text-right">
                        <div className="flex items-center justify-end gap-1.5">
                          {t.status === 'MATCHED' ? (
                            <button onClick={() => handleUnmatch(t.id)} title="Dé-rapprocher"
                              className="h-7 w-7 rounded-lg bg-stone-100 text-stone-400 hover:bg-red-100 hover:text-red-600 flex items-center justify-center transition-colors">
                              <Unlink className="w-3.5 h-3.5" />
                            </button>
                          ) : t.credit > 0 ? (
                            <button onClick={() => { setMatchModal({ open: true, transaction: t }); setMatchSearch(''); }}
                              title="Rapprocher manuellement"
                              className="h-7 w-7 rounded-lg bg-blue-100 text-blue-600 hover:bg-blue-200 flex items-center justify-center transition-colors">
                              <Link2 className="w-3.5 h-3.5" />
                            </button>
                          ) : null}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      ) : (
        /* ── Table des paiements internes non rapprochés ── */
        <div className="bg-white border border-stone-100 rounded-3xl shadow-sm overflow-hidden">
          <div className="p-5 border-b border-stone-100 bg-stone-50/50 flex justify-between items-center">
            <h3 className="text-sm font-black text-stone-900 uppercase tracking-tight flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 text-amber-600" />
              Paiements internes sans correspondance bancaire
            </h3>
            <span className="text-[10px] font-black bg-amber-200 text-amber-700 px-2.5 py-1 rounded-full uppercase">
              {unmatchedInternalPayments.length} paiement{unmatchedInternalPayments.length > 1 ? 's' : ''}
            </span>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-stone-50 border-b border-stone-100">
                  <th className="px-5 py-3 text-[9px] font-black text-stone-400 uppercase tracking-widest">Date</th>
                  <th className="px-5 py-3 text-[9px] font-black text-stone-400 uppercase tracking-widest">Client</th>
                  <th className="px-5 py-3 text-[9px] font-black text-stone-400 uppercase tracking-widest">Mode</th>
                  <th className="px-5 py-3 text-[9px] font-black text-stone-400 uppercase tracking-widest">N° Chèque/Effet</th>
                  <th className="px-5 py-3 text-right text-[9px] font-black text-stone-400 uppercase tracking-widest">Montant</th>
                  <th className="px-5 py-3 text-center text-[9px] font-black text-stone-400 uppercase tracking-widest">Statut</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-stone-50">
                {unmatchedInternalPayments.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="p-8 text-center text-stone-400 text-xs font-bold uppercase tracking-widest">
                      Tous les paiements sont rapprochés ✓
                    </td>
                  </tr>
                ) : unmatchedInternalPayments.map(p => (
                  <tr key={p.id} className="hover:bg-stone-50/30 transition-colors">
                    <td className="px-5 py-3 text-xs font-bold text-stone-700">{p.date}</td>
                    <td className="px-5 py-3 text-xs font-black text-stone-900">{getClientName(p.clientId)}</td>
                    <td className="px-5 py-3">
                      <span className={`text-[10px] font-black uppercase px-2 py-1 rounded-md ${
                        p.method === 'CHEQUE' ? 'bg-blue-50 text-blue-700' :
                        p.method === 'EFFET' ? 'bg-violet-50 text-violet-700' :
                        p.method === 'VIREMENT' ? 'bg-emerald-50 text-emerald-700' :
                        'bg-stone-50 text-stone-600'
                      }`}>{p.method}</span>
                    </td>
                    <td className="px-5 py-3 text-xs font-mono text-stone-500">{p.checkNumber || '—'}</td>
                    <td className="px-5 py-3 text-right text-xs font-black text-stone-900">{fmt(p.amount)}</td>
                    <td className="px-5 py-3 text-center">
                      <span className="inline-block px-2.5 py-1 rounded-lg text-[9px] font-black uppercase bg-amber-100 text-amber-700">
                        Non trouvé en banque
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ── Import Modal ── */}
      <Dialog open={importModalOpen} onOpenChange={setImportModalOpen}>
        <DialogContent className="sm:max-w-lg rounded-3xl">
          <DialogHeader>
            <DialogTitle className="text-lg font-black text-stone-900 uppercase tracking-tight">
              Importer un Relevé Bancaire
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <p className="text-xs text-stone-500 font-medium">
              Importez votre relevé bancaire au format <strong>Excel (.xlsx)</strong> ou <strong>CSV</strong>.
              Le fichier doit contenir au minimum les colonnes :
            </p>
            <div className="bg-stone-50 rounded-xl p-4 text-xs font-mono text-stone-600 space-y-1">
              <p>• <strong>Date</strong> — Date de l'opération</p>
              <p>• <strong>Libellé</strong> — Descriptif de l'opération</p>
              <p>• <strong>Crédit</strong> — Montant entrant (ou <strong>Montant</strong> positif)</p>
              <p>• <strong>Débit</strong> — Montant sortant (ou <strong>Montant</strong> négatif)</p>
              <p className="text-stone-400">Optionnel : <strong>Référence</strong>, <strong>Solde</strong></p>
            </div>
            <div className="border-2 border-dashed border-stone-200 rounded-2xl p-8 text-center hover:border-blue-400 transition-colors cursor-pointer"
              onClick={() => fileInputRef.current?.click()}>
              <Upload className="w-10 h-10 text-stone-300 mx-auto mb-3" />
              <p className="text-sm font-bold text-stone-600">Cliquez pour sélectionner un fichier</p>
              <p className="text-[10px] text-stone-400 font-medium mt-1">.xlsx, .xls, .csv</p>
              <input ref={fileInputRef} type="file" accept=".xlsx,.xls,.csv" onChange={handleFileImport} className="hidden" />
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* ── Match Modal ── */}
      <Dialog open={matchModal.open} onOpenChange={o => !o && setMatchModal({ open: false })}>
        <DialogContent className="sm:max-w-lg rounded-3xl max-h-[80vh] overflow-hidden flex flex-col">
          <DialogHeader>
            <DialogTitle className="text-lg font-black text-stone-900 uppercase tracking-tight">
              Rapprocher manuellement
            </DialogTitle>
          </DialogHeader>
          {matchModal.transaction && (
            <div className="space-y-4 flex-1 overflow-hidden flex flex-col">
              <div className="bg-blue-50 rounded-xl p-4 border border-blue-100">
                <p className="text-[9px] font-black text-blue-500 uppercase tracking-widest mb-1">Transaction bancaire</p>
                <p className="text-sm font-black text-stone-900">{matchModal.transaction.label}</p>
                <p className="text-xs text-stone-500 mt-1">
                  {matchModal.transaction.date} · <strong className="text-emerald-600">{fmt(matchModal.transaction.credit)} MAD</strong>
                  {matchModal.transaction.reference ? ` · Réf: ${matchModal.transaction.reference}` : ''}
                </p>
              </div>
              <div>
                <Label className="text-[9px] font-black uppercase tracking-widest text-stone-500 mb-1 block">
                  Sélectionner le paiement correspondant
                </Label>
                <Input placeholder="Rechercher client, montant, N° chèque..." value={matchSearch}
                  onChange={e => setMatchSearch(e.target.value)} className="h-9 rounded-xl text-sm font-bold" />
              </div>
              <div className="flex-1 overflow-y-auto space-y-2">
                {filteredMatchPayments.length === 0 ? (
                  <p className="text-center text-stone-400 text-xs font-bold uppercase tracking-widest py-6">
                    Aucun paiement correspondant
                  </p>
                ) : filteredMatchPayments.map(p => (
                  <button key={p.id} onClick={() => handleManualMatch(matchModal.transaction!.id, p.id)}
                    className="w-full text-left p-3 rounded-xl border border-stone-200 hover:border-blue-400 hover:bg-blue-50/30 transition-all group">
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-xs font-black text-stone-900">{getClientName(p.clientId)}</p>
                        <p className="text-[10px] font-bold text-stone-500">
                          {p.date} · {p.method}{p.checkNumber ? ` N°${p.checkNumber}` : ''}{p.bankName ? ` · ${p.bankName}` : ''}
                        </p>
                      </div>
                      <div className="text-right">
                        <p className={`text-sm font-black ${Math.abs(p.amount - matchModal.transaction!.credit) < 0.01 ? 'text-emerald-600' : 'text-amber-600'}`}>
                          {fmt(p.amount)} MAD
                        </p>
                        {Math.abs(p.amount - matchModal.transaction!.credit) < 0.01 && (
                          <span className="text-[8px] font-black text-emerald-600 bg-emerald-100 px-1.5 py-0.5 rounded uppercase">Montant exact</span>
                        )}
                      </div>
                    </div>
                  </button>
                ))}
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
