/**
 * Les transferts entre magasins : la marchandise part d'un magasin, voyage, puis arrive dans un
 * autre.
 *
 * Demande du patron (01/10/2026) : « Les transferts ne sont pas faits par l'admin. Ils sont faits
 * par les magasins vers les autres. » La règle d'avant — le départ est toujours CHRIFA, et la
 * sortie comme l'entrée s'écrivent d'un coup — ne tenait pas : un compte magasin ne peut écrire
 * des mouvements que sous SON nom (firestore.rules, canCreateStoreScoped). Le lot qui portait la
 * sortie chez lui ET l'entrée chez l'autre était refusé en entier.
 *
 * Le parcours, désormais, en trois temps — chacun écrit par le magasin qui en a le droit :
 *
 * 1. ENVOI, par le magasin de départ : le bon (« En route », statut EN_ROUTE) et les SORTIES de
 *    son stock, dans un seul lot. Le bon porte `sortieAlEnvoi: true`, le lien vers ces sorties
 *    (`mouvementsSortie`) et leur copie (emplacement, variante, quantité).
 *    Pourquoi EN_ROUTE et pas PENDING : un poste de caisse reste ouvert toute la journée sur la
 *    version du matin. L'ancien écran recevait tout bon PENDING par son ancien parcours — entrée
 *    du reçu PLUS une sortie PERTE du manquant à l'arrivée, sans relire le bon — et aurait donc
 *    compté le manquant perdu deux fois, ou reçu un bon déjà annulé. Il ne connaît pas EN_ROUTE :
 *    il ne propose rien pour ces bons.
 * 2. RÉCEPTION, par le magasin d'arrivée (ou l'admin) : le bon passe à « Reçu » et les ENTRÉES
 *    s'écrivent dans son stock, dans un seul lot. Ce qui manque n'est PAS ressorti : la
 *    marchandise a déjà quitté le départ, la ressortir à l'arrivée la compterait perdue deux
 *    fois. Le manquant est noté sur le bon et au journal, comme perte au transport.
 * 3. ANNULATION, par le magasin de départ, tant que rien n'est reçu : les sorties sont rendues
 *    à l'identique (mêmes emplacements — relus sur les mouvements eux-mêmes, au cas où un
 *    emplacement aurait été renommé entre-temps —, mêmes variantes), sous son nom à lui.
 *
 * Les anciens bons restent lisibles : « VALIDATED » sans marqueur = l'ancien transfert écrit
 * d'un coup ; « PENDING » = l'ancien parcours en deux temps (avant le 15/09). Celui-ci écrivait
 * le bon, PUIS ses sorties dans un second appel : la sortie existe en général, mais un envoi
 * interrompu a pu laisser un bon sans sortie, ou avec une partie seulement. On le vérifie donc
 * dans le journal LIGNE PAR LIGNE (sortiesParLigne) : la réception ne refait jamais une sortie
 * retrouvée, n'écrit jamais de PERTE à l'arrivée, et la sortie qui manque est écrite au départ
 * — ce que seul l'administrateur a le droit de faire pour un autre magasin.
 *
 * Fonctions pures : vérifiées par scripts/test-transferts.ts, sans Firestore ni navigateur.
 */

import type { TransferOrder, TransferOrderItem } from './types';
import { MAGASIN_PRINCIPAL, type LieuConnu } from './stock-disponible';
import {
  type StockVariant, type VariantDimension, splitOutboundLines, suggestInboundLocation, stockItemVariant,
} from './warehouse-locations';

// ── Quantités ──────────────────────────────────────────────────────────────────────────────────

/** Arrondi au millième, comme le calcul du stock : 2,3 − 2,2 ne laisse pas 0,09999999999999964. */
export const arrondiQte = (q: number) => Math.round((Number(q) || 0) * 1000) / 1000;

/** L'unité d'une ligne, à afficher — rien pour le « unité » par défaut. */
export function uniteCourte(unite?: string | null): string {
  const u = (unite || '').trim();
  return u && u.toLowerCase() !== 'unité' ? u : '';
}

/** « 12,5 m », ou le nombre seul. */
export function qteAvecUnite(q: number, unite?: string | null): string {
  const u = uniteCourte(unite);
  return u ? `${arrondiQte(q)} ${u}` : String(arrondiQte(q));
}

// ── Le numéro du bon ───────────────────────────────────────────────────────────────────────────

/** « BT-1A2B3C4D » : le numéro imprimé, le même que sur l'ancien PDF. */
export function numeroBonTransfert(id: string | null | undefined): string {
  return `BT-${String(id || '').slice(0, 8).toUpperCase() || 'SANS-NUMERO'}`;
}

