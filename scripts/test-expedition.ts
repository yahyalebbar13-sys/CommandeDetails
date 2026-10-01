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
  article, dossier: DOSSIER, poidsNet: null, volume: null,
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
const parCouleur = plan(base(fil, { parLigne: [600, 100, 0], poidsNet: 420 }));
const [part, reste] = parCouleur.ecritures;
check('la part devient un nouvel article du dossier', part.op === 'set' && part.id === 'nouveau' && part.data.factureId === DOSSIER.id && part.data.originalOrderId === 'fil');
check('part : 700 doz, A501 600 + A726 100', part.data.quantity === 700
  && JSON.stringify(part.data.colorBreakdown) === JSON.stringify([{ colorCode: 'A501', rolls: 600 }, { colorCode: 'A726', rolls: 100 }]) && part.data.color === 'various');
check('part : N.W. saisi, CBM au prorata', part.data.netWeight === 420 && part.data.cubicMeasurement === 2.8);
check('part : sans champs calculés', !('effectiveStatus' in part.data));
check('reste en production : 300 doz, A726 200 + BLACK 100', reste.id === 'fil' && reste.data.quantity === 300
  && reste.data.colorBreakdown.length === 2 && reste.data.colorBreakdown[0].rolls === 200 && !('status' in reste.data));
check('reste : sa part de l’estimation (180 kg, 1,2 m³)', reste.data.netWeight === 180 && reste.data.cubicMeasurement === 1.2);
const resteUneCouleur = plan(base(fil, { parLigne: [600, 300, 0] })).ecritures[1];
check('reste d’une seule couleur : couleur sans répartition (comme avant)', resteUneCouleur.data.colorBreakdown === null && resteUneCouleur.data.color === 'BLACK');
check('rien saisi → refusé', 'erreur' in planExpedition(base(fil, { parLigne: [0, 0, 0] })));
const toutSaisi = plan(base(fil, { parLigne: [600, 300, 100] }));
check('toutes les lignes saisies = toute la commande, sans changer la fiche', toutSaisi.ecritures.length === 1
  && toutSaisi.ecritures[0].id === 'fil' && !('quantity' in toutSaisi.ecritures[0].data) && !('colorBreakdown' in toutSaisi.ecritures[0].data));

console.log('\n── Plus que la commande (surplus) ──');
const surplusLigne = plan(base(fil, { parLigne: [650, 300, 100] }));
const sl = surplusLigne.ecritures[0];
check('surplus sur une ligne : tout part, une seule écriture', surplusLigne.ecritures.length === 1 && sl.id === 'fil' && sl.data.status === 'SHIPPED');
check('surplus : quantité 1050, A501 à 650', sl.data.quantity === 1050 && sl.data.colorBreakdown[0].rolls === 650 && sl.data.colorBreakdown.length === 3);
check('surplus : dit (+50)', surplusLigne.surplus === 50 && surplusLigne.envoye.quantite === 1050);
check('surplus sans N.W. saisi : estimation au prorata (630 kg)', sl.data.netWeight === 630 && sl.data.cubicMeasurement === 4.2);
const surplusPoids = plan(base(fil, { parLigne: [650, 300, 100], poidsNet: 640 })).ecritures[0];
check('surplus avec N.W. saisi : le saisi', surplusPoids.data.netWeight === 640);
const surplusEtReste = plan(base(fil, { parLigne: [700, 0, 0] }));
check('une ligne au-delà, une autre pas expédiée : la part part, le reste reste',
  surplusEtReste.ecritures.length === 2 && surplusEtReste.ecritures[0].data.quantity === 700 && surplusEtReste.ecritures[1].data.quantity === 400 && surplusEtReste.surplus === 100);
check('… et le reste ne garde que A726 + BLACK', JSON.stringify(surplusEtReste.ecritures[1].data.colorBreakdown?.map((l: any) => l.colorCode)) === '["A726","BLACK"]');
const surplusQte = plan(base(curseur, { quantite: 210000 }));
check('surplus en quantité : 210 000 au lieu de 200 000', surplusQte.ecritures.length === 1 && surplusQte.ecritures[0].data.quantity === 210000 && surplusQte.surplus === 10000);
check('surplus en quantité : poids au prorata (525 kg)', surplusQte.ecritures[0].data.netWeight === 525);
const exacte = plan(base(curseur, { quantite: 200000 }));
check('quantité égale à la commande : rien ne change sur la fiche', !('quantity' in exacte.ecritures[0].data) && !('netWeight' in exacte.ecritures[0].data));

