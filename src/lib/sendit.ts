// ─── Sendit : le livreur des colis LEBTEX (client serveur) ───────────────────
// Serveur uniquement : les clés Sendit sont des secrets. Elles ne partent jamais
// dans le navigateur, ni dans une réponse, ni dans les journaux (on n'y écrit que
// le chemin appelé et le code de réponse).
//
// Branché mais en sommeil : tant que SENDIT_PUBLIC_KEY et SENDIT_PRIVATE_KEY ne
// sont pas posées sur Vercel, tout répond proprement « Sendit n'est pas encore
// branché » (senditConfigure() === false) et aucun appel ne part.
//
// API officielle (https://app.sendit.ma/api/documentation) :
//   POST /login {public_key, secret_key} → data.token (Bearer, gardé ~50 min,
//   une seule reconnexion sur un 401) ; GET /districts, /districts/pickup-cities,
//   /all-status-deliveries ; POST /deliveries ; GET /deliveries/{code} ;
//   POST /deliveries/getlabels ; POST /pickups. Webhook « delivery.status.update »
//   signé par X-Sendit-Signature (HMAC-SHA256 du corps brut).
//
// Décisions du patron appliquées ici : colis ni ouvert ni essayé avant paiement
// (allow_open 0, allow_try 0), étiquettes A4 (printFormat 0), ramassage au
// magasin de Derb Omar, jamais d'article volumineux, 3 000 DH d'espèces au plus
// par colis (au-delà : virement ou arrangement au téléphone), et rien à encaisser
// par le livreur quand l'administrateur a noté « paiement reçu ».
//
// Les fonctions pures (corps du colis, téléphone, contrôles, signature) sont
// testées par scripts/test-sendit.ts, sans aucun appel réseau.

import { createHash, createHmac, timingSafeEqual } from 'crypto';
import type { Firestore } from 'firebase-admin/firestore';
import type { CartItem, LieuRetrait, ModeReception, MoyenPaiement, OrderStatus, ShopOrder } from './shop-types';
import {
  PLAFOND_ESPECES_COLIS, messageClient, moyenPaiementDe, prixUnitaireLigne, receptionDe, telInternational, totalDesLignes, varianteLisible,
} from './commandes-boutique';
import { codeStatutSendit, decisionStatutSendit, libelleStatutSendit, type MentionSendit } from './sendit-statuts';
import { normaliserCommande } from '@/app/admin-shop/_commandes/normaliser-commande';

// ─── Configuration ────────────────────────────────────────────────────────────

const URL_API_DEFAUT = 'https://app.sendit.ma/api/v1';
/** Adresse à déclarer dans Sendit (menu API → Intégration Webhook). */
export const URL_WEBHOOK_SENDIT = 'https://www.lebtex.ma/api/webhooks/sendit';

export const MESSAGE_NON_CONFIGURE =
  'Sendit n’est pas encore branché : les clés SENDIT_PUBLIC_KEY et SENDIT_PRIVATE_KEY ne sont pas encore posées sur Vercel.';

function cles(): { publique: string; privee: string } | null {
  const publique = (process.env.SENDIT_PUBLIC_KEY || '').trim();
  const privee = (process.env.SENDIT_PRIVATE_KEY || '').trim();
  return publique && privee ? { publique, privee } : null;
}

/** Les deux clés sont posées : on peut parler à Sendit. */
export function senditConfigure(): boolean {
  return cles() !== null;
}

/** Un jeton de webhook trop court se devine : il ne compte pas comme posé. */
const LONGUEUR_MIN_JETON_WEBHOOK = 24;

/** Ce qui est posé sur le serveur (oui / non), jamais les valeurs. */
export function variablesSendit() {
  return {
    clePublique: !!(process.env.SENDIT_PUBLIC_KEY || '').trim(),
    clePrivee: !!(process.env.SENDIT_PRIVATE_KEY || '').trim(),
    secretWebhook: !!(process.env.SENDIT_WEBHOOK_SECRET || '').trim(),
    jetonWebhook: (process.env.SENDIT_WEBHOOK_TOKEN || '').trim().length >= LONGUEUR_MIN_JETON_WEBHOOK,
    ramassage: idRamassageVariable(),
  };
}

/**
 * Adresse de l'API. SENDIT_API_URL peut la changer, mais seulement vers un
 * domaine sendit.ma en https : les clés ne partent jamais ailleurs, même sur
 * une variable mal recopiée.
 */
function urlApi(): string {
  const v = (process.env.SENDIT_API_URL || '').trim().replace(/\/+$/, '');
  if (!v) return URL_API_DEFAUT;
  try {
    const u = new URL(v);
    if (u.protocol === 'https:' && (u.hostname === 'sendit.ma' || u.hostname.endsWith('.sendit.ma'))) return v;
  } catch { /* adresse illisible : la valeur par défaut */ }
  return URL_API_DEFAUT;
}

/** SENDIT_PICKUP_DISTRICT_ID (ville de ramassage choisie à la main), ou null. */
function idRamassageVariable(): number | null {
  const n = Number((process.env.SENDIT_PICKUP_DISTRICT_ID || '').trim());
  return Number.isInteger(n) && n > 0 ? n : null;
}

// ─── Erreurs ──────────────────────────────────────────────────────────────────

/**
 * - non_configure : clés absentes ;
 * - refus_cles    : Sendit refuse les clés ;
 * - refus         : Sendit refuse la demande (données, droits, trop de demandes) ;
 * - introuvable   : colis inconnu chez Sendit ;
 * - reseau / delai: pas de réponse. Pour une création, c'est « peut-être fait » ;
 * - reponse       : réponse inattendue (panne chez Sendit).
 */
export type NatureErreurSendit = 'non_configure' | 'refus_cles' | 'refus' | 'introuvable' | 'reseau' | 'delai' | 'reponse';

export class ErreurSendit extends Error {
  /** Échec avant que la création parte (connexion refusée ou en panne) : rien n'a pu être créé. */
  avantEnvoi = false;
  constructor(message: string, readonly nature: NatureErreurSendit, readonly statutHttp?: number) {
    super(message);
    this.name = 'ErreurSendit';
  }
  /** La demande est partie sans réponse : chez Sendit, c'est peut-être fait. */
  get sansReponse(): boolean {
    return this.nature === 'reseau' || this.nature === 'delai';
  }
  /**
   * Pour une création (colis, ramassage) : peut-être faite chez Sendit. En plus d'une
   * absence de réponse, une erreur de passerelle (502, 503, 504…) ou un 408 arrive
   * justement quand le serveur de Sendit a reçu la demande mais a répondu trop tard.
   * Seul un refus clair (4xx, ou « success: false ») permet de réessayer tout de suite.
   */
  get peutEtreFait(): boolean {
    if (this.avantEnvoi) return false;
    return this.sansReponse || (typeof this.statutHttp === 'number' && (this.statutHttp >= 500 || this.statutHttp === 408));
  }
}

/**
 * Réponse HTTP d'une erreur Sendit, selon qui la lit. L'équipe n'a accès ni à
 * Vercel ni aux clés : on lui dit quoi faire en attendant, l'administrateur
 * reçoit la marche à suivre.
 */
export function erreurSenditPour(e: unknown, role: 'admin' | 'staff'): { statut: number; message: string; extra: Record<string, unknown> } {
  if (!(e instanceof ErreurSendit)) {
    return { statut: 500, message: 'Erreur inattendue pendant l’échange avec Sendit. Réessayez.', extra: {} };
  }
  const pourEquipe = role === 'staff';
  switch (e.nature) {
    case 'non_configure':
      return {
        statut: 503,
        message: pourEquipe ? 'Sendit n’est pas encore branché sur le site : créez le colis sur app.sendit.ma en attendant.' : e.message,
        extra: { configure: false },
      };
    case 'refus_cles':
      return {
        statut: 502,
        message: pourEquipe ? 'Sendit refuse la connexion du site : prévenez l’administrateur. En attendant, passez par app.sendit.ma.' : e.message,
        extra: {},
      };
    case 'introuvable':
      return { statut: 404, message: e.message || 'Colis introuvable chez Sendit.', extra: {} };
    case 'refus':
      return { statut: 422, message: e.message, extra: {} };
    case 'reseau':
    case 'delai':
      return { statut: 504, message: e.message, extra: { sansReponse: true } };
    default:
      return { statut: 502, message: e.message, extra: {} };
  }
}

