// Les transferts faits par les magasins (demande du patron, 01/10/2026) : le départ sort la
// marchandise à l'envoi, l'arrivée la fait entrer à la réception, le départ peut annuler tant que
// rien n'est reçu. Chaque écriture sous le nom de celui qui la fait, sans jamais sortir deux fois.
// Lancer :
//   npx tsx scripts/test-transferts.ts

import {
  arrondiQte, numeroBonTransfert, departsPossibles, departRetenu, arriveesPossibles, magasinPrincipal,
  sortieDejaFaite, statutTransfert, transfertsAReceptionner, raisonPasReception, raisonPasAnnulation,
  varianteDeLigne, mouvementsEnvoi, mouvementsReception, mouvementsAnnulation, erreurReception,
  calculManquants, phrasePerteTransport, type BonTransfert,
  estEnRoute, estAncienBonEnAttente, sortiesParLigne, lignesSansSortie, mouvementsRattrapageSortie, raisonPasClore,
  MESSAGE_MOUVEMENTS_EN_CHARGEMENT,
} from '../src/lib/transferts';
import { construireBonTransfertHtml } from '../src/lib/bon-transfert-imprime';
import { computeArticleLocationStock } from '../src/lib/warehouse-locations';

let pass = 0;
let fail = 0;
function check(label: string, ok: boolean, detail = '') {
  if (ok) { pass++; console.log(`  ✓ ${label}`); }
  else { fail++; console.log(`  ✗ ${label} ${detail}`); }
}
const eq = (label: string, obtenu: any, attendu: any) =>
  check(label, JSON.stringify(obtenu) === JSON.stringify(attendu), `→ obtenu ${JSON.stringify(obtenu)}, attendu ${JSON.stringify(attendu)}`);

const lieux = [
  { id: 'CHRIFA', name: 'Chrifa', type: 'STORE', isMain: true },
  { id: 'DERB', name: 'Derb Omar', type: 'STORE', isMain: false },
  { id: 'IDAA', name: 'Idaa', type: 'STORE', isMain: false },
  { id: 'ENTREPOT', name: 'Entrepôt', type: 'WAREHOUSE', isMain: false },
];
const admin = { role: 'ADMIN' };
const derb = { role: 'COMMERCIAL', magasin: 'DERB' };
const chrifa = { role: 'COMMERCIAL', magasin: 'CHRIFA' };
const idaa = { role: 'COMMERCIAL', magasin: 'IDAA' };

/** Le stock d'un lieu, calculé comme computeQtyByStoreHelper (stock-app.tsx). */
function stockDe(mouvements: any[], lieu: string, articleId: string): number {
  let q = 0;
  for (const m of mouvements) {
    if (m.articleId !== articleId) continue;
    if (m.reason === 'TRANSFERT') {
      if (m.type === 'OUT' && (m.storeId || 'CHRIFA') === lieu) q -= m.quantity;
      if (m.type === 'IN' && (m.storeId || m.toStoreId || 'CHRIFA') === lieu) q += m.quantity;
    } else if ((m.storeId || 'CHRIFA') === lieu) {
      if (m.type === 'IN') q += m.quantity;
      if (m.type === 'OUT') q -= m.quantity;
    }
  }
  return arrondiQte(q);
}

console.log('\n── Le numéro du bon ──');
eq('BT- et les 8 premiers caractères en majuscules', numeroBonTransfert('ab12cd34ef56'), 'BT-AB12CD34');

