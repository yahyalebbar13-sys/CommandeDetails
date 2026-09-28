// ─── Connexion à l'espace équipe : ce qui se décide sans Firebase ────────────
// Qui a le droit d'entrer, comment lire ce qu'on a tapé, et ce qu'on dit à
// l'employé quand ça ne marche pas. Pur (ni React ni Firebase) : testable seul.

import { ADMIN_EMAIL } from '@/lib/constants';
import { identifiantDeEmail, identifiantValide, normaliserIdentifiant, REGLE_IDENTIFIANT } from '@/lib/acces-equipe';

export type RoleEquipe = 'admin' | 'staff';

/** Message affiché au-dessus du formulaire de connexion. */
export interface MessageConnexion {
  ton: 'erreur' | 'info';
  texte: string;
}

export const MESSAGE_PAS_INTERNET =
  'Pas de connexion Internet. Vérifiez le Wi-Fi ou les données mobiles, puis réessayez.';
export const MESSAGE_SANS_ACCES =
  "Ce compte n'a pas accès à l'espace équipe. Connectez-vous avec le nom d'utilisateur de l'équipe.";
export const MESSAGE_ACCES_DESACTIVE = "Cet accès a été désactivé par l'administrateur.";
export const MESSAGE_SESSION_TERMINEE =
  'Votre session a pris fin (mot de passe changé ou accès modifié). Reconnectez-vous.';
/** Session disparue sans raison connue (autre onglet, session effacée au chargement). */
export const MESSAGE_DECONNECTE_AILLEURS =
  'Vous avez été déconnecté (session terminée ou accès modifié). Reconnectez-vous pour continuer.';

/** Code d'erreur Firebase (« auth/… »), ou '' s'il n'y en a pas. */
export function codeErreur(e: unknown): string {
  const code = (e as { code?: unknown } | null)?.code;
  return typeof code === 'string' ? code : '';
}

/**
 * Le patron (ADMIN_EMAIL) peut ouvrir l'espace pour voir ce que voit l'équipe ;
 * sinon il faut le badge « staff » posé par le serveur sur le compte équipe.
 * Le serveur revérifie tout à chaque action : ceci ne décide que de l'affichage.
 */
export function roleDepuisJeton(email: string | null | undefined, claims: Record<string, unknown>): RoleEquipe | null {
  if (typeof email === 'string' && email.trim().toLowerCase() === ADMIN_EMAIL.toLowerCase()) return 'admin';
  if (claims?.staff === true) return 'staff';
  return null;
}

/**
 * Un compte sans accès est connecté. Toutes les parties du site (gestion, stock,
 * compte client, admin) partagent UNE session par navigateur : déconnecter
 * d'office couperait le travail d'un autre onglet. On ne le fait que pour un
 * compte du domaine de l'équipe, qui ne peut venir que du formulaire de /staff.
 */
export function reactionSansAcces(email: string | null | undefined): 'deconnecter' | 'autre_compte' {
  return identifiantDeEmail(typeof email === 'string' ? email : '') !== null ? 'deconnecter' : 'autre_compte';
}

export type SaisieConnexion =
  | { ok: true; identifiant: string }
  | { ok: false; champ: 'identifiant' | 'motDePasse'; texte: string };

/**
 * Ce que l'employé a tapé → le nom d'utilisateur à envoyer, ou ce qu'il faut corriger.
 * Majuscules et espaces autour sont tolérés (clavier de téléphone). L'e-mail
 * technique du compte équipe est accepté aussi (gestionnaire de mots de passe).
 */
