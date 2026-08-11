"use client";
import React, { useState } from 'react';
import Link from 'next/link';
import { ShoppingCart, Heart, MessageCircle, Truck, RotateCcw, Shield, Star, ChevronRight, ChevronDown, Minus, Plus, Package, ArrowLeft } from 'lucide-react';
import { getProductById, getSimilarProducts } from '@/lib/shop-products-data';
import { formatPrice, getDiscountPercent, buildWhatsAppLink } from '@/lib/shop-utils';
import { useShopCartActions } from '@/contexts/shop-cart-context';
import { useShopProducts } from '@/contexts/shop-products-context';
import { useLanguage } from '@/contexts/language-context';
import { db } from '@/lib/firebase-db';
import { doc, getDoc } from 'firebase/firestore';
import type { CartItem, ProductVariant } from '@/lib/shop-types';

function Accordion({ title, icon, defaultOpen = false, children }: { title: string, icon: React.ReactNode, defaultOpen?: boolean, children: React.ReactNode }) {
  const [isOpen, setIsOpen] = useState(defaultOpen);
  return (
    <div className="bg-white border border-[#E8E4DF] rounded-2xl overflow-hidden shadow-sm mb-4">
      <button 
        onClick={() => setIsOpen(!isOpen)}
        className="w-full flex items-center justify-between px-6 py-4 transition-colors hover:bg-[#FBF8F3] text-left cursor-pointer"
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
  return (
    <Link href={`/shop/produit/${product.id}`} className="block bg-white border border-[#E8E4DF] rounded-2xl overflow-hidden hover:-translate-y-1 hover:shadow-lg transition-all">
      <div className="aspect-square overflow-hidden bg-gray-50 relative">
        <img src={product.images?.[0] || '/placeholder.png'} alt={product.name} loading="lazy" decoding="async" className="w-full h-full object-cover hover:scale-105 transition-transform duration-500" />
      </div>
      <div className="p-3">
        <p className="text-xs text-[#D4A843] font-semibold mb-1">{product.categoryName}</p>
        <h4 className="font-semibold text-[#1A1A1A] text-sm line-clamp-2 mb-2" style={{ fontFamily: 'Outfit, sans-serif' }}>{product.name}</h4>
        <span className="text-xs font-semibold text-[#C8102E]">Sur demande</span>
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
  productNameAr,
  productImage,
  wholesalePrice,
  minOrderQty,
  onAdd,
}: {
  variants: ProductVariant[];
  basePrice: number;
  productId: string;
  productName: string;
  productNameAr?: string;
  productImage: string;
  wholesalePrice?: number;
  minOrderQty?: number;
  onAdd: (items: CartItem[]) => void;
}) {
  const { language } = useLanguage();
  const [qtys, setQtys] = useState<Record<string, number>>({});

  const safeVariants = React.useMemo(() => variants.map((v, i) => ({ ...v, _safeId: v.id ? `${v.id}-${i}` : `v-${i}` })), [variants]);

  // Size selection logic
  const uniqueSizes = Array.from(new Set(safeVariants.map(v => v.size || 'Standard')));
  const hasSizes = uniqueSizes.length > 1 || (uniqueSizes.length === 1 && uniqueSizes[0] !== 'Standard');
  const [selectedSize, setSelectedSize] = useState<string>(uniqueSizes[0] || 'Standard');

  const visibleVariants = safeVariants.filter(v => (v.size || 'Standard') === selectedSize);

  // Guard: if no variants match the selected size, reset to first available
  const validSelectedSize = visibleVariants.length > 0 ? selectedSize : (safeVariants[0]?.size || 'Standard');

  const setQty = (variantId: string, delta: number, max: number | undefined) => {
    setQtys(prev => {
      const current = prev[variantId] || 0;
      const safeMax = (typeof max === 'number' && !isNaN(max)) ? max : 999999;
      const next = Math.max(0, Math.min(safeMax, current + delta));
      return { ...prev, [variantId]: next };
    });
  };

  const totalQty = Object.values(qtys).reduce((s, q) => s + q, 0);
  const totalPrice = safeVariants.reduce((s, v) => s + (v.price ?? basePrice) * (qtys[v._safeId] || 0), 0);

  const handleAdd = () => {
    const items: CartItem[] = [];
    safeVariants.forEach(v => {
      const qty = qtys[v._safeId] || 0;
      if (qty > 0) {
        const itemPrice = v.price ?? basePrice;
        items.push({
          productId,
          productName,
          productNameAr: productNameAr || undefined,
          productImage: v.image || productImage,
          price: itemPrice,
          originalPrice: v.price ?? basePrice,
          wholesalePrice,
          minOrderQty,
          quantity: qty,
          variant: { color: v.color, colorAr: v.colorAr, colorHex: v.colorHex, size: v.size, sizeAr: v.sizeAr, variantId: v.id },
          maxStock: v.stock,
        });
      }
    });
    if (items.length === 0) return;
    onAdd(items);
    setQtys({});
  };

  return (
    <div className="mb-5">
      {hasSizes && (
        <div className="flex flex-col gap-1 mb-3">
          <label className="text-sm font-semibold text-[#1A1A1A]">{language === 'ar' ? 'اختر المقاس:' : 'Taille :'}</label>
          <div className="flex flex-wrap gap-2">
            {uniqueSizes.map(sz => (
              <button
                key={sz}
                onClick={() => setSelectedSize(sz)}
                className={`px-4 py-2 rounded-xl text-sm font-semibold transition-all duration-200 border-2 cursor-pointer touch-manipulation
                  ${selectedSize === sz
                    ? 'border-[#C8102E] bg-red-50 text-[#C8102E]'
                    : 'border-[#E8E4DF] bg-white text-[#6B6B6B] hover:border-[#D4A843]'
                  }`}
              >
                {sz}
              </button>
            ))}
          </div>
        </div>
      )}

      {(() => {
        const displayVariants = validSelectedSize !== selectedSize
          ? variants.filter(v => (v.size || 'Standard') === validSelectedSize)
          : visibleVariants;
        if (displayVariants.length === 0) return <p className="text-sm text-gray-500 italic">{language === 'ar' ? 'لا توجد خيارات متاحة لهذا المقاس.' : 'Aucune variante disponible pour cette taille.'}</p>;
        const isSimpleSize = displayVariants.length === 1 && (!displayVariants[0]?.color || displayVariants[0]?.color?.startsWith('Option')) && !displayVariants[0]?.image;
        
        if (isSimpleSize) {
          const v = displayVariants[0];
          const qty = qtys[v._safeId] || 0;
          return (
            <div className="flex items-center justify-between bg-gray-50/50 border border-gray-100 p-4 rounded-2xl">
              <div>
                <p className="font-black text-lg text-[#C8102E]">
                  {language === 'ar' ? 'حسب الطلب' : 'Sur demande'}
                </p>
                {v.stock <= 10 && v.stock > 0 && (
                  <p className="text-[11px] text-[#D4A843] font-bold mt-0.5">{language === 'ar' ? `🔥 متبقي ${v.stock} فقط!` : `🔥 Plus que ${v.stock} en stock !`}</p>
                )}
                {v.stock === 0 && (
                  <p className="text-[11px] text-red-500 font-bold mt-0.5">{language === 'ar' ? 'نفد المخزون' : 'Rupture de stock'}</p>
                )}
              </div>
              {v.stock > 0 ? (
                <div className="flex items-center gap-2 bg-white border border-gray-200 rounded-full px-1.5 py-1.5 shadow-sm">
                  <button onClick={() => setQty(v._safeId, -1, v.stock)}
                    className="w-8 h-8 rounded-full flex items-center justify-center text-gray-500 hover:text-[#C8102E] hover:bg-red-50 transition-all">
                    <Minus className="w-4 h-4" />
                  </button>
                  <span className="w-6 text-center font-black text-lg text-[#C8102E]">{qty}</span>
                  <button onClick={() => setQty(v._safeId, 1, v.stock)}
                    disabled={qty >= v.stock}
                    className="w-8 h-8 rounded-full flex items-center justify-center text-gray-500 hover:text-[#C8102E] hover:bg-red-50 transition-all disabled:opacity-30">
                    <Plus className="w-4 h-4" />
                  </button>
                </div>
              ) : (
                <span className="px-4 py-2 bg-gray-100 text-gray-400 font-bold rounded-xl text-sm">{language === 'ar' ? 'نفد' : 'Épuisé'}</span>
              )}
            </div>
          );
        }

        return (
          <>
            <p className="text-sm font-bold text-[#1A1A1A] mb-4">
              {hasSizes ? (language === 'ar' ? `الألوان المتاحة لـ ${selectedSize}` : `Couleurs/Modèles pour ${selectedSize}`) : (language === 'ar' ? 'الخيارات المتاحة' : 'Options disponibles')}
            </p>
            <div className="flex flex-wrap gap-5">
              {displayVariants.map(v => {
                const outOfStock = v.stock === 0;
                const qty = qtys[v._safeId] || 0;
                const isSelected = qty > 0;

                return (
                  <div key={v._safeId} className="flex flex-col items-center gap-2">
                    <div className="relative">
                      <button
                        onClick={() => {
                          if (outOfStock) return;
                          if (isSelected) {
                            setQty(v._safeId, -qty, v.stock);
                          } else {
                            setQty(v._safeId, 1, v.stock);
                          }
                        }}
                        disabled={outOfStock}
                        title={outOfStock ? (language === 'ar' ? 'نفد' : 'Épuisé') : (v.size ? `${v.size} - ${language === 'ar' && v.colorAr ? v.colorAr : v.color}` : (language === 'ar' && v.colorAr ? v.colorAr : v.color))}
                        className={`transition-all duration-200 shadow-sm flex items-center justify-center overflow-hidden relative cursor-pointer touch-manipulation
                          ${v.image 
                            ? 'w-20 h-20 rounded-xl border-2' 
                            : 'w-14 h-14 rounded-full border-4'}
                          ${outOfStock
                            ? 'opacity-50 cursor-not-allowed border-gray-200 bg-gray-50'
                            : isSelected
                              ? 'border-[#C8102E] scale-105 shadow-lg shadow-[#C8102E]/20 bg-white z-20'
                              : 'border-gray-200 hover:border-gray-300 hover:scale-105 bg-white z-10'}
                        `}
                      >
                        {v.image ? (
                          <img src={v.image} alt={v.color || 'Design'} loading="lazy" decoding="async" className="w-full h-full object-cover pointer-events-none" />
                        ) : (
                          <div className="w-full h-full pointer-events-none" style={{ background: v.colorHex || '#ccc' }} />
                        )}

                        {outOfStock && (
                          <div className="absolute inset-0 flex items-center justify-center pointer-events-none overflow-hidden" style={{ borderRadius: 'inherit' }}>
                            <div className="w-[150%] h-[2px] bg-red-400/50 -rotate-12" />
                          </div>
                        )}
                      </button>
                      {isSelected && (
                        <div className="absolute -top-1.5 -right-1.5 w-5 h-5 rounded-full bg-[#C8102E] border-2 border-white flex items-center justify-center shadow-sm z-20 pointer-events-none">
                          <span className="text-white text-[9px] font-black leading-none">✓</span>
                        </div>
                      )}
                    </div>

                    <p className="text-[11px] font-semibold text-center text-[#1A1A1A] leading-tight max-w-[80px]">
                      {v.color && !v.color.startsWith('Option') ? (language === 'ar' && v.colorAr ? v.colorAr : v.color) : '—'}
                    </p>



                    <div className={`flex items-center gap-1 transition-all duration-300 ${isSelected ? 'opacity-100 h-8' : 'opacity-0 h-0 overflow-hidden'}`}>
                      {isSelected && (
                        <>
                          <button onClick={(e) => { e.stopPropagation(); setQty(v._safeId, -1, v.stock); }}
                            className="w-9 h-9 rounded-full border border-[#E8E4DF] bg-white flex items-center justify-center text-gray-500 hover:border-[#C8102E] hover:text-[#C8102E] transition-all cursor-pointer touch-manipulation">
                            <Minus className="w-3.5 h-3.5" />
                          </button>
                          <span className="w-6 text-center text-[13px] font-black text-[#C8102E]">{qty}</span>
                          <button onClick={(e) => { e.stopPropagation(); setQty(v._safeId, 1, v.stock); }}
                            disabled={qty >= v.stock}
                            className="w-9 h-9 rounded-full border border-[#E8E4DF] bg-white flex items-center justify-center text-gray-500 hover:border-[#C8102E] hover:text-[#C8102E] disabled:opacity-30 disabled:hover:border-[#E8E4DF] transition-all cursor-pointer touch-manipulation">
                            <Plus className="w-3.5 h-3.5" />
                          </button>
                        </>
                      )}
                    </div>

                    <p className={`text-[9px] uppercase tracking-wider ${outOfStock ? 'text-red-500 font-bold' : 'text-gray-400 font-medium'}`}>
                      {outOfStock ? (language === 'ar' ? 'نفد' : 'Rupture') : (language === 'ar' ? `${v.stock} متوفر` : `${v.stock} dispo`)}
                    </p>
                  </div>
                );
              })}
            </div>
          </>
        );
      })()}

      {totalQty > 0 && (
        <div className="mt-5 flex items-center justify-between px-4 py-3 bg-red-50 border border-[#C8102E]/20 rounded-xl">
          <p className="text-sm text-gray-600">
            <span className="font-bold text-[#1A1A1A]">{totalQty}</span> {language === 'ar' ? 'منتج مختار' : 'article(s) sélectionné(s)'}
          </p>
          <p className="text-sm font-black text-[#C8102E]">{language === 'ar' ? 'حسب الطلب' : 'Sur demande'}</p>
        </div>
      )}

      <button onClick={handleAdd} disabled={totalQty === 0}
        className={`w-full mt-4 py-4 rounded-xl font-bold text-base flex items-center justify-center gap-2 transition-all shop-btn-press ${
          totalQty === 0
            ? 'bg-gray-100 text-gray-400 cursor-not-allowed'
            : 'bg-[#C8102E] hover:bg-[#a00d25] text-white shadow-lg shadow-[#C8102E]/20'
        }`}>
        <ShoppingCart className="w-5 h-5" />
        {totalQty === 0
          ? (language === 'ar' ? 'اضغط لاختيار اللون' : 'Cliquez sur une couleur pour sélectionner')
          : (language === 'ar' ? `إضافة للسلة — ${totalQty} منتج` : `Ajouter au panier — ${totalQty} article${totalQty > 1 ? 's' : ''}`)}
      </button>
    </div>
  );
}

export default function ProductPage({ params }: { params: Promise<{ id: string }> }) {
  const { language } = useLanguage();
  const { id } = React.use(params);
  const { addItem, addItems, openCart } = useShopCartActions();
  const { products, getProductById: ctxGetById, isLoading } = useShopProducts();

  const [directProduct, setDirectProduct] = React.useState<any>(null);
  const [directLoading, setDirectLoading] = React.useState(false);
  const [directDone, setDirectDone] = React.useState(false);

  const product = ctxGetById(id) || directProduct;

  React.useEffect(() => {
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
  const [similar, setSimilar] = React.useState<typeof products>([]);
  const [similarTitle, setSimilarTitle] = React.useState("Vous aimerez aussi");
  const [similarLink, setSimilarLink] = React.useState("/shop");

  React.useEffect(() => {
    setMainImg(0);
    setSelectedVariant(null);
    setAdded(false);
    if (product?.variants?.[0]) setSelectedVariant(product.variants[0]);
    if (product?.minOrderQty) setQty(product.minOrderQty);
    else setQty(1);
  }, [product?.id]);

  React.useEffect(() => {
    if (!product || products.length === 0) return;
    let sim = products
      .filter(p => p.categorySlug === product.categorySlug && p.id !== product.id)
      .sort(() => 0.5 - Math.random())
      .slice(0, 4);
    if (sim.length === 0) {
      sim = products
        .filter(p => p.categorySlug !== product.categorySlug && p.id !== product.id)
        .sort(() => 0.5 - Math.random())
        .slice(0, 4);
      setSimilarTitle(language === 'ar' ? 'اكتشف فئات أخرى' : "Découvrez d'autres catégories");
      setSimilarLink("/shop");
    } else {
      setSimilarTitle(language === 'ar' ? 'قد يعجبك أيضاً' : "Vous aimerez aussi");
      setSimilarLink(`/shop/categorie/${product.categorySlug}`);
    }
    setSimilar(sim);
  }, [product?.id, products, language]);

  if (isLoading || directLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#FBF8F3]">
        <div className="text-center">
          <div className="w-10 h-10 border-4 border-[#C8102E] border-t-transparent rounded-full animate-spin mx-auto mb-4" />
          <p className="text-[#6B6B6B] text-sm">{language === 'ar' ? 'جاري التحميل...' : 'Chargement du produit…'}</p>
        </div>
      </div>
    );
  }

  if (!product) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#FBF8F3]" style={{ fontFamily: 'Inter, sans-serif' }}>
        <div className="text-center">
          <p className="text-6xl mb-4">😕</p>
          <h1 className="text-2xl font-black text-[#1A1A1A] mb-2" style={{ fontFamily: 'Outfit, sans-serif' }}>{language === 'ar' ? 'المنتج غير موجود' : 'Produit introuvable'}</h1>
          <p className="text-[#6B6B6B] mb-6">{language === 'ar' ? 'هذا المنتج غير موجود أو تم حذفه.' : 'Ce produit n\'existe pas ou a été supprimé.'}</p>
          <Link href="/shop/categories" className="px-6 py-3 bg-[#C8102E] text-white rounded-xl font-semibold hover:bg-[#a00d25] transition-colors">
            {language === 'ar' ? 'العودة للمتجر' : 'Retour à la boutique'}
          </Link>
        </div>
      </div>
    );
  }

  const hasVariants = product.variants && product.variants.length > 0;
  const discount = product.comparePrice ? getDiscountPercent(product.price, product.comparePrice) : 0;
  const currentPrice = selectedVariant?.price || product.price;
  const stock = selectedVariant?.stock ?? product.stockQty;
  const inStock = hasVariants ? product.variants.some(v => v.stock > 0) : stock > 0;

  const handleAddToCart = () => {
    addItem({
      productId: product.id,
      productName: product.name,
      productNameAr: product.nameAr,
      productImage: product.images?.[mainImg] || product.images?.[0] || '',
      price: currentPrice,
      originalPrice: product.price,
      wholesalePrice: product.wholesalePrice,
      minOrderQty: product.minOrderQty,
      quantity: qty,
      variant: selectedVariant ? { color: selectedVariant.color, colorAr: selectedVariant.colorAr, size: selectedVariant.size, sizeAr: selectedVariant.sizeAr, variantId: selectedVariant.id } : undefined,
      maxStock: stock,
    });
    setAdded(true);
    setTimeout(() => { setAdded(false); openCart(); }, 1500);
  };

  const handleAddVariantsToCart = (items: CartItem[]) => {
    addItems(items);
    setAdded(true);
    setTimeout(() => { setAdded(false); openCart(); }, 1500);
  };

  return (
    <div style={{ fontFamily: 'Inter, sans-serif', background: '#FBF8F3' }} className="min-h-screen">
      {added && (
        <div className="fixed top-20 left-1/2 -translate-x-1/2 z-50 bg-[#10B981] text-white px-6 py-3 rounded-full font-semibold shadow-lg shop-slide-in-up flex items-center gap-2">
          <span>✓</span> {language === 'ar' ? 'تمت الإضافة للسلة !' : 'Ajouté au panier !'}
        </div>
      )}

      <div className="max-w-7xl mx-auto px-4 py-6 md:py-10">
        <div className="flex flex-col sm:flex-row sm:items-center gap-4 mb-6">
          <button 
            onClick={() => window.history.back()} 
            aria-label="Retour"
            title="Retour"
            className="w-10 h-10 flex items-center justify-center bg-white border border-[#E8E4DF] rounded-full hover:bg-[#FBF8F3] hover:border-[#D4A843] hover:text-[#C8102E] transition-all shadow-sm flex-shrink-0 text-[#1A1A1A] cursor-pointer"
          >
            <ArrowLeft className="w-5 h-5" />
          </button>
          <div className="hidden sm:block w-px h-5 bg-[#E8E4DF]"></div>
          <nav className="flex items-center flex-wrap gap-1.5 text-xs text-[#6B6B6B]">
            <Link href="/shop" className="hover:text-[#C8102E] transition-colors">{language === 'ar' ? 'الرئيسية' : 'Accueil'}</Link>
            <ChevronRight className="w-3 h-3" />
            <Link href="/shop/categories" className="hover:text-[#C8102E] transition-colors">{language === 'ar' ? 'المتجر' : 'Boutique'}</Link>
            <ChevronRight className="w-3 h-3" />
            <Link href={`/shop/categorie/${product.categorySlug}`} className="hover:text-[#C8102E] transition-colors">
              {language === 'ar' && product.categoryNameAr ? product.categoryNameAr : product.categoryName}
            </Link>
            <ChevronRight className="w-3 h-3" />
            <span className="text-[#1A1A1A] font-medium truncate max-w-[200px]">{language === 'ar' && product.nameAr ? product.nameAr : product.name}</span>
          </nav>
        </div>

        <div className="grid md:grid-cols-2 gap-8 lg:gap-12" dir={language === 'ar' ? 'rtl' : 'ltr'}>
          <div>
            <div className="relative aspect-square rounded-2xl overflow-hidden bg-white border border-[#E8E4DF] shop-img-zoom mb-3">
              <img src={product.images?.[mainImg] || product.images?.[0] || '/placeholder.png'} alt={product.name} loading="eager" decoding="async" className="w-full h-full object-cover" />
              <div className="absolute top-4 left-4 flex flex-col gap-2">
                {product.isNew && <span className="bg-[#10B981] text-white text-xs font-black px-3 py-1 rounded-full">{language === 'ar' ? 'جديد' : 'NOUVEAU'}</span>}
              </div>
            </div>
            <div className="flex gap-2">
              {product.images?.map((img, i) => (
                <button key={i} onClick={() => setMainImg(i)}
                  className={`w-16 h-16 rounded-xl overflow-hidden border-2 transition-all cursor-pointer ${mainImg === i ? 'border-[#C8102E]' : 'border-[#E8E4DF] hover:border-[#D4A843]'}`}>
                  <img src={img} alt="" loading="lazy" decoding="async" className="w-full h-full object-cover" />
                </button>
              ))}
            </div>
          </div>

          <div>
            <h1 className="text-2xl md:text-3xl font-black text-[#1A1A1A] mb-3 leading-tight" style={{ fontFamily: 'Outfit, sans-serif' }}>
              {language === 'ar' && product.nameAr ? product.nameAr : product.name}
            </h1>

            <p className="text-[#6B6B6B] text-sm md:text-base leading-relaxed mb-6 whitespace-pre-wrap">
              {language === 'ar' && product.shortDescriptionAr ? product.shortDescriptionAr : product.shortDescription}
            </p>

            <div className="flex items-center gap-3 mb-4">
              <span className="text-xl font-bold text-[#C8102E]">
                {language === 'ar' ? 'حسب الطلب' : 'Sur demande'}
              </span>
            </div>

            <div className={`inline-flex items-center gap-2 px-3 py-1.5 rounded-full text-sm font-semibold mb-5 ${inStock ? 'bg-green-50 text-[#10B981]' : 'bg-red-50 text-red-600'}`}>
              <span className={`w-2 h-2 rounded-full ${inStock ? 'bg-[#10B981]' : 'bg-red-500'}`} />
              {inStock
                ? hasVariants
                  ? (language === 'ar' ? `${product.variants.reduce((s, v) => s + v.stock, 0)} قطعة متوفرة` : `${product.variants.reduce((s, v) => s + v.stock, 0)} unités disponibles`)
                  : (language === 'ar' ? `متوفر (${stock} قطعة)` : `En stock (${stock} disponibles)`)
                : (language === 'ar' ? 'نفد المخزون' : 'Rupture de stock')}
            </div>

            <hr className="border-[#E8E4DF] mb-5" />

            {hasVariants ? (
              <MultiVariantSelector
                variants={product.variants}
                basePrice={product.price}
                productId={product.id}
                productName={product.name}
                productNameAr={product.nameAr}
                productImage={product.images?.[mainImg] || product.images?.[0] || ''}
                wholesalePrice={product.wholesalePrice}
                minOrderQty={product.minOrderQty}
                onAdd={handleAddVariantsToCart}
              />
            ) : (
              <>
                {inStock && (
                  <div className="mb-4">
                    <p className="text-sm font-semibold text-[#1A1A1A] mb-2">{language === 'ar' ? 'الكمية' : 'Quantité'}</p>
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
                    </div>
                  </div>
                )}
                <button onClick={handleAddToCart} disabled={!inStock}
                  className={`w-full py-4 rounded-xl font-bold text-base flex items-center justify-center gap-2 transition-all shop-btn-press ${
                    !inStock ? 'bg-gray-200 text-gray-400 cursor-not-allowed'
                    : added ? 'bg-[#10B981] text-white'
                    : 'bg-[#C8102E] hover:bg-[#a00d25] text-white shadow-lg shadow-[#C8102E]/20'
                  }`}>
                  <ShoppingCart className="w-5 h-5" />
                  {added ? (language === 'ar' ? 'تمت الإضافة للسلة' : '✓ Ajouté au panier !') : inStock ? (language === 'ar' ? 'إضافة للسلة' : 'Ajouter au panier') : (language === 'ar' ? 'نفد' : 'Rupture de stock')}
                </button>
              </>
            )}
            
            <div className="flex gap-3 mb-5 mt-4">
              <a href={buildWhatsAppLink(product.id, hasVariants ? product.price : currentPrice * qty, product.name)} target="_blank" rel="noopener noreferrer"
                className="flex-1 py-3 rounded-xl font-bold text-sm flex items-center justify-center gap-2 bg-[#25D366] hover:bg-[#1da851] text-white transition-colors">
                <MessageCircle className="w-4 h-4" /> {language === 'ar' ? 'الطلب عبر واتساب' : 'Commander sur WhatsApp'}
              </a>
            </div>
          </div>
        </div>

        <div className="mt-10 mb-12">
          <div className="space-y-4">
            {/* ── Caractéristiques Techniques (Hyper Pro) ── */}
            {(product.typeProduit || product.matiereMailles || product.compositionRuban || product.largeurMaille || product.longueur || product.type || product.design || product.securite || product.resistance || product.compatibleAvec || product.conditionnementUnitaire || product.conditionnementGros) && (
              <Accordion title={language === 'ar' ? 'معلومات تفصيلية' : 'Informations Détaillées'} icon={<Package className="w-5 h-5 text-[#10B981]" />} defaultOpen={true}>
                <div className="p-6 grid grid-cols-2 md:grid-cols-3 gap-3">
                  {product.typeProduit && (
                    <div className="bg-[#FDFBF8] p-3 rounded-xl border border-[#F3EFE8] flex flex-col gap-1 transition-all hover:border-[#C8102E]/20 hover:shadow-sm">
                      <span className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">{language === 'ar' ? 'نوع المنتج' : 'Type de produit'}</span>
                      <span className="text-[13px] font-semibold text-[#1A1A1A]">{product.typeProduit}</span>
                    </div>
                  )}
                  {product.matiereMailles && (
                    <div className="bg-[#FDFBF8] p-3 rounded-xl border border-[#F3EFE8] flex flex-col gap-1 transition-all hover:border-[#C8102E]/20 hover:shadow-sm">
                      <span className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">{language === 'ar' ? 'مادة' : 'Matière'}</span>
                      <span className="text-[13px] font-semibold text-[#1A1A1A]">{product.matiereMailles}</span>
                    </div>
                  )}
                  {product.compositionRuban && (
                    <div className="bg-[#FDFBF8] p-3 rounded-xl border border-[#F3EFE8] flex flex-col gap-1 transition-all hover:border-[#C8102E]/20 hover:shadow-sm">
                      <span className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">{language === 'ar' ? 'تركيبة' : 'Composition'}</span>
                      <span className="text-[13px] font-semibold text-[#1A1A1A]">{product.compositionRuban}</span>
                    </div>
                  )}
                  {product.largeurMaille && (
                    <div className="bg-[#FDFBF8] p-3 rounded-xl border border-[#F3EFE8] flex flex-col gap-1 transition-all hover:border-[#C8102E]/20 hover:shadow-sm">
                      <span className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">{language === 'ar' ? 'العرض' : 'Largeur'}</span>
                      <span className="text-[13px] font-semibold text-[#1A1A1A]">{product.largeurMaille}</span>
                    </div>
                  )}
                  {product.longueur && (
                    <div className="bg-[#FDFBF8] p-3 rounded-xl border border-[#F3EFE8] flex flex-col gap-1 transition-all hover:border-[#C8102E]/20 hover:shadow-sm">
                      <span className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">{language === 'ar' ? 'الطول' : 'Longueur'}</span>
                      <span className="text-[13px] font-semibold text-[#1A1A1A]">{product.longueur}</span>
                    </div>
                  )}
                  {product.type && (
                    <div className="bg-[#FDFBF8] p-3 rounded-xl border border-[#F3EFE8] flex flex-col gap-1 transition-all hover:border-[#C8102E]/20 hover:shadow-sm">
                      <span className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">{language === 'ar' ? 'النوع' : 'Type'}</span>
                      <span className="text-[13px] font-semibold text-[#1A1A1A]">{product.type}</span>
                    </div>
                  )}
                  {product.design && (
                    <div className="bg-[#FDFBF8] p-3 rounded-xl border border-[#F3EFE8] flex flex-col gap-1 transition-all hover:border-[#C8102E]/20 hover:shadow-sm">
                      <span className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">{language === 'ar' ? 'التصميم' : 'Design'}</span>
                      <span className="text-[13px] font-semibold text-[#1A1A1A]">{product.design}</span>
                    </div>
                  )}
                  {product.securite && (
                    <div className="bg-[#FDFBF8] p-3 rounded-xl border border-[#F3EFE8] flex flex-col gap-1 transition-all hover:border-[#C8102E]/20 hover:shadow-sm">
                      <span className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">{language === 'ar' ? 'الأمان' : 'Sécurité'}</span>
                      <span className="text-[13px] font-semibold text-[#1A1A1A]">{product.securite}</span>
                    </div>
                  )}
                  {product.resistance && (
                    <div className="bg-[#FDFBF8] p-3 rounded-xl border border-[#F3EFE8] flex flex-col gap-1 transition-all hover:border-[#C8102E]/20 hover:shadow-sm">
                      <span className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">{language === 'ar' ? 'المقاومة' : 'Résistance'}</span>
                      <span className="text-[13px] font-semibold text-[#1A1A1A]">{product.resistance}</span>
                    </div>
                  )}
                  {product.compatibleAvec && (
                    <div className="bg-[#FDFBF8] p-3 rounded-xl border border-[#F3EFE8] flex flex-col gap-1 transition-all hover:border-[#C8102E]/20 hover:shadow-sm">
                      <span className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">{language === 'ar' ? 'متوافق مع' : 'Compatible avec'}</span>
                      <span className="text-[13px] font-semibold text-[#1A1A1A]">{product.compatibleAvec}</span>
                    </div>
                  )}
                  {product.conditionnementUnitaire && (
                    <div className="bg-[#FDFBF8] p-3 rounded-xl border border-[#F3EFE8] flex flex-col gap-1 transition-all hover:border-[#C8102E]/20 hover:shadow-sm">
                      <span className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">{language === 'ar' ? 'التعبئة والتغليف (وحدة)' : 'Cond. unitaire'}</span>
                      <span className="text-[13px] font-semibold text-[#1A1A1A]">{product.conditionnementUnitaire}</span>
                    </div>
                  )}
                  {product.conditionnementGros && (
                    <div className="bg-[#FDFBF8] p-3 rounded-xl border border-[#F3EFE8] flex flex-col gap-1 transition-all hover:border-[#C8102E]/20 hover:shadow-sm">
                      <span className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">{language === 'ar' ? 'التعبئة والتغليف (جملة)' : 'Cond. gros'}</span>
                      <span className="text-[13px] font-semibold text-[#1A1A1A]">{product.conditionnementGros}</span>
                    </div>
                  )}
                </div>
              </Accordion>
            )}

            <Accordion title={language === 'ar' ? 'الوصف المفصل' : 'Description Détaillée'} icon={<ShoppingCart className="w-5 h-5 text-[#C8102E]" />}>
              <div className="p-6 text-[#4A4A4A] leading-relaxed text-[15px] space-y-4">
                {language === 'ar' && product.descriptionAr ? product.descriptionAr : product.description}
              </div>
            </Accordion>


            {/* ── Informations Complémentaires (Hyper Pro longs textes) ── */}
            {(product.applications || product.avantages || product.conseilsEntretien || product.informationCommerciale) && (
              <Accordion title={language === 'ar' ? 'تفاصيل ومعلومات إضافية' : 'Détails & Applications'} icon={<Shield className="w-5 h-5 text-[#8B5CF6]" />}>
                <div className="p-6 space-y-5 text-sm">
                  {product.applications && (
                    <div className="border-b border-[#F3EFE8] pb-4">
                      <span className="font-bold text-[#1A1A1A] block mb-2">{language === 'ar' ? 'التطبيقات (قطاعات/استخدامات):' : 'Applications (Secteurs/Usages):'}</span>
                      <p className="text-[#6B6B6B] whitespace-pre-line leading-relaxed">{product.applications}</p>
                    </div>
                  )}
                  {product.avantages && (
                    <div className="border-b border-[#F3EFE8] pb-4">
                      <span className="font-bold text-[#1A1A1A] block mb-2">{language === 'ar' ? 'المميزات:' : 'Avantages:'}</span>
                      <p className="text-[#6B6B6B] whitespace-pre-line leading-relaxed">{product.avantages}</p>
                    </div>
                  )}
                  {product.conseilsEntretien && (
                    <div className="border-b border-[#F3EFE8] pb-4">
                      <span className="font-bold text-[#1A1A1A] block mb-2">{language === 'ar' ? 'نصائح العناية:' : "Conseils d'entretien:"}</span>
                      <p className="text-[#6B6B6B] whitespace-pre-line leading-relaxed">{product.conseilsEntretien}</p>
                    </div>
                  )}
                  {product.informationCommerciale && (
                    <div className="pb-2">
                      <span className="font-bold text-[#1A1A1A] block mb-2">{language === 'ar' ? 'معلومات تجارية (تعبئة، حد أدنى):' : 'Infos commerciales (Conditionnement, MOQ...):'}</span>
                      <p className="text-[#6B6B6B] whitespace-pre-line leading-relaxed">{product.informationCommerciale}</p>
                    </div>
                  )}
                </div>
              </Accordion>
            )}

            </div>







        </div>

        {/* ── Similar Products — Premium Section ── */}
        {similar.length > 0 && (
          <div className="mt-16 -mx-4 md:-mx-0">
            <div className="bg-gradient-to-br from-[#1A1A1A] via-[#252525] to-[#1A1A1A] rounded-none md:rounded-3xl px-4 sm:px-8 py-10 md:py-14 relative overflow-hidden">
              {/* Decorative elements */}
              <div className="absolute top-0 right-0 w-64 h-64 bg-[#C8102E]/5 rounded-full blur-3xl pointer-events-none" />
              <div className="absolute bottom-0 left-0 w-48 h-48 bg-[#D4A843]/5 rounded-full blur-3xl pointer-events-none" />

              {/* Header */}
              <div className="flex items-center justify-between mb-8 relative z-10">
                <div>
                  <div className="flex items-center gap-2 mb-2">
                    <div className="w-8 h-0.5 bg-[#D4A843] rounded-full" />
                    <span className="text-[11px] font-bold uppercase tracking-[0.2em] text-[#D4A843]">
                      {language === 'ar' ? 'منتجات مقترحة' : 'Sélection pour vous'}
                    </span>
                  </div>
                  <h2 className="text-xl sm:text-2xl font-black text-white" style={{ fontFamily: 'Outfit, sans-serif' }}>
                    {similarTitle}
                  </h2>
                </div>
                <Link
                  href={similarLink}
                  className="hidden sm:flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-semibold text-white border border-white/20 hover:bg-white hover:text-[#1A1A1A] transition-all duration-200 cursor-pointer"
                >
                  {language === 'ar' ? 'عرض الكل' : 'Voir tout'}
                  <ChevronRight className="w-4 h-4" />
                </Link>
              </div>

              {/* Product Grid */}
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3 sm:gap-5 relative z-10">
                {similar.map(p => (
                  <Link
                    key={p.id}
                    href={`/shop/produit/${p.id}`}
                    className="group bg-white/[0.07] backdrop-blur-sm border border-white/10 rounded-2xl overflow-hidden hover:bg-white/[0.12] hover:-translate-y-1 hover:shadow-2xl hover:shadow-black/30 transition-all duration-300 cursor-pointer"
                  >
                    <div className="aspect-square overflow-hidden bg-white/5 relative">
                      <img
                        src={p.images?.[0] || '/placeholder.png'}
                        alt={p.name}
                        loading="lazy"
                        decoding="async"
                        className="w-full h-full object-cover group-hover:scale-110 transition-transform duration-500"
                      />
                      {/* Category badge */}
                      <div className="absolute top-2 left-2">
                        <span className="bg-black/60 backdrop-blur-sm text-white/90 text-[9px] font-bold px-2 py-1 rounded-md uppercase tracking-wider">
                          {language === 'ar' && p.categoryNameAr ? p.categoryNameAr : p.categoryName}
                        </span>
                      </div>
                    </div>
                    <div className="p-3 sm:p-4">
                      <h4
                        className="font-bold text-white text-xs sm:text-sm line-clamp-2 mb-2 group-hover:text-[#D4A843] transition-colors"
                        style={{ fontFamily: 'Outfit, sans-serif' }}
                      >
                        {language === 'ar' && p.nameAr ? p.nameAr : p.name}
                      </h4>
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-bold text-[#C8102E]">
                          {language === 'ar' ? 'حسب الطلب' : 'Sur demande'}
                        </span>
                        <span className="flex items-center gap-1">
                          <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                          <span className="text-[10px] text-emerald-400 font-medium">
                            {language === 'ar' ? 'متوفر' : 'En stock'}
                          </span>
                        </span>
                      </div>
                    </div>
                  </Link>
                ))}
              </div>

              {/* Mobile CTA */}
              <div className="sm:hidden mt-6 relative z-10">
                <Link
                  href={similarLink}
                  className="flex items-center justify-center gap-2 w-full py-3 rounded-xl text-sm font-semibold text-white border border-white/20 hover:bg-white hover:text-[#1A1A1A] transition-all cursor-pointer"
                >
                  {language === 'ar' ? 'عرض جميع المنتجات' : 'Voir tous les produits'}
                  <ChevronRight className="w-4 h-4" />
                </Link>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
