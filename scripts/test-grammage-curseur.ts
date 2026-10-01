// Le grammage des curseurs (g/pc), affiché en production, dans « Ajouter des articles »,
// « Expédier » et la fiche du dossier.
// Lancer :
//   npx tsx scripts/test-grammage-curseur.ts

import { grammageCurseur, grammagesCurseur } from '../src/lib/grammage-curseur';

let pass = 0;
let fail = 0;
const eq = (label: string, obtenu: any, attendu: any) => {
  const ok = JSON.stringify(obtenu) === JSON.stringify(attendu);
  if (ok) { pass++; console.log(`  ✓ ${label}`); }
  else { fail++; console.log(`  ✗ ${label} → obtenu ${JSON.stringify(obtenu)}, attendu ${JSON.stringify(attendu)}`); }
};

const familles = [{
  id: 'c1', name: 'CURSEUR N5', generalCategoryId: 'p1',
  sliderQualities: [{ label: '6570-0083', sliderWeightG: '2.7' }, { label: 'AUTOLOCK', sliderWeightG: 3.28 }],
}];
const poles = [{ id: 'p1', name: 'CURSEURS', specType: 'slider' }];
const curseur = { categoryId: 'c1', name: 'CURSEUR N5', quality: 'AUTOLOCK', sliderWeightG: 9 };

console.log('\n── Grammage d’un curseur ──');
eq('le catalogue fait foi sur la commande', grammageCurseur(curseur, familles, poles), '3.28');
eq('qualité inconnue du catalogue : celui de la commande', grammageCurseur({ ...curseur, quality: 'AUTRE' }, familles, poles), '9');
eq('sans catalogue, reconnu par le nom ; virgule → point', grammageCurseur({ name: 'CURSEUR N8', sliderWeightG: '4,1' }), '4.1');
eq('fourchette gardée telle quelle', grammageCurseur({ name: 'CURSEUR N5', sliderWeightG: '2.4-3.8' }), '2.4-3.8');
eq('curseur sans poids : rien', grammageCurseur({ name: 'CURSEUR N5' }), null);
eq('une fermeture n’est pas un curseur (même avec un poids de curseur)', grammageCurseur({ name: 'FERMETURE NYLON', zipperType: 'C/E', sliderWeightG: 2 }), null);

console.log('\n── Curseur ventilé ──');
const parDesign = { ...curseur, quality: 'VARIOUS', designBreakdown: [{ designRef: '6570-0083', rolls: 10 }, { designRef: 'AUTOLOCK', rolls: 5 }, { designRef: 'X', rolls: 1 }] };
eq('un grammage par design, sans doublon', grammagesCurseur(parDesign, familles, poles), ['2.7', '3.28']);
eq('ligne de design inconnue : pas le poids de l’article', grammageCurseur(parDesign, familles, poles, { designRef: 'X' }), null);
const parQualite = { ...curseur, quality: 'VARIOUS', qualityBreakdown: [{ quality: 'AUTOLOCK', quantity: 10 }, { quality: 'N8', quantity: 5, sliderWeightG: 5 }] };
eq('ligne de qualité : catalogue, sinon son propre poids', grammagesCurseur(parQualite, familles, poles), ['3.28', '5']);
eq('non ventilé : le poids de l’article', grammagesCurseur(curseur, familles, poles), ['3.28']);

console.log(`\n${pass} réussis, ${fail} échoués`);
if (fail > 0) process.exit(1);
