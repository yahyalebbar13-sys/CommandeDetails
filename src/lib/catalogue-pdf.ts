'use client';

import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import type { ShopProduct, ShopCategory } from './shop-types';

// ─── Color Palette ────────────────────────────────────────────────────────────
const C = {
  red:           [200, 16, 46]   as [number, number, number],
  black:         [26, 26, 26]    as [number, number, number],
  darkGray:      [55, 55, 55]    as [number, number, number],
  gray:          [120, 120, 120] as [number, number, number],
  lightGray:     [205, 200, 195] as [number, number, number],
  silk:          [240, 236, 232] as [number, number, number],
  cream:         [253, 251, 248] as [number, number, number],
  white:         [255, 255, 255] as [number, number, number],
  gold:          [212, 168, 67]  as [number, number, number],
  goldDark:      [160, 120, 40]  as [number, number, number],
};

type ProgressCb = (pct: number, msg: string) => void;

// ─── Load image → base64 (with CORS proxy fallback) ──────────────────────────
async function toBase64(url: string): Promise<string | null> {
  if (!url) return null;
  const tryFetch = async (u: string) => {
    const r = await fetch(u, { mode: 'cors' });
    if (!r.ok) throw new Error('not ok');
    const blob = await r.blob();
    return new Promise<string>((res, rej) => {
      const reader = new FileReader();
      reader.onloadend = () => res(reader.result as string);
      reader.onerror = rej;
      reader.readAsDataURL(blob);
    });
  };
  try { return await tryFetch(url); } catch { return null; }
}

// ─── Hex → RGB ───────────────────────────────────────────────────────────────
function hexRgb(hex: string): [number, number, number] {
  const h = hex.replace('#', '');
  return [parseInt(h.slice(0,2),16), parseInt(h.slice(2,4),16), parseInt(h.slice(4,6),16)];
}

// ─── Clip text ───────────────────────────────────────────────────────────────
function clip(t: string, n: number) { return t.length > n ? t.slice(0, n-1)+'…' : t; }

// ─── Draw page footer ─────────────────────────────────────────────────────────
let _pageNum = 0;
function footer(doc: jsPDF, dateStr: string) {
  const PW = 210, PH = 297, ML = 14, MR = 14;
  _pageNum++;
  doc.setDrawColor(...C.lightGray);
  doc.setLineWidth(0.25);
  doc.line(ML, PH-13, PW-MR, PH-13);
  doc.setFont('helvetica','normal');
  doc.setFontSize(6.5);
  doc.setTextColor(...C.gray);
  doc.text('LEBTEX — Mercerie & Accessoires Textiles', ML, PH-9);
  doc.text(dateStr, PW/2, PH-9, { align:'center' });
  doc.setFont('helvetica','bold');
  doc.setTextColor(...C.red);
  doc.text(String(_pageNum), PW-MR, PH-9, { align:'right' });
  doc.setFont('helvetica','italic');
  doc.setFontSize(5);
  doc.setTextColor(...C.lightGray);
  doc.text('Document confidentiel — reproduction interdite sans autorisation écrite de LEBTEX', PW/2, PH-5.5, { align:'center' });
}

// ─── Draw accent band (top of page) ──────────────────────────────────────────
function accentBand(doc: jsPDF, color: [number,number,number]) {
  doc.setFillColor(...color);
  doc.rect(0, 0, 210, 3, 'F');
}

