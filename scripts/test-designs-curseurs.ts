// Tests des anciens designs de curseurs → qualités (lib/designs-curseurs.ts).
// Lancer :
//   npx tsx scripts/test-designs-curseurs.ts

import { designVersQualite, designsAEnregistrer, memeQualiteCurseur } from '../src/lib/designs-curseurs';

let pass = 0;
let fail = 0;
function check(label: string, ok: boolean, detail = '') {
  if (ok) { pass++; console.log(`  ✓ ${label}`); }
  else { fail++; console.log(`  ✗ ${label} ${detail}`); }
}

console.log('\n── Un design devient une qualité ──');
const q = designVersQualite({ ref: ' d-201 ', description: 'Curseur doré', imageUrl: 'https://img/1.jpg', size: '5', sliderWeightG: '3.2', pcsPerBag: 1000, bagsPerCarton: null });
check('référence en majuscules', q?.label === 'D-201', `→ ${q?.label}`);
check('description en texte → nom français', q?.nameFR === 'Curseur doré');

console.log('\n── La description des anciens designs porte le poids ──');
const poids = designVersQualite({ ref: '6573-5051', description: '3.28g' });
check('« 3.28g » → poids, pas un nom', poids?.sliderWeightG === '3.28' && !poids?.nameFR, JSON.stringify(poids));
const fourchette = designVersQualite({ ref: '6572-0251', description: '2.4-3.8g' });
check('« 2.4-3.8g » → fourchette de poids', fourchette?.sliderWeightG === '2.4-3.8', JSON.stringify(fourchette));
const tailleEtPoids = designVersQualite({ ref: '6570-0823', description: 'NO8 5g/pc' });
check('« NO8 5g/pc » → taille 8 et poids 5', tailleEtPoids?.size === '8' && tailleEtPoids?.sliderWeightG === '5' && !tailleEtPoids?.nameFR, JSON.stringify(tailleEtPoids));
const virgule = designVersQualite({ ref: 'X', description: '4,66 g' });
check('virgule décimale acceptée', virgule?.sliderWeightG === '4.66', JSON.stringify(virgule));
const texteEtPoids = designVersQualite({ ref: 'Y', description: 'Doré mat 3.5g' });
check('texte + poids : les deux gardés', texteEtPoids?.nameFR === 'Doré mat' && texteEtPoids?.sliderWeightG === '3.5', JSON.stringify(texteEtPoids));
const dejaPese = designVersQualite({ ref: 'Z', description: '9g', sliderWeightG: 4 });
check('un poids déjà renseigné l’emporte sur la description', dejaPese?.sliderWeightG === 4, JSON.stringify(dejaPese));
check('photo, taille, poids, pcs/bag gardés', q?.imageUrl === 'https://img/1.jpg' && q?.size === '5' && q?.sliderWeightG === '3.2' && q?.pcsPerBag === 1000);
check('aucun champ vide ni undefined (Firestore)', !('bagsPerCarton' in (q || {})) && Object.values(q || {}).every(v => v !== undefined && v !== null));
check('design sans référence ignoré', designVersQualite({ ref: '  ', imageUrl: 'x' }) === null);

console.log('\n── Seuls les designs manquants ──');
const designs = [
  { ref: 'D-201', imageUrl: 'https://img/1.jpg' },
  { ref: 'd-202', imageUrl: 'https://img/2.jpg' },
  { ref: 'D-203', imageUrl: 'https://img/3.jpg' },
  { ref: 'D-202', imageUrl: 'https://img/2b.jpg' },        // doublon de référence
  { ref: 'AUTRE', imageUrl: 'https://img/3.jpg' },          // doublon de photo
];
const existantes = [
  { label: 'd-201' },                                       // déjà là (sans casse)
  { label: 'N5 AUTO', imageUrl: 'https://img/3.jpg' },      // même photo que D-203
];
const aAjouter = designsAEnregistrer(designs, existantes);
check('un seul design manquant', aAjouter.length === 1 && aAjouter[0].label === 'D-202', `→ ${aAjouter.map(x => x.label)}`);
check('rien quand tout est déjà là', designsAEnregistrer([{ ref: 'D-201' }], [{ label: 'D-201' }]).length === 0);
check('liste vide', designsAEnregistrer([], []).length === 0);

console.log('\n── Même modèle de curseur ? ──');
check('deux références différentes sans taille ni poids : pas le même', !memeQualiteCurseur({ label: 'K7' }, { label: 'K8' }));
check('même référence, casse différente : le même', memeQualiteCurseur({ label: 'k7' }, { label: 'K7 ' }));
check('références différentes, même taille/poids : pas le même', !memeQualiteCurseur({ label: 'A', size: '5', sliderWeightG: 3 }, { label: 'B', size: '5', sliderWeightG: 3 }));
check('sans référence : taille, poids et photo décident', memeQualiteCurseur({ size: '5', sliderWeightG: 3 }, { label: 'N5', size: '5', sliderWeightG: 3 }));
check('deux entrées vides ne se confondent pas', !memeQualiteCurseur({}, {}));
const liste: any[] = [{ label: 'K7' }, { label: 'K8' }, { label: 'k7' }, { nameFR: 'sans ref' }];
const dedup = liste.filter((q, idx, arr) => arr.findIndex(x => x === q || memeQualiteCurseur(x, q)) === idx);
check('dédoublonnage des formulaires : K7, K8 et l’entrée sans référence gardés', dedup.length === 3, `→ ${dedup.length}`);

console.log(`\n${fail === 0 ? '✅' : '❌'} ${pass} réussis, ${fail} échoués`);
process.exit(fail === 0 ? 0 : 1);
