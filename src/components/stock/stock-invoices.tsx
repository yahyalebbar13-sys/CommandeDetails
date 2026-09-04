"use client";

import React, { useState, useMemo } from 'react';
import { Search, Eye, Printer, CreditCard, X, Download, Mail, Send, Plus, Trash2, CheckCircle2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import type { Invoice, InvoiceStatus, Client, ClientPayment, PaymentMethod } from '@/lib/types';
import { exportToFile, formatInvoicesForExport } from '@/lib/export-utils';
import { exportInvoicesPDF } from '@/lib/pdf-export-reports';
import { cleanUndefined } from '@/lib/utils';

interface PaymentLineState {
  id: string;
  amount: string;
  method: PaymentMethod;
  notes: string;
  bankName: string;
  checkNumber: string;
  dueDate: string;
  scannedImageUrl: string;
}

interface StockInvoicesProps {
  invoices: Invoice[];
  clients: Client[];
  payments: ClientPayment[];
  onRecordPayment: (payment: Omit<ClientPayment, 'id' | 'createdAt'>) => Promise<void>;
  onRecordMultiplePayments?: (
    payments: Omit<ClientPayment, 'id' | 'createdAt'>[],
    invoiceUpdates?: { invoiceId: string; paidAmount: number; remainingBalance: number; status: InvoiceStatus }[]
  ) => Promise<void>;
  onUpdateStatus: (id: string, status: InvoiceStatus) => Promise<void>;
  onNavigate: (v: any) => void;
}

const fmt$ = (n: number) => n.toLocaleString('fr-MA', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

const STATUS_BADGE: Record<InvoiceStatus, { label: string; cls: string }> = {
  UNPAID:    { label: 'Non payé',  cls: 'bg-red-100 text-red-700 border-red-200' },
  PARTIAL:   { label: 'Partiel',   cls: 'bg-orange-100 text-orange-700 border-orange-200' },
  PAID:      { label: 'Payé',      cls: 'bg-emerald-100 text-emerald-700 border-emerald-200' },
  CANCELLED: { label: 'Annulé',    cls: 'bg-stone-100 text-stone-500 border-stone-200' },
};

export default function StockInvoices({ invoices, clients, payments, onRecordPayment, onRecordMultiplePayments, onUpdateStatus, onNavigate }: StockInvoicesProps) {
  const [filterStatus, setFilterStatus] = useState<string>('all');
  const [filterMonth,  setFilterMonth]  = useState<string>('all');
  const [search, setSearch] = useState('');
  const [sendingReminder, setSendingReminder] = useState<string | null>(null);

  const [viewInvoice,   setViewInvoice]   = useState<Invoice | null>(null);
  const [payInvoice,    setPayInvoice]    = useState<Invoice | null>(null);
  const [payDate,       setPayDate]       = useState(new Date().toISOString().split('T')[0]);
  const [payLines,      setPayLines]      = useState<PaymentLineState[]>([
    { id: '1', amount: '', method: 'CASH', notes: '', bankName: '', checkNumber: '', dueDate: '', scannedImageUrl: '' }
  ]);
  const [saving, setSaving] = useState(false);

  const months = useMemo(() => {
    const s = new Set<string>();
    invoices.forEach(i => i.date && s.add(i.date.substring(0, 7)));
    return Array.from(s).sort().reverse();
  }, [invoices]);

  const filtered = useMemo(() => {
    let r = [...invoices].sort((a, b) => b.date.localeCompare(a.date));
    if (filterStatus !== 'all') r = r.filter(i => i.status === filterStatus);
    if (filterMonth  !== 'all') r = r.filter(i => i.date.startsWith(filterMonth));
    if (search) {
      const q = search.toLowerCase();
      r = r.filter(i => i.clientName?.toLowerCase().includes(q) || i.invoiceNumber?.toLowerCase().includes(q));
    }
    return r;
  }, [invoices, filterStatus, filterMonth, search]);

  const totalCA   = filtered.reduce((s, i) => s + i.totalAfterDiscount, 0);
  const totalPaid = filtered.reduce((s, i) => s + i.paidAmount, 0);
  const totalDue  = filtered.reduce((s, i) => s + i.remainingBalance, 0);

  const invoiceNumber = (inv: Invoice) =>
    inv.invoiceNumber || `FAC-${String(invoices.findIndex(i => i.id === inv.id) + 1).padStart(4, '0')}`;

  const invPayments = (invId: string) => payments.filter(p => p.invoiceId === invId);

  const handleSendReminder = async (inv: Invoice) => {
    const client = clients.find(c => c.id === inv.clientId);
    if (!client?.email) {
      alert('Ce client n\'a pas d\'adresse email configurée.');
      return;
    }
    setSendingReminder(inv.id);
    try {
      const res = await fetch('/api/send-reminder', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          to: client.email,
          clientName: client.name,
          invoiceNumber: invoiceNumber(inv),
          amount: inv.totalAfterDiscount,
          dueDate: inv.dueDate,
          remainingBalance: inv.remainingBalance,
        }),
      });
      if (res.ok) {
        alert('✅ Relance envoyée avec succès !');
      } else {
        alert('❌ Erreur lors de l\'envoi de la relance.');
      }
    } catch {
      alert('❌ Erreur réseau.');
    } finally {
      setSendingReminder(null);
    }
  };

  const openPayInvoice = (inv: Invoice) => {
    setPayInvoice(inv);
    setPayDate(new Date().toISOString().split('T')[0]);
    const rem = typeof inv.remainingBalance === 'number'
      ? inv.remainingBalance
      : Math.max(0, (inv.totalAfterDiscount || 0) - (inv.paidAmount || 0));
    setPayLines([
      {
        id: String(Date.now()),
        amount: rem > 0 ? String(rem) : '',
        method: 'CASH',
        notes: `Paiement ${inv.invoiceNumber || 'Facture'}`,
        bankName: '',
        checkNumber: '',
        dueDate: '',
        scannedImageUrl: ''
      }
    ]);
  };

  const addPayLine = (defaultMethod: PaymentMethod = 'CHEQUE') => {
    if (!payInvoice) return;
    const invRem = typeof payInvoice.remainingBalance === 'number'
      ? payInvoice.remainingBalance
      : Math.max(0, (payInvoice.totalAfterDiscount || 0) - (payInvoice.paidAmount || 0));
    const totalCurrent = payLines.reduce((sum, l) => sum + (parseFloat(l.amount) || 0), 0);
    const rem = Math.max(0, invRem - totalCurrent);
    setPayLines(prev => [
      ...prev,
      {
        id: String(Date.now() + Math.random()),
        amount: rem > 0 ? String(rem) : '',
        method: defaultMethod,
        notes: '',
        bankName: '',
        checkNumber: '',
        dueDate: '',
        scannedImageUrl: ''
      }
    ]);
  };

  const removePayLine = (id: string) => {
    if (payLines.length <= 1) return;
    setPayLines(prev => prev.filter(l => l.id !== id));
  };

  const updatePayLine = (id: string, updates: Partial<PaymentLineState>) => {
    setPayLines(prev => prev.map(l => l.id === id ? { ...l, ...updates } : l));
  };

  const totalInvoicePaymentEntered = payLines.reduce((sum, l) => sum + (parseFloat(l.amount) || 0), 0);
  const payInvoiceRemaining = payInvoice ? (typeof payInvoice.remainingBalance === 'number' ? payInvoice.remainingBalance : Math.max(0, (payInvoice.totalAfterDiscount || 0) - (payInvoice.paidAmount || 0))) : 0;
  const diffInvoiceBalance = payInvoiceRemaining - totalInvoicePaymentEntered;

  const handlePayment = async () => {
    if (!payInvoice || saving) return;
    const validLines = payLines.filter(l => (parseFloat(l.amount) || 0) > 0);
    if (validLines.length === 0) {
      alert('Veuillez saisir au moins un montant valide supérieur à 0.');
      return;
    }

    setSaving(true);
    try {
      const paymentsToRecord: Omit<ClientPayment, 'id' | 'createdAt'>[] = validLines.map(line => {
        const amt = parseFloat(line.amount);
        const p: any = {
          clientId: payInvoice.clientId || '',
          invoiceId: payInvoice.id,
          amount: amt,
          date: payDate,
          method: line.method,
          notes: line.notes || (validLines.length > 1 ? `Paiement mixte (${line.method})` : `Paiement ${payInvoice.invoiceNumber || 'Facture'}`),
        };
        if (line.bankName?.trim()) p.bankName = line.bankName.trim();
        if (line.checkNumber?.trim()) p.checkNumber = line.checkNumber.trim();
        if (line.dueDate?.trim()) p.dueDate = line.dueDate.trim();
        if (line.scannedImageUrl?.trim()) p.scannedImageUrl = line.scannedImageUrl.trim();
        if (line.method === 'CHEQUE' || line.method === 'EFFET' || line.method === 'LC' || line.method === 'LCN') {
          p.status = 'PENDING';
        }
        return cleanUndefined(p);
      });

      if (onRecordMultiplePayments) {
        await onRecordMultiplePayments(paymentsToRecord);
      } else {
        for (const p of paymentsToRecord) {
          await onRecordPayment(p);
        }
      }

      setPayInvoice(null);
    } catch (err: any) {
      console.error('Erreur lors du paiement de la facture:', err);
      alert('❌ Erreur : ' + (err?.message || 'Erreur inconnue'));
    } finally {
      setSaving(false);
    }
  };

  const printInvoice = (inv: Invoice) => {
    const num = invoiceNumber(inv);
    const client = clients.find(c => c.id === inv.clientId);
    const tvaRate = inv.tvaRate ?? 20;
    const ht = inv.totalAfterDiscount;
    const tvaAmount = inv.tvaAmount ?? (ht * tvaRate / 100);
    const ttc = inv.totalTTC ?? (ht + tvaAmount);
    const w = window.open('', '_blank');
    if (!w) return;
    w.document.write(`<!DOCTYPE html><html><head><meta charset="utf-8"><title>${num}</title>
    <style>body{font-family:Arial,sans-serif;max-width:700px;margin:40px auto;color:#1c1917}
    h1{font-size:28px;font-weight:900;text-transform:uppercase;letter-spacing:-0.05em}
    .header{display:flex;justify-content:space-between;align-items:start;border-bottom:3px solid #6d28d9;padding-bottom:20px;margin-bottom:20px}
    .label{font-size:9px;font-weight:700;text-transform:uppercase;letter-spacing:0.1em;color:#78716c;margin-bottom:2px}
    table{width:100%;border-collapse:collapse;margin:20px 0}
    th{text-align:left;font-size:9px;text-transform:uppercase;letter-spacing:0.1em;color:#78716c;padding:8px;border-bottom:2px solid #e7e5e4}
    td{padding:10px 8px;border-bottom:1px solid #f5f5f4;font-size:12px}
    .total-row{font-weight:900;font-size:18px;color:#6d28d9}
    .badge{display:inline-block;padding:2px 8px;border-radius:6px;font-size:9px;font-weight:700;text-transform:uppercase}
    .unpaid{background:#fee2e2;color:#b91c1c}.paid{background:#d1fae5;color:#065f46}.partial{background:#fed7aa;color:#c2410c}
    .fiscal-box{margin-top:20px;padding:12px;background:#fafaf9;border:1px solid #e7e5e4;border-radius:8px;font-size:10px;color:#78716c}
    .fiscal-box strong{color:#44403c}
    .footer{margin-top:40px;text-align:center;font-size:10px;color:#a8a29e;border-top:1px solid #e7e5e4;padding-top:16px}
    </style></head><body>
    <div class="header">
      <div>
        <img src="${window.location.origin}/logo_lebtex.png" alt="LEBTEX" style="height: 120px; margin-bottom: 15px; display: block;" />
        <div class="label" style="color:#6d28d9;font-size:10px">BON DE COMMANDE</div>
        <h1>${num}</h1>
        <span class="badge ${inv.status === 'PAID' ? 'paid' : inv.status === 'PARTIAL' ? 'partial' : 'unpaid'}">
          ${STATUS_BADGE[inv.status].label}
        </span>
      </div>
      <div style="text-align:right">
        <div class="label">Date</div><strong>${inv.date}</strong>
        ${inv.dueDate ? `<br><div class="label" style="margin-top:6px">Échéance</div><strong>${inv.dueDate}</strong>` : ''}
        <br><div class="label" style="margin-top:8px">Facturé à</div>
        <strong style="font-size:14px">${inv.clientName || 'Anonyme'}</strong>
        ${client?.ice ? `<br><div class="label" style="margin-top:4px">ICE</div><strong>${client.ice}</strong>` : ''}
        ${client?.identifiantFiscal ? `<br><div class="label" style="margin-top:2px">IF</div><strong>${client.identifiantFiscal}</strong>` : ''}
      </div>
    </div>
    <table><thead><tr>
      <th>Produit</th><th>Couleur</th><th>Taille</th><th>Qté</th><th>Prix unit. HT</th><th>Total HT</th>
    </tr></thead>
    <tbody>${inv.items.map(item => `<tr>
      <td><strong>${item.productName}</strong></td><td>${item.color || '—'}</td><td>${item.size || '—'}</td>
      <td>${item.qty} ${item.unitOfMeasure}</td><td>${fmt$(item.unitPrice)}</td><td><strong>${fmt$(item.totalPrice)}</strong></td>
    </tr>`).join('')}</tbody></table>
    <div style="text-align:right;border-top:1px solid #e7e5e4;padding-top:12px">
      <div style="color:#78716c;margin-bottom:4px;font-size:12px">Sous-total HT : ${fmt$(inv.totalAmount)}</div>
      ${(inv.discount || 0) > 0 ? `<div style="color:#059669;margin-bottom:4px;font-size:12px">Remise ${inv.discount}% : -${fmt$(inv.totalAmount * (inv.discount || 0) / 100)}</div>` : ''}
      <div style="color:#78716c;margin-bottom:4px;font-size:12px;font-weight:700">Total HT : ${fmt$(ht)}</div>
      <div style="color:#78716c;margin-bottom:4px;font-size:12px">TVA ${tvaRate}% : ${fmt$(tvaAmount)}</div>
      <div class="total-row">Total TTC : ${fmt$(ttc)} MAD</div>
      <div style="color:#059669;margin-top:8px;font-size:12px">Payé : ${fmt$(inv.paidAmount)}</div>
      <div style="color:#dc2626;font-size:14px;font-weight:700">Solde dû : ${fmt$(inv.remainingBalance)}</div>
    </div>
    <div class="fiscal-box">
      <strong>LEBTEX SARL AU</strong> — Mercerie, fils à coudre, fermetures à glissière et accessoires textile<br>
      RC : Casablanca · IF : — · ICE : — · CNSS : — · Patente : —<br>
      <em>En cas de retard de paiement, des pénalités au taux légal seront appliquées conformément à la loi 32-10.</em>
    </div>
    <div class="footer">Document généré le ${new Date().toLocaleDateString('fr-FR')} · Merci pour votre confiance</div>
    </body></html>`);
    w.document.close();
    w.print();
  };

  return (
    <div className="space-y-6 animate-in fade-in duration-300">
      {/* Header */}
      <div className="bg-gradient-to-br from-violet-900 to-violet-700 p-8 rounded-3xl shadow-2xl relative overflow-hidden">
        <div className="absolute bottom-0 left-1/3 w-64 h-64 bg-violet-400/10 rounded-full translate-y-1/2 blur-3xl" />
        <div className="relative z-10">
          <p className="text-[9px] font-black text-violet-300 uppercase tracking-[0.3em] mb-1">Comptabilité</p>
          <h1 className="text-3xl font-black text-white uppercase tracking-tighter mb-4">Bons de <span className="text-violet-300">Commande</span></h1>
          <div className="grid grid-cols-3 gap-3">
            {[
              { label: 'CA Facturé', value: fmt$(invoices.reduce((s, i) => s + i.totalAfterDiscount, 0)), color: 'text-white' },
              { label: 'Total Encaissé', value: fmt$(invoices.reduce((s, i) => s + i.paidAmount, 0)), color: 'text-emerald-300' },
              { label: 'Solde Dû Global', value: fmt$(invoices.reduce((s, i) => s + i.remainingBalance, 0)), color: 'text-red-300' },
            ].map(({ label, value, color }) => (
              <div key={label} className="bg-white/10 rounded-2xl p-4">
                <p className={`text-xl font-black ${color}`}>{value}</p>
                <p className="text-[8px] font-black text-violet-300 uppercase tracking-widest mt-1">{label}</p>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Filtres */}
      <div className="bg-white rounded-2xl shadow-lg border border-stone-100 p-4 flex flex-wrap gap-3">
        <div className="relative flex-1 min-w-48">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-stone-400" />
          <Input placeholder="Rechercher client, N° bon..." value={search} onChange={e => setSearch(e.target.value)}
            className="pl-9 h-10 rounded-xl border-stone-200 text-sm font-bold" />
        </div>
        <Select value={filterStatus} onValueChange={setFilterStatus}>
          <SelectTrigger className="h-10 w-40 rounded-xl border-stone-200 font-bold text-sm"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Tous</SelectItem>
            <SelectItem value="UNPAID">Non payé</SelectItem>
            <SelectItem value="PARTIAL">Partiel</SelectItem>
            <SelectItem value="PAID">Payé</SelectItem>
            <SelectItem value="CANCELLED">Annulé</SelectItem>
          </SelectContent>
        </Select>
        <Select value={filterMonth} onValueChange={setFilterMonth}>
          <SelectTrigger className="h-10 w-36 rounded-xl border-stone-200 font-bold text-sm"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Toute période</SelectItem>
            {months.map(m => <SelectItem key={m} value={m}>{m}</SelectItem>)}
          </SelectContent>
        </Select>
        <Button
          variant="outline"
          onClick={() => exportToFile(formatInvoicesForExport(filtered), { filename: `factures-${new Date().toISOString().split('T')[0]}`, sheetName: 'Factures' })}
          className="font-black uppercase text-xs h-10 rounded-xl gap-1.5 ml-auto"
        >
          <Download className="w-3.5 h-3.5" /> Excel
        </Button>
        <Button
          variant="outline"
          onClick={() => exportInvoicesPDF(filtered)}
          className="font-black uppercase text-xs h-10 rounded-xl gap-1.5"
        >
          <Download className="w-3.5 h-3.5" /> PDF
        </Button>
      </div>

      {/* Liste */}
      <div className="bg-white rounded-2xl shadow-xl border border-stone-100 overflow-hidden">
        {filtered.length === 0 ? (
          <p className="text-center text-stone-300 font-black uppercase text-[10px] py-16">Aucun bon de commande</p>
        ) : (
          <>
            <table className="w-full">
              <thead><tr className="bg-stone-50 border-b border-stone-100">
                {['N° Bon', 'Date', 'Échéance', 'Client', 'Montant', 'Payé', 'Solde Dû', 'Statut', 'Actions'].map(h => (
                  <th key={h} className="px-4 py-3 text-left text-[8px] font-black uppercase tracking-widest text-stone-400 whitespace-nowrap">{h}</th>
                ))}
              </tr></thead>
              <tbody className="divide-y divide-stone-50">
                {filtered.map(inv => {
                  const badge = STATUS_BADGE[inv.status];
                  const isOverdue = inv.dueDate && inv.dueDate < new Date().toISOString().split('T')[0] && inv.status !== 'PAID' && inv.status !== 'CANCELLED';
                  return (
                    <tr key={inv.id} className="hover:bg-stone-50/50 transition-colors group">
                      <td className="px-4 py-3 text-[10px] font-black text-violet-700">{invoiceNumber(inv)}</td>
                      <td className="px-4 py-3 text-[10px] font-bold text-stone-500">{inv.date}</td>
                      <td className="px-4 py-3">
                        {inv.dueDate ? (
                          <span className={`text-[10px] font-bold ${isOverdue ? 'text-red-600' : 'text-stone-500'}`}>{inv.dueDate}</span>
                        ) : <span className="text-stone-200">—</span>}
                      </td>
                      <td className="px-4 py-3 text-[10px] font-black text-stone-800">{inv.clientName || 'Anonyme'}</td>
                      <td className="px-4 py-3 text-[10px] font-black text-stone-900">{fmt$(inv.totalAfterDiscount)}</td>
                      <td className="px-4 py-3 text-[10px] font-bold text-emerald-600">{fmt$(inv.paidAmount)}</td>
                      <td className={`px-4 py-3 text-[10px] font-black ${inv.remainingBalance > 0 ? 'text-red-600' : 'text-emerald-600'}`}>
                        {fmt$(inv.remainingBalance)}
                      </td>
                      <td className="px-4 py-3">
                        <span className={`text-[8px] font-black uppercase px-2 py-0.5 rounded-lg border ${badge.cls}`}>{badge.label}</span>
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                          <button onClick={() => setViewInvoice(inv)} title="Voir"
                            className="w-7 h-7 rounded-lg bg-stone-100 hover:bg-stone-200 text-stone-600 flex items-center justify-center">
                            <Eye className="w-3 h-3" />
                          </button>
                          <button onClick={() => printInvoice(inv)} title="Imprimer"
                            className="w-7 h-7 rounded-lg bg-stone-100 hover:bg-stone-200 text-stone-600 flex items-center justify-center">
                            <Printer className="w-3 h-3" />
                          </button>
                          {inv.status !== 'PAID' && inv.status !== 'CANCELLED' && (
                            <>
                              <button onClick={() => handleSendReminder(inv)} disabled={sendingReminder === inv.id}
                                title="Envoyer une relance par email"
                                className="h-7 w-7 rounded-lg bg-blue-100 text-blue-600 hover:bg-blue-200 flex items-center justify-center transition-colors disabled:opacity-50">
                                <Mail className="w-3.5 h-3.5" />
                              </button>
                              <button onClick={() => openPayInvoice(inv)}
                                title="Enregistrer paiement"
                                className="w-7 h-7 rounded-lg bg-emerald-100 hover:bg-emerald-200 text-emerald-700 flex items-center justify-center">
                                <CreditCard className="w-3 h-3" />
                              </button>
                            </>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            <div className="px-4 py-3 bg-stone-50 border-t border-stone-100 flex justify-between items-center flex-wrap gap-2">
              <span className="text-[9px] font-black text-stone-400 uppercase tracking-widest">{filtered.length} facture{filtered.length > 1 ? 's' : ''}</span>
              <div className="flex gap-4">
                <span className="text-[10px] font-black text-stone-700">CA : {fmt$(totalCA)}</span>
                <span className="text-[10px] font-black text-emerald-700">Encaissé : {fmt$(totalPaid)}</span>
                <span className="text-[10px] font-black text-red-600">Dû : {fmt$(totalDue)}</span>
              </div>
            </div>
          </>
        )}
      </div>

      {/* Modal paiement (Multi-modes: Cash, Chèque, LC, Virement) */}
      <Dialog open={!!payInvoice} onOpenChange={o => !o && setPayInvoice(null)}>
        <DialogContent className="sm:max-w-2xl rounded-3xl border-none shadow-2xl p-0 overflow-hidden">
          <div className="bg-gradient-to-r from-emerald-800 to-teal-700 p-6 text-white">
            <div className="flex items-center justify-between">
              <div>
                <DialogTitle className="text-lg font-black uppercase tracking-tight">Enregistrer un paiement</DialogTitle>
                <p className="text-xs font-bold text-emerald-200 mt-1">
                  {payInvoice && invoiceNumber(payInvoice)} · <span className="text-white uppercase font-black">{payInvoice?.clientName || 'Anonyme'}</span>
                </p>
              </div>
              <div className="text-right">
                <span className="text-[9px] font-black uppercase tracking-widest text-emerald-200">Solde Dû</span>
                <p className="text-2xl font-black text-white">{fmt$(payInvoiceRemaining)} MAD</p>
              </div>
            </div>

            {/* Suivi récapitulatif */}
            <div className="grid grid-cols-3 gap-3 mt-4 pt-4 border-t border-white/10 text-center">
              <div className="bg-white/10 rounded-xl p-2.5">
                <span className="text-[8px] font-black uppercase tracking-widest text-emerald-200">Reste Dû</span>
                <p className="text-sm font-black text-white mt-0.5">{fmt$(payInvoiceRemaining)} MAD</p>
              </div>
              <div className="bg-white/10 rounded-xl p-2.5">
                <span className="text-[8px] font-black uppercase tracking-widest text-emerald-200">Total Saisi</span>
                <p className="text-sm font-black text-white mt-0.5">{fmt$(totalInvoicePaymentEntered)} MAD</p>
              </div>
              <div className="bg-white/10 rounded-xl p-2.5">
                <span className="text-[8px] font-black uppercase tracking-widest text-emerald-200">État</span>
                <p className={`text-sm font-black mt-0.5 ${
                  totalInvoicePaymentEntered === 0 ? 'text-emerald-200' :
                  diffInvoiceBalance === 0 ? 'text-emerald-300' :
                  diffInvoiceBalance > 0 ? 'text-amber-300' : 'text-cyan-200'
                }`}>
                  {totalInvoicePaymentEntered === 0 ? 'En attente' :
                   diffInvoiceBalance === 0 ? 'Soldé (100%)' :
                   diffInvoiceBalance > 0 ? `Reste ${fmt$(diffInvoiceBalance)}` : `+${fmt$(-diffInvoiceBalance)} avance`}
                </p>
              </div>
            </div>
          </div>

          <div className="p-5 space-y-4 bg-white max-h-[72vh] overflow-y-auto">
            <div className="flex items-center gap-3">
              <Label className="text-[10px] font-black text-stone-500 uppercase tracking-widest shrink-0">Date de transaction :</Label>
              <Input
                type="date"
                value={payDate}
                onChange={e => setPayDate(e.target.value)}
                className="h-10 rounded-xl border-stone-200 font-bold text-xs max-w-xs"
              />
            </div>

            {/* Lignes de paiements */}
            <div className="space-y-4 pt-2">
              <div className="flex items-center justify-between">
                <Label className="text-[10px] font-black text-stone-800 uppercase tracking-widest">
                  Modes de règlement ({payLines.length})
                </Label>
                <div className="flex items-center gap-1.5">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => addPayLine('CASH')}
                    className="h-7 text-[9px] font-black rounded-lg uppercase tracking-wider text-stone-600 hover:text-emerald-700 hover:border-emerald-300">
                    + Espèces
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => addPayLine('CHEQUE')}
                    className="h-7 text-[9px] font-black rounded-lg uppercase tracking-wider text-stone-600 hover:text-blue-700 hover:border-blue-300">
                    + Chèque
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => addPayLine('EFFET')}
                    className="h-7 text-[9px] font-black rounded-lg uppercase tracking-wider text-stone-600 hover:text-amber-700 hover:border-amber-300">
                    + LC (Effet)
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => addPayLine('VIREMENT')}
                    className="h-7 text-[9px] font-black rounded-lg uppercase tracking-wider text-stone-600 hover:text-purple-700 hover:border-purple-300">
                    + Virement
                  </Button>
                </div>
              </div>

              {payLines.map((line, idx) => (
                <div key={line.id} className="p-4 rounded-2xl border-2 border-stone-100 bg-stone-50/60 hover:border-stone-200 transition-all space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="text-[9px] font-black uppercase tracking-wider px-2 py-0.5 rounded-lg bg-stone-200 text-stone-700">
                      Règlement #{idx + 1}
                    </span>
                    {payLines.length > 1 && (
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        onClick={() => removePayLine(line.id)}
                        className="h-7 w-7 p-0 text-red-500 hover:text-red-700 hover:bg-red-50 rounded-lg">
                        <Trash2 className="w-3.5 h-3.5" />
                      </Button>
                    )}
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div className="space-y-1">
                      <Label className="text-[9px] font-black text-stone-500 uppercase tracking-widest">Mode de paiement *</Label>
                      <Select value={line.method} onValueChange={v => updatePayLine(line.id, { method: v as PaymentMethod })}>
                        <SelectTrigger className="h-10 rounded-xl border-stone-200 bg-white font-bold text-xs">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="CASH">💵 Espèces (Cash)</SelectItem>
                          <SelectItem value="CHEQUE">📄 Chèque</SelectItem>
                          <SelectItem value="EFFET">📜 LC (Lettre de Change / Effet)</SelectItem>
                          <SelectItem value="VIREMENT">🏦 Virement bancaire</SelectItem>
                          <SelectItem value="AUTRE">📋 Autre mode</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>

                    <div className="space-y-1">
                      <div className="flex justify-between items-center">
                        <Label className="text-[9px] font-black text-stone-500 uppercase tracking-widest">Montant (MAD) *</Label>
                        {diffInvoiceBalance > 0 && parseFloat(line.amount || '0') !== payInvoiceRemaining && (
                          <button
                            type="button"
                            onClick={() => {
                              const otherSum = payLines.filter(l => l.id !== line.id).reduce((s, l) => s + (parseFloat(l.amount) || 0), 0);
                              updatePayLine(line.id, { amount: String(Math.max(0, payInvoiceRemaining - otherSum)) });
                            }}
                            className="text-[8px] font-bold text-emerald-600 hover:underline">
                            Compléter le reste
                          </button>
                        )}
                      </div>
                      <Input
                        type="number"
                        min={0}
                        step="any"
                        placeholder="0.00"
                        value={line.amount}
                        onChange={e => updatePayLine(line.id, { amount: e.target.value })}
                        className="h-10 text-base font-black rounded-xl border-stone-200 bg-white"
                      />
                    </div>
                  </div>

                  {/* Champs spécifiques : Chèque ou LC (Effet) */}
                  {(line.method === 'CHEQUE' || line.method === 'EFFET' || line.method === 'LC' || line.method === 'LCN') && (
                    <div className="pt-3 border-t border-stone-200/60 space-y-3">
                      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                        <div className="space-y-1">
                          <Label className="text-[9px] font-black text-stone-500 uppercase tracking-widest">Banque</Label>
                          <Input
                            placeholder="Ex: Attijariwafa, BCP, BMCE..."
                            value={line.bankName}
                            onChange={e => updatePayLine(line.id, { bankName: e.target.value })}
                            className="h-9 rounded-xl border-stone-200 bg-white text-xs font-bold"
                          />
                        </div>
                        <div className="space-y-1">
                          <Label className="text-[9px] font-black text-stone-500 uppercase tracking-widest">
                            {line.method === 'CHEQUE' ? 'N° de Chèque' : 'N° LC / Effet'}
                          </Label>
                          <Input
                            placeholder={line.method === 'CHEQUE' ? 'Ex: CHQ-987654' : 'Ex: LC-123456'}
                            value={line.checkNumber}
                            onChange={e => updatePayLine(line.id, { checkNumber: e.target.value })}
                            className="h-9 rounded-xl border-stone-200 bg-white text-xs font-bold"
                          />
                        </div>
                        <div className="space-y-1">
                          <Label className="text-[9px] font-black text-stone-500 uppercase tracking-widest">Date d'échéance</Label>
                          <Input
                            type="date"
                            value={line.dueDate}
                            onChange={e => updatePayLine(line.id, { dueDate: e.target.value })}
                            className="h-9 rounded-xl border-stone-200 bg-white text-xs font-bold"
                          />
                        </div>
                      </div>

                      <div className="space-y-1">
                        <Label className="text-[9px] font-black text-stone-500 uppercase tracking-widest">Photo / Scan (Optionnel)</Label>
                        <div className="relative border border-dashed border-stone-300 rounded-xl p-3 bg-white hover:bg-stone-50 transition-colors flex items-center justify-between">
                          {line.scannedImageUrl ? (
                            <div className="flex items-center gap-3 w-full">
                              <img src={line.scannedImageUrl} alt="Scan" className="w-16 h-10 rounded object-contain bg-stone-100" />
                              <span className="text-[10px] font-bold text-emerald-600">Scan joint</span>
                              <Button
                                type="button"
                                variant="ghost"
                                size="sm"
                                onClick={() => updatePayLine(line.id, { scannedImageUrl: '' })}
                                className="ml-auto h-7 text-[9px] text-red-600 font-black">
                                Supprimer
                              </Button>
                            </div>
                          ) : (
                            <label className="flex items-center gap-2 cursor-pointer w-full text-stone-500 hover:text-stone-700">
                              <CreditCard className="w-4 h-4 text-stone-400" />
                              <span className="text-[10px] font-bold">Ajouter une photo du chèque / LC</span>
                              <input
                                type="file"
                                accept="image/*"
                                className="sr-only"
                                onChange={e => {
                                  const file = e.target.files?.[0];
                                  if (file) {
                                    const reader = new FileReader();
                                    reader.onloadend = () => updatePayLine(line.id, { scannedImageUrl: reader.result as string });
                                    reader.readAsDataURL(file);
                                  }
                                }}
                              />
                            </label>
                          )}
                        </div>
                      </div>
                    </div>
                  )}

                  {/* Champs spécifiques : Virement */}
                  {line.method === 'VIREMENT' && (
                    <div className="pt-3 border-t border-stone-200/60 grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <div className="space-y-1">
                        <Label className="text-[9px] font-black text-stone-500 uppercase tracking-widest">Banque</Label>
                        <Input
                          placeholder="Ex: Attijariwafa, CIH..."
                          value={line.bankName}
                          onChange={e => updatePayLine(line.id, { bankName: e.target.value })}
                          className="h-9 rounded-xl border-stone-200 bg-white text-xs font-bold"
                        />
                      </div>
                      <div className="space-y-1">
                        <Label className="text-[9px] font-black text-stone-500 uppercase tracking-widest">N° Référence Virement</Label>
                        <Input
                          placeholder="Ex: VIR-2026-9901"
                          value={line.checkNumber}
                          onChange={e => updatePayLine(line.id, { checkNumber: e.target.value })}
                          className="h-9 rounded-xl border-stone-200 bg-white text-xs font-bold"
                        />
                      </div>
                    </div>
                  )}

                  <div className="space-y-1">
                    <Label className="text-[9px] font-black text-stone-500 uppercase tracking-widest">Notes / Réf.</Label>
                    <Input
                      placeholder="Commentaire sur ce versement..."
                      value={line.notes}
                      onChange={e => updatePayLine(line.id, { notes: e.target.value })}
                      className="h-9 rounded-xl border-stone-200 bg-white text-xs font-bold"
                    />
                  </div>
                </div>
              ))}

              <Button
                type="button"
                variant="outline"
                onClick={() => addPayLine()}
                className="w-full h-11 rounded-2xl border-dashed border-2 border-stone-300 hover:border-emerald-500 text-stone-600 hover:text-emerald-700 font-black uppercase text-[10px] tracking-widest gap-2">
                <Plus className="w-4 h-4" /> Ajouter un autre moyen de paiement (Chèque, LC, Virement, Espèces...)
              </Button>
            </div>
          </div>

          <DialogFooter className="p-4 bg-stone-50 border-t border-stone-100 gap-2">
            <Button variant="ghost" onClick={() => setPayInvoice(null)} className="flex-1 font-black uppercase text-[10px] rounded-xl h-11">Annuler</Button>
            <Button onClick={handlePayment} disabled={totalInvoicePaymentEntered <= 0 || saving}
              className="flex-[2] bg-emerald-600 hover:bg-emerald-700 text-white font-black uppercase text-[10px] h-11 rounded-xl shadow-lg shadow-emerald-600/20">
              {saving ? 'Enregistrement...' : `Confirmer le paiement (${fmt$(totalInvoicePaymentEntered)} MAD)`}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Modal voir facture */}
      <Dialog open={!!viewInvoice} onOpenChange={o => !o && setViewInvoice(null)}>
        <DialogContent className="sm:max-w-2xl rounded-3xl border-none shadow-2xl p-0 overflow-hidden max-h-[90vh] flex flex-col">
          <div className="bg-gradient-to-r from-violet-800 to-violet-700 p-6 text-white shrink-0">
            <DialogTitle className="text-lg font-black uppercase tracking-tight">{viewInvoice && invoiceNumber(viewInvoice)}</DialogTitle>
            <p className="text-[10px] font-bold text-violet-200 mt-1">
              {viewInvoice?.date} · {viewInvoice?.clientName || 'Anonyme'}
            </p>
          </div>
          <div className="overflow-y-auto flex-1 bg-white">
            <table className="w-full">
              <thead><tr className="bg-stone-50 border-b border-stone-100">
                {['Produit', 'Couleur', 'Taille', 'Qté', 'Prix unit.', 'Total'].map(h => (
                  <th key={h} className="px-4 py-3 text-left text-[8px] font-black uppercase tracking-widest text-stone-400">{h}</th>
                ))}
              </tr></thead>
              <tbody className="divide-y divide-stone-50">
                {viewInvoice?.items.map((item, i) => (
                  <tr key={i}>
                    <td className="px-4 py-3 text-[10px] font-black text-stone-800">{item.productName}</td>
                    <td className="px-4 py-3 text-[10px] font-bold text-stone-500">{item.color || '—'}</td>
                    <td className="px-4 py-3 text-[10px] font-bold text-stone-500">{item.size || '—'}</td>
                    <td className="px-4 py-3 text-[10px] font-black text-stone-900">{item.qty} {item.unitOfMeasure}</td>
                    <td className="px-4 py-3 text-[10px] font-bold text-stone-600">{fmt$(item.unitPrice)}</td>
                    <td className="px-4 py-3 text-[10px] font-black text-stone-900">{fmt$(item.totalPrice)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <div className="p-5 border-t border-stone-100 space-y-1 text-right">
              <p className="text-[10px] font-bold text-stone-500">Sous-total : {fmt$(viewInvoice?.totalAmount || 0)}</p>
              {(viewInvoice?.discount || 0) > 0 && <p className="text-[10px] font-bold text-emerald-600">Remise {viewInvoice?.discount}%</p>}
              <p className="text-xl font-black text-stone-900">Total : {fmt$(viewInvoice?.totalAfterDiscount || 0)}</p>
              <p className="text-sm font-bold text-emerald-600">Payé : {fmt$(viewInvoice?.paidAmount || 0)}</p>
              <p className={`text-base font-black ${(viewInvoice?.remainingBalance || 0) > 0 ? 'text-red-600' : 'text-emerald-600'}`}>
                Solde dû : {fmt$(viewInvoice?.remainingBalance || 0)}
              </p>
            </div>
            {/* Historique paiements */}
            {viewInvoice && invPayments(viewInvoice.id).length > 0 && (
              <div className="border-t border-stone-100 p-5">
                <p className="text-[9px] font-black text-stone-400 uppercase tracking-widest mb-3">Historique des paiements</p>
                <div className="space-y-2">
                  {invPayments(viewInvoice.id).map(p => (
                    <div key={p.id} className="flex justify-between items-center bg-emerald-50 rounded-xl px-4 py-2.5">
                      <div>
                        <span className="text-[9px] font-black bg-stone-100 text-stone-600 px-2 py-0.5 rounded uppercase mr-2">{p.method}</span>
                        <span className="text-[9px] font-bold text-stone-500">{p.date}</span>
                        {p.notes && <span className="text-[9px] text-stone-400 ml-2">· {p.notes}</span>}
                      </div>
                      <span className="font-black text-emerald-700">{fmt$(p.amount)}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
          <div className="p-4 bg-stone-50 flex gap-2 shrink-0">
            <Button variant="ghost" onClick={() => viewInvoice && printInvoice(viewInvoice)} className="gap-2 font-black uppercase text-[10px] rounded-xl">
              <Printer className="w-3.5 h-3.5" /> Imprimer
            </Button>
            {viewInvoice && viewInvoice.status !== 'PAID' && viewInvoice.status !== 'CANCELLED' && (
              <Button onClick={() => { const inv = viewInvoice; setViewInvoice(null); openPayInvoice(inv); }}
                className="bg-emerald-600 hover:bg-emerald-700 text-white font-black uppercase text-[10px] h-10 px-5 rounded-xl gap-2">
                <CreditCard className="w-3.5 h-3.5" /> Paiement
              </Button>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
