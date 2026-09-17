'use client';

import React, { useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import {
  Truck,
  ArrowRight,
  Phone,
  ChevronLeft,
  ChevronRight,
  Sparkles,
  Zap,
  RotateCcw,
  Package,
  Flame,
  Tag,
  Banknote,
  MapPin,
  LayoutGrid,
} from 'lucide-react';
import {
  CASABLANCA_FREE_DELIVERY_THRESHOLD,
  FREE_DELIVERY_THRESHOLD,
  formatPrice,
  getDiscountPercent,
  getProductDisplayPrice,
  hasActivePromo,
} from '@/lib/shop-utils';
import { DELIVERY_ZONES } from '@/lib/shop-types';
import type { ShopProduct } from '@/lib/shop-types';
import ProductCard from '@/components/shop/ProductCard';
import { useLanguage } from '@/contexts/language-context';
import { useShopProducts } from '@/contexts/shop-products-context';

// Produits affichés par section, puis par clic sur « Voir plus » en bas de page
const DEALS_COUNT = 12;
const POPULAR_COUNT = 10;
const SMALL_PRICES_COUNT = 12;
const NEW_COUNT = 10;
const MORE_PRODUCTS_STEP = 20;

function discountOf(product: ShopProduct) {
  return hasActivePromo(product.comparePrice, product.price)
    ? getDiscountPercent(product.price, product.comparePrice as number)
    : 0;
}

// ─── Section header ───────────────────────────────────────────────────────────
function SectionHeader({
  icon,
  title,
  badge,
  subtitle,
  href,
  linkLabel,
}: {
  icon: React.ReactNode;
  title: string;
  badge?: React.ReactNode;
  subtitle?: string;
  href?: string;
  linkLabel?: string;
}) {
  return (
    <div className="flex items-end justify-between gap-3 mb-4">
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-2">
          {icon}
          <h2 className="text-lg sm:text-xl font-black text-[#0F0F0F]" style={{ fontFamily: 'Outfit, sans-serif' }}>
            {title}
          </h2>
          {badge}
        </div>
        {subtitle && <p className="text-xs sm:text-sm text-gray-500 mt-0.5">{subtitle}</p>}
      </div>
      {href && (
        <Link
          href={href}
          className="flex-shrink-0 flex items-center gap-1 text-xs font-semibold text-[#C8102E] touch-manipulation"
        >
          {linkLabel} <ChevronRight className="w-3.5 h-3.5" />
        </Link>
      )}
    </div>
  );
}

// ─── Product rail: une ligne qui défile (flèches sur ordinateur) ─────────────
function ProductRail({ products }: { products: ShopProduct[] }) {
  const railRef = useRef<HTMLDivElement>(null);
  const scroll = (direction: 1 | -1) => {
    const rail = railRef.current;
    if (rail) rail.scrollBy({ left: direction * rail.clientWidth * 0.8, behavior: 'smooth' });
  };

  return (
    <div className="relative group/rail">
      <div
        ref={railRef}
        className="flex gap-3 sm:gap-4 overflow-x-auto no-scrollbar snap-x snap-mandatory -mx-4 px-4 sm:mx-0 sm:px-0 pb-1"
      >
        {products.map((product) => (
          <div key={product.id} className="w-[44%] sm:w-[30%] lg:w-[18%] flex-shrink-0 snap-start">
            <ProductCard product={product} />
          </div>
        ))}
      </div>
      {products.length > 5 && (
        <>
          <button
            type="button"
            onClick={() => scroll(-1)}
            className="hidden lg:flex absolute left-0 top-[38%] -translate-x-1/2 w-10 h-10 items-center justify-center rounded-full bg-white border border-gray-200 shadow-md text-gray-700 hover:text-[#C8102E] opacity-0 group-hover/rail:opacity-100 transition-opacity"
            aria-label="Produits précédents"
          >
            <ChevronLeft className="w-5 h-5" />
          </button>
          <button
            type="button"
            onClick={() => scroll(1)}
            className="hidden lg:flex absolute right-0 top-[38%] translate-x-1/2 w-10 h-10 items-center justify-center rounded-full bg-white border border-gray-200 shadow-md text-gray-700 hover:text-[#C8102E] opacity-0 group-hover/rail:opacity-100 transition-opacity"
            aria-label="Produits suivants"
          >
            <ChevronRight className="w-5 h-5" />
          </button>
        </>
      )}
    </div>
  );
}

function ProductGrid({ products }: { products: ShopProduct[] }) {
  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3 sm:gap-4">
      {products.map((product) => (
        <ProductCard key={product.id} product={product} showAddToCart={true} />
      ))}
    </div>
  );
}

