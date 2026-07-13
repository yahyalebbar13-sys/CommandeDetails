"use client";
import React, { useState, useEffect, useRef, Suspense } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { useSearchParams } from 'next/navigation';
import { Search, SlidersHorizontal, X, ChevronDown, Grid3X3, List, Filter } from 'lucide-react';
import { formatPrice, getDiscountPercent } from '@/lib/shop-utils';
import { useShopCart } from '@/contexts/shop-cart-context';
import { useShopProducts } from '@/contexts/shop-products-context';
import type { ShopProduct, ShopCategory } from '@/lib/shop-types';
import ProductCard from '@/components/shop/ProductCard';
// --- Filter Sidebar ---
function FilterSidebar({
  categories,
  selectedCategories, setSelectedCategories,
  priceMin, setPriceMin,
  priceMax, setPriceMax,
  inStockOnly, setInStockOnly,
  tags, setTags,
  onClear,
}: any) {
  return (
    <aside className="space-y-6">
      {/* Categories */}
      <div>
        <h3 className="font-bold text-[#1A1A1A] mb-3 text-sm uppercase tracking-wide" style={{ fontFamily: 'Outfit, sans-serif' }}>Catégories</h3>
        <div className="space-y-2">
          {categories?.map((cat: any) => (
            <label key={cat.id} className="flex items-center gap-2 cursor-pointer group">
              <input type="checkbox" checked={selectedCategories.includes(cat.slug)}
                onChange={e => {
                  if (e.target.checked) setSelectedCategories((prev: string[]) => [...prev, cat.slug]);
                  else setSelectedCategories((prev: string[]) => prev.filter((c: string) => c !== cat.slug));
                }}
                className="w-4 h-4 accent-[#C8102E]" />
              <span className="text-sm text-[#6B6B6B] group-hover:text-[#1A1A1A] transition-colors">{cat.name}</span>
            </label>
          ))}
        </div>
      </div>

      {/* Price */}
      <div>
        <h3 className="font-bold text-[#1A1A1A] mb-3 text-sm uppercase tracking-wide" style={{ fontFamily: 'Outfit, sans-serif' }}>Prix (MAD)</h3>
        <div className="flex gap-2 items-center">
          <input type="number" placeholder="Min" value={priceMin} onChange={e => setPriceMin(e.target.value)}
            className="w-full px-3 py-2 border border-[#E8E4DF] rounded-lg text-sm focus:border-[#C8102E] outline-none" />
          <span className="text-gray-400">—</span>
          <input type="number" placeholder="Max" value={priceMax} onChange={e => setPriceMax(e.target.value)}
            className="w-full px-3 py-2 border border-[#E8E4DF] rounded-lg text-sm focus:border-[#C8102E] outline-none" />
        </div>
      </div>

      {/* Availability */}
      <div>
        <h3 className="font-bold text-[#1A1A1A] mb-3 text-sm uppercase tracking-wide" style={{ fontFamily: 'Outfit, sans-serif' }}>Disponibilité</h3>
        <label className="flex items-center gap-2 cursor-pointer">
          <input type="checkbox" checked={inStockOnly} onChange={e => setInStockOnly(e.target.checked)} className="w-4 h-4 accent-[#C8102E]" />
          <span className="text-sm text-[#6B6B6B]">En stock uniquement</span>
        </label>
      </div>

      {/* Tags */}
      <div>
        <h3 className="font-bold text-[#1A1A1A] mb-3 text-sm uppercase tracking-wide" style={{ fontFamily: 'Outfit, sans-serif' }}>Collections</h3>
        <div className="space-y-2">
          {[{ key: 'isNew', label: 'Nouveautés' }, { key: 'isPromo', label: 'Promotions' }, { key: 'isFeatured', label: 'Vedettes' }].map(({ key, label }) => (
            <label key={key} className="flex items-center gap-2 cursor-pointer group">
              <input type="checkbox" checked={tags.includes(key)}
                onChange={e => {
                  if (e.target.checked) setTags((prev: string[]) => [...prev, key]);
                  else setTags((prev: string[]) => prev.filter((t: string) => t !== key));
                }}
                className="w-4 h-4 accent-[#C8102E]" />
              <span className="text-sm text-[#6B6B6B] group-hover:text-[#1A1A1A] transition-colors">{label}</span>
            </label>
          ))}
        </div>
      </div>

      <button onClick={onClear}
        className="w-full py-2.5 border border-[#C8102E] text-[#C8102E] rounded-xl text-sm font-semibold hover:bg-[#C8102E] hover:text-white transition-all">
        Effacer les filtres
      </button>
    </aside>
  );
}

