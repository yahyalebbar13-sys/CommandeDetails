// ─── Petits calculs de l'écran des commandes ─────────────────────────────────
// Ce qui n'est ni Firebase ni React : résumé d'une carte, historique d'un
// client, adresse à copier… Le socle (files, téléphones, messages) est dans
// src/lib/commandes-boutique.ts ; ici, seulement ce que l'écran ajoute.

import type { OrderStatus, ShopOrder } from '@/lib/shop-types';
import { firebaseConfig } from '@/firebase/config';
import {
  FILES,
  messageConfirmation,
  messageStatut,
  msDe,
  nombreArticles,
  STATUTS_SENSIBLES,
  telInternational,
  telLisible,
  telephonesCommande,
  varianteLisible,
  type FileCommandes,
} from '@/lib/commandes-boutique';

// ─── Statuts, au féminin : on parle d'« une commande » ───────────────────────
// ORDER_STATUS_LABELS (shop-types) est au masculin et sert aussi côté client :
// l'admin a sa propre table, accordée avec les files « Livrées », « Annulées ».

export const LIBELLES_STATUT: Record<OrderStatus, string> = {
  pending: 'En attente',
  confirmed: 'Confirmée',
  processing: 'En préparation',
  shipped: 'Expédiée',
  out_for_delivery: 'En livraison',
  delivered: 'Livrée',
  cancelled: 'Annulée',
  returned: 'Retournée',
};

export function statutLisible(s: OrderStatus): string {
  return LIBELLES_STATUT[s] || String(s ?? '');
}

/** Livrée, annulée, retournée : en sortir, c'est rouvrir la commande (on demande d'abord). */
export function estStatutFinal(s: OrderStatus): boolean {
  return STATUTS_SENSIBLES.includes(s);
}

/** Ce que dit le bloc « argent » de la fiche selon où en est la commande. */
export function encaissement(s: OrderStatus): { titre: string; ligne: string; pied: string; aEncaisser: boolean } {
  switch (s) {
    case 'delivered':
      return { titre: 'Encaissé', ligne: 'Total encaissé', pied: 'Payée à la livraison.', aEncaisser: false };
    case 'cancelled':
      return { titre: 'Rien à encaisser', ligne: 'Total (non dû)', pied: 'Rien à encaisser : commande annulée.', aEncaisser: false };
    case 'returned':
      return { titre: 'Rien à encaisser', ligne: 'Total (non dû)', pied: 'Rien à encaisser : colis retourné.', aEncaisser: false };
    default:
      return { titre: 'À encaisser', ligne: 'Total à encaisser', pied: 'Paiement à la livraison, en espèces.', aEncaisser: true };
  }
}

// ─── Données du client, avant de les mettre dans un lien ─────────────────────

/**
 * L'e-mail du client, seulement s'il est sans surprise : un lien « mailto: »
 * construit avec « x@y.ma?bcc=…&body=… » ferait ajouter une copie cachée et un
 * texte par le logiciel de messagerie. On refuse donc ? & = % / et les espaces.
 */
