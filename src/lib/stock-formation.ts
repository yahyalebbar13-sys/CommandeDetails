/**
 * Stock d'entraînement : de quoi faire travailler une nouvelle recrue sur de VRAIS produits du
 * catalogue, sans inventer de références « TEST- » qui polluent la base.
 *
 * Le principe : on ne crée aucun produit. On pose des quantités connues, toujours les mêmes, sur
 * des références existantes. Ce sont des mouvements d'entrée ordinaires : le bouton
 * « Reset Stock (0) » les efface comme les autres.
 *
 * Trois exigences ont façonné ce fichier :
 * - **plusieurs catégories** : on prend une référence par catégorie à tour de rôle, sinon les 24
 *   lignes tombent toutes dans le même rayon et la recrue n'apprend qu'un seul écran ;
 * - **des produits ventilés** (couleurs, qualités, tailles) : c'est là que se font les vraies
 *   erreurs de stock, donc ils alternent avec les produits simples, en boutique comme en réserve ;
 * - **une liste stable** : même catalogue = même liste, sinon le corrigé du devoir ne correspond
 *   plus au stock après un reset.
 */

import { articleVariantDimension, type VariantDimension } from './warehouse-locations';

export type LieuFormation = 'MAGASIN' | 'ENTREPOT';

export type LigneFormation = {
  /** Numéro de la ligne dans le devoir : c'est par lui qu'on désigne le produit. */
  rang: number;
  quantite: number;
  lieu: LieuFormation;
};

/**
 * Le plan de chargement. Quantités rondes et variées (de 80 à 5 000) : elles se vérifient de
 * tête, et elles se divisent toujours juste entre quatre variantes.
 *
 * Les dix premières lignes vont en BOUTIQUE — ce sont celles que la recrue vendra, comptera et
 * corrigera. Les quatorze suivantes restent en RÉSERVE : c'est ce qui lui fait découvrir qu'un
 * produit peut exister sans être vendable là où il se trouve.
 */
export const PLAN_FORMATION: LigneFormation[] = [
  { rang: 1,  quantite: 500,   lieu: 'MAGASIN' },
  { rang: 2,  quantite: 400,   lieu: 'MAGASIN' },
  { rang: 3,  quantite: 300,   lieu: 'MAGASIN' },
  { rang: 4,  quantite: 600,   lieu: 'MAGASIN' },
  { rang: 5,  quantite: 200,   lieu: 'MAGASIN' },
  { rang: 6,  quantite: 240,   lieu: 'MAGASIN' },
  { rang: 7,  quantite: 150,   lieu: 'MAGASIN' },
  { rang: 8,  quantite: 120,   lieu: 'MAGASIN' },
  { rang: 9,  quantite: 2000,  lieu: 'MAGASIN' },
  { rang: 10, quantite: 1200,  lieu: 'MAGASIN' },
  { rang: 11, quantite: 800,   lieu: 'ENTREPOT' },
  { rang: 12, quantite: 600,   lieu: 'ENTREPOT' },
  { rang: 13, quantite: 5000,  lieu: 'ENTREPOT' },
  { rang: 14, quantite: 4000,  lieu: 'ENTREPOT' },
  { rang: 15, quantite: 2500,  lieu: 'ENTREPOT' },
  { rang: 16, quantite: 3000,  lieu: 'ENTREPOT' },
  { rang: 17, quantite: 1500,  lieu: 'ENTREPOT' },
  { rang: 18, quantite: 240,   lieu: 'ENTREPOT' },
  { rang: 19, quantite: 120,   lieu: 'ENTREPOT' },
  { rang: 20, quantite: 80,    lieu: 'ENTREPOT' },
  { rang: 21, quantite: 2000,  lieu: 'ENTREPOT' },
  { rang: 22, quantite: 500,   lieu: 'ENTREPOT' },
  { rang: 23, quantite: 300,   lieu: 'ENTREPOT' },
  { rang: 24, quantite: 150,   lieu: 'ENTREPOT' },
];

/** Au-delà de quatre variantes, les suivantes restent à zéro : toutes les couleurs commandées ne sont jamais reçues. */
export const MAX_VARIANTES = 4;

/** Répartition d'une quantité entre variantes, du plus fourni au moins fourni, en pourcentage. */
const REPARTITIONS: Record<number, number[]> = {
  1: [100],
  2: [60, 40],
  3: [50, 30, 20],
  4: [40, 30, 20, 10],
};

/** Nom lisible d'un article, tel que la recrue le verra à l'écran. */
export function nomArticle(article: any): string {
  const base = String(article?.nameFR || article?.name || article?.categoryId || '').trim();
  const details = [article?.quality, article?.color, article?.size]
    .map(v => String(v ?? '').trim())
    .filter(v => v && v.toLowerCase() !== 'various');
  return [base, ...details].filter(Boolean).join(' · ') || 'Produit';
}

/** Clé de regroupement : la famille du produit, à défaut son pôle. */
function cleCategorie(article: any): string {
  return String(article?.categoryId || article?.generalCategoryId || '—').trim().toLowerCase();
}

/**
 * Les libellés de variantes d'un article ventilé (couleurs, qualités ou tailles), dans l'ordre de
 * la ventilation, doublons de casse fusionnés. `null` pour un produit simple.
 */
export function libellesVariantes(article: any): { dimension: VariantDimension; labels: string[] } | null {
  const dimension = articleVariantDimension(article);
  if (!dimension) return null;
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
  return labels.length > 0 ? { dimension, labels } : null;
}

export type VarianteChargee = { dimension: VariantDimension | null; label: string; quantite: number };

