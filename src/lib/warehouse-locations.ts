/**
 * Modèle d'adressage physique des lieux de stockage — Entrepôt → Zone → Rack → Niveau.
 *
 * Le logiciel savait jusqu'ici DANS QUEL magasin se trouve une référence (qtyByStore), jamais
 * OÙ dedans. Un emplacement décrit un endroit réel de l'entrepôt : on imprime son QR code, on le
 * colle au rack, et les mouvements de stock peuvent s'y rattacher.
 *
 * Stockage Firestore :
 *   - users/{adminUid}/storageLocations/{id}  → un document par emplacement (collection à plat :
 *     un seul listener temps réel, et la recherche « où est ce produit » traverse les entrepôts).
 *   - users/{adminUid}/stores/{id}.zones      → les zones, peu nombreuses et toujours éditées
 *     avec l'entrepôt, vivent sur le document du lieu plutôt que dans une collection dédiée.
 */

export type StorageZone = {
  code: string;    // 'A' — unique dans l'entrepôt
  name?: string;   // 'Fils', 'Fermetures'…
  color?: string;  // clé de ZONE_COLORS
};

export type StorageLocation = {
  id: string;
  storeId: string;
  zone: string;
  rack?: string;
  level?: string;
  code: string;            // 'A-03-02' — unique par entrepôt, c'est la valeur portée par le QR
  label?: string;          // libellé libre : « Fils rouges », « Palettes hautes »…
  lengthCm?: number;
  widthCm?: number;
  heightCm?: number;
  maxPallets?: number;
  maxKg?: number;
  active?: boolean;        // un emplacement inactif reste dans l'historique mais n'est plus proposé
  notes?: string;
  createdAt?: any;
  updatedAt?: any;
};

/** Occupation calculée (jamais stockée) d'un emplacement. */
export type LocationOccupancy = {
  code: string;
  quantity: number;      // somme des entrées moins les sorties rattachées à cet emplacement
  references: number;    // nombre de références distinctes présentes
};

export const ZONE_COLORS: Record<string, { bg: string; text: string; border: string; dot: string }> = {
  emerald: { bg: 'bg-emerald-50', text: 'text-emerald-700', border: 'border-emerald-200', dot: 'bg-emerald-500' },
  blue:    { bg: 'bg-blue-50',    text: 'text-blue-700',    border: 'border-blue-200',    dot: 'bg-blue-500' },
  amber:   { bg: 'bg-amber-50',   text: 'text-amber-700',   border: 'border-amber-200',   dot: 'bg-amber-500' },
  violet:  { bg: 'bg-violet-50',  text: 'text-violet-700',  border: 'border-violet-200',  dot: 'bg-violet-500' },
  rose:    { bg: 'bg-rose-50',    text: 'text-rose-700',    border: 'border-rose-200',    dot: 'bg-rose-500' },
  teal:    { bg: 'bg-teal-50',    text: 'text-teal-700',    border: 'border-teal-200',    dot: 'bg-teal-500' },
  stone:   { bg: 'bg-stone-50',   text: 'text-stone-700',   border: 'border-stone-200',   dot: 'bg-stone-400' },
};

export const ZONE_COLOR_KEYS = Object.keys(ZONE_COLORS);

export function zoneColor(zone: StorageZone | undefined) {
  return ZONE_COLORS[zone?.color || 'stone'] || ZONE_COLORS.stone;
}

/** Normalise un segment d'adresse : majuscules, sans séparateur, et compté sur 2 chiffres. */
export function normalizeSegment(raw: string | number | undefined | null): string {
  if (raw === undefined || raw === null) return '';
  const s = String(raw).trim().toUpperCase().replace(/[^A-Z0-9]/g, '');
  if (!s) return '';
  return /^\d+$/.test(s) ? s.padStart(2, '0') : s;
}

/** 'A' + '3' + '2' → 'A-03-02'. Les segments vides sont simplement omis. */
export function buildLocationCode(parts: {
  zone: string | number;
  rack?: string | number | null;
  level?: string | number | null;
}): string {
  return [parts.zone, parts.rack, parts.level]
    .map(normalizeSegment)
    .filter(Boolean)
    .join('-');
}