// ═══════════════════════════════════════════════════════════════════════════════
// ── MAIN ───────────────────────────────────────────────────────────────────────
// ═══════════════════════════════════════════════════════════════════════════════
export async function generateCataloguePDF(
  sections: { category: ShopCategory; products: ShopProduct[]; subCategories: ShopCategory[] }[],
  totalProducts: number,
  _inStockCount: number,
  onProgress?: ProgressCb,
) {
  _pageNum = 0;
  const doc = new jsPDF({ orientation:'portrait', unit:'mm', format:'a4' });
  const PW = 210, PH = 297, ML = 14, MR = 14, CW = PW - ML - MR;
  const now  = new Date();
  const year = now.getFullYear();
  const dateStr = now.toLocaleDateString('fr-FR', { day:'2-digit', month:'long', year:'numeric' });

  onProgress?.(3, 'Préparation…');

  // ══════════════════════════════════════════════════════
  // PAGE 1 — COUVERTURE
  // ══════════════════════════════════════════════════════
  // Dark background
  doc.setFillColor(12, 12, 12);
  doc.rect(0, 0, PW, PH, 'F');

  // Subtle red glow
  doc.setFillColor(200, 16, 46);
  doc.setGState(doc.GState({ opacity: 0.07 }));
  doc.ellipse(PW - 30, 40, 90, 70, 'F');
  doc.setFillColor(212, 168, 67);
  doc.setGState(doc.GState({ opacity: 0.04 }));
  doc.ellipse(20, PH - 40, 80, 60, 'F');
  doc.setGState(doc.GState({ opacity: 1 }));

  // Top label pill
  const pill = `CATALOGUE PRODUITS ${year}`;
  doc.setFont('helvetica','bold');
  doc.setFontSize(7.5);
  doc.setTextColor(...C.gold);
  const pillW = doc.getTextWidth(pill) + 14;
  const pillX = PW/2 - pillW/2;
  doc.setFillColor(...C.goldDark);
  doc.setGState(doc.GState({ opacity: 0.2 }));
  doc.roundedRect(pillX, 52, pillW, 9.5, 4, 4, 'F');
  doc.setGState(doc.GState({ opacity: 1 }));
  doc.setDrawColor(...C.gold);
  doc.setLineWidth(0.4);
  doc.roundedRect(pillX, 52, pillW, 9.5, 4, 4, 'S');
  doc.text(pill, PW/2, 58.2, { align:'center' });

  // Main brand name
  doc.setFontSize(62);
  doc.setFont('helvetica','bold');
  doc.setTextColor(...C.white);
  const wLEB = doc.getTextWidth('LEB');
  doc.text('LEB', PW/2 - doc.getTextWidth('LEB')/2 - doc.getTextWidth('TEX')/2, 112);
  doc.setTextColor(...C.red);
  doc.text('TEX', PW/2 - doc.getTextWidth('LEB')/2 - doc.getTextWidth('TEX')/2 + wLEB, 112);

  // Tagline
  doc.setFont('helvetica','normal');
  doc.setFontSize(13);
  doc.setTextColor(255,255,255);
  doc.setGState(doc.GState({ opacity: 0.35 }));
  doc.text('Mercerie & Accessoires Textiles', PW/2, 127, { align:'center' });
  doc.setGState(doc.GState({ opacity: 1 }));

  // Red rule
  doc.setDrawColor(...C.red);
  doc.setLineWidth(1.2);
  doc.line(PW/2-28, 136, PW/2+28, 136);

  // Sub-description
  doc.setFont('helvetica','normal');
  doc.setFontSize(8.5);
  doc.setTextColor(255,255,255);
  doc.setGState(doc.GState({ opacity: 0.3 }));
  const descLines = doc.splitTextToSize('Catalogue officiel de la gamme complète — fermetures, boutons, élastiques, rubans, accessoires couture.', 110);
  doc.text(descLines, PW/2, 148, { align:'center' });
  doc.setGState(doc.GState({ opacity: 1 }));

  // Stat boxes
  const stats = [
    { val: String(totalProducts),  lbl: 'Produits' },
    { val: String(sections.length), lbl: 'Catégories' },
  ];
  const bW = 44, bH = 28, bGap = 10;
  const bTotalW = stats.length * bW + (stats.length-1)*bGap;
  const bStartX = PW/2 - bTotalW/2;
  stats.forEach((s, i) => {
    const bx = bStartX + i*(bW+bGap);
    doc.setGState(doc.GState({ opacity: 0.12 }));
    doc.setFillColor(...C.white);
    doc.roundedRect(bx, 175, bW, bH, 4, 4, 'F');
    doc.setGState(doc.GState({ opacity: 1 }));
    doc.setDrawColor(255,255,255);
    doc.setGState(doc.GState({ opacity: 0.15 }));
    doc.setLineWidth(0.4);
    doc.roundedRect(bx, 175, bW, bH, 4, 4, 'S');
    doc.setGState(doc.GState({ opacity: 1 }));
    doc.setFont('helvetica','bold');
    doc.setFontSize(22);
    doc.setTextColor(...C.white);
    doc.text(s.val, bx+bW/2, 189, { align:'center' });
    doc.setFont('helvetica','normal');
    doc.setFontSize(7);
    doc.setGState(doc.GState({ opacity: 0.4 }));
    doc.text(s.lbl, bx+bW/2, 197, { align:'center' });
    doc.setGState(doc.GState({ opacity: 1 }));
  });

  // Contact at bottom of cover
  doc.setFont('helvetica','normal');
  doc.setFontSize(8);
  doc.setGState(doc.GState({ opacity: 0.3 }));
  doc.setTextColor(...C.white);
  doc.text('lebtex.ma  ·  +212 760 998 347', PW/2, 268, { align:'center' });
  doc.setFontSize(6.5);
  doc.setGState(doc.GState({ opacity: 0.18 }));
  doc.text(`Généré le ${dateStr}`, PW/2, PH - 10, { align:'center' });
  doc.setGState(doc.GState({ opacity: 1 }));

  onProgress?.(10, 'Couverture créée…');

  // ══════════════════════════════════════════════════════
  // PAGE 2 — SOMMAIRE
  // ══════════════════════════════════════════════════════
  doc.addPage();
  accentBand(doc, C.red);

  doc.setFont('helvetica','bold');
  doc.setFontSize(28);
  doc.setTextColor(...C.black);
  doc.text('Sommaire', ML, 26);

  doc.setFont('helvetica','normal');
  doc.setFontSize(8.5);
  doc.setTextColor(...C.gray);
  doc.text(`${sections.length} catégories  ·  ${totalProducts} produits`, ML, 33);

  doc.setDrawColor(...C.red);
  doc.setLineWidth(0.8);
  doc.line(ML, 37, ML+30, 37);

  let sy = 48;
  sections.forEach((sec, i) => {
    const cat = sec.category;
    const accent = cat.color ? hexRgb(cat.color) : C.red;
    if (sy > PH - 30) {
      footer(doc, dateStr);
      doc.addPage();
      accentBand(doc, C.red);
      sy = 16;
    }

    // Number badge
    doc.setFillColor(...accent);
    doc.roundedRect(ML, sy, 11, 11, 2, 2, 'F');
    doc.setFont('helvetica','bold');
    doc.setFontSize(8);
    doc.setTextColor(...C.white);
    doc.text(String(i+1).padStart(2,'0'), ML+5.5, sy+7.2, { align:'center' });

    // Name
    doc.setFont('helvetica','bold');
    doc.setFontSize(11.5);
    doc.setTextColor(...C.black);
    doc.text(cat.name, ML+15, sy+5);

    // Description
    if (cat.description) {
      doc.setFont('helvetica','normal');
      doc.setFontSize(7);
      doc.setTextColor(...C.gray);
      doc.text(clip(cat.description, 85), ML+15, sy+9.5);
    }

    // Products count (right)
    doc.setFont('helvetica','bold');
    doc.setFontSize(11);
    doc.setTextColor(...accent);
    doc.text(String(sec.products.length), PW-MR, sy+5, { align:'right' });
    doc.setFont('helvetica','normal');
    doc.setFontSize(6.5);
    doc.setTextColor(...C.gray);
    doc.text(`produit${sec.products.length>1?'s':''}`, PW-MR, sy+9.5, { align:'right' });

    // Divider
    doc.setDrawColor(...C.silk);
    doc.setLineWidth(0.25);
    doc.line(ML+15, sy+13, PW-MR, sy+13);

    sy += 19;
  });

  footer(doc, dateStr);
  onProgress?.(18, 'Sommaire créé…');

  // ══════════════════════════════════════════════════════
  // SECTIONS — Products with photos
  // ══════════════════════════════════════════════════════
  const totalSec = sections.length;

  for (let si = 0; si < sections.length; si++) {
    const sec      = sections[si];
    const cat      = sec.category;
    const accent   = cat.color ? hexRgb(cat.color) : C.red;
    const prods    = sec.products;

    const pctBase  = 18 + (si / totalSec) * 72;
    onProgress?.(Math.round(pctBase), `Section ${si+1}/${totalSec}: ${cat.name}…`);

    // ── Category header page ─────────────────────────────────────────────────
    doc.addPage();
    accentBand(doc, accent);

    // Header band background
    doc.setFillColor(...C.cream);
    doc.rect(0, 3, PW, 42, 'F');

    // Section number
    doc.setFillColor(...accent);
    doc.roundedRect(ML, 9, 22, 22, 3, 3, 'F');
    doc.setFont('helvetica','bold');
    doc.setFontSize(16);
    doc.setTextColor(...C.white);
    doc.text(String(si+1).padStart(2,'0'), ML+11, 22.5, { align:'center' });

    // Category name
    doc.setFont('helvetica','bold');
    doc.setFontSize(22);
    doc.setTextColor(...C.black);
    doc.text(cat.name, ML+28, 20);

    // Category description
    if (cat.description) {
      doc.setFont('helvetica','normal');
      doc.setFontSize(8.5);
      doc.setTextColor(...C.gray);
      const dLines = doc.splitTextToSize(cat.description, CW - 50);
      doc.text(dLines, ML+28, 28);
    }

    // Products count
    doc.setFont('helvetica','bold');
    doc.setFontSize(16);
    doc.setTextColor(...accent);
    doc.text(String(prods.length), PW-MR-4, 18, { align:'right' });
    doc.setFont('helvetica','normal');
    doc.setFontSize(7);
    doc.setTextColor(...C.gray);
    doc.text(`produit${prods.length>1?'s':''}`, PW-MR-4, 24, { align:'right' });

    // ── Load all images for this category ────────────────────────────────────
    onProgress?.(Math.round(pctBase + 0.3), `Chargement des images: ${cat.name}…`);
    const imageCache: Record<string, string|null> = {};
    await Promise.all(
      prods.flatMap(p => (p.images||[]).slice(0,1)).map(async url => {
        if (url && !imageCache[url]) {
          imageCache[url] = await toBase64(url);
        }
      })
    );

    // ── Render products: 2-column grid layout ────────────────────────────────
    // Each product card: image on left, details on right
    const CARD_H  = 68;  // mm per card
    const CARD_GAP = 6;
    const IMG_W   = 45;
    const IMG_H   = 45;
    const COL_COUNT = 2;
    const COL_W  = (CW - (COL_COUNT-1)*CARD_GAP) / COL_COUNT;

    let py = 52; // start after header

    for (let pi = 0; pi < prods.length; pi++) {
      const p = prods[pi];
      const col = pi % COL_COUNT;

      if (col === 0 && pi > 0) {
        py += CARD_H + CARD_GAP;
      }

      // Page break
      if (py + CARD_H > PH - 20) {
        footer(doc, dateStr);
        doc.addPage();
        accentBand(doc, accent);
        py = 10;
      }

      const cx = ML + col * (COL_W + CARD_GAP);
      const cy = py;

      // Card background
      doc.setFillColor(...C.cream);
      doc.setDrawColor(...C.silk);
      doc.setLineWidth(0.25);
      doc.roundedRect(cx, cy, COL_W, CARD_H, 3, 3, 'FD');

      // Accent top bar
      doc.setFillColor(...accent);
      doc.roundedRect(cx, cy, COL_W, 3, 3, 3, 'F');
      doc.rect(cx, cy+1, COL_W, 2, 'F');

      // ── Image ──────────────────────────────────────────────────────────────
      const imgUrl = (p.images||[])[0];
      const imgData = imgUrl ? imageCache[imgUrl] : null;
      const imgX = cx + 4;
      const imgY = cy + 7;

      // Image placeholder background
      doc.setFillColor(232, 228, 224);
      doc.roundedRect(imgX, imgY, IMG_W, IMG_H, 2, 2, 'F');

      if (imgData) {
        try {
          doc.addImage(imgData, 'JPEG', imgX, imgY, IMG_W, IMG_H, undefined, 'FAST');
        } catch {
          // fallback: grey square
          doc.setFillColor(210, 206, 202);
          doc.roundedRect(imgX, imgY, IMG_W, IMG_H, 2, 2, 'F');
        }
      }

      // ── Right side: product info ───────────────────────────────────────────
      const rx = cx + IMG_W + 8;
      const rw = COL_W - IMG_W - 12;
      let ry = cy + 8;

      // SKU
      if (p.sku) {
        doc.setFont('helvetica','normal');
        doc.setFontSize(6);
        doc.setTextColor(...C.gray);
        doc.text(`Réf: ${p.sku}`, rx, ry);
        ry += 4;
      }

      // Product name
      doc.setFont('helvetica','bold');
      doc.setFontSize(9);
      doc.setTextColor(...C.black);
      const nameLines = doc.splitTextToSize(clip(p.name, 60), rw);
      doc.text(nameLines, rx, ry);
      ry += nameLines.length * 4.5 + 1;

      // Short description
      if (p.shortDescription) {
        doc.setFont('helvetica','normal');
        doc.setFontSize(6.5);
        doc.setTextColor(...C.darkGray);
        const sdLines = doc.splitTextToSize(clip(p.shortDescription, 100), rw);
        doc.text(sdLines.slice(0,2), rx, ry);
        ry += Math.min(sdLines.length, 2) * 3.5 + 2;
      }

      // Specs: compact inline list
      const specs: string[] = [];
      if (p.material)      specs.push(`Matériau: ${p.material}`);
      if (p.typeProduit)   specs.push(`Type: ${p.typeProduit}`);
      if (p.couleur)       specs.push(`Couleur: ${p.couleur}`);
      if (p.width)         specs.push(`Largeur: ${p.width}`);
      if (p.longueur)      specs.push(`Longueur: ${p.longueur}`);
      if (p.weight)        specs.push(`Poids: ${p.weight}g`);
      if (p.packaging)     specs.push(`Emballage: ${p.packaging}`);
      if (p.paysFabrication) specs.push(`Origine: ${p.paysFabrication}`);

      specs.slice(0, 4).forEach(sp => {
        if (ry > cy + CARD_H - 6) return;
        const [lbl, val] = sp.split(': ');
        doc.setFont('helvetica','bold');
        doc.setFontSize(5.5);
        doc.setTextColor(...C.gray);
        doc.text(`${lbl}:`, rx, ry);
        doc.setFont('helvetica','normal');
        doc.setTextColor(...C.black);
        doc.text(clip(val||'', 30), rx + doc.getTextWidth(`${lbl}: `), ry);
        ry += 4;
      });

      // Variants count if any
      if (p.variants?.length > 0) {
        if (ry <= cy + CARD_H - 6) {
          doc.setFont('helvetica','bold');
          doc.setFontSize(5.5);
          doc.setTextColor(...accent);
          const colors = [...new Set(p.variants.filter(v=>v.color).map(v=>v.color!))];
          const sizes  = [...new Set(p.variants.filter(v=>v.size).map(v=>v.size!))];
          if (colors.length > 0) doc.text(`Coloris: ${colors.join(', ')}`, rx, ry), ry += 4;
          if (sizes.length > 0)  doc.text(`Tailles: ${sizes.join(', ')}`, rx, ry), ry += 4;
        }
      }
    }

    // Last row might be a single-column card, still needs footer
    footer(doc, dateStr);

    // ── Detailed product sheets page (for products with rich data) ─────────
    const richProds = prods.filter(p =>
      p.description || p.material || p.applications || p.avantages ||
      p.conseilsEntretien || p.informationCommerciale || p.specification
    );

    if (richProds.length > 0) {
      doc.addPage();
      accentBand(doc, accent);

      // Sheet section header
      doc.setFillColor(...C.cream);
      doc.rect(0, 3, PW, 16, 'F');
      doc.setFont('helvetica','bold');
      doc.setFontSize(13);
      doc.setTextColor(...C.black);
      doc.text(`${cat.name} — Fiches Techniques Détaillées`, ML, 14);
      doc.setDrawColor(...accent);
      doc.setLineWidth(0.6);
      doc.line(ML, 17.5, ML+60, 17.5);

      let dy = 24;

      for (const p of richProds) {
        // Estimate card height
        const techSpecs = [
          p.material, p.typeProduit, p.specification, p.couleur, p.width,
          p.largeurMaille, p.longueur, p.weight ? `${p.weight}g` : '', p.packaging,
          p.matiereMailles, p.compositionRuban, p.type, p.design, p.resistance,
          p.securite, p.compatibleAvec, p.paysFabrication,
        ].filter(Boolean);
        const infoSpecs = [p.applications, p.avantages, p.conseilsEntretien, p.informationCommerciale].filter(Boolean);
        const estimatedH = 14 + (p.description ? 12 : 0) + techSpecs.length * 4.5 + infoSpecs.length * 10 + 12;

        if (dy + estimatedH > PH - 18) {
          footer(doc, dateStr);
          doc.addPage();
          accentBand(doc, accent);
          dy = 10;
        }

        // ── Image + Header bar ───────────────────────────────────────────────
        const cardX = ML, cardW = CW;

        // Image (small, on the left)
        const imgUrl = (p.images||[])[0];
        const imgData = imgUrl ? imageCache[imgUrl] : null;
        const SH = 32; // small image height

        // Name header
        doc.setFillColor(...accent);
        doc.setGState(doc.GState({ opacity: 0.12 }));
        doc.roundedRect(cardX, dy, cardW, 10, 2, 2, 'F');
        doc.setGState(doc.GState({ opacity: 1 }));
        doc.setDrawColor(...accent);
        doc.setLineWidth(0.25);
        doc.roundedRect(cardX, dy, cardW, 10, 2, 2, 'S');

        // Left accent strip
        doc.setFillColor(...accent);
        doc.rect(cardX, dy+2, 2.5, 6, 'F');

        doc.setFont('helvetica','bold');
        doc.setFontSize(9);
        doc.setTextColor(...C.black);
        doc.text(clip(p.name, 90), cardX + 6, dy + 7);
        if (p.sku) {
          doc.setFont('helvetica','normal');
          doc.setFontSize(6.5);
          doc.setTextColor(...C.gray);
          doc.text(`Réf: ${p.sku}`, cardX + cardW - 3, dy + 7, { align:'right' });
        }
        dy += 13;

        // ── Body: image left + content right ───────────────────────────────
        const IMG_SH = 32;
        const IMG_SW = 32;
        let bodyY = dy;

        // Small image
        if (imgData) {
          doc.setFillColor(232, 228, 224);
          doc.roundedRect(cardX, bodyY, IMG_SW, IMG_SH, 2, 2, 'F');
          try {
            doc.addImage(imgData, 'JPEG', cardX, bodyY, IMG_SW, IMG_SH, undefined, 'FAST');
          } catch {
            doc.setFillColor(210, 206, 202);
            doc.roundedRect(cardX, bodyY, IMG_SW, IMG_SH, 2, 2, 'F');
          }
        }

        const cx2 = cardX + (imgData ? IMG_SW + 5 : 0);
        const cw2 = cardW - (imgData ? IMG_SW + 5 : 0);
        let cy2 = bodyY;

        // Description
        if (p.description) {
          doc.setFont('helvetica','italic');
          doc.setFontSize(7);
          doc.setTextColor(...C.darkGray);
          const dl = doc.splitTextToSize(clip(p.description, 350), cw2);
          doc.text(dl.slice(0,3), cx2, cy2 + 4);
          cy2 += Math.min(dl.length, 3) * 3.5 + 4;
        }

        // Technical specs — 2 columns
        if (techSpecs.length > 0) {
          const specLabels = [
            'Matériau','Type de produit','Spécification','Couleur','Largeur',
            'Largeur maille','Longueur','Poids','Emballage','Matière/Mailles',
            'Composition ruban','Type','Design','Résistance','Sécurité',
            'Compatible avec','Pays de fabrication',
          ];
          const specValues = [
            p.material, p.typeProduit, p.specification, p.couleur, p.width,
            p.largeurMaille, p.longueur, p.weight ? `${p.weight}g` : '', p.packaging,
            p.matiereMailles, p.compositionRuban, p.type, p.design, p.resistance,
            p.securite, p.compatibleAvec, p.paysFabrication,
          ];
          const pairs = specLabels.map((l,i)=>({ l, v:specValues[i]||'' })).filter(s=>s.v);

          // Section title
          doc.setFont('helvetica','bold');
          doc.setFontSize(6.5);
          doc.setTextColor(...accent);
          doc.text('CARACTÉRISTIQUES TECHNIQUES', cx2, cy2 + 3);
          cy2 += 5;

          const halfW = (cw2 - 4) / 2;
          pairs.forEach((s, i) => {
            const scol = i % 2;
            if (scol === 0 && i > 0) cy2 += 5.5;
            if (cy2 > Math.max(bodyY + IMG_SH, dy + estimatedH - 8)) { cy2 += 5.5; return; }
            const sx = cx2 + scol * (halfW + 4);

            doc.setFont('helvetica','bold');
            doc.setFontSize(5.2);
            doc.setTextColor(...C.gray);
            doc.text(s.l.toUpperCase(), sx, cy2 + 2);
            doc.setFont('helvetica','normal');
            doc.setFontSize(6.5);
            doc.setTextColor(...C.black);
            doc.text(clip(s.v, 35), sx, cy2 + 6);
          });
          if (pairs.length % 2 !== 0) cy2 += 5.5;
          cy2 += 7;
        }

        // Advance dy to below image or content
        dy = Math.max(bodyY + IMG_SH, cy2) + 4;

        // Additional information sections
        const infoData: { label: string; value: string }[] = [
          { label:'Applications', value: p.applications||'' },
          { label:'Avantages', value: p.avantages||'' },
          { label:"Conseils d'entretien", value: p.conseilsEntretien||'' },
          { label:'Information commerciale', value: p.informationCommerciale||'' },
        ].filter(s => s.value);

        if (infoData.length > 0) {
          if (dy + 6 > PH - 18) {
            footer(doc, dateStr);
            doc.addPage();
            accentBand(doc, accent);
            dy = 10;
          }

          doc.setFont('helvetica','bold');
          doc.setFontSize(6.5);
          doc.setTextColor(...accent);
          doc.text('INFORMATIONS COMPLÉMENTAIRES', cardX, dy + 3);
          dy += 6;

          infoData.forEach(info => {
            if (dy > PH - 18) {
              footer(doc, dateStr);
              doc.addPage();
              accentBand(doc, accent);
              dy = 10;
            }
            doc.setFont('helvetica','bold');
            doc.setFontSize(6.2);
            doc.setTextColor(...C.darkGray);
            doc.text(info.label, cardX, dy + 3);
            doc.setFont('helvetica','normal');
            doc.setFontSize(6.5);
            doc.setTextColor(...C.gray);
            const il = doc.splitTextToSize(clip(info.value, 250), CW - 4);
            doc.text(il.slice(0, 4), cardX, dy + 7);
            dy += Math.min(il.length, 4) * 3.5 + 6;
          });
        }

        // Divider
        doc.setDrawColor(...C.silk);
        doc.setLineWidth(0.25);
        doc.line(cardX, dy, cardX + cardW, dy);
        dy += 7;
      }

      footer(doc, dateStr);
    }
  }

  onProgress?.(93, 'Page de contact…');

  // ══════════════════════════════════════════════════════
  // LAST PAGE — CONTACT
  // ══════════════════════════════════════════════════════
  doc.addPage();

  // Dark bg
  doc.setFillColor(12, 12, 12);
  doc.rect(0, 0, PW, PH, 'F');

  // Red glow
  doc.setFillColor(...C.red);
  doc.setGState(doc.GState({ opacity: 0.06 }));
  doc.ellipse(PW/2, PH/2 - 20, 80, 70, 'F');
  doc.setGState(doc.GState({ opacity: 1 }));

  doc.setFont('helvetica','bold');
  doc.setFontSize(34);
  doc.setTextColor(...C.white);
  doc.text("Besoin d'informations ?", PW/2, 100, { align:'center' });

  doc.setFont('helvetica','normal');
  doc.setFontSize(9);
  doc.setGState(doc.GState({ opacity: 0.4 }));
  doc.text('Contactez-nous pour les tarifs, quantités et conditions.', PW/2, 114, { align:'center' });
  doc.setGState(doc.GState({ opacity: 1 }));

  // WhatsApp button
  const waY = 132;
  doc.setFillColor(37, 211, 102);
  doc.roundedRect(PW/2 - 48, waY, 96, 14, 7, 7, 'F');
  doc.setFont('helvetica','bold');
  doc.setFontSize(9.5);
  doc.setTextColor(...C.white);
  doc.text('Demander les prix — WhatsApp', PW/2, waY + 9.5, { align:'center' });

  // Phone
  doc.setGState(doc.GState({ opacity: 0.15 }));
  doc.setDrawColor(...C.white);
  doc.setLineWidth(0.4);
  doc.roundedRect(PW/2-35, 156, 70, 11, 5, 5, 'S');
  doc.setGState(doc.GState({ opacity: 1 }));
  doc.setFont('helvetica','bold');
  doc.setFontSize(10);
  doc.setGState(doc.GState({ opacity: 0.6 }));
  doc.setTextColor(...C.white);
  doc.text('+212 760 998 347', PW/2, 163, { align:'center' });
  doc.setGState(doc.GState({ opacity: 1 }));

  doc.setFont('helvetica','normal');
  doc.setFontSize(8.5);
  doc.setGState(doc.GState({ opacity: 0.28 }));
  doc.text('lebtex.ma', PW/2, 180, { align:'center' });
  doc.setGState(doc.GState({ opacity: 0.08 }));
  doc.setFont('helvetica','bold');
  doc.setFontSize(40);
  doc.text('LEBTEX', PW/2, PH - 30, { align:'center' });
  doc.setGState(doc.GState({ opacity: 0.18 }));
  doc.setFont('helvetica','normal');
  doc.setFontSize(6.5);
  doc.text(`© ${year} LEBTEX — Tous droits réservés`, PW/2, PH - 18, { align:'center' });
  doc.setGState(doc.GState({ opacity: 1 }));

  onProgress?.(100, 'Téléchargement…');

  const fname = `LEBTEX_Catalogue_${year}-${String(now.getMonth()+1).padStart(2,'0')}-${String(now.getDate()).padStart(2,'0')}.pdf`;
  doc.save(fname);
  return fname;
}
