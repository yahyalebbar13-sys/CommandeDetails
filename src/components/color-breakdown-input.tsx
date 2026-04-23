
"use client";

import React, { useState, useCallback, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Palette, Plus, Trash2, ClipboardPaste, Hash, Package } from 'lucide-react';

export interface ColorBreakdownRow {
  colorCode: string;
  rolls: number;
  priceOverride?: string | number; // Prix optionnel pour séparer automatiquement
}

interface ColorBreakdownInputProps {
  value: ColorBreakdownRow[] | null;
  onChange: (rows: ColorBreakdownRow[] | null, total: number) => void;
  unit?: string;
}

/**
 * Parse a pasted table string into color breakdown rows.
 * Supports TSV (Excel copy), multiple spaces, or semicolons as separators.
 * Each line = "colorCode[sep]quantity[optional sep]price"
 */
function parsePastedTable(raw: string): ColorBreakdownRow[] {
  const lines = raw.split(/\r?\n/).filter(l => l.trim() !== '');
  const rows: ColorBreakdownRow[] = [];

  for (const line of lines) {
    const parts = line.trim().split(/\t|;|,|\s{2,}|\s+/);
    if (parts.length < 2) continue;

    const colorCode = parts[0].trim();
    // Assuming quantity is either the last or second to last
    let rolls = 0;
    let priceOverride: number | undefined = undefined;

    if (parts.length >= 3) {
      // e.g. BLACK   20   1.6
      rolls = parseFloat(parts[1].replace(',', '.'));
      const priceVal = parseFloat(parts[parts.length - 1].replace(',', '.'));
      if (!isNaN(priceVal) && priceVal > 0) {
        priceOverride = priceVal;
      }
    } else {
      rolls = parseFloat(parts[parts.length - 1].replace(',', '.'));
    }

    if (!colorCode || isNaN(rolls) || rolls < 0) continue;
    rows.push({ colorCode, rolls, priceOverride: priceOverride || '' });
  }
  return rows;
}

