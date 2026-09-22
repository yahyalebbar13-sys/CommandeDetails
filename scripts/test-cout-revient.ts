// Tests du coût de revient simulé (lib/cout-revient.ts).
// Lancer :
//   npx tsx scripts/test-cout-revient.ts
//
// L'enjeu n'est pas que le calcul « marche », c'est qu'il donne LE MÊME chiffre
// que l'écran « Coût Revient » (src/components/cost-analysis-view.tsx:83-161).
// Le premier bloc recalcule donc la chaîne à la main, terme par terme, et
// compare — si quelqu'un modifie la formule d'un côté, ce test le dit.

import {
  fretMoyenParM3,
  simulerCoutRevient,
  tauxChangeRecent,
  tauxDeLaCategorie,
  type EntreeSimulation,
} from '../src/lib/cout-revient';

let pass = 0;
let fail = 0;
function check(label: string, ok: boolean, detail = '') {
  if (ok) { pass++; console.log(`  ✓ ${label}`); }
  else { fail++; console.log(`  ✗ ${label} ${detail}`); }
}
const presque = (a: number, b: number, tolerance = 0.01) => Math.abs(a - b) < tolerance;

// Un lot réaliste : 5 000 fermetures achetées 0,42 $, 850 kg, 3,2 m³.
const lot: EntreeSimulation = {
  quantite: 5000,
  prixAchatUnitaire: 0.42,
  poidsNetTotal: 850,
  volumeTotal: 3.2,
  tauxChange: 10.2,
  fretParM3: 95,
  fraisDossier: 14000,
  volumeDossier: 64,
  douane: { valeurAuKg: 38, di: 25, tpi: 0.25, tic: 0, tva: 20 },
  margePct: 15,
  tvaVentePct: 20,
};

console.log('\n── Les mêmes chiffres que l’écran « Coût Revient » ──');
{
  const r = simulerCoutRevient(lot);

  // La chaîne de cost-analysis-view.tsx, recopiée à la main.
  const valAchatMad = 5000 * 0.42 * 10.2;                       // l.138
  const fretMad = 95 * 3.2 * 10.2;                              // l.95, ramené au lot
  const mtFrais = (fretMad + 14000 * (3.2 / 64)) / 1.20;        // l.96 et l.110
  const valDouane = 850 * 38;                                   // l.130
  const di = valDouane * 0.25;                                  // l.131
  const tpi = valDouane * 0.0025;                               // l.132
  const tic = valDouane * 0;                                    // l.133
  const tva = (valDouane + di + tpi + tic) * 0.20;              // l.134
  const totalDouane = di + tpi + tic + tva;                     // l.135
  const mtTotal = valAchatMad + mtFrais + totalDouane;          // l.139
  const pauTtc = mtTotal / 5000;                                // l.141

  check('valeur d’achat convertie', presque(r.valeurAchat, valAchatMad), `${r.valeurAchat} ≠ ${valAchatMad}`);
  check('fret au mètre cube', presque(r.fret, fretMad), `${r.fret} ≠ ${fretMad}`);
  check('frais logistiques hors TVA', presque(r.fraisTotal, mtFrais), `${r.fraisTotal} ≠ ${mtFrais}`);
  check('valeur en douane au kilo', presque(r.valeurDouane, valDouane));
  check('droits d’importation', presque(r.di, di));
  check('taxe parafiscale', presque(r.tpi, tpi));
  check('TVA sur douane + DI + TPI + TIC', presque(r.tvaImport, tva), `${r.tvaImport} ≠ ${tva}`);
  check('total des droits', presque(r.totalDouane, totalDouane));
  check('coût de revient du lot', presque(r.coutTotal, mtTotal), `${r.coutTotal} ≠ ${mtTotal}`);
  check('P.A.U TTC', presque(r.coutUnitaire, pauTtc), `${r.coutUnitaire} ≠ ${pauTtc}`);
  check('aucune alerte sur un lot complet', r.alertes.length === 0, r.alertes.join(' | '));
}

console.log('\n── La TVA porte bien sur le TIC ──');
{
  // L'autre implémentation du dépôt (cout-de-revient-modal.tsx) l'oublie :
  // ce test fige la règle de la vue de référence.
  const avecTic = simulerCoutRevient({ ...lot, douane: { ...lot.douane, tic: 5 } });
  const valDouane = 850 * 38;
  const attendu = (valDouane + valDouane * 0.25 + valDouane * 0.0025 + valDouane * 0.05) * 0.20;
  check('la TIC entre dans la base de TVA', presque(avecTic.tvaImport, attendu), `${avecTic.tvaImport} ≠ ${attendu}`);
  check('et dans le total des droits', presque(avecTic.totalDouane, valDouane * (0.25 + 0.0025 + 0.05) + attendu));
}