// ── Qui part, qui arrive ───────────────────────────────────────────────────────────────────────

/** Le compte qui agit : l'admin (propriétaire ou responsable multi-magasins) ou un magasin. */
export type CompteTransfert = {
  role: 'ADMIN' | 'COMMERCIAL' | string;
  /** Le magasin du compte (storeAccess.storeId) ; rien pour l'admin propriétaire. */
  magasin?: string | null;
  lectureSeule?: boolean;
};

type Lieu = LieuConnu & { name?: string; isMain?: boolean };

const estAdmin = (c: CompteTransfert) => c.role === 'ADMIN';

/** Le magasin principal : celui marqué comme tel, à défaut CHRIFA. Jamais un entrepôt. */
export function magasinPrincipal(lieux: Lieu[] = []): string {
  return (lieux.find(s => s.isMain && s.type !== 'WAREHOUSE')
    || lieux.find(s => s.id === MAGASIN_PRINCIPAL))?.id || MAGASIN_PRINCIPAL;
}

/**
 * Les magasins d'où l'on peut faire partir la marchandise. Un magasin : le sien, et lui seul
 * (les règles ne le laissent écrire que sous son nom). L'admin : tous les magasins — jamais un
 * entrepôt, car un entrepôt est la réserve de CHRIFA : le stock de CHRIFA l'inclut déjà
 * (disponibleDepuis).
 */
export function departsPossibles(compte: CompteTransfert, lieux: Lieu[] = []): string[] {
  if (!estAdmin(compte)) return compte.magasin ? [compte.magasin] : [];
  const magasins = lieux.filter(s => s.type !== 'WAREHOUSE').map(s => s.id);
  // Le magasin principal d'abord : c'est le départ proposé par défaut.
  const principal = magasinPrincipal(lieux);
  const tries = [principal, ...magasins.filter(id => id !== principal)];
  return magasins.length > 0 ? tries.filter(id => magasins.includes(id)) : [principal];
}

/**
 * Le départ retenu : celui du compte magasin, ou le choix de l'admin. À défaut de choix, l'admin
 * part du magasin qu'il regarde en haut de l'écran (`magasinAffiche`) — sinon le bon envoyé
 * n'apparaîtrait pas dans la liste filtrée sur ce magasin, et il le croirait perdu ; en vue
 * globale ou sur un entrepôt, du magasin principal.
 */
export function departRetenu(compte: CompteTransfert, lieux: Lieu[] = [], choixAdmin?: string | null, magasinAffiche?: string | null): string {
  const possibles = departsPossibles(compte, lieux);
  if (estAdmin(compte)) {
    if (choixAdmin && possibles.includes(choixAdmin)) return choixAdmin;
    if (magasinAffiche && possibles.includes(magasinAffiche)) return magasinAffiche;
    return possibles[0] || MAGASIN_PRINCIPAL;
  }
  return possibles[0] || '';
}

/** Les lieux d'arrivée : tous les AUTRES magasins — jamais un entrepôt, jamais le départ. */
export function arriveesPossibles(depart: string, lieux: Lieu[] = []): string[] {
  return lieux.filter(s => s.type !== 'WAREHOUSE' && s.id !== depart).map(s => s.id);
}

// ── Où en est le bon ───────────────────────────────────────────────────────────────────────────

/** Une sortie écrite à l'envoi, recopiée sur le bon pour pouvoir la rendre à l'identique. */
export type SortieTransfert = {
  /** Rang de la ligne du bon dont elle vient. */
  ligne: number;
  articleId: string;
  quantity: number;
  locationCode?: string;
  locationId?: string;
  categoryId?: string;
  productName?: string;
  nameFR?: string;
  color?: string;
  size?: string;
  quality?: string;
  unitOfMeasure?: string;
};

/** Un manquant constaté à l'arrivée : déjà sorti au départ, jamais entré à l'arrivée. */
export type ManquantTransfert = {
  articleId: string;
  productName: string;
  color?: string;
  size?: string;
  quality?: string;
  unitOfMeasure?: string;
  envoye: number;
  recu: number;
  manquant: number;
};

