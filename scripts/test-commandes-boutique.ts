// Tests des outils de commandes boutique (lib/commandes-boutique.ts).
// Lancer :
//   npx tsx scripts/test-commandes-boutique.ts

import {
  commandeRepond, commandesDeLaFile, compteParFile, dateHeure, depuisQuand, enRetard,
  lienAppel, lienWhatsAppClient, lignesCollentAuSousTotal, lignesSansPrix, messageConfirmation,
  messageStatut, prixUnitaireLigne, resumeArgent, telInternational, telLisible, telephonesCommande,
  varianteLisible, fileDe,
  alerteEspeces, champsParDefaut, etapeSuivante, etatPaiementLisible, ETAPE_SUIVANTE, joursOuvresApres, jourLisible,
  libelleMode, MESSAGE_CLIENT, messageClient, messageModele, modelesPour, MOTIFS_ANNULATION, moyenPaiementDe, prixCamionnette, prixLu,
  receptionDe, transportAOrganiser, transportPrevu, volumineuxEnColis,
  commandeMixte, fraisColisAnnonces, fraisColisAttendus, FIN_LIVRAISON_OFFERTE, numeroCommandeAffichable, numeroCommandeValide, texteClientSur,
} from '../src/lib/commandes-boutique';
import { REGLAGES_RECEPTION_DEFAUT, type ReglagesReception } from '../src/lib/reglages-reception';
import type { OrderStatus, ShopOrder } from '../src/lib/shop-types';

let pass = 0;
let fail = 0;
function check(label: string, ok: boolean, detail = '') {
  if (ok) { pass++; console.log(`  ✓ ${label}`); }
  else { fail++; console.log(`  ✗ ${label} ${detail}`); }
}

// 27/09/2026 15:00 à Casablanca (UTC+1)
const MAINTENANT = Date.UTC(2026, 8, 27, 14, 0);
const ilYa = (min: number) => ({ seconds: (MAINTENANT - min * 60_000) / 1000, nanoseconds: 0 });

function commande(p: Partial<ShopOrder> & { id: string }): ShopOrder {
  return {
    orderNumber: `LBT-${p.id.toUpperCase()}`,
    customerName: 'Fatima Zahra El Idrissi',
    customerPhone: '0612345678',
    status: 'pending',
    items: [{ productId: 'p1', productName: 'Fermeture Nylon N3', productImage: '', price: 12, quantity: 10, maxStock: 99,
      variant: { model: '20 cm', color: 'Noir 580', size: undefined } }],
    subtotal: 120,
    deliveryFee: 25,
    total: 145,
    shippingAddress: { fullName: 'Fatima Zahra El Idrissi', phone: '0612345678', phone2: '+212 661-00-11-22', address: '12 Rue Atlas, Maârif', city: 'Casablanca' },
    paymentMethod: 'cod',
    createdAt: ilYa(30),
    ...p,
  };
}

console.log('\n── Téléphones ──');
check('06 local → international', telInternational('06 12-34 56 78') === '212612345678');
check('+212 → international', telInternational('+212612345678') === '212612345678');
check('00212 → international', telInternational('00212 612345678') === '212612345678');
check('9 chiffres sans 0', telInternational('612345678') === '212612345678');
check('étranger gardé', telInternational('+33 6 12 34 56 78') === '33612345678');
check('vide', telInternational('') === '' && telInternational(undefined) === '');
check('chiffres arabes-indiens', telInternational('٠٦١٢٣٤٥٦٧٨') === '212612345678');
check('chiffres persans', telInternational('۰۶۶۱ ۰۰ ۱۱ ۲۲') === '212661001122');
check('2e numéro en chiffres arabes gardé', telephonesCommande({
  customerPhone: '0612345678',
  shippingAddress: { fullName: 'x', phone: '0612345678', phone2: '٠٦٦١٠٠١١٢٢', address: '', city: '' },
}).length === 2);
check('lisible à la marocaine', telLisible('+212612345678') === '06 12 34 56 78', telLisible('+212612345678'));
check('lisible étranger', telLisible('+33612345678') === '+33612345678');
check('lien d’appel', lienAppel('0612345678') === 'tel:+212612345678');
check('lien WhatsApp sans +', lienWhatsAppClient('+212 612345678', 'Salut')?.startsWith('https://wa.me/212612345678?text=Salut') === true);
check('pas de lien sans numéro', lienWhatsAppClient('', 'x') === undefined && lienAppel(null) === undefined);
const deux = telephonesCommande(commande({ id: 'a' }));
check('deux numéros, doublon retiré', deux.length === 2 && deux[1].includes('661'), JSON.stringify(deux));

