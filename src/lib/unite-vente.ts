// Ce qu'on achète pour le prix affiché (« le rouleau de 50 m », « le lot de 100 pièces »…)
// et, quand c'est sûr, le prix ramené à l'unité utile (« soit 16 DH le mètre »).
//
// Tout se lit dans la fiche saisie dans l'admin : le nom, « Cond. unité », « Packaging »,
// « Longueur », « Spécification », le modèle et la taille de la variante, et les phrases
// « Vendu en … » des textes. Règle d'or : mieux vaut rien que faux. Si deux sources se
// contredisent (titre « 50 m », texte « 100 m/rlx »), on n'affiche rien, ni unité ni prix
// unitaire (lireUniteVente donne la raison du doute). Rien non plus si la fiche dit « vendu
// au mètre » : le prix est déjà au mètre, le diviser par la longueur du rouleau serait faux.
// Le carton de gros (« Cond. gros ») n'est jamais lu : ce n'est pas ce que le client achète.
//
// Fonctions pures, sans React ni Firebase.

import type { ProductVariant, ShopProduct } from './shop-types';
import type { Language } from './translations';
import { variantesAchetables } from './shop-variantes';

export type Contenant = 'rouleau' | 'bobine' | 'cone' | 'lot' | 'pack' | 'sachet' | 'boite' | 'assortiment';
// Ce qu'on compte dans un lot
export type Element = 'piece' | 'bobine' | 'rouleau' | 'ensemble';

export interface UniteVente {
  contenant: Contenant;
  // Lot, pack, sachet… : combien d'éléments
  nombre?: number;
  element?: Element;
  // « 10 grosses » écrit à côté de 1440 pièces
  grosses?: number;
  // Rouleau, bobine : longueur en mètres (et en yards si c'est ainsi qu'elle est vendue)
  metres?: number;
  yards?: number;
  // Pack de 10 rouleaux de 20 m : la longueur de chaque rouleau
  metresParElement?: number;
  // Bobine de 1 kg
  kg?: number;
}

// ─── Corrections confirmées par le patron ───────────────────────────────────
// Elles l'emportent sur tout ce qui est écrit dans la fiche. Retirer une ligne
// quand la fiche a été corrigée dans l'admin.
export const CORRECTIONS_UNITE: Record<string, UniteVente> = {
  // Doublure 210T Largeur 1m50 : 100 m par rouleau (confirmé le 02/10/2026).
  // Le titre, « Cond. unité », « Longueur » et le texte commercial disent encore 50 m.
  custom_1780595583026_yc5ik: { contenant: 'rouleau', metres: 100 },
};

// ─── Lecture des textes ─────────────────────────────────────────────────────

const YARD = 0.9144;
const GROSSE = 144;

type Constat =
  | { type: 'nombre'; n: number; element: Element | null; contenant: Contenant | null; grosses?: number; metresParElement?: number }
  | { type: 'longueur'; metres: number; yards?: number; contenant: Contenant | null }
  | { type: 'poids'; kg: number; contenant: Contenant }
  | { type: 'contenant'; contenant: Contenant };

// Début d'un mot ou d'un nombre. Pas d'assertion arrière (« lookbehind ») dans ce fichier : Safari ne la
// comprend qu'à partir d'iOS 16.4, et sur un iPhone plus ancien toute la fiche planterait.
// Le caractère d'avant est donc pris dans la correspondance, dans un groupe non capturant
// (m[1], m[2]… ne bougent pas). Pas de matchAll non plus (Safari 13) : voir correspondances.
const DEBUT_MOT = '(?:^|[^a-z])';
const DEBUT_NOMBRE = '(?:^|[^a-z0-9.,])';
const DEBUT_NOMBRE_SEUL = '(?:^|[^a-z0-9.,/])';

// Toutes les correspondances d'une expression à drapeau g
function correspondances(s: string, re: RegExp): RegExpExecArray[] {
  const liste: RegExpExecArray[] = [];
  re.lastIndex = 0;
  for (let m = re.exec(s); m; m = re.exec(s)) {
    liste.push(m);
    if (m[0] === '') re.lastIndex++;
  }
  return liste;
}

