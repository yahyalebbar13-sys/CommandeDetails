"use client";
import React, { useState } from 'react';
import Link from 'next/link';
import { ShoppingCart, Heart, MessageCircle, Truck, RotateCcw, Shield, Star, ChevronRight, ChevronDown, Minus, Plus, Package, ArrowLeft, Sparkles, CheckCircle2, Layers, Ruler, Box, Wrench } from 'lucide-react';
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
    <Link href={`/shop/produit/${product.id}`} className="block bg-white border border-[#E8E4DF] rounded-2xl overflow-hidden hover:shadow-lg touch-manipulation">
      <div className="aspect-square overflow-hidden bg-gray-50 relative">
        <img src={product.images?.[0] || '/placeholder.png'} alt={product.name} loading="lazy" decoding="async" className="w-full h-full object-cover" />
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
  whatsappHref,
  onAdd,
  onVariantSelect,
}: {
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
}) {
  const { language } = useLanguage();
  const [qtys, setQtys] = useState<Record<string, number>>({});
  const [focusedVariantId, setFocusedVariantId] = useState<string>('');

  const safeVariants = React.useMemo(
    () => variants.map((v, i) => ({ ...v, _safeId: v.id ? `${v.id}-${i}` : `v-${i}` })),
    [variants]
  );

  // Model selection logic
  const uniqueModels = React.useMemo(() => {
    return Array.from(new Set(safeVariants.map(v => v.model?.trim()).filter(Boolean) as string[]));
  }, [safeVariants]);
  const hasModels = uniqueModels.length > 0;

  const [selectedModel, setSelectedModel] = useState<string>(() => (hasModels ? uniqueModels[0] : ''));

  // Active variants for currently selected model
  const activeVariantsForModel = React.useMemo(() => {
    if (!hasModels || !selectedModel) return safeVariants;
    const filtered = safeVariants.filter(v => (v.model?.trim() || '') === selectedModel);
    return filtered.length > 0 ? filtered : safeVariants;
  }, [safeVariants, hasModels, selectedModel]);

  // Size selection logic
  const uniqueSizes = React.useMemo(() => {
    return Array.from(new Set(activeVariantsForModel.map(v => v.size?.trim() || 'Standard')));
  }, [activeVariantsForModel]);
  const hasSizes = uniqueSizes.length > 1 || (uniqueSizes.length === 1 && uniqueSizes[0] !== 'Standard');

  const [selectedSize, setSelectedSize] = useState<string>(() => (uniqueSizes[0] || 'Standard'));

  // Keep selectedSize in sync with available sizes of current model
  React.useEffect(() => {
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

  // Initial sync on mount
  React.useEffect(() => {
    const initialVariant = activeVariantsForModel.find(v => (v.size?.trim() || 'Standard') === selectedSize) || activeVariantsForModel[0] || null;
    if (initialVariant) {
      setFocusedVariantId(initialVariant._safeId);
      onVariantSelect?.(initialVariant, initialVariant.size || selectedSize || 'Standard');
    }
  }, []);

  // Visible variants for current model + size
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

  return (
    <div className="p-3.5 sm:p-4 rounded-2xl bg-white border border-[#E8E4DF] shadow-xs space-y-3.5 mb-4">
      {/* ── Model Selector (When product has multiple models) ── */}
      {hasModels && (
        <div className="space-y-1.5">
          <div className="flex items-center justify-between text-xs">
            <span className="font-black uppercase tracking-wider text-[11px] text-gray-700 flex items-center gap-1.5">
              <Layers className="w-3.5 h-3.5 text-[#C8102E]" />
              {language === 'ar' ? '1. الموديل' : '1. Modèle'}
            </span>
            <span className="font-bold text-xs text-[#C8102E]">
              {selectedModel}
            </span>
          </div>

          <div className="flex flex-wrap gap-1.5">
            {uniqueModels.map(mod => {
              const isCurrent = mod === selectedModel;
              const modVars = safeVariants.filter(v => (v.model?.trim() || '') === mod);
              const totalStock = modVars.reduce((s, v) => s + v.stock, 0);

              return (
                <button
                  key={mod}
                  type="button"
                  onClick={() => handleSelectModel(mod)}
                  className={`px-3 py-1.5 rounded-xl font-bold text-xs transition-all cursor-pointer flex items-center gap-1.5 ${
                    isCurrent
                      ? 'bg-[#1A1A1A] text-white shadow-xs scale-[1.02]'
                      : 'bg-[#FBF8F3] border border-[#E8E4DF] text-gray-700 hover:border-gray-400 hover:bg-white'
                  }`}
                >
                  <span>{mod}</span>
                  {totalStock > 0 ? (
                    <span className={`text-[9px] px-1.5 py-0.5 rounded-md font-bold ${isCurrent ? 'bg-white/20 text-white' : 'bg-emerald-50 text-emerald-700'}`}>
                      {totalStock} {language === 'ar' ? 'متاح' : 'dispo'}
                    </span>
                  ) : (
                    <span className={`text-[9px] px-1.5 py-0.5 rounded-md font-bold ${isCurrent ? 'bg-white/20 text-white' : 'bg-amber-50 text-amber-700'}`}>
                      {language === 'ar' ? 'حسب الطلب' : 'Sur demande'}
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        </div>
      )}

      {hasModels && (hasSizes || visibleVariants.length > 0) && (
        <hr className="border-gray-100" />
      )}

      {/* ── Size Selector (When product has sizes) ── */}
      {hasSizes && (
        <div className="space-y-1.5">
          <div className="flex items-center justify-between text-xs">
            <span className="font-black uppercase tracking-wider text-[11px] text-gray-700 flex items-center gap-1.5">
              <Ruler className="w-3.5 h-3.5 text-[#D4A843]" />
              {language === 'ar' ? 'المقاس / الحجم' : 'Taille / Dimension'}
            </span>
            <span className="font-bold text-xs text-[#C8102E]">
              {selectedSize && selectedSize !== 'Standard' ? selectedSize : ''}
            </span>
          </div>

          <div className="flex flex-wrap gap-1.5">
            {uniqueSizes.map(sz => {
              const isCurrent = sz === selectedSize;
              const sizeVars = activeVariantsForModel.filter(v => (v.size?.trim() || 'Standard') === sz);
              const totalStock = sizeVars.reduce((s, v) => s + v.stock, 0);

              return (
                <button
                  key={sz}
                  type="button"
                  onClick={() => handleSelectSize(sz)}
                  className={`px-3 py-1.5 rounded-xl font-bold text-xs transition-all cursor-pointer flex items-center gap-1.5 ${
                    isCurrent
                      ? 'bg-[#C8102E] text-white shadow-xs ring-2 ring-[#C8102E]/20 scale-[1.02]'
                      : 'bg-[#FBF8F3] border border-[#E8E4DF] text-gray-800 hover:border-[#C8102E] hover:bg-white'
                  }`}
                >
                  <span>{sz}</span>
                  {totalStock > 0 ? (
                    <span className={`text-[9px] px-1.5 py-0.5 rounded-md font-bold ${isCurrent ? 'bg-white/20 text-white' : 'bg-emerald-50 text-emerald-700'}`}>
                      {totalStock}
                    </span>
                  ) : (
                    <span className={`text-[9px] px-1.5 py-0.5 rounded-md font-bold ${isCurrent ? 'bg-white/20 text-white' : 'bg-gray-100 text-gray-500'}`}>
                      {language === 'ar' ? 'طلب' : 'Demande'}
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        </div>
      )}

      {hasSizes && visibleVariants.length > 0 && (
        <hr className="border-gray-100" />
      )}

      {/* ── Colors / Variants & Quantities ── */}
      {(() => {
        const displayVariants = visibleVariants;
        if (displayVariants.length === 0) {
          return (
            <p className="text-xs text-gray-500 italic py-2">
              {language === 'ar' ? 'لا توجد خيارات متاحة لهذا التحديد.' : 'Aucune variante disponible pour cette option.'}
            </p>
          );
        }

        const isSimpleSize = displayVariants.length === 1 && (!displayVariants[0]?.color || displayVariants[0]?.color?.startsWith('Option')) && !displayVariants[0]?.image;

        if (isSimpleSize) {
          const v = displayVariants[0];
          const qty = qtys[v._safeId] || 0;
          return (
            <div className="flex items-center justify-between py-1">
              <div>
                <p className="text-xs font-bold text-gray-800">
                  {language === 'ar' ? 'الكمية المطلوبة' : 'Quantité souhaitée'}
                </p>
                <p className="text-[11px] text-gray-400 font-medium">
                  {v.stock > 0 ? `${v.stock} ${language === 'ar' ? 'متوفر' : 'en stock'}` : (language === 'ar' ? 'متوفر عند الطلب' : 'Disponible sur commande')}
                </p>
              </div>
              <div className="flex items-center gap-2 bg-[#FBF8F3] border border-[#E8E4DF] rounded-xl px-2 py-1 shadow-2xs">
                <button
                  type="button"
                  onClick={() => setQty(v._safeId, -1, v.stock)}
                  className="w-7 h-7 rounded-lg flex items-center justify-center text-gray-600 hover:text-[#C8102E] hover:bg-white cursor-pointer transition-colors"
                >
                  <Minus className="w-3.5 h-3.5" />
                </button>
                <span className="w-6 text-center font-black text-sm text-[#C8102E]">{qty}</span>
                <button
                  type="button"
                  onClick={() => setQty(v._safeId, 1, v.stock)}
                  disabled={v.stock > 0 && qty >= v.stock}
                  className="w-7 h-7 rounded-lg flex items-center justify-center text-gray-600 hover:text-[#C8102E] hover:bg-white disabled:opacity-30 cursor-pointer transition-colors"
                >
                  <Plus className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
          );
        }

        return (
          <div className="space-y-2">
            <div className="flex items-center justify-between text-xs">
              <span className="font-black uppercase tracking-wider text-[11px] text-gray-700 flex items-center gap-1.5">
                <Sparkles className="w-3.5 h-3.5 text-[#C8102E]" />
                {hasModels || hasSizes
                  ? (language === 'ar' ? 'الألوان & الكميات' : 'Couleurs & Quantités')
                  : (language === 'ar' ? 'اختر اللون والكمية' : 'Couleurs & Quantités')}
              </span>
              <span className="text-[11px] font-semibold text-gray-500">
                {displayVariants.length} {language === 'ar' ? 'خيارات' : `variante${displayVariants.length > 1 ? 's' : ''}`}
              </span>
            </div>

            <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 gap-2">
              {displayVariants.map(v => {
                const outOfStock = v.stock === 0;
                const qty = qtys[v._safeId] || 0;
                const isSelected = qty > 0;
                const colorLabel = v.color && !v.color.startsWith('Option') ? (language === 'ar' && v.colorAr ? v.colorAr : v.color) : '';
                const isFocused = focusedVariantId === v._safeId;

                return (
                  <div
                    key={v._safeId}
                    className={`relative flex flex-col items-center rounded-xl p-2 border touch-manipulation cursor-pointer transition-all duration-150 ${
                      isSelected
                        ? 'border-[#C8102E] bg-red-50/40 shadow-xs scale-[1.02]'
                        : isFocused
                          ? 'border-[#C8102E]/60 bg-amber-50/30'
                          : 'border-[#E8E4DF] bg-white hover:border-gray-400'
                    }`}
                    onClick={() => {
                      handleFocusVariant(v);
                      if (!isSelected) {
                        setQty(v._safeId, 1, v.stock);
                      }
                    }}
                  >
                    {isSelected && (
                      <div className="absolute -top-1 -right-1 w-4 h-4 rounded-full bg-[#C8102E] border border-white flex items-center justify-center text-white text-[8px] font-black shadow-xs z-10">
                        ✓
                      </div>
                    )}

                    {v.image ? (
                      <div className="w-12 h-12 sm:w-14 sm:h-14 rounded-lg overflow-hidden border border-gray-100 mb-1">
                        <img src={v.image} alt={v.color || 'Design'} loading="lazy" decoding="async" className="w-full h-full object-cover" />
                      </div>
                    ) : (
                      <div
                        className={`w-9 h-9 sm:w-10 sm:h-10 rounded-full border mb-1 ${isSelected ? 'border-[#C8102E] ring-2 ring-[#C8102E]/20' : 'border-gray-200'}`}
                        style={{ background: v.colorHex || '#ccc' }}
                      />
                    )}

                    {colorLabel && (
                      <p className={`text-[10px] font-bold text-center leading-tight truncate w-full ${isSelected ? 'text-[#C8102E]' : 'text-gray-700'}`}>
                        {colorLabel}
                      </p>
                    )}

                    <p className={`text-[9px] mt-0.5 ${outOfStock ? 'text-amber-600 font-medium' : 'text-gray-400'}`}>
                      {outOfStock ? (language === 'ar' ? 'طلب' : 'Cde') : `${v.stock} ${language === 'ar' ? 'متوفر' : 'dispo'}`}
                    </p>

                    {isSelected && (
                      <div className="flex items-center gap-1 mt-1.5 bg-white border border-gray-200 rounded-full px-1 py-0.5 shadow-2xs">
                        <button
                          type="button"
                          onClick={(e) => { e.stopPropagation(); setQty(v._safeId, -1, v.stock); }}
                          className="w-5 h-5 rounded-full flex items-center justify-center text-gray-500 hover:text-[#C8102E] hover:bg-red-50 cursor-pointer touch-manipulation"
                        >
                          <Minus className="w-3 h-3" />
                        </button>
                        <span className="w-4 text-center text-xs font-black text-[#C8102E]">{qty}</span>
                        <button
                          type="button"
                          onClick={(e) => { e.stopPropagation(); setQty(v._safeId, 1, v.stock); }}
                          disabled={v.stock > 0 && qty >= v.stock}
                          className="w-5 h-5 rounded-full flex items-center justify-center text-gray-500 hover:text-[#C8102E] hover:bg-red-50 disabled:opacity-30 cursor-pointer touch-manipulation"
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
        );
      })()}

      {/* Total summary bar */}
      {totalAllQty > 0 && (
        <div className="flex items-center justify-between px-3.5 py-2 bg-red-50 border border-[#C8102E]/20 rounded-xl text-xs">
          <p className="font-bold text-gray-800">
            <span className="font-black text-[#C8102E]">{totalAllQty}</span>{' '}
            {language === 'ar' ? 'قطعة محددة للطلب' : `article${totalAllQty > 1 ? 's' : ''} sélectionné${totalAllQty > 1 ? 's' : ''}`}
          </p>
          <p className="font-black text-[#C8102E]">{language === 'ar' ? 'حسب الطلب' : 'Sur demande'}</p>
        </div>
      )}

      {/* Action Buttons Row: Add to Cart + WhatsApp */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 pt-1">
        <button
          type="button"
          onClick={handleAddSelectedToCart}
          disabled={totalAllQty === 0}
          className={`col-span-2 py-3 rounded-xl font-bold text-xs sm:text-sm flex items-center justify-center gap-2 touch-manipulation transition-all duration-150 ${
            totalAllQty === 0
              ? 'bg-gray-100 text-gray-400 cursor-not-allowed'
              : 'bg-[#C8102E] hover:bg-[#a00d25] text-white shadow-md shadow-[#C8102E]/20 cursor-pointer active:scale-[0.99]'
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
            className="col-span-1 py-3 rounded-xl font-bold text-xs flex items-center justify-center gap-1.5 bg-[#25D366] hover:bg-[#1da851] text-white transition-colors cursor-pointer"
          >
            <MessageCircle className="w-4 h-4" />
            {language === 'ar' ? 'واتساب' : 'WhatsApp'}
          </a>
        )}
      </div>
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
  const [activeVariant, setActiveVariant] = React.useState<ProductVariant | null>(null);
  const [activeSize, setActiveSize] = React.useState<string>('');
  const [qty, setQty] = React.useState(1);
  const [mainImg, setMainImg] = React.useState(0);
  const [wished, setWished] = React.useState(false);
  const [added, setAdded] = React.useState(false);
  const [similar, setSimilar] = React.useState<typeof products>([]);
  const [discover, setDiscover] = React.useState<typeof products>([]);

  React.useEffect(() => {
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

  React.useEffect(() => {
    if (!product || products.length === 0) return;
    // Same category
    const sameCategory = products
      .filter(p => p.categorySlug === product.categorySlug && p.id !== product.id)
      .sort(() => 0.5 - Math.random())
      .slice(0, 4);
    setSimilar(sameCategory);
    // Other categories
    const otherCategories = products
      .filter(p => p.categorySlug !== product.categorySlug && p.id !== product.id)
      .sort(() => 0.5 - Math.random())
      .slice(0, 4);
    setDiscover(otherCategories);
  }, [product?.id, products]);

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

  const currentVariant = activeVariant || (activeSize ? product.variants?.find(v => (v.size || 'Standard') === activeSize) : null);

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

            {/* ── Price, Stock & Selected Option ── */}
            <div className="flex flex-wrap items-center gap-2.5 mb-3.5">
              <span className="text-xl sm:text-2xl font-black text-[#C8102E]">
                {language === 'ar' ? 'حسب الطلب' : 'Sur demande'}
              </span>

              <span className="w-1.5 h-1.5 rounded-full bg-gray-300" />

              <div className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-bold ${inStock ? 'bg-emerald-50 text-[#10B981]' : 'bg-red-50 text-red-600'}`}>
                <span className={`w-1.5 h-1.5 rounded-full ${inStock ? 'bg-[#10B981]' : 'bg-red-500'}`} />
                {inStock
                  ? currentVariant
                    ? (language === 'ar'
                        ? (currentVariant.stock > 0 ? `${currentVariant.stock} متوفر` : 'غير متوفر')
                        : (currentVariant.stock > 0 ? `${currentVariant.stock} en stock` : 'Rupture'))
                    : hasVariants
                      ? (language === 'ar' ? `${product.variants.reduce((s, v) => s + v.stock, 0)} متوفر` : `${product.variants.reduce((s, v) => s + v.stock, 0)} disponibles`)
                      : (language === 'ar' ? `متوفر (${stock})` : `En stock (${stock})`)
                  : (language === 'ar' ? 'نفد المخزون' : 'Rupture de stock')}
              </div>

              {currentVariant && (currentVariant.model || (currentVariant.size && currentVariant.size !== 'Standard') || (currentVariant.color && !currentVariant.color.startsWith('Option'))) && (
                <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-amber-50 border border-amber-200/80 text-xs font-bold text-amber-900 animate-in fade-in duration-200">
                  <Sparkles className="w-3 h-3 text-[#D4A843] flex-shrink-0" />
                  <span>
                    {currentVariant.model ? `Modèle ${currentVariant.model}` : ''}
                    {currentVariant.model && currentVariant.size && currentVariant.size !== 'Standard' ? ' · ' : ''}
                    {currentVariant.size && currentVariant.size !== 'Standard' ? `Taille ${currentVariant.size}` : ''}
                    {currentVariant.color && !currentVariant.color.startsWith('Option') ? ` · ${currentVariant.color}` : ''}
                  </span>
                </div>
              )}
            </div>

            {/* ── Spécifications & Informations Détaillées (À la place de la description courte) ── */}
            {activeSpecs.length > 0 && (
              <div className="mb-4 bg-white/90 border border-[#E8E4DF] rounded-xl p-3 shadow-2xs">
                <div className="flex items-center justify-between pb-1.5 mb-2 border-b border-gray-100">
                  <span className="text-[11px] font-black uppercase tracking-wider text-gray-500 flex items-center gap-1.5">
                    <Sparkles className="w-3 h-3 text-[#D4A843]" />
                    {language === 'ar' ? 'المواصفات الفنية' : 'Spécifications techniques'}
                  </span>
                  {(currentVariant?.model || (currentVariant?.size && currentVariant?.size !== 'Standard')) && (
                    <span className="text-[10px] font-bold text-[#C8102E] bg-red-50 px-2 py-0.5 rounded-md border border-red-100">
                      {currentVariant.model ? currentVariant.model : ''}
                      {currentVariant.model && currentVariant.size && currentVariant.size !== 'Standard' ? ' · ' : ''}
                      {currentVariant.size && currentVariant.size !== 'Standard' ? currentVariant.size : ''}
                    </span>
                  )}
                </div>

                <div className="grid grid-cols-2 sm:grid-cols-3 gap-x-3 gap-y-1.5 text-xs">
                  {activeSpecs.map((spec, i) => (
                    <div key={i} className="flex items-baseline justify-between border-b border-gray-50 pb-0.5 gap-2">
                      <span className="text-gray-400 text-[11px] font-medium truncate">{spec.label}</span>
                      <span className="font-bold text-[#1A1A1A] text-[11px] text-right truncate">{spec.value}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

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
              <div className="p-3.5 sm:p-4 rounded-2xl bg-white border border-[#E8E4DF] shadow-xs space-y-3.5 mb-4">
                {inStock && (
                  <div className="flex items-center justify-between">
                    <p className="text-xs font-bold text-gray-800">{language === 'ar' ? 'الكمية' : 'Quantité'}</p>
                    <div className="flex items-center gap-2 bg-[#FBF8F3] border border-[#E8E4DF] rounded-xl px-2 py-1 shadow-2xs">
                      <button onClick={() => setQty(q => Math.max(product.minOrderQty || 1, q - 1))}
                        className="w-7 h-7 rounded-lg flex items-center justify-center text-gray-600 hover:text-[#C8102E] hover:bg-white cursor-pointer transition-colors">
                        <Minus className="w-3.5 h-3.5" />
                      </button>
                      <span className="w-6 text-center font-black text-sm text-[#C8102E]">{qty}</span>
                      <button onClick={() => setQty(q => Math.min(stock, q + 1))}
                        className="w-7 h-7 rounded-lg flex items-center justify-center text-gray-600 hover:text-[#C8102E] hover:bg-white cursor-pointer transition-colors">
                        <Plus className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                )}
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 pt-1">
                  <button onClick={handleAddToCart} disabled={!inStock}
                    className={`col-span-2 py-3 rounded-xl font-bold text-xs sm:text-sm flex items-center justify-center gap-2 transition-all cursor-pointer ${
                      !inStock ? 'bg-gray-100 text-gray-400 cursor-not-allowed'
                      : added ? 'bg-[#10B981] text-white'
                      : 'bg-[#C8102E] hover:bg-[#a00d25] text-white shadow-md shadow-[#C8102E]/20 active:scale-[0.99]'
                    }`}>
                    <ShoppingCart className="w-4 h-4" />
                    {added ? (language === 'ar' ? 'تمت الإضافة للسلة' : '✓ Ajouté au panier !') : inStock ? (language === 'ar' ? 'إضافة للسلة' : 'Ajouter au panier') : (language === 'ar' ? 'نفد' : 'Rupture de stock')}
                  </button>

                  <a href={buildWhatsAppLink(product.id, currentPrice * qty, product.name)} target="_blank" rel="noopener noreferrer"
                    className="col-span-1 py-3 rounded-xl font-bold text-xs flex items-center justify-center gap-1.5 bg-[#25D366] hover:bg-[#1da851] text-white transition-colors cursor-pointer">
                    <MessageCircle className="w-4 h-4" /> {language === 'ar' ? 'واتساب' : 'WhatsApp'}
                  </a>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* ── Informations Complémentaires (Hyper Pro longs textes) ── */}
        {(effectiveApplications || effectiveAvantages || effectiveConseilsEntretien || effectiveInfoCommerciale) && (
          <div className="mt-10 mb-12">
            <Accordion title={language === 'ar' ? 'تفاصيل ومعلومات إضافية' : 'Détails & Applications'} icon={<Shield className="w-5 h-5 text-[#8B5CF6]" />} defaultOpen={true}>
              <div className="p-6 space-y-5 text-sm">
                {effectiveApplications && (
                  <div className="border-b border-[#F3EFE8] pb-4">
                    <span className="font-bold text-[#1A1A1A] block mb-2">{language === 'ar' ? 'التطبيقات (قطاعات/استخدامات):' : 'Applications (Secteurs/Usages):'}</span>
                    <p className="text-[#6B6B6B] whitespace-pre-line leading-relaxed">{effectiveApplications}</p>
                  </div>
                )}
                {effectiveAvantages && (
                  <div className="border-b border-[#F3EFE8] pb-4">
                    <span className="font-bold text-[#1A1A1A] block mb-2">{language === 'ar' ? 'المميزات:' : 'Avantages:'}</span>
                    <p className="text-[#6B6B6B] whitespace-pre-line leading-relaxed">{effectiveAvantages}</p>
                  </div>
                )}
                {effectiveConseilsEntretien && (
                  <div className="border-b border-[#F3EFE8] pb-4">
                    <span className="font-bold text-[#1A1A1A] block mb-2">{language === 'ar' ? 'نصائح العناية:' : "Conseils d'entretien:"}</span>
                    <p className="text-[#6B6B6B] whitespace-pre-line leading-relaxed">{effectiveConseilsEntretien}</p>
                  </div>
                )}
                {effectiveInfoCommerciale && (
                  <div className="pb-2">
                    <span className="font-bold text-[#1A1A1A] block mb-2">{language === 'ar' ? 'معلومات تجارية (تعبئة، حد أدنى):' : 'Infos commerciales (Conditionnement, MOQ...):'}</span>
                    <p className="text-[#6B6B6B] whitespace-pre-line leading-relaxed">{effectiveInfoCommerciale}</p>
                  </div>
                )}
              </div>
            </Accordion>
          </div>
        )}

        {/* ── Section 1 : Vous aimerez aussi (même catégorie) ── */}
        {similar.length > 0 && (
          <div className="mt-12">
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-xl sm:text-2xl font-black text-[#1A1A1A]" style={{ fontFamily: 'Outfit, sans-serif' }}>
                {language === 'ar' ? 'قد يعجبك أيضاً' : 'Vous aimerez aussi'}
              </h2>
              <Link href={`/shop/categorie/${product.categorySlug}`}
                className="text-sm text-[#C8102E] font-semibold hover:underline cursor-pointer">
                {language === 'ar' ? 'عرض الكل →' : 'Voir tout →'}
              </Link>
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3 sm:gap-4">
              {similar.map(p => <SimilarProductCard key={p.id} product={p} />)}
            </div>
          </div>
        )}

        {/* ── Section 2 : Découvrez plus (autres catégories) ── */}
        {discover.length > 0 && (
          <div className="mt-14">
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-xl sm:text-2xl font-black text-[#1A1A1A]" style={{ fontFamily: 'Outfit, sans-serif' }}>
                {language === 'ar' ? 'اكتشف المزيد' : 'Découvrez plus'}
              </h2>
              <Link href="/shop/boutique"
                className="text-sm text-[#C8102E] font-semibold hover:underline cursor-pointer">
                {language === 'ar' ? 'تصفح الكل →' : 'Tout parcourir →'}
              </Link>
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3 sm:gap-4">
              {discover.map(p => <SimilarProductCard key={p.id} product={p} />)}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