console.log('\n── Dates ──');
check('aujourd’hui avec l’heure du Maroc', dateHeure(ilYa(30), MAINTENANT) === "aujourd'hui à 14:30", dateHeure(ilYa(30), MAINTENANT));
check('hier', dateHeure(ilYa(60 * 20), MAINTENANT).startsWith('hier à'), dateHeure(ilYa(60 * 20), MAINTENANT));
check('date complète', dateHeure(ilYa(60 * 24 * 5), MAINTENANT).startsWith('22/09/2026 à'), dateHeure(ilYa(60 * 24 * 5), MAINTENANT));
check('sans date', dateHeure(null) === '—');
check('il y a 12 min', depuisQuand(ilYa(12), MAINTENANT) === 'il y a 12 min');
check('il y a 2 h 15', depuisQuand(ilYa(135), MAINTENANT) === 'il y a 2 h 15', depuisQuand(ilYa(135), MAINTENANT));
check('il y a 5 h', depuisQuand(ilYa(300), MAINTENANT) === 'il y a 5 h');
check('il y a 3 j', depuisQuand(ilYa(60 * 24 * 3 + 5), MAINTENANT) === 'il y a 3 j');
check('horodatage pas encore revenu = à l’instant', depuisQuand(null, MAINTENANT) === "à l'instant");
check('en retard après 2 h', enRetard(commande({ id: 'r', createdAt: ilYa(125) }), MAINTENANT));
check('pas en retard avant 2 h', !enRetard(commande({ id: 'r', createdAt: ilYa(115) }), MAINTENANT));
check('confirmée jamais en retard', !enRetard(commande({ id: 'r', status: 'confirmed', createdAt: ilYa(999) }), MAINTENANT));

console.log('\n── Lignes et prix ──');
const gros = commande({ id: 'g', subtotal: 100, items: [{ productId: 'p', productName: 'Curseur', productImage: '', price: 12, unitPrice: 10, quantity: 10, maxStock: 0 }] });
check('prix appliqué enregistré', prixUnitaireLigne(gros.items[0]) === 10);
check('lignes = sous-total avec prix appliqué', lignesCollentAuSousTotal(gros));
const ancienne = commande({ id: 'o', subtotal: 100 });
check('ancienne commande en prix de gros : écart repéré', !lignesCollentAuSousTotal(ancienne));
const surDemande = commande({ id: 's', items: [{ productId: 'p', productName: 'Tissu', productImage: '', price: 0, quantity: 3, maxStock: 0 }] });
check('ligne sur demande repérée', lignesSansPrix(surDemande).length === 1);
check('variante lisible', varianteLisible({ model: '20 cm', color: 'Noir 580', size: '' }) === '20 cm · Noir 580');

console.log('\n── Files ──');
const liste = [
  commande({ id: 'recente', createdAt: ilYa(5) }),
  commande({ id: 'vieille', createdAt: ilYa(300) }),
  commande({ id: 'conf', status: 'confirmed', createdAt: ilYa(50) }),
  commande({ id: 'prep', status: 'processing', createdAt: ilYa(500) }),
  commande({ id: 'liv', status: 'delivered', createdAt: ilYa(900) }),
  commande({ id: 'liv2', status: 'delivered', createdAt: ilYa(10) }),
  commande({ id: 'ann', status: 'cancelled' }),
  commande({ id: 'nouvelle', createdAt: null }),
];
const c = compteParFile(liste);
check('compteurs', c.a_confirmer === 3 && c.a_preparer === 2 && c.livrees === 2 && c.annulees === 1 && c.toutes === 8, JSON.stringify(c));
const aConfirmer = commandesDeLaFile(liste, 'a_confirmer', '', MAINTENANT).map(o => o.id);
check('à confirmer : la plus ancienne en haut, la toute nouvelle en bas', aConfirmer.join(',') === 'vieille,recente,nouvelle', aConfirmer.join(','));
const livrees = commandesDeLaFile(liste, 'livrees', '', MAINTENANT).map(o => o.id);
check('livrées : la plus récente en haut', livrees.join(',') === 'liv2,liv', livrees.join(','));
check('file d’un statut', fileDe('out_for_delivery') === 'en_livraison' && fileDe('returned') === 'annulees');

console.log('\n── Recherche ──');
const o = commande({ id: 'q' });
check('par téléphone local', commandeRepond(o, '0612345678'));
check('par téléphone avec espaces', commandeRepond(o, '06 12 34'));
check('par téléphone international', commandeRepond(o, '+212 6 12 34'));
check('par 2e téléphone', commandeRepond(o, '0661001122'));
check('par fin de numéro', commandeRepond(o, '345678'));
check('mauvais numéro rejeté', !commandeRepond(o, '0699999999'));
check('par nom sans accents', commandeRepond(o, 'fatima idrissi'));
check('par ville', commandeRepond(o, 'casa'));
check('par quartier sans accent', commandeRepond(o, 'maarif'));
check('par produit et couleur', commandeRepond(o, 'nylon noir'));
check('par numéro de commande', commandeRepond(o, 'lbt-q'));
check('mot absent rejeté', !commandeRepond(o, 'fatima rabat'));
check('recherche vide', commandeRepond(o, '  '));

