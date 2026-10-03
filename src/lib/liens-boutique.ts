// Adresses de la boutique : la seule source des liens vers une fiche produit, un rayon ou
// une autre page (menus, cartes, plan du site, messages WhatsApp, étiquettes Google).
//
// - Fiche : /shop/produit/<nom-du-produit>-<jeton>, ex. /shop/produit/fil-a-coudre-40-2-1780496515405-uryjt.
//   Le jeton retrouve l'identifiant sans ambiguïté (custom_1780496515405_uryjt) ; le texte
//   devant ne sert qu'à lire : s'il est périmé (produit renommé), la fiche redirige.
//   Un identifiant d'une autre forme (catalogue de base, ex. « ac-aiguilles-asst ») est déjà
//   lisible : il est gardé tel quel, sans nom devant. Lui ajouter le nom rendrait l'adresse
//   ambiguë (le nom et l'identifiant contiennent tous deux des tirets : impossible de savoir
//   où l'un s'arrête), et son adresse ne change pas : aucune redirection, aucun lien cassé.
// - Rayon : /shop/categorie/<nom-du-rayon>. L'ancien slug (Firestore), l'identifiant et les
//   adresses déjà publiées d'un rayon renommé (ANCIENNES_ADRESSES_RAYONS) restent acceptés :
//   la page redirige vers l'adresse du moment. Une adresse ne désigne jamais qu'un rayon :
//   un nom partagé par deux rayons, ou qui est déjà le slug, l'identifiant ou l'ancienne
//   adresse d'un autre rayon, n'est pas pris ; le rayon garde alors son slug comme adresse.
// - Autres pages : lienPage('/shop/boutique').
// - Version arabe : la même adresse précédée de /ar (/ar/shop/produit/<nom>-<jeton>,
//   /ar/shop/categorie/<nom>, /ar/shop/boutique) : le paramètre `langue` des fonctions de
//   lien. Le morceau d'adresse (nom en lettres latines, jeton) est le même dans les deux
//   langues : passer d'une langue à l'autre, c'est ajouter ou retirer /ar.
// Fonctions pures, sans rien de « client » : partagées par le navigateur et le serveur.

import type { ShopCategory, ShopProduct } from './shop-types';

// Une seule adresse : https://lebtex.ma répond 308 vers celle-ci
export const SITE_URL = 'https://www.lebtex.ma';

export type LangueLien = 'fr' | 'ar';

type ProduitLien = Pick<ShopProduct, 'id'> & { name?: string };
export type RayonLien = Pick<ShopCategory, 'slug'> & {
  id?: string;
  name?: string;
  adresse?: string;             // posée par attribuerAdresses (fusionnerRayons) : unique
  anciennesAdresses?: string[]; // adresses d'avant un renommage, si l'admin les enregistre
};

// ─── Texte → morceau d'adresse ──────────────────────────────────────────────

// « Fil à Coudre 40/2 » → « fil-a-coudre-40-2 » : minuscules, sans accents, des tirets,
// au plus `max` caractères coupés entre deux mots (un seul mot trop long est coupé net).
export function slugifier(texte: string, max = 70): string {
  const mots = String(texte ?? '')
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '') // accents séparés de leur lettre par NFKD
    .toLowerCase()
    .replace(/œ/g, 'oe')
    .replace(/æ/g, 'ae')
    .split(/[^a-z0-9]+/)
    .filter(Boolean);
  let slug = '';
  for (const mot of mots) {
    const suite = slug ? `${slug}-${mot}` : mot;
    if (suite.length > max) return slug || mot.slice(0, max);
    slug = suite;
  }
  return slug;
}

// Paramètre d'adresse tel que tapé ou reçu : décodé (%C3%A9 → é) s'il est encodé
export function decoderParametre(param: string): string {
  const brut = String(param ?? '');
  try {
    return decodeURIComponent(brut).trim();
  } catch {
    return brut.trim();
  }
}

// ─── Fiches produit ─────────────────────────────────────────────────────────

// Identifiant donné par l'admin : custom_<13 chiffres (date)>_<1 à 5 lettres ou chiffres>
const ID_ADMIN = /^custom_(\d{13})_([a-z0-9]{1,5})$/;
// La fin d'une adresse lisible : …-<13 chiffres>-<1 à 5 lettres ou chiffres>
const JETON_ADMIN = /(?:^|-)(\d{13})-([a-z0-9]{1,5})$/;

// Le morceau d'adresse d'une fiche (non encodé) : « fil-a-coudre-40-2-1780496515405-uryjt »
export function parametreProduit(produit: ProduitLien): string {
  const m = ID_ADMIN.exec(produit.id);
  if (!m) return produit.id;
  const jeton = `${m[1]}-${m[2]}`;
  const nom = slugifier(produit.name || '');
  return nom ? `${nom}-${jeton}` : jeton;
}

// Chemin de la fiche, avec le nom français du produit (jamais le nom d'un alias de rayon)
export function lienProduit(produit: ProduitLien, langue?: LangueLien): string {
  return dansLaLangue(`/shop/produit/${encodeURIComponent(parametreProduit(produit))}`, langue);
}

