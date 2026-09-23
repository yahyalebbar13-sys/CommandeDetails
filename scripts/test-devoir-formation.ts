// Le devoir imprimé doit porter les VRAIS noms des produits chargés, faire travailler la recrue
// sur les couleurs, et son corrigé doit tomber juste quelles que soient les quantités de départ.
// Lancer :
//   npx tsx scripts/test-devoir-formation.ts

import { planifierChargement } from '../src/lib/stock-formation';
import {
  choisirCibles, calculerResultats, libelleCible, devoirHtml, corrigeHtml,
  venteRefusee, retourDuDevoir, couleurInventoriee,
} from '../src/lib/devoir-formation';

let pass = 0;
let fail = 0;
function check(label: string, ok: boolean, detail = '') {
  if (ok) { pass++; console.log(`  ✓ ${label}`); }
  else { fail++; console.log(`  ✗ ${label} ${detail}`); }
}

const simple = (id: string, nom: string, cat: string) => ({ id, nameFR: nom, categoryId: cat, purchasePriceMAD: 10 });
const couleurs = (id: string, nom: string, cat: string, labels: string[], qte = 1000) => ({
  id, nameFR: nom, categoryId: cat, quantity: qte, color: 'various',
  colorBreakdown: labels.map(c => ({ colorCode: c, rolls: Math.floor(qte / labels.length) })),
});

const catalogue = [
  simple('s1', 'Aiguille machine 90', 'MERCERIE'),
  simple('s2', 'Craie tailleur', 'MERCERIE'),
  simple('s3', 'Fil polyester 40/2', 'FIL'),
  simple('s4', 'Mètre ruban', 'MERCERIE'),
  simple('s5', 'Ciseaux couture', 'OUTIL'),
  simple('s6', 'Épingles tête ronde', 'MERCERIE'),
  couleurs('v1', 'Doublure polyester', 'TISSU', ['NOIR', 'BEIGE', 'BLANC', 'BLEU']),
  couleurs('v2', 'Fermeture N5', 'ZIP', ['101', '580', '999']),
  couleurs('v3', 'Ruban satin 1cm', 'RUBAN', ['ROUGE', 'BLEU']),
  couleurs('v4', 'Élastique 2cm', 'RUBAN', ['BLANC', 'NOIR']),
  simple('s7', 'Bouton pression 12mm', 'MERCERIE'),
  simple('s8', 'Oeillet 8mm', 'MERCERIE'),
  simple('s9', 'Crochet soutien', 'MERCERIE'),
  simple('s10', 'Sac plastique 30x40', 'EMBALLAGE'),
  couleurs('v5', 'Popeline coton', 'TISSU', ['BLANC', 'CIEL', 'ROSE', 'MARINE']),
  couleurs('v6', 'Biais 2cm', 'RUBAN', ['NOIR', 'BLANC']),
];

const lignes = planifierChargement(catalogue);
const cibles = choisirCibles(lignes)!;
const lieux = { boutique: 'Chrifa', autreMagasin: 'Derb Omar', reserve: 'Entrepôt principal' };
const r = calculerResultats(cibles, lieux);

console.log('\n── Choix des cibles ──');
check('des cibles sont trouvées', Boolean(cibles));
check('les cinq rôles principaux sont servis',
  [cibles.a, cibles.b, cibles.c, cibles.d, cibles.e].every(c => c && c.quantite > 0));
check('les rôles les plus gourmands reçoivent les plus grosses quantités',
  cibles.a.quantite >= cibles.e.quantite && cibles.e.quantite >= cibles.b.quantite
  && cibles.b.quantite >= cibles.c.quantite && cibles.c.quantite >= cibles.d.quantite,
  [cibles.a, cibles.e, cibles.b, cibles.c, cibles.d].map(c => c.quantite).join(','));
check('deux produits multicouleurs sont réservés aux ventes par couleur',
  Boolean(cibles.m && cibles.n), `${cibles.m?.nom} / ${cibles.n?.nom}`);
check('ce sont les plus riches en couleurs',
  (cibles.m?.variantes.length || 0) >= 3 && (cibles.n?.variantes.length || 0) >= 3,
  `${cibles.m?.variantes.length} / ${cibles.n?.variantes.length}`);
check('deux variantes isolées restent pour les autres exercices',
  Boolean(cibles.v?.variante && cibles.w?.variante),
  `${libelleCible(cibles.v)} / ${libelleCible(cibles.w)}`);
check('aucun produit ne joue deux rôles à la fois',
  new Set([cibles.a, cibles.b, cibles.c, cibles.d, cibles.e, cibles.v, cibles.w]
    .filter(Boolean).map(c => c!.rang).concat([cibles.m!.rang, cibles.n!.rang])).size === 9);
