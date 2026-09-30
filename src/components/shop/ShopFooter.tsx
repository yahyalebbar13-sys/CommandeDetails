"use client";

import React, { useState } from "react";
import Link from "next/link";
import {
  Truck,
  CheckCircle2,
  MessageCircle,
  RotateCcw,
  Mail,
  ArrowRight,
  MapPin,
  Instagram,
  Facebook,
  Phone,
  Heart,
} from "lucide-react";
import {
  formatPrice,
  getWhatsAppContact,
} from "@/lib/shop-utils";
import { delaiZone, FRAIS_ZONE } from "@/lib/livraison-boutique";
import { useShopProducts } from "@/contexts/shop-products-context";
import { useLanguage } from "@/contexts/language-context";
import { texte } from "@/lib/shop-textes";

// ─── Data ─────────────────────────────────────────────────────────────────────

const FOOTER_CATEGORY_COUNT = 9;

const SERVICE_LINKS = [
  { fr: "Contactez-nous", ar: "اتصل بنا", href: "/shop/contact" },
  { fr: "FAQ", ar: "الأسئلة الشائعة", href: "/shop/faq" },
  { fr: "Livraison & Retours", ar: "التوصيل والإرجاع", href: "/shop/livraison" },
  { fr: "Suivi de commande", ar: "تتبع الطلب", href: "/shop/suivi" },
  { fr: "À propos de LEBTEX", ar: "من نحن", href: "/shop/a-propos" },
  { fr: "Service Import", ar: "خدمة الاستيراد", href: "/shop/precommande" },
  { fr: "Promotions en cours", ar: "العروض الحالية", href: "/shop/promotions" },
];

const GUARANTEES: {
  id: string;
  icon: typeof Truck;
  title: { fr: string; ar: string };
  desc: { fr: React.ReactNode; ar: React.ReactNode };
  color: string;
}[] = [
  {
    id: "livraison",
    icon: Truck,
    title: { fr: "Livraison Sendit", ar: "التوصيل عبر Sendit" },
    desc: {
      fr: "Expédition sous 24 h (jours ouvrés), retrait gratuit à Casablanca",
      ar: "الشحن خلال 24 ساعة (أيام العمل)، واستلام مجاني في الدار البيضاء",
    },
    color: "#10B981",
  },
  {
    id: "qualite",
    icon: CheckCircle2,
    title: { fr: "Qualité garantie", ar: "جودة مضمونة" },
    desc: { fr: "Sélection rigoureuse de chaque produit", ar: "نختار كل منتج بعناية" },
    color: "#D4A843",
  },
  {
    id: "whatsapp",
    icon: MessageCircle,
    title: { fr: "Support WhatsApp", ar: "الدعم عبر واتساب" },
    desc: {
      fr: "Lundi–samedi, 8h30–18h30",
      ar: <>من الإثنين إلى السبت، <bdi dir="ltr">8:30 – 18:30</bdi></>,
    },
    color: "#25D366",
  },
  {
    id: "retour",
    icon: RotateCcw,
    title: { fr: "Retour 14 jours", ar: "إرجاع خلال 14 يوماً" },
    desc: {
      fr: "Article non utilisé, hors tissu coupé au mètre",
      ar: "منتج غير مستعمل، ما عدا القماش المقصوص بالمتر",
    },
    color: "#3B82F6",
  },
];

const MOYENS_PAIEMENT = [
  { fr: "💵 Espèces à la réception", ar: "💵 نقداً عند الاستلام" },
  { fr: "🏦 Virement bancaire", ar: "🏦 تحويل بنكي" },
];

