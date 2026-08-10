'use client';

import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import type { ShopProduct, ShopCategory } from './shop-types';

// ─── Color Palette ────────────────────────────────────────────────────────────
const COLORS = {
  red: [200, 16, 46] as [number, number, number],
  black: [26, 26, 26] as [number, number, number],
  darkGray: [60, 60, 60] as [number, number, number],
  gray: [120, 120, 120] as [number, number, number],
  lightGray: [200, 200, 200] as [number, number, number],
  veryLightGray: [240, 236, 232] as [number, number, number],
  white: [255, 255, 255] as [number, number, number],
  gold: [212, 168, 67] as [number, number, number],
  green: [16, 185, 129] as [number, number, number],
  redLight: [255, 240, 240] as [number, number, number],
  greenLight: [236, 253, 245] as [number, number, number],
};

// ─── Helper: Load Image as base64 ─────────────────────────────────────────────
async function loadImageAsBase64(url: string): Promise<string | null> {
  try {
    const response = await fetch(url);
    const blob = await response.blob();
    return new Promise((resolve) => {
      const reader = new FileReader();
      reader.onloadend = () => resolve(reader.result as string);
      reader.onerror = () => resolve(null);
      reader.readAsDataURL(blob);
    });
  } catch {
    return null;
  }
}

// ─── Helper: Draw rounded rect ───────────────────────────────────────────────
function roundedRect(doc: jsPDF, x: number, y: number, w: number, h: number, r: number, fill: [number, number, number], stroke?: [number, number, number]) {
  doc.setFillColor(...fill);
  if (stroke) {
    doc.setDrawColor(...stroke);
    doc.setLineWidth(0.3);
  }
  doc.roundedRect(x, y, w, h, r, r, stroke ? 'FD' : 'F');
}

// ─── Helper: Hex to RGB ──────────────────────────────────────────────────────
function hexToRgb(hex: string): [number, number, number] {
  const h = hex.replace('#', '');
  return [
    parseInt(h.substring(0, 2), 16),
    parseInt(h.substring(2, 4), 16),
    parseInt(h.substring(4, 6), 16),
  ];
}

// ─── Helper: Truncate text ───────────────────────────────────────────────────
function truncate(text: string, maxLen: number): string {
  return text.length > maxLen ? text.substring(0, maxLen - 1) + '…' : text;
}

// ─── Progress Callback Type ──────────────────────────────────────────────────
type ProgressCallback = (percent: number, status: string) => void;

