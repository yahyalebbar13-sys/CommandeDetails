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

// ─── Load image and return base64 data URI ────────────────────────────────────
async function loadImg(originalUrl: string): Promise<string | null> {
  if (!originalUrl) return null;
  try {
    let fetchUrl: string;
    if (originalUrl.startsWith('/') || originalUrl.startsWith('blob:')) {
      fetchUrl = originalUrl;
    } else if (originalUrl.startsWith('http')) {
      fetchUrl = `/api/img-proxy?url=${encodeURIComponent(originalUrl)}`;
    } else {
      return null;
    }

    console.log('[loadImg] fetching:', fetchUrl.substring(0, 80));
    const resp = await fetch(fetchUrl);
    console.log('[loadImg] response:', resp.status, resp.headers.get('content-type'));
    if (!resp.ok) { console.warn('[loadImg] not ok:', resp.status); return null; }

    const blob = await resp.blob();
    console.log('[loadImg] blob size:', blob.size, 'type:', blob.type);
    if (blob.size < 100) return null;

    return new Promise<string | null>((resolve) => {
      const reader = new FileReader();
      reader.onloadend = () => {
        const result = reader.result as string;
        console.log('[loadImg] base64 length:', result?.length || 0, 'starts:', result?.substring(0, 30));
        resolve(result || null);
      };
      reader.onerror = () => { console.warn('[loadImg] FileReader error'); resolve(null); };
      reader.readAsDataURL(blob);
    });
  } catch (e) {
    console.warn('[loadImg] error:', originalUrl, e);
    return null;
  }
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

  onProgress?.(3, 'Chargement des images…');

  // ── Pre-load first product image per category (for sommaire) ────────────────
  const catImgCache: Record<string, string|null> = {};
  await Promise.all(
    sections.map(async sec => {
      // Use first product's first image as category thumbnail
      const firstProd = sec.products.find(p => p.images?.length > 0);
      const firstImg = firstProd?.images[0];
      console.log(`[PDF] Cat "${sec.category.name}" (${sec.category.slug}): ${sec.products.length} prods, firstImg=${firstImg ? firstImg.substring(0,60)+'...' : 'NONE'}`);
      if (firstImg) {
        const result = await loadImg(firstImg);
        catImgCache[sec.category.slug] = result;
        console.log(`[PDF] → Loaded: ${result ? `YES (${result.length} chars)` : 'FAILED'}`);
      }
    })
  );
  console.log('[PDF] catImgCache keys:', Object.keys(catImgCache), 'non-null:', Object.values(catImgCache).filter(Boolean).length);

  // Store photos & App photos
  const storePhotos: Record<string, string|null> = {};
  const storeUrls = [
    '/boutiques/haifa-1.jpg', 
    '/boutiques/derb-omar-1.webp',
    '/images/client-portal-login.png',
    '/images/client-portal-dashboard.jpg'
  ];
  await Promise.all(
    storeUrls.map(async url => {
      storePhotos[url] = await loadImg(url);
    })
  );

  onProgress?.(6, 'Préparation du PDF…');

  // ══════════════════════════════════════════════════════
  // PAGE 1 — COUVERTURE (fond blanc + vrai logo)
  // ══════════════════════════════════════════════════════
  // White background
  doc.setFillColor(...C.white);
  doc.rect(0, 0, PW, PH, 'F');

  // Subtle top accent line
  doc.setFillColor(...C.red);
  doc.rect(0, 0, PW, 3, 'F');

  // Decorative corner elements
  doc.setDrawColor(...C.silk);
  doc.setLineWidth(0.3);
  doc.line(ML, 18, ML+30, 18);
  doc.line(ML, 18, ML, 48);
  doc.line(PW-MR, 18, PW-MR-30, 18);
  doc.line(PW-MR, 18, PW-MR, 48);

  // Real logo centered
  try {
    const lW = 100, lH = 45;
    doc.addImage(LOGO_B64, 'PNG', PW/2 - lW/2, 60, lW, lH, undefined, 'FAST');
  } catch {}

  // Red divider under logo
  doc.setDrawColor(...C.red);
  doc.setLineWidth(1.2);
  doc.line(PW/2 - 30, 115, PW/2 + 30, 115);

  // Tagline
  doc.setFont('helvetica','normal');
  doc.setFontSize(11);
  doc.setTextColor(...C.dark);
  doc.text('Mercerie & Accessoires Textiles', PW/2, 126, { align:'center' });

  // Catalogue label
  const pillText = `CATALOGUE PRODUITS ${year}`;
  doc.setFont('helvetica','bold');
  doc.setFontSize(8);
  doc.setTextColor(...C.red);
  const pillW = doc.getTextWidth(pillText) + 14;
  doc.setDrawColor(...C.red);
  doc.setLineWidth(0.4);
  doc.roundedRect(PW/2 - pillW/2, 136, pillW, 9, 4, 4, 'S');
  doc.text(pillText, PW/2, 142, { align:'center' });

  // Stat boxes on white
  const stats = [
    { val: String(totalProducts), lbl: 'Produits' },
    { val: String(sections.length), lbl: 'Catégories' },
    { val: '+15', lbl: "Ans d'expérience" },
  ];
  const bW = 44, bH = 28, bGap = 8;
  const bTW = stats.length * bW + (stats.length-1)*bGap;
  const bSX = PW/2 - bTW/2;
  stats.forEach((s, i) => {
    const bx = bSX + i*(bW+bGap), by = 160;
    doc.setFillColor(...C.cream);
    doc.setDrawColor(...C.silk);
    doc.setLineWidth(0.3);
    doc.roundedRect(bx, by, bW, bH, 3, 3, 'FD');
    // Accent top
    const acc = i === 0 ? C.red : i === 1 ? C.gold : C.dark;
    doc.setFillColor(...acc);
    doc.roundedRect(bx + bW/2 - 8, by - 1, 16, 2.5, 1, 1, 'F');
    // Value
    doc.setFont('helvetica','bold');
    doc.setFontSize(18);
    doc.setTextColor(...C.black);
    doc.text(s.val, bx+bW/2, by+16, { align:'center' });
    // Label
    doc.setFont('helvetica','normal');
    doc.setFontSize(6);
    doc.setTextColor(...C.gray);
    doc.text(s.lbl, bx+bW/2, by+23, { align:'center' });
  });

  // Contact at bottom
  doc.setFont('helvetica','normal');
  doc.setFontSize(8);
  doc.setTextColor(...C.gray);
  doc.text('lebtex.ma  ·  +212 760 998 347  ·  lebtexsarlau@gmail.com', PW/2, 215, { align:'center' });

  // Bottom decorative
  doc.setDrawColor(...C.silk);
  doc.setLineWidth(0.3);
  doc.line(ML, PH-30, ML+30, PH-30);
  doc.line(PW-MR, PH-30, PW-MR-30, PH-30);

  doc.setFont('helvetica','normal');
  doc.setFontSize(6.5);
  doc.setTextColor(...C.lgray);
  doc.text(`Généré le ${dateStr}`, PW/2, PH - 12, { align:'center' });

  onProgress?.(5, 'Couverture créée…');

  // ══════════════════════════════════════════════════════
  // PAGE — À PROPOS
  // ══════════════════════════════════════════════════════
  doc.addPage();
  band(doc, C.red);

  doc.setFont('helvetica','bold');
  doc.setFontSize(22);
  doc.setTextColor(...C.black);
  doc.text('À Propos de LEBTEX', ML, 22);
  doc.setFont('helvetica','normal');
  doc.setFontSize(8);
  doc.setTextColor(...C.gray);
  doc.text('Votre spécialiste en accessoires textiles et mercerie au Maroc, depuis plus de 15 ans.', ML, 29);
  doc.setDrawColor(...C.red);
  doc.setLineWidth(0.7);
  doc.line(ML, 33, ML+35, 33);

  let ay = 42;

  // Notre histoire
  doc.setFont('helvetica','bold');
  doc.setFontSize(11);
  doc.setTextColor(...C.red);
  doc.text('NOTRE HISTOIRE', ML, ay);
  ay += 7;

  const aboutTexts = [
    "LEBTEX est née de la passion pour le textile et la mercerie. Fondée à Casablanca, notre entreprise s'est donnée pour mission de rendre accessibles les meilleurs accessoires de couture à tous les professionnels et amateurs du Maroc.",
    "Nous travaillons directement avec des fournisseurs de renommée internationale pour vous proposer des fermetures éclair, boutons, élastiques, rubans et bien plus encore — à des prix compétitifs, sans compromis sur la qualité.",
    "Aujourd'hui, LEBTEX livre dans tout le Maroc et accompagne des centaines de couturiers, stylistes, ateliers et entreprises textiles dans leur activité quotidienne.",
  ];

  doc.setFont('helvetica','normal');
  doc.setFontSize(8);
  doc.setTextColor(...C.dark);
  for (const txt of aboutTexts) {
    const lines = doc.splitTextToSize(txt, CW);
    doc.text(lines, ML, ay);
    ay += lines.length * 4 + 4;
  }

  ay += 4;

  // Values
  doc.setFont('helvetica','bold');
  doc.setFontSize(11);
  doc.setTextColor(...C.red);
  doc.text('NOS VALEURS', ML, ay);
  ay += 8;

  const values = [
    { title: 'Qualité avant tout', desc: 'Chaque produit est soigneusement sélectionné auprès de fournisseurs certifiés pour garantir la meilleure qualité.' },
    { title: 'Réactivité', desc: "Commandes traitées le jour même, équipe disponible 7j/7 sur WhatsApp pour répondre à toutes vos questions." },
    { title: 'Prix compétitifs', desc: "Meilleurs prix du marché grâce à nos partenariats directs avec les fabricants. Semi-gros et détail." },
    { title: 'Partenariat durable', desc: "Nous construisons des relations durables avec nos clients. Votre satisfaction est notre priorité absolue." },
  ];

  const valHW = (CW - 6) / 2;
  for (let vi = 0; vi < values.length; vi++) {
    const col = vi % 2;
    if (col === 0 && vi > 0) ay += 24;
    const vx = ML + col * (valHW + 6);
    // Box
    doc.setFillColor(...C.cream);
    doc.setDrawColor(...C.silk);
    doc.setLineWidth(0.2);
    doc.roundedRect(vx, ay, valHW, 22, 2, 2, 'FD');
    doc.setFillColor(...C.red);
    doc.rect(vx, ay+1, 2, 20, 'F');
    doc.setFont('helvetica','bold');
    doc.setFontSize(8);
    doc.setTextColor(...C.black);
    doc.text(values[vi].title, vx+5, ay+6);
    doc.setFont('helvetica','normal');
    doc.setFontSize(6.5);
    doc.setTextColor(...C.gray);
    const vl = doc.splitTextToSize(values[vi].desc, valHW-8);
    doc.text(vl.slice(0,3), vx+5, ay+11);
  }
  ay += 28;

  // Stores
  doc.setFont('helvetica','bold');
  doc.setFontSize(11);
  doc.setTextColor(...C.red);
  doc.text('NOS MAGASINS À CASABLANCA', ML, ay);
  ay += 8;

  const stores = [
    { name: 'Boulevard Haïfa', badge: 'Magasin Principal', spec: 'Tous les produits · Spécialiste fermetures & mercerie', addr: 'Boulevard Haïfa, Casablanca', hours: 'Lun–Sam : 8h30–18h30', stats: '5 000+ références · 15+ ans · 2 000+ clients', photo: '/boutiques/haifa-1.jpg' },
    { name: 'Derb Omar', badge: 'Vente Détail & Gros', spec: 'Détail & Semi-gros · Fils, rubans, accessoires couture', addr: 'Derb Omar, Casablanca', hours: 'Lun–Sam : 8h30–18h30', stats: 'Vente détail & gros · 1 000+ fils & rubans', photo: '/boutiques/derb-omar-1.webp' },
  ];

  for (const st of stores) {
    if (ay > PH - 55) { drawFooter(doc, dateStr); doc.addPage(); band(doc, C.red); ay = 12; }
    const stH = 38;
    const photoW = 40;
    doc.setFillColor(...C.cream);
    doc.setDrawColor(...C.silk);
    doc.setLineWidth(0.2);
    doc.roundedRect(ML, ay, CW, stH, 2, 2, 'FD');

    // Store photo
    const sPhoto = storePhotos[st.photo];
    if (sPhoto) {
      try {
        doc.addImage(sPhoto, 'JPEG', ML+2, ay+2, photoW-4, stH-4, `store-${st.name}`, 'FAST');
        doc.setDrawColor(...C.silk);
        doc.setLineWidth(0.3);
        doc.roundedRect(ML+2, ay+2, photoW-4, stH-4, 2, 2, 'S');
      } catch {}
    } else {
      doc.setFillColor(...C.lgray);
      doc.roundedRect(ML+2, ay+2, photoW-4, stH-4, 2, 2, 'F');
      doc.setFont('helvetica','normal');
      doc.setFontSize(6);
      doc.setTextColor(...C.gray);
      doc.text('Photo', ML+2+(photoW-4)/2, ay+stH/2, { align:'center' });
    }

    const infoX = ML + photoW + 2;
    // Badge
    doc.setFillColor(...C.red);
    const bw = doc.getTextWidth(st.badge)+8;
    doc.roundedRect(infoX, ay+3, bw, 6, 2, 2, 'F');
    doc.setFont('helvetica','bold');
    doc.setFontSize(5.5);
    doc.setTextColor(...C.white);
    doc.text(st.badge, infoX+4, ay+7);
    // Name
    doc.setFont('helvetica','bold');
    doc.setFontSize(11);
    doc.setTextColor(...C.black);
    doc.text(st.name, infoX, ay+16);
    // Spec
    doc.setFont('helvetica','normal');
    doc.setFontSize(6.5);
    doc.setTextColor(...C.gray);
    doc.text(st.spec, infoX, ay+21);
    // Info
    doc.setFont('helvetica','normal');
    doc.setFontSize(6.5);
    doc.setTextColor(...C.dark);
    doc.text(`${st.addr}  ·  ${st.hours}  ·  +212 760 998 347`, infoX, ay+27);
    doc.setFont('helvetica','italic');
    doc.setFontSize(6);
    doc.setTextColor(...C.gray);
    doc.text(st.stats, infoX, ay+32);
    ay += stH + 4;
  }

  drawFooter(doc, dateStr);
  onProgress?.(8, 'Page À propos créée…');

  // ══════════════════════════════════════════════════════
  // PAGE — SERVICE IMPORT & PRÉCOMMANDES
  // ══════════════════════════════════════════════════════
  doc.addPage();
  band(doc, C.gold);

  doc.setFont('helvetica','bold');
  doc.setFontSize(6.5);
  doc.setTextColor(...C.gold);
  doc.text('SERVICE PROFESSIONNEL B2B', ML, 14);
  doc.setFont('helvetica','bold');
  doc.setFontSize(20);
  doc.setTextColor(...C.black);
  doc.text("Service Import & Précommandes", ML, 24);
  doc.setFont('helvetica','normal');
  doc.setFontSize(8);
  doc.setTextColor(...C.gray);
  const impSub = doc.splitTextToSize("Optimisez vos coûts de production grâce à notre service d'import direct de Chine. Commandez nos produits ou des accessoires sur mesure en grande quantité et profitez de tarifs défiant toute concurrence locale.", CW);
  doc.text(impSub, ML, 31);
  doc.setDrawColor(...C.gold);
  doc.setLineWidth(0.7);
  doc.line(ML, 42, ML+30, 42);

  let iy = 50;

  // Features
  doc.setFont('helvetica','bold');
  doc.setFontSize(11);
  doc.setTextColor(...C.gold);
  doc.text('POURQUOI CHOISIR NOTRE SERVICE ?', ML, iy);
  iy += 9;

  const impFeats = [
    { title: "Tarifs Directs d'Usine", desc: "En commandant directement de Chine, vous bénéficiez de nos prix d'importateur, imbattables sur le marché local.", col: C.red },
    { title: 'Sourcing Sur Mesure', desc: "Au-delà de nos produits standards, nous pouvons sourcer et importer n'importe quel accessoire de mercerie spécifique à vos besoins.", col: C.gold },
    { title: 'App de Suivi Exclusive', desc: "Dès que votre commande est validée, accédez à une application dédiée pour suivre la fabrication et l'acheminement en temps réel.", col: C.dark },
    { title: 'Qualité Garantie', desc: "Nous contrôlons la qualité directement à la source. Vous recevez exactement ce que vous avez commandé, sans mauvaises surprises.", col: [16,185,129] as [number,number,number] },
  ];

  for (let fi = 0; fi < impFeats.length; fi++) {
    const col = fi % 2;
    if (col === 0 && fi > 0) iy += 30;
    const fx = ML + col * (valHW + 6);
    doc.setFillColor(...C.cream);
    doc.setDrawColor(...C.silk);
    doc.setLineWidth(0.2);
    doc.roundedRect(fx, iy, valHW, 28, 2, 2, 'FD');
    doc.setFillColor(...impFeats[fi].col);
    doc.roundedRect(fx, iy, 2.5, 28, 2, 2, 'F');
    doc.rect(fx+1.2, iy, 1.3, 28, 'F');
    doc.setFont('helvetica','bold');
    doc.setFontSize(8.5);
    doc.setTextColor(...C.black);
    doc.text(impFeats[fi].title, fx+6, iy+7);
    doc.setFont('helvetica','normal');
    doc.setFontSize(6.5);
    doc.setTextColor(...C.gray);
    const fl = doc.splitTextToSize(impFeats[fi].desc, valHW-10);
    doc.text(fl.slice(0,4), fx+6, iy+12);
  }
  iy += 35;

  // App tracking section
  doc.setFillColor(...C.cream);
  doc.setDrawColor(...C.silk);
  doc.setLineWidth(0.2);
  doc.roundedRect(ML, iy, CW, 75, 3, 3, 'FD');
  
  doc.setFillColor(...C.gold);
  const tagText = 'Application LEBTEX Client';
  doc.roundedRect(ML+4, iy+4, doc.getTextWidth(tagText)+8, 6, 2, 2, 'F');
  doc.setFont('helvetica','bold');
  doc.setFontSize(5.5);
  doc.setTextColor(...C.white);
  doc.text(tagText, ML+8, iy+8.2);
  
  doc.setFont('helvetica','bold');
  doc.setFontSize(12);
  doc.setTextColor(...C.black);
  doc.text('Votre commande B2B dans le creux de votre main.', ML+4, iy+18);
  
  doc.setFont('helvetica','normal');
  const appFeats = [
    'Suivi de la production en usine en temps réel',
    'Photos et vidéos de validation du contrôle qualité',
    'Statut du fret maritime et suivi douanier',
    'Date de livraison estimée à votre atelier/entrepôt'
  ];
  appFeats.forEach((f, i) => {
    doc.setFontSize(9);
    doc.setTextColor(...C.red);
    doc.text('✓', ML+4, iy+28+i*6.5);
    doc.setFontSize(7.5);
    doc.setTextColor(...C.dark);
    doc.text(f, ML+8, iy+27.5+i*6.5);
  });

  const appImg1 = storePhotos['/images/client-portal-login.png'];
  const appImg2 = storePhotos['/images/client-portal-dashboard.jpg'];
  
  if (appImg1) {
    doc.setDrawColor(...C.silk);
    doc.setLineWidth(0.3);
    doc.roundedRect(ML + CW - 92, iy + 7, 25, 52, 2, 2, 'S');
    safeImg(doc, appImg1, ML + CW - 92, iy + 7, 25, 52);
  }
  if (appImg2) {
    doc.setDrawColor(...C.silk);
    doc.setLineWidth(0.3);
    doc.roundedRect(ML + CW - 60, iy + 16, 55, 34, 2, 2, 'S');
    safeImg(doc, appImg2, ML + CW - 60, iy + 16, 55, 34);
  }

  iy += 85;

  drawFooter(doc, dateStr);
  onProgress?.(10, 'Pages info créées…');

  onProgress?.(12, 'Pages info créées…');

  // ═══════════════════════════════════════════════════
  // PAGE 2 — SOMMAIRE
  // ═══════════════════════════════════════════════════
  const categoryStartPages: Record<string, number> = {};
  const sommairePageNumTasks: { page: number; x: number; y: number; slug: string; accent: [number,number,number] }[] = [];
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
  const tableBody = sections.map((sec) => {
    const items = sec.subCategories?.length > 0 
      ? sec.subCategories.map(sc => sc.name)
      : sec.products.map(p => p.catalogueName || p.name);
      
    return [
      { content: sec.category.name, styles: { fontStyle: 'bold', textColor: C.black } },
      { content: items.join('  •  '), styles: { textColor: C.dark, fontSize: 7.5 } },
      { content: `${sec.products.length}`, styles: { halign: 'center' } },
      { content: '', styles: { halign: 'center' } }
    ];
  });

  autoTable(doc, {
    startY: 42,
    head: [['Catégorie', 'Contenu (Sous-catégories / Produits)', 'Qté', 'Page']],
    body: tableBody,
    theme: 'grid',
    headStyles: { fillColor: C.red, textColor: C.white, fontStyle: 'bold', halign: 'center', fontSize: 9 },
    columnStyles: {
      0: { cellWidth: 45, valign: 'middle' },
      1: { cellWidth: 'auto', valign: 'middle' },
      2: { cellWidth: 12, halign: 'center', valign: 'middle' },
      3: { cellWidth: 15, halign: 'center', valign: 'middle' }
    },
    alternateRowStyles: { fillColor: [250, 248, 245] },
    styles: { font: 'helvetica', fontSize: 8, cellPadding: 4, lineColor: C.silk, lineWidth: 0.1 },
    margin: { left: ML, right: MR, top: 25, bottom: 25 },
    didDrawPage: (data) => {
      drawFooter(doc, dateStr);
      band(doc, C.red);
    },
    didDrawCell: (data) => {
      if (data.section === 'body' && data.column.index === 3) {
        const slug = sections[data.row.index].category.slug;
        const accent = sections[data.row.index].category.color ? hexRgb(sections[data.row.index].category.color) : C.red;
        sommairePageNumTasks.push({
          page: doc.internal.getNumberOfPages(),
          x: data.cell.x + data.cell.width / 2,
          y: data.cell.y + data.cell.height / 2 + 1.2,
          slug: slug,
          accent: accent
        });
      }
    }
  });

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
    categoryStartPages[cat.slug] = _pg + 1;
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
        doc.text((p.catalogueName || p.name).charAt(0).toUpperCase(), IX + IMG_W/2, IY + IMG_H/2 + 5, { align:'center' });
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
      const nameLines = doc.splitTextToSize(clip(p.catalogueName || p.name, 50), RW);
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

    for (const p of richProds) {
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
      doc.text(clip(p.catalogueName || p.name, 85), ML+5, dy+6.8);
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
        ['Conditionnement unitaire', (p as any).conditionnementUnitaire||''],
        ['Conditionnement gros', (p as any).conditionnementGros||''],
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
      
      drawFooter(doc, dateStr);
    }
  }

  onProgress?.(93, 'Page de contact…');

  // ═══════════════════════════════════════════════════
  // LAST PAGE — CONTACT (fond blanc + vrai logo)
  // ═══════════════════════════════════════════════════
  doc.addPage();

  // White background
  doc.setFillColor(...C.white);
  doc.rect(0, 0, PW, PH, 'F');

  // Top accent line
  doc.setFillColor(...C.red);
  doc.rect(0, 0, PW, 3, 'F');

  // Real logo
  try {
    const lW2 = 90, lH2 = 40;
    doc.addImage(LOGO_B64, 'PNG', PW/2 - lW2/2, 45, lW2, lH2, undefined, 'FAST');
  } catch {}

  // Red divider
  doc.setDrawColor(...C.red);
  doc.setLineWidth(1);
  doc.line(PW/2 - 25, 95, PW/2 + 25, 95);

  // Title
  doc.setFont('helvetica','bold');
  doc.setFontSize(24);
  doc.setTextColor(...C.black);
  doc.text("Besoin d'informations ?", PW/2, 112, { align:'center' });
  doc.setFont('helvetica','normal');
  doc.setFontSize(9);
  doc.setTextColor(...C.gray);
  doc.text('Contactez-nous pour les tarifs, quantités et conditions.', PW/2, 120, { align:'center' });

  // WhatsApp CTA
  doc.setFillColor(37, 211, 102);
  doc.roundedRect(PW/2-55, 135, 110, 15, 7, 7, 'F');
  doc.setFont('helvetica','bold');
  doc.setFontSize(10);
  doc.setTextColor(...C.white);
  doc.text('Demander les prix — WhatsApp', PW/2, 145, { align:'center' });

  // Contact info boxes
  const lastContacts = [
    { label: 'WhatsApp / Téléphone', value: '+212 760 998 347', col: C.red },
    { label: 'Email', value: 'lebtexsarlau@gmail.com', col: [59,130,246] as [number,number,number] },
    { label: 'Site Web', value: 'lebtex.ma', col: C.gold },
  ];
  const lcW = 50, lcGap = 6;
  const lcTot = lastContacts.length * lcW + (lastContacts.length-1) * lcGap;
  const lcSX = PW/2 - lcTot/2;

  lastContacts.forEach((c, i) => {
    const cx = lcSX + i*(lcW+lcGap), cyy = 165;
    doc.setFillColor(...C.cream);
    doc.setDrawColor(...C.silk);
    doc.setLineWidth(0.2);
    doc.roundedRect(cx, cyy, lcW, 20, 2, 2, 'FD');
    doc.setFillColor(...c.col);
    doc.roundedRect(cx + lcW/2 - 6, cyy - 1, 12, 2.5, 1, 1, 'F');
    doc.setFont('helvetica','normal');
    doc.setFontSize(5.5);
    doc.setTextColor(...C.gray);
    doc.text(c.label, cx + lcW/2, cyy + 7, { align:'center' });
    doc.setFont('helvetica','bold');
    doc.setFontSize(7.5);
    doc.setTextColor(...C.black);
    doc.text(c.value, cx + lcW/2, cyy + 14, { align:'center' });
  });

  // Stores
  doc.setFont('helvetica','bold');
  doc.setFontSize(9);
  doc.setTextColor(...C.dark);
  doc.text('Nos magasins à Casablanca', PW/2, 200, { align:'center' });
  doc.setFont('helvetica','normal');
  doc.setFontSize(7);
  doc.setTextColor(...C.gray);
  doc.text('📍 Boulevard Haïfa  ·  📍 Derb Omar  ·  📍 Bureau B2B: Hay Chrifa', PW/2, 207, { align:'center' });
  doc.text('Lun–Sam : 8h30–18h30', PW/2, 213, { align:'center' });

  // Bottom
  doc.setDrawColor(...C.silk);
  doc.setLineWidth(0.3);
  doc.line(ML, PH-30, PW-MR, PH-30);
  // ═══════════════════════════════════════════════════
  // DRAW PAGE NUMBERS IN SOMMAIRE (TWO-PASS)
  // ═══════════════════════════════════════════════════
  for (const task of sommairePageNumTasks) {
    doc.setPage(task.page);
    const startPg = categoryStartPages[task.slug];
    if (startPg) {
      doc.setFont('helvetica','bold');
      doc.setFontSize(11);
      doc.setTextColor(...task.accent);
      doc.text(`p. ${startPg}`, task.x, task.y, { align:'right' });
    }
  }

  // Go back to the last page so adding new pages later wouldn't break, though we are done.
  doc.setPage(doc.internal.getNumberOfPages());

  doc.setFont('helvetica','normal');
  doc.setFontSize(6.5);
  doc.setTextColor(...C.lgray);
  doc.text(`© ${year} LEBTEX — Tous droits réservés`, PW/2, PH-20, { align:'center' });

  onProgress?.(100, 'Téléchargement…');

  const fname = `LEBTEX_Catalogue_${year}-${String(now.getMonth()+1).padStart(2,'0')}-${String(now.getDate()).padStart(2,'0')}.pdf`;
  doc.save(fname);
  return fname;
}
