// Le conditionnement : combien de sacs, de cartons et de barrettes fait une quantité.
//
// Ce que le magasinier faisait de tête devant le camion, et que le papier ne disait pas.
// Lancer :
//   npx tsx scripts/test-conditionnement.ts

import {
  echelleDeLArticle, colisage, colisageArticle, colisageArticleTexte, colisageTexte,
  comptageTexte, barrettesTexte, manqueTexte, nombreSaisi,
} from '../src/lib/conditionnement';

let pass = 0;
let fail = 0;
function check(label: string, ok: boolean, detail = '') {
  if (ok) { pass++; console.log(`  ✓ ${label}`); }
  else { fail++; console.log(`  ✗ ${label} ${detail}`); }
}
const eq = (label: string, obtenu: any, attendu: any) =>
  check(label, obtenu === attendu, `→ obtenu ${JSON.stringify(obtenu)}, attendu ${JSON.stringify(attendu)}`);

/** Un pôle et une famille minimaux, pour que le type soit reconnu sans catalogue complet. */
const pole = (specType: string) => ({ id: 'P1', name: specType.toUpperCase(), specType });
const famille = { id: 'F1', name: 'F1', generalCategoryId: 'P1' };
const cadre = (specType: string) => [[famille], [pole(specType)]] as const;

function calc(article: any, specType: string, quantite?: number, ligneQualite?: any) {
  const [cats, poles] = cadre(specType);
  const e = echelleDeLArticle({ ...article, categoryId: 'F1' }, cats as any, poles as any, ligneQualite);
  return colisage(quantite ?? article.quantity, e);
}

console.log('\n── Une fermeture : pièces → sacs → cartons ──');
{
  const c = calc({ quantity: 48000, unitOfMeasure: 'pcs', pcsPerBag: 20, bagsPerCarton: 10 }, 'zipper');
  eq('2 400 sacs', c.comptages[0]?.entiers, 2400);
  eq('240 cartons', c.cartons?.entiers, 240);
  eq('rien d’entamé', c.cartons?.reste, 0);
  eq('la phrase se lit seule', colisageTexte(c), '2 400 sacs  ·  240 cartons');
  eq('aucun champ ne manque', c.manquants.length, 0);
}

console.log('\n── Le carton entamé ──');
{
  const c = calc({ quantity: 48010, unitOfMeasure: 'pcs', pcsPerBag: 20, bagsPerCarton: 10 }, 'zipper');
  eq('2 400 sacs pleins', c.comptages[0]?.entiers, 2400);
  eq('un sac à moitié', Math.round((c.comptages[0]?.reste || 0) * 100), 50);
  eq('240 cartons pleins', c.cartons?.entiers, 240);
  eq('241 cartons à compter à la réception', c.cartons?.aCompter, 241);
  check('le texte annonce l’entamé', comptageTexte(c.cartons!).includes('+ 1 entamé'), comptageTexte(c.cartons!));
}

