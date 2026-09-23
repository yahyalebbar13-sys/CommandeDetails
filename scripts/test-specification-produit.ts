// Les spécifications d'un article doivent sortir dans l'ordre du modèle de sa famille, pour les
// SIX types — pas seulement fermeture et tissu comme le faisaient les PDF.
// Lancer :
//   npx tsx scripts/test-specification-produit.ts

import {
  specTypeDeLArticle, specificationsArticle, specificationsEnLigne,
  qualiteDeLArticle, precisionsLigne,
} from '../src/lib/specification-produit';

let pass = 0;
let fail = 0;
function check(label: string, ok: boolean, detail = '') {
  if (ok) { pass++; console.log(`  ✓ ${label}`); }
  else { fail++; console.log(`  ✗ ${label} ${detail}`); }
}

const poles = [
  { id: 'p1', name: 'FABRIC', specType: 'fabric' },
  { id: 'p2', name: 'ZIPPER', specType: 'zipper' },
  { id: 'p3', name: 'THREAD', specType: 'thread' },
  { id: 'p4', name: 'SLIDER', specType: 'slider' },
  { id: 'p5', name: 'TAPE', specType: 'tape' },
  { id: 'p6', name: 'ACCESSORY', specType: 'accessory' },
];
const familles = [
  { id: 'f1', name: 'Doublure', generalCategoryId: 'p1' },
  { id: 'f2', name: 'Fermeture N5', generalCategoryId: 'p2' },
  { id: 'f3', name: 'Fil polyester', generalCategoryId: 'p3' },
  { id: 'f4', name: 'Curseur', generalCategoryId: 'p4' },
  { id: 'f5', name: 'Élastique', generalCategoryId: 'p5' },
  { id: 'f6', name: 'Bouton pression', generalCategoryId: 'p6' },
];

console.log('\n── Reconnaître le type de produit ──');
check('par le pôle', specTypeDeLArticle({ categoryId: 'f1' }, familles, poles) === 'fabric');
check('fermeture', specTypeDeLArticle({ categoryId: 'f2' }, familles, poles) === 'zipper');
check('fil', specTypeDeLArticle({ categoryId: 'f3' }, familles, poles) === 'thread');
check('curseur', specTypeDeLArticle({ categoryId: 'f4' }, familles, poles) === 'slider');
check('ruban', specTypeDeLArticle({ categoryId: 'f5' }, familles, poles) === 'tape');
check('accessoire', specTypeDeLArticle({ categoryId: 'f6' }, familles, poles) === 'accessory');
check('sans catalogue : deviné d’après les caractéristiques portées',
  specTypeDeLArticle({ coneWeightG: 120 }) === 'thread');
check('sans catalogue ni caractéristique : rien à afficher',
  specTypeDeLArticle({ categoryId: 'inconnue' }) === undefined);
check('le pôle prime sur la devinette',
  specTypeDeLArticle({ categoryId: 'f1', zipperType: 'C/E' }, familles, poles) === 'fabric');

console.log('\n── Les six types impriment leurs caractéristiques ──');
const tissu = { categoryId: 'f1', gsm: '180', fabricWidth: 150, rollLength: 100, rollLengthUnit: 'm' };
check('tissu : GSM, largeur, longueur, unité, dans l’ordre du modèle',
  specificationsArticle(tissu, familles, poles).map(l => l.cle).join(',') === 'gsm,fabricWidth,rollLength,rollLengthUnit',
  JSON.stringify(specificationsArticle(tissu, familles, poles)));

const fil = { categoryId: 'f3', coneWeightG: '18', threadWeightG: '120', lengthPerPiece: '5000', lengthUnit: 'm' };
check('fil : le type qui n’imprimait RIEN avant',
  specificationsArticle(fil, familles, poles).length === 4,
  JSON.stringify(specificationsEnLigne(fil, familles, poles)));

const ruban = { categoryId: 'f5', width: '2cm', weightPerM: '4', rollLength: '50' };
check('ruban : largeur, poids au mètre, longueur',
  specificationsEnLigne(ruban, familles, poles).includes('Largeur 2cm'),
  specificationsEnLigne(ruban, familles, poles));

const accessoire = { categoryId: 'f6', size: '12mm', thickness: '1.2', weightPerPiece: '0.4' };
check('accessoire : taille en majuscules',
  specificationsArticle(accessoire, familles, poles)[0].valeur === '12MM');

const curseur = { categoryId: 'f4', size: 'n5', sliderWeightG: '0.9', imageUrl: 'http://x/y.png' };
check('curseur : la photo n’est pas une ligne de texte',
  !specificationsArticle(curseur, familles, poles).some(l => l.cle === 'imageUrl'));

console.log('\n── Valeurs vides et lignes de qualité ──');
check('un champ vide ne crée pas de ligne',
  specificationsArticle({ categoryId: 'f1', gsm: '', fabricWidth: 150 }, familles, poles).length === 1);
check('un zéro n’est pas une caractéristique',
  specificationsArticle({ categoryId: 'f1', gsm: 0, fabricWidth: 150 }, familles, poles).length === 1);
check('la ligne de qualité prime sur l’article',
  specificationsArticle(tissu, familles, poles, { gsm: '220' })[0].valeur === '220');
check('elle ne prime que sur ce qu’elle porte',
  specificationsArticle(tissu, familles, poles, { gsm: '220' }).find(l => l.cle === 'fabricWidth')?.valeur === '150');

console.log('\n── Qualité et précisions de ligne ──');
check('le libellé de qualité de l’article', qualiteDeLArticle({ quality: 'CL-5' }) === 'CL-5');
check('celui de la ligne prime', qualiteDeLArticle({ quality: 'CL-5' }, { quality: 'CL-7' }) === 'CL-7');
check('« various » n’est pas une qualité', qualiteDeLArticle({ quality: 'various' }) === null);
check('qualityLabel en repli', qualiteDeLArticle({ qualityLabel: 'AUTOLOCK' }) === 'AUTOLOCK');
check('les précisions d’une ligne écartent « various »',
  precisionsLigne({ quality: 'CL-5', color: 'various', size: '20cm' }).join(',') === 'CL-5,20cm');
check('une ligne sans précision ne rend rien', precisionsLigne({ color: 'various' }).length === 0);

console.log(`\n${pass} réussis, ${fail} échoués`);
if (fail > 0) process.exit(1);
