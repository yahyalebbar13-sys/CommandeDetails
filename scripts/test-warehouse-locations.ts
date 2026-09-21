// Tests de l'adressage par variante : entrée en stock par couleur / qualité / taille, et
// sorties FIFO restreintes aux emplacements de la variante sortie.
// Lancer :
//   npx tsx scripts/test-warehouse-locations.ts

import {
  normalizeVariantValue,
  movementMatchesVariant,
  stockItemVariant,
  variantKey,
  breakdownRowQuantity,
  articleVariantDimension,
  articleInboundVariants,
  totalVentilation,
  libelleFixe,
  ventilationIgnoree,
  rehydrateInboundAllocations,
  distributeInboundRows,
  computeArticleLocationStock,
  allocateOutbound,
  splitOutboundLines,
  suggestInboundLocation,
  computeLocationContents,
  remainingToAllocate,
  type StockVariant,
} from '../src/lib/warehouse-locations';

let pass = 0;
let fail = 0;
function check(label: string, ok: boolean, detail = '') {
  if (ok) { pass++; console.log(`  ✓ ${label}`); }
  else { fail++; console.log(`  ✗ ${label} ${detail}`); }
}
const sum = (rows: { quantity: number }[]) => Math.round(rows.reduce((s, r) => s + r.quantity, 0) * 1000) / 1000;
const bleu: StockVariant = { dimension: 'color', value: 'Bleu' };
const rouge: StockVariant = { dimension: 'color', value: 'Rouge' };

console.log('\n── Clés de variante ──');
check('normalisation sans casse ni espaces', normalizeVariantValue('  BLEU ') === 'bleu');
check('mouvement de la variante', movementMatchesVariant({ color: 'bleu ' }, bleu));
check('mouvement d’une autre variante', !movementMatchesVariant({ color: 'Rouge' }, bleu));
check('sans variante : tout mouvement correspond', movementMatchesVariant({ color: 'Rouge' }, null));
check('variante à libellé vide = article entier', movementMatchesVariant({ color: 'Rouge' }, { dimension: 'color', value: ' ' }));
check('qualité : la couleur « various » du mouvement est ignorée',
  movementMatchesVariant({ color: 'various', quality: 'CL-5' }, { dimension: 'quality', value: 'cl-5' }));
check('stockItemVariant : qualité prioritaire',
  JSON.stringify(stockItemVariant({ _qualityKey: 'A', _colorKey: 'B' })) === JSON.stringify({ dimension: 'quality', value: 'A' }));
check('stockItemVariant : couleur', stockItemVariant({ _colorKey: 'Bleu' })?.dimension === 'color');
check('stockItemVariant : article simple', stockItemVariant({}) === null);
check('variantKey', variantKey(bleu) === 'color:bleu' && variantKey(null) === '');

console.log('\n── Lignes d’entrée d’un article ──');
check('quantité couleur lue dans rolls', breakdownRowQuantity({ colorCode: '101', rolls: 120 }) === 120);
check('ancienne ligne couleur avec quantity', breakdownRowQuantity({ colorCode: '101', quantity: 50 }) === 50);

const multiColor = {
  id: 'art1', color: 'various', size: '5000Y', quantity: 300,
  colorBreakdown: [{ colorCode: '101', rolls: 120 }, { colorCode: ' 305 ', rolls: 100 }, { colorCode: '990', rolls: 0 }, { colorCode: '777', rolls: 80 }],
};
const lines = articleInboundVariants(multiColor);
check('article multi-couleurs : dimension couleur', articleVariantDimension(multiColor) === 'color');
check('une ligne par couleur non nulle (bug rolls corrigé)', lines.length === 3, JSON.stringify(lines.map(l => l.label)));
check('libellé couleur nettoyé', lines[1].label === '305' && lines[1].key === 'color:305');
check('quantités des couleurs', sum(lines) === 300);