// L'identifiant du produit d'une adresse : la nouvelle (seul le jeton compte, le texte
// devant peut être périmé), l'ancienne (identifiant brut), ou un identifiant du catalogue
// de base gardé tel quel.
export function idDepuisParametre(param: string): string {
  const brut = decoderParametre(param);
  if (ID_ADMIN.test(brut)) return brut;
  const m = JETON_ADMIN.exec(brut.toLowerCase());
  return m ? `custom_${m[1]}_${m[2]}` : brut;
}

// ─── Rayons ─────────────────────────────────────────────────────────────────

// Adresses lisibles déjà publiées (plan du site, Google, WhatsApp) qui ne sont pas le slug
// du rayon : adresse → slug Firestore du rayon. Elles mènent à ce rayon pour toujours, même
// s'il est renommé (sinon l'adresse apprise par Google tomberait en 404), et aucun autre
// rayon ne peut les prendre. Rayon renommé : ajouter ici l'adresse qu'il avait (tant que
// l'admin ne l'enregistre pas lui-même dans anciennesAdresses). Ne jamais en retirer.
export const ANCIENNES_ADRESSES_RAYONS: Readonly<Record<string, string>> = {
  // Premières adresses lisibles (octobre 2026), tirées des noms du moment
  'bobines-de-fil': 'tissu-doublure',
  'entoilages-et-thermocollants': 'entoilages-et-thermocollants-viseline',
  'tissus': 'fermetures-invisibles',
  'fermetures-plastique-resine': 'fermetures-resine',
  'curseur-pour-fermeture-eclaire': 'curseur-pour-fermeture-en-nylon',
  'fermeture-en-nylon-n-5-60cm-1m20': 'fermeture-en-nylon-no5-50cm-1m20',
  'fermeture-en-plastique-n-5-60cm-1m20': 'fermeture-en-plastique-n-5',
};

// Les adresses réservées à un rayon : celles de la table, et celles enregistrées sur lui
function adressesReservees(rayon: RayonLien): string[] {
  const table = Object.keys(ANCIENNES_ADRESSES_RAYONS).filter(a => ANCIENNES_ADRESSES_RAYONS[a] === rayon.slug);
  const enregistrees = Array.isArray(rayon.anciennesAdresses)
    ? rayon.anciennesAdresses.filter((a): a is string => typeof a === 'string' && a !== '')
    : [];
  return [...table, ...enregistrees];
}

// À quel rayon (sa place dans la liste) appartient chaque texte d'adresse, hors nom :
// d'abord les adresses réservées, puis les slugs, puis les identifiants. Le premier rayon
// qui prend un texte le garde : une adresse déjà publiée l'emporte sur un nouveau slug.
function proprietaires(rayons: RayonLien[]): Map<string, number> {
  const m = new Map<string, number>();
  const prendre = (texte: string | undefined, i: number) => {
    if (texte && !m.has(texte)) m.set(texte, i);
  };
  rayons.forEach((r, i) => adressesReservees(r).forEach(a => prendre(a, i)));
  rayons.forEach((r, i) => prendre(r.slug, i));
  rayons.forEach((r, i) => prendre(r.id, i));
  return m;
}

// Pose sur chaque rayon son adresse (champ `adresse`), unique dans la liste : son nom s'il
// lui est réservé (ou est son slug), ou s'il n'est ni partagé avec un autre rayon ni déjà
// pris par un autre (slug, identifiant, adresse réservée) ; sinon son slug.
// Appelé sur la liste complète des rayons visibles (fusionnerRayons), au serveur comme
// dans le navigateur : les deux donnent la même adresse.
export function attribuerAdresses<T extends RayonLien>(rayons: T[]): (T & { adresse: string })[] {
  const m = proprietaires(rayons);
  const noms = rayons.map(r => slugifier(r.name || ''));
  return rayons.map((r, i) => {
    const nom = noms[i];
    const aLui = (texte?: string) => !!texte && m.get(texte) === i;
    const libre = !m.has(nom) && noms.indexOf(nom) === noms.lastIndexOf(nom);
    let adresse = r.slug;
    if (nom && (aLui(nom) || libre)) adresse = nom;
    // Son slug est l'adresse déjà publiée d'un autre rayon (cas rare) : son identifiant
    else if (!aLui(r.slug) && r.id && aLui(r.id)) adresse = r.id;
    return { ...r, adresse };
  });
}

// Le morceau d'adresse d'un rayon : celui posé par attribuerAdresses ; à défaut (rayon pris
// hors du catalogue fusionné), son nom français, ou son slug si le nom n'en donne pas
export function parametreRayon(rayon: RayonLien): string {
  return rayon.adresse || slugifier(rayon.name || '') || rayon.slug;
}

export function lienRayon(rayon: RayonLien, langue?: LangueLien): string {
  return dansLaLangue(`/shop/categorie/${encodeURIComponent(parametreRayon(rayon))}`, langue);
}

