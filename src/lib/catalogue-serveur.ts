// Ce que le serveur sait du catalogue, pour Google et les aperçus de liens (WhatsApp,
// Facebook) : l'adresse du site, le catalogue figé au build, un produit ajouté dans
// l'admin après le build, les étiquettes d'une page (titre, description, image) et ses
// données structurées (produit avec son prix, fil d'Ariane).
// Serveur seulement (layouts, plan du site) ; la règle de fusion du catalogue est dans
// catalogue-boutique, la même que celle du navigateur.
// Deux langues : chaque fonction d'étiquette prend `langue` ('fr' par défaut). En arabe
// (pages /ar/shop/…), les textes …Ar du catalogue (lib/shop-textes, sinon le français) et
// les adresses /ar ; chaque page traduite déclare ses deux adresses (hreflang).

import type { Metadata } from 'next';
import { cache } from 'react';
import { firebaseConfig } from '../firebase/config';
import { fusionnerProduits, fusionnerRayons, trouverRayon, type ProductOverride } from './catalogue-boutique';
import {
  cheminFrancais, decoderParametre, idDepuisParametre, lienComplet, lienPage, lienProduit, lienRayon, pageTraduite,
  rayonDepuisParametre, SITE_URL, type LangueLien, type RayonLien,
} from './liens-boutique';
import shopStaticData from './shop-firebase-dump.json';
import {
  CHEMIN_SECTEURS, cheminSecteur, photosSecteur, secteurDepuisParametre, secteursVisibles,
  type Secteur, type SecteurRempli,
} from './secteurs-boutique';
import { introRayon } from './textes-rayons';
import { SHOP_CATEGORIES, SHOP_PRODUCTS_DATA } from './shop-products-data';
import { nomCategorieProduit, nomProduit, texte } from './shop-textes';
import type { ShopCategory, ShopProduct } from './shop-types';
import { getProductDisplayPrice } from './shop-utils';
import { prixDe, sansPrix, variantesAchetables } from './shop-variantes';

// L'adresse du site vit dans lib/liens-boutique (avec toutes les adresses de la boutique)
export { SITE_URL };

// Image de partage par défaut (public/og-lebtex.jpg : 1200 × 630, ~100 Ko)
export const IMAGE_PARTAGE = {
  url: '/og-lebtex.jpg',
  width: 1200,
  height: 630,
  alt: 'LEBTEX — mercerie en gros et au détail à Casablanca',
};

// La même, décrite en arabe : pages /ar
export const IMAGE_PARTAGE_AR = { ...IMAGE_PARTAGE, alt: 'LEBTEX — خردوات الخياطة بالجملة والتقسيط في الدار البيضاء' };

// ─── Catalogue figé au build ────────────────────────────────────────────────

let catalogue: { produits: ShopProduct[]; rayons: ShopCategory[] } | null = null;

// Produits et rayons visibles (sans les masqués), tels que la boutique les affiche
export function catalogueFige(): { produits: ShopProduct[]; rayons: ShopCategory[] } {
  if (!catalogue) {
    const dump = shopStaticData as unknown as {
      overrides?: Record<string, ProductOverride>;
      customProducts?: ShopProduct[];
      customCategories?: ShopCategory[];
      categoryOverrides?: Record<string, Partial<ShopCategory>>;
    };
    // Comme la boutique : un produit sans prix n'existe pas pour les visiteurs (02/10/2026)
    const produits = fusionnerProduits(SHOP_PRODUCTS_DATA, dump.overrides || {}, dump.customProducts || []).filter(p => !sansPrix(p));
    const rayons = fusionnerRayons(SHOP_CATEGORIES, dump.customCategories || [], dump.categoryOverrides || {}, produits);
    catalogue = { produits, rayons };
  }
  return catalogue;
}

// ─── Produit ajouté après le build : lecture publique de Firestore ──────────
// Même lecture que la fiche dans le navigateur (shop_custom_products, puis sa surcharge),
// par l'API REST publique, en lecture seule, avec un délai court.

