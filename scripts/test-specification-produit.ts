// Les caractéristiques d'un produit : qui fait foi.
//
// Une qualité fixe est une définition. Ses valeurs étaient recopiées sur la commande au moment
// de la choisir et n'en bougeaient plus : corriger la largeur d'une qualité dans le catalogue ne
// changeait rien aux commandes qui la portent — elles affichaient l'ancienne, pour toujours.
// Lancer :
//   npx tsx scripts/test-specification-produit.ts

import {
  specificationsArticle, specificationsEnLigne, ligneQualiteDuCatalogue,
} from '../src/lib/specification-produit';

let pass = 0;
let fail = 0;
function check(label: string, ok: boolean, detail = '') {
  if (ok) { pass++; console.log(`  ✓ ${label}`); }
  else { fail++; console.log(`  ✗ ${label} ${detail}`); }
}
const eq = (label: string, obtenu: any, attendu: any) =>
  check(label, obtenu === attendu, `→ obtenu ${JSON.stringify(obtenu)}, attendu ${JSON.stringify(attendu)}`);

/** Le catalogue : un pôle tissu, une famille qui porte la définition de ses qualités. */
const poles = [{ id: 'PF', name: 'FABRIC', specType: 'fabric' }];
const famille = (qualites: any[]) => ([{
  id: 'FF', name: 'DOUBLURE', generalCategoryId: 'PF', fabricQualities: qualites,
}]);

const valeur = (lignes: any[], cle: string) => lignes.find(l => l.cle === cle)?.valeur;

console.log('\n── Corriger une qualité corrige les commandes qui la portent ──');
{
  // La commande a été passée quand la qualité annonçait 150 cm. Le catalogue dit maintenant 145.
  const cat = famille([{ label: '210T STANDARD', gsm: '53.34', fabricWidth: 145 }]);
  const article = {
    categoryId: 'FF', quality: '210T STANDARD',
    gsm: '53.34', fabricWidth: 150,          // la copie figée au moment de la commande
  };
  const lignes = specificationsArticle(article, cat as any, poles as any);
  eq('la largeur suit le catalogue', valeur(lignes, 'fabricWidth'), '145');
  check('et non la copie de la commande', !specificationsEnLigne(article, cat as any, poles as any).includes('150'),
    specificationsEnLigne(article, cat as any, poles as any));
}
{
  // Même chose sur une ligne de ventilation par qualité.
  const cat = famille([{ label: 'CL-5', fabricWidth: 145 }]);
  const article = { categoryId: 'FF', quality: 'various', qualityBreakdown: [{ quality: 'CL-5', fabricWidth: 150 }] };
  const lignes = specificationsArticle(article, cat as any, poles as any, { quality: 'CL-5', fabricWidth: 150 });
  eq('la ventilation suit le catalogue elle aussi', valeur(lignes, 'fabricWidth'), '145');
}

console.log('\n── Ce que le catalogue ne dit pas reste à la commande ──');
{
  const cat = famille([{ label: '210T STANDARD', fabricWidth: 145 }]);   // pas de GSM au catalogue
  const article = { categoryId: 'FF', quality: '210T STANDARD', gsm: '53.34', fabricWidth: 150 };
  const lignes = specificationsArticle(article, cat as any, poles as any);
  eq('le GSM de la commande est conservé', valeur(lignes, 'gsm'), '53.34');
  eq('la largeur vient quand même du catalogue', valeur(lignes, 'fabricWidth'), '145');
}
{
  // Une qualité que le catalogue ne connaît pas : la commande fait foi, faute de mieux.
  const cat = famille([{ label: 'CL-5', fabricWidth: 145 }]);
  const article = { categoryId: 'FF', quality: 'AUTOLOCK N8', fabricWidth: 150 };
  eq('une qualité inconnue garde ses valeurs',
    valeur(specificationsArticle(article, cat as any, poles as any), 'fabricWidth'), '150');
}
{
  const article = { categoryId: 'FF', quality: '210T', fabricWidth: 150 };
  eq('sans catalogue du tout, la commande fait foi',
    valeur(specificationsArticle(article, [] as any, [] as any), 'fabricWidth'), '150');
}

console.log('\n── Le conditionnement, lui, reste celui de l’expédition ──');
{
  // Pièces par sac et sacs par carton sont relevés sur le packing list du fournisseur : ils
  // peuvent légitimement différer du catalogue d'un arrivage à l'autre.
  const cat = famille([{ label: '210T', rollLength: 100, packagingPerBag: 6 }]);
  const article = { categoryId: 'FF', quality: '210T', rollLength: 100, packagingPerBag: 4 };
  eq('le sac du packing list ne se fait pas écraser',
    valeur(specificationsArticle(article, cat as any, poles as any), 'packagingPerBag'), '4');
}

console.log('\n── Retrouver la définition d’une qualité ──');
{
  const cat = famille([{ label: 'CL-5', fabricWidth: 145 }, { label: 'CL-3', fabricWidth: 120 }]);
  eq('par son libellé', ligneQualiteDuCatalogue({ categoryId: 'FF', quality: 'CL-3' }, cat as any, poles as any, 'fabric')?.fabricWidth, 120);
  eq('les accents et la casse ne gênent pas',
    ligneQualiteDuCatalogue({ categoryId: 'FF', quality: 'cl-5' }, cat as any, poles as any, 'fabric')?.fabricWidth, 145);
  eq('« various » ne désigne aucune qualité',
    ligneQualiteDuCatalogue({ categoryId: 'FF', quality: 'various' }, cat as any, poles as any, 'fabric'), undefined);
  eq('un nom inconnu non plus',
    ligneQualiteDuCatalogue({ categoryId: 'FF', quality: 'INCONNUE' }, cat as any, poles as any, 'fabric'), undefined);
}
{
  const unique = famille([{ label: 'CL-5', fabricWidth: 145 }]);
  eq('sans nom, une famille à une seule qualité ne laisse pas de doute',
    ligneQualiteDuCatalogue({ categoryId: 'FF' }, unique as any, poles as any, 'fabric')?.fabricWidth, 145);
}

console.log(`\n${pass} réussis, ${fail} échoués`);
if (fail > 0) process.exit(1);