// Le rayon d'une adresse : celle du moment d'abord, puis une adresse déjà publiée, le slug
// Firestore ou l'identifiant, puis la même adresse écrite autrement (majuscules, accents,
// espaces : « Fermetures Nylon »). Les rayons masqués ne sont pas dans la liste : null.
export function rayonDepuisParametre<T extends RayonLien>(param: string, rayons: T[]): T | null {
  const brut = decoderParametre(param);
  if (!brut) return null;
  const m = proprietaires(rayons);
  const chercher = (p: string): T | undefined => {
    const i = m.get(p);
    return rayons.find(r => parametreRayon(r) === p) ?? (i === undefined ? undefined : rayons[i]);
  };
  const ecrit = slugifier(brut, 200);
  return chercher(brut) ?? (ecrit ? chercher(ecrit) : undefined) ?? null;
}

// ─── Autres pages ───────────────────────────────────────────────────────────

// Chemin d'une autre page de la boutique (« /shop/boutique », « /shop/boutique?q=fil »),
// dans la langue voulue (« /ar/shop/boutique?q=fil »)
export function lienPage(chemin: string, langue?: LangueLien): string {
  return dansLaLangue(chemin, langue);
}

// ─── Langue d'une adresse ───────────────────────────────────────────────────

// Toute adresse arabe commence par /ar : /ar/shop, /ar/shop/produit/…
export const PREFIXE_ARABE = '/ar';

const BOUTIQUE = /^\/shop(?=[/?#]|$)/;

// Une adresse française de la boutique (/shop…) en arabe : /ar devant. Toute autre adresse
// (déjà arabe, /catalogue, WhatsApp…) reste telle quelle.
function dansLaLangue(chemin: string, langue?: LangueLien): string {
  return langue === 'ar' && BOUTIQUE.test(chemin) ? `${PREFIXE_ARABE}${chemin}` : chemin;
}

// La langue d'une adresse : l'arabe sous /ar, sinon le français
export function langueDuChemin(chemin: string | null | undefined): LangueLien {
  return /^\/ar(?=[/?#]|$)/.test(chemin || '') ? 'ar' : 'fr';
}

// L'adresse française d'une page : « /ar/shop/faq » → « /shop/faq ». L'accueil (« / »,
// « /ar ») et une adresse arabe hors boutique donnent « /shop ». Sert aux comparaisons
// (« suis-je sur le panier ? ») et au passage d'une langue à l'autre.
export function cheminFrancais(chemin: string | null | undefined): string {
  const brut = chemin || '/';
  const sansPrefixe = langueDuChemin(brut) === 'ar' ? brut.slice(PREFIXE_ARABE.length) : brut;
  if (BOUTIQUE.test(sansPrefixe)) return sansPrefixe;
  return langueDuChemin(brut) === 'ar' || sansPrefixe === '/' || sansPrefixe === '' ? '/shop' : sansPrefixe;
}

// La même page dans l'autre langue (« /shop/faq?x=1 » ↔ « /ar/shop/faq?x=1 »)
export function cheminDansLaLangue(chemin: string | null | undefined, langue: LangueLien): string {
  return dansLaLangue(cheminFrancais(chemin), langue);
}

// Pages écrites en français seulement (pas encore traduites). Leur adresse /ar existe et
// garde l'en-tête et le pied de page arabes, mais Google n'en connaît que l'adresse
// française : canonical vers elle, pas de hreflang, absente du plan du site en /ar.
// Une page traduite plus tard : la retirer d'ici.
export const PAGES_EN_FRANCAIS_SEULEMENT: readonly string[] = [
  '/shop/a-propos',
  '/shop/conditions',
  '/shop/confidentialite',
  '/shop/faq',
  '/shop/livraison',
  '/shop/precommande',
];

// Vrai si la page (adresse française, sans recherche) existe en arabe
export function pageTraduite(chemin: string): boolean {
  const page = cheminFrancais(chemin).split(/[?#]/)[0];
  return !PAGES_EN_FRANCAIS_SEULEMENT.includes(page);
}

// Adresse complète, pour ce qui part hors du site (WhatsApp, Google, partage)
export function lienComplet(chemin: string): string {
  return `${SITE_URL}${chemin}`;
}

// ─── Redirection d'une ancienne adresse ─────────────────────────────────────
// Un layout ne voit pas la recherche de l'adresse (« ?ref=statut&utm_source=… »), qui dit
// d'où vient une commande (lib/provenance-boutique). Un middleware peut la recopier dans
// cet en-tête : la redirection la garde alors. Sans middleware, l'en-tête est absent.
export const ENTETE_RECHERCHE = 'x-lebtex-recherche';

// La recherche à recoller derrière l'adresse de la redirection : « ?… » en caractères
// d'adresse (ASCII visibles), sinon rien
export function rechercheAGarder(recherche: string | null | undefined): string {
  return typeof recherche === 'string' && /^\?[\x21-\x7e]{1,1500}$/.test(recherche) ? recherche : '';
}
