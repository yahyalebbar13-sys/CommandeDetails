// Le rapport « Cartons et rouleaux » de /stock : produits prêts, à compléter, pôles à régler.
//
// Lancer :
//   npx tsx scripts/test-rapport-cartons-rouleaux.ts

import { construireRapportCartonsRouleaux } from '../src/lib/rapport-cartons-rouleaux';

let pass = 0;
let fail = 0;
function check(label: string, ok: boolean, detail = '') {
  if (ok) { pass++; console.log(`  ✓ ${label}`); }
  else { fail++; console.log(`  ✗ ${label} ${detail}`); }
}
const eq = (label: string, obtenu: any, attendu: any) =>
  check(label, obtenu === attendu, `→ obtenu ${JSON.stringify(obtenu)}, attendu ${JSON.stringify(attendu)}`);

const poles = [
  { id: 'PZ', name: 'NYLON ZIPPER', specType: 'zipper', uniteAchat: 'pièces', uniteVente: 'pièces' },
  { id: 'PT', name: 'TAFFETA FABRIC', specType: 'fabric', uniteAchat: 'm', uniteVente: 'm' },
  { id: 'PR', name: 'RIBBON' },                         // ni type ni unité de vente
];
const categories = [
  { id: 'CZ', name: 'NYLON N°3', generalCategoryId: 'PZ', zipperQualities: [{ label: 'CL-5', pcsPerBag: 100, bagsPerCarton: 20 }, { label: 'AUTOLOCK' }] },
  { id: 'CT', name: 'TAFFETA 190T', generalCategoryId: 'PT' },
  { id: 'CR', name: 'SATIN', generalCategoryId: 'PR' },
];
const articles = [
  // Une fermeture ventilée par qualité : deux lignes, deux cartons différents.
  { id: 'A1', categoryId: 'CZ', quality: 'VARIOUS', stockEntryDate: '2026-09-01', unitOfMeasure: 'pcs',
    qualityBreakdown: [{ quality: 'CL-5', quantity: 100 }, { quality: 'AUTOLOCK', quantity: 50, pcsPerBag: 50 }] },
  // Le même produit CL-5, arrivé plus tôt, avec un autre carton.
  { id: 'A0', categoryId: 'CZ', quality: 'CL-5', stockEntryDate: '2026-06-01', unitOfMeasure: 'pcs', pcsPerBag: 120, bagsPerCarton: 10 },
  { id: 'A2', categoryId: 'CT', unitOfMeasure: 'm', rollLength: 100, rollLengthUnit: 'yds' },
  { id: 'A3', categoryId: 'CR', unitOfMeasure: 'm', rollLength: 50 },
  { id: 'A4', categoryId: 'CT', unitOfMeasure: 'm', rollLength: 50, rollLengthUnit: 'm', color: 'ROUGE' },
];
// Comme computeStockItems : la ligne fusionnée garde les champs de l'article CANONIQUE (le plus
// petit id, ici A0, non ventilé) — donc sans `_qualityKey`.
const stockItems = [
  { articleId: 'A0', _realArticleId: 'A0', quality: 'CL-5', unitOfMeasure: 'pièces',
    productName: 'NYLON CL-5', qtyByStore: { CHRIFA: 500, ENTREPOT1: 1000 }, _mergedArticleIds: ['A0', 'A1'] },
  { articleId: 'A1__quality__AUTOLOCK', _realArticleId: 'A1', _qualityKey: 'AUTOLOCK', quality: 'AUTOLOCK', unitOfMeasure: 'pièces',
    productName: 'NYLON AUTOLOCK', qtyByStore: { CHRIFA: 300 } },
  { articleId: 'A2', unitOfMeasure: 'm', productName: 'TAFFETA', qtyByStore: { CHRIFA: 200 } },
  { articleId: 'A3', unitOfMeasure: 'm', productName: 'SATIN', qtyByStore: { CHRIFA: 80 } },
  // Rien en stock : absent du rapport.
  { articleId: 'A4', unitOfMeasure: 'm', productName: 'TAFFETA ROUGE', color: 'ROUGE', qtyByStore: { CHRIFA: 0 } },
];

const r = construireRapportCartonsRouleaux(stockItems, articles, categories, poles, [{ id: 'X' }]);
const produit = (rap: any, nom: string) => rap.poles.flatMap((p: any) => p.produits).find((p: any) => p.nom === nom);

