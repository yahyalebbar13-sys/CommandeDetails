// Compteurs anonymes de la boutique : savoir à quelle étape les visiteurs s'arrêtent
// (fiche vue → ajout au panier → panier ouvert → formulaire de commande → commande),
// sans rien savoir d'eux. On compte, par jour (heure du Maroc), des événements : jamais
// qui, ni d'où, ni quel produit. Aucune donnée personnelle, aucun identifiant, aucun cookie.
//
// Le navigateur envoie seulement le nom de l'événement à /api/shop/compteur, qui ajoute 1
// dans shop_compteurs/{AAAA-MM-JJ} : un document qu'aucune règle Firestore n'ouvre, lu et
// écrit par le serveur seul. L'administrateur voit les totaux dans /admin-shop (tableau de bord).
// Les commandes passées ne sont pas comptées ici : l'admin les a déjà (shop_orders).

export const EVENEMENTS = [
  'vue_produit',       // fiche produit ouverte
  'ajout_panier',      // bouton « Ajouter au panier » (plusieurs couleurs d'un coup = 1)
  'ouverture_panier',  // tiroir du panier ouvert, ou page /shop/panier
  'arrivee_commande',  // page du formulaire de commande (/shop/checkout)
  'clic_whatsapp',     // lien ou bouton qui ouvre WhatsApp
] as const;

export type Evenement = (typeof EVENEMENTS)[number];

export const ROUTE_COMPTEUR = '/api/shop/compteur';
export const COLLECTION_COMPTEURS = 'shop_compteurs';

export function estEvenement(v: unknown): v is Evenement {
  return typeof v === 'string' && (EVENEMENTS as readonly string[]).includes(v);
}

// ─── Jours ──────────────────────────────────────────────────────────────────

// Heure du Maroc (Africa/Casablanca : UTC+1, UTC+0 pendant le ramadan). Créé à la première
// utilisation (route et admin) : ce fichier est chargé sur toutes les pages de la boutique, et un
// navigateur qui ne connaît pas ce fuseau ne doit pas faire tomber le panier.
let formatJour: Intl.DateTimeFormat | null = null;

// « AAAA-MM-JJ » du jour au Maroc
export function jourMaroc(date: Date = new Date()): string {
  formatJour ??= new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Africa/Casablanca',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  });
  const parties = formatJour.formatToParts(date);
  const v = (type: string) => parties.find(p => p.type === type)?.value ?? '';
  return `${v('year')}-${v('month')}-${v('day')}`;
}

// Les n derniers jours, aujourd'hui compris, du plus récent au plus ancien
export function derniersJours(aujourdhui: string, n: number): string[] {
  const [a, m, j] = aujourdhui.split('-').map(Number);
  return Array.from({ length: n }, (_, i) => new Date(Date.UTC(a, m - 1, j - i)).toISOString().slice(0, 10));
}

// ─── Ce qui se compte, côté navigateur ──────────────────────────────────────

// Arrivée sur une page : page panier, formulaire de commande. La fiche produit n'est pas
// comptée d'après l'adresse (un vieux lien vers un produit retiré finit en 404) : elle l'est
// par son layout, une fois le produit trouvé (CompteVueProduit).
export function evenementDuChemin(chemin: string): Evenement | null {
  if (/^\/shop\/panier\/?$/.test(chemin)) return 'ouverture_panier';
  if (/^\/shop\/checkout\/?$/.test(chemin)) return 'arrivee_commande';
  return null;
}

