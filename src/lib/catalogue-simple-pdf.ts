'use client';

import jsPDF from 'jspdf';
import type { ShopProduct, ShopCategory } from './shop-types';
import { LOGO_B64 } from './logo-b64';

const C = {
  red:   [200, 16, 46]   as [number, number, number],
  black: [26, 26, 26]    as [number, number, number],
  dark:  [55, 55, 55]    as [number, number, number],
  gray:  [120, 120, 120] as [number, number, number],
  lgray: [200, 196, 192] as [number, number, number],
  silk:  [238, 234, 230] as [number, number, number],
  cream: [253, 251, 248] as [number, number, number],
  white: [255, 255, 255] as [number, number, number],
};

type ProgressCb = (pct: number, msg: string) => void;

async function loadImg(url: string): Promise<string | null> {
  if (!url) return null;
  try {
    const fetchUrl = url.startsWith('http')
      ? `/api/img-proxy?url=${encodeURIComponent(url)}`
      : url;
    const resp = await fetch(fetchUrl);
    if (!resp.ok) return null;
    const blob = await resp.blob();
    if (blob.size < 100) return null;
    
    // Create an object URL and load it into an Image
    const objUrl = URL.createObjectURL(blob);
    return new Promise<string | null>((resolve) => {
      const img = new Image();
      img.onload = () => {
        try {
          const canvas = document.createElement('canvas');
          // Scale down very large images to save PDF size (max 150px since thumbnails are 22mm)
          const MAX_SIZE = 150;
          let w = img.width;
          let h = img.height;
          if (w > MAX_SIZE || h > MAX_SIZE) {
            const ratio = Math.min(MAX_SIZE / w, MAX_SIZE / h);
            w = Math.round(w * ratio);
            h = Math.round(h * ratio);
          }
          canvas.width = w;
          canvas.height = h;
          const ctx = canvas.getContext('2d');
          if (!ctx) { resolve(null); return; }
          // Fill white background (in case of transparent PNG/WEBP)
          ctx.fillStyle = '#FFFFFF';
          ctx.fillRect(0, 0, w, h);
          ctx.drawImage(img, 0, 0, w, h);
          const dataUrl = canvas.toDataURL('image/jpeg', 0.85);
          URL.revokeObjectURL(objUrl);
          resolve(dataUrl);
        } catch {
          URL.revokeObjectURL(objUrl);
          resolve(null);
        }
      };
      img.onerror = () => {
        URL.revokeObjectURL(objUrl);
        resolve(null);
      };
      img.src = objUrl;
    });
  } catch { return null; }
}

function hexRgb(hex: string): [number, number, number] {
  const h = hex.replace('#', '');
  return [parseInt(h.slice(0,2),16), parseInt(h.slice(2,4),16), parseInt(h.slice(4,6),16)];
}

function safeImg(doc: jsPDF, data: string, x: number, y: number, w: number, h: number) {
  try {
    const fmt = data.startsWith('data:image/png') ? 'PNG' : 'JPEG';
    doc.addImage(data, fmt, x, y, w, h, undefined, 'FAST');
  } catch { /* skip */ }
}

function drawFooter(doc: jsPDF, dateStr: string, pg: number) {
  const PW = 210, PH = 297, ML = 14, MR = 14;
  doc.setDrawColor(...C.lgray); doc.setLineWidth(0.2);
  doc.line(ML, PH - 13, PW - MR, PH - 13);
  doc.setFont('helvetica','normal'); doc.setFontSize(6.5); doc.setTextColor(...C.gray);
  doc.text('LEBTEX — Catalogue Simplifié', ML, PH - 9);
  doc.text(dateStr, 105, PH - 9, { align:'center' });
  doc.setFont('helvetica','bold');
  doc.text(String(pg), PW - MR, PH - 9, { align:'right' });
}

function drawLeader(doc: jsPDF, fromX: number, toX: number, y: number) {
  if (fromX + 3 >= toX) return;
  doc.setDrawColor(...C.lgray); doc.setLineWidth(0.15);
  doc.setLineDashPattern([0.5, 1.5], 0);
  doc.line(fromX, y, toX, y);
  doc.setLineDashPattern([], 0);
}

