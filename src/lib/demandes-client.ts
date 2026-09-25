// ─── Demandes envoyées depuis l'espace client ─────────────────────────────────
// Trois choses qu'un client peut demander à LEBTEX sans téléphoner :
//   • recommander un produit (réassort, même référence) ;
//   • organiser la livraison — ou le retrait — de ce qui est prêt ;
//   • poser une question sur une commande.
// Elles sont rangées dans `users/{admin}/demandesClient` et annoncées par
// e-mail à l'administrateur, qui les traite depuis /gestion.
//
// Pur : validation testée par scripts/test-portail-client.ts.

export type TypeDemande = 'recommande' | 'livraison' | 'question';
export type StatutDemande = 'nouvelle' | 'en_cours' | 'traitee';

export const LIBELLE_DEMANDE: Record<TypeDemande, string> = {
  recommande: 'Recommander',
  livraison: 'Livraison / retrait',
  question: 'Question',
};

export const LIBELLE_STATUT_DEMANDE: Record<StatutDemande, string> = {
  nouvelle: 'Envoyée',
  en_cours: 'Prise en charge',
  traitee: 'Traitée',
};

export type DemandeSaisie = {
  type: TypeDemande;
  commandes?: string[];
  quantite?: number;
  mode?: 'livraison' | 'retrait';
  dateSouhaitee?: string;
  message?: string;
};

export type DemandeEnregistree = DemandeSaisie & {
  id: string;
  clientName: string;
  clientUid: string;
  statut: StatutDemande;
  creeLe: string;
  reponse?: string;
  /** Dernier changement, quel qu'il soit (statut ou réponse) — ISO. */
  majLe?: string;
  /** Dernière fois que la RÉPONSE a été écrite ou modifiée — ISO. Absent tant qu'on n'a pas répondu. */
  reponduLe?: string;
  /** Rappel lisible des commandes concernées (nom, quantité) au moment de la demande. */
  resume?: string[];
};

const MAX_MESSAGE = 1000;
const MAX_COMMANDES = 50;

/**
 * Vérifie et nettoie une demande reçue du navigateur. `commandesDuClient` :
 * identifiants que CE client a le droit de citer — toute autre référence est
 * refusée (on ne demande pas la livraison des commandes d'un autre).
 */
export function validerDemande(brut: any, commandesDuClient: Set<string>): { ok: true; demande: DemandeSaisie } | { ok: false; erreur: string } {
  const type = brut?.type;
  if (type !== 'recommande' && type !== 'livraison' && type !== 'question') return { ok: false, erreur: 'Type de demande inconnu' };

  const commandes: string[] = Array.isArray(brut?.commandes) ? brut.commandes.map((c: unknown) => String(c)).slice(0, MAX_COMMANDES) : [];
  if (commandes.some(c => !commandesDuClient.has(c))) return { ok: false, erreur: 'Commande inconnue' };

  const message = typeof brut?.message === 'string' ? brut.message.trim().slice(0, MAX_MESSAGE) : '';
  const demande: DemandeSaisie = { type };
  if (commandes.length) demande.commandes = commandes;
  if (message) demande.message = message;

  if (type === 'recommande') {
    if (commandes.length !== 1) return { ok: false, erreur: 'Choisissez le produit à recommander' };
    const q = Number(brut?.quantite);
    if (!Number.isFinite(q) || q <= 0 || q > 1e7) return { ok: false, erreur: 'Quantité invalide' };
    demande.quantite = Math.round(q * 100) / 100;
  }
  if (type === 'livraison') {
    if (!commandes.length) return { ok: false, erreur: 'Choisissez au moins une commande' };
    if (brut?.mode !== 'livraison' && brut?.mode !== 'retrait') return { ok: false, erreur: 'Livraison ou retrait ?' };
    demande.mode = brut.mode;
    if (brut?.dateSouhaitee) {
      if (!/^\d{4}-\d{2}-\d{2}$/.test(String(brut.dateSouhaitee))) return { ok: false, erreur: 'Date invalide' };
      demande.dateSouhaitee = String(brut.dateSouhaitee);
    }
  }
  if (type === 'question' && !message) return { ok: false, erreur: 'Écrivez votre question' };
  return { ok: true, demande };
}
