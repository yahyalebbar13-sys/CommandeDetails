// Tests de la lecture d'un suivi ShipsGo (lib/suivi-conteneur.ts).
// Lancer :
//   npx tsx scripts/test-suivi-conteneur.ts

import {
  dateArriveeDuSuivi,
  derniereEtape,
  dossierAOuvrir,
  dossierASynchroniser,
  instantDe,
  jourDe,
  normaliserReference,
  prochaineEtape,
  referenceDepuisDossier,
  referenceValide,
  resumerShipment,
  sansIndefinis,
  scacDeLaCompagnie,
  suiviTermine,
  typeReference,
} from '../src/lib/suivi-conteneur';

let pass = 0;
let fail = 0;
function check(label: string, ok: boolean, detail = '') {
  if (ok) { pass++; console.log(`  ✓ ${label}`); }
  else { fail++; console.log(`  ✗ ${label} ${detail}`); }
}

console.log('\n── Référence de suivi ──');
check('espaces et tirets retirés d’un conteneur', normaliserReference('mscu 123456-7') === 'MSCU1234567');
check('conteneur reconnu', typeReference('MSCU1234567') === 'conteneur');
check('master BL reconnu', typeReference('MEDUXY123456') === 'bl');
check('référence transitaire acceptée comme BL', referenceValide('26HD1004'));
check('tirets gardés sur un booking', normaliserReference('abc-123/45') === 'ABC-123/45');
check('trop court refusé', !referenceValide('AB1'));
check('caractères interdits refusés', !referenceValide('BL#12345'));

console.log('\n── Compagnie ──');
check('MSC depuis le nom', scacDeLaCompagnie('MSC') === 'MSCU');
check('CMA CGM depuis le nom', scacDeLaCompagnie('CMA CGM MAROC') === 'CMDU');
check('Maersk depuis le préfixe du conteneur', scacDeLaCompagnie('', 'MRKU1234567') === 'MAEU');
check('inconnu → rien (ShipsGo devine)', scacDeLaCompagnie('Transit Atlas', '26HD1004') === undefined);
// Codes vérifiés contre le catalogue ShipsGo : leur identifiant n'est pas
// toujours le SCAC usuel, ni le préfixe du conteneur.
check('PIL → PCIU et non PILU', scacDeLaCompagnie('PIL') === 'PCIU');
check('Wan Hai → 22AA', scacDeLaCompagnie('WAN HAI LINES') === '22AA');
check('Marfret (ligne Maroc)', scacDeLaCompagnie('MARFRET') === 'MFTU');
check('tous les codes ont le format attendu par ShipsGo',
  ['MSC', 'MAERSK', 'CMA CGM', 'HAPAG LLOYD', 'ZIM', 'ONE', 'EVERGREEN', 'COSCO', 'OOCL', 'YANG MING',
   'PIL', 'HAMBURG SUD', 'WAN HAI', 'HMM', 'SEALAND', 'ARKAS', 'MARFRET', 'TARROS', 'MESSINA', 'GRIMALDI']
    .every(n => /^(SG_)?[A-Z0-9]{4}$/.test(scacDeLaCompagnie(n) || '')));

console.log('\n── Dates ──');
check('jour gardé dans le fuseau du port', jourDe('2026-03-18T23:30:00+02:00') === '2026-03-18');
check('date seule acceptée', jourDe('2026-03-18') === '2026-03-18');
check('vide toléré', jourDe(null) === undefined);

