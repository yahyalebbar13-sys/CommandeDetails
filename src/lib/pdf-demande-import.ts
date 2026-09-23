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
 * Le style suit les autres exports (src/lib/pdf-export-reports.ts) : A4, bandeau LEBTEX noir,
 * tableau autoTable aux mêmes couleurs, pied de page numéroté.
 */

import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { precisionsLigne, specificationsArticle } from '@/lib/specification-produit';
import { breakdownRowQuantity, libelleFixe } from '@/lib/warehouse-locations';

// ── Couleurs communes aux documents LEBTEX ──
const NOIR: [number, number, number] = [28, 25, 23];      // stone-900
const GRIS: [number, number, number] = [120, 113, 108];   // stone-500
const GRIS_CLAIR: [number, number, number] = [168, 162, 158]; // stone-400
const TRAIT: [number, number, number] = [214, 211, 209];  // stone-300
const FOND: [number, number, number] = [250, 250, 249];   // stone-50
const AMBRE: [number, number, number] = [217, 119, 6];    // amber-600

const MARGE = 14;

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
 * Les caractéristiques techniques du produit sur une ligne — « GSM 180 · Largeur (cm) 150 ».
 * La taille est écartée : elle a sa propre colonne, comme sur le bon de transfert.
 */
function caracteristiques(article: any, categories: any[], generalCategories: any[]): string {
  return specificationsArticle(article, categories, generalCategories)
    .filter(ligne => ligne.cle !== 'size')
    .map(ligne => `${ligne.label} ${ligne.valeur}`)
    .join(' · ');
}

/**
 * Ce qu'un article ventilé demande réellement : une ligne par qualité, couleur ou taille, avec
 * sa quantité. Sans elle, une demande de dix couleurs s'imprime « various » et le commercial ne
 * peut rien vérifier. L'ordre de priorité est celui du reste du logiciel : qualité, couleur,
 * taille.
 */
function detailVentilation(article: any, unite: string): string {
  const groupes: [any, (row: any) => unknown][] = [
    [article?.qualityBreakdown, (r: any) => r?.quality],
    [article?.colorBreakdown, (r: any) => r?.colorCode || r?.description || r?.color],
    [article?.sizeBreakdown, (r: any) => r?.size],
  ];
  for (const [rows, libelleDe] of groupes) {
    const lignes = (Array.isArray(rows) ? rows : [])
      .map(row => ({ libelle: libelleFixe(libelleDe(row)) || '', quantite: breakdownRowQuantity(row) }))
      .filter(l => l.libelle !== '' || l.quantite > 0);
    if (lignes.length === 0) continue;
    return lignes
      .map(l => (l.quantite > 0
        ? `${(l.libelle || '—').toUpperCase()} : ${fmtQte(l.quantite)} ${unite}`
        : (l.libelle || '—').toUpperCase()))
      .join('\n');
  }
  return '';
}

/**
 * Un texte ramené à la largeur disponible, en le signalant. Un nom de magasin ou de produit
 * coupé net se lit comme s'il était complet : l'ellipse dit qu'il manque quelque chose.
 */
function texteAjuste(doc: jsPDF, texte: string, largeurMax: number): string {
  const morceaux = doc.splitTextToSize(texte, largeurMax) as string[];
  if (morceaux.length <= 1) return morceaux[0] || '';
  return (doc.splitTextToSize(`${morceaux[0]} …`, largeurMax) as string[])[0] || morceaux[0];
}

/** Une valeur de colonne passée au filtre commun : « various » n'est ni une couleur ni une taille. */
const valeurImprimable = (valeur: unknown, defaut = '—'): string =>
  precisionsLigne({ color: valeur })[0] ?? defaut;

/** Bandeau LEBTEX, titre du document et sous-titre. Rend le Y où la suite peut commencer. */
function enTete(doc: jsPDF, sousTitre: string | undefined, largeur: number): number {
  doc.setFillColor(...NOIR);
  doc.rect(0, 0, largeur, 32, 'F');
  doc.setTextColor(255, 255, 255);
  doc.setFontSize(18);
  doc.setFont('helvetica', 'bold');
  doc.text('LEBTEX', MARGE, 15);
  doc.setFontSize(8);
  doc.setTextColor(...GRIS_CLAIR);
  doc.setFont('helvetica', 'normal');
  doc.text('Mercerie, fils à coudre, fermetures à glissière', MARGE, 22);
  doc.setFontSize(7);
  const maintenant = new Date();
  doc.text(
    `Édité le ${maintenant.toLocaleDateString('fr-FR')} à ${maintenant.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}`,
    largeur - MARGE, 15, { align: 'right' },
  );

  doc.setTextColor(...NOIR);
  doc.setFontSize(14);
  doc.setFont('helvetica', 'bold');
  doc.text("DEMANDE D'IMPORT", MARGE, 44);
  if (sousTitre) {
    doc.setFontSize(9);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(...GRIS);
    doc.text(texteAjuste(doc, sousTitre, largeur - 2 * MARGE), MARGE, 51);
    return 56;
  }
  return 50;
}

