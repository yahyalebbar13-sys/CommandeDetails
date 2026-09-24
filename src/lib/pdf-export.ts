// Utility functions for PDF export using jsPDF + jspdf-autotable
// Dynamically imported to avoid SSR issues

import {
  specificationsArticle,
  specificationsEnLigne,
  qualiteDeLArticle,
  type LigneSpecification,
} from '@/lib/specification-produit';
import { breakdownRowQuantity, libelleFixe } from '@/lib/warehouse-locations';
import { addPdfLogoHeader } from './pdf-charte-lebtex';

// ── Décrire un article sur un document ─────────────────────────────────────
/**
 * Les documents qui partent chez le fournisseur, le transitaire, le client et le magasinier
 * décrivaient deux types de produits en dur — fermeture et tissu — puis retombaient sur
 * l'ancien champ texte libre `specs` que plus personne ne remplit. Un fil, un curseur, un ruban
 * ou un accessoire s'imprimait donc sans aucune caractéristique : un carton qu'on ne peut pas
 * contrôler à la réception, une commande qui ne dit pas ce qu'on veut.
 *
 * Tout ce qui décrit un article passe désormais par la brique partagée
 * src/lib/specification-produit.ts, qui lit le modèle de la famille
 * (src/lib/quality-schema.ts) : six types, chacun avec SES caractéristiques.
 *
 * Deuxième règle tenue ici : « various » est la marque interne d'un article ventilé, jamais une
 * couleur ni une taille. Un article ventilé s'imprime ligne par ligne, avec sa quantité.
 */

/**
 * Un article complété par sa ligne de qualité, pour tout ce que l'article ne porte pas lui-même.
 * Sur un article ventilé, le grammage ou la longueur vivent sur la ligne de qualité et non sur
 * l'article : sans ce complément, la brique ne reconnaîtrait pas le type d'un article que les
 * PDF reçoivent sans le catalogue des pôles, et la ligne s'imprimerait nue. Ce qui est renseigné
 * sur l'article n'est jamais écrasé.
 */
function articleComplete(article: any, ligneQualite: any): any {
  const sujet: any = { ...(article || {}) };
  for (const [cle, valeur] of Object.entries(ligneQualite || {})) {
    const actuel = sujet[cle];
    if (actuel === null || actuel === undefined || String(actuel).trim() === '') sujet[cle] = valeur;
  }
  return sujet;
}

/** Les caractéristiques d'un article — ou d'une de ses qualités — dans l'ordre de son modèle. */
export function specsArticle(article: any, ligneQualite?: any, categories: any[] = []): LigneSpecification[] {
  const sujet = ligneQualite ? articleComplete(article, ligneQualite) : article;
  return specificationsArticle(sujet, categories, [], ligneQualite);
}

/**
 * Les mêmes sur une seule ligne : « GSM 180 · Largeur (cm) 150 ».
 *
 * Plafonné à cinq caractéristiques : dans une colonne de tableau de 40 mm, les huit d'une
 * fermeture font une cellule de 40 mm de haut, et un article à quatre qualités transforme le
 * tableau en suite de pavés. Les cinq premières sont celles du modèle, donc les plus parlantes.
 */
export function specsLigne(article: any, ligneQualite?: any, categories: any[] = [], max = 5): string {
  const sujet = ligneQualite ? articleComplete(article, ligneQualite) : article;
  const lignes = specificationsArticle(sujet, categories, [], ligneQualite);
  const retenues = lignes.slice(0, max).map(l => `${l.label} ${l.valeur}`);
  if (lignes.length > max) retenues.push(`+${lignes.length - max}`);
  return retenues.join(' · ');
}

/**
 * Les mêmes intitulés en anglais : le bon de commande (Purchase Order) est rédigé en anglais
 * pour le fournisseur, il ne doit pas se mettre à parler français au milieu d'un tableau.
 */
const LABEL_SPEC_EN: Record<string, string> = {
  gsm: 'Weight (GSM)',
  fabricWidth: 'Fabric Width (cm)',
  rollLength: 'Roll Length',
  rollLengthUnit: 'Length Unit',
  packagingPerBag: 'Pcs/bag',
  length: 'Length',
  zipperType: 'Zipper Type (C/E, O/E)',
  slider: 'Slider',
  sliderType: 'Slider Type',
  tapeWeightGsm: 'Tape Weight (g/m)',
  sliderWeightG: 'Slider Weight (g)',
  pcsPerBag: 'Pcs/bag',
  bagsPerCarton: 'Bags/ctn',
  coneWeightG: 'Cone Weight (g)',
  threadWeightG: 'Thread Weight (g)',
  lengthPerPiece: 'Length / piece',
  lengthUnit: 'Length Unit',
  size: 'Size',
  width: 'Width',
  weightPerM: 'Weight / m',
  rollsPerShrink: 'Rolls/shrink',
  rollsPerCarton: 'Rolls/ctn',
  thickness: 'Thickness',
  weightPerPiece: 'Weight / pc',
  pcsPerBox: 'Pcs/box',
  boxPerCarton: 'Box/ctn',
};

export function specsArticleEn(article: any, ligneQualite?: any): [string, string][] {
  return specsArticle(article, ligneQualite).map(l => [LABEL_SPEC_EN[l.cle] || l.label, l.valeur] as [string, string]);
}

export function specsLigneEn(article: any, ligneQualite?: any): string {
  return specsArticleEn(article, ligneQualite).map(([label, valeur]) => `${label} ${valeur}`).join(' · ');
}

type DimensionVentilation = 'quality' | 'color' | 'size' | 'design';

type LigneVentilation = {
  dimension: DimensionVentilation;
  libelle: string;
  quantite: number;
  source: any;
};

/** Le mot du métier pour chaque dimension de ventilation. */
const MOT_DIMENSION: Record<DimensionVentilation, { un: string; plusieurs: string }> = {
  quality: { un: 'Qualité', plusieurs: 'Qualités' },
  color:   { un: 'Couleur', plusieurs: 'Couleurs' },
  size:    { un: 'Taille',  plusieurs: 'Tailles'  },
  design:  { un: 'Modèle',  plusieurs: 'Modèles'  },
};

function lignesDe(rows: any, dimension: DimensionVentilation, libelleDe: (row: any) => unknown): LigneVentilation[] {
  return (Array.isArray(rows) ? rows : [])
    .map(row => ({
      dimension,
      libelle: (libelleFixe(libelleDe(row)) || '').toUpperCase(),
      quantite: breakdownRowQuantity(row),
      source: row,
    }))
    .filter(l => l.libelle !== '' || l.quantite > 0);
}

/**
 * Les lignes d'un article ventilé : une par qualité, couleur ou taille, avec sa quantité.
 * L'ordre de priorité — qualité, puis couleur, puis taille — est celui du calcul du stock :
 * le papier et l'écran doivent toujours ventiler pareil. Un article non ventilé ne rend rien.
 * Les quantités des couleurs se lisent dans `rolls`, les autres dans `quantity`
 * (breakdownRowQuantity).
 */
export function lignesVentilation(article: any): LigneVentilation[] {
  const qualites = lignesDe(article?.qualityBreakdown, 'quality', (r: any) => r?.quality);
  if (qualites.length > 0) return qualites;
  const couleurs = lignesDe(article?.colorBreakdown, 'color', (r: any) => r?.colorCode || r?.description || r?.color);
  if (couleurs.length > 0) return couleurs;
  const tailles = lignesDe(article?.sizeBreakdown, 'size', (r: any) => r?.size);
  if (tailles.length > 0) return tailles;
  return lignesDe(article?.designBreakdown, 'design', (r: any) => r?.designRef);
}

/** « CL-5 — 1 200 PCS » : le libellé d'une ligne ventilée, suivi de sa quantité. */
export function texteVentilation(ligne: LigneVentilation, unite?: string): string {
  const libelle = ligne.libelle || '—';
  if (ligne.quantite <= 0) return libelle;
  return `${libelle} — ${ligne.quantite.toLocaleString('fr-MA')}${unite ? ' ' + unite : ''}`;
}

/** Plusieurs libellés dans une seule cellule, écourtés au-delà de `max` : « A · B · C · +2 ». */
/** Tronque à la largeur disponible en le signalant : un texte coupé net se lit comme complet. */
function tronquer(doc: any, texte: string, largeur: number): string {
  const morceaux = doc.splitTextToSize(texte, largeur);
  if (morceaux.length <= 1) return morceaux[0] || '';
  const premier = String(morceaux[0]);
  return doc.splitTextToSize(premier + ' …', largeur)[0] || premier;
}

export function resumeLibelles(labels: string[], max = 3): string {
  const propres = labels.map(l => String(l || '').split('\n')[0].trim()).filter(Boolean);
  if (propres.length === 0) return '—';
  const visibles = propres.slice(0, max);
  const reste = propres.length - visibles.length;
  return visibles.join(' · ') + (reste > 0 ? ` · +${reste}` : '');
}

/** La même ventilation sur une seule ligne, écourtée quand elle est longue. */
export function resumeVentilation(lignes: LigneVentilation[], unite?: string, max = 4): string {
  const visibles = lignes.slice(0, max).map(l => texteVentilation(l, unite));
  const reste = lignes.length - visibles.length;
  return visibles.join(' · ') + (reste > 0 ? ` · +${reste}` : '');
}

/**
 * La cellule d'une dimension : la ventilation ligne par ligne quand l'article en a une,
 * sinon sa valeur fixe — jamais « various ».
 */
export function celluleDimension(
  article: any,
  dimension: DimensionVentilation,
  valeurFixe: unknown,
  unite?: string,
  vide = '—',
): string {
  const lignes = lignesVentilation(article).filter(l => l.dimension === dimension);
  if (lignes.length > 0) return lignes.map(l => texteVentilation(l, unite)).join('\n');
  const fixe = libelleFixe(valeurFixe);
  return fixe ? fixe.toUpperCase() : vide;
}

/**
 * La cellule « couleur » : la ventilation par couleur, à défaut celle par modèle — un curseur
 * se commande et se reçoit par référence de modèle, c'est sa couleur à lui.
 */
export function celluleCouleur(article: any, unite?: string, vide = '—'): string {
  return celluleDimension(article, 'color', article?.color, unite, '')
    || celluleDimension(article, 'design', null, unite, '')
    || vide;
}

/**
 * Ce qu'il faut sous le nom d'un article pour le reconnaître à la réception : sa qualité, sa
 * taille et sa couleur quand elles sont fixes, ses caractéristiques techniques, puis le détail
 * de sa ventilation. Une ligne de texte par élément, à placer sous le nom.
 */
export function detailsArticle(
  article: any,
  options?: { unite?: string; max?: number; categories?: any[]; ignorer?: DimensionVentilation[] },
): string[] {
  const lignes: string[] = [];
  const ventilation = lignesVentilation(article);
  const ventilees = new Set(ventilation.map(l => l.dimension));
  // Une dimension qui a déjà sa propre colonne ne se répète pas sous le nom.
  const ignorees = new Set(options?.ignorer || []);

  const qualite = ventilees.has('quality') || ignorees.has('quality') ? null : qualiteDeLArticle(article);
  const taille = ventilees.has('size') || ignorees.has('size') ? null : libelleFixe(article?.size);
  const couleur = ventilees.has('color') || ignorees.has('color') ? null : libelleFixe(article?.color);
  const precisions = [
    qualite ? `Qualité ${qualite.toUpperCase()}` : null,
    taille ? `Taille ${taille.toUpperCase()}` : null,
    couleur ? `Couleur ${couleur.toUpperCase()}` : null,
  ].filter(Boolean) as string[];
  if (precisions.length > 0) lignes.push(precisions.join(' · '));

  const specs = specsLigne(article, undefined, options?.categories);
  if (specs) lignes.push(specs);

  if (ventilation.length > 0 && !ignorees.has(ventilation[0].dimension)) {
    const mot = MOT_DIMENSION[ventilation[0].dimension];
    const titre = ventilation.length > 1 ? mot.plusieurs : mot.un;
    lignes.push(`${titre} : ${resumeVentilation(ventilation, options?.unite, options?.max ?? 4)}`);
  }

  const note = libelleFixe(article?.specs);
  if (note) lignes.push(note);
  return lignes;
}

// ── Logo partagé ──────────────────────────────────────────────────────────
// Il vit dans la charte (src/lib/pdf-charte-lebtex.ts), avec le reste de l'identité
// imprimée : /stock a besoin du même logo sans pouvoir importer ce module-ci.
// Réexporté ici pour les documents qui l'importaient déjà de cette adresse.
export { addPdfLogoHeader } from './pdf-charte-lebtex';

export async function exportFacturePDF(facture: any, articles: any[]) {
  const { default: jsPDF } = await import('jspdf');
  const { default: autoTable } = await import('jspdf-autotable');

  const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });
  const pageW = doc.internal.pageSize.getWidth();

  // ── Header ──
  doc.setFillColor(28, 25, 23); // stone-900
  doc.rect(0, 0, pageW, 32, 'F');

  // Logo LEBTEX (coin haut gauche, sur fond sombre)
  await addPdfLogoHeader(doc, 8, 5, 38, 19);

  doc.setTextColor(251, 191, 36); // amber-400
  doc.setFontSize(8);
  doc.setFont('helvetica', 'bold');
  doc.text('DOSSIER D\'ARRIVAGE OFFICIEL', 54, 10);

  doc.setTextColor(255, 255, 255);
  doc.setFontSize(16);
  doc.text(facture.id || '', 54, 22);

  doc.setFontSize(8);
  doc.setTextColor(161, 161, 170); // stone-400
  const metaItems = [
    facture.arrivalDate ? `ETA: ${facture.arrivalDate}` : null,
    facture.supplierId ? `Fournisseur: ${facture.supplierId}` : null,
    facture.shippingLine ? `Armateur: ${facture.shippingLine}` : null,
    facture.forwarder ? `Transitaire: ${facture.forwarder}` : null,
    facture.declaringCompany ? `Soc. Déclarante: ${facture.declaringCompany}` : null,
    facture.noBL ? `N° BL: ${facture.noBL}` : null,
  ].filter(Boolean).join('   |   ');
  doc.text(metaItems, 14, 29);

  // timestamp top right
  doc.setTextColor(113, 113, 122);
  doc.setFontSize(7);
  doc.text(`Exporté le ${new Date().toLocaleDateString('fr-MA')} à ${new Date().toLocaleTimeString('fr-MA', { hour: '2-digit', minute: '2-digit' })}`, pageW - 14, 10, { align: 'right' });

  // ── Bloc financier ──
  const taux = (facture.declaredValue || 0) > 0 ? (facture.invoicePaidDhs || 0) / facture.declaredValue : 0;

  const finBlocks = [
    ['Valeur Déclarée', `${(facture.declaredValue || 0).toLocaleString('fr-MA', { maximumFractionDigits: 2 })} $`],
    ['Droits Payés', `${(facture.customsPaidDhs || 0).toLocaleString('fr-MA', { maximumFractionDigits: 0 })} MAD (auto)`],
    ['Facture Payée', `${(facture.invoicePaidDhs || 0).toLocaleString('fr-MA', { maximumFractionDigits: 2 })} MAD`],
    ['Taux de Change', taux > 0 ? `${taux.toFixed(4)} MAD/$` : '—'],
    ['Fact. Échange', `${(facture.exchangeInvoiceAmount || 0).toLocaleString('fr-MA', { maximumFractionDigits: 2 })} MAD`],
    ['Fact. Transitaire', `${(facture.supplierInvoiceAmount || 0).toLocaleString('fr-MA', { maximumFractionDigits: 2 })} MAD`],
    ['Frais Supp.', `${(facture.additionalCostsAmount || 0).toLocaleString('fr-MA', { maximumFractionDigits: 2 })} MAD`],
    ['Fret Maritime', `${(facture.freightCost || 0).toLocaleString('fr-MA', { maximumFractionDigits: 2 })} $`],
  ];

  let bx = 14;
  const by = 37;
  const bw = (pageW - 28) / finBlocks.length;

  finBlocks.forEach(([label, value]) => {
    doc.setFillColor(245, 245, 244); // stone-100
    doc.roundedRect(bx, by, bw - 2, 16, 2, 2, 'F');
    doc.setTextColor(161, 161, 170);
    doc.setFontSize(6);
    doc.setFont('helvetica', 'bold');
    doc.text(label.toUpperCase(), bx + 3, by + 5);
    doc.setTextColor(28, 25, 23);
    doc.setFontSize(8);
    doc.text(value, bx + 3, by + 12);
    bx += bw;
  });

  // ── Tableau articles ──
  const cbmTotal = articles.reduce((s, a) => s + (Number(a.cubicMeasurement) || 0), 0);

  autoTable(doc, {
    startY: 58,
    head: [[
      'Article', 'Taille', 'Couleur', 'Technique',
      'Fournisseur', 'Quantité', 'Unité', 'CBM', 'N.W (kg)',
      'P.A. Unit. ($)', 'Valeur ($)'
    ]],
    body: articles.map(a => {
      const unite = (a.unitOfMeasure || '').toUpperCase();
      // La colonne Technique porte la qualité : ventilée, une ligne par qualité avec ses
      // propres caractéristiques ; sinon la qualité de l'article et ses caractéristiques.
      const qualites = lignesVentilation(a).filter(l => l.dimension === 'quality');
      const technique: string[] = [];
      if (qualites.length > 0) {
        qualites.forEach(l => {
          const detail = specsLigne(a, l.source);
          technique.push(`${texteVentilation(l, unite)}${detail ? ` · ${detail}` : ''}`);
        });
      } else {
        const qualite = qualiteDeLArticle(a);
        if (qualite) technique.push(qualite.toUpperCase());
        const specs = specsLigne(a);
        if (specs) technique.push(specs);
      }
      const note = libelleFixe(a.specs);
      if (note) technique.push(note);

      return [
        (a.name || '').toUpperCase(),
        celluleDimension(a, 'size', a.size, unite, '-'),
        celluleCouleur(a, unite, '-'),
        technique.length > 0 ? technique.join('\n') : '-',
        (a.supplierId || '').toUpperCase(),
        Number(a.quantity).toLocaleString('fr-MA'),
        unite,
        Number(a.cubicMeasurement || 0).toFixed(4),
        Number(a.netWeight || 0).toFixed(2),
        Number(a.purchasePricePerUnit || 0).toFixed(4),
        (Number(a.quantity) * Number(a.purchasePricePerUnit)).toLocaleString('fr-MA', { maximumFractionDigits: 2 }),
      ];
    }),
    foot: [[
      `TOTAL — ${articles.length} articles`, '', '', '', '',
      articles.reduce((s, a) => s + Number(a.quantity), 0).toLocaleString('fr-MA'),
      '', cbmTotal.toFixed(3) + ' m³',
      articles.reduce((s, a) => s + Number(a.netWeight || 0), 0).toFixed(2) + ' kg',
      '',
      articles.reduce((s, a) => s + Number(a.quantity) * Number(a.purchasePricePerUnit), 0).toLocaleString('fr-MA', { maximumFractionDigits: 2 }),
    ]],
    headStyles: { fillColor: [28, 25, 23], textColor: 255, fontStyle: 'bold', fontSize: 7, cellPadding: 3 },
    footStyles: { fillColor: [251, 191, 36], textColor: [28, 25, 23], fontStyle: 'bold', fontSize: 7 },
    bodyStyles: { fontSize: 7, cellPadding: 2.5 },
    alternateRowStyles: { fillColor: [250, 250, 249] },
    columnStyles: {
      // Taille, couleur et technique peuvent désormais tenir plusieurs lignes (un article
      // ventilé s'imprime ligne par ligne) : on leur réserve leur largeur pour que les
      // colonnes chiffrées ne se retrouvent pas écrasées.
      0: { cellWidth: 36, fontStyle: 'bold' },
      1: { cellWidth: 22 },
      2: { cellWidth: 26 },
      3: { cellWidth: 50 },
      5: { halign: 'right' },
      7: { halign: 'right' },
      8: { halign: 'right' },
      9: { halign: 'right', textColor: [180, 100, 0] },
      10: { halign: 'right', fontStyle: 'bold' },
    },
    margin: { left: 14, right: 14 },
    theme: 'grid',
  });

  // page footer
  const pageCount = (doc as any).internal.getNumberOfPages();
  for (let i = 1; i <= pageCount; i++) {
    doc.setPage(i);
    doc.setFontSize(7);
    doc.setTextColor(161, 161, 170);
    doc.text(`Page ${i} / ${pageCount}  —  LEBTEX TEXTILE IMPORT`, pageW / 2, doc.internal.pageSize.getHeight() - 6, { align: 'center' });
  }

  doc.save(`Dossier_${facture.id || 'Arrivage'}_${new Date().toISOString().split('T')[0]}.pdf`);
}