console.log('\n── Le conditionnement en gros : le plus grand niveau réellement rempli ──');
{
  // Sans sacs par carton, le colis qu'on porte est le SAC : on le compte, sans rien réclamer.
  const c = calc({ quantity: 48000, unitOfMeasure: 'pcs', pcsPerBag: 20 }, 'zipper');
  eq('les sacs se comptent', c.comptages.length, 1);
  eq('et c’est le sac qu’on porte', c.enGros?.colis.cle, 'sac');
  eq('2 400 sacs', c.enGros?.entiers, 2400);
  eq('rien n’est réclamé : la donnée ne manque pas, elle n’existe pas', c.manquants.length, 0);
}
{
  // Avec les sacs par carton, c'est le carton qu'on porte — le sachet est son intérieur.
  const c = calc({ quantity: 48000, unitOfMeasure: 'pcs', pcsPerBag: 20, bagsPerCarton: 10 }, 'zipper');
  eq('le carton prend le dessus', c.enGros?.colis.cle, 'carton');
  eq('240 cartons', c.enGros?.entiers, 240);
}
{
  // « Un rouleau par sac », c'est un rouleau, pas un sac.
  const c = calc({ quantity: 12000, unitOfMeasure: 'm', rollLength: 100, packagingPerBag: 1 }, 'fabric');
  eq('un sac d’un seul rouleau n’est pas un sac', c.enGros?.colis.cle, 'rouleau');
  eq('120 rouleaux', c.enGros?.entiers, 120);
}
{
  const c = calc({ quantity: 12000, unitOfMeasure: 'm', rollLength: 100, packagingPerBag: 6 }, 'fabric');
  eq('six rouleaux par sac : on porte le sac', c.enGros?.colis.cle, 'sac');
  eq('20 sacs', c.enGros?.entiers, 20);
}
{
  const c = calc({ quantity: 12000, unitOfMeasure: 'm', rollLength: 100 }, 'fabric');
  eq('sans sac du tout, on porte le rouleau', c.enGros?.colis.cle, 'rouleau');
}

console.log('\n── Un tissu au mètre : mètres → rouleaux → sacs ──');
{
  const c = calc({ quantity: 12000, unitOfMeasure: 'm', rollLength: 100, packagingPerBag: 4 }, 'fabric');
  eq('120 rouleaux', c.comptages[0]?.entiers, 120);
  eq('30 sacs', c.comptages[1]?.entiers, 30);
  check('le rouleau est nommé', colisageTexte(c).includes('rouleaux'), colisageTexte(c));
}

console.log('\n── Le même tissu acheté AU ROULEAU ──');
{
  // Le piège : 120 rouleaux divisés par la longueur d'un rouleau donneraient 1,2 rouleau.
  const c = calc({ quantity: 120, unitOfMeasure: 'rouleaux', rollLength: 100, packagingPerBag: 4 }, 'fabric');
  eq('la quantité EST le nombre de rouleaux', c.comptages[0]?.colis.cle, 'rouleau');
  eq('et elle ne se divise pas', c.comptages[0]?.entiers, 120);
  eq('30 sacs, pas 0', c.comptages.find(x => x.colis.cle === 'sac')?.entiers, 30);
  check('le texte ne répète pas la quantité', !colisageTexte(c).includes('120 rouleaux'), colisageTexte(c));
}

console.log('\n── Un article acheté AU CARTON ──');
{
  // Il n'y a rien à calculer : la quantité est le nombre de cartons. Le document doit le voir,
  // sinon il réclame la saisie d'un conditionnement qui ne servirait à rien.
  const c = calc({ quantity: 240, unitOfMeasure: 'cartons', pcsPerBag: 20, bagsPerCarton: 10 }, 'zipper');
  eq('240 cartons à contrôler', c.cartons?.aCompter, 240);
  eq('rien n’est réclamé', c.manquants.length, 0);
  eq('et le texte ne redit pas la quantité', colisageTexte(c), '');
}
{
  const c = calc({
    quantity: 240, unitOfMeasure: 'cartons', pcsPerBag: 20, bagsPerCarton: 10,
    stackPerRow: 2, stackRows: 5,
  }, 'zipper');
  eq('et la barrette se monte sur ces cartons', c.barrettes?.entieres, 24);
}

console.log('\n── Un rouleau saisi en yards, un article acheté au mètre ──');
{
  const c = calc({ quantity: 9144, unitOfMeasure: 'm', rollLength: 100, rollLengthUnit: 'yds', packagingPerBag: 4 }, 'fabric');
  eq('100 rouleaux de 91,44 m', c.comptages[0]?.entiers, 100);
  eq('et 25 sacs', c.comptages[1]?.entiers, 25);
}

