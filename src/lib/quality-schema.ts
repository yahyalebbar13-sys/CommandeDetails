import {
  isFabricLineOrCategory, isZipperLineOrCategory, isThreadLineOrCategory,
  isSliderLineOrCategory, isTapeLineOrCategory, isAccessoryLineOrCategory,
} from '@/lib/constants';

export type QualityFieldType = 'text' | 'number' | 'image' | 'select';

/**
 * À quoi sert un champ, et donc où il s'affiche.
 *
 * - `technique` : ce qui décrit la marchandise (GSM, largeur, longueur, curseur…). C'est ce qui
 *   part sur les documents comme « caractéristiques ».
 * - `conditionnement` : combien il en entre dans un sac, un carton, un grand carton. Déjà saisi
 *   depuis toujours, mais jamais calculé nulle part — il se lisait en clair sur le papier et le
 *   magasinier faisait la division de tête.
 * - `empilage` : comment les colis se montent en barrette sur une palette. Ne se dit pas sur une
 *   fiche produit — c'est une donnée d'entrepôt, réservée aux documents logistiques.
 */
export type QualityFieldGroup = 'technique' | 'conditionnement' | 'empilage';

export interface QualityFieldDef {
  key: string;
  label: string;
  type: QualityFieldType;
  placeholder?: string;
  uppercase?: boolean;
  /** Défaut : `technique`. */
  groupe?: QualityFieldGroup;
  /** Valeurs proposées pour un champ `select`. */
  options?: string[];
  /** Explication affichée au survol de l'en-tête de colonne, dans l'écran Qualités. */
  aide?: string;
}

/**
 * Les deux niveaux de colis que tout produit partage, quel que soit son type.
 *
 */
/**
 * La barrette : la pile de colis telle qu'elle se monte sur une palette, « quatre sacs de large,
 * douze de hauteur ».
 *
 * On empile TOUJOURS le conditionnement en gros du produit — celui qu'on porte : le carton pour
 * la mercerie, le sac ou le rouleau pour le tissu. Il n'y a donc rien a choisir : la question
 * « on empile quoi ? » se deduit de ce qui est deja saisi (src/lib/conditionnement.ts).
 */
const CHAMPS_EMPILAGE: QualityFieldDef[] = [
  {
    key: 'stackPerRow', label: 'Par rangée', type: 'number', groupe: 'empilage',
    aide: 'Combien de colis côte à côte sur une rangée. Ex. : 4.',
  },
  {
    key: 'stackRows', label: 'Rangées (haut.)', type: 'number', groupe: 'empilage',
    aide: "Combien de rangées empilées en hauteur. Ex. : 12. Avec 4 par rangée, la barrette fait 48 colis.",
  },
];

