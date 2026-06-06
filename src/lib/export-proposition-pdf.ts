// export-proposition-pdf.ts
// Two PDF types for supplier proposals (all text in English):
//  1. exportPropositionFournisseurPDF  — quantities only, no status/priority columns
//  2. exportPriceProposalPDF           — price columns for the supplier to fill in

// ══════════════════════════════════════════════════════════════════════════════
// PDF 1 — Supplier Proposal (quantities only, no statuses)
// ══════════════════════════════════════════════════════════════════════════════
export async function exportPropositionFournisseurPDF(
  articles: any[],
  fournisseur: string,
  note: string
) {
  const { default: jsPDF } = await import('jspdf');
  const { default: autoTable } = await import('jspdf-autotable');

  const NAVY:       [number,number,number] = [15,  23,  42];
  const GOLD:       [number,number,number] = [196, 160, 98];
  const AMBER:      [number,number,number] = [245, 158, 11];
  const TEXT_MAIN:  [number,number,number] = [30,  41,  59];
  const TEXT_MUTED: [number,number,number] = [100, 116, 139];
  const LIGHT_BG:   [number,number,number] = [248, 250, 252];
  const BORDER:     [number,number,number] = [226, 232, 240];

  const doc   = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
  const pageW = doc.internal.pageSize.getWidth();
  const pageH = doc.internal.pageSize.getHeight();
  const mX    = 14;
  const cW    = pageW - mX * 2;
  const todayIso = new Date().toISOString().slice(0, 10);
  const todayEn  = new Date().toLocaleDateString('en-GB', { day: '2-digit', month: 'long', year: 'numeric' });

  let y = 14;

  // Logo
  await new Promise<void>(resolve => {
    const img = new Image();
    img.src = '/logo.png';
    img.onload = () => { doc.addImage(img, 'PNG', mX, y, 50, 25); resolve(); };
    img.onerror = () => {
      doc.setTextColor(...NAVY);
      doc.setFontSize(20);
      doc.setFont('helvetica', 'bold');
      doc.text('LEBTEX', mX, y + 10);
      doc.setFontSize(8);
      doc.setFont('helvetica', 'normal');
      doc.setTextColor(...GOLD);
      doc.text('TEXTILE IMPORT', mX, y + 16);
      resolve();
    };
  });

  // Title
  doc.setTextColor(...NAVY);
  doc.setFontSize(17);
  doc.setFont('helvetica', 'bold');
  doc.text('PURCHASE PROPOSAL REQUEST', pageW - mX, y + 6, { align: 'right' });
  doc.setDrawColor(...GOLD);
  doc.setLineWidth(0.6);
  doc.line(pageW - mX - 90, y + 9, pageW - mX, y + 9);
  doc.setFontSize(8);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(...TEXT_MAIN);
  doc.text(`Date: ${todayEn}`, pageW - mX, y + 16, { align: 'right' });
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(...TEXT_MUTED);
  doc.text('LEBTEX Textile Import — Confidential', pageW - mX, y + 21, { align: 'right' });

  y += 32;

  // Recipient
  doc.setFillColor(...NAVY);
  doc.roundedRect(mX, y, cW, 20, 2, 2, 'F');
  doc.setFontSize(7);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(...GOLD);
  doc.text('RECIPIENT — SUPPLIER', mX + 5, y + 7);
  doc.setFontSize(12);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(255, 255, 255);
  doc.text((fournisseur || 'N/A').toUpperCase(), mX + 5, y + 15);
  doc.setFontSize(8);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(...GOLD);
  doc.text(`${articles.length} item${articles.length > 1 ? 's' : ''}`, pageW - mX - 5, y + 9, { align: 'right' });
  doc.setFontSize(7);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(180, 180, 180);
  doc.text('referenced in this document', pageW - mX - 5, y + 14, { align: 'right' });

  y += 26;

  // Note
  if (note.trim()) {
    doc.setFillColor(...AMBER);
    doc.rect(mX, y, 3, 18, 'F');
    doc.setFillColor(...LIGHT_BG);
    doc.setDrawColor(...BORDER);
    doc.setLineWidth(0.3);
    doc.roundedRect(mX + 3, y, cW - 3, 18, 1, 1, 'FD');
    doc.setFontSize(7);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(...AMBER);
    doc.text('REMARKS', mX + 8, y + 6);
    doc.setFontSize(8);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(...TEXT_MAIN);
    const lines = doc.splitTextToSize(note.trim(), cW - 20);
    doc.text(lines.slice(0, 2), mX + 8, y + 12);
    y += 24;
  }

  // Intro
  doc.setFontSize(8.5);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(...TEXT_MUTED);
  const intro = `Dear Sir / Madam,\n\nPlease find below our list of requirements. We kindly ask you to send us your best offer for each of the referenced items, including lead times and payment terms.`;
  const introLines = doc.splitTextToSize(intro, cW);
  doc.text(introLines, mX, y);
  y += introLines.length * 5 + 4;

  const isZipperCat = (cat: string) => {
    const c = (cat || '').toUpperCase();
    return c.includes('ZIPPER') && !c.includes('LONG CHAIN') && !c.includes('SLIDER');
  };

  // Table rows — quantities only, NO priority/status
  const tableRows = articles.map((o, idx) => {
    const specs = isZipperCat(o.categoryId)
      ? [o.zipperType, o.slider, o.sliderType].filter(Boolean).join(' / ')
      : (o.specs || '');
    return [
      String(idx + 1),
      (o.name || o.categoryId || '—').toUpperCase(),
      (o.categoryId || '—').toUpperCase(),
      o.size  ? o.size.toUpperCase()  : '—',
      o.color ? o.color.toUpperCase() : '—',
      specs || '—',
      Number(o.quantity || 0).toLocaleString('en-US'),
      (o.unitOfMeasure || 'PCS').toUpperCase(),
    ];
  });

  autoTable(doc, {
    startY: y,
    head: [['#', 'Description', 'Category', 'Size', 'Color', 'Specification', 'Quantity', 'Unit']],
    body: tableRows,
    foot: [[
      '',
      { content: `TOTAL — ${articles.length} item${articles.length > 1 ? 's' : ''}`, colSpan: 5, styles: { halign: 'left' as const } },
      { content: articles.reduce((s, o) => s + Number(o.quantity || 0), 0).toLocaleString('en-US'), styles: { halign: 'right' as const, fontStyle: 'bold' as const } },
      '',
    ]],
    margin: { left: mX, right: mX, bottom: 50 },
    styles: { fontSize: 7.5, cellPadding: 3, font: 'helvetica', textColor: TEXT_MAIN, lineColor: BORDER, lineWidth: 0.2 },
    headStyles: { fillColor: NAVY, textColor: [255, 255, 255], fontSize: 7, fontStyle: 'bold', cellPadding: 3.5 },
    footStyles: { fillColor: NAVY, textColor: [255, 255, 255], fontStyle: 'bold', fontSize: 7.5 },
    alternateRowStyles: { fillColor: LIGHT_BG },
    columnStyles: {
      0: { cellWidth: 8,  halign: 'center', textColor: TEXT_MUTED },
      1: { cellWidth: 40, fontStyle: 'bold' },
      2: { cellWidth: 28 },
      3: { cellWidth: 14, halign: 'center' },
      4: { cellWidth: 18, halign: 'center' },
      5: { cellWidth: 'auto' },
      6: { cellWidth: 20, halign: 'right', fontStyle: 'bold' },
      7: { cellWidth: 12, halign: 'center' },
    },
    theme: 'striped',
  });

  const finalY: number = (doc as any).lastAutoTable.finalY || y + 80;
  const closingY = Math.min(finalY + 8, pageH - 70);
  if (closingY < pageH - 55) {
    doc.setFontSize(8);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(...TEXT_MUTED);
    doc.text('We remain at your disposal for any additional information and look forward to your reply.', mX, closingY);
    doc.text('Best regards,', mX, closingY + 7);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(...NAVY);
    doc.text('LEBTEX Textile Import', mX, closingY + 13);
  }

  // Footer — all pages
  const pageCount = (doc as any).internal.getNumberOfPages();
  for (let i = 1; i <= pageCount; i++) {
    doc.setPage(i);
    doc.setDrawColor(...BORDER);
    doc.setLineWidth(0.3);
    doc.line(mX, pageH - 28, pageW - mX, pageH - 28);
    doc.setFontSize(6.5);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(...TEXT_MUTED);
    doc.text('LEBTEX TEXTILE IMPORT — 31 Rue 65 Lotissement Al Hamd Ain-Chock, Casablanca, Morocco', pageW / 2, pageH - 24, { align: 'center' });
    doc.text('Tel: +212 522 25 77 78  /  +212 522 31 62 88  —  Email: Contact.lebtex@gmail.com', pageW / 2, pageH - 19, { align: 'center' });
    doc.text('Patente: 34011181  —  R.C: 704617  —  I.F: 68814237  —  ICE: 003823212000094', pageW / 2, pageH - 14, { align: 'center' });
    doc.setFillColor(...NAVY);
    doc.rect(0, pageH - 10, pageW, 10, 'F');
    doc.setFillColor(...GOLD);
    doc.rect(0, pageH - 10, 4, 10, 'F');
    doc.setFontSize(7);
    doc.setTextColor(148, 163, 184);
    doc.text(`PURCHASE PROPOSAL REQUEST — ${todayIso}  |  Confidential`, mX + 4, pageH - 4);
    doc.text(`Page ${i} / ${pageCount}`, pageW - mX, pageH - 4, { align: 'right' });
  }

  doc.save(`Proposal_${(fournisseur || 'Supplier').toUpperCase().replace(/\s+/g, '_')}_${todayIso}.pdf`);
}

