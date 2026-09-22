// Stock de formation : la liste chargée doit couvrir plusieurs familles, mélanger produits
// simples et produits ventilés, et rester IDENTIQUE d'un chargement à l'autre — sinon le corrigé
// du devoir ne correspond plus au stock de la recrue.
// Lancer :
//   npx tsx scripts/test-stock-formation.ts

import {
  PLAN_FORMATION, MAX_VARIANTES, nomArticle, libellesVariantes, repartirSurVariantes,
  choisirArticlesFormation, planifierChargement, listeAImprimer,
} from '../src/lib/stock-formation';

let pass = 0;
let fail = 0;
function check(label: string, ok: boolean, detail = '') {
  if (ok) { pass++; console.log(`  ✓ ${label}`); }
  else { fail++; console.log(`  ✗ ${label} ${detail}`); }
}

const couleurs = (id: string, nom: string, cat: string, labels: string[], qte = 1000) => ({
  id, nameFR: nom, categoryId: cat, quantity: qte, color: 'various',
  colorBreakdown: labels.map(c => ({ colorCode: c, rolls: Math.floor(qte / labels.length) })),
});
const simple = (id: string, nom: string, cat: string, prix = 10) => ({
  id, nameFR: nom, categoryId: cat, purchasePriceMAD: prix,
});

console.log('\n── Variantes d’un produit ──');
const rubans = couleurs('v1', 'Ruban satin', 'RUBAN', ['ROUGE', 'BLEU', 'NOIR', 'BLANC', 'VERT']);
check('les libellés sont lus dans la ventilation',
  libellesVariantes(rubans)?.labels.join(',') === 'ROUGE,BLEU,NOIR,BLANC,VERT');
check('un produit simple n’a pas de variante', libellesVariantes(simple('s1', 'Craie', 'DIVERS')) === null);
check('les doublons de casse sont fusionnés',
  libellesVariantes(couleurs('v2', 'X', 'C', ['Rouge', 'ROUGE', 'Bleu']))?.labels.join(',') === 'Rouge,Bleu');

const r4 = repartirSurVariantes(rubans, 500);
check('au plus quatre variantes chargées', r4.length === MAX_VARIANTES, JSON.stringify(r4));
check('répartition 40/30/20/10 qui tombe juste',
  r4.map(v => v.quantite).join(',') === '200,150,100,50', JSON.stringify(r4));
check('le total réparti est exactement la quantité du plan',
  r4.reduce((s, v) => s + v.quantite, 0) === 500);
check('la dimension est reportée sur chaque ligne', r4.every(v => v.dimension === 'color'));
check('trois variantes : 50/30/20',
  repartirSurVariantes(couleurs('v3', 'Y', 'C', ['A', 'B', 'C']), 200).map(v => v.quantite).join(',') === '100,60,40');
check('deux variantes : 60/40',
  repartirSurVariantes(couleurs('v4', 'Z', 'C', ['A', 'B']), 150).map(v => v.quantite).join(',') === '90,60');
const rSimple = repartirSurVariantes(simple('s2', 'Aiguille', 'DIVERS'), 240);
check('un produit simple donne une seule ligne sans libellé',
  rSimple.length === 1 && rSimple[0].label === '' && rSimple[0].quantite === 240);

console.log('\n── Choix des produits ──');
const catalogue = [
  simple('a1', 'Aiguille 90', 'MERCERIE'), simple('a2', 'Aiguille 100', 'MERCERIE'),
  simple('a3', 'Craie', 'MERCERIE'), simple('b1', 'Fil 40/2', 'FIL'),
  simple('b2', 'Fil 20/3', 'FIL'), couleurs('c1', 'Doublure', 'TISSU', ['NOIR', 'BEIGE']),
  couleurs('c2', 'Popeline', 'TISSU', ['BLANC', 'BLEU', 'ROUGE']),
  couleurs('d1', 'Fermeture N5', 'ZIP', ['101', '580']),
  { id: 'e1', categoryId: '' },
];
const choisis = choisirArticlesFormation(catalogue, 6);
check('les références sans nom sont écartées', !choisis.some(a => a.id === 'e1'));
check('plusieurs familles sont représentées',
  new Set(choisis.map((a: any) => a.categoryId)).size >= 3, JSON.stringify(choisis.map((a: any) => a.categoryId)));
check('produits simples et ventilés alternent',
  choisis.map(a => (libellesVariantes(a) ? 'V' : 'S')).join('') === 'SVSVSV',
  choisis.map(a => `${a.id}:${libellesVariantes(a) ? 'V' : 'S'}`).join(','));
check('la liste ne dépend pas de l’ordre du catalogue',
  choisirArticlesFormation([...catalogue].reverse(), 6).map(a => a.id).join(',') === choisis.map(a => a.id).join(','));
check('le nom affiché reprend les précisions du produit',
  nomArticle({ nameFR: 'Fil polyester', color: 'Noir', size: 'various' }) === 'Fil polyester · Noir');

console.log('\n── Plan de chargement ──');
const plan = planifierChargement(catalogue);
check('une ligne par produit retenu', plan.length === 8, String(plan.length));
check('les quantités suivent le plan, dans l’ordre',
  plan.map(l => l.quantite).join(',') === PLAN_FORMATION.slice(0, plan.length).map(l => l.quantite).join(','));
check('chaque ligne porte le détail de ses variantes',
  plan.every(l => l.variantes.reduce((s, v) => s + v.quantite, 0) === l.quantite),
  JSON.stringify(plan.map(l => [l.rang, l.variantes.map(v => v.quantite)])));
check('la famille est reportée pour l’affichage', plan.every(l => l.categorie.length > 0));
check('les dix premières lignes vont en boutique', PLAN_FORMATION.slice(0, 10).every(l => l.lieu === 'MAGASIN'));
check('les suivantes vont en réserve', PLAN_FORMATION.slice(10).every(l => l.lieu === 'ENTREPOT'));
check('valeur = quantité × prix d’achat',
  plan[0].valeur === Math.round(plan[0].quantite * plan[0].prixUnitaire * 100) / 100);
check('un produit sans prix ne casse rien', planifierChargement([simple('x', 'Sans prix', 'C', 0)])[0].valeur === 0);
check('le plan couvre 24 références', PLAN_FORMATION.length === 24);
check('les rangs vont de 1 à 24 sans trou',
  PLAN_FORMATION.map(l => l.rang).join(',') === Array.from({ length: 24 }, (_, i) => i + 1).join(','));
check('toutes les quantités du plan se divisent juste en quatre variantes',
  PLAN_FORMATION.every(l => [40, 30, 20, 10].every(p => Number.isInteger((l.quantite * p) / 100))),
  PLAN_FORMATION.filter(l => [40, 30, 20, 10].some(p => !Number.isInteger((l.quantite * p) / 100))).map(l => l.quantite).join(','));

console.log('\n── Liste à coller dans le corrigé ──');
const texte = listeAImprimer(plan);
check('une ligne d’en-tête, une par produit, une de total', texte.split('\n').length === plan.length + 2);
check('le détail des couleurs y figure', texte.includes('NOIR : '), texte.split('\n')[2]);
check('le total des quantités est juste',
  texte.split('\n').pop()!.includes(String(plan.reduce((s, l) => s + l.quantite, 0))));

console.log(`\n${pass} réussis, ${fail} échoués`);
if (fail > 0) process.exit(1);
