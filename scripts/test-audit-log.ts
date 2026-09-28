// Le journal d'audit ne doit JAMAIS faire échouer ce qu'il journalise.
//
// Une vente au comptoir a été refusée à l'écran — « Impossible de valider la vente » — alors
// qu'elle était déjà enregistrée : la ligne d'audit portait un clientId indéfini (vente sans
// client), Firestore a refusé le document, et addDoc() lève de façon SYNCHRONE.
// Lancer :
//   npx tsx scripts/test-audit-log.ts

import { preparerEntreeAudit } from '../src/lib/audit-log';

let pass = 0;
let fail = 0;
function check(label: string, ok: boolean, detail = '') {
  if (ok) { pass++; console.log(`  ✓ ${label}`); }
  else { fail++; console.log(`  ✗ ${label} ${detail}`); }
}

/** Rien d'indéfini ne doit subsister, à n'importe quelle profondeur. */
function contientUndefined(valeur: any): boolean {
  if (valeur === undefined) return true;
  if (valeur === null || typeof valeur !== 'object') return false;
  if (Array.isArray(valeur)) return valeur.some(contientUndefined);
  return Object.values(valeur).some(contientUndefined);
}

console.log('\n── Une vente au comptoir, sans client ──');
const venteComptoir = preparerEntreeAudit({
  action: 'SALE_CREATED',
  userId: 'u1',
  userEmail: 'caisse@lebtex.ma',
  entityType: 'invoice',
  entityId: 'inv1',
  description: 'Vente comptoir · 3 article(s)',
  // Le champ qui a fait échouer la vraie vente : pas de client, donc pas d'identifiant.
  metadata: { storeId: 'CHRIFA', totalAfterDiscount: 1140, status: 'PAID', clientId: undefined },
} as any);
check('l’entrée ne porte plus aucune valeur indéfinie', !contientUndefined(venteComptoir),
  JSON.stringify(venteComptoir));
check('le client absent disparaît au lieu de bloquer',
  !('clientId' in ((venteComptoir as any).metadata || {})), JSON.stringify(venteComptoir));
check('ce qui est renseigné est conservé',
  (venteComptoir as any).metadata.storeId === 'CHRIFA'
  && (venteComptoir as any).metadata.totalAfterDiscount === 1140);
check('l’horodatage est posé', typeof (venteComptoir as any).timestamp === 'string');

console.log('\n── Un mouvement qui n’est pas un transfert ──');
const mouvement = preparerEntreeAudit({
  action: 'STOCK_OUT',
  userId: 'u1',
  userEmail: 'caisse@lebtex.ma',
  entityType: 'stockMovement',
  entityId: 'art1',
  description: 'Sortie · 50 m · DOUBLURE',
  // toStoreId n'existe que pour un transfert.
  metadata: { quantity: 50, storeId: 'CHRIFA', toStoreId: undefined, reason: 'VENTE' },
} as any);
check('le lieu d’arrivée absent ne bloque rien', !contientUndefined(mouvement));
check('le motif reste écrit', (mouvement as any).metadata.reason === 'VENTE');

console.log('\n── Les cas tordus ──');
const imbrique = preparerEntreeAudit({
  action: 'PAYMENT_RECORDED',
  userId: 'u1',
  userEmail: 'x@y.z',
  entityType: 'payment',
  entityId: 'p1',
  description: 'Paiement',
  metadata: {
    lignes: [{ montant: 100, cheque: undefined }, { montant: 50, cheque: 'FORM-001' }],
    client: { nom: 'ATELIER NOOR', ice: undefined },
  },
} as any);
check('les valeurs indéfinies imbriquées sont retirées', !contientUndefined(imbrique),
  JSON.stringify(imbrique));
check('les listes gardent leurs éléments',
  ((imbrique as any).metadata.lignes || []).length === 2);
check('une entrée sans metadata passe aussi',
  !contientUndefined(preparerEntreeAudit({
    action: 'STOCK_IN', userId: 'u', userEmail: '', entityType: 'stockMovement',
    entityId: 'a', description: 'x',
  } as any)));

console.log(`\n${pass} réussis, ${fail} échoués`);
if (fail > 0) process.exit(1);