console.log('\n── Messages ──');
const m = messageConfirmation(o, MAINTENANT);
check('confirmation : numéro, ligne, total, adresse', m.includes('LBT-Q') && m.includes('10 × Fermeture Nylon N3 (20 cm · Noir 580)') && m.includes('145') && m.includes('12 Rue Atlas'), m);
check('confirmation : question finale', m.trim().endsWith('Merci !'));
check('sur demande : prix à confirmer', messageConfirmation(surDemande, MAINTENANT).includes('prix à confirmer'));
check('statut expédiée : montant à payer', messageStatut(o, 'shipped').includes('145'));

console.log('\n── Argent ──');
const a = resumeArgent(liste);
check('encaissé = livrées seulement', a.encaisse === 290, JSON.stringify(a));
check('en cours = confirmées et en préparation', a.enCours === 290);
check('à confirmer à part', a.nbAConfirmer === 3 && a.aConfirmer === 435);

// ─── Modes de réception et paiement (29/09/2026) ─────────────────────────────

const rouleau = { productId: 'r1', productName: 'Rouleau taffetas 100 m', productImage: '', price: 900, unitPrice: 900, quantity: 1, maxStock: 5, volumineux: true };
const retraitCh = (p: Partial<ShopOrder> & { id: string }) => commande({
  items: [rouleau], subtotal: 900, deliveryFee: 0, total: 900,
  reception: { mode: 'retrait', lieuRetrait: 'chrifa', volumineux: true }, ...p,
});
const retraitDO = (p: Partial<ShopOrder> & { id: string }) => commande({
  deliveryFee: 0, total: 120, reception: { mode: 'retrait', lieuRetrait: 'derb_omar', volumineux: false }, ...p,
});
const transport = (p: Partial<ShopOrder> & { id: string }) => commande({
  items: [rouleau], subtotal: 900, deliveryFee: 0, total: 900,
  reception: { mode: 'transport', volumineux: true }, ...p,
});
// Réglages de test : un magasin CHRIFA reconnaissable, et un RIB (qui ne doit jamais sortir dans un message).
const RIB = '011780000012345678901234';
const reglages: ReglagesReception = {
  ...REGLAGES_RECEPTION_DEFAUT,
  lieux: {
    ...REGLAGES_RECEPTION_DEFAUT.lieux,
    chrifa: { nom: 'LEBTEX CHRIFA', adresse: '31 Rue 65, Aïn Chock', lienMaps: 'https://maps.app.goo.gl/CHRIFA', telephone: '0522 00 00 00', horaires: 'Lundi au samedi, 9h – 18h', actif: true },
  },
  virement: { actif: true, titulaire: 'LEBTEX SARL AU', banque: 'CIH', rib: RIB },
};
const sansRib = (m: string) => !m.replace(/\s/g, '').includes(RIB) && !/\d{24}/.test(m.replace(/\s/g, ''));
const adresseDe = (city: string, address = '12 Rue Atlas, Maârif') =>
  ({ fullName: 'Fatima Zahra El Idrissi', phone: '0612345678', address, city });

console.log('\n── Réception lue ──');
const ancienneCmd = commande({ id: 'anc' });
check('ancienne commande (sans reception) : colis à domicile, Derb Omar',
  receptionDe(ancienneCmd).mode === 'domicile' && receptionDe(ancienneCmd).lieu === 'derb_omar' && !receptionDe(ancienneCmd).volumineux);
check('une ligne volumineuse suffit (même sans reception)', receptionDe(commande({ id: 'v', items: [rouleau] })).volumineux);
check('volumineux → préparé à CHRIFA', receptionDe(transport({ id: 't' })).lieu === 'chrifa');
check('retrait Derb Omar gardé', receptionDe(retraitDO({ id: 'r' })).lieu === 'derb_omar');
check('mode inconnu → domicile', receptionDe(commande({ id: 'x', reception: { mode: 'drone' as any, volumineux: false } })).mode === 'domicile');
check('reception abîmée ne plante pas', receptionDe({ reception: 'n’importe quoi' as any, items: 'rien' as any }).mode === 'domicile');
check('paiement inconnu → espèces', moyenPaiementDe({ paymentMethod: 'bitcoin' as any }) === 'cod' && moyenPaiementDe({ paymentMethod: 'virement' }) === 'virement');
check('libellé du mode', libelleMode(receptionDe(retraitCh({ id: 'a' }))) === 'Retrait à CHRIFA' && libelleMode(receptionDe(ancienneCmd)) === 'Colis Sendit'
  && libelleMode(receptionDe(transport({ id: 'b', reception: { mode: 'transport', volumineux: true, preferenceTransport: 'camionnette' } }))) === 'Transport : camionnette');
check('transport prévu : Casablanca et Mohammedia → camionnette, Fès → transporteur',
  transportPrevu(transport({ id: 'c' })) === 'camionnette'
  && transportPrevu(transport({ id: 'm', shippingAddress: adresseDe('Mohammedia') })) === 'camionnette'
  && transportPrevu(transport({ id: 'f', shippingAddress: adresseDe('Fès') })) === 'transporteur');
