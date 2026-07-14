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
      prefetch={true}
      className="shop-product-card group relative bg-white rounded-2xl overflow-hidden border border-gray-100 shadow-sm flex flex-col h-full no-underline active:scale-[0.98] transition-transform duration-200 touch-manipulation"
    >
      {/* ── Image Section ─────────────────────────────────────── */}
      <div className="shop-img-zoom relative aspect-square bg-gray-100 overflow-hidden">
        <Image
          src={primaryImage}
          alt={product.name}
          fill
          sizes="(max-width: 640px) 50vw, (max-width: 1024px) 33vw, 25vw"
          className="object-cover"
          placeholder="blur"
          blurDataURL={BLUR_DATA_URL}
          loading="lazy"
          onLoad={() => setImgLoaded(true)}
        />
        
        {/* Skeleton — disparaît quand l'image est chargée */}
        {!imgLoaded && (
          <div className="absolute inset-0 bg-gradient-to-r from-gray-100 via-gray-50 to-gray-100 animate-pulse pointer-events-none" />
        )}

        {/* Badge Row */}
        <div className="absolute top-3 left-3 flex flex-col gap-1.5 pointer-events-none">
        </div>

        {/* Wishlist Button */}
        <button
          onClick={handleWishlist}
          aria-label={wishlisted ? 'Retirer des favoris' : 'Ajouter aux favoris'}
          className="absolute top-3 right-3 z-10 w-8 h-8 rounded-full bg-white/90 backdrop-blur-sm shadow-md flex items-center justify-center transition-all duration-200 hover:scale-110 active:scale-95"
        >
          <Heart
            className={`w-4 h-4 transition-colors duration-200 ${
              wishlisted ? 'fill-[#C8102E] text-[#C8102E]' : 'text-gray-400 hover:text-[#C8102E]'
            }`}
          />
        </button>

        {/* Mobile Quick-Add Button (Persistent) */}
        {showAddToCart && product.inStock && (
          <button
            onClick={handleAddToCart}
            disabled={added}
            aria-label="Ajouter au panier"
            className={`lg:hidden absolute bottom-3 right-3 z-10 w-9 h-9 rounded-full shadow-md flex items-center justify-center transition-all duration-200 active:scale-95 ${
              added ? 'bg-emerald-500 text-white' : 'bg-white text-[#0F0F0F] active:bg-gray-100'
            }`}
          >
            {added ? <CheckCircle2 className="w-5 h-5" /> : <ShoppingCart className="w-5 h-5" />}
          </button>
        )}

        {/* Desktop Quick-Add Overlay */}
        {showAddToCart && (
          <div
            className="hidden lg:flex absolute inset-0 items-end justify-center pb-4 z-10 pointer-events-none transition-all duration-300 opacity-0 group-hover:opacity-100"
            style={{ background: 'linear-gradient(to top, rgba(0,0,0,0.55) 0%, transparent 50%)' }}
          >
            <button
              onClick={handleAddToCart}
              disabled={!product.inStock || added}
              className={`pointer-events-auto flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-semibold shadow-lg transition-all duration-200 shop-btn-press ${
                added
                  ? 'bg-emerald-500 text-white'
                  : product.inStock
                  ? 'bg-white text-[#0F0F0F] hover:bg-[#C8102E] hover:text-white'
                  : 'bg-gray-300 text-gray-500 cursor-not-allowed'
              }`}
            >
              {added ? (
                <>
                  <CheckCircle2 className="w-4 h-4" />
                  Ajouté !
                </>
              ) : (
                <>
                  <ShoppingCart className="w-4 h-4" />
                  Ajouter au panier
                </>
              )}
            </button>
          </div>
        )}

        {/* Out of stock overlay */}
        {!product.inStock && (
          <div className="absolute inset-0 bg-white/60 flex items-center justify-center pointer-events-none">
            <span className="bg-white/95 text-gray-600 text-xs font-semibold px-3 py-1.5 rounded-full border border-gray-200 shadow-sm flex items-center gap-1.5">
              <AlertCircle className="w-3.5 h-3.5 text-red-400" />
              {language === 'ar' ? 'نفد المخزون' : 'Rupture de stock'}
            </span>
          </div>
        )}
      </div>

      {/* ── Content Section ───────────────────────────────────── */}
      <div className="p-4 flex flex-col gap-2 flex-grow">
        {/* Category */}
        <Link prefetch={true} >
          <span
            className="text-[11px] font-semibold uppercase tracking-widest hover:text-[#C8102E] transition-colors"
            style={{ color: '#D4A843' }}
          >
            {language === 'ar' && product.categoryNameAr ? product.categoryNameAr : product.categoryName}
          </span>
        </Link>

        {/* Product Name */}
        <Link prefetch={true} >
          <h3
            className={`text-[#0F0F0F] font-bold text-sm leading-snug line-clamp-2 group-hover:text-[#C8102E] transition-colors duration-200 ${language === 'ar' ? 'text-right' : ''}`}
            style={{ fontFamily: 'Outfit, sans-serif' }}
            dir={language === 'ar' ? 'rtl' : 'ltr'}
          >
            {language === 'ar' && product.nameAr ? product.nameAr : product.name}
          </h3>
        </Link>

        {/* Star Rating */}
        {product.rating !== undefined && (
          <StarRating rating={product.rating} reviewCount={product.reviewCount} />
        )}

        {/* Price Row & Mobile Add to Cart */}
        <div className="flex items-center justify-between mt-0.5">
          <div className="flex items-center gap-2 flex-wrap">
            <span
              className="text-sm font-semibold"
              style={{ color: '#C8102E', fontFamily: 'Outfit, sans-serif' }}
            >
              {language === 'ar' ? 'حسب الطلب' : 'Sur demande'}
            </span>
          </div>
        </div>

        {/* Stock Indicator */}
        <div className="flex items-center gap-1.5">
          {product.inStock ? (
            <>
              <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse inline-block" />
              <span className="text-xs text-emerald-600 font-medium">{language === 'ar' ? 'متوفر' : 'En stock'}</span>
            </>
          ) : (
            <>
              <span className="w-2 h-2 rounded-full bg-red-400 inline-block" />
              <span className="text-xs text-red-500 font-medium">{language === 'ar' ? 'نفد المخزون' : 'Rupture de stock'}</span>
            </>
          )}
        </div>

        {/* Min Order Note */}
        {product.minOrderQty && product.minOrderQty > 1 && (
          <div className="flex items-center gap-1.5 text-[11px] text-gray-400">
            <Package className="w-3 h-3" />
            <span>{language === 'ar' ? `الحد الأدنى للطلب : ${product.minOrderQty} قطع` : `Min. commande : ${product.minOrderQty} pcs`}</span>
          </div>
        )}
      </div>
      {/* ── Add to Cart Button ─────────────────────────────────── */}
      {showAddToCart && (
        <div className="px-4 pb-4">
          <button
            onClick={handleAddToCart}
            disabled={!product.inStock || added}
            className={`w-full flex items-center justify-center gap-2 py-2.5 rounded-xl text-sm font-semibold transition-all duration-200 shop-btn-press ${
              added
                ? 'bg-emerald-500 text-white shadow-md'
                : product.inStock
                ? 'bg-[#C8102E] text-white hover:bg-[#a00d25] shadow-md hover:shadow-lg hover:shadow-red-100'
                : 'bg-gray-100 text-gray-400 cursor-not-allowed'
            }`}
          >
            {added ? (
              <>
                <CheckCircle2 className="w-4 h-4" />
                {language === 'ar' ? '✓ تمت الإضافة' : '✓ Ajouté au panier'}
              </>
            ) : (
              <>
                <ShoppingCart className="w-4 h-4" />
                {product.inStock
                  ? (language === 'ar' ? 'إضافة للسلة' : 'Ajouter au panier')
                  : (language === 'ar' ? 'غير متوفر' : 'Indisponible')
                }
              </>
            )}
          </button>
        </div>
      )}
    </Link>
  );
});
