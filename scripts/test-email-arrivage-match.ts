// ─── Tests du rapprochement Email ↔ Arrivage ─────────────────────────────────
// Le projet n'a pas de runner de tests : ce script se lance à la main.
//   npx tsx scripts/test-email-arrivage-match.ts
// Sortie non nulle si un cas échoue.

import {
  matchEmailToArrivages, bestArrivageForEmail, normalizeRef,
  extractRefCandidates, navireIdentifiable, referencesRecherchables,
  rechercheGmailReferences, referencesCitees,
} from '../src/lib/email-arrivage-match';

const factures: any[] = [
  { id: 'F1', noBL: '26HD1004', supplierId: 'MH',    declaringCompany: 'Lebtex',
    shippingLine: 'MSC', forwarder: 'NOUH TRANSIT', shippingDate: '2026-08-01', arrivalDate: '2026-09-01' },
  { id: 'F2', noBL: '26HD1005', supplierId: 'JIMMY', declaringCompany: 'Robe in box',
    shippingLine: 'MAERSK', shippingDate: '2026-08-10', arrivalDate: '2026-09-10' },
  { id: 'F3', noBL: '10426HT1004', supplierId: 'MH', declaringCompany: 'New fournitures',
    arrivalDate: '2026-09-05' },
  { id: 'F4', supplierId: 'AUTRE', declaringCompany: 'Lebtex', arrivalDate: '2026-09-02' }, // sans BL
];

const suppliers = {
  MH:    { name: 'MH',    emails: ['sales@mh-textile.cn'] },
  JIMMY: { name: 'JIMMY', emails: ['jimmy@zip-factory.com'] },
};

let pass = 0, fail = 0;
function check(titre: string, cond: boolean, detail = '') {
  if (cond) { pass++; console.log(`  ✓ ${titre}`); }
  else { fail++; console.log(`  ✗ ${titre}  ${detail}`); }
}

console.log('\n── Normalisation ──');
check('ponctuation ignorée', normalizeRef('BL n° 26-HD 1004') === 'BLN26HD1004');
check('refs extraites', extractRefCandidates('dossier 26HD1004 et 10426HT1004').length === 2);

console.log('\n── BL dans l\'objet → dossier sûr ──');
let m = bestArrivageForEmail(
  { subject: 'DUM dossier 26HD1004 remise transitaire', from: 'nouh@transit.ma',
    text: 'Bonjour, la DUM est prête.', date: '2026-09-03' },
  factures, { accountKey: 'lebtex', suppliers });
check('F1 trouvé', m?.factureId === 'F1', `→ ${m?.factureId}`);
check('confiance sûre', m?.confidence === 'sure', `→ ${m?.confidence} (${m?.score} pts)`);
check('raison BL objet', !!m?.reasons.find(r => r.code === 'bl_objet'));
check('raison transitaire', !!m?.reasons.find(r => r.code === 'transitaire'));

console.log('\n── BL écrit avec des séparateurs ──');
m = bestArrivageForEmail(
  { subject: 'Re: BL 26-HD-1004', from: 'x@y.com', text: '', date: '2026-09-03' },
  factures, { accountKey: 'lebtex' });
check('F1 malgré les tirets', m?.factureId === 'F1', `→ ${m?.factureId}`);

console.log('\n── BL seulement dans une pièce jointe ──');
m = bestArrivageForEmail(
  { subject: 'Documents', from: 'sales@mh-textile.cn', text: 'Please find attached.',
    date: '2026-08-20', attachments: [{ filename: 'INVOICE_26HD1004.pdf' }] },
  factures, { accountKey: 'lebtex', suppliers });
check('F1 via pièce jointe', m?.factureId === 'F1', `→ ${m?.factureId}`);
check('expéditeur reconnu', !!m?.reasons.find(r => r.code === 'fournisseur_expediteur'));

console.log('\n── Mauvaise boîte : dossier Robe in box vu depuis Lebtex ──');
const all = matchEmailToArrivages(
  { subject: 'BL 26HD1005 arrivé', from: 'x@y.com', text: '', date: '2026-09-11' },
  factures, { accountKey: 'lebtex' });
check('F2 pénalisé mais visible', all[0]?.factureId === 'F2', `→ ${all[0]?.factureId}`);
check('raison société autre', !!all[0]?.reasons.find(r => r.code === 'societe_autre'));
check('pas "sûr" depuis la mauvaise boîte', all[0]?.confidence !== 'sure', `→ ${all[0]?.confidence}`);