export async function exportCostAnalysisPDF(
  facture: any,
  rows: any[],
  analysis: { tauxChange: number; mtFraisTotal: number; cbmTotal: number; exchange: number; transitaire: number; fraisSupp: number; fretMad: number; totalDroitsPayes: number }
) {
  const { default: jsPDF } = await import('jspdf');
  const { default: autoTable } = await import('jspdf-autotable');

  const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });
  const pageW = doc.internal.pageSize.getWidth();

  // ── Header ──
  doc.setFillColor(28, 25, 23);
  doc.rect(0, 0, pageW, 32, 'F');

  // Logo LEBTEX
  await addPdfLogoHeader(doc, 8, 5, 38, 19);

  doc.setTextColor(251, 191, 36);
  doc.setFontSize(8);
  doc.setFont('helvetica', 'bold');
  doc.text('COÛT DE REVIENT TTC — ANALYSE FINANCIÈRE', 54, 10);

  doc.setTextColor(255, 255, 255);
  doc.setFontSize(16);
  doc.text(`Dossier : ${facture.id || ''}`, 54, 22);

  doc.setFontSize(8);
  doc.setTextColor(161, 161, 170);
  doc.text(`ETA: ${facture.arrivalDate || '—'}   |   Fournisseur: ${facture.supplierId || '—'}   |   Taux de change: ${analysis.tauxChange > 0 ? analysis.tauxChange.toFixed(4) : '—'} MAD/$`, 54, 29);

  doc.setFontSize(7);
  doc.setTextColor(113, 113, 122);
  doc.text(`Exporté le ${new Date().toLocaleDateString('fr-MA')} à ${new Date().toLocaleTimeString('fr-MA', { hour: '2-digit', minute: '2-digit' })}`, pageW - 14, 10, { align: 'right' });

  // ── Synthèse frais ──
  const synBlocks = [
    ['Taux de Change', analysis.tauxChange > 0 ? `${analysis.tauxChange.toFixed(4)} MAD/$` : '—'],
    ['Fret → MAD', `${analysis.fretMad.toLocaleString('fr-MA', { maximumFractionDigits: 0 })} MAD`],
    ['Fact. Échange', `${analysis.exchange.toLocaleString('fr-MA', { maximumFractionDigits: 0 })} MAD`],
    ['Fact. Transitaire', `${analysis.transitaire.toLocaleString('fr-MA', { maximumFractionDigits: 0 })} MAD`],
    ['Frais Supp.', `${analysis.fraisSupp.toLocaleString('fr-MA', { maximumFractionDigits: 0 })} MAD`],
    ['CBM Total', `${analysis.cbmTotal.toFixed(3)} m³`],
    ['DROITS PAYÉS (ΣDI+TPI+TVA)', `${analysis.totalDroitsPayes.toLocaleString('fr-MA', { maximumFractionDigits: 0 })} MAD`],
    ['TOTAL FRAIS LOG.', `${analysis.mtFraisTotal.toLocaleString('fr-MA', { maximumFractionDigits: 0 })} MAD`],
  ];

  let bx = 14;
  const by = 37;
  const bw = (pageW - 28) / synBlocks.length;

  synBlocks.forEach(([label, value], i) => {
    const isLast = i === synBlocks.length - 1;
    const isCustoms = label.startsWith('DROITS');
    if (isLast) {
      doc.setFillColor(251, 191, 36);
    } else if (isCustoms) {
      doc.setFillColor(220, 38, 38); // red
    } else {
      doc.setFillColor(245, 245, 244);
    }
    doc.roundedRect(bx, by, bw - 2, 16, 2, 2, 'F');
    doc.setTextColor(isLast ? 28 : isCustoms ? 255 : 161, isLast ? 25 : isCustoms ? 255 : 161, isLast ? 23 : isCustoms ? 255 : 170);
    doc.setFontSize(6);
    doc.setFont('helvetica', 'bold');
    doc.text(label.toUpperCase(), bx + 3, by + 5);
    doc.setTextColor(isCustoms ? 255 : 28, isCustoms ? 255 : 25, isCustoms ? 255 : 23);
    doc.setFontSize(isLast ? 9 : 8);
    doc.text(value, bx + 3, by + 12);
    bx += bw;
  });

  // ── Tableau ──
  autoTable(doc, {
    startY: 58,
    head: [[
      'Article', 'Pôle',
      'QTÉ', 'NW (kg)', 'CBM',
      'Val. Achat\n(MAD)', 'Frais Log.\n(MAD)',
      'DI (MAD)', 'TPI (MAD)', 'TVA (MAD)', 'Tot. Douane\n(MAD)',
      'MT Total\n(MAD)', 'P.A.U TTC\n(MAD/U)'
    ]],
    body: rows.map(r => {
      // Sous le nom : qualité, taille, couleur, caractéristiques du modèle et détail de la
      // ventilation — de quoi reconnaître l'article sans ouvrir l'écran.
      const articleName = [
        (r.name || r.categoryId || '').toUpperCase(),
        ...detailsArticle(r, { unite: (r.unitOfMeasure || '').toUpperCase(), max: 3 }),
      ].filter(Boolean).join('\n');
      return [
        articleName,
      r.categoryId || '-',
      Number(r.qty).toLocaleString('fr-MA'),
      r.nw > 0 ? r.nw.toFixed(2) : '—',
      r.cbm > 0 ? r.cbm.toFixed(4) : '—',
      r.valAchatMad > 0 ? r.valAchatMad.toLocaleString('fr-MA', { maximumFractionDigits: 2 }) : '—',
      r.cbm > 0 ? r.fraisCmd.toLocaleString('fr-MA', { maximumFractionDigits: 2 }) : '—',
      r.hasCustData && r.nw > 0 ? r.di.toLocaleString('fr-MA', { maximumFractionDigits: 2 }) : '—',
      r.hasCustData && r.nw > 0 ? r.tpi.toLocaleString('fr-MA', { maximumFractionDigits: 2 }) : '—',
      r.hasCustData && r.nw > 0 ? r.tva.toLocaleString('fr-MA', { maximumFractionDigits: 2 }) : '—',
      r.hasCustData && r.nw > 0 ? r.totalDouane.toLocaleString('fr-MA', { maximumFractionDigits: 2 }) : '—',
      r.mtTotal > 0 ? r.mtTotal.toLocaleString('fr-MA', { maximumFractionDigits: 2 }) : '—',
      r.pauTtc > 0 ? r.pauTtc.toLocaleString('fr-MA', { minimumFractionDigits: 2, maximumFractionDigits: 4 }) : '—',
      ];
    }),
    headStyles: { fillColor: [28, 25, 23], textColor: 255, fontStyle: 'bold', fontSize: 6.5, cellPadding: 2.5, halign: 'center' },
    bodyStyles: { fontSize: 6.5, cellPadding: 2 },
    alternateRowStyles: { fillColor: [250, 250, 249] },
    columnStyles: {
      // La colonne Article porte maintenant le détail du produit sous son nom.
      0: { cellWidth: 44, fontStyle: 'bold' },
      1: { cellWidth: 20 },
      2: { halign: 'right' },
      3: { halign: 'right' },
      4: { halign: 'right' },
      5: { halign: 'right', textColor: [14, 116, 144] },
      6: { halign: 'right', textColor: [79, 70, 229] },
      7: { halign: 'right', textColor: [194, 65, 12] },
      8: { halign: 'right', textColor: [194, 65, 12] },
      9: { halign: 'right', textColor: [194, 65, 12] },
      10: { halign: 'right', fontStyle: 'bold', textColor: [154, 52, 18] },
      11: { halign: 'right', fontStyle: 'bold' },
      12: { halign: 'right', fontStyle: 'bold', textColor: [21, 128, 61] },
    },
    margin: { left: 14, right: 14 },
    theme: 'grid',
  });

  // Note de bas de page
  const finalY = (doc as any).lastAutoTable.finalY + 4;
  doc.setFontSize(6.5);
  doc.setTextColor(113, 113, 122);
  doc.text(
    'Formule: MT_Total = (Qté × PA$ × Taux) + Frais_Log(CBM) + Droits_Douane(DI+TPI+TVA)  —  P.A.U_TTC = MT_Total ÷ Qté',
    14, Math.min(finalY, doc.internal.pageSize.getHeight() - 14)
  );

  const pageCount = (doc as any).internal.getNumberOfPages();
  for (let i = 1; i <= pageCount; i++) {
    doc.setPage(i);
    doc.setFontSize(7);
    doc.setTextColor(161, 161, 170);
    doc.text(`Page ${i} / ${pageCount}  —  LEBTEX TEXTILE IMPORT`, pageW / 2, doc.internal.pageSize.getHeight() - 6, { align: 'center' });
  }

  doc.save(`CoutRevient_${facture.id || 'Dossier'}_${new Date().toISOString().split('T')[0]}.pdf`);
}

