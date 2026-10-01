/**
 * Le bon sans prix, devenu le parcours normal d'une vente.
 *
 * Au magasin, la vente se passe ainsi : le gestionnaire saisit ce que le client emporte, SANS
 * prix, imprime le bon et le donne au commercial. Le commercial lui rend le papier avec les prix
 * unitaires (au mètre, à la pièce — jamais au conditionnement), la remise, et parfois une
 * quantité corrigée parce que le client a pris moins. Le gestionnaire saisit alors le tout, et
 * encaisse.
 *
 * Le client, lui, est parti avec sa marchandise dès le bon imprimé : c'est donc le BON qui sort
 * le stock, plus la facture. Un marqueur sur le bon (`sortieAuBon`) le dit, et la facturation qui
 * suit ne ressort rien. Les anciennes commandes, qui n'ont pas ce marqueur, gardent leur
 * comportement : la marchandise sort quand on les facture.
 *
 * Ce fichier ne connaît ni Firestore ni l'écran : il calcule. Numéro du bon, regroupement des
 * lignes pour le papier, saisie des prix, comparaison avec le total écrit à la main, mouvements
 * de stock d'une correction ou d'une annulation, statut lisible, ancienneté d'un bon comptoir.
 * Tout se vérifie par `npx tsx scripts/test-bon-sans-prix.ts`.
 */

import { sansPrix } from './commande-sans-prix';
import { uniteDecimale } from './unites-pole';
import { articleVariantDimension, type StockVariant } from './warehouse-locations';

const arrondi2 = (n: unknown) => Math.round((Number(n) || 0) * 100) / 100;
const arrondi3 = (n: unknown) => Math.round((Number(n) || 0) * 1000) / 1000;
/** Un prix ramené d'une unité à une autre (prix au mètre × 50 m) : précis, sans traîne flottante. */
const arrondi6 = (n: unknown) => Math.round((Number(n) || 0) * 1e6) / 1e6;

/** Libellé comparé sans casse, sans accents ni espaces autour : « Écru » vaut « ECRU ». */
const ACCENTS = /[̀-ͯ]/g;
const normaliser = (v: unknown): string =>
  String(v ?? '').normalize('NFD').replace(ACCENTS, '').trim().toLowerCase();

// ─────────────────────────────────────────────────────────────────────────────
// L'unité du prix : au mètre ou à la pièce, jamais au conditionnement
// ─────────────────────────────────────────────────────────────────────────────

/** « pcs », « pièces », « unité » ou rien : c'est toujours la pièce. */
const UNITES_PIECE = new Set(['', 'unite', 'unites', 'piece', 'pieces', 'pcs', 'pc']);
export const estUnitePiece = (unite: unknown): boolean => UNITES_PIECE.has(normaliser(unite));

/** Les unités qui comptent des colis (rouleaux, sacs, douzaines, grosses), pas des mètres ni des pièces. */
export function estConditionnement(unite: unknown): boolean {
  const u = normaliser(unite);
  return ['rolls', 'roll', 'rouleau', 'rouleaux', 'bag', 'bags', 'sac', 'sacs', 'doz', 'douzaine', 'douzaines', 'carton', 'cartons', 'box']
    .includes(u) || u.startsWith('gross');
}

export interface Contenance { facteur: number; uniteBase: string }

/**
 * Ce que contient UNE unité de la ligne, quand elle se compte en conditionnement : 1 rouleau =
 * 50 m, 1 sac = 500 pièces, 1 douzaine = 12 pièces. Le commercial écrit son prix au mètre ou à
 * la pièce : c'est ce rapport qui le ramène au prix du rouleau. `null` : la ligne se compte déjà
 * en mètres ou en pièces — ou le rapport n'est pas connu (le papier le signale alors en rouge).
 */
export function contenanceDeLigne(ligne: any): Contenance | null {
  const c = ligne?.contenance;
  if (c && Number(c.facteur) > 0 && String(c.uniteBase || '').trim()) {
    return { facteur: Number(c.facteur), uniteBase: estUnitePiece(c.uniteBase) ? 'pièce' : String(c.uniteBase).trim() };
  }
  const u = normaliser(ligne?.unitOfMeasure);
  if (u === 'doz' || u === 'douzaine' || u === 'douzaines') return { facteur: 12, uniteBase: 'pièce' };
  if (u.startsWith('gross')) return { facteur: 144, uniteBase: 'pièce' };
  return null;
}

/**
 * La contenance à inscrire sur une ligne au moment du bon, d'après la ligne de stock : longueur
 * du rouleau, pièces par sac. Rien d'inventé : un champ vide ne donne rien.
 */
export function contenanceDepuisStock(unite: unknown, stock: any): Contenance | undefined {
  const u = normaliser(unite);
  if (['rolls', 'roll', 'rouleau', 'rouleaux'].includes(u)) {
    const longueur = Number(stock?.rollLength);
    if (longueur > 0) return { facteur: longueur, uniteBase: String(stock?.rollLengthUnit || 'm').trim() || 'm' };
  }
  if (['bag', 'bags', 'sac', 'sacs'].includes(u)) {
    const pieces = Number(stock?.pcsPerBag);
    if (pieces > 0) return { facteur: pieces, uniteBase: 'pièce' };
  }
  return undefined;
}

/** L'unité dans laquelle le commercial écrit le prix de cette ligne : « m », « pièce »… */
export function unitePrixDeLigne(ligne: any): string {
  const c = contenanceDeLigne(ligne);
  if (c) return c.uniteBase;
  return estUnitePiece(ligne?.unitOfMeasure) ? 'pièce' : String(ligne?.unitOfMeasure || '').trim();
}

/** Combien d'unités de prix dans une unité de la ligne (50 pour un rouleau de 50 m, 1 sinon). */
export const facteurPrix = (ligne: any): number => contenanceDeLigne(ligne)?.facteur || 1;

