// Les étagères de CHRIFA (décisions du patron, 01/10/2026) : un second stock du magasin principal,
// sans couleur, compté à l'unité de vente du pôle. Leurs mouvements ne doivent JAMAIS toucher la
// réserve — en particulier, un mouvement sans couleur sur un article ventilé par couleur est
// réparti au prorata sur toutes les couleurs de la réserve : un mouvement d'étagère doit être
// écarté avant. Et la ligne « Étagères » ne doit jamais se fondre dans une ligne de réserve.
// Lancer :
//   npx tsx scripts/test-etageres.ts

import { computeStockItems } from '../src/components/stock/stock-app';
import { disponibleDepuis, disponibleSurEtageres } from '../src/lib/stock-disponible';
import {
  cleEtagere, estLigneEtagere, lignesDeReserve, lignesDesEtageres, magasinDesEtageres,
  produitsDesEtageres, ajustementEtagere,
} from '../src/lib/etageres';
import {
  lignesEntreeManquantes, computeLocationOccupancy, computeArticleLocationStock, splitOutboundLines,
} from '../src/lib/warehouse-locations';
import {
  quantiteSurEtagere, ligneEtagereDuProduit, venteAuxEtageres, retourSurEtageres, MESSAGE_SANS_CONTENU,
} from '../src/lib/etageres';
import { preparerCouleur, calculerCouleur, mouvementsMiseEnRayon, MESSAGE_CONTENUS_DIFFERENTS } from '../src/lib/mise-en-rayon';
import { cartesAvecEtageres, uniteEnFrancais } from '../src/lib/etageres';
import { computeLocationContents, articleVariantDimension } from '../src/lib/warehouse-locations';
import { totauxJournal, texteTotaux, libelleMotif, stockDuMouvement } from '../src/lib/journal-mouvements';
import {
  mouvementsAnnulation, mouvementsCorrection, mouvementDepuisLigne, varianteDeLigne, estLigneDeBonEtagere,
  grouperLignesBon, appliquerSaisieBon, cleGroupe,
} from '../src/lib/bon-sans-prix';
import { encoreRetournable } from '../src/lib/retours-facture';
import { construireBonHtml, separerReserveEtEtageres } from '../src/lib/bon-imprime';

let pass = 0;
let fail = 0;
function check(label: string, ok: boolean, detail = '') {
  if (ok) { pass++; console.log(`  ✓ ${label}`); }
  else { fail++; console.log(`  ✗ ${label} ${detail}`); }
}
const eq = (label: string, obtenu: any, attendu: any) =>
  check(label, JSON.stringify(obtenu) === JSON.stringify(attendu), `→ obtenu ${JSON.stringify(obtenu)}, attendu ${JSON.stringify(attendu)}`);

// ── Le décor ─────────────────────────────────────────────────────────────────
const stores = [
  { id: 'CHRIFA', type: 'STORE', isMain: true },
  { id: 'DERB', type: 'STORE' },
  { id: 'ENTREPOT', type: 'WAREHOUSE' },
];
const poles = [
  { id: 'P_ZIP', nameFR: 'Fermetures', uniteAchat: 'bag', uniteVente: 'pièces' },
  { id: 'P_TAF', nameFR: 'Taffeta', uniteAchat: 'rolls', uniteVente: 'm' },
  { id: 'P_SANS', nameFR: 'Divers' },
];
const categories = [
  { id: 'ZIP', name: 'ZIPPER', nameFR: 'Fermeture', generalCategoryId: 'P_ZIP' },
  { id: 'TAF', name: 'TAFFETA FABRIC', nameFR: 'Taffetas', generalCategoryId: 'P_TAF' },
  { id: 'DIV', name: 'MISC', nameFR: 'Divers', generalCategoryId: 'P_SANS' },
];

const base = { status: 'STOCK', stockEntryDate: '2026-09-01', arrivalDate: '2026-09-01' };
// Fermeture 20 cm, ventilée par couleur (deux commandes du même produit : Z20a et Z20b).
const Z20a = { ...base, id: 'Z20a', categoryId: 'ZIP', size: '20cm', quantity: 40, color: 'various',
  colorBreakdown: [{ colorCode: 'ROUGE', rolls: 10 }, { colorCode: 'BLEU', rolls: 30 }] };
const Z20b = { ...base, id: 'Z20b', categoryId: 'ZIP', size: '20cm', quantity: 6, color: 'various',
  colorBreakdown: [{ colorCode: 'ROUGE', rolls: 6 }] };
// Fermeture 60 cm : une autre taille, un autre stock.
const Z60 = { ...base, id: 'Z60', categoryId: 'ZIP', size: '60cm', quantity: 5, color: 'various',
  colorBreakdown: [{ colorCode: 'NOIR', rolls: 5 }] };
// Taffetas ventilé par qualité : CL-5 ≠ CL-8.
const TAF = { ...base, id: 'TAF1', categoryId: 'TAF', quantity: 30, quality: 'various',
  qualityBreakdown: [{ quality: 'CL-5', quantity: 10 }, { quality: 'CL-8', quantity: 20 }] };
// Un article sans aucune ventilation, et un pôle sans unité de vente.
const SIMPLE = { ...base, id: 'S1', categoryId: 'ZIP', size: '35cm', quantity: 8, color: 'NOIR' };
const DIVERS = { ...base, id: 'D1', categoryId: 'DIV', quantity: 4, color: 'BLANC' };

const articles = [Z20a, Z20b, Z60, TAF, SIMPLE, DIVERS];

const arrivage = (articleId: string, quantity: number, variante: Record<string, string> = {}) => ({
  articleId, type: 'IN', reason: 'ARRIVAGE', storeId: 'ENTREPOT', date: '2026-09-01', quantity,
  factureId: 'F1', ...variante,
});
const reserve = [
  arrivage('Z20a', 10, { color: 'ROUGE' }),
  arrivage('Z20a', 30, { color: 'BLEU' }),
  arrivage('Z20b', 6, { color: 'ROUGE' }),
  arrivage('Z60', 5, { color: 'NOIR' }),
  arrivage('TAF1', 10, { quality: 'CL-5' }),
  arrivage('TAF1', 20, { quality: 'CL-8' }),
  arrivage('S1', 8),
  arrivage('D1', 4, { color: 'BLANC' }),
];

const etagere = (articleId: string, type: string, reason: string, quantity: number, extra: Record<string, any> = {}) => ({
  articleId, type, reason, quantity, storeId: 'CHRIFA', date: '2026-10-01', etagere: true, ...extra,
});

const calcul = (movements: any[], vue: string = 'CHRIFA', includeAll = true) => computeStockItems(
  articles as any, movements as any, categories, vue as any, includeAll, 'ADMIN', stores, '', poles, [],
);

const ligneReserve = (items: any[], articleId: string, couleur?: string, qualite?: string) =>
  lignesDeReserve(items).find((i: any) =>
    ((i._mergedArticleIds || [i._realArticleId || i.articleId]).includes(articleId))
    && (couleur === undefined || String(i.color || '').toUpperCase() === couleur)
    && (qualite === undefined || String(i.quality || '').toUpperCase() === qualite));

const etageresDe = (items: any[]) => lignesDesEtageres(items);
const qtes = (items: any[]) => lignesDeReserve(items)
  .map((i: any) => `${i.articleId}|${i.color || ''}|${i.quality || ''}|${i.size || ''}=${i.currentQty}`).sort();

// ── 1. Le lieu des étagères ─────────────────────────────────────────────────
console.log('\n── Le lieu des étagères ──');
eq('le magasin principal (isMain, pas un entrepôt)', magasinDesEtageres(stores), 'CHRIFA');
eq('sans lieux connus : CHRIFA', magasinDesEtageres([]), 'CHRIFA');
eq('un entrepôt marqué principal n\'est pas retenu',
  magasinDesEtageres([{ id: 'ENTREPOT', type: 'WAREHOUSE', isMain: true }, { id: 'M2', type: 'STORE', isMain: true }]), 'M2');

