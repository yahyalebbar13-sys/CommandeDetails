// ─── Tests du rapprochement Email ↔ Arrivage ─────────────────────────────────
// Le projet n'a pas de runner de tests : ce script se lance à la main.
//   npx tsx scripts/test-email-arrivage-match.ts
// Sortie non nulle si un cas échoue.

import {
  matchEmailToArrivages, bestArrivageForEmail, normalizeRef,
  extractRefCandidates, accountKeysForCompany, imapSearchTermsForFacture,
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

console.log('\n── Dossier sans BL ──');
check('aucun terme de recherche IMAP', imapSearchTermsForFacture(factures[3]).length === 0);
check('termes pour F1', imapSearchTermsForFacture(factures[0])[0] === '26HD1004');

console.log('\n── Boîtes à interroger selon la société ──');
check('Lebtex → 1 boîte', accountKeysForCompany('Lebtex').join() === 'lebtex');
check('Robe in box → 1 boîte', accountKeysForCompany('Robe in box').join() === 'robeinbox');
check('New fournitures → les deux', accountKeysForCompany('New fournitures').length === 2);
check('vide → les deux', accountKeysForCompany(undefined).length === 2);

console.log(`\n═══ ${pass} réussis, ${fail} échoués ═══\n`);
process.exit(fail > 0 ? 1 : 0);
