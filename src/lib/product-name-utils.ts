/**
 * Utility functions to resolve French commercial product names.
 * Used across the client portal, notifications, and export documents.
 */

export const FALLBACK_TEXTILE_FR: Record<string, string> = {
  'hangers': 'Cintres',
  'plastic hanger': 'Cintre Plastique',
  'plastic hangers': 'Cintres Plastique',
  'wooden hanger': 'Cintre Bois',
  'wooden hangers': 'Cintres Bois',
  'eva film': 'Film EVA',
  'visor for caps': 'Visière Casquette',
  'visor for caps(women)': 'Visière Casquette (Femme)',
  'oxford fabric': 'Tissu Oxford',
  'taffeta': 'Doublure Taffeta',
  'taffeta fabric': 'Doublure Taffeta',
  'metal wire buckle': 'Boucle Métallique',
  'oval metal wire buckle': 'Boucle Métallique Ovale',
  'aluminium profile': 'Profilé Aluminium',
  'grille 2.5cm': 'Grille Murale 2.5cm',
  'polyester interlining': 'Entoilage Polyester',
  'fusible interlining': 'Entoilage Thermocollant',
  'woven interlining': 'Entoilage Tissé',
  'non woven': 'Viseline Non Tissée',
  'non woven interlining': 'Viseline Non Tissée',
  'shoulder pads': 'Épaulettes',
  'satin ribbon': 'Ruban Satin',
  'grosgrain ribbon': 'Ruban Gros-Grain',
  'velvet ribbon': 'Ruban Velours',
  'chalk': 'Craie Tailleur',
  'measuring tape': 'Mètre Ruban',
  'thread': 'Fil à Coudre',
  'sewing thread': 'Fil à Coudre',
  'knitting elastic tape': 'Élastique Tricoté (KG)',
  'woven elastic tape': 'Élastique Tissé (Mètre)',
  'elastic tape': 'Élastique',
  'velcro': 'Bande Auto-Agrippante (Velcro)',
  'hook and loop': 'Bande Auto-Agrippante',
  'drawcord': 'Cordon',
  'cord': 'Cordon',
  'eyelet': 'Œillet Métallique',
  'eyelets': 'Œillets Métalliques',
  'stopper': 'Bloqueur Cordon',
  'stoppers': 'Bloqueurs Cordon',
  'zipper': 'Fermeture Éclair',
  'zippers': 'Fermetures Éclair',
  'invisible zipper': 'Fermeture Invisible',
  'metal zipper': 'Fermeture Métal',
  'nylon zipper': 'Fermeture Nylon',
  'plastic zipper': 'Fermeture Plastique',
};

/**
 * Returns the French commercial name for an article.
 * 
 * Resolution order:
 * 1. article.nameFR (if directly specified)
 * 2. category.zipperQualities / category.fabricQualities nameFR (matched by quality or zipper specs)
 * 3. category.nameFR (exact match or prefix match preserving extra specs e.g. "PP TAPE 3,8cm" -> "SANGLE PP 3,8cm")
 * 4. Fallback textile dictionary
 * 5. generalCategory.nameFR
 * 6. Fallback to article.name || category.name || article.categoryId || 'Article'
 */