function BoutiqueContent() {
  const searchParams = useSearchParams();
  const initCat = searchParams.get('categorie');
  const initSearch = searchParams.get('q');

  const initPromo = searchParams.get('promo') === 'true';
  const initNew = searchParams.get('nouveautes') === 'true';

  const [search, setSearch] = useState(initSearch || '');
  const [sort, setSort] = useState('pertinence');
  const [selectedCategories, setSelectedCategories] = useState<string[]>(initCat ? [initCat] : []);
  const [priceMin, setPriceMin] = useState('');
  const [priceMax, setPriceMax] = useState('');
  const [inStockOnly, setInStockOnly] = useState(false);
  const [tags, setTags] = useState<string[]>([
    ...(initPromo ? ['isPromo'] : []),
    ...(initNew ? ['isNew'] : []),
  ]);
  const [mobileFilters, setMobileFilters] = useState(false);
  const { products: allProducts, categories: allContextCategories } = useShopProducts();
  const SHOP_CATEGORIES = allContextCategories.filter(c => !c.parentSlug);

  // Get unique images for the hero collage (top 12 images)
  const heroImages = Array.from(new Set(allProducts.flatMap(p => p.images))).filter(Boolean).slice(0, 12);

  // Filter & sort
  let products = [...allProducts];

  if (search.trim()) {
    const q = search.toLowerCase();
    products = products.filter(p =>
      p.name.toLowerCase().includes(q) || p.categoryName?.toLowerCase().includes(q) || p.tags.some(t => t.includes(q))
    );
  }
  if (selectedCategories.length > 0) {
    // Also include subcategories when filtering by parent category
    const allCatsFromContext = allContextCategories;
    const expandedSlugs = new Set<string>(selectedCategories);
    // For each selected slug, add its children
    allCatsFromContext.forEach(cat => {
      if (cat.parentSlug && selectedCategories.includes(cat.parentSlug)) {
        expandedSlugs.add(cat.slug);
      }
    });
    products = products.filter(p => expandedSlugs.has(p.categorySlug));
  }
  if (priceMin) products = products.filter(p => p.price >= Number(priceMin));
  if (priceMax) products = products.filter(p => p.price <= Number(priceMax));
  if (inStockOnly) products = products.filter(p => p.inStock);
  if (tags.includes('isNew')) products = products.filter(p => p.isNew);
  if (tags.includes('isPromo')) products = products.filter(p => p.isPromo);
  if (tags.includes('isFeatured')) products = products.filter(p => p.isFeatured);

  if (sort === 'prix-asc') products.sort((a, b) => a.price - b.price);
  else if (sort === 'prix-desc') products.sort((a, b) => b.price - a.price);
  else if (sort === 'nouveautes') products.sort((a, b) => (b.isNew ? 1 : 0) - (a.isNew ? 1 : 0));
  else if (sort === 'ventes') products.sort((a, b) => (b.reviewCount || 0) - (a.reviewCount || 0));

  const clearFilters = () => {
    setSearch(''); setSelectedCategories([]); setPriceMin(''); setPriceMax('');
    setInStockOnly(false); setTags([]);
  };
  const hasFilters = search || selectedCategories.length > 0 || priceMin || priceMax || inStockOnly || tags.length > 0;

  return (
    <div style={{ fontFamily: 'Inter, sans-serif', background: '#FBF8F3' }} className="min-h-screen">
      {/* Hero */}
      <div className="relative overflow-hidden bg-[#0F0F0F] text-white py-16 lg:py-24">
        {/* Real Products Collage Background */}
        <div className="absolute inset-0 z-0 overflow-hidden opacity-50">
          {heroImages.length > 0 && (
            <div className="absolute inset-0 grid grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4 transform scale-110 -rotate-2">
              {heroImages.map((img, idx) => (
                <div key={idx} className="relative w-full aspect-square rounded-2xl overflow-hidden shadow-lg">
                  <img src={img} alt="" loading="lazy" decoding="async" className="w-full h-full object-cover" />
                </div>
              ))}
            </div>
          )}
          <div className="absolute inset-0 bg-gradient-to-t from-[#0F0F0F] via-[#0F0F0F]/50 to-[#0F0F0F]/10" />
          <div className="absolute inset-0 bg-gradient-to-r from-[#0F0F0F] via-transparent to-[#0F0F0F] opacity-80" />
        </div>
        
        {/* Premium Background Effects */}
        <div className="absolute inset-0 z-0 opacity-30 pointer-events-none">
          <div className="absolute top-0 right-1/4 w-96 h-96 bg-[#C8102E] rounded-full mix-blend-screen filter blur-[120px] animate-blob" />
          <div className="absolute bottom-0 left-1/4 w-72 h-72 bg-[#D4A843] rounded-full mix-blend-screen filter blur-[100px] animate-blob animation-delay-2000" />
        </div>
        
        <div className="relative z-10 max-w-7xl mx-auto px-6 text-center flex flex-col items-center">
          <nav className="text-xs text-gray-400 mb-4 tracking-widest uppercase flex items-center gap-2">
            <Link href="/shop" className="hover:text-white transition-colors">Accueil</Link>
            <span className="text-gray-600">/</span>
            <span className="text-white font-semibold">Boutique</span>
          </nav>
          <h1 className="text-4xl md:text-5xl lg:text-6xl font-black mb-4 tracking-tight" style={{ fontFamily: 'Outfit, sans-serif' }}>
            Notre <span className="text-transparent bg-clip-text bg-gradient-to-r from-[#C8102E] to-[#D4A843]">Boutique</span>
          </h1>
          <p className="text-gray-300 max-w-2xl text-base md:text-lg">
            Découvrez notre sélection premium d'accessoires textiles et de mercerie professionnelle. Tout pour donner vie à vos créations.
          </p>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-6 py-8">
        {/* Top bar */}
        <div className="flex flex-col sm:flex-row gap-4 mb-6">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
            <input value={search} onChange={e => setSearch(e.target.value)}
              placeholder="Rechercher un produit..."
              className="w-full pl-10 pr-4 py-2.5 border border-[#E8E4DF] rounded-xl bg-white focus:border-[#C8102E] outline-none transition-all" />
          </div>
          <select value={sort} onChange={e => setSort(e.target.value)}
            className="px-4 py-2.5 border border-[#E8E4DF] rounded-xl bg-white focus:border-[#C8102E] outline-none text-sm font-medium">
            <option value="pertinence">Pertinence</option>
            <option value="prix-asc">Prix croissant</option>
            <option value="prix-desc">Prix décroissant</option>
            <option value="nouveautes">Nouveautés</option>
            <option value="ventes">Meilleures ventes</option>
          </select>
          <button onClick={() => setMobileFilters(true)}
            className="md:hidden flex items-center gap-2 px-4 py-2.5 bg-[#0F0F0F] text-white rounded-xl font-semibold text-sm">
            <Filter className="w-4 h-4" /> Filtrer
          </button>
        </div>

        {/* Active filters */}
        {hasFilters && (
          <div className="flex flex-wrap gap-2 mb-6">
            {selectedCategories.map(c => {
              const cat = allContextCategories.find(cat => cat.slug === c);
              return (
                <span key={c} className="flex items-center gap-1.5 bg-[#C8102E]/10 text-[#C8102E] px-3 py-1 rounded-full text-xs font-semibold">
                  {cat?.name}
                  <button onClick={() => setSelectedCategories(prev => prev.filter(x => x !== c))}><X className="w-3 h-3" /></button>
                </span>
              );
            })}
            {hasFilters && (
              <button onClick={clearFilters} className="text-xs text-gray-500 hover:text-[#C8102E] underline transition-colors">
                Effacer tout
              </button>
            )}
          </div>
        )}

        <div className="flex gap-8">
          {/* Desktop sidebar */}
          <div className="hidden md:block w-64 shrink-0">
            <div className="bg-white border border-[#E8E4DF] rounded-2xl p-6 sticky top-24">
              <div className="flex items-center justify-between mb-5">
                <h2 className="font-bold text-[#1A1A1A]" style={{ fontFamily: 'Outfit, sans-serif' }}>Filtres</h2>
                {hasFilters && <button onClick={clearFilters} className="text-xs text-[#C8102E]">Effacer</button>}
              </div>
              <FilterSidebar
                categories={SHOP_CATEGORIES}
                selectedCategories={selectedCategories} setSelectedCategories={setSelectedCategories}
                priceMin={priceMin} setPriceMin={setPriceMin}
                priceMax={priceMax} setPriceMax={setPriceMax}
                inStockOnly={inStockOnly} setInStockOnly={setInStockOnly}
                tags={tags} setTags={setTags}
                onClear={clearFilters}
              />
            </div>
          </div>

          {/* Products grid */}
          <div className="flex-1">
            <p className="text-sm text-[#6B6B6B] mb-5">
              <strong className="text-[#1A1A1A]">{products.length}</strong> produit{products.length !== 1 ? 's' : ''} trouvé{products.length !== 1 ? 's' : ''}
            </p>

            {products.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-24 text-center">
                <span className="text-6xl mb-4">😔</span>
                <h3 className="text-xl font-bold text-[#1A1A1A] mb-2" style={{ fontFamily: 'Outfit, sans-serif' }}>Aucun produit trouvé</h3>
                <p className="text-[#6B6B6B] mb-6">Essayez de modifier vos filtres de recherche</p>
                <button onClick={clearFilters}
                  className="px-6 py-3 bg-[#C8102E] text-white rounded-xl font-semibold hover:bg-[#a00d25] transition-colors">
                  Effacer les filtres
                </button>
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
                {products.map(product => (
                  <ProductCard key={product.id} product={product} />
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Mobile filter drawer */}
      {mobileFilters && (
        <div className="fixed inset-0 z-50 md:hidden">
          <div className="absolute inset-0 bg-black/50" onClick={() => setMobileFilters(false)} />
          <div className="absolute bottom-0 left-0 right-0 bg-white rounded-t-2xl p-6 max-h-[85vh] overflow-y-auto">
            <div className="flex items-center justify-between mb-5">
              <h2 className="font-bold text-[#1A1A1A] text-lg" style={{ fontFamily: 'Outfit, sans-serif' }}>Filtres</h2>
              <button onClick={() => setMobileFilters(false)}><X className="w-5 h-5" /></button>
            </div>
            <FilterSidebar
              categories={SHOP_CATEGORIES}
              selectedCategories={selectedCategories} setSelectedCategories={setSelectedCategories}
              priceMin={priceMin} setPriceMin={setPriceMin}
              priceMax={priceMax} setPriceMax={setPriceMax}
              inStockOnly={inStockOnly} setInStockOnly={setInStockOnly}
              tags={tags} setTags={setTags}
              onClear={clearFilters}
            />
            <button onClick={() => setMobileFilters(false)}
              className="w-full mt-4 py-3 bg-[#C8102E] text-white rounded-xl font-bold">
              Voir {products.length} produits
            </button>
          </div>
        </div>
      )}
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
