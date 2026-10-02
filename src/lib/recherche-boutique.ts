// Recherche de la boutique : quels produits et quels rayons correspondent à ce que le
// client tape, et dans quel ordre. Une seule règle pour la barre de recherche (SmartSearch)
// et la page /shop/boutique. Fonctions pures (testées sur le vrai catalogue avec tsx).
//
// Chaque mot tapé reçoit un niveau, du meilleur au moins bon :
//   1. le nom (français ou arabe) commence par ce mot ;
//   2. le nom contient ce mot entier ;
//   3. le nom contient ce mot (début d'un mot du nom ; n'importe où dès 4 lettres) ;
//   4. le rayon du produit (et son rayon parent) ;
//   5. le reste : description, mots-clés, type, couleurs, modèles, tailles.
// Plusieurs mots : TOUS doivent être trouvés, sauf les petits mots (de, les, en, من…). Le produit se classe d'après son mot le moins
// bien trouvé, puis la somme des niveaux. À égalité : produits avec prix d'abord, puis
// ordre alphabétique du nom affiché. Toujours le même ordre pour la même recherche.
//
// Tolérances : majuscules, accents, pluriel simple (fermeture / fermetures, سحاب / سحابات,
// quelques pluriels arabes irréguliers : خيط / خيوط…). En arabe : l'article « ال » est ignoré
// en début de mot (aussi collé à و ب ف ك, et « لل »), lettres unifiées et chiffres arabes
// par normaliserRecherche (shop-textes).

import type { ShopCategory, ShopProduct } from './shop-types';
import type { Language } from './translations';
import { nomProduit, normaliserRecherche, texte, texteRecherche } from './shop-textes';
import { sansPrix } from './shop-variantes';

// ─── Mots ───────────────────────────────────────────────────────────────────

const ARABE = /[\u0600-\u06ff]/;

// « السحاب » → « سحاب », « بالجملة » → « جمله », « للخياطة » → « خياطه » (s'il reste 2 lettres)
function sansArticle(mot: string): string {
  return mot.replace(/^(?:[وفبك]?ال|لل)(?=.{2,}$)/, '');
}

// Mots d'un texte déjà normalisé : lettres et chiffres, le reste sépare (espaces, tirets, « / »…).
// Numéro de fermeture : « N°5 », « No5 », « n 5 » donnent le mot « n5 » (et, dans le texte
// d'un produit, aussi le chiffre « 5 », que l'on trouve en tapant « fermeture 5 ») :
// « fermeture n5 » ne trouve pas une fermeture N°3 « style 5 couleurs ».
function mots(texteNormalise: string, avecChiffreSeul = true): string[] {
  return texteNormalise
    .replace(/(^|[^\p{L}\p{N}])n(?:°|º|o)?\s*(\d+)/gu, avecChiffreSeul ? '$1n$2 $2' : '$1n$2')
    .split(/[^\p{L}\p{N}]+/u)
    .filter(Boolean)
    .map(sansArticle);
}

// Singulier simple : « fermetures » → « fermeture », « سحابات » → « سحاب »
function singulier(mot: string): string {
  if (ARABE.test(mot)) return mot.length >= 5 && mot.endsWith('ات') ? mot.slice(0, -2) : mot;
  return mot.length > 3 && /[sx]$/.test(mot) ? mot.slice(0, -1) : mot;
}

// Pluriels arabes irréguliers courants en mercerie (formes normalisées, sans « ال »)
const EQUIVALENTS: string[][] = [
  ['خيط', 'خيوط'],
  ['زر', 'ازرار'],
  ['شريط', 'اشرطه'],
  ['ابره', 'ابر'],
  ['قماش', 'اقمشه'],
  ['حزام', 'احزمه'],
];

// Ce qu'on cherche pour un mot tapé : son singulier, et ses équivalents
function formesDe(mot: string): string[] {
  const base = singulier(mot);
  const groupe = EQUIVALENTS.find(g => g.includes(base) || g.includes(mot));
  return Array.from(new Set([base, ...(groupe || [])]));
}

// Petits mots d'une phrase (« des boutons », « fermeture en nylon », « سحاب من النايلون ») :
// on ne les exige pas, sinon une phrase naturelle trouverait moins qu'un mot seul.
const MOTS_VIDES = new Set(
  ['de', 'des', 'du', 'le', 'la', 'les', 'un', 'une', 'en', 'et', 'au', 'aux', 'pour', 'avec', 'sur', 'par',
    'من', 'في', 'على', 'مع', 'ديال', 'ال'].map(normaliserRecherche),
);

// Mots utiles d'une recherche : 2 caractères ou plus (un chiffre seul compte : « n 5 »), sans doublon
// ni petit mot. Si on n'a tapé que des petits mots (« de » en tapant « dentelle »), on les garde,
// sauf « ال » seul, qui ne cherche rien.
export function motsDeRequete(requete: string): string[] {
  const liste = Array.from(new Set(mots(normaliserRecherche(requete), false).filter(m => m.length >= 2 || /^\d$/.test(m))));
  const utiles = liste.filter(m => !MOTS_VIDES.has(m));
  return utiles.length > 0 ? utiles : liste.filter(m => m !== 'ال');
}

// ─── Champs ─────────────────────────────────────────────────────────────────

