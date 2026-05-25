"use client";

import React, { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import type { StockMovement, StockMovementReason, StockMovementType, StockItem } from '@/lib/types';
import { ArrowDown, ArrowUp, SlidersHorizontal, PackageCheck } from 'lucide-react';

interface StockMovementModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  articles: any[];
  categories: any[];
  stockItems: StockItem[];
  preselectedArticleId?: string;
  preselectedType?: StockMovementType;
  onSubmit: (movement: Omit<StockMovement, 'id' | 'createdAt'>) => Promise<void>;
}

const REASONS_BY_TYPE: Record<StockMovementType, { value: StockMovementReason; label: string }[]> = {
  IN:  [
    { value: 'ARRIVAGE',    label: '📦 Arrivage fournisseur' },
    { value: 'RETOUR',      label: '↩️ Retour client' },
    { value: 'INVENTAIRE',  label: '🔄 Ajustement inventaire' },
  ],
  OUT: [
    { value: 'VENTE',       label: '🛒 Vente / Livraison' },
    { value: 'PERTE',       label: '❌ Perte / Casse' },
    { value: 'TRANSFERT',   label: '🔀 Transfert' },
    { value: 'INVENTAIRE',  label: '🔄 Ajustement inventaire' },
  ],
  ADJUSTMENT: [
    { value: 'INVENTAIRE',  label: '🔄 Régularisation inventaire' },
    { value: 'PERTE',       label: '❌ Perte / Différence' },
  ],
};

const TYPE_CONFIG = {
  IN:         { label: 'Entrée Stock',  color: 'emerald', icon: ArrowDown },
  OUT:        { label: 'Sortie Stock',  color: 'red',     icon: ArrowUp },
  ADJUSTMENT: { label: 'Ajustement',   color: 'blue',    icon: SlidersHorizontal },
};

