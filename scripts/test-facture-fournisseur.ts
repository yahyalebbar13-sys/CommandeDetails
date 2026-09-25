// Tests de la lecture des factures fournisseur (INV + PL) et du passage en transit.
// Lancer :
//   npx tsx scripts/test-facture-fournisseur.ts

import * as XLSX from 'xlsx';
import { detecterFormat, lireClasseurFacture, lireNombre, lireTexteColle } from '../src/lib/facture-fournisseur';
import {
  articlesCandidats, choisirConversion, construirePlan, conversionsPossibles, ecritures, proposer,
} from '../src/lib/rapprochement-facture';

let pass = 0;
let fail = 0;
function check(label: string, ok: boolean, detail = '') {
  if (ok) { pass++; console.log(`  ✓ ${label}`); }
  else { fail++; console.log(`  ✗ ${label} ${detail}`); }
}
const proche = (a: number | null | undefined, b: number, e = 1e-6) => a != null && Math.abs(a - b) <= e;

console.log('\n── Nombres ──');
check('format français détecté', detecterFormat(['420,00', '1.000,00', '0,05']) === 'eu');
check('format anglais détecté', detecterFormat(['18,530.40', '0.315', '12.4']) === 'us');
check('1.000,00 (fr)', lireNombre('1.000,00', 'eu') === 1000);
check('1.272 (fr) = milliers', lireNombre('1.272', 'eu') === 1272);
check('0.315 (fr) reste décimal', lireNombre('0.315', 'eu') === 0.315);
check('18,530.40 (en)', lireNombre('18,530.40', 'us') === 18530.4);
check('USD27,744.18', lireNombre('USD27,744.18', 'us') === 27744.18);
check('vide → null', lireNombre(' ', 'us') === null && lireNombre('pcs.', 'us') === null);

console.log('\n── Tableau collé (packing list, Excel français) ──');
const T = '\t';
const ligne = (desc: string, qte = '', unite = '', colis = '', nw = '', gw = '', cbm = '') =>
  [desc, '', '', '', '', qte, unite, colis, nw, gw, cbm].join(T);
const colle = [
  ['DESCRIPTION OF GOODS', '', '', '', '', 'QUANTITY', '', 'PKG.', 'N.W.', 'G.W.', 'MEAS.'].join(T),
  ['', '', '', '', '', '', '', '(PKG)', '(KGS)', '(KGS)', '(CBM)'].join(T),
  ligne('43-24 13# No.5 A/L Slider with Decorative Puller for Plastic Zipper 4.3g/pc'),
  ligne('6573-5140  500pcs/bag 10bags/carton ', '102000', 'pcs.', '21', '451,50', '457,80', '0,31'),
  ligne('43-51 28# No.5 A/L Slider with Decorative Puller for Nylon Zipper 5g/pc'),
  ligne('6570-5216  500pcs/bag 10bags/carton ', '202000', 'pcs.', '40', '1.000,00', '1.052,00', '0,66'),
  ligne('6570-5216B  500pcs/bag 10bags/carton ', '50000', 'pcs.', '10', '250,00', '263,00', '0,17'),
  ligne('43-26 14# No.5 Semi-auto Lock Slider for Nylon Zipper'),
  ligne('6570-5254  500pcs/bag 10bags/carton ', ' ', 'pcs.', '11', '187,00', '200,20', '0,23'),
  ['', '', '', '', '', 'TOTAL:', '', '82', '1.888,50', '1.973,00', '1,37'].join(T),
].join('\r\n');
const lc = lireTexteColle(colle);
check('4 lignes détail', lc.lignes.length === 4, `→ ${lc.lignes.length}`);
check('référence et code', lc.lignes[1].ref === '43-51' && lc.lignes[1].code === '6570-5216');
check('titre sans la référence', lc.lignes[0].titre.startsWith('13# No.5 A/L Slider'));
check('spec', lc.lignes[2].spec === '500pcs/bag 10bags/carton');
check('poids 1.000,00 → 1000', lc.lignes[1].poidsNet === 1000);
check('volume 0,31', proche(lc.lignes[0].volume, 0.31));
check('quantité manquante → null + avertissement', lc.lignes[3].quantite === null && lc.avertissements.some(a => /sans quantité/.test(a)));
check('totaux du packing list', lc.totaux.colis === 82 && proche(lc.totaux.poidsNet, 1888.5) && proche(lc.totaux.volume, 1.37));
check('pas de prix, des poids', !lc.aLesPrix && lc.aLesPoids);

