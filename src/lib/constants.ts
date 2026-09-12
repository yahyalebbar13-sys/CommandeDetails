/**
 * Constantes partagées de l'application.
 * Centraliser ici toute valeur qui apparaît dans plusieurs fichiers.
 */

/** Liste des sociétés déclarantes. Utilisée dans dashboard-view et suppliers-view. */
export const COMPANIES_LIST = ['New fournitures', 'Lebtex', 'Robe in box'] as const;
export type CompanyName = (typeof COMPANIES_LIST)[number];

/**
 * Email de l'administrateur principal.
 * Contrôle la création de comptes clients.
 * À terme, remplacer par un claim Firebase custom (role: 'admin').
 */
export const ADMIN_EMAIL = 'yahya.lebbar13@gmail.com';

/**
 * Retourne le coût de fret d'une facture en normalisant
 * les deux champs historiques freightCost et freight.
 */
export function getFreight(facture: any): number {
  return Number(facture?.freightCost) || Number(facture?.freight) || 0;
}

/**
 * Détecte si un nom de catégorie correspond à un article zipper technique
 * (exclut LONG CHAIN et SLIDER qui sont des accessoires, pas des zippers).
 */
export function isZipperCategory(catName: string | undefined): boolean {
  if (!catName) return false;
  const upper = catName.toUpperCase();
  return upper.includes('ZIPPER') && !upper.includes('LONG CHAIN') && !upper.includes('SLIDER');
}

export const FABRIC_KEYWORDS = [
  'fabric', 'non woven', 't/c fabric', 'popeline', 'leather', 'felt fabric',
  'polyester fabric', 'taffeta fabric', 'woven interlining', 'interlining',
  'pocketing', 'eva film', 't/c twill', 'oxford', 'twill', 'tissu', 'textile', 'woven'
];

export const ZIPPER_KEYWORDS = [
  'zipper', 'nylon zipper', 'metal zipper', 'plastic zipper', 'long chain', 'fermeture',
  'zip', 'resine', 'résine', 'vislon', 'delrin', 'molded', 'injectee', 'injectée'
];

export const THREAD_KEYWORDS = [
  'thread', 'sewing thread', 'fil', 'fil à coudre', 'cone', 'cône', 'yarn', 'polyester thread', 'spun polyester'
];

export const SLIDER_KEYWORDS = [
  'slider', 'puller', 'curseur', 'tirette', 'slider for nylon zipper', 'slider for plastic zipper', 'slider for metal zipper'
];

export const TAPE_KEYWORDS = [
  'tape', 'ruban', 'ribbon', 'webbing', 'sangle', 'biais', 'grosgrain', 'gros-grain',
  'satin ribbon', 'velvet ribbon', 'twill tape', 'herringbone', 'elastic tape', 'ruban satin',
  'ruban gros-grain', 'ruban sergé', 'ruban velours', 'sangle pp', 'sangle coton',
  'bias', 'binding', 'bande'
];

/**
 * Détecte si un nom de catégorie appartient au pôle Fabric
 */
export function isFabricCategory(catName: string | undefined): boolean {
  if (!catName) return false;
  const lower = catName.toLowerCase().trim();
  return FABRIC_KEYWORDS.some(kw => lower.includes(kw));
}

/**
 * Détecte si un nom de catégorie appartient au pôle Thread
 */
export function isThreadCategory(catName: string | undefined): boolean {
  if (!catName) return false;
  const lower = catName.toLowerCase().trim();
  return THREAD_KEYWORDS.some(kw => lower.includes(kw));
}

/**
 * Détecte si un nom de catégorie appartient au pôle Slider & Puller
 */
export function isSliderCategory(catName: string | undefined): boolean {
  if (!catName) return false;
  const lower = catName.toLowerCase().trim();
  return SLIDER_KEYWORDS.some(kw => lower.includes(kw));
}

/**
 * Détecte si un nom de catégorie appartient au pôle Tape / Ruban
 */
export function isTapeCategory(catName: string | undefined): boolean {
  if (!catName) return false;
  const lower = catName.toLowerCase().trim();
  return TAPE_KEYWORDS.some(kw => lower.includes(kw));
}

