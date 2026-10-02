import type { MetadataRoute } from 'next';
import { catalogueFige, photoProduit, SITE_URL } from '@/lib/catalogue-serveur';

// Plan du site pour Google (/sitemap.xml), refait à chaque build depuis le catalogue figé :
// l'accueil, les pages d'information publiques, les rayons et les fiches visibles
// (sans les masqués). Les pages personnelles (panier, commande, compte, suivi) n'y sont pas.
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

export default function sitemap(): MetadataRoute.Sitemap {
  const { produits, rayons } = catalogueFige();
  return [
    { url: SITE_URL },
    ...PAGES_INFO.map(chemin => ({ url: `${SITE_URL}${chemin}` })),
    ...rayons.map(c => ({ url: `${SITE_URL}/shop/categorie/${encodeURIComponent(c.slug)}` })),
    ...produits.map(p => {
      const photo = photoProduit(p);
      const adressePhoto = photo?.startsWith('/') ? `${SITE_URL}${photo}` : photo;
      return {
        url: `${SITE_URL}/shop/produit/${encodeURIComponent(p.id)}`,
        ...(adressePhoto && /^https:\/\//.test(adressePhoto) && { images: [xml(adressePhoto)] }),
      };
    }),
  ];
}
