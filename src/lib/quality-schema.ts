import {
  isFabricLineOrCategory, isZipperLineOrCategory, isThreadLineOrCategory,
  isSliderLineOrCategory, isTapeLineOrCategory, isAccessoryLineOrCategory,
} from '@/lib/constants';

export type QualityFieldType = 'text' | 'number' | 'image';

export interface QualityFieldDef {
  key: string;
  label: string;
  type: QualityFieldType;
  placeholder?: string;
  uppercase?: boolean;
}

export const QUALITY_SCHEMA: Record<string, QualityFieldDef[]> = {
  fabric: [
    { key: 'gsm', label: 'GSM', type: 'text', placeholder: 'Ex: 180 ou 25+7' },
    { key: 'fabricWidth', label: 'Largeur (cm)', type: 'number' },
    { key: 'rollLength', label: 'Long. rouleau', type: 'number' },
    { key: 'rollLengthUnit', label: 'Unité', type: 'text', placeholder: 'm, yds' },
    { key: 'packagingPerBag', label: 'Pcs/bag', type: 'number' },
  ],
  zipper: [
    { key: 'length', label: 'Longueur', type: 'text' },
    { key: 'zipperType', label: 'Type (C/E, O/E)', type: 'text' },
    { key: 'slider', label: 'Curseur', type: 'text' },
    { key: 'sliderType', label: 'Type curseur', type: 'text' },
    { key: 'tapeWeightGsm', label: 'Poids ruban (g/m)', type: 'number' },
    { key: 'sliderWeightG', label: 'Poids curseur (g)', type: 'number' },
    { key: 'pcsPerBag', label: 'Pcs/bag', type: 'number' },
    { key: 'bagsPerCarton', label: 'Bags/ctn', type: 'number' },
  ],
  thread: [
    { key: 'coneWeightG', label: 'Poids cône (g)', type: 'text' },
    { key: 'threadWeightG', label: 'Poids fil (g)', type: 'text' },
    { key: 'lengthPerPiece', label: 'Long./pièce', type: 'text' },
    { key: 'lengthUnit', label: 'Unité', type: 'text', placeholder: 'm, yds' },
    { key: 'pcsPerBag', label: 'Pcs/bag', type: 'number' },
    { key: 'bagsPerCarton', label: 'Bags/ctn', type: 'number' },
  ],
  slider: [
    { key: 'imageUrl', label: 'Photo', type: 'image' },
    { key: 'size', label: 'Taille', type: 'text', uppercase: true },
    { key: 'sliderWeightG', label: 'Poids curseur (g)', type: 'text' },
    { key: 'pcsPerBag', label: 'Pcs/bag', type: 'number' },
    { key: 'bagsPerCarton', label: 'Bags/ctn', type: 'number' },
  ],
  tape: [
    { key: 'width', label: 'Largeur', type: 'text' },
    { key: 'weightPerM', label: 'Poids/m', type: 'text' },
    { key: 'rollLength', label: 'Long./rouleau', type: 'text' },
    { key: 'rollsPerShrink', label: 'Rolls/shrink', type: 'text' },
    { key: 'rollsPerCarton', label: 'Rolls/ctn', type: 'text' },
  ],
  accessory: [
    { key: 'size', label: 'Taille', type: 'text', uppercase: true },
    { key: 'thickness', label: 'Épaisseur', type: 'text' },
    { key: 'weightPerPiece', label: 'Poids/pc', type: 'text' },
    { key: 'pcsPerBox', label: 'Pcs/box', type: 'text' },
    { key: 'boxPerCarton', label: 'Box/ctn', type: 'text' },
  ],
};

export const QUALITIES_FIELD_BY_SPEC: Record<string, string> = {
  fabric: 'fabricQualities',
  zipper: 'zipperQualities',
  thread: 'threadQualities',
  slider: 'sliderQualities',
  tape: 'tapeQualities',
  accessory: 'accessoryQualities',
};

export const SPEC_BADGES: Record<string, { emoji: string; label: string; bg: string; text: string }> = {
  fabric:    { emoji: '🧵', label: 'Spé Fabric',     bg: 'bg-violet-100',  text: 'text-violet-700' },
  zipper:    { emoji: '⚡', label: 'Spé Zipper',     bg: 'bg-amber-100',   text: 'text-amber-700' },
  thread:    { emoji: '🪡', label: 'Spé Thread',     bg: 'bg-teal-100',    text: 'text-teal-700' },
  slider:    { emoji: '🎛️', label: 'Spé Slider',     bg: 'bg-blue-100',    text: 'text-blue-700' },
  tape:      { emoji: '🎗️', label: 'Spé Ruban',      bg: 'bg-indigo-100',  text: 'text-indigo-700' },
  accessory: { emoji: '🧷', label: 'Spé Accessoire', bg: 'bg-rose-100',    text: 'text-rose-700' },
};

export function countQualities(entity: any, specType?: string): number {
  const field = specType ? QUALITIES_FIELD_BY_SPEC[specType] : null;
  if (!field) return 0;
  const arr = entity?.[field];
  return Array.isArray(arr) ? arr.length : 0;
}

const SPEC_MATCHERS: Record<string, (name: string | null | undefined, genCat: any) => boolean> = {
  fabric: isFabricLineOrCategory,
  zipper: isZipperLineOrCategory,
  thread: isThreadLineOrCategory,
  slider: isSliderLineOrCategory,
  tape: isTapeLineOrCategory,
  accessory: isAccessoryLineOrCategory,
};

/**
 * Devine le specType d'un pôle : utilise le champ explicite s'il est défini,
 * sinon retombe sur la détection par ligne/nom déjà utilisée dans categories-view.tsx
 * (isFabricLineOrCategory etc.), pour ne pas dépendre d'une assignation manuelle
 * préalable via "Modifier le Pôle".
 */
export function detectSpecType(gc: any): string | undefined {
  const explicit = gc?.specType;
  if (explicit && explicit !== 'none') return explicit;
  for (const type of Object.keys(SPEC_MATCHERS)) {
    if (SPEC_MATCHERS[type](gc?.name, gc)) return type;
  }
  return undefined;
}
