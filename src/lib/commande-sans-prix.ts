/**
 * Une commande peut se prendre sans prix.
 *
 * Il n'y a plus de prix minimum dans /stock : la caisse comparait le prix de vente au prix de
 * revient et refusait tout ce qui passait en dessous — un compte magasin était bloqué net, et le
 * seul rôle autorisé à passer outre, l'administrateur, n'a même pas accès à l'écran de caisse.
 * Résultat : on ne pouvait pas noter une commande dont le prix n'était pas encore arrêté, alors
 * que c'est le cas courant — le client négocie, ou la direction tranchera.
 *
 * Ce qui remplace le refus, c'est un rappel : une commande sans prix se signale, partout où on la
 * voit, jusqu'à ce qu'elle en ait un. Et on ne la facture pas sans le savoir.
 */

/** Une ligne dont le prix reste à fixer. Il y a un prix, ou il n'y en a pas — pas de plancher. */
export const sansPrix = (ligne: any): boolean => !(Number(ligne?.unitPrice) > 0);

/** Combien de lignes d'une commande attendent encore leur prix. */
export const lignesSansPrix = (commande: any): number =>
  (commande?.items || []).filter(sansPrix).length;

/**
 * Une commande encore vivante à qui il manque un prix.
 *
 * Facturée ou annulée, elle n'attend plus rien : la rappeler ferait du bruit pour rien, et le
 * bandeau de rappel ne s'éteindrait jamais.
 */
export const attendUnPrix = (commande: any): boolean =>
  commande?.status !== 'INVOICED' && commande?.status !== 'CANCELLED' && lignesSansPrix(commande) > 0;

/** Un prix tapé au clavier : « 12,50 » et « 12.50 » valent douze cinquante ; le reste ne vaut rien. */
export function prixSaisi(brut: unknown): number {
  const n = Number(String(brut ?? '').replace(',', '.').trim());
  return Number.isFinite(n) && n > 0 ? Math.round(n * 100) / 100 : 0;
}

export interface TotauxCommande {
  items: any[];
  totalAmount: number;
  totalAfterDiscount: number;
  /** Ce qu'il reste à chiffrer après cette saisie. */
  restantSansPrix: number;
}

/**
 * Les lignes d'une commande après saisie des prix, et ses totaux.
 *
 * @param saisies les prix tapés, par rang de ligne. Une ligne absente garde son prix ; une ligne
 *                vidée retombe à zéro et continuera de se rappeler — on ne force personne.
 * @param remise  le pourcentage de remise de la commande, conservé tel quel : il s'applique au
 *                nouveau sous-total, sinon corriger un prix effacerait la remise accordée.
 */
export function appliquerPrix(items: any[], saisies: Record<number, string>, remise = 0): TotauxCommande {
  const lignes = (items || []).map((item: any, i: number) => {
    if (!(i in saisies)) return item;
    const prix = prixSaisi(saisies[i]);
    const qte = Number(item?.qty) || 0;
    return { ...item, unitPrice: prix, totalPrice: Math.round(prix * qte * 100) / 100 };
  });

  const totalAmount = Math.round(lignes.reduce((s: number, l: any) => s + (Number(l?.totalPrice) || 0), 0) * 100) / 100;
  const tauxRemise = Math.min(100, Math.max(0, Number(remise) || 0));
  const totalAfterDiscount = Math.round(totalAmount * (1 - tauxRemise / 100) * 100) / 100;

  return { items: lignes, totalAmount, totalAfterDiscount, restantSansPrix: lignes.filter(sansPrix).length };
}
