// Catalogue de la boutique : le catalogue de base du code (shop-products-data) fusionné
// avec ce que l'admin a saisi (surcharges, produits et rayons ajoutés, rayons masqués).
// Fonctions pures, partagées par le contexte de la boutique (navigateur) et par le
// serveur (étiquettes Google, plan du site, vraies pages 404) : une seule règle des deux
// côtés. Ne rien importer ici de « client » (Firebase, React, contextes).

import type { CategoryAlias, ProductVariant, ShopCategory, ShopProduct } from './shop-types';

// Fields that can be overridden from admin
export interface ProductOverride {
  price?: number;
  comparePrice?: number | null;
  images?: string[];
  isFeatured?: boolean;
  isNew?: boolean;
  isPromo?: boolean;
  inStock?: boolean;
  stockQty?: number;
  name?: string;
  catalogueName?: string | null;
  nameAr?: string;
  shortDescription?: string;
  shortDescriptionAr?: string;
  description?: string;
  descriptionAr?: string;
  wholesalePrice?: number;
  minOrderQty?: number;
  variants?: ProductVariant[];
  // Champs fiche produit
  material?: string;
  materialAr?: string;
  specification?: string;
  specificationAr?: string;
  weight?: number;
  width?: string;
  packaging?: string;
  packagingAr?: string;
  // Metadata additionnelle
  categorySlug?: string;
  additionalCategorySlugs?: string[];
  categoryAliases?: CategoryAlias[];
  categoryName?: string;
  categoryNameAr?: string;
  hidden?: boolean;
  // Détails Hyper Pro
  applications?: string;
  avantages?: string;
  conseilsEntretien?: string;
  informationCommerciale?: string;
  motsCles?: string;
  typeProduit?: string;
  matiereMailles?: string;
  compositionRuban?: string;
  couleur?: string;
  largeurMaille?: string;
  longueur?: string;
  type?: string;
  design?: string;
  securite?: string;
  resistance?: string;
  compatibleAvec?: string;
  conditionnementUnitaire?: string;
  conditionnementGros?: string;
  // Liaison stock réel
  stockArticleId?: string;
  stockArticleIds?: Record<string, string>; // variantId -> stock articleId
  // Rouleau entier : jamais par colis Sendit (retrait ou transport organisé par téléphone)
  volumineux?: boolean;
}

// Tous les champs arabes remplis d'une surcharge (nameAr, applicationsAr, typeProduitAr…) :
// ajouter un champ arabe ne demande plus de le recopier ici un par un.
function champsArabes(ov: object): Record<string, string> {
  return Object.fromEntries(
    Object.entries(ov).filter(([k, v]) => k.endsWith('Ar') && typeof v === 'string' && v.trim() !== '')
  ) as Record<string, string>;
}

