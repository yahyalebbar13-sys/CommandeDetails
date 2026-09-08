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
  onVariantSelect?: (variant: ProductVariant | null, size: string) => void;
}) {
  const { language } = useLanguage();
  const { openCart } = useShopCartActions();
  const [qtys, setQtys] = useState<Record<string, number>>({});
  const [focusedVariantId, setFocusedVariantId] = useState<string>('');

  const safeVariants = React.useMemo(() => variants.map((v, i) => ({ ...v, _safeId: v.id ? `${v.id}-${i}` : `v-${i}` })), [variants]);

  // Model & Size selection logic
  const uniqueModels = Array.from(new Set(safeVariants.map(v => v.model?.trim()).filter(Boolean) as string[]));
  const hasModels = uniqueModels.length > 0;

  const [selectedModel, setSelectedModel] = useState<string>('');

  // Active variants for current model (or all if no model selected)
  const activeVariantsForModel = selectedModel
    ? safeVariants.filter(v => (v.model?.trim() || '') === selectedModel)
    : safeVariants;

  const uniqueSizes = Array.from(new Set(activeVariantsForModel.map(v => v.size?.trim() || 'Standard')));
  const hasSizes = uniqueSizes.length > 1 || (uniqueSizes.length === 1 && uniqueSizes[0] !== 'Standard');
  
  const [selectedSize, setSelectedSize] = useState<string>('');
  const [step, setStep] = useState<'choose_model' | 'choose_size' | 'choose_colors' | 'completed_size'>(
    hasModels ? 'choose_model' : hasSizes ? 'choose_size' : 'choose_colors'
  );
  const [lastAddedInfo, setLastAddedInfo] = useState<{ model?: string; size: string; count: number } | null>(null);

  const visibleVariants = activeVariantsForModel.filter(v => {
    if (selectedSize) {
      return (v.size?.trim() || 'Standard') === selectedSize;
    }
    return true;
  });

  const handleSelectModel = (mod: string) => {
    setSelectedModel(mod);
    const modVars = safeVariants.filter(v => (v.model?.trim() || '') === mod);
    const modSizes = Array.from(new Set(modVars.map(v => v.size?.trim() || 'Standard')));
    const modHasSizes = modSizes.length > 1 || (modSizes.length === 1 && modSizes[0] !== 'Standard');
    const firstOfModel = modVars[0] || null;
    if (firstOfModel) {
      setFocusedVariantId(firstOfModel._safeId);
    }
    if (modHasSizes) {
      setSelectedSize('');
      onVariantSelect?.(firstOfModel, '');
      setStep('choose_size');
    } else {
      const singleSz = modSizes[0] || 'Standard';
      setSelectedSize(singleSz);
      onVariantSelect?.(firstOfModel, singleSz);
      setStep('choose_colors');
    }
  };

  const handleSelectSize = (sz: string) => {
    setSelectedSize(sz);
    const firstOfSize = activeVariantsForModel.find(v => (v.size?.trim() || 'Standard') === sz) || null;
    if (firstOfSize) {
      setFocusedVariantId(firstOfSize._safeId);
    }
    onVariantSelect?.(firstOfSize, sz);
    setStep('choose_colors');
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

  const currentSizeQty = visibleVariants.reduce((s, v) => s + (qtys[v._safeId] || 0), 0);

  const handleAddCurrentSize = () => {
    const items: CartItem[] = [];
    visibleVariants.forEach(v => {
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
          variant: { 
            color: v.color, 
            colorAr: v.colorAr, 
            colorHex: v.colorHex, 
            model: v.model,
            modelAr: v.modelAr,
            size: v.size, 
            sizeAr: v.sizeAr, 
            variantId: v.id 
          },
          maxStock: v.stock,
        });
      }
    });

    if (items.length === 0) return;
    onAdd(items);

    const addedSizeName = selectedSize || 'Standard';
    const addedModelName = selectedModel || undefined;
    const addedCount = currentSizeQty;

    // Clear qtys for this size
    setQtys(prev => {
      const next = { ...prev };
      visibleVariants.forEach(v => { delete next[v._safeId]; });
      return next;
    });

    if (hasSizes || hasModels) {
      setLastAddedInfo({ model: addedModelName, size: addedSizeName, count: addedCount });
      setStep('completed_size');
    }
  };

  const handleStartAnother = () => {
    if (hasSizes) {
      setSelectedSize('');
      setFocusedVariantId('');
      setStep('choose_size');
    } else if (hasModels) {
      setSelectedModel('');
      setSelectedSize('');
      setFocusedVariantId('');
      setStep('choose_model');
    } else {
      setStep('choose_colors');
    }
  };

  return (
    <div className="mb-5">
      {/* ── Progress steps (only when product has models or sizes) ── */}
      {(hasModels || hasSizes) && (
        <div className="flex items-center justify-between mb-5 bg-white border border-[#E8E4DF] rounded-2xl p-3 shadow-xs">
          {hasModels && (
            <>
              <button
                onClick={() => setStep('choose_model')}
                className={`flex items-center gap-1.5 sm:gap-2 text-xs font-bold transition-colors cursor-pointer ${
                  step === 'choose_model' ? 'text-[#C8102E]' : 'text-gray-500 hover:text-[#1A1A1A]'
                }`}
              >
                <span className={`w-6 h-6 rounded-full flex items-center justify-center text-[11px] font-black ${
                  step === 'choose_model' ? 'bg-[#C8102E] text-white' : 'bg-gray-100 text-gray-600'
                }`}>1</span>
                <span>{language === 'ar' ? '1. الموديل' : '1. Modèle'}</span>
              </button>

              <ChevronRight className="w-3.5 h-3.5 text-gray-300" />
            </>
          )}

          {hasSizes && (
            <>
              <button
                onClick={() => { if (!hasModels || selectedModel) setStep('choose_size'); }}
                disabled={hasModels && !selectedModel}
                className={`flex items-center gap-1.5 sm:gap-2 text-xs font-bold transition-colors ${
                  step === 'choose_size'
                    ? 'text-[#C8102E]'
                    : (!hasModels || selectedModel)
                      ? 'text-gray-500 hover:text-[#1A1A1A] cursor-pointer'
                      : 'text-gray-300 cursor-not-allowed'
                }`}
              >
                <span className={`w-6 h-6 rounded-full flex items-center justify-center text-[11px] font-black ${
                  step === 'choose_size' ? 'bg-[#C8102E] text-white' : 'bg-gray-100 text-gray-600'
                }`}>{hasModels ? '2' : '1'}</span>
                <span>{language === 'ar' ? (hasModels ? '2. المقاس' : '1. المقاس') : (hasModels ? '2. Taille' : '1. Taille')}</span>
              </button>

              <ChevronRight className="w-3.5 h-3.5 text-gray-300" />
            </>
          )}

          <button
            onClick={() => {
              if ((!hasModels || selectedModel) && (!hasSizes || selectedSize)) {
                setStep('choose_colors');
              }
            }}
            disabled={(hasModels && !selectedModel) || (hasSizes && !selectedSize)}
            className={`flex items-center gap-1.5 sm:gap-2 text-xs font-bold transition-colors ${
              step === 'choose_colors'
                ? 'text-[#C8102E]'
                : ((!hasModels || selectedModel) && (!hasSizes || selectedSize))
                  ? 'text-gray-500 hover:text-[#1A1A1A] cursor-pointer'
                  : 'text-gray-300 cursor-not-allowed'
            }`}
          >
            <span className={`w-6 h-6 rounded-full flex items-center justify-center text-[11px] font-black ${
              step === 'choose_colors' ? 'bg-[#C8102E] text-white' : 'bg-gray-100 text-gray-400'
            }`}>{hasModels && hasSizes ? '3' : (hasModels || hasSizes) ? '2' : '1'}</span>
            <span>{language === 'ar' ? 'الألوان والكمية' : 'Couleurs & Qté'}</span>
          </button>

          <ChevronRight className="w-3.5 h-3.5 text-gray-300" />

          <div className={`flex items-center gap-1.5 sm:gap-2 text-xs font-bold ${
            step === 'completed_size' ? 'text-emerald-600' : 'text-gray-400'
          }`}>
            <span className={`w-6 h-6 rounded-full flex items-center justify-center text-[11px] font-black ${
              step === 'completed_size' ? 'bg-emerald-600 text-white' : 'bg-gray-100 text-gray-400'
            }`}>{hasModels && hasSizes ? '4' : (hasModels || hasSizes) ? '3' : '2'}</span>
            <span>{language === 'ar' ? 'تأكيد' : 'Validation'}</span>
          </div>
        </div>
      )}

      {/* ── STEP 1 (When models present) : Choose Model ── */}
      {step === 'choose_model' && hasModels && (
        <div className="space-y-3.5 animate-in fade-in duration-200">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-black text-[#1A1A1A]">
                {language === 'ar' ? 'الخطوة 1 : اختر الموديل للمتابعة' : 'Étape 1 : Choisissez un modèle'}
              </p>
              <p className="text-xs text-gray-500">
                {language === 'ar' ? 'لكل موديل مواصفاته، مقاساته وألوانه الخاصة' : 'Chaque modèle possède ses spécifications, tailles et coloris'}
              </p>
            </div>
            <span className="text-xs font-bold text-[#C8102E] bg-red-50 px-2.5 py-1 rounded-full border border-red-100">
              {uniqueModels.length} {language === 'ar' ? 'موديلات' : 'modèles'}
            </span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {uniqueModels.map(mod => {
              const modVars = safeVariants.filter(v => (v.model?.trim() || '') === mod);
              const totalStock = modVars.reduce((s, v) => s + v.stock, 0);
              const isOutOfStock = totalStock === 0;
              const modSizes = Array.from(new Set(modVars.map(v => v.size?.trim() || 'Standard'))).filter(s => s !== 'Standard');

              return (
                <button
                  key={mod}
                  onClick={() => handleSelectModel(mod)}
                  disabled={isOutOfStock}
                  className={`p-4 rounded-2xl border-2 text-left transition-all duration-200 cursor-pointer flex items-center justify-between group ${
                    isOutOfStock
                      ? 'opacity-40 border-gray-200 bg-gray-50 cursor-not-allowed'
                      : 'border-[#E8E4DF] bg-white hover:border-[#C8102E] hover:shadow-md hover:bg-red-50/10 active:scale-[0.99]'
                  }`}
                >
                  <div className="flex flex-col gap-1">
                    <span className="text-base font-black text-[#1A1A1A] group-hover:text-[#C8102E] transition-colors">
                      {mod}
                    </span>
                    <div className="flex items-center gap-2 text-xs text-gray-500">
                      {modSizes.length > 0 && (
                        <>
                          <span>{modSizes.length} taille{modSizes.length > 1 ? 's' : ''}</span>
                          <span>·</span>
                        </>
                      )}
                      <span>{modVars.length} option{modVars.length > 1 ? 's' : ''}</span>
                      <span>·</span>
                      <span className={`font-semibold ${isOutOfStock ? 'text-red-500' : 'text-emerald-600'}`}>
                        {isOutOfStock ? (language === 'ar' ? 'نفد' : 'Rupture') : `${totalStock} ${language === 'ar' ? 'متوفر' : 'en stock'}`}
                      </span>
                    </div>
                  </div>
                  <div className="w-8 h-8 rounded-full bg-gray-50 group-hover:bg-[#C8102E] group-hover:text-white text-gray-400 flex items-center justify-center transition-all flex-shrink-0">
                    <ChevronRight className="w-4 h-4" />
                  </div>
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* ── STEP : Choose Size ── */}
      {step === 'choose_size' && hasSizes && (
        <div className="space-y-3.5 animate-in fade-in duration-200">
          {hasModels && selectedModel && (
            <div className="flex items-center justify-between p-3 rounded-2xl bg-amber-50/80 border border-amber-200">
              <div className="flex items-center gap-2">
                <span className="w-2.5 h-2.5 rounded-full bg-[#D4A843]" />
                <span className="text-xs text-amber-900 font-bold">
                  {language === 'ar' ? 'الموديل المختار :' : 'Modèle sélectionné :'} <strong className="text-[#C8102E] font-black">{selectedModel}</strong>
                </span>
              </div>
              <button
                onClick={() => { setSelectedModel(''); setSelectedSize(''); setStep('choose_model'); }}
                className="text-xs font-bold text-gray-600 hover:text-[#C8102E] underline cursor-pointer"
              >
                ← {language === 'ar' ? 'تغيير الموديل' : 'Changer de modèle'}
              </button>
            </div>
          )}

          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-black text-[#1A1A1A]">
                {hasModels 
                  ? (language === 'ar' ? 'الخطوة 2 : اختر المقاس المناسب' : 'Étape 2 : Choisissez une taille')
                  : (language === 'ar' ? 'الخطوة 1 : اختر مقاساً للمتابعة' : 'Étape 1 : Choisissez une taille')}
              </p>
              <p className="text-xs text-gray-500">
                {language === 'ar' ? 'سيتم تحميل تفاصيل وألوان هذا المقاس' : 'Chaque taille possède ses propres couleurs, stocks et spécifications'}
              </p>
            </div>
            <span className="text-xs font-bold text-[#C8102E] bg-red-50 px-2.5 py-1 rounded-full border border-red-100">
              {uniqueSizes.length} {language === 'ar' ? 'مقاسات' : 'tailles'}
            </span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {uniqueSizes.map(sz => {
              const sizeVars = activeVariantsForModel.filter(v => (v.size?.trim() || 'Standard') === sz);
              const totalStock = sizeVars.reduce((s, v) => s + v.stock, 0);
              const isOutOfStock = totalStock === 0;

              return (
                <button
                  key={sz}
                  onClick={() => handleSelectSize(sz)}
                  disabled={isOutOfStock}
                  className={`p-4 rounded-2xl border-2 text-left transition-all duration-200 cursor-pointer flex items-center justify-between group ${
                    isOutOfStock
                      ? 'opacity-40 border-gray-200 bg-gray-50 cursor-not-allowed'
                      : 'border-[#E8E4DF] bg-white hover:border-[#C8102E] hover:shadow-md hover:bg-red-50/10 active:scale-[0.99]'
                  }`}
                >
                  <div className="flex flex-col gap-1">
                    <span className="text-base font-black text-[#1A1A1A] group-hover:text-[#C8102E] transition-colors">
                      {sz}
                    </span>
                    <div className="flex items-center gap-2 text-xs text-gray-500">
                      <span>{sizeVars.length} couleur{sizeVars.length > 1 ? 's' : ''}</span>
                      <span>·</span>
                      <span className={`font-semibold ${isOutOfStock ? 'text-red-500' : 'text-emerald-600'}`}>
                        {isOutOfStock ? (language === 'ar' ? 'نفد' : 'Rupture') : `${totalStock} ${language === 'ar' ? 'متوفر' : 'en stock'}`}
                      </span>
                    </div>
                  </div>
                  <div className="w-8 h-8 rounded-full bg-gray-50 group-hover:bg-[#C8102E] group-hover:text-white text-gray-400 flex items-center justify-center transition-all flex-shrink-0">
                    <ChevronRight className="w-4 h-4" />
                  </div>
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* ── STEP : Choose Colors & Quantity ── */}
      {step === 'choose_colors' && (
        <div className="space-y-4 animate-in fade-in duration-200">
          {(selectedModel || (hasSizes && selectedSize)) && (
            <div className="flex items-center justify-between p-3.5 rounded-2xl bg-amber-50/80 border border-amber-200">
              <div className="flex items-center gap-2.5">
                <span className="w-2.5 h-2.5 rounded-full bg-[#C8102E] animate-pulse" />
                <div>
                  <span className="text-[11px] font-bold uppercase tracking-wider text-amber-900/70 block">
                    {language === 'ar' ? 'قيد التحديد' : 'Option en cours de commande'}
                  </span>
                  <span className="text-base font-black text-[#C8102E]">
                    {selectedModel ? `[${selectedModel}] ` : ''}
                    {selectedSize && selectedSize !== 'Standard' ? `${selectedSize}` : ''}
                  </span>
                </div>
              </div>
              <div className="flex items-center gap-2">
                {hasSizes && (
                  <button
                    onClick={() => setStep('choose_size')}
                    className="px-3 py-1.5 rounded-xl bg-white border border-amber-300 text-xs font-bold text-gray-700 hover:text-[#C8102E] hover:border-[#C8102E] transition-all cursor-pointer shadow-2xs"
                  >
                    ← {language === 'ar' ? 'تغيير المقاس' : 'Changer de taille'}
                  </button>
                )}
                {hasModels && (
                  <button
                    onClick={() => { setSelectedModel(''); setSelectedSize(''); setStep('choose_model'); }}
                    className="px-3 py-1.5 rounded-xl bg-white border border-amber-300 text-xs font-bold text-gray-700 hover:text-[#C8102E] hover:border-[#C8102E] transition-all cursor-pointer shadow-2xs"
                  >
                    ← {language === 'ar' ? 'تغيير الموديل' : 'Changer de modèle'}
                  </button>
                )}
              </div>
            </div>
          )}

          {/* Color options for this model/size */}
          {(() => {
            const displayVariants = visibleVariants;
            if (displayVariants.length === 0) return <p className="text-sm text-gray-500 italic">{language === 'ar' ? 'لا توجد خيارات متاحة لهذا المقاس.' : 'Aucune variante disponible pour ce choix.'}</p>;

            const isSimpleSize = displayVariants.length === 1 && (!displayVariants[0]?.color || displayVariants[0]?.color?.startsWith('Option')) && !displayVariants[0]?.image;

            if (isSimpleSize) {
              const v = displayVariants[0];
              const qty = qtys[v._safeId] || 0;
              return (
                <div className="flex items-center justify-between bg-white border border-gray-200 p-4 rounded-2xl shadow-xs">
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
                    <div className="flex items-center gap-3 bg-gray-50 border border-gray-200 rounded-full px-2 py-1.5 shadow-xs">
                      <button onClick={() => setQty(v._safeId, -1, v.stock)}
                        className="w-9 h-9 rounded-full flex items-center justify-center text-gray-500 hover:text-[#C8102E] hover:bg-red-50 cursor-pointer touch-manipulation">
                        <Minus className="w-4 h-4" />
                      </button>
                      <span className="w-8 text-center font-black text-lg text-[#C8102E]">{qty}</span>
                      <button onClick={() => setQty(v._safeId, 1, v.stock)}
                        disabled={qty >= v.stock}
                        className="w-9 h-9 rounded-full flex items-center justify-center text-gray-500 hover:text-[#C8102E] hover:bg-red-50 disabled:opacity-30 cursor-pointer touch-manipulation">
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
                <div className="flex items-center justify-between">
                  <p className="text-sm font-bold text-[#1A1A1A]">
                    {language === 'ar' ? `اختر الألوان والكميات المطلوبة :` : `Sélectionnez vos couleurs & quantités :`}
                  </p>
                  <span className="text-[11px] font-bold text-[#C8102E] bg-red-50 px-2.5 py-0.5 rounded-full border border-red-100">
                    {displayVariants.length} {language === 'ar' ? 'لون' : `couleur${displayVariants.length > 1 ? 's' : ''}`}
                  </span>
                </div>

                <div className="grid grid-cols-3 sm:grid-cols-4 lg:grid-cols-5 gap-3">
                  {displayVariants.map(v => {
                    const outOfStock = v.stock === 0;
                    const qty = qtys[v._safeId] || 0;
                    const isSelected = qty > 0;
                    const colorLabel = v.color && !v.color.startsWith('Option') ? (language === 'ar' && v.colorAr ? v.colorAr : v.color) : '';
                    const isFocused = focusedVariantId === v._safeId;

                    return (
                      <div
                        key={v._safeId}
                        className={`relative flex flex-col items-center rounded-2xl p-2.5 border-2 touch-manipulation cursor-pointer transition-all duration-200
                          ${outOfStock
                            ? 'opacity-40 border-gray-200 bg-gray-50 cursor-not-allowed'
                            : isSelected
                              ? 'border-[#C8102E] bg-red-50/50 shadow-md scale-[1.02]'
                              : isFocused
                                ? 'border-[#C8102E]/70 bg-amber-50/30 ring-2 ring-[#C8102E]/30 shadow-xs'
                                : 'border-[#E8E4DF] bg-white hover:border-[#C8102E]/40 hover:shadow-xs'
                          }`}
                        onClick={() => {
                          handleFocusVariant(v);
                          if (outOfStock) return;
                          if (!isSelected) {
                            setQty(v._safeId, 1, v.stock);
                          }
                        }}
                      >
                        {isSelected && (
                          <div className="absolute -top-1.5 -right-1.5 w-5 h-5 rounded-full bg-[#C8102E] border-2 border-white flex items-center justify-center shadow z-10">
                            <span className="text-white text-[9px] font-black">✓</span>
                          </div>
                        )}

                        {v.image ? (
                          <div className="w-16 h-16 sm:w-20 sm:h-20 rounded-xl overflow-hidden border border-gray-100 mb-1.5">
                            <img src={v.image} alt={v.color || 'Design'} loading="lazy" decoding="async" className="w-full h-full object-cover" />
                          </div>
                        ) : (
                          <div
                            className={`w-12 h-12 sm:w-14 sm:h-14 rounded-full border-2 mb-1.5 ${isSelected ? 'border-[#C8102E] ring-2 ring-[#C8102E]/20' : 'border-gray-200'}`}
                            style={{ background: v.colorHex || '#ccc' }}
                          />
                        )}

                        {colorLabel && (
                          <p className={`text-[11px] font-semibold text-center leading-tight ${isSelected ? 'text-[#C8102E]' : 'text-gray-600'}`}>
                            {colorLabel}
                          </p>
                        )}

                        <p className={`text-[9px] mt-0.5 ${outOfStock ? 'text-red-500 font-bold' : 'text-gray-400'}`}>
                          {outOfStock ? (language === 'ar' ? 'نفد' : 'Épuisé') : `${v.stock} ${language === 'ar' ? 'متوفر' : 'dispo'}`}
                        </p>

                        {isSelected && (
                          <div className="flex items-center gap-1.5 mt-2 bg-white border border-gray-200 rounded-full px-1 py-0.5 shadow-xs">
                            <button
                              onClick={(e) => { e.stopPropagation(); setQty(v._safeId, -1, v.stock); }}
                              className="w-8 h-8 rounded-full flex items-center justify-center text-gray-500 hover:text-[#C8102E] hover:bg-red-50 cursor-pointer touch-manipulation"
                            >
                              <Minus className="w-3.5 h-3.5" />
                            </button>
                            <span className="w-5 text-center text-sm font-black text-[#C8102E]">{qty}</span>
                            <button
                              onClick={(e) => { e.stopPropagation(); setQty(v._safeId, 1, v.stock); }}
                              disabled={qty >= v.stock}
                              className="w-8 h-8 rounded-full flex items-center justify-center text-gray-500 hover:text-[#C8102E] hover:bg-red-50 disabled:opacity-30 cursor-pointer touch-manipulation"
                            >
                              <Plus className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        )}

                        {outOfStock && (
                          <div className="absolute inset-0 flex items-center justify-center pointer-events-none" style={{ borderRadius: 'inherit' }}>
                            <div className="w-[120%] h-[2px] bg-red-400/40 -rotate-12" />
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </>
            );
          })()}

          {/* Current Selection Summary */}
          {currentSizeQty > 0 && (
            <div className="mt-4 flex items-center justify-between px-4 py-3 bg-red-50 border border-[#C8102E]/20 rounded-xl">
              <p className="text-sm text-gray-700">
                <span className="font-black text-[#1A1A1A]">{currentSizeQty}</span> {language === 'ar' ? 'قطعة مختارة لـ' : 'article(s) sélectionné(s) pour'}{' '}
                <span className="font-black text-[#C8102E]">
                  {selectedModel ? `[${selectedModel}] ` : ''}
                  {selectedSize && selectedSize !== 'Standard' ? `${selectedSize}` : ''}
                </span>
              </p>
              <p className="text-sm font-black text-[#C8102E]">{language === 'ar' ? 'حسب الطلب' : 'Sur demande'}</p>
            </div>
          )}

          {/* Button : Add this size/model to cart */}
          <button
            onClick={handleAddCurrentSize}
            disabled={currentSizeQty === 0}
            className={`w-full mt-2 py-4 rounded-xl font-bold text-base flex items-center justify-center gap-2 touch-manipulation transition-all duration-200 ${
              currentSizeQty === 0
                ? 'bg-gray-100 text-gray-400 cursor-not-allowed'
                : 'bg-[#C8102E] hover:bg-[#a00d25] text-white shadow-lg shadow-[#C8102E]/20 cursor-pointer active:scale-[0.99]'
            }`}
          >
            <ShoppingCart className="w-5 h-5" />
            {currentSizeQty === 0
              ? (language === 'ar' ? 'اختر لوناً وكمية للمتابعة' : 'Sélectionnez au moins une couleur')
              : (hasSizes || hasModels)
                ? (language === 'ar' ? `تأكيد وإضافة للسلة — ${currentSizeQty} منتج` : `Valider et ajouter au panier (${currentSizeQty})`)
                : (language === 'ar' ? `إضافة للسلة — ${currentSizeQty} منتج` : `Ajouter au panier — ${currentSizeQty} article${currentSizeQty > 1 ? 's' : ''}`)}
          </button>
        </div>
      )}

      {/* ── STEP : Completed Confirmation & Next Option ── */}
      {step === 'completed_size' && lastAddedInfo && (
        <div className="p-6 rounded-3xl bg-emerald-50/90 border-2 border-emerald-200 text-center space-y-4 animate-in zoom-in-95 duration-200 shadow-sm">
          <div className="w-12 h-12 rounded-full bg-emerald-500 text-white flex items-center justify-center mx-auto shadow-md">
            <CheckCircle2 className="w-7 h-7" />
          </div>
          <div>
            <h3 className="text-lg font-black text-emerald-950">
              {language === 'ar'
                ? `✓ تمت الإضافة للسلة بنجاح !`
                : `✓ ${lastAddedInfo.model ? `Modèle "${lastAddedInfo.model}" ` : ''}${lastAddedInfo.size && lastAddedInfo.size !== 'Standard' ? `Taille "${lastAddedInfo.size}" ` : ''}ajouté(e) au panier !`}
            </h3>
            <p className="text-xs sm:text-sm text-emerald-800 mt-1">
              {language === 'ar'
                ? `تمت إضافة ${lastAddedInfo.count} قطعة بنجاح. يمكنك الآن متابعة الطلب أو اختيار مقاس/موديل آخر.`
                : `${lastAddedInfo.count} article(s) ont été validés. Vous pouvez maintenant choisir une autre option ou finaliser votre commande.`}
            </p>
          </div>

          <div className="flex flex-col sm:flex-row gap-3 pt-2">
            <button
              onClick={handleStartAnother}
              className="flex-1 py-3.5 px-4 rounded-xl font-black text-sm bg-white border-2 border-[#C8102E] text-[#C8102E] hover:bg-red-50 flex items-center justify-center gap-2 transition-all cursor-pointer shadow-sm active:scale-[0.99]"
            >
              <span>👉</span> {language === 'ar' ? 'طلب مقاس أو موديل آخر' : (hasSizes ? 'Choisir une autre taille' : 'Choisir un autre modèle')}
            </button>
            {hasModels && hasSizes && (
              <button
                onClick={() => {
                  setSelectedModel('');
                  setSelectedSize('');
                  setFocusedVariantId('');
                  setStep('choose_model');
                }}
                className="py-3.5 px-4 rounded-xl font-bold text-sm bg-amber-50 border border-amber-300 text-amber-900 hover:bg-amber-100 flex items-center justify-center gap-1.5 transition-all cursor-pointer shadow-2xs"
              >
                <span>🔄</span> {language === 'ar' ? 'تغيير الموديل' : 'Changer de modèle'}
              </button>
            )}
            <button
              onClick={() => openCart()}
              className="flex-1 py-3.5 px-4 rounded-xl font-black text-sm bg-[#C8102E] text-white hover:bg-[#a00d25] flex items-center justify-center gap-2 transition-all cursor-pointer shadow-md shadow-[#C8102E]/20 active:scale-[0.99]"
            >
              <ShoppingCart className="w-4 h-4" /> {language === 'ar' ? 'عرض السلة / إنهاء الطلب' : 'Voir le panier'}
            </button>
          </div>
        </div>
      )}
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
    if (product?.variants?.[0]) setSelectedVariant(product.variants[0]);
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

  const effectiveShortDescription = (language === 'ar' ? currentVariant?.shortDescriptionAr : currentVariant?.shortDescription)
    || currentVariant?.shortDescription
    || (language === 'ar' ? product.shortDescriptionAr : product.shortDescription)
    || product.shortDescription;


  const effectiveTypeProduit = currentVariant?.typeProduit || product.typeProduit;
  const effectiveMaterial = currentVariant?.material || currentVariant?.matiereMailles || product.matiereMailles || product.material;
  const effectiveWidth = currentVariant?.width || currentVariant?.largeurMaille || product.largeurMaille || product.width;
  const effectiveLength = currentVariant?.longueur || product.longueur;
  const effectiveWeight = currentVariant?.weight !== undefined ? currentVariant.weight : product.weight;
  const effectivePackaging = currentVariant?.packaging || product.packaging;
  const effectiveCondUnitaire = currentVariant?.conditionnementUnitaire || product.conditionnementUnitaire;
  const effectiveCondGros = currentVariant?.conditionnementGros || product.conditionnementGros;
  const effectiveApplications = currentVariant?.applications || product.applications;
  const effectiveAvantages = currentVariant?.avantages || product.avantages;
  const effectiveConseilsEntretien = currentVariant?.conseilsEntretien || product.conseilsEntretien;
  const effectiveInfoCommerciale = currentVariant?.informationCommerciale || product.informationCommerciale;

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

            {/* Selected variant indicator badge */}
            {currentVariant && (
              <div className="mb-3 inline-flex items-center gap-2 px-3 py-1 rounded-xl bg-amber-50 border border-amber-200/80 text-xs font-bold text-amber-900 animate-in fade-in duration-200">
                <Sparkles className="w-3.5 h-3.5 text-[#D4A843] flex-shrink-0" />
                <span>
                  {language === 'ar'
                    ? `الخيار المحدد: ${currentVariant.model ? `موديل ${currentVariant.model} ` : ''}${currentVariant.size ? `مقاس ${currentVariant.size} ` : ''}${currentVariant.color || ''}`
                    : `Option : ${currentVariant.model ? `Modèle ${currentVariant.model} ` : ''}${currentVariant.size ? `Taille ${currentVariant.size} ` : ''}${currentVariant.color ? `— ${currentVariant.color}` : ''}`}
                </span>
                {currentVariant.stock !== undefined && (
                  <span className={`text-[10px] px-2 py-0.5 rounded-full font-black ${currentVariant.stock > 0 ? 'bg-emerald-500 text-white' : 'bg-red-500 text-white'}`}>
                    {currentVariant.stock > 0 ? `${currentVariant.stock} en stock` : 'Rupture'}
                  </span>
                )}
              </div>
            )}

            <p className="text-[#6B6B6B] text-sm md:text-base leading-relaxed mb-6 whitespace-pre-wrap">
              {effectiveShortDescription}
            </p>

            <div className="flex items-center gap-3 mb-4">
              <span className="text-xl font-bold text-[#C8102E]">
                {language === 'ar' ? 'حسب الطلب' : 'Sur demande'}
              </span>
            </div>

            <div className={`inline-flex items-center gap-2 px-3 py-1.5 rounded-full text-sm font-semibold mb-5 ${inStock ? 'bg-green-50 text-[#10B981]' : 'bg-red-50 text-red-600'}`}>
              <span className={`w-2 h-2 rounded-full ${inStock ? 'bg-[#10B981]' : 'bg-red-500'}`} />
              {inStock
                ? currentVariant
                  ? (language === 'ar'
                      ? (currentVariant.stock > 0 ? `${currentVariant.stock} قطعة متوفرة لهذا الخيار` : 'هذا الخيار غير متوفر حالياً')
                      : (currentVariant.stock > 0 ? `${currentVariant.stock} disponibles pour cette option` : 'Cette variante est en rupture'))
                  : hasVariants
                    ? (language === 'ar' ? `${product.variants.reduce((s, v) => s + v.stock, 0)} قطعة متوفرة` : `${product.variants.reduce((s, v) => s + v.stock, 0)} unités disponibles`)
                    : (language === 'ar' ? `متوفر (${stock} قطعة)` : `En stock (${stock} disponibles)`)
                : (language === 'ar' ? 'نفد المخزون' : 'Rupture de stock')}
            </div>

            {/* ─── Fiche Technique & Informations Détaillées (Mise en évidence) ─── */}
            {(effectiveTypeProduit || effectiveMaterial || product.compositionRuban || effectiveWidth || effectiveLength || product.type || product.design || product.securite || product.resistance || product.compatibleAvec || effectiveCondUnitaire || effectiveCondGros || effectiveWeight || effectivePackaging) && (
              <div className="mb-6 rounded-2xl bg-gradient-to-br from-amber-50/50 via-white to-amber-50/20 border-2 border-[#D4A843]/50 p-4 md:p-5 shadow-sm relative overflow-hidden transition-all duration-300">
                <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-[#D4A843] via-[#C8102E] to-[#D4A843]" />
                
                <div className="flex flex-wrap items-center justify-between gap-2 mb-3.5">
                  <div className="flex items-center gap-2.5">
                    <div className="w-8 h-8 rounded-xl bg-[#D4A843]/15 text-[#D4A843] flex items-center justify-center font-black text-sm shadow-2xs">
                      ⚙️
                    </div>
                    <div>
                      <h3 className="text-xs md:text-sm font-black text-[#1A1A1A] tracking-wider uppercase flex items-center gap-2">
                        <span>{language === 'ar' ? 'المعلومات التفصيلية والمواصفات' : 'Informations Détaillées & Spécifications'}</span>
                        <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800 border border-emerald-200">
                          {language === 'ar' ? 'مباشر' : 'Live'}
                        </span>
                      </h3>
                      <p className="text-[11px] text-gray-500">
                        {language === 'ar' ? 'تتغير المواصفات فورياً بحسب الموديل والمقاس المختار' : 'Mis à jour en direct selon le modèle et la taille choisis'}
                      </p>
                    </div>
                  </div>

                  {(currentVariant?.model || currentVariant?.size) && (
                    <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-[#D4A843]/20 border border-[#D4A843]/40 text-[#1A1A1A] text-xs font-black shadow-2xs">
                      <Sparkles className="w-3 h-3 text-[#D4A843]" />
                      <span>
                        {currentVariant.model ? `Modèle: ${currentVariant.model}` : ''}
                        {currentVariant.model && currentVariant.size && currentVariant.size !== 'Standard' ? ' · ' : ''}
                        {currentVariant.size && currentVariant.size !== 'Standard' ? `Taille: ${currentVariant.size}` : ''}
                      </span>
                    </span>
                  )}
                </div>

                {/* Grid of technical specs */}
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5 text-xs">
                  {effectiveTypeProduit && (
                    <div className="bg-white p-2.5 rounded-xl border border-amber-200/60 shadow-2xs transition-all hover:border-[#D4A843]">
                      <span className="text-[10px] font-bold text-gray-400 uppercase tracking-wider block mb-0.5">
                        {language === 'ar' ? 'نوع المنتج' : 'Type de produit'}
                      </span>
                      <span className="font-bold text-[#1A1A1A] text-xs truncate block">{effectiveTypeProduit}</span>
                    </div>
                  )}
                  {effectiveMaterial && (
                    <div className="bg-white p-2.5 rounded-xl border border-amber-200/60 shadow-2xs transition-all hover:border-[#D4A843]">
                      <span className="text-[10px] font-bold text-gray-400 uppercase tracking-wider block mb-0.5">
                        {language === 'ar' ? 'مادة' : 'Matière'}
                      </span>
                      <span className="font-bold text-[#1A1A1A] text-xs truncate block">{effectiveMaterial}</span>
                    </div>
                  )}
                  {effectiveWidth && (
                    <div className="bg-white p-2.5 rounded-xl border border-amber-200/60 shadow-2xs transition-all hover:border-[#D4A843]">
                      <span className="text-[10px] font-bold text-gray-400 uppercase tracking-wider block mb-0.5">
                        {language === 'ar' ? 'العرض' : 'Largeur'}
                      </span>
                      <span className="font-bold text-[#1A1A1A] text-xs truncate block">{effectiveWidth}</span>
                    </div>
                  )}
                  {effectiveLength && (
                    <div className="bg-white p-2.5 rounded-xl border border-amber-200/60 shadow-2xs transition-all hover:border-[#D4A843]">
                      <span className="text-[10px] font-bold text-gray-400 uppercase tracking-wider block mb-0.5">
                        {language === 'ar' ? 'الطول' : 'Longueur'}
                      </span>
                      <span className="font-bold text-[#1A1A1A] text-xs truncate block">{effectiveLength}</span>
                    </div>
                  )}
                  {effectiveWeight !== undefined && (
                    <div className="bg-white p-2.5 rounded-xl border border-amber-200/60 shadow-2xs transition-all hover:border-[#D4A843]">
                      <span className="text-[10px] font-bold text-gray-400 uppercase tracking-wider block mb-0.5">
                        {language === 'ar' ? 'الوزن' : 'Poids'}
                      </span>
                      <span className="font-bold text-[#1A1A1A] text-xs truncate block">{effectiveWeight} g</span>
                    </div>
                  )}
                  {effectivePackaging && (
                    <div className="bg-white p-2.5 rounded-xl border border-amber-200/60 shadow-2xs transition-all hover:border-[#D4A843]">
                      <span className="text-[10px] font-bold text-gray-400 uppercase tracking-wider block mb-0.5">
                        {language === 'ar' ? 'التعبئة والتغليف' : 'Conditionnement'}
                      </span>
                      <span className="font-bold text-[#1A1A1A] text-xs truncate block">{effectivePackaging}</span>
                    </div>
                  )}
                  {product.compositionRuban && (
                    <div className="bg-white p-2.5 rounded-xl border border-amber-200/60 shadow-2xs transition-all hover:border-[#D4A843]">
                      <span className="text-[10px] font-bold text-gray-400 uppercase tracking-wider block mb-0.5">
                        {language === 'ar' ? 'تركيبة الشريط' : 'Composition ruban'}
                      </span>
                      <span className="font-bold text-[#1A1A1A] text-xs truncate block">{product.compositionRuban}</span>
                    </div>
                  )}
                  {product.type && (
                    <div className="bg-white p-2.5 rounded-xl border border-amber-200/60 shadow-2xs transition-all hover:border-[#D4A843]">
                      <span className="text-[10px] font-bold text-gray-400 uppercase tracking-wider block mb-0.5">
                        {language === 'ar' ? 'النوع' : 'Type'}
                      </span>
                      <span className="font-bold text-[#1A1A1A] text-xs truncate block">{product.type}</span>
                    </div>
                  )}
                  {product.design && (
                    <div className="bg-white p-2.5 rounded-xl border border-amber-200/60 shadow-2xs transition-all hover:border-[#D4A843]">
                      <span className="text-[10px] font-bold text-gray-400 uppercase tracking-wider block mb-0.5">
                        {language === 'ar' ? 'التصميم' : 'Design'}
                      </span>
                      <span className="font-bold text-[#1A1A1A] text-xs truncate block">{product.design}</span>
                    </div>
                  )}
                  {product.securite && (
                    <div className="bg-white p-2.5 rounded-xl border border-amber-200/60 shadow-2xs transition-all hover:border-[#D4A843]">
                      <span className="text-[10px] font-bold text-gray-400 uppercase tracking-wider block mb-0.5">
                        {language === 'ar' ? 'الأمان' : 'Sécurité'}
                      </span>
                      <span className="font-bold text-[#1A1A1A] text-xs truncate block">{product.securite}</span>
                    </div>
                  )}
                  {product.resistance && (
                    <div className="bg-white p-2.5 rounded-xl border border-amber-200/60 shadow-2xs transition-all hover:border-[#D4A843]">
                      <span className="text-[10px] font-bold text-gray-400 uppercase tracking-wider block mb-0.5">
                        {language === 'ar' ? 'المقاومة' : 'Résistance'}
                      </span>
                      <span className="font-bold text-[#1A1A1A] text-xs truncate block">{product.resistance}</span>
                    </div>
                  )}
                  {product.compatibleAvec && (
                    <div className="bg-white p-2.5 rounded-xl border border-amber-200/60 shadow-2xs transition-all hover:border-[#D4A843]">
                      <span className="text-[10px] font-bold text-gray-400 uppercase tracking-wider block mb-0.5">
                        {language === 'ar' ? 'متوافق مع' : 'Compatible avec'}
                      </span>
                      <span className="font-bold text-[#1A1A1A] text-xs truncate block">{product.compatibleAvec}</span>
                    </div>
                  )}
                  {effectiveCondUnitaire && (
                    <div className="bg-white p-2.5 rounded-xl border border-amber-200/60 shadow-2xs transition-all hover:border-[#D4A843]">
                      <span className="text-[10px] font-bold text-gray-400 uppercase tracking-wider block mb-0.5">
                        {language === 'ar' ? 'تعبئة وحدة' : 'Cond. unitaire'}
                      </span>
                      <span className="font-bold text-[#1A1A1A] text-xs truncate block">{effectiveCondUnitaire}</span>
                    </div>
                  )}
                  {effectiveCondGros && (
                    <div className="bg-white p-2.5 rounded-xl border border-amber-200/60 shadow-2xs transition-all hover:border-[#D4A843]">
                      <span className="text-[10px] font-bold text-gray-400 uppercase tracking-wider block mb-0.5">
                        {language === 'ar' ? 'تعبئة جملة' : 'Cond. gros'}
                      </span>
                      <span className="font-bold text-[#1A1A1A] text-xs truncate block">{effectiveCondGros}</span>
                    </div>
                  )}
                </div>
              </div>
            )}

            <hr className="border-[#E8E4DF] mb-5" />

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
                onAdd={handleAddVariantsToCart}
                onVariantSelect={handleVariantSelect}
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