console.log('\n── Classeur INV + PL (+ copie « INV (2) » ignorée) ──');
const entete = (ordre: string) => [
  [], [null, 'NINGBO MH INDUSTRY CO.,LTD', null, null, null, null, null, null, 'INVOICE NO:', '26MH999001'],
  [null, 'MH Bldg.', null, null, null, null, null, null, 'ORDER NO:', ordre],
  [null, null, null, null, null, null, null, null, 'DATE:', '25-JUN-26'],
];
const inv = [
  ...entete('YAHI-99'),
  [null, 'DESCRIPTION OF GOODS', null, null, null, null, 'QUANTITY', null, 'UNIT PRICE', 'AMOUNT'],
  [null, null, null, null, null, null, null, null, '(USD)', '(USD)'],
  [null, '38-1 Non-woven Interlining Fabric 1030EF 25g+7g/m2 36" white'],
  [null, '6402-1037 36",white 90Y/roll 6rolls/sack bag', null, null, null, null, 3309, 'rolls', 5.6, 18530.4],
  [null, '38-2 Knitting Elastic Tape'],
  [null, '6122-0663 25mm,white 25m/roll', null, null, null, null, 244, 'kg', 1.82, 444.08],
  [null, '6122-0664 30mm,white 25m/roll', null, null, null, null, 951.6, 'kg', 1.82, 1731.912],
  [null, 'ELSE FEE'],
  [null, 'FREIGHT CHARGE', null, null, null, null, null, null, null, 7650],
  [null, 'TOTAL AMOUNT:', null, null, null, null, null, null, null, 'USD28,356.39'],
];
const pl = [
  ...entete('YAHI-99'),
  [null, null, 'DESCRIPTION OF GOODS', null, null, null, null, 'QUANTITY', null, 'PKG.', 'N.W.', 'G.W.', 'MEAS.'],
  [null, null, null, null, null, null, null, null, null, '(PKG)', '(KGS)', '(KGS)', '(CBM)'],
  [null, null, '38-1 Non-woven Interlining Fabric 1030EF 25g+7g/m2 36" white'],
  [null, null, '6402-1037 36",white 90Y/roll 6rolls/sack bag', null, null, null, null, 3309, 'rolls', 684, 10260, 11046.6, 62.6],
  [null, null, '38-2 Knitting Elastic Tape'],
  [null, null, '6122-0663 25mm,white 25m/roll', null, null, null, null, 244, 'kg', 10, 244, 250, 0.64],
  [null, null, '6122-0664 30mm,white 25m/roll', null, null, null, null, 951.6, 'kg', 40, 951.6, 980, 2.56],
  [null, null, null, null, null, null, null, 'TOTAL:', null, 734, 11455.6, 12276.6, 65.8],
];
const faux = inv.map(r => r.map(c => (typeof c === 'number' ? c * 0.5 : c)));
const wb = XLSX.utils.book_new();
XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(inv), 'INV');
XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(faux), 'INV (2)');
XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(pl), 'PL');
const lx = lireClasseurFacture(wb, XLSX.utils);
check('n° de facture, commande, date', lx.numeroFacture === '26MH999001' && lx.numeroCommande === 'YAHI-99' && lx.dateFacture === '25-JUN-26');
check('fournisseur', /MH INDUSTRY/.test(lx.fournisseur));
check('3 lignes, prix et poids fusionnés', lx.lignes.length === 3 && lx.lignes[0].prixUnitaire === 5.6 && lx.lignes[0].poidsNet === 10260 && proche(lx.lignes[0].volume, 62.6));
check('la copie « INV (2) » est ignorée', lx.lignes[1].prixUnitaire === 1.82);
check('fret', lx.fret === 7650);
check('total facture', proche(lx.totaux.montant, 28356.39));
check('totaux cohérents : pas d’avertissement', lx.avertissements.length === 0, JSON.stringify(lx.avertissements));

