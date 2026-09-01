"use client";

import React, { useState, useMemo } from 'react';
import { Search, Shield, Clock, User, Filter } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import type { AuditLogEntry, AuditAction } from '@/lib/types';

const ACTION_STYLE: Record<string, { label: string; cls: string }> = {
  STOCK_IN:             { label: 'Entrée Stock',      cls: 'bg-emerald-100 text-emerald-700' },
  STOCK_OUT:            { label: 'Sortie Stock',      cls: 'bg-red-100 text-red-700' },
  STOCK_ADJUSTMENT:     { label: 'Ajustement',        cls: 'bg-blue-100 text-blue-700' },
  STOCK_TRANSFER:       { label: 'Transfert',         cls: 'bg-indigo-100 text-indigo-700' },
  SALE_CREATED:         { label: 'Vente',             cls: 'bg-violet-100 text-violet-700' },
  INVOICE_CREATED:      { label: 'Facture',           cls: 'bg-purple-100 text-purple-700' },
  INVOICE_PAID:         { label: 'Facture Payée',     cls: 'bg-emerald-100 text-emerald-700' },
  INVOICE_CANCELLED:    { label: 'Facture Annulée',   cls: 'bg-stone-100 text-stone-600' },
  PAYMENT_RECORDED:     { label: 'Paiement',          cls: 'bg-emerald-100 text-emerald-700' },
  PAYMENT_REJECTED:     { label: 'Paiement Rejeté',   cls: 'bg-red-100 text-red-700' },
  PAYMENT_CLEARED:      { label: 'Paiement Encaissé', cls: 'bg-emerald-100 text-emerald-700' },
  CLIENT_CREATED:       { label: 'Nouveau Client',    cls: 'bg-blue-100 text-blue-700' },
  CLIENT_UPDATED:       { label: 'Client Modifié',    cls: 'bg-amber-100 text-amber-700' },
  TRANSFER_CREATED:     { label: 'Transfert Créé',    cls: 'bg-indigo-100 text-indigo-700' },
  TRANSFER_VALIDATED:   { label: 'Transfert Validé',  cls: 'bg-emerald-100 text-emerald-700' },
  INVENTORY_RECONCILED: { label: 'Inventaire',        cls: 'bg-amber-100 text-amber-700' },
  SETTINGS_UPDATED:     { label: 'Paramètres',        cls: 'bg-stone-100 text-stone-600' },
};

interface AuditLogViewProps {
  entries: AuditLogEntry[];
}