const multiQuality = {
  id: 'art2', color: 'various', colorBreakdown: [{ colorCode: 'X', rolls: 5 }],
  qualityBreakdown: [{ quality: 'CL-5', quantity: 40 }, { quality: 'CL-8', quantity: 60 }],
};
check('qualité prioritaire sur couleur', articleVariantDimension(multiQuality) === 'quality');
check('lignes par qualité', articleInboundVariants(multiQuality).map(l => l.key).join(',') === 'quality:cl-5,quality:cl-8');

const multiSize = { id: 'art3', size: 'Various', sizeBreakdown: [{ size: '20cm', quantity: 10 }, { size: '40cm', quantity: 5 }] };
check('tailles', articleInboundVariants(multiSize).map(l => l.label).join(',') === '20cm,40cm');

const simple = { id: 'art4', color: 'Noir', quantity: 42 };
const simpleLines = articleInboundVariants(simple);
check('article simple : une ligne sans variante', simpleLines.length === 1 && simpleLines[0].variant === null && simpleLines[0].quantity === 42);
check('couleur unique sans ventilation : pas de dimension', articleVariantDimension({ color: 'various', colorBreakdown: [] }) === null);

console.log('\n── Répartition d’entrée ──');
const drift = distributeInboundRows([{ quantity: 0.1 }, { quantity: 0.2 }], [{ locationCode: 'A-01', quantity: 0.3 }]);
check('pas de ligne fantôme à quantité 0', drift.every(r => r.quantity > 0), JSON.stringify(drift));
check('dérive flottante : tout est placé', drift.every(r => r.locationCode === 'A-01'), JSON.stringify(drift));

// Par variante : chaque ligne reçoit ses propres parts, comme le fera l'écran d'entrée.
const partsByKey: Record<string, { locationCode: string; quantity: number }[]> = {
  'color:101': [{ locationCode: 'A-01-01', quantity: 120 }],
  'color:305': [{ locationCode: 'A-02-01', quantity: 60 }, { locationCode: 'A-02-02', quantity: 40 }],
  // 777 : pas de part → entre sans emplacement
};
const written = lines.flatMap(l => distributeInboundRows([{ color: l.label, quantity: l.quantity }], partsByKey[l.key] || []));
check('conservation de la quantité', sum(written) === 300);
check('101 entièrement en A-01-01', written.filter(r => r.color === '101').every(r => r.locationCode === 'A-01-01'));
check('305 réparti sur deux racks', written.filter(r => r.color === '305').map(r => `${r.locationCode}:${r.quantity}`).join(',') === 'A-02-01:60,A-02-02:40');
check('777 sans emplacement', written.filter(r => r.color === '777').every(r => !r.locationCode));
check('reste à placer par variante', remainingToAllocate(100, partsByKey['color:305']) === 0);

console.log('\n── Relecture « Revoir / Corriger » ──');
const entryMovs = [
  { articleId: 'art1', type: 'IN', color: '101', locationCode: 'A-01', quantity: 120 },
  { articleId: 'art1', type: 'IN', color: '777', locationCode: 'A-01', quantity: 80 },
  { articleId: 'art1', type: 'IN', color: '305', locationCode: 'A-02', quantity: 100, locationId: 'loc2' },
  { articleId: 'art1', type: 'IN', color: '305', quantity: 5 },       // sans emplacement : ignoré
  { articleId: 'other', type: 'IN', color: '101', locationCode: 'A-01', quantity: 9 },
];
const rehydrated = rehydrateInboundAllocations(entryMovs, 'art1', 'color');
check('parts regroupées par variante', Object.keys(rehydrated).sort().join(',') === 'color:101,color:305,color:777');
check('couleurs non contiguës conservées', rehydrated['color:777'][0].locationCode === 'A-01' && rehydrated['color:305'][0].locationCode === 'A-02');
check('locationId conservé', rehydrated['color:305'][0].locationId === 'loc2');
const rehydratedFlat = rehydrateInboundAllocations(entryMovs, 'art1', null);
check('article simple : parts par emplacement', rehydratedFlat[''].map(p => `${p.locationCode}:${p.quantity}`).join(',') === 'A-01:200,A-02:100');

