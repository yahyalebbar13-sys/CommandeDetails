// Tests du branchement Sendit (lib/sendit.ts, lib/sendit-statuts.ts) :
// corps du colis, téléphones, contrôles avant envoi, statuts, signature du webhook.
// Aucun appel réseau, aucune base : seulement les fonctions pures.
// Lancer :
//   npx tsx scripts/test-sendit.ts

import { createHmac } from 'crypto';
import {
  choisirColisRetrouve,
  evenementRecent,
  montantPartielValide,
  choisirRamassageCasablanca,
  colisDe,
  commandePourSendit,
  controlerEnvoi,
  corpsColis,
  erreurSenditPour,
  ErreurSendit,
  expirationJwt,
  filtrerQuartiers,
  horodatageSendit,
  jetonWebhookValide,
  lireEvenementSendit,
  listeDe,
  messageErreurSendit,
  montantAEncaisser,
  nettoyerPourSendit,
  paiementRecuDe,
  PLAFOND_ESPECES_COLIS,
  quartierDe,
  senditConfigure,
  signatureSenditValide,
  signerSendit,
  suggererQuartier,
  telephoneSendit,
  texteProduits,
  totalRecalcule,
  urlEtiquetteSure,
  type QuartierSendit,
} from '../src/lib/sendit';
import {
  codeStatutSendit,
  colisTermine,
  decisionStatutSendit,
  effetStatutSendit,
  libelleStatutSendit,
  tonStatutSendit,
} from '../src/lib/sendit-statuts';

let pass = 0;
let fail = 0;
function check(label: string, ok: boolean, detail = '') {
  if (ok) { pass++; console.log(`  ✓ ${label}`); }
  else { fail++; console.log(`  ✗ ${label} ${detail}`); }
}
const egal = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);

// Une commande telle que le checkout l'écrit (brute, Firestore).
function commandeBrute(extra: Record<string, unknown> = {}) {
  return {
    orderNumber: 'LBT-MG12AB-XY9Z',
    customerName: 'Fatima Zahra',
    customerPhone: '+212 6 12 34 56 78',
    status: 'confirmed',
    items: [
      { productId: 'p1', productName: 'Fermeture | invisible; 20 cm', productImage: '', price: 10, unitPrice: 8, quantity: 5, maxStock: 99, variant: { color: 'Noir', size: '20' } },
      { productId: 'p2', productName: 'Fil: polyester', productImage: '', price: 15, quantity: 2, maxStock: 99 },
    ],
    subtotal: 70,
    deliveryFee: 20,
    total: 90,
    shippingAddress: { fullName: 'Fatima Zahra', phone: '06 12 34 56 78', phone2: '0522-11-22-33', address: 'Rue 12, n° 4, Hay Hassani', city: 'Casablanca' },
    notes: 'Appeler avant\nde venir',
    ...extra,
  };
}

console.log('\n── Téléphones ──');
check('06 avec espaces', telephoneSendit('06 12 34 56 78') === '0612345678');
check('+212 avec 0 oublié', telephoneSendit('+212612345678') === '0612345678');
check('00212', telephoneSendit('00212 7 00 11 22 33') === '0700112233');
check('9 chiffres sans 0', telephoneSendit('612345678') === '0612345678');
check('fixe 05', telephoneSendit('0522-11-22-33') === '0522112233');
check('chiffres arabes', telephoneSendit('٠٦١٢٣٤٥٦٧٨') === '0612345678');
check('trop court refusé', telephoneSendit('06123') === null);
check('numéro étranger refusé', telephoneSendit('+33 6 12 34 56 78') === null);
check('09 refusé', telephoneSendit('0912345678') === null);
check('vide refusé', telephoneSendit('') === null && telephoneSendit(undefined) === null);

console.log('\n── Textes pour l’étiquette ──');
check('séparateurs retirés', nettoyerPourSendit('A | B; C: D', 50) === 'A / B, C - D', nettoyerPourSendit('A | B; C: D', 50));
check('retours à la ligne aplatis', nettoyerPourSendit('a\n\tb', 50) === 'a b');
check('coupé proprement', nettoyerPourSendit('x'.repeat(30), 10).length === 10 && nettoyerPourSendit('x'.repeat(30), 10).endsWith('…'));
const produits = texteProduits(commandePourSendit('c1', commandeBrute()).commande.items);
check('produits lisibles', produits === 'Fermeture / invisible, 20 cm (Noir · 20) x5 / Fil - polyester x2', produits);
check('produits sans « | ; : »', !/[|;:]/.test(produits));

