// Les packing details d'un dossier d'arrivage : la feuille que le magasinier tient devant le
// camion. Elle doit dire en cartons ce que la commande dit en pièces, annoncer la part de chaque
// pôle, classer les références par ce qu'on manipulera le plus — et n'inventer aucun chiffre.
// Lancer :
//   npx tsx scripts/test-pdf-packing-arrivage.ts

import zlib from 'zlib';
import jsPDF from 'jspdf';
import { exportArrivalPackingPDF } from '../src/lib/pdf-arrival-packing';

let pass = 0;
let fail = 0;
function check(label: string, ok: boolean, detail = '') {
  if (ok) { pass++; console.log(`  ✓ ${label}`); }
  else { fail++; console.log(`  ✗ ${label} ${detail}`); }
}

// `save()` est la seule chose qui ne marche pas hors navigateur : on l'intercepte sur l'API jsPDF
// — avant toute construction de document — pour récupérer le PDF tel qu'il aurait été téléchargé.
let dernier: { doc: any; fichier: string } | null = null;
(jsPDF as any).API.save = function (this: any, fichier: string) { dernier = { doc: this, fichier }; return this; };

/**
 * Ce document est produit compressé — c'est voulu, il se partage par WhatsApp. Ses flux de
 * contenu sont donc en Flate : il faut les décompresser avant d'y lire le moindre mot.
 */
function contenu(octets: Buffer): string {
  const morceaux: string[] = [];
  const brut = octets.toString('latin1');
  const re = /stream\r?\n([\s\S]*?)\r?\nendstream/g;
  for (const m of brut.matchAll(re)) {
    const donnees = Buffer.from(m[1], 'latin1');
    try { morceaux.push(zlib.inflateSync(donnees).toString('latin1')); }
    catch { morceaux.push(m[1]); }        // flux non compressé : il se lit tel quel
  }
  return morceaux.join('\n');
}

/**
 * Un PDF écrit ses accents en octal — « à » devient \340. Sans les rendre, une recherche de
 * « ventilation à revoir » ne trouve rien et le test passerait à côté de ce qu'il vérifie.
 */
function dechapper(s: string): string {
  return s
    .replace(/\\([0-7]{1,3})/g, (_, o) => String.fromCharCode(parseInt(o, 8)))
    .replace(/\\([()\\])/g, '$1');
}

function lire() {
  if (!dernier) throw new Error('aucun document produit');
  const brut = contenu(Buffer.from(dernier.doc.output('arraybuffer')));
  // Les positions, pour vérifier que rien ne déborde de la page.
  const ecrits = Array.from(brut.matchAll(/([-\d.]+) ([-\d.]+) Td\s*\((.*?)\) Tj/g))
    .map(m => ({ x: parseFloat(m[1]), y: parseFloat(m[2]), texte: dechapper(m[3]) }));
  // Et TOUT le texte : la deuxième ligne d'une cellule sur deux lignes n'est pas précédée de sa
  // propre coordonnée, elle serait invisible à la lecture ci-dessus — et un test qui cherche ce
  // qui y est écrit conclurait à tort que le document ne le dit pas.
  const texte = Array.from(brut.matchAll(/\((.*?)\) Tj/g)).map(m => dechapper(m[1])).join(' ');
  return { texte, ecrits, pages: dernier.doc.getNumberOfPages(), fichier: dernier.fichier };
}

const poles = [
  { id: 'PZ', name: 'ZIPPER', nameFR: 'FERMETURES', specType: 'zipper' },
  { id: 'PF', name: 'FABRIC', nameFR: 'TISSUS', specType: 'fabric' },
  { id: 'PA', name: 'ACCESSORY', nameFR: 'ACCESSOIRES', specType: 'accessory' },
];
const familles = [
  { id: 'FZ', name: 'FERMETURE N5', generalCategoryId: 'PZ' },
  { id: 'FF', name: 'DOUBLURE', generalCategoryId: 'PF' },
  { id: 'FA', name: 'BOUTON PRESSION', generalCategoryId: 'PA' },
];

