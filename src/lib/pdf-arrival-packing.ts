import { addPdfLogoHeader } from './pdf-export';
import { getArticleFrenchName } from './product-name-utils';

/**
 * Packing details d'un dossier d'arrivage, en français, pour les magasins et l'entrepôt.
 *
 * Document LOGISTIQUE : quantités, poids, volumes, ventilations et emplacements. Aucune donnée
 * financière n'y figure — ni prix d'achat, coût de revient, douane, fret ou montant de facture,
 * ni les `priceOverride` des lignes de ventilation.
 */

export interface ArrivalPackingParams {
  facture: any;
  articles: any[];
  categories?: any[];
  generalCategories?: any[];
  /** Mouvements d'entrée du dossier, pour indiquer les emplacements de rangement. */
  movements?: any[];
  stores?: any[];
  stockEntryDate?: string | null;
  isEnteredInStock?: boolean;
}

// Palette LEBTEX (identique au reste des exports)
const INK: [number, number, number] = [28, 25, 23];
const GOLD: [number, number, number] = [251, 191, 36];
const STONE_500: [number, number, number] = [120, 113, 108];
const STONE_200: [number, number, number] = [231, 229, 228];
const STONE_50: [number, number, number] = [250, 250, 249];
const EMERALD: [number, number, number] = [4, 120, 87];

/**
 * Les polices standard de jsPDF sont en WinAnsi : l'espace fine insécable que produit
 * toLocaleString('fr-FR') comme séparateur de milliers s'afficherait en caractère parasite.
 */
function pdfText(v: any): string {
  return String(v ?? '')
    .replace(/[   ]/g, ' ')
    .replace(/[‘’]/g, "'")
    .replace(/[“”]/g, '"');
}

function nf(n: any, max = 3): string {
  const v = Number(n);
  if (!isFinite(v) || v === 0) return '0';
  return pdfText(v.toLocaleString('fr-FR', { maximumFractionDigits: max }));
}

const rowQty = (r: any) => Number(r?.quantity ?? r?.rolls) || 0;
const isVarious = (v: any) => String(v || '').toLowerCase() === 'various';

function frDate(d?: string | null): string {
  if (!d) return '—';
  const [y, m, day] = String(d).split('-');
  return y && m && day ? `${day}/${m}/${y}` : String(d);
}

/** « 150CM », « 150 cm » et « 150cm » désignent la même mesure. */
function sameMeasure(a: any, b: any): boolean {
  const norm = (v: any) => String(v ?? '').toLowerCase().replace(/\s+/g, '');
  return Boolean(norm(a)) && norm(a) === norm(b);
}

function specsOf(x: any): string {
  return [
    x.gsm ? `${x.gsm} g/m²` : null,
    // La largeur est souvent déjà portée par la taille (« 150cm ») : ne pas la répéter.
    x.fabricWidth && !sameMeasure(x.size, `${x.fabricWidth}cm`) ? `larg. ${x.fabricWidth} cm` : null,
    x.rollLength ? `${x.rollLength} ${x.rollLengthUnit || 'm'}/rouleau` : null,
    x.packagingPerBag ? `${x.packagingPerBag} rlx/sac` : null,
    x.zipperType ? `type ${x.zipperType}` : null,
    x.slider ? `curseur ${x.slider}` : null,
    x.sliderType ? String(x.sliderType) : null,
    x.pcsPerBag ? `${x.pcsPerBag} pcs/sac` : null,
    x.bagsPerCarton ? `${x.bagsPerCarton} sacs/ctn` : null,
    x.coneWeightG ? `cône ${x.coneWeightG} g` : null,
    x.lengthPerPiece ? `${x.lengthPerPiece} ${x.lengthUnit || 'm'}/pièce` : null,
    x.thickness ? `ép. ${x.thickness}` : null,
    x.pcsPerBox ? `${x.pcsPerBox} pcs/boîte` : null,
  ].filter(Boolean).join(' · ');
}

