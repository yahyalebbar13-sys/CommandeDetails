/**
 * Le bon de livraison d'une commande de la boutique en ligne (lebtex.ma), et l'impression groupée.
 *
 * Pourquoi : /admin-shop n'imprimait rien. Le colis partait avec une adresse recopiée à la main,
 * le livreur ne savait pas combien encaisser, et personne ne signait la remise. Ce papier
 * accompagne le colis : qui appeler, où livrer, quoi mettre dans le carton, combien encaisser,
 * et trois cases de signature — préparation, livreur, client.
 *
 * Ce qu'il ne dit jamais : un prix de revient, ni la note interne de l'équipe. Il part avec le
 * colis, donc chez le client.
 *
 * L'arabe : les polices standard de jsPDF n'écrivent que l'alphabet latin, et le dépôt ne
 * contient aucune police arabe. Un nom ou une adresse en arabe s'imprimait en caractères
 * illisibles, ou disparaissait. On le remplace par « (en arabe — voir la commande) » : le papier
 * dit qu'il manque quelque chose, et les téléphones, eux, restent lisibles.
 *
 * Mise en page : la charte commune (src/lib/pdf-charte-lebtex.ts). jsPDF, autotable et la charte
 * ne se chargent qu'au clic, comme pour l'espace client : /admin-shop s'ouvre sans eux.
 *
 * Depuis le 29/09/2026, le bon dit aussi comment la commande part (colis Sendit, retrait au
 * magasin, transport d'un rouleau à confirmer par téléphone), où elle se prépare (Derb Omar ou
 * CHRIFA) et comment elle se paie : un virement pas encore vu sur le compte ne laisse rien sortir,
 * un paiement déjà reçu ne se réencaisse pas.
 */

import type jsPDF from 'jspdf';
import type { OrderStatus, ShippingAddress, ShopOrder } from '@/lib/shop-types';
import {
  alerteEspeces, commandeMixte, CONSIGNE_COMMANDE_MIXTE, dateDe, dateHeure, detailsVariante, fraisColisAnnonces,
  lignesCollentAuSousTotal, lignesSansPrix, MENTION_LIGNE_ROULEAU, moyenPaiementDe, NOMS_LIEUX, prixUnitaireLigne,
  receptionDe, telephonesCommande, telInternational, telLisible, totalLigne, transportPrevu, type LigneCommande,
} from '@/lib/commandes-boutique';
import { formatPrice } from '@/lib/shop-utils';
import { texteImprimable } from '@/lib/pdf-espace-client';
import { REGLAGES_RECEPTION_DEFAUT, type ReglagesReception } from '@/lib/reglages-reception';

/** Ce que l'écran sait en plus de la commande : les magasins réglés, et les paiements déjà vus sur le compte. */
export interface OptionsBon {
  reglages?: ReglagesReception;
  /** Identifiants des commandes dont l'administrateur a noté « paiement reçu ». */
  paiementsRecus?: ReadonlySet<string>;
}

const paiementRecuPour = (commande: ShopOrder, options: OptionsBon) =>
  !!commande.id && !!options.paiementsRecus?.has(commande.id);

type Couleur = [number, number, number];
type Style = 'normal' | 'bold' | 'italic' | 'bolditalic';

// ─── Ce que les polices du PDF savent écrire ──────────────────────────────────

/** Ce qui remplace un passage écrit en arabe. */
export const MARQUE_ARABE = '(en arabe — voir la commande)';
/** Ce qui remplace un passage dans un autre alphabet que le latin (chinois, tifinagh…). */
export const MARQUE_AUTRE_ALPHABET = '(autre alphabet — voir la commande)';

const LETTRES_ARABES = '\\u0600-\\u06FF\\u0750-\\u077F\\u08A0-\\u08FF\\uFB50-\\uFDFF\\uFE70-\\uFEFC';
/**
 * Un passage en arabe : des mots arabes et ce qui les sépare (espaces, ponctuation, chiffres).
 * Une seule mention pour « زنقة 5 رقم 12 », pas trois collées à des chiffres orphelins.
 */
const PASSAGE_ARABE = new RegExp(
  `[${LETTRES_ARABES}]+(?:[\\s\\d\\u200C-\\u200F.,;:'’/-]+[${LETTRES_ARABES}]+)*`, 'g');
const DIACRITIQUES = /[̀-ͯ]/g;
const LETTRE = /\p{L}/u;
/** Repère provisoire d'une lettre d'un autre alphabet ; retiré par texteImprimable s'il reste. */
const ETRANGERE = '\u0001';
const PASSAGE_ETRANGER = /\u0001+(?:[ \t]+\u0001+)*/g;

/** Chiffres arabes-indiens (U+0660…, U+06F0…) en chiffres courants : un numéro tapé sur un clavier arabe reste un numéro. */
export function chiffresLatins(v: unknown): string {
  return String(v ?? '').replace(/[٠-٩۰-۹]/g, ch => {
    const code = ch.charCodeAt(0);
    return String(code - (code >= 0x06f0 ? 0x06f0 : 0x0660));
  });
}

/**
 * Un texte de client prêt à imprimer : l'arabe et les autres alphabets remplacés par une mention,
 * les lettres latines accentuées que la police ignore ramenées à leur base (« Doğan » → « Dogan »),
 * les émojis retirés. Jamais un passage qui disparaît sans le dire.
 */