/**
 * Répartit la quantité d'une ligne du plan entre les variantes du produit. Les proportions sont
 * fixes (40/30/20/10 pour quatre) : les quantités du plan sont choisies pour tomber juste, et le
 * reliquat d'arrondi éventuel va à la première variante.
 *
 * Un produit simple rend une seule ligne sans libellé — le même chemin sert aux deux cas.
 */
export function repartirSurVariantes(article: any, quantiteTotale: number): VarianteChargee[] {
  const variantes = libellesVariantes(article);
  if (!variantes) return [{ dimension: null, label: '', quantite: quantiteTotale }];

  const labels = variantes.labels.slice(0, MAX_VARIANTES);
  const parts = REPARTITIONS[labels.length] || REPARTITIONS[4];
  const lignes = labels.map((label, i) => ({
    dimension: variantes.dimension,
    label,
    quantite: Math.round((quantiteTotale * (parts[i] || 0)) / 100),
  }));
  const ecart = quantiteTotale - lignes.reduce((somme, l) => somme + l.quantite, 0);
  if (ecart !== 0 && lignes.length > 0) lignes[0].quantite += ecart;
  return lignes.filter(l => l.quantite > 0);
}

/** Une référence est retenue si elle porte un nom exploitable. */
function estRetenable(article: any): boolean {
  return Boolean(article && article.id) && nomArticle(article) !== 'Produit';
}

/** Ordre stable à l'intérieur d'une catégorie. */
function trierStable(a: any, b: any): number {
  const cmp = nomArticle(a).localeCompare(nomArticle(b), 'fr', { numeric: true, sensitivity: 'base' });
  // Départage par identifiant : deux produits homonymes ne doivent pas échanger leur rang d'un
  // chargement à l'autre, sinon le corrigé ne correspond plus.
  return cmp !== 0 ? cmp : String(a.id).localeCompare(String(b.id));
}

/**
 * Une référence par catégorie à tour de rôle : on prend la première de chaque famille, puis la
 * deuxième de chaque famille, etc. Prendre simplement les 24 premières par ordre alphabétique
 * donnait 24 variantes du même produit.
 */
function enAlternantLesCategories(articles: any[]): any[] {
  const groupes = new Map<string, any[]>();
  for (const a of articles) {
    const cle = cleCategorie(a);
    const groupe = groupes.get(cle);
    if (groupe) groupe.push(a); else groupes.set(cle, [a]);
  }
  const cles = Array.from(groupes.keys()).sort();
  for (const cle of cles) groupes.get(cle)!.sort(trierStable);

  const sortie: any[] = [];
  const profondeurMax = Math.max(0, ...cles.map(c => groupes.get(c)!.length));
  for (let rang = 0; rang < profondeurMax; rang++) {
    for (const cle of cles) {
      const article = groupes.get(cle)![rang];
      if (article) sortie.push(article);
    }
  }
  return sortie;
}

/** Alterne produits simples et produits ventilés, pour que les deux soient représentés partout. */
function entrelacer(simples: any[], ventiles: any[], nombre: number): any[] {
  const sortie: any[] = [];
  let i = 0, j = 0;
  while (sortie.length < nombre && (i < simples.length || j < ventiles.length)) {
    if (i < simples.length) sortie.push(simples[i++]);
    if (sortie.length < nombre && j < ventiles.length) sortie.push(ventiles[j++]);
  }
  return sortie.slice(0, nombre);
}

/**
 * Les articles retenus, dans un ordre stable : catégories alternées, produits simples et ventilés
 * entrelacés. Même catalogue = même liste.
 */
export function choisirArticlesFormation(articles: any[], nombre: number = PLAN_FORMATION.length): any[] {
  const candidats = (articles || []).filter(estRetenable);
  const simples = enAlternantLesCategories(candidats.filter(a => !libellesVariantes(a)));
  const ventiles = enAlternantLesCategories(candidats.filter(a => Boolean(libellesVariantes(a))));
  return entrelacer(simples, ventiles, nombre);
}

export type LigneChargement = LigneFormation & {
  article: any;
  nom: string;
  categorie: string;
  prixUnitaire: number;
  valeur: number;
  /** Une entrée par variante à écrire ; une seule ligne sans libellé pour un produit simple. */
  variantes: VarianteChargee[];
};

/** Ce que le chargement va écrire, à relire avant de valider puis à recopier dans le corrigé. */
export function planifierChargement(articles: any[]): LigneChargement[] {
  return choisirArticlesFormation(articles).map((article, i) => {
    const plan = PLAN_FORMATION[i];
    const prixUnitaire = Number(article.purchasePriceMAD) || Number(article.purchasePricePerUnit) || 0;
    return {
      ...plan,
      article,
      nom: nomArticle(article),
      categorie: String(article.categoryId || article.generalCategoryId || '—'),
      prixUnitaire,
      valeur: Math.round(plan.quantite * prixUnitaire * 100) / 100,
      variantes: repartirSurVariantes(article, plan.quantite),
    };
  });
}

/** Texte à coller dans le corrigé du devoir : une ligne par référence, variantes détaillées. */
export function listeAImprimer(lignes: LigneChargement[]): string {
  const entete = 'N°\tProduit\tFamille\tLieu\tQuantité\tDétail des variantes';
  const corps = lignes.map(l => [
    l.rang,
    l.nom,
    l.categorie,
    l.lieu === 'MAGASIN' ? 'Boutique' : 'Réserve',
    l.quantite,
    l.variantes.length > 1 || l.variantes[0]?.label
      ? l.variantes.map(v => `${v.label} : ${v.quantite}`).join(' · ')
      : '—',
  ].join('\t'));
  const total = lignes.reduce((s, l) => s + l.quantite, 0);
  return [entete, ...corps, `\tTOTAL\t\t\t${total}\t`].join('\n');
}
