'use client';

// ─── Ma liste : les produits gardés d'un cœur, sur ce téléphone ──────────────
// La liste (identifiants seulement) vit dans le navigateur (lib/ma-liste). On montre les
// cartes habituelles ; un produit disparu du catalogue (retiré, sans prix) n'est pas montré,
// sans rien dire. « Tout ajouter au panier » prend les produits sans choix de variante ;
// les autres gardent leur bouton « Choisir » (la fiche). Retirer un cœur fait disparaître la
// carte : le message « Retiré de Ma liste · Annuler » est donc hébergé par la page, hors des cartes.

import React, { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { CheckCircle2, Heart, Loader2, ShoppingCart, Truck } from 'lucide-react';
import ProductCard from '@/components/shop/ProductCard';
import { HoteMessageMaListe } from '@/components/shop/CoeurMaListe';
import { useLanguage } from '@/contexts/language-context';
import { useShopProducts } from '@/contexts/shop-products-context';
import { useShopCartActions } from '@/contexts/shop-cart-context';
import { useMaListe } from '@/lib/ma-liste';
import { ajoutRapide } from '@/lib/shop-variantes';
import { lienPage } from '@/lib/liens-boutique';
import type { CartItem, ShopProduct } from '@/lib/shop-types';

export default function MaListePage() {
  const { language } = useLanguage();
  const ar = language === 'ar';
  const ids = useMaListe();
  const { getProductById } = useShopProducts();
  const { addItems } = useShopCartActions();
  // Avant le montage, la liste lue est toujours vide (rendu serveur) : pas de « liste vide » trompeuse.
  const [monte, setMonte] = useState(false);
  const [ajoutes, setAjoutes] = useState(0);
  useEffect(() => setMonte(true), []);

  // Produits disparus du catalogue : écartés sans rien dire. Leur identifiant reste gardé :
  // un produit masqué faute de prix (ou ajouté après la mise en ligne) revient quand il réapparaît.
  const produits = useMemo(
    () => ids.map(id => getProductById(id)).filter((p): p is ShopProduct => !!p),
    [ids, getProductById]
  );

  // Ce qui part au panier d'un geste : en stock, avec un prix, sans taille ni couleur à choisir
  const directs = useMemo(
    () =>
      produits.flatMap((p): CartItem[] => {
        if (!p.inStock) return [];
        const ajout = ajoutRapide(p);
        return ajout.mode === 'direct' ? [{ ...ajout.item, productImage: ajout.item.productImage || p.images?.[0] || '' }] : [];
      }),
    [produits]
  );
  const aChoisir = useMemo(() => produits.filter(p => p.inStock && ajoutRapide(p).mode === 'choisir').length, [produits]);

  const toutAjouter = () => {
    if (directs.length === 0) return;
    addItems(directs); // ouvre le panier
    setAjoutes(directs.length);
  };

  return (
    <div className="max-w-7xl mx-auto px-4 py-8 sm:py-12">
      <div className="text-center mb-6">
        <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-[#C8102E] mb-3 shadow-lg shadow-[#C8102E]/25">
          <Heart className="w-7 h-7 text-white fill-white" />
        </div>
        <h1 className="text-3xl font-bold text-[#0F0F0F]">{ar ? 'قائمتي' : 'Ma liste'}</h1>
        <p className="text-gray-500 mt-2 text-sm">
          {ar
            ? 'المنتجات التي حفظتها بالقلب ♡ على هذا الهاتف (في هذا المتصفح)، لتطلبها بسهولة.'
            : 'Les produits gardés avec le cœur ♡ sur ce téléphone (dans ce navigateur), pour les commander facilement.'}
        </p>
      </div>

      {!monte ? (
        <div className="flex justify-center py-16">
          <Loader2 className="w-8 h-8 text-[#C8102E] animate-spin" />
        </div>
      ) : produits.length === 0 ? (
        <div className="max-w-md mx-auto bg-white rounded-2xl border border-gray-100 shadow-sm p-6 text-center">
          <p className="font-bold text-[#0F0F0F]">{ar ? 'قائمتك فارغة' : 'Votre liste est vide'}</p>
          <p className="text-sm text-gray-500 mt-2">
            {ar
              ? 'اضغط على القلب ♡ في أي منتج لتجده هنا، ثم أضفه إلى السلة بلمسة واحدة.'
              : 'Touchez le cœur ♡ sur un produit pour le retrouver ici, puis l’ajouter au panier d’un geste.'}
          </p>
          <Link
            href={lienPage('/shop/boutique', language)}
            className="mt-5 inline-flex min-h-[48px] items-center justify-center px-6 rounded-xl bg-[#C8102E] text-white font-bold text-sm hover:bg-[#a50d25] transition-colors"
          >
            {ar ? 'تصفح المتجر' : 'Voir la boutique'}
          </Link>
        </div>
      ) : (
        <>
          <div className="max-w-2xl mx-auto mb-6 space-y-2">
            {directs.length > 0 && (
              <button
                type="button"
                onClick={toutAjouter}
                className="flex w-full min-h-[52px] items-center justify-center gap-2 rounded-xl bg-[#C8102E] px-5 text-white font-bold text-sm shadow-md shadow-[#C8102E]/20 hover:bg-[#a50d25] transition-colors"
              >
                <ShoppingCart className="w-5 h-5" />
                {ar ? `أضف الكل إلى السلة (${directs.length})` : `Tout ajouter au panier (${directs.length})`}
              </button>
            )}
            <div aria-live="polite">
              {ajoutes > 0 && (
                <p className="flex items-center justify-center gap-1.5 text-sm font-semibold text-emerald-700">
                  <CheckCircle2 className="w-4 h-4" />
                  {ar ? `أُضيف إلى السلة: ${ajoutes}` : `${ajoutes} produit${ajoutes > 1 ? 's' : ''} ajouté${ajoutes > 1 ? 's' : ''} au panier`}
                </p>
              )}
            </div>
            {aChoisir > 0 && (
              <p className="text-center text-xs text-gray-500">
                {ar
                  ? `منتجات تحتاج اختيار المقاس أو اللون (${aChoisir}): اضغط «اختر».`
                  : `${aChoisir} produit${aChoisir > 1 ? 's demandent' : ' demande'} un choix (taille, couleur) : touchez « Choisir ».`}
              </p>
            )}
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-2.5 sm:gap-4">
            {produits.map(p => (
              <ProductCard key={p.id} product={p} />
            ))}
          </div>
        </>
      )}

      <div className="max-w-md mx-auto mt-10 text-center">
        <Link
          href={lienPage('/shop/suivi', language)}
          className="inline-flex min-h-[44px] items-center gap-2 text-sm font-semibold text-[#C8102E] hover:underline"
        >
          <Truck className="w-4 h-4" />
          {ar ? 'طلباتي وتتبعها' : 'Mes commandes et leur suivi'}
        </Link>
      </div>

      <HoteMessageMaListe />
    </div>
  );
}