// ─────────────────────────────────────────────
//  PRIX DE REVIENT TTC — VERSION SIMPLIFIÉE
// ─────────────────────────────────────────────
export async function exportCoutRevientSimplePDF(
  facture: any,
  rows: any[],
  analysis: { tauxChange: number; mtFraisTotal: number; cbmTotal: number; totalDroitsPayes: number }
) {
  const { default: jsPDF } = await import('jspdf');
  const { default: autoTable } = await import('jspdf-autotable');

  const NAVY: [number, number, number] = [15, 23, 42];
  const GOLD: [number, number, number] = [196, 160, 98];
  const EMERALD: [number, number, number] = [5, 150, 105];
  const TEXT_MAIN: [number, number, number] = [30, 41, 59];
  const TEXT_MUTED: [number, number, number] = [100, 116, 139];
  const LIGHT_BG: [number, number, number] = [248, 250, 252];
  const BORDER_COLOR: [number, number, number] = [226, 232, 240];

  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
  const pageW = doc.internal.pageSize.getWidth();
  const pageH = doc.internal.pageSize.getHeight();
  const marginX = 14;
  const contentW = pageW - marginX * 2;
  const todayStr = new Date().toISOString().slice(0, 10);
  const todayFr = new Date().toLocaleDateString('fr-MA', { day: '2-digit', month: 'long', year: 'numeric' });

  let yPos = 14;

  // ── Logo / Brand ──
  await addPdfLogoHeader(doc, marginX, yPos, 40, 20);

  // ── Title right ──
  doc.setTextColor(...NAVY);
  doc.setFontSize(16);
  doc.setFont('helvetica', 'bold');
  doc.text('PRIX DE REVIENT TTC', pageW - marginX, yPos + 5, { align: 'right' });

  doc.setDrawColor(...GOLD);
  doc.setLineWidth(0.5);
  doc.line(pageW - marginX - 72, yPos + 8, pageW - marginX, yPos + 8);

  doc.setFontSize(8);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(...TEXT_MAIN);
  doc.text(`Dossier : ${(facture.id || '—').toUpperCase()}`, pageW - marginX, yPos + 14, { align: 'right' });

  doc.setFont('helvetica', 'normal');
  doc.setTextColor(...TEXT_MUTED);
  doc.text(`Date : ${todayFr}`, pageW - marginX, yPos + 19, { align: 'right' });

  yPos += 28;

  // ── Info block ──
  doc.setFillColor(...LIGHT_BG);
  doc.setDrawColor(...BORDER_COLOR);
  doc.setLineWidth(0.3);
  doc.roundedRect(marginX, yPos, contentW, 20, 1.5, 1.5, 'FD');

  const infoItems: [string, string][] = [
    ['ETA', facture.arrivalDate || '—'],
    ['Fournisseur', (facture.supplierId || '—').toUpperCase()],
    ['Taux de change', analysis.tauxChange > 0 ? `${analysis.tauxChange.toFixed(4)} MAD/$` : '—'],
    ['N° BL', facture.noBL || '—'],
  ];
  const iColW = contentW / infoItems.length;
  infoItems.forEach(([label, value], i) => {
    const ix = marginX + i * iColW + 4;
    doc.setFontSize(6.5);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(...TEXT_MUTED);
    doc.text(label.toUpperCase(), ix, yPos + 7);
    doc.setFontSize(8);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(...NAVY);
    doc.text(value.length > 20 ? value.slice(0, 19) + '…' : value, ix, yPos + 14);
  });

  yPos += 28;

  // ── KPI summary bar ──
  const totalPauSum = rows.reduce((s, r) => s + (r.mtTotal || 0), 0);
  const kpis: [string, string, [number,number,number]][] = [
    ['Total Frais Log.', `${analysis.mtFraisTotal.toLocaleString('fr-MA', { maximumFractionDigits: 0 })} MAD`, [79, 70, 229]],
    ['Droits Douane', `${analysis.totalDroitsPayes.toLocaleString('fr-MA', { maximumFractionDigits: 0 })} MAD`, [220, 38, 38]],
    ['CBM Total', `${analysis.cbmTotal.toFixed(3)} m³`, [14, 116, 144]],
    ['TOTAL COÛT REVIENT', `${totalPauSum.toLocaleString('fr-MA', { maximumFractionDigits: 0 })} MAD`, EMERALD],
  ];
  const kpiW = contentW / kpis.length;
  kpis.forEach(([label, value, color], i) => {
    const kx = marginX + i * kpiW;
    const isLast = i === kpis.length - 1;
    if (isLast) {
      doc.setFillColor(...EMERALD);
    } else {
      doc.setFillColor(color[0], color[1], color[2], 0.08 as any);
      doc.setFillColor(245, 245, 244);
    }
    doc.roundedRect(kx + (i > 0 ? 2 : 0), yPos, kpiW - 2, 16, 2, 2, 'F');
    doc.setFontSize(6);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(isLast ? 255 : color[0], isLast ? 255 : color[1], isLast ? 255 : color[2]);
    doc.text(label.toUpperCase(), kx + (i > 0 ? 5 : 3), yPos + 5.5);
    doc.setFontSize(isLast ? 9 : 8);
    doc.setTextColor(isLast ? 255 : TEXT_MAIN[0], isLast ? 255 : TEXT_MAIN[1], isLast ? 255 : TEXT_MAIN[2]);
    doc.text(value, kx + (i > 0 ? 5 : 3), yPos + 12);
  });

  yPos += 22;

  // ── Table — P.A.U TTC par article ──
  const tableRows = rows.map(r => {
    const unite = (r.unitOfMeasure || 'U').toUpperCase();
    // Technique : la qualité (ventilée, une ligne par qualité avec ses caractéristiques)
    // puis les caractéristiques du modèle de la famille. Plus de retombée sur `specs`.
    const qualites = lignesVentilation(r).filter(l => l.dimension === 'quality');
    const technique: string[] = [];
    if (qualites.length > 0) {
      qualites.forEach(l => {
        const detail = specsLigne(r, l.source);
        technique.push(`${texteVentilation(l, unite)}${detail ? ` · ${detail}` : ''}`);
      });
    } else {
      const qualite = qualiteDeLArticle(r);
      if (qualite) technique.push(qualite.toUpperCase());
      const specs = specsLigne(r);
      if (specs) technique.push(specs);
    }
    const note = libelleFixe(r.specs);
    if (note) technique.push(note);
    if (technique.length === 0) technique.push((r.name || '—').toUpperCase());

    return [
      (r.categoryId || '—').toUpperCase(),
      celluleDimension(r, 'size', r.size, unite),
      celluleCouleur(r, unite),
      technique.join('\n'),
      Number(r.qty).toLocaleString('fr-MA'),
      unite,
      r.pauTtc > 0
        ? r.pauTtc.toLocaleString('fr-MA', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
        : '—',
    ];
  });

  autoTable(doc, {
    startY: yPos,
    head: [['Catégorie', 'Taille', 'Couleur', 'Technique / Spécification', 'Quantité', 'Unité', 'P.A.U TTC (MAD)']],
    body: tableRows,
    foot: [[
      { content: `TOTAL — ${rows.length} article(s)`, colSpan: 4, styles: { halign: 'left' as const } },
      rows.reduce((s, r) => s + Number(r.qty), 0).toLocaleString('fr-MA'),
      '',
      '',
    ]],
    margin: { left: marginX, right: marginX, bottom: 45 },
    styles: {
      fontSize: 8,
      cellPadding: 3.5,
      font: 'helvetica',
      textColor: TEXT_MAIN,
      lineColor: BORDER_COLOR,
      lineWidth: 0.2,
    },
    headStyles: {
      fillColor: NAVY,
      textColor: [255, 255, 255],
      fontSize: 7.5,
      fontStyle: 'bold',
      cellPadding: 4,
    },
    footStyles: {
      fillColor: NAVY,
      textColor: [255, 255, 255],
      fontStyle: 'bold',
      fontSize: 8,
    },
    alternateRowStyles: { fillColor: LIGHT_BG },
    columnStyles: {
      // Taille et couleur peuvent tenir plusieurs lignes quand l'article est ventilé.
      0: { fontStyle: 'bold', cellWidth: 26 },
      1: { cellWidth: 22, halign: 'center' },
      2: { cellWidth: 26, halign: 'center' },
      3: { fontStyle: 'bold', cellWidth: 'auto' },
      4: { halign: 'right', cellWidth: 20 },
      5: { halign: 'center', cellWidth: 14 },
      6: { halign: 'right', fontStyle: 'bold', textColor: EMERALD, cellWidth: 30 },
    },
    theme: 'striped',
  });

  // ── Footer pages ──
  const pageCount = (doc as any).internal.getNumberOfPages();
  for (let i = 1; i <= pageCount; i++) {
    doc.setPage(i);
    doc.setFontSize(6.5);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(...TEXT_MUTED);
    doc.text('LEBTEX TEXTILE IMPORT - 31 Rue 65 Lotissement Al Hamd Ain-Chock-Casablanca-Maroc', pageW / 2, pageH - 22, { align: 'center' });
    doc.text('Tel: +212 522 25 77 78 / +212 522 31 62 88 - Email: Contact.lebtex@gmail.com', pageW / 2, pageH - 18, { align: 'center' });
    doc.text('Patente: 34011181 - R.C: 704617 - I.F: 68814237 - ICE: 003823212000094', pageW / 2, pageH - 14, { align: 'center' });

    doc.setFillColor(...NAVY);
    doc.rect(0, pageH - 10, pageW, 10, 'F');
    doc.setFillColor(...GOLD);
    doc.rect(0, pageH - 10, 4, 10, 'F');
    doc.setFontSize(7);
    doc.setTextColor(148, 163, 184);
    doc.text(`PRIX DE REVIENT TTC — Usage interne confidentiel  |  ${todayStr}`, marginX + 4, pageH - 4);
    doc.text(`Page ${i} / ${pageCount}`, pageW - marginX, pageH - 4, { align: 'right' });
  }

  doc.save(`PrixRevient_${(facture.id || 'Dossier').toUpperCase()}_${todayStr}.pdf`);
}

// ─────────────────────────────────────────────
//  COÛT DE VENTE TTC — VERSION SIMPLIFIÉE
// ─────────────────────────────────────────────
export async function exportCoutVenteSimplePDF(
  facture: any,
  rows: any[],
  analysis: { tauxChange: number; mtFraisTotal: number; cbmTotal: number; totalMarge: number; totalTVA: number }
) {
  const { default: jsPDF } = await import('jspdf');
  const { default: autoTable } = await import('jspdf-autotable');

  const NAVY: [number, number, number] = [15, 23, 42];
  const GOLD: [number, number, number] = [196, 160, 98];
  const EMERALD: [number, number, number] = [5, 150, 105];
  const AMBER: [number, number, number] = [245, 158, 11];
  const TEXT_MAIN: [number, number, number] = [30, 41, 59];
  const TEXT_MUTED: [number, number, number] = [100, 116, 139];
  const LIGHT_BG: [number, number, number] = [248, 250, 252];
  const BORDER_COLOR: [number, number, number] = [226, 232, 240];

  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
  const pageW = doc.internal.pageSize.getWidth();
  const pageH = doc.internal.pageSize.getHeight();
  const marginX = 14;
  const contentW = pageW - marginX * 2;
  const todayStr = new Date().toISOString().slice(0, 10);
  const todayFr = new Date().toLocaleDateString('fr-MA', { day: '2-digit', month: 'long', year: 'numeric' });

  let yPos = 14;

  // ── Logo / Brand ──
  await addPdfLogoHeader(doc, marginX, yPos, 40, 20);

  // ── Title right ──
  doc.setTextColor(...NAVY);
  doc.setFontSize(16);
  doc.setFont('helvetica', 'bold');
  doc.text('COÛT DE VENTE TTC', pageW - marginX, yPos + 5, { align: 'right' });

  doc.setDrawColor(...EMERALD);
  doc.setLineWidth(0.5);
  doc.line(pageW - marginX - 68, yPos + 8, pageW - marginX, yPos + 8);

  doc.setFontSize(8);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(...TEXT_MAIN);
  doc.text(`Dossier : ${(facture.id || '—').toUpperCase()}`, pageW - marginX, yPos + 14, { align: 'right' });

  doc.setFont('helvetica', 'normal');
  doc.setTextColor(...TEXT_MUTED);
  doc.text(`Date : ${todayFr}`, pageW - marginX, yPos + 19, { align: 'right' });

  yPos += 28;

  // ── Info block ──
  doc.setFillColor(...LIGHT_BG);
  doc.setDrawColor(...BORDER_COLOR);
  doc.setLineWidth(0.3);
  doc.roundedRect(marginX, yPos, contentW, 20, 1.5, 1.5, 'FD');

  const infoItems: [string, string][] = [
    ['ETA', facture.arrivalDate || '—'],
    ['Fournisseur', (facture.supplierId || '—').toUpperCase()],
    ['Taux de change', analysis.tauxChange > 0 ? `${analysis.tauxChange.toFixed(4)} MAD/$` : '—'],
    ['N° BL', facture.noBL || '—'],
  ];
  const iColW = contentW / infoItems.length;
  infoItems.forEach(([label, value], i) => {
    const ix = marginX + i * iColW + 4;
    doc.setFontSize(6.5);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(...TEXT_MUTED);
    doc.text(label.toUpperCase(), ix, yPos + 7);
    doc.setFontSize(8);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(...NAVY);
    doc.text(value.length > 20 ? value.slice(0, 19) + '…' : value, ix, yPos + 14);
  });

  yPos += 28;

  // ── KPI summary bar ──
  const totalVenteTtc = rows.reduce((s, r) => s + (r.totalVenteTtc || 0), 0);
  const kpis: [string, string, [number, number, number]][] = [
    ['Total Frais Log.', `${analysis.mtFraisTotal.toLocaleString('fr-MA', { maximumFractionDigits: 0 })} MAD`, [79, 70, 229]],
    ['Total Marge (5%)', `${analysis.totalMarge.toLocaleString('fr-MA', { maximumFractionDigits: 0 })} MAD`, EMERALD],
    ['Total TVA', `${analysis.totalTVA.toLocaleString('fr-MA', { maximumFractionDigits: 0 })} MAD`, [245, 158, 11]],
    ['TOTAL COÛT VENTE', `${totalVenteTtc.toLocaleString('fr-MA', { maximumFractionDigits: 0 })} MAD`, EMERALD],
  ];
  const kpiW = contentW / kpis.length;
  kpis.forEach(([label, value, color], i) => {
    const kx = marginX + i * kpiW;
    const isLast = i === kpis.length - 1;
    doc.setFillColor(isLast ? EMERALD[0] : 245, isLast ? EMERALD[1] : 245, isLast ? EMERALD[2] : 244);
    doc.roundedRect(kx + (i > 0 ? 2 : 0), yPos, kpiW - 2, 16, 2, 2, 'F');
    doc.setFontSize(6);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(isLast ? 255 : color[0], isLast ? 255 : color[1], isLast ? 255 : color[2]);
    doc.text(label.toUpperCase(), kx + (i > 0 ? 5 : 3), yPos + 5.5);
    doc.setFontSize(isLast ? 9 : 8);
    doc.setTextColor(isLast ? 255 : TEXT_MAIN[0], isLast ? 255 : TEXT_MAIN[1], isLast ? 255 : TEXT_MAIN[2]);
    doc.text(value, kx + (i > 0 ? 5 : 3), yPos + 12);
  });

  yPos += 22;

  // ── Table — P.V.U TTC par catégorie ──
  const tableRows = rows.map(r => [
    (r.categoryId || '—').toUpperCase(),
    r.uniqueSize ? r.uniqueSize.toUpperCase() : '—',
    r.cat?.hsCode || '—',
    r.uniqueColor ? r.uniqueColor.toUpperCase() : '—',
    Number(r.qty).toLocaleString('fr-MA'),
    (r.unit || 'U').toUpperCase(),
    r.pvuTtc > 0
      ? r.pvuTtc.toLocaleString('fr-MA', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
      : '—',
  ]);

  autoTable(doc, {
    startY: yPos,
    // La 3e colonne porte le code SH de la famille, pas une spécification : le titre le dit
    // maintenant. Ce tableau agrège par catégorie, il ne décrit pas un article.
    head: [['Catégorie', 'Taille', 'Code SH', 'Couleur', 'Quantité', 'Unité', 'P.V.U TTC (MAD)']],
    body: tableRows,
    foot: [[
      { content: `TOTAL — ${rows.length} catégorie(s)`, colSpan: 4, styles: { halign: 'left' as const } },
      { content: rows.reduce((s, r) => s + Number(r.qty), 0).toLocaleString('fr-MA'), styles: { halign: 'right' as const } },
      '',
      '',
    ]],
    margin: { left: marginX, right: marginX, bottom: 45 },
    styles: {
      fontSize: 8,
      cellPadding: 3.5,
      font: 'helvetica',
      textColor: TEXT_MAIN,
      lineColor: BORDER_COLOR,
      lineWidth: 0.2,
    },
    headStyles: {
      fillColor: NAVY,
      textColor: [255, 255, 255],
      fontSize: 7.5,
      fontStyle: 'bold',
      cellPadding: 4,
    },
    footStyles: {
      fillColor: NAVY,
      textColor: [255, 255, 255],
      fontStyle: 'bold',
      fontSize: 8,
    },
    alternateRowStyles: { fillColor: LIGHT_BG },
    columnStyles: {
      0: { fontStyle: 'bold', cellWidth: 32 },
      1: { cellWidth: 16, halign: 'center' },
      2: { cellWidth: 'auto' },
      3: { cellWidth: 20, halign: 'center' },
      4: { halign: 'right', cellWidth: 20 },
      5: { halign: 'center', cellWidth: 16 },
      6: { halign: 'right', fontStyle: 'bold', textColor: EMERALD, cellWidth: 32 },
    },
    theme: 'striped',
    didParseCell: (data: any) => {
      if (data.row.section === 'body' && data.column.index === 6 && data.cell.raw !== '—') {
        data.cell.styles.fillColor = [240, 253, 250];
      }
    },
  });

  // ── Footer pages ──
  const pageCount = (doc as any).internal.getNumberOfPages();
  for (let i = 1; i <= pageCount; i++) {
    doc.setPage(i);
    doc.setFontSize(6.5);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(...TEXT_MUTED);
    doc.text('LEBTEX TEXTILE IMPORT - 31 Rue 65 Lotissement Al Hamd Ain-Chock-Casablanca-Maroc', pageW / 2, pageH - 22, { align: 'center' });
    doc.text('Tel: +212 522 25 77 78 / +212 522 31 62 88 - Email: Contact.lebtex@gmail.com', pageW / 2, pageH - 18, { align: 'center' });
    doc.text('Patente: 34011181 - R.C: 704617 - I.F: 68814237 - ICE: 003823212000094', pageW / 2, pageH - 14, { align: 'center' });

    doc.setFillColor(...NAVY);
    doc.rect(0, pageH - 10, pageW, 10, 'F');
    doc.setFillColor(...EMERALD);
    doc.rect(0, pageH - 10, 4, 10, 'F');
    doc.setFontSize(7);
    doc.setTextColor(148, 163, 184);
    doc.text(`COÛT DE VENTE TTC — Usage interne confidentiel  |  ${todayStr}`, marginX + 4, pageH - 4);
    doc.text(`Page ${i} / ${pageCount}`, pageW - marginX, pageH - 4, { align: 'right' });
  }

  doc.save(`CoutVente_Simple_${(facture.id || 'Dossier').toUpperCase()}_${todayStr}.pdf`);
}

// ─────────────────────────────────────────────
//  DOSSIER ARTICLES — Catégorie / Taille / Description / Qté / PA TTC
// ─────────────────────────────────────────────
export async function exportDossierArticlesPDF(
  facture: any,
  rows: any[],
  tauxChange: number
) {
  const { default: jsPDF } = await import('jspdf');
  const { default: autoTable } = await import('jspdf-autotable');

  const NAVY: [number, number, number] = [15, 23, 42];
  const GOLD: [number, number, number] = [196, 160, 98];
  const TEAL: [number, number, number] = [14, 116, 144];
  const TEXT_MAIN: [number, number, number] = [30, 41, 59];
  const TEXT_MUTED: [number, number, number] = [100, 116, 139];
  const LIGHT_BG: [number, number, number] = [248, 250, 252];
  const BORDER_COLOR: [number, number, number] = [226, 232, 240];

  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
  const pageW = doc.internal.pageSize.getWidth();
  const pageH = doc.internal.pageSize.getHeight();
  const marginX = 14;
  const contentW = pageW - marginX * 2;
  const todayStr = new Date().toISOString().slice(0, 10);
  const todayFr = new Date().toLocaleDateString('fr-MA', { day: '2-digit', month: 'long', year: 'numeric' });

  let yPos = 14;

  // ── Logo / Brand ──
  await addPdfLogoHeader(doc, marginX, yPos, 40, 20);

  // ── Title right ──
  doc.setTextColor(...NAVY);
  doc.setFontSize(16);
  doc.setFont('helvetica', 'bold');
  doc.text("DOSSIER D'ARRIVAGE", pageW - marginX, yPos + 5, { align: 'right' });

  doc.setDrawColor(...GOLD);
  doc.setLineWidth(0.5);
  doc.line(pageW - marginX - 64, yPos + 8, pageW - marginX, yPos + 8);

  doc.setFontSize(8.5);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(...TEXT_MAIN);
  doc.text(`Dossier : ${(facture.id || '—').toUpperCase()}`, pageW - marginX, yPos + 14, { align: 'right' });

  doc.setFont('helvetica', 'normal');
  doc.setTextColor(...TEXT_MUTED);
  doc.text(`Date : ${todayFr}`, pageW - marginX, yPos + 19, { align: 'right' });

  yPos += 28;

  // ── Info block ──
  doc.setFillColor(...LIGHT_BG);
  doc.setDrawColor(...BORDER_COLOR);
  doc.setLineWidth(0.3);
  doc.roundedRect(marginX, yPos, contentW, 20, 1.5, 1.5, 'FD');

  const infoItems: [string, string][] = [
    ['ETA', facture.arrivalDate || '—'],
    ['Fournisseur', (facture.supplierId || '—').toUpperCase()],
    ['N° BL', facture.noBL || '—'],
    ['Armateur', (facture.shippingLine || '—').toUpperCase()],
  ];
  const iColW = contentW / infoItems.length;
  infoItems.forEach(([label, value], i) => {
    const ix = marginX + i * iColW + 4;
    doc.setFontSize(6.5);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(...TEXT_MUTED);
    doc.text(label.toUpperCase(), ix, yPos + 7);
    doc.setFontSize(8);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(...NAVY);
    doc.text(value.length > 22 ? value.slice(0, 21) + '…' : value, ix, yPos + 14);
  });

  yPos += 28;

  // ── KPI totaux ──
  const totalQty = rows.reduce((s, r) => s + Number(r.qty || r.quantity || 0), 0);
  const totalPAUMad = rows.reduce((s, r) => s + (r.mtTotal || 0), 0);

  const kpis: [string, string][] = [
    ['Nombre d\'articles', String(rows.length)],
    ['Quantité totale', totalQty.toLocaleString('fr-MA')],
    ['Taux de change', tauxChange > 0 ? `${tauxChange.toFixed(4)} MAD/$` : '—'],
    ['Total P.A. TTC', `${totalPAUMad.toLocaleString('fr-MA', { maximumFractionDigits: 0 })} MAD`],
  ];
  const kpiW = contentW / kpis.length;
  kpis.forEach(([label, value], i) => {
    const kx = marginX + i * kpiW;
    const isLast = i === kpis.length - 1;
    doc.setFillColor(isLast ? 14 : 245, isLast ? 116 : 245, isLast ? 144 : 244);
    doc.roundedRect(kx + (i > 0 ? 2 : 0), yPos, kpiW - 2, 16, 2, 2, 'F');
    doc.setFontSize(6);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(isLast ? 255 : 161, isLast ? 255 : 161, isLast ? 255 : 170);
    doc.text(label.toUpperCase(), kx + (i > 0 ? 5 : 3), yPos + 5.5);
    doc.setFontSize(isLast ? 9 : 8);
    doc.setTextColor(isLast ? 255 : TEXT_MAIN[0], isLast ? 255 : TEXT_MAIN[1], isLast ? 255 : TEXT_MAIN[2]);
    doc.text(value, kx + (i > 0 ? 5 : 3), yPos + 12);
  });

  yPos += 22;

  // ── Table principale ──
  const tableRows = rows.map(r => {
    const qty = Number(r.qty || r.quantity || 0);
    const pauDollar = Number(r.pauDollar || r.purchasePricePerUnit || 0);
    const pauMad = r.pauTtc > 0 ? r.pauTtc : (tauxChange > 0 && pauDollar > 0 ? pauDollar * tauxChange : 0);
    const unite = (r.unitOfMeasure || 'U').toUpperCase();
    // La description porte le nom, puis ce qui identifie vraiment la marchandise :
    // qualité, couleur, caractéristiques du modèle, et le détail de la ventilation.
    const description = [
      (r.name || r.categoryId || '—').toUpperCase(),
      ...detailsArticle(r, { unite, max: 6, ignorer: ['size'] }),
    ].filter(Boolean).join('\n');
    return [
      (r.categoryId || '—').toUpperCase(),
      celluleDimension(r, 'size', r.size, unite),
      description,
      qty.toLocaleString('fr-MA'),
      unite,
      pauMad > 0
        ? pauMad.toLocaleString('fr-MA', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
        : '—',
    ];
  });

  autoTable(doc, {
    startY: yPos,
    head: [['Catégorie', 'Taille', 'Description', 'Quantité', 'Unité', 'P.A. Unit. TTC (MAD)']],
    body: tableRows,
    foot: [[
      { content: `TOTAL — ${rows.length} article(s)`, colSpan: 3, styles: { halign: 'left' as const } },
      { content: totalQty.toLocaleString('fr-MA'), styles: { halign: 'right' as const, fontStyle: 'bold' as const } },
      '',
      { content: `${totalPAUMad.toLocaleString('fr-MA', { maximumFractionDigits: 0 })} MAD`, styles: { halign: 'right' as const, fontStyle: 'bold' as const } },
    ]],
    margin: { left: marginX, right: marginX, bottom: 45 },
    styles: {
      fontSize: 8.5,
      cellPadding: 4.5,
      font: 'helvetica',
      textColor: TEXT_MAIN,
      lineColor: BORDER_COLOR,
      lineWidth: 0.2,
    },
    headStyles: {
      fillColor: NAVY,
      textColor: [255, 255, 255],
      fontSize: 8,
      fontStyle: 'bold',
      cellPadding: 5,
    },
    footStyles: {
      fillColor: NAVY,
      textColor: [255, 255, 255],
      fontStyle: 'bold',
      fontSize: 8.5,
    },
    alternateRowStyles: { fillColor: LIGHT_BG },
    columnStyles: {
      // La colonne Taille liste les tailles d'un article ventilé : elle a besoin d'air.
      0: { fontStyle: 'bold', cellWidth: 30 },
      1: { cellWidth: 28, halign: 'center' },
      2: { fontStyle: 'bold' },
      3: { halign: 'right', cellWidth: 22 },
      4: { halign: 'center', cellWidth: 14 },
      5: { halign: 'right', fontStyle: 'bold', textColor: TEAL, cellWidth: 34 },
    },
    theme: 'striped',
    didParseCell: (data: any) => {
      if (data.row.section === 'body' && data.column.index === 5 && data.cell.raw !== '—') {
        data.cell.styles.fillColor = [240, 253, 250];
      }
    },
  });

  // ── Note confidentialité ──
  const finalY = (doc as any).lastAutoTable.finalY + 6;
  if (finalY < pageH - 50) {
    doc.setFontSize(7);
    doc.setFont('helvetica', 'italic');
    doc.setTextColor(...TEXT_MUTED);
    doc.text('Document à usage interne — Les prix de revient TTC incluent achat, frais logistiques et droits de douane.', marginX, finalY);
  }

  // ── Footer pages ──
  const pageCount = (doc as any).internal.getNumberOfPages();
  for (let i = 1; i <= pageCount; i++) {
    doc.setPage(i);
    doc.setFontSize(6.5);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(...TEXT_MUTED);
    doc.text('LEBTEX TEXTILE IMPORT - 31 Rue 65 Lotissement Al Hamd Ain-Chock-Casablanca-Maroc', pageW / 2, pageH - 22, { align: 'center' });
    doc.text('Tel: +212 522 25 77 78 / +212 522 31 62 88 - Email: Contact.lebtex@gmail.com', pageW / 2, pageH - 18, { align: 'center' });
    doc.text('Patente: 34011181 - R.C: 704617 - I.F: 68814237 - ICE: 003823212000094', pageW / 2, pageH - 14, { align: 'center' });

    doc.setFillColor(...NAVY);
    doc.rect(0, pageH - 10, pageW, 10, 'F');
    doc.setFillColor(...GOLD);
    doc.rect(0, pageH - 10, 4, 10, 'F');
    doc.setFontSize(7);
    doc.setTextColor(148, 163, 184);
    doc.text(`DOSSIER ARRIVAGE — Usage interne confidentiel  |  ${todayStr}`, marginX + 4, pageH - 4);
    doc.text(`Page ${i} / ${pageCount}`, pageW - marginX, pageH - 4, { align: 'right' });
  }

  doc.save(`Dossier_Articles_${(facture.id || 'Dossier').toUpperCase()}_${todayStr}.pdf`);
}

export async function exportCostSalePDF(
  facture: any,
  rows: any[],
  analysis: { tauxChange: number; mtFraisTotal: number; cbmTotal: number; exchange: number; transitaire: number; fraisSupp: number; fretMad?: number; totalMarge: number; totalTVA: number }
) {
  const { default: jsPDF } = await import('jspdf');
  const { default: autoTable } = await import('jspdf-autotable');

  const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });
  const pageW = doc.internal.pageSize.getWidth();

  // ── Header ──
  doc.setFillColor(28, 25, 23);
  doc.rect(0, 0, pageW, 32, 'F');
  doc.setFillColor(16, 185, 129); // emerald stripe
  doc.rect(0, 30, pageW, 2, 'F');

  doc.setTextColor(16, 185, 129);
  doc.setFontSize(8);
  doc.setFont('helvetica', 'bold');
  doc.text('COÛT DE VENTE TTC — ANALYSE FINANCIÈRE', 14, 10);

  doc.setTextColor(255, 255, 255);
  doc.setFontSize(18);
  doc.text(`Dossier : ${facture.id || ''}`, 14, 22);

  doc.setFontSize(8);
  doc.setTextColor(161, 161, 170);
  doc.text(`ETA: ${facture.arrivalDate || '—'}   |   Fournisseur: ${facture.supplierId || '—'}   |   Taux de change: ${analysis.tauxChange > 0 ? analysis.tauxChange.toFixed(4) : '—'} MAD/$   |   Marge: 5%`, 14, 29);

  doc.setFontSize(7);
  doc.setTextColor(113, 113, 122);
  doc.text(`Exporté le ${new Date().toLocaleDateString('fr-MA')} à ${new Date().toLocaleTimeString('fr-MA', { hour: '2-digit', minute: '2-digit' })}`, pageW - 14, 10, { align: 'right' });

  // ── Synthèse frais ──
  const synBlocks: [string, string][] = [
    ['Taux de Change', analysis.tauxChange > 0 ? `${analysis.tauxChange.toFixed(4)} MAD/$` : '—'],
    ['Fret → MAD (HT)', `${(analysis.fretMad ?? 0).toLocaleString('fr-MA', { maximumFractionDigits: 0 })} MAD`],
    ['Fact. Échange (TTC)', `${analysis.exchange.toLocaleString('fr-MA', { maximumFractionDigits: 0 })} MAD`],
    ['Fact. Transitaire (TTC)', `${analysis.transitaire.toLocaleString('fr-MA', { maximumFractionDigits: 0 })} MAD`],
    ['Frais Supp. (TTC)', `${analysis.fraisSupp.toLocaleString('fr-MA', { maximumFractionDigits: 0 })} MAD`],
    ['CBM Total', `${analysis.cbmTotal.toFixed(3)} m³`],
    ['TOTAL MARGE (5%)', `${analysis.totalMarge.toLocaleString('fr-MA', { maximumFractionDigits: 0 })} MAD`],
    ['TOTAL TVA', `${analysis.totalTVA.toLocaleString('fr-MA', { maximumFractionDigits: 0 })} MAD`],
  ];

  let bx = 14;
  const by = 37;
  const bw = (pageW - 28) / synBlocks.length;

  synBlocks.forEach(([label, value], i) => {
    const isLast = i === synBlocks.length - 1;
    const isMargin = label.startsWith('TOTAL MARGE');
    if (isLast) doc.setFillColor(251, 191, 36);
    else if (isMargin) doc.setFillColor(16, 185, 129);
    else doc.setFillColor(245, 245, 244);
    doc.roundedRect(bx, by, bw - 2, 16, 2, 2, 'F');
    doc.setTextColor(isLast || isMargin ? 255 : 161, isLast || isMargin ? 255 : 161, isLast || isMargin ? 255 : 170);
    doc.setFontSize(6);
    doc.setFont('helvetica', 'bold');
    doc.text(label.toUpperCase(), bx + 3, by + 5);
    doc.setTextColor(isMargin ? 255 : 28, isMargin ? 255 : 25, isMargin ? 255 : 23);
    doc.setFontSize(isLast ? 9 : 8);
    doc.text(value, bx + 3, by + 12);
    bx += bw;
  });

  // ── Tableau ──
  autoTable(doc, {
    startY: 58,
    head: [[
      'Article', 'Pôle',
      'QTÉ', 'NW (kg)', 'CBM',
      'Val. Achat\n(MAD)', 'Frais Log.\n(MAD)',
      'DI (MAD)', 'TPI (MAD)', 'TIC (MAD)',
      'Total HT\n(MAD)', 'Marge 5%\n(MAD)', 'Base TVA\n(MAD)', 'TVA\n(MAD)',
      'P.V.U TTC\n(MAD/U)'
    ]],
    body: rows.map(r => {
      // Ce tableau agrège parfois plusieurs articles d'une même famille : on descend alors la
      // taille et la couleur communes, sinon le détail de l'article lui-même.
      const unite = (r.unit || r.unitOfMeasure || '').toUpperCase();
      const communs = [
        !libelleFixe(r.size) && libelleFixe(r.uniqueSize) ? `Taille ${libelleFixe(r.uniqueSize)!.toUpperCase()}` : null,
        !libelleFixe(r.color) && libelleFixe(r.uniqueColor) ? `Couleur ${libelleFixe(r.uniqueColor)!.toUpperCase()}` : null,
      ].filter(Boolean).join(' · ');
      const articleName = [
        (r.name || r.categoryId || '').toUpperCase(),
        communs || null,
        ...detailsArticle(r, { unite, max: 3 }),
      ].filter(Boolean).join('\n');
      return [
        articleName,
        r.categoryId || '-',
        Number(r.qty).toLocaleString('fr-MA'),
        r.nw > 0 ? r.nw.toFixed(2) : '—',
        r.cbm > 0 ? r.cbm.toFixed(4) : '—',
        r.valAchatMad > 0 ? r.valAchatMad.toLocaleString('fr-MA', { maximumFractionDigits: 2 }) : '—',
        r.cbm > 0 ? r.fraisCmd.toLocaleString('fr-MA', { maximumFractionDigits: 2 }) : '—',
        r.hasCustData && r.nw > 0 ? r.di.toLocaleString('fr-MA', { maximumFractionDigits: 2 }) : '—',
        r.hasCustData && r.nw > 0 ? r.tpi.toLocaleString('fr-MA', { maximumFractionDigits: 2 }) : '—',
        r.hasCustData && r.nw > 0 ? r.tic.toLocaleString('fr-MA', { maximumFractionDigits: 2 }) : '—',
        r.totalHT > 0 ? r.totalHT.toLocaleString('fr-MA', { maximumFractionDigits: 2 }) : '—',
        r.marge > 0 ? r.marge.toLocaleString('fr-MA', { maximumFractionDigits: 2 }) : '—',
        r.baseTva > 0 ? r.baseTva.toLocaleString('fr-MA', { maximumFractionDigits: 2 }) : '—',
        r.hasCustData && r.tvaRate != null ? r.tva.toLocaleString('fr-MA', { maximumFractionDigits: 2 }) : '—',
        r.pvuTtc > 0 ? r.pvuTtc.toLocaleString('fr-MA', { minimumFractionDigits: 2, maximumFractionDigits: 4 }) : '—',
      ];
    }),
    headStyles: { fillColor: [28, 25, 23], textColor: 255, fontStyle: 'bold', fontSize: 6, cellPadding: 2, halign: 'center' },
    bodyStyles: { fontSize: 6, cellPadding: 2 },
    alternateRowStyles: { fillColor: [250, 250, 249] },
    columnStyles: {
      // La colonne Article porte maintenant le détail du produit sous son nom.
      0: { cellWidth: 34, fontStyle: 'bold' },
      1: { cellWidth: 16 },
      2: { halign: 'right' },
      3: { halign: 'right' },
      4: { halign: 'right' },
      5: { halign: 'right', textColor: [14, 116, 144] },
      6: { halign: 'right', textColor: [79, 70, 229] },
      7: { halign: 'right', textColor: [194, 65, 12] },
      8: { halign: 'right', textColor: [194, 65, 12] },
      9: { halign: 'right', textColor: [194, 65, 12] },
      10: { halign: 'right', fontStyle: 'bold' },
      11: { halign: 'right', textColor: [5, 150, 105], fontStyle: 'bold' },
      12: { halign: 'right', textColor: [4, 120, 87] },
      13: { halign: 'right', textColor: [180, 100, 0] },
      14: { halign: 'right', fontStyle: 'bold', textColor: [4, 120, 87] },
    },
    margin: { left: 14, right: 14 },
    theme: 'grid',
  });

  const finalY = (doc as any).lastAutoTable.finalY + 4;
  doc.setFontSize(6.5);
  doc.setTextColor(113, 113, 122);
  doc.text(
    'Formule: Total_HT = (Qté×PA$×Taux) + Frais_Log(HT) + DI + TPI + TIC  —  Marge = HT×5%  —  Base_TVA = HT+Marge  —  PVU_TTC = (HT+Marge+TVA) ÷ Qté',
    14, Math.min(finalY, doc.internal.pageSize.getHeight() - 14)
  );

  const pageCount = (doc as any).internal.getNumberOfPages();
  for (let i = 1; i <= pageCount; i++) {
    doc.setPage(i);
    doc.setFontSize(7);
    doc.setTextColor(161, 161, 170);
    doc.text(`Page ${i} / ${pageCount}  —  LEBTEX TEXTILE IMPORT`, pageW / 2, doc.internal.pageSize.getHeight() - 6, { align: 'center' });
  }

  doc.save(`CoutVente_${facture.id || 'Dossier'}_${new Date().toISOString().split('T')[0]}.pdf`);
}

// ─────────────────────────────────────────────
//  CUSTOMS DECLARATION (OFFICIAL)
// ─────────────────────────────────────────────
export async function exportDPPDF(
  facture: any,
  lines: Array<{
    categoryId: string;
    totalQty: number;
    totalNW: number;
    unit: string;
    puNum: number;
    mt: number;
  }>,
  freightValue: number = 0
) {
  const { default: jsPDF } = await import('jspdf');
  const { default: autoTable } = await import('jspdf-autotable');

  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
  const pageW = doc.internal.pageSize.getWidth();
  const pageH = doc.internal.pageSize.getHeight();
  const marginX = 16;
  const contentW = pageW - marginX * 2;

  const NAVY: [number, number, number] = [15, 23, 42];
  const GOLD: [number, number, number] = [196, 160, 98];
  const BLUE: [number, number, number] = [37, 99, 235];
  const TEXT_MUTED: [number, number, number] = [100, 116, 139];
  const TEXT_MAIN: [number, number, number] = [30, 41, 59];
  const LIGHT_BG: [number, number, number] = [248, 250, 252];
  const BORDER_COLOR: [number, number, number] = [226, 232, 240];

  const todayStr = new Date().toISOString().slice(0, 10);
  const todayEn = new Date().toLocaleDateString('en-GB', { day: '2-digit', month: 'long', year: 'numeric' });
  const ref = `DECL-${(facture.id || 'X').toUpperCase()}-${Date.now().toString().slice(-6)}`;

  const totalQty = lines.reduce((s, l) => s + l.totalQty, 0);
  const totalMT = lines.filter(l => l.puNum > 0).reduce((s, l) => s + l.mt, 0);
  const validLines = lines.filter(l => l.puNum > 0);
  // Valeur déclarée en douane depuis le dossier ($)
  const declaredValueDollar = Number(facture.declaredValue) || 0;

  let yPos = 16;

  // ── Logo ──
  await addPdfLogoHeader(doc, marginX, yPos, 40, 20);

  // ── Title (right) ──
  doc.setTextColor(...NAVY);
  doc.setFontSize(20);
  doc.setFont('helvetica', 'bold');
  doc.text('CUSTOMS DECLARATION', pageW - marginX, yPos + 6, { align: 'right' });

  doc.setDrawColor(...GOLD);
  doc.setLineWidth(0.6);
  doc.line(pageW - marginX - 85, yPos + 9, pageW - marginX, yPos + 9);

  doc.setFontSize(9);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(...TEXT_MAIN);
  doc.text(`Ref. : ${ref}`, pageW - marginX, yPos + 15, { align: 'right' });

  doc.setFont('helvetica', 'normal');
  doc.setTextColor(...TEXT_MUTED);
  doc.text(`Date : ${todayEn}`, pageW - marginX, yPos + 20, { align: 'right' });

  yPos += 32;

  // ── Shipment info block ──
  doc.setFillColor(...LIGHT_BG);
  doc.setDrawColor(...BORDER_COLOR);
  doc.setLineWidth(0.3);
  doc.roundedRect(marginX, yPos, contentW, 26, 1.5, 1.5, 'FD');

  // Shipment ID
  doc.setFontSize(7);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(...TEXT_MUTED);
  doc.text('SHIPMENT NO.', marginX + 4, yPos + 6);
  doc.setFontSize(12);
  doc.setTextColor(...NAVY);
  doc.text((facture.id || '—').toUpperCase(), marginX + 4, yPos + 14);

  const infoCols: [string, string][] = [
    ['ARRIVAL DATE', facture.arrivalDate || '—'],
    ['SUPPLIER', (facture.supplierId || '—').toUpperCase()],
    ['B/L NUMBER', facture.noBL || '—'],
  ];
  const colW = (contentW - 52) / infoCols.length;
  let cx = marginX + 52;
  infoCols.forEach(([label, value]) => {
    doc.setFontSize(7);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(...TEXT_MUTED);
    doc.text(label, cx, yPos + 6);
    doc.setFontSize(8.5);
    doc.setTextColor(...TEXT_MAIN);
    doc.setFont('helvetica', 'bold');
    doc.text(value.length > 18 ? value.slice(0, 17) + '…' : value, cx, yPos + 14);
    cx += colW;
  });

  yPos += 34;

  // ── Table — NO NW column ──
  const freightNote = freightValue > 0
    ? `Incoterm: CFR  |  Freight Included: ${freightValue.toLocaleString('fr-MA', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} USD`
    : 'Incoterm: CFR  |  Freight Included';

  autoTable(doc, {
    startY: yPos,
    head: [['Description', 'Quantity', 'Unit', 'Unit Price (USD)', 'Total Amount (USD)']],
    body: validLines.map(l => [
      l.categoryId.toUpperCase(),
      l.totalQty.toLocaleString('fr-MA'),
      l.unit.toUpperCase(),
      l.puNum.toLocaleString('fr-MA', { minimumFractionDigits: 2, maximumFractionDigits: 4 }),
      l.mt.toLocaleString('fr-MA', { minimumFractionDigits: 2, maximumFractionDigits: 2 }),
    ]),
    foot: [
      [
        `TOTAL — ${validLines.length} item(s)`,
        totalQty.toLocaleString('fr-MA'),
        '',
        '',
        totalMT.toLocaleString('fr-MA', { minimumFractionDigits: 2, maximumFractionDigits: 2 }),
      ],
      [
        {
          content: freightNote,
          colSpan: 5,
          styles: {
            halign: 'left' as const,
            fontSize: 7,
            fontStyle: 'italic' as const,
            fillColor: [240, 240, 235] as [number, number, number],
            textColor: [80, 80, 80] as [number, number, number],
            cellPadding: 3,
          },
        },
      ],
    ],
    margin: { left: marginX, right: marginX, bottom: 65 },
    styles: {
      fontSize: 9.5,
      cellPadding: 5,
      font: 'helvetica',
      textColor: TEXT_MAIN,
      lineColor: BORDER_COLOR,
      lineWidth: 0.2,
    },
    headStyles: {
      fillColor: NAVY,
      textColor: [255, 255, 255],
      fontSize: 8.5,
      fontStyle: 'bold',
    },
    footStyles: {
      fillColor: NAVY,
      textColor: [255, 255, 255],
      fontStyle: 'bold',
      fontSize: 10,
    },
    columnStyles: {
      0: { fontStyle: 'bold', cellWidth: 70 },
      1: { halign: 'right' },
      2: { halign: 'center' },
      3: { halign: 'right' },
      4: { halign: 'right', fontStyle: 'bold', textColor: [5, 100, 60] },
    },
    alternateRowStyles: { fillColor: LIGHT_BG },
  });

  yPos = (doc as any).lastAutoTable.finalY + 10;

  // ── Total declared amount bar ──
  if (yPos > pageH - 70) { doc.addPage(); yPos = 20; }

  doc.setFillColor(...NAVY);
  doc.roundedRect(marginX, yPos, contentW, 16, 1.5, 1.5, 'F');
  doc.setTextColor(255, 255, 255);
  doc.setFontSize(8.5);
  doc.setFont('helvetica', 'bold');
  doc.text('TOTAL DECLARED VALUE (CUSTOMS)', marginX + 5, yPos + 6.5);
  doc.setFontSize(12);
  doc.text(
    totalMT > 0
      ? `${totalMT.toLocaleString('fr-MA', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} USD`
      : '— USD',
    pageW - marginX - 5, yPos + 10.5, { align: 'right' }
  );

  yPos += 24;

  // ── TO: Supplier block ──
  doc.setFillColor(...LIGHT_BG);
  doc.setDrawColor(...BORDER_COLOR);
  doc.setLineWidth(0.3);
  doc.roundedRect(marginX, yPos, contentW, 22, 1.5, 1.5, 'FD');

  doc.setFontSize(7);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(...TEXT_MUTED);
  doc.text('TO / SUPPLIER', marginX + 5, yPos + 6);
  doc.setFontSize(10);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(...NAVY);
  doc.text((facture.supplierId || '—').toUpperCase(), marginX + 5, yPos + 14);

  doc.setFontSize(7);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(...TEXT_MUTED);
  doc.text('This document is issued for customs declaration purposes only.', pageW - marginX - 5, yPos + 14, { align: 'right' });


  // ── Page footer ──
  const pageCount = (doc as any).internal.getNumberOfPages();
  for (let i = 1; i <= pageCount; i++) {
    doc.setPage(i);
    doc.setFontSize(6.5);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(...TEXT_MUTED);
    doc.text('LEBTEX TEXTILE IMPORT - 31 Rue 65 Lotissement Al Hamd Ain-Chock-Casablanca-Maroc', pageW / 2, pageH - 24, { align: 'center' });
    doc.text('Tel: +212 522 25 77 78 / +212 522 31 62 88 - Email: Contact.lebtex@gmail.com', pageW / 2, pageH - 20, { align: 'center' });
    doc.text('Patente: 34011181 - R.C: 704617 - I.F: 68814237 - ICE: 003823212000094', pageW / 2, pageH - 16, { align: 'center' });

    doc.setFillColor(...NAVY);
    doc.rect(0, pageH - 12, pageW, 12, 'F');
    doc.setFillColor(...GOLD);
    doc.rect(0, pageH - 12, 4, 12, 'F');
    doc.setFontSize(7);
    doc.setTextColor(148, 163, 184);
    doc.text(`OFFICIAL CUSTOMS DECLARATION  |  Ref. ${ref}  |  ${todayStr}`, marginX + 4, pageH - 5);
    doc.text(`Page ${i} of ${pageCount}`, pageW - marginX, pageH - 5, { align: 'right' });
  }

  doc.save(`CUSTOMS_DECL_${(facture.id || 'Shipment').toUpperCase()}_${todayStr}.pdf`);
}



// ─────────────────────────────────────────────
//  PARTENAIRES — helpers
// ─────────────────────────────────────────────

function partnerHeader(doc: any, pageW: number, title: string, subtitle: string, name: string, color: [number,number,number]) {
  doc.setFillColor(28, 25, 23);
  doc.rect(0, 0, pageW, 36, 'F');
  doc.setFillColor(...color);
  doc.rect(0, 34, pageW, 2, 'F');

  doc.setTextColor(...color);
  doc.setFontSize(7);
  doc.setFont('helvetica', 'bold');
  doc.text(title.toUpperCase(), 14, 10);

  doc.setTextColor(255, 255, 255);
  doc.setFontSize(20);
  doc.text(name.toUpperCase(), 14, 24);

  doc.setTextColor(161, 161, 170);
  doc.setFontSize(7);
  doc.text(subtitle, 14, 31);

  doc.setTextColor(113, 113, 122);
  doc.setFontSize(7);
  doc.text(
    `Exporté le ${new Date().toLocaleDateString('fr-MA')} à ${new Date().toLocaleTimeString('fr-MA', { hour: '2-digit', minute: '2-digit' })}`,
    pageW - 14, 10, { align: 'right' }
  );
}

function kpiBlocks(doc: any, pageW: number, blocks: [string, string][], startY: number) {
  const bw = (pageW - 28) / blocks.length;
  let bx = 14;
  blocks.forEach(([label, value], i) => {
    const isLast = i === blocks.length - 1;
    doc.setFillColor(isLast ? 245 : 245, isLast ? 245 : 245, isLast ? 244 : 244);
    if (isLast) doc.setFillColor(251, 191, 36);
    doc.roundedRect(bx, startY, bw - 2, 16, 2, 2, 'F');
    doc.setTextColor(isLast ? 28 : 161, isLast ? 25 : 161, isLast ? 23 : 170);
    doc.setFontSize(6);
    doc.setFont('helvetica', 'bold');
    doc.text(label.toUpperCase(), bx + 3, startY + 5);
    doc.setTextColor(28, 25, 23);
    doc.setFontSize(8);
    doc.setFont('helvetica', 'bold');
    doc.text(value, bx + 3, startY + 12);
    bx += bw;
  });
}

function pageFooter(doc: any, pageW: number) {
  const pageCount = (doc as any).internal.getNumberOfPages();
  for (let i = 1; i <= pageCount; i++) {
    doc.setPage(i);
    doc.setFontSize(7);
    doc.setTextColor(161, 161, 170);
    doc.text(`Page ${i} / ${pageCount}  —  LEBTEX TEXTILE IMPORT`, pageW / 2, doc.internal.pageSize.getHeight() - 6, { align: 'center' });
  }
}

// ─────────────────────────────────────────────
//  1. FOURNISSEUR
// ─────────────────────────────────────────────
export async function exportSupplierPDF(
  supplierName: string,
  supplierFactures: any[],
  stats: { totalReal: number; totalDeclared: number; gap: number; remaining: number; articles: number }
) {
  const { default: jsPDF } = await import('jspdf');
  const { default: autoTable } = await import('jspdf-autotable');
  const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });
  const pageW = doc.internal.pageSize.getWidth();

  partnerHeader(doc, pageW, 'Analyse Fournisseur — Flux Partenaires', `${supplierFactures.length} dossiers · ${stats.articles} articles`, supplierName, [251, 191, 36]);
  kpiBlocks(doc, pageW, [
    ['Val. Réelle Totale', `${stats.totalReal.toLocaleString('fr-MA', { maximumFractionDigits: 2 })} $`],
    ['Val. Déclarée Totale', `${stats.totalDeclared.toLocaleString('fr-MA', { maximumFractionDigits: 2 })} $`],
    ['Différence', `${stats.gap.toLocaleString('fr-MA', { maximumFractionDigits: 2 })} $`],
    ['Reste à Régulariser', `${stats.remaining.toLocaleString('fr-MA', { maximumFractionDigits: 2 })} $`],
  ], 40);

  autoTable(doc, {
    startY: 62,
    head: [['Statut', 'N° Dossier', 'Date Arrivée', 'CBM (m³)', 'Valeur Réelle ($)', 'Valeur Déclarée ($)']],
    body: supplierFactures.map(f => [
      f.isArrived ? 'Réceptionné' : 'Transit',
      f.id,
      f.arrivalDate || '-',
      Number(f.cbm).toFixed(3),
      Number(f.totalReal).toLocaleString('fr-MA', { maximumFractionDigits: 2 }),
      Number(f.declared).toLocaleString('fr-MA', { maximumFractionDigits: 2 }),
    ]),
    foot: [['TOTAL', `${supplierFactures.length} dossiers`, '', '', stats.totalReal.toLocaleString('fr-MA', { maximumFractionDigits: 2 }), stats.totalDeclared.toLocaleString('fr-MA', { maximumFractionDigits: 2 })]],
    headStyles: { fillColor: [28, 25, 23], textColor: 255, fontStyle: 'bold', fontSize: 7, cellPadding: 3 },
    footStyles: { fillColor: [251, 191, 36], textColor: [28, 25, 23], fontStyle: 'bold', fontSize: 7 },
    bodyStyles: { fontSize: 7, cellPadding: 2.5 },
    alternateRowStyles: { fillColor: [250, 250, 249] },
    columnStyles: { 3: { halign: 'right' }, 4: { halign: 'right', fontStyle: 'bold' }, 5: { halign: 'right', textColor: [180, 100, 0] } },
    margin: { left: 14, right: 14 },
    theme: 'grid',
  });

  pageFooter(doc, pageW);
  doc.save(`Fournisseur_${supplierName}_${new Date().toISOString().split('T')[0]}.pdf`);
}