check('une cible de réserve est prévue', Boolean(cibles.r));
check('tout ce qu’on demande tient dans le stock de départ',
  cibles.a.quantite >= 200 && cibles.b.quantite >= 120 && cibles.c.quantite >= 120
  && cibles.d.quantite >= 60 && cibles.e.quantite >= 200 && (cibles.v?.quantite || 0) >= 30,
  [cibles.a, cibles.b, cibles.c, cibles.d, cibles.e, cibles.v].map(c => c?.quantite).join(','));
check('le libellé d’une variante porte son nom de couleur',
  libelleCible(cibles.v).includes('—') && libelleCible(cibles.v).includes(cibles.v!.variante!));

console.log('\n── Résultats attendus ──');
check('produit principal : départ + 120 − 200', r.a === cibles.a.quantite + 120 - 200);
check('perte + vente + inventaire : départ − 120', r.b === cibles.b.quantite - 120);
check('crédit + commande préparée : départ − 120', r.c === cibles.c.quantite - 120);
check('deux ventes : départ − 60', r.d === cibles.d.quantite - 60);
check('vente puis retour : départ − 190', r.e === cibles.e.quantite - 190);
check('aucune quantité finale n’est négative',
  r.lignes.every(l => l.final >= 0),
  JSON.stringify(r.lignes.filter(l => l.final < 0)));
check('chaque couleur du produit multicouleur a sa ligne de résultat',
  r.m.length === cibles.m!.variantes.length && r.n.length === cibles.n!.variantes.length);
check('la dernière couleur vendue tombe exactement à zéro',
  r.n[r.n.length - 1].final === 0, JSON.stringify(r.n));
check('les autres couleurs du même produit gardent du stock',
  r.n.slice(0, -1).every(l => l.final > 0), JSON.stringify(r.n));
check('la couleur comptée à l’inventaire perd bien ses 3 unités',
  r.m[1].final === r.m[1].depart - 21 - 3, `${r.m[1].depart} → ${r.m[1].final}`);
check('le seuil d’alerte se déclenche à la fin, pas au début',
  r.seuilAlerte > r.b && r.seuilAlerte < cibles.b.quantite, `${cibles.b.quantite} → ${r.b} / seuil ${r.seuilAlerte}`);

console.log('\n── L’argent ──');
check('le chiffre d’affaires est la somme des ventes, retour déduit', r.chiffreAffaires > 0);
check('l’argent encaissé est inférieur au chiffre d’affaires', r.encaisse < r.chiffreAffaires);
check('les créances sont la somme des deux soldes clients',
  r.creances === Math.round((r.soldeNoor + r.soldeZahra) * 100) / 100);
check('l’écart caisse s’explique par les créances moins l’avoir du retour',
  Math.abs((r.chiffreAffaires - r.encaisse) - (r.creances - r.avoirNoor)) < 0.01,
  `CA ${r.chiffreAffaires} − encaissé ${r.encaisse} ≠ ${r.creances} − ${r.avoirNoor}`);
const retour = retourDuDevoir(cibles);
check('la facture entièrement réglée laisse un avoir égal au retour',
  r.avoirNoor === retour.valeur, `${r.avoirNoor} / ${retour.valeur}`);
check('le retour rend plus que ce que la cliente avait payé : la remise n’est pas reprise',
  retour.valeur > retour.paye && Math.round((retour.valeur - retour.paye) * 100) / 100 === 2.5,
  `${retour.valeur} rendu / ${retour.paye} payé`);
check('la cliente à crédit doit exactement sa vente', r.soldeZahra === 900);
check('l’autre cliente doit le chèque impayé plus son reste à payer',
  r.soldeNoor === 440 + 332, String(r.soldeNoor));
check('la vente refusée dépasse bien le plafond',
  venteRefusee(cibles).total + r.soldeZahra > venteRefusee(cibles).plafond);

console.log('\n── Documents imprimés ──');
const devoir = devoirHtml(lignes, cibles, lieux);
const corrige = corrigeHtml(lignes, cibles, lieux);
check('le devoir porte le vrai nom des produits', devoir.includes(cibles.a.nom));
check('le devoir nomme toutes les couleurs vendues',
  cibles.m!.variantes.every(v => devoir.includes(v.label)));
check('le devoir compte neuf ventes', /Vente 9 —/.test(devoir) && /Vente 6 —/.test(devoir));
check('le devoir a une partie « vendre par couleur »', devoir.includes('Vendre par couleur'));
check('le devoir fait préparer une commande', devoir.includes('Préparer la commande'));
check('le devoir fait poser un seuil puis y revenir',
  devoir.includes("Poser un seuil d'alerte") && devoir.includes('La boucle est bouclée'));
