// Tests des outils purs de l'écran Commandes de l'admin boutique :
// remise d'aplomb d'une commande lue dans Firestore, e-mail et image avant de
// les mettre dans un lien, libellés, file ouverte par défaut.
// Lancer :
//   npx tsx scripts/test-ecran-commandes-boutique.ts

import { normaliserCommande } from '../src/app/admin-shop/_commandes/normaliser-commande';
import {
  aEncaisserParDefaut, commandesCamionnette, emailAffichable, encaissement, estStatutFinal, fileParDefaut, imageUtilisable,
  nombreSaisi, numerosNonReconnus, resumeArticles, statutLisible, statutLisiblePour, STATUTS_COCHES, texteAdresse, VIDE_PAR_FILE,
} from '../src/app/admin-shop/_commandes/outils-ecran';
import { adresseAvec, lireAdresse, TITRES_VUES } from '../src/app/admin-shop/_coque/vues';
import { commandesDeLaFile, compteParFile, dateHeure, FILES, nombreArticles, receptionDe, telephonesCommande } from '../src/lib/commandes-boutique';
import { lireReglagesReception } from '../src/lib/reglages-reception';

let pass = 0;
let fail = 0;
function check(label: string, ok: boolean, detail = '') {
  if (ok) { pass++; console.log(`  ✓ ${label}`); }
  else { fail++; console.log(`  ✗ ${label} ${detail}`); }
}
function nePlantePas(label: string, f: () => unknown) {
  try { f(); check(label, true); } catch (e) { check(label, false, String((e as Error)?.message)); }
}

const MAINTENANT = Date.UTC(2026, 8, 27, 14, 0);

console.log('── Commande mal formée ──');
const piege = normaliserCommande('abc123XYZ', {
  customerName: { $html: '<b>x</b>' },
  items: 'pas une liste',
  notes: 42,
  total: '150',
  status: 'piratee',
  shippingAddress: { city: ['Casa'], phone: 612345678 },
  trackingNotes: [null, 'x', { status: 'confirmed', message: 'ok', auteur: 'admin@lebtex.ma', timestamp: 'n’importe quoi' }],
  noteInterne: 'Déjà payé par virement, livrer sans encaisser',
  motifAnnulation: 'faux',
  createdAt: { seconds: MAINTENANT / 1000 - 600 },
});
check('nom objet → chaîne vide', piege.customerName === '');
check('articles non-liste → liste vide', Array.isArray(piege.items) && piege.items.length === 0);
check('note client nombre → texte', piege.notes === '42');
check('total en texte → nombre', piege.total === 150);
check('statut inconnu → en attente', piege.status === 'pending');
check('ville en liste → vide', piege.shippingAddress.city === '');
check('téléphone nombre gardé en texte', piege.shippingAddress.phone === '612345678');
check('suivi : lignes invalides écartées', piege.trackingNotes?.length === 1);
check('suivi : auteur jamais repris', !('auteur' in (piege.trackingNotes?.[0] ?? {})));
check('note interne du document public jamais reprise', piege.noteInterne === undefined && piege.motifAnnulation === undefined);
check('n° absent → dérivé de l’id', piege.orderNumber === '#abc123XY');
check('date {seconds} utilisable (toDate)', typeof piege.createdAt?.toDate === 'function' && piege.createdAt.toDate().getTime() === MAINTENANT - 600_000);
nePlantePas('outils de l’écran sur la commande piégée', () => {
  resumeArticles(piege); nombreArticles(piege); telephonesCommande(piege); texteAdresse(piege);
  commandesDeLaFile([piege], 'a_confirmer', 'casa', MAINTENANT); compteParFile([piege]); dateHeure(piege.createdAt, MAINTENANT);
});

const vide = normaliserCommande('id1', null);
check('document vide : forme complète', vide.items.length === 0 && vide.status === 'pending' && vide.shippingAddress.fullName === '');
const lignes = normaliserCommande('id2', {
  items: [null, 'x', { productName: { a: 1 }, quantity: '3', price: 10, unitPrice: 8, variant: { color: 'Noir', size: { x: 1 } } }],
});
check('articles : seuls les objets gardés', lignes.items.length === 1);
check('article : nom objet → « Article »', lignes.items[0].productName === 'Article');
check('article : quantité texte → nombre', lignes.items[0].quantity === 3);
check('article : prix facturé gardé', (lignes.items[0] as { unitPrice?: number }).unitPrice === 8);
check('article : variante nettoyée', lignes.items[0].variant?.color === 'Noir' && lignes.items[0].variant?.size === undefined);
const normale = normaliserCommande('id3', {
  orderNumber: 'LBT-1', customerName: 'Fatima', status: 'shipped', customerEmail: null, notes: null, variant: null,
  createdAt: { toDate: () => new Date(MAINTENANT) },
});
check('commande normale : champs gardés', normale.orderNumber === 'LBT-1' && normale.customerName === 'Fatima' && normale.status === 'shipped');
check('null du checkout → absent', normale.customerEmail === undefined && normale.notes === undefined);