// Minuscules, sans accents ; « mètre ruban » (l'outil de mesure) n'est pas une longueur
function normaliser(texte: string): string {
  return texte
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[’`]/g, "'")
    .replace(/(\d+)\s*metres?\s+ruban/g, '$1 pieces')
    // « (1 grosse = 144 pièces) » : une définition, pas une quantité vendue
    .replace(/\([^()]*=[^()]*\)/g, ' ')
    // Le carton ou le sac de gros (« carton de 10 rouleaux », « 8pcs/ctn ») n'est pas ce qu'on achète
    .replace(/(^|[^a-z])(?:cartons?|ctn|sacs?|sackbag)\s*(?:de\s+|d'|:\s*|\(\s*)?\d+\s*[a-z-]*/g, '$1 ')
    .replace(/\d+\s*[a-z]*\s*\/\s*(?:ctn|cartons?)(?![a-z])/g, ' ');
}

const MOT_CONTENANT = 'rouleaux|rouleau|rlx|roll|bobines|bobine|cones|cone|lots|lot|packs|pack|paquets|paquet|sachets|sachet|boites|boite|assortiments|assortiment';
const MOT_LONGUEUR = 'metres|metre|meters|meter|m|yards|yard|yds|yd';
const MOT_ELEMENT = 'pieces|piece|pcs|pc|unites|unite|ensembles|ensemble|sets|set|bobines|bobine|rouleaux|rouleau|boutons|bouton|aiguilles|aiguille';

function contenantDe(mot: string): Contenant {
  if (/^(rouleau|rlx|roll)/.test(mot)) return 'rouleau';
  if (mot.startsWith('bobine')) return 'bobine';
  if (mot.startsWith('cone')) return 'cone';
  if (mot.startsWith('lot')) return 'lot';
  if (mot.startsWith('pack') || mot.startsWith('paquet')) return 'pack';
  if (mot.startsWith('sachet')) return 'sachet';
  if (mot.startsWith('boite')) return 'boite';
  return 'assortiment';
}

function elementDe(mot: string): Element {
  if (mot.startsWith('bobine')) return 'bobine';
  if (mot.startsWith('rouleau')) return 'rouleau';
  if (mot.startsWith('ensemble') || mot.startsWith('set')) return 'ensemble';
  return 'piece';
}

const nombreDe = (texte: string) => parseFloat(texte.replace(',', '.'));
const estLongueur = (mot: string) => new RegExp(`^(${MOT_LONGUEUR})$`).test(mot);
const enMetres = (n: number, unite: string) => (/^y/.test(unite) ? { metres: n * YARD, yards: n } : { metres: n });

// « Rouleau de 50 m », « Sachet (50 pcs) », « Pack de 10 rouleaux de 20 m », « Bobine de 1 kg »,
// « Pack de 10 grosses »
function lireContenants(s: string, constats: Constat[]) {
  const re = new RegExp(
    `${DEBUT_MOT}(${MOT_CONTENANT})\\s*(?:de\\s+|d'|:\\s*|\\(\\s*)?(\\d+(?:[.,]\\d+)?)\\s*([a-z][a-z-]*)?(?:\\s+de\\s+(\\d+(?:[.,]\\d+)?)\\s*(${MOT_LONGUEUR})(?![a-z0-9]))?`,
    'g',
  );
  for (const m of correspondances(s, re)) {
    const contenant = contenantDe(m[1]);
    const n = nombreDe(m[2]);
    const mot = m[3] || '';
    if (/^\d/.test(s.slice((m.index || 0) + m[0].length))) continue; // « 1m50 » : une largeur
    if (estLongueur(mot)) {
      constats.push({ type: 'longueur', ...enMetres(n, mot), contenant });
    } else if (mot === 'kg' || mot === 'g') {
      constats.push({ type: 'poids', kg: mot === 'kg' ? n : n / 1000, contenant });
    } else if (
      Number.isInteger(n) &&
      (mot === '' ? !['rouleau', 'bobine', 'cone'].includes(contenant) : mot.length >= 4 || new RegExp(`^(${MOT_ELEMENT})$`).test(mot))
    ) {
      // Un nombre d'éléments, jamais une mesure : « rouleau de 5 cm » est une largeur,
      // « rouleau de 25 » ne dit pas de quoi
      const grosses = /^gross/.test(mot);
      const sous = m[4] ? enMetres(nombreDe(m[4]), m[5]).metres : undefined;
      constats.push({
        type: 'nombre',
        n: grosses ? n * GROSSE : n,
        element: mot && !grosses ? elementDe(mot) : null,
        contenant,
        ...(grosses && { grosses: n }),
        ...(sous && { metresParElement: sous }),
      });
    }
  }
}

// « 100 pièces », « 1440pièces », « 1000 Ensembles/Sachet », « 10Gross », « Sachet individuel »
function lireNombres(s: string, constats: Constat[]) {
  const re = new RegExp(`${DEBUT_NOMBRE_SEUL}(\\d+)\\s*(${MOT_ELEMENT})(?![a-z])(?:\\s*\\/\\s*(${MOT_CONTENANT})(?![a-z]))?`, 'g');
  for (const m of correspondances(s, re)) {
    constats.push({ type: 'nombre', n: Number(m[1]), element: elementDe(m[2]), contenant: m[3] ? contenantDe(m[3]) : null });
  }
  for (const m of correspondances(s, new RegExp(`${DEBUT_NOMBRE}(\\d+)\\s*(?:grosses|grosse|gross)(?![a-z])`, 'g'))) {
    constats.push({ type: 'nombre', n: Number(m[1]) * GROSSE, element: 'piece', contenant: null, grosses: Number(m[1]) });
  }
  for (const m of correspondances(s, new RegExp(`${DEBUT_MOT}(${MOT_CONTENANT})\\s+(?:individuel|individuelle|unitaire)(?![a-z])`, 'g'))) {
    constats.push({ type: 'nombre', n: 1, element: null, contenant: contenantDe(m[1]) });
  }
}

// « 100m/rlx », « 90yds/rlx », « 100 Yards/Roll », « 20 m par rouleau »
function lireLongueursParRouleau(s: string, constats: Constat[]) {
  const re = new RegExp(`${DEBUT_NOMBRE}(\\d+(?:[.,]\\d+)?)\\s*(${MOT_LONGUEUR})\\s*(?:\\/|par\\s+)\\s*(rlx|rouleaux|rouleau|roll|bobines|bobine)(?![a-z])`, 'g');
  for (const m of correspondances(s, re)) {
    constats.push({ type: 'longueur', ...enMetres(nombreDe(m[1]), m[2]), contenant: contenantDe(m[3]) });
  }
}

// Toute longueur en mètres ou en yards (pas « 75 cm », pas « 25 mm », pas « 1m50 »)
function lireLongueurs(s: string, constats: Constat[]) {
  const re = new RegExp(`${DEBUT_NOMBRE_SEUL}(\\d+(?:[.,]\\d+)?)\\s*(${MOT_LONGUEUR})(?![a-z0-9²])`, 'g');
  for (const m of correspondances(s, re)) constats.push({ type: 'longueur', ...enMetres(nombreDe(m[1]), m[2]), contenant: null });
}

// « Rouleau filmé », « Bobine de cordon », « Cône »
function lireContenantSeul(s: string, constats: Constat[]) {
  for (const m of correspondances(s, new RegExp(`${DEBUT_MOT}(rouleau|bobine|cone)(?![a-z])`, 'g'))) {
    constats.push({ type: 'contenant', contenant: contenantDe(m[1]) });
  }
}

// Champ structuré (nom, conditionnement, longueur…) : tout ce qu'il dit
function lireChamp(texte: string, constats: Constat[]) {
  const s = normaliser(texte);
  lireContenants(s, constats);
  lireNombres(s, constats);
  lireLongueursParRouleau(s, constats);
  lireLongueurs(s, constats);
  lireContenantSeul(s, constats);
}

// Texte libre (description, info commerciale) : seulement « vendu en … » et « … m/rlx »
function lireTexteLibre(texte: string, constats: Constat[]) {
  const s = normaliser(texte);
  lireLongueursParRouleau(s, constats);
  // Jusqu'à la première virgule ou au premier point, sauf ceux d'un nombre (« 91,4 m ») :
  // « vendu en rouleau de 45 m, regroupés en carton de 10 rouleaux »
  for (const m of correspondances(s, new RegExp(`${DEBUT_MOT}vendu(?:e|s|es)?(?![a-z])((?:[^.,;:!?\\n]|[.,](?=\\d))*)`, 'g'))) {
    const clause = m[1];
    lireContenants(clause, constats);
    lireNombres(clause, constats);
    lireLongueurs(clause, constats);
  }
}

const chaine = (v: unknown) => (typeof v === 'string' ? v : '');

// Les textes lus, par ordre d'autorité (le premier qui nomme le contenant le donne).
// true : champ structuré, lu en entier ; false : texte libre (lireTexteLibre).
// Le type de produit et les mots-clés ne sont pas lus (« fermeture au mètre » y décrit un rouleau).
function sourcesDe(product: ShopProduct, variant: ProductVariant | null | undefined): Array<[string, boolean]> {
  // Champ de la variante s'il est rempli, sinon celui du produit
  const champ = (cle: 'conditionnementUnitaire' | 'packaging' | 'longueur' | 'specification' | 'informationCommerciale' | 'description' | 'shortDescription') =>
    chaine(variant?.[cle]).trim() || chaine(product[cle]);
  return [
    [champ('conditionnementUnitaire'), true],
    [champ('packaging'), true],
    [product.name, true],
    [chaine(variant?.model), true],
    [chaine(variant?.size), true],
    [champ('longueur'), true],
    [champ('specification'), true],
    [champ('informationCommerciale'), false],
    [champ('shortDescription'), false],
    [champ('description'), false],
  ];
}

// « Vendu au mètre », « prix au mètre », « vente au m² » : le prix affiché est déjà au mètre ;
// le diviser par la longueur du rouleau donnerait un faux prix
const PRIX_AU_METRE = /(?:^|[^a-z])(?:vendue?s?|prix|vente|tarif)\s+(?:au|par|du)\s+(?:metres?|m2|m²|m)(?![a-z0-9])/;

// ─── Décision ───────────────────────────────────────────────────────────────

export type LectureUnite = { unite: UniteVente | null; doute?: string };

const proches = (a: number, b: number) => Math.abs(a - b) <= 0.01 * Math.max(a, b);
const toutesProches = (valeurs: number[]) => valeurs.every(v => proches(v, valeurs[0]));

// Ce que dit la fiche, avec la raison d'un doute (pour le test et les listes à corriger)
export function lireUniteVente(product: ShopProduct, variant?: ProductVariant | null): LectureUnite {
  const correction = CORRECTIONS_UNITE[product.id];
  if (correction) return { unite: correction };

  const sources = sourcesDe(product, variant).filter(([texte]) => texte);
  if (sources.some(([texte]) => PRIX_AU_METRE.test(normaliser(texte)))) return { unite: null, doute: 'vendu au mètre' };
  const constats: Constat[] = [];
  for (const [texte, structure] of sources) (structure ? lireChamp : lireTexteLibre)(texte, constats);
  const nombres = constats.filter((c): c is Extract<Constat, { type: 'nombre' }> => c.type === 'nombre');
  const lots = nombres.filter(c => c.n >= 2);
  const seuls = nombres.filter(c => c.n === 1);
  const longueurs = constats.filter((c): c is Extract<Constat, { type: 'longueur' }> => c.type === 'longueur');
  const contenants = constats.flatMap(c => (c.type === 'nombre' || c.type === 'longueur' ? (c.contenant ? [c.contenant] : []) : [c.contenant]));

  // Vendu par lot : tous les nombres doivent être les mêmes
  if (lots.length > 0) {
    const valeurs = Array.from(new Set(lots.map(c => c.n)));
    if (valeurs.length > 1) return { unite: null, doute: `quantités différentes : ${valeurs.join(' / ')}` };
    if (seuls.length > 0) return { unite: null, doute: `vendu à l'unité et par ${valeurs[0]}` };
    const element = lots.find(c => c.element && c.element !== 'piece')?.element || 'piece';
    const contenant = lots.find(c => c.contenant)?.contenant || 'lot';
    const grosses = lots.find(c => c.grosses)?.grosses;
    // Longueur de chaque rouleau ou bobine du lot, si toutes les sources la donnent pareille
    const sousLongueurs = [
      ...lots.flatMap(c => (c.metresParElement ? [c.metresParElement] : [])),
      ...longueurs.map(c => c.metres),
    ];
    const metresParElement =
      (element === 'rouleau' || element === 'bobine') && sousLongueurs.length > 0 && toutesProches(sousLongueurs)
        ? sousLongueurs[0]
        : undefined;
    return {
      unite: {
        contenant,
        nombre: valeurs[0],
        element,
        ...(grosses && { grosses }),
        ...(metresParElement && { metresParElement }),
      },
    };
  }

  // Vendu au rouleau (ou à la bobine) : une longueur, la même partout
  const rouleau = contenants.find(c => c === 'rouleau' || c === 'bobine' || c === 'cone');
  if (longueurs.length > 0 && rouleau) {
    const valeurs = longueurs.map(c => c.metres);
    if (!toutesProches(valeurs)) {
      const affiche = Array.from(new Set(valeurs.map(v => Math.round(v * 10) / 10)));
      return { unite: null, doute: `longueurs différentes : ${affiche.join(' m / ')} m` };
    }
    const enYards = longueurs.find(c => c.yards);
    return {
      unite: enYards
        ? { contenant: rouleau, metres: enYards.metres, yards: enYards.yards }
        : { contenant: rouleau, metres: valeurs[0] },
    };
  }

  // Bobine de 1 kg
  const poids = constats.filter((c): c is Extract<Constat, { type: 'poids' }> => c.type === 'poids');
  if (poids.length > 0) {
    if (!toutesProches(poids.map(c => c.kg))) return { unite: null, doute: 'poids différents' };
    return { unite: { contenant: poids[0].contenant, kg: poids[0].kg } };
  }

  // Seulement le contenant : « Vendu par rouleau »
  if (rouleau) return { unite: { contenant: rouleau } };
  return { unite: null };
}

const memeUnite = (a: UniteVente | null, b: UniteVente | null) => JSON.stringify(a) === JSON.stringify(b);

// Unité d'un produit pour une variante choisie ; sans variante, celle que toutes
// les variantes partagent (sinon rien tant que le client n'a pas choisi).
export function uniteDeVente(product: ShopProduct, variant?: ProductVariant | null): UniteVente | null {
  if (variant) return lireUniteVente(product, variant).unite;
  const variantes = variantesAchetables(product.variants);
  if (variantes.length === 0) return lireUniteVente(product, null).unite;
  const unites = variantes.map(v => lireUniteVente(product, v).unite);
  return unites.every(u => memeUnite(u, unites[0])) ? unites[0] : null;
}

// ─── Prix unitaire ──────────────────────────────────────────────────────────

export type ParUnite = 'metre' | Element;

export interface PrixUnitaire {
  montant: number;
  par: ParUnite;
}

// Prix ramené au mètre (rouleau) ou à l'élément (lot) ; rien pour une bobine au poids,
// un contenant sans quantité ou un produit sans prix
export function prixUnitaire(unite: UniteVente | null, prix: number): PrixUnitaire | null {
  if (!unite || !(prix > 0)) return null;
  const pu: PrixUnitaire | null =
    unite.nombre && unite.nombre >= 2 ? { montant: prix / unite.nombre, par: unite.element || 'piece' }
    : unite.metres && unite.metres >= 2 ? { montant: prix / unite.metres, par: 'metre' }
    : null;
  // Moins d'un millième de dirham : ce chiffre n'aide personne
  return pu && pu.montant >= 0.001 ? pu : null;
}

// ─── Textes ─────────────────────────────────────────────────────────────────

const CONTENANT_FR: Record<Contenant, string> = {
  rouleau: 'rouleau', bobine: 'bobine', cone: 'cône', lot: 'lot', pack: 'pack', sachet: 'sachet', boite: 'boîte', assortiment: 'assortiment',
};
const CONTENANT_AR: Record<Contenant, string> = {
  rouleau: 'لفافة', bobine: 'بكرة', cone: 'بكرة', lot: 'مجموعة', pack: 'حزمة', sachet: 'كيس', boite: 'علبة', assortiment: 'تشكيلة',
};
// Singulier, pluriel
const ELEMENT_FR: Record<Element, [string, string]> = {
  piece: ['pièce', 'pièces'], bobine: ['bobine', 'bobines'], rouleau: ['rouleau', 'rouleaux'], ensemble: ['ensemble', 'ensembles'],
};
// Singulier (après 1, 2 et à partir de 11), pluriel (de 3 à 10)
const ELEMENT_AR: Record<Element, [string, string]> = {
  piece: ['قطعة', 'قطع'], bobine: ['بكرة', 'بكرات'], rouleau: ['لفافة', 'لفافات'], ensemble: ['طقم', 'أطقم'],
};
// « le mètre », « la pièce »… et « للمتر », « للقطعة »…
const PAR_FR: Record<ParUnite, string> = { metre: 'le mètre', piece: 'la pièce', bobine: 'la bobine', rouleau: 'le rouleau', ensemble: "l'ensemble" };
const PAR_AR: Record<ParUnite, string> = { metre: 'للمتر', piece: 'للقطعة', bobine: 'للبكرة', rouleau: 'للفافة', ensemble: 'للطقم' };

const motAr = (n: number, [singulier, pluriel]: [string, string]) => (n >= 3 && n <= 10 ? pluriel : singulier);

// 82.296 → « 82,3 » ; 50 → « 50 »
function longueur(metres: number): string {
  return String(Math.round(metres * 10) / 10).replace('.', ',');
}

// Montant en DH : « 16 », « 4,50 », « 0,11 » ; sous 0,10 DH, deux chiffres significatifs
// (« 0,039 », « 0,005 », « 0,0012 ») : jamais « 0,00 »
export function montantDH(montant: number): string {
  const arrondi = montant < 0.1 ? Number(montant.toPrecision(2)) : montant;
  if (arrondi >= 0.1) {
    const deux = arrondi.toFixed(2);
    return (deux.endsWith('.00') ? deux.slice(0, -3) : deux).replace('.', ',');
  }
  return String(arrondi).replace('.', ',');
}

// « Vendu par rouleau de 50 m » / « يُباع: لفافة من 50 متر »
export function texteUnite(unite: UniteVente, language: Language): string {
  const ar = language === 'ar';
  const contenant = (ar ? CONTENANT_AR : CONTENANT_FR)[unite.contenant];
  let quantite = '';
  if (unite.nombre) {
    const element = unite.element || 'piece';
    if (ar) {
      quantite = `${unite.nombre} ${motAr(unite.nombre, ELEMENT_AR[element])}`;
      if (unite.metresParElement) quantite += ` (${longueur(unite.metresParElement)} متر لكل ${ELEMENT_AR[element][0]})`;
    } else {
      quantite = `${unite.nombre} ${ELEMENT_FR[element][1]}`;
      if (unite.metresParElement) quantite += ` de ${longueur(unite.metresParElement)} m`;
      if (unite.grosses) quantite += ` (${unite.grosses} grosse${unite.grosses > 1 ? 's' : ''})`;
    }
  } else if (unite.metres) {
    quantite = unite.yards
      ? ar ? `${unite.yards} ياردة (${longueur(unite.metres)} متر)` : `${unite.yards} yards (${longueur(unite.metres)} m)`
      : ar ? `${longueur(unite.metres)} متر` : `${longueur(unite.metres)} m`;
  } else if (unite.kg) {
    quantite = ar ? `${String(unite.kg).replace('.', ',')} كلغ` : `${String(unite.kg).replace('.', ',')} kg`;
  }
  if (ar) return quantite ? `يُباع: ${contenant} من ${quantite}` : `يُباع: ${contenant}`;
  return quantite ? `Vendu par ${contenant} de ${quantite}` : `Vendu par ${contenant}`;
}

// « soit 16 DH le mètre » / « أي 16 درهم للمتر » ; « soit à partir de … » quand le prix est « À partir de »
export function textePrixUnitaire(pu: PrixUnitaire, language: Language, aPartirDe = false): string {
  const montant = montantDH(pu.montant);
  if (language === 'ar') return `أي ${aPartirDe ? 'ابتداءً من ' : ''}${montant} درهم ${PAR_AR[pu.par]}`;
  return `soit ${aPartirDe ? 'à partir de ' : ''}${montant} DH ${PAR_FR[pu.par]}`;
}
