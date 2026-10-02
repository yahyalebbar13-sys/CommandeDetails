// ─── Commandes de la boutique en ligne : outils partagés ─────────────────────
// Ce qu'il faut pour recevoir et traiter une commande lebtex.ma : les files de
// travail (à confirmer, à préparer…), les téléphones du client au bon format,
// les messages WhatsApp prêts à envoyer, le prix réellement appliqué à chaque
// ligne, et depuis le 29/09/2026 le mode de réception (colis Sendit, retrait,
// transport d'un rouleau) et le moyen de paiement. Sert à /admin-shop, au bon
// de livraison PDF et aux e-mails.
//
// Pur (ni Firebase ni React) : testé par scripts/test-commandes-boutique.ts.

import type {
  CartItem, LieuRetrait, ModeReception, MoyenPaiement, OrderStatus, ReceptionCommande, ShopOrder,
} from './shop-types';
import { ORDER_STATUS_LABELS } from './shop-types';
import { formatPrice } from './shop-utils';
import { normaliserRecherche } from './recherche-commandes';
import { estCasablanca, estPeripherieCasablanca, fraisColis, fraisLivraison, lieuRetraitPour } from './livraison-boutique';
import { REGLAGES_RECEPTION_DEFAUT, type LieuDeRetrait, type ReglagesReception } from './reglages-reception';

/**
 * Objectif de l'équipe : rappeler sous 2 h (au-delà, la commande est « en retard »). Le
 * client, lui, lit depuis le 02/10/2026 « aujourd'hui pendant nos horaires, sinon le jour
 * ouvré suivant » : plus de promesse « sous 2 h », intenable le soir et le dimanche.
 */
export const DELAI_CONFIRMATION_MS = 2 * 60 * 60 * 1000;

/** Adresse publique du site, pour les liens envoyés au client (jamais tirée d'une requête). */
const SITE_URL = 'https://www.lebtex.ma';

const FUSEAU = 'Africa/Casablanca';

// ─── N° de commande et texte libre du client ─────────────────────────────────
// Tout ce qu'il y a dans une commande est écrit par le navigateur du client (la
// création est ouverte à tous). Ce qui sort de LEBTEX vers un client (accusé de
// réception automatique, page de confirmation, motif du virement) ne doit pas
// pouvoir porter un faux « nouveau RIB LEBTEX » glissé dans le n° ou le nom.

/** Forme des n° du checkout (generateOrderNumber) : « LBT-MG2K3H7P-X9QF ». */
const FORMAT_NUMERO_COMMANDE = /^LBT-[A-Z0-9]{6,12}-[A-Z0-9]{1,6}$/;

export function numeroCommandeValide(n: unknown): boolean {
  return typeof n === 'string' && FORMAT_NUMERO_COMMANDE.test(n.trim());
}

/**
 * Le n° à montrer au client : celui du checkout s'il en a la forme, sinon
 * l'identifiant du document (un n° inventé ne part jamais tel quel).
 */
export function numeroCommandeAffichable(o: { orderNumber?: unknown; id?: unknown }): string {
  const n = typeof o?.orderNumber === 'string' ? o.orderNumber.trim() : '';
  if (FORMAT_NUMERO_COMMANDE.test(n)) return n;
  return typeof o?.id === 'string' && /^[A-Za-z0-9_-]{1,100}$/.test(o.id) ? o.id : 'à confirmer';
}

/**
 * Texte libre du client montré hors de l'admin : une ligne, bornée, et toute suite
 * de 8 chiffres ou plus (RIB, n° de compte) masquée. Un nom « Nouveau RIB 0077… »
 * ne devient pas un message de LEBTEX.
 */
export function texteClientSur(v: unknown, max = 120): string {
  const s = chiffresLatins(String(v ?? ''))
    .replace(/[\u0000-\u001f\u007f]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/\d(?:[\s.\-_/]*\d){7,}/g, '•••');
  return s.length > max ? `${s.slice(0, max - 1).trimEnd()}…` : s;
}

// ─── Dates ────────────────────────────────────────────────────────────────────

/** Date d'un champ Firestore (Timestamp client ou serveur, {seconds}, Date, ISO, nombre). */
export function dateDe(v: any): Date | null {
  if (v === null || v === undefined || v === '') return null;
  try {
    if (typeof v?.toDate === 'function') return v.toDate();
    if (v instanceof Date) return isNaN(v.getTime()) ? null : v;
    const secondes = v?.seconds ?? v?._seconds;
    if (typeof secondes === 'number') return new Date(secondes * 1000);
    const d = new Date(v);
    return isNaN(d.getTime()) ? null : d;
  } catch {
    return null;
  }
}

/** Instant de création en millisecondes ; une commande tout juste écrite (horodatage pas encore revenu) compte pour « maintenant ». */
export function msDe(v: any, maintenant = Date.now()): number {
  return dateDe(v)?.getTime() ?? maintenant;
}

const jourDe = (d: Date) =>
  new Intl.DateTimeFormat('en-CA', { timeZone: FUSEAU, year: 'numeric', month: '2-digit', day: '2-digit' }).format(d);
const heureDe = (d: Date) =>
  new Intl.DateTimeFormat('fr-FR', { timeZone: FUSEAU, hour: '2-digit', minute: '2-digit' }).format(d);

/** « aujourd'hui à 14:05 », « hier à 09:12 », « 27/09/2026 à 14:05 » — heure du Maroc, même sur le serveur. */
export function dateHeure(v: any, maintenant = Date.now()): string {
  const d = dateDe(v);
  if (!d) return '—';
  const jour = jourDe(d);
  if (jour === jourDe(new Date(maintenant))) return `aujourd'hui à ${heureDe(d)}`;
  if (jour === jourDe(new Date(maintenant - 86_400_000))) return `hier à ${heureDe(d)}`;
  const date = new Intl.DateTimeFormat('fr-FR', { timeZone: FUSEAU, day: '2-digit', month: '2-digit', year: 'numeric' }).format(d);
  return `${date} à ${heureDe(d)}`;
}

/** « à l'instant », « il y a 12 min », « il y a 2 h 15 », « il y a 3 j ». */
export function depuisQuand(v: any, maintenant = Date.now()): string {
  const d = dateDe(v);
  if (!d) return "à l'instant";
  const minutes = Math.max(0, Math.floor((maintenant - d.getTime()) / 60_000));
  if (minutes < 1) return "à l'instant";
  if (minutes < 60) return `il y a ${minutes} min`;
  const heures = Math.floor(minutes / 60);
  if (heures < 24) {
    const reste = minutes % 60;
    return heures < 3 && reste ? `il y a ${heures} h ${String(reste).padStart(2, '0')}` : `il y a ${heures} h`;
  }
  return `il y a ${Math.floor(heures / 24)} j`;
}

/** En attente depuis plus longtemps que l'appel promis au client. */
export function enRetard(o: Pick<ShopOrder, 'status' | 'createdAt'>, maintenant = Date.now()): boolean {
  return o.status === 'pending' && maintenant - msDe(o.createdAt, maintenant) > DELAI_CONFIRMATION_MS;
}

// ─── Téléphones ───────────────────────────────────────────────────────────────

/**
 * Chiffres arabes-indiens (٠-٩, clavier arabe) et persans (۰-۹) → chiffres latins.
 * Le 2e numéro n'est pas vérifié au checkout : sans cela, `\D` effaçait « ٠٦١٢… » et le numéro disparaissait.
 */