console.log('\n── Commande lue pour Sendit ──');
const c = commandePourSendit('c1', commandeBrute());
check('ancienne commande = domicile, espèces, préparée à Derb Omar', c.mode === 'domicile' && c.paiement === 'cod' && c.volumineux === false && c.lieu === 'derb_omar');
check('volumineux préparé à CHRIFA', commandePourSendit('c1', commandeBrute({ reception: { mode: 'transport', volumineux: true } })).lieu === 'chrifa');
check('volumineux « true » écrit en texte : ignoré', commandePourSendit('c1', commandeBrute({
  items: [{ productId: 'r', productName: 'Fil', price: 90, quantity: 1, maxStock: 5, volumineux: 'true' }],
})).volumineux === false);
check('mode lu dans le brut', commandePourSendit('c1', commandeBrute({ reception: { mode: 'retrait', volumineux: false, lieuRetrait: 'derb_omar' } })).mode === 'retrait');
check('mode inconnu = domicile', commandePourSendit('c1', commandeBrute({ reception: { mode: 'drone' } })).mode === 'domicile');
check('un article volumineux suffit', commandePourSendit('c1', commandeBrute({
  items: [{ productId: 'r', productName: 'Rouleau TAFFETA', price: 900, quantity: 1, maxStock: 5, volumineux: true }],
})).volumineux === true);
check('virement lu dans le brut', commandePourSendit('c1', commandeBrute({ paymentMethod: 'virement' })).paiement === 'virement');
check('paiement inconnu = espèces', commandePourSendit('c1', commandeBrute({ paymentMethod: 'bitcoin' })).paiement === 'cod');

console.log('\n── Paiement reçu (interne) ──');
check('paiement.recu', paiementRecuDe({ paiement: { recu: true } }) === true);
check('reçu annulé', paiementRecuDe({ paiement: { recu: false, le: { seconds: 1 } } }) === false);
check('rien', paiementRecuDe({}) === false && paiementRecuDe(undefined) === false);
check('recu « oui » en texte refusé', paiementRecuDe({ paiement: { recu: 'oui' } }) === false);

console.log('\n── Montant à encaisser ──');
check('espèces : le total', montantAEncaisser(c, false) === 90);
const vir = commandePourSendit('c1', commandeBrute({ paymentMethod: 'virement' }));
check('virement reçu : 0', montantAEncaisser(vir, true) === 0);
check('virement pas encore reçu : le total', montantAEncaisser(vir, false) === 90);
check('espèces, puis virement arrangé au téléphone et noté reçu : 0', montantAEncaisser(c, true) === 0);
check('total recalculé (prix appliqué 8 × 5 + 15 × 2 + 20)', totalRecalcule(c.commande) === 90);

console.log('\n── Contrôles avant envoi ──');
const ok = controlerEnvoi(c, { paiementRecu: false, fraisAttendus: 20 });
check('commande propre : rien ne bloque', ok.blocages.length === 0, JSON.stringify(ok.blocages));
check('téléphone retenu = celui de l’adresse', ok.telephone === '0612345678');
check('montant = total', ok.montant === 90 && !ok.plafondDepasse);
const bloque = (extra: Record<string, unknown>, o: { paiementRecu?: boolean } = {}) =>
  controlerEnvoi(commandePourSendit('c1', commandeBrute(extra)), { paiementRecu: o.paiementRecu ?? false });
check('en attente : bloqué', bloque({ status: 'pending' }).blocages.some(b => b.includes('en attente')));
check('déjà expédiée : bloqué', bloque({ status: 'shipped' }).blocages.length > 0);
check('en préparation : permis', bloque({ status: 'processing' }).blocages.length === 0);
check('retrait : bloqué', bloque({ reception: { mode: 'retrait', volumineux: false } }).blocages.some(b => b.includes('retirer')));
check('transport : bloqué', bloque({ reception: { mode: 'transport', volumineux: true } }).blocages.some(b => b.includes('volumineux')));
check('volumineux même noté « domicile » : bloqué', bloque({
  reception: { mode: 'domicile', volumineux: false },
  items: [{ productId: 'r', productName: 'Rouleau', price: 70, quantity: 1, maxStock: 1, volumineux: true }],
}).blocages.some(b => b.includes('volumineux')));
check('téléphone invalide : bloqué', bloque({ customerPhone: '123', shippingAddress: { fullName: 'A', phone: '12', address: 'x', city: 'Rabat' } })
  .blocages.some(b => b.includes('téléphone')));
