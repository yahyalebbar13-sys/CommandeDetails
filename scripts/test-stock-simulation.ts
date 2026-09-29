// Le stock de simulation : tout le catalogue, en quantité, sur un ou deux entrepôts, pour une
// semaine d'essai — sans jamais noyer l'écran sous les mouvements.
// Lancer :
//   npx tsx scripts/test-stock-simulation.ts

import {
  planifierSimulation, entrepotsDeLArticle, variantesArticle, nomArticle,
  estMouvementSimulation, noteSimulation, jourDuChargement, joursDepuis,
  QUANTITE_PAR_LIGNE, MAX_LIGNES, MARQUE_SIMULATION,
} from '../src/lib/stock-simulation';

let pass = 0;
let fail = 0;
function check(label: string, ok: boolean, detail = '') {
  if (ok) { pass++; console.log(`  ✓ ${label}`); }
  else { fail++; console.log(`  ✗ ${label} ${detail}`); }
}

const simple = (id: string, nom: string) => ({ id, nameFR: nom, categoryId: 'MERCERIE' });
const couleurs = (id: string, nom: string, labels: string[], qte = 4000) => ({
  id, nameFR: nom, categoryId: 'TISSU', quantity: qte, color: 'various',
  colorBreakdown: labels.map(c => ({ colorCode: c, rolls: Math.floor(qte / labels.length) })),
});

const entrepots = ['ENTREPOT', 'ENTREPOT_2'];

console.log('\n── Les variantes ──');
check('un produit simple donne une seule ligne sans libellé',
  variantesArticle(simple('s1', 'Craie')).length === 1 && variantesArticle(simple('s1', 'Craie'))[0].label === '');
check('un produit multicouleur donne une ligne par coloris',
  variantesArticle(couleurs('c1', 'Doublure', ['NOIR', 'BEIGE', 'BLANC'])).map(v => v.label).join(',') === 'NOIR,BEIGE,BLANC');
check('les doublons de casse sont fusionnés',
  variantesArticle(couleurs('c2', 'X', ['Rouge', 'ROUGE', 'Bleu'])).length === 2);