export const QUALITY_SCHEMA: Record<string, QualityFieldDef[]> = {
  fabric: [
    { key: 'gsm', label: 'GSM', type: 'text', placeholder: 'Ex: 180 ou 25+7' },
    { key: 'fabricWidth', label: 'Largeur (cm)', type: 'number' },
    { key: 'rollLength', label: 'Long. rouleau', type: 'number', groupe: 'conditionnement',
      aide: "Longueur d'un rouleau, dans l'unité d'achat du produit. C'est elle qui convertit des mètres en rouleaux." },
    { key: 'rollLengthUnit', label: 'Unité', type: 'text', placeholder: 'm, yds', groupe: 'conditionnement' },
    { key: 'packagingPerBag', label: 'Rouleaux/sac', type: 'number', groupe: 'conditionnement',
      aide: 'Combien de rouleaux entrent dans un sac.' },
    ...CHAMPS_EMPILAGE,
  ],
  zipper: [
    { key: 'length', label: 'Longueur', type: 'text' },
    { key: 'zipperType', label: 'Type (C/E, O/E)', type: 'text' },
    { key: 'slider', label: 'Curseur', type: 'text' },
    { key: 'sliderType', label: 'Type curseur', type: 'text' },
    { key: 'tapeWeightGsm', label: 'Poids ruban (g/m)', type: 'number' },
    { key: 'sliderWeightG', label: 'Poids curseur (g)', type: 'number' },
    { key: 'pcsPerBag', label: 'Pcs/sac', type: 'number', groupe: 'conditionnement',
      aide: 'Combien de pièces dans un sac.' },
    { key: 'bagsPerCarton', label: 'Sacs/carton', type: 'number', groupe: 'conditionnement',
      aide: 'Combien de sacs dans un carton.' },
    ...CHAMPS_EMPILAGE,
  ],
  thread: [
    { key: 'coneWeightG', label: 'Poids cône (g)', type: 'text' },
    { key: 'threadWeightG', label: 'Poids fil (g)', type: 'text' },
    { key: 'lengthPerPiece', label: 'Long./pièce', type: 'text' },
    { key: 'lengthUnit', label: 'Unité', type: 'text', placeholder: 'm, yds' },
    { key: 'pcsPerBag', label: 'Pcs/sac', type: 'number', groupe: 'conditionnement',
      aide: 'Combien de cônes dans un sac.' },
    { key: 'bagsPerCarton', label: 'Sacs/carton', type: 'number', groupe: 'conditionnement',
      aide: 'Combien de sacs dans un carton.' },
    ...CHAMPS_EMPILAGE,
  ],
  slider: [
    { key: 'imageUrl', label: 'Photo', type: 'image' },
    { key: 'size', label: 'Taille', type: 'text', uppercase: true },
    { key: 'sliderWeightG', label: 'Poids curseur (g)', type: 'text' },
    { key: 'pcsPerBag', label: 'Pcs/sac', type: 'number', groupe: 'conditionnement',
      aide: 'Combien de curseurs dans un sac.' },
    { key: 'bagsPerCarton', label: 'Sacs/carton', type: 'number', groupe: 'conditionnement',
      aide: 'Combien de sacs dans un carton.' },
    ...CHAMPS_EMPILAGE,
  ],
  tape: [
    { key: 'width', label: 'Largeur', type: 'text' },
    { key: 'weightPerM', label: 'Poids/m', type: 'text' },
    { key: 'rollLength', label: 'Long./rouleau', type: 'text', groupe: 'conditionnement',
      aide: "Longueur d'un rouleau. Son unité est dans la colonne suivante (unité d'achat du pôle si elle est vide)." },
    // L'unité de cette longueur. Même nom que pour le tissu — et surtout PAS `lengthUnit`, qui
    // pour le fil est la longueur d'UNE pièce : un rouleau de 100 yds n'est pas un rouleau de
    // 100 m, et sans cette case le logiciel ne pouvait pas le savoir.
    { key: 'rollLengthUnit', label: 'Unité rouleau', type: 'select', options: ['m', 'yds'],
      placeholder: "unité d'achat", groupe: 'conditionnement',
      aide: "Unité de la longueur du rouleau : m ou yds. Vide = l'unité d'achat du pôle." },
    { key: 'rollsPerShrink', label: 'Rouleaux/shrink', type: 'text', groupe: 'conditionnement',
      aide: 'Combien de rouleaux dans un film rétractable.' },
    { key: 'rollsPerCarton', label: 'Rouleaux/carton', type: 'text', groupe: 'conditionnement',
      aide: 'Combien de rouleaux dans un carton — en rouleaux, pas en shrinks.' },
    ...CHAMPS_EMPILAGE,
  ],
  accessory: [
    { key: 'size', label: 'Taille', type: 'text', uppercase: true },
    { key: 'thickness', label: 'Épaisseur', type: 'text' },
    { key: 'weightPerPiece', label: 'Poids/pc', type: 'text' },
    { key: 'pcsPerBox', label: 'Pcs/boîte', type: 'text', groupe: 'conditionnement',
      aide: 'Combien de pièces dans une boîte.' },
    { key: 'boxPerCarton', label: 'Boîtes/carton', type: 'text', groupe: 'conditionnement',
      aide: 'Combien de boîtes dans un carton.' },
    ...CHAMPS_EMPILAGE,
  ],
};

/** Le groupe d'un champ, `technique` par défaut. */
export const groupeDuChamp = (champ: QualityFieldDef): QualityFieldGroup => champ.groupe || 'technique';

export const LIBELLE_GROUPE: Record<QualityFieldGroup, string> = {
  technique: 'Caractéristiques',
  conditionnement: 'Conditionnement',
  empilage: 'Empilage (palette)',
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