console.log('\n── T1 : qui part, qui arrive ──');
eq('le magasin principal est CHRIFA', magasinPrincipal(lieux), 'CHRIFA');
eq('un magasin ne part que de chez lui', departsPossibles(derb, lieux), ['DERB']);
eq('l’admin peut partir de tous les magasins, le principal d’abord, jamais d’un entrepôt', departsPossibles(admin, lieux), ['CHRIFA', 'DERB', 'IDAA']);
eq('l’admin part de CHRIFA par défaut', departRetenu(admin, lieux, ''), 'CHRIFA');
eq('l’admin peut choisir Derb Omar', departRetenu(admin, lieux, 'DERB'), 'DERB');
eq('un choix d’entrepôt est ignoré', departRetenu(admin, lieux, 'ENTREPOT'), 'CHRIFA');
eq('l’admin qui regarde Derb Omar part de Derb Omar par défaut (le bon reste visible dans sa liste)', departRetenu(admin, lieux, '', 'DERB'), 'DERB');
eq('… mais son choix explicite l’emporte', departRetenu(admin, lieux, 'IDAA', 'DERB'), 'IDAA');
eq('l’admin qui regarde un entrepôt part du magasin principal', departRetenu(admin, lieux, '', 'ENTREPOT'), 'CHRIFA');
eq('un magasin ignore le magasin affiché', departRetenu(derb, lieux, '', 'CHRIFA'), 'DERB');
eq('un magasin ne peut pas usurper un autre départ', departRetenu(derb, lieux, 'CHRIFA'), 'DERB');
eq('un compte sans magasin n’a aucun départ', departsPossibles({ role: 'COMMERCIAL', magasin: null }, lieux), []);
eq('arrivée : les autres magasins, jamais un entrepôt ni le départ', arriveesPossibles('DERB', lieux), ['CHRIFA', 'IDAA']);
eq('depuis CHRIFA : Derb Omar et Idaa', arriveesPossibles('CHRIFA', lieux), ['DERB', 'IDAA']);

console.log('\n── T2 : l’envoi sort la marchandise du départ, rien à l’arrivée ──');
// Stock de départ : 30 m de TAFFETA rouge dans l'entrepôt de CHRIFA (rack A-01), 20 m en A-02.
const journal: any[] = [
  { articleId: 'TAF', type: 'IN', reason: 'ARRIVAGE', storeId: 'ENTREPOT', color: 'Rouge', locationCode: 'A-01', quantity: 30, date: '2026-09-01' },
  { articleId: 'TAF', type: 'IN', reason: 'ARRIVAGE', storeId: 'ENTREPOT', color: 'Rouge', locationCode: 'A-02', quantity: 20, date: '2026-09-10' },
  { articleId: 'ZIP', type: 'IN', reason: 'ARRIVAGE', storeId: 'DERB', quantity: 100, date: '2026-09-05' },
];
const items = [
  { articleId: 'TAF__color__Rouge', realArticleId: 'TAF', categoryId: 'c1', productName: 'TAFFETA', color: 'Rouge', unitOfMeasure: 'm', sentQty: 40 },
];
const envoi = mouvementsEnvoi({ bonId: 'bon00001xyz', items, depart: 'CHRIFA', arrivee: 'DERB', libelleArrivee: 'Derb Omar', mouvements: journal, lieux, date: '2026-10-01' });
eq('deux sorties : FIFO, A-01 vidé puis 10 m de A-02', envoi.mouvements.map(m => [m.locationCode, m.quantity]), [['A-01', 30], ['A-02', 10]]);
check('toutes sous le nom du DÉPART (seule écriture permise à son compte)', envoi.mouvements.every(m => m.storeId === 'CHRIFA' && m.type === 'OUT' && m.reason === 'TRANSFERT'));
check('aucune entrée à l’arrivée à l’envoi', envoi.mouvements.every(m => m.type !== 'IN'));
check('chaque sortie porte le lien vers le bon', envoi.mouvements.every(m => m.transferOrderId === 'bon00001xyz'));
check('la note ne dit pas « en route » (un mouvement ne se réécrit pas)', envoi.mouvements.every(m => !/en route/i.test(m.notes) && m.notes.includes('bon00001xyz')));
check('la variante est gardée (couleur Rouge)', envoi.mouvements.every(m => m.color === 'Rouge' && m.articleId === 'TAF'));
eq('la copie des sorties pour le bon', envoi.sorties.map(s => [s.ligne, s.locationCode, s.quantity]), [[0, 'A-01', 30], [0, 'A-02', 10]]);
check('la copie n’a aucun champ undefined (Firestore le refuse)', envoi.sorties.every(s => Object.values(s).every(v => v !== undefined)));
const apresEnvoi = [...journal, ...envoi.mouvements];
eq('stock CHRIFA (avec entrepôt) : 50 − 40', stockDe(apresEnvoi, 'CHRIFA', 'TAF') + stockDe(apresEnvoi, 'ENTREPOT', 'TAF'), 10);
eq('stock Derb Omar : rien tant que ce n’est pas reçu', stockDe(apresEnvoi, 'DERB', 'TAF'), 0);
eq('le rack A-01 est vide, A-02 garde 10 m', computeArticleLocationStock(apresEnvoi, 'CHRIFA', 'TAF', { dimension: 'color', value: 'Rouge' }, lieux).map(b => [b.locationCode, b.quantity]), [['A-02', 10]]);
const envoiDerb = mouvementsEnvoi({ bonId: 'bon2', items: [{ articleId: 'ZIP', categoryId: 'c2', productName: 'Zip', unitOfMeasure: 'pcs', sentQty: 12 }], depart: 'DERB', arrivee: 'IDAA', mouvements: journal, lieux, date: '2026-10-01' });
eq('Derb Omar envoie à Idaa : sortie sous DERB, sans emplacement connu', envoiDerb.mouvements.map(m => [m.storeId, m.quantity, m.locationCode ?? null]), [['DERB', 12, null]]);

