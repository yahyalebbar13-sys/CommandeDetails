import type { Metadata } from 'next';
import { etiquettesPage } from '@/lib/catalogue-serveur';

// Étiquette Google du catalogue complet (la page est un composant client).
// Les recherches (?q=…) et filtres gardent l'adresse canonique du catalogue.
export const metadata: Metadata = etiquettesPage({
  titre: 'Tous les produits',
  description:
    'Tout le catalogue de la mercerie LEBTEX : fermetures éclair, fils, doublures, entoilages, boutons. Livraison partout au Maroc, paiement à la livraison.',
  chemin: '/shop/boutique',
});

export default function Layout({ children }: { children: React.ReactNode }) {
  return children;
}
