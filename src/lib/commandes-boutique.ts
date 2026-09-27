// ─── Commandes de la boutique en ligne : outils partagés ─────────────────────
// Ce qu'il faut pour recevoir et traiter une commande lebtex.ma : les files de
// travail (à confirmer, à préparer…), les téléphones du client au bon format,
// les messages WhatsApp prêts à envoyer, le prix réellement appliqué à chaque
// ligne. Sert à /admin-shop, au bon de livraison PDF et à l'e-mail d'alerte.
//
// Pur (ni Firebase ni React) : testé par scripts/test-commandes-boutique.ts.

import type { CartItem, OrderStatus, ShopOrder } from './shop-types';
import { ORDER_STATUS_LABELS } from './shop-types';
import { formatPrice } from './shop-utils';
import { normaliserRecherche } from './recherche-commandes';

/** La page de confirmation promet au client un appel « sous 2h ». */
export const DELAI_CONFIRMATION_MS = 2 * 60 * 60 * 1000;

const FUSEAU = 'Africa/Casablanca';

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

// ─── Files de travail ─────────────────────────────────────────────────────────

export type FileCommandes = 'a_confirmer' | 'a_preparer' | 'en_livraison' | 'livrees' | 'annulees' | 'toutes';

export interface DefinitionFile {
  id: FileCommandes;
  libelle: string;
  statuts: OrderStatus[];
  /** La plus ancienne en haut : c'est elle qui attend depuis le plus longtemps. */
  plusAncienneEnHaut: boolean;
  /** Ce qu'on fait des commandes de cette file. */
  consigne: string;
}

export const FILES: DefinitionFile[] = [
  { id: 'a_confirmer', libelle: 'À confirmer', statuts: ['pending'], plusAncienneEnHaut: true,
    consigne: 'Appeler ou écrire au client pour confirmer la commande et l’adresse.' },
  { id: 'a_preparer', libelle: 'À préparer', statuts: ['confirmed', 'processing'], plusAncienneEnHaut: true,
    consigne: 'Préparer le colis avec le bon de livraison, puis le remettre au livreur.' },
  { id: 'en_livraison', libelle: 'En livraison', statuts: ['shipped', 'out_for_delivery'], plusAncienneEnHaut: true,
    consigne: 'Colis parti : marquer « livrée » quand l’argent est encaissé.' },
  { id: 'livrees', libelle: 'Livrées', statuts: ['delivered'], plusAncienneEnHaut: false,
    consigne: 'Livrées et encaissées.' },
  { id: 'annulees', libelle: 'Annulées / retours', statuts: ['cancelled', 'returned'], plusAncienneEnHaut: false,
    consigne: 'Annulées avant l’envoi ou revenues au dépôt.' },
  { id: 'toutes', libelle: 'Toutes', statuts: [], plusAncienneEnHaut: false, consigne: 'Tout l’historique.' },
];

export function fileDe(statut: OrderStatus): FileCommandes {
  return FILES.find(f => f.statuts.includes(statut))?.id ?? 'toutes';
}

/** Nombre de commandes par file (« toutes » compris). */
export function compteParFile(orders: Pick<ShopOrder, 'status'>[]): Record<FileCommandes, number> {
  const comptes = Object.fromEntries(FILES.map(f => [f.id, 0])) as Record<FileCommandes, number>;
  for (const o of orders) {
    comptes.toutes++;
    const f = fileDe(o.status);
    if (f !== 'toutes') comptes[f]++;
  }
  return comptes;
}

/** Commandes d'une file qui répondent à la recherche, dans l'ordre de traitement. */
export function commandesDeLaFile<T extends ShopOrder>(orders: T[], file: FileCommandes, recherche = '', maintenant = Date.now()): T[] {
  const def = FILES.find(f => f.id === file) ?? FILES[FILES.length - 1];
  const sens = def.plusAncienneEnHaut ? 1 : -1;
  return orders
    .filter(o => (def.statuts.length === 0 || def.statuts.includes(o.status)) && commandeRepond(o, recherche))
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

  const texte = normaliserRecherche([
    o.orderNumber, o.customerName, o.shippingAddress?.fullName, o.shippingAddress?.city,
    o.shippingAddress?.address, o.shippingAddress?.region, o.customerEmail,
    ...(o.items || []).flatMap(i => [i.productName, varianteLisible(i.variant)]),
    ...tels,
  ].filter(Boolean).join(' '));
  return q.split(' ').every(mot => texte.includes(mot));
}

// ─── Étapes et statuts ────────────────────────────────────────────────────────

