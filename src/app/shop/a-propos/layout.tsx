import type { Metadata } from 'next';
import { etiquettesPage } from '@/lib/catalogue-serveur';

// Étiquette Google de la page À propos (la page est un composant client).
export const metadata: Metadata = etiquettesPage({
  titre: 'À propos',
  description:
    'LEBTEX, mercerie en gros et au détail à Casablanca : qui nous sommes, nos magasins, nos horaires, ce que nous vendons aux ateliers, tailleurs et merceries.',
  chemin: '/shop/a-propos',
});

export default function Layout({ children }: { children: React.ReactNode }) {
  return children;
}