const articles = [
  {
    id: 'a1', categoryId: 'FZ', name: 'FERMETURE N5 CL', nameFR: 'FERMETURE N5',
    quantity: 48000, unitOfMeasure: 'pcs', pcsPerBag: 20, bagsPerCarton: 10,
    stackLevel: 'sac', stackPerRow: 4, stackRows: 12,
    netWeight: 480, cubicMeasurement: 3.2,
    colorBreakdown: [
      { color: 'NOIR', colorCode: '580', rolls: 30000 },
      { color: 'BLANC', colorCode: '501', rolls: 18000 },
    ],
  },
  {
    id: 'a2', categoryId: 'FF', name: 'DOUBLURE POLYESTER', nameFR: 'DOUBLURE',
    quantity: 12000, unitOfMeasure: 'm', rollLength: 100, packagingPerBag: 4, bagsPerCarton: 5,
    netWeight: 900, cubicMeasurement: 6.1,
  },
  {
    id: 'a3', categoryId: 'FA', name: 'BOUTON PRESSION 15MM', nameFR: 'BOUTON PRESSION',
    quantity: 10000, unitOfMeasure: 'pcs', pcsPerBox: 100, boxPerCarton: 10,
    netWeight: 120, cubicMeasurement: 0.9,
  },
  {
    // Celui-ci n'a AUCUN conditionnement saisi : le document doit le dire, pas l'inventer.
    id: 'a4', categoryId: 'FZ', name: 'FERMETURE N3 SPIRALE', nameFR: 'FERMETURE N3',
    quantity: 5000, unitOfMeasure: 'pcs', netWeight: 40, cubicMeasurement: 0.3,
    purchasePricePerUnit: 3.75, costPrice: 3.75,
  },
  {
    id: 'a5', categoryId: 'FZ', name: 'FERMETURE N8 METAL', nameFR: 'FERMETURE N8',
    quantity: 2400, unitOfMeasure: 'pcs', pcsPerBag: 12, bagsPerCarton: 10,
    netWeight: 60, cubicMeasurement: 0.4,
  },
  {
    id: 'a6', categoryId: 'FF', name: 'TAFFETA 190T', nameFR: 'TAFFETA',
    quantity: 3000, unitOfMeasure: 'm', rollLength: 50, packagingPerBag: 2, bagsPerCarton: 5,
    netWeight: 210, cubicMeasurement: 1.4,
  },
];

const facture = {
  id: 'DOSSIER-2026-014', supplierId: 'JIMMY ZIPPER', noBL: 'BL-88120',
  shippingLine: 'CMA CGM', shippingDate: '2026-08-02', arrivalDate: '2026-09-18',
  forwarder: 'TRANSIT ATLAS',
};

const stores = [{ id: 'CHRIFA', name: 'CHRIFA' }];
const movements = [
  { type: 'IN', articleId: 'a1', color: 'NOIR', quantity: 30000, storeId: 'CHRIFA', locationCode: 'A-01-01' },
  { type: 'IN', articleId: 'a1', color: 'BLANC', quantity: 18000, storeId: 'CHRIFA', locationCode: 'A-01-02' },
  { type: 'IN', articleId: 'a2', quantity: 12000, storeId: 'CHRIFA', locationCode: 'B-03-01' },
];