function chiffresLatins(s: string): string {
  return s.replace(/[٠-٩۰-۹]/g, c => String(c.charCodeAt(0) & 0xf));
}

/** Numéro au format international, chiffres seuls : « 06 12-34 56 78 », « +212612345678 », « 00212… » → « 212612345678 ». */
export function telInternational(tel?: string | null): string {
  let chiffres = chiffresLatins(String(tel ?? '')).replace(/\D/g, '');
  if (!chiffres) return '';
  if (chiffres.startsWith('00')) chiffres = chiffres.slice(2);
  if (chiffres.startsWith('212')) return chiffres;
  if (chiffres.startsWith('0')) return `212${chiffres.slice(1)}`;
  if (chiffres.length === 9) return `212${chiffres}`;
  return chiffres;
}

/** Affichage à la marocaine : « 06 12 34 56 78 » ; un numéro étranger garde son indicatif. */
export function telLisible(tel?: string | null): string {
  const inter = telInternational(tel);
  if (!inter) return '';
  if (inter.startsWith('212') && inter.length === 12) {
    return `0${inter.slice(3)}`.replace(/(\d{2})(?=\d)/g, '$1 ');
  }
  return `+${inter}`;
}

/** Lien d'appel en un appui : « tel:+212612345678 ». */
export function lienAppel(tel?: string | null): string | undefined {
  const inter = telInternational(tel);
  return inter ? `tel:+${inter}` : undefined;
}

/** Lien WhatsApp vers le client, message déjà écrit. */
export function lienWhatsAppClient(tel: string | null | undefined, message: string): string | undefined {
  const inter = telInternational(tel);
  return inter ? `https://wa.me/${inter}?text=${encodeURIComponent(message)}` : undefined;
}

/** Les téléphones de la commande, principal d'abord, sans doublon. */
export function telephonesCommande(o: Pick<ShopOrder, 'customerPhone' | 'shippingAddress'>): string[] {
  const vus = new Set<string>();
  const liste: string[] = [];
  for (const t of [o.customerPhone, o.shippingAddress?.phone, o.shippingAddress?.phone2]) {
    const inter = telInternational(t);
    if (inter && !vus.has(inter)) {
      vus.add(inter);
      liste.push(String(t).trim());
    }
  }
  return liste;
}

// ─── Lignes de commande ───────────────────────────────────────────────────────

/** Ligne telle qu'enregistrée : le checkout y ajoute le prix appliqué depuis septembre 2026. */
export type LigneCommande = CartItem & { unitPrice?: number };

/** Modèle, couleur et taille choisis, dans cet ordre ; seulement ce qui est renseigné. */
export function detailsVariante(v?: CartItem['variant'] | null): { libelle: string; valeur: string }[] {
  if (!v) return [];
  return [
    { libelle: 'Modèle', valeur: v.model },
    { libelle: 'Couleur', valeur: v.color },
    { libelle: 'Taille', valeur: v.size },
  ]
    .filter((d): d is { libelle: string; valeur: string } => !!String(d.valeur ?? '').trim())
    .map(d => ({ libelle: d.libelle, valeur: String(d.valeur).trim() }));
}

/** « Modèle A · Rouge · 42 » (valeurs seules), ou '' sans variante. */
export function varianteLisible(v?: CartItem['variant'] | null): string {
  return detailsVariante(v).map(d => d.valeur).join(' · ');
}

/** Prix unitaire réellement facturé : celui enregistré à la commande (prix de gros compris), sinon le prix de base. */
export function prixUnitaireLigne(item: LigneCommande): number {
  return typeof item.unitPrice === 'number' ? item.unitPrice : Number(item.price) || 0;
}

export function totalLigne(item: LigneCommande): number {
  return prixUnitaireLigne(item) * (Number(item.quantity) || 0);
}

/** Somme des lignes. */
export function totalDesLignes(o: Pick<ShopOrder, 'items'>): number {
  return (o.items || []).reduce((s, i) => s + totalLigne(i), 0);
}

/**
 * Les lignes affichées donnent-elles le sous-total ? Non sur une ancienne commande
 * où le prix de gros s'est appliqué : les lignes n'ont gardé que le prix de base.
 */
export function lignesCollentAuSousTotal(o: Pick<ShopOrder, 'items' | 'subtotal'>): boolean {
  return Math.abs(totalDesLignes(o) - (Number(o.subtotal) || 0)) < 0.5;
}

/** Lignes « sur demande » : arrivées sans prix, à fixer avec le client. */
export function lignesSansPrix(o: Pick<ShopOrder, 'items'>): LigneCommande[] {
  return (o.items || []).filter(i => prixUnitaireLigne(i) <= 0);
}

export function nombreArticles(o: Pick<ShopOrder, 'items'>): number {
  return (o.items || []).reduce((s, i) => s + (Number(i.quantity) || 0), 0);
}

// ─── Réception et paiement ────────────────────────────────────────────────────
// La commande dit comment le client la reçoit (reception) et comment il paie
// (paymentMethod). Les deux viennent du navigateur du client : on les relit ici,
// une valeur inconnue retombant sur ce qu'étaient toutes les anciennes commandes
// (colis à domicile, espèces).

const MODES: ModeReception[] = ['domicile', 'retrait', 'transport'];
const MOYENS: MoyenPaiement[] = ['cod', 'virement', 'carte'];

/** Plafonds d'espèces validés par le patron le 29/09/2026. */
export const PLAFOND_ESPECES_COLIS = 3000;
export const PLAFOND_ESPECES_TOURNEE = 5000;

/** Nom court des magasins, dans les badges et les files. */
export const NOMS_LIEUX: Record<LieuRetrait, string> = { derb_omar: 'Derb Omar', chrifa: 'CHRIFA' };

export const LIBELLES_PAIEMENT: Record<MoyenPaiement, string> = {
  cod: 'Espèces',
  virement: 'Virement bancaire',
  carte: 'Carte bancaire',
};

/** La réception telle qu'on la traite. */
export interface ReceptionLue {
  mode: ModeReception;
  /** Au moins un article volumineux (rouleau entier) : jamais de colis Sendit. */
  volumineux: boolean;
  /**
   * Magasin où la commande se prépare, et où elle se retire en cas de retrait :
   * CHRIFA (le stock) pour un volumineux, Derb Omar pour les petits articles.
   */
  lieu: LieuRetrait;
  /** Ce que le client préfère pour un transport (confirmé à l'appel). */
  preferenceTransport?: 'camionnette' | 'transporteur';
}

/** Réception d'une commande ; absente (commande d'avant le 29/09/2026) = colis à domicile. */
export function receptionDe(o: Pick<ShopOrder, 'reception' | 'items'>): ReceptionLue {
  const r = (o?.reception && typeof o.reception === 'object' ? o.reception : {}) as Partial<ReceptionCommande>;
  // Une ligne volumineuse suffit, même si le navigateur a oublié de le dire dans `reception`.
  const volumineux = r.volumineux === true || (Array.isArray(o?.items) ? o.items : []).some(i => i?.volumineux === true);
  const mode = MODES.includes(r.mode as ModeReception) ? (r.mode as ModeReception) : 'domicile';
  const lieu = mode === 'retrait' && (r.lieuRetrait === 'chrifa' || r.lieuRetrait === 'derb_omar')
    ? r.lieuRetrait
    : lieuRetraitPour(volumineux);
  const preference = r.preferenceTransport === 'camionnette' || r.preferenceTransport === 'transporteur'
    ? r.preferenceTransport
    : undefined;
  return { mode, volumineux, lieu, ...(preference ? { preferenceTransport: preference } : {}) };
}

