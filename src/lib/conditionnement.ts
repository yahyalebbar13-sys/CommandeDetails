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
 *   tissu        mètres → rouleau → sac → carton → grand carton
 *   fermeture    pièces → sac → carton → grand carton
 *   fil          pièces → sac → carton → grand carton
 *   curseur      pièces → sac → carton → grand carton
 *   ruban        mètres → rouleau → shrink, et le carton se compte en ROULEAUX (pas en shrinks)
 *   accessoire   pièces → boîte → carton → grand carton
 *
 * Chaque échelon vient d'un champ de `QUALITY_SCHEMA`. Un champ vide arrête la chaîne : on
 * n'invente pas un chiffre, on dit lequel manque et où le saisir.
 *
 * La barrette — la pile telle qu'elle se monte sur la palette — n'est pas la même partout :
 * elle dépend du produit ET de ce qu'on empile. Elle se lit donc, elle aussi, dans la qualité.
 */

import { QUALITY_SCHEMA, QUALITIES_FIELD_BY_SPEC } from './quality-schema';
import { specTypeDeLArticle } from './specification-produit';

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
  master:  { cle: 'master',  nom: 'grand carton', pluriel: 'grands cartons', abrege: 'gd ctn' },
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
  fabric: [
    { colis: 'rouleau', base: '',        champ: 'rollLength' },
    { colis: 'sac',     base: 'rouleau', champ: 'packagingPerBag' },
    { colis: 'carton',  base: 'sac',     champ: 'bagsPerCarton' },
    { colis: 'master',  base: 'carton',  champ: 'cartonsPerMaster', optionnel: true },
  ],
  zipper: [
    { colis: 'sac',    base: '',       champ: 'pcsPerBag' },
    { colis: 'carton', base: 'sac',    champ: 'bagsPerCarton' },
    { colis: 'master', base: 'carton', champ: 'cartonsPerMaster', optionnel: true },
  ],
  thread: [
    { colis: 'sac',    base: '',       champ: 'pcsPerBag' },
    { colis: 'carton', base: 'sac',    champ: 'bagsPerCarton' },
    { colis: 'master', base: 'carton', champ: 'cartonsPerMaster', optionnel: true },
  ],
  slider: [
    { colis: 'sac',    base: '',       champ: 'pcsPerBag' },
    { colis: 'carton', base: 'sac',    champ: 'bagsPerCarton' },
    { colis: 'master', base: 'carton', champ: 'cartonsPerMaster', optionnel: true },
  ],
  tape: [
    { colis: 'rouleau', base: '',        champ: 'rollLength' },
    { colis: 'shrink',  base: 'rouleau', champ: 'rollsPerShrink', optionnel: true },
    // Le carton de ruban se compte en rouleaux, pas en shrinks : c'est ainsi que le champ est
    // saisi (« Rouleaux/carton »), et l'inverser ferait un facteur dix sur le nombre de cartons.
    { colis: 'carton',  base: 'rouleau', champ: 'rollsPerCarton' },
    { colis: 'master',  base: 'carton',  champ: 'cartonsPerMaster', optionnel: true },
  ],
  accessory: [
    { colis: 'boite',  base: '',       champ: 'pcsPerBox' },
    { colis: 'carton', base: 'boite',  champ: 'boxPerCarton' },
    { colis: 'master', base: 'carton', champ: 'cartonsPerMaster', optionnel: true },
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

/**
 * La ligne du catalogue qui décrit la qualité qu'on imprime : celle dont le libellé correspond,
 * ou l'unique ligne de la famille quand l'article ne nomme aucune qualité.
 *
 * Deux règles, et elles comptent autant l'une que l'autre :
 *
 * - **On cherche le libellé de la LIGNE avant celui de l'article.** Un article ventilé par
 *   qualités porte `quality: 'VARIOUS'` — c'est la marque d'une ventilation, pas un nom. Chercher
 *   « various » dans le catalogue ne trouve rien, et le conditionnement saisi dans l'écran
 *   Qualités n'atteindrait jamais les commandes ventilées, c'est-à-dire la plupart.
 * - **Un nom qui ne correspond à rien ne se remplace pas par le voisin.** Si l'article dit
 *   AUTOLOCK N8 et que la famille ne connaît que CL-5, on ne prête pas à l'un le carton de
 *   l'autre : le document dira quel champ saisir. Le repli sur la ligne unique ne vaut que
 *   lorsqu'il n'y a aucun nom pour trancher.
 */
export function ligneQualiteDuCatalogue(
  article: any, categories: any[] = [], generalCategories: any[] = [], type?: string, ligneQualite?: any,
): any | undefined {
  const champ = type ? QUALITIES_FIELD_BY_SPEC[type] : undefined;
  if (!champ) return undefined;

  const famille = (categories || []).find((c: any) => c?.id === article?.categoryId || c?.name === article?.categoryId);
  const pole = (generalCategories || []).find((g: any) => g?.id === (article?.generalCategoryId || famille?.generalCategoryId));
  const lignes = [
    ...(Array.isArray(famille?.[champ]) ? famille[champ] : []),
    ...(Array.isArray(pole?.[champ]) ? pole[champ] : []),
  ];
  if (lignes.length === 0) return undefined;

  const nomme = [
    ligneQualite?.quality, ligneQualite?.label, ligneQualite?.nameFR,
    article?.quality, article?.qualityLabel,
  ].map(sansAccent).find(v => v && v !== 'various');

  if (nomme) {
    return lignes.find((l: any) =>
      [l?.label, l?.nameFR, l?.quality].some(v => sansAccent(v) === nomme));
  }
  // Aucun nom pour trancher : une famille qui n'a qu'une qualité ne laisse pas de place au doute.
  return lignes.length === 1 ? lignes[0] : undefined;
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
    empilage: empilageDeLArticle(article, ligneQualite, type, niveaux, rangDepart >= 0 ? depart : undefined, catalogue),
  };
}

