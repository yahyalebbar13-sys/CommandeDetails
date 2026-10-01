// Le bon sans prix, parcours normal de la vente.
//
// Le gestionnaire imprime le bon sans prix, le commercial écrit les prix dessus, le gestionnaire
// les saisit. Le bon sort le stock dès qu'il est enregistré : corriger ou annuler doit remettre
// EXACTEMENT ce qui est sorti, au même endroit. Et un bon comptoir oublié doit se voir.
// Lancer :
//   npx tsx scripts/test-bon-sans-prix.ts

import {
  prefixeMagasin, numeroBon, numeroProvisoire, estNumeroProvisoire, prochainNumero,
  natureBon, estSortiAuBon, bonEnCours, statutBon,
  instantCreation, ancienneteMinutes, libelleAnciennete, rappelComptoir, titreOnglet, trierBons,
  bonCorrespond, cleGroupe, grouperLignesBon,
  prixUnitaireSaisi, quantiteSaisie, remiseSaisie, appliquerSaisieBon, comparerTotalPapier,
  encoursClient, controleCreditAuBon, controleCreditAvantSortie, controleCreditFinalisation,
  soldeSortiParEmplacement, mouvementsAnnulation, mouvementsCorrection, emplacementsDesLignes,
  mouvementsDuBon, mouvementsDeLaLigne, SEUIL_URGENCE_MINUTES,
  contenanceDeLigne, contenanceDepuisStock, unitePrixDeLigne, prixParUnitePrix, varianteDeLigne,
  bonComptoirEnAttente, PREFIXE_TITRE_ONGLET,
} from '../src/lib/bon-sans-prix';
import { construireBonHtml, libellePrixParUnite } from '../src/lib/bon-imprime';
import { splitOutboundLines } from '../src/lib/warehouse-locations';
import { dejaRenduParLigne, encoreRetournable, depassementRetour } from '../src/lib/retours-facture';

let pass = 0;
let fail = 0;
function check(label: string, ok: boolean, detail = '') {
  if (ok) { pass++; console.log(`  ✓ ${label}`); }
  else { fail++; console.log(`  ✗ ${label} ${detail}`); }
}
const eq = (label: string, obtenu: any, attendu: any) =>
  check(label, JSON.stringify(obtenu) === JSON.stringify(attendu), `→ obtenu ${JSON.stringify(obtenu)}, attendu ${JSON.stringify(attendu)}`);

// ─────────────────────────────────────────────────────────────────────────────
console.log('\n── Le numéro du bon, par magasin ──');
eq('CHRIFA numérote en CH', prefixeMagasin('CHRIFA', 'CHRIFA'), 'CH');
eq('Derb Omar en DO', prefixeMagasin('DERB_OMAR', 'Derb omar'), 'DO');
eq('IDAA en ID', prefixeMagasin('IDAA', 'IDAA'), 'ID');
eq('un magasin inconnu prend ses deux premières lettres', prefixeMagasin('MAARIF', 'Maarif'), 'MA');
eq('un nom en deux mots prend ses initiales', prefixeMagasin('X1', 'Hay Hassani'), 'HH');
eq('les accents ne gênent pas', prefixeMagasin('X2', 'Éléphant'), 'EL');
eq('« BC » est réservé aux anciens numéros', prefixeMagasin('BC1', 'Bouchentouf Centre') !== 'BC', true);
eq('un préfixe déjà pris par un autre magasin est évité', prefixeMagasin('CHAOUIA', 'Chaouia', ['CH']), 'CA');
eq('même un magasin connu cède si son préfixe est pris ailleurs', prefixeMagasin('IDAA', 'IDAA', ['ID']) !== 'ID', true);
eq('numéro sur quatre chiffres', numeroBon('CH', 1), 'CH-0001');
eq('et au-delà quand il le faut', numeroBon('CH', 12345), 'CH-12345');
{
  const r = prochainNumero({ compteurBons: 41 }, 'CH');
  eq('le compteur du magasin donne le suivant', r.numero, 'CH-0042');
  eq('et le compteur à écrire', r.compteur, 42);
  eq('un magasin sans compteur commence à 1', prochainNumero(undefined, 'DO').numero, 'DO-0001');
  eq('le préfixe figé sur la fiche l’emporte', prochainNumero({ compteurBons: 3, prefixeBons: 'ZZ' }, 'CH').numero, 'ZZ-0004');
  eq('un compteur illisible repart de zéro', prochainNumero({ compteurBons: 'abc' }, 'CH').numero, 'CH-0001');
}
{
  const p = numeroProvisoire('CH', new Date(2026, 9, 1, 14, 5, 9));
  eq('le numéro provisoire se lit comme tel', p, 'CH-PROV-0110-140509');
  eq('il est reconnu comme provisoire', estNumeroProvisoire(p), true);
  eq('un vrai numéro ne l’est pas', estNumeroProvisoire('CH-0007'), false);
  eq('un ancien BC non plus', estNumeroProvisoire('BC-0003'), false);
}

