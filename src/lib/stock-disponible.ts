/**
 * Ce qu'un lieu a réellement sous la main.
 *
 * Un entrepôt n'est pas un point de vente indépendant : c'est le stock du magasin principal,
 * rangé ailleurs. La marchandise arrive en entrepôt — c'est là que les arrivages la posent, et
 * c'est là que le stock de test la pose aussi — puis elle part de CHRIFA, vers un autre magasin
 * ou vers un client.
 *
 * Cette règle existait, mais écrite une seule fois, au fond de l'écran de caisse. L'écran des
 * transferts lisait le stock du magasin principal sans elle : il ne voyait que ce qui était
 * enregistré sous son nom à lui, jamais ce qui dormait dans ses entrepôts. Résultat, tout
 * affichait « Rien au départ » et aucun transfert n'était possible, alors que les entrepôts
 * étaient pleins.
 *
 * Elle vit désormais ici, une fois, pour les deux écrans.
 */

export type LieuConnu = { id: string; type?: string };

/** Le magasin principal, celui qui détient les entrepôts. */
export const MAGASIN_PRINCIPAL = 'CHRIFA';

/** Ce lieu est-il un entrepôt — donc une réserve du magasin principal, et non un magasin ? */
export function estEntrepot(lieuId: unknown, lieux: LieuConnu[] = []): boolean {
  return (lieux || []).some(l => l?.id === lieuId && l?.type === 'WAREHOUSE');
}

/**
 * Le lieu sous lequel un mouvement doit être écrit. Un entrepôt se ramène au magasin principal :
 * c'est sa comptabilité de stock, et les règles Firestore refusent qu'un compte magasin écrive
 * sous un autre nom que le sien.
 */
export function lieuDeMouvement(lieuId: string, lieux: LieuConnu[] = []): string {
  return estEntrepot(lieuId, lieux) ? MAGASIN_PRINCIPAL : lieuId;
}

/**
 * La quantité disponible depuis un lieu.
 *
 * Pour le magasin principal : son propre solde PLUS celui de tous ses entrepôts. Son solde peut
 * être négatif — une vente puisée dans un entrepôt est écrite sous son nom sans que l'entrepôt
 * soit débité — et c'est justement pourquoi il faut faire la somme : séparément, l'un ment,
 * ensemble ils disent la vérité.
 *
 * Pour tout autre magasin : ce qu'il a, et rien d'autre.
 */
export function disponibleDepuis(
  item: { qtyByStore?: Partial<Record<string, number>> | null; currentQty?: number } | null | undefined,
  lieuId: string,
  lieux: LieuConnu[] = [],
): number {
  if (!item) return 0;
  // Les étagères de CHRIFA (src/lib/etageres.ts) ne sont pas de la réserve : une ligne
  // « Étagères » ne se transfère pas, ne se range pas, et se compte avec disponibleSurEtageres.
  if ((item as any)._etagere) return 0;
  const parLieu = item.qtyByStore;
  if (!parLieu) return Number(item.currentQty) || 0;

  if (lieuId === MAGASIN_PRINCIPAL) {
    const total = Object.entries(parLieu).reduce((somme, [id, quantite]) => {
      if (id !== MAGASIN_PRINCIPAL && !estEntrepot(id, lieux)) return somme;
      return somme + (Number(quantite) || 0);
    }, 0);
    // Un total négatif n'est pas une disponibilité : c'est une incohérence de saisie. On ne
    // propose jamais de déplacer une marchandise qui n'est pas là.
    return Math.max(0, Math.round(total * 1000) / 1000);
  }

  return Math.max(0, Number(parLieu[lieuId]) || 0);
}

/**
 * Ce que les étagères du magasin principal ont sous la main, en unité de vente.
 *
 * Seule une ligne « Étagères » (`_etagere`, fabriquée par computeStockItems) en a : une ligne de
 * réserve vaut 0 ici, comme une ligne Étagères vaut 0 pour disponibleDepuis. Sans lieu précisé,
 * tout ce que la ligne porte ; avec un lieu, ce qu'elle porte sous ce lieu (les étagères n'existent
 * qu'au magasin principal : tout autre lieu vaut 0).
 */
export function disponibleSurEtageres(
  item: { _etagere?: boolean; qtyByStore?: Partial<Record<string, number>> | null; currentQty?: number } | null | undefined,
  lieuId?: string,
): number {
  if (!item || !item._etagere) return 0;
  const parLieu = item.qtyByStore;
  let total: number;
  if (lieuId) total = parLieu ? (Number(parLieu[lieuId]) || 0) : (lieuId === MAGASIN_PRINCIPAL ? Number(item.currentQty) || 0 : 0);
  else total = parLieu
    ? Object.values(parLieu).reduce((somme: number, q) => somme + (Number(q) || 0), 0)
    : Number(item.currentQty) || 0;
  return Math.max(0, Math.round(total * 1000) / 1000);
}
