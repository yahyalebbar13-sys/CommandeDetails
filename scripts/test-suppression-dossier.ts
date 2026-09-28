// Tests de la suppression d'un dossier d'arrivage (lib/suppression-dossier.ts).
// Lancer :
//   npx tsx scripts/test-suppression-dossier.ts

import { effetsSuppression, planSuppressionDossier, type EcritureSuppression } from '../src/lib/suppression-dossier';

let pass = 0;
let fail = 0;
function check(label: string, ok: boolean, detail = '') {
  if (ok) { pass++; console.log(`  ✓ ${label}`); }
  else { fail++; console.log(`  ✗ ${label} ${detail}`); }
}
const maj = (e: EcritureSuppression[], id: string) => e.find(x => x.op === 'update' && x.id === id) as Extract<EcritureSuppression, { op: 'update' }> | undefined;
const supprime = (e: EcritureSuppression[], id: string) => e.some(x => x.op === 'delete' && x.id === id);
const json = (v: unknown) => JSON.stringify(v);

console.log('\n── Dossier en route : retour en production ──');
{
  // Cas réel du 28/09 : import MH (PL seul) puis suppression du dossier.
  const origine = { id: 'J3aj', originalOrderId: 'J3aj', status: 'PI', factureId: '', categoryId: 'NON WOVEN 1030EF', unitOfMeasure: 'rolls', purchasePricePerUnit: 5.95, color: 'white', size: '90cm', quantity: 264, netWeight: 0, cubicMeasurement: 0, colorBreakdown: null, sizeBreakdown: null };
  const part = { ...origine, id: '9ce9', originalOrderId: 'J3aj', status: 'TRANSIT', rawStatus: 'SHIPPED', factureId: 'D1', quantity: 3036, netWeight: 12614.8, cubicMeasurement: 56.98, codeFournisseur: '6402-1037', refFactureFournisseur: '45-2 6402-1037', specs: '90Y/roll 6rolls/sackbag', arrivalDate: '2026-11-18' };
  const solde = { id: 'Wv9Q', status: 'SHIPPED', factureId: 'D1', unitOfMeasure: 'rolls', purchasePricePerUnit: 4.1, color: 'white', quantity: 306, netWeight: 765, arrivalDate: '2026-11-18' };
  const ailleurs = { id: 'autre', status: 'SHIPPED', factureId: 'D2', quantity: 5 };
  const plan = planSuppressionDossier('D1', false, [origine, part, solde, ailleurs]);
  const e = plan.ecritures;

  check('commande entière → PI, sans dossier', maj(e, 'Wv9Q')?.data.status === 'PI' && maj(e, 'Wv9Q')?.data.factureId === '');
  check('dates du transit retirées', json(maj(e, 'Wv9Q')?.retirer) === json(['arrivalDate', 'stockEntryDate', 'validatedAt']));
  check('poids de la commande entière gardé (non réécrit)', maj(e, 'Wv9Q')?.data.netWeight === undefined);
  check('part expédiée supprimée', supprime(e, '9ce9'));
  const o = maj(e, 'J3aj')?.data;
  check('commande d\'origine : 264 + 3036 = 3300', o?.quantity === 3300, `→ ${o?.quantity}`);
  check('poids et volume de la part repris', o?.netWeight === 12614.8 && o?.cubicMeasurement === 56.98, `→ ${o?.netWeight} / ${o?.cubicMeasurement}`);
  check('code fournisseur repris pour le prochain import', o?.codeFournisseur === '6402-1037');
  check('origine déjà en production : statut non réécrit', o?.status === undefined && o?.factureId === undefined);
  check('même couleur et taille : pas de répartition créée', o?.colorBreakdown === undefined && o?.color === undefined);
  check('article d\'un autre dossier intact', !e.some(x => x.id === 'autre'));
  check('compteurs', plan.enProduction === 1 && plan.reunies === 1 && plan.detaches === 0, json(plan));
}