// ─── Page Component ───────────────────────────────────────────────────────────
export default function ShopPage() {
  const { t, language } = useLanguage();
  const { categories: allContextCategories, products, getPromoProducts } = useShopProducts();
  const SHOP_CATEGORIES = allContextCategories.filter(c => !c.parentSlug);
  const [moreCount, setMoreCount] = useState(MORE_PRODUCTS_STEP);
  const isAr = language === 'ar';

  // Chaque produit n'apparaît qu'une fois sur la page : une section ne reprend pas
  // ceux déjà montrés plus haut, et le reste du catalogue termine la page.
  const sections = useMemo(() => {
    const shown = new Set<string>();
    const take = (list: ShopProduct[], max: number) => {
      const picked = list.filter(p => !shown.has(p.id)).slice(0, max);
      picked.forEach(p => shown.add(p.id));
      return picked;
    };
    const available = products.filter(p => p.inStock !== false);

    // Même sélection que la page Promotions, pour que « Voir tout » tombe juste
    const deals = take(getPromoProducts(products.length).filter(p => p.inStock !== false), DEALS_COUNT);
    const popular = take(available.filter(p => p.isFeatured), POPULAR_COUNT);
    const smallPrices = take(
      available
        .filter(p => {
          const { amount } = getProductDisplayPrice(p);
          return amount > 0 && amount < CASABLANCA_FREE_DELIVERY_THRESHOLD;
        })
        .sort((a, b) => getProductDisplayPrice(a).amount - getProductDisplayPrice(b).amount),
      SMALL_PRICES_COUNT
    );
    const newArrivals = take(available.filter(p => p.isNew), NEW_COUNT);
    // Le reste : disponibles et chiffrés d'abord, ruptures et « sur demande » en dernier
    const rank = (p: ShopProduct) => (p.inStock === false ? 2 : 0) + (getProductDisplayPrice(p).amount > 0 ? 0 : 1);
    const rest = products.filter(p => !shown.has(p.id)).sort((a, b) => rank(a) - rank(b));

    return {
      deals,
      popular,
      smallPrices,
      newArrivals,
      rest,
      maxDiscount: deals.length > 0 ? discountOf(deals[0]) : 0,
    };
  }, [products, getPromoProducts]);

  const casaThreshold = formatPrice(CASABLANCA_FREE_DELIVERY_THRESHOLD);
  const nationalThreshold = formatPrice(FREE_DELIVERY_THRESHOLD);

  return (
    <main className="min-h-screen bg-[#FBF8F3]" style={{ fontFamily: 'Inter, sans-serif' }}>

      {/* ═══════════════════════════════════════════════════════════════════ */}
      {/* SECTION 1: COMPACT HERO BANNER                                    */}
      {/* ═══════════════════════════════════════════════════════════════════ */}
      <section className="relative h-[200px] sm:h-[240px] lg:h-[280px] overflow-hidden">
        <Image
          src="/hero-banner-new.png"
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
              href="/shop/boutique"
              className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl text-white font-bold text-sm shadow-lg touch-manipulation"
              style={{ background: 'linear-gradient(135deg, #C8102E, #a00d25)' }}
            >
              {t('btn_discover')} <ArrowRight className="w-3.5 h-3.5" />
            </Link>
          </div>
        </div>
      </section>

      {/* ═══════════════════════════════════════════════════════════════════ */}
      {/* SECTION 2: TRUST STRIP (livraison, paiement, retour)              */}
      {/* ═══════════════════════════════════════════════════════════════════ */}
      <div className="bg-[#C8102E] py-2.5 px-4">
        <div className="flex items-center justify-center flex-wrap gap-x-5 gap-y-1.5 text-white text-[11px] sm:text-xs font-bold">
          <span className="flex items-center gap-1.5">
            <Truck className="w-3.5 h-3.5 shrink-0" />
            {t('free_delivery_casa', { amount: casaThreshold })}
          </span>
          <span className="hidden sm:flex items-center gap-1.5 font-normal text-white/85">
            <MapPin className="w-3.5 h-3.5 shrink-0" />
            {isAr ? `لجميع المدن من ${nationalThreshold}` : `Partout au Maroc dès ${nationalThreshold}`}
          </span>
          <span className="hidden sm:flex items-center gap-1.5 font-normal text-white/85">
            <Banknote className="w-3.5 h-3.5 shrink-0" /> {t('trust_payment')}
          </span>
          <span className="hidden md:flex items-center gap-1.5 font-normal text-white/85">
            <RotateCcw className="w-3.5 h-3.5 shrink-0" /> {isAr ? 'إرجاع خلال 14 يوم' : 'Retour 14 jours'}
          </span>
        </div>
      </div>

      {/* ═══════════════════════════════════════════════════════════════════ */}
      {/* SECTION 3: CATEGORIES BAR (horizontal scroll on mobile)           */}
      {/* ═══════════════════════════════════════════════════════════════════ */}
      <section className="py-5 px-4 sm:px-6 lg:px-12 bg-white border-b border-gray-100">
        <div className="flex gap-3 overflow-x-auto pb-1 no-scrollbar snap-x snap-mandatory lg:flex-wrap lg:justify-center">
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
      {/* SECTION 4: LIVRAISON GRATUITE À CASABLANCA                        */}
      {/* ═══════════════════════════════════════════════════════════════════ */}
      <section className="px-4 sm:px-6 lg:px-12 pt-4">
        <div className="relative overflow-hidden rounded-2xl text-white bg-gradient-to-br from-[#C8102E] via-[#a00d25] to-[#4a0611]">
          <div className="absolute -right-12 -top-16 w-56 h-56 rounded-full bg-white/10 pointer-events-none" />
          <div className="absolute right-28 -bottom-20 w-44 h-44 rounded-full bg-[#D4A843]/20 pointer-events-none" />

          <div className="relative flex flex-col sm:flex-row sm:items-center gap-4 px-5 py-5 sm:px-8 sm:py-6">
            <div className="flex items-center gap-4 flex-1 min-w-0">
              <div className="w-14 h-14 sm:w-16 sm:h-16 flex-shrink-0 rounded-2xl bg-white/15 border border-white/25 flex items-center justify-center">
                <Truck className="w-7 h-7 sm:w-8 sm:h-8" />
              </div>
              <div className="min-w-0">
                <p className="text-[11px] font-bold uppercase tracking-widest text-[#F3D58B]">
                  {isAr ? 'الدار البيضاء' : 'Casablanca'}
                </p>
                <p className="text-xl sm:text-2xl lg:text-3xl font-black leading-tight" style={{ fontFamily: 'Outfit, sans-serif' }}>
                  {isAr ? 'توصيل مجاني ابتداءً من ' : 'Livraison GRATUITE dès '}
                  <span className="text-[#F3D58B]">{casaThreshold}</span>
                </p>
                <p className="text-white/80 text-xs sm:text-sm mt-1">
                  {isAr ? 'خلال ' : 'Livrée en '}
                  <bdi>{DELIVERY_ZONES.casablanca.days}</bdi>
                  {isAr
                    ? ` · الدفع عند الاستلام · باقي المدن: مجاني من ${nationalThreshold}`
                    : ` · Paiement à la livraison · Autres villes : gratuite dès ${nationalThreshold}`}
                </p>
              </div>
            </div>
            <Link
              href="/shop/boutique"
              className="inline-flex items-center justify-center gap-2 px-5 py-3 rounded-xl bg-white text-[#C8102E] font-black text-sm shadow-lg flex-shrink-0 hover:bg-[#FBF8F3] transition-colors touch-manipulation"
            >
              {isAr ? 'اطلب الآن' : "J'en profite"} <ArrowRight className="w-4 h-4" />
            </Link>
          </div>
        </div>
      </section>

      {/* ═══════════════════════════════════════════════════════════════════ */}
      {/* SECTION 5: OFFRES DU MOMENT (prix barrés)                         */}
      {/* ═══════════════════════════════════════════════════════════════════ */}
      {sections.deals.length > 0 && (
        <section className="pt-6 px-4 sm:px-6 lg:px-12">
          <div className="container mx-auto">
            <SectionHeader
              icon={<Flame className="w-5 h-5 text-[#C8102E]" />}
              title={isAr ? 'عروض اللحظة' : 'Offres du moment'}
              badge={
                sections.maxDiscount > 0 && (
                  <span className="px-2 py-0.5 rounded-full text-[10px] font-black bg-[#C8102E] text-white">
                    {isAr ? `حتى -${sections.maxDiscount}%` : `Jusqu'à -${sections.maxDiscount}%`}
                  </span>
                )
              }
              subtitle={isAr ? 'أسعار مخفضة على تشكيلة من المنتجات' : 'Prix barrés sur une sélection de produits'}
              href="/shop/promotions"
              linkLabel={isAr ? 'عرض الكل' : 'Voir tout'}
            />
            <ProductRail products={sections.deals} />
          </div>
        </section>
      )}

      {/* ═══════════════════════════════════════════════════════════════════ */}
      {/* SECTION 6: PRODUITS POPULAIRES                                    */}
      {/* ═══════════════════════════════════════════════════════════════════ */}
      {sections.popular.length > 0 && (
        <section className="pt-6 px-4 sm:px-6 lg:px-12">
          <div className="container mx-auto">
            <SectionHeader
              icon={<Zap className="w-5 h-5 text-[#C8102E]" />}
              title={isAr ? 'المنتجات الأكثر طلباً' : 'Produits Populaires'}
              href="/shop/boutique"
              linkLabel={isAr ? 'عرض الكل' : 'Voir tout'}
            />
            <ProductGrid products={sections.popular} />
          </div>
        </section>
      )}

      {/* ═══════════════════════════════════════════════════════════════════ */}
      {/* SECTION 7: PETITS PRIX (< seuil Casablanca)                       */}
      {/* ═══════════════════════════════════════════════════════════════════ */}
      {sections.smallPrices.length > 0 && (
        <section className="pt-6 px-4 sm:px-6 lg:px-12">
          <div className="container mx-auto">
            <SectionHeader
              icon={<Tag className="w-5 h-5 text-[#D4A843]" />}
              title={isAr ? 'أسعار صغيرة' : 'Petits prix'}
              badge={
                <span className="px-2 py-0.5 rounded-full text-[10px] font-black bg-[#D4A843]/15 text-[#8a6a1f] border border-[#D4A843]/30">
                  {isAr ? `أقل من ${casaThreshold}` : `Moins de ${casaThreshold}`}
                </span>
              }
              subtitle={
                isAr
                  ? `أكمل سلتك إلى ${casaThreshold} واستفد من التوصيل المجاني في الدار البيضاء`
                  : `Complétez votre panier jusqu'à ${casaThreshold} : livraison gratuite à Casablanca`
              }
              href="/shop/boutique?tri=prix-asc"
              linkLabel={isAr ? 'عرض الكل' : 'Voir tout'}
            />
            <ProductRail products={sections.smallPrices} />
          </div>
        </section>
      )}

      {/* ═══════════════════════════════════════════════════════════════════ */}
      {/* SECTION 8: COMMANDE EN GROS / DEVIS RAPIDE                        */}
      {/* ═══════════════════════════════════════════════════════════════════ */}
      <section className="px-4 sm:px-6 lg:px-12 pt-6">
        <div
          className="rounded-2xl overflow-hidden flex flex-col sm:flex-row items-center justify-between gap-4 px-6 py-5"
          style={{ background: 'linear-gradient(135deg, #0F0F0F 0%, #1a1a2e 100%)' }}
        >
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 rounded-xl bg-[#D4A843]/15 flex items-center justify-center flex-shrink-0">
              <Package className="w-6 h-6 text-[#D4A843]" />
            </div>
            <div>
              <p className="text-white font-black text-sm sm:text-base" style={{ fontFamily: 'Outfit, sans-serif' }}>
                Commande en Gros — Tarifs Professionnels
              </p>
              <p className="text-gray-400 text-xs mt-0.5">Prix dégressifs par quantité · Devis personnalisé pour ateliers et revendeurs</p>
            </div>
          </div>
          <div className="flex items-center gap-2 flex-shrink-0 w-full sm:w-auto">
            <Link
              href="/shop/boutique"
              className="flex-1 sm:flex-initial inline-flex items-center justify-center gap-1.5 px-4 py-2.5 rounded-xl border border-white/20 text-white font-bold text-xs sm:text-sm touch-manipulation"
            >
              Voir les tarifs pro
            </Link>
            <a
              href="https://wa.me/212760998347?text=Bonjour%2C%20je%20souhaite%20un%20devis%20pour%20une%20commande%20en%20gros."
              target="_blank"
              rel="noopener noreferrer"
              className="flex-1 sm:flex-initial inline-flex items-center justify-center gap-1.5 px-4 py-2.5 rounded-xl text-[#0F0F0F] font-bold text-xs sm:text-sm touch-manipulation"
              style={{ background: 'linear-gradient(135deg, #D4A843, #e4be6a)' }}
            >
              Devis rapide <ArrowRight className="w-3.5 h-3.5" />
            </a>
          </div>
        </div>
      </section>

      {/* ═══════════════════════════════════════════════════════════════════ */}
      {/* SECTION 9: NEW ARRIVALS                                           */}
      {/* ═══════════════════════════════════════════════════════════════════ */}
      {sections.newArrivals.length > 0 && (
        <section className="pt-6 px-4 sm:px-6 lg:px-12">
          <div className="container mx-auto">
            <SectionHeader
              icon={<Sparkles className="w-5 h-5 text-emerald-500" />}
              title={isAr ? 'وصل حديثاً' : 'Nouveautés'}
              badge={
                <span className="px-2 py-0.5 rounded-full text-[10px] font-bold uppercase bg-emerald-50 text-emerald-600 border border-emerald-100">
                  New
                </span>
              }
              href="/shop/boutique?nouveautes=true"
              linkLabel={isAr ? 'عرض الكل' : 'Voir tout'}
            />
            <ProductGrid products={sections.newArrivals} />
          </div>
        </section>
      )}

      {/* ═══════════════════════════════════════════════════════════════════ */}
      {/* SECTION 10: TOUT LE RESTE DU CATALOGUE                            */}
      {/* ═══════════════════════════════════════════════════════════════════ */}
      {sections.rest.length > 0 && (
        <section className="pt-6 px-4 sm:px-6 lg:px-12">
          <div className="container mx-auto">
            <SectionHeader
              icon={<LayoutGrid className="w-5 h-5 text-[#0F0F0F]" />}
              title={isAr ? 'اكتشف المزيد' : 'Encore plus de produits'}
              subtitle={
                isAr
                  ? `${sections.rest.length} منتجات أخرى من كتالوجنا`
                  : `${sections.rest.length} autres produits de notre catalogue`
              }
            />
            <ProductGrid products={sections.rest.slice(0, moreCount)} />
            {sections.rest.length > moreCount && (
              <div className="mt-5 text-center">
                <button
                  type="button"
                  onClick={() => setMoreCount(count => count + MORE_PRODUCTS_STEP)}
                  className="inline-flex items-center gap-2 px-6 py-2.5 rounded-xl bg-white border border-gray-200 text-[#0F0F0F] font-bold text-sm hover:border-[#C8102E] hover:text-[#C8102E] shadow-sm touch-manipulation"
                >
                  {isAr
                    ? `عرض المزيد (${sections.rest.length - moreCount})`
                    : `Voir plus de produits (${sections.rest.length - moreCount})`}
                  <ChevronRight className="w-4 h-4 rotate-90" />
                </button>
              </div>
            )}
          </div>
        </section>
      )}

      <div className="px-4 pt-6 text-center">
        <Link
          href="/shop/boutique"
          className="inline-flex items-center gap-2 px-6 py-2.5 rounded-xl border-2 border-[#C8102E] text-[#C8102E] font-bold text-sm hover:bg-[#C8102E] hover:text-white touch-manipulation"
        >
          {t('all_products')} <ArrowRight className="w-4 h-4" />
        </Link>
      </div>

      {/* ═══════════════════════════════════════════════════════════════════ */}
      {/* SECTION 11: POURQUOI COMMANDER CHEZ LEBTEX                        */}
      {/* ═══════════════════════════════════════════════════════════════════ */}
      <section className="px-4 sm:px-6 lg:px-12 pt-8">
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          {[
            {
              icon: <Truck className="w-5 h-5 text-[#C8102E]" />,
              title: isAr ? 'توصيل مجاني' : 'Livraison gratuite',
              text: isAr
                ? `الدار البيضاء من ${casaThreshold}، باقي المدن من ${nationalThreshold}`
                : `Casablanca dès ${casaThreshold}, partout au Maroc dès ${nationalThreshold}`,
            },
            {
              icon: <Banknote className="w-5 h-5 text-emerald-600" />,
              title: isAr ? 'الدفع عند الاستلام' : 'Paiement à la livraison',
              text: isAr ? 'تدفع نقداً عند استلام طلبك' : 'Vous payez en cash à la réception',
            },
            {
              icon: <RotateCcw className="w-5 h-5 text-[#D4A843]" />,
              title: isAr ? 'إرجاع خلال 14 يوم' : 'Retour 14 jours',
              text: isAr ? 'منتج غير مستعمل في غلافه الأصلي' : 'Produit non utilisé, dans son emballage',
            },
            {
              icon: <Package className="w-5 h-5 text-[#0F0F0F]" />,
              title: isAr ? 'أسعار الجملة' : 'Prix de gros',
              text: isAr ? 'أسعار خاصة للمشاغل والتجار' : 'Tarifs ateliers et revendeurs',
            },
          ].map(({ icon, title, text }) => (
            <div key={title} className="flex items-start gap-3 rounded-2xl bg-white border border-gray-100 p-4">
              <div className="w-10 h-10 flex-shrink-0 rounded-xl bg-[#FBF8F3] flex items-center justify-center">{icon}</div>
              <div className="min-w-0">
                <p className="text-sm font-bold text-[#0F0F0F] leading-tight">{title}</p>
                <p className="text-xs text-gray-500 mt-1 leading-snug">{text}</p>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* ═══════════════════════════════════════════════════════════════════ */}
      {/* SECTION 12: WHATSAPP CTA (simplified)                             */}
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
