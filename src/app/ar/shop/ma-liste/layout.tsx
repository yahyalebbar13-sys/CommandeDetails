import type { Metadata } from 'next';
import { etiquettesPrivees } from '@/lib/catalogue-serveur';

// Page personnelle en arabe (la liste vit sur le téléphone du client) : jamais dans Google.
export const metadata: Metadata = etiquettesPrivees('قائمتي', 'منتجات LEBTEX المحفوظة على هذا الهاتف، للطلب بلمسة واحدة.');

export default function Layout({ children }: { children: React.ReactNode }) {
  return children;
}
