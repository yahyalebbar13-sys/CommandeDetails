"use client";
import React, { useState } from 'react';
import Link from 'next/link';
import { ShoppingCart, Heart, MessageCircle, Truck, RotateCcw, Shield, Star, ChevronRight, Minus, Plus, Package } from 'lucide-react';
import { getProductById, getSimilarProducts, SHOP_PRODUCTS_DATA } from '@/lib/shop-products-data';
import { formatPrice, getDiscountPercent, buildWhatsAppLink } from '@/lib/shop-utils';
import { useShopCart } from '@/contexts/shop-cart-context';
import type { ProductVariant } from '@/lib/shop-types';

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

export default function ProductPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = React.use(params);
  const product = getProductById(id);
  const { addItem, openCart } = useShopCart();
  const [selectedVariant, setSelectedVariant] = useState<ProductVariant | null>(
    product?.variants[0] || null
  );
  const [qty, setQty] = useState(product?.minOrderQty || 1);
  const [mainImg, setMainImg] = useState(0);
  const [wished, setWished] = useState(false);
  const [added, setAdded] = useState(false);
  const [activeTab, setActiveTab] = useState<'description' | 'specs' | 'avis'>('description');

  if (!product) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#FBF8F3]" style={{ fontFamily: 'Inter, sans-serif' }}>
        <div className="text-center">
          <p className="text-6xl mb-4">😕</p>
          <h1 className="text-2xl font-black text-[#1A1A1A] mb-2" style={{ fontFamily: 'Outfit, sans-serif' }}>Produit introuvable</h1>
          <p className="text-[#6B6B6B] mb-6">Ce produit n'existe pas ou a été supprimé.</p>
          <Link href="/shop/boutique" className="px-6 py-3 bg-[#C8102E] text-white rounded-xl font-semibold hover:bg-[#a00d25] transition-colors">
            Retour à la boutique
          </Link>
        </div>
      </div>
    );
  }

  const similar = getSimilarProducts(product, 4);
  const discount = product.comparePrice ? getDiscountPercent(product.price, product.comparePrice) : 0;
  const currentPrice = selectedVariant?.price || product.price;
  const stock = selectedVariant?.stock ?? product.stockQty;
  const inStock = stock > 0;

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
          <Link href="/shop/boutique" className="hover:text-[#C8102E] transition-colors">Boutique</Link>
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
              {/* Badges */}
              <div className="absolute top-4 left-4 flex flex-col gap-2">
                {product.isNew && <span className="bg-[#10B981] text-white text-xs font-black px-3 py-1 rounded-full">NOUVEAU</span>}
                {product.isPromo && discount > 0 && <span className="bg-[#C8102E] text-white text-xs font-black px-3 py-1 rounded-full">-{discount}%</span>}
              </div>
            </div>
            {/* Thumbnails */}
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
              <span className="text-3xl font-black text-[#1A1A1A]">{formatPrice(currentPrice)}</span>
              {product.comparePrice && (
                <>
                  <span className="text-lg text-[#6B6B6B] line-through">{formatPrice(product.comparePrice)}</span>
                  <span className="bg-[#C8102E] text-white text-sm font-black px-2.5 py-0.5 rounded-full">-{discount}%</span>
                </>
              )}
            </div>

            {/* Stock */}
            <div className={`inline-flex items-center gap-2 px-3 py-1.5 rounded-full text-sm font-semibold mb-5 ${inStock ? 'bg-green-50 text-[#10B981]' : 'bg-red-50 text-red-600'}`}>
              <span className={`w-2 h-2 rounded-full ${inStock ? 'bg-[#10B981]' : 'bg-red-500'}`} />
              {inStock ? `En stock (${stock} disponibles)` : 'Rupture de stock'}
            </div>

            <hr className="border-[#E8E4DF] mb-5" />

            {/* Color variants */}
            {product.variants.some(v => v.color) && (
              <div className="mb-4">
                <p className="text-sm font-semibold text-[#1A1A1A] mb-2">
                  Couleur: <span className="text-[#C8102E]">{selectedVariant?.color || '—'}</span>
                </p>
                <div className="flex flex-wrap gap-2">
                  {product.variants.map(v => (
                    <button key={v.id} onClick={() => setSelectedVariant(v)}
                      title={v.color}
                      className={`w-8 h-8 rounded-full border-2 transition-all hover:scale-110 ${selectedVariant?.id === v.id ? 'border-[#C8102E] scale-110' : 'border-gray-200'}`}
                      style={{ background: v.colorHex || '#ccc' }}>
                      {v.stock === 0 && <span className="absolute inset-0 flex items-center justify-center"><span className="block w-full h-0.5 bg-white/70 rotate-45" /></span>}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* Size variants */}
            {product.variants.some(v => v.size) && (
              <div className="mb-5">
                <p className="text-sm font-semibold text-[#1A1A1A] mb-2">
                  Taille: <span className="text-[#C8102E]">{selectedVariant?.size || '—'}</span>
                </p>
                <div className="flex flex-wrap gap-2">
                  {product.variants.map(v => v.size && (
                    <button key={v.id} onClick={() => setSelectedVariant(v)}
                      disabled={v.stock === 0}
                      className={`px-4 py-1.5 rounded-lg border text-sm font-semibold transition-all ${
                        selectedVariant?.id === v.id
                          ? 'border-[#C8102E] bg-[#C8102E]/10 text-[#C8102E]'
                          : v.stock === 0
                            ? 'border-gray-200 text-gray-300 line-through cursor-not-allowed'
                            : 'border-[#E8E4DF] text-[#1A1A1A] hover:border-[#C8102E]'
                      }`}>
                      {v.size}
                    </button>
                  ))}
                </div>
              </div>
            )}

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
              <div className="flex gap-3">
                <a href={buildWhatsAppLink(product.id, currentPrice * qty, product.name)} target="_blank" rel="noopener noreferrer"
                  className="flex-1 py-3 rounded-xl font-bold text-sm flex items-center justify-center gap-2 bg-[#25D366] hover:bg-[#1da851] text-white transition-colors">
                  <MessageCircle className="w-4 h-4" /> Commander sur WhatsApp
                </a>
                <button onClick={() => setWished(!wished)}
                  className={`w-12 h-12 rounded-xl border-2 flex items-center justify-center transition-all ${wished ? 'border-red-400 bg-red-50 text-red-500' : 'border-[#E8E4DF] text-[#6B6B6B] hover:border-red-400'}`}>
                  <Heart className="w-5 h-5" fill={wished ? 'currentColor' : 'none'} />
                </button>
              </div>
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
