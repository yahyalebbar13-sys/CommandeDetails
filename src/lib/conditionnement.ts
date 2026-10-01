/**
 * Combien de sacs, de cartons et de barrettes représente une quantité.
 *
 * Le conditionnement est saisi depuis toujours dans les qualités — pièces par sac, sacs par
 * carton, longueur d'un rouleau — mais il n'était jamais calculé : le papier recopiait « Pcs/bag
 * 20 » et le magasinier faisait la division de tête, devant le camion. Ce fichier fait la
 * division.
 *
 * Le principe : chaque type de produit a une ÉCHELLE de colis, du plus petit au plus grand.
 *
 *   tissu        mètres → rouleau → sac  (le tissu ne part pas en cartons)
 *   fermeture    pièces → sac → carton
 *   fil          pièces → sac → carton
 *   curseur      pièces → sac → carton
 *   ruban        mètres → rouleau → shrink, et le carton se compte en ROULEAUX (pas en shrinks)
 *   accessoire   pièces → boîte → carton
 *
 * Chaque échelon vient d'un champ de `QUALITY_SCHEMA`. Un champ vide arrête la chaîne : on
 * n'invente pas un chiffre, on dit lequel manque et où le saisir.
 *
 * La barrette — la pile telle qu'elle se monte sur la palette — n'est pas la même partout :
 * elle dépend du produit ET de ce qu'on empile. Elle se lit donc, elle aussi, dans la qualité.
 */

import { QUALITY_SCHEMA, detectSpecType } from './quality-schema';
import {
  specTypeDeLArticle, ligneQualiteDuCatalogue, emplacementQualiteDuCatalogue, type EmplacementQualite,
} from './specification-produit';
import { poleDeLArticle, uniteImposee } from './unites-pole';

// ── Le vocabulaire des colis ────────────────────────────────────────────────

export interface TypeDeColis {
  cle: string;
  nom: string;
  pluriel: string;
  /** Forme courte, pour une cellule de tableau étroite. */
  abrege: string;
}

export const COLIS: Record<string, TypeDeColis> = {
  rouleau: { cle: 'rouleau', nom: 'rouleau',      pluriel: 'rouleaux',       abrege: 'rlx' },
  sac:     { cle: 'sac',     nom: 'sac',          pluriel: 'sacs',           abrege: 'sacs' },
  shrink:  { cle: 'shrink',  nom: 'shrink',       pluriel: 'shrinks',        abrege: 'shrk' },
  boite:   { cle: 'boite',   nom: 'boîte',        pluriel: 'boîtes',         abrege: 'btes' },
  carton:  { cle: 'carton',  nom: 'carton',       pluriel: 'cartons',        abrege: 'ctn' },
};

/** Un échelon de l'échelle : ce qu'il compte, et d'où vient son chiffre. */
export interface NiveauColis {
  colis: TypeDeColis;
  /** La clé du niveau que celui-ci regroupe. `''` = l'unité de l'article (mètres, pièces…). */
  base: string;
  /** Le champ de qualité qui donne le nombre de `base` par colis. */
  champ: string;
  label: string;
  /** Combien de `base` dans un colis. `null` quand le champ n'est pas saisi. */
  parUnite: number | null;
  /**
   * Un echelon que beaucoup de fournisseurs n'ont pas : le grand carton, le film retractable.
   * Non saisi, il disparait sans reclamer sa saisie — ce n'est pas un oubli.
   */
  optionnel?: boolean;
}

export interface Empilage {
  /** Le colis empilé. */
  niveau: string;
  parRangee: number;
  rangees: number;
  /** `parRangee × rangees` — le nombre de colis d'une barrette pleine. */
  parBarrette: number;
}

export interface Echelle {
  type?: string;
  /** L'unité dans laquelle la quantité de l'article est exprimée. */
  unite: string;
  niveaux: NiveauColis[];
  empilage: Empilage | null;
  /**
   * L'échelon que l'unité de l'article nomme déjà — « rouleaux », « cartons ». La quantité EST
   * son compte : les échelons plus petits sortent de la chaîne, et ceux qui s'appuient sur lui
   * partent de la quantité elle-même.
   */
  depart?: string;
  /** Combien de pièces vaut une unité de la quantité : 12 pour des douzaines, 144 pour des grosses. */
  enPieces: number;
  /** Renseignée quand rien n'est comptable : la quantité est un poids, ou une unité inconnue. */
  uniteIncompatible?: NatureUnite;
}

// ── Construction de l'échelle ───────────────────────────────────────────────

/** Les échelles des six types, décrites une seule fois. */
const ECHELLES: Record<string, { colis: string; base: string; champ: string; optionnel?: true }[]> = {
  // Le tissu se compte en SACS quand plusieurs rouleaux y sont reunis, et en ROULEAUX sinon.
  // Il ne part pas en cartons : c'est la mercerie qui part en cartons.
  fabric: [
    { colis: 'rouleau', base: '',        champ: 'rollLength' },
    { colis: 'sac',     base: 'rouleau', champ: 'packagingPerBag' },
  ],
  zipper: [
    { colis: 'sac',    base: '',       champ: 'pcsPerBag' },
    { colis: 'carton', base: 'sac',    champ: 'bagsPerCarton' },
  ],
  thread: [
    { colis: 'sac',    base: '',       champ: 'pcsPerBag' },
    { colis: 'carton', base: 'sac',    champ: 'bagsPerCarton' },
  ],
  slider: [
    { colis: 'sac',    base: '',       champ: 'pcsPerBag' },
    { colis: 'carton', base: 'sac',    champ: 'bagsPerCarton' },
  ],
  tape: [
    { colis: 'rouleau', base: '',        champ: 'rollLength' },
    { colis: 'shrink',  base: 'rouleau', champ: 'rollsPerShrink', optionnel: true },
    // Le carton de ruban se compte en rouleaux, pas en shrinks : c'est ainsi que le champ est
    // saisi (« Rouleaux/carton »), et l'inverser ferait un facteur dix sur le nombre de cartons.
    { colis: 'carton',  base: 'rouleau', champ: 'rollsPerCarton' },
  ],
  accessory: [
    { colis: 'boite',  base: '',       champ: 'pcsPerBox' },
    { colis: 'carton', base: 'boite',  champ: 'boxPerCarton' },
  ],
};

