'use client';

import React, { useState, useCallback } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { ShoppingCart, Star, StarHalf, AlertCircle, CheckCircle2 } from 'lucide-react';
import { useShopCartActions } from '@/contexts/shop-cart-context';
import { useLanguage } from '@/contexts/language-context';
import { formatPrice, getDiscountPercent } from '@/lib/shop-utils';
import type { ShopProduct } from '@/lib/shop-types';

// Tiny base64 blur placeholder (1×1 px gris clair) — évite le layout shift
const BLUR_DATA_URL =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mN8/+F9PQAI8wNPvd7POQAAAABJRU5ErkJggg==';

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
            <span className="text-[15px] font-extrabold text-[#1A1A1A] leading-tight">
              {language === 'ar' ? 'حسب الطلب' : 'Sur demande'}
            </span>
            {product.inStock && (
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

        {/* Rating — bottom */}
        {product.rating !== undefined && product.rating > 0 && (
          <div className="mt-1">
            <StarRating rating={product.rating} reviewCount={product.reviewCount} />
          </div>
        )}
      </div>
    </Link>
  );
});
