'use client';

import React, { useState, useCallback } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { ShoppingCart, Star, StarHalf, AlertCircle, CheckCircle2, Flame, Truck } from 'lucide-react';
import { useShopCartActions } from '@/contexts/shop-cart-context';
import { useLanguage } from '@/contexts/language-context';
import {
  CASABLANCA_FREE_DELIVERY_THRESHOLD,
  formatPrice,
  formatProductPrice,
  getDiscountPercent,
  getProductDisplayPrice,
  hasActivePromo,
} from '@/lib/shop-utils';
import type { ShopProduct } from '@/lib/shop-types';

// Tiny base64 blur placeholder (1×1 px gris clair) — évite le layout shift
const BLUR_DATA_URL =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mN8/+F9PQAI8wNPvd7POQAAAABJRU5ErkJggg==';

// En dessous de ce seuil, on affiche "Plus que N en stock" pour créer de l'urgence
// (mécanisme Temu/AliExpress) plutôt que le générique "En stock".
const LOW_STOCK_THRESHOLD = 5;

// ─── Star Rating (compact) ────────────────────────────────────────────────────
const StarRating = React.memo(function StarRating({ rating, reviewCount }: { rating: number; reviewCount?: number }) {
  const full = Math.floor(rating);
  const hasHalf = rating % 1 >= 0.5;
  const empty = 5 - full - (hasHalf ? 1 : 0);

  return (
    <div className="flex items-center gap-1">
      <div className="flex items-center">
        {Array.from({ length: full }).map((_, i) => (
          <Star key={`f-${i}`} className="w-3 h-3 fill-[#F59E0B] text-[#F59E0B]" />
        ))}
        {hasHalf && <StarHalf className="w-3 h-3 fill-[#F59E0B] text-[#F59E0B]" />}
        {Array.from({ length: empty }).map((_, i) => (
          <Star key={`e-${i}`} className="w-3 h-3 text-gray-200" />
        ))}
      </div>
      {reviewCount !== undefined && (
        <span className="text-[10px] text-gray-400">{reviewCount.toLocaleString()}</span>
      )}
    </div>
  );
});

// ─── Props ────────────────────────────────────────────────────────────────────
interface ProductCardProps {
  product: ShopProduct;
  showAddToCart?: boolean;
}