console.log('\n── Prix de vente et marge ──');
{
  const r = simulerCoutRevient(lot);
  check('vente HT = revient + marge', presque(r.prixVenteUnitaireHT, r.coutUnitaire * 1.15));
  check('vente TTC = HT + TVA', presque(r.prixVenteUnitaireTTC, r.prixVenteUnitaireHT * 1.20));
  check('marge unitaire cohérente', presque(r.margeUnitaire, r.prixVenteUnitaireHT - r.coutUnitaire));
  check('coût hors TVA d’import inférieur au coût TTC', r.coutUnitaireHorsTva < r.coutUnitaire);
  const sansMarge = simulerCoutRevient({ ...lot, margePct: 0 });
  check('sans marge, vente HT = revient', presque(sansMarge.prixVenteUnitaireHT, sansMarge.coutUnitaire));
}

console.log('\n── Ce qui manque est dit, pas deviné ──');
{
  const sansKilo = simulerCoutRevient({ ...lot, douane: { ...lot.douane, valeurAuKg: null } });
  check('aucun droit sans valeur au kilo', sansKilo.totalDouane === 0);
  check('mais l’achat et les frais restent comptés', sansKilo.coutTotal > 0);
  check('et c’est signalé', sansKilo.alertes.some(a => a.includes('valeur en douane au kilo')));

  const sansPoids = simulerCoutRevient({ ...lot, poidsNetTotal: 0 });
  check('sans poids, pas de base taxable', sansPoids.totalDouane === 0);
  check('signalé aussi', sansPoids.alertes.some(a => a.includes('poids net')));

  const sansFret = simulerCoutRevient({ ...lot, fretParM3: 0 });
  check('fret absent signalé', sansFret.alertes.some(a => a.includes('Aucun fret')));
  check('mais le reste est bien compté', sansFret.coutTotal > 0 && sansFret.fret === 0);

  const sansTaux = simulerCoutRevient({ ...lot, tauxChange: 0 });
  check('taux de change manquant signalé', sansTaux.alertes.some(a => a.includes('Taux de change')));

  const sansTva = simulerCoutRevient({ ...lot, douane: { ...lot.douane, tva: null } });
  check('TVA absente → zéro, comme dans les dossiers', sansTva.tvaImport === 0);
  check('et dit', sansTva.alertes.some(a => a.includes('TVA')));

  const tropGros = simulerCoutRevient({ ...lot, volumeTotal: 80, volumeDossier: 64 });
  check('quote-part plafonnée à 100 %', presque(tropGros.fraisLogistiques, 14000));
  check('et signalée', tropGros.alertes.some(a => a.includes('dépasse')));

  const vide = simulerCoutRevient({ ...lot, quantite: 0 });
  check('quantité nulle ne divise pas par zéro', Number.isFinite(vide.coutUnitaire) && vide.coutUnitaire === 0);
}

console.log('\n── Taux de change déduit des dossiers ──');
{
  const factures = [
    { invoicePaidDhs: 102000, declaredValue: 10000, arrivalDate: '2026-09-01' },
    { invoicePaidDhs: 51500, declaredValue: 5000, arrivalDate: '2026-08-01' },
    { invoicePaidDhs: 0, declaredValue: 4000, arrivalDate: '2026-07-01' },   // impayé : écarté
  ];
  const { taux, dossiers } = tauxChangeRecent(factures);
  check('deux dossiers retenus', dossiers === 2);
  check('moyenne pondérée par la valeur', presque(taux, (102000 + 51500) / 15000), String(taux));
  check('aucun dossier exploitable → zéro', tauxChangeRecent([]).taux === 0);
}

console.log('\n── Fret moyen au mètre cube ──');
{
  const factures = [{ id: 'F1', freightCost: 3200, arrivalDate: '2026-09-01' }];
  const articles = [
    { factureId: 'F1', cubicMeasurement: 20 },
    { factureId: 'F1', cubicMeasurement: 12 },
    { factureId: 'F2', cubicMeasurement: 50 },   // dossier sans fret : ignoré
  ];
  const { fret, dossiers } = fretMoyenParM3(factures, articles);
  check('un dossier exploitable', dossiers === 1);
  check('fret ramené au m³', presque(fret, 3200 / 32), String(fret));
  check('sans données → zéro', fretMoyenParM3([], []).fret === 0);
}

console.log('\n── Taux repris de la fiche catégorie ──');
{
  const categories = [
    { id: 'c1', name: 'FERMETURE NYLON', customsValuePerKg: 38, importDutyRate: 25, tpiRate: 0.25, ticRate: 0, tvaRate: 20 },
  ];
  // La jointure se fait sur le NOM : c'est ce que contient article.categoryId.
  const t = tauxDeLaCategorie(categories, 'FERMETURE NYLON');
  check('valeur au kilo reprise', t?.valeurAuKg === 38);
  check('droits repris', t?.di === 25 && t?.tpi === 0.25 && t?.tva === 20);
  check('catégorie inconnue → rien', tauxDeLaCategorie(categories, 'INCONNUE') === null);
}

console.log(`\n${fail === 0 ? '✅' : '❌'} ${pass} réussis, ${fail} échoués\n`);
process.exit(fail === 0 ? 0 : 1);