/** Le gros bouton de la fiche : l'étape qui suit, dans le travail de tous les jours. */
export const ETAPE_SUIVANTE: Partial<Record<OrderStatus, { statut: OrderStatus; libelle: string }>> = {
  pending: { statut: 'confirmed', libelle: 'Client joint — confirmer' },
  confirmed: { statut: 'processing', libelle: 'Commencer la préparation' },
  processing: { statut: 'shipped', libelle: 'Remis au livreur' },
  shipped: { statut: 'delivered', libelle: 'Livrée et payée' },
  out_for_delivery: { statut: 'delivered', libelle: 'Livrée et payée' },
};

/** Statuts qu'on ne pose pas par erreur : ils demandent une confirmation. */
export const STATUTS_SENSIBLES: OrderStatus[] = ['cancelled', 'returned', 'delivered'];

/** Pourquoi une commande est annulée : gardé pour soi, jamais montré au client. */
export const MOTIFS_ANNULATION = [
  'Client injoignable',
  'Le client a annulé',
  'Faux numéro / commande test',
  'Produit indisponible',
  'Doublon d’une autre commande',
  'Autre',
] as const;

/** Phrase ajoutée au suivi que le client voit dans son compte, à chaque changement. */
export const MESSAGE_CLIENT: Record<OrderStatus, string> = {
  pending: 'Commande reçue — nous vous appelons pour la confirmer.',
  confirmed: 'Commande confirmée.',
  processing: 'Votre commande est en préparation.',
  shipped: 'Votre colis est parti avec le livreur.',
  out_for_delivery: 'Le livreur est en route.',
  delivered: 'Commande livrée. Merci pour votre confiance !',
  cancelled: 'Commande annulée.',
  returned: 'Commande retournée.',
};

export function libelleStatut(s: OrderStatus): string {
  return ORDER_STATUS_LABELS[s] || s;
}

// ─── Messages WhatsApp ────────────────────────────────────────────────────────

const prenom = (o: Pick<ShopOrder, 'customerName' | 'shippingAddress'>) =>
  String(o.customerName || o.shippingAddress?.fullName || '').trim();

function lignesDuMessage(o: ShopOrder): string[] {
  return (o.items || []).map(i => {
    const variante = varianteLisible(i.variant);
    const prix = prixUnitaireLigne(i) > 0 ? formatPrice(totalLigne(i)) : 'prix à confirmer';
    return `• ${i.quantity} × ${i.productName}${variante ? ` (${variante})` : ''} — ${prix}`;
  });
}

/** Le message de confirmation : tout ce que le client doit relire avant qu'on prépare le colis. */
export function messageConfirmation(o: ShopOrder, maintenant = Date.now()): string {
  const adresse = [o.shippingAddress?.address, o.shippingAddress?.city].filter(Boolean).join(', ');
  const sansPrix = lignesSansPrix(o).length > 0;
  return [
    `Bonjour ${prenom(o)},`,
    `Ici LEBTEX. Merci pour votre commande n° ${o.orderNumber} passée ${dateHeure(o.createdAt, maintenant)} sur lebtex.ma :`,
    '',
    ...lignesDuMessage(o),
    '',
    `Livraison (${o.shippingAddress?.city || '—'}) : ${o.deliveryFee ? formatPrice(o.deliveryFee) : 'gratuite'}`,
    ...(o.discount ? [`Réduction : -${formatPrice(o.discount)}`] : []),
    `*Total à payer à la livraison : ${formatPrice(o.total)}*${sansPrix ? ' (hors articles au prix à confirmer)' : ''}`,
    '',
    `Adresse : ${adresse || '—'}`,
    '',
    'Pouvez-vous nous confirmer la commande et l’adresse de livraison ? Merci !',
  ].join('\n');
}

/** Le message qui annonce un nouveau statut au client. */
export function messageStatut(o: ShopOrder, statut: OrderStatus): string {
  const n = o.orderNumber;
  const bonjour = `Bonjour ${prenom(o)},`;
  const corps: Record<OrderStatus, string> = {
    pending: `Nous avons bien reçu votre commande n° ${n}. Nous vous appelons pour la confirmer.`,
    confirmed: `Votre commande n° ${n} est confirmée. Nous la préparons.`,
    processing: `Votre commande n° ${n} est en préparation.`,
    shipped: `Votre commande n° ${n} est partie avec le livreur, qui vous appellera avant de passer. Montant à payer à la livraison : ${formatPrice(o.total)}.`,
    out_for_delivery: `Le livreur arrive avec votre commande n° ${n}. Montant à payer : ${formatPrice(o.total)}.`,
    delivered: `Votre commande n° ${n} est livrée. Merci pour votre confiance !`,
    cancelled: `Votre commande n° ${n} a été annulée. Pour toute question, répondez simplement à ce message.`,
    returned: `Votre commande n° ${n} nous est revenue. Répondez à ce message si vous souhaitez la recevoir à nouveau.`,
  };
  return `${bonjour}\n${corps[statut]}\n\nLEBTEX`;
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
