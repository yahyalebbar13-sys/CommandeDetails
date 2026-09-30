/**
 * La page ouverte n'est plus celle qui est en ligne.
 *
 * Le logiciel est découpé en morceaux que le navigateur va chercher au moment où il en a besoin :
 * la fabrique de PDF, par exemple, n'est téléchargée qu'au premier clic sur « Imprimer ». Chaque
 * mise en ligne renomme ces morceaux. Un poste de caisse qui reste ouvert toute la journée garde
 * donc en mémoire les noms de la version du matin, et le premier PDF demandé après une mise en
 * ligne part chercher un fichier qui n'existe plus.
 *
 * Le message qui en sortait — « Loading chunk 8911 failed » suivi d'une URL — ne dit rien à
 * personne, et surtout pas quoi faire. Or il n'y a rien de cassé : il suffit de recharger.
 */

const MESSAGES = [
  'loading chunk',
  'chunkloaderror',
  'failed to fetch dynamically imported module',
  'error loading dynamically imported module',
  'importing a module script failed',
];

/** Cette erreur vient-elle d'un morceau du logiciel devenu introuvable ? */
export function estVersionPerimee(e: any): boolean {
  const texte = `${e?.name || ''} ${e?.message || ''}`.toLowerCase();
  return MESSAGES.some(m => texte.includes(m));
}

/** Ce qu'on dit à l'utilisateur : ce qui se passe, et ce qu'il va se passer. */
export const MESSAGE_VERSION_PERIMEE =
  'Une nouvelle version du logiciel a été mise en ligne pendant que cette page était ouverte. '
  + 'Elle se recharge toute seule — rien n’est perdu, recommencez juste après.';

/**
 * Recharge la page, UNE fois.
 *
 * Le garde-fou compte : si la nouvelle version échouait elle aussi, un rechargement automatique
 * enfermerait le poste de caisse dans une boucle. Au second échec dans la même session, on
 * s'arrête et on laisse la main.
 */
export function rechargerUneFois(): boolean {
  if (typeof window === 'undefined') return false;
  const CLE = 'lebtex:rechargement-version';
  try {
    if (window.sessionStorage.getItem(CLE)) return false;
    window.sessionStorage.setItem(CLE, String(Date.now()));
  } catch {
    // Navigation privée, stockage bloqué : on recharge quand même, une boucle reste improbable
    // et vaut mieux qu'un écran définitivement bloqué.
  }
  window.setTimeout(() => window.location.reload(), 1500);
  return true;
}

/**
 * À appeler dans le `catch` d'une action qui charge un morceau du logiciel — un export PDF, une
 * impression. Renvoie le message à afficher, et déclenche le rechargement quand il y a lieu.
 */
export function messageSiVersionPerimee(e: any): string | null {
  if (!estVersionPerimee(e)) return null;
  rechargerUneFois();
  return MESSAGE_VERSION_PERIMEE;
}