/** 'A-03-02' → { zone: 'A', rack: '03', level: '02' }. */
export function parseLocationCode(code: string): { zone: string; rack?: string; level?: string } {
  const [zone = '', rack, level] = String(code || '').trim().toUpperCase().split('-');
  return { zone, rack: rack || undefined, level: level || undefined };
}

/**
 * Charge utile du QR collé sur le rack. Le préfixe permet à un scanner de distinguer une
 * étiquette d'emplacement de n'importe quel autre code-barres produit qui traîne sur un carton.
 */
export function locationQrPayload(storeId: string, code: string): string {
  return `LEBTEX:LOC:${storeId}:${code}`;
}

/** Inverse de locationQrPayload — renvoie null si ce n'est pas une étiquette d'emplacement. */
export function parseLocationQrPayload(payload: string): { storeId: string; code: string } | null {
  const m = /^LEBTEX:LOC:([^:]+):(.+)$/.exec(String(payload || '').trim());
  return m ? { storeId: m[1], code: m[2] } : null;
}

export type GenerateLocationsParams = {
  zone: string;
  rackFrom: number;
  rackTo: number;
  levelFrom: number;
  levelTo: number;
  /** Sans niveaux : un seul emplacement par rack (zone de vrac, palettes au sol). */
  withLevels: boolean;
};

/**
 * Génère la liste des codes d'une plage rack × niveau, pour créer un entrepôt entier en une fois
 * plutôt qu'emplacement par emplacement. Renvoie les codes seuls : l'appelant filtre ceux qui
 * existent déjà avant d'écrire.
 */
export function generateLocationCodes(params: GenerateLocationsParams): string[] {
  const zone = normalizeSegment(params.zone);
  if (!zone) return [];

  const rackFrom = Math.max(1, Math.floor(params.rackFrom || 1));
  const rackTo = Math.max(rackFrom, Math.floor(params.rackTo || rackFrom));
  const levelFrom = Math.max(1, Math.floor(params.levelFrom || 1));
  const levelTo = Math.max(levelFrom, Math.floor(params.levelTo || levelFrom));

  const codes: string[] = [];
  for (let r = rackFrom; r <= rackTo; r++) {
    if (!params.withLevels) {
      codes.push(buildLocationCode({ zone, rack: r }));
      continue;
    }
    for (let l = levelFrom; l <= levelTo; l++) {
      codes.push(buildLocationCode({ zone, rack: r, level: l }));
    }
  }
  return codes;
}

/** Garde-fou : au-delà, la génération en lot est presque sûrement une erreur de saisie. */
export const MAX_GENERATED_LOCATIONS = 500;

// ── Variantes ────────────────────────────────────────────────────────────────
// Un article d'arrivage n'est ventilé que sur UNE dimension à la fois, dans cet ordre de
// priorité : qualité, puis couleur, puis taille (même règle que l'entrée en stock et que
// computeStockItems). Chaque ligne de mouvement porte le libellé de sa variante dans le champ
// de cette dimension (m.quality, m.color ou m.size) ; les autres champs peuvent valoir
// 'various' et ne doivent donc jamais servir à filtrer.

export type VariantDimension = 'quality' | 'color' | 'size';

/** Une variante de stock : la dimension ventilée et le libellé tel qu'écrit sur les mouvements. */
export type StockVariant = { dimension: VariantDimension; value: string };

/** Libellés comparés comme dans le calcul du stock : sans casse, espaces autour retirés. */
export function normalizeVariantValue(value: unknown): string {
  return String(value ?? '').trim().toLowerCase();
}

/** Le mouvement appartient-il à cette variante ? Sans variante : toujours (article entier). */
export function movementMatchesVariant(m: any, variant?: StockVariant | null): boolean {
  if (!variant || !normalizeVariantValue(variant.value)) return true;
  return normalizeVariantValue(m?.[variant.dimension]) === normalizeVariantValue(variant.value);
}