/**
 * Le double encart du haut : qui demande d'un côté, le visa du commercial de l'autre.
 * Le visa n'est pas une décoration — c'est l'étape qui autorise l'envoi au service import.
 */
function encartsIdentite(doc: jsPDF, y: number, largeur: number, magasin: string, nbDemandes: number): number {
  const hauteur = 26;
  const largeurBloc = (largeur - 2 * MARGE - 8) / 2;

  doc.setFillColor(...FOND);
  doc.setDrawColor(...TRAIT);
  doc.roundedRect(MARGE, y, largeurBloc, hauteur, 2, 2, 'FD');
  doc.setFontSize(7.5);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(...NOIR);
  doc.text('MAGASIN DEMANDEUR', MARGE + 4, y + 6);
  doc.setFontSize(11);
  doc.setTextColor(...AMBRE);
  doc.text(texteAjuste(doc, magasin || '—', largeurBloc - 8), MARGE + 4, y + 13);
  doc.setFontSize(7);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(...GRIS);
  doc.text(
    `${nbDemandes} demande${nbDemandes > 1 ? 's' : ''} · Date d'édition : ${new Date().toLocaleDateString('fr-FR')}`,
    MARGE + 4, y + 20,
  );

  const x2 = MARGE + largeurBloc + 8;
  doc.setFillColor(255, 255, 255);
  doc.setDrawColor(...TRAIT);
  doc.roundedRect(x2, y, largeurBloc, hauteur, 2, 2, 'FD');
  doc.setFontSize(7.5);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(...NOIR);
  doc.text('VISA DU COMMERCIAL (VÉRIFICATION)', x2 + 4, y + 6);
  doc.setFontSize(7);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(...GRIS);
  doc.text('Nom : ..........................................', x2 + 4, y + 13);
  doc.text('Date : ......................    Signature :', x2 + 4, y + 20);

  return y + hauteur + 8;
}

/** Le tableau des demandes d'un magasin. Rend le Y de fin. */
function tableauDemandes(
  doc: jsPDF,
  demandes: DemandeImportAImprimer[],
  debutY: number,
  categories: any[],
  generalCategories: any[],
): number {
  autoTable(doc, {
    startY: debutY,
    head: [['N°', 'Produit demandé', 'Qualité', 'Couleur', 'Taille', 'Qté', 'Unité', 'Demandée le', 'Justification du magasin']],
    body: demandes.map((demande, index) => {
      const article = demande.article || {};
      const unite = article.unitOfMeasure || 'pcs';
      const nom = (demande.nomProduit || article.nameFR || article.name || '—').toUpperCase();
      const specs = caracteristiques(article, categories, generalCategories);
      const detail = detailVentilation(article, unite);
      const designation = [nom, specs, detail].filter(Boolean).join('\n');
      return [
        String(index + 1),
        designation,
        valeurImprimable(article.quality),
        valeurImprimable(article.color),
        valeurImprimable(article.size),
        fmtQte(article.quantity),
        unite,
        fmtDate(demande.demandeeLe ?? article.requestedAt ?? article.createdAt),
        demande.justification || article.notes || '—',
      ];
    }),
    headStyles: {
      fillColor: NOIR,
      textColor: [255, 255, 255],
      fontStyle: 'bold',
      fontSize: 7,
      cellPadding: 3,
    },
    bodyStyles: {
      fontSize: 7,
      cellPadding: 2.5,
      textColor: NOIR,
      valign: 'top',
    },
    alternateRowStyles: { fillColor: FOND },
    columnStyles: {
      0: { cellWidth: 8, halign: 'center' },
      1: { cellWidth: 'auto', fontStyle: 'bold' },
      2: { cellWidth: 18 },
      3: { cellWidth: 18 },
      4: { cellWidth: 13 },
      5: { cellWidth: 16, halign: 'right', fontStyle: 'bold' },
      6: { cellWidth: 12 },
      7: { cellWidth: 19, halign: 'center' },
      8: { cellWidth: 34, fontStyle: 'italic' },
    },
    margin: { left: MARGE, right: MARGE },
  });
  return (doc as any).lastAutoTable?.finalY || debutY + 20;
}