/** Les champs que le nouveau parcours ajoute au bon. Tous facultatifs : les anciens bons ne les ont pas. */
export type ChampsTransfert = {
  sortieAlEnvoi?: boolean;
  sortiesEnvoi?: SortieTransfert[];
  mouvementsSortie?: string[];
  mouvementsEntree?: string[];
  mouvementsAnnulation?: string[];
  /** Ancien bon : les sorties du départ écrites à la réception, faute de les retrouver au journal. */
  mouvementsSortieRattrapes?: string[];
  manquants?: ManquantTransfert[];
  envoyePar?: string;
  recuPar?: string;
  annulePar?: string;
  cancelledDate?: string;
  /** Ancien bon clos par l'administrateur sans aucun mouvement (déjà réglé autrement). */
  closSansMouvement?: boolean;
};

export type BonTransfert = TransferOrder & ChampsTransfert;

/** Parti et pas encore reçu ni annulé : EN_ROUTE (nouveau parcours) ou PENDING (ancien). */
export function estEnRoute(bon: Partial<TransferOrder> | null | undefined): boolean {
  return Boolean(bon) && (bon!.status === 'EN_ROUTE' || bon!.status === 'PENDING');
}

/** Un bon de l'ancien parcours jamais réceptionné : PENDING, sans le marqueur du nouveau. */
export function estAncienBonEnAttente(bon: Partial<BonTransfert> | null | undefined): boolean {
  return Boolean(bon) && bon!.status === 'PENDING' && bon!.sortieAlEnvoi !== true;
}

/** Où en est la sortie d'une ligne du bon au départ. */
export type EtatSortieLigne = { ligne: number; envoye: number; dejaSorti: number; resteASortir: number };

const normVariante = (v: any) => String(v ?? '').trim().toLowerCase();

/**
 * Ce qui est déjà sorti du départ, ligne par ligne.
 *
 * Nouveau bon (`sortieAlEnvoi`) : tout, par construction (même lot que le bon). Ancien bon : on
 * cherche au journal les sorties TRANSFERT qui portent son numéro (`transferOrderId`, ou l'id dans
 * la note « Bon de transfert <id> vers … ») et on les répartit sur les lignes — même article et
 * même variante d'abord, puis même article — chaque sortie n'étant comptée qu'une fois. Ligne par
 * ligne et non pour le bon entier : l'ancien parcours écrivait ses sorties après le bon, et une
 * écriture interrompue a pu n'en laisser qu'une partie.
 */
export function sortiesParLigne(bon: Partial<BonTransfert> | null | undefined, mouvements: any[] = []): EtatSortieLigne[] {
  const items: TransferOrderItem[] = Array.isArray(bon?.items) ? bon!.items : [];
  const etats = items.map((it, ligne) => ({ ligne, envoye: arrondiQte(it.sentQty), dejaSorti: 0, resteASortir: 0 }));
  if (bon?.sortieAlEnvoi === true) return etats.map(e => ({ ...e, dejaSorti: e.envoye }));
  const id = String(bon?.id || '');
  const candidats = id
    ? (mouvements || [])
      .filter(m => m && m.type === 'OUT' && m.reason === 'TRANSFERT'
        && (m.transferOrderId === id || String(m.notes || '').includes(id)))
      .map(m => ({ m, reste: arrondiQte(m.quantity) }))
    : [];
  const puiser = (strict: boolean) => items.forEach((it, k) => {
    const articles = [it.realArticleId || it.articleId, it.articleId];
    for (const c of candidats) {
      const besoin = arrondiQte(etats[k].envoye - etats[k].dejaSorti);
      if (besoin <= 0) break;
      if (c.reste <= 0 || !articles.includes(c.m.articleId)) continue;
      if (strict && (normVariante(c.m.color) !== normVariante(it.color)
        || normVariante(c.m.size) !== normVariante(it.size)
        || normVariante(c.m.quality) !== normVariante(it.quality))) continue;
      const pris = Math.min(besoin, c.reste);
      c.reste = arrondiQte(c.reste - pris);
      etats[k].dejaSorti = arrondiQte(etats[k].dejaSorti + pris);
    }
  });
  puiser(true);
  puiser(false);
  return etats.map(e => ({ ...e, resteASortir: arrondiQte(Math.max(0, e.envoye - e.dejaSorti)) }));
}

/** Les lignes dont la sortie au départ n'est pas (entièrement) retrouvée. */
export function lignesSansSortie(bon: Partial<BonTransfert> | null | undefined, mouvements: any[] = []): EtatSortieLigne[] {
  return sortiesParLigne(bon, mouvements).filter(e => e.resteASortir > 0);
}