/** Une ligne comptée en conditionnement dont on ne connaît pas la contenance : prix au rouleau entier. */
export const conditionnementSansContenance = (ligne: any): boolean =>
  estConditionnement(ligne?.unitOfMeasure) && !contenanceDeLigne(ligne);

/** Le prix de la ligne au mètre ou à la pièce (celui qu'écrit le commercial). */
export function prixParUnitePrix(ligne: any): number {
  if (Number(ligne?.prixBase) > 0) return Number(ligne.prixBase);
  const p = Number(ligne?.unitPrice) || 0;
  return p > 0 ? arrondi6(p / facteurPrix(ligne)) : 0;
}

// ─────────────────────────────────────────────────────────────────────────────
// La variante de stock d'une ligne
// ─────────────────────────────────────────────────────────────────────────────

/**
 * La variante dont la ligne a puisé le stock : celle que la caisse a notée sur la ligne
 * (`varianteStock`) ; pour un bon plus ancien, la dimension de ventilation de l'article, comme
 * pour un retour. Jamais « la qualité d'abord » : sur un article ventilé par couleur, toutes les
 * couleurs portent la même qualité, et la FIFO irait puiser dans le rack d'une autre couleur.
 */
export function varianteDeLigne(ligne: any, articles: any[] = []): StockVariant | null {
  const v = ligne?.varianteStock;
  if (v && (v.dimension === 'quality' || v.dimension === 'color' || v.dimension === 'size') && String(v.value ?? '').trim()) {
    return { dimension: v.dimension, value: String(v.value) };
  }
  const article = (articles || []).find((a: any) => a?.id === ligne?.articleId);
  const dimension = article ? articleVariantDimension(article) : null;
  if (!dimension) return null;
  const valeur = String(ligne?.[dimension] ?? '').trim();
  return valeur ? { dimension, value: valeur } : null;
}

// ─────────────────────────────────────────────────────────────────────────────
// Les motifs de stock propres au bon
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Un compte magasin ne peut pas effacer un mouvement : annuler un bon ou corriger une quantité
 * écrit donc un mouvement INVERSE, avec un motif qui se lit au journal et le numéro du bon.
 */
export const MOTIF_ANNULATION_BON = 'ANNULATION_BON' as const;
export const MOTIF_CORRECTION_BON = 'CORRECTION_BON' as const;

// ─────────────────────────────────────────────────────────────────────────────
// Numéro du bon, par magasin
// ─────────────────────────────────────────────────────────────────────────────

/** Les magasins connus ont leur préfixe à eux : CH-0001 pour CHRIFA, DO- pour Derb Omar, ID- pour IDAA. */
export const PREFIXES_MAGASINS: Record<string, string> = { CHRIFA: 'CH', DERB_OMAR: 'DO', IDAA: 'ID' };

/**
 * Préfixes qu'aucun magasin ne doit prendre : « BC » est celui des anciens numéros calculés à
 * l'écran (BC-0001…). Un magasin qui s'appellerait « Bouchentouf Centre » donnerait sinon un
 * BC-0001 qui désignerait deux bons différents.
 */
const PREFIXES_RESERVES = new Set(['BC']);

const lettresSeules = (v: unknown): string =>
  String(v ?? '').normalize('NFD').replace(ACCENTS, '').toUpperCase();

/**
 * Le préfixe des bons d'un magasin.
 *
 * Magasin connu : son préfixe fixé. Sinon les initiales des deux premiers mots du nom
 * (« Derb Omar » → DO), ou ses deux premières lettres (« Maarif » → MA). Si ce préfixe est déjà
 * pris — réservé, ou porté par un autre magasin — on essaie la première lettre suivie de
 * chacune des suivantes, puis d'un chiffre : deux magasins ne partagent jamais une numérotation.
 *
 * Le préfixe choisi est ensuite figé sur la fiche du magasin (`prefixeBons`) au premier bon :
 * créer un nouveau magasin ne peut plus changer celui d'un ancien.
 */
export function prefixeMagasin(storeId: string, nom?: string, prefixesPris: Iterable<string> = []): string {
  const id = String(storeId ?? '').trim().toUpperCase();
  const pris = new Set<string>([...Array.from(prefixesPris || []).map(p => String(p).toUpperCase()), ...PREFIXES_RESERVES]);
  if (PREFIXES_MAGASINS[id] && !pris.has(PREFIXES_MAGASINS[id])) return PREFIXES_MAGASINS[id];

  const source = lettresSeules(nom).trim() || lettresSeules(storeId).trim();
  const mots = source.split(/[^A-Z0-9]+/).filter(Boolean);
  const toutes = mots.join('');

  const candidats: string[] = [];
  if (mots.length >= 2) candidats.push(mots[0][0] + mots[1][0]);
  if (toutes.length >= 2) candidats.push(toutes.slice(0, 2));
  for (let i = 1; i < toutes.length; i++) candidats.push(toutes[0] + toutes[i]);
  const initiale = toutes[0] || 'M';
  for (let c = 1; c <= 9; c++) candidats.push(`${initiale}${c}`);

  return candidats.find(p => p.length === 2 && !pris.has(p)) || `${initiale}X`;
}

/** « CH-0001 ». Quatre chiffres au moins, plus quand il le faut (CH-10000). */
export const numeroBon = (prefixe: string, compteur: number): string =>
  `${prefixe}-${String(Math.max(1, Math.trunc(Number(compteur) || 0))).padStart(4, '0')}`;

/**
 * Le numéro d'un bon saisi sans connexion. Le compteur du magasin ne peut pas être lu : on ne
 * bloque pas la vente pour autant, mais le numéro le dit en toutes lettres — « PROV » — et
 * l'heure le rend unique sur la journée.
 */
export function numeroProvisoire(prefixe: string, quand: Date): string {
  const d2 = (n: number) => String(n).padStart(2, '0');
  return `${prefixe}-PROV-${d2(quand.getDate())}${d2(quand.getMonth() + 1)}-${d2(quand.getHours())}${d2(quand.getMinutes())}${d2(quand.getSeconds())}`;
}

