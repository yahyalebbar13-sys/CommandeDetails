"use client";

import React, { useState, useEffect, useMemo, useRef } from 'react';
import { Search, Package, Users, FileText, CornerDownLeft, X } from 'lucide-react';
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog';
import type { StockItem, Client, Invoice } from '@/lib/types';

type StockView = string;

interface GlobalSearchProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  stockItems: StockItem[];
  clients: Client[];
  invoices: Invoice[];
  onNavigate: (v: StockView) => void;
}

const fmt$ = (n: number) => (Number(n) || 0).toLocaleString('fr-MA', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export default function GlobalSearch({ open, onOpenChange, stockItems, clients, invoices, onNavigate }: GlobalSearchProps) {
  const [query, setQuery] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (open) {
      setQuery('');
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  }, [open]);

  const q = query.trim().toLowerCase();

  const matchedProducts = useMemo(() => {
    if (!q) return [];
    return stockItems
      .filter(i =>
        (i.nameFR || i.productName || '').toLowerCase().includes(q) ||
        (i.color || '').toLowerCase().includes(q) ||
        (i.size || '').toLowerCase().includes(q) ||
        (i.quality || '').toLowerCase().includes(q)
      )
      .slice(0, 5);
  }, [stockItems, q]);

  const matchedClients = useMemo(() => {
    if (!q) return [];
    return clients
      .filter(c => (c.name || '').toLowerCase().includes(q) || (c.phone || '').includes(q))
      .slice(0, 5);
  }, [clients, q]);

  const matchedInvoices = useMemo(() => {
    if (!q) return [];
    return invoices
      .filter(inv => (inv.invoiceNumber || inv.id || '').toLowerCase().includes(q) || (inv.clientName || '').toLowerCase().includes(q))
      .slice(0, 5);
  }, [invoices, q]);

  const hasResults = matchedProducts.length > 0 || matchedClients.length > 0 || matchedInvoices.length > 0;

  const go = (view: StockView) => {
    onNavigate(view);
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-xl rounded-3xl border-none shadow-2xl p-0 overflow-hidden top-[20%] translate-y-0">
        <DialogTitle className="sr-only">Recherche globale</DialogTitle>
        <div className="flex items-center gap-3 px-5 py-4 border-b border-stone-100">
          <Search className="w-4 h-4 text-stone-400 shrink-0" />
          <input
            ref={inputRef}
            value={query}
            onChange={e => setQuery(e.target.value)}
            placeholder="Rechercher un produit, un client, une facture..."
            className="flex-1 outline-none text-sm font-bold placeholder:text-stone-300 placeholder:font-medium"
          />
          {query && (
            <button onClick={() => setQuery('')} className="text-stone-300 hover:text-stone-600">
              <X className="w-4 h-4" />
            </button>
          )}
        </div>

        <div className="max-h-[60vh] overflow-y-auto">
          {!q ? (
            <div className="py-16 text-center">
              <Search className="w-8 h-8 text-stone-200 mx-auto mb-2" />
              <p className="text-[10px] font-black uppercase tracking-widest text-stone-400">Commencez à taper pour chercher</p>
            </div>
          ) : !hasResults ? (
            <div className="py-16 text-center">
              <p className="text-[10px] font-black uppercase tracking-widest text-stone-400">Aucun résultat pour « {query} »</p>
            </div>
          ) : (
            <div className="py-2">
              {matchedProducts.length > 0 && (
                <div className="px-2 mb-2">
                  <p className="px-3 py-1.5 text-[11px] font-black uppercase tracking-widest text-stone-400">Produits</p>
                  {matchedProducts.map(item => (
                    <button
                      key={item.articleId}
                      onClick={() => go('stock')}
                      className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl hover:bg-stone-50 text-left transition-colors"
                    >
                      <div className="w-8 h-8 rounded-lg bg-emerald-50 flex items-center justify-center shrink-0">
                        <Package className="w-4 h-4 text-emerald-600" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-xs font-black text-stone-900 truncate">{item.nameFR || item.productName}</p>
                        <p className="text-[10px] text-stone-400 font-bold truncate">
                          {[item.quality, item.color, item.size].filter(Boolean).join(' · ') || item.categoryId}
                        </p>
                      </div>
                      <span className={`text-[10px] font-black px-2 py-1 rounded-lg shrink-0 ${item.currentQty > 0 ? 'bg-emerald-100 text-emerald-700' : 'bg-red-100 text-red-700'}`}>
                        {item.currentQty} {item.unitOfMeasure}
                      </span>
                    </button>
                  ))}
                </div>
              )}

              {matchedClients.length > 0 && (
                <div className="px-2 mb-2">
                  <p className="px-3 py-1.5 text-[11px] font-black uppercase tracking-widest text-stone-400">Clients</p>
                  {matchedClients.map(client => (
                    <button
                      key={client.id}
                      onClick={() => go('clients')}
                      className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl hover:bg-stone-50 text-left transition-colors"
                    >
                      <div className="w-8 h-8 rounded-lg bg-violet-50 flex items-center justify-center shrink-0">
                        <Users className="w-4 h-4 text-violet-600" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-xs font-black text-stone-900 truncate">{client.name}</p>
                        <p className="text-[10px] text-stone-400 font-bold truncate">{client.phone || client.email || '—'}</p>
                      </div>
                    </button>
                  ))}
                </div>
              )}

              {matchedInvoices.length > 0 && (
                <div className="px-2 mb-2">
                  <p className="px-3 py-1.5 text-[11px] font-black uppercase tracking-widest text-stone-400">Factures</p>
                  {matchedInvoices.map(inv => (
                    <button
                      key={inv.id}
                      onClick={() => go('invoices')}
                      className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl hover:bg-stone-50 text-left transition-colors"
                    >
                      <div className="w-8 h-8 rounded-lg bg-purple-50 flex items-center justify-center shrink-0">
                        <FileText className="w-4 h-4 text-purple-600" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-xs font-black text-stone-900 truncate">{inv.invoiceNumber || inv.id} — {inv.clientName || 'Anonyme'}</p>
                        <p className="text-[10px] text-stone-400 font-bold truncate">{inv.date}</p>
                      </div>
                      <span className={`text-[10px] font-black px-2 py-1 rounded-lg shrink-0 ${inv.remainingBalance > 0 ? 'bg-red-100 text-red-700' : 'bg-emerald-100 text-emerald-700'}`}>
                        {fmt$(inv.totalAfterDiscount)} MAD
                      </span>
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>

        <div className="px-5 py-2.5 border-t border-stone-100 bg-stone-50/50 flex items-center justify-between">
          <span className="text-[11px] font-bold text-stone-400 flex items-center gap-1">
            <CornerDownLeft className="w-3 h-3" /> pour ouvrir
          </span>
          <span className="text-[11px] font-bold text-stone-400">Ctrl/Cmd + K</span>
        </div>
      </DialogContent>
    </Dialog>
  );
}
