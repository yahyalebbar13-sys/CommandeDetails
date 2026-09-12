"use client";

import React, { useState, useCallback, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Sparkles, Plus, Trash2, ClipboardPaste } from 'lucide-react';
import { QualityBreakdownRow } from '@/lib/types';

export type { QualityBreakdownRow };

interface QualityBreakdownInputProps {
  value: QualityBreakdownRow[] | null;
  onChange: (rows: QualityBreakdownRow[] | null, total: number) => void;
  unit?: string;
  availableQualities?: any[];
  isFabric?: boolean;
  isZipper?: boolean;
  isThread?: boolean;
  isSlider?: boolean;
  isTape?: boolean;
}

/**
 * Parse a pasted table string into quality breakdown rows.
 * Supports TSV (Excel copy), semicolons, or multiple spaces.
 * Format: "Quality[SEP]Quantity[optional SEP]Price"
 */
function parsePastedQualities(raw: string, availableQualities?: any[]): QualityBreakdownRow[] {
  const lines = raw.split(/\r?\n/).filter(l => l.trim() !== '');
  const rows: QualityBreakdownRow[] = [];

  for (const line of lines) {
    const parts = line.trim().split(/\t|;|\s{2,}/);
    if (parts.length < 2) continue;

    const qualityLabel = parts[0].trim();
    let quantity = 0;
    let priceOverride: number | undefined = undefined;

    if (parts.length >= 3) {
      quantity = parseFloat(parts[1].replace(',', '.'));
      const priceVal = parseFloat(parts[parts.length - 1].replace(',', '.'));
      if (!isNaN(priceVal) && priceVal > 0) priceOverride = priceVal;
    } else {
      quantity = parseFloat(parts[parts.length - 1].replace(',', '.'));
    }

    if (!qualityLabel || isNaN(quantity) || quantity <= 0) continue;

    // Try to match with available qualities to populate technical attributes
    const matched = (availableQualities || []).find(
      q => q.label?.toLowerCase() === qualityLabel.toLowerCase()
    );

    const row: QualityBreakdownRow = {
      quality: matched?.label || qualityLabel,
      ...(matched?.nameFR ? { nameFR: matched.nameFR } : {}),
      quantity,
      priceOverride: priceOverride || '',
      ...(matched?.imageUrl ? { imageUrl: matched.imageUrl } : {}),
      ...(matched?.gsm ? { gsm: matched.gsm } : {}),
      ...(matched?.fabricWidth ? { fabricWidth: matched.fabricWidth } : {}),
      ...(matched?.rollLength ? { rollLength: matched.rollLength, rollLengthUnit: matched.rollLengthUnit || 'm' } : {}),
      ...(matched?.packagingPerBag ? { packagingPerBag: matched.packagingPerBag } : {}),
      ...(matched?.size ? { size: matched.size } : matched?.length ? { size: matched.length } : matched?.width ? { size: matched.width } : {}),
      ...(matched?.zipperType ? { zipperType: matched.zipperType } : {}),
      ...(matched?.slider ? { slider: matched.slider } : {}),
      ...(matched?.sliderType ? { sliderType: matched.sliderType } : {}),
      ...(matched?.tapeWeightGsm ? { tapeWeightGsm: matched.tapeWeightGsm } : matched?.weightPerM ? { tapeWeightGsm: Number(matched.weightPerM) || undefined } : {}),
      ...(matched?.sliderWeightG ? { sliderWeightG: matched.sliderWeightG } : {}),
      ...(matched?.pcsPerBag ? { pcsPerBag: matched.pcsPerBag } : matched?.rollsPerShrink ? { pcsPerBag: Number(matched.rollsPerShrink) || undefined } : {}),
      ...(matched?.bagsPerCarton ? { bagsPerCarton: matched.bagsPerCarton } : matched?.rollsPerCarton ? { bagsPerCarton: Number(matched.rollsPerCarton) || undefined } : {}),
      ...(matched?.coneWeightG ? { coneWeightG: matched.coneWeightG } : {}),
      ...(matched?.threadWeightG ? { threadWeightG: matched.threadWeightG } : {}),
      ...(matched?.lengthPerPiece ? { lengthPerPiece: matched.lengthPerPiece, lengthUnit: matched.lengthUnit || 'm' } : {}),
      ...(matched?.width ? { width: matched.width } : {}),
      ...(matched?.weightPerM ? { weightPerM: matched.weightPerM } : {}),
      ...(matched?.rollsPerShrink ? { rollsPerShrink: matched.rollsPerShrink } : {}),
      ...(matched?.rollsPerCarton ? { rollsPerCarton: matched.rollsPerCarton } : {}),
    };

    rows.push(row);
  }

  return rows;
}