check('total incohérent : bloqué', bloque({ total: 50 }).blocages.some(b => b.includes('ne correspond pas')));
// Le checkout n'écrit jamais de remise : une remise est forcément écrite à la main dans la commande.
check('remise (jamais écrite par le checkout) : bloqué', bloque({ discount: 10, total: 80 }).blocages.some(b => b.includes('remise')));
check('remise négative : bloqué aussi', bloque({ discount: -10, total: 100 }).blocages.some(b => b.includes('remise')));
check('quantité négative : bloqué, même si le total colle', bloque({
  items: [
    { productId: 'p1', productName: 'Tissu', price: 800, unitPrice: 800, quantity: 1, maxStock: 9 },
    { productId: 'p2', productName: 'Tissu', price: 700, unitPrice: 700, quantity: -1, maxStock: 9 },
  ], subtotal: 100, deliveryFee: 20, total: 120,
}).blocages.some(b => b.includes('quantité')));
check('quantité invalide : « x? » sur l’étiquette, jamais « x1 »', texteProduits([
  { productId: 'p', productName: 'Tissu', productImage: '', price: 10, quantity: -1, maxStock: 1 },
]) === 'Tissu x?');
check('sous-total gonflé (différent des lignes) : bloqué', bloque({ subtotal: 5000 }).blocages.some(b => b.includes('sous-total')));
check('frais négatifs : bloqué', bloque({ deliveryFee: -20, total: 50 }).blocages.some(b => b.includes('négatifs')));
check('virement non reçu : signalé (l’équipe ne peut pas envoyer)', controlerEnvoi(vir, { paiementRecu: false }).virementNonRecu
  && !controlerEnvoi(vir, { paiementRecu: true }).virementNonRecu && !controlerEnvoi(c, { paiementRecu: false }).virementNonRecu);
check('article sans prix : bloqué', bloque({
  items: [{ productId: 'p', productName: 'Sur demande', price: 0, quantity: 1, maxStock: 1 }], subtotal: 0, total: 20,
}).blocages.some(b => b.includes('pas de prix')));
check('adresse vide : bloqué', bloque({ shippingAddress: { fullName: 'A', phone: '0612345678', address: ' ', city: 'Rabat' } })
  .blocages.some(b => b.includes('adresse')));
const gros = bloque({ items: [{ productId: 'p', productName: 'Lot', price: 1000, quantity: 4, maxStock: 9 }], subtotal: 4000, deliveryFee: 0, total: 4000 });
check(`plus de ${PLAFOND_ESPECES_COLIS} DH d’espèces : signalé`, gros.plafondDepasse && gros.blocages.length === 0);
const grosVirement = bloque({ paymentMethod: 'virement', items: [{ productId: 'p', productName: 'Lot', price: 1000, quantity: 4, maxStock: 9 }], subtotal: 4000, deliveryFee: 0, total: 4000 }, { paiementRecu: true });
check('gros colis payé par virement : pas de plafond', !grosVirement.plafondDepasse && grosVirement.montant === 0);
const grosEspecesRecu = bloque({ items: [{ productId: 'p', productName: 'Lot', price: 1000, quantity: 4, maxStock: 9 }], subtotal: 4000, deliveryFee: 0, total: 4000 }, { paiementRecu: true });
check('gros colis en espèces, payé par virement après l’appel : plafond levé', !grosEspecesRecu.plafondDepasse && grosEspecesRecu.montant === 0
  && grosEspecesRecu.avertissements.some(a => a.includes('déjà reçu')));
check('virement non reçu : averti', controlerEnvoi(vir, { paiementRecu: false }).avertissements.some(a => a.includes('pas encore marqué reçu')));
check('espèces non reçues : pas d’avertissement de paiement', controlerEnvoi(c, { paiementRecu: false, fraisAttendus: 20 }).avertissements.length === 0);
check('frais trop bas : averti', controlerEnvoi(commandePourSendit('c1', commandeBrute({ deliveryFee: 0, total: 70 })), { paiementRecu: false, fraisAttendus: 20 })
  .avertissements.some(a => a.includes('grille')));