console.log('\n── Unités ──');
const lg = (unite: string, quantite: number, spec = '', prixUnitaire: number | null = null) =>
  ({ index: 0, ref: '', titre: '', code: '', spec, quantite, unite, prixUnitaire, montant: null, colis: null, poidsNet: null, poidsBrut: null, volume: null });
check('pcs. = pièces', choisirConversion([lg('pcs.', 10)], { unitOfMeasure: 'pièces', quantity: 10 })?.nature === 'meme');
check('box = bag', choisirConversion([lg('Box', 10)], { unitOfMeasure: 'bag', quantity: 10 })?.facteur === 1);
check('roll → yds par 90Y/roll', proche(choisirConversion([lg('rolls', 100, '90Y/roll')], { unitOfMeasure: 'yds', quantity: 9000 })?.facteur ?? 0, 90));
check('roll → m : la fiche a compté le yard comme un mètre', choisirConversion([lg('rolls', 169, '100Y/ROLL')], { unitOfMeasure: 'm', quantity: 16900 })?.nature === 'usage');
check('roll → m : conversion exacte si la fiche est en vrais mètres', proche(choisirConversion([lg('rolls', 169, '100Y/ROLL')], { unitOfMeasure: 'm', quantity: 15453 })?.facteur ?? 0, 91.44));
check('gross → bag par 10gross/bag', proche(choisirConversion([lg('gross', 2990, '10gross/bag')], { unitOfMeasure: 'bag', quantity: 299 })?.facteur ?? 0, 0.1));
check('même chiffre malgré l’unité (1000 rolls = 1000 pièces)', choisirConversion([lg('rolls', 1000)], { unitOfMeasure: 'pièces', quantity: 1000 })?.nature === 'brute');
check('unités sans rapport → null', choisirConversion([lg('kg', 244)], { unitOfMeasure: 'pièces', quantity: 50000 }) === null);
check('yd → m exact proposé', conversionsPossibles('yds', 'm').some(c => proche(c.facteur, 0.9144)));

console.log('\n── Rapprochement ──');
const DOSSIER = { id: '26MH999001', supplierId: 'MH', arrivalDate: '2026-11-09', freightCost: 5200 };
const art = (id: string, o: any) => ({ id, supplierId: 'MH', status: 'PI', unitOfMeasure: 'pièces', ...o });
const articles = [
  art('nylon5', { name: 'A/L SLIDER FOR NYLON ZIPPER', size: 'NO5', color: 'black', quantity: 200000, purchasePricePerUnit: 0.0281 }),
  art('plast5', { name: 'A/L SLIDER FOR PLASTIC ZIPPER', size: 'NO5', color: 'black', quantity: 100000, purchasePricePerUnit: 0.0288 }),
  art('plast5b', { name: 'A/L SLIDER FOR PLASTIC ZIPPER', size: 'NO5', color: 'black', quantity: 100000, purchasePricePerUnit: 0.0304, colorBreakdown: [{ colorCode: 'black', rolls: 100000 }] }),
  art('nylon8', { name: 'N/L SLIDER FOR NYLON ZIPPER', size: 'NO8', color: 'black', quantity: 100000, purchasePricePerUnit: 0.0375, clientName: 'ADIL' }),
  art('semi', { name: 'SEMI A/L SLIDER FOR NYLON ZIPPER', size: 'NO5', color: 'black', quantity: 51500, purchasePricePerUnit: 0.0281, status: 'SHIPPED', factureId: DOSSIER.id, netWeight: 187, cubicMeasurement: 0.23 }),
  art('elast', { name: 'KNITTING ELASTIC TAPE', size: '25-30MM', color: 'white', quantity: 1195.6, unitOfMeasure: 'kg', purchasePricePerUnit: 1.82, sizeBreakdown: [{ size: '25MM', quantity: 244 }, { size: '30MM', quantity: 951.6 }] }),
  art('autre', { name: 'A/L SLIDER FOR NYLON ZIPPER', size: 'NO5', color: 'black', quantity: 50000, purchasePricePerUnit: 0.03, supplierId: 'JIMMY' }),
  art('stock', { name: 'A/L SLIDER FOR PLASTIC ZIPPER', size: 'NO5', quantity: 50000, purchasePricePerUnit: 0.0288, status: 'SHIPPED', factureId: 'AUTRE' }),
];
const candidats = articlesCandidats(articles, DOSSIER);
check('candidats : PI du fournisseur + articles du dossier', candidats.map(a => a.id).sort().join() === 'elast,nylon5,nylon8,plast5,plast5b,semi', candidats.map(a => a.id).join());

