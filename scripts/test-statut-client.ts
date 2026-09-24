// Tests des étapes vues par le client (lib/statut-client.ts).
// Lancer :
//   npx tsx scripts/test-statut-client.ts

import { dateFr, etapeClient, nombreFr, phraseEtape, rangEtape, titreEtape } from '../src/lib/statut-client';

let pass = 0;
let fail = 0;
function check(label: string, ok: boolean, detail = '') {
  if (ok) { pass++; console.log(`  ✓ ${label}`); }
  else { fail++; console.log(`  ✗ ${label} ${detail}`); }
}

console.log('\n── Étapes ──');
check('PI → en fabrication', titreEtape('PI') === 'En fabrication');
check('SHIPPED et TRANSIT → en mer', etapeClient('SHIPPED') === 'mer' && etapeClient('TRANSIT') === 'mer');
check('CUSTOMS → douane', etapeClient('CUSTOMS') === 'douane');
check('STOCK → prête à livrer', titreEtape('STOCK') === 'Prête à livrer');
check('DELIVERED → livrée', etapeClient('DELIVERED') === 'livree');
check('inconnu ou vide → enregistrée', etapeClient('') === 'enregistree' && etapeClient('TO_ORDER') === 'enregistree');
check('ordre du parcours', rangEtape('enregistree') === 0 && rangEtape('livree') === 5 && rangEtape('douane') === 3);
check('jamais le code interne dans la phrase',
  !/\b(PI|CUSTOMS|STOCK|SHIPPED)\b/.test(phraseEtape('PI') + phraseEtape('CUSTOMS') + phraseEtape('STOCK')));

console.log('\n── Formats ──');
check('date ISO → jj/mm/aaaa', dateFr('2026-10-02') === '02/10/2026');
check('date avec heure', dateFr('2026-10-02T09:00:00+01:00') === '02/10/2026');
check('date absente ou illisible → vide', dateFr(null) === '' && dateFr('n/a') === '');
check('nombre à la française', nombreFr(1000).replace(/\s/g, ' ') === '1 000' && nombreFr(2.5) === '2,5', `→ ${JSON.stringify(nombreFr(1000))}`);

console.log(`\n${fail === 0 ? '✅' : '❌'} ${pass} réussis, ${fail} échoués`);
process.exit(fail === 0 ? 0 : 1);
