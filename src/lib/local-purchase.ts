/**
 * Détecte un article créé depuis un achat marché local (/stock), à exclure de /gestion.
 * Utilisé à la fois côté client (filtrage d'affichage) et côté serveur (reset-stock),
 * pour que les deux restent alignés.
 */
export function isLocalMarketPurchaseArticle(data: any): boolean {
  if (!data) return false;
  if (data.isLocalMarketPurchase === true) return true;
  if (data.supplierId === 'Marché local') return true;
  // Fallback pour les articles créés avant l'ajout du flag isLocalMarketPurchase : un article
  // /gestion authentique a toujours un status (TO_ORDER/PI/SHIPPED/STOCK...), même avant d'être
  // rattaché à un arrivage — seul l'achat marché local n'en définit jamais.
  if (!data.status && !data.factureId) return true;
  return false;
}
