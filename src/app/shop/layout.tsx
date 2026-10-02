import type { Metadata } from 'next';
import { ShopCartProvider } from '@/contexts/shop-cart-context';
import { ShopProductsProvider } from '@/contexts/shop-products-context';
import { LanguageProvider } from '@/contexts/language-context';
import ShopHeader from '@/components/shop/ShopHeader';
import ShopFooter from '@/components/shop/ShopFooter';
import CartDrawer from '@/components/shop/CartDrawer';
import LocalBusinessSchema from '@/components/shop/LocalBusinessSchema';
import ChoixLangueAccueil from '@/components/shop/ChoixLangueAccueil';
import CaptureProvenance from '@/components/shop/CaptureProvenance';
import CompteurEvenements from '@/components/shop/CompteurEvenements';
import { IMAGE_PARTAGE, SITE_URL } from '@/lib/catalogue-serveur';

// Étiquettes par défaut de la boutique. Chaque page a les siennes (layout.tsx de son
// dossier) : titre complet « … | LEBTEX », description, adresse canonique. Rien ici
// ne doit faire croire à Google que toutes les pages sont l'accueil : pas d'adresse
// canonique, de hreflang ni d'openGraph.url communs (une vraie version /ar viendra plus tard).
// Pas de modèle de titre « %s | LEBTEX » : conditions, confidentialité et livraison
// écrivent déjà « | LEBTEX » dans le titre de leur page, il serait doublé.
export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: 'LEBTEX — Mercerie en gros et au détail à Casablanca | خردوات الخياطة',
  description:
    'Mercerie en gros et au détail à Casablanca — fermetures éclair, fils, doublures, entoilages, boutons. Livraison partout au Maroc, paiement à la livraison. ' +
    'خردوات الخياطة بالجملة والتقسيط في الدار البيضاء: سحابات، خيوط، بطانة، حشوات، أزرار. التوصيل لجميع مدن المغرب والدفع عند الاستلام.',
  keywords: [
    // French keywords
    'fermeture éclair', 'fermeture nylon', 'fermeture métal', 'fermeture plastique',
    'élastique', 'élastique couture', 'ruban élastique',
    'bouton', 'bouton pression', 'bouton couture',
    'ruban', 'ruban tissé', 'galon',
    'tissu', 'textile', 'mercerie',
    'fil à coudre', 'fil couture',
    'accessoires couture', 'accessoires textiles',
    'grossiste mercerie Maroc', 'mercerie Casablanca',
    'mercerie Marrakech', 'mercerie Rabat',
    'fourniture couture Maroc', 'atelier couture',
    'LEBTEX', 'lebtex.ma',
    // Arabic keywords
    'سحاب', 'سحاب نايلون', 'سحاب معدن', 'سحاب بلاستيك',
    'مطاط', 'شريط مطاط', 'مطاط خياطة',
    'أزرار', 'أزرار ضغط', 'أزرار خياطة',
    'شريط', 'خيط', 'خيوط خياطة',
    'قماش', 'أقمشة', 'نسيج',
    'خياطة', 'مستلزمات خياطة', 'مواد خياطة',
    'بالجملة المغرب', 'الدار البيضاء', 'مراكش', 'الرباط',
    'محل خياطة', 'لوازم خياطة المغرب',
  ],
  authors: [{ name: 'LEBTEX', url: SITE_URL }],
  creator: 'LEBTEX',
  publisher: 'LEBTEX',
  // Aperçu de partage par défaut : titre et description repris de chaque page
  openGraph: {
    type: 'website',
    locale: 'fr_MA',
    siteName: 'LEBTEX',
    images: [IMAGE_PARTAGE],
  },
  twitter: { card: 'summary_large_image' },
  robots: {
    index: true,
    follow: true,
    googleBot: { index: true, follow: true, 'max-image-preview': 'large' },
  },
  // Search Console : ajouter ici verification: { google: '<code>' } le jour où on l'a
};

export default function ShopLayout({ children }: { children: React.ReactNode }) {
  return (
    <LanguageProvider>
      <ShopProductsProvider masquerSansPrix>
        <ShopCartProvider>
          <LocalBusinessSchema />
          <div
            className="min-h-screen flex flex-col"
            style={{ fontFamily: "'Inter', sans-serif", background: '#FBF8F3' }}
          >
            <ShopHeader />
            <CartDrawer />
            <ChoixLangueAccueil />
            <CaptureProvenance />
            <CompteurEvenements />
            <main className="flex-grow pb-16 lg:pb-0">{children}</main>
            <ShopFooter />
          </div>
        </ShopCartProvider>
      </ShopProductsProvider>
    </LanguageProvider>
  );
}

