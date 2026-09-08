"use client";
import React, { useState, useMemo, useEffect } from 'react';
import Link from 'next/link';
import { 
  ShoppingCart, 
  Heart, 
  MessageCircle, 
  Truck, 
  ShieldCheck, 
  Sparkles, 
  ChevronRight, 
  Minus, 
  Plus, 
  ArrowLeft, 
  Layers, 
  Ruler, 
  Check, 
  FileText, 
  PackageCheck
} from 'lucide-react';
import { formatPrice, getDiscountPercent, buildWhatsAppLink } from '@/lib/shop-utils';
import { useShopCartActions } from '@/contexts/shop-cart-context';
import { useShopProducts } from '@/contexts/shop-products-context';
import { useLanguage } from '@/contexts/language-context';
import { db } from '@/lib/firebase-db';
import { doc, getDoc } from 'firebase/firestore';
import type { CartItem, ProductVariant, ShopProduct } from '@/lib/shop-types';

// ─── Similar Product Card ──────────────────────────────────────────────────
function ModernProductCard({ product }: { product: ShopProduct }) {
  const { language } = useLanguage();
  return (
    <Link 
      href={`/shop/produit/${product.id}`} 
      className="group flex flex-col bg-white rounded-2xl border border-neutral-200/80 overflow-hidden hover:border-neutral-900/30 hover:shadow-md transition-all duration-300 touch-manipulation"
    >
      <div className="aspect-square bg-neutral-50 overflow-hidden relative">
        <img 
          src={product.images?.[0] || '/placeholder.png'} 
          alt={product.name} 
          loading="lazy" 
          decoding="async" 
          className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500" 
        />
        {product.isNew && (
          <span className="absolute top-2.5 left-2.5 bg-emerald-600 text-white text-[10px] font-black uppercase tracking-wider px-2 py-0.5 rounded-full shadow-xs">
            {language === 'ar' ? 'جديد' : 'Nouveau'}
          </span>
        )}
      </div>
      <div className="p-3.5 flex flex-col flex-1 justify-between">
        <div>
          <p className="text-[11px] font-bold uppercase tracking-wider text-neutral-400 mb-1 truncate">
            {language === 'ar' && product.categoryNameAr ? product.categoryNameAr : product.categoryName}
          </p>
          <h4 
            className="font-bold text-neutral-900 text-sm line-clamp-2 mb-2 leading-snug group-hover:text-[#C8102E] transition-colors" 
            style={{ fontFamily: 'Outfit, sans-serif' }}
          >
            {language === 'ar' && product.nameAr ? product.nameAr : product.name}
          </h4>
        </div>
        <div className="flex items-center justify-between pt-1 border-t border-neutral-100 mt-2">
          <span className="text-xs font-black text-[#C8102E]">
            {language === 'ar' ? 'حسب الطلب' : 'Sur demande'}
          </span>
          <span className="text-[11px] font-semibold text-neutral-400 group-hover:text-neutral-900 group-hover:translate-x-0.5 transition-all">
            {language === 'ar' ? '← التفاصيل' : 'Détails →'}
          </span>
        </div>
      </div>
    </Link>
  );
}

// ─── Multi-Variant Configurator ──────────────────────────────────────────────
interface MultiVariantSelectorProps {
  variants: ProductVariant[];
  basePrice: number;
  productId: string;
  productName: string;
  productNameAr?: string;
  productImage: string;
  wholesalePrice?: number;
  minOrderQty?: number;
  whatsappHref?: string;
  onAdd: (items: CartItem[]) => void;
  onVariantSelect?: (variant: ProductVariant | null, size: string) => void;
}

