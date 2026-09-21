// Tests de l'authentification des webhooks ShipsGo (lib/shipsgo-webhook.ts).
// Lancer :
//   npx tsx scripts/test-shipsgo-webhook.ts

import {
  EVENEMENTS_SUIVIS,
  factureIdDepuisReference,
  signerCharge,
  signatureValide,
} from '../src/lib/shipsgo-webhook';

let pass = 0;
let fail = 0;
function check(label: string, ok: boolean, detail = '') {
  if (ok) { pass++; console.log(`  ✓ ${label}`); }
  else { fail++; console.log(`  ✗ ${label} ${detail}`); }
}

// Couple publié par ShipsGo pour vérifier une implémentation.
const SECRET_EXEMPLE = 'SUPER_LONG_AND_SECURE_SECRET_KEY';
const CHARGE_EXEMPLE = '{"message":"You shall not pass!"}';
const SIGNATURE_EXEMPLE = '9527e0c9463e6f5b01a0af50aecb4658ff50c6b25d3efa8e5c8dea7e4b763772';

console.log('\n── Signature ──');
check('exemple officiel ShipsGo reproduit', signerCharge(CHARGE_EXEMPLE, SECRET_EXEMPLE) === SIGNATURE_EXEMPLE,
  `→ ${signerCharge(CHARGE_EXEMPLE, SECRET_EXEMPLE)}`);
check('signature acceptée', signatureValide(CHARGE_EXEMPLE, SIGNATURE_EXEMPLE, SECRET_EXEMPLE));
check('majuscules et espaces tolérés', signatureValide(CHARGE_EXEMPLE, `  ${SIGNATURE_EXEMPLE.toUpperCase()} `, SECRET_EXEMPLE));

console.log('\n── Refus ──');
check('corps modifié rejeté', !signatureValide('{"message":"You shall pass!"}', SIGNATURE_EXEMPLE, SECRET_EXEMPLE));
check('autre secret rejeté', !signatureValide(CHARGE_EXEMPLE, SIGNATURE_EXEMPLE, 'un-autre-secret'));
check('signature absente rejetée', !signatureValide(CHARGE_EXEMPLE, null, SECRET_EXEMPLE));
check('signature vide rejetée', !signatureValide(CHARGE_EXEMPLE, '', SECRET_EXEMPLE));
check('signature tronquée rejetée', !signatureValide(CHARGE_EXEMPLE, SIGNATURE_EXEMPLE.slice(0, 40), SECRET_EXEMPLE));
check('secret non configuré : tout est rejeté', !signatureValide(CHARGE_EXEMPLE, SIGNATURE_EXEMPLE, ''));
check('un octet de différence rejeté',
  !signatureValide(CHARGE_EXEMPLE, SIGNATURE_EXEMPLE.replace(/.$/, c => (c === '2' ? '3' : '2')), SECRET_EXEMPLE));

console.log('\n── Rattachement au dossier ──');
check('référence du dossier retrouvée', factureIdDepuisReference('LEBTEX-26HD1004') === '26HD1004');
check('essai en ligne de commande ignoré', factureIdDepuisReference('LEBTEX-ESSAI-MSCU1234567') === undefined);
check('référence étrangère ignorée', factureIdDepuisReference('AUTRE-SYSTEME-42') === undefined);
check('référence absente tolérée', factureIdDepuisReference(null) === undefined);

console.log('\n── Événements ──');
check('création écoutée', EVENEMENTS_SUIVIS.has('OCEAN.SHIPMENTS.SHIPMENT_CREATED'));
check('mise à jour écoutée', EVENEMENTS_SUIVIS.has('OCEAN.SHIPMENTS.SHIPMENT_UPDATED'));
check('suppression non écoutée', !EVENEMENTS_SUIVIS.has('OCEAN.SHIPMENTS.SHIPMENT_DELETED'));
check('fret aérien non écouté', !EVENEMENTS_SUIVIS.has('AIR.SHIPMENTS.SHIPMENT_UPDATED'));

console.log(`\n${fail === 0 ? '✅' : '❌'} ${pass} réussis, ${fail} échoués\n`);
process.exit(fail === 0 ? 0 : 1);