/** La marchandise de ce bon a-t-elle entièrement quitté le départ ? (toutes ses lignes) */
export function sortieDejaFaite(bon: Partial<BonTransfert> | null | undefined, mouvements: any[] = []): boolean {
  if (!bon) return false;
  if (bon.sortieAlEnvoi === true) return true;
  const etats = sortiesParLigne(bon, mouvements);
  return etats.length > 0 && etats.every(e => e.resteASortir <= 0);
}

export type CodeStatutTransfert = 'EN_ROUTE' | 'RECU' | 'RECU_AVEC_MANQUANT' | 'ANNULE';

/** Le statut du bon, en mots simples, pour la pastille et le bon imprimé. */
export function statutTransfert(bon: Partial<BonTransfert>): { code: CodeStatutTransfert; libelle: string; aide: string } {
  if (bon.status === 'CANCELLED') {
    if (bon.closSansMouvement) {
      return { code: 'ANNULE', libelle: 'Clos', aide: 'Ancien bon clos par l\'administrateur, sans aucun mouvement de stock : il avait déjà été réglé autrement (inventaire…).' };
    }
    return { code: 'ANNULE', libelle: 'Annulé', aide: bon.sortieAlEnvoi
      ? 'Envoi annulé avant la réception : la marchandise est revenue dans le stock du départ.'
      : 'Bon annulé.' };
  }
  if (estAncienBonEnAttente(bon)) {
    return { code: 'EN_ROUTE', libelle: 'En route (ancien bon)', aide: 'Bon de l\'ancien fonctionnement (avant le 01/10/2026), jamais réceptionné.' };
  }
  if (estEnRoute(bon)) {
    return { code: 'EN_ROUTE', libelle: 'En route', aide: 'Sortie du stock du départ ; le magasin d\'arrivée doit la réceptionner.' };
  }
  const manque = totalManquant(bon);
  if (manque > 0) {
    return { code: 'RECU_AVEC_MANQUANT', libelle: 'Reçu, avec manquant', aide: 'Une partie n\'est pas arrivée : elle est notée comme perte au transport.' };
  }
  return { code: 'RECU', libelle: 'Reçu', aide: bon.sortieAlEnvoi || bon.recuPar || Array.isArray(bon.mouvementsEntree)
    ? 'Réceptionné par le magasin d\'arrivée : la marchandise est dans son stock.'
    : 'Transfert écrit d\'un coup (ancien parcours) : sortie et entrée faites le même jour.' };
}

/** Ce qui manque sur un bon reçu, toutes lignes confondues (les unités ne s'additionnent qu'à titre indicatif). */
export function totalManquant(bon: Partial<BonTransfert>): number {
  if (Array.isArray(bon.manquants)) return arrondiQte(bon.manquants.reduce((s, m) => s + (Number(m.manquant) || 0), 0));
  return 0;
}

/**
 * Les bons « À réceptionner » par un magasin : partis, pas encore reçus ni annulés, et destinés à
 * ce magasin. `magasin` à null = tous (l'admin en vue globale). Du plus ancien au plus récent :
 * c'est le plus ancien qui attend depuis le plus longtemps.
 *
 * Les anciens bons PENDING (avant le 01/10/2026) ne comptent que si `avecAnciens` : souvent
 * jamais validés alors que la marchandise est arrivée depuis longtemps et a été recomptée, ils
 * feraient clignoter le badge d'un magasin sans fin. Ils restent dans la liste, et l'admin les
 * voit (il peut les réceptionner ou les clore sans mouvement).
 */
export function transfertsAReceptionner<T extends Partial<BonTransfert>>(
  bons: T[] = [], magasin: string | null, options: { avecAnciens?: boolean } = {},
): T[] {
  return (bons || [])
    .filter(b => b && estEnRoute(b) && (options.avecAnciens || !estAncienBonEnAttente(b))
      && (magasin === null || b.toStore === magasin))
    .sort((a, b) => String(a.date || '').localeCompare(String(b.date || '')));
}

/** Ce qu'il faut savoir du journal pour dire si une action est possible. */
export type ContexteTransfert = {
  /** Faux tant que la collection des mouvements n'a pas répondu : le journal paraît vide. */
  mouvementsCharges?: boolean;
  mouvements?: any[];
};

export const MESSAGE_MOUVEMENTS_EN_CHARGEMENT =
  'Les mouvements de stock sont encore en cours de chargement : attendez quelques secondes, puis recommencez.';

