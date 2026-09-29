// ─── Statuts des colis Sendit, lus par LEBTEX ────────────────────────────────
// Sendit décrit le trajet d'un colis avec ses propres codes (PENDING, PICKEDUP,
// DELIVERED…, cf. GET /all-status-deliveries, et le champ `status_return` pour
// les retours). Ce fichier dit, pour chacun :
//   • comment l'écrire en français pour l'équipe ;
//   • s'il fait avancer la commande TOUT SEUL (seulement les cas sûrs : ramassé,
//     en livraison, livré) ;
//   • s'il faut une action humaine (« à rappeler », « à vérifier »).
//
// Rien n'est automatique pour les mauvaises nouvelles (annulé, refusé, retour) :
// une commande annulée ou retournée change la caisse et le stock, c'est une
// personne qui le décide, après avoir vérifié. Et un statut ne fait jamais
// reculer une commande (Sendit renvoie parfois un colis « à l'entrepôt » après
// un report : la commande reste « en livraison »).
//
// Pur (ni Firebase ni réseau) : testé par scripts/test-sendit.ts.

import type { OrderStatus } from './shop-types';

/** Libellés des statuts Sendit, tels que l'équipe les lit dans la fiche. */
export const LIBELLES_STATUT_SENDIT: Record<string, string> = {
  PENDING: 'Colis créé, en attente du ramassage',
  TO_PREPARE: 'À préparer',
  NEW_DESTINATION: 'Nouvelle adresse demandée',
  TO_PICKUP: 'Ramassage en cours',
  PICKEDUP: 'Ramassé par Sendit',
  WAREHOUSE: 'À l’entrepôt Sendit',
  TRANSIT: 'En transit',
  DISTRIBUTED: 'Arrivé dans la ville du client',
  DELIVERING: 'En cours de livraison',
  UNREACHABLE: 'Client injoignable',
  POSTPONED: 'Livraison reportée',
  SCHEDULED: 'Livraison programmée',
  DELIVERED: 'Livré',
  PARTIALLY_DELIVERED: 'Livré en partie',
  CANCELED: 'Annulé chez Sendit',
  REJECTED: 'Refusé par le client',
  RETURNED: 'Retourné',
  // Statuts de retour (champ `status_return`).
  RETOUR_PENDING: 'Retour en attente',
  TORETURN: 'À retourner',
  RETURN_WAREHOUSE: 'Retour à l’entrepôt Sendit',
  RETURN_TOCHECK: 'Retour à contrôler chez Sendit',
  RETURN_STOCK: 'Retour gardé chez Sendit',
  RETURN_SELLER: 'Retour rendu au magasin',
};

/** Code Sendit propre (MAJUSCULES, lettres et « _ »), ou null s'il est illisible. */
export function codeStatutSendit(v: unknown): string | null {
  if (typeof v !== 'string') return null;
  const c = v.trim().toUpperCase().replace(/[\s-]+/g, '_');
  return /^[A-Z_]{2,40}$/.test(c) ? c : null;
}

/** Libellé français ; un code que l'on ne connaît pas encore reste lisible tel quel. */
export function libelleStatutSendit(code: unknown): string {
  const c = codeStatutSendit(code);
  if (!c) return 'Statut Sendit inconnu';
  return LIBELLES_STATUT_SENDIT[c] ?? `Statut Sendit « ${c} »`;
}

/**
 * Ce que l'équipe doit faire :
 * - a_rappeler : appeler le client (injoignable, report, nouvelle adresse) ;
 * - a_verifier : regarder avant de toucher à la commande (annulé, refusé, retour).
 */
export type MentionSendit = 'a_rappeler' | 'a_verifier';

export const LIBELLES_MENTION_SENDIT: Record<MentionSendit, string> = {
  a_rappeler: 'À rappeler',
  a_verifier: 'À vérifier',
};

export interface EffetStatutSendit {
  /** Statut que la commande peut prendre toute seule (jamais en arrière), ou null. */
  statut: OrderStatus | null;
  mention: MentionSendit | null;
  /** Phrase pour la fiche : ce que ce statut veut dire pour l'équipe. */
  explication: string;
}

const RETOURS = new Set(['RETOUR_PENDING', 'TORETURN', 'RETURN_WAREHOUSE', 'RETURN_TOCHECK', 'RETURN_STOCK', 'RETURN_SELLER', 'RETURNED']);

