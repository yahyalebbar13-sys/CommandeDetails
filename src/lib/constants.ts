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