/** Moyen de paiement choisi ; les anciennes commandes (champ absent ou inconnu) : espèces. */
export function moyenPaiementDe(o: Pick<ShopOrder, 'paymentMethod'>): MoyenPaiement {
  return MOYENS.includes(o?.paymentMethod as MoyenPaiement) ? (o.paymentMethod as MoyenPaiement) : 'cod';
}

/**
 * Pour un transport : camionnette LEBTEX (Casablanca et périphérie) ou transporteur
 * de Derb Omar (autres villes). La préférence du client d'abord, sinon selon la ville.
 */
export function transportPrevu(o: Pick<ShopOrder, 'reception' | 'items' | 'shippingAddress'>): 'camionnette' | 'transporteur' {
  const r = receptionDe(o);
  if (r.preferenceTransport) return r.preferenceTransport;
  const ville = String(o.shippingAddress?.city ?? '');
  return estCasablanca(ville) || estPeripherieCasablanca(ville) ? 'camionnette' : 'transporteur';
}

/** « Colis Sendit », « Retrait à CHRIFA », « Transport : camionnette », « Transport à organiser ». */
export function libelleMode(r: ReceptionLue): string {
  if (r.mode === 'retrait') return `Retrait à ${NOMS_LIEUX[r.lieu]}`;
  if (r.mode === 'transport') return r.preferenceTransport ? `Transport : ${r.preferenceTransport}` : 'Transport à organiser';
  return 'Colis Sendit';
}

/** Commande à rouleau(x) ou à transport : c'est l'équipe qui l'organise au téléphone. */
export function transportAOrganiser(o: Pick<ShopOrder, 'status' | 'reception' | 'items'>): boolean {
  const r = receptionDe(o);
  return (r.volumineux || r.mode === 'transport') && ['pending', 'confirmed', 'processing'].includes(o.status);
}

/** Un rouleau commandé « à domicile » : Sendit ne le prendra pas, il faut rappeler le client. */
export function volumineuxEnColis(o: Pick<ShopOrder, 'reception' | 'items'>): boolean {
  const r = receptionDe(o);
  return r.volumineux && r.mode === 'domicile';
}

/** Rouleau(x) ET petits articles dans la même commande : deux magasins, un seul départ. */
export function commandeMixte(o: Pick<ShopOrder, 'items'>): boolean {
  const items = Array.isArray(o?.items) ? o.items : [];
  return items.some(i => i?.volumineux === true) && items.some(i => i?.volumineux !== true);
}

/** Plan §2.5 : tout se regroupe la veille au lieu d'où part l'envoi (CHRIFA pour un rouleau). */
export const CONSIGNE_COMMANDE_MIXTE =
  'Commande mixte : petits articles à préparer à Derb Omar et à apporter à CHRIFA la veille '
  + '(ou à envoyer à part par Sendit si le client le demande).';

/** Mention d'une ligne « rouleau entier » dans la fiche, les e-mails et les bons. */
export const MENTION_LIGNE_ROULEAU = 'Rouleau · CHRIFA';

// ─── Frais d'un colis attendus ────────────────────────────────────────────────

/**
 * Livraison offerte avant le 29/09/2026 (100 DH à Casablanca, 500 DH ailleurs) : une
 * commande de cette époque (sans `reception`) à 0 DH au-dessus de ces seuils était
 * vraiment offerte. On ne lui applique pas les seuils suivants.
 */
export const ANCIENS_SEUILS_OFFERTE = { casablanca: 100, autres: 500 } as const;

/** Du 29/09/2026 à la fin de la livraison offerte : 300 DH à Casablanca, 650 DH ailleurs. */
export const SEUILS_OFFERTE_SEPTEMBRE = { casablanca: 300, autres: 650 } as const;

/**
 * Fin de toute livraison offerte : le 30/09/2026 à midi (heure du Maroc). Une commande
 * passée après paie toujours son colis ; une commande d'avant garde la règle de sa date.
 */
export const FIN_LIVRAISON_OFFERTE = Date.UTC(2026, 8, 30, 11, 0);

/** Commande passée avant les modes de réception (champ `reception` absent). */
export function commandeAncienne(o: Pick<ShopOrder, 'reception'>): boolean {
  return !o?.reception || typeof o.reception !== 'object';
}

/**
 * Frais de colis que la commande devrait porter : le palier de la ville ; 0 seulement pour
 * une commande d'avant la fin de la livraison offerte qui atteignait le seuil de sa date ;
 * null quand on ne compare pas (ancienne commande payée selon l'ancienne grille, 25 à
 * 50 DH). Le seuil se calcule sur la somme des lignes, jamais sur le sous-total (écrit par
 * le navigateur du client). Sans date (commande tout juste écrite) : règle d'aujourd'hui.
 */
export function fraisColisAttendus(
  o: Pick<ShopOrder, 'reception' | 'items' | 'shippingAddress' | 'deliveryFee'> & { createdAt?: unknown },
): number | null {
  const ville = String(o?.shippingAddress?.city ?? '');
  const lignes = totalDesLignes(o);
  const casa = estCasablanca(ville);
  if (commandeAncienne(o)) {
    if ((Number(o.deliveryFee) || 0) > 0) return null;
    const seuil = casa ? ANCIENS_SEUILS_OFFERTE.casablanca : ANCIENS_SEUILS_OFFERTE.autres;
    return lignes >= seuil ? 0 : fraisColis(ville);
  }
  const date = dateDe(o?.createdAt)?.getTime();
  if (date !== undefined && date < FIN_LIVRAISON_OFFERTE) {
    const seuil = casa ? SEUILS_OFFERTE_SEPTEMBRE.casablanca : SEUILS_OFFERTE_SEPTEMBRE.autres;
    if (lignes >= seuil) return 0;
  }
  return fraisLivraison({ mode: 'domicile', ville });
}

/**
 * Rappel d'argent pour l'équipe quand un plafond d'espèces est dépassé, sinon null.
 * On propose le virement, on n'impose rien : c'est au téléphone que ça se règle.
 */
export function alerteEspeces(o: Pick<ShopOrder, 'paymentMethod' | 'reception' | 'items' | 'total' | 'shippingAddress'>): string | null {
  if (moyenPaiementDe(o) !== 'cod') return null;
  const total = Number(o.total) || 0;
  const { mode, volumineux } = receptionDe(o);
  // Un rouleau commandé « à domicile » ne partira pas par Sendit : c'est un transport.
  const transport = mode === 'transport' || (mode === 'domicile' && volumineux);
  if (mode === 'domicile' && !volumineux && total > PLAFOND_ESPECES_COLIS) {
    return `Plus de ${formatPrice(PLAFOND_ESPECES_COLIS)} en espèces pour un colis Sendit : proposez le virement, ou arrangez le paiement au téléphone.`;
  }
  // Le plafond est celui de la camionnette LEBTEX : le transporteur de Derb Omar a ses propres règles, convenues au téléphone.
  if (transport && transportPrevu(o) === 'camionnette' && total > PLAFOND_ESPECES_TOURNEE) {
    return `Plus de ${formatPrice(PLAFOND_ESPECES_TOURNEE)} : au-delà des espèces permises sur une tournée de camionnette. Proposez le virement.`;
  }
  return null;
}

