/**
 * Le stock de simulation : tout le catalogue, en quantité, pour une semaine d'essai.
 *
 * Ce n'est pas le stock de formation (src/lib/stock-formation.ts), qui pose des quantités
 * modestes sur vingt-huit références choisies pour faire travailler une recrue. Ici, on veut
 * l'inverse : que RIEN ne manque pendant une semaine, sur l'ensemble du catalogue, pour éprouver
 * le logiciel comme en vraie exploitation — vendre, transférer, inventorier, facturer, sans
 * jamais tomber sur une rupture qui arrête l'essai.
 *
 * Trois règles ont façonné ce fichier :
 *
 * - **la marchandise part des entrepôts**, un ou deux par référence, jamais directement en
 *   boutique : c'est ainsi qu'elle arrive dans la vraie vie, et c'est ce qui rend la simulation
 *   honnête — il faudra transférer pour vendre depuis un autre magasin ;
 * - **chaque variante reçoit la même quantité pleine**, pas une part d'un total : une couleur ne
 *   doit pas s'épuiser avant les autres au milieu de l'essai ;
 * - **TOUTES les couleurs sont chargées**, sans exception : six d'entre elles suffisaient à faire
 *   tourner l'écran, mais pas à éprouver le logiciel. Une couleur restée à zéro ne se vend pas,
 *   ne se transfère pas, ne se compte pas à l'inventaire — et c'est précisément la couleur rare
 *   qui révèle les défauts. Le seul plafond qui subsiste est celui du nombre total de lignes ;
 * - **tout est marqué**, pour pouvoir n'effacer que ça : une semaine plus tard, on retire le
 *   stock de test sans toucher au reste.
 */

import { articleVariantDimension, type VariantDimension } from './warehouse-locations';

/** Ce que chaque ligne de stock reçoit. Assez pour qu'une semaine d'essai n'en vienne pas à bout. */
export const QUANTITE_PAR_LIGNE = 10000;

/** La durée d'un essai. Passé ce délai, l'écran rappelle qu'il faut effacer. */
export const DUREE_ESSAI_JOURS = 7;

/** La marque portée par CHAQUE mouvement du stock de test : c'est par elle qu'on les retrouve. */
export const MARQUE_SIMULATION = 'STOCK DE TEST';

/** Vrai pour un mouvement écrit par le stock de simulation, et pour lui seul. */
export function estMouvementSimulation(mouvement: any): boolean {
  return String(mouvement?.notes || '').startsWith(MARQUE_SIMULATION);
}

/** La note écrite sur un mouvement de simulation : la marque, la date de chargement, la variante. */
export function noteSimulation(jour: string, variante?: string): string {
  return `${MARQUE_SIMULATION} · chargé le ${jour}${variante ? ` · ${variante}` : ''}`;
}

/** La date de chargement lue dans la note, pour savoir depuis quand l'essai dure. */
export function jourDuChargement(mouvement: any): string | null {
  const trouve = /chargé le (\d{4}-\d{2}-\d{2})/.exec(String(mouvement?.notes || ''));
  return trouve ? trouve[1] : null;
}

/** Nombre de jours écoulés entre deux dates au format AAAA-MM-JJ. */
export function joursDepuis(jour: string, aujourdhui: string): number {
  const [a1, m1, j1] = jour.split('-').map(Number);
  const [a2, m2, j2] = aujourdhui.split('-').map(Number);
  if (!a1 || !a2) return 0;
  const debut = Date.UTC(a1, m1 - 1, j1);
  const fin = Date.UTC(a2, m2 - 1, j2);
  return Math.max(0, Math.round((fin - debut) / 86400000));
}

export type VarianteSimulation = { dimension: VariantDimension | null; label: string };

/** Une ligne de stock à écrire : un article, une variante, un entrepôt. */
export type LigneSimulation = {
  article: any;
  nom: string;
  entrepot: string;
  variante: VarianteSimulation;
  quantite: number;
};

/** Nom lisible d'un article, tel qu'il apparaîtra à l'écran. */
export function nomArticle(article: any): string {
  const base = String(article?.nameFR || article?.name || article?.categoryId || '').trim();
  const details = [article?.quality, article?.color, article?.size]
    .map(v => String(v ?? '').trim())
    .filter(v => v && v.toLowerCase() !== 'various');
  return [base, ...details].filter(Boolean).join(' · ') || 'Produit';
}

/**
 * TOUTES les variantes d'un article ventilé — couleurs, qualités ou tailles — doublons de casse
 * fusionnés. Un produit simple rend une seule variante sans libellé : le même chemin sert aux
 * deux cas.
 *
 * Il y avait ici un plafond de six, posé pour que l'écran reste lisible. Il faisait exactement le
 * contraire de ce qu'on attend d'un essai : les coloris au-delà du sixième restaient à zéro, donc
 * invendables, intransférables, invisibles à l'inventaire — et ce sont précisément les coloris
 * rares qui font sortir les défauts. Le seul plafond qui subsiste est celui du nombre total de
 * lignes, qui protège la vitesse de l'écran sans trier les couleurs.
 */