// ─────────────────────────────────────────────
//  2. ENTITÉ JURIDIQUE
// ─────────────────────────────────────────────
export async function exportCompanyPDF(
  companyName: string,
  companyFactures: any[],
  stats: { totalReal: number; totalDeclared: number; gap: number }
) {
  const { default: jsPDF } = await import('jspdf');
  const { default: autoTable } = await import('jspdf-autotable');
  const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });
  const pageW = doc.internal.pageSize.getWidth();

  partnerHeader(doc, pageW, 'Analyse Entité — Flux Partenaires', `${companyFactures.length} dossiers déclarés`, companyName, [59, 130, 246]);
  kpiBlocks(doc, pageW, [
    ['Val. Réelle Cumulée', `${stats.totalReal.toLocaleString('fr-MA', { maximumFractionDigits: 2 })} $`],
    ['Val. Douane Cumulée', `${stats.totalDeclared.toLocaleString('fr-MA', { maximumFractionDigits: 2 })} $`],
    ['Différence à Rég.', `${stats.gap.toLocaleString('fr-MA', { maximumFractionDigits: 2 })} $`],
  ], 40);

  autoTable(doc, {
    startY: 62,
    head: [['Statut', 'N° Dossier', 'Fournisseur', 'Date Arrivée', 'Valeur Réelle ($)', 'Valeur Déclarée ($)']],
    body: companyFactures.map(f => [
      f.isArrived ? 'Réceptionné' : 'Transit',
      f.id,
      f.supplierId || '-',
      f.arrivalDate || '-',
      Number(f.totalReal).toLocaleString('fr-MA', { maximumFractionDigits: 2 }),
      Number(Number(f.declaredValue) || f.totalReal).toLocaleString('fr-MA', { maximumFractionDigits: 2 }),
    ]),
    foot: [['TOTAL', `${companyFactures.length} dossiers`, '', '', stats.totalReal.toLocaleString('fr-MA', { maximumFractionDigits: 2 }), stats.totalDeclared.toLocaleString('fr-MA', { maximumFractionDigits: 2 })]],
    headStyles: { fillColor: [28, 25, 23], textColor: 255, fontStyle: 'bold', fontSize: 7, cellPadding: 3 },
    footStyles: { fillColor: [59, 130, 246], textColor: [255, 255, 255], fontStyle: 'bold', fontSize: 7 },
    bodyStyles: { fontSize: 7, cellPadding: 2.5 },
    alternateRowStyles: { fillColor: [250, 250, 249] },
    columnStyles: { 4: { halign: 'right', fontStyle: 'bold' }, 5: { halign: 'right', textColor: [180, 100, 0] } },
    margin: { left: 14, right: 14 },
    theme: 'grid',
  });

  pageFooter(doc, pageW);
  doc.save(`Entite_${companyName}_${new Date().toISOString().split('T')[0]}.pdf`);
}

// ─────────────────────────────────────────────
//  3. COMPAGNIE MARITIME
// ─────────────────────────────────────────────
export async function exportShippingPDF(
  shippingName: string,
  shippingFactures: any[],
  stats: { totalFreight: number; totalReal: number; totalCbm: number }
) {
  const { default: jsPDF } = await import('jspdf');
  const { default: autoTable } = await import('jspdf-autotable');
  const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });
  const pageW = doc.internal.pageSize.getWidth();

  partnerHeader(doc, pageW, 'Analyse Compagnie Maritime — Flux Partenaires', `${shippingFactures.length} arrivages`, shippingName, [16, 185, 129]);
  kpiBlocks(doc, pageW, [
    ['Fret Total', `${stats.totalFreight.toLocaleString('fr-MA', { maximumFractionDigits: 2 })} $`],
    ['Volume Total', `${stats.totalCbm.toFixed(3)} m³`],
    ['Valeur Transit', `${stats.totalReal.toLocaleString('fr-MA', { maximumFractionDigits: 2 })} $`],
  ], 40);

  autoTable(doc, {
    startY: 62,
    head: [['Statut', 'N° Dossier', 'N° BL', 'Date Arrivée', 'CBM (m³)', 'Fret ($)', 'Val. Marchandise ($)']],
    body: shippingFactures.map(f => [
      f.isArrived ? 'Réceptionné' : 'Transit',
      f.id,
      f.noBL || '-',
      f.arrivalDate || '-',
      Number(f.cbm).toFixed(3),
      Number(f.freight).toLocaleString('fr-MA', { maximumFractionDigits: 2 }),
      Number(f.totalReal - f.freight).toLocaleString('fr-MA', { maximumFractionDigits: 2 }),
    ]),
    foot: [['TOTAL', `${shippingFactures.length} dossiers`, '', '', stats.totalCbm.toFixed(3), stats.totalFreight.toLocaleString('fr-MA', { maximumFractionDigits: 2 }), '']],
    headStyles: { fillColor: [28, 25, 23], textColor: 255, fontStyle: 'bold', fontSize: 7, cellPadding: 3 },
    footStyles: { fillColor: [16, 185, 129], textColor: [255, 255, 255], fontStyle: 'bold', fontSize: 7 },
    bodyStyles: { fontSize: 7, cellPadding: 2.5 },
    alternateRowStyles: { fillColor: [250, 250, 249] },
    columnStyles: { 4: { halign: 'right' }, 5: { halign: 'right', textColor: [5, 150, 105], fontStyle: 'bold' }, 6: { halign: 'right', fontStyle: 'bold' } },
    margin: { left: 14, right: 14 },
    theme: 'grid',
  });

  pageFooter(doc, pageW);
  doc.save(`Maritime_${shippingName}_${new Date().toISOString().split('T')[0]}.pdf`);
}

// ─────────────────────────────────────────────
//  4. TRANSITAIRE
// ─────────────────────────────────────────────
export async function exportForwarderPDF(
  forwarderName: string,
  dossiers: any[],
  dossiersARemettre: any[],
  totalFactureTransitaire: number
) {
  const { default: jsPDF } = await import('jspdf');
  const { default: autoTable } = await import('jspdf-autotable');
  const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });
  const pageW = doc.internal.pageSize.getWidth();

  partnerHeader(doc, pageW, 'Analyse Transitaire — Flux Partenaires', `${dossiers.length} dossiers remis · ${dossiersARemettre.length} à remettre`, forwarderName, [139, 92, 246]);
  kpiBlocks(doc, pageW, [
    ['Dossiers Remis', String(dossiers.length)],
    ['À Remettre (<7j)', String(dossiersARemettre.length)],
    ['Total Fact. Transitaire', `${totalFactureTransitaire.toLocaleString('fr-MA', { maximumFractionDigits: 0 })} MAD`],
  ], 40);

  // Tableau dossiers remis
  if (dossiers.length > 0) {
    doc.setFontSize(8);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(28, 25, 23);
    const afterKpi = 60;
    doc.text('DOSSIERS CONFIÉS AU TRANSITAIRE', 14, afterKpi);

    autoTable(doc, {
      startY: afterKpi + 4,
      head: [['Statut', 'N° Dossier', 'N° BL', 'Compagnie Maritime', 'Date Remise', 'Date Arrivée', 'Fournisseur', 'CBM (m³)', 'Fact. Transit. (MAD)']],
      body: dossiers.map(f => [
        f.inStock ? 'En Stock' : f.isArrived ? 'Dédouanement' : 'En Transit',
        f.id,
        f.noBL || '-',
        f.shippingLine || '-',
        f.forwarderGivenDate || '-',
        f.arrivalDate || '-',
        f.supplierId || '-',
        Number(f.cbm).toFixed(3),
        f.supplierInvoiceAmount ? Number(f.supplierInvoiceAmount).toLocaleString('fr-MA', { maximumFractionDigits: 0 }) : '-',
      ]),
      foot: [['TOTAL', `${dossiers.length} dossiers`, '', '', '', '', '', '', `${totalFactureTransitaire.toLocaleString('fr-MA', { maximumFractionDigits: 0 })} MAD`]],
      headStyles: { fillColor: [28, 25, 23], textColor: 255, fontStyle: 'bold', fontSize: 6.5, cellPadding: 2.5 },
      footStyles: { fillColor: [139, 92, 246], textColor: [255, 255, 255], fontStyle: 'bold', fontSize: 7 },
      bodyStyles: { fontSize: 6.5, cellPadding: 2 },
      alternateRowStyles: { fillColor: [250, 250, 249] },
      columnStyles: { 7: { halign: 'right' }, 8: { halign: 'right', textColor: [109, 40, 217], fontStyle: 'bold' } },
      margin: { left: 14, right: 14 },
      theme: 'grid',
    });
  }

  // Tableau dossiers à remettre
  if (dossiersARemettre.length > 0) {
    const afterTable = (doc as any).lastAutoTable?.finalY + 8 || 80;
    doc.setFontSize(8);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(220, 38, 38);
    doc.text('⚠ DOSSIERS À REMETTRE — ARRIVÉE IMMINENTE (<7 JOURS)', 14, Math.min(afterTable, doc.internal.pageSize.getHeight() - 40));

    autoTable(doc, {
      startY: Math.min(afterTable + 4, doc.internal.pageSize.getHeight() - 35),
      head: [['N° Dossier', 'N° BL', 'Date Arrivée', 'Délai', 'Fournisseur']],
      body: dossiersARemettre.map(f => [
        f.id,
        f.noBL || '-',
        f.arrivalDate || '-',
        f.daysLeft <= 0 ? 'ARRIVÉ' : `J-${f.daysLeft}`,
        f.supplierId || '-',
      ]),
      headStyles: { fillColor: [220, 38, 38], textColor: 255, fontStyle: 'bold', fontSize: 7, cellPadding: 3 },
      bodyStyles: { fontSize: 7, cellPadding: 2.5, textColor: [220, 38, 38] },
      alternateRowStyles: { fillColor: [255, 241, 242] },
      margin: { left: 14, right: 14 },
      theme: 'grid',
    });
  }

  pageFooter(doc, pageW);
  doc.save(`Transitaire_${forwarderName}_${new Date().toISOString().split('T')[0]}.pdf`);
}

