"use client";

import React, { useState, useMemo } from 'react';
import { Plus, ArrowDown, ArrowUp, ArrowLeftRight, SlidersHorizontal, Search, Calendar, Download, Undo2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import type { StockMovement, StockItem } from '@/lib/types';
import StockMovementModal from './stock-movement-modal';
import { exportToFile, formatMovementsForExport } from '@/lib/export-utils';
import { exportMovementsPDF } from '@/lib/pdf-export-reports';

interface StockMovementsProps {
  movements: StockMovement[];
  stockItems: StockItem[];
  categories: any[];
  articles: any[];
  stores: any[];
  activeStore: StoreLocation | 'ALL';
  onAddMovement: (m: Omit<StockMovement, 'id' | 'createdAt'>) => Promise<void>;
}

const TYPE_STYLE = {
  IN:         { label: 'Entrée',      icon: ArrowDown,      bg: 'bg-emerald-100', text: 'text-emerald-700', border: 'border-emerald-200', iconColor: 'text-emerald-500' },
  OUT:        { label: 'Sortie',      icon: ArrowUp,        bg: 'bg-red-100',     text: 'text-red-700',     border: 'border-red-200',     iconColor: 'text-red-500' },
  ADJUSTMENT: { label: 'Ajustement', icon: SlidersHorizontal, bg: 'bg-blue-100', text: 'text-blue-700',   border: 'border-blue-200',    iconColor: 'text-blue-500' },
};

const REASON_LABELS: Record<string, string> = {
  ARRIVAGE: 'Arrivage', VENTE: 'Vente', PERTE: 'Perte',
  RETOUR: 'Retour', INVENTAIRE: 'Inventaire', TRANSFERT: 'Transfert',
};

export default function StockMovements({ movements, stockItems, categories, articles, stores, activeStore, onAddMovement }: StockMovementsProps) {
  const [search, setSearch] = useState('');
  const [filterType, setFilterType] = useState<'all' | 'IN' | 'OUT' | 'ADJUSTMENT'>('all');
  const [filterCat, setFilterCat] = useState('all');
  const [filterMonth, setFilterMonth] = useState('all');
  const [modalOpen, setModalOpen] = useState(false);
  const [reversingId, setReversingId] = useState<string | null>(null);

  const handleReversal = async (movement: StockMovement) => {
    if (reversingId) return;
    setReversingId(movement.id);
    try {
      const reversalType = movement.type === 'IN' ? 'OUT' : movement.type === 'OUT' ? 'IN' : 'ADJUSTMENT';
      const reversalQty = movement.type === 'ADJUSTMENT' ? -movement.quantity : movement.quantity;
      await onAddMovement({
        articleId: movement.articleId,
        categoryId: movement.categoryId,
        productName: movement.productName,
        color: movement.color,
        size: movement.size,
        unitOfMeasure: movement.unitOfMeasure,
        type: reversalType,
        reason: movement.reason,
        quantity: reversalQty,
        date: new Date().toISOString().split('T')[0],
        storeId: movement.storeId,
        toStoreId: movement.toStoreId,
        notes: `⟲ Contre-passation du mouvement ${movement.id} du ${movement.date}`,
      });
    } finally {
      setReversingId(null);
    }
  };

  // Mois disponibles
  const months = useMemo(() => {
    const s = new Set<string>();
    movements.forEach(m => { if (m.date) s.add(m.date.substring(0, 7)); });
    return Array.from(s).sort().reverse();
  }, [movements]);

  // Catégories disponibles
  const catOptions = useMemo(() => {
    const s = new Set<string>();
    movements.forEach(m => { if (m.categoryId) s.add(m.categoryId); });
    return Array.from(s).sort();
  }, [movements]);

  // Filtres
  const filtered = useMemo(() => {
    let r = [...movements];
    if (filterType !== 'all') r = r.filter(m => m.type === filterType);
    if (filterCat !== 'all')  r = r.filter(m => m.categoryId === filterCat);
    if (filterMonth !== 'all') r = r.filter(m => m.date?.startsWith(filterMonth));
    if (search) {
      const q = search.toLowerCase();
      r = r.filter(m =>
        m.productName?.toLowerCase().includes(q) ||
        m.categoryId?.toLowerCase().includes(q) ||
        m.notes?.toLowerCase().includes(q) ||
        m.reason?.toLowerCase().includes(q)
      );
    }
    return r.sort((a, b) => (b.date || '').localeCompare(a.date || ''));
  }, [movements, filterType, filterCat, filterMonth, search]);

  // Totaux filtrés
  const totalIN  = filtered.filter(m => m.type === 'IN').reduce((s, m) => s + m.quantity, 0);
  const totalOUT = filtered.filter(m => m.type === 'OUT').reduce((s, m) => s + m.quantity, 0);

  return (
    <div className="space-y-6 animate-in fade-in duration-500">

      {/* Header */}
      <div className="bg-gradient-to-br from-stone-900 to-stone-800 p-8 rounded-3xl shadow-2xl relative overflow-hidden">
        <div className="absolute top-0 right-0 w-64 h-64 bg-emerald-500/5 rounded-full -translate-y-1/2 translate-x-1/2 blur-3xl" />
        <div className="relative z-10 flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <p className="text-[9px] font-black text-emerald-400 uppercase tracking-[0.3em] mb-1">Traçabilité complète</p>
            <h1 className="text-3xl font-black text-white uppercase tracking-tighter">Journal des <span className="text-emerald-400">Mouvements</span></h1>
            <p className="text-stone-400 text-xs font-bold mt-2">{movements.length} mouvement{movements.length > 1 ? 's' : ''} enregistré{movements.length > 1 ? 's' : ''}</p>
          </div>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              onClick={() => exportToFile(formatMovementsForExport(filtered), { filename: `mouvements-stock-${new Date().toISOString().split('T')[0]}`, sheetName: 'Mouvements' })}
              className="bg-white/10 hover:bg-white/20 border-white/20 text-white font-black uppercase text-[10px] tracking-widest px-6 h-11 rounded-2xl gap-2 shrink-0"
            >
              <Download className="w-4 h-4" /> Excel
            </Button>
            <Button
              variant="outline"
              onClick={() => exportMovementsPDF(filtered)}
              className="bg-white/10 hover:bg-white/20 border-white/20 text-white font-black uppercase text-[10px] tracking-widest px-6 h-11 rounded-2xl gap-2 shrink-0"
            >
              <Download className="w-4 h-4" /> PDF
            </Button>
            <Button
              onClick={() => setModalOpen(true)}
              className="bg-emerald-600 hover:bg-emerald-500 text-white font-black uppercase text-[10px] tracking-widest px-6 h-11 rounded-2xl shadow-lg shadow-emerald-500/30 gap-2 shrink-0"
            >
              <Plus className="w-4 h-4" /> Enregistrer un mouvement
            </Button>
          </div>
        </div>
      </div>

      {/* Stats rapides */}
      <div className="grid grid-cols-3 gap-4">
        {[
          { label: 'Total Entrées', value: totalIN, color: 'emerald', icon: ArrowDown },
          { label: 'Total Sorties', value: totalOUT, color: 'red', icon: ArrowUp },
          { label: 'Résultat Net', value: totalIN - totalOUT, color: totalIN - totalOUT >= 0 ? 'emerald' : 'red', icon: SlidersHorizontal },
        ].map(({ label, value, color, icon: Icon }) => (
          <div key={label} className={`bg-white rounded-2xl p-4 shadow-lg border border-${color}-100`}>
            <div className={`flex items-center gap-2 mb-1`}>
              <Icon className={`w-3.5 h-3.5 text-${color}-500`} />
              <p className={`text-[8px] font-black uppercase tracking-widest text-${color}-500`}>{label}</p>
            </div>
            <p className={`text-2xl font-black text-${color === 'red' ? 'red' : 'emerald'}-700`}>
              {value > 0 ? '+' : ''}{value.toLocaleString('fr-FR')}
            </p>
          </div>
        ))}
      </div>

      {/* Filtres */}
      <div className="bg-white rounded-2xl shadow-lg border border-stone-100 p-4">
        <div className="flex flex-wrap gap-3">
          <div className="relative flex-1 min-w-48">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-stone-400" />
            <Input placeholder="Rechercher produit, raison, notes..." value={search} onChange={e => setSearch(e.target.value)}
              className="pl-9 h-10 rounded-xl border-stone-200 text-sm font-bold" />
          </div>
          <Select value={filterType} onValueChange={v => setFilterType(v as any)}>
            <SelectTrigger className="h-10 w-40 rounded-xl border-stone-200 font-bold text-sm">
              <SelectValue placeholder="Type" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Tous les types</SelectItem>
              <SelectItem value="IN">Entrées</SelectItem>
              <SelectItem value="OUT">Sorties</SelectItem>
              <SelectItem value="ADJUSTMENT">Ajustements</SelectItem>
            </SelectContent>
          </Select>
          <Select value={filterCat} onValueChange={setFilterCat}>
            <SelectTrigger className="h-10 w-44 rounded-xl border-stone-200 font-bold text-sm">
              <SelectValue placeholder="Catégorie" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Toutes catégories</SelectItem>
              {catOptions.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}
            </SelectContent>
          </Select>
          <Select value={filterMonth} onValueChange={setFilterMonth}>
            <SelectTrigger className="h-10 w-40 rounded-xl border-stone-200 font-bold text-sm">
              <SelectValue placeholder="Mois" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Tous les mois</SelectItem>
              {months.map(m => <SelectItem key={m} value={m}>{m}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* Tableau */}
      <div className="bg-white rounded-2xl shadow-lg border border-stone-100 overflow-hidden">
        {filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 space-y-4">
            <div className="w-16 h-16 rounded-2xl bg-stone-50 flex items-center justify-center">
              <ArrowLeftRight className="w-8 h-8 text-stone-300" />
            </div>
            <p className="text-stone-400 font-black uppercase text-[10px] tracking-widest">Aucun mouvement trouvé</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-stone-50 border-b border-stone-100">
                  {['Date', 'Type', 'Produit', 'Magasin', 'Raison', 'Quantité', 'Notes', ''].map((h, i) => (
                    <th key={h || i} className="px-4 py-3 text-left text-[9px] font-black uppercase tracking-widest text-stone-400 whitespace-nowrap">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-stone-50">
                {filtered.map(m => {
                  const ts = TYPE_STYLE[m.type] || TYPE_STYLE.ADJUSTMENT;
                  const Icon = ts.icon;
                  return (
                    <tr key={m.id} className="hover:bg-stone-50/50 transition-colors group">
                      <td className="px-4 py-3 text-[10px] font-black text-stone-500 whitespace-nowrap">
                        <div className="flex items-center gap-1.5">
                          <Calendar className="w-3 h-3 text-stone-300" />
                          {m.date}
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-[9px] font-black uppercase tracking-wider border ${ts.bg} ${ts.text} ${ts.border}`}>
                          <Icon className="w-3 h-3" />
                          {ts.label}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <p className="text-[11px] font-black text-stone-800 uppercase">{m.productName}</p>
                        {(m.color || m.size) && (
                          <p className="text-[9px] font-bold text-stone-400 mt-0.5">
                            {[m.color, m.size].filter(Boolean).join(' · ')}
                          </p>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex flex-col gap-0.5">
                          <span className="text-[9px] font-black text-stone-600 uppercase">
                            {m.storeId ? (m.storeId === 'ENTREPOT' ? 'Entrepôt' : m.storeId.replace('_', ' ')) : 'Entrepôt'}
                          </span>
                          {m.reason === 'TRANSFERT' && m.toStoreId && (
                            <span className="text-[8px] font-bold text-stone-400 uppercase">→ {m.toStoreId === 'ENTREPOT' ? 'Entrepôt' : m.toStoreId.replace('_', ' ')}</span>
                          )}
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        <span className="text-[9px] font-black text-stone-600 uppercase bg-stone-100 px-2 py-0.5 rounded-lg">
                          {REASON_LABELS[m.reason] || m.reason}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <span className={`text-sm font-black ${m.type === 'IN' ? 'text-emerald-600' : m.type === 'OUT' ? 'text-red-600' : 'text-blue-600'}`}>
                          {m.type === 'IN' ? '+' : m.type === 'OUT' ? '-' : '±'}{m.quantity.toLocaleString('fr-FR')} {m.unitOfMeasure}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-[10px] text-stone-400 font-medium max-w-[200px] truncate">{m.notes || '—'}</td>
                      <td className="px-4 py-3 text-right">
                        <button onClick={() => handleReversal(m)} disabled={reversingId === m.id}
                          title="Contre-passer ce mouvement"
                          className="h-7 w-7 rounded-lg bg-stone-100 text-stone-400 hover:bg-amber-100 hover:text-amber-600 flex items-center justify-center transition-colors disabled:opacity-50 ml-auto">
                          <Undo2 className="w-3.5 h-3.5" />
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        {/* Footer tableau */}
        {filtered.length > 0 && (
          <div className="px-4 py-3 bg-stone-50 border-t border-stone-100 flex items-center justify-between">
            <span className="text-[9px] font-black text-stone-400 uppercase tracking-widest">{filtered.length} mouvement{filtered.length > 1 ? 's' : ''}</span>
            <div className="flex gap-4">
              <span className="text-[9px] font-black text-emerald-600 uppercase">+{totalIN.toLocaleString('fr-FR')} IN</span>
              <span className="text-[9px] font-black text-red-600 uppercase">-{totalOUT.toLocaleString('fr-FR')} OUT</span>
            </div>
          </div>
        )}
      </div>

      {/* Modal */}
      <StockMovementModal
        open={modalOpen}
        onOpenChange={setModalOpen}
        articles={articles}
        categories={categories}
        stockItems={stockItems}
        stores={stores}
        activeStore={activeStore}
        onSubmit={onAddMovement}
      />
    </div>
  );
}