const facture = {
  ...lx,
  numeroFacture: DOSSIER.id,
  lignes: [
    { ...lg('pcs.', 101500, '500pcs/bag 10bags/carton', 0.0288), index: 0, ref: '43-24', titre: '13# No.5 A/L Slider with Decorative Puller for Plastic Zipper 4.3g/pc', code: '6573-5140', montant: 2923.2, poidsNet: 451.5, volume: 0.31 },
    { ...lg('pcs.', 100500, '500pcs/bag 10bags/carton', 0.0304), index: 1, ref: '43-57', titre: '30# No.5 A/L Slider with Decorative Puller for Plastic Zipper 4.27g/pc', code: '6573-5081', montant: 3055.2, poidsNet: 420, volume: 0.26 },
    { ...lg('pcs.', 100000, '500pcs/bag 10bags/carton', 0.0281), index: 2, ref: '43-51', titre: '28# No.5 A/L Slider with Decorative Puller for Nylon Zipper 5g/pc', code: '6570-5216', montant: 2810, poidsNet: 500, volume: 0.33 },
    { ...lg('pcs.', 100000, '500pcs/bag 10bags/carton', 0.0375), index: 3, ref: '43-62', titre: '32-2# No.8 N/L Slider with Decorative Puller for Nylon Zipper 4.8G/PC', code: '6570-0823', montant: 3750, poidsNet: 480, volume: 0.33 },
    { ...lg('pcs.', 51500, '500pcs/bag 10bags/carton', 0.0281), index: 4, ref: '43-26', titre: '14# No.5 Semi-auto Lock Slider for Nylon Zipper', code: '6570-5254', montant: 1447.15, poidsNet: 187, volume: 0.23 },
    { ...lg('kg', 244, '25mm,white 25m/roll', 1.82), index: 5, ref: '38-2', titre: 'Knitting Elastic Tape', code: '6122-0663', montant: 444.08, poidsNet: 244, volume: 0.64 },
    { ...lg('kg', 951.6, '30mm,white 25m/roll', 1.82), index: 6, ref: '38-2', titre: 'Knitting Elastic Tape', code: '6122-0664', montant: 1731.912, poidsNet: 951.6, volume: 2.56 },
    { ...lg('piece', 150, '240*60cm 12pcs/carton'), index: 7, ref: '005-1', titre: 'PU Stone', code: '410-117', poidsNet: 420, volume: 6.92 },
  ],
  fret: 7650,
};
const props = proposer(facture, candidats, DOSSIER.id);
const pour = (i: number) => props[i].articleId;
check('plastique 0,0288 $ → plast5', pour(0) === 'plast5', `→ ${pour(0)}`);
check('plastique 0,0304 $ → plast5b (le prix départage)', pour(1) === 'plast5b', `→ ${pour(1)}`);
check('nylon No.5 → nylon5 (partiel)', pour(2) === 'nylon5', `→ ${pour(2)}`);
check('N/L No.8 → nylon8', pour(3) === 'nylon8', `→ ${pour(3)}`);
check('semi-auto déjà au dossier (mêmes poids et volume) → semi', pour(4) === 'semi' && props[4].confiance === 'sure', `→ ${pour(4)} ${props[4].confiance}`);
check('élastique : deux largeurs regroupées sur un article', pour(5) === 'elast' && pour(6) === 'elast' && (props[5].groupe || props[6].groupe));
check('PU Stone : aucun article', pour(7) === null && props[7].confiance === 'aucune');