function MultiVariantSelector({
  variants,
  basePrice,
  productId,
  productName,
  productNameAr,
  productImage,
  wholesalePrice,
  minOrderQty,
  whatsappHref,
  onAdd,
  onVariantSelect,
}: MultiVariantSelectorProps) {
  const { language } = useLanguage();
  const [qtys, setQtys] = useState<Record<string, number>>({});
  const [focusedVariantId, setFocusedVariantId] = useState<string>('');

  const safeVariants = useMemo(
    () => variants.map((v, i) => ({ ...v, _safeId: v.id ? `${v.id}-${i}` : `v-${i}` })),
    [variants]
  );

  // Unique models list
  const uniqueModels = useMemo(() => {
    return Array.from(new Set(safeVariants.map(v => v.model?.trim()).filter(Boolean) as string[]));
  }, [safeVariants]);
  const hasModels = uniqueModels.length > 0;

  const [selectedModel, setSelectedModel] = useState<string>(() => (hasModels ? uniqueModels[0] : ''));

  // Variants active for the selected model
  const activeVariantsForModel = useMemo(() => {
    if (!hasModels || !selectedModel) return safeVariants;
    const filtered = safeVariants.filter(v => (v.model?.trim() || '') === selectedModel);
    return filtered.length > 0 ? filtered : safeVariants;
  }, [safeVariants, hasModels, selectedModel]);

  // Unique sizes list for this model
  const uniqueSizes = useMemo(() => {
    return Array.from(new Set(activeVariantsForModel.map(v => v.size?.trim() || 'Standard')));
  }, [activeVariantsForModel]);
  const hasSizes = uniqueSizes.length > 1 || (uniqueSizes.length === 1 && uniqueSizes[0] !== 'Standard');

  const [selectedSize, setSelectedSize] = useState<string>(() => (uniqueSizes[0] || 'Standard'));

  // Synchronize size if current size isn't available in new model
  useEffect(() => {
    if (uniqueSizes.length > 0 && (!selectedSize || !uniqueSizes.includes(selectedSize))) {
      const nextSz = uniqueSizes[0];
      setSelectedSize(nextSz);
      const v = activeVariantsForModel.find(x => (x.size?.trim() || 'Standard') === nextSz) || activeVariantsForModel[0] || null;
      if (v) {
        setFocusedVariantId(v._safeId);
        onVariantSelect?.(v, nextSz);
      }
    }
  }, [uniqueSizes, selectedSize, activeVariantsForModel, onVariantSelect]);

  // Initial synchronization on mount
  useEffect(() => {
    const initialVariant = activeVariantsForModel.find(v => (v.size?.trim() || 'Standard') === selectedSize) || activeVariantsForModel[0] || null;
    if (initialVariant) {
      setFocusedVariantId(initialVariant._safeId);
      onVariantSelect?.(initialVariant, initialVariant.size || selectedSize || 'Standard');
    }
  }, []);

  // Visible variants (matching current model + current size)
  const visibleVariants = activeVariantsForModel.filter(v => {
    if (hasSizes && selectedSize && selectedSize !== 'Standard') {
      return (v.size?.trim() || 'Standard') === selectedSize;
    }
    return true;
  });

  const handleSelectModel = (mod: string) => {
    setSelectedModel(mod);
    const modVars = safeVariants.filter(v => (v.model?.trim() || '') === mod);
    const modSizes = Array.from(new Set(modVars.map(v => v.size?.trim() || 'Standard')));
    const nextSize = (selectedSize && modSizes.includes(selectedSize)) ? selectedSize : (modSizes[0] || 'Standard');
    setSelectedSize(nextSize);
    const firstOfModelSize = modVars.find(v => (v.size?.trim() || 'Standard') === nextSize) || modVars[0] || null;
    if (firstOfModelSize) {
      setFocusedVariantId(firstOfModelSize._safeId);
    }
    onVariantSelect?.(firstOfModelSize, nextSize);
  };

  const handleSelectSize = (sz: string) => {
    setSelectedSize(sz);
    const firstOfSize = activeVariantsForModel.find(v => (v.size?.trim() || 'Standard') === sz) || null;
    if (firstOfSize) {
      setFocusedVariantId(firstOfSize._safeId);
    }
    onVariantSelect?.(firstOfSize, sz);
  };

  const handleFocusVariant = (v: (typeof safeVariants)[0]) => {
    setFocusedVariantId(v._safeId);
    onVariantSelect?.(v, v.size || selectedSize || 'Standard');
  };

  const setQty = (variantId: string, delta: number, max: number | undefined) => {
    setQtys(prev => {
      const current = prev[variantId] || 0;
      const safeMax = (typeof max === 'number' && !isNaN(max)) ? max : 999999;
      const next = Math.max(0, Math.min(safeMax, current + delta));
      return { ...prev, [variantId]: next };
    });
  };

  const totalAllQty = Object.values(qtys).reduce((s, q) => s + q, 0);

  const handleAddSelectedToCart = () => {
    const items: CartItem[] = [];
    safeVariants.forEach(v => {
      const q = qtys[v._safeId] || 0;
      if (q > 0) {
        items.push({
          productId,
          productName,
          productNameAr: productNameAr || undefined,
          productImage: v.image || productImage,
          price: v.price ?? basePrice,
          originalPrice: v.price ?? basePrice,
          wholesalePrice,
          minOrderQty,
          quantity: q,
          variant: {
            color: v.color,
            colorAr: v.colorAr,
            colorHex: v.colorHex,
            model: v.model,
            modelAr: v.modelAr,
            size: v.size,
            sizeAr: v.sizeAr,
            variantId: v.id,
          },
          maxStock: v.stock,
        });
      }
    });

    if (items.length === 0) return;
    onAdd(items);
    setQtys({});
  };

  const isSimpleSize = visibleVariants.length === 1 && (!visibleVariants[0]?.color || visibleVariants[0]?.color?.startsWith('Option')) && !visibleVariants[0]?.image;

  return (
    <div className="space-y-4 pt-1">
      {/* ── 1. Model Selector ── */}
      {hasModels && (
        <div>
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-bold uppercase tracking-wider text-neutral-500 flex items-center gap-1.5">
              <Layers className="w-3.5 h-3.5 text-neutral-700" />
              {language === 'ar' ? 'الموديل :' : 'Modèle :'}
            </span>
            <span className="text-xs font-bold text-neutral-900">
              {selectedModel}
            </span>
          </div>
          <div className="flex flex-wrap gap-2">
            {uniqueModels.map(mod => {
              const isCurrent = mod === selectedModel;
              const modVars = safeVariants.filter(v => (v.model?.trim() || '') === mod);
              const totalStock = modVars.reduce((s, v) => s + v.stock, 0);

              return (
                <button
                  key={mod}
                  type="button"
                  onClick={() => handleSelectModel(mod)}
                  className={`px-3.5 py-2 rounded-xl text-xs font-bold transition-all cursor-pointer flex items-center gap-2 ${
                    isCurrent
                      ? 'bg-neutral-900 text-white shadow-sm ring-1 ring-neutral-900 scale-[1.01]'
                      : 'bg-neutral-50 text-neutral-700 border border-neutral-200/80 hover:bg-white hover:border-neutral-400'
                  }`}
                >
                  <span>{mod}</span>
                  {totalStock > 0 ? (
                    <span className={`text-[10px] px-1.5 py-0.5 rounded font-semibold ${isCurrent ? 'bg-white/20 text-white' : 'bg-emerald-50 text-emerald-700'}`}>
                      {totalStock}
                    </span>
                  ) : (
                    <span className={`text-[10px] px-1.5 py-0.5 rounded font-semibold ${isCurrent ? 'bg-white/20 text-white' : 'bg-neutral-200 text-neutral-500'}`}>
                      {language === 'ar' ? 'طلب' : 'Cde'}
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* ── 2. Size Selector ── */}
      {hasSizes && (
        <div>
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-bold uppercase tracking-wider text-neutral-500 flex items-center gap-1.5">
              <Ruler className="w-3.5 h-3.5 text-[#C8102E]" />
              {language === 'ar' ? 'المقاس / الحجم :' : 'Taille / Dimension :'}
            </span>
            <span className="text-xs font-bold text-[#C8102E]">
              {selectedSize && selectedSize !== 'Standard' ? selectedSize : ''}
            </span>
          </div>
          <div className="flex flex-wrap gap-2">
            {uniqueSizes.map(sz => {
              const isCurrent = sz === selectedSize;
              const sizeVars = activeVariantsForModel.filter(v => (v.size?.trim() || 'Standard') === sz);
              const totalStock = sizeVars.reduce((s, v) => s + v.stock, 0);

              return (
                <button
                  key={sz}
                  type="button"
                  onClick={() => handleSelectSize(sz)}
                  className={`px-4 py-2 rounded-xl text-xs font-bold transition-all cursor-pointer flex items-center gap-2 ${
                    isCurrent
                      ? 'bg-[#C8102E] text-white shadow-sm ring-2 ring-[#C8102E]/25 scale-[1.01]'
                      : 'bg-white text-neutral-800 border border-neutral-200/90 hover:border-[#C8102E] hover:text-[#C8102E]'
                  }`}
                >
                  <span>{sz}</span>
                  {totalStock > 0 ? (
                    <span className={`text-[10px] px-1.5 py-0.5 rounded font-semibold ${isCurrent ? 'bg-white/20 text-white' : 'bg-neutral-100 text-neutral-600'}`}>
                      {totalStock}
                    </span>
                  ) : (
                    <span className={`text-[10px] px-1.5 py-0.5 rounded font-semibold ${isCurrent ? 'bg-white/20 text-white' : 'bg-neutral-100 text-neutral-400'}`}>
                      {language === 'ar' ? 'طلب' : 'Cde'}
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* ── 3. Color & Quantity Selector ── */}
      {isSimpleSize ? (
        (() => {
          const v = visibleVariants[0];
          const qty = qtys[v._safeId] || 0;
          return (
            <div className="flex items-center justify-between p-3.5 rounded-2xl bg-neutral-50/80 border border-neutral-200/70">
              <div>
                <p className="text-xs font-bold text-neutral-900">
                  {language === 'ar' ? 'الكمية المطلوبة' : 'Quantité à commander'}
                </p>
                <p className="text-[11px] text-neutral-500 mt-0.5">
                  {v.stock > 0 
                    ? `${v.stock} ${language === 'ar' ? 'متوفر بالمخزن' : 'en stock'}` 
                    : (language === 'ar' ? 'متوفر عند الطلب' : 'Disponible sur commande')}
                </p>
              </div>
              <div className="flex items-center gap-2 bg-white border border-neutral-200 rounded-xl px-2 py-1 shadow-2xs">
                <button
                  type="button"
                  onClick={() => setQty(v._safeId, -1, v.stock)}
                  className="w-8 h-8 rounded-lg flex items-center justify-center text-neutral-600 hover:text-[#C8102E] hover:bg-neutral-50 cursor-pointer transition-colors"
                >
                  <Minus className="w-3.5 h-3.5" />
                </button>
                <span className="w-7 text-center font-black text-sm text-[#C8102E]">{qty}</span>
                <button
                  type="button"
                  onClick={() => setQty(v._safeId, 1, v.stock)}
                  disabled={v.stock > 0 && qty >= v.stock}
                  className="w-8 h-8 rounded-lg flex items-center justify-center text-neutral-600 hover:text-[#C8102E] hover:bg-neutral-50 disabled:opacity-30 cursor-pointer transition-colors"
                >
                  <Plus className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
          );
        })()
      ) : (
        <div>
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-bold uppercase tracking-wider text-neutral-500 flex items-center gap-1.5">
              <Sparkles className="w-3.5 h-3.5 text-amber-500" />
              {language === 'ar' ? 'الخيارات والألوان :' : 'Couleurs & Variantes :'}
            </span>
            <span className="text-xs font-semibold text-neutral-500">
              {visibleVariants.length} {language === 'ar' ? 'خيارات' : `variante${visibleVariants.length > 1 ? 's' : ''}`}
            </span>
          </div>

          <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 gap-2">
            {visibleVariants.map(v => {
              const qty = qtys[v._safeId] || 0;
              const isSelected = qty > 0;
              const isFocused = focusedVariantId === v._safeId;
              const colorLabel = v.color && !v.color.startsWith('Option') 
                ? (language === 'ar' && v.colorAr ? v.colorAr : v.color) 
                : '';

              return (
                <div
                  key={v._safeId}
                  onClick={() => {
                    handleFocusVariant(v);
                    if (!isSelected) {
                      setQty(v._safeId, 1, v.stock);
                    }
                  }}
                  className={`relative flex flex-col items-center p-2.5 rounded-2xl border transition-all cursor-pointer select-none ${
                    isSelected
                      ? 'border-[#C8102E] bg-rose-50/40 shadow-xs ring-1 ring-[#C8102E]'
                      : isFocused
                        ? 'border-neutral-900 bg-neutral-50/50'
                        : 'border-neutral-200 bg-white hover:border-neutral-400'
                  }`}
                >
                  {isSelected && (
                    <div className="absolute top-1.5 right-1.5 w-4 h-4 rounded-full bg-[#C8102E] text-white flex items-center justify-center text-[9px] font-bold shadow-xs">
                      <Check className="w-2.5 h-2.5" />
                    </div>
                  )}

                  {v.image ? (
                    <div className="w-12 h-12 rounded-xl overflow-hidden border border-neutral-100 mb-1.5 bg-neutral-50">
                      <img src={v.image} alt={v.color || 'Option'} loading="lazy" decoding="async" className="w-full h-full object-cover" />
                    </div>
                  ) : (
                    <div
                      className={`w-9 h-9 rounded-full border mb-1.5 shadow-2xs ${isSelected ? 'ring-2 ring-[#C8102E]/30' : 'border-neutral-200'}`}
                      style={{ background: v.colorHex || '#d1d5db' }}
                    />
                  )}

                  {colorLabel && (
                    <p className={`text-[11px] font-bold text-center leading-tight truncate w-full ${isSelected ? 'text-[#C8102E]' : 'text-neutral-800'}`}>
                      {colorLabel}
                    </p>
                  )}

                  <p className="text-[9px] text-neutral-400 mt-0.5">
                    {v.stock > 0 ? `${v.stock} dispo` : (language === 'ar' ? 'طلب' : 'Sur cde')}
                  </p>

                  {isSelected && (
                    <div className="flex items-center gap-1 mt-2 bg-white border border-neutral-200 rounded-full px-1.5 py-0.5 shadow-2xs">
                      <button
                        type="button"
                        onClick={(e) => { e.stopPropagation(); setQty(v._safeId, -1, v.stock); }}
                        className="w-5 h-5 rounded-full flex items-center justify-center text-neutral-500 hover:text-[#C8102E] hover:bg-rose-50 cursor-pointer"
                      >
                        <Minus className="w-3 h-3" />
                      </button>
                      <span className="w-4 text-center text-xs font-black text-[#C8102E]">{qty}</span>
                      <button
                        type="button"
                        onClick={(e) => { e.stopPropagation(); setQty(v._safeId, 1, v.stock); }}
                        disabled={v.stock > 0 && qty >= v.stock}
                        className="w-5 h-5 rounded-full flex items-center justify-center text-neutral-500 hover:text-[#C8102E] hover:bg-rose-50 disabled:opacity-30 cursor-pointer"
                      >
                        <Plus className="w-3 h-3" />
                      </button>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* ── Summary Indicator ── */}
      {totalAllQty > 0 && (
        <div className="flex items-center justify-between px-4 py-2.5 bg-neutral-900 text-white rounded-xl text-xs">
          <span className="font-semibold">
            {totalAllQty} {language === 'ar' ? 'قطعة محددة' : `article${totalAllQty > 1 ? 's' : ''} sélectionné${totalAllQty > 1 ? 's' : ''}`}
          </span>
          <span className="font-black text-[#FFD700]">
            {language === 'ar' ? 'حسب الطلب' : 'Sur demande'}
          </span>
        </div>
      )}

      {/* ── Action Buttons ── */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5 pt-1">
        <button
          type="button"
          onClick={handleAddSelectedToCart}
          disabled={totalAllQty === 0}
          className={`col-span-2 py-3.5 rounded-2xl font-bold text-sm flex items-center justify-center gap-2 transition-all cursor-pointer ${
            totalAllQty === 0
              ? 'bg-neutral-100 text-neutral-400 cursor-not-allowed'
              : 'bg-[#C8102E] hover:bg-[#a00d25] text-white shadow-lg shadow-[#C8102E]/20 active:scale-[0.99]'
          }`}
        >
          <ShoppingCart className="w-4 h-4" />
          {totalAllQty === 0
            ? (language === 'ar' ? 'اختر الكمية للمتابعة' : 'Sélectionnez une quantité')
            : (language === 'ar' ? `إضافة للسلة (${totalAllQty})` : `Ajouter au panier (${totalAllQty})`)}
        </button>

        {whatsappHref && (
          <a
            href={whatsappHref}
            target="_blank"
            rel="noopener noreferrer"
            className="col-span-1 py-3.5 rounded-2xl font-bold text-xs sm:text-sm flex items-center justify-center gap-1.5 bg-[#25D366] hover:bg-[#1da851] text-white transition-all shadow-sm active:scale-[0.99] cursor-pointer"
          >
            <MessageCircle className="w-4 h-4" />
            {language === 'ar' ? 'واتساب' : 'WhatsApp'}
          </a>
        )}
      </div>
    </div>
  );
}

// ─── Main Product Page Component ─────────────────────────────────────────────
export default function ProductPage({ params }: { params: Promise<{ id: string }> }) {
  const { language } = useLanguage();
  const { id } = React.use(params);
  const { addItem, addItems, openCart } = useShopCartActions();
  const { products, getProductById: ctxGetById, isLoading } = useShopProducts();

  const [directProduct, setDirectProduct] = useState<any>(null);
  const [directLoading, setDirectLoading] = useState(false);
  const [directDone, setDirectDone] = useState(false);

  const product = ctxGetById(id) || directProduct;

  useEffect(() => {
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

  const [selectedVariant, setSelectedVariant] = useState<ProductVariant | null>(null);
  const [activeVariant, setActiveVariant] = useState<ProductVariant | null>(null);
  const [activeSize, setActiveSize] = useState<string>('');
  const [qty, setQty] = useState(1);
  const [mainImg, setMainImg] = useState(0);
  const [wished, setWished] = useState(false);
  const [added, setAdded] = useState(false);
  const [similar, setSimilar] = useState<ShopProduct[]>([]);
  const [discover, setDiscover] = useState<ShopProduct[]>([]);
  const [activeTab, setActiveTab] = useState<'specs' | 'applications' | 'entretien' | 'commercial'>('specs');

  useEffect(() => {
    setMainImg(0);
    setSelectedVariant(null);
    setActiveVariant(null);
    setActiveSize('');
    setAdded(false);
    if (product?.variants?.[0]) {
      setSelectedVariant(product.variants[0]);
      setActiveVariant(product.variants[0]);
      if (product.variants[0].size) setActiveSize(product.variants[0].size);
    }
    if (product?.minOrderQty) setQty(product.minOrderQty);
    else setQty(1);
  }, [product?.id]);

  useEffect(() => {
    if (!product || products.length === 0) return;
    const sameCategory = products
      .filter(p => p.categorySlug === product.categorySlug && p.id !== product.id)
      .sort(() => 0.5 - Math.random())
      .slice(0, 4);
    setSimilar(sameCategory);

    const otherCategories = products
      .filter(p => p.categorySlug !== product.categorySlug && p.id !== product.id)
      .sort(() => 0.5 - Math.random())
      .slice(0, 4);
    setDiscover(otherCategories);
  }, [product?.id, products]);

  if (isLoading || directLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-white">
        <div className="text-center">
          <div className="w-10 h-10 border-3 border-[#C8102E] border-t-transparent rounded-full animate-spin mx-auto mb-3" />
          <p className="text-neutral-500 text-xs font-semibold">{language === 'ar' ? 'جاري التحميل...' : 'Chargement du produit…'}</p>
        </div>
      </div>
    );
  }

  if (!product) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-white" style={{ fontFamily: 'Inter, sans-serif' }}>
        <div className="text-center max-w-sm px-4">
          <div className="w-16 h-16 rounded-full bg-neutral-100 flex items-center justify-center mx-auto mb-4 text-2xl">
            🔍
          </div>
          <h1 className="text-xl font-bold text-neutral-900 mb-2" style={{ fontFamily: 'Outfit, sans-serif' }}>
            {language === 'ar' ? 'المنتج غير موجود' : 'Produit introuvable'}
          </h1>
          <p className="text-neutral-500 text-xs mb-6">
            {language === 'ar' ? 'هذا المنتج غير متوفر أو تم حذفه.' : "Le produit demandé n'existe pas ou a été déplacé."}
          </p>
          <Link href="/shop/boutique" className="px-5 py-2.5 bg-neutral-900 text-white rounded-xl text-xs font-bold hover:bg-black transition-colors">
            {language === 'ar' ? 'العودة للمتجر' : 'Retour à la boutique'}
          </Link>
        </div>
      </div>
    );
  }

  const hasVariants = product.variants && product.variants.length > 0;
  const currentPrice = selectedVariant?.price || product.price;
  const stock = selectedVariant?.stock ?? product.stockQty;
  const inStock = hasVariants ? product.variants.some(v => v.stock > 0) : stock > 0;

  const currentVariant = activeVariant || (activeSize ? product.variants?.find(v => (v.size || 'Standard') === activeSize) : null);

  // ── Specific Characteristics Overrides ──
  const effectiveTypeProduit = currentVariant?.typeProduit || product.typeProduit;
  const effectiveMaterial = currentVariant?.material || currentVariant?.matiereMailles || product.matiereMailles || product.material;
  const effectiveWidth = currentVariant?.width || currentVariant?.largeurMaille || product.largeurMaille || product.width;
  const effectiveLength = currentVariant?.longueur || product.longueur;
  const effectiveWeight = currentVariant?.weight !== undefined ? currentVariant.weight : product.weight;
  const effectivePackaging = currentVariant?.packaging || product.packaging;
  const effectiveCompositionRuban = currentVariant?.compositionRuban || product.compositionRuban;
  const effectiveCondUnitaire = currentVariant?.conditionnementUnitaire || product.conditionnementUnitaire;
  const effectiveCondGros = currentVariant?.conditionnementGros || product.conditionnementGros;
  const effectiveResistance = currentVariant?.resistance || product.resistance;
  const effectiveCompatibleAvec = currentVariant?.compatibleAvec || product.compatibleAvec;
  const effectiveType = currentVariant?.type || product.type;
  const effectiveDesign = currentVariant?.design || product.design;
  const effectiveSecurite = currentVariant?.securite || product.securite;
  const effectiveApplications = currentVariant?.applications || product.applications;
  const effectiveAvantages = currentVariant?.avantages || product.avantages;
  const effectiveConseilsEntretien = currentVariant?.conseilsEntretien || product.conseilsEntretien;
  const effectiveInfoCommerciale = currentVariant?.informationCommerciale || product.informationCommerciale;

  const activeSpecs = [
    { label: language === 'ar' ? 'نوع المنتج' : 'Type produit', value: effectiveTypeProduit },
    { label: language === 'ar' ? 'المادة' : 'Matière', value: effectiveMaterial },
    { label: language === 'ar' ? 'العرض' : 'Largeur', value: effectiveWidth },
    { label: language === 'ar' ? 'الطول' : 'Longueur', value: effectiveLength },
    { label: language === 'ar' ? 'الوزن' : 'Poids', value: effectiveWeight !== undefined && effectiveWeight !== null && effectiveWeight !== '' ? `${effectiveWeight} g` : null },
    { label: language === 'ar' ? 'التعبئة' : 'Packaging', value: effectivePackaging },
    { label: language === 'ar' ? 'الشريط' : 'Ruban', value: effectiveCompositionRuban },
    { label: language === 'ar' ? 'تعبئة وحدة' : 'Cond. unité', value: effectiveCondUnitaire },
    { label: language === 'ar' ? 'تعبئة جملة' : 'Cond. gros', value: effectiveCondGros },
    { label: language === 'ar' ? 'المقاومة' : 'Résistance', value: effectiveResistance },
    { label: language === 'ar' ? 'متوافق مع' : 'Compatible', value: effectiveCompatibleAvec },
    { label: language === 'ar' ? 'النوع' : 'Type', value: effectiveType },
    { label: language === 'ar' ? 'التصميم' : 'Design', value: effectiveDesign },
    { label: language === 'ar' ? 'الأمان' : 'Sécurité', value: effectiveSecurite },
  ].filter(s => Boolean(s.value));

  const handleVariantSelect = (v: ProductVariant | null, size: string) => {
    setActiveVariant(v);
    setActiveSize(size);
    if (v?.image && product.images) {
      const idx = product.images.findIndex(img => img === v.image);
      if (idx !== -1) setMainImg(idx);
    }
  };

  const handleAddToCart = () => {
    addItem({
      productId: product.id,
      productName: product.name,
      productNameAr: product.nameAr,
      productImage: product.images?.[0] || '',
      price: currentPrice,
      originalPrice: product.price,
      wholesalePrice: product.wholesalePrice,
      minOrderQty: product.minOrderQty,
      quantity: qty,
      variant: selectedVariant ? { 
        color: selectedVariant.color, 
        colorAr: selectedVariant.colorAr, 
        colorHex: selectedVariant.colorHex,
        model: selectedVariant.model,
        modelAr: selectedVariant.modelAr,
        size: selectedVariant.size, 
        sizeAr: selectedVariant.sizeAr, 
        variantId: selectedVariant.id 
      } : undefined,
      maxStock: stock,
    });
    setAdded(true);
    setTimeout(() => { setAdded(false); openCart(); }, 1200);
  };

  const handleAddVariantsToCart = (items: CartItem[]) => {
    addItems(items);
    setAdded(true);
    setTimeout(() => { setAdded(false); openCart(); }, 1200);
  };

  return (
    <div className="min-h-screen bg-white text-neutral-900" style={{ fontFamily: 'Inter, sans-serif' }}>
      {/* Toast Notification */}
      {added && (
        <div className="fixed top-6 left-1/2 -translate-x-1/2 z-50 bg-neutral-900 text-white px-5 py-2.5 rounded-full font-bold text-xs shadow-xl flex items-center gap-2 animate-in fade-in slide-in-from-top-4 duration-200">
          <span className="w-2 h-2 rounded-full bg-emerald-400" />
          {language === 'ar' ? 'تمت الإضافة للسلة بنجاح !' : 'Produit ajouté au panier !'}
        </div>
      )}

      {/* ── Breadcrumb & Top Bar ── */}
      <div className="border-b border-neutral-100 bg-neutral-50/50">
        <div className="max-w-7xl mx-auto px-4 py-3 flex items-center justify-between text-xs text-neutral-500">
          <div className="flex items-center gap-2 overflow-x-auto no-scrollbar">
            <button 
              onClick={() => window.history.back()} 
              aria-label="Retour" 
              className="w-7 h-7 rounded-full bg-white border border-neutral-200 flex items-center justify-center text-neutral-600 hover:text-neutral-900 hover:border-neutral-400 transition-colors flex-shrink-0 cursor-pointer"
            >
              <ArrowLeft className="w-3.5 h-3.5" />
            </button>
            <Link href="/shop" className="hover:text-neutral-900 transition-colors whitespace-nowrap">{language === 'ar' ? 'الرئيسية' : 'Accueil'}</Link>
            <ChevronRight className="w-3 h-3 text-neutral-300 flex-shrink-0" />
            <Link href="/shop/categories" className="hover:text-neutral-900 transition-colors whitespace-nowrap">{language === 'ar' ? 'المتجر' : 'Boutique'}</Link>
            <ChevronRight className="w-3 h-3 text-neutral-300 flex-shrink-0" />
            <Link href={`/shop/categorie/${product.categorySlug}`} className="hover:text-neutral-900 transition-colors whitespace-nowrap font-medium text-neutral-700">
              {language === 'ar' && product.categoryNameAr ? product.categoryNameAr : product.categoryName}
            </Link>
          </div>

          <div className="hidden sm:flex items-center gap-3">
            <button 
              onClick={() => setWished(!wished)} 
              aria-label="Favoris"
              className={`p-1.5 rounded-full border transition-colors cursor-pointer ${wished ? 'bg-rose-50 border-rose-200 text-[#C8102E]' : 'border-neutral-200 text-neutral-400 hover:text-neutral-900 hover:bg-white'}`}
            >
              <Heart className={`w-4 h-4 ${wished ? 'fill-current' : ''}`} />
            </button>
          </div>
        </div>
      </div>

      {/* ── Main Product Section ── */}
      <div className="max-w-7xl mx-auto px-4 py-6 md:py-10">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 lg:gap-12" dir={language === 'ar' ? 'rtl' : 'ltr'}>
          
          {/* Left Column: Gallery */}
          <div className="lg:col-span-6">
            <div className="lg:sticky lg:top-24 space-y-3">
              <div className="relative aspect-square rounded-3xl overflow-hidden bg-neutral-50 border border-neutral-200/80 shadow-xs group">
                <img 
                  src={product.images?.[mainImg] || product.images?.[0] || '/placeholder.png'} 
                  alt={product.name} 
                  loading="eager" 
                  decoding="async" 
                  className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500" 
                />
                
                <div className="absolute top-4 left-4 flex flex-col gap-1.5 pointer-events-none">
                  {product.isNew && (
                    <span className="bg-emerald-600 text-white text-[10px] font-black uppercase tracking-wider px-2.5 py-1 rounded-full shadow-xs">
                      {language === 'ar' ? 'جديد' : 'Nouveau'}
                    </span>
                  )}
                </div>

                <button 
                  onClick={() => setWished(!wished)} 
                  aria-label="Ajouter aux favoris"
                  className="sm:hidden absolute top-4 right-4 w-9 h-9 rounded-full bg-white/90 backdrop-blur-xs flex items-center justify-center text-neutral-600 shadow-sm cursor-pointer"
                >
                  <Heart className={`w-4 h-4 ${wished ? 'fill-[#C8102E] text-[#C8102E]' : ''}`} />
                </button>
              </div>

              {/* Thumbnails */}
              {product.images && product.images.length > 1 && (
                <div className="flex gap-2.5 overflow-x-auto pb-1 no-scrollbar">
                  {product.images.map((img, i) => (
                    <button
                      key={i}
                      onClick={() => setMainImg(i)}
                      className={`w-16 h-16 sm:w-18 sm:h-18 rounded-2xl overflow-hidden border-2 transition-all flex-shrink-0 cursor-pointer ${
                        mainImg === i ? 'border-neutral-900 ring-2 ring-neutral-900/10' : 'border-neutral-200 hover:border-neutral-400 opacity-70 hover:opacity-100'
                      }`}
                    >
                      <img src={img} alt="" loading="lazy" decoding="async" className="w-full h-full object-cover" />
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Right Column: Information & Actions */}
          <div className="lg:col-span-6 flex flex-col justify-between">
            <div>
              {/* Category */}
              <Link 
                href={`/shop/categorie/${product.categorySlug}`}
                className="text-xs font-bold uppercase tracking-widest text-[#C8102E] hover:underline mb-1.5 inline-block"
              >
                {language === 'ar' && product.categoryNameAr ? product.categoryNameAr : product.categoryName}
              </Link>

              {/* Product Title */}
              <h1 
                className="text-2xl sm:text-3xl lg:text-4xl font-black text-neutral-900 tracking-tight leading-tight mb-3" 
                style={{ fontFamily: 'Outfit, sans-serif' }}
              >
                {language === 'ar' && product.nameAr ? product.nameAr : product.name}
              </h1>

              {/* Price & Stock Header */}
              <div className="flex flex-wrap items-center gap-3 pb-4 mb-4 border-b border-neutral-100">
                <span className="text-2xl sm:text-3xl font-black text-[#C8102E]">
                  {language === 'ar' ? 'حسب الطلب' : 'Sur demande'}
                </span>

                <div className="h-4 w-px bg-neutral-200 hidden sm:block" />

                <div className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold ${
                  inStock ? 'bg-emerald-50 text-emerald-700' : 'bg-rose-50 text-rose-700'
                }`}>
                  <span className={`w-2 h-2 rounded-full ${inStock ? 'bg-emerald-500 animate-pulse' : 'bg-rose-500'}`} />
                  {inStock 
                    ? (currentVariant?.stock ? `${currentVariant.stock} en stock` : (language === 'ar' ? 'متوفر' : 'En stock')) 
                    : (language === 'ar' ? 'نفد المخزون' : 'Rupture')}
                </div>

                {/* Active variant indicator badge */}
                {currentVariant && (currentVariant.model || (currentVariant.size && currentVariant.size !== 'Standard')) && (
                  <div className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-neutral-100 text-neutral-800 text-[11px] font-bold">
                    <span>{currentVariant.model ? currentVariant.model : ''}</span>
                    {currentVariant.model && currentVariant.size && currentVariant.size !== 'Standard' && <span>·</span>}
                    <span>{currentVariant.size && currentVariant.size !== 'Standard' ? currentVariant.size : ''}</span>
                  </div>
                )}
              </div>

              {/* ── Variant Selectors & Buying Controls ── */}
              {hasVariants ? (
                <MultiVariantSelector
                  variants={product.variants}
                  basePrice={product.price}
                  productId={product.id}
                  productName={product.name}
                  productNameAr={product.nameAr}
                  productImage={product.images?.[0] || ''}
                  wholesalePrice={product.wholesalePrice}
                  minOrderQty={product.minOrderQty}
                  whatsappHref={buildWhatsAppLink(product.id, product.price, product.name)}
                  onAdd={handleAddVariantsToCart}
                  onVariantSelect={handleVariantSelect}
                />
              ) : (
                <div className="space-y-4 pt-1">
                  {inStock && (
                    <div className="flex items-center justify-between p-3.5 rounded-2xl bg-neutral-50/80 border border-neutral-200/70">
                      <div>
                        <p className="text-xs font-bold text-neutral-900">{language === 'ar' ? 'الكمية' : 'Quantité'}</p>
                        <p className="text-[11px] text-neutral-500">{stock} {language === 'ar' ? 'متوفر' : 'en stock'}</p>
                      </div>
                      <div className="flex items-center gap-2 bg-white border border-neutral-200 rounded-xl px-2 py-1 shadow-2xs">
                        <button 
                          onClick={() => setQty(q => Math.max(product.minOrderQty || 1, q - 1))}
                          className="w-8 h-8 rounded-lg flex items-center justify-center text-neutral-600 hover:text-[#C8102E] hover:bg-neutral-50 cursor-pointer transition-colors"
                        >
                          <Minus className="w-3.5 h-3.5" />
                        </button>
                        <span className="w-7 text-center font-black text-sm text-[#C8102E]">{qty}</span>
                        <button 
                          onClick={() => setQty(q => Math.min(stock, q + 1))}
                          className="w-8 h-8 rounded-lg flex items-center justify-center text-neutral-600 hover:text-[#C8102E] hover:bg-neutral-50 cursor-pointer transition-colors"
                        >
                          <Plus className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                  )}

                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
                    <button 
                      onClick={handleAddToCart} 
                      disabled={!inStock}
                      className={`col-span-2 py-3.5 rounded-2xl font-bold text-sm flex items-center justify-center gap-2 transition-all cursor-pointer ${
                        !inStock 
                          ? 'bg-neutral-100 text-neutral-400 cursor-not-allowed'
                          : 'bg-[#C8102E] hover:bg-[#a00d25] text-white shadow-lg shadow-[#C8102E]/20 active:scale-[0.99]'
                      }`}
                    >
                      <ShoppingCart className="w-4 h-4" />
                      {added 
                        ? (language === 'ar' ? 'تمت الإضافة للسلة' : '✓ Ajouté au panier !') 
                        : inStock 
                          ? (language === 'ar' ? 'إضافة للسلة' : 'Ajouter au panier') 
                          : (language === 'ar' ? 'نفد' : 'Rupture de stock')}
                    </button>

                    <a 
                      href={buildWhatsAppLink(product.id, currentPrice * qty, product.name)} 
                      target="_blank" 
                      rel="noopener noreferrer"
                      className="col-span-1 py-3.5 rounded-2xl font-bold text-xs sm:text-sm flex items-center justify-center gap-1.5 bg-[#25D366] hover:bg-[#1da851] text-white transition-all shadow-sm active:scale-[0.99] cursor-pointer"
                    >
                      <MessageCircle className="w-4 h-4" /> 
                      {language === 'ar' ? 'واتساب' : 'WhatsApp'}
                    </a>
                  </div>
                </div>
              )}

              {/* ── Reassurance Micro-Banner ── */}
              <div className="grid grid-cols-3 gap-2 py-4 my-4 border-y border-neutral-100 text-center">
                <div className="flex flex-col items-center">
                  <Truck className="w-4 h-4 text-neutral-700 mb-1" />
                  <span className="text-[11px] font-bold text-neutral-900">{language === 'ar' ? 'توصيل سريع' : 'Livraison express'}</span>
                  <span className="text-[10px] text-neutral-400">{language === 'ar' ? 'كل المغرب' : 'Partout au Maroc'}</span>
                </div>
                <div className="flex flex-col items-center border-x border-neutral-100">
                  <ShieldCheck className="w-4 h-4 text-emerald-600 mb-1" />
                  <span className="text-[11px] font-bold text-neutral-900">{language === 'ar' ? 'جودة مضمونة' : 'Qualité garantie'}</span>
                  <span className="text-[10px] text-neutral-400">{language === 'ar' ? 'معايير صناعية' : 'Certifié pro'}</span>
                </div>
                <div className="flex flex-col items-center">
                  <PackageCheck className="w-4 h-4 text-[#C8102E] mb-1" />
                  <span className="text-[11px] font-bold text-neutral-900">{language === 'ar' ? 'تعبئة مخصصة' : 'Vente en gros'}</span>
                  <span className="text-[10px] text-neutral-400">{language === 'ar' ? 'أسعار تفضيلية' : 'Sur mesure'}</span>
                </div>
              </div>

              {/* ── Dynamic Technical Specifications (Changes live with model/size) ── */}
              {activeSpecs.length > 0 && (
                <div className="mt-4 p-4 rounded-2xl bg-neutral-50/80 border border-neutral-200/80">
                  <div className="flex items-center justify-between pb-2 mb-2.5 border-b border-neutral-200/60">
                    <span className="text-[11px] font-black uppercase tracking-wider text-neutral-700 flex items-center gap-1.5">
                      <FileText className="w-3.5 h-3.5 text-neutral-500" />
                      {language === 'ar' ? 'المواصفات الفنية المباشرة' : 'Spécifications techniques'}
                    </span>
                    {(currentVariant?.model || (currentVariant?.size && currentVariant?.size !== 'Standard')) && (
                      <span className="text-[10px] font-bold text-[#C8102E] bg-rose-50 px-2 py-0.5 rounded-md border border-rose-100">
                        {currentVariant.model ? currentVariant.model : ''}
                        {currentVariant.model && currentVariant.size && currentVariant.size !== 'Standard' ? ' · ' : ''}
                        {currentVariant.size && currentVariant.size !== 'Standard' ? currentVariant.size : ''}
                      </span>
                    )}
                  </div>

                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-x-3 gap-y-1.5 text-xs">
                    {activeSpecs.map((spec, i) => (
                      <div key={i} className="flex items-baseline justify-between border-b border-neutral-200/40 pb-1 gap-2">
                        <span className="text-neutral-500 text-[11px] font-medium truncate">{spec.label}</span>
                        <span className="font-bold text-neutral-900 text-[11px] text-right truncate">{spec.value}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* ── Detailed Technical Information & Documentation Tabs ── */}
        {(effectiveApplications || effectiveAvantages || effectiveConseilsEntretien || effectiveInfoCommerciale) && (
          <div className="mt-14 pt-8 border-t border-neutral-200">
            <div className="flex flex-wrap items-center gap-2 mb-6 border-b border-neutral-100 pb-3">
              {effectiveApplications && (
                <button
                  type="button"
                  onClick={() => setActiveTab('applications')}
                  className={`px-4 py-2 rounded-xl font-bold text-xs cursor-pointer transition-all ${
                    activeTab === 'applications'
                      ? 'bg-neutral-900 text-white shadow-xs'
                      : 'bg-neutral-100 text-neutral-600 hover:bg-neutral-200'
                  }`}
                >
                  {language === 'ar' ? 'التطبيقات والاستخدامات' : 'Applications & Secteurs'}
                </button>
              )}
              {effectiveAvantages && (
                <button
                  type="button"
                  onClick={() => setActiveTab('specs')}
                  className={`px-4 py-2 rounded-xl font-bold text-xs cursor-pointer transition-all ${
                    activeTab === 'specs'
                      ? 'bg-neutral-900 text-white shadow-xs'
                      : 'bg-neutral-100 text-neutral-600 hover:bg-neutral-200'
                  }`}
                >
                  {language === 'ar' ? 'المميزات' : 'Avantages clés'}
                </button>
              )}
              {effectiveConseilsEntretien && (
                <button
                  type="button"
                  onClick={() => setActiveTab('entretien')}
                  className={`px-4 py-2 rounded-xl font-bold text-xs cursor-pointer transition-all ${
                    activeTab === 'entretien'
                      ? 'bg-neutral-900 text-white shadow-xs'
                      : 'bg-neutral-100 text-neutral-600 hover:bg-neutral-200'
                  }`}
                >
                  {language === 'ar' ? 'إرشادات العناية' : "Conseils d'entretien"}
                </button>
              )}
              {effectiveInfoCommerciale && (
                <button
                  type="button"
                  onClick={() => setActiveTab('commercial')}
                  className={`px-4 py-2 rounded-xl font-bold text-xs cursor-pointer transition-all ${
                    activeTab === 'commercial'
                      ? 'bg-neutral-900 text-white shadow-xs'
                      : 'bg-neutral-100 text-neutral-600 hover:bg-neutral-200'
                  }`}
                >
                  {language === 'ar' ? 'معلومات تجارية' : 'Infos commerciales & Gros'}
                </button>
              )}
            </div>

            <div className="p-6 rounded-3xl bg-neutral-50/60 border border-neutral-200/80">
              {activeTab === 'applications' && effectiveApplications && (
                <div className="space-y-2">
                  <h3 className="text-sm font-bold text-neutral-900 mb-1" style={{ fontFamily: 'Outfit, sans-serif' }}>
                    {language === 'ar' ? 'القطاعات والاستخدامات الموصى بها :' : 'Secteurs d’activité et usages recommandés :'}
                  </h3>
                  <p className="text-neutral-600 text-sm whitespace-pre-line leading-relaxed">
                    {effectiveApplications}
                  </p>
                </div>
              )}

              {activeTab === 'specs' && effectiveAvantages && (
                <div className="space-y-2">
                  <h3 className="text-sm font-bold text-neutral-900 mb-1" style={{ fontFamily: 'Outfit, sans-serif' }}>
                    {language === 'ar' ? 'أبرز مميزات هذا المنتج :' : 'Points forts et atouts techniques :'}
                  </h3>
                  <p className="text-neutral-600 text-sm whitespace-pre-line leading-relaxed">
                    {effectiveAvantages}
                  </p>
                </div>
              )}

              {activeTab === 'entretien' && effectiveConseilsEntretien && (
                <div className="space-y-2">
                  <h3 className="text-sm font-bold text-neutral-900 mb-1" style={{ fontFamily: 'Outfit, sans-serif' }}>
                    {language === 'ar' ? 'نصائح العناية والاستخدام :' : "Conseils d'utilisation et d'entretien :"}
                  </h3>
                  <p className="text-neutral-600 text-sm whitespace-pre-line leading-relaxed">
                    {effectiveConseilsEntretien}
                  </p>
                </div>
              )}

              {activeTab === 'commercial' && effectiveInfoCommerciale && (
                <div className="space-y-2">
                  <h3 className="text-sm font-bold text-neutral-900 mb-1" style={{ fontFamily: 'Outfit, sans-serif' }}>
                    {language === 'ar' ? 'شروط التعبئة والطلبات بالجملة :' : 'Informations commerciales, conditionnement & MOQ :'}
                  </h3>
                  <p className="text-neutral-600 text-sm whitespace-pre-line leading-relaxed">
                    {effectiveInfoCommerciale}
                  </p>
                </div>
              )}
            </div>
          </div>
        )}

        {/* ── Similar Products ── */}
        {similar.length > 0 && (
          <div className="mt-16">
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-xl sm:text-2xl font-black text-neutral-900" style={{ fontFamily: 'Outfit, sans-serif' }}>
                {language === 'ar' ? 'منتجات مماثلة' : 'Vous aimerez aussi'}
              </h2>
              <Link 
                href={`/shop/categorie/${product.categorySlug}`}
                className="text-xs font-bold text-[#C8102E] hover:underline cursor-pointer"
              >
                {language === 'ar' ? 'عرض المزيد ←' : 'Voir tout →'}
              </Link>
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
              {similar.map(p => (
                <ModernProductCard key={p.id} product={p} />
              ))}
            </div>
          </div>
        )}

        {/* ── Discover More ── */}
        {discover.length > 0 && (
          <div className="mt-14">
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-xl sm:text-2xl font-black text-neutral-900" style={{ fontFamily: 'Outfit, sans-serif' }}>
                {language === 'ar' ? 'اكتشف المزيد' : 'Découvrez aussi'}
              </h2>
              <Link 
                href="/shop/boutique"
                className="text-xs font-bold text-[#C8102E] hover:underline cursor-pointer"
              >
                {language === 'ar' ? 'تصفح الكل ←' : 'Toute la boutique →'}
              </Link>
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
              {discover.map(p => (
                <ModernProductCard key={p.id} product={p} />
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
