// Tests des outils de commandes boutique (lib/commandes-boutique.ts).
// Lancer :
//   npx tsx scripts/test-commandes-boutique.ts

import {
  commandeRepond, commandesDeLaFile, compteParFile, dateHeure, depuisQuand, enRetard,
  lienAppel, lienWhatsAppClient, lignesCollentAuSousTotal, lignesSansPrix, messageConfirmation,
  messageStatut, prixUnitaireLigne, resumeArgent, telInternational, telLisible, telephonesCommande,
  varianteLisible, fileDe,
} from '../src/lib/commandes-boutique';
import type { ShopOrder } from '../src/lib/shop-types';

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

console.log(`\n${pass} réussis, ${fail} échoués`);
process.exit(fail ? 1 : 0);
