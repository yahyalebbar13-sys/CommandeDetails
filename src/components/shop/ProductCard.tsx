'use client';

import React, { useState, useCallback } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { ShoppingCart, Heart, Star, StarHalf, Package, AlertCircle, CheckCircle2 } from 'lucide-react';
import { useShopCartActions } from '@/contexts/shop-cart-context';
import { useLanguage } from '@/contexts/language-context';
import { formatPrice, getDiscountPercent } from '@/lib/shop-utils';
import type { ShopProduct } from '@/lib/shop-types';

// Tiny base64 blur placeholder (1×1 px gris clair) — évite le layout shift
const BLUR_DATA_URL =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mN8/+F9PQAI8wNPvd7POQAAAABJRU5ErkJggg==';

// ─── Star Rating ──────────────────────────────────────────────────────────────
const StarRating = React.memo(function StarRating({ rating, reviewCount }: { rating: number; reviewCount?: number }) {
  const full = Math.floor(rating);
  const hasHalf = rating % 1 >= 0.5;
  const empty = 5 - full - (hasHalf ? 1 : 0);

  return (
    <div className="flex items-center gap-1.5">
      <div className="flex items-center gap-0.5">
        {Array.from({ length: full }).map((_, i) => (
          <Star key={`f-${i}`} className="w-3.5 h-3.5 fill-[#D4A843] text-[#D4A843]" />
        ))}
        {hasHalf && <StarHalf className="w-3.5 h-3.5 fill-[#D4A843] text-[#D4A843]" />}
        {Array.from({ length: empty }).map((_, i) => (
          <Star key={`e-${i}`} className="w-3.5 h-3.5 text-gray-300" />
        ))}
      </div>
      {reviewCount !== undefined && (
        <span className="text-xs text-gray-400 font-medium">({reviewCount})</span>
      )}
    </div>
  );
});

// ─── Props ────────────────────────────────────────────────────────────────────
interface ProductCardProps {
  product: ShopProduct;
  showAddToCart?: boolean;
}

// ─── ProductCard ──────────────────────────────────────────────────────────────
export default React.memo(function ProductCard({ product, showAddToCart = true }: ProductCardProps) {
  const { language } = useLanguage();
  const { addItem } = useShopCartActions();
  const [wishlisted, setWishlisted] = useState(false);
  const [added, setAdded] = useState(false);

  const [imgLoaded, setImgLoaded] = useState(false);

  const discountPct = product.comparePrice
    ? getDiscountPercent(product.price, product.comparePrice)
    : 0;

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

  const handleWishlist = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setWishlisted((prev) => !prev);
  }, []);

  const productUrl = `/shop/produit/${product.id}`;

  return (
    <Link
      href={productUrl}
      prefetch={false}
      className="shop-product-card group relative bg-white rounded-xl overflow-hidden border border-gray-100/80 flex flex-col h-full no-underline cursor-pointer touch-manipulation hover:shadow-md transition-shadow duration-200"
    >
      {/* ── Image Section ─────────────────────────────────────── */}
      <div className="shop-img-zoom relative aspect-square bg-gray-50 overflow-hidden">
        <Image
          src={primaryImage}
          alt={product.name}
          fill
          sizes="(max-width: 640px) 50vw, (max-width: 1024px) 33vw, 20vw"
          className="object-cover transition-transform duration-500 group-hover:scale-105"
          placeholder="blur"
          blurDataURL={BLUR_DATA_URL}
          loading="lazy"
          onLoad={() => setImgLoaded(true)}
        />
        
        {/* Skeleton */}
        {!imgLoaded && (
          <div className="absolute inset-0 bg-gradient-to-r from-gray-100 via-gray-50 to-gray-100 animate-pulse pointer-events-none" />
        )}

        {/* Wishlist Button — small top-right */}
        <button
          onClick={handleWishlist}
          aria-label={wishlisted ? 'Retirer des favoris' : 'Ajouter aux favoris'}
          className="absolute top-2 right-2 z-10 w-7 h-7 rounded-full bg-white/80 backdrop-blur-sm flex items-center justify-center transition-all duration-200 hover:scale-110 active:scale-90 cursor-pointer shadow-sm"
        >
          <Heart
            className={`w-3.5 h-3.5 transition-colors duration-200 ${
              wishlisted ? 'fill-[#C8102E] text-[#C8102E]' : 'text-gray-400'
            }`}
          />
        </button>

        {/* Quick-Add "+" Button — Temu style, bottom-right of image */}
        {showAddToCart && product.inStock && (
          <button
            onClick={handleAddToCart}
            disabled={added}
            aria-label="Ajouter au panier"
            className={`absolute bottom-2 right-2 z-10 w-8 h-8 rounded-full flex items-center justify-center transition-all duration-200 active:scale-90 cursor-pointer shadow-md ${
              added
                ? 'bg-emerald-500 text-white'
                : 'bg-[#0F0F0F] text-white hover:bg-[#C8102E]'
            }`}
          >
            {added ? <CheckCircle2 className="w-4 h-4" /> : <span className="text-lg font-light leading-none">+</span>}
          </button>
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

      {/* ── Content Section — compact Temu style ───────────────── */}
      <div className="px-2.5 pt-2 pb-2.5 flex flex-col gap-1 flex-grow">
        {/* Product Name */}
        <h3
          className={`text-[#1A1A1A] font-medium text-xs leading-snug line-clamp-2 group-hover:text-[#C8102E] transition-colors duration-200 ${language === 'ar' ? 'text-right' : ''}`}
          dir={language === 'ar' ? 'rtl' : 'ltr'}
        >
          {language === 'ar' && product.nameAr ? product.nameAr : product.name}
        </h3>

        {/* Price */}
        <div className="flex items-center gap-1.5 mt-0.5">
          <span className="text-[13px] font-bold text-[#C8102E]">
            {language === 'ar' ? 'حسب الطلب' : 'Sur demande'}
          </span>
        </div>

        {/* Stock + category in one line */}
        <div className="flex items-center justify-between mt-auto pt-1">
          <div className="flex items-center gap-1">
            <span className={`w-1.5 h-1.5 rounded-full ${product.inStock ? 'bg-emerald-500' : 'bg-red-400'}`} />
            <span className={`text-[10px] font-medium ${product.inStock ? 'text-emerald-600' : 'text-red-400'}`}>
              {product.inStock
                ? (language === 'ar' ? 'متوفر' : 'En stock')
                : (language === 'ar' ? 'نفد' : 'Rupture')
              }
            </span>
          </div>
          {product.minOrderQty && product.minOrderQty > 1 && (
            <span className="text-[9px] text-gray-400 font-medium">
              Min. {product.minOrderQty}
            </span>
          )}
        </div>
      </div>
    </Link>
  );
});