check('frais offerts et grille à 0 : rien', controlerEnvoi(commandePourSendit('c1', commandeBrute({ deliveryFee: 0, total: 70 })), { paiementRecu: false, fraisAttendus: 0 })
  .avertissements.length === 0);

console.log('\n── Corps du colis ──');
const corps = corpsColis(c, { districtId: 473, ramassageId: 46, montant: ok.montant, telephone: ok.telephone! });
check('référence = n° de commande', corps.reference === 'LBT-MG12AB-XY9Z');
check('montant', corps.amount === 90);
check('quartiers', corps.district_id === 473 && corps.pickup_district_id === 46);
check('ni ouvert ni essayé, pas de stock Sendit', corps.allow_open === 0 && corps.allow_try === 0 && corps.products_from_stock === 0);
check('adresse avec la ville', corps.address === 'Rue 12, n° 4, Hay Hassani, Casablanca', corps.address);
check('commentaire : 2e tél. + note', corps.comment === '2e tél. 0522112233 / Note client - Appeler avant de venir', corps.comment);
check('nom', corps.name === 'Fatima Zahra');
const sansDoublon = corpsColis(commandePourSendit('c1', commandeBrute({ shippingAddress: { fullName: 'B', phone: '0612345678', phone2: '+212612345678', address: 'Av. Hassan II, Rabat', city: 'Rabat' }, notes: '' })),
  { districtId: 53, ramassageId: 46, montant: 10, telephone: '0612345678' });
check('2e tél. identique ignoré', sansDoublon.comment === '');
check('ville déjà dans l’adresse : pas répétée', sansDoublon.address === 'Av. Hassan II, Rabat');
check('clés attendues seulement', egal(Object.keys(corps).sort(), [
  'address', 'allow_open', 'allow_try', 'amount', 'comment', 'district_id', 'name', 'phone', 'pickup_district_id', 'products', 'products_from_stock', 'reference',
]));

console.log('\n── Quartiers ──');
const bruts = [
  { id: 473, ville: 'Casablanca', name: 'Casablanca - Abdelmoumen', arabic_name: 'الدار البيضاء-عبد المومن', price: '19', delais: '24h', pickup_district: 0 },
  { id: 468, ville: 'Casablanca', name: 'Casablanca - Lamkansa', arabic_name: '', price: '19', delais: '24h' },
  { id: 46, ville: 'Casablanca', name: 'Casablanca - Autres quartiers', arabic_name: '', price: '19', delais: '24h', pickup_district: 1 },
  { id: 53, ville: 'Rabat', name: 'Rabat', arabic_name: 'الرباط', price: '35', delais: '24h - 48h' },
  { id: 139, ville: 'Fes', name: 'Fes', arabic_name: 'فاس', price: '35', delais: '24h - 48h' },
  { id: 40, ville: 'Dar Bouaza', name: 'Dar Bouaza', arabic_name: '', price: '29', delais: '24h' },
  { id: 0, ville: 'X', name: 'Illisible', price: '1' },
  { id: 12, name: '', price: '1' },
];
const quartiers = bruts.map(quartierDe).filter((q): q is QuartierSendit => q !== null);
check('entrées illisibles écartées', quartiers.length === 6);
check('prix en nombre', quartiers[0].price === 19);
check('prix absent = null', quartierDe({ id: 5, name: 'A' })?.price === null);
check('recherche sans accents', filtrerQuartiers(quartiers, 'fès').map(q => q.id).join() === '139');
check('recherche de mots', filtrerQuartiers(quartiers, 'casa abdel').map(q => q.id).join() === '473');
check('recherche en arabe', filtrerQuartiers(quartiers, 'الرباط').map(q => q.id).join() === '53');
check('ville seule : ses quartiers', filtrerQuartiers(quartiers, '', 'Casablanca').length === 3);
check('ville du client en tête', filtrerQuartiers(quartiers, 'a', 'Rabat')[0].id === 53);
check('rien tapé, pas de ville : rien', filtrerQuartiers(quartiers, '').length === 0);
check('limite respectée', filtrerQuartiers(quartiers, 'a', '', 2).length === 2);
check('suggestion : Rabat', suggererQuartier(quartiers, 'Rabat')?.id === 53);
check('suggestion : Fès (accent)', suggererQuartier(quartiers, 'Fès')?.id === 139);
check('suggestion : Casablanca = rien (plusieurs quartiers)', suggererQuartier(quartiers, 'Casablanca') === null);
check('ramassage : Casablanca trouvée', choisirRamassageCasablanca([{ id: 41, name: 'Mohammedia' }, { id: 46, name: 'Casablanca - Autres quartiers' }])?.id === 46);
check('ramassage : absent = null', choisirRamassageCasablanca([{ id: 53, name: 'Rabat' }]) === null);
check('liste dans data', listeDe({ data: [1, 2] }).length === 2);
check('liste paginée dans data.data', listeDe({ data: { data: [1], total: 1 } }).length === 1);
check('liste absente', listeDe({ message: 'x' }).length === 0);