// ─────────────────────────────────────────────────────────────────────────────
console.log('\n── Nature et statut d’un bon ──');
const ligne = (o: any = {}) => ({ articleId: 'A1', productName: 'FERMETURE N5', quality: 'NYLON', color: 'NOIR', unitOfMeasure: 'pcs', qty: 10, unitPrice: 0, totalPrice: 0, ...o });
eq('un ancien bon (sans marqueur) est « à préparer »', natureBon({ status: 'CONFIRMED' }), 'A_PREPARER');
eq('et il n’a pas sorti le stock', estSortiAuBon({ status: 'CONFIRMED' }), false);
eq('un bon comptoir sorti', natureBon({ sortieAuBon: true, comptoir: true }), 'COMPTOIR');
eq('un bon client sorti', natureBon({ sortieAuBon: true }), 'CLIENT');
eq('« comptoir » sans sortie reste à préparer', natureBon({ comptoir: true }), 'A_PREPARER');
eq('sans prix : à chiffrer', statutBon({ status: 'CONFIRMED', items: [ligne()] }).libelle, 'À chiffrer');
eq('chiffré : à encaisser', statutBon({ status: 'CONFIRMED', items: [ligne({ unitPrice: 2 })] }).libelle, 'Chiffré, à encaisser');
eq('facturé : terminé', statutBon({ status: 'INVOICED', items: [ligne()] }).libelle, 'Terminé');
eq('annulé', statutBon({ status: 'CANCELLED', items: [ligne()] }).libelle, 'Annulé');
eq('un bon facturé n’est plus en cours', bonEnCours({ status: 'INVOICED' }), false);
eq('un brouillon l’est', bonEnCours({ status: 'DRAFT' }), true);

// ─────────────────────────────────────────────────────────────────────────────
console.log('\n── Ancienneté et urgence des bons comptoir ──');
{
  const maintenant = Date.parse('2026-10-01T15:00:00');
  const bon = (min: number, o: any = {}) => ({
    status: 'CONFIRMED', sortieAuBon: true, comptoir: true, items: [ligne()],
    creeLe: new Date(maintenant - min * 60000).toISOString(), date: '2026-10-01', ...o,
  });
  eq('creeLe donne l’instant du bon', instantCreation(bon(5)), maintenant - 5 * 60000);
  eq('à défaut, l’horodatage du serveur', instantCreation({ createdAt: { seconds: 1000 } }), 1000000);
  eq('à défaut encore, la date à minuit', instantCreation({ date: '2026-10-01' }), Date.parse('2026-10-01T00:00:00'));
  eq('ancienneté en minutes', ancienneteMinutes(bon(12), maintenant), 12);
  eq('jamais négative (horloge du poste en avance)', ancienneteMinutes(bon(-3), maintenant), 0);
  eq('« à l’instant »', libelleAnciennete(0), "à l'instant");
  eq('« il y a 12 min »', libelleAnciennete(12), 'il y a 12 min');
  eq('« il y a 2 h 05 »', libelleAnciennete(125), 'il y a 2 h 05');
  eq('« depuis 2 jours »', libelleAnciennete(2 * 24 * 60 + 10), 'depuis 2 jours');

  const bons = [
    bon(3, { id: 'recent' }),
    bon(40, { id: 'vieux' }),
    bon(90, { id: 'facture', status: 'INVOICED' }),
    { id: 'client', status: 'CONFIRMED', sortieAuBon: true, items: [ligne()], creeLe: new Date(maintenant - 600 * 60000).toISOString() },
    { id: 'ancien', status: 'CONFIRMED', items: [ligne()], date: '2026-09-01' },
  ];
  const r = rappelComptoir(bons, maintenant);
  eq('deux bons comptoir attendent (le facturé ne compte plus)', r.nombre, 2);
  eq('le plus ancien est repéré', r.plusAncien?.id, 'vieux');
  eq('son ancienneté', r.minutesPlusAncien, 40);
  eq(`au-delà de ${SEUIL_URGENCE_MINUTES} min, c’est urgent`, r.urgent, true);
  eq('un seul bon de 3 min n’est pas encore urgent', rappelComptoir([bon(3)], maintenant).urgent, false);
  eq('aucun bon : rien à rappeler', rappelComptoir([], maintenant).nombre, 0);
  eq('un bon client ne déclenche pas l’alerte comptoir', rappelComptoir([bons[3]], maintenant).nombre, 0);
  eq('le titre de l’onglet compte les bons', titreOnglet(2, 'LEBTEX'), '(2) Prix à saisir · LEBTEX');
  eq('et redevient normal ensuite', titreOnglet(0, 'LEBTEX'), 'LEBTEX');

  const ordre = trierBons(bons, maintenant).map((b: any) => b.id);
  eq('comptoir en tête (le plus vieux d’abord), puis les autres en cours, puis le reste', ordre, ['vieux', 'recent', 'ancien', 'client', 'facture']);
}

// ─────────────────────────────────────────────────────────────────────────────
console.log('\n── Recherche ──');
{
  const b = { orderNumber: 'CH-0042', clientName: 'Atelier Élégance', notes: 'livrer lundi' };
  eq('par numéro', bonCorrespond(b, 'ch-0042'), true);
  eq('par client, sans accents', bonCorrespond(b, 'elegance'), true);
  eq('par numéro affiché (ancien BC)', bonCorrespond({ clientName: 'X' }, 'BC-0003', 'BC-0003'), true);
  eq('rien ne correspond', bonCorrespond(b, 'zzz'), false);
  eq('recherche vide : tout passe', bonCorrespond(b, '  '), true);
}

