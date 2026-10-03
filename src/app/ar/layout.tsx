import type { Metadata } from 'next';
import CoqueBoutique from '@/components/shop/CoqueBoutique';
import { IMAGE_PARTAGE_AR, SITE_URL } from '@/lib/catalogue-serveur';

// Version arabe de la boutique, à ses propres adresses : /ar/shop/… (lib/liens-boutique).
// Les pages sont celles de /shop (re-exportées, rien de dupliqué), dans la même coque, avec
// l'arabe imposé dès le rendu serveur : Google lit le texte arabe, le conteneur porte
// dir="rtl" et lang="ar" (la balise <html> du site reste lang="fr" : le layout racine est
// partagé avec /gestion et /stock).
// Étiquettes par défaut en arabe ; chaque page a les siennes (titre, adresse canonique /ar,
// hreflang vers sa version française). Pas d'adresse canonique ni de hreflang communs.
export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: 'LEBTEX — خردوات الخياطة بالجملة والتقسيط في الدار البيضاء',
  description:
    'خردوات الخياطة بالجملة والتقسيط في الدار البيضاء: سحابات، خيوط، بطانة، حشوات، أزرار. التوصيل لجميع مدن المغرب والدفع عند الاستلام.',
  keywords: [
    'خردوات الخياطة', 'لوازم الخياطة', 'مستلزمات الخياطة', 'سحاب', 'سحاب نايلون', 'سحاب معدن', 'سحاب بلاستيك',
    'خيط خياطة', 'بطانة', 'حشوة', 'أزرار', 'مطاط', 'شريط', 'قماش',
    'بالجملة', 'الدار البيضاء', 'المغرب', 'LEBTEX', 'lebtex.ma',
  ],
  authors: [{ name: 'LEBTEX', url: SITE_URL }],
  creator: 'LEBTEX',
  publisher: 'LEBTEX',
  openGraph: {
    type: 'website',
    locale: 'ar_MA',
    siteName: 'LEBTEX',
    images: [IMAGE_PARTAGE_AR],
  },
  twitter: { card: 'summary_large_image' },
  robots: {
    index: true,
    follow: true,
    googleBot: { index: true, follow: true, 'max-image-preview': 'large' },
  },
};

export default function BoutiqueArabeLayout({ children }: { children: React.ReactNode }) {
  return <CoqueBoutique langue="ar">{children}</CoqueBoutique>;
}
