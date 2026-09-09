"use client";

import React, { useState, useEffect, useRef, Suspense, useMemo, useDeferredValue } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { Search, ChevronRight, ArrowUp, Sparkles, Package, Layers, X, Check } from 'lucide-react';
import { formatPrice } from '@/lib/shop-utils';
import { useShopProducts } from '@/contexts/shop-products-context';
import { useLanguage } from '@/contexts/language-context';
import type { ShopProduct, ShopCategory } from '@/lib/shop-types';
import ProductCard from '@/components/shop/ProductCard';

// ─── Boutique Content Component ──────────────────────────────────────────────
function BoutiqueContent() {
  const searchParams = useSearchParams();
  const initCat = searchParams.get('categorie');
  const initSearch = searchParams.get('q');
  const initNouveautes = searchParams.get('nouveautes') === 'true';

  const { language } = useLanguage();
  const [search, setSearch] = useState(initSearch || '');
  const deferredSearch = useDeferredValue(search);
  const [sort, setSort] = useState(initNouveautes ? 'nouveautes' : 'pertinence');
  const [activeCat, setActiveCat] = useState<string | null>(initCat || null);
  const [activeSubCat, setActiveSubCat] = useState<string | null>(null);
  const [showScrollTop, setShowScrollTop] = useState(false);
  const [visibleCount, setVisibleCount] = useState(48);

  const { products: allProducts, categories: allContextCategories, isLoading } = useShopProducts();
  const SHOP_CATEGORIES = useMemo(() => allContextCategories.filter(c => !c.parentSlug), [allContextCategories]);

  // Sync with URL query parameter when changed externally
  useEffect(() => {
    if (initCat) {
      setActiveCat(initCat);
      setActiveSubCat(null);
    }
  }, [initCat]);

  // Scroll to top button visibility
  useEffect(() => {
    const handler = () => setShowScrollTop(window.scrollY > 500);
    window.addEventListener('scroll', handler, { passive: true });
    return () => window.removeEventListener('scroll', handler);
  }, []);

  // Subcategories of current active category
  const activeSubCategories = useMemo(() => {
    if (!activeCat) return [];
    return allContextCategories.filter(c => c.parentSlug === activeCat);
  }, [activeCat, allContextCategories]);

  // Active category object
  const activeCategoryObj = useMemo(() => {
    if (!activeCat) return null;
    return allContextCategories.find(c => c.slug === activeCat || c.id === activeCat) || null;
  }, [activeCat, allContextCategories]);

  // Filtered products: category + subcategory + search + sort
  const filteredProducts = useMemo(() => {
    let filtered = [...allProducts];

    // 1. Filter by Category / Subcategory
    if (activeSubCat) {
      filtered = filtered.filter(p => 
        p.categorySlug === activeSubCat || 
        p.additionalCategorySlugs?.includes(activeSubCat)
      );
    } else if (activeCat) {
      const childSlugs = new Set<string>([activeCat]);
      allContextCategories.forEach(c => {
        if (c.parentSlug === activeCat || c.id === activeCat) {
          childSlugs.add(c.slug);
          childSlugs.add(c.id);
        }
      });
      filtered = filtered.filter(p => 
        childSlugs.has(p.categorySlug) || 
        p.additionalCategorySlugs?.some(s => childSlugs.has(s))
      );
    }

    // 2. Search query filter
    if (deferredSearch.trim()) {
      const norm = (s: string) => s.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[\u064B-\u065F\u0670]/g, '');
      const variants = (w: string) => {
        const v = [w];
        if (w.endsWith('s') && w.length > 2) v.push(w.slice(0, -1));
        if (w.endsWith('es') && w.length > 3) v.push(w.slice(0, -2));
        if (w.endsWith('x') && w.length > 2) v.push(w.slice(0, -1));
        v.push(w + 's', w + 'es');
        return v;
      };
      const words = norm(deferredSearch).split(/\s+/).filter(w => w.length >= 2);
      filtered = filtered.filter(p => {
        const fields = [p.name, p.nameAr, p.categoryName, p.categoryNameAr, p.shortDescription, ...(p.tags || [])].filter(Boolean).map(f => norm(f!));
        return words.every(word => fields.some(f => variants(word).some(v => f.includes(v))));
      });
    }

    // 3. Sorting
    if (sort === 'prix-asc') filtered.sort((a, b) => a.price - b.price);
    else if (sort === 'prix-desc') filtered.sort((a, b) => b.price - a.price);
    else if (sort === 'nouveautes') filtered.sort((a, b) => (b.isNew ? 1 : 0) - (a.isNew ? 1 : 0));

    return filtered;
  }, [allProducts, activeCat, activeSubCat, allContextCategories, deferredSearch, sort]);

  // Reset visibleCount on filter change
  useEffect(() => {
    setVisibleCount(48);
  }, [activeCat, activeSubCat, deferredSearch, sort]);

  // Infinite scroll observer for smooth continuous feed of all products
  const observerTarget = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const observer = new IntersectionObserver(
      entries => {
        if (entries[0].isIntersecting) {
          setVisibleCount(prev => Math.min(prev + 48, filteredProducts.length));
        }
      },
      { rootMargin: '600px' }
    );
    if (observerTarget.current) {
      observer.observe(observerTarget.current);
    }
    return () => observer.disconnect();
  }, [filteredProducts.length]);

  const displayedProducts = filteredProducts.slice(0, visibleCount);

  // Category select handler
  const handleSelectCategory = (slug: string | null) => {
    setActiveCat(slug);
    setActiveSubCat(null);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  return (
    <div style={{ fontFamily: 'Inter, sans-serif' }} className="min-h-screen bg-[#FBF8F3] pb-24">

      {/* ── Compact Temu-Style Hero Banner ──────────────────────────── */}
      <div className="relative overflow-hidden bg-gradient-to-r from-[#0F0F0F] via-[#1A1A1A] to-[#0F0F0F] text-white py-6 sm:py-8 border-b border-white/10">
        {/* Subtle glow circles */}
        <div className="absolute inset-0 z-0 pointer-events-none overflow-hidden">
          <div className="absolute -top-10 right-1/4 w-72 h-72 bg-[#C8102E]/20 rounded-full filter blur-[90px]" />
          <div className="absolute -bottom-10 left-1/4 w-60 h-60 bg-[#D4A843]/15 rounded-full filter blur-[80px]" />
        </div>

        <div className="relative z-10 max-w-[1560px] mx-auto px-4 sm:px-6 lg:px-8">
          {/* Top row: breadcrumb & quick badge */}
          <div className="flex items-center justify-between gap-2 mb-2">
            <nav className="text-[11px] text-gray-400 tracking-wider uppercase flex items-center gap-1.5">
              <Link href="/shop" prefetch={false} className="hover:text-white transition-colors">
                {language === 'ar' ? 'الرئيسية' : 'Accueil'}
              </Link>
              <span className="text-gray-600">/</span>
              <span className="text-white font-bold">
                {language === 'ar' ? 'المتجر' : 'Boutique'}
              </span>
            </nav>

            <span className="hidden sm:inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-white/10 border border-white/15 text-[11px] font-bold text-amber-300">
              <Sparkles className="w-3.5 h-3.5 text-amber-400" />
              {language === 'ar' ? 'جميع المنتجات متوفرة' : 'Catalogue Complet'}
            </span>
          </div>

          {/* Title & Search bar row */}
          <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
            <div>
              <h1 className="text-2xl sm:text-3xl lg:text-4xl font-black tracking-tight" style={{ fontFamily: 'Outfit, sans-serif' }}>
                {language === 'ar' ? (
                  <>متجر <span className="text-transparent bg-clip-text bg-gradient-to-r from-[#C8102E] to-[#D4A843]">LEBTEX</span></>
                ) : (
                  <>Notre <span className="text-transparent bg-clip-text bg-gradient-to-r from-[#C8102E] to-[#D4A843]">Boutique</span></>
                )}
              </h1>
              <p className="text-gray-400 text-xs sm:text-sm mt-0.5 max-w-lg">
                {language === 'ar'
                  ? 'اكتشف جميع مستلزمات الخياطة والأكسسوارات النسيجية بأفضل الأسعار'
                  : 'Tous nos articles en accessoires textiles et mercerie professionnelle'}
              </p>
            </div>

            {/* Temu-style fast search bar */}
            <div className="w-full md:w-[420px] lg:w-[480px] relative">
              <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
              <input
                value={search}
                onChange={e => setSearch(e.target.value)}
                placeholder={language === 'ar' ? 'ابحث عن منتج، فئة، رقم المقاس…' : 'Rechercher un produit, catégorie, référence…'}
                className="w-full pl-10 pr-9 py-2.5 rounded-xl bg-white/10 border border-white/20 text-white placeholder:text-gray-400 text-xs sm:text-sm focus:bg-white/15 focus:border-[#C8102E] outline-none transition-all shadow-inner backdrop-blur-sm"
              />
              {search && (
                <button
                  onClick={() => setSearch('')}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-white p-1"
                  aria-label="Effacer la recherche"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* ── Temu-Style Sticky Category Pills Bar ────────────────────── */}
      <div className="sticky top-[60px] sm:top-[64px] z-30 bg-[#FBF8F3]/95 backdrop-blur-md border-b border-[#E8E4DF] shadow-2xs">
        <div className="max-w-[1560px] mx-auto px-3 sm:px-6 lg:px-8 py-2.5">
          <div className="flex items-center gap-2 overflow-x-auto scrollbar-hide py-0.5">
            {/* "Tout" Pill */}
            <button
              onClick={() => handleSelectCategory(null)}
              className={`flex-shrink-0 flex items-center gap-1.5 px-4 py-2 rounded-full text-xs font-black uppercase tracking-wider transition-all cursor-pointer active:scale-95 ${
                activeCat === null
                  ? 'bg-[#1A1A1A] text-white shadow-md'
                  : 'bg-white border border-[#E8E4DF] text-neutral-700 hover:border-[#1A1A1A] hover:text-[#1A1A1A]'
              }`}
            >
              <Package className="w-3.5 h-3.5" />
              <span>{language === 'ar' ? 'الكل' : 'Tout'}</span>
              <span className={`text-[10px] px-1.5 py-0.2 rounded-full ${
                activeCat === null ? 'bg-white/20 text-white' : 'bg-neutral-100 text-neutral-600'
              }`}>
                {allProducts.length}
              </span>
            </button>

            {/* Category Pills */}
            {SHOP_CATEGORIES.map(cat => {
              const isSelected = activeCat === cat.slug;
              const catCount = allProducts.filter(p => {
                if (p.categorySlug === cat.slug) return true;
                if (p.additionalCategorySlugs?.includes(cat.slug)) return true;
                const subSlugs = allContextCategories.filter(c => c.parentSlug === cat.slug).map(c => c.slug);
                return subSlugs.includes(p.categorySlug);
              }).length;

              return (
                <button
                  key={cat.id}
                  onClick={() => handleSelectCategory(cat.slug)}
                  className={`flex-shrink-0 flex items-center gap-1.5 px-3.5 py-2 rounded-full text-xs font-bold transition-all cursor-pointer active:scale-95 ${
                    isSelected
                      ? 'bg-[#C8102E] text-white shadow-md shadow-[#C8102E]/25'
                      : 'bg-white border border-[#E8E4DF] text-neutral-700 hover:border-[#C8102E]/50 hover:text-[#C8102E]'
                  }`}
                >
                  {cat.icon && <span className="text-sm">{cat.icon}</span>}
                  <span>{language === 'ar' && cat.nameAr ? cat.nameAr : cat.name}</span>
                  {catCount > 0 && (
                    <span className={`text-[10px] px-1.5 py-0.2 rounded-full ${
                      isSelected ? 'bg-white/25 text-white' : 'bg-neutral-100 text-neutral-500'
                    }`}>
                      {catCount}
                    </span>
                  )}
                </button>
              );
            })}
          </div>

          {/* Subcategories bar (if category selected has subcategories) */}
          {activeSubCategories.length > 0 && (
            <div className="flex items-center gap-1.5 overflow-x-auto scrollbar-hide pt-2 pb-0.5 border-t border-neutral-200/60 mt-2">
              <span className="text-[10px] font-bold uppercase tracking-wider text-neutral-400 mr-1 flex-shrink-0">
                {language === 'ar' ? 'الأقسام:' : 'Sous-rayons:'}
              </span>
              <button
                onClick={() => setActiveSubCat(null)}
                className={`flex-shrink-0 px-2.5 py-1 rounded-lg text-[11px] font-bold transition-all cursor-pointer ${
                  activeSubCat === null
                    ? 'bg-[#1A1A1A] text-white'
                    : 'bg-white/70 border border-neutral-200 text-neutral-600 hover:text-neutral-900'
                }`}
              >
                {language === 'ar' ? 'الكل' : 'Tous'}
              </button>
              {activeSubCategories.map(sub => {
                const isSubSelected = activeSubCat === sub.slug;
                const subCount = allProducts.filter(p => p.categorySlug === sub.slug || p.additionalCategorySlugs?.includes(sub.slug)).length;
                return (
                  <button
                    key={sub.id}
                    onClick={() => setActiveSubCat(sub.slug)}
                    className={`flex-shrink-0 flex items-center gap-1 px-2.5 py-1 rounded-lg text-[11px] font-semibold transition-all cursor-pointer ${
                      isSubSelected
                        ? 'bg-[#C8102E] text-white shadow-xs font-bold'
                        : 'bg-white border border-neutral-200 text-neutral-700 hover:border-neutral-300 hover:text-neutral-950'
                    }`}
                  >
                    <span>{language === 'ar' && sub.nameAr ? sub.nameAr : sub.name}</span>
                    {subCount > 0 && (
                      <span className={`text-[9px] px-1 rounded-full ${
                        isSubSelected ? 'bg-white/25 text-white' : 'bg-neutral-100 text-neutral-400'
                      }`}>
                        {subCount}
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* ── Wider Container: Temu-Style Product Showcase ────────────── */}
      <div className="max-w-[1560px] w-full mx-auto px-3 sm:px-6 lg:px-8 pt-5">

        {/* ── Sort & Results Count Bar ── */}
        <div className="flex flex-wrap items-center justify-between gap-3 pb-4 mb-4 border-b border-neutral-200/80">
          <div className="flex items-center gap-2">
            <h2 className="text-sm sm:text-base font-black text-neutral-900" style={{ fontFamily: 'Outfit, sans-serif' }}>
              {activeCategoryObj ? (
                <span>{language === 'ar' && activeCategoryObj.nameAr ? activeCategoryObj.nameAr : activeCategoryObj.name}</span>
              ) : (
                <span>{language === 'ar' ? 'جميع منتجات المتجر' : 'Tous les produits du catalogue'}</span>
              )}
            </h2>
            <span className="px-2.5 py-0.5 rounded-full bg-neutral-200/80 text-neutral-800 text-xs font-black">
              {filteredProducts.length} {language === 'ar' ? 'منتج' : `produit${filteredProducts.length > 1 ? 's' : ''}`}
            </span>

            {deferredSearch && (
              <span className="text-xs text-neutral-500">
                pour « <strong className="text-[#C8102E]">{deferredSearch}</strong> »
              </span>
            )}
          </div>

          {/* Sort selector */}
          <div className="flex items-center gap-2">
            <span className="text-xs font-bold text-neutral-500 hidden sm:inline">
              {language === 'ar' ? 'ترتيب:' : 'Trier par:'}
            </span>
            <select
              value={sort}
              onChange={e => setSort(e.target.value)}
              className="px-3 py-1.5 border border-[#E8E4DF] rounded-xl bg-white text-xs font-bold text-neutral-700 hover:border-neutral-400 focus:border-[#C8102E] outline-none cursor-pointer shadow-2xs"
            >
              <option value="pertinence">{language === 'ar' ? 'الصلة' : 'Pertinence'}</option>
              <option value="prix-asc">{language === 'ar' ? 'السعر: من الأقل للأعلى' : 'Prix croissant'}</option>
              <option value="prix-desc">{language === 'ar' ? 'السعر: من الأعلى للأقل' : 'Prix décroissant'}</option>
              <option value="nouveautes">{language === 'ar' ? 'أحدث المنتجات' : 'Nouveautés'}</option>
            </select>
          </div>
        </div>

        {/* ── Empty state ── */}
        {filteredProducts.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 text-center bg-white rounded-3xl border border-neutral-200 p-8 shadow-xs">
            <div className="w-16 h-16 rounded-full bg-neutral-100 flex items-center justify-center text-3xl mb-4">
              🔍
            </div>
            <h3 className="text-lg sm:text-xl font-bold text-[#1A1A1A] mb-2" style={{ fontFamily: 'Outfit, sans-serif' }}>
              {language === 'ar' ? 'لم يتم العثور على أي منتج' : 'Aucun produit trouvé'}
            </h3>
            <p className="text-neutral-500 mb-6 text-xs sm:text-sm max-w-sm">
              {language === 'ar'
                ? 'جرب البحث بكلمة أخرى أو اختر قسماً آخر من شريط الفئات أعلاه'
                : 'Essayez un autre mot-clé ou réinitialisez les filtres pour voir tout le catalogue'}
            </p>
            <button
              onClick={() => { setSearch(''); setActiveCat(null); setActiveSubCat(null); }}
              className="px-6 py-2.5 bg-[#C8102E] text-white text-xs sm:text-sm rounded-xl font-bold hover:bg-[#a00d25] transition-all cursor-pointer active:scale-95 shadow-md shadow-[#C8102E]/20"
            >
              {language === 'ar' ? 'عرض جميع المنتجات' : 'Voir tous les produits'}
            </button>
          </div>
        ) : (
          /* ── Full Temu-Style Product Grid: WIDER & LARGER DISPLAY ── */
          <div>
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-2.5 sm:gap-4 lg:gap-4.5">
              {displayedProducts.map(product => (
                <ProductCard key={product.id} product={product} showAddToCart={true} />
              ))}
            </div>

            {/* Progressive loader indicator / Infinite scroll sentinel */}
            {visibleCount < filteredProducts.length && (
              <div ref={observerTarget} className="flex flex-col items-center justify-center py-10 gap-3">
                <div className="w-8 h-8 border-3 border-[#C8102E] border-t-transparent rounded-full animate-spin" />
                <span className="text-xs font-bold text-neutral-400">
                  {language === 'ar' ? 'جارٍ تحميل المزيد من المنتجات…' : 'Chargement des produits suivants…'}
                </span>
                <span className="text-[11px] text-neutral-400">
                  {displayedProducts.length} / {filteredProducts.length}
                </span>
              </div>
            )}
          </div>
        )}
      </div>

      {/* ── Floating Scroll-To-Top Button ───────────────────────────── */}
      {showScrollTop && (
        <button
          onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}
          className="fixed bottom-6 right-6 z-40 w-11 h-11 rounded-full bg-[#1A1A1A] text-white shadow-xl flex items-center justify-center hover:bg-[#C8102E] transition-all active:scale-90 cursor-pointer"
          aria-label="Retour en haut"
        >
          <ArrowUp className="w-5 h-5" />
        </button>
      )}

      <style jsx>{`
        .scrollbar-hide::-webkit-scrollbar { display: none; }
        .scrollbar-hide { -ms-overflow-style: none; scrollbar-width: none; }
      `}</style>
    </div>
  );
}

// ─── Default Page Export with Suspense ─────────────────────────────────────────
export default function BoutiquePage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen flex items-center justify-center bg-[#FBF8F3]">
        <div className="flex flex-col items-center gap-3">
          <div className="w-10 h-10 border-4 border-[#C8102E] border-t-transparent rounded-full animate-spin" />
          <span className="text-xs font-bold text-neutral-400">Chargement de la boutique…</span>
        </div>
      </div>
    }>
      <BoutiqueContent />
    </Suspense>
  );
}