check('préférence du client d’abord',
  transportPrevu(transport({ id: 'p', reception: { mode: 'transport', volumineux: true, preferenceTransport: 'transporteur' } })) === 'transporteur');
check('rouleau commandé en colis repéré', volumineuxEnColis(commande({ id: 'vc', items: [rouleau] })) && !volumineuxEnColis(transport({ id: 'ok' })));

console.log('\n── Étapes selon le mode ──');
const etape = (x: ShopOrder, s: OrderStatus) => etapeSuivante({ ...x, status: s });
check('domicile : comme avant', etape(ancienneCmd, 'processing')?.statut === 'shipped' && etape(ancienneCmd, 'processing')?.libelle === 'Remis au livreur'
  && etape(ancienneCmd, 'shipped')?.statut === 'delivered' && etape(ancienneCmd, 'pending')?.libelle === 'Client joint — confirmer');
check('ETAPE_SUIVANTE gardée pour compatibilité', ETAPE_SUIVANTE.processing?.statut === 'shipped');
const rt = retraitCh({ id: 'rt' });
check('retrait : préparation → Prête à retirer', etape(rt, 'processing')?.statut === 'ready_for_pickup' && etape(rt, 'processing')?.libelle === 'Prête à retirer');
check('retrait : prête → Retirée et payée', etape(rt, 'ready_for_pickup')?.statut === 'delivered' && etape(rt, 'ready_for_pickup')?.libelle === 'Retirée et payée');
check('retrait : confirmée → préparation', etape(rt, 'confirmed')?.statut === 'processing');
const tr = transport({ id: 'tr' });
check('transport : préparation → Remis au chauffeur / au transporteur',
  etape(tr, 'processing')?.statut === 'shipped' && etape(tr, 'processing')?.libelle === 'Remis au chauffeur / au transporteur');
check('transport : parti → Livrée / récupérée et payée', etape(tr, 'shipped')?.statut === 'delivered' && etape(tr, 'shipped')?.libelle === 'Livrée / récupérée et payée');
check('plus rien après livrée, annulée, retournée', etape(tr, 'delivered') === null && etape(rt, 'cancelled') === null && etape(ancienneCmd, 'returned') === null);

console.log('\n── Files : transport à organiser, à retirer ──');
const listeModes = [
  transport({ id: 't_att', createdAt: ilYa(40) }),
  transport({ id: 't_conf', status: 'confirmed', createdAt: ilYa(90) }),
  transport({ id: 't_parti', status: 'shipped' }),
  retraitCh({ id: 'r_ch', status: 'processing', createdAt: ilYa(20) }),
  retraitDO({ id: 'r_do', status: 'ready_for_pickup', createdAt: ilYa(60) }),
  retraitDO({ id: 'r_do2', status: 'ready_for_pickup', createdAt: ilYa(200) }),
  commande({ id: 'colis', status: 'confirmed' }),
];
const cm = compteParFile(listeModes);
check('transport à organiser : rouleaux pas encore partis (retrait à CHRIFA compris)', cm.transport === 3, JSON.stringify(cm));
check('à retirer : les commandes prêtes', cm.a_retirer === 2);
check('une commande à transport compte aussi dans sa file de statut', cm.a_confirmer === 1 && cm.a_preparer === 3 && cm.en_livraison === 1);
check('toutes', cm.toutes === 7);
const fileTransport = commandesDeLaFile(listeModes, 'transport', '', MAINTENANT).map(x => x.id);
check('transport : la plus ancienne en haut', fileTransport.join(',') === 't_conf,t_att,r_ch', fileTransport.join(','));
check('à retirer : la plus ancienne en haut', commandesDeLaFile(listeModes, 'a_retirer', '', MAINTENANT).map(x => x.id).join(',') === 'r_do2,r_do');
check('file d’un statut : prête → à retirer, en attente → à confirmer (pas transport)', fileDe('ready_for_pickup') === 'a_retirer' && fileDe('pending') === 'a_confirmer');
check('transport à organiser : plus après le départ', !transportAOrganiser(transport({ id: 'x', status: 'shipped' })) && transportAOrganiser(transport({ id: 'y' })));
check('recherche « chrifa » et « volumineux »', commandeRepond(retraitCh({ id: 'q1' }), 'chrifa') && commandeRepond(transport({ id: 'q2' }), 'volumineux')
  && !commandeRepond(commande({ id: 'q3' }), 'chrifa'));

console.log('\n── Suivi client et motifs ──');
check('« Prête à retirer » a sa phrase', MESSAGE_CLIENT.ready_for_pickup.includes('retirer'));
check('retrait : « Commande retirée », pas « livrée »', messageClient(rt, 'delivered').startsWith('Commande retirée'));
check('transport : parti avec le chauffeur ou le transporteur', messageClient(tr, 'shipped').includes('chauffeur ou le transporteur'));
check('colis : phrases d’avant', messageClient(ancienneCmd, 'shipped') === MESSAGE_CLIENT.shipped);
check('motifs ajoutés, « Autre » en dernier',
  ['Non venu au retrait', 'Prix du transport refusé', 'Transformée en vente /stock'].every(m => (MOTIFS_ANNULATION as readonly string[]).includes(m))
  && MOTIFS_ANNULATION[MOTIFS_ANNULATION.length - 1] === 'Autre');