console.log('\n── Le ruban : son carton se compte en ROULEAUX, pas en shrinks ──');
{
  const c = calc({ quantity: 6000, unitOfMeasure: 'm', rollLength: 50, rollsPerShrink: 10, rollsPerCarton: 40 }, 'tape');
  eq('120 rouleaux', c.comptages[0]?.entiers, 120);
  eq('12 shrinks', c.comptages.find(x => x.colis.cle === 'shrink')?.entiers, 12);
  eq('3 cartons — et non 12 divisés par 40', c.cartons?.entiers, 3);
}

console.log('\n── L’accessoire : pièces → boîtes → cartons → grand carton ──');
{
  const c = calc({ quantity: 10000, unitOfMeasure: 'pcs', pcsPerBox: 100, boxPerCarton: 10 }, 'accessory');
  eq('100 boîtes', c.comptages[0]?.entiers, 100);
  eq('10 cartons', c.cartons?.entiers, 10);
  eq('et c’est le carton qu’on compte', c.enGros?.colis.cle, 'carton');
}

console.log('\n── La barrette : quatre sacs de large, douze de hauteur ──');
{
  const c = calc({
    quantity: 48000, unitOfMeasure: 'pcs', pcsPerBag: 20,
    stackPerRow: 4, stackRows: 12,
  }, 'zipper');
  eq('sans carton, on empile les sacs', c.barrettes?.niveau.cle, 'sac');
  eq('48 sacs par barrette', c.barrettes?.parBarrette, 48);
  eq('50 barrettes', c.barrettes?.entieres, 50);
  eq('rien en reste', c.barrettes?.resteColis, 0);
}
{
  const c = calc({
    quantity: 48480, unitOfMeasure: 'pcs', pcsPerBag: 20,
    stackPerRow: 4, stackRows: 12,
  }, 'zipper');
  eq('50 barrettes', c.barrettes?.entieres, 50);
  eq('24 sacs en reste', c.barrettes?.resteColis, 24);
  check('la phrase le dit', barrettesTexte(c.barrettes!) === '50 barrettes + 24 sacs', barrettesTexte(c.barrettes!));
}

console.log('\n── La barrette change selon le produit ET l’emballage ──');
{
  // Le même besoin, exprimé sur des cartons : la règle n'est pas la même.
  const c = calc({
    quantity: 10000, unitOfMeasure: 'pcs', pcsPerBox: 100, boxPerCarton: 10,
    stackPerRow: 2, stackRows: 5,
  }, 'accessory');
  eq('on empile des cartons', c.barrettes?.niveau.cle, 'carton');
  eq('10 cartons par barrette', c.barrettes?.parBarrette, 10);
  eq('1 barrette', c.barrettes?.entieres, 1);
}
{
  // On empile TOUJOURS le conditionnement en gros : il n'y a rien à choisir.
  const c = calc({
    quantity: 48000, unitOfMeasure: 'pcs', pcsPerBag: 20, bagsPerCarton: 10,
    stackPerRow: 4, stackRows: 12,
  }, 'zipper');
  eq('on empile le colis en gros, sans rien demander', c.barrettes?.niveau.cle, 'carton');
  eq('240 cartons, 48 par barrette : 5 barrettes', c.barrettes?.entieres, 5);
}
{
  const c = calc({
    quantity: 48000, unitOfMeasure: 'pcs', pcsPerBag: 20, bagsPerCarton: 10, stackPerRow: 4,
  }, 'zipper');
  eq('une règle à moitié saisie ne produit pas de barrette', c.barrettes, null);
}

console.log('\n── Les saisies imparfaites ──');
eq('« 20 » vaut 20', nombreSaisi('20'), 20);
eq('« 20 pcs » vaut 20', nombreSaisi('20 pcs'), 20);
eq('« 12,5 » vaut 12,5', nombreSaisi('12,5'), 12.5);
eq('le vide ne vaut rien', nombreSaisi(''), null);
eq('zéro ne vaut rien — on ne divise pas par zéro', nombreSaisi(0), null);
eq('« various » ne vaut rien', nombreSaisi('various'), null);
{
  const c = calc({ quantity: 48000, unitOfMeasure: 'pcs', pcsPerBag: 0, bagsPerCarton: 10 }, 'zipper');
  eq('un zéro saisi arrête la chaîne au lieu de la faire exploser', c.comptages.length, 0);
  check('le total reste fini', c.cartons === null);
}