export async function exportArrivalPackingPDF(params: ArrivalPackingParams): Promise<void> {
  const {
    facture, articles = [], categories = [], generalCategories = [],
    movements = [], stores = [], stockEntryDate, isEnteredInStock,
  } = params;
  if (!facture) return;

  const { default: jsPDF } = await import('jspdf');
  const { default: autoTable } = await import('jspdf-autotable');

  // compress : flux de contenu compressés, pour un fichier léger à partager par WhatsApp/e-mail.
  const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4', compress: true });
  const pageW = doc.internal.pageSize.getWidth();
  const pageH = doc.internal.pageSize.getHeight();
  const M = 12; // marge

  const generatedAt = pdfText(new Date().toLocaleDateString('fr-FR', { day: '2-digit', month: 'long', year: 'numeric' }));
  const storeName = (id?: string) => stores.find((s: any) => s.id === id)?.name || id || '';

  // ── Emplacements de rangement par article ────────────────────────────────
  const locByArticle: Record<string, string> = {};
  {
    const acc: Record<string, Record<string, number>> = {};
    for (const m of movements) {
      if (m?.type !== 'IN' || !m.locationCode || !m.articleId) continue;
      const key = stores.length > 1 && m.storeId ? `${m.locationCode} (${storeName(m.storeId)})` : m.locationCode;
      (acc[m.articleId] ||= {})[key] = ((acc[m.articleId] ||= {})[key] || 0) + (Number(m.quantity) || 0);
    }
    for (const [artId, locs] of Object.entries(acc)) {
      locByArticle[artId] = Object.entries(locs).map(([code, q]) => `${code} : ${nf(q)}`).join('\n');
    }
  }

  // ── Totaux ───────────────────────────────────────────────────────────────
  const totalsByUnit: Record<string, { qty: number; refs: number }> = {};
  let totalCbm = 0;
  let totalNet = 0;
  for (const a of articles) {
    const unit = (a.unitOfMeasure || 'pcs').trim();
    totalsByUnit[unit] ||= { qty: 0, refs: 0 };
    totalsByUnit[unit].qty += Number(a.quantity) || 0;
    totalsByUnit[unit].refs += 1;
    totalCbm += Number(a.cubicMeasurement) || 0;
    totalNet += Number(a.netWeight) || 0;
  }

  // ── En-tête de page ──────────────────────────────────────────────────────
  const drawPageHeader = async () => {
    doc.setFillColor(...INK);
    doc.rect(0, 0, pageW, 24, 'F');
    await addPdfLogoHeader(doc, M - 2, 3, 34, 17, true);

    doc.setTextColor(...GOLD);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(16);
    doc.text('PACKING DETAILS', 50, 11);

    doc.setTextColor(255, 255, 255);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(9);
    doc.text(pdfText(`Dossier d'arrivage N° ${facture.id}`), 50, 17.5);

    doc.setFontSize(8);
    doc.setTextColor(214, 211, 209);
    doc.text(pdfText(`Édité le ${generatedAt}`), pageW - M, 11, { align: 'right' });
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(...(isEnteredInStock ? [110, 231, 183] as [number, number, number] : GOLD));
    doc.text(isEnteredInStock ? 'ENTRÉ EN STOCK' : 'EN ATTENTE DE RÉCEPTION', pageW - M, 17.5, { align: 'right' });
  };

  await drawPageHeader();

  // ── Bloc d'informations ──────────────────────────────────────────────────
  let y = 31;
  const boxH = 39;
  const gap = 5;
  const colW = (pageW - M * 2 - gap * 2) / 3;

  const infoBox = (x: number, title: string, lines: [string, string][]) => {
    doc.setDrawColor(...STONE_200);
    doc.setFillColor(...STONE_50);
    doc.roundedRect(x, y, colW, boxH, 2, 2, 'FD');
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(7.5);
    doc.setTextColor(...STONE_500);
    doc.text(pdfText(title), x + 4, y + 6);
    let ly = y + 12;
    for (const [label, value] of lines) {
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(8);
      doc.setTextColor(...STONE_500);
      doc.text(pdfText(label), x + 4, ly);
      doc.setFont('helvetica', 'bold');
      doc.setTextColor(...INK);
      const v = pdfText(value || '—');
      const clipped = doc.splitTextToSize(v, colW - 42)[0] || '—';
      doc.text(clipped, x + 38, ly);
      ly += 5.2;
    }
  };

  infoBox(M, 'EXPÉDITION', [
    ['Fournisseur', facture.supplierId || facture.supplier || '—'],
    ['N° de dossier', facture.id],
    ['N° de BL', facture.noBL || '—'],
    ['Compagnie maritime', facture.shippingLine || '—'],
    ["Date d'expédition", frDate(facture.shippingDate)],
  ]);
  infoBox(M + colW + gap, 'RÉCEPTION', [
    ["Date d'arrivée", frDate(facture.arrivalDate)],
    ['Entrée en stock', frDate(stockEntryDate || facture.stockEntryDate)],
    ['Transitaire', facture.forwarder || '—'],
    ['Statut', isEnteredInStock ? 'Entré en stock' : 'En attente de réception'],
  ]);
  infoBox(M + (colW + gap) * 2, 'CONTENU', [
    ['Références', String(articles.length)],
    ['Volume total', totalCbm > 0 ? `${nf(totalCbm)} m³` : '—'],
    ['Poids net total', totalNet > 0 ? `${nf(totalNet)} kg` : '—'],
    ['Quantités', Object.entries(totalsByUnit).map(([u, t]) => `${nf(t.qty)} ${u}`).join(' + ') || '—'],
  ]);

  y += boxH + 7;

  // ── Tableau principal, groupé par pôle ───────────────────────────────────
  const poleOf = (a: any) => {
    const cat = categories.find((c: any) => c.name === a.categoryId || c.id === a.categoryId);
    const gcId = a.generalCategoryId || cat?.generalCategoryId;
    const gc = generalCategories.find((g: any) => g.id === gcId);
    return (gc?.nameFR || gc?.name || 'Autres articles').toUpperCase();
  };

  const groups = new Map<string, any[]>();
  for (const a of articles) {
    const pole = poleOf(a);
    if (!groups.has(pole)) groups.set(pole, []);
    groups.get(pole)!.push(a);
  }
  const poles = Array.from(groups.keys()).sort((a, b) => a.localeCompare(b, 'fr'));

  type Cell = string | { content: string; colSpan?: number; styles?: any };
  const body: Cell[][] = [];
  let lineNo = 0;

  const SUB = { textColor: STONE_500, fontStyle: 'normal', fontSize: 7.5 };

  for (const pole of poles) {
    const list = groups.get(pole)!.sort((a, b) =>
      getArticleFrenchName(a, categories, generalCategories).localeCompare(getArticleFrenchName(b, categories, generalCategories), 'fr'));

    body.push([{
      content: `${pole}  ·  ${list.length} référence${list.length > 1 ? 's' : ''}`,
      colSpan: 11,
      styles: { fillColor: INK, textColor: GOLD, fontStyle: 'bold', fontSize: 8, cellPadding: { top: 2.2, bottom: 2.2, left: 3, right: 3 } },
    }]);

    for (const a of list) {
      lineNo++;
      const unit = a.unitOfMeasure || 'pcs';
      const frName = pdfText(getArticleFrenchName(a, categories, generalCategories));
      const internal = pdfText(a.name || a.categoryId || '');
      const qualities = Array.isArray(a.qualityBreakdown) ? a.qualityBreakdown.filter((r: any) => rowQty(r) > 0) : [];
      const colors = Array.isArray(a.colorBreakdown) ? a.colorBreakdown.filter((r: any) => rowQty(r) > 0) : [];
      const sizes = Array.isArray(a.sizeBreakdown) ? a.sizeBreakdown.filter((r: any) => rowQty(r) > 0) : [];

      body.push([
        { content: String(lineNo), styles: { halign: 'center', fontStyle: 'bold' } },
        { content: frName + (internal && internal.toLowerCase() !== frName.toLowerCase() ? `\n${internal}` : ''), styles: { fontStyle: 'bold' } },
        qualities.length > 0 ? `${qualities.length} qualités` : pdfText(a.quality || '—'),
        colors.length > 0 ? `${colors.length} couleurs` : (a.color && !isVarious(a.color) ? pdfText(a.color) : '—'),
        sizes.length > 0 ? `${sizes.length} tailles` : (a.size && !isVarious(a.size) ? pdfText(a.size) : '—'),
        pdfText(specsOf(a) || '—'),
        { content: nf(a.quantity), styles: { halign: 'right', fontStyle: 'bold', textColor: EMERALD } },
        { content: pdfText(unit), styles: { halign: 'center' } },
        { content: Number(a.netWeight) > 0 ? nf(a.netWeight) : '—', styles: { halign: 'right' } },
        { content: Number(a.cubicMeasurement) > 0 ? nf(a.cubicMeasurement) : '—', styles: { halign: 'right' } },
        pdfText(locByArticle[a.id] || '—'),
      ]);

      // Sous-lignes de ventilation : une ligne par qualité, couleur ou taille. Chacune rappelle
      // son article, pour rester lisible quand la ventilation déborde sur la page suivante.
      const parentLabel = `› ${frName}`;
      const SUBROW = { ...SUB, fillColor: STONE_50 };
      const subRow = (q: string, c: string, s: string, specs: string, qty: number): Cell[] => [
        { content: String(lineNo), styles: { ...SUBROW, halign: 'center' } },
        { content: parentLabel, styles: { ...SUBROW, fontSize: 7 } },
        { content: pdfText(q), styles: SUBROW },
        { content: pdfText(c), styles: { ...SUBROW, textColor: INK } },
        { content: pdfText(s), styles: SUBROW },
        { content: pdfText(specs), styles: SUBROW },
        { content: nf(qty), styles: { ...SUBROW, halign: 'right', textColor: INK } },
        { content: pdfText(unit), styles: { ...SUBROW, halign: 'center' } },
        { content: '', styles: SUBROW }, { content: '', styles: SUBROW }, { content: '', styles: SUBROW },
      ];

      for (const r of qualities) {
        body.push(subRow(r.nameFR || r.quality || '—', '', r.size || '', specsOf(r), rowQty(r)));
      }
      for (const r of colors) {
        const label = r.colorCode || r.color || '—';
        body.push(subRow('', r.description && r.description !== label ? `${label} — ${r.description}` : label, '', '', rowQty(r)));
      }
      for (const r of sizes) {
        body.push(subRow('', '', r.description ? `${r.size} — ${r.description}` : (r.size || '—'), '', rowQty(r)));
      }
    }
  }

  autoTable(doc, {
    startY: y,
    margin: { left: M, right: M, top: 30, bottom: 16 },
    head: [[
      'N°', 'Désignation', 'Qualité', 'Couleur', 'Taille', 'Caractéristiques',
      'Quantité', 'Unité', 'Poids net\n(kg)', 'Volume\n(m³)', 'Emplacement',
    ]],
    body: body as any,
    theme: 'grid',
    styles: {
      font: 'helvetica', fontSize: 8, cellPadding: 1.8, textColor: INK,
      lineColor: STONE_200, lineWidth: 0.2, valign: 'middle', overflow: 'linebreak',
    },
    headStyles: {
      fillColor: [68, 64, 60], textColor: [255, 255, 255], fontStyle: 'bold', fontSize: 7.5,
      halign: 'center', valign: 'middle',
    },
    columnStyles: {
      0: { cellWidth: 9 },
      1: { cellWidth: 58 },
      2: { cellWidth: 26 },
      3: { cellWidth: 30 },
      4: { cellWidth: 20 },
      5: { cellWidth: 44 },
      6: { cellWidth: 20 },
      7: { cellWidth: 13 },
      8: { cellWidth: 16 },
      9: { cellWidth: 15 },
      10: { cellWidth: 'auto' },
    },
    // Recopier l'en-tête sombre sur chaque nouvelle page
    willDrawPage: (data: any) => {
      if (data.pageNumber > 1) {
        doc.setFillColor(...INK);
        doc.rect(0, 0, pageW, 22, 'F');
        doc.setTextColor(...GOLD);
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(11);
        doc.text('PACKING DETAILS', M, 10);
        doc.setTextColor(255, 255, 255);
        doc.setFont('helvetica', 'normal');
        doc.setFontSize(8.5);
        doc.text(pdfText(`Dossier N° ${facture.id} — ${facture.supplierId || ''} — suite`), M, 16);
      }
    },
  });

  // ── Récapitulatif par unité ───────────────────────────────────────────────
  let afterY = (doc as any).lastAutoTable.finalY + 8;
  const summaryRows = Object.entries(totalsByUnit)
    .sort((a, b) => b[1].qty - a[1].qty)
    .map(([u, t]) => [pdfText(u), String(t.refs), nf(t.qty)]);

  // Récap + bloc de contrôle côte à côte : il faut ~55 mm de hauteur libre
  if (afterY > pageH - 60) {
    doc.addPage();
    afterY = 30;
  }

  autoTable(doc, {
    startY: afterY,
    margin: { left: M },
    tableWidth: 100,
    head: [['RÉCAPITULATIF', 'Références', 'Quantité totale']],
    body: summaryRows,
    foot: [[
      'TOTAL',
      String(articles.length),
      totalCbm > 0 || totalNet > 0
        ? pdfText([totalNet > 0 ? `${nf(totalNet)} kg` : null, totalCbm > 0 ? `${nf(totalCbm)} m³` : null].filter(Boolean).join(' · '))
        : '',
    ]],
    theme: 'grid',
    styles: { font: 'helvetica', fontSize: 8.5, cellPadding: 2.2, textColor: INK, lineColor: STONE_200, lineWidth: 0.2 },
    headStyles: { fillColor: INK, textColor: GOLD, fontStyle: 'bold' },
    footStyles: { fillColor: STONE_50, textColor: INK, fontStyle: 'bold' },
    columnStyles: { 1: { halign: 'center' }, 2: { halign: 'right', fontStyle: 'bold' } },
  });

  // ── Contrôle à la réception ───────────────────────────────────────────────
  const ctrlX = M + 110;
  const ctrlW = pageW - M - ctrlX;
  doc.setDrawColor(...STONE_200);
  doc.setFillColor(255, 255, 255);
  doc.roundedRect(ctrlX, afterY, ctrlW, 46, 2, 2, 'D');
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8);
  doc.setTextColor(...INK);
  doc.text('CONTRÔLE À LA RÉCEPTION', ctrlX + 4, afterY + 6);

  const fields = ['Réceptionné par', 'Contrôlé par', 'Date et heure', 'Signature'];
  const fw = (ctrlW - 8) / 2;
  fields.forEach((label, i) => {
    const fx = ctrlX + 4 + (i % 2) * fw;
    const fy = afterY + 14 + Math.floor(i / 2) * 11;
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7.5);
    doc.setTextColor(...STONE_500);
    doc.text(pdfText(label), fx, fy);
    doc.setDrawColor(...STONE_200);
    doc.line(fx, fy + 5, fx + fw - 6, fy + 5);
  });
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7.5);
  doc.setTextColor(...STONE_500);
  doc.text('Observations / écarts constatés', ctrlX + 4, afterY + 38);
  doc.line(ctrlX + 4, afterY + 43, ctrlX + ctrlW - 4, afterY + 43);

  // ── Pied de page ─────────────────────────────────────────────────────────
  const pages = doc.getNumberOfPages();
  for (let i = 1; i <= pages; i++) {
    doc.setPage(i);
    doc.setDrawColor(...STONE_200);
    doc.line(M, pageH - 10, pageW - M, pageH - 10);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7);
    doc.setTextColor(...STONE_500);
    doc.text(
      pdfText(`LEBTEX — Packing details du dossier ${facture.id} — Document logistique, quantités uniquement, sans valeur commerciale`),
      M, pageH - 5.5,
    );
    doc.text(`Page ${i} / ${pages}`, pageW - M, pageH - 5.5, { align: 'right' });
  }

  const safeId = String(facture.id).replace(/[^A-Za-z0-9_-]/g, '_');
  doc.save(`Packing_Details_${safeId}.pdf`);
}