// Conteneur parti de Ningbo, en mer, ETA Casablanca.
const enMer = {
  id: 987654,
  reference: 'LEBTEX-26HD1004',
  booking_number: 'MEDUXY123456',
  container_number: null,
  container_count: 2,
  carrier: { scac: 'MSCU', name: 'MSC' },
  status: 'SAILING',
  route: {
    port_of_loading: {
      location: { code: 'CNNGB', name: 'NINGBO', country: { code: 'CN', name: 'China' } },
      date_of_loading: '2026-02-20T18:00:00+08:00',
    },
    ts_count: 1,
    port_of_discharge: {
      location: { code: 'MACAS', name: 'CASABLANCA', country: { code: 'MA', name: 'Morocco' } },
      date_of_discharge: '2026-03-28T09:00:00+01:00',
      date_of_discharge_initial: '2026-03-22T09:00:00+01:00',
      date_of_discharge_predicted: '2026-03-30T09:00:00+01:00',
    },
    transit_time: 36,
    transit_percentage: 62,
  },
  containers: [
    {
      number: 'MSCU1234567',
      status: 'SAILING',
      size: 40,
      type: 'HC',
      movements: [
        { event: 'LOAD', status: 'ACT', location: { name: 'NINGBO' }, vessel: { name: 'MSC ANNA', imo: 9483816 }, voyage: '612N', timestamp: '2026-02-20T18:00:00+08:00' },
        { event: 'DEPA', status: 'ACT', location: { name: 'NINGBO' }, vessel: { name: 'MSC ANNA' }, voyage: '612N', timestamp: '2026-02-21T04:00:00+08:00' },
        { event: 'GTIN', status: 'ACT', location: { name: 'NINGBO' }, vessel: null, voyage: null, timestamp: '2026-02-18T10:00:00+08:00' },
        { event: 'ARRV', status: 'EST', location: { name: 'CASABLANCA' }, vessel: { name: 'MSC ANNA' }, voyage: '612N', timestamp: '2026-03-28T09:00:00+01:00' },
      ],
    },
    { number: 'TGHU9876543', status: 'SAILING', size: 40, type: 'HC', movements: [] },
  ],
  tokens: { map: '11111111-2222-3333-4444-555555555555' },
  checked_at: '2026-03-10 04:12:00',
};

console.log('\n── Conteneur en mer ──');
const suivi = resumerShipment(enMer);
check('statut', suivi.statut === 'SAILING');
check('compagnie', suivi.compagnie === 'MSC');
check('port de départ', suivi.portChargement === 'NINGBO');
check('port d’arrivée', suivi.portDechargement === 'CASABLANCA');
check('ETA retenue', suivi.dateDechargement === '2026-03-28', `→ ${suivi.dateDechargement}`);
check('ETA marquée comme annoncée', suivi.dateDechargementReelle === false);
check('prévision ShipsGo à part', suivi.dateDechargementPrevue === '2026-03-30');
check('avancement', suivi.avancement === 62);
check('étapes triées par date', suivi.etapes.map(e => e.code).join(',') === 'GTIN,LOAD,DEPA,ARRV', suivi.etapes.map(e => e.code).join(','));
check('navire du dernier mouvement connu', suivi.navire === 'MSC ANNA');
check('voyage', suivi.voyage === '612N');
check('les deux conteneurs listés', suivi.conteneurs.join(',') === 'MSCU1234567,TGHU9876543');
check('lien carte construit', suivi.lienCarte === 'https://map.shipsgo.com/ocean/shipments/987654?token=11111111-2222-3333-4444-555555555555');
check('dernière étape franchie = départ', derniereEtape(suivi)?.code === 'DEPA');
check('prochaine étape = arrivée', prochaineEtape(suivi)?.code === 'ARRV');
check('date du dossier = ETA', dateArriveeDuSuivi(suivi) === '2026-03-28');
check('pas terminé', !suiviTermine(suivi));

console.log('\n── Conteneur déchargé ──');
const decharge = resumerShipment({
  ...enMer,
  status: 'DISCHARGED',
  containers: [{
    number: 'MSCU1234567',
    status: 'DISCHARGED',
    movements: [
      ...enMer.containers[0].movements.filter(m => m.status === 'ACT'),
      { event: 'ARRV', status: 'ACT', location: { name: 'CASABLANCA' }, vessel: { name: 'MSC ANNA' }, voyage: '612N', timestamp: '2026-03-26T07:00:00+01:00' },
      { event: 'DISC', status: 'ACT', location: { name: 'CASABLANCA' }, vessel: { name: 'MSC ANNA' }, voyage: '612N', timestamp: '2026-03-26T19:30:00+01:00' },
    ],
  }],
});
check('statut', decharge.statut === 'DISCHARGED');
check('date réelle préférée à l’ETA', decharge.dateDechargement === '2026-03-26', `→ ${decharge.dateDechargement}`);
check('marquée comme réelle', decharge.dateDechargementReelle === true);
check('date du dossier = déchargement réel', dateArriveeDuSuivi(decharge) === '2026-03-26');
check('suivi terminé', suiviTermine(decharge));