/** Effet d'un statut Sendit, sans tenir compte de l'état actuel de la commande. */
export function effetStatutSendit(code: unknown): EffetStatutSendit {
  const c = codeStatutSendit(code);
  switch (c) {
    case 'PICKEDUP':
    case 'WAREHOUSE':
    case 'TRANSIT':
      return { statut: 'shipped', mention: null, explication: 'Le colis est parti avec Sendit.' };
    case 'DISTRIBUTED':
    case 'DELIVERING':
      return { statut: 'out_for_delivery', mention: null, explication: 'Le livreur Sendit va livrer le client.' };
    case 'DELIVERED':
      return { statut: 'delivered', mention: null, explication: 'Sendit a livré et encaissé : l’argent revient par virement Sendit.' };
    case 'UNREACHABLE':
      return { statut: null, mention: 'a_rappeler', explication: 'Sendit n’arrive pas à joindre le client : appelez-le.' };
    case 'POSTPONED':
    case 'SCHEDULED':
      return { statut: null, mention: 'a_rappeler', explication: 'Livraison reportée : vérifiez la nouvelle date avec le client.' };
    case 'NEW_DESTINATION':
      return { statut: null, mention: 'a_rappeler', explication: 'Sendit demande une autre adresse : appelez le client.' };
    case 'CANCELED':
      return { statut: null, mention: 'a_verifier', explication: 'Colis annulé chez Sendit : vérifiez, puis changez le statut de la commande à la main.' };
    case 'REJECTED':
      return { statut: null, mention: 'a_verifier', explication: 'Le client a refusé le colis : vérifiez, puis annulez ou marquez la commande « retournée » à la main.' };
    case 'PARTIALLY_DELIVERED':
      return { statut: null, mention: 'a_verifier', explication: 'Livré en partie : vérifiez avec le client ce qui manque.' };
    case 'PENDING':
    case 'TO_PREPARE':
    case 'TO_PICKUP':
      return { statut: null, mention: null, explication: 'Le colis attend le ramassage Sendit au magasin.' };
    default:
      if (c && RETOURS.has(c)) {
        return { statut: null, mention: 'a_verifier', explication: 'Colis en retour : vérifiez-le à son arrivée au magasin, puis marquez la commande à la main.' };
      }
      return { statut: null, mention: null, explication: 'Statut Sendit inconnu : aucun changement automatique.' };
  }
}

/** Ordre du trajet : un statut Sendit ne fait avancer la commande que vers la droite. */
const RANG: Partial<Record<OrderStatus, number>> = {
  pending: 0,
  confirmed: 1,
  processing: 2,
  ready_for_pickup: 2,
  shipped: 3,
  out_for_delivery: 4,
  delivered: 5,
};

/** Livrée, annulée, retournée : Sendit n'y touche jamais tout seul. */
export const STATUTS_COMMANDE_INTOUCHABLES: OrderStatus[] = ['delivered', 'cancelled', 'returned'];

export interface DecisionStatutSendit {
  /** Nouveau statut de la commande, ou null (rien à écrire dans la commande). */
  nouveauStatut: OrderStatus | null;
  mention: MentionSendit | null;
  explication: string;
}

/**
 * Ce qu'un statut Sendit change à une commande qui est `actuel` :
 * on avance seulement (jamais de retour en arrière), on ne touche jamais une
 * commande livrée, annulée ou retournée ; si Sendit dit que le colis bouge alors
 * que la commande est annulée chez nous, on le signale.
 */
export function decisionStatutSendit(actuel: OrderStatus, code: unknown): DecisionStatutSendit {
  const effet = effetStatutSendit(code);
  if (actuel === 'cancelled' || actuel === 'returned') {
    const bouge = effet.statut !== null;
    return {
      nouveauStatut: null,
      mention: bouge ? 'a_verifier' : effet.mention,
      explication: bouge
        ? `La commande est ${actuel === 'cancelled' ? 'annulée' : 'retournée'} chez nous, mais Sendit indique « ${libelleStatutSendit(code)} » : vérifiez.`
        : effet.explication,
    };
  }
  if (!effet.statut || actuel === 'delivered') {
    return { nouveauStatut: null, mention: effet.mention, explication: effet.explication };
  }
  const rangActuel = RANG[actuel] ?? 0;
  const rangNouveau = RANG[effet.statut] ?? 0;
  return {
    nouveauStatut: rangNouveau > rangActuel ? effet.statut : null,
    mention: effet.mention,
    explication: effet.explication,
  };
}

/** Le colis n'a plus rien à faire chez Sendit : inutile de le rafraîchir. */
export function colisTermine(code: unknown, codeRetour?: unknown): boolean {
  const c = codeStatutSendit(code);
  const r = codeStatutSendit(codeRetour);
  if (r === 'RETURN_SELLER') return true;
  return c === 'DELIVERED' || c === 'RETURNED';
}

/** Couleur de pastille pour la fiche (fond sombre) selon ce qu'il faut faire. */
export function tonStatutSendit(code: unknown): 'ok' | 'attention' | 'probleme' | 'neutre' {
  const effet = effetStatutSendit(code);
  if (effet.mention === 'a_verifier') return 'probleme';
  if (effet.mention === 'a_rappeler') return 'attention';
  if (effet.statut === 'delivered') return 'ok';
  return 'neutre';
}