console.log('\n── Plan et écritures ──');
const choix = Object.fromEntries(props.map(p => [p.index, p.articleId]));
const plan = construirePlan(facture, choix, candidats, DOSSIER.id, { appliquerPrix: true });
const P = (id: string) => plan.articles.find(p => p.article.id === id)!;
check('une ligne ignorée', plan.ignorees.length === 1);
check('plast5 : tout passe, quantité 101 500', P('plast5').mode === 'solde' && P('plast5').quantite === 101500 && P('plast5').majQuantite);
check('nylon5 : partiel proposé (100 000 sur 200 000)', P('nylon5').mode === 'partiel' && P('nylon5').reste === 100000);
check('semi : mise à jour du dossier', P('semi').mode === 'maj');
check('élastique : quantité gardée (réparti), poids cumulés', P('elast').quantite === 1195.6 && !P('elast').majQuantite && P('elast').poidsNet === 1195.6);

let n = 0;
const ops = ecritures(plan.articles, {
  dossier: DOSSIER, maintenant: 'HORODATAGE', nouvelId: () => `neuf-${++n}`, appliquerPrix: true,
  lecture: facture, nomFichier: 'test.xlsx', majFret: true,
});
const op = (id: string) => ops.filter(o => o.id === id);
const plast = op('plast5')[0].data;
check('transit : statut, dossier, date, horodatage', plast.status === 'SHIPPED' && plast.factureId === DOSSIER.id && plast.arrivalDate === '2026-11-09' && plast.validatedAt === 'HORODATAGE');
check('transit : poids et volume de la ligne', plast.netWeight === 451.5 && plast.cubicMeasurement === 0.31);
check('transit : quantité et trace de la ligne', plast.quantity === 101500 && plast.refFactureFournisseur === '43-24 6573-5140' && plast.codeFournisseur === '6573-5140');
check('prix identique : pas réécrit', !('purchasePricePerUnit' in plast));
const plastB = op('plast5b')[0].data;
check('répartition à une ligne suit la quantité', plastB.quantity === 100500 && plastB.colorBreakdown?.[0]?.rolls === 100500, JSON.stringify(plastB));
const neuf = op('neuf-1')[0];
check('partiel : nouvel article en transit', neuf?.op === 'set' && neuf.data.quantity === 100000 && neuf.data.status === 'SHIPPED' && neuf.data.originalOrderId === 'nylon5' && neuf.data.clientName === undefined);
const reste = op('nylon5')[0].data;
check('partiel : l’original garde le reste en production', reste.quantity === 100000 && reste.originalOrderId === 'nylon5' && !('status' in reste) && !('factureId' in reste));
const semi = op('semi')[0].data;
check('déjà à jour : rien que la trace', Object.keys(semi).sort().join() === 'codeFournisseur,refFactureFournisseur', Object.keys(semi).join());
const elast = op('elast')[0].data;
check('élastique : quantité intacte, répartition intacte', !('quantity' in elast) && !('sizeBreakdown' in elast) && elast.netWeight === 1195.6);
const dossierOp = ops.find(o => o.collection === 'factures')!;
check('dossier : fret et trace de l’import', dossierOp.data.freightCost === 7650 && dossierOp.data.importFactureFournisseur.fichier === 'test.xlsx');