console.log('\n── Sorties FIFO par variante ──');
const stockMovs = [
  { articleId: 'art1', type: 'IN', storeId: 'ENT', color: 'Rouge', locationCode: 'A-01-01', quantity: 100, date: '2026-09-01' },
  { articleId: 'art1', type: 'IN', storeId: 'ENT', color: 'Bleu', locationCode: 'A-02-01', quantity: 50, date: '2026-09-01' },
  { articleId: 'art1', type: 'IN', storeId: 'ENT', color: 'bleu', locationCode: 'A-03-01', quantity: 30, date: '2026-09-10' },
  { articleId: 'art1', type: 'OUT', storeId: 'ENT', color: 'Bleu', locationCode: 'A-02-01', quantity: 10, date: '2026-09-12' },
];
const bleuBuckets = computeArticleLocationStock(stockMovs, 'ENT', 'art1', bleu);
check('stock du Bleu : ses deux racks seulement', bleuBuckets.map(b => `${b.locationCode}:${b.quantity}`).join(',') === 'A-02-01:40,A-03-01:30',
  JSON.stringify(bleuBuckets));
check('sans variante : comportement inchangé (3 racks)', computeArticleLocationStock(stockMovs, 'ENT', 'art1').length === 3);

const sale = allocateOutbound({ movements: stockMovs, storeId: 'ENT', articleId: 'art1', quantity: 60, variant: bleu });
check('vente de Bleu : FIFO dans les racks du Bleu', sale.allocations.map(a => `${a.locationCode}:${a.quantity}`).join(',') === 'A-02-01:40,A-03-01:20',
  JSON.stringify(sale));
check('vente de Bleu : jamais dans le rack du Rouge', sale.allocations.every(a => a.locationCode !== 'A-01-01'));

const tooMuch = allocateOutbound({ movements: stockMovs, storeId: 'ENT', articleId: 'art1', quantity: 100, variant: bleu });
check('au-delà du stock du Bleu : reliquat sans emplacement', tooMuch.unallocated === 30, JSON.stringify(tooMuch));

const vert: StockVariant = { dimension: 'color', value: 'Vert' };
const noVert = allocateOutbound({ movements: stockMovs, storeId: 'ENT', articleId: 'art1', quantity: 5, variant: vert });
check('couleur rangée nulle part : tout sort sans emplacement', noVert.allocations.length === 0 && noVert.unallocated === 5);

const legacy = allocateOutbound({ movements: stockMovs, storeId: 'ENT', articleId: 'art1', quantity: 10 });
check('sans variante : FIFO de l’article comme avant', legacy.allocations[0]?.locationCode === 'A-01-01');

const split = splitOutboundLines(stockMovs, 'ENT', 'art1', 45, { type: 'OUT', color: 'Bleu' }, bleu);
check('lignes de sortie : couleur conservée', split.every(l => l.color === 'Bleu'));
check('lignes de sortie : quantité conservée', sum(split) === 45);
check('lignes de sortie : racks du Bleu', split.map(l => l.locationCode).join(',') === 'A-02-01,A-03-01');

const splitVert = splitOutboundLines(stockMovs, 'ENT', 'art1', 5, { type: 'OUT', color: 'Vert' }, vert);
check('sortie d’une couleur non rangée : une ligne sans emplacement', splitVert.length === 1 && !splitVert[0].locationCode && splitVert[0].quantity === 5);

// Une sortie de Bleu prise autrefois dans le rack du Rouge (FIFO sans variante, ou saisie
// manuelle) : le Rouge ne peut plus puiser au-delà de ce que le rack contient réellement.
const mixedMovs = [
  { articleId: 'q', type: 'IN', storeId: 'ENT', quality: 'A', locationCode: 'R1', quantity: 100, date: '2026-09-01' },
  { articleId: 'q', type: 'IN', storeId: 'ENT', quality: 'B', locationCode: 'R2', quantity: 100, date: '2026-09-01' },
  { articleId: 'q', type: 'OUT', storeId: 'ENT', quality: 'B', locationCode: 'R1', quantity: 30, date: '2026-09-02' },
];
const qa: StockVariant = { dimension: 'quality', value: 'A' };
const capped = computeArticleLocationStock(mixedMovs, 'ENT', 'q', qa);
check('rack plafonné par le solde réel de l’article', capped[0]?.quantity === 70, JSON.stringify(capped));
const saleA = allocateOutbound({ movements: mixedMovs, storeId: 'ENT', articleId: 'q', quantity: 90, variant: qa });
check('jamais un rack négatif : le reste sort sans emplacement', saleA.allocations[0]?.quantity === 70 && saleA.unallocated === 20,
  JSON.stringify(saleA));