// ═════════════════════════════════════════════════════════════════════════════════
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

  // ─── COVER PAGE (WHITE) ──────────────────────────────────────────────────
  // Red top band
  doc.setFillColor(...C.red);
  doc.rect(0, 0, PW, 4, 'F');

  // Logo — big and centered
  if (LOGO_B64) {
    try { doc.addImage(LOGO_B64, 'PNG', PW/2 - 25, 40, 50, 50, undefined, 'FAST'); } catch {}
  }

  // Title text below logo
  doc.setFont('helvetica','bold'); doc.setFontSize(28); doc.setTextColor(...C.black);
  doc.text('LEBTEX', PW/2, 108, { align:'center' });

  doc.setDrawColor(...C.red); doc.setLineWidth(0.8);
  doc.line(PW/2 - 20, 113, PW/2 + 20, 113);

  doc.setFont('helvetica','normal'); doc.setFontSize(10); doc.setTextColor(...C.gray);
  doc.text('Mercerie & Accessoires Textiles', PW/2, 121, { align:'center' });

  // Badge
  doc.setFillColor(...C.red);
  doc.roundedRect(PW/2 - 30, 133, 60, 11, 3, 3, 'F');
  doc.setFont('helvetica','bold'); doc.setFontSize(9); doc.setTextColor(...C.white);
  doc.text(`CATALOGUE SIMPLIFIÉ ${year}`, PW/2, 140, { align:'center' });

  // Stats
  const stats = [
    { val: String(sections.length), lbl: 'Catégories' },
    { val: String(totalProducts), lbl: 'Produits' },
    { val: '+15', lbl: "Ans d'exp." },
  ];
  const statStartX = PW/2 - 60;
  stats.forEach((s, i) => {
    const sx = statStartX + i * 60;
    doc.setFont('helvetica','bold'); doc.setFontSize(20); doc.setTextColor(...C.red);
    doc.text(s.val, sx, 168, { align:'center' });
    doc.setFont('helvetica','normal'); doc.setFontSize(7); doc.setTextColor(...C.gray);
    doc.text(s.lbl, sx, 174, { align:'center' });
  });

  // Bottom contact
  doc.setDrawColor(...C.silk); doc.setLineWidth(0.3);
  doc.line(ML + 30, PH - 32, PW - MR - 30, PH - 32);
  doc.setFont('helvetica','normal'); doc.setFontSize(7); doc.setTextColor(...C.gray);
  doc.text('contact@lebtex.ma  ·  +212 760 998 347  ·  lebtex.ma', PW/2, PH - 25, { align:'center' });

  onProgress?.(5, 'Chargement images…');

  // ─── Load ALL images sequentially to avoid crashing network/memory ─────
  const imgCache: Record<string, string|null> = {};
  const allProds = sections.flatMap(s => s.products);
  const totalProdsToLoad = allProds.length;
  let loaded = 0;
  
  for (const p of allProds) {
    const url = (p.images||[])[0];
    if (url && !(url in imgCache)) {
      imgCache[url] = await loadImg(url);
    }
    loaded++;
    if (loaded % 5 === 0 || loaded === totalProdsToLoad) {
      onProgress?.(5 + Math.round((loaded / totalProdsToLoad) * 70), `Images: ${loaded}/${totalProdsToLoad}…`);
      // Yield to main thread
      await new Promise(r => setTimeout(r, 1));
    }
  }

  onProgress?.(80, 'Construction des pages…');

  // ─── Build flat list of items to render ──────────────────────────────────
  // Each item is either a category header, sub-category header, or product card
  type RenderItem =
    | { type: 'category'; cat: ShopCategory; accent: [number,number,number] }
    | { type: 'subcategory'; sub: ShopCategory; accent: [number,number,number] }
    | { type: 'product'; prod: ShopProduct; accent: [number,number,number] };

  const renderItems: RenderItem[] = [];

  for (const sec of sections) {
    const cat = sec.category;
    const accent = cat.color ? hexRgb(cat.color) : C.red;
    const prods = sec.products;
    if (prods.length === 0) continue;

    renderItems.push({ type: 'category', cat, accent });

    if (sec.subCategories.length > 0) {
      // Products grouped by sub-category
      for (const sub of sec.subCategories) {
        const subProds = prods.filter(p => p.categorySlug === sub.slug);
        if (subProds.length === 0) continue;
        renderItems.push({ type: 'subcategory', sub, accent });
        for (const p of subProds) renderItems.push({ type: 'product', prod: p, accent });
      }
      // Direct products (not in any sub-cat)
      const subSlugs = new Set(sec.subCategories.map(s => s.slug));
      const directProds = prods.filter(p => !subSlugs.has(p.categorySlug) || p.categorySlug === cat.slug);
      if (directProds.length > 0) {
        for (const p of directProds) renderItems.push({ type: 'product', prod: p, accent });
      }
    } else {
      // No sub-categories: all products directly
      for (const p of prods) renderItems.push({ type: 'product', prod: p, accent });
    }
  }

  // ─── RENDER PAGES ────────────────────────────────────────────────────────
  // Layout constants
  const COLS = 2;
  const COL_GAP = 4;
  const COL_W = (CW - COL_GAP) / COLS;
  const CARD_H = 42;
  const CARD_GAP_Y = 3;
  const IMG_SIZE = 22;
  const CAT_HEADER_H = 14;
  const SUBCAT_HEADER_H = 8;
  const PAGE_TOP = 8;
  const PAGE_BOT = PH - 16;

  // Track current position
  let y = PAGE_BOT; // Force first new page
  let col = 0;
  let pageStarted = false;
  let rowMaxH = 0;

  // Track page numbers for sommaire
  interface TocItem { title: string; isCategory: boolean; page: number; accent: [number,number,number]; }
  const tocItems: TocItem[] = [];

  function newPage() {
    doc.addPage();
    pageStarted = true;
    y = PAGE_TOP;
    col = 0;
  }

  function needSpace(h: number): boolean {
    return y + h > PAGE_BOT;
  }

  // Track which page we're on (will adjust later after sommaire insert)
  function currentPageIdx(): number {
    return (doc.internal as any).getNumberOfPages();
  }

  for (const item of renderItems) {
    if (item.type === 'category') {
      // Always start fresh row for category
      if (col !== 0) { col = 0; y += rowMaxH + CARD_GAP_Y; rowMaxH = 0; }
      if (!pageStarted || needSpace(CAT_HEADER_H + CARD_H + 10)) newPage();

      const accent = item.accent;
      tocItems.push({ title: item.cat.name, isCategory: true, page: currentPageIdx(), accent });

      // Category header: full width bar
      doc.setFillColor(...accent);
      doc.rect(ML, y, CW, CAT_HEADER_H, 'F');

      // White text on colored bar
      doc.setFont('helvetica','bold'); doc.setFontSize(11); doc.setTextColor(...C.white);
      doc.text(item.cat.name.toUpperCase(), ML + 5, y + 9);

      // Product count
      const catProds = sections.find(s => s.category.slug === item.cat.slug)?.products.length || 0;
      doc.setFont('helvetica','normal'); doc.setFontSize(7); doc.setTextColor(...C.white);
      doc.text(`${catProds} produits`, PW - MR - 3, y + 9, { align:'right' });

      y += CAT_HEADER_H + 3;
      col = 0;

    } else if (item.type === 'subcategory') {
      // Start fresh row for sub-category
      if (col !== 0) { col = 0; y += rowMaxH + CARD_GAP_Y; rowMaxH = 0; }
      if (needSpace(SUBCAT_HEADER_H + CARD_H + 5)) newPage();

      const accent = item.accent;
      tocItems.push({ title: item.sub.name, isCategory: false, page: currentPageIdx(), accent });

      // Sub-category header: accent left bar + name
      doc.setFillColor(...accent);
      doc.roundedRect(ML, y, 2.5, SUBCAT_HEADER_H, 1, 1, 'F');
      doc.setFont('helvetica','bold'); doc.setFontSize(8.5); doc.setTextColor(...accent);
      doc.text(item.sub.name, ML + 6, y + 5.5);

      // Light underline
      doc.setDrawColor(...C.silk); doc.setLineWidth(0.3);
      doc.line(ML, y + SUBCAT_HEADER_H, PW - MR, y + SUBCAT_HEADER_H);

      y += SUBCAT_HEADER_H + 2;
      col = 0;

    } else {
      // PRODUCT CARD — height adapts to content
      const p = item.prod;
      const accent = item.accent;

      // Compute specs first to know card height and prevent negative width crashes
      const allSpecs: [string, string][] = [
        ['Matériau',       p.material||''],
        ['Type',           p.typeProduit||''],
        ['Spécification',  p.specification||''],
        ['Couleur',        p.couleur||''],
        ['Largeur',        p.width||''],
        ['Largeur maille', (p as any).largeurMaille||''],
        ['Longueur',       (p as any).longueur||''],
        ['Poids',          p.weight ? `${p.weight}g` : ''],
        ['Emballage',      p.packaging||''],
        ['Matière',        (p as any).matiereMailles||''],
        ['Composition',    (p as any).compositionRuban||''],
        ['Résistance',     (p as any).resistance||''],
        ['Compatible',     (p as any).compatibleAvec||''],
        ['Design',         (p as any).design||''],
        ['Cond. unitaire', (p as any).conditionnementUnitaire||''],
        ['Cond. gros',     (p as any).conditionnementGros||''],
        ['Sécurité',       (p as any).securite||''],
      ].filter(([,v]) => v) as [string, string][];

      const RW = COL_W - 4.5 - IMG_SIZE - 5;
      
      // Calculate specs height properly by measuring lines
      const specLinesData: { lbl: string, lines: string[], lblW: number }[] = [];
      let specsH = 0;
      
      for (const [lbl, val] of allSpecs) {
        doc.setFont('helvetica','bold'); doc.setFontSize(4.5);
        const lblW = doc.getTextWidth(lbl + ': ');
        const maxValW = Math.max(10, RW - lblW - 1);
        doc.setFont('helvetica','normal'); doc.setFontSize(5);
        const lines = doc.splitTextToSize(val, maxValW);
        specLinesData.push({ lbl, lines, lblW });
        specsH += lines.length * 3.2;
      }

      // Dynamic card height
      doc.setFont('helvetica','bold'); doc.setFontSize(7);
      const nameLines = doc.splitTextToSize(p.catalogueName || p.name, RW);
      const nameH = Math.min(nameLines.length, 3) * 3 + 2;
      const cardH = Math.max(IMG_SIZE + 6, nameH + 1.5 + specsH + 6);

      // Now we know cardH, check if it fits. If col === 1, we must check if BOTH cards fit.
      // But rowMaxH tracks the first card. If this card is taller, it might overflow.
      // To be safe, check needSpace(cardH + 2) anyway, and if it overflows, force a new page.
      if (needSpace(cardH + 2)) {
        newPage();
      } else if (!pageStarted) {
        newPage();
      }

      const cx = ML + col * (COL_W + COL_GAP);
      const cy = y;

      // Card border
      doc.setFillColor(...C.white); doc.setDrawColor(...C.silk); doc.setLineWidth(0.2);
      doc.roundedRect(cx, cy, COL_W, cardH, 1.5, 1.5, 'FD');

      // Accent left strip
      doc.setFillColor(...accent);
      doc.rect(cx, cy + 1.5, 2, cardH - 3, 'F');

      // Image
      const imgUrl = (p.images||[])[0];
      const imgData = imgUrl ? imgCache[imgUrl] : null;
      const IX = cx + 4.5, IY = cy + (cardH - IMG_SIZE) / 2;
      doc.setFillColor(245, 242, 238);
      doc.roundedRect(IX, IY, IMG_SIZE, IMG_SIZE, 1, 1, 'F');
      if (imgData) safeImg(doc, imgData, IX, IY, IMG_SIZE, IMG_SIZE);

      // Right side
      const RX = cx + 4.5 + IMG_SIZE + 3;
      let ry = cy + 3.5;

      // Product name
      doc.setFont('helvetica','bold'); doc.setFontSize(7); doc.setTextColor(...C.black);
      doc.text(nameLines.slice(0, 3), RX, ry + 2.5);
      ry += nameH + 1.5; // padding between title and specs

      // ALL tech specs — no break, full wrap
      for (const itemData of specLinesData) {
        doc.setFont('helvetica','bold'); doc.setFontSize(4.5); doc.setTextColor(...C.gray);
        doc.text(itemData.lbl + ':', RX, ry);
        doc.setFont('helvetica','normal'); doc.setFontSize(5); doc.setTextColor(...C.dark);
        doc.text(itemData.lines, RX + itemData.lblW, ry);
        ry += itemData.lines.length * 3.2;
      }

      // Advance position — track max height per row
      col++;
      rowMaxH = Math.max(rowMaxH, cardH);
      if (col >= COLS) {
        col = 0;
        y += rowMaxH + CARD_GAP_Y;
        rowMaxH = 0;
      }
    }
  }

  onProgress?.(90, 'Contact…');

  // ─── CONTACT PAGE ────────────────────────────────────────────────────────
  doc.addPage();
  doc.setFillColor(...C.cream); doc.rect(0, 0, PW, PH, 'F');
  doc.setFillColor(...C.red); doc.rect(0, 0, PW, 4, 'F');

  doc.setFont('helvetica','bold'); doc.setFontSize(20); doc.setTextColor(...C.black);
  doc.text('Contactez-nous', PW/2, 45, { align:'center' });
  doc.setFont('helvetica','normal'); doc.setFontSize(9); doc.setTextColor(...C.gray);
  doc.text('Notre équipe répond rapidement à toutes vos demandes', PW/2, 54, { align:'center' });

  doc.setDrawColor(...C.red); doc.setLineWidth(0.5);
  doc.line(PW/2 - 15, 59, PW/2 + 15, 59);

  const contacts = [
    { lbl: 'Téléphone',  val: '+212 760 998 347' },
    { lbl: 'Email',      val: 'contact@lebtex.ma' },
    { lbl: 'Magasin 1',  val: 'Boulevard Haïfa, Casablanca' },
    { lbl: 'Magasin 2',  val: 'Derb Omar, Casablanca' },
  ];
  let cy = 70;
  for (const c of contacts) {
    doc.setFillColor(...C.white); doc.setDrawColor(...C.silk); doc.setLineWidth(0.2);
    doc.roundedRect(ML + 20, cy, CW - 40, 12, 2, 2, 'FD');
    doc.setFont('helvetica','bold'); doc.setFontSize(7); doc.setTextColor(...C.red);
    doc.text(c.lbl, ML + 24, cy + 7.5);
    doc.setFont('helvetica','normal'); doc.setFontSize(8); doc.setTextColor(...C.black);
    doc.text(c.val, PW - MR - 24, cy + 7.5, { align:'right' });
    cy += 16;
  }

  doc.setFont('helvetica','bold'); doc.setFontSize(9); doc.setTextColor(...C.red);
  doc.text('lebtex.ma', PW/2, cy + 12, { align:'center' });

  onProgress?.(93, 'Sommaire…');

  // ─── SOMMAIRE (generated at end, inserted at page 2) ─────────────────────
  const tocStartIdx = (doc.internal as any).getNumberOfPages() + 1;

  // Dry-run to estimate pages
  const TOC_TOP = 45, TOC_BOT = PH - 22;
  let dryY = TOC_TOP;
  let dryPages = 1;
  for (const item of tocItems) {
    const h = item.isCategory ? 10 : 6;
    if (dryY + h > TOC_BOT) { dryPages++; dryY = 16; }
    dryY += h;
  }
  const tocPagesCount = dryPages;

  // Draw sommaire
  function drawTocHeader(d: jsPDF, isFirst: boolean) {
    d.setFillColor(...C.red); d.rect(0, 0, PW, 4, 'F');
    if (isFirst) {
      d.setFont('helvetica','bold'); d.setFontSize(20); d.setTextColor(...C.black);
      d.text('Sommaire', ML, 18);
      d.setFont('helvetica','normal'); d.setFontSize(8); d.setTextColor(...C.gray);
      d.text(`${sections.length} catégories  ·  ${totalProducts} produits`, ML, 25);
      d.setDrawColor(...C.red); d.setLineWidth(0.5); d.line(ML, 29, ML + 22, 29);
      d.setFont('helvetica','bold'); d.setFontSize(6.5); d.setTextColor(...C.gray);
      d.text('SECTION', ML + 5, 38);
      d.text('PAGE', PW - MR, 38, { align:'right' });
      d.setDrawColor(...C.silk); d.setLineWidth(0.3); d.line(ML, 41, PW - MR, 41);
    } else {
      d.setFont('helvetica','bold'); d.setFontSize(10); d.setTextColor(...C.gray);
      d.text('Sommaire (suite)', ML, 12);
    }
  }

  doc.addPage();
  drawTocHeader(doc, true);
  let tocY = TOC_TOP;
  let catNum = 0;

  for (const item of tocItems) {
    const rowH = item.isCategory ? 10 : 6;
    if (tocY + rowH > TOC_BOT) {
      doc.addPage();
      drawTocHeader(doc, false);
      tocY = 16;
    }

    // All pages after cover shift by tocPagesCount
    const printedPg = item.page - 1 + tocPagesCount;

    if (item.isCategory) {
      catNum++;
      // Badge
      doc.setFillColor(...item.accent);
      doc.roundedRect(ML, tocY, 6, 6, 1.2, 1.2, 'F');
      doc.setFont('helvetica','bold'); doc.setFontSize(6); doc.setTextColor(...C.white);
      doc.text(String(catNum).padStart(2, '0'), ML + 3, tocY + 4, { align:'center' });

      // Name
      doc.setFont('helvetica','bold'); doc.setFontSize(9.5); doc.setTextColor(...C.black);
      doc.text(item.title, ML + 9, tocY + 4.5);
      const tw = doc.getTextWidth(item.title);
      drawLeader(doc, ML + 9 + tw + 2, PW - MR - 10, tocY + 4.5);
      doc.text(String(printedPg), PW - MR, tocY + 4.5, { align:'right' });

    } else {
      // Sub-category
      doc.setFillColor(...C.lgray); doc.circle(ML + 9, tocY + 2.5, 0.5, 'F');
      doc.setFont('helvetica','normal'); doc.setFontSize(7.5); doc.setTextColor(...C.gray);
      doc.text(item.title, ML + 12, tocY + 3.5);
      const tw = doc.getTextWidth(item.title);
      drawLeader(doc, ML + 12 + tw + 2, PW - MR - 10, tocY + 3.5);
      doc.setFont('helvetica','normal'); doc.setFontSize(7.5); doc.setTextColor(...C.gray);
      doc.text(String(printedPg), PW - MR, tocY + 3.5, { align:'right' });
    }

    tocY += rowH;
  }

  // Move sommaire to page 2
  const tocActualPages = (doc.internal as any).getNumberOfPages() - tocStartIdx + 1;
  for (let i = 0; i < tocActualPages; i++) {
    (doc as any).movePage(tocStartIdx + i, 2 + i);
  }

  // Footers on all pages
  const totalPages = (doc.internal as any).getNumberOfPages();
  for (let i = 2; i <= totalPages; i++) {
    doc.setPage(i);
    drawFooter(doc, dateStr, i - 1);
  }
  doc.setPage(totalPages);

  onProgress?.(100, 'Téléchargement…');
  const fname = `LEBTEX_Catalogue_Simple_${year}.pdf`;
  
  // Custom safe download mechanism to prevent ERR_FILE_NOT_FOUND
  const blob = doc.output('blob');
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = fname;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  // Intentionally NOT revoking the URL here. Chrome Antivirus/Disk writers sometimes
  // take a long time to process the Blob. Revoking it causes ERR_FILE_NOT_FOUND.
  
  return fname;
}
