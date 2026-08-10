'use client';

import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import type { ShopProduct, ShopCategory } from './shop-types';
import { LOGO_B64 } from './logo-b64';

// ─── Colors ───────────────────────────────────────────────────────────────────
const C = {
  red:       [200, 16, 46]   as [number, number, number],
  black:     [26, 26, 26]    as [number, number, number],
  dark:      [55, 55, 55]    as [number, number, number],
  gray:      [120, 120, 120] as [number, number, number],
  lgray:     [200, 196, 192] as [number, number, number],
  silk:      [238, 234, 230] as [number, number, number],
  cream:     [253, 251, 248] as [number, number, number],
  white:     [255, 255, 255] as [number, number, number],
  gold:      [212, 168, 67]  as [number, number, number],
};

type ProgressCb = (pct: number, msg: string) => void;

// ─── Load image via Canvas (avoids SSL issues) ────────────────────────────────
async function imgToBase64(url: string): Promise<string | null> {
  if (!url) return null;
  return new Promise((resolve) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => {
      try {
        const canvas = document.createElement('canvas');
        canvas.width = img.naturalWidth || img.width;
        canvas.height = img.naturalHeight || img.height;
        const ctx = canvas.getContext('2d');
        if (!ctx) { resolve(null); return; }
        ctx.drawImage(img, 0, 0);
        resolve(canvas.toDataURL('image/jpeg', 0.85));
      } catch { resolve(null); }
    };
    img.onerror = () => resolve(null);
    // Append a cache-busting param to help CORS
    img.src = url.includes('?') ? url : url + '?x=1';
    // Timeout fallback
    setTimeout(() => resolve(null), 8000);
  });
}

// ─── Hex → RGB ────────────────────────────────────────────────────────────────
function hexRgb(hex: string): [number, number, number] {
  const h = hex.replace('#', '');
  return [parseInt(h.slice(0,2),16), parseInt(h.slice(2,4),16), parseInt(h.slice(4,6),16)];
}

// ─── Clip text ────────────────────────────────────────────────────────────────
function clip(t: string, n: number) { return t && t.length > n ? t.slice(0, n-1)+'…' : (t||''); }

// ─── Page counter ─────────────────────────────────────────────────────────────
let _pg = 0;

// ─── Footer ───────────────────────────────────────────────────────────────────
function drawFooter(doc: jsPDF, dateStr: string) {
  const PW = 210, PH = 297, ML = 14, MR = 14;
  _pg++;
  doc.setDrawColor(...C.lgray);
  doc.setLineWidth(0.2);
  doc.line(ML, PH-13, PW-MR, PH-13);
  doc.setFont('helvetica','normal');
  doc.setFontSize(6.5);
  doc.setTextColor(...C.gray);
  doc.text('LEBTEX — Mercerie & Accessoires Textiles', ML, PH-9);
  doc.text(dateStr, PW/2, PH-9, { align:'center' });
  doc.setFont('helvetica','bold');
  doc.setTextColor(...C.red);
  doc.text(String(_pg), PW-MR, PH-9, { align:'right' });
  doc.setFont('helvetica','italic');
  doc.setFontSize(5);
  doc.setTextColor(...C.lgray);
  doc.text('Document confidentiel — reproduction interdite sans autorisation', PW/2, PH-5.5, { align:'center' });
}

// ─── Accent band ─────────────────────────────────────────────────────────────
function band(doc: jsPDF, color: [number,number,number]) {
  doc.setFillColor(...color);
  doc.rect(0, 0, 210, 3, 'F');
}

// ─── Draw image safely ───────────────────────────────────────────────────────
function drawImg(doc: jsPDF, data: string, x: number, y: number, w: number, h: number) {
  if (!data) return;
  try {
    const fmt = data.startsWith('data:image/png') ? 'PNG' : 'JPEG';
    doc.addImage(data, fmt, x, y, w, h, undefined, 'FAST');
  } catch { /* silently skip */ }
}

// ─── Spec row ────────────────────────────────────────────────────────────────
function specRow(doc: jsPDF, label: string, value: string, x: number, y: number, colW: number): number {
  if (!value) return y;
  doc.setFont('helvetica','bold');
  doc.setFontSize(5.5);
  doc.setTextColor(...C.gray);
  doc.text(label.toUpperCase(), x, y);
  doc.setFont('helvetica','normal');
  doc.setFontSize(7);
  doc.setTextColor(...C.black);
  doc.text(clip(value, 42), x, y + 4.5);
  return y + 9;
}

