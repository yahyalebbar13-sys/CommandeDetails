// Le conditionnement : combien de sacs, de cartons et de barrettes fait une quantité.
//
// Ce que le magasinier faisait de tête devant le camion, et que le papier ne disait pas.
// Lancer :
//   npx tsx scripts/test-conditionnement.ts

import {
  echelleDeLArticle, colisage, colisageArticle, colisageArticleTexte, colisageTexte,
  comptageTexte, barrettesTexte, manqueTexte, nombreSaisi,
  contenuDuColis, versUniteDeVente,
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

console.log('\n── Une barrette peut valoir moins de un ──');
{
  // Un coloris rare ne remplit pas une barrette. Arrondi à l'entier il n'en aurait aucune et
  // disparaîtrait du document — or il occupe bien une place au sol.
  const c = calc({
    quantity: 2400, unitOfMeasure: 'pcs', pcsPerBag: 20, bagsPerCarton: 10,
    stackPerRow: 4, stackRows: 12,
  }, 'zipper');
  eq('12 cartons pour 48 par barrette', c.cartons?.aCompter, 12);
  eq('un quart de barrette', c.barrettes?.total, 0.25);
  eq('aucune barrette pleine', c.barrettes?.entieres, 0);
  check('et le texte le dit sans mentir', barrettesTexte(c.barrettes!).startsWith('0,25 barrette'),
    barrettesTexte(c.barrettes!));
}
{
  const c = calc({
    quantity: 48000, unitOfMeasure: 'pcs', pcsPerBag: 20, bagsPerCarton: 10,
    stackPerRow: 4, stackRows: 12,
  }, 'zipper');
  eq('240 cartons font 5 barrettes tout rond', c.barrettes?.total, 5);
}
{
  const c = calc({
    quantity: 50400, unitOfMeasure: 'pcs', pcsPerBag: 20, bagsPerCarton: 10,
    stackPerRow: 4, stackRows: 12,
  }, 'zipper');
  eq('252 cartons font 5,25 barrettes', c.barrettes?.total, 5.25);
  eq('dont 5 pleines', c.barrettes?.entieres, 5);
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

// ════════════════════════════════════════════════════════════════════════════
// Le colis de SORTIE (carton ou rouleau) compté en unité de vente — étape 2 du nouveau stock.
// ════════════════════════════════════════════════════════════════════════════

/** Un pôle complet, avec ses unités, et une famille rattachée. */
const poleV = (specType: string | undefined, uniteVente?: string, extra: any = {}) =>
  ({ id: 'P1', name: 'POLE TEST', specType, uniteVente, ...extra });
const familleV = (extra: any = {}) => ({ id: 'F1', name: 'FAMILLE TEST', generalCategoryId: 'P1', ...extra });
const sortie = (article: any, pole: any, famille: any = familleV(), ligneQualite?: any) =>
  contenuDuColis({ article: { categoryId: 'F1', ...article }, ligneQualite, categories: [famille], generalCategories: [pole] });

console.log('\n── Sortie : le carton de fermeture = Pcs/sac × Sacs/carton ──');
{
  const r = sortie({ pcsPerBag: 120, bagsPerCarton: 20 }, poleV('zipper', 'pièces'));
  eq('prêt', r.pret, true);
  eq('un seul colis de sortie', r.colis.length, 1);
  eq('c’est le carton', r.colis[0]?.colis, 'carton');
  eq('2 400 pièces par carton', r.colis[0]?.contenu, 2400);
  eq('dans l’unité de vente du pôle', r.colis[0]?.unite, 'pièces');
  eq('le détail se lit seul', r.colis[0]?.detail, '1 carton = 20 sacs × 120 pcs = 2 400 pcs');
  eq('les deux facteurs viennent de l’arrivage', r.colis[0]?.facteurs.map(f => f.source).join(','), 'arrivage,arrivage');
  eq('aucun manque', r.manques.length, 0);
}
{
  const r = sortie({ pcsPerBag: 100, bagsPerCarton: 30 }, poleV('thread', 'pièces'));
  eq('le fil : même carton', r.colis[0]?.contenu, 3000);
  const s = sortie({ pcsPerBag: 500, bagsPerCarton: 10 }, poleV('slider', 'pièces'));
  eq('le curseur : même carton', s.colis[0]?.contenu, 5000);
}
{
  // Vendu à la douzaine : le carton se dit en douzaines.
  const r = sortie({ pcsPerBag: 120, bagsPerCarton: 20 }, poleV('zipper', 'doz'));
  eq('2 400 pcs = 200 doz', r.colis[0]?.contenu, 200);
  eq('et le détail le montre', r.colis[0]?.detail, '1 carton = 20 sacs × 120 pcs = 2 400 pcs = 200 doz');
}

console.log('\n── Sortie : le raccourci Pcs/carton ──');
{
  const r = sortie({ pcsPerCtn: 2000 }, poleV('zipper', 'pièces'));
  eq('à défaut de détail, Pcs/carton donne le carton', r.colis[0]?.contenu, 2000);
  eq('et il est nommé', r.colis[0]?.detail, '1 carton = 2 000 pcs (Pcs/carton)');
  eq('prêt', r.pret, true);
}
{
  const r = sortie({ pcsPerCtn: 2000, pcsPerBag: 120, bagsPerCarton: 20 }, poleV('zipper', 'pièces'));
  eq('le détail prime sur le raccourci', r.colis[0]?.contenu, 2400);
  check('et l’écart est signalé', r.desaccords.some(d => d.champ === 'pcsPerCtn'), JSON.stringify(r.desaccords));
}

console.log('\n── Sortie : le carton d’accessoire = Pcs/boîte × Boîtes/carton ──');
{
  const r = sortie({ pcsPerBox: 144, boxPerCarton: 10 }, poleV('accessory', 'pièces'));
  eq('1 440 pièces', r.colis[0]?.contenu, 1440);
  eq('le détail', r.colis[0]?.detail, '1 carton = 10 boîtes × 144 pcs = 1 440 pcs');
  const boite = sortie({ pcsPerBox: 144 }, poleV('accessory', 'pièces'));
  eq('la boîte seule ne sort pas : pas de colis', boite.colis.length, 0);
  eq('on réclame Boîtes/carton', boite.manques[0]?.champs?.join(','), 'boxPerCarton');
}

console.log('\n── Sortie : le rouleau de tissu ──');
{
  const r = sortie({ rollLength: 50, rollLengthUnit: 'm', packagingPerBag: 6 }, poleV('fabric', 'm'));
  eq('le tissu sort au rouleau, jamais au sac', r.colis.map(c => c.colis).join(','), 'rouleau');
  eq('1 rouleau = 50 m', r.colis[0]?.detail, '1 rouleau = 50 m');
  eq('prêt', r.pret, true);
}
{
  const r = sortie({ rollLength: 100, rollLengthUnit: 'yds' }, poleV('fabric', 'm'));
  eq('100 yds = 91,44 m', r.colis[0]?.contenu, 91.44);
  eq('le détail dit la conversion', r.colis[0]?.detail, '1 rouleau = 100 yds = 91,44 m');
}
{
  // Sans unité saisie : celle de l'achat du pôle.
  const r = sortie({ rollLength: 100 }, poleV('fabric', 'm', { uniteAchat: 'yds' }));
  eq('l’unité d’achat du pôle sert de défaut', r.colis[0]?.contenu, 91.44);
  check('et sa source est le pôle', r.colis[0]?.facteurs.some(f => f.source === 'pole'), JSON.stringify(r.colis[0]?.facteurs));
}
{
  const r = sortie({ rollLength: 100, unitOfMeasure: 'kg' }, poleV('fabric', 'm'));
  eq('aucune unité de longueur nulle part : rien de calculé', r.colis.length, 0);
  eq('on réclame l’unité du rouleau', r.manques[0]?.champs?.join(','), 'rollLengthUnit');
  eq('genre « unité de longueur »', r.manques[0]?.genre, 'unite-longueur');
}

console.log('\n── Sortie : le ruban, rouleau ET carton ──');
{
  const r = sortie({ rollLength: 25, unitOfMeasure: 'm', rollsPerShrink: 5, rollsPerCarton: 40 }, poleV('tape', 'm'));
  eq('deux colis : rouleau et carton', r.colis.map(c => c.colis).join(','), 'rouleau,carton');
  // La case « Unité rouleau » de l'arrivage d'un ruban ne compte pas (le formulaire y met « m »
  // sans choix) : sans autre indice, l'unité est réclamée.
  const sansIndice = sortie({ rollLength: 25, rollLengthUnit: 'm', rollsPerCarton: 40 }, poleV('tape', 'm'));
  eq('ruban sans unité au catalogue, ni à l’article, ni au pôle : rien de calculé', sansIndice.colis.length, 0);
  eq('…et « Unité rouleau » est réclamée', sansIndice.manques[0]?.libelles?.join(','), 'Unité rouleau (m ou yds)');
  eq('1 rouleau = 25 m', r.colis[0]?.contenu, 25);
  eq('1 carton = 40 × 25 = 1 000 m', r.colis[1]?.contenu, 1000);
  eq('le détail du carton', r.colis[1]?.detail, '1 carton = 40 rouleaux × 25 m = 1 000 m');
  check('le shrink ne sort jamais', !r.colis.some(c => (c.colis as string) === 'shrink'));
}
{
  const r = sortie({ rollLength: 50 }, poleV('tape', 'm'), familleV({ tapeQualities: [{ label: 'SATIN', rollLength: 50, rollLengthUnit: 'yds' }] }));
  eq('ruban : l’unité du rouleau se lit dans sa propre case', r.colis[0]?.contenu, 45.72);
  eq('sans Rouleaux/carton, le rouleau seul', r.colis.length, 1);
  eq('et rien n’est réclamé pour le carton', r.manques.length, 0);
}
{
  // `lengthUnit` est la longueur d'UNE pièce de fil : il ne dit rien du rouleau de ruban.
  const r = sortie({ rollLength: 50, lengthUnit: 'yds', unitOfMeasure: 'm' }, poleV('tape', 'm'));
  eq('lengthUnit n’est pas lu par le nouveau calcul', r.colis[0]?.contenu, 50);
}

console.log('\n── Sortie : ce qui manque, et où le saisir ──');
{
  const famille = familleV({ name: 'NYLON N°3', zipperQualities: [{ label: 'AUTOLOCK' }, { label: 'CL-5', pcsPerBag: 120 }] });
  const r = sortie({ quality: 'CL-5' }, poleV('zipper', 'pièces'), famille);
  eq('rien de calculé', r.colis.length, 0);
  eq('pas prêt', r.pret, false);
  eq('Sacs/carton manque', r.manques[0]?.champs?.join(','), 'bagsPerCarton');
  eq('la consigne nomme la qualité, son numéro, la famille et l’écran',
    r.manques[0]?.texte, 'Saisir « Sacs/carton » pour la qualité N°2 (CL-5) de la famille NYLON N°3 dans /gestion → Catalogue → Qualités');
  eq('le facteur connu vient du catalogue', sortie({ quality: 'CL-5', bagsPerCarton: 10 }, poleV('zipper', 'pièces'), famille).colis[0]?.facteurs.find(f => f.champ === 'pcsPerBag')?.source, 'catalogue');
}
{
  const famille = familleV({ name: 'NYLON N°3', zipperQualities: [{ label: 'CL-5' }] });
  const r = sortie({ quality: 'INCONNUE' }, poleV('zipper', 'pièces'), famille);
  check('qualité absente du catalogue : on demande de l’ajouter', /Ajouter la qualité « INCONNUE » à la famille NYLON N°3/.test(r.manques[0]?.texte || ''), r.manques[0]?.texte);
  const vide = sortie({}, poleV('zipper', 'pièces'), familleV({ name: 'NYLON N°3' }));
  eq('les deux champs manquants sont listés ensemble', vide.manques[0]?.champs?.join(','), 'pcsPerBag,bagsPerCarton');
}

console.log('\n── Sortie : le pôle ──');
{
  const r = sortie({ pcsPerBag: 120, bagsPerCarton: 20 }, poleV('zipper', undefined));
  eq('sans unité de vente : pas prêt', r.pret, false);
  eq('le carton se calcule quand même, en pièces', r.colis[0]?.contenu, 2400);
  eq('mais il n’est pas en unité de vente', r.colis[0]?.enUniteDeVente, false);
  // Le pôle n'a pas d'unité d'achat : fixer la vente seule changerait l'unité du stock. D'abord l'achat.
  eq('la consigne : l’unité d’achat d’abord', r.manques[0]?.texte,
    "Fixer d'abord l'unité d'achat du pôle POLE TEST (l'unité où son stock est compté aujourd'hui), puis son unité de vente (pièces), dans /gestion → Catalogue → Groupes → Modifier le pôle (crayon ✎ à côté de son nom) — fixer la vente seule changerait aussitôt l'unité de tout son stock, sans conversion");
  const avecUnite = sortie({ pcsPerBag: 120, bagsPerCarton: 20, unitOfMeasure: 'doz' }, poleV('zipper', undefined));
  check('…et nomme l’unité où l’article est compté', /sur « doz »/.test(avecUnite.manques[0]?.texte || ''), avecUnite.manques[0]?.texte);
  const achatFixe = sortie({ pcsPerBag: 120, bagsPerCarton: 20 }, poleV('zipper', undefined, { uniteAchat: 'pièces' }));
  eq('avec une unité d’achat : la vente seule, sans risque', achatFixe.manques[0]?.texte,
    "Fixer l'unité de vente du pôle POLE TEST (pièces) dans /gestion → Catalogue → Groupes → Modifier le pôle (crayon ✎ à côté de son nom) — son stock reste compté en pièces");
}
{
  const r = sortie({ pcsPerBag: 120, bagsPerCarton: 20 }, poleV('zipper', 'kg'));
  eq('le kilo est refusé', r.pret, false);
  check('avec la raison', /ne se convertit pas en poids/.test(r.manques[0]?.texte || ''), r.manques[0]?.texte);
  eq('rien n’est converti en kilos', r.colis[0]?.unite, 'pièces');
}
{
  const r = sortie({ rollLength: 50, rollLengthUnit: 'm' }, poleV('fabric', 'pièces'));
  eq('un tissu vendu à la pièce : refusé', r.pret, false);
  eq('genre unité de vente', r.manques[0]?.genre, 'unite-vente');
}
{
  // Pôle sans type : le nom « RIBBON » fait deviner un ruban, mais ce n'est qu'une supposition.
  const r = sortie({ rollLength: 50, rollLengthUnit: 'm' }, { id: 'P1', name: 'RIBBON', uniteVente: 'm' });
  eq('type deviné', r.typeDevine, true);
  eq('ruban', r.type, 'tape');
  eq('pas prêt tant qu’on n’a pas confirmé', r.pret, false);
  check('la consigne demande la ligne logistique', /Choisir la ligne logistique du pôle RIBBON/.test(r.manques[0]?.texte || ''), r.manques[0]?.texte);
  const rien = sortie({}, { id: 'P1', name: 'METAL LABEL', uniteVente: 'pièces' });
  eq('aucun type du tout : rien de calculé', rien.colis.length, 0);
  eq('et la ligne logistique est réclamée', rien.manques[0]?.genre, 'type');
}
{
  const r = contenuDuColis({ article: { categoryId: 'X', pcsPerBag: 10, bagsPerCarton: 2 }, categories: [], generalCategories: [] });
  eq('sans pôle : on demande de rattacher la famille', r.manques[0]?.genre, 'pole');
}

console.log('\n── Sortie : désaccord arrivage / catalogue ──');
{
  const famille = familleV({ zipperQualities: [{ label: 'CL-5', pcsPerBag: 100, bagsPerCarton: 20 }] });
  const r = sortie({ quality: 'CL-5', pcsPerBag: 120 }, poleV('zipper', 'pièces'), famille);
  eq('l’arrivage est retenu', r.colis[0]?.contenu, 2400);
  eq('un désaccord', r.desaccords.length, 1);
  eq('sur Pcs/sac', r.desaccords[0]?.champ, 'pcsPerBag');
  check('le texte dit les deux chiffres', /120 sur l'arrivage, 100 au catalogue/.test(r.desaccords[0]?.texte || ''), r.desaccords[0]?.texte);
  eq('Sacs/carton vient du catalogue', r.colis[0]?.facteurs.find(f => f.champ === 'bagsPerCarton')?.source, 'catalogue');
  const accord = sortie({ quality: 'CL-5', pcsPerBag: 100 }, poleV('zipper', 'pièces'), famille);
  eq('mêmes chiffres : aucun désaccord', accord.desaccords.length, 0);
  const unite = sortie({ rollLength: 50, rollLengthUnit: 'M' }, poleV('fabric', 'm'),
    familleV({ fabricQualities: [{ label: 'X', rollLength: 50, rollLengthUnit: 'metres' }] }));
  eq('« M » et « metres » sont la même unité', unite.desaccords.length, 0);
}
{
  // La ligne de ventilation prime sur l'article.
  const r = sortie({ pcsPerBag: 50, bagsPerCarton: 10 }, poleV('zipper', 'pièces'), familleV(), { quality: 'A', pcsPerBag: 200 });
  eq('la ligne de ventilation d’abord', r.colis[0]?.contenu, 2000);
}

console.log('\n── versUniteDeVente ──');
{
  const z = { type: 'zipper', uniteVente: 'pièces', facteurs: [{ pcsPerBag: 120, bagsPerCarton: 20 }] };
  const conv = (q: number, u: string, o: any) => versUniteDeVente(q, u, o);
  eq('3 cartons = 7 200 pièces', conv(3, 'cartons', z).quantite, 7200);
  eq('5 sacs = 600 pièces', conv(5, 'sacs', z).quantite, 600);
  eq('2 douzaines = 24 pièces', conv(2, 'doz', z).quantite, 24);
  eq('1 grosse = 144 pièces', conv(1, 'gross (144p)', z).quantite, 144);
  eq('10 pièces = 10 pièces', conv(10, 'pièces', z).quantite, 10);
  eq('les pièces deviennent des douzaines', conv(24, 'pcs', { uniteVente: 'doz' }).quantite, 2);
  eq('100 yds = 91,44 m', conv(100, 'yds', { uniteVente: 'm' }).quantite, 91.44);
  eq('des mètres restent des mètres', conv(12.5, 'm', { uniteVente: 'm' }).quantite, 12.5);
  const tissu = { type: 'fabric', uniteVente: 'm', facteurs: [{ rollLength: 100, rollLengthUnit: 'yds', packagingPerBag: 6 }] };
  eq('2 rouleaux de 100 yds = 182,88 m', conv(2, 'rouleaux', tissu).quantite, 182.88);
  eq('1 sac de 6 rouleaux = 548,64 m', conv(1, 'bag', tissu).quantite, 548.64);
  const ruban = { type: 'tape', uniteVente: 'm', facteurs: [{ rollLength: 25, rollsPerShrink: 5, rollsPerCarton: 40 }], uniteLongueurParDefaut: 'm' };
  eq('1 carton de ruban = 1 000 m', conv(1, 'cartons', ruban).quantite, 1000);
  eq('1 shrink de ruban = 125 m', conv(1, 'shrink', ruban).quantite, 125);
  const acc = { type: 'accessory', uniteVente: 'pièces', facteurs: { pcsPerBox: 144, boxPerCarton: 10 } };
  eq('2 boîtes = 288 pièces', conv(2, 'boites', acc).quantite, 288);
  eq('1 carton d’accessoires = 1 440 pièces', conv(1, 'ctn', acc).quantite, 1440);
  eq('un objet de facteurs seul est accepté', conv(1, 'carton', { type: 'zipper', uniteVente: 'pièces', facteurs: { pcsPerCtn: 500 } }).quantite, 500);
  // Les priorités : la première source l'emporte.
  eq('la première source prime', conv(1, 'sac', { type: 'zipper', uniteVente: 'pièces', facteurs: [{ pcsPerBag: 50 }, { pcsPerBag: 99 }] }).quantite, 50);

  const refus = (r: any) => r.ok === false && r.quantite === null && typeof r.raison === 'string' && r.raison.length > 0;
  check('le kilo est refusé', refus(conv(10, 'kg', z)));
  check('une unité de vente en kilos est refusée', refus(conv(10, 'pièces', { uniteVente: 'kg' })));
  check('sans unité de vente : refus', refus(conv(10, 'pièces', { uniteVente: undefined })));
  check('une unité inconnue est refusée', refus(conv(10, 'bidule', z)));
  check('des pièces ne deviennent pas des mètres', refus(conv(10, 'pièces', { uniteVente: 'm' })));
  check('un carton sans facteur : refus', refus(conv(1, 'carton', { type: 'zipper', uniteVente: 'pièces', facteurs: [{ pcsPerBag: 120 }] })));
  check('…qui dit ce qui manque', /Sacs\/carton/.test((conv(1, 'carton', { type: 'zipper', uniteVente: 'pièces', facteurs: [{ pcsPerBag: 120 }] }) as any).raison));
  check('un carton sans type : refus', refus(conv(1, 'carton', { uniteVente: 'pièces', facteurs: [{ pcsPerCtn: 10 }] })));
  check('un tissu ne part pas en cartons', refus(conv(1, 'carton', tissu)));
  check('une fermeture ne se compte pas en rouleaux', refus(conv(1, 'rouleau', z)));
  check('un rouleau de tissu vendu à la pièce : refus', refus(conv(1, 'rouleau', { ...tissu, uniteVente: 'pièces' })));
}

console.log('\n── Le ruban : le colisage des documents ne lit PAS la case « Unité rouleau » ──');
{
  // Les formulaires de commande écrivent rollLengthUnit = 'm' sur chaque ruban, sans choix. Le
  // lire changerait les bons de réception de tous les rubans achetés en yards : on ne le lit pas.
  const formulaire = calc({ quantity: 1000, unitOfMeasure: 'yds', rollLength: 100, rollLengthUnit: 'm', rollsPerShrink: 5, rollsPerCarton: 50 }, 'tape');
  eq('ruban en yds avec le « m » du formulaire : 10 rouleaux, comme avant', formulaire.comptages[0]?.entiers, 10);
  eq('…sans rouleau entamé', formulaire.comptages[0]?.reste, 0);
  eq('…et 2 shrinks pile', formulaire.comptages[1]?.entiers, 2);
  const c = calc({ quantity: 1000, unitOfMeasure: 'm', rollLength: 100, rollLengthUnit: 'yds' }, 'tape');
  eq('la case seule ne change rien au colisage : 10 rouleaux', c.comptages[0]?.aCompter, 10);
  const ancien = calc({ quantity: 1000, unitOfMeasure: 'm', rollLength: 100, lengthUnit: 'yds' }, 'tape');
  eq('l’ancien lengthUnit reste lu, comme avant', ancien.comptages[0]?.aCompter, 11);
  const sans = calc({ quantity: 1000, unitOfMeasure: 'm', rollLength: 100 }, 'tape');
  eq('sans unité : comme avant, 10 rouleaux', sans.comptages[0]?.aCompter, 10);
}

console.log('\n── Sortie : l’unité du rouleau de ruban ne vient que du catalogue ──');
{
  // Le « m » posé par le formulaire sur l'article ne passe pas devant « yds » au catalogue.
  const famille = familleV({ tapeQualities: [{ label: '25MM', rollLength: 100, rollLengthUnit: 'yds' }] });
  const r = sortie({ quality: '25MM', rollLength: 100, rollLengthUnit: 'm' }, poleV('tape', 'm', { uniteAchat: 'yds' }), famille);
  eq('1 rouleau = 100 yds = 91,44 m', r.colis[0]?.contenu, 91.44);
  eq('aucun faux désaccord sur l’unité', r.desaccords.length, 0);
  eq('prêt', r.pret, true);
  // Sans unité au catalogue : le « m » de l'arrivage est ignoré, on prend l'unité de l'article.
  const sansCatalogue = sortie({ rollLength: 100, rollLengthUnit: 'm', unitOfMeasure: 'yds' }, poleV('tape', 'm', { uniteAchat: 'yds' }));
  eq('ruban sans unité au catalogue : l’unité de l’article (yds)', sansCatalogue.colis[0]?.contenu, 91.44);
  eq('…qui est aussi celle du pôle : rien à confirmer', sansCatalogue.pret, true);
}

console.log('\n── Sortie : unité du rouleau supposée, à confirmer ──');
{
  // Longueur relevée à l'arrivage, aucune unité saisie : le bon de réception la compte dans
  // l'unité de l'article. Si le pôle achète dans une autre unité, c'est à confirmer.
  const r = sortie({ rollLength: 100, unitOfMeasure: 'yds' }, poleV('fabric', 'm', { uniteAchat: 'm' }));
  eq('l’unité de l’article d’abord (comme le bon de réception) : 91,44 m', r.colis[0]?.contenu, 91.44);
  eq('pas prêt', r.pret, false);
  const m = r.manques.find(x => x.action === 'confirmer');
  check('une consigne « à confirmer »', !!m && /l'article est compté en yds, le pôle achète en m/.test(m.texte), JSON.stringify(r.manques));
  eq('elle nomme la colonne du tissu : « Unité »', m?.libelles?.[0], 'Unité (m ou yds)');
  // Longueur venue du catalogue : l'unité d'achat du pôle d'abord.
  const cat = sortie({ unitOfMeasure: 'yds' }, poleV('fabric', 'm', { uniteAchat: 'm' }), familleV({ fabricQualities: [{ label: 'T', rollLength: 100 }] }));
  eq('longueur du catalogue : l’unité d’achat du pôle', cat.colis[0]?.contenu, 100);
}

console.log('\n── Sortie : « y » (fenêtre de Groupes) vaut yards ──');
{
  const r = sortie({}, poleV('fabric', 'm', { uniteAchat: 'm' }), familleV({ fabricQualities: [{ label: 'T190', rollLength: 100, rollLengthUnit: 'y' }] }));
  eq('« y » est lu yards', r.colis[0]?.contenu, 91.44);
  eq('rien à saisir', r.manques.length, 0);
  const a = sortie({ rollLength: 100, rollLengthUnit: 'yds' }, poleV('fabric', 'm'), familleV({ fabricQualities: [{ label: 'T190', rollLength: 100, rollLengthUnit: 'y' }] }));
  eq('« yds » et « y » : pas de faux désaccord', a.desaccords.length, 0);
}

console.log('\n── Sortie : désaccord de longueur, comparé en mètres ──');
{
  const meme = sortie({ rollLength: 100, rollLengthUnit: 'yds' }, poleV('fabric', 'm'), familleV({ fabricQualities: [{ label: 'T', rollLength: 91.44, rollLengthUnit: 'm' }] }));
  eq('100 yds et 91,44 m : le même rouleau, aucun désaccord', meme.desaccords.length, 0);
  eq('prêt', meme.pret, true);
  const faux = sortie({ rollLength: 100, rollLengthUnit: 'm' }, poleV('fabric', 'm'), familleV({ fabricQualities: [{ label: 'T', rollLength: 100, rollLengthUnit: 'yds' }] }));
  eq('100 m contre 100 yds : un seul désaccord', faux.desaccords.length, 1);
  eq('…bloquant', faux.desaccords[0]?.bloquant, true);
  check('…qui dit les deux longueurs avec leur unité', /100 m sur l'arrivage, 100 yds au catalogue/.test(faux.desaccords[0]?.texte || ''), faux.desaccords[0]?.texte);
  eq('le produit n’est pas prêt', faux.pret, false);
}

console.log('\n── Sortie : les nombres ambigus sont à corriger ──');
{
  const acc = (pcsPerBox: any) => sortie({ pcsPerBox, boxPerCarton: 12 }, poleV('accessory', 'pièces', { uniteAchat: 'pièces' }));
  for (const v of ['1 000', '1,000', '1.000', 'VARIOUS', '20/30']) {
    const r = acc(v);
    check(`« ${v} » n’est pas lu comme un nombre`, r.colis.length === 0 && r.pret === false, JSON.stringify(r.colis));
    check(`« ${v} » : consigne « Corriger » sur l’article`, r.manques.some(m => m.action === 'corriger' && /^Corriger « Pcs\/boîte »/.test(m.texte) && /Arrivages/.test(m.texte)),
      JSON.stringify(r.manques.map(m => m.texte)));
  }
  eq('« 1000 » : 12 000 pièces', acc('1000').colis[0]?.contenu, 12000);
  eq('« 120 pcs » : lu 120', acc('120 pcs').colis[0]?.contenu, 1440);
  eq('« 1,5 » reste une virgule décimale', nombreSaisi('1,5'), 1.5);
  // Une valeur illisible au CATALOGUE se corrige dans Qualités.
  const cat = sortie({}, poleV('accessory', 'pièces'), familleV({ name: 'BOUTONS', accessoryQualities: [{ label: 'B', pcsPerBox: '1,000', boxPerCarton: 12 }] }));
  check('valeur du catalogue : on la corrige dans Qualités',
    cat.manques.some(m => m.action === 'corriger' && /pour la qualité N°1 \(B\) de la famille BOUTONS dans \/gestion → Catalogue → Qualités/.test(m.texte)),
    JSON.stringify(cat.manques.map(m => m.texte)));
  // La longueur écrite avec son unité.
  const ecrite = sortie({ rollLength: '100 yds' }, poleV('fabric', 'm', { uniteAchat: 'm' }));
  eq('« 100 yds » sans case d’unité : 91,44 m', ecrite.colis[0]?.contenu, 91.44);
  const contraire = sortie({ rollLength: '100 yds', rollLengthUnit: 'm' }, poleV('fabric', 'm'));
  eq('« 100 yds » avec l’unité « m » : à corriger, rien de calculé', contraire.colis.length, 0);
  check('…avec la raison', contraire.manques.some(m => m.action === 'corriger' && /contredit/.test(m.texte)), JSON.stringify(contraire.manques));
  const illisible = sortie({ rollLength: 100, rollLengthUnit: 'rlx' }, poleV('fabric', 'm'));
  check('une unité illisible : « Corriger », pas « Saisir »', illisible.manques.some(m => m.action === 'corriger' && m.genre === 'unite-longueur'), JSON.stringify(illisible.manques));
}

console.log('\n── Sortie : le type n’est jamais deviné d’après les champs de l’article ──');
{
  // Les formulaires recopient Pcs/sac dans Rouleaux/shrink : une étiquette ne devient pas un ruban.
  const r = sortie({ pcsPerBag: 100, bagsPerCarton: 20, rollsPerShrink: 100, rollsPerCarton: 20 }, { id: 'P1', name: 'METAL LABEL', uniteVente: 'pièces' });
  eq('METAL LABEL : aucun type', r.type, undefined);
  eq('aucun contenu chiffré', r.colis.length, 0);
  eq('une seule consigne : la ligne logistique', r.manques.map(m => m.genre).join(','), 'type');
  check('…sans « d’après le nom »', !/d'après le nom :/.test(r.manques[0]?.texte || ''), r.manques[0]?.texte);
  // Un pôle qui a une ligne : c'est la LIGNE qui se règle, pas « Modifier le pôle ».
  const e = sortie({ rollLength: 50 }, { id: 'P1', name: 'ELASTIC TAPE', line: 'ELASTIQUES', specType: 'none' });
  eq('ELASTIC TAPE : supposé ruban d’après son nom', e.type, 'tape');
  check('consigne : « Spécifications de la ligne »',
    /^Régler les spécifications de la ligne « ELASTIQUES » \(bouton « Spécifications de la ligne » dans \/gestion → Catalogue → Groupes\)/.test(e.manques[0]?.texte || ''),
    e.manques[0]?.texte);
  check('…et dit que le type est supposé', /on le suppose ruban d'après son nom ou sa ligne : à confirmer/.test(e.manques[0]?.texte || ''), e.manques[0]?.texte);
  check('l’unité de vente est conditionnelle', e.manques.some(m => m.genre === 'unite-vente' && /si c'est bien un ruban/.test(m.texte)), JSON.stringify(e.manques));
}

console.log('\n── Sortie : l’article qui ne nomme pas sa qualité ──');
{
  const famille = familleV({ name: 'NYLON N°3', zipperQualities: [{ label: 'CL-5' }, { label: 'AUTOLOCK' }] });
  const r = sortie({ pcsPerBag: 100 }, poleV('zipper', 'pièces'), famille);
  check('on demande de nommer la qualité, avec le chemin du dossier',
    /^Nommer la qualité de cet article \(la famille NYLON N°3 en a 2 au catalogue\) : \/gestion → Arrivages → Arrivages/.test(r.manques[0]?.texte || ''),
    r.manques[0]?.texte);
}

console.log('\n── versUniteDeVente : mêmes règles que le colis de sortie ──');
{
  const refus = (r: any) => r.ok === false && r.quantite === null;
  check('des pièces de tissu : refus', refus(versUniteDeVente(2, 'pcs', { type: 'fabric', uniteVente: 'pièces' })));
  check('des mètres de fermeture : refus', refus(versUniteDeVente(2, 'm', { type: 'zipper', uniteVente: 'm' })));
  check('« 1 000 » pcs/boîte : refus', refus(versUniteDeVente(2, 'cartons', { type: 'accessory', uniteVente: 'pièces', facteurs: { pcsPerBox: '1 000', boxPerCarton: 12 } })));
  const ruban = versUniteDeVente(1, 'rouleau', { type: 'tape', uniteVente: 'm', facteurs: [{ rollLength: 100, rollLengthUnit: 'm' }], catalogue: { rollLengthUnit: 'yds' } });
  eq('ruban : l’unité du catalogue l’emporte sur le « m » de l’arrivage', ruban.quantite, 91.44);
  check('unité supposée : refus tant qu’elle n’est pas confirmée',
    refus(versUniteDeVente(1, 'rouleau', { type: 'fabric', uniteVente: 'm', facteurs: [{ rollLength: 100 }], uniteLongueurParDefaut: 'm', uniteArticle: 'yds' })));
}

console.log(`\n${pass} réussis, ${fail} échoués`);
if (fail > 0) process.exit(1);
