/**
 * Le papier de la demande d'import.
 *
 * Le processus réel du métier tient en quatre temps : le magasin repère un besoin, il l'écrit
 * dans /stock, on l'imprime, le commercial le vérifie et le vise, et c'est seulement ce papier
 * visé qui part au service import. Tant que ce document n'existait pas, l'étape de vérification
 * n'avait aucun support : on envoyait des demandes que personne n'avait relues.
 *
 * Ce que ce document ne dit jamais : un prix. Ni prix de revient, ni prix d'achat, ni valeur.
 * Une demande d'import annonce un besoin de marchandise, pas un engagement d'argent — et elle
 * sort d'un écran de magasin, où les prix d'achat n'ont pas à circuler.
 *
 * La mise en page suit la charte commune (src/lib/pdf-charte-lebtex.ts), celle des documents de
 * /gestion : logo, bleu nuit et or, titres soulignés d'un filet doré, bandeau de pied de page.
 * Une demande par carte, comme la liste des besoins — pas une ligne dans un tableau à neuf
 * colonnes où les couleurs finissaient entassées dans la cellule du produit.
 */

import jsPDF from 'jspdf';
import { specificationsArticle, precisionsLigne } from '@/lib/specification-produit';
import { breakdownRowQuantity, libelleFixe } from '@/lib/warehouse-locations';
import {
  MARGE, HAUTEUR_PIED, NAVY, GOLD, AMBRE, TEXTE, ESTOMPE, BORDURE, FOND, BLANC,
  enTeteDocument, piedDeDocument, titreSection, encart, ajuster, reserver,
  tableauVentilation, type LigneVentilee,
} from '@/lib/pdf-charte-lebtex';

/** Une demande telle qu'elle est affichée au magasin, prête à imprimer. */
export interface DemandeImportAImprimer {
  /** L'article `TO_ORDER` porteur de la demande. */
  article: any;
  /** Nom français complet du produit, déjà calculé par l'écran. */
  nomProduit?: string;
  /** Magasin qui a fait la demande. */
  magasin?: string;
  /** Date de la demande (timestamp, Date ou chaîne). */
  demandeeLe?: number | string | Date | null;
  /** Ce que le magasin a écrit pour justifier le besoin. */
  justification?: string;
}

export interface OptionsDemandeImportPDF {
  /** Catalogue des familles, pour lire les caractéristiques du produit. */
  categories?: any[];
  /** Catalogue des pôles, même usage. */
  generalCategories?: any[];
  /** Ce qui distingue une impression de toute la liste d'une impression d'une seule demande. */
  sousTitre?: string;
}

const fmtQte = (n: any) =>
  (Number(n) || 0).toLocaleString('fr-MA', { maximumFractionDigits: 3 });

/** Timestamp Firestore, {seconds}, Date ou chaîne → date française lisible (— si absente). */
function fmtDate(v: any): string {
  if (!v) return '—';
  let ms = 0;
  if (typeof v?.toDate === 'function') ms = v.toDate().getTime();
  else if (typeof v?.seconds === 'number') ms = v.seconds * 1000;
  else if (typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v)) {
    const [y, m, d] = v.split('-').map(Number);
    ms = new Date(y, m - 1, d).getTime();
  } else {
    const t = new Date(v as any).getTime();
    ms = isNaN(t) ? 0 : t;
  }
  return ms ? new Date(ms).toLocaleDateString('fr-FR') : '—';
}

/**
 * Ce qu'un article ventilé demande réellement : une ligne par qualité, couleur ou taille, avec sa
 * quantité. Sans elle, une demande de dix couleurs s'imprime « various » et le commercial ne peut
 * rien vérifier. L'ordre de priorité est celui du reste du logiciel : qualité, couleur, taille.
 */
type Dimension = 'quality' | 'color' | 'size' | 'design';

function ventilation(article: any): { dimension: Dimension; mot: string; colonne: string; lignes: LigneVentilee[] } | null {
  const groupes: [Dimension, any, (row: any) => unknown, string, string][] = [
    ['quality', article?.qualityBreakdown, (r: any) => r?.quality, 'Qualités demandées', 'Qualité'],
    ['color', article?.colorBreakdown, (r: any) => r?.colorCode || r?.description || r?.color, 'Couleurs demandées', 'Couleur'],
    ['size', article?.sizeBreakdown, (r: any) => r?.size, 'Tailles demandées', 'Taille'],
    ['design', article?.designBreakdown, (r: any) => r?.designRef, 'Modèles demandés', 'Modèle'],
  ];
  for (const [dimension, rows, libelleDe, mot, colonne] of groupes) {
    const lignes = (Array.isArray(rows) ? rows : [])
      .map(row => ({ libelle: libelleFixe(libelleDe(row)) || '', quantite: breakdownRowQuantity(row) }))
      .filter(l => l.libelle !== '' || l.quantite > 0);
    if (lignes.length > 0) return { dimension, mot, colonne, lignes };
  }
  return null;
}

