import type { Metadata } from 'next';
import { etiquettesPage } from '@/lib/catalogue-serveur';

// Catalogue complet en arabe (la page est un composant client). Les recherches (?q=…)
// et filtres gardent l'adresse canonique du catalogue.
export const metadata: Metadata = etiquettesPage({
  titre: 'كل المنتجات',
  description:
    'كل منتجات LEBTEX لخردوات الخياطة: سحابات، خيوط، بطانة، حشوات، أزرار. التوصيل لجميع مدن المغرب والدفع عند الاستلام.',
  chemin: '/shop/boutique',
  langue: 'ar',
});

export default function Layout({ children }: { children: React.ReactNode }) {
  return children;
}