/** Le paiement vu par la fiche (rangé dans shop_orders_interne/{id}.paiement par l'administrateur). */
export interface PaiementInterne {
  recu: boolean;
  /** Date ISO de l'enregistrement. */
  le?: string;
  /** Qui l'a noté (administrateur). */
  par?: string;
  note?: string;
}

/** Une ligne sur l'argent : « En attente du virement », « Reçu le … par … », « À encaisser au retrait »… */
export function etatPaiementLisible(
  o: Pick<ShopOrder, 'paymentMethod' | 'reception' | 'items' | 'status'>,
  paiement?: PaiementInterne | null,
  maintenant = Date.now(),
): string {
  if (paiement?.recu) {
    const quand = paiement.le ? dateHeure(paiement.le, maintenant) : '';
    return `Reçu${quand ? ` ${/^\d/.test(quand) ? `le ${quand}` : quand}` : ''}${paiement.par ? ` par ${paiement.par}` : ''}`;
  }
  const moyen = moyenPaiementDe(o);
  if (moyen === 'virement') return 'En attente du virement (à vérifier sur le compte)';
  if (moyen === 'carte') return 'En attente du paiement par carte';
  if (o.status === 'delivered') return 'Payée en espèces';
  const { mode } = receptionDe(o);
  if (mode === 'retrait') return 'Espèces à encaisser au retrait';
  if (mode === 'transport') return 'À encaisser à la livraison, comme convenu au téléphone';
  return 'Espèces à encaisser par le livreur Sendit';
}

// ─── Files de travail ─────────────────────────────────────────────────────────

export type FileCommandes =
  | 'a_confirmer' | 'a_preparer' | 'transport' | 'a_retirer' | 'en_livraison' | 'livrees' | 'annulees' | 'toutes';

export interface DefinitionFile {
  id: FileCommandes;
  libelle: string;
  statuts: OrderStatus[];
  /** La plus ancienne en haut : c'est elle qui attend depuis le plus longtemps. */
  plusAncienneEnHaut: boolean;
  /** Ce qu'on fait des commandes de cette file. */
  consigne: string;
  /**
   * Condition en plus du statut. « Transport à organiser » regarde le contenu de
   * la commande : une commande y est AUSSI dans « À confirmer » ou « À préparer ».
   */
  condition?: (o: Pick<ShopOrder, 'status' | 'reception' | 'items'>) => boolean;
}

export const FILES: DefinitionFile[] = [
  { id: 'a_confirmer', libelle: 'À confirmer', statuts: ['pending'], plusAncienneEnHaut: true,
    consigne: 'Appeler ou écrire au client pour confirmer la commande, l’adresse et le mode de réception.' },
  { id: 'a_preparer', libelle: 'À préparer', statuts: ['confirmed', 'processing'], plusAncienneEnHaut: true,
    consigne: 'Préparer avec le bon de livraison : petits articles à Derb Omar, rouleaux à CHRIFA.' },
  { id: 'transport', libelle: 'Transport à organiser', statuts: ['pending', 'confirmed', 'processing'], plusAncienneEnHaut: true,
    condition: transportAOrganiser,
    consigne: 'Rouleaux et gros envois : appeler le client pour fixer le retrait à CHRIFA, la camionnette ou le transporteur, et le prix du transport.' },
  { id: 'a_retirer', libelle: 'À retirer', statuts: ['ready_for_pickup'], plusAncienneEnHaut: true,
    consigne: 'Prêtes au magasin : le client paie et signe au retrait. Relancer au 2e jour, annuler au 7e jour ouvré.' },
  { id: 'en_livraison', libelle: 'En livraison', statuts: ['shipped', 'out_for_delivery'], plusAncienneEnHaut: true,
    consigne: 'Partie avec Sendit, la camionnette ou le transporteur : marquer « livrée » quand l’argent est encaissé.' },
  { id: 'livrees', libelle: 'Livrées', statuts: ['delivered'], plusAncienneEnHaut: false,
    consigne: 'Livrées ou retirées, et encaissées.' },
  { id: 'annulees', libelle: 'Annulées / retours', statuts: ['cancelled', 'returned'], plusAncienneEnHaut: false,
    consigne: 'Annulées avant l’envoi ou revenues au dépôt.' },
  { id: 'toutes', libelle: 'Toutes', statuts: [], plusAncienneEnHaut: false, consigne: 'Tout l’historique.' },
];

/** La file « de statut » d'une commande (hors « Transport à organiser », qui s'ajoute par-dessus). */
export function fileDe(statut: OrderStatus): FileCommandes {
  return FILES.find(f => !f.condition && f.statuts.includes(statut))?.id ?? 'toutes';
}

function estDansLaFile(def: DefinitionFile, o: Pick<ShopOrder, 'status' | 'reception' | 'items'>): boolean {
  if (def.statuts.length > 0 && !def.statuts.includes(o.status)) return false;
  return def.condition ? def.condition(o) : true;
}

/** Nombre de commandes par file (« toutes » compris). Une commande à transport compte aussi dans sa file de statut. */
export function compteParFile(orders: Pick<ShopOrder, 'status' | 'reception' | 'items'>[]): Record<FileCommandes, number> {
  const comptes = Object.fromEntries(FILES.map(f => [f.id, 0])) as Record<FileCommandes, number>;
  for (const o of orders) {
    for (const f of FILES) if (estDansLaFile(f, o)) comptes[f.id]++;
  }
  return comptes;
}

/** Commandes d'une file qui répondent à la recherche, dans l'ordre de traitement. */
export function commandesDeLaFile<T extends ShopOrder>(orders: T[], file: FileCommandes, recherche = '', maintenant = Date.now()): T[] {
  const def = FILES.find(f => f.id === file) ?? FILES[FILES.length - 1];
  const sens = def.plusAncienneEnHaut ? 1 : -1;
  return orders
    .filter(o => estDansLaFile(def, o) && commandeRepond(o, recherche))
    .sort((a, b) => sens * (msDe(a.createdAt, maintenant) - msDe(b.createdAt, maintenant)));
}

// ─── Recherche ────────────────────────────────────────────────────────────────

/** Formes sous lesquelles un numéro peut être tapé : « 0612… » comme « 212612… ». */
function formesTelephone(tel: string): string[] {
  const inter = telInternational(tel);
  if (!inter) return [];
  return inter.startsWith('212') ? [inter, `0${inter.slice(3)}`] : [inter];
}

/**
 * La commande répond-elle à la recherche ? Par numéro de commande, nom, téléphone
 * (« 06 12 34 », « +212 6 12 » ou « 612 34 »), ville, adresse, e-mail ou produit.
 * Plusieurs mots : tous doivent se retrouver. Sans accents ni casse.
 */