console.log('\n── Les compteurs ──');
eq('3 pôles ont du stock', r.compteurs.polesEnStock, 3);
eq('produits prêts : CL-5 et le taffetas', r.compteurs.produitsPrets, 2);
eq('produits à compléter : AUTOLOCK et le satin', r.compteurs.produitsACompleter, 2);
eq('un pôle sans unité de vente (RIBBON)', r.compteurs.polesSansUniteVente, 1);
eq('un pôle sans type confirmé (RIBBON)', r.compteurs.polesSansType, 1);

console.log('\n── Les produits ──');
{
  const cl5 = produit(r, 'NYLON CL-5');
  eq('CL-5 : stock de tous les lieux', cl5?.stock, 1500);
  // La ligne fusionnée ne porte pas de _qualityKey : la qualité du groupe sert à retrouver la
  // ligne de ventilation CL-5 de A1 (sinon on lirait les champs d'article de A1, ou rien).
  eq('CL-5 : l’arrivage le plus récent (A1, ventilé) fait foi : catalogue 100 × 20', cl5?.resultat.colis[0]?.contenu, 2000);
  eq('CL-5 : l’autre arrivage, différent, est signalé', cl5?.variantes.length, 1);
  check('…avec son carton', /10 sacs × 120 pcs = 1 200 pcs/.test(cl5?.variantes[0]?.resultat.colis[0]?.detail || ''), JSON.stringify(cl5?.variantes));
  check('…et son arrivage', /^arrivage /.test(cl5?.variantes[0]?.libelle || ''), cl5?.variantes[0]?.libelle);
  const auto = produit(r, 'NYLON AUTOLOCK');
  // Pcs/sac sur la ligne de ventilation ; Sacs/carton ni sur l'arrivage ni au catalogue.
  eq('AUTOLOCK : pas prêt', auto?.pret, false);
  eq('AUTOLOCK : la consigne vise la qualité N°2 de la famille', auto?.resultat.manques[0]?.texte,
    'Saisir « Sacs/carton » pour la qualité N°2 (AUTOLOCK) de la famille NYLON N°3 dans /gestion → Catalogue → Qualités');
  const taffetas = produit(r, 'TAFFETA');
  eq('taffetas : 1 rouleau = 91,44 m', taffetas?.resultat.colis[0]?.contenu, 91.44);
  check('le produit sans stock n’apparaît pas', !produit(r, 'TAFFETA ROUGE'));
}

