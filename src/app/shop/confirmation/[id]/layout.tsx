import type { Metadata } from 'next';
import { etiquettesPrivees } from '@/lib/catalogue-serveur';

// Page personnelle : un titre propre, jamais dans Google.
export const metadata: Metadata = etiquettesPrivees('Commande reçue', 'Le récapitulatif de votre commande LEBTEX.');

export default function Layout({ children }: { children: React.ReactNode }) {
  return children;
}