export default function ColorBreakdownInput({ value, onChange, unit }: ColorBreakdownInputProps) {
  const [enabled, setEnabled] = useState<boolean>(!!value && value.length > 0);
  const [rows, setRows] = useState<ColorBreakdownRow[]>(value || []);
  const [pasteText, setPasteText] = useState('');
  const [showPasteArea, setShowPasteArea] = useState(false);

  // Sync from parent when value changes externally (e.g. loading an existing article)
  useEffect(() => {
    if (value && value.length > 0) {
      setEnabled(true);
      setRows(value);
    }
  }, [value]);

  const total = rows.reduce((sum, r) => sum + (Number(r.rolls) || 0), 0);

  const notifyParent = useCallback((newRows: ColorBreakdownRow[], isEnabled: boolean) => {
    if (!isEnabled || newRows.length === 0) {
      onChange(null, 0);
    } else {
      const t = newRows.reduce((sum, r) => sum + (Number(r.rolls) || 0), 0);
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
    const parsed = parsePastedTable(pasteText);
    if (parsed.length > 0) {
      const next = [...rows, ...parsed];
      setRows(next);
      notifyParent(next, enabled);
      setPasteText('');
      setShowPasteArea(false);
    }
  };

  const handleRowChange = (index: number, field: keyof ColorBreakdownRow, val: string) => {
    const next = rows.map((r, i) => {
      if (i !== index) return r;
      if (field === 'rolls') return { ...r, [field]: parseFloat(val) || 0 };
      if (field === 'priceOverride') return { ...r, [field]: val === '' ? '' : parseFloat(val) || 0 };
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
    const next = [...rows, { colorCode: '', rolls: 0, priceOverride: '' }];
    setRows(next);
    notifyParent(next, enabled);
  };

  return (
    <div className={`rounded-xl border transition-all duration-300 ${enabled ? 'bg-violet-50 border-violet-200' : 'bg-stone-50 border-dashed border-stone-200'}`}>
      {/* Toggle Header */}
      <div className="flex items-center justify-between p-4">
        <div className="flex items-center gap-2">
          <Palette className={`w-4 h-4 ${enabled ? 'text-violet-600' : 'text-stone-400'}`} />
          <span className={`text-[10px] font-black uppercase tracking-widest ${enabled ? 'text-violet-700' : 'text-stone-500'}`}>
            Commande Multi-Couleurs
          </span>
          {enabled && rows.length > 0 && (
            <span className="text-[9px] font-bold bg-violet-200 text-violet-800 px-2 py-0.5 rounded-full">
              {rows.length} couleurs · {total.toLocaleString()} {unit || 'rolls'}
            </span>
          )}
        </div>
        <Switch
          checked={enabled}
          onCheckedChange={handleToggle}
        />
      </div>

      {!enabled && (
        <p className="text-[9px] font-bold text-stone-400 uppercase text-center pb-3 italic px-4">
          Activer pour saisir les couleurs et quantités par {unit || 'unité'}
        </p>
      )}

      {enabled && (
        <div className="px-4 pb-4 space-y-3">
          {/* Paste area toggle */}
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => setShowPasteArea(v => !v)}
            className="h-8 text-[9px] font-black uppercase tracking-widest border-violet-200 text-violet-600 hover:bg-violet-100 rounded-lg gap-1.5 w-full"
          >
            <ClipboardPaste className="w-3.5 h-3.5" />
            {showPasteArea ? 'Masquer la zone de collage' : 'Coller un tableau (Excel / Texte)'}
          </Button>

          {showPasteArea && (
            <div className="space-y-2 animate-in fade-in slide-in-from-top-1 duration-200">
              <Label className="text-[9px] font-black text-violet-500 uppercase tracking-widest">
                Coller ici (format : N°Couleur[TAB]Quantité[TAB]Prix optionnel)
              </Label>
              <textarea
                className="w-full h-28 text-[11px] font-mono border border-violet-200 rounded-lg p-3 resize-none focus:outline-none focus:ring-2 focus:ring-violet-400 bg-white placeholder:text-stone-300"
                placeholder={"312\t50\n458\t30\nBLACK\t20\t1.60\n..."}
                value={pasteText}
                onChange={e => setPasteText(e.target.value)}
                onPaste={e => {
                  // Auto-parse on paste
                  setTimeout(() => {
                    const text = e.currentTarget.value + e.clipboardData.getData('text');
                    const parsed = parsePastedTable(text);
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
                  className="flex-1 h-8 bg-violet-600 hover:bg-violet-700 text-white text-[9px] font-black uppercase tracking-widest rounded-lg"
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
            <div className="rounded-xl overflow-hidden border border-violet-100 bg-white">
              {/* Header */}
              <div className="grid grid-cols-[1fr_90px_90px_36px] gap-0 bg-violet-100/60">
                <div className="py-2 px-3 text-[9px] font-black uppercase text-violet-600 tracking-widest flex items-center gap-1">
                  <Hash className="w-2.5 h-2.5" /> N° Couleur
                </div>
                <div className="py-2 px-1 text-[9px] font-black uppercase text-violet-600 tracking-widest text-right">
                  Prix Opt ($)
                </div>
                <div className="py-2 px-3 text-[9px] font-black uppercase text-violet-600 tracking-widest text-right flex items-center justify-end gap-1">
                  <Package className="w-2.5 h-2.5" /> {unit || 'Qté'}
                </div>
                <div />
              </div>

              {/* Rows */}
              <div className="divide-y divide-violet-50">
                {rows.map((row, i) => (
                  <div key={i} className="grid grid-cols-[1fr_90px_90px_36px] gap-0 items-center hover:bg-violet-50/30 transition-colors">
                    <div className="px-2 py-1">
                      <Input
                        value={row.colorCode}
                        onChange={e => handleRowChange(i, 'colorCode', e.target.value)}
                        className="h-8 border-0 bg-transparent font-black text-[11px] text-stone-800 uppercase focus-visible:ring-0 focus-visible:ring-offset-0 px-1"
                        placeholder="Couleur..."
                      />
                    </div>
                    <div className="px-2 py-1">
                      <Input
                        type="number"
                        step="0.01"
                        min={0}
                        value={row.priceOverride === '' ? '' : row.priceOverride}
                        onChange={e => handleRowChange(i, 'priceOverride', e.target.value)}
                        className="h-8 border border-transparent hover:border-violet-200 focus:border-violet-400 bg-transparent font-bold text-[10px] text-violet-700 text-right focus-visible:ring-0 focus-visible:ring-offset-0 px-2 rounded placeholder:text-violet-200 transition-colors"
                        placeholder="Normal"
                        title="Prix spécifique si différent du prix global"
                      />
                    </div>
                    <div className="px-2 py-1">
                      <Input
                        type="number"
                        min={0}
                        value={row.rolls === 0 ? '' : row.rolls}
                        onChange={e => handleRowChange(i, 'rolls', e.target.value)}
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

              {/* Total footer */}
              <div className="grid grid-cols-[1fr_90px_90px_36px] bg-violet-600 text-white">
                <div className="py-2.5 px-3 text-[9px] font-black uppercase tracking-widest col-span-2">
                  TOTAL
                </div>
                <div className="py-2.5 px-3 text-right text-[11px] font-black">
                  {total.toLocaleString('en-US')} {unit || 'rolls'}
                </div>
                <div />
              </div>
            </div>
          )}

          {/* Add row button */}
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={handleAddRow}
            className="h-8 text-[9px] font-black uppercase tracking-widest border-violet-200 text-violet-600 hover:bg-violet-100 rounded-lg gap-1.5"
          >
            <Plus className="w-3 h-3" /> Ajouter une couleur
          </Button>

          {rows.length > 0 && (
            <p className="text-[9px] font-bold text-violet-600 uppercase bg-violet-100 px-3 py-2 rounded-lg">
              ✓ Quantité totale calculée : <span className="font-black">{total.toLocaleString('en-US')} {unit || 'rolls'}</span> — sera enregistrée dans le champ Quantité
            </p>
          )}
        </div>
      )}
    </div>
  );
}