export const estNumeroProvisoire = (numero: unknown): boolean => /-PROV-/.test(String(numero ?? ''));

/**
 * Le numéro suivant, lu sur la fiche du magasin : `compteurBons` est le dernier numéro donné.
 * Calcul pur, appelé DANS la transaction qui l'écrit — deux caisses ne peuvent pas obtenir le
 * même numéro.
 */
export function prochainNumero(
  ficheMagasin: { compteurBons?: unknown; prefixeBons?: unknown } | null | undefined,
  prefixeCalcule: string,
): { compteur: number; prefixe: string; numero: string } {
  const dernier = Math.max(0, Math.trunc(Number(ficheMagasin?.compteurBons) || 0));
  const prefixe = String(ficheMagasin?.prefixeBons || '').trim().toUpperCase() || prefixeCalcule;
  const compteur = dernier + 1;
  return { compteur, prefixe, numero: numeroBon(prefixe, compteur) };
}

// ─────────────────────────────────────────────────────────────────────────────
// Nature et statut d'un bon
// ─────────────────────────────────────────────────────────────────────────────

/**
 * - COMPTOIR : client de passage, parti avec la marchandise — le prix doit être saisi tout de
 *   suite, c'est le rappel le plus pressant.
 * - CLIENT : client suivi par son dossier, parti avec la marchandise.
 * - A_PREPARER : le client n'est pas encore venu (ou livraison) — rien n'est sorti, la
 *   marchandise sort à l'enlèvement. Les anciennes commandes, sans marqueur, en sont.
 */
export type NatureBon = 'COMPTOIR' | 'CLIENT' | 'A_PREPARER';

/** Le bon a-t-il déjà sorti la marchandise ? Seuls les bons qui le disent : jamais les anciens. */
export const estSortiAuBon = (bon: any): boolean => bon?.sortieAuBon === true;

export function natureBon(bon: any): NatureBon {
  if (!estSortiAuBon(bon)) return 'A_PREPARER';
  return bon?.comptoir === true ? 'COMPTOIR' : 'CLIENT';
}

export const LIBELLE_NATURE: Record<NatureBon, string> = {
  COMPTOIR: 'Comptoir',
  CLIENT: 'Client',
  A_PREPARER: 'À préparer',
};

/** Encore à traiter : ni facturé, ni annulé. */
export const bonEnCours = (bon: any): boolean =>
  !!bon && bon.status !== 'INVOICED' && bon.status !== 'CANCELLED';

export type CodeStatutBon = 'A_CHIFFRER' | 'A_ENCAISSER' | 'TERMINE' | 'ANNULE';

export const LIBELLE_STATUT: Record<CodeStatutBon, string> = {
  A_CHIFFRER: 'À chiffrer',
  A_ENCAISSER: 'Chiffré, à encaisser',
  TERMINE: 'Terminé',
  ANNULE: 'Annulé',
};

/** La facture d'un bon facturé, si on la trouve. */
export function factureDuBon(bon: any, factures: any[] = []): any | null {
  if (!bon) return null;
  return (Array.isArray(factures) ? factures : []).find((f: any) => (bon.invoiceId && f?.id === bon.invoiceId) || (f?.orderId && f.orderId === bon.id)) || null;
}

/** Une facture qui attend encore de l'argent (ni réglée, ni couverte par un chèque en attente, ni annulée). */
export const factureNonReglee = (facture: any): boolean =>
  !!facture && (facture.status === 'UNPAID' || facture.status === 'PARTIAL');

/** Un bon sans dossier client : rien ne peut rester dû, la facture se règle en totalité. */
export const bonSansClient = (bon: any): boolean => bon?.comptoir === true || !bon?.clientId;

/**
 * Un bon comptoir facturé dont l'argent n'est pas encore là : l'encaissement a été fermé avant
 * d'être enregistré. Il n'est pas « terminé » — le client est parti, et sans dossier client
 * personne ne pourra le relancer. Il reste « à encaisser », et le rappel rouge reste allumé.
 */
export function comptoirFactureNonEncaisse(bon: any, factures: any[] = []): boolean {
  if (bon?.status !== 'INVOICED' || natureBon(bon) !== 'COMPTOIR') return false;
  return factureNonReglee(factureDuBon(bon, factures));
}

/**
 * Le statut que l'écran affiche, en mots. Un bon client facturé est terminé (ce qu'il doit suit
 * son dossier) ; un bon comptoir facturé mais pas encaissé reste « Chiffré, à encaisser ».
 */
export function statutBon(bon: any, factures: any[] = []): { code: CodeStatutBon; libelle: string } {
  let code: CodeStatutBon;
  if (bon?.status === 'CANCELLED') code = 'ANNULE';
  else if (bon?.status === 'INVOICED') code = comptoirFactureNonEncaisse(bon, factures) ? 'A_ENCAISSER' : 'TERMINE';
  else if ((bon?.items || []).length === 0 || (bon?.items || []).some(sansPrix)) code = 'A_CHIFFRER';
  else code = 'A_ENCAISSER';
  return { code, libelle: LIBELLE_STATUT[code] };
}

// ─────────────────────────────────────────────────────────────────────────────
// Ancienneté et urgence d'un bon comptoir
// ─────────────────────────────────────────────────────────────────────────────

/** Au-delà de ce délai, un bon comptoir sans prix devient pressant (rappel plus insistant). */
export const SEUIL_URGENCE_MINUTES = 15;

/**
 * L'instant où le bon a été enregistré, en millisecondes. `creeLe` est écrit par le poste au
 * moment du bon : il existe tout de suite, même hors connexion, là où l'horodatage du serveur
 * reste vide tant que l'écriture n'est pas partie. À défaut, l'horodatage serveur ; à défaut
 * encore, la date du bon à minuit.
 */