export function variantesArticle(article: any): VarianteSimulation[] {
  const dimension = articleVariantDimension(article);
  if (!dimension) return [{ dimension: null, label: '' }];

  const rows: any[] =
    dimension === 'quality' ? article?.qualityBreakdown :
    dimension === 'color' ? article?.colorBreakdown :
    article?.sizeBreakdown;

  const labels: string[] = [];
  for (const row of Array.isArray(rows) ? rows : []) {
    const brut =
      dimension === 'quality' ? row?.quality :
      dimension === 'color' ? (row?.colorCode || row?.description || row?.color) :
      row?.size;
    const label = String(brut ?? '').trim();
    if (!label) continue;
    if (labels.some(l => l.toLowerCase() === label.toLowerCase())) continue;
    labels.push(label);
  }
  // Un article marqué « various » sans ventilation lisible se charge comme un produit simple,
  // plutôt que d'être laissé de côté : mieux vaut une ligne de trop qu'un produit introuvable
  // pendant l'essai.
  return labels.length > 0
    ? labels.map(label => ({ dimension, label }))
    : [{ dimension: null, label: '' }];
}

/** Une référence est retenue si elle porte un identifiant et un nom exploitable. */
function estRetenable(article: any): boolean {
  if (!article?.id) return false;
  if (nomArticle(article) === 'Produit') return false;
  // Une demande d'import encore en brouillon n'est pas de la marchandise : lui poser du stock
  // ferait croire qu'elle est arrivée.
  if (article.requestSource === 'STORE' && article.requestStage === 'DRAFT') return false;
  return true;
}

/**
 * Répartit les références sur les entrepôts : la première ici, la suivante là, et une sur trois
 * dans DEUX entrepôts à la fois.
 *
 * Pourquoi deux : parce qu'un stock parfaitement rangé ne teste rien. Une référence présente à
 * deux endroits oblige à choisir d'où sort la marchandise, et c'est exactement le cas qui casse
 * quand il n'a jamais été essayé.
 */
export function entrepotsDeLArticle(entrepots: string[], rang: number): string[] {
  if (entrepots.length === 0) return [];
  if (entrepots.length === 1) return [entrepots[0]];
  const premier = entrepots[rang % entrepots.length];
  if (rang % 3 !== 0) return [premier];
  const second = entrepots[(rang + 1) % entrepots.length];
  return second === premier ? [premier] : [premier, second];
}

/**
 * Le plafond de lignes de stock que l'écran supporte sans devenir poussif.
 *
 * Le calcul du stock balaie tous les mouvements pour chaque article, et il tourne quatre fois par
 * rendu. Mesuré sur cette machine : 1 000 articles pour 10 000 mouvements font 150 ms par appel,
 * 2 000 pour 30 000 en font 600, et 3 000 pour 100 000 font treize secondes. Douze mille lignes
 * laissent une semaine confortable ; au-dela, la simulation testerait surtout la patience.
 */
export const MAX_LIGNES = 12000;

export type PlanSimulation = {
  lignes: LigneSimulation[];
  /** Nombre de références effectivement chargées, avec TOUTES leurs variantes. */
  references: number;
  /** Nombre de références qu'on a dû laisser de côté pour tenir le plafond de lignes. */
  referencesEcartees: number;
  /** La plus grosse référence écartée, pour dire pourquoi elle ne passait pas. */
  plusGrosseEcartee: { nom: string; lignes: number } | null;
  /** Nombre de variantes chargées, toutes références confondues. */
  variantes: number;
  /** Nombre d'unités posées au total. */
  unites: number;
};

/**
 * Ce que le chargement va écrire, calculé à l'avance pour être relu avant de valider : une ligne
 * par variante et par entrepôt.
 */
export function planifierSimulation(
  articles: any[],
  entrepots: string[],
  quantite: number = QUANTITE_PAR_LIGNE,
  maxLignes: number = MAX_LIGNES,
): PlanSimulation {
  const retenus = (articles || []).filter(estRetenable);
  const lignes: LigneSimulation[] = [];
  let charges = 0;
  let variantesChargees = 0;
  let plusGrosseEcartee: { nom: string; lignes: number } | null = null;

  for (const [rang, article] of retenus.entries()) {
    const nom = nomArticle(article);
    const variantes = variantesArticle(article);
    const lieux = entrepotsDeLArticle(entrepots, rang);
    const aEcrire = lieux.length * variantes.length;

    // Une référence part en entier ou pas du tout : la charger à moitié donnerait un produit
    // présent dans un entrepôt et absent de l'autre, ou trois coloris sur douze, sans que
    // personne sache pourquoi.
    //
    // Et on ne s'arrête pas à la première qui ne passe pas : une seule référence à cent coloris
    // priverait de stock tout ce qui la suit dans le catalogue. On la laisse de côté, on continue
    // avec les suivantes, et on dit laquelle a été écartée.
    if (lignes.length + aEcrire > maxLignes) {
      if (!plusGrosseEcartee || aEcrire > plusGrosseEcartee.lignes) plusGrosseEcartee = { nom, lignes: aEcrire };
      continue;
    }

    for (const entrepot of lieux) {
      for (const variante of variantes) {
        lignes.push({ article, nom, entrepot, variante, quantite });
      }
    }
    charges += 1;
    variantesChargees += variantes.length;
  }

  return {
    lignes,
    references: charges,
    referencesEcartees: retenus.length - charges,
    plusGrosseEcartee,
    variantes: variantesChargees,
    unites: lignes.reduce((somme, l) => somme + l.quantite, 0),
  };
}