export function commandeRepond(o: ShopOrder, recherche: string): boolean {
  const q = normaliserRecherche(recherche);
  if (!q) return true;

  const tels = telephonesCommande(o).flatMap(formesTelephone);
  const chiffresTapes = q.replace(/[\s.\-+()/]/g, '');
  if (/^\d{3,}$/.test(chiffresTapes)) {
    const cherches = formesTelephone(chiffresTapes).concat(chiffresTapes);
    if (tels.some(t => cherches.some(c => t.includes(c)))) return true;
  }

  // Le mode aussi : « chrifa », « retrait », « volumineux », « virement » retrouvent leurs commandes.
  const r = receptionDe(o);
  const texte = normaliserRecherche([
    o.orderNumber, o.customerName, o.shippingAddress?.fullName, o.shippingAddress?.city,
    o.shippingAddress?.address, o.shippingAddress?.region, o.customerEmail,
    ...(o.items || []).flatMap(i => [i.productName, varianteLisible(i.variant)]),
    libelleMode(r), r.volumineux ? 'volumineux rouleau' : '', LIBELLES_PAIEMENT[moyenPaiementDe(o)],
    ...tels,
  ].filter(Boolean).join(' '));
  return q.split(' ').every(mot => texte.includes(mot));
}

// ─── Étapes et statuts ────────────────────────────────────────────────────────

export interface Etape { statut: OrderStatus; libelle: string }

const CONFIRMER: Etape = { statut: 'confirmed', libelle: 'Client joint — confirmer' };
const PREPARER: Etape = { statut: 'processing', libelle: 'Commencer la préparation' };
const RETIREE: Etape = { statut: 'delivered', libelle: 'Retirée et payée' };

/**
 * Le gros bouton de la fiche pour un colis à domicile (et les anciennes commandes).
 * Gardé pour ce qui l'importait avant les modes ; préférer etapeSuivante(o).
 */
export const ETAPE_SUIVANTE: Partial<Record<OrderStatus, Etape>> = {
  pending: CONFIRMER,
  confirmed: PREPARER,
  processing: { statut: 'shipped', libelle: 'Remis au livreur' },
  shipped: { statut: 'delivered', libelle: 'Livrée et payée' },
  out_for_delivery: { statut: 'delivered', libelle: 'Livrée et payée' },
  ready_for_pickup: RETIREE,
};

const ETAPES_PAR_MODE: Record<ModeReception, Partial<Record<OrderStatus, Etape>>> = {
  domicile: ETAPE_SUIVANTE,
  // Retrait : pas de livreur ; la commande attend au magasin, le client paie en la prenant.
  retrait: {
    pending: CONFIRMER,
    confirmed: PREPARER,
    processing: { statut: 'ready_for_pickup', libelle: 'Prête à retirer' },
    ready_for_pickup: RETIREE,
    shipped: { statut: 'delivered', libelle: 'Livrée et payée' },
    out_for_delivery: { statut: 'delivered', libelle: 'Livrée et payée' },
  },
  // Transport : la camionnette livre ; le transporteur dépose à son dépôt, où le client récupère.
  transport: {
    pending: CONFIRMER,
    confirmed: PREPARER,
    processing: { statut: 'shipped', libelle: 'Remis au chauffeur / au transporteur' },
    shipped: { statut: 'delivered', libelle: 'Livrée / récupérée et payée' },
    out_for_delivery: { statut: 'delivered', libelle: 'Livrée / récupérée et payée' },
    ready_for_pickup: RETIREE,
  },
};

/** Le gros bouton de la fiche : l'étape qui suit, selon le mode de réception (null : plus rien à faire). */
export function etapeSuivante(o: Pick<ShopOrder, 'status' | 'reception' | 'items'>): Etape | null {
  return ETAPES_PAR_MODE[receptionDe(o).mode][o.status] ?? null;
}

/** Statuts qu'on ne pose pas par erreur : ils demandent une confirmation. */
export const STATUTS_SENSIBLES: OrderStatus[] = ['cancelled', 'returned', 'delivered'];

/** Pourquoi une commande est annulée : gardé pour soi, jamais montré au client. */
export const MOTIFS_ANNULATION = [
  'Client injoignable',
  'Le client a annulé',
  'Faux numéro / commande test',
  'Produit indisponible',
  'Doublon d’une autre commande',
  'Non venu au retrait',
  'Prix du transport refusé',
  'Transformée en vente /stock',
  'Autre',
] as const;

/** Phrase ajoutée au suivi que le client voit dans son compte, à chaque changement (colis à domicile). */
export const MESSAGE_CLIENT: Record<OrderStatus, string> = {
  pending: 'Commande reçue — nous vous appelons pour la confirmer.',
  confirmed: 'Commande confirmée.',
  processing: 'Votre commande est en préparation.',
  ready_for_pickup: 'Votre commande est prête : vous pouvez venir la retirer.',
  shipped: 'Votre colis est parti avec le livreur.',
  out_for_delivery: 'Le livreur est en route.',
  delivered: 'Commande livrée. Merci pour votre confiance !',
  cancelled: 'Commande annulée.',
  returned: 'Commande retournée.',
};

/** La phrase du suivi client, selon le mode : on ne parle pas de « livreur » à qui vient retirer. */
export function messageClient(o: Pick<ShopOrder, 'reception' | 'items'>, statut: OrderStatus): string {
  const { mode } = receptionDe(o);
  if (mode === 'retrait') {
    if (statut === 'processing') return 'Votre commande est en préparation. Nous vous confirmons le jour de retrait par WhatsApp.';
    if (statut === 'delivered') return 'Commande retirée. Merci pour votre confiance !';
  }
  if (mode === 'transport') {
    if (statut === 'confirmed') return 'Commande confirmée. Nous organisons le transport avec vous.';
    if (statut === 'shipped') return 'Votre commande est partie avec notre chauffeur ou le transporteur.';
    if (statut === 'out_for_delivery') return 'Votre commande est en route.';
  }
  return MESSAGE_CLIENT[statut] ?? '';
}

export function libelleStatut(s: OrderStatus): string {
  return ORDER_STATUS_LABELS[s] || s;
}

// ─── Messages WhatsApp ────────────────────────────────────────────────────────
// Jamais de RIB dans un message WhatsApp (règle du patron) : un RIB se lit sur la
// page de la commande du site, là où personne ne peut le changer par message.

const prenom = (o: Pick<ShopOrder, 'customerName' | 'shippingAddress'>) =>
  String(o.customerName || o.shippingAddress?.fullName || '').trim();

function lignesDuMessage(o: ShopOrder): string[] {
  return (o.items || []).map(i => {
    const variante = varianteLisible(i.variant);
    const prix = prixUnitaireLigne(i) > 0 ? formatPrice(totalLigne(i)) : 'prix à confirmer';
    return `• ${i.quantity} × ${i.productName}${variante ? ` (${variante})` : ''} — ${prix}`;
  });
}

/** Options communes aux messages : réglages des magasins et paiement déjà reçu. */
export interface OptionsMessage {
  reglages?: ReglagesReception;
  /** Virement (ou carte) déjà vu sur le compte : rien à payer à la réception. */
  paiementRecu?: boolean;
}

const lieuDe = (o: Pick<ShopOrder, 'reception' | 'items'>, reglages?: ReglagesReception): LieuDeRetrait =>
  (reglages ?? REGLAGES_RECEPTION_DEFAUT).lieux[receptionDe(o).lieu];

/**
 * Frais du colis tels qu'on les annonce : « 20 MAD », « offerte », ou « à confirmer » si 0 sans raison.
 * « offerte » ne sort plus que pour une commande d'avant le 30/09/2026 qui atteignait le seuil de sa date.
 */
