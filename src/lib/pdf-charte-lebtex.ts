/**
 * La charte des documents imprimés LEBTEX.
 *
 * Pourquoi ce fichier : /gestion imprime depuis toujours des documents bleu nuit et or, avec le
 * logo en haut, des titres soulignés d'un filet doré et un bandeau de pied de page. /stock, lui,
 * sortait des documents noirs sans logo, et chaque export y redessinait son en-tête à sa façon.
 * Deux espaces du même logiciel, deux papiers différents — et le magasin s'en est aperçu avant
 * nous, en comparant une demande d'import à la liste des besoins de /gestion.
 *
 * Ce module ne connaît ni les articles, ni les factures, ni les demandes : il ne sait que poser
 * un en-tête, un titre de section, un encart, un tableau et un pied de page. Les documents lui
 * passent des données déjà calculées.
 */

import type jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';

export type Couleur = [number, number, number];

// ── Les couleurs de la maison ─────────────────────────────────────────────
/** Bleu nuit : titres, en-têtes de tableau, bandeau de pied de page. */
export const NAVY: Couleur = [15, 23, 42];
/** Or : filets, accents, ligne de total. Jamais pour du texte courant. */
export const GOLD: Couleur = [196, 160, 98];
/** Or très pâle : fond d'une ligne de total. */
export const GOLD_PALE: Couleur = [254, 249, 240];
/** Ambre : ce qui alerte, et seulement cela. */
export const AMBRE: Couleur = [245, 158, 11];
/** Texte courant. */
export const TEXTE: Couleur = [30, 41, 59];
/** Texte secondaire : étiquettes, mentions, dates. */
export const ESTOMPE: Couleur = [100, 116, 139];
/** Filets et contours. */
export const BORDURE: Couleur = [226, 232, 240];
/** Fond des encarts et des lignes paires. */
export const FOND: Couleur = [248, 250, 252];
export const BLANC: Couleur = [255, 255, 255];

export const MARGE = 14;

/** Hauteur du bandeau de pied de page, à réserver en bas de chaque page. */
export const HAUTEUR_PIED = 20;

/**
 * Le logo LEBTEX en haut d'un document, à sa résolution d'impression.
 *
 * `inverserEnBlanc` le repasse en blanc pour les fonds sombres. Si l'image ne charge pas — pas de
 * réseau, document généré hors navigateur — le nom s'écrit en toutes lettres : un document sans
 * en-tête n'est pas identifiable, c'est pire qu'un logo manquant.
 */
export async function addPdfLogoHeader(
  doc: any,
  x: number, y: number,
  w = 36, h = 18,
  inverserEnBlanc = false,
): Promise<void> {
  return new Promise<void>(resolve => {
    const secours = () => {
      doc.setTextColor(...(inverserEnBlanc ? BLANC : NAVY));
      doc.setFontSize(16);
      doc.setFont('helvetica', 'bold');
      doc.text('LEBTEX', x, y + 8);
      doc.setFontSize(7);
      doc.setFont('helvetica', 'normal');
      doc.setTextColor(...GOLD);
      doc.text('TEXTILE IMPORT', x, y + 13);
      resolve();
    };

    if (typeof Image === 'undefined' || typeof document === 'undefined') { secours(); return; }

    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.src = '/logo.png';
    img.onload = () => {
      try {
        // Le logo source fait 1536×1024 px : intégré tel quel, jsPDF le stocke en pixels bruts
        // (~6 Mo par PDF). On le ramène à une résolution d'impression — ~12 px/mm, soit plus de
        // 300 dpi à la taille affichée — et on compresse le flux.
        const largeurCible = Math.max(1, Math.min(img.width, Math.round(w * 12)));
        const echelle = largeurCible / img.width;
        const hauteurCible = Math.max(1, Math.round(img.height * echelle));

        const canvas = document.createElement('canvas');
        canvas.width = largeurCible;
        canvas.height = hauteurCible;
        const ctx = canvas.getContext('2d');
        if (!ctx) { doc.addImage(img, 'PNG', x, y, w, h, undefined, 'FAST'); resolve(); return; }

        ctx.drawImage(img, 0, 0, largeurCible, hauteurCible);
        if (inverserEnBlanc) {
          const pixels = ctx.getImageData(0, 0, canvas.width, canvas.height);
          const data = pixels.data;
          for (let i = 0; i < data.length; i += 4) {
            const luminosite = (data[i] + data[i + 1] + data[i + 2]) / 3;
            const alpha = data[i + 3] / 255;
            data[i] = 255; data[i + 1] = 255; data[i + 2] = 255;
            data[i + 3] = (255 - luminosite) * alpha;
          }
          ctx.putImageData(pixels, 0, 0);
        }
        doc.addImage(canvas.toDataURL('image/png'), 'PNG', x, y, w, h, undefined, 'FAST');
      } catch (_) { /* un logo raté ne doit pas empêcher le document de sortir */ }
      resolve();
    };
    img.onerror = secours;
  });
}