// ─────────────────────────────────────────────────────────────────────────────
console.log('\n── Le papier : lignes groupées par produit + qualité ──');
const itemsBon = [
  ligne({ color: 'ROUGE', qty: 10 }),
  ligne({ quality: 'METAL', color: 'OR', qty: 5 }),
  ligne({ color: 'BLEU', qty: 4 }),
  ligne({ productName: 'TAFFETA', quality: '190T', color: 'NOIR', unitOfMeasure: 'm', qty: 2.5 }),
  ligne({ productName: 'TAFFETA', quality: '190T', color: 'BLANC', unitOfMeasure: 'm', qty: 10 }),
];
{
  const g = grouperLignesBon(itemsBon);
  eq('trois groupes : deux qualités de fermeture, un taffetas', g.map(x => `${x.produit}/${x.qualite}`), ['FERMETURE N5/NYLON', 'FERMETURE N5/METAL', 'TAFFETA/190T']);
  eq('les couleurs d’un groupe, triées', g[0].lignes.map(l => l.couleur), ['BLEU', 'ROUGE']);
  eq('chaque ligne garde son rang dans le bon', g[0].lignes.map(l => l.index), [2, 0]);
  eq('total du groupe, par unité', g[0].totaux, [{ unite: 'pcs', quantite: 14 }]);
  eq('les mètres s’additionnent au millième', g[2].totaux, [{ unite: 'm', quantite: 12.5 }]);
  eq('sans prix : la case reste vide', g[0].prixUnique, null);
  eq('la clé ignore casse et accents', cleGroupe({ productName: 'Fermeture n5', quality: 'nylon' }), cleGroupe(itemsBon[0]));
  const avecPrix = grouperLignesBon([ligne({ unitPrice: 1.5 }), ligne({ color: 'X', unitPrice: 1.5 })]);
  eq('un prix commun remplit la case', avecPrix[0].prixUnique, 1.5);
  const differents = grouperLignesBon([ligne({ unitPrice: 1.5 }), ligne({ color: 'X', unitPrice: 2 })]);
  eq('des prix différents sont signalés', [differents[0].prixUnique, differents[0].prixDifferents], [null, true]);
}

// ─────────────────────────────────────────────────────────────────────────────
console.log('\n── La saisie : prix unitaires, remise, quantités ──');
eq('trois décimales pour la mercerie', prixUnitaireSaisi('0,035'), 0.035);
eq('« 12,50 »', prixUnitaireSaisi('12,50'), 12.5);
eq('au-delà de trois décimales, arrondi au millième', prixUnitaireSaisi('0,12345'), 0.123);
eq('vide = pas de prix', prixUnitaireSaisi(''), 0);
eq('négatif = pas de prix', prixUnitaireSaisi('-2'), 0);
eq('une quantité vide ne change rien', quantiteSaisie(''), null);
eq('zéro retire la ligne', quantiteSaisie('0'), 0);
eq('« 2,5 »', quantiteSaisie('2,5'), 2.5);
eq('une quantité illisible ne change rien', quantiteSaisie('abc'), null);
eq('remise bornée', [remiseSaisie('150'), remiseSaisie('-5'), remiseSaisie('7,5')], [100, 0, 7.5]);
{
  const cleNylon = cleGroupe(itemsBon[0]);
  const cleTaffeta = cleGroupe(itemsBon[3]);
  const r = appliquerSaisieBon(itemsBon, {
    prixGroupe: { [cleNylon]: '0,035', [cleTaffeta]: '12' },
    prixLigne: { 1: '0,5' },
    qteLigne: { 2: '0', 4: '9,5' },
    remise: '10',
  }, 0);
  eq('le prix du groupe vaut pour toutes ses couleurs', r.items.find((l: any) => l.color === 'ROUGE')?.unitPrice, 0.035);
  eq('le total de ligne s’arrête au centime', r.items.find((l: any) => l.color === 'ROUGE')?.totalPrice, 0.35);
  eq('la ligne saisie à part garde son prix', r.items.find((l: any) => l.color === 'OR')?.unitPrice, 0.5);
  eq('la ligne ramenée à 0 est retirée', r.retirees.map((l: any) => l.color), ['BLEU']);
  eq('la quantité corrigée est prise', r.items.find((l: any) => l.color === 'BLANC')?.qty, 9.5);
  eq('les changements de quantité sont listés', r.changements.map(c => [c.index, c.avant, c.apres]), [[2, 4, 0], [4, 10, 9.5]]);
  // 0,35 + 2,50 + 30 + 114 = 146,85 ; remise 10 % → 132,165 → 132,17
  eq('sous-total', r.totalAmount, 146.85);
  eq('remise appliquée, arrondie au centime', r.totalAfterDiscount, 132.17);
  eq('plus rien à chiffrer', r.restantSansPrix, 0);
  const sansSaisie = appliquerSaisieBon(itemsBon, {}, 5);
  eq('sans saisie : la remise du bon est gardée', sansSaisie.discount, 5);
  eq('et tout reste à chiffrer', sansSaisie.restantSansPrix, 5);
}
{
  eq('le total papier concorde', comparerTotalPapier(132.17, '132,17').concorde, true);
  const c = comparerTotalPapier(132.17, '130');
  eq('un écart est mesuré', [c.concorde, c.ecart], [false, -2.17]);
  eq('rien de tapé : pas de comparaison', comparerTotalPapier(10, '').saisi, null);
  eq('« 1 320,50 » avec espace se lit', comparerTotalPapier(1320.5, '1 320,50').concorde, true);
}