export function fraisColisAnnonces(
  o: Pick<ShopOrder, 'reception' | 'items' | 'shippingAddress' | 'deliveryFee'> & { createdAt?: unknown },
): string {
  const frais = Number(o.deliveryFee) || 0;
  if (frais > 0) return formatPrice(frais);
  // 0 DH : normal pour une ancienne commande offerte ; sinon le prix se vérifie à l'appel (frais calculés par le navigateur).
  return fraisColisAttendus(o) === 0 ? 'offerte' : 'à confirmer';
}

/** Lien direct vers la page de la commande (celle qui montre le RIB) : un lien, jamais le RIB lui-même. */
export function lienPageCommande(id?: unknown): string | null {
  return typeof id === 'string' && /^[A-Za-z0-9]{10,40}$/.test(id) ? `${SITE_URL}/shop/confirmation/${id}` : null;
}

/** Motif du virement et où trouver le RIB : la page de la commande, ou le « Suivi de commande » du site. */
function motifVirement(o: Pick<ShopOrder, 'orderNumber' | 'id'>): string {
  const lien = lienPageCommande(o.id);
  return `indiquez le n° de commande ${o.orderNumber} comme motif du virement ; notre RIB est sur la page de votre commande`
    + (lien ? ` : ${lien}` : ' (lebtex.ma, rubrique « Suivi de commande »)');
}

/**
 * Ce qu'il reste à payer, dit au client : rien si l'argent est déjà vu sur le compte ; à qui
 * a choisi le virement, on ne demande pas d'espèces (la fiche ne sait pas toujours s'il est arrivé) ;
 * sinon la somme et où la payer (`ou` : « au retrait », « à la livraison », « au chauffeur »…).
 */
function phraseAPayer(o: Pick<ShopOrder, 'orderNumber' | 'paymentMethod'>, total: number, options: OptionsMessage, ou = ''): string {
  if (options.paiementRecu) return 'Elle est déjà payée : rien à payer.';
  if (moyenPaiementDe(o) === 'virement') {
    return `Montant : ${formatPrice(total)}, par virement (motif : n° ${o.orderNumber}), si ce n’est pas déjà fait.`;
  }
  return `Montant à payer${ou ? ` ${ou}` : ''} : ${formatPrice(total)}.`;
}

/** Le message de confirmation : tout ce que le client doit relire avant qu'on prépare sa commande. */
export function messageConfirmation(o: ShopOrder, maintenant = Date.now(), options: OptionsMessage = {}): string {
  const r = receptionDe(o);
  const moyen = moyenPaiementDe(o);
  const adresse = [o.shippingAddress?.address, o.shippingAddress?.city].filter(Boolean).join(', ');
  const sansPrix = lignesSansPrix(o).length > 0 ? ' (hors articles au prix à confirmer)' : '';
  const total = formatPrice(o.total);
  const lieu = lieuDe(o, options.reglages);

  const reception = r.mode === 'retrait'
    ? [`Retrait gratuit : ${lieu.nom}, ${lieu.adresse}`]
    : r.mode === 'transport'
      ? ['Transport : à confirmer par téléphone']
      : [`Livraison à domicile (${o.shippingAddress?.city || '—'}) : ${fraisColisAnnonces(o)}`];

  // Un rouleau (transport, ou commandé « à domicile ») : le transport se chiffre au téléphone,
  // il n'est pas dans ce total, quel que soit le moyen de paiement.
  const transportEnPlus = r.mode === 'transport' || (r.mode === 'domicile' && r.volumineux)
    ? ' (transport en plus, à convenir ensemble)'
    : '';
  const ligneTotal = moyen === 'virement'
    ? `*Total à payer par virement : ${total}*${sansPrix}${transportEnPlus}`
    : moyen === 'carte'
      ? `*Total à payer par carte : ${total}*${sansPrix}${transportEnPlus}`
      : r.mode === 'retrait'
        ? `*Total à payer au retrait : ${total}*${sansPrix}`
        : transportEnPlus
          ? `*Total des articles : ${total}*${sansPrix}${transportEnPlus}`
          : `*Total à payer à la livraison : ${total}*${sansPrix}`;

  const question = r.mode === 'retrait'
    ? 'Pouvez-vous nous confirmer la commande et le jour où vous passerez ? Merci !'
    : r.mode === 'transport'
      ? 'Pouvez-vous nous confirmer la commande ? Nous organisons ensemble le transport (camionnette à Casablanca, ou transporteur jusqu’à votre ville). Merci !'
      : 'Pouvez-vous nous confirmer la commande et l’adresse de livraison ? Merci !';

  return [
    `Bonjour ${prenom(o)},`,
    `Ici LEBTEX. Merci pour votre commande n° ${o.orderNumber} passée ${dateHeure(o.createdAt, maintenant)} sur lebtex.ma :`,
    '',
    ...lignesDuMessage(o),
    '',
    ...reception,
    ...(o.discount ? [`Réduction : -${formatPrice(o.discount)}`] : []),
    ligneTotal,
    ...(moyen === 'virement' ? [`Virement : ${motifVirement(o)}.`] : []),
    '',
    ...(r.mode === 'retrait' ? [`Horaires : ${lieu.horaires}`] : [`Adresse : ${adresse || '—'}`]),
    '',
    question,
  ].join('\n');
}

/** Le message qui annonce un nouveau statut au client. */
export function messageStatut(o: ShopOrder, statut: OrderStatus, options: OptionsMessage = {}): string {
  const n = o.orderNumber;
  const r = receptionDe(o);
  const lieu = lieuDe(o, options.reglages);
  const bonjour = `Bonjour ${prenom(o)},`;
  const aPayer = (ou?: string) => phraseAPayer(o, Number(o.total) || 0, options, ou);
  const corps: Record<OrderStatus, string> = {
    pending: `Nous avons bien reçu votre commande n° ${n}. Nous vous appelons pour la confirmer.`,
    confirmed: r.mode === 'retrait'
      ? `Votre commande n° ${n} est confirmée. Nous la préparons à ${lieu.nom} et vous confirmons le jour de retrait.`
      : r.mode === 'transport'
        ? `Votre commande n° ${n} est confirmée. Nous organisons le transport avec vous.`
        : `Votre commande n° ${n} est confirmée. Nous la préparons.`,
    processing: `Votre commande n° ${n} est en préparation.`,
    ready_for_pickup: [
      `Votre commande n° ${n} est prête à ${lieu.nom} : ${lieu.adresse}.`,
      `Plan : ${lieu.lienMaps}`,
      `Horaires : ${lieu.horaires}.`,
      aPayer('au retrait'),
      'Donnez votre numéro de commande et votre nom.',
    ].join('\n'),
    shipped: r.mode === 'transport'
      ? `Votre commande n° ${n} est partie avec notre chauffeur ou le transporteur. Nous vous appelons pour la réception.`
      : `Votre commande n° ${n} est partie avec le livreur, qui vous appellera avant de passer. ${aPayer('à la livraison')}`,
    out_for_delivery: `Le livreur arrive avec votre commande n° ${n}. ${aPayer()}`,
    // Recommander en un message : le client répond, l'équipe reprend la même commande.
    delivered: r.mode === 'retrait'
      ? `Votre commande n° ${n} est retirée. Merci pour votre confiance !\nPour recommander les mêmes articles, répondez simplement à ce message.`
      : `Votre commande n° ${n} est livrée. Merci pour votre confiance !\nPour recommander les mêmes articles, répondez simplement à ce message.`,
    cancelled: `Votre commande n° ${n} a été annulée. Pour toute question, répondez simplement à ce message.`,
    returned: `Votre commande n° ${n} nous est revenue. Répondez à ce message si vous souhaitez la recevoir à nouveau.`,
  };
  return `${bonjour}\n${corps[statut] ?? ''}\n\nLEBTEX`;
}