// ── 2. Un ajustement d'étagère ne touche pas la réserve ─────────────────────
console.log('\n── Un comptage des étagères ne touche pas la réserve ──');
const avant = calcul(reserve);
const apresComptage = calcul([
  ...reserve,
  // 300 pièces comptées sur les étagères, sans couleur : sans l'écart préalable, elles seraient
  // réparties au prorata sur ROUGE et BLEU de la réserve.
  etagere('Z20a', 'ADJUSTMENT', 'INVENTAIRE', 300, { size: '20cm', unitOfMeasure: 'pièces', uniteReelle: 'pièces' }),
  // Sur un article SANS ventilation : il serait ajouté tel quel à la réserve.
  etagere('S1', 'ADJUSTMENT', 'INVENTAIRE', 40, { size: '35cm', unitOfMeasure: 'pièces' }),
]);
eq('aucune ligne de réserve ne bouge (couleurs, qualités, tailles)', qtes(apresComptage), qtes(avant));
eq('ROUGE 20 cm toujours 16 (10 + 6, deux commandes)', ligneReserve(apresComptage, 'Z20a', 'ROUGE')?.currentQty, 16);
eq('BLEU 20 cm toujours 30', ligneReserve(apresComptage, 'Z20a', 'BLEU')?.currentQty, 30);
eq('l\'article sans ventilation toujours 8', ligneReserve(apresComptage, 'S1')?.currentQty, 8);
eq('aucune ligne Étagères avant tout mouvement d\'étagère', etageresDe(avant).length, 0);

const et20 = etageresDe(apresComptage).find((i: any) => i.size === '20cm');
check('une ligne Étagères pour la fermeture 20 cm', !!et20);
eq('… avec le bon total (300 pièces)', et20?.currentQty, 300);
eq('… en unité de vente du pôle', et20?.unitOfMeasure, 'pièces');
eq('… sans couleur', et20?.color ?? null, null);
eq('… au magasin principal', et20?.qtyByStore, { CHRIFA: 300 });
check('… marquée _etagere', estLigneEtagere(et20));
eq('… sans prix (jamais de prix de revient en unité de vente)', [et20?.purchasePricePerUnit, et20?.totalValue], [0, 0]);

// ── 3. La mise en rayon : la réserve sort par couleur, les étagères reçoivent sans couleur ─
console.log('\n── Mise en rayon ──');
const apresMiseEnRayon = calcul([
  ...reserve,
  // 2 sacs ROUGE de 20 pièces sortis de la réserve (unité de la réserve), 40 pièces en rayon.
  { articleId: 'Z20a', type: 'OUT', reason: 'MISE_EN_RAYON', storeId: 'CHRIFA', date: '2026-10-01',
    color: 'ROUGE', size: '20cm', quantity: 2, unitOfMeasure: 'bag', uniteReelle: 'bag',
    miseEnRayonId: 'MR1', colis: 'carton', nbColis: 2, parColis: 20, facteur: 20 },
  etagere('Z20a', 'IN', 'MISE_EN_RAYON', 40, { size: '20cm', unitOfMeasure: 'pièces', uniteReelle: 'pièces', miseEnRayonId: 'MR1' }),
]);
eq('la réserve ROUGE perd 2 sacs (16 → 14)', ligneReserve(apresMiseEnRayon, 'Z20a', 'ROUGE')?.currentQty, 14);
eq('la réserve BLEU ne bouge pas', ligneReserve(apresMiseEnRayon, 'Z20a', 'BLEU')?.currentQty, 30);
eq('les étagères reçoivent 40 pièces', etageresDe(apresMiseEnRayon).find((i: any) => i.size === '20cm')?.currentQty, 40);

// ── 4. Jamais fusionnée ; qualité et taille séparées ; commandes regroupées ─
console.log('\n── Identité des lignes Étagères ──');
const mouvementsMelange = [
  ...reserve,
  etagere('Z20a', 'ADJUSTMENT', 'INVENTAIRE', 100, { size: '20cm' }),
  etagere('Z20b', 'IN', 'MISE_EN_RAYON', 20, { size: '20cm' }),          // autre commande, même produit
  etagere('Z60', 'ADJUSTMENT', 'INVENTAIRE', 12, { size: '60cm' }),       // autre taille
  etagere('TAF1', 'ADJUSTMENT', 'INVENTAIRE', 55.5, { quality: 'CL-5' }), // mètres, décimales
  etagere('TAF1', 'ADJUSTMENT', 'INVENTAIRE', 80, { quality: 'CL-8' }),   // autre qualité
  etagere('Z20a', 'OUT', 'VENTE', 7, { size: '20cm' }),                    // une vente au détail
];
const melange = calcul(mouvementsMelange);
const lignesEt = etageresDe(melange);
eq('4 lignes Étagères : 20 cm, 60 cm, CL-5, CL-8', lignesEt.length, 4);
eq('20 cm : deux commandes regroupées (100 + 20 − 7)', lignesEt.find((i: any) => i.size === '20cm')?.currentQty, 113);
eq('20 cm : les deux articles retenus', lignesEt.find((i: any) => i.size === '20cm')?._mergedArticleIds, ['Z20a', 'Z20b']);
eq('60 cm : à part', lignesEt.find((i: any) => i.size === '60cm')?.currentQty, 12);
eq('TAFFETA CL-5 : 55,5 m', lignesEt.find((i: any) => i.quality === 'CL-5')?.currentQty, 55.5);
eq('TAFFETA CL-8 : 80 m', lignesEt.find((i: any) => i.quality === 'CL-8')?.currentQty, 80);
eq('TAFFETA en mètres', lignesEt.find((i: any) => i.quality === 'CL-8')?.unitOfMeasure, 'm');
const idsReserve = new Set(lignesDeReserve(melange).map((i: any) => i.articleId));
check('aucun identifiant de ligne Étagères ne vaut celui d\'une ligne de réserve',
  lignesEt.every((i: any) => !idsReserve.has(i.articleId)));
eq('les clés d\'étagère sont toutes différentes', new Set(lignesEt.map((i: any) => cleEtagere(i))).size, 4);
check('une clé d\'étagère commence par « etagere »', cleEtagere({ categoryId: 'ZIP', size: '20cm' }).startsWith('etagere|'));
eq('la réserve reste exacte à côté', qtes(melange), qtes(avant));

// ── 5. Les vues : seulement là où est le magasin principal ──────────────────
console.log('\n── Vues ──');
eq('vue globale (entrepôts) : aucune ligne Étagères', etageresDe(calcul([
  ...reserve, etagere('Z20a', 'ADJUSTMENT', 'INVENTAIRE', 100, { size: '20cm' })], 'ALL')).length, 0);
eq('vue d\'un entrepôt : aucune ligne Étagères', etageresDe(calcul([
  ...reserve, etagere('Z20a', 'ADJUSTMENT', 'INVENTAIRE', 100, { size: '20cm' })], 'ENTREPOT', false)).length, 0);
eq('vue d\'un autre magasin : aucune ligne Étagères', etageresDe(calcul([
  ...reserve, etagere('Z20a', 'ADJUSTMENT', 'INVENTAIRE', 100, { size: '20cm' })], 'DERB')).length, 0);
eq('vue CHRIFA sans includeAll : la ligne Étagères est là', etageresDe(calcul([
  ...reserve, etagere('Z20a', 'ADJUSTMENT', 'INVENTAIRE', 100, { size: '20cm' })], 'CHRIFA', false)).length, 1);