export default function QualityBreakdownInput({
  value,
  onChange,
  unit,
  availableQualities = [],
  isFabric,
  isZipper,
  isThread,
  isSlider,
  isTape,
}: QualityBreakdownInputProps) {
  const [enabled, setEnabled] = useState<boolean>(!!value && value.length > 0);
  const [rows, setRows] = useState<QualityBreakdownRow[]>(value || []);
  const [pasteText, setPasteText] = useState('');
  const [showPasteArea, setShowPasteArea] = useState(false);
  const [rawInputs, setRawInputs] = useState<Record<number, string>>({});

  useEffect(() => {
    if (value && value.length > 0) {
      setEnabled(true);
      setRows(value);
    } else if (!value || value.length === 0) {
      setEnabled(false);
      setRows([]);
    }
  }, [value]);

  const total = rows.reduce((sum, r) => sum + (Number(r.quantity) || 0), 0);

  const notifyParent = useCallback((updatedRows: QualityBreakdownRow[], isEnabled: boolean) => {
    if (!isEnabled || updatedRows.length === 0) {
      onChange(null, 0);
    } else {
      const sum = updatedRows.reduce((s, r) => s + (Number(r.quantity) || 0), 0);
      onChange(updatedRows, sum);
    }
  }, [onChange]);

  const handleToggle = (checked: boolean) => {
    setEnabled(checked);
    if (!checked) {
      setRows([]);
      setRawInputs({});
      onChange(null, 0);
    } else if (rows.length === 0) {
      // Initialize with 1 first row
      const initialQuality = availableQualities[0];
      const initialRow: QualityBreakdownRow = initialQuality ? {
        quality: initialQuality.label,
        quantity: 0,
        priceOverride: '',
        ...(initialQuality.imageUrl ? { imageUrl: initialQuality.imageUrl } : {}),
        ...(initialQuality.gsm ? { gsm: initialQuality.gsm } : {}),
        ...(initialQuality.fabricWidth ? { fabricWidth: initialQuality.fabricWidth } : {}),
        ...(initialQuality.rollLength ? { rollLength: initialQuality.rollLength, rollLengthUnit: initialQuality.rollLengthUnit || 'm' } : {}),
        ...(initialQuality.packagingPerBag ? { packagingPerBag: initialQuality.packagingPerBag } : {}),
        ...(initialQuality.size ? { size: initialQuality.size } : initialQuality.length ? { size: initialQuality.length } : initialQuality.width ? { size: initialQuality.width } : {}),
        ...(initialQuality.zipperType ? { zipperType: initialQuality.zipperType } : {}),
        ...(initialQuality.slider ? { slider: initialQuality.slider } : {}),
        ...(initialQuality.sliderType ? { sliderType: initialQuality.sliderType } : {}),
        ...(initialQuality.tapeWeightGsm ? { tapeWeightGsm: initialQuality.tapeWeightGsm } : initialQuality.weightPerM ? { tapeWeightGsm: Number(initialQuality.weightPerM) || undefined } : {}),
        ...(initialQuality.sliderWeightG ? { sliderWeightG: initialQuality.sliderWeightG } : {}),
        ...(initialQuality.pcsPerBag ? { pcsPerBag: initialQuality.pcsPerBag } : initialQuality.rollsPerShrink ? { pcsPerBag: Number(initialQuality.rollsPerShrink) || undefined } : {}),
        ...(initialQuality.bagsPerCarton ? { bagsPerCarton: initialQuality.bagsPerCarton } : initialQuality.rollsPerCarton ? { bagsPerCarton: Number(initialQuality.rollsPerCarton) || undefined } : {}),
        ...(initialQuality.width ? { width: initialQuality.width } : {}),
        ...(initialQuality.weightPerM ? { weightPerM: initialQuality.weightPerM } : {}),
        ...(initialQuality.rollsPerShrink ? { rollsPerShrink: initialQuality.rollsPerShrink } : {}),
        ...(initialQuality.rollsPerCarton ? { rollsPerCarton: initialQuality.rollsPerCarton } : {}),
      } : { quality: '', quantity: 0, priceOverride: '' };

      const next = [initialRow];
      setRows(next);
      notifyParent(next, true);
    }
  };

  const handleParse = () => {
    if (!pasteText.trim()) return;
    const parsed = parsePastedQualities(pasteText, availableQualities);
    if (parsed.length > 0) {
      const next = [...rows, ...parsed];
      setRows(next);
      notifyParent(next, enabled);
      setPasteText('');
      setShowPasteArea(false);
    }
  };

  const handleSelectQuality = (index: number, selectedLabel: string) => {
    const qObj = availableQualities.find(q => q.label === selectedLabel);
    const next = rows.map((r, i) => {
      if (i !== index) return r;
      if (!qObj) {
        return { ...r, quality: selectedLabel };
      }
      return {
        ...r,
        quality: qObj.label,
        imageUrl: qObj.imageUrl || undefined,
        // Fabric attributes
        gsm: qObj.gsm || undefined,
        fabricWidth: qObj.fabricWidth || undefined,
        rollLength: qObj.rollLength || undefined,
        rollLengthUnit: qObj.rollLengthUnit || 'm',
        packagingPerBag: qObj.packagingPerBag || undefined,
        // Zipper / Slider attributes
        size: qObj.size || qObj.length || qObj.width || undefined,
        zipperType: qObj.zipperType || undefined,
        slider: qObj.slider || undefined,
        sliderType: qObj.sliderType || undefined,
        tapeWeightGsm: qObj.tapeWeightGsm || (qObj.weightPerM ? Number(qObj.weightPerM) : undefined),
        sliderWeightG: qObj.sliderWeightG || undefined,
        pcsPerBag: qObj.pcsPerBag || (qObj.rollsPerShrink ? Number(qObj.rollsPerShrink) : undefined),
        bagsPerCarton: qObj.bagsPerCarton || (qObj.rollsPerCarton ? Number(qObj.rollsPerCarton) : undefined),
        // Thread attributes
        coneWeightG: qObj.coneWeightG || undefined,
        threadWeightG: qObj.threadWeightG || undefined,
        lengthPerPiece: qObj.lengthPerPiece || undefined,
        lengthUnit: qObj.lengthUnit || 'm',
        // Tape attributes
        width: qObj.width || undefined,
        weightPerM: qObj.weightPerM || undefined,
        rollsPerShrink: qObj.rollsPerShrink || undefined,
        rollsPerCarton: qObj.rollsPerCarton || undefined,
      };
    });
    setRows(next);
    notifyParent(next, enabled);
  };

  const handleQuantityChange = (index: number, val: string) => {
    const normalised = val.replace(',', '.');
    setRawInputs(prev => ({ ...prev, [index]: val }));
    const parsed = parseFloat(normalised);
    const next = rows.map((r, i) =>
      i !== index ? r : { ...r, quantity: isNaN(parsed) ? 0 : parsed }
    );
    setRows(next);
    notifyParent(next, enabled);
  };

  const handleQuantityBlur = (index: number) => {
    setRawInputs(prev => { const n = { ...prev }; delete n[index]; return n; });
  };

  const handlePriceOverrideChange = (index: number, val: string) => {
    const normalised = val.replace(',', '.');
    const parsed = parseFloat(normalised);
    const next = rows.map((r, i) => {
      if (i !== index) return r;
      return { ...r, priceOverride: val === '' ? '' : (isNaN(parsed) ? r.priceOverride : normalised) };
    });
    setRows(next);
    notifyParent(next, enabled);
  };

  const handleDeleteRow = (index: number) => {
    setRawInputs(prev => { const n = { ...prev }; delete n[index]; return n; });
    const next = rows.filter((_, i) => i !== index);
    setRows(next);
    notifyParent(next, enabled);
  };

  const handleAddRow = () => {
    // Try to pick next available quality or empty
    const usedLabels = new Set(rows.map(r => r.quality));
    const nextUnused = availableQualities.find(q => !usedLabels.has(q.label)) || availableQualities[0];

    const newRow: QualityBreakdownRow = nextUnused ? {
      quality: nextUnused.label,
      ...(nextUnused.nameFR ? { nameFR: nextUnused.nameFR } : {}),
      quantity: 0,
      priceOverride: '',
      ...(nextUnused.gsm ? { gsm: nextUnused.gsm } : {}),
      ...(nextUnused.fabricWidth ? { fabricWidth: nextUnused.fabricWidth } : {}),
      ...(nextUnused.rollLength ? { rollLength: nextUnused.rollLength, rollLengthUnit: nextUnused.rollLengthUnit || 'm' } : {}),
      ...(nextUnused.packagingPerBag ? { packagingPerBag: nextUnused.packagingPerBag } : {}),
      ...(nextUnused.length ? { size: nextUnused.length } : nextUnused.width ? { size: nextUnused.width } : {}),
      ...(nextUnused.zipperType ? { zipperType: nextUnused.zipperType } : {}),
      ...(nextUnused.slider ? { slider: nextUnused.slider } : {}),
      ...(nextUnused.sliderType ? { sliderType: nextUnused.sliderType } : {}),
      ...(nextUnused.tapeWeightGsm ? { tapeWeightGsm: nextUnused.tapeWeightGsm } : nextUnused.weightPerM ? { tapeWeightGsm: Number(nextUnused.weightPerM) || undefined } : {}),
      ...(nextUnused.sliderWeightG ? { sliderWeightG: nextUnused.sliderWeightG } : {}),
      ...(nextUnused.pcsPerBag ? { pcsPerBag: nextUnused.pcsPerBag } : nextUnused.rollsPerShrink ? { pcsPerBag: Number(nextUnused.rollsPerShrink) || undefined } : {}),
      ...(nextUnused.bagsPerCarton ? { bagsPerCarton: nextUnused.bagsPerCarton } : nextUnused.rollsPerCarton ? { bagsPerCarton: Number(nextUnused.rollsPerCarton) || undefined } : {}),
      ...(nextUnused.coneWeightG ? { coneWeightG: nextUnused.coneWeightG } : {}),
      ...(nextUnused.threadWeightG ? { threadWeightG: nextUnused.threadWeightG } : {}),
      ...(nextUnused.lengthPerPiece ? { lengthPerPiece: nextUnused.lengthPerPiece, lengthUnit: nextUnused.lengthUnit || 'm' } : {}),
      ...(nextUnused.width ? { width: nextUnused.width } : {}),
      ...(nextUnused.weightPerM ? { weightPerM: nextUnused.weightPerM } : {}),
      ...(nextUnused.rollsPerShrink ? { rollsPerShrink: nextUnused.rollsPerShrink } : {}),
      ...(nextUnused.rollsPerCarton ? { rollsPerCarton: nextUnused.rollsPerCarton } : {}),
    } : { quality: '', quantity: 0, priceOverride: '' };

    const next = [...rows, newRow];
    setRows(next);
    notifyParent(next, enabled);
  };

  return (
    <div className={`rounded-2xl border transition-all duration-300 ${enabled ? 'bg-fuchsia-50/50 border-fuchsia-200 shadow-sm' : 'bg-stone-50/50 border-dashed border-stone-200'}`}>
      {/* Toggle Header */}
      <div className="flex items-center justify-between p-4">
        <div className="flex items-center gap-2">
          <Sparkles className={`w-4 h-4 ${enabled ? 'text-fuchsia-600' : 'text-stone-400'}`} />
          <span className={`text-[10px] font-black uppercase tracking-widest ${enabled ? 'text-fuchsia-700' : 'text-stone-500'}`}>
            Commande Multi-Qualités
          </span>
          {enabled && rows.length > 0 && (
            <span className="text-[9px] font-bold bg-fuchsia-200/70 text-fuchsia-800 px-2 py-0.5 rounded-full">
              {rows.length} qualités · {total.toLocaleString()} {unit || 'unités'}
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
          Activer pour commander plusieurs qualités fixes dans une seule commande
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
            className="h-8 text-[9px] font-black uppercase tracking-widest border-fuchsia-200 text-fuchsia-600 hover:bg-fuchsia-100 rounded-xl gap-1.5 w-full bg-white"
          >
            <ClipboardPaste className="w-3.5 h-3.5" />
            {showPasteArea ? 'Masquer la zone de collage' : 'Coller un tableau (Excel / Texte)'}
          </Button>

          {showPasteArea && (
            <div className="space-y-2 animate-in fade-in slide-in-from-top-1 duration-200">
              <Label className="text-[9px] font-black text-fuchsia-600 uppercase tracking-widest">
                Format : Qualité [TAB] Quantité [TAB] Prix PA optionnel
              </Label>
              <textarea
                className="w-full h-24 text-[11px] font-mono border border-fuchsia-200 rounded-xl p-3 resize-none focus:outline-none focus:ring-2 focus:ring-fuchsia-400 bg-white placeholder:text-stone-300"
                placeholder={"225gsm · 160cm\t50\t1.60\n300gsm · 160cm\t30\t1.85\n..."}
                value={pasteText}
                onChange={e => setPasteText(e.target.value)}
              />
              <div className="flex gap-2">
                <Button
                  type="button"
                  size="sm"
                  onClick={handleParse}
                  className="flex-1 h-8 bg-fuchsia-600 hover:bg-fuchsia-700 text-white text-[9px] font-black uppercase tracking-widest rounded-xl"
                >
                  Analyser et Importer
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => { setPasteText(''); setShowPasteArea(false); }}
                  className="h-8 text-[9px] font-bold uppercase border-stone-200 rounded-xl"
                >
                  Annuler
                </Button>
              </div>
            </div>
          )}

          {/* Table */}
          {rows.length > 0 && (
            <div className="rounded-xl overflow-hidden border border-fuchsia-100 bg-white">
              <div className="grid grid-cols-[1fr_95px_85px_36px] gap-0 bg-fuchsia-100/60 text-fuchsia-900 px-3 py-2 text-[9px] font-black uppercase tracking-widest">
                <span>Qualité</span>
                <span className="text-center">Quantité</span>
                <span className="text-center">PA ($)</span>
                <span></span>
              </div>

              <div className="divide-y divide-fuchsia-50">
                {rows.map((row, index) => {
                  const hasMatchingPredef = availableQualities.some(q => q.label === row.quality);

                  return (
                    <div key={index} className="grid grid-cols-[1fr_95px_85px_36px] items-center gap-1.5 p-2 hover:bg-fuchsia-50/20">
                      {/* Qualité column */}
                      <div className="space-y-1">
                        <div className="flex items-center gap-1.5">
                          {row.imageUrl && (
                            <img
                              src={row.imageUrl}
                              alt={row.quality}
                              className="w-8 h-8 object-cover rounded-lg border border-stone-200 bg-stone-50 shrink-0"
                            />
                          )}
                          <div className="flex-1 min-w-0">
                            {availableQualities.length > 0 ? (
                              <div className="space-y-1">
                                <Select
                                  value={hasMatchingPredef ? row.quality : '__custom__'}
                                  onValueChange={v => {
                                    if (v === '__custom__') {
                                      handleSelectQuality(index, '');
                                    } else {
                                      handleSelectQuality(index, v);
                                    }
                                  }}
                                >
                                  <SelectTrigger className="h-8 text-[10px] font-bold border-fuchsia-200 rounded-lg bg-white">
                                    <SelectValue placeholder="Choisir une qualité..." />
                                  </SelectTrigger>
                                  <SelectContent>
                                    {availableQualities.map((q, qIdx) => (
                                      <SelectItem key={qIdx} value={q.label} className="font-bold text-[10px]">
                                        <div className="flex items-center gap-1.5">
                                          {q.imageUrl && <img src={q.imageUrl} alt="" className="w-4 h-4 object-cover rounded shrink-0" />}
                                          <span>{q.label}</span>
                                        </div>
                                      </SelectItem>
                                    ))}
                                    <SelectItem value="__custom__" className="font-bold text-[10px] text-stone-400 italic">
                                      Autre / Saisie libre...
                                    </SelectItem>
                                  </SelectContent>
                                </Select>
                                {!hasMatchingPredef && (
                                  <Input
                                    placeholder="Saisie libre de la qualité..."
                                    className="h-7 text-[10px] font-bold border-fuchsia-200 rounded-lg"
                                    value={row.quality}
                                    onChange={e => {
                                      const val = e.target.value;
                                      setRows(p => p.map((r, i) => i === index ? { ...r, quality: val } : r));
                                      notifyParent(rows.map((r, i) => i === index ? { ...r, quality: val } : r), enabled);
                                    }}
                                  />
                                )}
                              </div>
                            ) : (
                              <Input
                                placeholder="Ex: 225gsm · 160cm ou Qualité..."
                                className="h-8 text-[10px] font-bold border-fuchsia-200 rounded-lg"
                                value={row.quality}
                                onChange={e => {
                                  const val = e.target.value;
                                  setRows(p => p.map((r, i) => i === index ? { ...r, quality: val } : r));
                                  notifyParent(rows.map((r, i) => i === index ? { ...r, quality: val } : r), enabled);
                                }}
                              />
                            )}
                          </div>
                        </div>

                        {/* Badges attributs de la ligne */}
                        <div className="flex flex-wrap gap-1">
                          {row.gsm && <span className="px-1.5 py-0.2 rounded bg-violet-100 text-violet-700 text-[8px] font-black">{row.gsm}gsm</span>}
                          {row.fabricWidth && <span className="px-1.5 py-0.2 rounded bg-blue-100 text-blue-700 text-[8px] font-black">{row.fabricWidth}cm</span>}
                          {row.size && <span className="px-1.5 py-0.2 rounded bg-teal-100 text-teal-700 text-[8px] font-black">{row.size}</span>}
                          {row.zipperType && <span className="px-1.5 py-0.2 rounded bg-amber-100 text-amber-700 text-[8px] font-black">{row.zipperType}</span>}
                          {row.slider && <span className="px-1.5 py-0.2 rounded bg-stone-100 text-stone-700 text-[8px] font-black">{row.slider} {row.sliderType ? `(${row.sliderType})` : ''}</span>}
                          {row.tapeWeightGsm && <span className="px-1.5 py-0.2 rounded bg-emerald-100 text-emerald-700 text-[8px] font-black">{row.tapeWeightGsm}g/m</span>}
                          {row.sliderWeightG && <span className="px-1.5 py-0.2 rounded bg-orange-100 text-orange-700 text-[8px] font-black">{row.sliderWeightG}g/pc</span>}
                          {row.pcsPerBag && <span className="px-1.5 py-0.2 rounded bg-teal-100 text-teal-700 text-[8px] font-black">{row.pcsPerBag} pcs/bag</span>}
                          {row.bagsPerCarton && <span className="px-1.5 py-0.2 rounded bg-indigo-100 text-indigo-700 text-[8px] font-black">{row.bagsPerCarton} bags/ctn</span>}
                          {row.coneWeightG && <span className="px-1.5 py-0.2 rounded bg-teal-100 text-teal-700 text-[8px] font-black">Cône: {row.coneWeightG}g</span>}
                          {row.threadWeightG && <span className="px-1.5 py-0.2 rounded bg-emerald-100 text-emerald-700 text-[8px] font-black">Fil: {row.threadWeightG}g</span>}
                          {row.lengthPerPiece && <span className="px-1.5 py-0.2 rounded bg-blue-100 text-blue-700 text-[8px] font-black">{row.lengthPerPiece}{row.lengthUnit || 'm'}/pc</span>}
                          {row.weightPerM && <span className="px-1.5 py-0.2 rounded bg-indigo-100 text-indigo-700 text-[8px] font-black">{row.weightPerM}g/m</span>}
                          {row.rollsPerShrink && <span className="px-1.5 py-0.2 rounded bg-blue-100 text-blue-700 text-[8px] font-black">{row.rollsPerShrink} rlx/shrink</span>}
                          {row.rollsPerCarton && <span className="px-1.5 py-0.2 rounded bg-amber-100 text-amber-700 text-[8px] font-black">{row.rollsPerCarton} rlx/ctn</span>}
                        </div>
                      </div>

                      {/* Quantité column */}
                      <div>
                        <Input
                          type="text"
                          inputMode="decimal"
                          placeholder="0"
                          className="h-8 text-[11px] font-black text-center border-fuchsia-200 rounded-lg bg-white"
                          value={rawInputs[index] !== undefined ? rawInputs[index] : (row.quantity === 0 ? '' : row.quantity)}
                          onChange={e => handleQuantityChange(index, e.target.value)}
                          onBlur={() => handleQuantityBlur(index)}
                        />
                      </div>

                      {/* PA Override column */}
                      <div>
                        <Input
                          type="text"
                          inputMode="decimal"
                          placeholder="PA def"
                          className="h-8 text-[11px] font-bold text-center border-fuchsia-200 rounded-lg bg-white placeholder:text-stone-300"
                          value={row.priceOverride ?? ''}
                          onChange={e => handlePriceOverrideChange(index, e.target.value)}
                        />
                      </div>

                      {/* Delete action */}
                      <div className="flex justify-center">
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7 text-stone-300 hover:text-red-500 hover:bg-red-50 rounded-lg"
                          onClick={() => handleDeleteRow(index)}
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </Button>
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* Table Footer */}
              <div className="grid grid-cols-[1fr_95px_85px_36px] bg-fuchsia-50/70 border-t border-fuchsia-100 px-3 py-2 items-center text-[9px] font-black">
                <span className="text-fuchsia-800 uppercase tracking-widest">TOTAL</span>
                <span className="text-center text-fuchsia-900 text-[11px] font-black">
                  {total.toLocaleString()}
                </span>
                <span className="text-center text-stone-400 font-normal italic text-[8px]">{unit || ''}</span>
                <span></span>
              </div>
            </div>
          )}

          {/* Add Row button */}
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={handleAddRow}
            className="w-full h-8 text-[9px] font-black uppercase tracking-widest border-dashed border-fuchsia-300 text-fuchsia-600 hover:bg-fuchsia-100/60 rounded-xl gap-1.5"
          >
            <Plus className="w-3.5 h-3.5" /> Ajouter une qualité
          </Button>
        </div>
      )}
    </div>
  );
}
