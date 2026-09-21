// Tests de l'écriture d'un suivi dans le dossier (lib/suivi-sync.ts).
// Lancer :
//   npx tsx scripts/test-suivi-sync.ts
//
// Le double de Firestore reproduit la règle qui a fait tomber la première
// version : le SDK admin REFUSE `undefined`, en surface comme en profondeur, et
// fait échouer l'écriture entière. Tester les fonctions pures ne le voyait pas.
//
// Les dates sont calculées par rapport à aujourd'hui : un arrivage vieux de plus
// de 30 jours est considéré clos (cf. status-utils.ts), donc des dates figées en
// dur verrouilleraient tous les cas au bout d'un mois.

import { appliquerShipment } from '../src/lib/suivi-sync';

let pass = 0;
let fail = 0;
function check(label: string, ok: boolean, detail = '') {
  if (ok) { pass++; console.log(`  ✓ ${label}`); }
  else { fail++; console.log(`  ✗ ${label} ${detail}`); }
}

/** yyyy-mm-dd à N jours d'aujourd'hui (négatif = passé). */
function jour(decalage: number): string {
  const d = new Date();
  d.setHours(12, 0, 0, 0);
  d.setDate(d.getDate() + decalage);
  return d.toISOString().slice(0, 10);
}

/** Même intransigeance que @google-cloud/firestore : undefined = écriture refusée. */
function refuserIndefinis(valeur: any, chemin = 'data'): void {
  if (valeur === undefined) {
    throw new Error(`Cannot use "undefined" as a Firestore value (found in field ${chemin})`);
  }
  if (Array.isArray(valeur)) {
    valeur.forEach((v, i) => refuserIndefinis(v, `${chemin}.\`${i}\``));
  } else if (valeur && typeof valeur === 'object') {
    for (const [k, v] of Object.entries(valeur)) refuserIndefinis(v, `${chemin}.${k}`);
  }
}

function faireDb() {
  const ecritures: { chemin: string; donnees: any }[] = [];
  return {
    ecritures,
    doc: (chemin: string) => ({
      set: async (donnees: any) => {
        refuserIndefinis(donnees);
        ecritures.push({ chemin, donnees });
      },
    }),
  };
}

const UID = 'admin-uid';
const ETA_DOSSIER = jour(10);     // ce que l'admin avait saisi
const ETA_COMPAGNIE = jour(16);   // ce que la compagnie annonce
const CORRECTION = jour(24);      // une correction manuelle postérieure

// ── Charges ShipsGo ──────────────────────────────────────────────────────────
/** Suivi tout juste ouvert : la spec donne route = null et containers = []. */
const shipmentNeuf = {
  id: 1001,
  reference: 'LEBTEX-26HD1004',
  booking_number: 'MEDUXY123456',
  container_number: null,
  container_count: 1,
  carrier: null,
  status: 'INPROGRESS',
  route: null,
  containers: [],
  tokens: {},
  followers: [],
  checked_at: `${jour(-1)} 10:00:00`,
};

const mouvement = (event: string, statut: string, j: string, extra: any = {}) => ({
  event, status: statut, timestamp: `${j}T12:00:00+01:00`,
  location: { name: 'CASABLANCA', country: { name: 'Morocco' } },
  vessel: null, voyage: null, ...extra,
});

const NAVIRE = { vessel: { name: 'MSC ANNA' }, voyage: '612N' };

/** Master BL : deux conteneurs qui voyagent ensemble, donc mouvements en double. */
const shipmentEnMer = {
  id: 1001,
  reference: 'LEBTEX-26HD1004',
  booking_number: 'MEDUXY123456',
  container_number: null,
  container_count: 2,
  carrier: { scac: 'MSCU', name: 'MSC' },
  status: 'SAILING',
  route: {
    port_of_loading: { location: { name: 'NINGBO' }, date_of_loading: `${jour(-20)}T18:00:00+08:00` },
    ts_count: 0,
    port_of_discharge: {
      location: { name: 'CASABLANCA' },
      date_of_discharge: `${ETA_COMPAGNIE}T09:00:00+01:00`,
      date_of_discharge_predicted: null,
    },
    transit_time: 36,
    transit_percentage: 62,
  },
  containers: [
    { number: 'MSCU1234567', status: 'SAILING', size: 40, type: 'HC', movements: [
      mouvement('LOAD', 'ACT', jour(-20), NAVIRE),
      mouvement('DEPA', 'ACT', jour(-19), NAVIRE),
    ] },
    { number: 'TGHU9876543', status: 'SAILING', size: 40, type: 'HC', movements: [
      mouvement('LOAD', 'ACT', jour(-20), NAVIRE),
      mouvement('DEPA', 'ACT', jour(-19), NAVIRE),
    ] },
  ],
  tokens: { map: '1111-2222' },
  followers: [{ id: 7, email: 'client@exemple.com' }],
  checked_at: `${jour(-1)} 04:12:00`,
};