/** Variante d'une ligne de stock éclatée (StockItem virtuel) ; null pour un article simple. */
export function stockItemVariant(
  item: { _qualityKey?: string; _colorKey?: string; _sizeKey?: string } | null | undefined
): StockVariant | null {
  if (!item) return null;
  if (item._qualityKey) return { dimension: 'quality', value: item._qualityKey };
  if (item._colorKey) return { dimension: 'color', value: item._colorKey };
  if (item._sizeKey) return { dimension: 'size', value: item._sizeKey };
  return null;
}

/** Clé texte stable d'une variante (« color:bleu ») pour indexer un état d'écran ; '' = article entier. */
export function variantKey(variant?: StockVariant | null): string {
  const value = normalizeVariantValue(variant?.value);
  return variant && value ? `${variant.dimension}:${value}` : '';
}

const isVarious = (v: unknown) => normalizeVariantValue(v) === 'various';

/**
 * Quantité d'une ligne de ventilation : `quantity` (qualités, tailles) ou `rolls` (couleurs).
 * `||` et non `??`, comme les formulaires de commande : une ligne couleur qui porte en plus un
 * `quantity` à 0 doit être lue sur ses `rolls`, sinon elle n'entre pas en stock du tout.
 */
export function breakdownRowQuantity(row: any): number {
  return Number(row?.quantity) || Number(row?.rolls) || 0;
}

/** Total d'une ventilation, toutes lignes confondues. */
export function totalVentilation(rows: any): number {
  return (Array.isArray(rows) ? rows : []).reduce((somme, row) => somme + breakdownRowQuantity(row), 0);
}

/**
 * Valeur à écrire sur un mouvement pour une dimension non ventilée. « various » veut dire
 * « plusieurs » : l'écrire comme couleur créerait une ligne de stock « various » invendable.
 */
export function libelleFixe(value: unknown): string | null {
  const texte = String(value ?? '').trim();
  return !texte || isVarious(texte) ? null : texte;
}

/**
 * Dimension sur laquelle un article d'arrivage est ventilé, ou null s'il entre en une seule ligne.
 * La priorité (qualité, puis couleur, puis taille) est celle du calcul du stock
 * (computeStockItems) : entrée et écran doivent toujours ventiler pareil, sinon la marchandise
 * entre sur une dimension et s'affiche sur une autre.
 *
 * Une ventilation qui annonce PLUS que la quantité de l'article n'est pas la sienne : d'anciennes
 * saisies recopiaient les couleurs de la commande entière sur chaque article issu d'un
 * éclatement par prix. La suivre ferait entrer la marchandise deux fois ; l'article entre alors
 * en une seule ligne (l'écran d'entrée le signale).
 */
export function articleVariantDimension(article: any): VariantDimension | null {
  const candidates: [VariantDimension, any[]][] = [];
  if (Array.isArray(article?.qualityBreakdown) && article.qualityBreakdown.length > 0) candidates.push(['quality', article.qualityBreakdown]);
  if (isVarious(article?.color) && Array.isArray(article?.colorBreakdown) && article.colorBreakdown.length > 0) candidates.push(['color', article.colorBreakdown]);
  if (isVarious(article?.size) && Array.isArray(article?.sizeBreakdown) && article.sizeBreakdown.length > 0) candidates.push(['size', article.sizeBreakdown]);
  if (candidates.length === 0) return null;

  const [dimension, rows] = candidates[0];
  const quantite = Number(article?.quantity) || 0;
  if (quantite > 0 && totalVentilation(rows) - quantite > 0.001) return null;
  return dimension;
}

/**
 * Ventilation présente mais écartée parce qu'elle dépasse la quantité de l'article : à dire à
 * l'utilisateur avant de valider une entrée, pour qu'il corrige la saisie plutôt que de découvrir
 * un stock entré en bloc.
 */
export function ventilationIgnoree(article: any): { dimension: VariantDimension; total: number } | null {
  if (articleVariantDimension(article)) return null;
  const rows =
    Array.isArray(article?.qualityBreakdown) && article.qualityBreakdown.length > 0 ? ['quality', article.qualityBreakdown] as const :
    isVarious(article?.color) && Array.isArray(article?.colorBreakdown) && article.colorBreakdown.length > 0 ? ['color', article.colorBreakdown] as const :
    isVarious(article?.size) && Array.isArray(article?.sizeBreakdown) && article.sizeBreakdown.length > 0 ? ['size', article.sizeBreakdown] as const :
    null;
  return rows ? { dimension: rows[0], total: totalVentilation(rows[1]) } : null;
}