export default function StockMovementModal({
  open, onOpenChange, articles, categories, stockItems,
  preselectedArticleId, preselectedType, onSubmit,
}: StockMovementModalProps) {

  const today = new Date().toISOString().split('T')[0];

  const [form, setForm] = useState({
    type:       (preselectedType ?? 'OUT') as StockMovementType,
    articleId:  preselectedArticleId ?? '',
    reason:     '' as StockMovementReason | '',
    quantity:   '' as string | number,
    date:       today,
    notes:      '',
  });
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (open) {
      setForm({
        type:      preselectedType ?? 'OUT',
        articleId: preselectedArticleId ?? '',
        reason:    '',
        quantity:  '',
        date:      today,
        notes:     '',
      });
    }
  }, [open, preselectedArticleId, preselectedType]);

  // Article sélectionné
  const selectedArticle = articles.find(a => a.id === form.articleId);
  const selectedStock   = stockItems.find(s => s.articleId === form.articleId);
  const reasons = REASONS_BY_TYPE[form.type] || [];
  const typeConf = TYPE_CONFIG[form.type];
  const Icon = typeConf.icon;

  // Couleur du header selon type
  const headerClass = form.type === 'IN'
    ? 'bg-gradient-to-r from-emerald-600 to-emerald-500'
    : form.type === 'OUT'
    ? 'bg-gradient-to-r from-red-600 to-red-500'
    : 'bg-gradient-to-r from-blue-600 to-blue-500';

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.articleId || !form.reason || !form.quantity || !form.date) return;
    if (!selectedArticle || !selectedStock) return;

    setSaving(true);
    const parts: string[] = [];
    if (selectedArticle.zipperType) parts.push(selectedArticle.zipperType);
    if (selectedArticle.slider)     parts.push(selectedArticle.slider);
    if (selectedArticle.color)      parts.push(selectedArticle.color.toUpperCase());
    if (selectedArticle.size)       parts.push(selectedArticle.size);
    const productName = parts.length > 0 ? parts.join(' - ') : (selectedArticle.name || 'Produit');

    await onSubmit({
      articleId:    form.articleId,
      categoryId:   selectedArticle.categoryId,
      productName,
      color:        selectedArticle.color,
      size:         selectedArticle.size,
      unitOfMeasure: selectedArticle.unitOfMeasure || 'unité',
      type:         form.type,
      reason:       form.reason as StockMovementReason,
      quantity:     Number(form.quantity),
      date:         form.date,
      notes:        form.notes || undefined,
    });
    setSaving(false);
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg p-0 rounded-3xl overflow-hidden border-none shadow-2xl">

        {/* Header */}
        <div className={`${headerClass} p-6 text-white`}>
          <DialogHeader>
            <div className="flex items-center gap-3">
              <div className="p-2.5 bg-white/20 backdrop-blur rounded-xl">
                <Icon className="w-5 h-5" />
              </div>
              <div>
                <DialogTitle className="text-lg font-black uppercase tracking-tight leading-none">
                  {typeConf.label}
                </DialogTitle>
                <p className="text-[10px] font-bold opacity-80 uppercase tracking-widest mt-1">
                  Enregistrer un mouvement de stock
                </p>
              </div>
            </div>
          </DialogHeader>

          {/* Type switcher */}
          <div className="flex gap-2 mt-4">
            {(Object.keys(TYPE_CONFIG) as StockMovementType[]).map(t => (
              <button key={t}
                type="button"
                onClick={() => setForm(f => ({ ...f, type: t, reason: '' }))}
                className={`flex-1 py-2 rounded-xl text-[9px] font-black uppercase tracking-wider transition-all border ${
                  form.type === t
                    ? 'bg-white text-stone-900 border-white shadow-lg'
                    : 'bg-white/10 text-white border-white/20 hover:bg-white/20'
                }`}
              >
                {TYPE_CONFIG[t].label}
              </button>
            ))}
          </div>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="p-6 space-y-4 bg-white">

          {/* Article */}
          <div className="space-y-1.5">
            <Label className="text-[9px] font-black uppercase tracking-widest text-stone-500">Produit *</Label>
            <Select value={form.articleId} onValueChange={v => setForm(f => ({ ...f, articleId: v }))}>
              <SelectTrigger className="h-11 rounded-xl border-stone-200 font-bold text-sm">
                <SelectValue placeholder="Sélectionner un produit en stock..." />
              </SelectTrigger>
              <SelectContent>
                {stockItems.map(si => {
                  const cat = categories.find(c => c.name === si.categoryId || c.id === si.categoryId);
                  return (
                    <SelectItem key={si.articleId} value={si.articleId}>
                      <div className="flex items-center gap-2">
                        <span className="font-bold text-xs">{si.productName}</span>
                        <span className="text-[9px] text-stone-400 font-bold">
                          {cat?.name || si.categoryId} · {si.currentQty} {si.unitOfMeasure}
                        </span>
                      </div>
                    </SelectItem>
                  );
                })}
              </SelectContent>
            </Select>

            {/* Stock courant */}
            {selectedStock && (
              <div className="flex items-center gap-3 px-3 py-2 bg-stone-50 rounded-xl border border-stone-100">
                <PackageCheck className="w-3.5 h-3.5 text-emerald-500 shrink-0" />
                <span className="text-[10px] font-bold text-stone-600">
                  Stock actuel : <strong className="text-stone-900">{selectedStock.currentQty.toLocaleString('fr-FR')} {selectedStock.unitOfMeasure}</strong>
                  {form.type === 'OUT' && Number(form.quantity) > 0 && (
                    <span className={`ml-2 ${selectedStock.currentQty - Number(form.quantity) < 0 ? 'text-red-600' : 'text-emerald-600'}`}>
                      → {(selectedStock.currentQty - Number(form.quantity)).toLocaleString('fr-FR')} après sortie
                    </span>
                  )}
                  {form.type === 'IN' && Number(form.quantity) > 0 && (
                    <span className="ml-2 text-emerald-600">
                      → {(selectedStock.currentQty + Number(form.quantity)).toLocaleString('fr-FR')} après entrée
                    </span>
                  )}
                </span>
              </div>
            )}
          </div>

          {/* Raison */}
          <div className="space-y-1.5">
            <Label className="text-[9px] font-black uppercase tracking-widest text-stone-500">Raison *</Label>
            <Select value={form.reason} onValueChange={v => setForm(f => ({ ...f, reason: v as StockMovementReason }))}>
              <SelectTrigger className="h-11 rounded-xl border-stone-200 font-bold text-sm">
                <SelectValue placeholder="Choisir la raison..." />
              </SelectTrigger>
              <SelectContent>
                {reasons.map(r => (
                  <SelectItem key={r.value} value={r.value}>
                    <span className="font-bold text-sm">{r.label}</span>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Quantité + Date */}
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label className="text-[9px] font-black uppercase tracking-widest text-stone-500">
                Quantité * {selectedStock && <span className="font-normal text-stone-400 normal-case">({selectedStock.unitOfMeasure})</span>}
              </Label>
              <Input
                type="number" min={0.01} step="any" required
                placeholder="0"
                value={form.quantity}
                onChange={e => setForm(f => ({ ...f, quantity: e.target.value }))}
                className="h-11 rounded-xl border-stone-200 font-black text-lg"
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-[9px] font-black uppercase tracking-widest text-stone-500">Date *</Label>
              <Input
                type="date" required
                value={form.date}
                onChange={e => setForm(f => ({ ...f, date: e.target.value }))}
                className="h-11 rounded-xl border-stone-200 font-bold"
              />
            </div>
          </div>

          {/* Notes */}
          <div className="space-y-1.5">
            <Label className="text-[9px] font-black uppercase tracking-widest text-stone-500">Notes (optionnel)</Label>
            <Input
              placeholder="Référence bon de livraison, client, remarque..."
              value={form.notes}
              onChange={e => setForm(f => ({ ...f, notes: e.target.value }))}
              className="h-11 rounded-xl border-stone-200 font-medium text-sm"
            />
          </div>

          {/* Warning sortie négatif */}
          {form.type === 'OUT' && selectedStock && Number(form.quantity) > selectedStock.currentQty && (
            <div className="flex items-center gap-2 px-3 py-2.5 bg-red-50 rounded-xl border border-red-200">
              <span className="text-[9px] font-black text-red-600 uppercase tracking-wider">
                ⚠ Quantité supérieure au stock disponible ({selectedStock.currentQty} {selectedStock.unitOfMeasure})
              </span>
            </div>
          )}
        </form>

        <DialogFooter className="px-6 pb-6 bg-white gap-2">
          <Button variant="ghost" onClick={() => onOpenChange(false)} className="rounded-xl font-black uppercase text-[10px] tracking-widest">Annuler</Button>
          <Button
            onClick={handleSubmit}
            disabled={saving || !form.articleId || !form.reason || !form.quantity}
            className={`flex-1 h-11 rounded-xl font-black uppercase text-[10px] tracking-widest text-white shadow-lg ${
              form.type === 'IN' ? 'bg-emerald-600 hover:bg-emerald-700 shadow-emerald-500/20'
              : form.type === 'OUT' ? 'bg-red-600 hover:bg-red-700 shadow-red-500/20'
              : 'bg-blue-600 hover:bg-blue-700 shadow-blue-500/20'
            }`}
          >
            {saving ? 'Enregistrement...' : `Confirmer ${typeConf.label}`}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