console.log('\n── Message de confirmation selon le mode ──');
const mRetrait = messageConfirmation(retraitCh({ id: 'mr' }), MAINTENANT, { reglages });
check('retrait : magasin et adresse, total au retrait, question du jour',
  mRetrait.includes('Retrait gratuit : LEBTEX CHRIFA, 31 Rue 65, Aïn Chock') && mRetrait.includes('*Total à payer au retrait : ')
  && mRetrait.includes('le jour où vous passerez') && mRetrait.trim().endsWith('Merci !'), mRetrait);
const mTransport = messageConfirmation(tr, MAINTENANT, { reglages });
check('transport : « à confirmer par téléphone », jamais « gratuit »',
  mTransport.includes('Transport : à confirmer par téléphone') && !/gratuit/i.test(mTransport) && mTransport.includes('Total des articles'), mTransport);
const offerte = messageConfirmation(commande({ id: 'of', subtotal: 350, deliveryFee: 0, total: 350 }), MAINTENANT);
check('colis à 0 DH au-dessus de 300 DH à Casablanca : « offerte »', offerte.includes('Livraison Sendit (Casablanca) : offerte'), offerte);
// Une commande d'aujourd'hui (le checkout écrit `reception`) : nouveaux seuils (300 DH à Casablanca).
const aConfirmerFrais = messageConfirmation(commande({ id: 'ac', deliveryFee: 0, total: 120, reception: { mode: 'domicile', volumineux: false } }), MAINTENANT);
check('colis à 0 DH sous le seuil : « à confirmer » (jamais « gratuite »)',
  aConfirmerFrais.includes('Livraison Sendit (Casablanca) : à confirmer') && !/gratuit/i.test(aConfirmerFrais));
// Une commande d'avant le 29/09/2026 (sans `reception`) : offerte dès 100 DH à Casablanca, 500 DH ailleurs.
const ancienneOfferte = messageConfirmation(commande({ id: 'ao', deliveryFee: 0, total: 120 }), MAINTENANT);
check('ancienne commande de 120 DH à Casablanca à 0 DH : « offerte » (ancien seuil de 100 DH)',
  ancienneOfferte.includes('Livraison Sendit (Casablanca) : offerte'), ancienneOfferte);
check('ancienne commande de 120 DH à Rabat à 0 DH : « à confirmer » (ancien seuil de 500 DH)',
  messageConfirmation(commande({ id: 'ar', deliveryFee: 0, total: 120, shippingAddress: { fullName: 'A', phone: '0612345678', address: 'x', city: 'Rabat' } }), MAINTENANT)
    .includes('Livraison Sendit (Rabat) : à confirmer'));
check('sous-total gonflé : la livraison n’est pas « offerte » (seuil sur les lignes)',
  messageConfirmation(commande({ id: 'sg', subtotal: 5000, deliveryFee: 0, total: 120, reception: { mode: 'domicile', volumineux: false } }), MAINTENANT)
    .includes('Livraison Sendit (Casablanca) : à confirmer'));
const mVirement = messageConfirmation(commande({ id: 'vir', paymentMethod: 'virement' }), MAINTENANT, { reglages });
check('virement : total par virement et motif, sans RIB',
  mVirement.includes('*Total à payer par virement : ') && mVirement.includes('n° de commande LBT-VIR comme motif') && sansRib(mVirement), mVirement);
check('virement : le lien de la page de la commande (celle du RIB), jamais le RIB',
  messageConfirmation(commande({ id: 'AbCdEf0123456789XyZw', paymentMethod: 'virement' }), MAINTENANT, { reglages })
    .includes('https://www.lebtex.ma/shop/confirmation/AbCdEf0123456789XyZw'));
const trVirement = messageConfirmation({ ...tr, paymentMethod: 'virement' }, MAINTENANT, { reglages });
check('transport payé par virement : « transport en plus »', trVirement.includes('*Total à payer par virement : ')
  && trVirement.includes('transport en plus'), trVirement);

console.log('\n── Messages de statut ──');
const pret = messageStatut(retraitCh({ id: 'pr', status: 'ready_for_pickup' }), 'ready_for_pickup', { reglages });
check('prête : adresse, plan, horaires, montant', pret.includes('31 Rue 65, Aïn Chock') && pret.includes('https://maps.app.goo.gl/CHRIFA')
  && pret.includes('Lundi au samedi, 9h – 18h') && pret.includes('Montant à payer au retrait : 900'), pret);
