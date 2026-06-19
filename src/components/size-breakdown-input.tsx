
"use client";

import React, { useState, useCallback, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import { Maximize, Plus, Trash2, ClipboardPaste, Hash, Package } from 'lucide-react';

export interface SizeBreakdownRow {
  size: string;
  quantity: number;
  priceOverride?: string | number;
}

interface SizeBreakdownInputProps {
  value: SizeBreakdownRow[] | null;
  onChange: (rows: SizeBreakdownRow[] | null, total: number) => void;
}

function parsePastedSizes(raw: string): SizeBreakdownRow[] {
  const lines = raw.split(/\r?\n/).filter(l => l.trim() !== '');
  const rows: SizeBreakdownRow[] = [];
  for (const line of lines) {
    const parts = line.trim().split(/\t|;|\s{2,}|\s+/);
    if (parts.length < 2) continue;
    const size = parts[0].trim();
    let quantity = 0;
    let priceOverride: number | undefined = undefined;
    if (parts.length >= 3) {
      quantity = parseFloat(parts[1].replace(',', '.'));
      const priceVal = parseFloat(parts[parts.length - 1].replace(',', '.'));
      if (!isNaN(priceVal) && priceVal > 0) priceOverride = priceVal;
    } else {
      quantity = parseFloat(parts[parts.length - 1].replace(',', '.'));
    }
    if (!size || isNaN(quantity) || quantity < 0) continue;
    rows.push({ size, quantity, priceOverride: priceOverride || '' });
  }
  return rows;
}

export default function SizeBreakdownInput({ value, onChange }: SizeBreakdownInputProps) {
  const [enabled, setEnabled] = useState<boolean>(!!value && value.length > 0);
  const [rows, setRows] = useState<SizeBreakdownRow[]>(value || []);
  const [pasteText, setPasteText] = useState('');
  const [showPasteArea, setShowPasteArea] = useState(false);
  const [rawQuantityInputs, setRawQuantityInputs] = useState<Record<number, string>>({});

  useEffect(() => {
    if (value && value.length > 0) {
      setEnabled(true);
      setRows(value);
    }
  }, [value]);

  const total = rows.reduce((sum, r) => sum + (Number(r.quantity) || 0), 0);

  const notifyParent = useCallback((newRows: SizeBreakdownRow[], isEnabled: boolean) => {
    if (!isEnabled || newRows.length === 0) {
      onChange(null, 0);
    } else {
      const t = newRows.reduce((sum, r) => sum + (Number(r.quantity) || 0), 0);
      onChange(newRows, t);
    }
  }, [onChange]);

  const handleToggle = (checked: boolean) => {
    setEnabled(checked);
    if (!checked) {
      setRows([]);
      setPasteText('');
      setShowPasteArea(false);
      onChange(null, 0);
    }
  };

  const handleParse = () => {
    if (!pasteText.trim()) return;
    const parsed = parsePastedSizes(pasteText);
    if (parsed.length > 0) {
      const next = [...rows, ...parsed];
      setRows(next);
      notifyParent(next, enabled);
      setPasteText('');
      setShowPasteArea(false);
    }
  };

  const handleRowChange = (index: number, field: keyof SizeBreakdownRow, val: string) => {
    const next = rows.map((r, i) => {
      if (i !== index) return r;
      if (field === 'quantity') {
        const normalised = val.replace(',', '.');
        setRawQuantityInputs(prev => ({ ...prev, [index]: val }));
        const parsed = parseFloat(normalised);
        return { ...r, [field]: isNaN(parsed) ? 0 : parsed };
      }
      if (field === 'priceOverride') {
        // Allow comma as decimal separator (French locale)
        const normalised = val.replace(',', '.');
        const parsed = parseFloat(normalised);
        return { ...r, [field]: val === '' ? '' : (isNaN(parsed) ? r.priceOverride : normalised) };
      }
      return { ...r, [field]: val };
    });
    setRows(next);
    notifyParent(next, enabled);
  };

  const handleDeleteRow = (index: number) => {
    const next = rows.filter((_, i) => i !== index);
    setRows(next);
    notifyParent(next, enabled);
  };

  const handleAddRow = () => {
    const next = [...rows, { size: '', quantity: 0, priceOverride: '' }];
    setRows(next);
    notifyParent(next, enabled);
  };

  return (
    <div className={`rounded-xl border transition-all duration-300 ${enabled ? 'bg-teal-50 border-teal-200' : 'bg-stone-50 border-dashed border-stone-200'}`}>
      {/* Toggle Header */}
      <div className="flex items-center justify-between p-4">
        <div className="flex items-center gap-2">
          <Maximize className={`w-4 h-4 ${enabled ? 'text-teal-600' : 'text-stone-400'}`} />
          <span className={`text-[10px] font-black uppercase tracking-widest ${enabled ? 'text-teal-700' : 'text-stone-500'}`}>
            Commande Multi-Tailles
          </span>
          {enabled && rows.length > 0 && (
            <span className="text-[9px] font-bold bg-teal-200 text-teal-800 px-2 py-0.5 rounded-full">
              {rows.length} tailles · {total.toLocaleString()} unités
            </span>
          )}
        </div>
        <Switch checked={enabled} onCheckedChange={handleToggle} />
      </div>

      {!enabled && (
        <p className="text-[9px] font-bold text-stone-400 uppercase text-center pb-3 italic px-4">
          Activer pour saisir les tailles et quantités (avec prix optionnel par taille)
        </p>
      )}

      {enabled && (
        <div className="px-4 pb-4 space-y-3">
          {/* Paste toggle */}
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => setShowPasteArea(v => !v)}
            className="h-8 text-[9px] font-black uppercase tracking-widest border-teal-200 text-teal-600 hover:bg-teal-100 rounded-lg gap-1.5 w-full"
          >
            <ClipboardPaste className="w-3.5 h-3.5" />
            {showPasteArea ? 'Masquer la zone de collage' : 'Coller un tableau (Excel / Texte)'}
          </Button>

          {showPasteArea && (
            <div className="space-y-2 animate-in fade-in slide-in-from-top-1 duration-200">
              <label className="text-[9px] font-black text-teal-500 uppercase tracking-widest block">
                Coller ici (format : Taille[TAB]Quantité[TAB]Prix optionnel)
              </label>
              <textarea
                className="w-full h-28 text-[11px] font-mono border border-teal-200 rounded-lg p-3 resize-none focus:outline-none focus:ring-2 focus:ring-teal-400 bg-white placeholder:text-stone-300"
                placeholder={"No.5\t500\nNo.7\t300\t1.80\nNo.8\t200\n..."}
                value={pasteText}
                onChange={e => setPasteText(e.target.value)}
                onPaste={e => {
                  setTimeout(() => {
                    const text = e.currentTarget.value + e.clipboardData.getData('text');
                    const parsed = parsePastedSizes(text);
                    if (parsed.length > 0) {
                      const next = [...rows, ...parsed];
                      setRows(next);
                      notifyParent(next, true);
                      setPasteText('');
                      setShowPasteArea(false);
                    }
                  }, 50);
                }}
              />
              <div className="flex gap-2">
                <Button
                  type="button"
                  size="sm"
                  onClick={handleParse}
                  className="flex-1 h-8 bg-teal-600 hover:bg-teal-700 text-white text-[9px] font-black uppercase tracking-widest rounded-lg"
                >
                  Analyser et Importer
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => { setPasteText(''); setShowPasteArea(false); }}
                  className="h-8 text-[9px] font-bold uppercase border-stone-200 rounded-lg"
                >
                  Annuler
                </Button>
              </div>
            </div>
          )}

          {/* Table */}
          {rows.length > 0 && (
            <div className="rounded-xl overflow-hidden border border-teal-100 bg-white">
              <div className="grid grid-cols-[1fr_90px_90px_36px] gap-0 bg-teal-100/60">
                <div className="py-2 px-3 text-[9px] font-black uppercase text-teal-600 tracking-widest flex items-center gap-1">
                  <Hash className="w-2.5 h-2.5" /> Taille
                </div>
                <div className="py-2 px-1 text-[9px] font-black uppercase text-teal-600 tracking-widest text-right">
                  Prix Opt ($)
                </div>
                <div className="py-2 px-3 text-[9px] font-black uppercase text-teal-600 tracking-widest text-right flex items-center justify-end gap-1">
                  <Package className="w-2.5 h-2.5" /> Qté
                </div>
                <div />
              </div>

              <div className="divide-y divide-teal-50">
                {rows.map((row, i) => (
                  <div key={i} className="grid grid-cols-[1fr_90px_90px_36px] gap-0 items-center hover:bg-teal-50/30 transition-colors">
                    <div className="px-2 py-1">
                      <Input
                        value={row.size}
                        onChange={e => handleRowChange(i, 'size', e.target.value)}
                        className="h-8 border-0 bg-transparent font-black text-[11px] text-stone-800 uppercase focus-visible:ring-0 focus-visible:ring-offset-0 px-1"
                        placeholder="No.5..."
                      />
                    </div>
                    <div className="px-2 py-1">
                      <Input
                        type="text"
                        inputMode="decimal"
                        value={row.priceOverride === '' ? '' : row.priceOverride}
                        onChange={e => handleRowChange(i, 'priceOverride', e.target.value)}
                        className="h-8 border border-transparent hover:border-teal-200 focus:border-teal-400 bg-transparent font-bold text-[10px] text-teal-700 text-right focus-visible:ring-0 focus-visible:ring-offset-0 px-2 rounded placeholder:text-teal-200 transition-colors"
                        placeholder="Normal"
                        title="Prix spécifique si différent du prix global (ex: 1.6 ou 1,6)"
                      />
                    </div>
                    <div className="px-2 py-1">
                      <Input
                        type="text"
                        inputMode="decimal"
                        value={rawQuantityInputs[i] !== undefined ? rawQuantityInputs[i] : (row.quantity === 0 ? '' : row.quantity)}
                        onChange={e => handleRowChange(i, 'quantity', e.target.value)}
                        onBlur={() => {
                           setRawQuantityInputs(prev => {
                             const next = { ...prev };
                             delete next[i];
                             return next;
                           });
                        }}
                        className="h-8 border-0 bg-transparent font-black text-[11px] text-stone-900 text-right focus-visible:ring-0 focus-visible:ring-offset-0 px-1"
                        placeholder="0"
                      />
                    </div>
                    <div className="flex items-center justify-center pr-1">
                      <button
                        type="button"
                        onClick={() => handleDeleteRow(i)}
                        className="w-6 h-6 rounded flex items-center justify-center text-stone-300 hover:text-red-500 hover:bg-red-50 transition-colors"
                      >
                        <Trash2 className="w-3 h-3" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>

              <div className="grid grid-cols-[1fr_90px_90px_36px] bg-teal-600 text-white">
                <div className="py-2.5 px-3 text-[9px] font-black uppercase tracking-widest col-span-2">TOTAL</div>
                <div className="py-2.5 px-3 text-right text-[11px] font-black">{total.toLocaleString('en-US')} unités</div>
                <div />
              </div>
            </div>
          )}

          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={handleAddRow}
            className="h-8 text-[9px] font-black uppercase tracking-widest border-teal-200 text-teal-600 hover:bg-teal-100 rounded-lg gap-1.5"
          >
            <Plus className="w-3 h-3" /> Ajouter une taille
          </Button>

          {rows.length > 0 && (
            <p className="text-[9px] font-bold text-teal-600 uppercase bg-teal-100 px-3 py-2 rounded-lg">
              ✓ Quantité totale calculée : <span className="font-black">{total.toLocaleString('en-US')} unités</span>
              {rows.some(r => r.priceOverride !== '' && r.priceOverride !== undefined) && (
                <span className="ml-1 text-amber-600"> · Auto-split activé par prix</span>
              )}
            </p>
          )}
        </div>
      )}
    </div>
  );
}