console.log('\n── Colis renvoyés par Sendit ──');
const colis = colisDe({ code: 'DHF420101C', status: 'pending', fee: '19.00', reference: 'LBT-MG12AB-XY9Z', phone: '0612345678', district: { name: 'Casablanca - Abdelmoumen' }, last_action_at: '2026-09-29T10:05:00Z' });
check('colis lu', colis?.code === 'DHF420101C' && colis.statut === 'PENDING' && colis.fee === 19 && colis.quartier === 'Casablanca - Abdelmoumen');
check('heure normalisée', colis?.derniereAction === '2026-09-29 10:05:00', String(colis?.derniereAction));
check('code illisible = null', colisDe({ code: 'a/b' }) === null && colisDe(null) === null);
const liste = [
  colisDe({ code: 'AAA111', status: 'DELIVERED', reference: 'LBT-OLD', phone: '0612345678' })!,
  colisDe({ code: 'BBB222', status: 'PENDING', reference: 'LBT-MG12AB-XY9Z', phone: '0612345678' })!,
];
check('retrouvé par référence', choisirColisRetrouve(liste, 'lbt-mg12ab-xy9z', '0612345678').colis?.code === 'BBB222');
check('ancien colis du même client ignoré', choisirColisRetrouve([liste[0]], 'LBT-NEW', '0612345678').colis === null);
const sansRef = [colisDe({ code: 'CCC333', status: 'PENDING', phone: '+212612345678' })!];
// Un colis au même téléphone sans notre référence peut être un colis fait à la main (vente /stock) :
// jamais rattaché tout seul, il revient comme candidat que l'équipe confirme.
const unCandidat = choisirColisRetrouve(sansRef, 'LBT-X', '0612345678');
check('sans référence : pas rattaché tout seul, proposé à l’équipe', unCandidat.colis === null && !unCandidat.ambigu
  && unCandidat.candidats.map(x => x.code).join() === 'CCC333');
const deux = choisirColisRetrouve([...sansRef, colisDe({ code: 'DDD444', status: 'PENDING', phone: '0612345678' })!], 'LBT-X', '0612345678');
check('deux candidats : les deux proposés, aucun rattaché', deux.colis === null && deux.candidats.length === 2);
check('deux colis à notre référence : ambigu', choisirColisRetrouve([liste[1], colisDe({ code: 'EEE555', status: 'PENDING', reference: 'LBT-MG12AB-XY9Z' })!], 'LBT-MG12AB-XY9Z', '0612345678').ambigu);
check('référence nettoyée comme à l’envoi', choisirColisRetrouve([colisDe({ code: 'FFF666', status: 'PENDING', reference: 'LBT-A - B' })!], 'LBT-A: B', '').colis?.code === 'FFF666');

console.log('\n── Erreurs : peut-être créé ? ──');
check('pas de réponse : peut-être créé', new ErreurSendit('x', 'delai').peutEtreFait && new ErreurSendit('x', 'reseau').peutEtreFait);
check('502 / 503 / 504 de la passerelle : peut-être créé', [502, 503, 504, 500].every(n => new ErreurSendit('x', 'reponse', n).peutEtreFait));
check('408 : peut-être créé', new ErreurSendit('x', 'refus', 408).peutEtreFait);
check('refus clair (422, 429, success:false en 200) : rien de créé', !new ErreurSendit('x', 'refus', 422).peutEtreFait
  && !new ErreurSendit('x', 'refus', 429).peutEtreFait && !new ErreurSendit('x', 'reponse', 200).peutEtreFait);
