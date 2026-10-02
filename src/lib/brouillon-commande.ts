// ─── Brouillon du formulaire de commande ─────────────────────────────────────
// Ce que le client tape au checkout est gardé dans ce navigateur pendant la
// saisie : un rechargement, un appel qui coupe le navigateur ou une page fermée
// par erreur ne lui font rien perdre. Effacé après une commande réussie, et par
// « Ce n'est pas moi » (les coordonnées que le client choisit de garder pour la
// suivante sont à part, dans coordonnees-client.ts ; le brouillon passe avant
// elles s'il existe).
//
// Le brouillon garde aussi l'identifiant de la commande, choisi UNE fois : la
// même commande renvoyée (réseau lent, « Réessayer », page rechargée) vise le
// même document shop_orders, jamais un doublon. L'empreinte du contenu dit si
// c'est bien la même commande, ou une nouvelle passée avec le même brouillon.
//
// Rien de sensible ici (ni mot de passe ni moyen de paiement) : nom, téléphone,
// adresse, choix de réception. Chaque accès au localStorage est dans un try/catch.
//
// Le reste est pur : l'empreinte et les messages WhatsApp de secours.

import { formatPrice } from './shop-utils';

const CLE = 'lebtex_checkout_brouillon_v1';
/** Un brouillon plus vieux est oublié : le client ne retrouve pas un vieux formulaire. */
const DUREE_BROUILLON_MS = 30 * 24 * 3600_000;
/** Au-delà, une commande déjà arrivée avec ce contenu est une ancienne commande, pas un nouvel essai. */
const DUREE_MEME_ENVOI_MS = 12 * 3600_000;

export interface BrouillonCommande {
  /** Les champs du formulaire, tels que tapés. */
  champs: Record<string, string>;
  /** Identifiant du document shop_orders, choisi une seule fois. */
  idCommande?: string;
  /** N° montré au client, choisi avec l'identifiant. */
  numeroCommande?: string;
  /** Empreinte du contenu envoyé avec cet identifiant (signatureCommande). */
  signature?: string;
  /** Premier envoi avec cet identifiant (ms) ; absent tant que rien n'est parti. */
  envoyeLe?: number;
  majLe: number;
}

/** Le brouillon de ce navigateur, ou null (aucun, illisible ou trop vieux). */
export function lireBrouillon(maintenant = Date.now()): BrouillonCommande | null {
  try {
    const brut = localStorage.getItem(CLE);
    if (!brut) return null;
    const v = JSON.parse(brut) as Record<string, unknown> | null;
    if (!v || typeof v !== 'object') return null;
    const majLe = typeof v.majLe === 'number' ? v.majLe : 0;
    if (maintenant - majLe > DUREE_BROUILLON_MS) return null;
    const champs: Record<string, string> = {};
    if (v.champs && typeof v.champs === 'object') {
      for (const [cle, valeur] of Object.entries(v.champs as Record<string, unknown>)) {
        if (typeof valeur === 'string') champs[cle] = valeur.slice(0, 1000);
      }
    }
    const texte = (x: unknown, motif: RegExp) => (typeof x === 'string' && motif.test(x) ? x : undefined);
    const idCommande = texte(v.idCommande, /^[A-Za-z0-9]{10,40}$/);
    const b: BrouillonCommande = { champs, majLe };
    if (idCommande) {
      b.idCommande = idCommande;
      const numero = texte(v.numeroCommande, /^LBT-[A-Z0-9-]{3,30}$/);
      if (numero) b.numeroCommande = numero;
      const signature = texte(v.signature, /^[0-9a-f]{1,16}$/);
      if (signature) b.signature = signature;
      if (typeof v.envoyeLe === 'number' && Number.isFinite(v.envoyeLe)) b.envoyeLe = v.envoyeLe;
    }
    return b;
  } catch {
    return null;
  }
}

export function ecrireBrouillon(b: Omit<BrouillonCommande, 'majLe'>, maintenant = Date.now()): void {
  try {
    localStorage.setItem(CLE, JSON.stringify({ ...b, majLe: maintenant }));
  } catch { /* navigation privée, quota : le formulaire marche sans brouillon */ }
}

export function effacerBrouillon(): void {
  try {
    localStorage.removeItem(CLE);
  } catch { /* idem */ }
}

// ─── Même commande ou nouvelle commande ? ────────────────────────────────────

/** Texte stable d'une valeur : les clés d'un objet dans l'ordre alphabétique. */
function texteStable(v: unknown): string {
  if (Array.isArray(v)) return `[${v.map(texteStable).join(',')}]`;
  if (v && typeof v === 'object') {
    return `{${Object.keys(v as object).sort().map(k => `${JSON.stringify(k)}:${texteStable((v as Record<string, unknown>)[k])}`).join(',')}}`;
  }
  return JSON.stringify(v ?? null);
}

