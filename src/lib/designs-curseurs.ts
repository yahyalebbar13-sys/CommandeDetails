// ─── Anciens designs de curseurs → qualités ───────────────────────────────────
// Avant les qualités fixes, les curseurs et tirettes avaient un catalogue de
// designs à part : `users/{uid}/categories/{id}/designs` (référence, photo,
// taille, poids, conditionnement). La fiche de la catégorie les affiche mêlés
// aux qualités, mais ils n'ont jamais été ENREGISTRÉS comme qualités : les
// formulaires de commande, /stock et le gestionnaire de qualités, qui ne lisent
// que `sliderQualities`, ne les voient pas.
//
// Ce fichier dit quels designs manquent et sous quelle forme les enregistrer.
// Pur : testé par scripts/test-designs-curseurs.ts.

import type { Category } from './types';

export type QualiteCurseur = NonNullable<Category['sliderQualities']>[number];

export type DesignAncien = {
  id?: string;
  ref?: string | null;
  description?: string | null;
  imageUrl?: string | null;
  size?: string | null;
  sliderWeightG?: number | string | null;
  pcsPerBag?: number | null;
  bagsPerCarton?: number | null;
};

const vide = (v: unknown) => v === undefined || v === null || (typeof v === 'string' && !v.trim());

/** Le design sous forme de qualité de curseur — sans champ vide (Firestore refuse `undefined`). */
export function designVersQualite(d: DesignAncien): QualiteCurseur | null {
  const label = (d.ref || '').trim().toUpperCase();
  if (!label) return null;
  const q: QualiteCurseur = { label };
  if (!vide(d.description)) q.nameFR = String(d.description).trim();
  if (!vide(d.imageUrl)) q.imageUrl = String(d.imageUrl);
  if (!vide(d.size)) q.size = String(d.size).trim();
  if (!vide(d.sliderWeightG)) q.sliderWeightG = d.sliderWeightG as number | string;
  if (!vide(d.pcsPerBag) && Number(d.pcsPerBag)) q.pcsPerBag = Number(d.pcsPerBag);
  if (!vide(d.bagsPerCarton) && Number(d.bagsPerCarton)) q.bagsPerCarton = Number(d.bagsPerCarton);
  return q;
}

/** Même modèle : même référence (sans casse), ou même photo. */
export function memeModele(a: { label?: string; imageUrl?: string | null }, b: { label?: string; imageUrl?: string | null }): boolean {
  const la = (a.label || '').trim().toLowerCase();
  const lb = (b.label || '').trim().toLowerCase();
  if (la && lb && la === lb) return true;
  return Boolean(a.imageUrl && b.imageUrl && a.imageUrl === b.imageUrl);
}

/**
 * Deux qualités de curseur désignent-elles le même modèle ? Quand les deux ont
 * une référence, elle seule décide : les anciens designs n'ont ni taille ni
 * poids, et comparer `undefined` à `undefined` confondrait tous les modèles
 * entre eux (modifier l'un écrasait l'autre, supprimer l'un emportait les
 * autres). Sans référence d'un côté : même taille, même poids, même photo.
 */
export function memeQualiteCurseur(
  a: { label?: string; size?: string | null; sliderWeightG?: unknown; imageUrl?: string | null },
  b: { label?: string; size?: string | null; sliderWeightG?: unknown; imageUrl?: string | null },
): boolean {
  const la = (a.label || '').trim().toLowerCase();
  const lb = (b.label || '').trim().toLowerCase();
  if (la && lb) return la === lb;
  return a.size === b.size && a.sliderWeightG === b.sliderWeightG && (a.imageUrl || null) === (b.imageUrl || null)
    && Boolean(a.size || a.sliderWeightG || a.imageUrl);
}

/**
 * Les designs qui ne sont pas encore des qualités — ni de la catégorie, ni de
 * son pôle — prêts à être ajoutés. Deux designs du même modèle n'en font qu'un.
 */
export function designsAEnregistrer(designs: DesignAncien[], qualitesExistantes: { label?: string; imageUrl?: string | null }[]): QualiteCurseur[] {
  const retenues: QualiteCurseur[] = [];
  for (const d of designs || []) {
    const q = designVersQualite(d);
    if (!q) continue;
    if (qualitesExistantes.some(e => memeModele(e, q))) continue;
    if (retenues.some(e => memeModele(e, q))) continue;
    retenues.push(q);
  }
  return retenues;
}
