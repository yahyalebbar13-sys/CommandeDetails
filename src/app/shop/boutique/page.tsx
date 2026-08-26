"use client";
import React, { useState, useEffect, useRef, Suspense, useMemo } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { Search, ChevronRight, ArrowUp, Sparkles, Package } from 'lucide-react';
import { formatPrice } from '@/lib/shop-utils';
import { useShopProducts } from '@/contexts/shop-products-context';
import type { ShopProduct } from '@/lib/shop-types';
import ProductCard from '@/components/shop/ProductCard';

// ─── Category Section ─────────────────────────────────────────────────────────
function CategorySection({ 
  name, icon, slug, products, delay 
}: { 
  name: string; icon?: string; slug: string; products: ShopProduct[]; delay: number 
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [visible, setVisible] = useState(false);
  const [showAll, setShowAll] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) { setVisible(true); observer.disconnect(); }
      },
      { threshold: 0.05 }
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  const displayed = showAll ? products : products.slice(0, 4);

  return (
    <section
      ref={ref}
      id={`cat-${slug}`}
      className={`transition-all duration-700 ${visible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-12'}`}
      style={{ transitionDelay: `${delay}ms` }}
    >
      {/* Category Header */}
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          {icon && <span className="text-2xl">{icon}</span>}
          <div>
            <h2 className="text-xl sm:text-2xl font-black text-[#1A1A1A] tracking-tight" style={{ fontFamily: 'Outfit, sans-serif' }}>
              {name}
            </h2>
            <p className="text-xs text-[#999] mt-0.5">{products.length} produit{products.length > 1 ? 's' : ''}</p>
          </div>
        </div>
        <Link
          href={`/shop/boutique?categorie=${slug}`}
          className="hidden sm:flex items-center gap-1 text-xs font-semibold text-[#C8102E] hover:text-[#a00d25] transition-colors uppercase tracking-wider"
        >
          Tout voir <ChevronRight className="w-3.5 h-3.5" />
        </Link>
      </div>

      {/* Products Grid */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3 sm:gap-4">
        {displayed.map(product => (
          <ProductCard key={product.id} product={product} />
        ))}
      </div>

      {/* Show more */}
      {products.length > 4 && !showAll && (
        <div className="flex justify-center mt-6">
          <button
            onClick={() => setShowAll(true)}
            className="group flex items-center gap-2 px-6 py-2.5 rounded-full border border-[#E8E4DF] bg-white text-sm font-semibold text-[#1A1A1A] hover:border-[#C8102E] hover:text-[#C8102E] transition-all active:scale-95"
          >
            Voir les {products.length - 4} autres
            <ChevronRight className="w-4 h-4 group-hover:translate-x-0.5 transition-transform" />
          </button>
        </div>
      )}
    </section>
  );
}

