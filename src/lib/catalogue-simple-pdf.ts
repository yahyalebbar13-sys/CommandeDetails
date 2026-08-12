'use client';

import jsPDF from 'jspdf';
import type { ShopProduct, ShopCategory } from './shop-types';
import { LOGO_B64 } from './logo-b64';

// ─── Colors ───────────────────────────────────────────────────────────────────
const C = {
  red:   [200, 16, 46]   as [number, number, number],
  black: [26, 26, 26]    as [number, number, number],
  dark:  [55, 55, 55]    as [number, number, number],
  gray:  [120, 120, 120] as [number, number, number],
  lgray: [200, 196, 192] as [number, number, number],
  silk:  [238, 234, 230] as [number, number, number],
  cream: [253, 251, 248] as [number, number, number],
  white: [255, 255, 255] as [number, number, number],
  gold:  [212, 168, 67]  as [number, number, number],
};

type ProgressCb = (pct: number, msg: string) => void;

// ─── Load image ───────────────────────────────────────────────────────────────
async function loadImg(url: string): Promise<string | null> {
  if (!url) return null;
  try {
    let fetchUrl = url.startsWith('http')
      ? `/api/img-proxy?url=${encodeURIComponent(url)}`
      : url;
    const resp = await fetch(fetchUrl);
    if (!resp.ok) return null;
    const blob = await resp.blob();
    if (blob.size < 100) return null;
    return new Promise<string | null>((resolve) => {
      const r = new FileReader();
      r.onloadend = () => resolve(r.result as string || null);
      r.onerror = () => resolve(null);
      r.readAsDataURL(blob);
    });
  } catch { return null; }
}

function hexRgb(hex: string): [number, number, number] {
  const h = hex.replace('#', '');
  return [parseInt(h.slice(0,2),16), parseInt(h.slice(2,4),16), parseInt(h.slice(4,6),16)];
}
function clip(t: string, n: number) { return t && t.length > n ? t.slice(0,n-1)+'…' : (t||''); }

function safeImg(doc: jsPDF, data: string, x: number, y: number, w: number, h: number) {
  try {
    const fmt = data.startsWith('data:image/png') ? 'PNG' : 'JPEG';
    doc.addImage(data, fmt, x, y, w, h, undefined, 'FAST');
  } catch { /* skip */ }
}

function band(doc: jsPDF, color: [number,number,number], h = 3) {
  doc.setFillColor(...color);
  doc.rect(0, 0, 210, h, 'F');
}

function drawFooter(doc: jsPDF, dateStr: string, pg: number) {
  const PW = 210, PH = 297, ML = 14, MR = 14;
  doc.setDrawColor(...C.lgray); doc.setLineWidth(0.2);
  doc.line(ML, PH-13, PW-MR, PH-13);
  doc.setFont('helvetica','normal'); doc.setFontSize(6.5); doc.setTextColor(...C.gray);
  doc.text('LEBTEX — Catalogue Simplifié', ML, PH-9);
  doc.text(dateStr, 105, PH-9, { align:'center' });
  doc.setFont('helvetica','bold'); doc.setTextColor(...C.gray);
  doc.text(String(pg), PW-MR, PH-9, { align:'right' });
}

