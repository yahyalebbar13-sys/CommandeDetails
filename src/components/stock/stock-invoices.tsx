"use client";

import React, { useState, useMemo } from 'react';
import { Search, Eye, Printer, CreditCard, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import type { Invoice, InvoiceStatus, Client, ClientPayment, PaymentMethod } from '@/lib/types';

interface StockInvoicesProps {
  invoices: Invoice[];
  clients: Client[];
  payments: ClientPayment[];
  onRecordPayment: (payment: Omit<ClientPayment, 'id' | 'createdAt'>) => Promise<void>;
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

export default function StockInvoices({ invoices, clients, payments, onRecordPayment, onUpdateStatus, onNavigate }: StockInvoicesProps) {
  const [filterStatus, setFilterStatus] = useState<string>('all');
  const [filterMonth,  setFilterMonth]  = useState<string>('all');
  const [search, setSearch] = useState('');

  const [viewInvoice,   setViewInvoice]   = useState<Invoice | null>(null);
  const [payInvoice,    setPayInvoice]    = useState<Invoice | null>(null);
  const [paymentForm,   setPaymentForm]   = useState({ 
    amount: '', 
    method: 'CASH' as PaymentMethod, 
    date: new Date().toISOString().split('T')[0], 
    notes: '',
    bankName: '',
    checkNumber: '',
    dueDate: '',
    scannedImageUrl: ''
  });
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

  const handlePayment = async () => {
    if (!payInvoice || !paymentForm.amount || saving) return;
    setSaving(true);
    try {
      const amount = parseFloat(paymentForm.amount);
      await onRecordPayment({
        clientId: payInvoice.clientId || '',
        invoiceId: payInvoice.id,
        amount,
        date: paymentForm.date,
        method: paymentForm.method,
        notes: paymentForm.notes || undefined,
        ...((paymentForm.method === 'CHEQUE' || paymentForm.method === 'EFFET') ? {
           bankName: paymentForm.bankName || undefined,
           checkNumber: paymentForm.checkNumber || undefined,
           dueDate: paymentForm.dueDate || undefined,
           scannedImageUrl: paymentForm.scannedImageUrl || undefined,
           status: 'PENDING'
        } : {})
      });
      setPayInvoice(null);
      setPaymentForm({ amount: '', method: 'CASH', date: new Date().toISOString().split('T')[0], notes: '', bankName: '', checkNumber: '', dueDate: '', scannedImageUrl: '' });
    } finally { setSaving(false); }
  };

  const printInvoice = (inv: Invoice) => {
    const num = invoiceNumber(inv);
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
    .footer{margin-top:40px;text-align:center;font-size:10px;color:#a8a29e;border-top:1px solid #e7e5e4;padding-top:16px}
    </style></head><body>
    <div class="header">
      <div>
        <img src="${window.location.origin}/logo_lebtex.png" alt="LEBTEX" style="height: 120px; margin-bottom: 15px; display: block;" />
        <div class="label" style="color:#6d28d9;font-size:10px">FACTURE</div>
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
      </div>
    </div>
    <table><thead><tr>
      <th>Produit</th><th>Couleur</th><th>Taille</th><th>Qté</th><th>Prix unit.</th><th>Total</th>
    </tr></thead>
    <tbody>${inv.items.map(item => `<tr>
      <td><strong>${item.productName}</strong></td><td>${item.color || '—'}</td><td>${item.size || '—'}</td>
      <td>${item.qty} ${item.unitOfMeasure}</td><td>${fmt$(item.unitPrice)}</td><td><strong>${fmt$(item.totalPrice)}</strong></td>
    </tr>`).join('')}</tbody></table>
    <div style="text-align:right;border-top:1px solid #e7e5e4;padding-top:12px">
      <div style="color:#78716c;margin-bottom:4px;font-size:12px">Sous-total : ${fmt$(inv.totalAmount)}</div>
      ${(inv.discount || 0) > 0 ? `<div style="color:#059669;margin-bottom:4px;font-size:12px">Remise ${inv.discount}% : -${fmt$(inv.totalAmount * (inv.discount || 0) / 100)}</div>` : ''}
      <div class="total-row">Total TTC : ${fmt$(inv.totalAfterDiscount)}</div>
      <div style="color:#059669;margin-top:8px;font-size:12px">Payé : ${fmt$(inv.paidAmount)}</div>
      <div style="color:#dc2626;font-size:14px;font-weight:700">Solde dû : ${fmt$(inv.remainingBalance)}</div>
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
          <h1 className="text-3xl font-black text-white uppercase tracking-tighter mb-4">Factures <span className="text-violet-300">Clients</span></h1>
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
          <Input placeholder="Rechercher client, N° facture..." value={search} onChange={e => setSearch(e.target.value)}
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
      </div>

      {/* Liste */}
      <div className="bg-white rounded-2xl shadow-xl border border-stone-100 overflow-hidden">
        {filtered.length === 0 ? (
          <p className="text-center text-stone-300 font-black uppercase text-[10px] py-16">Aucune facture</p>
        ) : (
          <>
            <table className="w-full">
              <thead><tr className="bg-stone-50 border-b border-stone-100">
                {['N° Facture', 'Date', 'Échéance', 'Client', 'Montant', 'Payé', 'Solde Dû', 'Statut', 'Actions'].map(h => (
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
                            <button onClick={() => { setPayInvoice(inv); setPaymentForm(f => ({ ...f, amount: String(inv.remainingBalance) })); }}
                              title="Enregistrer paiement"
                              className="w-7 h-7 rounded-lg bg-emerald-100 hover:bg-emerald-200 text-emerald-700 flex items-center justify-center">
                              <CreditCard className="w-3 h-3" />
                            </button>
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

      {/* Modal paiement */}
      <Dialog open={!!payInvoice} onOpenChange={o => !o && setPayInvoice(null)}>
        <DialogContent className="sm:max-w-xl rounded-3xl border-none shadow-2xl p-0 overflow-hidden">
          <div className="bg-gradient-to-r from-emerald-700 to-emerald-600 p-6 text-white">
            <DialogTitle className="text-base font-black uppercase tracking-tight">Enregistrer un paiement</DialogTitle>
            <p className="text-[10px] font-bold text-emerald-200 mt-1">
              {payInvoice && invoiceNumber(payInvoice)} · {payInvoice?.clientName || 'Anonyme'}
            </p>
            <p className="text-lg font-black text-white mt-2">Solde : {fmt$(payInvoice?.remainingBalance || 0)}</p>
          </div>
          <div className="p-5 space-y-3 bg-white max-h-[70vh] overflow-y-auto">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label className="text-[9px] font-black text-stone-500 uppercase tracking-widest">Montant *</Label>
                <Input type="number" min={0} step="any" value={paymentForm.amount}
                  onChange={e => setPaymentForm(f => ({ ...f, amount: e.target.value }))}
                  className="h-11 text-lg font-black rounded-xl border-stone-200" autoFocus />
              </div>
              <div className="space-y-1.5">
                <Label className="text-[9px] font-black text-stone-500 uppercase tracking-widest">Méthode *</Label>
                <Select value={paymentForm.method} onValueChange={v => setPaymentForm(f => ({ ...f, method: v as PaymentMethod }))}>
                  <SelectTrigger className="h-11 rounded-xl border-stone-200 font-bold text-xs"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="CASH">💵 Espèces</SelectItem>
                    <SelectItem value="VIREMENT">🏦 Virement</SelectItem>
                    <SelectItem value="CHEQUE">📄 Chèque</SelectItem>
                    <SelectItem value="EFFET">📜 Effet Bancaire</SelectItem>
                    <SelectItem value="AUTRE">📋 Autre</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label className="text-[9px] font-black text-stone-500 uppercase tracking-widest">Date *</Label>
                <Input type="date" value={paymentForm.date}
                  onChange={e => setPaymentForm(f => ({ ...f, date: e.target.value }))}
                  className="h-11 rounded-xl border-stone-200 font-bold text-xs" />
              </div>
              <div className="space-y-1.5">
                <Label className="text-[9px] font-black text-stone-500 uppercase tracking-widest">Notes / Réf.</Label>
                <Input placeholder="Infos supplémentaires..." value={paymentForm.notes}
                  onChange={e => setPaymentForm(f => ({ ...f, notes: e.target.value }))}
                  className="h-11 rounded-xl border-stone-200 font-bold text-xs" />
              </div>
            </div>

            {(paymentForm.method === 'CHEQUE' || paymentForm.method === 'EFFET') && (
              <div className="pt-4 border-t border-stone-100 mt-4 space-y-4">
                <h4 className="text-[10px] font-black text-stone-800 uppercase tracking-widest flex items-center gap-2">
                  <CreditCard className="w-4 h-4 text-emerald-600" /> Détails Bancaires
                </h4>
                
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-1.5">
                    <Label className="text-[9px] font-black text-stone-500 uppercase tracking-widest">Nom de la Banque</Label>
                    <Input placeholder="Ex: Attijariwafa Bank" value={paymentForm.bankName}
                      onChange={e => setPaymentForm(f => ({ ...f, bankName: e.target.value }))}
                      className="h-10 rounded-xl border-stone-200 text-xs font-bold" />
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-[9px] font-black text-stone-500 uppercase tracking-widest">N° Chèque / Effet</Label>
                    <Input placeholder="Ex: 0123456" value={paymentForm.checkNumber}
                      onChange={e => setPaymentForm(f => ({ ...f, checkNumber: e.target.value }))}
                      className="h-10 rounded-xl border-stone-200 text-xs font-bold" />
                  </div>
                </div>

                <div className="space-y-1.5">
                  <Label className="text-[9px] font-black text-stone-500 uppercase tracking-widest">Date d'échéance prévue</Label>
                  <Input type="date" value={paymentForm.dueDate}
                    onChange={e => setPaymentForm(f => ({ ...f, dueDate: e.target.value }))}
                    className="h-10 rounded-xl border-stone-200 text-xs font-bold" />
                </div>

                <div className="space-y-1.5">
                  <Label className="text-[9px] font-black text-stone-500 uppercase tracking-widest">Scan du document (Photo)</Label>
                  <div className="relative border-2 border-dashed border-stone-200 rounded-xl p-4 hover:bg-stone-50 transition-colors flex flex-col items-center justify-center text-center">
                    {paymentForm.scannedImageUrl ? (
                      <div className="relative w-full">
                        <img src={paymentForm.scannedImageUrl} alt="Scan" className="w-full rounded-lg max-h-40 object-contain" />
                        <button type="button" onClick={() => setPaymentForm(f => ({ ...f, scannedImageUrl: '' }))} className="absolute -top-2 -right-2 bg-red-500 text-white rounded-full p-1 shadow-md">
                          <X className="w-3 h-3" />
                        </button>
                      </div>
                    ) : (
                      <>
                        <CreditCard className="w-6 h-6 text-stone-300 mb-2" />
                        <span className="text-[10px] font-bold text-stone-500">Cliquez ou prenez une photo</span>
                        <input type="file" accept="image/*" capture="environment" className="absolute inset-0 opacity-0 cursor-pointer" onChange={(e) => {
                          const file = e.target.files?.[0];
                          if (file) {
                            const reader = new FileReader();
                            reader.onloadend = () => setPaymentForm(f => ({ ...f, scannedImageUrl: reader.result as string }));
                            reader.readAsDataURL(file);
                          }
                        }} />
                      </>
                    )}
                  </div>
                </div>
              </div>
            )}
          </div>
          <DialogFooter className="p-4 bg-stone-50 gap-2">
            <Button variant="ghost" onClick={() => setPayInvoice(null)} className="flex-1 font-black uppercase text-[10px] rounded-xl">Annuler</Button>
            <Button onClick={handlePayment} disabled={!paymentForm.amount || saving}
              className="flex-[2] bg-emerald-600 hover:bg-emerald-700 text-white font-black uppercase text-[10px] h-11 rounded-xl">
              {saving ? 'Enregistrement...' : 'Confirmer le paiement'}
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
              <Button onClick={() => { const inv = viewInvoice; setViewInvoice(null); setPayInvoice(inv); setPaymentForm(f => ({ ...f, amount: String(inv.remainingBalance) })); }}
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