export interface OptionsEnTete {
  /** Le titre du document, écrit à droite en grand. */
  titre: string;
  /** Une ligne de contexte sous le titre. */
  sousTitre?: string;
  /** Lignes supplémentaires sous le sous-titre (date, nombre de lignes…). */
  mentions?: string[];
}

/**
 * L'en-tête commun : logo à gauche, titre à droite souligné d'un filet doré, mentions dessous.
 * Rend le Y où le contenu peut commencer.
 */
export async function enTeteDocument(doc: jsPDF, options: OptionsEnTete): Promise<number> {
  const largeur = doc.internal.pageSize.getWidth();
  const y = MARGE;

  try { await addPdfLogoHeader(doc, MARGE, y, 40, 20); } catch (_) {}

  doc.setTextColor(...NAVY);
  doc.setFontSize(18);
  doc.setFont('helvetica', 'bold');
  doc.text(options.titre.toUpperCase(), largeur - MARGE, y + 5, { align: 'right' });

  doc.setDrawColor(...GOLD);
  doc.setLineWidth(0.6);
  doc.line(largeur - MARGE - 78, y + 8, largeur - MARGE, y + 8);

  let ligne = y + 14;
  doc.setFontSize(8);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(...ESTOMPE);
  // Le logo occupe 40 mm à gauche : une mention plus longue que ce qui reste viendrait s'écrire
  // par-dessus.
  const largeurMention = largeur - 2 * MARGE - 46;
  for (const mention of [options.sousTitre, ...(options.mentions || [])].filter(Boolean) as string[]) {
    doc.text(ajuster(doc, mention, largeurMention), largeur - MARGE, ligne, { align: 'right' });
    ligne += 5;
  }
  return Math.max(ligne + 3, y + 28);
}

/**
 * Le bandeau de pied de page, posé sur TOUTES les pages une fois le document terminé : coordonnées
 * de la société, filet bleu nuit à accent doré, mention du document et pagination.
 */
export function piedDeDocument(doc: jsPDF, mention: string): void {
  const largeur = doc.internal.pageSize.getWidth();
  const hauteur = doc.internal.pageSize.getHeight();
  const jour = new Date().toISOString().slice(0, 10);
  const pages = doc.getNumberOfPages();

  for (let page = 1; page <= pages; page++) {
    doc.setPage(page);
    doc.setFontSize(6.5);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(...ESTOMPE);
    doc.text('LEBTEX TEXTILE IMPORT  |  31 Rue 65, Lot. Al Hamd Ain-Chock, Casablanca, Maroc',
      largeur / 2, hauteur - 14.5, { align: 'center' });
    doc.text('Tél : +212 5 22 25 77 78  |  Email : Contact.lebtex@gmail.com',
      largeur / 2, hauteur - 11, { align: 'center' });

    doc.setFillColor(...NAVY);
    doc.rect(0, hauteur - 8, largeur, 8, 'F');
    doc.setFillColor(...GOLD);
    doc.rect(0, hauteur - 8, 4, 8, 'F');
    doc.setFontSize(6.5);
    doc.setTextColor(148, 163, 184);
    doc.text(`${mention.toUpperCase()}  |  ${jour}`, MARGE + 5, hauteur - 3.5);
    doc.text(`Page ${page} / ${pages}`, largeur - MARGE, hauteur - 3.5, { align: 'right' });
  }
}