check('déjà payée : rien à payer', messageStatut(retraitCh({ id: 'pp' }), 'ready_for_pickup', { reglages, paiementRecu: true }).includes('déjà payée'));
check('retrait livré : « retirée »', messageStatut(rt, 'delivered').includes('est retirée'));
check('transport confirmé : on organise le transport', messageStatut(tr, 'confirmed').includes('organisons le transport'));
check('en livraison : montant, sans double espace', messageStatut(o, 'out_for_delivery').includes('Montant à payer : 145') && !messageStatut(o, 'out_for_delivery').includes('  '));

console.log('\n── Messages prêts à l’emploi ──');
check('colis : le récapitulatif seul', modelesPour(ancienneCmd).map(m => m.id).join() === 'recapitulatif');
check('retrait : récapitulatif, prête, rappel', modelesPour(rt).map(m => m.id).join() === 'recapitulatif,pret_a_retirer,rappel_retrait');
check('transport Casablanca : la veille de tournée d’abord', modelesPour(tr).map(m => m.id).join() === 'recapitulatif,veille_tournee,parti_transporteur');
const trFes = transport({ id: 'fes', shippingAddress: adresseDe('Fès', 'Rue 5, Atlas') });
check('transport Fès : le transporteur d’abord', modelesPour(trFes).map(m => m.id).join() === 'recapitulatif,parti_transporteur,veille_tournee');
check('transport : le récapitulatif demande le prix et le transporteur',
  modelesPour(trFes)[0].champs.some(c => c.cle === 'prixTransport') && modelesPour(trFes)[0].champs.some(c => c.cle === 'transporteur'));

const C = messageModele('pret_a_retirer', retraitCh({ id: 'c' }), { date: 'lundi 5 octobre' }, { reglages });
check('C prête : lieu exact, plan, horaires, garde 7 jours ouvrés, date',
  C.includes('LEBTEX CHRIFA, 31 Rue 65, Aïn Chock') && C.includes('Plan : https://maps.app.goo.gl/CHRIFA') && C.includes('Horaires : Lundi au samedi')
  && C.includes('7 jours ouvrés, jusqu’au lundi 5 octobre') && C.includes('À payer sur place : 900'), C);
const D = messageModele('rappel_retrait', retraitCh({ id: 'd' }), { date: 'lundi 5 octobre' }, { reglages });
check('D rappel : attend jusqu’au…, retour en stock',
  D.includes('vous attend à LEBTEX CHRIFA') && D.includes('jusqu’au lundi 5 octobre') && D.includes('retourne en stock'), D);
const E = messageModele('veille_tournee', tr, { date: 'jeudi 1er octobre', prixTransport: '50' }, { reglages });
check('E veille : jour, adresse, total avec la camionnette',
  E.includes('vous livre le jeudi 1er octobre') && E.includes('12 Rue Atlas') && E.includes('950') && E.includes('transport 50'), E);
const F = messageModele('parti_transporteur', trFes, { transporteur: 'Transport Atlas', date: 'mercredi 30 septembre', prixTransport: '120 DH' });
check('F transporteur : parti avec…, dépôt de la ville, n° de commande',
  F.includes('est partie le mercredi 30 septembre avec Transport Atlas') && F.includes('à son dépôt de Fès') && F.includes('(LBT-FES)')
  && F.includes('Transport : 120'), F);
const A = messageModele('recapitulatif', commande({ id: 'rv', paymentMethod: 'virement' }), { date: 'mardi 29 septembre' }, { reglages });
check('A récapitulatif virement : motif, jamais le RIB, OK',
  A.includes('motif du virement') && sansRib(A) && A.includes('Répondez OK') && A.includes('le mardi 29 septembre'), A);
const A2 = messageModele('recapitulatif', trFes, { transporteur: 'Transport Atlas', prixTransport: '120' });
check('A récapitulatif transporteur : dépôt, prix, total des articles',
  A2.includes('envoi par Transport Atlas jusqu’à son dépôt de Fès') && A2.includes('Transport : 120') && A2.includes('Total des articles'), A2);
const A3 = messageModele('recapitulatif', ancienneCmd, {});
check('A récapitulatif colis : Sendit, frais, colis pas ouvert', A3.includes('livraison à domicile par Sendit') && A3.includes('Livraison : 25') && A3.includes('ne s’ouvre pas'), A3);
const tous = [C, D, E, F, A, A2, A3, messageModele('parti_transporteur', trFes, {}), messageModele('veille_tournee', tr, {}), mRetrait, mTransport, mVirement, pret];
check('aucun message ne contient « undefined » ni le RIB', tous.every(m => !/undefined|null|NaN/.test(m) && sansRib(m)));
check('champ vide : « à préciser »', messageModele('pret_a_retirer', rt, {}).includes('à préciser'));
check('prix lu', prixLu('150') === 150 && prixLu(' 150 DH ') === 150 && prixLu('150,5 mad') === 150.5 && prixLu('payé à l’arrivée') === null && prixLu(undefined) === null);

