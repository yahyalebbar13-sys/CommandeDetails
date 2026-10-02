import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import {
  catalogueFige, descriptionProduit, etiquettesPage, imageApercu, nettoyer, photoProduit,
  produitDeLaPage, titrePage, titreProduit,
} from '@/lib/catalogue-serveur';

// Fiche produit : la page elle-même est un composant client. Ce layout serveur lui donne
// son étiquette pour Google et l'aperçu WhatsApp (nom, prix, photo), et une vraie 404
// quand l'identifiant n'existe ni dans le catalogue figé ni dans Firestore.
// En cas de doute (Firestore injoignable), la page s'affiche normalement.

type Params = { params: Promise<{ id: string }> };

export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const { id } = await params;
  const chemin = `/shop/produit/${encodeURIComponent(id)}`;
  const trouve = await produitDeLaPage(id);

  if (trouve.etat === 'absent') return { title: titrePage('Produit introuvable'), robots: { index: false, follow: true } };
  if (trouve.etat === 'inconnu') {
    return etiquettesPage({
      titre: 'Produit',
      description: 'Mercerie LEBTEX à Casablanca : livraison partout au Maroc, paiement à la livraison.',
      chemin,
    });
  }

  const p = trouve.produit;
  const photo = imageApercu(photoProduit(p));
  const etiquettes = etiquettesPage({
    titre: titreProduit(p),
    description: descriptionProduit(p, catalogueFige().rayons),
    chemin,
    ...(photo && { image: { url: photo, alt: nettoyer(p.name) } }),
  });
  // Produit masqué dans l'admin : la fiche reste ouverte (comme avant), mais hors de Google
  if (trouve.etat === 'firestore' && trouve.masque) etiquettes.robots = { index: false, follow: true };
  return etiquettes;
}

export default async function ProduitLayout({ children, params }: Params & { children: React.ReactNode }) {
  const { id } = await params;
  if ((await produitDeLaPage(id)).etat === 'absent') notFound();
  return children;
}