const bon: BonTransfert = {
  id: 'bon00001xyz', fromStore: 'CHRIFA', toStore: 'DERB', status: 'EN_ROUTE', date: '2026-10-01T09:00:00.000Z',
  items, sortieAlEnvoi: true, sortiesEnvoi: envoi.sorties, mouvementsSortie: ['m1', 'm2'],
};

console.log('\n── Statut lisible ──');
eq('EN_ROUTE = En route', statutTransfert(bon).libelle, 'En route');
check('EN_ROUTE et PENDING sont « en route »', estEnRoute(bon) && estEnRoute({ ...bon, status: 'PENDING' }) && !estEnRoute({ ...bon, status: 'VALIDATED' }));
check('un nouveau bon n’est pas un « ancien bon en attente »', !estAncienBonEnAttente(bon) && !estAncienBonEnAttente({ ...bon, status: 'PENDING' }));
eq('ancien PENDING sans marqueur : signalé comme ancien', statutTransfert({ id: 'x', status: 'PENDING' } as any).libelle, 'En route (ancien bon)');
eq('ancien bon clos sans mouvement : « Clos »', statutTransfert({ id: 'x', status: 'CANCELLED', closSansMouvement: true } as any).libelle, 'Clos');
eq('VALIDATED = Reçu', statutTransfert({ ...bon, status: 'VALIDATED' }).libelle, 'Reçu');
eq('VALIDATED avec manquant', statutTransfert({ ...bon, status: 'VALIDATED', manquants: [{ articleId: 'TAF', productName: 'T', envoye: 40, recu: 38, manquant: 2 }] }).code, 'RECU_AVEC_MANQUANT');
eq('CANCELLED = Annulé', statutTransfert({ ...bon, status: 'CANCELLED' }).libelle, 'Annulé');
check('ancien VALIDATED sans marqueur : expliqué comme ancien parcours', /ancien/i.test(statutTransfert({ id: 'x', status: 'VALIDATED' } as any).aide));

console.log('\n── T3 : à réceptionner ──');
const bons: any[] = [
  { ...bon, id: 'b1', date: '2026-10-01' },
  { ...bon, id: 'b2', date: '2026-09-28', toStore: 'IDAA' },
  { ...bon, id: 'b3', date: '2026-09-29' },
  { ...bon, id: 'b4', status: 'VALIDATED' },
  { ...bon, id: 'b5', status: 'CANCELLED' },
];
eq('Derb Omar : ses bons en route, du plus ancien au plus récent', transfertsAReceptionner(bons, 'DERB').map(b => b.id), ['b3', 'b1']);
eq('l’admin en vue globale : tous les bons en route', transfertsAReceptionner(bons, null).map(b => b.id), ['b2', 'b3', 'b1']);
eq('l’admin sur Derb Omar : seulement ceux destinés à Derb Omar (comme le badge), pas ses envois sortants',
  transfertsAReceptionner([...bons, { ...bon, id: 'b6', fromStore: 'DERB', toStore: 'IDAA' }], 'DERB').map(b => b.id), ['b3', 'b1']);