export function verifierSaisie(identifiantTape: string, motDePasse: string): SaisieConnexion {
  let identifiant = normaliserIdentifiant(identifiantTape);
  if (!identifiant) return { ok: false, champ: 'identifiant', texte: "Tapez votre nom d'utilisateur." };
  if (identifiant.includes('@')) {
    const deEmail = identifiantDeEmail(identifiant);
    if (!deEmail) {
      return { ok: false, champ: 'identifiant', texte: "Tapez le nom d'utilisateur donné par l'administrateur, pas une adresse e-mail." };
    }
    identifiant = deEmail;
  }
  if (!identifiantValide(identifiant)) {
    return {
      ok: false,
      champ: 'identifiant',
      texte: `Nom d'utilisateur mal écrit. Règle : ${REGLE_IDENTIFIANT}`,
    };
  }
  if (!motDePasse) return { ok: false, champ: 'motDePasse', texte: 'Tapez le mot de passe.' };
  return { ok: true, identifiant };
}

/**
 * Refus de Firebase à la connexion → phrase pour l'employé. On ne dit jamais
 * lequel des deux est faux (nom d'utilisateur ou mot de passe) : ce serait
 * aider quelqu'un qui essaie de deviner.
 */
export function messageErreurConnexion(code: string): { texte: string; identifiantsIncorrects: boolean } {
  switch (code) {
    case 'auth/invalid-credential':
    case 'auth/invalid-login-credentials':
    case 'auth/wrong-password':
    case 'auth/user-not-found':
    case 'auth/invalid-email':
    case 'auth/missing-password':
      return { texte: "Nom d'utilisateur ou mot de passe incorrect.", identifiantsIncorrects: true };
    case 'auth/too-many-requests':
      return { texte: "Trop d'essais de connexion. Patientez quelques minutes, puis réessayez.", identifiantsIncorrects: false };
    case 'auth/user-disabled':
      return { texte: MESSAGE_ACCES_DESACTIVE, identifiantsIncorrects: false };
    case 'auth/network-request-failed':
    case 'auth/timeout':
      return { texte: MESSAGE_PAS_INTERNET, identifiantsIncorrects: false };
    case 'auth/operation-not-allowed':
      return { texte: "La connexion par mot de passe n'est pas activée sur le site. Prévenez l'administrateur.", identifiantsIncorrects: false };
    default:
      return {
        texte: `La connexion n'a pas abouti. Réessayez dans un instant${code ? ` (code : ${code})` : ''}.`,
        identifiantsIncorrects: false,
      };
  }
}

/**
 * Échec de la vérification d'une session déjà ouverte (jeton rafraîchi) :
 *   desactive / session → on déconnecte et on explique ;
 *   reseau → on attend le réseau, sans déconnecter ;
 *   autre → on propose de réessayer.
 */
export function classerErreurVerification(code: string): 'desactive' | 'session' | 'reseau' | 'autre' {
  switch (code) {
    case 'auth/user-disabled':
      return 'desactive';
    case 'auth/user-token-expired':
    case 'auth/invalid-user-token':
    case 'auth/user-not-found':
    case 'auth/requires-recent-login':
      return 'session';
    case 'auth/network-request-failed':
    case 'auth/timeout':
      return 'reseau';
    default:
      return 'autre';
  }
}

/** Ce qu'on affiche du compte connecté (en-tête, fenêtre « Compte »). */
export interface CompteAffiche {
  role: RoleEquipe;
  /** « Compte équipe » ou « Administrateur ». */
  titre: string;
  /** Le nom d'utilisateur (équipe) ou l'adresse (administrateur). */
  detail: string;
  initiale: string;
}

export function compteAffiche(role: RoleEquipe, email: string | null | undefined): CompteAffiche {
  const adresse = typeof email === 'string' ? email.trim().toLowerCase() : '';
  if (role === 'admin') {
    return { role, titre: 'Administrateur', detail: adresse, initiale: (adresse.charAt(0) || 'A').toUpperCase() };
  }
  // L'e-mail technique (…@equipe.lebtex.ma) n'est jamais montré : seulement le nom d'utilisateur.
  const identifiant = identifiantDeEmail(adresse) ?? (adresse.split('@')[0] || 'équipe');
  return { role, titre: 'Compte équipe', detail: identifiant, initiale: (identifiant.charAt(0) || 'E').toUpperCase() };
}
