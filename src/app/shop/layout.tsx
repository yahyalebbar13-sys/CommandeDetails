import type { Metadata } from 'next';
import { ShopCartProvider } from '@/contexts/shop-cart-context';
import { ShopProductsProvider } from '@/contexts/shop-products-context';
import { LanguageProvider } from '@/contexts/language-context';
import ShopHeader from '@/components/shop/ShopHeader';
import ShopFooter from '@/components/shop/ShopFooter';
import CartDrawer from '@/components/shop/CartDrawer';

export const metadata: Metadata = {
  title: 'LEBTEX — Mercerie & Accessoires Textiles au Maroc',
  description:
    'Spécialiste en fermetures éclair, boutons, élastiques, rubans et accessoires textiles. Livraison rapide partout au Maroc. Paiement à la livraison.',
};

export default function ShopLayout({ children }: { children: React.ReactNode }) {
  return (
    <LanguageProvider>
      <ShopProductsProvider>
        <ShopCartProvider>
          <div
            className="min-h-screen flex flex-col"
            style={{ fontFamily: "'Inter', sans-serif", background: '#FBF8F3' }}
          >
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