// ─── Main Content ─────────────────────────────────────────────────────────────
function BoutiqueContent() {
  const searchParams = useSearchParams();
  const initCat = searchParams.get('categorie');
  const initSearch = searchParams.get('q');

  const [search, setSearch] = useState(initSearch || '');
  const deferredSearch = React.useDeferredValue(search);
  const [sort, setSort] = useState('pertinence');
  const [activeCat, setActiveCat] = useState<string | null>(initCat || null);
  const [showScrollTop, setShowScrollTop] = useState(false);

  const { products: allProducts, categories: allContextCategories } = useShopProducts();
  const SHOP_CATEGORIES = allContextCategories.filter(c => !c.parentSlug);

  // Scroll to top button
  useEffect(() => {
    const handler = () => setShowScrollTop(window.scrollY > 600);
    window.addEventListener('scroll', handler, { passive: true });
    return () => window.removeEventListener('scroll', handler);
  }, []);

  // Filtered products
  const filteredProducts = useMemo(() => {
    let filtered = [...allProducts];

    if (deferredSearch.trim()) {
      // Normalize: remove accents + Arabic diacritics
      const norm = (s: string) => s.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[\u064B-\u065F\u0670]/g, '');
      // Generate variants (plural/singular tolerance)
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

    if (sort === 'prix-asc') filtered.sort((a, b) => a.price - b.price);
    else if (sort === 'prix-desc') filtered.sort((a, b) => b.price - a.price);
    else if (sort === 'nouveautes') filtered.sort((a, b) => (b.isNew ? 1 : 0) - (a.isNew ? 1 : 0));

    return filtered;
  }, [allProducts, deferredSearch, sort]);

  // Group by category
  const categorySections = useMemo(() => {
    const catMap = new Map<string, { name: string; icon?: string; slug: string; products: ShopProduct[] }>();

    // If a specific category is selected, only show that one
    const catsToShow = activeCat
      ? SHOP_CATEGORIES.filter(c => c.slug === activeCat)
      : SHOP_CATEGORIES;

    catsToShow.forEach(cat => {
      // Get all child slugs for this parent category
      const childSlugs = new Set<string>([cat.slug]);
      allContextCategories.forEach(c => {
        if (c.parentSlug === cat.slug) childSlugs.add(c.slug);
      });

      const catProducts = filteredProducts.filter(p => 
        childSlugs.has(p.categorySlug) || 
        p.additionalCategorySlugs?.some(s => childSlugs.has(s))
      );
      // Deduplicate by product ID (a product might match via primary + additional)
      const uniqueProducts = [...new Map(catProducts.map(p => [p.id, p])).values()];
      if (uniqueProducts.length > 0) {
        catMap.set(cat.slug, {
          name: cat.name,
          icon: cat.icon,
          slug: cat.slug,
          products: uniqueProducts,
        });
      }
    });

    return Array.from(catMap.values());
  }, [filteredProducts, SHOP_CATEGORIES, allContextCategories, activeCat]);

  // When searching, show flat results
  const isSearching = deferredSearch.trim().length > 0;

  const scrollToCategory = (slug: string) => {
    if (activeCat === slug) {
      setActiveCat(null);
      return;
    }
    setActiveCat(slug);
    // Scroll to the category
    setTimeout(() => {
      const el = document.getElementById(`cat-${slug}`);
      if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }, 100);
  };

  return (
    <div style={{ fontFamily: 'Inter, sans-serif' }} className="min-h-screen bg-[#FBF8F3]">

      {/* ── Hero ────────────────────────────────────────────────────── */}
      <div className="relative overflow-hidden bg-[#0F0F0F] text-white py-14 lg:py-20">
        {/* Background glow */}
        <div className="absolute inset-0 z-0 pointer-events-none">
          <div className="absolute top-0 right-1/3 w-80 h-80 bg-[#C8102E]/20 rounded-full filter blur-[120px]" />
          <div className="absolute bottom-0 left-1/4 w-64 h-64 bg-[#D4A843]/15 rounded-full filter blur-[100px]" />
        </div>

        <div className="relative z-10 max-w-5xl mx-auto px-6 text-center">
          <nav className="text-xs text-gray-500 mb-4 tracking-widest uppercase flex items-center justify-center gap-2">
            <Link href="/shop" prefetch={false} className="hover:text-white transition-colors">Accueil</Link>
            <span className="text-gray-700">/</span>
            <span className="text-white font-semibold">Boutique</span>
          </nav>
          <h1 className="text-3xl md:text-5xl font-black mb-3 tracking-tight" style={{ fontFamily: 'Outfit, sans-serif' }}>
            Notre <span className="text-transparent bg-clip-text bg-gradient-to-r from-[#C8102E] to-[#D4A843]">Boutique</span>
          </h1>
          <p className="text-gray-400 max-w-lg mx-auto text-sm md:text-base mb-8">
            Tous nos produits en accessoires textiles et mercerie professionnelle.
          </p>

          {/* Search bar — centered and prominent */}
          <div className="max-w-xl mx-auto relative">
            <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-500" />
            <input
              value={search}
              onChange={e => { setSearch(e.target.value); setActiveCat(null); }}
              placeholder="Rechercher un produit, une catégorie…"
              className="w-full pl-12 pr-4 py-3.5 rounded-2xl bg-white/10 border border-white/15 text-white placeholder:text-gray-500 text-sm focus:bg-white/15 focus:border-[#C8102E]/50 outline-none transition-all backdrop-blur-sm"
            />
            {search && (
              <button
                onClick={() => { setSearch(''); setActiveCat(null); }}
                className="absolute right-4 top-1/2 -translate-y-1/2 text-gray-500 hover:text-white transition-colors"
              >
                ✕
              </button>
            )}
          </div>
        </div>
      </div>

      {/* ── Category Pills (sticky) ─────────────────────────────────── */}
      <div className="sticky top-[64px] z-30 bg-[#FBF8F3]/95 backdrop-blur-md border-b border-[#E8E4DF]">
        <div className="max-w-6xl mx-auto px-4 py-3">
          <div className="flex items-center gap-2 overflow-x-auto scrollbar-hide pb-1">
            <button
              onClick={() => setActiveCat(null)}
              className={`flex-shrink-0 flex items-center gap-1.5 px-4 py-2 rounded-full text-xs font-bold uppercase tracking-wider transition-all active:scale-95 ${
                !activeCat
                  ? 'bg-[#1A1A1A] text-white shadow-md'
                  : 'bg-white border border-[#E8E4DF] text-[#6B6B6B] hover:border-[#1A1A1A] hover:text-[#1A1A1A]'
              }`}
            >
              <Package className="w-3.5 h-3.5" />
              Tout
            </button>
            {SHOP_CATEGORIES.map(cat => (
              <button
                key={cat.slug}
                onClick={() => scrollToCategory(cat.slug)}
                className={`flex-shrink-0 flex items-center gap-1.5 px-4 py-2 rounded-full text-xs font-bold transition-all active:scale-95 ${
                  activeCat === cat.slug
                    ? 'bg-[#C8102E] text-white shadow-md shadow-[#C8102E]/25'
                    : 'bg-white border border-[#E8E4DF] text-[#6B6B6B] hover:border-[#C8102E]/30 hover:text-[#C8102E]'
                }`}
              >
                {cat.icon && <span className="text-sm">{cat.icon}</span>}
                {cat.name}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* ── Sort + Count Bar ─────────────────────────────────────────── */}
      <div className="max-w-6xl mx-auto px-6 pt-6 pb-2 flex items-center justify-between">
        <p className="text-sm text-[#999]">
          <strong className="text-[#1A1A1A]">{filteredProducts.length}</strong> produit{filteredProducts.length !== 1 ? 's' : ''}
          {deferredSearch && (
            <span className="ml-1.5">
              pour « <span className="text-[#C8102E] font-medium">{deferredSearch}</span> »
            </span>
          )}
          {search !== deferredSearch && <span className="ml-2 text-[#C8102E] animate-pulse text-xs">Recherche…</span>}
        </p>
        <select
          value={sort}
          onChange={e => setSort(e.target.value)}
          className="px-3 py-1.5 border border-[#E8E4DF] rounded-lg bg-white text-xs font-medium text-[#6B6B6B] focus:border-[#C8102E] outline-none cursor-pointer"
        >
          <option value="pertinence">Pertinence</option>
          <option value="prix-asc">Prix ↑</option>
          <option value="prix-desc">Prix ↓</option>
          <option value="nouveautes">Nouveautés</option>
        </select>
      </div>

      {/* ── Content ──────────────────────────────────────────────────── */}
      <div className="max-w-6xl mx-auto px-6 pb-20">

        {filteredProducts.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-24 text-center">
            <span className="text-6xl mb-4">😔</span>
            <h3 className="text-xl font-bold text-[#1A1A1A] mb-2" style={{ fontFamily: 'Outfit, sans-serif' }}>Aucun produit trouvé</h3>
            <p className="text-[#6B6B6B] mb-6 text-sm">Essayez un autre terme de recherche</p>
            <button
              onClick={() => { setSearch(''); setActiveCat(null); }}
              className="px-6 py-3 bg-[#C8102E] text-white rounded-xl font-semibold hover:bg-[#a00d25] transition-colors active:scale-95"
            >
              Effacer la recherche
            </button>
          </div>
        ) : isSearching ? (
          /* Flat grid when searching */
          <div className="pt-6">
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3 sm:gap-4">
              {filteredProducts.slice(0, 40).map(product => (
                <ProductCard key={product.id} product={product} />
              ))}
            </div>
          </div>
        ) : (
          /* Category sections */
          <div className="space-y-16 pt-6">
            {categorySections.map((section, idx) => (
              <CategorySection
                key={section.slug}
                name={section.name}
                icon={section.icon}
                slug={section.slug}
                products={section.products}
                delay={idx * 80}
              />
            ))}
          </div>
        )}
      </div>

      {/* ── Scroll to top ────────────────────────────────────────────── */}
      {showScrollTop && (
        <button
          onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}
          className="fixed bottom-6 right-6 z-40 w-11 h-11 rounded-full bg-[#1A1A1A] text-white shadow-xl flex items-center justify-center hover:bg-[#C8102E] transition-all active:scale-90"
          style={{ animation: 'fadeInUp 0.3s ease' }}
        >
          <ArrowUp className="w-5 h-5" />
        </button>
      )}

      <style jsx>{`
        @keyframes fadeInUp {
          from { opacity: 0; transform: translateY(10px); }
          to { opacity: 1; transform: translateY(0); }
        }
        .scrollbar-hide::-webkit-scrollbar { display: none; }
        .scrollbar-hide { -ms-overflow-style: none; scrollbar-width: none; }
      `}</style>
    </div>
  );
}

export default function BoutiquePage() {
  return (
    <Suspense fallback={<div className="min-h-screen flex items-center justify-center"><div className="w-8 h-8 border-4 border-[#C8102E] border-t-transparent rounded-full animate-spin" /></div>}>
      <BoutiqueContent />
    </Suspense>
  );
}
