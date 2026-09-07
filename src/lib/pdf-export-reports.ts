import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import type { CheckRemittance } from '@/lib/types';

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
export function exportMovementsPDF(movements: any[], customTitle?: string, customSubtitle?: string) {
  const totalIN = movements.filter(m => m.type === 'IN').reduce((s, m) => s + (m.quantity || 0), 0);
  const totalOUT = movements.filter(m => m.type === 'OUT').reduce((s, m) => s + (m.quantity || 0), 0);
  const net = totalIN - totalOUT;

  exportReportPDF({
    title: customTitle || 'Rapport des Mouvements de Stock',
    subtitle: customSubtitle || `${movements.length} mouvement${movements.length > 1 ? 's' : ''} enregistré${movements.length > 1 ? 's' : ''}`,
    landscape: true,
    columns: [
      { header: 'Date', dataKey: 'date', width: 22 },
      { header: 'Type', dataKey: 'type', width: 18 },
      { header: 'Motif', dataKey: 'reason', width: 22 },
      { header: 'Produit', dataKey: 'productName' },
      { header: 'Couleur', dataKey: 'color', width: 20 },
      { header: 'Qté', dataKey: 'quantity', width: 15 },
      { header: 'Magasin / Dépôt', dataKey: 'storeId', width: 25 },
      { header: 'Notes / Réf', dataKey: 'notes' },
    ],
    data: movements.map(m => ({
      date: m.date || '',
      type: m.type === 'IN' ? 'Entrée' : m.type === 'OUT' ? 'Sortie' : 'Ajustement',
      reason: m.reason || '',
      productName: m.productName || '',
      color: m.color || '',
      quantity: m.quantity || 0,
      storeId: m.storeId || '',
      notes: m.notes || '',
    })),
    summaryRows: [
      { label: 'Total Entrées', value: `+${totalIN.toLocaleString('fr-MA')} pcs` },
      { label: 'Total Sorties', value: `-${totalOUT.toLocaleString('fr-MA')} pcs` },
      { label: 'Flux Net Global', value: `${net >= 0 ? '+' : ''}${net.toLocaleString('fr-MA')} pcs` },
    ],
    footer: 'LEBTEX SARL AU — Traçabilité des Mouvements & Bilan Hebdomadaire',
  });
}

/**
 * Export Portefeuille Chèques, Traites & Impayés en PDF
 */
