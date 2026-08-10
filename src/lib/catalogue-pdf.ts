'use client';

import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
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
  ink:   [12, 12, 12]    as [number, number, number],
};

type ProgressCb = (pct: number, msg: string) => void;

// ─── Load image via Next.js proxy (same-origin → no CORS issues) ──────────────
async function loadImg(originalUrl: string): Promise<string | null> {
  if (!originalUrl) return null;
  // Use Next.js image endpoint as proxy — same origin, no CORS
  const proxyUrl = `/_next/image?url=${encodeURIComponent(originalUrl)}&w=400&q=80`;
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      try {
        const canvas = document.createElement('canvas');
        canvas.width  = img.naturalWidth  || 400;
        canvas.height = img.naturalHeight || 400;
        const ctx = canvas.getContext('2d');
        if (!ctx) { resolve(null); return; }
        ctx.drawImage(img, 0, 0);
        resolve(canvas.toDataURL('image/jpeg', 0.82));
      } catch { resolve(null); }
    };
    img.onerror = () => resolve(null);
    img.src = proxyUrl;
    setTimeout(() => resolve(null), 10000);
  });
}

// ─── Helpers ─────────────────────────────────────────────────────────────────
function hexRgb(hex: string): [number, number, number] {
  const h = hex.replace('#', '');
  return [parseInt(h.slice(0,2),16), parseInt(h.slice(2,4),16), parseInt(h.slice(4,6),16)];
}
function clip(t: string, n: number) { return t && t.length > n ? t.slice(0, n-1)+'…' : (t||''); }

let _pg = 0;

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
  doc.text(dateStr, 105, PH-9, { align:'center' });
  doc.setFont('helvetica','bold');
  doc.setTextColor(...C.red);
  doc.text(String(_pg), PW-MR, PH-9, { align:'right' });
  doc.setFont('helvetica','italic');
  doc.setFontSize(5);
  doc.setTextColor(...C.lgray);
  doc.text('Document confidentiel — reproduction interdite sans autorisation', 105, PH-5.5, { align:'center' });
}

function band(doc: jsPDF, color: [number,number,number], h = 3) {
  doc.setFillColor(...color);
  doc.rect(0, 0, 210, h, 'F');
}

