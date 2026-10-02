import type { Metadata } from 'next';
import { etiquettesPrivees } from '@/lib/catalogue-serveur';

// Page personnelle : un titre propre, jamais dans Google.
export const metadata: Metadata = etiquettesPrivees('Suivi de commande', 'Suivez votre commande LEBTEX avec son numéro.');

export default function Layout({ children }: { children: React.ReactNode }) {
  return children;
}