/**
 * Détecte si un contexte (Ligne, Pôle ou Famille) relève des spécifications Fabric.
 * Vérifie le nom de la catégorie en direct, le specType du pôle, la ligne du pôle, puis les mots-clés.
 */
export function isFabricLineOrCategory(
  catName?: string | null,
  genCat?: any
): boolean {
  // 1. Direct category name check
  if (catName) {
    const lower = catName.toLowerCase().trim();
    if (FABRIC_KEYWORDS.some(kw => lower.includes(kw)) && !lower.includes('slider') && !lower.includes('puller')) return true;
  }

  // 2. Pôle checks
  if (genCat) {
    if (genCat.specType === 'fabric') return true;
    if (genCat.specType === 'zipper' || genCat.specType === 'thread' || genCat.specType === 'slider' || genCat.specType === 'tape') return false;

    const lineLower = (genCat.line || '').toLowerCase().trim();
    if (lineLower === 'fabric' || lineLower.includes('fabric') || lineLower.includes('tissu')) return true;
    if (lineLower === 'zipper' || lineLower.includes('zipper') || lineLower.includes('fermeture')) return false;
    if (lineLower === 'thread' || lineLower.includes('thread') || lineLower.includes('fil')) return false;
    if (lineLower.includes('slider') || lineLower.includes('puller') || lineLower.includes('curseur')) return false;
    if (lineLower.includes('tape') || lineLower.includes('ruban') || lineLower.includes('sangle') || lineLower.includes('ribbon')) return false;

    const nameLower = (genCat.name || '').toLowerCase().trim();
    if (FABRIC_KEYWORDS.some(kw => nameLower.includes(kw)) && !nameLower.includes('slider') && !nameLower.includes('puller')) return true;
  }

  return false;
}

/**
 * Détecte si un contexte (Ligne, Pôle ou Famille) relève des spécifications Zipper.
 * Vérifie le nom de la catégorie en direct, le specType du pôle, la ligne du pôle, puis les mots-clés.
 */
export function isZipperLineOrCategory(
  catName?: string | null,
  genCat?: any
): boolean {
  // 1. Direct category name check (plastic zipper, nylon zipper, etc.)
  if (catName) {
    const lower = catName.toLowerCase().trim();
    if (ZIPPER_KEYWORDS.some(kw => lower.includes(kw)) && !lower.includes('slider') && !lower.includes('puller')) {
      return true;
    }
  }

  // 2. Pôle checks
  if (genCat) {
    if (genCat.specType === 'zipper') return true;
    if (genCat.specType === 'fabric' || genCat.specType === 'thread' || genCat.specType === 'slider' || genCat.specType === 'tape') return false;

    const lineLower = (genCat.line || '').toLowerCase().trim();
    if (lineLower === 'zipper' || lineLower.includes('zipper') || lineLower.includes('fermeture')) return true;
    if (lineLower === 'fabric' || lineLower.includes('fabric') || lineLower.includes('tissu')) return false;
    if (lineLower === 'thread' || lineLower.includes('thread') || lineLower.includes('fil')) return false;
    if (lineLower.includes('slider') || lineLower.includes('puller') || lineLower.includes('curseur')) return false;
    if (lineLower.includes('tape') || lineLower.includes('ruban') || lineLower.includes('sangle') || lineLower.includes('ribbon')) return false;

    const nameLower = (genCat.name || '').toLowerCase().trim();
    if (ZIPPER_KEYWORDS.some(kw => nameLower.includes(kw)) && !nameLower.includes('slider') && !nameLower.includes('puller')) return true;
  }

  return false;
}

/**
 * Détecte si un contexte (Ligne, Pôle ou Famille) relève des spécifications Thread (Fil).
 * Vérifie le nom de la catégorie en direct, le specType du pôle, la ligne du pôle, puis les mots-clés.
 */
