import type { Metadata } from 'next';
import AccueilBoutique from './AccueilBoutique';
import { adressePage } from '@/lib/catalogue-serveur';

// L'accueil est un composant client : ses étiquettes pour Google et WhatsApp vivent ici.
// « / » est réécrit vers /shop : les deux adresses déclarent la même adresse canonique
// (https://www.lebtex.ma), et l'accueil arabe /ar/shop comme version arabe (hreflang).
// Le titre et la description viennent du layout de la boutique.
export const metadata: Metadata = adressePage('/shop');

export default function ShopPage() {
  return <AccueilBoutique />;
}