console.log('\n── « New fournitures » : neutre, aucune pénalité ──');
m = bestArrivageForEmail(
  { subject: 'dossier 10426HT1004', from: 'x@y.com', text: '', date: '2026-09-06' },
  factures, { accountKey: 'lebtex' });
check('F3 trouvé', m?.factureId === 'F3', `→ ${m?.factureId}`);
check('aucune pénalité société', !m?.reasons.find(r => r.code === 'societe_autre'));

console.log('\n── Aucun indice → aucun rattachement ──');
check('newsletter ignorée',
  matchEmailToArrivages(
    { subject: 'Promo Black Friday -50%', from: 'news@shop.com', text: 'Profitez !', date: '2026-09-03' },
    factures, { accountKey: 'lebtex' }).length === 0);

console.log('\n── Email hors période du dossier ──');
m = bestArrivageForEmail(
  { subject: 'BL 26HD1004', from: 'x@y.com', text: '', date: '2027-06-01' },
  factures, { accountKey: 'lebtex' });
check('trouvé quand même (BL explicite)', m?.factureId === 'F1');
check('mais signalé hors période', !!m?.reasons.find(r => r.code === 'hors_periode'));

console.log('\n── Nom de fournisseur court : pas de faux positif ──');
const mh = matchEmailToArrivages(
  { subject: 'Nouvelle norme MHZ pour les moteurs', from: 'x@y.com', text: 'RAS', date: '2026-09-03' },
  factures, { accountKey: 'lebtex', suppliers });
check('« MHZ » ne matche pas le fournisseur « MH »', mh.length === 0, `→ ${mh.length} candidat(s)`);

console.log('\n── Noms de partenaires en plusieurs mots ──');
m = bestArrivageForEmail(
  { subject: 'DUM dossier 26HD1004', from: 'nouh@transit.ma', text: '', date: '2026-09-03' },
  factures, { accountKey: 'lebtex' });
check('« NOUH TRANSIT » reconnu via « nouh@transit.ma »',
  !!m?.reasons.find(r => r.code === 'transitaire'), `→ ${m?.reasons.map(r => r.code).join()}`);

const facturesGen: any[] = [{ id: 'G1', noBL: '26HD9999', supplierId: 'MH',
  declaringCompany: 'Lebtex', forwarder: 'TRANSIT MAROC SARL', arrivalDate: '2026-09-01' }];
m = bestArrivageForEmail(
  { subject: 'BL 26HD9999', from: 'x@y.com', text: 'transit maroc import export', date: '2026-09-01' },
  facturesGen, { accountKey: 'lebtex' });
check('mots génériques seuls ne prouvent rien (TRANSIT/MAROC/SARL)',
  !m?.reasons.find(r => r.code === 'transitaire'), `→ ${m?.reasons.map(r => r.code).join()}`);

// ─── Ce que la compagnie maritime nous apprend ────────────────────────────────
// Le suivi ShipsGo donne le conteneur, le navire et le voyage : autant d'indices
// que le message n'a pas besoin de nommer « avis d'arrivée » pour être reconnu.
const AUJOURDHUI = Date.parse('2026-09-15T12:00:00Z');
const suivi = {
  shipmentId: 6771254, reference: 'NBOGD2212400', statut: 'SAILING',
  conteneurs: ['TIIU7634594'], navire: 'SEASPAN BRIGHTNESS', voyage: '0102W',
  etapes: [], abonnes: [], majLe: '2026-09-15T00:00:00Z', dateDechargementReelle: false,
};
const avecSuivi: any[] = [
  { id: 'S1', noBL: 'NBOGD2212400', supplierId: 'MH', declaringCompany: 'Lebtex',
    shippingLine: 'ONE', arrivalDate: '2026-09-20', suivi },
  { id: 'S2', noBL: 'MEDUKV285573', supplierId: 'JIMMY', declaringCompany: 'Lebtex',
    arrivalDate: '2026-09-18' },
];

console.log('\n── Un message qui ne dit pas « avis d\'arrivée » ──');
m = bestArrivageForEmail(
  { subject: 'Container TIIU7634594 - documents', from: 'ops@agent.ma',
    text: 'Veuillez trouver les documents.', date: '2026-09-14' },
  avecSuivi, { accountKey: 'lebtex' });