// ─────────────────────────────────────────────────────────────────────────────
console.log('\n── Crédit client ──');
{
  const factures = [
    { clientId: 'C1', status: 'UNPAID', remainingBalance: 800 },
    { clientId: 'C1', status: 'PAID', remainingBalance: 0 },
    { clientId: 'C1', status: 'PARTIAL', totalAfterDiscount: 500, paidAmount: 300 },
    { clientId: 'C2', status: 'UNPAID', remainingBalance: 999 },
  ];
  const bons = [
    { clientId: 'C1', status: 'CONFIRMED', sortieAuBon: true, totalAfterDiscount: 100 },
    { clientId: 'C1', status: 'CONFIRMED', totalAfterDiscount: 1000 }, // à préparer : rien n'est parti
  ];
  eq('encours = factures non soldées + bons partis', encoursClient('C1', factures, bons), 1100);
  eq('sans client, rien', encoursClient(undefined, factures, bons), 0);
  eq('client bloqué : refusé au bon', controleCreditAuBon({ name: 'X', creditBlocked: true }, 0).refuse, true);
  eq('déjà au plafond : refusé', controleCreditAuBon({ name: 'X', creditLimit: 1000 }, 1100).refuse, true);
  eq('sous le plafond : accepté', controleCreditAuBon({ name: 'X', creditLimit: 2000 }, 1100).refuse, false);
  eq('plafond 0 = non surveillé', controleCreditAuBon({ name: 'X', creditLimit: 0 }, 99999).refuse, false);
  eq('à la finalisation, le dépassement avertit', controleCreditFinalisation({ name: 'X', creditLimit: 1200 }, 1100, 200).avertir, true);
  eq('sans dépassement, rien', controleCreditFinalisation({ name: 'X', creditLimit: 1500 }, 1100, 200).avertir, false);
  eq('commande à préparer : ce bon fait passer le plafond, refusé', controleCreditAvantSortie({ name: 'X', creditLimit: 10000 }, 9000, 5000).refuse, true);
  eq('commande à préparer : sous le plafond, accepté', controleCreditAvantSortie({ name: 'X', creditLimit: 10000 }, 9000, 500).refuse, false);
  eq('commande à préparer : client bloqué, refusé', controleCreditAvantSortie({ name: 'X', creditBlocked: true }, 0, 10).refuse, true);
  eq('commande à préparer : sans plafond, accepté', controleCreditAvantSortie({ name: 'X' }, 50000, 5000).refuse, false);
}

// ─────────────────────────────────────────────────────────────────────────────
console.log('\n── Annuler un bon : on inverse EXACTEMENT ses mouvements ──');
{
  const contexte = { date: '2026-10-01', notes: 'Annulation du bon CH-0001', bonId: 'B1', bonNumero: 'CH-0001' };
  const sorties = [
    { id: 'm1', bonId: 'B1', ligneBonId: 'L1', type: 'OUT', reason: 'VENTE', storeId: 'CHRIFA', locationCode: 'A-01-01', locationId: 'loc1', articleId: 'A1', quality: 'NYLON', color: 'ROUGE', size: null, unitOfMeasure: 'pcs', quantity: 6, categoryId: 'FERM', productName: 'FERMETURE', date: '2026-09-30', createdAt: { seconds: 1 } },
    { id: 'm2', bonId: 'B1', ligneBonId: 'L1', type: 'OUT', reason: 'VENTE', storeId: 'CHRIFA', locationCode: 'A-01-02', articleId: 'A1', quality: 'NYLON', color: 'ROUGE', unitOfMeasure: 'pcs', quantity: 4, date: '2026-09-30' },
    { id: 'm3', bonId: 'B1', ligneBonId: 'L2', type: 'OUT', reason: 'VENTE', storeId: 'CHRIFA', articleId: 'T1', quality: '190T', color: 'NOIR', unitOfMeasure: 'm', quantity: 2.5, date: '2026-09-30' },
    // une correction déjà passée : 1 pièce rendue en A-01-02
    { id: 'm4', bonId: 'B1', ligneBonId: 'L1', type: 'IN', reason: 'CORRECTION_BON', storeId: 'CHRIFA', locationCode: 'A-01-02', articleId: 'A1', quality: 'NYLON', color: 'ROUGE', unitOfMeasure: 'pcs', quantity: 1, date: '2026-09-30' },
  ];
  const soldes = soldeSortiParEmplacement(sorties);
  eq('solde net par emplacement', soldes.map(s => s.quantite), [6, 3, 2.5]);

  const inv = mouvementsAnnulation(sorties, contexte);
  eq('un retour par tas encore dehors', inv.length, 3);
  eq('ce sont des entrées « annulation de bon »', inv.every(m => m.type === 'IN' && m.reason === 'ANNULATION_BON'), true);
  eq('mêmes magasin et emplacement', inv.map(m => `${m.storeId}/${m.locationCode || '-'}`), ['CHRIFA/A-01-01', 'CHRIFA/A-01-02', 'CHRIFA/-']);
  eq('mêmes quantités nettes', inv.map(m => m.quantity), [6, 3, 2.5]);
  eq('l’emplacement garde son identifiant', inv[0].locationId, 'loc1');
  eq('même article, qualité, couleur, unité', [inv[0].articleId, inv[0].quality, inv[0].color, inv[0].unitOfMeasure], ['A1', 'NYLON', 'ROUGE', 'pcs']);
  eq('les caractéristiques sont recopiées', [inv[0].categoryId, inv[0].productName], ['FERM', 'FERMETURE']);
  eq('lié au bon', [inv[0].bonId, inv[0].bonNumero, inv[0].ligneBonId], ['B1', 'CH-0001', 'L1']);
  eq('ni l’identifiant, ni l’horodatage d’origine', [inv[0].id, inv[0].createdAt], [undefined, undefined]);
  eq('la date et la note de l’annulation', [inv[0].date, inv[0].notes], ['2026-10-01', 'Annulation du bon CH-0001']);
  eq('un bon déjà annulé (tout rentré) ne rend plus rien', mouvementsAnnulation([...sorties, ...inv], contexte).length, 0);
  eq('les mouvements du bon se retrouvent', mouvementsDuBon([...sorties, { bonId: 'B2' }], 'B1').length, 4);
  eq('et ceux d’une ligne', mouvementsDeLaLigne(sorties, 'B1', 'L1').length, 3);
  eq('une ligne sans identifiant n’en a pas', mouvementsDeLaLigne(sorties, 'B1', undefined).length, 0);
  eq('d’où prendre chaque ligne', emplacementsDesLignes([{ ligneId: 'L1' }, { ligneId: 'L2' }], sorties, 'B1'), { 0: ['A-01-01', 'A-01-02'] });
}