// ═══════════════════════════════════════════════════════════════════════════════
// ── MAIN ───────────────────────────────────────────────────────────────────────
// ═══════════════════════════════════════════════════════════════════════════════
export async function generateCataloguePDF(
  sections: { category: ShopCategory; products: ShopProduct[]; subCategories: ShopCategory[] }[],
  totalProducts: number,
  _ignored: number,
  onProgress?: ProgressCb,
) {
  _pg = 0;
  const doc = new jsPDF({ orientation:'portrait', unit:'mm', format:'a4' });
  const PW = 210, PH = 297, ML = 14, MR = 14, CW = PW - ML - MR;
  const now = new Date();
  const year = now.getFullYear();
  const dateStr = now.toLocaleDateString('fr-FR', { day:'2-digit', month:'long', year:'numeric' });

  onProgress?.(3, 'Préparation…');

  // ══════════════════════════════════════════════════════
  // PAGE 1 — COUVERTURE
  // ══════════════════════════════════════════════════════
  doc.setFillColor(12, 12, 12);
  doc.rect(0, 0, PW, PH, 'F');

  // Red glow top-right
  doc.setFillColor(200, 16, 46);
  doc.setGState(doc.GState({ opacity: 0.08 }));
  doc.ellipse(PW + 10, 30, 85, 65, 'F');
  // Gold glow bottom-left
  doc.setFillColor(212, 168, 67);
  doc.setGState(doc.GState({ opacity: 0.05 }));
  doc.ellipse(-10, PH - 30, 70, 50, 'F');
  doc.setGState(doc.GState({ opacity: 1 }));

  // Logo image (centered, white-ish)
  try {
    // Place logo in center of page
    const logoW = 80;
    const logoH = 36;
    const logoX = PW/2 - logoW/2;
    const logoY = 72;
    doc.addImage(LOGO_B64, 'PNG', logoX, logoY, logoW, logoH, undefined, 'FAST');
  } catch {
    // Fallback text if logo fails
    doc.setFont('helvetica','bold');
    doc.setFontSize(52);
    doc.setTextColor(...C.white);
    const wLEB = doc.getTextWidth('LEB');
    doc.text('LEB', PW/2 - doc.getTextWidth('LEB')/2 - doc.getTextWidth('TEX')/2, 105);
    doc.setTextColor(...C.red);
    doc.text('TEX', PW/2 - doc.getTextWidth('LEB')/2 - doc.getTextWidth('TEX')/2 + wLEB, 105);
  }

  // Divider under logo
  doc.setDrawColor(...C.red);
  doc.setLineWidth(1);
  doc.line(PW/2 - 35, 116, PW/2 + 35, 116);

  // Tagline
  doc.setFont('helvetica','normal');
  doc.setFontSize(11);
  doc.setGState(doc.GState({ opacity: 0.45 }));
  doc.setTextColor(...C.white);
  doc.text('Mercerie & Accessoires Textiles', PW/2, 126, { align:'center' });
  doc.setGState(doc.GState({ opacity: 1 }));

  // Label pill
  const pillText = `CATALOGUE PRODUITS ${year}`;
  doc.setFont('helvetica','bold');
  doc.setFontSize(7.5);
  doc.setTextColor(...C.gold);
  const pillW = doc.getTextWidth(pillText) + 14;
  doc.setDrawColor(...C.gold);
  doc.setGState(doc.GState({ opacity: 0.5 }));
  doc.roundedRect(PW/2 - pillW/2, 138, pillW, 9, 4, 4, 'S');
  doc.setGState(doc.GState({ opacity: 1 }));
  doc.text(pillText, PW/2, 144.2, { align:'center' });

  // Stat boxes
  const stats = [
    { val: String(totalProducts),   lbl: 'Produits' },
    { val: String(sections.length), lbl: 'Catégories' },
  ];
  const bW = 42, bH = 26, bGap = 12;
  const bTW = stats.length * bW + (stats.length-1)*bGap;
  const bSX = PW/2 - bTW/2;
  stats.forEach((s, i) => {
    const bx = bSX + i*(bW+bGap), by = 164;
    doc.setGState(doc.GState({ opacity: 0.1 }));
    doc.setFillColor(...C.white);
    doc.roundedRect(bx, by, bW, bH, 4, 4, 'F');
    doc.setGState(doc.GState({ opacity: 1 }));
    doc.setDrawColor(255,255,255);
    doc.setGState(doc.GState({ opacity: 0.12 }));
    doc.setLineWidth(0.4);
    doc.roundedRect(bx, by, bW, bH, 4, 4, 'S');
    doc.setGState(doc.GState({ opacity: 1 }));
    doc.setFont('helvetica','bold');
    doc.setFontSize(20);
    doc.setTextColor(...C.white);
    doc.text(s.val, bx+bW/2, by+15, { align:'center' });
    doc.setFont('helvetica','normal');
    doc.setFontSize(6.5);
    doc.setGState(doc.GState({ opacity: 0.4 }));
    doc.text(s.lbl, bx+bW/2, by+22, { align:'center' });
    doc.setGState(doc.GState({ opacity: 1 }));
  });

  // Contact
  doc.setFont('helvetica','normal');
  doc.setFontSize(8);
  doc.setGState(doc.GState({ opacity: 0.28 }));
  doc.setTextColor(...C.white);
  doc.text('lebtex.ma  ·  +212 760 998 347', PW/2, 218, { align:'center' });
  doc.setFontSize(6.5);
  doc.setGState(doc.GState({ opacity: 0.16 }));
  doc.text(`Généré le ${dateStr}`, PW/2, PH - 10, { align:'center' });
  doc.setGState(doc.GState({ opacity: 1 }));

  onProgress?.(10, 'Couverture créée…');

  // ══════════════════════════════════════════════════════
  // PAGE 2 — SOMMAIRE
  // ══════════════════════════════════════════════════════
  doc.addPage();
  band(doc, C.red);

  doc.setFont('helvetica','bold');
  doc.setFontSize(26);
  doc.setTextColor(...C.black);
  doc.text('Sommaire', ML, 26);
  doc.setFont('helvetica','normal');
  doc.setFontSize(8);
  doc.setTextColor(...C.gray);
  doc.text(`${sections.length} catégories · ${totalProducts} produits`, ML, 33);
  doc.setDrawColor(...C.red);
  doc.setLineWidth(0.7);
  doc.line(ML, 37, ML+28, 37);

  let sy = 48;
  sections.forEach((sec, i) => {
    if (sy > PH - 28) {
      drawFooter(doc, dateStr);
      doc.addPage(); band(doc, C.red); sy = 16;
    }
    const accent = sec.category.color ? hexRgb(sec.category.color) : C.red;

    // Number badge
    doc.setFillColor(...accent);
    doc.roundedRect(ML, sy, 11, 11, 2, 2, 'F');
    doc.setFont('helvetica','bold');
    doc.setFontSize(7.5);
    doc.setTextColor(...C.white);
    doc.text(String(i+1).padStart(2,'0'), ML+5.5, sy+7, { align:'center' });

    // Name
    doc.setFont('helvetica','bold');
    doc.setFontSize(11);
    doc.setTextColor(...C.black);
    doc.text(sec.category.name, ML+15, sy+5);

    if (sec.category.description) {
      doc.setFont('helvetica','normal');
      doc.setFontSize(7);
      doc.setTextColor(...C.gray);
      doc.text(clip(sec.category.description, 80), ML+15, sy+9.5);
    }

    // Products count
    doc.setFont('helvetica','bold');
    doc.setFontSize(11);
    doc.setTextColor(...accent);
    doc.text(String(sec.products.length), PW-MR, sy+5, { align:'right' });
    doc.setFont('helvetica','normal');
    doc.setFontSize(6.5);
    doc.setTextColor(...C.gray);
    doc.text(`produit${sec.products.length>1?'s':''}`, PW-MR, sy+9.5, { align:'right' });

    doc.setDrawColor(...C.silk);
    doc.setLineWidth(0.2);
    doc.line(ML+15, sy+13, PW-MR, sy+13);
    sy += 19;
  });
  drawFooter(doc, dateStr);

  onProgress?.(18, 'Sommaire créé…');

  // ══════════════════════════════════════════════════════
  // SECTIONS
  // ══════════════════════════════════════════════════════
  for (let si = 0; si < sections.length; si++) {
    const sec    = sections[si];
    const cat    = sec.category;
    const accent = cat.color ? hexRgb(cat.color) : C.red;
    const prods  = sec.products;

    const pBase = 18 + (si / sections.length) * 72;
    onProgress?.(Math.round(pBase), `Chargement images: ${cat.name}…`);

    // ── Load all product images ───────────────────────────────────────────────
    const imgCache: Record<string, string|null> = {};
    await Promise.all(
      prods.map(async p => {
        const url = (p.images||[])[0];
        if (url && !(url in imgCache)) {
          imgCache[url] = await imgToBase64(url);
        }
      })
    );

    // ══════════════════════════════════════════════════════
    // ── Category header page ──────────────────────────────
    // ══════════════════════════════════════════════════════
    doc.addPage();
    band(doc, accent);

    // Header background
    doc.setFillColor(...C.cream);
    doc.rect(0, 3, PW, 40, 'F');

    // Section number badge
    doc.setFillColor(...accent);
    doc.roundedRect(ML, 10, 22, 22, 3, 3, 'F');
    doc.setFont('helvetica','bold');
    doc.setFontSize(15);
    doc.setTextColor(...C.white);
    doc.text(String(si+1).padStart(2,'0'), ML+11, 23, { align:'center' });

    // Category name & description
    doc.setFont('helvetica','bold');
    doc.setFontSize(20);
    doc.setTextColor(...C.black);
    doc.text(cat.name, ML+27, 21);
    if (cat.description) {
      doc.setFont('helvetica','normal');
      doc.setFontSize(8);
      doc.setTextColor(...C.gray);
      const dl = doc.splitTextToSize(cat.description, CW-60);
      doc.text(dl, ML+27, 29);
    }

    // Products count (right)
    doc.setFont('helvetica','bold');
    doc.setFontSize(16);
    doc.setTextColor(...accent);
    doc.text(String(prods.length), PW-MR-3, 20, { align:'right' });
    doc.setFont('helvetica','normal');
    doc.setFontSize(7);
    doc.setTextColor(...C.gray);
    doc.text(`produit${prods.length>1?'s':''}`, PW-MR-3, 26, { align:'right' });

    onProgress?.(Math.round(pBase + 1), `Section ${si+1}/${sections.length}: ${cat.name}…`);

    // ══════════════════════════════════════════════════════
    // ── Products — 2 columns with photo ──────────────────
    // ══════════════════════════════════════════════════════
    const CARD_H  = 62;
    const CARD_GAP = 5;
    const IMG_W   = 42;
    const IMG_H   = 42;
    const COLS    = 2;
    const COL_W   = (CW - CARD_GAP) / COLS;

    let py = 50;

    for (let pi = 0; pi < prods.length; pi++) {
      const p   = prods[pi];
      const col = pi % COLS;

      // New row: advance Y
      if (col === 0 && pi > 0) py += CARD_H + CARD_GAP;

      // Page break
      if (py + CARD_H > PH - 18) {
        drawFooter(doc, dateStr);
        doc.addPage();
        band(doc, accent);
        py = 10;
      }

      const cx = ML + col * (COL_W + CARD_GAP);
      const cy = py;

      // Card
      doc.setFillColor(...C.cream);
      doc.setDrawColor(...C.silk);
      doc.setLineWidth(0.2);
      doc.roundedRect(cx, cy, COL_W, CARD_H, 2.5, 2.5, 'FD');

      // Accent top strip
      doc.setFillColor(...accent);
      doc.roundedRect(cx, cy, COL_W, 3, 2.5, 2.5, 'F');
      doc.rect(cx, cy+1.5, COL_W, 1.5, 'F');

      // ── Photo ──────────────────────────────────────────────────────────────
      const imgUrl  = (p.images||[])[0];
      const imgData = imgUrl ? imgCache[imgUrl] : null;
      const IX = cx + 3;
      const IY = cy + 6;

      doc.setFillColor(228, 224, 220);
      doc.roundedRect(IX, IY, IMG_W, IMG_H, 2, 2, 'F');
      if (imgData) {
        drawImg(doc, imgData, IX, IY, IMG_W, IMG_H);
      } else {
        // Photo placeholder icon
        doc.setFont('helvetica','normal');
        doc.setFontSize(8);
        doc.setTextColor(...C.lgray);
        doc.text('Photo', IX + IMG_W/2, IY + IMG_H/2 + 3, { align:'center' });
      }

      // ── Right: product info ─────────────────────────────────────────────────
      const RX = cx + IMG_W + 7;
      const RW = COL_W - IMG_W - 10;
      let ry = cy + 7;

      // Ref
      if (p.sku) {
        doc.setFont('helvetica','normal');
        doc.setFontSize(5.5);
        doc.setTextColor(...C.gray);
        doc.text(`Réf: ${p.sku}`, RX, ry);
        ry += 4;
      }

      // Name
      doc.setFont('helvetica','bold');
      doc.setFontSize(8.5);
      doc.setTextColor(...C.black);
      const nameLines = doc.splitTextToSize(clip(p.name, 55), RW);
      doc.text(nameLines.slice(0,2), RX, ry);
      ry += Math.min(nameLines.length, 2) * 4 + 1;

      // Short desc
      if (p.shortDescription && ry < cy + CARD_H - 14) {
        doc.setFont('helvetica','normal');
        doc.setFontSize(6.5);
        doc.setTextColor(...C.dark);
        const sdLines = doc.splitTextToSize(clip(p.shortDescription, 100), RW);
        doc.text(sdLines.slice(0,2), RX, ry);
        ry += Math.min(sdLines.length, 2) * 3.5 + 1.5;
      }

      // 4 key specs
      const keySpecs: [string,string][] = [
        ['Matériau',  p.material||''],
        ['Type',      p.typeProduit||''],
        ['Couleur',   p.couleur||''],
        ['Largeur',   p.width||''],
        ['Longueur',  p.longueur||''],
        ['Poids',     p.weight ? `${p.weight}g` : ''],
        ['Emballage', p.packaging||''],
      ].filter(([,v]) => v) as [string,string][];

      keySpecs.slice(0,4).forEach(([lbl, val]) => {
        if (ry > cy + CARD_H - 8) return;
        doc.setFont('helvetica','bold');
        doc.setFontSize(5.5);
        doc.setTextColor(...C.gray);
        doc.text(`${lbl}:`, RX, ry);
        doc.setFont('helvetica','normal');
        doc.setTextColor(...C.black);
        doc.text(clip(val, 28), RX + doc.getTextWidth(`${lbl}: `), ry);
        ry += 4;
      });

      // Coloris & tailles
      if (p.variants?.length > 0 && ry < cy + CARD_H - 7) {
        const colors = [...new Set(p.variants.filter(v=>v.color).map(v=>v.color!))];
        const sizes  = [...new Set(p.variants.filter(v=>v.size).map(v=>v.size!))];
        doc.setFont('helvetica','bold');
        doc.setFontSize(5.5);
        doc.setTextColor(...accent);
        if (colors.length && ry < cy + CARD_H - 7) {
          doc.text(`Coloris: ${clip(colors.join(', '), 30)}`, RX, ry);
          ry += 4;
        }
        if (sizes.length && ry < cy + CARD_H - 7) {
          doc.text(`Tailles: ${clip(sizes.join(', '), 30)}`, RX, ry);
        }
      }
    }

    // Close last row
    if (prods.length > 0) drawFooter(doc, dateStr);

    // ══════════════════════════════════════════════════════
    // ── Fiches techniques détaillées ─────────────────────
    // ══════════════════════════════════════════════════════
    const richProds = prods.filter(p =>
      p.description || p.material || p.typeProduit || p.specification ||
      p.applications || p.avantages || p.conseilsEntretien || p.informationCommerciale
    );

    if (richProds.length === 0) continue;

    doc.addPage();
    band(doc, accent);

    // Section title bar
    doc.setFillColor(...C.cream);
    doc.rect(0, 3, PW, 15, 'F');
    doc.setFont('helvetica','bold');
    doc.setFontSize(13);
    doc.setTextColor(...C.black);
    doc.text(`${cat.name} — Fiches Techniques`, ML, 13);
    doc.setDrawColor(...accent);
    doc.setLineWidth(0.6);
    doc.line(ML, 16.5, ML+55, 16.5);

    let dy = 24;

    for (const p of richProds) {
      // Page break check
      if (dy + 52 > PH - 18) {
        drawFooter(doc, dateStr);
        doc.addPage();
        band(doc, accent);
        dy = 10;
      }

      const imgUrl  = (p.images||[])[0];
      const imgData = imgUrl ? imgCache[imgUrl] : null;

      // ── Name header ─────────────────────────────────────────────────────────
      doc.setFillColor(...accent);
      doc.setGState(doc.GState({ opacity: 0.14 }));
      doc.roundedRect(ML, dy, CW, 9.5, 2, 2, 'F');
      doc.setGState(doc.GState({ opacity: 1 }));
      // Left accent strip
      doc.setFillColor(...accent);
      doc.rect(ML, dy+1.5, 2.5, 6.5, 'F');
      doc.setFont('helvetica','bold');
      doc.setFontSize(9);
      doc.setTextColor(...C.black);
      doc.text(clip(p.name, 85), ML+5, dy+6.8);
      if (p.sku) {
        doc.setFont('helvetica','normal');
        doc.setFontSize(6.5);
        doc.setTextColor(...C.gray);
        doc.text(`Réf: ${p.sku}`, ML+CW-2, dy+6.8, { align:'right' });
      }
      dy += 13;

      // ── Body: photo left + specs right ──────────────────────────────────────
      const ISW = 34, ISH = 34;
      const hasImg = !!imgData;

      // Photo
      if (hasImg) {
        doc.setFillColor(228, 224, 220);
        doc.roundedRect(ML, dy, ISW, ISH, 2, 2, 'F');
        drawImg(doc, imgData!, ML, dy, ISW, ISH);
      }

      const SX = ML + (hasImg ? ISW + 5 : 0);
      const SW = CW - (hasImg ? ISW + 5 : 0);
      let sy2 = dy;

      // Description
      if (p.description) {
        doc.setFont('helvetica','italic');
        doc.setFontSize(7);
        doc.setTextColor(...C.dark);
        const dl = doc.splitTextToSize(clip(p.description, 320), SW);
        doc.text(dl.slice(0,3), SX, sy2 + 4);
        sy2 += Math.min(dl.length, 3) * 3.8 + 5;
      }

      // Technical specs — 2 columns
      const techPairs: [string,string][] = [
        ['Matériau',          p.material||''],
        ['Type de produit',   p.typeProduit||''],
        ['Spécification',     p.specification||''],
        ['Couleur',           p.couleur||''],
        ['Largeur',           p.width||''],
        ['Largeur maille',    p.largeurMaille||''],
        ['Longueur',          p.longueur||''],
        ['Poids',             p.weight ? `${p.weight}g` : ''],
        ['Emballage',         p.packaging||''],
        ['Matière/Mailles',   p.matiereMailles||''],
        ['Composition ruban', p.compositionRuban||''],
        ['Type',              (p as any).type||''],
        ['Design',            (p as any).design||''],
        ['Résistance',        (p as any).resistance||''],
        ['Sécurité',          (p as any).securite||''],
        ['Compatible avec',   (p as any).compatibleAvec||''],
        ['Pays de fabrication',(p as any).paysFabrication||''],
      ].filter(([,v]) => v) as [string,string][];

      if (techPairs.length > 0) {
        if (sy2 < dy + (hasImg ? ISH : 0) + 2) sy2 = dy + (hasImg ? 0 : 0);

        doc.setFont('helvetica','bold');
        doc.setFontSize(6.5);
        doc.setTextColor(...accent);
        doc.text('CARACTÉRISTIQUES TECHNIQUES', SX, sy2 + 3);
        sy2 += 6;

        const halfW = (SW - 4) / 2;
        let lastRow = sy2;

        for (let ti = 0; ti < techPairs.length; ti++) {
          const col = ti % 2;
          if (col === 0 && ti > 0) { sy2 += 9; lastRow = sy2; }
          if (sy2 > dy + 52) break;
          const sx2 = SX + col*(halfW + 4);
          specRow(doc, techPairs[ti][0], techPairs[ti][1], sx2, sy2, halfW);
        }
        sy2 = (techPairs.length % 2 !== 0) ? lastRow + 9 : sy2 + 9;
      }

      // Advance dy beyond photo & content
      dy = Math.max(dy + ISH + 4, sy2 + 4);

      // ── Additional info ──────────────────────────────────────────────────────
      const infoPairs: [string,string][] = [
        ['Applications',         p.applications||''],
        ['Avantages',            p.avantages||''],
        ["Conseils d'entretien", p.conseilsEntretien||''],
        ['Information commerciale', p.informationCommerciale||''],
      ].filter(([,v]) => v) as [string,string][];

      if (infoPairs.length > 0) {
        if (dy + 10 > PH - 18) {
          drawFooter(doc, dateStr);
          doc.addPage(); band(doc, accent); dy = 10;
        }
        doc.setFont('helvetica','bold');
        doc.setFontSize(6.5);
        doc.setTextColor(...accent);
        doc.text('INFORMATIONS COMPLÉMENTAIRES', ML, dy + 3);
        dy += 6;

        for (const [lbl, val] of infoPairs) {
          if (dy > PH - 18) {
            drawFooter(doc, dateStr);
            doc.addPage(); band(doc, accent); dy = 10;
          }
          doc.setFont('helvetica','bold');
          doc.setFontSize(6.2);
          doc.setTextColor(...C.dark);
          doc.text(lbl, ML, dy + 3);
          doc.setFont('helvetica','normal');
          doc.setFontSize(6.5);
          doc.setTextColor(...C.gray);
          const il = doc.splitTextToSize(clip(val, 240), CW-4);
          doc.text(il.slice(0,4), ML, dy+7);
          dy += Math.min(il.length, 4)*3.5 + 6;
        }
      }

      // Divider
      doc.setDrawColor(...C.silk);
      doc.setLineWidth(0.2);
      doc.line(ML, dy, ML+CW, dy);
      dy += 7;
    }

    drawFooter(doc, dateStr);
  }

  onProgress?.(93, 'Page de contact…');

  // ══════════════════════════════════════════════════════
  // LAST PAGE — CONTACT
  // ══════════════════════════════════════════════════════
  doc.addPage();
  doc.setFillColor(12, 12, 12);
  doc.rect(0, 0, PW, PH, 'F');

  doc.setFillColor(...C.red);
  doc.setGState(doc.GState({ opacity: 0.06 }));
  doc.ellipse(PW/2, PH/2 - 20, 80, 70, 'F');
  doc.setGState(doc.GState({ opacity: 1 }));

  // Logo on contact page too
  try {
    doc.addImage(LOGO_B64, 'PNG', PW/2 - 35, 72, 70, 32, undefined, 'FAST');
  } catch { /* skip */ }

  doc.setFont('helvetica','bold');
  doc.setFontSize(28);
  doc.setTextColor(...C.white);
  doc.text("Besoin d'informations ?", PW/2, 124, { align:'center' });

  doc.setFont('helvetica','normal');
  doc.setFontSize(8.5);
  doc.setGState(doc.GState({ opacity: 0.38 }));
  doc.text('Contactez-nous pour les tarifs, quantités et conditions.', PW/2, 135, { align:'center' });
  doc.setGState(doc.GState({ opacity: 1 }));

  // WhatsApp CTA
  doc.setFillColor(37, 211, 102);
  doc.roundedRect(PW/2-50, 148, 100, 14, 7, 7, 'F');
  doc.setFont('helvetica','bold');
  doc.setFontSize(9.5);
  doc.setTextColor(...C.white);
  doc.text('Demander les prix — WhatsApp', PW/2, 157.5, { align:'center' });

  // Phone
  doc.setGState(doc.GState({ opacity: 0.15 }));
  doc.setDrawColor(...C.white);
  doc.setLineWidth(0.4);
  doc.roundedRect(PW/2-36, 172, 72, 11, 5, 5, 'S');
  doc.setGState(doc.GState({ opacity: 0.6 }));
  doc.setFont('helvetica','bold');
  doc.setFontSize(10);
  doc.setTextColor(...C.white);
  doc.text('+212 760 998 347', PW/2, 179, { align:'center' });
  doc.setGState(doc.GState({ opacity: 0.28 }));
  doc.setFont('helvetica','normal');
  doc.setFontSize(8.5);
  doc.text('lebtex.ma', PW/2, 193, { align:'center' });
  doc.setGState(doc.GState({ opacity: 0.07 }));
  doc.setFont('helvetica','bold');
  doc.setFontSize(38);
  doc.text('LEBTEX', PW/2, PH-32, { align:'center' });
  doc.setGState(doc.GState({ opacity: 0.16 }));
  doc.setFont('helvetica','normal');
  doc.setFontSize(6.5);
  doc.text(`© ${year} LEBTEX — Tous droits réservés`, PW/2, PH-20, { align:'center' });
  doc.setGState(doc.GState({ opacity: 1 }));

  onProgress?.(100, 'Téléchargement…');

  const fname = `LEBTEX_Catalogue_${year}-${String(now.getMonth()+1).padStart(2,'0')}-${String(now.getDate()).padStart(2,'0')}.pdf`;
  doc.save(fname);
  return fname;
}