export function isThreadLineOrCategory(
  catName?: string | null,
  genCat?: any
): boolean {
  // 1. Direct category name check
  if (catName) {
    const lower = catName.toLowerCase().trim();
    if (THREAD_KEYWORDS.some(kw => lower.includes(kw))) return true;
  }

  // 2. Pôle checks
  if (genCat) {
    if (genCat.specType === 'thread') return true;
    if (genCat.specType === 'fabric' || genCat.specType === 'zipper' || genCat.specType === 'slider' || genCat.specType === 'tape') return false;

    const lineLower = (genCat.line || '').toLowerCase().trim();
    if (lineLower === 'thread' || lineLower.includes('thread') || lineLower.includes('fil')) return true;
    if (lineLower === 'fabric' || lineLower.includes('fabric') || lineLower.includes('tissu')) return false;
    if (lineLower === 'zipper' || lineLower.includes('zipper') || lineLower.includes('fermeture')) return false;
    if (lineLower.includes('slider') || lineLower.includes('puller') || lineLower.includes('curseur')) return false;
    if (lineLower.includes('tape') || lineLower.includes('ruban') || lineLower.includes('sangle') || lineLower.includes('ribbon')) return false;

    const nameLower = (genCat.name || '').toLowerCase().trim();
    if (THREAD_KEYWORDS.some(kw => nameLower.includes(kw))) return true;
  }

  return false;
}

/**
 * Détecte si un contexte (Ligne, Pôle ou Famille) relève des spécifications Slider & Puller.
 * Vérifie le nom de la catégorie en direct, le specType du pôle, la ligne du pôle, puis les mots-clés.
 */
export function isSliderLineOrCategory(
  catName?: string | null,
  genCat?: any
): boolean {
  // 1. Direct category name check
  if (catName) {
    const lower = catName.toLowerCase().trim();
    if (SLIDER_KEYWORDS.some(kw => lower.includes(kw))) return true;
  }

  // 2. Pôle checks
  if (genCat) {
    if (genCat.specType === 'slider') return true;
    if (genCat.specType === 'fabric' || genCat.specType === 'zipper' || genCat.specType === 'thread' || genCat.specType === 'tape') return false;

    const lineLower = (genCat.line || '').toLowerCase().trim();
    if (lineLower.includes('slider') || lineLower.includes('puller') || lineLower.includes('curseur')) return true;
    if (lineLower === 'fabric' || lineLower === 'zipper' || lineLower === 'thread' || lineLower.includes('ruban') || lineLower.includes('sangle')) return false;

    const nameLower = (genCat.name || '').toLowerCase().trim();
    if (SLIDER_KEYWORDS.some(kw => nameLower.includes(kw))) return true;
  }

  return false;
}

/**
 * Détecte si un contexte (Ligne, Pôle ou Famille) relève des spécifications Tape / Ruban.
 * Vérifie le nom de la catégorie en direct, le specType du pôle, la ligne du pôle, puis les mots-clés.
 */
export function isTapeLineOrCategory(
  catName?: string | null,
  genCat?: any
): boolean {
  // 1. Direct category name check
  if (catName) {
    const lower = catName.toLowerCase().trim();
    if (TAPE_KEYWORDS.some(kw => lower.includes(kw)) && !lower.includes('slider') && !lower.includes('puller')) {
      if (!lower.includes('zipper') || lower.includes('zipper tape') || lower.includes('ruban') || lower.includes('tape')) {
        return true;
      }
    }
  }

  // 2. Pôle checks
  if (genCat) {
    if (genCat.specType === 'tape') return true;
    if (genCat.specType === 'fabric' || genCat.specType === 'zipper' || genCat.specType === 'thread' || genCat.specType === 'slider') return false;

    const lineLower = (genCat.line || '').toLowerCase().trim();
    if (lineLower === 'tape' || lineLower.includes('tape') || lineLower.includes('ruban') || lineLower.includes('ribbon') || lineLower.includes('sangle') || lineLower.includes('biais')) return true;
    if (lineLower === 'fabric' || lineLower === 'zipper' || lineLower === 'thread' || lineLower.includes('slider') || lineLower.includes('puller')) return false;

    const nameLower = (genCat.name || '').toLowerCase().trim();
    if (TAPE_KEYWORDS.some(kw => nameLower.includes(kw)) && !nameLower.includes('slider') && !nameLower.includes('puller')) return true;
  }

  return false;
}
