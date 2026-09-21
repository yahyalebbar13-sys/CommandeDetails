// L'entrée en stock d'un arrivage et l'écran /stock doivent toujours ventiler la marchandise
// sur la même dimension : sinon elle entre par couleur et s'affiche par qualité (ou l'inverse),
// et le stock devient faux dès la première vente.
// Lancer :
//   npx tsx scripts/test-entree-stock.ts

import { computeStockItems } from '../src/components/stock/stock-app';
import { articleVariantDimension, articleInboundVariants, lignesEntreeManquantes } from '../src/lib/warehouse-locations';

let pass = 0;
let fail = 0;
function check(label: string, ok: boolean, detail = '') {
  if (ok) { pass++; console.log(`  ✓ ${label}`); }
  else { fail++; console.log(`  ✗ ${label} ${detail}`); }
}

/** Les mouvements que pass-to-stock-modal écrirait pour cet article. */
function mouvementsDeLEntree(article: any) {
  const dimension = articleVariantDimension(article);
  return articleInboundVariants(article).map(ligne => ({
    articleId: article.id,
    type: 'IN',
    reason: 'ARRIVAGE',
    storeId: 'ENTREPOT',
    date: '2026-09-01',
    factureId: 'F1',
    quantity: ligne.quantity,
    ...(dimension && ligne.label ? { [dimension]: ligne.label } : {}),
  }));
}

/** Ce que /stock affiche pour cet article, une fois ces mouvements écrits. */
function lignesDeStock(article: any) {
  const items = computeStockItems(
    [{ ...article, status: 'STOCK', stockEntryDate: '2026-09-01' }] as any,
    mouvementsDeLEntree(article) as any,
    [], 'ALL', true, 'ADMIN', [{ id: 'ENTREPOT', type: 'WAREHOUSE' }], '', [], []
  );
  return items.map((i: any) => ({
    dimension: i._qualityKey ? 'quality' : i._colorKey ? 'color' : i._sizeKey ? 'size' : null,
    libelle: i._qualityKey || i._colorKey || i._sizeKey || '',
    quantite: i.currentQty,
  }));
}

const total = (lignes: { quantite: number }[]) => Math.round(lignes.reduce((s, l) => s + l.quantite, 0) * 1000) / 1000;

const cas: { nom: string; article: any; dimension: string | null; libelles: string; quantite: number }[] = [
  {
    nom: 'couleurs seules (quantités dans « rolls »)',
    article: { id: 'A2', categoryId: 'RUB', quantity: 1000, color: 'various',
      colorBreakdown: [{ colorCode: 'ROUGE', rolls: 400 }, { colorCode: 'BLEU', rolls: 600 }] },
    dimension: 'color', libelles: 'ROUGE,BLEU', quantite: 1000,
  },
  {
    nom: 'qualités et couleurs périmées : la qualité prime des deux côtés',
    article: { id: 'A1', categoryId: 'ZIP', quantity: 300, color: 'various',
      qualityBreakdown: [{ quality: 'CL-5', quantity: 200 }, { quality: 'CL-7', quantity: 100 }],
      colorBreakdown: [{ colorCode: '101', rolls: 150 }, { colorCode: '202', rolls: 150 }] },
    dimension: 'quality', libelles: 'CL-5,CL-7', quantite: 300,
  },
  {
    nom: 'ventilation qui dépasse la quantité : entrée en une seule ligne',
    article: { id: 'A3', categoryId: 'RUB', quantity: 600, color: 'various',
      colorBreakdown: [{ colorCode: 'ROUGE', rolls: 550 }, { colorCode: 'BLEU', rolls: 450 }] },
    dimension: null, libelles: '', quantite: 600,
  },
  {
    nom: '« VARIOUS » en majuscules reconnu des deux côtés',
    article: { id: 'A4', categoryId: 'RUB', quantity: 100, color: 'VARIOUS',
      colorBreakdown: [{ colorCode: 'NOIR', rolls: 100 }] },
    dimension: 'color', libelles: 'NOIR', quantite: 100,
  },
  {
    nom: 'tailles',
    article: { id: 'A5', categoryId: 'ACC', quantity: 15, size: 'various',
      sizeBreakdown: [{ size: '20cm', quantity: 10 }, { size: '40cm', quantity: 5 }] },
    dimension: 'size', libelles: '20cm,40cm', quantite: 15,
  },
  {
    nom: 'article sans ventilation',
    article: { id: 'A6', categoryId: 'ACC', quantity: 42, color: 'Noir' },
    dimension: null, libelles: '', quantite: 42,
  },
];

