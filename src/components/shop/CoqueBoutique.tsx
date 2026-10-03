import { ShopCartProvider } from '@/contexts/shop-cart-context';
import { ShopProductsProvider } from '@/contexts/shop-products-context';
import { LanguageProvider } from '@/contexts/language-context';
import ShopHeader from '@/components/shop/ShopHeader';
import ShopFooter from '@/components/shop/ShopFooter';
import CartDrawer from '@/components/shop/CartDrawer';
import LocalBusinessSchema from '@/components/shop/LocalBusinessSchema';
import ChoixLangueAccueil from '@/components/shop/ChoixLangueAccueil';
import ProvenanceUneFois from '@/components/shop/ProvenanceUneFois';
import CompteurEvenements from '@/components/shop/CompteurEvenements';
import type { Language } from '@/lib/translations';

// La coque de la boutique : fournisseurs (langue, catalogue sans les produits sans prix,
// panier), en-tête, tiroir du panier, pied de page. La même pour /shop (français, ou la
// langue choisie par le visiteur) et /ar (arabe imposé dès le rendu serveur).
// Composant serveur : LocalBusinessSchema lit le catalogue côté serveur.
export default function CoqueBoutique({ children, langue }: { children: React.ReactNode; langue?: Language }) {
  return (
    <LanguageProvider langue={langue}>
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
            {/* Remontée à chaque passage /shop ↔ /ar : la provenance n'est lue qu'au chargement */}
            <ProvenanceUneFois />
            <CompteurEvenements />
            <main className="flex-grow pb-16 lg:pb-0">{children}</main>
            <ShopFooter />
          </div>
        </ShopCartProvider>
      </ShopProductsProvider>
    </LanguageProvider>
  );
}
