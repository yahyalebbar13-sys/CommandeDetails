import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { trouverRayon } from '@/lib/catalogue-boutique';
import { catalogueFige, descriptionRayon, etiquettesPage, imageApercu, nettoyer, titrePage } from '@/lib/catalogue-serveur';

// Page rayon : la page elle-même est un composant client. Ce layout serveur lui donne
// son étiquette pour Google et une vraie 404 quand le rayon n'existe pas (ou est masqué).
// Même recherche que la page : le slug décodé, par slug ou par identifiant ; la page ne
// lit les rayons que dans le catalogue figé au build, le serveur aussi.

type Params = { params: Promise<{ slug: string }> };

function decoder(valeur: string): string {
  try {
    return decodeURIComponent(valeur);
  } catch {
    return valeur;
  }
}

function rayonDe(slug: string) {
  const { rayons } = catalogueFige();
  return trouverRayon(rayons, decoder(slug)) ?? trouverRayon(rayons, slug);
}

export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const { slug } = await params;
  const rayon = rayonDe(slug);
  if (!rayon) return { title: titrePage('Rayon introuvable'), robots: { index: false, follow: true } };

  const photo = imageApercu(rayon.image);
  return etiquettesPage({
    titre: nettoyer(rayon.name),
    description: descriptionRayon(rayon),
    // Toujours l'adresse par le slug, même ouverte par un vieux lien (identifiant)
    chemin: `/shop/categorie/${encodeURIComponent(rayon.slug)}`,
    ...(photo && { image: { url: photo, alt: nettoyer(rayon.name) } }),
  });
}

export default async function RayonLayout({ children, params }: Params & { children: React.ReactNode }) {
  const { slug } = await params;
  if (!rayonDe(slug)) notFound();
  return children;
}
