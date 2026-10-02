import type { Metadata } from 'next';
import { etiquettesPage } from '@/lib/catalogue-serveur';

// Étiquette Google de la page Promotions (la page est un composant client).
// Texte neutre : aucun pourcentage ici, le contenu de la page est en attente du patron.
export const metadata: Metadata = etiquettesPage({
  titre: 'Promotions',
  description:
    'Les articles en promotion chez LEBTEX, mercerie en gros et au détail à Casablanca.',
  chemin: '/shop/promotions',
});

export default function Layout({ children }: { children: React.ReactNode }) {
  return children;
}
