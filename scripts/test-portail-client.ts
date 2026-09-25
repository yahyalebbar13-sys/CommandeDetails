// Tests de ce que l'espace client reçoit (lib/portail-client-donnees.ts) et
// des demandes qu'il envoie (lib/demandes-client.ts).
// Lancer :
//   npx tsx scripts/test-portail-client.ts

import { commandeDuClient, construirePortail } from '../src/lib/portail-client-donnees';
import { validerDemande } from '../src/lib/demandes-client';

let pass = 0;
let fail = 0;
function check(label: string, ok: boolean, detail = '') {
  if (ok) { pass++; console.log(`  ✓ ${label}`); }
  else { fail++; console.log(`  ✗ ${label} ${detail}`); }
}

const jour = (j: number) => { const d = new Date(); d.setDate(d.getDate() + j); return d.toISOString().slice(0, 10); };

console.log('\n── À qui est la commande ? ──');
check('même nom, casse et accents différents', commandeDuClient('ATELIER ÉCLAIR', 'Atelier Eclair'));
check('même nom, ponctuation et espaces différents', commandeDuClient('  Atelier-Éclair. ', 'atelier eclair'));
check('nom plus long : refusé (peut-être un autre client)', !commandeDuClient('Atelier Eclair SARL', 'atelier eclair'));
check('nom plus court : refusé aussi', !commandeDuClient('Atelier Eclair', 'Atelier Eclair Nord'));
check('pas par bout de mot', !commandeDuClient('ALIMENTATION GENERALE', 'Ali'));
check('nom court : égalité stricte seulement', !commandeDuClient('ALI BABA', 'ALI') && commandeDuClient('ALI', 'ali'));
check('un autre client', !commandeDuClient('Confection Nour', 'Atelier Eclair'));
check('commande sans client', !commandeDuClient(undefined, 'Atelier Eclair'));
check('commande sans client, même avec un alias vide', !commandeDuClient('', 'Atelier Eclair', ['']));
check('alias inscrit par l’administrateur : accepté', commandeDuClient('ATELIER ECLAIR SARL', 'Atelier Eclair', ['atelier eclair sarl']));
check('alias : égalité exacte aussi', !commandeDuClient('ATELIER ECLAIR SARL NORD', 'Atelier Eclair', ['atelier eclair sarl']));

console.log('\n── Ce qui sort vers le client ──');
const articles = [
  {
    id: 'a1', clientName: 'Atelier Éclair', status: 'SHIPPED', factureId: 'F1', name: 'TAFFETA 190T', categoryId: 'TAFFETA 190T',
    quantity: 1200, unitOfMeasure: 'm', orderDate: jour(-40), purchasePricePerUnit: 0.42, supplierId: 'JIMMY',
    colorBreakdown: [{ colorCode: 'NOIR', rolls: 800 }], devisConfirmed: true, devisPrixVenteUniteMad: 7.5,
    notes: 'marge 30 %', cubicMeasurement: 3.2,
  },
  { id: 'a2', clientName: 'Confection Nour', status: 'PI', name: 'SECRET', quantity: 10, purchasePricePerUnit: 99 },
  { id: 'a3', clientName: 'Atelier Eclair', status: 'PI', name: 'NYLON N3', quantity: 5000, devisConfirmed: false, devisPrixVenteUniteMad: 1.2 },
  // Nom qui CONTIENT celui du client : une autre maison, peut-être. Jamais montré.
  { id: 'a4', clientName: 'Atelier Eclair Nord', status: 'PI', name: 'VOISIN', quantity: 7 },
  // Ancien nom du client, inscrit en alias par l'administrateur.
  { id: 'a5', clientName: 'ECLAIR CONFECTION S.A.R.L.', status: 'PI', name: 'RIPSTOP', quantity: 300 },
];
const factures = [
  { id: 'F1', noBL: 'MEDUKV285573', shippingLine: 'MSC', arrivalDate: jour(9), arrivalDateAvantSuivi: jour(3), freightCost: 4200,
    suivi: { shipmentId: 5, statut: 'SAILING', navire: 'MSC ANNA', lienCarte: 'https://map', notifie: ['x'], abonnes: [{ email: 'x@y' }],
      etaInitiale: jour(6),
      etapes: [{ code: 'DEPA', libelle: 'Départ du port', reel: true, date: jour(-20), lieu: 'NINGBO' }] } },
  { id: 'F2', noBL: 'AUTRE', freightCost: 999 },
];
const { commandes, conteneurs } = construirePortail({
  client: 'Atelier Eclair', alias: ['Eclair Confection S.A.R.L'], articles, factures,
  categories: [{ id: 'c1', name: 'TAFFETA 190T', nameFR: 'Doublure Taffeta 190T', imageUrl: 'https://img' }], poles: [],
});
check('seules les commandes du client (nom exact ou alias)', commandes.map(c => c.id).join() === 'a1,a3,a5', `→ ${commandes.map(c => c.id)}`);
check('sans alias : l’ancien nom n’est pas repris', construirePortail({
  client: 'Atelier Eclair', articles, factures, categories: [], poles: [],
}).commandes.map(c => c.id).join() === 'a1,a3');
const json = JSON.stringify({ commandes, conteneurs });
check('ni prix d’achat, ni fournisseur, ni notes', !/purchasePrice|0\.42|JIMMY|marge|cubicMeasurement/.test(json));
check('ni fret, ni abonnés, ni registre d’alertes', !/freightCost|4200|abonnes|x@y|notifie/.test(json));
check('rien d’un autre client', !/SECRET|Confection Nour|AUTRE|VOISIN/.test(json));
const a1 = commandes.find(c => c.id === 'a1')!;
check('nom français calculé côté serveur', a1.nom === 'Doublure Taffeta 190T', `→ ${a1.nom}`);
check('statut effectif (en mer)', a1.statut === 'TRANSIT', `→ ${a1.statut}`);
check('couleurs ventilées', a1.couleurs?.[0]?.code === 'NOIR' && a1.couleurs?.[0]?.quantite === 800);
check('prix convenu seulement si le devis est confirmé',
  a1.prixConvenuMad === 7.5 && commandes.find(c => c.id === 'a3')!.prixConvenuMad === undefined);