(async () => {
  console.log('\n── Le document sort ──');
  await exportArrivalPackingPDF({
    facture, articles, categories: familles, generalCategories: poles,
    movements, stores, isEnteredInStock: true, stockEntryDate: '2026-09-19',
  });
  const d = lire();
  check('il sort', d.pages >= 1);
  check('il porte l’identité LEBTEX', d.texte.includes('LEBTEX'));
  check('il se nomme d’après le dossier', d.fichier.includes('DOSSIER-2026-014'), d.fichier);

  console.log('\n── Ce que le magasinier cherchait et ne trouvait pas ──');
  check('les cartons sont comptés', /ctn|carton/i.test(d.texte), d.texte.slice(0, 300));
  // 48 000 pcs ÷ 20 = 2 400 sacs ÷ 10 = 240 cartons.
  check('240 cartons pour les 48 000 fermetures', d.texte.includes('240'), '');
  // 12 000 m ÷ 100 = 120 rouleaux ÷ 4 = 30 sacs ÷ 5 = 6 cartons.
  check('le tissu se compte en rouleaux puis en sacs', /rlx|rouleau/i.test(d.texte));
  check('les barrettes apparaissent', /barrette/i.test(d.texte));
  check('la part de chaque pôle est donnée', d.texte.includes('%'));
  check('le classement ABC est imprimé', d.texte.includes('ABC'));
  check('il dit où poser les références les plus manipulées',
    /sortie/i.test(d.texte) && /fond|hauteur/i.test(d.texte));
  check('le contrôle se fait sur le colis qu’on porte', /Colis compt/i.test(d.texte), '');
  check('le total des cartons est annoncé', /CONTR.LE . LA R.CEPTION/i.test(d.texte));

  console.log('\n── Ce qu’il ne doit jamais faire ──');
  check('une référence sans conditionnement demande la saisie au lieu d’inventer',
    /saisir/i.test(d.texte), d.texte.slice(0, 400));
  check('aucun prix d’achat ne filtre',
    !d.texte.includes('3,75') && !d.texte.includes('3.75'), '');
  check('« various » ne s’imprime jamais', !/various/i.test(d.texte));
  check('aucun caractère que la police ne sait pas dessiner',
    !d.ecrits.some(e => /[^\x00-\xff]/.test(e.texte)),
    JSON.stringify(d.ecrits.filter(e => /[^\x00-\xff]/.test(e.texte)).slice(0, 3)));
  // Le document se mesure en millimetres, mais un PDF s'ecrit en points : 1 mm = 72/25,4 pt.
  const PT = 72 / 25.4;
  const largeurPage = dernier!.doc.internal.pageSize.getWidth() * PT;
  const hauteurPage = dernier!.doc.internal.pageSize.getHeight() * PT;
  check('rien ne déborde à droite d’un A4 paysage',
    d.ecrits.every(e => e.x <= largeurPage + 1),
    String(Math.max(...d.ecrits.map(e => e.x))));
  check('rien ne déborde en bas',
    d.ecrits.every(e => e.y <= hauteurPage + 1),
    String(Math.max(...d.ecrits.map(e => e.y))));

  console.log('\n── Un dossier sans aucun conditionnement saisi ──');
  await exportArrivalPackingPDF({
    facture: { ...facture, id: 'DOSSIER-NU' },
    articles: [{ id: 'z1', categoryId: 'FZ', name: 'FERMETURE', quantity: 500, unitOfMeasure: 'pcs' }],
    categories: familles, generalCategories: poles, stores,
  });
  const n = lire();
  check('le document sort quand même', n.pages >= 1);
  check('il ne prétend à aucun carton', !/\b240\b/.test(n.texte));
  check('il dit ce qu’il faut saisir', /saisir/i.test(n.texte), n.texte.slice(0, 300));
  check('et il reste imprimable', n.ecrits.length > 20);

  console.log('\n── Une mesure que seules quelques références portent ──');
  {
    // Le volume n'arrive que sur certaines lignes de la facture fournisseur. S'en servir quand
    // même donnerait 100 % à la seule référence cubée et enverrait tout le reste au fond.
    const boiteuses = [
      { id: 'g1', categoryId: 'FZ', name: 'GROSSE RÉFÉRENCE', quantity: 100000, unitOfMeasure: 'pcs' },
      ...Array.from({ length: 4 }, (_, i) => ({
        id: `p${i}`, categoryId: 'FZ', name: `PETITE ${i}`, quantity: 100, unitOfMeasure: 'pcs',
        ...(i === 0 ? { cubicMeasurement: 3.2 } : {}),
      })),
    ];
    await exportArrivalPackingPDF({
      facture: { ...facture, id: 'DOSSIER-CBM-PARTIEL' }, articles: boiteuses,
      categories: familles, generalCategories: poles, stores,
    });
    const v = lire();
    check('le volume incomplet n’est pas retenu comme base',
      !/part calculée sur le volume/i.test(v.texte), v.texte.slice(0, 400));
    check('il retombe sur la quantite, commune a tout le dossier',
      /part calcul.e sur la quantit./i.test(v.texte), v.texte.slice(0, 500));
    // Le vrai dégât d'une base incomplète : la plus grosse référence du conteneur finissait
    // au fond de l'entrepôt parce que son volume n'était pas saisi.
    const abc = v.texte.slice(v.texte.indexOf('a poser'));
    check('la plus grosse reference passe en tete, classee A',
      abc.indexOf('au plus pr') > 0 && abc.indexOf('au plus pr') < abc.indexOf('au fond'),
      abc.slice(0, 260));
    check('et les quatre petites vont au fond',
      (abc.match(/en hauteur ou au fond/g) || []).length === 4, abc.slice(0, 400));
  }

  console.log('\n── Une ventilation qui ne retombe pas sur la quantité ──');
  {
    await exportArrivalPackingPDF({
      facture: { ...facture, id: 'DOSSIER-VENTIL' },
      articles: [{
        id: 'v1', categoryId: 'FZ', name: 'FERMETURE N5', quantity: 48000, unitOfMeasure: 'pcs',
        pcsPerBag: 20, bagsPerCarton: 10,
        // La moitié seulement est ventilée : saisie en cours.
        qualityBreakdown: [{ quality: 'CL-5', quantity: 24000 }],
      }],
      categories: familles, generalCategories: poles, stores,
    });
    const w = lire();
    // La feuille de contrôle doit annoncer les cartons des 48 000 pcs annoncées, pas ceux de la
    // moitié saisie : sinon tout ce qui arrive en plus est compté comme un écart.
    const controle = w.texte.slice(w.texte.indexOf('Colis annoncés'));
    check('la feuille de contrôle annonce 240 cartons, pas 120',
      controle.includes('240') && !controle.includes('120'), controle.slice(0, 300));
    check('et le document dit que la ventilation est a revoir',
      /ventilation . revoir/i.test(w.texte), w.texte.slice(w.texte.indexOf('Colisage'), w.texte.indexOf('Colisage') + 400));
  }

  console.log('\n── Un seul nombre de cartons par référence ──');
  {
    // Dix qualités de 300 pièces : chacune remplit 1,5 carton, donc 2 chacune = 20 au total.
    // La ligne du tableau et la feuille de contrôle doivent dire le même chiffre.
    await exportArrivalPackingPDF({
      facture: { ...facture, id: 'DOSSIER-QUALITES' },
      articles: [{
        id: 'q1', categoryId: 'FZ', name: 'FERMETURE N5', quantity: 3000, unitOfMeasure: 'pcs',
        pcsPerBag: 20, bagsPerCarton: 10,
        qualityBreakdown: Array.from({ length: 10 }, (_, i) => ({ quality: `Q${i}`, quantity: 300 })),
      }],
      categories: familles, generalCategories: poles, stores,
    });
    const q = lire();
    check('20 cartons partout', (q.texte.match(/20 ctn/g) || []).length >= 1 && q.texte.includes('20'));
    check('et jamais 15 à côté', !/15 ctn/.test(q.texte), q.texte.slice(0, 500));
  }

  console.log('\n── Un article acheté au carton ──');
  {
    await exportArrivalPackingPDF({
      facture: { ...facture, id: 'DOSSIER-CTN' },
      articles: [{ id: 'c1', categoryId: 'FZ', name: 'FERMETURE EN VRAC', quantity: 240, unitOfMeasure: 'cartons' }],
      categories: familles, generalCategories: poles, stores,
    });
    const c = lire();
    check('les 240 cartons sont à contrôler', c.texte.includes('240'), c.texte.slice(0, 400));
    check('et rien n’est réclamé à la saisie', !/saisir/i.test(c.texte), c.texte.slice(0, 400));
  }

  console.log('\n── Un dossier au poids, qui ne se compte pas en cartons ──');
  await exportArrivalPackingPDF({
    facture: { ...facture, id: 'DOSSIER-KG' },
    articles: [{ id: 'k1', categoryId: 'FZ', name: 'CHUTES', quantity: 800, unitOfMeasure: 'kg', pcsPerBag: 20, bagsPerCarton: 10 }],
    categories: familles, generalCategories: poles, stores,
  });
  const k = lire();
  check('aucun carton n’est annoncé sur un poids', !/\b4\s*cartons?\b/i.test(k.texte));
  check('et le document explique pourquoi', /poids/i.test(k.texte), k.texte.slice(0, 300));

  console.log(`\n${pass} réussis, ${fail} échoués`);
  if (fail > 0) process.exit(1);
})();
