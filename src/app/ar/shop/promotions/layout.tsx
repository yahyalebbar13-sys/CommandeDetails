import type { Metadata } from 'next';
import { etiquettesPage } from '@/lib/catalogue-serveur';

// Promotions en arabe (la page est un composant client). Texte neutre, comme en français.
export const metadata: Metadata = etiquettesPage({
  titre: 'التخفيضات',
  description:
    'المنتجات المخفضة عند LEBTEX، خردوات الخياطة بالجملة والتقسيط في الدار البيضاء.',
  chemin: '/shop/promotions',
  langue: 'ar',
});

export default function Layout({ children }: { children: React.ReactNode }) {
  return children;
}