/**
 * Les lignes qui décrivent le produit sous son nom : ce qui est fixe (qualité, couleur ou taille
 * d'un produit qui n'en a qu'une) puis ses caractéristiques techniques.
 *
 * SEULE la dimension réellement ventilée est retirée — elle a son propre tableau juste en
 * dessous. Les autres restent : une fermeture CL-5 en taille N5 demandée en trois couleurs reste
 * une fermeture CL-5 en N5, et c'est précisément ce que le commercial vérifie avant de viser.
 */
function descriptif(
  article: any, categories: any[], generalCategories: any[], dimensionVentilee: Dimension | null,
): string[] {
  const lignes: string[] = [];
  const precisions = ([['quality', article?.quality], ['color', article?.color], ['size', article?.size]] as const)
    .filter(([dimension]) => dimension !== dimensionVentilee)
    .map(([, valeur]) => libelleFixe(valeur))
    .filter(Boolean)
    .map(v => String(v).toUpperCase());
  if (precisions.length > 0) lignes.push(precisions.join('  ·  '));

  const specs = specificationsArticle(article, categories, generalCategories)
    .filter(ligne => ligne.cle !== 'size')
    .map(ligne => `${ligne.label} ${ligne.valeur}`)
    .join('  ·  ');
  if (specs) lignes.push(specs);

  const note = libelleFixe(article?.specs);
  if (note && !lignes.includes(note)) lignes.push(note);
  return lignes;
}

/** Le double encart du haut : qui demande d'un côté, le visa du commercial de l'autre. */
function encartsIdentite(doc: jsPDF, y: number, magasin: string, nbDemandes: number): number {
  const largeurPage = doc.internal.pageSize.getWidth();
  const hauteur = 30;
  const largeurBloc = (largeurPage - 2 * MARGE - 6) / 2;

  encart(doc, {
    x: MARGE, y, largeur: largeurBloc, hauteur,
    etiquette: 'Magasin demandeur',
    ton: 'or',
    valeur: magasin || '—',
    lignes: [
      `${nbDemandes} demande${nbDemandes > 1 ? 's' : ''} sur ce document`,
      `Éditée le ${new Date().toLocaleDateString('fr-FR')}`,
    ],
  });

  const x2 = MARGE + largeurBloc + 6;
  encart(doc, {
    x: x2, y, largeur: largeurBloc, hauteur,
    etiquette: 'Visa du commercial (vérification)',
    ton: 'nuit',
    lignes: [
      'Nom : ..............................................',
      'Date : .....................   Signature :',
    ],
  });

  return y + hauteur + 8;
}

/**
 * Une demande, sous forme de carte : le numéro et la quantité tiennent les deux bords, le produit
 * et son descriptif au milieu, la justification du magasin en bas. Rend le Y de fin.
 */
