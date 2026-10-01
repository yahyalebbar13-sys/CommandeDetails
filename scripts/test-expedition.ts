// Tests de « Expédier » (production et « Ajouter des articles » d'un dossier).
// Lancer :
//   npx tsx scripts/test-expedition.ts

import { planExpedition, type DemandeExpedition } from '../src/lib/expedition';

let pass = 0;
let fail = 0;
function check(label: string, ok: boolean, detail = '') {
  if (ok) { pass++; console.log(`  ✓ ${label}`); }
  else { fail++; console.log(`  ✗ ${label} ${detail}`); }
}

const DOSSIER = { id: '26MH114300', arrivalDate: '2026-11-20' };
const base = (article: any, autres: Partial<DemandeExpedition> = {}): DemandeExpedition => ({
  article, dossier: DOSSIER, mode: 'tout', poidsNet: null, volume: null,
  articles: [article], maintenant: 'MAINTENANT', nouvelId: () => 'nouveau', ...autres,
});
const plan = (d: DemandeExpedition) => {
  const r = planExpedition(d);
  if ('erreur' in r) throw new Error(r.erreur);
  return r;
};

const fil = {
  id: 'fil', name: 'FIL 40/2', status: 'PI', supplierId: 'MH', quantity: 1000, unitOfMeasure: 'doz',
  purchasePricePerUnit: 2.5, netWeight: 600, cubicMeasurement: 4, color: 'various', effectiveStatus: 'PI',
  colorBreakdown: [{ colorCode: 'A501', rolls: 600 }, { colorCode: 'A726', rolls: 300 }, { colorCode: 'BLACK', rolls: 100 }],
};
const curseur = { id: 'cur', name: 'CURSEUR N°5', status: 'PI', quantity: 200000, unitOfMeasure: 'pcs', purchasePricePerUnit: 0.01, netWeight: 500, color: 'BLACK' };

console.log('\n── Toute la commande ──');
const tout = plan(base(fil, { poidsNet: 612.5, volume: 4.2 }));
const t0 = tout.ecritures[0];
check('une seule écriture, sur l’article', tout.ecritures.length === 1 && t0.op === 'update' && t0.id === 'fil');
check('en transit dans le dossier', t0.data.factureId === DOSSIER.id && t0.data.status === 'SHIPPED' && t0.data.arrivalDate === DOSSIER.arrivalDate);
check('N.W. et CBM saisis écrits', t0.data.netWeight === 612.5 && t0.data.cubicMeasurement === 4.2);
const toutSansPoids = plan(base(fil)).ecritures[0];
check('sans saisie : estimation de la fiche gardée', !('netWeight' in toutSansPoids.data) && !('cubicMeasurement' in toutSansPoids.data));
const uneCouleur = plan(base({ ...fil, colorBreakdown: [{ colorCode: 'A501', rolls: 1000 }] })).ecritures[0];
check('une seule couleur : la fiche prend son code', uneCouleur.data.color === 'A501');

console.log('\n── Fractionner par couleur ──');
const parCouleur = plan(base(fil, { mode: 'partiel', parLigne: [600, 100, 0], poidsNet: 420 }));
const [part, reste] = parCouleur.ecritures;
check('la part devient un nouvel article du dossier', part.op === 'set' && part.id === 'nouveau' && part.data.factureId === DOSSIER.id && part.data.originalOrderId === 'fil');
check('part : 700 doz, A501 600 + A726 100', part.data.quantity === 700
  && JSON.stringify(part.data.colorBreakdown) === JSON.stringify([{ colorCode: 'A501', rolls: 600 }, { colorCode: 'A726', rolls: 100 }]) && part.data.color === 'various');
check('part : N.W. saisi, CBM au prorata', part.data.netWeight === 420 && part.data.cubicMeasurement === 2.8);
check('part : sans champs calculés', !('effectiveStatus' in part.data));
check('reste en production : 300 doz, A726 200 + BLACK 100', reste.id === 'fil' && reste.data.quantity === 300
  && reste.data.colorBreakdown.length === 2 && reste.data.colorBreakdown[0].rolls === 200 && !('status' in reste.data));