// ═══════════════════════════════════════════════════════════════════════════════
export async function generateSimpleCataloguePDF(
  sections: { category: ShopCategory; products: ShopProduct[]; subCategories: ShopCategory[] }[],
  totalProducts: number,
  onProgress?: ProgressCb,
) {
  const doc = new jsPDF({ orientation:'portrait', unit:'mm', format:'a4' });
  const PW = 210, PH = 297, ML = 14, MR = 14, CW = PW - ML - MR;
  const now = new Date();
  const year = now.getFullYear();
  const dateStr = now.toLocaleDateString('fr-FR', { day:'2-digit', month:'long', year:'numeric' });

  onProgress?.(2, 'Préparation…');

  // ─── COVER PAGE ───────────────────────────────────────────────────────────
  // Background
  doc.setFillColor(...C.black);
  doc.rect(0, 0, PW, PH, 'F');

  // Red top band
  doc.setFillColor(...C.red);
  doc.rect(0, 0, PW, 5, 'F');

  // Logo
  if (LOGO_B64) {
    try { doc.addImage(LOGO_B64, 'PNG', PW/2 - 15, 35, 30, 30, undefined, 'FAST'); } catch {}
  }

  // Title
  doc.setFont('helvetica','bold'); doc.setFontSize(36); doc.setTextColor(...C.white);
  doc.text('LEB', PW/2, 82, { align:'center' });
  doc.setTextColor(...C.red);
  doc.text('TEX', PW/2 + 18, 82, { align:'left' });

  doc.setFont('helvetica','normal'); doc.setFontSize(11); doc.setTextColor(255,255,255);
  doc.setGState(doc.GState({ opacity: 0.4 }));
  doc.text('Mercerie & Accessoires Textiles', PW/2, 92, { align:'center' });
  doc.setGState(doc.GState({ opacity: 1 }));

  // Badge
  doc.setFillColor(...C.red);
  doc.roundedRect(PW/2 - 28, 104, 56, 10, 3, 3, 'F');
  doc.setFont('helvetica','bold'); doc.setFontSize(8); doc.setTextColor(...C.white);
  doc.text(`CATALOGUE SIMPLIFIÉ ${year}`, PW/2, 110.5, { align:'center' });

  // Divider
  doc.setDrawColor(...C.red); doc.setLineWidth(0.5);
  doc.line(ML + 20, 122, PW - MR - 20, 122);

  // Stats
  const stats = [
    { val: String(sections.length), lbl: 'Catégories' },
    { val: String(totalProducts), lbl: 'Produits' },
    { val: '+15', lbl: 'Ans d\'exp.' },
  ];
  const statW = 40;
  const statStartX = PW/2 - (stats.length * statW)/2 + statW/2;
  stats.forEach((s, i) => {
    const sx = statStartX + i * statW;
    doc.setFont('helvetica','bold'); doc.setFontSize(18); doc.setTextColor(...C.red);
    doc.text(s.val, sx, 138, { align:'center' });
    doc.setFont('helvetica','normal'); doc.setFontSize(7);
    doc.setTextColor(255,255,255);
    doc.setGState(doc.GState({ opacity: 0.5 }));
    doc.text(s.lbl, sx, 144, { align:'center' });
    doc.setGState(doc.GState({ opacity: 1 }));
  });

  // Bottom info
  doc.setFont('helvetica','normal'); doc.setFontSize(7);
  doc.setTextColor(255,255,255); doc.setGState(doc.GState({ opacity: 0.3 }));
  doc.text('contact@lebtex.ma  ·  +212 760 998 347  ·  lebtex.ma', PW/2, PH-18, { align:'center' });
  doc.setGState(doc.GState({ opacity: 1 }));

  onProgress?.(5, 'Chargement images…');

  // ─── SECTIONS ─────────────────────────────────────────────────────────────
  // Layout: 6 products per page, each row = 2 products side by side
  // Each product card: photo (24×24mm) on left + specs on right
  const COLS = 2;
  const CARD_H = 44;
  const CARD_GAP = 5;
  const COL_W = (CW - CARD_GAP) / COLS;
  const IMG_W = 24, IMG_H = 24;
  const PRODUCTS_PER_PAGE = 6;
  const PAGE_TOP = 18; // after category header

  let pgNum = 1;

  for (let si = 0; si < sections.length; si++) {
    const sec = sections[si];
    const cat = sec.category;
    const accent = cat.color ? hexRgb(cat.color) : C.red;
    const prods = sec.products;
    if (prods.length === 0) continue;

    onProgress?.(5 + Math.round((si / sections.length) * 85), `Chargement: ${cat.name}…`);

    // Load product images
    const imgCache: Record<string, string|null> = {};
    await Promise.all(
      prods.map(async p => {
        const url = (p.images||[])[0];
        if (url && !(url in imgCache)) imgCache[url] = await loadImg(url);
      })
    );

    // Paginate products, 6 per page
    let pageProds: ShopProduct[][] = [];
    for (let i = 0; i < prods.length; i += PRODUCTS_PER_PAGE) {
      pageProds.push(prods.slice(i, i + PRODUCTS_PER_PAGE));
    }

    for (let pp = 0; pp < pageProds.length; pp++) {
      doc.addPage();
      pgNum++;
      band(doc, accent);

      // Category header
      doc.setFillColor(...C.cream);
      doc.rect(0, 3, PW, 13, 'F');

      // Cat name left
      doc.setFont('helvetica','bold'); doc.setFontSize(11); doc.setTextColor(...C.black);
      doc.text(cat.name, ML, 12);

      // Page indicator right
      doc.setFont('helvetica','normal'); doc.setFontSize(7); doc.setTextColor(...C.gray);
      doc.text(`${pp + 1} / ${pageProds.length}`, PW-MR, 12, { align:'right' });

      // Accent underline
      doc.setDrawColor(...accent); doc.setLineWidth(0.5);
      doc.line(ML, 15, ML + doc.getTextWidth(cat.name) + 2, 15);

      // Draw product cards
      let y = PAGE_TOP + 2;
      for (let pi = 0; pi < pageProds[pp].length; pi++) {
        const p = pageProds[pp][pi];
        const col = pi % COLS;
        if (col === 0 && pi > 0) y += CARD_H + CARD_GAP;
        if (y + CARD_H > PH - 16) break; // safety

        const cx = ML + col * (COL_W + CARD_GAP);
        const cy = y;

        // Card background
        doc.setFillColor(...C.white); doc.setDrawColor(...C.silk); doc.setLineWidth(0.2);
        doc.roundedRect(cx, cy, COL_W, CARD_H, 2, 2, 'FD');

        // Accent left strip
        doc.setFillColor(...accent);
        doc.roundedRect(cx, cy, 2.5, CARD_H, 2, 2, 'F');
        doc.rect(cx+1.2, cy, 1.3, CARD_H, 'F');

        // Image
        const imgUrl = (p.images||[])[0];
        const imgData = imgUrl ? imgCache[imgUrl] : null;
        const IX = cx + 5, IY = cy + (CARD_H - IMG_H) / 2;
        doc.setFillColor(242, 238, 234);
        doc.roundedRect(IX, IY, IMG_W, IMG_H, 1.5, 1.5, 'F');
        if (imgData) {
          safeImg(doc, imgData, IX, IY, IMG_W, IMG_H);
        } else {
          doc.setFont('helvetica','bold'); doc.setFontSize(12); doc.setTextColor(...C.lgray);
          doc.text((p.catalogueName || p.name).charAt(0).toUpperCase(), IX+IMG_W/2, IY+IMG_H/2+4, { align:'center' });
        }

        // Right side: name + specs
        const RX = cx + 5 + IMG_W + 4;
        const RW = COL_W - 5 - IMG_W - 7;
        let ry = cy + 5;

        // SKU badge
        if (p.sku) {
          doc.setFillColor(...C.silk);
          const skuW = doc.getTextWidth(`Réf: ${p.sku}`) + 4;
          doc.roundedRect(RX, ry - 1, skuW, 5, 1, 1, 'F');
          doc.setFont('helvetica','bold'); doc.setFontSize(5); doc.setTextColor(...C.gray);
          doc.text(`Réf: ${p.sku}`, RX+2, ry+2.8);
          ry += 6;
        }

        // Name
        doc.setFont('helvetica','bold'); doc.setFontSize(8); doc.setTextColor(...C.black);
        const nameLines = doc.splitTextToSize(clip(p.catalogueName || p.name, 48), RW);
        doc.text(nameLines.slice(0,2), RX, ry);
        ry += Math.min(nameLines.length, 2) * 3.8 + 1;

        // Tech specs
        const specs: [string, string][] = [
          ['Matériau',   p.material||''],
          ['Type',       p.typeProduit||''],
          ['Couleur',    p.couleur||''],
          ['Largeur',    p.width||''],
          ['Longueur',   (p as any).longueur||''],
          ['Poids',      p.weight ? `${p.weight}g` : ''],
          ['Emballage',  p.packaging||''],
        ].filter(([,v]) => v) as [string, string][];

        for (const [lbl, val] of specs.slice(0, 5)) {
          if (ry > cy + CARD_H - 5) break;
          doc.setFont('helvetica','bold'); doc.setFontSize(5); doc.setTextColor(...C.gray);
          doc.text(`${lbl}:`, RX, ry);
          doc.setFont('helvetica','normal'); doc.setFontSize(5.5); doc.setTextColor(...C.dark);
          doc.text(clip(val, 28), RX + doc.getTextWidth(`${lbl}: `), ry);
          ry += 4;
        }

        // Stock indicator
        if (ry < cy + CARD_H - 3) {
          doc.setFillColor(...(p.inStock ? [16,185,129] as [number,number,number] : [200,16,46]));
          doc.circle(RX+1.5, ry+1.5, 1.5, 'F');
          doc.setFont('helvetica','normal'); doc.setFontSize(5.5);
          doc.setTextColor(...(p.inStock ? [16,185,129] as [number,number,number] : [200,16,46]));
          doc.text(p.inStock ? 'Disponible' : 'Indisponible', RX+4.5, ry+2.2);
        }
      }

      drawFooter(doc, dateStr, pgNum - 1);
    }
  }

  // ─── LAST PAGE — CONTACT ──────────────────────────────────────────────────
  doc.addPage();
  pgNum++;
  doc.setFillColor(...C.black);
  doc.rect(0, 0, PW, PH, 'F');
  band(doc, C.red);

  doc.setFont('helvetica','bold'); doc.setFontSize(20); doc.setTextColor(...C.white);
  doc.text('Contactez-nous', PW/2, 60, { align:'center' });
  doc.setFont('helvetica','normal'); doc.setFontSize(9);
  doc.setTextColor(255,255,255); doc.setGState(doc.GState({ opacity: 0.5 }));
  doc.text('Notre équipe répond rapidement à toutes vos demandes', PW/2, 70, { align:'center' });
  doc.setGState(doc.GState({ opacity: 1 }));

  const contacts = [
    { icon: '📞', label: '+212 760 998 347' },
    { icon: '📧', label: 'contact@lebtex.ma' },
    { icon: '📍', label: 'Boulevard Haïfa, Casablanca' },
    { icon: '📍', label: 'Derb Omar, Casablanca' },
  ];
  let cy2 = 88;
  for (const c of contacts) {
    doc.setFillColor(255,255,255); doc.setGState(doc.GState({ opacity: 0.06 }));
    doc.roundedRect(ML + 20, cy2 - 3, CW - 40, 11, 2, 2, 'F');
    doc.setGState(doc.GState({ opacity: 1 }));
    doc.setFont('helvetica','normal'); doc.setFontSize(9); doc.setTextColor(...C.white);
    doc.text(`${c.icon}  ${c.label}`, PW/2, cy2 + 4.5, { align:'center' });
    cy2 += 15;
  }

  doc.setFont('helvetica','bold'); doc.setFontSize(8); doc.setTextColor(...C.red);
  doc.text('lebtex.ma', PW/2, cy2 + 15, { align:'center' });

  drawFooter(doc, dateStr, pgNum - 1);

  onProgress?.(100, 'Téléchargement…');

  const fname = `LEBTEX_Catalogue_Simple_${year}.pdf`;
  doc.save(fname);
  return fname;
}
