import type { Metadata } from 'next';
import { etiquettesPrivees } from '@/lib/catalogue-serveur';

// Page personnelle : un titre propre, jamais dans Google.
export const metadata: Metadata = etiquettesPrivees('Mon panier', 'Votre panier sur la boutique LEBTEX.');

export default function Layout({ children }: { children: React.ReactNode }) {
  return children;
}