console.log('\n── Répartitions ──');
{
  // « Expédier » la couleur A d'une commande A+B : deux fiches d'une couleur chacune.
  const o = { id: 'O', originalOrderId: 'O', status: 'PI', factureId: '', unitOfMeasure: 'bag', purchasePricePerUnit: 5.9, color: 'B360', size: '75CM', quantity: 20, colorBreakdown: null };
  const p = { ...o, id: 'P', status: 'SHIPPED', factureId: 'D1', color: 'WHITE', quantity: 10 };
  const d = maj(planSuppressionDossier('D1', false, [o, p]).ecritures, 'O')?.data;
  check('deux couleurs → répartition refaite', json(d?.colorBreakdown) === json([{ colorCode: 'B360', rolls: 20 }, { colorCode: 'WHITE', rolls: 10 }]), json(d?.colorBreakdown));
  check('couleur de la fiche « various »', d?.color === 'various' && d?.quantity === 30);
}
{
  const o = { id: 'O', originalOrderId: 'O', status: 'PI', factureId: '', unitOfMeasure: 'bag', purchasePricePerUnit: 5.9, size: '75CM', quantity: 300, color: 'various', colorBreakdown: [{ colorCode: 'BLACK', rolls: 200, priceOverride: '' }, { colorCode: 'A501', rolls: 100, priceOverride: '' }] };
  const p = { ...o, id: 'P', status: 'SHIPPED', factureId: 'D1', quantity: 150, colorBreakdown: [{ colorCode: 'a501', rolls: 50, priceOverride: '' }, { colorCode: 'A700', rolls: '100', priceOverride: '' }] };
  const d = maj(planSuppressionDossier('D1', false, [o, p]).ecritures, 'O')?.data;
  check('couleurs communes additionnées, nouvelles ajoutées', json(d?.colorBreakdown) === json([
    { colorCode: 'BLACK', rolls: 200, priceOverride: '' }, { colorCode: 'A501', rolls: 150, priceOverride: '' }, { colorCode: 'A700', rolls: '100', priceOverride: '' },
  ]), json(d?.colorBreakdown));
  check('quantité totale', d?.quantity === 450);
  check('sans poids nulle part : aucun poids écrit', d?.netWeight === undefined && d?.cubicMeasurement === undefined);
}
{
  const o = { id: 'O', originalOrderId: 'O', status: 'PI', factureId: '', unitOfMeasure: 'pcs', purchasePricePerUnit: 1, color: 'black', quantity: 100, sizeBreakdown: [{ size: '60CM', quantity: 100 }] };
  const p = { ...o, id: 'P', status: 'SHIPPED', factureId: 'D1', quantity: 40, size: '75CM', sizeBreakdown: null };
  const d = maj(planSuppressionDossier('D1', false, [o, p]).ecritures, 'O')?.data;
  check('une taille unique rejoint une répartition par taille', json(d?.sizeBreakdown) === json([{ size: '60CM', quantity: 100 }, { size: '75CM', quantity: 40 }]) && d?.size === 'various', json(d));
}

console.log('\n── Retour impossible : la part repart seule en production ──');
{
  const base = { id: 'O', originalOrderId: 'O', status: 'PI', factureId: '', unitOfMeasure: 'rolls', purchasePricePerUnit: 5.95, color: 'white', size: '90cm', quantity: 264 };
  const part = { ...base, id: 'P', status: 'SHIPPED', factureId: 'D1', quantity: 3036 };
  const seule = (articles: any[], label: string) => {
    const e = planSuppressionDossier('D1', false, articles).ecritures;
    check(label, !supprime(e, 'P') && maj(e, 'P')?.data.status === 'PI' && !maj(e, 'O'), json(e));
  };
  seule([base, { ...part, purchasePricePerUnit: 6 }], 'prix différent');
  seule([base, { ...part, unitOfMeasure: 'yds' }], 'unité différente');
  seule([{ ...base, status: 'SHIPPED', factureId: 'D2' }, part], 'origine partie dans un autre dossier');
  seule([part], 'origine introuvable');
  seule([base, { ...part, color: 'black', size: '75cm' }], 'couleur ET taille différentes');
  seule([base, { ...part, colorBreakdown: [{ colorCode: 'white', rolls: 3036 }], sizeBreakdown: [{ size: '90cm', quantity: 3036 }] }], 'couleurs et tailles sur la même fiche');
  seule([{ ...base, status: 'DELIVERED' }, part], 'origine livrée');
}

