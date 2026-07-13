"use client";
import React, { useState } from 'react';
import Link from 'next/link';
import { useShopCartActions } from '@/contexts/shop-cart-context';
import { useShopProducts } from '@/contexts/shop-products-context';
import type { ShopProduct, ShopCategory } from '@/lib/shop-types';
import { ShoppingBag, ArrowLeft, Package, Loader2 } from 'lucide-react';
import { formatPrice } from '@/lib/shop-utils';

// ─── Inline ProductCard ────────────────────────────────────────────────────────
const ProductCard = React.memo(function ProductCard({ product }: { product: ShopProduct }) {
  const { addItem } = useShopCartActions();
  const [added, setAdded] = useState(false);
  const [wished, setWished] = useState(false);
  const discount = product.comparePrice
    ? Math.round(((product.comparePrice - product.price) / product.comparePrice) * 100)
    : 0;

  const handleAdd = (e: React.MouseEvent) => {
    e.preventDefault();
    addItem({
      productId: product.id,
      productName: product.name,
      productImage: product.images?.[0] || '',
      price: product.price,
      quantity: product.minOrderQty || 1,
      maxStock: product.stockQty ?? 999,
    });
    setAdded(true);
    setTimeout(() => setAdded(false), 2000);
  };

  return (
    <div className="bg-white rounded-2xl border border-[#E8E4DF] overflow-hidden transition-all duration-300 hover:-translate-y-1 hover:shadow-2xl relative group flex flex-col h-full">
      <div className="relative aspect-square bg-gray-50 overflow-hidden">
        <Link href={`/shop/produit/${product.id}`} className="absolute inset-0 z-0" tabIndex={-1} aria-label={product.name}></Link>
        <div className="absolute inset-0 z-0 pointer-events-none">
          <img
            src={product.images?.[0] || `https://picsum.photos/400/400?random=${product.id}`}
            alt={product.name}
            className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-110"
          />
        </div>
        {/* Badges */}
        <div className="absolute top-3 left-3 flex flex-col gap-1.5 z-10 pointer-events-none">
          {product.isNew && (
            <span className="bg-[#10B981] text-white text-[10px] font-black px-2 py-0.5 rounded-full uppercase tracking-wide">
              Nouveau
            </span>
          )}
          {product.isPromo && discount > 0 && (
            <span className="bg-[#C8102E] text-white text-[10px] font-black px-2 py-0.5 rounded-full uppercase">
              -{discount}%
            </span>
          )}
        </div>
        {/* Wishlist */}
        <button
          onClick={e => { e.preventDefault(); setWished(!wished); }}
          className="absolute top-3 right-3 w-8 h-8 bg-white/90 backdrop-blur-sm rounded-full flex items-center justify-center shadow transition-all hover:scale-110 z-20"
        >
          <span className={`text-base ${wished ? 'text-red-500' : 'text-gray-400'}`}>
            {wished ? '♥' : '♡'}
          </span>
        </button>
        {/* Mobile Quick Add (Persistent) */}
        {product.inStock && (
          <button
            onClick={handleAdd}
            disabled={added}
            className={`lg:hidden absolute bottom-3 right-3 z-20 w-9 h-9 rounded-full shadow-md flex items-center justify-center transition-all ${
              added ? 'bg-[#10B981] text-white' : 'bg-white text-gray-900 active:bg-gray-100'
            }`}
          >
            {added ? <span className="text-[10px] font-bold">✓</span> : <ShoppingBag className="w-4 h-4" />}
          </button>
        )}
        
        {/* Desktop Quick add overlay */}
        <div className="hidden lg:block absolute inset-x-0 bottom-0 p-3 opacity-0 group-hover:opacity-100 transition-opacity z-20 pointer-events-none">
          <button
            onClick={handleAdd}
            className={`pointer-events-auto w-full py-2 rounded-xl text-sm font-bold transition-all ${
              added ? 'bg-[#10B981] text-white' : 'bg-[#0F0F0F] text-white hover:bg-[#C8102E]'
            }`}
          >
            {added ? '✓ Ajouté !' : '+ Ajouter au panier'}
          </button>
        </div>
      </div>
      <Link href={`/shop/produit/${product.id}`} className="p-4 flex flex-col flex-grow">
        <p className="text-xs font-semibold text-[#D4A843] uppercase tracking-wide mb-1">
          {product.categoryName}
        </p>
        <h3
          className="font-semibold text-[#1A1A1A] text-sm leading-tight mb-2 line-clamp-2"
          style={{ fontFamily: 'Outfit, sans-serif' }}
        >
          {product.name}
        </h3>
        {product.rating && (
          <div className="flex items-center gap-1 mb-2">
            <span className="text-[#D4A843] text-xs">
              {'★'.repeat(Math.floor(product.rating))}{'☆'.repeat(5 - Math.floor(product.rating))}
            </span>
            <span className="text-xs text-gray-400">({product.reviewCount || 0})</span>
          </div>
        )}
        <div className="flex items-center gap-2">
          <span className="font-black text-[#1A1A1A]">{formatPrice(product.price)}</span>
          {product.comparePrice && (
            <span className="text-xs text-gray-400 line-through">
              {formatPrice(product.comparePrice)}
            </span>
          )}
        </div>
        <div className="mt-2 flex items-center gap-1">
          <span className={`w-1.5 h-1.5 rounded-full ${product.inStock ? 'bg-[#10B981]' : 'bg-red-500'}`} />
          <span className="text-xs text-gray-500">{product.inStock ? 'En stock' : 'Rupture de stock'}</span>
        </div>
      </Link>
    </div>
  );
});

