// Les unités fixées par pôle : à l'achat, à la vente, et celle dans laquelle le stock se compte.
//
// Cité dans l'en-tête de src/lib/unites-pole.ts depuis le début, ce test n'existait pas.
// Lancer :
//   npx tsx scripts/test-unites-pole.ts

import {
  uniteImposee, uniteDeStock, poleDeLArticle, uniteDecimale, pasDeSaisie, libelleUnite, UNITES,
} from '../src/lib/unites-pole';

let pass = 0;
let fail = 0;
function check(label: string, ok: boolean, detail = '') {
  if (ok) { pass++; console.log(`  ✓ ${label}`); }
  else { fail++; console.log(`  ✗ ${label} ${detail}`); }
}
const eq = (label: string, obtenu: any, attendu: any) =>
  check(label, obtenu === attendu, `→ obtenu ${JSON.stringify(obtenu)}, attendu ${JSON.stringify(attendu)}`);

console.log('\n── L’unité imposée ──');
{
  const taffeta = { uniteAchat: 'm', uniteVente: 'm' };
  eq('achat en mètres', uniteImposee(taffeta, 'achat'), 'm');
  eq('vente en mètres', uniteImposee(taffeta, 'vente'), 'm');
  eq('pôle sans unité : rien d’imposé', uniteImposee({}, 'vente'), undefined);
  eq('pas de pôle : rien d’imposé', uniteImposee(undefined, 'achat'), undefined);
  eq('une unité faite d’espaces ne compte pas', uniteImposee({ uniteVente: '   ' }, 'vente'), undefined);
  eq('les espaces autour sont retirés', uniteImposee({ uniteVente: ' pièces ' }, 'vente'), 'pièces');
}

console.log('\n── L’unité du stock ──');
{
  eq('achat = vente : le stock se compte dans cette unité', uniteDeStock({ uniteAchat: 'm', uniteVente: 'm' }), 'm');
  // Sans conversion (étape 3 à venir), le stock reste dans ce qu'on a acheté.
  eq('achat ≠ vente : le stock reste en unité d’achat', uniteDeStock({ uniteAchat: 'rolls', uniteVente: 'm' }), 'rolls');
  eq('vente seule (NYLON ZIPPER) : la vente', uniteDeStock({ uniteVente: 'pièces' }), 'pièces');
  eq('achat seul : l’achat', uniteDeStock({ uniteAchat: 'kg' }), 'kg');
  eq('rien : rien', uniteDeStock({}), undefined);
}

console.log('\n── Le pôle d’un article ──');
{
  const poles = [{ id: 'P1', name: 'NYLON ZIPPER' }, { id: 'P2', name: 'TAFFETA FABRIC' }];
  const categories = [
    { id: 'C1', name: 'NYLON N°3', generalCategoryId: 'P1' },
    { id: 'C2', name: 'TAFFETA 190T', generalCategoryId: 'P2' },
  ];
  eq('par l’identifiant de la famille', poleDeLArticle({ categoryId: 'C1' }, categories, poles)?.id, 'P1');
  eq('par le NOM de la famille (les commandes)', poleDeLArticle({ categoryId: 'TAFFETA 190T' }, categories, poles)?.id, 'P2');
  eq('la famille l’emporte sur le pôle noté sur l’article', poleDeLArticle({ categoryId: 'C1', generalCategoryId: 'P2' }, categories, poles)?.id, 'P1');
  eq('famille inconnue : le pôle noté sur l’article', poleDeLArticle({ categoryId: 'X', generalCategoryId: 'P2' }, categories, poles)?.id, 'P2');
  eq('rien : aucun pôle', poleDeLArticle({ categoryId: 'X' }, categories, poles), undefined);
  eq('sans pôles chargés : aucun pôle', poleDeLArticle({ categoryId: 'C1' }, categories, []), undefined);
  eq('sans article : aucun pôle', poleDeLArticle(null, categories, poles), undefined);
}

console.log('\n── Décimales et pas de saisie ──');
{
  check('le mètre se vend à la virgule', uniteDecimale('m'));
  check('le yard aussi', uniteDecimale('yds'));
  check('le kilo aussi', uniteDecimale('kg'));
  check('la pièce non', !uniteDecimale('pièces'));
  check('la douzaine non', !uniteDecimale('doz'));
  eq('pas de 0,01 pour les mètres', pasDeSaisie('m'), 0.01);
  eq('pas de 1 pour les pièces', pasDeSaisie('pièces'), 1);
  eq('pas de 1 sans unité', pasDeSaisie(undefined), 1);
}

console.log('\n── Les libellés ──');
{
  eq('m → Mètres (m)', libelleUnite('m'), 'Mètres (m)');
  eq('gross → Grosses (144 p)', libelleUnite('gross (144p)'), 'Grosses (144 p)');
  eq('une unité inconnue garde son nom', libelleUnite('cônes'), 'cônes');
  eq('sans unité : « unité »', libelleUnite(''), 'unité');
  check('chaque unité proposée a un libellé', UNITES.every(u => libelleUnite(u) !== u));
}

console.log(`\n${pass} réussis, ${fail} échoués`);
if (fail > 0) process.exit(1);
