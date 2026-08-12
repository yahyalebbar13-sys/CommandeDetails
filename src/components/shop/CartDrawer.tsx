"use client";

import React, { useEffect, useCallback, useMemo } from "react";
import Link from "next/link";
import {
  X,
  ShoppingBag,
  Trash2,
  Plus,
  Minus,
  Truck,
  ChevronRight,
  ShoppingCart,
  Banknote,
  ArrowRight,
} from "lucide-react";
import { useShopCart } from "@/contexts/shop-cart-context";
import { useLanguage } from "@/contexts/language-context";
import { formatPrice, FREE_DELIVERY_THRESHOLD } from "@/lib/shop-utils";
import type { CartItem } from "@/lib/shop-types";

// ─── Sub-components ───────────────────────────────────────────────────────────

/** Grouped product card — shows ONE card per product with all its variant chips */
function CartProductGroup({
  productId,
  items,
  onUpdateQty,
  onRemove,
  totalProductQty,
}: {
  productId: string;
  items: CartItem[];
  onUpdateQty: (id: string, qty: number, variantId?: string) => void;
  onRemove: (id: string, variantId?: string) => void;
  totalProductQty: number;
}) {
  const { language } = useLanguage();
  const first = items[0];
  const nameToDisplay = language === 'ar' && first.productNameAr ? first.productNameAr : first.productName;
  const totalQty = items.reduce((s, i) => s + i.quantity, 0);
  const hasMultipleVariants = items.length > 1 || (items.length === 1 && first.variant?.color);

  const handleRemoveAll = () => {
    items.forEach(item => onRemove(item.productId, item.variant?.variantId));
  };

  return (
    <div className="group py-4 border-b border-gray-100 last:border-0 hover:bg-gray-50/60 -mx-4 px-4 rounded-xl transition-colors" dir={language === 'ar' ? 'rtl' : 'ltr'}>
      {/* Top row: image + name + delete */}
      <div className="flex gap-3 mb-2">
        {/* Product image */}
        <div className="relative flex-shrink-0 w-[64px] h-[64px] rounded-xl overflow-hidden bg-gray-100 border border-gray-200 shadow-sm">
          <img
            src={first.productImage || 'https://picsum.photos/seed/product/64/64'}
            alt={nameToDisplay}
            className="w-full h-full object-cover"
            loading="eager"
            onError={(e) => {
              (e.currentTarget as HTMLImageElement).src =
                "https://picsum.photos/seed/placeholder/64/64";
            }}
          />
          {/* Total qty badge */}
          <div className="absolute -top-1.5 -right-1.5 w-5 h-5 rounded-full bg-[#C8102E] border-2 border-white flex items-center justify-center shadow-sm z-10">
            <span className="text-[9px] font-black text-white">{totalQty}</span>
          </div>
        </div>

        {/* Name + remove all */}
        <div className="flex-1 min-w-0">
          <div className="flex items-start justify-between gap-2">
            <p className="text-sm font-semibold text-gray-900 leading-tight line-clamp-2 flex-1">
              {nameToDisplay}
            </p>
            <button
              onClick={handleRemoveAll}
              className="flex-shrink-0 w-6 h-6 rounded-lg flex items-center justify-center text-gray-300 hover:text-red-500 hover:bg-red-50 transition-all"
              aria-label="Supprimer"
            >
              <Trash2 className="w-3.5 h-3.5" />
            </button>
          </div>
          <p className="text-xs text-gray-400 mt-0.5">
            {language === 'ar' ? 'حسب الطلب' : 'Sur demande'}
          </p>
        </div>
      </div>

      {/* Variant chips (if has colors) */}
      {hasMultipleVariants ? (
        <div className="flex flex-wrap gap-1.5 mt-1 ml-0">
          {items.map((item) => {
            const colorLabel = language === 'ar' && item.variant?.colorAr ? item.variant.colorAr : item.variant?.color;
            const sizeLabel = language === 'ar' && item.variant?.sizeAr ? item.variant.sizeAr : item.variant?.size;
            const label = [colorLabel, sizeLabel].filter(Boolean).join(' · ') || 'Standard';

            return (
              <div
                key={item.variant?.variantId || item.productId}
                className="flex items-center gap-1 bg-gray-50 border border-gray-200 rounded-full pl-1.5 pr-0.5 py-0.5 text-xs"
              >
                {/* Color dot */}
                {item.variant?.colorHex && (
                  <span
                    className="w-3 h-3 rounded-full border border-gray-200 flex-shrink-0"
                    style={{ backgroundColor: item.variant.colorHex }}
                  />
                )}
                {/* Label */}
                <span className="text-gray-600 font-medium truncate max-w-[70px]">{label}</span>

                {/* Qty stepper */}
                <div className="flex items-center ml-0.5 bg-white border border-gray-200 rounded-full overflow-hidden">
                  <button
                    onClick={() => onUpdateQty(item.productId, item.quantity - 1, item.variant?.variantId)}
                    disabled={item.quantity <= 1}
                    className="w-5 h-5 flex items-center justify-center text-gray-400 hover:text-gray-700 disabled:opacity-30 touch-manipulation"
                  >
                    <Minus className="w-2.5 h-2.5" />
                  </button>
                  <span className="w-5 text-center text-[11px] font-bold text-gray-800 tabular-nums">{item.quantity}</span>
                  <button
                    onClick={() => onUpdateQty(item.productId, item.quantity + 1, item.variant?.variantId)}
                    disabled={item.quantity >= item.maxStock}
                    className="w-5 h-5 flex items-center justify-center text-gray-400 hover:text-gray-700 disabled:opacity-30 touch-manipulation"
                  >
                    <Plus className="w-2.5 h-2.5" />
                  </button>
                </div>

                {/* Remove single variant */}
                <button
                  onClick={() => onRemove(item.productId, item.variant?.variantId)}
                  className="w-4 h-4 flex items-center justify-center text-gray-300 hover:text-red-500 rounded-full touch-manipulation"
                >
                  <X className="w-2.5 h-2.5" />
                </button>
              </div>
            );
          })}
        </div>
      ) : (
        /* Single item without variants — simple stepper */
        <div className="flex items-center justify-between mt-1">
          <div className="flex items-center rounded-lg border border-gray-200 overflow-hidden shadow-sm">
            <button
              onClick={() => onUpdateQty(first.productId, first.quantity - 1, first.variant?.variantId)}
              disabled={first.quantity <= 1}
              className="w-7 h-7 flex items-center justify-center text-gray-500 hover:text-gray-800 hover:bg-gray-100 transition-colors disabled:opacity-30 disabled:cursor-not-allowed touch-manipulation"
              aria-label="Diminuer"
            >
              <Minus className="w-3 h-3" />
            </button>
            <span className="w-8 text-center text-sm font-semibold text-gray-800 tabular-nums">
              {first.quantity}
            </span>
            <button
              onClick={() => onUpdateQty(first.productId, first.quantity + 1, first.variant?.variantId)}
              disabled={first.quantity >= first.maxStock}
              className="w-7 h-7 flex items-center justify-center text-gray-500 hover:text-gray-800 hover:bg-gray-100 transition-colors disabled:opacity-30 disabled:cursor-not-allowed touch-manipulation"
              aria-label="Augmenter"
            >
              <Plus className="w-3 h-3" />
            </button>
          </div>
          <p className="text-sm font-bold text-gray-900">
            {language === 'ar' ? 'حسب الطلب' : 'Sur demande'}
          </p>
        </div>
      )}
    </div>
  );
}