export function instantCreation(bon: any): number | null {
  const iso = bon?.creeLe ? Date.parse(String(bon.creeLe)) : NaN;
  if (Number.isFinite(iso)) return iso;
  const c = bon?.createdAt;
  if (c) {
    if (typeof c.seconds === 'number') return c.seconds * 1000;
    if (typeof c.toMillis === 'function') return c.toMillis();
    const t = new Date(c).getTime();
    if (Number.isFinite(t)) return t;
  }
  const jour = bon?.date ? Date.parse(`${bon.date}T00:00:00`) : NaN;
  return Number.isFinite(jour) ? jour : null;
}

export function ancienneteMinutes(bon: any, maintenant: number): number {
  const t = instantCreation(bon);
  if (t == null) return 0;
  return Math.max(0, Math.floor((maintenant - t) / 60000));
}

/** « à l'instant », « il y a 12 min », « il y a 2 h 05 », « depuis 3 jours ». */
export function libelleAnciennete(minutes: number): string {
  const m = Math.max(0, Math.floor(Number(minutes) || 0));
  if (m < 1) return "à l'instant";
  if (m < 60) return `il y a ${m} min`;
  if (m < 24 * 60) {
    const h = Math.floor(m / 60);
    return `il y a ${h} h ${String(m % 60).padStart(2, '0')}`;
  }
  const j = Math.floor(m / (24 * 60));
  return `depuis ${j} jour${j > 1 ? 's' : ''}`;
}

/**
 * Un bon comptoir qui attend encore : d'être chiffré, ou d'être encaissé (facturé, mais
 * l'encaissement a été fermé sans rien enregistrer). C'est lui qui déclenche l'alerte rouge.
 */
export const bonComptoirEnAttente = (bon: any, factures: any[] = []): boolean =>
  natureBon(bon) === 'COMPTOIR' && (bonEnCours(bon) || comptoirFactureNonEncaisse(bon, factures));

export interface RappelComptoir {
  nombre: number;
  /** Ceux qui attendent leurs prix. */
  nombreAChiffrer: number;
  /** Ceux qui sont chiffrés (ou facturés) mais pas encore encaissés. */
  nombreAEncaisser: number;
  plusAncien: any | null;
  minutesPlusAncien: number;
  /** Le plus ancien attend depuis plus de SEUIL_URGENCE_MINUTES. */
  urgent: boolean;
}

export function rappelComptoir(bons: any[], maintenant: number, factures: any[] = []): RappelComptoir {
  const enAttente = (bons || []).filter(b => bonComptoirEnAttente(b, factures));
  const nombreAChiffrer = enAttente.filter(b => statutBon(b, factures).code === 'A_CHIFFRER').length;
  let plusAncien: any = null;
  let tPlusAncien = Infinity;
  for (const b of enAttente) {
    const t = instantCreation(b) ?? maintenant;
    if (t < tPlusAncien) { tPlusAncien = t; plusAncien = b; }
  }
  const minutes = plusAncien ? ancienneteMinutes(plusAncien, maintenant) : 0;
  return {
    nombre: enAttente.length, nombreAChiffrer, nombreAEncaisser: enAttente.length - nombreAChiffrer,
    plusAncien, minutesPlusAncien: minutes, urgent: !!plusAncien && minutes >= SEUIL_URGENCE_MINUTES,
  };
}

/** Ce que le titre de l'onglet peut porter devant le titre de base — à retirer pour le retrouver. */
export const PREFIXE_TITRE_ONGLET = /^\(\d+\) (Prix à saisir|À encaisser) · /;

/**
 * Le titre de l'onglet du navigateur : « (2) Prix à saisir · … » tant qu'un bon comptoir attend
 * ses prix ; « (1) À encaisser · … » quand il ne reste qu'à encaisser.
 */
export const titreOnglet = (nombreAChiffrer: number, titreDeBase: string, nombreAEncaisser = 0): string =>
  nombreAChiffrer > 0 ? `(${nombreAChiffrer}) Prix à saisir · ${titreDeBase}`
    : nombreAEncaisser > 0 ? `(${nombreAEncaisser}) À encaisser · ${titreDeBase}`
      : titreDeBase;

/**
 * L'ordre de l'écran « Bons à chiffrer » : d'abord les bons comptoir en attente (le plus vieux
 * en tête), puis les autres bons en cours (le plus vieux en tête aussi — c'est le plus en
 * retard), puis tout le reste, du plus récent au plus ancien.
 */
export function trierBons<T>(bons: T[], maintenant: number, factures: any[] = []): T[] {
  const rang = (b: any) => (bonComptoirEnAttente(b, factures) ? 0 : bonEnCours(b) ? 1 : 2);
  return [...(bons || [])].sort((a: any, b: any) => {
    const ra = rang(a), rb = rang(b);
    if (ra !== rb) return ra - rb;
    const ta = instantCreation(a) ?? 0, tb = instantCreation(b) ?? 0;
    if (ra < 2) return ta - tb;
    return String(b?.date || '').localeCompare(String(a?.date || '')) || tb - ta;
  });
}

/** Recherche par numéro de bon ou par client (sans accents ni casse) ; les notes comptent aussi. */
export function bonCorrespond(bon: any, recherche: string, numeroAffiche?: string): boolean {
  const q = normaliser(recherche);
  if (!q) return true;
  return [numeroAffiche, bon?.orderNumber, bon?.clientName, bon?.notes]
    .some(v => normaliser(v).includes(q));
}

// ─────────────────────────────────────────────────────────────────────────────
// Le papier : lignes regroupées par produit + qualité
// ─────────────────────────────────────────────────────────────────────────────

export interface LigneDeGroupe {
  /** Rang de la ligne dans le bon : c'est par lui que la saisie retrouve la ligne. */
  index: number;
  ligneId?: string;
  couleur: string;
  taille: string;
  quantite: number;
  unite: string;
  /** Le prix au mètre ou à la pièce (l'unité du prix du groupe), pas au rouleau. */
  prixUnitaire: number;
  total: number;
  lieu?: string;
  /** Ce que contient une unité de la ligne (1 rouleau = 50 m), quand elle se compte en colis. */
  contenance: Contenance | null;
}

