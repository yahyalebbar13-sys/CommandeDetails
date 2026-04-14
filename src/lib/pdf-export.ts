// Utility functions for PDF export using jsPDF + jspdf-autotable
// Dynamically imported to avoid SSR issues

export async function exportFacturePDF(facture: any, articles: any[]) {
  const { default: jsPDF } = await import('jspdf');
  const { default: autoTable } = await import('jspdf-autotable');

  const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });
  const pageW = doc.internal.pageSize.getWidth();

  // ── Header ──
  doc.setFillColor(28, 25, 23); // stone-900
  doc.rect(0, 0, pageW, 32, 'F');

  doc.setTextColor(251, 191, 36); // amber-400
  doc.setFontSize(8);
  doc.setFont('helvetica', 'bold');
  doc.text('DOSSIER D\'ARRIVAGE OFFICIEL', 14, 10);

  doc.setTextColor(255, 255, 255);
  doc.setFontSize(20);
  doc.text(facture.id || '', 14, 22);

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
    doc.text(`Page ${i} / ${pageCount}  —  STOCKVUE LOGISTICS`, pageW / 2, doc.internal.pageSize.getHeight() - 6, { align: 'center' });
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

  doc.setTextColor(251, 191, 36);
  doc.setFontSize(8);
  doc.setFont('helvetica', 'bold');
  doc.text('COÛT DE REVIENT TTC — ANALYSE FINANCIÈRE', 14, 10);

  doc.setTextColor(255, 255, 255);
  doc.setFontSize(18);
  doc.text(`Dossier : ${facture.id || ''}`, 14, 22);

  doc.setFontSize(8);
  doc.setTextColor(161, 161, 170);
  doc.text(`ETA: ${facture.arrivalDate || '—'}   |   Fournisseur: ${facture.supplierId || '—'}   |   Taux de change: ${analysis.tauxChange > 0 ? analysis.tauxChange.toFixed(4) : '—'} MAD/$`, 14, 29);

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
    body: rows.map(r => [
      (r.name || '').toUpperCase(),
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
    ]),
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
    doc.text(`Page ${i} / ${pageCount}  —  STOCKVUE LOGISTICS`, pageW / 2, doc.internal.pageSize.getHeight() - 6, { align: 'center' });
  }

  doc.save(`CoutRevient_${facture.id || 'Dossier'}_${new Date().toISOString().split('T')[0]}.pdf`);
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
    doc.text(`Page ${i} / ${pageCount}  —  STOCKVUE LOGISTICS`, pageW / 2, doc.internal.pageSize.getHeight() - 6, { align: 'center' });
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