console.log('\n── E-mail et images ──');
check('e-mail simple accepté', emailAffichable(' fatima.z+shop@exemple.ma ') === 'fatima.z+shop@exemple.ma');
check('e-mail avec ?bcc refusé', emailAffichable('x@y.ma?bcc=espion%40evil.com&body=salut') === null);
check('e-mail avec espace refusé', emailAffichable('x y@z.ma') === null);
check('e-mail vide', emailAffichable(undefined) === null && emailAffichable('') === null);
check('image du site', imageUtilisable('/fermetures.jpg'));
check('image // refusée (autre site)', !imageUtilisable('//evil.com/pixel.png'));
check('image de remplacement refusée', !imageUtilisable('/placeholder.png'));
check('image Storage du projet', imageUtilisable('https://firebasestorage.googleapis.com/v0/b/studio-9506506653-9b525.firebasestorage.app/o/p%2Fa.jpg?alt=media'));
check('image Storage d’un autre projet refusée', !imageUtilisable('https://firebasestorage.googleapis.com/v0/b/attaquant.appspot.com/o/a.jpg?alt=media'));
check('image d’un hôte inconnu refusée', !imageUtilisable('https://espion.example/pixel.gif?id=1'));
check('image http refusée', !imageUtilisable('http://lebtex.ma/a.jpg'));
check('image lebtex.ma acceptée', imageUtilisable('https://www.lebtex.ma/a.jpg'));
check('javascript: refusé', !imageUtilisable('javascript:alert(1)'));

console.log('\n── Libellés et argent ──');
check('statuts au féminin', statutLisible('confirmed') === 'Confirmée' && statutLisible('delivered') === 'Livrée' && statutLisible('cancelled') === 'Annulée');
check('statuts finaux', estStatutFinal('delivered') && estStatutFinal('returned') && !estStatutFinal('shipped'));
check('à encaisser tant que pas livrée', encaissement('shipped').aEncaisser && encaissement('shipped').titre === 'À encaisser');
check('livrée : encaissé', encaissement('delivered').titre === 'Encaissé' && !encaissement('delivered').aEncaisser);
check('annulée : rien à encaisser', encaissement('cancelled').pied.includes('annulée'));

console.log('\n── Téléphones illisibles ──');
check('numéro sans chiffre montré tel quel', numerosNonReconnus({
  customerPhone: '0612345678',
  shippingAddress: { fullName: '', phone: '0612345678', phone2: 'voir WhatsApp', address: '', city: '' },
}).join() === 'voir WhatsApp');
check('numéro en chiffres arabes : reconnu, pas « illisible »', numerosNonReconnus({
  shippingAddress: { fullName: '', phone: '٠٦١٢٣٤٥٦٧٨', address: '', city: '' },
}).length === 0);

console.log('\n── File ouverte par défaut ──');
const base = { a_confirmer: 0, a_preparer: 0, transport: 0, a_retirer: 0, en_livraison: 0, livrees: 5, annulees: 1, toutes: 6 };
check('à confirmer d’abord', fileParDefaut({ ...base, a_confirmer: 2, a_preparer: 3 }) === 'a_confirmer');
check('puis à préparer', fileParDefaut({ ...base, a_preparer: 3 }) === 'a_preparer');
check('puis transport à organiser', fileParDefaut({ ...base, transport: 1, a_retirer: 2 }) === 'transport');
check('puis à retirer', fileParDefaut({ ...base, a_retirer: 2, en_livraison: 4 }) === 'a_retirer');
check('puis en livraison (avant « Toutes »)', fileParDefaut({ ...base, en_livraison: 4 }) === 'en_livraison');
check('sinon toutes', fileParDefaut(base) === 'toutes');
check('chaque file a son message quand elle est vide', FILES.every(f => !!VIDE_PAR_FILE[f.id]));

console.log('\n── Réception et paiement remis d’aplomb ──');
const modes = normaliserCommande('m1', {
  paymentMethod: 'virement',
  reception: { mode: 'retrait', lieuRetrait: 'chrifa', volumineux: true, preferenceTransport: 'camionnette', piege: '<script>' },
  items: [{ productName: 'Rouleau', quantity: 1, price: 900, volumineux: true }, { productName: 'Bouton', quantity: 2, price: 1, volumineux: 'true' }],
});
check('virement gardé', modes.paymentMethod === 'virement');
check('retrait à CHRIFA gardé, champ inconnu écarté',
  modes.reception?.mode === 'retrait' && modes.reception?.lieuRetrait === 'chrifa' && modes.reception?.volumineux === true && !('piege' in (modes.reception ?? {})));
