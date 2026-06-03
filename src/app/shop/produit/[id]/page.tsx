"use client";
import React, { useState } from 'react';
import Link from 'next/link';
import { ShoppingCart, Heart, MessageCircle, Truck, RotateCcw, Shield, Star, ChevronRight, Minus, Plus, Package } from 'lucide-react';
import { getProductById, getSimilarProducts } from '@/lib/shop-products-data';
import { formatPrice, getDiscountPercent, buildWhatsAppLink } from '@/lib/shop-utils';
import { useShopCart } from '@/contexts/shop-cart-context';
import type { CartItem, ProductVariant } from '@/lib/shop-types';

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
      <p className="text-sm font-bold text-[#1A1A1A] mb-4">Choisissez vos couleurs</p>

      {/* Color swatches */}
      <div className="flex flex-wrap gap-5">
        {variants.map(v => {
          const outOfStock = v.stock === 0;
          const qty = qtys[v.id] || 0;
          const isSelected = qty > 0;

          return (
            <div key={v.id} className="flex flex-col items-center gap-1.5">
              {/* Circle */}
              <div className="relative">
                <button
                  onClick={() => !outOfStock && setQty(v.id, isSelected ? -qty : 1, v.stock)}
                  disabled={outOfStock}
                  title={outOfStock ? 'Épuisé' : v.color}
                  className={`w-14 h-14 rounded-full border-4 transition-all duration-200 shadow-sm ${
                    outOfStock
                      ? 'opacity-40 cursor-not-allowed border-gray-200'
                      : isSelected
                        ? 'border-[#C8102E] scale-110 shadow-lg shadow-[#C8102E]/20'
                        : 'border-white hover:border-gray-300 hover:scale-105'
                  }`}
                  style={{ background: v.colorHex || '#ccc' }}
                />
                {outOfStock && (
                  <div className="absolute inset-0 rounded-full flex items-center justify-center pointer-events-none">
                    <div className="w-full h-0.5 bg-gray-400/70 rotate-45" />
                  </div>
                )}
                {isSelected && (
                  <div className="absolute -top-1 -right-1 w-5 h-5 rounded-full bg-[#C8102E] flex items-center justify-center shadow">
                    <span className="text-white text-[10px] font-black">✓</span>
                  </div>
                )}
              </div>

              {/* Name */}
              <p className="text-xs font-semibold text-center text-[#1A1A1A] leading-tight max-w-[64px]">{v.color || '—'}</p>

              {/* Price if variant-specific */}
              {v.price && v.price !== basePrice && (
                <p className="text-[10px] font-bold text-[#C8102E]">{formatPrice(v.price)}</p>
              )}

              {/* Qty stepper (only when selected) */}
              {isSelected && (
                <div className="flex items-center gap-1">
                  <button onClick={() => setQty(v.id, -1, v.stock)}
                    className="w-6 h-6 rounded-full border border-[#E8E4DF] bg-white flex items-center justify-center text-gray-500 hover:border-[#C8102E] transition-all">
                    <Minus className="w-3 h-3" />
                  </button>
                  <span className="w-6 text-center text-sm font-black text-[#C8102E]">{qty}</span>
                  <button onClick={() => setQty(v.id, 1, v.stock)}
                    disabled={qty >= v.stock}
                    className="w-6 h-6 rounded-full border border-[#E8E4DF] bg-white flex items-center justify-center text-gray-500 hover:border-[#C8102E] disabled:opacity-30 transition-all">
                    <Plus className="w-3 h-3" />
                  </button>
                </div>
              )}

              <p className={`text-[9px] ${outOfStock ? 'text-red-400 font-bold' : 'text-gray-400'}`}>
                {outOfStock ? 'Épuisé' : `${v.stock} en stock`}
              </p>
            </div>
          );
        })}
      </div>

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

  // First try static data, then fall back to Firestore for custom products
  const [product, setProduct] = React.useState<any>(getProductById(id) || null);
  const [loadingFirestore, setLoadingFirestore] = React.useState(!getProductById(id));

  React.useEffect(() => {
    if (getProductById(id)) return; // already found in static data
    // Fetch from Firestore
    import('@/firebase/config').then(async ({ db }) => {
      const { doc, getDoc, collection, getDocs } = await import('firebase/firestore');
      try {
        // Check shop_custom_products
        const customSnap = await getDoc(doc(db, 'shop_custom_products', id));
        if (customSnap.exists()) {
          const data = customSnap.data() as any;
          // Apply any override if it exists
          const overrideSnap = await getDoc(doc(db, 'shop_product_overrides', id));
          const override = overrideSnap.exists() ? overrideSnap.data() : {};
          setProduct({ ...data, ...override, id });
          setLoadingFirestore(false);
          return;
        }
        // Not found anywhere
        setProduct(null);
        setLoadingFirestore(false);
      } catch {
        setProduct(null);
        setLoadingFirestore(false);
      }
    });
  }, [id]);

  const [selectedVariant, setSelectedVariant] = React.useState<ProductVariant | null>(null);
  const [qty, setQty] = React.useState(1);
  const [mainImg, setMainImg] = React.useState(0);
  const [wished, setWished] = React.useState(false);
  const [added, setAdded] = React.useState(false);
  const [activeTab, setActiveTab] = React.useState<'description' | 'specs' | 'avis'>('description');

  React.useEffect(() => {
    if (product?.variants?.[0]) setSelectedVariant(product.variants[0]);
    if (product?.minOrderQty) setQty(product.minOrderQty);
  }, [product]);

  // Loading from Firestore
  if (loadingFirestore) {
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
          <Link href="/shop/categories" className="px-6 py-3 bg-[#C8102E] text-white rounded-xl font-semibold hover:bg-[#a00d25] transition-colors">
            Retour à la boutique
          </Link>
        </div>
      </div>
    );
  }

  const hasVariants = product.variants && product.variants.length > 0;
  const similar = getSimilarProducts(product, 4);
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

        {/* Tabs */}
        <div className="mt-12">
          <div className="flex border-b border-[#E8E4DF] mb-6">
            {[
              { key: 'description', label: 'Description' },
              { key: 'specs', label: 'Spécifications' },
              { key: 'avis', label: `Avis (${product.reviewCount || 0})` },
            ].map(({ key, label }) => (
              <button key={key} onClick={() => setActiveTab(key as any)}
                className={`px-6 py-3 font-semibold text-sm transition-all border-b-2 -mb-px ${
                  activeTab === key ? 'border-[#C8102E] text-[#C8102E]' : 'border-transparent text-[#6B6B6B] hover:text-[#1A1A1A]'
                }`}>
                {label}
              </button>
            ))}
          </div>
          <div className="bg-white border border-[#E8E4DF] rounded-2xl p-6">
            {activeTab === 'description' && (
              <div className="prose max-w-none text-[#6B6B6B] leading-relaxed">
                {product.description.split('\n').map((p, i) => <p key={i}>{p}</p>)}
              </div>
            )}
            {activeTab === 'specs' && (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {product.specifications ? (
                  Object.entries(product.specifications).map(([k, v]) => (
                    <div key={k} className="flex justify-between py-3 border-b border-[#F3EFE8]">
                      <span className="text-sm font-semibold text-[#6B6B6B]">{k}</span>
                      <span className="text-sm font-bold text-[#1A1A1A]">{v}</span>
                    </div>
                  ))
                ) : (
                  <p className="text-[#6B6B6B]">Aucune spécification disponible</p>
                )}
              </div>
            )}
            {activeTab === 'avis' && (
              <div className="space-y-4">
                {REVIEWS.map(r => (
                  <div key={r.name} className="border-b border-[#F3EFE8] pb-4 last:border-0">
                    <div className="flex items-center gap-3 mb-2">
                      <div className="w-9 h-9 rounded-full bg-[#C8102E] text-white flex items-center justify-center font-bold text-sm">{r.name[0]}</div>
                      <div>
                        <p className="font-semibold text-[#1A1A1A] text-sm">{r.name} <span className="text-[#6B6B6B] font-normal">— {r.city}</span></p>
                        <div className="flex text-[#D4A843] text-xs">{'★'.repeat(r.rating)}</div>
                      </div>
                      <span className="ml-auto text-xs text-[#6B6B6B]">{r.date}</span>
                    </div>
                    <p className="text-sm text-[#6B6B6B] italic ml-12">"{r.text}"</p>
                  </div>
                ))}
                <button className="w-full py-3 border border-[#C8102E] text-[#C8102E] rounded-xl font-semibold text-sm hover:bg-[#C8102E] hover:text-white transition-all">
                  + Rédiger un avis
                </button>
              </div>
            )}
          </div>
        </div>

        {/* Similar products */}
        {similar.length > 0 && (
          <div className="mt-12">
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-2xl font-black text-[#1A1A1A]" style={{ fontFamily: 'Outfit, sans-serif' }}>Vous aimerez aussi</h2>
              <Link href={`/shop/categorie/${product.categorySlug}`}
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
