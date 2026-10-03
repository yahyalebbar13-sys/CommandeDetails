import type { Metadata } from 'next';
import { headers } from 'next/headers';
import { notFound, permanentRedirect } from 'next/navigation';
import { catalogueFige, etiquettesRayon, filArianeRayon, jsonLd } from '@/lib/catalogue-serveur';
import {
  decoderParametre, ENTETE_RECHERCHE, lienRayon, parametreRayon, rayonDepuisParametre, rechercheAGarder,
} from '@/lib/liens-boutique';

// Page rayon : la page elle-même est un composant client. Ce layout serveur lui donne
// son étiquette pour Google, son chemin « Accueil › Rayon » (données structurées), et une
// vraie 404 quand le rayon n'existe pas (ou est masqué).
// Même recherche que la page (rayonDepuisParametre) : la nouvelle adresse (nom du rayon),
// l'ancien slug ou l'identifiant ; la page ne lit les rayons que dans le catalogue figé au
// build, le serveur aussi. Une autre adresse que la nouvelle redirige (308) vers elle, avec
// la recherche de l'adresse (?ref=…) si un middleware la recopie dans ENTETE_RECHERCHE.
// La version arabe (src/app/ar/shop/categorie/[slug]/layout.tsx) fait la même chose sous /ar.

type Params = { params: Promise<{ slug: string }> };

function rayonDe(slug: string) {
  return rayonDepuisParametre(slug, catalogueFige().rayons);
}

// Étiquettes (lib/catalogue-serveur) : toujours la nouvelle adresse, même ouverte par un
// vieux lien, avec l'adresse arabe du rayon (hreflang)
export async function generateMetadata({ params }: Params): Promise<Metadata> {
  return etiquettesRayon((await params).slug, 'fr');
}

export default async function RayonLayout({ children, params }: Params & { children: React.ReactNode }) {
  const { slug } = await params;
  const rayon = rayonDe(slug);
  if (!rayon) notFound();
  if (decoderParametre(slug) !== parametreRayon(rayon)) {
    const recherche = rechercheAGarder((await headers()).get(ENTETE_RECHERCHE));
    permanentRedirect(lienRayon(rayon) + recherche);
  }
  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: jsonLd(filArianeRayon(rayon, catalogueFige().rayons)) }} />
      {children}
    </>
  );
}
