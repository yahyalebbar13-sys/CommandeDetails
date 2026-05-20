"use client";
import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { initializeApp, getApps, getApp } from 'firebase/app';
import { getFirestore, collection, getDocs } from 'firebase/firestore';
import { firebaseConfig } from '@/firebase/config';
import { SHOP_CATEGORIES, SHOP_PRODUCTS_DATA } from '@/lib/shop-products-data';
import { useShopCart } from '@/contexts/shop-cart-context';
import type { ShopProduct, ShopCategory } from '@/lib/shop-types';
import { ShoppingBag, ArrowLeft, Package } from 'lucide-react';

// ─── Inline ProductCard ────────────────────────────────────────────────────────
function ProductCard({ product }: { product: ShopProduct }) {
  const { addItem } = useShopCart();
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
      productImage: product.images[0] || '',
      price: product.price,
      quantity: product.minOrderQty || 1,
      maxStock: product.stockQty,
    });
    setAdded(true);
    setTimeout(() => setAdded(false), 2000);
  };

  return (
    <Link href={`/shop/produit/${product.id}`} className="block group">
      <div className="bg-white rounded-2xl border border-[#E8E4DF] overflow-hidden transition-all duration-300 hover:-translate-y-1 hover:shadow-2xl">
        <div className="relative aspect-square bg-gray-50 overflow-hidden">
          <img
            src={product.images[0] || `https://picsum.photos/400/400?random=${product.id}`}
            alt={product.name}
            className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-110"
          />
          {/* Badges */}
          <div className="absolute top-3 left-3 flex flex-col gap-1.5">
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
            className="absolute top-3 right-3 w-8 h-8 bg-white/90 backdrop-blur-sm rounded-full flex items-center justify-center shadow transition-all hover:scale-110"
          >
            <span className={`text-base ${wished ? 'text-red-500' : 'text-gray-400'}`}>
              {wished ? '♥' : '♡'}
            </span>
          </button>
          {/* Quick add overlay */}
          <div className="absolute inset-x-0 bottom-0 p-3 opacity-0 group-hover:opacity-100 transition-opacity">
            <button
              onClick={handleAdd}
              className={`w-full py-2 rounded-xl text-sm font-bold transition-all ${
                added ? 'bg-[#10B981] text-white' : 'bg-[#0F0F0F] text-white hover:bg-[#C8102E]'
              }`}
            >
              {added ? '✓ Ajouté !' : '+ Ajouter au panier'}
            </button>
          </div>
        </div>
        <div className="p-4">
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
            <span className="font-black text-[#1A1A1A]">{product.price.toFixed(2)} MAD</span>
            {product.comparePrice && (
              <span className="text-xs text-gray-400 line-through">
                {product.comparePrice.toFixed(2)} MAD
              </span>
            )}
          </div>
          <div className="mt-2 flex items-center gap-1">
            <span className={`w-1.5 h-1.5 rounded-full ${product.inStock ? 'bg-[#10B981]' : 'bg-red-500'}`} />
            <span className="text-xs text-gray-500">{product.inStock ? 'En stock' : 'Rupture de stock'}</span>
          </div>
        </div>
      </div>
    </Link>
  );
}