function carteDemande(
  doc: jsPDF,
  demande: DemandeImportAImprimer,
  numero: number,
  y: number,
  categories: any[],
  generalCategories: any[],
): number {
  const largeurPage = doc.internal.pageSize.getWidth();
  const largeur = largeurPage - 2 * MARGE;
  const article = demande.article || {};
  const unite = (article.unitOfMeasure || 'pcs').toUpperCase();
  const nom = (demande.nomProduit || article.nameFR || article.name || '—').toUpperCase();
  const famille = String(article.categoryId || '').toUpperCase();
  const detail = ventilation(article);
  const lignesTexte = descriptif(article, categories, generalCategories, detail?.dimension ?? null);
  const justification = (demande.justification || article.notes || '').trim();

  const gauche = MARGE + 14;
  const bordDroit = largeurPage - MARGE;
  const largeurTexte = bordDroit - 34 - gauche;

  // On mesure AVANT de dessiner : le cadre doit contenir ce qu'on va y écrire. Un nom de produit
  // de quatre-vingts caractères, six caractéristiques techniques et une justification de trois
  // lignes sont le cas normal, pas l'exception — les couper en silence, c'est envoyer au
  // commercial un document qui ne dit plus ce que le magasin a demandé.
  doc.setFontSize(10.5);
  doc.setFont('helvetica', 'bold');
  const lignesNom = (doc.splitTextToSize(nom, largeurTexte) as string[]).slice(0, 2);
  doc.setFontSize(7.5);
  doc.setFont('helvetica', 'normal');
  const lignesDetail = lignesTexte.flatMap(t => (doc.splitTextToSize(t, largeurTexte) as string[]).slice(0, 2));
  const lignesJustif = justification
    ? (doc.splitTextToSize(`« ${justification} »`, largeur - 20) as string[]).slice(0, 3)
    : [];

  const hauteur = 5
    + lignesNom.length * 5
    + (famille ? 4 : 0)
    + lignesDetail.length * 4
    + 5                                   // la ligne « Demandée le … »
    + (lignesJustif.length ? lignesJustif.length * 4 + 1 : 0)
    + 3;

  // La carte et son tableau de couleurs voyagent ensemble : le tableau peut déborder sur la page
  // suivante, mais il ne doit pas COMMENCER sur une autre page que sa carte.
  const amorceTableau = detail ? 4 + 8 + Math.min(detail.lignes.length + 1, 4) * 7 : 0;
  y = reserver(doc, y, hauteur + 6 + amorceTableau);

  doc.setFillColor(...FOND);
  doc.setDrawColor(...BORDURE);
  doc.setLineWidth(0.2);
  doc.roundedRect(MARGE, y, largeur, hauteur, 2, 2, 'FD');
  doc.setFillColor(...GOLD);
  doc.roundedRect(MARGE, y, 2.5, hauteur, 1, 1, 'F');

  // Numéro de la demande, à gauche.
  doc.setFontSize(7);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(...ESTOMPE);
  doc.text(`#${numero}`, MARGE + 6, y + 8);

  // La quantité demandée : c'est le chiffre que le commercial cherche en premier.
  doc.setFontSize(15);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(...NAVY);
  doc.text(fmtQte(article.quantity), bordDroit - 4, y + 10, { align: 'right' });
  doc.setFontSize(7);
  doc.setTextColor(...ESTOMPE);
  doc.text(unite, bordDroit - 4, y + 14.5, { align: 'right' });

  let ligne = y + 8;
  doc.setFontSize(10.5);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(...NAVY);
  for (const texte of lignesNom) {
    doc.text(texte, gauche, ligne);
    ligne += 5;
  }

  if (famille) {
    doc.setFontSize(7);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(...ESTOMPE);
    doc.text(ajuster(doc, famille, largeurTexte), gauche, ligne);
    ligne += 4;
  }
  doc.setFontSize(7.5);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(...TEXTE);
  for (const texte of lignesDetail) {
    doc.text(texte, gauche, ligne);
    ligne += 4;
  }

  doc.setFontSize(7);
  doc.setTextColor(...ESTOMPE);
  doc.text(`Demandée le ${fmtDate(demande.demandeeLe ?? article.requestedAt ?? article.createdAt)}`, gauche, ligne + 1);
  ligne += 5;

  if (lignesJustif.length > 0) {
    doc.setFont('helvetica', 'italic');
    doc.setFontSize(7.5);
    doc.setTextColor(...TEXTE);
    for (const texte of lignesJustif) {
      doc.text(texte, gauche, ligne + 1);
      ligne += 4;
    }
    doc.setFont('helvetica', 'normal');
  }

  y += hauteur + 5;

  // Le détail des couleurs (ou des qualités, ou des tailles) : une ligne chacune, et un total.
  if (detail) {
    y = tableauVentilation(doc, {
      y,
      titre: detail.mot,
      colonne: detail.colonne,
      lignes: detail.lignes,
      unite: article.unitOfMeasure || 'pcs',
      x: MARGE + 6,
    });
  }

  return y + 2;
}

/**
 * Le pied du document : les étapes qui restent à faire, et le rappel qu'une demande ne commande
 * rien. C'est la phrase qui évite qu'un magasin compte sur une marchandise jamais lancée.
 */