check('le devoir fait passer par l’achat au marché', devoir.includes('Achat Marchandise (Marché)'));
check('le devoir prévient du refus « vente à perte »', devoir.includes('vente à perte'));
check('le devoir ne dévoile pas la quantité à vider', devoir.includes('tout le reste'));
check('le devoir n’a ni case nom, ni date, ni note',
  !/Nom\s*:/.test(devoir) && !/Date\s*:/.test(devoir) && !devoir.includes('/ 20'));
check('le devoir ne dit plus « référence n° »', !/référence n°/i.test(devoir));
check('le devoir écrit le processus du besoin en entier',
  ['Détecter', 'écrire', 'imprimer', 'commercial', 'import'].every(m => devoir.toLowerCase().includes(m.toLowerCase())));
check('le devoir explique qu’un transfert va d’un magasin à un autre',
  devoir.includes("d'un magasin à un autre"));
check('le devoir nomme les deux magasins', devoir.includes('Chrifa') && devoir.includes('Derb Omar'));
check('aucun prix de revient n’est imprimé',
  [devoir, corrige].every(d => !/prix de revient|prix d’achat|prix d'achat|coût unitaire|valeur d’achat/i.test(d)));
const fmt = (n: number) => n.toLocaleString('fr-MA');
check('le corrigé donne les quantités finales',
  corrige.includes(fmt(r.a)) && corrige.includes(fmt(r.b)), `${fmt(r.a)} / ${fmt(r.b)}`);
check('le corrigé détaille les couleurs', corrige.includes(cibles.m!.variantes[0].label));
check('le corrigé prévient que certaines ventes demandent le compte admin',
  corrige.includes('Valider malgré la perte'));
check('le corrigé rappelle ce que le reset efface', corrige.includes('Reset Stock'));
check('le corrigé rappelle la demande d’import à supprimer dans /gestion', corrige.includes('Besoins'));
check('le corrigé explique la commande préparée qui ne réserve rien',
  corrige.includes('ne réserve rien'));
check('les deux documents sont du HTML imprimable complet',
  [devoir, corrige].every(d => d.startsWith('<!DOCTYPE html>') && d.includes('@page') && d.trim().endsWith('</html>')));
check('les noms de produits sont échappés',
  devoirHtml(planifierChargement([...catalogue, simple('x', 'Fil <b>spécial</b>', 'FIL')]),
    choisirCibles(planifierChargement([...catalogue, simple('x', 'Fil <b>spécial</b>', 'FIL')]))!, lieux)
    .includes('&lt;b&gt;'));
check('la couleur inventoriée est celle du corrigé',
  couleurInventoriee(cibles)!.label === cibles.m!.variantes[1].label);

console.log('\n── Catalogues ingrats ──');
const toutVentile = Array.from({ length: 16 }, (_, i) =>
  couleurs(`x${i}`, `Produit ${String.fromCharCode(65 + i)}`, `FAM${i % 4}`, ['A', 'B', 'C', 'D']));
const ciblesVentilees = choisirCibles(planifierChargement(toutVentile));
check('un catalogue sans aucun produit simple donne quand même un devoir', Boolean(ciblesVentilees));
check('et son stock ne passe jamais sous zéro',
  calculerResultats(ciblesVentilees!, lieux).lignes.every(l => l.final >= 0),
  JSON.stringify(calculerResultats(ciblesVentilees!, lieux).lignes.filter(l => l.final < 0)));

const deuxCouleurs = [
  ...catalogue.filter(a => !('colorBreakdown' in a)),
  couleurs('d1', 'Ruban A', 'RUBAN', ['NOIR', 'BLANC']),
  couleurs('d2', 'Ruban B', 'RUBAN', ['ROUGE', 'BLEU']),
  couleurs('d3', 'Ruban C', 'RUBAN', ['VERT', 'JAUNE']),
  couleurs('d4', 'Ruban D', 'RUBAN', ['GRIS', 'ROSE']),
];
const ciblesDeux = choisirCibles(planifierChargement(deuxCouleurs))!;
const rDeux = calculerResultats(ciblesDeux, lieux);
check('des produits à deux couleurs seulement : pas de ligne fantôme',
  rDeux.m.length === 2 && rDeux.n.length === 2);
check('et rien ne devient négatif', rDeux.lignes.every(l => l.final >= 0),
  JSON.stringify(rDeux.lignes.filter(l => l.final < 0)));
check('la dernière couleur est bien vidée', rDeux.n[rDeux.n.length - 1].final === 0);

console.log('\n── Catalogue pauvre ──');
check('moins de cinq références en boutique : pas de devoir',
  choisirCibles(planifierChargement([simple('u1', 'Un seul produit', 'X')])) === null);

console.log(`\n${pass} réussis, ${fail} échoués`);
if (fail > 0) process.exit(1);
