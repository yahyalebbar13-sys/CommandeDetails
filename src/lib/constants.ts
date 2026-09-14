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
  const cost = facture?.freightCost != null ? Number(facture.freightCost) : null;
  if (cost != null && !isNaN(cost)) return cost;
  const legacy = facture?.freight != null ? Number(facture.freight) : null;
  if (legacy != null && !isNaN(legacy)) return legacy;
  return 0;
}

/**
 * Retourne la date locale au format YYYY-MM-DD.
 * Évite le décalage de fuseau horaire produit par toISOString().split('T')[0]
 * qui renvoie l'heure UTC (en retard d'un jour entre 23h et minuit au Maroc UTC+1).
 */
export function getLocalDateString(d: Date = new Date()): string {
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
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

export const ACCESSORY_KEYWORDS = [
  'accessoire', 'accessoires', 'accessory', 'accessories',
  'bouton', 'boutons', 'button', 'buttons',
  'boucle', 'boucles', 'buckle', 'buckles',
  'rivet', 'rivets',
  'oeillet', 'oeillets', 'eyelet', 'eyelets',
  'crochet', 'crochets', 'hook', 'hooks',
  'anneau', 'anneaux', 'ring', 'rings',
  'snap', 'snaps', 'snap button', 'bouton pression',
  'stopper', 'stoppers', 'cord lock', 'cordon', 'cordons',
  'embout', 'embouts', 'fermoir', 'fermoirs', 'clasp', 'clasps',
  'mousqueton', 'mousquetons', 'carabiner', 'broche', 'pin', 'pins',
  'fourniture', 'fournitures', 'mercerie',
  'agrafe', 'agrafes', 'chainette', 'chaine', 'badge', 'tack pin',
  'velcro', 'scratch', 'epaulette', 'epaulettes', 'passepoil',
  'corde', 'cordonnet', 'tendeur', 'curseur plastique'
];

/**
 * Fonctions de normalisation des lignes logistiques
 */
export function isAccessoryLine(line?: string | null): boolean {
  if (!line) return false;
  const l = line.toLowerCase().trim();
  return (
    l === 'accessory' ||
    l === 'accessories' ||
    l.includes('accessoire') ||
    l.includes('accessory') ||
    l.includes('bouton') ||
    l.includes('button') ||
    l.includes('fourniture') ||
    l.includes('mercerie')
  );
}

export function isFabricLine(line?: string | null): boolean {
  if (!line) return false;
  const l = line.toLowerCase().trim();
  return l === 'fabric' || l.includes('fabric') || l.includes('tissu');
}

export function isZipperLine(line?: string | null): boolean {
  if (!line) return false;
  const l = line.toLowerCase().trim();
  return l === 'zipper' || l.includes('zipper') || l.includes('fermeture');
}

export function isThreadLine(line?: string | null): boolean {
  if (!line) return false;
  const l = line.toLowerCase().trim();
  return l === 'thread' || l.includes('thread') || l.includes('fil');
}

export function isSliderLine(line?: string | null): boolean {
  if (!line) return false;
  const l = line.toLowerCase().trim();
  return l.includes('slider') || l.includes('puller') || l.includes('curseur');
}

export function isTapeLine(line?: string | null): boolean {
  if (!line) return false;
  const l = line.toLowerCase().trim();
  return l.includes('tape') || l.includes('ruban') || l.includes('ribbon') || l.includes('sangle') || l.includes('biais');
}

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
 * Détecte si un nom de catégorie appartient au pôle Accessoires
 */
export function isAccessoryCategory(catName: string | undefined): boolean {
  if (!catName) return false;
  const lower = catName.toLowerCase().trim();
  return ACCESSORY_KEYWORDS.some(kw => lower.includes(kw));
}

/**
 * Détecte si un contexte (Ligne, Pôle ou Famille) relève des spécifications Fabric.
 * Vérifie le nom de la catégorie en direct, le specType du pôle, la ligne du pôle, puis les mots-clés.
 */
export function isFabricLineOrCategory(
  catName?: string | null,
  genCat?: any
): boolean {
  // Pôle checks: if pole belongs to accessories line, never treat as fabric
  if (genCat) {
    if (genCat.specType === 'accessory' || isAccessoryLine(genCat.line)) return false;
    const nameLower = (genCat.name || '').toLowerCase().trim();
    if (ACCESSORY_KEYWORDS.some(kw => nameLower.includes(kw))) return false;

    if (genCat.specType === 'fabric') return true;
    if (genCat.specType === 'zipper' || genCat.specType === 'thread' || genCat.specType === 'slider' || genCat.specType === 'tape') return false;

    if (isFabricLine(genCat.line)) return true;
    if (isZipperLine(genCat.line) || isThreadLine(genCat.line) || isSliderLine(genCat.line) || isTapeLine(genCat.line)) return false;

    if (FABRIC_KEYWORDS.some(kw => nameLower.includes(kw)) && !nameLower.includes('slider') && !nameLower.includes('puller')) return true;
  }

  // Direct category name check
  if (catName) {
    const lower = catName.toLowerCase().trim();
    if (ACCESSORY_KEYWORDS.some(kw => lower.includes(kw))) return false;
    if (FABRIC_KEYWORDS.some(kw => lower.includes(kw)) && !lower.includes('slider') && !lower.includes('puller')) return true;
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
  // Pôle checks
  if (genCat) {
    if (genCat.specType === 'accessory' || isAccessoryLine(genCat.line)) return false;
    const nameLower = (genCat.name || '').toLowerCase().trim();
    if (ACCESSORY_KEYWORDS.some(kw => nameLower.includes(kw))) return false;

    if (genCat.specType === 'zipper') return true;
    if (genCat.specType === 'fabric' || genCat.specType === 'thread' || genCat.specType === 'slider' || genCat.specType === 'tape') return false;

    if (isZipperLine(genCat.line)) return true;
    if (isFabricLine(genCat.line) || isThreadLine(genCat.line) || isSliderLine(genCat.line) || isTapeLine(genCat.line)) return false;

    if (ZIPPER_KEYWORDS.some(kw => nameLower.includes(kw)) && !nameLower.includes('slider') && !nameLower.includes('puller')) return true;
  }

  // Direct category name check (plastic zipper, nylon zipper, etc.)
  if (catName) {
    const lower = catName.toLowerCase().trim();
    if (ACCESSORY_KEYWORDS.some(kw => lower.includes(kw))) return false;
    if (ZIPPER_KEYWORDS.some(kw => lower.includes(kw)) && !lower.includes('slider') && !lower.includes('puller')) {
      return true;
    }
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
  // Pôle checks
  if (genCat) {
    if (genCat.specType === 'accessory' || isAccessoryLine(genCat.line)) return false;
    const nameLower = (genCat.name || '').toLowerCase().trim();
    if (ACCESSORY_KEYWORDS.some(kw => nameLower.includes(kw))) return false;

    if (genCat.specType === 'thread') return true;
    if (genCat.specType === 'fabric' || genCat.specType === 'zipper' || genCat.specType === 'slider' || genCat.specType === 'tape') return false;

    if (isThreadLine(genCat.line)) return true;
    if (isFabricLine(genCat.line) || isZipperLine(genCat.line) || isSliderLine(genCat.line) || isTapeLine(genCat.line)) return false;

    if (THREAD_KEYWORDS.some(kw => nameLower.includes(kw))) return true;
  }

  // Direct category name check
  if (catName) {
    const lower = catName.toLowerCase().trim();
    if (ACCESSORY_KEYWORDS.some(kw => lower.includes(kw))) return false;
    if (THREAD_KEYWORDS.some(kw => lower.includes(kw))) return true;
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
  // Pôle checks
  if (genCat) {
    if (genCat.specType === 'accessory' || isAccessoryLine(genCat.line)) return false;
    const nameLower = (genCat.name || '').toLowerCase().trim();
    if (ACCESSORY_KEYWORDS.some(kw => nameLower.includes(kw))) return false;

    if (genCat.specType === 'slider') return true;
    if (genCat.specType === 'fabric' || genCat.specType === 'zipper' || genCat.specType === 'thread' || genCat.specType === 'tape') return false;

    if (isSliderLine(genCat.line)) return true;
    if (isFabricLine(genCat.line) || isZipperLine(genCat.line) || isThreadLine(genCat.line) || isTapeLine(genCat.line)) return false;

    if (SLIDER_KEYWORDS.some(kw => nameLower.includes(kw))) return true;
  }

  // Direct category name check
  if (catName) {
    const lower = catName.toLowerCase().trim();
    if (ACCESSORY_KEYWORDS.some(kw => lower.includes(kw))) return false;
    if (SLIDER_KEYWORDS.some(kw => lower.includes(kw))) return true;
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
  // Pôle checks
  if (genCat) {
    if (genCat.specType === 'accessory' || isAccessoryLine(genCat.line)) return false;
    const nameLower = (genCat.name || '').toLowerCase().trim();
    if (ACCESSORY_KEYWORDS.some(kw => nameLower.includes(kw))) return false;

    if (genCat.specType === 'tape') return true;
    if (genCat.specType === 'fabric' || genCat.specType === 'zipper' || genCat.specType === 'thread' || genCat.specType === 'slider') return false;

    if (isTapeLine(genCat.line)) return true;
    if (isFabricLine(genCat.line) || isZipperLine(genCat.line) || isThreadLine(genCat.line) || isSliderLine(genCat.line)) return false;

    if (TAPE_KEYWORDS.some(kw => nameLower.includes(kw)) && !nameLower.includes('slider') && !nameLower.includes('puller')) return true;
  }

  // Direct category name check
  if (catName) {
    const lower = catName.toLowerCase().trim();
    if (ACCESSORY_KEYWORDS.some(kw => lower.includes(kw))) return false;
    if (TAPE_KEYWORDS.some(kw => lower.includes(kw)) && !lower.includes('slider') && !lower.includes('puller')) {
      if (!lower.includes('zipper') || lower.includes('zipper tape') || lower.includes('ruban') || lower.includes('tape')) {
        return true;
      }
    }
  }

  return false;
}

/**
 * Détecte si un contexte (Ligne, Pôle ou Famille) relève des spécifications Accessoires.
 * Vérifie le nom de la catégorie en direct, le specType du pôle, la ligne du pôle, puis les mots-clés.
 */
export function isAccessoryLineOrCategory(
  catName?: string | null,
  genCat?: any
): boolean {
  // 1. Pôle checks (highest authority for pole affiliation)
  if (genCat) {
    if (genCat.specType === 'accessory') return true;

    // Explicit line check (e.g. Accessoire, Accessoires, Bouton, Fournitures...)
    // This takes precedence over accidental default specType='fabric' in Firestore
    if (isAccessoryLine(genCat.line)) return true;

    const nameLower = (genCat.name || '').toLowerCase().trim();
    if (ACCESSORY_KEYWORDS.some(kw => nameLower.includes(kw)) && !nameLower.includes('slider') && !nameLower.includes('puller') && !nameLower.includes('zipper')) {
      return true;
    }

    // If pole explicitly has another specType and another line, check if category is accessory
    if (genCat.specType && genCat.specType !== 'accessory' && genCat.specType !== 'none') {
      if (!catName) return false;
    }
  }

  // 2. Direct category name check
  if (catName) {
    const lower = catName.toLowerCase().trim();
    if (ACCESSORY_KEYWORDS.some(kw => lower.includes(kw)) && !lower.includes('slider') && !lower.includes('puller') && !lower.includes('zipper')) {
      return true;
    }
  }

  return false;
}