console.log('\n── Jours ouvrés ──');
// MAINTENANT = dimanche 27/09/2026 : 7 jours ouvrés (dimanches sautés) → lundi 5 octobre.
check('7 jours ouvrés après un dimanche → lundi 5 octobre', jourLisible(joursOuvresApres(MAINTENANT, 7)) === 'lundi 5 octobre', jourLisible(joursOuvresApres(MAINTENANT, 7)));
check('après un samedi, le lundi compte pour 1', jourLisible(joursOuvresApres(Date.UTC(2026, 9, 3, 10), 1)) === 'lundi 5 octobre');
check('dates pré-remplies (garde, veille de tournée)',
  champsParDefaut('pret_a_retirer', MAINTENANT).date === 'lundi 5 octobre' && champsParDefaut('veille_tournee', MAINTENANT).date === 'lundi 28 septembre',
  JSON.stringify([champsParDefaut('pret_a_retirer', MAINTENANT), champsParDefaut('veille_tournee', MAINTENANT)]));

console.log('\n── Camionnette et virement dans les messages ──');
check('camionnette : 50 DH à Casablanca, 80 DH en périphérie, hors zone ailleurs',
  prixCamionnette(tr) === 50 && prixCamionnette(transport({ id: 'mo', shippingAddress: adresseDe('Mohammedia') })) === 80
  && prixCamionnette(trFes) === null);
check('camionnette jamais offerte (même à 2 500 DH), arrêtée = null',
  prixCamionnette(transport({ id: 'big', subtotal: 2500 })) === 50
  && prixCamionnette(tr, { ...REGLAGES_RECEPTION_DEFAUT, camionnette: { ...REGLAGES_RECEPTION_DEFAUT.camionnette, actif: false } }) === null);
check('veille de tournée : date et prix pré-remplis ; 0 s’écrit « offert »',
  champsParDefaut('veille_tournee', MAINTENANT, 50).prixTransport === '50' && champsParDefaut('veille_tournee', MAINTENANT, 0).prixTransport === 'offert'
  && champsParDefaut('veille_tournee', MAINTENANT, null).prixTransport === undefined && champsParDefaut('pret_a_retirer', MAINTENANT, 50).prixTransport === undefined);
const Eoffert = messageModele('veille_tournee', tr, { prixTransport: 'offert' });
check('camionnette offerte : total des articles seul', Eoffert.includes('À payer au chauffeur : 900') && !Eoffert.includes('+ transport'), Eoffert);
const Evir = messageModele('veille_tournee', transport({ id: 'ev', paymentMethod: 'virement' }), { prixTransport: '50' });
check('veille de tournée par virement : jamais « à payer au chauffeur », motif, sans RIB',
  !Evir.includes('au chauffeur :') && Evir.includes('par virement (motif : n° LBT-EV)') && Evir.includes('950') && sansRib(Evir), Evir);
const Cvir = messageModele('pret_a_retirer', retraitCh({ id: 'cv', paymentMethod: 'virement' }), { date: 'lundi 5 octobre' }, { reglages });
check('prête à retirer par virement : pas « à payer sur place »', !Cvir.includes('sur place :') && Cvir.includes('si ce n’est pas déjà fait'), Cvir);
const Svir = messageStatut(retraitCh({ id: 'sv', paymentMethod: 'virement' }), 'ready_for_pickup', { reglages });
check('statut « prête » par virement : pas « à payer au retrait »', !Svir.includes('au retrait :') && Svir.includes('par virement'), Svir);
check('statut par virement déjà reçu : rien à payer', messageStatut(retraitCh({ id: 'sr', paymentMethod: 'virement' }), 'ready_for_pickup', { reglages, paiementRecu: true }).includes('rien à payer'));

console.log('\n── Argent ──');
check('plus de 3 000 DH en espèces par colis : alerte', !!alerteEspeces(commande({ id: 'g1', total: 3500 })) && alerteEspeces(commande({ id: 'g2', total: 2900 })) === null);
check('virement : pas d’alerte d’espèces', alerteEspeces(commande({ id: 'g3', total: 3500, paymentMethod: 'virement' })) === null);
check('tournée au-delà de 5 000 DH : alerte', !!alerteEspeces(transport({ id: 'g4', total: 6000 })) && alerteEspeces(transport({ id: 'g5', total: 4000 })) === null);
check('retrait : pas de plafond', alerteEspeces(retraitCh({ id: 'g6', total: 8000 })) === null);
check('transporteur vers Fès : pas le plafond de la camionnette', alerteEspeces(transport({ id: 'g7', total: 8000, shippingAddress: adresseDe('Fès') })) === null);
check('rouleau commandé en colis : pas le plafond Sendit, celui de la camionnette',
  alerteEspeces(commande({ id: 'g8', items: [rouleau], total: 4000 })) === null && !!alerteEspeces(commande({ id: 'g9', items: [rouleau], total: 6000 })));