export function textePourPdf(v: unknown): string {
  const sansArabe = chiffresLatins(v).normalize('NFC').replace(PASSAGE_ARABE, MARQUE_ARABE);
  const marque = Array.from(sansArabe).map(ch => {
    if (!LETTRE.test(ch) || texteImprimable(ch) === ch) return ch;
    const base = ch.normalize('NFD').replace(DIACRITIQUES, '');
    return base && texteImprimable(base) === base ? base : ETRANGERE;
  }).join('');
  return texteImprimable(marque.replace(PASSAGE_ETRANGER, MARQUE_AUTRE_ALPHABET))
    .replace(/[ \t]+/g, ' ')
    .replace(/ *\n */g, '\n')
    .trim();
}

/**
 * Les téléphones de la commande, principal d'abord, tels qu'on les compose au Maroc
 * (« 06 12 34 56 78 »). Un numéro qui n'a pas la forme marocaine est imprimé tel que le client
 * l'a tapé : le reformater le rendrait faux.
 */
export function telephonesImprimables(commande: ShopOrder): string[] {
  const adresse = commande.shippingAddress;
  const latins = {
    customerPhone: chiffresLatins(commande.customerPhone),
    shippingAddress: {
      ...(adresse || {}),
      phone: chiffresLatins(adresse?.phone),
      phone2: chiffresLatins(adresse?.phone2),
    } as ShippingAddress,
  };
  return telephonesCommande(latins)
    .map(tel => (/^212\d{9}$/.test(telInternational(tel)) ? telLisible(tel) : textePourPdf(tel)))
    .filter(Boolean);
}

/** « 27/09/2026 à 14:05 », heure du Maroc. */
function dateImprimee(v: unknown): string | null {
  // Jamais « aujourd'hui à… » : le papier se relit le lendemain. Un « maintenant » à zéro
  // (1970) oblige dateHeure à écrire la date en entier.
  return dateDe(v) ? dateHeure(v, 0) : null;
}

const montant = (n: unknown) => texteImprimable(formatPrice(Number(n) || 0));
const quantite = (n: unknown) =>
  texteImprimable((Number(n) || 0).toLocaleString('fr-FR', { maximumFractionDigits: 2 }));

/** Ce qui s'imprime à la place du prix d'un article « sur demande », arrivé à 0. */
const A_FIXER = 'à fixer';

// ─── Outils chargés au clic ───────────────────────────────────────────────────

type Charte = typeof import('@/lib/pdf-charte-lebtex');
type AutoTable = typeof import('jspdf-autotable').default;
interface Outils { doc: jsPDF; c: Charte; autoTable: AutoTable }

async function outils(): Promise<Outils> {
  const [{ default: JsPDF }, { default: autoTable }, c] = await Promise.all([
    import('jspdf'),
    import('jspdf-autotable'),
    import('@/lib/pdf-charte-lebtex'),
  ]);
  // compress : un lot de trente bons reste un fichier léger.
  const doc = new JsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4', compress: true });
  return { doc, c, autoTable };
}

const largeurUtile = ({ doc, c }: Outils) => doc.internal.pageSize.getWidth() - 2 * c.MARGE;

/** 1 point typographique, en millimètres. */
const PT = 0.3528;
const interligne = (taille: number) => taille * PT * 1.3;

/**
 * Un texte découpé à la largeur, dans la police qu'on s'apprête à utiliser. Au-delà de `max`
 * lignes, la dernière se termine par `suite` (« … », ou où lire le reste) : un texte coupé le dit.
 */
function decouper(doc: jsPDF, texte: string, largeur: number, taille: number, style: Style, max = 99, suite = '…'): string[] {
  doc.setFont('helvetica', style);
  doc.setFontSize(taille);
  const lignes = (doc.splitTextToSize(texte, largeur) as string[]).map(l => l.trimEnd());
  while (lignes.length > 1 && !lignes[lignes.length - 1]) lignes.pop();
  if (lignes.length <= max) return lignes;

  const mots = lignes[max - 1].split(' ');
  while (mots.length > 0 && doc.getTextWidth(`${mots.join(' ')} ${suite}`) > largeur) mots.pop();
  const derniere = mots.length > 0 ? `${mots.join(' ')} ${suite}` : suite;
  return [...lignes.slice(0, max - 1), derniere];
}

function ecrire(
  doc: jsPDF, texte: string, x: number, y: number,
  taille: number, style: Style, couleur: Couleur, align: 'left' | 'right' | 'center' = 'left',
): void {
  doc.setFont('helvetica', style);
  doc.setFontSize(taille);
  doc.setTextColor(...couleur);
  doc.text(texte, x, y, { align });
}

/** Une petite étiquette en capitales au-dessus d'une valeur. */
function etiquette(o: Outils, texte: string, x: number, y: number, align: 'left' | 'right' | 'center' = 'left'): void {
  ecrire(o.doc, texte.toUpperCase(), x, y, 6.5, 'bold', o.c.ESTOMPE, align);
}

/** Une ligne d'encart déjà découpée : le texte, sa police, et la hauteur qu'elle occupe. */
interface LigneEncart {
  texte: string;
  taille: number;
  style: Style;
  couleur: Couleur;
  hauteur: number;
  /** Petit libellé à gauche de la valeur (« Tél. »), la valeur décalée d'autant. */
  libelle?: string;
  decalage?: number;
}