// ─────────────────────────────────────────────
//  5. DOSSIER CLIENT (PRÉCOMMANDES)
// ─────────────────────────────────────────────
export async function exportClientDossierPDF(
  clientName: string,
  articles: any[]
) {
  const { default: jsPDF } = await import('jspdf');
  const { default: autoTable } = await import('jspdf-autotable');
  
  const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
  const pageW = doc.internal.pageSize.getWidth();
  const pageH = doc.internal.pageSize.getHeight();
  const marginX = 16;
  const contentW = pageW - marginX * 2;

  const NAVY: [number, number, number] = [15, 23, 42];
  const GOLD: [number, number, number] = [196, 160, 98];
  const TEXT_MAIN: [number, number, number] = [30, 41, 59];
  const TEXT_MUTED: [number, number, number] = [100, 116, 139];
  const LIGHT_BG: [number, number, number] = [248, 250, 252];
  const BORDER_COLOR: [number, number, number] = [226, 232, 240];

  const todayStr = new Date().toISOString().slice(0, 10);
  const todayFr = new Date().toLocaleDateString("fr-FR", { day: "2-digit", month: "long", year: "numeric" });
  const ref = `DOSSIER-${Date.now().toString().slice(-8)}`;

  let yPos = 16;

  // 1. Header
  await new Promise<void>((resolve) => {
    const img = new Image();
    img.src = "/logo.png";
    img.onload = () => {
      doc.addImage(img, "PNG", marginX, yPos, 36, 18);
      resolve();
    };
    img.onerror = () => {
      doc.setTextColor(...NAVY);
      doc.setFontSize(22);
      doc.setFont("helvetica", "bold");
      doc.text("LEBTEX", marginX, yPos + 8);
      doc.setFontSize(8);
      doc.setFont("helvetica", "normal");
      doc.setTextColor(...GOLD);
      doc.text("TEXTILE IMPORT", marginX, yPos + 13);
      resolve();
    };
  });

  doc.setTextColor(...NAVY);
  doc.setFontSize(18);
  doc.setFont("helvetica", "bold");
  doc.text("DOSSIER CLIENT - PRÉCOMMANDES", pageW - marginX, yPos + 8, { align: "right" });

  doc.setDrawColor(...GOLD);
  doc.setLineWidth(0.6);
  doc.line(pageW - marginX - 70, yPos + 11, pageW - marginX, yPos + 11);

  doc.setFontSize(9);
  doc.setFont("helvetica", "bold");
  doc.setTextColor(...TEXT_MAIN);
  doc.text(`Client : ${clientName.toUpperCase()}`, pageW - marginX, yPos + 17, { align: "right" });
  
  doc.setFont("helvetica", "normal");
  doc.setTextColor(...TEXT_MUTED);
  doc.text(`Date : ${todayFr}`, pageW - marginX, yPos + 22, { align: "right" });

  yPos += 35;

  // 2. Table des articles
  // « MULTIPLE » ne dit rien au client : un article ventilé montre ses tailles et ses couleurs
  // avec leurs quantités, et le type de produit porte ses caractéristiques.
  const tableRows = articles.map((a, i) => {
    const unite = (a.unitOfMeasure || "U").toUpperCase();
    const typeProduit = [
      (a.categoryId || a.name || "—").toUpperCase(),
      ...detailsArticle(a, { unite, max: 4, ignorer: ['size', 'color'] }),
    ].filter(Boolean).join('\n');
    return [
      String(i + 1),
      typeProduit,
      celluleDimension(a, 'size', a.size, unite),
      celluleCouleur(a, unite),
      `${Number(a.quantity).toLocaleString("fr-MA")} ${a.unitOfMeasure || "U"}`,
      a.arrivalDate ? a.arrivalDate : "—",
      a.status === "STOCK" ? "En Stock" : a.status === "CUSTOMS" ? "Dédouanement" : a.status === "TRANSIT" ? "En Transit" : a.status === "SHIPPED" ? "Expédié" : a.status === "PI" ? "En Prod." : "À Commander"
    ];
  });

  autoTable(doc, {
    startY: yPos,
    head: [["#", "Type Produit", "Taille", "Couleur", "Quantité", "Arrivée Prévue", "Statut"]],
    body: tableRows,
    margin: { left: marginX, right: marginX, bottom: 40 },
    styles: {
      fontSize: 8,
      cellPadding: 4,
      font: "helvetica",
      textColor: TEXT_MAIN,
      lineColor: BORDER_COLOR,
      lineWidth: 0.2,
    },
    headStyles: {
      fillColor: NAVY,
      textColor: 255,
      fontSize: 8,
      fontStyle: "bold",
    },
    columnStyles: {
      0: { cellWidth: 10, textColor: TEXT_MUTED },
      1: { fontStyle: "bold" },
      4: { halign: "right", fontStyle: "bold", textColor: NAVY },
    },
  });

  yPos = (doc as any).lastAutoTable.finalY + 12;

  // 3. Conditions de Vente
  if (yPos > pageH - 85) {
    doc.addPage();
    yPos = 20;
  }

  doc.setFillColor(...LIGHT_BG);
  doc.setDrawColor(...BORDER_COLOR);
  doc.setLineWidth(0.3);
  doc.roundedRect(marginX, yPos, contentW, 22, 1.5, 1.5, "FD");

  doc.setFontSize(7.5);
  doc.setFont("helvetica", "bold");
  doc.setTextColor(...NAVY);
  doc.text("CONDITIONS DE VENTE :", marginX + 4, yPos + 6);
  
  doc.setFontSize(7);
  doc.setFont("helvetica", "normal");
  doc.setTextColor(...TEXT_MAIN);
  doc.text("• Condition de paiement : solde à la livraison ou à la réception.", marginX + 4, yPos + 11);
  doc.text("• Les délais sont donnés à titre indicatif et peuvent varier selon les conditions d'importation.", marginX + 4, yPos + 15);
  doc.text("• Clause non-annulation : toute commande validée accompagnée d'un acompte est ferme, définitive, non annulable et non remboursable.", marginX + 4, yPos + 19);

  yPos += 28;

  // 4. Signatures
  if (yPos > pageH - 45) {
    doc.addPage();
    yPos = 20;
  }

  doc.setDrawColor(...BORDER_COLOR);
  doc.setLineWidth(0.4);
  doc.line(marginX, yPos, pageW - marginX, yPos);
  yPos += 8;

  const sigBoxW = (contentW - 12) / 2;

  doc.setFillColor(...LIGHT_BG);
  doc.setDrawColor(...BORDER_COLOR);
  doc.setLineWidth(0.3);
  doc.roundedRect(marginX, yPos, sigBoxW, 28, 1.5, 1.5, "FD");
  doc.setFontSize(8);
  doc.setFont("helvetica", "bold");
  doc.setTextColor(...NAVY);
  doc.text("ÉMIS PAR LEBTEX TEXTILE IMPORT", marginX + 6, yPos + 7);
  doc.setFontSize(7);
  doc.setFont("helvetica", "normal");
  doc.setTextColor(...TEXT_MUTED);
  doc.text("Service Commercial", marginX + 6, yPos + 11);
  doc.setDrawColor(...GOLD);
  doc.setLineWidth(0.5);
  doc.line(marginX + 6, yPos + 22, marginX + sigBoxW - 6, yPos + 22);

  doc.setFillColor(...LIGHT_BG);
  doc.setDrawColor(...BORDER_COLOR);
  doc.setLineWidth(0.3);
  doc.roundedRect(marginX + sigBoxW + 12, yPos, sigBoxW, 28, 1.5, 1.5, "FD");
  doc.setFontSize(8);
  doc.setFont("helvetica", "bold");
  doc.setTextColor(...NAVY);
  doc.text("ACCUSÉ DE RÉCEPTION CLIENT", marginX + sigBoxW + 18, yPos + 7);
  doc.setFontSize(7);
  doc.setFont("helvetica", "normal");
  doc.setTextColor(...TEXT_MUTED);
  doc.text("Lu et approuvé (Cachet et signature)", marginX + sigBoxW + 18, yPos + 11);
  doc.setDrawColor(203, 213, 225);
  doc.setLineDashPattern([1, 1], 0);
  doc.line(marginX + sigBoxW + 18, yPos + 22, marginX + contentW - 6, yPos + 22);
  doc.setLineDashPattern([], 0);

  // 5. Footer
  const pageCount = (doc as any).internal.getNumberOfPages();
  for (let i = 1; i <= pageCount; i++) {
    doc.setPage(i);
    doc.setFontSize(6.5);
    doc.setFont("helvetica", "normal");
    doc.setTextColor(...TEXT_MUTED);
    doc.text("LEBTEX TEXTILE IMPORT - 31 Rue 65 Lotissement Al Hamd Ain-Chock-Casablanca-Maroc", pageW / 2, pageH - 24, { align: "center" });
    doc.text("Tel : 05 22 25 77 78 / 05 22 31 62 88 - Fax : 05 22 58 03 46 - Portable : 06 61 10 15 60 - Email : Contact.lebtex@gmail.com", pageW / 2, pageH - 20, { align: "center" });
    doc.text("Patente : 34011181 - R.C : 704617 - I.F : 68814237 - ICE : 003823212000094", pageW / 2, pageH - 16, { align: "center" });

    doc.setFillColor(...NAVY);
    doc.rect(0, pageH - 12, pageW, 12, "F");
    doc.setFillColor(...GOLD);
    doc.rect(0, pageH - 12, 4, 12, "F");
    doc.setFontSize(7);
    doc.setTextColor(148, 163, 184);
    doc.text(`Document Officiel LEBTEX  |  Réf. ${ref}  |  Généré le ${todayStr}`, marginX + 4, pageH - 5);
    doc.text(`Page ${i} sur ${pageCount}`, pageW - marginX, pageH - 5, { align: "right" });
  }

  const cleanName = clientName.replace(/\s+/g, "_").toUpperCase();
  doc.save(`DOSSIER_CLIENT_${cleanName}_${todayStr}.pdf`);
}

// ─────────────────────────────────────────────────────────────────────────────
//  DEVIS CLIENT — Prix de Revient TTC Estimatif (PI) + Marge Commerciale
//  Usage : rare — quand on veut communiquer un prix recommandé au client
//          avant la commande fournisseur
// ─────────────────────────────────────────────────────────────────────────────
export async function exportDevisClientPIPDF(params: {
  items: Array<{
    article: any;
    computed: any;
  }>;
  tauxChange: number;
  margePercent: number;
  remiseGlobale?: number;
}) {
  const { default: jsPDF } = await import('jspdf');
  const { default: autoTable } = await import('jspdf-autotable');

  const { items, margePercent } = params;
  if (!items || items.length === 0) return;

  const article = items[0].article;

  // ── Brand palette (same as export-client-commande) ─────────────────────────
  const NAVY:      [number,number,number] = [15, 23, 42];
  const GOLD:      [number,number,number] = [196, 160, 98];
  const WHITE:     [number,number,number] = [255, 255, 255];
  const MUTED:     [number,number,number] = [100, 116, 139];
  const BORDER:    [number,number,number] = [226, 232, 240];
  const BG:        [number,number,number] = [248, 250, 252];
  const GOLD_LIGHT:[number,number,number] = [254, 249, 240];

  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
  const W = doc.internal.pageSize.getWidth();
  const H = doc.internal.pageSize.getHeight();
  const MX = 15;
  const CW = W - MX * 2;

  const todayStr = new Date().toISOString().slice(0, 10);
  const today = new Date().toLocaleDateString('fr-FR', { day: '2-digit', month: 'long', year: 'numeric' });
  const ref = `DEV-LBX-${Date.now().toString().slice(-8)}`;

  const fmtNum = (n: number) => n.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
  const fmtQty = (n: number, u: string) => `${fmtNum(Number(n))} ${u || ''}`.trim();

  // ════════════════════════════════════════════════════════════════════
  // PAGE 1 — DEVIS
  // ════════════════════════════════════════════════════════════════════

  // ── Header band ──────────────────────────────────────────────────────
  doc.setFillColor(...NAVY);
  doc.rect(0, 0, W, 38, 'F');
  doc.setFillColor(...GOLD);
  doc.rect(0, 0, 5, 38, 'F');

  await addPdfLogoHeader(doc, 10, 5, 50, 25, true);

  doc.setTextColor(...WHITE); doc.setFontSize(18); doc.setFont('helvetica', 'bold');
  doc.text('DEVIS', W - MX, 18, { align: 'right' });
  doc.setFontSize(8); doc.setFont('helvetica', 'normal');
  doc.setTextColor(...GOLD);
  doc.text(`Réf : ${ref}`, W - MX, 26, { align: 'right' });
  doc.setTextColor(148, 163, 184);
  doc.text(`Date : ${today}`, W - MX, 31, { align: 'right' });

  let y = 44;

  // ── FROM / TO ─────────────────────────────────────────────────────────
  const colW = (CW - 6) / 2;

  // FROM — LEBTEX
  doc.setFillColor(...BG); doc.setDrawColor(...BORDER); doc.setLineWidth(0.3);
  doc.roundedRect(MX, y, colW, 34, 1, 1, 'FD');
  doc.setFillColor(...GOLD);
  doc.roundedRect(MX, y, colW, 6, 1, 1, 'F');
  doc.rect(MX, y + 3, colW, 3, 'F');
  doc.setTextColor(...NAVY); doc.setFontSize(7); doc.setFont('helvetica', 'bold');
  doc.text('ÉMETTEUR', MX + 4, y + 4.5);
  doc.setFontSize(9); doc.setFont('helvetica', 'bold'); doc.setTextColor(...NAVY);
  doc.text('LEBTEX TEXTILE IMPORT', MX + 4, y + 12);
  doc.setFontSize(7.5); doc.setFont('helvetica', 'normal'); doc.setTextColor(...MUTED);
  doc.text('31 Rue 65, Lot. Al Hamd Ain-Chock', MX + 4, y + 17);
  doc.text('Casablanca, Maroc', MX + 4, y + 21.5);
  doc.text('Tél : +212 6 61 10 15 60', MX + 4, y + 26);
  doc.text('Contact.lebtex@gmail.com', MX + 4, y + 30);

  // TO — Client
  const toX = MX + colW + 6;
  doc.setFillColor(...BG); doc.setDrawColor(...BORDER);
  doc.roundedRect(toX, y, colW, 34, 1, 1, 'FD');
  doc.setFillColor(...NAVY);
  doc.roundedRect(toX, y, colW, 6, 1, 1, 'F');
  doc.rect(toX, y + 3, colW, 3, 'F');
  doc.setTextColor(...WHITE); doc.setFontSize(7); doc.setFont('helvetica', 'bold');
  doc.text('CLIENT', toX + 4, y + 4.5);
  doc.setFontSize(9); doc.setFont('helvetica', 'bold'); doc.setTextColor(...NAVY);
  doc.text((article.clientName || 'NOM DU CLIENT').toUpperCase(), toX + 4, y + 12);
  doc.setFontSize(7.5); doc.setFont('helvetica', 'normal'); doc.setTextColor(...MUTED);
  doc.text(article.clientAddress  || 'Adresse : ________________________', toX + 4, y + 17);
  doc.text(article.clientCity     || 'Ville / Pays : ____________________', toX + 4, y + 21.5);
  doc.text(article.clientTel      || 'Tél : _____________________________', toX + 4, y + 26);
  doc.text(article.clientEmail    || 'Email : ___________________________', toX + 4, y + 30);

  y += 40;

  // ── Article banner ────────────────────────────────────────────────────
  doc.setFillColor(...NAVY);
  doc.roundedRect(MX, y, CW, 14, 1.5, 1.5, 'F');
  doc.setFillColor(...GOLD);
  doc.rect(MX, y, 5, 14, 'F');
  doc.roundedRect(MX, y, 5, 14, 1.5, 1.5, 'F');

  doc.setTextColor(...WHITE); doc.setFontSize(13); doc.setFont('helvetica', 'bold');
  const titleText = items.length > 1 ? `DEVIS GROUPÉ (${items.length} ARTICLES)` : (article.name || article.categoryId || 'ARTICLE').toUpperCase();
  doc.text(titleText, MX + 10, y + 9.5);
  doc.setFontSize(8); doc.setFont('helvetica', 'normal'); doc.setTextColor(...GOLD);
  const totalGlobalQty = items.reduce((s, it) => s + (Number(it.article.quantity) || 0), 0);
  doc.text(`QTÉ TOTALE : ${fmtNum(totalGlobalQty)}`, W - MX - 2, y + 5.5, { align: 'right' });
  doc.setTextColor(148, 163, 184); doc.setFontSize(7);
  if (items.length > 1) {
    doc.text(`Articles multiples`, W - MX - 2, y + 10.5, { align: 'right' });
  } else {
    doc.text(`Unité : ${article.unitOfMeasure || '—'}`, W - MX - 2, y + 10.5, { align: 'right' });
  }

  y += 20;

  if (items.length === 1) {

  // ── Spécifications ────────────────────────────────────────────────────
  doc.setFontSize(8.5); doc.setFont('helvetica', 'bold'); doc.setTextColor(...NAVY);
  doc.text('SPÉCIFICATIONS DE LA COMMANDE', MX, y);
  doc.setDrawColor(...GOLD); doc.setLineWidth(0.5);
  doc.line(MX + 65, y - 1, W - MX, y - 1);
  y += 4;

  // Une dimension ventilée s'annonce par son nombre de lignes : le détail, ligne par ligne avec
  // sa quantité, est dans le récapitulatif du devis juste en dessous.
  const libelleDimension = (
    dimension: DimensionVentilation,
    valeurFixe: unknown,
    motPluriel: string,
  ): string => {
    const lignes = lignesVentilation(article).filter(l => l.dimension === dimension);
    if (lignes.length > 0) return `${lignes.length} ${motPluriel}`;
    const fixe = libelleFixe(valeurFixe);
    return fixe ? fixe.toUpperCase() : '—';
  };

  const specs: [string, string][] = [
    ['Désignation / Catégorie', (article.categoryId || '—').toUpperCase()],
    ['Taille',                  libelleDimension('size', article.size, 'TAILLE(S)')],
    ['Couleur',                 libelleDimension('color', article.color, 'COULEUR(S)')],
    ['Quantité commandée',      fmtQty(article.quantity, article.unitOfMeasure)],
    ['Date de commande',        article.orderDate || todayStr],
  ];
  const qualiteDevis = libelleDimension('quality', qualiteDeLArticle(article), 'QUALITÉ(S)');
  if (qualiteDevis !== '—') specs.push(['Qualité', qualiteDevis]);
  // Les caractéristiques viennent du modèle de la famille : grammage et largeur pour un tissu,
  // poids du cône pour un fil, épaisseur pour un accessoire — chaque type a les siennes.
  specsArticle(article).forEach(l => specs.push([l.label, l.valeur]));
  const noteDevis = libelleFixe(article.specs);
  if (noteDevis) specs.push(['Notes Techniques', noteDevis]);

  const cellW = CW / 2;
  const cellH = 10;
  specs.forEach((s, i) => {
    const col = i % 2;
    const row = Math.floor(i / 2);
    const cx = MX + col * cellW;
    const cy = y + row * cellH;
    if (col === 0) doc.setFillColor(...BG); else doc.setFillColor(...WHITE);
    doc.setDrawColor(...BORDER); doc.setLineWidth(0.2);
    doc.rect(cx, cy, cellW, cellH, 'FD');
    doc.setFontSize(6.5); doc.setFont('helvetica', 'normal'); doc.setTextColor(...MUTED);
    doc.text(s[0].toUpperCase(), cx + 3, cy + 3.5);
    doc.setFontSize(8.5); doc.setFont('helvetica', 'bold'); doc.setTextColor(...NAVY);
    doc.text(doc.splitTextToSize(s[1], cellW - 6)[0], cx + 3, cy + 8);
  });

    y += Math.ceil(specs.length / 2) * cellH + 10;
  }

  // ── Tableau de prix ───────────────────────────────────────────────────
  doc.setFontSize(8.5); doc.setFont('helvetica', 'bold'); doc.setTextColor(...NAVY);
  doc.text('RÉCAPITULATIF DU DEVIS', MX, y);
  doc.setDrawColor(...GOLD); doc.setLineWidth(0.5);
  doc.line(MX + 48, y - 1, W - MX, y - 1);
  y += 3;

  // Detect if any item has a remise
  const hasRemise = items.some(it => (it.computed?.remise || 0) > 0);

  // Build line items
  const lineItems: string[][] = [];
  let index = 1;
  let totalDevisMad = 0;
  let totalAvantRemise = 0;
  let totalRemiseMad = 0;

  // Sur un devis groupé, la grille de spécifications n'est pas imprimée : chaque ligne porte
  // alors elle-même les caractéristiques de son article, sinon le client reçoit un prix sans
  // savoir sur quelle marchandise il porte.
  const specsSurLaLigne = items.length > 1;

  items.forEach(item => {
    const art = item.article;
    const comp = item.computed;
    const specsArt = specsSurLaLigne ? specsLigne(art) : '';
    const suffixeSpecs = specsArt ? `\n${specsArt}` : '';
    const pu = comp.prixVenteUniteMad;
    const puNet = comp.prixRemiseUniteMad ?? pu; // after discount
    const remise = comp.remise ?? 0;
    const pt = comp.prixVenteTotalMad;
    const ptNet = comp.prixRemiseTotalMad ?? pt;
    totalAvantRemise += pt;
    totalRemiseMad += (pt - ptNet);
    totalDevisMad += ptNet;

    const qualityBreakdown: any[] = Array.isArray(art.qualityBreakdown) ? art.qualityBreakdown : [];
    const colorBreakdown: any[] = Array.isArray(art.colorBreakdown) ? art.colorBreakdown : [];
    const sizeBreakdown:  any[] = Array.isArray(art.sizeBreakdown)  ? art.sizeBreakdown  : [];

    if (qualityBreakdown.length > 0) {
      qualityBreakdown.forEach((r: any) => {
        const qty = Number(r.quantity || 0);
        if (qty <= 0) return;
        const lineTotal = qty * puNet;
        // Chaque qualité porte ses propres caractéristiques : c'est ce qui distingue deux
        // qualités du même produit, et c'est sur quoi le client donne son accord.
        const qualite = qualiteDeLArticle(art, r);
        const detailQualite = specsLigne(art, r);
        const row: string[] = [
          String(index++),
          `${(art.categoryId || '—').toUpperCase()} — ${(qualite || '—').toUpperCase()}`
            + (detailQualite ? `\n${detailQualite}` : ''),
          fmtQty(qty, art.unitOfMeasure),
          pu.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }),
        ];
        if (hasRemise) {
          row.push(remise > 0 ? `${remise}%` : '—');
          row.push(puNet.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }));
        }
        row.push(lineTotal.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }));
        lineItems.push(row);
      });
    } else if (colorBreakdown.length > 0) {
      colorBreakdown.forEach((r: any) => {
        const qty = Number(r.rolls || 0);
        if (qty <= 0) return;
        const lineTotal = qty * puNet;
        const row: string[] = [
          String(index++),
          `${(art.categoryId || '—').toUpperCase()}${r.colorCode ? ' — ' + r.colorCode.toUpperCase() : ''}${r.description ? ' ' + r.description : ''}${suffixeSpecs}`,
          fmtQty(qty, art.unitOfMeasure),
          pu.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }),
        ];
        if (hasRemise) {
          row.push(remise > 0 ? `${remise}%` : '—');
          row.push(puNet.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }));
        }
        row.push(lineTotal.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }));
        lineItems.push(row);
      });
    } else if (sizeBreakdown.length > 0) {
      sizeBreakdown.forEach((r: any) => {
        const qty = Number(r.quantity || 0);
        if (qty <= 0) return;
        const lineTotal = qty * puNet;
        const row: string[] = [
          String(index++),
          `${(art.categoryId || '—').toUpperCase()} — Taille ${(libelleFixe(r.size) || '—').toUpperCase()}${suffixeSpecs}`,
          fmtQty(qty, art.unitOfMeasure),
          pu.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }),
        ];
        if (hasRemise) {
          row.push(remise > 0 ? `${remise}%` : '—');
          row.push(puNet.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }));
        }
        row.push(lineTotal.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }));
        lineItems.push(row);
      });
    } else {
      const precisionsArt = [
        qualiteDeLArticle(art),
        libelleFixe(art.size),
        libelleFixe(art.color),
      ].filter(Boolean).map(v => String(v).toUpperCase()).join(' · ');
      const row: string[] = [
        String(index++),
        (art.name || art.categoryId || '—').toUpperCase()
          + (precisionsArt ? `\n${precisionsArt}` : '')
          + suffixeSpecs,
        fmtQty(art.quantity, art.unitOfMeasure),
        pu.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }),
      ];
      if (hasRemise) {
        row.push(remise > 0 ? `${remise}%` : '—');
        row.push(puNet.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }));
      }
      row.push(ptNet.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }));
      lineItems.push(row);
    }
  });

  const COL_N   = 8;
  const COL_QTE = 26;
  const COL_PU  = 30;
  const COL_REM = hasRemise ? 16 : 0;
  const COL_PUN = hasRemise ? 30 : 0;
  const COL_TOT = 34;
  const COL_DES = CW - COL_N - COL_QTE - COL_PU - COL_REM - COL_PUN - COL_TOT;

  const tableHead = hasRemise
    ? [['N°', 'Désignation', 'Quantité', 'P.U. Brut (MAD)', 'Remise', 'P.U. Net (MAD)', 'Total (MAD)']]
    : [['N°', 'Désignation', 'Quantité', 'Prix Unit. (MAD)', 'Total (MAD)']];

  const tableFoot = hasRemise ? [
    [{ content: 'Sous-total', colSpan: hasRemise ? 6 : 4, styles: { halign: 'right' as const, fontStyle: 'normal' as const, paddingRight: 15, textColor: [100,116,139] } },
     { content: totalAvantRemise.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }), styles: { halign: 'right' as const, textColor: [100,116,139] } }],
    [{ content: 'Remise totale', colSpan: hasRemise ? 6 : 4, styles: { halign: 'right' as const, fontStyle: 'normal' as const, paddingRight: 15, textColor: [220,38,38] } },
     { content: `- ${totalRemiseMad.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`, styles: { halign: 'right' as const, textColor: [220,38,38] } }],
    [{ content: 'NET TOTAL DEVIS', colSpan: hasRemise ? 6 : 4, styles: { halign: 'right' as const, fontStyle: 'bold' as const, paddingRight: 15 } },
     { content: totalDevisMad.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }), styles: { halign: 'right' as const, fontStyle: 'bold' as const } }],
  ] : [
    [{ content: 'TOTAL DEVIS', colSpan: 4, styles: { halign: 'right' as const, fontStyle: 'bold' as const, paddingRight: 15 } },
     { content: totalDevisMad.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }), styles: { halign: 'right' as const, fontStyle: 'bold' as const } }],
  ];

  const colStylesWithRemise = {
    0: { cellWidth: COL_N,   halign: 'center' as const, textColor: MUTED },
    1: { cellWidth: COL_DES, fontStyle: 'bold' as const },
    2: { cellWidth: COL_QTE, halign: 'right' as const },
    3: { cellWidth: COL_PU,  halign: 'right' as const },
    4: { cellWidth: COL_REM, halign: 'center' as const, textColor: [220,38,38] as [number,number,number] },
    5: { cellWidth: COL_PUN, halign: 'right' as const, textColor: [22,163,74] as [number,number,number] },
    6: { cellWidth: COL_TOT, halign: 'right' as const, fontStyle: 'bold' as const, textColor: NAVY },
  };
  const colStylesNoRemise = {
    0: { cellWidth: COL_N,   halign: 'center' as const, textColor: MUTED },
    1: { cellWidth: COL_DES, fontStyle: 'bold' as const },
    2: { cellWidth: COL_QTE, halign: 'right' as const },
    3: { cellWidth: COL_PU,  halign: 'right' as const },
    4: { cellWidth: COL_TOT, halign: 'right' as const, fontStyle: 'bold' as const, textColor: NAVY },
  };

  autoTable(doc, {
    startY: y,
    head: tableHead,
    body: lineItems,
    foot: tableFoot,
    margin: { left: MX, right: MX, bottom: 50 },
    styles: {
      fontSize: 8, cellPadding: { top: 2.5, bottom: 2.5, left: 3, right: 3 },
      font: 'helvetica', textColor: [30, 41, 59], lineColor: BORDER, lineWidth: 0.15,
    },
    headStyles: { fillColor: NAVY, textColor: WHITE, fontSize: 7.5, fontStyle: 'bold' },
    footStyles: { fillColor: GOLD_LIGHT, textColor: NAVY, fontStyle: 'bold', fontSize: 8.5 },
    alternateRowStyles: { fillColor: [249, 250, 251] },
    columnStyles: hasRemise ? colStylesWithRemise : colStylesNoRemise,
  });

  // ── Signature block ──────────────────────────────────────────────────
  y = (doc as any).lastAutoTable.finalY + 8;
  if (y > H - 70) { doc.addPage(); y = 20; }

  const sigW = (CW - 8) / 2;

  // LEBTEX
  doc.setFillColor(...BG); doc.setDrawColor(...BORDER); doc.setLineWidth(0.3);
  doc.roundedRect(MX, y, sigW, 26, 1, 1, 'FD');
  doc.setFillColor(...NAVY); doc.roundedRect(MX, y, sigW, 6, 1, 1, 'F'); doc.rect(MX, y + 3, sigW, 3, 'F');
  doc.setFontSize(7); doc.setFont('helvetica', 'bold'); doc.setTextColor(...WHITE);
  doc.text('ÉMIS PAR LEBTEX TEXTILE IMPORT', MX + 4, y + 4.5);
  doc.setFontSize(6.5); doc.setFont('helvetica', 'normal'); doc.setTextColor(...MUTED);
  doc.text('Service Commercial', MX + 4, y + 11);
  doc.text('Cachet et signature :', MX + 4, y + 16);
  doc.setDrawColor(...GOLD); doc.setLineWidth(0.5);
  doc.line(MX + 6, y + 23, MX + sigW - 4, y + 23);

  // Client
  const clX = MX + sigW + 8;
  doc.setFillColor(...BG); doc.setDrawColor(...BORDER); doc.setLineWidth(0.3);
  doc.roundedRect(clX, y, sigW, 26, 1, 1, 'FD');
  doc.setFillColor(...BORDER); doc.roundedRect(clX, y, sigW, 6, 1, 1, 'F'); doc.rect(clX, y + 3, sigW, 3, 'F');
  doc.setFontSize(7); doc.setFont('helvetica', 'bold'); doc.setTextColor(...MUTED);
  doc.text('BON POUR ACCORD — CLIENT', clX + 4, y + 4.5);
  doc.setFontSize(6.5); doc.setFont('helvetica', 'normal'); doc.setTextColor(...MUTED);
  doc.text('Nom : ___________________________', clX + 4, y + 11);
  doc.text('Lu et approuvé (cachet & signature) :', clX + 4, y + 16);
  doc.setDrawColor(203, 213, 225); doc.setLineDashPattern([1, 1], 0);
  doc.line(clX + 6, y + 23, clX + sigW - 4, y + 23);
  doc.setLineDashPattern([], 0);

  y += 32;

  // ── CGV compacts en bas de page ───────────────────────────────────
  if (y > H - 38) { doc.addPage(); y = 20; }
  doc.setDrawColor(...BORDER); doc.setLineWidth(0.2);
  doc.line(MX, y, W - MX, y);
  y += 3;
  doc.setFontSize(5.8); doc.setFont('helvetica', 'bold'); doc.setTextColor(...MUTED);
  doc.text('CONDITIONS GÉNÉRALES', MX, y + 3);
  doc.setFont('helvetica', 'normal');
  const cgvLines = [
    'Art. 1 — Ce devis engage LEBTEX TEXTILE IMPORT à fournir les marchandises désignées aux conditions acceptées par le client.',
    'Art. 2 — Les délais d\'arrivée sont indicatifs et peuvent varier selon les conditions d\'import, transit et dédouanement. LEBTEX ne peut être tenu responsable de retards.',
    'Art. 3 — Toute réclamation sur la qualité ou quantité doit être formulée par écrit dans les 48h suivant réception. Les marchandises restent propriété de LEBTEX jusqu\'au paiement intégral.',
  ];
  cgvLines.forEach((line, i) => {
    const wrapped = doc.splitTextToSize(line, CW);
    doc.text(wrapped, MX, y + 7 + i * 6.5);
  });

  // ── Footer — all pages ────────────────────────────────────────────────
  const pages = (doc as any).internal.getNumberOfPages();
  for (let i = 1; i <= pages; i++) {
    doc.setPage(i);
    doc.setDrawColor(...GOLD); doc.setLineWidth(0.4);
    doc.line(MX, H - 18, W - MX, H - 18);
    doc.setFontSize(6.3); doc.setFont('helvetica', 'normal'); doc.setTextColor(...MUTED);
    doc.text('LEBTEX TEXTILE IMPORT  |  31 Rue 65, Lot. Al Hamd Ain-Chock, Casablanca, Maroc', W / 2, H - 14.5, { align: 'center' });
    doc.text('Tél : +212 6 61 10 15 60  |  Email : Contact.lebtex@gmail.com  |  Patente : 34011181  |  ICE : 003823212000094', W / 2, H - 11, { align: 'center' });
    doc.setFillColor(...NAVY); doc.rect(0, H - 8, W, 8, 'F');
    doc.setFillColor(...GOLD); doc.rect(0, H - 8, 4, 8, 'F');
    doc.setFontSize(6.5); doc.setFont('helvetica', 'normal'); doc.setTextColor(148, 163, 184);
    doc.text(`Devis  |  ${ref}  |  ${todayStr}  |  CONFIDENTIEL`, MX + 5, H - 3.5);
    doc.text(`Page ${i} / ${pages}`, W - MX, H - 3.5, { align: 'right' });
  }

  const artLabel = items.length > 1 ? `GROUPE-${items.length}` : (article.name || article.categoryId || 'DEVIS').replace(/\s+/g, '_').toUpperCase();
  doc.save(`DEVIS-LEBTEX-${artLabel}-${todayStr}.pdf`);
}

