// Le papier de la demande d'import : c'est lui que le commercial vise, et c'est lui que le
// magasin a trouvé illisible — neuf colonnes, et les couleurs entassées dans la case du produit.
// Ces contrôles relisent le PDF produit : ce qui doit y être, ce qui ne doit JAMAIS y être.
// Lancer :
//   npx tsx scripts/test-pdf-demande-import.ts

import { construireDemandesImportPDF } from '../src/lib/pdf-demande-import';

let pass = 0;
let fail = 0;
function check(label: string, ok: boolean, detail = '') {
  if (ok) { pass++; console.log(`  ✓ ${label}`); }
  else { fail++; console.log(`  ✗ ${label} ${detail}`); }
}

const categories = [{ id: 'f1', name: 'DOUBLURE', generalCategoryId: 'p1' }];
const generalCategories = [{ id: 'p1', name: 'FABRIC', specType: 'fabric' }];

const multicouleur = {
  id: 'a1',
  name: 'DOUBLURE POLYESTER',
  nameFR: 'DOUBLURE POLYESTER 180G',
  categoryId: 'DOUBLURE',
  generalCategoryId: 'p1',
  color: 'various',
  quantity: 4000,
  unitOfMeasure: 'm',
  gsm: '180',
  fabricWidth: 150,
  purchasePricePerUnit: 12.5,
  colorBreakdown: [
    { colorCode: 'NOIR', rolls: 1600 },
    { colorCode: 'BEIGE', rolls: 1200 },
    { colorCode: 'BLANC', rolls: 800 },
    { colorCode: 'BLEU MARINE', rolls: 400 },
  ],
  notes: 'Rupture depuis trois semaines, deux ateliers en redemandent chaque jour.',
};

const simple = {
  id: 'a2',
  nameFR: 'CURSEUR N5 AUTOLOCK',
  categoryId: 'CURSEUR',
  color: 'NICKEL',
  size: 'N5',
  quantity: 20000,
  unitOfMeasure: 'pcs',
  notes: '',
};

const qualites = {
  id: 'a3',
  nameFR: 'FERMETURE N5 C/E',
  categoryId: 'ZIP',
  quality: 'various',
  quantity: 3000,
  unitOfMeasure: 'pcs',
  qualityBreakdown: [
    { quality: 'CL-5', quantity: 2000 },
    { quality: 'AUTOLOCK', quantity: 1000 },
  ],
};