/** Une ligne d'entrée en stock d'un article : une variante (ou l'article entier) et sa quantité. */
export type InboundVariantLine = {
  variant: StockVariant | null;
  /** '' pour l'article entier — voir variantKey. */
  key: string;
  label: string;
  quantity: number;
  /** Ligne de ventilation d'origine (qualité, couleur ou taille), absente pour l'article entier. */
  row?: any;
};

/**
 * Lignes que l'entrée en stock écrira pour un article, dans l'ordre de la ventilation. Les lignes
 * à quantité nulle sont écartées, comme à l'écriture. C'est la source commune de l'écran
 * (une ligne d'emplacement par variante) et de l'écriture des mouvements.
 */
export function articleInboundVariants(article: any): InboundVariantLine[] {
  const dimension = articleVariantDimension(article);
  if (!dimension) {
    const quantity = Number(article?.quantity) || 0;
    return [{ variant: null, key: '', label: '', quantity }];
  }

  const rows: any[] =
    dimension === 'quality' ? article.qualityBreakdown :
    dimension === 'color' ? article.colorBreakdown :
    article.sizeBreakdown;

  const lines: InboundVariantLine[] = [];
  for (const row of rows) {
    const quantity = breakdownRowQuantity(row);
    if (quantity <= 0) continue;
    const label =
      dimension === 'quality' ? String(row?.quality || '').trim() :
      dimension === 'color' ? String(row?.colorCode || row?.description || row?.color || '').trim() :
      String(row?.size || '').trim();
    // Une ligne sans libellé n'entre pas : computeStockItems écarte les lignes sans libellé, la
    // marchandise serait en base et dans l'occupation des racks, mais invisible et invendable
    // dans /stock. L'écart est annoncé par le bandeau « Quantités à vérifier » du passage en
    // stock, qui compare ce qui entrera à la quantité de l'article.
    if (!label) continue;
    const variant = { dimension, value: label };
    lines.push({ variant, key: variantKey(variant), label, quantity, row });
  }
  return lines;
}

/**
 * Relit les emplacements déjà affectés à une entrée (écran « Revoir / Corriger ») : parts
 * regroupées par variante PUIS par emplacement. Regrouper par emplacement seul ferait perdre
 * « quelle couleur est où » au prochain enregistrement.
 */
export function rehydrateInboundAllocations(
  movements: any[], articleId: string, dimension: VariantDimension | null
): Record<string, InboundAllocation[]> {
  const byKey: Record<string, Record<string, InboundAllocation>> = {};
  for (const m of movements || []) {
    if (!m || m.articleId !== articleId || m.type !== 'IN' || !m.locationCode) continue;
    const key = dimension ? variantKey({ dimension, value: m[dimension] }) : '';
    const byCode = (byKey[key] ||= {});
    const part = (byCode[m.locationCode] ||= { locationCode: m.locationCode, quantity: 0 });
    part.quantity = Math.round((part.quantity + (Number(m.quantity) || 0)) * 1000) / 1000;
    if (m.locationId && !part.locationId) part.locationId = m.locationId;
  }
  const out: Record<string, InboundAllocation[]> = {};
  for (const [key, byCode] of Object.entries(byKey)) {
    out[key] = Object.values(byCode).sort((a, b) => compareLocationCodes(a.locationCode, b.locationCode));
  }
  return out;
}

/**
 * Occupation par emplacement, dérivée des mouvements de stock (source de vérité unique, comme
 * pour le stock par magasin). Un mouvement sans locationCode n'est rattaché à aucun emplacement
 * et n'apparaît donc nulle part ici — c'est voulu, ça rend visible ce qui reste à adresser.
 */