// ─── Messages prêts à l'emploi (plan §6.4) ───────────────────────────────────
// Après l'appel, pour le retrait, la camionnette et le transporteur. Quelques
// champs se complètent dans la fiche (jour, transporteur, prix du transport).

export type ModeleMessage = 'recapitulatif' | 'pret_a_retirer' | 'rappel_retrait' | 'veille_tournee' | 'parti_transporteur';

export interface ChampsModele {
  /** Jour de livraison, de retrait, de tournée, de départ, ou date limite de garde (« mardi 6 octobre »). */
  date?: string;
  /** Nom (et téléphone) du transporteur. */
  transporteur?: string;
  /** « 150 », « 150 DH » ou un texte (« payé à l'arrivée »). */
  prixTransport?: string;
}

export interface DefinitionModele {
  id: ModeleMessage;
  titre: string;
  /** Quand l'envoyer. */
  aide: string;
  champs: { cle: keyof ChampsModele; libelle: string; exemple: string }[];
}

const CHAMP_PRIX = { cle: 'prixTransport' as const, libelle: 'Prix du transport', exemple: 'ex. 150 DH' };
const CHAMP_TRANSPORTEUR = { cle: 'transporteur' as const, libelle: 'Transporteur', exemple: 'ex. Transport Atlas, 06 12 34 56 78' };

/** Les messages utiles pour cette commande, selon son mode de réception. */
export function modelesPour(o: Pick<ShopOrder, 'reception' | 'items' | 'shippingAddress'>): DefinitionModele[] {
  const r = receptionDe(o);
  const recap: DefinitionModele = {
    id: 'recapitulatif',
    titre: 'Récapitulatif après l’appel',
    aide: 'Ce qui a été convenu au téléphone ; le client répond OK.',
    champs: [
      { cle: 'date', libelle: r.mode === 'retrait' ? 'Jour de retrait' : 'Jour de livraison', exemple: 'ex. jeudi 1er octobre' },
      ...(r.mode === 'transport' ? [CHAMP_PRIX, ...(transportPrevu(o) === 'transporteur' ? [CHAMP_TRANSPORTEUR] : [])] : []),
    ],
  };
  if (r.mode === 'retrait') {
    return [
      recap,
      { id: 'pret_a_retirer', titre: 'Commande prête à retirer', aide: 'Quand la commande est prête au magasin.',
        champs: [{ cle: 'date', libelle: 'Gardée jusqu’au', exemple: 'ex. mardi 6 octobre' }] },
      { id: 'rappel_retrait', titre: 'Rappel de retrait', aide: 'Au 2e jour si le client n’est pas venu.',
        champs: [{ cle: 'date', libelle: 'Gardée jusqu’au', exemple: 'ex. mardi 6 octobre' }] },
    ];
  }
  if (r.mode === 'transport') {
    const camionnette: DefinitionModele = {
      id: 'veille_tournee', titre: 'Veille de tournée (camionnette)', aide: 'La veille de la livraison par la camionnette LEBTEX.',
      champs: [{ cle: 'date', libelle: 'Jour de la tournée', exemple: 'ex. jeudi 1er octobre' }, CHAMP_PRIX],
    };
    const transporteur: DefinitionModele = {
      id: 'parti_transporteur', titre: 'Partie avec le transporteur', aide: 'Le jour où le camion part vers la ville du client.',
      champs: [CHAMP_TRANSPORTEUR, { cle: 'date', libelle: 'Partie le', exemple: 'ex. mercredi 30 septembre' }, CHAMP_PRIX],
    };
    return transportPrevu(o) === 'camionnette' ? [recap, camionnette, transporteur] : [recap, transporteur, camionnette];
  }
  return [recap];
}

/** « 150 », « 150 DH », « 150,5 MAD » → 150 / 150,5 ; un texte libre → null. */
export function prixLu(v?: string): number | null {
  const m = /^\s*(\d+(?:[.,]\d+)?)\s*(?:dh|mad|dirhams?)?\s*$/i.exec(String(v ?? ''));
  return m ? Number(m[1].replace(',', '.')) : null;
}

const FORMAT_JOUR = new Intl.DateTimeFormat('fr-FR', { timeZone: 'UTC', weekday: 'long', day: 'numeric', month: 'long' });

/** Le jour du Maroc de `ms`, à midi UTC (pour compter en jours sans souci d'heure d'été). */
function midiDuJour(ms: number): number {
  const [a, m, j] = jourDe(new Date(ms)).split('-').map(Number);
  return Date.UTC(a, m - 1, j, 12);
}

/** « mardi 6 octobre ». */
export function jourLisible(ms: number): string {
  return FORMAT_JOUR.format(new Date(midiDuJour(ms)));
}

/**
 * `n` jours ouvrés après aujourd'hui (le magasin ouvre du lundi au samedi : seul
 * le dimanche est sauté ; les fêtes ne sont pas comptées, à ajuster à la main).
 */
export function joursOuvresApres(maintenant: number, n: number): number {
  let jour = midiDuJour(maintenant);
  let restants = n;
  while (restants > 0) {
    jour += 86_400_000;
    if (new Date(jour).getUTCDay() !== 0) restants--;
  }
  return jour;
}

/** La garde d'une commande prête à retirer, en jours ouvrés. */
export const GARDE_RETRAIT_JOURS_OUVRES = 7;

/**
 * Prix de la camionnette LEBTEX pour cette commande, d'après les réglages : Casablanca ou
 * périphérie (jamais offerte, décision du 30/09/2026), null hors zone ou camionnette arrêtée.
 */
export function prixCamionnette(
  o: Pick<ShopOrder, 'shippingAddress'>,
  reglages: ReglagesReception = REGLAGES_RECEPTION_DEFAUT,
): number | null {
  const cam = reglages.camionnette;
  if (!cam.actif) return null;
  const ville = String(o.shippingAddress?.city ?? '');
  const zone = estCasablanca(ville) ? 'casablanca' : estPeripherieCasablanca(ville) ? 'peripherie' : null;
  if (!zone) return null;
  return zone === 'casablanca' ? cam.prixCasablanca : cam.prixPeripherie;
}

/**
 * Ce que la fiche pré-remplit dans les champs d'un message (modifiable). `prixTransport` :
 * le prix de la camionnette des réglages, repris dans la veille de tournée (et dans le
 * récapitulatif quand la fiche sait que c'est la camionnette) ; 0 s'écrit « offert ».
 */
export function champsParDefaut(id: ModeleMessage, maintenant = Date.now(), prixTransport?: number | null): ChampsModele {
  const prix = typeof prixTransport === 'number' && Number.isFinite(prixTransport) && prixTransport >= 0
    ? { prixTransport: prixTransport === 0 ? 'offert' : String(prixTransport) }
    : {};
  if (id === 'pret_a_retirer' || id === 'rappel_retrait') {
    return { date: jourLisible(joursOuvresApres(maintenant, GARDE_RETRAIT_JOURS_OUVRES)) };
  }
  if (id === 'veille_tournee') return { date: jourLisible(maintenant + 86_400_000), ...prix };
  if (id === 'parti_transporteur') return { date: jourLisible(maintenant) };
  if (id === 'recapitulatif') return prix;
  return {};
}

