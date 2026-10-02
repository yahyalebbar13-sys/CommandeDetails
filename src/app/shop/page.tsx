import type { Metadata } from 'next';
import AccueilBoutique from './AccueilBoutique';
import { IMAGE_PARTAGE, SITE_URL } from '@/lib/catalogue-serveur';

// L'accueil est un composant client : ses étiquettes pour Google et WhatsApp vivent ici.
// « / » est réécrit vers /shop : les deux adresses déclarent la même adresse canonique.
// Le titre et la description viennent du layout de la boutique.
export const metadata: Metadata = {
  alternates: { canonical: SITE_URL },
  openGraph: { url: SITE_URL, type: 'website', siteName: 'LEBTEX', images: [IMAGE_PARTAGE] },
};

export default function ShopPage() {
  return <AccueilBoutique />;
}