export function computeLocationOccupancy(movements: any[]): Record<string, LocationOccupancy> {
  const acc: Record<string, { quantity: number; refs: Set<string> }> = {};

  for (const m of movements || []) {
    const code = m?.locationCode;
    if (!code) continue;
    const qty = Number(m.quantity) || 0;
    if (!acc[code]) acc[code] = { quantity: 0, refs: new Set() };
    // ADJUSTMENT suit la même convention que le reste du calcul de stock : la quantité est
    // toujours positive, la direction vient du type.
    acc[code].quantity += m.type === 'OUT' ? -qty : qty;
    if (m.articleId) acc[code].refs.add(String(m.articleId));
  }

  const out: Record<string, LocationOccupancy> = {};
  for (const [code, v] of Object.entries(acc)) {
    out[code] = { code, quantity: Math.round(v.quantity * 100) / 100, references: v.refs.size };
  }
  return out;
}

/** Ce qu'un emplacement contient d'un article donné, avec l'ancienneté de son plus vieux dépôt. */
export type ArticleLocationStock = {
  locationCode: string;
  locationId?: string;
  quantity: number;
  /** Date (YYYY-MM-DD) de la plus ancienne entrée encore présente — clé du tri FIFO. */
  firstInDate: string;
};

/**
 * Ventile le stock d'un article par emplacement, dans un lieu donné. Dérivé des mouvements,
 * comme tout le reste du calcul de stock — rien n'est stocké.
 *
 * Avec une variante (couleur, qualité ou taille d'un article éclaté), seuls ses mouvements
 * comptent : le rack du Rouge ne contient pas de Bleu, même s'il s'agit du même article.
 */
export function computeArticleLocationStock(
  movements: any[], storeId: string, articleId: string, variant?: StockVariant | null
): ArticleLocationStock[] {
  const acc: Record<string, { qty: number; firstIn: string; locId?: string }> = {};
  // Solde de l'article entier par rack : plafonne celui d'une variante. Une sortie adressée
  // avant le suivi par variante (ou saisie à la main) a pu prendre du Bleu dans le rack du
  // Rouge ; le rack ne contient alors plus ce que le seul Rouge laisse croire.
  const articleNet: Record<string, number> = {};

  for (const m of movements || []) {
    if (!m?.locationCode) continue;
    if (m.articleId !== articleId) continue;
    // Un transfert entrant est crédité sur toStoreId, tous les autres sur storeId.
    const place = m.type === 'IN' && m.reason === 'TRANSFERT' ? (m.toStoreId || m.storeId) : m.storeId;
    if (place !== storeId) continue;

    const qty = Number(m.quantity) || 0;
    const signed = m.type === 'OUT' ? -qty : qty;
    articleNet[m.locationCode] = (articleNet[m.locationCode] || 0) + signed;
    if (!movementMatchesVariant(m, variant)) continue;

    const entry = (acc[m.locationCode] ||= { qty: 0, firstIn: '9999-12-31', locId: m.locationId });
    entry.qty += signed;
    if (m.locationId && !entry.locId) entry.locId = m.locationId;
    if (m.type !== 'OUT' && m.date && m.date < entry.firstIn) entry.firstIn = m.date;
  }

  // Arrondi avant le filtre : 1,1 − 1,0 − 0,1 laisse sinon un rack « non vide » à 1e-17.
  const round3 = (n: number) => Math.round(n * 1000) / 1000;
  return Object.entries(acc)
    .map(([code, v]) => ({ code, v, qty: round3(Math.min(v.qty, articleNet[code] ?? v.qty)) }))
    .filter(({ qty }) => qty > 0)
    .map(({ code, v, qty }) => ({ locationCode: code, locationId: v.locId, quantity: qty, firstInDate: v.firstIn }))
    .sort((a, b) => a.firstInDate.localeCompare(b.firstInDate) || compareLocationCodes(a.locationCode, b.locationCode));
}

export type OutboundAllocation = {
  locationCode: string;
  locationId?: string;
  quantity: number;
};