// ── 6. Disponible : la réserve d'un côté, les étagères de l'autre ───────────
console.log('\n── disponibleDepuis / disponibleSurEtageres ──');
const l20 = lignesEt.find((i: any) => i.size === '20cm');
const rouge = ligneReserve(melange, 'Z20a', 'ROUGE');
eq('disponibleDepuis ignore une ligne Étagères', disponibleDepuis(l20, 'CHRIFA', stores), 0);
eq('disponibleDepuis compte la réserve (magasin + entrepôts)', disponibleDepuis(rouge, 'CHRIFA', stores), 16);
eq('disponibleSurEtageres compte la ligne Étagères', disponibleSurEtageres(l20), 113);
eq('disponibleSurEtageres au magasin principal', disponibleSurEtageres(l20, 'CHRIFA'), 113);
eq('disponibleSurEtageres ailleurs : 0', disponibleSurEtageres(l20, 'DERB'), 0);
eq('disponibleSurEtageres d\'une ligne de réserve : 0', disponibleSurEtageres(rouge), 0);
eq('disponibleSurEtageres d\'une ligne absente : 0', disponibleSurEtageres(undefined), 0);

// ── 7. Le comptage des étagères ─────────────────────────────────────────────
console.log('\n── Comptage des étagères ──');
const produits = produitsDesEtageres(melange, categories, poles);
const p20 = produits.find(p => p.size === '20cm');
const p35 = produits.find(p => p.size === '35cm');
const pDiv = produits.find(p => p.categoryId === 'DIV');
check('un produit par famille + qualité + taille, sans couleur (20 cm une seule fois)',
  produits.filter(p => p.categoryId === 'ZIP' && p.size === '20cm').length === 1);
eq('20 cm : ce que le logiciel croit avoir', p20?.quantite, 113);
eq('20 cm : en pièces', p20?.uniteVente, 'pièces');
eq('20 cm : l\'ajustement s\'écrira sur le plus petit article', p20?.articleId, 'Z20a');
check('un produit jamais mis en rayon est proposé (quantité 0)', p35?.quantite === 0 && p35?.comptable === true);
check('un pôle sans unité de vente : non comptable', pDiv?.comptable === false && !pDiv?.uniteVente);
eq('TAFFETA : deux qualités, deux lignes', produits.filter(p => p.categoryId === 'TAF').map(p => p.quality), ['CL-5', 'CL-8']);

const ajust = ajustementEtagere({ produit: p20!, compte: 120, magasin: 'CHRIFA', date: '2026-10-01' });
eq('compté 120 pour 113 : ajustement de +7', ajust?.quantity, 7);
eq('… ADJUSTMENT / INVENTAIRE', [ajust?.type, ajust?.reason], ['ADJUSTMENT', 'INVENTAIRE']);
eq('… sur les étagères, au magasin principal', [ajust?.etagere, ajust?.storeId], [true, 'CHRIFA']);
eq('… sans couleur', 'color' in (ajust || {}), false);
eq('… taille gardée', ajust?.size, '20cm');
eq('… en unité de vente, unité réelle notée', [ajust?.unitOfMeasure, ajust?.uniteReelle], ['pièces', 'pièces']);
eq('aucun écart : rien à écrire', ajustementEtagere({ produit: p20!, compte: 113, magasin: 'CHRIFA', date: '2026-10-01' }), null);
eq('produit non comptable : rien à écrire', ajustementEtagere({ produit: pDiv!, compte: 3, magasin: 'CHRIFA', date: '2026-10-01' }), null);
const ajustMetres = ajustementEtagere({ produit: produits.find(p => p.quality === 'CL-5')!, compte: 50.25, magasin: 'CHRIFA', date: '2026-10-01' });
eq('mètres : décimales gardées (50,25 − 55,5)', ajustMetres?.quantity, -5.25);

// Le comptage écrit, puis relu par le calcul du stock.
const apresAjust = calcul([...mouvementsMelange, ajust!]);
eq('après l\'ajustement, la ligne 20 cm vaut 120', etageresDe(apresAjust).find((i: any) => i.size === '20cm')?.currentQty, 120);
eq('… et la réserve n\'a pas bougé', qtes(apresAjust), qtes(avant));

// Quantités de départ : un produit jamais mis en rayon reçoit sa première quantité.
const depart = ajustementEtagere({ produit: p35!, compte: 25, magasin: 'CHRIFA', date: '2026-10-01' });
eq('quantité de départ : +25', depart?.quantity, 25);
const apresDepart = calcul([...reserve, depart!]);
eq('la ligne 35 cm apparaît avec 25 pièces', etageresDe(apresDepart).find((i: any) => i.size === '35cm')?.currentQty, 25);
eq('l\'article sans ventilation garde ses 8 en réserve', ligneReserve(apresDepart, 'S1')?.currentQty, 8);

// Pôle sans unité de vente : la ligne existe mais signale qu'il manque l'unité.
const sansUnite = etageresDe(calcul([...reserve, etagere('D1', 'ADJUSTMENT', 'INVENTAIRE', 3, { unitOfMeasure: 'pièces' })]));
check('pôle sans unité de vente : la ligne le signale (_sansUniteVente)', (sansUnite[0] as any)?._sansUniteVente === true);

// ── 8. Ce que les autres calculs doivent ignorer ────────────────────────────
console.log('\n── Exclusions ──');
// Un dossier dont la ligne BLEU n'est pas entrée : une entrée d'étagère ne la remplace pas.
eq('lignesEntreeManquantes ignore une entrée d\'étagère', lignesEntreeManquantes([Z20a], [
  arrivage('Z20a', 10, { color: 'ROUGE' }),
  etagere('Z20a', 'IN', 'MISE_EN_RAYON', 30, { color: 'BLEU' }),
]), 1);
eq('lignesEntreeManquantes ignore une entrée MISE_EN_RAYON même sans marqueur', lignesEntreeManquantes([Z20a], [
  arrivage('Z20a', 10, { color: 'ROUGE' }),
  { articleId: 'Z20a', type: 'IN', reason: 'MISE_EN_RAYON', color: 'BLEU', quantity: 30 },
]), 1);
const occ = computeLocationOccupancy([
  { articleId: 'Z20a', type: 'IN', reason: 'ARRIVAGE', locationCode: 'A1', quantity: 10, storeId: 'ENTREPOT' },
  etagere('Z20a', 'IN', 'MISE_EN_RAYON', 40, { locationCode: 'A1' }),
]);
eq('un emplacement ne compte pas les étagères', occ['A1']?.quantity, 10);
const parRack = computeArticleLocationStock([
  { articleId: 'Z20a', type: 'IN', reason: 'ARRIVAGE', locationCode: 'A1', quantity: 10, storeId: 'ENTREPOT' },
  etagere('Z20a', 'IN', 'MISE_EN_RAYON', 40, { locationCode: 'A1' }),
] as any, 'CHRIFA', 'Z20a', null, stores) as any[];
eq('le stock par rack ne compte pas les étagères', parRack.map((r: any) => [r.locationCode, r.quantity ?? r.qty]), [['A1', 10]]);

// ═════════════════════════════════════════════════════════════════════════════
// PARTIE 2 — les gestes : mise en rayon, vente aux étagères, bons, retours.
// ═════════════════════════════════════════════════════════════════════════════