console.log('\n── Numéro non reconnu ──');
const inconnu = resumerShipment({
  id: 42, booking_number: '26HD1004', container_number: null, container_count: 0,
  carrier: null, status: 'UNTRACKED', route: null, containers: [], tokens: {}, checked_at: null,
});
check('statut', inconnu.statut === 'UNTRACKED');
check('aucune date proposée au dossier', dateArriveeDuSuivi(inconnu) === undefined);
check('pas d’étape', inconnu.etapes.length === 0);

console.log('\n── Rien qui vaille « undefined » (Firestore le refuse) ──');
// Le défaut qui rendait toute la fonctionnalité inopérante : une clé présente
// avec la valeur undefined fait échouer l'écriture entière du document.
const cles = (o: any): string[] =>
  Object.entries(o || {}).flatMap(([k, v]) =>
    v && typeof v === 'object'
      ? [k, ...(Array.isArray(v) ? v.flatMap(cles) : cles(v))]
      : [k],
  );
const indefinies = (o: any): string[] =>
  Object.entries(o || {}).flatMap(([k, v]) =>
    v === undefined ? [k]
      : Array.isArray(v) ? v.flatMap(indefinies)
      : v && typeof v === 'object' ? indefinies(v)
      : [],
  );

const neuf = resumerShipment({
  id: 42, reference: 'LEBTEX-26HD1004', booking_number: 'MEDUXY123456', container_number: null,
  carrier: null, status: 'INPROGRESS', route: null, containers: [], tokens: {}, checked_at: null,
});
check('suivi tout neuf : aucune clé undefined', indefinies(neuf).length === 0, indefinies(neuf).join(','));
check('suivi en mer : aucune clé undefined', indefinies(suivi).length === 0, indefinies(suivi).join(','));
check('les clés vides sont absentes, pas vides', !cles(neuf).includes('navire'));
check('les clés renseignées restent', cles(suivi).includes('navire'));
check('sansIndefinis nettoie en profondeur',
  JSON.stringify(sansIndefinis({ a: 1, b: undefined, c: { d: undefined, e: 2 }, f: [{ g: undefined, h: 3 }] }))
  === JSON.stringify({ a: 1, c: { e: 2 }, f: [{ h: 3 }] }));
check('null est conservé (il efface, contrairement à undefined)',
  JSON.stringify(sansIndefinis({ erreur: null })) === JSON.stringify({ erreur: null }));

console.log('\n── Master BL : plusieurs conteneurs, un seul voyage ──');
const mv = (event: string, st: string, d: string, nav?: string) => ({
  event, status: st, timestamp: `${d}T12:00:00+01:00`,
  location: { name: 'CASABLANCA' }, vessel: nav ? { name: nav } : null, voyage: nav ? '612N' : null,
});
const groupe = resumerShipment({
  id: 77, booking_number: 'MEDUXY123456', container_number: null, status: 'DISCHARGED',
  carrier: { name: 'MSC' },
  route: { port_of_discharge: { location: { name: 'CASABLANCA' }, date_of_discharge: '2026-03-28T09:00:00+01:00' } },
  containers: [
    { number: 'MSCU1111111', movements: [mv('LOAD', 'ACT', '2026-02-20', 'MSC ANNA'), mv('DISC', 'ACT', '2026-03-26', 'MSC ANNA')] },
    { number: 'TGHU2222222', movements: [mv('LOAD', 'ACT', '2026-02-20', 'MSC ANNA'), mv('DISC', 'ACT', '2026-03-27', 'MSC ANNA')] },
  ],
  tokens: {}, checked_at: '2026-03-27 20:00:00',
});
check('mouvements identiques fusionnés', groupe.etapes.filter(e => e.code === 'LOAD').length === 1);
check('déchargements distincts gardés', groupe.etapes.filter(e => e.code === 'DISC').length === 2);
check('date retenue = dernier conteneur descendu', groupe.dateDechargement === '2026-03-27', `→ ${groupe.dateDechargement}`);
check('les deux conteneurs listés', groupe.conteneurs.join(',') === 'MSCU1111111,TGHU2222222');

console.log('\n── Transbordement : le navire annoncé n’est pas le navire porteur ──');
const transbordement = resumerShipment({
  id: 78, booking_number: 'MEDUXY123456', status: 'SAILING', carrier: { name: 'MSC' },
  route: { port_of_discharge: { location: { name: 'CASABLANCA' }, date_of_discharge: '2026-04-02T09:00:00+01:00' } },
  containers: [{ number: 'MSCU1111111', movements: [
    mv('LOAD', 'ACT', '2026-02-20', 'MSC ANNA'),
    mv('DEPA', 'ACT', '2026-02-21', 'MSC ANNA'),
    mv('LOAD', 'EST', '2026-03-15', 'MSC LEILA'),   // prochaine jambe, pas encore faite
  ] }],
  tokens: {}, checked_at: '2026-03-01 08:00:00',
});
check('navire réellement embarqué retenu', transbordement.navire === 'MSC ANNA', `→ ${transbordement.navire}`);

