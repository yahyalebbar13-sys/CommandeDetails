"use client";

import React, { useMemo, useState } from 'react';
import { 
  Landmark, CreditCard, TrendingUp, AlertTriangle, CheckCircle2, XCircle, FileText, Image as ImageIcon, Calendar as CalendarIcon, Check
} from 'lucide-react';
import { ClientPayment, Client, Invoice } from '@/lib/types';
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog';

const fmt = (n: number) => n.toLocaleString('fr-MA', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

interface TreasuryDashboardProps {
  payments: ClientPayment[];
  clients: Client[];
  invoices: Invoice[];
  onUpdatePaymentStatus: (paymentId: string, status: 'PENDING' | 'CLEARED' | 'REJECTED') => Promise<void>;
}

export default function TreasuryDashboard({ payments, clients, invoices, onUpdatePaymentStatus }: TreasuryDashboardProps) {
  const [viewScan, setViewScan] = useState<string | null>(null);

  // Statistiques globales
  const stats = useMemo(() => {
    let directCash = 0; // CASH + VIREMENT + AUTRE
    let pendingEffects = 0; // EFFET / CHEQUE (PENDING)
    let clearedEffects = 0; // EFFET / CHEQUE (CLEARED)
    let rejectedEffects = 0; // EFFET / CHEQUE (REJECTED)

    payments.forEach(p => {
      if (p.method === 'CHEQUE' || p.method === 'EFFET') {
        if (p.status === 'CLEARED') clearedEffects += p.amount;
        else if (p.status === 'REJECTED') rejectedEffects += p.amount;
        else pendingEffects += p.amount; // PENDING par défaut
      } else {
        directCash += p.amount;
      }
    });

    return { directCash, pendingEffects, clearedEffects, rejectedEffects };
  }, [payments]);

  // Liste des effets en attente triés par date d'échéance (plus proche d'abord)
  const pendingPayments = useMemo(() => {
    return payments
      .filter(p => (p.method === 'CHEQUE' || p.method === 'EFFET') && p.status !== 'CLEARED' && p.status !== 'REJECTED')
      .sort((a, b) => {
        const d1 = a.dueDate || '9999-12-31';
        const d2 = b.dueDate || '9999-12-31';
        return d1.localeCompare(d2);
      });
  }, [payments]);

  const getClientName = (id: string) => clients.find(c => c.id === id)?.name || 'Anonyme';
  const getInvoiceNumber = (invId?: string) => {
    if (!invId) return '—';
    const inv = invoices.find(i => i.id === invId);
    if (!inv) return '—';
    return inv.invoiceNumber || `FAC-${String(invoices.findIndex(i => i.id === invId) + 1).padStart(4, '0')}`;
  };

  return (
    <div className="p-6 space-y-6 max-w-7xl mx-auto pb-32">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-black text-stone-900 uppercase tracking-tight flex items-center gap-2">
            <Landmark className="w-6 h-6 text-emerald-600" />
            Trésorerie & Banque
          </h2>
          <p className="text-[11px] font-bold text-stone-500 uppercase tracking-widest mt-1">Analyse des flux financiers et suivi des effets</p>
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <div className="bg-white rounded-3xl p-5 border border-stone-100 shadow-sm relative overflow-hidden">
          <div className="absolute top-0 right-0 p-4 opacity-10"><TrendingUp className="w-16 h-16 text-emerald-500" /></div>
          <p className="text-[10px] font-black text-stone-400 uppercase tracking-widest mb-1 relative z-10">Cash Direct & Virements</p>
          <p className="text-2xl font-black text-stone-900 relative z-10">{fmt(stats.directCash)} <span className="text-sm text-stone-400">MAD</span></p>
          <p className="text-[9px] font-bold text-emerald-600 uppercase mt-2 bg-emerald-50 inline-block px-2 py-0.5 rounded-full relative z-10">Encaissé</p>
        </div>

        <div className="bg-white rounded-3xl p-5 border border-stone-100 shadow-sm relative overflow-hidden">
          <div className="absolute top-0 right-0 p-4 opacity-10"><CalendarIcon className="w-16 h-16 text-violet-500" /></div>
          <p className="text-[10px] font-black text-stone-400 uppercase tracking-widest mb-1 relative z-10">Effets en Attente</p>
          <p className="text-2xl font-black text-violet-700 relative z-10">{fmt(stats.pendingEffects)} <span className="text-sm text-violet-400">MAD</span></p>
          <p className="text-[9px] font-bold text-violet-600 uppercase mt-2 bg-violet-50 inline-block px-2 py-0.5 rounded-full relative z-10">Prévisionnel</p>
        </div>

        <div className="bg-white rounded-3xl p-5 border border-stone-100 shadow-sm relative overflow-hidden">
          <div className="absolute top-0 right-0 p-4 opacity-10"><CheckCircle2 className="w-16 h-16 text-emerald-500" /></div>
          <p className="text-[10px] font-black text-stone-400 uppercase tracking-widest mb-1 relative z-10">Effets Encaissés (Payés)</p>
          <p className="text-2xl font-black text-emerald-600 relative z-10">{fmt(stats.clearedEffects)} <span className="text-sm text-emerald-400">MAD</span></p>
          <p className="text-[9px] font-bold text-emerald-600 uppercase mt-2 bg-emerald-50 inline-block px-2 py-0.5 rounded-full relative z-10">Liquide</p>
        </div>

        <div className="bg-white rounded-3xl p-5 border border-stone-100 shadow-sm relative overflow-hidden">
          <div className="absolute top-0 right-0 p-4 opacity-10"><AlertTriangle className="w-16 h-16 text-red-500" /></div>
          <p className="text-[10px] font-black text-stone-400 uppercase tracking-widest mb-1 relative z-10">Effets Impayés / Rejetés</p>
          <p className="text-2xl font-black text-red-600 relative z-10">{fmt(stats.rejectedEffects)} <span className="text-sm text-red-400">MAD</span></p>
          <p className="text-[9px] font-bold text-red-600 uppercase mt-2 bg-red-50 inline-block px-2 py-0.5 rounded-full relative z-10">À relancer</p>
        </div>
      </div>

      {/* Table of pending effects */}
      <div className="bg-white border border-stone-100 rounded-3xl shadow-sm overflow-hidden flex flex-col">
        <div className="p-5 border-b border-stone-100 bg-stone-50/50 flex justify-between items-center">
          <h3 className="text-sm font-black text-stone-900 uppercase tracking-tight flex items-center gap-2">
            <CreditCard className="w-4 h-4 text-violet-600" />
            Portefeuille d'effets à l'encaissement
          </h3>
          <span className="text-[10px] font-black bg-stone-200 text-stone-600 px-2.5 py-1 rounded-full uppercase">
            {pendingPayments.length} en attente
          </span>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-stone-50 border-b border-stone-100">
                <th className="px-5 py-3 text-[9px] font-black text-stone-400 uppercase tracking-widest">Type</th>
                <th className="px-5 py-3 text-[9px] font-black text-stone-400 uppercase tracking-widest">Client / Facture</th>
                <th className="px-5 py-3 text-[9px] font-black text-stone-400 uppercase tracking-widest">Banque & N°</th>
                <th className="px-5 py-3 text-[9px] font-black text-stone-400 uppercase tracking-widest">Échéance</th>
                <th className="px-5 py-3 text-right text-[9px] font-black text-stone-400 uppercase tracking-widest">Montant</th>
                <th className="px-5 py-3 text-center text-[9px] font-black text-stone-400 uppercase tracking-widest">Scan</th>
                <th className="px-5 py-3 text-right text-[9px] font-black text-stone-400 uppercase tracking-widest">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-stone-50">
              {pendingPayments.length === 0 ? (
                <tr>
                  <td colSpan={7} className="p-8 text-center text-stone-400 text-xs font-bold uppercase tracking-widest">
                    Aucun effet en attente
                  </td>
                </tr>
              ) : pendingPayments.map(p => {
                const today = new Date().toISOString().split('T')[0];
                const isDue = p.dueDate && p.dueDate <= today;
                return (
                  <tr key={p.id} className="hover:bg-stone-50/30 transition-colors">
                    <td className="px-5 py-4">
                      <span className={`text-[10px] font-black uppercase px-2 py-1 rounded-md ${p.method === 'CHEQUE' ? 'bg-blue-50 text-blue-700' : 'bg-violet-50 text-violet-700'}`}>
                        {p.method}
                      </span>
                    </td>
                    <td className="px-5 py-4">
                      <p className="text-xs font-black text-stone-900">{getClientName(p.clientId)}</p>
                      <p className="text-[10px] font-bold text-stone-500">{getInvoiceNumber(p.invoiceId)}</p>
                    </td>
                    <td className="px-5 py-4">
                      <p className="text-[11px] font-bold text-stone-800">{p.bankName || 'Banque non spécifiée'}</p>
                      <p className="text-[10px] font-bold text-stone-500 font-mono">{p.checkNumber || 'N° manquant'}</p>
                    </td>
                    <td className="px-5 py-4">
                      {p.dueDate ? (
                        <span className={`text-[11px] font-black px-2 py-1 rounded-lg ${isDue ? 'bg-amber-100 text-amber-700 border border-amber-200' : 'bg-stone-100 text-stone-600'}`}>
                          {p.dueDate}
                        </span>
                      ) : <span className="text-stone-300">—</span>}
                    </td>
                    <td className="px-5 py-4 text-right">
                      <p className="text-sm font-black text-stone-900">{fmt(p.amount)}</p>
                    </td>
                    <td className="px-5 py-4 text-center">
                      {p.scannedImageUrl ? (
                        <button onClick={() => setViewScan(p.scannedImageUrl!)} className="p-2 bg-emerald-50 text-emerald-600 rounded-xl hover:bg-emerald-100 transition-colors inline-flex">
                          <ImageIcon className="w-4 h-4" />
                        </button>
                      ) : (
                        <span className="text-stone-300 p-2 inline-flex"><FileText className="w-4 h-4" /></span>
                      )}
                    </td>
                    <td className="px-5 py-4 text-right">
                      <div className="flex items-center justify-end gap-2">
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