check('rattaché par le n° de conteneur', m?.factureId === 'S1', `→ ${m?.factureId}`);
check('et c’est un rattachement sûr', m?.confidence === 'sure', `→ ${m?.confidence} (${m?.score})`);
check('la raison est affichable',
  !!m?.reasons.find(r => r.code === 'conteneur_objet'), `→ ${m?.reasons.map(r => r.code).join()}`);

console.log('\n── Le navire comme indice ──');
m = bestArrivageForEmail(
  { subject: 'Préavis SEASPAN BRIGHTNESS voyage 0102W', from: 'agence@one-line.com',
    text: 'Le navire est annoncé.', date: '2026-09-14' },
  avecSuivi, { accountKey: 'lebtex' });
check('rattaché au bon dossier', m?.factureId === 'S1', `→ ${m?.factureId}`);
check('navire compté', !!m?.reasons.find(r => r.code === 'navire_objet'));
check('voyage compté en renfort', !!m?.reasons.find(r => r.code === 'voyage'));

console.log('\n── Un navire qui ne distingue rien ──');
check('« TANGER A » écarté', !navireIdentifiable('TANGER A'));
check('« CASABLANCA » écarté', !navireIdentifiable('CASABLANCA'));
check('« MSC ANNA » retenu', navireIdentifiable('MSC ANNA'));
check('« SEASPAN BRIGHTNESS » retenu', navireIdentifiable('SEASPAN BRIGHTNESS'));
check('nom trop court écarté', !navireIdentifiable('ZIM'));
{
  const piege: any[] = [{ id: 'P1', noBL: 'X123456', supplierId: 'MH', arrivalDate: '2026-09-20',
    suivi: { ...suivi, navire: 'TANGER A' } }];
  const r = bestArrivageForEmail(
    { subject: 'Info', text: 'Le port de Tanger a été atteint hier.', from: 'x@y.ma', date: '2026-09-14' },
    piege, { accountKey: 'lebtex' });
  check('« Tanger a été atteint » ne rattache rien', !r?.reasons.find(x => x.code.startsWith('navire')), `→ ${r?.reasons.map(x => x.code).join()}`);
}

console.log('\n── Chercher dans Gmail par ce qu’on connaît ──');
const refs = referencesRecherchables(avecSuivi, { maintenant: AUJOURDHUI });
check('le conteneur est cherché', refs.some(r => r.terme === 'TIIU7634594' && r.type === 'conteneur'));
check('les BL aussi', refs.filter(r => r.type === 'bl').length === 2, JSON.stringify(refs.map(r => r.terme)));
check('le navire aussi', refs.some(r => r.terme === 'SEASPAN BRIGHTNESS' && r.type === 'navire'));
check('chaque terme sait d’où il vient', refs.every(r => r.factureId));

const requete = rechercheGmailReferences(refs);
check('syntaxe OU de Gmail', requete.includes('{') && requete.includes('}'));
check('navire entre guillemets', requete.includes('"SEASPAN BRIGHTNESS"'), requete);
check('limité dans le temps', requete.includes('newer_than:120d'));
check('sans les messages envoyés', requete.includes('-in:sent'));
check('aucune référence → aucune requête', rechercheGmailReferences([]) === '');

const vieux: any[] = [{ id: 'V1', noBL: 'ANCIEN123', arrivalDate: '2025-01-01', supplierId: 'MH' }];
check('un dossier clos depuis longtemps n’est plus cherché',
  referencesRecherchables(vieux, { maintenant: AUJOURDHUI }).length === 0);

check('plafond respecté',
  referencesRecherchables(Array.from({ length: 60 }, (_, i) => ({
    id: `F${i}`, noBL: `BL${100000 + i}`, arrivalDate: '2026-09-20', supplierId: 'MH',
  })) as any, { maintenant: AUJOURDHUI, maxTermes: 24 }).length === 24);

console.log('\n── Dire pourquoi un message est remonté ──');
const citees = referencesCitees(
  { subject: 'Container TIIU7634594', text: 'navire SEASPAN BRIGHTNESS' },
  refs);
check('conteneur reconnu', citees.some(r => r.type === 'conteneur'));
check('navire reconnu', citees.some(r => r.type === 'navire'));
check('rien d’inventé', !citees.some(r => r.terme === 'MEDUKV285573'));

console.log(`\n═══ ${pass} réussis, ${fail} échoués ═══\n`);
process.exit(fail > 0 ? 1 : 0);