/**
 * Un titre de section, souligné d'un filet doré qui court jusqu'à la marge. Rend le Y suivant.
 * `x` suit le décalage du bloc qu'il titre : un titre calé à la marge au-dessus d'un tableau
 * décalé de six millimètres se lit comme s'il titrait autre chose.
 */
export function titreSection(doc: jsPDF, y: number, titre: string, x = MARGE): number {
  const largeur = doc.internal.pageSize.getWidth();
  doc.setFontSize(8.5);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(...NAVY);
  doc.text(titre.toUpperCase(), x, y);
  const finTitre = x + doc.getTextWidth(titre.toUpperCase()) + 3;
  doc.setDrawColor(...GOLD);
  doc.setLineWidth(0.5);
  doc.line(finTitre, y - 1, largeur - MARGE, y - 1);
  return y + 4;
}

export interface OptionsEncart {
  x: number; y: number; largeur: number; hauteur: number;
  /** L'étiquette posée sur la barre de titre de l'encart. */
  etiquette: string;
  /** Barre de titre dorée (le demandeur) ou bleu nuit (le destinataire). */
  ton?: 'or' | 'nuit';
  /** La valeur mise en avant, en gras. */
  valeur?: string;
  /** Les lignes secondaires, sous la valeur. */
  lignes?: string[];
}

/** Un encart d'identité : barre de titre colorée, une valeur en gras, des lignes dessous. */
export function encart(doc: jsPDF, o: OptionsEncart): void {
  doc.setFillColor(...FOND);
  doc.setDrawColor(...BORDURE);
  doc.setLineWidth(0.3);
  doc.roundedRect(o.x, o.y, o.largeur, o.hauteur, 1, 1, 'FD');

  const ton = o.ton === 'nuit' ? NAVY : GOLD;
  doc.setFillColor(...ton);
  doc.roundedRect(o.x, o.y, o.largeur, 6, 1, 1, 'F');
  doc.rect(o.x, o.y + 3, o.largeur, 3, 'F');

  doc.setTextColor(...(o.ton === 'nuit' ? BLANC : NAVY));
  doc.setFontSize(7);
  doc.setFont('helvetica', 'bold');
  doc.text(o.etiquette.toUpperCase(), o.x + 4, o.y + 4.5);

  let ligne = o.y + 13;
  if (o.valeur) {
    doc.setFontSize(10);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(...NAVY);
    doc.text(ajuster(doc, o.valeur, o.largeur - 8), o.x + 4, ligne);
    ligne += 6;
  }
  doc.setFontSize(7.5);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(...ESTOMPE);
  for (const texte of o.lignes || []) {
    doc.text(ajuster(doc, texte, o.largeur - 8), o.x + 4, ligne);
    ligne += 4.5;
  }
}

/** Un texte ramené à la largeur disponible, l'ellipse disant qu'il manque quelque chose. */
export function ajuster(doc: jsPDF, texte: string, largeurMax: number): string {
  const morceaux = doc.splitTextToSize(texte, largeurMax) as string[];
  if (morceaux.length <= 1) return morceaux[0] || '';
  return (doc.splitTextToSize(`${morceaux[0]} …`, largeurMax) as string[])[0] || morceaux[0];
}

