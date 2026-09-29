/**
 * Les papiers des rouleaux et du retrait en magasin : devis de transport, bon de retrait, feuille
 * de route de la camionnette, bon de remise au transporteur.
 *
 * Pourquoi : un rouleau entier ne part jamais par Sendit. Son transport se décide au téléphone
 * (camionnette LEBTEX dans le Grand Casablanca, transporteur habituel de Derb Omar jusqu'à son
 * dépôt dans la ville du client) ou le client vient le chercher. Sans papier, le prix convenu au
 * téléphone s'oublie, le RIB circule en capture d'écran, le chauffeur rentre sans qu'on sache
 * combien il devait rapporter, et personne ne peut prouver qu'un camion a bien pris quatre colis.
 * Chaque document répond à une de ces questions et porte des cases de signature.
 *
 * Ce qu'ils ne disent jamais : un prix de revient, ni la note interne de l'équipe. Le devis et le
 * bon de retrait partent chez le client ; la feuille de route et le bon de remise restent dans la
 * cabine d'un camion.
 *
 * Le RIB : imprimé seulement sur le devis, tiré des réglages (/admin-shop) et seulement si le
 * virement y est actif. Il n'est jamais envoyé seul par message ; le devis rappelle que LEBTEX ne
 * change jamais de RIB par message, et qu'une capture d'écran ne vaut pas paiement.
 *
 * L'arabe : même règle que le bon de livraison (src/lib/pdf-commande-boutique.ts), dont on reprend
 * textePourPdf. Un nom ou une adresse en arabe devient « (en arabe — voir la commande) », les
 * téléphones tapés en chiffres arabes restent lisibles.
 *
 * Mise en page : la charte commune (src/lib/pdf-charte-lebtex.ts). jsPDF, autotable et la charte
 * ne se chargent qu'au clic : /admin-shop et /staff s'ouvrent sans eux.
 */

import type jsPDF from 'jspdf';
import type { LieuRetrait, MoyenPaiement, ShopOrder } from '@/lib/shop-types';
import { ribLisible, type ReglagesReception } from '@/lib/reglages-reception';
import {
  MENTION_LIGNE_ROULEAU, NOMS_LIEUX, PLAFOND_ESPECES_TOURNEE, commandeMixte, dateDe, dateHeure, detailsVariante, lignesCollentAuSousTotal,
  lignesSansPrix, moyenPaiementDe, prixUnitaireLigne, receptionDe, telInternational, telLisible, totalLigne,
  type LigneCommande,
} from '@/lib/commandes-boutique';
import { formatPrice } from '@/lib/shop-utils';
import { texteImprimable } from '@/lib/pdf-espace-client';
import { chiffresLatins, telephonesImprimables, textePourPdf } from '@/lib/pdf-commande-boutique';

type Couleur = [number, number, number];
type Style = 'normal' | 'bold' | 'italic' | 'bolditalic';

// ─── Les règles que les papiers rappellent ────────────────────────────────────

/** Espèces au plus dans la camionnette pour une tournée : la règle commune, rappelée sur la feuille de route. */
export { PLAFOND_ESPECES_TOURNEE };
/** Durée pendant laquelle le prix d'un devis de transport tient. */
export const VALIDITE_DEVIS_HEURES = 48;
/** Écrit sur tout devis : la parade au faux RIB envoyé par un WhatsApp piraté. */
export const MENTION_RIB = 'LEBTEX ne change jamais de RIB par message.';

/** Nom court d'un magasin, en capitales, pour les bandeaux où la place manque. */
const nomCourt = (lieu: LieuRetrait) => NOMS_LIEUX[lieu].toUpperCase();

/** Texte d'alerte sur fond ambre (le même brun que le bon de livraison). */
const BRUN: Couleur = [146, 64, 14];
// Le bleu nuit et le gris de la charte, pour les contenus préparés avant que la charte (chargée au
// clic) soit là.
const NUIT: Couleur = [15, 23, 42];
const GRIS: Couleur = [100, 116, 139];

const montant = (n: unknown) => texteImprimable(formatPrice(Number(n) || 0));
const quantite = (n: unknown) =>
  texteImprimable((Number(n) || 0).toLocaleString('fr-FR', { maximumFractionDigits: 2 }));
const kilos = (n: number) =>
  texteImprimable(`${n.toLocaleString('fr-FR', { maximumFractionDigits: 1 })} kg`);
const positif = (n: unknown): n is number => typeof n === 'number' && Number.isFinite(n) && n > 0;

/** Ce qui s'imprime à la place du prix d'un article « sur demande », arrivé à 0. */
const A_FIXER = 'à fixer';
/** Une case à remplir à la main. */
const A_REMPLIR = '________________';

const FUSEAU = 'Africa/Casablanca';

/** « Mercredi 30/09/2026 », jour du Maroc. */
function jourLisible(d: Date): string {
  const jour = new Intl.DateTimeFormat('fr-FR', {
    timeZone: FUSEAU, weekday: 'long', day: '2-digit', month: '2-digit', year: 'numeric',
  }).format(d);
  return jour.charAt(0).toUpperCase() + jour.slice(1);
}

/** Jour du Maroc, AAAA-MM-JJ : pour les noms de fichier. */
const jourIso = (d: Date) =>
  new Intl.DateTimeFormat('en-CA', { timeZone: FUSEAU, year: 'numeric', month: '2-digit', day: '2-digit' }).format(d);

/** « 27/09/2026 à 14:05 », heure du Maroc ; jamais « aujourd'hui » : le papier se relit le lendemain. */
const dateImprimee = (d: Date) => dateHeure(d, 0);

const dateOuMaintenant = (v: unknown) => dateDe(v) ?? new Date();

// ─── Ce que dit une commande ──────────────────────────────────────────────────

/** Le numéro de commande tel qu'il s'imprime, et tel qu'on l'écrit sur le colis. */
const numeroDe = (commande: ShopOrder) => textePourPdf(commande.orderNumber) || 'sans numéro';

const villeDe = (commande: ShopOrder) => textePourPdf(commande.shippingAddress?.city).toUpperCase();

const nomDe = (commande: ShopOrder) =>
  textePourPdf(commande.customerName || commande.shippingAddress?.fullName) || '—';

/**
 * Le magasin où se retire la commande : celui qu'elle porte pour un retrait, sinon celui où elle
 * a été préparée (les rouleaux au stock de CHRIFA, les petits articles à Derb Omar). La règle est
 * celle de la fiche (receptionDe), pour que papier et écran disent le même magasin.
 */
export function lieuDeRetraitDe(commande: ShopOrder): LieuRetrait {
  return receptionDe(commande).lieu;
}

/** Ce que coûtent les articles après réduction : la base du devis et de la valeur déclarée. */
function marchandiseDe(commande: ShopOrder): number {
  return Math.max(0, (Number(commande.subtotal) || 0) - (Number(commande.discount) || 0));
}

const MOYEN_LISIBLE: Record<MoyenPaiement, string> = {
  cod: 'en espèces',
  virement: 'par virement',
  carte: 'par carte',
};

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
  // compress : un devis part par WhatsApp ou par e-mail, il doit rester léger.
  const doc = new JsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4', compress: true });
  return { doc, c, autoTable };
}

const largeurUtile = ({ doc, c }: Outils) => doc.internal.pageSize.getWidth() - 2 * c.MARGE;

/** 1 point typographique, en millimètres. */
const PT = 0.3528;
const interligne = (taille: number) => taille * PT * 1.3;

/**
 * Un texte découpé à la largeur, dans la police qu'on s'apprête à utiliser. Au-delà de `max`
 * lignes, la dernière se termine par `suite` : un texte coupé le dit.
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

/**
 * Une valeur mise en avant qui doit tenir dans sa case : la police rapetisse jusqu'à 9 pt, puis
 * le texte s'écourte avec une ellipse. Un gros montant ne déborde jamais sur la case voisine.
 */
function ecrireAjuste(
  o: Outils, texte: string, x: number, y: number, largeurMax: number,
  taille: number, couleur: Couleur, align: 'left' | 'right' | 'center' = 'left',
): void {
  const { doc, c } = o;
  doc.setFont('helvetica', 'bold');
  let t = taille;
  doc.setFontSize(t);
  while (t > 9 && doc.getTextWidth(texte) > largeurMax) { t -= 0.5; doc.setFontSize(t); }
  ecrire(doc, c.ajuster(doc, texte, largeurMax), x, y, t, 'bold', couleur, align);
}

/** Une petite étiquette en capitales au-dessus d'une valeur. */
function etiquette(o: Outils, texte: string, x: number, y: number, align: 'left' | 'right' | 'center' = 'left'): void {
  ecrire(o.doc, texte.toUpperCase(), x, y, 6.5, 'bold', o.c.ESTOMPE, align);
}

