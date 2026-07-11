"use client";

import React, { useState, useCallback } from "react";
import Link from "next/link";
import Image from "next/image";
import { useRouter } from "next/navigation";
import {
  ShoppingBag,
  Trash2,
  Minus,
  Plus,
  ArrowLeft,
  Tag,
  Shield,
  RefreshCw,
  Truck,
  ChevronRight,
  PackageX,
  AlertTriangle,
} from "lucide-react";

import { useShopCart } from "@/contexts/shop-cart-context";
import { useLanguage } from "@/contexts/language-context";
import {
  formatPrice,
  getDeliveryFee,
  isEligibleForFreeDelivery,
  FREE_DELIVERY_THRESHOLD,
} from "@/lib/shop-utils";

// ─── Constants ──────────────────────────────────────────────────────────────
const ESTIMATED_DELIVERY_FEE = 35; // MAD, shown before city is selected

// ─── Cart Item Row ───────────────────────────────────────────────────────────
interface CartItemProps {
  item: ReturnType<typeof useShopCart>["items"][number];
  onUpdateQty: (productId: string, quantity: number) => void;
  onRemove: (productId: string) => void;
  language: string;
  totalProductQty: number;
}

function CartItemRow({ item, onUpdateQty, onRemove, language, totalProductQty }: CartItemProps) {
  const [imgError, setImgError] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);

  const handleQtyChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = parseInt(e.target.value);
    if (!isNaN(val)) {
      onUpdateQty(item.productId, Math.max(1, Math.min(val, item.maxStock)));
    }
  };

  const handleDeleteClick = () => {
    if (confirmDelete) {
      onRemove(item.productId);
    } else {
      setConfirmDelete(true);
      setTimeout(() => setConfirmDelete(false), 3000);
    }
  };

  const isWholesale = item.minOrderQty && totalProductQty >= item.minOrderQty && item.wholesalePrice;
  const effectivePrice = isWholesale ? item.wholesalePrice! : (item.originalPrice || item.price);
  const lineTotal = effectivePrice * item.quantity;

  return (
    <div className="flex gap-4 p-4 bg-white rounded-2xl border border-[#E8E4DF] hover:border-[#C8102E]/20 hover:shadow-md transition-all duration-300 group">
      {/* Product Image */}
      <div className="relative w-24 h-24 flex-shrink-0 rounded-xl overflow-hidden bg-[#FBF8F3] border border-[#E8E4DF]">
        {!imgError && item.productImage ? (
          <Image
            src={item.productImage}
            alt={item.productName}
            fill
            sizes="80px"
            className="object-cover"
            onError={() => setImgError(true)}
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center">
            <ShoppingBag className="w-8 h-8 text-[#D4A843]/40" />
          </div>
        )}
      </div>

      {/* Details */}
      <div className="flex-1 min-w-0">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0" dir={language === 'ar' ? 'rtl' : 'ltr'}>
            <h3 className="font-semibold text-[#0F0F0F] text-sm leading-tight truncate shop-font-display">
              {language === 'ar' && item.productNameAr ? item.productNameAr : item.productName}
            </h3>
            {/* Variant badges */}
            <div className="flex flex-wrap gap-1.5 mt-1.5">
              {item.variant?.color && (
                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-[#FBF8F3] border border-[#E8E4DF] text-xs text-[#6B6B6B]">
                  <span
                    className="w-2.5 h-2.5 rounded-full border border-white shadow-sm"
                    style={{ backgroundColor: item.variant.color.toLowerCase() }}
                  />
                  {language === 'ar' && item.variant.colorAr ? item.variant.colorAr : item.variant.color}
                </span>
              )}
              {item.variant?.size && (
                <span className="inline-flex items-center px-2 py-0.5 rounded-full bg-[#FBF8F3] border border-[#E8E4DF] text-xs text-[#6B6B6B] font-medium">
                  {language === 'ar' && item.variant.sizeAr ? item.variant.sizeAr : item.variant.size}
                </span>
              )}
            </div>
            <p className="text-xs text-[#6B6B6B] mt-1">
              {formatPrice(item.price)} / {language === 'ar' ? 'قطعة' : 'unité'}
            </p>
          </div>

          {/* Line total */}
          <div className="text-right flex-shrink-0">
            <span className="font-bold text-[#C8102E] text-base shop-font-display">
              {formatPrice(lineTotal)}
            </span>
          </div>
        </div>

        {/* Qty & Delete row */}
        <div className="flex items-center justify-between mt-3">
          {/* Qty Stepper */}
          <div className="flex items-center gap-0 border border-[#E8E4DF] rounded-xl overflow-hidden bg-[#FBF8F3]">
            <button
              onClick={() => onUpdateQty(item.productId, item.quantity - 1)}
              disabled={item.quantity <= 1}
              className="w-9 h-9 flex items-center justify-center text-[#6B6B6B] hover:text-[#C8102E] hover:bg-[#C8102E]/5 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
              aria-label="Diminuer la quantité"
            >
              <Minus className="w-3.5 h-3.5" />
            </button>
            <input
              type="number"
              value={item.quantity}
              onChange={handleQtyChange}
              min={1}
              max={item.maxStock}
              className="shop-qty-input w-10 h-9 text-center text-sm font-semibold bg-white border-x border-[#E8E4DF] text-[#0F0F0F] focus:outline-none focus:ring-1 focus:ring-[#C8102E]/30"
              aria-label="Quantité"
            />
            <button
              onClick={() => onUpdateQty(item.productId, item.quantity + 1)}
              disabled={item.quantity >= item.maxStock}
              className="w-9 h-9 flex items-center justify-center text-[#6B6B6B] hover:text-[#C8102E] hover:bg-[#C8102E]/5 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
              aria-label="Augmenter la quantité"
            >
              <Plus className="w-3.5 h-3.5" />
            </button>
          </div>

          {/* Delete */}
          <button
            onClick={handleDeleteClick}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all duration-200 ${
              confirmDelete
                ? "bg-red-50 border border-red-200 text-red-600"
                : "text-[#6B6B6B] hover:text-red-500 hover:bg-red-50"
            }`}
            aria-label={confirmDelete ? "Confirmer la suppression" : "Supprimer l'article"}
          >
            {confirmDelete ? (
              <>
                <AlertTriangle className="w-3.5 h-3.5" />
                {language === 'ar' ? 'تأكيد' : 'Confirmer'}
              </>
            ) : (
              <>
                <Trash2 className="w-3.5 h-3.5" />
                {language === 'ar' ? 'حذف' : 'Supprimer'}
              </>
            )}
          </button>
        </div>

        {/* Stock warning */}
        {item.quantity >= item.maxStock && (
          <p className="text-xs text-amber-600 mt-1.5 flex items-center gap-1">
            <AlertTriangle className="w-3 h-3" />
            {language === 'ar' ? `تم الوصول للحد الأقصى (${item.maxStock} قطع)` : `Stock maximum atteint (${item.maxStock} unités)`}
          </p>
        )}
      </div>
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
  const { items, subtotal, updateQty, removeItem, clearCart, productQtyMap } = useShopCart();
  const router = useRouter();
  const [couponCode, setCouponCode] = useState("");
  const [couponError, setCouponError] = useState("");
  const [clearConfirm, setClearConfirm] = useState(false);

  const freeShipping = isEligibleForFreeDelivery(subtotal);
  const deliveryFee = freeShipping ? 0 : ESTIMATED_DELIVERY_FEE;
  const total = subtotal + deliveryFee;
  const progressToFree = Math.min((subtotal / FREE_DELIVERY_THRESHOLD) * 100, 100);
  const amountToFree = Math.max(FREE_DELIVERY_THRESHOLD - subtotal, 0);
  const itemCount = items.reduce((s, i) => s + i.quantity, 0);

  const handleApplyCoupon = useCallback(() => {
    setCouponError(language === 'ar' ? "الرمز الترويجي غير صالح. لا تتوفر رموز ترويجية حالياً." : "Code promo invalide. Aucun code promo disponible actuellement.");
  }, [language]);

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

  return (
    <div className="min-h-screen bg-[#FBF8F3]">
      {/* ── Header ── */}
      <div className="bg-white border-b border-[#E8E4DF] sticky top-0 z-30 shadow-sm">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Link
              href="/shop/boutique"
              className="flex items-center gap-2 text-sm text-[#6B6B6B] hover:text-[#C8102E] transition-colors"
            >
              <ArrowLeft className="w-4 h-4" />
              <span className="hidden sm:inline">Continuer les achats</span>
            </Link>
            <span className="text-[#E8E4DF]">|</span>
            <h1 className="text-lg font-bold text-[#0F0F0F] shop-font-display flex items-center gap-2">
              <ShoppingBag className="w-5 h-5 text-[#C8102E]" />
              Mon Panier
              <span className="text-sm font-normal text-[#6B6B6B]">
                ({itemCount} article{itemCount > 1 ? "s" : ""})
              </span>
            </h1>
          </div>
          {/* Progress steps */}
          <div className="hidden md:flex items-center gap-2 text-xs">
            <span className="flex items-center gap-1.5 font-semibold text-[#C8102E]">
              <span className="w-5 h-5 rounded-full bg-[#C8102E] text-white flex items-center justify-center text-xs">1</span>
              Panier
            </span>
            <ChevronRight className="w-3 h-3 text-[#E8E4DF]" />
            <span className="flex items-center gap-1.5 text-[#6B6B6B]">
              <span className="w-5 h-5 rounded-full bg-[#E8E4DF] text-[#6B6B6B] flex items-center justify-center text-xs">2</span>
              Livraison
            </span>
            <ChevronRight className="w-3 h-3 text-[#E8E4DF]" />
            <span className="flex items-center gap-1.5 text-[#6B6B6B]">
              <span className="w-5 h-5 rounded-full bg-[#E8E4DF] text-[#6B6B6B] flex items-center justify-center text-xs">3</span>
              Confirmation
            </span>
          </div>
        </div>
      </div>

      {/* ── Content ── */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">

          {/* ── Left: Cart Items ── */}
          <div className="lg:col-span-2 space-y-4">

            {/* Free delivery banner */}
            {!freeShipping && (
              <div className="bg-gradient-to-r from-[#D4A843]/10 to-[#D4A843]/5 border border-[#D4A843]/30 rounded-2xl p-4">
                <div className="flex items-center gap-3 mb-2">
                  <Truck className="w-4 h-4 text-[#D4A843]" />
                  <span className="text-sm font-semibold text-[#0F0F0F]">
                    Plus que{" "}
                    <span className="text-[#C8102E]">{formatPrice(amountToFree)}</span>{" "}
                    pour la livraison gratuite !
                  </span>
                </div>
                <div className="w-full bg-white/60 rounded-full h-2 overflow-hidden">
                  <div
                    className="h-full bg-gradient-to-r from-[#D4A843] to-[#C8102E] rounded-full transition-all duration-500"
                    style={{ width: `${progressToFree}%` }}
                  />
                </div>
              </div>
            )}

            {/* Header */}
            <div className="flex items-center justify-between mb-6">
              <h1 className="text-2xl font-bold text-[#0F0F0F] shop-font-display flex items-center gap-2">
                {t('cart')}
                <span className="text-sm font-medium px-2.5 py-0.5 rounded-full bg-[#C8102E]/10 text-[#C8102E]">
                  {itemCount}
                </span>
              </h1>
              <button
                onClick={handleClearCart}
                className={`text-sm font-medium flex items-center gap-1.5 transition-colors ${
                  clearConfirm ? "text-[#C8102E]" : "text-[#6B6B6B] hover:text-[#C8102E]"
                }`}
              >
                <Trash2 className="w-4 h-4" />
                {clearConfirm ? (language === 'ar' ? 'تأكيد التفريغ' : 'Confirmer le vidage') : (language === 'ar' ? 'تفريغ السلة' : 'Vider le panier')}
              </button>
            </div>

            {/* Items list */}
            <div className="space-y-3">
              {items.map((item) => (
                <CartItemRow
                  key={`${item.productId}-${item.variant?.color}-${item.variant?.size}`}
                  item={item}
                  onUpdateQty={updateQty}
                  onRemove={removeItem}
                  language={language}
                  totalProductQty={productQtyMap?.[item.productId] || 1}
                />
              ))}
            </div>

            {/* Clear cart */}
            <div className="flex items-center justify-between pt-2">
              <button
                onClick={handleClearCart}
                className={`flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium transition-all duration-200 ${
                  clearConfirm
                    ? "bg-red-50 border border-red-200 text-red-600"
                    : "text-[#6B6B6B] hover:text-red-500 hover:bg-red-50 border border-transparent"
                }`}
              >
                {clearConfirm ? (
                  <>
                    <AlertTriangle className="w-4 h-4" />
                    Confirmer la suppression de tout le panier
                  </>
                ) : (
                  <>
                    <Trash2 className="w-4 h-4" />
                    Vider le panier
                  </>
                )}
              </button>
              <Link
                href="/shop/boutique"
                className="text-sm text-[#C8102E] hover:text-[#a00d25] font-medium flex items-center gap-1 transition-colors"
              >
                <Plus className="w-3.5 h-3.5" />
                Ajouter des articles
              </Link>
            </div>
          </div>

          {/* ── Right: Order Summary ── */}
          <div className="lg:col-span-1">
            <div className="sticky top-24 space-y-4">
              {/* Summary card */}
              <div className="bg-white rounded-2xl border border-[#E8E4DF] overflow-hidden shadow-sm">
                <div className="px-5 py-4 border-b border-[#E8E4DF] bg-gradient-to-r from-[#0F0F0F] to-[#1a1a1a]">
                  <h2 className="text-white font-bold shop-font-display">Récapitulatif</h2>
                </div>

                <div className="p-5 space-y-4">
                  {/* Subtotal */}
                  <div className="flex items-center justify-between text-[#6B6B6B]">
                    <span>{t('subtotal')} ({itemCount})</span>
                    <span className="font-semibold text-[#0F0F0F]">{formatPrice(subtotal)}</span>
                  </div>

                  {/* Delivery */}
                  <div className="flex items-center justify-between text-[#6B6B6B]">
                    <span className="flex items-center gap-1.5">
                      {t('delivery_cost')}
                      <span className="group relative inline-flex items-center justify-center w-4 h-4 rounded-full border border-[#D4A843] text-[#D4A843] text-[10px] cursor-help">
                        i
                        <span className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 w-48 p-2 bg-[#1A1A1A] text-white text-xs rounded-lg opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all shadow-xl z-10 pointer-events-none">
                          {language === 'ar' ? 'توصيل مجاني للطلبات فوق 500 درهم!' : 'Livraison gratuite à partir de 500 DH d\'achats !'}
                        </span>
                      </span>
                    </span>
                    <span className={`font-semibold ${freeShipping ? "text-[#10B981]" : "text-[#0F0F0F]"}`}>
                      {freeShipping ? t('delivery_free') : formatPrice(ESTIMATED_DELIVERY_FEE)}
                    </span>
                  </div>

                  {/* Progress bar */}
                  {!freeShipping && (
                    <div className="bg-[#FBF8F3] rounded-xl p-3 border border-[#E8E4DF]">
                      <div className="flex items-center justify-between text-xs text-[#6B6B6B] mb-2">
                        <span>Progression livraison gratuite</span>
                        <span className="font-semibold text-[#C8102E]">
                          {formatPrice(amountToFree)} restants
                        </span>
                      </div>
                      <div className="w-full bg-[#E8E4DF] rounded-full h-2 overflow-hidden">
                        <div
                          className="h-full bg-gradient-to-r from-[#D4A843] to-[#C8102E] rounded-full transition-all duration-700"
                          style={{ width: `${progressToFree}%` }}
                        />
                      </div>
                      <p className="text-xs text-[#6B6B6B] mt-1.5 flex items-center gap-1">
                        <Truck className="w-3 h-3" />
                        Livraison gratuite dès {formatPrice(FREE_DELIVERY_THRESHOLD)} d&apos;achat
                      </p>
                    </div>
                  )}

                  <div className="my-5 border-t border-[#E8E4DF] border-dashed" />

                  {/* Total */}
                  <div className="flex items-center justify-between mb-8">
                    <span className="text-lg font-bold text-[#0F0F0F] shop-font-display">{t('total')}</span>
                    <div className="text-right">
                      <span className="text-2xl font-black text-[#C8102E] shop-font-display">{formatPrice(total)}</span>
                      <p className="text-[10px] text-[#6B6B6B] mt-1">{language === 'ar' ? 'تتضمن الضرائب' : 'Taxes incluses'}</p>
                    </div>
                  </div>

                  {/* Coupon */}
                  <div className="mb-4">
                    <label className="text-xs font-medium text-[#6B6B6B] flex items-center gap-1 mb-2">
                      <Tag className="w-3 h-3" />
                      Code promo
                    </label>
                    <div className="flex gap-2">
                      <input
                        type="text"
                        value={couponCode}
                        onChange={(e) => {
                          setCouponCode(e.target.value.toUpperCase());
                          setCouponError("");
                        }}
                        placeholder="ex: LEBTEX10"
                        className="flex-1 px-3 py-2.5 text-sm border border-[#E8E4DF] rounded-xl bg-[#FBF8F3] focus:outline-none focus:ring-2 focus:ring-[#C8102E]/20 focus:border-[#C8102E]/40 placeholder:text-[#6B6B6B]/50 transition-all"
                      />
                      <button
                        onClick={handleApplyCoupon}
                        disabled={!couponCode}
                        className="px-4 py-2.5 bg-[#0F0F0F] hover:bg-[#1a1a1a] text-white text-sm font-medium rounded-xl disabled:opacity-40 disabled:cursor-not-allowed transition-all duration-200"
                      >
                        Appliquer
                      </button>
                    </div>
                    {couponError && (
                      <p className="text-xs text-red-500 mt-1.5 flex items-center gap-1">
                        ✗ {couponError}
                      </p>
                    )}
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
                  <div className="grid grid-cols-3 gap-2 pt-2 mt-4 border-t border-[#E8E4DF]">
                    {[
                      { icon: <Shield className="w-4 h-4" />, label: language === 'ar' ? "الدفع عند الاستلام" : "Paiement à la livraison" },
                      { icon: <RefreshCw className="w-4 h-4" />, label: language === 'ar' ? "إرجاع 14 يوم" : "Retour 14 jours" },
                      { icon: <Truck className="w-4 h-4" />, label: language === 'ar' ? "توصيل سريع" : "Livraison rapide" },
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
      </div>
    </div>
  );
}