/** Pourquoi un bouton est grisé : une phrase, ou null si l'action est permise. */
export function raisonPasReception(bon: Partial<BonTransfert>, compte: CompteTransfert, contexte: ContexteTransfert = {}): string | null {
  if (!estEnRoute(bon)) return bon.status === 'CANCELLED' ? 'Ce transfert a été annulé.' : 'Ce transfert est déjà reçu.';
  if (compte.lectureSeule) return 'Votre compte est en lecture seule : il ne peut pas réceptionner.';
  if (!estAdmin(compte) && compte.magasin !== bon.toStore) {
    return 'Seul le magasin d\'arrivée (ou l\'administrateur) peut réceptionner ce transfert.';
  }
  // Sans le journal, on ne sait ni où ranger, ni — pour un ancien bon — ce qui est déjà sorti.
  if (contexte.mouvementsCharges === false) return MESSAGE_MOUVEMENTS_EN_CHARGEMENT;
  if (!estAdmin(compte) && estAncienBonEnAttente(bon) && lignesSansSortie(bon, contexte.mouvements || []).length > 0) {
    return 'Ancien bon dont la sortie au départ n\'a pas été enregistrée : seul l\'administrateur peut le réceptionner '
      + '(il écrit en même temps la sortie du magasin de départ et l\'entrée chez vous). Prévenez-le.';
  }
  return null;
}

export function raisonPasAnnulation(bon: Partial<BonTransfert>, compte: CompteTransfert, contexte: ContexteTransfert = {}): string | null {
  if (!estEnRoute(bon)) return bon.status === 'CANCELLED' ? 'Ce transfert est déjà annulé.' : 'Un transfert reçu ne s\'annule plus.';
  if (!bon.sortieAlEnvoi || !Array.isArray(bon.sortiesEnvoi) || bon.sortiesEnvoi.length === 0) {
    return 'Ancien bon : ses sorties ne sont pas recopiées dessus, il ne peut pas être annulé ici. Il se réceptionne'
      + (estAdmin(compte) ? ', ou se clôt sans mouvement s\'il a déjà été réglé autrement.' : ' (ou l\'administrateur le clôt).');
  }
  if (compte.lectureSeule) return 'Votre compte est en lecture seule : il ne peut pas annuler.';
  if (!estAdmin(compte) && compte.magasin !== bon.fromStore) return 'Seul le magasin de départ (ou l\'administrateur) peut annuler cet envoi.';
  if (contexte.mouvementsCharges === false) return MESSAGE_MOUVEMENTS_EN_CHARGEMENT;
  return null;
}

/**
 * Clore un ancien bon sans mouvement : réservé à l'administrateur, pour un bon PENDING de l'ancien
 * parcours déjà réglé autrement (marchandise arrivée et recomptée par inventaire). Sans cette
 * issue, la seule façon de le faire disparaître serait de le réceptionner — et de faire entrer la
 * marchandise une seconde fois.
 */
export function raisonPasClore(bon: Partial<BonTransfert>, compte: CompteTransfert): string | null {
  if (!estAncienBonEnAttente(bon)) return 'Seul un ancien bon jamais réceptionné peut être clos sans mouvement.';
  if (compte.lectureSeule) return 'Votre compte est en lecture seule.';
  if (!estAdmin(compte)) return 'Seul l\'administrateur peut clore un ancien bon sans mouvement.';
  return null;
}

// ── La variante d'une ligne ────────────────────────────────────────────────────────────────────

/**
 * Variante (couleur, qualité ou taille) d'une ligne de transfert, pour ne prendre et ne ranger
 * que dans les racks de CETTE variante. La ligne garde l'articleId de sa ligne de stock : pour un
 * article éclaté, c'est l'id virtuel de computeStockItems (`<id réel>__color__Bleu`), qui porte à
 * lui seul la dimension et le libellé — utile pour un bon enregistré dont la ligne de stock n'est
 * plus listée (vue entrepôt : les lignes vides sont masquées).
 */
export function varianteDeLigne(item: Pick<TransferOrderItem, 'articleId'>, stockItems: any[] = []): StockVariant | null {
  const fromStock = stockItemVariant((stockItems || []).find(s => s.articleId === item.articleId));
  if (fromStock) return fromStock;
  const m = /__(quality|color|size)__(.+)$/.exec(String(item.articleId || ''));
  return m ? { dimension: m[1] as VariantDimension, value: m[2] } : null;
}

/** Les champs qui décrivent la marchandise d'une ligne, communs à tous ses mouvements. */
function champsLigne(item: TransferOrderItem) {
  return {
    articleId: item.realArticleId || item.articleId,
    categoryId: item.categoryId,
    productName: item.nameFR || item.productName,
    nameFR: item.nameFR,
    color: item.color,
    size: item.size,
    quality: item.quality,
    unitOfMeasure: item.unitOfMeasure,
  };
}