check('le conteneur du client, avec son suivi', Boolean(conteneurs.F1?.suivi?.lienCarte) && conteneurs.F1.suivi?.etapes?.length === 1);
check('date initiale = la première annoncée par la compagnie', conteneurs.F1.arriveeInitiale === jour(6), `→ ${conteneurs.F1.arriveeInitiale}`);
check('jamais la date tapée à la main au bureau', construirePortail({
  client: 'Atelier Eclair',
  articles: [{ id: 'a8', clientName: 'Atelier Eclair', status: 'SHIPPED', factureId: 'F8', quantity: 1 }],
  factures: [{ id: 'F8', arrivalDate: jour(9), arrivalDateAvantSuivi: jour(3) }],
  categories: [], poles: [],
}).conteneurs.F8.arriveeInitiale === undefined);
check('pas les conteneurs des autres', !conteneurs.F2);

const verrouille = construirePortail({
  client: 'Atelier Eclair',
  articles: [{ id: 'a9', clientName: 'Atelier Eclair', status: 'SHIPPED', factureId: 'F9', quantity: 1 }],
  factures: [{ id: 'F9', arrivalDate: jour(-40), stockEntryDate: jour(-10), suivi: { shipmentId: 9, statut: 'DISCHARGED', lienCarte: 'https://map' } }],
  categories: [], poles: [],
});
check('conteneur entré en stock : plus de suivi', !verrouille.conteneurs.F9.suivi);

console.log('\n── Demandes ──');
const siennes = new Set(['a1', 'a3']);
check('recommander : une commande et une quantité', validerDemande({ type: 'recommande', commandes: ['a1'], quantite: 500 }, siennes).ok);
check('recommander sans quantité : refusé', !validerDemande({ type: 'recommande', commandes: ['a1'] }, siennes).ok);
check('citer la commande d’un autre : refusé', !validerDemande({ type: 'livraison', commandes: ['a2'], mode: 'livraison' }, siennes).ok);
check('livraison : mode obligatoire', !validerDemande({ type: 'livraison', commandes: ['a1'] }, siennes).ok);
check('livraison avec date', validerDemande({ type: 'livraison', commandes: ['a1', 'a3'], mode: 'retrait', dateSouhaitee: '2026-10-05' }, siennes).ok);
check('date mal formée : refusée', !validerDemande({ type: 'livraison', commandes: ['a1'], mode: 'retrait', dateSouhaitee: 'demain' }, siennes).ok);
check('question vide : refusée', !validerDemande({ type: 'question', message: '   ' }, siennes).ok);
const longue = validerDemande({ type: 'question', message: 'x'.repeat(5000) }, siennes);
check('message tronqué à 1000 caractères', longue.ok && (longue as any).demande.message.length === 1000);
check('type inconnu : refusé', !validerDemande({ type: 'supprimer' }, siennes).ok);

console.log(`\n${fail === 0 ? '✅' : '❌'} ${pass} réussis, ${fail} échoués`);
process.exit(fail === 0 ? 0 : 1);