async function main() {
  console.log('\n── Le cas qui cassait tout : une charge pleine de champs absents ──');
  {
    const db = faireDb();
    const r = await appliquerShipment(db, UID, '26HD1004', { id: '26HD1004', arrivalDate: ETA_DOSSIER }, shipmentNeuf);
    const ecrit = db.ecritures[0]?.donnees;
    check('écriture acceptée par Firestore', db.ecritures.length === 1);
    check('chemin du document', db.ecritures[0]?.chemin === `users/${UID}/factures/26HD1004`);
    check('aucune clé undefined', JSON.stringify(ecrit).indexOf('undefined') === -1);
    check('les champs vides sont absents, pas vides', !('navire' in (ecrit?.suivi || {})));
    check('suivi enregistré avec son identifiant', ecrit?.suivi?.shipmentId === 1001);
    check('rien à proposer sans route', r.issue === 'a-jour', r.issue);
    check('la date du dossier est intacte', ecrit?.arrivalDate === undefined);
  }

  console.log('\n── Le conteneur prend la mer : la date du dossier suit ──');
  {
    const db = faireDb();
    const r = await appliquerShipment(db, UID, '26HD1004', { id: '26HD1004', arrivalDate: ETA_DOSSIER }, shipmentEnMer);
    const ecrit = db.ecritures[0]?.donnees;
    check('date d’arrivée corrigée', ecrit?.arrivalDate === ETA_COMPAGNIE, `→ ${ecrit?.arrivalDate}`);
    check('issue', r.issue === 'date-modifiee', r.issue);
    check('saisie d’origine conservée', ecrit?.arrivalDateAvantSuivi === ETA_DOSSIER);
    check('origine tracée', ecrit?.arrivalDateSource === 'shipsgo');
    check('date appliquée mémorisée', ecrit?.suivi?.dateAppliquee === ETA_COMPAGNIE);
    check('erreur remise à plat', ecrit?.suivi?.erreur === null);
    check('mouvements dédoublonnés entre conteneurs', ecrit?.suivi?.etapes?.length === 2, `→ ${ecrit?.suivi?.etapes?.length}`);
    check('navire retenu', ecrit?.suivi?.navire === 'MSC ANNA');
    check('abonnés repris', ecrit?.suivi?.abonnes?.[0]?.email === 'client@exemple.com');
  }

  console.log('\n── Une correction manuelle n’est pas écrasée ──');
  {
    const dossier = {
      id: '26HD1004',
      arrivalDate: CORRECTION,                                                            // corrigée à la main…
      suivi: { shipmentId: 1001, reference: 'MEDUXY123456', dateAppliquee: ETA_COMPAGNIE }, // …après notre écriture
    };
    const db = faireDb();
    const r = await appliquerShipment(db, UID, '26HD1004', dossier, shipmentEnMer);
    const ecrit = db.ecritures[0]?.donnees;
    check('la date saisie reste', ecrit?.arrivalDate === undefined, `→ ${ecrit?.arrivalDate}`);
    check('issue neutre', r.issue === 'a-jour', r.issue);
    check('la date de la compagnie est proposée', ecrit?.suivi?.dateProposee === ETA_COMPAGNIE);
    check('notre dernière date reste mémorisée', ecrit?.suivi?.dateAppliquee === ETA_COMPAGNIE);

    const db2 = faireDb();
    const r2 = await appliquerShipment(db2, UID, '26HD1004', dossier, shipmentEnMer, { forcerDate: true });
    check('forçage explicite : la date est appliquée', db2.ecritures[0]?.donnees?.arrivalDate === ETA_COMPAGNIE);
    check('issue', r2.issue === 'date-modifiee', r2.issue);
  }

  console.log('\n── Dossier clos : on ne touche plus à rien ──');
  {
    const db = faireDb();
    const r = await appliquerShipment(db, UID, '26HD1004',
      { id: '26HD1004', arrivalDate: ETA_DOSSIER, stockEntryDate: jour(-2) }, shipmentEnMer);
    const ecrit = db.ecritures[0]?.donnees;
    check('date inchangée', ecrit?.arrivalDate === undefined);
    check('aucune date proposée non plus', ecrit?.suivi?.dateProposee === undefined);
    check('issue', r.issue === 'verrouille', r.issue);
    check('le suivi est quand même enregistré', ecrit?.suivi?.statut === 'SAILING');
  }

  console.log('\n── Arrivage vieux de plus d’un mois : figé aussi ──');
  {
    const db = faireDb();
    const r = await appliquerShipment(db, UID, '26HD1004', { id: '26HD1004', arrivalDate: jour(-45) }, shipmentEnMer);
    check('issue', r.issue === 'verrouille', r.issue);
    check('date inchangée', db.ecritures[0]?.donnees?.arrivalDate === undefined);
  }

  console.log('\n── Webhook en retard ou rejoué ──');
  {
    const dossier = {
      id: '26HD1004',
      arrivalDate: ETA_COMPAGNIE,
      suivi: { shipmentId: 1001, reference: 'MEDUXY123456', verifieLe: `${jour(-1)} 04:12:00`, statut: 'SAILING' },
    };
    const db = faireDb();
    const vieux = { ...shipmentEnMer, status: 'BOOKED', checked_at: `${jour(-9)} 08:00:00` };
    const r = await appliquerShipment(db, UID, '26HD1004', dossier, vieux);
    check('rien n’est écrit', db.ecritures.length === 0);
    check('le suivi en place est conservé', r.suivi?.statut === 'SAILING');

    const db2 = faireDb();
    const recent = { ...shipmentEnMer, checked_at: `${jour(0)} 06:00:00` };
    await appliquerShipment(db2, UID, '26HD1004', dossier, recent);
    check('une photo plus récente passe', db2.ecritures.length === 1);
  }

  console.log('\n── Déchargé : la date réelle prime ──');
  {
    const db = faireDb();
    const decharge = {
      ...shipmentEnMer,
      status: 'DISCHARGED',
      containers: [
        { number: 'MSCU1234567', status: 'DISCHARGED', movements: [mouvement('DISC', 'ACT', jour(-3), NAVIRE)] },
        // Le second conteneur descend le lendemain : c'est lui qui fait foi.
        { number: 'TGHU9876543', status: 'DISCHARGED', movements: [mouvement('DISC', 'ACT', jour(-2), NAVIRE)] },
      ],
    };
    await appliquerShipment(db, UID, '26HD1004', { id: '26HD1004', arrivalDate: ETA_DOSSIER }, decharge);
    const ecrit = db.ecritures[0]?.donnees;
    check('dernier déchargement retenu', ecrit?.arrivalDate === jour(-2), `→ ${ecrit?.arrivalDate}`);
    check('marquée comme réelle', ecrit?.suivi?.dateDechargementReelle === true);
  }

  console.log('\n── Numéro non reconnu par la compagnie ──');
  {
    const db = faireDb();
    const inconnu = { ...shipmentNeuf, status: 'UNTRACKED' };
    const r = await appliquerShipment(db, UID, '26HD1004', { id: '26HD1004', arrivalDate: ETA_DOSSIER }, inconnu);
    const ecrit = db.ecritures[0]?.donnees;
    check('écriture acceptée', db.ecritures.length === 1);
    check('aucune date touchée', ecrit?.arrivalDate === undefined);
    check('statut reporté', ecrit?.suivi?.statut === 'UNTRACKED');
    check('issue', r.issue === 'a-jour', r.issue);
  }

  console.log(`\n${fail === 0 ? '✅' : '❌'} ${pass} réussis, ${fail} échoués\n`);
  process.exit(fail === 0 ? 0 : 1);
}

main().catch(e => { console.error(e); process.exit(1); });
