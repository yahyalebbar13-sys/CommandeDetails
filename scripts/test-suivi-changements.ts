// Tests de ce qui déclenche une alerte (lib/suivi-changements.ts).
// Lancer :
//   npx tsx scripts/test-suivi-changements.ts

import { changementsNotables, ecartJours, meriteAlerte, resumerChangements } from '../src/lib/suivi-changements';
import type { SuiviConteneur } from '../src/lib/suivi-conteneur';

let pass = 0;
let fail = 0;
function check(label: string, ok: boolean, detail = '') {
  if (ok) { pass++; console.log(`  ✓ ${label}`); }
  else { fail++; console.log(`  ✗ ${label} ${detail}`); }
}

const etape = (code: string, date: string, reel: boolean, lieu = 'CASABLANCA') =>
  ({ code, libelle: code, reel, date, lieu } as any);

const base = (p: Partial<SuiviConteneur> = {}): SuiviConteneur => ({
  shipmentId: 1001,
  reference: 'MEDUKV285573',
  typeReference: 'bl',
  statut: 'SAILING',
  dateDechargementReelle: false,
  conteneurs: [],
  etapes: [],
  abonnes: [],
  majLe: '2026-09-22T06:00:00Z',
  ...p,
} as SuiviConteneur);

console.log('\n── On ne dérange pas pour rien ──');
check('première photo : aucune alerte', changementsNotables(null, base()).length === 0);
check('suivi inchangé : rien à dire', changementsNotables(base(), base()).length === 0);
check('autre conteneur : on ne compare pas',
  changementsNotables(base(), base({ shipmentId: 2002 })).length === 0);
check('ShipsGo revérifie sans rien apprendre : rien à dire',
  changementsNotables(base({ majLe: 'x' }), base({ majLe: 'y' })).length === 0);
check('une étape seulement PRÉVUE n’est pas une nouvelle',
  changementsNotables(base(), base({ etapes: [etape('ARRV', '2026-10-26', false)] })).length === 0);

console.log('\n── Retard annoncé ──');
{
  const avant = base({ dateDechargement: '2026-10-22' });
  const apres = base({ dateDechargement: '2026-10-26' });
  const c = changementsNotables(avant, apres);
  check('un changement', c.length === 1, String(c.length));
  check('dit que c’est repoussé', c[0].titre.includes('repoussée') && c[0].titre.includes('26/10'), c[0].titre);
  check('rappelle la date précédente', (c[0].detail || '').includes('22/10'), c[0].detail);
  check('compte les jours', (c[0].detail || '').includes('4 jours de retard'), c[0].detail);
  check('mérite une alerte', meriteAlerte(c));
}

console.log('\n── Glissement d’un jour : information, pas alerte ──');
{
  const c = changementsNotables(base({ dateDechargement: '2026-10-22' }), base({ dateDechargement: '2026-10-23' }));
  check('signalé', c.length === 1);
  check('mais sans pousser de notification', !meriteAlerte(c));
}

console.log('\n── Le conteneur est arrivé ──');
{
  const avant = base({ statut: 'SAILING', dateDechargement: '2026-09-30', etapes: [etape('DEPA', '2026-07-24', true, 'NINGBO')] });
  const apres = base({
    statut: 'DISCHARGED',
    dateDechargement: '2026-09-12',
    dateDechargementReelle: true,
    portDechargement: 'CASABLANCA',
    etapes: [etape('DEPA', '2026-07-24', true, 'NINGBO'), etape('ARRV', '2026-09-12', true), etape('DISC', '2026-09-12', true)],
  });
  const c = changementsNotables(avant, apres);
  check('étapes franchies signalées', c.filter(x => x.cle.startsWith('etape:')).length === 2, String(c.length));
  check('date confirmée', c.some(x => x.titre.includes('Arrivée confirmée le 12/09')), resumerChangements(c));
  check('alerte', meriteAlerte(c));
  check('le départ déjà connu n’est pas répété', !c.some(x => x.cle.includes('DEPA')));
  // « Déchargé du navire — CASABLANCA » dit déjà tout : répéter le statut ferait doublon.
  check('le statut ne double pas l’étape', !c.some(x => x.cle === 'statut:DISCHARGED'), resumerChangements(c));
}

console.log('\n── Statut qui avance sans étape publiée ──');
{
  // Certaines compagnies annoncent le départ par le statut avant de publier
  // le mouvement : la nouvelle ne doit pas se perdre.
  const c = changementsNotables(base({ statut: 'BOOKED' }), base({ statut: 'SAILING', portDechargement: 'CASABLANCA' }));
  check('signalé en clair', c.some(x => x.titre === 'Conteneur parti en mer'), resumerChangements(c));
  check('avec la destination', (c[0].detail || '').includes('CASABLANCA'));
  check('sans alerte téléphone (rien d’urgent)', !meriteAlerte(c));
}

console.log('\n── Numéro qui meurt ──');
{
  const c = changementsNotables(base({ statut: 'SAILING' }), base({ statut: 'UNTRACKED' }));
  check('une seule alerte, claire', c.length === 1 && c[0].cle === 'untracked');
  check('dit quoi faire', (c[0].detail || '').includes('Vérifiez le numéro'));
  check('alerte', meriteAlerte(c));
}

console.log('\n── Écart de dates ──');
check('retard', ecartJours('2026-10-22', '2026-10-26') === 4);
check('avance', ecartJours('2026-10-26', '2026-10-22') === -4);
check('changement de mois', ecartJours('2026-09-30', '2026-10-02') === 2);
check('date absente', ecartJours(undefined, '2026-10-02') === 0);

console.log(`\n${fail === 0 ? '✅' : '❌'} ${pass} réussis, ${fail} échoués\n`);
process.exit(fail === 0 ? 0 : 1);
