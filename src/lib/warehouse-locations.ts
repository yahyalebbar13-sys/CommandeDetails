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
