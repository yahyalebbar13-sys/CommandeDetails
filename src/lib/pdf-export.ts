// Utility functions for PDF export using jsPDF + jspdf-autotable
// Dynamically imported to avoid SSR issues

// ── Shared logo helper ─────────────────────────────────────────────────────
export async function addPdfLogoHeader(
  doc: any,
  x: number, y: number,
  w = 36, h = 18,
  invertToWhite = false
): Promise<void> {
  return new Promise<void>(resolve => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.src = '/logo.png';
    img.onload = () => {
      try { 
        if (invertToWhite) {
          const canvas = document.createElement('canvas');
          canvas.width = img.width;
          canvas.height = img.height;
          const ctx = canvas.getContext('2d');
          if (ctx) {
            ctx.drawImage(img, 0, 0);
            const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
            const data = imageData.data;
            for (let i = 0; i < data.length; i += 4) {
              const r = data[i], g = data[i + 1], b = data[i + 2];
              const brightness = (r + g + b) / 3;
              // Original alpha
              const alpha = data[i + 3] / 255;
              // New alpha: transparent if bright, opaque if dark
              const newAlpha = (255 - brightness) * alpha;
              
              data[i] = 255; // R
              data[i + 1] = 255; // G
              data[i + 2] = 255; // B
              data[i + 3] = newAlpha; // A
            }
            ctx.putImageData(imageData, 0, 0);
            doc.addImage(canvas.toDataURL('image/png'), 'PNG', x, y, w, h);
          } else {
            doc.addImage(img, 'PNG', x, y, w, h);
          }
        } else {
          doc.addImage(img, 'PNG', x, y, w, h); 
        }
      } catch (_) {}
      resolve();
    };
    img.onerror = () => {
      // Texte fallback si l'image ne charge pas
      doc.setTextColor(invertToWhite ? 255 : 15, invertToWhite ? 255 : 23, invertToWhite ? 255 : 42); 
      doc.setFontSize(16);
      doc.setFont('helvetica', 'bold');
      doc.text('LEBTEX', x, y + 8);
      doc.setFontSize(7);
      doc.setFont('helvetica', 'normal');
      doc.setTextColor(196, 160, 98);
      doc.text('TEXTILE IMPORT', x, y + 13);
      resolve();
    };
  });
}

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
    body: articles.map(a => [
      (a.name || '').toUpperCase(),
      a.size || '-',
      a.color || '-',
      a.specs || (a.zipperType ? `${a.zipperType} / ${a.slider || '-'} (${a.sliderType || '-'})` : '-'),
      (a.supplierId || '').toUpperCase(),
      Number(a.quantity).toLocaleString('fr-MA'),
      (a.unitOfMeasure || '').toUpperCase(),
      Number(a.cubicMeasurement || 0).toFixed(4),
      Number(a.netWeight || 0).toFixed(2),
      Number(a.purchasePricePerUnit || 0).toFixed(4),
      (Number(a.quantity) * Number(a.purchasePricePerUnit)).toLocaleString('fr-MA', { maximumFractionDigits: 2 }),
    ]),
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
      0: { cellWidth: 40, fontStyle: 'bold' },
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
      let articleName = (r.name || r.categoryId || '').toUpperCase();
      if (r.size && r.size !== 'various') {
        articleName += `\n(Taille: ${r.size})`;
      }
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
      0: { cellWidth: 38, fontStyle: 'bold' },
      1: { cellWidth: 22 },
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
  const tableRows = rows.map(r => [
    (r.categoryId || '—').toUpperCase(),
    r.size ? r.size.toUpperCase() : '—',
    r.color ? r.color.toUpperCase() : '—',
    (r.specs || (r.zipperType ? `${r.zipperType}${r.slider ? ' / ' + r.slider : ''}` : '') || r.name || '—').toUpperCase() || '—',
    Number(r.qty).toLocaleString('fr-MA'),
    (r.unitOfMeasure || 'U').toUpperCase(),
    r.pauTtc > 0
      ? r.pauTtc.toLocaleString('fr-MA', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
      : '—',
  ]);

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
      0: { fontStyle: 'bold', cellWidth: 28 },
      1: { cellWidth: 18, halign: 'center' },
      2: { cellWidth: 22, halign: 'center' },
      3: { fontStyle: 'bold', cellWidth: 'auto' },
      4: { halign: 'right', cellWidth: 20 },
      5: { halign: 'center', cellWidth: 16 },
      6: { halign: 'right', fontStyle: 'bold', textColor: EMERALD, cellWidth: 32 },
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
    head: [['Catégorie', 'Taille', 'Technique / Spécification', 'Couleur', 'Quantité', 'Unité', 'P.V.U TTC (MAD)']],
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
    return [
      (r.categoryId || '—').toUpperCase(),
      r.size && r.size !== 'various' ? r.size.toUpperCase() : '—',
      (r.name || r.categoryId || '—').toUpperCase(),
      qty.toLocaleString('fr-MA'),
      (r.unitOfMeasure || 'U').toUpperCase(),
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
      0: { fontStyle: 'bold', cellWidth: 32 },
      1: { cellWidth: 22, halign: 'center' },
      2: { fontStyle: 'bold' },
      3: { halign: 'right', cellWidth: 22 },
      4: { halign: 'center', cellWidth: 14 },
      5: { halign: 'right', fontStyle: 'bold', textColor: TEAL, cellWidth: 36 },
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
      let articleName = (r.name || r.categoryId || '').toUpperCase();
      if (r.size && r.size !== 'various') articleName += `\n(Taille: ${r.size})`;
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
      0: { cellWidth: 30, fontStyle: 'bold' },
      1: { cellWidth: 18 },
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
  const tableRows = articles.map((a, i) => [
    String(i + 1),
    (a.categoryId || a.name || "—").toUpperCase(),
    a.size && a.size !== "various" ? a.size.toUpperCase() : (a.sizeBreakdown?.length ? "MULTIPLE" : "—"),
    a.color && a.color !== "various" ? a.color.toUpperCase() : (a.colorBreakdown?.length ? "MULTIPLE" : "—"),
    `${Number(a.quantity).toLocaleString("fr-MA")} ${a.unitOfMeasure || "U"}`,
    a.arrivalDate ? a.arrivalDate : "—",
    a.status === "STOCK" ? "En Stock" : a.status === "CUSTOMS" ? "Dédouanement" : a.status === "TRANSIT" ? "En Transit" : a.status === "SHIPPED" ? "Expédié" : a.status === "PI" ? "En Prod." : "À Commander"
  ]);

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

  const colorLabel = (() => {
    const cb: any[] = Array.isArray(article.colorBreakdown) ? article.colorBreakdown : [];
    if (cb.length > 0) return `${cb.length} COULEUR(S)`;
    return (article.color && article.color !== 'various') ? article.color.toUpperCase() : '—';
  })();

  const specs: [string, string][] = [
    ['Désignation / Catégorie', (article.categoryId || '—').toUpperCase()],
    ['Taille',                  article.size && article.size !== 'various' ? article.size.toUpperCase() : 'DIVERSES'],
    ['Couleur',                 colorLabel],
    ['Quantité commandée',      fmtQty(article.quantity, article.unitOfMeasure)],
    ['Date de commande',        article.orderDate || todayStr],
  ];
  if (article.zipperType) {
    specs.push(['Type Fermeture', article.zipperType.toUpperCase()]);
    specs.push(['Curseur / Type', `${article.slider || '—'} / ${article.sliderType || '—'}`.toUpperCase()]);
  }
  if (article.specs) specs.push(['Notes Techniques', article.specs]);

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

  items.forEach(item => {
    const art = item.article;
    const comp = item.computed;
    const pu = comp.prixVenteUniteMad;
    const puNet = comp.prixRemiseUniteMad ?? pu; // after discount
    const remise = comp.remise ?? 0;
    const pt = comp.prixVenteTotalMad;
    const ptNet = comp.prixRemiseTotalMad ?? pt;
    totalAvantRemise += pt;
    totalRemiseMad += (pt - ptNet);
    totalDevisMad += ptNet;

    const colorBreakdown: any[] = Array.isArray(art.colorBreakdown) ? art.colorBreakdown : [];
    const sizeBreakdown:  any[] = Array.isArray(art.sizeBreakdown)  ? art.sizeBreakdown  : [];

    if (colorBreakdown.length > 0) {
      colorBreakdown.forEach((r: any) => {
        const qty = Number(r.rolls || 0);
        if (qty <= 0) return;
        const lineTotal = qty * puNet;
        const row: string[] = [
          String(index++),
          `${(art.categoryId || '—').toUpperCase()}${r.colorCode ? ' — ' + r.colorCode.toUpperCase() : ''}${r.description ? ' ' + r.description : ''}`,
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
          `${(art.categoryId || '—').toUpperCase()} — Taille ${(r.size || '—').toUpperCase()}`,
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
      const row: string[] = [
        String(index++),
        (art.name || art.categoryId || '—').toUpperCase(),
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

    // Specs row (size, color, specs, zipper)
    const specParts: string[] = [];
    if (a.size && a.size !== 'various') specParts.push(`Taille: ${a.size}`);
    if (a.color && a.color !== 'various') specParts.push(`Couleur: ${a.color}`);
    if (a.zipperType) specParts.push(`${a.zipperType}${a.slider ? ' / ' + a.slider : ''}`);
    if (!a.zipperType && a.specs) specParts.push(a.specs);
    if (a.supplierId) specParts.push(`Fourn.: ${a.supplierId}`);
    if (specParts.length > 0) {
      doc.setTextColor(...MUTED);
      doc.setFontSize(6.5);
      doc.setFont('helvetica', 'normal');
      doc.text(specParts.join('  ·  ').slice(0, 80), COL_LEFT, y + 20);
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
      tableBody.push([
        idx + 1,
        (row.categoryId || row.name || '—').toUpperCase(),
        row._variantsSummary || row.color || '—',
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

    const colorLabel = (() => {
      const cb: any[] = Array.isArray(article.colorBreakdown) ? article.colorBreakdown : [];
      if (cb.length > 0) return `${cb.length} COLOR(S)`;
      return (article.color && article.color !== "various") ? article.color.toUpperCase() : "—";
    })();

    const specs: [string,string][] = [
      ["Category / Product",  (article.categoryId || "—").toUpperCase()],
      ["Size",                article.size && article.size !== "various" ? article.size.toUpperCase() : "VARIOUS"],
      ["Color",               colorLabel],
      ["Quantity Ordered",    fmtQty(article.quantity, article.unitOfMeasure)],
      ["Base Unit Price",     article.purchasePricePerUnit ? `$${Number(article.purchasePricePerUnit).toFixed(4)}` : "—"],
      ["Total Value",         article.purchasePricePerUnit && article.quantity ? `$${(Number(article.purchasePricePerUnit) * Number(article.quantity)).toFixed(2)}` : "—"],
    ];

    const specCols = 2;
    const cellW = CW / specCols;
    const cellH = 10;
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

    if (colorBreakdown.length > 0) {
      let totalValue = 0;
      const rows = colorBreakdown.map((r: any, i: number) => {
        const rowPrice = (r.priceOverride !== '' && r.priceOverride !== undefined && r.priceOverride !== null) ? Number(r.priceOverride) : Number(article.purchasePricePerUnit || 0);
        const qty = Number(r.rolls) || 0;
        const rowTotal = qty * rowPrice;
        totalValue += rowTotal;
        return [
          String(i + 1),
          (r.color || r.colorCode || "—").toUpperCase(),
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
          (r.size || "—").toUpperCase(),
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
