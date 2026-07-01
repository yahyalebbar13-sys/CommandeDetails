"use client";
import React, { useState } from 'react';
import Link from 'next/link';
import { ShoppingCart, Heart, MessageCircle, Truck, RotateCcw, Shield, Star, ChevronRight, ChevronDown, Minus, Plus, Package } from 'lucide-react';
import { getProductById, getSimilarProducts } from '@/lib/shop-products-data';
import { formatPrice, getDiscountPercent, buildWhatsAppLink } from '@/lib/shop-utils';
import { useShopCart } from '@/contexts/shop-cart-context';
import { useShopProducts } from '@/contexts/shop-products-context';
import { db } from '@/lib/firebase-db';
import { doc, getDoc } from 'firebase/firestore';
import type { CartItem, ProductVariant } from '@/lib/shop-types';

function Accordion({ title, icon, defaultOpen = false, children }: { title: string, icon: React.ReactNode, defaultOpen?: boolean, children: React.ReactNode }) {
  const [isOpen, setIsOpen] = useState(defaultOpen);
  return (
    <div className="bg-white border border-[#E8E4DF] rounded-2xl overflow-hidden shadow-sm mb-4">
      <button 
        onClick={() => setIsOpen(!isOpen)}
        className="w-full flex items-center justify-between px-6 py-4 transition-colors hover:bg-[#FBF8F3] text-left"
        style={{ background: isOpen ? 'linear-gradient(135deg, #FBF8F3 0%, #F3EFE8 100%)' : 'white' }}
      >
        <div className="flex items-center gap-3">
          <div className={`w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 shadow-inner ${isOpen ? 'bg-[#C8102E] text-white' : 'bg-gray-100 text-gray-500'}`}>
            {icon}
          </div>
          <h2 className="font-bold text-[#1A1A1A] text-base md:text-lg" style={{ fontFamily: 'Outfit, sans-serif' }}>
            {title}
          </h2>
        </div>
        <ChevronDown className={`w-5 h-5 text-gray-400 transition-transform ${isOpen ? 'rotate-180' : ''}`} />
      </button>
      {isOpen && (
        <div className="border-t border-[#F3EFE8]">
          {children}
        </div>
      )}
    </div>
  );
}

function SimilarProductCard({ product }: { product: any }) {
  const discount = product.comparePrice ? getDiscountPercent(product.price, product.comparePrice) : 0;
  return (
    <Link href={`/shop/produit/${product.id}`} className="block bg-white border border-[#E8E4DF] rounded-2xl overflow-hidden hover:-translate-y-1 hover:shadow-lg transition-all">
      <div className="aspect-square overflow-hidden bg-gray-50 relative">
        <img src={product.images[0]} alt={product.name} className="w-full h-full object-cover hover:scale-105 transition-transform duration-500" />
        {discount > 0 && <span className="absolute top-2 left-2 bg-[#C8102E] text-white text-[10px] font-black px-2 py-0.5 rounded-full">-{discount}%</span>}
      </div>
      <div className="p-3">
        <p className="text-xs text-[#D4A843] font-semibold mb-1">{product.categoryName}</p>
        <h4 className="font-semibold text-[#1A1A1A] text-sm line-clamp-2 mb-2" style={{ fontFamily: 'Outfit, sans-serif' }}>{product.name}</h4>
        <div className="flex items-center gap-2">
          <span className="font-black text-[#1A1A1A]">{formatPrice(product.price)}</span>
          {product.comparePrice && <span className="text-xs text-gray-400 line-through">{formatPrice(product.comparePrice)}</span>}
        </div>
      </div>
    </Link>
  );
}

