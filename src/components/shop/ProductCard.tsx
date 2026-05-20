'use client';

import React, { useState, useCallback } from 'react';
import Link from 'next/link';
import { ShoppingCart, Heart, Star, StarHalf, Package, AlertCircle, CheckCircle2, Eye } from 'lucide-react';
import { useShopCart } from '@/contexts/shop-cart-context';
import { formatPrice, getDiscountPercent } from '@/lib/shop-utils';
import type { ShopProduct } from '@/lib/shop-types';

// ─── Star Rating ──────────────────────────────────────────────────────────────
function StarRating({ rating, reviewCount }: { rating: number; reviewCount?: number }) {
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
}

// ─── Props ────────────────────────────────────────────────────────────────────
interface ProductCardProps {
  product: ShopProduct;
  showAddToCart?: boolean;
}

// ─── ProductCard ──────────────────────────────────────────────────────────────
export default function ProductCard({ product, showAddToCart = true }: ProductCardProps) {
  const { addItem } = useShopCart();
  const [wishlisted, setWishlisted] = useState(false);
  const [added, setAdded] = useState(false);
  const [isHovered, setIsHovered] = useState(false);

  const discountPct = product.comparePrice
    ? getDiscountPercent(product.price, product.comparePrice)
    : 0;

  const primaryImage = product.images[0] || `https://picsum.photos/seed/${product.id}/600/600`;

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

  return (
    <div
      className="shop-product-card group relative bg-white rounded-2xl overflow-hidden border border-gray-100 shadow-sm"
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
    >
      <Link href={`/shop/produit/${product.id}`} className="block" tabIndex={-1}>
        {/* ── Image Section ─────────────────────────────────────── */}
        <div className="shop-img-zoom relative aspect-square bg-gray-50 overflow-hidden">
          <img
            src={primaryImage}
            alt={product.name}
            className="w-full h-full object-cover"
            loading="lazy"
          />

          {/* Badge Row */}
          <div className="absolute top-3 left-3 flex flex-col gap-1.5 z-10">
            {product.isNew && (
              <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold tracking-wide bg-emerald-500 text-white shadow-md uppercase">
                NEW
              </span>
            )}
            {product.isPromo && (
              <span className="shop-badge-pulse inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold tracking-wide bg-[#C8102E] text-white shadow-md uppercase">
                PROMO
              </span>
            )}
            {discountPct > 0 && (
              <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold bg-[#D4A843] text-white shadow-md">
                -{discountPct}%
              </span>
            )}
          </div>

          {/* Wishlist Button */}
          <button
            onClick={handleWishlist}
            aria-label={wishlisted ? 'Retirer des favoris' : 'Ajouter aux favoris'}
            className="absolute top-3 right-3 z-20 w-8 h-8 rounded-full bg-white/90 backdrop-blur-sm shadow-md flex items-center justify-center transition-all duration-200 hover:scale-110 active:scale-95"
          >
            <Heart
              className={`w-4 h-4 transition-colors duration-200 ${
                wishlisted ? 'fill-[#C8102E] text-[#C8102E]' : 'text-gray-400 hover:text-[#C8102E]'
              }`}
            />
          </button>

          {/* Quick-Add Overlay */}
          {showAddToCart && (
            <div
              className={`absolute inset-0 flex items-end justify-center pb-4 z-10 transition-all duration-300 ${
                isHovered ? 'opacity-100' : 'opacity-0 pointer-events-none'
              }`}
              style={{ background: 'linear-gradient(to top, rgba(0,0,0,0.55) 0%, transparent 50%)' }}
            >
              <button
                onClick={handleAddToCart}
                disabled={!product.inStock || added}
                className={`flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-semibold shadow-lg transition-all duration-200 shop-btn-press ${
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
            <div className="absolute inset-0 bg-white/60 flex items-center justify-center z-10">
              <span className="bg-white/95 text-gray-600 text-xs font-semibold px-3 py-1.5 rounded-full border border-gray-200 shadow-sm flex items-center gap-1.5">
                <AlertCircle className="w-3.5 h-3.5 text-red-400" />
                Rupture de stock
              </span>
            </div>
          )}
        </div>

        {/* ── Content Section ───────────────────────────────────── */}
        <div className="p-4 flex flex-col gap-2">
          {/* Category */}
          <span
            className="text-[11px] font-semibold uppercase tracking-widest"
            style={{ color: '#D4A843' }}
          >
            {product.categoryName}
          </span>

          {/* Product Name */}
          <h3
            className="text-[#0F0F0F] font-bold text-sm leading-snug line-clamp-2 font-display group-hover:text-[#C8102E] transition-colors duration-200"
            style={{ fontFamily: 'Outfit, sans-serif' }}
          >
            {product.name}
          </h3>

          {/* Star Rating */}
          {product.rating !== undefined && (
            <StarRating rating={product.rating} reviewCount={product.reviewCount} />
          )}

          {/* Price Row */}
          <div className="flex items-center gap-2 flex-wrap mt-0.5">
            <span
              className="text-lg font-bold"
              style={{ color: '#0F0F0F', fontFamily: 'Outfit, sans-serif' }}
            >
              {formatPrice(product.price)}
            </span>
            {product.comparePrice && (
              <span className="text-sm text-gray-400 line-through">
                {formatPrice(product.comparePrice)}
              </span>
            )}
            {discountPct > 0 && (
              <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-md bg-red-50 text-[#C8102E] border border-red-100">
                -{discountPct}%
              </span>
            )}
          </div>

          {/* Stock Indicator */}
          <div className="flex items-center gap-1.5">
            {product.inStock ? (
              <>
                <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse inline-block" />
                <span className="text-xs text-emerald-600 font-medium">En stock</span>
              </>
            ) : (
              <>
                <span className="w-2 h-2 rounded-full bg-red-400 inline-block" />
                <span className="text-xs text-red-500 font-medium">Rupture de stock</span>
              </>
            )}
          </div>

          {/* Min Order Note */}
          {product.minOrderQty && product.minOrderQty > 1 && (
            <div className="flex items-center gap-1.5 text-[11px] text-gray-400">
              <Package className="w-3 h-3" />
              <span>Min. commande : {product.minOrderQty} pcs</span>
            </div>
          )}
        </div>
      </Link>

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
                ✓ Ajouté au panier
              </>
            ) : (
              <>
                <ShoppingCart className="w-4 h-4" />
                {product.inStock ? 'Ajouter au panier' : 'Indisponible'}
              </>
            )}
          </button>
        </div>
      )}
    </div>
  );
}