// ── Envoi ──────────────────────────────────────────────────────────────────────────────────────

/**
 * Les SORTIES de l'envoi, une ou plusieurs par ligne : emplacement résolu en FIFO parmi les racks
 * de la variante, comme toute sortie (splitOutboundLines). Toutes sous le nom du magasin de
 * départ — les règles n'acceptent rien d'autre d'un compte magasin. Aucune entrée à l'arrivée :
 * elle attend la réception.
 *
 * Renvoie les mouvements (sans createdAt, ajouté à l'écriture) et leur copie pour le bon.
 */
export function mouvementsEnvoi(p: {
  bonId: string;
  items: TransferOrderItem[];
  depart: string;
  arrivee: string;
  libelleArrivee?: string;
  mouvements: any[];
  stockItems?: any[];
  lieux?: LieuConnu[];
  /** AAAA-MM-JJ */
  date: string;
}): { mouvements: Record<string, any>[]; sorties: SortieTransfert[] } {
  // Copie de travail : chaque ligne générée y est ajoutée, pour que la ligne suivante d'une même
  // variante ne reprenne pas dans un rack que la précédente vient de vider.
  const work = [...(p.mouvements || [])];
  const mouvements: Record<string, any>[] = [];
  const sorties: SortieTransfert[] = [];
  p.items.forEach((item, ligne) => {
    const qte = arrondiQte(item.sentQty);
    if (qte <= 0) return;
    const commun = champsLigne(item);
    const base = {
      ...commun,
      type: 'OUT' as const,
      reason: 'TRANSFERT' as const,
      storeId: p.depart,
      toStoreId: p.arrivee,
      transferOrderId: p.bonId,
      date: p.date,
      // Pas d'état (« en route ») dans la note : un mouvement ne se réécrit pas, et la note se
      // relirait encore « en route » des mois après la réception. L'état est sur le bon.
      notes: `Transfert ${numeroBonTransfert(p.bonId)} (${p.bonId}) vers ${p.libelleArrivee || p.arrivee}`,
    };
    const lignes = splitOutboundLines(work, p.depart, commun.articleId, qte, base, varianteDeLigne(item, p.stockItems), p.lieux || []);
    for (const l of lignes) {
      mouvements.push(l);
      sorties.push(sansVide({
        ligne,
        articleId: commun.articleId,
        quantity: l.quantity,
        locationCode: l.locationCode,
        locationId: l.locationId,
        categoryId: commun.categoryId,
        productName: commun.productName,
        nameFR: commun.nameFR,
        color: commun.color,
        size: commun.size,
        quality: commun.quality,
        unitOfMeasure: commun.unitOfMeasure,
      }));
    }
    work.push(...lignes);
  });
  return { mouvements, sorties };
}

/** Retire les champs vides : Firestore refuse `undefined`, et un champ vide n'apprend rien. */
function sansVide<T extends Record<string, any>>(o: T): T {
  const r: Record<string, any> = {};
  for (const [k, v] of Object.entries(o)) if (v !== undefined && v !== null && v !== '') r[k] = v;
  return r as T;
}

// ── Réception ──────────────────────────────────────────────────────────────────────────────────

/** Ce qui est compté à l'arrivée, par articleId de ligne ; une ligne non saisie vaut l'envoyé. */
export type QuantitesRecues = Record<string, number | undefined>;

export const recuDeLigne = (item: TransferOrderItem, recus: QuantitesRecues = {}): number => {
  const v = recus[item.articleId];
  return v === undefined || v === null || Number.isNaN(Number(v)) ? arrondiQte(item.sentQty) : arrondiQte(Number(v));
};

/**
 * Le contrôle des quantités reçues. Une ligne doit être entre 0 et ce qui a été ENVOYÉ.
 *
 * Plus que l'envoyé est refusé — l'ancien écran tolérait +10 %, mais l'ancien écran ne savait pas
 * ce qui était sorti. Ici la sortie au départ vaut exactement l'envoyé : accepter 11 à l'arrivée
 * pour 10 sortis ferait apparaître 1 pièce qu'aucun stock n'a perdue. Si davantage est vraiment
 * arrivé, c'est le comptage du départ qui était faux : on reçoit l'envoyé, et le départ fait un
 * second transfert du surplus (ou un inventaire), sous son nom.
 */
