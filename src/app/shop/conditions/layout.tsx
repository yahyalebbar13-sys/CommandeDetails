import type { Metadata } from 'next';
import { adressePage } from '@/lib/catalogue-serveur';

// Adresse canonique et aperçu de partage ; le titre et la description sont ceux de la page.
export const metadata: Metadata = adressePage('/shop/conditions');

export default function Layout({ children }: { children: React.ReactNode }) {
  return children;
}