// ─────────────────────────────────────────────────────────────────────────
//  EXPORT BESOINS PDF — Liste des commandes à passer avec images
// ─────────────────────────────────────────────────────────────────────────
export async function exportBesoinsPDF(
  articles: any[],
  imageLoader?: (url: string) => Promise<string | null>
) {
  const { default: jsPDF } = await import('jspdf');
  const { default: autoTable } = await import('jspdf-autotable');

  const NAVY: [number, number, number]   = [15, 23, 42];
  const GOLD: [number, number, number]   = [196, 160, 98];
  const AMBER: [number, number, number]  = [245, 158, 11];
  const RED: [number, number, number]    = [220, 38, 38];
  const INDIGO: [number, number, number] = [99, 102, 241];
  const STONE: [number, number, number]  = [120, 113, 108];
  const TEXT: [number, number, number]   = [30, 41, 59];
  const MUTED: [number, number, number]  = [100, 116, 139];
  const LIGHT: [number, number, number]  = [248, 250, 252];
  const BORDER: [number, number, number] = [226, 232, 240];

  const todayStr = new Date().toISOString().slice(0, 10);
  const todayFr  = new Date().toLocaleDateString('fr-MA', { day: '2-digit', month: 'long', year: 'numeric' });

  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
  const W = doc.internal.pageSize.getWidth();
  const H = doc.internal.pageSize.getHeight();
  const MX = 14;
  const CW = W - MX * 2;

  // ── Helper: charge une image via le loader injecté (proxy), ou fetch direct ─
  const loadImage = async (url: string): Promise<string | null> => {
    if (!url) return null;
    // 1. Utiliser le loader injecté (proxy serveur — pas de CORS)
    if (imageLoader) {
      try {
        const result = await imageLoader(url);
        if (result) return result;
      } catch (_) { /* continue to fallback */ }
    }
    // 2. Fallback : fetch direct (uniquement si CORS configuré côté Firebase)
    try {
      const resp = await fetch(url, { mode: 'cors', cache: 'no-store' });
      if (!resp.ok) return null;
      const blob = await resp.blob();
      return await new Promise<string | null>(resolve => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result as string);
        reader.onerror = () => resolve(null);
        reader.readAsDataURL(blob);
      });
    } catch (_) {
      return null;
    }
  };

  // ── Priority config ─────────────────────────────────────────────────────
  const PRIO: Record<string, { label: string; color: [number, number, number] }> = {
    urgent:    { label: 'URGENT',    color: RED },
    important: { label: 'IMPORTANT', color: AMBER },
    todo:      { label: 'À FAIRE',   color: STONE },
  };

  const urgentCount    = articles.filter(a => (a.priority || 'todo') === 'urgent').length;
  const importantCount = articles.filter(a => (a.priority || 'todo') === 'important').length;
  const todoCount      = articles.filter(a => (a.priority || 'todo') === 'todo').length;

  // ── PAGE 1 — Header + KPIs ──────────────────────────────────────────────
  let page = 1;
  const addPageFooter = () => {
    const pages = (doc as any).internal.getNumberOfPages();
    for (let i = 1; i <= pages; i++) {
      doc.setPage(i);
      doc.setFontSize(6.5);
      doc.setFont('helvetica', 'normal');
      doc.setTextColor(...MUTED);
      doc.text('LEBTEX TEXTILE IMPORT  |  31 Rue 65, Lot. Al Hamd Ain-Chock, Casablanca, Maroc', W / 2, H - 14.5, { align: 'center' });
      doc.text('Tél : +212 5 22 25 77 78  |  Email : Contact.lebtex@gmail.com', W / 2, H - 11, { align: 'center' });
      doc.setFillColor(...NAVY); doc.rect(0, H - 8, W, 8, 'F');
      doc.setFillColor(...GOLD); doc.rect(0, H - 8, 4, 8, 'F');
      doc.setFontSize(6.5); doc.setTextColor(148, 163, 184);
      doc.text(`LISTE DES BESOINS  |  ${todayStr}  |  USAGE INTERNE`, MX + 5, H - 3.5);
      doc.text(`Page ${i} / ${pages}`, W - MX, H - 3.5, { align: 'right' });
    }
  };

  let y = MX;

  // Logo
  await addPdfLogoHeader(doc, MX, y, 40, 20);

  // Title block
  doc.setTextColor(...NAVY);
  doc.setFontSize(18);
  doc.setFont('helvetica', 'bold');
  doc.text('LISTE DES BESOINS', W - MX, y + 5, { align: 'right' });

  doc.setDrawColor(...GOLD);
  doc.setLineWidth(0.6);
  doc.line(W - MX - 78, y + 8, W - MX, y + 8);

  doc.setFontSize(8);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(...MUTED);
  doc.text(`Date : ${todayFr}`, W - MX, y + 14, { align: 'right' });
  doc.text(`${articles.length} article${articles.length > 1 ? 's' : ''} à commander`, W - MX, y + 19, { align: 'right' });
  y += 28;

  // KPI bar
  const kpis: [string, string, [number,number,number]][] = [
    ['URGENT',    String(urgentCount),    RED],
    ['IMPORTANT', String(importantCount), AMBER],
    ['À FAIRE',   String(todoCount),      STONE],
    ['TOTAL',     String(articles.length), NAVY],
  ];
  const kW = CW / kpis.length;
  kpis.forEach(([label, value, color], i) => {
    const kx = MX + i * kW;
    const isLast = i === kpis.length - 1;
    doc.setFillColor(isLast ? NAVY[0] : 245, isLast ? NAVY[1] : 245, isLast ? NAVY[2] : 244);
    doc.roundedRect(kx + (i > 0 ? 2 : 0), y, kW - 2, 18, 2, 2, 'F');
    doc.setFontSize(7);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(isLast ? 200 : color[0], isLast ? 200 : color[1], isLast ? 200 : color[2]);
    doc.text(label, kx + (i > 0 ? 6 : 4), y + 6);
    doc.setFontSize(isLast ? 14 : 13);
    doc.setTextColor(isLast ? 255 : TEXT[0], isLast ? 255 : TEXT[1], isLast ? 255 : TEXT[2]);
    doc.text(value, kx + (i > 0 ? 6 : 4), y + 14);
  });
  y += 25;

  // ── Render articles by priority order ───────────────────────────────────
  const sortedArticles = [...articles].sort((a, b) => {
    const order: Record<string, number> = { urgent: 0, important: 1, todo: 2 };
    const pa = order[a.priority || 'todo'] ?? 2;
    const pb = order[b.priority || 'todo'] ?? 2;
    return pa - pb;
  });

  const IMG_W = 28;
  const IMG_H = 28;
  const ROW_H = 34;
  const COL_LEFT = MX + IMG_W + 5;
  const COL_RIGHT = W - MX;

  for (let idx = 0; idx < sortedArticles.length; idx++) {
    const a = sortedArticles[idx];

    // Check if we need a new page
    if (y + ROW_H + 4 > H - 20) {
      doc.addPage();
      y = MX;
    }

    const prio = PRIO[a.priority || 'todo'] || PRIO.todo;

    // Card background
    doc.setFillColor(...LIGHT);
    doc.setDrawColor(...BORDER);
    doc.setLineWidth(0.2);
    doc.roundedRect(MX, y, CW, ROW_H, 2, 2, 'FD');

    // Priority accent bar (left side)
    doc.setFillColor(...prio.color);
    doc.roundedRect(MX, y, 2.5, ROW_H, 1, 1, 'F');

    // Image (or colored placeholder)
    // Note: some articles have imageUrl stored as the string "undefined" — filter it out
    const rawUrl = a.imageUrl || a.designImageUrl || a.image || '';
    const imgUrl = (rawUrl && rawUrl !== 'undefined' && rawUrl.startsWith('http')) ? rawUrl : '';
    console.log(`[PDF] Article: "${a.name || a.categoryId}" | imgUrl: "${imgUrl ? imgUrl.slice(0, 60) + '...' : 'vide'}"`);
    const imgData = imgUrl ? await loadImage(imgUrl) : null;
    console.log(`[PDF] → ${imgData ? 'Image chargée ✓' : 'Placeholder ✗'}`);
    if (imgData) {
      try {
        // Auto-détecter le format depuis le data URL
        const fmt = imgData.startsWith('data:image/png') ? 'PNG' : 'JPEG';
        doc.addImage(imgData, fmt, MX + 4, y + 3, IMG_W, IMG_H);
      } catch (e) {
        console.error('[PDF] addImage FAILED:', e, '| data length:', imgData?.length, '| prefix:', imgData?.slice(0, 30));
        // Placeholder
        doc.setFillColor(...prio.color);
        doc.roundedRect(MX + 4, y + 3, IMG_W, IMG_H, 2, 2, 'F');
        doc.setTextColor(255, 255, 255);
        doc.setFontSize(9);
        doc.setFont('helvetica', 'bold');
        const initials = (a.name || a.categoryId || '?').slice(0, 2).toUpperCase();
        doc.text(initials, MX + 4 + IMG_W / 2, y + 3 + IMG_H / 2 + 2, { align: 'center' });
      }
    } else {
      // Colored placeholder
      doc.setFillColor(prio.color[0], prio.color[1], prio.color[2]);
      doc.roundedRect(MX + 4, y + 3, IMG_W, IMG_H, 2, 2, 'F');
      doc.setTextColor(255, 255, 255);
      doc.setFontSize(10);
      doc.setFont('helvetica', 'bold');
      const initials = (a.name || a.categoryId || '?').slice(0, 2).toUpperCase();
      doc.text(initials, MX + 4 + IMG_W / 2, y + 3 + IMG_H / 2 + 3, { align: 'center' });
    }

    // Priority badge (top-right of card)
    doc.setFillColor(...prio.color);
    doc.roundedRect(COL_RIGHT - 22, y + 3, 20, 6, 1, 1, 'F');
    doc.setTextColor(255, 255, 255);
    doc.setFontSize(5.5);
    doc.setFont('helvetica', 'bold');
    doc.text(prio.label, COL_RIGHT - 12, y + 7, { align: 'center' });

    // Article name
    doc.setTextColor(...NAVY);
    doc.setFontSize(10);
    doc.setFont('helvetica', 'bold');
    const artName = (a.name || a.categoryId || 'Article').toUpperCase();
    doc.text(artName.length > 40 ? artName.slice(0, 39) + '…' : artName, COL_LEFT, y + 9);

    // Category
    if (a.categoryId) {
      doc.setTextColor(...MUTED);
      doc.setFontSize(7);
      doc.setFont('helvetica', 'normal');
      doc.text((a.categoryId || '').toUpperCase(), COL_LEFT, y + 14);
    }

    // Ce qu'on commande : qualité, taille, couleur, ventilation et caractéristiques du modèle.
    // Une ligne de besoin sans caractéristiques, c'est une commande qui ne dit pas ce qu'on veut.
    const largeurInfo = (COL_RIGHT - 25) - COL_LEFT - 2;
    const uniteBesoin = (a.unitOfMeasure || '').toUpperCase();
    const lignesInfo = detailsArticle(a, { unite: uniteBesoin, max: 3 });
    if (a.supplierId) lignesInfo.push(`Fourn. : ${a.supplierId}`);
    const aBadgeClient = !!(a.isPreorder && a.clientName);
    // Deux lignes tiennent sous le nom quand aucun badge client ne vient s'y loger.
    const maxLignes = aBadgeClient ? 1 : 2;
    const aImprimer = lignesInfo.length > maxLignes
      ? [...lignesInfo.slice(0, maxLignes - 1), lignesInfo.slice(maxLignes - 1).join('  ·  ')]
      : lignesInfo;
    if (aImprimer.length > 0) {
      doc.setTextColor(...MUTED);
      doc.setFontSize(6.5);
      doc.setFont('helvetica', 'normal');
      aImprimer.forEach((ligne, i) => {
        doc.text(tronquer(doc, ligne, largeurInfo), COL_LEFT, y + 19.5 + i * 4);
      });
    }

    // Client badge if preorder
    if (a.isPreorder && a.clientName) {
      doc.setFillColor(...INDIGO);
      doc.roundedRect(COL_LEFT, y + 23, 30, 5.5, 1, 1, 'F');
      doc.setTextColor(255, 255, 255);
      doc.setFontSize(5.5);
      doc.setFont('helvetica', 'bold');
      doc.text(`👤 ${(a.clientName || '').toUpperCase()}`, COL_LEFT + 2, y + 27);
    }

    // Quantity + price block (right side)
    const qty = Number(a.quantity || 0);
    const price = Number(a.purchasePricePerUnit || 0);
    const total = qty * price;

    doc.setTextColor(...NAVY);
    doc.setFontSize(11);
    doc.setFont('helvetica', 'bold');
    doc.text(
      `${qty.toLocaleString('fr-MA')} ${(a.unitOfMeasure || 'U').toUpperCase()}`,
      COL_RIGHT - 25,
      y + 16,
      { align: 'right' }
    );

    if (price > 0) {
      doc.setFontSize(7.5);
      doc.setTextColor(...MUTED);
      doc.text(
        `P.A: $${price.toFixed(4)}`,
        COL_RIGHT - 25,
        y + 22,
        { align: 'right' }
      );
      doc.setFontSize(8);
      doc.setFont('helvetica', 'bold');
      doc.setTextColor(180, 100, 0);
      doc.text(
        `$${total.toLocaleString('fr-MA', { maximumFractionDigits: 2 })}`,
        COL_RIGHT - 25,
        y + 28,
        { align: 'right' }
      );
    }

    // Separator line number
    doc.setTextColor(200, 200, 200);
    doc.setFontSize(7);
    doc.setFont('helvetica', 'normal');
    doc.text(`${idx + 1}`, MX + 3, y + ROW_H - 2);

    y += ROW_H + 3;
  }

  // ── Summary totals ───────────────────────────────────────────────────────
  if (y + 20 > H - 20) { doc.addPage(); y = MX; }

  const totalQty = articles.reduce((s, a) => s + Number(a.quantity || 0), 0);
  const totalVal = articles.reduce((s, a) => s + (Number(a.quantity || 0) * Number(a.purchasePricePerUnit || 0)), 0);

  doc.setFillColor(...NAVY);
  doc.roundedRect(MX, y + 2, CW, 16, 2, 2, 'F');
  doc.setFillColor(...GOLD);
  doc.roundedRect(MX, y + 2, 3, 16, 1, 1, 'F');

  doc.setTextColor(255, 255, 255);
  doc.setFontSize(8);
  doc.setFont('helvetica', 'bold');
  doc.text(`TOTAL — ${articles.length} ARTICLE${articles.length > 1 ? 'S' : ''}`, MX + 8, y + 11);

  doc.setTextColor(...GOLD);
  doc.setFontSize(8);
  doc.text(
    `Quantité : ${totalQty.toLocaleString('fr-MA')}  |  Valeur estimée : $${totalVal.toLocaleString('fr-MA', { maximumFractionDigits: 2 })}`,
    W - MX,
    y + 11,
    { align: 'right' }
  );

  addPageFooter();

  doc.save(`Besoins_LEBTEX_${todayStr}.pdf`);
}