const sansAccent = (v: unknown): string =>
  String(v ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();

/** Un nombre utilisable : « 20 », 20, « 20 pcs » valent 20 ; vide, 0 et « various » ne valent rien. */
export function nombreSaisi(v: unknown): number | null {
  if (v === null || v === undefined) return null;
  const texte = String(v).replace(',', '.').trim();
  if (!texte) return null;
  const trouve = texte.match(/-?\d+(?:\.\d+)?/);
  if (!trouve) return null;
  const n = Number(trouve[0]);
  return isFinite(n) && n > 0 ? n : null;
}

/**
 * Un champ réellement renseigné. Le zéro n'en est pas un : « 0 sac par carton » ne veut rien
 * dire, c'est une case qu'on a traversée au clavier. S'il faisait autorité, il masquerait la
 * valeur du catalogue et le document réclamerait la saisie d'un champ déjà rempli ailleurs.
 * Même règle que `rempli()` dans specification-produit.ts.
 */
const saisi = (v: unknown): boolean =>
  v !== null && v !== undefined && String(v).trim() !== '' && String(v).trim() !== '0';

/**
 * La valeur d'un champ de qualité, dans l'ordre où elle fait autorité : la ligne de ventilation
 * d'abord — c'est elle qui distingue deux qualités du même produit — puis l'article, puis le
 * catalogue.
 *
 * Le dernier recours compte plus qu'il n'y paraît : le conditionnement se saisit dans l'écran
 * Qualités, mais un article commandé AVANT cette saisie n'en porte pas la copie. Sans ce
 * rattrapage, remplir « 4 sacs par rangée, 12 de hauteur » n'aurait aucun effet sur les dossiers
 * déjà en route — il aurait fallu rouvrir et réenregistrer chaque commande.
 */
function valeur(article: any, ligneQualite: any, champ: string, catalogue?: any): unknown {
  if (saisi(ligneQualite?.[champ])) return ligneQualite[champ];
  if (saisi(article?.[champ])) return article[champ];
  return catalogue?.[champ];
}

const libelleDuChamp = (type: string | undefined, champ: string): string =>
  (type ? QUALITY_SCHEMA[type] : undefined)?.find(f => f.key === champ)?.label || champ;

/**
 * Les unités qui désignent déjà un colis plutôt qu'une mesure.
 *
 * Le piège : un tissu acheté AU ROULEAU porte `quantity: 120` et `unitOfMeasure: 'rouleaux'`.
 * Diviser 120 par la longueur d'un rouleau donnerait 1,2 rouleau pour 120 rouleaux reçus. Quand
 * l'unité de l'article nomme déjà un échelon, la chaîne DÉMARRE à cet échelon.
 */
const UNITES_COLIS: Record<string, string> = {
  rouleau: 'rouleau', rouleaux: 'rouleau', rlx: 'rouleau', roll: 'rouleau', rolls: 'rouleau',
  sac: 'sac', sacs: 'sac', bag: 'sac', bags: 'sac',
  shrink: 'shrink', shrinks: 'shrink',
  boite: 'boite', boites: 'boite', box: 'boite', boxes: 'boite',
  carton: 'carton', cartons: 'carton', ctn: 'carton', ctns: 'carton',
};

/**
 * Ce que mesure l'unité d'un article. Une chaîne de conditionnement part soit d'un COMPTE
 * (pièces, douzaines, grosses), soit d'une LONGUEUR (mètres, yards) — jamais d'un poids.
 *
 * Le garde-fou compte : un article vendu au kilo divisé par « pièces/sac » sortirait un nombre
 * de sacs que personne ne retrouverait devant le camion. Mieux vaut ne rien annoncer.
 */
export type NatureUnite = 'compte' | 'longueur' | 'poids' | 'colis' | 'inconnue';

export function natureUnite(unite: unknown): NatureUnite {
  const u = sansAccent(unite);
  if (!u) return 'inconnue';
  if (UNITES_COLIS[u]) return 'colis';
  if (/^(m|metre|metres|ml|mtr|yd|yds|yard|yards|cm)$/.test(u)) return 'longueur';
  if (/^(kg|kgs|kilo|kilos|g|gr|grammes?|tonnes?|t)$/.test(u)) return 'poids';
  if (facteurEnPieces(u) !== null) return 'compte';
  return 'inconnue';
}

/**
 * Combien de pièces vaut une unité de compte. Une douzaine en vaut douze, une grosse cent
 * quarante-quatre : sans cette conversion, « 500 doz » divisé par « 20 pcs/sac » donnerait
 * 25 sacs au lieu de 300.
 */
function facteurEnPieces(unite: string): number | null {
  const u = sansAccent(unite);
  if (/^(pc|pcs|piece|pieces|unite|unites|u|ea|set|sets|paire|paires)$/.test(u)) return 1;
  if (u.startsWith('doz') || u.startsWith('dz') || u.startsWith('douzaine')) return 12;
  if (u.startsWith('gross') || u.startsWith('grosse')) return 144;
  return null;
}

/** Le facteur pour passer de l'unité du champ à celle de la quantité. 1 quand rien ne les oppose. */
const YARD_EN_METRE = 0.9144;
function facteurDeLongueur(uniteArticle: string, uniteChamp: unknown): number {
  const a = sansAccent(uniteArticle), b = sansAccent(uniteChamp);
  if (!a || !b) return 1;
  const metre = (v: string) => v === 'm' || v === 'metre' || v === 'metres' || v === 'mtr' || v === 'ml';
  const yard = (v: string) => v === 'yd' || v === 'yds' || v === 'yard' || v === 'yards';
  if (metre(a) && yard(b)) return YARD_EN_METRE;       // un rouleau de 100 yds = 91,44 m
  if (yard(a) && metre(b)) return 1 / YARD_EN_METRE;
  return 1;
}

/**
 * L'échelle de colis d'un article, avec les chiffres réellement saisis.
 *
 * @param ligneQualite la ligne de ventilation par qualité, quand on en imprime une : ses valeurs
 *                     priment, puisque c'est précisément ce qui distingue deux qualités.
 */
export function echelleDeLArticle(
  article: any,
  categories: any[] = [],
  generalCategories: any[] = [],
  ligneQualite?: any,
): Echelle {
  const type = specTypeDeLArticle(article, categories, generalCategories);
  const unite = String(article?.unitOfMeasure || 'pcs').trim();
  const modele = type ? ECHELLES[type] : undefined;
  if (!modele) return { type, unite, niveaux: [], empilage: null, enPieces: 1 };

  // L'unité de l'article nomme-t-elle déjà un colis ? Si oui, tout ce qui est plus petit est
  // déjà compté et disparaît de la chaîne.
  const depart = UNITES_COLIS[sansAccent(unite)];
  const rangDepart = depart ? modele.findIndex(n => n.colis === depart) : -1;

  // Rien ne se compte à partir d'un poids, ni d'une unité qu'on ne reconnaît pas. On le dit
  // plutôt que de sortir un chiffre faux.
  const catalogue = ligneQualiteDuCatalogue(article, categories, generalCategories, type, ligneQualite);
  const nature = natureUnite(unite);
  const attendue: NatureUnite = modele[0].base === '' && (modele[0].champ === 'rollLength') ? 'longueur' : 'compte';
  if (rangDepart < 0 && nature !== attendue) {
    return { type, unite, niveaux: [], empilage: null, enPieces: 1, uniteIncompatible: nature };
  }
  // « 500 doz » sont 6 000 pièces : c'est en pièces que le conditionnement est saisi.
  const enPieces = attendue === 'compte' && rangDepart < 0 ? (facteurEnPieces(unite) ?? 1) : 1;

  const niveaux: NiveauColis[] = [];
  modele.forEach((def, rang) => {
    if (rangDepart >= 0 && rang <= rangDepart) return;   // déjà compté par l'unité de l'article
    let parUnite = nombreSaisi(valeur(article, ligneQualite, def.champ, catalogue));
    // Une longueur de rouleau peut être saisie en yards alors que l'article s'achète au mètre.
    if (parUnite !== null && def.base === '') {
      // Pour le ruban, on lit toujours `lengthUnit` (en pratique jamais rempli : facteur 1) et PAS
      // la nouvelle case « Unité rouleau » : les formulaires de commande écrivent `rollLengthUnit
      // = 'm'` par défaut sur chaque ruban, sans que personne l'ait choisi. Le lire ici changerait
      // le nombre de rouleaux des bons de réception de tous les rubans achetés en yards. Seul le
      // colis de sortie (`contenuDuColis`, plus bas) lit cette case — et seulement au catalogue.
      parUnite *= facteurDeLongueur(unite, valeur(article, ligneQualite, type === 'tape' ? 'lengthUnit' : 'rollLengthUnit', catalogue));
    }
    niveaux.push({
      colis: COLIS[def.colis], base: def.base, champ: def.champ,
      label: libelleDuChamp(type, def.champ), parUnite, optionnel: def.optionnel,
    });
  });

  // Raccourci historique : beaucoup d'articles portent un « pcs/carton » saisi à la main, sans
  // le détail des sacs. Il vaut mieux que rien — il donne le carton, qui est ce qu'on compte à
  // la réception — mais il ne prime jamais sur une chaîne complète. Malgré son nom, il compte
  // dans l'unité de l'article : pour un tissu au mètre, c'est un nombre de MÈTRES par carton.
  const carton = niveaux.find(n => n.colis.cle === 'carton');
  if (carton && !carton.parUnite && rangDepart < 0) {
    const direct = nombreSaisi(valeur(article, ligneQualite, 'pcsPerCtn', catalogue));
    if (direct) Object.assign(carton, { base: '', champ: 'pcsPerCtn', label: 'Pcs/carton', parUnite: direct });
  }

  return {
    type, unite, niveaux, enPieces, depart: rangDepart >= 0 ? depart : undefined,
    empilage: empilageDeLArticle(article, ligneQualite, niveaux, rangDepart >= 0 ? depart : undefined, catalogue),
  };
}

/**
 * LE conditionnement en gros : ce qu'on porte, ce qu'on compte, ce qu'on charge.
 *
 * Chaque catégorie n'en a qu'un. La mercerie part au CARTON — le sachet qui est dedans n'est pas
 * une unité de manutention, c'est l'intérieur du carton. Le tissu part au SAC quand plusieurs
 * rouleaux y sont réunis, et au ROULEAU quand il n'y en a qu'un.
 *
 * Rien de tout cela ne se saisit : la règle le déduit de ce qui est déjà rempli dans la qualité.
 * **Le conditionnement en gros est le plus grand niveau réellement rempli, et un niveau dont le
 * facteur vaut 1 n'est pas un niveau** — « un rouleau par sac », c'est un rouleau, pas un sac.
 *
 * La seule exception est la conversion de base (mètres → rouleau) : un rouleau reste un rouleau
 * même s'il ne fait qu'un mètre.
 */
export function niveauEnGros(niveaux: NiveauColis[]): NiveauColis | null {
  for (let i = niveaux.length - 1; i >= 0; i--) {
    const n = niveaux[i];
    if (!n.parUnite) continue;
    if (n.base !== '' && n.parUnite <= 1) continue;   // « 1 rouleau par sac » : pas de sac
    return n;
  }
  return null;
}

/**
 * L'empilage en barrette. On empile TOUJOURS le conditionnement en gros : il n'y a rien à
 * choisir, seulement à dire combien de colis par rangée et combien de rangées.
 */
function empilageDeLArticle(
  article: any, ligneQualite: any, niveaux: NiveauColis[], depart?: string, catalogue?: any,
): Empilage | null {
  const parRangee = nombreSaisi(valeur(article, ligneQualite, 'stackPerRow', catalogue));
  const rangees = nombreSaisi(valeur(article, ligneQualite, 'stackRows', catalogue));
  if (!parRangee || !rangees) return null;

  // Rien à empiler quand la chaîne ne produit aucun colis — sauf si l'article s'achète déjà
  // dans un colis (« 240 cartons »), qui est alors le conditionnement en gros.
  const cle = niveauEnGros(niveaux)?.colis.cle || depart;
  if (!cle) return null;

  return { niveau: cle, parRangee, rangees, parBarrette: parRangee * rangees };
}

// ── Application à une quantité ──────────────────────────────────────────────

export interface ComptageColis {
  colis: TypeDeColis;
  /** Le compte exact, virgule comprise : 240,5 cartons. */
  total: number;
  /** Les colis pleins. */
  entiers: number;
  /** Ce qui reste, entre 0 et 1 : 0,5 = un colis rempli à moitié. */
  reste: number;
  /** Ce que le magasinier verra physiquement passer : les pleins, plus l'entamé. */
  aCompter: number;
  /**
   * Vrai pour l'échelon que l'unité de l'article nomme déjà — « 500 cartons ». Il compte comme
   * les autres, mais ne se répète pas dans le texte : la colonne Quantité le dit déjà.
   */
  depart?: boolean;
}

export interface Barrettes {
  niveau: TypeDeColis;
  /**
   * Le compte réel, virgule comprise : 14,5 barrettes, ou 0,25 pour une couleur qui n'en remplit
   * qu'un quart. C'est ce chiffre-là qui dit la place au sol, et il vaut souvent moins de 1 —
   * arrondi à l'entier, une couleur rare n'en aurait aucune et disparaîtrait du document.
   */
  total: number;
  /** Les barrettes complètes. */
  entieres: number;
  /** Les colis qui restent, en dessous d'une barrette pleine. */
  resteColis: number;
  parBarrette: number;
}

export interface Colisage {
  echelle: Echelle;
  quantite: number;
  unite: string;
  /** Un comptage par échelon calculable, du plus petit au plus grand. */
  comptages: ComptageColis[];
  /**
   * LE colis qu'on compte : le carton pour la mercerie, le sac ou le rouleau pour le tissu.
   * C'est ce chiffre-là qui s'annonce sur un document et qui se pointe à la réception.
   */
  enGros: ComptageColis | null;
  /** Le comptage en cartons, quand la chaîne va jusque-là. */
  cartons: ComptageColis | null;
  barrettes: Barrettes | null;
  /** Les champs à saisir pour que la chaîne aille plus loin — au plus un, le premier qui manque. */
  manquants: { champ: string; label: string; colis: TypeDeColis }[];
}

/** Ce qu'une quantité représente en colis, selon l'échelle du produit. */
export function colisage(quantite: number, echelle: Echelle): Colisage {
  const q = Number(quantite) || 0;
  const totaux = new Map<string, number>([['', q * (echelle.enPieces || 1)]]);
  const comptages: ComptageColis[] = [];
  const manquants: Colisage['manquants'] = [];

  // « 240 cartons » : la quantité EST le compte de cet échelon. Il entre dans les comptages au
  // même titre que les autres — sans quoi un article acheté au carton n'aurait aucun carton à
  // contrôler, et le document réclamerait la saisie d'un conditionnement qui ne servirait à rien.
  if (echelle.depart) {
    totaux.set(echelle.depart, q);
    const entiers = Math.floor(arrondi(q));
    comptages.push({
      colis: COLIS[echelle.depart], total: q, entiers, reste: arrondi(q - entiers),
      aCompter: entiers + (arrondi(q - entiers) > 0 ? 1 : 0), depart: true,
    });
  }

  for (const niveau of echelle.niveaux) {
    const base = totaux.get(niveau.base);
    // Son support n'a pas été calculé : cet échelon ne l'est pas non plus, et ce n'est pas un
    // oubli de saisie — c'est la conséquence de celui qu'on a déjà signalé.
    if (base === undefined) continue;
    if (!niveau.parUnite) {
      // Le grand carton et le film rétractable n'existent pas chez tout le monde : leur absence
      // ne se réclame pas. Le reste, si : c'est ainsi que le magasinier sait quoi compléter.
      if (!niveau.optionnel) manquants.push({ champ: niveau.champ, label: niveau.label, colis: niveau.colis });
      continue;
    }
    const total = base / niveau.parUnite;
    totaux.set(niveau.colis.cle, total);
    const entiers = Math.floor(arrondi(total));
    const reste = arrondi(total - entiers);
    comptages.push({ colis: niveau.colis, total, entiers, reste, aCompter: entiers + (reste > 0 ? 1 : 0) });
  }

  const cartons = comptages.find(c => c.colis.cle === 'carton') || null;

  // Le colis en gros : celui qu'on porte. Un article acheté au carton le porte dans son unité.
  const cleEnGros = niveauEnGros(echelle.niveaux)?.colis.cle || echelle.depart;
  const enGros = (cleEnGros ? comptages.find(c => c.colis.cle === cleEnGros) : null) || null;

  // Ce que le document réclame, c'est ce qui empêche de compter LE COLIS EN GROS — la seule
  // chose qu'on compte vraiment à la réception. Dès qu'il se compte, il n'y a plus rien à
  // réclamer : le détail du sachet à l'intérieur du carton n'intéresse personne au déchargement.
  if (enGros) manquants.length = 0;

  let barrettes: Barrettes | null = null;
  const emp = echelle.empilage;
  if (emp) {
    const compte = comptages.find(c => c.colis.cle === emp.niveau);
    if (compte) {
      // On empile des colis entiers : un sac à moitié plein monte quand même sur la pile.
      const colisEntiers = compte.aCompter;
      barrettes = {
        niveau: compte.colis,
        total: Math.round((colisEntiers / emp.parBarrette) * 100) / 100,
        entieres: Math.floor(colisEntiers / emp.parBarrette),
        resteColis: colisEntiers % emp.parBarrette,
        parBarrette: emp.parBarrette,
      };
    }
  }

  return { echelle, quantite: q, unite: echelle.unite, comptages, enGros, cartons, barrettes, manquants };
}

/** 240,0000001 carton est un carton rond : la virgule vient de la division, pas du camion. */
const arrondi = (n: number) => Math.round(n * 1e6) / 1e6;

// ── Un article entier, ventilations comprises ───────────────────────────────

export interface ColisageArticle {
  /** Le colisage de l'article pris globalement, sur sa quantité annoncée. */
  global: Colisage;
  /**
   * Un colisage par ligne de qualité quand l'article en a plusieurs : deux qualités du même
   * produit peuvent n'avoir ni le même rouleau ni le même sac, et les additionner au niveau de
   * l'article donnerait un nombre de cartons faux.
   */
  parQualite: { libelle: string; colisage: Colisage }[];
  /**
   * Ce qu'on comptera réellement, toutes lignes confondues : UN seul chiffre par échelon, celui
   * que porteront à la fois la ligne du tableau et la feuille de contrôle.
   */
  comptages: ComptageColis[];
  /** Le colis en gros de cette référence — carton, sac ou rouleau — pour le nommer sur le papier. */
  colisEnGros: TypeDeColis | null;
  /** Les colis en gros à compter à la réception. `null` s'ils ne se comptent pas. */
  cartons: number | null;
  /** Les barrettes complètes, toutes lignes confondues. */
  barrettes: number | null;
  /** Le premier champ qui manque pour aller jusqu'au carton, s'il y en a un. */
  manque: string;
  /**
   * Renseigné quand la ventilation par qualités ne retombe pas sur la quantité annoncée. On
   * revient alors au calcul global — comme le fait l'entrée en stock, qui écarte une ventilation
   * incohérente — et le document le dit au lieu de livrer un chiffre inexplicable.
   */
  ventilationEcartee?: { annonce: number; ventile: number };
}

/** La quantité d'une ligne de ventilation : `quantity` pour une qualité, `rolls` pour une couleur. */
const quantiteDeLigne = (r: any): number => Number(r?.quantity) || Number(r?.rolls) || 0;

export function colisageArticle(
  article: any,
  categories: any[] = [],
  generalCategories: any[] = [],
): ColisageArticle {
  const echelle = echelleDeLArticle(article, categories, generalCategories);
  const global = colisage(Number(article?.quantity) || 0, echelle);

  const lignes: any[] = Array.isArray(article?.qualityBreakdown)
    ? article.qualityBreakdown.filter((r: any) => quantiteDeLigne(r) > 0) : [];

  const parQualite = lignes.map((r: any) => ({
    libelle: String(r.nameFR || r.quality || r.label || '').trim(),
    colisage: colisage(quantiteDeLigne(r), echelleDeLArticle(article, categories, generalCategories, r)),
  }));

  // La ventilation ne fait autorité que si elle retombe sur la quantité annoncée. Une ligne
  // oubliée ferait annoncer la moitié des cartons ; une ventilation recopiée en trop — cela
  // existe, l'entrée en stock l'écarte déjà pour la même raison — en ferait annoncer le double.
  // Dans les deux cas on revient au calcul global, et on le dit.
  const annonce = Number(article?.quantity) || 0;
  const ventile = lignes.reduce((s: number, r: any) => s + quantiteDeLigne(r), 0);
  const tolerance = Math.max(0.001, Math.abs(annonce) * 1e-6);
  const coherente = lignes.length > 0 && annonce > 0 && Math.abs(ventile - annonce) <= tolerance;
  const ventilationEcartee = lignes.length > 0 && !coherente ? { annonce, ventile } : undefined;

  const source = coherente ? parQualite.map(x => x.colisage) : [global];
  const comptages = cumulerComptages(source);
  // Toutes les lignes d'une même référence partagent son échelle : leur colis en gros est le même.
  const colisEnGros = source.find(c => c.enGros)?.enGros?.colis || null;
  const carton = colisEnGros ? comptages.find(c => c.colis.cle === colisEnGros.cle) : undefined;
  const avecBarrettes = source.filter(c => c.barrettes);
  const barrettes = avecBarrettes.length === source.length && source.length > 0
    ? Math.round(avecBarrettes.reduce((s, c) => s + (c.barrettes?.total || 0), 0) * 100) / 100
    : null;

  return {
    global, parQualite, comptages, colisEnGros,
    cartons: carton ? carton.aCompter : null,
    barrettes,
    manque: carton ? '' : (source.map(manqueTexte).find(Boolean) || ''),
    ventilationEcartee,
  };
}

/**
 * Les comptages de plusieurs lignes ramenés à un seul par échelon.
 *
 * On additionne ce qu'il y a à COMPTER, pas les fractions : deux qualités ne se mélangent pas
 * dans un carton, donc une qualité qui remplit 1,5 carton en occupe deux. Un échelon qu'une
 * seule ligne sait calculer est écarté — un total partiel serait pire que pas de total.
 */
function cumulerComptages(source: Colisage[]): ComptageColis[] {
  if (source.length === 1) return source[0].comptages;

  const par = new Map<string, ComptageColis>();
  const presents = new Map<string, number>();
  for (const c of source) {
    for (const x of c.comptages) {
      presents.set(x.colis.cle, (presents.get(x.colis.cle) || 0) + 1);
      const hit = par.get(x.colis.cle);
      if (hit) {
        hit.total += x.aCompter;
        hit.entiers += x.aCompter;
        hit.aCompter += x.aCompter;
      } else {
        par.set(x.colis.cle, {
          colis: x.colis, total: x.aCompter, entiers: x.aCompter, reste: 0, aCompter: x.aCompter,
          depart: x.depart,
        });
      }
    }
  }
  return Array.from(par.entries())
    .filter(([cle]) => presents.get(cle) === source.length)
    .map(([, c]) => c);
}

// ── Mise en mots ────────────────────────────────────────────────────────────

const nf = (n: number, max = 2): string =>
  Number(n).toLocaleString('fr-FR', { maximumFractionDigits: max }).replace(/[  ]/g, ' ');

/** « 2 400 sacs », « 240 cartons + 1 entamé » */
export function comptageTexte(c: ComptageColis, court = false): string {
  const colis = court ? c.colis.abrege : (c.entiers > 1 ? c.colis.pluriel : c.colis.nom);
  if (c.entiers === 0 && c.reste > 0) {
    return court ? `<1 ${colis}` : `moins d'${c.colis.nom === 'boîte' ? 'une' : 'un'} ${c.colis.nom}`;
  }
  if (c.reste <= 0) return `${nf(c.entiers, 0)} ${colis}`;
  const pourcent = Math.round(c.reste * 100);
  // En forme courte, « 17+1 sacs » tient dans une cellule de tableau et se lit d'un coup :
  // dix-sept pleins, un entamé.
  return court
    ? `${nf(c.entiers, 0)}+1 ${colis}`
    : `${nf(c.entiers, 0)} ${colis} + 1 entamé (${pourcent} %)`;
}

/** « 4 × 12 = 48 sacs par barrette · 50 barrettes + 24 sacs » */
export function barrettesTexte(b: Barrettes): string {
  const reste = b.resteColis > 0
    ? ` + ${nf(b.resteColis, 0)} ${b.resteColis > 1 ? b.niveau.pluriel : b.niveau.nom}`
    : '';
  if (b.entieres === 0) {
    // Moins d'une barrette reste une information : c'est la place que la couleur prend au sol.
    return `${nf(b.total)} barrette (${nf(b.parBarrette, 0)} ${b.niveau.pluriel})${reste}`;
  }
  return `${nf(b.entieres, 0)} barrette${b.entieres > 1 ? 's' : ''}${reste}`;
}

/**
 * Le colisage sur une ligne : « 2 400 sacs · 240 cartons · 5 barrettes ».
 * Vide quand rien n'est calculable — le document dira alors ce qu'il faut saisir.
 *
 * @param barrettes les barrettes n'ont de sens qu'au niveau d'une référence entière : sur une
 *                  ligne de couleur, elles encombrent la cellule sans rien apprendre, puisqu'on
 *                  ne monte pas une palette couleur par couleur.
 */
export function colisageTexte(c: Colisage, court = false, barrettes = true): string {
  // L'échelon de départ n'est pas répété : « 240 cartons » est déjà écrit dans la quantité.
  const bouts = c.comptages.filter(x => !x.depart).map(x => comptageTexte(x, court));
  if (barrettes && c.barrettes && c.barrettes.entieres > 0) bouts.push(barrettesTexte(c.barrettes));
  return bouts.join(court ? ' · ' : '  ·  ');
}

/**
 * Le colisage d'une référence entière, tel qu'il doit s'imprimer sur sa ligne.
 *
 * C'est la MÊME source que la feuille de contrôle : sans cela, un article ventilé portait deux
 * nombres de cartons différents sur la même page — celui de sa quantité totale en haut, celui
 * de ses qualités additionnées en bas — et le magasinier ne savait plus lequel compter.
 */
/**
 * LE colis en gros d'une référence, en toutes lettres : « 240 cartons », « 120 rouleaux ».
 *
 * C'est le seul chiffre qui compte au déchargement — ce qu'on porte, ce qu'on pointe. La cascade
 * complète mettait le sachet et le carton sur le même plan, alors que le sachet est l'intérieur
 * du carton : personne ne décharge des sachets.
 */
export function colisEnGrosTexte(ca: ColisageArticle, court = true): string {
  if (!ca.colisEnGros || ca.cartons == null) return '';
  const n = ca.cartons;
  const nom = court ? ca.colisEnGros.abrege : (n > 1 ? ca.colisEnGros.pluriel : ca.colisEnGros.nom);
  const bout = `${nf(n, 0)} ${nom}`;
  return ca.barrettes ? `${bout} · ${nf(ca.barrettes, 0)} barrette${ca.barrettes > 1 ? 's' : ''}` : bout;
}

export function colisageArticleTexte(ca: ColisageArticle, court = false, barrettes = true): string {
  const bouts = ca.comptages.filter(c => !c.depart).map(c => comptageTexte(c, court));
  if (barrettes && ca.barrettes) {
    bouts.push(`${nf(ca.barrettes, 0)} barrette${ca.barrettes > 1 ? 's' : ''}`);
  }
  return bouts.join(court ? ' · ' : '  ·  ');
}

/** « saisir « Sacs/carton » pour compter les cartons ». */
export function manqueTexte(c: Colisage): string {
  const incompatible = c.echelle.uniteIncompatible;
  if (incompatible) {
    return incompatible === 'poids'
      ? `quantité au poids (${c.unite}) : le colisage ne se calcule pas`
      : `unité « ${c.unite} » non reconnue : le colisage ne se calcule pas`;
  }
  const m = c.manquants[0];
  if (!m) return '';
  return `saisir « ${m.label} » pour compter les ${m.colis.pluriel}`;
}

// ── Le colis de sortie, compté en unité de vente ────────────────────────────
//
// Le nouveau système de stock voulu par le patron : la réserve (CHRIFA et les entrepôts) ne sort
// plus qu'au CARTON ou au ROULEAU, et le logiciel convertit ce colis dans l'unité où le pôle se
// VEND — la pièce ou le mètre (cf. unites-pole.ts). Ce qui suit dit, pour un produit, quel colis
// sort et ce qu'il contient. Rien n'est écrit ni compté ici : c'est le calcul seul, que l'écran
// Qualités et le rapport « Cartons et rouleaux » de /stock affichent pour qu'on complète ce qui
// manque AVANT que le stock ne change de mode de comptage.
//
// Rien de ce qui précède n'est modifié : `niveauEnGros`, `colisage` et `colisageArticle` font les
// bons de réception et les documents imprimés. Le colis de sortie n'est pas le colis en gros : un
// tissu arrive en sacs mais sort au rouleau ; le sac, la boîte et le shrink ne sortent jamais.
//
// Ce calcul est volontairement PLUS EXIGEANT que celui des documents, puisqu'il décidera d'une
// conversion de stock : un nombre ambigu (« 1,000 ») est à corriger, une unité de rouleau
// supposée est à confirmer, et deux longueurs de rouleau qui se contredisent sont à trancher.

/** Les deux seuls colis qui sortent de la réserve. */
export type ColisDeSortie = 'carton' | 'rouleau';

/** D'où vient un chiffre : relevé sur l'arrivage (packing list), saisi au catalogue, ou porté par le pôle. */
export type SourceFacteur = 'arrivage' | 'catalogue' | 'pole';

export const LIBELLE_SOURCE: Record<SourceFacteur, string> = {
  arrivage: 'arrivage',
  catalogue: 'catalogue',
  pole: 'pôle',
};

export interface FacteurColis {
  champ: string;
  label: string;
  valeur: number | string;
  source: SourceFacteur;
}

export interface ContenuColis {
  colis: ColisDeSortie;
  nom: TypeDeColis;
  /** Ce que contient un colis, dans `unite`. */
  contenu: number;
  /**
   * L'unité de vente du pôle quand elle est fixée et qu'elle convient ; sinon l'unité de base du
   * produit (pièces, ou celle de la longueur du rouleau) — et `enUniteDeVente` vaut faux.
   */
  unite: string;
  enUniteDeVente: boolean;
  /** « 1 carton = 20 sacs × 120 pcs = 2 400 pcs », « 1 rouleau = 100 yds = 91,44 m ». */
  detail: string;
  facteurs: FacteurColis[];
}

export interface DesaccordColis {
  champ: string;
  label: string;
  texte: string;
  /**
   * Le désaccord porte sur la LONGUEUR du rouleau (chaque côté ramené en mètres) : c'est le
   * chiffre même de la conversion, il faut trancher avant de compter — le produit n'est pas
   * « prêt ». Un écart de Pcs/sac, lui, est un fait d'expédition : l'arrivage est retenu.
   */
  bloquant?: boolean;
}

export type GenreManque = 'pole' | 'type' | 'unite-vente' | 'facteur' | 'unite-longueur';

/** Ce qui manque, et la consigne exacte pour le compléter. */
export interface ManqueColis {
  genre: GenreManque;
  /** Saisir une case vide, corriger une valeur illisible, ou confirmer une unité supposée. */
  action?: 'saisir' | 'corriger' | 'confirmer';
  /** Les champs de qualité concernés, pour un manque de facteur… */
  champs?: string[];
  /** … et leurs noms, tels que les colonnes de l'écran Qualités les affichent. */
  libelles?: string[];
  texte: string;
}

export interface ResultatColis {
  /** Vrai quand chaque colis de sortie se convertit en unité de vente, sans rien à compléter. */
  pret: boolean;
  type?: string;
  /** Le type n'est pas fixé sur le pôle : il a été supposé d'après le nom ou la ligne du pôle. */
  typeDevine: boolean;
  pole?: { id: string; name: string };
  uniteAchat?: string;
  uniteVente?: string;
  /** Un colis (carton ou rouleau), deux pour un ruban qui a ses rouleaux par carton, aucun si rien n'est calculable. */
  colis: ContenuColis[];
  manques: ManqueColis[];
  desaccords: DesaccordColis[];
}

export interface EntreeColis {
  /** L'article, avec sa copie du conditionnement relevé à l'arrivage. Vide pour une qualité du catalogue. */
  article?: any;
  /** Sa ligne de ventilation par qualité (qualityBreakdown), quand l'article est ventilé. */
  ligneQualite?: any;
  categories?: any[];
  generalCategories?: any[];
  /** Le pôle, quand on le connaît déjà (écran Qualités) ; sinon il est retrouvé par la famille. */
  pole?: any;
  /** Le type imposé — l'onglet ouvert de l'écran Qualités. Sinon : celui du pôle. */
  type?: string;
  /** L'unité de vente imposée. Sinon : celle du pôle. */
  uniteVente?: string | null;
  /** La ligne du catalogue, quand on la tient déjà (écran Qualités). */
  catalogue?: any;
  /** Où se trouve cette ligne, pour écrire la consigne. */
  emplacement?: EmplacementQualite;
}

const CHEMIN_GROUPES = '/gestion → Catalogue → Groupes';
const CHEMIN_POLE = `${CHEMIN_GROUPES} → Modifier le pôle (crayon ✎ à côté de son nom)`;
const CHEMIN_QUALITES = '/gestion → Catalogue → Qualités';
const CHEMIN_ARTICLE = "/gestion → Arrivages → Arrivages → son dossier → crayon ✎ de la ligne de l'article";

const METRES_PAR: Record<string, number> = { m: 1, yds: YARD_EN_METRE, cm: 0.01 };

/**
 * « m », « mètres », « MTR » → m ; « yards », « YD », « y » → yds ; le reste → undefined.
 *
 * « y » est ce qu'enregistre la fenêtre de modification d'une qualité de tissu dans Groupes
 * (« Yards (y) »). Il n'est reconnu QUE par le calcul du colis de sortie : `facteurDeLongueur`,
 * qui fait les documents, n'est pas touché.
 */
export function uniteDeLongueur(u: unknown): 'm' | 'yds' | 'cm' | undefined {
  const v = sansAccent(u);
  if (/^(m|metre|metres|mtr|ml)$/.test(v)) return 'm';
  if (/^(y|yd|yds|yard|yards)$/.test(v)) return 'yds';
  if (v === 'cm') return 'cm';
  return undefined;
}

/** Forme courte d'une unité, pour le détail d'un calcul. */
function uniteCourte(u: string): string {
  const l = uniteDeLongueur(u);
  if (l) return l;
  const f = facteurEnPieces(u);
  if (f === 12) return 'doz';
  if (f === 144) return 'grosses';
  if (f === 1) return 'pcs';
  return u;
}

/** Les types qui se mesurent en longueur ; les autres se comptent en pièces. */
const TYPES_EN_LONGUEUR = new Set(['fabric', 'tape']);
const TYPES_CONNUS = new Set(['fabric', 'zipper', 'thread', 'slider', 'tape', 'accessory']);

export const NOM_DU_TYPE: Record<string, string> = {
  fabric: 'Tissu', zipper: 'Fermeture', thread: 'Fil', slider: 'Curseur', tape: 'Ruban', accessory: 'Accessoire',
};

/** L'unité de vente qui convient à un type : le mètre pour le tissu et le ruban, la pièce sinon. */
export function uniteDeVenteAttendue(type?: string): 'mètres' | 'pièces' | undefined {
  if (!type || !TYPES_CONNUS.has(type)) return undefined;
  return TYPES_EN_LONGUEUR.has(type) ? 'mètres' : 'pièces';
}

/**
 * Un nombre lu SANS deviner. `nombreSaisi` (plus haut, qui sert aux documents) garde le premier
 * nombre venu : « 1 000 » y vaut 1, « 1,000 » aussi. Pour décider qu'un produit est prêt à être
 * converti, il faut mieux : un seul nombre, éventuellement suivi d'une unité, sinon rien.
 *
 *   « 120 », « 2,5 », « 0.5 », « 120 pcs », « 100 yds »           → lus
 *   « 1 000 » (les documents le liraient 1), « 1,000 », « 1.000 »   → illisibles (mille, ou un ?)
 *   « 20/30 », « VARIOUS », « -5 »                                  → illisibles
 */
type NombreLu = { n: number; unite: string } | { illisible: true };

function nombreStrict(v: unknown): NombreLu {
  if (typeof v === 'number') return isFinite(v) && v > 0 ? { n: v, unite: '' } : { illisible: true };
  const texte = String(v ?? '').replace(/[  ]/g, ' ').trim();
  const m = texte.match(/^(\d+)(?:[.,](\d+))?\s*(.*)$/);
  if (!m) return { illisible: true };
  const [, entier, decimales, reste] = m;
  // « 1 000 » : un second nombre après le premier.
  if (/^\d/.test(reste)) return { illisible: true };
  // « 1,000 » ou « 2.500 » : séparateur de milliers ou virgule décimale ? Personne ne peut le dire.
  if (decimales !== undefined && decimales.length === 3 && Number(entier) !== 0) return { illisible: true };
  const n = Number(decimales !== undefined ? `${entier}.${decimales}` : entier);
  if (!isFinite(n) || n <= 0) return { illisible: true };
  return { n, unite: reste.trim() };
}

/** L'unité écrite derrière un facteur de comptage : rien, des pièces, ou un colis (« 20 sacs »). */
function uniteDeCompteAcceptee(u: string): boolean {
  if (!u) return true;
  const v = sansAccent(u).replace(/[.\s]+$/, '');
  return facteurEnPieces(v) === 1 || !!UNITES_COLIS[v];
}

/** Une valeur lue, avec sa provenance — et, pour signaler un désaccord, ce que dit chaque côté. */
interface Lu { brut: unknown; source: SourceFacteur; arrivage?: unknown; catalogue?: unknown }
type Lecteur = (champ: string) => Lu | undefined;

/**
 * Lit un champ dans des sources rangées par autorité : ligne de ventilation, article, catalogue —
 * le même ordre que `valeur()` plus haut. Un zéro ou une case vide ne compte pas.
 */
function lecteur(sources: { objet: any; source: SourceFacteur }[]): Lecteur {
  return (champ: string) => {
    let retenu: Lu | undefined;
    let arrivage: unknown, catalogue: unknown;
    for (const { objet, source } of sources) {
      const v = objet?.[champ];
      if (!saisi(v)) continue;
      if (source === 'arrivage' && arrivage === undefined) arrivage = v;
      if (source === 'catalogue' && catalogue === undefined) catalogue = v;
      if (!retenu) retenu = { brut: v, source };
    }
    return retenu ? { ...retenu, arrivage, catalogue } : undefined;
  };
}

/** L'unité de la longueur d'un rouleau, et d'où on la tient. */
interface UniteRouleau { unite: 'm' | 'yds' | 'cm'; source: SourceFacteur; champ: string; label: string }

/** Une valeur saisie qu'on ne sait pas lire : on ne la remplace pas en silence, on demande de la corriger. */
interface Illisible { champ: string; brut: string; source: SourceFacteur; pourquoi: string }

/**
 * Ce qu'on sait de l'unité de la longueur d'un rouleau, avant de savoir d'où vient la longueur.
 *
 * Le RUBAN n'a pas de case `arrivage` : les formulaires de commande écrivent « m » par défaut
 * dans `rollLengthUnit` sur chaque ruban, sans proposer d'autre choix (le champ s'y intitule
 * « Longueur / roll (m) »). Ce « m » n'a été choisi par personne ; il passerait devant ce que le
 * patron saisit dans Qualités et compterait 100 m un rouleau de 100 yds. Pour le ruban, seule la
 * case du catalogue fait foi. Le tissu, lui, a un vrai choix d'unité à la commande.
 */
interface ContexteUnite {
  arrivage?: unknown;
  catalogue?: unknown;
  /** L'unité d'achat du pôle, quand c'est une longueur. */
  achatPole?: 'm' | 'yds' | 'cm';
  /** L'unité de l'article, quand c'est une longueur : celle où le bon de réception compte le rouleau. */
  article?: 'm' | 'yds' | 'cm';
}

type UniteResolue =
  | { ok: true; unite: UniteRouleau; aConfirmer?: string }
  | { ok: false; illisible?: Illisible };

/**
 * L'unité d'une longueur de rouleau.
 *
 *  1. Celle saisie dans la case de l'unité (arrivage pour le tissu, puis catalogue).
 *  2. Sinon, celle écrite avec la longueur (« 100 yds »).
 *  3. Sinon, une unité par défaut : pour une longueur relevée sur l'ARRIVAGE, l'unité de
 *     l'article — c'est ainsi que le bon de réception la compte ; pour une longueur du CATALOGUE,
 *     l'unité d'achat du pôle — c'est ce que dit l'aide du champ. Quand l'article et le pôle ne
 *     disent pas la même chose, le choix est signalé « à confirmer » : 100 yds ne sont pas 100 m.
 */
function resoudreUnite(
  ctx: ContexteUnite, type: string, sourceLongueur: SourceFacteur,
  ecrite: 'm' | 'yds' | 'cm' | undefined, brutLongueur: string, coteCatalogueSeul = false,
): UniteResolue {
  const label = labelDuChamp(type, 'rollLengthUnit');
  const saisie = [
    ...(!coteCatalogueSeul && saisi(ctx.arrivage) ? [{ brut: ctx.arrivage, source: 'arrivage' as const }] : []),
    ...(saisi(ctx.catalogue) ? [{ brut: ctx.catalogue, source: 'catalogue' as const }] : []),
  ][0];
  if (saisie) {
    const u = uniteDeLongueur(saisie.brut);
    if (!u) {
      return { ok: false, illisible: { champ: 'rollLengthUnit', brut: String(saisie.brut).trim(), source: saisie.source, pourquoi: 'écrire m ou yds' } };
    }
    if (ecrite && ecrite !== u) {
      return { ok: false, illisible: { champ: 'rollLength', brut: brutLongueur, source: sourceLongueur, pourquoi: `l'unité écrite contredit « ${label} » (${u})` } };
    }
    return { ok: true, unite: { unite: u, source: saisie.source, champ: 'rollLengthUnit', label } };
  }
  if (ecrite) return { ok: true, unite: { unite: ecrite, source: sourceLongueur, champ: 'rollLength', label: 'unité écrite avec la longueur' } };

  const pole: UniteRouleau | undefined = ctx.achatPole
    ? { unite: ctx.achatPole, source: 'pole', champ: 'uniteAchat', label: "unité d'achat du pôle" } : undefined;
  const article: UniteRouleau | undefined = ctx.article
    ? { unite: ctx.article, source: 'arrivage', champ: 'unitOfMeasure', label: "unité de l'article" } : undefined;
  const retenue = (sourceLongueur === 'arrivage' ? [article, pole] : [pole, article]).find(Boolean);
  if (!retenue) return { ok: false };
  const aConfirmer = article && pole && article.unite !== pole.unite
    ? `l'article est compté en ${article.unite}, le pôle achète en ${pole.unite} : ${retenue.unite} retenu en attendant`
    : undefined;
  return { ok: true, unite: retenue, aConfirmer };
}

/**
 * Ce que contient UN colis, dans l'unité de base du produit : des pièces, ou une longueur dans
 * l'unité du rouleau. C'est le cœur commun de `contenuDuColis` et de `versUniteDeVente`.
 */
type Brut =
  | { ok: true; quantite: number; uniteBase: string; calcul: string; facteurs: FacteurColis[]; desaccords: DesaccordColis[]; aConfirmer: string[] }
  | { ok: false; manquants: string[]; illisibles: Illisible[]; impossible?: string };

/**
 * Le nom d'un champ dans une consigne, tel que la colonne de l'écran Qualités l'affiche. Le
 * raccourci « Pcs/carton » n'y a pas de colonne ; l'unité du rouleau s'appelle « Unité » pour le
 * tissu et « Unité rouleau » pour le ruban — avec, dans les deux cas, ce qu'on peut y mettre.
 */
function labelDuChamp(type: string, champ: string): string {
  if (champ === 'pcsPerCtn') return 'Pcs/carton';
  if (champ === 'rollLengthUnit') return `${libelleDuChamp(type, champ)} (m ou yds)`;
  return libelleDuChamp(type, champ);
}

function contenuBrut(cle: string, type: string, lire: Lecteur, ctx: ContexteUnite): Brut {
  const label = (champ: string) => labelDuChamp(type, champ);
  const echec = (manquants: string[], illisibles: Illisible[] = [], impossible?: string): Brut =>
    ({ ok: false, manquants, illisibles, impossible });

  // Un facteur de comptage (Pcs/sac, Sacs/carton…) : absent, illisible, ou un nombre.
  type Lecture = { n: number; f: FacteurColis } | { absent: true } | { illisible: Illisible };
  const facteur = (champ: string): Lecture => {
    const lu = lire(champ);
    if (!lu) return { absent: true };
    const p = nombreStrict(lu.brut);
    const brut = String(lu.brut).trim();
    if ('illisible' in p) {
      return { illisible: { champ, brut, source: lu.source, pourquoi: 'écrire le nombre seul, en chiffres, sans espace ni séparateur de milliers' } };
    }
    if (!uniteDeCompteAcceptee(p.unite)) {
      return { illisible: { champ, brut, source: lu.source, pourquoi: `« ${p.unite} » n'est pas un nombre de pièces` } };
    }
    return { n: p.n, f: { champ, label: label(champ), valeur: p.n, source: lu.source } };
  };
  const desaccordsDe = (champs: string[]): DesaccordColis[] => champs.flatMap(champ => {
    const lu = lire(champ);
    if (!lu || lu.arrivage === undefined || lu.catalogue === undefined) return [];
    const a = nombreStrict(lu.arrivage), c = nombreStrict(lu.catalogue);
    const pareil = !('illisible' in a) && !('illisible' in c)
      ? Math.abs(a.n - c.n) < 1e-9
      : sansAccent(lu.arrivage) === sansAccent(lu.catalogue);
    if (pareil) return [];
    return [{
      champ, label: label(champ),
      texte: `« ${label(champ)} » : ${String(lu.arrivage).trim()} sur l'arrivage, ${String(lu.catalogue).trim()} au catalogue — l'arrivage est retenu`,
    }];
  });

  /**
   * Arrivage et catalogue donnent-ils la même longueur de rouleau ? On compare des MÈTRES, chaque
   * côté dans sa propre unité : 100 yds et 91,44 m sont le même rouleau, 100 m et 100 yds non.
   */
  const desaccordDeLongueur = (lu: Lu): DesaccordColis[] => {
    if (lu.arrivage === undefined || lu.catalogue === undefined) return [];
    const cote = (brut: unknown, source: SourceFacteur, catalogueSeul: boolean) => {
      const p = nombreStrict(brut);
      if ('illisible' in p) return undefined;
      const ecrite = p.unite ? uniteDeLongueur(p.unite) : undefined;
      const r = resoudreUnite(ctx, type, source, ecrite, String(brut), catalogueSeul);
      return { n: p.n, u: r.ok ? r.unite.unite : undefined };
    };
    const a = cote(lu.arrivage, 'arrivage', false), c = cote(lu.catalogue, 'catalogue', true);
    if (!a || !c) return [];
    const pareil = a.u && c.u
      ? Math.abs(a.n * METRES_PAR[a.u] - c.n * METRES_PAR[c.u]) <= 0.001 * Math.max(a.n * METRES_PAR[a.u], c.n * METRES_PAR[c.u])
      : Math.abs(a.n - c.n) < 1e-9;
    if (pareil) return [];
    const dit = (x: { n: number; u?: string }) => `${nf(x.n)}${x.u ? ` ${x.u}` : ''}`;
    return [{
      champ: 'rollLength', label: label('rollLength'), bloquant: true,
      texte: `« ${label('rollLength')} » : ${dit(a)} sur l'arrivage, ${dit(c)} au catalogue — l'un des deux est faux : vérifier le rouleau, puis corriger l'article ou la qualité`,
    }];
  };

  // Le rouleau : une longueur, dans l'unité du rouleau.
  const rouleau = (): Brut => {
    const lu = lire('rollLength');
    if (!lu) {
      // La longueur est à saisir au catalogue : son unité aussi, si rien ne la donne par défaut.
      const r = resoudreUnite(ctx, type, 'catalogue', undefined, '');
      return echec(['rollLength', ...(r.ok || r.illisible ? [] : ['rollLengthUnit'])], !r.ok && r.illisible ? [r.illisible] : []);
    }
    const brut = String(lu.brut).trim();
    const p = nombreStrict(lu.brut);
    if ('illisible' in p) {
      return echec([], [{ champ: 'rollLength', brut, source: lu.source, pourquoi: 'écrire la longueur seule, en chiffres, sans séparateur de milliers' }]);
    }
    const ecrite = p.unite ? uniteDeLongueur(p.unite) : undefined;
    if (p.unite && !ecrite) {
      return echec([], [{ champ: 'rollLength', brut, source: lu.source, pourquoi: `« ${p.unite} » n'est pas une longueur` }]);
    }
    const r = resoudreUnite(ctx, type, lu.source, ecrite, brut);
    if (!r.ok) return echec(r.illisible ? [] : ['rollLengthUnit'], r.illisible ? [r.illisible] : []);
    return {
      ok: true, quantite: p.n, uniteBase: r.unite.unite, calcul: `${nf(p.n)} ${r.unite.unite}`,
      facteurs: [
        { champ: 'rollLength', label: label('rollLength'), valeur: p.n, source: lu.source },
        { champ: r.unite.champ, label: r.unite.label, valeur: r.unite.unite, source: r.unite.source },
      ],
      desaccords: desaccordDeLongueur(lu),
      aConfirmer: r.aConfirmer ? [r.aConfirmer] : [],
    };
  };
  // Un colis fait d'un nombre de colis plus petits : « 10 rouleaux × 25 m ».
  const multiple = (champ: string, interieur: Brut, nomInterieur: TypeDeColis): Brut => {
    const k = facteur(champ);
    if (!interieur.ok) {
      return echec(
        [...interieur.manquants, ...('absent' in k ? [champ] : [])],
        [...interieur.illisibles, ...('illisible' in k ? [k.illisible] : [])],
        interieur.impossible,
      );
    }
    if ('absent' in k) return echec([champ]);
    if ('illisible' in k) return echec([], [k.illisible]);
    const total = arrondi(k.n * interieur.quantite);
    return {
      ok: true, quantite: total, uniteBase: interieur.uniteBase,
      calcul: `${nf(k.n)} ${k.n > 1 ? nomInterieur.pluriel : nomInterieur.nom} × ${interieur.calcul} = ${nf(total)} ${uniteCourte(interieur.uniteBase)}`,
      facteurs: [k.f, ...interieur.facteurs],
      desaccords: [...desaccordsDe([champ]), ...interieur.desaccords],
      aConfirmer: interieur.aConfirmer,
    };
  };
  // Un compte de pièces : « 120 pcs ».
  const pieces = (champ: string): Brut => {
    const p = facteur(champ);
    if ('absent' in p) return echec([champ]);
    if ('illisible' in p) return echec([], [p.illisible]);
    return { ok: true, quantite: p.n, uniteBase: 'pièces', calcul: `${nf(p.n)} pcs`, facteurs: [p.f], desaccords: desaccordsDe([champ]), aConfirmer: [] };
  };
  /**
   * Le carton de mercerie. Le détail (sacs × pièces, boîtes × pièces) prime ; le raccourci
   * historique « Pcs/carton » ne sert que lorsqu'il manque — comme dans `echelleDeLArticle`. Quand
   * les deux sont là et ne disent pas la même chose, on le signale. Une valeur illisible dans le
   * détail n'est pas contournée par le raccourci : elle est à corriger.
   */
  const cartonDeMercerie = (champPetit: string, champCarton: string, petit: TypeDeColis): Brut => {
    const chaine = multiple(champCarton, pieces(champPetit), petit);
    const direct = facteur('pcsPerCtn');
    if (chaine.ok) {
      if ('n' in direct && Math.abs(direct.n - chaine.quantite) > 1e-9) {
        chaine.desaccords.push({
          champ: 'pcsPerCtn', label: 'Pcs/carton',
          texte: `« Pcs/carton » vaut ${nf(direct.n)}, mais ${chaine.calcul} — le détail est retenu`,
        });
      }
      return chaine;
    }
    if (chaine.illisibles.length > 0) return chaine;
    if ('n' in direct) {
      return {
        ok: true, quantite: direct.n, uniteBase: 'pièces', calcul: `${nf(direct.n)} pcs (Pcs/carton)`,
        facteurs: [direct.f], desaccords: desaccordsDe(['pcsPerCtn']), aConfirmer: [],
      };
    }
    if ('illisible' in direct) return echec(chaine.manquants, [direct.illisible]);
    return chaine;
  };

  const pasPourCeType = (): Brut => echec([], [],
    `un produit de type ${(NOM_DU_TYPE[type] || type).toLowerCase()} ne se compte pas en ${COLIS[cle]?.pluriel || cle}`);

  switch (cle) {
    case 'rouleau':
      return TYPES_EN_LONGUEUR.has(type) ? rouleau() : pasPourCeType();
    case 'sac':
      if (type === 'fabric') return multiple('packagingPerBag', rouleau(), COLIS.rouleau);
      if (type === 'zipper' || type === 'thread' || type === 'slider') return pieces('pcsPerBag');
      return pasPourCeType();
    case 'shrink':
      return type === 'tape' ? multiple('rollsPerShrink', rouleau(), COLIS.rouleau) : pasPourCeType();
    case 'boite':
      return type === 'accessory' ? pieces('pcsPerBox') : pasPourCeType();
    case 'carton':
      if (type === 'tape') return multiple('rollsPerCarton', rouleau(), COLIS.rouleau);
      if (type === 'zipper' || type === 'thread' || type === 'slider') return cartonDeMercerie('pcsPerBag', 'bagsPerCarton', COLIS.sac);
      if (type === 'accessory') return cartonDeMercerie('pcsPerBox', 'boxPerCarton', COLIS.boite);
      return pasPourCeType();
    default:
      return pasPourCeType();
  }
}

/**
 * Convertit une quantité de base (pièces, ou longueur) vers l'unité de vente. `null` quand les
 * deux ne mesurent pas la même chose : des pièces ne deviennent pas des mètres.
 */
function baseVersVente(quantite: number, uniteBase: string, uniteVente: string): number | null {
  const lb = uniteDeLongueur(uniteBase), lv = uniteDeLongueur(uniteVente);
  if (lb && lv) return arrondi(quantite * METRES_PAR[lb] / METRES_PAR[lv]);
  if (lb || lv) return null;
  const fb = facteurEnPieces(uniteBase), fv = facteurEnPieces(uniteVente);
  if (fb === null || fv === null) return null;
  return arrondi(quantite * fb / fv);
}

/**
 * La consigne pour le TYPE d'un pôle.
 *
 * Un pôle tient son type de sa ligne logistique, et c'est sur la LIGNE qu'il se règle : le
 * bouton « Spécifications de la ligne » de Groupes l'applique à tous ses pôles. « Modifier le
 * pôle » n'y peut rien quand la ligne est déjà choisie (ses spécifications y sont verrouillées,
 * et l'enregistrement recopie celles de la ligne) : on n'y renvoie que le pôle sans ligne.
 */
function consigneDeType(pole: any, nomPole: string, suppose?: string): string {
  const ligne = String(pole?.line || '').trim();
  const supposition = suppose
    ? ` — en attendant, on le suppose ${NOM_DU_TYPE[suppose].toLowerCase()} d'après son nom ou sa ligne : à confirmer`
    : '';
  if (ligne) {
    return `Régler les spécifications de la ligne « ${ligne} » (bouton « Spécifications de la ligne » dans ${CHEMIN_GROUPES}) : le pôle ${nomPole} n'a pas encore de type${supposition}`;
  }
  return `Choisir la ligne logistique du pôle ${nomPole} dans ${CHEMIN_POLE}${supposition}`;
}

/**
 * La consigne pour l'UNITÉ DE VENTE d'un pôle qui n'en a pas.
 *
 * Attention à l'ordre. Sans unité d'achat, l'unité de vente devient AUSSITÔT celle du stock
 * (`uniteDeStock`, unites-pole.ts) et la caisse, les transferts et l'inventaire la reprennent —
 * sans aucune conversion : 120 rouleaux s'afficheraient « 120 m ». Il faut donc fixer d'abord
 * l'unité d'achat sur celle où le stock est compté aujourd'hui. Et quand ce stock est compté
 * dans PLUSIEURS unités, toute unité fixée sur le pôle s'imposerait à tout : on attend l'étape 3.
 *
 * @param unitesDuStock les unités où le stock du pôle est compté aujourd'hui (rapport : toutes
 *                      celles de ses lignes de stock ; un article : la sienne).
 */
export function consigneUniteDeVente(
  nomPole: string, attendue: string, uniteAchat?: string, unitesDuStock: string[] = [], suppose?: string,
): string {
  const si = suppose ? `, si c'est bien un ${NOM_DU_TYPE[suppose].toLowerCase()}` : '';
  if (uniteAchat) {
    return `Fixer l'unité de vente du pôle ${nomPole} (${attendue}${si}) dans ${CHEMIN_POLE} — son stock reste compté en ${uniteAchat}`;
  }
  const unites = Array.from(new Set(unitesDuStock.map(u => String(u ?? '').trim()).filter(Boolean)));
  if (unites.length > 1) {
    return `Unité de vente du pôle ${nomPole} (${attendue}${si}) : ne la fixer qu'au passage au carton/rouleau — son stock est compté en ${unites.join(', ')}, et toute unité fixée sur le pôle (achat ou vente) s'imposerait à tout ce stock, sans conversion`;
  }
  const actuelle = unites[0] ? ` sur « ${unites[0]} » (l'unité où son stock est compté aujourd'hui)` : " (l'unité où son stock est compté aujourd'hui)";
  return `Fixer d'abord l'unité d'achat du pôle ${nomPole}${actuelle}, puis son unité de vente (${attendue}${si}), dans ${CHEMIN_POLE} — fixer la vente seule changerait aussitôt l'unité de tout son stock, sans conversion`;
}

/**
 * LE colis qui sort de la réserve, et ce qu'il contient en unité de vente.
 *
 *   fermeture, fil, curseur   carton  = Pcs/sac × Sacs/carton (ou Pcs/carton)
 *   accessoire                carton  = Pcs/boîte × Boîtes/carton (ou Pcs/carton)
 *   tissu                     rouleau = Long. rouleau (yds → m si l'on vend au mètre)
 *   ruban                     rouleau = Long./rouleau ; carton = Rouleaux/carton × Long./rouleau
 *
 * Aucun chiffre n'est inventé : ce qui manque est listé avec l'endroit où le saisir. Le poids
 * n'est jamais une unité de vente acceptée ici — un carton ne se convertit pas en kilos.
 */
export function contenuDuColis(entree: EntreeColis): ResultatColis {
  const article = entree.article || {};
  const categories = entree.categories || [];
  const generalCategories = entree.generalCategories || [];
  const pole = entree.pole ?? poleDeLArticle(article, categories, generalCategories);
  const nomPole = pole?.name ? String(pole.name) : '';
  const famille = categories.find((c: any) => c?.id === article?.categoryId || c?.name === article?.categoryId);
  const nomFamille = String(famille?.name || entree.emplacement?.famille || article?.categoryId || '').trim();
  const uniteAchat = uniteImposee(pole, 'achat');

  const manques: ManqueColis[] = [];
  const resultat = (r: Partial<ResultatColis>): ResultatColis => ({
    pret: false, typeDevine: false, colis: [], desaccords: [], manques,
    pole: pole ? { id: String(pole.id ?? ''), name: nomPole } : undefined,
    uniteAchat,
    ...r,
  });

  if (!pole) {
    manques.push({
      genre: 'pole',
      texte: nomFamille
        ? `Rattacher la famille « ${nomFamille} » à un pôle dans ${CHEMIN_GROUPES}`
        : `Rattacher cet article à une famille et à un pôle dans ${CHEMIN_GROUPES}`,
    });
  }

  // ── Le type : celui que le pôle tient de sa ligne logistique. À défaut, supposé d'après le NOM
  // ou la LIGNE du pôle — jamais d'après les champs de l'article : les formulaires de commande
  // recopient Pcs/sac dans Rouleaux/shrink, Sacs/carton dans Rouleaux/carton, le poids du ruban
  // dans celui de la bande… une étiquette y passerait pour un ruban, un ruban pour une fermeture.
  let type = entree.type && TYPES_CONNUS.has(entree.type) ? entree.type : undefined;
  let typeDevine = false;
  if (!type && pole) {
    if (pole.specType && TYPES_CONNUS.has(pole.specType)) type = pole.specType;
    else {
      const devine = detectSpecType({ ...pole, specType: undefined });
      if (devine && TYPES_CONNUS.has(devine)) { type = devine; typeDevine = true; }
    }
  }
  if (pole && (!type || typeDevine)) {
    manques.push({ genre: 'type', texte: consigneDeType(pole, nomPole, typeDevine ? type : undefined) });
  }
  if (!type) return resultat({ type: undefined, typeDevine });

  // ── L'unité de vente : celle du pôle, pièces ou mètres.
  const uniteVente = entree.uniteVente !== undefined ? (entree.uniteVente || undefined) : uniteImposee(pole, 'vente');
  const enLongueur = TYPES_EN_LONGUEUR.has(type);
  const attendue = uniteDeVenteAttendue(type)!;
  const suppose = typeDevine ? type : undefined;
  let venteUtilisable = false;
  if (!uniteVente) {
    if (pole) {
      manques.push({
        genre: 'unite-vente',
        texte: consigneUniteDeVente(nomPole, attendue, uniteAchat, article?.unitOfMeasure ? [String(article.unitOfMeasure)] : [], suppose),
      });
    }
  } else {
    const nature = natureUnite(uniteVente);
    const ok = enLongueur ? nature === 'longueur' && !!uniteDeLongueur(uniteVente) : nature === 'compte';
    if (ok) venteUtilisable = true;
    else {
      const pourquoi = nature === 'poids'
        ? 'un colis ne se convertit pas en poids'
        : nature === 'colis'
          ? `« ${uniteVente} » est un colis, pas une unité de vente`
          : enLongueur
            ? `un ${NOM_DU_TYPE[type].toLowerCase()} se vend en longueur`
            : `un produit de type ${NOM_DU_TYPE[type].toLowerCase()} se vend à la pièce`;
      manques.push({
        genre: 'unite-vente',
        texte: `Changer l'unité de vente du pôle ${nomPole || '—'} : « ${uniteVente} » ne convient pas (${pourquoi}) — choisir ${attendue}${suppose ? `, si c'est bien un ${NOM_DU_TYPE[suppose].toLowerCase()}` : ''}, dans ${CHEMIN_POLE}`,
      });
    }
  }

  // ── Les facteurs : arrivage (ligne de ventilation, puis article), puis catalogue.
  const emplacement = entree.emplacement
    ?? emplacementQualiteDuCatalogue(article, categories, generalCategories, type, entree.ligneQualite);
  const catalogue = entree.catalogue ?? emplacement.ligne;
  const lire = lecteur([
    { objet: entree.ligneQualite, source: 'arrivage' },
    { objet: entree.article, source: 'arrivage' },
    { objet: catalogue, source: 'catalogue' },
  ]);
  const luUnite = enLongueur ? lire('rollLengthUnit') : undefined;
  const ctx: ContexteUnite = {
    arrivage: type === 'fabric' ? luUnite?.arrivage : undefined,   // ruban : voir ContexteUnite
    catalogue: luUnite?.catalogue,
    achatPole: uniteDeLongueur(uniteAchat),
    article: uniteDeLongueur(article?.unitOfMeasure),
  };

  const colis: ContenuColis[] = [];
  const desaccords: DesaccordColis[] = [];
  const aSaisir: string[] = [];
  const aCorriger: Illisible[] = [];
  const aConfirmer: string[] = [];

  const sorties: ColisDeSortie[] = type === 'fabric' ? ['rouleau']
    : type === 'tape' ? (lire('rollsPerCarton') ? ['rouleau', 'carton'] : ['rouleau'])
      : ['carton'];

  for (const cle of sorties) {
    const brut = contenuBrut(cle, type, lire, ctx);
    if (!brut.ok) {
      for (const m of brut.manquants) if (!aSaisir.includes(m)) aSaisir.push(m);
      for (const i of brut.illisibles) if (!aCorriger.some(x => x.champ === i.champ && x.brut === i.brut)) aCorriger.push(i);
      continue;
    }
    for (const d of brut.desaccords) if (!desaccords.some(x => x.texte === d.texte)) desaccords.push(d);
    for (const t of brut.aConfirmer) if (!aConfirmer.includes(t)) aConfirmer.push(t);
    const converti = venteUtilisable ? baseVersVente(brut.quantite, brut.uniteBase, uniteVente!) : null;
    const enUniteDeVente = converti !== null;
    const contenu = enUniteDeVente ? converti! : brut.quantite;
    const unite = enUniteDeVente ? uniteVente! : brut.uniteBase;
    const memeUnite = uniteCourte(unite) === uniteCourte(brut.uniteBase);
    colis.push({
      colis: cle, nom: COLIS[cle], contenu, unite, enUniteDeVente,
      detail: `1 ${COLIS[cle].nom} = ${brut.calcul}${memeUnite ? '' : ` = ${nf(contenu)} ${uniteCourte(unite)}`}`,
      facteurs: brut.facteurs,
    });
  }

  const etiquette = (c: string) => `« ${labelDuChamp(type!, c)} »`;
  const enListe = (l: string[]) => l.length > 1 ? `${l.slice(0, -1).join(', ')} et ${l[l.length - 1]}` : l[0];
  if (aSaisir.length > 0) {
    manques.push({
      genre: aSaisir.every(c => c === 'rollLengthUnit') ? 'unite-longueur' : 'facteur',
      action: 'saisir',
      champs: aSaisir,
      libelles: aSaisir.map(c => labelDuChamp(type!, c)),
      texte: consigneDeSaisie('Saisir', enListe(aSaisir.map(etiquette)), emplacement, nomFamille, catalogue),
    });
  }
  for (const i of aCorriger) {
    const quoi = `${etiquette(i.champ)} (« ${i.brut} » : ${i.pourquoi})`;
    manques.push({
      genre: i.champ === 'rollLengthUnit' ? 'unite-longueur' : 'facteur',
      action: 'corriger',
      champs: [i.champ],
      libelles: [labelDuChamp(type, i.champ)],
      // Une valeur de l'arrivage se corrige sur l'article ; une valeur du catalogue, dans Qualités.
      texte: i.source === 'arrivage'
        ? `Corriger ${quoi} sur l'article : ${CHEMIN_ARTICLE}`
        : consigneDeSaisie('Corriger', quoi, emplacement, nomFamille, catalogue),
    });
  }
  for (const t of aConfirmer) {
    manques.push({
      genre: 'unite-longueur',
      action: 'confirmer',
      champs: ['rollLengthUnit'],
      libelles: [labelDuChamp(type, 'rollLengthUnit')],
      texte: `${consigneDeSaisie('Saisir', etiquette('rollLengthUnit'), emplacement, nomFamille, catalogue)} (${t})`,
    });
  }

  return resultat({
    type, typeDevine, uniteVente, colis, desaccords,
    pret: manques.length === 0 && colis.length > 0 && colis.every(c => c.enUniteDeVente)
      && !desaccords.some(d => d.bloquant),
  });
}

/** « Saisir « Sacs/carton » pour la qualité N°5 (CL-5) de la famille NYLON N°3 dans … Qualités ». */
function consigneDeSaisie(verbe: string, champs: string, emp: EmplacementQualite, nomFamille: string, catalogue: any): string {
  const famille = emp.famille || nomFamille;
  if (catalogue) {
    const libelle = String(catalogue?.label || catalogue?.nameFR || '').trim();
    const numero = emp.numero ? `N°${emp.numero}` : '';
    const qualite = ['la qualité', numero, libelle ? `(${libelle})` : ''].filter(Boolean).join(' ');
    if (emp.rangement === 'pole' && emp.pole) {
      return `${verbe} ${champs} pour ${qualite} du pôle ${emp.pole} dans ${CHEMIN_GROUPES}`;
    }
    return `${verbe} ${champs} pour ${qualite}${famille ? ` de la famille ${famille}` : ''} dans ${CHEMIN_QUALITES}`;
  }
  if (emp.qualiteNommee) {
    return `Ajouter la qualité « ${emp.qualiteNommee} »${famille ? ` à la famille ${famille}` : ''} avec ${champs} dans ${CHEMIN_QUALITES} (elle n'existe pas au catalogue)`;
  }
  if (emp.nombreDeLignes > 1) {
    // Le vrai problème est là : l'article ne dit pas laquelle des qualités il est. Le nommer
    // règle d'un coup tous ses champs, puisqu'ils viennent alors du catalogue.
    return `Nommer la qualité de cet article (la famille ${famille} en a ${emp.nombreDeLignes} au catalogue) : ${CHEMIN_ARTICLE} — ou y ${verbe.toLowerCase()} directement ${champs}`;
  }
  return `Ajouter une qualité${famille ? ` à la famille ${famille}` : ''} avec ${champs} dans ${CHEMIN_QUALITES}`;
}

export type ConversionVente =
  | { ok: true; quantite: number; unite: string; detail: string }
  | { ok: false; quantite: null; raison: string };

export interface OptionsConversion {
  /** L'unité de vente du pôle : pièces (doz, grosses) ou longueur (m, yds). */
  uniteVente: string | null | undefined;
  /** Le type du produit : il dit ce que contient un sac, un rouleau, un carton — et en quoi il se vend. */
  type?: string;
  /**
   * Les objets RELEVÉS À L'ARRIVAGE où lire le conditionnement, du plus au moins fiable : ligne
   * de ventilation, puis article. Un objet seul est accepté.
   */
  facteurs?: any | any[];
  /** La ligne du catalogue, lue en dernier — et seule à donner l'unité du rouleau d'un ruban. */
  catalogue?: any;
  /** L'unité d'achat du pôle : celle d'une longueur de rouleau dont l'unité n'est saisie nulle part. */
  uniteLongueurParDefaut?: string;
  /** L'unité de l'article : celle où le bon de réception compte une longueur relevée à l'arrivage. */
  uniteArticle?: string;
}

/**
 * Convertit une quantité vers l'unité de vente : sacs, rouleaux, cartons, boîtes, shrinks,
 * douzaines (× 12), grosses (× 144), yards, pièces ou mètres. `ok: false` et la raison quand ce
 * n'est pas possible — jamais un chiffre approximatif, jamais un poids.
 *
 * (Écrite pour l'étape 3, quand le stock se comptera en unité de vente ; testée dès maintenant.)
 */
export function versUniteDeVente(quantite: number, uniteSource: string, options: OptionsConversion): ConversionVente {
  const refus = (raison: string): ConversionVente => ({ ok: false, quantite: null, raison });
  const q = Number(quantite);
  if (!isFinite(q)) return refus('quantité illisible');
  const vente = String(options.uniteVente || '').trim();
  if (!vente) return refus("le pôle n'a pas d'unité de vente");
  const natureVente = natureUnite(vente);
  if (natureVente === 'poids') return refus(`unité de vente au poids (${vente}) : rien ne se convertit en kilos`);
  if (natureVente !== 'compte' && natureVente !== 'longueur') return refus(`unité de vente « ${vente} » non utilisable : choisir pièces ou mètres`);
  if (natureVente === 'longueur' && !uniteDeLongueur(vente)) return refus(`unité de vente « ${vente} » non reconnue`);

  // Même règle que `contenuDuColis` : le tissu et le ruban se vendent en longueur, le reste à la pièce.
  const type = options.type && TYPES_CONNUS.has(options.type) ? options.type : undefined;
  if (type && TYPES_EN_LONGUEUR.has(type) !== (natureVente === 'longueur')) {
    return refus(`un produit de type ${NOM_DU_TYPE[type].toLowerCase()} se vend ${TYPES_EN_LONGUEUR.has(type) ? 'en longueur' : 'à la pièce'}, pas en ${vente}`);
  }

  const source = String(uniteSource || '').trim();
  const nature = natureUnite(source);
  if (nature === 'poids') return refus(`quantité au poids (${source}) : elle ne se convertit pas en ${vente}`);
  if (nature === 'inconnue') return refus(`unité « ${source || '—'} » non reconnue`);

  if (nature === 'compte' || nature === 'longueur') {
    const r = baseVersVente(q, source, vente);
    if (r === null) {
      return refus(nature === 'compte'
        ? `des ${source} ne deviennent pas des ${vente} : il faut un rouleau ou un carton pour passer de l'un à l'autre`
        : `une longueur (${source}) ne devient pas des ${vente}`);
    }
    const memeUnite = uniteCourte(source) === uniteCourte(vente);
    return {
      ok: true, quantite: r, unite: vente,
      detail: memeUnite ? `${nf(q)} ${uniteCourte(vente)}` : `${nf(q)} ${uniteCourte(source)} = ${nf(r)} ${uniteCourte(vente)}`,
    };
  }

  // Un colis : il faut savoir ce qu'il contient.
  const cle = UNITES_COLIS[sansAccent(source)];
  if (!type) return refus(`le type du produit est inconnu : un ${COLIS[cle].nom} ne se convertit pas sans lui`);
  const objets = (Array.isArray(options.facteurs) ? options.facteurs : [options.facteurs]).filter(Boolean);
  const lire = lecteur([
    ...objets.map((objet: any) => ({ objet, source: 'arrivage' as SourceFacteur })),
    { objet: options.catalogue, source: 'catalogue' as SourceFacteur },
  ]);
  const luUnite = TYPES_EN_LONGUEUR.has(type) ? lire('rollLengthUnit') : undefined;
  const ctx: ContexteUnite = {
    arrivage: type === 'fabric' ? luUnite?.arrivage : undefined,
    catalogue: luUnite?.catalogue,
    achatPole: uniteDeLongueur(options.uniteLongueurParDefaut),
    article: uniteDeLongueur(options.uniteArticle),
  };
  const brut = contenuBrut(cle, type, lire, ctx);
  if (!brut.ok) {
    if (brut.impossible) return refus(brut.impossible);
    if (brut.illisibles.length > 0) {
      return refus(`valeur illisible : ${brut.illisibles.map(i => `« ${labelDuChamp(type, i.champ)} » vaut « ${i.brut} » (${i.pourquoi})`).join(' ; ')}`);
    }
    const labels = brut.manquants.map(c => `« ${labelDuChamp(type, c)} »`);
    return refus(`il manque ${labels.join(' et ')} pour savoir ce que contient un ${COLIS[cle].nom}`);
  }
  if (brut.aConfirmer.length > 0) return refus(`unité du rouleau à confirmer : ${brut.aConfirmer.join(' ; ')}`);
  const bloquant = brut.desaccords.find(d => d.bloquant);
  if (bloquant) return refus(bloquant.texte);
  const parColis = baseVersVente(brut.quantite, brut.uniteBase, vente);
  if (parColis === null) {
    return refus(`un ${COLIS[cle].nom} de ${NOM_DU_TYPE[type].toLowerCase()} se compte en ${brut.uniteBase}, pas en ${vente}`);
  }
  const total = arrondi(q * parColis);
  return {
    ok: true, quantite: total, unite: vente,
    detail: `${nf(q)} ${q > 1 ? COLIS[cle].pluriel : COLIS[cle].nom} × ${nf(parColis)} ${uniteCourte(vente)} = ${nf(total)} ${uniteCourte(vente)}`,
  };
}