/** Progress bar for free delivery */
function FreeDeliveryProgress({ subtotal }: { subtotal: number }) {
  const { t } = useLanguage();
  const progress = Math.min((subtotal / FREE_DELIVERY_THRESHOLD) * 100, 100);
  const remaining = FREE_DELIVERY_THRESHOLD - subtotal;
  const isUnlocked = progress >= 100;

  return (
    <div
      className="px-4 py-3 rounded-xl mb-3"
      style={{
        backgroundColor: isUnlocked ? "rgba(16,185,129,0.07)" : "rgba(212,168,67,0.07)",
        border: `1px solid ${isUnlocked ? "rgba(16,185,129,0.15)" : "rgba(212,168,67,0.15)"}`,
      }}
    >
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-1.5">
          <Truck
            className="w-3.5 h-3.5"
            style={{ color: isUnlocked ? "#10B981" : "#D4A843" }}
          />
          <span
            className="text-xs font-semibold"
            style={{ color: isUnlocked ? "#10B981" : "#D4A843" }}
          >
            {isUnlocked
              ? t('free_delivery_unlocked')
              : t('free_delivery_progress', { amount: formatPrice(remaining) })}
          </span>
        </div>
        <span
          className="text-[10px] font-medium"
          style={{ color: isUnlocked ? "#10B981" : "#D4A843" }}
        >
          {Math.round(progress)}%
        </span>
      </div>
      {/* Progress track */}
      <div className="h-1.5 rounded-full bg-gray-200 overflow-hidden">
        <div
          className="h-full rounded-full transition-all duration-500 ease-out"
          style={{
            width: `${progress}%`,
            backgroundColor: isUnlocked ? "#10B981" : "#D4A843",
          }}
        />
      </div>
    </div>
  );
}

