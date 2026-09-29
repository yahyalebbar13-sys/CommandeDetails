/**
 * Le stock de simulation : tout le catalogue, en quantité, pour une semaine d'essai.
 *
 * Ce n'est pas le stock de formation (src/lib/stock-formation.ts), qui pose des quantités
 * modestes sur vingt-huit références choisies pour faire travailler une recrue. Ici, on veut
 * l'inverse : que RIEN ne manque pendant une semaine, sur l'ensemble du catalogue, pour éprouver
 * le logiciel comme en vraie exploitation — vendre, transférer, inventorier, facturer, sans
 * jamais tomber sur une rupture qui arrête l'essai.
 *
 * Quatre règles ont façonné ce fichier :
 *
 * - **TOUTE référence reçoit du stock, sur TOUTES ses couleurs**, sans exception et quel que
 *   soit le volume. Un plafond écartait autrefois les coloris au-delà du sixième, puis les
 *   références qui ne tenaient plus. C'était l'inverse de ce qu'on attend d'un essai : une
 *   couleur restée à zéro ne se vend pas, ne se transfère pas, ne se compte pas à l'inventaire —
 *   et c'est précisément le coloris rare qui fait sortir les défauts ;
 * - **la marchandise part des entrepôts**, un ou deux par référence, jamais directement en
 *   boutique : c'est ainsi qu'elle arrive dans la vraie vie, et c'est ce qui rend la simulation
 *   honnête — il faudra transférer pour vendre depuis un autre magasin. Le SECOND entrepôt est
 *   le seul confort négociable : quand le volume monte, c'est lui qu'on sacrifie, jamais une
 *   couleur, et l'écran annonce ce que le chargement va coûter en lenteur ;
 * - **chaque variante reçoit la même quantité pleine**, pas une part d'un total : une couleur ne
 *   doit pas s'épuiser avant les autres au milieu de l'essai ;
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
 * Le nombre de lignes au-delà duquel l'écran commence à peiner.
 *
 * Ce n'est PLUS un plafond qui coupe : rien n'est jamais écarté du chargement. C'est un seuil de
 * confort, qui sert à deux choses — décider si le second entrepôt vaut la peine d'être posé, et
 * prévenir honnêtement quand l'essai va être lent.
 *
 * Le calcul du stock balaie tous les mouvements pour chaque article, et il tourne quatre fois par
 * rendu. Mesuré sur cette machine : 1 000 articles pour 10 000 mouvements font 150 ms par appel,
 * 2 000 pour 30 000 en font 600, et 3 000 pour 100 000 font treize secondes. Douze mille lignes
 * laissent une semaine confortable ; au-delà, l'essai reste possible, mais il se paie en attente.
 */
export const MAX_LIGNES = 12000;

export type PlanSimulation = {
  lignes: LigneSimulation[];
  /** Nombre de références chargées. TOUTES celles qui sont exploitables : aucune n'est écartée. */
  references: number;
  /** Nombre de variantes chargées — couleurs, qualités, tailles — toutes références confondues. */
  variantes: number;
  /** Les lignes du socle : une par variante, dans un entrepôt. C'est le minimum garanti. */
  lignesSocle: number;
  /** Références posées dans DEUX entrepôts, pour obliger à choisir d'où sort la marchandise. */
  referencesDoublees: number;
  /** Références qui auraient dû aller dans deux entrepôts, mais n'y tenaient pas. */
  doublonsEcartes: number;
  /** Lignes au-delà du seuil de confort. Au-delà de zéro, l'écran prévient que ce sera lent. */
  depassement: number;
  /** Nombre d'unités posées au total. */
  unites: number;
};

export function planifierSimulation(
  articles: any[],
  entrepots: string[],
  quantite: number = QUANTITE_PAR_LIGNE,
  maxLignes: number = MAX_LIGNES,
): PlanSimulation {
  const retenus = (articles || []).filter(estRetenable);

  const prepares = retenus.map((article, rang) => {
    const lieux = entrepotsDeLArticle(entrepots, rang);
    return {
      article,
      nom: nomArticle(article),
      variantes: variantesArticle(article),
      principal: lieux[0],
      second: lieux[1],
    };
  }).filter(a => Boolean(a.principal));

  const lignes: LigneSimulation[] = [];
  const poser = (a: typeof prepares[number], entrepot: string) => {
    for (const variante of a.variantes) lignes.push({ article: a.article, nom: a.nom, entrepot, variante, quantite });
  };

  // ── Le socle : chaque référence, CHAQUE variante, dans un entrepôt ──
  // Rien n'est écarté ici, jamais. Une couleur laissée à zéro ne se vend pas, ne se transfère
  // pas, ne se compte pas à l'inventaire : elle ne teste rien, et c'est justement la couleur
  // rare qui fait sortir les défauts. Le volume n'entre pas en ligne de compte — on l'annonce.
  for (const a of prepares) poser(a, a.principal!);
  const lignesSocle = lignes.length;
  const variantes = prepares.reduce((somme, a) => somme + a.variantes.length, 0);

  // ── Le supplément : le second entrepôt, si la place le permet ──
  // Une référence présente à deux endroits oblige à choisir d'où sort la marchandise, et c'est
  // le cas qui casse quand il n'a jamais été essayé. C'est un confort, pas une couverture : si
  // le budget de lignes manque, c'est LUI qu'on sacrifie — jamais une couleur.
  let referencesDoublees = 0;
  let doublonsEcartes = 0;
  for (const a of prepares) {
    if (!a.second) continue;
    if (lignes.length + a.variantes.length > maxLignes) { doublonsEcartes += 1; continue; }
    poser(a, a.second);
    referencesDoublees += 1;
  }

  return {
    lignes,
    references: prepares.length,
    variantes,
    lignesSocle,
    referencesDoublees,
    doublonsEcartes,
    depassement: Math.max(0, lignesSocle - maxLignes),
    unites: lignes.reduce((somme, l) => somme + l.quantite, 0),
  };
}
