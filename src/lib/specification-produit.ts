/**
 * Les spécifications techniques d'un article, lues dans le modèle de sa famille.
 *
 * Pourquoi ce fichier : depuis que les qualités sont décrites par pôle (src/lib/quality-schema.ts),
 * chaque type de produit a ses propres caractéristiques — GSM et largeur pour un tissu, longueur
 * et curseur pour une fermeture, poids du cône pour un fil, épaisseur pour un accessoire. Or les
 * PDF et les écrans de /stock affichaient deux types en dur (fermeture et tissu) : un fil, un
 * curseur, un ruban ou un accessoire imprimait une ligne vide, ou retombait sur l'ancien champ
 * texte libre `specs` que plus personne ne remplit.
 *
 * Tout passe désormais par ici : même produit, mêmes caractéristiques, même ordre, à l'écran
 * comme sur le papier.
 */

import { QUALITY_SCHEMA, detectSpecType } from './quality-schema';

export type LigneSpecification = { cle: string; label: string; valeur: string };

/** Les champs techniques portés par chaque type, pour deviner un type à partir d'un article. */
const INDICES_PAR_TYPE: [string, string[]][] = [
  ['zipper',    ['zipperType', 'sliderType', 'tapeWeightGsm']],
  ['fabric',    ['gsm', 'fabricWidth', 'packagingPerBag']],
  ['thread',    ['coneWeightG', 'threadWeightG', 'lengthPerPiece']],
  ['slider',    ['sliderWeightG']],
  ['tape',      ['weightPerM', 'rollsPerShrink', 'rollsPerCarton']],
  ['accessory', ['thickness', 'weightPerPiece', 'pcsPerBox', 'boxPerCarton']],
];

const rempli = (v: unknown): boolean =>
  v !== null && v !== undefined && String(v).trim() !== '' && String(v).trim() !== '0';

/**
 * Le type de spécification d'un article : celui de son pôle si on le connaît, sinon celui de sa
 * famille, sinon deviné d'après les caractéristiques que l'article porte réellement.
 *
 * Le dernier recours compte : les PDF ne reçoivent pas toujours le catalogue des pôles, et un
 * document imprimé sans spécifications est un document qu'on ne peut pas contrôler à la réception.
 */
export function specTypeDeLArticle(article: any, categories: any[] = [], generalCategories: any[] = []): string | undefined {
  const categorie = (categories || []).find((c: any) => c?.id === article?.categoryId || c?.name === article?.categoryId);
  const poleId = article?.generalCategoryId || categorie?.generalCategoryId;
  const pole = (generalCategories || []).find((g: any) => g?.id === poleId);

  const parLePole = pole ? detectSpecType(pole) : undefined;
  if (parLePole) return parLePole;

  const parLaFamille = categorie ? detectSpecType({ ...categorie, specType: categorie?.specType }) : undefined;
  if (parLaFamille) return parLaFamille;

  for (const [type, champs] of INDICES_PAR_TYPE) {
    if (champs.some(champ => rempli(article?.[champ]))) return type;
  }
  return undefined;
}

/**
 * Les caractéristiques à afficher, dans l'ordre du modèle. Une ligne de ventilation par qualité
 * (qualityBreakdown) porte ses propres valeurs : elles priment sur celles de l'article, puisque
 * c'est précisément ce qui distingue deux qualités du même produit.
 */
export function specificationsArticle(
  article: any,
  categories: any[] = [],
  generalCategories: any[] = [],
  ligneQualite?: any,
): LigneSpecification[] {
  const type = specTypeDeLArticle(article, categories, generalCategories);
  const modele = type ? QUALITY_SCHEMA[type] : null;
  if (!modele) return [];

  const lignes: LigneSpecification[] = [];
  for (const champ of modele) {
    if (champ.type === 'image') continue;
    const brut = rempli(ligneQualite?.[champ.key]) ? ligneQualite[champ.key] : article?.[champ.key];
    if (!rempli(brut)) continue;
    const valeur = String(brut).trim();
    lignes.push({ cle: champ.key, label: champ.label, valeur: champ.uppercase ? valeur.toUpperCase() : valeur });
  }
  return lignes;
}

/**
 * Les mêmes caractéristiques sur une seule ligne, pour une cellule de tableau ou un sous-titre :
 * « GSM 180 · Largeur (cm) 150 · Long. rouleau 100 ».
 */
export function specificationsEnLigne(
  article: any,
  categories: any[] = [],
  generalCategories: any[] = [],
  ligneQualite?: any,
  separateur = ' · ',
): string {
  return specificationsArticle(article, categories, generalCategories, ligneQualite)
    .map(l => `${l.label} ${l.valeur}`)
    .join(separateur);
}

/**
 * Le libellé de qualité d'un article ou d'une de ses lignes de ventilation. C'est le nom que le
 * fournisseur et le magasinier emploient (« CL-5 », « AUTOLOCK ») : il passe avant les
 * caractéristiques techniques sur un document.
 */
export function qualiteDeLArticle(article: any, ligneQualite?: any): string | null {
  const brut = ligneQualite?.quality ?? article?.quality ?? article?.qualityLabel;
  const texte = String(brut ?? '').trim();
  if (!texte || texte.toLowerCase() === 'various') return null;
  return texte;
}

/**
 * Ce qui identifie une ligne de marchandise sur un document : sa qualité, sa couleur, sa taille.
 * « various » ne veut rien dire pour un magasinier — c'est la marque interne d'un article ventilé,
 * elle ne doit jamais être imprimée.
 */
export function precisionsLigne(source: any): string[] {
  return [source?.quality, source?.color, source?.size]
    .map(v => String(v ?? '').trim())
    .filter(v => v && v.toLowerCase() !== 'various');
}