export interface GroupeBon {
  cle: string;
  produit: string;
  qualite: string;
  /** L'unité dans laquelle le prix du groupe s'écrit : « m », « pièce »… jamais un colis, si on peut l'éviter. */
  unitePrix: string;
  /** Des lignes se comptent en colis sans contenance connue : leur prix est celui du colis entier. */
  prixAuColis: boolean;
  lignes: LigneDeGroupe[];
  /** Le total des quantités, par unité (« 25 m », « 4 rolls ») : on n'additionne jamais des mètres et des pièces. */
  totaux: { unite: string; quantite: number }[];
  /** Le prix commun à toutes les lignes, quand il y en a un ; null sinon. */
  prixUnique: number | null;
  /** Des lignes du groupe ont des prix différents. */
  prixDifferents: boolean;
  /** Le groupe a au moins une taille : la colonne Taille s'imprime. */
  avecTailles: boolean;
}

/**
 * La clé d'un groupe : le produit, sa qualité, et l'unité dans laquelle son prix s'écrit. Deux
 * qualités du même produit ne se mélangent pas ; une couleur au rouleau de 50 m et une autre au
 * mètre partagent le même prix au mètre ; mais un prix au mètre ne se recopie jamais sur des
 * pièces.
 */
export const cleGroupe = (ligne: any): string =>
  `${normaliser(ligne?.productName || ligne?.nameFR)}|${normaliser(ligne?.quality)}|${normaliser(unitePrixDeLigne(ligne))}`;

/**
 * Les lignes du bon, regroupées par produit et qualité. Les couleurs et tailles d'un groupe
 * forment son sous-tableau, avec un total : c'est la forme qu'attend le commercial, qui écrit UN
 * prix par produit et par qualité.
 */
export function grouperLignesBon(items: any[]): GroupeBon[] {
  const groupes = new Map<string, GroupeBon>();
  (items || []).forEach((item: any, index: number) => {
    const cle = cleGroupe(item);
    let g = groupes.get(cle);
    if (!g) {
      g = {
        cle,
        produit: String(item?.productName || item?.nameFR || '—'),
        qualite: String(item?.quality || '').trim(),
        unitePrix: unitePrixDeLigne(item),
        prixAuColis: false,
        lignes: [], totaux: [], prixUnique: null, prixDifferents: false, avecTailles: false,
      };
      groupes.set(cle, g);
    }
    const quantite = arrondi3(item?.qty);
    const prixLigne = Number(item?.unitPrice) > 0 ? Number(item.unitPrice) : 0;
    if (conditionnementSansContenance(item)) g.prixAuColis = true;
    g.lignes.push({
      index,
      ligneId: item?.ligneId,
      couleur: String(item?.color || '').trim(),
      taille: String(item?.size || '').trim(),
      quantite,
      unite: String(item?.unitOfMeasure || '').trim(),
      prixUnitaire: prixParUnitePrix(item),
      total: prixLigne > 0 ? arrondi2(prixLigne * quantite) : 0,
      lieu: item?.storeId || undefined,
      contenance: contenanceDeLigne(item),
    });
  });

  for (const g of Array.from(groupes.values())) {
    g.lignes.sort((a, b) =>
      a.couleur.localeCompare(b.couleur, 'fr', { numeric: true, sensitivity: 'base' })
      || a.taille.localeCompare(b.taille, 'fr', { numeric: true, sensitivity: 'base' }));
    const parUnite = new Map<string, number>();
    for (const l of g.lignes) parUnite.set(l.unite, arrondi3((parUnite.get(l.unite) || 0) + l.quantite));
    g.totaux = Array.from(parUnite.entries()).map(([unite, quantite]) => ({ unite, quantite }));
    const prix = new Set(g.lignes.map(l => l.prixUnitaire));
    g.prixDifferents = prix.size > 1;
    g.prixUnique = prix.size === 1 && g.lignes[0].prixUnitaire > 0 ? g.lignes[0].prixUnitaire : null;
    g.avecTailles = g.lignes.some(l => !!l.taille);
  }
  return Array.from(groupes.values());
}

// ─────────────────────────────────────────────────────────────────────────────
// La saisie du gestionnaire : prix, remise, quantités corrigées
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Un prix unitaire tapé au clavier. Jusqu'à trois décimales : en mercerie, un bouton se vend
 * 0,035 MAD pièce, et l'arrondir au centime le doublerait. Les totaux, eux, s'arrondissent au
 * centime.
 */
export function prixUnitaireSaisi(brut: unknown): number {
  const n = Number(String(brut ?? '').replace(/\s/g, '').replace(',', '.'));
  return Number.isFinite(n) && n > 0 ? arrondi3(n) : 0;
}

/**
 * Une quantité corrigée : zéro retire la ligne ; vide ou illisible ne change rien (null).
 *
 * Avec l'unité de la ligne, la même règle qu'à la caisse : 2,5 m se vend, 2,5 pièces non — une
 * unité qui ne se compte pas en décimales est ramenée à l'entier (9,5 pièces → 9).
 */
export function quantiteSaisie(brut: unknown, unite?: string | null): number | null {
  const texte = String(brut ?? '').replace(/\s/g, '').replace(',', '.');
  if (texte === '') return null;
  const n = Number(texte);
  if (!Number.isFinite(n) || n < 0) return null;
  if (unite !== undefined && !uniteDecimale(unite)) return Math.trunc(n);
  return arrondi3(n);
}

/** Une remise en pourcentage, bornée entre 0 et 100. */
export function remiseSaisie(brut: unknown): number {
  const n = Number(String(brut ?? '').replace(/\s/g, '').replace(',', '.'));
  return Number.isFinite(n) ? Math.min(100, Math.max(0, n)) : 0;
}

