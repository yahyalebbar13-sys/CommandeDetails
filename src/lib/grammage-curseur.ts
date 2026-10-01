/**
 * Le grammage des curseurs (g/pc), pour l'afficher partout où l'on choisit
 * ou expédie une commande : deux curseurs du même modèle ne se distinguent
 * souvent que par lui.
 */

import { ligneQualiteDuCatalogue, specTypeDeLArticle } from './specification-produit';

const rempli = (v: unknown): boolean =>
  v !== null && v !== undefined && String(v).trim() !== '' && String(v).trim() !== '0';

/**
 * Le grammage d'un curseur (g/pc), « 3.28 » ou « 2.4-3.8 » : celui de sa qualité au catalogue,
 * sinon celui saisi sur la commande. Avec une ligne de ventilation (qualité ou design), c'est la
 * qualité de CETTE ligne qui compte — deux curseurs du même article ne pèsent pas pareil. Null
 * pour un produit qui n'est pas un curseur, ou un curseur sans poids connu.
 */
export function grammageCurseur(article: any, categories: any[] = [], generalCategories: any[] = [], ligne?: any): string | null {
  if (specTypeDeLArticle(article, categories, generalCategories) !== 'slider') return null;
  const ligneQualite = ligne ? (ligne.designRef ? { quality: ligne.designRef } : ligne) : undefined;
  const definition = ligneQualiteDuCatalogue(article, categories, generalCategories, 'slider', ligneQualite);
  // Une ligne sans qualité reconnue ne prend pas le poids de l'article : il peut être celui d'une autre ligne.
  const brut = [definition?.sliderWeightG, ligne?.sliderWeightG, ligne ? undefined : article?.sliderWeightG].find(rempli);
  return brut === undefined ? null : String(brut).trim().replace(/,/g, '.');
}

/** Les grammages d'un curseur, un par qualité ou design ventilé (sans doublon), sinon celui de l'article. */
export function grammagesCurseur(article: any, categories: any[] = [], generalCategories: any[] = []): string[] {
  if (specTypeDeLArticle(article, categories, generalCategories) !== 'slider') return [];
  const lignes = [article?.qualityBreakdown, article?.designBreakdown].find(l => Array.isArray(l) && l.length) as any[] | undefined;
  const parLigne = (lignes || []).map(l => grammageCurseur(article, categories, generalCategories, l)).filter((g): g is string => Boolean(g));
  if (parLigne.length) return [...new Set(parLigne)];
  const seul = grammageCurseur(article, categories, generalCategories);
  return seul ? [seul] : [];
}
