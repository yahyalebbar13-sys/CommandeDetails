import type { Metadata } from 'next';
import { etiquettesPage } from '@/lib/catalogue-serveur';

// Contact en arabe (la page est un composant client).
export const metadata: Metadata = etiquettesPage({
  titre: 'اتصل بنا',
  description:
    'سؤال أو طلب بالجملة؟ راسلوا LEBTEX على واتساب 0760998347، من الإثنين إلى السبت، 8:30–12:30 و 14:00–18:00.',
  chemin: '/shop/contact',
  langue: 'ar',
});

export default function Layout({ children }: { children: React.ReactNode }) {
  return children;
}