// Dérive flottante : un rack vidé en décimales ne doit plus compter.
const driftMovs = [
  { articleId: 'm', type: 'IN', storeId: 'ENT', locationCode: 'A-01', quantity: 1.1, date: '2026-09-01' },
  { articleId: 'm', type: 'OUT', storeId: 'ENT', locationCode: 'A-01', quantity: 1.0, date: '2026-09-02' },
  { articleId: 'm', type: 'OUT', storeId: 'ENT', locationCode: 'A-01', quantity: 0.1, date: '2026-09-03' },
  { articleId: 'm', type: 'IN', storeId: 'ENT', locationCode: 'B-01', quantity: 50, date: '2026-09-04' },
];
check('rack vidé en décimales : ignoré', computeArticleLocationStock(driftMovs, 'ENT', 'm').length === 1);
check('suggestion possible après un rack vidé en décimales', suggestInboundLocation(driftMovs, 'ENT', 'm')?.locationCode === 'B-01');
const decSale = allocateOutbound({ movements: driftMovs, storeId: 'ENT', articleId: 'm', quantity: 0.3 });
check('allocation décimale propre', decSale.allocations.length === 1 && decSale.allocations[0].quantity === 0.3 && decSale.unallocated === 0,
  JSON.stringify(decSale));

console.log('\n── Suggestion d’emplacement à l’entrée ──');
check('sans variante : article sur 3 racks → pas de suggestion', suggestInboundLocation(stockMovs, 'ENT', 'art1') === null);
check('retour de Rouge : son rack unique', suggestInboundLocation(stockMovs, 'ENT', 'art1', rouge)?.locationCode === 'A-01-01');
check('retour de Bleu : deux racks → pas de suggestion', suggestInboundLocation(stockMovs, 'ENT', 'art1', bleu) === null);

console.log('\n── Contenu d’un emplacement ──');
const contentMovs = [
  { articleId: 'art1', productName: 'Fil', type: 'IN', storeId: 'ENT', color: 'Rouge', locationCode: 'A-01', quantity: 100 },
  { articleId: 'art1', productName: 'Fil', type: 'IN', storeId: 'ENT', color: 'Bleu', locationCode: 'A-01', quantity: 50 },
  { articleId: 'art1', productName: 'Fil', type: 'OUT', storeId: 'ENT', color: 'bleu', locationCode: 'A-01', quantity: 50 },
  { articleId: 'art1', productName: 'Fil', type: 'IN', storeId: 'SS', color: 'Vert', locationCode: 'A-01', quantity: 7 },
];
const contents = computeLocationContents(contentMovs, 'A-01', 'ENT');
check('détail par couleur, variantes vidées retirées', contents.length === 1 && contents[0].color === 'Rouge' && contents[0].quantity === 100,
  JSON.stringify(contents));
check('sans lieu : tous lieux confondus', computeLocationContents(contentMovs, 'A-01').length === 2);