function lignesEncart(
  doc: jsPDF, texte: string, largeur: number, taille: number, style: Style, couleur: Couleur,
  max = 99, suite = '…',
): LigneEncart[] {
  return decouper(doc, texte, largeur, taille, style, max, suite)
    .map(t => ({ texte: t, taille, style, couleur, hauteur: interligne(taille) }));
}

const espace = (hauteur: number): LigneEncart =>
  ({ texte: '', taille: 1, style: 'normal', couleur: [0, 0, 0], hauteur });

const hauteurDe = (lignes: LigneEncart[]) => lignes.reduce((s, l) => s + l.hauteur, 0);

function dessinerLignes(o: Outils, lignes: LigneEncart[], x: number, haut: number): void {
  let curseur = haut;
  for (const l of lignes) {
    if (l.texte) {
      const base = curseur + l.hauteur * 0.78;
      if (l.libelle) ecrire(o.doc, l.libelle, x, base, 7, 'normal', o.c.ESTOMPE);
      ecrire(o.doc, l.texte, x + (l.decalage || 0), base, l.taille, l.style, l.couleur);
    }
    curseur += l.hauteur;
  }
}

/** Un encadré d'une ou plusieurs lignes, filet de couleur à gauche. Rend le Y suivant. */
function encadre(
  o: Outils, y: number, lignes: string[], ton: 'or' | 'ambre',
  options: { titre?: string; x?: number; largeur?: number; taille?: number; style?: Style } = {},
): number {
  const { doc, c } = o;
  const x = options.x ?? c.MARGE;
  const largeur = options.largeur ?? largeurUtile(o);
  const taille = options.taille ?? 8.5;
  const pas = interligne(taille);
  const hauteur = (options.titre ? 5 : 0) + 4 + lignes.length * pas;

  doc.setFillColor(...(ton === 'ambre' ? [255, 251, 235] as Couleur : c.GOLD_PALE));
  doc.setDrawColor(...(ton === 'ambre' ? [253, 230, 138] as Couleur : c.BORDURE));
  doc.setLineWidth(0.25);
  doc.roundedRect(x, y, largeur, hauteur, 1.5, 1.5, 'FD');
  doc.setFillColor(...(ton === 'ambre' ? c.AMBRE : c.GOLD));
  doc.roundedRect(x, y, 2.2, hauteur, 1, 1, 'F');

  let ligne = y + 2 + pas * 0.78;
  if (options.titre) {
    ecrire(doc, options.titre.toUpperCase(), x + 6, y + 5, 7, 'bold', c.NAVY);
    ligne += 5;
  }
  const couleur: Couleur = ton === 'ambre' ? [146, 64, 14] : c.TEXTE;
  for (const texte of lignes) {
    ecrire(doc, texte, x + 6, ligne, taille, options.style ?? 'normal', couleur);
    ligne += pas;
  }
  return y + hauteur;
}

// ─── Les blocs du bon ─────────────────────────────────────────────────────────

/** Le numéro de commande tel qu'il s'imprime, et tel qu'on l'écrit sur le colis. */
function numeroDe(commande: ShopOrder): string {
  return textePourPdf(commande.orderNumber) || 'sans numéro';
}

/**
 * La ligne qu'on lit sans chercher : le numéro à écrire sur le colis, la ville par laquelle le
 * livreur trie sa tournée, et la somme qu'il doit rapporter.
 */
function bandeauCommande(o: Outils, y: number, commande: ShopOrder, paiementRecu: boolean): number {
  const { doc, c } = o;
  const largeur = largeurUtile(o);
  const hauteur = 15;
  doc.setFillColor(...c.FOND);
  doc.setDrawColor(...c.BORDURE);
  doc.setLineWidth(0.3);
  doc.roundedRect(c.MARGE, y, largeur, hauteur, 1.5, 1.5, 'FD');
  doc.setFillColor(...c.GOLD);
  doc.roundedRect(c.MARGE, y, 2.2, hauteur, 1, 1, 'F');

  const gauche = c.MARGE + 7;
  const droite = c.MARGE + largeur - 5;
  const milieu = c.MARGE + largeur / 2;

  etiquette(o, 'Commande n°', gauche, y + 5.2);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(13);
  ecrire(doc, c.ajuster(doc, numeroDe(commande), largeur / 2 - 36), gauche, y + 11.5, 13, 'bold', c.NAVY);

  const ville = textePourPdf(commande.shippingAddress?.city).toUpperCase();
  if (ville) {
    etiquette(o, 'Ville', milieu + 4, y + 5.2, 'center');
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(11);
    ecrire(doc, c.ajuster(doc, ville, 52), milieu + 4, y + 11.5, 11, 'bold', c.NAVY, 'center');
  }

  // Des articles sans prix ne sont pas dans le total : le livreur ne doit pas croire que tout y est.
  // Déjà payée (virement vu sur le compte) : on n'imprime pas une somme qu'il encaisserait une 2e fois.
  const sansPrix = lignesSansPrix(commande).length > 0;
  if (paiementRecu) {
    etiquette(o, 'Déjà payée', droite, y + 5.2, 'right');
    ecrire(doc, 'Rien à encaisser', droite, y + 11.5, 11, 'bold', c.NAVY, 'right');
  } else {
    etiquette(o, sansPrix ? 'À encaisser (hors prix à fixer)' : 'À encaisser', droite, y + 5.2, 'right');
    ecrire(doc, montant(commande.total), droite, y + 11.5, 13, 'bold', c.NAVY, 'right');
  }
  return y + hauteur + 5;
}

