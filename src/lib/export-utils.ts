import * as XLSX from 'xlsx';

type ExportFormat = 'csv' | 'xlsx';

interface ExportOptions {
  filename: string;
  sheetName?: string;
  format?: ExportFormat;
}

/**
 * Export an array of objects to CSV or XLSX file.
 * Automatically triggers download in the browser.
 */
export function exportToFile(data: Record<string, any>[], options: ExportOptions) {
  const { filename, sheetName = 'Données', format = 'xlsx' } = options;
  
  if (data.length === 0) {
    alert('Aucune donnée à exporter.');
    return;
  }

  const ws = XLSX.utils.json_to_sheet(data);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, sheetName);

  // Auto-size columns
  const colWidths = Object.keys(data[0]).map(key => {
    const maxLen = Math.max(
      key.length,
      ...data.map(row => String(row[key] ?? '').length)
    );
    return { wch: Math.min(maxLen + 2, 40) };
  });
  ws['!cols'] = colWidths;

  const ext = format === 'csv' ? 'csv' : 'xlsx';
  const bookType = format === 'csv' ? 'csv' : 'xlsx';
  XLSX.writeFile(wb, `${filename}.${ext}`, { bookType });
}

/**
 * Format stock movements for export
 */
export function formatMovementsForExport(movements: any[]) {
  return movements.map(m => ({
    'Date': m.date || '',
    'Type': m.type === 'IN' ? 'Entrée' : m.type === 'OUT' ? 'Sortie' : 'Ajustement',
    'Motif': m.reason || '',
    'Produit': m.productName || '',
    'Couleur': m.color || '',
    'Taille': m.size || '',
    'Quantité': m.quantity || 0,
    'Magasin': m.storeId || '',
    'Destination': m.toStoreId || '',
    'Notes': m.notes || '',
  }));
}

/**
 * Format invoices for export  
 */
export function formatInvoicesForExport(invoices: any[]) {
  return invoices.map(inv => ({
    'N° Facture': inv.invoiceNumber || '',
    'Date': inv.date || '',
    'Client': inv.clientName || 'Anonyme',
    'Montant HT': inv.totalAmount || 0,
    'Remise %': inv.discount || 0,
    'Total après remise': inv.totalAfterDiscount || 0,
    'TVA %': inv.tvaRate ?? 20,
    'Montant TVA': inv.tvaAmount || 0,
    'Total TTC': inv.totalTTC || inv.totalAfterDiscount || 0,
    'Payé': inv.paidAmount || 0,
    'Solde dû': inv.remainingBalance || 0,
    'Statut': inv.status || '',
    'Échéance': inv.dueDate || '',
  }));
}

/**
 * Format stock items for export
 */
export function formatStockForExport(stockItems: any[]) {
  return stockItems.map(item => ({
    'Produit': item.productName || '',
    'Catégorie': item.categoryId || '',
    'Couleur': item.color || '',
    'Taille': item.size || '',
    'Unité': item.unitOfMeasure || '',
    'Qté initiale': item.initialQty || 0,
    'Entrées': item.mouvementsIn || 0,
    'Sorties': item.mouvementsOut || 0,
    'Stock actuel': item.currentQty || 0,
    'Seuil min.': item.minThreshold || '',
    'Prix achat': item.purchasePricePerUnit || 0,
    'Valeur stock': item.totalValue || 0,
    'Prix vente': item.sellingPrice || '',
  }));
}