// Produits visibles : ceux du code avec leurs surcharges, puis ceux ajoutés dans l'admin.
// Les produits masqués dans l'admin (hidden) sont retirés.
export function fusionnerProduits(
  base: ShopProduct[],
  overrides: Record<string, ProductOverride>,
  customProducts: ShopProduct[],
): ShopProduct[] {
  const hardcoded = base.map(p => {
    const ov = overrides[p.id];
    if (!ov) return p;
    return {
      ...p,
      ...(ov.price !== undefined && { price: ov.price }),
      ...(ov.comparePrice !== undefined && { comparePrice: ov.comparePrice ?? undefined }),
      ...(ov.images && ov.images.length > 0 && { images: ov.images }),
      ...(ov.isFeatured !== undefined && { isFeatured: ov.isFeatured }),
      ...(ov.isNew !== undefined && { isNew: ov.isNew }),
      ...(ov.isPromo !== undefined && { isPromo: ov.isPromo }),
      ...(ov.inStock !== undefined && { inStock: ov.inStock }),
      ...(ov.stockQty !== undefined && { stockQty: ov.stockQty }),
      ...(ov.name && { name: ov.name }),
      // null = nom de catalogue effacé dans l'admin : on retombe sur le nom du produit.
      ...(ov.catalogueName !== undefined && { catalogueName: ov.catalogueName ?? undefined }),
      ...(ov.nameAr && { nameAr: ov.nameAr }),
      ...(ov.shortDescription && { shortDescription: ov.shortDescription }),
      ...(ov.shortDescriptionAr && { shortDescriptionAr: ov.shortDescriptionAr }),
      ...(ov.description && { description: ov.description }),
      ...(ov.descriptionAr && { descriptionAr: ov.descriptionAr }),
      ...(ov.wholesalePrice !== undefined && { wholesalePrice: ov.wholesalePrice }),
      ...(ov.minOrderQty !== undefined && { minOrderQty: ov.minOrderQty }),
      ...(ov.variants && ov.variants.length > 0 && { variants: ov.variants }),
      ...(ov.material && { material: ov.material }),
      ...(ov.materialAr && { materialAr: ov.materialAr }),
      ...(ov.specification && { specification: ov.specification }),
      ...(ov.specificationAr && { specificationAr: ov.specificationAr }),
      ...(ov.weight !== undefined && { weight: ov.weight }),
      ...(ov.width && { width: ov.width }),
      ...(ov.packaging && { packaging: ov.packaging }),
      ...(ov.packagingAr && { packagingAr: ov.packagingAr }),
      ...(ov.categorySlug && { categorySlug: ov.categorySlug }),
      ...(ov.categoryName && { categoryName: ov.categoryName }),
      ...(ov.categoryNameAr && { categoryNameAr: ov.categoryNameAr }),
      ...(ov.applications && { applications: ov.applications }),
      ...(ov.avantages && { avantages: ov.avantages }),
      ...(ov.conseilsEntretien && { conseilsEntretien: ov.conseilsEntretien }),
      ...(ov.informationCommerciale && { informationCommerciale: ov.informationCommerciale }),
      ...(ov.motsCles && { motsCles: ov.motsCles }),
      ...(ov.typeProduit && { typeProduit: ov.typeProduit }),
      ...(ov.matiereMailles && { matiereMailles: ov.matiereMailles }),
      ...(ov.compositionRuban && { compositionRuban: ov.compositionRuban }),
      ...(ov.couleur && { couleur: ov.couleur }),
      ...(ov.largeurMaille && { largeurMaille: ov.largeurMaille }),
      ...(ov.longueur && { longueur: ov.longueur }),
      ...(ov.type && { type: ov.type }),
      ...(ov.design && { design: ov.design }),
      ...(ov.securite && { securite: ov.securite }),
      ...(ov.resistance && { resistance: ov.resistance }),
      ...(ov.compatibleAvec && { compatibleAvec: ov.compatibleAvec }),
      ...(ov.conditionnementUnitaire && { conditionnementUnitaire: ov.conditionnementUnitaire }),
      ...(ov.conditionnementGros && { conditionnementGros: ov.conditionnementGros }),
      ...(ov.stockArticleId && { stockArticleId: ov.stockArticleId }),
      ...(ov.stockArticleIds && { stockArticleIds: ov.stockArticleIds }),
      // Booléen : décocher la case doit aussi l'emporter sur la fiche d'origine
      ...(ov.volumineux !== undefined && { volumineux: !!ov.volumineux }),
      ...champsArabes(ov),
    };
  });
  // Filter out hardcoded products marked hidden by admin
  const visibleHardcoded = hardcoded.filter(p => !(overrides[p.id] as any)?.hidden);
  const existingIds = new Set(hardcoded.map(p => p.id));
  const mergedCustom = customProducts
    .filter(p => !existingIds.has(p.id) && !(overrides[p.id] as any)?.hidden)
    .map(p => {
      const ov = overrides[p.id];
      const baseInStock = p.inStock !== undefined ? p.inStock : true;
      const baseStockQty = p.stockQty !== undefined ? p.stockQty : 99;
      const baseCat = p.categorySlug || (p as any).categoryId || 'autres';
      if (!ov) return { ...p, inStock: baseInStock, stockQty: baseStockQty, categorySlug: baseCat };
      return {
        ...p,
        categorySlug: ov.categorySlug || baseCat,
        inStock: ov.inStock !== undefined ? ov.inStock : baseInStock,
        stockQty: ov.stockQty !== undefined ? ov.stockQty : baseStockQty,
        ...(ov.price !== undefined && { price: ov.price }),
        ...(ov.comparePrice !== undefined && { comparePrice: ov.comparePrice ?? undefined }),
        ...(ov.images && ov.images.length > 0 && { images: ov.images }),
        ...(ov.isFeatured !== undefined && { isFeatured: ov.isFeatured }),
        ...(ov.isNew !== undefined && { isNew: ov.isNew }),
        ...(ov.isPromo !== undefined && { isPromo: ov.isPromo }),
        ...(ov.name && { name: ov.name }),
        ...(ov.catalogueName !== undefined && { catalogueName: ov.catalogueName ?? undefined }),
        ...(ov.nameAr && { nameAr: ov.nameAr }),
        ...(ov.shortDescription && { shortDescription: ov.shortDescription }),
        ...(ov.shortDescriptionAr && { shortDescriptionAr: ov.shortDescriptionAr }),
        ...(ov.description && { description: ov.description }),
        ...(ov.descriptionAr && { descriptionAr: ov.descriptionAr }),
        ...(ov.wholesalePrice !== undefined && { wholesalePrice: ov.wholesalePrice }),
        ...(ov.minOrderQty !== undefined && { minOrderQty: ov.minOrderQty }),
        ...(ov.variants && ov.variants.length > 0 && { variants: ov.variants }),
        ...(ov.material && { material: ov.material }),
        ...(ov.materialAr && { materialAr: ov.materialAr }),
        ...(ov.specification && { specification: ov.specification }),
        ...(ov.specificationAr && { specificationAr: ov.specificationAr }),
        ...(ov.weight !== undefined && { weight: ov.weight }),
        ...(ov.width && { width: ov.width }),
        ...(ov.packaging && { packaging: ov.packaging }),
        ...(ov.packagingAr && { packagingAr: ov.packagingAr }),
        ...(ov.categoryName && { categoryName: ov.categoryName }),
        ...(ov.categoryNameAr && { categoryNameAr: ov.categoryNameAr }),
        ...(ov.additionalCategorySlugs && { additionalCategorySlugs: ov.additionalCategorySlugs }),
        ...(ov.categoryAliases && { categoryAliases: ov.categoryAliases }),
        ...(ov.applications && { applications: ov.applications }),
        ...(ov.avantages && { avantages: ov.avantages }),
        ...(ov.conseilsEntretien && { conseilsEntretien: ov.conseilsEntretien }),
        ...(ov.informationCommerciale && { informationCommerciale: ov.informationCommerciale }),
        ...(ov.motsCles && { motsCles: ov.motsCles }),
        ...(ov.typeProduit && { typeProduit: ov.typeProduit }),
        ...(ov.matiereMailles && { matiereMailles: ov.matiereMailles }),
        ...(ov.compositionRuban && { compositionRuban: ov.compositionRuban }),
        ...(ov.couleur && { couleur: ov.couleur }),
        ...(ov.largeurMaille && { largeurMaille: ov.largeurMaille }),
        ...(ov.longueur && { longueur: ov.longueur }),
        ...(ov.type && { type: ov.type }),
        ...(ov.design && { design: ov.design }),
        ...(ov.securite && { securite: ov.securite }),
        ...(ov.resistance && { resistance: ov.resistance }),
        ...(ov.compatibleAvec && { compatibleAvec: ov.compatibleAvec }),
        ...(ov.conditionnementUnitaire && { conditionnementUnitaire: ov.conditionnementUnitaire }),
        ...(ov.conditionnementGros && { conditionnementGros: ov.conditionnementGros }),
        ...(ov.stockArticleId && { stockArticleId: ov.stockArticleId }),
        ...(ov.stockArticleIds && { stockArticleIds: ov.stockArticleIds }),
        ...(ov.volumineux !== undefined && { volumineux: !!ov.volumineux }),
        ...champsArabes(ov),
      };
    });
  return [...visibleHardcoded, ...mergedCustom];
}