export function erreurReception(items: TransferOrderItem[], recus: QuantitesRecues = {}): string | null {
  for (const item of items || []) {
    const v = recus[item.articleId];
    if (v !== undefined && v !== null && (!Number.isFinite(Number(v)) || Number(v) < 0)) {
      return `La quantité reçue pour ${item.productName} n'est pas un nombre valide (0 ou plus).`;
    }
    const recu = recuDeLigne(item, recus);
    if (recu > arrondiQte(item.sentQty)) {
      return `${item.productName} : ${qteAvecUnite(recu, item.unitOfMeasure)} reçus pour ${qteAvecUnite(item.sentQty, item.unitOfMeasure)} envoyés. `
        + 'On ne peut pas recevoir plus que ce qui est parti. S\'il est vraiment arrivé davantage, recevez l\'envoyé et '
        + 'demandez au magasin de départ un second transfert pour le surplus.';
    }
  }
  return null;
}

/** Les manquants d'une réception : une entrée par ligne où il manque quelque chose. */
export function calculManquants(items: TransferOrderItem[], recus: QuantitesRecues = {}): ManquantTransfert[] {
  const out: ManquantTransfert[] = [];
  for (const item of items || []) {
    const envoye = arrondiQte(item.sentQty);
    const recu = Math.min(recuDeLigne(item, recus), envoye);
    const manquant = arrondiQte(envoye - recu);
    if (manquant > 0) {
      out.push(sansVide({
        articleId: item.realArticleId || item.articleId,
        productName: item.nameFR || item.productName,
        color: item.color, size: item.size, quality: item.quality, unitOfMeasure: item.unitOfMeasure,
        envoye, recu, manquant,
      }));
    }
  }
  return out;
}

/**
 * Les ENTRÉES de la réception, une par ligne reçue (quantité > 0), sous le nom du magasin
 * d'arrivée. Rangement : là où la variante est déjà dans ce magasin, si l'endroit est unique
 * (suggestInboundLocation) — sinon nulle part, à ranger.
 *
 * Aucun mouvement pour le manquant : il est déjà sorti au départ (voir l'en-tête du fichier).
 */
export function mouvementsReception(p: {
  bon: Pick<TransferOrder, 'id' | 'fromStore' | 'toStore' | 'items'>;
  recus?: QuantitesRecues;
  libelleDepart?: string;
  mouvements: any[];
  stockItems?: any[];
  date: string;
}): Record<string, any>[] {
  const work = [...(p.mouvements || [])];
  const out: Record<string, any>[] = [];
  for (const item of p.bon.items || []) {
    const recu = Math.min(recuDeLigne(item, p.recus), arrondiQte(item.sentQty));
    if (recu <= 0) continue;
    const commun = champsLigne(item);
    const dest = suggestInboundLocation(work, p.bon.toStore, commun.articleId, varianteDeLigne(item, p.stockItems));
    const ligne = {
      ...commun,
      type: 'IN' as const,
      reason: 'TRANSFERT' as const,
      storeId: p.bon.toStore,
      toStoreId: p.bon.toStore,
      fromStoreId: p.bon.fromStore,
      transferOrderId: p.bon.id,
      ...(dest ? { locationCode: dest.locationCode, ...(dest.locationId ? { locationId: dest.locationId } : {}) } : {}),
      quantity: recu,
      date: p.date,
      notes: `Réception du transfert ${numeroBonTransfert(p.bon.id)} (${p.bon.id}) depuis ${p.libelleDepart || p.bon.fromStore}`,
    };
    out.push(ligne);
    work.push(ligne);
  }
  return out;
}

/**
 * Ancien bon dont la sortie n'est pas (entièrement) retrouvée au journal : les SORTIES qui
 * manquent au départ, écrites au moment de la réception — par l'administrateur seul, car elles
 * sont sous le nom du magasin de départ. Avec elles, le bon finit comme un bon du nouveau
 * parcours : le départ a perdu l'envoyé, l'arrivée a gagné le reçu, le manquant est une perte
 * au transport. L'ancien écran écrivait au contraire une PERTE à l'arrivée sans jamais débiter
 * le départ : la marchandise reçue apparaissait de rien.
 */