check('virement en attente', etatPaiementLisible(commande({ id: 'e1', paymentMethod: 'virement' }), null, MAINTENANT).startsWith('En attente du virement'));
const recuLe = etatPaiementLisible(commande({ id: 'e2', paymentMethod: 'virement' }), { recu: true, le: new Date(MAINTENANT - 3600_000).toISOString(), par: 'admin@lebtex.ma' }, MAINTENANT);
check('virement reçu : quand et par qui', recuLe === "Reçu aujourd'hui à 14:00 par admin@lebtex.ma", recuLe);
check('espèces au retrait', etatPaiementLisible(rt, null, MAINTENANT) === 'Espèces à encaisser au retrait');

console.log('\n── N° de commande et texte libre montrés au client ──');
check('n° du checkout : valable', numeroCommandeValide('LBT-MG2K3H7P-X9QF') && numeroCommandeAffichable({ orderNumber: 'LBT-MG2K3H7P-X9QF', id: 'abc' }) === 'LBT-MG2K3H7P-X9QF');
check('n° inventé : l’identifiant du document à la place', !numeroCommandeValide('RIB CHANGE 0077')
  && numeroCommandeAffichable({ orderNumber: 'RIB CHANGE 007780000123456789012345', id: 'AbCdEf0123456789XyZw' }) === 'AbCdEf0123456789XyZw');
check('suite de chiffres (RIB) masquée', texteClientSur('Nouveau RIB 0077 8000 0123 4567 8901 2345') === 'Nouveau RIB •••'
  && texteClientSur('RIB ٠٠٧٧٨٠٠٠٠١٢٣٤٥٦٧٨') === 'RIB •••');
check('adresse ordinaire intacte', texteClientSur('12 Rue Atlas, Maârif, 20000') === '12 Rue Atlas, Maârif, 20000');
check('texte borné', texteClientSur('x'.repeat(50), 30).length === 30);

console.log('\n── Commande mixte et frais attendus ──');
const lignePetite = { productId: 'b', productName: 'Bouton', productImage: '', price: 5, unitPrice: 5, quantity: 4, maxStock: 9 };
check('rouleau + petits articles : mixte', commandeMixte({ items: [rouleau, lignePetite] }) && !commandeMixte({ items: [rouleau] }) && !commandeMixte({ items: [lignePetite] }));
check('nouvelle commande sous le seuil : 20 DH attendus (sur les lignes)', fraisColisAttendus(commande({ id: 'f1', subtotal: 5000, deliveryFee: 0, reception: { mode: 'domicile', volumineux: false } })) === 20);
check('ancienne commande au-dessus de 100 DH à Casablanca : 0 attendu (offerte)', fraisColisAttendus(commande({ id: 'f2', deliveryFee: 0 })) === 0);
check('ancienne commande payée 25 DH (ancienne grille) : pas de comparaison', fraisColisAttendus(commande({ id: 'f3' })) === null);

// Fin de la livraison offerte le 30/09/2026 à midi : une commande d'avant garde la règle de sa date.
const lignes400 = [{ productId: 'p9', productName: 'Tissu', productImage: '', price: 40, unitPrice: 40, quantity: 10, maxStock: 99 }];
const colis400 = (id: string, createdAt: unknown) =>
  commande({ id, items: lignes400, subtotal: 400, deliveryFee: 0, total: 400, reception: { mode: 'domicile', volumineux: false }, createdAt });
check('fin de la livraison offerte : le 30/09/2026 à midi (heure du Maroc)', new Date(FIN_LIVRAISON_OFFERTE).toISOString() === '2026-09-30T11:00:00.000Z');
check('400 DH à Casablanca le 29/09 : 0 attendu (offerte à cette date)', fraisColisAttendus(colis400('o1', new Date(Date.UTC(2026, 8, 29, 15)))) === 0);
check('400 DH à Casablanca après midi le 30/09 : 20 DH attendus', fraisColisAttendus(colis400('o2', new Date(FIN_LIVRAISON_OFFERTE + 60_000))) === 20);
check('sans date (commande tout juste écrite) : règle d’aujourd’hui, 20 DH', fraisColisAttendus(colis400('o3', undefined)) === 20);
check('horodatage Firestore {seconds} du 29/09 : lu, 0 attendu', fraisColisAttendus(colis400('o4', { seconds: Date.UTC(2026, 8, 29, 10) / 1000 })) === 0);
check('650 DH à Rabat après la fin : 35 DH attendus, plus de seuil',
  fraisColisAttendus({ ...colis400('o5', new Date(FIN_LIVRAISON_OFFERTE + 1)), items: [{ ...lignes400[0], quantity: 20 }], shippingAddress: { fullName: 'x', phone: '0612345678', address: '1 rue', city: 'Rabat' } }) === 35);
check('colis à 0 DH d’avant : « offerte » ; d’après : « à confirmer »',
  fraisColisAnnonces(colis400('o6', new Date(Date.UTC(2026, 8, 29, 15)))) === 'offerte'
  && fraisColisAnnonces(colis400('o7', new Date(FIN_LIVRAISON_OFFERTE + 60_000))) === 'à confirmer');

console.log(`\n${pass} réussis, ${fail} échoués`);
process.exit(fail ? 1 : 0);