/** Ce qu'il faut savoir avant de préparer : un bon imprimé par erreur ne doit pas faire partir un colis. */
const ALERTES: Partial<Record<OrderStatus, string>> = {
  pending: 'Commande pas encore confirmée : appeler le client avant de préparer le colis.',
  cancelled: 'Commande annulée : ne pas expédier.',
  returned: 'Commande revenue au dépôt : ne pas la renvoyer sans l’accord du client.',
};

/** Ce qu'il faut savoir avant de remettre la marchandise, selon le mode et le paiement. */
function alertesReception(commande: ShopOrder, paiementRecu: boolean): string[] {
  const r = receptionDe(commande);
  const moyen = moyenPaiementDe(commande);
  const alertes: string[] = [];
  if (r.volumineux && r.mode === 'domicile') {
    alertes.push('Rouleau entier : il ne part pas par Sendit. Appeler le client pour le retrait à CHRIFA ou le transport.');
  }
  // Rouleau(x) et petits articles : tout se regroupe la veille à CHRIFA (plan §2.5).
  if (commandeMixte(commande)) alertes.push(CONSIGNE_COMMANDE_MIXTE);
  if (moyen !== 'cod' && !paiementRecu) {
    alertes.push(`Paiement par ${moyen === 'virement' ? 'virement' : 'carte'} pas encore vu sur le compte : ne rien remettre sans l'accord de l'administrateur (jamais sur une capture d'écran).`);
  }
  const especes = paiementRecu ? null : alerteEspeces(commande);
  if (especes) alertes.push(especes);
  return alertes;
}

function alerteStatut(o: Outils, y: number, commande: ShopOrder, paiementRecu: boolean): number {
  const textes = [ALERTES[commande.status], ...alertesReception(commande, paiementRecu)].filter((t): t is string => !!t);
  if (textes.length === 0) return y;
  const lignes = textes.flatMap(t => decouper(o.doc, t, largeurUtile(o) - 12, 9, 'bold'));
  return encadre(o, y, lignes, 'ambre', { taille: 9, style: 'bold' }) + 5;
}

/**
 * Comment la commande part et comment elle se paie, une ligne chacun : c'est ce qui dit au
 * magasin quoi faire du carton (Sendit, étagère des retraits, camionnette, transporteur).
 * Sans titre, et le lieu de préparation dans la même phrase : ce bandeau ne doit pas faire
 * passer les cases de signature d'une commande ordinaire sur une deuxième page.
 */
function blocReception(o: Outils, y: number, commande: ShopOrder, reglages: ReglagesReception, paiementRecu: boolean): number {
  const r = receptionDe(commande);
  const moyen = moyenPaiementDe(commande);
  const ville = textePourPdf(commande.shippingAddress?.city);
  const lieu = reglages.lieux[r.lieu];
  const reception = r.mode === 'retrait'
    ? `retrait par le client à ${textePourPdf(lieu.nom) || NOMS_LIEUX[r.lieu]} — ${textePourPdf(lieu.adresse)} (préparée sur place)`
    : r.mode === 'transport'
      ? `transport à confirmer par téléphone — ${transportPrevu(commande) === 'camionnette'
        ? 'camionnette LEBTEX'
        : `transporteur jusqu’à son dépôt${ville ? ` de ${ville}` : ''}, où le client récupère`} (préparée à ${NOMS_LIEUX[r.lieu]})`
      : 'colis Sendit, préparé et ramassé à Derb Omar (ni ouvert ni essayé avant paiement)';
  const paiement = paiementRecu
    ? `déjà payée (${moyen === 'cod' ? 'paiement reçu' : moyen === 'virement' ? 'virement reçu' : 'carte'}) : rien à encaisser`
    : moyen === 'virement'
      ? 'virement bancaire (motif : n° de commande) — à vérifier sur le compte'
      : moyen === 'carte'
        ? 'carte bancaire — à vérifier'
        : r.mode === 'retrait' ? 'espèces au retrait' : r.mode === 'transport' ? 'à encaisser comme convenu au téléphone' : 'espèces à la livraison';
  const largeur = largeurUtile(o) - 12;
  const lignes = [
    ...(r.volumineux ? decouper(o.doc, 'VOLUMINEUX (rouleau entier) : jamais par colis Sendit', largeur, 8.5, 'bold') : []),
    ...decouper(o.doc, `Réception : ${reception}.`, largeur, 8.5, 'normal'),
    ...decouper(o.doc, `Paiement : ${paiement}.`, largeur, 8.5, 'normal'),
  ];
  const hauteur = 4 + lignes.length * interligne(8.5);
  y = o.c.reserver(o.doc, y, hauteur + 4);
  return encadre(o, y, lignes, 'or') + 4;
}

