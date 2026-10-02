// ─── Coordonnées gardées sur le téléphone du client ──────────────────────────
// Après une commande réussie, si la case « Se souvenir de moi sur ce téléphone »
// est cochée quand la commande arrive, on garde dans ce navigateur (localStorage)
// de quoi ne pas tout retaper la fois suivante : nom, téléphone, ville, adresse et
// mode de réception d'un petit colis. Rien d'autre : ni e-mail, ni 2e numéro, ni
// remarque. « Ce n'est pas moi » efface tout : le téléphone d'un atelier passe
// souvent de main en main. Case décochée : on efface aussi.
//
// Chaque accès au localStorage est dans un try/catch : sans lui, le formulaire
// marche comme avant. Le reste est pur (testé avec npx tsx).

import type { ModeReception } from './shop-types';
import { normaliserTelephoneMaroc } from './telephone-maroc';

const CLE = 'lebtex_coordonnees_client_v1';
/** Au-delà d'un an sans commande, on oublie : rien n'est gardé plus longtemps qu'utile. */
const DUREE_MS = 365 * 24 * 3600_000;

export interface CoordonneesClient {
  fullName: string;
  /** Toujours au format 0XXXXXXXXX. */
  phone: string;
  /** Valeur de la liste des villes (nom français), ou la valeur « autre ville » du formulaire. */
  city: string;
  /** Ville écrite à la main. */
  villeAutre: string;
  address: string;
  /**
   * Mode d'une commande de petits articles seulement (domicile, ou retrait à Derb Omar).
   * Celui d'un rouleau n'est jamais gardé : son retrait est à CHRIFA, et pour un rouleau
   * le client choisit toujours lui-même entre retrait et transport.
   */
  mode: Extract<ModeReception, 'domicile' | 'retrait'> | '';
}

type Champs = Record<keyof CoordonneesClient, unknown>;

const texte = (v: unknown, max: number) => (typeof v === 'string' ? v.trim().slice(0, max) : '');

/**
 * Ce qu'on garde des champs du formulaire, ou null quand il n'y a rien d'utile
 * (nom vide, numéro non reconnu). `volumineux` : la commande contenait un rouleau
 * (son mode n'est pas gardé).
 */
export function coordonneesAGarder(champs: Champs, volumineux = false): CoordonneesClient | null {
  const fullName = texte(champs.fullName, 120).replace(/\s+/g, ' ');
  const phone = normaliserTelephoneMaroc(champs.phone);
  if (!fullName || !phone) return null;
  const mode = !volumineux && (champs.mode === 'domicile' || champs.mode === 'retrait') ? champs.mode : '';
  return {
    fullName,
    phone,
    city: texte(champs.city, 80),
    villeAutre: texte(champs.villeAutre, 60),
    address: texte(champs.address, 300),
    mode,
  };
}

/** Relit ce qui a été gardé : null si rien, illisible ou trop vieux. */
export function coordonneesLues(brut: unknown, maintenant = Date.now()): CoordonneesClient | null {
  if (!brut || typeof brut !== 'object') return null;
  const v = brut as Champs & { majLe?: unknown };
  if (typeof v.majLe !== 'number' || maintenant - v.majLe > DUREE_MS) return null;
  return coordonneesAGarder(v);
}

export function lireCoordonnees(maintenant = Date.now()): CoordonneesClient | null {
  try {
    const brut = localStorage.getItem(CLE);
    return brut ? coordonneesLues(JSON.parse(brut), maintenant) : null;
  } catch {
    return null;
  }
}

export function ecrireCoordonnees(c: CoordonneesClient, maintenant = Date.now()): void {
  try {
    localStorage.setItem(CLE, JSON.stringify({ ...c, majLe: maintenant }));
  } catch { /* navigation privée, quota : le client retapera, rien de plus */ }
}

export function effacerCoordonnees(): void {
  try {
    localStorage.removeItem(CLE);
  } catch { /* idem */ }
}

/**
 * Le mode à cocher d'office pour le panier en cours : celui gardé, seulement pour
 * un panier de petits articles (le magasin de retrait est alors le même, Derb Omar).
 */
export function modeRepris(c: Pick<CoordonneesClient, 'mode'>, volumineux: boolean): CoordonneesClient['mode'] {
  return !volumineux && (c.mode === 'domicile' || c.mode === 'retrait') ? c.mode : '';
}

/**
 * Le nom pour dire bonjour : le nom gardé en entier, jamais un premier mot qui ne
 * veut rien dire seul (« Abd », « عبد », « Mercerie », « Mme »). Au-delà de
 * 30 caractères, coupé entre deux mots, avec « … ».
 */
export function nomPourSaluer(nom: string): string {
  const n = String(nom ?? '').trim().replace(/\s+/g, ' ');
  if (n.length <= 30) return n;
  const debut = n.slice(0, 30);
  const espace = debut.lastIndexOf(' ');
  return `${espace > 0 ? debut.slice(0, espace) : debut}…`;
}

/** Le formulaire montre-t-il encore la personne gardée (même nom, même numéro) ? */
export function memeClient(c: CoordonneesClient, champs: { fullName: string; phone: string }): boolean {
  const nom = (s: string) => s.trim().replace(/\s+/g, ' ').toLowerCase();
  return nom(champs.fullName) === nom(c.fullName) && normaliserTelephoneMaroc(champs.phone) === c.phone;
}