export function mouvementsRattrapageSortie(p: {
  bon: Pick<BonTransfert, 'id' | 'fromStore' | 'toStore' | 'items'> & Partial<BonTransfert>;
  libelleArrivee?: string;
  mouvements: any[];
  stockItems?: any[];
  lieux?: LieuConnu[];
  date: string;
}): Record<string, any>[] {
  const manquantes = lignesSansSortie(p.bon, p.mouvements);
  const work = [...(p.mouvements || [])];
  const out: Record<string, any>[] = [];
  for (const etat of manquantes) {
    const item = p.bon.items[etat.ligne];
    const commun = champsLigne(item);
    const base = {
      ...commun,
      type: 'OUT' as const,
      reason: 'TRANSFERT' as const,
      storeId: p.bon.fromStore,
      toStoreId: p.bon.toStore,
      transferOrderId: p.bon.id,
      date: p.date,
      notes: `Transfert ${numeroBonTransfert(p.bon.id)} (${p.bon.id}) vers ${p.libelleArrivee || p.bon.toStore} : `
        + 'sortie écrite à la réception, celle de l\'envoi n\'avait pas été enregistrée',
    };
    const lignes = splitOutboundLines(work, p.bon.fromStore, commun.articleId, etat.resteASortir, base, varianteDeLigne(item, p.stockItems), p.lieux || []);
    out.push(...lignes);
    work.push(...lignes);
  }
  return out;
}

/** La phrase du journal pour une perte au transport, ou rien s'il ne manque rien. */
export function phrasePerteTransport(manquants: ManquantTransfert[]): string {
  if (!manquants || manquants.length === 0) return '';
  return 'Perte au transport : ' + manquants
    .map(m => `${m.productName}${[m.quality, m.color, m.size].filter(Boolean).length ? ` (${[m.quality, m.color, m.size].filter(Boolean).join(' · ')})` : ''} ${qteAvecUnite(m.manquant, m.unitOfMeasure)}`)
    .join(', ');
}

// ── Annulation ─────────────────────────────────────────────────────────────────────────────────

/**
 * Les mouvements qui rendent au départ ce que l'envoi en a sorti : une ENTRÉE par sortie, même
 * article, même variante, même emplacement, même quantité — sous le nom du magasin de départ.
 * `toStoreId` = le départ lui-même : c'est sur lui que le calcul des racks crédite une entrée de
 * transfert (computeArticleLocationStock), et sur `storeId` que le calcul du stock la crédite.
 *
 * `sortiesReelles` : les mouvements de sortie eux-mêmes, relus au moment d'annuler, dans l'ordre
 * de `mouvementsSortie` (null pour un document introuvable). Ils font foi : renommer un
 * emplacement réécrit le `locationCode` des mouvements, pas la copie figée sur le bon — rendre
 * d'après la copie remettrait la marchandise dans un rack qui n'existe plus. Une sortie
 * introuvable (supprimée) ne retire plus rien du stock : on ne la rend pas, sinon on créerait
 * de la marchandise. Sans relecture (`sortiesReelles` absent), la copie du bon sert.
 */
export function mouvementsAnnulation(
  bon: Pick<BonTransfert, 'id' | 'fromStore' | 'sortiesEnvoi'> & Partial<Pick<BonTransfert, 'mouvementsSortie'>>,
  date: string,
  sortiesReelles?: Array<Record<string, any> | null | undefined>,
): Record<string, any>[] {
  const relues = Array.isArray(sortiesReelles) && Array.isArray(bon.mouvementsSortie) && bon.mouvementsSortie.length > 0
    && sortiesReelles.length === bon.mouvementsSortie.length;
  const source: any[] = relues
    ? sortiesReelles!.map((m, k) => {
      if (!m || m.type !== 'OUT' || m.reason !== 'TRANSFERT' || m.transferOrderId !== bon.id) return null;
      // L'emplacement et la quantité actuels du mouvement ; la variante, au besoin, de la copie.
      const copie = (bon.sortiesEnvoi || [])[k] || {};
      return { ...copie, ...m, locationCode: m.locationCode, locationId: m.locationId };
    })
    : (bon.sortiesEnvoi || []);
  return source
    .filter(s => s && s.articleId && arrondiQte(s.quantity) > 0)
    .map(s => sansVide({
      articleId: s.articleId,
      categoryId: s.categoryId,
      productName: s.productName,
      nameFR: s.nameFR,
      color: s.color,
      size: s.size,
      quality: s.quality,
      unitOfMeasure: s.unitOfMeasure,
      type: 'IN' as const,
      reason: 'TRANSFERT' as const,
      storeId: bon.fromStore,
      toStoreId: bon.fromStore,
      transferOrderId: bon.id,
      annulationTransfert: true,
      locationCode: s.locationCode,
      locationId: s.locationId,
      quantity: arrondiQte(s.quantity),
      date,
      notes: `Annulation du transfert ${numeroBonTransfert(bon.id)} (${bon.id}) : marchandise remise en stock`,
    }));
}
