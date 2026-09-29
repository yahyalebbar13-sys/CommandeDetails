// ─── Bons de livraison et papiers des rouleaux ───────────────────────────────
// Un seul endroit charge les modules PDF, et seulement au clic : jsPDF et la
// charte pèsent lourd, inutile de les télécharger à l'ouverture de l'admin.
// Le PDF passe outre l'interdiction d'imprimer la page (globals.css).

import type { ShopOrder } from '@/lib/shop-types';
import type { ReglagesReception } from '@/lib/reglages-reception';
import type { OptionsBon } from '@/lib/pdf-commande-boutique';
import type {
  ArretTournee, OptionsBonRemiseTransporteur, OptionsBonRetrait, OptionsDevisTransport, OptionsFeuilleDeRoute,
} from '@/lib/pdf-livraison-docs';

/**
 * `options` : les magasins réglés (adresse du retrait) et les commandes dont le paiement
 * est déjà noté reçu (le bon dit alors « rien à encaisser »). Sans elles, le bon prend les
 * magasins par défaut et traite tout virement comme pas encore reçu : c'est le plus prudent.
 */
export async function telechargerBonsLivraison(commandes: ShopOrder | ShopOrder[], options: OptionsBon = {}): Promise<void> {
  const liste = Array.isArray(commandes) ? commandes : [commandes];
  if (!liste.length) throw new Error('Aucune commande à imprimer.');
  let module: typeof import('@/lib/pdf-commande-boutique');
  try {
    module = await import('@/lib/pdf-commande-boutique');
  } catch {
    throw new Error('Le module des bons de livraison n’a pas pu se charger. Rechargez la page puis réessayez.');
  }
  await module.exporterBonLivraison(Array.isArray(commandes) ? liste : liste[0], options);
}

// ─── Devis de transport, bon de retrait, feuille de route, bon de remise ─────
// Même principe : le module (lib/pdf-livraison-docs.ts) n'arrive qu'au premier clic.

async function papiers(): Promise<typeof import('@/lib/pdf-livraison-docs')> {
  try {
    return await import('@/lib/pdf-livraison-docs');
  } catch {
    throw new Error('Le module des documents n’a pas pu se charger. Rechargez la page puis réessayez.');
  }
}

/** Devis de transport d'un rouleau (camionnette ou transporteur), avec le prix annoncé au téléphone. */
export async function telechargerDevisTransport(commande: ShopOrder, options: OptionsDevisTransport): Promise<void> {
  await (await papiers()).exporterDevisTransport(commande, options);
}

/** Bon de retrait au magasin (CHRIFA pour les rouleaux, Derb Omar sinon), avec les cases de signature. */
export async function telechargerBonRetrait(commande: ShopOrder, reglages: ReglagesReception, options: OptionsBonRetrait = {}): Promise<void> {
  await (await papiers()).exporterBonRetrait(commande, reglages, options);
}

/** Bon de remise au transporteur de Derb Omar, qui livre jusqu'à son dépôt dans la ville du client. */
export async function telechargerBonRemiseTransporteur(commande: ShopOrder, options: OptionsBonRemiseTransporteur): Promise<void> {
  await (await papiers()).exporterBonRemiseTransporteur(commande, options);
}

/** Feuille de route d'une tournée de la camionnette LEBTEX (arrêts rangés par ville puis quartier). */
export async function telechargerFeuilleDeRoute(arrets: (ShopOrder | ArretTournee)[], options: OptionsFeuilleDeRoute = {}): Promise<void> {
  if (!arrets.length) throw new Error('Aucune commande cochée pour la tournée.');
  await (await papiers()).exporterFeuilleDeRoute(arrets, options);
}