check('reste : sa part de l’estimation (180 kg, 1,2 m³)', reste.data.netWeight === 180 && reste.data.cubicMeasurement === 1.2);
const resteUneCouleur = plan(base(fil, { mode: 'partiel', parLigne: [600, 300, 0] })).ecritures[1];
check('reste d’une seule couleur : couleur sans répartition (comme avant)', resteUneCouleur.data.colorBreakdown === null && resteUneCouleur.data.color === 'BLACK');
check('rien saisi → refusé', 'erreur' in planExpedition(base(fil, { mode: 'partiel', parLigne: [0, 0, 0] })));
check('tout saisi → « Toute la commande »', 'erreur' in planExpedition(base(fil, { mode: 'partiel', parLigne: [600, 300, 100] })));
check('plus que la ligne → refusé', 'erreur' in planExpedition(base(fil, { mode: 'partiel', parLigne: [700, 0, 0] })));

console.log('\n── Fractionner en quantité ──');
const parQte = plan(base(curseur, { mode: 'partiel', quantite: 50000 }));
check('part 50 000, reste 150 000', parQte.ecritures[0].data.quantity === 50000 && parQte.ecritures[1].data.quantity === 150000);
check('poids au prorata des deux côtés', parQte.ecritures[0].data.netWeight === 125 && parQte.ecritures[1].data.netWeight === 375);
check('pas de volume inventé', !('cubicMeasurement' in parQte.ecritures[0].data) && !('cubicMeasurement' in parQte.ecritures[1].data));
check('quantité ≥ commande → refusé', 'erreur' in planExpedition(base(curseur, { mode: 'partiel', quantite: 200000 })));
const taille = { id: 't', name: 'ÉLASTIQUE', status: 'PI', quantity: 100, unitOfMeasure: 'kg', purchasePricePerUnit: 1.9, sizeBreakdown: [{ size: '4CM', quantity: 60 }, { size: '5CM', quantity: 40 }] };
const parTaille = plan(base(taille, { mode: 'partiel', parLigne: [60, 0] }));
check('répartition par taille : la part prend 4CM', parTaille.ecritures[0].data.size === '4CM' && parTaille.ecritures[0].data.sizeBreakdown.length === 1);
check('répartition par taille : le reste garde 5CM', parTaille.ecritures[1].data.size === '5CM' && parTaille.ecritures[1].data.quantity === 40);

console.log('\n── Deuxième part de la même commande ──');
const dejaParti = { id: 'p1', originalOrderId: 'fil', factureId: DOSSIER.id, status: 'SHIPPED', quantity: 100, purchasePricePerUnit: 2.5, netWeight: 60, color: 'A501' };
const suite = plan(base(fil, { mode: 'partiel', parLigne: [200, 0, 0], poidsNet: 125, articles: [fil, dejaParti] }));
check('la part rejoint celle déjà au dossier', suite.fusionneAvec === 'p1' && suite.ecritures[0].op === 'update' && suite.ecritures[0].id === 'p1');
check('quantité et poids additionnés', suite.ecritures[0].data.quantity === 300 && suite.ecritures[0].data.netWeight === 185);
check('couleur additionnée (A501 : 100 + 200)', suite.ecritures[0].data.color === 'A501' && suite.ecritures[0].data.colorBreakdown === null);
const autrePrix = plan(base(fil, { mode: 'partiel', parLigne: [200, 0, 0], articles: [fil, { ...dejaParti, purchasePricePerUnit: 3 }] }));
check('prix différent : nouvel article', autrePrix.fusionneAvec === null && autrePrix.ecritures[0].op === 'set');

console.log('\n── Garde-fous ──');
check('sans date d’arrivée → refusé', 'erreur' in planExpedition({ ...base(fil), dossier: { id: DOSSIER.id, arrivalDate: '' } }));
check('sans dossier → refusé', 'erreur' in planExpedition({ ...base(fil), dossier: { id: '', arrivalDate: '2026-11-20' } }));

console.log(`\n${pass} ok, ${fail} échec${fail > 1 ? 's' : ''}`);
if (fail) process.exit(1);
