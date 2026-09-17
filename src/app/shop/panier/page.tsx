"use client";

import React, { useState, useCallback, useMemo } from "react";
import Link from "next/link";
import Image from "next/image";
import {
  ShoppingBag,
  Trash2,
  Minus,
  Plus,
  ArrowLeft,
  Shield,
  RefreshCw,
  Truck,
  ChevronRight,
  ChevronDown,
  PackageX,
  AlertTriangle,
  X,
} from "lucide-react";

import {
  useShopCart,
  getCartItemUnitPrice,
  getCartItemVariantKey,
  groupCartItemsByProduct,
  summarizeCartProduct,
} from "@/contexts/shop-cart-context";
import { useLanguage } from "@/contexts/language-context";
import {
  formatPrice,
  formatPriceOrOnRequest,
  formatPriceRange,
  getFreeDeliveryProgress,
  CASABLANCA_FREE_DELIVERY_THRESHOLD,
  FREE_DELIVERY_THRESHOLD,
} from "@/lib/shop-utils";
import type { CartItem } from "@/lib/shop-types";
import type { Language } from "@/lib/translations";
import FreeDeliveryProgress from "@/components/shop/FreeDeliveryProgress";

// ─── Constants ──────────────────────────────────────────────────────────────
// Au-delà, les variantes d'un produit sont repliées derrière « Voir les N autres »
const VISIBLE_VARIANT_ROWS = 5;

type UpdateQty = (productId: string, quantity: number, variantId?: string) => void;
type RemoveItem = (productId: string, variantId?: string) => void;

function articlesLabel(count: number, language: Language) {
  return language === "ar" ? `${count} قطعة` : `${count} article${count > 1 ? "s" : ""}`;
}

// Modèle + taille d'une ligne : sert à sous-grouper les couleurs d'un même produit
function variantOptionLabel(item: CartItem, language: Language): string {
  const v = item.variant;
  if (!v) return "";
  const model = language === "ar" && v.modelAr ? v.modelAr : v.model;
  const size = language === "ar" && v.sizeAr ? v.sizeAr : v.size;
  return [model?.trim(), size?.trim()].filter(Boolean).join(" · ");
}

function variantColorLabel(item: CartItem, language: Language): string {
  const v = item.variant;
  return (language === "ar" && v?.colorAr ? v.colorAr : v?.color)?.trim() || "";
}

// ─── Qty Stepper ─────────────────────────────────────────────────────────────
function QtyStepper({
  quantity,
  maxStock,
  onChange,
  language,
}: {
  quantity: number;
  maxStock: number;
  onChange: (quantity: number) => void;
  language: Language;
}) {
  // Saisie libre (pratique pour les grosses quantités), validée à la sortie du champ
  const [draft, setDraft] = useState<string | null>(null);

  const commit = () => {
    const val = parseInt(draft ?? "", 10);
    if (!isNaN(val) && val >= 1 && val !== quantity) onChange(val);
    setDraft(null);
  };

  return (
    <div className="flex items-center flex-shrink-0 border border-[#E8E4DF] rounded-xl overflow-hidden bg-white">
      <button
        type="button"
        onClick={() => onChange(quantity - 1)}
        disabled={quantity <= 1}
        className="w-8 h-8 flex items-center justify-center text-[#6B6B6B] hover:text-[#C8102E] hover:bg-[#C8102E]/5 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
        aria-label={language === "ar" ? "إنقاص الكمية" : "Diminuer la quantité"}
      >
        <Minus className="w-3.5 h-3.5" />
      </button>
      <input
        type="text"
        inputMode="numeric"
        value={draft ?? String(quantity)}
        onChange={(e) => setDraft(e.target.value.replace(/\D/g, ""))}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === "Enter") e.currentTarget.blur();
        }}
        className="w-11 h-8 text-center text-sm font-semibold tabular-nums text-[#0F0F0F] border-x border-[#E8E4DF] focus:outline-none focus:bg-[#FBF8F3]"
        aria-label={language === "ar" ? "الكمية" : "Quantité"}
      />
      <button
        type="button"
        onClick={() => onChange(quantity + 1)}
        disabled={maxStock > 0 && quantity >= maxStock}
        className="w-8 h-8 flex items-center justify-center text-[#6B6B6B] hover:text-[#C8102E] hover:bg-[#C8102E]/5 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
        aria-label={language === "ar" ? "زيادة الكمية" : "Augmenter la quantité"}
      >
        <Plus className="w-3.5 h-3.5" />
      </button>
    </div>
  );
}