check('ligne volumineuse : seulement un vrai booléen', modes.items[0].volumineux === true && modes.items[1].volumineux === undefined);
const modesPieges = normaliserCommande('m2', { paymentMethod: 'bitcoin', reception: { mode: 'drone', lieuRetrait: 'lune', preferenceTransport: 'fusée' } });
check('paiement inconnu → espèces', modesPieges.paymentMethod === 'cod');
check('mode inconnu → domicile, lieu et préférence inconnus écartés',
  modesPieges.reception?.mode === 'domicile' && modesPieges.reception?.lieuRetrait === undefined && modesPieges.reception?.preferenceTransport === undefined
  && modesPieges.reception?.volumineux === false);
check('ancienne commande : pas de reception (lue comme un colis)', normaliserCommande('m3', {}).reception === undefined && receptionDe(normaliserCommande('m3', {})).mode === 'domicile');
check('reception texte → absente', normaliserCommande('m4', { reception: 'retrait' }).reception === undefined);

console.log('\n── Libellés selon le mode ──');
check('« Prête à retirer »', statutLisible('ready_for_pickup') === 'Prête à retirer');
check('retrait livré : « Retirée »', statutLisiblePour(modes, 'delivered') === 'Retirée' && statutLisiblePour(vide, 'delivered') === 'Livrée');
const transportLu = normaliserCommande('m5', { reception: { mode: 'transport', volumineux: true } });
check('transport parti : « Partie (transport) »', statutLisiblePour(transportLu, 'shipped') === 'Partie (transport)');
check('virement pas reçu : à recevoir, rien ne sort sur capture', encaissement('confirmed', { commande: modes }).titre === 'À recevoir'
  && encaissement('confirmed', { commande: modes }).pied.includes('capture'));
check('paiement reçu : plus rien à encaisser', !encaissement('processing', { commande: modes, paiementRecu: true }).aEncaisser
  && encaissement('processing', { commande: modes, paiementRecu: true }).titre === 'Déjà payée');
const retraitEspeces = normaliserCommande('m6', { reception: { mode: 'retrait', lieuRetrait: 'derb_omar' } });
check('retrait en espèces : payé au retrait', encaissement('ready_for_pickup', { commande: retraitEspeces }).pied === 'Paiement au retrait, en espèces.'
  && encaissement('delivered', { commande: retraitEspeces }).pied === 'Payée au retrait.');
check('transport : total des articles, plus le transport', encaissement('confirmed', { commande: transportLu }).ligne === 'Total des articles');
check('sans commande : comme avant', encaissement('shipped').pied === 'Paiement à la livraison, en espèces.');

console.log('\n── Colis Sendit noté dans la commande ──');
check('code valable : gardé pour l’affichage', normaliserCommande('l1', { livraison: { transporteur: 'sendit', code: 'SD-12345' } }).livraison?.code === 'SD-12345');
check('code piégé ou autre transporteur : écarté',
  normaliserCommande('l2', { livraison: { transporteur: 'sendit', code: '<img src=x>' } }).livraison === undefined
  && normaliserCommande('l3', { livraison: { transporteur: 'autre', code: 'ABC123' } }).livraison === undefined
  && normaliserCommande('l4', { livraison: 'SD-1' }).livraison === undefined);

console.log('\n── Papiers des rouleaux : montants tapés ──');
check('« 1 250 » → 1250', nombreSaisi('1 250') === 1250);
check('« 1 250 » (espace insécable) → 1250', nombreSaisi('1 250') === 1250);
check('« 150,5 DH » → 150,5', nombreSaisi('150,5 DH') === 150.5);
check('« 38 kg » → 38', nombreSaisi('38 kg') === 38);
check('« 0 » → 0 (transport offert)', nombreSaisi('0') === 0);
check('texte libre, vide ou négatif → rien', nombreSaisi('offert') === null && nombreSaisi('') === null && nombreSaisi('-5') === null);

