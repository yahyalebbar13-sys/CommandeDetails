// Tests des lignes logistiques (lib/lignes-logistiques.ts) et des unités par
// pôle (lib/unites-pole.ts).
// Lancer :
//   npx tsx scripts/test-lignes-logistiques.ts

import { listerLignes, specParDefautDeLigne, specPourLigne, trouverLigne, cleLigne } from '../src/lib/lignes-logistiques';
import { pasDeSaisie, poleDeLArticle, uniteDecimale, uniteDeStock, uniteImposee } from '../src/lib/unites-pole';

let pass = 0;
let fail = 0;
function check(label: string, ok: boolean, detail = '') {
  if (ok) { pass++; console.log(`  ✓ ${label}`); }
  else { fail++; console.log(`  ✗ ${label} ${detail}`); }
}

console.log('\n── Spécification déduite du nom d’une ligne ──');
check('Fabric → fabric', specParDefautDeLigne('Fabric') === 'fabric');
check('Slider et puller → slider', specParDefautDeLigne('Slider et puller') === 'slider');
check('Slider & Puller → slider', specParDefautDeLigne('Slider & Puller') === 'slider');
check('Zipper → zipper', specParDefautDeLigne('Zipper') === 'zipper');
check('Thread → thread', specParDefautDeLigne('Thread') === 'thread');
check('Fil à coudre → thread', specParDefautDeLigne('Fil à coudre') === 'thread');
check('PROFIL n’est pas du fil', specParDefautDeLigne('PROFIL') === 'none');
check('Ruban → tape (il donnait « aucune »)', specParDefautDeLigne('Ruban') === 'tape');
check('Bouton → accessory', specParDefautDeLigne('Bouton') === 'accessory');
check('Accessoires → accessory', specParDefautDeLigne('Accessoires') === 'accessory');
check('Reste → aucune', specParDefautDeLigne('Reste') === 'none');
check('écritures d’une même ligne confondues', cleLigne(' Zipper ') === cleLigne('ZIPPER'));

console.log('\n── Liste des lignes ──');
const poles = [
  { id: 'taffeta', name: 'TAFFETA FABRIC', line: 'Fabric', specType: 'fabric' as const },
  { id: 'popeline', name: 'POPELINE', line: 'fabric', specType: 'fabric' as const },
  { id: 'nylon', name: 'NYLON ZIPPER', line: 'Zipper', specType: 'zipper' as const },
  // Pôle accessoire resté en « fabric » par erreur (défaut historique en base).
  { id: 'boucle', name: 'BOUCLES', line: 'Accessoire', specType: 'fabric' as const },
  { id: 'bouton', name: 'BOUTONS', line: 'Accessoire', specType: 'accessory' as const },
  { id: 'elas', name: 'ÉLASTIQUE', line: 'Élastiques', specType: 'tape' as const },
];
const lignes = listerLignes({}, poles);
const fabric = trouverLigne(lignes, 'FABRIC')!;
check('une seule ligne Fabric malgré deux écritures', lignes.filter(l => cleLigne(l.nom) === 'fabric').length === 1);
check('Fabric regroupe ses deux pôles', fabric.poles.length === 2, `→ ${fabric.poles}`);
check('Fabric : spécification des pôles', fabric.specType === 'fabric' && fabric.source === 'poles');
const acc = trouverLigne(lignes, 'Accessoire')!;
check('pôles en désaccord : le nom de la ligne tranche', acc.specType === 'accessory' && acc.source === 'defaut');
check('le pôle resté en fabric est à harmoniser', acc.polesAHarmoniser.join() === 'boucle', `→ ${acc.polesAHarmoniser}`);
const elas = trouverLigne(lignes, 'élastiques')!;
check('ligne personnalisée connue par son pôle', Boolean(elas) && elas.specType === 'tape');
check('ligne de base sans pôle toujours proposée', Boolean(trouverLigne(lignes, 'Ruban')));
check('Ruban sans pôle : tape', trouverLigne(lignes, 'Ruban')?.specType === 'tape');