/** Une ligne déjà découpée : le texte, sa police, et la hauteur qu'elle occupe. */
interface LigneEncart {
  texte: string;
  taille: number;
  style: Style;
  couleur: Couleur;
  hauteur: number;
  /** Petit libellé à gauche de la valeur (« Tél. », « RIB »), la valeur décalée d'autant. */
  libelle?: string;
  decalage?: number;
}

/** Un paragraphe à poser dans un encart ou un encadré, avant découpe. */
interface Paragraphe {
  texte: string;
  taille?: number;
  style?: Style;
  couleur?: Couleur;
  /** Nombre de lignes au plus ; au-delà, la dernière finit par `suite`. */
  max?: number;
  suite?: string;
  libelle?: string;
  /** Largeur réservée au libellé, en mm. */
  decalage?: number;
  /** Blanc avant le paragraphe, en mm. */
  avant?: number;
}

const espace = (hauteur: number): LigneEncart =>
  ({ texte: '', taille: 1, style: 'normal', couleur: [0, 0, 0], hauteur });

const hauteurDe = (lignes: LigneEncart[]) => lignes.reduce((s, l) => s + l.hauteur, 0);

function enLignes(o: Outils, paragraphes: Paragraphe[], largeur: number, couleurParDefaut?: Couleur): LigneEncart[] {
  const lignes: LigneEncart[] = [];
  for (const p of paragraphes) {
    if (!p.texte) continue;
    if (p.avant) lignes.push(espace(p.avant));
    const taille = p.taille ?? 8.5;
    const style = p.style ?? 'normal';
    const couleur = p.couleur ?? couleurParDefaut ?? o.c.TEXTE;
    const decalage = p.libelle ? (p.decalage ?? 16) : 0;
    decouper(o.doc, p.texte, largeur - decalage, taille, style, p.max ?? 99, p.suite ?? '…').forEach((texte, i) => {
      lignes.push({
        texte, taille, style, couleur, hauteur: interligne(taille),
        libelle: i === 0 ? p.libelle : undefined, decalage,
      });
    });
  }
  return lignes;
}

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

// ─── Les blocs communs ────────────────────────────────────────────────────────

/** Un encadré prêt à dessiner : ses lignes et sa hauteur, connues avant de choisir où le poser. */
interface Encadre { lignes: LigneEncart[]; hauteur: number; titre?: string }

function preparerEncadre(o: Outils, paragraphes: Paragraphe[], largeur: number, ton: 'or' | 'ambre', titre?: string): Encadre {
  const lignes = enLignes(o, paragraphes, largeur - 10, ton === 'ambre' ? BRUN : undefined);
  return { lignes, titre, hauteur: (titre ? 5.5 : 0) + 4 + hauteurDe(lignes) };
}

function dessinerEncadre(o: Outils, e: Encadre, x: number, y: number, largeur: number, ton: 'or' | 'ambre'): number {
  const { doc, c } = o;
  doc.setFillColor(...(ton === 'ambre' ? [255, 251, 235] as Couleur : c.GOLD_PALE));
  doc.setDrawColor(...(ton === 'ambre' ? [253, 230, 138] as Couleur : c.BORDURE));
  doc.setLineWidth(0.25);
  doc.roundedRect(x, y, largeur, e.hauteur, 1.5, 1.5, 'FD');
  doc.setFillColor(...(ton === 'ambre' ? c.AMBRE : c.GOLD));
  doc.roundedRect(x, y, 2.2, e.hauteur, 1, 1, 'F');
  if (e.titre) ecrire(doc, e.titre.toUpperCase(), x + 6, y + 5, 7, 'bold', c.NAVY);
  dessinerLignes(o, e.lignes, x + 6, y + 2 + (e.titre ? 5.5 : 0));
  return y + e.hauteur;
}

/** Un encadré pleine largeur, filet de couleur à gauche, posé sur la page qui a la place. Rend le Y suivant. */
function encadre(o: Outils, y: number, paragraphes: Paragraphe[], ton: 'or' | 'ambre', titre?: string, apres = 5): number {
  const largeur = largeurUtile(o);
  const e = preparerEncadre(o, paragraphes, largeur, ton, titre);
  if (e.lignes.length === 0) return y;
  y = o.c.reserver(o.doc, y, e.hauteur + 2);
  return dessinerEncadre(o, e, o.c.MARGE, y, largeur, ton) + apres;
}

interface CaseBandeau { etiquette: string; valeur: string; taille?: number }

/**
 * La ligne qu'on lit sans chercher : trois informations, à gauche, au milieu et à droite, chacune
 * dans sa zone. Une valeur trop longue rapetisse au lieu d'empiéter sur la voisine.
 */
function bandeau(o: Outils, y: number, gauche: CaseBandeau, milieu: CaseBandeau | null, droite: CaseBandeau): number {
  const { doc, c } = o;
  const largeur = largeurUtile(o);
  const hauteur = 15;
  y = c.reserver(doc, y, hauteur + 5);
  doc.setFillColor(...c.FOND);
  doc.setDrawColor(...c.BORDURE);
  doc.setLineWidth(0.3);
  doc.roundedRect(c.MARGE, y, largeur, hauteur, 1.5, 1.5, 'FD');
  doc.setFillColor(...c.GOLD);
  doc.roundedRect(c.MARGE, y, 2.2, hauteur, 1, 1, 'F');

  const xGauche = c.MARGE + 7;
  const xDroite = c.MARGE + largeur - 5;
  const xMilieu = c.MARGE + largeur / 2 + 4;

  etiquette(o, gauche.etiquette, xGauche, y + 5.2);
  ecrireAjuste(o, gauche.valeur, xGauche, y + 11.5, largeur / 2 - 36, gauche.taille ?? 13, c.NAVY);
  if (milieu && milieu.valeur) {
    etiquette(o, milieu.etiquette, xMilieu, y + 5.2, 'center');
    ecrireAjuste(o, milieu.valeur, xMilieu, y + 11.5, 52, milieu.taille ?? 11, c.NAVY, 'center');
  }
  etiquette(o, droite.etiquette, xDroite, y + 5.2, 'right');
  ecrireAjuste(o, droite.valeur, xDroite, y + 11.5, 50, droite.taille ?? 13, c.NAVY, 'right');
  return y + hauteur + 5;
}

interface Encart { etiquette: string; ton: 'or' | 'nuit'; contenu: Paragraphe[] }

/** Deux encarts côte à côte, à la hauteur du plus rempli. Rend le Y suivant. */
function deuxEncarts(o: Outils, y: number, gauche: Encart, droite: Encart): number {
  const { doc, c } = o;
  const ecart = 6;
  const largeur = (largeurUtile(o) - ecart) / 2;
  const lignesGauche = enLignes(o, gauche.contenu, largeur - 8);
  const lignesDroite = enLignes(o, droite.contenu, largeur - 8);
  const hauteur = 8 + Math.max(hauteurDe(lignesGauche), hauteurDe(lignesDroite)) + 3;

  y = c.reserver(doc, y, hauteur + 6);
  const xDroite = c.MARGE + largeur + ecart;
  c.encart(doc, { x: c.MARGE, y, largeur, hauteur, etiquette: gauche.etiquette, ton: gauche.ton });
  c.encart(doc, { x: xDroite, y, largeur, hauteur, etiquette: droite.etiquette, ton: droite.ton });
  dessinerLignes(o, lignesGauche, c.MARGE + 4, y + 8);
  dessinerLignes(o, lignesDroite, xDroite + 4, y + 8);
  return y + hauteur + 6;
}

/** Qui appeler : le nom, les téléphones en gros, l'e-mail. */
function contenuClient(commande: ShopOrder, avecEmail = true): Paragraphe[] {
  const telephones = telephonesImprimables(commande);
  const contenu: Paragraphe[] = [
    { texte: nomDe(commande), taille: 10.5, style: 'bold', couleur: NUIT, max: 2 },
  ];
  if (telephones.length === 0) {
    contenu.push({ texte: 'Aucun téléphone sur la commande', style: 'bold', couleur: BRUN, avant: 1.5 });
  }
  telephones.forEach((tel, i) => contenu.push({
    texte: tel, taille: 11.5, style: 'bold', libelle: i === 0 ? 'Tél.' : `Tél. ${i + 1}`, decalage: 13, max: 1,
    avant: i === 0 ? 1.5 : 0,
  }));
  const email = textePourPdf(commande.customerEmail);
  if (avecEmail && email) contenu.push({ texte: email, taille: 7.5, couleur: GRIS, max: 2, avant: 1 });
  return contenu;
}

/**
 * Les articles de la commande. Le modèle, la couleur et la taille ont chacun leur colonne, comme
 * sur le bon de livraison. Sans les prix pour le transporteur : il n'en a pas besoin, la valeur
 * déclarée suffit.
 */