function blocProcessus(doc: jsPDF, y: number): void {
  const largeurPage = doc.internal.pageSize.getWidth();
  const largeur = largeurPage - 2 * MARGE;
  const hauteur = 30;
  y = reserver(doc, y + 4, hauteur);

  doc.setFillColor(...FOND);
  doc.setDrawColor(...BORDURE);
  doc.setLineWidth(0.25);
  doc.roundedRect(MARGE, y, largeur, hauteur, 2, 2, 'FD');
  doc.setFillColor(...NAVY);
  doc.roundedRect(MARGE, y, largeur, 6, 1, 1, 'F');
  doc.rect(MARGE, y + 3, largeur, 3, 'F');

  doc.setFontSize(7);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(...BLANC);
  doc.text('SUITE DU PARCOURS DE CETTE DEMANDE', MARGE + 4, y + 4.5);

  doc.setFontSize(7.5);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(...ESTOMPE);
  doc.text('1. Le magasin écrit la demande dans le logiciel et imprime ce document.', MARGE + 4, y + 12);
  doc.text('2. Le commercial vérifie chaque ligne avec le magasin, puis vise le document ci-dessus.', MARGE + 4, y + 17);
  doc.text('3. Le magasin envoie alors la demande visée, et le service import décide du lancement.', MARGE + 4, y + 22);

  doc.setFont('helvetica', 'bold');
  doc.setTextColor(...AMBRE);
  doc.text("Une demande n'engage aucune commande tant que le service import ne l'a pas lancée.",
    MARGE + 4, y + 27);
}

/** Nom de fichier sans caractère qui fâche un explorateur Windows. */
function nomFichier(magasin: string, uneSeule: boolean): string {
  const propre = (magasin || 'magasin').replace(/[^a-zA-Z0-9-_]/g, '_').slice(0, 40);
  const jour = new Date().toISOString().split('T')[0];
  return `Demande-Import_${propre}${uneSeule ? '' : '_liste'}_${jour}.pdf`;
}

/**
 * Construit le document, sans le télécharger : séparé pour être relu hors du navigateur.
 */
export async function construireDemandesImportPDF(
  demandes: DemandeImportAImprimer[],
  options: OptionsDemandeImportPDF = {},
): Promise<{ doc: jsPDF; fichier: string }> {
  const liste = (demandes || []).filter(Boolean);
  const { categories = [], generalCategories = [], sousTitre } = options;

  // Regroupement par magasin, dans l'ordre d'apparition à l'écran : le commercial vise magasin
  // par magasin, et le service import reçoit des lignes qui ont toutes le même interlocuteur.
  const parMagasin = new Map<string, DemandeImportAImprimer[]>();
  for (const demande of liste) {
    const magasin = (demande.magasin || '').trim() || 'Magasin non précisé';
    const groupe = parMagasin.get(magasin);
    if (groupe) groupe.push(demande);
    else parMagasin.set(magasin, [demande]);
  }
  const groupes = Array.from(parMagasin.entries());
  const magasinEnTete = groupes.length === 1 ? groupes[0][0] : 'Plusieurs magasins';

  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });

  let y = await enTeteDocument(doc, {
    titre: "Demande d'import",
    sousTitre,
    mentions: [`${liste.length} demande${liste.length > 1 ? 's' : ''} · à vérifier avec le commercial`],
  });
  y = encartsIdentite(doc, y, magasinEnTete, liste.length);

  let numero = 0;
  for (const [magasin, demandesDuMagasin] of groupes) {
    if (groupes.length > 1) {
      y = reserver(doc, y + 2, 20);
      y = titreSection(doc, y, `${magasin} — ${demandesDuMagasin.length} demande${demandesDuMagasin.length > 1 ? 's' : ''}`);
      y += 2;
    }
    for (const demande of demandesDuMagasin) {
      numero += 1;
      y = carteDemande(doc, demande, numero, y, categories, generalCategories);
    }
  }

  blocProcessus(doc, y);
  piedDeDocument(doc, "Demande d'import — à viser par le commercial");

  return { doc, fichier: nomFichier(magasinEnTete, liste.length === 1) };
}

/**
 * Imprime une demande d'import, ou toutes celles affichées à l'écran.
 */
export async function exportDemandesImportPDF(
  demandes: DemandeImportAImprimer[],
  options: OptionsDemandeImportPDF = {},
): Promise<void> {
  if ((demandes || []).filter(Boolean).length === 0) {
    alert("Aucune demande à imprimer.");
    return;
  }
  const { doc, fichier } = await construireDemandesImportPDF(demandes, options);
  doc.save(fichier);
}
