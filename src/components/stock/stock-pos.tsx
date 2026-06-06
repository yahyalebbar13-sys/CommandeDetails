"use client";

import React, { useState, useMemo, useCallback } from 'react';
import { ShoppingCart, Plus, Minus, Trash2, CheckCircle2, Search, Tag, X, ChevronRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import type { StockItem, Sale, SaleItem } from '@/lib/types';

interface CartItem {
  stockItem: StockItem;
  qty: number;
}

interface StockPOSProps {
  stockItems: StockItem[];
  categories: any[];
  onValidateSale: (sale: Omit<Sale, 'id' | 'createdAt'>) => Promise<void>;
}

const fmt$ = (n: number) => n.toLocaleString('fr-MA', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const fmtN = (n: number) => n.toLocaleString('fr-FR');

export default function StockPOS({ stockItems, categories, onValidateSale }: StockPOSProps) {
  const [search, setSearch]         = useState('');
  const [activeCat, setActiveCat]   = useState<string>('all');
  const [cart, setCart]             = useState<CartItem[]>([]);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [clientName, setClientName] = useState('');
  const [notes, setNotes]           = useState('');
  const [saving, setSaving]         = useState(false);
  const [successOpen, setSuccessOpen] = useState(false);

  // Produits disponibles (stock > 0 et prix de vente défini)
  const availableItems = useMemo(() =>
    stockItems.filter(i => i.currentQty > 0),
    [stockItems]
  );

  // Catégories distinctes dans le stock
  const cats = useMemo(() => {
    const s = new Set<string>();
    availableItems.forEach(i => i.categoryId && s.add(i.categoryId));
    return Array.from(s).sort();
  }, [availableItems]);

  // Produits filtrés
  const filtered = useMemo(() => {
    let r = availableItems;
    if (activeCat !== 'all') r = r.filter(i => i.categoryId === activeCat);
    if (search) {
      const q = search.toLowerCase();
      r = r.filter(i =>
        i.productName.toLowerCase().includes(q) ||
        i.color?.toLowerCase().includes(q) ||
        i.size?.toLowerCase().includes(q) ||
        i.categoryId?.toLowerCase().includes(q)
      );
    }
    return r;
  }, [availableItems, activeCat, search]);

  // Totaux du panier
  const cartTotal   = cart.reduce((s, c) => s + (c.stockItem.sellingPrice || 0) * c.qty, 0);
  const cartCost    = cart.reduce((s, c) => s + c.stockItem.purchasePricePerUnit * c.qty, 0);
  const cartMargin  = cartTotal - cartCost;
  const cartItemCount = cart.reduce((s, c) => s + c.qty, 0);

  const addToCart = useCallback((item: StockItem) => {
    setCart(prev => {
      const existing = prev.find(c => c.stockItem.articleId === item.articleId);
      if (existing) {
        // Ne pas dépasser le stock disponible
        if (existing.qty >= item.currentQty) return prev;
        return prev.map(c => c.stockItem.articleId === item.articleId ? { ...c, qty: c.qty + 1 } : c);
      }
      return [...prev, { stockItem: item, qty: 1 }];
    });
  }, []);

  const updateQty = useCallback((articleId: string, delta: number) => {
    setCart(prev => prev
      .map(c => c.stockItem.articleId === articleId
        ? { ...c, qty: Math.max(0, Math.min(c.qty + delta, c.stockItem.currentQty)) }
        : c
      )
      .filter(c => c.qty > 0)
    );
  }, []);

  const removeFromCart = useCallback((articleId: string) => {
    setCart(prev => prev.filter(c => c.stockItem.articleId !== articleId));
  }, []);

  const handleValidate = async () => {
    if (cart.length === 0 || saving) return;
    setSaving(true);
    try {
      const today = new Date().toISOString().split('T')[0];
      const items: SaleItem[] = cart.map(c => ({
        articleId:    c.stockItem.articleId,
        productName:  c.stockItem.productName,
        color:        c.stockItem.color,
        size:         c.stockItem.size,
        categoryId:   c.stockItem.categoryId,
        unitOfMeasure: c.stockItem.unitOfMeasure,
        qty:          c.qty,
        sellingPrice: c.stockItem.sellingPrice || 0,
        costPrice:    c.stockItem.purchasePricePerUnit,
        totalPrice:   (c.stockItem.sellingPrice || 0) * c.qty,
        totalCost:    c.stockItem.purchasePricePerUnit * c.qty,
        margin:       ((c.stockItem.sellingPrice || 0) - c.stockItem.purchasePricePerUnit) * c.qty,
      }));
      await onValidateSale({
        items,
        totalAmount: cartTotal,
        totalCost:   cartCost,
        totalMargin: cartMargin,
        date:        today,
        clientName:  clientName || undefined,
        notes:       notes || undefined,
      });
      setCart([]);
      setClientName('');
      setNotes('');
      setConfirmOpen(false);
      setSuccessOpen(true);
      setTimeout(() => setSuccessOpen(false), 3000);
    } finally {
      setSaving(false);
    }
  };

  // Couleur de fond par catégorie
  const catColors = ['bg-emerald-50 border-emerald-200 text-emerald-800', 'bg-blue-50 border-blue-200 text-blue-800', 'bg-violet-50 border-violet-200 text-violet-800', 'bg-amber-50 border-amber-200 text-amber-800', 'bg-rose-50 border-rose-200 text-rose-800', 'bg-cyan-50 border-cyan-200 text-cyan-800'];
  const catColorMap = useMemo(() => {
    const m: Record<string, string> = {};
    cats.forEach((c, i) => { m[c] = catColors[i % catColors.length]; });
    return m;
  }, [cats]);

  return (
    <div className="flex flex-col lg:flex-row gap-4 min-h-[calc(100vh-12rem)] animate-in fade-in duration-500">

      {/* ── GAUCHE : Catalogue produits ── */}
      <div className="flex-1 flex flex-col gap-4">

        {/* Header + Recherche */}
        <div className="bg-white rounded-2xl shadow-lg border border-stone-100 p-4">
          <div className="flex items-center gap-3 mb-3">
            <div className="p-2 bg-emerald-100 rounded-xl">
              <Tag className="w-5 h-5 text-emerald-700" />
            </div>
            <div>
              <h2 className="text-base font-black text-stone-900 uppercase tracking-tighter">Caisse · Point de Vente</h2>
              <p className="text-[9px] font-bold text-stone-400 uppercase tracking-widest">{availableItems.length} produit{availableItems.length > 1 ? 's' : ''} disponible{availableItems.length > 1 ? 's' : ''}</p>
            </div>
          </div>
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-stone-400" />
            <Input
              placeholder="Rechercher un produit..."
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="pl-10 h-11 rounded-xl border-stone-200 text-sm font-bold"
            />
          </div>
        </div>

        {/* Catégorie tabs */}
        <div className="flex gap-2 overflow-x-auto pb-1">
          <button
            onClick={() => setActiveCat('all')}
            className={`flex-shrink-0 px-4 py-2 rounded-xl text-[10px] font-black uppercase tracking-wider border transition-all ${
              activeCat === 'all' ? 'bg-stone-900 text-white border-stone-900 shadow-lg' : 'bg-white text-stone-500 border-stone-200 hover:border-stone-400'
            }`}
          >
            Tout ({availableItems.length})
          </button>
          {cats.map(cat => {
            const count = availableItems.filter(i => i.categoryId === cat).length;
            return (
              <button
                key={cat}
                onClick={() => setActiveCat(cat)}
                className={`flex-shrink-0 px-4 py-2 rounded-xl text-[10px] font-black uppercase tracking-wider border transition-all ${
                  activeCat === cat ? 'bg-emerald-600 text-white border-emerald-600 shadow-lg shadow-emerald-500/20' : 'bg-white text-stone-500 border-stone-200 hover:border-emerald-300'
                }`}
              >
                {cat.length > 20 ? cat.substring(0, 20) + '…' : cat} ({count})
              </button>
            );
          })}
        </div>

        {/* Grille produits */}
        {filtered.length === 0 ? (
          <div className="flex-1 flex flex-col items-center justify-center py-20 bg-white rounded-2xl border border-stone-100">
            <div className="w-16 h-16 rounded-2xl bg-stone-50 flex items-center justify-center mb-3">
              <ShoppingCart className="w-8 h-8 text-stone-300" />
            </div>
            <p className="text-stone-400 font-black uppercase text-[10px] tracking-widest">Aucun produit trouvé</p>
          </div>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-4 gap-3">
            {filtered.map(item => {
              const inCart = cart.find(c => c.stockItem.articleId === item.articleId);
              const hasSellPrice = item.sellingPrice != null && item.sellingPrice > 0;
              const isLowStock = item.currentQty <= 3;
              return (
                <button
                  key={item.articleId}
                  onClick={() => hasSellPrice && addToCart(item)}
                  disabled={!hasSellPrice}
                  className={`relative flex flex-col text-left bg-white rounded-2xl border-2 transition-all shadow-sm hover:shadow-lg group ${
                    inCart
                      ? 'border-emerald-500 shadow-emerald-500/10'
                      : hasSellPrice
                      ? 'border-stone-100 hover:border-emerald-300 cursor-pointer'
                      : 'border-stone-100 opacity-50 cursor-not-allowed'
                  }`}
                >
                  {/* Badge catégorie */}
                  <div className={`absolute top-2 left-2 text-[7px] font-black uppercase px-1.5 py-0.5 rounded-lg border ${catColorMap[item.categoryId] || 'bg-stone-50 border-stone-200 text-stone-500'}`}>
                    {item.categoryId?.substring(0, 15)}
                  </div>

                  {/* Badge in cart */}
                  {inCart && (
                    <div className="absolute top-2 right-2 w-6 h-6 rounded-full bg-emerald-500 text-white text-[10px] font-black flex items-center justify-center shadow-lg">
                      {inCart.qty}
                    </div>
                  )}

                  {/* Couleur visuelle */}
                  <div className={`mx-3 mt-8 mb-2 h-16 rounded-xl flex items-center justify-center text-2xl font-black uppercase ${
                    item.color
                      ? 'bg-gradient-to-br from-stone-50 to-stone-100'
                      : 'bg-gradient-to-br from-emerald-50 to-emerald-100'
                  }`}>
                    {item.color ? (
                      <div className="flex flex-col items-center gap-1">
                        <div
                          className="w-8 h-8 rounded-full border-2 border-white shadow-md"
                          style={{ backgroundColor: item.color.toLowerCase().startsWith('#') ? item.color : getColorCSS(item.color) }}
                        />
                        <span className="text-[8px] font-black text-stone-500 uppercase">{item.color}</span>
                      </div>
                    ) : (
                      <span className="text-stone-300 text-3xl">📦</span>
                    )}
                  </div>

                  <div className="px-3 pb-3 flex-1">
                    <p className="text-[10px] font-black text-stone-800 uppercase leading-tight mb-1 line-clamp-2">
                      {item.productName}
                    </p>
                    {item.size && (
                      <span className="inline-block text-[8px] font-black bg-stone-100 text-stone-500 px-1.5 py-0.5 rounded uppercase mb-2">{item.size}</span>
                    )}

                    {/* Prix */}
                    {hasSellPrice ? (
                      <p className="text-lg font-black text-emerald-700">{fmt$(item.sellingPrice!)}<span className="text-[8px] text-stone-400 font-bold ml-0.5">/{item.unitOfMeasure}</span></p>
                    ) : (
                      <p className="text-[9px] font-black text-stone-300 uppercase">Prix non défini</p>
                    )}

                    {/* Stock */}
                    <div className={`flex items-center gap-1 mt-1 ${isLowStock ? 'text-orange-500' : 'text-stone-400'}`}>
                      <div className={`w-1.5 h-1.5 rounded-full ${isLowStock ? 'bg-orange-400' : 'bg-emerald-400'}`} />
                      <span className="text-[8px] font-black uppercase">{fmtN(item.currentQty)} {item.unitOfMeasure}</span>
                    </div>
                  </div>

                  {/* Hover overlay */}
                  {hasSellPrice && (
                    <div className="absolute inset-0 rounded-2xl bg-emerald-600/0 group-hover:bg-emerald-600/5 flex items-end justify-center pb-2 opacity-0 group-hover:opacity-100 transition-all">
                      <span className="text-[9px] font-black text-emerald-700 uppercase bg-emerald-100 px-2 py-1 rounded-lg">
                        + Ajouter
                      </span>
                    </div>
                  )}
                </button>
              );
            })}
          </div>
        )}
      </div>

      {/* ── DROITE : Panier ── */}
      <div className="lg:w-80 xl:w-96 flex flex-col gap-3">
        <div className="bg-white rounded-2xl shadow-xl border border-stone-100 overflow-hidden sticky top-20">

          {/* Header panier */}
          <div className="bg-gradient-to-r from-stone-900 to-stone-800 p-4 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <ShoppingCart className="w-5 h-5 text-white" />
              <span className="text-sm font-black text-white uppercase tracking-tight">Panier</span>
            </div>
            <div className="flex items-center gap-2">
              {cartItemCount > 0 && (
                <span className="bg-emerald-500 text-white text-[10px] font-black px-2 py-0.5 rounded-full">{cartItemCount} article{cartItemCount > 1 ? 's' : ''}</span>
              )}
              {cart.length > 0 && (
                <button onClick={() => setCart([])} className="text-stone-400 hover:text-red-400 transition-colors">
                  <Trash2 className="w-4 h-4" />
                </button>
              )}
            </div>
          </div>

          {/* Items du panier */}
          <div className="max-h-[50vh] overflow-y-auto divide-y divide-stone-50">
            {cart.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-12 space-y-3">
                <ShoppingCart className="w-10 h-10 text-stone-200" />
                <p className="text-[10px] font-black text-stone-300 uppercase tracking-widest text-center">Panier vide<br />Cliquez sur un produit</p>
              </div>
            ) : cart.map(({ stockItem: item, qty }) => (
              <div key={item.articleId} className="flex items-center gap-3 p-3">
                <div className="flex-1 min-w-0">
                  <p className="text-[10px] font-black text-stone-800 uppercase truncate">{item.productName}</p>
                  {(item.color || item.size) && (
                    <p className="text-[8px] font-bold text-stone-400">{[item.color, item.size].filter(Boolean).join(' · ')}</p>
                  )}
                  <p className="text-[10px] font-black text-emerald-700 mt-0.5">
                    {fmt$(((item.sellingPrice || 0) * qty))}
                  </p>
                </div>
                <div className="flex items-center gap-1.5 shrink-0">
                  <button onClick={() => updateQty(item.articleId, -1)}
                    className="w-7 h-7 rounded-lg bg-stone-100 hover:bg-stone-200 text-stone-700 flex items-center justify-center font-black transition-colors">
                    <Minus className="w-3 h-3" />
                  </button>
                  <span className="w-6 text-center text-sm font-black text-stone-900">{qty}</span>
                  <button onClick={() => updateQty(item.articleId, +1)}
                    disabled={qty >= item.currentQty}
                    className="w-7 h-7 rounded-lg bg-stone-100 hover:bg-emerald-100 text-stone-700 hover:text-emerald-700 flex items-center justify-center font-black transition-colors disabled:opacity-30">
                    <Plus className="w-3 h-3" />
                  </button>
                  <button onClick={() => removeFromCart(item.articleId)}
                    className="w-7 h-7 rounded-lg text-stone-300 hover:text-red-500 hover:bg-red-50 flex items-center justify-center transition-colors">
                    <X className="w-3 h-3" />
                  </button>
                </div>
              </div>
            ))}
          </div>

          {/* Total + Valider */}
          {cart.length > 0 && (
            <div className="border-t border-stone-100 p-4 space-y-3">
              <div className="space-y-1.5">
                <div className="flex justify-between text-[9px] font-bold text-stone-400 uppercase">
                  <span>Sous-total</span>
                  <span>{fmt$(cartTotal)}</span>
                </div>
                <div className="flex justify-between text-[9px] font-bold text-stone-400 uppercase">
                  <span>Coût achat</span>
                  <span>{fmt$(cartCost)}</span>
                </div>
                <div className="flex justify-between text-[9px] font-black text-emerald-600 uppercase">
                  <span>Marge brute</span>
                  <span>{cartMargin >= 0 ? '+' : ''}{fmt$(cartMargin)}</span>
                </div>
                <div className="flex justify-between items-center pt-1.5 border-t border-stone-100">
                  <span className="text-xs font-black text-stone-900 uppercase">TOTAL</span>
                  <span className="text-xl font-black text-stone-900">{fmt$(cartTotal)}</span>
                </div>
              </div>
              <Button
                onClick={() => setConfirmOpen(true)}
                className="w-full h-12 bg-emerald-600 hover:bg-emerald-700 text-white font-black uppercase tracking-widest text-sm rounded-xl shadow-lg shadow-emerald-500/30 gap-2"
              >
                Valider la vente <ChevronRight className="w-4 h-4" />
              </Button>
            </div>
          )}
        </div>
      </div>

      {/* ── Modal de confirmation ── */}
      <Dialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <DialogContent className="sm:max-w-md rounded-3xl border-none shadow-2xl p-0 overflow-hidden">
          <div className="bg-gradient-to-r from-emerald-600 to-emerald-500 p-6 text-white">
            <DialogTitle className="text-lg font-black uppercase tracking-tight">Confirmer la vente</DialogTitle>
            <p className="text-[10px] font-bold text-emerald-200 mt-1 uppercase tracking-wider">{cart.length} produit{cart.length > 1 ? 's' : ''} · Total : {fmt$(cartTotal)}</p>
          </div>
          <div className="p-6 space-y-4 bg-white">
            {/* Récap articles */}
            <div className="space-y-2 max-h-40 overflow-y-auto pr-1">
              {cart.map(({ stockItem: item, qty }) => (
                <div key={item.articleId} className="flex justify-between items-center text-[11px]">
                  <span className="font-bold text-stone-600 truncate flex-1">{qty}x {item.productName}</span>
                  <span className="font-black text-stone-900 shrink-0 ml-2">{fmt$((item.sellingPrice || 0) * qty)}</span>
                </div>
              ))}
            </div>
            <div className="border-t pt-3 flex justify-between font-black text-stone-900">
              <span>TOTAL</span>
              <span className="text-xl text-emerald-700">{fmt$(cartTotal)}</span>
            </div>
            <div className="space-y-1.5">
              <Label className="text-[9px] font-black text-stone-500 uppercase tracking-widest">Nom client (optionnel)</Label>
              <Input value={clientName} onChange={e => setClientName(e.target.value)} placeholder="Ex: Ahmed, Boutique XYZ..." className="h-10 rounded-xl border-stone-200 font-bold" />
            </div>
            <div className="space-y-1.5">
              <Label className="text-[9px] font-black text-stone-500 uppercase tracking-widest">Notes (optionnel)</Label>
              <Input value={notes} onChange={e => setNotes(e.target.value)} placeholder="Remarques, N° bon de commande..." className="h-10 rounded-xl border-stone-200 font-bold" />
            </div>
          </div>
          <DialogFooter className="p-4 bg-stone-50 gap-2">
            <Button variant="ghost" onClick={() => setConfirmOpen(false)} className="flex-1 font-black uppercase text-[10px] rounded-xl">Annuler</Button>
            <Button onClick={handleValidate} disabled={saving}
              className="flex-[2] h-11 bg-emerald-600 hover:bg-emerald-700 text-white font-black uppercase text-[10px] tracking-widest rounded-xl shadow-lg gap-2">
              {saving ? 'Enregistrement...' : <><CheckCircle2 className="w-4 h-4" /> Valider</>}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Succès ── */}
      {successOpen && (
        <div className="fixed bottom-6 right-6 z-50 bg-emerald-600 text-white px-6 py-4 rounded-2xl shadow-2xl flex items-center gap-3 animate-in slide-in-from-bottom-4">
          <CheckCircle2 className="w-6 h-6" />
          <div>
            <p className="font-black uppercase text-sm">Vente enregistrée !</p>
            <p className="text-[10px] font-bold text-emerald-200">Total : {fmt$(cartTotal)}</p>
          </div>
        </div>
      )}
    </div>
  );
}

// Helper : convertir nom couleur en CSS approximatif
function getColorCSS(colorName: string): string {
  const map: Record<string, string> = {
    rouge: '#ef4444', red: '#ef4444', bleu: '#3b82f6', blue: '#3b82f6',
    vert: '#22c55e', green: '#22c55e', noir: '#1c1917', black: '#1c1917',
    blanc: '#f5f5f4', white: '#f5f5f4', gris: '#6b7280', grey: '#6b7280', gray: '#6b7280',
    jaune: '#eab308', yellow: '#eab308', orange: '#f97316', violet: '#8b5cf6',
    purple: '#8b5cf6', rose: '#f43f5e', pink: '#ec4899', marron: '#92400e',
    brown: '#92400e', beige: '#d6c5a3', marine: '#1e3a5f', navy: '#1e3a5f',
    bordeaux: '#6b1e2b', kaki: '#6b7a42', turquoise: '#14b8a6',
  };
  return map[colorName.toLowerCase()] || '#d4d4d4';
}
