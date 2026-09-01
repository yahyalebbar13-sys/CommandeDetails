"use client";

import React, { useState, useMemo } from 'react';
import { UserPlus, Search, Phone, Mail, MapPin, FileText, CreditCard, ChevronLeft, Edit2, Check, X, TrendingDown, Printer } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import type { Client, SaleOrder, Invoice, ClientPayment, PaymentMethod } from '@/lib/types';

interface StockClientsProps {
  clients: Client[];
  orders: SaleOrder[];
  invoices: Invoice[];
  payments: ClientPayment[];
  onCreateClient: (c: Omit<Client, 'id' | 'createdAt'>) => Promise<void>;
  onUpdateClient: (id: string, c: Partial<Client>) => Promise<void>;
  onRecordPayment?: (payment: Omit<ClientPayment, 'id' | 'createdAt'>) => Promise<void>;
  onNavigate: (v: any) => void;
}

const fmt$ = (n: number) => n.toLocaleString('fr-MA', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

const CATEGORY_BADGE: Record<string, { label: string; cls: string }> = {
  GROSSISTE:       { label: 'Grossiste',       cls: 'bg-violet-100 text-violet-700' },
  SEMI_GROSSISTE:  { label: 'Semi-grossiste',  cls: 'bg-blue-100 text-blue-700' },
  DETAILLANT:      { label: 'Détaillant',       cls: 'bg-emerald-100 text-emerald-700' },
};

export default function StockClients({ clients, orders, invoices, payments, onCreateClient, onUpdateClient, onRecordPayment, onNavigate }: StockClientsProps) {
  const [search, setSearch] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('ALL');
  const [selected, setSelected] = useState<Client | null>(null);
  const [activeTab, setActiveTab] = useState<'orders' | 'invoices' | 'payments' | 'checks'>('invoices');
  const [createOpen, setCreateOpen] = useState(false);
  const [form, setForm] = useState({ name: '', phone: '', email: '', address: '', notes: '', category: '', ice: '', identifiantFiscal: '', creditLimit: 0, creditBlocked: false });
  const [saving, setSaving] = useState(false);
  const [editMode, setEditMode] = useState(false);
  const [editForm, setEditForm] = useState<Partial<Client>>({});
  
  const [globalPaymentOpen, setGlobalPaymentOpen] = useState(false);
  const [globalPaymentForm, setGlobalPaymentForm] = useState({ 
    amount: '', method: 'CASH' as PaymentMethod, date: new Date().toISOString().split('T')[0], notes: '',
    bankName: '', checkNumber: '', dueDate: '', scannedImageUrl: ''
  });

  const filtered = useMemo(() =>
    clients.filter(c => {
      const matchSearch = c.name.toLowerCase().includes(search.toLowerCase()) ||
        c.phone?.includes(search) ||
        c.email?.toLowerCase().includes(search.toLowerCase());
      const matchCat = categoryFilter === 'ALL' || c.category === categoryFilter;
      return matchSearch && matchCat;
    }),
    [clients, search, categoryFilter]
  );

  const { clientBalances, clientCAs, invoiceCounts, orderCounts } = useMemo(() => {
    const balances = new Map<string, number>();
    const cas = new Map<string, number>();
    const iCounts = new Map<string, number>();
    const oCounts = new Map<string, number>();
    
    for (const inv of invoices) {
      if (inv.clientId) {
        if (inv.status !== 'CANCELLED') {
          balances.set(inv.clientId, (balances.get(inv.clientId) || 0) + (inv.remainingBalance || 0));
          cas.set(inv.clientId, (cas.get(inv.clientId) || 0) + (inv.totalAfterDiscount || 0));
        }
        iCounts.set(inv.clientId, (iCounts.get(inv.clientId) || 0) + 1);
      }
    }
    for (const ord of orders) {
      if (ord.clientId) {
        oCounts.set(ord.clientId, (oCounts.get(ord.clientId) || 0) + 1);
      }
    }
    return { clientBalances: balances, clientCAs: cas, invoiceCounts: iCounts, orderCounts: oCounts };
  }, [invoices, orders]);

  const clientBalance = (clientId: string) => clientBalances.get(clientId) || 0;
  const clientCA = (clientId: string) => clientCAs.get(clientId) || 0;

  const handleCreate = async () => {
    if (!form.name.trim()) return;
    setSaving(true);
    try { await onCreateClient(form as any); setCreateOpen(false); setForm({ name: '', phone: '', email: '', address: '', notes: '', category: '', ice: '', identifiantFiscal: '', creditLimit: 0, creditBlocked: false }); }
    finally { setSaving(false); }
  };

  const handleSaveEdit = async () => {
    if (!selected) return;
    await onUpdateClient(selected.id, editForm);
    setEditMode(false);
  };

  const selOrders   = orders.filter(o => o.clientId === selected?.id);
  const selInvoices = invoices.filter(i => i.clientId === selected?.id);
  const selPayments = payments.filter(p => p.clientId === selected?.id);
  const selBalance  = selected ? clientBalance(selected.id) : 0;
  const selCA       = selected ? clientCA(selected.id) : 0;
  const selPaid     = selPayments.reduce((s, p) => s + p.amount, 0);

  const statusColors: Record<string, string> = {
    DRAFT: 'bg-stone-100 text-stone-500', CONFIRMED: 'bg-blue-100 text-blue-700',
    INVOICED: 'bg-emerald-100 text-emerald-700', CANCELLED: 'bg-red-100 text-red-600',
    UNPAID: 'bg-red-100 text-red-700', PARTIAL: 'bg-orange-100 text-orange-700',
    PAID: 'bg-emerald-100 text-emerald-700',
  };
  const statusLabels: Record<string, string> = {
    DRAFT: 'Brouillon', CONFIRMED: 'Confirmé', INVOICED: 'Facturé', CANCELLED: 'Annulé',
    UNPAID: 'Non payé', PARTIAL: 'Partiel', PAID: 'Payé',
  };

  const handleGlobalPayment = async () => {
    if (!selected || !globalPaymentForm.amount || !onRecordPayment) return;
    const amountReceived = parseFloat(globalPaymentForm.amount);
    if (amountReceived <= 0) return;
    setSaving(true);
    try {
      // Trier les factures impayées de la plus ancienne à la plus récente
      const unpaidInvoices = selInvoices
        .filter(i => i.status !== 'CANCELLED' && i.remainingBalance > 0)
        .sort((a, b) => a.date.localeCompare(b.date));

      let remainingToAllocate = amountReceived;
      
      for (const inv of unpaidInvoices) {
        if (remainingToAllocate <= 0) break;
        const allocated = Math.min(remainingToAllocate, inv.remainingBalance);
        
        await onRecordPayment({
          clientId: selected.id,
          invoiceId: inv.id,
          amount: allocated,
          date: globalPaymentForm.date,
          method: globalPaymentForm.method,
          notes: globalPaymentForm.notes || 'Paiement global de solde',
          ...((globalPaymentForm.method === 'CHEQUE' || globalPaymentForm.method === 'EFFET') ? {
             bankName: globalPaymentForm.bankName || undefined,
             checkNumber: globalPaymentForm.checkNumber || undefined,
             dueDate: globalPaymentForm.dueDate || undefined,
             scannedImageUrl: globalPaymentForm.scannedImageUrl || undefined,
             status: 'PENDING'
          } : {})
        });
        remainingToAllocate -= allocated;
      }
      setGlobalPaymentOpen(false);
      setGlobalPaymentForm({ amount: '', method: 'CASH', date: new Date().toISOString().split('T')[0], notes: '', bankName: '', checkNumber: '', dueDate: '', scannedImageUrl: '' });
    } finally {
      setSaving(false);
    }
  };

  const printClientStatement = () => {
    if (!selected) return;
    const w = window.open('', '_blank');
    if (!w) return;
    w.document.write(`<!DOCTYPE html><html><head><meta charset="utf-8"><title>Relevé - ${selected.name}</title>
    <style>body{font-family:Arial,sans-serif;max-width:800px;margin:40px auto;color:#1c1917}
    h1{font-size:24px;font-weight:900;text-transform:uppercase;letter-spacing:-0.05em;color:#4c1d95}
    .header{display:flex;justify-content:space-between;align-items:start;border-bottom:3px solid #6d28d9;padding-bottom:20px;margin-bottom:20px}
    .label{font-size:9px;font-weight:700;text-transform:uppercase;letter-spacing:0.1em;color:#78716c}
    table{width:100%;border-collapse:collapse;margin:20px 0}
    th{text-align:left;font-size:9px;text-transform:uppercase;letter-spacing:0.1em;color:#78716c;padding:8px;border-bottom:2px solid #e7e5e4}
    td{padding:10px 8px;border-bottom:1px solid #f5f5f4;font-size:12px}
    .total-box{background:#f5f3ff;border:2px solid #ddd6fe;padding:20px;border-radius:12px;text-align:right;margin-top:30px}
    .footer{margin-top:40px;text-align:center;font-size:10px;color:#a8a29e}
    </style></head><body>
    <div class="header">
      <div>
        <img src="${window.location.origin}/logo_lebtex.png" alt="LEBTEX" style="height: 120px; margin-bottom: 15px; display: block;" />
        <div class="label" style="color:#6d28d9;font-size:10px">RELEVÉ DE COMPTE</div>
        <h1>${selected.name}</h1>
      </div>
      <div style="text-align:right;font-size:12px">
        <div class="label">Date du relevé</div><strong>${new Date().toLocaleDateString('fr-FR')}</strong><br><br>
        ${selected.phone ? `Tél: ${selected.phone}<br>` : ''}
        ${selected.address ? `${selected.address}<br>` : ''}
      </div>
    </div>
    
    <h3 style="font-size:14px;color:#57534e;text-transform:uppercase;border-bottom:1px solid #e7e5e4;padding-bottom:5px">Historique des factures</h3>
    <table><thead><tr><th>Date</th><th>Facture N°</th><th>Statut</th><th style="text-align:right">Total</th><th style="text-align:right">Payé</th><th style="text-align:right">Reste dû</th></tr></thead>
    <tbody>${selInvoices.sort((a,b)=>a.date.localeCompare(b.date)).map(i => `<tr>
      <td>${i.date}</td><td><strong>${i.invoiceNumber || 'FAC-...'}</strong></td>
      <td>${statusLabels[i.status] || i.status}</td>
      <td style="text-align:right">${fmt$(i.totalAfterDiscount)}</td>
      <td style="text-align:right;color:#059669">${fmt$(i.paidAmount)}</td>
      <td style="text-align:right;font-weight:bold;color:${i.remainingBalance>0?'#dc2626':'#1c1917'}">${fmt$(i.remainingBalance)}</td>
    </tr>`).join('')}</tbody></table>
    
    <div class="total-box">
      <div class="label">Solde Total Dû</div>
      <div style="font-size:28px;font-weight:900;color:#6d28d9;margin-top:5px">${fmt$(selBalance)} MAD</div>
    </div>
    
    <div class="footer">Document généré automatiquement le ${new Date().toLocaleString('fr-FR')}</div>
    </body></html>`);
    w.document.close();
    w.print();
  };

  if (selected) return (
    <div className="space-y-5 animate-in fade-in duration-300">
      {/* Header client */}
      <div className="bg-gradient-to-br from-violet-900 to-violet-800 p-6 rounded-3xl shadow-xl">
        <button onClick={() => { setSelected(null); setEditMode(false); }} className="flex items-center gap-1.5 text-violet-300 hover:text-white text-[9px] font-black uppercase tracking-wider mb-3 transition-colors">
          <ChevronLeft className="w-3.5 h-3.5" /> Tous les clients
        </button>
        <div className="flex items-start justify-between gap-4">
          <div className="flex items-center gap-4">
            <div className="w-14 h-14 rounded-2xl bg-white/20 backdrop-blur text-white font-black text-2xl flex items-center justify-center shrink-0">
              {selected.name[0].toUpperCase()}
            </div>
            <div>
              {editMode ? (
                <Input value={editForm.name ?? selected.name} onChange={e => setEditForm(f => ({ ...f, name: e.target.value }))}
                  className="h-9 bg-white/20 border-white/30 text-white font-black text-lg rounded-xl" />
              ) : (
                <h2 className="text-2xl font-black text-white uppercase tracking-tighter">{selected.name}</h2>
              )}
              <div className="flex flex-wrap gap-3 mt-1">
                {(editMode ? (editForm.phone ?? selected.phone) : selected.phone) && (
                  <span className="text-[9px] font-bold text-violet-200 flex items-center gap-1">
                    <Phone className="w-2.5 h-2.5" /> {editMode ? editForm.phone ?? selected.phone : selected.phone}
                  </span>
                )}
                {(editMode ? (editForm.email ?? selected.email) : selected.email) && (
                  <span className="text-[9px] font-bold text-violet-200 flex items-center gap-1">
                    <Mail className="w-2.5 h-2.5" /> {editMode ? editForm.email ?? selected.email : selected.email}
                  </span>
                )}
              </div>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {editMode ? (
              <>
                <button onClick={handleSaveEdit} className="p-2 rounded-xl bg-white/20 hover:bg-white/30 text-white"><Check className="w-4 h-4" /></button>
                <button onClick={() => setEditMode(false)} className="p-2 rounded-xl bg-white/10 hover:bg-white/20 text-white"><X className="w-4 h-4" /></button>
              </>
            ) : (
              <button onClick={() => { setEditMode(true); setEditForm({}); }}
                className="p-2.5 rounded-xl bg-white/10 hover:bg-white/20 text-white transition-colors">
                <Edit2 className="w-4 h-4" />
              </button>
            )}
          </div>
        </div>

        {/* KPIs */}
        <div className="grid grid-cols-3 gap-3 mt-5">
          {[
            { label: 'CA Total', value: fmt$(selCA), color: 'text-white' },
            { label: 'Total Payé', value: fmt$(selPaid), color: 'text-emerald-300' },
            { label: 'Solde Dû', value: fmt$(selBalance), color: selBalance > 0 ? 'text-red-300' : 'text-emerald-300' },
          ].map(({ label, value, color }) => (
            <div key={label} className="bg-white/10 rounded-xl p-3">
              <p className={`text-lg font-black ${color}`}>{value}</p>
              <p className="text-[8px] font-black text-violet-300 uppercase tracking-widest mt-0.5">{label}</p>
            </div>
          ))}
        </div>
        
        {/* Actions Rapides */}
        <div className="flex flex-wrap gap-2 mt-4 pt-4 border-t border-white/10">
          <Button onClick={() => { setGlobalPaymentForm(f => ({ ...f, amount: String(selBalance) })); setGlobalPaymentOpen(true); }} disabled={selBalance <= 0 || !onRecordPayment} className="bg-emerald-500 hover:bg-emerald-600 text-white font-black uppercase text-[10px] rounded-xl h-9">
            <CreditCard className="w-4 h-4 mr-2" /> Régler le solde
          </Button>
          <Button onClick={printClientStatement} className="bg-white/10 hover:bg-white/20 text-white font-black uppercase text-[10px] rounded-xl h-9">
            <Printer className="w-4 h-4 mr-2" /> Exporter Relevé (PDF)
          </Button>
        </div>
      </div>

      {editMode && (
        <div className="bg-white rounded-2xl shadow-lg border border-stone-100 p-5 grid grid-cols-2 gap-3 mt-4">
          {[
            { key: 'phone', label: 'Téléphone', placeholder: '+212 6...' },
            { key: 'email', label: 'Email', placeholder: 'email@example.com' },
            { key: 'address', label: 'Adresse', placeholder: 'Ville, quartier...' },
            { key: 'ice', label: 'ICE', placeholder: 'N° ICE' },
            { key: 'identifiantFiscal', label: 'IF', placeholder: 'Identifiant Fiscal' },
            { key: 'notes', label: 'Notes', placeholder: 'Remarques...' },
          ].map(({ key, label, placeholder }) => (
            <div key={key} className="space-y-1">
              <Label className="text-[9px] font-black text-stone-500 uppercase tracking-widest">{label}</Label>
              <Input value={(editForm as any)[key] ?? (selected as any)[key] ?? ''} placeholder={placeholder}
                onChange={e => setEditForm(f => ({ ...f, [key]: e.target.value }))}
                className="h-9 rounded-xl border-stone-200 font-bold text-sm" />
            </div>
          ))}
          <div className="space-y-1">
            <Label className="text-[9px] font-black text-stone-500 uppercase tracking-widest">Catégorie</Label>
            <Select value={editForm.category ?? selected.category ?? ''} onValueChange={v => setEditForm(f => ({ ...f, category: v as any }))}>
              <SelectTrigger className="h-9 rounded-xl border-stone-200 text-sm font-bold">
                <SelectValue placeholder="Catégorie" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="GROSSISTE">Grossiste</SelectItem>
                <SelectItem value="SEMI_GROSSISTE">Semi-grossiste</SelectItem>
                <SelectItem value="DETAILLANT">Détaillant</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <Label className="text-[9px] font-black text-stone-500 uppercase tracking-widest">Plafond de crédit</Label>
            <Input type="number" value={editForm.creditLimit ?? selected.creditLimit ?? ''} placeholder="0"
              onChange={e => setEditForm(f => ({ ...f, creditLimit: parseFloat(e.target.value) || 0 }))}
              className="h-9 rounded-xl border-stone-200 font-bold text-sm" />
          </div>
          <div className="col-span-2 flex items-center space-x-2 mt-2">
            <input type="checkbox" id="creditBlockedEdit" checked={editForm.creditBlocked ?? selected.creditBlocked ?? false}
              onChange={e => setEditForm(f => ({ ...f, creditBlocked: e.target.checked }))}
              className="rounded border-stone-300 w-4 h-4" />
            <Label htmlFor="creditBlockedEdit" className="text-sm font-bold text-red-600">Bloquer le crédit</Label>
          </div>
        </div>
      )}

      {/* Tabs */}
      <div className="flex gap-2 bg-stone-100 p-1 rounded-2xl w-fit">
        {[
          { id: 'invoices' as const, label: `Factures (${selInvoices.length})` },
          { id: 'orders' as const, label: `Commandes (${selOrders.length})` },
          { id: 'payments' as const, label: `Paiements (${selPayments.length})` },
          { id: 'checks' as const, label: `Chèques / LCN (${selPayments.filter(p => p.method === 'CHECK' || p.method === 'CHEQUE' || p.method === 'LCN' || p.method === 'EFFET').length})` },
        ].map(({ id, label }) => (
          <button key={id} onClick={() => setActiveTab(id)}
            className={`px-4 py-2 rounded-xl text-[10px] font-black uppercase tracking-wider transition-all ${
              activeTab === id ? 'bg-white shadow text-stone-900' : 'text-stone-400 hover:text-stone-600'
            }`}>{label}</button>
        ))}
      </div>

      <div className="bg-white rounded-2xl shadow-lg border border-stone-100 overflow-hidden">
        {activeTab === 'invoices' && (
          selInvoices.length === 0 ? <p className="text-center text-stone-300 font-black uppercase text-[10px] py-12">Aucune facture</p> :
          <table className="w-full">
            <thead><tr className="bg-stone-50 border-b border-stone-100">
              {['Date', 'Montant', 'Payé', 'Solde', 'Statut'].map(h => (
                <th key={h} className="px-4 py-3 text-left text-[8px] font-black uppercase tracking-widest text-stone-400">{h}</th>
              ))}
            </tr></thead>
            <tbody className="divide-y divide-stone-50">
              {selInvoices.sort((a,b) => b.date.localeCompare(a.date)).map(inv => (
                <tr key={inv.id} className="hover:bg-stone-50/50">
                  <td className="px-4 py-3 text-[10px] font-bold text-stone-500">{inv.date}</td>
                  <td className="px-4 py-3 text-[10px] font-black text-stone-900">{fmt$(inv.totalAfterDiscount)}</td>
                  <td className="px-4 py-3 text-[10px] font-bold text-emerald-600">{fmt$(inv.paidAmount)}</td>
                  <td className="px-4 py-3 text-[10px] font-black text-red-600">{fmt$(inv.remainingBalance)}</td>
                  <td className="px-4 py-3"><span className={`text-[8px] font-black uppercase px-2 py-0.5 rounded-lg ${statusColors[inv.status]}`}>{statusLabels[inv.status]}</span></td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
        {activeTab === 'orders' && (
          selOrders.length === 0 ? <p className="text-center text-stone-300 font-black uppercase text-[10px] py-12">Aucune commande</p> :
          <table className="w-full">
            <thead><tr className="bg-stone-50 border-b border-stone-100">
              {['Date', 'Articles', 'Total', 'Statut'].map(h => (
                <th key={h} className="px-4 py-3 text-left text-[8px] font-black uppercase tracking-widest text-stone-400">{h}</th>
              ))}
            </tr></thead>
            <tbody className="divide-y divide-stone-50">
              {selOrders.sort((a,b) => b.date.localeCompare(a.date)).map(ord => (
                <tr key={ord.id} className="hover:bg-stone-50/50">
                  <td className="px-4 py-3 text-[10px] font-bold text-stone-500">{ord.date}</td>
                  <td className="px-4 py-3 text-[10px] font-bold text-stone-600">{ord.items.length} article{ord.items.length > 1 ? 's' : ''}</td>
                  <td className="px-4 py-3 text-[10px] font-black text-stone-900">{fmt$(ord.totalAfterDiscount)}</td>
                  <td className="px-4 py-3"><span className={`text-[8px] font-black uppercase px-2 py-0.5 rounded-lg ${statusColors[ord.status]}`}>{statusLabels[ord.status]}</span></td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
        {activeTab === 'payments' && (
          selPayments.length === 0 ? <p className="text-center text-stone-300 font-black uppercase text-[10px] py-12">Aucun paiement</p> :
          <table className="w-full">
            <thead><tr className="bg-stone-50 border-b border-stone-100">
              {['Date', 'Montant', 'Méthode', 'Notes'].map(h => (
                <th key={h} className="px-4 py-3 text-left text-[8px] font-black uppercase tracking-widest text-stone-400">{h}</th>
              ))}
            </tr></thead>
            <tbody className="divide-y divide-stone-50">
              {selPayments.sort((a,b) => b.date.localeCompare(a.date)).map(p => (
                <tr key={p.id} className="hover:bg-stone-50/50">
                  <td className="px-4 py-3 text-[10px] font-bold text-stone-500">{p.date}</td>
                  <td className="px-4 py-3 text-[10px] font-black text-emerald-700">{fmt$(p.amount)}</td>
                  <td className="px-4 py-3"><span className="text-[8px] font-black bg-stone-100 text-stone-600 px-2 py-0.5 rounded uppercase">{p.method}</span></td>
                  <td className="px-4 py-3 text-[10px] text-stone-400 font-bold">{p.notes || '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
        {activeTab === 'checks' && (
          selPayments.filter(p => p.method === 'CHECK' || p.method === 'CHEQUE' || p.method === 'LCN' || p.method === 'EFFET').length === 0 
            ? <p className="text-center text-stone-300 font-black uppercase text-[10px] py-12">Aucun chèque ou effet</p> 
            : <table className="w-full">
                <thead>
                  <tr className="bg-stone-50 border-b border-stone-100">
                    {['Date saisie', 'Type', 'N° Pièce', 'Banque', 'Échéance', 'Montant'].map(h => (
                      <th key={h} className="px-4 py-3 text-left text-[8px] font-black uppercase tracking-widest text-stone-400">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-stone-50">
                  {selPayments
                    .filter(p => p.method === 'CHECK' || p.method === 'CHEQUE' || p.method === 'LCN' || p.method === 'EFFET')
                    .sort((a, b) => b.date.localeCompare(a.date))
                    .map(p => (
                    <tr key={p.id} className="hover:bg-stone-50/50">
                      <td className="px-4 py-3 text-[10px] font-bold text-stone-500">{p.date}</td>
                      <td className="px-4 py-3 text-[10px] font-black text-amber-700">
                        {(p.method === 'CHECK' || p.method === 'CHEQUE') ? 'CHÈQUE' : 'EFFET (LCN)'}
                      </td>
                      <td className="px-4 py-3 text-[10px] font-bold text-stone-900">{p.checkNumber || '—'}</td>
                      <td className="px-4 py-3 text-[10px] font-bold text-stone-600">{p.bankName || '—'}</td>
                      <td className="px-4 py-3 text-[10px] font-black text-rose-600">{p.dueDate || '—'}</td>
                      <td className="px-4 py-3 text-[10px] font-black text-stone-900">{fmt$(p.amount)} MAD</td>
                    </tr>
                  ))}
                </tbody>
              </table>
        )}
      </div>
    </div>
  );

  return (
    <div className="space-y-6 animate-in fade-in duration-300">
      <div className="bg-gradient-to-br from-violet-900 to-violet-800 p-8 rounded-3xl shadow-2xl relative overflow-hidden">
        <div className="absolute top-0 right-0 w-64 h-64 bg-violet-400/10 rounded-full -translate-y-1/2 translate-x-1/2 blur-3xl" />
        <div className="relative z-10 flex items-center justify-between gap-4">
          <div>
            <p className="text-[9px] font-black text-violet-300 uppercase tracking-[0.3em] mb-1">CRM</p>
            <h1 className="text-3xl font-black text-white uppercase tracking-tighter">Dossiers <span className="text-violet-300">Clients</span></h1>
            <p className="text-violet-300/70 text-xs font-bold mt-2">{clients.length} client{clients.length > 1 ? 's' : ''} enregistré{clients.length > 1 ? 's' : ''}</p>
          </div>
          <Button onClick={() => setCreateOpen(true)}
            className="bg-white hover:bg-stone-50 text-violet-800 font-black uppercase text-[10px] tracking-widest px-6 h-11 rounded-2xl gap-2 shrink-0">
            <UserPlus className="w-4 h-4" /> Nouveau client
          </Button>
        </div>
      </div>

      {/* KPIs globaux */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {[
          { label: 'Clients actifs', value: clients.length },
          { label: 'Factures ouvertes', value: invoices.filter(i => i.status !== 'PAID' && i.status !== 'CANCELLED').length },
          { label: 'CA Total', value: fmt$(invoices.reduce((s, i) => s + i.totalAfterDiscount, 0)) },
          { label: 'Solde Dû Global', value: fmt$(invoices.reduce((s, i) => s + i.remainingBalance, 0)) },
        ].map(({ label, value }) => (
          <div key={label} className="bg-white rounded-2xl shadow-xl border border-stone-100 p-5">
            <p className="text-2xl font-black text-stone-900">{value}</p>
            <p className="text-[8px] font-black text-stone-400 uppercase tracking-widest mt-1">{label}</p>
          </div>
        ))}
      </div>

      {/* Recherche */}
      <div className="flex gap-4">
        <div className="relative flex-1">
          <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-stone-400" />
          <Input placeholder="Rechercher par nom, téléphone, email..." value={search}
            onChange={e => setSearch(e.target.value)}
            className="pl-11 h-12 rounded-2xl border-stone-200 text-sm font-bold shadow-sm" />
        </div>
        <Select value={categoryFilter} onValueChange={setCategoryFilter}>
          <SelectTrigger className="w-48 h-12 rounded-2xl border-stone-200 text-sm font-bold shadow-sm bg-white">
            <SelectValue placeholder="Catégorie" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="ALL">Toutes les catégories</SelectItem>
            <SelectItem value="GROSSISTE">Grossiste</SelectItem>
            <SelectItem value="SEMI_GROSSISTE">Semi-grossiste</SelectItem>
            <SelectItem value="DETAILLANT">Détaillant</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Grille clients */}
      {filtered.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 bg-white rounded-2xl border border-stone-100">
          <p className="text-stone-300 font-black uppercase text-[10px] tracking-widest">Aucun client trouvé</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          {filtered.map(c => {
            const balance = clientBalance(c.id);
            const ca = clientCA(c.id);
            const nInv = invoiceCounts.get(c.id) || 0;
            const nOrd = orderCounts.get(c.id) || 0;
            return (
              <div key={c.id} className="bg-white rounded-2xl shadow-xl border border-stone-100 overflow-hidden hover:shadow-2xl hover:-translate-y-0.5 transition-all group">
                <div className="h-1.5 bg-gradient-to-r from-violet-500 to-violet-400" />
                <div className="p-5">
                  <div className="flex items-start gap-3 mb-4">
                    <div className="w-11 h-11 rounded-2xl bg-gradient-to-br from-violet-500 to-violet-700 text-white font-black text-lg flex items-center justify-center shrink-0 shadow-lg shadow-violet-500/30">
                      {c.name[0].toUpperCase()}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-0.5">
                        <p className="font-black text-stone-900 uppercase tracking-tight truncate">{c.name}</p>
                        {c.creditBlocked && <span className="bg-red-500 text-white text-[8px] font-black uppercase px-1.5 py-0.5 rounded">Bloqué</span>}
                      </div>
                      {c.category && CATEGORY_BADGE[c.category] && (
                        <span className={`inline-block text-[8px] font-black uppercase px-1.5 py-0.5 rounded mb-1 ${CATEGORY_BADGE[c.category].cls}`}>
                          {CATEGORY_BADGE[c.category].label}
                        </span>
                      )}
                      {c.ice && <p className="text-[9px] font-bold text-stone-500 mt-0.5">ICE: {c.ice}</p>}
                      {c.phone && <p className="text-[9px] font-bold text-stone-400 flex items-center gap-1 mt-0.5"><Phone className="w-2.5 h-2.5" />{c.phone}</p>}
                      {c.email && <p className="text-[9px] font-bold text-stone-400 flex items-center gap-1"><Mail className="w-2.5 h-2.5" />{c.email}</p>}
                    </div>
                  </div>

                  <div className="space-y-2 mb-4">
                    <div className="flex justify-between text-[9px] font-bold text-stone-400">
                      <span>{nOrd} commande{nOrd > 1 ? 's' : ''}</span>
                      <span>{nInv} facture{nInv > 1 ? 's' : ''}</span>
                    </div>
                    <div className="flex justify-between items-center">
                      <span className="text-[9px] font-black text-stone-500 uppercase">CA: {fmt$(ca)}</span>
                      <span className={`text-[9px] font-black px-2 py-0.5 rounded-lg ${
                        balance === 0 ? 'bg-emerald-100 text-emerald-700' :
                        balance < ca * 0.5 ? 'bg-orange-100 text-orange-700' :
                        'bg-red-100 text-red-700'
                      }`}>
                        Dû: {fmt$(balance)}
                      </span>
                    </div>
                    {c.creditLimit && c.creditLimit > 0 ? (
                      <div className="mt-2">
                        <div className="flex justify-between text-[8px] font-bold uppercase tracking-widest text-stone-400 mb-1">
                          <span>Crédit utilisé</span>
                          <span>{fmt$(balance)} / {fmt$(c.creditLimit)} MAD</span>
                        </div>
                        <div className="h-1.5 bg-stone-100 rounded-full overflow-hidden">
                          <div className={`h-full rounded-full transition-all ${(balance / c.creditLimit) * 100 > 90 ? 'bg-red-500' : (balance / c.creditLimit) * 100 > 70 ? 'bg-amber-500' : 'bg-emerald-500'}`}
                            style={{ width: `${Math.min(100, (balance / c.creditLimit) * 100)}%` }} />
                        </div>
                      </div>
                    ) : null}
                  </div>

                  <Button onClick={() => setSelected(c)}
                    className="w-full bg-stone-50 hover:bg-violet-50 hover:text-violet-700 text-stone-600 font-black uppercase text-[9px] h-9 rounded-xl border border-stone-100 hover:border-violet-200 transition-all">
                    Voir le dossier
                  </Button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Modal nouveau client */}
      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent className="sm:max-w-md rounded-3xl border-none shadow-2xl p-0 overflow-hidden">
          <div className="bg-gradient-to-r from-violet-700 to-violet-600 p-6 text-white">
            <DialogTitle className="text-lg font-black uppercase tracking-tight">Nouveau client</DialogTitle>
          </div>
          <div className="p-6 space-y-3 bg-white">
            {[
              { key: 'name', label: 'Nom *', placeholder: 'Nom complet ou raison sociale' },
              { key: 'phone', label: 'Téléphone', placeholder: '+212 6...' },
              { key: 'email', label: 'Email', placeholder: 'email@example.com' },
              { key: 'address', label: 'Adresse', placeholder: 'Casablanca, Maroc...' },
              { key: 'ice', label: 'ICE', placeholder: 'N° ICE' },
              { key: 'identifiantFiscal', label: 'IF', placeholder: 'Identifiant Fiscal' },
              { key: 'notes', label: 'Notes', placeholder: 'Informations complémentaires...' },
            ].map(({ key, label, placeholder }) => (
              <div key={key} className="space-y-1">
                <Label className="text-[9px] font-black text-stone-500 uppercase tracking-widest">{label}</Label>
                <Input value={(form as any)[key]} placeholder={placeholder}
                  onChange={e => setForm(f => ({ ...f, [key]: e.target.value }))}
                  className="h-10 rounded-xl border-stone-200 font-bold text-sm" />
              </div>
            ))}
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label className="text-[9px] font-black text-stone-500 uppercase tracking-widest">Catégorie</Label>
                <Select value={(form as any).category || undefined} onValueChange={v => setForm(f => ({ ...f, category: v }))}>
                  <SelectTrigger className="h-10 rounded-xl border-stone-200 font-bold text-sm"><SelectValue placeholder="Catégorie..." /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="GROSSISTE">Grossiste</SelectItem>
                    <SelectItem value="SEMI_GROSSISTE">Semi-grossiste</SelectItem>
                    <SelectItem value="DETAILLANT">Détaillant</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label className="text-[9px] font-black text-stone-500 uppercase tracking-widest">Plafond de crédit</Label>
                <Input type="number" value={(form as any).creditLimit || ''} placeholder="0"
                  onChange={e => setForm(f => ({ ...f, creditLimit: parseFloat(e.target.value) || 0 }))}
                  className="h-10 rounded-xl border-stone-200 font-bold text-sm" />
              </div>
            </div>
            <div className="flex items-center space-x-2 pt-2">
              <input type="checkbox" id="formCreditBlocked" checked={(form as any).creditBlocked || false}
                onChange={e => setForm(f => ({ ...f, creditBlocked: e.target.checked }))}
                className="rounded border-stone-300 w-4 h-4" />
              <Label htmlFor="formCreditBlocked" className="text-sm font-bold text-red-600">Bloquer le crédit dès la création</Label>
            </div>
          </div>
          <DialogFooter className="p-4 bg-stone-50 gap-2">
            <Button variant="ghost" onClick={() => setCreateOpen(false)} className="flex-1 font-black uppercase text-[10px] rounded-xl">Annuler</Button>
            <Button onClick={handleCreate} disabled={!form.name.trim() || saving}
              className="flex-[2] bg-violet-600 hover:bg-violet-700 text-white font-black uppercase text-[10px] h-11 rounded-xl">
              {saving ? 'Création...' : 'Créer le client'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      
      {/* Modal Paiement Global */}
      <Dialog open={globalPaymentOpen} onOpenChange={setGlobalPaymentOpen}>
        <DialogContent className="sm:max-w-xl rounded-3xl border-none shadow-2xl p-0 overflow-hidden">
          <div className="bg-gradient-to-r from-emerald-700 to-emerald-600 p-6 text-white">
            <DialogTitle className="text-base font-black uppercase tracking-tight">Paiement Global (Solde)</DialogTitle>
            <p className="text-[10px] font-bold text-emerald-200 mt-1">Client : {selected?.name}</p>
            <p className="text-lg font-black text-white mt-2">Solde Total Dû : {fmt$(selBalance)}</p>
          </div>
          <div className="p-5 space-y-3 bg-white max-h-[70vh] overflow-y-auto">
            <div className="bg-emerald-50 text-emerald-800 text-[10px] p-3 rounded-xl font-bold mb-4">
              Ce paiement sera automatiquement réparti sur les factures impayées du client, en commençant par les plus anciennes.
            </div>
            
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label className="text-[9px] font-black text-stone-500 uppercase tracking-widest">Montant Reçu *</Label>
                <Input type="number" min={0} max={selBalance} step="any" value={globalPaymentForm.amount}
                  onChange={e => setGlobalPaymentForm(f => ({ ...f, amount: e.target.value }))}
                  className="h-11 text-lg font-black rounded-xl border-stone-200" autoFocus />
              </div>
              <div className="space-y-1.5">
                <Label className="text-[9px] font-black text-stone-500 uppercase tracking-widest">Méthode *</Label>
                <Select value={globalPaymentForm.method} onValueChange={v => setGlobalPaymentForm(f => ({ ...f, method: v as PaymentMethod }))}>
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
                <Input type="date" value={globalPaymentForm.date}
                  onChange={e => setGlobalPaymentForm(f => ({ ...f, date: e.target.value }))}
                  className="h-11 rounded-xl border-stone-200 font-bold text-xs" />
              </div>
              <div className="space-y-1.5">
                <Label className="text-[9px] font-black text-stone-500 uppercase tracking-widest">Notes / Réf.</Label>
                <Input placeholder="Infos supplémentaires..." value={globalPaymentForm.notes}
                  onChange={e => setGlobalPaymentForm(f => ({ ...f, notes: e.target.value }))}
                  className="h-11 rounded-xl border-stone-200 font-bold text-xs" />
              </div>
            </div>

            {(globalPaymentForm.method === 'CHEQUE' || globalPaymentForm.method === 'EFFET') && (
              <div className="pt-4 border-t border-stone-100 mt-4 space-y-4">
                <h4 className="text-[10px] font-black text-stone-800 uppercase tracking-widest flex items-center gap-2">
                  <CreditCard className="w-4 h-4 text-emerald-600" /> Détails Bancaires
                </h4>
                
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-1.5">
                    <Label className="text-[9px] font-black text-stone-500 uppercase tracking-widest">Nom de la Banque</Label>
                    <Input placeholder="Ex: Attijariwafa Bank" value={globalPaymentForm.bankName}
                      onChange={e => setGlobalPaymentForm(f => ({ ...f, bankName: e.target.value }))}
                      className="h-10 rounded-xl border-stone-200 text-xs font-bold" />
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-[9px] font-black text-stone-500 uppercase tracking-widest">N° Chèque / Effet</Label>
                    <Input placeholder="Ex: 0123456" value={globalPaymentForm.checkNumber}
                      onChange={e => setGlobalPaymentForm(f => ({ ...f, checkNumber: e.target.value }))}
                      className="h-10 rounded-xl border-stone-200 text-xs font-bold" />
                  </div>
                </div>

                <div className="space-y-1.5">
                  <Label className="text-[9px] font-black text-stone-500 uppercase tracking-widest">Date d'échéance prévue</Label>
                  <Input type="date" value={globalPaymentForm.dueDate}
                    onChange={e => setGlobalPaymentForm(f => ({ ...f, dueDate: e.target.value }))}
                    className="h-10 rounded-xl border-stone-200 text-xs font-bold" />
                </div>

                <div className="space-y-1.5">
                  <Label className="text-[9px] font-black text-stone-500 uppercase tracking-widest">Scan du document (Photo)</Label>
                  <div className="relative border-2 border-dashed border-stone-200 rounded-xl p-4 hover:bg-stone-50 transition-colors flex flex-col items-center justify-center text-center">
                    {globalPaymentForm.scannedImageUrl ? (
                      <div className="relative w-full">
                        <img src={globalPaymentForm.scannedImageUrl} alt="Scan" className="w-full rounded-lg max-h-40 object-contain" />
                        <button type="button" onClick={() => setGlobalPaymentForm(f => ({ ...f, scannedImageUrl: '' }))} className="absolute -top-2 -right-2 bg-red-500 text-white rounded-full p-1 shadow-md">
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
                            reader.onloadend = () => setGlobalPaymentForm(f => ({ ...f, scannedImageUrl: reader.result as string }));
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
            <Button variant="ghost" onClick={() => setGlobalPaymentOpen(false)} className="flex-1 font-black uppercase text-[10px] rounded-xl">Annuler</Button>
            <Button onClick={handleGlobalPayment} disabled={!globalPaymentForm.amount || saving}
              className="flex-[2] bg-emerald-600 hover:bg-emerald-700 text-white font-black uppercase text-[10px] h-11 rounded-xl">
              {saving ? 'Validation...' : 'Valider le paiement'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
