import type { Metadata } from 'next';
import { headers } from 'next/headers';
import { notFound, permanentRedirect } from 'next/navigation';
import { donneesSecteur, etiquettesSecteur, filArianeSecteur, jsonLd, secteurDeLaPage } from '@/lib/catalogue-serveur';
import { decoderParametre, ENTETE_RECHERCHE, rechercheAGarder } from '@/lib/liens-boutique';
import { lienSecteur } from '@/lib/secteurs-boutique';

// Page d'un secteur en arabe : le même travail que le layout français
// (src/app/shop/secteurs/[slug]/layout.tsx, à garder pareil), à l'adresse
// /ar/shop/secteurs/… : étiquettes et données Google en arabe, vraie 404 pour un secteur
// inconnu ou sans assez de produits, redirection 308 vers l'adresse arabe du secteur (sans
// la recherche de l'adresse tant que src/middleware.ts ne couvre pas les secteurs : voir le
// layout français).

type Params = { params: Promise<{ slug: string }> };

export async function generateMetadata({ params }: Params): Promise<Metadata> {
  return etiquettesSecteur((await params).slug, 'ar');
}

export default async function SecteurLayoutArabe({ children, params }: Params & { children: React.ReactNode }) {
  const { slug } = await params;
  const rempli = secteurDeLaPage(slug);
  if (!rempli) notFound();
  if (decoderParametre(slug) !== rempli.secteur.slug) {
    const recherche = rechercheAGarder((await headers()).get(ENTETE_RECHERCHE));
    permanentRedirect(lienSecteur(rempli.secteur, 'ar') + recherche);
  }
  return (
    <>
      {[donneesSecteur(rempli, 'ar'), filArianeSecteur(rempli.secteur, 'ar')].map((d, i) => (
        <script key={i} type="application/ld+json" dangerouslySetInnerHTML={{ __html: jsonLd(d) }} />
      ))}
      {children}
    </>
  );
}