console.log('\n── Garde-fous ──');
const partielSurDossier = construirePlan(
  { ...facture, lignes: [{ ...facture.lignes[4], quantite: 20000, poidsNet: 70, volume: 0.1 }] },
  { 4: 'semi' }, candidats, DOSSIER.id, { appliquerPrix: true },
);
const pd = partielSurDossier.articles[0];
check('article du dossier à moitié couvert : fiche laissée telle quelle', pd.mode === 'maj' && !pd.majQuantite && !pd.majPoidsNet && !pd.majVolume);

// Un document sans packing list n'efface pas les poids (jamais 0 à la place).
const sansPL = { ...facture, aLesPoids: false, lignes: facture.lignes.map(l => ({ ...l, poidsNet: null, volume: null })) };
const planSansPL = construirePlan(sansPL, { 0: 'plast5', 4: 'semi' }, candidats, DOSSIER.id, { appliquerPrix: true });
const opsSansPL = ecritures(planSansPL.articles, { dossier: DOSSIER, maintenant: 0, nouvelId: () => 'x', appliquerPrix: true, lecture: sansPL, nomFichier: '', majFret: false });
check('sans packing list : pas de netWeight/cubicMeasurement écrits', opsSansPL.filter(o => o.collection === 'articles').every(o => !('netWeight' in o.data) && !('cubicMeasurement' in o.data)), JSON.stringify(opsSansPL.map(o => o.data)));
check('sans packing list : l’article passe quand même', opsSansPL.find(o => o.id === 'plast5')?.data.status === 'SHIPPED');

// Déjà au dossier : grand écart de quantité → quantité gardée (±2 % seulement).
const grandEcart = construirePlan({ ...facture, lignes: [{ ...facture.lignes[4], quantite: 58000 }] }, { 4: 'semi' }, candidats, DOSSIER.id, { appliquerPrix: true });
check('déjà au dossier, +12,6 % : quantité non réécrite', grandEcart.articles[0].mode === 'maj' && !grandEcart.articles[0].majQuantite);
const petitEcart = construirePlan({ ...facture, lignes: [{ ...facture.lignes[4], quantite: 52000 }] }, { 4: 'semi' }, candidats, DOSSIER.id, { appliquerPrix: true });
check('déjà au dossier, +1 % : quantité corrigée', petitEcart.articles[0].majQuantite);

// Partiel sur un article réparti en couleurs : hors import tant qu'on ne force pas.
const couleurs = art('coul', { name: 'A/L SLIDER FOR NYLON ZIPPER', size: 'NO5', quantity: 100000, purchasePricePerUnit: 0.03, colorBreakdown: [1, 2, 3, 4, 5].map(i => ({ colorCode: `C${i}`, rolls: 20000 })) });
const ligneCouleurs = { ...facture.lignes[2], quantite: 40000, prixUnitaire: 0.03, montant: 1200 };
const planCouleurs = construirePlan({ ...facture, lignes: [ligneCouleurs] }, { 2: 'coul' }, [couleurs], DOSSIER.id, { appliquerPrix: true });
check('répartition + partiel : bloqué', planCouleurs.articles[0].bloque && planCouleurs.articles[0].partielReparti);
const opsCouleurs = ecritures(planCouleurs.articles, { dossier: DOSSIER, maintenant: 0, nouvelId: () => 'x', appliquerPrix: true, lecture: facture, nomFichier: '', majFret: false });
check('répartition + partiel : aucune écriture sur l’article', !opsCouleurs.some(o => o.id === 'coul'));
const planForce = construirePlan({ ...facture, lignes: [ligneCouleurs] }, { 2: 'coul' }, [couleurs], DOSSIER.id, { appliquerPrix: true, forces: { coul: true } });
check('répartition + partiel forcé : passe', !planForce.articles[0].bloque);

