import type { Metadata } from 'next';
import { etiquettesPrivees } from '@/lib/catalogue-serveur';

// Page personnelle en arabe : un titre propre, jamais dans Google.
export const metadata: Metadata = etiquettesPrivees('سلة المشتريات', 'سلتك في متجر LEBTEX.');

export default function Layout({ children }: { children: React.ReactNode }) {
  return children;
}
