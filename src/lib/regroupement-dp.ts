/**
 * Regroupement des lignes de la déclaration provisoire (DP).
 *
 * Certains pôles se déclarent en une seule ligne, au kilo, quelle que soit la
 * catégorie de l'article : Zipper et Slider depuis toujours, Label et Buckle
 * depuis le 30/09/2026. Les autres catégories restent chacune sur sa ligne.
 *
 * La DP range ses PU sous le nom de la ligne : nom du pôle pour une ligne
 * regroupée, nom de la catégorie sinon. « Coût Vente » relit ces PU : les deux
 * écrans doivent donc appliquer exactement la même règle, celle-ci.
 */

/** Pôles regroupés depuis toujours (catégorie ou pôle qui contient le mot). */
const REGROUPES_HISTORIQUES = ['ZIPPER', 'SLIDER'];
/** Pôles regroupés depuis le 30/09/2026 (nom du pôle seulement). */
const REGROUPES_DEPUIS_SEPTEMBRE = ['LABEL', 'BUCKLE'];

/**
 * PU saisi pour une ligne. Une catégorie renommée depuis (« PVC Luggage
 * Leather » devenue « PVC LUGGAGE LEATHER ») garde son PU : à défaut du nom
 * exact, on accepte le même nom aux majuscules et espaces près. Un nom exact
 * présent, même vide, l'emporte : c'est une saisie faite depuis.
 */
export function puSaisi(puMap: Record<string, string>, nom: string): string | undefined {
  if (Object.prototype.hasOwnProperty.call(puMap, nom)) return puMap[nom];
  const cle = nom.trim().toUpperCase();
  const trouve = Object.keys(puMap).find(k => k.trim().toUpperCase() === cle);
  return trouve === undefined ? undefined : puMap[trouve];
}

export function regroupeParPole(
  catName: string,
  poleName: string,
  puMap: Record<string, string> = {},
): boolean {
  const tout = `${catName} ${poleName}`.toUpperCase();
  if (REGROUPES_HISTORIQUES.some(m => tout.includes(m))) return true;
  if (!REGROUPES_DEPUIS_SEPTEMBRE.some(m => poleName.toUpperCase().includes(m))) return false;
  // Une catégorie qui porte le nom de son pôle : son PU est celui de la ligne
  // regroupée, on ne peut pas les distinguer.
  if (catName.trim().toUpperCase() === poleName.trim().toUpperCase()) return true;
  // Déclaration faite avant le regroupement : elle a déjà un PU pour cette
  // catégorie. On garde sa ligne telle quelle, sinon ce PU serait perdu.
  return !(parseFloat(puSaisi(puMap, catName) ?? '') > 0);
}
