"use client";
import React, { useState, useEffect, useRef, useMemo } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useLanguage } from '@/contexts/language-context';
import { useShopProducts } from '@/contexts/shop-products-context';
import type { ShopProduct, ShopCategory } from '@/lib/shop-types';
import { ShoppingBag, ArrowLeft, Package, Loader2, SlidersHorizontal, X } from 'lucide-react';
import ProductCard from '@/components/shop/ProductCard';


// ─── Page ──────────────────────────────────────────────────────────────────────
export default function CategoryPage({ params }: { params: any }) {
  const router = useRouter();
  const rawSlug: string = React.use(params).slug as string;
  // Decode URL encoding (e.g. %20 → space) AND normalize to match stored slugs
  const slug = decodeURIComponent(rawSlug);
  const [sort, setSort] = useState('pertinence');
  const [activeSubCat, setActiveSubCat] = useState<string | null>(null);
  const { language } = useLanguage();

  const { products: allContextProducts, categories: allContextCategories, isLoading } = useShopProducts();

  // Find the category by slug OR by id (to handle old/broken slugs stored in Firestore)
  const category = allContextCategories.find(c => c.slug === slug || c.id === slug) ?? null;
  // Use the canonical slug from the found category (not from the URL) for lookups
  const canonicalSlug = category?.slug ?? slug;
  const categoryId = category?.id ?? slug;

  const subCats = allContextCategories.filter(c => c.parentSlug === canonicalSlug || c.parentSlug === categoryId);
  // Collect all slugs/ids that belong to this category's products
  const subCatIdentifiers = new Set([
    ...subCats.map(c => c.slug),
    ...subCats.map(c => c.id),
  ]);
  
  // All products in this category (including subcategories)
  const allCategoryProducts = useMemo(() => 
    allContextProducts.filter(p =>
      p.categorySlug === canonicalSlug ||
      p.categorySlug === categoryId ||
      subCatIdentifiers.has(p.categorySlug)
    ),
    [allContextProducts, canonicalSlug, categoryId, subCatIdentifiers]
  );

  // Filter by active subcategory
  const products = useMemo(() => {
    if (!activeSubCat) return allCategoryProducts;
    const activeSub = subCats.find(c => c.slug === activeSubCat);
    if (!activeSub) return allCategoryProducts;
    return allCategoryProducts.filter(p => p.categorySlug === activeSub.slug || p.categorySlug === activeSub.id);
  }, [allCategoryProducts, activeSubCat, subCats]);

  const notFound = !isLoading && !category;

  // Sort products - Memoized for extreme performance
  const sortedProducts = useMemo(() => {
    return [...products].sort((a, b) => {
      if (sort === 'prix-asc') return a.price - b.price;
      if (sort === 'prix-desc') return b.price - a.price;
      if (sort === 'nouveautes') return (b.isNew ? 1 : 0) - (a.isNew ? 1 : 0);
      return 0;
    });
  }, [products, sort]);

  const [visibleCount, setVisibleCount] = useState(24);
  const observerTarget = useRef<HTMLDivElement>(null);

  // Reset infinite scroll count when sort or filter changes
  useEffect(() => {
    setVisibleCount(24);
  }, [sort, canonicalSlug, activeSubCat]);

  // Infinite Scroll Observer
  useEffect(() => {
    const observer = new IntersectionObserver(
      entries => {
        if (entries[0].isIntersecting) {
          setVisibleCount(prev => Math.min(prev + 24, sortedProducts.length));
        }
      },
      { rootMargin: '400px' }
    );
    if (observerTarget.current) {
      observer.observe(observerTarget.current);
    }
    return () => observer.disconnect();
  }, [sortedProducts.length]);

  const visibleProducts = sortedProducts.slice(0, visibleCount);

  if (isLoading) {
    return (
      <div className="min-h-screen bg-[#FBF8F3] flex items-center justify-center">
        <Loader2 className="w-10 h-10 animate-spin text-[#C8102E]" />
      </div>
    );
  }

  if (notFound) {
    return (
      <div className="min-h-screen bg-[#FBF8F3] flex flex-col items-center justify-center gap-6 p-8">
        <div className="w-20 h-20 bg-[#C8102E]/10 rounded-2xl flex items-center justify-center">
          <Package className="w-10 h-10 text-[#C8102E]" />
        </div>
        <div className="text-center">
          <h1 className="text-2xl font-black text-[#1A1A1A]" style={{ fontFamily: 'Outfit, sans-serif' }}>
            Catégorie introuvable
          </h1>
          <p className="text-gray-500 mt-2">La catégorie « {slug} » n'existe pas.</p>
        </div>
        <Link
          href="/shop/boutique"
          prefetch={false}
          className="flex items-center gap-2 px-6 py-3 bg-[#C8102E] text-white rounded-xl font-semibold hover:bg-[#a00d25] transition-colors active:scale-95 touch-manipulation"
        >
          <ArrowLeft className="w-4 h-4" /> Retour à la boutique
        </Link>
      </div>
    );
  }

  const accentColor = category?.color || '#C8102E';

  return (
    <div style={{ fontFamily: 'Inter, sans-serif', background: '#FBF8F3' }} className="min-h-screen">
      {/* ─── Hero ─────────────────────────────────────────────────────────── */}
      <div className="relative h-56 sm:h-72 lg:h-80 overflow-hidden">
        {/* Background image or gradient */}
        {category?.image ? (
          <img
            src={category.image as string}
            alt={category.name}
            className="absolute inset-0 w-full h-full object-cover"
          />
        ) : (
          <div
            className="absolute inset-0"
            style={{
              background: `linear-gradient(135deg, ${accentColor}CC 0%, ${accentColor}66 50%, #0F0F0F 100%)`,
            }}
          />
        )}
        {/* Dark overlay */}
        <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/40 to-black/20" />

        {/* Content */}
        <div className="relative h-full max-w-7xl mx-auto px-5 sm:px-6 flex flex-col justify-end pb-8">
          {/* Breadcrumb */}
          <nav className="flex items-center gap-2 text-xs text-white/60 mb-3">
            <Link href="/shop" prefetch={false} className="hover:text-white transition-colors">Accueil</Link>
            <span>›</span>
            <Link href="/shop/categories" prefetch={false} className="hover:text-white transition-colors">Catégories</Link>
            <span>›</span>
            {category?.parentSlug && (
              <>
                <Link href={`/shop/categorie/${category.parentSlug}`} prefetch={false} className="hover:text-white transition-colors">
                  {allContextCategories.find(c => c.slug === category.parentSlug)?.name || category.parentSlug}
                </Link>
                <span>›</span>
              </>
            )}
            <span className="text-white">{category?.name}</span>
          </nav>

          <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-3">
            <div>
              {/* Color accent bar */}
              <div className="w-10 h-1 rounded-full mb-2" style={{ background: accentColor }} />
              <h1
                className="text-2xl sm:text-4xl lg:text-5xl font-black text-white leading-tight"
                style={{ fontFamily: 'Outfit, sans-serif' }}
                dir={language === 'ar' ? 'rtl' : 'ltr'}
              >
                {language === 'ar' && category?.nameAr ? category.nameAr : category?.name}
              </h1>
              {(category?.description || category?.descriptionAr) && (
                <p className="text-white/70 mt-1.5 max-w-xl text-sm leading-relaxed">
                  {language === 'ar' && category.descriptionAr ? category.descriptionAr : category.description}
                </p>
              )}
            </div>
            <div
              className="flex-shrink-0 px-4 py-2 rounded-full text-sm font-semibold text-white border border-white/30 backdrop-blur-sm self-start sm:self-auto"
              style={{ background: `${accentColor}40` }}
            >
              <ShoppingBag className="inline w-4 h-4 mr-1.5 mb-0.5" />
              {language === 'ar' ? `${allCategoryProducts.length} منتج` : `${allCategoryProducts.length} produit${allCategoryProducts.length !== 1 ? 's' : ''}`}
            </div>
          </div>
        </div>
      </div>

      {/* ─── Subcategory Filter Chips (sticky) ─────────────────────────── */}
      {subCats.length > 0 && (
        <div className="sticky top-0 z-20 bg-[#FBF8F3]/95 backdrop-blur-md border-b border-[#E8E4DF]">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 py-3">
            <div className="flex items-center gap-2 overflow-x-auto scrollbar-hide pb-1">
              <button
                onClick={() => setActiveSubCat(null)}
                className={`flex-shrink-0 flex items-center gap-1.5 px-4 py-2 rounded-full text-xs font-bold uppercase tracking-wider transition-all active:scale-95 cursor-pointer touch-manipulation ${
                  !activeSubCat
                    ? 'bg-[#1A1A1A] text-white shadow-md'
                    : 'bg-white border border-[#E8E4DF] text-[#6B6B6B] hover:border-[#1A1A1A] hover:text-[#1A1A1A]'
                }`}
              >
                <Package className="w-3.5 h-3.5" />
                {language === 'ar' ? 'الكل' : 'Tout'}
              </button>
              {subCats.map(cat => {
                const count = allContextProducts.filter(p => p.categorySlug === cat.slug || p.categorySlug === cat.id).length;
                return (
                  <button
                    key={cat.id}
                    onClick={() => setActiveSubCat(activeSubCat === cat.slug ? null : cat.slug)}
                    className={`flex-shrink-0 flex items-center gap-1.5 px-4 py-2 rounded-full text-xs font-bold transition-all active:scale-95 cursor-pointer touch-manipulation ${
                      activeSubCat === cat.slug
                        ? 'bg-[#C8102E] text-white shadow-md shadow-[#C8102E]/25'
                        : 'bg-white border border-[#E8E4DF] text-[#6B6B6B] hover:border-[#C8102E]/30 hover:text-[#C8102E]'
                    }`}
                  >
                    {cat.icon && <span className="text-sm">{cat.icon}</span>}
                    {language === 'ar' && cat.nameAr ? cat.nameAr : cat.name}
                    {count > 0 && (
                      <span className={`text-[10px] font-bold ${activeSubCat === cat.slug ? 'text-white/70' : 'text-gray-400'}`}>
                        ({count})
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {/* ─── Toolbar: Sort + Count ─────────────────────────────────────── */}
      <div className={`${subCats.length === 0 ? 'sticky top-0 z-20' : ''} bg-white/90 backdrop-blur-md border-b border-[#E8E4DF] shadow-sm`}>
        <div className="max-w-7xl mx-auto px-5 sm:px-6 py-3 flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <button
              onClick={() => window.history.length > 1 ? window.history.back() : router.push('/shop/categories')}
              aria-label="Retour"
              title="Retour"
              className="w-10 h-10 flex items-center justify-center bg-white border border-[#E8E4DF] rounded-full hover:bg-[#FBF8F3] hover:border-[#C8102E] transition-all shadow-sm flex-shrink-0 text-[#1A1A1A] hover:text-[#C8102E] active:scale-90 cursor-pointer touch-manipulation"
            >
              <ArrowLeft className="w-4 h-4" />
            </button>
            <p className="text-sm text-[#999] hidden sm:block">
              <strong className="text-[#1A1A1A]">{sortedProducts.length}</strong>{' '}
              {language === 'ar' ? 'منتج' : `produit${sortedProducts.length !== 1 ? 's' : ''}`}
              {activeSubCat && (
                <span className="ml-1.5">
                  {language === 'ar' ? 'في' : 'dans'}{' '}
                  <span className="text-[#C8102E] font-medium">
                    {subCats.find(c => c.slug === activeSubCat)?.name}
                  </span>
                  <button
                    onClick={() => setActiveSubCat(null)}
                    className="ml-1.5 inline-flex items-center justify-center w-4 h-4 rounded-full bg-gray-200 hover:bg-[#C8102E] hover:text-white text-gray-500 transition-colors cursor-pointer"
                  >
                    <X className="w-2.5 h-2.5" />
                  </button>
                </span>
              )}
            </p>
            {/* Mobile product count */}
            <p className="text-xs text-[#999] sm:hidden">
              <strong className="text-[#1A1A1A]">{sortedProducts.length}</strong> {language === 'ar' ? 'منتج' : 'produits'}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <SlidersHorizontal className="w-3.5 h-3.5 text-gray-400 hidden sm:block" />
            <select
              value={sort}
              onChange={e => setSort(e.target.value)}
              className="text-sm border border-[#E8E4DF] rounded-lg px-3 py-1.5 bg-white focus:border-[#C8102E] outline-none font-medium cursor-pointer"
            >
              <option value="pertinence">{language === 'ar' ? 'الصلة' : 'Pertinence'}</option>
              <option value="prix-asc">{language === 'ar' ? 'السعر تصاعدي' : 'Prix croissant'}</option>
              <option value="prix-desc">{language === 'ar' ? 'السعر تنازلي' : 'Prix décroissant'}</option>
              <option value="nouveautes">{language === 'ar' ? 'الجديد' : 'Nouveautés'}</option>
            </select>
          </div>
        </div>
      </div>

      {/* ─── Subcategory Cards (when parent has subcats and no filter active) ── */}
      {subCats.length > 0 && !activeSubCat && (
        <div className="max-w-7xl mx-auto px-5 sm:px-6 pt-8 pb-4">
          <h2 className="text-lg font-bold text-[#1A1A1A] mb-4" style={{ fontFamily: 'Outfit, sans-serif' }}>
            {language === 'ar' ? 'الفئات الفرعية' : 'Sous-catégories'}
          </h2>
          <div className="grid grid-cols-2 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {subCats.map(cat => {
              const count = allContextProducts.filter(p => p.categorySlug === cat.slug || p.categorySlug === cat.id).length;
              const catAccentColor = cat.color || accentColor;
              return (
                <Link
                  key={cat.id}
                  href={`/shop/categorie/${cat.slug}`}
                  prefetch={false}
                  className="group relative overflow-hidden rounded-2xl bg-white border border-[#E8E4DF] hover:shadow-xl hover:-translate-y-1 transition-all duration-300 flex flex-col active:scale-[0.98] touch-manipulation"
                >
                  <div className="relative h-32 sm:h-44 overflow-hidden flex-shrink-0">
                    {cat.image ? (
                      <img src={cat.image as string} alt={cat.name} loading="lazy" decoding="async" className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-105" />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center" style={{ background: `linear-gradient(135deg, ${catAccentColor}30 0%, ${catAccentColor}10 100%)` }}>
                        <span className="text-4xl sm:text-6xl opacity-50">{cat.icon || '📁'}</span>
                      </div>
                    )}
                    <div className="absolute inset-0 bg-gradient-to-t from-black/50 via-transparent to-transparent" />
                    <div className="absolute bottom-0 left-0 right-0 h-0.5" style={{ background: catAccentColor }} />
                    {count > 0 && (
                      <span className="absolute top-2 right-2 sm:top-3 sm:right-3 px-2 py-0.5 sm:px-2.5 sm:py-1 rounded-full text-[9px] sm:text-[10px] font-bold text-[#1A1A1A] bg-white/90 backdrop-blur-sm shadow-sm">
                        {language === 'ar' ? `${count} منتج` : `${count} produit${count > 1 ? 's' : ''}`}
                      </span>
                    )}
                  </div>
                  <div className="p-3 sm:p-5 flex-1 flex flex-col">
                    <h2 className="font-bold text-[#1A1A1A] text-sm sm:text-lg leading-tight group-hover:text-[#C8102E] transition-colors mb-1 sm:mb-2 line-clamp-2" style={{ fontFamily: 'Outfit, sans-serif' }}>
                      {language === 'ar' && cat.nameAr ? cat.nameAr : cat.name}
                    </h2>
                    {cat.description && (
                      <p className="text-gray-500 text-xs sm:text-sm leading-relaxed line-clamp-2 flex-1 hidden sm:block">{cat.description}</p>
                    )}
                    <div className="mt-2 sm:mt-4 pt-2 sm:pt-3 border-t border-[#F0ECE8]">
                      <span className="text-[10px] sm:text-xs font-semibold uppercase tracking-wide" style={{ color: catAccentColor }}>{language === 'ar' ? 'استكشف ←' : 'Explorer →'}</span>
                    </div>
                  </div>
                </Link>
              );
            })}
          </div>
        </div>
      )}

      {/* ─── Products Grid ─────────────────────────────────────────────── */}
      <div className="max-w-7xl mx-auto px-5 sm:px-6 py-8">
        {sortedProducts.length > 0 ? (
          <>
            {subCats.length > 0 && !activeSubCat && (
              <h2 className="text-lg font-bold text-[#1A1A1A] mb-5" style={{ fontFamily: 'Outfit, sans-serif' }}>
                {language === 'ar' ? 'جميع المنتجات' : 'Tous les produits'}
              </h2>
            )}
            <div className="grid grid-cols-2 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3 sm:gap-5">
              {visibleProducts.map(product => (
                <ProductCard key={product.id} product={product} />
              ))}
            </div>
            {/* Infinite Scroll target */}
            {visibleCount < sortedProducts.length && (
              <div ref={observerTarget} className="h-24 mt-8 flex items-center justify-center">
                <div className="w-8 h-8 border-4 border-[#C8102E]/20 border-t-[#C8102E] rounded-full animate-spin" />
              </div>
            )}
          </>
        ) : subCats.length === 0 || activeSubCat ? (
          <div className="flex flex-col items-center justify-center py-24 text-center gap-4">
            <div className="w-16 h-16 rounded-2xl bg-gray-100 flex items-center justify-center">
              <Package className="w-8 h-8 text-gray-300" />
            </div>
            <h3 className="text-xl font-bold text-[#1A1A1A]" style={{ fontFamily: 'Outfit, sans-serif' }}>
              {language === 'ar' ? 'لا توجد منتجات بعد' : 'Aucun produit pour l\'instant'}
            </h3>
            <p className="text-gray-400 text-sm">{language === 'ar' ? 'منتجات هذه الفئة ستتوفر قريباً.' : 'Les produits de cette catégorie arrivent bientôt.'}</p>
            {activeSubCat ? (
              <button
                onClick={() => setActiveSubCat(null)}
                className="mt-2 px-6 py-3 bg-[#C8102E] text-white rounded-xl font-semibold hover:bg-[#a00d25] transition-colors text-sm active:scale-95 touch-manipulation cursor-pointer"
              >
                {language === 'ar' ? 'عرض جميع المنتجات' : 'Voir tous les produits'}
              </button>
            ) : (
              <Link
                href="/shop/boutique"
                prefetch={false}
                className="mt-2 px-6 py-3 bg-[#C8102E] text-white rounded-xl font-semibold hover:bg-[#a00d25] transition-colors text-sm active:scale-95 touch-manipulation"
              >
                {language === 'ar' ? 'عرض جميع المنتجات' : 'Voir tous les produits'}
              </Link>
            )}
          </div>
        ) : null}
      </div>

      {/* ─── Related categories — horizontal scroll ────────────────────── */}
      <div className="bg-white border-t border-[#E8E4DF] pt-10 pb-12">
        <div className="max-w-7xl mx-auto px-5 sm:px-6">
          <div className="flex items-center justify-between mb-5">
            <h2
              className="text-lg sm:text-xl font-bold text-[#1A1A1A]"
              style={{ fontFamily: 'Outfit, sans-serif' }}
            >
              {language === 'ar' ? 'تصفح فئات أخرى' : 'Explorer d\'autres catégories'}
            </h2>
            <Link
              href="/shop/categories"
              prefetch={false}
              className="text-xs font-semibold text-[#C8102E] hover:text-[#a00d25] uppercase tracking-wider transition-colors hidden sm:block"
            >
              {language === 'ar' ? 'عرض الكل ←' : 'Voir tout →'}
            </Link>
          </div>
          <div className="flex gap-3 sm:gap-4 overflow-x-auto pb-2 scrollbar-hide snap-x snap-mandatory">
            {allContextCategories.filter(c => c.slug !== slug && !c.parentSlug).map(cat => {
              const catColor = cat.color || '#C8102E';
              return (
                <Link
                  key={cat.id}
                  href={`/shop/categorie/${cat.slug}`}
                  prefetch={false}
                  className="group flex-shrink-0 w-36 sm:w-44 snap-start rounded-2xl overflow-hidden bg-white border border-[#E8E4DF] hover:shadow-lg hover:-translate-y-0.5 transition-all duration-300 touch-manipulation active:scale-95"
                >
                  <div className="relative h-24 sm:h-28 overflow-hidden">
                    {(cat as any).image ? (
                      <img src={(cat as any).image} alt={cat.name} loading="lazy" decoding="async" className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-110" />
                    ) : (
                      <div
                        className="w-full h-full flex items-center justify-center"
                        style={{ background: `linear-gradient(135deg, ${catColor}25 0%, ${catColor}08 100%)` }}
                      >
                        <span className="text-3xl sm:text-4xl">{cat.icon || '🧵'}</span>
                      </div>
                    )}
                    <div className="absolute inset-0 bg-gradient-to-t from-black/40 via-transparent to-transparent" />
                    <div className="absolute bottom-0 left-0 right-0 h-0.5" style={{ background: catColor }} />
                  </div>
                  <div className="px-3 py-2.5">
                    <p className="text-xs sm:text-sm font-semibold text-[#1A1A1A] leading-tight line-clamp-2 group-hover:text-[#C8102E] transition-colors" style={{ fontFamily: 'Outfit, sans-serif' }}>
                      {language === 'ar' && cat.nameAr ? cat.nameAr : cat.name}
                    </p>
                  </div>
                </Link>
              );
            })}
          </div>
        </div>

        {/* CTA */}
        <div className="max-w-7xl mx-auto px-5 sm:px-6 mt-10 pt-8 border-t border-[#F0ECE8]">
          <div className="text-center">
            <p className="text-gray-500 text-sm mb-4">{language === 'ar' ? 'تبحث عن منتج معين؟' : 'Vous cherchez un produit spécifique ?'}</p>
            <div className="flex flex-col sm:flex-row gap-3 justify-center">
              <Link
                href="/shop/boutique"
                prefetch={false}
                className="inline-flex items-center justify-center gap-2 px-6 py-3 rounded-xl bg-[#C8102E] text-white font-semibold text-sm hover:bg-[#a00d25] transition-colors active:scale-95 touch-manipulation"
              >
                {language === 'ar' ? 'عرض جميع المنتجات' : 'Voir tous les produits'}
              </Link>
              <a
                href="https://wa.me/212760998347"
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center justify-center gap-2 px-6 py-3 rounded-xl border border-[#E8E4DF] text-gray-700 font-semibold text-sm hover:border-green-400 hover:text-green-600 transition-all active:scale-95 touch-manipulation"
              >
                💬 {language === 'ar' ? 'اطلب عبر واتساب' : 'Commander sur WhatsApp'}
              </a>
            </div>
          </div>
        </div>
      </div>

      {/* ─── Scrollbar hide styles ──────────────────────────────────────── */}
      <style jsx>{`
        .scrollbar-hide::-webkit-scrollbar { display: none; }
        .scrollbar-hide { -ms-overflow-style: none; scrollbar-width: none; }
      `}</style>
    </div>
  );
}