/** Empty cart state */
function EmptyCartState({ onClose }: { onClose: () => void }) {
  const { t } = useLanguage();
  return (
    <div className="flex flex-col items-center justify-center flex-1 py-16 px-6 text-center">
      {/* Illustration */}
      <div className="relative mb-6">
        <div
          className="w-24 h-24 rounded-full flex items-center justify-center mx-auto"
          style={{ backgroundColor: "#FBF8F3" }}
        >
          <ShoppingBag className="w-10 h-10" style={{ color: "#D4A843" }} />
        </div>
        <div
          className="absolute -top-1 -right-1 w-7 h-7 rounded-full flex items-center justify-center border-2 border-white shadow"
          style={{ backgroundColor: "#C8102E" }}
        >
          <span className="text-white text-xs font-bold">0</span>
        </div>
      </div>

      <h3
        className="font-display text-xl font-bold mb-2"
        style={{ color: "#0F0F0F" }}
      >
        {t('cart_empty')}
      </h3>
      <p className="text-sm text-gray-400 mb-8 max-w-[220px] leading-relaxed">
        {t('cart_empty_sub')}
      </p>

      {/* Trust badges */}
      <div className="grid grid-cols-2 gap-2 w-full max-w-[240px] mb-8">
        {[
          { icon: "🚚", textKey: "trust_delivery" },
          { icon: "✅", textKey: "trust_return" },
          { icon: "💬", textKey: "trust_support" },
          { icon: "🔄", textKey: "trust_payment" },
        ].map((badge) => (
          <div
            key={badge.textKey}
            className="flex items-center gap-1.5 p-2 rounded-lg bg-gray-50 border border-gray-100"
          >
            <span className="text-sm">{badge.icon}</span>
            <span className="text-[10px] text-gray-500 leading-tight">
              {t(badge.textKey)}
            </span>
          </div>
        ))}
      </div>

      <Link
        href="/shop/categories"
        onClick={onClose}
        className="flex items-center gap-2 px-6 py-3 rounded-xl text-white text-sm font-semibold transition-all hover:opacity-90 active:scale-[0.98] shadow-lg shadow-red-200"
        style={{ backgroundColor: "#C8102E" }}
      >
        <ShoppingCart className="w-4 h-4" />
        {t('continue_shopping')}
        <ChevronRight className="w-4 h-4" />
      </Link>
    </div>
  );
}