/**
 * Répartit automatiquement une quantité à sortir sur les emplacements qui contiennent
 * réellement l'article, du plus ancien dépôt au plus récent (FIFO). Aucune question posée à
 * l'utilisateur : c'est le choix retenu pour ne pas ralentir la caisse.
 *
 * `unallocated` porte ce qui n'a pas pu être adressé — soit parce que l'article a du stock
 * entré avant la mise en place des emplacements, soit parce que les emplacements n'en
 * contiennent pas assez. L'appelant écrit alors un mouvement sans emplacement pour ce reste,
 * plutôt que de rendre un emplacement négatif.
 *
 * Avec une variante, on ne puise que dans les emplacements de CETTE variante. Si aucun n'en
 * contient, tout sort sans emplacement : prendre dans le rack d'une autre couleur serait une
 * adresse inventée.
 */
export function allocateOutbound(params: {
  movements: any[];
  storeId: string;
  articleId: string;
  quantity: number;
  variant?: StockVariant | null;
}): { allocations: OutboundAllocation[]; unallocated: number } {
  const total = Number(params.quantity) || 0;
  if (total <= 0) return { allocations: [], unallocated: 0 };

  const buckets = computeArticleLocationStock(params.movements, params.storeId, params.articleId, params.variant);
  const allocations: OutboundAllocation[] = [];
  let remaining = total;

  for (const b of buckets) {
    if (remaining <= 0) break;
    const take = Math.round(Math.min(remaining, b.quantity) * 1000) / 1000;
    if (take <= 0) continue;
    allocations.push({ locationCode: b.locationCode, locationId: b.locationId, quantity: take });
    remaining = Math.round((remaining - take) * 1000) / 1000;
  }

  // Arrondi défensif : les quantités peuvent être décimales (mètres, yards).
  const unallocated = Math.round(Math.max(0, remaining) * 1000) / 1000;
  return { allocations, unallocated };
}

/**
 * Transforme une sortie en une ou plusieurs lignes de mouvement adressées : chaque ligne porte
 * l'emplacement d'où la marchandise est réellement prise, choisi automatiquement en FIFO.
 * Le reliquat non adressable (stock entré avant la mise en place des emplacements) sort sur une
 * ligne sans emplacement, pour ne jamais rendre un rack négatif.
 *
 * `base` contient tous les champs communs du mouvement SAUF quantity/locationCode/locationId.
 * `variant` restreint la FIFO aux emplacements de la couleur / qualité / taille sortie.
 */
export function splitOutboundLines<T extends Record<string, any>>(
  movements: any[], storeId: string, articleId: string, quantity: number, base: T,
  variant?: StockVariant | null
): (T & { quantity: number; locationCode?: string; locationId?: string })[] {
  const qty = Number(quantity) || 0;
  if (qty <= 0) return [];

  const { allocations, unallocated } = allocateOutbound({ movements, storeId, articleId, quantity: qty, variant });
  const lines = allocations.map(a => ({
    ...base,
    quantity: a.quantity,
    locationCode: a.locationCode,
    ...(a.locationId ? { locationId: a.locationId } : {}),
  }));

  if (unallocated > 0) lines.push({ ...base, quantity: unallocated } as any);
  // Aucun emplacement connu pour cet article : mouvement unique, comportement d'avant.
  return lines.length > 0 ? lines : [{ ...base, quantity: qty }];
}

/** Une part d'entrée affectée manuellement à un emplacement : « 200 000 yds en A-01-01 ». */
export type InboundAllocation = {
  locationCode: string;
  locationId?: string;
  quantity: number;
};

/** Ce qui reste à placer une fois les parts saisies déduites du total à ranger. */
export function remainingToAllocate(total: number, allocations: InboundAllocation[]): number {
  const placed = (allocations || []).reduce((s, a) => s + (Number(a.quantity) || 0), 0);
  return Math.round(((Number(total) || 0) - placed) * 1000) / 1000;
}

/**
 * Répartit des lignes de mouvement d'ENTRÉE sur plusieurs emplacements choisis par
 * l'utilisateur. Un arrivage d'une même référence remplit rarement un seul rack : on remplit
 * le premier emplacement jusqu'à sa part, puis le suivant, en coupant une ligne en deux quand
 * elle est à cheval.
 *
 * Ce qui dépasse les parts saisies ressort sans emplacement — comme en sortie, on préfère un
 * trou visible à une adresse inventée.
 */
