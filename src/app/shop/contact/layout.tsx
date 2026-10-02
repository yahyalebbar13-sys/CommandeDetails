import type { Metadata } from 'next';
import { etiquettesPage } from '@/lib/catalogue-serveur';

// Étiquette Google de la page Contact (la page est un composant client).
export const metadata: Metadata = etiquettesPage({
  titre: 'Contact',
  description:
    'Une question, une commande en gros ? Écrivez à LEBTEX sur WhatsApp au +212 760 998 347, du lundi au samedi de 8h30 à 18h30.',
  chemin: '/shop/contact',
});

export default function Layout({ children }: { children: React.ReactNode }) {
  return children;
}
