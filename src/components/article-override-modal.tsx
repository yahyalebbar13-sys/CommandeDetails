"use client";

import React, { useState, useEffect } from 'react';
import { X, AlertTriangle, RotateCcw, Save } from 'lucide-react';

export interface ArticleOverride {
  hsCode?: string;
  customsValuePerKg?: number | null;
  importDutyRate?: number | null; // stored as % (e.g. 25)
  tpiRate?: number | null;
  ticRate?: number | null;
  tvaRate?: number | null;
  netWeight?: number | null;
  cubicMeasurement?: number | null;
  quantity?: number | null;
  purchasePricePerUnit?: number | null;
}

interface Props {
  article: any;
  override: ArticleOverride;
  onSave: (override: ArticleOverride) => void;
  onClose: () => void;
}

export default function ArticleOverrideModal({ article, override, onSave, onClose }: Props) {
  const [form, setForm] = useState<ArticleOverride>({ ...override });

  useEffect(() => { setForm({ ...override }); }, [article?.id]);

  const set = (key: keyof ArticleOverride, val: string) => {
    setForm(prev => ({ ...prev, [key]: val === '' ? null : isNaN(Number(val)) ? val : Number(val) }));
  };

  const handleReset = () => setForm({});

  const inputCls = "w-full bg-stone-800 border border-stone-600 text-white text-sm font-bold rounded-lg px-3 h-9 focus:outline-none focus:border-amber-500 transition-colors placeholder:text-stone-500";
  const labelCls = "text-[9px] font-black text-stone-400 uppercase tracking-widest mb-1 block";

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" />
      <div
        className="relative bg-stone-900 rounded-2xl shadow-2xl border border-stone-700 w-full max-w-lg"
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-start justify-between p-6 border-b border-stone-700">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <div className="p-1.5 bg-amber-500 rounded-lg">
                <AlertTriangle className="w-4 h-4 text-white" />
              </div>
              <span className="text-[9px] font-black text-amber-500 uppercase tracking-widest">Fausse Déclaration</span>
            </div>
            <h2 className="text-lg font-black text-white uppercase tracking-tight leading-none">
              Override Douanier
            </h2>
            <p className="text-[10px] font-bold text-stone-400 mt-1 uppercase">{article?.name || article?.categoryId}</p>
          </div>
          <button onClick={onClose} className="p-2 hover:bg-stone-800 rounded-xl transition-colors">
            <X className="w-5 h-5 text-stone-400" />
          </button>
        </div>

        {/* Body */}
        <div className="p-6 space-y-5 max-h-[70vh] overflow-y-auto">
          {/* Info banner */}
          <div className="bg-amber-500/10 border border-amber-500/30 rounded-xl p-3">
            <p className="text-[10px] font-bold text-amber-400 leading-relaxed">
              Les valeurs saisies ici <span className="text-amber-300 font-black">remplacent</span> les données de la catégorie pour cet article uniquement. Laissez vide pour utiliser les valeurs par défaut.
            </p>
          </div>

          {/* Code HS */}
          <div>
            <label className={labelCls}>Code HS (info)</label>
            <input
              className={inputCls}
              placeholder={`Ex: 6203.42`}
              value={form.hsCode ?? ''}
              onChange={e => setForm(p => ({ ...p, hsCode: e.target.value || undefined }))}
            />
          </div>

          {/* Douane section */}
          <div>
            <p className="text-[9px] font-black text-orange-400 uppercase tracking-widest mb-3 pb-1 border-b border-stone-700">
              Paramètres Douaniers
            </p>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className={labelCls}>Val. Douane / kg (MAD)</label>
                <input
                  className={inputCls}
                  type="number"
                  placeholder={`Actuel: ${article?.cat?.customsValuePerKg ?? '—'}`}
                  value={form.customsValuePerKg ?? ''}
                  onChange={e => set('customsValuePerKg', e.target.value)}
                />
              </div>
              <div>
                <label className={labelCls}>Taux DI (%)</label>
                <input
                  className={inputCls}
                  type="number"
                  placeholder={`Actuel: ${article?.cat?.importDutyRate ?? '—'}`}
                  value={form.importDutyRate ?? ''}
                  onChange={e => set('importDutyRate', e.target.value)}
                />
              </div>
              <div>
                <label className={labelCls}>Taux TPI (%)</label>
                <input
                  className={inputCls}
                  type="number"
                  placeholder={`Actuel: ${article?.cat?.tpiRate ?? '—'}`}
                  value={form.tpiRate ?? ''}
                  onChange={e => set('tpiRate', e.target.value)}
                />
              </div>
              <div>
                <label className={labelCls}>Taux TIC (%)</label>
                <input
                  className={inputCls}
                  type="number"
                  placeholder={`Actuel: ${article?.cat?.ticRate ?? '—'}`}
                  value={form.ticRate ?? ''}
                  onChange={e => set('ticRate', e.target.value)}
                />
              </div>
              <div>
                <label className={labelCls}>Taux TVA (%)</label>
                <input
                  className={inputCls}
                  type="number"
                  placeholder={`Actuel: ${article?.cat?.tvaRate ?? '—'}`}
                  value={form.tvaRate ?? ''}
                  onChange={e => set('tvaRate', e.target.value)}
                />
              </div>
            </div>
          </div>

          {/* Données physiques section */}
          <div>
            <p className="text-[9px] font-black text-sky-400 uppercase tracking-widest mb-3 pb-1 border-b border-stone-700">
              Données Physiques Corrigées
            </p>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className={labelCls}>Poids net / NW (kg)</label>
                <input
                  className={inputCls}
                  type="number"
                  placeholder={`Actuel: ${article?.netWeight ?? '—'}`}
                  value={form.netWeight ?? ''}
                  onChange={e => set('netWeight', e.target.value)}
                />
              </div>
              <div>
                <label className={labelCls}>CBM (m³)</label>
                <input
                  className={inputCls}
                  type="number"
                  placeholder={`Actuel: ${article?.cubicMeasurement ?? '—'}`}
                  value={form.cubicMeasurement ?? ''}
                  onChange={e => set('cubicMeasurement', e.target.value)}
                />
              </div>
              <div>
                <label className={labelCls}>Quantité</label>
                <input
                  className={inputCls}
                  type="number"
                  placeholder={`Actuel: ${article?.quantity ?? '—'}`}
                  value={form.quantity ?? ''}
                  onChange={e => set('quantity', e.target.value)}
                />
              </div>
              <div>
                <label className={labelCls}>Prix achat unitaire ($)</label>
                <input
                  className={inputCls}
                  type="number"
                  placeholder={`Actuel: ${article?.purchasePricePerUnit ?? '—'}`}
                  value={form.purchasePricePerUnit ?? ''}
                  onChange={e => set('purchasePricePerUnit', e.target.value)}
                />
              </div>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between p-6 border-t border-stone-700">
          <button
            onClick={handleReset}
            className="flex items-center gap-2 px-4 h-10 bg-stone-800 hover:bg-stone-700 text-stone-300 font-black text-[10px] uppercase tracking-widest rounded-xl transition-colors"
          >
            <RotateCcw className="w-3.5 h-3.5" /> Réinitialiser
          </button>
          <button
            onClick={() => { onSave(form); onClose(); }}
            className="flex items-center gap-2 px-6 h-10 bg-amber-500 hover:bg-amber-400 text-white font-black text-[10px] uppercase tracking-widest rounded-xl transition-colors shadow-lg shadow-amber-500/20"
          >
            <Save className="w-3.5 h-3.5" /> Appliquer
          </button>
        </div>
      </div>
    </div>
  );
}