const avant = new ErreurSendit('x', 'reponse', 503);
avant.avantEnvoi = true;
check('connexion en panne avant l’envoi : rien de créé', !avant.peutEtreFait);

console.log('\n── Montant partiel (au-delà du plafond, administrateur) ──');
check('2 500 sur 4 200 : accepté', montantPartielValide('2 500'.replace(' ', ''), 4200) === 2500 && montantPartielValide(2500, 4200) === 2500);
check('au-delà de 3 000 : refusé', montantPartielValide(3500, 4200) === null);
check('le total entier : refusé (ce n’est plus un partiel)', montantPartielValide(2000, 2000) === null);
check('0 ou négatif : refusé', montantPartielValide(0, 4200) === null && montantPartielValide(-5, 4200) === null);
check('illisible : refusé', montantPartielValide('abc', 4200) === null && montantPartielValide(undefined, 4200) === null);

console.log('\n── Webhook : événement récent (jeton seul) ──');
const MAINTENANT_WH = Date.UTC(2026, 8, 29, 15, 0);
check('heure du jour : récent', evenementRecent('2026-09-29 16:05:05', MAINTENANT_WH));
check('il y a 5 jours : trop ancien', !evenementRecent('2026-09-24 10:00:00', MAINTENANT_WH));
check('sans heure : refusé', !evenementRecent(null, MAINTENANT_WH));
check('dans le futur lointain : refusé', !evenementRecent('2026-10-05 10:00:00', MAINTENANT_WH));

console.log('\n── Lien d’étiquette ──');
check('app.sendit.ma accepté', urlEtiquetteSure('https://app.sendit.ma/storage/labels/x.pdf?sig=1') !== null);
check('sous-domaine sendit.ma accepté', urlEtiquetteSure('https://cdn.sendit.ma/x.pdf') !== null);
check('http refusé', urlEtiquetteSure('http://app.sendit.ma/x.pdf') === null);
check('autre domaine refusé', urlEtiquetteSure('https://app.sendit.ma.evil.com/x.pdf') === null);
check('faux suffixe refusé', urlEtiquetteSure('https://evilsendit.ma/x.pdf') === null);
check('javascript: refusé', urlEtiquetteSure('javascript:alert(1)') === null);

console.log('\n── Erreurs ──');
check('422 avec champs', messageErreurSendit(422, { message: 'Données invalides', errors: { phone: ['Le téléphone est invalide'] } }) === 'Données invalides (phone : Le téléphone est invalide)');
check('429 : trop de demandes', messageErreurSendit(429, null).includes('Trop de demandes'));
check('500 sans message', messageErreurSendit(500, null).includes('Sendit'));
check('non branché : l’équipe passe par app.sendit.ma', erreurSenditPour(new ErreurSendit('x', 'non_configure'), 'staff').message.includes('app.sendit.ma'));
check('non branché : 503 + configure false', (() => { const r = erreurSenditPour(new ErreurSendit('x', 'non_configure'), 'admin'); return r.statut === 503 && r.extra.configure === false; })());
check('sans réponse : 504', erreurSenditPour(new ErreurSendit('x', 'delai'), 'admin').statut === 504);
check('sansReponse vrai pour délai et réseau', new ErreurSendit('x', 'delai').sansReponse && new ErreurSendit('x', 'reseau').sansReponse && !new ErreurSendit('x', 'refus').sansReponse);
check('erreur inconnue : 500', erreurSenditPour(new Error('boum'), 'staff').statut === 500);

console.log('\n── Jeton (échéance lue, jamais montrée) ──');
const jwt = (charge: object) => `e30.${Buffer.from(JSON.stringify(charge)).toString('base64url')}.sig`;
check('exp lu', expirationJwt(jwt({ exp: 2_000_000_000 })) === 2_000_000_000_000);
check('pas un JWT', expirationJwt('abc') === null);
check('exp absent', expirationJwt(jwt({ sub: 1 })) === null);
delete process.env.SENDIT_PUBLIC_KEY;
delete process.env.SENDIT_PRIVATE_KEY;
check('sans clés : non branché', senditConfigure() === false);
process.env.SENDIT_PUBLIC_KEY = 'pub-test';
check('une seule clé : non branché', senditConfigure() === false);
process.env.SENDIT_PRIVATE_KEY = 'priv-test';
check('deux clés : branché', senditConfigure() === true);
delete process.env.SENDIT_PUBLIC_KEY;
delete process.env.SENDIT_PRIVATE_KEY;