// ══════════════════════════════════════════════════════════════════════════════
// PDF 2 — Price Proposal (supplier fills in unit price + total)
// ══════════════════════════════════════════════════════════════════════════════
export async function exportPriceProposalPDF(
  articles: any[],
  fournisseur: string,
  note: string
) {
  const { default: jsPDF } = await import('jspdf');
  const { default: autoTable } = await import('jspdf-autotable');

  const NAVY:       [number,number,number] = [15,  23,  42];
  const GOLD:       [number,number,number] = [196, 160, 98];
  const AMBER:      [number,number,number] = [245, 158, 11];
  const TEXT_MAIN:  [number,number,number] = [30,  41,  59];
  const TEXT_MUTED: [number,number,number] = [100, 116, 139];
  const LIGHT_BG:   [number,number,number] = [248, 250, 252];
  const BORDER:     [number,number,number] = [226, 232, 240];
  const INDIGO:     [number,number,number] = [79,  70, 229];

  const doc   = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
  const pageW = doc.internal.pageSize.getWidth();
  const pageH = doc.internal.pageSize.getHeight();
  const mX    = 14;
  const cW    = pageW - mX * 2;
  const todayIso = new Date().toISOString().slice(0, 10);
  const todayEn  = new Date().toLocaleDateString('en-GB', { day: '2-digit', month: 'long', year: 'numeric' });

  let y = 14;

  // Logo
  await new Promise<void>(resolve => {
    const img = new Image();
    img.src = '/logo.png';
    img.onload = () => { doc.addImage(img, 'PNG', mX, y, 50, 25); resolve(); };
    img.onerror = () => {
      doc.setTextColor(...NAVY);
      doc.setFontSize(20);
      doc.setFont('helvetica', 'bold');
      doc.text('LEBTEX', mX, y + 10);
      doc.setFontSize(8);
      doc.setFont('helvetica', 'normal');
      doc.setTextColor(...GOLD);
      doc.text('TEXTILE IMPORT', mX, y + 16);
      resolve();
    };
  });

  // Title (indigo accent)
  doc.setTextColor(...INDIGO);
  doc.setFontSize(17);
  doc.setFont('helvetica', 'bold');
  doc.text('PRICE QUOTATION REQUEST', pageW - mX, y + 6, { align: 'right' });
  doc.setDrawColor(...INDIGO);
  doc.setLineWidth(0.6);
  doc.line(pageW - mX - 85, y + 9, pageW - mX, y + 9);
  doc.setFontSize(8);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(...TEXT_MAIN);
  doc.text(`Date: ${todayEn}`, pageW - mX, y + 16, { align: 'right' });
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(...TEXT_MUTED);
  doc.text('LEBTEX Textile Import — Confidential', pageW - mX, y + 21, { align: 'right' });

  y += 32;

  // Recipient
  doc.setFillColor(...INDIGO);
  doc.roundedRect(mX, y, cW, 20, 2, 2, 'F');
  doc.setFontSize(7);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(...GOLD);
  doc.text('RECIPIENT — SUPPLIER', mX + 5, y + 7);
  doc.setFontSize(12);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(255, 255, 255);
  doc.text((fournisseur || 'N/A').toUpperCase(), mX + 5, y + 15);
  doc.setFontSize(8);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(...GOLD);
  doc.text(`${articles.length} item${articles.length > 1 ? 's' : ''}`, pageW - mX - 5, y + 9, { align: 'right' });
  doc.setFontSize(7);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(180, 180, 180);
  doc.text('referenced in this document', pageW - mX - 5, y + 14, { align: 'right' });

  y += 26;

  // Note
  if (note.trim()) {
    doc.setFillColor(...AMBER);
    doc.rect(mX, y, 3, 18, 'F');
    doc.setFillColor(...LIGHT_BG);
    doc.setDrawColor(...BORDER);
    doc.setLineWidth(0.3);
    doc.roundedRect(mX + 3, y, cW - 3, 18, 1, 1, 'FD');
    doc.setFontSize(7);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(...AMBER);
    doc.text('REMARKS', mX + 8, y + 6);
    doc.setFontSize(8);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(...TEXT_MAIN);
    const lines = doc.splitTextToSize(note.trim(), cW - 20);
    doc.text(lines.slice(0, 2), mX + 8, y + 12);
    y += 24;
  }

  // Intro
  doc.setFontSize(8.5);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(...TEXT_MUTED);
  const intro = `Dear Sir / Madam,\n\nWe kindly ask you to provide us with your best unit prices for the items listed below. Please complete the "Unit Price" and "Total" columns and return this signed document at your earliest convenience.`;
  const introLines = doc.splitTextToSize(intro, cW);
  doc.text(introLines, mX, y);
  y += introLines.length * 5 + 4;

  const isZipperCat = (cat: string) => {
    const c = (cat || '').toUpperCase();
    return c.includes('ZIPPER') && !c.includes('LONG CHAIN') && !c.includes('SLIDER');
  };

  // Table rows with blank price columns
  const tableRows = articles.map((o, idx) => {
    const specs = isZipperCat(o.categoryId)
      ? [o.zipperType, o.slider, o.sliderType].filter(Boolean).join(' / ')
      : (o.specs || '');
    return [
      String(idx + 1),
      (o.name || o.categoryId || '—').toUpperCase(),
      (o.categoryId || '—').toUpperCase(),
      o.size  ? o.size.toUpperCase()  : '—',
      o.color ? o.color.toUpperCase() : '—',
      specs || '—',
      Number(o.quantity || 0).toLocaleString('en-US'),
      (o.unitOfMeasure || 'PCS').toUpperCase(),
      '',  // Unit Price — to be filled by supplier
      '',  // Total      — to be filled by supplier
    ];
  });

  autoTable(doc, {
    startY: y,
    head: [['#', 'Description', 'Category', 'Size', 'Color', 'Specification', 'Quantity', 'Unit', 'Unit Price', 'Total']],
    body: tableRows,
    foot: [[
      '',
      { content: `TOTAL — ${articles.length} item${articles.length > 1 ? 's' : ''}`, colSpan: 5, styles: { halign: 'left' as const } },
      { content: articles.reduce((s, o) => s + Number(o.quantity || 0), 0).toLocaleString('en-US'), styles: { halign: 'right' as const, fontStyle: 'bold' as const } },
      '',
      '',
      '',
    ]],
    margin: { left: mX, right: mX, bottom: 50 },
    styles: { fontSize: 7, cellPadding: 3, font: 'helvetica', textColor: TEXT_MAIN, lineColor: BORDER, lineWidth: 0.2 },
    headStyles: { fillColor: INDIGO, textColor: [255, 255, 255], fontSize: 6.5, fontStyle: 'bold', cellPadding: 3.5 },
    footStyles: { fillColor: NAVY, textColor: [255, 255, 255], fontStyle: 'bold', fontSize: 7.5 },
    alternateRowStyles: { fillColor: LIGHT_BG },
    columnStyles: {
      0: { cellWidth: 7,  halign: 'center', textColor: TEXT_MUTED },
      1: { cellWidth: 30, fontStyle: 'bold' },
      2: { cellWidth: 24 },
      3: { cellWidth: 11, halign: 'center' },
      4: { cellWidth: 15, halign: 'center' },
      5: { cellWidth: 'auto' },
      6: { cellWidth: 16, halign: 'right', fontStyle: 'bold' },
      7: { cellWidth: 10, halign: 'center' },
      8: { cellWidth: 20, halign: 'center' },
      9: { cellWidth: 20, halign: 'center' },
    },
    theme: 'striped',
    didParseCell: (data: any) => {
      // Price columns: light indigo background to stand out as "to fill"
      if (data.section === 'body' && (data.column.index === 8 || data.column.index === 9)) {
        data.cell.styles.fillColor = [239, 246, 255];
        data.cell.styles.lineColor = [165, 180, 252];
        data.cell.styles.lineWidth = 0.4;
      }
    },
  });

  const finalY: number = (doc as any).lastAutoTable.finalY || y + 80;

  // Signature block
  const sigY = Math.min(finalY + 10, pageH - 70);
  if (sigY < pageH - 55) {
    doc.setFontSize(8);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(...TEXT_MUTED);
    doc.text('Please complete and return this document to: Contact.lebtex@gmail.com', mX, sigY);

    const sigLineY = sigY + 18;
    doc.setFontSize(7.5);
    doc.text('Stamp & Supplier Signature:', mX, sigLineY);
    doc.setDrawColor(...BORDER);
    doc.setLineWidth(0.4);
    doc.line(mX + 58, sigLineY, pageW - mX, sigLineY);
    doc.text('Date: _____ / _____ / _____', pageW - mX, sigLineY + 8, { align: 'right' });
  }

  // Footer — all pages
  const pageCount = (doc as any).internal.getNumberOfPages();
  for (let i = 1; i <= pageCount; i++) {
    doc.setPage(i);
    doc.setDrawColor(...BORDER);
    doc.setLineWidth(0.3);
    doc.line(mX, pageH - 28, pageW - mX, pageH - 28);
    doc.setFontSize(6.5);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(...TEXT_MUTED);
    doc.text('LEBTEX TEXTILE IMPORT — 31 Rue 65 Lotissement Al Hamd Ain-Chock, Casablanca, Morocco', pageW / 2, pageH - 24, { align: 'center' });
    doc.text('Tel: +212 522 25 77 78  /  +212 522 31 62 88  —  Email: Contact.lebtex@gmail.com', pageW / 2, pageH - 19, { align: 'center' });
    doc.text('Patente: 34011181  —  R.C: 704617  —  I.F: 68814237  —  ICE: 003823212000094', pageW / 2, pageH - 14, { align: 'center' });
    doc.setFillColor(...NAVY);
    doc.rect(0, pageH - 10, pageW, 10, 'F');
    doc.setFillColor(...GOLD);
    doc.rect(0, pageH - 10, 4, 10, 'F');
    doc.setFontSize(7);
    doc.setTextColor(148, 163, 184);
    doc.text(`PRICE QUOTATION REQUEST — ${todayIso}  |  Confidential`, mX + 4, pageH - 4);
    doc.text(`Page ${i} / ${pageCount}`, pageW - mX, pageH - 4, { align: 'right' });
  }

  doc.save(`Price_Quotation_${(fournisseur || 'Supplier').toUpperCase().replace(/\s+/g, '_')}_${todayIso}.pdf`);
}
