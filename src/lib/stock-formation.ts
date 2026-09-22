/**
 * Stock d'entraînement : de quoi faire travailler une nouvelle recrue sur de VRAIS produits du
 * catalogue, sans inventer de références « TEST- » qui polluent la base.
 *
 * Le principe : on ne crée aucun produit. On pose des quantités connues, toujours les mêmes, sur
 * les premiers produits simples du catalogue (par ordre alphabétique, donc la liste ne change pas
 * d'un chargement à l'autre). Ce sont des mouvements d'entrée ordinaires : le bouton
 * « Reset Stock (0) » les efface comme les autres.
 *
 * Pourquoi seulement des produits SIMPLES (ni qualités, ni couleurs, ni tailles) : une référence
 * ventilée demande d'écrire un mouvement par variante avec le bon libellé. C'est le bon sujet
 * pour la semaine 2, pas pour un premier devoir — et une erreur de variante y est invisible.
 */

export type LieuFormation = 'MAGASIN' | 'ENTREPOT';

export type LigneFormation = {
  /** Numéro de la ligne dans le devoir : c'est par lui qu'on désigne le produit. */
  rang: number;
  quantite: number;
  lieu: LieuFormation;
};

/**
 * Le plan de chargement. Les quantités sont volontairement rondes et variées (de 80 à 5 000) :
 * elles se vérifient de tête, et elles couvrent aussi bien la pièce que le mètre ou le rouleau.
 *
 * Les dix premières lignes vont en BOUTIQUE — ce sont celles que la recrue vendra, comptera et
 * corrigera. Les quatorze suivantes restent en RÉSERVE : c'est ce qui permet de lui faire
 * découvrir qu'un produit peut exister sans être vendable là où il se trouve.
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

/** Nom lisible d'un article, tel que la recrue le verra à l'écran. */
export function nomArticle(article: any): string {
  const base = String(article?.nameFR || article?.name || article?.categoryId || '').trim();
  const details = [article?.quality, article?.color, article?.size]
    .map(v => String(v ?? '').trim())
    .filter(v => v && v.toLowerCase() !== 'various');
  return [base, ...details].filter(Boolean).join(' · ') || 'Produit';
}

/**
 * Les articles retenus, dans un ordre stable : même catalogue = même liste, donc le corrigé du
 * devoir reste valable si on recharge le stock après un reset.
 *
 * @param estSimple  test de « produit non ventilé » (injecté pour ne pas dupliquer
 *                   articleVariantDimension ici, et pour rester testable sans Firestore).
 */
export function choisirArticlesFormation(
  articles: any[],
  estSimple: (article: any) => boolean,
  nombre: number = PLAN_FORMATION.length
): any[] {
  return (articles || [])
    .filter(a => a && a.id && estSimple(a) && nomArticle(a) !== 'Produit')
    .sort((a, b) => {
      const cmp = nomArticle(a).localeCompare(nomArticle(b), 'fr', { numeric: true, sensitivity: 'base' });
      // Départage par identifiant : deux produits homonymes ne doivent pas échanger leur rang
      // d'un chargement à l'autre, sinon le corrigé ne correspond plus.
      return cmp !== 0 ? cmp : String(a.id).localeCompare(String(b.id));
    })
    .slice(0, nombre);
}

export type LigneChargement = LigneFormation & {
  article: any;
  nom: string;
  prixUnitaire: number;
  valeur: number;
};

/** Ce que le chargement va écrire, prêt à être affiché avant confirmation puis recopié dans le devoir. */
export function planifierChargement(articles: any[], estSimple: (a: any) => boolean): LigneChargement[] {
  const choisis = choisirArticlesFormation(articles, estSimple);
  return choisis.map((article, i) => {
    const plan = PLAN_FORMATION[i];
    const prixUnitaire = Number(article.purchasePriceMAD) || Number(article.purchasePricePerUnit) || 0;
    return {
      ...plan,
      article,
      nom: nomArticle(article),
      prixUnitaire,
      valeur: Math.round(plan.quantite * prixUnitaire * 100) / 100,
    };
  });
}

/** Texte à coller dans le corrigé du devoir : une ligne par référence chargée. */
export function listeAImprimer(lignes: LigneChargement[]): string {
  const entete = 'N°\tProduit\tLieu\tQuantité\tPrix achat\tValeur';
  const corps = lignes.map(l => [
    l.rang,
    l.nom,
    l.lieu === 'MAGASIN' ? 'Boutique' : 'Réserve',
    l.quantite,
    l.prixUnitaire.toFixed(2),
    l.valeur.toFixed(2),
  ].join('\t'));
  const total = lignes.reduce((s, l) => s + l.valeur, 0);
  return [entete, ...corps, `\tTOTAL\t\t${lignes.reduce((s, l) => s + l.quantite, 0)}\t\t${total.toFixed(2)}`].join('\n');
}
