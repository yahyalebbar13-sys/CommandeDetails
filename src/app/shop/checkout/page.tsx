"use client";

import React, { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import Image from "next/image";
import { useRouter } from "next/navigation";
import {
  ChevronRight,
  ShoppingBag,
  Truck,
  User,
  MapPin,
  Phone,
  Mail,
  DollarSign,
  FileText,
  Shield,
  CheckCircle2,
  AlertCircle,
  Loader2,
  ArrowLeft,
  Package,
} from "lucide-react";

import { initializeApp, getApps, getApp } from "firebase/app";
import { getFirestore, collection, addDoc, serverTimestamp } from "firebase/firestore";
import { firebaseConfig } from "@/firebase/config";

import { useShopCart } from "@/contexts/shop-cart-context";
import {
  formatPrice,
  getDeliveryFee,
  getDeliveryDays,
  isEligibleForFreeDelivery,
  generateOrderNumber,
  MOROCCAN_CITIES,
} from "@/lib/shop-utils";
import type { ShippingAddress } from "@/lib/shop-types";

// ─── Firebase init ────────────────────────────────────────────────────────────
const app = getApps().length ? getApp() : initializeApp(firebaseConfig);
const db = getFirestore(app);

// ─── Types ───────────────────────────────────────────────────────────────────
interface FormData {
  firstName: string;
  lastName: string;
  phone: string;
  phone2: string;
  email: string;
  address: string;
  city: string;
  region: string;
  postalCode: string;
  notes: string;
  acceptTerms: boolean;
}

type FormErrors = Partial<Record<keyof FormData, string>>;

// ─── Progress Steps ───────────────────────────────────────────────────────────
function ProgressSteps({ step }: { step: 1 | 2 | 3 }) {
  const steps = [
    { label: "Panier", num: 1 },
    { label: "Livraison", num: 2 },
    { label: "Confirmation", num: 3 },
  ];
  return (
    <div className="flex items-center gap-0">
      {steps.map((s, idx) => (
        <React.Fragment key={s.num}>
          <div className="flex items-center gap-2">
            <div
              className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold transition-all ${
                s.num < step
                  ? "bg-green-500 text-white"
                  : s.num === step
                  ? "bg-[#C8102E] text-white shadow-lg shadow-[#C8102E]/30"
                  : "bg-[#E8E4DF] text-[#6B6B6B]"
              }`}
            >
              {s.num < step ? <CheckCircle2 className="w-4 h-4" /> : s.num}
            </div>
            <span
              className={`text-xs font-medium hidden sm:inline ${
                s.num === step ? "text-[#C8102E]" : "text-[#6B6B6B]"
              }`}
            >
              {s.label}
            </span>
          </div>
          {idx < steps.length - 1 && (
            <div
              className={`w-8 h-0.5 mx-2 transition-colors ${
                s.num < step ? "bg-green-400" : "bg-[#E8E4DF]"
              }`}
            />
          )}
        </React.Fragment>
      ))}
    </div>
  );
}

// ─── Section Header ───────────────────────────────────────────────────────────
function SectionHeader({ icon, title, subtitle }: { icon: React.ReactNode; title: string; subtitle?: string }) {
  return (
    <div className="flex items-start gap-3 mb-5">
      <div className="w-9 h-9 rounded-xl bg-[#C8102E]/10 border border-[#C8102E]/20 flex items-center justify-center text-[#C8102E] flex-shrink-0 mt-0.5">
        {icon}
      </div>
      <div>
        <h2 className="font-bold text-[#0F0F0F] shop-font-display">{title}</h2>
        {subtitle && <p className="text-xs text-[#6B6B6B] mt-0.5">{subtitle}</p>}
      </div>
    </div>
  );
}

// ─── Input Field ─────────────────────────────────────────────────────────────
interface InputFieldProps {
  label: string;
  required?: boolean;
  error?: string;
  children: React.ReactNode;
}
function InputField({ label, required, error, children }: InputFieldProps) {
  return (
    <div>
      <label className="block text-sm font-medium text-[#0F0F0F] mb-1.5">
        {label}
        {required && <span className="text-[#C8102E] ml-1">*</span>}
        {!required && <span className="text-[#6B6B6B] text-xs ml-1.5">(optionnel)</span>}
      </label>
      {children}
      {error && (
        <p className="text-xs text-red-500 mt-1 flex items-center gap-1">
          <AlertCircle className="w-3 h-3" />
          {error}
        </p>
      )}
    </div>
  );
}

const inputCls = (error?: string) =>
  `w-full px-4 py-3 text-sm border rounded-xl bg-[#FBF8F3] text-[#0F0F0F] placeholder:text-[#6B6B6B]/50 focus:outline-none focus:ring-2 transition-all ${
    error
      ? "border-red-300 focus:ring-red-200 focus:border-red-400"
      : "border-[#E8E4DF] focus:ring-[#C8102E]/20 focus:border-[#C8102E]/40"
  }`;

// ─── Validation ───────────────────────────────────────────────────────────────
function validate(form: FormData): FormErrors {
  const errors: FormErrors = {};
  if (!form.firstName.trim()) errors.firstName = "Le prénom est requis";
  if (!form.lastName.trim()) errors.lastName = "Le nom est requis";
  if (!form.phone.trim()) {
    errors.phone = "Le téléphone est requis";
  } else if (!/^(06|07)\d{8}$/.test(form.phone.replace(/[\s\-]/g, ""))) {
    errors.phone = "Format invalide — commencez par 06 ou 07 (10 chiffres)";
  }
  if (form.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email)) {
    errors.email = "Adresse email invalide";
  }
  if (!form.address.trim()) errors.address = "L'adresse est requise";
  if (!form.city) errors.city = "La ville est requise";
  if (!form.acceptTerms) errors.acceptTerms = "Vous devez accepter les conditions";
  return errors;
}

// ─── Order Summary sidebar ────────────────────────────────────────────────────
interface SummaryPanelProps {
  items: ReturnType<typeof useShopCart>["items"];
  subtotal: number;
  city: string;
}
function SummaryPanel({ items, subtotal, city }: SummaryPanelProps) {
  const freeShipping = isEligibleForFreeDelivery(subtotal);
  const deliveryFee = city
    ? freeShipping ? 0 : getDeliveryFee(city)
    : freeShipping ? 0 : 35;
  const deliveryDays = city ? getDeliveryDays(city) : "24–72h";
  const total = subtotal + deliveryFee;
  const itemCount = items.reduce((s, i) => s + i.quantity, 0);

  return (
    <div className="bg-white rounded-2xl border border-[#E8E4DF] overflow-hidden shadow-sm">
      {/* Header */}
      <div className="px-5 py-4 bg-gradient-to-r from-[#0F0F0F] to-[#1a1a1a]">
        <h2 className="text-white font-bold shop-font-display flex items-center gap-2">
          <Package className="w-4 h-4 text-[#D4A843]" />
          Votre commande
        </h2>
        <p className="text-[#6B6B6B] text-xs mt-0.5">
          {itemCount} article{itemCount > 1 ? "s" : ""}
        </p>
      </div>

      {/* Items */}
      <div className="divide-y divide-[#E8E4DF] max-h-72 overflow-y-auto shop-scrollbar">
        {items.map((item) => (
          <div
            key={`${item.productId}-${item.variant?.color}-${item.variant?.size}`}
            className="flex gap-3 px-5 py-3"
          >
            {/* Thumb */}
            <div className="relative w-12 h-12 flex-shrink-0 rounded-lg overflow-hidden bg-[#FBF8F3] border border-[#E8E4DF]">
              {item.productImage ? (
                <Image
                  src={item.productImage}
                  alt={item.productName}
                  fill
                  className="object-cover"
                />
              ) : (
                <div className="w-full h-full flex items-center justify-center">
                  <ShoppingBag className="w-4 h-4 text-[#D4A843]/40" />
                </div>
              )}
              {/* Qty badge */}
              <span className="absolute -top-1.5 -right-1.5 w-4.5 h-4.5 min-w-[1.125rem] bg-[#C8102E] text-white text-[9px] font-bold rounded-full flex items-center justify-center px-1">
                {item.quantity}
              </span>
            </div>
            {/* Info */}
            <div className="flex-1 min-w-0">
              <p className="text-xs font-semibold text-[#0F0F0F] truncate">{item.productName}</p>
              {(item.variant?.color || item.variant?.size) && (
                <p className="text-[10px] text-[#6B6B6B] mt-0.5">
                  {[item.variant.color, item.variant.size].filter(Boolean).join(" · ")}
                </p>
              )}
            </div>
            <span className="text-xs font-bold text-[#0F0F0F] flex-shrink-0">
              {formatPrice(item.price * item.quantity)}
            </span>
          </div>
        ))}
      </div>

      {/* Totals */}
      <div className="px-5 py-4 border-t border-[#E8E4DF] space-y-2.5">
        <div className="flex items-center justify-between text-sm">
          <span className="text-[#6B6B6B]">Sous-total</span>
          <span className="font-semibold text-[#0F0F0F]">{formatPrice(subtotal)}</span>
        </div>
        <div className="flex items-center justify-between text-sm">
          <span className="text-[#6B6B6B] flex items-center gap-1.5">
            <Truck className="w-3.5 h-3.5" />
            Livraison{city ? ` — ${city}` : ""}
          </span>
          {freeShipping ? (
            <span className="font-semibold text-green-600">GRATUIT 🎉</span>
          ) : (
            <span className="font-semibold text-[#0F0F0F]">{formatPrice(deliveryFee)}</span>
          )}
        </div>
        {city && (
          <div className="flex items-center justify-between text-xs text-[#6B6B6B]">
            <span className="flex items-center gap-1.5">
              <Truck className="w-3 h-3" />
              Délai estimé
            </span>
            <span className="font-medium text-[#0F0F0F]">{deliveryDays}</span>
          </div>
        )}
        <div className="border-t border-[#E8E4DF] pt-2.5 flex items-center justify-between">
          <span className="font-bold text-[#0F0F0F]">Total</span>
          <div className="text-right">
            <span className="font-bold text-[#C8102E] text-xl shop-font-display">
              {formatPrice(total)}
            </span>
            <p className="text-[10px] text-[#6B6B6B]">Paiement à la livraison</p>
          </div>
        </div>
      </div>

      {/* Trust badges */}
      <div className="px-5 pb-5">
        <div className="flex items-center gap-2 bg-[#FBF8F3] border border-[#E8E4DF] rounded-xl px-3 py-2">
          <Shield className="w-4 h-4 text-[#D4A843] flex-shrink-0" />
          <p className="text-[10px] text-[#6B6B6B] leading-tight">
            100% sécurisé — Paiement en cash à la réception de votre commande
          </p>
        </div>
      </div>
    </div>
  );
}

// ─── Main Checkout Page ───────────────────────────────────────────────────────
export default function CheckoutPage() {
  const router = useRouter();
  const { items, subtotal, clearCart } = useShopCart();

  const [form, setForm] = useState<FormData>({
    firstName: "",
    lastName: "",
    phone: "",
    phone2: "",
    email: "",
    address: "",
    city: "",
    region: "",
    postalCode: "",
    notes: "",
    acceptTerms: false,
  });
  const [errors, setErrors] = useState<FormErrors>({});
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [orderSuccess, setOrderSuccess] = useState(false);

  // Redirect if cart empty
  useEffect(() => {
    if (items.length === 0 && !orderSuccess) {
      router.replace("/shop/panier");
    }
  }, [items.length, router, orderSuccess]);

  const setField = useCallback(
    <K extends keyof FormData>(key: K, value: FormData[K]) => {
      setForm((prev) => ({ ...prev, [key]: value }));
      setErrors((prev) => {
        const next = { ...prev };
        delete next[key];
        return next;
      });
    },
    []
  );

  const handleSubmit = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault();
      setSubmitError(null);

      const validationErrors = validate(form);
      if (Object.keys(validationErrors).length > 0) {
        setErrors(validationErrors);
        // Scroll to first error
        const firstErrorEl = document.querySelector('[data-error="true"]');
        firstErrorEl?.scrollIntoView({ behavior: "smooth", block: "center" });
        return;
      }

      setIsSubmitting(true);

      try {
        const freeShipping = isEligibleForFreeDelivery(subtotal);
        const deliveryFee = freeShipping ? 0 : getDeliveryFee(form.city);
        const total = subtotal + deliveryFee;
        const orderNumber = generateOrderNumber();

        const shippingAddress: ShippingAddress = {
          fullName: `${form.firstName.trim()} ${form.lastName.trim()}`,
          phone: form.phone.trim(),
          ...(form.phone2.trim() ? { phone2: form.phone2.trim() } : {}),
          address: form.address.trim(),
          city: form.city,
          ...(form.region.trim() ? { region: form.region.trim() } : {}),
          ...(form.postalCode.trim() ? { postalCode: form.postalCode.trim() } : {}),
        };

        const docRef = await addDoc(collection(db, "shop_orders"), {
          orderNumber,
          customerName: shippingAddress.fullName,
          customerPhone: form.phone.trim(),
          customerEmail: form.email.trim() || null,
          shippingAddress,
          items: items.map((item) => ({
            productId: item.productId,
            productName: item.productName,
            productImage: item.productImage,
            price: item.price,
            quantity: item.quantity,
            variant: item.variant ?? null,
            maxStock: item.maxStock,
          })),
          subtotal,
          deliveryFee,
          total,
          paymentMethod: "cod",
          status: "pending",
          notes: form.notes.trim() || null,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        });

        // Save customer info for auto-tracking on suivi page
        localStorage.setItem('lebtex_customer_phone', form.phone.trim());
        localStorage.setItem('lebtex_last_order_id', docRef.id);
        localStorage.setItem('lebtex_last_order_number', orderNumber);

        // IMPORTANT: redirect FIRST, then clear cart
        // If we clearCart first, items.length === 0 causes the component to unmount before navigation
        setOrderSuccess(true);
        clearCart();
        router.push(`/shop/confirmation/${docRef.id}`);
      } catch (err) {
        console.error("Order submission error:", err);
        setSubmitError(
          "Une erreur s'est produite lors de la validation de votre commande. Veuillez réessayer ou nous contacter sur WhatsApp."
        );
        setIsSubmitting(false);
      }
    },
    [form, items, subtotal, clearCart, router]
  );

  if (items.length === 0 && !orderSuccess) return null;

  return (
    <div className="min-h-screen bg-[#FBF8F3]">
      {/* ── Header ── */}
      <div className="bg-white border-b border-[#E8E4DF] sticky top-0 z-30 shadow-sm">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Link
              href="/shop/panier"
              className="flex items-center gap-2 text-sm text-[#6B6B6B] hover:text-[#C8102E] transition-colors"
            >
              <ArrowLeft className="w-4 h-4" />
              <span className="hidden sm:inline">Retour au panier</span>
            </Link>
            <span className="text-[#E8E4DF]">|</span>
            <h1 className="text-lg font-bold text-[#0F0F0F] shop-font-display">
              Finaliser la commande
            </h1>
          </div>
          <ProgressSteps step={2} />
        </div>
      </div>

      {/* ── Content ── */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <form onSubmit={handleSubmit} noValidate>
          <div className="grid grid-cols-1 lg:grid-cols-5 gap-8">

            {/* ── Left: Form (60%) ── */}
            <div className="lg:col-span-3 space-y-6">

              {/* ── Section 1: Personal Info ── */}
              <div className="bg-white rounded-2xl border border-[#E8E4DF] p-6 shadow-sm">
                <SectionHeader
                  icon={<User className="w-4 h-4" />}
                  title="Informations personnelles"
                  subtitle="Vos coordonnées pour le suivi de commande"
                />
                <div className="space-y-4">
                  <div className="grid grid-cols-2 gap-4">
                    <InputField label="Prénom" required error={errors.firstName}>
                      <input
                        type="text"
                        value={form.firstName}
                        onChange={(e) => setField("firstName", e.target.value)}
                        placeholder="Yassine"
                        data-error={!!errors.firstName}
                        className={inputCls(errors.firstName)}
                        autoComplete="given-name"
                      />
                    </InputField>
                    <InputField label="Nom" required error={errors.lastName}>
                      <input
                        type="text"
                        value={form.lastName}
                        onChange={(e) => setField("lastName", e.target.value)}
                        placeholder="El Idrissi"
                        data-error={!!errors.lastName}
                        className={inputCls(errors.lastName)}
                        autoComplete="family-name"
                      />
                    </InputField>
                  </div>

                  <InputField
                    label="Téléphone principal"
                    required
                    error={errors.phone}
                  >
                    <div className="relative">
                      <div className="absolute left-3 top-1/2 -translate-y-1/2 flex items-center gap-1 pointer-events-none">
                        <span className="text-sm">🇲🇦</span>
                        <span className="text-xs text-[#6B6B6B] font-medium">+212</span>
                      </div>
                      <input
                        type="tel"
                        value={form.phone}
                        onChange={(e) => setField("phone", e.target.value)}
                        placeholder="06 XX XX XX XX"
                        data-error={!!errors.phone}
                        className={`${inputCls(errors.phone)} pl-[4.5rem]`}
                        autoComplete="tel"
                        maxLength={14}
                      />
                    </div>
                  </InputField>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <InputField label="Téléphone secondaire" error={errors.phone2}>
                      <div className="relative">
                        <Phone className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[#6B6B6B]/40 pointer-events-none" />
                        <input
                          type="tel"
                          value={form.phone2}
                          onChange={(e) => setField("phone2", e.target.value)}
                          placeholder="07 XX XX XX XX"
                          className={`${inputCls(errors.phone2)} pl-10`}
                          autoComplete="tel"
                          maxLength={14}
                        />
                      </div>
                    </InputField>
                    <InputField label="Email" error={errors.email}>
                      <div className="relative">
                        <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[#6B6B6B]/40 pointer-events-none" />
                        <input
                          type="email"
                          value={form.email}
                          onChange={(e) => setField("email", e.target.value)}
                          placeholder="vous@exemple.com"
                          className={`${inputCls(errors.email)} pl-10`}
                          autoComplete="email"
                        />
                      </div>
                    </InputField>
                  </div>
                </div>
              </div>

              {/* ── Section 2: Shipping Address ── */}
              <div className="bg-white rounded-2xl border border-[#E8E4DF] p-6 shadow-sm">
                <SectionHeader
                  icon={<MapPin className="w-4 h-4" />}
                  title="Adresse de livraison"
                  subtitle="Où souhaitez-vous recevoir votre commande ?"
                />
                <div className="space-y-4">
                  <InputField label="Adresse complète" required error={errors.address}>
                    <input
                      type="text"
                      value={form.address}
                      onChange={(e) => setField("address", e.target.value)}
                      placeholder="N° X, Rue ..., Quartier ..."
                      data-error={!!errors.address}
                      className={inputCls(errors.address)}
                      autoComplete="street-address"
                    />
                  </InputField>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <InputField label="Ville" required error={errors.city}>
                      <select
                        value={form.city}
                        onChange={(e) => setField("city", e.target.value)}
                        data-error={!!errors.city}
                        className={inputCls(errors.city)}
                        autoComplete="address-level2"
                      >
                        <option value="">Sélectionner une ville...</option>
                        {MOROCCAN_CITIES.map((city) => (
                          <option key={city} value={city}>
                            {city}
                          </option>
                        ))}
                      </select>
                    </InputField>
                    <InputField label="Région" error={errors.region}>
                      <input
                        type="text"
                        value={form.region}
                        onChange={(e) => setField("region", e.target.value)}
                        placeholder="ex: Grand Casablanca"
                        className={inputCls(errors.region)}
                        autoComplete="address-level1"
                      />
                    </InputField>
                  </div>

                  <InputField label="Code postal" error={errors.postalCode}>
                    <input
                      type="text"
                      value={form.postalCode}
                      onChange={(e) => setField("postalCode", e.target.value)}
                      placeholder="ex: 20000"
                      className={`${inputCls(errors.postalCode)} max-w-32`}
                      autoComplete="postal-code"
                      maxLength={5}
                    />
                  </InputField>
                </div>
              </div>

              {/* ── Section 3: Payment Method ── */}
              <div className="bg-white rounded-2xl border border-[#E8E4DF] p-6 shadow-sm">
                <SectionHeader
                  icon={<DollarSign className="w-4 h-4" />}
                  title="Mode de paiement"
                  subtitle="Seul le paiement à la livraison est disponible"
                />
                <div className="flex items-start gap-4 p-4 bg-gradient-to-r from-[#D4A843]/8 to-[#D4A843]/4 border-2 border-[#D4A843]/40 rounded-2xl">
                  <div className="w-10 h-10 rounded-xl bg-[#D4A843]/20 flex items-center justify-center flex-shrink-0">
                    <span className="text-xl">💵</span>
                  </div>
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-1">
                      <h3 className="font-bold text-[#0F0F0F]">Paiement à la livraison</h3>
                      <span className="px-2 py-0.5 bg-green-100 text-green-700 text-xs font-semibold rounded-full">
                        Disponible
                      </span>
                    </div>
                    <p className="text-sm text-[#6B6B6B] leading-relaxed">
                      Payez en cash à la réception de votre commande. Aucun prépaiement requis — 100% sécurisé.
                    </p>
                    <div className="flex items-center gap-1.5 mt-2">
                      <Shield className="w-3.5 h-3.5 text-green-600" />
                      <span className="text-xs text-green-700 font-medium">
                        Garantie retour 14 jours si insatisfait
                      </span>
                    </div>
                  </div>
                  {/* Checked indicator */}
                  <div className="w-5 h-5 rounded-full bg-[#D4A843] flex items-center justify-center flex-shrink-0">
                    <CheckCircle2 className="w-3.5 h-3.5 text-white" />
                  </div>
                </div>
              </div>

              {/* ── Section 4: Notes ── */}
              <div className="bg-white rounded-2xl border border-[#E8E4DF] p-6 shadow-sm">
                <SectionHeader
                  icon={<FileText className="w-4 h-4" />}
                  title="Notes de commande"
                  subtitle="Instructions spéciales pour la livraison"
                />
                <textarea
                  value={form.notes}
                  onChange={(e) => setField("notes", e.target.value)}
                  placeholder="Ex: Livrer après 18h, sonnez au 2ème étage, etc."
                  rows={3}
                  className="w-full px-4 py-3 text-sm border border-[#E8E4DF] rounded-xl bg-[#FBF8F3] text-[#0F0F0F] placeholder:text-[#6B6B6B]/50 focus:outline-none focus:ring-2 focus:ring-[#C8102E]/20 focus:border-[#C8102E]/40 transition-all resize-none"
                />
              </div>

              {/* ── Section 5: Terms + Submit ── */}
              <div className="bg-white rounded-2xl border border-[#E8E4DF] p-6 shadow-sm">
                {/* Terms checkbox */}
                <label
                  className={`flex items-start gap-3 cursor-pointer group mb-6 ${
                    errors.acceptTerms ? "text-red-600" : ""
                  }`}
                  data-error={!!errors.acceptTerms}
                >
                  <div className="relative mt-0.5">
                    <input
                      type="checkbox"
                      checked={form.acceptTerms}
                      onChange={(e) => setField("acceptTerms", e.target.checked)}
                      className="sr-only"
                    />
                    <div
                      className={`w-5 h-5 rounded flex items-center justify-center border-2 transition-all ${
                        form.acceptTerms
                          ? "bg-[#C8102E] border-[#C8102E]"
                          : errors.acceptTerms
                          ? "border-red-400 bg-red-50"
                          : "border-[#E8E4DF] bg-[#FBF8F3] group-hover:border-[#C8102E]/40"
                      }`}
                    >
                      {form.acceptTerms && (
                        <CheckCircle2 className="w-3.5 h-3.5 text-white" />
                      )}
                    </div>
                  </div>
                  <span className={`text-sm leading-relaxed ${errors.acceptTerms ? "text-red-600" : "text-[#6B6B6B]"}`}>
                    J&apos;accepte les{" "}
                    <Link href="/shop/conditions" className="text-[#C8102E] underline hover:no-underline">
                      conditions générales de vente
                    </Link>{" "}
                    et la{" "}
                    <Link href="/shop/confidentialite" className="text-[#C8102E] underline hover:no-underline">
                      politique de confidentialité
                    </Link>{" "}
                    de LEBTEX.
                  </span>
                </label>
                {errors.acceptTerms && (
                  <p className="text-xs text-red-500 -mt-4 mb-4 flex items-center gap-1">
                    <AlertCircle className="w-3 h-3" />
                    {errors.acceptTerms}
                  </p>
                )}

                {/* Submit error */}
                {submitError && (
                  <div className="mb-4 p-4 bg-red-50 border border-red-200 rounded-xl flex items-start gap-3">
                    <AlertCircle className="w-5 h-5 text-red-500 flex-shrink-0 mt-0.5" />
                    <p className="text-sm text-red-700 leading-relaxed">{submitError}</p>
                  </div>
                )}

                {/* Submit button */}
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="w-full py-4 bg-[#C8102E] hover:bg-[#a00d25] disabled:opacity-70 disabled:cursor-not-allowed text-white font-bold rounded-2xl transition-all duration-200 shadow-lg shadow-[#C8102E]/25 hover:shadow-xl hover:shadow-[#C8102E]/35 hover:-translate-y-0.5 disabled:hover:translate-y-0 flex items-center justify-center gap-3 shop-btn-press shop-font-display text-base"
                >
                  {isSubmitting ? (
                    <>
                      <Loader2 className="w-5 h-5 animate-spin" />
                      Validation en cours...
                    </>
                  ) : (
                    <>
                      <CheckCircle2 className="w-5 h-5" />
                      Confirmer ma commande
                      <ChevronRight className="w-4 h-4" />
                    </>
                  )}
                </button>

                <div className="flex items-center justify-center gap-4 mt-4">
                  <Shield className="w-4 h-4 text-[#D4A843]" />
                  <p className="text-xs text-[#6B6B6B] text-center">
                    Commande sécurisée · Paiement à la livraison · Retour facile sous 14 jours
                  </p>
                </div>
              </div>
            </div>

            {/* ── Right: Order Summary (40%) ── */}
            <div className="lg:col-span-2">
              <div className="sticky top-24">
                <SummaryPanel items={items} subtotal={subtotal} city={form.city} />
              </div>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
}