console.log('\n── Origine dans le même dossier, plusieurs parts ──');
{
  const o = { id: 'O', originalOrderId: 'O', status: 'SHIPPED', factureId: 'D1', unitOfMeasure: 'rolls', purchasePricePerUnit: 2, color: 'red', quantity: 10, netWeight: 1.111 };
  const p1 = { ...o, id: 'P1', quantity: 5, netWeight: 2.222 };
  const p2 = { ...o, id: 'P2', quantity: 7, netWeight: 0 };
  const plan = planSuppressionDossier('D1', false, [p1, o, p2]);
  const d = maj(plan.ecritures, 'O');
  check('les deux parts rejoignent l\'origine', supprime(plan.ecritures, 'P1') && supprime(plan.ecritures, 'P2'));
  check('origine en production avec 10 + 5 + 7', d?.data.status === 'PI' && d?.data.factureId === '' && d?.data.quantity === 22, json(d));
  check('poids additionnés et arrondis', d?.data.netWeight === 3.33, `→ ${d?.data.netWeight}`);
  check('une seule écriture pour l\'origine', plan.ecritures.filter(x => x.id === 'O').length === 1);
  check('compteurs', plan.enProduction === 1 && plan.reunies === 2, json(plan));
}

console.log('\n── Statuts qui ne repartent pas en production ──');
{
  const e = planSuppressionDossier('D1', false, [
    { id: 'pi', status: 'PI', factureId: 'D1' },
    { id: 'livre', status: 'DELIVERED', factureId: 'D1' },
    { id: 'transit', status: 'TRANSIT', factureId: 'D1' },
  ]).ecritures;
  check('déjà en production : seulement détaché', json(maj(e, 'pi')?.data) === json({ factureId: '' }) && !maj(e, 'pi')?.retirer);
  check('livré au client : seulement détaché', json(maj(e, 'livre')?.data) === json({ factureId: '' }));
  check('ancien statut TRANSIT enregistré → PI', maj(e, 'transit')?.data.status === 'PI');
}

console.log('\n── Dossier déjà en stock ──');
{
  const o = { id: 'O', originalOrderId: 'O', status: 'PI', factureId: '', unitOfMeasure: 'rolls', purchasePricePerUnit: 1, quantity: 1 };
  const p = { ...o, id: 'P', status: 'STOCK', factureId: 'D1', stockEntryDate: '2026-09-01' };
  const plan = planSuppressionDossier('D1', true, [o, p]);
  check('rien ne repart en production', plan.enProduction === 0 && plan.reunies === 0 && plan.detaches === 1);
  check('seulement détaché, comme avant', json(plan.ecritures) === json([{ op: 'update', id: 'P', data: { factureId: '', status: 'SHIPPED' } }]), json(plan.ecritures));
}

console.log('\n── Dossier vide ──');
{
  const plan = planSuppressionDossier('D1', false, [{ id: 'x', status: 'SHIPPED', factureId: 'D2' }]);
  check('aucune écriture', plan.ecritures.length === 0 && plan.enProduction + plan.reunies + plan.detaches === 0);
  check('rien à dire', effetsSuppression(plan) === '');
}

console.log('\n── Phrase ──');
{
  const vide = { ecritures: [], enProduction: 0, reunies: 0, detaches: 0 };
  check('singuliers', effetsSuppression({ ...vide, enProduction: 1, reunies: 1 }) === "1 article repart en production, 1 part expédiée rejoint sa commande d'origine.");
  check('pluriels', effetsSuppression({ ...vide, enProduction: 2, detaches: 3 }) === '2 articles repartent en production, 3 articles sont seulement détachés.');
}

console.log(`\n${fail === 0 ? '✅' : '❌'} ${pass} réussis, ${fail} échoués`);
process.exit(fail === 0 ? 0 : 1);
