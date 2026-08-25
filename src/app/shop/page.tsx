'use client';

import React from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { Truck, ArrowRight, Phone, ChevronRight, Sparkles, Zap } from 'lucide-react';
import { FREE_DELIVERY_THRESHOLD, formatPrice } from '@/lib/shop-utils';
import ProductCard from '@/components/shop/ProductCard';
import { useLanguage } from '@/contexts/language-context';
import { useShopProducts } from '@/contexts/shop-products-context';

// ─── Page Component ───────────────────────────────────────────────────────────
export default function ShopPage() {
  const { t } = useLanguage();
  const { categories: allContextCategories, getFeaturedProducts, getNewProducts, products } = useShopProducts();
  const SHOP_CATEGORIES = allContextCategories.filter(c => !c.parentSlug);
  const FEATURED_PRODUCTS = getFeaturedProducts(12);
  const NEW_PRODUCTS = getNewProducts(8);

  return (
    <main className="min-h-screen bg-[#FBF8F3]" style={{ fontFamily: 'Inter, sans-serif' }}>

      {/* ═══════════════════════════════════════════════════════════════════ */}
      {/* SECTION 1: COMPACT HERO BANNER                                    */}
      {/* ═══════════════════════════════════════════════════════════════════ */}
      <section className="relative h-[280px] sm:h-[380px] lg:h-[55vh] overflow-hidden bg-[#0a0a0a]">
        <Image
          src="/hero-banner.webp"
          alt="LEBTEX mercerie"
          fill
          className="object-cover object-center"
          priority
          quality={85}
          sizes="100vw"
        />
        <div className="absolute inset-0 bg-gradient-to-r from-[#0F0F0F]/80 via-[#0F0F0F]/50 to-transparent" />
        
        <div className="relative z-10 h-full flex items-center px-5 sm:px-8 lg:px-12">
          <div className="max-w-lg">
            <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-white/15 border border-white/20 mb-3">
              <span className="text-xs">🇲🇦</span>
              <span className="text-white/90 text-[10px] font-bold tracking-widest uppercase">{t('hero_badge')}</span>
            </div>
            <h1 className="text-2xl sm:text-3xl lg:text-4xl font-black text-white leading-tight mb-2" style={{ fontFamily: 'Outfit, sans-serif' }}>
              {t('hero_title_1')} <span className="shop-gradient-text">{t('hero_title_2')}</span>
            </h1>
            <p className="text-white/60 text-xs sm:text-sm mb-4 max-w-sm">{t('hero_subtitle')}</p>
            <Link
              href="/shop/categories"
              className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl text-white font-bold text-sm shadow-lg touch-manipulation"
              style={{ background: 'linear-gradient(135deg, #C8102E, #a00d25)' }}
            >
              {t('btn_discover')} <ArrowRight className="w-3.5 h-3.5" />
            </Link>
          </div>
        </div>
      </section>

      {/* ═══════════════════════════════════════════════════════════════════ */}
      {/* SECTION 2: FREE DELIVERY STRIP                                    */}
      {/* ═══════════════════════════════════════════════════════════════════ */}
      <div className="bg-[#C8102E] py-2 px-4">
        <div className="flex items-center justify-center gap-2 text-white text-xs font-bold">
          <Truck className="w-3.5 h-3.5" />
          <span>Livraison GRATUITE dès {formatPrice(FREE_DELIVERY_THRESHOLD)}</span>
          <span className="text-white/40">•</span>
          <span className="text-white/80 font-normal">Partout au Maroc</span>
        </div>
      </div>

      {/* ═══════════════════════════════════════════════════════════════════ */}
      {/* SECTION 3: CATEGORIES BAR (horizontal scroll on mobile)           */}
      {/* ═══════════════════════════════════════════════════════════════════ */}
      <section className="py-5 px-4 sm:px-6 lg:px-12 bg-white border-b border-gray-100">
        <div className="flex gap-3 overflow-x-auto pb-1 scrollbar-hide snap-x snap-mandatory lg:flex-wrap lg:justify-center">
          {SHOP_CATEGORIES.map((cat) => (
            <Link
              key={cat.id}
              href={`/shop/categorie/${cat.slug}`}
              className="flex flex-col items-center gap-1.5 flex-shrink-0 snap-start group touch-manipulation"
              style={{ minWidth: '72px' }}
            >
              <div
                className="w-14 h-14 sm:w-16 sm:h-16 rounded-2xl overflow-hidden border-2 border-transparent group-hover:border-[#C8102E] shadow-sm"
                style={{ background: `${cat.color}15` }}
              >
                {cat.image ? (
                  <div className="relative w-full h-full">
                    <Image
                      src={cat.image as string}
                      alt={cat.name}
                      fill
                      sizes="64px"
                      className="object-cover"
                    />
                  </div>
                ) : (
                  <div className="w-full h-full flex items-center justify-center">
                    <span className="text-lg font-bold" style={{ color: cat.color }}>{cat.name.charAt(0)}</span>
                  </div>
                )}
              </div>
              <span className="text-[10px] sm:text-xs font-semibold text-gray-700 text-center leading-tight line-clamp-2 max-w-[72px]">
                {cat.name}
              </span>
            </Link>
          ))}
        </div>
      </section>

      {/* ═══════════════════════════════════════════════════════════════════ */}
      {/* SECTION 4: FEATURED PRODUCTS                                      */}
      {/* ═══════════════════════════════════════════════════════════════════ */}
      <section className="py-6 px-4 sm:px-6 lg:px-12">
        <div className="container mx-auto">
          {/* Section header */}
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <Zap className="w-5 h-5 text-[#C8102E]" />
              <h2 className="text-lg sm:text-xl font-black text-[#0F0F0F]" style={{ fontFamily: 'Outfit, sans-serif' }}>
                Produits Populaires
              </h2>
            </div>
            <Link
              href="/shop/boutique"
              className="flex items-center gap-1 text-xs font-semibold text-[#C8102E] touch-manipulation"
            >
              Voir tout <ChevronRight className="w-3.5 h-3.5" />
            </Link>
          </div>

          {/* Products grid — 2 cols mobile, 3 tablet, 4 desktop */}
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3 sm:gap-4">
            {FEATURED_PRODUCTS.map((product) => (
              <ProductCard key={product.id} product={product} showAddToCart={true} />
            ))}
          </div>

          {/* Load more CTA */}
          <div className="mt-6 text-center">
            <Link
              href="/shop/boutique"
              className="inline-flex items-center gap-2 px-6 py-2.5 rounded-xl border-2 border-[#C8102E] text-[#C8102E] font-bold text-sm hover:bg-[#C8102E] hover:text-white touch-manipulation"
            >
              Voir tous les produits <ArrowRight className="w-4 h-4" />
            </Link>
          </div>
        </div>
      </section>

      {/* ═══════════════════════════════════════════════════════════════════ */}
      {/* SECTION 5: PROMO BANNER INLINE                                    */}
      {/* ═══════════════════════════════════════════════════════════════════ */}
      <section className="mx-4 sm:mx-6 lg:mx-12 rounded-2xl overflow-hidden" style={{ background: 'linear-gradient(135deg, #0F0F0F 0%, #1a1a2e 100%)' }}>
        <div className="flex items-center justify-between px-6 py-5 sm:py-6">
          <div>
            <p className="text-white text-sm sm:text-base font-bold" style={{ fontFamily: 'Outfit, sans-serif' }}>
              🚚 Livraison <span className="text-[#D4A843]">GRATUITE</span> dès {formatPrice(FREE_DELIVERY_THRESHOLD)}
            </p>
            <p className="text-gray-400 text-xs mt-0.5">Casablanca, Rabat, Marrakech et tout le Maroc</p>
          </div>
          <Link
            href="/shop/categories"
            className="hidden sm:inline-flex items-center gap-1.5 px-4 py-2 rounded-lg text-xs font-bold touch-manipulation"
            style={{ background: 'linear-gradient(135deg, #D4A843, #e4be6a)', color: '#0F0F0F' }}
          >
            Commander <ArrowRight className="w-3 h-3" />
          </Link>
        </div>
      </section>

      {/* ═══════════════════════════════════════════════════════════════════ */}
      {/* SECTION 6: NEW ARRIVALS                                           */}
      {/* ═══════════════════════════════════════════════════════════════════ */}
      {NEW_PRODUCTS.length > 0 && (
        <section className="py-6 px-4 sm:px-6 lg:px-12 mt-2">
          <div className="container mx-auto">
            {/* Section header */}
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2">
                <Sparkles className="w-5 h-5 text-emerald-500" />
                <h2 className="text-lg sm:text-xl font-black text-[#0F0F0F]" style={{ fontFamily: 'Outfit, sans-serif' }}>
                  Nouveautés
                </h2>
                <span className="px-2 py-0.5 rounded-full text-[10px] font-bold uppercase bg-emerald-50 text-emerald-600 border border-emerald-100">
                  New
                </span>
              </div>
              <Link
                href="/shop/boutique?nouveautes=true"
                className="flex items-center gap-1 text-xs font-semibold text-[#C8102E] touch-manipulation"
              >
                Voir tout <ChevronRight className="w-3.5 h-3.5" />
              </Link>
            </div>

            {/* Products grid */}
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3 sm:gap-4">
              {NEW_PRODUCTS.map((product) => (
                <ProductCard key={product.id} product={product} showAddToCart={true} />
              ))}
            </div>
          </div>
        </section>
      )}

      {/* ═══════════════════════════════════════════════════════════════════ */}
      {/* SECTION 7: WHATSAPP CTA (simplified)                              */}
      {/* ═══════════════════════════════════════════════════════════════════ */}
      <section className="mx-4 sm:mx-6 lg:mx-12 my-6 rounded-2xl overflow-hidden" style={{ background: 'linear-gradient(135deg, #128C7E, #25D366)' }}>
        <div className="flex items-center justify-between px-6 py-5">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 rounded-xl bg-white/20 flex items-center justify-center flex-shrink-0">
              <svg viewBox="0 0 24 24" className="w-6 h-6 fill-white" xmlns="http://www.w3.org/2000/svg">
                <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893A11.821 11.821 0 0020.464 3.488"/>
              </svg>
            </div>
            <div>
              <p className="text-white font-bold text-sm sm:text-base" style={{ fontFamily: 'Outfit, sans-serif' }}>
                Besoin d'aide ? Écrivez-nous sur WhatsApp
              </p>
              <p className="text-white/70 text-xs">Réponse en moins de 30 minutes</p>
            </div>
          </div>
          <div className="flex items-center gap-2 flex-shrink-0">
            <a
              href="https://wa.me/212760998347"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-white text-[#128C7E] font-bold text-xs sm:text-sm shadow-lg touch-manipulation"
            >
              <svg viewBox="0 0 24 24" className="w-4 h-4 fill-[#128C7E] flex-shrink-0" xmlns="http://www.w3.org/2000/svg">
                <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893A11.821 11.821 0 0020.464 3.488"/>
              </svg>
              <span className="hidden sm:inline">Écrire</span>
            </a>
            <a
              href="tel:+212760998347"
              className="inline-flex items-center gap-1.5 px-3 py-2.5 rounded-xl border border-white/30 text-white font-bold text-xs touch-manipulation"
            >
              <Phone className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">Appeler</span>
            </a>
          </div>
        </div>
      </section>

    </main>
  );
}