// ─────────────────────────────────────────────────────────────────────────────
console.log('\n── Corriger une quantité sur un bon déjà sorti ──');
{
  const contexte = { date: '2026-10-01', notes: 'Correction du bon CH-0001', bonId: 'B1', bonNumero: 'CH-0001' };
  const ligneBon = { ligneId: 'L1', articleId: 'A1', quality: 'NYLON', color: 'ROUGE', unitOfMeasure: 'pcs', qty: 10, storeId: 'CHRIFA' };
  const sorties = [
    { bonId: 'B1', ligneBonId: 'L1', type: 'OUT', storeId: 'CHRIFA', locationCode: 'A-01-01', articleId: 'A1', quality: 'NYLON', color: 'ROUGE', unitOfMeasure: 'pcs', quantity: 6 },
    { bonId: 'B1', ligneBonId: 'L1', type: 'OUT', storeId: 'CHRIFA', locationCode: 'A-01-02', articleId: 'A1', quality: 'NYLON', color: 'ROUGE', unitOfMeasure: 'pcs', quantity: 4 },
  ];
  const moins = mouvementsCorrection({ ligne: ligneBon, mouvementsDeLaLigne: sorties, avant: 10, apres: 7, storeId: 'CHRIFA', contexte });
  eq('le client a pris 3 de moins : 3 rentrent', moins.retours.map(m => m.quantity), [3]);
  eq('au dernier emplacement entamé', moins.retours[0].locationCode, 'A-01-02');
  eq('motif « correction de bon »', [moins.retours[0].type, moins.retours[0].reason], ['IN', 'CORRECTION_BON']);
  eq('rien à sortir en plus', moins.aSortir, 0);

  const retiree = mouvementsCorrection({ ligne: ligneBon, mouvementsDeLaLigne: sorties, avant: 10, apres: 0, storeId: 'CHRIFA', contexte });
  eq('ligne retirée : tout rentre, emplacement par emplacement', retiree.retours.map(m => `${m.locationCode}:${m.quantity}`), ['A-01-02:4', 'A-01-01:6']);

  const plus = mouvementsCorrection({ ligne: ligneBon, mouvementsDeLaLigne: sorties, avant: 10, apres: 12.5, storeId: 'CHRIFA', contexte });
  eq('le client a pris plus : 2,5 à sortir en plus', [plus.aSortir, plus.retours.length], [2.5, 0]);

  const orpheline = mouvementsCorrection({ ligne: ligneBon, mouvementsDeLaLigne: [], avant: 10, apres: 8, storeId: 'CHRIFA', contexte });
  eq('sans mouvement retrouvé : retour sans emplacement, sur le lieu de la ligne', [orpheline.retours[0].quantity, orpheline.retours[0].storeId, orpheline.retours[0].locationCode], [2, 'CHRIFA', undefined]);
  eq('rien ne change : rien n’est écrit', mouvementsCorrection({ ligne: ligneBon, mouvementsDeLaLigne: sorties, avant: 10, apres: 10, storeId: 'CHRIFA', contexte }), { retours: [], aSortir: 0 });

  // De bout en bout : la sortie écrite à la caisse, puis l'annulation, laissent le rack comme avant.
  const entree = [{ type: 'IN', reason: 'ARRIVAGE', storeId: 'CHRIFA', locationCode: 'R-1', articleId: 'Z', quantity: 20, date: '2026-09-01' }];
  const sortiesCaisse = splitOutboundLines(entree, 'CHRIFA', 'Z', 5, { articleId: 'Z', type: 'OUT', reason: 'VENTE', storeId: 'CHRIFA', bonId: 'B9', ligneBonId: 'L9', unitOfMeasure: 'pcs' });
  const annulation = mouvementsAnnulation(sortiesCaisse, { ...contexte, bonId: 'B9' });
  const net = [...sortiesCaisse, ...annulation].reduce((s, m: any) => s + (m.type === 'IN' ? m.quantity : -m.quantity), 0);
  eq('sortie puis annulation : le rack retrouve exactement sa quantité', [net, annulation[0].locationCode], [0, 'R-1']);
}