// Le plafond de six coloris a disparu : un coloris resté à zéro ne se vend pas, ne se transfère
// pas, ne se compte pas — et c'est le coloris rare qui fait sortir les défauts.
check('TOUS les coloris sont chargés, même au-delà de six',
  variantesArticle(couleurs('c3', 'Y', ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H'])).length === 8);
check('quarante coloris font quarante variantes',
  variantesArticle(couleurs('c4', 'Y2', Array.from({ length: 40 }, (_, i) => `COL${i}`))).length === 40);
check('le plan compte les variantes chargées',
  planifierSimulation([couleurs('c5', 'Z', ['A', 'B', 'C', 'D', 'E', 'F', 'G'])], ['E1']).variantes === 7);
check('et il pose une ligne par coloris',
  planifierSimulation([couleurs('c6', 'Z2', ['A', 'B', 'C', 'D', 'E', 'F', 'G'])], ['E1']).lignes.length === 7);
check('un article « various » sans ventilation lisible compte comme simple',
  variantesArticle({ id: 'v', nameFR: 'Z', color: 'various', colorBreakdown: [] }).length === 1);

console.log('\n── La répartition sur les entrepôts ──');
check('un seul entrepôt : tout y va', entrepotsDeLArticle(['E1'], 5).join(',') === 'E1');
check('deux entrepôts : on alterne',
  entrepotsDeLArticle(entrepots, 1).length === 1 && entrepotsDeLArticle(entrepots, 2).length === 1);
check('une référence sur trois est dans les DEUX entrepôts',
  entrepotsDeLArticle(entrepots, 0).length === 2 && entrepotsDeLArticle(entrepots, 3).length === 2);
check('sans entrepôt, rien n’est posé', entrepotsDeLArticle([], 0).length === 0);

console.log('\n── Le plan de chargement ──');
const catalogue = [
  simple('s1', 'Aiguille 90'), couleurs('c1', 'Doublure', ['NOIR', 'BEIGE']),
  simple('s2', 'Craie'), couleurs('c2', 'Popeline', ['BLANC', 'CIEL', 'ROSE']),
  simple('s3', 'Ciseaux'), simple('s4', 'Mètre ruban'),
];
const plan = planifierSimulation(catalogue, entrepots);
check('toutes les références sont chargées', plan.references === catalogue.length);
check('toutes leurs couleurs aussi',
  plan.variantes === catalogue.reduce((s, a) => s + variantesArticle(a).length, 0));
check('chaque ligne porte la quantité pleine',
  plan.lignes.every(l => l.quantite === QUANTITE_PAR_LIGNE), String(plan.lignes[0]?.quantite));
check('une couleur ne reçoit pas une part du total mais le tout',
  plan.lignes.filter(l => l.article.id === 'c1').every(l => l.quantite === QUANTITE_PAR_LIGNE));
check('les lignes ne visent que des entrepôts',
  plan.lignes.every(l => entrepots.includes(l.entrepot)));
check('le total des unités est cohérent',
  plan.unites === plan.lignes.length * QUANTITE_PAR_LIGNE);
check('la première référence est dans les deux entrepôts',
  new Set(plan.lignes.filter(l => l.article.id === 's1').map(l => l.entrepot)).size === 2);
check('le nom affiché reprend les précisions du produit',
  nomArticle({ nameFR: 'Fil', color: 'Noir', size: 'various' }) === 'Fil · Noir');

console.log('\n── Ce qu’on n’ose pas charger ──');
check('une référence sans nom est écartée',
  planifierSimulation([{ id: 'x' }], entrepots).lignes.length === 0);
check('une demande d’import en brouillon n’est pas de la marchandise',
  planifierSimulation([{ id: 'b', nameFR: 'Besoin', requestSource: 'STORE', requestStage: 'DRAFT' }], entrepots)
    .lignes.length === 0);
check('une demande déjà envoyée, elle, compte',
  planifierSimulation([{ id: 'b2', nameFR: 'Besoin envoyé', requestSource: 'STORE', requestStage: 'COMMERCIAL' }], entrepots)
    .lignes.length > 0);

console.log('\n── Le volume : on sacrifie le second entrepôt, jamais une couleur ──');
const gros = Array.from({ length: 4000 }, (_, i) => couleurs(`g${i}`, `Produit ${i}`, ['A', 'B', 'C', 'D']));
const planGros = planifierSimulation(gros, entrepots);
check('les 4 000 références sont TOUTES chargées', planGros.references === 4000, String(planGros.references));
check('et leurs 16 000 couleurs aussi', planGros.variantes === 16000, String(planGros.variantes));
check('chaque référence a bien ses quatre couleurs en stock',
  Array.from(new Set(planGros.lignes.map(l => l.article.id)))
    .every(id => new Set(planGros.lignes.filter(l => l.article.id === id).map(l => l.variante.label)).size === 4));
check('le socle dépasse le seuil de confort, et le plan le dit',
  planGros.depassement === planGros.lignesSocle - MAX_LIGNES && planGros.depassement > 0,
  String(planGros.depassement));
check('aucun second entrepôt n’a pu être posé', planGros.referencesDoublees === 0);
check('et on sait combien de doublons ont été sacrifiés', planGros.doublonsEcartes > 0);

{
  // Un catalogue modeste : le second entrepôt passe, et c'est ce qui rend l'essai réaliste.
  const petit = Array.from({ length: 30 }, (_, i) => couleurs(`p${i}`, `Petit ${i}`, ['A', 'B']));
  const plan = planifierSimulation(petit, entrepots);
  check('toutes les références y sont', plan.references === 30);
  check('rien ne dépasse le seuil', plan.depassement === 0);
  check('une référence sur trois est dans deux entrepôts',
    plan.referencesDoublees === 10, String(plan.referencesDoublees));
  check('aucun doublon sacrifié', plan.doublonsEcartes === 0);
}
{
  // Une référence à cent coloris est chargée ENTIÈREMENT, quoi qu'il en coûte : c'est
  // précisément le produit dont on veut éprouver les cent couleurs.
  const enorme = couleurs('mastodonte', 'Produit à cent coloris',
    Array.from({ length: 100 }, (_, i) => `COL${i}`));
  const petits = Array.from({ length: 20 }, (_, i) => couleurs(`p${i}`, `Petit ${i}`, ['A', 'B']));
  const plan = planifierSimulation([enorme, ...petits], ['E1'], QUANTITE_PAR_LIGNE, 50);
  check('le mastodonte est chargé malgré le seuil',
    plan.lignes.filter(l => l.article.id === 'mastodonte').length === 100,
    String(plan.lignes.filter(l => l.article.id === 'mastodonte').length));
  check('et les vingt autres aussi', plan.references === 21, String(plan.references));
  check('le plan annonce le dépassement au lieu de couper',
    plan.depassement === plan.lignesSocle - 50 && plan.depassement > 0, String(plan.depassement));
}
check('une référence est chargée en entier dans chacun de ses entrepôts',
  Array.from(new Set(planGros.lignes.map(l => l.article.id)))
    .every(id => {
      const pour = planGros.lignes.filter(l => l.article.id === id);
      const lieux = new Set(pour.map(l => l.entrepot)).size;
      return pour.length === lieux * 4;
    }));

console.log('\n── Reconnaître et dater le stock de test ──');
const note = noteSimulation('2026-09-28', 'NOIR');
check('la note porte la marque', note.startsWith(MARQUE_SIMULATION));
check('un mouvement de test se reconnaît', estMouvementSimulation({ notes: note }));
check('un mouvement ordinaire n’est jamais pris pour un mouvement de test',
  !estMouvementSimulation({ notes: 'Vente client : ATELIER NOOR' })
  && !estMouvementSimulation({ notes: 'STOCK DE FORMATION · ligne n°3 du devoir' })
  && !estMouvementSimulation({}));
check('la date de chargement se relit', jourDuChargement({ notes: note }) === '2026-09-28');
check('une note sans date ne rend rien', jourDuChargement({ notes: 'STOCK DE TEST' }) === null);
check('les jours écoulés se comptent', joursDepuis('2026-09-21', '2026-09-28') === 7);
check('une date future ne rend pas un nombre négatif', joursDepuis('2026-10-05', '2026-09-28') === 0);

console.log(`\n${pass} réussis, ${fail} échoués`);
if (fail > 0) process.exit(1);
