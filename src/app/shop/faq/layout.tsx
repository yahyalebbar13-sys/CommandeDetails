import type { Metadata } from 'next';
import { etiquettesPage } from '@/lib/catalogue-serveur';

// Étiquette Google de la page FAQ (la page est un composant client).
export const metadata: Metadata = etiquettesPage({
  titre: 'Questions fréquentes',
  description:
    'Livraison partout au Maroc, retrait gratuit à Casablanca, rouleaux, paiement à la livraison, retours : les réponses aux questions des clients de LEBTEX.',
  chemin: '/shop/faq',
});

export default function Layout({ children }: { children: React.ReactNode }) {
  return children;
}
