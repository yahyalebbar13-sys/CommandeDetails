// Tests de la recherche dans les commandes (lib/recherche-commandes.ts).
// Lancer :
//   npx tsx scripts/test-recherche-commandes.ts

import { commandeCorrespond, normaliserRecherche } from '../src/lib/recherche-commandes';

let pass = 0;
let fail = 0;
function check(label: string, ok: boolean, detail = '') {
  if (ok) { pass++; console.log(`  ✓ ${label}`); }
  else { fail++; console.log(`  ✗ ${label} ${detail}`); }
}

const nylon = {
  name: 'NYLON ZIPPER N3', categoryId: 'NYLON N3', supplierId: 'JIMMY', containerRef: 'MSCU1234567',
  quality: 'C/E', colorBreakdown: [{ colorCode: 'NOIR 580', rolls: 10 }, { colorCode: 'BLANC 501', rolls: 5 }],
  sizeBreakdown: [{ size: '20cm', quantity: 3 }],
};
const client = { name: 'CURSEUR N5', categoryId: 'SLIDER N5', clientName: 'Atelier Éclair', designBreakdown: [{ design: 'D-201' }] };

console.log('\n── Recherche ──');
check('vide : tout passe', commandeCorrespond(nylon, '   '));
check('par fournisseur', commandeCorrespond(nylon, 'jimmy'));
check('par conteneur', commandeCorrespond(nylon, 'mscu1234'));
check('par couleur de ventilation', commandeCorrespond(nylon, 'noir'));
check('par taille de ventilation', commandeCorrespond(nylon, '20cm'));
check('plusieurs mots : tous requis', commandeCorrespond(nylon, 'nylon noir jimmy'));
check('un mot absent : rejeté', !commandeCorrespond(nylon, 'nylon rouge'));
check('par nom du pôle', commandeCorrespond(nylon, 'fermetures', 'FERMETURES ÉCLAIR'));
check('sans accents ni casse', commandeCorrespond(client, 'atelier eclair'));
check('par design', commandeCorrespond(client, 'd-201'));
check('rien ne correspond', !commandeCorrespond(client, 'taffeta'));
check('normalisation', normaliserRecherche('  Éclair   ÀB ') === 'eclair ab');

console.log(`\n${fail === 0 ? '✅' : '❌'} ${pass} réussis, ${fail} échoués`);
process.exit(fail === 0 ? 0 : 1);
