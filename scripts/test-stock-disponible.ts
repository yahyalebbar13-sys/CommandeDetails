// Ce qu'un lieu a réellement sous la main.
//
// Un entrepôt n'est pas un magasin : c'est la réserve du magasin principal. La marchandise y
// arrive, puis elle part de CHRIFA. L'écran des transferts ignorait cette règle et annonçait
// « Rien au départ » sur des entrepôts pleins.
// Lancer :
//   npx tsx scripts/test-stock-disponible.ts

import {
  disponibleDepuis, lieuDeMouvement, estEntrepot, MAGASIN_PRINCIPAL,
} from '../src/lib/stock-disponible';

let pass = 0;
let fail = 0;
function check(label: string, ok: boolean, detail = '') {
  if (ok) { pass++; console.log(`  ✓ ${label}`); }
  else { fail++; console.log(`  ✗ ${label} ${detail}`); }
}
const eq = (label: string, obtenu: any, attendu: any) =>
  check(label, obtenu === attendu, `→ obtenu ${JSON.stringify(obtenu)}, attendu ${JSON.stringify(attendu)}`);

const lieux = [
  { id: 'CHRIFA', type: 'STORE' },
  { id: 'DERB', type: 'STORE' },
  { id: 'IDAA', type: 'STORE' },
  { id: 'ENTREPOT', type: 'WAREHOUSE' },
  { id: 'ENTREPOT_2', type: 'WAREHOUSE' },
];

console.log('\n── Reconnaître un entrepôt ──');
eq('un entrepôt se reconnaît', estEntrepot('ENTREPOT', lieux), true);
eq('un magasin n’en est pas un', estEntrepot('DERB', lieux), false);
eq('un lieu inconnu non plus', estEntrepot('AILLEURS', lieux), false);

console.log('\n── Sous quel nom écrire un mouvement ──');
eq('un entrepôt se ramène au magasin principal', lieuDeMouvement('ENTREPOT', lieux), 'CHRIFA');
eq('un magasin garde son nom', lieuDeMouvement('DERB', lieux), 'DERB');
eq('le magasin principal aussi', lieuDeMouvement('CHRIFA', lieux), MAGASIN_PRINCIPAL);

console.log('\n── Le magasin principal voit ses entrepôts ──');
{
  // Le cas du patron : tout le stock est en entrepôt, CHRIFA n'a rien sous son propre nom.
  const item = { qtyByStore: { ENTREPOT: 10000, ENTREPOT_2: 5000 }, currentQty: 15000 };
  eq('CHRIFA dispose de tout ce que ses entrepôts contiennent',
    disponibleDepuis(item, 'CHRIFA', lieux), 15000);
  eq('un autre magasin ne voit rien de cela', disponibleDepuis(item, 'DERB', lieux), 0);
}
{
  const item = { qtyByStore: { CHRIFA: 200, ENTREPOT: 800, DERB: 50 }, currentQty: 1050 };
  eq('son propre stock s’ajoute à celui des entrepôts',
    disponibleDepuis(item, 'CHRIFA', lieux), 1000);
  eq('le stock d’un autre magasin n’y entre pas', disponibleDepuis(item, 'DERB', lieux), 50);
}

console.log('\n── Un solde négatif au principal ne ment plus ──');
{
  // Une vente puisée dans un entrepôt est écrite sous CHRIFA sans débiter l'entrepôt : pris
  // séparément, l'un est négatif et l'autre trop plein. Ensemble, ils disent la vérité.
  const item = { qtyByStore: { CHRIFA: -300, ENTREPOT: 1000 }, currentQty: 700 };
  eq('la somme rétablit le vrai disponible', disponibleDepuis(item, 'CHRIFA', lieux), 700);
}
{
  const item = { qtyByStore: { CHRIFA: -50, ENTREPOT: 20 }, currentQty: -30 };
  eq('un total négatif ne se propose jamais au transfert',
    disponibleDepuis(item, 'CHRIFA', lieux), 0);
}
{
  const item = { qtyByStore: { DERB: -10 }, currentQty: -10 };
  eq('ni pour un autre magasin', disponibleDepuis(item, 'DERB', lieux), 0);
}

console.log('\n── Les cas tordus ──');
eq('sans article, rien', disponibleDepuis(null, 'CHRIFA', lieux), 0);
eq('sans ventilation par lieu, on retombe sur le total',
  disponibleDepuis({ currentQty: 42 }, 'CHRIFA', lieux), 42);
eq('un lieu absent de la ventilation vaut zéro',
  disponibleDepuis({ qtyByStore: { CHRIFA: 5 }, currentQty: 5 }, 'IDAA', lieux), 0);
eq('sans liste des lieux, le principal ne voit que lui-même',
  disponibleDepuis({ qtyByStore: { CHRIFA: 5, ENTREPOT: 100 }, currentQty: 105 }, 'CHRIFA', []), 5);
eq('les centièmes de mètre survivent',
  disponibleDepuis({ qtyByStore: { ENTREPOT: 1.005, CHRIFA: 0.5 }, currentQty: 1.505 }, 'CHRIFA', lieux), 1.505);
{
  const item = { qtyByStore: { ENTREPOT: 'abc' as any }, currentQty: 0 };
  eq('une valeur illisible ne produit pas NaN', disponibleDepuis(item, 'CHRIFA', lieux), 0);
}

console.log(`\n${pass} réussis, ${fail} échoués`);
if (fail > 0) process.exit(1);