export function exportChequesPDF(payments: any[], stats?: any) {
  const impayes = payments.filter(p => p.status === 'REJECTED');
  const pending = payments.filter(p => !p.status || p.status === 'PENDING');
  const cleared = payments.filter(p => p.status === 'CLEARED');

  const impayesSum = impayes.reduce((s, p) => s + (p.amount || 0), 0);
  const pendingSum = pending.reduce((s, p) => s + (p.amount || 0), 0);
  const clearedSum = cleared.reduce((s, p) => s + (p.amount || 0), 0);

  exportReportPDF({
    title: 'Portefeuille Chèques & Effets / Impayés',
    subtitle: `${payments.length} titre(s) — Bilan de trésorerie au ${new Date().toLocaleDateString('fr-FR')}`,
    landscape: true,
    columns: [
      { header: 'Type', dataKey: 'type', width: 22 },
      { header: 'N° Titre / Effet', dataKey: 'ref', width: 28 },
      { header: 'Client / Émetteur', dataKey: 'client' },
      { header: 'Banque', dataKey: 'bank', width: 25 },
      { header: 'Échéance', dataKey: 'dueDate', width: 22 },
      { header: 'Montant', dataKey: 'amount', width: 26 },
      { header: 'Statut', dataKey: 'status', width: 26 },
    ],
    data: payments.map(p => {
      let statusLabel = 'En portefeuille';
      if (p.status === 'REJECTED') statusLabel = '⚠️ IMPAYÉ / REJETÉ';
      else if (p.status === 'CLEARED') statusLabel = '✅ Encaissé';
      else if (p.dueDate && new Date(p.dueDate) < new Date()) statusLabel = '⏳ Échéance dépassée';

      return {
        type: p.method === 'TRAITE' ? 'LCN / Traite' : 'Chèque',
        ref: p.reference || p.checkNumber || '—',
        client: p.clientName || '—',
        bank: p.bankName || '—',
        dueDate: p.dueDate || '—',
        amount: `${(p.amount || 0).toLocaleString('fr-MA', { minimumFractionDigits: 2 })} MAD`,
        status: statusLabel,
      };
    }),
    summaryRows: [
      { label: `⚠️ Impayés Rejetés (${impayes.length} chèque${impayes.length > 1 ? 's' : ''})`, value: `${impayesSum.toLocaleString('fr-MA', { minimumFractionDigits: 2 })} MAD` },
      { label: `⏳ En Portefeuille (${pending.length} titre${pending.length > 1 ? 's' : ''})`, value: `${pendingSum.toLocaleString('fr-MA', { minimumFractionDigits: 2 })} MAD` },
      { label: `✅ Encaissés (${cleared.length} titre${cleared.length > 1 ? 's' : ''})`, value: `${clearedSum.toLocaleString('fr-MA', { minimumFractionDigits: 2 })} MAD` },
      { label: 'Total Global Portefeuille', value: `${(impayesSum + pendingSum + clearedSum).toLocaleString('fr-MA', { minimumFractionDigits: 2 })} MAD` },
    ],
    footer: 'LEBTEX SARL AU — Bilan Portefeuille Commercial & Recouvrement',
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

/**
 * Bilan Hebdomadaire des Ventes du Vendredi (Prix, MT, N° Bon, Mode de Règlement, À Crédit)
 */
export function exportFridaySalesPDF(invoices: any[], payments: any[] = [], periodLabel?: string) {
  const totalTTC = invoices.reduce((s, i) => s + (i.totalAfterDiscount || 0), 0);
  const totalPaid = invoices.reduce((s, i) => s + (i.paidAmount || 0), 0);
  const totalCredit = invoices.reduce((s, i) => s + (i.remainingBalance || 0), 0);

  // Indexation des règlements par invoiceId
  const paymentsByInvoice = new Map<string, any[]>();
  payments.forEach(p => {
    if (p.invoiceId) {
      if (!paymentsByInvoice.has(p.invoiceId)) paymentsByInvoice.set(p.invoiceId, []);
      paymentsByInvoice.get(p.invoiceId)!.push(p);
    }
  });

  exportReportPDF({
    title: 'Bilan Hebdomadaire des Ventes & Règlements (Point du Vendredi)',
    subtitle: periodLabel || `${invoices.length} bon(s) de commande — Semaine du ${new Date().toLocaleDateString('fr-FR')}`,
    landscape: true,
    columns: [
      { header: 'Date', dataKey: 'date', width: 20 },
      { header: 'N° Bon / Facture', dataKey: 'num', width: 25 },
      { header: 'Client', dataKey: 'client', width: 35 },
      { header: 'Articles & Prix Unit.', dataKey: 'articles' },
      { header: 'Montant (MT)', dataKey: 'total', width: 24 },
      { header: 'Payé', dataKey: 'paid', width: 24 },
      { header: 'Mode Règlement', dataKey: 'method', width: 32 },
      { header: 'Solde À Crédit', dataKey: 'credit', width: 24 },
      { header: 'Statut', dataKey: 'status', width: 24 },
    ],
    data: invoices.map(inv => {
      const invPays = paymentsByInvoice.get(inv.id) || [];
      let paymentMethods = invPays.map(p => {
        if (p.method === 'CHEQUE') return `Chq ${p.checkNumber || ''} (${fmt(p.amount)})`;
        if (p.method === 'EFFET' || p.method === 'LC' || p.method === 'LCN') return `LC (${fmt(p.amount)})`;
        if (p.method === 'CASH') return `Espèces (${fmt(p.amount)})`;
        if (p.method === 'VIREMENT') return `Virement (${fmt(p.amount)})`;
        return `${p.method} (${fmt(p.amount)})`;
      }).join(', ');

      if (!paymentMethods) {
        if (inv.paidAmount > 0) paymentMethods = inv.paymentMethod || 'Espèces / Réglé';
        else paymentMethods = 'À Crédit (0 DH versé)';
      }

      const articlesStr = (inv.items || []).map((it: any) => 
        `${it.productName}${it.color ? ` (${it.color})` : ''} : ${it.qty} x ${fmt(it.unitPrice)}`
      ).join(' | ');

      let statusStr = 'À Crédit';
      if (inv.status === 'PAID') statusStr = '✅ Réglé';
      else if (inv.status === 'PENDING') statusStr = '⏳ Chèque en attente';
      else if (inv.status === 'PARTIAL') statusStr = '⚠️ Partiel';
      else if (inv.remainingBalance > 0) statusStr = '🔴 À Crédit';

      return {
        date: inv.date || '',
        num: inv.invoiceNumber || '—',
        client: inv.clientName || 'Anonyme',
        articles: articlesStr || '—',
        total: `${fmt(inv.totalAfterDiscount || 0)} MAD`,
        paid: `${fmt(inv.paidAmount || 0)} MAD`,
        method: paymentMethods,
        credit: inv.remainingBalance > 0 ? `${fmt(inv.remainingBalance)} MAD` : '0,00 MAD',
        status: statusStr,
      };
    }),
    summaryRows: [
      { label: `Total Chiffre d'Affaires Hebdo (${invoices.length} bons)`, value: `${fmt(totalTTC)} MAD` },
      { label: 'Total Encaissé', value: `${fmt(totalPaid)} MAD` },
      { label: 'Total Restant À Crédit (Créances clients)', value: `${fmt(totalCredit)} MAD` },
    ],
    footer: 'LEBTEX SARL AU — Bilan Commercial Hebdomadaire des Ventes & Créances',
  });
}

/**
 * Export du Bon de Transfert inter-magasins / entrepôts
 */
export function exportTransferOrderPDF(order: any, stores: any[]) {
  const getStoreName = (id: string) => stores.find(s => s.id === id)?.name || id;
  const fromName = getStoreName(order.fromStore);
  const toName = getStoreName(order.toStore);
  const totalSentQty = (order.items || []).reduce((s: number, i: any) => s + (i.sentQty || 0), 0);
  const totalReceivedQty = (order.items || []).reduce((s: number, i: any) => s + (i.receivedQty || 0), 0);

  exportReportPDF({
    title: `Bon de Transfert Inter-Magasins N° BT-${(order.id || '').slice(0, 8).toUpperCase()}`,
    subtitle: `Trajet : ${fromName} ➔ ${toName} | Date : ${order.date ? new Date(order.date).toLocaleDateString('fr-FR') : new Date().toLocaleDateString('fr-FR')}`,
    columns: [
      { header: 'N°', dataKey: 'num', width: 12 },
      { header: 'Désignation Produit', dataKey: 'productName' },
      { header: 'Couleur', dataKey: 'color', width: 25 },
      { header: 'Taille', dataKey: 'size', width: 20 },
      { header: 'Unité', dataKey: 'unit', width: 20 },
      { header: 'Qté Expédiée', dataKey: 'sentQty', width: 25 },
      { header: 'Qté Reçue (Pointage)', dataKey: 'receivedQty', width: 32 },
    ],
    data: (order.items || []).map((item: any, idx: number) => ({
      num: String(idx + 1),
      productName: item.productName || '—',
      color: item.color || '—',
      size: item.size || '—',
      unit: item.unitOfMeasure || 'pcs',
      sentQty: String(item.sentQty || 0),
      receivedQty: item.receivedQty != null ? String(item.receivedQty) : '[      ]',
    })),
    summaryRows: [
      { label: 'Nombre de références transférées', value: `${(order.items || []).length} réf.` },
      { label: 'Total unités expédiées', value: `${totalSentQty} pcs` },
      ...(order.status === 'VALIDATED' ? [{ label: 'Total unités reçues et validées', value: `${totalReceivedQty} pcs` }] : []),
      { label: 'Statut du transfert', value: order.status === 'VALIDATED' ? '✅ VALIDÉ & EN STOCK' : '⏳ EN TRANSIT' },
    ],
    footer: 'LEBTEX SARL AU — Visa Expéditeur : [                    ]    Visa Chauffeur / Transporteur : [                    ]    Visa Réceptionnaire : [                    ]',
  });
}

/**
 * Convertit un montant numérique en dirhams toutes lettres en français
 */
function numberToWordsFR(n: number): string {
  const units = ['', 'un', 'deux', 'trois', 'quatre', 'cinq', 'six', 'sept', 'huit', 'neuf', 'dix', 'onze', 'douze', 'treize', 'quatorze', 'quinze', 'seize', 'dix-sept', 'dix-huit', 'dix-neuf'];
  const tens = ['', '', 'vingt', 'trente', 'quarante', 'cinquante', 'soixante', 'soixante', 'quatre-vingt', 'quatre-vingt'];

  const convertLessThanOneThousand = (num: number): string => {
    if (num === 0) return '';
    if (num < 20) return units[num];
    const t = Math.floor(num / 10);
    const u = num % 10;
    if (t === 7 || t === 9) {
      const base = t === 7 ? 'soixante' : 'quatre-vingt';
      return `${base}-${units[10 + u]}`;
    }
    if (t === 8 && u === 0) return 'quatre-vingts';
    if (u === 1 && t < 8) return `${tens[t]}-et-un`;
    return u === 0 ? tens[t] : `${tens[t]}-${units[u]}`;
  };

  const convertGroup = (num: number): string => {
    let result = '';
    const hundreds = Math.floor(num / 100);
    const rest = num % 100;
    if (hundreds > 0) {
      if (hundreds === 1) result += 'cent ';
      else result += `${units[hundreds]} cent${rest === 0 ? 's ' : ' '}`;
    }
    if (rest > 0) result += convertLessThanOneThousand(rest);
    return result.trim();
  };

  const intPart = Math.floor(n);
  const decPart = Math.round((n - intPart) * 100);

  if (intPart === 0) return 'ZÉRO DIRHAM';

  let res = '';
  const millions = Math.floor(intPart / 1000000);
  const thousands = Math.floor((intPart % 1000000) / 1000);
  const unitsPart = intPart % 1000;

  if (millions > 0) {
    res += millions === 1 ? 'un million ' : `${convertGroup(millions)} millions `;
  }
  if (thousands > 0) {
    res += thousands === 1 ? 'mille ' : `${convertGroup(thousands)} mille `;
  }
  if (unitsPart > 0) {
    res += convertGroup(unitsPart);
  }

  res = res.trim() + ' dirhams';
  if (decPart > 0) {
    res += ` et ${convertLessThanOneThousand(decPart)} centimes`;
  }
  return res.toUpperCase();
}

/**
 * Génère le Bordereau de Remise de Chèques & Effets en Banque Attijariwafa Bank
 */
export function exportCheckRemittancePDF(remittance: CheckRemittance) {
  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();

  // 1. Bandeau supérieur Attijariwafa Bank (Ambre / Or banques marocaines)
  doc.setFillColor(217, 119, 6); // amber-600
  doc.rect(0, 0, pageWidth, 28, 'F');

  doc.setTextColor(255, 255, 255);
  doc.setFontSize(16);
  doc.setFont('helvetica', 'bold');
  doc.text('ATTIJARIWAFA BANK', 14, 12);

  doc.setFontSize(8);
  doc.setFont('helvetica', 'normal');
  doc.text('BORDEREAU DE REMISE DE CHÈQUES & EFFETS DE COMMERCE', 14, 18);
  doc.text("Encaissement / Compensation Interbancaire", 14, 23);

  // Encart droit (Réf + Date)
  doc.setFontSize(8);
  doc.setFont('helvetica', 'bold');
  doc.text(`BORDEREAU N° : ${remittance.reference}`, pageWidth - 14, 12, { align: 'right' });
  doc.setFont('helvetica', 'normal');
  const dateFormatted = remittance.remittedAt 
    ? new Date(remittance.remittedAt).toLocaleDateString('fr-MA')
    : new Date().toLocaleDateString('fr-MA');
  doc.text(`Date de remise : ${dateFormatted}`, pageWidth - 14, 18, { align: 'right' });
  doc.text('Agence : Attijariwafa Bank Casablanca', pageWidth - 14, 23, { align: 'right' });

  // 2. Encart Déposant / Titulaire du compte
  doc.setFillColor(245, 245, 244); // stone-100
  doc.setDrawColor(214, 211, 209); // stone-300
  doc.roundedRect(14, 33, pageWidth - 28, 22, 2, 2, 'FD');

  const compTitle = remittance.company === 'LEBTEX' ? 'LEBTEX SARL AU' : 'ROBE IN BOX SARL';

  doc.setTextColor(28, 25, 23);
  doc.setFontSize(8);
  doc.setFont('helvetica', 'bold');
  doc.text('TITULAIRE DU COMPTE (REMETTANT) :', 18, 40);
  doc.setFontSize(11);
  doc.setTextColor(217, 119, 6); // amber-600
  doc.text(compTitle, 18, 46);
  doc.setFontSize(7);
  doc.setTextColor(120, 113, 108);
  doc.text('Société commerciale de confection & mercerie — Casablanca, Maroc', 18, 51);

  doc.setFontSize(8);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(28, 25, 23);
  doc.text('BANQUE DOMICILIATAIRE :', pageWidth / 2 + 10, 40);
  doc.setFontSize(10);
  doc.setTextColor(28, 25, 23);
  doc.text('ATTIJARIWAFA BANK', pageWidth / 2 + 10, 46);
  doc.setFontSize(7);
  doc.setTextColor(120, 113, 108);
  doc.text(`Compte ${remittance.company} · Crédit en compte`, pageWidth / 2 + 10, 51);

  // 3. Tableau des chèques
  const startY = 60;
  autoTable(doc, {
    startY,
    head: [['N°', 'N° Valeur (Chèque / LCN)', 'Tireur (Client)', 'Banque Tirée', 'Échéance', 'Montant MAD']],
    body: (remittance.items || []).map((item, idx) => [
      String(idx + 1),
      item.checkNumber || '—',
      item.clientName || '—',
      item.bankName || 'Attijariwafa Bank',
      item.dueDate || 'À vue',
      `${fmt(item.amount)} MAD`,
    ]),
    headStyles: {
      fillColor: [28, 25, 23], // stone-900
      textColor: [255, 255, 255],
      fontStyle: 'bold',
      fontSize: 8,
      cellPadding: 3.5,
    },
    bodyStyles: {
      fontSize: 8,
      cellPadding: 3,
      textColor: [28, 25, 23],
    },
    alternateRowStyles: {
      fillColor: [250, 250, 249],
    },
    columnStyles: {
      0: { cellWidth: 10, halign: 'center' },
      1: { cellWidth: 38, fontStyle: 'bold' },
      2: { cellWidth: 'auto' },
      3: { cellWidth: 35 },
      4: { cellWidth: 25, halign: 'center' },
      5: { cellWidth: 32, halign: 'right', fontStyle: 'bold' },
    },
    margin: { left: 14, right: 14 },
    foot: [[
      { content: `TOTAL GÉNÉRAL (${remittance.checkCount} valeurs remises) :`, colSpan: 5, styles: { halign: 'right', fontStyle: 'bold', fontSize: 8.5 } },
      { content: `${fmt(remittance.totalAmount)} MAD`, styles: { halign: 'right', fontStyle: 'bold', fontSize: 9.5, textColor: [217, 119, 6] } }
    ]],
    footStyles: {
      fillColor: [245, 245, 244],
      textColor: [28, 25, 23],
      cellPadding: 3.5,
    },
  });

  const finalY = (doc as any).lastAutoTable?.finalY || 120;

  // 4. Montant en toutes lettres
  let wordsY = finalY + 8;
  if (wordsY + 55 > pageHeight) {
    doc.addPage();
    wordsY = 20;
  }

  doc.setFillColor(254, 243, 199); // amber-100
  doc.setDrawColor(251, 191, 36); // amber-400
  doc.roundedRect(14, wordsY, pageWidth - 28, 14, 2, 2, 'FD');

  doc.setFontSize(7.5);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(146, 64, 14); // amber-800
  doc.text('MONTANT TOTAL DU BORDEREAU EN TOUTES LETTRES :', 18, wordsY + 5);
  doc.setFontSize(8);
  doc.setTextColor(120, 53, 15); // amber-900
  const wordsText = numberToWordsFR(remittance.totalAmount);
  doc.text(wordsText, 18, wordsY + 10);

  // 5. Cadres de signature (Remettant & Visa Banque)
  const signY = wordsY + 19;
  const boxWidth = (pageWidth - 28 - 8) / 2;
  const boxHeight = 36;

  // Cadre Émetteur
  doc.setDrawColor(214, 211, 209);
  doc.setFillColor(255, 255, 255);
  doc.roundedRect(14, signY, boxWidth, boxHeight, 2, 2, 'FD');
  doc.setFontSize(8);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(28, 25, 23);
  doc.text("Cachet & Signature de l'Émetteur (Déposant) :", 18, signY + 6);
  doc.setFontSize(7);
  doc.setFont('helvetica', 'italic');
  doc.setTextColor(120, 113, 108);
  doc.text(`Pour le compte de ${compTitle}`, 18, signY + 11);

  // Cadre Visa Banque
  doc.roundedRect(14 + boxWidth + 8, signY, boxWidth, boxHeight, 2, 2, 'FD');
  doc.setFontSize(8);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(28, 25, 23);
  doc.text("Accusé de Réception & Visa Guichetier :", 14 + boxWidth + 12, signY + 6);
  doc.setFontSize(7);
  doc.setFont('helvetica', 'italic');
  doc.setTextColor(120, 113, 108);
  doc.text("Attijariwafa Bank (Date, Cachet & Visa)", 14 + boxWidth + 12, signY + 11);

  // Pied de page
  doc.setFontSize(7);
  doc.setTextColor(168, 162, 158);
  doc.text(`Bordereau officiel de remise bancaire Attijariwafa Bank · Système LEBTEX ERP · Réf : ${remittance.reference}`, pageWidth / 2, pageHeight - 6, { align: 'center' });

  // Sauvegarder
  const cleanRef = (remittance.reference || 'REMISE').replace(/[^a-zA-Z0-9-_]/g, '_');
  doc.save(`Bordereau_Remise_${remittance.company}_${cleanRef}.pdf`);
}


