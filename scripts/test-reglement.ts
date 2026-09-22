// Règle unique de l'imputation d'un règlement et du statut d'une facture.
// Ces tests figent les cas qui ont réellement coûté de l'argent : un règlement en deux modes dont
// la moitié disparaissait, et un chèque dont le rejet rouvrait la mauvaise dette.
// Lancer :
//   npx tsx scripts/test-reglement.ts

import {
  centimes, memeMontant, estEffet, effetEnAttente, imputationsDuPaiement,
  repartirSurFactures, statutFacture, resteADevoir, agregerParFacture,
} from '../src/lib/reglement';

let pass = 0;
let fail = 0;
function check(label: string, ok: boolean, detail = '') {
  if (ok) { pass++; console.log(`  ✓ ${label}`); }
  else { fail++; console.log(`  ✗ ${label} ${detail}`); }
}

console.log('\n── Montants ──');
check('arrondi au centime', centimes(0.1 + 0.2) === 0.3 && centimes('12,5' as any) === 0);
check('valeurs vides', centimes(null) === 0 && centimes(undefined) === 0 && centimes('abc') === 0);
check('égalité à un demi-centime près', memeMontant(1000, 1000.004) && !memeMontant(1000, 1000.02));

console.log('\n── Effets ──');
check('méthodes papier', estEffet('CHEQUE') && estEffet('lc') && estEffet(' Effet ') && !estEffet('CASH'));
check('chèque remis : en attente', effetEnAttente({ method: 'CHEQUE', status: 'PENDING' }));
check('chèque sans statut : en attente', effetEnAttente({ method: 'CHEQUE' }));
check('chèque encaissé : plus en attente', !effetEnAttente({ method: 'CHEQUE', status: 'CLEARED' }));
check('chèque rejeté : plus en attente', !effetEnAttente({ method: 'CHEQUE', status: 'REJECTED' }));
check('espèces : jamais un effet', !effetEnAttente({ method: 'CASH', status: 'PENDING' }));

console.log('\n── Statut d’une facture ──');
check('soldée en espèces → payée', statutFacture(10000, 10000, false) === 'PAID');
check('soldée par chèque non encaissé → en attente', statutFacture(10000, 10000, true) === 'PENDING');
check('partiellement réglée → partielle', statutFacture(10000, 6000, false) === 'PARTIAL');
check('partielle avec un effet en l’air → en attente', statutFacture(10000, 6000, true) === 'PENDING');
check('rien reçu → impayée', statutFacture(10000, 0, false) === 'UNPAID');
check('reliquat d’un centime : considérée soldée', statutFacture(10000, 9999.998, false) === 'PAID');
check('reste à devoir borné à zéro', resteADevoir({ totalAfterDiscount: 100, paidAmount: 150 }) === 0);

console.log('\n── Imputations d’un règlement ──');
check('règlement d’avant : une seule facture',
  JSON.stringify(imputationsDuPaiement({ invoiceId: 'F1', amount: 500 })) === '[{"invoiceId":"F1","amount":500}]');
check('règlement global : plusieurs factures',
  imputationsDuPaiement({ invoiceId: 'F1', amount: 900, allocations: [{ invoiceId: 'F1', amount: 700 }, { invoiceId: 'F2', amount: 200 }] })
    .map(l => `${l.invoiceId}:${l.amount}`).join(',') === 'F1:700,F2:200');
check('acompte sans facture : rien à imputer', imputationsDuPaiement({ amount: 500 }).length === 0);

console.log('\n── Répartition sur les factures ──');
const factures = [{ id: 'F1', reste: 700 }, { id: 'F2', reste: 500 }];
check('la plus ancienne d’abord, sans dépasser son solde',
  repartirSurFactures(900, factures).map(l => `${l.invoiceId}:${l.amount}`).join(',') === 'F1:700,F2:200');
check('le trop-perçu n’est imputé nulle part (acompte)',
  repartirSurFactures(2000, factures).reduce((s, l) => s + l.amount, 0) === 1200);
check('une facture déjà soldée est sautée',
  repartirSurFactures(300, [{ id: 'F0', reste: 0 }, { id: 'F1', reste: 700 }])
    .map(l => l.invoiceId).join(',') === 'F1');

console.log('\n── Agrégation : le cas qui faisait disparaître l’argent ──');
// 6 000 espèces + 4 000 chèque sur la même facture de 10 000 : chaque ligne repartait du solde
// d'avant et écrasait la précédente, la facture finissait à 4 000 payés.
const cumul = agregerParFacture([
  { invoiceId: 'F1', amount: 6000, method: 'CASH' },
  { invoiceId: 'F1', amount: 4000, method: 'CHEQUE', status: 'PENDING' },
]);
check('les deux lignes sont additionnées', cumul.get('F1')?.montant === 10000, JSON.stringify([...cumul]));
check('un effet en l’air suffit à mettre la facture en attente', cumul.get('F1')?.effetEnCours === true);
check('facture soldée mais chèque en l’air → PENDING, pas PAID',
  statutFacture(10000, cumul.get('F1')!.montant, cumul.get('F1')!.effetEnCours) === 'PENDING');

const cumul2 = agregerParFacture([
  { amount: 900, method: 'CHEQUE', status: 'PENDING', allocations: [{ invoiceId: 'F1', amount: 700 }, { invoiceId: 'F2', amount: 200 }] },
  { invoiceId: 'F1', amount: 300, method: 'CASH' },
]);
check('un chèque à cheval sur deux factures les alimente toutes les deux',
  cumul2.get('F1')?.montant === 1000 && cumul2.get('F2')?.montant === 200, JSON.stringify([...cumul2]));
check('espèces seules sur une facture : pas d’effet en attente',
  agregerParFacture([{ invoiceId: 'F3', amount: 100, method: 'CASH' }]).get('F3')?.effetEnCours === false);

console.log(`\n${pass} réussis, ${fail} échoués`);
if (fail > 0) process.exit(1);