/** Qui appeler : le nom, les téléphones en gros, l'e-mail. */
function contenuClient(o: Outils, commande: ShopOrder, largeur: number): LigneEncart[] {
  const { doc, c } = o;
  const nom = textePourPdf(commande.customerName || commande.shippingAddress?.fullName) || '—';
  const lignes = lignesEncart(doc, nom, largeur, 10.5, 'bold', c.NAVY, 2);
  lignes.push(espace(1.5));

  const telephones = telephonesImprimables(commande);
  if (telephones.length === 0) {
    lignes.push(...lignesEncart(doc, 'Aucun téléphone sur la commande', largeur, 8.5, 'bold', [146, 64, 14]));
  }
  const decalage = 13;
  telephones.forEach((tel, i) => {
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(11.5);
    lignes.push({
      texte: c.ajuster(doc, tel, largeur - decalage), taille: 11.5, style: 'bold', couleur: c.TEXTE,
      hauteur: interligne(11.5), libelle: i === 0 ? 'Tél.' : `Tél. ${i + 1}`, decalage,
    });
  });

  const email = textePourPdf(commande.customerEmail);
  if (email) {
    lignes.push(espace(1));
    lignes.push(...lignesEncart(doc, email, largeur, 7.5, 'normal', c.ESTOMPE, 2));
  }
  return lignes;
}

/** Où livrer : le destinataire, l'adresse en entier, la ville en capitales. */
function contenuLivraison(o: Outils, commande: ShopOrder, largeur: number): LigneEncart[] {
  const { doc, c } = o;
  const adresse = commande.shippingAddress;
  const nom = textePourPdf(adresse?.fullName || commande.customerName) || '—';
  const lignes = lignesEncart(doc, nom, largeur, 10.5, 'bold', c.NAVY, 2);
  lignes.push(espace(1));

  // L'adresse ne s'écourte pas : c'est avec elle que le livreur trouve la porte.
  const rue = textePourPdf(adresse?.address);
  lignes.push(...(rue
    ? lignesEncart(doc, rue, largeur, 9, 'normal', c.TEXTE, 8, '… (adresse complète dans la commande)')
    : lignesEncart(doc, 'Adresse non renseignée', largeur, 9, 'bold', [146, 64, 14])));

  const ville = textePourPdf(adresse?.city).toUpperCase();
  if (ville) {
    lignes.push(espace(1));
    lignes.push(...lignesEncart(doc, ville, largeur, 11, 'bold', c.NAVY, 2));
  }
  const precisions = [
    textePourPdf(adresse?.region) && `Région : ${textePourPdf(adresse?.region)}`,
    textePourPdf(adresse?.postalCode) && `Code postal : ${textePourPdf(adresse?.postalCode)}`,
  ].filter(Boolean).join('  ·  ');
  if (precisions) lignes.push(...lignesEncart(doc, precisions, largeur, 7.5, 'normal', c.ESTOMPE, 3));
  return lignes;
}

/** Les deux encarts côte à côte, à la hauteur du plus rempli. */
function encartsClient(o: Outils, y: number, commande: ShopOrder): number {
  const mode = receptionDe(commande).mode;
  const { doc, c } = o;
  const ecart = 6;
  const largeur = (largeurUtile(o) - ecart) / 2;
  const client = contenuClient(o, commande, largeur - 8);
  const livraison = contenuLivraison(o, commande, largeur - 8);
  const hauteur = 8 + Math.max(hauteurDe(client), hauteurDe(livraison)) + 3;

  y = c.reserver(doc, y, hauteur + 6);
  const xLivraison = c.MARGE + largeur + ecart;
  c.encart(doc, { x: c.MARGE, y, largeur, hauteur, etiquette: 'Client', ton: 'or' });
  // Un retrait ne se livre pas : l'adresse du client n'est qu'un renseignement.
  const etiquetteAdresse = mode === 'retrait' ? 'Adresse du client' : mode === 'transport' ? 'Livrer à (transport)' : 'Livrer à';
  c.encart(doc, { x: xLivraison, y, largeur, hauteur, etiquette: etiquetteAdresse, ton: 'nuit' });
  dessinerLignes(o, client, c.MARGE + 4, y + 8);
  dessinerLignes(o, livraison, xLivraison + 4, y + 8);
  return y + hauteur + 6;
}

/**
 * Les articles, une ligne par ligne de commande : ce que la préparation met dans le carton et ce
 * que le client vérifie à la livraison. Le modèle, la couleur et la taille ont chacun leur
 * colonne — jamais entassés dans la case du produit.
 */