const DELAI_FIRESTORE_MS = 2500;

type ValeurFirestore = {
  stringValue?: string;
  integerValue?: string;
  doubleValue?: number;
  booleanValue?: boolean;
  timestampValue?: string;
  arrayValue?: { values?: ValeurFirestore[] };
  mapValue?: { fields?: Record<string, ValeurFirestore> };
};

function lireValeur(v: ValeurFirestore): unknown {
  if (v.stringValue !== undefined) return v.stringValue;
  if (v.integerValue !== undefined) return Number(v.integerValue);
  if (v.doubleValue !== undefined) return v.doubleValue;
  if (v.booleanValue !== undefined) return v.booleanValue;
  if (v.timestampValue !== undefined) return v.timestampValue;
  if (v.arrayValue) return (v.arrayValue.values || []).map(lireValeur);
  if (v.mapValue) return lireChamps(v.mapValue.fields);
  return null;
}

export function lireChamps(fields?: Record<string, ValeurFirestore>): Record<string, unknown> {
  return Object.fromEntries(Object.entries(fields || {}).map(([k, v]) => [k, lireValeur(v)]));
}

type LectureDocument =
  | { etat: 'present'; donnees: Record<string, unknown> }
  | { etat: 'absent' }    // Firestore répond « n'existe pas » (404)
  | { etat: 'inconnu' };  // réseau, délai dépassé, autre réponse : on ne sait pas

async function lireDocumentPublic(collection: string, id: string): Promise<LectureDocument> {
  const url =
    `https://firestore.googleapis.com/v1/projects/${firebaseConfig.projectId}/databases/(default)/documents/` +
    `${collection}/${encodeURIComponent(id)}?key=${firebaseConfig.apiKey}`;
  try {
    const reponse = await fetch(url, { cache: 'no-store', signal: AbortSignal.timeout(DELAI_FIRESTORE_MS) });
    if (reponse.status === 404) return { etat: 'absent' };
    if (!reponse.ok) return { etat: 'inconnu' };
    const document = (await reponse.json()) as { fields?: Record<string, ValeurFirestore> };
    return { etat: 'present', donnees: lireChamps(document.fields) };
  } catch {
    return { etat: 'inconnu' };
  }
}

export type ProduitDeLaPage =
  | { etat: 'catalogue'; produit: ShopProduct }                  // visible dans le catalogue figé
  | { etat: 'firestore'; produit: ShopProduct; masque: boolean } // ajouté après le build (ou masqué)
  | { etat: 'absent' }                                           // n'existe nulle part : vraie 404
  | { etat: 'inconnu' };                                         // Firestore injoignable : page normale

// Une seule recherche par requête (partagée par generateMetadata et le layout)
export const produitDeLaPage = cache(async (id: string): Promise<ProduitDeLaPage> => {
  const produit = catalogueFige().produits.find(p => p.id === id);
  if (produit) return { etat: 'catalogue', produit };
  const [fiche, surcharge] = await Promise.all([
    lireDocumentPublic('shop_custom_products', id),
    lireDocumentPublic('shop_product_overrides', id),
  ]);
  if (fiche.etat !== 'present') return fiche;
  const ov = surcharge.etat === 'present' ? surcharge.donnees : {};
  const enLigne = { id, ...fiche.donnees, ...ov } as unknown as ShopProduct;
  // Sans prix : la fiche n'est pas montrée (vraie 404), comme dans les listes
  if (sansPrix(enLigne)) return { etat: 'absent' };
  return { etat: 'firestore', produit: enLigne, masque: ov.hidden === true };
});

// ─── Textes courts pour Google ──────────────────────────────────────────────

