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
check('description → nom français', q?.nameFR === 'Curseur doré');
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