// ─── MAIN EXPORT FUNCTION ────────────────────────────────────────────────────
export async function generateCataloguePDF(
  sections: { category: ShopCategory; products: ShopProduct[]; subCategories: ShopCategory[] }[],
  totalProducts: number,
  inStockCount: number,
  onProgress?: ProgressCallback,
) {
  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
  const PW = 210; // Page width
  const PH = 297; // Page height
  const ML = 15;  // Margin left
  const MR = 15;  // Margin right
  const CW = PW - ML - MR; // Content width
  const now = new Date();
  const dateStr = now.toLocaleDateString('fr-MA', { day: '2-digit', month: 'long', year: 'numeric' });
  let pageNum = 0;

  onProgress?.(5, 'Préparation du document...');

  // ── Page footer helper ─────────────────────────────────────────────────────
  function drawPageFooter(showNumber = true) {
    // Bottom line
    doc.setDrawColor(...COLORS.lightGray);
    doc.setLineWidth(0.3);
    doc.line(ML, PH - 15, PW - MR, PH - 15);

    // Left: brand
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7);
    doc.setTextColor(...COLORS.gray);
    doc.text('LEBTEX — Mercerie & Accessoires Textiles', ML, PH - 10);

    // Center: date
    doc.text(dateStr, PW / 2, PH - 10, { align: 'center' });

    // Right: page number
    if (showNumber) {
      pageNum++;
      doc.setFont('helvetica', 'bold');
      doc.setTextColor(...COLORS.red);
      doc.text(String(pageNum), PW - MR, PH - 10, { align: 'right' });
    }

    // Confidentiality
    doc.setFont('helvetica', 'italic');
    doc.setFontSize(5.5);
    doc.setTextColor(...COLORS.lightGray);
    doc.text('Document confidentiel — Reproduction interdite sans autorisation', PW / 2, PH - 6, { align: 'center' });
  }

  // ══════════════════════════════════════════════════════════════════════════════
  // ── PAGE 1: COVER ─────────────────────────────────────────────────────────────
  // ══════════════════════════════════════════════════════════════════════════════

  // Full dark background
  doc.setFillColor(15, 15, 15);
  doc.rect(0, 0, PW, PH, 'F');

  // Subtle gradient overlay (top-right red glow)
  doc.setFillColor(200, 16, 46);
  doc.setGState(doc.GState({ opacity: 0.06 }));
  doc.circle(PW + 20, -20, 120, 'F');
  doc.setGState(doc.GState({ opacity: 0.04 }));
  doc.circle(-30, PH + 30, 100, 'F');
  doc.setGState(doc.GState({ opacity: 1 }));

  // Top label
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8);
  doc.setTextColor(...COLORS.gold);
  const labelText = `CATALOGUE PRODUITS ${now.getFullYear()}`;
  const labelW = doc.getTextWidth(labelText) + 16;
  roundedRect(doc, PW / 2 - labelW / 2, 55, labelW, 10, 5, [212, 168, 67]);
  doc.setGState(doc.GState({ opacity: 0.15 }));
  doc.setFillColor(212, 168, 67);
  doc.roundedRect(PW / 2 - labelW / 2, 55, labelW, 10, 5, 5, 'F');
  doc.setGState(doc.GState({ opacity: 1 }));
  doc.setDrawColor(...COLORS.gold);
  doc.setLineWidth(0.5);
  doc.roundedRect(PW / 2 - labelW / 2, 55, labelW, 10, 5, 5, 'S');
  doc.text(labelText, PW / 2, 61.5, { align: 'center' });

  // Main title
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(56);
  doc.setTextColor(...COLORS.white);
  doc.text('LEB', PW / 2 - 2, 110, { align: 'right' });
  doc.setTextColor(...COLORS.red);
  doc.text('TEX', PW / 2 + 2, 110, { align: 'left' });

  // Subtitle
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(14);
  doc.setTextColor(255, 255, 255, 80);
  doc.text('Mercerie & Accessoires Textiles', PW / 2, 124, { align: 'center' });

  // Decorative line
  doc.setDrawColor(...COLORS.red);
  doc.setLineWidth(1);
  doc.line(PW / 2 - 30, 133, PW / 2 + 30, 133);

  // Description
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  doc.setTextColor(255, 255, 255, 50);
  const descLines = doc.splitTextToSize(
    'Catalogue interactif avec fiches produits complètes — les disponibilités changent automatiquement selon notre stock réel.',
    120
  );
  doc.text(descLines, PW / 2, 145, { align: 'center' });

  // Stats boxes
  const statsY = 175;
  const stats = [
    { label: 'Produits', value: String(totalProducts), color: COLORS.white },
    { label: 'Disponibles', value: String(inStockCount), color: COLORS.green },
    { label: 'Catégories', value: String(sections.length), color: COLORS.gold },
  ];
  const boxW = 45;
  const boxGap = 8;
  const totalStatsW = stats.length * boxW + (stats.length - 1) * boxGap;
  const statsStartX = PW / 2 - totalStatsW / 2;

  stats.forEach((stat, i) => {
    const bx = statsStartX + i * (boxW + boxGap);
    // Box border
    doc.setDrawColor(255, 255, 255);
    doc.setGState(doc.GState({ opacity: 0.1 }));
    doc.setLineWidth(0.5);
    doc.roundedRect(bx, statsY, boxW, 30, 4, 4, 'S');
    doc.setGState(doc.GState({ opacity: 1 }));

    // Value
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(22);
    doc.setTextColor(...stat.color);
    doc.text(stat.value, bx + boxW / 2, statsY + 15, { align: 'center' });

    // Label
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7);
    doc.setTextColor(255, 255, 255, 60);
    doc.text(stat.label, bx + boxW / 2, statsY + 23, { align: 'center' });
  });

  // Live indicator
  doc.setFillColor(...COLORS.green);
  doc.circle(PW / 2 - 20, 225, 1.5, 'F');
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7);
  doc.setTextColor(...COLORS.green);
  doc.text('Stock en direct', PW / 2 - 16, 226.5);

  // Contact info at bottom
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8);
  doc.setTextColor(255, 255, 255, 40);
  doc.text('lebtex.ma', PW / 2, 260, { align: 'center' });
  doc.setFontSize(7);
  doc.text('+212 760 998 347  ·  WhatsApp', PW / 2, 267, { align: 'center' });

  // Date
  doc.setFontSize(6.5);
  doc.setTextColor(255, 255, 255, 25);
  doc.text(`Généré le ${dateStr}`, PW / 2, PH - 12, { align: 'center' });

  onProgress?.(15, 'Page de couverture créée...');

  // ══════════════════════════════════════════════════════════════════════════════
  // ── PAGE 2: SOMMAIRE ──────────────────────────────────────────────────────────
  // ══════════════════════════════════════════════════════════════════════════════

  doc.addPage();

  // Header band
  doc.setFillColor(...COLORS.red);
  doc.rect(0, 0, PW, 3, 'F');

  // Title
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(26);
  doc.setTextColor(...COLORS.black);
  doc.text('Sommaire', ML, 28);

  // Subtitle
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  doc.setTextColor(...COLORS.gray);
  doc.text(`${sections.length} catégories · ${totalProducts} produits · ${inStockCount} disponibles`, ML, 36);

  // Decorative line
  doc.setDrawColor(...COLORS.red);
  doc.setLineWidth(0.8);
  doc.line(ML, 40, ML + 40, 40);

  let sy = 52;
  sections.forEach((section, i) => {
    const cat = section.category;
    const accentColor = cat.color ? hexToRgb(cat.color) : COLORS.red;
    const availCount = section.products.filter(p => p.inStock).length;

    if (sy > PH - 35) {
      drawPageFooter();
      doc.addPage();
      doc.setFillColor(...COLORS.red);
      doc.rect(0, 0, PW, 3, 'F');
      sy = 20;
    }

    // Section number badge
    roundedRect(doc, ML, sy, 12, 12, 3, accentColor);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(9);
    doc.setTextColor(...COLORS.white);
    doc.text(String(i + 1).padStart(2, '0'), ML + 6, sy + 7.5, { align: 'center' });

    // Category name
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(12);
    doc.setTextColor(...COLORS.black);
    doc.text(cat.name, ML + 16, sy + 5);

    // Description
    if (cat.description) {
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(7.5);
      doc.setTextColor(...COLORS.gray);
      doc.text(truncate(cat.description, 80), ML + 16, sy + 10.5);
    }

    // Right info: count
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(10);
    doc.setTextColor(...accentColor);
    doc.text(String(section.products.length), PW - MR, sy + 5, { align: 'right' });
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(6.5);
    doc.setTextColor(...COLORS.gray);
    doc.text(`produit${section.products.length > 1 ? 's' : ''}`, PW - MR, sy + 9.5, { align: 'right' });

    // Availability badge
    const availText = `${availCount} dispo.`;
    const availW = doc.getTextWidth(availText) + 6;
    roundedRect(doc, PW - MR - availW - 22, sy + 1, availW, 6, 2, COLORS.greenLight);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(6);
    doc.setTextColor(...COLORS.green);
    doc.text(availText, PW - MR - 22 - availW / 2, sy + 5.2, { align: 'center' });

    // Divider
    doc.setDrawColor(...COLORS.veryLightGray);
    doc.setLineWidth(0.3);
    doc.line(ML + 16, sy + 14, PW - MR, sy + 14);

    sy += 20;
  });

  drawPageFooter();

  onProgress?.(25, 'Sommaire créé...');

  // ══════════════════════════════════════════════════════════════════════════════
  // ── CATEGORY PAGES: Products ──────────────────────────────────────────────────
  // ══════════════════════════════════════════════════════════════════════════════

  const totalSections = sections.length;
  let processedSections = 0;

  for (const section of sections) {
    const cat = section.category;
    const accentColor = cat.color ? hexToRgb(cat.color) : COLORS.red;
    const prods = section.products;
    const availCount = prods.filter(p => p.inStock).length;

    processedSections++;
    const progressBase = 25 + (processedSections / totalSections) * 65;
    onProgress?.(Math.round(progressBase), `Section ${processedSections}/${totalSections}: ${cat.name}...`);

    // ── Category Title Page ──────────────────────────────────────────────────
    doc.addPage();

    // Top accent bar
    doc.setFillColor(...accentColor);
    doc.rect(0, 0, PW, 4, 'F');

    // Section header background
    roundedRect(doc, ML, 14, CW, 36, 4, COLORS.veryLightGray);

    // Section number
    roundedRect(doc, ML + 6, 20, 20, 20, 4, accentColor);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(14);
    doc.setTextColor(...COLORS.white);
    doc.text(String(processedSections).padStart(2, '0'), ML + 16, 33, { align: 'center' });

    // Category name
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(20);
    doc.setTextColor(...COLORS.black);
    doc.text(cat.name, ML + 32, 30);

    // Description
    if (cat.description) {
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(8);
      doc.setTextColor(...COLORS.gray);
      doc.text(truncate(cat.description, 100), ML + 32, 38);
    }

    // Stats pills
    const pillY = 18;
    // Product count
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(16);
    doc.setTextColor(...accentColor);
    doc.text(String(prods.length), PW - MR - 6, pillY + 9, { align: 'right' });
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7);
    doc.setTextColor(...COLORS.gray);
    doc.text('produits', PW - MR - 6, pillY + 14, { align: 'right' });

    // Available count
    doc.setFontSize(12);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(...COLORS.green);
    doc.text(String(availCount), PW - MR - 30, pillY + 9, { align: 'right' });
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(6.5);
    doc.setTextColor(...COLORS.gray);
    doc.text('dispo.', PW - MR - 30, pillY + 14, { align: 'right' });

    // ── Product Table ────────────────────────────────────────────────────────
    const tableBody: string[][] = [];

    for (const p of prods) {
      const specs: string[] = [];
      if (p.material) specs.push(`Matériau: ${p.material}`);
      if (p.typeProduit) specs.push(`Type: ${p.typeProduit}`);
      if (p.couleur) specs.push(`Couleur: ${p.couleur}`);
      if (p.width) specs.push(`Largeur: ${p.width}`);
      if (p.longueur) specs.push(`Longueur: ${p.longueur}`);
      if (p.weight) specs.push(`Poids: ${p.weight}g`);
      if (p.packaging) specs.push(`Emballage: ${p.packaging}`);
      if (p.specification) specs.push(`Spéc: ${p.specification}`);
      if (p.resistance) specs.push(`Résistance: ${p.resistance}`);
      if (p.paysFabrication) specs.push(`Origine: ${p.paysFabrication}`);

      tableBody.push([
        p.sku || '—',
        p.name,
        specs.length > 0 ? specs.join('\n') : '—',
        p.variants?.length > 0 ? `${p.variants.length} variante${p.variants.length > 1 ? 's' : ''}` : '—',
        p.inStock ? '● Disponible' : '○ Indisponible',
      ]);
    }

    autoTable(doc, {
      startY: 56,
      margin: { left: ML, right: MR },
      head: [['Réf.', 'Désignation', 'Caractéristiques techniques', 'Variantes', 'Disponibilité']],
      body: tableBody,
      theme: 'plain',
      styles: {
        fontSize: 7.5,
        cellPadding: { top: 3, right: 3, bottom: 3, left: 3 },
        lineColor: COLORS.veryLightGray,
        lineWidth: 0.3,
        textColor: COLORS.darkGray,
        font: 'helvetica',
      },
      headStyles: {
        fillColor: accentColor,
        textColor: COLORS.white,
        fontStyle: 'bold',
        fontSize: 7,
        cellPadding: { top: 3.5, right: 3, bottom: 3.5, left: 3 },
        halign: 'left',
      },
      columnStyles: {
        0: { cellWidth: 22, fontStyle: 'bold', fontSize: 6.5, textColor: COLORS.gray },
        1: { cellWidth: 45, fontStyle: 'bold' },
        2: { cellWidth: 'auto', fontSize: 6.5 },
        3: { cellWidth: 22, halign: 'center', fontSize: 6.5 },
        4: { cellWidth: 26, halign: 'center', fontSize: 6.5 },
      },
      alternateRowStyles: {
        fillColor: [252, 250, 247],
      },
      didParseCell: (data) => {
        // Color availability column
        if (data.column.index === 4 && data.section === 'body') {
          const val = data.cell.raw as string;
          if (val.startsWith('●')) {
            data.cell.styles.textColor = COLORS.green;
            data.cell.styles.fontStyle = 'bold';
          } else {
            data.cell.styles.textColor = [220, 80, 80];
            data.cell.styles.fontStyle = 'normal';
          }
        }
      },
      didDrawPage: () => {
        // Redraw accent bar on subsequent pages
        doc.setFillColor(...accentColor);
        doc.rect(0, 0, PW, 2, 'F');
        drawPageFooter();
      },
    });

    // Draw footer on first page of this category
    drawPageFooter();

    // ── Per-product detail sheets (for products with technical data) ─────────
    const detailedProducts = prods.filter(p =>
      p.material || p.typeProduit || p.specification || p.applications ||
      p.avantages || p.conseilsEntretien || p.description
    );

    if (detailedProducts.length > 0) {
      let detailY = 20;

      for (let pi = 0; pi < detailedProducts.length; pi++) {
        const p = detailedProducts[pi];
        const neededHeight = 80; // Approximate height per product sheet

        if (detailY + neededHeight > PH - 20 || pi === 0) {
          doc.addPage();
          doc.setFillColor(...accentColor);
          doc.rect(0, 0, PW, 2, 'F');
          detailY = 14;

          if (pi === 0) {
            // Sub-header
            doc.setFont('helvetica', 'bold');
            doc.setFontSize(11);
            doc.setTextColor(...COLORS.black);
            doc.text('Fiches Techniques Détaillées', ML, detailY + 6);
            doc.setFont('helvetica', 'normal');
            doc.setFontSize(7);
            doc.setTextColor(...COLORS.gray);
            doc.text(`${cat.name} — ${detailedProducts.length} produit${detailedProducts.length > 1 ? 's' : ''} avec fiche complète`, ML, detailY + 12);
            doc.setDrawColor(...accentColor);
            doc.setLineWidth(0.6);
            doc.line(ML, detailY + 15, ML + 35, detailY + 15);
            detailY += 22;
          }
        }

        // ── Product card ─────────────────────────────────────────────────
        const cardX = ML;
        const cardW = CW;
        const cardStartY = detailY;

        // Card border
        doc.setDrawColor(...COLORS.veryLightGray);
        doc.setLineWidth(0.3);

        // Product name header
        roundedRect(doc, cardX, detailY, cardW, 10, 2, accentColor);
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(8.5);
        doc.setTextColor(...COLORS.white);
        doc.text(truncate(p.name, 70), cardX + 4, detailY + 6.5);

        // SKU on right
        if (p.sku) {
          doc.setFont('helvetica', 'normal');
          doc.setFontSize(6.5);
          doc.text(`Réf: ${p.sku}`, cardX + cardW - 4, detailY + 6.5, { align: 'right' });
        }

        // Availability badge
        const stockText = p.inStock ? '● DISPONIBLE' : '○ INDISPONIBLE';
        const stockColor = p.inStock ? COLORS.green : [220, 80, 80] as [number, number, number];
        doc.setFillColor(...(p.inStock ? COLORS.greenLight : COLORS.redLight));
        const stockW = 28;
        doc.roundedRect(cardX + cardW - stockW - 4, detailY + 1.5, stockW, 7, 2, 2, 'F');
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(5.5);
        doc.setTextColor(...stockColor);
        doc.text(stockText, cardX + cardW - stockW / 2 - 4, detailY + 6, { align: 'center' });

        detailY += 13;

        // Description
        if (p.description) {
          doc.setFont('helvetica', 'normal');
          doc.setFontSize(7);
          doc.setTextColor(...COLORS.darkGray);
          const descLines = doc.splitTextToSize(truncate(p.description, 300), cardW - 8);
          doc.text(descLines, cardX + 4, detailY + 4);
          detailY += descLines.length * 3.5 + 4;
        }

        // Technical specs in 2 columns
        const allSpecs: { label: string; value: string }[] = [
          { label: 'Matériau', value: p.material || '' },
          { label: 'Type', value: p.typeProduit || '' },
          { label: 'Spécification', value: p.specification || '' },
          { label: 'Couleur', value: p.couleur || '' },
          { label: 'Largeur', value: p.width || '' },
          { label: 'Largeur maille', value: p.largeurMaille || '' },
          { label: 'Longueur', value: p.longueur || '' },
          { label: 'Poids', value: p.weight ? `${p.weight}g` : '' },
          { label: 'Emballage', value: p.packaging || '' },
          { label: 'Composition ruban', value: p.compositionRuban || '' },
          { label: 'Matière/Mailles', value: p.matiereMailles || '' },
          { label: 'Design', value: p.design || '' },
          { label: 'Résistance', value: p.resistance || '' },
          { label: 'Sécurité', value: p.securite || '' },
          { label: 'Compatible avec', value: p.compatibleAvec || '' },
          { label: 'Origine', value: p.paysFabrication || '' },
        ].filter(s => s.value);

        if (allSpecs.length > 0) {
          doc.setFont('helvetica', 'bold');
          doc.setFontSize(7);
          doc.setTextColor(...accentColor);
          doc.text('CARACTÉRISTIQUES TECHNIQUES', cardX + 4, detailY + 3);
          detailY += 6;

          const colW = (cardW - 12) / 2;
          allSpecs.forEach((spec, si) => {
            const col = si % 2;
            const sx = cardX + 4 + col * (colW + 4);

            if (col === 0 && si > 0) detailY += 5;

            // Check page break
            if (detailY > PH - 25) {
              drawPageFooter();
              doc.addPage();
              doc.setFillColor(...accentColor);
              doc.rect(0, 0, PW, 2, 'F');
              detailY = 14;
            }

            // Label
            doc.setFont('helvetica', 'bold');
            doc.setFontSize(5.5);
            doc.setTextColor(...COLORS.gray);
            doc.text(spec.label.toUpperCase(), sx, detailY + 3);

            // Value
            doc.setFont('helvetica', 'normal');
            doc.setFontSize(7);
            doc.setTextColor(...COLORS.black);
            doc.text(truncate(spec.value, 45), sx, detailY + 7);
          });

          if (allSpecs.length % 2 !== 0) detailY += 5;
          detailY += 6;
        }

        // Additional info
        const infoSpecs: { label: string; value: string }[] = [
          { label: 'Applications', value: p.applications || '' },
          { label: 'Avantages', value: p.avantages || '' },
          { label: 'Conseils d\'entretien', value: p.conseilsEntretien || '' },
          { label: 'Info commerciale', value: p.informationCommerciale || '' },
        ].filter(s => s.value);

        if (infoSpecs.length > 0) {
          doc.setFont('helvetica', 'bold');
          doc.setFontSize(7);
          doc.setTextColor(...accentColor);
          doc.text('INFORMATIONS COMPLÉMENTAIRES', cardX + 4, detailY + 3);
          detailY += 7;

          infoSpecs.forEach(spec => {
            if (detailY > PH - 25) {
              drawPageFooter();
              doc.addPage();
              doc.setFillColor(...accentColor);
              doc.rect(0, 0, PW, 2, 'F');
              detailY = 14;
            }

            doc.setFont('helvetica', 'bold');
            doc.setFontSize(6);
            doc.setTextColor(...COLORS.darkGray);
            doc.text(spec.label, cardX + 4, detailY + 3);
            doc.setFont('helvetica', 'normal');
            doc.setFontSize(6.5);
            doc.setTextColor(...COLORS.gray);
            const infoLines = doc.splitTextToSize(truncate(spec.value, 200), cardW - 12);
            doc.text(infoLines, cardX + 4, detailY + 7);
            detailY += infoLines.length * 3 + 6;
          });
        }

        // Variants
        if (p.variants && p.variants.length > 0) {
          if (detailY > PH - 30) {
            drawPageFooter();
            doc.addPage();
            doc.setFillColor(...accentColor);
            doc.rect(0, 0, PW, 2, 'F');
            detailY = 14;
          }

          doc.setFont('helvetica', 'bold');
          doc.setFontSize(7);
          doc.setTextColor(...accentColor);
          doc.text(`VARIANTES (${p.variants.length})`, cardX + 4, detailY + 3);
          detailY += 5;

          const variantRows = p.variants.map(v => [
            v.color || '—',
            v.size || '—',
            v.sku || '—',
            v.stock > 0 ? `● ${v.stock}` : '○ 0',
          ]);

          autoTable(doc, {
            startY: detailY,
            margin: { left: cardX + 4, right: MR + 4 },
            head: [['Couleur', 'Taille', 'Réf.', 'Stock']],
            body: variantRows,
            theme: 'plain',
            styles: {
              fontSize: 6.5,
              cellPadding: 2,
              lineColor: COLORS.veryLightGray,
              lineWidth: 0.2,
              textColor: COLORS.darkGray,
            },
            headStyles: {
              fillColor: COLORS.veryLightGray,
              textColor: COLORS.darkGray,
              fontStyle: 'bold',
              fontSize: 6,
            },
            columnStyles: {
              3: { halign: 'center' },
            },
            didParseCell: (data) => {
              if (data.column.index === 3 && data.section === 'body') {
                const val = data.cell.raw as string;
                if (val.startsWith('●')) {
                  data.cell.styles.textColor = COLORS.green;
                  data.cell.styles.fontStyle = 'bold';
                } else {
                  data.cell.styles.textColor = [220, 80, 80];
                }
              }
            },
          });

          // @ts-ignore - autoTable extends doc
          detailY = (doc as any).lastAutoTable?.finalY || detailY + 15;
          detailY += 5;
        }

        // Bottom card border
        doc.setDrawColor(...COLORS.veryLightGray);
        doc.setLineWidth(0.3);
        doc.line(cardX, detailY, cardX + cardW, detailY);
        detailY += 8;
      }

      drawPageFooter();
    }
  }

  onProgress?.(92, 'Dernière page...');

  // ══════════════════════════════════════════════════════════════════════════════
  // ── LAST PAGE: CONTACT ────────────────────────────────────────────────────────
  // ══════════════════════════════════════════════════════════════════════════════

  doc.addPage();

  // Dark background
  doc.setFillColor(15, 15, 15);
  doc.rect(0, 0, PW, PH, 'F');

  // Red glow
  doc.setFillColor(200, 16, 46);
  doc.setGState(doc.GState({ opacity: 0.05 }));
  doc.circle(PW / 2, PH / 2 - 30, 80, 'F');
  doc.setGState(doc.GState({ opacity: 1 }));

  // Title
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(32);
  doc.setTextColor(...COLORS.white);
  doc.text('Besoin', PW / 2, 95, { align: 'center' });
  doc.text("d'information ?", PW / 2, 108, { align: 'center' });

  // Description
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  doc.setTextColor(255, 255, 255, 50);
  const contactDesc = doc.splitTextToSize(
    'Contactez-nous pour les prix, quantités minimales, ou toute question. Notre équipe vous répond rapidement.',
    120
  );
  doc.text(contactDesc, PW / 2, 122, { align: 'center' });

  // WhatsApp CTA
  const ctaY = 145;
  roundedRect(doc, PW / 2 - 50, ctaY, 100, 14, 7, [37, 211, 102]);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(10);
  doc.setTextColor(...COLORS.white);
  doc.text('Demander les prix — WhatsApp', PW / 2, ctaY + 9, { align: 'center' });

  // Phone
  const phoneY = ctaY + 22;
  doc.setDrawColor(255, 255, 255);
  doc.setGState(doc.GState({ opacity: 0.15 }));
  doc.setLineWidth(0.5);
  doc.roundedRect(PW / 2 - 40, phoneY, 80, 12, 6, 6, 'S');
  doc.setGState(doc.GState({ opacity: 1 }));
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(10);
  doc.setTextColor(255, 255, 255, 70);
  doc.text('+212 760 998 347', PW / 2, phoneY + 8, { align: 'center' });

  // Website
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8);
  doc.setTextColor(255, 255, 255, 35);
  doc.text('lebtex.ma', PW / 2, phoneY + 24, { align: 'center' });

  // Brand at bottom
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(28);
  doc.setTextColor(255, 255, 255, 10);
  doc.text('LEBTEX', PW / 2, PH - 30, { align: 'center' });

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(6);
  doc.setTextColor(255, 255, 255, 20);
  doc.text(`© ${now.getFullYear()} LEBTEX — Tous droits réservés`, PW / 2, PH - 20, { align: 'center' });

  onProgress?.(100, 'Téléchargement du PDF...');

  // ── Save ───────────────────────────────────────────────────────────────────
  const filename = `LEBTEX_Catalogue_${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}.pdf`;
  doc.save(filename);

  return filename;
}
