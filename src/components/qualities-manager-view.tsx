"use client";

import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Plus, Trash2, Sparkles, Loader2, ImagePlus, FolderSearch } from 'lucide-react';
import { useUser, useFirestore } from '@/firebase';
import { doc, updateDoc } from 'firebase/firestore';
import { getStorage, ref as storageRef, uploadBytesResumable, getDownloadURL } from 'firebase/storage';
import { getApp } from 'firebase/app';
import { useToast } from '@/hooks/use-toast';
import { GeneralCategory, Category } from '@/lib/types';
import { QUALITY_SCHEMA, QUALITIES_FIELD_BY_SPEC, SPEC_BADGES, detectSpecType } from '@/lib/quality-schema';

interface QualitiesManagerViewProps {
  generalCategories: GeneralCategory[];
  subCategories: Category[];
  initialSpecType?: string | null;
  highlightPoleId?: string | null;
}

const SPEC_TYPES = ['fabric', 'zipper', 'thread', 'slider', 'tape', 'accessory'];

export default function QualitiesManagerView({ generalCategories = [], subCategories = [], initialSpecType, highlightPoleId }: QualitiesManagerViewProps) {
  const { user } = useUser();
  const firestore = useFirestore();
  const { toast } = useToast();

  // Compte, par type, le nombre de FAMILLES éditables (l'unité réelle de qualités),
  // rattachées à un pôle dont le type (explicite ou déduit via ligne/nom) correspond.
  const countByType = useMemo(() => {
    const counts: Record<string, number> = {};
    SPEC_TYPES.forEach(t => {
      const poleIds = new Set(generalCategories.filter(gc => detectSpecType(gc) === t).map(gc => gc.id));
      counts[t] = subCategories.filter(sc => poleIds.has(sc.generalCategoryId as any)).length;
    });
    return counts;
  }, [generalCategories, subCategories]);

  const [activeSpecType, setActiveSpecType] = useState<string>(() => {
    if (initialSpecType && SPEC_TYPES.includes(initialSpecType)) return initialSpecType;
    const firstWithData = SPEC_TYPES.find(t => generalCategories.some(gc => detectSpecType(gc) === t));
    return firstWithData || 'fabric';
  });

  useEffect(() => {
    if (initialSpecType && SPEC_TYPES.includes(initialSpecType)) setActiveSpecType(initialSpecType);
  }, [initialSpecType, highlightPoleId]);

  // Les données Firestore arrivent souvent APRÈS le premier rendu (chargement async) : si
  // aucune navigation explicite n'a été demandée et que l'onglet actif se retrouve vide alors
  // qu'un autre onglet contient des pôles, on bascule automatiquement dessus (une seule fois).
  const autoSelectedRef = useRef(false);
  useEffect(() => {
    if (initialSpecType || autoSelectedRef.current || generalCategories.length === 0) return;
    const hasCurrent = generalCategories.some(gc => detectSpecType(gc) === activeSpecType);
    if (!hasCurrent) {
      const firstWithData = SPEC_TYPES.find(t => generalCategories.some(gc => detectSpecType(gc) === t));
      if (firstWithData) setActiveSpecType(firstWithData);
    }
    autoSelectedRef.current = true;
  }, [generalCategories, initialSpecType, activeSpecType]);

  const [edits, setEdits] = useState<Record<string, any[]>>({});
  const [savingFamilyId, setSavingFamilyId] = useState<string | null>(null);
  const [uploadingCell, setUploadingCell] = useState<string | null>(null);
  const [highlightedPoleId, setHighlightedPoleId] = useState<string | null>(null);
  const poleRefs = useRef<Record<string, HTMLDivElement | null>>({});

  useEffect(() => {
    if (!highlightPoleId) return;
    const el = poleRefs.current[highlightPoleId];
    if (el) el.scrollIntoView({ behavior: 'smooth', block: 'center' });
    setHighlightedPoleId(highlightPoleId);
    const t = setTimeout(() => setHighlightedPoleId(null), 2500);
    return () => clearTimeout(t);
  }, [highlightPoleId]);

  const fieldsKey = QUALITIES_FIELD_BY_SPEC[activeSpecType];
  const schemaFields = QUALITY_SCHEMA[activeSpecType] || [];

  const polesForActiveType = useMemo(() => (
    generalCategories.filter(gc => detectSpecType(gc) === activeSpecType)
  ), [generalCategories, activeSpecType]);

  const familiesByPole = useMemo(() => {
    const map: Record<string, Category[]> = {};
    polesForActiveType.forEach(gc => {
      map[gc.id] = subCategories.filter(sc => sc.generalCategoryId === gc.id);
    });
    return map;
  }, [polesForActiveType, subCategories]);

  const getRows = (fam: Category): any[] => {
    if (edits[fam.id]) return edits[fam.id];
    const arr = (fam as any)[fieldsKey];
    return Array.isArray(arr) ? arr : [];
  };

  const ensureDraft = (fam: Category): any[] => {
    if (edits[fam.id]) return edits[fam.id];
    const rows = getRows(fam).map(r => ({ ...r }));
    setEdits(prev => ({ ...prev, [fam.id]: rows }));
    return rows;
  };

  const handleFieldChange = (fam: Category, rowIndex: number, key: string, value: string, uppercase?: boolean) => {
    const draft = ensureDraft(fam);
    const nextVal = uppercase ? value.toUpperCase() : value;
    const nextRows = draft.map((r, i) => i === rowIndex ? { ...r, [key]: nextVal } : r);
    setEdits(prev => ({ ...prev, [fam.id]: nextRows }));
  };

  const handleAddRow = (fam: Category) => {
    const draft = ensureDraft(fam);
    const blank: Record<string, any> = { label: '', nameFR: '' };
    schemaFields.forEach(f => { blank[f.key] = ''; });
    setEdits(prev => ({ ...prev, [fam.id]: [...draft, blank] }));
  };

  const handleRemoveRow = (fam: Category, rowIndex: number) => {
    const draft = ensureDraft(fam);
    setEdits(prev => ({ ...prev, [fam.id]: draft.filter((_, i) => i !== rowIndex) }));
  };

  const handleImageUpload = async (fam: Category, rowIndex: number, file: File) => {
    if (!user) return;
    const cellKey = `${fam.id}:${rowIndex}`;
    setUploadingCell(cellKey);
    try {
      const storage = getStorage(getApp());
      const path = `users/${user.uid}/categories/${fam.id}/designs/slider_${Date.now()}_${file.name.replace(/[^a-zA-Z0-9.-]/g, '_')}`;
      const imgRef = storageRef(storage, path);
      const task = uploadBytesResumable(imgRef, file);
      await new Promise<void>((resolve, reject) => {
        task.on('state_changed', null, reject, async () => {
          try {
            const url = await getDownloadURL(task.snapshot.ref);
            handleFieldChange(fam, rowIndex, 'imageUrl', url);
            resolve();
          } catch (err) { reject(err); }
        });
      });
      toast({ title: '✅ Photo téléchargée' });
    } catch (err: any) {
      toast({ variant: 'destructive', title: 'Erreur upload', description: err?.message });
    } finally {
      setUploadingCell(null);
    }
  };

  const handleSave = async (fam: Category, gc: GeneralCategory) => {
    if (!user || !firestore) return;
    const rows = getRows(fam);
    const cleanRows = rows
      .filter(r => Object.entries(r).some(([k, v]) => k !== undefined && v !== undefined && v !== null && String(v).trim() !== ''))
      .map(r => {
        const cleaned: Record<string, any> = {};
        Object.entries(r).forEach(([k, v]) => {
          if (v === undefined || v === null || v === '') return;
          const fieldDef = schemaFields.find(f => f.key === k);
          cleaned[k] = fieldDef?.type === 'number' ? Number(v) : v;
        });
        return cleaned;
      });

    setSavingFamilyId(fam.id);
    try {
      const famRef = doc(firestore, 'users', user.uid, 'categories', fam.id);
      await updateDoc(famRef, { [fieldsKey]: cleanRows });
      // Fige le specType détecté (ligne/nom) sur le pôle parent si jamais choisi explicitement,
      // pour que les lectures futures (badges Groupes, cet onglet) n'aient plus besoin de deviner.
      if (!(gc as any).specType || (gc as any).specType === 'none') {
        updateDoc(doc(firestore, 'users', user.uid, 'generalCategories', gc.id), { specType: activeSpecType }).catch(() => {});
      }
      toast({ title: '✅ Qualités enregistrées', description: `Famille ${fam.name}` });
      setEdits(prev => { const n = { ...prev }; delete n[fam.id]; return n; });
    } catch (err: any) {
      toast({ variant: 'destructive', title: 'Erreur', description: err?.message });
    } finally {
      setSavingFamilyId(null);
    }
  };

  return (
    <div className="space-y-8 fade-in">
      {/* Header */}
      <div className="bg-stone-900 rounded-[2rem] p-8 shadow-2xl relative overflow-hidden">
        <div className="absolute top-0 right-0 w-[500px] h-[500px] bg-fuchsia-500/8 rounded-full -translate-y-1/2 translate-x-1/2 blur-[120px] pointer-events-none" />
        <div className="relative z-10">
          <p className="text-[10px] font-black text-fuchsia-400 uppercase tracking-[0.25em] mb-2 flex items-center gap-2">
            <Sparkles className="w-3.5 h-3.5" /> Catalogue Qualités
          </p>
          <h1 className="text-3xl font-black text-white uppercase tracking-tighter leading-none">
            Qualités <span className="text-fuchsia-400">Fixes</span>
          </h1>
          <p className="text-stone-400 text-xs font-medium mt-3 max-w-md">
            Gère les variantes de spécification (GSM, curseur, taille...) au niveau de chaque famille, regroupées par pôle.
          </p>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex flex-wrap gap-2">
        {SPEC_TYPES.map(type => {
          const badge = SPEC_BADGES[type];
          const active = activeSpecType === type;
          return (
            <button
              key={type}
              type="button"
              onClick={() => setActiveSpecType(type)}
              className={`px-4 py-2.5 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all flex items-center gap-1.5 ${
                active ? 'bg-stone-900 text-white shadow-lg' : 'bg-white text-stone-500 border border-stone-200 hover:border-stone-300'
              }`}
            >
              <span>{badge.emoji}</span> {badge.label.replace('Spé ', '')}
              <span className={`px-1.5 py-0.5 rounded-full text-[8px] ${active ? 'bg-white/15 text-white' : 'bg-stone-100 text-stone-500'}`}>
                {countByType[type]}
              </span>
            </button>
          );
        })}
      </div>

      {/* Body */}
      <div className="space-y-8">
        {polesForActiveType.length === 0 ? (
          <div className="py-24 text-center border-2 border-dashed border-stone-100 rounded-[2rem] bg-white/50">
            <FolderSearch className="w-12 h-12 text-stone-200 mx-auto mb-4" />
            <p className="text-stone-300 font-black uppercase tracking-[0.2em] text-[9px]">
              Aucun pôle n'utilise ce modèle de spécification
            </p>
            <p className="text-stone-200 text-xs mt-2">
              Va dans Groupes → Modifier le Pôle pour l'assigner à un pôle.
            </p>
          </div>
        ) : (
          polesForActiveType.map(gc => {
            const families = familiesByPole[gc.id] || [];
            const isPoleHighlighted = highlightedPoleId === gc.id;

            return (
              <div
                key={gc.id}
                ref={(el: any) => { poleRefs.current[gc.id] = el; }}
                className={`rounded-[1.75rem] border-2 p-5 space-y-4 transition-all ${
                  isPoleHighlighted ? 'border-fuchsia-300 ring-2 ring-fuchsia-200 bg-fuchsia-50/20' : 'border-stone-100 bg-stone-50/40'
                }`}
              >
                <div className="flex items-baseline gap-2 px-1">
                  <span className="text-[9px] font-black uppercase tracking-[0.2em] text-stone-400">Pôle</span>
                  <h2 className="text-base font-black text-stone-900 uppercase tracking-tight">{gc.name}</h2>
                  {gc.nameFR && (
                    <span className="text-[10px] font-bold text-stone-400">({gc.nameFR})</span>
                  )}
                  <span className="text-[9px] font-bold text-stone-300 uppercase tracking-widest ml-auto">
                    {families.length} famille{families.length !== 1 ? 's' : ''}
                  </span>
                </div>

                {families.length === 0 ? (
                  <div className="py-10 text-center border-2 border-dashed border-stone-200 rounded-2xl bg-white/60">
                    <p className="text-stone-300 font-black uppercase tracking-[0.15em] text-[9px]">
                      Aucune famille dans ce pôle
                    </p>
                    <p className="text-stone-300 text-[10px] mt-1">
                      Crée une famille depuis Groupes → {gc.name}.
                    </p>
                  </div>
                ) : (
                  <div className="space-y-4">
                    {families.map(fam => {
                      const rows = getRows(fam);
                      const isDirty = !!edits[fam.id];
                      const isSaving = savingFamilyId === fam.id;

                      return (
                        <Card
                          key={fam.id}
                          className="border-none shadow-md rounded-[1.5rem] overflow-hidden bg-white"
                        >
                          <CardContent className="p-0">
                            <div className="flex items-center justify-between p-4 border-b border-stone-100 bg-stone-50/50">
                              <div>
                                <h3 className="text-sm font-black text-stone-900 uppercase tracking-tight">{fam.name}</h3>
                                {fam.nameFR && (
                                  <p className="text-[9px] font-bold text-stone-400 uppercase tracking-wider">FR (Stock) : {fam.nameFR}</p>
                                )}
                              </div>
                              <div className="flex items-center gap-2">
                                {isDirty && (
                                  <span className="text-[8px] font-black uppercase text-amber-600 bg-amber-100 px-2 py-0.5 rounded-full">
                                    Non enregistré
                                  </span>
                                )}
                                <Button
                                  size="sm"
                                  disabled={!isDirty || isSaving}
                                  onClick={() => handleSave(fam, gc)}
                                  className="h-8 bg-stone-900 hover:bg-stone-800 text-white text-[9px] font-black uppercase tracking-widest rounded-xl disabled:opacity-40"
                                >
                                  {isSaving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : 'Enregistrer'}
                                </Button>
                              </div>
                            </div>

                            <div className="overflow-x-auto">
                              <table className="w-full text-left">
                                <thead>
                                  <tr className="bg-stone-50/60">
                                    <th className="text-[8px] font-black uppercase text-stone-400 tracking-widest py-2 px-3">Libellé</th>
                                    <th className="text-[8px] font-black uppercase text-stone-400 tracking-widest py-2 px-3">Nom FR</th>
                                    {schemaFields.map(f => (
                                      <th key={f.key} className="text-[8px] font-black uppercase text-stone-400 tracking-widest py-2 px-3">{f.label}</th>
                                    ))}
                                    <th className="w-10"></th>
                                  </tr>
                                </thead>
                                <tbody>
                                  {rows.length === 0 ? (
                                    <tr>
                                      <td colSpan={schemaFields.length + 3} className="text-center py-8 text-stone-300 font-bold uppercase text-[9px] tracking-widest">
                                        Aucune qualité — ajoute la première ligne ci-dessous
                                      </td>
                                    </tr>
                                  ) : rows.map((row, idx) => {
                                    const cellKey = `${fam.id}:${idx}`;
                                    return (
                                      <tr key={idx} className="border-t border-stone-50 hover:bg-stone-50/30">
                                        <td className="p-2">
                                          <Input
                                            value={row.label ?? ''}
                                            onChange={e => handleFieldChange(fam, idx, 'label', e.target.value, true)}
                                            className="h-8 text-[10px] font-bold uppercase rounded-lg border-stone-200"
                                          />
                                        </td>
                                        <td className="p-2">
                                          <Input
                                            value={row.nameFR ?? ''}
                                            onChange={e => handleFieldChange(fam, idx, 'nameFR', e.target.value, true)}
                                            className="h-8 text-[10px] font-bold uppercase rounded-lg border-amber-200 bg-amber-50/30"
                                          />
                                        </td>
                                        {schemaFields.map(f => (
                                          <td key={f.key} className="p-2">
                                            {f.type === 'image' ? (
                                              <div className="flex items-center gap-2">
                                                {row.imageUrl && (
                                                  <img src={row.imageUrl} alt="" className="w-8 h-8 object-cover rounded-lg border border-stone-200" />
                                                )}
                                                <label className="cursor-pointer">
                                                  <input
                                                    type="file"
                                                    accept="image/*"
                                                    className="hidden"
                                                    disabled={uploadingCell === cellKey}
                                                    onChange={e => {
                                                      const file = e.target.files?.[0];
                                                      if (file) handleImageUpload(fam, idx, file);
                                                    }}
                                                  />
                                                  <span className="h-8 w-8 flex items-center justify-center rounded-lg border border-dashed border-stone-300 text-stone-400 hover:text-fuchsia-600 hover:border-fuchsia-300">
                                                    {uploadingCell === cellKey ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <ImagePlus className="w-3.5 h-3.5" />}
                                                  </span>
                                                </label>
                                              </div>
                                            ) : (
                                              <Input
                                                type={f.type === 'number' ? 'number' : 'text'}
                                                placeholder={f.placeholder}
                                                value={row[f.key] ?? ''}
                                                onChange={e => handleFieldChange(fam, idx, f.key, e.target.value, f.uppercase)}
                                                className="h-8 text-[10px] font-bold rounded-lg border-stone-200"
                                              />
                                            )}
                                          </td>
                                        ))}
                                        <td className="p-2 text-right">
                                          <Button
                                            variant="ghost"
                                            size="icon"
                                            onClick={() => handleRemoveRow(fam, idx)}
                                            className="h-7 w-7 text-stone-300 hover:text-red-500 hover:bg-red-50 rounded-lg"
                                          >
                                            <Trash2 className="w-3.5 h-3.5" />
                                          </Button>
                                        </td>
                                      </tr>
                                    );
                                  })}
                                </tbody>
                              </table>
                            </div>

                            <div className="p-3 border-t border-stone-50">
                              <Button
                                variant="outline"
                                size="sm"
                                onClick={() => handleAddRow(fam)}
                                className="h-8 text-[9px] font-black uppercase tracking-widest border-dashed border-stone-300 text-stone-500 hover:bg-stone-50 rounded-xl gap-1.5"
                              >
                                <Plus className="w-3.5 h-3.5" /> Ajouter une qualité
                              </Button>
                            </div>
                          </CardContent>
                        </Card>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