export function getArticleFrenchName(
  article: any,
  categories: any[] = [],
  generalCategories: any[] = []
): string {
  if (!article) return '';

  // 1. Direct article.nameFR
  if (article.nameFR && typeof article.nameFR === 'string' && article.nameFR.trim()) {
    return article.nameFR.trim();
  }

  const rawCatId = (article.categoryId || '').trim();
  const rawArtName = (article.name || '').trim();
  const catIdLower = rawCatId.toLowerCase();
  const artNameLower = rawArtName.toLowerCase();

  // 2. Exact match on category by ID or name
  let category = categories.find((c) => {
    const cId = (c.id || '').trim().toLowerCase();
    const cName = (c.name || '').trim().toLowerCase();
    return (
      (cId && (cId === catIdLower || cId === artNameLower)) ||
      (cName && (cName === catIdLower || cName === artNameLower))
    );
  });

  // 2b. Prefix match if no exact match (e.g. article categoryId "PP TAPE 3,8cm" vs category name "PP TAPE")
  let matchedPrefixCategoryName = '';
  if (!category) {
    category = categories.find((c) => {
      const cName = (c.name || '').trim().toLowerCase();
      if (!cName || cName.length < 3) return false;
      if (catIdLower.startsWith(cName)) {
        matchedPrefixCategoryName = c.name;
        return true;
      }
      if (artNameLower.startsWith(cName)) {
        matchedPrefixCategoryName = c.name;
        return true;
      }
      return false;
    });
  } else {
    matchedPrefixCategoryName = category.name || '';
  }

  // 3. Quality match (zipper, fabric, or thread)
  const artQuality = (article.quality || '').trim().toLowerCase();
  const matchedZipperQ = category?.zipperQualities?.find(
    (q: any) =>
      (artQuality && q.label?.toLowerCase() === artQuality) ||
      (q.zipperType && article.zipperType && q.zipperType === article.zipperType && q.slider === article.slider)
  );
  const matchedFabricQ = category?.fabricQualities?.find(
    (q: any) => artQuality && q.label?.toLowerCase() === artQuality
  );
  const matchedThreadQ = category?.threadQualities?.find(
    (q: any) =>
      (artQuality && q.label?.toLowerCase() === artQuality) ||
      (q.coneWeightG && article.coneWeightG && String(q.coneWeightG) === String(article.coneWeightG) &&
       q.threadWeightG && article.threadWeightG && String(q.threadWeightG) === String(article.threadWeightG))
  );
  const qualityNameFR = matchedZipperQ?.nameFR || matchedFabricQ?.nameFR || matchedThreadQ?.nameFR;

  if (qualityNameFR && typeof qualityNameFR === 'string' && qualityNameFR.trim()) {
    return qualityNameFR.trim();
  }

  // 4. Category nameFR
  if (category?.nameFR && typeof category.nameFR === 'string' && category.nameFR.trim()) {
    const catNameFr = category.nameFR.trim();
    // If original name had extra text after the category name, preserve it
    const baseCatName = (category.name || matchedPrefixCategoryName || '').trim();
    if (baseCatName && baseCatName.length > 0) {
      if (rawCatId.toLowerCase().startsWith(baseCatName.toLowerCase()) && rawCatId.length > baseCatName.length) {
        const extra = rawCatId.slice(baseCatName.length).trim();
        if (extra) return `${catNameFr} ${extra}`.trim();
      }
      if (rawArtName.toLowerCase().startsWith(baseCatName.toLowerCase()) && rawArtName.length > baseCatName.length) {
        const extra = rawArtName.slice(baseCatName.length).trim();
        if (extra) return `${catNameFr} ${extra}`.trim();
      }
    }
    return catNameFr;
  }

  // 5. Fallback textile dictionary
  const fallbackKey = artNameLower || catIdLower;
  for (const [key, val] of Object.entries(FALLBACK_TEXTILE_FR)) {
    if (fallbackKey === key) {
      return val;
    }
    if (fallbackKey.startsWith(key) && fallbackKey.length > key.length) {
      const extra = (rawArtName || rawCatId).slice(key.length).trim();
      return extra ? `${val} ${extra}`.trim() : val;
    }
  }

  // 6. General category nameFR
  if (category?.generalCategoryId && generalCategories.length > 0) {
    const genCat = generalCategories.find((g) => g.id === category.generalCategoryId);
    if (genCat?.nameFR && typeof genCat.nameFR === 'string' && genCat.nameFR.trim()) {
      return genCat.nameFR.trim();
    }
  }

  // 7. Fallback to article name, category name, or categoryId
  return rawArtName || category?.name || rawCatId || 'Article';
}

/**
 * Returns formatted display object with French commercial name, original reference,
 * and a flag indicating whether the French name is distinct from the original.
 */
export function getArticleDisplayName(
  article: any,
  categories: any[] = [],
  generalCategories: any[] = []
): {
  frenchName: string;
  originalName: string;
  hasDifferentFrenchName: boolean;
} {
  const frenchName = getArticleFrenchName(article, categories, generalCategories);
  const originalName = (article.name || article.categoryId || '').trim();
  const hasDifferentFrenchName = Boolean(
    originalName &&
    frenchName.toLowerCase().trim() !== originalName.toLowerCase().trim()
  );

  return {
    frenchName,
    originalName,
    hasDifferentFrenchName,
  };
}
