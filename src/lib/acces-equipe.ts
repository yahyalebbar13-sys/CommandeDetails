// ─── Accès de l'équipe (espace /staff) : identifiant et mot de passe ─────────
// Pur (navigateur + serveur) : aucune dépendance à Firebase ni à Next.
//
// L'équipe partage UN compte. On se connecte avec un NOM D'UTILISATEUR, pas
// avec un e-mail : Firebase Auth, lui, exige un e-mail. On en fabrique donc un
// sur un sous-domaine sans boîte mail (equipe.lebtex.ma) — aucun message ne
// peut y arriver, et c'est le même calcul à la connexion (écran /staff) et à la
// création du compte (route /api/admin/acces-equipe).
//
// Testé par scripts/test-acces-equipe.ts.

/** Domaine factice des comptes équipe : aucune boîte mail derrière. */
export const DOMAINE_EQUIPE = 'equipe.lebtex.ma';

/** Longueur minimale du mot de passe de l'équipe. */
export const MOT_DE_PASSE_MIN = 8;
/** Au-delà, c'est sans doute un collage accidentel (et Firebase a sa propre limite). */
export const MOT_DE_PASSE_MAX = 100;

// Lettres minuscules sans accent, chiffres, point, tiret, tiret bas ; 3 à 30
// caractères ; commence par une lettre ou un chiffre. Sans accent parce que la
// partie locale de l'e-mail fabriqué doit rester simple, et parce qu'un
// téléphone tape « e » ou « é » selon le clavier : on préfère refuser à la
// création que laisser l'équipe bloquée à la connexion.
const MOTIF_IDENTIFIANT = /^[a-z0-9][a-z0-9._-]{2,29}$/;

/**
 * La règle ci-dessus, en français simple : un seul texte pour l'écran « Accès
 * équipe » du patron, l'écran de connexion de l'équipe et les refus du serveur,
 * pour que tous disent la même chose.
 */
export const REGLE_IDENTIFIANT =
  '3 à 30 caractères, sans espace ni accent : lettres, chiffres, point, tiret ou tiret bas ; commence par une lettre ou un chiffre.';

/**
 * Événement du navigateur lancé quand une route de l'équipe répond 401/403 :
 * l'espace /staff revérifie alors la session tout de suite (mot de passe
 * changé, accès désactivé) au lieu d'attendre le prochain renouvellement du
 * jeton. Sans espace /staff ouvert, personne ne l'écoute : sans effet.
 */
export const EVENEMENT_ACCES_REFUSE = 'lebtex:acces-equipe-refuse';

/** Tel que tapé → forme enregistrée : sans espaces autour, en minuscules. */
export function normaliserIdentifiant(v: unknown): string {
  return typeof v === 'string' ? v.trim().toLowerCase() : '';
}

/** L'identifiant (déjà normalisé) est-il acceptable ? */
export function identifiantValide(v: string): boolean {
  return typeof v === 'string' && MOTIF_IDENTIFIANT.test(v);
}

/**
 * Pourquoi l'identifiant (déjà normalisé) est refusé, en français simple ;
 * null s'il est bon. Sert à l'écran « Accès équipe » et aux erreurs de la route.
 */
export function problemeIdentifiant(v: string): string | null {
  if (identifiantValide(v)) return null;
  if (!v) return "Choisissez un nom d'utilisateur.";
  if (v.length < 3) return "Le nom d'utilisateur doit faire au moins 3 caractères.";
  if (v.length > 30) return "Le nom d'utilisateur doit faire 30 caractères au plus.";
  if (/\s/.test(v)) return "Le nom d'utilisateur ne doit pas contenir d'espace.";
  if (/[^\x00-\x7f]/.test(v)) return "Le nom d'utilisateur ne doit pas contenir d'accent (écrivez e au lieu de é, par exemple).";
  if (!/^[a-z0-9]/.test(v)) return "Le nom d'utilisateur doit commencer par une lettre ou un chiffre.";
  return "Le nom d'utilisateur ne peut contenir que des lettres, des chiffres, le point, le tiret et le tiret bas.";
}

/** L'e-mail Firebase du compte équipe (jamais montré à l'équipe). */
export function emailEquipe(identifiant: string): string {
  return `${normaliserIdentifiant(identifiant)}@${DOMAINE_EQUIPE}`;
}