export interface SaisieBon {
  /**
   * Le prix tapé pour un groupe produit + qualité : il vaut pour toutes ses lignes. Il est dans
   * l'unité du prix (au mètre, à la pièce) : une ligne comptée en rouleaux de 50 m reçoit 50 fois
   * ce prix par rouleau.
   */
  prixGroupe?: Record<string, string>;
  /** Le prix tapé pour une ligne précise (même unité) : il l'emporte sur celui du groupe. */
  prixLigne?: Record<number, string>;
  /** Les quantités corrigées, par rang de ligne. */
  qteLigne?: Record<number, string>;
  /** La remise en %, telle que tapée ; absente = celle du bon. */
  remise?: string | number;
}

export interface ChangementQuantite { index: number; ligneId?: string; avant: number; apres: number }

export interface ResultatSaisie {
  /** Les lignes gardées (quantité > 0), avec leurs prix et totaux. */
  items: any[];
  /** Toutes les lignes, dans l'ordre du bon (retirées comprises, à quantité 0) : l'écran les lit par rang. */
  toutes: any[];
  /** Les lignes retirées (quantité ramenée à 0). */
  retirees: any[];
  totalAmount: number;
  discount: number;
  totalAfterDiscount: number;
  restantSansPrix: number;
  changements: ChangementQuantite[];
}

/** Le bon tel qu'il serait si l'on enregistrait la saisie maintenant. */
export function appliquerSaisieBon(items: any[], saisie: SaisieBon = {}, remiseDuBon: unknown = 0): ResultatSaisie {
  const prixGroupe = saisie.prixGroupe || {};
  const prixLigne = saisie.prixLigne || {};
  const qteLigne = saisie.qteLigne || {};
  const changements: ChangementQuantite[] = [];

  const lignes = (items || []).map((item: any, i: number) => {
    const avant = arrondi3(item?.qty);
    const corrigee = i in qteLigne ? quantiteSaisie(qteLigne[i], item?.unitOfMeasure ?? null) : null;
    const qty = corrigee == null ? avant : corrigee;
    if (qty !== avant) changements.push({ index: i, ligneId: item?.ligneId, avant, apres: qty });

    let prix = Number(item?.unitPrice) > 0 ? Number(item.unitPrice) : 0;
    let prixBase: number | undefined = Number(item?.prixBase) > 0 ? Number(item.prixBase) : undefined;
    const cle = cleGroupe(item);
    const tape = i in prixLigne ? prixLigne[i] : (cle in prixGroupe ? prixGroupe[cle] : undefined);
    if (tape !== undefined) {
      // Le commercial écrit au mètre ou à la pièce ; la ligne se compte peut-être en rouleaux.
      const auMetre = prixUnitaireSaisi(tape);
      const facteur = facteurPrix(item);
      prix = arrondi6(auMetre * facteur);
      prixBase = facteur !== 1 && auMetre > 0 ? auMetre : undefined;
    }

    const ligne: any = { ...item, qty, unitPrice: prix, totalPrice: arrondi2(prix * qty) };
    if (prixBase !== undefined) ligne.prixBase = prixBase; else delete ligne.prixBase;
    return ligne;
  });

  const gardees = lignes.filter(l => l.qty > 0);
  const retirees = lignes.filter(l => !(l.qty > 0));
  const discount = saisie.remise !== undefined && String(saisie.remise).trim() !== ''
    ? remiseSaisie(saisie.remise)
    : remiseSaisie(remiseDuBon);
  const totalAmount = arrondi2(gardees.reduce((s, l) => s + l.totalPrice, 0));
  const totalAfterDiscount = arrondi2(totalAmount * (1 - discount / 100));

  return {
    items: gardees, toutes: lignes, retirees, totalAmount, discount, totalAfterDiscount,
    restantSansPrix: gardees.filter(sansPrix).length,
    changements,
  };
}

/**
 * Le total écrit à la main sur le bon, comparé à celui que le logiciel calcule. Une différence
 * veut presque toujours dire un prix mal recopié : l'écran avertit, le gestionnaire confirme.
 */
export function comparerTotalPapier(totalCalcule: number, brut: unknown): { saisi: number | null; ecart: number; concorde: boolean } {
  const texte = String(brut ?? '').replace(/\s/g, '').replace(',', '.');
  const n = texte === '' ? NaN : Number(texte);
  if (!Number.isFinite(n) || n < 0) return { saisi: null, ecart: 0, concorde: false };
  const saisi = arrondi2(n);
  const ecart = arrondi2(saisi - arrondi2(totalCalcule));
  return { saisi, ecart, concorde: Math.abs(ecart) < 0.005 };
}