// Qualité : l'entrée écrit color='various', la vente écrit la couleur de la ligne de stock.
const qualityMovs = [
  { articleId: 'q1', type: 'IN', storeId: 'ENT', quality: 'CL-5', color: 'various', locationCode: 'B-01', quantity: 40 },
  { articleId: 'q1', type: 'OUT', storeId: 'ENT', quality: 'cl-5', color: 'Rouge', locationCode: 'B-01', quantity: 15 },
  { articleId: 'q1', type: 'IN', storeId: 'ENT', quality: 'CL-8', color: 'various', locationCode: 'B-01', quantity: 10 },
  { articleId: 'c1', type: 'IN', storeId: 'ENT', color: 'Vert', quality: 'Premium', locationCode: 'B-01', quantity: 5 },
  { articleId: 's1', type: 'IN', storeId: 'ENT', color: 'Noir', size: '20cm', locationCode: 'B-01', quantity: 3 },
];
const dims: Record<string, any> = { q1: 'quality', c1: 'color', s1: null };
const qContents = computeLocationContents(qualityMovs, 'B-01', 'ENT', id => dims[id]);
const cl5 = qContents.find(l => l.articleId === 'q1' && l.quality === 'CL-5');
check('qualité : entrée et vente se compensent malgré la couleur', cl5?.quantity === 25, JSON.stringify(qContents));
check('qualité : une ligne par qualité', qContents.filter(l => l.articleId === 'q1').length === 2);
check('couleur : la qualité de l’article ne crée pas de variante', qContents.find(l => l.articleId === 'c1')?.color === 'Vert'
  && qContents.find(l => l.articleId === 'c1')?.quality === undefined);
check('article simple : une ligne avec ses attributs', qContents.filter(l => l.articleId === 's1').length === 1
  && qContents.find(l => l.articleId === 's1')?.size === '20cm');
const noDims = computeLocationContents(qualityMovs, 'B-01', 'ENT');
check('sans dimensions : « various » compte pour vide', noDims.every(l => l.color !== 'various'));

console.log('\n── Une seule ventilation par article ──');
// Priorité fixe qualité → couleur → taille : la même que le calcul du stock (computeStockItems).
// Entrée et écran doivent toujours ventiler sur la même dimension.
const qualiteEtCouleurs = {
  quantity: 600,
  color: 'various',
  qualityBreakdown: [{ quality: 'CL-5', quantity: 600 }],
  colorBreakdown: [{ colorCode: '101', rolls: 550 }, { colorCode: '305', rolls: 450 }],
};
check('deux ventilations : la qualité prime, comme à l’écran',
  articleVariantDimension(qualiteEtCouleurs) === 'quality');
check('total entrant = quantité de l’article',
  articleInboundVariants(qualiteEtCouleurs).reduce((s, l) => s + l.quantity, 0) === 600);

// Ventilation périmée seule : l'ancienne saisie recopiait les couleurs de la commande entière
// sur chaque article éclaté par prix. La suivre ferait entrer la marchandise deux fois.
const couleursDeLaCommandeEntiere = {
  quantity: 600,
  color: 'various',
  colorBreakdown: [{ colorCode: '101', rolls: 550 }, { colorCode: '305', rolls: 450 }],
};
check('ventilation qui dépasse la quantité : écartée',
  articleVariantDimension(couleursDeLaCommandeEntiere) === null);
const uneSeuleLigne = articleInboundVariants(couleursDeLaCommandeEntiere);
check('l’article entre alors en une seule ligne', uneSeuleLigne.length === 1 && uneSeuleLigne[0].quantity === 600);
const ignoree = ventilationIgnoree(couleursDeLaCommandeEntiere);
check('la ventilation écartée est signalée', ignoree?.dimension === 'color' && ignoree?.total === 1000);
check('ventilation juste : rien à signaler', ventilationIgnoree(qualiteEtCouleurs) === null);
check('ventilation incomplète (moins que la quantité) : suivie quand même',
  articleVariantDimension({ quantity: 1000, color: 'various', colorBreakdown: [{ colorCode: '101', rolls: 950 }] }) === 'color');
check('total d’une ventilation, quantity ou rolls', totalVentilation([{ rolls: 550 }, { quantity: 450 }]) === 1000);

console.log('\n── « various » n’est jamais une valeur ──');
check('various en minuscules', libelleFixe('various') === null);
check('Various avec espaces', libelleFixe('  Various ') === null);
check('VARIOUS en majuscules', libelleFixe('VARIOUS') === null);
check('vide', libelleFixe('') === null && libelleFixe(null) === null && libelleFixe(undefined) === null);
check('vraie couleur gardée, espaces retirés', libelleFixe(' BLEU CIEL ') === 'BLEU CIEL');

console.log(`\n${pass} réussis, ${fail} échoués`);
if (fail > 0) process.exit(1);