export function distributeInboundRows<T extends { quantity: number }>(
  rows: T[], allocations: InboundAllocation[]
): (T & { locationCode?: string; locationId?: string })[] {
  const buckets = (allocations || [])
    .filter(a => a.locationCode && (Number(a.quantity) || 0) > 0)
    .map(a => ({ ...a, left: Number(a.quantity) || 0 }));

  if (buckets.length === 0) return rows.map(r => ({ ...r }));

  const out: (T & { locationCode?: string; locationId?: string })[] = [];
  let bi = 0;

  for (const row of rows) {
    let left = Number(row.quantity) || 0;
    if (left <= 0) { out.push({ ...row }); continue; }

    while (left > 0 && bi < buckets.length) {
      if (buckets[bi].left <= 0) { bi++; continue; }
      const take = Math.min(left, buckets[bi].left);
      out.push({
        ...row,
        quantity: Math.round(take * 1000) / 1000,
        locationCode: buckets[bi].locationCode,
        ...(buckets[bi].locationId ? { locationId: buckets[bi].locationId } : {}),
      });
      // Arrondi à chaque pas : 0.1 + 0.2 ≠ 0.3 laisserait sinon un reliquat fantôme, écrit
      // comme un mouvement de quantité 0.
      buckets[bi].left = Math.round((buckets[bi].left - take) * 1000) / 1000;
      left = Math.round((left - take) * 1000) / 1000;
    }

    // Reliquat au-delà des parts saisies : rangé nulle part, mais bien entré en stock.
    if (left > 0) out.push({ ...row, quantity: Math.round(left * 1000) / 1000 });
  }

  return out;
}

/**
 * Emplacement à proposer pour une ENTRÉE quand le formulaire n'offre pas de choix explicite
 * (retour client, ajustement d'inventaire…) : celui où l'article se trouve déjà, à condition
 * qu'il n'y en ait qu'un. Sinon on préfère ne rien décider.
 *
 * Avec une variante, « un seul emplacement » s'entend pour CETTE variante : un retour de Bleu
 * revient dans le rack du Bleu, même si le Rouge du même article est rangé ailleurs.
 */
export function suggestInboundLocation(
  movements: any[], storeId: string, articleId: string, variant?: StockVariant | null
): { locationCode: string; locationId?: string } | null {
  const buckets = computeArticleLocationStock(movements, storeId, articleId, variant);
  if (buckets.length !== 1) return null;
  return { locationCode: buckets[0].locationCode, locationId: buckets[0].locationId };
}

/** Ce qu'un emplacement contient, variante par variante. */
export type LocationContentLine = {
  articleId: string;
  productName?: string;
  color?: string;
  size?: string;
  quality?: string;
  quantity: number;
};

/**
 * Contenu d'un emplacement détaillé par article ET par variante (« Rouge 120, Bleu 80 »),
 * dérivé des mouvements. Sans storeId, tous lieux confondus, comme computeLocationOccupancy.
 *
 * `dimensionOf` donne la dimension ventilée de chaque article (articleVariantDimension) : seule
 * cette dimension distingue alors les variantes, car l'entrée d'une qualité peut écrire
 * color='various' là où la vente écrit la couleur de la ligne. Sans elle (ou pour un article
 * inconnu, `undefined`), les trois champs servent de clé, « various » y comptant pour vide.
 */