/** Le titre d'une section quand plusieurs magasins figurent sur le même document. */
function titreMagasin(doc: jsPDF, y: number, magasin: string, nb: number): number {
  doc.setFontSize(9);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(...NOIR);
  doc.text(`${magasin} — ${nb} demande${nb > 1 ? 's' : ''}`, MARGE, y);
  return y + 4;
}

/**
 * Le pied du document : les étapes qui restent à faire, et le rappel qu'une demande ne commande
 * rien. C'est la phrase qui évite qu'un magasin compte sur une marchandise qui n'a jamais été
 * lancée.
 */
function blocProcessus(doc: jsPDF, y: number, largeur: number, hauteurPage: number): void {
  const hauteur = 30;
  let debut = y + 8;
  if (debut + hauteur > hauteurPage - 16) {
    doc.addPage();
    debut = 20;
  }

  doc.setFillColor(...FOND);
  doc.setDrawColor(...TRAIT);
  doc.roundedRect(MARGE, debut, largeur - 2 * MARGE, hauteur, 2, 2, 'FD');

  doc.setFontSize(7.5);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(...NOIR);
  doc.text('SUITE DU PARCOURS DE CETTE DEMANDE', MARGE + 4, debut + 6);

  doc.setFontSize(7);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(...GRIS);
  doc.text('1. Le magasin écrit la demande dans le logiciel et imprime ce document.', MARGE + 4, debut + 12);
  doc.text('2. Le commercial vérifie chaque ligne avec le magasin, puis vise le document ci-dessus.', MARGE + 4, debut + 17);
  doc.text('3. Le document visé est transmis au service import, qui décide du lancement.', MARGE + 4, debut + 22);

  doc.setFont('helvetica', 'bold');
  doc.setTextColor(...AMBRE);
  doc.text(
    "Une demande n'engage aucune commande tant qu'elle n'a pas été validée par le service import.",
    MARGE + 4, debut + 27,
  );
}

/** Numérotation de toutes les pages, une fois le document terminé. */
function numeroterPages(doc: jsPDF, largeur: number, hauteurPage: number): void {
  const total = doc.getNumberOfPages();
  for (let page = 1; page <= total; page++) {
    doc.setPage(page);
    doc.setFontSize(7);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(...GRIS_CLAIR);
    doc.text(`Page ${page} / ${total}`, largeur / 2, hauteurPage - 8, { align: 'center' });
    doc.setFontSize(6);
    doc.text(
      "LEBTEX SARL AU — Demande d'import : à vérifier avec le commercial avant transmission au service import",
      largeur / 2, hauteurPage - 4, { align: 'center' },
    );
  }
}

/** Nom de fichier sans caractère qui fâche un explorateur Windows. */
function nomFichier(magasin: string, uneSeule: boolean): string {
  const propre = (magasin || 'magasin').replace(/[^a-zA-Z0-9-_]/g, '_').slice(0, 40);
  const jour = new Date().toISOString().split('T')[0];
  return `Demande-Import_${propre}${uneSeule ? '' : '_liste'}_${jour}.pdf`;
}

/**
 * Imprime une demande d'import, ou toutes celles affichées à l'écran.
 * Les demandes de plusieurs magasins se regroupent par magasin : le commercial vise magasin par
 * magasin, et le service import reçoit des lignes qui ont toutes le même interlocuteur.
 */
export function exportDemandesImportPDF(
  demandes: DemandeImportAImprimer[],
  options: OptionsDemandeImportPDF = {},
): void {
  const liste = (demandes || []).filter(Boolean);
  if (liste.length === 0) {
    alert("Aucune demande à imprimer.");
    return;
  }

  const { categories = [], generalCategories = [], sousTitre } = options;

  // Regroupement par magasin, dans l'ordre d'apparition à l'écran.
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
  const largeur = doc.internal.pageSize.getWidth();
  const hauteur = doc.internal.pageSize.getHeight();

  let y = enTete(doc, sousTitre, largeur);
  y = encartsIdentite(doc, y, largeur, magasinEnTete, liste.length);

  groupes.forEach(([magasin, demandesDuMagasin], index) => {
    if (groupes.length > 1) {
      if (index > 0) y += 6;
      y = titreMagasin(doc, y, magasin, demandesDuMagasin.length);
    }
    y = tableauDemandes(doc, demandesDuMagasin, y, categories, generalCategories);
  });

  blocProcessus(doc, y, largeur, hauteur);
  numeroterPages(doc, largeur, hauteur);

  doc.save(nomFichier(magasinEnTete, liste.length === 1));
}