console.log('\n── Fractionner en quantité ──');
const parQte = plan(base(curseur, { quantite: 50000 }));
check('part 50 000, reste 150 000', parQte.ecritures[0].data.quantity === 50000 && parQte.ecritures[1].data.quantity === 150000);
check('poids au prorata des deux côtés', parQte.ecritures[0].data.netWeight === 125 && parQte.ecritures[1].data.netWeight === 375);
check('pas de volume inventé', !('cubicMeasurement' in parQte.ecritures[0].data) && !('cubicMeasurement' in parQte.ecritures[1].data));
check('quantité nulle → refusée', 'erreur' in planExpedition(base(curseur, { quantite: 0 })));
const taille = { id: 't', name: 'ÉLASTIQUE', status: 'PI', quantity: 100, unitOfMeasure: 'kg', purchasePricePerUnit: 1.9, sizeBreakdown: [{ size: '4CM', quantity: 60 }, { size: '5CM', quantity: 40 }] };
const parTaille = plan(base(taille, { parLigne: [60, 0] }));
check('répartition par taille : la part prend 4CM', parTaille.ecritures[0].data.size === '4CM' && parTaille.ecritures[0].data.sizeBreakdown.length === 1);
check('répartition par taille : le reste garde 5CM', parTaille.ecritures[1].data.size === '5CM' && parTaille.ecritures[1].data.quantity === 40);

console.log('\n── Écraser le reste ──');
const ecrase = plan(base(fil, { parLigne: [600, 290, 100], ecraserReste: true }));
const ec = ecrase.ecritures[0];
check('reste écrasé : une seule écriture, l’article passe en entier', ecrase.ecritures.length === 1 && ec.id === 'fil' && ec.data.status === 'SHIPPED');
check('reste écrasé : quantité 990, A726 à 290', ec.data.quantity === 990 && ec.data.colorBreakdown[1].rolls === 290);
check('reste écrasé : dit (10)', ecrase.resteEcrase === 10 && ecrase.envoye.quantite === 990);
check('reste écrasé : poids au prorata (594 kg)', ec.data.netWeight === 594);
const ecraseLigne = plan(base(fil, { parLigne: [600, 300, 0], ecraserReste: true })).ecritures[0];
check('ligne non expédiée écrasée : elle disparaît de la répartition', ecraseLigne.data.quantity === 900 && ecraseLigne.data.colorBreakdown.length === 2);
const ecraseQte = plan(base(curseur, { quantite: 199500, ecraserReste: true }));
check('reste écrasé en quantité : 199 500, rien en production', ecraseQte.ecritures.length === 1 && ecraseQte.ecritures[0].data.quantity === 199500 && ecraseQte.resteEcrase === 500);
const sansReste = plan(base(curseur, { quantite: 200000, ecraserReste: true }));
check('rien à écraser : fiche inchangée', sansReste.resteEcrase === 0 && !('quantity' in sansReste.ecritures[0].data));

console.log('\n── Deuxième part de la même commande ──');
const dejaParti = { id: 'p1', originalOrderId: 'fil', factureId: DOSSIER.id, status: 'SHIPPED', quantity: 100, purchasePricePerUnit: 2.5, netWeight: 60, color: 'A501' };
const suite = plan(base(fil, { parLigne: [200, 0, 0], poidsNet: 125, articles: [fil, dejaParti] }));
check('la part rejoint celle déjà au dossier', suite.fusionneAvec === 'p1' && suite.ecritures[0].op === 'update' && suite.ecritures[0].id === 'p1');
check('quantité et poids additionnés', suite.ecritures[0].data.quantity === 300 && suite.ecritures[0].data.netWeight === 185);
check('couleur additionnée (A501 : 100 + 200)', suite.ecritures[0].data.color === 'A501' && suite.ecritures[0].data.colorBreakdown === null);
const autrePrix = plan(base(fil, { parLigne: [200, 0, 0], articles: [fil, { ...dejaParti, purchasePricePerUnit: 3 }] }));
check('prix différent : nouvel article', autrePrix.fusionneAvec === null && autrePrix.ecritures[0].op === 'set');

console.log('\n── Garde-fous ──');
check('sans date d’arrivée → refusé', 'erreur' in planExpedition({ ...base(fil), dossier: { id: DOSSIER.id, arrivalDate: '' } }));
check('sans dossier → refusé', 'erreur' in planExpedition({ ...base(fil), dossier: { id: '', arrivalDate: '2026-11-20' } }));

console.log(`\n${pass} ok, ${fail} échec${fail > 1 ? 's' : ''}`);
if (fail) process.exit(1);