// Un décor à part, avec le conditionnement : un sac de fermetures = 20 pièces, un carton = 10
// sacs (200 pièces) ; un rouleau de taffetas CL-5 = 50 m. La réserve compte dans l'unité
// d'achat (sacs, rouleaux), les étagères dans l'unité de vente (pièces, mètres).
const poles2 = [
  { id: 'PZ', name: 'FERMETURES', specType: 'zipper', uniteAchat: 'bag', uniteVente: 'pièces' },
  { id: 'PT', name: 'TAFFETAS', specType: 'fabric', uniteAchat: 'rolls', uniteVente: 'm' },
  { id: 'PN', name: 'SANS VENTE', specType: 'zipper', uniteAchat: 'bag' },
];
const cats2 = [
  { id: 'Z', name: 'ZIP', nameFR: 'Fermeture', generalCategoryId: 'PZ' },
  { id: 'T', name: 'TAF', nameFR: 'Taffetas', generalCategoryId: 'PT' },
  { id: 'N', name: 'NOV', nameFR: 'Sans vente', generalCategoryId: 'PN' },
];
const ZA = { ...base, id: 'ZA', categoryId: 'Z', size: '20cm', quantity: 46, unitOfMeasure: 'bag', color: 'various',
  pcsPerBag: 20, bagsPerCarton: 10,
  colorBreakdown: [{ colorCode: 'ROUGE', rolls: 16 }, { colorCode: 'BLEU', rolls: 30 }] };
const ZB = { ...base, id: 'ZB', categoryId: 'Z', size: '60cm', quantity: 5, unitOfMeasure: 'bag', color: 'NOIR' }; // contenu inconnu
const TA = { ...base, id: 'TA', categoryId: 'T', quantity: 10, unitOfMeasure: 'rolls', quality: 'various',
  qualityBreakdown: [{ quality: 'CL-5', quantity: 10, rollLength: 50, rollLengthUnit: 'm' }] };
const NA = { ...base, id: 'NA', categoryId: 'N', quantity: 4, unitOfMeasure: 'bag', color: 'BLANC', pcsPerBag: 10, bagsPerCarton: 5 };
const articles2 = [ZA, ZB, TA, NA];
const stores2 = stores;
const ctx2 = { articles: articles2, categories: cats2, generalCategories: poles2 };
const mvts2: any[] = [
  { articleId: 'ZA', type: 'IN', reason: 'ARRIVAGE', storeId: 'ENTREPOT', date: '2026-09-01', quantity: 16, color: 'ROUGE', unitOfMeasure: 'bag', factureId: 'F2' },
  // Le BLEU est rangé en A1 : la sortie de réserve doit le prendre là (FIFO par emplacement).
  { articleId: 'ZA', type: 'IN', reason: 'ARRIVAGE', storeId: 'ENTREPOT', date: '2026-09-01', quantity: 30, color: 'BLEU', unitOfMeasure: 'bag', factureId: 'F2', locationCode: 'A1' },
  { articleId: 'ZB', type: 'IN', reason: 'ARRIVAGE', storeId: 'ENTREPOT', date: '2026-09-01', quantity: 5, color: 'NOIR', unitOfMeasure: 'bag', factureId: 'F2' },
  { articleId: 'TA', type: 'IN', reason: 'ARRIVAGE', storeId: 'ENTREPOT', date: '2026-09-01', quantity: 10, quality: 'CL-5', unitOfMeasure: 'rolls', factureId: 'F2' },
  { articleId: 'NA', type: 'IN', reason: 'ARRIVAGE', storeId: 'ENTREPOT', date: '2026-09-01', quantity: 4, color: 'BLANC', unitOfMeasure: 'bag', factureId: 'F2' },
];
const calcul2 = (movements: any[], vue: string = 'CHRIFA') => computeStockItems(
  articles2 as any, movements as any, cats2, vue as any, true, 'ADMIN', stores2, '', poles2, [],
);
const ligne2 = (items: any[], articleId: string, couleur?: string) => lignesDeReserve(items).find((i: any) =>
  ((i._mergedArticleIds || [i._realArticleId || i.articleId]).includes(articleId))
  && (couleur === undefined || String(i.color || '').toUpperCase() === couleur));
const etagere2 = (items: any[], f: (i: any) => boolean) => lignesDesEtageres(items).find(f);
const qtes2 = (items: any[]) => lignesDeReserve(items).map((i: any) => `${i.articleId}=${i.currentQty}`).sort();
const somme = (ms: any[]) => Math.round(ms.reduce((s, m) => s + (Number(m.quantity) || 0), 0) * 1000) / 1000;

console.log('\n── Mise en rayon : ce qu\'on sait du colis ──');
const avant2 = calcul2(mvts2);
const rouge2 = ligne2(avant2, 'ZA', 'ROUGE');
const bleu2 = ligne2(avant2, 'ZA', 'BLEU');
eq('la réserve compte la fermeture en sacs', rouge2?.unitOfMeasure, 'bag');
const prepRouge = preparerCouleur(rouge2, ctx2);
const prepBleu = preparerCouleur(bleu2, ctx2);
check('fermeture : prête', prepRouge.pret === true);
eq('1 sac = 20 pièces (facteur de la réserve vers la vente)', prepRouge.pret ? prepRouge.facteur : null, 20);
eq('le colis de sortie est le carton, de 200 pièces', prepRouge.pret ? prepRouge.colis.map(c => [c.colis, c.contenu]) : null, [['carton', 200]]);
eq('en pièces', prepRouge.pret ? prepRouge.uniteVente : null, 'pièces');
const prepNoir = preparerCouleur(ligne2(avant2, 'ZB', 'NOIR'), ctx2);
check('contenu du carton inconnu : bloqué', prepNoir.pret === false);
eq('… avec le message du patron', prepNoir.pret ? null : prepNoir.message, MESSAGE_SANS_CONTENU);
check('… et ce qui manque, pour l\'administrateur', !prepNoir.pret && prepNoir.raisons.length > 0);
const prepSansVente = preparerCouleur(ligne2(avant2, 'NA', 'BLANC'), ctx2);
check('pôle sans unité de vente : bloqué aussi', prepSansVente.pret === false && prepSansVente.message === MESSAGE_SANS_CONTENU);

console.log('\n── Mise en rayon : la conversion en direct ──');
if (prepRouge.pret) {
  const c = calculerCouleur(prepRouge, { colis: { carton: 1 }, reste: 30 });
  eq('1 carton + reste de 30 pièces = 230 pièces', c.totalVente, 230);
  eq('… soit 11,5 sacs sortis de la réserve', c.totalReserve, 11.5);
  eq('… le texte du carton', c.parties[0]?.texte, '1 carton = 200 pièces');
  eq('3 cartons = 600 pièces = 30 sacs', [calculerCouleur(prepRouge, { colis: { carton: 3 } }).totalVente, calculerCouleur(prepRouge, { colis: { carton: 3 } }).totalReserve], [600, 30]);
  check('un demi-carton est refusé (nombre ENTIER)', calculerCouleur(prepRouge, { colis: { carton: 1.5 } }).erreurs.length === 1);
  check('2,5 pièces sont refusées (pas de décimales en pièces)', calculerCouleur(prepRouge, { reste: 2.5 }).erreurs.length === 1);
  check('un reste plus grand qu\'un carton est signalé, pas refusé', (() => {
    const r = calculerCouleur(prepRouge, { reste: 250 });
    return r.erreurs.length === 0 && r.avertissements.length === 1 && r.totalVente === 250;
  })());
  eq('rien saisi : rien ne part', calculerCouleur(prepRouge, {}).totalVente, 0);
}

console.log('\n── Mise en rayon : les mouvements ──');
const produits2 = produitsDesEtageres(avant2, cats2, poles2);
const pZ20 = produits2.find(p => p.categoryId === 'Z' && p.size === '20cm')!;
const mr = mouvementsMiseEnRayon({
  produit: pZ20,
  couleurs: [
    { ligne: rouge2, preparation: prepRouge, saisie: { colis: { carton: 1 }, reste: 30 } },
    { ligne: bleu2, preparation: prepBleu, saisie: { colis: { carton: 2 } } },
  ],
  magasin: 'CHRIFA', date: '2026-10-01', miseEnRayonId: 'MR9', mouvements: mvts2, lieux: stores2,
});
eq('aucune erreur', mr.erreurs, []);
eq('total sur les étagères : 230 + 400 = 630 pièces', mr.totalVente, 630);
check('toutes les sorties : OUT / MISE_EN_RAYON, magasin principal, même identifiant',
  mr.sorties.every(m => m.type === 'OUT' && m.reason === 'MISE_EN_RAYON' && m.storeId === 'CHRIFA' && m.miseEnRayonId === 'MR9'));