function safeImg(doc: jsPDF, data: string, x: number, y: number, w: number, h: number) {
  try {
    const fmt = data.startsWith('data:image/png') ? 'PNG' : 'JPEG';
    doc.addImage(data, fmt, x, y, w, h, undefined, 'FAST');
  } catch { /* skip */ }
}

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

  // ═══════════════════════════════════════════════════
  // PAGE 1 — COUVERTURE (split design)
  // ═══════════════════════════════════════════════════

  // Top half dark
  doc.setFillColor(...C.ink);
  doc.rect(0, 0, PW, 148, 'F');

  // Bottom half cream/white
  doc.setFillColor(...C.cream);
  doc.rect(0, 148, PW, PH - 148, 'F');

  // Dark red diagonal accent top-right
  doc.setFillColor(...C.red);
  doc.setGState(doc.GState({ opacity: 0.18 }));
  doc.triangle(PW, 0, PW, 90, PW - 70, 0, 'F');
  doc.setGState(doc.GState({ opacity: 1 }));

  // Gold dot pattern top-left
  doc.setFillColor(...C.gold);
  doc.setGState(doc.GState({ opacity: 0.06 }));
  for (let r = 0; r < 5; r++) for (let c = 0; c < 5; c++) {
    doc.circle(12 + c*14, 12 + r*14, 1.5, 'F');
  }
  doc.setGState(doc.GState({ opacity: 1 }));

  // Year badge top-left
  doc.setFont('helvetica','bold');
  doc.setFontSize(7);
  doc.setTextColor(...C.gold);
  doc.text(`${year}`, 16, 16);

  // ── White logo card centered ──────────────────────────────────────────────
  const logoCardW = 110, logoCardH = 55;
  const logoCardX = PW/2 - logoCardW/2;
  const logoCardY = 42;

  // Card shadow (simulate)
  doc.setFillColor(0, 0, 0);
  doc.setGState(doc.GState({ opacity: 0.25 }));
  doc.roundedRect(logoCardX + 2, logoCardY + 2, logoCardW, logoCardH, 4, 4, 'F');
  doc.setGState(doc.GState({ opacity: 1 }));

  // White card
  doc.setFillColor(...C.white);
  doc.roundedRect(logoCardX, logoCardY, logoCardW, logoCardH, 4, 4, 'F');

  // Red top line on card
  doc.setFillColor(...C.red);
  doc.roundedRect(logoCardX, logoCardY, logoCardW, 2.5, 2, 2, 'F');
  doc.rect(logoCardX, logoCardY + 1, logoCardW, 1.5, 'F');

  // Logo inside white card
  try {
    const lW = 82, lH = 37;
    doc.addImage(LOGO_B64, 'PNG', logoCardX + logoCardW/2 - lW/2, logoCardY + (logoCardH - lH)/2 + 1, lW, lH, undefined, 'FAST');
  } catch { /* skip */ }

  // ── Bottom white section content ──────────────────────────────────────────
  // Tagline
  doc.setFont('helvetica','normal');
  doc.setFontSize(10);
  doc.setTextColor(...C.dark);
  doc.text('Mercerie & Accessoires Textiles', PW/2, 164, { align:'center' });

  // Red divider
  doc.setDrawColor(...C.red);
  doc.setLineWidth(1.2);
  doc.line(PW/2 - 20, 170, PW/2 + 20, 170);

  // Catalogue label
  doc.setFont('helvetica','bold');
  doc.setFontSize(8);
  doc.setTextColor(...C.gray);
  const labelTxt = `CATALOGUE PRODUITS ${year}`;
  const labelW = doc.getTextWidth(labelTxt) + 10;
  doc.setDrawColor(...C.lgray);
  doc.setLineWidth(0.3);
  doc.roundedRect(PW/2 - labelW/2, 175, labelW, 8, 3, 3, 'S');
  doc.text(labelTxt, PW/2, 180.5, { align:'center' });

  // Stats — 3 boxes
  const statItems = [
    { val: String(totalProducts),   lbl: 'Produits' },
    { val: String(sections.length), lbl: 'Catégories' },
    { val: dateStr.split(' ')[2],   lbl: 'Édition' },
  ];
  const bW = 48, bGap = 6;
  const bTotal = statItems.length * bW + (statItems.length-1)*bGap;
  const bSX = PW/2 - bTotal/2;

  statItems.forEach((s, i) => {
    const bx = bSX + i*(bW+bGap), by = 196;
    // Box
    doc.setFillColor(...C.white);
    doc.setDrawColor(...C.silk);
    doc.setLineWidth(0.3);
    doc.roundedRect(bx, by, bW, 24, 3, 3, 'FD');
    // Accent top
    const acc = i === 0 ? C.red : i === 1 ? C.gold : C.dark;
    doc.setFillColor(...acc);
    doc.roundedRect(bx + bW/2 - 10, by - 1, 20, 3, 1, 1, 'F');
    // Value
    doc.setFont('helvetica','bold');
    doc.setFontSize(18);
    doc.setTextColor(...C.black);
    doc.text(s.val, bx + bW/2, by + 14, { align:'center' });
    // Label
    doc.setFont('helvetica','normal');
    doc.setFontSize(6.5);
    doc.setTextColor(...C.gray);
    doc.text(s.lbl, bx + bW/2, by + 20, { align:'center' });
  });

  // Contact at bottom
  doc.setFont('helvetica','normal');
  doc.setFontSize(8);
  doc.setTextColor(...C.gray);
  doc.text('lebtex.ma  ·  +212 760 998 347', PW/2, 238, { align:'center' });

  // Bottom dark strip
  doc.setFillColor(...C.ink);
  doc.rect(0, PH - 16, PW, 16, 'F');
  doc.setFont('helvetica','normal');
  doc.setFontSize(6.5);
  doc.setTextColor(255,255,255);
  doc.setGState(doc.GState({ opacity: 0.3 }));
  doc.text(`Généré le ${dateStr}`, PW/2, PH - 7, { align:'center' });
  doc.setGState(doc.GState({ opacity: 1 }));

  onProgress?.(10, 'Couverture créée…');

  // ═══════════════════════════════════════════════════
  // PAGE 2 — SOMMAIRE
  // ═══════════════════════════════════════════════════
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

    doc.setFillColor(...accent);
    doc.roundedRect(ML, sy, 11, 11, 2, 2, 'F');
    doc.setFont('helvetica','bold');
    doc.setFontSize(7.5);
    doc.setTextColor(...C.white);
    doc.text(String(i+1).padStart(2,'0'), ML+5.5, sy+7, { align:'center' });

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

  // ═══════════════════════════════════════════════════
  // SECTIONS
  // ═══════════════════════════════════════════════════
  for (let si = 0; si < sections.length; si++) {
    const sec    = sections[si];
    const cat    = sec.category;
    const accent = cat.color ? hexRgb(cat.color) : C.red;
    const prods  = sec.products;

    const pBase = 18 + (si / sections.length) * 72;
    onProgress?.(Math.round(pBase), `Chargement images: ${cat.name}…`);

    // Load all images
    const imgCache: Record<string, string|null> = {};
    await Promise.all(
      prods.map(async p => {
        const url = (p.images||[])[0];
        if (url && !(url in imgCache)) {
          imgCache[url] = await loadImg(url);
        }
      })
    );

    // ── Category header page ─────────────────────────────────────────────────
    doc.addPage();
    band(doc, accent);
    doc.setFillColor(...C.cream);
    doc.rect(0, 3, PW, 40, 'F');

    doc.setFillColor(...accent);
    doc.roundedRect(ML, 9, 22, 22, 3, 3, 'F');
    doc.setFont('helvetica','bold');
    doc.setFontSize(15);
    doc.setTextColor(...C.white);
    doc.text(String(si+1).padStart(2,'0'), ML+11, 22, { align:'center' });

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

    doc.setFont('helvetica','bold');
    doc.setFontSize(16);
    doc.setTextColor(...accent);
    doc.text(String(prods.length), PW-MR-3, 20, { align:'right' });
    doc.setFont('helvetica','normal');
    doc.setFontSize(7);
    doc.setTextColor(...C.gray);
    doc.text(`produit${prods.length>1?'s':''}`, PW-MR-3, 26, { align:'right' });

    // ── Products 2-column grid ───────────────────────────────────────────────
    const CARD_H = 64, CARD_GAP = 5;
    const IMG_W = 44, IMG_H = 44;
    const COLS = 2;
    const COL_W = (CW - CARD_GAP) / COLS;
    let py = 50;

    for (let pi = 0; pi < prods.length; pi++) {
      const p   = prods[pi];
      const col = pi % COLS;
      if (col === 0 && pi > 0) py += CARD_H + CARD_GAP;
      if (py + CARD_H > PH - 18) {
        drawFooter(doc, dateStr);
        doc.addPage();
        band(doc, accent);
        py = 10;
      }

      const cx = ML + col * (COL_W + CARD_GAP);
      const cy = py;

      // Card
      doc.setFillColor(...C.white);
      doc.setDrawColor(...C.silk);
      doc.setLineWidth(0.2);
      doc.roundedRect(cx, cy, COL_W, CARD_H, 2.5, 2.5, 'FD');

      // Accent left strip
      doc.setFillColor(...accent);
      doc.roundedRect(cx, cy, 2.5, CARD_H, 2.5, 2.5, 'F');
      doc.rect(cx+1.2, cy, 1.3, CARD_H, 'F');

      // Photo area
      const IX = cx + 6, IY = cy + 5;
      doc.setFillColor(240, 236, 232);
      doc.roundedRect(IX, IY, IMG_W, IMG_H, 2, 2, 'F');

      const imgUrl  = (p.images||[])[0];
      const imgData = imgUrl ? imgCache[imgUrl] : null;
      if (imgData) {
        safeImg(doc, imgData, IX, IY, IMG_W, IMG_H);
      } else {
        // Placeholder with product initial
        doc.setFont('helvetica','bold');
        doc.setFontSize(16);
        doc.setTextColor(...C.lgray);
        doc.text(p.name.charAt(0).toUpperCase(), IX + IMG_W/2, IY + IMG_H/2 + 5, { align:'center' });
      }

      // Right side
      const RX = cx + IMG_W + 10;
      const RW = COL_W - IMG_W - 13;
      let ry = cy + 7;

      // Ref badge
      if (p.sku) {
        doc.setFillColor(...C.silk);
        const refW = doc.getTextWidth(`Réf: ${p.sku}`) + 6;
        doc.roundedRect(RX, ry - 1, refW, 5.5, 1.5, 1.5, 'F');
        doc.setFont('helvetica','bold');
        doc.setFontSize(5.5);
        doc.setTextColor(...C.gray);
        doc.text(`Réf: ${p.sku}`, RX + 3, ry + 3.2);
        ry += 7;
      }

      // Name
      doc.setFont('helvetica','bold');
      doc.setFontSize(8.5);
      doc.setTextColor(...C.black);
      const nameLines = doc.splitTextToSize(clip(p.name, 50), RW);
      doc.text(nameLines.slice(0,2), RX, ry);
      ry += Math.min(nameLines.length, 2)*4 + 1;

      // Specs
      const specs: [string,string][] = [
        ['Matériau', p.material||''],
        ['Type',     p.typeProduit||''],
        ['Couleur',  p.couleur||''],
        ['Largeur',  p.width||''],
        ['Longueur', p.longueur||''],
        ['Poids',    p.weight ? `${p.weight}g` : ''],
      ].filter(([,v])=>v) as [string,string][];

      specs.slice(0, 4).forEach(([lbl, val]) => {
        if (ry > cy + CARD_H - 7) return;
        doc.setFont('helvetica','bold');
        doc.setFontSize(5.5);
        doc.setTextColor(...C.gray);
        doc.text(`${lbl}:`, RX, ry);
        doc.setFont('helvetica','normal');
        doc.setTextColor(...C.dark);
        doc.text(clip(val, 26), RX + doc.getTextWidth(`${lbl}: `), ry);
        ry += 4.2;
      });

      // Variants
      if (p.variants?.length > 0 && ry < cy + CARD_H - 7) {
        const colors = [...new Set(p.variants.filter(v=>v.color).map(v=>v.color!))];
        const sizes  = [...new Set(p.variants.filter(v=>v.size).map(v=>v.size!))];
        doc.setFont('helvetica','bold');
        doc.setFontSize(5.5);
        doc.setTextColor(...accent);
        if (colors.length && ry < cy + CARD_H - 7) {
          doc.text(`Coloris: ${clip(colors.join(', '), 26)}`, RX, ry);
          ry += 4;
        }
        if (sizes.length && ry < cy + CARD_H - 7) {
          doc.text(`Tailles: ${clip(sizes.join(', '), 26)}`, RX, ry);
        }
      }
    }

    if (prods.length > 0) drawFooter(doc, dateStr);

    // ── Fiches techniques ────────────────────────────────────────────────────
    const richProds = prods.filter(p =>
      p.description || p.material || p.typeProduit || p.specification ||
      p.applications || p.avantages || p.conseilsEntretien || p.informationCommerciale
    );

    if (richProds.length === 0) continue;

    doc.addPage();
    band(doc, accent);
    doc.setFillColor(...C.cream);
    doc.rect(0, 3, PW, 15, 'F');
    doc.setFont('helvetica','bold');
    doc.setFontSize(13);
    doc.setTextColor(...C.black);
    doc.text(`${cat.name} — Fiches Techniques`, ML, 13);
    doc.setDrawColor(...accent);
    doc.setLineWidth(0.6);
    doc.line(ML, 16.5, ML+50, 16.5);

    let dy = 24;

    for (const p of richProds) {
      if (dy + 55 > PH - 18) {
        drawFooter(doc, dateStr);
        doc.addPage();
        band(doc, accent);
        dy = 10;
      }

      const imgUrl  = (p.images||[])[0];
      const imgData = imgUrl ? imgCache[imgUrl] : null;

      // Name bar
      doc.setFillColor(...accent);
      doc.setGState(doc.GState({ opacity: 0.12 }));
      doc.roundedRect(ML, dy, CW, 9.5, 2, 2, 'F');
      doc.setGState(doc.GState({ opacity: 1 }));
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
        doc.text(`Réf: ${p.sku}`, ML+CW-1, dy+6.8, { align:'right' });
      }
      dy += 13;

      // Photo + specs
      const ISW = 36, ISH = 36;
      if (imgData) {
        doc.setFillColor(240, 236, 232);
        doc.roundedRect(ML, dy, ISW, ISH, 2, 2, 'F');
        safeImg(doc, imgData, ML, dy, ISW, ISH);
      }

      const SX = ML + (imgData ? ISW + 6 : 0);
      const SW = CW - (imgData ? ISW + 6 : 0);
      let sy2 = dy;

      // Description
      if (p.description) {
        doc.setFont('helvetica','italic');
        doc.setFontSize(7);
        doc.setTextColor(...C.dark);
        const dl = doc.splitTextToSize(clip(p.description, 280), SW);
        doc.text(dl.slice(0,3), SX, sy2 + 4);
        sy2 += Math.min(dl.length,3)*3.8 + 5;
      }

      // Tech specs 2-col
      const techPairs: [string,string][] = [
        ['Matériau',          p.material||''],
        ['Type de produit',   p.typeProduit||''],
        ['Spécification',     p.specification||''],
        ['Couleur',           p.couleur||''],
        ['Largeur',           p.width||''],
        ['Largeur maille',    (p as any).largeurMaille||''],
        ['Longueur',          (p as any).longueur||''],
        ['Poids',             p.weight ? `${p.weight}g` : ''],
        ['Emballage',         p.packaging||''],
        ['Matière/Mailles',   (p as any).matiereMailles||''],
        ['Composition ruban', (p as any).compositionRuban||''],
        ['Résistance',        (p as any).resistance||''],
        ['Sécurité',          (p as any).securite||''],
        ['Compatible avec',   (p as any).compatibleAvec||''],
        ['Pays de fabrication',(p as any).paysFabrication||''],
      ].filter(([,v])=>v) as [string,string][];

      if (techPairs.length > 0) {
        doc.setFont('helvetica','bold');
        doc.setFontSize(6.5);
        doc.setTextColor(...accent);
        doc.text('CARACTÉRISTIQUES TECHNIQUES', SX, sy2 + 3);
        sy2 += 7;

        const halfW = (SW - 5) / 2;
        for (let ti = 0; ti < techPairs.length; ti++) {
          const col = ti % 2;
          if (col === 0 && ti > 0) sy2 += 9;
          if (sy2 > PH - 20) break;
          const sx3 = SX + col*(halfW + 5);
          // Label
          doc.setFont('helvetica','bold');
          doc.setFontSize(5.2);
          doc.setTextColor(...C.gray);
          doc.text(techPairs[ti][0].toUpperCase(), sx3, sy2);
          // Value
          doc.setFont('helvetica','normal');
          doc.setFontSize(7);
          doc.setTextColor(...C.black);
          doc.text(clip(techPairs[ti][1], 35), sx3, sy2 + 4.5);
        }
        sy2 += 9;
      }

      dy = Math.max(dy + ISH + 4, sy2 + 4);

      // Additional info
      const infos: [string,string][] = [
        ['Applications',           p.applications||''],
        ['Avantages',              p.avantages||''],
        ["Conseils d'entretien",   p.conseilsEntretien||''],
        ['Information commerciale', p.informationCommerciale||''],
      ].filter(([,v])=>v) as [string,string][];

      if (infos.length > 0) {
        if (dy + 10 > PH - 18) {
          drawFooter(doc, dateStr);
          doc.addPage(); band(doc, accent); dy = 10;
        }
        doc.setFont('helvetica','bold');
        doc.setFontSize(6.5);
        doc.setTextColor(...accent);
        doc.text('INFORMATIONS COMPLÉMENTAIRES', ML, dy + 3);
        dy += 7;

        for (const [lbl, val] of infos) {
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
          dy += Math.min(il.length,4)*3.5 + 6;
        }
      }

      doc.setDrawColor(...C.silk);
      doc.setLineWidth(0.2);
      doc.line(ML, dy, ML+CW, dy);
      dy += 7;
    }
    drawFooter(doc, dateStr);
  }

  onProgress?.(93, 'Page de contact…');

  // ═══════════════════════════════════════════════════
  // LAST PAGE — CONTACT (same split design as cover)
  // ═══════════════════════════════════════════════════
  doc.addPage();

  // Top dark
  doc.setFillColor(...C.ink);
  doc.rect(0, 0, PW, 148, 'F');
  // Bottom cream
  doc.setFillColor(...C.cream);
  doc.rect(0, 148, PW, PH-148, 'F');

  // Red accent
  doc.setFillColor(...C.red);
  doc.setGState(doc.GState({ opacity: 0.18 }));
  doc.triangle(PW, 0, PW, 90, PW-70, 0, 'F');
  doc.setGState(doc.GState({ opacity: 1 }));

  // Logo card (smaller)
  const lc2W = 90, lc2H = 45, lc2X = PW/2 - lc2W/2, lc2Y = 40;
  doc.setFillColor(0,0,0);
  doc.setGState(doc.GState({ opacity: 0.2 }));
  doc.roundedRect(lc2X+2, lc2Y+2, lc2W, lc2H, 4, 4, 'F');
  doc.setGState(doc.GState({ opacity: 1 }));
  doc.setFillColor(...C.white);
  doc.roundedRect(lc2X, lc2Y, lc2W, lc2H, 4, 4, 'F');
  doc.setFillColor(...C.red);
  doc.roundedRect(lc2X, lc2Y, lc2W, 2.5, 2, 2, 'F');
  doc.rect(lc2X, lc2Y+1, lc2W, 1.5, 'F');
  try {
    const lW2 = 70, lH2 = 31;
    doc.addImage(LOGO_B64, 'PNG', lc2X + lc2W/2 - lW2/2, lc2Y + (lc2H - lH2)/2 + 1, lW2, lH2, undefined, 'FAST');
  } catch {}

  // Title
  doc.setFont('helvetica','bold');
  doc.setFontSize(26);
  doc.setTextColor(...C.white);
  doc.text("Besoin d'informations ?", PW/2, 118, { align:'center' });
  doc.setFont('helvetica','normal');
  doc.setFontSize(8.5);
  doc.setGState(doc.GState({ opacity: 0.38 }));
  doc.text('Contactez-nous pour les tarifs, quantités et conditions.', PW/2, 128, { align:'center' });
  doc.setGState(doc.GState({ opacity: 1 }));

  // WhatsApp
  doc.setFillColor(37, 211, 102);
  doc.roundedRect(PW/2-50, 158, 100, 14, 7, 7, 'F');
  doc.setFont('helvetica','bold');
  doc.setFontSize(9.5);
  doc.setTextColor(...C.white);
  doc.text('Demander les prix — WhatsApp', PW/2, 167, { align:'center' });

  // Phone box
  doc.setFillColor(...C.white);
  doc.setDrawColor(...C.silk);
  doc.setLineWidth(0.3);
  doc.roundedRect(PW/2-40, 184, 80, 13, 4, 4, 'FD');
  doc.setFont('helvetica','bold');
  doc.setFontSize(11);
  doc.setTextColor(...C.black);
  doc.text('+212 760 998 347', PW/2, 192, { align:'center' });

  // Website
  doc.setFont('helvetica','normal');
  doc.setFontSize(9);
  doc.setTextColor(...C.gray);
  doc.text('lebtex.ma', PW/2, 212, { align:'center' });

  // Bottom strip
  doc.setFillColor(...C.ink);
  doc.rect(0, PH-16, PW, 16, 'F');
  doc.setFont('helvetica','normal');
  doc.setFontSize(6.5);
  doc.setGState(doc.GState({ opacity: 0.3 }));
  doc.setTextColor(...C.white);
  doc.text(`© ${year} LEBTEX — Tous droits réservés`, PW/2, PH-7, { align:'center' });
  doc.setGState(doc.GState({ opacity: 1 }));

  onProgress?.(100, 'Téléchargement…');

  const fname = `LEBTEX_Catalogue_${year}-${String(now.getMonth()+1).padStart(2,'0')}-${String(now.getDate()).padStart(2,'0')}.pdf`;
  doc.save(fname);
  return fname;
}
