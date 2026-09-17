// ─── Tests de la détection du type d'email ───────────────────────────────────
//   npx tsx scripts/test-email-events.ts
// Sortie non nulle si un cas échoue.

import { detectEmailEvents, mainEmailEvent, needsAiFallback } from '../src/lib/email-events';

let pass = 0, fail = 0;
function check(titre: string, cond: boolean, detail = '') {
  if (cond) { pass++; console.log(`  ✓ ${titre}`); }
  else { fail++; console.log(`  ✗ ${titre}  ${detail}`); }
}
function principal(subject: string, text = '', attachments: any[] = []) {
  return mainEmailEvent({ subject, text, attachments })?.type;
}

console.log('\n── Emails récurrents du transitaire ──');
check('avis d\'arrivée',
  principal('AVIS D\'ARRIVEE MSC LORETO - DOSSIER 26HD1004') === 'AVIS_ARRIVEE');
check('avis d\'arrivée en anglais',
  principal('Arrival Notice / MSKU7654321') === 'AVIS_ARRIVEE');
check('DUM',
  principal('Remise DUM dossier 26HD1004') === 'DUM');
check('bon à délivrer',
  principal('BON A DELIVRER - 26HD1004') === 'BON_A_DELIVRER');
check('bon affecté',
  principal('Le bon est affecte au dossier 26HD1004') === 'BON_A_DELIVRER');
check('delivery order',
  principal('Delivery Order released') === 'BON_A_DELIVRER');
check('mainlevée',
  principal('MAINLEVEE ACCORDEE DOSSIER 26HD1004') === 'MAINLEVEE');
check('sortie de marchandise',
  principal('Sortie marchandise effectuee ce jour') === 'SORTIE_MARCHANDISE');
check('bon de sortie',
  principal('Bon de sortie 26HD1004') === 'SORTIE_MARCHANDISE');
check('facture transitaire',
  principal('Facture transit dossier 26HD1004') === 'FACTURE_TRANSITAIRE');
check('note d\'honoraires',
  principal('Note d\'honoraires et debours') === 'FACTURE_TRANSITAIRE');

console.log('\n── Engagement (celui que tu veux être notifié) ──');
check('engagement d\'importation',
  principal('Engagement d\'importation 26HD1004') === 'ENGAGEMENT');
check('engagement disponible',
  principal('Votre engagement est disponible sur Portnet') === 'ENGAGEMENT');
check('titre d\'importation',
  principal('Titre d\'importation souscrit') === 'ENGAGEMENT');
check('engagement marqué urgent',
  mainEmailEvent({ subject: 'Engagement d\'importation disponible' })?.urgent === true);

console.log('\n── Accents et casse indifférents ──');
check('« Bon à Délivrer » = « BON A DELIVRER »',
  principal('Bon à Délivrer') === principal('BON A DELIVRER'));
check('« Mainlevée » accentuée', principal('Mainlevée accordée') === 'MAINLEVEE');

console.log('\n── Détection via pièce jointe seule ──');
check('DUM_26HD1004.pdf',
  principal('Documents', 'ci-joint', [{ filename: 'DUM_26HD1004.pdf' }]) === 'DUM');

console.log('\n── Surestaries : frais qui courent ──');
check('surestaries', principal('Surestaries conteneur MSKU7654321') === 'RELANCE_SURESTARIE');
check('demurrage', principal('Demurrage invoice') === 'RELANCE_SURESTARIE');
check('marqué urgent', mainEmailEvent({ subject: 'Surestaries' })?.urgent === true);

console.log('\n── Documents d\'expédition et paiement ──');
check('bill of lading', principal('Bill of Lading draft for approval') === 'DOCUMENTS_EXPEDITION');
check('packing list', principal('Packing list + invoice') === 'DOCUMENTS_EXPEDITION');
check('avis de virement', principal('Avis de virement SWIFT') === 'PAIEMENT');
check('proforma', principal('Proforma Invoice PI-2026-0814') === 'PROFORMA');

console.log('\n── Plusieurs types dans un même email ──');
const multi = detectEmailEvents({
  subject: 'REMISE DUM + BON A DELIVRER dossier 26HD1004',
  text: 'Veuillez trouver la DUM et le bon a delivrer.',
});
check('DUM et BAD détectés tous les deux', multi.length >= 2, `→ ${multi.map(e => e.type).join()}`);
check('les deux repérés dans l\'objet', multi.slice(0, 2).every(e => e.ou === 'objet'));

console.log('\n── Objet prioritaire sur le corps ──');
const ordre = detectEmailEvents({
  subject: 'Bon a delivrer disponible',
  text: 'Pour rappel la facture transit suivra.',
});
check('le type annoncé dans l\'objet passe devant',
  ordre[0]?.type === 'BON_A_DELIVRER', `→ ${ordre[0]?.type}`);

console.log('\n── Rien à reconnaître → bascule vers l\'IA ──');
check('newsletter : aucun type',
  detectEmailEvents({ subject: 'Promo Black Friday -50%', text: 'Profitez !' }).length === 0);
check('newsletter → fallback IA',
  needsAiFallback({ subject: 'Promo Black Friday -50%', text: 'Profitez !' }));
check('email reconnu → pas de fallback IA',
  !needsAiFallback({ subject: 'MAINLEVEE ACCORDEE' }));

console.log('\n── Pas de faux positif sur « bad » anglais ──');
check('« bad news » n\'est pas un bon à délivrer',
  principal('Some bad news about the shipment') !== 'BON_A_DELIVRER',
  `→ ${principal('Some bad news about the shipment')}`);

console.log('\n── Ce que l\'email fait avancer dans la checklist ──');
check('mainlevée → douane_ok', mainEmailEvent({ subject: 'Mainlevee' })?.checklistId === 'douane_ok');
check('facture transitaire → facture_mad_ok',
  mainEmailEvent({ subject: 'Facture transit' })?.checklistId === 'facture_mad_ok');

console.log(`\n═══ ${pass} réussis, ${fail} échoués ═══\n`);
process.exit(fail > 0 ? 1 : 0);