// Le modèle du catalogue (designRef) départage deux curseurs identiques sans prix.
const jumeaux = [
  art('j1', { name: 'A/L SLIDER FOR NYLON ZIPPER', size: 'NO5', color: 'black', quantity: 50000, purchasePricePerUnit: 0.03, designRef: '6573-5117' }),
  art('j2', { name: 'A/L SLIDER FOR NYLON ZIPPER', size: 'NO5', color: 'black', quantity: 50000, purchasePricePerUnit: 0.03, designRef: '6572-0081' }),
];
const sansPrix = { ...lx, lignes: [{ ...lg('pcs.', 50000, '500pcs/bag 10bags/carton'), index: 0, ref: '43-32', titre: '17# No.5 A/L Slider with Decorative Puller for Nylon Zipper', code: '6572-0081B', poidsNet: 195, volume: 0.13 }] };
const pj = proposer(sansPrix, jumeaux, DOSSIER.id);
check('designRef départage les jumeaux', pj[0].articleId === 'j2', `→ ${pj[0].articleId}`);
// Un code de modèle différent ne pénalise pas (le fournisseur livre parfois un autre code).
check('modèle différent : pas de pénalité', (pj[0].classement.find(e => e.articleId === 'j1')?.raisons || []).every(r => !/code/.test(r)));

// Le code n'est noté sur la fiche que pour un rapprochement fiable.
const planDouteux = construirePlan(facture, { 0: 'plast5' }, candidats, DOSSIER.id, { appliquerPrix: true, fiables: new Set() });
const opsDouteux = ecritures(planDouteux.articles, { dossier: DOSSIER, maintenant: 0, nouvelId: () => 'x', appliquerPrix: true, lecture: facture, nomFichier: '', majFret: false });
check('rapprochement non fiable : pas de codeFournisseur', !('codeFournisseur' in opsDouteux[0].data));

// Montant ≠ quantité × prix : prix d'achat laissé tel quel.
const douteux = construirePlan({ ...facture, lignes: [{ ...facture.lignes[1], montant: 5000 }] }, { 1: 'plast5b' }, candidats, DOSSIER.id, { appliquerPrix: true });
check('montant incohérent : pas de prix', douteux.articles[0].prix === null);

// Unité ambiguë (yard réel ou compté comme un mètre) et expédition partielle : bloqué.
const tissu = art('tissu', { name: 'POLYESTER FABRIC', quantity: 1000, unitOfMeasure: 'm', purchasePricePerUnit: 0.5 });
const ligneTissu = { ...lg('yds', 500, '100Y/roll'), index: 0, titre: 'Polyester Fabric', poidsNet: 11, volume: 0.1 };
const planTissu = construirePlan({ ...lx, lignes: [ligneTissu] }, { 0: 'tissu' }, [tissu], DOSSIER.id, { appliquerPrix: true });
check('unité ambiguë + partiel : bloqué', planTissu.articles[0].bloque, JSON.stringify(planTissu.articles[0].avertissements));

// Dossier dont le fournisseur n'a aucun article en attente : pas de propositions chez les autres.
const autreDossier = { id: 'JR0001', supplierId: 'JASON' };
check('fournisseur sans article : candidats stricts vides', articlesCandidats(articles, autreDossier).length === 0);
check('fournisseur sans article : liste à la main élargie', articlesCandidats(articles, autreDossier, true).length > 0);