/** Texte court et propre venu de Sendit (jamais un objet, jamais des pages entières). */
function texteSendit(v: unknown, max = 300): string {
  return typeof v === 'string' ? v.replace(/\s+/g, ' ').trim().slice(0, max) : '';
}

/**
 * « 2026-09-29 16:05:05 » : l'heure de dernière action telle que Sendit l'écrit
 * dans le webhook. Remise à cette forme (un « T » ISO devient une espace) pour
 * que deux heures se comparent comme du texte ; autre chose → null.
 */
export function horodatageSendit(v: unknown): string | null {
  if (typeof v !== 'string') return null;
  const m = /^(\d{4}-\d{2}-\d{2})[ T](\d{2}:\d{2})(:\d{2})?/.exec(v.trim());
  return m ? `${m[1]} ${m[2]}${m[3] ?? ':00'}` : null;
}

/**
 * Message lisible pour une réponse en erreur : le message de Sendit, et pour
 * une 422 les champs refusés (« phone : … »). Montré à l'équipe seulement.
 */
export function messageErreurSendit(statut: number, json: any): string {
  const message = texteSendit(json?.message, 200);
  const details: string[] = [];
  const erreurs = json?.errors ?? json?.data?.errors;
  if (erreurs && typeof erreurs === 'object' && !Array.isArray(erreurs)) {
    for (const [champ, valeur] of Object.entries(erreurs).slice(0, 6)) {
      const premier = Array.isArray(valeur) ? valeur[0] : valeur;
      const t = texteSendit(premier, 120);
      if (t) details.push(`${texteSendit(champ, 40)} : ${t}`);
    }
  }
  if (statut === 429) return 'Trop de demandes envoyées à Sendit : réessayez dans quelques minutes.';
  const base = message || (statut >= 500 ? 'Sendit a un problème de son côté.' : 'Sendit a refusé la demande.');
  return details.length ? `${base} (${details.join(' ; ')})` : base;
}

// ─── Requêtes ─────────────────────────────────────────────────────────────────

interface ReponseBrute { ok: boolean; statut: number; json: any }

const DELAI_LECTURE_MS = 15_000;
const DELAI_ECRITURE_MS = 25_000;

async function requeteBrute(
  chemin: string,
  options: { methode?: 'GET' | 'POST' | 'DELETE'; corps?: unknown; jeton?: string; delaiMs?: number } = {},
): Promise<ReponseBrute> {
  const methode = options.methode ?? 'GET';
  const controleur = new AbortController();
  // Le délai couvre aussi la lecture du corps : un serveur qui s'arrête au milieu ne bloque pas la route.
  const minuterie = setTimeout(() => controleur.abort(), options.delaiMs ?? (methode === 'GET' ? DELAI_LECTURE_MS : DELAI_ECRITURE_MS));
  try {
    const headers: Record<string, string> = { Accept: 'application/json' };
    if (options.corps !== undefined) headers['Content-Type'] = 'application/json';
    if (options.jeton) headers.Authorization = `Bearer ${options.jeton}`;
    const rep = await fetch(urlApi() + chemin, {
      method: methode,
      headers,
      body: options.corps !== undefined ? JSON.stringify(options.corps) : undefined,
      signal: controleur.signal,
      cache: 'no-store',
    });
    const texte = await rep.text();
    let json: any = null;
    try { json = texte ? JSON.parse(texte) : null; } catch { /* page d'erreur HTML : json reste null */ }
    return { ok: rep.ok && json?.success !== false, statut: rep.status, json };
  } catch (e: any) {
    const delai = e?.name === 'AbortError';
    // Le chemin seul : jamais le corps (clés, données du client) ni le jeton.
    console.error('[sendit]', methode, chemin.split('?')[0], delai ? 'délai dépassé' : 'réseau');
    throw new ErreurSendit(
      delai ? 'Sendit n’a pas répondu à temps.' : 'Sendit est injoignable pour le moment (réseau).',
      delai ? 'delai' : 'reseau',
    );
  } finally {
    clearTimeout(minuterie);
  }
}

// ─── Jeton ────────────────────────────────────────────────────────────────────

/** Sendit ne dit pas combien de temps vit un jeton : on le garde 50 min au plus. */
const DUREE_JETON_MS = 50 * 60_000;

interface Jeton { valeur: string; expireLe: number; expJwt: number | null; compte: string }

let jetonEnCache: Jeton | null = null;
let connexionEnCours: Promise<Jeton> | null = null;