console.log('\n── Les consignes du pôle ──');
{
  const ribbon = r.poles.find(p => p.nom === 'RIBBON');
  eq('RIBBON : type supposé', ribbon?.typeDevine, true);
  eq('RIBBON : l’en-tête dit le type réellement utilisé', ribbon?.type, 'tape');
  check('RIBBON : la ligne logistique est réclamée', !!ribbon?.consignes.some(t => /Choisir la ligne logistique du pôle RIBBON/.test(t)), JSON.stringify(ribbon?.consignes));
  // Le pôle n'a aucune unité, et son stock est tout en « m » : l'achat d'abord, sur « m ».
  check('RIBBON : l’unité d’achat d’abord, sur l’unité du stock', !!ribbon?.consignes.some(t => /^Fixer d'abord l'unité d'achat du pôle RIBBON sur « m »/.test(t)), JSON.stringify(ribbon?.consignes));
  const zip = r.poles.find(p => p.nom === 'NYLON ZIPPER');
  eq('NYLON ZIPPER : rien à régler au pôle', zip?.consignes.length, 0);
  eq('les pôles sont rangés par nom', r.poles.map(p => p.nom).join(','), 'NYLON ZIPPER,RIBBON,TAFFETA FABRIC');
}

console.log('\n── Un ancien arrivage incalculable rend le produit « à compléter » ──');
{
  const rap = construireRapportCartonsRouleaux(
    [
      { articleId: 'T9', unitOfMeasure: 'm', productName: 'TAFFETA', qtyByStore: { CHRIFA: 500 } },
      { articleId: 'T1', unitOfMeasure: 'm', productName: 'TAFFETA', qtyByStore: { CHRIFA: 4000 } },
    ],
    [
      { id: 'T9', categoryId: 'CT', unitOfMeasure: 'm', rollLength: 100, rollLengthUnit: 'm', stockEntryDate: '2026-09-01' },
      { id: 'T1', categoryId: 'CT', unitOfMeasure: 'm', stockEntryDate: '2026-06-01' },   // aucune longueur
    ],
    categories, poles,
  );
  const t = produit(rap, 'TAFFETA');
  eq('pas prêt', t?.pret, false);
  eq('compté « à compléter »', rap.compteurs.produitsACompleter, 1);
  eq('l’arrivage de juin est listé', t?.variantes.length, 1);
  check('…avec sa consigne', !!t?.variantes[0]?.resultat.manques.some((m: any) => /Long\. rouleau/.test(m.texte)), JSON.stringify(t?.variantes));
}

console.log('\n── Même BL, tailles différentes : on dit la taille, pas « autre arrivage » ──');
{
  const rap = construireRapportCartonsRouleaux(
    [
      { articleId: 'B1', unitOfMeasure: 'pièces', productName: 'NYLON CL-5', quality: 'CL-5', size: '20CM', qtyByStore: { CHRIFA: 400 } },
      { articleId: 'B2', unitOfMeasure: 'pièces', productName: 'NYLON CL-5', quality: 'CL-5', size: '60CM', qtyByStore: { CHRIFA: 400 } },
    ],
    [
      { id: 'B1', categoryId: 'CZ', quality: 'CL-5', size: '20CM', factureId: 'F1', stockEntryDate: '2026-08-28', pcsPerBag: 200, bagsPerCarton: 10 },
      { id: 'B2', categoryId: 'CZ', quality: 'CL-5', size: '60CM', factureId: 'F1', stockEntryDate: '2026-08-28', pcsPerBag: 100, bagsPerCarton: 10 },
    ],
    categories, poles, [{ id: 'F1', noBL: '777', arrivalDate: '2026-08-28' }],
  );
  const p = produit(rap, 'NYLON CL-5');
  eq('une variante', p?.variantes.length, 1);
  eq('nommée par sa taille', p?.variantes[0]?.libelle, 'taille 60CM');
  eq('le calcul retenu aussi', p?.precision, 'taille 20CM');
  eq('à date égale, le choix est stable (plus petit id)', p?.resultat.colis[0]?.contenu, 2000);
}

console.log('\n── Des unités différentes ne s’additionnent pas ──');
{
  const rap = construireRapportCartonsRouleaux(
    [
      { articleId: 'N1', unitOfMeasure: 'gross (144p)', productName: 'BOUTON', quality: '18L', color: 'NOIR', qtyByStore: { CHRIFA: 20 } },
      { articleId: 'N2', unitOfMeasure: 'pièces', productName: 'BOUTON', quality: '18L', color: 'BLANC', qtyByStore: { CHRIFA: 3000 } },
    ],
    [
      { id: 'N1', categoryId: 'CB', quality: '18L', unitOfMeasure: 'gross (144p)' },
      { id: 'N2', categoryId: 'CB', quality: '18L', unitOfMeasure: 'pièces' },
    ],
    [{ id: 'CB', name: 'BOUTON 4T', generalCategoryId: 'PB' }],
    [{ id: 'PB', name: 'BOUTONS' }],
  );
  const p = produit(rap, 'BOUTON');
  eq('deux unités, deux stocks', p?.stocks.map((s: any) => `${s.quantite} ${s.unite}`).join(' + '), '20 gross (144p) + 3000 pièces');
  eq('pas de total trompeur', p?.stock, null);
  const pole = rap.poles[0];
  check('pôle sans unité, stock en deux unités : attendre l’étape 3',
    pole?.consignes.some(t => /ne la fixer qu'au passage au carton\/rouleau — son stock est compté en gross \(144p\), pièces/.test(t)) ?? false,
    JSON.stringify(pole?.consignes));
}

console.log('\n── Une unité de vente qui ne convient pas compte comme absente ──');
{
  const rap = construireRapportCartonsRouleaux(
    [{ articleId: 'K1', unitOfMeasure: 'kg', productName: 'FIL', qtyByStore: { CHRIFA: 10 } }],
    [{ id: 'K1', categoryId: 'CK', unitOfMeasure: 'kg', pcsPerBag: 10, bagsPerCarton: 10 }],
    [{ id: 'CK', name: 'FIL 40/2', generalCategoryId: 'PK' }],
    [{ id: 'PK', name: 'THREAD', specType: 'thread', uniteAchat: 'kg', uniteVente: 'kg' }],
  );
  eq('compté sans unité de vente valable', rap.compteurs.polesSansUniteVente, 1);
  eq('l’en-tête le sait', rap.poles[0]?.uniteVenteValable, false);
}

console.log(`\n${pass} réussis, ${fail} échoués`);
if (fail > 0) process.exit(1);