// ─── Main CartDrawer ──────────────────────────────────────────────────────────
export default function CartDrawer() {
  const { items, isOpen, subtotal, itemCount, closeCart, removeItem, updateQty, productQtyMap } =
    useShopCart();
  const { t, language } = useLanguage();
  useEffect(() => {
    if (!isOpen) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") closeCart();
    };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [isOpen, closeCart]);

  // Lock body scroll when open
  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = "hidden";
    } else {
      document.body.style.overflow = "";
    }
    return () => {
      document.body.style.overflow = "";
    };
  }, [isOpen]);

  const handleUpdateQty = useCallback(
    (productId: string, qty: number, variantId?: string) => {
      if (qty < 1) {
        removeItem(productId, variantId);
      } else {
        updateQty(productId, qty, variantId);
      }
    },
    [updateQty, removeItem]
  );

  if (!isOpen) return null;

  return (
    <>
      {/* ── Backdrop overlay ───────────────────────────────────────────────────── */}
      <div
        className="shop-cart-overlay fixed inset-0 z-[60]"
        onClick={closeCart}
        aria-hidden="true"
      />

      {/* ── Drawer panel ───────────────────────────────────────────────────────── */}
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Mon Panier"
        className="shop-slide-in-right fixed right-0 top-0 bottom-0 z-[70] flex flex-col bg-white shadow-2xl"
        style={{ width: "min(420px, 100vw)" }}
      >
        {/* ── Drawer Header ──────────────────────────────────────────────── */}
        <div
          className="flex-shrink-0 flex items-center justify-between px-5 py-4 border-b border-gray-100"
          style={{ paddingTop: "max(1rem, env(safe-area-inset-top))" }}
        >
          <div className="flex items-center gap-2.5">
            <div
              className="w-8 h-8 rounded-lg flex items-center justify-center"
              style={{ backgroundColor: "#C8102E" }}
            >
              <ShoppingBag className="w-4 h-4 text-white" />
            </div>
            <div>
              <h2
                className="font-display text-base font-bold leading-tight"
                style={{ color: "#0F0F0F" }}
              >
                {t('cart_title')}
              </h2>
              {itemCount > 0 && (
                <p className="text-[11px] text-gray-400 leading-none mt-0.5">
                  {itemCount} article{itemCount !== 1 ? "s" : ""}
                </p>
              )}
            </div>
            {/* Item count badge */}
            {itemCount > 0 && (
              <span
                className="ml-1 px-2 py-0.5 rounded-full text-white text-xs font-bold"
                style={{ backgroundColor: "#C8102E" }}
              >
                {itemCount}
              </span>
            )}
          </div>

          <button
            onClick={closeCart}
            className="w-8 h-8 rounded-xl flex items-center justify-center text-gray-400 hover:text-gray-700 hover:bg-gray-100 transition-all"
            aria-label="Fermer le panier"
          >
            <X className="w-4.5 h-4.5" style={{ width: "18px", height: "18px" }} />
          </button>
        </div>

        {/* ── Drawer Body ────────────────────────────────────────────────── */}
        {items.length === 0 ? (
          <EmptyCartState onClose={closeCart} />
        ) : (
          <>
            {/* Scrollable item list */}
            <div className="flex-1 overflow-y-auto shop-scrollbar px-4 py-2">
              {/* Free delivery nudge (top) */}


              {/* Items grouped by product */}
              <div>
                {(() => {
                  const grouped: Record<string, CartItem[]> = {};
                  items.forEach(item => {
                    if (!grouped[item.productId]) grouped[item.productId] = [];
                    grouped[item.productId].push(item);
                  });
                  return Object.entries(grouped).map(([pid, groupItems]) => (
                    <CartProductGroup
                      key={pid}
                      productId={pid}
                      items={groupItems}
                      onUpdateQty={handleUpdateQty}
                      onRemove={removeItem}
                      totalProductQty={productQtyMap?.[pid] || 1}
                    />
                  ));
                })()}
              </div>

              {/* Continue shopping link */}
              <Link
                href="/shop/categories"
                onClick={closeCart}
                className="flex items-center gap-1.5 text-xs font-medium mt-3 mb-2 py-2.5 px-3 rounded-xl border border-dashed border-gray-200 text-gray-400 hover:text-[#C8102E] hover:border-[#C8102E]/30 hover:bg-red-50/50 transition-all"
              >
                <ArrowRight className="w-3.5 h-3.5" />
                {t('continue_shopping')}
              </Link>
            </div>

            {/* ── Drawer Footer (always visible) ─────────────────────────── */}
            <div className="flex-shrink-0 px-4 pt-3 pb-5 border-t border-gray-100 bg-white space-y-3"
              style={{ paddingBottom: "max(1.25rem, env(safe-area-inset-bottom))" }}
            >
              {/* Free delivery bar (bottom) when subtotal > 0 */}


              {/* Order summary */}
              <div className="space-y-1.5">
                <div className="flex items-center justify-between text-sm">
                  <span className="text-gray-500">
                    {t('subtotal')} ({itemCount})
                  </span>
                  <span className="font-semibold text-gray-800">
                    {language === 'ar' ? 'حسب الطلب' : 'Sur demande'}
                  </span>
                </div>
                <div
                  className="h-px my-1"
                  style={{ backgroundColor: "#F3F4F6" }}
                />
                <div className="flex items-center justify-between">
                  <span className="font-bold text-gray-900 text-base">
                    {t('total')}
                  </span>
                  <span
                    className="font-black text-xl"
                    style={{ color: "#C8102E" }}
                  >
                    {language === 'ar' ? 'حسب الطلب' : 'Sur demande'}
                  </span>
                </div>
              </div>

              {/* Aller au panier CTA */}
              <Link
                href="/shop/panier"
                onClick={closeCart}
                className="flex items-center justify-center gap-2 w-full py-3 rounded-2xl bg-white border border-gray-200 text-gray-700 font-bold text-sm transition-all hover:bg-gray-50 hover:border-gray-300 active:scale-[0.98]"
              >
                Aller au panier
              </Link>
              
              {/* Commander CTA */}
              <Link
                href="/shop/checkout"
                onClick={closeCart}
                className="flex items-center justify-center gap-2 w-full py-4 rounded-2xl text-white font-bold text-base transition-all hover:opacity-92 active:scale-[0.98] shadow-lg"
                style={{
                  backgroundColor: "#C8102E",
                  boxShadow: "0 8px 24px -4px rgba(200,16,46,0.35)",
                }}
              >
                {t('checkout')}
                <ChevronRight className="w-5 h-5" />
              </Link>

              {/* Payment assurance */}
              <div className="flex items-center justify-center gap-2 text-xs text-gray-400">
                <Banknote className="w-3.5 h-3.5" style={{ color: "#10B981" }} />
                <span>{t('cod_payment')}</span>
                <span className="text-gray-200">·</span>
                <span>💵 Cash on Delivery</span>
              </div>
            </div>
          </>
        )}
      </div>
    </>
  );
}