function tableauArticles(o: Outils, y: number, commande: ShopOrder, titre: string, avecPrix: boolean): number {
  const { doc, c, autoTable } = o;
  const items = (commande.items || []) as LigneCommande[];
  const colonnes = avecPrix ? 7 : 5;
  // Commande mixte : chaque rouleau le dit sur sa ligne (préparé à CHRIFA), les petits
  // articles viennent de Derb Omar et sont regroupés la veille.
  const mixte = commandeMixte(commande);
  const corps = items.map(item => {
    const variante = new Map(detailsVariante(item.variant).map(d => [d.libelle, textePourPdf(d.valeur)]));
    const nom = textePourPdf(item.productName) || '—';
    const ligne = [
      mixte && item.volumineux ? `${nom} (${textePourPdf(MENTION_LIGNE_ROULEAU)})` : nom,
      variante.get('Modèle') || '—',
      variante.get('Couleur') || '—',
      variante.get('Taille') || '—',
      quantite(item.quantity),
    ];
    if (!avecPrix) return ligne;
    const unitaire = prixUnitaireLigne(item);
    return [...ligne, unitaire > 0 ? montant(unitaire) : A_FIXER, unitaire > 0 ? montant(totalLigne(item)) : A_FIXER];
  });

  y = c.reserver(doc, y, 28);
  y = c.titreSection(doc, y + 2, titre);
  autoTable(doc, {
    startY: y,
    margin: { left: c.MARGE, right: c.MARGE, top: c.MARGE + 2, bottom: c.HAUTEUR_PIED + 2 },
    head: [avecPrix
      ? ['Article', 'Modèle', 'Couleur', 'Taille', 'Qté', 'P.U.', 'Total']
      : ['Article', 'Modèle', 'Couleur', 'Taille', 'Qté']],
    body: corps.length > 0
      ? corps
      : [[{ content: 'Aucun article sur cette commande', colSpan: colonnes, styles: { halign: 'center', fontStyle: 'italic' } }]],
    ...c.STYLES_TABLEAU,
    rowPageBreak: 'avoid',
    columnStyles: avecPrix
      ? {
        0: { cellWidth: 'auto', fontStyle: 'bold', textColor: c.NAVY },
        1: { cellWidth: 22 }, 2: { cellWidth: 30 }, 3: { cellWidth: 16 }, 4: { cellWidth: 12 },
        5: { cellWidth: 23 }, 6: { cellWidth: 26, fontStyle: 'bold' },
      }
      : {
        0: { cellWidth: 'auto', fontStyle: 'bold', textColor: c.NAVY },
        1: { cellWidth: 28 }, 2: { cellWidth: 36 }, 3: { cellWidth: 22 }, 4: { cellWidth: 16 },
      },
    didParseCell: data => {
      // Quantité et montants s'alignent à droite, en-tête compris : les chiffres se comparent en colonne.
      if (data.column.index === 4) data.cell.styles.halign = 'center';
      if (data.column.index >= 5) data.cell.styles.halign = 'right';
      if (data.section === 'body' && data.cell.raw === A_FIXER) {
        data.cell.styles.textColor = BRUN;
        data.cell.styles.fontStyle = 'bolditalic';
      }
    },
  });
  return ((doc as any).lastAutoTable?.finalY ?? y) + 6;
}

interface Mention { paragraphes: Paragraphe[]; ton: 'or' | 'ambre'; titre?: string }

interface Totaux {
  lignes: [string, string][];
  libelleTotal: string;
  valeurTotal: string;
  /** Une phrase en italique sous le total (« Paiement sur place », « Déjà payé par virement »). */
  apresTotal?: string;
  /** Ce qui explique les totaux, à leur gauche. */
  mentions?: Mention[];
}

/** Les totaux à droite, ce qui les explique à gauche. Rend le Y suivant. */
function blocTotaux(o: Outils, y: number, t: Totaux): number {
  const { doc, c } = o;
  const largeurBoite = 84;
  const xBoite = c.MARGE + largeurUtile(o) - largeurBoite;
  const largeurMentions = largeurUtile(o) - largeurBoite - 6;

  const mentions = (t.mentions || [])
    .map(m => ({ ton: m.ton, e: preparerEncadre(o, m.paragraphes, largeurMentions, m.ton, m.titre) }))
    .filter(m => m.e.lignes.length > 0);
  const apres = t.apresTotal ? decouper(doc, t.apresTotal, largeurBoite - 8, 7.5, 'italic', 3) : [];

  const pas = 5.5;
  const hauteurBande = 14;
  const hauteurApres = apres.length > 0 ? 2 + apres.length * interligne(7.5) + 1.5 : 3;
  const hauteurBoite = 3 + t.lignes.length * pas + 1 + hauteurBande + hauteurApres;
  const hauteurMentions = mentions.reduce((s, m) => s + m.e.hauteur + 3, 0);
  y = c.reserver(doc, y, Math.max(hauteurBoite, hauteurMentions) + 4);

  let yMention = y;
  for (const m of mentions) yMention = dessinerEncadre(o, m.e, c.MARGE, yMention, largeurMentions, m.ton) + 3;

  doc.setFillColor(...c.BLANC);
  doc.setDrawColor(...c.BORDURE);
  doc.setLineWidth(0.3);
  doc.roundedRect(xBoite, y, largeurBoite, hauteurBoite, 1.5, 1.5, 'FD');
  t.lignes.forEach(([libelle, valeur], i) => {
    const base = y + 3 + (i + 1) * pas - 1.6;
    ecrire(doc, libelle, xBoite + 4, base, 8.5, 'normal', c.ESTOMPE);
    const place = largeurBoite - 8 - doc.getTextWidth(libelle) - 3;
    doc.setFont('helvetica', 'bold');
    ecrire(doc, c.ajuster(doc, valeur, place), xBoite + largeurBoite - 4, base, 8.5, 'bold', c.TEXTE, 'right');
  });

  const yBande = y + 3 + t.lignes.length * pas + 1;
  doc.setFillColor(...c.GOLD_PALE);
  doc.rect(xBoite + 0.3, yBande, largeurBoite - 0.6, hauteurBande, 'F');
  doc.setDrawColor(...c.GOLD);
  doc.setLineWidth(0.6);
  doc.line(xBoite, yBande, xBoite + largeurBoite, yBande);
  doc.line(xBoite, yBande + hauteurBande, xBoite + largeurBoite, yBande + hauteurBande);
  ecrire(doc, t.libelleTotal.toUpperCase(), xBoite + 4, yBande + 8.6, 8.5, 'bold', c.NAVY);
  const placeTotal = largeurBoite - 8 - doc.getTextWidth(t.libelleTotal.toUpperCase()) - 4;
  ecrireAjuste(o, t.valeurTotal, xBoite + largeurBoite - 4, yBande + 9.6, placeTotal, 16, c.NAVY, 'right');
  apres.forEach((texte, i) => {
    ecrire(doc, texte, xBoite + 4, yBande + hauteurBande + 2 + (i + 0.78) * interligne(7.5), 7.5, 'italic', c.ESTOMPE);
  });

  return Math.max(y + hauteurBoite, yMention - 3) + 6;
}

interface CaseSignature { titre: string; ton?: 'or' | 'nuit'; champs?: string[] }

/**
 * Des cases à remplir à la main, une par personne qui engage sa responsabilité. C'est ce papier
 * signé qui tranche un « je n'ai rien reçu » ou un « il manquait un colis ».
 */
