// Ce que le serveur sait du catalogue, pour Google et les aperçus de liens (WhatsApp,
// Facebook) : l'adresse du site, le catalogue figé au build, un produit ajouté dans
// l'admin après le build, les étiquettes d'une page (titre, description, image) et ses
// données structurées (produit avec son prix, fil d'Ariane).
// Serveur seulement (layouts, plan du site) ; la règle de fusion du catalogue est dans
// catalogue-boutique, la même que celle du navigateur.

import type { Metadata } from 'next';
import { cache } from 'react';
import { firebaseConfig } from '../firebase/config';
import { fusionnerProduits, fusionnerRayons, trouverRayon, type ProductOverride } from './catalogue-boutique';
import shopStaticData from './shop-firebase-dump.json';
import { SHOP_CATEGORIES, SHOP_PRODUCTS_DATA } from './shop-products-data';
import type { ShopCategory, ShopProduct } from './shop-types';
import { getProductDisplayPrice } from './shop-utils';
import { prixDe, variantesAchetables } from './shop-variantes';

// Une seule adresse : https://lebtex.ma répond 308 vers celle-ci
export const SITE_URL = 'https://www.lebtex.ma';

// Image de partage par défaut (public/og-lebtex.jpg : 1200 × 630, ~100 Ko)
export const IMAGE_PARTAGE = {
  url: '/og-lebtex.jpg',
  width: 1200,
  height: 630,
  alt: 'LEBTEX — mercerie en gros et au détail à Casablanca',
};

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
    const produits = fusionnerProduits(SHOP_PRODUCTS_DATA, dump.overrides || {}, dump.customProducts || []);
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
  return { etat: 'firestore', produit: { id, ...fiche.donnees, ...ov } as unknown as ShopProduct, masque: ov.hidden === true };
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

// « 60 DH », « 12,5 DH »
function montantDH(montant: number): string {
  return `${montant.toLocaleString('fr-MA', { maximumFractionDigits: 2 })} DH`;
}

const PHRASE_BOUTIQUE = 'Commandez chez LEBTEX, mercerie à Casablanca : livraison partout au Maroc, paiement à la livraison.';

// Titre d'une fiche : son nom, et son prix affiché s'il en a un (jamais le prix barré)
export function titreProduit(p: ShopProduct): string {
  const nom = nettoyer(p.name) || 'Produit';
  const { amount, isFrom } = getProductDisplayPrice(p);
  if (!(amount > 0)) return nom;
  return `${nom} – ${isFrom ? 'à partir de ' : ''}${montantDH(amount)}`;
}

// Description d'une fiche : le début de sa description, sinon une phrase construite
export function descriptionProduit(p: ShopProduct, rayons: ShopCategory[]): string {
  const nom = nettoyer(p.name);
  for (const brut of [p.shortDescription, p.description]) {
    const texte = nettoyer(brut);
    if (texte.length >= 40 && texte.toLowerCase() !== nom.toLowerCase()) return couper(texte);
  }
  const rayon = nettoyer(rayons.find(c => c.slug === p.categorySlug)?.name || p.categoryName);
  const conditionnement = nettoyer(p.conditionnementUnitaire);
  return couper([
    `${nom}${rayon ? ` — ${rayon}` : ''}.`,
    conditionnement && `Conditionnement : ${conditionnement}.`,
    PHRASE_BOUTIQUE,
  ].filter(Boolean).join(' '), 160);
}

