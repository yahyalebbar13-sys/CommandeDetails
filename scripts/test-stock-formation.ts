// Stock de formation : la liste chargée doit être la MÊME à chaque fois, sinon le corrigé du
// devoir ne correspond plus au stock de la recrue.
// Lancer :
//   npx tsx scripts/test-stock-formation.ts

import {
  PLAN_FORMATION, nomArticle, choisirArticlesFormation, planifierChargement, listeAImprimer,
} from '../src/lib/stock-formation';

let pass = 0;
let fail = 0;
function check(label: string, ok: boolean, detail = '') {
  if (ok) { pass++; console.log(`  ✓ ${label}`); }
  else { fail++; console.log(`  ✗ ${label} ${detail}`); }
}

const simple = (a: any) => !a.qualityBreakdown && !a.colorBreakdown && !a.sizeBreakdown;

const catalogue = [
  { id: 'a3', nameFR: 'Fil polyester', color: 'Noir', quantity: 10, purchasePriceMAD: 6 },
  { id: 'a1', nameFR: 'Élastique 2cm', color: 'Blanc', purchasePriceMAD: 12 },
  { id: 'a2', nameFR: 'Doublure', color: 'various', colorBreakdown: [{ colorCode: 'BLEU', rolls: 5 }] },
  { id: 'a5', name: 'Bouton pression', purchasePricePerUnit: 0.18 },
  { id: 'a4', nameFR: 'Fil polyester', color: 'Blanc', purchasePriceMAD: 6 },
  { id: 'a6', categoryId: '' },
];

console.log('\n── Choix des produits ──');
const choisis = choisirArticlesFormation(catalogue, simple);
check('les produits ventilés sont écartés', !choisis.some(a => a.id === 'a2'));
check('les produits sans nom sont écartés', !choisis.some(a => a.id === 'a6'));
check('ordre alphabétique stable',
  choisis.map(a => a.id).join(',') === 'a5,a1,a4,a3',
  JSON.stringify(choisis.map(a => nomArticle(a))));
check('deux homonymes gardent un ordre fixe (départage par identifiant)',
  choisis.findIndex(a => a.id === 'a4') < choisis.findIndex(a => a.id === 'a3'));
check('même catalogue mélangé : même liste',
  choisirArticlesFormation([...catalogue].reverse(), simple).map(a => a.id).join(',') === choisis.map(a => a.id).join(','));
check('le nom affiché reprend les précisions du produit',
  nomArticle({ nameFR: 'Fil polyester', color: 'Noir', size: 'various' }) === 'Fil polyester · Noir');

console.log('\n── Plan de chargement ──');
const plan = planifierChargement(catalogue, simple);
check('une ligne par produit retenu', plan.length === 4);
check('les quantités suivent le plan, dans l’ordre',
  plan.map(l => l.quantite).join(',') === PLAN_FORMATION.slice(0, 4).map(l => l.quantite).join(','));
check('les dix premières lignes vont en boutique', PLAN_FORMATION.slice(0, 10).every(l => l.lieu === 'MAGASIN'));
check('les suivantes vont en réserve', PLAN_FORMATION.slice(10).every(l => l.lieu === 'ENTREPOT'));
check('valeur = quantité × prix d’achat',
  plan[0].valeur === Math.round(plan[0].quantite * plan[0].prixUnitaire * 100) / 100);
check('un produit sans prix ne casse rien',
  planifierChargement([{ id: 'x', nameFR: 'Sans prix' }], simple)[0].valeur === 0);
check('le plan couvre 24 références', PLAN_FORMATION.length === 24);
check('les rangs vont de 1 à 24 sans trou',
  PLAN_FORMATION.map(l => l.rang).join(',') === Array.from({ length: 24 }, (_, i) => i + 1).join(','));

console.log('\n── Liste à coller dans le corrigé ──');
const texte = listeAImprimer(plan);
check('une ligne d’en-tête, une par produit, une de total', texte.split('\n').length === plan.length + 2);
check('le total des quantités est juste',
  texte.split('\n').pop()!.includes(String(plan.reduce((s, l) => s + l.quantite, 0))));

console.log(`\n${pass} réussis, ${fail} échoués`);
if (fail > 0) process.exit(1);
