/**
 * Constantes partagées de l'application.
 * Centraliser ici toute valeur qui apparaît dans plusieurs fichiers.
 */

/** Liste des sociétés déclarantes. Utilisée dans dashboard-view et suppliers-view. */
export const COMPANIES_LIST = ['New fournitures', 'Lebtex', 'Robe in box'] as const;
export type CompanyName = (typeof COMPANIES_LIST)[number];

/**
 * Email de l'administrateur principal.
 * Contrôle la création de comptes clients.
 * À terme, remplacer par un claim Firebase custom (role: 'admin').
 */
export const ADMIN_EMAIL = 'yahya.lebbar13@gmail.com';

/**
 * Retourne le coût de fret d'une facture en normalisant
 * les deux champs historiques freightCost et freight.
 */
export function getFreight(facture: any): number {
  return Number(facture?.freightCost) || Number(facture?.freight) || 0;
}

/**
 * Détecte si un nom de catégorie correspond à un article zipper technique
 * (exclut LONG CHAIN et SLIDER qui sont des accessoires, pas des zippers).
 */
export function isZipperCategory(catName: string | undefined): boolean {
  if (!catName) return false;
  const upper = catName.toUpperCase();
  return upper.includes('ZIPPER') && !upper.includes('LONG CHAIN') && !upper.includes('SLIDER');
}

export const FABRIC_KEYWORDS = [
  'fabric', 'non woven', 't/c fabric', 'popeline', 'leather', 'felt fabric',
  'polyester fabric', 'taffeta fabric', 'woven interlining', 'interlining',
  'pocketing', 'eva film', 't/c twill', 'oxford', 'twill', 'tissu', 'textile', 'woven'
];

export const ZIPPER_KEYWORDS = [
  'zipper', 'nylon zipper', 'metal zipper', 'plastic zipper', 'long chain', 'fermeture'
];

/**
 * Détecte si un nom de catégorie appartient au pôle Fabric
 */
export function isFabricCategory(catName: string | undefined): boolean {
  if (!catName) return false;
  const lower = catName.toLowerCase().trim();
  return FABRIC_KEYWORDS.some(kw => lower.includes(kw));
}

/**
 * Détecte si un contexte (Ligne, Pôle ou Famille) relève des spécifications Fabric.
 * Vérifie d'abord specType explicite, puis la Ligne (Fabric), puis le pôle, puis la catégorie.
 */
export function isFabricLineOrCategory(
  catName?: string | null,
  genCat?: any
): boolean {
  if (genCat) {
    if (genCat.specType === 'fabric') return true;
    if (genCat.specType === 'zipper' || genCat.specType === 'none') return false;
    const lineLower = (genCat.line || '').toLowerCase().trim();
    if (lineLower === 'fabric' || lineLower.includes('fabric') || lineLower.includes('tissu')) return true;
    const nameLower = (genCat.name || '').toLowerCase().trim();
    if (FABRIC_KEYWORDS.some(kw => nameLower.includes(kw))) return true;
  }
  if (catName) {
    const lower = catName.toLowerCase().trim();
    return FABRIC_KEYWORDS.some(kw => lower.includes(kw));
  }
  return false;
}

/**
 * Détecte si un contexte (Ligne, Pôle ou Famille) relève des spécifications Zipper.
 * Vérifie d'abord specType explicite, puis la Ligne (Zipper), puis le pôle, puis la catégorie.
 */
export function isZipperLineOrCategory(
  catName?: string | null,
  genCat?: any
): boolean {
  if (genCat) {
    if (genCat.specType === 'zipper') return true;
    if (genCat.specType === 'fabric' || genCat.specType === 'none') return false;
    const lineLower = (genCat.line || '').toLowerCase().trim();
    if (lineLower === 'zipper' || lineLower.includes('zipper') || lineLower.includes('fermeture')) return true;
    const nameLower = (genCat.name || '').toLowerCase().trim();
    if (ZIPPER_KEYWORDS.some(kw => nameLower.includes(kw)) && !nameLower.includes('slider') && !nameLower.includes('puller')) return true;
  }
  if (catName) {
    const lower = catName.toLowerCase().trim();
    return ZIPPER_KEYWORDS.some(kw => lower.includes(kw)) && !lower.includes('slider') && !lower.includes('puller');
  }
  return false;
}
