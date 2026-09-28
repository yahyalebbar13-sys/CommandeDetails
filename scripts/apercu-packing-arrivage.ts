// Fabrique un vrai PDF de packing details, pour le regarder avant de le mettre entre les mains
// d'un magasinier. Rien à voir avec les tests : c'est un outil d'atelier.
//   npx tsx scripts/apercu-packing-arrivage.ts <chemin-de-sortie.pdf>

import fs from 'fs';
import jsPDF from 'jspdf';

let dernier: any = null;
(jsPDF as any).API.save = function (this: any, fichier: string) { dernier = { doc: this, fichier }; return this; };

const poles = [
  { id: 'PZ', name: 'ZIPPER', nameFR: 'FERMETURES', specType: 'zipper' },
  { id: 'PF', name: 'FABRIC', nameFR: 'TISSUS', specType: 'fabric' },
  { id: 'PA', name: 'ACCESSORY', nameFR: 'ACCESSOIRES', specType: 'accessory' },
];
const familles = [
  { id: 'FZ', name: 'FERMETURE N5', generalCategoryId: 'PZ' },
  { id: 'FF', name: 'DOUBLURE', generalCategoryId: 'PF' },
  { id: 'FA', name: 'BOUTON PRESSION', generalCategoryId: 'PA' },
];

const articles = [
  {
    id: 'a1', categoryId: 'FZ', name: 'ZIPPER N5 CL C/E', nameFR: 'FERMETURE N5 NON SÉPARABLE',
    quantity: 48000, unitOfMeasure: 'pcs', length: '18 CM', zipperType: 'C/E', slider: 'AUTOLOCK',
    pcsPerBag: 20, bagsPerCarton: 10, stackLevel: 'sac', stackPerRow: 4, stackRows: 12,
    netWeight: 480, cubicMeasurement: 3.2, color: 'various',
    colorBreakdown: [
      { color: 'NOIR', colorCode: '580', rolls: 30000 },
      { color: 'BLANC', colorCode: '501', rolls: 12000 },
      { color: 'ROUGE', colorCode: '820', rolls: 6000 },
    ],
  },
  {
    id: 'a2', categoryId: 'FF', name: 'LINING POLYESTER 190T', nameFR: 'DOUBLURE POLYESTER 190T',
    quantity: 12000, unitOfMeasure: 'm', gsm: '65', fabricWidth: 150,
    rollLength: 100, packagingPerBag: 4, bagsPerCarton: 5,
    stackLevel: 'carton', stackPerRow: 2, stackRows: 6,
    netWeight: 900, cubicMeasurement: 6.1, color: 'various',
    colorBreakdown: [
      { color: 'NOIR', colorCode: 'BLK', rolls: 7000 },
      { color: 'MARINE', colorCode: 'NVY', rolls: 5000 },
    ],
  },
  {
    id: 'a3', categoryId: 'FA', name: 'SNAP BUTTON 15MM', nameFR: 'BOUTON PRESSION 15 MM',
    quantity: 10000, unitOfMeasure: 'pcs', size: '15MM', thickness: '1.2',
    pcsPerBox: 100, boxPerCarton: 10, cartonsPerMaster: 4,
    netWeight: 120, cubicMeasurement: 0.9,
  },
  {
    id: 'a4', categoryId: 'FZ', name: 'ZIPPER N3 SPIRAL', nameFR: 'FERMETURE N3 SPIRALE',
    quantity: 5000, unitOfMeasure: 'pcs', length: '12 CM',
    netWeight: 40, cubicMeasurement: 0.3,
  },
  {
    id: 'a5', categoryId: 'FZ', name: 'ZIPPER N8 METAL', nameFR: 'FERMETURE N8 MÉTAL',
    quantity: 2400, unitOfMeasure: 'pcs', length: '60 CM', pcsPerBag: 12, bagsPerCarton: 10,
    netWeight: 60, cubicMeasurement: 0.4,
  },
  {
    id: 'a6', categoryId: 'FF', name: 'TAFFETA 190T', nameFR: 'TAFFETA 190T',
    quantity: 3000, unitOfMeasure: 'm', gsm: '58', fabricWidth: 150,
    rollLength: 50, packagingPerBag: 2, bagsPerCarton: 5,
    netWeight: 210, cubicMeasurement: 1.4, size: 'various',
    sizeBreakdown: [{ size: '150CM', quantity: 2000 }, { size: '110CM', quantity: 1000 }],
  },
];

const facture = {
  id: 'DOSSIER-2026-014', supplierId: 'JIMMY ZIPPER CO.', noBL: 'BL-88120',
  shippingLine: 'CMA CGM', shippingDate: '2026-08-02', arrivalDate: '2026-09-18',
  forwarder: 'TRANSIT ATLAS',
};

const movements = [
  { type: 'IN', articleId: 'a1', color: '580', quantity: 30000, storeId: 'CHRIFA', locationCode: 'A-01-01' },
  { type: 'IN', articleId: 'a1', color: '501', quantity: 12000, storeId: 'CHRIFA', locationCode: 'A-01-02' },
  { type: 'IN', articleId: 'a1', color: '820', quantity: 6000, storeId: 'CHRIFA', locationCode: 'A-01-03' },
  { type: 'IN', articleId: 'a2', color: 'BLK', quantity: 7000, storeId: 'CHRIFA', locationCode: 'B-03-01' },
  { type: 'IN', articleId: 'a2', color: 'NVY', quantity: 5000, storeId: 'CHRIFA', locationCode: 'B-03-02' },
  { type: 'IN', articleId: 'a3', quantity: 10000, storeId: 'CHRIFA', locationCode: 'C-01-04' },
];

(async () => {
  const { exportArrivalPackingPDF } = await import('../src/lib/pdf-arrival-packing');
  await exportArrivalPackingPDF({
    facture, articles, categories: familles, generalCategories: poles,
    movements, stores: [{ id: 'CHRIFA', name: 'CHRIFA' }],
    isEnteredInStock: true, stockEntryDate: '2026-09-19',
  });
  const sortie = process.argv[2] || 'apercu-packing.pdf';
  fs.writeFileSync(sortie, Buffer.from(dernier.doc.output('arraybuffer')));
  console.log(`${sortie} — ${dernier.doc.getNumberOfPages()} page(s)`);
})();