// ─── Variant swatch ──────────────────────────────────────────────────────────
function VariantSwatch({ item }: { item: CartItem }) {
  if (item.variant?.colorHex) {
    return (
      <span
        className="w-7 h-7 flex-shrink-0 rounded-lg border border-black/10"
        style={{ backgroundColor: item.variant.colorHex }}
      />
    );
  }
  return (
    <span className="relative w-7 h-7 flex-shrink-0 rounded-lg overflow-hidden bg-[#FBF8F3] border border-[#E8E4DF]">
      {item.productImage && (
        <Image src={item.productImage} alt="" fill sizes="28px" className="object-cover" />
      )}
    </span>
  );
}

// ─── Product group ───────────────────────────────────────────────────────────
// Une carte par produit ; ses couleurs / tailles sont listées en lignes compactes.
function CartProductGroup({
  productId,
  items,
  productTotalQty,
  onUpdateQty,
  onRemove,
}: {
  productId: string;
  items: CartItem[];
  productTotalQty: number;
  onUpdateQty: UpdateQty;
  onRemove: RemoveItem;
}) {
  const { language } = useLanguage();
  const [expanded, setExpanded] = useState(false);
  const [confirmRemove, setConfirmRemove] = useState(false);
  const [imgError, setImgError] = useState(false);

  const first = items[0];
  const name = language === "ar" && first.productNameAr ? first.productNameAr : first.productName;
  const productHref = `/shop/produit/${productId}`;
  const isSimple = items.length === 1 && !first.variant;
  const { total, minUnit, maxUnit } = summarizeCartProduct(items, productTotalQty);
  const standardLabel = language === "ar" ? "قياسي" : "Standard";
  const unitSuffix = language === "ar" ? "/ قطعة" : "/ unité";

  // Quand les couleurs se répètent dans plusieurs tailles (ou modèles), on les range sous
  // un en-tête par taille plutôt que de répéter la taille sur chaque ligne.
  const optionGroups = useMemo(() => {
    const groups = new Map<string, CartItem[]>();
    for (const item of items) {
      const key = variantOptionLabel(item, language);
      groups.set(key, [...(groups.get(key) || []), item]);
    }
    return Array.from(groups, ([label, groupItems]) => ({
      label,
      items: groupItems,
      quantity: groupItems.reduce((s, i) => s + i.quantity, 0),
    }));
  }, [items, language]);
  const useSubgroups = optionGroups.length > 1 && optionGroups.some((g) => g.items.length > 1);
  const sharedOption = optionGroups.length === 1 ? optionGroups[0].label : "";

  const rows = useSubgroups
    ? optionGroups.flatMap((g) => g.items.map((item, i) => ({ item, header: i === 0 ? g : null })))
    : items.map((item) => ({ item, header: null }));
  const canCollapse = rows.length > VISIBLE_VARIANT_ROWS + 1;
  const visibleRows = canCollapse && !expanded ? rows.slice(0, VISIBLE_VARIANT_ROWS) : rows;

  const rowLabel = (item: CartItem) => {
    const color = variantColorLabel(item, language);
    const option = variantOptionLabel(item, language);
    if (useSubgroups || sharedOption) return color || option || standardLabel;
    return [option, color].filter(Boolean).join(" · ") || standardLabel;
  };

  const meta = [
    sharedOption,
    items.length > 1 ? `${items.length} ${language === "ar" ? "خيارات" : "variantes"}` : "",
    articlesLabel(productTotalQty, language),
  ]
    .filter(Boolean)
    .join(" · ");

  const wholesale =
    first.wholesalePrice && first.minOrderQty && first.minOrderQty > 1
      ? { price: first.wholesalePrice, minQty: first.minOrderQty }
      : null;

  const handleRemoveGroup = () => {
    if (!confirmRemove) {
      setConfirmRemove(true);
      setTimeout(() => setConfirmRemove(false), 3000);
      return;
    }
    items.forEach((item) => onRemove(item.productId, getCartItemVariantKey(item)));
  };

  return (
    <div className="bg-white rounded-2xl border border-[#E8E4DF] overflow-hidden">
      {/* ── Product header ── */}
      <div className="flex gap-3 sm:gap-4 p-3 sm:p-4">
        <Link
          href={productHref}
          className="relative w-16 h-16 sm:w-20 sm:h-20 flex-shrink-0 rounded-xl overflow-hidden bg-[#FBF8F3] border border-[#E8E4DF]"
        >
          {first.productImage && !imgError ? (
            <Image
              src={first.productImage}
              alt={name}
              fill
              sizes="80px"
              className="object-cover"
              onError={() => setImgError(true)}
            />
          ) : (
            <span className="w-full h-full flex items-center justify-center">
              <ShoppingBag className="w-7 h-7 text-[#D4A843]/40" />
            </span>
          )}
        </Link>

        <div className="flex-1 min-w-0">
          <div className="flex items-start justify-between gap-2">
            <Link
              href={productHref}
              dir={language === "ar" ? "rtl" : "ltr"}
              className="font-semibold text-sm sm:text-base leading-snug text-[#0F0F0F] hover:text-[#C8102E] line-clamp-2 shop-font-display transition-colors"
            >
              {name}
            </Link>
            <button
              type="button"
              onClick={handleRemoveGroup}
              className={`flex-shrink-0 flex items-center gap-1 rounded-lg text-xs font-medium transition-all ${
                confirmRemove
                  ? "px-2 py-1 bg-red-50 border border-red-200 text-red-600"
                  : "w-8 h-8 justify-center text-[#6B6B6B] hover:text-red-500 hover:bg-red-50"
              }`}
              aria-label={language === "ar" ? "حذف المنتج" : "Retirer ce produit"}
            >
              {confirmRemove ? (
                <>
                  <AlertTriangle className="w-3.5 h-3.5" />
                  {language === "ar" ? "تأكيد" : "Confirmer"}
                </>
              ) : (
                <Trash2 className="w-4 h-4" />
              )}
            </button>
          </div>

          <p className="text-xs text-[#6B6B6B] mt-1">{meta}</p>

          <div className="flex items-end justify-between gap-3 mt-1.5">
            <p className="text-xs text-[#6B6B6B] tabular-nums">
              {minUnit > 0 && `${formatPriceRange(minUnit, maxUnit, language)} ${unitSuffix}`}
            </p>
            <p className="text-base sm:text-lg font-bold text-[#C8102E] tabular-nums leading-none shop-font-display">
              {formatPriceOrOnRequest(total, language)}
            </p>
          </div>

          {wholesale && (
            <p
              className={`text-xs mt-1.5 ${
                productTotalQty >= wholesale.minQty ? "font-medium text-emerald-700" : "text-[#6B6B6B]"
              }`}
            >
              {productTotalQty >= wholesale.minQty
                ? language === "ar"
                  ? "✓ تم تطبيق سعر الجملة"
                  : "✓ Prix de gros appliqué"
                : language === "ar"
                  ? `أضف ${wholesale.minQty - productTotalQty} للحصول على سعر الجملة (${formatPrice(wholesale.price)})`
                  : `Plus que ${wholesale.minQty - productTotalQty} pour le prix de gros (${formatPrice(wholesale.price)} ${unitSuffix})`}
            </p>
          )}

          {isSimple && (
            <div className="mt-3">
              <QtyStepper
                quantity={first.quantity}
                maxStock={first.maxStock}
                onChange={(q) => onUpdateQty(productId, q)}
                language={language}
              />
            </div>
          )}
        </div>
      </div>

      {/* ── Variant rows ── */}
      {!isSimple && (
        <div className="border-t border-[#E8E4DF]">
          <div className="px-3 sm:px-4">
            {visibleRows.map(({ item, header }) => {
              const variantKey = getCartItemVariantKey(item);
              const unit = getCartItemUnitPrice(item, productTotalQty);
              const lineTotal = formatPriceOrOnRequest(unit * item.quantity, language);
              const atMax = item.maxStock > 0 && item.quantity >= item.maxStock;

              return (
                <React.Fragment key={variantKey || item.productId}>
                  {header && (
                    <div className="flex items-center justify-between pt-3 pb-1 text-xs font-semibold text-[#6B6B6B]">
                      <span>{header.label || standardLabel}</span>
                      <span className="font-medium tabular-nums">
                        {articlesLabel(header.quantity, language)}
                      </span>
                    </div>
                  )}
                  <div className="flex items-center gap-2.5 sm:gap-3 py-2 border-b border-[#F3EFE8] last:border-b-0">
                    <VariantSwatch item={item} />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm text-[#0F0F0F] truncate">{rowLabel(item)}</p>
                      <p className="sm:hidden text-xs font-semibold text-[#6B6B6B] tabular-nums">{lineTotal}</p>
                      {unit > 0 && maxUnit > minUnit && (
                        <p className="hidden sm:block text-xs text-[#6B6B6B] tabular-nums">
                          {formatPrice(unit)} {unitSuffix}
                        </p>
                      )}
                      {atMax && (
                        <p className="text-[11px] text-amber-600">
                          {language === "ar" ? `الحد الأقصى ${item.maxStock}` : `Stock max : ${item.maxStock}`}
                        </p>
                      )}
                    </div>
                    <QtyStepper
                      quantity={item.quantity}
                      maxStock={item.maxStock}
                      onChange={(q) => onUpdateQty(item.productId, q, variantKey)}
                      language={language}
                    />
                    <span className="hidden sm:block w-24 text-right text-sm font-semibold text-[#0F0F0F] tabular-nums">
                      {lineTotal}
                    </span>
                    <button
                      type="button"
                      onClick={() => onRemove(item.productId, variantKey)}
                      className="w-8 h-8 flex-shrink-0 flex items-center justify-center rounded-lg text-[#6B6B6B] hover:text-red-500 hover:bg-red-50 transition-colors"
                      aria-label={language === "ar" ? "حذف" : "Retirer"}
                    >
                      <X className="w-4 h-4" />
                    </button>
                  </div>
                </React.Fragment>
              );
            })}
          </div>

          {canCollapse && (
            <button
              type="button"
              onClick={() => setExpanded((v) => !v)}
              className="w-full flex items-center justify-center gap-1.5 py-2.5 border-t border-[#E8E4DF] text-xs font-semibold text-[#6B6B6B] hover:text-[#C8102E] hover:bg-[#FBF8F3] transition-colors"
            >
              {expanded
                ? language === "ar"
                  ? "إخفاء"
                  : "Réduire"
                : language === "ar"
                  ? `عرض ${rows.length - VISIBLE_VARIANT_ROWS} خيارات أخرى`
                  : `Voir les ${rows.length - VISIBLE_VARIANT_ROWS} autres variantes`}
              <ChevronDown className={`w-4 h-4 transition-transform ${expanded ? "rotate-180" : ""}`} />
            </button>
          )}
        </div>
      )}
    </div>
  );
}

// ─── Empty Cart ──────────────────────────────────────────────────────────────
function EmptyCart() {
  const { t } = useLanguage();
  return (
    <div className="min-h-screen bg-[#FBF8F3] flex items-center justify-center px-4">
      <div className="text-center max-w-md">
        {/* Icon */}
        <div className="relative inline-block mb-8">
          <div className="w-32 h-32 rounded-full bg-gradient-to-br from-[#C8102E]/10 to-[#D4A843]/10 flex items-center justify-center mx-auto">
            <PackageX className="w-16 h-16 text-[#C8102E]/30" />
          </div>
          <div className="absolute -top-2 -right-2 w-10 h-10 rounded-full bg-[#D4A843]/20 flex items-center justify-center">
            <ShoppingBag className="w-5 h-5 text-[#D4A843]" />
          </div>
        </div>

        <h1 className="text-3xl font-bold text-[#0F0F0F] mb-3 shop-font-display">
          {t('cart_empty')}
        </h1>
        <p className="text-[#6B6B6B] mb-8 leading-relaxed">
          {t('cart_empty_sub')}
        </p>

        <Link
          href="/shop/categories"
          className="inline-flex items-center gap-2 px-8 py-4 bg-[#C8102E] hover:bg-[#a00d25] text-white font-semibold rounded-2xl transition-all duration-200 shadow-lg shadow-[#C8102E]/20 hover:shadow-xl hover:shadow-[#C8102E]/30 hover:-translate-y-0.5 shop-btn-press"
        >
          <ShoppingBag className="w-5 h-5" />
          {t('continue_shopping')}
          <ChevronRight className="w-4 h-4" />
        </Link>
      </div>
    </div>
  );
}

// ─── Main Page ───────────────────────────────────────────────────────────────
export default function PanierPage() {
  const { t, language } = useLanguage();
  const { items, subtotal, itemCount, updateQty, removeItem, clearCart, productQtyMap } = useShopCart();
  const [clearConfirm, setClearConfirm] = useState(false);

  const groups = useMemo(() => groupCartItemsByProduct(items), [items]);
  const hasPrices = subtotal > 0;
  const hasUnpricedItems = items.some((item) => getCartItemUnitPrice(item, productQtyMap[item.productId]) <= 0);
  // La ville n'est connue qu'au checkout : le total n'inclut pas la livraison
  const deliveryStage = getFreeDeliveryProgress(subtotal).stage;
  const totalLabel = hasPrices ? formatPrice(subtotal) : t('price_on_request');
  const isAr = language === "ar";

  const handleClearCart = useCallback(() => {
    if (clearConfirm) {
      clearCart();
      setClearConfirm(false);
    } else {
      setClearConfirm(true);
      setTimeout(() => setClearConfirm(false), 3000);
    }
  }, [clearConfirm, clearCart]);

  if (items.length === 0) {
    return <EmptyCart />;
  }

  const steps = [
    isAr ? "السلة" : "Panier",
    isAr ? "التوصيل" : "Livraison",
    isAr ? "التأكيد" : "Confirmation",
  ];

  return (
    <div className="min-h-screen bg-[#FBF8F3] pb-20 lg:pb-0">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 lg:py-8">
        {/* ── Heading ── */}
        <div className="flex flex-wrap items-end justify-between gap-4 mb-6">
          <div>
            <Link
              href="/shop/boutique"
              className="inline-flex items-center gap-1.5 text-sm text-[#6B6B6B] hover:text-[#C8102E] transition-colors"
            >
              <ArrowLeft className="w-4 h-4" />
              {t('continue_shopping')}
            </Link>
            <h1 className="mt-2 text-2xl sm:text-3xl font-bold text-[#0F0F0F] shop-font-display">
              {t('cart_title')}
            </h1>
            <p className="text-sm text-[#6B6B6B] mt-1">
              {isAr ? `${groups.length} منتجات` : `${groups.length} produit${groups.length > 1 ? "s" : ""}`}
              {" · "}
              {articlesLabel(itemCount, language)}
            </p>
          </div>

          {/* Progress steps */}
          <div className="hidden md:flex items-center gap-2 text-xs">
            {steps.map((label, i) => (
              <React.Fragment key={label}>
                {i > 0 && <ChevronRight className="w-3 h-3 text-[#E8E4DF]" />}
                <span className={`flex items-center gap-1.5 ${i === 0 ? "font-semibold text-[#C8102E]" : "text-[#6B6B6B]"}`}>
                  <span
                    className={`w-5 h-5 rounded-full flex items-center justify-center text-xs ${
                      i === 0 ? "bg-[#C8102E] text-white" : "bg-[#E8E4DF] text-[#6B6B6B]"
                    }`}
                  >
                    {i + 1}
                  </span>
                  {label}
                </span>
              </React.Fragment>
            ))}
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 lg:gap-8 items-start">
          {/* ── Left: products ── */}
          <div className="lg:col-span-2 space-y-3">
            {/* Free delivery progress */}
            {hasPrices && <FreeDeliveryProgress subtotal={subtotal} />}

            {/* Toolbar */}
            <div className="flex items-center justify-between px-1 pt-1">
              <span className="text-xs font-semibold uppercase tracking-wide text-[#6B6B6B]">
                {isAr ? "المنتجات" : "Articles"}
              </span>
              <button
                type="button"
                onClick={handleClearCart}
                className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium transition-all ${
                  clearConfirm
                    ? "bg-red-50 border border-red-200 text-red-600"
                    : "text-[#6B6B6B] hover:text-red-500 hover:bg-red-50"
                }`}
              >
                {clearConfirm ? <AlertTriangle className="w-3.5 h-3.5" /> : <Trash2 className="w-3.5 h-3.5" />}
                {clearConfirm
                  ? isAr ? "تأكيد التفريغ" : "Confirmer le vidage"
                  : isAr ? "تفريغ السلة" : "Vider le panier"}
              </button>
            </div>

            {groups.map((group) => (
              <CartProductGroup
                key={group.productId}
                productId={group.productId}
                items={group.items}
                productTotalQty={productQtyMap[group.productId] || 0}
                onUpdateQty={updateQty}
                onRemove={removeItem}
              />
            ))}

            <Link
              href="/shop/boutique"
              className="flex items-center justify-center gap-1.5 py-3 rounded-2xl border border-dashed border-[#E8E4DF] text-sm font-medium text-[#6B6B6B] hover:text-[#C8102E] hover:border-[#C8102E]/30 hover:bg-white transition-all"
            >
              <Plus className="w-4 h-4" />
              {isAr ? "إضافة منتجات" : "Ajouter des articles"}
            </Link>
          </div>

          {/* ── Right: order summary ── */}
          <div className="lg:sticky lg:top-24">
            <div className="bg-white rounded-2xl border border-[#E8E4DF] overflow-hidden shadow-sm">
              <div className="px-5 py-4 bg-gradient-to-r from-[#0F0F0F] to-[#1a1a1a]">
                <h2 className="text-white font-bold shop-font-display">{isAr ? "ملخص الطلب" : "Récapitulatif"}</h2>
              </div>

              <div className="p-5 space-y-3">
                {/* Subtotal */}
                <div className="flex items-center justify-between text-sm text-[#6B6B6B]">
                  <span>{t('subtotal')} ({itemCount})</span>
                  <span className="font-semibold text-[#0F0F0F] tabular-nums">
                    {formatPriceOrOnRequest(subtotal, language)}
                  </span>
                </div>
                {hasPrices && hasUnpricedItems && (
                  <p className="text-xs text-[#6B6B6B] -mt-2">
                    {isAr ? "لا يشمل المنتجات حسب الطلب" : "Hors articles sur demande"}
                  </p>
                )}

                {/* Delivery */}
                <div className="flex items-start justify-between gap-3 text-sm text-[#6B6B6B]">
                  <div>
                    <span>{t('delivery_cost')}</span>
                    {deliveryStage !== "everywhere" && (
                      <p className="text-xs">
                        {isAr
                          ? `الدار البيضاء: مجاني من ${formatPrice(CASABLANCA_FREE_DELIVERY_THRESHOLD)} · باقي المدن: من ${formatPrice(FREE_DELIVERY_THRESHOLD)}`
                          : `Casablanca : gratuite dès ${formatPrice(CASABLANCA_FREE_DELIVERY_THRESHOLD)} · Autres villes : dès ${formatPrice(FREE_DELIVERY_THRESHOLD)}`}
                      </p>
                    )}
                  </div>
                  <span
                    className={`font-semibold text-right ${deliveryStage === "none" ? "text-[#0F0F0F]" : "text-[#10B981]"}`}
                  >
                    {deliveryStage === "everywhere"
                      ? t('delivery_free')
                      : deliveryStage === "casablanca"
                        ? t('delivery_free_casa')
                        : t('delivery_calc')}
                  </span>
                </div>

                {/* Total */}
                <div className="flex items-end justify-between gap-3 pt-3 border-t border-dashed border-[#E8E4DF]">
                  <span className="text-base font-bold text-[#0F0F0F] shop-font-display">{t('total')}</span>
                  <div className="text-right">
                    <span className="block text-2xl font-black text-[#C8102E] tabular-nums leading-tight shop-font-display">
                      {totalLabel}
                    </span>
                    <span className="text-[10px] text-[#6B6B6B]">
                      {deliveryStage === "everywhere"
                        ? isAr ? "التوصيل مجاني · تتضمن الضرائب" : "Livraison offerte · Taxes incluses"
                        : isAr ? "تتضمن الضرائب · بدون التوصيل" : "Taxes incluses · hors livraison"}
                    </span>
                  </div>
                </div>

                {/* Checkout Button */}
                <Link
                  href="/shop/checkout"
                  className="w-full py-4 bg-[#C8102E] text-white font-bold rounded-xl flex items-center justify-center gap-2 hover:bg-[#a00d25] transition-all shadow-lg shadow-[#C8102E]/20 hover:shadow-[#C8102E]/30 hover:-translate-y-0.5 shop-btn-press"
                >
                  <ShoppingBag className="w-5 h-5" />
                  {t('checkout')}
                </Link>

                {/* Guarantees */}
                <div className="grid grid-cols-3 gap-2 pt-3 border-t border-[#E8E4DF]">
                  {[
                    { icon: <Shield className="w-4 h-4" />, label: isAr ? "الدفع عند الاستلام" : "Paiement à la livraison" },
                    { icon: <RefreshCw className="w-4 h-4" />, label: isAr ? "إرجاع 14 يوم" : "Retour 14 jours" },
                    { icon: <Truck className="w-4 h-4" />, label: isAr ? "توصيل سريع" : "Livraison rapide" },
                  ].map(({ icon, label }) => (
                    <div key={label} className="flex flex-col items-center gap-1 text-center">
                      <div className="w-8 h-8 rounded-full bg-[#FBF8F3] border border-[#E8E4DF] flex items-center justify-center text-[#D4A843]">
                        {icon}
                      </div>
                      <span className="text-[10px] text-[#6B6B6B] leading-tight">{label}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* ── Mobile: total + commander toujours visibles, au-dessus de la barre de navigation ── */}
      <div
        className="lg:hidden fixed inset-x-0 z-30 bg-white/95 backdrop-blur-md border-t border-[#E8E4DF] shadow-[0_-4px_20px_rgba(0,0,0,0.06)]"
        style={{ bottom: "calc(3.5rem + env(safe-area-inset-bottom))" }}
      >
        <div className="px-4 py-2.5 flex items-center gap-3">
          <div className="min-w-0">
            <p className="text-[11px] text-[#6B6B6B] leading-tight">
              {t('total')} · {articlesLabel(itemCount, language)}
            </p>
            <p className="text-lg font-black text-[#C8102E] tabular-nums leading-tight truncate shop-font-display">
              {totalLabel}
            </p>
          </div>
          <Link
            href="/shop/checkout"
            className="ml-auto flex-shrink-0 inline-flex items-center gap-1 px-5 py-3 bg-[#C8102E] hover:bg-[#a00d25] text-white text-sm font-bold rounded-xl shadow-lg shadow-[#C8102E]/20 transition-colors shop-btn-press"
          >
            {t('checkout')}
            <ChevronRight className="w-4 h-4" />
          </Link>
        </div>
      </div>
    </div>
  );
}
