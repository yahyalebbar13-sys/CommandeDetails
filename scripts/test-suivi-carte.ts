// Tests de la mise en dessin d'une route ShipsGo (lib/suivi-carte.ts).
// Lancer :
//   npx tsx scripts/test-suivi-carte.ts

import { preparerCarte } from '../src/lib/suivi-carte';

let pass = 0;
let fail = 0;
function check(label: string, ok: boolean, detail = '') {
  if (ok) { pass++; console.log(`  ✓ ${label}`); }
  else { fail++; console.log(`  ✗ ${label} ${detail}`); }
}

const port = (code: string, nom: string, coord: [number, number], status: string) => ({
  type: 'Feature',
  geometry: { type: 'Point', coordinates: coord },
  properties: { status, location: { code, name: nom, country: { code: 'XX', name: 'Pays' } } },
});

const traversee = (coords: [number, number][], status: string, navire: string, extra: any = {}) => ({
  type: 'Feature',
  geometry: { type: 'LineString', coordinates: coords },
  properties: {
    status,
    vessel: { name: navire, imo: 9483816 },
    voyage: '612N',
    events: {
      DEPA: { location: { name: 'DÉPART' }, timestamp: '2026-02-21T04:00:00+08:00' },
      ARRV: { location: { name: 'ARRIVÉE' }, timestamp: '2026-03-28T09:00:00+01:00' },
    },
    current: null,
    ...extra,
  },
});

// Ningbo → Singapour (fait) → Casablanca (navire en route)
const geojson = {
  type: 'FeatureCollection',
  features: [
    port('CNNGB', 'NINGBO', [121.5, 29.87], 'PAST'),
    traversee([[121.5, 29.87], [110, 15], [103.75, 1.26]], 'PAST', 'MSC ANNA'),
    port('SGSIN', 'SINGAPORE', [103.75, 1.26], 'PAST'),
    traversee(
      [[103.75, 1.26], [70, 9], [43, 12.5], [32.5, 29.9], [10, 37], [-7.6, 33.6]],
      'CURRENT',
      'MSC ANNA',
      { current: { index: 2, coordinates: [43, 12.5] } },
    ),
    port('MACAS', 'CASABLANCA', [-7.61667, 33.6], 'FUTURE'),
  ],
};

console.log('\n── Trajet Ningbo → Casablanca ──');
const carte = preparerCarte(geojson, { largeur: 640, hauteur: 260, marge: 26 });
check('carte produite', carte !== null);
if (!carte) { console.log('\n❌ abandon\n'); process.exit(1); }

check('trois ports', carte.ports.length === 3, `→ ${carte.ports.length}`);
check('noms des ports gardés', carte.ports.map(p => p.nom).join(',') === 'NINGBO,SINGAPORE,CASABLANCA');
check('états des ports gardés', carte.ports.map(p => p.etat).join(',') === 'PAST,PAST,FUTURE');
check('segment en cours coupé en deux', carte.segments.length === 3, `→ ${carte.segments.length}`);
check('parcouru / restant', carte.segments.map(s => s.parcouru).join(',') === 'true,true,false');
check('navire placé', Boolean(carte.navire));
check('nom du navire', carte.navire?.nom === 'MSC ANNA');
check('navire et escales renseignés', carte.segments[2].arrivee === 'ARRIVÉE');

const dedans = (x: number, y: number) => x >= 0 && x <= carte.largeur && y >= 0 && y <= carte.hauteur;
check('ports dans le cadre', carte.ports.every(p => dedans(p.x, p.y)));
check('navire dans le cadre', dedans(carte.navire!.x, carte.navire!.y));
check('chemins SVG bien formés', carte.segments.every(s => /^M[\d.]+ [\d.]+( L[\d.]+ [\d.]+)+$/.test(s.d)), carte.segments[0].d.slice(0, 40));

// Le port de départ est à l'est, celui d'arrivée à l'ouest : l'ordre gauche/droite
// doit s'inverser à l'écran par rapport aux longitudes.
const [ningbo, , casa] = carte.ports;
check('est à droite, ouest à gauche', ningbo.x > casa.x, `${ningbo.x} vs ${casa.x}`);

console.log('\n── Franchissement du méridien 180° ──');
const pacifique = preparerCarte({
  features: [
    port('CNSHA', 'SHANGHAI', [121.5, 31.2], 'PAST'),
    traversee([[121.5, 31.2], [160, 36], [179, 38], [-179, 38], [-150, 35], [-118.2, 33.7]], 'PAST', 'CMA CGM'),
    port('USLAX', 'LOS ANGELES', [-118.2, 33.7], 'FUTURE'),
  ],
});
check('carte produite', pacifique !== null);
if (pacifique) {
  const xs = [...pacifique.ports.map(p => p.x)];
  // Sans recollement, Shanghai et Los Angeles se retrouveraient aux deux bouts
  // avec un tracé qui traverse toute la carte : ici la route reste monotone.
  check('Shanghai à gauche de Los Angeles', xs[0] < xs[1], `${xs[0]} vs ${xs[1]}`);
  check('ports dans le cadre', pacifique.ports.every(p => p.x >= 0 && p.x <= pacifique.largeur));
}

console.log('\n── Cas limites ──');
check('geojson vide → rien', preparerCarte({ features: [] }) === null);
check('geojson absent → rien', preparerCarte(null) === null);
check('coordonnées aberrantes ignorées', preparerCarte({
  features: [{ type: 'Feature', geometry: { type: 'Point', coordinates: ['x', null] }, properties: {} }],
}) === null);

const unSeulPort = preparerCarte({ features: [port('MACAS', 'CASABLANCA', [-7.6, 33.6], 'CURRENT')] });
check('un seul point reste dessinable', unSeulPort?.ports.length === 1 && Number.isFinite(unSeulPort.ports[0].x));

console.log(`\n${fail === 0 ? '✅' : '❌'} ${pass} réussis, ${fail} échoués\n`);
process.exit(fail === 0 ? 0 : 1);
