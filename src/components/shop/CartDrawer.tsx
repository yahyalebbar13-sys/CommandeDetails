"use client";

import React, { useEffect, useCallback } from "react";
import Link from "next/link";
import Image from "next/image";
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

/** Single cart line item */
function CartLineItem({
  item,
  onUpdateQty,
  onRemove,
}: {
  item: CartItem;
  onUpdateQty: (id: string, qty: number) => void;
  onRemove: (id: string) => void;
}) {
  const lineTotal = item.price * item.quantity;

  return (
    <div className="group flex gap-3 py-4 border-b border-gray-100 last:border-0 hover:bg-gray-50/60 -mx-4 px-4 rounded-xl transition-colors">
      {/* Product image */}
      <div className="relative flex-shrink-0 w-[72px] h-[72px] rounded-xl overflow-hidden bg-gray-100 border border-gray-200 shadow-sm">
        <Image
          src={item.productImage}
          alt={item.productName}
          fill
          className="object-cover"
          sizes="72px"
          onError={(e) => {
            (e.currentTarget as HTMLImageElement).src =
              "https://picsum.photos/seed/placeholder/72/72";
          }}
        />
        {/* Qty badge */}
        {item.quantity > 1 && (
          <div
            className="absolute -top-1.5 -right-1.5 w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold text-white shadow"
            style={{ backgroundColor: "#C8102E" }}
          >
            {item.quantity}
          </div>
        )}
      </div>

      {/* Info */}
      <div className="flex-1 min-w-0">
        <div className="flex items-start justify-between gap-2 mb-1">
          <p className="text-sm font-semibold text-gray-900 leading-tight line-clamp-2 flex-1">
            {item.productName}
          </p>
          {/* Delete */}
          <button
            onClick={() => onRemove(item.productId)}
            className="flex-shrink-0 w-6 h-6 rounded-lg flex items-center justify-center text-gray-300 hover:text-red-500 hover:bg-red-50 transition-all opacity-0 group-hover:opacity-100"
            aria-label="Supprimer"
          >
            <Trash2 className="w-3.5 h-3.5" />
          </button>
        </div>

        {/* Variant */}
        {(item.variant?.color || item.variant?.size) && (
          <p className="text-xs text-gray-400 mb-2 flex items-center gap-1">
            {item.variant.color && (
              <span className="inline-flex items-center gap-1">
                <span
                  className="w-2.5 h-2.5 rounded-full border border-gray-200 flex-shrink-0"
                  style={{
                    backgroundColor: item.variant.color?.startsWith("#")
                      ? item.variant.color
                      : undefined,
                  }}
                />
                {item.variant.color}
              </span>
            )}
            {item.variant.color && item.variant.size && (
              <span className="text-gray-300">·</span>
            )}
            {item.variant.size && <span>{item.variant.size}</span>}
          </p>
        )}

        {/* Price + qty stepper */}
        <div className="flex items-center justify-between">
          {/* Qty stepper */}
          <div className="flex items-center rounded-lg border border-gray-200 overflow-hidden shadow-sm">
            <button
              onClick={() => onUpdateQty(item.productId, item.quantity - 1)}
              disabled={item.quantity <= 1}
              className="w-7 h-7 flex items-center justify-center text-gray-500 hover:text-gray-800 hover:bg-gray-100 transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
              aria-label="Diminuer"
            >
              <Minus className="w-3 h-3" />
            </button>
            <span className="w-8 text-center text-sm font-semibold text-gray-800 tabular-nums">
              {item.quantity}
            </span>
            <button
              onClick={() => onUpdateQty(item.productId, item.quantity + 1)}
              disabled={item.quantity >= item.maxStock}
              className="w-7 h-7 flex items-center justify-center text-gray-500 hover:text-gray-800 hover:bg-gray-100 transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
              aria-label="Augmenter"
            >
              <Plus className="w-3 h-3" />
            </button>
          </div>

          {/* Line total */}
          <div className="text-right">
            <p className="text-sm font-bold text-gray-900">
              {formatPrice(lineTotal)}
            </p>
            {item.quantity > 1 && (
              <p className="text-[10px] text-gray-400">
                {formatPrice(item.price)} / u
              </p>
            )}
          </div>
        </div>
      </div>
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
        href="/shop/boutique"
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
  const { items, isOpen, subtotal, itemCount, closeCart, removeItem, updateQty } =
    useShopCart();
  const { t } = useLanguage();

  // Close on Escape key
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
    (productId: string, qty: number) => {
      if (qty < 1) {
        removeItem(productId);
      } else {
        updateQty(productId, qty);
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
              {subtotal < FREE_DELIVERY_THRESHOLD && (
                <div className="mt-2 mb-1">
                  <FreeDeliveryBar subtotal={subtotal} />
                </div>
              )}

              {/* Items */}
              <div>
                {items.map((item) => (
                  <CartLineItem
                    key={`${item.productId}-${item.variant?.color}-${item.variant?.size}`}
                    item={item}
                    onUpdateQty={handleUpdateQty}
                    onRemove={removeItem}
                  />
                ))}
              </div>

              {/* Continue shopping link */}
              <Link
                href="/shop/boutique"
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
              <FreeDeliveryBar subtotal={subtotal} />

              {/* Order summary */}
              <div className="space-y-1.5">
                <div className="flex items-center justify-between text-sm">
                  <span className="text-gray-500">
                    {t('subtotal')} ({itemCount})
                  </span>
                  <span className="font-semibold text-gray-800">
                    {formatPrice(subtotal)}
                  </span>
                </div>
                <div className="flex items-center justify-between text-sm">
                  <span className="text-gray-500">{t('delivery_cost')}</span>
                  <span
                    className="text-xs font-semibold"
                    style={{
                      color:
                        subtotal >= FREE_DELIVERY_THRESHOLD
                          ? "#10B981"
                          : "#6B7280",
                    }}
                  >
                    {subtotal >= FREE_DELIVERY_THRESHOLD
                       ? t('delivery_free')
                       : t('delivery_calc')}
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
                    {formatPrice(subtotal)}
                  </span>
                </div>
              </div>

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