eq('un magasin qui n’attend rien', transfertsAReceptionner(bons, 'CHRIFA').length, 0);
const ancienEnAttente = { id: 'ANC1', fromStore: 'CHRIFA', toStore: 'DERB', status: 'PENDING', date: '2026-09-10', items } as any;
eq('ancien bon PENDING : hors badge du magasin (il clignoterait sans fin)', transfertsAReceptionner([ancienEnAttente, bons[0]], 'DERB').map(b => b.id), ['b1']);
eq('… mais compté pour l’admin', transfertsAReceptionner([ancienEnAttente, bons[0]], 'DERB', { avecAnciens: true }).map(b => b.id), ['ANC1', 'b1']);
eq('le magasin d’arrivée peut réceptionner', raisonPasReception(bon, derb), null);
eq('mouvements pas encore chargés : réception grisée, avec la raison', raisonPasReception(bon, derb, { mouvementsCharges: false }), MESSAGE_MOUVEMENTS_EN_CHARGEMENT);
eq('… annulation aussi', raisonPasAnnulation(bon, chrifa, { mouvementsCharges: false }), MESSAGE_MOUVEMENTS_EN_CHARGEMENT);
check('… mais la lecture seule passe avant (la vraie raison)', /lecture seule/.test(raisonPasReception(bon, { ...derb, lectureSeule: true }, { mouvementsCharges: false }) || ''));
eq('l’admin aussi', raisonPasReception(bon, admin), null);
check('le départ ne réceptionne pas à la place de l’arrivée', raisonPasReception(bon, chrifa) !== null);
check('un compte en lecture seule non plus', raisonPasReception(bon, { ...derb, lectureSeule: true }) !== null);
check('un bon reçu ne se réceptionne pas deux fois', /déjà reçu/.test(raisonPasReception({ ...bon, status: 'VALIDATED' }, derb) || ''));

console.log('\n── T3 : quantités reçues ──');
eq('par défaut, reçu = envoyé : aucune erreur', erreurReception(items, {}), null);
eq('reçu = 38 : accepté', erreurReception(items, { 'TAF__color__Rouge': 38 }), null);
check('reçu > envoyé : refusé (la sortie vaut exactement l’envoyé)', /plus que ce qui est parti/.test(erreurReception(items, { 'TAF__color__Rouge': 41 }) || ''));
check('reçu négatif : refusé', erreurReception(items, { 'TAF__color__Rouge': -1 }) !== null);
eq('aucun manquant si tout est reçu', calculManquants(items, {}), []);
eq('manquant de 2,5 m', calculManquants(items, { 'TAF__color__Rouge': 37.5 }).map(m => [m.articleId, m.envoye, m.recu, m.manquant]), [['TAF', 40, 37.5, 2.5]]);
check('phrase du journal', /Perte au transport : TAFFETA \(Rouge\) 2.5 m/.test(phrasePerteTransport(calculManquants(items, { 'TAF__color__Rouge': 37.5 }))));

const entrees = mouvementsReception({ bon, recus: { 'TAF__color__Rouge': 37.5 }, libelleDepart: 'Chrifa', mouvements: apresEnvoi, date: '2026-10-02' });
eq('une seule entrée, de ce qui est reçu', entrees.map(m => [m.type, m.storeId, m.quantity]), [['IN', 'DERB', 37.5]]);
check('sous le nom du magasin d’ARRIVÉE (seule écriture permise à son compte)', entrees.every(m => m.storeId === 'DERB' && m.toStoreId === 'DERB' && m.fromStoreId === 'CHRIFA'));
check('aucune sortie PERTE à l’arrivée (déjà sortie au départ)', entrees.every(m => m.type === 'IN' && m.reason === 'TRANSFERT'));
const apresReception = [...apresEnvoi, ...entrees];
eq('Derb Omar reçoit 37,5 m', stockDe(apresReception, 'DERB', 'TAF'), 37.5);
eq('le départ n’est pas débité une seconde fois', stockDe(apresReception, 'CHRIFA', 'TAF') + stockDe(apresReception, 'ENTREPOT', 'TAF'), 10);
eq('le total du réseau baisse exactement du manquant (50 → 47,5)', stockDe(apresReception, 'CHRIFA', 'TAF') + stockDe(apresReception, 'ENTREPOT', 'TAF') + stockDe(apresReception, 'DERB', 'TAF'), 47.5);
eq('ligne reçue à 0 : aucun mouvement', mouvementsReception({ bon, recus: { 'TAF__color__Rouge': 0 }, mouvements: apresEnvoi, date: '2026-10-02' }).length, 0);
// Rangement à l'arrivée : là où la variante est déjà, si l'endroit est unique.
const derbRange = [...apresEnvoi, { articleId: 'TAF', type: 'IN', reason: 'ARRIVAGE', storeId: 'DERB', color: 'Rouge', locationCode: 'D-01', quantity: 5, date: '2026-09-01' }];
eq('rangé en D-01 où le Rouge est déjà', mouvementsReception({ bon, mouvements: derbRange, date: '2026-10-02' })[0].locationCode, 'D-01');

