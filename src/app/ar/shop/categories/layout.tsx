import type { Metadata } from 'next';
import { etiquettesPage } from '@/lib/catalogue-serveur';

// Liste des rayons en arabe (la page est un composant client).
export const metadata: Metadata = etiquettesPage({
  titre: 'كل الفئات',
  description:
    'سحابات، خيوط، بطانة، حشوات، أزرار، مطاط: كل فئات خردوات الخياطة عند LEBTEX، بالجملة والتقسيط.',
  chemin: '/shop/categories',
  langue: 'ar',
});

export default function Layout({ children }: { children: React.ReactNode }) {
  return children;
}