console.log('\n── Heures Sendit ──');
check('forme du webhook', horodatageSendit('2025-06-11 16:05:05') === '2025-06-11 16:05:05');
check('forme ISO', horodatageSendit('2025-06-11T16:05:05.000000Z') === '2025-06-11 16:05:05');
check('sans secondes', horodatageSendit('2025-06-11 16:05') === '2025-06-11 16:05:00');
check('illisible', horodatageSendit('hier') === null && horodatageSendit(12) === null);

console.log('\n── Signature du webhook ──');
const SECRET = 'secret-de-test-uniquement';
const CORPS = '{"event":"delivery.status.update","code":"DHF420101C","oldStatus":"PENDING","newStatus":"PICKEDUP"}';
const hex = createHmac('sha256', SECRET).update(CORPS, 'utf8').digest('hex');
const b64 = createHmac('sha256', SECRET).update(CORPS, 'utf8').digest('base64');
check('signerSendit = HMAC-SHA256 hex', signerSendit(CORPS, SECRET) === hex);
check('hex accepté', signatureSenditValide(CORPS, hex, SECRET) === 'hex');
check('hex en majuscules accepté', signatureSenditValide(CORPS, hex.toUpperCase(), SECRET) === 'hex');
check('préfixe sha256= accepté', signatureSenditValide(CORPS, `sha256=${hex}`, SECRET) === 'hex');
check('base64 accepté', signatureSenditValide(CORPS, b64, SECRET) === 'base64');
check('base64 url accepté', signatureSenditValide(CORPS, b64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, ''), SECRET) === 'base64');
check('corps modifié refusé', signatureSenditValide(CORPS.replace('PICKEDUP', 'DELIVERED'), hex, SECRET) === null);
check('autre secret refusé', signatureSenditValide(CORPS, hex, 'autre') === null);
check('signature absente refusée', signatureSenditValide(CORPS, null, SECRET) === null);
check('secret vide refusé', signatureSenditValide(CORPS, hex, '') === null);
check('signature tronquée refusée', signatureSenditValide(CORPS, hex.slice(0, 40), SECRET) === null);
check('un caractère changé refusé', signatureSenditValide(CORPS, hex.replace(/.$/, ch => (ch === 'a' ? 'b' : 'a')), SECRET) === null);
const JETON = 'jeton-de-test-assez-long-0123456789';
check('jeton exact accepté', jetonWebhookValide(JETON, JETON));
check('jeton différent refusé', !jetonWebhookValide(`${JETON}x`, JETON) && !jetonWebhookValide('', JETON) && !jetonWebhookValide(null, JETON));
check('jeton attendu trop court : tout refusé', !jetonWebhookValide('court', 'court'));

console.log('\n── Événements reçus ──');
const guide = lireEvenementSendit({
  event: 'delivery.status.update', code: 'DHF420101C', oldStatus: 'UNREACHABLE', newStatus: 'POSTPONED',
  lastActionAt: '2025-06-11 16:05:05', message: 'Programmé par le client', proofImage: 'https://app.sendit.ma/storage/x.jpg',
  deliverBy: '2025-06-12', counterUnreachable: 1,
});
check('forme du guide officiel', guide?.format === 'code/newStatus' && guide.code === 'DHF420101C' && guide.statut === 'POSTPONED' && guide.ancienStatut === 'UNREACHABLE');
check('détails gardés', guide?.tentatives === 1 && guide.deliverBy === '2025-06-12' && guide.lastActionAt === '2025-06-11 16:05:05' && !!guide.photo);
const plugin = lireEvenementSendit({ reference: 'LBT-MG12AB-XY9Z', status: 'delivered' });
check('forme du plugin WooCommerce', plugin?.format === 'reference/status' && plugin.code === 'LBT-MG12AB-XY9Z' && plugin.statut === 'DELIVERED');
check('photo hors sendit.ma écartée', lireEvenementSendit({ code: 'DHF1', newStatus: 'REJECTED', proofImage: 'https://evil.com/x.jpg' })?.photo === null);
check('sans statut : illisible', lireEvenementSendit({ code: 'DHF420101C' }) === null);
check('code bizarre : illisible', lireEvenementSendit({ code: '../../x', newStatus: 'DELIVERED' }) === null);
check('pas un objet : illisible', lireEvenementSendit([1]) === null && lireEvenementSendit('x') === null);