export default function AuditLogView({ entries }: AuditLogViewProps) {
  const [search, setSearch] = useState('');
  const [filterAction, setFilterAction] = useState('all');
  const [filterMonth, setFilterMonth] = useState('all');
  const [limit, setLimit] = useState(50);

  const months = useMemo(() => {
    const s = new Set<string>();
    entries.forEach(e => e.timestamp && s.add(e.timestamp.substring(0, 7)));
    return Array.from(s).sort().reverse();
  }, [entries]);

  const actionTypes = useMemo(() => {
    const s = new Set<string>();
    entries.forEach(e => s.add(e.action));
    return Array.from(s).sort();
  }, [entries]);

  const filtered = useMemo(() => {
    let r = [...entries].sort((a, b) => b.timestamp.localeCompare(a.timestamp));
    if (filterAction !== 'all') r = r.filter(e => e.action === filterAction);
    if (filterMonth !== 'all') r = r.filter(e => e.timestamp.startsWith(filterMonth));
    if (search) {
      const q = search.toLowerCase();
      r = r.filter(e =>
        e.description.toLowerCase().includes(q) ||
        e.userEmail.toLowerCase().includes(q) ||
        e.entityId.toLowerCase().includes(q)
      );
    }
    return r;
  }, [entries, filterAction, filterMonth, search]);

  const visible = filtered.slice(0, limit);

  return (
    <div className="space-y-6 animate-in fade-in duration-300">
      {/* Header */}
      <div className="bg-gradient-to-br from-stone-900 to-stone-700 p-8 rounded-3xl shadow-2xl relative overflow-hidden">
        <div className="absolute bottom-0 right-1/4 w-64 h-64 bg-stone-400/10 rounded-full translate-y-1/2 blur-3xl" />
        <div className="relative z-10">
          <div className="flex items-center gap-3 mb-2">
            <Shield className="w-6 h-6 text-stone-300" />
            <p className="text-[9px] font-black text-stone-400 uppercase tracking-[0.3em]">Traçabilité</p>
          </div>
          <h1 className="text-3xl font-black text-white uppercase tracking-tighter">Journal <span className="text-stone-400">d'Audit</span></h1>
          <p className="text-[10px] font-bold text-stone-500 uppercase tracking-widest mt-2">
            {entries.length} action{entries.length > 1 ? 's' : ''} enregistrée{entries.length > 1 ? 's' : ''}
          </p>
        </div>
      </div>

      {/* Filters */}
      <div className="bg-white rounded-2xl shadow-lg border border-stone-100 p-4 flex flex-wrap gap-3">
        <div className="relative flex-1 min-w-48">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-stone-400" />
          <Input placeholder="Rechercher action, utilisateur, entité..." value={search} onChange={e => setSearch(e.target.value)}
            className="pl-9 h-10 rounded-xl border-stone-200 text-sm font-bold" />
        </div>
        <Select value={filterAction} onValueChange={setFilterAction}>
          <SelectTrigger className="h-10 w-48 rounded-xl border-stone-200 font-bold text-sm"><SelectValue placeholder="Type d'action" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Toutes les actions</SelectItem>
            {actionTypes.map(a => (
              <SelectItem key={a} value={a}>{ACTION_STYLE[a]?.label || a}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={filterMonth} onValueChange={setFilterMonth}>
          <SelectTrigger className="h-10 w-36 rounded-xl border-stone-200 font-bold text-sm"><SelectValue placeholder="Période" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Toute période</SelectItem>
            {months.map(m => <SelectItem key={m} value={m}>{m}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>

      {/* Entries */}
      <div className="bg-white border border-stone-100 rounded-3xl shadow-sm overflow-hidden">
        <div className="divide-y divide-stone-50">
          {visible.length === 0 ? (
            <div className="p-12 text-center">
              <Shield className="w-10 h-10 text-stone-200 mx-auto mb-3" />
              <p className="text-stone-400 text-xs font-bold uppercase tracking-widest">Aucune entrée trouvée</p>
            </div>
          ) : visible.map(entry => {
            const style = ACTION_STYLE[entry.action] || { label: entry.action, cls: 'bg-stone-100 text-stone-600' };
            const time = new Date(entry.timestamp);
            return (
              <div key={entry.id} className="px-5 py-4 flex items-start gap-4 hover:bg-stone-50/30 transition-colors">
                <div className="flex-shrink-0 mt-0.5">
                  <span className={`inline-block px-2.5 py-1 rounded-lg text-[9px] font-black uppercase tracking-wide ${style.cls}`}>
                    {style.label}
                  </span>
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-bold text-stone-900 truncate">{entry.description}</p>
                  <div className="flex items-center gap-3 mt-1">
                    <span className="text-[10px] font-bold text-stone-400 flex items-center gap-1">
                      <User className="w-3 h-3" /> {entry.userEmail}
                    </span>
                    <span className="text-[10px] font-bold text-stone-400 flex items-center gap-1">
                      <Clock className="w-3 h-3" /> {time.toLocaleDateString('fr-FR')} à {time.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}
                    </span>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
        {filtered.length > limit && (
          <div className="p-4 border-t border-stone-100 text-center">
            <Button variant="outline" onClick={() => setLimit(l => l + 50)}
              className="font-black uppercase text-xs rounded-xl">
              Charger plus ({filtered.length - limit} restant{filtered.length - limit > 1 ? 's' : ''})
            </Button>
          </div>
        )}
        {visible.length > 0 && (
          <div className="px-4 py-3 bg-stone-50 border-t border-stone-100 flex items-center justify-between">
            <span className="text-[9px] font-black text-stone-400 uppercase tracking-widest">
              {visible.length} sur {filtered.length} entrée{filtered.length > 1 ? 's' : ''}
            </span>
          </div>
        )}
      </div>
    </div>
  );
}
