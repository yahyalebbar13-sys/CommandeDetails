// Les documents que le magasin imprime tous les jours : bon de transfert, bon de commande
// comptoir, rapports. Ils doivent porter la charte de la maison, ne jamais laisser filtrer un
// prix d'achat, et ne rien écrire qu'une police PDF ne sait pas dessiner.
// Lancer :
//   npx tsx scripts/test-pdf-documents-stock.ts

import jsPDF from 'jspdf';
import {
  exportTransferOrderPDF, exportSaleOrderPDF, exportMovementsPDF,
} from '../src/lib/pdf-export-reports';

let pass = 0;
let fail = 0;
function check(label: string, ok: boolean, detail = '') {
  if (ok) { pass++; console.log(`  ✓ ${label}`); }
  else { fail++; console.log(`  ✗ ${label} ${detail}`); }
}

// `save()` est la seule chose qui ne marche pas hors navigateur : on l'intercepte sur l'API jsPDF
// — avant toute construction de document — pour récupérer le PDF tel qu'il aurait été téléchargé.
let dernier: { doc: any; fichier: string } | null = null;
(jsPDF as any).API.save = function (this: any, fichier: string) { dernier = { doc: this, fichier }; return this; };

function lire(): { texte: string; ecrits: { x: number; y: number; texte: string }[]; pages: number; fichier: string } {
  if (!dernier) throw new Error('aucun document produit');
  const brut = Buffer.from(dernier.doc.output('arraybuffer')).toString('latin1');
  const ecrits = Array.from(brut.matchAll(/([-\d.]+) ([-\d.]+) Td\s*\((.*?)\) Tj/g))
    .map(m => ({ x: parseFloat(m[1]), y: parseFloat(m[2]), texte: m[3] }));
  return { texte: ecrits.map(e => e.texte).join(' '), ecrits, pages: dernier.doc.getNumberOfPages(), fichier: dernier.fichier };
}

const stores = [{ id: 'CHRIFA', name: 'CHRIFA' }, { id: 'DERB', name: 'DERB OMAR' }];

const transfert = {
  id: 'abcdef123456',
  fromStore: 'CHRIFA',
  toStore: 'DERB',
  date: '2026-09-22',
  status: 'VALIDATED',
  items: [
    { productName: 'DOUBLURE POLYESTER', color: 'NOIR', size: 'various', quality: 'various', unitOfMeasure: 'm', sentQty: 200, receivedQty: 200, purchasePricePerUnit: 12.5 },
    { productName: 'CURSEUR N5', color: 'various', size: 'N5', unitOfMeasure: 'pcs', sentQty: 500, receivedQty: 480 },
  ],
};

const commande = {
  id: 'cmd12345',
  clientName: 'ATELIER NOOR',
  date: '2026-09-23',
  totalAmount: 2800,
  totalAfterDiscount: 2660,
  items: [
    { productName: 'DOUBLURE POLYESTER', color: 'NOIR', qty: 200, unitPrice: 5, totalPrice: 1000, unitOfMeasure: 'm', purchasePricePerUnit: 12.5, costPrice: 12.5 },
    { productName: 'CURSEUR N5', color: 'various', qty: 100, unitPrice: 14, totalPrice: 1400, unitOfMeasure: 'pcs', purchasePricePerUnit: 3.2, costPrice: 3.2 },
  ],
};

const mouvements = [
  { date: '2026-09-23', productName: 'DOUBLURE POLYESTER', color: 'NOIR', type: 'OUT', reason: 'VENTE', quantity: 50, unitOfMeasure: 'm', storeId: 'CHRIFA', notes: 'Vente comptoir', purchasePricePerUnit: 12.5 },
];

(async () => {
  console.log('\n── Bon de transfert ──');
  await exportTransferOrderPDF(transfert, stores);
  const t = lire();
  check('le document sort', t.pages >= 1);
  check('il porte l’identité LEBTEX', t.texte.includes('LEBTEX'));
  check('le trajet est lisible sans flèche exotique',
    t.texte.includes('CHRIFA') && t.texte.includes('DERB OMAR') && !t.texte.includes('?'),
    t.texte.slice(0, 160));
  check('aucun émoji n’est imprimé', !/[←-⯿️]/.test(t.texte), t.texte.slice(0, 200));
  check('le statut est écrit en toutes lettres', t.texte.includes('VALID'));
  check('« various » ne s’imprime jamais', !/various/i.test(t.texte));
  check('aucun prix d’achat ne filtre',
    !t.texte.includes('12,50') && !t.texte.includes('12.5'), t.texte.slice(0, 250));
  check('les pages sont numérotées', /Page 1 \/ \d/.test(t.texte));
  check('rien ne déborde de la marge droite', t.ecrits.every(e => e.x < 595 - 34),
    String(Math.max(...t.ecrits.map(e => e.x))));
  check('les cases de visa sont imprimées en entier',
    t.texte.includes('Visa Expéditeur') && t.texte.includes('Visa Réceptionnaire'), t.texte.slice(-200));
  check('la mention de fin n’écrase pas la pagination',
    t.ecrits.filter(e => e.texte.includes('Visa')).every(e => e.y > 30),
    JSON.stringify(t.ecrits.filter(e => e.texte.includes('Visa')).map(e => e.y)));

  console.log('\n── Bon de commande comptoir ──');
  await exportSaleOrderPDF(commande);
  const c = lire();
  check('le client est nommé', c.texte.includes('ATELIER NOOR'));
  check('les prix de VENTE sont là', c.texte.includes('1.000') || c.texte.includes('1 000'));
  check('le prix d’achat, lui, ne l’est pas',
    !c.texte.includes('12,50') && !c.texte.includes('3,20'), c.texte.slice(0, 250));
  check('il porte l’identité LEBTEX', c.texte.includes('LEBTEX'));
  check('aucun émoji', !/[←-⯿️]/.test(c.texte));

  console.log('\n── Rapport des mouvements ──');
  await exportMovementsPDF(mouvements);
  const m = lire();
  check('le rapport sort en paysage', m.ecrits.some(e => e.x > 600));
  check('il porte l’identité LEBTEX', m.texte.includes('LEBTEX'));
  check('aucun prix d’achat', !m.texte.includes('12,50') && !m.texte.includes('12.5'));
  check('rien ne déborde à droite d’un A4 paysage',
    m.ecrits.every(e => e.x < 842 - 34), String(Math.max(...m.ecrits.map(e => e.x))));

  console.log(`\n${pass} réussis, ${fail} échoués`);
  if (fail > 0) process.exit(1);
})();