// ── Export Commercial PDF ─────────────────────────────────────────────────────
// For sales team: shows articles per color/size with selling prices set by admin.
// NO cost data (pauTtc, marge, etc.) is included in this PDF.
export async function exportCommercialPDF(
  clientName: string,
  rows: any[] // each row has: categoryId, name, color, size, quantity, unitOfMeasure, _prixVente, _dossierLabel
): Promise<void> {
  const { jsPDF } = await import('jspdf');
  const autoTable = (await import('jspdf-autotable')).default;

  const NAVY = [15, 23, 42] as [number, number, number];
  const GOLD = [196, 160, 98] as [number, number, number];
  const WHITE = [255, 255, 255] as [number, number, number];
  const LIGHT = [248, 247, 244] as [number, number, number];

  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
  const W = doc.internal.pageSize.getWidth();
  const H = doc.internal.pageSize.getHeight();
  const MX = 14;
  const today = new Date();
  const todayStr = today.toLocaleDateString('fr-FR', { day: '2-digit', month: 'long', year: 'numeric' });
  const ref = `OFF-${Date.now().toString().slice(-8)}`;

  // ── PAGE FOOTER helper ──────────────────────────────────────────────────────
  const addPageFooter = () => {
    const pg = (doc as any).internal.getCurrentPageInfo().pageNumber;
    doc.setFillColor(...NAVY);
    doc.rect(0, H - 12, W, 12, 'F');
    doc.setFillColor(...GOLD);
    doc.rect(0, H - 12, 5, 12, 'F');
    doc.setTextColor(...WHITE);
    doc.setFontSize(7);
    doc.setFont('helvetica', 'normal');
    doc.text('LEBTEX TEXTILE IMPORT  |  31 Rue 65, Lot. Al Hamd Ain-Chock, Casablanca', MX, H - 5);
    doc.text(`Page ${pg}  |  Réf : ${ref}`, W - MX, H - 5, { align: 'right' });
  };

  // ── HEADER ──────────────────────────────────────────────────────────────────
  doc.setFillColor(...NAVY);
  doc.rect(0, 0, W, 38, 'F');
  doc.setFillColor(...GOLD);
  doc.rect(0, 0, 5, 38, 'F');

  await addPdfLogoHeader(doc, 10, 5, 50, 25, true);

  doc.setTextColor(...WHITE);
  doc.setFontSize(20);
  doc.setFont('helvetica', 'bold');
  doc.text('OFFRE COMMERCIALE', W - MX, 16, { align: 'right' });
  doc.setFontSize(9);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(...GOLD);
  doc.text('LEBTEX TEXTILE IMPORT', W - MX, 24, { align: 'right' });

  // ── INFO BOX ──────────────────────────────────────────────────────────────
  let y = 46;
  doc.setFillColor(...LIGHT);
  doc.roundedRect(MX, y, W - MX * 2, 22, 2, 2, 'F');
  doc.setDrawColor(...GOLD);
  doc.setLineWidth(0.5);
  doc.line(MX, y, MX, y + 22);

  doc.setTextColor(...NAVY);
  doc.setFontSize(9);
  doc.setFont('helvetica', 'bold');
  doc.text('CLIENT :', MX + 4, y + 7);
  doc.setFont('helvetica', 'normal');
  doc.text(clientName.toUpperCase(), MX + 24, y + 7);

  doc.setFont('helvetica', 'bold');
  doc.text('DATE :', MX + 4, y + 14);
  doc.setFont('helvetica', 'normal');
  doc.text(todayStr, MX + 24, y + 14);

  doc.setFont('helvetica', 'bold');
  doc.text('RÉF. OFFRE :', W / 2 + 4, y + 7);
  doc.setFont('helvetica', 'normal');
  doc.text(ref, W / 2 + 28, y + 7);

  doc.setFont('helvetica', 'bold');
  doc.text('VALIDITÉ :', W / 2 + 4, y + 14);
  doc.setFont('helvetica', 'normal');
  doc.text('15 jours à compter de la date ci-dessus', W / 2 + 28, y + 14);

  y += 28;

  // ── GROUP ROWS BY DOSSIER ─────────────────────────────────────────────────
  const grouped: Record<string, any[]> = {};
  rows.forEach(row => {
    const key = row._dossierLabel || 'Sans dossier';
    if (!grouped[key]) grouped[key] = [];
    grouped[key].push(row);
  });

  let grandTotalQty = 0;
  let grandTotalTtc = 0;
  const photoRows: { label: string; imageUrl: string; color: string; qty: number; pu: number }[] = [];

  for (const [dossierLabel, dossierRows] of Object.entries(grouped)) {
    // Dossier label
    if (y > H - 50) { doc.addPage(); addPageFooter(); y = 20; }
    doc.setFillColor(...NAVY);
    doc.roundedRect(MX, y, W - MX * 2, 8, 1, 1, 'F');
    doc.setTextColor(...GOLD);
    doc.setFontSize(7.5);
    doc.setFont('helvetica', 'bold');
    doc.text(`DOSSIER : ${dossierLabel.toUpperCase()}`, MX + 4, y + 5.5);
    y += 11;

    // Table data
    const tableBody: any[][] = [];
    let dosQty = 0;
    let dosTtc = 0;

    dossierRows.forEach((row, idx) => {
      const qty = Number(row._totalQty) || Number(row.quantity) || 0;
      const pu = Number(row._prixVente) || 0;
      const total = qty * pu;
      dosQty += qty;
      dosTtc += total;
      grandTotalQty += qty;
      grandTotalTtc += total;
      // La désignation porte les caractéristiques du produit ; la colonne variantes montre les
      // couleurs ou tailles réellement commandées, jamais la mention interne « various ».
      const uniteRow = (row.unitOfMeasure || '').toUpperCase();
      const designation = [
        (row.categoryId || row.name || '—').toUpperCase(),
        ...detailsArticle(row, { unite: uniteRow, max: 3, ignorer: ['color', 'size'] }),
      ].filter(Boolean).join('\n');
      // Le résumé fourni par l'écran retombe sur la couleur de l'article, qui peut valoir
      // « various » : on ne le reprend que s'il dit quelque chose.
      const variantes = libelleFixe(row._variantsSummary)
        || celluleCouleur(row, uniteRow, '')
        || celluleDimension(row, 'size', row.size, uniteRow, '')
        || '—';
      tableBody.push([
        idx + 1,
        designation,
        variantes,
        qty.toLocaleString('fr-MA'),
        row.unitOfMeasure || 'u',
        pu > 0 ? pu.toLocaleString('fr-MA', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : '—',
        total > 0 ? total.toLocaleString('fr-MA', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : '—',
      ]);

      // Collect photo for CURSEURS only (slider/puller articles with a designImageUrl)
      const catUpper = ((row.categoryId || row.name || '') + '').toUpperCase();
      const isCurseur = catUpper.includes('SLIDER') || catUpper.includes('PULLER');
      const imgUrl = row.designImageUrl || row.imageUrl || '';
      if (isCurseur && imgUrl && !photoRows.find(p => p.imageUrl === imgUrl)) {
        photoRows.push({
          label: (row.categoryId || row.name || '—').toUpperCase(),
          imageUrl: imgUrl,
          color: row.designRef || row._variantsSummary || row.color || '',
          qty,
          pu,
        });
      }
    });

    autoTable(doc, {
      startY: y,
      head: [['#', 'Désignation', 'Couleurs / Variantes', 'Quantité', 'U.M.', 'P.U. TTC (MAD)', 'Total TTC (MAD)']],
      body: tableBody,
      margin: { left: MX, right: MX },
      styles: { font: 'helvetica', fontSize: 8, cellPadding: 3, textColor: [30, 30, 30] },
      headStyles: {
        fillColor: [40, 40, 60],
        textColor: WHITE,
        fontStyle: 'bold',
        fontSize: 7.5,
        halign: 'center',
      },
      columnStyles: {
        0: { halign: 'center', cellWidth: 8 },
        1: { cellWidth: 40 },
        2: { cellWidth: 52, fontSize: 7 },
        3: { halign: 'right', cellWidth: 18 },
        4: { halign: 'center', cellWidth: 12 },
        5: { halign: 'right', cellWidth: 26, fontStyle: 'bold' },
        6: { halign: 'right', cellWidth: 26, fontStyle: 'bold', textColor: NAVY },
      },
      alternateRowStyles: { fillColor: LIGHT },
      didDrawPage: () => addPageFooter(),
    });

    y = (doc as any).lastAutoTable.finalY + 4;

    // Dossier sub-total
    doc.setFillColor(240, 245, 255);
    doc.roundedRect(W - MX - 90, y, 90, 12, 1, 1, 'F');
    doc.setTextColor(...NAVY);
    doc.setFontSize(8);
    doc.setFont('helvetica', 'bold');
    doc.text(`Sous-total dossier : ${dosTtc.toLocaleString('fr-MA', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} MAD`, W - MX - 4, y + 8, { align: 'right' });
    y += 18;
  }

  // ── PHOTOS SECTION ─────────────────────────────────────────────────────────
  if (photoRows.length > 0) {
    doc.addPage();
    addPageFooter();
    let py = 16;

    // Section header
    doc.setFillColor(...NAVY);
    doc.rect(0, 0, W, 14, 'F');
    doc.setFillColor(...GOLD);
    doc.rect(0, 0, 5, 14, 'F');
    doc.setTextColor(...WHITE);
    doc.setFontSize(11);
    doc.setFont('helvetica', 'bold');
    doc.text('VISUELS PRODUITS', MX + 4, 10);

    py = 20;

    // Grid: 3 photos per row
    const COLS = 3;
    const CELL_W = (W - MX * 2 - (COLS - 1) * 6) / COLS;
    const CELL_H = 60;
    const IMG_H = 44;

    for (let i = 0; i < photoRows.length; i++) {
      const col = i % COLS;
      const row = Math.floor(i / COLS);
      const cx = MX + col * (CELL_W + 6);
      const cy = py + row * (CELL_H + 6);

      // Check page overflow
      if (cy + CELL_H > H - 18) {
        doc.addPage();
        addPageFooter();
        py = 18;
        const newRow = Math.floor(i / COLS) - Math.floor((i > 0 ? i : 0) / COLS);
        const newCy = 18 + (i % (COLS * Math.ceil((H - 36) / (CELL_H + 6)))) % Math.ceil((H - 36) / (CELL_H + 6)) * (CELL_H + 6);
        void newRow; void newCy;
      }

      const actualCy = py + (Math.floor(i / COLS) % Math.ceil((H - 36) / (CELL_H + 6))) * (CELL_H + 6);

      // Card background
      doc.setFillColor(250, 250, 248);
      doc.roundedRect(cx, actualCy, CELL_W, CELL_H, 2, 2, 'F');
      doc.setDrawColor(220, 220, 215);
      doc.setLineWidth(0.3);
      doc.roundedRect(cx, actualCy, CELL_W, CELL_H, 2, 2, 'S');

      // Try to add image via canvas
      try {
        const dataUrl = await new Promise<string | null>((resolve) => {
          const img = new Image();
          img.crossOrigin = 'anonymous';
          img.onload = () => {
            const canvas = document.createElement('canvas');
            canvas.width = img.naturalWidth;
            canvas.height = img.naturalHeight;
            const ctx = canvas.getContext('2d');
            if (!ctx) { resolve(null); return; }
            ctx.drawImage(img, 0, 0);
            resolve(canvas.toDataURL('image/jpeg', 0.85));
          };
          img.onerror = () => resolve(null);
          img.src = photoRows[i].imageUrl;
        });

        if (dataUrl) {
          const imgObj = new Image();
          imgObj.src = dataUrl;
          const aspect = imgObj.naturalWidth > 0 ? imgObj.naturalHeight / imgObj.naturalWidth : 1;
          const displayW = CELL_W - 6;
          const displayH = Math.min(IMG_H, displayW * aspect);
          const imgX = cx + (CELL_W - displayW) / 2;
          const imgY = actualCy + 3;
          doc.addImage(dataUrl, 'JPEG', imgX, imgY, displayW, displayH);
        } else {
          doc.setFillColor(235, 235, 230);
          doc.rect(cx + 3, actualCy + 3, CELL_W - 6, IMG_H, 'F');
          doc.setTextColor(180, 180, 175);
          doc.setFontSize(7);
          doc.setFont('helvetica', 'italic');
          doc.text('Photo non disponible', cx + CELL_W / 2, actualCy + IMG_H / 2 + 3, { align: 'center' });
        }
      } catch (_) {
        doc.setFillColor(235, 235, 230);
        doc.rect(cx + 3, actualCy + 3, CELL_W - 6, IMG_H, 'F');
      }

      // Label
      doc.setTextColor(...NAVY);
      doc.setFontSize(6.5);
      doc.setFont('helvetica', 'bold');
      const labelY = actualCy + IMG_H + 8;
      doc.text(photoRows[i].label, cx + CELL_W / 2, labelY, { align: 'center', maxWidth: CELL_W - 4 });
      if (photoRows[i].color) {
        doc.setTextColor(120, 120, 120);
        doc.setFontSize(6);
        doc.setFont('helvetica', 'normal');
        doc.text(photoRows[i].color, cx + CELL_W / 2, labelY + 4.5, { align: 'center', maxWidth: CELL_W - 4 });
      }
    }
  }

  addPageFooter();

  doc.save(`Offre_Commerciale_${clientName.replace(/\s+/g, '_')}_${new Date().toISOString().split('T')[0]}.pdf`);
}

export async function exportBaseOrderPDF(order: any) {
  const { default: jsPDF } = await import("jspdf");
  const { default: autoTable } = await import("jspdf-autotable");

  const NAVY: [number, number, number]   = [15, 23, 42];
  const GOLD: [number, number, number]   = [196, 160, 98];
  const WHITE: [number, number, number]  = [255, 255, 255];
  const MUTED: [number, number, number]  = [100, 116, 139];
  const BORDER: [number, number, number] = [226, 232, 240];
  const BG: [number, number, number]     = [248, 250, 252];
  const GOLD_LIGHT: [number, number, number] = [254, 249, 240];

  function fmtNum(n: number) {
    if (n == null || isNaN(n)) return "0";
    return n.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  }
  function fmtQty(qty: number, unit: string) {
    return `${fmtNum(Number(qty))} ${unit || ""}`.trim();
  }

  const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
  const W = doc.internal.pageSize.getWidth();
  const H = doc.internal.pageSize.getHeight();
  const MX = 15;
  const CW = W - MX * 2;

  const today = new Date().toLocaleDateString("en-GB", { day: "2-digit", month: "long", year: "numeric" });
  const todayStr = new Date().toISOString().slice(0, 10);
  const ref = `PO-LBX-${Date.now().toString().slice(-8)}`;
  let y = 0;

  // ════════════════════════════════════════════════════════════════════════
  // HEADER BAND — full-width navy
  // ════════════════════════════════════════════════════════════════════════
  doc.setFillColor(...NAVY);
  doc.rect(0, 0, W, 38, "F");

  doc.setFillColor(...GOLD);
  doc.rect(0, 0, 5, 38, "F");

  try {
    await addPdfLogoHeader(doc, 10, 5, 50, 25, true);
  } catch (e) {}

  doc.setTextColor(...WHITE);
  doc.setFontSize(20);
  doc.setFont("helvetica", "bold");
  doc.text("PURCHASE ORDER", W - MX, 18, { align: "right" });

  doc.setFontSize(8);
  doc.setFont("helvetica", "normal");
  doc.setTextColor(...GOLD);
  doc.text(`Ref: ${ref}`, W - MX, 26, { align: "right" });
  doc.setTextColor(148, 163, 184);
  doc.text(`Date: ${today}`, W - MX, 31, { align: "right" });

  y = 44;

  // ════════════════════════════════════════════════════════════════════════
  // FROM / TO BLOCK
  // ════════════════════════════════════════════════════════════════════════
  const colW = (CW - 6) / 2;

  // FROM — LEBTEX
  doc.setFillColor(...BG);
  doc.setDrawColor(...BORDER);
  doc.setLineWidth(0.3);
  doc.roundedRect(MX, y, colW, 34, 1, 1, "FD");
  doc.setFillColor(...GOLD);
  doc.roundedRect(MX, y, colW, 6, 1, 1, "F");
  doc.rect(MX, y + 3, colW, 3, "F");
  doc.setTextColor(...NAVY);
  doc.setFontSize(7);
  doc.setFont("helvetica", "bold");
  doc.text("FROM", MX + 4, y + 4.5);

  doc.setFontSize(9);
  doc.setFont("helvetica", "bold");
  doc.setTextColor(...NAVY);
  doc.text("LEBTEX TEXTILE IMPORT", MX + 4, y + 12);
  doc.setFontSize(7.5);
  doc.setFont("helvetica", "normal");
  doc.setTextColor(...MUTED);
  doc.text("31 Rue 65, Lot. Al Hamd Ain-Chock", MX + 4, y + 17);
  doc.text("Casablanca, Morocco", MX + 4, y + 21.5);
  doc.text("Tel: +212 6 61 10 15 60", MX + 4, y + 26);
  doc.text("Contact.lebtex@gmail.com", MX + 4, y + 30);

  // TO — Supplier
  const toX = MX + colW + 6;
  doc.setFillColor(...BG);
  doc.setDrawColor(...BORDER);
  doc.roundedRect(toX, y, colW, 34, 1, 1, "FD");
  doc.setFillColor(...NAVY);
  doc.roundedRect(toX, y, colW, 6, 1, 1, "F");
  doc.rect(toX, y + 3, colW, 3, "F");
  doc.setTextColor(...WHITE);
  doc.setFontSize(7);
  doc.setFont("helvetica", "bold");
  doc.text("TO  (SUPPLIER)", toX + 4, y + 4.5);

  const supplierName = "SUPPLIER NAME";
  const supplierAddr = "Address: __________________________";
  const supplierCity = "City / Country: ___________________";
  const supplierTel  = "Tel: ______________________________";
  const supplierMail = "Email: ____________________________";

  doc.setFontSize(9);
  doc.setFont("helvetica", "bold");
  doc.setTextColor(...NAVY);
  doc.text(supplierName, toX + 4, y + 12);
  doc.setFontSize(7.5);
  doc.setFont("helvetica", "normal");
  doc.setTextColor(...MUTED);
  doc.text(supplierAddr, toX + 4, y + 17);
  doc.text(supplierCity, toX + 4, y + 21.5);
  doc.text(supplierTel,  toX + 4, y + 26);
  doc.text(supplierMail, toX + 4, y + 30);

  y += 40;
  
  if (order.name || order.description) {
    doc.setTextColor(...NAVY);
    doc.setFontSize(10);
    doc.setFont("helvetica", "bold");
    if (order.name) {
      doc.text(`Dossier: ${order.name.toUpperCase()}`, MX, y);
      y += 5;
    }
    if (order.description) {
      doc.setFontSize(8);
      doc.setFont("helvetica", "italic");
      doc.text(`Notes: ${order.description}`, MX, y);
      y += 5;
    }
    y += 5;
  }

  // Loop through all items
  const items = order.items || [];
  
  for (let idx = 0; idx < items.length; idx++) {
    const article = items[idx];
    
    // Check if we need a new page for the article banner
    if (y + 60 > H) {
      doc.addPage();
      y = MX;
    }

    // ════════════════════════════════════════════════════════════════════════
    // ARTICLE BANNER
    // ════════════════════════════════════════════════════════════════════════
    doc.setFillColor(...NAVY);
    doc.roundedRect(MX, y, CW, 14, 1.5, 1.5, "F");
    doc.setFillColor(...GOLD);
    doc.rect(MX, y, 5, 14, "F");
    doc.roundedRect(MX, y, 5, 14, 1.5, 1.5, "F");

    doc.setTextColor(...WHITE);
    doc.setFontSize(13);
    doc.setFont("helvetica", "bold");
    doc.text((article.categoryId || "ARTICLE").toUpperCase(), MX + 10, y + 9.5);

    doc.setFontSize(8);
    doc.setFont("helvetica", "normal");
    doc.setTextColor(...GOLD);
    doc.text(`TOTAL QTY: ${fmtQty(article.quantity, article.unitOfMeasure)}`, W - MX - 2, y + 5.5, { align: "right" });
    doc.setTextColor(148, 163, 184);
    doc.setFontSize(7);
    doc.text(`Unit: ${article.unitOfMeasure || "—"}`, W - MX - 2, y + 10.5, { align: "right" });

    y += 20;

    // ════════════════════════════════════════════════════════════════════════
    // ORDER SPECIFICATIONS GRID
    // ════════════════════════════════════════════════════════════════════════
    doc.setFontSize(8.5);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(...NAVY);
    doc.text("ORDER SPECIFICATIONS", MX, y);
    doc.setDrawColor(...GOLD);
    doc.setLineWidth(0.5);
    doc.line(MX + 44, y - 1, W - MX, y - 1);
    y += 4;

    // Une dimension ventilée s'annonce par son nombre de lignes ; le détail est dans le
    // tableau de ventilation juste en dessous. « VARIOUS » est notre marque interne : le
    // fournisseur ne doit jamais la lire sur sa commande.
    const libelleDimension = (
      dimension: DimensionVentilation,
      valeurFixe: unknown,
      motPluriel: string,
    ): string => {
      const lignes = lignesVentilation(article).filter(l => l.dimension === dimension);
      if (lignes.length > 0) return `${lignes.length} ${motPluriel}`;
      const fixe = libelleFixe(valeurFixe);
      return fixe ? fixe.toUpperCase() : "—";
    };

    const specs: [string,string][] = [
      ["Category / Product",  (article.categoryId || "—").toUpperCase()],
      ["Size",                libelleDimension('size', article.size, 'SIZE(S)')],
      ["Color",               libelleDimension('color', article.color, 'COLOR(S)')],
      ["Quantity Ordered",    fmtQty(article.quantity, article.unitOfMeasure)],
      ["Base Unit Price",     article.purchasePricePerUnit ? `$${Number(article.purchasePricePerUnit).toFixed(4)}` : "—"],
      ["Total Value",         article.purchasePricePerUnit && article.quantity ? `$${(Number(article.purchasePricePerUnit) * Number(article.quantity)).toFixed(2)}` : "—"],
    ];

    const qualityLabel = libelleDimension('quality', qualiteDeLArticle(article), 'QUALITY(IES)');
    if (qualityLabel !== "—") specs.push(["Quality", qualityLabel]);
    // Les caractéristiques sortent du modèle de la famille : le fournisseur d'un fil, d'un
    // curseur, d'un ruban ou d'un accessoire reçoit enfin les siennes, pas une case vide.
    specsArticleEn(article).forEach(([label, valeur]) => specs.push([label, valeur]));
    const technicalNote = libelleFixe(article.specs);
    if (technicalNote) specs.push(["Technical Notes", technicalNote]);

    const specCols = 2;
    const cellW = CW / specCols;
    const cellH = 10;
    // La grille se dessine d'un bloc, sans saut de page : avec le modèle complet d'une fermeture
    // elle peut atteindre huit lignes et sortir de la feuille. On vérifie donc qu'elle tient
    // AVANT de la commencer, et on passe à la page suivante sinon.
    const hauteurGrille = Math.ceil(specs.length / specCols) * cellH;
    if (y + hauteurGrille > H - MX) {
      doc.addPage();
      y = MX;
    }
    specs.forEach((s, i) => {
      const col = i % specCols;
      const row = Math.floor(i / specCols);
      const cx = MX + col * cellW;
      const cy = y + row * cellH;

      if (col % 2 === 0) doc.setFillColor(...BG); else doc.setFillColor(...WHITE);
      doc.setDrawColor(...BORDER);
      doc.setLineWidth(0.2);
      doc.rect(cx, cy, cellW, cellH, "FD");

      doc.setFontSize(6.5);
      doc.setFont("helvetica", "normal");
      doc.setTextColor(...MUTED);
      doc.text(s[0].toUpperCase(), cx + 3, cy + 3.5);

      doc.setFontSize(8.5);
      doc.setFont("helvetica", "bold");
      doc.setTextColor(...NAVY);
      const lines = doc.splitTextToSize(s[1], cellW - 6);
      doc.text(lines[0], cx + 3, cy + 8);
    });

    const specRows = Math.ceil(specs.length / specCols);
    y += specRows * cellH + 10;

    // ════════════════════════════════════════════════════════════════════════
    // BREAKDOWN TABLES
    // ════════════════════════════════════════════════════════════════════════
    const qualityBreakdown: any[] = Array.isArray(article.qualityBreakdown) ? article.qualityBreakdown : [];
    const colorBreakdown: any[] = Array.isArray(article.colorBreakdown) ? article.colorBreakdown : [];
    const sizeBreakdown:  any[] = Array.isArray(article.sizeBreakdown)  ? article.sizeBreakdown  : [];

    const drawTable = (title: string, head: string[][], body: any[][], totalRow: any[]) => {
      if (y + 30 > H) {
        doc.addPage();
        y = MX;
      }

      doc.setFontSize(8.5);
      doc.setFont("helvetica", "bold");
      doc.setTextColor(...NAVY);
      doc.text(title, MX, y);
      doc.setDrawColor(...GOLD);
      doc.setLineWidth(0.4);
      doc.line(MX + title.length * 1.6, y - 1, W - MX, y - 1);
      y += 3;

      body.push(totalRow);

      autoTable(doc, {
        startY: y,
        head,
        body,
        margin: { left: MX, right: MX, bottom: 25 },
        styles: {
          fontSize: 8,
          cellPadding: { top: 2.5, bottom: 2.5, left: 3, right: 3 },
          font: "helvetica",
          textColor: [30, 41, 59],
          lineColor: BORDER,
          lineWidth: 0.15,
        },
        headStyles: {
          fillColor: NAVY,
          textColor: WHITE,
          fontSize: 7.5,
          fontStyle: "bold",
          halign: "left",
        },
        alternateRowStyles: { fillColor: [249, 250, 251] },
        didParseCell: (data) => {
          if (data.row.index === body.length - 1 && data.section === "body") {
            data.cell.styles.fillColor = GOLD_LIGHT;
            data.cell.styles.fontStyle = "bold";
            data.cell.styles.textColor = NAVY;
          }
        },
        columnStyles: {
          0: { cellWidth: 10, textColor: MUTED, halign: "center" },
          [head[0].length - 1]: { halign: "right", fontStyle: "bold", textColor: NAVY, cellWidth: 30 },
          [head[0].length - 2]: { halign: "right", fontStyle: "normal", cellWidth: 25 },
          [head[0].length - 3]: { halign: "right", fontStyle: "normal", cellWidth: 25 },
        },
      });

      y = (doc as any).lastAutoTable.finalY + 10;
    };

    if (qualityBreakdown.length > 0) {
      let totalValue = 0;
      const rows = qualityBreakdown.map((r: any, i: number) => {
        const rowPrice = (r.priceOverride !== '' && r.priceOverride !== undefined && r.priceOverride !== null) ? Number(r.priceOverride) : Number(article.purchasePricePerUnit || 0);
        const qty = Number(r.quantity) || 0;
        const rowTotal = qty * rowPrice;
        totalValue += rowTotal;
        // Chaque qualité porte ses propres caractéristiques, celles de son type de produit.
        const specsDetail = specsLigneEn(article, r);
        const quality = qualiteDeLArticle(article, r);

        return [
          String(i + 1),
          `${(quality || "—").toUpperCase()}${specsDetail ? '\n' + specsDetail : ''}`,
          fmtQty(qty, article.unitOfMeasure),
          rowPrice > 0 ? `$${rowPrice.toFixed(4)}` : "—",
          rowTotal > 0 ? `$${rowTotal.toFixed(2)}` : "—"
        ];
      });
      drawTable("QUALITY BREAKDOWN", [["#", "Quality / Specifications", "Quantity", "Unit Price", "Total Price"]], rows, [
        "", "TOTAL", 
        fmtQty(qualityBreakdown.reduce((s, r) => s + (Number(r.quantity)||0), 0), article.unitOfMeasure),
        "", 
        totalValue > 0 ? `$${totalValue.toFixed(2)}` : "—"
      ]);
    } else if (colorBreakdown.length > 0) {
      let totalValue = 0;
      const rows = colorBreakdown.map((r: any, i: number) => {
        const rowPrice = (r.priceOverride !== '' && r.priceOverride !== undefined && r.priceOverride !== null) ? Number(r.priceOverride) : Number(article.purchasePricePerUnit || 0);
        const qty = Number(r.rolls) || 0;
        const rowTotal = qty * rowPrice;
        totalValue += rowTotal;
        return [
          String(i + 1),
          (libelleFixe(r.colorCode) || libelleFixe(r.description) || libelleFixe(r.color) || "—").toUpperCase(),
          fmtQty(qty, article.unitOfMeasure),
          rowPrice > 0 ? `$${rowPrice.toFixed(4)}` : "—",
          rowTotal > 0 ? `$${rowTotal.toFixed(2)}` : "—"
        ];
      });
      drawTable("COLOR BREAKDOWN", [["#", "Color / Code", "Quantity", "Unit Price", "Total Price"]], rows, [
        "", "TOTAL", 
        fmtQty(colorBreakdown.reduce((s, r) => s + (Number(r.rolls)||0), 0), article.unitOfMeasure),
        "", 
        totalValue > 0 ? `$${totalValue.toFixed(2)}` : "—"
      ]);
    } else if (sizeBreakdown.length > 0) {
      let totalValue = 0;
      const rows = sizeBreakdown.map((r: any, i: number) => {
        const rowPrice = (r.priceOverride !== '' && r.priceOverride !== undefined && r.priceOverride !== null) ? Number(r.priceOverride) : Number(article.purchasePricePerUnit || 0);
        const qty = Number(r.quantity) || 0;
        const rowTotal = qty * rowPrice;
        totalValue += rowTotal;
        return [
          String(i + 1),
          (libelleFixe(r.size) || "—").toUpperCase(),
          fmtQty(qty, "U"),
          rowPrice > 0 ? `$${rowPrice.toFixed(4)}` : "—",
          rowTotal > 0 ? `$${rowTotal.toFixed(2)}` : "—"
        ];
      });
      drawTable("SIZE BREAKDOWN", [["#", "Size", "Quantity", "Unit Price", "Total Price"]], rows, [
        "", "TOTAL", 
        fmtQty(sizeBreakdown.reduce((s, r) => s + (Number(r.quantity)||0), 0), "U"),
        "", 
        totalValue > 0 ? `$${totalValue.toFixed(2)}` : "—"
      ]);
    }
  }

  // ════════════════════════════════════════════════════════════════════════
  // TERMS & CONDITIONS
  // ════════════════════════════════════════════════════════════════════════
  if (y + 50 > H) {
    doc.addPage();
    y = MX;
  }

  doc.setFillColor(...GOLD_LIGHT);
  doc.setDrawColor(...GOLD);
  doc.setLineWidth(0.3);
  doc.roundedRect(MX, y, CW, 50, 1.5, 1.5, "FD");

  doc.setFontSize(8.5);
  doc.setFont("helvetica", "bold");
  doc.setTextColor(...GOLD);
  doc.text("TERMS & CONDITIONS", MX + 5, y + 7);
  doc.line(MX + 5, y + 8.5, MX + 40, y + 8.5);

  doc.setFontSize(7);
  doc.setFont("helvetica", "normal");
  doc.setTextColor(...NAVY);

  const terms = [
    "1. Please acknowledge receipt of this Purchase Order within 48 hours.",
    "2. All goods must strictly match the specifications, colors, and sizes requested.",
    "3. Any delay in shipping must be communicated immediately to our team.",
    "4. Invoices must reference Purchase Order number: " + ref,
    "5. LEBTEX reserves the right to reject defective products or those non-compliant with our quality standards."
  ];

  let ty = y + 14;
  terms.forEach(t => {
    doc.text(t, MX + 5, ty);
    ty += 5;
  });

  // Stamp / Signature
  doc.setFontSize(8);
  doc.setFont("helvetica", "bold");
  doc.setTextColor(...NAVY);
  doc.text("Authorized Signature", W - MX - 40, y + 40);
  doc.setDrawColor(...NAVY);
  doc.setLineWidth(0.2);
  doc.line(W - MX - 45, y + 42, W - MX - 10, y + 42);

  // Footer
  const pages = (doc as any).internal.getNumberOfPages();
  for (let i = 1; i <= pages; i++) {
    doc.setPage(i);
    doc.setFontSize(6.5);
    doc.setFont("helvetica", "normal");
    doc.setTextColor(...MUTED);
    doc.text(`Purchase Order  |  ${ref}  |  ${todayStr}  |  CONFIDENTIAL`, MX + 5, H - 3.5);
    doc.text(`Page ${i} / ${pages}`, W - MX, H - 3.5, { align: "right" });
  }

  doc.save(`PO_${(order.name || 'Base').replace(/[^a-zA-Z0-9]/g, '_')}_${todayStr}.pdf`);
}

// ── Packing Details PDF ─────────────────────────────────────────────────────
// Per-product layout, grouped by designation. No P.A. displayed.
export async function exportPackingDetailsPDF(facture: any, articles: any[], subCategories?: any[]) {
  const { default: jsPDF } = await import('jspdf');
  const { default: autoTable } = await import('jspdf-autotable');

  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
  const pageW = doc.internal.pageSize.getWidth();
  const pageH = doc.internal.pageSize.getHeight();
  const MX = 12;

  const NAVY  = [28, 25, 23]    as [number, number, number];
  const GOLD  = [251, 191, 36]  as [number, number, number];
  const WHITE = [255, 255, 255] as [number, number, number];
  const MUTED = [161, 161, 170] as [number, number, number];
  const STONE = [245, 245, 244] as [number, number, number];
  const VIOLET= [109, 40, 217]  as [number, number, number];
  const BLUE  = [29, 78, 216]   as [number, number, number];
  const AMBER = [146, 64, 14]   as [number, number, number];

  const dateStr = new Date().toLocaleDateString('fr-FR');

  const drawPageHeader = async (isFirst: boolean) => {
    doc.setFillColor(...NAVY);
    doc.rect(0, 0, pageW, isFirst ? 38 : 18, 'F');
    if (isFirst) {
      await addPdfLogoHeader(doc, MX, 5, 32, 16, true);
      doc.setTextColor(...GOLD);
      doc.setFontSize(8);
      doc.setFont('helvetica', 'bold');
      doc.text('PACKING DETAILS', MX + 36, 10);
      doc.setTextColor(...WHITE);
      doc.setFontSize(16);
      doc.text(String(facture.id || '—').toUpperCase(), MX + 36, 20);
      const metaLines = [
        facture.supplierId   ? `Fournisseur : ${facture.supplierId}`  : null,
        facture.arrivalDate  ? `ETA : ${facture.arrivalDate}`         : null,
        facture.shippingDate ? `ETD : ${facture.shippingDate}`        : null,
        facture.noBL         ? `N° BL : ${facture.noBL}`             : null,
        facture.forwarder    ? `Transitaire : ${facture.forwarder}`   : null,
        facture.shippingLine ? `Armateur : ${facture.shippingLine}`   : null,
      ].filter(Boolean) as string[];
      doc.setTextColor(...MUTED);
      doc.setFontSize(6.5);
      doc.setFont('helvetica', 'normal');
      let my = 8;
      metaLines.forEach(l => { doc.text(l, pageW - MX, my, { align: 'right' }); my += 3.8; });
      doc.setFontSize(6);
      doc.text(`Exporté le ${dateStr}`, pageW - MX, 37, { align: 'right' });
    } else {
      doc.setTextColor(...GOLD);
      doc.setFontSize(7);
      doc.setFont('helvetica', 'bold');
      doc.text(`PACKING DETAILS  —  ${String(facture.id || '').toUpperCase()}`, MX, 11);
      doc.setTextColor(...MUTED);
      doc.setFontSize(6);
      doc.setFont('helvetica', 'normal');
      doc.text(`Exporté le ${dateStr}`, pageW - MX, 11, { align: 'right' });
    }
  };

  await drawPageHeader(true);

  // ── Group articles by designation ────────────────────────────────────────
  type BreakRow = { label: string; qty: number; color?: [number, number, number] };
  type ArticleGroup = {
    name: string; displayName: string; colorLabel: string; unit: string; size: string; supplierId: string;
    specs: string; cbmTotal: number; nwTotal: number; pcsPerCtn: number;
    rows: BreakRow[]; breakLabel: string; totalQty: number;
  };

  const groupMap = new Map<string, ArticleGroup>();

  for (const art of articles) {
    const artName  = (art.name || art.categoryId || '—').toUpperCase();
    // La clé de regroupement se lit sur la couleur BRUTE : un article en « various » et un
    // article sans couleur portent le même nom mais ne sont pas la même marchandise, et les
    // fondre additionnerait leurs quantités, leur CBM et leur poids net dans le récapitulatif.
    const artColorBrut = String(art.color || '').trim().toUpperCase();
    // Pour l'affichage en revanche, « various » n'est pas une couleur : c'est la marque d'un
    // article ventilé. L'écrire ferait un tableau « NOM — VARIOUS » que le magasinier ne peut
    // rapprocher de rien.
    const artColor = (libelleFixe(art.color) || '').toUpperCase();
    const qb = Array.isArray(art.qualityBreakdown) ? art.qualityBreakdown : [];
    const cb = Array.isArray(art.colorBreakdown)  ? art.colorBreakdown  : [];
    const sb = Array.isArray(art.sizeBreakdown)   ? art.sizeBreakdown   : [];
    const db = Array.isArray(art.designBreakdown) ? art.designBreakdown : [];

    let rows: BreakRow[] = [];
    let breakLabel = 'Couleur';

    // Si l'article a des breakdowns structurés, on les utilise
    if (qb.length > 0) {
      breakLabel = 'Qualité';
      rows = qb.map((r: any) => {
        // Chaque qualité porte les caractéristiques de SON type de produit : le magasinier
        // contrôle le carton sur ce qui est écrit là.
        const specsDetail = specsLigne(art, r, subCategories);
        return {
          label: (qualiteDeLArticle(art, r) || '?').toUpperCase() + (specsDetail ? `\n${specsDetail}` : ''),
          qty: Number(r.quantity) || 0,
          color: VIOLET,
        };
      });
    } else if (cb.length > 0) {
      breakLabel = 'Couleur';
      rows = cb.map((r: any) => ({
        label: (libelleFixe(r.colorCode) || libelleFixe(r.description) || libelleFixe(r.color) || '?').toUpperCase(),
        qty: Number(r.rolls) || Number(r.quantity) || 0,
        color: VIOLET,
      }));
    } else if (sb.length > 0) {
      breakLabel = 'Taille';
      rows = sb.map((r: any) => ({
        label: (libelleFixe(r.size) || '?').toUpperCase() + (r.description ? `\n${r.description}` : ''),
        qty: Number(r.quantity) || 0,
        color: BLUE
      }));
    } else if (db.length > 0) {
      breakLabel = 'Modèle / Design';
      rows = db.map((r: any) => ({ label: (libelleFixe(r.designRef) || '?').toUpperCase(), qty: Number(r.rolls) || 0, color: AMBER }));
    } else {
      // Pas de breakdown : utiliser la taille comme label de ligne
      const sizeLabel = libelleFixe(art.size)?.toUpperCase() || null;
      if (sizeLabel) {
        breakLabel = 'Taille';
        rows = [{ label: sizeLabel, qty: Number(art.quantity) || 0, color: BLUE }];
      } else {
        breakLabel = 'Couleur';
        rows = [{ label: artColor || '—', qty: Number(art.quantity) || 0 }];
      }
    }

    // Clé de groupe : nom + couleur si couleur présente (et pas de colorBreakdown), sinon nom seul
    // Cela crée un tableau séparé par couleur, chaque tableau montrant les tailles
    const key = (qb.length === 0 && cb.length === 0 && artColorBrut) ? `${artName}||${artColorBrut}` : artName;

    const artQty = rows.reduce((s, r) => s + r.qty, 0);

    if (!groupMap.has(key)) {
        const cat = (subCategories || []).find((c: any) => c.name === art.categoryId);
        const defaultPcs = cat?.defaultPcsPerCtn || 0;
        const computedPcsPerCtn = Number(art.pcsPerCtn) > 0 
          ? Number(art.pcsPerCtn) 
          : (art.pcsPerBag && art.bagsPerCarton ? Number(art.pcsPerBag) * Number(art.bagsPerCarton) : Number(defaultPcs));

        // Le bandeau du produit porte la qualité de l'article et les caractéristiques de son
        // modèle — tissu, fermeture, fil, curseur, ruban ou accessoire.
        const specsList: string[] = [];
        const qualiteArt = qualiteDeLArticle(art);
        if (qualiteArt) specsList.push(`Qualité ${qualiteArt.toUpperCase()}`);
        const specsArt = specsLigne(art, undefined, subCategories);
        if (specsArt) specsList.push(specsArt);
        const noteArt = libelleFixe(art.specs);
        if (noteArt) specsList.push(noteArt);

        groupMap.set(key, {
          name: artName,
          displayName: artColor ? `${artName}  —  ${artColor}` : artName,
          colorLabel: artColor,
          unit: (art.unitOfMeasure || 'pcs').toUpperCase(),
          size: libelleFixe(art.size)?.toUpperCase() || '—',
          supplierId: (art.supplierId || '—').toUpperCase(),
          specs: specsList.join(' · '),
          cbmTotal: Number(art.cubicMeasurement || 0),
          nwTotal: Number(art.netWeight || 0),
          pcsPerCtn: computedPcsPerCtn,
        rows: [...rows],
        breakLabel,
        totalQty: artQty,
      });
    } else {
      const g = groupMap.get(key)!;
      g.cbmTotal += Number(art.cubicMeasurement || 0);
      g.nwTotal  += Number(art.netWeight || 0);
      g.totalQty += artQty;
      // Si ce nouvel article apporte des tailles, mettre à jour le label de colonne
      if (breakLabel === 'Taille' && g.breakLabel !== 'Taille') g.breakLabel = 'Taille';
      for (const r of rows) {
        const existing = g.rows.find(x => x.label === r.label);
        if (existing) { existing.qty += r.qty; } else { g.rows.push({ ...r }); }
      }
    }
  }

  const groups = Array.from(groupMap.values());
  let curY = 44;
  let grandTotalQty = 0;
  let grandTotalCtns = 0;
  const grandTotalCBM = articles.reduce((s, a) => s + (Number(a.cubicMeasurement) || 0), 0);
  const grandTotalNW  = articles.reduce((s, a) => s + (Number(a.netWeight) || 0), 0);

  const ensureSpace = async (needed: number) => {
    if (curY + needed > pageH - 14) {
      doc.addPage();
      await drawPageHeader(false);
      curY = 24;
    }
  };

  // ── Draw each group ──────────────────────────────────────────────────────
  for (let gi = 0; gi < groups.length; gi++) {
    const g = groups[gi];
    grandTotalQty += g.totalQty;

    // Estimate space: header card (16) + table head (7) + rows + foot (7) + gap (6)
    // Be generous: assume at least 8mm per row to avoid underestimates
    const estimatedRowH = 8;
    const estimatedH = 16 + 7 + g.rows.length * estimatedRowH + 7 + 6;
    await ensureSpace(estimatedH);

    // Product card
    doc.setFillColor(...NAVY);
    doc.roundedRect(MX, curY, pageW - MX * 2, 16, 2, 2, 'F');
    doc.setFillColor(...GOLD);
    doc.roundedRect(MX + 2, curY + 3, 8, 10, 1.5, 1.5, 'F');
    doc.setTextColor(...NAVY);
    doc.setFontSize(7);
    doc.setFont('helvetica', 'bold');
    doc.text(String(gi + 1), MX + 6, curY + 9.5, { align: 'center' });
    doc.setTextColor(...WHITE);
    doc.setFontSize(9);
    doc.setFont('helvetica', 'bold');
    doc.text(g.displayName, MX + 13, curY + 7);
    if (g.specs) {
      doc.setTextColor(...MUTED);
      doc.setFontSize(6.5);
      doc.setFont('helvetica', 'normal');
      // Le bandeau est partagé avec les chiffres de droite : on garde ce qui tient sur la ligne,
      // le détail complet est dans le tableau du produit juste en dessous.
      const largeurSpecs = pageW - MX * 2 - 13 - 92;
      doc.text(tronquer(doc, g.specs, largeurSpecs), MX + 13, curY + 13);
    }

    // Right stats — no P.A.
    const statsItems: [string, string][] = [
      ['Fournisseur', g.supplierId],
      g.colorLabel ? ['Couleur', g.colorLabel] : ['Taille', g.size],
      ['CBM', `${g.cbmTotal.toFixed(3)} m³`],
      ['N.W.', `${g.nwTotal.toFixed(2)} kg`],
      ['PCS/CTN', g.pcsPerCtn ? String(g.pcsPerCtn) : '—'],
    ];
    doc.setFontSize(5.5);
    let sx = pageW - MX - 2;
    [...statsItems].reverse().forEach(([label, value]) => {
      const blockW = Math.max(doc.getTextWidth(value) + 2, doc.getTextWidth(label.toUpperCase()) + 2) + 4;
      doc.setTextColor(...GOLD);
      doc.setFont('helvetica', 'bold');
      doc.text(label.toUpperCase(), sx - blockW / 2, curY + 6, { align: 'center' });
      doc.setTextColor(...WHITE);
      doc.setFontSize(7);
      doc.text(value, sx - blockW / 2, curY + 12, { align: 'center' });
      doc.setFontSize(5.5);
      if (sx !== pageW - MX - 2) {
        doc.setDrawColor(...MUTED); doc.setLineWidth(0.1);
        doc.line(sx, curY + 4, sx, curY + 14);
      }
      sx -= blockW + 4;
    });

    curY += 18;

    const sortedRows = [...g.rows].sort((a, b) => b.qty - a.qty);
    if (g.pcsPerCtn > 0) {
      grandTotalCtns += (g.totalQty / g.pcsPerCtn);
    }

    autoTable(doc, {
      startY: curY,
      head: [[g.breakLabel, `Quantité (${g.unit})`, 'CTNS/SACS', '% du total']],
      body: sortedRows.map(r => [
        { content: r.label, styles: { fontStyle: 'bold', textColor: r.color || NAVY } },
        { content: r.qty.toLocaleString('fr-MA'), styles: { halign: 'right' as const, fontStyle: 'bold' } },
        { content: g.pcsPerCtn > 0 ? (r.qty / g.pcsPerCtn).toFixed(1) : '—', styles: { halign: 'right' as const, fontStyle: 'bold', textColor: AMBER } },
        { content: g.totalQty > 0 ? `${((r.qty / g.totalQty) * 100).toFixed(1)} %` : '—', styles: { halign: 'right' as const, textColor: MUTED } },
      ]),
      foot: [[
        { content: `TOTAL  —  ${g.rows.length} ligne${g.rows.length > 1 ? 's' : ''}`, styles: { fontStyle: 'bold', fillColor: STONE as any, textColor: NAVY as any } },
        { content: `${g.totalQty.toLocaleString('fr-MA')} ${g.unit}`, styles: { halign: 'right' as const, fontStyle: 'bold', fillColor: GOLD as any, textColor: NAVY as any } },
        { content: g.pcsPerCtn > 0 ? (g.totalQty / g.pcsPerCtn).toFixed(1) : '—', styles: { halign: 'right' as const, fontStyle: 'bold', fillColor: STONE as any, textColor: AMBER as any } },
        { content: '100 %', styles: { halign: 'right' as const, fillColor: STONE as any, textColor: MUTED as any } },
      ]],
      headStyles: { fillColor: [50, 47, 45] as any, textColor: WHITE as any, fontStyle: 'bold', fontSize: 7, cellPadding: 2.5 },
      bodyStyles: { fontSize: 7.5, cellPadding: 2.5 },
      alternateRowStyles: { fillColor: STONE as any },
      theme: 'grid',
      margin: { left: MX, right: MX },
      tableLineColor: [220, 220, 220],
      tableLineWidth: 0.15,
      showFoot: 'lastPage',
      // Draw our custom header on every new page created by autoTable
      didAddPage: () => {
        drawPageHeader(false).then(() => {});
        curY = 24;
      },
    });

    curY = (doc as any).lastAutoTable.finalY + 8;
  }

  // ── Récapitulatif (no P.A., no Valeur) ──────────────────────────────────
  await ensureSpace(40);

  doc.setFillColor(...GOLD);
  doc.rect(MX, curY, pageW - MX * 2, 8, 'F');
  doc.setTextColor(...NAVY);
  doc.setFontSize(8);
  doc.setFont('helvetica', 'bold');
  doc.text('RÉCAPITULATIF GÉNÉRAL DU DOSSIER', MX + 4, curY + 5.5);
  curY += 10;

  autoTable(doc, {
    startY: curY,
    head: [['Désignation', 'Fournisseur', 'Taille', 'Couleur / Type', 'Quantité', 'Unité', 'PCS/CTN', 'CTNS/SACS', 'CBM (m³)', 'N.W. (kg)']],
    body: groups.map(g => [
      g.name,
      g.supplierId,
      g.size,
      // Une désignation ventilée nomme ses lignes — « various » ne dit rien au magasinier.
      // Deux libellés au maximum : la colonne est en largeur automatique, et trois noms de
      // couleurs longs écrasaient la colonne Désignation, qui est celle qui identifie la ligne.
      // Le détail complet est dans le tableau du produit, juste au-dessus.
      resumeLibelles(g.rows.map(r => r.label), 2),
      { content: g.totalQty.toLocaleString('fr-MA'), styles: { halign: 'right', fontStyle: 'bold' } },
      g.unit,
      { content: g.pcsPerCtn ? String(g.pcsPerCtn) : '—', styles: { halign: 'center' } },
      { content: g.pcsPerCtn > 0 ? (g.totalQty / g.pcsPerCtn).toFixed(1) : '—', styles: { halign: 'right', fontStyle: 'bold', textColor: AMBER } },
      { content: g.cbmTotal.toFixed(3), styles: { halign: 'right' } },
      { content: g.nwTotal.toFixed(2), styles: { halign: 'right' } },
    ]),
    foot: [[
      { content: `TOTAL GÉNÉRAL  —  ${groups.length} désignation${groups.length > 1 ? 's' : ''}`, colSpan: 4, styles: { fontStyle: 'bold', fillColor: NAVY as any, textColor: WHITE as any } },
      { content: grandTotalQty.toLocaleString('fr-MA'), styles: { halign: 'right' as const, fontStyle: 'bold', fillColor: GOLD as any, textColor: NAVY as any } },
      { content: '', styles: { fillColor: NAVY as any } },
      { content: '', styles: { fillColor: NAVY as any } },
      { content: grandTotalCtns > 0 ? grandTotalCtns.toFixed(1) : '—', styles: { halign: 'right' as const, fontStyle: 'bold', fillColor: NAVY as any, textColor: AMBER as any } },
      { content: grandTotalCBM.toFixed(3) + ' m³', styles: { halign: 'right' as const, fontStyle: 'bold', fillColor: NAVY as any, textColor: WHITE as any } },
      { content: grandTotalNW.toFixed(0), styles: { halign: 'right' as const, fontStyle: 'bold', fillColor: NAVY as any, textColor: WHITE as any } },
    ]],
    headStyles: { fillColor: NAVY as any, textColor: WHITE as any, fontStyle: 'bold', fontSize: 7, cellPadding: 2.5 },
    bodyStyles: { fontSize: 7, cellPadding: 2 },
    alternateRowStyles: { fillColor: STONE as any },
    theme: 'grid',
    margin: { left: MX, right: MX },
    tableLineColor: [220, 220, 220],
    tableLineWidth: 0.15,
    // La désignation ne se fait pas écraser par les colonnes voisines : sans largeur imposée,
    // autoTable la réduisait à 21 mm et coupait le nom du produit en trois.
    columnStyles: { 0: { cellWidth: 36 }, 3: { cellWidth: 26 } },
  });

  // ── Page footers ─────────────────────────────────────────────────────────
  const pageCount = (doc as any).internal.getNumberOfPages();
  for (let i = 1; i <= pageCount; i++) {
    doc.setPage(i);
    doc.setFontSize(6.5);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(...MUTED);
    doc.text(`Packing Details  |  Dossier ${facture.id || '—'}  |  ${dateStr}  |  LEBTEX TEXTILE IMPORT`, pageW / 2, pageH - 5, { align: 'center' });
    doc.text(`Page ${i} / ${pageCount}`, pageW - MX, pageH - 5, { align: 'right' });
  }

  doc.save(`PackingDetails_${(facture.id || 'dossier').replace(/[^a-zA-Z0-9]/g, '_')}_${new Date().toISOString().split('T')[0]}.pdf`);
}