// ─────────────────────────────────────────────────────────────────────────────
// Crédit client
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Ce que le client doit : ses factures non soldées, plus ses bons déjà partis et pas encore
 * facturés (la marchandise est chez lui, même si la facture n'existe pas encore).
 */
export function encoursClient(clientId: string | undefined, factures: any[] = [], bons: any[] = []): number {
  if (!clientId) return 0;
  const duFactures = (factures || [])
    .filter(f => f?.clientId === clientId && f?.status !== 'PAID' && f?.status !== 'CANCELLED')
    .reduce((s, f) => s + (typeof f?.remainingBalance === 'number'
      ? f.remainingBalance
      : (Number(f?.totalAfterDiscount) || 0) - (Number(f?.paidAmount) || 0)), 0);
  const duBons = (bons || [])
    .filter(b => b?.clientId === clientId && estSortiAuBon(b) && bonEnCours(b))
    .reduce((s, b) => s + (Number(b?.totalAfterDiscount) || 0), 0);
  return arrondi2(duFactures + duBons);
}

/**
 * Au moment du bon : un client bloqué, ou déjà au plafond, ne part pas avec de la marchandise à
 * crédit. Le prix n'est pas encore connu — on ne peut juger que ce qu'il doit déjà.
 */
export function controleCreditAuBon(client: any, encours: number): { refuse: boolean; raison?: string } {
  if (!client) return { refuse: false };
  if (client.creditBlocked) {
    return { refuse: true, raison: `Le crédit de « ${client.name} » est bloqué. Voyez l'administrateur avant de lui remettre de la marchandise.` };
  }
  const plafond = Number(client.creditLimit) || 0;
  if (plafond > 0 && encours >= plafond) {
    return {
      refuse: true,
      raison: `« ${client.name} » doit déjà ${arrondi2(encours).toFixed(2)} MAD, pour un plafond de ${arrondi2(plafond).toFixed(2)} MAD. `
        + "Encaissez d'abord, ou voyez l'administrateur.",
    };
  }
  return { refuse: false };
}

/**
 * Commande à préparer, au moment où elle sort enfin (finalisation) : le prix est connu et la
 * marchandise est encore là. Comme au bon, un client bloqué ou au plafond ne part pas avec ; et
 * cette fois on peut aussi juger CE bon : s'il fait passer le plafond, on refuse.
 */
export function controleCreditAvantSortie(client: any, encours: number, total: number): { refuse: boolean; raison?: string } {
  const auBon = controleCreditAuBon(client, encours);
  if (auBon.refuse || !client) return auBon;
  const plafond = Number(client.creditLimit) || 0;
  const apres = arrondi2(encours + (Number(total) || 0));
  if (plafond > 0 && apres > plafond) {
    return {
      refuse: true,
      raison: `Avec cette commande, « ${client.name} » devrait ${apres.toFixed(2)} MAD, au-delà de son plafond de `
        + `${arrondi2(plafond).toFixed(2)} MAD (il doit déjà ${arrondi2(encours).toFixed(2)} MAD). `
        + "Encaissez d'abord une partie, ou voyez l'administrateur.",
    };
  }
  return { refuse: false };
}

/**
 * Au moment de finaliser : la marchandise est déjà partie, on ne bloque plus — on prévient
 * seulement que le plafond sera dépassé.
 */
export function controleCreditFinalisation(client: any, encours: number, total: number): { avertir: boolean; message?: string } {
  if (!client) return { avertir: false };
  if (client.creditBlocked) {
    return { avertir: true, message: `Le crédit de « ${client.name} » est bloqué. La marchandise est déjà partie : prévenez l'administrateur.` };
  }
  const plafond = Number(client.creditLimit) || 0;
  const apres = arrondi2(encours + (Number(total) || 0));
  if (plafond > 0 && apres > plafond) {
    return {
      avertir: true,
      message: `Avec ce bon, « ${client.name} » devra ${apres.toFixed(2)} MAD, au-delà de son plafond de ${arrondi2(plafond).toFixed(2)} MAD `
        + `(il doit déjà ${arrondi2(encours).toFixed(2)} MAD). La marchandise est déjà partie : la vente s'enregistre quand même.`,
    };
  }
  return { avertir: false };
}

// ─────────────────────────────────────────────────────────────────────────────
// Mouvements de stock d'une correction ou d'une annulation
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Les champs d'un mouvement qui ne décrivent PAS la marchandise ni l'endroit : ils changent
 * d'un mouvement à son inverse. Tout le reste — magasin, emplacement, article, qualité, couleur,
 * taille, unité, caractéristiques — est recopié tel quel.
 */
const CHAMPS_PROPRES_AU_MOUVEMENT = new Set([
  'id', 'createdAt', 'type', 'reason', 'date', 'notes', 'quantity', 'toStoreId',
  'factureId', 'factureRef', 'bonId', 'bonNumero', '_variant',
]);

const identiteDuMouvement = (m: any): Record<string, any> => {
  const copie: Record<string, any> = {};
  for (const [k, v] of Object.entries(m || {})) {
    if (!CHAMPS_PROPRES_AU_MOUVEMENT.has(k) && v !== undefined) copie[k] = v;
  }
  return copie;
};

/** Ce qui distingue deux tas de marchandise : le lieu, l'emplacement et la variante exacte. */
export const cleEmplacement = (m: any): string => [
  m?.storeId || '', m?.locationCode || '', m?.articleId || '',
  normaliser(m?.quality), normaliser(m?.color), normaliser(m?.size), normaliser(m?.unitOfMeasure),
].join('|');

export interface SoldeEmplacement { modele: any; quantite: number }

/**
 * Ce qu'un ensemble de mouvements a sorti, net, par emplacement : sorties moins retours, dans
 * l'ordre où les emplacements sont apparus. Les ajustements n'entrent pas dans le compte.
 */
export function soldeSortiParEmplacement(mouvements: any[]): SoldeEmplacement[] {
  const parCle = new Map<string, SoldeEmplacement>();
  for (const m of mouvements || []) {
    if (m?.type !== 'OUT' && m?.type !== 'IN') continue;
    const cle = cleEmplacement(m);
    let s = parCle.get(cle);
    if (!s) { s = { modele: m, quantite: 0 }; parCle.set(cle, s); }
    if (m.type === 'OUT' && s.modele?.type !== 'OUT') s.modele = m;
    s.quantite = arrondi3(s.quantite + (m.type === 'OUT' ? 1 : -1) * (Number(m.quantity) || 0));
  }
  return Array.from(parCle.values());
}

export interface ContexteMouvementBon {
  date: string;
  notes: string;
  bonId: string;
  bonNumero?: string;
}

/**
 * Annuler un bon déjà sorti : un mouvement d'entrée pour chaque tas que le bon a sorti, avec
 * EXACTEMENT les mêmes magasin, emplacement, article, variante et unité, pour la quantité nette
 * encore dehors. On ne reconstruit rien à partir des lignes du bon : ce sont ses mouvements
 * qu'on inverse, corrections comprises.
 */
export function mouvementsAnnulation(mouvementsDuBon: any[], contexte: ContexteMouvementBon): any[] {
  const soldes = soldeSortiParEmplacement(mouvementsDuBon);
  // Ce qui est encore dehors, par variante, TOUS emplacements confondus. Un retour écrit sans
  // emplacement (une correction qui n'avait pas retrouvé la sortie d'origine) forme un tas à
  // part, négatif : l'écarter et rendre chaque rack en entier ferait rentrer plus qu'il n'est
  // sorti. Les racks ne reçoivent donc, à eux tous, que ce net.
  const cleVariante = (m: any) => cleEmplacement({ ...m, locationCode: '' });
  const resteParVariante = new Map<string, number>();
  for (const s of soldes) {
    const cle = cleVariante(s.modele);
    resteParVariante.set(cle, arrondi3((resteParVariante.get(cle) || 0) + s.quantite));
  }
  const aRendre: SoldeEmplacement[] = [];
  for (const s of soldes) {
    if (s.quantite <= 0.0005) continue;
    const cle = cleVariante(s.modele);
    const reste = resteParVariante.get(cle) || 0;
    const quantite = arrondi3(Math.min(s.quantite, reste));
    if (quantite <= 0.0005) continue;
    resteParVariante.set(cle, arrondi3(reste - quantite));
    aRendre.push({ modele: s.modele, quantite });
  }
  return aRendre
    .map(s => ({
      ...identiteDuMouvement(s.modele),
      type: 'IN',
      reason: MOTIF_ANNULATION_BON,
      quantity: s.quantite,
      date: contexte.date,
      notes: contexte.notes,
      bonId: contexte.bonId,
      ...(contexte.bonNumero ? { bonNumero: contexte.bonNumero } : {}),
    }));
}

/** Le mouvement minimal d'une ligne de bon, quand aucun mouvement d'origine n'est retrouvé. */
export function mouvementDepuisLigne(ligne: any, storeId: string): Record<string, any> {
  const m: Record<string, any> = {
    articleId: ligne?.articleId,
    categoryId: ligne?.categoryId || null,
    productName: ligne?.nameFR || ligne?.productName,
    nameFR: ligne?.nameFR || null,
    color: ligne?.color || null,
    size: ligne?.size || null,
    quality: ligne?.quality || null,
    unitOfMeasure: ligne?.unitOfMeasure || 'unité',
    storeId: ligne?.storeId || storeId,
  };
  if (ligne?.ligneId) m.ligneBonId = ligne.ligneId;
  return m;
}

/**
 * Une quantité corrigée sur un bon déjà sorti.
 *
 * - Elle baisse (ou la ligne est retirée) : la différence rentre en stock, là d'où elle était
 *   sortie, en commençant par le dernier emplacement entamé.
 * - Elle monte : `aSortir` dit combien sortir en plus ; l'appelant écrit cette sortie avec la
 *   même règle d'emplacement qu'à la caisse.
 */
export function mouvementsCorrection(params: {
  ligne: any;
  mouvementsDeLaLigne: any[];
  avant: number;
  apres: number;
  storeId: string;
  contexte: ContexteMouvementBon;
}): { retours: any[]; aSortir: number } {
  const delta = arrondi3((Number(params.apres) || 0) - (Number(params.avant) || 0));
  if (delta > 0) return { retours: [], aSortir: delta };
  if (delta === 0) return { retours: [], aSortir: 0 };

  let aRendre = -delta;
  const retours: any[] = [];
  const soldes = soldeSortiParEmplacement(params.mouvementsDeLaLigne).filter(s => s.quantite > 0.0005).reverse();
  const contexte = params.contexte;
  const entete = {
    type: 'IN', reason: MOTIF_CORRECTION_BON, date: contexte.date, notes: contexte.notes, bonId: contexte.bonId,
    ...(contexte.bonNumero ? { bonNumero: contexte.bonNumero } : {}),
  };
  for (const s of soldes) {
    if (aRendre <= 0) break;
    const pris = arrondi3(Math.min(aRendre, s.quantite));
    retours.push({ ...identiteDuMouvement(s.modele), ...entete, quantity: pris });
    aRendre = arrondi3(aRendre - pris);
  }
  // Aucun mouvement d'origine retrouvé pour ce reste : il rentre sans emplacement, sur le lieu
  // de la ligne — mieux vaut un stock juste sans adresse qu'une marchandise perdue.
  if (aRendre > 0) retours.push({ ...mouvementDepuisLigne(params.ligne, params.storeId), ...entete, quantity: aRendre });
  return { retours, aSortir: 0 };
}

/** Les mouvements d'un bon, et d'une ligne de ce bon. */
export const mouvementsDuBon = (mouvements: any[], bonId: string): any[] =>
  (mouvements || []).filter(m => m?.bonId === bonId);

export const mouvementsDeLaLigne = (mouvements: any[], bonId: string, ligneId?: string): any[] =>
  ligneId ? mouvementsDuBon(mouvements, bonId).filter(m => m?.ligneBonId === ligneId) : [];

/**
 * D'où prendre la marchandise de chaque ligne, d'après les mouvements du bon : les emplacements
 * qu'elle a réellement vidés (« A-03-02 »). Une ligne sortie sans emplacement n'en a pas.
 */
export function emplacementsDesLignes(items: any[], mouvements: any[], bonId: string): Record<number, string[]> {
  const resultat: Record<number, string[]> = {};
  (items || []).forEach((item: any, i: number) => {
    const codes = soldeSortiParEmplacement(mouvementsDeLaLigne(mouvements, bonId, item?.ligneId))
      .filter(s => s.quantite > 0.0005 && s.modele?.locationCode)
      .map(s => String(s.modele.locationCode));
    if (codes.length > 0) resultat[i] = Array.from(new Set(codes));
  });
  return resultat;
}

/** Un identifiant de ligne, stable : il relie la ligne du bon à ses mouvements de stock. */
export const nouvelIdentifiantLigne = (rang: number, graine: number = Date.now()): string =>
  `L${graine.toString(36)}-${rang}`;