interface Champ {
  texte: string;          // mots normalisés, séparés par une espace
  mots: string[];
  singuliers: Set<string>;
}

function champ(...morceaux: unknown[]): Champ {
  const liste = mots(normaliserRecherche(morceaux.filter(m => typeof m === 'string' && m.trim()).join(' ')));
  return { texte: liste.join(' '), mots: liste, singuliers: new Set(liste.map(singulier)) };
}

// Le mot est-il dans le champ : au début d'un mot, ou n'importe où dès 4 lettres
// (« fil » ne doit pas trouver « profil », « agrippante » trouve « auto-agrippante »)
function contient(c: Champ, forme: string): boolean {
  return c.mots.some(m => m.startsWith(forme)) || (forme.length >= 4 && c.texte.includes(forme));
}

// Premier mot de chaque nom (français, arabe) : « le nom commence par… »
function premiersMots(...noms: unknown[]): string[] {
  return noms
    .map(n => (typeof n === 'string' ? mots(normaliserRecherche(n))[0] : undefined))
    .filter((m): m is string => !!m);
}

const PAS_TROUVE = 0;

// Ce qu'on regarde d'un produit ou d'un rayon, du plus important au moins important
interface Fiche {
  debuts: string[]; // premier mot du nom français et du nom arabe
  nom: Champ;
  rayon?: Champ;    // produits seulement
  reste: Champ;
}

// Niveau d'un mot tapé (1 = meilleur), 0 s'il n'est nulle part
function niveau({ debuts, nom, rayon, reste }: Fiche, formes: string[]): number {
  if (formes.some(x => debuts.some(m => m.startsWith(x)))) return 1;
  if (formes.some(x => nom.singuliers.has(x))) return 2;
  if (formes.some(x => contient(nom, x))) return 3;
  if (rayon && formes.some(x => contient(rayon, x))) return 4;
  if (formes.some(x => contient(reste, x))) return 5;
  return PAS_TROUVE;
}

// Garde ce qui contient tous les mots tapés, du plus pertinent au moins pertinent : mot le moins
// bien trouvé, puis somme des niveaux, puis `avant` (produit avec prix, rayon principal),
// puis ordre alphabétique du nom affiché. [] si rien d'utile n'est tapé.
function classer<T>(elements: { el: T; fiche: Fiche; nom: string; avant: boolean }[], requete: string, language: Language): T[] {
  const formes = motsDeRequete(requete).map(formesDe);
  if (formes.length === 0) return [];
  const ordre = new Intl.Collator(language === 'ar' ? 'ar' : 'fr', { sensitivity: 'base', numeric: true });
  return elements
    .map(e => ({ ...e, niveaux: formes.map(f => niveau(e.fiche, f)) }))
    .filter(e => !e.niveaux.includes(PAS_TROUVE))
    .map(e => ({ ...e, pire: Math.max(...e.niveaux), somme: e.niveaux.reduce((s, n) => s + n, 0) }))
    .sort((a, b) =>
      a.pire - b.pire ||
      a.somme - b.somme ||
      Number(b.avant) - Number(a.avant) ||
      ordre.compare(a.nom, b.nom),
    )
    .map(e => e.el);
}

// ─── Produits ───────────────────────────────────────────────────────────────

export interface ProduitIndexe extends Fiche {
  produit: ShopProduct;
  avecPrix: boolean;
}

// À calculer une fois par catalogue (useMemo), pas à chaque lettre tapée
export function indexerProduits(produits: ShopProduct[], categories: ShopCategory[]): ProduitIndexe[] {
  return produits.map(p => {
    const cat = categories.find(c => c.slug === p.categorySlug);
    const parent = cat?.parentSlug ? categories.find(c => c.slug === cat.parentSlug) : undefined;
    return {
      produit: p,
      debuts: premiersMots(p.name, p.nameAr),
      nom: champ(p.name, p.nameAr),
      rayon: champ(cat?.name, cat?.nameAr, parent?.name, parent?.nameAr, p.categoryName, p.categoryNameAr),
      reste: champ(texteRecherche(p, categories, true)),
      avecPrix: !sansPrix(p),
    };
  });
}

// Produits trouvés ; à niveau égal, ceux qui ont un prix d'abord
export function chercherProduits(index: ProduitIndexe[], requete: string, language: Language = 'fr'): ShopProduct[] {
  return classer(
    index.map(x => ({ el: x.produit, fiche: x, nom: nomProduit(x.produit, language), avant: x.avecPrix })),
    requete,
    language,
  );
}

// ─── Rayons ─────────────────────────────────────────────────────────────────
// Mêmes niveaux, sans le rayon : nom qui commence par le mot, mot entier, nom qui le contient,
// description. À niveau égal, les rayons principaux d'abord.

export function chercherRayons(categories: ShopCategory[], requete: string, language: Language = 'fr'): ShopCategory[] {
  return classer(
    categories.map(c => ({
      el: c,
      fiche: { debuts: premiersMots(c.name, c.nameAr), nom: champ(c.name, c.nameAr), reste: champ(c.description, c.descriptionAr) },
      nom: texte(c, 'name', language) || c.name,
      avant: !c.parentSlug,
    })),
    requete,
    language,
  );
}