check('… dans l\'unité de la RÉSERVE (sacs), unité réelle notée',
  mr.sorties.every(m => m.unitOfMeasure === 'bag' && m.uniteReelle === 'bag'));
check('… jamais marquées étagères', mr.sorties.every(m => !m.etagere));
eq('ROUGE : 11,5 sacs sortis', somme(mr.sorties.filter(m => m.color === 'ROUGE')), 11.5);
eq('BLEU : 20 sacs sortis', somme(mr.sorties.filter(m => m.color === 'BLEU')), 20);
eq('BLEU pris dans son rack (FIFO par emplacement)', mr.sorties.filter(m => m.color === 'BLEU').map(m => m.locationCode), ['A1']);
const carton = mr.sorties.find(m => m.color === 'ROUGE' && m.colis === 'carton');
eq('la trace du contenu : carton, 1 colis, 200 pièces par colis, facteur 20',
  [carton?.colis, carton?.nbColis, carton?.parColis, carton?.facteur, carton?.quantiteVente], ['carton', 1, 200, 20, 200]);
const reste = mr.sorties.find(m => m.color === 'ROUGE' && m.colis === 'reste');
eq('le reste : 30 pièces, 1,5 sac', [reste?.quantiteVente, reste?.quantity], [30, 1.5]);
eq('l\'entrée : sur les étagères, IN / MISE_EN_RAYON, même identifiant',
  [mr.entree?.etagere, mr.entree?.type, mr.entree?.reason, mr.entree?.miseEnRayonId, mr.entree?.storeId], [true, 'IN', 'MISE_EN_RAYON', 'MR9', 'CHRIFA']);
eq('… 630 pièces, en unité de vente', [mr.entree?.quantity, mr.entree?.unitOfMeasure, mr.entree?.uniteReelle], [630, 'pièces', 'pièces']);
eq('… sans couleur', 'color' in (mr.entree || {}), false);
eq('… la taille gardée', mr.entree?.size, '20cm');
eq('aucun dépassement', mr.depassements, []);

const apresMR = calcul2([...mvts2, ...mr.sorties, mr.entree]);
eq('réserve ROUGE : 16 − 11,5 = 4,5 sacs', ligne2(apresMR, 'ZA', 'ROUGE')?.currentQty, 4.5);
eq('réserve BLEU : 30 − 20 = 10 sacs', ligne2(apresMR, 'ZA', 'BLEU')?.currentQty, 10);
const etZ20 = etagere2(apresMR, i => i.size === '20cm');
eq('étagères 20 cm : 630 pièces', etZ20?.currentQty, 630);
eq('rien d\'autre ne bouge dans la réserve',
  qtes2(apresMR).filter(q => !q.startsWith('ZA')), qtes2(avant2).filter(q => !q.startsWith('ZA')));
eq('une seule ligne Étagères', lignesDesEtageres(apresMR).length, 1);
eq('le compteur des étagères lit pareil (quantiteSurEtagere)',
  quantiteSurEtagere([...mvts2, ...mr.sorties, mr.entree], articles2, { articleId: 'ZA', size: '20cm' }), 630);

// Dépassement : la réserve affiche 30 sacs de BLEU, on en sort 4 cartons (40 sacs).
const mrTrop = mouvementsMiseEnRayon({
  produit: pZ20,
  couleurs: [{ ligne: bleu2, preparation: prepBleu, saisie: { colis: { carton: 4 } } }],
  magasin: 'CHRIFA', date: '2026-10-01', miseEnRayonId: 'MR10', mouvements: mvts2, lieux: stores2,
});
eq('dépassement de la réserve : signalé, pas bloqué', [mrTrop.erreurs.length, mrTrop.entree?.quantity], [0, 800]);
eq('… l\'écart est dit (10 sacs)', mrTrop.depassements, [{ couleur: 'BLEU', depasse: 10, unite: 'bag' }]);
check('… et marqué au journal', mrTrop.sorties.some(m => /Dépassement stock: \+10/.test(m.notes)));
eq('… 40 sacs sortent quand même', somme(mrTrop.sorties), 40);

// Produit bloqué : rien ne part.
const pNoir = produits2.find(p => p.size === '60cm')!;
const mrBloque = mouvementsMiseEnRayon({
  produit: pNoir,
  couleurs: [{ ligne: ligne2(avant2, 'ZB', 'NOIR'), preparation: prepNoir, saisie: { colis: { carton: 1 } } }],
  magasin: 'CHRIFA', date: '2026-10-01', miseEnRayonId: 'MR11', mouvements: mvts2, lieux: stores2,
});
check('contenu inconnu : erreur, aucune sortie, aucune entrée',
  mrBloque.erreurs.length > 0 && mrBloque.sorties.length === 0 && mrBloque.entree === null);
check('… avec le message du patron', mrBloque.erreurs.some(e => e.includes(MESSAGE_SANS_CONTENU)));
const mrDemi = mouvementsMiseEnRayon({
  produit: pZ20,
  couleurs: [{ ligne: rouge2, preparation: prepRouge, saisie: { colis: { carton: 0.5 } } }],
  magasin: 'CHRIFA', date: '2026-10-01', miseEnRayonId: 'MR12', mouvements: mvts2, lieux: stores2,
});
check('un demi-carton : rien ne part', mrDemi.erreurs.length === 1 && mrDemi.sorties.length === 0 && mrDemi.entree === null);

// Taffetas : des rouleaux de 50 m, et un reste en mètres décimaux.
const cl5 = lignesDeReserve(avant2).find((i: any) => i.quality === 'CL-5');
const prepCl5 = preparerCouleur(cl5, ctx2);
eq('taffetas : 1 rouleau = 50 m', prepCl5.pret ? [prepCl5.colis[0]?.colis, prepCl5.colis[0]?.contenu, prepCl5.facteur, prepCl5.uniteVente] : prepCl5, ['rouleau', 50, 50, 'm']);
const pCl5 = produits2.find(p => p.quality === 'CL-5')!;
const mrTaf = mouvementsMiseEnRayon({
  produit: pCl5,
  couleurs: [{ ligne: cl5, preparation: prepCl5, saisie: { colis: { rouleau: 2 }, reste: 12.5 } }],
  magasin: 'CHRIFA', date: '2026-10-01', miseEnRayonId: 'MR13', mouvements: mvts2, lieux: stores2,
});
eq('2 rouleaux + 12,5 m = 112,5 m sur les étagères', mrTaf.entree?.quantity, 112.5);
eq('… 2,25 rouleaux sortis de la réserve', somme(mrTaf.sorties), 2.25);
const apresTaf = calcul2([...mvts2, ...mrTaf.sorties, mrTaf.entree]);
eq('réserve CL-5 : 7,75 rouleaux', lignesDeReserve(apresTaf).find((i: any) => i.quality === 'CL-5')?.currentQty, 7.75);
eq('étagères CL-5 : 112,5 m', etagere2(apresTaf, i => i.quality === 'CL-5')?.currentQty, 112.5);

console.log('\n── Vente aux étagères ──');
const mvtsApresMR = [...mvts2, ...mr.sorties, mr.entree];
const v = venteAuxEtageres({
  item: etZ20, qty: 30, unitPrice: 2, magasin: 'CHRIFA', date: '2026-10-01', notes: 'Vente comptoir',
  disponible: disponibleSurEtageres(etZ20, 'CHRIFA'),
});
eq('la ligne : étagères, source ETAGERE, sans couleur, magasin principal',
  [v.ligne.etagere, v.ligne.source, v.ligne.color, v.ligne.storeId], [true, 'ETAGERE', '', 'CHRIFA']);