export function computeLocationContents(
  movements: any[], locationCode: string, storeId?: string,
  dimensionOf?: (articleId: string) => VariantDimension | null | undefined
): LocationContentLine[] {
  const acc: Record<string, LocationContentLine> = {};
  const clean = (v: unknown) => (v && !isVarious(v) ? String(v) : undefined);
  for (const m of movements || []) {
    if (!m || m.locationCode !== locationCode) continue;
    if (storeId) {
      const place = m.type === 'IN' && m.reason === 'TRANSFERT' ? (m.toStoreId || m.storeId) : m.storeId;
      if (place !== storeId) continue;
    }
    const articleId = String(m.articleId || '');
    const dimension = dimensionOf?.(articleId);
    let key: string;
    let fields: Pick<LocationContentLine, 'color' | 'size' | 'quality'>;
    if (dimension === undefined) {
      fields = { color: clean(m.color), size: clean(m.size), quality: clean(m.quality) };
      key = [articleId, fields.color, fields.size, fields.quality].map(normalizeVariantValue).join('|');
    } else if (dimension === null) {
      // Article non ventilé : une seule ligne, ses attributs ne servent qu'à l'affichage.
      fields = { color: clean(m.color), size: clean(m.size), quality: clean(m.quality) };
      key = articleId;
    } else {
      const value = clean(m[dimension]);
      fields = value ? { [dimension]: value } : {};
      key = `${articleId}|${dimension}:${normalizeVariantValue(value)}`;
    }
    const line = (acc[key] ||= {
      articleId,
      productName: m.productName || m.nameFR || undefined,
      ...fields,
      quantity: 0,
    });
    const qty = Number(m.quantity) || 0;
    line.quantity = Math.round((line.quantity + (m.type === 'OUT' ? -qty : qty)) * 1000) / 1000;
  }
  return Object.values(acc)
    .filter(l => l.quantity > 0)
    .sort((a, b) =>
      String(a.productName || '').localeCompare(String(b.productName || '')) ||
      String(a.quality || a.color || a.size || '').localeCompare(String(b.quality || b.color || b.size || ''))
    );
}

/** Tri naturel des codes : A-02-10 après A-02-09, et A-10 après A-09. */
export function compareLocationCodes(a: string, b: string): number {
  const pa = String(a || '').split('-');
  const pb = String(b || '').split('-');
  const len = Math.max(pa.length, pb.length);
  for (let i = 0; i < len; i++) {
    const sa = pa[i] ?? '';
    const sb = pb[i] ?? '';
    const na = Number(sa);
    const nb = Number(sb);
    const bothNumeric = sa !== '' && sb !== '' && !isNaN(na) && !isNaN(nb);
    const cmp = bothNumeric ? na - nb : sa.localeCompare(sb);
    if (cmp !== 0) return cmp;
  }
  return 0;
}

/**
 * Lignes de marchandise d'un dossier d'arrivage qui n'ont aucun mouvement d'entrée : une par
 * variante déclarée (qualité, sinon couleur, sinon taille), une pour un article sans ventilation.
 *
 * Compter dossier par dossier (« a-t-il au moins un mouvement ? ») ne suffit pas : une entrée
 * à moitié écrite — le cas des couleurs, dont les quantités vivent dans `rolls` et n'écrivaient
 * aucun mouvement — passait pour complète, et la marchandise manquante n'entrait jamais.
 * Une ventilation entièrement à zéro n'a rien à entrer : la compter bloquerait le dossier dans
 * la liste de réparation à jamais.
 *
 * @param articles  les articles du dossier
 * @param mouvements les mouvements rattachés au dossier (les non-IN sont ignorés)
 */
export function lignesEntreeManquantes(articles: any[], mouvements: any[]): number {
  const parArticle = new Map<string, any[]>();
  for (const m of mouvements || []) {
    if (m?.type !== 'IN') continue;
    const cle = String(m?.articleId || '');
    const liste = parArticle.get(cle);
    if (liste) liste.push(m); else parArticle.set(cle, [m]);
  }

  let manquantes = 0;
  for (const article of articles || []) {
    const attendues = articleInboundVariants(article);
    if (attendues.length === 0) continue;
    const faites = parArticle.get(String(article?.id ?? '')) || [];
    const dimension = articleVariantDimension(article);
    if (!dimension) {
      if (faites.length === 0) manquantes++;
      continue;
    }
    // Comparaison normalisée comme dans le calcul du stock : une casse retouchée après coup ne
    // doit pas faire passer un dossier correct pour incomplet.
    const libelles = new Set(faites.map(m => normalizeVariantValue(m?.[dimension])));
    manquantes += attendues.filter(l => !libelles.has(normalizeVariantValue(l.label))).length;
  }
  return manquantes;
}
