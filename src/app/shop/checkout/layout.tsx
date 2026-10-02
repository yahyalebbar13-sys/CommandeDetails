import type { Metadata } from 'next';
import { etiquettesPrivees } from '@/lib/catalogue-serveur';

// Page personnelle : un titre propre, jamais dans Google.
export const metadata: Metadata = etiquettesPrivees('Finaliser la commande', 'Vos coordonnées et le mode de réception de votre commande LEBTEX.');

export default function Layout({ children }: { children: React.ReactNode }) {
  return children;
}