const avantChargement = resumerShipment({
  id: 79, booking_number: 'MEDUXY123456', status: 'BOOKED', carrier: { name: 'MSC' }, route: null,
  containers: [{ number: 'MSCU1111111', movements: [mv('LOAD', 'EST', '2026-04-10', 'MSC LEILA')] }],
  tokens: {}, checked_at: null,
});
check('avant tout chargement, le navire annoncé est affiché', avantChargement.navire === 'MSC LEILA');

console.log('\n── Horodatages ShipsGo ──');
check('format « aaaa-mm-jj hh:mm:ss » lu comme UTC',
  instantDe('2026-03-10 04:12:00') === Date.parse('2026-03-10T04:12:00Z'));
check('ISO avec décalage respecté',
  instantDe('2026-03-10T04:12:00+02:00') === Date.parse('2026-03-10T04:12:00+02:00'));
check('ordre entre deux vérifications',
  (instantDe('2026-03-02 08:00:00') as number) < (instantDe('2026-03-10 04:12:00') as number));
check('vide toléré', instantDe(null) === undefined);
check('illisible toléré', instantDe('bientôt') === undefined);

console.log('\n── Quel numéro suivre, et faut-il payer pour ? ──');
// Formats réellement présents dans les dossiers (relevé du 21 septembre 2026).
const BL_REELS = ['MEDUKV285573', 'COSU9507719430', 'ONEYNBOFK9752300', 'NBOZSL585700', 'NB6IV3256800'];
const demain = (n: number) => {
  const d = new Date();
  d.setDate(d.getDate() + n);
  return d.toISOString().slice(0, 10);
};

check('tous les BL réels sont exploitables', BL_REELS.every(bl => referenceValide(normaliserReference(bl))),
  BL_REELS.filter(bl => !referenceValide(normaliserReference(bl))).join(','));
check('le n° de BL du dossier est retenu', referenceDepuisDossier({ noBL: 'COSU9507719430' }) === 'COSU9507719430');
check('espaces de saisie absorbés', referenceDepuisDossier({ noBL: ' medukv 285573 ' }) === 'MEDUKV285573');
check('un suivi déjà ouvert garde son numéro',
  referenceDepuisDossier({ noBL: 'AUTRE123456', suivi: { reference: 'MEDUKV285573' } }) === 'MEDUKV285573');
check('dossier sans BL → rien à suivre', referenceDepuisDossier({ noBL: '' }) === undefined);

check('arrivage en cours avec BL → à ouvrir',
  dossierAOuvrir({ noBL: 'MEDUKV285573', arrivalDate: demain(12) }));
check('déjà suivi → on ne repaie pas',
  !dossierAOuvrir({ noBL: 'MEDUKV285573', arrivalDate: demain(12), suivi: { shipmentId: 1 } }));
check('marchandise en stock → inutile',
  !dossierAOuvrir({ noBL: 'MEDUKV285573', arrivalDate: demain(-2), stockEntryDate: demain(-1) }));
check('arrivage clos depuis plus d’un mois → inutile',
  !dossierAOuvrir({ noBL: 'MEDUKV285573', arrivalDate: demain(-45) }));
check('sans BL → rien à ouvrir', !dossierAOuvrir({ noBL: '', arrivalDate: demain(12) }));
check('BL trop court → rien à ouvrir', !dossierAOuvrir({ noBL: 'AB1', arrivalDate: demain(12) }));

console.log('\n── Dossiers à resynchroniser ──');
check('suivi en cours → oui', dossierASynchroniser({ suivi }));
check('conteneur déchargé → non', !dossierASynchroniser({ suivi: decharge }));
check('marchandise en stock → non', !dossierASynchroniser({ suivi, stockEntryDate: '2026-04-02' }));
check('aucun suivi → non', !dossierASynchroniser({}));

console.log(`\n${fail === 0 ? '✅' : '❌'} ${pass} réussis, ${fail} échoués\n`);
process.exit(fail === 0 ? 0 : 1);