console.log('\n── Entrée en stock et écran /stock ──');
for (const c of cas) {
  const entree = articleVariantDimension(c.article);
  const lignes = lignesDeStock(c.article);
  const ecran = lignes[0]?.dimension ?? null;
  check(`${c.nom} : même dimension à l'entrée et à l'écran (${entree ?? 'aucune'})`,
    entree === c.dimension && ecran === c.dimension, `entrée=${entree} écran=${ecran}`);
  check(`${c.nom} : libellés attendus`,
    lignes.map(l => l.libelle).filter(Boolean).join(',') === c.libelles, JSON.stringify(lignes));
  check(`${c.nom} : quantité totale conservée (${c.quantite})`,
    total(lignes) === c.quantite, JSON.stringify(lignes));
}

// ── Liste de réparation : ce qui n'est pas entré doit se voir ────────────────
// Un dossier « validé en stock » dont les mouvements manquent — en totalité ou en partie —
// doit rester réparable : c'est la seule porte d'entrée vers « Compléter l'Entrée ».

const artCouleurs = { id: 'C1', categoryId: 'RUB', quantity: 1000, color: 'various',
  colorBreakdown: [{ colorCode: 'ROUGE', rolls: 400 }, { colorCode: 'BLEU', rolls: 600 }] };
const artSimple = { id: 'S1', categoryId: 'ACC', quantity: 42, color: 'Noir' };
const artVentilationVide = { id: 'V1', categoryId: 'RUB', quantity: 0, color: 'various',
  colorBreakdown: [{ colorCode: 'ROUGE', rolls: 0 }, { colorCode: 'BLEU', rolls: 0 }] };

const movIn = (articleId: string, champs: any = {}) => ({ articleId, type: 'IN', ...champs });

console.log('\n── Détection des entrées incomplètes ──');

check('dossier entièrement entré : rien ne manque',
  lignesEntreeManquantes([artCouleurs], [movIn('C1', { color: 'ROUGE' }), movIn('C1', { color: 'BLEU' })]) === 0);

check('une seule couleur écrite : la seconde manque',
  lignesEntreeManquantes([artCouleurs], [movIn('C1', { color: 'ROUGE' })]) === 1);

check('aucun mouvement : les deux couleurs manquent',
  lignesEntreeManquantes([artCouleurs], []) === 2);

check('deux articles, un seul entré : une ligne manque',
  lignesEntreeManquantes([artSimple, { ...artSimple, id: 'S2' }], [movIn('S1')]) === 1);

check('article sans ventilation entré : rien ne manque',
  lignesEntreeManquantes([artSimple], [movIn('S1')]) === 0);

check('ventilation entièrement à zéro : rien à entrer, le dossier ne reste pas bloqué',
  lignesEntreeManquantes([artVentilationVide], []) === 0);

check('une sortie ne vaut pas une entrée',
  lignesEntreeManquantes([artSimple], [{ articleId: 'S1', type: 'OUT' }]) === 1);

check("le mouvement d'un autre article ne compte pas",
  lignesEntreeManquantes([artSimple], [movIn('AUTRE')]) === 1);

check('libellé de couleur écrit avec des espaces : reconnu quand même',
  lignesEntreeManquantes([artCouleurs], [movIn('C1', { color: ' ROUGE ' }), movIn('C1', { color: 'BLEU' })]) === 0);

check('couleurs entrées sous la mauvaise dimension : compté comme manquant',
  lignesEntreeManquantes([artCouleurs], [movIn('C1', { quality: 'ROUGE' }), movIn('C1', { quality: 'BLEU' })]) === 2);

check('qualités : la ventilation qui prime est celle de la qualité',
  lignesEntreeManquantes(
    [{ id: 'Q1', categoryId: 'ZIP', quantity: 300, color: 'various',
       qualityBreakdown: [{ quality: 'CL-5', quantity: 200 }, { quality: 'CL-7', quantity: 100 }],
       colorBreakdown: [{ colorCode: '101', rolls: 150 }, { colorCode: '202', rolls: 150 }] }],
    [movIn('Q1', { quality: 'CL-5', color: '101' })]) === 1);

check('dossier sans article : rien à réparer',
  lignesEntreeManquantes([], []) === 0);

check('casse du libellé retouchée après coup : le dossier reste complet',
  lignesEntreeManquantes([artCouleurs], [movIn('C1', { color: 'rouge' }), movIn('C1', { color: 'Bleu' })]) === 0);

console.log(`\n${pass} réussis, ${fail} échoués`);
if (fail > 0) process.exit(1);
