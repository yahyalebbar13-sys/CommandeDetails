import type { MetadataRoute } from 'next';
import { adresseComplete, adressesLangues, catalogueFige, photoProduit, SITE_URL } from '@/lib/catalogue-serveur';
import { lienProduit, lienRayon } from '@/lib/liens-boutique';

// Plan du site pour Google (/sitemap.xml), refait à chaque build depuis le catalogue figé :
// l'accueil, les pages d'information publiques, les rayons et les fiches visibles
// (sans les masqués), à leur adresse lisible (lib/liens-boutique), en français et en arabe
// (/ar/shop/…). Chaque page traduite donne ses deux adresses (hreflang fr-MA, ar-MA,
// x-default). Une page pas encore traduite (lib/liens-boutique) n'y est qu'en français.
// Les pages personnelles (panier, commande, compte, suivi) n'y sont pas.
// Pas de date de modification : le catalogue n'en garde pas, et la date du build mentirait.

const PAGES_INFO = [
  '/shop/boutique',
  '/shop/categories',
  '/shop/livraison',
  '/shop/faq',
  '/shop/contact',
  '/shop/a-propos',
  '/shop/precommande',
  '/shop/conditions',
  '/shop/confidentialite',
];

// Next écrit les adresses telles quelles dans le XML : les « & » des liens photo
// (…?alt=media&token=…) doivent être échappés
function xml(texte: string): string {
  return texte
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

type Entree = MetadataRoute.Sitemap[number];

// L'adresse française d'une page, puis son adresse arabe si elle est traduite
function entrees(chemin: string, extra: Partial<Entree> = {}): MetadataRoute.Sitemap {
  const langues = adressesLangues(chemin);
  if (!langues) return [{ url: adresseComplete(chemin, 'fr'), ...extra }];
  return [langues['fr-MA'], langues['ar-MA']].map(url => ({ url, alternates: { languages: langues }, ...extra }));
}

export default function sitemap(): MetadataRoute.Sitemap {
  const { produits, rayons } = catalogueFige();
  return [
    ...entrees('/shop'),
    ...PAGES_INFO.flatMap(chemin => entrees(chemin)),
    ...rayons.flatMap(c => entrees(lienRayon(c))),
    ...produits.flatMap(p => {
      const photo = photoProduit(p);
      const adressePhoto = photo?.startsWith('/') ? `${SITE_URL}${photo}` : photo;
      return entrees(
        lienProduit(p),
        adressePhoto && /^https:\/\//.test(adressePhoto) ? { images: [xml(adressePhoto)] } : {},
      );
    }),
  ];
}