/** Échéance écrite dans un jeton JWT (champ exp), en millisecondes, ou null. */
export function expirationJwt(jeton: string): number | null {
  const parties = String(jeton ?? '').split('.');
  if (parties.length !== 3) return null;
  try {
    const charge = JSON.parse(Buffer.from(parties[1].replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString('utf8'));
    return typeof charge?.exp === 'number' && Number.isFinite(charge.exp) ? charge.exp * 1000 : null;
  } catch {
    return null;
  }
}

async function seConnecter(forcer = false): Promise<Jeton> {
  if (!forcer && jetonEnCache && Date.now() < jetonEnCache.expireLe) return jetonEnCache;
  // Une seule connexion à la fois, même si plusieurs demandes arrivent ensemble.
  if (connexionEnCours) return connexionEnCours;
  const c = cles();
  if (!c) throw new ErreurSendit(MESSAGE_NON_CONFIGURE, 'non_configure');
  const connexion = (async () => {
    const r = await requeteBrute('/login', { methode: 'POST', corps: { public_key: c.publique, secret_key: c.privee }, delaiMs: DELAI_LECTURE_MS });
    if (r.statut === 401 || r.statut === 403 || r.statut === 422) {
      console.error('[sendit] connexion refusée', r.statut);
      throw new ErreurSendit(
        'Sendit refuse les clés : vérifiez SENDIT_PUBLIC_KEY (clé publique) et SENDIT_PRIVATE_KEY (clé privée) sur Vercel, puis redéployez.',
        'refus_cles', r.statut,
      );
    }
    const valeur = r.json?.data?.token;
    if (!r.ok || typeof valeur !== 'string' || !valeur) {
      console.error('[sendit] connexion : réponse inattendue', r.statut);
      throw new ErreurSendit(`Connexion à Sendit impossible (réponse ${r.statut}).`, 'reponse', r.statut);
    }
    const expJwt = expirationJwt(valeur);
    const jeton: Jeton = {
      valeur,
      // Une minute de marge avant l'échéance du jeton, s'il en annonce une plus courte.
      expireLe: Math.min(Date.now() + DUREE_JETON_MS, expJwt ? expJwt - 60_000 : Number.POSITIVE_INFINITY),
      expJwt,
      compte: texteSendit(r.json?.data?.name, 120),
    };
    jetonEnCache = jeton;
    return jeton;
  })();
  connexionEnCours = connexion;
  try {
    return await connexion;
  } finally {
    if (connexionEnCours === connexion) connexionEnCours = null;
  }
}

/** Appel authentifié : un 401 (jeton expiré plus tôt que prévu) déclenche UNE reconnexion. */
async function appel(chemin: string, options: { methode?: 'GET' | 'POST' | 'DELETE'; corps?: unknown; delaiMs?: number } = {}): Promise<any> {
  let jeton = await seConnecter();
  let r = await requeteBrute(chemin, { ...options, jeton: jeton.valeur });
  if (r.statut === 401) {
    // Refusé avant tout traitement : rejouer une création ne crée pas de doublon.
    jetonEnCache = null;
    jeton = await seConnecter(true);
    r = await requeteBrute(chemin, { ...options, jeton: jeton.valeur });
  }
  if (!r.ok) {
    console.error('[sendit]', options.methode ?? 'GET', chemin.split('?')[0], 'réponse', r.statut);
    const nature: NatureErreurSendit = r.statut === 404 ? 'introuvable' : r.statut === 401 ? 'refus_cles' : r.statut >= 500 || r.statut < 400 ? 'reponse' : 'refus';
    throw new ErreurSendit(messageErreurSendit(r.statut, r.json), nature, r.statut);
  }
  return r.json;
}

/**
 * État de la connexion pour l'écran d'administration : se connecte (à neuf si
 * `forcer`), et rend le compte Sendit et l'échéance du jeton — jamais le jeton.
 */
export async function testerConnexion(forcer = false): Promise<{ compte: string; expireLe: string | null; gardeJusquA: string }> {
  const j = await seConnecter(forcer);
  return {
    compte: j.compte,
    expireLe: j.expJwt ? new Date(j.expJwt).toISOString() : null,
    gardeJusquA: new Date(j.expireLe).toISOString(),
  };
}

// ─── Listes paginées ──────────────────────────────────────────────────────────

/** Les éléments d'une liste Sendit, qu'elle soit dans data ou dans data.data. */
export function listeDe(json: any): any[] {
  if (Array.isArray(json?.data)) return json.data;
  if (Array.isArray(json?.data?.data)) return json.data.data;
  return [];
}

function pageSuivante(json: any): boolean {
  const suivante = json?.next_page_url ?? json?.data?.next_page_url;
  if (suivante) return true;
  const courante = Number(json?.current_page ?? json?.data?.current_page);
  const derniere = Number(json?.last_page ?? json?.data?.last_page);
  return Number.isFinite(courante) && Number.isFinite(derniere) && courante < derniere;
}

// ─── Villes et quartiers ──────────────────────────────────────────────────────

export interface QuartierSendit {
  id: number;
  ville: string;
  /** « Casablanca - Ain Sebaa », ou le nom de la ville quand elle n'a pas de quartiers. */
  name: string;
  arabicName: string;
  /** Prix public Sendit (DH) depuis notre ville de ramassage, ou null s'il manque. */
  price: number | null;
  /** « 24h », « 24h - 48h »… tel que Sendit l'écrit. */
  delais: string;
}

/** Un quartier tel que Sendit l'envoie, remis d'aplomb (le prix arrive en texte : « 19 »). */
export function quartierDe(brut: any): QuartierSendit | null {
  const id = Number(brut?.id);
  const name = texteSendit(brut?.name, 120);
  if (!Number.isInteger(id) || id <= 0 || !name) return null;
  const prix = Number(String(brut?.price ?? '').replace(',', '.'));
  return {
    id,
    ville: texteSendit(brut?.ville, 80) || name,
    name,
    arabicName: texteSendit(brut?.arabic_name, 120),
    price: brut?.price !== undefined && brut?.price !== null && brut?.price !== '' && Number.isFinite(prix) && prix >= 0 ? prix : null,
    delais: texteSendit(brut?.delais, 40),
  };
}

/** Minuscules, sans accents ni ponctuation : « Fès » = « fes », « Dar Bouazza » = « dar-bouazza ». */
export function sansAccents(s: string): string {
  return String(s ?? '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9؀-ۿ]+/g, ' ')
    .trim();
}

/**
 * Recherche dans la liste des quartiers : tous les mots tapés doivent se
 * retrouver (nom, ville ou nom arabe). La ville du client, si elle est donnée,
 * passe en tête ; puis les noms qui commencent par ce qui est tapé.
 */
export function filtrerQuartiers(liste: QuartierSendit[], recherche: string, ville = '', limite = 20): QuartierSendit[] {
  const mots = sansAccents(recherche).split(' ').filter(Boolean);
  const v = sansAccents(ville);
  if (!mots.length && !v) return [];
  const dansLaVille = (q: QuartierSendit) => !!v && (sansAccents(q.ville) === v || sansAccents(q.name).startsWith(v));
  const retenus = liste.filter(q => {
    if (!mots.length) return dansLaVille(q);
    const texte = `${sansAccents(q.name)} ${sansAccents(q.ville)} ${sansAccents(q.arabicName)}`;
    return mots.every(m => texte.includes(m));
  });
  const debut = mots.join(' ');
  const rang = (q: QuartierSendit) =>
    (dansLaVille(q) ? 0 : 2) + (debut && sansAccents(q.name).startsWith(debut) ? 0 : 1);
  return retenus
    .sort((a, b) => rang(a) - rang(b) || a.name.localeCompare(b.name, 'fr'))
    .slice(0, Math.max(0, limite));
}

/**
 * Quartier évident pour une ville : nom identique (« Rabat »), ou seule entrée
 * de cette ville. Casablanca a des dizaines de quartiers : rien n'est deviné,
 * l'équipe choisit.
 */
export function suggererQuartier(liste: QuartierSendit[], ville: string): QuartierSendit | null {
  const v = sansAccents(ville);
  if (!v) return null;
  const exact = liste.filter(q => sansAccents(q.name) === v);
  if (exact.length === 1) return exact[0];
  const memeVille = liste.filter(q => sansAccents(q.ville) === v);
  return memeVille.length === 1 ? memeVille[0] : null;
}

const DUREE_CACHE_LISTES_MS = 12 * 60 * 60_000;
/** Après un échec, on attend avant de réessayer : une route publique ne doit pas épuiser le quota Sendit (1 000 appels/h). */
const PAUSE_APRES_ECHEC_MS = 60_000;
/** Garde-fou : Sendit compte environ 500 à 600 quartiers. */
const PAGES_MAX = 60;

let quartiersEnCache: { liste: QuartierSendit[]; lu: number } | null = null;
let chargementQuartiers: Promise<QuartierSendit[]> | null = null;
let echecQuartiersLe = 0;

/** Tous les quartiers Sendit, gardés 12 h en mémoire. */
export async function listerQuartiers(): Promise<QuartierSendit[]> {
  if (!senditConfigure()) throw new ErreurSendit(MESSAGE_NON_CONFIGURE, 'non_configure');
  if (quartiersEnCache && Date.now() - quartiersEnCache.lu < DUREE_CACHE_LISTES_MS) return quartiersEnCache.liste;
  if (Date.now() - echecQuartiersLe < PAUSE_APRES_ECHEC_MS) {
    // Une vieille liste vaut mieux que rien.
    if (quartiersEnCache) return quartiersEnCache.liste;
    throw new ErreurSendit('La liste des quartiers Sendit est momentanément indisponible. Réessayez dans une minute.', 'reponse');
  }
  let chargement = chargementQuartiers;
  if (!chargement) {
    chargement = (async () => {
      // Les prix dépendent de la ville de ramassage : on les demande depuis la nôtre.
      const ramassage = await idRamassage().catch(() => null);
      const parId = new Map<number, QuartierSendit>();
      for (let page = 1; page <= PAGES_MAX; page++) {
        const json = await appel(`/districts?per_page=100&page=${page}${ramassage ? `&pickup-district=${ramassage.id}` : ''}`);
        const lus = listeDe(json).map(quartierDe).filter((q): q is QuartierSendit => q !== null);
        for (const q of lus) parId.set(q.id, q);
        if (!lus.length || !pageSuivante(json)) break;
      }
      if (!parId.size) throw new ErreurSendit('Sendit n’a renvoyé aucun quartier.', 'reponse');
      const liste = [...parId.values()];
      quartiersEnCache = { liste, lu: Date.now() };
      return liste;
    })();
    const enCours = chargement;
    chargementQuartiers = enCours;
    enCours
      .catch(() => { echecQuartiersLe = Date.now(); })
      .finally(() => { if (chargementQuartiers === enCours) chargementQuartiers = null; });
  }
  try {
    return await chargement;
  } catch (e) {
    if (quartiersEnCache) return quartiersEnCache.liste;
    throw e;
  }
}

/** Un quartier renvoyé seul par Sendit (GET /districts/{id}) : dans data, ou dans data.data. */
export function quartierDeReponse(json: any): QuartierSendit | null {
  const data = json?.data;
  if (!data || typeof data !== 'object' || Array.isArray(data)) return null;
  const brut = data.data && typeof data.data === 'object' && !Array.isArray(data.data) ? data.data : data;
  return quartierDe(brut);
}

/**
 * Un quartier par son identifiant : la liste en mémoire si elle est déjà là, sinon
 * UNE question à Sendit (GET /districts/{id}). Recharger toute la liste (≈ 600
 * quartiers, page par page) dans une fonction qui vient de démarrer dépassait le
 * temps permis par Vercel : l'envoi du colis était coupé sans explication.
 */
export async function quartierParId(id: number): Promise<QuartierSendit | null> {
  if (!Number.isInteger(id) || id <= 0) return null;
  const enMemoire = quartiersEnCache?.liste.find(q => q.id === id);
  if (enMemoire) return enMemoire;
  try {
    const q = quartierDeReponse(await appel(`/districts/${id}`));
    return q && q.id === id ? q : null;
  } catch (e) {
    if (e instanceof ErreurSendit && e.nature === 'introuvable') return null;
    throw e;
  }
}

/** Pages lues au plus pour une recherche (100 quartiers par page). */
const PAGES_RECHERCHE = 3;

/**
 * Quartiers qui répondent à une recherche (ou à une ville) : la liste en mémoire si
 * elle est fraîche, sinon la recherche de Sendit (GET /districts?querystring=),
 * quelques pages au plus. Toujours rapide, même dans une fonction qui démarre.
 */
export async function chercherQuartiers(recherche: string, ville = '', limite = 20): Promise<QuartierSendit[]> {
  if (!senditConfigure()) throw new ErreurSendit(MESSAGE_NON_CONFIGURE, 'non_configure');
  if (quartiersEnCache && Date.now() - quartiersEnCache.lu < DUREE_CACHE_LISTES_MS) {
    return filtrerQuartiers(quartiersEnCache.liste, recherche, ville, limite);
  }
  const brut = (String(recherche ?? '').trim() || String(ville ?? '').trim()).slice(0, 60);
  if (!brut) return [];
  const ramassage = await idRamassage().catch(() => null);
  const lire = async (terme: string) => {
    const parId = new Map<number, QuartierSendit>();
    for (let page = 1; page <= PAGES_RECHERCHE; page++) {
      const json = await appel(`/districts?per_page=100&page=${page}&querystring=${encodeURIComponent(terme)}${ramassage ? `&pickup-district=${ramassage.id}` : ''}`);
      const lus = listeDe(json).map(quartierDe).filter((q): q is QuartierSendit => q !== null);
      for (const q of lus) parId.set(q.id, q);
      if (!lus.length || !pageSuivante(json)) break;
    }
    return [...parId.values()];
  };
  let trouves = await lire(brut);
  // « Maârif » tapé avec l'accent, « Maarif » chez Sendit (ou l'inverse) : un second essai sans accents.
  const simple = sansAccents(brut);
  if (!trouves.length && simple && simple !== brut.toLowerCase()) trouves = await lire(simple);
  return filtrerQuartiers(trouves, recherche, ville, limite);
}

/** Nombre de quartiers annoncé par Sendit (une seule page lue). */
export async function compterQuartiers(): Promise<number> {
  const json = await appel('/districts?per_page=1&page=1');
  const total = Number(json?.total ?? json?.data?.total);
  return Number.isFinite(total) && total >= 0 ? total : listeDe(json).length;
}

export interface VilleRamassage { id: number; name: string }

let villesRamassageEnCache: { liste: VilleRamassage[]; lu: number } | null = null;

/** Villes où Sendit ramasse (GET /districts/pickup-cities), gardées 12 h. */
export async function villesRamassage(): Promise<VilleRamassage[]> {
  if (villesRamassageEnCache && Date.now() - villesRamassageEnCache.lu < DUREE_CACHE_LISTES_MS) return villesRamassageEnCache.liste;
  const json = await appel('/districts/pickup-cities');
  const brut = Array.isArray(json?.data) ? json.data : listeDe(json);
  const liste: VilleRamassage[] = brut
    .map((v: any): VilleRamassage => ({ id: Number(v?.id), name: texteSendit(v?.name, 120) }))
    .filter((v: VilleRamassage) => Number.isInteger(v.id) && v.id > 0 && !!v.name);
  villesRamassageEnCache = { liste, lu: Date.now() };
  return liste;
}

/** La ville de ramassage « Casablanca » dans la liste Sendit (Derb Omar est à Casablanca). */
export function choisirRamassageCasablanca(liste: VilleRamassage[]): VilleRamassage | null {
  const exact = liste.find(v => sansAccents(v.name) === 'casablanca');
  if (exact) return exact;
  return liste.find(v => sansAccents(v.name).startsWith('casablanca')) ?? null;
}

/**
 * Ville de ramassage des colis : SENDIT_PICKUP_DISTRICT_ID si le patron l'a
 * posée, sinon Casablanca trouvée dans la liste Sendit.
 */
export async function idRamassage(): Promise<{ id: number; nom: string; source: 'variable' | 'automatique' }> {
  const variable = idRamassageVariable();
  if (variable) return { id: variable, nom: '', source: 'variable' };
  const casablanca = choisirRamassageCasablanca(await villesRamassage());
  if (!casablanca) {
    throw new ErreurSendit('Casablanca n’est pas dans les villes de ramassage Sendit : posez SENDIT_PICKUP_DISTRICT_ID sur Vercel.', 'reponse');
  }
  return { id: casablanca.id, nom: casablanca.name, source: 'automatique' };
}

/** Statuts réels du compte (GET /all-status-deliveries), quelle que soit la forme de la réponse. */
export async function statutsOfficiels(): Promise<{ code: string; libelle: string }[]> {
  const json = await appel('/all-status-deliveries');
  const data = json?.data ?? json;
  const sortie: { code: string; libelle: string }[] = [];
  const ajouter = (code: unknown, libelle: unknown) => {
    const c = codeStatutSendit(code);
    if (c && !sortie.some(s => s.code === c)) sortie.push({ code: c, libelle: texteSendit(libelle, 80) || libelleStatutSendit(c) });
  };
  if (Array.isArray(data)) {
    for (const s of data.slice(0, 100)) {
      if (typeof s === 'string') ajouter(s, '');
      else ajouter(s?.code ?? s?.key ?? s?.status ?? s?.name, s?.label ?? s?.value ?? s?.description ?? s?.name);
    }
  } else if (data && typeof data === 'object') {
    for (const [code, libelle] of Object.entries(data).slice(0, 100)) ajouter(code, typeof libelle === 'string' ? libelle : (libelle as any)?.label);
  }
  return sortie;
}

// ─── Commande → colis ─────────────────────────────────────────────────────────

/** Téléphone au format Sendit : 10 chiffres commençant par 05, 06, 07 ou 08 ; sinon null. */
export function telephoneSendit(tel?: string | null): string | null {
  const inter = telInternational(tel);
  return /^212[5-8]\d{8}$/.test(inter) ? `0${inter.slice(3)}` : null;
}

/**
 * Texte pour une étiquette : une seule ligne, sans les séparateurs que Sendit
 * interprète (« : », « ; », « | ») — même nettoyage que le plugin officiel.
 */
export function nettoyerPourSendit(v: unknown, max: number): string {
  const t = String(v ?? '')
    .replace(/[\u0000-\u001f\u007f]+/g, ' ')
    .replace(/\|/g, '/')
    .replace(/;/g, ',')
    .replace(/\s*:/g, ' -')
    .replace(/\s+/g, ' ')
    .trim();
  return t.length > max ? `${t.slice(0, max - 1).trimEnd()}…` : t;
}

/** « Fermeture 20 cm (Noir · 20) x3 / Fil (Blanc) x1 » : ce que le livreur voit sur l'étiquette. */
export function texteProduits(items: CartItem[], max = 480): string {
  const parties = (items || []).map(i => {
    const nom = nettoyerPourSendit(i.productName || 'Article', 120);
    const variante = nettoyerPourSendit(varianteLisible(i.variant), 80);
    // Une quantité illisible n'est jamais « corrigée » en x1 : controlerEnvoi bloque avant l'envoi.
    const qte = quantiteValide(i.quantity) ? Number(i.quantity) : '?';
    return `${nom}${variante ? ` (${variante})` : ''} x${qte}`;
  });
  return nettoyerPourSendit(parties.join(' / '), max);
}

/** La commande telle que l'envoi Sendit la lit : remise d'aplomb + mode de réception et paiement. */
export interface CommandePourSendit {
  commande: ShopOrder;
  mode: ModeReception;
  volumineux: boolean;
  paiement: MoyenPaiement;
  /** Magasin où la commande se prépare (Derb Omar pour un colis). */
  lieu: LieuRetrait;
}

/**
 * Lit la commande brute de Firestore avec les mêmes règles que la fiche
 * (normaliserCommande, receptionDe, moyenPaiementDe) : absent = ancienne
 * commande = colis à domicile payé en espèces ; un seul article marqué
 * volumineux suffit, même si `reception` l'a oublié.
 */
export function commandePourSendit(id: string, brut: unknown): CommandePourSendit {
  const commande = normaliserCommande(id, brut);
  const r = receptionDe(commande);
  return { commande, mode: r.mode, volumineux: r.volumineux, paiement: moyenPaiementDe(commande), lieu: r.lieu };
}

/**
 * « Paiement reçu » posé par l'administrateur (virement vu sur le compte) dans
 * shop_orders_interne/{id}.paiement = { recu, le, par, note } (route interne,
 * action « paiement », administrateur seulement). Jamais lu dans la commande
 * elle-même : le client l'écrit.
 */
export function paiementRecuDe(interne: unknown): boolean {
  const i = (interne && typeof interne === 'object' ? interne : {}) as Record<string, any>;
  return i.paiement?.recu === true;
}

/** Espèces au plus par colis Sendit (décision du patron, 29/09/2026) : une seule valeur, celle de commandes-boutique. */
export { PLAFOND_ESPECES_COLIS };
/** On n'envoie qu'une commande confirmée au téléphone (ou déjà en préparation). */
export const STATUTS_ENVOI_SENDIT: OrderStatus[] = ['confirmed', 'processing'];

const arrondi = (n: number) => Math.round(n * 100) / 100;

/**
 * Ce que le livreur encaisse : rien si l'administrateur a noté « paiement reçu »
 * (argent vu sur le compte), sinon tout le total. Le « reçu » compte quel que soit
 * le moyen choisi à la commande : un client en espèces au-delà de 3 000 DH peut
 * avoir payé par virement après l'appel (même lecture que la fiche : « Déjà payée »).
 */
export function montantAEncaisser(c: Pick<CommandePourSendit, 'commande'>, paiementRecu: boolean): number {
  if (paiementRecu) return 0;
  return arrondi(Math.max(0, Number(c.commande.total) || 0));
}

/** Quantité qu'un vrai panier peut porter : un nombre positif (le mètre de tissu peut être décimal). */
export function quantiteValide(v: unknown): boolean {
  return typeof v === 'number' && Number.isFinite(v) && v > 0 && v <= 100_000;
}

/** Σ prix × quantité + livraison − remise : le total que la commande DEVRAIT avoir. */
export function totalRecalcule(o: Pick<ShopOrder, 'items' | 'deliveryFee' | 'discount'>): number {
  const lignes = (o.items || []).reduce((s, i) => s + prixUnitaireLigne(i) * (Number(i.quantity) || 0), 0);
  return arrondi(lignes + (Number(o.deliveryFee) || 0) - (Number(o.discount) || 0));
}

const STATUT_LISIBLE: Partial<Record<OrderStatus, string>> = {
  pending: 'en attente de confirmation',
  ready_for_pickup: 'prête à retirer',
  shipped: 'déjà expédiée',
  out_for_delivery: 'déjà en livraison',
  delivered: 'déjà livrée',
  cancelled: 'annulée',
  returned: 'retournée',
};

const dh = (n: number) => `${arrondi(n).toLocaleString('fr-FR', { maximumFractionDigits: 2 })} DH`;

export interface ControleEnvoi {
  montant: number;
  telephone: string | null;
  totalCalcule: number;
  /** Ce qui empêche l'envoi (dans l'ordre où l'équipe peut le régler). */
  blocages: string[];
  /** Ce qui mérite un coup d'œil sans empêcher l'envoi. */
  avertissements: string[];
  /**
   * Plus de 3 000 DH d'espèces : pas de colis pour le total. L'administrateur seul peut
   * faire encaisser une partie (3 000 DH au plus), l'acompte déjà reçu étant noté.
   */
  plafondDepasse: boolean;
  /** Virement (ou carte) choisi et pas encore noté reçu : l'équipe ne peut pas envoyer ; l'administrateur, après accord du client. */
  virementNonRecu: boolean;
}

/**
 * Tous les contrôles avant de créer un colis. `fraisAttendus` : frais de colis
 * que la grille donne pour cette ville (null ou absent : pas de comparaison).
 */
export function controlerEnvoi(c: CommandePourSendit, o: { paiementRecu: boolean; fraisAttendus?: number | null }): ControleEnvoi {
  const cmd = c.commande;
  const blocages: string[] = [];
  const avertissements: string[] = [];

  if (c.volumineux) {
    blocages.push('Article volumineux (rouleau entier) : Sendit ne le transporte jamais. Organisez le transport par téléphone.');
  } else if (c.mode !== 'domicile') {
    blocages.push(c.mode === 'retrait'
      ? 'Le client vient retirer sa commande au magasin : pas de colis Sendit.'
      : 'Transport organisé par téléphone (camionnette ou transporteur) : pas de colis Sendit.');
  }
  if (!STATUTS_ENVOI_SENDIT.includes(cmd.status)) {
    blocages.push(`La commande est ${STATUT_LISIBLE[cmd.status] ?? cmd.status} : on n’envoie à Sendit qu’une commande confirmée (ou en préparation).`);
  }
  if (!cmd.items?.length) blocages.push('La commande n’a aucun article.');

  const nom = (cmd.shippingAddress?.fullName || cmd.customerName || '').trim();
  if (!nom) blocages.push('Le nom du client manque.');
  if (!(cmd.shippingAddress?.address || '').trim()) blocages.push('L’adresse de livraison est vide : demandez-la au client.');

  const telephone = telephoneSendit(cmd.shippingAddress?.phone) ?? telephoneSendit(cmd.customerPhone);
  if (!telephone) {
    blocages.push('Le téléphone du client n’est pas un numéro marocain valable (10 chiffres, ex. 06 12 34 56 78) : corrigez-le avec lui.');
  }

  // Tout ce qui fait le montant vient du navigateur du client : on refuse ce que le
  // checkout n'écrit jamais (quantité nulle ou négative, remise, frais négatifs).
  if ((cmd.items || []).some(i => !quantiteValide(i.quantity))) {
    blocages.push('Une quantité est nulle, négative ou illisible : vérifiez la commande avec le client avant l’envoi.');
  }
  if ((cmd.items || []).some(i => prixUnitaireLigne(i) <= 0)) {
    blocages.push('Un article n’a pas de prix : fixez-le avec le client. En attendant, créez le colis sur app.sendit.ma avec le bon montant.');
  }
  if ((Number(cmd.discount) || 0) !== 0) {
    blocages.push('La commande porte une remise, alors que le site n’en accorde aucune : vérifiez-la. Si la remise est réelle, créez le colis sur app.sendit.ma avec le bon montant.');
  }
  if ((Number(cmd.deliveryFee) || 0) < 0) {
    blocages.push('Les frais de livraison de la commande sont négatifs : vérifiez la commande avant l’envoi.');
  }
  const lignes = arrondi(totalDesLignes(cmd));
  if (Math.abs(lignes - (Number(cmd.subtotal) || 0)) > 0.5) {
    blocages.push(`Le sous-total de la commande (${dh(Number(cmd.subtotal) || 0)}) ne correspond pas à la somme des articles (${dh(lignes)}). Vérifiez la commande avant l’envoi.`);
  }
  const totalCalcule = totalRecalcule(cmd);
  if (Math.abs(totalCalcule - (Number(cmd.total) || 0)) > 0.5) {
    blocages.push(`Le total de la commande (${dh(Number(cmd.total) || 0)}) ne correspond pas aux articles + livraison − remise (${dh(totalCalcule)}). Vérifiez la commande avant l’envoi.`);
  }

  const montant = montantAEncaisser(c, o.paiementRecu);
  // Virement (ou carte) choisi mais pas encore vu : envoyer quand même ferait payer deux fois
  // un client qui a déjà viré. L'équipe est bloquée ; l'administrateur seul peut passer outre.
  const virementNonRecu = (c.paiement === 'virement' || c.paiement === 'carte') && !o.paiementRecu;
  if (virementNonRecu) {
    avertissements.push(`Le client a choisi ${c.paiement === 'virement' ? 'le virement' : 'la carte'}, mais le paiement n’est pas encore marqué reçu : Sendit encaissera ${dh(montant)} en espèces.`);
  }
  if (o.paiementRecu) avertissements.push('Paiement déjà reçu (noté par l’administrateur) : le livreur n’encaisse rien.');

  const fraisAttendus = o.fraisAttendus;
  if (typeof fraisAttendus === 'number' && Number.isFinite(fraisAttendus) && (Number(cmd.deliveryFee) || 0) + 0.5 < fraisAttendus) {
    avertissements.push(`Frais de livraison notés ${dh(Number(cmd.deliveryFee) || 0)} alors que la grille donne ${dh(fraisAttendus)} pour ${cmd.shippingAddress?.city || 'cette ville'}. Vérifiez avec le client.`);
  }

  return { montant, telephone, totalCalcule, blocages, avertissements, plafondDepasse: montant > PLAFOND_ESPECES_COLIS, virementNonRecu };
}

/**
 * Montant qu'un administrateur fait encaisser par Sendit quand le client a déjà payé une
 * partie (acompte par virement, arrangé au téléphone) : entre 1 DH et le plafond d'espèces,
 * et jamais plus que le total. Sinon null.
 */
export function montantPartielValide(v: unknown, total: number): number | null {
  const n = typeof v === 'number' ? v : typeof v === 'string' ? Number(v.replace(',', '.')) : NaN;
  if (!Number.isFinite(n)) return null;
  const m = arrondi(n);
  return m >= 1 && m <= PLAFOND_ESPECES_COLIS && m < arrondi(Math.max(0, Number(total) || 0)) ? m : null;
}

export interface CorpsColisSendit {
  reference: string;
  name: string;
  amount: number;
  phone: string;
  address: string;
  district_id: number;
  pickup_district_id: number;
  comment: string;
  products: string;
  products_from_stock: 0;
  allow_open: 0;
  allow_try: 0;
}

/**
 * Corps de POST /deliveries. Le colis ne s'ouvre ni ne s'essaie avant paiement,
 * et ne sort pas d'un stock Sendit (la marchandise part de Derb Omar).
 */
export function corpsColis(c: CommandePourSendit, o: { districtId: number; ramassageId: number; montant: number; telephone: string }): CorpsColisSendit {
  const cmd = c.commande;
  const a = cmd.shippingAddress;
  const ville = (a?.city || '').trim();
  const adresse = (a?.address || '').trim();
  const autres: string[] = [];
  const tel2 = telephoneSendit(a?.phone2);
  if (tel2 && tel2 !== o.telephone) autres.push(`2e tél. ${tel2}`);
  if (cmd.notes?.trim()) autres.push(`Note client : ${cmd.notes.trim()}`);
  return {
    reference: nettoyerPourSendit(cmd.orderNumber, 60),
    name: nettoyerPourSendit(a?.fullName || cmd.customerName, 100),
    amount: arrondi(o.montant),
    phone: o.telephone,
    address: nettoyerPourSendit(ville && !sansAccents(adresse).includes(sansAccents(ville)) ? `${adresse}, ${ville}` : adresse, 250),
    district_id: o.districtId,
    pickup_district_id: o.ramassageId,
    comment: nettoyerPourSendit(autres.join(' / '), 480),
    products: texteProduits(cmd.items),
    products_from_stock: 0,
    allow_open: 0,
    allow_try: 0,
  };
}

// ─── Colis ────────────────────────────────────────────────────────────────────

/** Code d'un colis Sendit (ex. DHF420101C) : lettres, chiffres, « - » et « _ ». */
export function codeColisValide(v: unknown): v is string {
  return typeof v === 'string' && /^[A-Za-z0-9_-]{3,40}$/.test(v);
}

export interface ColisSendit {
  code: string;
  statut: string | null;
  statutRetour: string | null;
  /** Ce que Sendit facture à LEBTEX pour ce colis (DH), s'il le dit. */
  fee: number | null;
  reference: string;
  telephone: string;
  quartier: string;
  derniereAction: string | null;
}

/** Un colis tel que Sendit le renvoie (création, lecture ou recherche), remis d'aplomb. */
export function colisDe(brut: any): ColisSendit | null {
  const code = texteSendit(brut?.code, 40);
  if (!codeColisValide(code)) return null;
  const fee = Number(String(brut?.fee ?? '').replace(',', '.'));
  return {
    code,
    statut: codeStatutSendit(brut?.status),
    statutRetour: codeStatutSendit(brut?.status_return),
    fee: brut?.fee !== undefined && brut?.fee !== null && brut?.fee !== '' && Number.isFinite(fee) ? fee : null,
    reference: texteSendit(brut?.reference, 60),
    telephone: texteSendit(brut?.phone, 30),
    quartier: texteSendit(brut?.district?.name ?? brut?.district_name, 120),
    // last_action_at seulement : updated_at est en heure UTC, il ne se compare pas à l'heure du webhook.
    derniereAction: horodatageSendit(brut?.last_action_at),
  };
}

/**
 * Crée le colis (POST /deliveries). Une erreur `peutEtreFait` veut dire « peut-être créé »
 * (pas de réponse, ou erreur de passerelle) ; une connexion ratée avant l'envoi, non.
 */
export async function creerColis(corps: CorpsColisSendit): Promise<ColisSendit> {
  try {
    await seConnecter();
  } catch (e) {
    if (e instanceof ErreurSendit) e.avantEnvoi = true;
    throw e;
  }
  const json = await appel('/deliveries', { methode: 'POST', corps, delaiMs: DELAI_ECRITURE_MS });
  const colis = colisDe(json?.data);
  if (!colis) {
    // Réponse « réussie » sans code : on ne sait pas ce qui a été créé.
    throw new ErreurSendit('Sendit a répondu sans code de colis : vérifiez dans l’application Sendit avant de réessayer.', 'delai');
  }
  return colis;
}

/** Relit un colis (GET /deliveries/{code}). */
export async function lireColis(code: string): Promise<ColisSendit> {
  if (!codeColisValide(code)) throw new ErreurSendit('Code de colis invalide.', 'refus');
  const json = await appel(`/deliveries/${encodeURIComponent(code)}`);
  const colis = colisDe(json?.data);
  if (!colis) throw new ErreurSendit('Réponse de Sendit illisible pour ce colis.', 'reponse');
  return colis;
}

/** Recherche (code, nom, téléphone, adresse) : GET /deliveries?querystring=… (première page). */
export async function chercherColis(texte: string): Promise<ColisSendit[]> {
  const q = String(texte ?? '').trim().slice(0, 60);
  if (!q) return [];
  const json = await appel(`/deliveries?page=1&querystring=${encodeURIComponent(q)}`);
  return listeDe(json).map(colisDe).filter((c): c is ColisSendit => c !== null);
}

/**
 * Après un envoi resté sans réponse : le colis de CETTE commande dans les
 * résultats de recherche. Seule la référence (notre n° de commande) suffit à le
 * rattacher tout seul. Un colis en attente, sans référence, au même téléphone
 * peut être un colis créé à la main sur app.sendit.ma pour ce client (vente
 * /stock…) : il revient dans `candidats`, et c'est l'équipe qui confirme son code.
 * `ambigu` : plusieurs colis portent notre référence, un humain doit regarder dans Sendit.
 */
export function choisirColisRetrouve(liste: ColisSendit[], reference: string, telephone: string): {
  colis: ColisSendit | null; ambigu: boolean; candidats: ColisSendit[];
} {
  const ref = nettoyerPourSendit(reference, 60).trim().toUpperCase();
  const parReference = liste.filter(c => c.reference && c.reference.trim().toUpperCase() === ref);
  if (parReference.length === 1) return { colis: parReference[0], ambigu: false, candidats: [] };
  if (parReference.length > 1) return { colis: null, ambigu: true, candidats: [] };
  const candidats = telephone
    ? liste.filter(c =>
      !c.reference
      && telephoneSendit(c.telephone) === telephone
      && (c.statut === 'PENDING' || c.statut === 'TO_PREPARE'))
    : [];
  return { colis: null, ambigu: false, candidats: candidats.slice(0, 5) };
}

/** Lien d'un PDF d'étiquettes : https et sur un domaine sendit.ma, sinon null (jamais ouvert). */
export function urlEtiquetteSure(v: unknown): string | null {
  if (typeof v !== 'string' || v.length > 2000) return null;
  try {
    const u = new URL(v);
    const hote = u.hostname.toLowerCase();
    if (u.protocol !== 'https:' || !(hote === 'app.sendit.ma' || hote.endsWith('.sendit.ma'))) return null;
    return u.toString();
  } catch {
    return null;
  }
}

/** PDF des étiquettes A4 (printFormat 0) : un lien signé qui expire, jamais gardé. */
export async function urlEtiquettes(codes: string[]): Promise<string> {
  const propres = [...new Set(codes.filter(codeColisValide))];
  if (!propres.length) throw new ErreurSendit('Aucun colis à imprimer.', 'refus');
  const json = await appel('/deliveries/getlabels', { methode: 'POST', corps: { codesToPrint: propres.join(','), printFormat: 0 } });
  const candidats = [json?.data?.fileUrl, json?.data?.file_url, json?.data?.url, typeof json?.data === 'string' ? json.data : null, json?.fileUrl];
  for (const c of candidats) {
    const sur = urlEtiquetteSure(c);
    if (sur) return sur;
  }
  console.error('[sendit] getlabels : lien absent ou hors sendit.ma');
  throw new ErreurSendit('Sendit n’a pas renvoyé de lien d’étiquette utilisable. Imprimez-la depuis l’application Sendit.', 'reponse');
}

/** Demande de ramassage (POST /pickups) pour ces colis, au magasin indiqué. */
export async function demanderRamassage(p: { districtId: number; nom: string; telephone: string; adresse: string; note: string; codes: string[] }): Promise<{ code: string | null }> {
  const codes = [...new Set(p.codes.filter(codeColisValide))];
  if (!codes.length) throw new ErreurSendit('Aucun colis à faire ramasser.', 'refus');
  try {
    await seConnecter();
  } catch (e) {
    // Connexion ratée : la demande n'est pas partie.
    if (e instanceof ErreurSendit) e.avantEnvoi = true;
    throw e;
  }
  const json = await appel('/pickups', {
    methode: 'POST',
    corps: {
      district_id: p.districtId,
      name: nettoyerPourSendit(p.nom, 100),
      phone: p.telephone,
      address: nettoyerPourSendit(p.adresse, 250),
      note: nettoyerPourSendit(p.note, 300),
      deliveries: codes.join(','),
    },
  });
  const code = texteSendit(json?.data?.code, 40);
  return { code: code || null };
}

// ─── Webhook ──────────────────────────────────────────────────────────────────

export const ENTETE_SIGNATURE_SENDIT = 'x-sendit-signature';

/** HMAC-SHA256 du corps brut, en hexadécimal. */
export function signerSendit(corpsBrut: string, secret: string): string {
  return createHmac('sha256', secret).update(corpsBrut, 'utf8').digest('hex');
}

/**
 * Signature X-Sendit-Signature valable pour ce corps brut ? Sendit ne dit pas
 * s'il l'écrit en hexadécimal ou en base64 : les deux sont acceptés (préfixe
 * « sha256= » toléré). Comparaison des octets en temps constant. Rend l'encodage
 * reconnu, ou null.
 */
export function signatureSenditValide(corpsBrut: string, signature: string | null | undefined, secret: string): 'hex' | 'base64' | null {
  if (!signature || !secret) return null;
  const attendue = createHmac('sha256', secret).update(corpsBrut, 'utf8').digest();
  const s = signature.trim().replace(/^sha256=/i, '');
  let recue: Buffer | null = null;
  let encodage: 'hex' | 'base64' | null = null;
  if (/^[0-9a-f]{64}$/i.test(s)) {
    recue = Buffer.from(s, 'hex');
    encodage = 'hex';
  } else if (/^[A-Za-z0-9+/_-]{43}={0,1}$/.test(s)) {
    recue = Buffer.from(s.replace(/-/g, '+').replace(/_/g, '/'), 'base64');
    encodage = 'base64';
  }
  if (!recue || recue.length !== attendue.length) return null;
  return timingSafeEqual(recue, attendue) ? encodage : null;
}

/** Jeton d'URL (?token=) : comparé en temps constant, et seulement s'il est assez long. */
export function jetonWebhookValide(recu: string | null | undefined, attendu: string): boolean {
  if (!recu || !attendu || attendu.length < LONGUEUR_MIN_JETON_WEBHOOK) return false;
  const a = createHash('sha256').update(recu, 'utf8').digest();
  const b = createHash('sha256').update(attendu, 'utf8').digest();
  return timingSafeEqual(a, b) && recu.length === attendu.length;
}

export interface EvenementSendit {
  /** Forme reçue : le guide officiel (code/newStatus) ou le plugin WooCommerce (reference/status). */
  format: 'code/newStatus' | 'reference/status';
  /** Code du colis ; pour la forme reference/status, peut être notre numéro de commande. */
  code: string;
  statut: string;
  ancienStatut: string | null;
  statutRetour: string | null;
  lastActionAt: string | null;
  message: string;
  deliverBy: string | null;
  tentatives: number | null;
  photo: string | null;
  evenement: string;
}

/** Lit un webhook Sendit, sous l'une ou l'autre forme ; null s'il est illisible. */
export function lireEvenementSendit(json: unknown): EvenementSendit | null {
  if (!json || typeof json !== 'object' || Array.isArray(json)) return null;
  const j = json as Record<string, any>;
  const guide = typeof j.code === 'string' && j.newStatus !== undefined;
  const code = texteSendit(guide ? j.code : j.reference ?? j.code, 60);
  const statut = codeStatutSendit(guide ? j.newStatus : j.status ?? j.newStatus);
  if (!code || !/^[A-Za-z0-9_#-]{3,60}$/.test(code) || !statut) return null;
  const tentatives = Number(j.counterUnreachable);
  const photo = typeof j.proofImage === 'string' ? urlEtiquetteSure(j.proofImage) : null;
  return {
    format: guide ? 'code/newStatus' : 'reference/status',
    code,
    statut,
    ancienStatut: codeStatutSendit(j.oldStatus),
    statutRetour: codeStatutSendit(j.status_return ?? j.statusReturn),
    lastActionAt: horodatageSendit(j.lastActionAt ?? j.last_action_at),
    message: texteSendit(j.message, 300),
    deliverBy: texteSendit(j.deliverBy, 30) || null,
    tentatives: Number.isInteger(tentatives) && tentatives >= 0 && tentatives < 100 ? tentatives : null,
    photo,
    evenement: texteSendit(j.event, 60),
  };
}

// ─── Statut du colis → commande (Firestore) ──────────────────────────────────

export interface ResultatStatutSendit {
  cas: 'inconnu' | 'deja' | 'ok';
  nouveauStatut?: OrderStatus | null;
  mention?: MentionSendit | null;
}

/** Auteur des changements faits par Sendit dans le journal de l'équipe. */
export const AUTEUR_SENDIT = 'automatique (Sendit)';

/** Lignes gardées dans l'historique d'un colis (la fiche n'en montre que 12). */
export const HISTORIQUE_MAX = 50;

/**
 * Un webhook prouvé par le seul jeton d'URL n'a pas de signature du corps : un appel
 * enregistré pourrait être rejoué. On n'accepte alors qu'un événement daté, et
 * récent (heure Sendit du Maroc, comparée à quelques jours près).
 */
export const ANCIENNETE_MAX_EVENEMENT_JETON_MS = 3 * 24 * 60 * 60_000;

export function evenementRecent(lastActionAt: string | null, maintenant = Date.now()): boolean {
  if (!lastActionAt) return false;
  const ms = Date.parse(`${lastActionAt.replace(' ', 'T')}+01:00`);
  return Number.isFinite(ms) && maintenant - ms <= ANCIENNETE_MAX_EVENEMENT_JETON_MS && ms - maintenant <= 24 * 60 * 60_000;
}

/**
 * Note un statut Sendit sur la commande `commandeId`, dans une transaction :
 * - dans shop_orders_interne/{id}.sendit : statut, heure, mention, historique ;
 * - dans la commande (suivi client) : seulement les avancées sûres
 *   (decisionStatutSendit), avec la phrase du suivi client et le journal.
 * Rien si `code` n'est pas le colis enregistré pour cette commande (un
 * événement ne peut pas viser une autre commande), ni si c'est un doublon.
 * Un événement plus ancien que le dernier connu va seulement dans l'historique.
 */
export async function appliquerStatutSendit(db: Firestore, p: {
  commandeId: string;
  code: string;
  statut: string;
  statutRetour?: string | null;
  source: 'webhook' | 'lecture';
  lastActionAt?: string | null;
  message?: string;
  deliverBy?: string | null;
  tentatives?: number | null;
  photo?: string | null;
  fee?: number | null;
}): Promise<ResultatStatutSendit> {
  // Chargé ici seulement : les tests des fonctions pures n'ont pas besoin de firebase-admin.
  const { FieldValue, Timestamp } = await import('firebase-admin/firestore');
  const ref = db.collection('shop_orders').doc(p.commandeId);
  const refInterne = db.collection('shop_orders_interne').doc(p.commandeId);

  return db.runTransaction<ResultatStatutSendit>(async tx => {
    const [snap, snapInterne] = await Promise.all([tx.get(ref), tx.get(refInterne)]);
    const interne = snapInterne.data() ?? {};
    const envoi = interne.sendit ?? {};
    if (!snap.exists || typeof envoi.code !== 'string' || envoi.code !== p.code) return { cas: 'inconnu' };

    const cle = `${p.statut}|${p.statutRetour ?? ''}|${p.lastActionAt ?? ''}`;
    if (envoi.derniereCle === cle) return { cas: 'deja' };
    // Un appel rejoué (même statut, même heure Sendit) ne rallonge pas l'historique : la clé
    // stable est gardée dans chaque ligne. Sans elle, chaque rejeu d'un vieil événement
    // ajoutait une ligne jusqu'à la limite de taille du document (1 Mio), et plus rien
    // (note, journal, paiement reçu) ne s'y écrivait.
    const historique: any[] = Array.isArray(envoi.historique) ? envoi.historique : [];
    if (historique.some(h => h?.cle === cle)) return { cas: 'deja' };

    const le = Timestamp.fromMillis(Date.now());
    const ligneHistorique = { statut: p.statut, ...(p.statutRetour ? { retour: p.statutRetour } : {}), le, source: p.source, cle };
    // Écrit en entier (dans la transaction) et borné aux dernières lignes.
    const historiqueMaj = [...historique, ligneHistorique].slice(-HISTORIQUE_MAX);
    // « 2026-09-29 16:05:05 » se compare comme du texte : un événement en retard n'écrase pas le dernier.
    // Un webhook sans heure ne peut pas prouver qu'il est récent : il ne remplace pas un état daté.
    const enRetard = !!(p.lastActionAt && typeof envoi.derniereAction === 'string' && p.lastActionAt < envoi.derniereAction)
      || (!p.lastActionAt && p.source === 'webhook' && typeof envoi.derniereAction === 'string');
    if (enRetard) {
      tx.set(refInterne, { sendit: { historique: historiqueMaj } }, { merge: true });
      return { cas: 'ok', nouveauStatut: null, mention: null };
    }

    // Relue avec les mêmes règles que la fiche : un statut illisible compte comme « en attente ».
    const commande = normaliserCommande(p.commandeId, snap.data());
    const decision = decisionStatutSendit(commande.status, p.statut);
    let mention = decision.mention;
    let explication = decision.explication;
    // Un retour en cours (status_return) se vérifie toujours à la main.
    if (p.statutRetour && /^RET|^TORETURN$/.test(p.statutRetour)) {
      mention = 'a_verifier';
      explication = `Colis en retour (${libelleStatutSendit(p.statutRetour)}) : vérifiez-le à son arrivée au magasin.`;
    }

    const maj: Record<string, unknown> = {
      statut: p.statut,
      statutRetour: p.statutRetour ?? FieldValue.delete(),
      statutLe: le,
      derniereCle: cle,
      historique: historiqueMaj,
      alerte: mention ? { type: mention, explication, statut: p.statut, le } : FieldValue.delete(),
    };
    if (p.lastActionAt) maj.derniereAction = p.lastActionAt;
    if (p.message) maj.message = p.message;
    if (p.deliverBy) maj.nouvelleTentative = p.deliverBy;
    if (typeof p.tentatives === 'number') maj.tentatives = p.tentatives;
    // La photo du livreur reste interne (jamais dans la commande lisible par le client).
    if (p.photo) maj.photo = p.photo;
    if (typeof p.fee === 'number') maj.fee = p.fee;

    const interneMaj: Record<string, unknown> = { sendit: maj, majLe: FieldValue.serverTimestamp() };
    const nouveau = decision.nouveauStatut;
    if (nouveau) {
      tx.update(ref, {
        status: nouveau,
        updatedAt: FieldValue.serverTimestamp(),
        // Même phrase de suivi que lorsqu'un employé change le statut (route interne).
        trackingNotes: FieldValue.arrayUnion({ status: nouveau, message: messageClient(commande, nouveau), timestamp: le }),
      });
      interneMaj.journal = FieldValue.arrayUnion({ statut: nouveau, auteur: AUTEUR_SENDIT, le });
    }
    tx.set(refInterne, interneMaj, { merge: true });
    return { cas: 'ok', nouveauStatut: nouveau, mention };
  });
}
