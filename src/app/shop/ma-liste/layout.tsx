import type { Metadata } from 'next';
import { etiquettesPrivees } from '@/lib/catalogue-serveur';

// Page personnelle (la liste vit sur le téléphone du client) : un titre propre, jamais dans Google.
export const metadata: Metadata = etiquettesPrivees('Ma liste', 'Les produits LEBTEX gardés sur ce téléphone, à commander en un geste.');

export default function Layout({ children }: { children: React.ReactNode }) {
  return children;
}