// Adresse qui ouvre une conversation WhatsApp avec un numéro (celui de LEBTEX : wa.me/212…) :
// wa.me/<numéro>, api.whatsapp.com/send?phone=…, whatsapp://send?phone=…
// Pas un partage sans destinataire (« Envoyer à un collègue » : wa.me/?text=…) : il ne contacte pas LEBTEX.
export function estLienWhatsApp(adresse: unknown): boolean {
  if (typeof adresse !== 'string') return false;
  const a = adresse.trim();
  return (
    /^(?:https?:)?\/\/(?:www\.)?wa\.me\/\+?\d/i.test(a) ||
    /^(?:https?:)?\/\/(?:api|web)\.whatsapp\.com\/send\/?\?(?:[^#]*&)?phone=\+?\d/i.test(a) ||
    /^whatsapp:\/\/send\/?\?(?:[^#]*&)?phone=\+?\d/i.test(a)
  );
}

// Le vrai site seulement (lebtex.ma, www.lebtex.ma) : ni en local (next dev), ni sur une
// prévisualisation Vercel (*.vercel.app), qui écrirait sinon dans les compteurs de production.
export function estSiteEnLigne(hote: string): boolean {
  return /(?:^|\.)lebtex\.ma$/i.test(hote);
}

// Robots (Google qui affiche la page, tests automatiques) : pas comptés. Pas un simple « bot » :
// les téléphones CUBOT l'ont dans leur nom.
const ROBOT = /\bbot\b|googlebot|bingbot|applebot|petalbot|yandex|baidu|ahrefs|semrush|facebookexternalhit|crawler|spider|slurp|lighthouse|headless/i;

// Envoie l'événement sans jamais gêner la page : rien n'est attendu, toute erreur est ignorée.
// sendBeacon part même si la page se ferme (clic WhatsApp) ; sinon fetch keepalive.
// Hors du vrai site (next dev, prévisualisation Vercel), rien ne part : on l'écrit seulement dans la console.
export function compter(evenement: Evenement): void {
  try {
    if (typeof window === 'undefined') return;
    if (!estSiteEnLigne(window.location.hostname)) {
      console.debug('[compteur]', evenement);
      return;
    }
    if (navigator.webdriver || ROBOT.test(navigator.userAgent || '')) return;
    const corps = JSON.stringify({ evenement });
    if (typeof navigator.sendBeacon === 'function' && navigator.sendBeacon(ROUTE_COMPTEUR, corps)) return;
    fetch(ROUTE_COMPTEUR, { method: 'POST', body: corps, keepalive: true, headers: { 'Content-Type': 'text/plain' } })
      .catch(() => {});
  } catch {
    /* jamais bloquant */
  }
}

// ─── Lecture, côté administrateur ───────────────────────────────────────────

export type ComptesJour = Partial<Record<Evenement, number>>;
export type JourCompte = { jour: string; comptes: ComptesJour };

// Seulement les compteurs connus, en nombres entiers positifs
export function comptesDe(donnees: unknown): ComptesJour {
  const d = (donnees ?? {}) as Record<string, unknown>;
  const comptes: ComptesJour = {};
  for (const e of EVENEMENTS) {
    const n = Number(d[e]);
    if (Number.isFinite(n) && n > 0) comptes[e] = Math.floor(n);
  }
  return comptes;
}

export interface Periode {
  evenements: Record<Evenement, number>;
  // Commandes passées sur la période (shop_orders)…
  commandes: number;
  // …et seulement les jours où les compteurs tournaient : pour le taux commandes / formulaire,
  // sinon les commandes d'avant la mise en route des compteurs le fausseraient
  commandesJoursMesures: number;
}

export function resumerPeriode(jours: JourCompte[], commandesParJour: Record<string, number>): Periode {
  const evenements = Object.fromEntries(EVENEMENTS.map(e => [e, 0])) as Record<Evenement, number>;
  let commandes = 0;
  let commandesJoursMesures = 0;
  for (const { jour, comptes } of jours) {
    let mesure = false;
    for (const e of EVENEMENTS) {
      evenements[e] += comptes[e] || 0;
      if (comptes[e]) mesure = true;
    }
    commandes += commandesParJour[jour] || 0;
    if (mesure) commandesJoursMesures += commandesParJour[jour] || 0;
  }
  return { evenements, commandes, commandesJoursMesures };
}

// Pourcentage arrondi, ou null quand il n'y a rien à diviser
export function taux(nombre: number, sur: number): number | null {
  return sur > 0 ? Math.round((nombre / sur) * 100) : null;
}