console.log('\n── Une ventilation qui ne retombe pas sur la quantité annoncée ──');
{
  const [cats, poles] = cadre('zipper');
  const base = { categoryId: 'F1', unitOfMeasure: 'pcs', pcsPerBag: 20, bagsPerCarton: 10 };

  const juste = colisageArticle({
    ...base, quantity: 48000,
    qualityBreakdown: [{ quality: 'CL-5', quantity: 24000 }, { quality: 'CL-3', quantity: 24000 }],
  }, cats as any, poles as any);
  eq('ventilation exacte : 240 cartons', juste.cartons, 240);
  eq('aucun écart signalé', juste.ventilationEcartee, undefined);

  const enTrop = colisageArticle({
    ...base, quantity: 48000,
    qualityBreakdown: [{ quality: 'CL-5', quantity: 48000 }, { quality: 'CL-3', quantity: 48000 }],
  }, cats as any, poles as any);
  eq('une ventilation recopiée en trop ne double pas les cartons', enTrop.cartons, 240);
  eq('et l’écart est annoncé', enTrop.ventilationEcartee?.ventile, 96000);

  const partielle = colisageArticle({
    ...base, quantity: 48000,
    qualityBreakdown: [{ quality: 'CL-5', quantity: 24000 }],
  }, cats as any, poles as any);
  eq('une ventilation à moitié saisie n’ampute pas les cartons', partielle.cartons, 240);
  eq('et l’écart est annoncé', partielle.ventilationEcartee?.ventile, 24000);
}
{
  // Deux qualités qui ne tombent pas juste : on ne mélange pas deux qualités dans un carton,
  // donc chacune arrondit au carton supérieur — et la ligne de l'article doit dire la MÊME chose
  // que la feuille de contrôle.
  const [cats, poles] = cadre('zipper');
  const ca = colisageArticle({
    categoryId: 'F1', unitOfMeasure: 'pcs', quantity: 3000, pcsPerBag: 20, bagsPerCarton: 10,
    qualityBreakdown: Array.from({ length: 10 }, (_, i) => ({ quality: `Q${i}`, quantity: 300 })),
  }, cats as any, poles as any);
  eq('20 cartons, un de plus par qualité entamée', ca.cartons, 20);
  check('et la ligne de l’article annonce le même chiffre',
    colisageArticleTexte(ca, true).includes('20 ctn'), colisageArticleTexte(ca, true));
}

console.log('\n── Les unités qui ne se divisent pas ──');
{
  const c = calc({ quantity: 800, unitOfMeasure: 'kg', pcsPerBag: 20, bagsPerCarton: 10 }, 'zipper');
  eq('un poids ne donne aucun colis', c.comptages.length, 0);
  check('et le document le dit', manqueTexte(c).includes('poids'), manqueTexte(c));
  eq('rien n’est réclamé à la saisie', c.manquants.length, 0);
}
{
  const c = calc({ quantity: 500, unitOfMeasure: 'doz', pcsPerBag: 20, bagsPerCarton: 10 }, 'zipper');
  eq('500 douzaines font 6 000 pièces, donc 300 sacs', c.comptages[0]?.entiers, 300);
  eq('et 30 cartons', c.cartons?.entiers, 30);
}
{
  const c = calc({ quantity: 10, unitOfMeasure: 'gross (144p)', pcsPerBag: 12, bagsPerCarton: 10 }, 'zipper');
  eq('10 grosses font 1 440 pièces, donc 120 sacs', c.comptages[0]?.entiers, 120);
}
{
  const c = calc({ quantity: 1000, unitOfMeasure: 'kg' }, 'fabric');
  eq('un tissu au poids non plus', c.comptages.length, 0);
}