console.log('\n── Statuts Sendit → commande ──');
check('code normalisé', codeStatutSendit(' picked-up ') === 'PICKED_UP' && codeStatutSendit('PICKEDUP') === 'PICKEDUP' && codeStatutSendit(3) === null);
check('libellé connu', libelleStatutSendit('DELIVERED') === 'Livré');
check('libellé inconnu lisible', libelleStatutSendit('NOUVEAU_TRUC').includes('NOUVEAU_TRUC'));
for (const s of ['PICKEDUP', 'WAREHOUSE', 'TRANSIT']) check(`${s} → expédiée`, effetStatutSendit(s).statut === 'shipped');
for (const s of ['DISTRIBUTED', 'DELIVERING']) check(`${s} → en livraison`, effetStatutSendit(s).statut === 'out_for_delivery');
check('DELIVERED → livrée', effetStatutSendit('DELIVERED').statut === 'delivered');
for (const s of ['CANCELED', 'REJECTED', 'RETURN_SELLER', 'RETURN_WAREHOUSE', 'RETOUR_PENDING', 'RETURNED', 'PARTIALLY_DELIVERED']) {
  const e = effetStatutSendit(s);
  check(`${s} → rien d’automatique, à vérifier`, e.statut === null && e.mention === 'a_verifier');
}
for (const s of ['UNREACHABLE', 'POSTPONED', 'SCHEDULED', 'NEW_DESTINATION']) {
  const e = effetStatutSendit(s);
  check(`${s} → à rappeler`, e.statut === null && e.mention === 'a_rappeler');
}
for (const s of ['PENDING', 'TO_PREPARE', 'TO_PICKUP']) check(`${s} → rien`, effetStatutSendit(s).statut === null && effetStatutSendit(s).mention === null);
check('statut inconnu → rien', effetStatutSendit('XYZ').statut === null && effetStatutSendit('XYZ').mention === null);

check('confirmée + ramassé → expédiée', decisionStatutSendit('confirmed', 'PICKEDUP').nouveauStatut === 'shipped');
check('en préparation + livré → livrée', decisionStatutSendit('processing', 'DELIVERED').nouveauStatut === 'delivered');
check('en livraison + entrepôt → pas de recul', decisionStatutSendit('out_for_delivery', 'WAREHOUSE').nouveauStatut === null);
check('expédiée + transit → rien (déjà)', decisionStatutSendit('shipped', 'TRANSIT').nouveauStatut === null);
check('livrée : jamais touchée', decisionStatutSendit('delivered', 'DELIVERING').nouveauStatut === null);
check('annulée + livré → à vérifier, pas de changement', (() => {
  const d = decisionStatutSendit('cancelled', 'DELIVERED');
  return d.nouveauStatut === null && d.mention === 'a_verifier' && d.explication.includes('annulée');
})());
check('retournée + retour → à vérifier', decisionStatutSendit('returned', 'RETURN_SELLER').mention === 'a_verifier');
check('en livraison + injoignable → à rappeler, pas de changement', (() => {
  const d = decisionStatutSendit('out_for_delivery', 'UNREACHABLE');
  return d.nouveauStatut === null && d.mention === 'a_rappeler';
})());
check('refusé : jamais annulé tout seul', decisionStatutSendit('out_for_delivery', 'REJECTED').nouveauStatut === null);
check('colis terminé : livré', colisTermine('DELIVERED') && !colisTermine('TRANSIT'));
check('colis terminé : rendu au magasin', colisTermine('REJECTED', 'RETURN_SELLER') && !colisTermine('REJECTED'));
check('tons', tonStatutSendit('DELIVERED') === 'ok' && tonStatutSendit('UNREACHABLE') === 'attention' && tonStatutSendit('REJECTED') === 'probleme' && tonStatutSendit('TRANSIT') === 'neutre');

console.log(`\n${fail === 0 ? '✅' : '❌'} ${pass} réussis, ${fail} échoués\n`);
process.exit(fail === 0 ? 0 : 1);
