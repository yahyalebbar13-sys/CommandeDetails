import type { Metadata } from 'next';
import { etiquettesPrivees } from '@/lib/catalogue-serveur';

// Page personnelle en arabe : un titre propre, jamais dans Google.
export const metadata: Metadata = etiquettesPrivees('إتمام الطلب', 'معلوماتك وطريقة استلام طلبك من LEBTEX.');

export default function Layout({ children }: { children: React.ReactNode }) {
  return children;
}