// ─── Newsletter form ──────────────────────────────────────────────────────────
function NewsletterForm() {
  const { language } = useLanguage();
  const ar = language === "ar";
  const [email, setEmail] = useState("");
  const [status, setStatus] = useState<"idle" | "success" | "error">("idle");
  const [isLoading, setIsLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.trim() || !email.includes("@")) return;
    setIsLoading(true);
    // Simulate API call
    await new Promise((r) => setTimeout(r, 900));
    setStatus("success");
    setIsLoading(false);
    setEmail("");
  };

  if (status === "success") {
    return (
      <div className="flex items-center gap-3 p-4 rounded-xl bg-green-500/10 border border-green-500/20">
        <CheckCircle2 className="w-5 h-5 text-green-400 flex-shrink-0" />
        <div>
          <p className="text-sm font-semibold text-green-300">
            {ar ? "تم التسجيل بنجاح!" : "Inscription réussie !"}
          </p>
          <p className="text-xs text-green-400/80 mt-0.5">
            {ar ? "ستصلك أفضل عروضنا." : "Vous recevrez nos meilleures offres."}
          </p>
        </div>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-3">
      <div className="relative">
        <Mail className="absolute start-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500 pointer-events-none" />
        <input
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder={ar ? "بريدك الإلكتروني" : "votre@email.com"}
          required
          className="w-full ps-10 pe-4 py-3 text-base rounded-xl border border-white/10 bg-white/5 text-white placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-[#D4A843]/40 focus:border-[#D4A843]/50 transition-all"
        />
      </div>
      <button
        type="submit"
        disabled={isLoading}
        className="flex items-center justify-center gap-2 w-full py-3 px-4 rounded-xl text-sm font-semibold text-white transition-all hover:opacity-90 active:scale-[0.98] disabled:opacity-60 disabled:cursor-not-allowed"
        style={{ backgroundColor: "#C8102E" }}
      >
        {isLoading ? (
          <>
            <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
            {ar ? "جارٍ التسجيل…" : "Inscription…"}
          </>
        ) : (
          <>
            {ar ? "اشترك في العروض" : "S'abonner aux offres"}
            <ArrowRight className="w-4 h-4 rtl:rotate-180" />
          </>
        )}
      </button>
      {status === "error" && (
        <p className="text-xs text-red-400 text-center">
          {ar ? "حدث خطأ، حاول مرة أخرى." : "Erreur. Veuillez réessayer."}
        </p>
      )}
    </form>
  );
}