eq('… sur l\'article réel, en pièces, prix à la pièce', [v.ligne.articleId, v.ligne.unitOfMeasure, v.ligne.totalPrice], ['ZA', 'pièces', 60]);
eq('la sortie : OUT / VENTE sur les étagères, sans couleur', [v.mouvement.type, v.mouvement.reason, v.mouvement.etagere, v.mouvement.color], ['OUT', 'VENTE', true, null]);
check('… sans marque de dépassement', !/Dépassement/.test(v.mouvement.notes));
const adressee = splitOutboundLines(mvtsApresMR, 'CHRIFA', 'ZA', 30, v.mouvement, null, stores2);
eq('une sortie d\'étagère ne prend jamais de rack (même si A1 existe)', adressee.map(l => [l.quantity, l.locationCode ?? null]), [[30, null]]);
const apresVente = calcul2([...mvtsApresMR, ...adressee]);
eq('étagères : 630 − 30 = 600', etagere2(apresVente, i => i.size === '20cm')?.currentQty, 600);
eq('la réserve ne bouge pas', qtes2(apresVente), qtes2(apresMR));
const vTrop = venteAuxEtageres({ item: etZ20, qty: 700, unitPrice: 2, magasin: 'CHRIFA', date: '2026-10-01', notes: 'Vente', disponible: 600 });
eq('vendre plus que les étagères : permis, écart de 100', vTrop.depasse, 100);
check('… marqué au journal', /Dépassement stock: \+100/.test(vTrop.mouvement.notes));
// Un produit jamais compté sur les étagères : ligne à zéro, et la vente tombe sur la bonne clé.
const virtuelle = ligneEtagereDuProduit(pCl5, lignesDesEtageres(avant2), 'CHRIFA');
eq('ligne d\'étagère à zéro (jamais comptée)', [virtuelle._etagere, virtuelle.currentQty, virtuelle.unitOfMeasure], [true, 0, 'm']);
const vMetres = venteAuxEtageres({ item: virtuelle, qty: 3.5, unitPrice: 10, magasin: 'CHRIFA', date: '2026-10-01', notes: 'Vente', disponible: 0 });
eq('3,5 m vendus sans stock compté : dépassement de 3,5', vMetres.depasse, 3.5);
const apresMetres = calcul2([...mvts2, vMetres.mouvement]);
eq('… la ligne CL-5 des étagères passe à −3,5 (même produit, même clé)', etagere2(apresMetres, i => i.quality === 'CL-5')?.currentQty, -3.5);
eq('… et la réserve CL-5 garde ses 10 rouleaux', lignesDeReserve(apresMetres).find((i: any) => i.quality === 'CL-5')?.currentQty, 10);

console.log('\n── Bons : annulation et correction d\'une ligne Étagères ──');
const ligneEt = { ...v.ligne, ligneId: 'L1' };
const ligneRes = { articleId: 'ZA', productName: 'Fermeture', color: 'BLEU', size: '20cm', categoryId: 'Z', unitOfMeasure: 'bag', qty: 2, storeId: 'CHRIFA', ligneId: 'L2' };
check('estLigneDeBonEtagere', estLigneDeBonEtagere(ligneEt) && !estLigneDeBonEtagere(ligneRes));
eq('une ligne Étagères n\'a pas de variante de réserve', varianteDeLigne(ligneEt, articles2), null);
const sortieEt = splitOutboundLines(mvtsApresMR, 'CHRIFA', 'ZA', 30, { ...v.mouvement, bonId: 'B1', ligneBonId: 'L1' }, null, stores2);
const sortieRes = splitOutboundLines(mvtsApresMR, 'CHRIFA', 'ZA', 2, {
  ...mouvementDepuisLigne(ligneRes, 'CHRIFA'), type: 'OUT', reason: 'VENTE', date: '2026-10-01', bonId: 'B1',
}, { dimension: 'color', value: 'BLEU' }, stores2);
eq('la ligne de réserve, elle, prend son rack', sortieRes.map(l => l.locationCode), ['A1']);
const bonMvts = [...sortieEt, ...sortieRes];
const avantBon = calcul2(mvtsApresMR);
const apresBon = calcul2([...mvtsApresMR, ...bonMvts]);
eq('le bon sort 30 pièces des étagères et 2 sacs BLEU', [etagere2(apresBon, i => i.size === '20cm')?.currentQty, ligne2(apresBon, 'ZA', 'BLEU')?.currentQty], [600, 8]);
const annul = mouvementsAnnulation(bonMvts, { date: '2026-10-02', notes: 'Annulation', bonId: 'B1' });
const annulEt = annul.find(m => m.etagere);
eq('annulation : un retour sur les étagères, sans couleur, en pièces, sans rack',
  [annulEt?.type, annulEt?.quantity, annulEt?.color, annulEt?.unitOfMeasure, annulEt?.uniteReelle, annulEt?.locationCode ?? null],
  ['IN', 30, null, 'pièces', 'pièces', null]);
eq('… et un retour en réserve, dans son rack', annul.filter(m => !m.etagere).map(m => [m.color, m.quantity, m.locationCode]), [['BLEU', 2, 'A1']]);
const apresAnnul = calcul2([...mvtsApresMR, ...bonMvts, ...annul]);
eq('annulation : les étagères reviennent EXACTEMENT', etagere2(apresAnnul, i => i.size === '20cm')?.currentQty, etagere2(avantBon, i => i.size === '20cm')?.currentQty);
eq('annulation : la réserve revient EXACTEMENT', qtes2(apresAnnul), qtes2(avantBon));

const baisse = mouvementsCorrection({
  ligne: ligneEt, mouvementsDeLaLigne: sortieEt, avant: 30, apres: 20, storeId: 'CHRIFA',
  contexte: { date: '2026-10-02', notes: 'Correction', bonId: 'B1' },
});
eq('correction 30 → 20 : 10 pièces reviennent sur les étagères', baisse.retours.map(r => [r.type, r.quantity, r.etagere, r.color ?? null, r.locationCode ?? null]), [['IN', 10, true, null, null]]);
const apresBaisse = calcul2([...mvtsApresMR, ...bonMvts, ...baisse.retours]);
eq('… étagères : 600 + 10 = 610, réserve inchangée',
  [etagere2(apresBaisse, i => i.size === '20cm')?.currentQty, qtes2(apresBaisse)], [610, qtes2(apresBon)]);
const hausse = mouvementsCorrection({
  ligne: ligneEt, mouvementsDeLaLigne: sortieEt, avant: 30, apres: 45, storeId: 'CHRIFA',
  contexte: { date: '2026-10-02', notes: 'Correction', bonId: 'B1' },
});
eq('correction 30 → 45 : 15 de plus à sortir', hausse.aSortir, 15);
const supplement = splitOutboundLines([...mvtsApresMR, ...bonMvts], 'CHRIFA', 'ZA', hausse.aSortir,
  { ...mouvementDepuisLigne(ligneEt, 'CHRIFA'), type: 'OUT', reason: 'VENTE', date: '2026-10-02', bonId: 'B1' }, varianteDeLigne(ligneEt, articles2), stores2);
eq('… sortie complémentaire sur les étagères, sans couleur ni rack',
  supplement.map((m: any) => [m.quantity, m.etagere, m.color, m.locationCode ?? null, m.uniteReelle]), [[15, true, null, null, 'pièces']]);
const apresHausse = calcul2([...mvtsApresMR, ...bonMvts, ...supplement]);
eq('… étagères : 600 − 15 = 585, réserve inchangée',
  [etagere2(apresHausse, i => i.size === '20cm')?.currentQty, qtes2(apresHausse)], [585, qtes2(apresBon)]);