// Rayons visibles : ceux du code avec leurs surcharges, puis ceux ajoutés dans l'admin,
// sans les rayons masqués ni leurs sous-rayons, triés par priorité puis par nom.
// Un rayon sans image prend la première photo d'un de ses produits.
export function fusionnerRayons(
  base: ShopCategory[],
  customCategories: ShopCategory[],
  categoryOverrides: Record<string, Partial<ShopCategory>>,
  products: ShopProduct[],
): ShopCategory[] {
  const existingSlugs = new Set(base.map(c => c.slug));
  const mergedHardcoded = base.map(c => {
    const ov = categoryOverrides[c.slug];
    if (!ov) return c;
    const merged = { ...c, ...ov };
    // Rayon renommé dans l'admin sans traduction : l'arabe codé en dur ne correspond plus
    if (ov.name && ov.name !== c.name && !ov.nameAr) delete merged.nameAr;
    if (ov.description && ov.description !== c.description && !ov.descriptionAr) delete merged.descriptionAr;
    return merged;
  });

  // Deduplicate custom categories: if two custom cats have the same slug, only keep the first one
  const seenCustomSlugs = new Set(existingSlugs);
  const deduplicatedCustom = customCategories.filter(c => {
    if (seenCustomSlugs.has(c.slug)) return false;
    seenCustomSlugs.add(c.slug);
    return true;
  });
  // Une catégorie d'origine « supprimée » dans l'admin y est seulement marquée hidden :
  // on la retire, ainsi que ses sous-catégories
  const hiddenSlugs = new Set(
    [...mergedHardcoded, ...deduplicatedCustom].filter(c => c.hidden).map(c => c.slug)
  );
  const combined = [...mergedHardcoded, ...deduplicatedCustom].filter(
    c => !hiddenSlugs.has(c.slug) && !(c.parentSlug && hiddenSlugs.has(c.parentSlug))
  );

  // Sort categories by priority descending, then by name
  combined.sort((a, b) => {
    const priorityA = a.priority || 0;
    const priorityB = b.priority || 0;
    if (priorityA !== priorityB) {
      return priorityB - priorityA;
    }
    return a.name.localeCompare(b.name);
  });

  return combined.map(cat => {
    if (cat.image) return cat;
    const firstProduct = products.find(p => (p.categorySlug === cat.slug || p.additionalCategorySlugs?.includes(cat.slug)) && p.images && p.images.length > 0);
    if (firstProduct && firstProduct.images?.[0]) {
      return { ...cat, image: firstProduct.images[0] };
    }
    return cat;
  });
}

// Le rayon d'une adresse /shop/categorie/{slug} : même règle que la page rayon
// (par son slug, ou par son identifiant pour les vieux liens).
export function trouverRayon(rayons: ShopCategory[], slug: string): ShopCategory | null {
  return rayons.find(c => c.slug === slug || c.id === slug) ?? null;
}
