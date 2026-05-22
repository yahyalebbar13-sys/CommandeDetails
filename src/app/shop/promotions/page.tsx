"use client";
import React, { useState } from 'react';
import Link from 'next/link';
import { Tag, Clock, Zap, ShoppingBag } from 'lucide-react';
import { useShopProducts } from '@/contexts/shop-products-context';
import { formatPrice, getDiscountPercent } from '@/lib/shop-utils';
import { useShopCart } from '@/contexts/shop-cart-context';
import type { ShopProduct } from '@/lib/shop-types';

function PromoCard({ product }: { product: ShopProduct }) {
  const { addItem } = useShopCart();
  const [added, setAdded] = useState(false);
  const discount = product.comparePrice ? getDiscountPercent(product.price, product.comparePrice) : 0;

  const handleAdd = (e: React.MouseEvent) => {
    e.preventDefault();
    addItem({ productId: product.id, productName: product.name, productImage: product.images[0], price: product.price, quantity: product.minOrderQty || 1, maxStock: product.stockQty });
    setAdded(true);
    setTimeout(() => setAdded(false), 2000);
  };

  return (
    <Link href={`/shop/produit/${product.id}`} className="block group">
      <div className="bg-white border border-[#E8E4DF] rounded-2xl overflow-hidden shop-product-card">
        <div className="relative aspect-square bg-gray-50 shop-img-zoom">
          <img src={product.images[0]} alt={product.name} className="w-full h-full object-cover" />
          {/* Promo badge */}
          {discount > 0 && (
            <div className="absolute top-3 left-3">
              <span className="bg-[#C8102E] text-white font-black text-sm px-3 py-1 rounded-full shadow-lg">-{discount}%</span>
            </div>
          )}
          {product.isNew && (
            <div className="absolute top-3 right-3">
              <span className="bg-[#10B981] text-white font-black text-xs px-2 py-1 rounded-full">NOUVEAU</span>
            </div>
          )}
          <div className="absolute inset-x-0 bottom-0 p-3 opacity-0 group-hover:opacity-100 transition-opacity">
            <button onClick={handleAdd}
              className={`w-full py-2 rounded-xl text-sm font-bold transition-all ${added ? 'bg-[#10B981] text-white' : 'bg-[#0F0F0F] text-white hover:bg-[#C8102E]'}`}>
              {added ? '✓ Ajouté !' : '+ Ajouter au panier'}
            </button>
          </div>
        </div>
        <div className="p-4">
          <p className="text-xs font-semibold text-[#D4A843] uppercase mb-1">{product.categoryName}</p>
          <h3 className="font-semibold text-[#1A1A1A] text-sm line-clamp-2 mb-3" style={{ fontFamily: 'Outfit, sans-serif' }}>{product.name}</h3>
          <div className="flex items-center gap-2">
            <span className="font-black text-[#C8102E] text-lg">{formatPrice(product.price)}</span>
            {product.comparePrice && (
              <div className="flex flex-col">
                <span className="text-xs text-[#6B6B6B] line-through">{formatPrice(product.comparePrice)}</span>
                <span className="text-xs text-[#10B981] font-bold">Économisez {formatPrice(product.comparePrice - product.price)}</span>
              </div>
            )}
          </div>
        </div>
      </div>
    </Link>
  );
}

