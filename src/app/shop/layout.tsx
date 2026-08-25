import type { Metadata } from 'next';
import { ShopCartProvider } from '@/contexts/shop-cart-context';
import { ShopProductsProvider } from '@/contexts/shop-products-context';
import { LanguageProvider } from '@/contexts/language-context';
import ShopHeader from '@/components/shop/ShopHeader';
import ShopFooter from '@/components/shop/ShopFooter';
import CartDrawer from '@/components/shop/CartDrawer';
import LocalBusinessSchema from '@/components/shop/LocalBusinessSchema';

export const metadata: Metadata = {
  title: 'LEBTEX — Mercerie & Fermetures Éclair au Maroc | سحاب، مطاط، أزرار',
  description:
    'LEBTEX : spécialiste mercerie au Maroc. Fermetures éclair nylon & métal, élastiques, boutons, rubans, tissus, fils. Livraison rapide Casablanca, Rabat, Marrakech. Paiement à la livraison. سحاب، مطاط، أزرار، أقمشة بالجملة في المغرب.',
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
  authors: [{ name: 'LEBTEX', url: 'https://lebtex.ma' }],
  creator: 'LEBTEX',
  publisher: 'LEBTEX',
  metadataBase: new URL('https://lebtex.ma'),
  alternates: {
    canonical: 'https://lebtex.ma',
    languages: {
      'fr-MA': 'https://lebtex.ma',
      'ar-MA': 'https://lebtex.ma',
    },
  },
  openGraph: {
    type: 'website',
    locale: 'fr_MA',
    alternateLocale: 'ar_MA',
    url: 'https://lebtex.ma',
    siteName: 'LEBTEX',
    title: 'LEBTEX — Mercerie & Fermetures Éclair au Maroc',
    description: 'Fermetures éclair, élastiques, boutons, rubans, tissus. Livraison partout au Maroc. سحاب، مطاط، أزرار بالجملة في المغرب.',
    images: [{ url: '/hero-banner.png', width: 1200, height: 630, alt: 'LEBTEX Mercerie Maroc' }],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'LEBTEX — Mercerie & Fermetures Éclair au Maroc',
    description: 'Fermetures éclair, élastiques, boutons, rubans. Livraison rapide au Maroc.',
    images: ['/hero-banner.png'],
  },
  robots: {
    index: true,
    follow: true,
    googleBot: { index: true, follow: true, 'max-image-preview': 'large' },
  },
  verification: {
    google: '', // Add your Google Search Console verification code here
  },
};

export default function ShopLayout({ children }: { children: React.ReactNode }) {
  return (
    <LanguageProvider>
      <ShopProductsProvider>
        <ShopCartProvider>
          <LocalBusinessSchema />
          <div
            className="min-h-screen flex flex-col"
            style={{ fontFamily: "'Inter', sans-serif", background: '#FBF8F3' }}
          >
            {/* Construction Banner */}
            <div className="bg-[#1A1A1A] text-white text-center py-2.5 px-4 text-xs sm:text-sm font-medium relative flex items-center justify-center gap-2 z-[60]">
              <span className="relative flex h-2 w-2 shrink-0">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-amber-400 opacity-75"></span>
                <span className="relative inline-flex rounded-full h-2 w-2 bg-amber-500"></span>
              </span>
              <span>🚧 Site en construction — Les commandes ne sont pas encore disponibles.</span>
              <span className="hidden sm:inline text-white/50">|</span>
              <span className="hidden sm:inline text-white/60" dir="rtl">الموقع تحت الإنشاء — الطلبات غير متاحة حالياً</span>
            </div>
            
            <ShopHeader />
            <CartDrawer />
            <main className="flex-grow">{children}</main>
            <ShopFooter />
          </div>
        </ShopCartProvider>
      </ShopProductsProvider>
    </LanguageProvider>
  );
}