console.log('\n── T4 : annulation ──');
eq('PENDING marqué (bon d’un poste intermédiaire) : annulable comme EN_ROUTE', raisonPasAnnulation({ ...bon, status: 'PENDING' }, chrifa), null);
eq('le départ peut annuler un envoi en route', raisonPasAnnulation(bon, chrifa), null);
eq('l’admin aussi', raisonPasAnnulation(bon, admin), null);
check('l’arrivée ne peut pas annuler', raisonPasAnnulation(bon, derb) !== null);
check('un tiers non plus', raisonPasAnnulation(bon, idaa) !== null);
check('impossible une fois reçu', /ne s'annule plus/.test(raisonPasAnnulation({ ...bon, status: 'VALIDATED' }, chrifa) || ''));
check('impossible deux fois', /déjà annulé/.test(raisonPasAnnulation({ ...bon, status: 'CANCELLED' }, chrifa) || ''));
check('un ancien bon (sans copie des sorties) ne s’annule pas ici', raisonPasAnnulation({ ...bon, sortieAlEnvoi: undefined, sortiesEnvoi: undefined }, chrifa) !== null);
const retours = mouvementsAnnulation(bon, '2026-10-01');
eq('une entrée par sortie, mêmes emplacements et quantités', retours.map(m => [m.type, m.storeId, m.locationCode, m.quantity]), [['IN', 'CHRIFA', 'A-01', 30], ['IN', 'CHRIFA', 'A-02', 10]]);
check('même variante, même article réel', retours.every(m => m.articleId === 'TAF' && m.color === 'Rouge'));
check('sous le nom du DÉPART', retours.every(m => m.storeId === 'CHRIFA' && m.toStoreId === 'CHRIFA'));
check('aucun champ undefined', retours.every(m => Object.values(m).every(v => v !== undefined)));
const apresAnnulation = [...apresEnvoi, ...retours];
eq('le stock du départ revient exactement à 50', stockDe(apresAnnulation, 'CHRIFA', 'TAF') + stockDe(apresAnnulation, 'ENTREPOT', 'TAF'), 50);
eq('les racks reviennent à l’identique', computeArticleLocationStock(apresAnnulation, 'CHRIFA', 'TAF', { dimension: 'color', value: 'Rouge' }, lieux).map(b => [b.locationCode, b.quantity]), [['A-01', 30], ['A-02', 20]]);
eq('l’arrivée n’a rien', stockDe(apresAnnulation, 'DERB', 'TAF'), 0);

// Un emplacement renommé pendant que le bon est en route : le renommage réécrit le locationCode
// des mouvements (warehouse-locations-view), pas la copie figée sur le bon.
const sortiesRenommees = envoi.mouvements.map(m => ({ ...m, locationCode: m.locationCode === 'A-01' ? 'Z-09' : m.locationCode }));
const journalRenomme = [...journal.map(m => ({ ...m, locationCode: m.locationCode === 'A-01' ? 'Z-09' : m.locationCode })), ...sortiesRenommees];
const retoursRelus = mouvementsAnnulation(bon, '2026-10-01', sortiesRenommees);
eq('annulation après renommage : rendu au NOUVEAU nom du rack', retoursRelus.map(m => [m.locationCode, m.quantity]), [['Z-09', 30], ['A-02', 10]]);
eq('… et les racks reviennent juste (aucun rack fantôme A-01)',
  computeArticleLocationStock([...journalRenomme, ...retoursRelus], 'CHRIFA', 'TAF', { dimension: 'color', value: 'Rouge' }, lieux).map(b => [b.locationCode, b.quantity]).sort(),
  [['A-02', 20], ['Z-09', 30]]);
eq('une sortie supprimée du journal n’est pas rendue (elle ne retire plus rien)', mouvementsAnnulation(bon, '2026-10-01', [null, sortiesRenommees[1]]).map(m => [m.locationCode, m.quantity]), [['A-02', 10]]);
eq('un document qui n’est pas une sortie de ce bon est ignoré', mouvementsAnnulation(bon, '2026-10-01', [{ ...sortiesRenommees[0], transferOrderId: 'autre' }, sortiesRenommees[1]]).length, 1);
eq('sans relecture : la copie du bon sert', mouvementsAnnulation(bon, '2026-10-01').map(m => m.locationCode), ['A-01', 'A-02']);

console.log('\n── T5 : anciens bons, jamais deux sorties, jamais de PERTE à l’arrivée ──');
check('marqueur présent : sortie faite', sortieDejaFaite(bon, []));
eq('marqueur présent : rien à rattraper, même journal vide', lignesSansSortie(bon, []).length, 0);
// Ancien bon (avant le 15/09) : deux lignes, sorties écrites APRÈS le bon, une par ligne.
const ligneTaf = { articleId: 'TAF__color__Rouge', realArticleId: 'TAF', categoryId: 'c1', productName: 'TAFFETA', color: 'Rouge', unitOfMeasure: 'm', sentQty: 10 };
const ligneZip = { articleId: 'ZIP', categoryId: 'c2', productName: 'Zip', unitOfMeasure: 'pcs', sentQty: 4 };
const ancien = { id: 'ANCIEN123', fromStore: 'CHRIFA', toStore: 'DERB', status: 'PENDING', date: '2026-09-10', items: [ligneTaf, ligneZip] } as any;
const sortieTaf = { articleId: 'TAF', color: 'Rouge', type: 'OUT', reason: 'TRANSFERT', storeId: 'CHRIFA', toStoreId: 'DERB', notes: 'Bon de transfert ANCIEN123 vers Derb Omar', quantity: 10, date: '2026-09-10' };
const sortieZip = { articleId: 'ZIP', type: 'OUT', reason: 'TRANSFERT', storeId: 'CHRIFA', toStoreId: 'DERB', notes: 'Bon de transfert ANCIEN123 vers Derb Omar', quantity: 4, date: '2026-09-10' };
check('ancien PENDING dont toutes les sorties sont au journal : sortie faite', sortieDejaFaite(ancien, [sortieTaf, sortieZip]));
check('ancien PENDING sans aucune sortie retrouvée : pas faite', !sortieDejaFaite(ancien, [
  { type: 'IN', reason: 'TRANSFERT', storeId: 'DERB', notes: 'Bon de transfert ANCIEN123', quantity: 5, articleId: 'ZIP' },
  { type: 'OUT', reason: 'VENTE', storeId: 'CHRIFA', notes: 'ANCIEN123', quantity: 5, articleId: 'ZIP' },
]));
eq('détection LIGNE PAR LIGNE : seule la ligne 1 a sa sortie (écriture interrompue)', sortiesParLigne(ancien, [sortieTaf]).map(e => [e.ligne, e.dejaSorti, e.resteASortir]), [[0, 10, 0], [1, 0, 4]]);
check('… donc le bon n’est PAS considéré comme sorti en entier', !sortieDejaFaite(ancien, [sortieTaf]));
eq('une sortie n’est comptée qu’une fois, même pour deux lignes du même article', sortiesParLigne(
  { ...ancien, items: [{ ...ligneZip, sentQty: 4 }, { ...ligneZip, articleId: 'ZIP2', realArticleId: 'ZIP', sentQty: 4 }] },
  [sortieZip]).map(e => e.resteASortir), [0, 4]);
eq('sortie partielle : le reste seulement', sortiesParLigne(ancien, [{ ...sortieTaf, quantity: 6 }, sortieZip]).map(e => e.resteASortir), [4, 0]);
// Rattrapage : la sortie qui manque est écrite au DÉPART, jamais une PERTE à l'arrivée.
const journalAncien = [...journal, sortieTaf];
const rattrapage = mouvementsRattrapageSortie({ bon: ancien, libelleArrivee: 'Derb Omar', mouvements: journalAncien, lieux, date: '2026-10-01' });
eq('rattrapage : une sortie de 4 Zip, sous le nom du départ', rattrapage.map(m => [m.type, m.reason, m.storeId, m.articleId, m.quantity]), [['OUT', 'TRANSFERT', 'CHRIFA', 'ZIP', 4]]);
check('… liée au bon', rattrapage.every(m => m.transferOrderId === 'ANCIEN123'));
eq('rien à rattraper quand tout est au journal', mouvementsRattrapageSortie({ bon: ancien, mouvements: [...journal, sortieTaf, sortieZip], date: '2026-10-01' }).length, 0);
const entreesAncien = mouvementsReception({ bon: ancien, recus: { 'TAF__color__Rouge': 8 }, mouvements: journalAncien, date: '2026-10-01' });
check('réception d’un ancien bon : des ENTRÉES seulement, aucune PERTE', entreesAncien.every(m => m.type === 'IN' && m.storeId === 'DERB'));
const apresAncien = [...journalAncien, ...rattrapage, ...entreesAncien];
eq('Derb Omar reçoit 8 m (pas 8 − 2)', stockDe(apresAncien, 'DERB', 'TAF'), 8);
eq('le départ perd les 10 m une seule fois', stockDe(apresAncien, 'CHRIFA', 'TAF') + stockDe(apresAncien, 'ENTREPOT', 'TAF'), 40);
eq('le Zip sort du départ (il n’y était jamais sorti)…', stockDe(apresAncien, 'CHRIFA', 'ZIP'), -4);
eq('… et entre à l’arrivée : le réseau garde ses 100 Zip', stockDe(apresAncien, 'DERB', 'ZIP') + stockDe(apresAncien, 'CHRIFA', 'ZIP'), 100);
// Qui peut réceptionner un ancien bon.
eq('ancien bon complet : le magasin d’arrivée peut le réceptionner', raisonPasReception(ancien, derb, { mouvements: [sortieTaf, sortieZip] }), null);
check('ancien bon sans sa sortie : le magasin d’arrivée ne peut pas (il n’écrit pas chez le départ)',
  /administrateur/.test(raisonPasReception(ancien, derb, { mouvements: [sortieTaf] }) || ''));
eq('… l’admin, si', raisonPasReception(ancien, admin, { mouvements: [sortieTaf] }), null);
// Clore sans mouvement.
eq('l’admin peut clore un ancien bon', raisonPasClore(ancien, admin), null);
check('un magasin ne le peut pas', raisonPasClore(ancien, derb) !== null);
check('un bon du nouveau parcours ne se clôt pas (il s’annule)', raisonPasClore(bon, admin) !== null);
check('un ancien bon déjà reçu non plus', raisonPasClore({ ...ancien, status: 'VALIDATED' }, admin) !== null);

console.log('\n── Variante d’une ligne ──');
eq('lue dans l’id virtuel', varianteDeLigne({ articleId: 'X__quality__CL-5' }), { dimension: 'quality', value: 'CL-5' });
eq('article simple : aucune', varianteDeLigne({ articleId: 'X' }), null);

console.log('\n── T6 : le bon imprimé ──');
const html = construireBonTransfertHtml({ bon, nomDepart: 'Chrifa', nomArrivee: 'Derb Omar', logo: 'data:image/png;base64,AAAA' });
check('numéro', html.includes('BT-BON00001'));
check('trajet départ → arrivée', html.includes('Chrifa') && html.includes('Derb Omar') && html.includes('→'));
check('statut En route', html.includes('En route'));
check('ligne : produit, couleur, quantité', html.includes('TAFFETA') && html.includes('Rouge') && html.includes('40'));
check('zone « Reçu par / date / signature »', html.includes('Reçu par') && html.includes('Date :') && html.includes('Signature :'));
check('charte : bleu nuit, or, bandeau de pied, logo', html.includes('#0f172a') && html.includes('#c4a062') && html.includes('class="bandeau"') && html.includes('<img src="data:image/png'));
check('aucun prix', !/MAD|prix/i.test(html));
const htmlRecu = construireBonTransfertHtml({ bon: { ...bon, status: 'VALIDATED', items: [{ ...items[0], receivedQty: 37.5 }], manquants: calculManquants(items, { 'TAF__color__Rouge': 37.5 }) } });
check('bon reçu : quantité reçue et manquant imprimés', htmlRecu.includes('37,5') && htmlRecu.includes('perte au transport'));
const htmlPiege = construireBonTransfertHtml({ bon: { ...bon, items: [{ ...items[0], productName: 'A <b>&</b>' }] } });
check('nom de produit échappé', htmlPiege.includes('A &lt;b&gt;&amp;&lt;/b&gt;'));

console.log(`\n${pass} réussi(s), ${fail} échoué(s)`);
if (fail > 0) process.exit(1);