export default function PromotionsPage() {
  const { getPromoProducts, getNewProducts, getFeaturedProducts } = useShopProducts();
  
  const promoProducts = getPromoProducts(100);
  const newProducts = getNewProducts(100);
  const featuredProducts = getFeaturedProducts(100);
  
  const [activeTab, setActiveTab] = useState<'promos' | 'nouveautes' | 'vedettes'>('promos');

  const tabs = [
    { key: 'promos', label: '🏷️ Promotions', count: promoProducts.length },
    { key: 'nouveautes', label: '✨ Nouveautés', count: newProducts.length },
    { key: 'vedettes', label: '⭐ Vedettes', count: featuredProducts.length },
  ] as const;

  const activeProducts = activeTab === 'promos' ? promoProducts
    : activeTab === 'nouveautes' ? newProducts
    : featuredProducts;

  return (
    <div style={{ fontFamily: 'Inter, sans-serif', background: '#FBF8F3' }} className="min-h-screen">
      {/* Hero banner */}
      <div className="bg-gradient-to-br from-[#C8102E] via-[#a00d25] to-[#0F0F0F] text-white py-16 overflow-hidden relative">
        <div className="absolute inset-0 opacity-10" style={{ backgroundImage: 'radial-gradient(circle at 20% 50%, #D4A843 0%, transparent 50%), radial-gradient(circle at 80% 20%, #ffffff 0%, transparent 40%)' }} />
        <div className="max-w-6xl mx-auto px-6 relative z-10">
          <div className="flex flex-col md:flex-row items-center justify-between gap-6">
            <div>
              <div className="flex items-center gap-2 mb-3">
                <Tag className="w-5 h-5 text-[#D4A843]" />
                <span className="text-[#D4A843] text-sm font-black uppercase tracking-widest">Offres Spéciales</span>
              </div>
              <h1 className="text-4xl md:text-6xl font-black mb-4 leading-none" style={{ fontFamily: 'Outfit, sans-serif' }}>
                Promotions<br />
                <span style={{ color: '#D4A843' }}>LEBTEX</span>
              </h1>
              <p className="text-red-200 text-lg max-w-md">Les meilleures offres sur nos accessoires textiles. Profitez-en avant épuisement des stocks !</p>
            </div>
            <div className="grid grid-cols-2 gap-3 text-center">
              {[
                { icon: Tag, val: `${promoProducts.length}`, label: 'Articles en promo' },
                { icon: Zap, val: 'Jusqu\'à -40%', label: 'De réduction' },
                { icon: Clock, val: 'Limité', label: 'Stocks disponibles' },
                { icon: ShoppingBag, val: '500 MAD', label: 'Livraison gratuite' },
              ].map(({ icon: Icon, val, label }) => (
                <div key={label} className="bg-white/10 backdrop-blur-sm border border-white/20 rounded-xl p-3">
                  <p className="font-black text-lg text-white">{val}</p>
                  <p className="text-red-200 text-xs">{label}</p>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      <div className="max-w-6xl mx-auto px-6 py-10">
        {/* Tabs */}
        <div className="flex gap-2 mb-8 overflow-x-auto">
          {tabs.map(({ key, label, count }) => (
            <button key={key} onClick={() => setActiveTab(key)}
              className={`flex items-center gap-2 px-5 py-2.5 rounded-full font-semibold text-sm whitespace-nowrap transition-all ${
                activeTab === key ? 'bg-[#C8102E] text-white shadow-lg shadow-[#C8102E]/20' : 'bg-white border border-[#E8E4DF] text-[#6B6B6B] hover:border-[#C8102E]'
              }`}>
              {label}
              <span className={`px-2 py-0.5 rounded-full text-xs font-black ${activeTab === key ? 'bg-white/20' : 'bg-[#F3EFE8] text-[#1A1A1A]'}`}>{count}</span>
            </button>
          ))}
        </div>

        {/* Free delivery reminder */}
        <div className="bg-[#D4A843]/10 border border-[#D4A843]/30 rounded-2xl p-4 mb-8 flex items-center gap-3">
          <span className="text-2xl">🎉</span>
          <div>
            <p className="font-bold text-[#1A1A1A]">Livraison GRATUITE dès 500 MAD</p>
            <p className="text-sm text-[#6B6B6B]">Profitez-en en combinant plusieurs articles en promotion</p>
          </div>
          <Link href="/shop/boutique" className="ml-auto shrink-0 px-4 py-2 bg-[#D4A843] text-white text-sm font-bold rounded-xl hover:bg-[#b8922e] transition-colors">
            Voir tout
          </Link>
        </div>

        {/* Products grid */}
        {activeProducts.length === 0 ? (
          <div className="text-center py-20">
            <p className="text-5xl mb-4">🛍️</p>
            <h3 className="text-xl font-bold text-[#1A1A1A] mb-2" style={{ fontFamily: 'Outfit, sans-serif' }}>Bientôt disponible</h3>
            <p className="text-[#6B6B6B]">De nouvelles offres arrivent prochainement !</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-5">
            {activeProducts.map(p => <PromoCard key={p.id} product={p} />)}
          </div>
        )}

        {/* Bottom CTA */}
        <div className="mt-12 bg-[#0F0F0F] rounded-2xl p-8 text-center text-white">
          <h3 className="text-2xl font-black mb-2" style={{ fontFamily: 'Outfit, sans-serif' }}>Voir tous nos produits</h3>
          <p className="text-gray-400 mb-5">Découvrez notre catalogue complet de mercerie et accessoires textiles</p>
          <Link href="/shop/boutique"
            className="inline-flex items-center gap-2 bg-[#C8102E] hover:bg-[#a00d25] text-white px-8 py-3 rounded-xl font-bold transition-colors">
            <ShoppingBag className="w-5 h-5" /> Accéder à la boutique
          </Link>
        </div>
      </div>
    </div>
  );
}
