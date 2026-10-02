// ─── D'où viennent les clients de la boutique ────────────────────────────────
// À la première page d'une visite, CaptureProvenance (src/components/shop) lit
// dans l'adresse les paramètres d'une publicité ou d'un lien partagé
// (utm_source, utm_medium, utm_campaign, ref), le domaine du site d'où vient le
// client, la page d'arrivée et la date. Ce navigateur garde la première source
// (sur 30 jours) et la dernière. Le checkout joint le tout à la commande
// (champ `provenance`), avec la langue du site et la réponse facultative à
// « Comment avez-vous connu LEBTEX ? ». L'admin l'affiche dans la fiche.
//
// Rien de personnel : aucun autre paramètre de l'adresse, le domaine du site
// d'origine seulement (jamais sa page), et un identifiant dans le chemin
// d'arrivée (n° de commande…) est masqué.
//
// Fonctions pures, plus les accès au stockage du navigateur (try/catch chacun).

import type { ConnuPar, ProvenanceCommande, SourceVisite } from './shop-types';
import type { Language } from './translations';

const CLE_PROVENANCE = 'lebtex_provenance_v1';
/** Dans sessionStorage : la visite (cet onglet) a déjà eu sa première page. */
const CLE_VISITE = 'lebtex_visite_v1';
const TRENTE_JOURS_MS = 30 * 24 * 3600_000;

/** Les réponses à « Comment avez-vous connu LEBTEX ? », dans l'ordre de la liste. */
export const CHOIX_CONNU_PAR: { valeur: ConnuPar; fr: string; ar: string }[] = [
  { valeur: 'facebook_instagram', fr: 'Facebook ou Instagram', ar: 'فيسبوك أو إنستغرام' },
  { valeur: 'whatsapp', fr: 'Statut ou groupe WhatsApp', ar: 'حالة أو مجموعة واتساب' },
  { valeur: 'google', fr: 'Google', ar: 'غوغل' },
  { valeur: 'tiktok', fr: 'TikTok', ar: 'تيك توك' },
  { valeur: 'ami_collegue', fr: 'Un ami ou un collègue', ar: 'صديق أو زميل' },
  { valeur: 'client_magasin', fr: 'Déjà client en magasin', ar: 'زبون سابق في المحل' },
  { valeur: 'autre', fr: 'Autre', ar: 'أخرى' },
];

export function connuParValide(v: unknown): ConnuPar | undefined {
  return CHOIX_CONNU_PAR.find(c => c.valeur === v)?.valeur;
}

/** Libellé français d'une réponse (fiche de l'admin). */
export function libelleConnuPar(v: unknown): string | undefined {
  return CHOIX_CONNU_PAR.find(c => c.valeur === v)?.fr;
}

/** Texte court : une ligne, `max` caractères au plus ; vide ou autre chose qu'un texte → undefined. */
function propre(v: unknown, max = 100): string | undefined {
  if (typeof v !== 'string') return undefined;
  const s = v.replace(/[\u0000-\u001f\u007f]+/g, ' ').replace(/\s+/g, ' ').trim().slice(0, max);
  return s || undefined;
}

/**
 * Domaine du site d'où vient le client, sans « www. » ni les préfixes mobiles (« l.facebook.com »
 * → « facebook.com ») ; une appli Android donne son nom (« com.facebook.katana »). Rien si c'est
 * lebtex.ma ou le site lui-même.
 */
export function domaineReferent(referrer: string, hoteDuSite = ''): string | undefined {
  try {
    const u = new URL(referrer);
    if (u.protocol === 'android-app:') return u.hostname.toLowerCase().slice(0, 100) || undefined;
    if (u.protocol !== 'https:' && u.protocol !== 'http:') return undefined;
    const hote = u.hostname.toLowerCase().replace(/^(www|m|l|lm|mobile)\./, '');
    if (!hote || hote === 'lebtex.ma' || hote.endsWith('.lebtex.ma')) return undefined;
    if (hoteDuSite && hote === hoteDuSite.toLowerCase().replace(/^www\./, '')) return undefined;
    return hote.slice(0, 100);
  } catch {
    return undefined;
  }
}

/**
 * Chemin de la page d'arrivée, sans paramètres ni ancre. Un identifiant de document
 * (20 caractères ou plus, lettres et chiffres, comme un n° de commande) devient « :id ».
 */
export function cheminArrivee(pathname: string): string {
  const chemin = String(pathname || '/')
    .split('/')
    .map(s => (/^[A-Za-z0-9]{20,}$/.test(s) && /\d/.test(s) ? ':id' : s))
    .join('/');
  return (chemin || '/').slice(0, 200);
}

/** La source de la visite qui commence, lue dans l'adresse de la page et le référent. */
export function sourceDeLaVisite(href: string, referrer: string, maintenant: number): SourceVisite {
  let url: URL | null = null;
  try {
    url = new URL(href);
  } catch {
    url = null;
  }
  const source: SourceVisite = {};
  const parametres = [
    ['utmSource', 'utm_source'],
    ['utmMedium', 'utm_medium'],
    ['utmCampaign', 'utm_campaign'],
    ['ref', 'ref'],
  ] as const;
  for (const [cle, nom] of parametres) {
    const v = propre(url?.searchParams.get(nom));
    if (v) source[cle] = v;
  }
  const referent = domaineReferent(referrer, url?.hostname);
  if (referent) source.referent = referent;
  source.arrivee = cheminArrivee(url?.pathname ?? '/');
  source.le = new Date(maintenant).toISOString();
  return source;
}

