"use client";

import React, { useState, useMemo } from 'react';
import { Search, Plus, Settings, Boxes, DollarSign, Filter } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { useUser, useFirestore } from '@/firebase';
import { doc } from 'firebase/firestore';
import { updateDocumentNonBlocking } from '@/firebase/non-blocking-updates';
import { useToast } from '@/hooks/use-toast';
import type { StockMovement, StockItem } from '@/lib/types';
import StockMovementModal from './stock-movement-modal';

interface StockInventoryProps {
  stockItems: StockItem[];
  articles: any[];
  categories: any[];
  onAddMovement: (m: Omit<StockMovement, 'id' | 'createdAt'>) => Promise<void>;
}

const fmt$ = (n: number) => n.toLocaleString('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 2 });
const fmtN = (n: number) => n.toLocaleString('fr-FR', { maximumFractionDigits: 2 });

function getStockLevel(item: StockItem): 'rupture' | 'low' | 'ok' | 'unknown' {
  if (item.currentQty === 0) return 'rupture';
  if (item.minThreshold != null && item.currentQty <= item.minThreshold) return 'low';
  if (item.minThreshold != null) return 'ok';
  return 'unknown';
}

const LEVEL_BADGE: Record<string, { label: string; className: string }> = {
  rupture: { label: 'RUPTURE', className: 'bg-red-100 text-red-700 border-red-200' },
  low:     { label: 'BAS',     className: 'bg-orange-100 text-orange-700 border-orange-200' },
  ok:      { label: 'OK',      className: 'bg-emerald-100 text-emerald-700 border-emerald-200' },
  unknown: { label: '—',       className: 'bg-stone-100 text-stone-400 border-stone-200' },
};

export default function StockInventory({ stockItems, articles, categories, onAddMovement }: StockInventoryProps) {
  const { user } = useUser();
  const firestore = useFirestore();
  const { toast } = useToast();

  const [search, setSearch]           = useState('');
  const [filterCat, setFilterCat]     = useState('all');
  const [filterLevel, setFilterLevel] = useState<'all' | 'rupture' | 'low' | 'ok' | 'unknown'>('all');
  const [sortBy, setSortBy]           = useState<'value' | 'qty' | 'name'>('value');

  // Modal mouvement
  const [movModal, setMovModal] = useState<{ open: boolean; articleId?: string; type?: 'IN' | 'OUT' }>({ open: false });

  // Modal seuil
  const [threshModal, setThreshModal] = useState<{ open: boolean; item?: StockItem }>({ open: false });
  const [threshValue, setThreshValue] = useState('');

  // Edition prix de vente inline
  const [editPriceId, setEditPriceId] = useState<string | null>(null);
  const [editPriceVal, setEditPriceVal] = useState('');

  // Catégories disponibles
  const catOptions = useMemo(() => {
    const s = new Set<string>();
    stockItems.forEach(i => { if (i.categoryId) s.add(i.categoryId); });
    return Array.from(s).sort();
  }, [stockItems]);

  // Filtres + tri
  const filtered = useMemo(() => {
    let r = [...stockItems];
    if (search) {
      const q = search.toLowerCase();
      r = r.filter(i =>
        i.productName?.toLowerCase().includes(q) ||
        i.categoryId?.toLowerCase().includes(q) ||
        i.color?.toLowerCase().includes(q) ||
        i.size?.toLowerCase().includes(q)
      );
    }
    if (filterCat !== 'all') r = r.filter(i => i.categoryId === filterCat);
    if (filterLevel !== 'all') r = r.filter(i => getStockLevel(i) === filterLevel);
    r.sort((a, b) => {
      if (sortBy === 'value') return b.totalValue - a.totalValue;
      if (sortBy === 'qty')   return b.currentQty - a.currentQty;
      return a.productName.localeCompare(b.productName);
    });
    return r;
  }, [stockItems, search, filterCat, filterLevel, sortBy]);

  const totalFilteredValue = filtered.reduce((s, i) => s + i.totalValue, 0);

  const handleSaveThreshold = () => {
    if (!user || !firestore || !threshModal.item) return;
    const val = parseFloat(threshValue);
    if (isNaN(val) || val < 0) return;
    const docRef = doc(firestore, 'users', user.uid, 'articles', threshModal.item.articleId);
    updateDocumentNonBlocking(docRef, { minStockThreshold: val });
    toast({ title: 'Seuil enregistré', description: `Seuil : ${val} ${threshModal.item.unitOfMeasure}` });
    setThreshModal({ open: false });
  };

  const handleSaveSellingPrice = (articleId: string, unitOfMeasure: string) => {
    if (!user || !firestore) return;
    const val = parseFloat(editPriceVal);
    if (isNaN(val) || val < 0) return;
    const docRef = doc(firestore, 'users', user.uid, 'articles', articleId);
    updateDocumentNonBlocking(docRef, { sellingPrice: val });
    toast({ title: 'Prix de vente enregistré', description: `${fmt$(val)} / ${unitOfMeasure}` });
    setEditPriceId(null);
  };

  return (
    <div className="space-y-6 animate-in fade-in duration-500">

      {/* ── Header ── */}
      <div className="bg-gradient-to-br from-emerald-800 to-emerald-700 p-8 rounded-3xl shadow-2xl relative overflow-hidden">
        <div className="absolute top-0 right-0 w-64 h-64 bg-emerald-400/5 rounded-full -translate-y-1/2 translate-x-1/2 blur-3xl" />
        <div className="relative z-10 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <p className="text-[9px] font-black text-emerald-300 uppercase tracking-[0.3em] mb-1">Temps réel</p>
            <h1 className="text-3xl font-black text-white uppercase tracking-tighter">
              Inventaire <span className="text-emerald-300">Physique</span>
            </h1>
            <div className="flex items-center gap-4 mt-2">
              <div className="flex items-center gap-1.5">
                <Boxes className="w-3.5 h-3.5 text-emerald-300" />
                <span className="text-[10px] font-black text-emerald-200">{stockItems.length} référence{stockItems.length > 1 ? 's' : ''}</span>
              </div>
              <div className="flex items-center gap-1.5">
                <DollarSign className="w-3.5 h-3.5 text-emerald-300" />
                <span className="text-[10px] font-black text-emerald-200">{fmt$(stockItems.reduce((s, i) => s + i.totalValue, 0))}</span>
              </div>
            </div>
          </div>
          <Button
            onClick={() => setMovModal({ open: true })}
            className="bg-white hover:bg-stone-50 text-emerald-800 font-black uppercase text-[10px] tracking-widest px-6 h-11 rounded-2xl shadow-lg gap-2 shrink-0"
          >
            <Plus className="w-4 h-4" /> Mouvement
          </Button>
        </div>
      </div>

      {/* ── Filtres ── */}
      <div className="bg-white rounded-2xl shadow-lg border border-stone-100 p-4">
        <div className="flex flex-wrap gap-3">
          <div className="relative flex-1 min-w-48">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-stone-400" />
            <Input placeholder="Produit, couleur, taille..." value={search} onChange={e => setSearch(e.target.value)}
              className="pl-9 h-10 rounded-xl border-stone-200 text-sm font-bold" />
          </div>
          <Select value={filterCat} onValueChange={setFilterCat}>
            <SelectTrigger className="h-10 w-44 rounded-xl border-stone-200 font-bold text-sm">
              <SelectValue placeholder="Catégorie" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Toutes catégories</SelectItem>
              {catOptions.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}
            </SelectContent>
          </Select>
          <Select value={filterLevel} onValueChange={v => setFilterLevel(v as any)}>
            <SelectTrigger className="h-10 w-36 rounded-xl border-stone-200 font-bold text-sm">
              <SelectValue placeholder="Statut" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Tous</SelectItem>
              <SelectItem value="rupture">🔴 Rupture</SelectItem>
              <SelectItem value="low">🟡 Stock bas</SelectItem>
              <SelectItem value="ok">🟢 OK</SelectItem>
              <SelectItem value="unknown">— Sans seuil</SelectItem>
            </SelectContent>
          </Select>
          <Select value={sortBy} onValueChange={v => setSortBy(v as any)}>
            <SelectTrigger className="h-10 w-36 rounded-xl border-stone-200 font-bold text-sm">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="value">Trier: Valeur</SelectItem>
              <SelectItem value="qty">Trier: Quantité</SelectItem>
              <SelectItem value="name">Trier: Nom</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* ── Tableau inventaire ── */}
      <div className="bg-white rounded-2xl shadow-xl border border-stone-100 overflow-hidden">
        {filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 space-y-4">
            <div className="w-16 h-16 rounded-2xl bg-stone-50 flex items-center justify-center">
              <Boxes className="w-8 h-8 text-stone-300" />
            </div>
            <p className="text-stone-400 font-black uppercase text-[10px] tracking-widest">
              {stockItems.length === 0 ? 'Aucun article en stock' : 'Aucun résultat'}
            </p>
            {stockItems.length === 0 && (
              <p className="text-stone-300 text-[10px] font-bold text-center max-w-xs">
                Validez un arrivage dans StockVue pour que les articles apparaissent ici.
              </p>
            )}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-stone-50 border-b border-stone-100">
                  {['Produit', 'Catégorie', 'Couleur', 'Taille', 'Qté dispo', 'UdM', 'Prix achat', 'Prix vente 🏷️', 'Marge', 'Valeur stock', 'Statut', 'Actions'].map(h => (
                    <th key={h} className="px-4 py-3 text-left text-[8px] font-black uppercase tracking-widest text-stone-400 whitespace-nowrap">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-stone-50">
                {filtered.map(item => {
                  const level = getStockLevel(item);
                  const badge = LEVEL_BADGE[level];
                  const pct = item.minThreshold ? Math.min(100, Math.round((item.currentQty / item.minThreshold) * 100)) : null;
                  return (
                    <tr key={item.articleId} className={`hover:bg-stone-50/60 transition-colors group ${level === 'rupture' ? 'bg-red-50/30' : level === 'low' ? 'bg-orange-50/20' : ''}`}>
                      <td className="px-4 py-3">
                        <p className="text-[11px] font-black text-stone-800 uppercase leading-tight">{item.productName}</p>
                        {item.stockEntryDate && (
                          <p className="text-[8px] font-bold text-stone-400 mt-0.5">Entrée : {item.stockEntryDate}</p>
                        )}
                      </td>
                      <td className="px-4 py-3 text-[10px] font-bold text-stone-500 whitespace-nowrap">{item.categoryId}</td>
                      <td className="px-4 py-3 text-[10px] font-bold text-stone-500">{item.color || '—'}</td>
                      <td className="px-4 py-3 text-[10px] font-bold text-stone-500">{item.size || '—'}</td>
                      <td className="px-4 py-3">
                        <div className="space-y-1">
                          <span className={`text-sm font-black ${item.currentQty === 0 ? 'text-red-600' : item.currentQty <= (item.minThreshold || Infinity) ? 'text-orange-600' : 'text-stone-900'}`}>
                            {fmtN(item.currentQty)}
                          </span>
                          {pct !== null && (
                            <div className="w-full h-1.5 bg-stone-100 rounded-full overflow-hidden">
                              <div
                                className={`h-full rounded-full ${pct === 0 ? 'bg-red-500' : pct < 50 ? 'bg-orange-400' : 'bg-emerald-500'}`}
                                style={{ width: `${pct}%` }}
                              />
                            </div>
                          )}
                        </div>
                      </td>
                      <td className="px-4 py-3 text-[9px] font-black text-stone-400 uppercase">{item.unitOfMeasure}</td>
                      <td className="px-4 py-3 text-[10px] font-black text-stone-500 whitespace-nowrap">{fmt$(item.purchasePricePerUnit)}</td>
                      {/* Prix de vente — éditable inline */}
                      <td className="px-4 py-3 whitespace-nowrap">
                        {editPriceId === item.articleId ? (
                          <div className="flex items-center gap-1">
                            <Input
                              type="number" min={0} step="any" autoFocus
                              value={editPriceVal}
                              onChange={e => setEditPriceVal(e.target.value)}
                              onKeyDown={e => {
                                if (e.key === 'Enter') handleSaveSellingPrice(item.articleId, item.unitOfMeasure);
                                if (e.key === 'Escape') setEditPriceId(null);
                              }}
                              className="h-7 w-24 text-xs font-black rounded-lg border-emerald-300 focus:border-emerald-500"
                            />
                            <button onClick={() => handleSaveSellingPrice(item.articleId, item.unitOfMeasure)}
                              className="text-emerald-600 hover:text-emerald-800 font-black text-[10px] px-1.5 py-1 bg-emerald-50 rounded-lg">
                              ✓
                            </button>
                            <button onClick={() => setEditPriceId(null)} className="text-stone-400 hover:text-red-500 font-black text-[10px] px-1.5 py-1">
                              ✕
                            </button>
                          </div>
                        ) : (
                          <button
                            onClick={() => { setEditPriceId(item.articleId); setEditPriceVal(String(item.sellingPrice ?? '')); }}
                            className={`text-[10px] font-black px-2 py-1 rounded-lg transition-colors ${item.sellingPrice ? 'text-violet-700 bg-violet-50 hover:bg-violet-100' : 'text-stone-300 bg-stone-50 hover:bg-stone-100 hover:text-stone-600'}`}
                          >
                            {item.sellingPrice ? fmt$(item.sellingPrice) : '+ Définir'}
                          </button>
                        )}
                      </td>
                      {/* Marge */}
                      <td className="px-4 py-3 whitespace-nowrap">
                        {item.sellingPrice ? (
                          <div>
                            <span className={`text-[10px] font-black ${item.sellingPrice > item.purchasePricePerUnit ? 'text-emerald-600' : 'text-red-500'}`}>
                              {fmt$(item.sellingPrice - item.purchasePricePerUnit)}
                            </span>
                            <span className="text-[8px] text-stone-400 font-bold block">
                              {((item.sellingPrice - item.purchasePricePerUnit) / item.sellingPrice * 100).toFixed(1)}%
                            </span>
                          </div>
                        ) : <span className="text-stone-200 text-[10px]">—</span>}
                      </td>
                      <td className="px-4 py-3 text-[10px] font-black text-emerald-700 whitespace-nowrap">{fmt$(item.totalValue)}</td>
                      <td className="px-4 py-3">
                        <span className={`inline-block text-[8px] font-black uppercase px-2 py-0.5 rounded-lg border ${badge.className}`}>
                          {badge.label}
                        </span>
                        {item.minThreshold != null && (
                          <p className="text-[7px] text-stone-400 font-bold mt-0.5">Seuil: {fmtN(item.minThreshold)}</p>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                          <button
                            onClick={() => setMovModal({ open: true, articleId: item.articleId, type: 'IN' })}
                            className="w-7 h-7 rounded-lg bg-emerald-100 hover:bg-emerald-200 text-emerald-700 flex items-center justify-center font-black text-sm transition-colors"
                            title="Entrée"
                          >+</button>
                          <button
                            onClick={() => setMovModal({ open: true, articleId: item.articleId, type: 'OUT' })}
                            className="w-7 h-7 rounded-lg bg-red-100 hover:bg-red-200 text-red-700 flex items-center justify-center font-black text-sm transition-colors"
                            title="Sortie"
                          >-</button>
                          <button
                            onClick={() => { setThreshModal({ open: true, item }); setThreshValue(String(item.minThreshold ?? '')); }}
                            className="w-7 h-7 rounded-lg bg-stone-100 hover:bg-stone-200 text-stone-600 flex items-center justify-center transition-colors"
                            title="Configurer seuil"
                          >
                            <Settings className="w-3 h-3" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>

            {/* Footer */}
            <div className="px-4 py-3 bg-stone-50 border-t border-stone-100 flex items-center justify-between">
              <span className="text-[9px] font-black text-stone-400 uppercase tracking-widest">
                {filtered.length} / {stockItems.length} référence{stockItems.length > 1 ? 's' : ''}
              </span>
              <div className="flex items-center gap-2">
                <DollarSign className="w-3 h-3 text-emerald-500" />
                <span className="text-[10px] font-black text-emerald-700">
                  Total sélection : {fmt$(totalFilteredValue)}
                </span>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Modals */}
      <StockMovementModal
        open={movModal.open}
        onOpenChange={open => setMovModal({ open })}
        articles={articles}
        categories={categories}
        stockItems={stockItems}
        preselectedArticleId={movModal.articleId}
        preselectedType={movModal.type}
        onSubmit={onAddMovement}
      />

      <Dialog open={threshModal.open} onOpenChange={open => !open && setThreshModal({ open: false })}>
        <DialogContent className="sm:max-w-sm rounded-3xl border-none shadow-2xl">
          <DialogHeader>
            <DialogTitle className="text-[11px] font-black uppercase tracking-widest text-stone-500">Seuil d'alerte minimal</DialogTitle>
            <p className="text-base font-black text-stone-900 uppercase tracking-tight">{threshModal.item?.productName}</p>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <p className="text-xs text-stone-500 font-bold">
              Stock actuel : <strong>{fmtN(threshModal.item?.currentQty || 0)} {threshModal.item?.unitOfMeasure}</strong>
            </p>
            <div className="space-y-1.5">
              <Label className="text-[9px] font-black uppercase tracking-widest text-stone-500">
                Seuil minimal ({threshModal.item?.unitOfMeasure})
              </Label>
              <Input
                type="number" min={0} step="any"
                value={threshValue}
                onChange={e => setThreshValue(e.target.value)}
                placeholder="Ex: 500"
                className="h-12 text-xl font-black rounded-xl border-stone-200"
              />
              <p className="text-[9px] text-stone-400 font-bold">
                Alerte déclenchée quand le stock passe sous ce seuil.
              </p>
            </div>
          </div>
          <DialogFooter className="gap-2">
            <Button variant="ghost" onClick={() => setThreshModal({ open: false })} className="rounded-xl font-black uppercase text-[10px]">Annuler</Button>
            <Button onClick={handleSaveThreshold} className="bg-emerald-600 hover:bg-emerald-700 text-white font-black uppercase text-[10px] tracking-widest px-6 rounded-xl">
              Enregistrer
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