console.log('\n── Lecture : cas limites ──');
// Quantité absente d'un côté : la fusion INV/PL se fait quand même (par position).
const plSansQte = pl.map(r => [...r]);
plSansQte[entete('x').length + 3][7] = null;
const wb2 = XLSX.utils.book_new();
XLSX.utils.book_append_sheet(wb2, XLSX.utils.aoa_to_sheet(inv), 'INV');
XLSX.utils.book_append_sheet(wb2, XLSX.utils.aoa_to_sheet(plSansQte), 'PL');
const lx2 = lireClasseurFacture(wb2, XLSX.utils);
check('quantité absente du PL : poids gardés', lx2.lignes[0].poidsNet === 10260 && lx2.lignes[0].quantite === 3309);
// Libellés de total variés, frets multiples.
const inv3 = inv.map(r => [...r]);
inv3[inv3.length - 1][1] = 'GRAND TOTAL :';
inv3.splice(inv3.length - 1, 0, [null, 'SEA FREIGHT', null, null, null, null, null, null, null, 100]);
const wb3 = XLSX.utils.book_new();
XLSX.utils.book_append_sheet(wb3, XLSX.utils.aoa_to_sheet(inv3), 'INV');
const lx3 = lireClasseurFacture(wb3, XLSX.utils);
check('« GRAND TOTAL : » reconnu, pas de ligne fantôme', lx3.lignes.length === 3 && proche(lx3.totaux.montant, 28356.39));
check('deux frets : somme + avertissement', lx3.fret === 7750 && lx3.frets.length === 2 && lx3.avertissements.some(a => /fret/.test(a)));
// Format YAHI : message explicite.
const yahi = XLSX.utils.book_new();
XLSX.utils.book_append_sheet(yahi, XLSX.utils.aoa_to_sheet([[null, 'ORDER NO.', 'ITEM NO.', 'DESCRIPTION OF GOODS', null, 'QUANTITY', 'UNIT PRICE', 'AMOUNT']]), 'Sheet1');
check('format YAHI : message explicite', /YAHI/.test(lireClasseurFacture(yahi, XLSX.utils).avertissements[0] || ''));
// En-têtes avec unité dans la cellule.
const plUnites = pl.map(r => [...r]);
plUnites[entete('x').length] = [null, null, 'DESCRIPTION OF GOODS', null, null, null, null, 'QUANTITY', null, 'PKG.', 'N.W. (KGS)', 'G.W. (KGS)', 'MEAS.(CBM)'];
const wb4 = XLSX.utils.book_new();
XLSX.utils.book_append_sheet(wb4, XLSX.utils.aoa_to_sheet(plUnites), 'PL');
check('« N.W. (KGS) » reconnu comme poids', lireClasseurFacture(wb4, XLSX.utils).aLesPoids);
check('« 1,600 » seul ne décide pas du format', detecterFormat(['1,600', '0.315']) === 'us' && detecterFormat(['1.600', '420,50']) === 'eu');
check('totaux incohérents signalés', lireTexteColle(colle.replace('1.888,50', '1.999,00')).totauxIncoherents);
const gratuit = construirePlan(
  { ...facture, lignes: [{ ...facture.lignes[0], prixUnitaire: 0, montant: 0 }] },
  { 0: 'plast5' }, candidats, DOSSIER.id, { appliquerPrix: true },
);
const opsGratuit = ecritures(gratuit.articles, { dossier: DOSSIER, maintenant: 0, nouvelId: () => 'x', appliquerPrix: true, lecture: facture, nomFichier: '', majFret: false });
check('prix nul sur la facture : prix gardé', !('purchasePricePerUnit' in opsGratuit[0].data));
check('fret non coché : dossier sans fret', !('freightCost' in opsGratuit[opsGratuit.length - 1].data));
const enrichi = { ...articles[0], id: 'enr', effectiveStatus: 'PI', rawStatus: 'PI' };
const opsEnrichi = ecritures(
  construirePlan({ ...facture, lignes: [facture.lignes[2]] }, { 2: 'enr' }, [enrichi], DOSSIER.id, { appliquerPrix: false, modes: { enr: 'partiel' } }).articles,
  { dossier: DOSSIER, maintenant: 0, nouvelId: () => 'copie', appliquerPrix: false, lecture: facture, nomFichier: '', majFret: false },
);
const copie = opsEnrichi.find(o => o.id === 'copie')!;
check('copie partielle sans les champs calculés', !('effectiveStatus' in copie.data) && !('rawStatus' in copie.data));

console.log(`\n${pass} ok, ${fail} échec${fail > 1 ? 's' : ''}`);
if (fail) process.exit(1);