/** Le message prêt à envoyer. Un champ vide reste lisible (« à préciser »), jamais « undefined ». */
export function messageModele(id: ModeleMessage, o: ShopOrder, champs: ChampsModele = {}, options: OptionsMessage = {}): string {
  const n = o.orderNumber;
  const r = receptionDe(o);
  const moyen = moyenPaiementDe(o);
  const lieu = lieuDe(o, options.reglages);
  const ville = String(o.shippingAddress?.city ?? '').trim() || 'votre ville';
  const adresse = [o.shippingAddress?.address, o.shippingAddress?.city].map(v => String(v ?? '').trim()).filter(Boolean).join(', ') || '—';
  const date = String(champs.date ?? '').trim();
  const transporteur = String(champs.transporteur ?? '').trim();
  const prixTexte = String(champs.prixTransport ?? '').trim();
  const prix = prixLu(prixTexte);
  const prixAnnonce = prix !== null ? formatPrice(prix) : prixTexte || 'à préciser';
  const total = Number(o.total) || 0;
  const prevu = transportPrevu(o);
  // La camionnette est facturée par LEBTEX avec la commande ; le transporteur, lui, se paie à part.
  const totalAvecCamionnette = r.mode === 'transport' && prevu === 'camionnette' && prix !== null ? total + prix : total;
  const bonjour = `Bonjour ${prenom(o)},`;
  const signature = 'LEBTEX';

  if (id === 'pret_a_retirer') {
    return [
      bonjour,
      `Votre commande n° ${n} est prête.`,
      `Où : ${lieu.nom}, ${lieu.adresse}`,
      `Plan : ${lieu.lienMaps}`,
      `Horaires : ${lieu.horaires}`,
      options.paiementRecu
        ? 'Elle est déjà payée : rien à payer sur place.'
        : moyen === 'virement' ? phraseAPayer(o, total, options) : `À payer sur place : ${formatPrice(total)}.`,
      'Donnez votre numéro de commande et votre nom. Quelqu’un peut venir à votre place avec ce numéro.',
      `Nous la gardons ${GARDE_RETRAIT_JOURS_OUVRES} jours ouvrés, jusqu’au ${date || 'à préciser'}.`,
      '',
      signature,
    ].join('\n');
  }

  if (id === 'rappel_retrait') {
    return [
      bonjour,
      `Votre commande n° ${n} vous attend à ${lieu.nom} (${lieu.adresse}) jusqu’au ${date || 'à préciser'}.`,
      `Plan : ${lieu.lienMaps}`,
      `Horaires : ${lieu.horaires}`,
      'Après cette date, elle retourne en stock.',
      '',
      signature,
    ].join('\n');
  }

  if (id === 'veille_tournee') {
    // Ce message est toujours celui de la camionnette : son prix s'ajoute aux articles.
    const totalTournee = total + (prix ?? 0);
    const detail = prix ? ` (articles ${formatPrice(total)} + transport ${formatPrice(prix)})` : '';
    return [
      bonjour,
      `Notre camionnette vous livre ${date ? `le ${date}` : 'demain'}, au pied de l’immeuble : ${adresse}.`,
      options.paiementRecu
        ? 'Votre commande est déjà payée : rien à payer au chauffeur.'
        : moyen === 'virement'
          ? `Montant : ${formatPrice(totalTournee)}${detail}, par virement (motif : n° ${n}), si ce n’est pas déjà fait.`
          : `À payer au chauffeur : ${formatPrice(totalTournee)}${detail}.`,
      'Quelqu’un pourra-t-il recevoir la marchandise ? Répondez OUI, ou proposez un autre jour.',
      '',
      signature,
    ].join('\n');
  }

  if (id === 'parti_transporteur') {
    return [
      bonjour,
      `Votre commande n° ${n} est partie${date ? ` le ${date}` : ''} avec ${transporteur || 'notre transporteur'}.`,
      `Elle arrive à son dépôt de ${ville} : récupérez-la là-bas en donnant votre numéro de commande (${n}) et votre nom.`,
      ...(prixTexte ? [`Transport : ${prixAnnonce}.`] : []),
      'Vérifiez les colis avant de signer.',
      '',
      signature,
    ].join('\n');
  }

  // Récapitulatif après l'appel.
  const receptionTexte = r.mode === 'retrait'
    ? `retrait gratuit à ${lieu.nom} (${lieu.adresse})`
    : r.mode === 'transport'
      ? prevu === 'camionnette'
        ? `livraison par notre camionnette, ${adresse}`
        : `envoi par ${transporteur || 'notre transporteur'} jusqu’à son dépôt de ${ville}, où vous récupérez la marchandise`
      : `livraison à domicile, ${adresse}`;
  const fraisTexte = r.mode === 'retrait'
    ? 'Retrait : gratuit'
    : r.mode === 'transport'
      ? `Transport : ${prixAnnonce}`
      : `Livraison : ${fraisColisAnnonces(o)}`;
  const regle = options.paiementRecu
    ? 'déjà reçu, merci'
    : moyen === 'virement'
      ? `par virement (${motifVirement(o)} ; LEBTEX ne change jamais de RIB par message)`
      : moyen === 'carte'
        ? 'par carte bancaire'
        : r.mode === 'retrait'
          ? 'sur place, au retrait'
          : r.mode === 'transport'
            ? prevu === 'camionnette'
              ? `en espèces au chauffeur LEBTEX (${formatPrice(PLAFOND_ESPECES_TOURNEE)} au plus), ou par virement avant la livraison`
              : 'comme convenu au téléphone (virement possible, avec le n° de commande comme motif)'
            : 'en espèces au livreur, à la réception (le colis ne s’ouvre pas avant le paiement)';
  const ligneTotal = r.mode === 'transport' && prevu === 'camionnette' && prix !== null
    ? `*Total à payer : ${formatPrice(totalAvecCamionnette)}* (articles ${formatPrice(total)} + transport ${formatPrice(prix)})`
    : r.mode === 'transport'
      ? `*Total des articles : ${formatPrice(total)}*`
      : `*Total à payer : ${formatPrice(total)}*`;
  return [
    bonjour,
    `Comme convenu au téléphone, voici votre commande n° ${n} :`,
    '',
    ...lignesDuMessage(o),
    '',
    `Réception : ${receptionTexte}${date ? `, le ${date}` : ''}.`,
    fraisTexte,
    ...(o.discount ? [`Réduction : -${formatPrice(o.discount)}`] : []),
    `Paiement : ${regle}.`,
    ligneTotal,
    '',
    'Répondez OK pour confirmer. Merci !',
    signature,
  ].join('\n');
}

// ─── Argent ───────────────────────────────────────────────────────────────────

/** Ce que rapportent les commandes, sans compter ce qui n'est pas encore confirmé ni l'argent pas encore touché. */
export function resumeArgent(orders: Pick<ShopOrder, 'status' | 'total'>[]) {
  let encaisse = 0, enCours = 0, aConfirmer = 0, nbAConfirmer = 0;
  for (const o of orders) {
    const t = Number(o.total) || 0;
    if (o.status === 'delivered') encaisse += t;
    else if (o.status === 'pending') { aConfirmer += t; nbAConfirmer++; }
    else if (o.status !== 'cancelled' && o.status !== 'returned') enCours += t;
  }
  return { encaisse, enCours, aConfirmer, nbAConfirmer };
}