// ─── Page ──────────────────────────────────────────────────────────────────────
export default function CategoryPage({ params }: { params: any }) {
  const slug: string = React.use(params).slug as string;

  const [category, setCategory] = useState<ShopCategory | null>(null);
  const [products, setProducts] = useState<ShopProduct[]>([]);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [sort, setSort] = useState('pertinence');

  useEffect(() => {
    if (!slug) return;

    const firebaseApp = getApps().length ? getApp() : initializeApp(firebaseConfig);
    const db = getFirestore(firebaseApp);

    // Look for category in hardcoded list first
    const hardcodedCat = SHOP_CATEGORIES.find(c => c.slug === slug);

    Promise.all([
      getDocs(collection(db, 'shop_custom_categories')),
      getDocs(collection(db, 'shop_custom_products')),
    ]).then(([ccSnap, cpSnap]) => {
      // Find category (hardcoded or custom)
      const customCats = ccSnap.docs.map(d => ({ id: d.id, ...d.data() } as ShopCategory));
      const foundCat = hardcodedCat || customCats.find(c => c.slug === slug);

      if (!foundCat) {
        setNotFound(true);
        setLoading(false);
        return;
      }
      setCategory(foundCat);

      // Merge products
      const customProds = cpSnap.docs.map(d => ({ id: d.id, ...d.data() } as ShopProduct));
      const allProds = [
        ...SHOP_PRODUCTS_DATA,
        ...customProds.filter(cp => !SHOP_PRODUCTS_DATA.find(p => p.id === cp.id)),
      ];
      setProducts(allProds.filter(p => p.categorySlug === slug));
    }).catch(() => {
      const foundCat = hardcodedCat;
      if (!foundCat) { setNotFound(true); setLoading(false); return; }
      setCategory(foundCat);
      setProducts(SHOP_PRODUCTS_DATA.filter(p => p.categorySlug === slug));
    }).finally(() => setLoading(false));
  }, [slug]);

  // Sort products
  const sortedProducts = [...products].sort((a, b) => {
    if (sort === 'prix-asc') return a.price - b.price;
    if (sort === 'prix-desc') return b.price - a.price;
    if (sort === 'nouveautes') return (b.isNew ? 1 : 0) - (a.isNew ? 1 : 0);
    return 0;
  });

  if (loading) {
    return (
      <div className="min-h-screen bg-[#FBF8F3] flex items-center justify-center">
        <div className="w-10 h-10 border-4 border-[#C8102E] border-t-transparent rounded-full animate-spin" />
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
            <Link href="/shop/boutique" className="hover:text-white transition-colors">Boutique</Link>
            <span>›</span>
            <span className="text-white">{category?.name}</span>
          </nav>

          <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-4">
            <div>
              {/* Color accent bar */}
              <div className="w-12 h-1 rounded-full mb-3" style={{ background: accentColor }} />
              <h1
                className="text-3xl sm:text-5xl font-black text-white leading-tight"
                style={{ fontFamily: 'Outfit, sans-serif' }}
              >
                {category?.name}
              </h1>
              {category?.description && (
                <p className="text-white/75 mt-2 max-w-xl text-sm sm:text-base leading-relaxed">
                  {category.description}
                </p>
              )}
            </div>
            <div
              className="flex-shrink-0 px-4 py-2 rounded-full text-sm font-semibold text-white border border-white/30 backdrop-blur-sm self-start sm:self-auto"
              style={{ background: `${accentColor}40` }}
            >
              <ShoppingBag className="inline w-4 h-4 mr-1.5 mb-0.5" />
              {sortedProducts.length} produit{sortedProducts.length !== 1 ? 's' : ''}
            </div>
          </div>
        </div>
      </div>

      {/* ─── Toolbar ──────────────────────────────────────────────────────── */}
      <div className="sticky top-0 z-20 bg-white/90 backdrop-blur-md border-b border-[#E8E4DF] shadow-sm">
        <div className="max-w-7xl mx-auto px-6 py-3 flex items-center justify-between gap-4">
          <Link
            href="/shop/boutique"
            className="flex items-center gap-1.5 text-sm text-gray-500 hover:text-[#C8102E] transition-colors font-medium"
          >
            <ArrowLeft className="w-4 h-4" />
            <span className="hidden sm:inline">Toute la boutique</span>
          </Link>
          <div className="flex items-center gap-3">
            <span className="text-xs text-gray-400 hidden sm:inline">Trier par :</span>
            <select
              value={sort}
              onChange={e => setSort(e.target.value)}
              className="text-sm border border-[#E8E4DF] rounded-lg px-3 py-1.5 bg-white focus:border-[#C8102E] outline-none font-medium"
            >
              <option value="pertinence">Pertinence</option>
              <option value="prix-asc">Prix croissant</option>
              <option value="prix-desc">Prix décroissant</option>
              <option value="nouveautes">Nouveautés</option>
            </select>
          </div>
        </div>
      </div>

      {/* ─── Products ─────────────────────────────────────────────────────── */}
      <div className="max-w-7xl mx-auto px-6 py-10">
        {sortedProducts.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-24 text-center gap-4">
            <div className="w-16 h-16 rounded-2xl bg-gray-100 flex items-center justify-center">
              <Package className="w-8 h-8 text-gray-300" />
            </div>
            <h3 className="text-xl font-bold text-[#1A1A1A]" style={{ fontFamily: 'Outfit, sans-serif' }}>
              Aucun produit pour l'instant
            </h3>
            <p className="text-gray-400 text-sm">Les produits de cette catégorie arrivent bientôt.</p>
            <Link
              href="/shop/boutique"
              className="mt-2 px-6 py-3 bg-[#C8102E] text-white rounded-xl font-semibold hover:bg-[#a00d25] transition-colors text-sm"
            >
              Voir tous les produits
            </Link>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-5">
            {sortedProducts.map(product => (
              <ProductCard key={product.id} product={product} />
            ))}
          </div>
        )}
      </div>

      {/* ─── Related categories ────────────────────────────────────────────── */}
      <div className="bg-white border-t border-[#E8E4DF] py-12">
        <div className="max-w-7xl mx-auto px-6">
          <h2
            className="text-xl font-bold text-[#1A1A1A] mb-6"
            style={{ fontFamily: 'Outfit, sans-serif' }}
          >
            Autres catégories
          </h2>
          <div className="flex flex-wrap gap-3">
            {SHOP_CATEGORIES.filter(c => c.slug !== slug).map(cat => (
              <Link
                key={cat.slug}
                href={`/shop/categorie/${cat.slug}`}
                className="px-4 py-2 rounded-xl border border-[#E8E4DF] text-sm font-medium text-gray-600 hover:border-[#C8102E] hover:text-[#C8102E] transition-all bg-white"
              >
                {cat.icon} {cat.name}
              </Link>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
