// ─── Bons de livraison ───────────────────────────────────────────────────────
// Un seul endroit charge le module PDF, et seulement au clic : jsPDF et la
// charte pèsent lourd, inutile de les télécharger à l'ouverture de l'admin.
// Le PDF passe outre l'interdiction d'imprimer la page (globals.css).

import type { ShopOrder } from '@/lib/shop-types';

export async function telechargerBonsLivraison(commandes: ShopOrder | ShopOrder[]): Promise<void> {
  const liste = Array.isArray(commandes) ? commandes : [commandes];
  if (!liste.length) throw new Error('Aucune commande à imprimer.');
  let module: typeof import('@/lib/pdf-commande-boutique');
  try {
    module = await import('@/lib/pdf-commande-boutique');
  } catch {
    throw new Error('Le module des bons de livraison n’a pas pu se charger. Rechargez la page puis réessayez.');
  }
  await module.exporterBonLivraison(Array.isArray(commandes) ? liste : liste[0]);
}
