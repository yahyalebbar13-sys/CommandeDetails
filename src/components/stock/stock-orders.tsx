"use client";

import React, { useState, useMemo } from 'react';
import { Search, Eye, ArrowRight, Printer, X, CheckCircle2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import type { SaleOrder, SaleOrderStatus, Client, Invoice } from '@/lib/types';

interface StockOrdersProps {
  orders: SaleOrder[];
  clients: Client[];
  onUpdateStatus: (id: string, status: SaleOrderStatus) => Promise<void>;
  onConvertToInvoice: (order: SaleOrder) => Promise<void>;
  onNavigate: (v: any) => void;
}

const fmt$ = (n: number) => n.toLocaleString('fr-MA', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

const STATUS_BADGE: Record<SaleOrderStatus, { label: string; cls: string }> = {
  DRAFT:     { label: 'Brouillon',  cls: 'bg-stone-100 text-stone-500 border-stone-200' },
  CONFIRMED: { label: 'Confirmé',   cls: 'bg-blue-100 text-blue-700 border-blue-200' },
  INVOICED:  { label: 'Facturé',    cls: 'bg-emerald-100 text-emerald-700 border-emerald-200' },
  CANCELLED: { label: 'Annulé',     cls: 'bg-red-100 text-red-600 border-red-200' },
};

export default function StockOrders({ orders, clients, onUpdateStatus, onConvertToInvoice, onNavigate }: StockOrdersProps) {
  const [filterStatus, setFilterStatus] = useState<string>('all');
  const [filterMonth, setFilterMonth] = useState<string>('all');
  const [search, setSearch] = useState('');
  const [selected, setSelected] = useState<SaleOrder | null>(null);
  const [converting, setConverting] = useState<string | null>(null);

  const months = useMemo(() => {
    const s = new Set<string>();
    orders.forEach(o => o.date && s.add(o.date.substring(0, 7)));
    return Array.from(s).sort().reverse();
  }, [orders]);

  const filtered = useMemo(() => {
    let r = [...orders].sort((a, b) => b.date.localeCompare(a.date));
    if (filterStatus !== 'all') r = r.filter(o => o.status === filterStatus);
    if (filterMonth !== 'all') r = r.filter(o => o.date.startsWith(filterMonth));
    if (search) {
      const q = search.toLowerCase();
      r = r.filter(o => o.clientName?.toLowerCase().includes(q) || o.notes?.toLowerCase().includes(q));
    }
    return r;
  }, [orders, filterStatus, filterMonth, search]);

  const totalAmount = filtered.reduce((s, o) => s + o.totalAfterDiscount, 0);

  const orderNumber = (order: SaleOrder, index: number) =>
    `BC-${String(orders.findIndex(o => o.id === order.id) + 1).padStart(4, '0')}`;

  const handleConvert = async (order: SaleOrder) => {
    setConverting(order.id);
    try { await onConvertToInvoice(order); }
    finally { setConverting(null); }
  };

  const printOrder = (order: SaleOrder) => {
    const num = orderNumber(order, 0);
    const w = window.open('', '_blank');
    if (!w) return;
    w.document.write(`<!DOCTYPE html><html><head><meta charset="utf-8"><title>${num}</title>
    <style>body{font-family:Arial,sans-serif;max-width:700px;margin:40px auto;color:#1c1917}
    h1{font-size:24px;font-weight:900;text-transform:uppercase;letter-spacing:-0.05em}
    .header{display:flex;justify-content:space-between;align-items:start;border-bottom:3px solid #1c1917;padding-bottom:20px;margin-bottom:20px}
    .label{font-size:9px;font-weight:700;text-transform:uppercase;letter-spacing:0.1em;color:#78716c}
    table{width:100%;border-collapse:collapse;margin:20px 0}
    th{text-align:left;font-size:9px;text-transform:uppercase;letter-spacing:0.1em;color:#78716c;padding:8px;border-bottom:1px solid #e7e5e4}
    td{padding:10px 8px;border-bottom:1px solid #f5f5f4;font-size:12px}
    .total{text-align:right;font-size:18px;font-weight:900;color:#4c1d95}
    .footer{margin-top:40px;text-align:center;font-size:10px;color:#a8a29e}
    </style></head><body>
    <div class="header">
      <div>
        <img src="${window.location.origin}/logo_lebtex.png" alt="LEBTEX" style="height: 120px; margin-bottom: 15px; display: block;" />
        <div class="label">Bon de Commande</div>
        <h1>${num}</h1>
      </div>
      <div style="text-align:right"><div class="label">Date</div><strong>${order.date}</strong><br>
      <div class="label" style="margin-top:8px">Client</div><strong>${order.clientName || 'Anonyme'}</strong></div>
    </div>
    <table><thead><tr><th>Produit</th><th>Couleur</th><th>Taille</th><th>Qté</th><th>Prix unit.</th><th>Total</th></tr></thead>
    <tbody>${order.items.map(i => `<tr>
      <td><strong>${i.productName}</strong></td><td>${i.color || '—'}</td><td>${i.size || '—'}</td>
      <td>${i.qty} ${i.unitOfMeasure}</td><td>${fmt$(i.unitPrice)}</td><td>${fmt$(i.totalPrice)}</td>
    </tr>`).join('')}</tbody></table>
    <div style="text-align:right">
      ${order.discount ? `<div style="color:#78716c;margin-bottom:4px">Remise ${order.discount}%: -${fmt$(order.totalAmount * order.discount / 100)}</div>` : ''}
      <div class="total">Total: ${fmt$(order.totalAfterDiscount)}</div>
    </div>
    ${order.notes ? `<div style="margin-top:20px;padding:12px;background:#f5f5f4;border-radius:8px"><div class="label">Notes</div><p>${order.notes}</p></div>` : ''}
    <div class="footer">Document généré le ${new Date().toLocaleDateString('fr-FR')}</div>
    </body></html>`);
    w.document.close();
    w.print();
  };

  return (
    <div className="space-y-6 animate-in fade-in duration-300">
      {/* Header */}
      <div className="bg-gradient-to-br from-stone-900 to-stone-800 p-8 rounded-3xl shadow-2xl relative overflow-hidden">
        <div className="absolute top-0 right-0 w-64 h-64 bg-white/5 rounded-full -translate-y-1/2 translate-x-1/2 blur-3xl" />
        <div className="relative z-10 flex items-center justify-between gap-4">
          <div>
            <p className="text-[9px] font-black text-stone-400 uppercase tracking-[0.3em] mb-1">Ventes</p>
            <h1 className="text-3xl font-black text-white uppercase tracking-tighter">Bons de <span className="text-stone-400">Commande</span></h1>
            <p className="text-stone-500 text-xs font-bold mt-2">{orders.length} BC · Total : {fmt$(totalAmount)}</p>
          </div>
          <Button onClick={() => onNavigate('sale')}
            className="bg-white/10 hover:bg-white/20 text-white font-black uppercase text-[10px] tracking-widest px-6 h-11 rounded-2xl gap-2 border border-white/20 shrink-0">
            + Nouvelle vente
          </Button>
        </div>
      </div>

      {/* Filtres */}
      <div className="bg-white rounded-2xl shadow-lg border border-stone-100 p-4 flex flex-wrap gap-3">
        <div className="relative flex-1 min-w-48">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-stone-400" />
          <Input placeholder="Rechercher client, notes..." value={search} onChange={e => setSearch(e.target.value)}
            className="pl-9 h-10 rounded-xl border-stone-200 text-sm font-bold" />
        </div>
        <Select value={filterStatus} onValueChange={setFilterStatus}>
          <SelectTrigger className="h-10 w-40 rounded-xl border-stone-200 font-bold text-sm"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Tous statuts</SelectItem>
            <SelectItem value="DRAFT">Brouillon</SelectItem>
            <SelectItem value="CONFIRMED">Confirmé</SelectItem>
            <SelectItem value="INVOICED">Facturé</SelectItem>
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
          <p className="text-center text-stone-300 font-black uppercase text-[10px] py-16">Aucun bon de commande</p>
        ) : (
          <>
            <table className="w-full">
              <thead><tr className="bg-stone-50 border-b border-stone-100">
                {['N° BC', 'Date', 'Client', 'Articles', 'Total', 'Statut', 'Actions'].map(h => (
                  <th key={h} className="px-4 py-3 text-left text-[8px] font-black uppercase tracking-widest text-stone-400 whitespace-nowrap">{h}</th>
                ))}
              </tr></thead>
              <tbody className="divide-y divide-stone-50">
                {filtered.map((order, i) => {
                  const num = orderNumber(order, i);
                  const badge = STATUS_BADGE[order.status];
                  return (
                    <tr key={order.id} className="hover:bg-stone-50/50 transition-colors group">
                      <td className="px-4 py-3 text-[10px] font-black text-stone-700">{num}</td>
                      <td className="px-4 py-3 text-[10px] font-bold text-stone-500">{order.date}</td>
                      <td className="px-4 py-3 text-[10px] font-black text-stone-800">{order.clientName || 'Anonyme'}</td>
                      <td className="px-4 py-3 text-[10px] font-bold text-stone-500">{order.items.length} art.</td>
                      <td className="px-4 py-3 text-[10px] font-black text-stone-900">{fmt$(order.totalAfterDiscount)}</td>
                      <td className="px-4 py-3">
                        <span className={`text-[8px] font-black uppercase px-2 py-0.5 rounded-lg border ${badge.cls}`}>{badge.label}</span>
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                          <button onClick={() => setSelected(order)} title="Voir"
                            className="w-7 h-7 rounded-lg bg-stone-100 hover:bg-stone-200 text-stone-600 flex items-center justify-center transition-colors">
                            <Eye className="w-3 h-3" />
                          </button>
                          <button onClick={() => printOrder(order)} title="Imprimer"
                            className="w-7 h-7 rounded-lg bg-stone-100 hover:bg-stone-200 text-stone-600 flex items-center justify-center transition-colors">
                            <Printer className="w-3 h-3" />
                          </button>
                          {order.status === 'CONFIRMED' && (
                            <button onClick={() => handleConvert(order)} disabled={converting === order.id} title="Convertir en facture"
                              className="w-7 h-7 rounded-lg bg-violet-100 hover:bg-violet-200 text-violet-700 flex items-center justify-center transition-colors">
                              <ArrowRight className="w-3 h-3" />
                            </button>
                          )}
                          {order.status !== 'INVOICED' && order.status !== 'CANCELLED' && (
                            <button onClick={() => onUpdateStatus(order.id, 'CANCELLED')} title="Annuler"
                              className="w-7 h-7 rounded-lg bg-red-50 hover:bg-red-100 text-red-500 flex items-center justify-center transition-colors">
                              <X className="w-3 h-3" />
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            <div className="px-4 py-3 bg-stone-50 border-t border-stone-100 flex justify-between items-center">
              <span className="text-[9px] font-black text-stone-400 uppercase tracking-widest">{filtered.length} BC</span>
              <span className="text-[10px] font-black text-stone-700">Total filtré : {fmt$(totalAmount)}</span>
            </div>
          </>
        )}
      </div>

      {/* Modal détail */}
      <Dialog open={!!selected} onOpenChange={o => !o && setSelected(null)}>
        <DialogContent className="sm:max-w-2xl rounded-3xl border-none shadow-2xl p-0 overflow-hidden max-h-[90vh] flex flex-col">
          <div className="bg-gradient-to-r from-stone-900 to-stone-800 p-6 text-white shrink-0">
            <DialogTitle className="text-lg font-black uppercase tracking-tight">
              {selected ? orderNumber(selected, 0) : ''}
            </DialogTitle>
            <p className="text-[10px] font-bold text-stone-400 mt-1">
              {selected?.date} · {selected?.clientName || 'Anonyme'} · {selected?.items.length} article(s)
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
                {selected?.items.map((item, i) => (
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
              <p className="text-[10px] font-bold text-stone-500">Sous-total : {fmt$(selected?.totalAmount || 0)}</p>
              {(selected?.discount || 0) > 0 && <p className="text-[10px] font-bold text-emerald-600">Remise {selected?.discount}% : -{fmt$((selected?.totalAmount || 0) * (selected?.discount || 0) / 100)}</p>}
              <p className="text-xl font-black text-stone-900">Total : {fmt$(selected?.totalAfterDiscount || 0)}</p>
            </div>
          </div>
          <div className="p-4 bg-stone-50 flex gap-2 shrink-0">
            <Button variant="ghost" onClick={() => selected && printOrder(selected)} className="gap-2 font-black uppercase text-[10px] rounded-xl">
              <Printer className="w-3.5 h-3.5" /> Imprimer
            </Button>
            {selected?.status === 'CONFIRMED' && (
              <Button onClick={() => { selected && handleConvert(selected); setSelected(null); }}
                className="bg-violet-600 hover:bg-violet-700 text-white font-black uppercase text-[10px] h-10 px-5 rounded-xl gap-2">
                <ArrowRight className="w-3.5 h-3.5" /> Convertir en Facture
              </Button>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
