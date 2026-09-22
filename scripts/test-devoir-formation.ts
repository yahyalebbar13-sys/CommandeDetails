// Le devoir imprimé doit porter les VRAIS noms des produits chargés, et son corrigé doit tomber
// juste quelles que soient les quantités de départ.
// Lancer :
//   npx tsx scripts/test-devoir-formation.ts

import { planifierChargement } from '../src/lib/stock-formation';
import { choisirCibles, calculerResultats, libelleCible, devoirHtml, corrigeHtml } from '../src/lib/devoir-formation';

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
  couleurs('v5', 'Popeline coton', 'TISSU', ['BLANC', 'CIEL', 'ROSE']),
  couleurs('v6', 'Biais 2cm', 'RUBAN', ['NOIR', 'BLANC']),
];

const lignes = planifierChargement(catalogue);
const cibles = choisirCibles(lignes)!;
const lieux = { boutique: 'Chrifa', autreMagasin: 'Derb Omar', reserve: 'Entrepôt principal' };

console.log('\n── Choix des cibles ──');
check('des cibles sont trouvées', Boolean(cibles));
check('les cinq rôles principaux sont servis',
  [cibles.a, cibles.b, cibles.c, cibles.d, cibles.e].every(c => c && c.quantite > 0));
check('les rôles les plus gourmands reçoivent les plus grosses quantités',
  cibles.a.quantite >= cibles.e.quantite && cibles.e.quantite >= cibles.c.quantite
  && cibles.c.quantite >= cibles.b.quantite && cibles.b.quantite >= cibles.d.quantite,
  [cibles.a, cibles.e, cibles.c, cibles.b, cibles.d].map(c => c.quantite).join(','));
check('deux variantes sont réservées aux exercices de couleur',
  Boolean(cibles.v?.variante && cibles.w?.variante),
  `${libelleCible(cibles.v)} / ${libelleCible(cibles.w)}`);
check('les cibles principales et les variantes sont des produits différents',
  ![cibles.a, cibles.b, cibles.c, cibles.d, cibles.e].some(c => c.rang === cibles.v?.rang || c.rang === cibles.w?.rang));
check('une cible de réserve est prévue pour le transfert', Boolean(cibles.r));
check('tout ce qu’on demande tient dans le stock de départ',
  cibles.a.quantite >= 200 && cibles.b.quantite >= 120 && cibles.c.quantite >= 150
  && cibles.d.quantite >= 60 && cibles.e.quantite >= 200 && (cibles.v?.quantite || 0) >= 30,
  [cibles.a, cibles.b, cibles.c, cibles.d, cibles.e, cibles.v].map(c => c?.quantite).join(','));
check('le libellé d’une variante porte son nom de couleur',
  libelleCible(cibles.v).includes('—') && libelleCible(cibles.v).includes(cibles.v!.variante!));

console.log('\n── Résultats attendus ──');
const r = calculerResultats(cibles);
check('produit principal : départ − 80', r.a === cibles.a.quantite - 80);
check('perte + vente + inventaire : départ − 120', r.b === cibles.b.quantite - 120);
check('vente à crédit : départ − 150', r.c === cibles.c.quantite - 150);
check('deux ventes : départ − 60', r.d === cibles.d.quantite - 60);
check('vente puis retour : départ − 190', r.e === cibles.e.quantite - 190);
check('les montants ne dépendent d’aucun produit',
  r.chiffreAffaires === 3011 && r.encaisse === 2281 && r.creances === 730);
check('l’écart caisse est bien la somme des deux créances', r.chiffreAffaires - r.encaisse === r.creances);
check('les soldes clients recomposent les créances', r.soldeNoor + r.soldeZahra === r.creances);
check('aucune quantité finale n’est négative',
  [r.a, r.b, r.c, r.d, r.e, r.v, r.w].every(x => x === null || x >= 0), JSON.stringify(r));

console.log('\n── Documents imprimés ──');
const devoir = devoirHtml(lignes, cibles, lieux);
const corrige = corrigeHtml(lignes, cibles, lieux);
check('le devoir porte le vrai nom des produits', devoir.includes(cibles.a.nom));
check('le devoir nomme la couleur travaillée', devoir.includes(cibles.v!.variante!));
check('le devoir n’a ni case nom, ni date, ni note',
  !/Nom\s*:/.test(devoir) && !/Date\s*:/.test(devoir) && !devoir.includes('/ 20'));
check('le devoir ne dit plus « référence n° »', !/référence n°/i.test(devoir));
check('le devoir écrit le processus du besoin en entier',
  ['Détecter', 'écrire', 'imprimer', 'commercial', 'import'].every(m => devoir.toLowerCase().includes(m.toLowerCase())));
check('le devoir explique qu’un transfert va d’un lieu à un autre',
  devoir.includes('un magasin vers un autre') || devoir.includes("d'un lieu à un autre"));
check('le devoir nomme les deux magasins', devoir.includes('Chrifa') && devoir.includes('Derb Omar'));
const fmt = (n: number) => n.toLocaleString('fr-MA');
check('le corrigé donne les quantités finales',
  corrige.includes(fmt(r.a)) && corrige.includes(fmt(r.b)), `${fmt(r.a)} / ${fmt(r.b)}`);
check('le corrigé rappelle ce que le reset efface', corrige.includes('Reset Stock'));
check('le corrigé rappelle la demande d’import à supprimer dans /gestion', corrige.includes('Besoins'));
check('les deux documents sont du HTML imprimable complet',
  [devoir, corrige].every(d => d.startsWith('<!DOCTYPE html>') && d.includes('@page') && d.trim().endsWith('</html>')));
check('les noms de produits sont échappés',
  devoirHtml(planifierChargement([...catalogue, simple('x', 'Fil <b>spécial</b>', 'FIL')]),
    choisirCibles(planifierChargement([...catalogue, simple('x', 'Fil <b>spécial</b>', 'FIL')]))!, lieux)
    .includes('&lt;b&gt;'));

console.log('\n── Catalogue pauvre ──');
check('moins de cinq références en boutique : pas de devoir',
  choisirCibles(planifierChargement([simple('u1', 'Un seul produit', 'X')])) === null);

console.log(`\n${pass} réussis, ${fail} échoués`);
if (fail > 0) process.exit(1);