/**
 * Prévient l'espace /staff qu'une route vient de refuser l'accès (401/403).
 * Côté serveur (pas de window), ne fait rien.
 */
export function signalerAccesRefuse(statut: number): void {
  if (typeof window === 'undefined' || typeof CustomEvent === 'undefined') return;
  try {
    window.dispatchEvent(new CustomEvent(EVENEMENT_ACCES_REFUSE, { detail: { statut } }));
  } catch { /* navigateur très ancien : l'espace revérifiera à son prochain contrôle */ }
}

/** Inverse de emailEquipe : l'identifiant, ou null si l'e-mail n'est pas un compte équipe. */
export function identifiantDeEmail(email: string): string | null {
  if (typeof email !== 'string') return null;
  const e = email.trim().toLowerCase();
  const suffixe = `@${DOMAINE_EQUIPE}`;
  if (!e.endsWith(suffixe)) return null;
  const identifiant = e.slice(0, -suffixe.length);
  return identifiantValide(identifiant) ? identifiant : null;
}

// Mots que l'on essaie en premier pour deviner un mot de passe : le nom de la
// société, du pays, les suites de clavier. Suivis de chiffres ou de symboles,
// ils restent aussi faciles à deviner.
const MOTS_TROP_COURANTS = new Set([
  'password', 'motdepasse', 'azerty', 'azertyuiop', 'qwerty', 'qwertyuiop', 'abcdef', 'abcdefgh',
  'lebtex', 'lebtexsarl', 'lebtexsarlau', 'equipe', 'staff', 'admin', 'administrateur', 'magasin',
  'boutique', 'tissu', 'tissus', 'bonjour', 'soleil', 'maroc', 'morocco', 'casablanca', 'casa', 'welcome',
]);

/** Toute la chaîne est une suite régulière (12345678, 87654321, abcdefgh…). */
function estUneSuite(v: string): boolean {
  if (v.length < 3) return false;
  const pas = v.charCodeAt(1) - v.charCodeAt(0);
  if (pas !== 1 && pas !== -1) return false;
  for (let i = 2; i < v.length; i++) {
    if (v.charCodeAt(i) - v.charCodeAt(i - 1) !== pas) return false;
  }
  return true;
}

/**
 * null si le mot de passe convient, sinon la raison en français simple.
 * `identifiant` (facultatif) : le mot de passe ne doit pas le contenir.
 *
 * Volontairement modeste : l'équipe doit pouvoir le retenir et le taper sur un
 * téléphone. On écarte seulement ce qu'un inconnu essaierait en premier.
 */
export function motDePasseAcceptable(v: string, identifiant?: string): string | null {
  if (typeof v !== 'string' || !v) return 'Choisissez un mot de passe.';
  if (v.length < MOT_DE_PASSE_MIN) return `Le mot de passe doit faire au moins ${MOT_DE_PASSE_MIN} caractères.`;
  if (v.length > MOT_DE_PASSE_MAX) return `Le mot de passe doit faire ${MOT_DE_PASSE_MAX} caractères au plus.`;
  // Un espace au bout ne se voit pas : l'équipe ne saurait pas qu'il faut le taper.
  if (v.trim() !== v) return 'Le mot de passe ne doit pas commencer ni finir par un espace.';

  const bas = v.toLowerCase();
  if (new Set(bas).size < 4) return 'Mot de passe trop simple : mélangez au moins 4 caractères différents.';
  if (estUneSuite(bas)) return 'Mot de passe trop simple : une suite comme 12345678 ou abcdefgh se devine tout de suite.';
  // Le mot courant seul, ou suivi/précédé de chiffres et de symboles (« lebtex2026! »).
  const lettres = bas.replace(/[^a-z]/g, '');
  const sansLettres = !/[a-z]/.test(bas);
  if (MOTS_TROP_COURANTS.has(lettres) || (sansLettres && estUneSuite(bas.replace(/[^0-9]/g, '')))) {
    return 'Mot de passe trop facile à deviner : évitez le nom de la société, les mots courants et les suites de chiffres.';
  }

  // Seulement pour un identifiant valable : « ab » se retrouverait partout.
  const id = normaliserIdentifiant(identifiant);
  if (identifiantValide(id) && bas.includes(id)) return "Le mot de passe ne doit pas contenir le nom d'utilisateur.";
  return null;
}