function empilageDeLArticle(
  article: any, ligneQualite: any, type: string | undefined, niveaux: NiveauColis[], depart?: string, catalogue?: any,
): Empilage | null {
  const parRangee = nombreSaisi(valeur(article, ligneQualite, 'stackPerRow', catalogue));
  const rangees = nombreSaisi(valeur(article, ligneQualite, 'stackRows', catalogue));
  if (!parRangee || !rangees) return null;

  const demande = sansAccent(valeur(article, ligneQualite, 'stackLevel', catalogue));
  const propose = (type ? QUALITY_SCHEMA[type] : undefined)?.find(f => f.key === 'stackLevel')?.options?.[0];
  const cle = UNITES_COLIS[demande] || UNITES_COLIS[sansAccent(propose)] || 'carton';
  // Un empilage qui désigne un colis absent de l'échelle du produit ne veut rien dire.
  if (cle !== depart && !niveaux.some(n => n.colis.cle === cle)) return null;

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
  // Ce que le document réclame, c'est ce qui empêche de compter les CARTONS — la seule chose
  // qu'on compte vraiment à la réception. Dès qu'ils se comptent, il n'y a plus rien à réclamer :
  // un article dont le « pcs/carton » est saisi n'a que faire d'un détail des sacs.
  if (cartons) manquants.length = 0;

  let barrettes: Barrettes | null = null;
  const emp = echelle.empilage;
  if (emp) {
    const compte = comptages.find(c => c.colis.cle === emp.niveau);
    if (compte) {
      // On empile des colis entiers : un sac à moitié plein monte quand même sur la pile.
      const colisEntiers = compte.aCompter;
      barrettes = {
        niveau: compte.colis,
        entieres: Math.floor(colisEntiers / emp.parBarrette),
        resteColis: colisEntiers % emp.parBarrette,
        parBarrette: emp.parBarrette,
      };
    }
  }

  return { echelle, quantite: q, unite: echelle.unite, comptages, cartons, barrettes, manquants };
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
  /** Les cartons à compter à la réception. `null` s'ils ne se comptent pas. */
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
  const carton = comptages.find(c => c.colis.cle === 'carton');
  const avecBarrettes = source.filter(c => c.barrettes);
  const barrettes = avecBarrettes.length === source.length && source.length > 0
    ? avecBarrettes.reduce((s, c) => s + (c.barrettes?.entieres || 0), 0) : null;

  return {
    global, parQualite, comptages,
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
    return `pas de barrette pleine (${nf(b.parBarrette, 0)} ${b.niveau.pluriel})${reste}`;
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