/** Visite venue de quelque part (publicité, lien marqué, autre site), et non un accès direct. */
export function sourceConnue(s?: SourceVisite): boolean {
  return !!(s && (s.utmSource || s.utmMedium || s.utmCampaign || s.ref || s.referent));
}

/** Une source relue (stockage du navigateur ou commande) : seulement des textes connus, jamais undefined. */
export function sourceVisiteLue(v: unknown): SourceVisite | undefined {
  if (!v || typeof v !== 'object' || Array.isArray(v)) return undefined;
  const o = v as Record<string, unknown>;
  const s: SourceVisite = {};
  const champs = ['utmSource', 'utmMedium', 'utmCampaign', 'ref', 'referent'] as const;
  for (const c of champs) {
    const t = propre(o[c]);
    if (t) s[c] = t;
  }
  const arrivee = propre(o.arrivee, 200);
  if (arrivee) s.arrivee = arrivee;
  const le = propre(o.le, 40);
  if (le && Number.isFinite(Date.parse(le))) s.le = le;
  return Object.keys(s).length > 0 ? s : undefined;
}

export interface ProvenanceStockee {
  premiere?: SourceVisite;
  derniere?: SourceVisite;
}

/**
 * Ce qu'on garde après une nouvelle visite : la première source tant qu'elle a moins
 * de 30 jours (sinon cette visite la remplace) ; la dernière visite venue de quelque
 * part. Un accès direct (favori, adresse tapée) n'efface pas la dernière source.
 */
export function fusionnerProvenance(
  avant: ProvenanceStockee | null,
  visite: SourceVisite,
  maintenant: number,
): ProvenanceStockee {
  const premiere = avant?.premiere;
  const datePremiere = Date.parse(premiere?.le ?? '');
  const garderPremiere = !!premiere && Number.isFinite(datePremiere) && maintenant - datePremiere < TRENTE_JOURS_MS;
  const resultat: ProvenanceStockee = { premiere: garderPremiere ? premiere : visite };
  const derniere = sourceConnue(visite) || !avant?.derniere ? visite : avant.derniere;
  if (derniere) resultat.derniere = derniere;
  return resultat;
}

/** Le champ `provenance` de la commande : un objet simple, sans undefined (Firestore les refuse). */
export function provenanceCommande(
  stockee: ProvenanceStockee | null,
  langue: Language,
  connuPar?: unknown,
): ProvenanceCommande {
  const p: ProvenanceCommande = { langue: langue === 'ar' ? 'ar' : 'fr' };
  const premiere = sourceVisiteLue(stockee?.premiere);
  if (premiere) p.premiere = premiere;
  const derniere = sourceVisiteLue(stockee?.derniere);
  if (derniere) p.derniere = derniere;
  const reponse = connuParValide(connuPar);
  if (reponse) p.connuPar = reponse;
  return p;
}

/** La provenance d'une commande relue (écrite par le navigateur du client : tout est vérifié). */
export function provenanceLue(v: unknown): ProvenanceCommande | undefined {
  if (!v || typeof v !== 'object' || Array.isArray(v)) return undefined;
  const o = v as Record<string, unknown>;
  const p = provenanceCommande({ premiere: sourceVisiteLue(o.premiere), derniere: sourceVisiteLue(o.derniere) }, o.langue === 'ar' ? 'ar' : 'fr', o.connuPar);
  // Rien d'autre que la langue par défaut : pas de provenance à montrer.
  return p.premiere || p.derniere || p.connuPar || o.langue === 'ar' || o.langue === 'fr' ? p : undefined;
}

// ─── Stockage dans le navigateur ─────────────────────────────────────────────

export function lireProvenanceStockee(): ProvenanceStockee | null {
  try {
    const brut = localStorage.getItem(CLE_PROVENANCE);
    if (!brut) return null;
    const v = JSON.parse(brut) as Record<string, unknown> | null;
    const premiere = sourceVisiteLue(v?.premiere);
    const derniere = sourceVisiteLue(v?.derniere);
    return premiere || derniere ? { ...(premiere ? { premiere } : {}), ...(derniere ? { derniere } : {}) } : null;
  } catch {
    return null;
  }
}

/**
 * À appeler une fois par chargement de page. Ne garde que la première page d'une visite
 * (cet onglet) ; plus tard dans la visite, seulement une arrivée venue de quelque part
 * (nouveau lien de publicité, retour depuis un autre site).
 */
export function capturerVisite(): void {
  if (typeof window === 'undefined') return;
  const maintenant = Date.now();
  const visite = sourceDeLaVisite(window.location.href, document.referrer || '', maintenant);
  let dejaVue = false;
  try {
    dejaVue = sessionStorage.getItem(CLE_VISITE) === '1';
  } catch { /* stockage refusé : chaque chargement compte comme une visite */ }
  try {
    sessionStorage.setItem(CLE_VISITE, '1');
  } catch { /* idem */ }
  if (dejaVue && !sourceConnue(visite)) return;
  try {
    localStorage.setItem(CLE_PROVENANCE, JSON.stringify(fusionnerProvenance(lireProvenanceStockee(), visite, maintenant)));
  } catch { /* navigation privée, quota : la commande partira sans provenance */ }
}
