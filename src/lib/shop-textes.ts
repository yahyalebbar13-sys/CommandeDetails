// Textes des produits et des catégories dans la langue du site.
// En arabe : le champ `<champ>Ar` s'il est rempli, sinon le français (jamais de texte vide
// quand le français existe). Un seul endroit pour cette règle, utilisé par toute la boutique.

import type { ProductVariant, ShopCategory, ShopProduct } from './shop-types';
import type { Language } from './translations';
import { couleurArabe } from './shop-variantes';

type Paire = { fr?: unknown; ar?: unknown };

const plein = (v: unknown): v is string => typeof v === 'string' && v.trim() !== '';

// Couple français / arabe d'un champ d'un objet (produit, variante, catégorie)
export function paire(obj: unknown, champ: string): Paire {
  const o = obj as Record<string, unknown> | null | undefined;
  return { fr: o?.[champ], ar: o?.[`${champ}Ar`] };
}

// Premier texte rempli de la chaîne, dans la langue voulue, sinon en français
export function premierTexte(language: Language, ...chaine: Paire[]): string {
  if (language === 'ar') {
    const p = chaine.find(x => plein(x.ar));
    if (p) return (p.ar as string).trim();
  }
  const p = chaine.find(x => plein(x.fr));
  return p ? (p.fr as string).trim() : '';
}

export function texte(obj: unknown, champ: string, language: Language): string {
  return premierTexte(language, paire(obj, champ));
}

// Fiche produit : la variante choisie d'abord, puis le produit, champ par champ dans l'ordre donné
export function texteFiche(
  product: ShopProduct,
  variant: ProductVariant | null | undefined,
  champs: string[],
  language: Language,
): string {
  return premierTexte(language, ...champs.map(c => paire(variant, c)), ...champs.map(c => paire(product, c)));
}

export function nomProduit(product: Pick<ShopProduct, 'name' | 'nameAr'>, language: Language): string {
  return texte(product, 'name', language) || product.name;
}

// Nom du rayon d'un produit : lu dans la liste des catégories (traduite une seule fois),
// sinon la copie categoryName / categoryNameAr gardée sur le produit
export function nomCategorieProduit(
  product: Pick<ShopProduct, 'categorySlug' | 'categoryName' | 'categoryNameAr'>,
  categories: ShopCategory[],
  language: Language,
): string {
  const cat = categories.find(c => c.slug === product.categorySlug);
  return premierTexte(language, paire(cat, 'name'), paire(product, 'categoryName'));
}

// ─── Recherche ──────────────────────────────────────────────────────────────

// Minuscules sans accents ; en arabe, formes de lettres unifiées (أ إ آ → ا, ة → ه, ى → ي, sans tatweel ni voyelles)
export function normaliserRecherche(valeur: string): string {
  return (valeur || '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[ً-ْـ]/g, '')
    .replace(/[أإآ]/g, 'ا')
    .replace(/ة/g, 'ه')
    .replace(/ى/g, 'ي')
    .replace(/\s+/g, ' ')
    .trim();
}

// Tout ce qu'un client peut taper pour trouver un produit, en français et en arabe
export function texteRecherche(product: ShopProduct, categories: ShopCategory[] = [], avecDescription = false): string {
  const cat = categories.find(c => c.slug === product.categorySlug);
  const parent = cat?.parentSlug ? categories.find(c => c.slug === cat.parentSlug) : undefined;
  const couleurs = Array.from(new Set((product.variants || []).map(v => (v.color || '').trim()).filter(Boolean)));
  const morceaux: unknown[] = [
    product.name, product.nameAr, product.catalogueName,
    product.shortDescription, product.shortDescriptionAr,
    product.typeProduit, product.typeProduitAr,
    product.motsCles, product.motsClesAr,
    ...(product.tags || []),
    product.categoryName, product.categoryNameAr,
    cat?.name, cat?.nameAr, parent?.name, parent?.nameAr,
    ...couleurs, ...couleurs.map(c => couleurArabe(c)),
    ...(product.variants || []).flatMap(v => [v.model, v.modelAr, v.size]),
    ...(avecDescription ? [product.description, product.descriptionAr] : []),
  ];
  return normaliserRecherche(morceaux.filter(plein).join(' '));
}