// ─── ProductCard — Temu Style ─────────────────────────────────────────────────
export default React.memo(function ProductCard({ product, showAddToCart = true }: ProductCardProps) {
  const { language } = useLanguage();
  const { addItem } = useShopCartActions();
  const [added, setAdded] = useState(false);
  const [imgLoaded, setImgLoaded] = useState(false);

  const primaryImage = product.images?.[0] || `https://picsum.photos/seed/${product.id}/600/600`;
  const isPromo = hasActivePromo(product.comparePrice, product.price);
  const discountPercent = isPromo ? getDiscountPercent(product.price, product.comparePrice as number) : 0;
  const isLowStock = product.inStock && product.stockQty > 0 && product.stockQty <= LOW_STOCK_THRESHOLD;
  const hasWholesalePrice = Boolean(product.wholesalePrice && product.wholesalePrice > 0 && product.wholesalePrice < product.price && product.minOrderQty && product.minOrderQty > 1);
  // Un seul exemplaire suffit à atteindre le seuil de livraison gratuite à Casablanca
  const unlocksFreeCasaDelivery = product.inStock && getProductDisplayPrice(product).amount >= CASABLANCA_FREE_DELIVERY_THRESHOLD;

  const handleAddToCart = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault();
      e.stopPropagation();
      if (!product.inStock) return;

      addItem({
        productId: product.id,
        productName: product.name,
        productImage: primaryImage,
        price: product.price,
        quantity: product.minOrderQty ?? 1,
        maxStock: product.stockQty,
      });

      setAdded(true);
      setTimeout(() => setAdded(false), 2000);
    },
    [addItem, product, primaryImage]
  );

  const productUrl = `/shop/produit/${product.id}`;

  return (
    <Link
      href={productUrl}
      prefetch={false}
      className="group relative bg-white rounded-lg overflow-hidden flex flex-col h-full no-underline cursor-pointer touch-manipulation hover:shadow-md transition-shadow duration-200"
    >
      {/* ── Image — clean, no overlays ─────────────────────────── */}
      <div className="relative aspect-square bg-gray-50 overflow-hidden">
        <Image
          src={primaryImage}
          alt={product.name}
          fill
          sizes="(max-width: 640px) 50vw, (max-width: 1024px) 33vw, 20vw"
          className="object-cover"
          placeholder="blur"
          blurDataURL={BLUR_DATA_URL}
          loading="lazy"
          onLoad={() => setImgLoaded(true)}
        />
        
        {/* Skeleton */}
        {!imgLoaded && (
          <div className="absolute inset-0 bg-gradient-to-r from-gray-100 via-gray-50 to-gray-100 animate-pulse pointer-events-none" />
        )}

        {/* Badge réduction — coin haut-gauche, très visible en scroll rapide */}
        {isPromo && discountPercent > 0 && (
          <span className="absolute top-1.5 left-1.5 bg-[#C8102E] text-white text-[10px] font-black px-1.5 py-0.5 rounded shadow-sm">
            -{discountPercent}%
          </span>
        )}
        {/* Badge nouveauté — coin haut-droit, seulement si pas de promo (évite la surcharge) */}
        {!isPromo && product.isNew && (
          <span className="absolute top-1.5 right-1.5 bg-emerald-500 text-white text-[9px] font-black px-1.5 py-0.5 rounded shadow-sm uppercase">
            {language === 'ar' ? 'جديد' : 'New'}
          </span>
        )}

        {/* Out of stock overlay */}
        {!product.inStock && (
          <div className="absolute inset-0 bg-white/50 flex items-center justify-center pointer-events-none">
            <span className="bg-white/90 text-gray-500 text-[10px] font-semibold px-2.5 py-1 rounded-full border border-gray-200 shadow-sm flex items-center gap-1">
              <AlertCircle className="w-3 h-3 text-red-400" />
              {language === 'ar' ? 'نفد المخزون' : 'Rupture'}
            </span>
          </div>
        )}
      </div>

      {/* ── Content — Temu style ───────────────────────────────── */}
      <div className="px-2 pt-2 pb-2 flex flex-col gap-0.5 flex-grow">
        {/* Product Name */}
        <h3
          className={`text-[#1A1A1A] font-normal text-xs leading-snug line-clamp-2 ${language === 'ar' ? 'text-right' : ''}`}
          dir={language === 'ar' ? 'rtl' : 'ltr'}
        >
          {language === 'ar' && product.nameAr ? product.nameAr : product.name}
        </h3>

        {/* Price row + cart button */}
        <div className="flex items-end justify-between mt-1">
          <div className="flex flex-col">
            <div className="flex flex-wrap items-baseline gap-x-1.5">
              <span className="text-[15px] font-extrabold text-[#C8102E] leading-tight whitespace-nowrap">
                {formatProductPrice(product, language)}
              </span>
              {isPromo && (
                <span className="text-[11px] text-gray-400 line-through leading-tight whitespace-nowrap">
                  {formatPrice(product.comparePrice as number)}
                </span>
              )}
            </div>
            {hasWholesalePrice && (
              <span className="text-[10px] font-semibold text-emerald-600 mt-0.5">
                {language === 'ar' ? `من ${product.minOrderQty}: ${formatPrice(product.wholesalePrice as number)}` : `À partir de ${product.minOrderQty} : ${formatPrice(product.wholesalePrice as number)}/pc`}
              </span>
            )}
            {isLowStock ? (
              <span className="text-[10px] font-semibold text-orange-500 mt-0.5 flex items-center gap-0.5">
                <Flame className="w-2.5 h-2.5" />
                {language === 'ar' ? `تبقى ${product.stockQty} فقط` : `Plus que ${product.stockQty} en stock`}
              </span>
            ) : product.inStock && !hasWholesalePrice && (
              <span className="text-[10px] text-gray-400 mt-0.5">
                {language === 'ar' ? 'متوفر' : 'En stock'}
              </span>
            )}
          </div>

          {/* Cart button — Temu style: small bordered square */}
          {showAddToCart && product.inStock && (
            <button
              onClick={handleAddToCart}
              disabled={added}
              aria-label="Ajouter au panier"
              className={`flex-shrink-0 w-8 h-8 rounded-lg border flex items-center justify-center transition-all duration-200 active:scale-90 cursor-pointer ${
                added
                  ? 'bg-emerald-500 border-emerald-500 text-white'
                  : 'bg-white border-gray-200 text-gray-500 hover:border-[#C8102E] hover:text-[#C8102E]'
              }`}
            >
              {added ? (
                <CheckCircle2 className="w-4 h-4" />
              ) : (
                <ShoppingCart className="w-4 h-4" />
              )}
            </button>
          )}
        </div>

        {unlocksFreeCasaDelivery && (
          <span className="mt-0.5 flex items-center gap-1 text-[10px] font-semibold text-emerald-600">
            <Truck className="w-3 h-3 flex-shrink-0" />
            {language === 'ar' ? 'توصيل مجاني للدار البيضاء' : 'Livraison gratuite Casa'}
          </span>
        )}

        {/* Rating — bottom, uniquement s'il y a au moins un avis réel (sinon 5 étoiles
            avec "0" à côté ressemble à une fausse note) */}
        {product.rating !== undefined && product.rating > 0 && Number(product.reviewCount) > 0 && (
          <div className="mt-1">
            <StarRating rating={product.rating} reviewCount={product.reviewCount} />
          </div>
        )}
      </div>
    </Link>
  );
});
