// Essai réel de l'API ShipsGo, hors application : valide le jeton, l'adaptateur
// et ce que la compagnie maritime sait d'un conteneur. Ne touche ni Firestore ni
// les dossiers.
//
// Lire un suivi déjà ouvert (gratuit) :
//   npx tsx scripts/test-shipsgo-api.ts --id 987654
// Ouvrir le suivi d'un conteneur ou d'un Master BL (coûte 1 crédit) :
//   npx tsx scripts/test-shipsgo-api.ts MSCU1234567
//
// Le jeton se donne par variable d'environnement :
//   PowerShell : $env:SHIPSGO_API_TOKEN="..." ; npx tsx scripts/test-shipsgo-api.ts ...
//   bash       : SHIPSGO_API_TOKEN=... npx tsx scripts/test-shipsgo-api.ts ...

import { ErreurShipsGo, lireSuivi, ouvrirSuivi, suiviConfigure } from '../src/lib/shipsgo';
import {
  LIBELLE_STATUT,
  dateArriveeDuSuivi,
  normaliserReference,
  referenceValide,
  resumerShipment,
  scacDeLaCompagnie,
  typeReference,
} from '../src/lib/suivi-conteneur';

async function main() {
  if (!suiviConfigure()) {
    console.error('\n❌ SHIPSGO_API_TOKEN absent.\n   PowerShell : $env:SHIPSGO_API_TOKEN="votre-jeton"\n');
    process.exit(1);
  }

  const args = process.argv.slice(2);
  const iId = args.indexOf('--id');
  let shipmentId: number;

  if (iId !== -1) {
    shipmentId = Number(args[iId + 1]);
    if (!Number.isFinite(shipmentId)) {
      console.error('❌ --id attend un identifiant numérique de suivi ShipsGo.');
      process.exit(1);
    }
    console.log(`\n→ Lecture du suivi ${shipmentId} (gratuit)…`);
  } else {
    const reference = normaliserReference(args[0] || '');
    if (!reference || !referenceValide(reference)) {
      console.error('\n❌ Donnez un numéro de conteneur (MSCU1234567) ou un Master BL, ou --id <suivi>.\n');
      process.exit(1);
    }
    const scac = scacDeLaCompagnie(args[1], reference);
    console.log(`\n→ Ouverture du suivi pour ${reference} (${typeReference(reference)}${scac ? `, compagnie ${scac}` : ''})…`);
    console.log('   Un crédit est prélevé, sauf si ce suivi existe déjà.');

    const ouvert = await ouvrirSuivi({ reference, referenceInterne: `LEBTEX-ESSAI-${reference}`, carrier: scac });
    shipmentId = ouvert.shipmentId;
    console.log(`   ${ouvert.deja ? 'Suivi déjà ouvert — aucun crédit prélevé' : 'Suivi créé — 1 crédit prélevé'}.`);
    if (ouvert.creditsRestants !== undefined) console.log(`   Crédits restants : ${ouvert.creditsRestants}`);
  }

  const shipment = await lireSuivi(shipmentId);
  const suivi = resumerShipment(shipment);
  const etat = LIBELLE_STATUT[suivi.statut];

  console.log('\n── Ce que la compagnie dit ──');
  console.log(`  Suivi      : ${suivi.shipmentId} (${suivi.reference})`);
  console.log(`  Situation  : ${etat?.emoji || ''} ${etat?.label || suivi.statut}`);
  console.log(`  Compagnie  : ${suivi.compagnie || '—'}`);
  console.log(`  Navire     : ${suivi.navire || '—'}${suivi.voyage ? ` (${suivi.voyage})` : ''}`);
  console.log(`  Départ     : ${suivi.portChargement || '—'} le ${suivi.dateChargement || '—'}`);
  console.log(`  Arrivée    : ${suivi.portDechargement || '—'} le ${suivi.dateDechargement || '—'} (${suivi.dateDechargementReelle ? 'réelle' : 'annoncée'})`);
  if (suivi.dateDechargementPrevue) console.log(`  Prévision  : ${suivi.dateDechargementPrevue}`);
  console.log(`  Avancement : ${suivi.avancement ?? '—'} %${suivi.dureeTransit ? ` sur ${suivi.dureeTransit} jours` : ''}`);
  console.log(`  Conteneurs : ${suivi.conteneurs.join(', ') || '—'}`);
  console.log(`  Carte      : ${suivi.lienCarte || '—'}`);

  if (suivi.etapes.length) {
    console.log('\n── Étapes ──');
    for (const e of suivi.etapes) {
      console.log(`  ${e.reel ? '●' : '○'} ${e.date}  ${e.libelle}${e.lieu ? ` · ${e.lieu}` : ''}${e.navire ? ` · ${e.navire}` : ''}`);
    }
  }

  const date = dateArriveeDuSuivi(suivi);
  const pourquoi =
    suivi.statut === 'UNTRACKED' ? 'numéro non reconnu par la compagnie'
    : suivi.statut === 'NEW' || suivi.statut === 'INPROGRESS'
      ? 'ShipsGo n’a pas encore interrogé la compagnie — relancez avec --id dans quelques minutes'
      : 'la compagnie n’annonce pas encore de date';
  console.log(`\n→ Date qui serait inscrite dans le dossier : ${date || `aucune (${pourquoi})`}\n`);
}

main().catch((e: any) => {
  if (e instanceof ErreurShipsGo) console.error(`\n❌ [${e.code}] ${e.message}\n`);
  else console.error('\n❌', e?.message || e, '\n');
  process.exit(1);
});
