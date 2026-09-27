// Tests des outils purs de l'écran Commandes de l'admin boutique :
// remise d'aplomb d'une commande lue dans Firestore, e-mail et image avant de
// les mettre dans un lien, libellés, file ouverte par défaut.
// Lancer :
//   npx tsx scripts/test-ecran-commandes-boutique.ts

import { normaliserCommande } from '../src/app/admin-shop/_commandes/normaliser-commande';
import {
  emailAffichable, encaissement, estStatutFinal, fileParDefaut, imageUtilisable, numerosNonReconnus, resumeArticles,
  statutLisible, texteAdresse,
} from '../src/app/admin-shop/_commandes/outils-ecran';
import { adresseAvec, lireAdresse } from '../src/app/admin-shop/_coque/vues';
import { commandesDeLaFile, compteParFile, dateHeure, nombreArticles, telephonesCommande } from '../src/lib/commandes-boutique';

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
const base = { a_confirmer: 0, a_preparer: 0, en_livraison: 0, livrees: 5, annulees: 1, toutes: 6 };
check('à confirmer d’abord', fileParDefaut({ ...base, a_confirmer: 2, a_preparer: 3 }) === 'a_confirmer');
check('puis à préparer', fileParDefaut({ ...base, a_preparer: 3 }) === 'a_preparer');
check('puis en livraison (avant « Toutes »)', fileParDefaut({ ...base, en_livraison: 4 }) === 'en_livraison');
check('sinon toutes', fileParDefaut(base) === 'toutes');

console.log('\n── Adresse de l’écran ──');
check('lien de l’e-mail → fiche', lireAdresse('?commande=AbC123').commande === 'AbC123' && lireAdresse('?commande=AbC123').vue === 'commandes');
check('adresse avec fiche', adresseAvec('https://www.lebtex.ma/admin-shop?vue=tableau', 'commandes', 'X1') === '/admin-shop?vue=commandes&commande=X1');
check('adresse sans fiche', adresseAvec('https://www.lebtex.ma/admin-shop?vue=commandes&commande=X1', 'commandes', null) === '/admin-shop?vue=commandes');

console.log(`\n${pass} réussis, ${fail} échoués`);
process.exit(fail ? 1 : 0);