import { useLanguage } from '@/contexts/language-context';

// ─── Page ──────────────────────────────────────────────────────────────────────
export default function CategoryPage({ params }: { params: any }) {
  const rawSlug: string = React.use(params).slug as string;
  // Decode URL encoding (e.g. %20 → space) AND normalize to match stored slugs
  const slug = decodeURIComponent(rawSlug);
  const [sort, setSort] = useState('pertinence');
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
  const products = allContextProducts.filter(p =>
    p.categorySlug === canonicalSlug ||
    p.categorySlug === categoryId ||
    subCatIdentifiers.has(p.categorySlug)
  );
  const notFound = !isLoading && !category;

  // Sort products
  const sortedProducts = [...products].sort((a, b) => {
    if (sort === 'prix-asc') return a.price - b.price;
    if (sort === 'prix-desc') return b.price - a.price;
    if (sort === 'nouveautes') return (b.isNew ? 1 : 0) - (a.isNew ? 1 : 0);
    return 0;
  });

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
          className="flex items-center gap-2 px-6 py-3 bg-[#C8102E] text-white rounded-xl font-semibold hover:bg-[#a00d25] transition-colors"
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
      <div className="relative h-72 sm:h-96 overflow-hidden">
        {/* Background image or gradient */}
        {category?.image ? (
          <img
            src={category.image}
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
        <div className="relative h-full max-w-7xl mx-auto px-6 flex flex-col justify-end pb-10">
          {/* Breadcrumb */}
          <nav className="flex items-center gap-2 text-xs text-white/60 mb-4">
            <Link href="/shop" className="hover:text-white transition-colors">Accueil</Link>
            <span>›</span>
            <Link href="/shop/categories" className="hover:text-white transition-colors">Catégories</Link>
            <span>›</span>
            {category?.parentSlug && (
              <>
                <Link href={`/shop/categorie/${category.parentSlug}`} className="hover:text-white transition-colors">
                  {allContextCategories.find(c => c.slug === category.parentSlug)?.name || category.parentSlug}
                </Link>
                <span>›</span>
              </>
            )}
            <span className="text-white">{category?.name}</span>
          </nav>

          <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-4">
            <div>
              {/* Color accent bar */}
              <div className="w-12 h-1 rounded-full mb-3" style={{ background: accentColor }} />
              <h1
                className="text-3xl sm:text-5xl font-black text-white leading-tight"
                style={{ fontFamily: 'Outfit, sans-serif' }}
                dir={language === 'ar' ? 'rtl' : 'ltr'}
              >
                {language === 'ar' && category?.nameAr ? category.nameAr : category?.name}
              </h1>
              {(category?.description || category?.descriptionAr) && (
                <p className="text-white/75 mt-2 max-w-xl text-sm sm:text-base leading-relaxed">
                  {language === 'ar' && category.descriptionAr ? category.descriptionAr : category.description}
                </p>
              )}
            </div>
            <div
              className="flex-shrink-0 px-4 py-2 rounded-full text-sm font-semibold text-white border border-white/30 backdrop-blur-sm self-start sm:self-auto"
              style={{ background: `${accentColor}40` }}
            >
              {subCats.length > 0 ? (
                <span>{subCats.length} sous-catégorie{subCats.length > 1 ? 's' : ''}</span>
              ) : (
                <>
                  <ShoppingBag className="inline w-4 h-4 mr-1.5 mb-0.5" />
                  {language === 'ar' ? `${sortedProducts.length} منتج` : `${sortedProducts.length} produit${sortedProducts.length !== 1 ? 's' : ''}`}
                </>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* ─── Toolbar ──────────────────────────────────────────────────────── */}
      <div className="sticky top-0 z-20 bg-white/90 backdrop-blur-md border-b border-[#E8E4DF] shadow-sm">
        <div className="max-w-7xl mx-auto px-6 py-3 flex items-center justify-between gap-4">
          <button
            onClick={() => window.history.back()}
            aria-label="Retour"
            title="Retour"
            className="w-10 h-10 flex items-center justify-center bg-white border border-[#E8E4DF] rounded-full hover:bg-[#FBF8F3] hover:border-[#C8102E] transition-all shadow-sm flex-shrink-0 text-[#1A1A1A] hover:text-[#C8102E]"
          >
            <ArrowLeft className="w-5 h-5" />
          </button>
          <div className="flex items-center gap-3">
            <span className="text-xs text-gray-400 hidden sm:inline">{language === 'ar' ? 'ترتيب حسب:' : 'Trier par :'}</span>
            <select
              value={sort}
              onChange={e => setSort(e.target.value)}
              className="text-sm border border-[#E8E4DF] rounded-lg px-3 py-1.5 bg-white focus:border-[#C8102E] outline-none font-medium"
            >
              <option value="pertinence">{language === 'ar' ? 'الصلة' : 'Pertinence'}</option>
              <option value="prix-asc">{language === 'ar' ? 'السعر تصاعدي' : 'Prix croissant'}</option>
              <option value="prix-desc">{language === 'ar' ? 'السعر تنازلي' : 'Prix décroissant'}</option>
              <option value="nouveautes">{language === 'ar' ? 'الجديد' : 'Nouveautés'}</option>
            </select>
          </div>
        </div>
      </div>

      {/* ─── Products & Subcategories ───────────────────────────────────────── */}
      <div className="max-w-7xl mx-auto px-6 py-10">
        {subCats.length > 0 && (
          <>
            {sortedProducts.length > 0 && (
              <h2 className="text-lg font-bold text-[#1A1A1A] mb-4" style={{ fontFamily: 'Outfit, sans-serif' }}>
                {language === 'ar' ? 'الفئات الفرعية' : 'Sous-catégories'}
              </h2>
            )}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5 mb-10">
              {subCats.map(cat => {
                const count = allContextProducts.filter(p => p.categorySlug === cat.slug || p.categorySlug === cat.id).length;
                const catAccentColor = cat.color || '#C8102E';
                return (
                  <Link
                    key={cat.id}
                    href={`/shop/categorie/${cat.slug}`}
                    className="group relative overflow-hidden rounded-2xl bg-white border border-[#E8E4DF] hover:shadow-xl hover:-translate-y-1 transition-all duration-300 flex flex-col"
                  >
                    <div className="relative h-44 overflow-hidden flex-shrink-0">
                      {cat.image ? (
                        <img src={cat.image as string} alt={cat.name} loading="lazy" decoding="async" className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-105" />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center" style={{ background: `linear-gradient(135deg, ${catAccentColor}30 0%, ${catAccentColor}10 100%)` }}>
                          <span className="text-6xl opacity-50">{cat.icon || '📁'}</span>
                        </div>
                      )}
                      <div className="absolute inset-0 bg-gradient-to-t from-black/50 via-transparent to-transparent" />
                      <div className="absolute bottom-0 left-0 right-0 h-0.5" style={{ background: catAccentColor }} />
                      {count > 0 && (
                        <span className="absolute top-3 right-3 px-2.5 py-1 rounded-full text-[10px] font-bold text-[#1A1A1A] bg-white/90 backdrop-blur-sm shadow-sm">
                          {language === 'ar' ? `${count} منتج` : `${count} produit${count > 1 ? 's' : ''}`}
                        </span>
                      )}
                    </div>
                    <div className="p-5 flex-1 flex flex-col">
                      <h2 className="font-bold text-[#1A1A1A] text-lg leading-tight group-hover:text-[#C8102E] transition-colors mb-2" style={{ fontFamily: 'Outfit, sans-serif' }}>
                        {language === 'ar' && cat.nameAr ? cat.nameAr : cat.name}
                      </h2>
                      {cat.description && (
                        <p className="text-gray-500 text-sm leading-relaxed line-clamp-2 flex-1">{cat.description}</p>
                      )}
                      <div className="mt-4 pt-3 border-t border-[#F0ECE8]">
                        <span className="text-xs font-semibold uppercase tracking-wide" style={{ color: catAccentColor }}>{language === 'ar' ? 'استكشف ←' : 'Explorer →'}</span>
                      </div>
                    </div>
                  </Link>
                );
              })}
            </div>
          </>
        )}
        {sortedProducts.length > 0 ? (
          <>
            {subCats.length > 0 && (
              <h2 className="text-lg font-bold text-[#1A1A1A] mb-4" style={{ fontFamily: 'Outfit, sans-serif' }}>
                {language === 'ar' ? 'المنتجات' : 'Produits'}
              </h2>
            )}
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-5">
              {sortedProducts.map(product => (
                <ProductCard key={product.id} product={product} />
              ))}
            </div>
          </>
        ) : subCats.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-24 text-center gap-4">
            <div className="w-16 h-16 rounded-2xl bg-gray-100 flex items-center justify-center">
              <Package className="w-8 h-8 text-gray-300" />
            </div>
            <h3 className="text-xl font-bold text-[#1A1A1A]" style={{ fontFamily: 'Outfit, sans-serif' }}>
              {language === 'ar' ? 'لا توجد منتجات بعد' : 'Aucun produit pour l’instant'}
            </h3>
            <p className="text-gray-400 text-sm">{language === 'ar' ? 'منتجات هذه الفئة ستتوفر قريباً.' : 'Les produits de cette catégorie arrivent bientôt.'}</p>
            <Link
              href="/shop/boutique"
              className="mt-2 px-6 py-3 bg-[#C8102E] text-white rounded-xl font-semibold hover:bg-[#a00d25] transition-colors text-sm"
            >
              {language === 'ar' ? 'عرض جميع المنتجات' : 'Voir tous les produits'}
            </Link>
          </div>
        ) : null}
      </div>

      {/* ─── Related categories ────────────────────────────────────────────── */}
      <div className="bg-white border-t border-[#E8E4DF] py-12">
        <div className="max-w-7xl mx-auto px-6">
          <h2
            className="text-xl font-bold text-[#1A1A1A] mb-6"
            style={{ fontFamily: 'Outfit, sans-serif' }}
          >
            {language === 'ar' ? 'فئات أخرى' : 'Autres catégories'}
          </h2>
          <div className="flex flex-wrap gap-3">
            {allContextCategories.filter(c => c.slug !== slug && !c.parentSlug).map(cat => (
              <Link
                key={cat.id}
                href={`/shop/categorie/${cat.slug}`}
                className="px-4 py-2 rounded-xl border border-[#E8E4DF] text-sm font-medium text-gray-600 hover:border-[#C8102E] hover:text-[#C8102E] transition-all bg-white"
              >
              {cat.icon} {language === 'ar' && cat.nameAr ? cat.nameAr : cat.name}
            </Link>
          ))}
        </div>
        </div>
      </div>
    </div>
  );
}
