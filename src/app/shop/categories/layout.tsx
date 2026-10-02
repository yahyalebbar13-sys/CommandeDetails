import type { Metadata } from 'next';
import { etiquettesPage } from '@/lib/catalogue-serveur';

// Étiquette Google de la liste des rayons (la page est un composant client).
export const metadata: Metadata = etiquettesPage({
  titre: 'Tous les rayons',
  description:
    'Fermetures éclair, fils, doublures, entoilages, boutons, élastiques : tous les rayons de la mercerie LEBTEX, en gros et au détail.',
  chemin: '/shop/categories',
});

export default function Layout({ children }: { children: React.ReactNode }) {
  return children;
}