// Description d'un rayon : la sienne, sinon une phrase construite
export function descriptionRayon(c: ShopCategory): string {
  const texte = nettoyer(c.description);
  if (texte.length >= 40) return couper(texte);
  return couper(`${nettoyer(c.name)} en gros et au détail. ${PHRASE_BOUTIQUE}`, 160);
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

// Adresse canonique et aperçu de partage d'une page. Le titre et la description de
// l'aperçu reprennent ceux de la page (Next les recopie quand openGraph ne les donne pas).
export function adressePage(chemin: string, image?: ImagePartage): Metadata {
  const url = `${SITE_URL}${chemin}`;
  return {
    alternates: { canonical: url },
    openGraph: {
      type: 'website',
      locale: 'fr_MA',
      siteName: 'LEBTEX',
      url,
      images: [image ?? IMAGE_PARTAGE],
    },
    twitter: { card: 'summary_large_image' },
  };
}

// Titre (complété par « | LEBTEX »), description, adresse canonique et aperçu de partage
export function etiquettesPage({ titre, description, chemin, image }: {
  titre: string;
  description: string;
  chemin: string; // ex. '/shop/faq'
  image?: ImagePartage;
}): Metadata {
  return { title: titrePage(titre), description, ...adressePage(chemin, image) };
}

// Page personnelle (panier, commande, compte, suivi) : jamais dans Google
export function etiquettesPrivees(titre: string, description: string): Metadata {
  return {
    title: titrePage(titre),
    description,
    robots: { index: false, follow: true },
  };
}

// ─── Données structurées pour Google (JSON-LD) ──────────────────────────────
// Ce que Google peut montrer sous le lien : le prix et le chemin « Accueil › Rayon › Produit ».
// Seulement du vrai : le prix affiché (celui qui sera facturé, jamais un prix barré),
// aucun avis, aucune note. Un produit sans prix (« Prix sur demande ») n'a pas de fiche Product.

type DonneesStructurees = Record<string, unknown>;

export function adresseProduit(id: string): string {
  return `${SITE_URL}/shop/produit/${encodeURIComponent(id)}`;
}

export function adresseRayon(slug: string): string {
  return `${SITE_URL}/shop/categorie/${encodeURIComponent(slug)}`;
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
export function donneesProduit(p: ShopProduct, rayons: ShopCategory[]): DonneesStructurees | null {
  const { amount, isFrom } = getProductDisplayPrice(p);
  if (!(amount > 0)) return null;

  const url = adresseProduit(p.id);
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
    name: nettoyer(p.name) || 'Produit',
    ...(photos.length > 0 && { image: Array.from(new Set(photos)).slice(0, 10) }),
    description: descriptionProduit(p, rayons),
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

// Accueil, le rayon parent s'il y en a un (visible), puis le rayon
function etapesRayon(rayon: ShopCategory, rayons: ShopCategory[]): Etape[] {
  const parent = rayon.parentSlug ? trouverRayon(rayons, rayon.parentSlug) : null;
  return [
    { nom: 'Accueil', url: SITE_URL },
    ...(parent ? [{ nom: nettoyer(parent.name), url: adresseRayon(parent.slug) }] : []),
    { nom: nettoyer(rayon.name), url: adresseRayon(rayon.slug) },
  ];
}

// Page rayon : « Accueil › Rayon »
export function filArianeRayon(rayon: ShopCategory, rayons: ShopCategory[]): DonneesStructurees {
  return filAriane(etapesRayon(rayon, rayons));
}

// Fiche produit : « Accueil › Rayon › Produit » (sans le rayon s'il est introuvable ou masqué)
export function filArianeProduit(p: ShopProduct, rayons: ShopCategory[]): DonneesStructurees {
  const rayon = p.categorySlug ? trouverRayon(rayons, p.categorySlug) : null;
  return filAriane([
    ...(rayon ? etapesRayon(rayon, rayons) : [{ nom: 'Accueil', url: SITE_URL }]),
    { nom: nettoyer(p.name) || 'Produit', url: adresseProduit(p.id) },
  ]);
}

// Texte à mettre dans <script type="application/ld+json"> : « < » échappé, pour qu'un
// « </script> » dans un nom ou une description ne puisse pas fermer la balise
export function jsonLd(donnees: DonneesStructurees): string {
  return JSON.stringify(donnees).replace(/</g, '\\u003c');
}
