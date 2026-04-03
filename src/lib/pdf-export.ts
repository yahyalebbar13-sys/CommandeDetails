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
    ['Droits Payés', `${(facture.customsPaidDhs || 0).toLocaleString('fr-MA', { maximumFractionDigits: 2 })} MAD`],
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
  analysis: { tauxChange: number; mtFraisTotal: number; cbmTotal: number; exchange: number; transitaire: number; fraisSupp: number; fretMad: number }
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
    ['TOTAL FRAIS LOG.', `${analysis.mtFraisTotal.toLocaleString('fr-MA', { maximumFractionDigits: 0 })} MAD`],
  ];

  let bx = 14;
  const by = 37;
  const bw = (pageW - 28) / synBlocks.length;

  synBlocks.forEach(([label, value], i) => {
    const isLast = i === synBlocks.length - 1;
    if (isLast) {
      doc.setFillColor(251, 191, 36);
    } else {
      doc.setFillColor(245, 245, 244);
    }
    doc.roundedRect(bx, by, bw - 2, 16, 2, 2, 'F');
    doc.setTextColor(isLast ? 28 : 161, isLast ? 25 : 161, isLast ? 23 : 170);
    doc.setFontSize(6);
    doc.setFont('helvetica', 'bold');
    doc.text(label.toUpperCase(), bx + 3, by + 5);
    doc.setTextColor(28, 25, 23);
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