// ─── Component ────────────────────────────────────────────────────────────────
export default function ShopFooter() {
  const currentYear = new Date().getFullYear();
  const { categories } = useShopProducts();
  const { language } = useLanguage();
  const ar = language === "ar";
  // Mêmes catégories que le menu : celles supprimées dans l'admin n'apparaissent plus
  const boutiqueLinks = [
    ...categories
      .filter((c) => !c.parentSlug)
      .slice(0, FOOTER_CATEGORY_COUNT)
      .map((c) => ({ label: texte(c, "name", language) || c.name, href: `/shop/categorie/${c.slug}`, highlight: false })),
    { label: ar ? "عرض الكل ←" : "Voir tout →", href: "/shop/categories", highlight: true },
  ];

  return (
    <footer
      className="mt-auto"
      style={{ backgroundColor: "#0F0F0F", color: "#E5E7EB" }}
    >
      {/* ── Guarantees strip ──────────────────────────────────────────────────── */}
      <div
        className="border-b"
        style={{ borderColor: "rgba(255,255,255,0.06)" }}
      >
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 lg:gap-6">
            {GUARANTEES.map((g) => {
              const Icon = g.icon;
              return (
                <div
                  key={g.id}
                  className="flex items-start gap-3 p-3 rounded-xl transition-colors hover:bg-white/3"
                >
                  <div
                    className="flex-shrink-0 w-9 h-9 rounded-lg flex items-center justify-center mt-0.5"
                    style={{ backgroundColor: `${g.color}18` }}
                  >
                    <Icon
                      className="w-4.5 h-4.5"
                      style={{ color: g.color, width: "18px", height: "18px" }}
                    />
                  </div>
                  <div>
                    <p className="text-sm font-semibold text-white leading-snug">
                      {g.title[language]}
                    </p>
                    <p
                      className="text-xs mt-0.5 leading-snug"
                      style={{ color: "#9CA3AF" }}
                    >
                      {g.desc[language]}
                    </p>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* ── Main footer body ──────────────────────────────────────────────────── */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-14">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-10 lg:gap-12">
          {/* ── Col 1: Brand ───────────────────────────────────────────────── */}
          <div className="lg:col-span-1">
            {/* Logo */}
            <div className="flex items-center mb-4">
              <span
                className="font-display text-3xl font-black"
                style={{ color: "#FFFFFF" }}
              >
                LEB
              </span>
              <span
                className="font-display text-3xl font-black"
                style={{ color: "#C8102E" }}
              >
                TEX
              </span>
            </div>
            <p
              className="text-sm leading-relaxed mb-5"
              style={{ color: "#9CA3AF" }}
            >
              {ar ? (
                <>
                  متخصصون في خردوات الخياطة بالمغرب 🇲🇦
                  <br />
                  سحابات، أزرار، مطاط، أشرطة — جودة احترافية تصلك إلى كل مدن المغرب.
                </>
              ) : (
                <>
                  Votre spécialiste mercerie au Maroc 🇲🇦
                  <br />
                  Fermetures, boutons, élastiques, rubans — qualité professionnelle
                  livrée partout au Maroc.
                </>
              )}
            </p>

            {/* Contact info */}
            <div className="space-y-2.5">
              <a
                href={getWhatsAppContact()}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-2.5 text-sm group"
              >
                <Phone
                  className="w-4 h-4 flex-shrink-0"
                  style={{ color: "#25D366" }}
                />
                <bdi
                  dir="ltr"
                  className="group-hover:text-white transition-colors"
                  style={{ color: "#9CA3AF" }}
                >
                  +212 760 998 347
                </bdi>
              </a>
              <div className="flex items-center gap-2.5 text-sm">
                <MapPin
                  className="w-4 h-4 flex-shrink-0"
                  style={{ color: "#D4A843" }}
                />
                <span style={{ color: "#9CA3AF" }}>
                  {ar ? "الدار البيضاء، المغرب" : "Casablanca, Maroc"}
                </span>
              </div>
              <div className="flex items-center gap-2.5 text-sm">
                <Mail
                  className="w-4 h-4 flex-shrink-0"
                  style={{ color: "#C8102E" }}
                />
                <a
                  href="mailto:lebtexsarlau@gmail.com"
                  className="text-gray-400 hover:text-[#D4A843] transition-colors"
                >
                  lebtexsarlau@gmail.com
                </a>
              </div>
            </div>

            {/* Social icons */}
            <div className="flex items-center gap-3 mt-6">
              <a
                href={getWhatsAppContact()}
                target="_blank"
                rel="noopener noreferrer"
                className="w-9 h-9 rounded-xl flex items-center justify-center border border-white/10 text-gray-400 hover:text-white hover:border-[#25D366] hover:bg-[#25D366]/10 transition-all"
                aria-label="WhatsApp"
              >
                <Phone className="w-4 h-4" />
              </a>
              <a
                href="https://instagram.com/lebtex.ma"
                target="_blank"
                rel="noopener noreferrer"
                className="w-9 h-9 rounded-xl flex items-center justify-center border border-white/10 text-gray-400 hover:text-white hover:border-pink-500 hover:bg-pink-500/10 transition-all"
                aria-label="Instagram"
              >
                <Instagram className="w-4 h-4" />
              </a>
              <a
                href="https://facebook.com/lebtex.ma"
                target="_blank"
                rel="noopener noreferrer"
                className="w-9 h-9 rounded-xl flex items-center justify-center border border-white/10 text-gray-400 hover:text-white hover:border-blue-500 hover:bg-blue-500/10 transition-all"
                aria-label="Facebook"
              >
                <Facebook className="w-4 h-4" />
              </a>
            </div>
          </div>

          {/* ── Col 2: Boutique ────────────────────────────────────────────── */}
          <div>
            <h3
              className="text-sm font-bold uppercase tracking-widest mb-5 flex items-center gap-2"
              style={{ color: "#D4A843" }}
            >
              <span
                className="w-4 h-0.5 rounded-full"
                style={{ backgroundColor: "#D4A843" }}
              />
              {ar ? "المتجر" : "Boutique"}
            </h3>
            <ul className="space-y-2.5">
              {boutiqueLinks.map((link) => (
                <li key={link.href}>
                  <Link
                    href={link.href}
                    className={`text-sm transition-colors flex items-center gap-1 group ${
                      link.highlight
                        ? "font-semibold"
                        : "hover:text-white"
                    }`}
                    style={{
                      color: link.highlight ? "#C8102E" : "#9CA3AF",
                    }}
                  >
                    {link.highlight ? (
                      <>
                        {link.label}
                      </>
                    ) : (
                      <>
                        <span className="w-1 h-1 rounded-full bg-gray-600 group-hover:bg-[#C8102E] transition-colors flex-shrink-0" />
                        {link.label}
                      </>
                    )}
                  </Link>
                </li>
              ))}
            </ul>
          </div>

          {/* ── Col 3: Service client ──────────────────────────────────────── */}
          <div>
            <h3
              className="text-sm font-bold uppercase tracking-widest mb-5 flex items-center gap-2"
              style={{ color: "#D4A843" }}
            >
              <span
                className="w-4 h-0.5 rounded-full"
                style={{ backgroundColor: "#D4A843" }}
              />
              {ar ? "خدمة الزبائن" : "Service client"}
            </h3>
            <ul className="space-y-2.5">
              {SERVICE_LINKS.map((link) => (
                <li key={link.href}>
                  <Link
                    href={link.href}
                    className="text-sm hover:text-white transition-colors flex items-center gap-1 group"
                    style={{ color: "#9CA3AF" }}
                  >
                    <span className="w-1 h-1 rounded-full bg-gray-600 group-hover:bg-[#C8102E] transition-colors flex-shrink-0" />
                    {link[language]}
                  </Link>
                </li>
              ))}
            </ul>

            {/* Shipping badge */}
            <div
              className="mt-6 p-3 rounded-xl border"
              style={{
                borderColor: "rgba(212,168,67,0.2)",
                backgroundColor: "rgba(212,168,67,0.06)",
              }}
            >
              <div className="flex items-center gap-2 mb-1">
                <Truck
                  className="w-3.5 h-3.5"
                  style={{ color: "#D4A843" }}
                />
                <span
                  className="text-xs font-semibold"
                  style={{ color: "#D4A843" }}
                >
                  {ar ? "التوصيل لجميع أنحاء المغرب" : "Livraison partout au Maroc"}
                </span>
              </div>
              <p className="text-xs" style={{ color: "#9CA3AF" }}>
                {ar ? (
                  <>
                    الدار البيضاء <bdi dir="ltr">{formatPrice(FRAIS_ZONE.casablanca)}</bdi> خلال {delaiZone("casablanca", language)}،
                    وباقي المدن ابتداءً من <bdi dir="ltr">{formatPrice(FRAIS_ZONE.standard)}</bdi>. الاستلام مجاني في الدار البيضاء.
                  </>
                ) : (
                  <>
                    Casablanca {formatPrice(FRAIS_ZONE.casablanca)} en {delaiZone("casablanca", language)}, autres villes
                    dès {formatPrice(FRAIS_ZONE.standard)}. Retrait gratuit à Casablanca.
                  </>
                )}
              </p>
            </div>
          </div>

          {/* ── Col 4: Newsletter ──────────────────────────────────────────── */}
          <div>
            <h3
              className="text-sm font-bold uppercase tracking-widest mb-5 flex items-center gap-2"
              style={{ color: "#D4A843" }}
            >
              <span
                className="w-4 h-0.5 rounded-full"
                style={{ backgroundColor: "#D4A843" }}
              />
              {ar ? "عروض حصرية" : "Offres exclusives"}
            </h3>
            <p className="text-sm mb-4" style={{ color: "#9CA3AF" }}>
              {ar
                ? "اشترك لتصلك أفضل التخفيضات والمنتجات الجديدة وأكواد الخصم قبل الجميع."
                : "Abonnez-vous pour recevoir nos meilleures promotions, nouveautés et codes de réduction en avant-première."}
            </p>
            <NewsletterForm />

            {/* Trust badges */}
            <div className="mt-5 space-y-2">
              <div className="flex items-center gap-2 text-xs" style={{ color: "#9CA3AF" }}>
                <CheckCircle2 className="w-3.5 h-3.5 text-green-500 flex-shrink-0" />
                {ar ? "بدون رسائل مزعجة — إلغاء الاشتراك بنقرة واحدة" : "Pas de spam — désinscription en 1 clic"}
              </div>
              <div className="flex items-center gap-2 text-xs" style={{ color: "#9CA3AF" }}>
                <CheckCircle2 className="w-3.5 h-3.5 text-green-500 flex-shrink-0" />
                {ar ? "بياناتك محمية" : "Vos données sont protégées"}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* ── Divider ───────────────────────────────────────────────────────────── */}
      <div
        className="border-t"
        style={{ borderColor: "rgba(255,255,255,0.06)" }}
      />

      {/* ── Bottom bar ───────────────────────────────────────────────────────── */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-5">
        <div className="flex flex-col sm:flex-row items-center justify-between gap-3">
          {/* Copyright */}
          <div className="flex items-center gap-1.5 text-xs" style={{ color: "#9CA3AF" }}>
            <span>
              <bdi dir="ltr">© {currentYear} LEBTEX</bdi>. {ar ? "صُنع بـ" : "Fait avec"}
            </span>
            <Heart
              className="w-3 h-3"
              style={{ color: "#C8102E", fill: "#C8102E" }}
            />
            <span>{ar ? "في المغرب 🇲🇦" : "au Maroc 🇲🇦"}</span>
          </div>

          {/* Payment methods */}
          <div className="flex flex-wrap items-center justify-center gap-2">
            <span className="text-xs" style={{ color: "#9CA3AF" }}>
              {ar ? "طرق الدفع:" : "Paiement accepté :"}
            </span>
            {MOYENS_PAIEMENT.map((moyen) => (
              <div
                key={moyen.fr}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-xs font-semibold"
                style={{
                  borderColor: "rgba(255,255,255,0.1)",
                  backgroundColor: "rgba(255,255,255,0.04)",
                  color: "#D1D5DB",
                }}
              >
                {moyen[language]}
              </div>
            ))}
          </div>

          {/* Legal links */}
          <div className="flex items-center gap-1 text-xs" style={{ color: "#9CA3AF" }}>
            <Link
              href="/shop/confidentialite"
              className="inline-flex items-center min-h-[44px] px-2 hover:text-white transition-colors"
            >
              {ar ? "الخصوصية" : "Confidentialité"}
            </Link>
            <span aria-hidden="true">·</span>
            <Link
              href="/shop/conditions"
              className="inline-flex items-center min-h-[44px] px-2 hover:text-white transition-colors"
            >
              {ar ? "شروط البيع" : "Conditions de vente"}
            </Link>
          </div>
        </div>
      </div>
    </footer>
  );
}
