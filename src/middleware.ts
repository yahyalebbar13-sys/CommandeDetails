import { NextResponse, type NextRequest } from 'next/server';
import { ENTETE_RECHERCHE } from '@/lib/liens-boutique';

// Fiches et rayons de la boutique : le layout redirige les anciennes adresses vers les
// adresses lisibles (308). Il ne voit pas les paramètres de l'adresse (?utm_source=, ?ref=) :
// on les lui passe dans un en-tête, pour qu'ils suivent la redirection et que la provenance
// de la commande reste juste. Rien d'autre n'est touché.
export function middleware(request: NextRequest) {
  const entetes = new Headers(request.headers);
  entetes.delete(ENTETE_RECHERCHE);
  if (request.nextUrl.search) entetes.set(ENTETE_RECHERCHE, request.nextUrl.search);
  return NextResponse.next({ request: { headers: entetes } });
}

export const config = {
  matcher: ['/shop/produit/:path*', '/shop/categorie/:path*', '/ar/shop/produit/:path*', '/ar/shop/categorie/:path*'],
};
