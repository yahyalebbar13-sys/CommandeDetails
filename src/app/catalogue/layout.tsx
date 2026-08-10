import { ShopProductsProvider } from '@/contexts/shop-products-context';

export const metadata = {
  title: 'Catalogue LEBTEX — Mercerie & Accessoires Textiles',
  description: 'Catalogue complet des produits LEBTEX. Fermetures éclair, élastiques, boutons, rubans, tissus.',
};

export default function CatalogueLayout({ children }: { children: React.ReactNode }) {
  return (
    <ShopProductsProvider>
      <div style={{ fontFamily: "'Inter', sans-serif", background: '#FBF8F3', minHeight: '100vh' }}>
        {children}
      </div>
    </ShopProductsProvider>
  );
}
