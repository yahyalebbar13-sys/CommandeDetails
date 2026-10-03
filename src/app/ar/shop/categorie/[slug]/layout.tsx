import type { Metadata } from 'next';
import { headers } from 'next/headers';
import { notFound, permanentRedirect } from 'next/navigation';
import { catalogueFige, etiquettesRayon, filArianeRayon, jsonLd } from '@/lib/catalogue-serveur';
import {
  decoderParametre, ENTETE_RECHERCHE, lienRayon, parametreRayon, rayonDepuisParametre, rechercheAGarder,
} from '@/lib/liens-boutique';

// Page rayon en arabe : le même travail que le layout français
// (src/app/shop/categorie/[slug]/layout.tsx, à garder pareil), à l'adresse /ar/shop/categorie/… :
// étiquettes et fil d'Ariane en arabe, vraie 404 pour un rayon inconnu ou masqué,
// redirection 308 d'un ancien slug ou d'une adresse publiée vers l'adresse arabe du moment.

type Params = { params: Promise<{ slug: string }> };

export async function generateMetadata({ params }: Params): Promise<Metadata> {
  return etiquettesRayon((await params).slug, 'ar');
}

export default async function RayonLayoutArabe({ children, params }: Params & { children: React.ReactNode }) {
  const { slug } = await params;
  const rayons = catalogueFige().rayons;
  const rayon = rayonDepuisParametre(slug, rayons);
  if (!rayon) notFound();
  if (decoderParametre(slug) !== parametreRayon(rayon)) {
    const recherche = rechercheAGarder((await headers()).get(ENTETE_RECHERCHE));
    permanentRedirect(lienRayon(rayon, 'ar') + recherche);
  }
  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: jsonLd(filArianeRayon(rayon, rayons, 'ar')) }} />
      {children}
    </>
  );
}
