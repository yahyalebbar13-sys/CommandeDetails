// export-proposition-pdf.ts
// Génère un PDF de demande de proposition à envoyer à un fournisseur

export async function exportPropositionFournisseurPDF(
  articles: any[],
  fournisseur: string,
  note: string
) {
  const { default: jsPDF } = await import('jspdf');
  const { default: autoTable } = await import('jspdf-autotable');

  // ── Palette ──
  const NAVY:        [number,number,number] = [15,  23,  42];
  const GOLD:        [number,number,number] = [196, 160, 98];
  const AMBER:       [number,number,number] = [245, 158, 11];
  const TEXT_MAIN:   [number,number,number] = [30,  41,  59];
  const TEXT_MUTED:  [number,number,number] = [100, 116, 139];
  const LIGHT_BG:    [number,number,number] = [248, 250, 252];
  const BORDER:      [number,number,number] = [226, 232, 240];
  const RED:         [number,number,number] = [220, 38,  38];
  const ORANGE:      [number,number,number] = [234, 88,  12];
  const STONE:       [number,number,number] = [120, 113, 108];

  const doc   = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
  const pageW = doc.internal.pageSize.getWidth();
  const pageH = doc.internal.pageSize.getHeight();
  const mX    = 14;
  const cW    = pageW - mX * 2;
  const todayIso = new Date().toISOString().slice(0, 10);
  const todayFr  = new Date().toLocaleDateString('fr-MA', {
    day: '2-digit', month: 'long', year: 'numeric'
  });

  let y = 14;

  // ── Logo ──
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

  // ── Titre à droite ──
  doc.setTextColor(...NAVY);
  doc.setFontSize(17);
  doc.setFont('helvetica', 'bold');
  doc.text('DEMANDE DE PROPOSITION', pageW - mX, y + 6, { align: 'right' });

  doc.setDrawColor(...GOLD);
  doc.setLineWidth(0.6);
  doc.line(pageW - mX - 80, y + 9, pageW - mX, y + 9);

  doc.setFontSize(8);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(...TEXT_MAIN);
  doc.text(`Date : ${todayFr}`, pageW - mX, y + 16, { align: 'right' });

  doc.setFont('helvetica', 'normal');
  doc.setTextColor(...TEXT_MUTED);
  doc.text('LEBTEX Textile Import — Usage confidentiel', pageW - mX, y + 21, { align: 'right' });

  y += 32;

  // ── Bloc destinataire ──
  doc.setFillColor(...NAVY);
  doc.roundedRect(mX, y, cW, 20, 2, 2, 'F');

  doc.setFontSize(7);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(...GOLD);
  doc.text('DESTINATAIRE — FOURNISSEUR', mX + 5, y + 7);

  doc.setFontSize(12);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(255, 255, 255);
  doc.text((fournisseur || 'N/A').toUpperCase(), mX + 5, y + 15);

  // Nb articles à droite
  doc.setFontSize(8);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(...GOLD);
  doc.text(`${articles.length} article${articles.length > 1 ? 's' : ''}`, pageW - mX - 5, y + 9, { align: 'right' });
  doc.setFontSize(7);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(180, 180, 180);
  doc.text('référencés dans ce document', pageW - mX - 5, y + 14, { align: 'right' });

  y += 26;

  // ── Note (si renseignée) ──
  if (note.trim()) {
    doc.setFillColor(...LIGHT_BG);
    doc.setDrawColor(...BORDER);
    doc.setLineWidth(0.3);
    // barre gauche amber
    doc.setFillColor(...AMBER);
    doc.rect(mX, y, 3, 18, 'F');
    doc.setFillColor(...LIGHT_BG);
    doc.setDrawColor(...BORDER);
    doc.roundedRect(mX + 3, y, cW - 3, 18, 1, 1, 'FD');

    doc.setFontSize(7);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(...AMBER);
    doc.text('REMARQUES', mX + 8, y + 6);

    doc.setFontSize(8);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(...TEXT_MAIN);
    const lines = doc.splitTextToSize(note.trim(), cW - 20);
    doc.text(lines.slice(0, 2), mX + 8, y + 12);

    y += 24;
  }

  // ── Intro ──
  doc.setFontSize(8.5);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(...TEXT_MUTED);
  const intro = `Madame, Monsieur,\n\nNous vous soumettons ci-dessous notre liste de besoins. Nous vous remercions de bien vouloir nous faire parvenir votre meilleure offre de prix pour chacun des articles référencés, avec délais de livraison et conditions de paiement.`;
  const introLines = doc.splitTextToSize(intro, cW);
  doc.text(introLines, mX, y);
  y += introLines.length * 5 + 4;

  // ── Tableau ──
  const priorityLabel = (p: string) => {
    if (p === 'urgent')    return '🔴 URGENT';
    if (p === 'important') return '🟠 IMPORTANT';
    return '⚪ À FAIRE';
  };

  const isZipper = (cat: string) => {
    const c = (cat || '').toUpperCase();
    return c.includes('ZIPPER') && !c.includes('LONG CHAIN') && !c.includes('SLIDER');
  };

  const tableRows = articles.map((o, idx) => {
    const specs = isZipper(o.categoryId)
      ? [o.zipperType, o.slider, o.sliderType].filter(Boolean).join(' / ')
      : (o.specs || '');
    return [
      String(idx + 1),
      (o.name || o.categoryId || '—').toUpperCase(),
      (o.categoryId || '—').toUpperCase(),
      o.size   ? o.size.toUpperCase()  : '—',
      o.color  ? o.color.toUpperCase() : '—',
      specs || '—',
      Number(o.quantity || 0).toLocaleString('fr-MA'),
      (o.unitOfMeasure || 'PCS').toUpperCase(),
      priorityLabel(o.priority || 'todo'),
    ];
  });

  autoTable(doc, {
    startY: y,
    head: [['#', 'Désignation', 'Catégorie', 'Taille', 'Couleur', 'Spécification', 'Quantité', 'Unité', 'Priorité']],
    body: tableRows,
    foot: [[
      '',
      { content: `TOTAL — ${articles.length} article${articles.length > 1 ? 's' : ''}`, colSpan: 5, styles: { halign: 'left' as const } },
      { content: articles.reduce((s, o) => s + Number(o.quantity || 0), 0).toLocaleString('fr-MA'), styles: { halign: 'right' as const, fontStyle: 'bold' as const } },
      '',
      '',
    ]],
    margin: { left: mX, right: mX, bottom: 50 },
    styles: {
      fontSize: 7.5,
      cellPadding: 3,
      font: 'helvetica',
      textColor: TEXT_MAIN,
      lineColor: BORDER,
      lineWidth: 0.2,
    },
    headStyles: {
      fillColor: NAVY,
      textColor: [255, 255, 255],
      fontSize: 7,
      fontStyle: 'bold',
      cellPadding: 3.5,
    },
    footStyles: {
      fillColor: NAVY,
      textColor: [255, 255, 255],
      fontStyle: 'bold',
      fontSize: 7.5,
    },
    alternateRowStyles: { fillColor: LIGHT_BG },
    columnStyles: {
      0: { cellWidth: 8,  halign: 'center', textColor: TEXT_MUTED },
      1: { cellWidth: 38, fontStyle: 'bold' },
      2: { cellWidth: 26 },
      3: { cellWidth: 14, halign: 'center' },
      4: { cellWidth: 18, halign: 'center' },
      5: { cellWidth: 'auto' },
      6: { cellWidth: 20, halign: 'right', fontStyle: 'bold' },
      7: { cellWidth: 12, halign: 'center' },
      8: { cellWidth: 22, halign: 'center' },
    },
    theme: 'striped',
    didParseCell: (data: any) => {
      if (data.section === 'body' && data.column.index === 8) {
        const raw = String(data.cell.raw || '');
        if (raw.includes('URGENT'))    data.cell.styles.textColor = RED;
        else if (raw.includes('IMPORTANT')) data.cell.styles.textColor = ORANGE;
        else                           data.cell.styles.textColor = STONE;
      }
    },
  });

  // ── Footer sur chaque page ──
  const finalY: number = (doc as any).lastAutoTable.finalY || y + 80;

  // ── Bloc clôture ──
  const closingY = Math.min(finalY + 8, pageH - 70);
  if (closingY < pageH - 55) {
    doc.setFontSize(8);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(...TEXT_MUTED);
    doc.text(
      'Dans l\'attente de votre retour, nous restons à votre disposition pour tout renseignement complémentaire.',
      mX, closingY
    );
    doc.text('Cordialement,', mX, closingY + 7);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(...NAVY);
    doc.text('LEBTEX Textile Import', mX, closingY + 13);
  }

  // Footer toutes pages
  const pageCount = (doc as any).internal.getNumberOfPages();
  for (let i = 1; i <= pageCount; i++) {
    doc.setPage(i);

    // Ligne séparatrice
    doc.setDrawColor(...BORDER);
    doc.setLineWidth(0.3);
    doc.line(mX, pageH - 28, pageW - mX, pageH - 28);

    doc.setFontSize(6.5);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(...TEXT_MUTED);
    doc.text('LEBTEX TEXTILE IMPORT — 31 Rue 65 Lotissement Al Hamd Ain-Chock, Casablanca, Maroc', pageW / 2, pageH - 24, { align: 'center' });
    doc.text('Tél : +212 522 25 77 78  /  +212 522 31 62 88  —  Email : Contact.lebtex@gmail.com', pageW / 2, pageH - 19, { align: 'center' });
    doc.text('Patente : 34011181  —  R.C : 704617  —  I.F : 68814237  —  ICE : 003823212000094', pageW / 2, pageH - 14, { align: 'center' });

    // Barre de bas de page
    doc.setFillColor(...NAVY);
    doc.rect(0, pageH - 10, pageW, 10, 'F');
    doc.setFillColor(...GOLD);
    doc.rect(0, pageH - 10, 4, 10, 'F');
    doc.setFontSize(7);
    doc.setTextColor(148, 163, 184);
    doc.text(`DEMANDE DE PROPOSITION — ${todayIso}  |  Confidentiel`, mX + 4, pageH - 4);
    doc.text(`Page ${i} / ${pageCount}`, pageW - mX, pageH - 4, { align: 'right' });
  }

  doc.save(`Proposition_${(fournisseur || 'Fournisseur').toUpperCase().replace(/\s+/g, '_')}_${todayIso}.pdf`);
}