/** Le style de tableau commun à tous les documents. */
export const STYLES_TABLEAU = {
  styles: {
    font: 'helvetica' as const,
    fontSize: 8,
    cellPadding: { top: 2.2, bottom: 2.2, left: 3, right: 3 },
    textColor: TEXTE,
    lineColor: BORDURE,
    lineWidth: 0.15,
    valign: 'middle' as const,
  },
  headStyles: {
    fillColor: NAVY,
    textColor: BLANC,
    fontSize: 7.5,
    fontStyle: 'bold' as const,
    halign: 'left' as const,
  },
  alternateRowStyles: { fillColor: [249, 250, 251] as Couleur },
};

/** Une ligne de ventilation prête à imprimer : un libellé, une quantité. */
export interface LigneVentilee { libelle: string; quantite: number }

export interface OptionsTableauVentilation {
  y: number;
  titre: string;
  /** L'en-tête de la colonne des libellés : « Couleur », « Qualité », « Taille »… */
  colonne: string;
  lignes: LigneVentilee[];
  unite?: string;
  /** Largeur du tableau ; par défaut toute la largeur utile. */
  largeur?: number;
  /** Décalage horizontal, pour aligner le tableau sur le contenu d'une carte. */
  x?: number;
}

const fmtQte = (n: number) => (Number(n) || 0).toLocaleString('fr-MA', { maximumFractionDigits: 3 });

/**
 * Le tableau d'une ventilation : une ligne par couleur, par qualité ou par taille, et un total.
 *
 * C'est la réponse à la façon dont ces détails s'imprimaient avant : entassés dans la cellule du
 * produit, séparés par des points, sur un document qui portait déjà neuf colonnes. Personne ne
 * lisait la troisième couleur. Ici chacune a sa ligne, et le total se vérifie d'un coup d'œil.
 */
export function tableauVentilation(doc: jsPDF, o: OptionsTableauVentilation): number {
  const lignes = (o.lignes || []).filter(l => l.libelle || l.quantite > 0);
  if (lignes.length === 0) return o.y;

  const largeurPage = doc.internal.pageSize.getWidth();
  const x = o.x ?? MARGE;
  const largeur = o.largeur ?? largeurPage - MARGE - x;
  const total = lignes.reduce((somme, l) => somme + (Number(l.quantite) || 0), 0);
  const unite = o.unite ? ` ${o.unite}` : '';

  let y = titreSection(doc, o.y, o.titre, x);

  autoTable(doc, {
    startY: y,
    margin: { left: x, right: largeurPage - x - largeur, bottom: HAUTEUR_PIED },
    tableWidth: largeur,
    head: [['#', o.colonne.toUpperCase(), 'QUANTITÉ']],
    body: [
      // Une couleur saisie sans quantité est une ligne à compléter, pas une commande de zéro.
      ...lignes.map((l, i) => [
        String(i + 1),
        (l.libelle || '—').toUpperCase(),
        l.quantite > 0 ? `${fmtQte(l.quantite)}${unite}` : 'à préciser',
      ]),
      ['', 'TOTAL', `${fmtQte(total)}${unite}`],
    ],
    ...STYLES_TABLEAU,
    columnStyles: {
      0: { cellWidth: 10, halign: 'center', textColor: ESTOMPE },
      1: { cellWidth: 'auto', fontStyle: 'bold' },
      2: { cellWidth: 34, halign: 'right', fontStyle: 'bold', textColor: NAVY },
    },
    didParseCell: data => {
      if (data.section === 'body' && data.row.index === lignes.length) {
        data.cell.styles.fillColor = GOLD_PALE;
        data.cell.styles.fontStyle = 'bold';
        data.cell.styles.textColor = NAVY;
      }
    },
  });

  y = (doc as any).lastAutoTable?.finalY ?? y;
  return y + 6;
}

/** Y a-t-il la place pour `hauteur` sur la page courante ? Sinon, page suivante. */
export function reserver(doc: jsPDF, y: number, hauteur: number): number {
  if (y + hauteur > doc.internal.pageSize.getHeight() - HAUTEUR_PIED) {
    doc.addPage();
    return MARGE;
  }
  return y;
}
