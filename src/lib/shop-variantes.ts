// Choix des variantes de la boutique (modèle, taille, couleur).
// Une seule logique pour la fiche produit, les cartes produit et la page promotions :
// doublons écartés, libellés FR / AR, combinaisons possibles, prix (ou « Prix sur demande ») et ligne de panier.
// Ce fichier n'importe pas shop-utils (qui l'importe) pour éviter un cycle.

import { lienComplet, lienProduit } from './liens-boutique';
import type { CartItem, ProductVariant, ShopProduct } from './shop-types';
import type { Language } from './translations';

export type DimVariante = 'model' | 'size' | 'color';

// Ordre d'affichage des blocs de choix
export const DIMENSIONS: DimVariante[] = ['model', 'size', 'color'];

// Au-delà de ce nombre de variantes, un produit à deux dimensions ou plus s'affiche
// en blocs séparés plutôt qu'en une seule liste de variantes complètes.
export const MAX_LISTE_UNIQUE = 8;

// Seuil « Stock limité », le même que l'admin (stockToStatus : 10 ou moins)
export const SEUIL_STOCK_LIMITE = 10;

// ─── Normalisation ──────────────────────────────────────────────────────────

export function norm(valeur?: string | null): string {
  return (valeur || '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}

export function cleDe(v: ProductVariant, dim: DimVariante): string {
  return norm(v[dim]);
}

// Prix facturé d'une variante (même règle que getVariantPrice de shop-utils)
export function prixDe(prixProduit: number, v?: ProductVariant | null): number {
  return typeof v?.price === 'number' && v.price > 0 ? v.price : prixProduit || 0;
}

// ─── Doublons ───────────────────────────────────────────────────────────────

// Une seule variante par combinaison modèle · taille · couleur : on garde celle en stock,
// puis celle qui a un prix, puis la première saisie. Elle prend la place de la première occurrence.
export function variantesAchetables(variants?: ProductVariant[] | null): ProductVariant[] {
  const parCle = new Map<string, ProductVariant>();
  for (const v of variants || []) {
    if (!v) continue;
    const cle = DIMENSIONS.map(d => cleDe(v, d)).join('|');
    const deja = parCle.get(cle);
    if (!deja) {
      parCle.set(cle, v);
      continue;
    }
    const meilleure =
      (v.stock > 0) !== (deja.stock > 0)
        ? (v.stock > 0 ? v : deja)
        : ((v.price || 0) > 0) !== ((deja.price || 0) > 0)
          ? ((v.price || 0) > 0 ? v : deja)
          : deja;
    parCle.set(cle, meilleure);
  }
  return Array.from(parCle.values());
}

// ─── Libellés ───────────────────────────────────────────────────────────────

const COULEURS_AR: Array<[string, string]> = [
  ['bleu marine', 'كحلي'],
  ['noir', 'أسود'],
  ['blanc', 'أبيض'],
  ['rouge', 'أحمر'],
  ['bleu', 'أزرق'],
  ['vert', 'أخضر'],
  ['jaune', 'أصفر'],
  ['orange', 'برتقالي'],
  ['rose', 'وردي'],
  ['violet', 'بنفسجي'],
  ['marron', 'بني'],
  ['gris', 'رمادي'],
  ['beige', 'بيج'],
  ['dore', 'ذهبي'],
  ['argente', 'فضي'],
  ['nickel', 'نيكل'],
  ['transparent', 'شفاف'],
  ['tabac', 'بني تبغي'],
];

// « TRANSPARENT » → « Transparent », « bleu marine » → « Bleu marine »
function majusculeInitiale(valeur: string): string {
  const v = valeur.trim().replace(/\s+/g, ' ');
  if (!v) return v;
  const lettres = v.replace(/[^A-Za-zÀ-ÿ]/g, '');
  const toutEnMajuscules = lettres.length >= 4 && lettres === lettres.toUpperCase();
  const base = toutEnMajuscules ? v.toLowerCase() : v;
  return base.charAt(0).toUpperCase() + base.slice(1);
}

export function libelleCouleur(v: ProductVariant, language: Language): string {
  const brut = (v.color || '').trim();
  if (!brut) return '';
  if (language !== 'ar') return majusculeInitiale(brut);
  if (v.colorAr?.trim()) return v.colorAr.trim();
  return couleurArabe(brut) || majusculeInitiale(brut);
}

// Traduction arabe d'un nom de couleur français, ou '' si inconnue.
// « Beige 308 » → « بيج 308 » ; « Option 3 » → « خيار 3 ».
export function couleurArabe(nom: string): string {
  const n = norm(nom);
  const numero = n.match(/^(option|couleur) (\d+)$/);
  if (numero) return `${numero[1] === 'option' ? 'خيار' : 'اللون'} ${numero[2]}`;
  const entree = COULEURS_AR.filter(([fr]) => n === fr || n.startsWith(`${fr} `)).sort((a, b) => b[0].length - a[0].length)[0];
  if (!entree) return '';
  const reste = nom.trim().replace(/\s+/g, ' ').slice(entree[0].length).trim();
  return reste ? `${entree[1]} ${reste}` : entree[1];
}

// « 15MM » → « 15mm », « NO5 » → « N°5 »
function formaterTaille(valeur: string): string {
  const v = valeur.trim();
  const mesure = v.match(/^(\d+(?:[.,]\d+)?)\s*(mm|cm|m|g|kg)$/i);
  if (mesure) return `${mesure[1]}${mesure[2].toLowerCase()}`;
  const numero = v.match(/^NO\s?(\d+)$/i);
  if (numero) return `N°${numero[1]}`;
  return v;
}

export function libelleTaille(v: ProductVariant, language: Language): string {
  const brut = (v.size || '').trim();
  if (!brut) return '';
  if (language === 'ar' && v.sizeAr?.trim()) return v.sizeAr.trim();
  return formaterTaille(brut);
}

export function libelleModele(v: ProductVariant, language: Language): string {
  const brut = (v.model || '').trim();
  if (!brut) return '';
  if (language === 'ar' && v.modelAr?.trim()) return v.modelAr.trim();
  return brut;
}

export function libelleValeur(v: ProductVariant, dim: DimVariante, language: Language): string {
  const texte = dim === 'color' ? libelleCouleur(v, language) : dim === 'size' ? libelleTaille(v, language) : libelleModele(v, language);
  return texte || (language === 'ar' ? 'قياسي' : 'Standard');
}

// ─── Analyse d'un produit ───────────────────────────────────────────────────

export interface ValeurDimension {
  cle: string;
  // Première variante achetable qui porte cette valeur (libellé, pastille, photo)
  exemple: ProductVariant;
}

export interface AnalyseVariantes {
  achetables: ProductVariant[];
  valeurs: Record<DimVariante, ValeurDimension[]>;
  // Dimensions à au moins deux valeurs : un bloc de choix chacune
  aChoisir: DimVariante[];
  // Dimensions à une seule valeur non vide : simple information
  fixes: DimVariante[];
  // Au moins deux blocs et peu de variantes : une seule liste de variantes complètes
  listeUnique: boolean;
  // Toutes les tailles sont des poids (140g, 350g…) : le bloc s'appelle « Grammage »
  grammage: boolean;
}

const MESURE = /^(\d+(?:[.,]\d+)?)\s*([a-z°]+)$/i;

function trierTailles(valeurs: ValeurDimension[]): ValeurDimension[] {
  const mesures = valeurs.map(val => (val.exemple.size || '').trim().match(MESURE));
  if (mesures.some(m => !m)) return valeurs;
  const unites = new Set(mesures.map(m => m![2].toLowerCase()));
  if (unites.size !== 1) return valeurs;
  const nombre = (i: number) => parseFloat(mesures[i]![1].replace(',', '.'));
  return valeurs
    .map((val, i) => ({ val, n: nombre(i), i }))
    .sort((a, b) => a.n - b.n || a.i - b.i)
    .map(x => x.val);
}

export function analyserVariantes(variants?: ProductVariant[] | null): AnalyseVariantes {
  const achetables = variantesAchetables(variants);
  const valeurs = {} as Record<DimVariante, ValeurDimension[]>;
  for (const dim of DIMENSIONS) {
    const vues = new Map<string, ValeurDimension>();
    for (const v of achetables) {
      const cle = cleDe(v, dim);
      if (!vues.has(cle)) vues.set(cle, { cle, exemple: v });
    }
    let liste = Array.from(vues.values());
    // Une dimension vide partout n'existe pas
    if (liste.length === 1 && liste[0].cle === '') liste = [];
    valeurs[dim] = dim === 'size' ? trierTailles(liste) : liste;
  }
  const aChoisir = DIMENSIONS.filter(d => valeurs[d].length >= 2);
  const fixes = DIMENSIONS.filter(d => valeurs[d].length === 1);
  const tailles = valeurs.size.map(val => (val.exemple.size || '').trim());
  return {
    achetables,
    valeurs,
    aChoisir,
    fixes,
    listeUnique: aChoisir.length >= 2 && achetables.length <= MAX_LISTE_UNIQUE,
    grammage: tailles.length > 0 && tailles.every(t => /\d\s*g$/i.test(t)),
  };
}

// Ordre des variantes dans une liste (liste unique, quantités) : modèle, taille, couleur
export function trierVariantes(analyse: AnalyseVariantes): ProductVariant[] {
  const rang = (dim: DimVariante, v: ProductVariant) => {
    const i = analyse.valeurs[dim].findIndex(val => val.cle === cleDe(v, dim));
    return i < 0 ? 0 : i;
  };
  return [...analyse.achetables].sort((a, b) => {
    for (const dim of DIMENSIONS) {
      const ecart = rang(dim, a) - rang(dim, b);
      if (ecart) return ecart;
    }
    return 0;
  });
}

// Libellé d'une variante sur les dimensions demandées (par défaut toutes celles du produit)
export function libelleVariante(
  v: ProductVariant,
  analyse: AnalyseVariantes,
  language: Language,
  dims: DimVariante[] = DIMENSIONS.filter(d => analyse.valeurs[d].length > 0),
): string {
  return dims.map(d => libelleValeur(v, d, language)).join(' · ');
}

// ─── Sélection ──────────────────────────────────────────────────────────────

// Clé normalisée choisie pour chaque bloc ; un bloc absent n'est pas encore choisi
export type Selection = Partial<Record<DimVariante, string>>;

function correspond(v: ProductVariant, selection: Selection, sauf?: DimVariante): boolean {
  return DIMENSIONS.every(d => d === sauf || selection[d] === undefined || cleDe(v, d) === selection[d]);
}

export function variantesCompatibles(analyse: AnalyseVariantes, selection: Selection): ProductVariant[] {
  return analyse.achetables.filter(v => correspond(v, selection));
}

// Une option est compatible s'il existe une variante qui l'a et qui garde les choix des AUTRES blocs
export function optionCompatible(analyse: AnalyseVariantes, selection: Selection, dim: DimVariante, cle: string): boolean {
  return analyse.achetables.some(v => cleDe(v, dim) === cle && correspond(v, selection, dim));
}

export function blocsManquants(analyse: AnalyseVariantes, selection: Selection): DimVariante[] {
  return analyse.aChoisir.filter(d => selection[d] === undefined);
}

// Variante retenue quand tous les blocs sont choisis (ou quand il n'y a rien à choisir)
export function varianteResolue(analyse: AnalyseVariantes, selection: Selection): ProductVariant | null {
  if (analyse.achetables.length === 0) return null;
  if (blocsManquants(analyse, selection).length > 0) return null;
  const compatibles = variantesCompatibles(analyse, selection);
  return compatibles.length === 1 ? compatibles[0] : null;
}

// Un bloc encore vide qui n'a plus qu'une valeur possible la prend
function completerSelection(analyse: AnalyseVariantes, selection: Selection): Selection {
  const suite = { ...selection };
  let change = true;
  while (change) {
    change = false;
    for (const dim of analyse.aChoisir) {
      if (suite[dim] !== undefined) continue;
      const possibles = new Set(variantesCompatibles(analyse, suite).map(v => cleDe(v, dim)));
      if (possibles.size === 1) {
        suite[dim] = Array.from(possibles)[0];
        change = true;
      }
    }
  }
  return suite;
}

// Bloc modifié par un toucher : valeur posée automatiquement, ou null si le bloc a été vidé
export interface Ajustement {
  dim: DimVariante;
  ancienne: string;
  nouvelle: string | null;
}

// Toucher une option : elle est retenue, même si elle ne va pas avec les autres choix.
// Les blocs devenus impossibles prennent la seule valeur restante, ou sont vidés.
export function choisirOption(
  analyse: AnalyseVariantes,
  selection: Selection,
  dim: DimVariante,
  cle: string,
): { selection: Selection; ajustements: Ajustement[] } {
  const suite: Selection = { ...selection, [dim]: cle };
  const ajustements: Ajustement[] = [];
  const gardees: DimVariante[] = [dim];
  for (const autre of analyse.aChoisir) {
    if (autre === dim || suite[autre] === undefined) continue;
    const base: Selection = {};
    for (const g of gardees) base[g] = suite[g];
    const avec = analyse.achetables.filter(v => correspond(v, base));
    if (avec.some(v => cleDe(v, autre) === suite[autre])) {
      gardees.push(autre);
      continue;
    }
    const ancienne = suite[autre]!;
    const possibles = Array.from(new Set(avec.map(v => cleDe(v, autre))));
    if (possibles.length === 1) {
      suite[autre] = possibles[0];
      gardees.push(autre);
      ajustements.push({ dim: autre, ancienne, nouvelle: possibles[0] });
    } else {
      delete suite[autre];
      ajustements.push({ dim: autre, ancienne, nouvelle: null });
    }
  }
  // Un bloc vidé peut être rempli ensuite (une seule valeur possible) : l'avis donne la valeur finale
  const finale = completerSelection(analyse, suite);
  return {
    selection: finale,
    ajustements: ajustements.map(a => (a.nouvelle === null && finale[a.dim] !== undefined ? { ...a, nouvelle: finale[a.dim]! } : a)),
  };
}

// Sélection complète d'une variante (liste unique, variante seule)
export function selectionDe(analyse: AnalyseVariantes, v: ProductVariant): Selection {
  const selection: Selection = {};
  for (const dim of analyse.aChoisir) selection[dim] = cleDe(v, dim);
  return selection;
}

// Exemple de variante pour une clé de dimension (libellé d'un avis)
export function exempleDe(analyse: AnalyseVariantes, dim: DimVariante, cle: string): ProductVariant | undefined {
  return analyse.valeurs[dim].find(val => val.cle === cle)?.exemple;
}

// ─── Prix et stock ──────────────────────────────────────────────────────────

export interface PrixAffiche {
  montant: number;
  // Plusieurs prix possibles : « À partir de »
  aPartirDe: boolean;
}

export function prixDesVariantes(prixProduit: number, variantes: ProductVariant[]): PrixAffiche {
  if (variantes.length === 0) return { montant: prixProduit || 0, aPartirDe: false };
  const prix = variantes.map(v => prixDe(prixProduit, v));
  const positifs = prix.filter(p => p > 0);
  if (positifs.length === 0) return { montant: 0, aPartirDe: false };
  return { montant: Math.min(...positifs), aPartirDe: new Set(prix).size > 1 };
}

// Prix d'un produit sur les cartes : variantes achetables d'abord, sinon prix du produit
export function prixProduitAffiche(product: Pick<ShopProduct, 'price' | 'variants'>): PrixAffiche {
  const achetables = variantesAchetables(product.variants);
  if (achetables.length === 0) return { montant: product.price > 0 ? product.price : 0, aPartirDe: false };
  return prixDesVariantes(product.price, achetables);
}

// Le prix est-il le même pour toutes les options d'un bloc ? Sinon on l'écrit sur chaque option.
export function prixUniqueDOption(analyse: AnalyseVariantes, prixProduit: number, dim: DimVariante, cle: string): number {
  const prix = new Set(analyse.achetables.filter(v => cleDe(v, dim) === cle).map(v => prixDe(prixProduit, v)));
  return prix.size === 1 ? Array.from(prix)[0] : 0;
}

export function prixVarientDansBloc(analyse: AnalyseVariantes, prixProduit: number, dim: DimVariante): boolean {
  const prix = analyse.valeurs[dim].map(val => prixUniqueDOption(analyse, prixProduit, dim, val.cle));
  return new Set(prix).size > 1;
}

// ─── Sans prix ──────────────────────────────────────────────────────────────
// Un produit ou une variante sans prix ne va jamais au panier : on écrit « Prix sur demande »,
// sans état de stock, et le bouton principal demande le prix sur WhatsApp.

export const PRIX_SUR_DEMANDE: Record<Language, string> = { fr: 'Prix sur demande', ar: 'السعر عند الطلب' };

// Aucun prix nulle part : ni sur le produit, ni sur une variante achetable
export function sansPrix(product: Pick<ShopProduct, 'price' | 'variants'>): boolean {
  return prixProduitAffiche(product).montant <= 0;
}

// Message WhatsApp prérempli, toujours en français (il est lu par l'équipe) :
// le produit, le choix fait s'il y en a un, et le lien lisible de la fiche (lib/liens-boutique)
export function messageDemandePrix(product: Pick<ShopProduct, 'id' | 'name'>, choix?: string): string {
  const article = choix ? `${product.name} — ${choix}` : product.name;
  return `Bonjour LEBTEX, je voudrais connaître le prix de : ${article}\n${lienComplet(lienProduit(product))}`;
}

export type EtatStock = 'en_stock' | 'limite' | 'sur_commande';

export function etatStock(stock: number): EtatStock {
  if (stock > SEUIL_STOCK_LIMITE) return 'en_stock';
  if (stock > 0) return 'limite';
  return 'sur_commande';
}

// ─── Panier ─────────────────────────────────────────────────────────────────

// Ligne sans prix restée d'un ancien panier : elle n'est pas comptée et peut être retirée
export const PRIX_A_CONFIRMER: Record<Language, string> = { fr: 'Prix à confirmer', ar: 'السعر سيتم تأكيده' };

// Libellé d'une ligne de panier : « Ruban noir-dents dorées », « 15mm · Nickel »… ('' sans variante)
export function libelleLignePanier(variant: CartItem['variant'], language: Language): string {
  if (!variant) return '';
  const v = { ...variant, id: variant.variantId || '', stock: 0 } as ProductVariant;
  return [libelleModele(v, language), libelleTaille(v, language), libelleCouleur(v, language)].filter(Boolean).join(' · ');
}

// Identifiant de la variante dans le panier (inchangé : id, sinon modèle__taille__couleur)
export function variantIdPanier(v: ProductVariant): string {
  return v.id || [v.model, v.size, v.color].filter(Boolean).join('__');
}

// Identifiant unique d'une variante achetable (les doublons sont déjà écartés)
export function identifiant(v: ProductVariant): string {
  return v.id || DIMENSIONS.map(d => cleDe(v, d)).join('|');
}

type ProduitPanier = Pick<ShopProduct, 'id' | 'name' | 'nameAr' | 'images' | 'price' | 'wholesalePrice' | 'minOrderQty' | 'volumineux' | 'stockQty'>;

// Même contrat CartItem qu'avant : le panier reçoit les valeurs brutes de la variante
export function construireCartItem(product: ProduitPanier, v: ProductVariant | null, quantite: number): CartItem {
  const prix = prixDe(product.price, v);
  return {
    productId: product.id,
    productName: product.name,
    productNameAr: product.nameAr || undefined,
    productImage: v?.image || product.images?.[0] || '',
    price: prix,
    originalPrice: prix,
    wholesalePrice: product.wholesalePrice,
    minOrderQty: product.minOrderQty,
    quantity: quantite,
    variant: v
      ? {
          color: v.color,
          colorAr: v.colorAr || (v.color ? couleurArabe(v.color) || undefined : undefined),
          colorHex: v.colorHex,
          model: v.model,
          modelAr: v.modelAr,
          size: v.size,
          sizeAr: v.sizeAr,
          variantId: variantIdPanier(v),
        }
      : undefined,
    maxStock: v ? v.stock : product.stockQty ?? 0,
    volumineux: !!product.volumineux,
  };
}

// Bouton d'ajout des cartes produit : ajout direct quand il n'y a rien à choisir,
// sinon on envoie le client sur la fiche (plus jamais de commande sans couleur).
// Sans aucun prix : pas d'ajout, le prix se demande sur WhatsApp.
export function ajoutRapide(product: ShopProduct): { mode: 'direct'; item: CartItem } | { mode: 'choisir' } | { mode: 'prix' } {
  if (sansPrix(product)) return { mode: 'prix' };
  const achetables = variantesAchetables(product.variants);
  if (achetables.length >= 2) return { mode: 'choisir' };
  const quantite = product.minOrderQty || 1;
  return { mode: 'direct', item: construireCartItem(product, achetables[0] || null, quantite) };
}

// ─── Pastilles ──────────────────────────────────────────────────────────────

export function estTransparent(v: ProductVariant): boolean {
  return norm(v.color) === 'transparent';
}

// Couleur très claire (Blanc #f5f5f5) : la pastille reçoit un contour plus marqué
export function estCouleurClaire(hex?: string): boolean {
  const m = (hex || '').trim().match(/^#?([0-9a-f]{3}|[0-9a-f]{6})$/i);
  if (!m) return false;
  const h = m[1].length === 3 ? m[1].split('').map(c => c + c).join('') : m[1];
  const [r, g, b] = [0, 2, 4].map(i => parseInt(h.slice(i, i + 2), 16) / 255);
  return 0.2126 * r + 0.7152 * g + 0.0722 * b > 0.8;
}