export function emailAffichable(e?: string | null): string | null {
  const s = String(e ?? '').trim();
  return s.length <= 254 && /^[A-Za-z0-9._+'-]+@[A-Za-z0-9-]+(\.[A-Za-z0-9-]+)*\.[A-Za-z]{2,}$/.test(s) ? s : null;
}

/**
 * Numéros notés par le client où aucun chiffre n'est reconnu : on les montre
 * tels quels, sans bouton, plutôt que de les faire disparaître de la fiche.
 */
export function numerosNonReconnus(o: Pick<ShopOrder, 'customerPhone' | 'shippingAddress'>): string[] {
  const liste: string[] = [];
  for (const t of [o.customerPhone, o.shippingAddress?.phone, o.shippingAddress?.phone2]) {
    const s = String(t ?? '').trim();
    if (s && !telInternational(s) && !liste.includes(s)) liste.push(s);
  }
  return liste;
}

/** « 3 articles · Fermeture Nylon N3 (Noir 580) + 1 autre ». */
export function resumeArticles(o: Pick<ShopOrder, 'items'>): string {
  const items = o.items || [];
  if (!items.length) return 'Aucun article';
  const n = nombreArticles(o);
  const premier = items[0];
  const variante = varianteLisible(premier.variant);
  const autres = items.length - 1;
  return [
    `${n} article${n > 1 ? 's' : ''}`,
    `${premier.productName || 'Article'}${variante ? ` (${variante})` : ''}${autres > 0 ? ` + ${autres} autre${autres > 1 ? 's' : ''}` : ''}`,
  ].join(' · ');
}

/** « 1re », « 2e », « 3e »… */
export function ordinal(n: number): string {
  return n === 1 ? '1re' : `${n}e`;
}

/** Le message WhatsApp qui a du sens maintenant : confirmer si en attente, sinon annoncer le statut. */
export function messageWhatsAppDuMoment(o: ShopOrder, maintenant = Date.now()): string {
  return o.status === 'pending' ? messageConfirmation(o, maintenant) : messageStatut(o, o.status);
}

export interface HistoriqueClient {
  /** Rang de cette commande parmi toutes celles du client (1 = sa première). */
  rang: number;
  /** Les autres commandes du même numéro, la plus récente d'abord. */
  autres: ShopOrder[];
  annulees: number;
  retournees: number;
  livrees: number;
}

/** Les commandes passées avec un des numéros de celle-ci (comparés au format international). */
export function historiqueClient<T extends ShopOrder>(o: T, orders: T[]): HistoriqueClient {
  const numeros = new Set(telephonesCommande(o).map(telInternational).filter(Boolean));
  if (!numeros.size) return { rang: 1, autres: [], annulees: 0, retournees: 0, livrees: 0 };
  const duClient = orders.filter(x =>
    x.id === o.id || telephonesCommande(x).some(t => numeros.has(telInternational(t))),
  );
  if (!duClient.some(x => x.id === o.id)) duClient.push(o);
  const chrono = [...duClient].sort((a, b) => msDe(a.createdAt) - msDe(b.createdAt));
  const autres = chrono.filter(x => x.id !== o.id).reverse();
  return {
    rang: chrono.findIndex(x => x.id === o.id) + 1,
    autres,
    annulees: autres.filter(x => x.status === 'cancelled').length,
    retournees: autres.filter(x => x.status === 'returned').length,
    livrees: autres.filter(x => x.status === 'delivered').length,
  };
}

/** « 3e commande · 1 annulée · 1 livrée », ou « Première commande de ce client ». */
export function resumeHistorique(h: HistoriqueClient): string {
  if (!h.autres.length) return 'Première commande de ce client';
  const total = h.autres.length + 1;
  const morceaux = [h.rang === total ? `${ordinal(h.rang)} commande` : `${ordinal(h.rang)} commande sur ${total}`];
  if (h.livrees) morceaux.push(`${h.livrees} livrée${h.livrees > 1 ? 's' : ''}`);
  if (h.annulees) morceaux.push(`${h.annulees} annulée${h.annulees > 1 ? 's' : ''}`);
  if (h.retournees) morceaux.push(`${h.retournees} retournée${h.retournees > 1 ? 's' : ''}`);
  return morceaux.join(' · ');
}

/** Adresse complète à coller dans un message au livreur : nom, téléphones, rue, ville. */
export function texteAdresse(o: ShopOrder): string {
  const a = o.shippingAddress;
  const ville = [a?.city, a?.region].filter(Boolean).join(', ');
  return [
    a?.fullName || o.customerName,
    telephonesCommande(o).map(telLisible).join(' / '),
    a?.address,
    [ville, a?.postalCode].filter(Boolean).join(' '),
  ].filter(l => String(l ?? '').trim()).join('\n');
}

/**
 * Hôtes d'où viennent les photos du catalogue. L'adresse de l'image est écrite
 * par le navigateur du client : une adresse ailleurs ferait appeler un serveur
 * inconnu à l'ouverture de la fiche (IP de l'admin, heure de lecture).
 */
const HOTES_IMAGES = new Set(['lebtex.ma', 'www.lebtex.ma', 'images.unsplash.com', 'picsum.photos', 'placehold.co']);
const SEAUX_STORAGE = new Set([
  firebaseConfig.storageBucket,
  `${firebaseConfig.projectId}.appspot.com`,
  `${firebaseConfig.projectId}.firebasestorage.app`,
]);

/** Une image produit utilisable : d'un hôte connu, et pas l'image de remplacement du checkout ('/placeholder.png'). */
export function imageUtilisable(src?: string | null): boolean {
  const s = String(src ?? '').trim();
  if (!s || /\/placeholder\.(png|jpe?g|svg|webp)$/i.test(s)) return false;
  // Image du site lui-même (« /fermetures.jpg ») ; « //hote » serait un autre site.
  if (s.startsWith('/')) return !s.startsWith('//') && !s.startsWith('/\\');
  let url: URL;
  try { url = new URL(s); } catch { return false; }
  if (url.protocol !== 'https:' || url.username || url.password || url.port) return false;
  if (HOTES_IMAGES.has(url.hostname)) return true;
  // Stockage Firebase : seulement le seau du projet (un autre seau appartient à quelqu'un d'autre).
  if (url.hostname === 'firebasestorage.googleapis.com') {
    const seau = /^\/v0\/b\/([^/]+)\/o\//.exec(url.pathname)?.[1];
    return !!seau && SEAUX_STORAGE.has(decodeURIComponent(seau));
  }
  if (url.hostname === 'storage.googleapis.com') {
    return SEAUX_STORAGE.has(url.pathname.split('/')[1] || '');
  }
  return false;
}

/** Ce qu'on dit quand une file est vide, en mots simples. */
export const VIDE_PAR_FILE: Record<FileCommandes, string> = {
  a_confirmer: 'Rien à confirmer. Les nouvelles commandes arrivent ici, avec une alerte.',
  a_preparer: 'Rien à préparer. Les commandes confirmées arrivent ici.',
  en_livraison: 'Aucun colis chez le livreur en ce moment.',
  livrees: 'Aucune commande livrée pour l’instant.',
  annulees: 'Aucune commande annulée ni retournée.',
  toutes: 'Aucune commande pour l’instant. Elles arriveront ici dès qu’un client commande sur lebtex.ma.',
};

/** File ouverte à l'arrivée : là où il y a du travail, dans l'ordre du travail. */
export function fileParDefaut(comptes: Record<FileCommandes, number>): FileCommandes {
  if (comptes.a_confirmer > 0) return 'a_confirmer';
  if (comptes.a_preparer > 0) return 'a_preparer';
  if (comptes.en_livraison > 0) return 'en_livraison';
  return 'toutes';
}

/** Files qu'on parcourt comme un historique : on n'affiche que les 50 premières d'abord. */
export function fileParPages(file: FileCommandes): boolean {
  return file === 'livrees' || file === 'annulees' || file === 'toutes';
}

/** La file a-t-elle un seul statut ? (alors le badge de statut sur la carte ne dit rien de plus) */
export function fileAUnSeulStatut(file: FileCommandes): boolean {
  return (FILES.find(f => f.id === file)?.statuts.length ?? 0) === 1;
}