console.log('\n── Tournée de la camionnette ──');
const REGLAGES = lireReglagesReception({}); // camionnette 50 DH / 80 DH, offerte dès 2 000 DH
let rang = 0;
const rouleau = (id: string, champs: Record<string, unknown> = {}) => normaliserCommande(id, {
  orderNumber: `LBT-${id}`, status: 'processing', subtotal: 800, deliveryFee: 0, total: 800,
  items: [{ productName: 'Rouleau entier', quantity: 1, unitPrice: 800, volumineux: true }],
  reception: { mode: 'transport', volumineux: true },
  shippingAddress: { fullName: 'Client', phone: '0612345678', address: 'Rue 1', city: 'Casablanca' },
  createdAt: { seconds: MAINTENANT / 1000 - 3600 + rang++ },
  ...champs,
});
const casa = rouleau('t1');
const mohammedia = rouleau('t2', { shippingAddress: { city: 'Mohammedia', address: 'Av. 2' } });
const agadir = rouleau('t3', { shippingAddress: { city: 'Agadir', address: 'Av. 3' } });
const retraitChrifa = rouleau('t4', { reception: { mode: 'retrait', lieuRetrait: 'chrifa', volumineux: true } });
const petitColis = rouleau('t5', { reception: { mode: 'domicile', volumineux: false }, items: [{ productName: 'Bobine', quantity: 1, unitPrice: 800 }] });
const aConfirmer = rouleau('t6', { status: 'pending' });
const livree = rouleau('t7', { status: 'delivered' });
const rouleauADomicile = rouleau('t8', { reception: { mode: 'domicile', volumineux: true } });
const prefereTransporteur = rouleau('t9', { reception: { mode: 'transport', volumineux: true, preferenceTransport: 'transporteur' } });
const tournee = commandesCamionnette([agadir, mohammedia, casa, retraitChrifa, petitColis, aConfirmer, livree, rouleauADomicile, prefereTransporteur]);
const idsTournee = tournee.map(o => o.id).join(',');
check('Casablanca et périphérie, rouleau « à domicile » compris, dans l’ordre d’arrivée', idsTournee === 't1,t2,t8', idsTournee);
check('ni autre ville, ni retrait, ni petit colis, ni non confirmée, ni livrée, ni transporteur choisi',
  !['t3', 't4', 't5', 't6', 't7', 't9'].some(id => idsTournee.includes(id)));
check('à encaisser : total + camionnette (Casablanca 50, périphérie 80)',
  aEncaisserParDefaut(casa, REGLAGES) === 850 && aEncaisserParDefaut(mohammedia, REGLAGES) === 880);
check('camionnette jamais offerte : 2 500 DH + 50 DH', aEncaisserParDefaut(rouleau('t10', { subtotal: 2500, total: 2500 }), REGLAGES) === 2550);
check('transport déjà compté dans le total : pas deux fois', aEncaisserParDefaut(rouleau('t11', { deliveryFee: 50, total: 850 }), REGLAGES) === 850);
check('camionnette arrêtée dans les réglages : le total seul',
  aEncaisserParDefaut(casa, lireReglagesReception({ camionnette: { actif: false } })) === 800);
check('cochées d’office : en préparation ou partie, pas une confirmée', STATUTS_COCHES.includes('processing')
  && STATUTS_COCHES.includes('shipped') && !STATUTS_COCHES.includes('confirmed'));

console.log('\n── Écran « Réception & paiement » ──');
check('la vue existe et a son titre', lireAdresse('?vue=reception').vue === 'reception' && TITRES_VUES.reception === 'Réception & paiement');
check('raccourci « ?vue=paiement » → réglages', lireAdresse('?vue=paiement').vue === 'reception');

console.log('\n── Adresse de l’écran ──');
check('lien de l’e-mail → fiche', lireAdresse('?commande=AbC123').commande === 'AbC123' && lireAdresse('?commande=AbC123').vue === 'commandes');
check('adresse avec fiche', adresseAvec('https://www.lebtex.ma/admin-shop?vue=tableau', 'commandes', 'X1') === '/admin-shop?vue=commandes&commande=X1');
check('adresse sans fiche', adresseAvec('https://www.lebtex.ma/admin-shop?vue=commandes&commande=X1', 'commandes', null) === '/admin-shop?vue=commandes');

console.log('\n── Argent d’un transport, selon qui transporte ──');
const pourTransport = (ville: string, preferenceTransport?: 'camionnette' | 'transporteur') => encaissement('confirmed', {
  commande: {
    paymentMethod: 'cod',
    items: [{ productId: 'r', productName: 'Rouleau', productImage: '', price: 900, quantity: 1, maxStock: 1, volumineux: true }],
    reception: { mode: 'transport', volumineux: true, ...(preferenceTransport ? { preferenceTransport } : {}) },
    shippingAddress: { fullName: 'A', phone: '0612345678', address: 'x', city: ville },
  },
});
check('camionnette : espèces au chauffeur LEBTEX', pourTransport('Casablanca').pied.includes('chauffeur LEBTEX'));
check('transporteur vers Fès : jamais « chauffeur LEBTEX »', !pourTransport('Fès').pied.includes('chauffeur LEBTEX')
  && pourTransport('Fès').pied.includes('transporteur habituel'));
check('préférence du client : transporteur même à Casablanca', pourTransport('Casablanca', 'transporteur').pied.includes('transporteur habituel'));

console.log(`\n${pass} réussis, ${fail} échoués`);
process.exit(fail ? 1 : 0);