function casesSignature(o: Outils, y: number, cases: CaseSignature[]): number {
  const { doc, c } = o;
  const ecart = 5;
  const largeur = (largeurUtile(o) - (cases.length - 1) * ecart) / cases.length;
  const nbChamps = Math.max(...cases.map(k => (k.champs || ['Nom', 'Date', 'Signature']).length));
  // Assez haut pour signer : 9 mm sous le dernier libellé.
  const hauteur = 11.5 + (nbChamps - 1) * 6.5 + 9;
  y = c.reserver(doc, y, hauteur);

  cases.forEach((k, i) => {
    const x = c.MARGE + i * (largeur + ecart);
    c.encart(doc, { x, y, largeur, hauteur, etiquette: k.titre, ton: k.ton ?? 'or' });
    (k.champs || ['Nom', 'Date', 'Signature']).forEach((champ, n) => {
      const base = y + 11.5 + n * 6.5;
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

/**
 * Une rangée de champs courts (« Chauffeur », « Véhicule », « Départ ») : l'étiquette au-dessus, la
 * valeur dessous, ou un pointillé à remplir à la main quand on ne la connaît pas encore.
 */
function rangeeDeChamps(o: Outils, y: number, champs: { libelle: string; valeur?: string }[]): number {
  const { doc, c } = o;
  const ecart = 6;
  const largeur = (largeurUtile(o) - (champs.length - 1) * ecart) / champs.length;
  y = c.reserver(doc, y, 13);
  champs.forEach((champ, i) => {
    const x = c.MARGE + i * (largeur + ecart);
    etiquette(o, champ.libelle, x, y + 2.5);
    if (champ.valeur) {
      ecrireAjuste(o, champ.valeur, x, y + 8, largeur - 2, 10.5, c.TEXTE);
    } else {
      doc.setDrawColor(...c.ESTOMPE);
      doc.setLineWidth(0.15);
      doc.setLineDashPattern([0.5, 0.8], 0);
      doc.line(x, y + 8.6, x + largeur - 2, y + 8.6);
      doc.setLineDashPattern([], 0);
    }
  });
  return y + 13;
}

/** Ce qu'il faut savoir avant de remettre quoi que ce soit : un papier imprimé par erreur ne fait rien sortir. */
function alerteStatut(o: Outils, y: number, commande: ShopOrder, action: 'livrer' | 'remettre'): number {
  const textes: Partial<Record<ShopOrder['status'], string>> = {
    pending: `Commande pas encore confirmée : appeler le client avant de ${action === 'livrer' ? 'la préparer' : 'la préparer ou la remettre'}.`,
    cancelled: `Commande annulée : ne rien ${action === 'livrer' ? 'expédier' : 'remettre'}.`,
    returned: 'Commande revenue au magasin : ne rien faire sans l’accord du client.',
  };
  const texte = textes[commande.status];
  if (!texte) return y;
  return encadre(o, y, [{ texte, taille: 9, style: 'bold' }], 'ambre');
}

/** Sur les pages suivantes d'un long document, de quoi le rattacher à la première si la feuille s'égare. */
function mentionSuite(o: Outils, titre: string): void {
  const pages = o.doc.getNumberOfPages();
  for (let page = 2; page <= pages; page++) {
    o.doc.setPage(page);
    ecrire(o.doc, `${titre} — suite`, o.c.MARGE, 9, 7, 'normal', o.c.ESTOMPE);
  }
}

/** Un nom de fichier sans caractère qui gêne Windows ou WhatsApp. */
const pourFichier = (v: unknown, defaut: string) =>
  String(v ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[^A-Za-z0-9_-]+/g, '-').replace(/^-+|-+$/g, '') || defaut;

// ─── Devis de transport ───────────────────────────────────────────────────────

/** Qui paie le transport : avec la commande (à LEBTEX), ou au transporteur à l'arrivée. */
export type PaiementTransport = 'avec_la_commande' | 'a_l_arrivee';

export interface OptionsDevisTransport {
  /** Les réglages de /admin-shop : RIB (si le virement est actif), carte, jours de tournée, téléphones. */
  reglages: ReglagesReception;
  /** Camionnette LEBTEX (Grand Casablanca) ou transporteur habituel jusqu'à son dépôt dans la ville du client. */
  mode: 'camionnette' | 'transporteur';
  /** Prix du transport annoncé au téléphone, en DH. 0 = offert. */
  prixTransport: number;
  /** Transporteur seulement : le transport se paie au transporteur à l'arrivée. Par défaut : avec la commande. */
  paiementTransport?: PaiementTransport;
  /** Nom du transporteur (transporteur seulement). */
  transporteur?: string;
  /** Ville où le transporteur dépose la marchandise ; par défaut, la ville de la commande. */
  villeDestination?: string;
  /** Adresse du dépôt du transporteur dans cette ville, où le client récupère. */
  depot?: string;
  /** Poids estimé de l'envoi, en kg (s'il est connu). */
  poidsEstimeKg?: number;
  nbColis?: number;
  /** Quand : « tournée du jeudi 02/10 », « départ demain, 1 à 2 jours ». */
  delai?: string;
  /** Date du devis ; par défaut maintenant. La validité de 48 h part de là. */
  emisLe?: Date | number | string;
}

/** Ce que le client paie à LEBTEX selon le devis : les articles, et le transport s'il se paie avec. */
export function totalDevisTransport(commande: ShopOrder, opts: Pick<OptionsDevisTransport, 'mode' | 'prixTransport' | 'paiementTransport'>): number {
  const transport = Math.max(0, Number(opts.prixTransport) || 0);
  const aLArrivee = opts.mode === 'transporteur' && opts.paiementTransport === 'a_l_arrivee';
  return marchandiseDe(commande) + (aLArrivee ? 0 : transport);
}

function contenuTransport(commande: ShopOrder, opts: OptionsDevisTransport): { etiquette: string; contenu: Paragraphe[] } {
  const contenu: Paragraphe[] = [];
  const adresse = textePourPdf(commande.shippingAddress?.address);
  if (opts.mode === 'camionnette') {
    contenu.push({ texte: 'Camionnette LEBTEX', taille: 10.5, style: 'bold', couleur: NUIT });
    contenu.push({ texte: 'Livrée par notre chauffeur, à votre adresse :', taille: 7.5, couleur: GRIS, avant: 1 });
    contenu.push(adresse
      ? { texte: adresse, max: 4, suite: '… (adresse complète dans la commande)' }
      : { texte: 'Adresse à préciser au téléphone', style: 'bold', couleur: BRUN });
    const ville = villeDe(commande);
    if (ville) contenu.push({ texte: ville, taille: 10, style: 'bold', couleur: NUIT, max: 1 });
    const jours = textePourPdf(opts.reglages.camionnette.jours);
    if (jours) contenu.push({ texte: `Tournées : ${jours}`, avant: 1, max: 2 });
  } else {
    const ville = textePourPdf(opts.villeDestination).toUpperCase() || villeDe(commande) || 'VOTRE VILLE';
    contenu.push({ texte: `Transporteur jusqu’à ${ville}`, taille: 10.5, style: 'bold', couleur: NUIT, max: 2 });
    const transporteur = textePourPdf(opts.transporteur);
    if (transporteur) contenu.push({ texte: transporteur, libelle: 'Transporteur', decalage: 19, style: 'bold', max: 2, avant: 1 });
    const depot = textePourPdf(opts.depot);
    contenu.push(depot
      ? { texte: depot, libelle: 'Dépôt', decalage: 19, max: 3 }
      : { texte: `Dépôt du transporteur à ${ville} : adresse donnée au départ`, max: 3 });
    contenu.push({
      texte: 'Le camion dépose la marchandise à son dépôt ; vous la récupérez à ce dépôt.',
      taille: 7.5, style: 'italic', couleur: GRIS, avant: 1, max: 3,
    });
  }
  const details = [
    positif(opts.poidsEstimeKg) && `Poids estimé : environ ${kilos(opts.poidsEstimeKg)}`,
    positif(opts.nbColis) && `${opts.nbColis} colis`,
  ].filter(Boolean).join('  ·  ');
  if (details) contenu.push({ texte: details, avant: 1, max: 2 });
  const delai = textePourPdf(opts.delai);
  if (delai) contenu.push({ texte: `Quand : ${delai}`, max: 2 });
  return { etiquette: opts.mode === 'camionnette' ? 'Livraison' : 'Transport', contenu };
}

/**
 * Comment payer, sans rien imposer : les espèces comme aujourd'hui, le virement si le RIB est
 * réglé, la carte quand un prestataire sera branché. Le RIB n'apparaît que sur ce papier, jamais
 * seul dans un message.
 */
function paragraphesPaiement(commande: ShopOrder, opts: OptionsDevisTransport, total: number): Paragraphe[] {
  const r = opts.reglages;
  const lignes: Paragraphe[] = [];
  if (opts.mode === 'camionnette') {
    lignes.push({ texte: 'Espèces : au chauffeur LEBTEX, à la livraison, contre le bon signé.', style: 'bold' });
    if (total > PLAFOND_ESPECES_TOURNEE) {
      lignes.push({
        texte: `Au-delà de ${montant(PLAFOND_ESPECES_TOURNEE)}, le chauffeur ne peut pas tout prendre en espèces : `
          + 'le virement est le plus simple, sinon on s’arrange au téléphone.',
        taille: 7.5, style: 'italic',
      });
    }
  } else {
    lignes.push({ texte: 'Espèces : selon ce qui est convenu au téléphone.', style: 'bold' });
  }

  if (r.virement.actif) {
    lignes.push({ texte: 'Virement bancaire', style: 'bold', couleur: NUIT, avant: 2.5 });
    lignes.push({ texte: textePourPdf(r.virement.titulaire), libelle: 'Titulaire', decalage: 18, style: 'bold', max: 2 });
    const banque = textePourPdf(r.virement.banque);
    if (banque) lignes.push({ texte: banque, libelle: 'Banque', decalage: 18, max: 2 });
    lignes.push({ texte: ribLisible(r.virement.rib), libelle: 'RIB', decalage: 18, taille: 12, style: 'bold', couleur: NUIT, max: 1 });
    lignes.push({ texte: `Commande ${numeroDe(commande)}`, libelle: 'Motif', decalage: 18, style: 'bold', max: 1 });
    lignes.push({
      texte: 'Le virement est validé quand il apparaît sur notre compte : une capture d’écran ne suffit pas.',
      taille: 7.5, style: 'italic', couleur: GRIS, avant: 1,
    });
  }
  if (r.carte.actif) {
    lignes.push({ texte: 'Carte bancaire : possible, dites-le-nous au téléphone.', style: 'bold', avant: 2.5 });
  }
  return lignes;
}

async function dessinerDevis(o: Outils, commande: ShopOrder, opts: OptionsDevisTransport): Promise<void> {
  const emis = dateOuMaintenant(opts.emisLe);
  const jusquAu = new Date(emis.getTime() + VALIDITE_DEVIS_HEURES * 3_600_000);
  const numero = numeroDe(commande);
  const prix = Math.max(0, Number(opts.prixTransport) || 0);
  const aLArrivee = opts.mode === 'transporteur' && opts.paiementTransport === 'a_l_arrivee';
  const total = totalDevisTransport(commande, opts);
  const sansPrix = lignesSansPrix(commande).length;
  const lieu = opts.reglages.lieux[lieuDeRetraitDe(commande)];
  const telephone = textePourPdf(lieu?.telephone) || '+212 5 22 25 77 78';

  let y = await o.c.enTeteDocument(o.doc, {
    titre: 'Devis de transport',
    sousTitre: `Commande n° ${numero}`,
    mentions: [`Établi le ${dateImprimee(emis)}`, `Valable ${VALIDITE_DEVIS_HEURES} h, jusqu’au ${dateImprimee(jusquAu)}`],
  });

  y = bandeau(o, y,
    { etiquette: 'Commande n°', valeur: numero },
    { etiquette: opts.mode === 'camionnette' ? 'Livraison' : 'Transport', valeur: opts.mode === 'camionnette' ? 'CAMIONNETTE LEBTEX' : 'TRANSPORTEUR' },
    { etiquette: sansPrix > 0 ? 'Total (hors prix à fixer)' : 'Total à payer', valeur: montant(total) });
  y = alerteStatut(o, y, commande, 'livrer');

  const transport = contenuTransport(commande, opts);
  y = deuxEncarts(o, y,
    { etiquette: 'Client', ton: 'or', contenu: contenuClient(commande) },
    { etiquette: transport.etiquette, ton: 'nuit', contenu: transport.contenu });

  y = tableauArticles(o, y, commande, 'Articles', true);

  const lignes: [string, string][] = [['Articles', montant(commande.subtotal)]];
  if (Number(commande.discount) > 0) {
    const code = textePourPdf(commande.couponCode);
    lignes.push([code ? `Réduction (${code})` : 'Réduction', `-${montant(commande.discount)}`]);
  }
  lignes.push(['Transport', aLArrivee ? 'à l’arrivée' : prix > 0 ? montant(prix) : 'Offert']);

  const mentions: Mention[] = [];
  if (sansPrix > 0) {
    mentions.push({
      ton: 'ambre',
      paragraphes: [{
        texte: `Prix à fixer au téléphone : ${sansPrix > 1 ? `${sansPrix} articles sans prix, non comptés` : '1 article sans prix, non compté'} dans le total.`,
        taille: 8, style: 'bold',
      }],
    });
  }
  if (!lignesCollentAuSousTotal(commande)) {
    mentions.push({
      ton: 'or',
      paragraphes: [{ texte: 'Prix de gros appliqué : le sous-total fait foi.', taille: 7.5, style: 'italic' }],
    });
  }
  mentions.push({
    ton: 'or',
    titre: 'Validité',
    paragraphes: [
      { texte: `Prix du transport garanti ${VALIDITE_DEVIS_HEURES} h, jusqu’au ${dateImprimee(jusquAu)}.`, taille: 8, style: 'bold' },
      { texte: 'La commande est ferme quand vous acceptez ce devis, par téléphone ou par message.', taille: 7.5 },
    ],
  });

  y = blocTotaux(o, y, {
    lignes,
    libelleTotal: 'Total à payer',
    valeurTotal: montant(total),
    apresTotal: aLArrivee
      ? `+ transport ${prix > 0 ? montant(prix) : 'au prix convenu'}, payé au transporteur à l’arrivée.`
      : 'À payer à LEBTEX.',
    mentions,
  });

  y = o.c.reserver(o.doc, y, 30);
  y = o.c.titreSection(o.doc, y + 2, 'Moyens de paiement');
  y = encadre(o, y + 1, paragraphesPaiement(commande, opts, total), 'or');
  encadre(o, y, [
    { texte: MENTION_RIB, taille: 9.5, style: 'bold' },
    { texte: `Si l’on vous envoie un autre RIB, ne payez pas : appelez-nous au ${telephone}.`, taille: 8 },
  ], 'ambre');
}

/** Construit le devis de transport d'une commande volumineuse, sans le télécharger. */
export async function construireDevisTransport(commande: ShopOrder, opts: OptionsDevisTransport): Promise<jsPDF> {
  if (!commande) throw new Error('Aucune commande à imprimer.');
  const o = await outils();
  await dessinerDevis(o, commande, opts);
  mentionSuite(o, `Devis de transport ${numeroDe(commande)}`);
  o.c.piedDeDocument(o.doc, `Devis ${numeroDe(commande)} — valable ${VALIDITE_DEVIS_HEURES} h — ${MENTION_RIB}`);
  return o.doc;
}

/** « Devis-transport-LBT-MG2K3H7P-X9QF.pdf » */
export function nomFichierDevisTransport(commande: ShopOrder): string {
  return `Devis-transport-${pourFichier(commande?.orderNumber, 'commande')}.pdf`;
}

/** Télécharge le devis de transport. */
export async function exporterDevisTransport(commande: ShopOrder, opts: OptionsDevisTransport): Promise<void> {
  (await construireDevisTransport(commande, opts)).save(nomFichierDevisTransport(commande));
}

// ─── Bon de retrait ───────────────────────────────────────────────────────────

export interface OptionsBonRetrait {
  /** Nombre de colis préparés ; inconnu, la case se remplit à la main. */
  nbColis?: number;
  /** Virement ou carte vu sur le compte par l'administrateur : rien à encaisser sur place. */
  paiementRecu?: boolean;
  /** Magasin de retrait, s'il diffère de celui de la commande. */
  lieu?: LieuRetrait;
}

async function dessinerBonRetrait(o: Outils, commande: ShopOrder, reglages: ReglagesReception, opts: OptionsBonRetrait): Promise<void> {
  const numero = numeroDe(commande);
  const cle = opts.lieu ?? lieuDeRetraitDe(commande);
  const lieu = reglages.lieux[cle];
  const recue = dateDe(commande.createdAt);
  const paye = opts.paiementRecu === true;
  const moyenChoisi = moyenPaiementDe(commande);
  const moyen = MOYEN_LISIBLE[moyenChoisi];
  const sansPrix = lignesSansPrix(commande).length > 0;

  let y = await o.c.enTeteDocument(o.doc, {
    titre: 'Bon de retrait',
    sousTitre: `Commande n° ${numero}`,
    mentions: recue ? [`Reçue le ${dateImprimee(recue)}`] : [],
  });

  y = bandeau(o, y,
    { etiquette: 'Commande n°', valeur: numero },
    { etiquette: 'Retrait à', valeur: nomCourt(cle) },
    paye
      ? { etiquette: 'À payer', valeur: `Payé ${moyen}`.trim(), taille: 12 }
      : { etiquette: sansPrix ? 'À payer (hors prix à fixer)' : 'À payer', valeur: montant(commande.total) });
  y = alerteStatut(o, y, commande, 'remettre');
  if (!paye && moyenChoisi !== 'cod' && commande.status !== 'cancelled') {
    // Rien ne sort contre une capture d'écran : tant que l'administrateur n'a pas vu l'argent, le
    // client paie sur place ou on attend. Sans bloquer : il peut toujours régler en espèces.
    y = encadre(o, y, [{
      texte: `${moyenChoisi === 'carte' ? 'Paiement par carte' : 'Virement'} pas encore vu sur le compte : encaisser `
        + `${montant(commande.total)} sur place, ou attendre la confirmation de l’administrateur. `
        + 'Une capture d’écran ne suffit pas.',
      taille: 9, style: 'bold',
    }], 'ambre');
  }

  const contenuLieu: Paragraphe[] = [
    { texte: textePourPdf(lieu?.nom) || nomCourt(cle), taille: 10.5, style: 'bold', couleur: NUIT, max: 2 },
    { texte: textePourPdf(lieu?.adresse), max: 3, avant: 1 },
    { texte: textePourPdf(lieu?.horaires), libelle: 'Horaires', decalage: 16, max: 2, avant: 1 },
    { texte: textePourPdf(lieu?.telephone), libelle: 'Tél.', decalage: 16, style: 'bold', max: 1 },
  ];
  y = deuxEncarts(o, y,
    { etiquette: 'Client', ton: 'or', contenu: contenuClient(commande) },
    { etiquette: 'Lieu de retrait', ton: 'nuit', contenu: contenuLieu });

  y = tableauArticles(o, y, commande, 'Articles à remettre', true);

  const lignes: [string, string][] = [['Sous-total', montant(commande.subtotal)]];
  if (Number(commande.discount) > 0) {
    const code = textePourPdf(commande.couponCode);
    lignes.push([code ? `Réduction (${code})` : 'Réduction', `-${montant(commande.discount)}`]);
  }
  lignes.push(Number(commande.deliveryFee) > 0 ? ['Livraison', montant(commande.deliveryFee)] : ['Retrait', 'Gratuit']);
  const mentions: Mention[] = [];
  if (sansPrix) {
    mentions.push({
      ton: 'ambre',
      paragraphes: [{ texte: 'Prix à fixer avec le client avant de remettre : des articles sans prix ne sont pas dans le total.', taille: 8, style: 'bold' }],
    });
  }
  mentions.push({
    ton: 'or',
    paragraphes: [
      { texte: 'Le client donne son numéro de commande et son nom.', taille: 8 },
      { texte: 'S’il envoie quelqu’un, cette personne donne les deux, et écrit son nom dans « Reçu par ».', taille: 8 },
    ],
  });
  y = blocTotaux(o, y, {
    lignes,
    libelleTotal: paye ? 'Reste à payer' : 'Total à payer',
    valeurTotal: montant(paye ? 0 : commande.total),
    apresTotal: paye ? `Déjà payé ${moyen} : ${montant(commande.total)}.` : 'Paiement sur place.',
    mentions,
  });

  // Le nombre de colis se compte avec le client : c'est lui qui évite le « il en manquait un ».
  y = o.c.reserver(o.doc, y, 12);
  ecrire(o.doc, 'Nombre de colis remis :', o.c.MARGE, y + 5, 10, 'bold', o.c.NAVY);
  const xColis = o.c.MARGE + o.doc.getTextWidth('Nombre de colis remis :') + 3;
  if (positif(opts.nbColis)) {
    ecrire(o.doc, String(opts.nbColis), xColis, y + 5, 13, 'bold', o.c.NAVY);
  } else {
    o.doc.setDrawColor(...o.c.ESTOMPE);
    o.doc.setLineWidth(0.15);
    o.doc.setLineDashPattern([0.5, 0.8], 0);
    o.doc.line(xColis, y + 5.6, xColis + 30, y + 5.6);
    o.doc.setLineDashPattern([], 0);
  }
  y += 11;

  casesSignature(o, y, [
    { titre: 'Remis par (LEBTEX)', ton: 'or' },
    { titre: 'Reçu par — en bon état', ton: 'nuit' },
  ]);
}

/** Construit le bon de retrait d'une commande, sans le télécharger. */
export async function construireBonRetrait(commande: ShopOrder, reglages: ReglagesReception, opts: OptionsBonRetrait = {}): Promise<jsPDF> {
  if (!commande) throw new Error('Aucune commande à imprimer.');
  const o = await outils();
  await dessinerBonRetrait(o, commande, reglages, opts);
  mentionSuite(o, `Bon de retrait ${numeroDe(commande)}`);
  o.c.piedDeDocument(o.doc, `Bon de retrait ${numeroDe(commande)} — ce bon ne vaut pas facture.`);
  return o.doc;
}

/** « Bon-retrait-LBT-MG2K3H7P-X9QF.pdf » */
export function nomFichierBonRetrait(commande: ShopOrder): string {
  return `Bon-retrait-${pourFichier(commande?.orderNumber, 'commande')}.pdf`;
}

/** Télécharge le bon de retrait. */
export async function exporterBonRetrait(commande: ShopOrder, reglages: ReglagesReception, opts: OptionsBonRetrait = {}): Promise<void> {
  (await construireBonRetrait(commande, reglages, opts)).save(nomFichierBonRetrait(commande));
}

// ─── Feuille de route de la camionnette ───────────────────────────────────────

/** Un arrêt de la tournée : la commande, et ce que l'équipe a convenu au téléphone. */
export interface ArretTournee {
  commande: ShopOrder;
  nbColis?: number;
  /** Quartier (Maârif, Hay Hassani…) : la feuille se range par ville, puis par quartier. */
  quartier?: string;
  /** Virement ou carte vu sur le compte par l'administrateur : le chauffeur n'encaisse rien. */
  paiementRecu?: boolean;
  /** Somme à encaisser convenue au téléphone quand elle diffère du total (transport ajouté…). */
  aEncaisser?: number;
}

export interface OptionsFeuilleDeRoute {
  /** Jour de la tournée ; par défaut aujourd'hui. */
  date?: Date | number | string;
  /** Le chauffeur LEBTEX : lui seul encaisse. Inconnu, la case se remplit à la main. */
  chauffeur?: string;
  /** Véhicule ou plaque. */
  vehicule?: string;
  /** D'où part la camionnette ; par défaut le stock de CHRIFA, où les rouleaux sont préparés. */
  depart?: string;
  /** Espèces au plus pour la tournée ; par défaut PLAFOND_ESPECES_TOURNEE. */
  plafondEspeces?: number;
}

const cleDeTri = (v: string) => v.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/\s+/g, ' ').trim();

/** Un arrêt tel qu'il s'imprime : ville et quartier lisibles, et ce que le chauffeur encaisse. */
export interface ArretPrepare {
  arret: ArretTournee;
  ville: string;
  quartier: string;
  annulee: boolean;
  paye: boolean;
  aVerifier: boolean;
  aEncaisser: number;
}

/** Les arrêts prêts à imprimer, rangés par ville puis par quartier ; l'ordre donné est gardé dans un même quartier. */
export function arretsRanges(orders: (ShopOrder | ArretTournee)[]): ArretPrepare[] {
  const arrets = (orders || []).filter(Boolean)
    .map(x => ('commande' in x && x.commande ? x as ArretTournee : { commande: x as ShopOrder }));
  const prepares = arrets.map((arret, rang) => {
    const c = arret.commande;
    const annulee = c.status === 'cancelled' || c.status === 'returned';
    const paye = arret.paiementRecu === true;
    const aEncaisser = annulee || paye ? 0
      : typeof arret.aEncaisser === 'number' && Number.isFinite(arret.aEncaisser) ? Math.max(0, arret.aEncaisser)
        : Number(c.total) || 0;
    return {
      rang,
      arret,
      ville: villeDe(c) || 'VILLE NON RENSEIGNÉE',
      quartier: textePourPdf(arret.quartier),
      annulee,
      paye,
      // Virement annoncé mais pas vu : compté dans les espèces (le pire cas, pour le plafond) et signalé.
      aVerifier: !annulee && !paye && moyenPaiementDe(c) !== 'cod',
      aEncaisser,
    };
  });
  prepares.sort((a, b) =>
    cleDeTri(a.ville).localeCompare(cleDeTri(b.ville), 'fr')
    || cleDeTri(a.quartier).localeCompare(cleDeTri(b.quartier), 'fr')
    || a.rang - b.rang);
  return prepares.map(({ rang: _rang, ...reste }) => reste);
}

/** Espèces que le chauffeur doit rapporter : la somme des arrêts à encaisser (annulés et déjà payés exclus). */
export function especesAttendues(orders: (ShopOrder | ArretTournee)[]): number {
  return arretsRanges(orders).reduce((s, a) => s + a.aEncaisser, 0);
}

async function dessinerFeuilleDeRoute(o: Outils, arrets: ArretPrepare[], opts: OptionsFeuilleDeRoute): Promise<string> {
  const { doc, c, autoTable } = o;
  const jour = dateOuMaintenant(opts.date);
  const plafond = positif(opts.plafondEspeces) ? opts.plafondEspeces : PLAFOND_ESPECES_TOURNEE;
  const actifs = arrets.filter(a => !a.annulee);
  const especes = actifs.reduce((s, a) => s + a.aEncaisser, 0);
  const colisConnus = actifs.every(a => positif(a.arret.nbColis));
  const colis = actifs.reduce((s, a) => s + (positif(a.arret.nbColis) ? a.arret.nbColis : 0), 0);
  const aVerifier = actifs.filter(a => a.aVerifier);

  let y = await c.enTeteDocument(doc, {
    titre: 'Feuille de route',
    sousTitre: `Camionnette LEBTEX — ${jourLisible(jour)}`,
    mentions: [`${actifs.length} arrêt${actifs.length > 1 ? 's' : ''}${colisConnus && colis > 0 ? ` · ${colis} colis` : ''}`],
  });

  y = bandeau(o, y,
    { etiquette: 'Tournée du', valeur: jourLisible(jour), taille: 11.5 },
    { etiquette: 'Arrêts', valeur: `${actifs.length}${colisConnus && colis > 0 ? ` · ${colis} colis` : ''}` },
    { etiquette: 'Espèces attendues', valeur: montant(especes) });

  y = rangeeDeChamps(o, y, [
    { libelle: 'Chauffeur', valeur: textePourPdf(opts.chauffeur) },
    { libelle: 'Véhicule', valeur: textePourPdf(opts.vehicule) },
    { libelle: 'Départ', valeur: textePourPdf(opts.depart) || 'LEBTEX CHRIFA (stock)' },
  ]);

  // Les deux alertes d'argent dans un même encadré : la feuille d'une tournée ordinaire tient sur une page.
  const alertes: Paragraphe[] = [];
  if (especes > plafond) {
    alertes.push({
      texte: `${montant(especes)} d’espèces attendues : au-dessus du plafond de ${montant(plafond)} par tournée. `
        + 'Avant le départ, proposer le virement aux plus grosses commandes, ou répartir sur deux tournées.',
      taille: 8.5, style: 'bold',
    });
  }
  if (aVerifier.length > 0) {
    alertes.push({
      texte: `${aVerifier.length > 1 ? `${aVerifier.length} virements annoncés ne sont` : '1 virement annoncé n’est'} pas encore vu${aVerifier.length > 1 ? 's' : ''} sur le compte : `
        + 'appeler le bureau avant de livrer. Sinon, le client paie en espèces.',
      taille: 8.5, style: 'bold', avant: alertes.length > 0 ? 1.5 : 0,
    });
  }
  if (alertes.length > 0) y = encadre(o, y, alertes, 'ambre');

  // Une ligne de titre par ville et quartier, puis les arrêts : le chauffeur suit la feuille dans l'ordre.
  type Genre = 'groupe' | 'arret' | 'alerte' | 'annulee' | 'total';
  const genres: Genre[] = [];
  const corps: any[] = [];
  let groupe: string | null = null;
  let n = 0;
  for (const a of arrets) {
    // « Aïn Sebaâ » et « ain sebaa » sont le même quartier : un seul titre, celui du premier arrêt.
    const cle = `${cleDeTri(a.ville)}|${cleDeTri(a.quartier)}`;
    if (cle !== groupe) {
      groupe = cle;
      genres.push('groupe');
      corps.push([{ content: a.quartier ? `${a.ville} — ${a.quartier.toUpperCase()}` : a.ville, colSpan: 6 }]);
    }
    const cmd = a.arret.commande;
    const telephones = telephonesImprimables(cmd);
    // Les téléphones sur une ligne : la feuille d'une tournée ordinaire tient sur une page.
    const client = [
      nomDe(cmd),
      telephones.length > 0 ? telephones.join(' / ') : 'Aucun téléphone',
      numeroDe(cmd),
      a.annulee ? 'ANNULÉE : ne pas livrer' : '',
      a.aVerifier ? `${moyenPaiementDe(cmd) === 'carte' ? 'Paiement carte' : 'Virement'} non vu : appeler le bureau` : '',
      cmd.status === 'pending' ? 'Pas encore confirmée : appeler' : '',
    ].filter(Boolean).join('\n');
    const adresse = textePourPdf(cmd.shippingAddress?.address) || 'Adresse non renseignée : appeler le client';
    const note = textePourPdf(cmd.notes);
    genres.push(a.annulee ? 'annulee' : a.aVerifier || cmd.status === 'pending' ? 'alerte' : 'arret');
    corps.push([
      String(++n),
      client,
      note ? `${adresse}\nNote : ${note.length > 160 ? `${note.slice(0, 157).trimEnd()}…` : note}` : adresse,
      positif(a.arret.nbColis) ? String(a.arret.nbColis) : '',
      a.annulee ? '—' : a.paye ? 'Déjà payé' : montant(a.aEncaisser),
      '',
    ]);
  }
  genres.push('total');
  corps.push(['', 'TOTAL', `${actifs.length} arrêt${actifs.length > 1 ? 's' : ''}`,
    colisConnus && colis > 0 ? String(colis) : '', montant(especes), '']);

  // Pas de titre de section : les lignes de ville et de quartier disent déjà comment la liste est rangée.
  y = c.reserver(doc, y, 30);
  autoTable(doc, {
    startY: y,
    margin: { left: c.MARGE, right: c.MARGE, top: c.MARGE + 2, bottom: c.HAUTEUR_PIED + 2 },
    head: [['#', 'Client', 'Adresse', 'Colis', 'À encaisser', 'Encaissé']],
    body: corps,
    ...c.STYLES_TABLEAU,
    styles: { ...c.STYLES_TABLEAU.styles, cellPadding: { top: 1.6, bottom: 1.6, left: 2.5, right: 2.5 } },
    rowPageBreak: 'avoid',
    columnStyles: {
      0: { cellWidth: 8, halign: 'center', textColor: c.ESTOMPE },
      1: { cellWidth: 50, fontStyle: 'bold' },
      2: { cellWidth: 'auto' },
      3: { cellWidth: 13, halign: 'center', fontStyle: 'bold' },
      4: { cellWidth: 27, halign: 'right', fontStyle: 'bold', textColor: c.NAVY },
      5: { cellWidth: 22 },
    },
    didParseCell: data => {
      if (data.section === 'head') {
        if (data.column.index === 3) data.cell.styles.halign = 'center';
        if (data.column.index === 4) data.cell.styles.halign = 'right';
        return;
      }
      if (data.section !== 'body') return;
      const genre = genres[data.row.index];
      if (genre === 'groupe') {
        data.cell.styles.fillColor = c.FOND;
        data.cell.styles.textColor = c.NAVY;
        data.cell.styles.fontStyle = 'bold';
        data.cell.styles.fontSize = 8;
        data.cell.styles.halign = 'left';
        data.cell.styles.cellPadding = { top: 1.2, bottom: 1.2, left: 2.5, right: 2.5 };
      } else if (genre === 'total') {
        data.cell.styles.fillColor = c.GOLD_PALE;
        data.cell.styles.textColor = c.NAVY;
        data.cell.styles.fontStyle = 'bold';
      } else if (genre === 'alerte' || genre === 'annulee') {
        data.cell.styles.textColor = BRUN;
        if (genre === 'annulee') data.cell.styles.fillColor = [255, 251, 235];
      }
    },
  });
  y = ((doc as any).lastAutoTable?.finalY ?? y) + 6;

  y = encadre(o, y, [
    { texte: 'Appeler chaque client avant de passer. Faire signer le bon de livraison ; le client paie à la remise.', taille: 7.5 },
    { texte: `Seul le chauffeur nommé ci-dessus encaisse : ${montant(plafond)} d’espèces au plus par tournée.`, taille: 7.5, style: 'bold' },
    { texte: 'Au retour, les espèces sont comptées et comparées à cette feuille, le jour même.', taille: 7.5 },
  ], 'or', undefined, 3);

  // Deux lignes par case : la feuille d'une tournée ordinaire tient sur une page, signatures comprises.
  casesSignature(o, y, [
    { titre: 'Chargé par', ton: 'or', champs: ['Nom', 'Signature'] },
    { titre: 'Chauffeur — colis reçus', ton: 'or', champs: ['Nom', 'Signature'] },
    { titre: 'Retour — espèces comptées', ton: 'nuit', champs: ['Montant', 'Signature'] },
  ]);
  return jourLisible(jour);
}

/**
 * Construit la feuille de route d'une tournée de la camionnette, sans la télécharger. Accepte des
 * commandes seules ou des arrêts (commande + colis, quartier, paiement déjà reçu). Rejette
 * « Aucune commande dans la tournée. » sur une liste vide.
 */
export async function construireFeuilleDeRoute(orders: (ShopOrder | ArretTournee)[], opts: OptionsFeuilleDeRoute = {}): Promise<jsPDF> {
  const arrets = arretsRanges(orders);
  if (arrets.length === 0) throw new Error('Aucune commande dans la tournée.');
  const o = await outils();
  const jour = await dessinerFeuilleDeRoute(o, arrets, opts);
  mentionSuite(o, `Feuille de route du ${jour}`);
  o.c.piedDeDocument(o.doc, `Feuille de route du ${jour} — document interne`);
  return o.doc;
}

/** « Feuille-de-route-2026-09-30.pdf » */
export function nomFichierFeuilleDeRoute(opts: Pick<OptionsFeuilleDeRoute, 'date'> = {}): string {
  return `Feuille-de-route-${jourIso(dateOuMaintenant(opts.date))}.pdf`;
}

/** Télécharge la feuille de route. */
export async function exporterFeuilleDeRoute(orders: (ShopOrder | ArretTournee)[], opts: OptionsFeuilleDeRoute = {}): Promise<void> {
  (await construireFeuilleDeRoute(orders, opts)).save(nomFichierFeuilleDeRoute(opts));
}

// ─── Bon de remise au transporteur ────────────────────────────────────────────

export interface OptionsBonRemiseTransporteur {
  /** Le transporteur habituel de Derb Omar qui prend la marchandise. */
  transporteur: string;
  telephoneTransporteur?: string;
  chauffeur?: string;
  /** Plaque du camion ; inconnue, la case se remplit à la main au chargement. */
  plaque?: string;
  /** Ville du dépôt d'arrivée ; par défaut la ville de la commande. */
  villeDestination?: string;
  /** Adresse du dépôt du transporteur dans cette ville, où le client récupère. */
  depot?: string;
  nbColis?: number;
  poidsKg?: number;
  /** Valeur déclarée ; par défaut ce que valent les articles (sous-total moins la réduction). */
  valeurDeclaree?: number;
  /** N° de bordereau ou d'envoi du transporteur. */
  numeroEnvoi?: string;
  /** Qui paie le transport ; par défaut, réglé avec la commande (LEBTEX paie le transporteur). */
  paiementTransport?: PaiementTransport;
  /** Prix du transport, à écrire quand le destinataire le paie à l'arrivée. */
  prixTransport?: number;
  /**
   * Ce que le transporteur encaisse auprès du destinataire pour LEBTEX, si c'est convenu avec un
   * transporteur habituel. Par défaut 0 : il n'encaisse rien (un chauffeur inconnu n'encaisse jamais).
   */
  aEncaisser?: number;
  /** Date de la remise ; par défaut maintenant. */
  remisLe?: Date | number | string;
}

async function dessinerBonRemise(o: Outils, commande: ShopOrder, opts: OptionsBonRemiseTransporteur): Promise<void> {
  const { doc, c, autoTable } = o;
  const numero = numeroDe(commande);
  const ville = textePourPdf(opts.villeDestination).toUpperCase() || villeDe(commande) || 'À PRÉCISER';
  const valeur = typeof opts.valeurDeclaree === 'number' && opts.valeurDeclaree >= 0 ? opts.valeurDeclaree : marchandiseDe(commande);
  const remis = dateOuMaintenant(opts.remisLe);

  let y = await c.enTeteDocument(doc, {
    titre: 'Bon de remise',
    sousTitre: `Au transporteur — commande n° ${numero}`,
    mentions: [`Établi le ${dateImprimee(remis)}`],
  });

  y = bandeau(o, y,
    { etiquette: 'Commande n°', valeur: numero },
    { etiquette: 'Destination', valeur: ville },
    { etiquette: 'Colis', valeur: positif(opts.nbColis) ? String(opts.nbColis) : '____' });
  y = alerteStatut(o, y, commande, 'livrer');

  const transporteur: Paragraphe[] = [
    { texte: textePourPdf(opts.transporteur) || 'Transporteur à préciser', taille: 10.5, style: 'bold', couleur: NUIT, max: 2 },
    { texte: telephoneTransporteur(opts.telephoneTransporteur), libelle: 'Tél.', decalage: 16, style: 'bold', taille: 10, max: 1, avant: 1.5 },
    { texte: textePourPdf(opts.chauffeur) || A_REMPLIR, libelle: 'Chauffeur', decalage: 16, max: 1, avant: 1 },
    { texte: textePourPdf(opts.plaque).toUpperCase() || A_REMPLIR, libelle: 'Plaque', decalage: 16, taille: 11, style: 'bold', max: 1 },
    { texte: textePourPdf(opts.depot) || `Dépôt du transporteur à ${ville}`, libelle: 'Dépôt', decalage: 16, max: 3, avant: 1 },
  ];
  const destinataire: Paragraphe[] = [
    ...contenuClient(commande, false),
    { texte: ville, taille: 10, style: 'bold', couleur: NUIT, max: 1, avant: 1 },
    {
      texte: 'Récupère la marchandise au dépôt du transporteur. Le prévenir par téléphone dès l’arrivée.',
      taille: 7.5, style: 'italic', couleur: GRIS, max: 3, avant: 1,
    },
  ];
  y = deuxEncarts(o, y,
    { etiquette: 'Transporteur', ton: 'or', contenu: transporteur },
    { etiquette: 'Destinataire — récupère au dépôt', ton: 'nuit', contenu: destinataire });

  // Ce qui a été remis, en gros : c'est ce que le transporteur signe. Une case vide se remplit au chargement.
  y = c.reserver(doc, y, 30);
  y = c.titreSection(doc, y + 2, 'Marchandise remise');
  autoTable(doc, {
    startY: y,
    margin: { left: c.MARGE, right: c.MARGE, top: c.MARGE + 2, bottom: c.HAUTEUR_PIED + 2 },
    head: [['Nombre de colis', 'Poids total', 'Valeur déclarée', 'N° d’envoi']],
    body: [[
      positif(opts.nbColis) ? String(opts.nbColis) : '',
      positif(opts.poidsKg) ? kilos(opts.poidsKg) : '',
      montant(valeur),
      textePourPdf(opts.numeroEnvoi),
    ]],
    ...c.STYLES_TABLEAU,
    bodyStyles: { fontSize: 11, fontStyle: 'bold', textColor: c.NAVY, minCellHeight: 11, halign: 'center' },
    didParseCell: data => { data.cell.styles.halign = 'center'; },
  });
  y = ((doc as any).lastAutoTable?.finalY ?? y) + 6;

  y = tableauArticles(o, y, commande, 'Contenu', false);

  const prix = Number(opts.prixTransport) || 0;
  const aEncaisser = Math.max(0, Number(opts.aEncaisser) || 0);
  y = encadre(o, y, [
    {
      texte: opts.paiementTransport === 'a_l_arrivee'
        ? `Transport : payé par le destinataire à l’arrivée${prix > 0 ? ` (${montant(prix)})` : ''}.`
        : 'Transport : réglé par LEBTEX. Rien à demander au destinataire pour le transport.',
      taille: 8.5, style: 'bold',
    },
    {
      texte: aEncaisser > 0
        ? `À encaisser auprès du destinataire, pour LEBTEX : ${montant(aEncaisser)}.`
        : 'Rien à encaisser pour LEBTEX : la marchandise se règle directement avec LEBTEX.',
      taille: 8.5, style: 'bold',
    },
    { texte: 'La valeur déclarée compte en cas de perte ou de casse. Colis et plaque photographiés au chargement.', taille: 7.5 },
  ], aEncaisser > 0 ? 'ambre' : 'or', 'Argent et responsabilité');

  casesSignature(o, y, [
    { titre: 'Remis par (LEBTEX)', ton: 'or' },
    { titre: 'Transporteur — reçu', ton: 'or' },
    { titre: 'Destinataire au dépôt', ton: 'nuit' },
  ]);
}

/** Le téléphone du transporteur au format marocain, tel qu'il l'a donné s'il n'en a pas la forme ; sinon une case à remplir. */
function telephoneTransporteur(tel?: string): string {
  const latin = chiffresLatins(tel);
  if (!latin.trim()) return A_REMPLIR;
  return /^212\d{9}$/.test(telInternational(latin)) ? telLisible(latin) : textePourPdf(tel) || A_REMPLIR;
}

/** Construit le bon de remise d'une commande au transporteur, sans le télécharger. */
export async function construireBonRemiseTransporteur(commande: ShopOrder, opts: OptionsBonRemiseTransporteur): Promise<jsPDF> {
  if (!commande) throw new Error('Aucune commande à imprimer.');
  const o = await outils();
  await dessinerBonRemise(o, commande, opts);
  mentionSuite(o, `Bon de remise ${numeroDe(commande)}`);
  const transporteur = textePourPdf(opts.transporteur).slice(0, 40);
  o.c.piedDeDocument(o.doc, `Bon de remise ${numeroDe(commande)}${transporteur ? ` — ${transporteur}` : ''}`);
  return o.doc;
}

/** « Bon-remise-transporteur-LBT-MG2K3H7P-X9QF.pdf » */
export function nomFichierBonRemiseTransporteur(commande: ShopOrder): string {
  return `Bon-remise-transporteur-${pourFichier(commande?.orderNumber, 'commande')}.pdf`;
}

/** Télécharge le bon de remise au transporteur. */
export async function exporterBonRemiseTransporteur(commande: ShopOrder, opts: OptionsBonRemiseTransporteur): Promise<void> {
  (await construireBonRemiseTransporteur(commande, opts)).save(nomFichierBonRemiseTransporteur(commande));
}
