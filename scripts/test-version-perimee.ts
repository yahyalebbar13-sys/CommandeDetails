// Une page restée ouverte pendant une mise en ligne.
//
// Le logiciel va chercher certains morceaux au moment où il en a besoin — la fabrique de PDF au
// premier clic sur « Imprimer ». Chaque mise en ligne les renomme : un poste de caisse ouvert
// depuis le matin demande un fichier qui n'existe plus, et le magasin lisait
// « Loading chunk 8911 failed » suivi d'une URL.
// Lancer :
//   npx tsx scripts/test-version-perimee.ts

import { estVersionPerimee, messageSiVersionPerimee, MESSAGE_VERSION_PERIMEE } from '../src/lib/version-perimee';

let pass = 0;
let fail = 0;
function check(label: string, ok: boolean, detail = '') {
  if (ok) { pass++; console.log(`  ✓ ${label}`); }
  else { fail++; console.log(`  ✗ ${label} ${detail}`); }
}
const eq = (label: string, obtenu: any, attendu: any) =>
  check(label, obtenu === attendu, `→ obtenu ${JSON.stringify(obtenu)}, attendu ${JSON.stringify(attendu)}`);

console.log('\n── Reconnaître une page périmée ──');
// Le message exact reçu par le magasin, le 2026-09-30.
eq('le message vu en caisse',
  estVersionPerimee({ message: 'Loading chunk 8911 failed. (error: https://www.lebtex.ma/_next/static/chunks/8911-2a8e334d5d3274ed.js)' }),
  true);
eq('le nom de l’erreur suffit', estVersionPerimee({ name: 'ChunkLoadError', message: '' }), true);
eq('la formulation des navigateurs récents',
  estVersionPerimee({ message: 'Failed to fetch dynamically imported module: https://www.lebtex.ma/_next/static/chunks/x.js' }),
  true);
eq('celle de Safari', estVersionPerimee({ message: "Importing a module script failed." }), true);
eq('la casse ne compte pas', estVersionPerimee({ message: 'LOADING CHUNK 12 FAILED' }), true);

console.log('\n── Ce qui n’en est pas ──');
eq('un pop-up bloqué', estVersionPerimee({ message: "Le navigateur n'a pas ouvert la fenêtre" }), false);
eq('une écriture refusée par Firestore',
  estVersionPerimee({ message: 'Unsupported field value: undefined (found in field metadata)' }), false);
eq('un réseau coupé', estVersionPerimee({ message: 'Failed to fetch' }), false);
eq('rien du tout', estVersionPerimee(null), false);
eq('une chaîne vide', estVersionPerimee({ message: '' }), false);

console.log('\n── Le message rendu ──');
{
  // Hors navigateur, aucun rechargement n'est possible : le message doit tout de même sortir.
  const m = messageSiVersionPerimee({ name: 'ChunkLoadError', message: 'Loading chunk 9 failed' });
  eq('une page périmée a son message', m, MESSAGE_VERSION_PERIMEE);
  check('il dit ce qui se passe et ce qui va se passer',
    m!.includes('nouvelle version') && m!.includes('recharge'), m || '');
  check('il ne montre ni numéro de morceau ni URL', !/chunk|https?:/i.test(m!), m || '');
}
eq('toute autre erreur laisse la main à l’appelant',
  messageSiVersionPerimee({ message: 'Quantité invalide' }), null);

console.log(`\n${pass} réussis, ${fail} échoués`);
if (fail > 0) process.exit(1);