function tableauArticles(o: Outils, y: number, commande: ShopOrder): number {
  const { doc, c, autoTable } = o;
  const items = (commande.items || []) as LigneCommande[];
  const corps = items.map(item => {
    const variante = new Map(detailsVariante(item.variant).map(d => [d.libelle, textePourPdf(d.valeur)]));
    const unitaire = prixUnitaireLigne(item);
    // Un rouleau entier se prépare à CHRIFA : dit sur sa ligne, pas seulement en haut du bon.
    const nom = textePourPdf(item.productName) || '—';
    return [
      item.volumineux ? `${nom}\n${textePourPdf(MENTION_LIGNE_ROULEAU)}` : nom,
      variante.get('Modèle') || '—',
      variante.get('Couleur') || '—',
      variante.get('Taille') || '—',
      quantite(item.quantity),
      unitaire > 0 ? montant(unitaire) : A_FIXER,
      unitaire > 0 ? montant(totalLigne(item)) : A_FIXER,
    ];
  });

  y = c.reserver(doc, y, 28);
  y = c.titreSection(doc, y + 2, 'Articles à livrer');
  autoTable(doc, {
    startY: y,
    margin: { left: c.MARGE, right: c.MARGE, top: c.MARGE + 2, bottom: c.HAUTEUR_PIED + 2 },
    head: [['Article', 'Modèle', 'Couleur', 'Taille', 'Qté', 'P.U.', 'Total']],
    body: corps.length > 0
      ? corps
      : [[{ content: 'Aucun article sur cette commande', colSpan: 7, styles: { halign: 'center', fontStyle: 'italic' } }]],
    ...c.STYLES_TABLEAU,
    rowPageBreak: 'avoid',
    columnStyles: {
      // La couleur est ce qu'on se trompe le plus à préparer : « Rouge bordeaux » tient sur une ligne.
      0: { cellWidth: 'auto', fontStyle: 'bold', textColor: c.NAVY },
      1: { cellWidth: 22 },
      2: { cellWidth: 30 },
      3: { cellWidth: 16 },
      4: { cellWidth: 12 },
      5: { cellWidth: 23 },
      6: { cellWidth: 26, fontStyle: 'bold' },
    },
    didParseCell: data => {
      // Quantité et montants s'alignent à droite, en-tête compris : les chiffres se comparent en colonne.
      if (data.column.index === 4) data.cell.styles.halign = 'center';
      if (data.column.index >= 5) data.cell.styles.halign = 'right';
      if (data.section === 'body' && data.cell.raw === A_FIXER) {
        data.cell.styles.textColor = [146, 64, 14];
        data.cell.styles.fontStyle = 'bolditalic';
      }
    },
  });
  return ((doc as any).lastAutoTable?.finalY ?? y) + 6;
}

/**
 * Les totaux à droite, ce qui les explique à gauche. « Total à encaisser » en gros : c'est la
 * somme que le livreur rapporte.
 */
/** La ligne des frais : jamais « 0 » ni « gratuite » pour un transport qui se chiffre au téléphone. */
function ligneFrais(commande: ShopOrder): [string, string] {
  const r = receptionDe(commande);
  const frais = Number(commande.deliveryFee) || 0;
  if (r.mode === 'retrait') return ['Retrait', frais > 0 ? montant(frais) : 'Gratuit'];
  if (r.mode === 'transport' || r.volumineux) return ['Transport', frais > 0 ? montant(frais) : 'À confirmer'];
  if (frais > 0) return ['Livraison', montant(frais)];
  // Seuil sur la somme des lignes ; ancienne commande : ancienne livraison offerte (100 / 500 DH).
  return ['Livraison', fraisColisAnnonces(commande) === 'offerte' ? 'Offerte' : 'À vérifier'];
}

/** Sous la somme à encaisser : comment elle se paie. */
function mentionPaiement(commande: ShopOrder, paiementRecu: boolean): string {
  if (paiementRecu) return 'Déjà payée : ne rien encaisser';
  const r = receptionDe(commande);
  const moyen = moyenPaiementDe(commande);
  if (moyen === 'virement') return 'Par virement, vu sur le compte';
  if (moyen === 'carte') return 'Par carte bancaire';
  if (r.mode === 'retrait') return 'Paiement au retrait';
  if (r.mode === 'transport') return 'Transport en plus, à confirmer';
  return 'Paiement à la livraison';
}

