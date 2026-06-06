"use client";

import React, { useState, useMemo } from 'react';
import { UserPlus, Search, Phone, Mail, MapPin, FileText, CreditCard, ChevronLeft, Edit2, Check, X, TrendingDown } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import type { Client, SaleOrder, Invoice, ClientPayment } from '@/lib/types';

interface StockClientsProps {
  clients: Client[];
  orders: SaleOrder[];
  invoices: Invoice[];
  payments: ClientPayment[];
  onCreateClient: (c: Omit<Client, 'id' | 'createdAt'>) => Promise<void>;
  onUpdateClient: (id: string, c: Partial<Client>) => Promise<void>;
  onNavigate: (v: any) => void;
}

const fmt$ = (n: number) => n.toLocaleString('fr-MA', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export default function StockClients({ clients, orders, invoices, payments, onCreateClient, onUpdateClient, onNavigate }: StockClientsProps) {
  const [search, setSearch] = useState('');
  const [selected, setSelected] = useState<Client | null>(null);
  const [activeTab, setActiveTab] = useState<'orders' | 'invoices' | 'payments'>('invoices');
  const [createOpen, setCreateOpen] = useState(false);
  const [form, setForm] = useState({ name: '', phone: '', email: '', address: '', notes: '' });
  const [saving, setSaving] = useState(false);
  const [editMode, setEditMode] = useState(false);
  const [editForm, setEditForm] = useState<Partial<Client>>({});

  const filtered = useMemo(() =>
    clients.filter(c =>
      c.name.toLowerCase().includes(search.toLowerCase()) ||
      c.phone?.includes(search) ||
      c.email?.toLowerCase().includes(search.toLowerCase())
    ),
    [clients, search]
  );

  const clientBalance = (clientId: string) =>
    invoices.filter(i => i.clientId === clientId && i.status !== 'CANCELLED').reduce((s, i) => s + i.remainingBalance, 0);

  const clientCA = (clientId: string) =>
    invoices.filter(i => i.clientId === clientId && i.status !== 'CANCELLED').reduce((s, i) => s + i.totalAfterDiscount, 0);

  const handleCreate = async () => {
    if (!form.name.trim()) return;
    setSaving(true);
    try { await onCreateClient(form); setCreateOpen(false); setForm({ name: '', phone: '', email: '', address: '', notes: '' }); }
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
      </div>

      {editMode && (
        <div className="bg-white rounded-2xl shadow-lg border border-stone-100 p-5 grid grid-cols-2 gap-3">
          {[
            { key: 'phone', label: 'Téléphone', placeholder: '+212 6...' },
            { key: 'email', label: 'Email', placeholder: 'email@example.com' },
            { key: 'address', label: 'Adresse', placeholder: 'Ville, quartier...' },
            { key: 'notes', label: 'Notes', placeholder: 'Remarques...' },
          ].map(({ key, label, placeholder }) => (
            <div key={key} className="space-y-1">
              <Label className="text-[9px] font-black text-stone-500 uppercase tracking-widest">{label}</Label>
              <Input value={(editForm as any)[key] ?? (selected as any)[key] ?? ''} placeholder={placeholder}
                onChange={e => setEditForm(f => ({ ...f, [key]: e.target.value }))}
                className="h-9 rounded-xl border-stone-200 font-bold text-sm" />
            </div>
          ))}
        </div>
      )}

      {/* Tabs */}
      <div className="flex gap-2 bg-stone-100 p-1 rounded-2xl w-fit">
        {[
          { id: 'invoices' as const, label: `Factures (${selInvoices.length})` },
          { id: 'orders' as const, label: `Commandes (${selOrders.length})` },
          { id: 'payments' as const, label: `Paiements (${selPayments.length})` },
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
              {selInvoices.map(inv => (
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
              {selOrders.map(ord => (
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
              {selPayments.map(p => (
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
      <div className="relative">
        <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-stone-400" />
        <Input placeholder="Rechercher par nom, téléphone, email..." value={search}
          onChange={e => setSearch(e.target.value)}
          className="pl-11 h-12 rounded-2xl border-stone-200 text-sm font-bold shadow-sm" />
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
            const nInv = invoices.filter(i => i.clientId === c.id).length;
            const nOrd = orders.filter(o => o.clientId === c.id).length;
            return (
              <div key={c.id} className="bg-white rounded-2xl shadow-xl border border-stone-100 overflow-hidden hover:shadow-2xl hover:-translate-y-0.5 transition-all group">
                <div className="h-1.5 bg-gradient-to-r from-violet-500 to-violet-400" />
                <div className="p-5">
                  <div className="flex items-start gap-3 mb-4">
                    <div className="w-11 h-11 rounded-2xl bg-gradient-to-br from-violet-500 to-violet-700 text-white font-black text-lg flex items-center justify-center shrink-0 shadow-lg shadow-violet-500/30">
                      {c.name[0].toUpperCase()}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="font-black text-stone-900 uppercase tracking-tight truncate">{c.name}</p>
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
              { key: 'notes', label: 'Notes', placeholder: 'Informations complémentaires...' },
            ].map(({ key, label, placeholder }) => (
              <div key={key} className="space-y-1">
                <Label className="text-[9px] font-black text-stone-500 uppercase tracking-widest">{label}</Label>
                <Input value={(form as any)[key]} placeholder={placeholder}
                  onChange={e => setForm(f => ({ ...f, [key]: e.target.value }))}
                  className="h-10 rounded-xl border-stone-200 font-bold text-sm" />
              </div>
            ))}
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
    </div>
  );
}