// Annuler APRÈS la correction : on rend tout ce qui est dehors (30 + 15), pas plus.
const annulApres = mouvementsAnnulation([...bonMvts, ...supplement], { date: '2026-10-03', notes: 'Annulation', bonId: 'B1' });
eq('annulation après correction : 45 pièces rendues aux étagères', somme(annulApres.filter(m => m.etagere)), 45);
eq('… les étagères et la réserve reviennent exactement',
  [etagere2(calcul2([...mvtsApresMR, ...bonMvts, ...supplement, ...annulApres]), i => i.size === '20cm')?.currentQty,
    qtes2(calcul2([...mvtsApresMR, ...bonMvts, ...supplement, ...annulApres]))],
  [630, qtes2(avantBon)]);

console.log('\n── Retour client sur une vente aux étagères ──');
const retour = retourSurEtageres({
  ligne: { ...ligneEt, qty: 5 } as any, magasin: 'CHRIFA', date: '2026-10-03', factureId: 'F9', notes: 'Retour client',
});
eq('le retour : IN / RETOUR, sur les étagères, sans couleur, en pièces, lié à la facture',
  [retour.type, retour.reason, retour.etagere, retour.color, retour.unitOfMeasure, retour.factureId, retour.storeId],
  ['IN', 'RETOUR', true, null, 'pièces', 'F9', 'CHRIFA']);
const apresRetour = calcul2([...mvtsApresMR, ...bonMvts, retour]);
eq('… revient sur les étagères (600 + 5)', etagere2(apresRetour, i => i.size === '20cm')?.currentQty, 605);
eq('… jamais dans la réserve', qtes2(apresRetour), qtes2(apresBon));
eq('le déjà-rendu ne compte que sur la ligne des étagères',
  encoreRetournable([ligneEt, ligneRes], [retour], 'F9'), [25, 2]);

console.log('\n── Le bon de livraison imprimé ──');
const lignePieces = { productName: 'FERMETURE 20', quality: '', unitOfMeasure: 'pièces', qty: 100, color: 'ROUGE', unitPrice: 0 };
const ligneEtPieces = { productName: 'FERMETURE 20', quality: '', unitOfMeasure: 'pièces', qty: 30, etagere: true, source: 'ETAGERE', unitPrice: 0 };
const ligneSacs = { productName: 'FERMETURE 20', quality: '', unitOfMeasure: 'bag', qty: 5, color: 'BLEU', contenance: { facteur: 20, uniteBase: 'pièce' }, unitPrice: 0 };
eq('même unité : un seul article, 130 pièces', separerReserveEtEtageres(grouperLignesBon([lignePieces, ligneEtPieces])[0])
  .map(g => g.totaux), [[{ unite: 'pièces', quantite: 130 }]]);
const deux = grouperLignesBon([ligneSacs, ligneEtPieces]).flatMap(separerReserveEtEtageres);
eq('sacs de la réserve + pièces des étagères : deux lignes', deux.map(g => g.totaux), [[{ unite: 'bag', quantite: 5 }], [{ unite: 'pièces', quantite: 30 }]]);
const html = construireBonHtml({ numero: 'CH-0001', nature: 'COMPTOIR', date: '2026-10-01', items: [ligneSacs, ligneEtPieces] });
check('… le papier les imprime séparément', html.includes('>5 sacs<') && html.includes('>30 pièce(s)<') && !html.includes('5 sacs + 30'));
check('… sans aucune couleur imprimée', !html.includes('BLEU'));
eq('le prix se tape à la pièce pour les deux (même groupe de prix)', cleGroupe(ligneSacs), cleGroupe(ligneEtPieces));
const chiffre = appliquerSaisieBon([ligneSacs, ligneEtPieces], { prixGroupe: { [cleGroupe(ligneSacs)]: '2' } }, 0);
eq('2 MAD la pièce : 40 MAD le sac de 20, 2 MAD la pièce des étagères', chiffre.items.map((l: any) => l.unitPrice), [40, 2]);
eq('… total 5 × 40 + 30 × 2 = 260', chiffre.totalAmount, 260);

// ═════════════════════════════════════════════════════════════════════════════
// PARTIE 3 — les corrections après relecture.
// ═════════════════════════════════════════════════════════════════════════════

console.log('\n── Mise en rayon : la trace se répartit sur les racks (FIFO) ──');
// Le BLEU rangé en deux racks : 10 sacs en A1 (le plus ancien), 20 en B2.
const mvtsDeuxRacks = mvts2.map(m => (m.color === 'BLEU'
  ? { ...m, quantity: 10, locationCode: 'A1' } : m)).concat([
  { articleId: 'ZA', type: 'IN', reason: 'ARRIVAGE', storeId: 'ENTREPOT', date: '2026-09-02', quantity: 20, color: 'BLEU', unitOfMeasure: 'bag', factureId: 'F2', locationCode: 'B2' },
]);
const avantDeuxRacks = calcul2(mvtsDeuxRacks);
const bleuDeuxRacks = ligne2(avantDeuxRacks, 'ZA', 'BLEU');
const mrDeuxRacks = mouvementsMiseEnRayon({
  produit: pZ20,
  couleurs: [{ ligne: bleuDeuxRacks, preparation: preparerCouleur(bleuDeuxRacks, ctx2), saisie: { colis: { carton: 2 } } }],
  magasin: 'CHRIFA', date: '2026-10-01', miseEnRayonId: 'MR20', mouvements: mvtsDeuxRacks, lieux: stores2,
});
eq('2 cartons = 20 sacs : 10 en A1 puis 10 en B2', mrDeuxRacks.sorties.map(m => [m.locationCode, m.quantity]), [['A1', 10], ['B2', 10]]);
eq('… chaque morceau porte SA part en pièces (200 + 200 = 400, pas 800)',
  mrDeuxRacks.sorties.map(m => m.quantiteVente), [200, 200]);
eq('… le nombre de cartons n\'est écrit qu\'une fois', mrDeuxRacks.sorties.map(m => m.nbColis ?? null), [2, null]);
check('… la note dit ce qui est pris ici, en sacs (pas « bag »)',
  /10 sacs pris en A1, sur 20 sacs/.test(mrDeuxRacks.sorties[0].notes) && !/bag/.test(mrDeuxRacks.sorties[0].notes));
eq('… l\'entrée sur les étagères : 400 pièces', mrDeuxRacks.entree?.quantity, 400);

console.log('\n── Mise en rayon : une couleur qui réunit deux commandes ──');
// ZC : le même produit que ZA (fermeture 20 cm, BLEU), autre commande, sacs de 50 pièces.
const ZC = { ...base, id: 'ZC', categoryId: 'Z', size: '20cm', quantity: 10, unitOfMeasure: 'bag', color: 'BLEU', pcsPerBag: 50, bagsPerCarton: 10 };
const ZD = { ...base, id: 'ZD', categoryId: 'Z', size: '20cm', quantity: 10, unitOfMeasure: 'bag', color: 'BLEU', pcsPerBag: 20, bagsPerCarton: 10 };
const ctxFusion = { articles: [...articles2, ZC, ZD], categories: cats2, generalCategories: poles2 };
// La dimension ventilée de chaque article, comme l'écran Emplacements la donne.
const dimensionDe = (id: string) => articleVariantDimension([...articles2, ZC, ZD].find(a => a.id === id));
const calculFusion = (arts: any[], movements: any[]) => computeStockItems(
  arts as any, movements as any, cats2, 'CHRIFA' as any, true, 'ADMIN', stores2, '', poles2, [],
);
const mvtsZC = [...mvts2, { articleId: 'ZC', type: 'IN', reason: 'ARRIVAGE', storeId: 'ENTREPOT', date: '2026-09-03', quantity: 10, color: 'BLEU', unitOfMeasure: 'bag', factureId: 'F3', locationCode: 'C3' }];
const bleuFusion = lignesDeReserve(calculFusion([...articles2, ZC], mvtsZC)).find((i: any) => i.color === 'BLEU' && i.size === '20cm');
eq('les deux commandes sont réunies sur la ligne BLEU', [...(bleuFusion?._mergedArticleIds || [])].sort(), ['ZA', 'ZC']);
const prepFusion = preparerCouleur(bleuFusion, ctxFusion);
check('contenus différents (20 et 50 pièces par sac) : bloqué, rien n\'est deviné',
  !prepFusion.pret && prepFusion.message === MESSAGE_CONTENUS_DIFFERENTS);