function blocTotaux(o: Outils, y: number, commande: ShopOrder, paiementRecu: boolean): number {
  const { doc, c } = o;
  const largeurBoite = 84;
  const xBoite = c.MARGE + largeurUtile(o) - largeurBoite;
  const largeurMentions = largeurUtile(o) - largeurBoite - 6;

  const lignes: [string, string][] = [
    ['Sous-total', montant(commande.subtotal)],
    ligneFrais(commande),
  ];
  if (Number(commande.discount) > 0) {
    const code = textePourPdf(commande.couponCode);
    lignes.push([code ? `Réduction (${code})` : 'Réduction', `-${montant(commande.discount)}`]);
  }

  const mentions: { lignes: string[]; ton: 'or' | 'ambre' }[] = [];
  const sansPrix = lignesSansPrix(commande).length;
  if (sansPrix > 0) {
    const detail = sansPrix > 1
      ? `${sansPrix} articles sans prix, non comptés dans le total.`
      : '1 article sans prix, non compté dans le total.';
    mentions.push({
      ton: 'ambre',
      lignes: decouper(doc, `Prix à fixer avec le client avant l'envoi : ${detail}`, largeurMentions - 9, 8, 'bold'),
    });
  }
  if (!lignesCollentAuSousTotal(commande)) {
    // Ancienne commande : les lignes n'ont gardé que le prix de base, le sous-total a appliqué le
    // prix de gros. C'est le sous-total que le client a accepté.
    mentions.push({
      ton: 'or',
      lignes: decouper(doc, 'Prix de gros appliqué : le sous-total fait foi (les prix unitaires ci-dessus sont les prix de base).',
        largeurMentions - 9, 7.5, 'italic'),
    });
  }

  const pas = 5.5;
  const hauteurBande = 14;
  const hauteurBoite = 3 + lignes.length * pas + 1 + hauteurBande + 7;
  const hauteurMentions = mentions.reduce((s, m) => s + 4 + m.lignes.length * interligne(8) + 3, 0);
  y = c.reserver(doc, y, Math.max(hauteurBoite, hauteurMentions) + 4);

  let yMention = y;
  for (const m of mentions) {
    yMention = encadre(o, yMention, m.lignes, m.ton, {
      largeur: largeurMentions, taille: m.ton === 'ambre' ? 8 : 7.5, style: m.ton === 'ambre' ? 'bold' : 'italic',
    }) + 3;
  }

  doc.setFillColor(...c.BLANC);
  doc.setDrawColor(...c.BORDURE);
  doc.setLineWidth(0.3);
  doc.roundedRect(xBoite, y, largeurBoite, hauteurBoite, 1.5, 1.5, 'FD');
  lignes.forEach(([libelle, valeur], i) => {
    const base = y + 3 + (i + 1) * pas - 1.6;
    ecrire(doc, libelle, xBoite + 4, base, 8.5, 'normal', c.ESTOMPE);
    ecrire(doc, valeur, xBoite + largeurBoite - 4, base, 8.5, 'bold', c.TEXTE, 'right');
  });

  const yBande = y + 3 + lignes.length * pas + 1;
  doc.setFillColor(...c.GOLD_PALE);
  doc.rect(xBoite + 0.3, yBande, largeurBoite - 0.6, hauteurBande, 'F');
  doc.setDrawColor(...c.GOLD);
  doc.setLineWidth(0.6);
  doc.line(xBoite, yBande, xBoite + largeurBoite, yBande);
  doc.line(xBoite, yBande + hauteurBande, xBoite + largeurBoite, yBande + hauteurBande);
  ecrire(doc, paiementRecu ? 'TOTAL DÉJÀ PAYÉ' : 'TOTAL À ENCAISSER', xBoite + 4, yBande + 8.6, 8.5, 'bold', c.NAVY);
  ecrire(doc, montant(commande.total), xBoite + largeurBoite - 4, yBande + 9.6, 16, 'bold', c.NAVY, 'right');
  ecrire(doc, mentionPaiement(commande, paiementRecu), xBoite + 4, yBande + hauteurBande + 4.8, 7.5, 'italic', c.ESTOMPE);

  return Math.max(y + hauteurBoite, yMention - 3) + 6;
}

/** Ce que le client a écrit en commandant (un horaire, un repère, un étage), en entier. */
function noteClient(o: Outils, y: number, commande: ShopOrder): number {
  const note = textePourPdf(commande.notes);
  if (!note) return y;
  const lignes = decouper(o.doc, note, largeurUtile(o) - 12, 8.5, 'italic', 14, '… (note complète dans la commande)');
  const hauteur = 5 + 4 + lignes.length * interligne(8.5);
  y = o.c.reserver(o.doc, y, hauteur + 6);
  return encadre(o, y, lignes, 'or', { titre: 'Note du client', style: 'italic' }) + 6;
}

/**
 * Trois cases à remplir à la main : qui a préparé, quel livreur a pris le colis, et le client qui
 * reconnaît l'avoir reçu en bon état. C'est ce papier signé qui tranche un « je n'ai rien reçu ».
 */
function casesSignature(o: Outils, y: number, commande: ShopOrder): number {
  const { doc, c } = o;
  const ecart = 5;
  const hauteur = 36;
  const largeur = (largeurUtile(o) - 2 * ecart) / 3;
  y = c.reserver(doc, y, hauteur + 2);

  const mode = receptionDe(commande).mode;
  const cases: { titre: string; ton: 'or' | 'nuit' }[] = [
    { titre: 'Préparé par', ton: 'or' },
    { titre: mode === 'retrait' ? 'Remis au client par' : mode === 'transport' ? 'Chauffeur / transporteur' : 'Livreur', ton: 'or' },
    { titre: 'Client — reçu en bon état', ton: 'nuit' },
  ];
  cases.forEach(({ titre, ton }, i) => {
    const x = c.MARGE + i * (largeur + ecart);
    c.encart(doc, { x, y, largeur, hauteur, etiquette: titre, ton });
    ['Nom', 'Date', 'Signature'].forEach((champ, k) => {
      const base = y + 12.5 + k * 6.5;
      const libelle = `${champ} :`;
      ecrire(doc, libelle, x + 4, base, 7, 'normal', c.ESTOMPE);
      if (champ === 'Signature') return;
      doc.setDrawColor(...c.ESTOMPE);
      doc.setLineWidth(0.15);
      doc.setLineDashPattern([0.5, 0.8], 0);
      doc.line(x + 5 + doc.getTextWidth(libelle), base + 0.6, x + largeur - 4, base + 0.6);
      doc.setLineDashPattern([], 0);
    });
  });
  return y + hauteur + 4;
}

// ─── Le document ──────────────────────────────────────────────────────────────