console.log('\n── Le « pcs/carton » saisi à la main, sans le détail des sacs ──');
{
  const c = calc({ quantity: 48000, unitOfMeasure: 'pcs', pcsPerCtn: 200 }, 'zipper');
  eq('240 cartons quand même', c.cartons?.entiers, 240);
  eq('rien n’est réclamé puisque le carton se compte', c.manquants.length, 0);
}
{
  const c = calc({ quantity: 48000, unitOfMeasure: 'pcs', pcsPerBag: 20, bagsPerCarton: 10, pcsPerCtn: 999 }, 'zipper');
  eq('la chaîne complète prime sur le raccourci', c.cartons?.entiers, 240);
}

console.log('\n── La ligne de qualité prime sur l’article ──');
{
  const c = calc(
    { quantity: 48000, unitOfMeasure: 'pcs', pcsPerBag: 20, bagsPerCarton: 10 }, 'zipper', 48000,
    { quality: 'CL-5', pcsPerBag: 40 },
  );
  eq('1 200 sacs, pas 2 400', c.comptages[0]?.entiers, 1200);
  eq('120 cartons', c.cartons?.entiers, 120);
}

console.log('\n── Ce qui est saisi dans Qualités rattrape les commandes déjà passées ──');
{
  // L'article ne porte rien : il a été commandé avant que le conditionnement soit renseigné.
  // C'est la famille qui le décrit, et le calcul doit s'en servir — sinon remplir l'écran
  // Qualités n'aurait aucun effet sur les dossiers en route.
  const famillePleine = {
    id: 'F1', name: 'F1', generalCategoryId: 'P1',
    zipperQualities: [{ label: 'CL-5', pcsPerBag: 20, bagsPerCarton: 10, stackPerRow: 4, stackRows: 12 }],
  };
  const e = echelleDeLArticle(
    { categoryId: 'F1', quantity: 48000, unitOfMeasure: 'pcs' },
    [famillePleine] as any, [pole('zipper')] as any,
  );
  const c = colisage(48000, e);
  eq('240 cartons, lus dans la famille', c.cartons?.entiers, 240);
  eq('et la barrette empile ces cartons', c.barrettes?.entieres, 5);
}
{
  // Deux qualités et aucun libellé pour trancher : on ne devine pas.
  const familleAmbigue = {
    id: 'F1', name: 'F1', generalCategoryId: 'P1',
    zipperQualities: [{ label: 'CL-5', pcsPerBag: 20 }, { label: 'AUTOLOCK', pcsPerBag: 50 }],
  };
  const e = echelleDeLArticle(
    { categoryId: 'F1', quantity: 48000, unitOfMeasure: 'pcs' },
    [familleAmbigue] as any, [pole('zipper')] as any,
  );
  eq('rien n’est deviné entre deux qualités', colisage(48000, e).comptages.length, 0);

  const cible = echelleDeLArticle(
    { categoryId: 'F1', quantity: 48000, unitOfMeasure: 'pcs', quality: 'AUTOLOCK' },
    [familleAmbigue] as any, [pole('zipper')] as any,
  );
  eq('mais la qualité nommée est retrouvée', colisage(48000, cible).comptages[0]?.entiers, 960);
}

console.log('\n── Un produit sans conditionnement saisi ──');
{
  const c = calc({ quantity: 500, unitOfMeasure: 'pcs' }, 'zipper');
  eq('rien ne se compte', c.comptages.length, 0);
  eq('le texte est vide plutôt qu’inventé', colisageTexte(c), '');
  eq('et il dit quoi saisir', c.manquants[0]?.champ, 'pcsPerBag');
}

console.log(`\n${pass} réussis, ${fail} échoués`);
if (fail > 0) process.exit(1);