check('… avec la raison, pour l\'administrateur', !prepFusion.pret && prepFusion.raisons.some(r => r.includes('ZC')));
const mvtsZD = [...mvts2, { articleId: 'ZD', type: 'IN', reason: 'ARRIVAGE', storeId: 'ENTREPOT', date: '2026-09-03', quantity: 10, color: 'BLEU', unitOfMeasure: 'bag', factureId: 'F3', locationCode: 'C3' }];
const bleuMeme = lignesDeReserve(calculFusion([...articles2, ZD], mvtsZD)).find((i: any) => i.color === 'BLEU' && i.size === '20cm');
const prepMeme = preparerCouleur(bleuMeme, ctxFusion);
check('mêmes contenus (20 pièces par sac) : prête', prepMeme.pret === true);
const mrMeme = mouvementsMiseEnRayon({
  produit: pZ20,
  couleurs: [{ ligne: bleuMeme, preparation: prepMeme, saisie: { colis: { carton: 4 } } }],
  magasin: 'CHRIFA', date: '2026-10-01', miseEnRayonId: 'MR21', mouvements: mvtsZD, lieux: stores2,
});
eq('40 sacs : 30 du rack A1 de ZA, puis 10 du rack C3 de ZD', mrMeme.sorties.map(m => [m.articleId, m.locationCode ?? null, m.quantity]),
  [['ZA', 'A1', 30], ['ZD', 'C3', 10]]);
eq('… la réserve BLEU réunie tombe à 0', lignesDeReserve(calculFusion([...articles2, ZD], [...mvtsZD, ...mrMeme.sorties, mrMeme.entree]))
  .find((i: any) => i.color === 'BLEU' && i.size === '20cm')?.currentQty, 0);
eq('… et le rack C3 se vide (computeLocationContents)', computeLocationContents([...mvtsZD, ...mrMeme.sorties], 'C3', 'ENTREPOT', dimensionDe, stores2), []);

console.log('\n── Emplacements : une sortie écrite sous CHRIFA vide le rack de l\'entrepôt ──');
const contenuA1 = computeLocationContents([...mvts2, ...mr.sorties], 'A1', 'ENTREPOT', dimensionDe, stores2);
eq('A1 (entrepôt) : 30 − 20 sacs BLEU mis en rayon = 10', contenuA1.map(l => [l.color, l.quantity]), [['BLEU', 10]]);
eq('sans les lieux, comparaison stricte (comportement d\'avant)',
  computeLocationContents([...mvts2, ...mr.sorties], 'A1', 'ENTREPOT', dimensionDe).map(l => l.quantity), [30]);

console.log('\n── Journal : totaux par unité, mises en rayon hors totaux ──');
const journal = totauxJournal([...mr.sorties, mr.entree, v.mouvement,
  { type: 'IN', reason: 'ARRIVAGE', quantity: 5, unitOfMeasure: 'bag' }]);
eq('les entrées : 5 sacs (la mise en rayon n\'est pas une entrée)', journal.entrees, [{ libelle: 'sacs', quantite: 5 }]);
eq('les sorties : 30 pièces des étagères (la mise en rayon n\'est pas une sortie)', journal.sorties, [{ libelle: 'pièces (étagères)', quantite: 30 }]);
eq('une mise en rayon comptée à part', journal.misesEnRayon, 1);
eq('le texte des totaux (le plus gros flux en premier)', texteTotaux(journal.net, { signe: true }), '-30 pièces (étagères) · +5 sacs');
eq('le motif en clair', libelleMotif('MISE_EN_RAYON'), 'Mise en rayon — de la réserve vers les étagères');
eq('le stock de chaque ligne', [stockDuMouvement(v.mouvement), stockDuMouvement(mr.sorties[0])], ['Étagères', 'Réserve']);

console.log('\n── Fiches : une ligne Étagères sur UNE seule carte ──');
// Le taffetas TA ventilé en CL-5 et CL-8, chaque qualité avec son nom : deux cartes.
const resCl5 = { articleId: 'TA_CL5', _realArticleId: 'TA', categoryId: 'T', quality: 'CL-5', nameFR: 'Taffetas CL-5', currentQty: 10 };
const resCl8 = { articleId: 'TA_CL8', _realArticleId: 'TA', categoryId: 'T', quality: 'CL-8', nameFR: 'Taffetas CL-8', currentQty: 20 };
const etCl5 = { articleId: 'TA__etagere__cl-5|', _realArticleId: 'TA', _mergedArticleIds: ['TA'], _etagere: true, categoryId: 'T', quality: 'CL-5', nameFR: 'Taffetas CL-5', currentQty: 12.5 };
const etCl8 = { articleId: 'TA__etagere__cl-8|', _realArticleId: 'TA', _mergedArticleIds: ['TA'], _etagere: true, categoryId: 'T', quality: 'CL-8', nameFR: 'Taffetas CL-8', currentQty: 100 };
const { cartes, etageresParCarte } = cartesAvecEtageres([resCl5, resCl8], [etCl5, etCl8]);
eq('deux cartes', cartes.map(([pid]) => pid), ['taffetas cl-5', 'taffetas cl-8']);
eq('la carte CL-5 ne porte que les étagères CL-5 (12,5 m, pas 112,5)', (etageresParCarte.get('taffetas cl-5') || []).map((e: any) => e.currentQty), [12.5]);
eq('la carte CL-8 ne porte que les étagères CL-8', (etageresParCarte.get('taffetas cl-8') || []).map((e: any) => e.currentQty), [100]);
const nomDifferent = { ...etCl5, nameFR: 'TAFFETAS 5' };
eq('un nom légèrement différent se rattache par la clé produit',
  [...cartesAvecEtageres([resCl5, resCl8], [nomDifferent]).etageresParCarte.keys()], ['taffetas cl-5']);
const seul = { ...etCl5, categoryId: 'X', _realArticleId: 'XX', _mergedArticleIds: ['XX'], nameFR: 'Seulement en rayon' };
eq('un produit seulement sur les étagères garde sa carte',
  cartesAvecEtageres([resCl5], [seul]).cartes.map(([pid, vs]) => [pid, vs.length]), [['taffetas cl-5', 1], ['seulement en rayon', 0]]);

console.log('\n── Unités en français, première installation ──');
eq('bag → sac / sacs, rolls → rouleau / rouleaux',
  [uniteEnFrancais('bag', 1), uniteEnFrancais('bag', 10), uniteEnFrancais('rolls', 1), uniteEnFrancais('rolls', 2.5), uniteEnFrancais('m', 3)],
  ['sac', 'sacs', 'rouleau', 'rouleaux', 'm']);
const prodsInstall = produitsDesEtageres(apresMR, cats2, poles2);
eq('déjà mis en rayon : pas une première installation', prodsInstall.find(p => p.size === '20cm')?.dejaSurEtageres, true);
eq('jamais compté ni mis en rayon : première installation', prodsInstall.find(p => p.quality === 'CL-5')?.dejaSurEtageres, false);

console.log(`\n${pass} réussi(s), ${fail} échoué(s)`);
if (fail > 0) process.exit(1);