/** Empreinte courte du contenu d'une commande (FNV-1a 32 bits) : même contenu → même empreinte. */
export function signatureCommande(contenu: unknown): string {
  const s = texteStable(contenu);
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h.toString(16);
}

/**
 * L'identifiant du brouillon a-t-il déjà servi à envoyer CETTE commande, récemment ?
 * Oui : si la commande existe déjà, c'est l'envoi précédent qui est passé.
 * Non (autre contenu, ou il y a longtemps) : une commande trouvée sous cet identifiant
 * est une autre commande, il en faut un nouveau.
 */
export function memeEnvoi(b: Pick<BrouillonCommande, 'signature' | 'envoyeLe'> | null, signature: string, maintenant = Date.now()): boolean {
  return !!b && b.signature === signature && typeof b.envoyeLe === 'number' && maintenant - b.envoyeLe < DUREE_MEME_ENVOI_MS;
}

/**
 * Renvoyer une commande déjà partie une fois, d'après la vérification sur le serveur
 * (`existe` : true, false, ou null quand le serveur ne répond pas) :
 * - « deja-la » : la même commande est arrivée, c'est un succès ;
 * - « garder » : la renvoyer sous le même identifiant (absente ; ou serveur muet et même
 *   contenu : la règle refuse de réécrire une commande qui existe, on la retrouve alors) ;
 * - « nouveau » : une autre commande, arrivée ou peut-être en route : il faut un nouvel identifiant.
 */
export function suiteRenvoi(existe: boolean | null, meme: boolean): 'deja-la' | 'garder' | 'nouveau' {
  if (existe === true) return meme ? 'deja-la' : 'nouveau';
  if (existe === null && !meme) return 'nouveau';
  return 'garder';
}

// ─── Messages WhatsApp de secours (lus par l'équipe : toujours en français) ──

export interface LigneMessage {
  nom: string;
  /** « Noir · 20 cm », ou vide. */
  variante?: string;
  quantite: number;
  /** Prix unitaire facturé ; 0 = prix à confirmer. */
  prixUnitaire: number;
}

export interface CommandeMessage {
  lignes: LigneMessage[];
  sousTotal: number;
  /** « Livraison à domicile (Casablanca) : 20 MAD », « Retrait gratuit à LEBTEX Derb Omar »… */
  ligneReception: string;
  /** Total connu ; null = à confirmer. */
  total: number | null;
  /** « + transport à confirmer », ou vide. */
  totalEnPlus?: string;
  nom: string;
  telephone: string;
  ville?: string;
  adresse?: string;
  paiement: string;
  remarque?: string;
  /** N° préparé par le site (l'équipe le retrouve si la commande est quand même arrivée). */
  numero?: string;
}

function ligneArticle(l: LigneMessage, i: number): string {
  const prix = l.prixUnitaire > 0 ? ` = ${formatPrice(l.prixUnitaire * l.quantite)}` : ' (prix à confirmer)';
  return `${i + 1}. ${l.nom}${l.variante ? ` (${l.variante})` : ''} × ${l.quantite}${prix}`;
}

/** La commande entière, à envoyer quand le site n'arrive pas à l'enregistrer. */
export function messageWhatsAppCommande(c: CommandeMessage): string {
  const lignes = [
    'Bonjour LEBTEX,',
    'Je n’arrive pas à valider ma commande sur le site. La voici :',
    '',
    ...c.lignes.map(ligneArticle),
    '',
    `Sous-total : ${c.sousTotal > 0 ? formatPrice(c.sousTotal) : 'à confirmer'}`,
    c.ligneReception,
    `Total : ${c.total !== null && c.total > 0 ? formatPrice(c.total) : 'à confirmer'}${c.totalEnPlus ? ` ${c.totalEnPlus}` : ''}`,
    '',
    `Nom : ${c.nom}`,
    `Téléphone : ${c.telephone}`,
    ...(c.ville ? [`Ville : ${c.ville}`] : []),
    ...(c.adresse ? [`Adresse : ${c.adresse}`] : []),
    `Paiement : ${c.paiement}`,
    ...(c.remarque ? [`Remarque : ${c.remarque}`] : []),
    ...(c.numero ? [`Réf. site : ${c.numero}`] : []),
    '',
    'Merci !',
  ];
  return lignes.join('\n');
}

/** Demander le prix des articles du panier qui n'en ont pas encore. */
export function messagePrixAConfirmer(lignes: LigneMessage[]): string {
  return [
    'Bonjour LEBTEX,',
    'Pouvez-vous me donner le prix de ces articles ?',
    '',
    ...lignes.map(l => `• ${l.quantite} × ${l.nom}${l.variante ? ` (${l.variante})` : ''}`),
    '',
    'Merci !',
  ].join('\n');
}
