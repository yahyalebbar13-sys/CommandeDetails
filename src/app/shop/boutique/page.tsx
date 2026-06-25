"use client";
import React, { useState, useEffect, useRef, Suspense } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { Search, SlidersHorizontal, X, ChevronDown, Grid3X3, List, Filter } from 'lucide-react';
import { formatPrice, getDiscountPercent } from '@/lib/shop-utils';
import { useShopCart } from '@/contexts/shop-cart-context';
import { useShopProducts } from '@/contexts/shop-products-context';
import type { ShopProduct, ShopCategory } from '@/lib/shop-types';

// --- ProductCard inlined to avoid circular imports ---
function ProductCardInline({ product }: { product: ShopProduct }) {
  const { addItem } = useShopCart();
  const [added, setAdded] = useState(false);
  const [wished, setWished] = useState(false);

  const handleAdd = (e: React.MouseEvent) => {
    e.preventDefault();
    addItem({
      productId: product.id,
      productName: product.name,
      productImage: product.images[0] || '',
      price: product.price,
      quantity: product.minOrderQty || 1,
      maxStock: product.stockQty,
    });
    setAdded(true);
    setTimeout(() => setAdded(false), 2000);
  };

  const discount = product.comparePrice ? getDiscountPercent(product.price, product.comparePrice) : 0;

  return (
    <Link href={`/shop/produit/${product.id}`} className="block group">
      <div className="bg-white rounded-2xl border border-[#E8E4DF] overflow-hidden shop-product-card">
        {/* Image */}
        <div className="relative aspect-square shop-img-zoom bg-gray-50">
          <img src={product.images[0]} alt={product.name} className="w-full h-full object-cover" />
          {/* Badges */}
          <div className="absolute top-3 left-3 flex flex-col gap-1.5">
            {product.isNew && <span className="bg-[#10B981] text-white text-[10px] font-black px-2 py-0.5 rounded-full uppercase tracking-wide">Nouveau</span>}
            {product.isPromo && discount > 0 && <span className="bg-[#C8102E] text-white text-[10px] font-black px-2 py-0.5 rounded-full uppercase">-{discount}%</span>}
          </div>
          {/* Wishlist */}
          <button onClick={(e) => { e.preventDefault(); setWished(!wished); }}
            className="absolute top-3 right-3 w-8 h-8 bg-white/90 backdrop-blur-sm rounded-full flex items-center justify-center shadow transition-all hover:scale-110">
            <span className={`text-base ${wished ? 'text-red-500' : 'text-gray-400'}`}>{wished ? '♥' : '♡'}</span>
          </button>
          {/* Quick add overlay */}
          <div className="absolute inset-x-0 bottom-0 p-3 opacity-0 group-hover:opacity-100 transition-opacity">
            <button onClick={handleAdd}
              className={`w-full py-2 rounded-xl text-sm font-bold transition-all ${added ? 'bg-[#10B981] text-white' : 'bg-[#0F0F0F] text-white hover:bg-[#C8102E]'}`}>
              {added ? '✓ Ajouté !' : '+ Ajouter au panier'}
            </button>
          </div>
        </div>
        {/* Content */}
        <div className="p-4">
          <p className="text-xs font-semibold text-[#D4A843] uppercase tracking-wide mb-1">{product.categoryName}</p>
          <h3 className="font-semibold text-[#1A1A1A] text-sm leading-tight mb-2 line-clamp-2" style={{ fontFamily: 'Outfit, sans-serif' }}>{product.name}</h3>
          {/* Rating */}
          {product.rating && (
            <div className="flex items-center gap-1 mb-2">
              <span className="text-[#D4A843] text-xs">{'★'.repeat(Math.floor(product.rating))}{'☆'.repeat(5 - Math.floor(product.rating))}</span>
              <span className="text-xs text-[#6B6B6B]">({product.reviewCount})</span>
            </div>
          )}
          {/* Price */}
          <div className="flex items-center gap-2">
            <span className="font-black text-[#1A1A1A]">{formatPrice(product.price)}</span>
            {product.comparePrice && <span className="text-xs text-[#6B6B6B] line-through">{formatPrice(product.comparePrice)}</span>}
          </div>
          {/* Stock */}
          <div className="mt-2 flex items-center gap-1">
            <span className={`w-1.5 h-1.5 rounded-full ${product.inStock ? 'bg-[#10B981]' : 'bg-red-500'}`} />
            <span className="text-xs text-[#6B6B6B]">{product.inStock ? 'En stock' : 'Rupture de stock'}</span>
          </div>
        </div>
      </div>
    </Link>
  );
}

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
            <label key={cat.slug} className="flex items-center gap-2 cursor-pointer group">
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

  const [search, setSearch] = useState('');
  const [sort, setSort] = useState('pertinence');
  const [selectedCategories, setSelectedCategories] = useState<string[]>(initCat ? [initCat] : []);
  const [priceMin, setPriceMin] = useState('');
  const [priceMax, setPriceMax] = useState('');
  const [inStockOnly, setInStockOnly] = useState(false);
  const [tags, setTags] = useState<string[]>([]);
  const [mobileFilters, setMobileFilters] = useState(false);
  const { products: allProducts, categories: allContextCategories } = useShopProducts();
  const SHOP_CATEGORIES = allContextCategories.filter(c => !c.parentSlug);

  // Filter & sort
  let products = [...allProducts];

  if (search.trim()) {
    const q = search.toLowerCase();
    products = products.filter(p =>
      p.name.toLowerCase().includes(q) || p.categoryName?.toLowerCase().includes(q) || p.tags.some(t => t.includes(q))
    );
  }
  if (selectedCategories.length > 0) {
    products = products.filter(p => selectedCategories.includes(p.categorySlug));
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
      <div className="bg-[#0F0F0F] text-white py-12">
        <div className="max-w-7xl mx-auto px-6">
          <nav className="text-xs text-gray-500 mb-3">
            <Link href="/shop" className="hover:text-white transition-colors">Accueil</Link>
            <span className="mx-2">›</span>
            <span className="text-white">Boutique</span>
          </nav>
          <h1 className="text-4xl font-black" style={{ fontFamily: 'Outfit, sans-serif' }}>Notre Boutique</h1>
          <p className="text-gray-400 mt-2">Accessoires textiles & mercerie professionnelle</p>
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
              const cat = SHOP_CATEGORIES.find(cat => cat.slug === c);
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
                  <ProductCardInline key={product.id} product={product} />
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
