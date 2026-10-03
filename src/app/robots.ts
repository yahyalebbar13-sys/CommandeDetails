import { MetadataRoute } from 'next';
import { SITE_URL } from '@/lib/catalogue-serveur';

// Pages fermées aux robots : les outils internes.
// La boutique est ouverte dans ses deux langues : /shop (français) et /ar (arabe).
// Les pages personnelles de la boutique (panier, commande, compte, suivi, en français comme
// en arabe) ne sont PAS bloquées ici : elles disent « noindex », et Google doit pouvoir les
// lire pour le voir. Bloquée, une adresse partagée (ex. /shop/confirmation/…) pourrait entrer
// dans Google sans son contenu ; lue avec « noindex », elle en reste dehors.
// /catalogue reste ouvert : c'est le catalogue public (et /catalogue/service-import est
// lié depuis le menu de la boutique). /y-console n'est pas listé : sa page dit déjà
// « noindex » et l'écrire ici ne ferait que la signaler.
export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: '*',
        allow: ['/shop', '/ar'],
        disallow: ['/admin-shop', '/gestion', '/staff', '/api', '/client', '/stock'],
      },
    ],
    sitemap: `${SITE_URL}/sitemap.xml`,
    host: 'www.lebtex.ma',
  };
}