/** Ce que le PDF écrit réellement : position, page et texte de chaque fragment. */
async function lirePdf(demandes: any[], options: any = {}) {
  const { doc, fichier } = await construireDemandesImportPDF(demandes, { categories, generalCategories, ...options });
  const brut = Buffer.from(doc.output('arraybuffer')).toString('latin1');
  // Chaque page a son propre flux : on les sépare pour savoir sur LAQUELLE chaque mot est écrit.
  const flux = brut.split('endstream').filter(bloc => /Td\s*\(/.test(bloc));
  const ecrits = flux.flatMap((bloc, page) =>
    Array.from(bloc.matchAll(/([-\d.]+) ([-\d.]+) Td\s*\((.*?)\) Tj/g))
      .map(m => ({ x: parseFloat(m[1]), y: parseFloat(m[2]), texte: m[3], page: page + 1 })));
  return { doc, fichier, ecrits, texte: ecrits.map(e => e.texte).join(' ') };
}

/** La page où un texte est écrit pour la première fois (0 s'il est absent). */
const pageDe = (lu: { ecrits: { texte: string; page: number }[] }, motif: string) =>
  lu.ecrits.find(e => e.texte.includes(motif))?.page ?? 0;

const uneDemande = (article: any, magasin = 'CHRIFA') => ({
  article,
  nomProduit: article.nameFR,
  magasin,
  demandeeLe: '2026-09-20',
  justification: article.notes,
});

(async () => {
  console.log('\n── Une demande multicouleur ──');
  const multi = await lirePdf([uneDemande(multicouleur)]);
  check('le document sort', multi.doc.getNumberOfPages() >= 1);
  check('le nom du produit est écrit', multi.texte.includes('DOUBLURE POLYESTER 180G'));
  check('le magasin demandeur est nommé', multi.texte.includes('CHRIFA'));
  check('le visa du commercial a sa place', multi.texte.toUpperCase().includes('VISA DU COMMERCIAL'));
  check('la justification du magasin est reprise', multi.texte.includes('Rupture depuis trois semaines'));

  console.log('\n── Les couleurs, une par ligne ──');
  for (const couleur of ['NOIR', 'BEIGE', 'BLANC', 'BLEU MARINE']) {
    check(`« ${couleur} » a sa propre ligne`, multi.texte.includes(couleur));
  }
  check('chaque couleur porte sa quantité',
    ['1.600', '1.200', '800', '400'].every(q => multi.texte.includes(q)), multi.texte.slice(0, 200));
  check('le tableau des couleurs porte un total', multi.texte.includes('TOTAL') && multi.texte.includes('4.000'));
  check('le titre du tableau nomme la dimension', multi.texte.toUpperCase().includes('COULEURS DEMANDÉES'.toUpperCase())
    || multi.texte.toUpperCase().includes('COULEURS'));
  check('« various » n’est jamais imprimé', !/various/i.test(multi.texte), multi.texte);

  console.log('\n── Aucun prix, jamais ──');
  check('aucun prix d’achat n’apparaît', !multi.texte.includes('12,5') && !multi.texte.includes('12.5'));
  check('aucun mot d’argent n’apparaît',
    !/prix|montant|valeur|total value|MAD|USD|\$/i.test(multi.texte.replace(/TOTAL/g, '')),
    multi.texte.slice(0, 300));

  console.log('\n── La charte /gestion ──');
  check('le document porte l’identité LEBTEX', multi.texte.includes('LEBTEX'));
  check('le titre est celui du document', multi.texte.includes("DEMANDE D'IMPORT"));
  check('les pages sont numérotées', /Page 1 \/ \d/.test(multi.texte));
  check('le processus est rappelé',
    multi.texte.toLowerCase().includes('commercial') && multi.texte.toLowerCase().includes('import'));
  // A4 = 595 pt de large, marge 14 mm ≈ 40 pt.
  check('rien ne déborde de la marge droite',
    multi.ecrits.every(e => e.x < 595 - 34), String(Math.max(...multi.ecrits.map(e => e.x))));
  check('rien ne sort de la page en hauteur',
    multi.ecrits.every(e => e.y > 5 && e.y < 838),
    `${Math.min(...multi.ecrits.map(e => e.y))} → ${Math.max(...multi.ecrits.map(e => e.y))}`);

  console.log('\n── Les autres formes de demande ──');
  const fixe = await lirePdf([uneDemande(simple)]);
  check('un produit sans ventilation garde ses précisions',
    fixe.texte.includes('NICKEL') && fixe.texte.includes('N5'));
  check('et n’affiche aucun tableau de couleurs', !fixe.texte.toUpperCase().includes('COULEURS DEMAND'));

  const parQualite = await lirePdf([uneDemande(qualites)]);
  check('une ventilation par qualité sort son propre tableau',
    parQualite.texte.includes('CL-5') && parQualite.texte.includes('AUTOLOCK')
    && parQualite.texte.toUpperCase().includes('QUALIT'));

  console.log('\n── Plusieurs demandes, plusieurs magasins ──');
  const liste = await lirePdf([
    uneDemande(multicouleur, 'CHRIFA'),
    uneDemande(simple, 'CHRIFA'),
    uneDemande(qualites, 'DERB OMAR'),
  ]);
  check('les trois demandes sont numérotées',
    ['#1', '#2', '#3'].every(n => liste.texte.includes(n)), liste.texte.slice(0, 150));
  check('les magasins sont séparés', liste.texte.includes('DERB OMAR') && liste.texte.includes('CHRIFA'));
  check('l’en-tête annonce plusieurs magasins', liste.texte.includes('Plusieurs magasins'));
  check('le nom de fichier est utilisable tel quel',
    /^Demande-Import_.*_\d{4}-\d{2}-\d{2}\.pdf$/.test(liste.fichier), liste.fichier);
  check('rien ne déborde sur un document chargé',
    liste.ecrits.every(e => e.x < 595 - 34 && e.y > 5 && e.y < 838));

  console.log('\n── Cas limites ──');
  const vide = await lirePdf([uneDemande({ id: 'x', quantity: 0, unitOfMeasure: '' })]);
  check('une demande sans rien ne casse pas', vide.doc.getNumberOfPages() === 1);
  const beaucoup = await lirePdf(
    Array.from({ length: 14 }, (_, i) => uneDemande({ ...multicouleur, id: `m${i}`, nameFR: `PRODUIT ${i + 1}` })));
  check('quatorze demandes passent sur plusieurs pages', beaucoup.doc.getNumberOfPages() >= 3,
    String(beaucoup.doc.getNumberOfPages()));
  check('et rien ne sort de la page',
    beaucoup.ecrits.every(e => e.y > 5 && e.y < 838),
    `${Math.min(...beaucoup.ecrits.map(e => e.y))} → ${Math.max(...beaucoup.ecrits.map(e => e.y))}`);

  console.log('\n── Ce que la relecture avait trouvé ──');
  // Une fermeture ventilée par couleur reste une fermeture CL-5 en N5 : c'est ce que le
  // commercial vérifie avant de viser.
  const ventileMaisPrecis = await lirePdf([uneDemande({
    id: 'a4', nameFR: 'FERMETURE N5 C/E', categoryId: 'ZIP', quality: 'CL-5', size: 'N5',
    color: 'various', quantity: 3000, unitOfMeasure: 'pcs',
    colorBreakdown: [{ colorCode: 'NOIR', rolls: 2000 }, { colorCode: 'BEIGE', rolls: 1000 }],
  })]);
  check('la qualité fixe survit à une ventilation par couleur', ventileMaisPrecis.texte.includes('CL-5'),
    ventileMaisPrecis.texte.slice(0, 220));
  check('la taille fixe aussi', ventileMaisPrecis.texte.includes('N5'));
  check('et la couleur ventilée n’est pas répétée au-dessus de son tableau',
    (ventileMaisPrecis.texte.match(/NOIR/g) || []).length === 1);

  const justifLongue = 'Rupture depuis trois semaines, deux ateliers en redemandent chaque jour et le client '
    + "de Derb Omar menace d'annuler sa commande de janvier si on ne le sert pas avant la fin du mois.";
  const longue = await lirePdf([uneDemande({ ...simple, notes: justifLongue })]);
  check('une justification longue est imprimée en entier',
    justifLongue.split(' ').every(mot => longue.texte.includes(mot.replace(/[.,]/g, ''))),
    longue.texte.slice(-260));

  const nomLong = 'DOUBLURE POLYESTER 180G IMPERMEABLE ENDUIT PU LARGEUR 150 CM COLORIS NOIR PROFOND QUALITE EXPORT';
  const long = await lirePdf([uneDemande({ ...simple, nameFR: nomLong })]);
  check('un nom de produit long passe sur deux lignes, sans être coupé',
    long.texte.includes('QUALITE EXPORT'), long.texte.slice(0, 260));

  const fermeture = await lirePdf([uneDemande({
    id: 'a5', nameFR: 'FERMETURE N5 C/E 60CM', categoryId: 'f2', generalCategoryId: 'p2',
    quantity: 5000, unitOfMeasure: 'pcs', length: '60', zipperType: 'C/E', slider: 'AUTOLOCK',
    sliderType: 'AUTO', tapeWeightGsm: 250, pcsPerBag: 100, bagsPerCarton: 20,
  })], {
    categories: [...categories, { id: 'f2', name: 'ZIP', generalCategoryId: 'p2' }],
    generalCategories: [...generalCategories, { id: 'p2', name: 'ZIPPER', specType: 'zipper' }],
  });
  check('toutes les caractéristiques d’une fermeture sont imprimées',
    ['60', 'C/E', 'AUTOLOCK', '250', '100', '20'].every(v => fermeture.texte.includes(v)),
    fermeture.texte.slice(0, 300));

  // Une carte ne doit jamais être séparée de son tableau de couleurs.
  const serie = await lirePdf(Array.from({ length: 6 }, (_, i) =>
    uneDemande({ ...multicouleur, id: `s${i}`, nameFR: `PRODUIT ${i + 1}`, notes: justifLongue })));
  const separees = Array.from({ length: 6 }, (_, i) => i + 1)
    .filter(n => pageDe(serie, `#${n}`) !== serie.ecrits.filter(e => e.texte.includes('COULEURS'))[n - 1]?.page);
  check('chaque carte et son tableau restent sur la même page', separees.length === 0,
    `cartes séparées : ${separees.join(', ')}`);

  const sansQuantite = await lirePdf([uneDemande({
    id: 'a6', nameFR: 'RUBAN SATIN', categoryId: 'RUBAN', color: 'various', quantity: 2000, unitOfMeasure: 'm',
    colorBreakdown: [{ colorCode: 'NOIR', rolls: 1000 }, { colorCode: 'BEIGE' }, { colorCode: 'BLANC', rolls: 1000 }],
  })]);
  check('une couleur sans quantité demande une précision au lieu d’annoncer zéro',
    sansQuantite.texte.includes('préciser') && !/ 0 m/.test(sansQuantite.texte),
    sansQuantite.texte.slice(0, 260));

  const sousTitreLong = await lirePdf([uneDemande(simple)], {
    sousTitre: 'Demande du 20/09/2026 — DOUBLURE POLYESTER 180G IMPERMEABLE ENDUIT PU LARGEUR 150 CM COLORIS NOIR',
  });
  const mention = sousTitreLong.ecrits.find(e => e.texte.includes('Demande du'));
  check('un sous-titre trop long est écourté, pas posé sur le logo',
    Boolean(mention) && mention!.x > 153 && mention!.texte.length < 90,
    JSON.stringify(mention));

  console.log(`\n${pass} réussis, ${fail} échoués`);
  if (fail > 0) process.exit(1);
})();
