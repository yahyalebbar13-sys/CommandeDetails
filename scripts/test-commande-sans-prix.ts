// Une commande peut se prendre sans prix, et le recevoir plus tard.
//
// Il n'y a plus de prix minimum : la caisse ne refuse plus rien. Ce qui la remplace est un
// rappel, et il doit s'éteindre au bon moment — ni trop tôt, ni jamais.
// Lancer :
//   npx tsx scripts/test-commande-sans-prix.ts

import {
  sansPrix, lignesSansPrix, attendUnPrix, prixSaisi, appliquerPrix,
} from '../src/lib/commande-sans-prix';

let pass = 0;
let fail = 0;
function check(label: string, ok: boolean, detail = '') {
  if (ok) { pass++; console.log(`  ✓ ${label}`); }
  else { fail++; console.log(`  ✗ ${label} ${detail}`); }
}
const eq = (label: string, obtenu: any, attendu: any) =>
  check(label, obtenu === attendu, `→ obtenu ${JSON.stringify(obtenu)}, attendu ${JSON.stringify(attendu)}`);

const ligne = (unitPrice: number, qty = 10) => ({ productName: 'FERMETURE N5', qty, unitPrice, totalPrice: unitPrice * qty });

console.log('\n── Une ligne a un prix, ou elle n’en a pas ──');
eq('12,50 est un prix', sansPrix(ligne(12.5)), false);
eq('zéro n’en est pas un', sansPrix(ligne(0)), true);
eq('un prix absent non plus', sansPrix({ qty: 10 }), true);
eq('ni un prix négatif — aucune vente ne rapporte moins que rien', sansPrix(ligne(-5)), true);
eq('ni du texte', sansPrix({ unitPrice: 'à voir' as any }), true);

console.log('\n── Le rappel s’allume et s’éteint au bon moment ──');
const commande = (items: any[], status = 'CONFIRMED') => ({ items, status });
eq('deux lignes sur trois sans prix', lignesSansPrix(commande([ligne(0), ligne(12), ligne(0)])), 2);
eq('une commande complète n’attend rien', attendUnPrix(commande([ligne(12), ligne(8)])), false);
eq('une commande incomplète se signale', attendUnPrix(commande([ligne(12), ligne(0)])), true);
eq('une commande facturée ne se signale plus',
  attendUnPrix(commande([ligne(0)], 'INVOICED')), false);
eq('une commande annulée non plus',
  attendUnPrix(commande([ligne(0)], 'CANCELLED')), false);
eq('un brouillon sans prix se signale', attendUnPrix(commande([ligne(0)], 'DRAFT')), true);
eq('une commande sans aucune ligne ne se signale pas', attendUnPrix(commande([])), false);

console.log('\n── Les prix tapés au clavier ──');
eq('« 12,50 » se lit à la française', prixSaisi('12,50'), 12.5);
eq('« 12.50 » aussi', prixSaisi('12.50'), 12.5);
eq('les espaces ne gênent pas', prixSaisi('  8 '), 8);
eq('le vide ne vaut rien', prixSaisi(''), 0);
eq('un texte ne vaut rien', prixSaisi('à voir'), 0);
eq('un prix négatif ne vaut rien', prixSaisi('-3'), 0);
eq('les centimes s’arrêtent au centime', prixSaisi('12,3456'), 12.35);

console.log('\n── La saisie des prix sur une commande ──');
{
  const items = [ligne(0, 10), ligne(0, 4), ligne(20, 2)];
  const r = appliquerPrix(items, { 0: '12,50', 1: '30' });
  eq('la première ligne est chiffrée', r.items[0].unitPrice, 12.5);
  eq('et son total suit', r.items[0].totalPrice, 125);
  eq('la deuxième aussi', r.items[1].totalPrice, 120);
  eq('celle qui avait déjà un prix n’est pas touchée', r.items[2].totalPrice, 40);
  eq('le total de la commande', r.totalAmount, 285);
  eq('rien n’attend plus de prix', r.restantSansPrix, 0);
}
{
  // Une ligne laissée vide reste sans prix : on ne force personne, la commande se rappellera.
  const r = appliquerPrix([ligne(0, 10), ligne(0, 5)], { 0: '10' });
  eq('la ligne saisie est chiffrée', r.items[0].totalPrice, 100);
  eq('l’autre attend toujours', r.restantSansPrix, 1);
  eq('et le total ne compte que ce qui est chiffré', r.totalAmount, 100);
}
{
  // Effacer un prix est un geste légitime : la ligne repasse en attente.
  const r = appliquerPrix([ligne(12, 10)], { 0: '' });
  eq('un prix effacé remet la ligne en attente', r.restantSansPrix, 1);
  eq('et son total tombe à zéro', r.items[0].totalPrice, 0);
}

console.log('\n── La remise accordée survit à la saisie des prix ──');
{
  const r = appliquerPrix([ligne(0, 10)], { 0: '100' }, 10);
  eq('sous-total', r.totalAmount, 1000);
  eq('remise de 10 % appliquée au nouveau sous-total', r.totalAfterDiscount, 900);
}
{
  const r = appliquerPrix([ligne(0, 3)], { 0: '33,33' }, 0);
  eq('sans remise, les deux totaux coïncident', r.totalAfterDiscount, r.totalAmount);
  eq('et les centimes sont justes', r.totalAmount, 99.99);
}
{
  const r = appliquerPrix([ligne(0, 10)], { 0: '100' }, 150);
  eq('une remise aberrante est ramenée à 100 %', r.totalAfterDiscount, 0);
}
{
  const r = appliquerPrix([ligne(0, 10)], { 0: '100' }, -20 as any);
  eq('une remise négative ne gonfle pas le total', r.totalAfterDiscount, 1000);
}

console.log('\n── Les cas tordus ──');
eq('une commande sans items ne casse rien', lignesSansPrix({}), 0);
eq('appliquer des prix à rien ne casse rien', appliquerPrix([], {}).totalAmount, 0);
{
  const r = appliquerPrix([{ productName: 'X', qty: undefined, unitPrice: 0 }], { 0: '50' });
  eq('une quantité absente ne produit pas NaN', r.items[0].totalPrice, 0);
  eq('mais la ligne a bien reçu son prix', r.items[0].unitPrice, 50);
}

console.log(`\n${pass} réussis, ${fail} échoués`);
if (fail > 0) process.exit(1);