// ─────────────────────────────────────────────────────────────────────────────
console.log('\n── Le bon imprimé ──');
eq('« par mètre »', libellePrixParUnite('m'), 'par mètre');
eq('« à la pièce »', libellePrixParUnite('pcs'), 'à la pièce');
eq('« par rouleau »', libellePrixParUnite('rolls'), 'par rouleau');
{
  const html = construireBonHtml({
    numero: 'CH-0042', nature: 'COMPTOIR', magasin: 'CHRIFA', date: '2026-10-01', heure: '14:32',
    items: [...itemsBon, ligne({ productName: 'BOUTON <A&B>', quality: '', color: 'NOIR' })],
    emplacements: { 0: ['A-01-01'] }, lieuDuBon: 'CHRIFA',
  });
  check('le numéro en très gros', html.includes('class="numero">CH-0042<'));
  check('« Client comptoir »', html.includes('Client comptoir'));
  check('la date à la française et l’heure', html.includes('01/10/2026') && html.includes('14:32'));
  check('« Bon de livraison » pour une vente comptoir', html.includes('Bon de livraison N°') && html.includes('<title>Bon de livraison CH-0042'));
  check('la qualité apparaît', html.includes('<div class="qualite">NYLON</div>') && html.includes('<div class="qualite">190T</div>'));
  check('une ligne par article, sans couleurs', (html.match(/class="designation"/g) || []).length === 4 && !html.includes('ROUGE') && !html.includes('BLANC'));
  check('deux cases par article : prix unitaire et prix total', (html.match(/<td class="case/g) || []).length === 8 && html.includes('>Prix unitaire (MAD)<') && html.includes('>Prix total (MAD)<'));
  check('l’unité du prix est rappelée dans la case', html.includes('<div class="case-aide">par mètre</div>') && html.includes('<div class="case-aide">à la pièce</div>'));
  check('le total de chaque groupe', html.includes('<strong>14 pièce(s)</strong>') && html.includes('<strong>12,5 m</strong>'));
  check('ni emplacement ni lieu sur le papier du commercial', !html.includes('A-01-01'));
  check('les cases Remise (%) et Total à payer après remise', html.includes('>Remise (%)<') && html.includes('>Total à payer, après remise (MAD)<'));
  check('le pied de page a sa place réservée sur chaque page', html.includes('class="page"') && html.includes('<tfoot><tr><td><div class="reserve-pied">'));
  check('aucune consigne interne : le client reçoit un exemplaire', !html.includes('Commercial') && !html.includes('gestionnaire'));
  check('les données sont échappées', html.includes('BOUTON &lt;A&amp;B&gt;') && !html.includes('<A&B>'));
  check('la charte : bleu nuit et or, bandeau de pied', html.includes('#0f172a') && html.includes('#c4a062') && html.includes('class="bandeau"'));
  check('aucun prix de revient', !/revient|purchasePrice|costPrice/i.test(html));

  const chiffre = construireBonHtml({
    numero: 'CH-PROV-0110-140509', nature: 'CLIENT', clientNom: 'Atelier X', date: '2026-10-01',
    items: [ligne({ unitPrice: 0.035, totalPrice: 0.35 })], discount: 10, totalAmount: 0.35, totalAfterDiscount: 0.32,
  });
  check('un bon chiffré remplit la case prix (trois décimales)', chiffre.includes('0,035'));
  check('et les cases Remise et Total', chiffre.includes('10 %') && chiffre.includes('0,32 MAD'));
  check('le numéro provisoire est signalé', chiffre.includes('Numéro provisoire'));
  check('le nom du client', chiffre.includes('Atelier X'));
  check('pas de consigne quand tout est chiffré', !chiffre.includes('Commercial :'));
  check('un article chiffré remplit sa case prix total', chiffre.includes('0,35'));
  const aPreparer = construireBonHtml({ numero: 'CH-0043', nature: 'A_PREPARER', clientNom: 'Y', date: '2026-10-01', items: [ligne()] });
  check('« Bon de commande » pour une commande à préparer', aPreparer.includes('Bon de commande N°') && !aPreparer.includes('Bon de livraison'));
}

// ─────────────────────────────────────────────────────────────────────────────
console.log('\n── Le prix au mètre ou à la pièce, jamais au conditionnement ──');
{
  const rouleau = ligne({ productName: 'TAFFETA', quality: '190T', color: 'NOIR', unitOfMeasure: 'rolls', qty: 12, contenance: { facteur: 50, uniteBase: 'm' } });
  const auMetre = ligne({ productName: 'TAFFETA', quality: '190T', color: 'BLANC', unitOfMeasure: 'm', qty: 10 });
  const sansContenance = ligne({ productName: 'RUBAN', quality: 'SATIN', color: 'OR', unitOfMeasure: 'rolls', qty: 3 });
  eq('la contenance d’un rouleau de 50 m', contenanceDeLigne(rouleau), { facteur: 50, uniteBase: 'm' });
  eq('une douzaine fait 12 pièces', contenanceDeLigne(ligne({ unitOfMeasure: 'doz' })), { facteur: 12, uniteBase: 'pièce' });
  eq('une grosse fait 144 pièces', contenanceDeLigne(ligne({ unitOfMeasure: 'gross (144p)' }))?.facteur, 144);
  eq('la contenance se lit sur la ligne de stock (rouleau)', contenanceDepuisStock('rolls', { rollLength: 45, rollLengthUnit: 'yds' }), { facteur: 45, uniteBase: 'yds' });
  eq('… et sur le sac', contenanceDepuisStock('bag', { pcsPerBag: 500 }), { facteur: 500, uniteBase: 'pièce' });
  eq('rien d’inventé sans longueur', contenanceDepuisStock('rolls', {}), undefined);
  eq('le prix d’un rouleau s’écrit au mètre', unitePrixDeLigne(rouleau), 'm');
  eq('une couleur au rouleau et une au mètre partagent le même prix au mètre', cleGroupe(rouleau), cleGroupe(auMetre));
  eq('mais un prix au mètre ne se recopie pas sur des pièces', cleGroupe(ligne({ productName: 'TAFFETA', quality: '190T', unitOfMeasure: 'pcs' })) !== cleGroupe(auMetre), true);
  const r = appliquerSaisieBon([rouleau, auMetre], { prixGroupe: { [cleGroupe(rouleau)]: '8' } }, 0);
  eq('8 MAD le mètre : le rouleau de 50 m vaut 400 MAD', r.items[0].unitPrice, 400);
  eq('12 rouleaux = 4 800 MAD (et non 96)', r.items[0].totalPrice, 4800);
  eq('le prix au mètre est gardé sur la ligne', r.items[0].prixBase, 8);
  eq('la ligne au mètre prend 8 MAD le mètre', [r.items[1].unitPrice, r.items[1].totalPrice], [8, 80]);
  eq('l’écran relit 8 MAD le mètre', prixParUnitePrix(r.items[0]), 8);
  eq('un prix au rouleau (caisse) se relit au mètre', prixParUnitePrix({ ...rouleau, unitPrice: 425 }), 8.5);
  const g = grouperLignesBon([rouleau, auMetre, sansContenance]);
  eq('un seul groupe TAFFETA, prix au mètre', [g[0].unitePrix, g[0].lignes.length], ['m', 2]);
  eq('un rouleau sans contenance : prix au colis entier, signalé', [g[1].unitePrix, g[1].prixAuColis], ['rolls', true]);
  const html = construireBonHtml({ numero: 'CH-0100', nature: 'CLIENT', clientNom: 'X', date: '2026-10-01', items: [rouleau, auMetre, sansContenance] });
  check('le papier demande le prix par mètre', html.includes('par mètre · 1 rouleau = 50 m'));
  check('il dit ce que fait un rouleau', html.includes('1 rouleau = 50 m'));
  check('et combien de mètres en tout : 12 rouleaux de 50 m + 10 m', html.includes('(610 m)'));
  check('un rouleau sans contenance : prix du rouleau entier, dit simplement', html.includes('par rouleau entier') && !html.includes('inconnue'));
  const avecRemise = construireBonHtml({ numero: 'CH-0101', nature: 'CLIENT', clientNom: 'X', date: '2026-10-01', items: [auMetre], discount: 5 });
  check('une remise déjà convenue s’imprime même sur un bon sans prix', avecRemise.includes('5 %'));
}

// ─────────────────────────────────────────────────────────────────────────────
console.log('\n── Quantités : pas de fraction de pièce ──');
eq('9,5 pièces → 9', quantiteSaisie('9,5', 'pcs'), 9);
eq('9,5 m restent 9,5 m', quantiteSaisie('9,5', 'm'), 9.5);
eq('sans unité connue, rien n’est tronqué', quantiteSaisie('9,5'), 9.5);
{
  const r = appliquerSaisieBon([ligne({ qty: 10 })], { qteLigne: { 0: '9,5' } }, 0);
  eq('la saisie d’une ligne à la pièce est ramenée à l’entier', r.changements.map(c => c.apres), [9]);
}

// ─────────────────────────────────────────────────────────────────────────────
console.log('\n── La variante d’une ligne : jamais « la qualité d’abord » ──');
{
  // Article ventilé par COULEUR, qualité fixe « POLY 210T » sur toutes les entrées.
  const article = { id: 'ART', color: 'various', quality: 'POLY 210T', quantity: 200, colorBreakdown: [{ color: 'ROUGE', rolls: 100 }, { color: 'BLEU', rolls: 100 }] };
  const entrees = [
    { type: 'IN', reason: 'ARRIVAGE', storeId: 'CHRIFA', locationCode: 'R-01', articleId: 'ART', color: 'ROUGE', quality: 'POLY 210T', quantity: 100, date: '2026-08-01' },
    { type: 'IN', reason: 'ARRIVAGE', storeId: 'CHRIFA', locationCode: 'B-01', articleId: 'ART', color: 'BLEU', quality: 'POLY 210T', quantity: 100, date: '2026-09-01' },
  ];
  const bleu = { articleId: 'ART', color: 'BLEU', quality: 'POLY 210T', unitOfMeasure: 'm', qty: 10 };
  eq('la ventilation de l’article donne la couleur', varianteDeLigne(bleu, [article]), { dimension: 'color', value: 'BLEU' });
  eq('la variante notée à la caisse l’emporte', varianteDeLigne({ ...bleu, varianteStock: { dimension: 'color', value: 'Bleu' } }, []), { dimension: 'color', value: 'Bleu' });
  eq('article simple : pas de variante', varianteDeLigne(bleu, [{ id: 'ART' }]), null);
  const sortie = splitOutboundLines(entrees, 'CHRIFA', 'ART', 5, { type: 'OUT' }, varianteDeLigne(bleu, [article]));
  eq('le supplément de BLEU sort du rack du BLEU', sortie.map((l: any) => l.locationCode), ['B-01']);
}

// ─────────────────────────────────────────────────────────────────────────────
console.log('\n── Annuler après une correction rendue sans emplacement ──');
{
  const contexte = { date: '2026-10-01', notes: 'Annulation', bonId: 'B5', bonNumero: 'CH-0005' };
  const mouvements = [
    { bonId: 'B5', ligneBonId: 'L1', type: 'OUT', storeId: 'CHRIFA', locationCode: 'R-01', articleId: 'A1', color: 'ROUGE', unitOfMeasure: 'm', quantity: 10 },
    // une correction 10 → 6 qui n'avait pas retrouvé la sortie : 4 rentrés sans emplacement
    { bonId: 'B5', ligneBonId: 'L1', type: 'IN', reason: 'CORRECTION_BON', storeId: 'CHRIFA', articleId: 'A1', color: 'ROUGE', unitOfMeasure: 'm', quantity: 4 },
  ];
  const retours = mouvementsAnnulation(mouvements, contexte);
  eq('il ne rentre que les 6 encore dehors', retours.map(m => `${m.locationCode}:${m.quantity}`), ['R-01:6']);
  const net = [...mouvements, ...retours].reduce((t, m: any) => t + (m.type === 'IN' ? m.quantity : -m.quantity), 0);
  eq('le stock du magasin retombe juste', net, 0);
}

// ─────────────────────────────────────────────────────────────────────────────
console.log('\n── Vente comptoir facturée mais pas encaissée ──');
{
  const maintenant = Date.parse('2026-10-01T15:00:00');
  const bon = { id: 'BC1', status: 'INVOICED', invoiceId: 'F1', sortieAuBon: true, comptoir: true, items: [ligne({ unitPrice: 2 })], creeLe: new Date(maintenant - 30 * 60000).toISOString() };
  const nonReglee = [{ id: 'F1', status: 'UNPAID' }];
  const reglee = [{ id: 'F1', status: 'PAID' }];
  eq('encaissement fermé sans rien : « Chiffré, à encaisser »', statutBon(bon, nonReglee).libelle, 'Chiffré, à encaisser');
  eq('une fois réglé : terminé', statutBon(bon, reglee).libelle, 'Terminé');
  eq('il reste dans le rappel rouge', bonComptoirEnAttente(bon, nonReglee), true);
  const r = rappelComptoir([bon, { id: 'BC2', status: 'CONFIRMED', sortieAuBon: true, comptoir: true, items: [ligne()], creeLe: new Date(maintenant).toISOString() }], maintenant, nonReglee);
  eq('un à chiffrer, un à encaisser', [r.nombreAChiffrer, r.nombreAEncaisser], [1, 1]);
  eq('un bon client facturé à crédit est terminé', statutBon({ ...bon, comptoir: false, clientId: 'C1' }, nonReglee).libelle, 'Terminé');
  eq('l’onglet dit « à encaisser » quand il n’y a plus de prix à saisir', titreOnglet(0, 'LEBTEX', 1), '(1) À encaisser · LEBTEX');
  eq('le titre de base se retrouve', '(1) À encaisser · LEBTEX'.replace(PREFIXE_TITRE_ONGLET, ''), 'LEBTEX');
}

// ─────────────────────────────────────────────────────────────────────────────
console.log('\n── Retours sur facture : jamais deux fois la même marchandise ──');
{
  const items = [
    { articleId: 'A1', color: 'BLEU', qty: 10 },
    { articleId: 'A1', color: 'ROUGE', qty: 5 },
  ];
  const mouvements = [
    { factureId: 'F9', type: 'IN', reason: 'RETOUR', articleId: 'A1', color: 'BLEU', quantity: 10 },
    { factureId: 'F9', type: 'IN', reason: 'RETOUR', articleId: 'A1', color: 'ROUGE', quantity: 2 },
    { factureId: 'AUTRE', type: 'IN', reason: 'RETOUR', articleId: 'A1', color: 'ROUGE', quantity: 3 },
  ];
  eq('déjà rendu par ligne', dejaRenduParLigne(items, mouvements, 'F9'), [10, 2]);
  eq('encore retournable', encoreRetournable(items, mouvements, 'F9'), [0, 3]);
  check('un second retour de 10 m de BLEU est refusé', !!depassementRetour(items, mouvements, 'F9', [{ articleId: 'A1', color: 'BLEU', qty: 10 }]));
  eq('3 de ROUGE passent encore', depassementRetour(items, mouvements, 'F9', [{ articleId: 'A1', color: 'ROUGE', qty: 3 }]), null);
}

console.log(`\n${pass} réussi(s), ${fail} échoué(s)`);
if (fail > 0) process.exit(1);
