import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';

const fmt = (n: number) => n.toLocaleString('fr-MA', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

interface PDFReportOptions {
  title: string;
  subtitle?: string;
  columns: { header: string; dataKey: string; width?: number }[];
  data: Record<string, any>[];
  footer?: string;
  landscape?: boolean;
  summaryRows?: { label: string; value: string }[];
}

/**
 * Génère et télécharge un rapport PDF avec en-tête LEBTEX, tableau et pied de page.
 */
export function exportReportPDF(options: PDFReportOptions) {
  const { title, subtitle, columns, data, footer, landscape = false, summaryRows } = options;

  if (data.length === 0) {
    alert('Aucune donnée à exporter.');
    return;
  }

  const doc = new jsPDF({ orientation: landscape ? 'landscape' : 'portrait', unit: 'mm', format: 'a4' });
  const pageWidth = doc.internal.pageSize.getWidth();

  // ── En-tête LEBTEX ──
  doc.setFillColor(28, 25, 23); // stone-900
  doc.rect(0, 0, pageWidth, 32, 'F');
  doc.setTextColor(255, 255, 255);
  doc.setFontSize(18);
  doc.setFont('helvetica', 'bold');
  doc.text('LEBTEX', 14, 15);
  doc.setFontSize(8);
  doc.setTextColor(168, 162, 158); // stone-400
  doc.text('Mercerie, fils à coudre, fermetures à glissière', 14, 22);
  doc.setFontSize(7);
  doc.text(`Généré le ${new Date().toLocaleDateString('fr-FR')} à ${new Date().toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}`, pageWidth - 14, 15, { align: 'right' });

  // ── Titre du rapport ──
  doc.setTextColor(28, 25, 23);
  doc.setFontSize(14);
  doc.setFont('helvetica', 'bold');
  doc.text(title, 14, 44);
  if (subtitle) {
    doc.setFontSize(9);
    doc.setTextColor(120, 113, 108);
    doc.text(subtitle, 14, 51);
  }

  const startY = subtitle ? 56 : 50;

  // ── Tableau principal ──
  autoTable(doc, {
    startY,
    head: [columns.map(c => c.header)],
    body: data.map(row => columns.map(c => {
      const val = row[c.dataKey];
      return val != null ? String(val) : '';
    })),
    headStyles: {
      fillColor: [28, 25, 23],
      textColor: [255, 255, 255],
      fontStyle: 'bold',
      fontSize: 7,
      cellPadding: 3,
    },
    bodyStyles: {
      fontSize: 7,
      cellPadding: 2.5,
      textColor: [28, 25, 23],
    },
    alternateRowStyles: {
      fillColor: [250, 250, 249],
    },
    columnStyles: columns.reduce((acc, col, i) => {
      if (col.width) acc[i] = { cellWidth: col.width };
      return acc;
    }, {} as Record<number, any>),
    margin: { left: 14, right: 14 },
    didDrawPage: (hookData: any) => {
      // Numéro de page en pied
      const pageH = doc.internal.pageSize.getHeight();
      doc.setFontSize(7);
      doc.setTextColor(168, 162, 158);
      doc.text(`Page ${hookData.pageNumber}`, pageWidth / 2, pageH - 8, { align: 'center' });
    },
  });

  // ── Résumé ──
  if (summaryRows && summaryRows.length > 0) {
    const finalY = (doc as any).lastAutoTable?.finalY || startY + 20;
    let y = finalY + 10;
    doc.setFillColor(250, 250, 249);
    doc.roundedRect(14, y - 4, pageWidth - 28, summaryRows.length * 7 + 8, 3, 3, 'F');
    doc.setFontSize(8);
    summaryRows.forEach(row => {
      doc.setTextColor(120, 113, 108);
      doc.setFont('helvetica', 'normal');
      doc.text(row.label, 20, y + 2);
      doc.setTextColor(28, 25, 23);
      doc.setFont('helvetica', 'bold');
      doc.text(row.value, pageWidth - 20, y + 2, { align: 'right' });
      y += 7;
    });
  }

  // ── Footer ──
  if (footer) {
    const pageH = doc.internal.pageSize.getHeight();
    doc.setFontSize(6);
    doc.setTextColor(168, 162, 158);
    doc.text(footer, pageWidth / 2, pageH - 14, { align: 'center' });
  }

  // ── Télécharger ──
  const filename = `${title.replace(/\s+/g, '-').toLowerCase()}-${new Date().toISOString().split('T')[0]}.pdf`;
  doc.save(filename);
}

/**
 * Export des mouvements de stock en PDF
 */
export function exportMovementsPDF(movements: any[]) {
  exportReportPDF({
    title: 'Rapport des Mouvements de Stock',
    subtitle: `${movements.length} mouvements`,
    columns: [
      { header: 'Date', dataKey: 'date', width: 22 },
      { header: 'Type', dataKey: 'type', width: 18 },
      { header: 'Motif', dataKey: 'reason', width: 22 },
      { header: 'Produit', dataKey: 'productName' },
      { header: 'Couleur', dataKey: 'color', width: 20 },
      { header: 'Qté', dataKey: 'quantity', width: 15 },
      { header: 'Magasin', dataKey: 'storeId', width: 22 },
    ],
    data: movements.map(m => ({
      date: m.date || '',
      type: m.type === 'IN' ? 'Entrée' : m.type === 'OUT' ? 'Sortie' : 'Ajustement',
      reason: m.reason || '',
      productName: m.productName || '',
      color: m.color || '',
      quantity: m.quantity || 0,
      storeId: m.storeId || '',
    })),
    footer: 'LEBTEX SARL AU — Rapport généré automatiquement',
  });
}

/**
 * Export des factures en PDF
 */
export function exportInvoicesPDF(invoices: any[]) {
  const totalHT = invoices.reduce((s, i) => s + (i.totalAfterDiscount || 0), 0);
  const totalPaid = invoices.reduce((s, i) => s + (i.paidAmount || 0), 0);
  const totalDue = invoices.reduce((s, i) => s + (i.remainingBalance || 0), 0);

  exportReportPDF({
    title: 'Rapport des Factures',
    subtitle: `${invoices.length} factures`,
    landscape: true,
    columns: [
      { header: 'N° Facture', dataKey: 'num', width: 25 },
      { header: 'Date', dataKey: 'date', width: 22 },
      { header: 'Client', dataKey: 'client' },
      { header: 'Montant', dataKey: 'amount', width: 25 },
      { header: 'Payé', dataKey: 'paid', width: 25 },
      { header: 'Solde dû', dataKey: 'due', width: 25 },
      { header: 'Statut', dataKey: 'status', width: 20 },
    ],
    data: invoices.map(inv => ({
      num: inv.invoiceNumber || '',
      date: inv.date || '',
      client: inv.clientName || 'Anonyme',
      amount: `${fmt(inv.totalAfterDiscount || 0)} MAD`,
      paid: `${fmt(inv.paidAmount || 0)} MAD`,
      due: `${fmt(inv.remainingBalance || 0)} MAD`,
      status: inv.status || '',
    })),
    summaryRows: [
      { label: 'Total facturé', value: `${fmt(totalHT)} MAD` },
      { label: 'Total payé', value: `${fmt(totalPaid)} MAD` },
      { label: 'Total impayé', value: `${fmt(totalDue)} MAD` },
    ],
    footer: 'LEBTEX SARL AU — Rapport généré automatiquement',
  });
}

/**
 * Export du stock en PDF
 */
export function exportStockPDF(stockItems: any[]) {
  const totalValue = stockItems.reduce((s, i) => s + (i.totalValue || 0), 0);
  const totalQty = stockItems.reduce((s, i) => s + (i.currentQty || 0), 0);

  exportReportPDF({
    title: 'État du Stock',
    subtitle: `${stockItems.length} articles — ${new Date().toLocaleDateString('fr-FR')}`,
    landscape: true,
    columns: [
      { header: 'Produit', dataKey: 'name' },
      { header: 'Couleur', dataKey: 'color', width: 20 },
      { header: 'Taille', dataKey: 'size', width: 18 },
      { header: 'Qté', dataKey: 'qty', width: 15 },
      { header: 'Seuil', dataKey: 'min', width: 15 },
      { header: 'Prix achat', dataKey: 'cost', width: 22 },
      { header: 'Valeur', dataKey: 'value', width: 25 },
      { header: 'Prix vente', dataKey: 'sell', width: 22 },
    ],
    data: stockItems.map(item => ({
      name: item.productName || '',
      color: item.color || '',
      size: item.size || '',
      qty: item.currentQty || 0,
      min: item.minThreshold || '—',
      cost: `${fmt(item.purchasePricePerUnit || 0)}`,
      value: `${fmt(item.totalValue || 0)}`,
      sell: item.sellingPrice ? fmt(item.sellingPrice) : '—',
    })),
    summaryRows: [
      { label: 'Total articles', value: String(totalQty) },
      { label: 'Valeur totale du stock', value: `${fmt(totalValue)} MAD` },
    ],
    footer: 'LEBTEX SARL AU — Rapport généré automatiquement',
  });
}
