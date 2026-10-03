import type { Metadata } from 'next';
import { headers } from 'next/headers';
import { notFound, permanentRedirect } from 'next/navigation';
import { donneesSecteur, etiquettesSecteur, filArianeSecteur, jsonLd, secteurDeLaPage } from '@/lib/catalogue-serveur';
import { decoderParametre, ENTETE_RECHERCHE, rechercheAGarder } from '@/lib/liens-boutique';
import { lienSecteur } from '@/lib/secteurs-boutique';

// Page d'un secteur d'activité : la page elle-même est un composant client. Ce layout
// serveur lui donne son étiquette pour Google (titre et accroche du secteur, adresse
// canonique, version arabe), ses données structurées (la page et ses produits, le chemin
// « Accueil › Secteurs › Secteur »), et une vraie 404 quand le secteur n'existe pas ou
// n'a pas assez de produits (lib/secteurs-boutique, sur le catalogue figé au build, le
// même que celui du navigateur).
// Une adresse écrite autrement (majuscules, accents) redirige (308) vers celle du secteur.
// Attention : src/middleware.ts ne couvre pas encore /shop/secteurs ni /ar/shop/secteurs
// (son matcher : produit et categorie). La recherche de l'adresse (?utm_source=…, ?ref=…)
// est donc perdue lors de cette redirection ; pour la garder, ajouter
// '/shop/secteurs/:path*' et '/ar/shop/secteurs/:path*' au matcher. Les liens de la
// boutique donnent toujours le bon slug : seule une adresse tapée à la main est concernée.
// La version arabe (src/app/ar/shop/secteurs/[slug]/layout.tsx) fait la même chose sous /ar.

type Params = { params: Promise<{ slug: string }> };

export async function generateMetadata({ params }: Params): Promise<Metadata> {
  return etiquettesSecteur((await params).slug, 'fr');
}

export default async function SecteurLayout({ children, params }: Params & { children: React.ReactNode }) {
  const { slug } = await params;
  const rempli = secteurDeLaPage(slug);
  if (!rempli) notFound();
  if (decoderParametre(slug) !== rempli.secteur.slug) {
    const recherche = rechercheAGarder((await headers()).get(ENTETE_RECHERCHE));
    permanentRedirect(lienSecteur(rempli.secteur) + recherche);
  }
  return (
    <>
      {[donneesSecteur(rempli), filArianeSecteur(rempli.secteur)].map((d, i) => (
        <script key={i} type="application/ld+json" dangerouslySetInnerHTML={{ __html: jsonLd(d) }} />
      ))}
      {children}
    </>
  );
}