const enregistrees = listerLignes({ Accessoire: { specType: 'accessory' }, Fabric: { specType: 'fabric' }, Étiquettes: { specType: 'none' } }, poles);
check('ligne enregistrée : source enregistrée', trouverLigne(enregistrees, 'Accessoire')?.source === 'enregistree');
check('ligne enregistrée sans pôle proposée', Boolean(trouverLigne(enregistrees, 'étiquettes')));
const forcee = listerLignes({ Fabric: { specType: 'tape' } }, poles);
check('la ligne enregistrée prime sur ses pôles', trouverLigne(forcee, 'Fabric')?.specType === 'tape');
check('… et tous ses pôles sont à harmoniser', trouverLigne(forcee, 'Fabric')?.polesAHarmoniser.length === 2);

console.log('\n── Spécification reçue par un pôle ──');
check('pôle déplacé vers Zipper → zipper', specPourLigne(lignes, 'Zipper') === 'zipper');
check('ligne tapée à la main inconnue → déduite du nom', specPourLigne(lignes, 'Nouvelle ligne fermeture') === 'zipper');
check('sans ligne → aucune', specPourLigne(lignes, '') === 'none');

console.log('\n── Unités imposées par pôle ──');
const taffeta = { id: 'taffeta', uniteAchat: 'm', uniteVente: 'm' };
const libre = { id: 'libre' };
const mixte = { id: 'mixte', uniteAchat: 'rolls', uniteVente: 'm' };
check('Taffeta : achat en m', uniteImposee(taffeta, 'achat') === 'm');
check('Taffeta : vente en m', uniteImposee(taffeta, 'vente') === 'm');
check('Taffeta : stock en m', uniteDeStock(taffeta) === 'm');
check('pôle libre : rien d’imposé', uniteImposee(libre, 'achat') === undefined && uniteDeStock(libre) === undefined);
check('achat ≠ vente : le stock reste dans l’unité d’achat', uniteDeStock(mixte) === 'rolls');
check('espace seule = rien', uniteImposee({ uniteAchat: '  ' }, 'achat') === undefined);

console.log('\n── Pôle d’un article ──');
const categories = [
  { id: 'c1', name: 'TAFFETA 190T', generalCategoryId: 'taffeta' },
  { id: 'c2', name: 'NYLON N3', generalCategoryId: 'libre' },
];
const tousPoles = [taffeta, libre, mixte];
check('par le NOM de catégorie (commandes)', poleDeLArticle({ categoryId: 'TAFFETA 190T' }, categories, tousPoles)?.id === 'taffeta');
check('par l’identifiant de catégorie', poleDeLArticle({ categoryId: 'c1' }, categories, tousPoles)?.id === 'taffeta');
check('la catégorie prime sur un pôle périmé de l’article',
  poleDeLArticle({ categoryId: 'TAFFETA 190T', generalCategoryId: 'mixte' }, categories, tousPoles)?.id === 'taffeta');
check('sans catégorie connue : pôle de l’article', poleDeLArticle({ categoryId: 'X', generalCategoryId: 'mixte' }, categories, tousPoles)?.id === 'mixte');
check('rien du tout', poleDeLArticle({ categoryId: 'X' }, categories, tousPoles) === undefined);

console.log('\n── Décimales ──');
check('mètres : décimales', uniteDecimale('m') && pasDeSaisie('m') === 0.01);
check('yards et kg : décimales', uniteDecimale('yds') && uniteDecimale('kg'));
check('pièces : entiers', !uniteDecimale('pièces') && pasDeSaisie('pièces') === 1);
check('rouleaux : entiers', !uniteDecimale('rolls'));

console.log(`\n${fail === 0 ? '✅' : '❌'} ${pass} réussis, ${fail} échoués`);
process.exit(fail === 0 ? 0 : 1);