// ─── Multi-Variant Selector ───────────────────────────────────────────────────
function MultiVariantSelector({
  variants,
  basePrice,
  productId,
  productName,
  productImage,
  onAdd,
}: {
  variants: ProductVariant[];
  basePrice: number;
  productId: string;
  productName: string;
  productImage: string;
  onAdd: (items: CartItem[]) => void;
}) {
  const [qtys, setQtys] = useState<Record<string, number>>({});

  // Size selection logic
  const uniqueSizes = Array.from(new Set(variants.map(v => v.size || 'Standard')));
  const hasSizes = uniqueSizes.length > 1 || (uniqueSizes.length === 1 && uniqueSizes[0] !== 'Standard');
  const [selectedSize, setSelectedSize] = useState<string>(uniqueSizes[0] || 'Standard');

  const visibleVariants = variants.filter(v => (v.size || 'Standard') === selectedSize);

  const setQty = (variantId: string, delta: number, max: number) => {
    setQtys(prev => {
      const current = prev[variantId] || 0;
      const next = Math.max(0, Math.min(max, current + delta));
      return { ...prev, [variantId]: next };
    });
  };

  const totalQty = Object.values(qtys).reduce((s, q) => s + q, 0);
  const totalPrice = variants.reduce((s, v) => s + (v.price ?? basePrice) * (qtys[v.id] || 0), 0);

  const handleAdd = () => {
    const items: CartItem[] = variants
      .filter(v => (qtys[v.id] || 0) > 0 && v.stock > 0)
      .map(v => ({
        productId,
        productName,
        productImage,
        price: v.price ?? basePrice,
        quantity: qtys[v.id],
        variant: { color: v.color, size: v.size, variantId: v.id },
        maxStock: v.stock,
      }));
    if (items.length === 0) return;
    onAdd(items);
    setQtys({});
  };

  return (
    <div className="mb-5">
      {/* Size Selector */}
      {hasSizes && (
        <div className="mb-6">
          <p className="text-sm font-bold text-[#1A1A1A] mb-3">Choisissez une taille</p>
          <div className="flex flex-wrap gap-2.5">
            {uniqueSizes.map(size => (
              <button
                key={size}
                onClick={() => setSelectedSize(size)}
                className={`px-5 py-2.5 rounded-xl font-bold text-sm transition-all duration-200 border-2 ${
                  selectedSize === size
                    ? 'border-[#C8102E] bg-[#C8102E]/5 text-[#C8102E] shadow-sm'
                    : 'border-gray-200 bg-white text-gray-700 hover:border-gray-300'
                }`}
              >
                {size}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Color swatches or Simple Qty */}
      {(() => {
        const isSimpleSize = visibleVariants.length === 1 && (!visibleVariants[0].color || visibleVariants[0].color.startsWith('Option')) && !visibleVariants[0].image;
        
        if (isSimpleSize) {
          const v = visibleVariants[0];
          const qty = qtys[v.id] || 0;
          return (
            <div className="flex items-center justify-between bg-gray-50/50 border border-gray-100 p-4 rounded-2xl">
              <div>
                <p className="font-black text-lg text-[#1A1A1A]">
                  {v.price && v.price !== basePrice ? formatPrice(v.price) : formatPrice(basePrice)}
                </p>
                {v.stock <= 10 && v.stock > 0 && (
                  <p className="text-[11px] text-[#D4A843] font-bold mt-0.5">🔥 Plus que {v.stock} en stock !</p>
                )}
                {v.stock === 0 && (
                  <p className="text-[11px] text-red-500 font-bold mt-0.5">Rupture de stock</p>
                )}
              </div>
              {v.stock > 0 ? (
                <div className="flex items-center gap-2 bg-white border border-gray-200 rounded-full px-1.5 py-1.5 shadow-sm">
                  <button onClick={() => setQty(v.id, -1, v.stock)}
                    className="w-8 h-8 rounded-full flex items-center justify-center text-gray-500 hover:text-[#C8102E] hover:bg-red-50 transition-all">
                    <Minus className="w-4 h-4" />
                  </button>
                  <span className="w-6 text-center font-black text-lg text-[#C8102E]">{qty}</span>
                  <button onClick={() => setQty(v.id, 1, v.stock)}
                    disabled={qty >= v.stock}
                    className="w-8 h-8 rounded-full flex items-center justify-center text-gray-500 hover:text-[#C8102E] hover:bg-red-50 transition-all disabled:opacity-30">
                    <Plus className="w-4 h-4" />
                  </button>
                </div>
              ) : (
                <span className="px-4 py-2 bg-gray-100 text-gray-400 font-bold rounded-xl text-sm">Épuisé</span>
              )}
            </div>
          );
        }

        return (
          <>
            <p className="text-sm font-bold text-[#1A1A1A] mb-4">
              {hasSizes ? `Couleurs/Modèles pour ${selectedSize}` : 'Options disponibles'}
            </p>
            <div className="flex flex-wrap gap-5">
              {visibleVariants.map(v => {
                const outOfStock = v.stock === 0;
                const qty = qtys[v.id] || 0;
                const isSelected = qty > 0;

                return (
                  <div key={v.id} className="flex flex-col items-center gap-2">
                    {/* Variant Button */}
                    <div className="relative">
                      <button
                        onClick={() => !outOfStock && setQty(v.id, isSelected ? -qty : 1, v.stock)}
                        disabled={outOfStock}
                        title={outOfStock ? 'Épuisé' : (v.size ? `${v.size} - ${v.color}` : v.color)}
                        className={`transition-all duration-200 shadow-sm flex items-center justify-center overflow-hidden relative
                          ${v.image 
                            ? 'w-20 h-20 rounded-xl border-2' 
                            : 'w-14 h-14 rounded-full border-4'}
                          ${outOfStock
                            ? 'opacity-50 cursor-not-allowed border-gray-200 bg-gray-50'
                            : isSelected
                              ? 'border-[#C8102E] scale-105 shadow-lg shadow-[#C8102E]/20 bg-white z-10'
                              : 'border-gray-200 hover:border-gray-300 hover:scale-105 bg-white'}
                        `}
                      >
                        {/* Variant Content: Image or Color */}
                        {v.image ? (
                          <img src={v.image} alt={v.color || 'Design'} className="w-full h-full object-cover" />
                        ) : (
                          <div className="w-full h-full" style={{ background: v.colorHex || '#ccc' }} />
                        )}

                        {/* Out of stock line */}
                        {outOfStock && (
                          <div className="absolute inset-0 flex items-center justify-center pointer-events-none overflow-hidden rounded-inherit">
                            <div className="w-[150%] h-[2px] bg-red-400/50 -rotate-12" />
                          </div>
                        )}
                      </button>
                      {/* Selection Checkmark */}
                      {isSelected && (
                        <div className="absolute -top-1.5 -right-1.5 w-5 h-5 rounded-full bg-[#C8102E] border-2 border-white flex items-center justify-center shadow-sm z-20">
                          <span className="text-white text-[9px] font-black leading-none">✓</span>
                        </div>
                      )}
                    </div>

                    {/* Name Label */}
                    <p className="text-[11px] font-semibold text-center text-[#1A1A1A] leading-tight max-w-[80px]">
                      {v.color && !v.color.startsWith('Option') ? v.color : '—'}
                    </p>

                    {/* Price Diff */}
                    {v.price && v.price !== basePrice && (
                      <p className="text-[11px] font-black text-[#C8102E] -mt-1 bg-red-50 px-2 py-0.5 rounded-md">
                        {formatPrice(v.price)}
                      </p>
                    )}

                    {/* Qty stepper (only when selected) */}
                    <div className={`flex items-center gap-1 transition-all duration-300 ${isSelected ? 'opacity-100 h-6' : 'opacity-0 h-0 overflow-hidden'}`}>
                      {isSelected && (
                        <>
                          <button onClick={() => setQty(v.id, -1, v.stock)}
                            className="w-6 h-6 rounded-full border border-[#E8E4DF] bg-white flex items-center justify-center text-gray-500 hover:border-[#C8102E] hover:text-[#C8102E] transition-all">
                            <Minus className="w-3 h-3" />
                          </button>
                          <span className="w-6 text-center text-[13px] font-black text-[#C8102E]">{qty}</span>
                          <button onClick={() => setQty(v.id, 1, v.stock)}
                            disabled={qty >= v.stock}
                            className="w-6 h-6 rounded-full border border-[#E8E4DF] bg-white flex items-center justify-center text-gray-500 hover:border-[#C8102E] hover:text-[#C8102E] disabled:opacity-30 disabled:hover:border-[#E8E4DF] transition-all">
                            <Plus className="w-3 h-3" />
                          </button>
                        </>
                      )}
                    </div>

                    <p className={`text-[9px] uppercase tracking-wider ${outOfStock ? 'text-red-500 font-bold' : 'text-gray-400 font-medium'}`}>
                      {outOfStock ? 'Rupture' : `${v.stock} dispo`}
                    </p>
                  </div>
                );
              })}
            </div>
          </>
        );
      })()}

      {/* Summary */}
      {totalQty > 0 && (
        <div className="mt-5 flex items-center justify-between px-4 py-3 bg-red-50 border border-[#C8102E]/20 rounded-xl">
          <p className="text-sm text-gray-600">
            <span className="font-bold text-[#1A1A1A]">{totalQty}</span> article{totalQty > 1 ? 's' : ''} sélectionné{totalQty > 1 ? 's' : ''}
          </p>
          <p className="text-sm font-black text-[#C8102E]">{formatPrice(totalPrice)}</p>
        </div>
      )}

      {/* Add button */}
      <button onClick={handleAdd} disabled={totalQty === 0}
        className={`w-full mt-4 py-4 rounded-xl font-bold text-base flex items-center justify-center gap-2 transition-all shop-btn-press ${
          totalQty === 0
            ? 'bg-gray-100 text-gray-400 cursor-not-allowed'
            : 'bg-[#C8102E] hover:bg-[#a00d25] text-white shadow-lg shadow-[#C8102E]/20'
        }`}>
        <ShoppingCart className="w-5 h-5" />
        {totalQty === 0
          ? 'Cliquez sur une couleur pour sélectionner'
          : `Ajouter au panier — ${totalQty} article${totalQty > 1 ? 's' : ''}`}
      </button>
    </div>
  );
}


// ─── Product Page ─────────────────────────────────────────────────────────────
export default function ProductPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = React.use(params);
  const { addItem, addItems, openCart } = useShopCart();
  // Use context which already includes Firestore custom products
  const { products, getProductById: ctxGetById, isLoading } = useShopProducts();

  // Direct Firestore fallback in case context fails
  const [directProduct, setDirectProduct] = React.useState<any>(null);
  const [directLoading, setDirectLoading] = React.useState(false);
  const [directDone, setDirectDone] = React.useState(false);

  const product = ctxGetById(id) || directProduct;

  React.useEffect(() => {
    // If context finished loading and didn't find the product, try direct Firestore fetch
    if (!isLoading && !ctxGetById(id) && !directDone) {
      setDirectLoading(true);
      setDirectDone(true);
      (async () => {
        try {
          const snap = await getDoc(doc(db, 'shop_custom_products', id));
          if (snap.exists()) {
            const data = snap.data();
            const overSnap = await getDoc(doc(db, 'shop_product_overrides', id));
            setDirectProduct({ id, ...data, ...(overSnap.exists() ? overSnap.data() : {}) });
          }
        } catch (err) {
          console.error('[ProductPage] Direct Firestore fetch error:', err);
        } finally {
          setDirectLoading(false);
        }
      })();
    }
  }, [isLoading, id, directDone]);

  const [selectedVariant, setSelectedVariant] = React.useState<ProductVariant | null>(null);
  const [qty, setQty] = React.useState(1);
  const [mainImg, setMainImg] = React.useState(0);
  const [wished, setWished] = React.useState(false);
  const [added, setAdded] = React.useState(false);
  const [activeTab, setActiveTab] = React.useState<'description' | 'specs' | 'avis'>('description');

  React.useEffect(() => {
    if (product?.variants?.[0]) setSelectedVariant(product.variants[0]);
    if (product?.minOrderQty) setQty(product.minOrderQty);
  }, [product?.id]);

  // Still loading
  if (isLoading || directLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#FBF8F3]">
        <div className="text-center">
          <div className="w-10 h-10 border-4 border-[#C8102E] border-t-transparent rounded-full animate-spin mx-auto mb-4" />
          <p className="text-[#6B6B6B] text-sm">Chargement du produit…</p>
        </div>
      </div>
    );
  }

  if (!product) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#FBF8F3]" style={{ fontFamily: 'Inter, sans-serif' }}>
        <div className="text-center">
          <p className="text-6xl mb-4">😕</p>
          <h1 className="text-2xl font-black text-[#1A1A1A] mb-2" style={{ fontFamily: 'Outfit, sans-serif' }}>Produit introuvable</h1>
          <p className="text-[#6B6B6B] mb-6">Ce produit n'existe pas ou a été supprimé.</p>
          <p className="text-xs text-gray-400 mb-4 font-mono">ID: {id}</p>
          <Link href="/shop/categories" className="px-6 py-3 bg-[#C8102E] text-white rounded-xl font-semibold hover:bg-[#a00d25] transition-colors">
            Retour à la boutique
          </Link>
        </div>
      </div>
    );
  }

  const hasVariants = product.variants && product.variants.length > 0;
  // Fetch products for cross-selling
  let similar = products
    .filter(p => p.categorySlug === product.categorySlug && p.id !== product.id)
    .sort(() => 0.5 - Math.random()) // Randomize
    .slice(0, 4);
    
  let similarTitle = "Vous aimerez aussi";
  let similarLink = `/shop/categorie/${product.categorySlug}`;

  // Fallback to other categories if no products in the same category
  if (similar.length === 0) {
    similar = products
      .filter(p => p.categorySlug !== product.categorySlug && p.id !== product.id)
      .sort(() => 0.5 - Math.random())
      .slice(0, 4);
    similarTitle = "Découvrez d'autres catégories";
    similarLink = "/shop";
  }
  const discount = product.comparePrice ? getDiscountPercent(product.price, product.comparePrice) : 0;
  const currentPrice = selectedVariant?.price || product.price;
  const stock = selectedVariant?.stock ?? product.stockQty;
  const inStock = hasVariants ? product.variants.some(v => v.stock > 0) : stock > 0;

  // Single variant / no variant add to cart
  const handleAddToCart = () => {
    addItem({
      productId: product.id,
      productName: product.name,
      productImage: product.images[mainImg] || product.images[0],
      price: currentPrice,
      quantity: qty,
      variant: selectedVariant ? { color: selectedVariant.color, size: selectedVariant.size, variantId: selectedVariant.id } : undefined,
      maxStock: stock,
    });
    setAdded(true);
    setTimeout(() => { setAdded(false); openCart(); }, 1500);
  };

  // Multi-variant add to cart
  const handleAddVariantsToCart = (items: CartItem[]) => {
    addItems(items);
    setAdded(true);
    setTimeout(() => { setAdded(false); openCart(); }, 1500);
  };

  const REVIEWS = [
    { name: 'Fatima Z.', city: 'Casablanca', rating: 5, date: '12 Mai 2025', text: 'Très bonne qualité, correspond parfaitement à la description. Livraison rapide. Je rachèterai !' },
    { name: 'Ahmed B.', city: 'Marrakech', rating: 4, date: '3 Avril 2025', text: 'Produit conforme, bon rapport qualité/prix. Emballage soigné. Merci LEBTEX !' },
    { name: 'Samira R.', city: 'Rabat', rating: 5, date: '28 Mars 2025', text: 'Exactement ce que je cherchais. Le paiement à la livraison est très pratique. Recommande !' },
  ];

  return (
    <div style={{ fontFamily: 'Inter, sans-serif', background: '#FBF8F3' }} className="min-h-screen">
      {/* Added to cart notification */}
      {added && (
        <div className="fixed top-20 left-1/2 -translate-x-1/2 z-50 bg-[#10B981] text-white px-6 py-3 rounded-full font-semibold shadow-lg shop-slide-in-up flex items-center gap-2">
          <span>✓</span> Ajouté au panier !
        </div>
      )}

      <div className="max-w-7xl mx-auto px-4 py-6 md:py-10">
        {/* Breadcrumb */}
        <nav className="flex items-center gap-1.5 text-xs text-[#6B6B6B] mb-6">
          <Link href="/shop" className="hover:text-[#C8102E] transition-colors">Accueil</Link>
          <ChevronRight className="w-3 h-3" />
          <Link href="/shop/categories" className="hover:text-[#C8102E] transition-colors">Boutique</Link>
          <ChevronRight className="w-3 h-3" />
          <Link href={`/shop/categorie/${product.categorySlug}`} className="hover:text-[#C8102E] transition-colors">{product.categoryName}</Link>
          <ChevronRight className="w-3 h-3" />
          <span className="text-[#1A1A1A] font-medium truncate max-w-[200px]">{product.name}</span>
        </nav>

        {/* Main grid */}
        <div className="grid md:grid-cols-2 gap-8 lg:gap-12">
          {/* Gallery */}
          <div>
            <div className="relative aspect-square rounded-2xl overflow-hidden bg-white border border-[#E8E4DF] shop-img-zoom mb-3">
              <img src={product.images[mainImg] || product.images[0]} alt={product.name} className="w-full h-full object-cover" />
              <div className="absolute top-4 left-4 flex flex-col gap-2">
                {product.isNew && <span className="bg-[#10B981] text-white text-xs font-black px-3 py-1 rounded-full">NOUVEAU</span>}
                {product.isPromo && discount > 0 && <span className="bg-[#C8102E] text-white text-xs font-black px-3 py-1 rounded-full">-{discount}%</span>}
              </div>
            </div>
            <div className="flex gap-2">
              {product.images.map((img, i) => (
                <button key={i} onClick={() => setMainImg(i)}
                  className={`w-16 h-16 rounded-xl overflow-hidden border-2 transition-all ${mainImg === i ? 'border-[#C8102E]' : 'border-[#E8E4DF] hover:border-[#D4A843]'}`}>
                  <img src={img} alt="" className="w-full h-full object-cover" />
                </button>
              ))}
            </div>
          </div>

          {/* Product info */}
          <div>
            {/* Badges */}
            <div className="flex gap-2 mb-3">
              {product.isNew && <span className="bg-[#10B981]/10 text-[#10B981] text-xs font-bold px-2.5 py-1 rounded-full">✨ Nouveau</span>}
              {product.isPromo && <span className="bg-[#C8102E]/10 text-[#C8102E] text-xs font-bold px-2.5 py-1 rounded-full">🏷️ Promotion</span>}
              {hasVariants && <span className="bg-[#D4A843]/10 text-[#D4A843] text-xs font-bold px-2.5 py-1 rounded-full">🎨 {product.variants.length} variantes</span>}
            </div>

            <h1 className="text-2xl md:text-3xl font-black text-[#1A1A1A] mb-3 leading-tight" style={{ fontFamily: 'Outfit, sans-serif' }}>{product.name}</h1>

            {/* Rating */}
            {product.rating && (
              <div className="flex items-center gap-2 mb-4">
                <div className="flex text-[#D4A843]">
                  {Array.from({ length: 5 }, (_, i) => (
                    <Star key={i} className="w-4 h-4" fill={i < Math.floor(product.rating!) ? '#D4A843' : 'none'} />
                  ))}
                </div>
                <span className="text-sm text-[#6B6B6B]">{product.rating}/5 ({product.reviewCount} avis)</span>
              </div>
            )}

            {/* Price */}
            <div className="flex items-center gap-3 mb-4">
              {hasVariants ? (
                <span className="text-2xl font-black text-[#1A1A1A]">
                  À partir de {formatPrice(Math.min(...product.variants.map(v => v.price ?? product.price)))}
                </span>
              ) : (
                <>
                  <span className="text-3xl font-black text-[#1A1A1A]">{formatPrice(currentPrice)}</span>
                  {product.comparePrice && (
                    <>
                      <span className="text-lg text-[#6B6B6B] line-through">{formatPrice(product.comparePrice)}</span>
                      <span className="bg-[#C8102E] text-white text-sm font-black px-2.5 py-0.5 rounded-full">-{discount}%</span>
                    </>
                  )}
                </>
              )}
            </div>

            {/* Stock */}
            <div className={`inline-flex items-center gap-2 px-3 py-1.5 rounded-full text-sm font-semibold mb-5 ${inStock ? 'bg-green-50 text-[#10B981]' : 'bg-red-50 text-red-600'}`}>
              <span className={`w-2 h-2 rounded-full ${inStock ? 'bg-[#10B981]' : 'bg-red-500'}`} />
              {inStock
                ? hasVariants
                  ? `${product.variants.reduce((s, v) => s + v.stock, 0)} unités disponibles`
                  : `En stock (${stock} disponibles)`
                : 'Rupture de stock'}
            </div>

            <hr className="border-[#E8E4DF] mb-5" />

            {/* ── VARIANTS or single qty ── */}
            {hasVariants ? (
              <MultiVariantSelector
                variants={product.variants}
                basePrice={product.price}
                productId={product.id}
                productName={product.name}
                productImage={product.images[mainImg] || product.images[0]}
                onAdd={handleAddVariantsToCart}
              />
            ) : (
              <>
                {/* Quantity */}
                {inStock && (
                  <div className="mb-4">
                    <p className="text-sm font-semibold text-[#1A1A1A] mb-2">Quantité</p>
                    <div className="flex items-center gap-3">
                      <button onClick={() => setQty(q => Math.max(product.minOrderQty || 1, q - 1))}
                        className="w-10 h-10 rounded-xl border border-[#E8E4DF] bg-white flex items-center justify-center hover:border-[#C8102E] transition-colors">
                        <Minus className="w-4 h-4" />
                      </button>
                      <span className="w-16 text-center font-black text-xl">{qty}</span>
                      <button onClick={() => setQty(q => Math.min(stock, q + 1))}
                        className="w-10 h-10 rounded-xl border border-[#E8E4DF] bg-white flex items-center justify-center hover:border-[#C8102E] transition-colors">
                        <Plus className="w-4 h-4" />
                      </button>
                      <span className="text-xs text-[#6B6B6B]">Total: <strong>{formatPrice(currentPrice * qty)}</strong></span>
                    </div>
                    {product.minOrderQty && product.minOrderQty > 1 && (
                      <p className="text-xs text-[#D4A843] mt-1.5 flex items-center gap-1">
                        <Package className="w-3.5 h-3.5" /> Commande minimum: {product.minOrderQty} pcs
                      </p>
                    )}
                  </div>
                )}

                {/* Wholesale */}
                {product.wholesalePrice && (
                  <div className="mb-4 p-3 bg-[#D4A843]/10 border border-[#D4A843]/30 rounded-xl">
                    <p className="text-sm text-[#1A1A1A]">
                      💼 <strong>Semi-gros disponible :</strong> {formatPrice(product.wholesalePrice)}/unité (min. {product.minOrderQty || 10} pcs)
                    </p>
                  </div>
                )}

                {/* CTA Buttons */}
                <div className="flex flex-col gap-3 mb-5">
                  <button onClick={handleAddToCart} disabled={!inStock}
                    className={`w-full py-4 rounded-xl font-bold text-base flex items-center justify-center gap-2 transition-all shop-btn-press ${
                      !inStock ? 'bg-gray-200 text-gray-400 cursor-not-allowed'
                      : added ? 'bg-[#10B981] text-white'
                      : 'bg-[#C8102E] hover:bg-[#a00d25] text-white shadow-lg shadow-[#C8102E]/20'
                    }`}>
                    <ShoppingCart className="w-5 h-5" />
                    {added ? '✓ Ajouté au panier !' : inStock ? 'Ajouter au panier' : 'Rupture de stock'}
                  </button>
                </div>
              </>
            )}

            {/* WhatsApp + Wishlist */}
            <div className="flex gap-3 mb-5">
              <a href={buildWhatsAppLink(product.id, hasVariants ? product.price : currentPrice * qty, product.name)} target="_blank" rel="noopener noreferrer"
                className="flex-1 py-3 rounded-xl font-bold text-sm flex items-center justify-center gap-2 bg-[#25D366] hover:bg-[#1da851] text-white transition-colors">
                <MessageCircle className="w-4 h-4" /> Commander sur WhatsApp
              </a>
              <button onClick={() => setWished(!wished)}
                className={`w-12 h-12 rounded-xl border-2 flex items-center justify-center transition-all ${wished ? 'border-red-400 bg-red-50 text-red-500' : 'border-[#E8E4DF] text-[#6B6B6B] hover:border-red-400'}`}>
                <Heart className="w-5 h-5" fill={wished ? 'currentColor' : 'none'} />
              </button>
            </div>

            {/* Delivery info */}
            <div className="grid grid-cols-3 gap-2 p-4 bg-white border border-[#E8E4DF] rounded-xl">
              {[
                { icon: Truck, text: 'Livraison rapide', sub: 'Casablanca 24-48h' },
                { icon: Shield, text: 'Paiement livraison', sub: 'Cash à la réception' },
                { icon: RotateCcw, text: 'Retour 14 jours', sub: 'Satisfait ou remboursé' },
              ].map(({ icon: Icon, text, sub }) => (
                <div key={text} className="text-center">
                  <Icon className="w-5 h-5 text-[#C8102E] mx-auto mb-1" />
                  <p className="text-[10px] font-bold text-[#1A1A1A] leading-tight">{text}</p>
                  <p className="text-[9px] text-[#6B6B6B] mt-0.5">{sub}</p>
                </div>
              ))}
            </div>
          </div>
        </div>

          {/* ═══ FICHE PRODUIT — Description & Détails Hyper Pro ══════ */}
          <div className="mt-10 mb-12">

            {/* Description Courte (Mise en évidence) */}
            {product.shortDescription && (
              <div className="mb-8 p-6 bg-gradient-to-br from-[#FBF8F3] to-white border border-[#E8E4DF] rounded-2xl shadow-sm relative overflow-hidden">
                <div className="absolute top-0 left-0 w-1.5 h-full bg-[#C8102E]"></div>
                <h3 className="text-xl md:text-2xl font-bold text-[#1A1A1A] leading-snug" style={{ fontFamily: 'Outfit, sans-serif' }}>
                  {product.shortDescription}
                </h3>
              </div>
            )}

            <div className="space-y-4">
              {/* Accordion 1: Description détaillée & Avantages */}
              {(product.description || product.avantages) && (
                <Accordion 
                  title="Description & Avantages" 
                  icon={<svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h7" /></svg>}
                  defaultOpen={true}
                >
                  <div className="px-6 py-6 space-y-6">
                    {product.description && (
                      <div className="text-[#4A4A4A] leading-relaxed text-[15px] space-y-4">
                        {product.description.split('\n').filter(Boolean).map((para, i) => (
                          <p key={i}>{para}</p>
                        ))}
                      </div>
                    )}
                    {product.avantages && (
                      <div className="bg-[#FBF8F3] rounded-xl p-5 border border-[#F3EFE8]">
                        <h3 className="text-[#D4A843] font-bold text-sm uppercase tracking-wider mb-3 flex items-center gap-2">
                          <span>✨</span> Avantages Principaux
                        </h3>
                        <div className="text-[#4A4A4A] text-[15px] space-y-2">
                          {product.avantages.split('\n').filter(Boolean).map((para, i) => (
                            <p key={i} className="flex gap-2">
                              <span className="text-[#25D366] mt-1 flex-shrink-0">✓</span> {para}
                            </p>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                </Accordion>
              )}

              {/* Accordion 2: Caractéristiques Techniques */}
              <Accordion 
                title="Caractéristiques Techniques" 
                icon={<svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" /></svg>}
                defaultOpen={false}
              >
                <div className="grid grid-cols-1 md:grid-cols-2 divide-y md:divide-y-0 md:divide-x divide-[#F3EFE8]">
                  <div className="divide-y divide-[#F3EFE8]">
                    {[
                      { label: 'Type de Produit', icon: '🏷️', value: product.typeProduit },
                      { label: 'Matériau / Mailles', icon: '🧵', value: product.matiereMailles || product.material },
                      { label: 'Composition Ruban', icon: '🎗️', value: product.compositionRuban },
                      { label: 'Largeur', icon: '↔️', value: product.largeurMaille || product.width },
                      { label: 'Longueur', icon: '📏', value: product.longueur },
                      { label: 'Couleur', icon: '🎨', value: product.couleur },
                    ].filter(row => row.value).map((row, i) => (
                      <div key={row.label} className={`flex flex-col sm:flex-row sm:items-center justify-between px-6 py-3.5 transition-colors hover:bg-[#FBF8F3] group ${i % 2 === 0 ? 'bg-white' : 'bg-[#FDFBF8]'}`}>
                        <div className="flex items-center gap-3 sm:w-1/2">
                          <span className="text-base">{row.icon}</span>
                          <span className="text-sm font-semibold text-[#6B6B6B] group-hover:text-[#1A1A1A]">{row.label}</span>
                        </div>
                        <span className="text-sm font-bold text-[#1A1A1A] mt-1 sm:mt-0 text-left sm:text-right w-full sm:w-1/2">{row.value}</span>
                      </div>
                    ))}
                  </div>
                  
                  <div className="divide-y divide-[#F3EFE8]">
                    {[
                      { label: 'Spécification / Type', icon: '📐', value: product.type || product.specification },
                      { label: 'Design', icon: '✨', value: product.design },
                      { label: 'Sécurité', icon: '🔒', value: product.securite },
                      { label: 'Résistance', icon: '💪', value: product.resistance },
                      { label: 'Pays de fabrication', icon: '🌍', value: product.paysFabrication },
                      { label: 'Poids', icon: '⚖️', value: product.weight ? `${product.weight} g` : undefined },
                    ].filter(row => row.value).map((row, i) => (
                      <div key={row.label} className={`flex flex-col sm:flex-row sm:items-center justify-between px-6 py-3.5 transition-colors hover:bg-[#FBF8F3] group ${i % 2 === 0 ? 'bg-[#FDFBF8]' : 'bg-white'}`}>
                        <div className="flex items-center gap-3 sm:w-1/2">
                          <span className="text-base">{row.icon}</span>
                          <span className="text-sm font-semibold text-[#6B6B6B] group-hover:text-[#1A1A1A]">{row.label}</span>
                        </div>
                        <span className="text-sm font-bold text-[#1A1A1A] mt-1 sm:mt-0 text-left sm:text-right w-full sm:w-1/2">{row.value}</span>
                      </div>
                    ))}
                  </div>
                </div>
              </Accordion>

              {/* Accordion 3: Informations Pratiques */}
              {(product.applications || product.conseilsEntretien || product.informationCommerciale || product.compatibleAvec) && (
                <Accordion 
                  title="Informations Pratiques & Applications" 
                  icon={<svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>}
                  defaultOpen={false}
                >
                  <div className="p-6 grid grid-cols-1 lg:grid-cols-3 gap-6 bg-[#FDFBF8]">
                    {product.applications && (
                      <div className="bg-white border border-[#E8E4DF] rounded-xl p-5 shadow-sm">
                        <div className="w-8 h-8 rounded-full bg-[#1A1A1A] flex items-center justify-center mb-3">
                          <span className="text-white text-sm">🎯</span>
                        </div>
                        <h3 className="font-bold text-[#1A1A1A] mb-2 font-outfit text-sm">Applications & Usages</h3>
                        <p className="text-[#4A4A4A] text-xs leading-relaxed whitespace-pre-wrap">{product.applications}</p>
                        {product.compatibleAvec && (
                          <div className="mt-3 pt-3 border-t border-[#F3EFE8]">
                            <p className="text-[10px] font-bold text-[#6B6B6B] uppercase mb-1">Compatible avec :</p>
                            <p className="text-[#1A1A1A] text-xs font-medium">{product.compatibleAvec}</p>
                          </div>
                        )}
                      </div>
                    )}

                    {product.conseilsEntretien && (
                      <div className="bg-white border border-[#E8E4DF] rounded-xl p-5 shadow-sm">
                        <div className="w-8 h-8 rounded-full bg-[#10B981] flex items-center justify-center mb-3">
                          <span className="text-white text-sm">💧</span>
                        </div>
                        <h3 className="font-bold text-[#1A1A1A] mb-2 font-outfit text-sm">Conseils d'Entretien</h3>
                        <p className="text-[#4A4A4A] text-xs leading-relaxed whitespace-pre-wrap">{product.conseilsEntretien}</p>
                      </div>
                    )}

                    {(product.informationCommerciale || product.packaging || product.minOrderQty) && (
                      <div className="bg-white border border-[#E8E4DF] rounded-xl p-5 shadow-sm">
                        <div className="w-8 h-8 rounded-full bg-[#25D366] flex items-center justify-center mb-3">
                          <span className="text-white text-sm">📦</span>
                        </div>
                        <h3 className="font-bold text-[#1A1A1A] mb-2 font-outfit text-sm">Infos Commerciales</h3>
                        {product.informationCommerciale && (
                          <p className="text-[#4A4A4A] text-xs leading-relaxed whitespace-pre-wrap mb-3">{product.informationCommerciale}</p>
                        )}
                        <ul className="space-y-1.5 text-xs">
                          {product.packaging && (
                            <li className="flex justify-between border-b border-[#F3EFE8] pb-1"><span className="text-[#6B6B6B]">Conditionnement</span> <span className="font-bold text-[#1A1A1A]">{product.packaging}</span></li>
                          )}
                          {product.minOrderQty && (
                            <li className="flex justify-between border-b border-[#F3EFE8] pb-1"><span className="text-[#6B6B6B]">Quantité min. (MOQ)</span> <span className="font-bold text-[#1A1A1A]">{product.minOrderQty} unités</span></li>
                          )}
                        </ul>
                      </div>
                    )}
                  </div>
                </Accordion>
              )}
            </div>

            {/* Mots-clés SEO */}
            {(product.motsCles || (product.tags && product.tags.length > 0)) && (
              <div className="flex flex-wrap items-center gap-2 pt-4 px-2">
                <span className="text-xs font-bold text-gray-400 uppercase mr-2">Tags:</span>
                {[...(product.tags || []), ...(product.motsCles ? product.motsCles.split(',').map(k => k.trim()) : [])]
                  .filter((v, i, a) => a.indexOf(v) === i && v) // unique
                  .map(tag => (
                    <Link href={`/shop/boutique?q=${encodeURIComponent(tag)}`} key={tag} className="px-3 py-1 rounded-full bg-[#F3EFE8] text-[#4A4A4A] text-[10px] font-bold uppercase tracking-wider hover:bg-[#E8E4DF] hover:text-[#C8102E] transition-colors cursor-pointer">
                      #{tag}
                    </Link>
                ))}
              </div>
            )}





        </div>

        {/* Similar products */}
        {similar.length > 0 && (
          <div className="mt-12">
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-2xl font-black text-[#1A1A1A]" style={{ fontFamily: 'Outfit, sans-serif' }}>{similarTitle}</h2>
              <Link href={similarLink}
                className="text-sm text-[#C8102E] font-semibold hover:underline">Voir tout →</Link>
            </div>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              {similar.map(p => <SimilarProductCard key={p.id} product={p} />)}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