// Texte sur une ligne, sans marques de mise en forme (titres, puces, gras) ni émojis
export function nettoyer(texte: unknown): string {
  if (typeof texte !== 'string') return '';
  return texte
    .replace(/[#*_`>|•●▪►]+|\p{Extended_Pictographic}|\uFE0F/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

// Coupé vers `max` caractères, au dernier mot entier
export function couper(texte: string, max = 155): string {
  if (texte.length <= max) return texte;
  const coupe = texte.slice(0, max - 1);
  const espace = coupe.lastIndexOf(' ');
  return `${(espace > max * 0.6 ? coupe.slice(0, espace) : coupe).replace(/[\s,;:–-]+$/, '')}…`;
}

// « 60 DH », « 12,5 DH » ; en arabe « 60 درهم »
function montantDH(montant: number, langue: LangueLien = 'fr'): string {
  return `${montant.toLocaleString('fr-MA', { maximumFractionDigits: 2 })} ${langue === 'ar' ? 'درهم' : 'DH'}`;
}

// Les mots des étiquettes, dans les deux langues
const MOTS = {
  fr: {
    produit: 'Produit',
    aPartirDe: 'à partir de ',
    conditionnement: 'Conditionnement : ',
    enGros: ' en gros et au détail.',
    accueil: 'Accueil',
    boutique: 'Commandez chez LEBTEX, mercerie à Casablanca : livraison partout au Maroc, paiement à la livraison.',
  },
  ar: {
    produit: 'منتج',
    aPartirDe: 'ابتداءً من ',
    conditionnement: 'التعبئة: ',
    enGros: ' بالجملة والتقسيط.',
    accueil: 'الرئيسية',
    boutique: 'اطلب من LEBTEX، خردوات الخياطة في الدار البيضاء: التوصيل لجميع مدن المغرب والدفع عند الاستلام.',
  },
} as const;

// Nom d'un produit ou d'un rayon dans la langue (l'arabe s'il est rempli, sinon le français)
function nomDe(objet: { name: string; nameAr?: string }, langue: LangueLien): string {
  return nettoyer(texte(objet, 'name', langue) || objet.name);
}

// Titre d'une fiche : son nom, et son prix affiché s'il en a un (jamais le prix barré)
export function titreProduit(p: ShopProduct, langue: LangueLien = 'fr'): string {
  const nom = nettoyer(nomProduit(p, langue)) || MOTS[langue].produit;
  const { amount, isFrom } = getProductDisplayPrice(p);
  if (!(amount > 0)) return nom;
  return `${nom} – ${isFrom ? MOTS[langue].aPartirDe : ''}${montantDH(amount, langue)}`;
}

// Description d'une fiche : le début de sa description (dans la langue), sinon une phrase construite
export function descriptionProduit(p: ShopProduct, rayons: ShopCategory[], langue: LangueLien = 'fr'): string {
  const nom = nettoyer(nomProduit(p, langue));
  const descriptions = langue === 'ar' ? [p.shortDescriptionAr, p.descriptionAr] : [p.shortDescription, p.description];
  for (const brut of descriptions) {
    const extrait = nettoyer(brut);
    if (extrait.length >= 40 && extrait.toLowerCase() !== nom.toLowerCase()) return couper(extrait);
  }
  const rayon = nettoyer(nomCategorieProduit(p, rayons, langue));
  const conditionnement = nettoyer(texte(p, 'conditionnementUnitaire', langue));
  return couper([
    `${nom}${rayon ? ` — ${rayon}` : ''}.`,
    conditionnement && `${MOTS[langue].conditionnement}${conditionnement}.`,
    MOTS[langue].boutique,
  ].filter(Boolean).join(' '), 160);
}

// Description d'un rayon : la sienne (dans la langue), sinon une phrase construite
export function descriptionRayon(c: ShopCategory, langue: LangueLien = 'fr'): string {
  // Introduction écrite pour le rayon (lib/textes-rayons), sinon sa description de l'admin
  const intro = introRayon(c, langue);
  if (intro) return intro;
  const sienne = nettoyer(langue === 'ar' ? c.descriptionAr : c.description);
  if (sienne.length >= 40) return couper(sienne);
  return couper(`${nomDe(c, langue)}${MOTS[langue].enGros} ${MOTS[langue].boutique}`, 160);
}

// ─── Image d'aperçu ─────────────────────────────────────────────────────────
// Les photos produit font souvent 1 à 2 Mo : trop lourdes pour l'aperçu WhatsApp.
// On passe par l'optimiseur d'images de Next, en adresse absolue. La largeur doit être
// dans images.deviceSizes de next.config.ts ; 640 garde même une photo PNG (quand
// l'aperçu ne demande pas de WebP) sous ~130 Ko, et reste au-dessus des 600 px qu'il
// faut à Facebook pour un grand aperçu.
const LARGEUR_APERCU = 640;
// = images.remotePatterns de next.config.ts (seuls domaines acceptés par l'optimiseur)
const DOMAINES_IMAGES = ['firebasestorage.googleapis.com', 'images.unsplash.com', 'placehold.co', 'picsum.photos'];

export function imageApercu(photo: unknown): string | null {
  if (typeof photo !== 'string' || !photo.trim()) return null;
  const locale = photo.startsWith('/') && !photo.startsWith('//');
  let distante = false;
  try {
    const u = new URL(photo);
    distante = u.protocol === 'https:' && DOMAINES_IMAGES.includes(u.hostname);
  } catch {
    distante = false;
  }
  if (!locale && !distante) return null;
  return `${SITE_URL}/_next/image?url=${encodeURIComponent(photo)}&w=${LARGEUR_APERCU}&q=70`;
}

// Première photo du produit (sinon celle d'une de ses variantes)
export function photoProduit(p: ShopProduct): string | undefined {
  return p.images?.find(Boolean) || p.variants?.find(v => v?.image)?.image;
}

// ─── Étiquettes d'une page ──────────────────────────────────────────────────

// Titre complet d'une page : « … | LEBTEX ». Écrit ici, pas par un modèle « %s | LEBTEX »
// dans le layout de la boutique : les pages qui donnent leur propre titre (conditions,
// confidentialité, livraison) l'écrivent déjà avec « | LEBTEX », un modèle le doublerait.
export function titrePage(titre: string): string {
  return `${titre} | LEBTEX`;
}

type ImagePartage = { url: string; alt?: string; width?: number; height?: number };

// Adresse complète d'une page de la boutique dans une langue. `chemin` : son adresse
// française (« /shop/faq »). L'accueil français est l'adresse du site (« / » est réécrit
// vers /shop) ; l'accueil arabe, /ar/shop.
export function adresseComplete(chemin: string, langue: LangueLien = 'fr'): string {
  const fr = cheminFrancais(chemin);
  if (langue === 'fr' && fr === '/shop') return SITE_URL;
  return lienComplet(lienPage(fr, langue));
}

// Les deux adresses d'une page traduite, pour Google (hreflang) : fr-MA, ar-MA, et x-default
// (le français) pour tous les autres. null pour une page pas encore traduite.
export function adressesLangues(chemin: string): { 'fr-MA': string; 'ar-MA': string; 'x-default': string } | null {
  if (!pageTraduite(chemin)) return null;
  const fr = adresseComplete(chemin, 'fr');
  return { 'fr-MA': fr, 'ar-MA': adresseComplete(chemin, 'ar'), 'x-default': fr };
}

// Adresse canonique, adresses dans les deux langues et aperçu de partage d'une page.
// `chemin` : l'adresse française ; `langue` : celle de la page (/ar/shop/… en arabe).
// Une page pas encore traduite (lib/liens-boutique) n'a qu'une adresse pour Google, la
// française, même ouverte sous /ar. Le titre et la description de l'aperçu reprennent
// ceux de la page (Next les recopie quand openGraph ne les donne pas).
export function adressePage(chemin: string, image?: ImagePartage, langue: LangueLien = 'fr'): Metadata {
  const langues = adressesLangues(chemin);
  const ar = langue === 'ar' && langues !== null;
  const url = adresseComplete(chemin, ar ? 'ar' : 'fr');
  return {
    alternates: { canonical: url, ...(langues && { languages: langues }) },
    openGraph: {
      type: 'website',
      locale: ar ? 'ar_MA' : 'fr_MA',
      ...(langues && { alternateLocale: ar ? 'fr_MA' : 'ar_MA' }),
      siteName: 'LEBTEX',
      url,
      images: [image ?? (ar ? IMAGE_PARTAGE_AR : IMAGE_PARTAGE)],
    },
    twitter: { card: 'summary_large_image' },
  };
}

// Titre (complété par « | LEBTEX »), description, adresses et aperçu de partage
export function etiquettesPage({ titre, description, chemin, image, langue }: {
  titre: string;
  description: string;
  chemin: string; // adresse française, ex. '/shop/faq'
  image?: ImagePartage;
  langue?: LangueLien;
}): Metadata {
  return { title: titrePage(titre), description, ...adressePage(chemin, image, langue) };
}

const HORS_GOOGLE = { index: false, follow: true };

// Page personnelle (panier, commande, compte, suivi) : jamais dans Google, en français
// comme en arabe (titre et description dans la langue de la page)
export function etiquettesPrivees(titre: string, description: string): Metadata {
  return {
    title: titrePage(titre),
    description,
    robots: HORS_GOOGLE,
  };
}

// Étiquettes d'une fiche produit (layouts /shop/produit/[id] et /ar/shop/produit/[id]) :
// nom et prix, description, photo, adresse lisible dans la langue. Rien de précis quand
// Firestore n'a pas répondu ; hors de Google pour un produit inconnu ou masqué.
export async function etiquettesProduit(parametre: string, langue: LangueLien = 'fr'): Promise<Metadata> {
  const ar = langue === 'ar';
  const trouve = await produitDeLaPage(idDepuisParametre(parametre));

  if (trouve.etat === 'absent') return { title: titrePage(ar ? 'المنتج غير موجود' : 'Produit introuvable'), robots: HORS_GOOGLE };
  if (trouve.etat === 'inconnu') {
    return etiquettesPage({
      titre: MOTS[langue].produit,
      description: ar
        ? 'LEBTEX، خردوات الخياطة في الدار البيضاء: التوصيل لجميع مدن المغرب والدفع عند الاستلام.'
        : 'Mercerie LEBTEX à Casablanca : livraison partout au Maroc, paiement à la livraison.',
      chemin: `/shop/produit/${encodeURIComponent(decoderParametre(parametre))}`,
      langue,
    });
  }

  const p = trouve.produit;
  const photo = imageApercu(photoProduit(p));
  const etiquettes = etiquettesPage({
    titre: titreProduit(p, langue),
    description: descriptionProduit(p, catalogueFige().rayons, langue),
    chemin: lienProduit(p),
    langue,
    ...(photo && { image: { url: photo, alt: nomDe(p, langue) } }),
  });
  // Produit masqué dans l'admin : la fiche reste ouverte (comme avant), mais hors de Google
  if (trouve.etat === 'firestore' && trouve.masque) etiquettes.robots = HORS_GOOGLE;
  return etiquettes;
}

// Étiquettes d'une page rayon (layouts /shop/categorie/[slug] et /ar/shop/categorie/[slug]),
// toujours à la nouvelle adresse du rayon, même ouverte par un vieux lien
export function etiquettesRayon(parametre: string, langue: LangueLien = 'fr'): Metadata {
  const rayon = rayonDepuisParametre(parametre, catalogueFige().rayons);
  if (!rayon) return { title: titrePage(langue === 'ar' ? 'الفئة غير موجودة' : 'Rayon introuvable'), robots: HORS_GOOGLE };
  const nom = nomDe(rayon, langue);
  const photo = imageApercu(rayon.image);
  return etiquettesPage({
    titre: nom,
    description: descriptionRayon(rayon, langue),
    chemin: lienRayon(rayon),
    langue,
    ...(photo && { image: { url: photo, alt: nom } }),
  });
}

// ─── Données structurées pour Google (JSON-LD) ──────────────────────────────
// Ce que Google peut montrer sous le lien : le prix et le chemin « Accueil › Rayon › Produit ».
// Seulement du vrai : le prix affiché (celui qui sera facturé, jamais un prix barré),
// aucun avis, aucune note. Un produit sans prix (« Prix sur demande ») n'a pas de fiche Product.

type DonneesStructurees = Record<string, unknown>;

// Adresses lisibles (lib/liens-boutique), en adresse complète, dans la langue
export function adresseProduit(p: Pick<ShopProduct, 'id' | 'name'>, langue: LangueLien = 'fr'): string {
  return lienComplet(lienProduit(p, langue));
}

export function adresseRayon(rayon: RayonLien, langue: LangueLien = 'fr'): string {
  return lienComplet(lienRayon(rayon, langue));
}

// Photo en adresse complète (https), sinon rien
function photoAbsolue(photo: unknown): string | null {
  if (typeof photo !== 'string' || !photo.trim()) return null;
  if (photo.startsWith('/') && !photo.startsWith('//')) return `${SITE_URL}${photo}`;
  return /^https:\/\//.test(photo) ? photo : null;
}

const VENDEUR = { '@type': 'Organization', name: 'LEBTEX', url: SITE_URL };

// Fiche produit avec prix : nom, photos, description, référence, marque et offre au prix affiché.
// « À partir de » (variantes à prix différents) : une offre groupée, du moins cher au plus cher.
// En arabe : nom et description arabes, adresse /ar.
export function donneesProduit(p: ShopProduct, rayons: ShopCategory[], langue: LangueLien = 'fr'): DonneesStructurees | null {
  const { amount, isFrom } = getProductDisplayPrice(p);
  if (!(amount > 0)) return null;

  const url = adresseProduit(p, langue);
  const photos = [...(p.images || []), ...(p.variants || []).map(v => v?.image)]
    .map(photoAbsolue)
    .filter((x): x is string => !!x);
  const disponibilite = p.inStock === false ? 'https://schema.org/OutOfStock' : 'https://schema.org/InStock';
  const commun = { priceCurrency: 'MAD', availability: disponibilite, url, seller: VENDEUR };

  let offre: DonneesStructurees = { '@type': 'Offer', price: amount, ...commun };
  if (isFrom) {
    const prix = variantesAchetables(p.variants).map(v => prixDe(p.price, v)).filter(x => x > 0);
    offre = {
      '@type': 'AggregateOffer',
      lowPrice: amount,
      highPrice: Math.max(amount, ...prix),
      offerCount: prix.length,
      ...commun,
    };
  }

  return {
    '@context': 'https://schema.org',
    '@type': 'Product',
    name: nomDe(p, langue) || MOTS[langue].produit,
    ...(photos.length > 0 && { image: Array.from(new Set(photos)).slice(0, 10) }),
    description: descriptionProduit(p, rayons, langue),
    sku: p.id,
    brand: { '@type': 'Brand', name: 'LEBTEX' },
    offers: offre,
  };
}

type Etape = { nom: string; url: string };

function filAriane(etapes: Etape[]): DonneesStructurees {
  return {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: etapes.map((e, i) => ({ '@type': 'ListItem', position: i + 1, name: e.nom, item: e.url })),
  };
}

function etapeAccueil(langue: LangueLien): Etape {
  return { nom: MOTS[langue].accueil, url: adresseComplete('/shop', langue) };
}

// Accueil, le rayon parent s'il y en a un (visible), puis le rayon
function etapesRayon(rayon: ShopCategory, rayons: ShopCategory[], langue: LangueLien): Etape[] {
  const parent = rayon.parentSlug ? trouverRayon(rayons, rayon.parentSlug) : null;
  return [
    etapeAccueil(langue),
    ...(parent ? [{ nom: nomDe(parent, langue), url: adresseRayon(parent, langue) }] : []),
    { nom: nomDe(rayon, langue), url: adresseRayon(rayon, langue) },
  ];
}

// Page rayon : « Accueil › Rayon »
export function filArianeRayon(rayon: ShopCategory, rayons: ShopCategory[], langue: LangueLien = 'fr'): DonneesStructurees {
  return filAriane(etapesRayon(rayon, rayons, langue));
}

// Fiche produit : « Accueil › Rayon › Produit » (sans le rayon s'il est introuvable ou masqué)
export function filArianeProduit(p: ShopProduct, rayons: ShopCategory[], langue: LangueLien = 'fr'): DonneesStructurees {
  const rayon = p.categorySlug ? trouverRayon(rayons, p.categorySlug) : null;
  return filAriane([
    ...(rayon ? etapesRayon(rayon, rayons, langue) : [etapeAccueil(langue)]),
    { nom: nomDe(p, langue) || MOTS[langue].produit, url: adresseProduit(p, langue) },
  ]);
}

// Texte à mettre dans <script type="application/ld+json"> : « < » échappé, pour qu'un
// « </script> » dans un nom ou une description ne puisse pas fermer la balise
export function jsonLd(donnees: DonneesStructurees): string {
  return JSON.stringify(donnees).replace(/</g, '\\u003c');
}

// ─── Secteurs d'activité (lib/secteurs-boutique) ────────────────────────────
// Pages /shop/secteurs et /shop/secteurs/<slug> (et /ar) : les secteurs montrés sont ceux
// qui ont assez de produits dans le catalogue figé, le même que celui du navigateur.

let secteursCatalogue: SecteurRempli[] | null = null;

// Secteurs montrés, avec leurs familles et leurs produits (sans les produits sans prix)
export function secteursDuCatalogue(): SecteurRempli[] {
  if (!secteursCatalogue) {
    const { produits, rayons } = catalogueFige();
    secteursCatalogue = secteursVisibles(produits, rayons);
  }
  return secteursCatalogue;
}

// Le secteur d'une adresse, s'il est montré ; null pour un secteur inconnu ou sans assez
// de produits (vraie 404)
export function secteurDeLaPage(parametre: string): SecteurRempli | null {
  const secteur = secteurDepuisParametre(parametre);
  if (!secteur) return null;
  return secteursDuCatalogue().find(s => s.secteur.slug === secteur.slug) ?? null;
}

const MOTS_SECTEURS = {
  fr: {
    titre: "Secteurs d'activité",
    description:
      "Tapisserie, caftan, confection, vêtements de travail : les fournitures LEBTEX classées par métier. Livraison partout au Maroc, retrait gratuit à Casablanca.",
    introuvable: 'Secteur introuvable',
    fin: 'Livraison partout au Maroc, retrait gratuit à Casablanca.',
    finCourte: 'Livraison partout au Maroc.',
  },
  ar: {
    titre: 'قطاعات النشاط',
    description:
      'التنجيد، والقفطان والجلابة، والخياطة، وملابس العمل: لوازم LEBTEX مرتبة حسب الحرفة. التوصيل لجميع مدن المغرب، والاستلام مجاني في الدار البيضاء.',
    introuvable: 'القطاع غير موجود',
    fin: 'التوصيل لجميع مدن المغرب، والاستلام مجاني في الدار البيضاء.',
    finCourte: 'التوصيل لجميع مدن المغرب.',
  },
} as const;

// Image d'aperçu d'un secteur : la photo de son premier produit
function imageSecteur(rempli: SecteurRempli, langue: LangueLien): ImagePartage | undefined {
  const photo = imageApercu(photosSecteur(rempli, 1)[0]);
  return photo ? { url: photo, alt: rempli.secteur.nom[langue] } : undefined;
}

// Description Google d'un secteur (160 caractères au plus) : l'accroche et la phrase de
// livraison entière ; si c'est trop long, la phrase courte (« Livraison partout au
// Maroc. »), jamais une promesse coupée en plein mot
function descriptionSecteur(secteur: Secteur, langue: LangueLien): string {
  const mots = MOTS_SECTEURS[langue];
  for (const fin of [mots.fin, mots.finCourte]) {
    const description = `${secteur.accroche[langue]} ${fin}`;
    if (description.length <= 160) return description;
  }
  return couper(secteur.accroche[langue], 160);
}

// Étiquettes de la liste des secteurs (layouts /shop/secteurs et /ar/shop/secteurs)
export function etiquettesSecteurs(langue: LangueLien = 'fr'): Metadata {
  const premier = secteursDuCatalogue()[0];
  const image = premier ? imageSecteur(premier, langue) : undefined;
  return etiquettesPage({
    titre: MOTS_SECTEURS[langue].titre,
    description: MOTS_SECTEURS[langue].description,
    chemin: CHEMIN_SECTEURS,
    langue,
    ...(image && { image }),
  });
}

// Étiquettes d'une page secteur : son titre, son accroche, sa photo, son adresse dans les
// deux langues ; hors de Google pour une adresse inconnue
export function etiquettesSecteur(parametre: string, langue: LangueLien = 'fr'): Metadata {
  const rempli = secteurDeLaPage(parametre);
  if (!rempli) return { title: titrePage(MOTS_SECTEURS[langue].introuvable), robots: HORS_GOOGLE };
  const { secteur } = rempli;
  const image = imageSecteur(rempli, langue);
  return etiquettesPage({
    titre: secteur.titreGoogle[langue],
    description: descriptionSecteur(secteur, langue),
    chemin: cheminSecteur(secteur),
    langue,
    ...(image && { image }),
  });
}

function etapeSecteurs(langue: LangueLien): Etape {
  return { nom: MOTS_SECTEURS[langue].titre, url: adresseComplete(CHEMIN_SECTEURS, langue) };
}

// Liste des secteurs : « Accueil › Secteurs »
export function filArianeSecteurs(langue: LangueLien = 'fr'): DonneesStructurees {
  return filAriane([etapeAccueil(langue), etapeSecteurs(langue)]);
}

// Page secteur : « Accueil › Secteurs › Secteur »
export function filArianeSecteur(secteur: Secteur, langue: LangueLien = 'fr'): DonneesStructurees {
  return filAriane([
    etapeAccueil(langue),
    etapeSecteurs(langue),
    { nom: secteur.nom[langue], url: adresseComplete(cheminSecteur(secteur), langue) },
  ]);
}

// Une page qui réunit des liens : nom, description, adresse, langue, et la liste de ce
// qu'elle montre (sans prix ni avis : seulement les noms et les adresses)
function pageCollection(
  nom: string,
  description: string,
  chemin: string,
  elements: { nom: string; url: string }[],
  langue: LangueLien,
): DonneesStructurees {
  return {
    '@context': 'https://schema.org',
    '@type': 'CollectionPage',
    name: nom,
    description,
    url: adresseComplete(chemin, langue),
    inLanguage: langue === 'ar' ? 'ar-MA' : 'fr-MA',
    isPartOf: { '@type': 'WebSite', name: 'LEBTEX', url: SITE_URL },
    mainEntity: {
      '@type': 'ItemList',
      numberOfItems: elements.length,
      itemListElement: elements.map((e, i) => ({ '@type': 'ListItem', position: i + 1, name: e.nom, url: e.url })),
    },
  };
}

// Liste des secteurs : la page et ses secteurs
export function donneesSecteurs(langue: LangueLien = 'fr'): DonneesStructurees {
  return pageCollection(
    MOTS_SECTEURS[langue].titre,
    MOTS_SECTEURS[langue].description,
    CHEMIN_SECTEURS,
    secteursDuCatalogue().map(({ secteur }) => ({
      nom: secteur.nom[langue],
      url: adresseComplete(cheminSecteur(secteur), langue),
    })),
    langue,
  );
}

// Page secteur : la page et ses produits
export function donneesSecteur(rempli: SecteurRempli, langue: LangueLien = 'fr'): DonneesStructurees {
  const { secteur, produits } = rempli;
  return pageCollection(
    secteur.nom[langue],
    secteur.accroche[langue],
    cheminSecteur(secteur),
    produits.map(p => ({ nom: nomDe(p, langue) || MOTS[langue].produit, url: adresseProduit(p, langue) })),
    langue,
  );
}