async function dessinerBon(o: Outils, commande: ShopOrder, options: OptionsBon): Promise<void> {
  const recue = dateImprimee(commande.createdAt);
  const paiementRecu = paiementRecuPour(commande, options);
  let y = await o.c.enTeteDocument(o.doc, {
    titre: 'Bon de livraison',
    sousTitre: `Commande n° ${numeroDe(commande)}`,
    mentions: recue ? [`Reçue le ${recue}`] : [],
  });
  y = bandeauCommande(o, y, commande, paiementRecu);
  y = alerteStatut(o, y, commande, paiementRecu);
  y = blocReception(o, y, commande, options.reglages ?? REGLAGES_RECEPTION_DEFAUT, paiementRecu);
  y = encartsClient(o, y, commande);
  y = tableauArticles(o, y, commande);
  y = blocTotaux(o, y, commande, paiementRecu);
  y = noteClient(o, y, commande);
  casesSignature(o, y, commande);
}

/** La mention du pied de page : le numéro, comment ça se paie, et que ce n'est pas une facture. */
function mentionPied(commande: ShopOrder, options: OptionsBon): string {
  const paiement = paiementRecuPour(commande, options)
    ? 'Déjà payée'
    : { cod: '', virement: 'Paiement par virement', carte: 'Paiement par carte' }[moyenPaiementDe(commande)]
      || { domicile: 'Paiement à la livraison', retrait: 'Paiement au retrait', transport: 'Transport à confirmer' }[receptionDe(commande).mode];
  return `${numeroDe(commande)} — ${paiement} — ce bon ne vaut pas facture.`;
}

/**
 * Sur les pages suivantes d'un long bon, de quoi le rattacher à sa commande si la feuille
 * s'égare dans le lot.
 */
function mentionSuite(o: Outils, premiere: number, derniere: number, numero: string): void {
  for (let page = premiere + 1; page <= derniere; page++) {
    o.doc.setPage(page);
    ecrire(o.doc, `Bon de livraison ${numero} — suite`, o.c.MARGE, 9, 7, 'normal', o.c.ESTOMPE);
  }
}

/**
 * Le pied de page de la charte, posé sur les seules pages d'un bon. En impression groupée, chaque
 * bon part avec son colis : « Page 2 / 7 » sur un bon d'une page ferait chercher des feuilles qui
 * sont dans un autre carton. La charte numérote tout le document qu'on lui donne ; on lui donne
 * une vue du document réduite aux pages de ce bon.
 */
function piedDuBon(o: Outils, premiere: number, derniere: number, mention: string): void {
  const vue: jsPDF = new Proxy(o.doc, {
    get(cible, cle) {
      if (cle === 'getNumberOfPages') return () => derniere - premiere + 1;
      if (cle === 'setPage') return (page: number) => { cible.setPage(premiere + page - 1); return vue; };
      const valeur = Reflect.get(cible, cle, cible);
      return typeof valeur === 'function' ? valeur.bind(cible) : valeur;
    },
  });
  o.c.piedDeDocument(vue, mention);
}

const listeDe = (commandes: ShopOrder | ShopOrder[]) =>
  (Array.isArray(commandes) ? commandes : [commandes]).filter(Boolean);

/**
 * Construit le bon de livraison d'une commande, ou ceux de plusieurs commandes dans un seul
 * fichier, sans le télécharger. Chaque commande commence sur une nouvelle page et porte sa propre
 * pagination. Rejette « Aucune commande à imprimer. » sur une liste vide.
 */
export async function construireBonLivraison(commandes: ShopOrder | ShopOrder[], options: OptionsBon = {}): Promise<jsPDF> {
  const liste = listeDe(commandes);
  if (liste.length === 0) throw new Error('Aucune commande à imprimer.');

  const o = await outils();
  for (const [i, commande] of liste.entries()) {
    if (i > 0) o.doc.addPage();
    const premiere = o.doc.getNumberOfPages();
    await dessinerBon(o, commande, options);
    const derniere = o.doc.getNumberOfPages();
    mentionSuite(o, premiere, derniere, numeroDe(commande));
    piedDuBon(o, premiere, derniere, mentionPied(commande, options));
  }
  return o.doc;
}

/** Jour du Maroc, AAAA-MM-JJ. */
const jourMaroc = (maintenant: number) =>
  new Intl.DateTimeFormat('en-CA', { timeZone: 'Africa/Casablanca', year: 'numeric', month: '2-digit', day: '2-digit' })
    .format(new Date(maintenant));

/**
 * « Bon-livraison-LBT-MG2K3H7P-X9QF.pdf » pour une commande,
 * « Bons-livraison-3-commandes-2026-09-27.pdf » pour un lot.
 */
export function nomFichierBonLivraison(commandes: ShopOrder | ShopOrder[], maintenant = Date.now()): string {
  const liste = listeDe(commandes);
  if (liste.length === 1) {
    const numero = String(liste[0].orderNumber || '').replace(/[^A-Za-z0-9_-]+/g, '-').replace(/^-+|-+$/g, '');
    return `Bon-livraison-${numero || 'commande'}.pdf`;
  }
  return `Bons-livraison-${liste.length}-commandes-${jourMaroc(maintenant)}.pdf`;
}

/** Télécharge le bon d'une commande, ou les bons d'un lot en un seul fichier. */
export async function exporterBonLivraison(commandes: ShopOrder | ShopOrder[], options: OptionsBon = {}): Promise<void> {
  const liste = listeDe(commandes);
  const doc = await construireBonLivraison(liste, options);
  doc.save(nomFichierBonLivraison(liste));
}
