// ─── Unités fixées par pôle ───────────────────────────────────────────────────
// Un pôle peut imposer son unité à l'ACHAT (commandes d'import, achat au
// marché, modèles de commande) et à la VENTE (caisse, factures, commandes
// préparées, et toutes les opérations de stock : mouvements, transferts,
// inventaire, retours). Sans unité fixée, rien ne change : l'unité reste un
// choix libre par article.
//
// Aucune conversion ici : quand l'achat et la vente diffèrent, le rapport
// (mètres par rouleau, pièces par sac…) est déjà porté par les qualités du
// produit. Premier pôle fixé : TAFFETA FABRIC, en mètres à l'achat comme à la
// vente.
//
// Pur : testé par scripts/test-unites-pole.ts.

import type { Category, GeneralCategory } from './types';

/** Unités proposées partout (même liste que les formulaires de commande). */
export const UNITES = ['pièces', 'doz', 'gross (144p)', 'm', 'rolls', 'kg', 'bag', 'yds'] as const;

export const LIBELLE_UNITE: Record<string, string> = {
  'pièces': 'Pièces',
  'doz': 'Douzaines',
  'gross (144p)': 'Grosses (144 p)',
  'm': 'Mètres (m)',
  'rolls': 'Rouleaux',
  'kg': 'Kilogrammes',
  'bag': 'Sacs',
  'yds': 'Yards',
};

export type ContexteUnite = 'achat' | 'vente';

type PoleUnites = Pick<GeneralCategory, 'uniteAchat' | 'uniteVente'> | null | undefined;

/** L'unité que ce pôle impose dans ce contexte, s'il en impose une. */
export function uniteImposee(pole: PoleUnites, contexte: ContexteUnite): string | undefined {
  const u = contexte === 'achat' ? pole?.uniteAchat : pole?.uniteVente;
  return u && u.trim() ? u.trim() : undefined;
}

/**
 * Unité dans laquelle le stock de ce pôle se compte et se manipule (vente,
 * mouvements, transferts, inventaire). Sans conversion, le stock se compte dans
 * ce qui a été acheté : unité de vente si elle est la même, sinon unité
 * d'achat, sinon rien d'imposé.
 */
export function uniteDeStock(pole: PoleUnites): string | undefined {
  const achat = uniteImposee(pole, 'achat');
  const vente = uniteImposee(pole, 'vente');
  if (achat && vente) return achat === vente ? vente : achat;
  return achat ?? vente;
}

/**
 * Le pôle d'un article : par sa catégorie d'abord (elle a pu changer de pôle
 * depuis la commande), sinon par le pôle noté sur l'article. `categoryId`
 * contient le NOM de la catégorie dans les commandes, l'identifiant ailleurs :
 * les deux sont acceptés.
 */
export function poleDeLArticle<P extends Pick<GeneralCategory, 'id'>>(
  article: { categoryId?: string | null; generalCategoryId?: string | null } | null | undefined,
  categories: Pick<Category, 'id' | 'name' | 'generalCategoryId'>[] | null | undefined,
  poles: P[] | null | undefined,
): P | undefined {
  if (!article || !poles?.length) return undefined;
  const cat = (categories || []).find(c => c.id === article.categoryId || c.name === article.categoryId);
  return (cat?.generalCategoryId && poles.find(p => p.id === cat.generalCategoryId))
    || (article.generalCategoryId ? poles.find(p => p.id === article.generalCategoryId) : undefined)
    || undefined;
}

/** Se compte-t-elle en décimales ? (2,5 m se vend ; 2,5 pièces non.) */
export function uniteDecimale(unite?: string | null): boolean {
  const u = (unite || '').trim().toLowerCase();
  return ['m', 'mètre', 'mètres', 'metre', 'metres', 'yds', 'yd', 'yard', 'yards', 'kg', 'g'].includes(u);
}

/** Pas de saisie d'une quantité dans cette unité (0,01 m, ou 1 pièce). */
export function pasDeSaisie(unite?: string | null): number {
  return uniteDecimale(unite) ? 0.01 : 1;
}

/** Libellé lisible d'une unité, avec repli sur la valeur brute. */
export function libelleUnite(unite?: string | null): string {
  const u = (unite || '').trim();
  return LIBELLE_UNITE[u] || u || 'unité';
}
